"""analysis/races_duplicates.py on small made-up editions: each rule, each kind, the thresholds at their edge, and that
no name leaves the audit."""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import races_common as rc  # noqa: E402
import races_duplicates as rd  # noqa: E402


def clock(seconds):
    return f'{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}'


def people(prefix, n):
    """n made-up names no other pool shares."""
    return [f'{prefix}given{i} {prefix}Surname{i}' for i in range(n)]


def other_form(name):
    """The same name as another platform writes it: surname first, capitals, an accent and a comma."""
    given, surname = name.split(' ')
    return f'{surname.upper().replace("U", "Ü", 1)},  {given.capitalize()}'


def fixture():
    """(city, year, name, finish string) rows. Every scenario has its own names and its own stretch of the clock."""
    rows = []
    add = lambda city, year, names, times: rows.extend((city, year, n, t if isinstance(t, str) or t is None else clock(t)) for n, t in zip(names, times))  # noqa: E731
    # 1. The same list under two years of one race, the names written differently.
    alpha = people('al', 40)
    add('Alpha', 2019, alpha, [10800 + 37 * i for i in range(40)])
    add('Alpha', 2020, [other_form(n) for n in alpha], [10800 + 37 * i for i in range(40)])
    # 2. One race of one year under two keys, every finish 150 s later in the second (five more rows there).
    beta = people('be', 40)
    add('Beta', 2019, beta, [12000 + 41 * i for i in range(40)])
    add('Beta Twin', 2019, beta + people('bx', 5), [12150 + 41 * i for i in range(40)] + [20000 + 53 * i for i in range(5)])
    # 3. A list inside a longer list of the same year, 20 s apart.
    gamma = people('ga', 30)
    add('Gamma', 2018, gamma, [9000 + 43 * i for i in range(30)])
    add('Gamma Festival', 2018, gamma + people('gx', 170), [9020 + 43 * i for i in range(30)] + [15000 + 47 * i for i in range(170)])
    # 4. The same finish times under two years of one race, no name in common.
    add('Delta', 2018, people('da', 30), [13000 + 59 * i for i in range(30)])
    add('Delta', 2021, people('db', 30), [13000 + 59 * i for i in range(30)])
    # 5. A small edition that shares one key of four with a larger one of another race and year.
    epsilon = people('ep', 60)
    add('Epsilon', 2017, epsilon, [16000 + 61 * i for i in range(60)])
    add('Zeta', 2014, [epsilon[7]] + people('ze', 3), [16000 + 61 * 7, 30001, 30113, 30227])
    # 6. The fifth of the smaller edition, at its edge: 2 of 10 is listed, 2 of 11 is not.
    theta = people('th', 20)
    add('Theta', 2015, theta, [17000 + 67 * i for i in range(20)])
    add('Eta', 2016, theta[:2] + people('et', 8), [17000, 17067] + [31000 + 71 * i for i in range(8)])
    add('Iota', 2013, theta[2:4] + people('io', 9), [17134, 17201] + [32000 + 73 * i for i in range(9)])
    # 7. Part of a list inside another, 90 s apart: 60 of 100 names in common are aligned (listed); 45 of 100 are not.
    kappa, mu = people('ka', 400), people('mu', 400)
    add('Kappa', 2012, kappa, [8000 + 29 * i for i in range(400)])
    add('Lambda', 2011, kappa[:60] + kappa[60:100] + people('la', 400),
        [8090 + 29 * i for i in range(60)] + [8000 + 29 * i + 600 * (i - 59) for i in range(60, 100)] + [20000 + 31 * i for i in range(400)])
    add('Mu', 2010, mu, [8000 + 29 * i for i in range(400)])
    add('Nu', 2009, mu[:45] + mu[45:100] + people('nu', 400),
        [8090 + 29 * i for i in range(45)] + [8000 + 29 * i + 600 * (i - 44) for i in range(45, 100)] + [20000 + 31 * i for i in range(400)])
    # Rows without a key, and a key repeated inside its edition (one key, and no single name).
    add('Epsilon', 2017, ['', None, '?!', 'Epunparsed Finish', 'Eprepeated Key', 'KEY, Eprepeated'], ['4:00:00', '4:00:01', '4:00:02', 'DNF', '5:00:00', '5:00:00.4'])
    return rows


