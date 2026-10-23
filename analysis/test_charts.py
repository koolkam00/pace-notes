"""Tests for the Top 100 charts (charts_*.py, build_charts.py). NumPy and the standard library only."""
import json
from pathlib import Path
import unittest

import numpy as np

import build_charts
import charts_common
from charts_common import ChartCohort, edition_ranks, require_cell, sh, share
from insights_data import Finishes

ROOT = Path(__file__).resolve().parents[1]
CITIES = ['Amsterdam', 'Berlin', 'Boston', 'Chicago', 'Copenhagen', 'Eindhoven', 'Gold Coast', 'Hamburg', 'London', 'Madrid', 'New York',
          'Oslo', 'Paris', 'Rotterdam', 'Valencia', 'Warsaw', 'Washington']


def synthetic(n_per_edition=600, years=(2006, 2013, 2016, 2019, 2021, 2023, 2025, 2026), seed=7):
    """A cohort with real city names and plausible splits: a base pace, a later fade for some finishes, recorded gender
    and age, and linked records that run more than one edition."""
    rng = np.random.default_rng(seed)
    editions = [dict(city=c, year=y, race=f'{c} Marathon') for c in CITIES for y in years]
    rows = []
    for e in range(len(editions)):
        base = rng.normal(330, 55, n_per_edition).clip(190, 640)
        fade = rng.gamma(1.4, 0.06, n_per_edition)
        for i in range(n_per_edition):
            ramp = np.array([0, 0, 0, 0, .3, .6, 1, 1.4, 1.2]) * fade[i]
            paces = base[i] * (1 + ramp) * rng.normal(1, 0.015, 9)
            paces[0] *= 1.02
            rows.append((e, paces))
    lengths = np.diff([0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195])
    times = np.cumsum(np.array([p for _, p in rows]) * lengths, axis=1)
    n = len(rows)
    edition = np.array([e for e, _ in rows])
    gender = rng.choice([0, 1, 2], n, p=[.02, .64, .34]).astype(np.uint8)
    ages = rng.integers(18, 80, n).astype(float)
    age = np.where(ages < 25, 1, (ages // 5) - 3).astype(np.uint8)
    profile = rng.integers(1, n // 2, n).astype(np.uint64)
    f = Finishes(times, edition, gender, age, ages, profile, editions)
    f.raw_by_edition = np.bincount(edition, minlength=len(editions))
    weather = dict(editions=[dict(city=e['city'], year=e['year'], date=f"{e['year']}-10-{1 + k % 28:02d}", temp_c=float(rng.uniform(5, 22)), dewpoint_c=float(rng.uniform(0, 15)),
                                  wind_mps=float(rng.uniform(1, 6)), warming_c=float(rng.uniform(0, 6))) for k, e in enumerate(editions)])
    return ChartCohort(f, dict(editions=editions), 'test', weather=weather, geometry=None)


class Helpers(unittest.TestCase):
    def test_edition_ranks_run_from_zero_to_one_within_each_edition(self):
        values = np.array([5., 1., 3., 9., 2.])
        edition = np.array([0, 0, 0, 1, 1])
        self.assertEqual(edition_ranks(values, edition).tolist(), [1.0, 0.0, 0.5, 1.0, 0.0])

    def test_ties_keep_shard_order(self):
        self.assertEqual(edition_ranks(np.array([2., 2., 2.]), np.array([0, 0, 0])).tolist(), [0.0, 0.5, 1.0])

    def test_share_and_threshold(self):
        s, d = share(np.array([True, False, True, True]), np.array([True, True, False, True]))
        self.assertEqual((s, d), (2 / 3, 3))
        self.assertEqual(require_cell(100, 'x'), 100)
        with self.assertRaises(ValueError):
            require_cell(99, 'x')

    def test_shares_keep_ten_digits(self):
        self.assertEqual(sh(13377 / 44224), round(13377 / 44224, 10))

    def test_check_refuses_small_groups_identity_keys_and_numpy_values(self):
        with self.assertRaises(ValueError):
            build_charts.check(dict(rows=[dict(n=99)]), 'x')
        with self.assertRaises(ValueError):
            build_charts.check(dict(name='A Runner'), 'x')
        with self.assertRaises(ValueError):
            build_charts.check(dict(v=np.float64(1.0)), 'x')
        with self.assertRaises(ValueError):
            build_charts.check(dict(v=float('nan')), 'x')
        build_charts.check(dict(rows=[dict(n=100, v=0.5)]), 'x')


class Catalog(unittest.TestCase):
    def test_every_catalog_chart_has_a_builder_and_nothing_else_does(self):
        items = build_charts.catalog()
        modules = sorted({c['module'] for c in items})
        built = {}
        for name in modules:
            module = __import__(name)
            for slug in module.CHARTS:
                self.assertNotIn(slug, built, f'{slug} is built by two modules')
                built[slug] = name
        self.assertEqual(sorted(built), sorted(c['slug'] for c in items))
        for c in items:
            self.assertEqual(built[c['slug']], c['module'])

    def test_every_charts_module_is_in_the_catalog(self):
        modules = {c['module'] for c in build_charts.catalog()}
        on_disk = {p.stem for p in Path(__file__).parent.glob('charts_*.py')} - {'charts_common'}
        self.assertEqual(on_disk, modules)


class Builders(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cohort = synthetic()

    def test_every_builder_runs_on_a_synthetic_cohort_or_refuses_a_small_group(self):
        """Each builder returns a valid result, or stops on the 100-finish threshold (the synthetic fields are small)."""
        for item in build_charts.catalog():
            with self.subTest(chart=item['slug']):
                try:
                    result = build_charts.build_one(item, self.cohort)
                except ValueError as error:
                    self.assertRegex(str(error), r'threshold|under|fewer|at least|too few|no ', f"{item['slug']}: {error}")
                    continue
                json.dumps(result, allow_nan=False)
                self.assertIn(result['plot']['form'], build_charts.FORMS)


if __name__ == '__main__':
    unittest.main()
