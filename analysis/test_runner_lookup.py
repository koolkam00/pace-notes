"""Runner lookup v2 (analysis/build_runner_lookup.py, lookup_format.py, lookup_names.py, lookup_races.py): the name
rules, the leaf cutter, and a whole build of a small made-up release read back from its files. Every name here is
invented. The same fixture is verified by scripts/verify-lookup.cjs (test_runner_lookup_verifier.py)."""
import contextlib
import hashlib
import io
import json
import signal
import sys
import tempfile
import unittest
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_runner_lookup as builder  # noqa: E402
import lookup_format as fmt  # noqa: E402
import lookup_names as names  # noqa: E402
import lookup_races  # noqa: E402

TAG = 'pace-notes-marathon-half-20990101-0000'
RULES = {'target_rows': 6, 'max_rows': 8, 'min_rows': 2, 'heavy_over': 4, 'order': 'code point'}
SPLITS = ['split_5km', 'split_10km', 'split_15km', 'split_20km', 'split_21_1km', 'split_25km', 'split_30km', 'split_35km', 'split_40km', 'split_42_2km']
P = 'p51_%016x'


def clock(seconds):
    return f'{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}'


def marathon_times(pace=300, missing=()):
    """Eight checkpoints and a finish at an even pace in seconds per km."""
    values = {5: 5, 10: 10, 15: 15, 20: 20, 25: 25, 30: 30, 35: 35, 40: 40}
    row = {f'split_{km}km': None if km in missing else clock(km * pace) for km in values}
    row['split_42_2km'] = row['finish_time'] = clock(round(42.195 * pace))
    return row


def half_times(finish, checkpoints=None):
    row = {f'split_{km}km': value if isinstance(value, str) else clock(value) for km, value in (checkpoints or {}).items()}
    row['split_21_1km'] = row['finish_time'] = finish if isinstance(finish, str) else clock(finish)
    return row


