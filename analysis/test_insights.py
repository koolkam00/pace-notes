"""Tests for the Pace Notes story analyses (insights_*.py). NumPy and the standard library only."""
import gzip
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

import insights_data
from insights_data import Finishes, granular_age_editions, relative_pace, screen_duplicates, start_offset_screen, sustained_slowdown
from insights_stats import kmeans, poisson_poly_fit, quantile, r
import insights_archetypes
import insights_courses
import insights_kick
import insights_positions
import insights_round
import insights_tool_coursegoal
import insights_tool_paceband
import insights_tool_projector
import insights_tool_weather
import insights_tools_common
from build_fast_start import digest

KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]


def times_for(paces):
    """Cumulative checkpoint times from nine section paces (s/km)."""
    lengths = [5] * 8 + [2.195]
    out, t = [], 0.0
    for p, L in zip(paces, lengths):
        t += p * L
        out.append(t)
    return out


def make(rows, editions):
    """rows: (edition, gender, age, paces, profile)."""
    times = np.array([times_for(p) for _, _, _, p, _ in rows])
    return Finishes(times, np.array([e for e, *_ in rows]), np.array([g for _, g, *_ in rows], dtype=np.uint8),
                    np.zeros(len(rows), dtype=np.uint8), np.array([np.nan if a is None else a for _, _, a, _, _ in rows], float),
                    np.array([p for *_, p in rows], dtype=np.uint64), editions)


class SlowdownAndShapes(unittest.TestCase):
    def test_sustained_slowdown_matches_the_published_definition(self):
        base = [300] * 9
        exactly = base[:5] + [375] + base[6:]           # 25–30 km exactly 25% slower: qualifies
        final_only = base[:8] + [600]                    # only the 2.195 km final section: cannot qualify alone
        f = make([(0, 1, None, base, 1), (0, 1, None, exactly, 2), (0, 2, None, final_only, 3)], [dict(city='A', year=2020)])
        detected, onset = sustained_slowdown(f)
        self.assertEqual(detected.tolist(), [False, True, False])
        self.assertEqual(onset.tolist(), [-1, 25, -1])

    def test_relative_pace_integrates_to_zero(self):
        rng = np.random.default_rng(1)
        rows = [(0, 1, None, list(280 + rng.random(9) * 80), i + 1) for i in range(50)]
        f = make(rows, [dict(city='A', year=2020)])
        R = relative_pace(f)
        lengths = np.array([5] * 8 + [2.195])
        self.assertLess(np.abs((R * lengths).sum(1)).max(), 1e-9)

    def test_start_offset_screen_flags_only_inflated_first_sections(self):
        normal = [(0, 1, None, [300] * 9, i) for i in range(120)]
        inflated = [(1, 1, None, [380] + [300] * 8, 200 + i) for i in range(120)]
        f = make(normal + inflated, [dict(city='A', year=2020), dict(city='B', year=2020)])
        keep, audit = start_offset_screen(f)
        self.assertEqual([a['city'] for a in audit], ['B'])
        self.assertEqual(int(keep.sum()), 120)

    def test_granular_age_rule_rejects_age_group_floors(self):
        rng = np.random.default_rng(2)
        exact = [(0, 1, float(18 + rng.integers(0, 60)), [300] * 9, i) for i in range(300)]
        floors = [(1, 1, float(30 + 5 * rng.integers(0, 10)), [300] * 9, 1000 + i) for i in range(300)]
        f = make(exact + floors, [dict(city='A', year=2020), dict(city='B', year=2020)])
        self.assertEqual(granular_age_editions(f), [0])


class DuplicateScreen(unittest.TestCase):
    def test_duplicate_editions_are_removed_only_with_evidence(self):
        editions = [dict(city='Chicago', year=y) for y in (2018, 2019, 2024)]
        rng = np.random.default_rng(3)
        paces = [list(280 + rng.random(9) * 100) for _ in range(150)]
        rows = [(e, 1, None, p, 10 * e + i) for e in (0, 1, 2) for i, p in enumerate(paces)]
        kept, audit = screen_duplicates(make(rows, editions))
        self.assertEqual(kept.n, 150)
        self.assertEqual([a['eligible_removed'] for a in audit], [150, 150])
        different = [(e, 1, None, list(np.array(p) + (5 if e < 2 else 0)), 10 * e + i) for e in (0, 1, 2) for i, p in enumerate(paces)]
        with self.assertRaisesRegex(ValueError, 'Duplicate evidence'):
            screen_duplicates(make(different, editions))


