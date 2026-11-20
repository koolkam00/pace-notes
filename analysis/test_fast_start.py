import unittest

import numpy as np

from build_fast_start import (
    AGE, BAND, CITY, EDITION, FINISH, GENDER, ONSET, OPENING, PRIOR, REMAINDER,
    WIDTH, AGE_BANDS, age_code, aggregate, gender_code, observation,
    opening_band, opening_band_for_times, prior_code, recent_benchmarks, summarize_group,
)


def race(record_id, edition, finish=12658.5, eligible=True, age=30, sex='M'):
    return dict(id=record_id, edition=edition, eligible=eligible, age=age, sex=sex,
                times=[finish*point/42.195 for point in (5, 10, 15, 20, 25, 30, 35, 40, 42.195)])


class FastStartTests(unittest.TestCase):
    def test_fixed_opening_boundaries(self):
        cases = [(-10-1e-9, 0), (-10, 1), (-10+1e-9, 1),
                 (-5-1e-9, 1), (-5, 2), (-5+1e-9, 2),
                 (-2-1e-9, 2), (-2, 3), (-2+1e-9, 3),
                 (2-1e-9, 3), (2, 3), (2+1e-9, 4),
                 (5-1e-9, 4), (5, 4), (5+1e-9, 5)]
        for value, expected in cases:
            self.assertEqual(opening_band(value), expected, value)
        with self.assertRaises(ValueError):
            opening_band(float('nan'))

    def test_benchmark_excludes_same_year_old_year_and_ineligible(self):
        editions = [dict(year=2019), dict(year=2020), dict(year=2021), dict(year=2022)]
        races = [race(1, 0, 9000), race(2, 1, 12000), race(3, 2, 13000),
                 race(4, 2, 10000, eligible=False), race(5, 3, 11000), race(6, 3, 10000)]
        actual = {r['id']: benchmark for r, benchmark in recent_benchmarks(races, editions)}
        self.assertEqual(actual, {2: 9000, 3: 9000, 5: 12000, 6: 12000})
        self.assertEqual(list(recent_benchmarks([race(7, 2), race(8, 2)], editions)), [])

    def test_decimal_timing_boundaries_do_not_drift_across_bands(self):
        # Earlier best is exactly 300 seconds/km. Exact 5% faster must be in
        # fast2 despite the ordinary binary percentage falling below −5.
        for elapsed, expected in [(2700, 1), (2850, 2), (2940, 3), (3060, 3), (3150, 4)]:
            self.assertEqual(opening_band_for_times(elapsed, 12658.5), expected)
            recorded = race(1, 0)
            recorded['times'][1] = elapsed
            self.assertEqual(observation(recorded, 12658.5, 1)[BAND], expected)
        self.assertEqual(opening_band_for_times(2850-1e-6, 12658.5), 1)
        self.assertEqual(opening_band_for_times(2850+1e-6, 12658.5), 2)

    def test_unknown_demographics_and_prior_boundaries(self):
        for value in [None, 17, 30.5, 90, float('nan')]:
            self.assertEqual(age_code(value), 0)
        for value, band in [(18, '18–24'), (24, '18–24'), (25, '25–29'), (89, '85–89')]:
            self.assertEqual(AGE_BANDS[age_code(value)], band)
        self.assertEqual([gender_code(x) for x in [None, ' X ', ' woman ', 'Male']], [0, 0, 2, 1])
        self.assertEqual([prior_code(x) for x in [10799, 10800, 12599, 12600, 14399, 14400]], [1, 2, 2, 3, 3, 4])

    def test_slowdown_exact_boundary_and_final_short_section(self):
        base = race(1, 0)
        # 300 seconds/km baseline. Only the final 2.195 km slows by 25%.
        base['times'][-1] = 12000+2.195*375
        self.assertEqual(observation(base, 12658.5, 1)[ONSET], -1)
        for section, expected in [(4, 20), (5, 25), (6, 30), (7, 35)]:
            changed = race(1, 0)
            for i in range(section, 9):
                changed['times'][i] += 375
            self.assertEqual(observation(changed, 12658.5, 1)[ONSET], expected)
        below = race(1, 0)
        for i in range(4, 9):
            below['times'][i] += 375-1e-5
        self.assertEqual(observation(below, 12658.5, 1)[ONSET], -1)

    def test_additive_time_accounting_uses_same_prior_reference(self):
        row = race(1, 0, 14000)
        row['times'][0] -= 100
        row['times'][1] -= 200
        observed = observation(row, 14400, 1)
        self.assertAlmostEqual(observed[FINISH], -400)
        self.assertAlmostEqual(observed[OPENING]+observed[REMAINDER], observed[FINISH])
        self.assertLess(observed[OPENING], 0)

    def test_legal_section_pace_boundaries_survive_decimal_subtraction(self):
        # At 40 km the runner has elapsed 12,000 seconds. Finishing in 12,263.4
        # makes the final 2.195 km exactly 120 seconds/km; binary subtraction
        # can instead produce 119.99999999999982 and must not reject the race.
        for final_pace in (120, 1200):
            recorded = race(1, 0)
            recorded['times'][-1] = 12000+2.195*final_pace
            self.assertEqual(len(observation(recorded, 12658.5, 1)), WIDTH)
        # This is rounding tolerance only, not a change to the eligible range.
        for final_pace in (120-1e-6, 1200+1e-6):
            recorded = race(1, 0)
            recorded['times'][-1] = 12000+2.195*final_pace
            with self.assertRaisesRegex(ValueError, 'section pace bounds'):
                observation(recorded, 12658.5, 1)

    def test_group_quantiles_onset_threshold_and_additivity(self):
        data = np.zeros((100, WIDTH))
        data[:, EDITION] = np.arange(100) % 3
        data[:, FINISH] = np.arange(100)
        data[:, OPENING] = -10
        data[:, REMAINDER] = np.arange(100)+10
        data[:, ONSET] = 25
        grouped = summarize_group(data, 3)
        self.assertEqual(grouped['n'], 100)
        self.assertEqual(grouped['editions'], 3)
        self.assertEqual(grouped['finish_delta_p10_s'], 9.9)
        self.assertEqual(grouped['finish_delta_median_s'], 49.5)
        self.assertEqual(grouped['finish_delta_p90_s'], 89.1)
        self.assertEqual(grouped['onset'], [0, 100, 0, 0])
        self.assertEqual(grouped['finish_delta_mean_s'], grouped['opening_delta_mean_s']+grouped['remainder_delta_mean_s'])
        data[0, ONSET] = -1
        self.assertIsNone(summarize_group(data, 3)['onset'])
        self.assertEqual(summarize_group(data, 3)['slowdown_n'], 99)
        self.assertIsNone(summarize_group(data[:99], 3))

    def test_rollups_include_unknowns_without_fabricating_subgroups(self):
        data = np.zeros((101, WIDTH))
        data[:, CITY] = 1
        data[:, BAND] = 3
        data[:, PRIOR] = 3
        data[:, ONSET] = -1
        data[:100, AGE] = age_code(30)
        data[:100, GENDER] = 1
        rows = aggregate(data, ['All courses', 'Example'])
        keyed = {(r['city'], r['age'], r['gender'], r['prior']): r for r in rows}
        self.assertEqual(keyed[('All courses', 'all', 'all', 'all')]['groups'][0]['n'], 101)
        self.assertEqual(keyed[('Example', '30–34', 'Men', '330to4')]['groups'][0]['n'], 100)
        self.assertFalse(any(r['gender'] == 'Women' or r['age'] == '25–29' for r in rows))