class Release:
    """A small release in the combined layout, with the pipeline's two files, written into one folder."""

    def __init__(self, root):
        self.root = Path(root)
        self.records, self.links, self.qa, self.pending, self.status, self.identity = [], [], [], [], [], []
        self.tiers, self.meta = {}, {}
        self.labels = {'Smallville, XX: Smallville Marathon 2020': 'Smallville Marathon'}      # release key to registry label

    def edition(self, distance, source_db, city, year, tier='stamped', split='splits', timing='chip'):
        self.tiers[(distance, source_db, city, year)] = (tier, split)
        self.meta[(distance, source_db, city, year)] = timing

    def add(self, distance, source_db, record_id, city, year, runner, times, sex='M', age=None, person=None, tier=None, key=True,
            status=('counted', None), unlinked_reason=None, qa=None, pending=None, short=False, sex_from_category=None):
        self.records.append({'distance': distance, 'source_db': source_db, 'id': record_id, 'race': city + ' race', 'year': year, 'city': city,
                             'runner': runner, 'sex': sex, 'age': age, **{column: times.get(column) for column in SPLITS},
                             'finish_time': times.get('finish_time')})
        person_id = None if person is None else P % person
        self.links.append({'person_id': person_id, 'confidence': tier if person is not None else None, 'unlinked_reason': unlinked_reason,
                           'source_db': source_db, 'record_id': record_id, 'course_shortened_suspect': short})
        left_out = bool(pending) or any(flag in builder.MARATHON_LEFT_OUT['qa_row_flags'] for flag in (qa or ()))
        if distance == 'marathon' and not left_out:
            self.status.append({'record_id': record_id, 'status': status[0], 'reason': status[1], 'city': self.labels.get(city, city), 'year': year})
        self.identity.append({'source_db': source_db, 'record_id': record_id,
                              'runner_key': person_id if key and tier in ('high_elite', 'high', 'medium') and not left_out else None, 'link_tier': tier if person is not None else None})
        if qa or sex_from_category:
            self.qa.append({'distance': distance, 'source_db': source_db, 'record_id': record_id, 'flags': list(qa or ()), 'sex_from_category': sex_from_category})
        for flag in pending or ():
            self.pending.append({'distance': distance, 'source_db': source_db, 'record_id': record_id, 'flag': flag})

    def write(self, registry, policy, half_expected, placeholders, gun=(), short=()):
        core = self.root / 'core'
        core.mkdir(parents=True)
        db = duckdb.connect()
        text = ', '.join(f'{column} VARCHAR' for column in SPLITS + ['finish_time'])
        db.execute(f'CREATE TABLE r (distance VARCHAR, source_db VARCHAR, id BIGINT, race VARCHAR, year BIGINT, city VARCHAR, runner VARCHAR, sex VARCHAR, age DOUBLE, {text})')
        db.executemany('INSERT INTO r VALUES (' + ', '.join('?' * (9 + len(SPLITS) + 1)) + ')', [
            [row[c] for c in ['distance', 'source_db', 'id', 'race', 'year', 'city', 'runner', 'sex', 'age'] + SPLITS + ['finish_time']] for row in self.records])
        db.execute(f"COPY r TO '{core / 'race_records.parquet'}' (FORMAT PARQUET)")
        flags = ['split_nonmonotonic', 'split_after_finish', 'finish_equals_earlier_split', 'finish_ge_24h', 'finish_zero', 'finish_implausibly_fast',
                 'finish_faster_than_world_record', 'no_finish_time', 'age_implausible', 'finish_6h_to_24h']
        db.execute('CREATE TABLE q (distance VARCHAR, source_db VARCHAR, record_id BIGINT, ' + ', '.join(f'{f} BOOLEAN' for f in flags) + ', sex_from_category VARCHAR)')
        for row in self.qa:
            db.execute('INSERT INTO q VALUES (' + ', '.join('?' * (4 + len(flags))) + ')',
                       [row['distance'], row['source_db'], row['record_id']] + [f in row['flags'] for f in flags] + [row['sex_from_category']])
        db.execute(f"COPY q TO '{core / 'qa_row_flags.parquet'}' (FORMAT PARQUET)")
        db.execute('CREATE TABLE p (distance VARCHAR, source_db VARCHAR, record_id BIGINT, flag VARCHAR, present_in_core BOOLEAN)')
        for row in self.pending:
            db.execute('INSERT INTO p VALUES (?, ?, ?, ?, true)', [row['distance'], row['source_db'], row['record_id'], row['flag']])
        db.execute(f"COPY p TO '{core / 'pending_review_flags.parquet'}' (FORMAT PARQUET)")
        db.execute('CREATE TABLE m (distance VARCHAR, source_db VARCHAR, city VARCHAR, year BIGINT, timing_basis VARCHAR)')
        for (distance, source_db, city, year), timing in self.meta.items():
            db.execute('INSERT INTO m VALUES (?, ?, ?, ?, ?)', [distance, source_db, city, year, timing])
        db.execute(f"COPY m TO '{core / 'edition_meta.parquet'}' (FORMAT PARQUET)")
        lines = ['distance,source_db,city,year,verification_tier,split_tier']
        for (distance, source_db, city, year), (tier, split) in self.tiers.items():
            lines.append(f'{distance},{source_db},"{city}",{year},{tier},{split}')
        (core / 'EDITION-TIERS.csv').write_text('\n'.join(lines) + '\n')
        (core / 'MANIFEST.json').write_text(json.dumps({'created_at': '2099-01-01T00:00:00Z', 'tag': TAG}))
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        (core / 'SHA256SUMS.txt').write_text(''.join(f'{digest(core / name)}  {name}\n' for name in builder.CORE_FILES))
        db.execute('CREATE TABLE l (person_id VARCHAR, confidence VARCHAR, unlinked_reason VARCHAR, source_db VARCHAR, record_id BIGINT, course_shortened_suspect BOOLEAN)')
        db.executemany('INSERT INTO l VALUES (?, ?, ?, ?, ?, ?)', [[row[c] for c in ['person_id', 'confidence', 'unlinked_reason', 'source_db', 'record_id', 'course_shortened_suspect']] for row in self.links])
        self.links_path = self.root / 'person-ids-v9-race_results_linked.parquet'
        db.execute(f"COPY l TO '{self.links_path}' (FORMAT PARQUET)")
        db.execute('CREATE TABLE s (record_id BIGINT, city VARCHAR, year BIGINT, status VARCHAR, reason VARCHAR)')
        db.executemany('INSERT INTO s VALUES (?, ?, ?, ?, ?)', [[row['record_id'], row['city'], row['year'], row['status'], row['reason']] for row in self.status])
        self.status_path = self.root / 'record-status.parquet'
        db.execute(f"COPY s TO '{self.status_path}' (FORMAT PARQUET)")
        db.execute('CREATE TABLE i (source_db VARCHAR, record_id BIGINT, runner_key VARCHAR, link_tier VARCHAR)')
        db.executemany('INSERT INTO i VALUES (?, ?, ?, ?)', [[row[c] for c in ['source_db', 'record_id', 'runner_key', 'link_tier']] for row in self.identity])
        self.identity_path = self.root / 'identity.parquet'
        db.execute(f"COPY i TO '{self.identity_path}' (FORMAT PARQUET)")
        db.close()
        self.core = core
        self.pin_path = self.root / 'release.json'
        self.pin_path.write_text(json.dumps({
            'tag': TAG, 'layout': 'combined', 'core': {'sha256sums_sha256': digest(core / 'SHA256SUMS.txt'), 'manifest_sha256': digest(core / 'MANIFEST.json')},
            'assets': {'EDITION-TIERS.csv': digest(core / 'EDITION-TIERS.csv'), self.links_path.name: digest(self.links_path)}}))
        self.registry_path = self.root / 'race-registry.json'
        self.registry_path.write_text(json.dumps({'tag': TAG, 'distance': 'marathon', 'races': registry}))
        self.policy_path = self.root / 'edition-policy.json'
        self.policy_path.write_text(json.dumps({'release_tag': TAG, 'columns': ['city', 'year', 'category', 'reason', 'own_record'],
                                                'reasons': sorted({row['reason'] for row in policy}),
                                                'editions': [[row['city'], row['year'], row['category'], sorted({r['reason'] for r in policy}).index(row['reason']),
                                                              row.get('own_record', False)] for row in policy]}))
        self.half_path = self.root / 'lookup-half-records.json'
        rule = json.loads(builder.HALF_RECORDS_PATH.read_text())
        rule.update(tag=TAG, expected=half_expected)
        rule['no_comparison']['gun_times']['editions'] = [list(e) for e in gun]
        rule['no_comparison']['course_suspected_short']['editions'] = [list(e) for e in short]
        self.half_path.write_text(json.dumps(rule))
        self.placeholders_path = self.root / 'lookup-placeholders.json'
        self.placeholders_path.write_text(json.dumps({'tag': TAG, 'names': placeholders}))

    def write_cohort(self, name='cohort', change=None):
        """A cohort manifest in the shape of analysis/marathon-cohort/manifest.json, for the status rows of this release."""
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        raw, used = {}, set()
        for row in self.status:
            key = (row['city'], row['year'])
            raw[key] = raw.get(key, 0) + 1
            if row['status'] in ('counted', 'own_record'):
                used.add(key)
        document = {
            'schema_version': 1, 'release_tag': TAG, 'input_as_of': '2099-01-01T00:00:00Z', 'as_of': '2099-01-01T12:00:00Z',
            'inputs': {'record_status': {'sha256': digest(self.status_path)}, 'identity': {'sha256': digest(self.identity_path)}},
            'raw_records': len(self.status), 'eligible_records': sum(row['status'] == 'counted' for row in self.status),
            'own_record_records': sum(row['status'] == 'own_record' for row in self.status),
            'editions': [{'city': city, 'year': year, 'use': 'counted', 'raw': raw[(city, year)]} for city, year in sorted(used)],
            'other_editions': {'columns': ['city', 'year', 'raw', 'category'],
                               'rows': [[city, year, n, 'finish_time_only'] for (city, year), n in sorted(raw.items()) if (city, year) not in used]},
        }
        if change:
            change(document)
        path = self.root / name / 'manifest.json'
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(document))
        return path

    def build(self, output, **overrides):
        options = dict(pin_path=self.pin_path, registry_path=self.registry_path, policy_path=self.policy_path, half_records_path=self.half_path,
                       placeholders_path=self.placeholders_path, as_of='2099-01-02T00:00:00Z', index_rules=RULES, memory='1GB')
        options.update(overrides)
        return builder.build(self.core, self.links_path, self.status_path, self.identity_path, output, **options)