class Statistics(unittest.TestCase):
    def test_linear_quantile_matches_repository_convention(self):
        self.assertEqual(quantile([1, 2, 3, 4], .5), 2.5)
        self.assertEqual(quantile([10], .9), 10.0)

    def test_publication_rounding_refuses_non_finite_values(self):
        with self.assertRaises(ValueError):
            r(float('nan'))

    def test_poisson_reference_recovers_a_smooth_curve(self):
        x = np.arange(100)
        y = np.round(1000 * np.exp(-((x - 50) / 30) ** 2))
        fit = poisson_poly_fit(x, y, 2, np.ones(100, bool))
        self.assertLess(np.abs(fit - y).max() / y.max(), .02)

    def test_kmeans_is_deterministic(self):
        rng = np.random.default_rng(4)
        X = np.concatenate([rng.normal(0, 1, (200, 2)), rng.normal(8, 1, (200, 2))])
        c1, l1 = kmeans(X, 2, seed=7)
        c2, l2 = kmeans(X, 2, seed=7)
        self.assertTrue(np.array_equal(l1, l2))
        self.assertEqual(len(set(l1[:200].tolist())), 1)


class RoundNumbers(unittest.TestCase):
    def test_cliff_index_is_one_without_a_step(self):
        counts = np.full(insights_round.M1 - insights_round.M0, 1000.0)
        self.assertAlmostEqual(insights_round.cliff_index(counts, 240), 1.0)
        counts[239 - insights_round.M0] = 2000
        self.assertGreater(insights_round.cliff_index(counts, 240), 1.9)

    def test_mark_kinds(self):
        self.assertEqual([insights_round.mark_kind(m) for m in (240, 210, 225, 230, 235, 236)],
                         ['hour', 'half-hour', 'quarter', 'ten', 'five', 'minute'])


class Archetypes(unittest.TestCase):
    def test_pacing_sentence_round_trips(self):
        R = np.array([[-5, -5, -1, 0, 1, 2, 4, 9, 2.0]])
        code = insights_archetypes.sentence(R)[0]
        self.assertEqual(insights_archetypes.decode(int(code)), 'FFEEEESSE')

    def test_published_centroids_classify_their_own_shapes(self):
        C = np.array(insights_archetypes.INIT)
        R = C / insights_archetypes.WEIGHTS
        X = insights_archetypes.features(R)
        from insights_stats import assign
        self.assertEqual(assign(X, C).tolist(), list(range(6)))


class Positions(unittest.TestCase):
    def test_average_ranks_share_ties(self):
        self.assertEqual(insights_positions.average_ranks(np.array([10., 20, 20, 30])).tolist(), [1, 2.5, 2.5, 4])


class Courses(unittest.TestCase):
    def test_fade_fit_separates_multiple_from_signature(self):
        typical = np.array([-4.8, -5.5, -4.7, -3.5, -1.5, 1.1, 5.3, 9.3, 4.4])
        bump = np.zeros(9)
        bump[4] = 3.0
        beta, residual = insights_courses.fade_fit(1.5 * typical + bump, typical)
        self.assertAlmostEqual(beta, 1.5, delta=.15)
        self.assertEqual(int(np.abs(residual).argmax()), 4)

    def test_within_course_slope_ignores_course_levels(self):
        rng = np.random.default_rng(5)
        rows = []
        for c, level in (('A', 10), ('B', 40), ('C', 25)):
            for t in (2, 6, 10, 14):
                rows.append(dict(city=c, temp=t + level / 10, y=level + 1.3 * (t + level / 10)))
        fit = insights_courses.Within(rows, 'y', ['temp'], rng, reps=50)
        self.assertAlmostEqual(fit.coef[0], 1.3, places=9)
        self.assertGreater(fit.r2, .999)

    def test_identification_is_leave_one_out(self):
        rows = [dict(city='A', year=y, v=np.array([1.0, 0, 0]) + .01 * y) for y in range(3)] + \
               [dict(city='B', year=y, v=np.array([0, 1.0, 0]) + .01 * y) for y in range(3)]
        out = insights_courses.identify(rows, 'v', lambda a, b: float(np.abs(a - b).sum()))
        self.assertEqual([x['predicted'] for x in out], ['A'] * 3 + ['B'] * 3)
        self.assertTrue(all(x['candidates'] == 2 for x in out))


