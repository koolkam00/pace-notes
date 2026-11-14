"""Tests for the Top 100 charts (charts_*.py, build_charts.py). NumPy and the standard library only."""
import ast
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import numpy as np

import build_charts
import charts_common
import insights_data
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

    def test_ties_keep_cohort_order(self):
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


class RaceDates(unittest.TestCase):
    def test_an_undated_edition_passes_only_without_linked_records(self):
        """November 4, 2026: New York 2026 has no weather row; its finishes are each their record's only one."""
        from types import SimpleNamespace
        c = SimpleNamespace(ed_n=np.array([2, 2, 0]), edition=np.array([0, 0, 1, 1]), profile=np.array([7, 8, 9, 10]))
        charts_common.require_race_dates(c, np.array([False, True, True]))
        c.profile = np.array([7, 9, 9, 10])
        with self.assertRaisesRegex(ValueError, 'no race date'):
            charts_common.require_race_dates(c, np.array([False, True, False]))
        charts_common.require_race_dates(c, np.array([False, False, True]))


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


class Binding(unittest.TestCase):
    """What the family's manifest binds (changed 2026-11-14: the charts read the marathon cohort, analysis/cohort.py,
    not the runner lookup's shards)."""

    def test_the_manifest_binds_the_cohort_its_policy_and_the_scripts(self):
        cohort = synthetic()
        f = cohort.f
        source = dict(release_tag='example', input_as_of='2026-01-01T00:00:00Z', as_of='2026-01-02T00:00:00Z', editions=f.editions,
                      scripts={'cohort.py': 'a' * 64, 'source_quality.py': 'b' * 64},
                      source_quality=dict(version=2, release_tag='example', policy_sha256='c' * 64, editions_sha256='d' * 64, counts=dict(editions=3)))
        weather = dict(input=dict(release_tag='example-weather'), editions=cohort.weather['editions'])
        items = []
        for item in build_charts.catalog():          # two charts that build on the small synthetic cohort
            try:
                build_charts.build_one(item, cohort)
            except ValueError:
                continue
            items.append(item)
            if len(items) == 2:
                break
        self.assertEqual(len(items), 2)
        with tempfile.TemporaryDirectory() as out, mock.patch.multiple(
                build_charts, load_cohort=lambda cache=None: ({'tag': 'example'}, f, source, 'e' * 64), load_weather=lambda: weather,
                load_geometry=lambda: None, catalog=lambda: items):
            build_charts.run(out)
            manifest = json.loads((Path(out) / 'manifest.json').read_text())
            files = {p.name: p.read_bytes() for p in Path(out).glob('*.json') if p.name != 'manifest.json'}
        # The cohort: the SHA-256 of its manifest and its timestamps, under the names the fields had for the lookup.
        self.assertEqual((manifest['runner_manifest_sha256'], manifest['runner_manifest_as_of'], manifest['input_as_of'], manifest['release_tag']),
                         ('e' * 64, source['as_of'], source['input_as_of'], 'example'))
        # The edition policy and the scripts the cohort states, unchanged.
        self.assertEqual(manifest['source_quality'], source['source_quality'])
        self.assertEqual(manifest['source_scripts'], source['scripts'])
        # Every calculation script of the family, by the digest of the file in the checkout.
        here = Path(build_charts.__file__).resolve().parent
        expected = {p.name for p in here.glob('charts_*.py')} | {'build_charts.py', 'build_insights.py', 'insights_data.py', 'insights_stats.py', 'build_fast_start.py'}
        self.assertEqual(set(manifest['scripts']), expected)
        for name, digest in manifest['scripts'].items():
            self.assertEqual(digest, hashlib.sha256((here / name).read_bytes()).hexdigest(), name)
        # The chart files: each names the same cohort, and the manifest lists exactly them with their bytes.
        self.assertEqual(sorted(manifest['files']), sorted(f"{c['slug']}.json" for c in items))
        for name, data in files.items():
            self.assertEqual(manifest['files'][name], dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
            self.assertEqual(json.loads(data)['runner_manifest_sha256'], 'e' * 64)
        self.assertEqual(manifest['weather']['release_tag'], 'example-weather')

    def test_a_refusing_builder_stops_the_build_and_names_its_chart(self):
        """A chart under a builder floor is never written on a lowered floor: the build stops and says which chart."""
        cohort = synthetic()
        refusing = None
        for item in build_charts.catalog():
            try:
                build_charts.build_one(item, cohort)
            except ValueError:
                refusing = item
                break
        self.assertIsNotNone(refusing)
        source = dict(release_tag='example', input_as_of='2026-01-01T00:00:00Z', as_of='2026-01-02T00:00:00Z', editions=cohort.f.editions, scripts={},
                      source_quality=dict(version=2))
        weather = dict(input=dict(release_tag='example-weather'), editions=cohort.weather['editions'])
        with tempfile.TemporaryDirectory() as out, mock.patch.multiple(
                build_charts, load_cohort=lambda cache=None: ({'tag': 'example'}, cohort.f, source, 'e' * 64), load_weather=lambda: weather,
                load_geometry=lambda: None, catalog=lambda: [refusing]):
            with self.assertRaisesRegex(ValueError, rf"Chart {refusing['number']} \({refusing['slug']}\) cannot be built on this cohort: "):
                build_charts.run(out)
            self.assertEqual(list(Path(out).glob('*.json')), [])

    def test_every_analysis_module_the_build_imports_is_bound(self):
        """The import closure of the builder and the chart modules, inside analysis/: each module is one of the scripts
        the charts manifest hashes or one the cohort manifest must name (the reader checks those against the checkout)."""
        here = Path(build_charts.__file__).resolve().parent
        family = {p.stem for p in here.glob('charts_*.py')} | {'build_charts'}

        def imports(node, inside_functions):
            """Imports a module makes when it is loaded; in the family's own files also those its functions make when the
            build calls them (a shared module's function-level imports belong to its own family's build, not to this one)."""
            for child in ast.iter_child_nodes(node):
                if isinstance(child, ast.Import):
                    yield from (alias.name.split('.')[0] for alias in child.names)
                elif isinstance(child, ast.ImportFrom) and child.module and not child.level:
                    yield child.module.split('.')[0]
                elif inside_functions or not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                    yield from imports(child, inside_functions)

        seen, todo = set(), sorted(family)
        while todo:
            name = todo.pop()
            if name in seen or not (here / f'{name}.py').exists():
                continue
            seen.add(name)
            todo += list(imports(ast.parse((here / f'{name}.py').read_text()), name in family))
        own = family | {'build_insights', 'insights_data', 'insights_stats', 'build_fast_start'}
        cohort_side = {Path(name).stem for name in insights_data.COHORT_SCRIPTS}
        self.assertEqual(seen - own - cohort_side, set(), 'an analysis module the chart build imports is in neither manifest')
        self.assertIn('cohort', seen & cohort_side, 'the builders read the cohort through analysis/cohort.py')


if __name__ == '__main__':
    unittest.main()