def small_release(root):
    """Two marathon races and three half races; the rows each test names are numbered below 100, the crowd above."""
    release = Release(root)
    release.edition('marathon', 'full', 'Berlin', 2019)
    release.edition('marathon', 'full', 'Berlin', 2021)
    release.edition('marathon', 'full', 'Smallville, XX: Smallville Marathon 2020', 2020, tier='unverified', split='finish_time_only')
    release.edition('half', 'half', 'Berlin', 2019, tier='held_for_review', split='finish_time_only', timing='gross (gun)')
    release.edition('half', 'half', 'Drammen Half', 2017, tier='unverified', split='finish_time_only')
    release.edition('half', 'half', 'Lake City, ZZ: LAKE CITY HALF MARATHON 2022', 2022, tier='stamped_weaker_source')
    release.edition('half', 'full', 'Lake City, ZZ: LAKE CITY HALF MARATHON 2022', 2022, tier='unverified', split='finish_time_only')
    finish_only = {'split_42_2km': '03:59:59', 'finish_time': '03:59:59'}
    # Person 1: two confirmed links under two spellings of one name, and a possible match under a third.
    release.add('marathon', 'full', 11, 'Berlin', 2019, 'Lee, José (ESP)', marathon_times(300), sex='M', age=34, person=1, tier='high')
    release.add('half', 'half', 12, 'Berlin', 2019, 'José Lee', half_times(5400), sex='M', age=34, person=1, tier='medium')
    release.add('marathon', 'full', 13, 'Smallville, XX: Smallville Marathon 2020', 2020, 'J. Lee', finish_only, sex=None, person=1, tier='low',
                status=('limited', 'finish_time_only'), sex_from_category='M')
    # Person 2: confirmed tiers without a key (a screen failed): shown as possible matches.
    release.add('marathon', 'full', 21, 'Berlin', 2019, 'Anna Żółć', marathon_times(310), sex='F', age=30, person=2, tier='medium', key=False)
    release.add('marathon', 'full', 22, 'Berlin', 2021, 'Anna Żółć', marathon_times(320), sex='F', age=45, person=2, tier='high', key=False)
    # Person 3: possible links only.
    release.add('marathon', 'full', 31, 'Berlin', 2019, 'Bo Åkesson', marathon_times(305, missing=(15, 25)), sex='X', person=3, tier='low_noage',
                status=('limited', 'missing_checkpoints'))
    release.add('half', 'half', 32, 'Drammen Half', 2017, 'Bo Åkesson', half_times(6000, {5: 1400, 10: 2900, 15: 4100, 20: 5700}), sex='M', person=3,
                tier='low', short=True)
    # No link: the same record id in both databases and at both distances.
    release.add('marathon', 'full', 77, 'Berlin', 2021, 'Jose "Jay", Lee\n', marathon_times(330), sex='M', age=51)
    release.add('half', 'half', 77, 'Lake City, ZZ: LAKE CITY HALF MARATHON 2022', 2022, '李 伟', half_times(7000, {10: 3300}), sex='F', age=28)
    release.add('half', 'full', 78, 'Lake City, ZZ: LAKE CITY HALF MARATHON 2022', 2022, 'Æsa Þórsdóttir', half_times(7100), sex='F')
    # A marathon with no finish time, and one whose times are not in order (a negative gap).
    release.add('marathon', 'full', 41, 'Berlin', 2021, 'Nofinish Runner', {**marathon_times(300), 'split_42_2km': None, 'finish_time': None}, sex='F',
                status=('limited', 'missing_checkpoints'))
    unordered = marathon_times(300)
    unordered['split_15km'] = clock(2900)
    release.add('marathon', 'full', 42, 'Berlin', 2021, 'Out Oforder', unordered, sex='M', age=1923, qa=['age_implausible'], status=('limited', 'times_out_of_order'))
    # Rows that never appear, and rows that are kept but not listed.
    release.add('marathon', 'full', 51, 'Berlin', 2019, 'Never Shown', marathon_times(200), pending=['wheelchair_handcycle_published_category'])
    release.add('marathon', 'full', 52, 'Berlin', 2019, 'Never Shownalso', marathon_times(100), qa=['finish_faster_than_world_record'])
    release.add('half', 'half', 53, 'Berlin', 2019, 'Never Shownhalf', half_times(4000), pending=['wheelchair_handcycle_published_category'])
    release.add('half', 'half', 54, 'Berlin', 2019, 'Never Negative', half_times('-1:20:09'))
    release.add('half', 'half', 55, 'Berlin', 2019, 'Never Fast', half_times(1500), qa=['finish_implausibly_fast'])
    release.add('marathon', 'full', 56, 'Berlin', 2019, 'Anonymous Anonymous', marathon_times(340), unlinked_reason='placeholder_name')
    release.add('marathon', 'full', 57, 'Berlin', 2019, 'Entry, Late (USA)', marathon_times(341))
    release.add('half', 'half', 58, 'Berlin', 2019, '***', half_times(6100))
    release.add('half', 'half', 59, 'Berlin', 2019, None, half_times(6200))
    release.add('half', 'half', 60, 'Berlin', 2019, '(USA)', half_times(6300, {5: '-0:01:00'}))
    # The crowd: "smith" and "van" are heavy words (more than four search names), "van der" one large group.
    record_id = 100
    for at, first in enumerate(['Ada', 'Bea', 'Cy', 'Di', 'Ed', 'Flo']):
        release.add('marathon', 'full', record_id, 'Berlin', 2019, f'{first} Smith', marathon_times(280 + at), person=100 + at, tier='high')
        release.add('marathon', 'full', record_id + 1, 'Berlin', 2021, f'Smith, {first}', marathon_times(282 + at), person=100 + at, tier='high')
        record_id += 2
    for at, last in enumerate(['Aa', 'Berg', 'Camp', 'Dam', 'Eck', 'Fliet', 'Graaf', 'Heide', 'Ijssel', 'Jagt', 'Kolk']):
        release.add('half', 'half', record_id, 'Berlin', 2019, f'Van der {last}', half_times(5000 + at), sex=None)
        record_id += 1
    for at, word in enumerate(['Quill', 'Rook', 'Stone', 'Tarn', 'Umber', 'Vale', 'Wren', 'Yew', 'Zed', '𠮷野', 'ไทย']):
        release.add('half', 'half', record_id, 'Drammen Half', 2017, f'{word} Only{at}', half_times(6500 + at), short=True)
        record_id += 1
    registry = [{'race_id': 'berlin', 'label': 'Berlin', 'name': 'Berlin Marathon', 'keys': ['Berlin']},
                {'race_id': 'smallville-marathon', 'label': 'Smallville Marathon', 'name': 'Smallville Marathon', 'keys': ['Smallville, XX: Smallville Marathon 2020']}]
    policy = [{'city': 'Smallville Marathon', 'year': 2020, 'category': 'finish_time_only', 'reason': 'Finish times only: this edition supplies no pacing statistic.'}]
    release.write(registry, policy,
                  half_expected={'release_rows': 32, 'left_out_rows': 3,
                                 'by_flag': {'finish_implausibly_fast': 1, 'finish_not_a_positive_time': 1, 'wheelchair_handcycle_published_category': 1}},
                  placeholders=[{'name': 'Late Entry', 'release_rows': 1, 'reason': 'test'}],
                  gun=[('half', 'Berlin', 2019)], short=[('half', 'Drammen Half', 2017)])
    return release


