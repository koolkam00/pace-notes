"""analysis/build_record_status.py on a small input: every status and reason code, and the tie to the cohort."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_record_status  # noqa: E402
import source_quality  # noqa: E402
from build_pacing import FIELDS, prepare  # noqa: E402

TAG = 'pace-notes-marathon-half-20990101-0000'
RULES = [('Own', 2021, 'unverified', 'Unverified.'), ('Own', 2022, 'partial_coverage', 'Partial, outside the band.'),
         ('Screened', 2021, 'unverified', 'Unverified.'), ('Held', 2020, 'held_for_review', 'Held.'), ('Fto', 2019, 'finish_time_only', 'Finish times only.'),
         ('Exc', 2018, 'selected_field', 'A selected field.'), ('Grid', 2017, 'invalid_split_grid', 'No usable grid.')]
OWN = frozenset({('Own', 2021), ('Own', 2022)})
GOOD = ['0:25:00', '0:50:00', '1:15:00', '1:40:00', '2:05:00', '2:30:00', '2:55:00', '3:20:00', '3:30:58.5']
# id, city, year, runner, the nine times (None = the standard grid), then the expected status, reason, timing and edition use.
RECORDS = [
    (1, 'Good', 2020, 'A', None, 'counted', None, 'eligible', 'counted'),
    (2, 'Good', 2020, 'A', None, 'limited', 'duplicate', 'duplicate', 'counted'),
    (3, 'Good', 2020, 'C', GOOD[:2] + [None] + GOOD[3:], 'limited', 'missing_checkpoints', 'missing_checkpoints', 'counted'),
    (4, 'Good', 2020, 'D', GOOD[:2] + ['1:45:00'] + GOOD[3:], 'limited', 'times_out_of_order', 'times_out_of_order', 'counted'),
    (5, 'Good', 2020, 'E', ['1:30:00', '3:00:00', '4:30:00', '6:00:00', '7:30:00', '9:00:00', '10:30:00', '12:00:00', '12:40:00'], 'limited', 'outside_bounds', 'outside_bounds', 'counted'),
    (6, 'Own', 2021, 'F', None, 'own_record', None, 'eligible', 'own_record'),
    (7, 'Own', 2021, 'G', GOOD[:4] + [None] + GOOD[5:], 'limited', 'missing_checkpoints', 'missing_checkpoints', 'own_record'),
    (8, 'Own', 2022, 'H', None, 'own_record', None, 'eligible', 'own_record'),
    (9, 'Screened', 2021, 'I', None, 'limited', 'invalid_split_grid', 'eligible', 'recorded_times_only'),
    (10, 'Held', 2020, 'J', None, 'limited', 'held_for_review', 'eligible', 'recorded_times_only'),
    (11, 'Held', 2020, 'K', [None] * 8 + GOOD[8:], 'limited', 'held_for_review', 'missing_checkpoints', 'recorded_times_only'),
    (12, 'Fto', 2019, 'L', [None] * 8 + GOOD[8:], 'limited', 'finish_time_only', 'missing_checkpoints', 'recorded_times_only'),
    (13, 'Exc', 2018, 'M', None, 'limited', 'reviewed_exception', 'eligible', 'recorded_times_only'),
    (14, 'Grid', 2017, 'N', None, 'limited', 'invalid_split_grid', 'eligible', 'recorded_times_only'),
]


def write_input(folder):
    db = duckdb.connect()
    columns = ','.join(f'"{field}" VARCHAR' for field in FIELDS)
    db.execute(f'CREATE TABLE fixture (id BIGINT,race VARCHAR,year INTEGER,city VARCHAR,runner VARCHAR,sex VARCHAR,age DOUBLE,age_group VARCHAR,age_or_group VARCHAR,{columns})')
    rows = [[rid, city + ' Marathon', year, city, runner, 'F', 35, '35-39', '35'] + (times or GOOD) for rid, city, year, runner, times, *_ in RECORDS]
    db.executemany('INSERT INTO fixture VALUES (' + ','.join('?' for _ in rows[0]) + ')', rows)
    db.execute('COPY fixture TO ? (FORMAT PARQUET)', [str(folder / 'race_records.parquet')])
    (folder / 'provenance.json').write_text(json.dumps({'release_tag': TAG, 'manifest_sha256': 'a' * 64}))


class RecordStatus(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.source = Path(self.tmp.name)
        write_input(self.source)
        for patcher in (mock.patch.dict(source_quality.REVIEWED_POLICIES, {TAG: RULES}), mock.patch.dict(source_quality.OWN_RECORD, {TAG: OWN})):
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def test_every_status_and_reason(self):
        db = duckdb.connect()
        cohort, policy, counts = build_record_status.build(db, self.source)
        rows = {r[0]: r[1:] for r in db.execute('SELECT record_id, city, year, status, reason, timing, edition_use, edition_category, duplicate_of FROM record_status').fetchall()}
        for rid, city, year, _, _, status, reason, timing, use in RECORDS:
            self.assertEqual(rows[rid][:6], (city, year, status, reason, timing, use), rid)
        self.assertEqual((rows[2][7], rows[1][7], rows[1][6], rows[9][6]), (1, None, None, 'unverified'))
        self.assertEqual(counts['by_status'], {'counted': 1, 'limited': 11, 'own_record': 2})
        self.assertEqual(counts['by_reason'], {'duplicate': 1, 'finish_time_only': 1, 'held_for_review': 2, 'invalid_split_grid': 2, 'missing_checkpoints': 2,
                                               'outside_bounds': 1, 'reviewed_exception': 1, 'times_out_of_order': 1})
        self.assertEqual(counts['editions_by_use'], {'counted': 1, 'own_record': 2, 'recorded_times_only': 5})
        self.assertEqual((policy['version'], policy['release_tag']), (2, TAG))
        # The tie to the cohort: `counted` is the eligible cohort of the pipeline's own prepare(), run again here without ids.
        again = prepare(duckdb.connect(), self.source)
        self.assertEqual(again, cohort)
        self.assertEqual((counts['by_status']['counted'], counts['records']), (again['eligible'], again['raw']))
        self.assertEqual(db.execute("SELECT list(record_id ORDER BY record_id) FROM record_status WHERE status='counted'").fetchone()[0],
                         db.execute('SELECT list(rid ORDER BY rid) FROM eligible').fetchone()[0])

    def test_the_file_and_its_metadata(self):
        out = self.source / 'out' / 'record-status.parquet'
        build_record_status.main(['--input', str(self.source), '--output', str(out)])
        db = duckdb.connect()
        location = str(out).replace("'", "''")
        self.assertEqual([c for c, *_ in db.execute(f"DESCRIBE SELECT * FROM read_parquet('{location}')").fetchall()],
                         ['record_id', 'city', 'year', 'status', 'reason', 'timing', 'edition_use', 'edition_category', 'duplicate_of'])
        self.assertEqual(db.execute(f"SELECT list(record_id) FROM read_parquet('{location}')").fetchone()[0], list(range(1, 15)))
        info = json.loads(out.with_name('record-status.parquet.json').read_text())
        self.assertEqual((info['release_tag'], info['counts']['by_status']['counted'], info['cohort']['eligible'], info['file']['sha256']),
                         (TAG, 1, 1, build_record_status.digest(out)))
        stored = {k.decode(): v.decode() for k, v in db.execute(f"SELECT key, value FROM parquet_kv_metadata('{location}')").fetchall()}
        self.assertEqual((json.loads(stored['release_tag']), json.loads(stored['counts'])), (TAG, info['counts']))

    def test_a_status_that_disagrees_with_the_cohort_stops_the_build(self):
        # A changed duplicate rule would give other groups than prepare's: the builder refuses to write a second opinion.
        with mock.patch.object(build_record_status, 'SAME_RECORD', ['race', 'year', 'city']):
            with self.assertRaisesRegex(AssertionError, 'duplicate groups differ'):
                build_record_status.build(duckdb.connect(), self.source)


if __name__ == '__main__':
    unittest.main()