class Kick(unittest.TestCase):
    def test_episode_extends_through_contiguous_slow_sections(self):
        R = np.zeros((3, 9))
        R[0, 5:7] = .3            # 25–30 and 30–35 km: one episode ending at section 6
        R[1, 7] = .26             # 35–40 km only
        R[1, 8] = .4              # continues into the final section
        detected, first, end = insights_kick.episodes(R)
        self.assertEqual(detected.tolist(), [True, True, False])
        self.assertEqual(first[:2].tolist(), [5, 7])
        self.assertEqual(end[:2].tolist(), [6, 8])

    def test_leave_one_out_strata(self):
        keys = np.array([1] * 100 + [2] * 50)
        values = np.c_[np.arange(150, dtype=float)]
        loo = insights_kick.strata_loo(keys, values)
        self.assertAlmostEqual(loo[0, 0], (np.arange(100).sum() - 0) / 99)
        self.assertTrue(np.isnan(loo[120, 0]))

    def test_grid_screen_flags_an_inflated_final_section(self):
        normal = [(0, 1, None, [300] * 4 + [320, 330, 340, 350, 340], i) for i in range(120)]
        odd = [(1, 1, None, [300] * 4 + [320, 330, 340, 350, 280], 500 + i) for i in range(120)]
        f = make(normal + odd, [dict(city='A', year=2020), dict(city='B', year=2021)])
        R = f.paces / f.baseline[:, None] - 1
        kick = f.paces[:, 8] / f.paces[:, 7] - 1
        keep, audit = insights_kick.grid_screen(f, R, kick)
        self.assertEqual([a['city'] for a in audit], ['B'])
        self.assertEqual(int(keep.sum()), 120)


class Tools(unittest.TestCase):
    """The /tools data families: windows, trends, gates and slugs."""

    def patch(self, module, name, value):
        self.addCleanup(setattr, module, name, getattr(module, name))
        setattr(module, name, value)

    def plain_cohort(self, module, f):
        detected, onset = sustained_slowdown(f)
        self.patch(module, 'tool_cohort', lambda c: (c, detected, onset, {}))

    def test_slug_rule_matches_course_pages(self):
        self.assertEqual(insights_tools_common.slugify('New York'), 'new-york')
        self.assertEqual(insights_tools_common.slugify('Gold Coast'), 'gold-coast')
        self.assertEqual(insights_tools_common.slugify('São Paulo'), 'sao-paulo')

    def test_projector_band_and_trend(self):
        # Even 300 s/km to 20 km, then a runner whose 15–20 km was 10% quicker than the average so far.
        even = [300] * 9
        quick = [310, 310, 310, 279] + [300] * 5
        f = make([(0, 1, None, even, 1), (0, 2, None, quick, 2)], [dict(city='A', year=2020)])
        band = insights_tool_projector.band_of(f, 3)
        self.assertEqual(int(band[0]) * 120, int(np.floor(6000 * 42.195 / 20 / 120)) * 120)
        self.assertEqual(insights_tool_projector.variant_mask(f, 3, 'similar').tolist(), [True, False])
        self.assertEqual(insights_tool_projector.variant_mask(f, 3, 'faster').tolist(), [False, True])
        self.assertEqual(insights_tool_projector.variant_mask(f, 3, 'women').tolist(), [False, True])
        self.assertFalse(insights_tool_projector.variant_mask(f, 0, 'faster').any())

    def test_projector_cell_splits_slowdowns_by_mat(self):
        rows = [(0, 1, None, [300] * 4 + [300, 400, 400, 300, 300], i) for i in range(50)]       # slowdown from 25 km
        rows += [(0, 1, None, [300] * 9, 100 + i) for i in range(50)]                              # held pace
        f = make(rows, [dict(city='A', year=2020)])
        detected, onset = sustained_slowdown(f)
        cell = insights_tool_projector.cell(f, np.arange(f.n), 5, detected, onset)               # at 30 km
        self.assertEqual(cell['n'], 100)
        self.assertEqual(cell['sd'], [0.5, 0.0])                                                  # all recorded by 30 km
        cell20 = insights_tool_projector.cell(f, np.arange(f.n), 3, detected, onset)             # at 20 km
        self.assertEqual(cell20['sd'], [0.0, 0.5])
        self.assertEqual(len(cell20['later']), 4)
        self.assertEqual(len(cell20['q']), 19)

    def test_pace_band_window_excludes_the_goal_minute(self):
        base = [(0, 1, None, [334.0] * 9, i) for i in range(100)]
        f = make(base, [dict(city='A', year=2020)])
        f.times[:, 8] = np.r_[np.full(50, 235 * 60 - 300.0), np.full(50, 235 * 60 - 0.5)]   # 3:50:00 and 3:54:59.5
        f.finish = f.times[:, 8]
        self.plain_cohort(insights_tool_paceband, f)
        out = insights_tool_paceband.build(f)
        shard = out['extra_files']['tools/pace-band/all/all.json']['groups']['all']
        self.assertEqual(shard['g'], [235])
        self.assertEqual(shard['n'], [100])
        f.times[:50, 8] = 235 * 60.0                                     # exactly 3:55:00 is not under a 3:55 goal
        f.finish = f.times[:, 8]
        goals = insights_tool_paceband.build(f)['extra_files']['tools/pace-band/all/all.json']['groups']['all']['g']
        self.assertNotIn(235, goals)                                     # only 50 finishes left in [3:50:00, 3:55:00)
        self.assertIn(236, goals)

    def context(self, temps):
        return [dict(weather=None if t is None else dict(temp_c=t, dewpoint_c=5.0, wind_mps=2.0, warming_c=3.0, weather_race='R',
                                                         date='2020-10-01', scheduled_start='09:00'),
                     terrain=dict(gain_m=10.0, loss_m=12.0, net_m=-2.0, sections=[dict(net_m=-1.0)])) for t in temps]

    def test_weather_rows_need_three_editions_and_balance_them(self):
        editions = [dict(city=c, year=2020, race='R') for c in 'ABCD']
        rows = []
        for e, n in enumerate([20, 20, 80, 19]):
            rows += [(e, 1, None, [330] * 4 + [340 + 10 * e] * 5, 1000 * e + i) for i in range(n)]
        f = make(rows, editions)
        self.plain_cohort(insights_tool_weather, f)
        self.patch(insights_tool_weather, 'edition_context', lambda eds: self.context([10, 11, 9, 10]))
        out = insights_tool_weather.build(f)
        row = [x for x in out['rows'] if x['c'] == 10 and x['hw'] == 2 and x['pace'] == 330][0]
        self.assertEqual(row['ed'], [0, 1, 2])                           # D has 19 finishes in the band
        self.assertEqual(row['n'], 120)
        self.assertEqual(row['after20'], int(round(np.mean([(340 + 10 * e - 330) * 22.195 for e in range(3)]))))
        self.patch(insights_tool_weather, 'edition_context', lambda eds: self.context([10, 11, 20, 10]))
        self.assertFalse([x for x in insights_tool_weather.build(f)['rows'] if x['c'] == 10 and x['pace'] == 330 and x['hw'] == 2])

    def test_course_goal_tolerance_and_gate(self):
        goal_pace = 210 * 60 / 42.195
        editions = [dict(city='A', year=2020 + e, race='R') for e in range(3)]
        rows = []
        for e in range(3):
            rows += [(e, 1, None, [goal_pace * 1.019] * 9, 100 * e + i) for i in range(40)]
            rows += [(e, 1, None, [goal_pace * 1.03] * 9, 1000 + 100 * e + i) for i in range(40)]   # outside ±2%
        f = make(rows, editions)
        self.plain_cohort(insights_tool_coursegoal, f)
        self.patch(insights_tool_coursegoal, 'edition_context', lambda eds: self.context([8, 12, 15]))
        out = insights_tool_coursegoal.build(f)
        row = [x for x in out['rows'] if x['goal'] == 210][0]
        self.assertEqual((row['n'], row['ed'], row['under']), (120, 3, 0.0))
        self.assertEqual(out['courses'][0]['start_temp_c'], [8.0, 15.0])


