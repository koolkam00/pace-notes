"""analysis/build_identity.py on a small link table: the tier condition, each screen, both distances, the two row rules."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapt_combined  # noqa: E402
import build_identity  # noqa: E402

TAG = 'pace-notes-marathon-half-20990101-0000'
IDENTITY = {'build': 'person-ids v5.1', 'prefix': 'p51_', 'keyed_confidences': ['high_elite', 'high', 'medium'], 'possible_confidences': ['medium_variant', 'low']}
# distance, source_db, record_id, city, year, person, confidence, sex, age_key; then the expected status, key and reason.
LINKS = [
    # One runner over both distances; birth years two apart pass.
    ('marathon', 'full', 1, 'A', 2019, 'p51_1', 'high', 'M', 'yob:1980', 'keyed', 'p51_1', None),
    ('marathon', 'full', 2, 'A', 2020, 'p51_1', 'medium', 'M', 'yob:1981', 'keyed', 'p51_1', None),
    ('half', 'half', 1, 'A', 2020, 'p51_1', 'high', None, 'yob:1982', 'keyed', 'p51_1', None),
    # A sex conflict that only the two distances together show.
    ('marathon', 'full', 3, 'A', 2019, 'p51_2', 'medium', 'M', 'yob:1970', 'possible_match', None, 'sex_conflict'),
    ('half', 'half', 2, 'A', 2019, 'p51_2', 'medium', 'F', None, 'possible_match', None, 'sex_conflict'),
    # Birth years five apart.
    ('marathon', 'full', 4, 'A', 2019, 'p51_3', 'high', 'F', 'yob:1970', 'possible_match', None, 'birth_year_spread'),
    ('marathon', 'full', 5, 'B', 2019, 'p51_3', 'high', 'F', 'yob:1975', 'possible_match', None, 'birth_year_spread'),
    # Two results in one marathon edition.
    ('marathon', 'full', 6, 'B', 2020, 'p51_4', 'high', 'F', None, 'possible_match', None, 'two_results_in_one_edition'),
    ('marathon', 'full', 7, 'B', 2020, 'p51_4', 'high', 'F', None, 'possible_match', None, 'two_results_in_one_edition'),
    # A tier below medium; an unlinked row.
    ('marathon', 'full', 8, 'B', 2020, 'p51_5', 'low', 'M', 'yob:1990', 'possible_match', None, 'tier_below_medium'),
    ('marathon', 'full', 9, 'B', 2020, None, None, 'M', None, 'unlinked', None, 'unlinked'),
    # A row the row rule leaves out gets no key and takes no part in a screen: 11 keeps its key although 10 shares its edition.
    ('marathon', 'full', 10, 'C', 2021, 'p51_6', 'high', 'M', 'yob:1960', 'left_out', None, 'left_out_by_row_rule'),
    ('marathon', 'full', 11, 'C', 2021, 'p51_6', 'high', 'M', 'yob:1985', 'keyed', 'p51_6', None),
    # A half-only runner from a marathon list (source_db full, an id of that id space); an age-group key is no birth year.
    ('half', 'full', 500, 'C', 2021, 'p51_7', 'high_elite', 'X', 'ag:30-34', 'keyed', 'p51_7', None),
    # Two half results in one edition; the same city and year at the other distance is another edition.
    ('half', 'half', 3, 'D', 2022, 'p51_8', 'medium', 'F', None, 'possible_match', None, 'two_results_in_one_edition'),
    ('half', 'half', 4, 'D', 2022, 'p51_8', 'medium', 'F', None, 'possible_match', None, 'two_results_in_one_edition'),
    ('marathon', 'full', 12, 'D', 2022, 'p51_9', 'high', 'F', None, 'keyed', 'p51_9', None),
    ('half', 'half', 5, 'D', 2022, 'p51_9', 'high', 'F', None, 'keyed', 'p51_9', None),
    # A half row the half row rule leaves out (lead ruling D28, 2026-11-14) gets no key and takes no part in a screen:
    # the marathon of its person keeps its key although the two birth years are forty apart.
    ('half', 'half', 6, 'E', 2023, 'p51_10', 'high', 'M', 'yob:1950', 'left_out', None, 'left_out_by_row_rule'),
    ('marathon', 'full', 13, 'E', 2023, 'p51_10', 'high', 'M', 'yob:1990', 'keyed', 'p51_10', None),
    # So is an unlinked half row of a marathon list; the other row of its edition is an ordinary unlinked row.
    ('half', 'full', 501, 'E', 2023, None, None, None, None, 'left_out', None, 'left_out_by_row_rule'),
    ('half', 'full', 502, 'E', 2023, None, None, None, None, 'unlinked', None, 'unlinked'),
]
LEFT_OUT = {10}
HALF_LEFT_OUT = [('half', 6), ('full', 501)]
HALF_RULE = {'pending_review_flags': ['published_disqualified_status'], 'qa_row_flags': ['finish_zero'], 'kept_when_edition_wide': ['finish_zero']}


def tables(db):
    db.execute('CREATE TABLE lk (distance VARCHAR, source_db VARCHAR, record_id BIGINT, city VARCHAR, year BIGINT, person_id VARCHAR, confidence VARCHAR, sex VARCHAR, age_key VARCHAR)')
    db.executemany('INSERT INTO lk VALUES (?,?,?,?,?,?,?,?,?)', [row[:9] for row in LINKS])
    db.execute('CREATE TABLE written (id BIGINT)')
    db.executemany('INSERT INTO written VALUES (?)', [[row[2]] for row in LINKS if row[0] == 'marathon' and row[2] not in LEFT_OUT])
    db.execute('CREATE TABLE half_out (source_db VARCHAR, record_id BIGINT)')
    db.executemany('INSERT INTO half_out VALUES (?,?)', HALF_LEFT_OUT)


class Identity(unittest.TestCase):
    def test_the_rule_row_by_row(self):
        db = duckdb.connect()
        tables(db)
        counts = build_identity.build(db, 'lk', 'written', IDENTITY, 'half_out')
        rows = {(d, s, r): rest for d, s, r, *rest in db.execute(
            'SELECT distance, source_db, record_id, status, runner_key, not_keyed_reason, link_tier, person_id FROM identity').fetchall()}
        for distance, source_db, rid, _, _, person, tier, _, _, status, key, reason in LINKS:
            self.assertEqual(rows[(distance, source_db, rid)], [status, key, reason, tier, person], (distance, source_db, rid))
        self.assertEqual(counts['by_status'], {'half': {'keyed': 3, 'left_out': 2, 'possible_match': 3, 'unlinked': 1}, 'marathon': {'keyed': 5, 'left_out': 1, 'possible_match': 6, 'unlinked': 1}})
        self.assertEqual(counts['by_not_keyed_reason']['half'], {'left_out_by_row_rule': 2, 'sex_conflict': 1, 'two_results_in_one_edition': 2, 'unlinked': 1})
        self.assertEqual(counts['by_not_keyed_reason']['marathon'], {'birth_year_spread': 2, 'left_out_by_row_rule': 1, 'sex_conflict': 1, 'tier_below_medium': 1,
                                                                    'two_results_in_one_edition': 2, 'unlinked': 1})
        self.assertEqual(counts['screens'], {'sex_conflict': {'persons': 1, 'results': 2, 'marathon': 1, 'half': 1},
                                             'birth_year_spread': {'persons': 1, 'results': 2, 'marathon': 2, 'half': 0},
                                             'two_results_in_one_edition': {'persons': 2, 'results': 4, 'marathon': 2, 'half': 2},
                                             'any': {'persons': 4, 'results': 8, 'marathon': 5, 'half': 3}})
        self.assertEqual(counts['runner_keys'], {'all': 5, 'with_a_marathon': 4, 'with_a_half': 3, 'with_both_distances': 2, 'with_two_or_more_marathons': 1})
        self.assertEqual((counts['candidate_persons'], counts['keyed_by_link_tier']['marathon']), (9, {'high': 4, 'medium': 1}))
        # Without the half row rule the flagged half row takes part, and its person fails the birth-year screen.
        other = duckdb.connect()
        tables(other)
        build_identity.build(other, 'lk', 'written', IDENTITY)
        self.assertEqual(other.execute("SELECT status, not_keyed_reason FROM identity WHERE distance='marathon' AND record_id=13").fetchone(), ('possible_match', 'birth_year_spread'))
        # The screens of a candidate row are its person's; another row has none.
        self.assertEqual(db.execute("SELECT sex_conflict, birth_year_spread, two_results_in_one_edition FROM identity WHERE distance='marathon' AND record_id IN (3, 8, 10) ORDER BY record_id").fetchall(),
                         [(True, False, False), (None, None, None), (None, None, None)])

    def test_unreviewed_tiers_and_broken_links_stop_the_build(self):
        for change, message in (("UPDATE lk SET confidence='low' WHERE record_id=9 AND distance='marathon'", 'a tier without a link'),
                                ("UPDATE lk SET confidence='rejected' WHERE record_id=8", 'has not reviewed'),
                                ("UPDATE lk SET person_id='p4_x' WHERE record_id=8", 'another build'),
                                ("UPDATE lk SET source_db='half' WHERE record_id=12", 'outside source_db full')):
            db = duckdb.connect()
            tables(db)
            db.execute(change)
            with self.assertRaisesRegex(AssertionError, message):
                build_identity.build(db, 'lk', 'written', IDENTITY)

    def test_the_file_its_metadata_and_the_adapter_features(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.dict(adapt_combined.IDENTITY, {TAG: IDENTITY}), \
                mock.patch.dict(adapt_combined.HALF_ROW_RULE, {TAG: HALF_RULE}), mock.patch.dict(adapt_combined.REVIEWED, {TAG: {'half_left_out': 2}}):
            source = Path(folder)
            db = duckdb.connect()
            tables(db)
            (source / adapt_combined.SOURCE_DIR).mkdir()
            # The release's own flag files, in the CORE folder the adapter keeps and under its checksum list.
            core = source / adapt_combined.CORE_DIR
            core.mkdir()
            db.execute(f"""COPY (SELECT 'half' AS distance, 'half' AS source_db, 6::BIGINT AS record_id, 'E' AS city, 2023::BIGINT AS year, 'published_disqualified_status' AS flag,
                'x' AS detail, true AS present_in_core, 'pending' AS decision) TO '{core / 'pending_review_flags.parquet'}' (FORMAT parquet)""")
            # 501 carries the flag and 502, the other row of its edition, does not; a flag on a marathon row is not the half rule's.
            db.execute(f"""COPY (SELECT 'half' AS distance, 'full' AS source_db, 501::BIGINT AS record_id, 'E' AS city, 2023::BIGINT AS year, true AS finish_zero
                UNION ALL SELECT 'marathon', 'full', 13, 'E', 2023, true) TO '{core / 'qa_row_flags.parquet'}' (FORMAT parquet)""")
            link_file = source / adapt_combined.SOURCE_DIR / adapt_combined.LINKS
            db.execute(f"COPY (SELECT * FROM lk) TO '{link_file}' (FORMAT parquet)")
            db.execute(f"COPY (SELECT id FROM written ORDER BY id) TO '{source / 'race_records.parquet'}' (FORMAT parquet)")
            # The adapter's features: runner_id is the person id of a keyed tier, whatever the screens say.
            db.execute(f"""COPY (SELECT l.record_id, l.city, l.year, 'Race' AS race, CASE WHEN l.sex IN ('M', 'F') THEN l.sex END AS sex,
                CAST(nullif(regexp_extract(l.age_key, '^yob:([0-9]{{4}})$', 1), '') AS BIGINT) AS yob,
                CASE WHEN l.confidence IN ('high_elite', 'high', 'medium') THEN l.person_id END AS runner_id, l.person_id, l.confidence AS link_confidence
              FROM lk l JOIN written w ON w.id=l.record_id WHERE l.distance='marathon' ORDER BY 1) TO '{source / 'features.parquet'}' (FORMAT parquet)""")
            by_flag = {'pending_review_flags.published_disqualified_status': 1, 'qa_row_flags.finish_zero': 1}
            (source / 'MANIFEST.json').write_text(json.dumps({'half_row_rule': {'rows_left_out': 2, 'rows_left_out_by_flag': by_flag}}))
            sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()  # noqa: E731
            (core / 'SHA256SUMS.txt').write_text(''.join(f'{sha(core / name)}  {name}\n' for name in ('pending_review_flags.parquet', 'qa_row_flags.parquet')))
            (source / 'provenance.json').write_text(json.dumps({'release_tag': TAG, 'layout': 'combined', 'manifest_sha256': sha(source / 'MANIFEST.json'),
                                                               'assets': {adapt_combined.LINKS: sha(link_file)},
                                                               'core': {'sha256sums_sha256': sha(core / 'SHA256SUMS.txt')}}))
            out = source / 'out' / 'identity.parquet'
            build_identity.main(['--input', str(source), '--output', str(out)])
            self.assertEqual([c for c, *_ in db.execute(f"DESCRIBE SELECT * FROM read_parquet('{out}')").fetchall()],
                             ['source_db', 'record_id', 'distance', 'runner_key', 'status', 'link_tier', 'person_id', 'not_keyed_reason', 'sex_conflict',
                              'birth_year_spread', 'two_results_in_one_edition'])
            self.assertEqual(db.execute(f"SELECT count(*), count(DISTINCT (source_db, record_id)), count(runner_key) FROM read_parquet('{out}')").fetchone(), (22, 22, 8))
            info = json.loads(out.with_name('identity.parquet.json').read_text())
            self.assertEqual((info['release_tag'], info['file']['sha256'], info['rule'], info['identity_rule']), (TAG, sha(out), build_identity.RULE, IDENTITY))
            # The half rows left out are evaluated from the release's flag files under the frozen rule, and counted by flag.
            self.assertEqual(info['half_row_rule'], HALF_RULE)
            left = info['counts']['half_rows_left_out']
            self.assertEqual((left['left_out'], left['left_out_by_flag'], left['left_out_by_source_db'], left['kept_edition_wide']), (2, by_flag, {'full': 1, 'half': 1}, {}))
            self.assertEqual(db.execute(f"SELECT list(status ORDER BY record_id) FROM read_parquet('{out}') WHERE distance='half' AND record_id IN (6, 501, 502)").fetchone()[0],
                             ['left_out', 'left_out', 'unlinked'])
            # On the marathon rows alone person 2 has no sex conflict: its marathon keeps a key there and loses it over both distances.
            self.assertEqual({k: v for k, v in info['counts']['marathon_rows_alone'].items() if k != 'note'},
                             {'keys_passing': 5, 'records_passing': 6, 'keys_failing': 2, 'records_failing': 4, 'marathon_records_keyed_alone_and_not_over_both_distances': 1})
            # Counts that are not the ones the adapter reviewed and wrote, or a flag file that is not the pinned one, stop the build.
            with mock.patch.dict(adapt_combined.REVIEWED, {TAG: {'half_left_out': 3}}), self.assertRaisesRegex(AssertionError, 'not the ones the adapter reviewed'):
                build_identity.main(['--input', str(source), '--output', str(out)])
            flags = core / 'qa_row_flags.parquet'
            kept = flags.read_bytes()
            flags.write_bytes(kept + b' ')
            with self.assertRaisesRegex(AssertionError, 'differs from the CORE checksum list'):
                build_identity.main(['--input', str(source), '--output', str(out)])
            flags.write_bytes(kept)
            stored = {k.decode(): v.decode() for k, v in db.execute(f"SELECT key, value FROM parquet_kv_metadata('{out}')").fetchall()}
            self.assertEqual(json.loads(stored['rule']), build_identity.RULE)
            # A link file that is not the pinned one, or features that disagree with the links, stop the build.
            db.execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=1 THEN 'p51_other' ELSE runner_id END AS runner_id) FROM read_parquet('{source / 'features.parquet'}')) "
                       f"TO '{source / 'f.parquet'}' (FORMAT parquet)")
            (source / 'f.parquet').replace(source / 'features.parquet')
            with self.assertRaisesRegex(AssertionError, 'differs from the adapter’s features'):
                build_identity.main(['--input', str(source), '--output', str(out)])
            link_file.write_bytes(link_file.read_bytes() + b' ')
            with self.assertRaisesRegex(AssertionError, 'not the pinned one'):
                build_identity.main(['--input', str(source), '--output', str(out)])


if __name__ == '__main__':
    unittest.main()