def write_records(path, rows):
    db = duckdb.connect()
    db.execute('CREATE TABLE fixture (id BIGINT, city VARCHAR, year BIGINT, runner VARCHAR, split_42_2km VARCHAR)')
    db.executemany('INSERT INTO fixture VALUES (?, ?, ?, ?, ?)', [[i + 1, *row] for i, row in enumerate(rows)])
    db.execute(f"COPY fixture TO '{rc.quote(path)}' (FORMAT PARQUET)")
    db.close()


class Rules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.rows = fixture()
        cls.records = Path(cls.tmp.name) / 'race_records.parquet'
        write_records(cls.records, cls.rows)
        cls.result = rd.scan(rc.connect(), cls.records, log=lambda *_: None)
        cls.pairs = {(p['a']['city'], p['a']['year'], p['b']['city'], p['b']['year']): p for p in cls.result['pairs']}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_listed_pairs_are_exactly_the_made_up_duplicates(self):
        self.assertEqual({key: (p['rules'], p['kind']) for key, p in self.pairs.items()}, {
            ('Alpha', 2019, 'Alpha', 2020): (['exact', 'near', 'time_only'], 'same_list_twice'),
            ('Beta', 2019, 'Beta Twin', 2019): (['near'], 'one_race_two_keys'),
            ('Gamma', 2018, 'Gamma Festival', 2018): (['near'], 'combined_list'),
            ('Delta', 2018, 'Delta', 2021): (['time_only'], 'same_list_twice'),
            ('Epsilon', 2017, 'Zeta', 2014): (['exact'], 'partial_overlap'),
            ('Eta', 2016, 'Theta', 2015): (['exact'], 'partial_overlap'),
            ('Kappa', 2012, 'Lambda', 2011): (['near'], 'partial_overlap'),
        })

    def test_exact_counts_distinct_keys_whatever_the_form_of_the_name(self):
        pair = self.pairs[('Alpha', 2019, 'Alpha', 2020)]
        self.assertEqual((pair['exact']['shared'], pair['a']['keys'], pair['b']['keys'], pair['matched'], pair['share_of_a']), (40, 40, 40, 40, 1.0))
        self.assertEqual(pair['near'], {'names_in_common': 40, 'aligned': 40, 'window_seconds': [0, 120], 'finish_differences': {
            'names': 40, 'identical': 40, 'median_seconds': 0.0, 'tenth_percentile_seconds': 0.0, 'ninetieth_percentile_seconds': 0.0}})
        self.assertEqual(pair['time_only'], {'matched': 40, 'matched_shifted_plus': 0, 'matched_shifted_minus': 0, 'excess': 40.0})

    def test_near_sees_a_list_whose_times_are_all_shifted(self):
        pair = self.pairs[('Beta', 2019, 'Beta Twin', 2019)]
        self.assertEqual(pair['exact']['shared'], 0)
        self.assertEqual((pair['near']['names_in_common'], pair['near']['aligned'], pair['near']['window_seconds']), (40, 40, [-180, -60]))
        self.assertEqual(pair['near']['finish_differences']['median_seconds'], -150.0)
        self.assertEqual((pair['share_of_a'], pair['share_of_b'], pair['relation']), (1.0, round(40 / 45, 4), 'two races, one year'))
        inside = self.pairs[('Gamma', 2018, 'Gamma Festival', 2018)]
        self.assertEqual((inside['near']['aligned'], inside['share_of_a'], inside['share_of_b']), (30, 1.0, 0.15))

    def test_a_part_of_a_list_is_listed_by_half_of_the_names_in_common_and_fifty_names(self):
        pair = self.pairs[('Kappa', 2012, 'Lambda', 2011)]
        self.assertEqual((pair['near']['names_in_common'], pair['near']['aligned'], pair['a']['single_names'], pair['b']['single_names']), (100, 60, 400, 500))
        self.assertNotIn(('Mu', 2010, 'Nu', 2009), self.pairs)   # 45 aligned names: under 50, and under a fifth of 400
        shown = [p for p in self.result['closest_unlisted']['near_by_share_of_the_smaller'] if p['a']['city'] == 'Mu']
        self.assertEqual([(p['near']['names_in_common'], p['near']['aligned'], p['rules']) for p in shown], [(100, 45, [])])

    def test_time_only_needs_no_name(self):
        pair = self.pairs[('Delta', 2018, 'Delta', 2021)]
        self.assertEqual((pair['exact']['shared'], pair['near']['names_in_common'], pair['time_only']['excess'], pair['matched']), (0, 0, 30.0, 30.0))

    def test_the_fifth_of_the_smaller_edition_at_its_edge(self):
        self.assertEqual(self.pairs[('Eta', 2016, 'Theta', 2015)]['exact']['shared'], 2)     # 2 of 10
        self.assertNotIn(('Iota', 2013, 'Theta', 2015), self.pairs)                          # 2 of 11
        self.assertEqual(self.pairs[('Epsilon', 2017, 'Zeta', 2014)]['share_of_b'], 0.25)   # 1 of 4, as the rule is worded

    def test_the_counts_close_on_the_rows(self):
        u = self.result['counts']['universe']
        self.assertEqual(u['rows'], len(self.rows))
        self.assertEqual((u['rows_without_a_name'], u['rows_without_a_finish']), (3, 1))
        self.assertEqual(u['rows_with_a_key'], len(self.rows) - 4)
        self.assertEqual((u['keys_repeated_inside_an_edition'], u['rows_on_a_key_repeated_inside_an_edition']), (1, 2))
        self.assertEqual(u['keys'], u['rows_with_a_key'] - 1)
        self.assertEqual(u['single_names'], u['keys'] - 1)
        self.assertEqual(u['editions'], len({(c, y) for c, y, _, _ in self.rows}))
        self.assertEqual(self.result['counts']['exact']['listed'], 3)

    def test_no_name_leaves_the_audit(self):
        text = json.dumps(self.result).lower()
        for _, _, name, _ in self.rows:
            for word in re.findall(r'[a-z]+[0-9]+', (name or '').lower()):
                self.assertNotIn(word, text)
        self.assertNotIn('eprepeated', text)