class Reader(unittest.TestCase):
    def test_reader_verifies_shards_and_counts(self):
        good = dict(id=1, edition=0, eligible=True, age=30, sex='F', times=times_for([300] * 9))
        held = dict(id=2, edition=0, eligible=False, age=None, sex='M', times=[None] * 9)
        profiles = [{'id': 1, 'races': [good]}, {'id': 2, 'races': [held]}]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'profiles').mkdir()
            shard = gzip.compress(json.dumps({'release_tag': 'example', 'profiles': profiles}).encode())
            (root / 'profiles/000.json.gz').write_bytes(shard)
            manifest = dict(release_tag='example', editions=[dict(city='Example', year=2020)],
                            shards={'profiles/000.json.gz': dict(bytes=len(shard), sha256=digest(shard))},
                            raw_records=2, eligible_records=1)
            original = insights_data.verified_manifest
            insights_data.verified_manifest = lambda *_: (manifest, 'sha')
            try:
                f, _, _ = insights_data.read_finishes(root, {'tag': 'example'}, root)
                self.assertEqual(f.n, 1)
                self.assertEqual(f.gender.tolist(), [2])
                self.assertEqual(f.raw_by_edition.tolist(), [2])
                manifest['eligible_records'] = 2
                with self.assertRaisesRegex(ValueError, 'Eligible record count'):
                    insights_data.read_finishes(root, {'tag': 'example'}, root)
                manifest['eligible_records'] = 1
                (root / 'profiles/000.json.gz').write_bytes(shard + b'x')
                with self.assertRaisesRegex(ValueError, 'checksum/size mismatch'):
                    insights_data.read_finishes(root, {'tag': 'example'}, root)
            finally:
                insights_data.verified_manifest = original


if __name__ == '__main__':
    unittest.main()