def read_build(output):
    """Every file of a build, decoded: (manifest, editions, {shard number: profiles}, [leaf rows], index entries)."""
    manifest = json.loads((output / 'manifest.json').read_text())
    editions = fmt.decode_editions(fmt.read_gz(output / 'editions.json.gz'))
    shards = {}
    for number in range(fmt.PROFILE_SHARDS):
        profiles = fmt.decode_shard(fmt.read_gz(output / fmt.shard_path(number)), editions)
        if profiles:
            shards[number] = profiles
    entries = []
    for page in range(len(manifest['index']['pages'])):
        entries += fmt.read_gz(output / fmt.index_page_path(page))['leaves']
    leaves = [fmt.decode_leaf(fmt.read_gz(output / fmt.leaf_path(number))) for number in range(len(entries))]
    return manifest, editions, shards, leaves, entries


class Names(unittest.TestCase):
    def test_normalisation_and_the_fold_table(self):
        self.assertEqual(names.normalize_name('  José  O’Neal-Straße  '), 'jose o neal strasse')
        self.assertEqual(names.normalize_name('ŁUKASZ Żółć'), 'lukasz zolc')
        self.assertEqual(names.normalize_name('Søren Ødegård'), 'soren odegard')
        self.assertEqual(names.normalize_name('Æsa Þórsdóttir, Guðrún'), 'aesa thorsdottir gudrun')
        self.assertEqual(names.normalize_name('Đorđe Œuvre'), 'dorde oeuvre')
        self.assertEqual(names.normalize_name('IŞIK Işık İpek'), 'isik isik ipek')
        self.assertEqual(names.normalize_name('GROẞ'), 'gross')
        self.assertEqual(names.normalize_name('ＬＩ 李 １２'), 'li 李 12')
        self.assertEqual(names.normalize_name('สมชาย ใจดี'), 'สมชาย ใจด')          # Thai vowel signs are marks and go, as in the browser
        self.assertEqual(names.normalize_name('Ιωάννης ΠΑΠΑΔΌΠΟΥΛΟΣ'), 'ιωαννης παπαδοπουλος')   # a final sigma stays a final sigma
        self.assertEqual(names.normalize_name('𠮷野家'), '𠮷野家')
        self.assertEqual(names.normalize_name(None), '')
        self.assertEqual(names.normalize_name('***'), '')
        for text in ['Smith, José (GBR)', "O'Neil-Smith", 'a\tb\nc', 'ǅemal Ǆ', 'Ⅷ ½ ①', 'İİ', 'ﬁnn ﬂynn', 'Ω Ω K', '٣ ٤', 'x́y', '']:
            self.assertEqual(names.normalize_name(text), names.normalize_name_reference(text), text)
        self.assertEqual(set(names.FOLD), set('łøđðßæœþı'))

    def test_search_words(self):
        self.assertEqual(names.search_words('Smith, José (GBR)'), ['jose', 'smith'])
        self.assertEqual(names.search_words('(USA)'), ['usa'])                      # a code alone stays as the word
        self.assertEqual(names.search_words('Smith (usa)'), ['smith', 'usa'])       # only capitals are a code
        self.assertEqual(names.search_words('Smith (GBRX)'), ['gbrx', 'smith'])
        self.assertEqual(names.search_words('Lee Lee'), ['lee'])                    # distinct words
        self.assertEqual(names.search_words('Jose "Jay", Lee\n'), ['jay', 'jose', 'lee'])
        self.assertEqual(names.search_words('Lee (ESP)\n'), ['esp', 'lee'])         # a newline after the code: not at the end, as in the browser
        # Code point order: U+FA0E (a letter NFKD leaves whole, above the surrogates) sorts before the astral U+20BB7; UTF-16 order would not.
        self.assertEqual(names.search_words(chr(0x20BB7) + '野 ' + chr(0xFA0E) + 'x Ab'), ['ab', chr(0xFA0E) + 'x', chr(0x20BB7) + '野'])
        self.assertEqual(names.search_words('***'), [])
        self.assertEqual(names.search_key('Zawodnik, Anonimowy'), names.search_key('ANONIMOWY ZAWODNIK (POL)'))

    def test_separator(self):
        self.assertEqual(names.separator('smit', 'smith'), 'smith')
        self.assertEqual(names.separator('smart', 'smith'), 'smi')
        self.assertEqual(names.separator('', 'a'), 'a')
        self.assertEqual(names.separator('ab', 'b'), 'b')
        with self.assertRaises(ValueError):
            names.separator('b', 'a')