class NameRule(unittest.TestCase):
    CASES = ['Zoë  van der Merwe', 'VAN DER MERWE, Zoe', 'Łukasz Ørsted-Þórsson', 'Müller Straße', 'IŞIK ışık', 'Æsop Œuvre', 'Đorđe Ðuro', "O'Neil-Smith Jr.",
             '李 小龍', 'Иван Петров', '  ', '?!', 'José María 3rd', 'ǅon Ǆ', 'A_B c', 'ΣΟΦΟΣ']

    def test_sql_and_python_agree(self):
        db = rc.connect()
        for macro in rd.NAME_MACROS:
            db.execute(macro)
        for name in self.CASES:
            self.assertEqual(db.execute("SELECT coalesce(name_key(?), '')", [name]).fetchone()[0], rd.name_key(name), name)   # as scan() reads it
        self.assertEqual(rd.name_key(None), '')

    def test_the_rule_in_examples(self):
        self.assertEqual(rd.name_key('VAN DER MERWE, Zoë'), 'der merwe van zoe')
        self.assertEqual(rd.name_key('Zoe van der Merwe'), 'der merwe van zoe')
        self.assertEqual(rd.name_key('Łukasz Ørsted-Þórsson'), 'lukasz orsted thorsson')
        self.assertEqual(rd.name_key('Müller Straße'), 'muller strasse')
        self.assertEqual(rd.name_key('?!'), '')
        self.assertEqual(rd.name_key('李 小龍'), '小龍 李')


