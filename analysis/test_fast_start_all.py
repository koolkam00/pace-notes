import unittest
from contextlib import redirect_stdout
from decimal import Decimal
from io import StringIO
import json
from pathlib import Path
import tempfile

import numpy as np

from build_fast_start import BAND, EDITION, FINISH, ONSET, OPENING, PRIOR, REMAINDER, digest
from build_fast_start_all import (
    ACTUAL_FINISH, WIDTH, aggregate, observation, opening_band_for_times,
    profile_observations, read_observations, summarize_group,
)


def race(record_id=1, eligible=True, opening_pace=300, baseline=300, age=30, sex='M'):
    first = 5*opening_pace
    times = [first, *[first+(point-5)*baseline for point in (10, 15, 20, 25, 30, 35, 40, 42.195)]]
    return dict(id=record_id, edition=0, eligible=eligible, age=age, sex=sex, times=times)


class AllFinishersFastStartTests(unittest.TestCase):
    def test_single_race_requires_no_earlier_history(self):
        recorded = race()
        rows = list(profile_observations([recorded, race(2, eligible=False)], [1]))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][PRIOR], 0)
        self.assertEqual(rows[0][ACTUAL_FINISH], recorded['times'][-1])
        self.assertEqual(rows[0][BAND], 3)
        with self.assertRaisesRegex(ValueError, 'Only eligible'):
            observation(race(eligible=False), 1)

    # The reader reads the marathon cohort since November 19, 2026 (the runner profile shards before).
    @staticmethod
    def cohort(root, records):
        """A cohort folder with one counted edition holding `records` (id, runner or 0, sex, age, times, link) and one
        other record, and an own-record edition that must not supply a finish."""
        import cohort as marathon_cohort
        (root/'editions').mkdir()
        editions = []
        for city, year, use, rows, others in [('Example', 2020, 'counted', records, [(99, 'missing_checkpoints', None)]),
                                              ('Other', 2021, 'own_record', [(50, 0, 'F', 40, race()['times'], None)], [])]:
            data = marathon_cohort.encode_edition(city, year, use, rows, others)
            name = marathon_cohort.file_name(city.lower(), year)
            (root/name).write_bytes(data)
            editions.append(dict(city=city, year=year, race=f'{city} Marathon', use=use, raw=len(rows)+len(others),
                                 timing_eligible=len(rows), eligible=len(rows) if use == 'counted' else 0, other=len(others),
                                 file=name, bytes=len(data), sha256=digest(data)))
        manifest = dict(schema_version=2, as_of='2026-11-19T00:00:00Z', release_tag='example', editions=editions,
                        eligible_records=len(records), linkage={'recent_benchmark_finishes': 0})
        (root/'manifest.json').write_text(json.dumps(manifest))
        return manifest

    def test_full_reader_keeps_history_free_finishes_and_checks_source_integrity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.cohort(root, [(1, 0, 'M', 30, race()['times'], None), (2, 2, 'F', None, race()['times'], 'm')])
            with redirect_stdout(StringIO()):
                values, cities = read_observations(root, manifest)
            self.assertEqual(len(values), 2)
            self.assertEqual(cities, ['All courses', 'Example'])
            self.assertEqual(list(values[:, PRIOR]), [0, 0])
            manifest['eligible_records'] = 1
            with self.assertRaisesRegex(ValueError, 'Eligible record count'):
                read_observations(root, manifest)
            manifest['eligible_records'] = 2
            file = root/'editions/example-2020.json.gz'
            file.write_bytes(file.read_bytes()+b'corrupt')
            with self.assertRaisesRegex(AssertionError, 'size or checksum differs'):
                read_observations(root, manifest)

    def test_duplicate_raw_ids_block_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.cohort(root, [(1, 0, 'M', 30, race()['times'], None)])
            manifest['editions'].append(dict(manifest['editions'][0]))   # the same records twice
            manifest['eligible_records'] = 2
            (root/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'Duplicate or invalid record IDs'):
                read_observations(root, manifest)

    def test_decimal_boundaries_use_original_time_subtraction(self):
        # First test the five exact boundaries against a 4,500 s baseline.
        # Decimal values then expose binary subtraction at the −5% boundary.
        for opening, expected in [(1350, 1), (1425, 2), (1470, 3), (1530, 3), (1575, 4)]:
            self.assertEqual(opening_band_for_times(opening, opening+4500), expected)
        for opening, at_boundary, just_below, just_above in [
            ('1350.18', 1, 0, 1), ('1425.19', 2, 1, 2), ('1470.196', 3, 2, 3),
            ('1530.204', 3, 3, 4), ('1575.21', 4, 4, 5),
        ]:
            exact = Decimal(opening)
            for delta, expected in [(Decimal(0), at_boundary),
                                    (Decimal('-.000001'), just_below),
                                    (Decimal('.000001'), just_above)]:
                first = exact+delta
                self.assertEqual(opening_band_for_times(str(first), str(first+Decimal('4500.6'))), expected)
        for first, at20 in [('nan', '6000'), ('1500', 'Infinity'), (0, 6000), (6000, 6000)]:
            with self.assertRaises(ValueError):
                opening_band_for_times(first, at20)

    def test_later_outcomes_cannot_change_opening_group(self):
        regular, slowing = race(opening_pace=265), race(opening_pace=265)
        for i in range(4, 9):
            slowing['times'][i] += 500*(i-3)
        first, second = observation(regular, 1), observation(slowing, 1)
        self.assertEqual(first[BAND], 0)
        self.assertEqual(first[BAND], second[BAND])
        self.assertEqual(first[OPENING], second[OPENING])
        self.assertGreater(second[REMAINDER], first[REMAINDER])
        self.assertGreater(second[ACTUAL_FINISH], first[ACTUAL_FINISH])

    def test_same_race_reference_and_signed_accounting(self):
        recorded = race(opening_pace=270)
        for i in range(4, 9):
            recorded['times'][i] += 600
        row = observation(recorded, 1)
        self.assertAlmostEqual(row[OPENING], -150)
        self.assertAlmostEqual(row[REMAINDER], 600)
        self.assertAlmostEqual(row[FINISH], 450)
        self.assertAlmostEqual(row[FINISH], row[OPENING]+row[REMAINDER])
        self.assertAlmostEqual(row[11], -10)
        self.assertAlmostEqual(row[12], 0)

    def test_slowdown_sections_and_short_final_interval(self):
        recorded = race()
        recorded['times'][-1] += 2.195*75
        self.assertEqual(observation(recorded, 1)[ONSET], -1)
        for section, expected in [(4, 20), (5, 25), (6, 30), (7, 35)]:
            recorded = race()
            for i in range(section, 9):
                recorded['times'][i] += 375
            self.assertEqual(observation(recorded, 1)[ONSET], expected)
        recorded = race()
        for i in range(4, 9):
            recorded['times'][i] += 375-1e-5
        self.assertEqual(observation(recorded, 1)[ONSET], -1)

    def test_rejects_incomplete_or_invalid_timings(self):
        for invalid in ([1500, 3000], [1500, 3000, 4500, None, 7500, 9000, 10500, 12000, 12658.5],
                        [1500, 3000, 4500, 4500, 7500, 9000, 10500, 12000, 12658.5]):
            recorded = race()
            recorded['times'] = invalid
            with self.assertRaises(ValueError):
                observation(recorded, 1)
        # Exact legal final-section bounds survive ordinary decimal subtraction.
        for pace in (120, 1200):
            recorded = race()
            recorded['times'][-1] = 12000+2.195*pace
            self.assertEqual(len(observation(recorded, 1)), WIDTH)

    def test_group_outcome_quantiles_and_sparse_onset(self):
        values = np.zeros((100, WIDTH))
        values[:, EDITION] = np.arange(100) % 3
        values[:, OPENING] = -10
        values[:, REMAINDER] = np.arange(100)
        values[:, FINISH] = np.arange(100)-10
        values[:, ACTUAL_FINISH] = np.arange(100)+12000
        values[:, ONSET] = 25
        group = summarize_group(values, 3)
        self.assertEqual(group['after20_delta_p10_s'], 9.9)
        self.assertEqual(group['after20_delta_median_s'], 49.5)
        self.assertEqual(group['after20_delta_p90_s'], 89.1)
        self.assertEqual(group['actual_finish_median_s'], 12049.5)
        self.assertEqual(len(group['pace_pct']), 9)
        self.assertEqual(group['onset'], [0, 100, 0, 0])
        values[0, ONSET] = -1
        self.assertIsNone(summarize_group(values, 3)['onset'])
        self.assertEqual(summarize_group(values, 3)['slowdown_n'], 99)
        self.assertIsNone(summarize_group(values[:99], 3))

    def test_rollups_retain_unknowns_without_history_or_invented_demographics(self):
        data = np.array([observation(race(record_id=i), 1) for i in range(100)]
                        + [observation(race(record_id=100, age=None, sex=None), 1)])
        rows = aggregate(data, ['All courses', 'Example'])
        keyed = {(row['city'], row['age'], row['gender'], row['prior']): row for row in rows}
        self.assertEqual(keyed[('All courses', 'all', 'all', 'all')]['groups'][0]['n'], 101)
        self.assertEqual(keyed[('Example', '30–34', 'Men', 'all')]['groups'][0]['n'], 100)
        self.assertTrue(all(row['prior'] == 'all' for row in rows))
        self.assertFalse(any(row['gender'] == 'Women' or row['age'] == '25–29' for row in rows))


if __name__ == '__main__':
    unittest.main()