class CohortReaderTest(unittest.TestCase):
    """read_observations on a small marathon cohort (since November 19, 2026), with the high-links-only variant (D38)."""

    def test_history_and_high_links_only(self):
        import json, tempfile
        from contextlib import redirect_stdout
        from io import StringIO
        from pathlib import Path
        import cohort as marathon_cohort
        from build_fast_start import digest, read_observations
        times = lambda finish: race(0, 0, finish)['times']  # noqa: E731
        # Runner 1 (records 1, 3, 5): high links in 2019 and 2020, a medium link in 2021. Runner 2 (2, 4): medium links.
        rows = {2019: [(1, 1, 'M', 30, times(12000), 'h'), (2, 2, 'F', 40, times(14000), 'm')],
                2020: [(3, 1, 'M', 31, times(12100), 'h'), (4, 2, 'F', 41, times(14100), 'm')],
                2021: [(5, 1, 'M', 32, times(12200), 'm'), (6, 0, None, None, times(13000), None)]}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'editions').mkdir()
            editions = []
            for year, records in rows.items():
                data = marathon_cohort.encode_edition('Example', year, 'counted', records, [])
                name = marathon_cohort.file_name('example', year)
                (root/name).write_bytes(data)
                editions.append(dict(city='Example', year=year, race='Example Marathon', use='counted', raw=2, timing_eligible=2,
                                     eligible=2, other=0, file=name, bytes=len(data), sha256=digest(data)))
            manifest = dict(schema_version=2, as_of='2026-11-19T00:00:00Z', editions=editions, eligible_records=6,
                            linkage=dict(recent_benchmark_finishes=3, high_links=dict(recent_benchmark_finishes=1)))
            (root/'manifest.json').write_text(json.dumps(manifest))
            with redirect_stdout(StringIO()):
                every, cities = read_observations(root, manifest)
                high, _ = read_observations(root, manifest, high_only=True)
            self.assertEqual(cities, ['All courses', 'Example'])
            self.assertEqual(sorted(every[:, FINISH].tolist()), [100.0, 100.0, 200.0])   # 3 v 1, 4 v 2, 5 v the best of 2019-2020 (1)
            self.assertEqual(high[:, FINISH].tolist(), [100.0])                                   # 3 v 1 only
            manifest['linkage']['high_links']['recent_benchmark_finishes'] = 2
            with self.assertRaisesRegex(ValueError, 'Earlier-benchmark cohort mismatch'), redirect_stdout(StringIO()):
                read_observations(root, manifest, high_only=True)


if __name__ == '__main__':
    unittest.main()