class Cutter(unittest.TestCase):
    def cut(self, postings, heavy=(), rules=RULES):
        leaves = []
        cutter = fmt.LeafCutter(set(heavy), leaves.append, rules)
        for row in postings:
            cutter.add(row)
        cutter.finish()
        return leaves

    def test_a_light_word_is_never_split_and_leaves_keep_the_floor(self):
        postings = [(word, '', n) for word in ['a', 'b', 'c', 'd', 'e'] for n in range(3)] + [('f', '', 0)]
        leaves = self.cut(postings)
        self.assertEqual([[row[0] for row in leaf['rows']] for leaf in leaves],
                         [['a'] * 3 + ['b'] * 3, ['c'] * 3 + ['d'] * 3, ['e'] * 3 + ['f']])
        self.assertEqual([leaf['key'] for leaf in leaves], [('', '', 0), ('c', '', 0), ('e', '', 0)])
        for leaf in leaves:
            self.assertGreaterEqual(len(leaf['rows']), RULES['min_rows'])
        self.assertEqual(sum(len(leaf['rows']) for leaf in leaves), len(postings))

    def test_a_short_tail_joins_the_leaf_before_it(self):
        leaves = self.cut([('a', '', n) for n in range(4)] + [('b', '', n) for n in range(4)] + [('c', '', 0)])
        self.assertEqual([len(leaf['rows']) for leaf in leaves], [4, 5])
        self.assertEqual(self.cut([('a', '', 0)])[0]['key'], ('', '', 0))            # fewer rows than the floor: one leaf

    def test_keys_are_the_shortest_beginnings(self):
        words = ['smart'] * 4 + ['smith'] * 4 + ['smithers'] * 4 + ['smits'] * 2
        leaves = self.cut([(word, '', n) for n, word in enumerate(words)])
        self.assertEqual([leaf['key'] for leaf in leaves], [('', '', 0), ('smi', '', 0), ('smithe', '', 0)])
        self.assertEqual([len(leaf['rows']) for leaf in leaves], [4, 4, 6])

    def test_heavy_groups_are_kept_whole_until_they_cannot_fit(self):
        # "van" is heavy: partners a (3 rows), b (3), c (9: over max_rows, cut every target_rows), d (2).
        postings = [('ant', '', 0)] + [('van', 'a', n) for n in range(3)] + [('van', 'b', n) for n in range(3)] \
            + [('van', 'c', n) for n in range(9)] + [('van', 'd', n) for n in range(2)] + [('zed', '', 0)]
        leaves = self.cut(postings, heavy=['van'])
        self.assertEqual([[row[:2] for row in leaf['rows']] for leaf in leaves], [
            [('ant', '')] + [('van', 'a')] * 3 + [('van', 'b')] * 3,          # 7 rows: reached the target, closed
            [('van', 'c')] * 6,                                                # the group starts a leaf and is cut at the target
            [('van', 'c')] * 3 + [('van', 'd')] * 2 + [('zed', '')]])          # the rest of it, marked c
        self.assertEqual([leaf['key'] for leaf in leaves], [('', '', 0), ('van', 'c', 0), ('van', 'c', 1)])

    def test_a_group_meeting_a_leaf_under_the_floor_is_split(self):
        postings = [('ant', '', 0)] + [('van', 'der', n) for n in range(8)] + [('van', 'e', 0)]
        leaves = self.cut(postings, heavy=['van'])
        self.assertEqual([len(leaf['rows']) for leaf in leaves], [6, 4])
        self.assertEqual(leaves[1]['key'], ('van', 'der', 1))

    def test_a_leaf_inside_a_heavy_word_starts_at_a_shortened_partner(self):
        postings = [('van', '', n) for n in range(3)] + [('van', 'berg', n) for n in range(3)] + [('van', 'bergen', n) for n in range(3)] \
            + [('van', 'dam', n) for n in range(3)]
        leaves = self.cut(postings, heavy=['van'])
        self.assertEqual([leaf['key'] for leaf in leaves], [('', '', 0), ('van', 'berge', 0)])

    def test_refusals(self):
        with self.assertRaises(ValueError):
            self.cut([('b', '', 0), ('a', '', 0)])
        with self.assertRaises(ValueError):
            self.cut([('a', 'x', 0)])                                              # a light word has no partner
        with self.assertRaises(ValueError):
            fmt.LeafCutter(set(), print, {**RULES, 'heavy_over': 7})               # a light word could then pass max_rows