class Kinds(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(rd.kind_of(True, False, 0.8, 0.3), 'same_list_twice')
        self.assertEqual(rd.kind_of(True, False, 0.79, 0.3), 'partial_overlap')
        self.assertEqual(rd.kind_of(False, True, 0.9, 0.8), 'one_race_two_keys')
        self.assertEqual(rd.kind_of(False, True, 0.9, 0.5), 'combined_list')
        self.assertEqual(rd.kind_of(False, True, 0.5, 0.5), 'partial_overlap')
        self.assertEqual(rd.kind_of(False, False, 0.2, 1.0), 'same_list_under_another_race')
        self.assertEqual(rd.kind_of(False, False, 0.2, 0.25), 'partial_overlap')
        self.assertEqual(set(rd.KIND_WORDS), {'same_list_twice', 'one_race_two_keys', 'combined_list', 'same_list_under_another_race', 'partial_overlap'})


class ClockParser(unittest.TestCase):
    def test_the_seconds_macro_is_the_pacing_pipelines(self):
        squeeze = lambda text: re.sub(r'\s+', ' ', text).strip()  # noqa: E731
        source = (rc.ANALYSIS / 'build_pacing.py').read_text()
        theirs = re.search(r'CREATE MACRO seconds\(s\) AS \(.*?ELSE NULL END\)', source, re.S).group(0)
        self.assertEqual(squeeze(rc.SECONDS_MACRO), squeeze(theirs))

    def test_finish_seconds(self):
        db = rc.connect()
        read = lambda text: db.execute('SELECT CAST(floor(seconds(?)) AS INTEGER)', [text]).fetchone()[0]  # noqa: E731
        self.assertEqual([read(t) for t in ('3:00:00', ' 3:00:00.9 ', '59:59', '3:60:00', 'DNF', '', None)], [10800, 10800, 3599, None, None, None, None])


class Audit(unittest.TestCase):
    """The evidence document on a small adapted folder (the real release pin and the real frozen policy)."""

    def test_the_document(self):
        release = json.loads(rc.RELEASE_PATH.read_text())
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'full'
            source.mkdir()
            write_records(source / 'race_records.parquet', fixture())
            db = duckdb.connect()
            db.execute(f"""COPY (SELECT DISTINCT city, year, 'unverified' AS verification_tier, 'finish_time_only' AS split_tier
                FROM read_parquet('{rc.quote(source / 'race_records.parquet')}')) TO '{rc.quote(source / 'edition_meta.parquet')}' (FORMAT PARQUET)""")
            db.execute(f"""COPY (SELECT DISTINCT city, year, 'Somewhere: ' || city AS release_city
                FROM read_parquet('{rc.quote(source / 'race_records.parquet')}')) TO '{rc.quote(source / 'release_keys.parquet')}' (FORMAT PARQUET)""")
            db.close()
            manifest = {'created_at': '2099-01-01T00:00:00Z', 'files': {name: {'sha256': rc.file_sha256(source / name)} for name in rd.MEMBERS}}
            (source / 'MANIFEST.json').write_text(json.dumps(manifest))
            (source / 'provenance.json').write_text(json.dumps({'release_tag': release['tag'], 'manifest_sha256': rc.file_sha256(source / 'MANIFEST.json')}))
            document = rd.audit(source, work=Path(tmp), log=lambda *_: None)
            self.assertEqual(document['release_tag'], release['tag'])
            self.assertEqual(document['input_manifest_sha256'], rc.file_sha256(source / 'MANIFEST.json'))
            self.assertEqual(sorted(document['scripts']), ['analysis/races_common.py', 'analysis/races_duplicates.py'])
            self.assertEqual(len(document['pairs']), 7)
            first = document['pairs'][0]
            self.assertEqual((first['a']['city'], first['a']['tier'], first['a']['split_tier'], first['a']['release_key']), ('Alpha', 'unverified', 'finish_time_only', 'Somewhere: Alpha'))
            self.assertEqual([p['a']['city'] for p in document['pairs']], sorted(p['a']['city'] for p in document['pairs']))
            self.assertEqual(list(Path(tmp).glob('races-duplicates-*')), [])   # the temporary database is removed
            # A member that is not the one the manifest lists stops the audit; so does an input of another release.
            (source / 'provenance.json').write_text(json.dumps({'release_tag': 'another-release', 'manifest_sha256': rc.file_sha256(source / 'MANIFEST.json')}))
            with self.assertRaises(rc.RacesError):
                rd.audit(source, work=Path(tmp), log=lambda *_: None)
            (source / 'provenance.json').write_text(json.dumps({'release_tag': release['tag'], 'manifest_sha256': rc.file_sha256(source / 'MANIFEST.json')}))
            write_records(source / 'race_records.parquet', fixture()[:-1])
            with self.assertRaises(rc.RacesError):
                rd.audit(source, work=Path(tmp), log=lambda *_: None)


if __name__ == '__main__':
    unittest.main()
