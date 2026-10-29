"""Terrain splits: model, builder refusals and the published New York profile.

  python -m unittest discover -s analysis -p 'test_course_terrain.py'

The tests that need the adopted release's course_profiles.parquet run when COURSE_PROFILES names it (CI sets it
after downloading the pinned release). PARITY_WRITE=1 rewrites analysis/course_terrain/fixtures/parity.json.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unittest

import duckdb
import numpy as np

import build_course_terrain as bct
import terrain_model as tm

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CORRECTIONS = HERE / 'course_terrain/corrections.json'
FIXTURE = HERE / 'course_terrain/fixtures/parity.json'
PUBLISHED = ROOT / 'public/data/insights/tools/course-terrain.json'
PROFILES = os.environ.get('COURSE_PROFILES')
GOALS = [g for m in range(90, 481) for g in (m * 60, m * 60 + 30)]


def js_round(v):
    """Math.round, as the pages round elapsed times."""
    return math.floor(v + 0.5)


def plan(d_km, z_m):
    x, zz, g = tm.grade_profile(d_km, z_m)
    return x, zz, g, tm.cumulative(x, g)


def parity_profile():
    """1 km at +4% (10-11 km), 1 km at -4% (11-12 km), the rest flat at 10 m, and a 30 m spike on one input point at 30 km."""
    d = [0.0, 10.0, 11.0, 12.0, 29.99, 30.0, 30.01, 42.195]
    z = [10.0, 10.0, 50.0, 10.0, 10.0, 40.0, 10.0, 10.0]
    return d, z


def parity_values():
    d, z = parity_profile()
    x, zz, g, U = plan(d, z)
    u = lambda km: [round(float(v), 7) for v in tm.u_at(x, U, np.asarray(km, float))]
    return dict(
        description='Synthetic 42.195 km profile: 1 km at +4% from 10 km, 1 km at -4% from 11 km, flat at 10 m elsewhere, '
                    'and a 30 m spike on one input point at 30 km. Expected plan shares from analysis/terrain_model.py; '
                    'scripts/verify-tools.cjs asserts its JavaScript model against km, mi and half within 1e-6 and strip_m within 0.05 m.',
        route=dict(d_km=d, m=z), km=u(np.arange(1, 43)), mi=u(np.arange(1, 27) * tm.MILE_KM), half=u([tm.KM / 2])[0],
        max_grade_pct=round(float(np.max(np.abs(g))), 2),
        strip_m=[round(float(v), 1) for v in np.interp(np.arange(85) * 0.5, x, zz)],
    )


class Model(unittest.TestCase):
    def test_curve_values_and_clamp(self):
        self.assertEqual(float(tm.f(0)), 1.0)
        # f(-10) is 0.8651 (1 - 0.2869556 + 0.1520768); the spec table's 0.8650 is a rounding slip.
        for g, want in ((2, 1.0635), (-2, 0.9487), (4, 1.1391), (-4, 0.9096), (10, 1.4390), (-10, 0.8651)):
            self.assertAlmostEqual(float(tm.f(g)), want, delta=1e-4, msg=f'f({g})')
        grid = np.arange(-10, 10.0001, 0.001)
        i = int(np.argmin(tm.f(grid)))
        self.assertAlmostEqual(float(grid[i]), -9.43, delta=0.01)
        self.assertAlmostEqual(float(tm.f(grid[i])), 0.8646, delta=1e-4)
        self.assertEqual(float(tm.f(12)), float(tm.f(10)))
        self.assertEqual(float(tm.f(-12)), float(tm.f(-10)))
        self.assertEqual((tm.A1, tm.A2, tm.GMAX, tm.GRID_POINTS, tm.MEDIAN_SAMPLES, tm.SIGMA_SAMPLES, tm.KERNEL_HALF_WIDTH),
                         (0.02869556, 0.001520768, 10.0, 4221, 21, 10, 40))

    def test_flat_profile_is_even_pace(self):
        x, _, g, U = plan([0, 20, 42.195], [12.5, 12.5, 12.5])
        self.assertLess(float(np.max(np.abs(g))), 1e-9)
        np.testing.assert_allclose(U, x / tm.KM, rtol=0, atol=1e-12)
        marks = np.r_[np.arange(1, 43), np.arange(1, 27) * tm.MILE_KM, tm.KM / 2]
        u = tm.u_at(x, U, marks)
        np.testing.assert_allclose(u, marks / tm.KM, rtol=0, atol=1e-12)
        # At full precision every marker is exactly the even-pace time. The published shares carry 7 decimals, which can
        # move a time that sits within 1.5 ms of a half second by one second; never more.
        for G in GOALS:
            exact = [js_round(G * v) for v in u]
            self.assertEqual(exact, [js_round(G * m / tm.KM) for m in marks], f'goal {G}: flat terrain equals even pace')
            published = [js_round(G * v) for v in np.round(u, 7)]
            self.assertLessEqual(max(abs(a - b) for a, b in zip(published, exact)), 1)

    def test_plan_share_runs_from_zero_to_one_and_ends_on_the_goal(self):
        x, _, _, U = plan(*parity_profile())
        self.assertEqual(len(x), 4221)
        self.assertEqual(float(x[-1]), tm.KM)
        self.assertEqual(float(U[0]), 0.0)
        self.assertEqual(float(U[-1]), 1.0)
        self.assertTrue(bool(np.all(np.diff(U) > 0)))
        for G in (5400, 18900, 28800):
            self.assertEqual(G * float(tm.u_at(x, U, tm.KM)), G)
        bct.check_u(U, 'synthetic')
        with self.assertRaisesRegex(bct.Refused, 'strictly increasing'):
            bct.check_u(np.r_[0.0, 0.5, 0.5, 1.0], 'synthetic')
        with self.assertRaisesRegex(bct.Refused, 'exactly 1'):
            bct.check_u(np.r_[0.0, 0.5, 0.999], 'synthetic')

    def test_symmetric_hill_costs_net_time(self):
        x, _, _, U = plan(*parity_profile())
        over_hill = float(tm.u_at(x, U, 12.5) - tm.u_at(x, U, 9.5))
        self.assertGreater(over_hill, 3 / tm.KM)
        # Up is slower than down.
        self.assertGreater(float(tm.u_at(x, U, 11) - tm.u_at(x, U, 10)), float(tm.u_at(x, U, 12) - tm.u_at(x, U, 11)))

    def test_one_sample_spike_is_removed(self):
        d = [0.0, 29.99, 30.0, 30.01, 42.195]
        x, zz, g, _ = plan(d, [10.0, 10.0, 40.0, 10.0, 10.0])
        self.assertLess(float(np.max(np.abs(g))), 1.0)
        self.assertLess(float(np.max(zz)), 10.5)

    def test_rescale_maps_the_route_file_to_42195(self):
        # A 42.608 km route file with a hill in its middle: the hill lands in the middle of the official axis.
        L = 42.608
        d = [0.0, L / 2 - 0.5, L / 2, L / 2 + 0.5, L]
        x, zz, _, _ = plan(d, [0.0, 0.0, 20.0, 0.0, 0.0])
        self.assertEqual(float(x[-1]), tm.KM)
        self.assertAlmostEqual(float(x[int(np.argmax(zz))]), tm.KM / 2, delta=0.011)
        # An unsorted file is sorted first (stable).
        _, zz2, _, _ = plan(d[::-1], [0.0, 0.0, 20.0, 0.0, 0.0][::-1])
        np.testing.assert_array_equal(zz, zz2)

    def test_parity_fixture(self):
        values = parity_values()
        if os.environ.get('PARITY_WRITE') == '1':
            FIXTURE.parent.mkdir(parents=True, exist_ok=True)
            FIXTURE.write_text(json.dumps(values, indent=1, sort_keys=True) + '\n')
        stored = json.loads(FIXTURE.read_text())
        self.assertEqual(stored, values)
        self.assertGreater(values['max_grade_pct'], 3.5)
        x, _, g, _ = plan(*parity_profile())
        near_spike = (x > 29) & (x < 31)
        self.assertLess(float(np.max(np.abs(g[near_spike]))), 1.0)


# ---------- builder refusals on a synthetic release ----------

def _points(z_of):
    return [dict(d_km=round(k * 0.2, 3), elev_m=round(z_of(k * 0.2), 2), lat=52.0, lon=4.0) for k in range(213)] + \
        [dict(d_km=42.6, elev_m=round(z_of(42.6), 2), lat=52.0, lon=4.0)]


class Fixture:
    """A synthetic release folder: parquet, registry, context manifest, release pin and pace-band index."""

    def __init__(self, folder):
        self.root = Path(folder)
        self.profiles = self.root / 'course_profiles.parquet'
        self.corrections = self.root / 'corrections.json'
        self.context = self.root / 'manifest.json'
        self.release = self.root / 'release.json'
        self.pace_band = self.root / 'pace-band.json'
        gentle = lambda d: 10 + 3 * math.sin(d / 4)
        rows = [('Alpha', 'Alpha Marathon', json.dumps(_points(gentle))), ('Beta', 'Beta Marathon', json.dumps(_points(lambda d: 5.0))),
                ('Gamma', 'Gamma Marathon', json.dumps(_points(gentle))), ('Delta', 'Delta Marathon', json.dumps(_points(gentle)))]
        db = duckdb.connect()
        db.execute('CREATE TABLE p (city VARCHAR, race VARCHAR, points_json VARCHAR)')
        db.executemany('INSERT INTO p VALUES (?, ?, ?)', rows)
        db.execute(f"COPY p TO '{self.profiles}' (FORMAT PARQUET)")
        sha = hashlib.sha256(self.profiles.read_bytes()).hexdigest()
        source = [dict(dataset='Synthetic terrain model', url='https://example.org/dem', licence='CC0 1.0', retrieved='2026-10-23')]
        self.registry = dict(
            schema='pace-notes/course-profile-corrections', version='test.1', input=dict(sha256=sha),
            courses=[
                dict(city='Alpha', slug='alpha', **{'class': 'b'}, band='terrain', sources=source,
                     corrections=[dict(id='alpha-bridge', mode='replace_range', km_from=10.0, km_to=11.0,
                                       anchors=[[10.0, 12.0], [10.5, 20.0], [11.0, 12.0]])],
                     structures_applied=[dict(kind='bridge', d_from=30.0, d_to=30.4)],
                     features=[dict(id='alpha-bridge', name='Alpha Bridge', short='Alpha', km_from=10.0, km_to=11.0),
                               dict(id='alpha-viaduct', name='Alpha Viaduct', short='Viaduct', km_from=30.05, km_to=30.35)]),
                dict(city='Beta', slug='beta', **{'class': 'a'}, band='terrain', sources=source, corrections=[], features=[]),
                dict(city='Gamma', slug='gamma', **{'class': 'c'}, band='even', why='profile', corrections=[], features=[]),
                dict(city='Delta', slug='delta', **{'class': 'b'}, band='even', why='held', corrections=[], features=[]),
            ])
        self.manifest = dict(release_tag='example-tag', input_as_of='2026-10-21T15:02:30Z', input_files={'course_profiles.parquet': sha})
        self.release.write_text(json.dumps(dict(tag='example-tag')))
        self.pace_band.write_text(json.dumps(dict(scopes=[dict(slug=s) for s in ('all', 'alpha', 'beta', 'gamma', 'delta')])))
        self.write()

    def write(self):
        self.corrections.write_text(json.dumps(self.registry))
        self.context.write_text(json.dumps(self.manifest))

    def course(self, city):
        return next(c for c in self.registry['courses'] if c['city'] == city)

    def build(self):
        self.write()
        return bct.build(self.profiles, self.corrections, self.context, self.release, self.pace_band)


class Builder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fx = Fixture(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def refuses(self, pattern):
        with self.assertRaisesRegex(bct.Refused, pattern):
            self.fx.build()

    def test_builds_deterministically(self):
        first, second = self.fx.build(), self.fx.build()
        self.assertEqual(first, second)
        doc = json.loads(first)
        self.assertEqual(sorted(doc), ['context_manifest_sha256', 'corrections_sha256', 'corrections_version', 'course_profiles_sha256', 'courses',
                                       'even', 'family', 'input_as_of', 'model', 'release_tag', 'schema_version', 'scripts'])
        self.assertEqual(doc['family'], 'tool-course-terrain')
        self.assertEqual(doc['release_tag'], 'example-tag')
        self.assertEqual(doc['corrections_sha256'], hashlib.sha256(self.fx.corrections.read_bytes()).hexdigest())
        self.assertEqual(doc['context_manifest_sha256'], hashlib.sha256(self.fx.context.read_bytes()).hexdigest())
        self.assertEqual([c['slug'] for c in doc['courses']], ['alpha', 'beta'])
        self.assertEqual(doc['even'], [dict(slug='delta', city='Delta', why='held'), dict(slug='gamma', city='Gamma', why='profile')])
        alpha = doc['courses'][0]
        self.assertEqual(len(alpha['km']), 42)
        self.assertEqual(len(alpha['mi']), 26)
        self.assertTrue(alpha['km'][20] < alpha['half'] < alpha['km'][21])
        self.assertEqual(len(alpha['strip']['m']), 85)
        self.assertEqual(alpha['route_km'], 42.6)
        self.assertEqual(alpha['features'][0], dict(id='alpha-bridge', name='Alpha Bridge', short='Alpha',
                                                    from_km=round(10 * 42.195 / 42.6, 3), to_km=round(11 * 42.195 / 42.6, 3)))
        # The correction replaced the profile points inside its range with its anchors.
        route = dict(zip(alpha['route']['d_km'], alpha['route']['m']))
        self.assertEqual(route[10.5], 20.0)
        self.assertNotIn(10.2, route)
        # A flat supplied profile gives even pace exactly at the published precision.
        beta = doc['courses'][1]
        self.assertEqual(beta['km'], [round(k / 42.195, 7) for k in range(1, 43)])

    def test_refuses_a_wrong_parquet(self):
        self.fx.manifest['input_files']['course_profiles.parquet'] = '0' * 64
        self.refuses('runner-context input')

    def test_refuses_a_wrong_corrections_input_hash(self):
        self.fx.registry['input']['sha256'] = '0' * 64
        self.refuses('audited corrections input')

    def test_refuses_a_class_c_terrain_course(self):
        gamma = self.fx.course('Gamma')
        gamma.update(band='terrain', sources=self.fx.course('Alpha')['sources'])
        del gamma['why']
        self.refuses('Gamma: a class c profile')

    def test_refuses_a_terrain_course_without_sources(self):
        self.fx.course('Beta')['sources'] = []
        self.refuses('Beta: a terrain course needs sources')
        self.fx.course('Beta')['sources'] = [dict(dataset='x', url='https://example.org', retrieved='2026-10-23')]
        self.refuses('Beta: a terrain course needs sources')

    def test_refuses_a_terrain_course_with_why(self):
        self.fx.course('Alpha')['why'] = 'profile'
        self.refuses('Alpha: a terrain course has no why')

    def test_refuses_a_grade_above_8_percent(self):
        self.fx.course('Alpha')['corrections'].append(dict(id='alpha-cliff', mode='replace_range', km_from=20.0, km_to=20.4,
                                                           anchors=[[20.0, 10.0], [20.1, 50.0], [20.4, 50.0]]))
        self.refuses(r'Alpha: smoothed grade \d+\.\d\d% is above 8%')

    def test_refuses_a_feature_outside_its_correction(self):
        self.fx.course('Alpha')['features'][0]['km_to'] = 11.5
        self.refuses('Alpha: feature alpha-bridge lies outside its correction range')

    def test_refuses_a_slug_that_is_not_a_pace_band_scope(self):
        self.fx.pace_band.write_text(json.dumps(dict(scopes=[dict(slug=s) for s in ('all', 'alpha')])))
        self.refuses('Beta: beta is not a pace-band scope')

    def test_refuses_registry_errors(self):
        self.fx.course('Delta')['why'] = 'later'
        self.refuses('Delta: an even-pace course needs why')
        self.fx.course('Delta')['why'] = 'held'
        self.fx.course('Alpha')['corrections'][0]['anchors'].append([11.5, 12.0])
        self.refuses('alpha-bridge has an anchor outside its range')
        self.fx.course('Alpha')['corrections'][0]['anchors'].pop()
        self.fx.registry['courses'].pop()
        self.refuses('different cities')


# ---------- the adopted release ----------

def guards(doc_course, G=5 * 3600 + 15 * 60):
    """New York 5:15 raw-profile mutation guards: (20-25 km split, 25-30 km split, mile 1 minus mile 2)."""
    E = lambda u: js_round(G * u)
    km, mi = doc_course['km'], doc_course['mi']
    return E(km[24]) - E(km[19]), E(km[29]) - E(km[24]), E(mi[0]) - (E(mi[1]) - E(mi[0]))


def passes(g):
    return g[0] >= 2280 and g[1] <= 2205 and g[2] >= 90


@unittest.skipUnless(PROFILES, 'COURSE_PROFILES names the adopted release course_profiles.parquet')
class AdoptedRelease(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = bct.build(PROFILES, CORRECTIONS)
        cls.doc = json.loads(cls.data)
        cls.ny = next(c for c in cls.doc['courses'] if c['slug'] == 'new-york')

    def test_two_builds_are_byte_identical_and_match_the_published_file(self):
        self.assertEqual(bct.build(PROFILES, CORRECTIONS), self.data)
        self.assertEqual(PUBLISHED.read_bytes(), self.data, 'Rebuild public/data/insights/tools/course-terrain.json')

    def test_course_sets(self):
        self.assertEqual([c['slug'] for c in self.doc['courses']],
                         ['amsterdam', 'austin', 'boston', 'chicago', 'eindhoven', 'london', 'madrid', 'new-york', 'rotterdam', 'valencia'])
        why = {c['slug']: c['why'] for c in self.doc['even']}
        self.assertEqual((why['warsaw'], why['oslo']), ('held', 'held'))
        self.assertEqual(len(why), 23)
        self.assertEqual([f['id'] for f in self.ny['features']], ['nyc-verrazzano', 'nyc-pulaski', 'nyc-queensboro', 'nyc-willis', 'nyc-madison'])
        expected = {'new-york': (6.35, 188.6), 'boston': (6.53, 127.7), 'chicago': (1.51, 16.1), 'austin': (5.58, 194.9), 'madrid': (5.82, 250.5),
                    'valencia': (1.56, 40.5), 'london': (3.78, 42.9), 'amsterdam': (1.77, 16.2), 'eindhoven': (1.38, 12.2), 'rotterdam': (3.22, 37.4)}
        self.assertEqual({c['slug']: (c['max_grade_pct'], c['smoothed_gain_m']) for c in self.doc['courses']}, expected)

    def test_new_york_corrected_decks(self):
        d = np.array(self.ny['route']['d_km']) * tm.KM / self.ny['route_km']
        m = np.array(self.ny['route']['m'])
        self.assertGreaterEqual(float(m[(d >= 0.9) & (d <= 1.5)].max()), 75.0, 'Verrazzano upper level')
        window = (d >= 23.3) & (d <= 24.9)
        self.assertGreaterEqual(float(m[window].max() - np.interp(23.3, d, m)), 35.0, 'Queensboro lower level rise')

    def test_every_deck_guard_fails_on_the_supplied_profile(self):
        # The deck guards in scripts/verify-insights.cjs (TERRAIN_DECKS) catch a ground model only if the uncorrected
        # supplied profile fails each of them; each must pass on the published, corrected input.
        source = (ROOT / 'scripts/verify-insights.cjs').read_text()
        table = re.search(r'const TERRAIN_DECKS = \[(.*?)\];\n', source, re.S)
        self.assertIsNotNone(table, 'TERRAIN_DECKS in scripts/verify-insights.cjs')
        decks = [(slug, name, float(a), float(b), float(floor)) for slug, name, a, b, floor in
                 re.findall(r"\['([\w-]+)', '([^']+)', ([\d.]+), ([\d.]+), ([\d.]+)\]", table.group(1))]
        self.assertEqual(len(decks), 7)
        supplied = bct.read_profiles(PROFILES)

        def window_max(d, m, a, b):
            # The highest reading in the window on the official axis, the window's two ends included (interpolated).
            o = (np.asarray(d) - d[0]) * tm.KM / (d[-1] - d[0])
            z = np.asarray(m, float)
            return float(max(z[(o >= a) & (o <= b)].max(initial=-1e9), np.interp(a, o, z), np.interp(b, o, z)))

        for slug, name, a, b, floor in decks:
            course = next(c for c in self.doc['courses'] if c['slug'] == slug)
            corrected = window_max(course['route']['d_km'], course['route']['m'], a, b)
            race, points = supplied[course['city']]
            raw = window_max([p[0] for p in points], [p[1] for p in points], a, b)
            self.assertGreaterEqual(corrected, floor, f'{course["city"]} {name}: the published input passes')
            self.assertLess(raw, floor, f'{course["city"]} {name}: the supplied profile ({raw:.1f} m) must fail the {floor} m guard')

    def test_new_york_pins_and_raw_profile_guards(self):
        G = 5 * 3600 + 15 * 60
        mats = [js_round(G * self.ny['km'][k - 1]) for k in (5, 10, 15, 20, 25, 30, 35, 40)]
        self.assertEqual(mats, [2239, 4464, 6698, 8926, 11218, 13411, 15655, 17913])
        self.assertEqual(js_round(G * self.ny['half']), 9431)
        g = guards(self.ny)
        self.assertEqual(g, (2292, 2193, 109))
        self.assertTrue(passes(g))
        # The same build from the supplied profile without its corrections fails all three guards.
        with tempfile.TemporaryDirectory() as tmp:
            registry = json.loads(CORRECTIONS.read_text())
            course = next(c for c in registry['courses'] if c['city'] == 'New York')
            course['corrections'], course['features'] = [], []
            path = Path(tmp) / 'corrections.json'
            path.write_text(json.dumps(registry))
            raw = next(c for c in json.loads(bct.build(PROFILES, path))['courses'] if c['slug'] == 'new-york')
        g = guards(raw)
        self.assertEqual(g, (2231, 2244, -62))
        self.assertFalse(g[0] >= 2280 or g[1] <= 2205 or g[2] >= 90, 'the raw profile must fail every guard')


if __name__ == '__main__':
    unittest.main()