class Races(unittest.TestCase):
    def test_half_keys_follow_the_registry_module_and_never_reach_a_label_twice(self):
        first = {'Berlin': 2011, 'Lake City, ZZ: LAKE CITY HALF MARATHON 2022': 2022, 'Lake City, ZZ: Lake City Half Marathon': 2019,
                 'Other Town, YY: Lake City Half Marathon': 2018, 'XACT: Night Half': 2020}
        races = lookup_races.half_races(first)
        self.assertEqual(races['Berlin'], ('Berlin', 'Berlin'))
        self.assertEqual(races['XACT: Night Half'], ('Night Half', 'Night Half'))                      # a platform is not a place
        self.assertEqual(races['Other Town, YY: Lake City Half Marathon'], ('Lake City Half Marathon (Other Town, YY)', 'Lake City Half Marathon'))
        self.assertEqual(races['Lake City, ZZ: LAKE CITY HALF MARATHON 2022'], ('Lake City Half Marathon (Lake City, ZZ, 2022)', 'Lake City Half Marathon'))
        self.assertEqual(races['Lake City, ZZ: Lake City Half Marathon'], ('Lake City Half Marathon (Lake City, ZZ, 2019)', 'Lake City Half Marathon'))
        self.assertEqual(len({label for label, _ in races.values()}), len(races))
        with_registry = lookup_races.half_races(first, {'Berlin': ('Berlin', 'Berliner Halbmarathon')})
        self.assertEqual(with_registry['Berlin'], ('Berlin', 'Berliner Halbmarathon'))


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.release = small_release(cls.root / 'release')
        cls.output = cls.root / 'a' / 'runners'
        cls.manifest = cls.release.build(cls.output)
        cls.read = read_build(cls.output)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def results(self):
        manifest, editions, shards, leaves, entries = self.read
        return {(row['db'], row['id']): (number, at, profile, row) for number, profiles in shards.items()
                for at, profile in enumerate(profiles) for row in profile['results']}

    def test_the_rows_that_never_appear_and_the_rows_that_are_not_listed(self):
        results = self.results()
        for key in [('f', 51), ('f', 52), ('h', 53), ('h', 54), ('h', 55), ('f', 56), ('f', 57), ('h', 58), ('h', 59)]:
            self.assertNotIn(key, results)
        text = b''.join(__import__('gzip').decompress(path.read_bytes()) for path in sorted(self.output.rglob('*.json.gz'))).decode()
        for word in ['Never', 'Anonymous', 'Late', 'wheelchair']:
            self.assertNotIn(word, text)
        counts = self.manifest['counts']
        self.assertEqual(counts['marathon']['left_out'], {'rows': 2, 'by_flag': {'finish_faster_than_world_record': 1, 'wheelchair_handcycle_published_category': 1}})
        self.assertEqual(counts['half']['left_out']['rows'], 3)
        self.assertEqual(counts['marathon']['placeholder'], {'flagged': 1, 'listed': 1})
        self.assertEqual(counts['half']['unnamed'], 2)
        self.assertEqual(counts['marathon']['results'] + counts['half']['results'], len(results))
        for name in ('marathon', 'half'):
            block = counts[name]
            self.assertEqual(block['release_rows'], block['left_out']['rows'] + block['unnamed'] + sum(block['placeholder'].values()) + block['results'])

    def test_a_profile_with_confirmed_and_possible_links(self):
        results = self.results()
        shard, position, profile, first = results[('f', 11)]
        self.assertEqual(shard, 0)                                                   # the first three hex digits of the person id
        self.assertEqual(profile['names'], ['Lee, José (ESP)', 'J. Lee', 'José Lee'])   # first-use order: marathons before the half
        self.assertEqual([(row['distance'], row['id'], row['c'], row['s']) for row in profile['results']],
                         [('marathon', 11, '2', '0'), ('marathon', 13, '5', '6'), ('half', 12, '3', '-')])
        self.assertEqual(first['times'], [1500, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 12658])
        self.assertEqual((first['x'], first['a'], first['name']), ('M', 34, 'Lee, José (ESP)'))
        possible = profile['results'][1]
        self.assertEqual((possible['x'], possible['a'], possible['m'], possible['times'][-1]), ('M', -1, 0, 14399))   # sex from the category; no age
        self.assertEqual(profile['results'][2]['times'], [None, None, None, None, 5400])

    def test_links_without_a_key_and_possible_only_profiles(self):
        results = self.results()
        self.assertEqual([row['c'] for row in results[('f', 21)][2]['results']], ['d', 'c'])       # medium and high of a person who fails a screen
        self.assertEqual([row['c'] for row in results[('f', 31)][2]['results']], ['6', '5'])
        self.assertEqual(self.manifest['counts']['profiles_by_kind']['possible_only'], 2)

    def test_a_result_with_no_link_and_the_same_id_at_both_distances(self):
        results = self.results()
        marathon, half = results[('f', 77)], results[('h', 77)]
        self.assertEqual(marathon[0], fmt.unlinked_shard('f', 77))
        self.assertEqual(half[0], fmt.unlinked_shard('h', 77))
        self.assertEqual((marathon[3]['c'], len(marathon[2]['results']), marathon[3]['name']), ('0', 1, 'Jose "Jay", Lee\n'))
        self.assertEqual((half[3]['distance'], half[3]['name'], half[3]['times']), ('half', '李 伟', [None, 3300, None, None, 7000]))
        self.assertEqual(results[('f', 78)][3]['distance'], 'half')                  # a half result of the marathon database

    def test_times_statuses_and_ages(self):
        results = self.results()
        no_finish = results[('f', 41)][3]
        self.assertEqual((no_finish['f'], no_finish['s'], no_finish['times'][-1], no_finish['times'][0]), (-1, '3', None, 1500))
        unordered = results[('f', 42)][3]
        self.assertEqual((unordered['s'], unordered['a'], unordered['gaps'][:4]), ('4', -1, [1500, 1500, -100, 3100]))   # a negative gap; an implausible age is hidden
        missing = results[('f', 31)][3]
        self.assertEqual((missing['m'], missing['x'], missing['times'][:5]), (0b11101011, 'X', [1525, 3050, None, 6100, None]))
        code_only = results[('h', 60)][3]
        self.assertEqual((code_only['name'], code_only['m']), ('(USA)', 0))           # a checkpoint that is not a time is not recorded
        self.assertEqual(self.manifest['counts']['half']['checkpoints_unread'], 1)
        self.assertEqual(self.manifest['counts']['marathon']['age_hidden'], 1)
        self.assertEqual(self.manifest['counts']['marathon']['no_finish'], 1)

    def test_editions(self):
        manifest, editions, shards, leaves, entries = self.read
        self.assertEqual([(e['distance'], e['city'], e['year'], e['db']) for e in editions], [
            ('marathon', 'Berlin', 2019, 'f'), ('marathon', 'Berlin', 2021, 'f'), ('marathon', 'Smallville Marathon', 2020, 'f'),
            ('half', 'Berlin', 2019, 'h'), ('half', 'Drammen Half', 2017, 'h'),
            ('half', 'Lake City Half Marathon', 2022, 'f'), ('half', 'Lake City Half Marathon', 2022, 'h')])
        self.assertEqual([e['no_comparison'] for e in editions], [0, 0, 0, 1, 2, 0, 0])
        self.assertEqual([e['tier'] for e in editions], [0, 0, 4, 3, 4, 4, 1])
        self.assertEqual([e['splits'] for e in editions], [True, True, False, False, False, False, True])
        self.assertEqual(editions[2]['reason'], 'Finish times only: this edition supplies no pacing statistic.')
        self.assertEqual(editions[0]['race'], 'Berlin Marathon')
        self.assertEqual(editions[3]['unlisted'], 2)                                # the two half rows with no usable name
        text = (self.output / 'manifest.json').read_text() + json.dumps(fmt.read_gz(self.output / 'editions.json.gz'), ensure_ascii=False)
        self.assertNotIn('Smallville, XX', text)                                     # a release key never reaches a file
        self.assertNotIn('LAKE CITY', text)

    def test_postings_for_light_and_heavy_words(self):
        manifest, editions, shards, leaves, entries = self.read
        self.assertEqual([word for word, _ in manifest['index']['heavy']], ['der', 'smith', 'van'])
        expected = []
        heavy = dict(manifest['index']['heavy'])
        for number, profiles in shards.items():
            for at, profile in enumerate(profiles):
                for key in {names.search_key(row['name']) for row in profile['results']}:
                    words = key.split(' ')
                    for word in words:
                        others = [other for other in words if other != word] or ['']
                        for partner in (others if word in heavy else ['']):
                            expected.append((word, partner, number, at))
        rows = [(row['b'], row['o'], row['n']) for leaf in leaves for row in leaf]
        self.assertEqual(len(rows), len(expected))
        self.assertEqual(manifest['counts']['index_rows'], len(rows))
        self.assertEqual(sorted((b, o) for b, o, n in rows), sorted((b, o) for w, p, b, o in expected))
        # Every leaf row sits where the directory says: rebuild each row's possible keys and look for one inside the leaf's range.
        self.assertEqual([entry[3] for entry in entries], [len(leaf) for leaf in leaves])
        keys = [(entry[0], entry[1]) for entry in entries]
        self.assertEqual(keys, sorted(keys))
        for number, leaf in enumerate(leaves):
            low = keys[number]
            high = keys[number + 1] if number + 1 < len(keys) else None
            for row in leaf:
                words = names.search_words(row['n'])
                mine = [(w, p) for w in words for p in (([o for o in words if o != w] or ['']) if w in heavy else [''])]
                self.assertTrue(any(low <= key and (high is None or key <= high) for key in mine), (number, row['n']))
        # A light word is in one leaf; the split group is marked.
        where = {}
        for number, leaf in enumerate(leaves):
            for row in leaf:
                for word in names.search_words(row['n']):
                    if word not in heavy:
                        where.setdefault(word, set())
        self.assertTrue(any(entry[2] == 1 for entry in entries))                    # "van der" is cut across leaves
        self.assertEqual({(entry[0], entry[1]) for entry in entries if entry[2] == 1} <= {('van', 'der'), ('der', 'van')}, True)

    def test_search_rows_describe_the_profile(self):
        manifest, editions, shards, leaves, entries = self.read
        rows = {}
        for leaf in leaves:
            for row in leaf:
                rows.setdefault(row['n'], row)
        self.assertEqual({key: rows['Lee, José (ESP)'][key] for key in 'beysmhqp'},
                         {'b': 0, 'e': -1, 'y': 2019, 's': 0, 'm': 1, 'h': 1, 'q': 1, 'p': 0})
        self.assertNotIn('José Lee', rows)                                           # the same set of words as the marathon spelling: one search name
        self.assertEqual({key: rows['J. Lee'][key] for key in 'eysmhqp'},
                         {'e': 2, 'y': 0, 's': 0, 'm': 0, 'h': 0, 'q': 0, 'p': 1})   # a spelling only on a possible match: that one race
        self.assertEqual({key: rows['Anna Żółć'][key] for key in 'eysmhqp'}, {'e': -1, 'y': 2019, 's': 2, 'm': 0, 'h': 0, 'q': 2, 'p': 0})
        single = rows['李 伟']
        self.assertEqual((editions[single['e']]['city'], single['y'], single['q'], single['p']), ('Lake City Half Marathon', 0, 0, 0))
        self.assertEqual({key: rows['Smith, Ada'][key] for key in 'eysmhq'}, {'e': -1, 'y': 2019, 's': 2, 'm': 2, 'h': 0, 'q': 0})   # the latest spelling is shown
        self.assertNotIn('Ada Smith', rows)

    def test_the_chain_and_the_manifest(self):
        manifest, editions, shards, leaves, entries = self.read
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertEqual(manifest['editions']['sha256'], digest(self.output / 'editions.json.gz'))
        for number, (word, partner, mark, size, sha) in enumerate(manifest['index']['pages']):
            path = self.output / fmt.index_page_path(number)
            self.assertEqual((size, sha), (path.stat().st_size, digest(path)))
            self.assertEqual(entries[number * fmt.PAGE_SIZE][:3], [word, partner, mark])
        for number, entry in enumerate(entries):
            path = self.output / fmt.leaf_path(number)
            self.assertEqual(entry[4:], [path.stat().st_size, digest(path)])
        self.assertEqual(len(manifest['profiles']['pages']), fmt.PROFILE_SHARDS // fmt.PAGE_SIZE)
        page = fmt.read_gz(self.output / fmt.profile_page_path(0))
        self.assertEqual(page['shards'][0][3], digest(self.output / fmt.shard_path(0)))
        self.assertEqual(manifest['schema_version'], 2)
        self.assertEqual(manifest['provisional'], ['cohort', 'half_registry', 'race_registry'])   # no cohort, no half registry, not the checked-in registry
        self.assertEqual(manifest['rules']['index'], RULES)
        # Counted: records 11, 21, 22, 77 and the twelve of the crowd. Gun times: 12, 60 and the eleven "Van der"; short course: 32 and eleven more.
        self.assertEqual(manifest['counts']['marathon']['status'], {'0': 16, '3': 2, '4': 1, '6': 1})
        self.assertEqual(manifest['counts']['half']['no_comparison'], {'1': 13, '2': 12})
        for path in self.output.rglob('*.json.gz'):
            self.assertNotIn(TAG.encode(), __import__('gzip').decompress(path.read_bytes()))   # no tag in any shard body
        self.assertNotIn('p51_', (self.output / 'manifest.json').read_text() + ''.join(
            __import__('gzip').decompress(path.read_bytes()).decode() for path in self.output.rglob('*.json.gz')))

    def test_the_cohort_binding(self):
        cohort = self.release.write_cohort()
        output = self.root / 'bound' / 'runners'
        manifest = self.release.build(output, cohort_path=cohort)
        self.assertEqual(manifest['provisional'], ['half_registry', 'race_registry'])
        self.assertEqual(manifest['cohort'], {'manifest_sha256': hashlib.sha256(cohort.read_bytes()).hexdigest(), 'release_tag': TAG, 'as_of': '2099-01-01T12:00:00Z',
                                              'input_as_of': '2099-01-01T00:00:00Z', 'raw_records': 22, 'eligible_records': 18, 'own_record_records': 0, 'editions': 2})
        editions = fmt.decode_editions(fmt.read_gz(output / 'editions.json.gz'))
        self.assertEqual([e['context'] for e in editions], [0, 1, None, None, None, None, None])      # Berlin 2019 and 2021; an edition of recorded times only has none
        # A cohort of other files, or with another count, is refused.
        for message, change in [('the cohort was built from another record-status.parquet', lambda d: d['inputs']['record_status'].update(sha256='0' * 64)),
                                ('the cohort manifest counts 12 raw records', lambda d: d['editions'][0].update(raw=12)),
                                ('kept marathon rows are counted; the cohort holds 17', lambda d: d.update(eligible_records=17)),
                                ('the cohort manifest is of', lambda d: d.update(release_tag='another'))]:
            other = self.release.write_cohort('cohort-' + hashlib.sha256(message.encode()).hexdigest()[:6], change)
            with self.assertRaises(builder.BuildError) as caught:
                self.release.build(self.root / ('bound-' + other.parent.name) / 'runners', cohort_path=other)
            self.assertIn(message, str(caught.exception))

    def test_two_builds_give_the_same_bytes(self):
        second = self.root / 'b' / 'runners'
        self.release.build(second)
        files = sorted(path.relative_to(self.output) for path in self.output.rglob('*') if path.is_file())
        self.assertEqual(files, sorted(path.relative_to(second) for path in second.rglob('*') if path.is_file()))
        for relative in files:
            self.assertEqual((self.output / relative).read_bytes(), (second / relative).read_bytes(), str(relative))

    def test_wrong_digests_and_unknown_values_are_refused(self):
        def refused(message, **changes):
            target = self.root / ('refused-' + hashlib.sha256(message.encode()).hexdigest()[:8]) / 'runners'
            with self.assertRaises(builder.BuildError) as caught:
                self.release.build(target, **changes)
            self.assertIn(message, str(caught.exception))
            self.assertFalse(target.exists() and any(target.rglob('manifest.json')))
        pin = json.loads(self.release.pin_path.read_text())
        for field, message in [(('core', 'sha256sums_sha256'), 'SHA256SUMS.txt differs from the pinned digest'),
                               (('core', 'manifest_sha256'), 'MANIFEST.json differs from the pinned digest'),
                               (('assets', self.release.links_path.name), 'differs from the pinned digest'),
                               (('assets', 'EDITION-TIERS.csv'), 'EDITION-TIERS.csv in CORE differs')]:
            changed = json.loads(json.dumps(pin))
            changed[field[0]][field[1]] = '0' * 64
            path = self.root / f'pin-{field[1]}.json'
            path.write_text(json.dumps(changed))
            refused(message, pin_path=path)
        with self.assertRaises(builder.BuildError) as caught:
            self.release.build(self.output)
        self.assertIn('is not empty', str(caught.exception))
        # A changed member of the release, with the pin untouched.
        core = self.root / 'changed-core'
        __import__('shutil').copytree(self.release.core, core)
        (core / 'EDITION-TIERS.csv').write_text((core / 'EDITION-TIERS.csv').read_text().replace('stamped', 'unverified', 1))
        with self.assertRaises(builder.BuildError) as caught:
            builder.build(core, self.release.links_path, self.release.status_path, self.release.identity_path, self.root / 'x' / 'runners',
                          pin_path=self.release.pin_path, registry_path=self.release.registry_path, half_records_path=self.release.half_path,
                          placeholders_path=self.release.placeholders_path, index_rules=RULES)
        self.assertIn('EDITION-TIERS.csv differs from the digest', str(caught.exception))
        # Reviewed counts and lists that no longer fit.
        rule = json.loads(self.release.half_path.read_text())
        rule['expected']['left_out_rows'] = 4
        path = self.root / 'half-rule.json'
        path.write_text(json.dumps(rule))
        refused('differ from the reviewed counts', half_records_path=path)
        rule = json.loads(self.release.half_path.read_text())
        rule['no_comparison']['gun_times']['editions'] = []
        path.write_text(json.dumps(rule))
        refused('reviewed gun-time list', half_records_path=path)
        path = self.root / 'placeholders.json'
        path.write_text(json.dumps({'tag': TAG, 'names': [{'name': 'Late Entry', 'release_rows': 2, 'reason': 'test'}]}))
        refused('differ from the reviewed counts', placeholders_path=path)
        path.write_text(json.dumps({'tag': 'another-release', 'names': []}))
        refused('review it for this release', placeholders_path=path)
        registry = json.loads(self.release.registry_path.read_text())
        registry['races'] = registry['races'][:1]
        path = self.root / 'registry.json'
        path.write_text(json.dumps(registry))
        refused('has no race', registry_path=path)

    def test_a_build_that_does_not_finish_leaves_nothing_behind(self):
        target = self.root / 'nothing' / 'runners'
        left = lambda: sorted(path.name for path in target.parent.iterdir())
        # A refusal after the output and the temporary folder exist.
        rule = json.loads(self.release.half_path.read_text())
        rule['no_comparison']['gun_times']['editions'] = []
        path = self.root / 'half-rule-nothing.json'
        path.write_text(json.dumps(rule))
        with self.assertRaises(builder.BuildError):
            self.release.build(target, half_records_path=path)
        self.assertEqual(left(), [])
        # A stop from outside, part of the way through (the command line turns SIGTERM, SIGINT and SIGHUP into Stopped).
        original = builder._build

        def stopped(db, pin, core, links, status, identity, output, *rest):
            (output / 'half-written.json.gz').write_bytes(b'x')
            db.execute('CREATE TABLE half_made AS SELECT 1')
            raise builder.Stopped('SIGTERM')
        builder._build = stopped
        try:
            with self.assertRaises(builder.Stopped):
                self.release.build(target)
        finally:
            builder._build = original
        self.assertEqual(left(), [])
        # A temporary folder over its limit stops the build, which says so.
        with self.assertRaises(builder.BuildError) as caught:
            self.release.build(target, temp_limit_gb=1e-6)
        self.assertIn('the temporary folder passed', str(caught.exception))
        self.assertEqual(left(), [])
        # The same place then takes a whole build, and only the build is left.
        self.assertEqual(self.release.build(target)['counts'], self.manifest['counts'])
        self.assertEqual(left(), ['runners'])

    def test_the_command_line_reports_a_stop_and_keeps_other_errors(self):
        arguments = ['--core', str(self.release.core), '--links', str(self.release.links_path), '--status', str(self.release.status_path),
                     '--identity', str(self.release.identity_path), '--output', str(self.root / 'cli' / 'runners')]
        original, handlers = builder.build, {name: signal.getsignal(getattr(signal, name)) for name in ('SIGTERM', 'SIGINT', 'SIGHUP')}

        def raising(error, cause=None):
            def build(*args, **options):
                raise error from cause
            return build
        try:
            # A signal that arrives inside a query comes back from DuckDB as a RuntimeError caused by the stop.
            for error, cause, said in ((builder.Stopped('SIGTERM'), None, 'stopped by SIGTERM'),
                                       (RuntimeError('Query interrupted'), builder.Stopped('SIGHUP'), 'stopped by SIGHUP'),
                                       (builder.BuildError('refused'), None, 'build_runner_lookup: refused')):
                builder.build = raising(error, cause)
                with contextlib.redirect_stderr(io.StringIO()) as printed:
                    self.assertEqual(builder.main(arguments), 1)
                self.assertIn(said, printed.getvalue())
                self.assertNotIn('Traceback', printed.getvalue())
            builder.build = raising(RuntimeError('another failure'))
            with self.assertRaises(RuntimeError):
                builder.main(arguments)
            self.assertIsNot(signal.getsignal(signal.SIGTERM), handlers['SIGTERM'])      # the command line installed its own
        finally:
            builder.build, builder.LOG = original, False
            for name, handler in handlers.items():
                signal.signal(getattr(signal, name), handler)


if __name__ == '__main__':
    unittest.main()
