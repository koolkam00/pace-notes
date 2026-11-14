"""Tests for the linked-records builders (docs/LINKED_RECORDS.md) on small synthetic fixtures: the pair model (known
readings, order terms and drift recovered; the floors; the largest connected set; readings the pairs do not determine),
the one-marathon-per-year rule, recorded bests, the age rule (exact birth years only, age-group floors never), the
verdicts, every floor, and the scan of what may be published.
Run: python3 -I -m unittest discover -s analysis -p 'test_linked*.py'
"""
from __future__ import annotations

import math
import unittest

import numpy as np
import pandas as pd

import linked_common as lc
import linked_histories as lh
import linked_model as lm
import linked_races as lr
import linked_return as lret


def results_frame(rows):
    """rows: (person, edition, year, fin[, sex, high, exact_yob, eligible, slow, n_any]) -> the builders' results frame."""
    cols = ['person', 'edition', 'year', 'fin', 'sex', 'high', 'exact_yob', 'eligible', 'slow', 'n_any']
    defaults = [None, None, None, None, 1, True, -1, False, False, 0]
    data = [list(r) + defaults[len(r):] for r in rows]
    f = pd.DataFrame(data, columns=cols).sort_values(['person', 'year', 'edition']).reset_index(drop=True)
    f['first_any'] = f.groupby('person').year.transform('min')
    return f.astype({'person': np.int32, 'edition': np.int32, 'year': np.int16, 'fin': float, 'sex': np.int8, 'high': bool,
                     'exact_yob': np.int16, 'eligible': bool, 'slow': bool, 'n_any': np.int32})


class Synthetic:
    """Runners with two results each, generated from the model itself: a later result carries its race's order term
    and the drift, an earlier one the opposite order term."""

    def __init__(self, seed=7, races=4, years=(2015, 2016, 2017, 2018), per_link=130, noise=0.0, same_year=40):
        rng = np.random.default_rng(seed)
        self.units = [(r, y) for r in range(races) for y in years]
        self.unit_code = {u: i for i, u in enumerate(self.units)}
        self.group_of_unit = np.array([u[0] for u in self.units])
        self.beta = rng.normal(0, 0.03, len(self.units))
        self.kappa = rng.normal(0, 0.01, races)
        self.gamma = np.array([0.004, 0.011])
        person, unit, year, lf = [], [], [], []
        pid = 0
        for a in self.units:
            for b in self.units:
                gap = b[1] - a[1]
                if a == b or gap < 0 or gap > 2 or (gap == 0 and a[0] >= b[0]):
                    continue
                n = same_year if gap == 0 else per_link // (2 if a[0] == b[0] else 4)
                for _ in range(n):
                    ability = rng.normal(9.6, 0.15)
                    ta = ability + self.beta[self.unit_code[a]] + rng.normal(0, noise)
                    tb = ability + self.beta[self.unit_code[b]] + rng.normal(0, noise)
                    if gap > 0:
                        ta -= self.kappa[a[0]]
                        tb += self.kappa[b[0]] + self.gamma[gap - 1]
                    person += [pid, pid]
                    unit += [self.unit_code[a], self.unit_code[b]]
                    year += [a[1], b[1]]
                    lf += [ta, tb]
                    pid += 1
        order = np.lexsort((unit, year, person))
        self.person, self.unit, self.year, self.lf = (np.array(x)[order] for x in (person, unit, year, lf))

    def fit(self, **kw):
        return lm.fit(self.person, self.unit, self.group_of_unit, self.year, self.lf, **kw)

    def truth(self, f):
        """The true readings of the fitted editions under the model's two rules for them (mean zero, no trend over the
        years, both pair-weighted), and the trend those rules move into the drift."""
        return normalised(self.beta[f.units], f.years, f.unit_weight)


def normalised(beta, years, w):
    b = beta - (beta * w).sum() / w.sum()
    yc = years - (years * w).sum() / w.sum()
    trend = (b * yc * w).sum() / (yc * yc * w).sum()
    return b - trend * yc, trend


class PairModel(unittest.TestCase):
    def test_pairs_are_within_two_calendar_years_of_one_runner(self):
        person = np.array([0, 0, 0, 0, 1, 1, 2])
        year = np.array([2010, 2011, 2011, 2014, 2012, 2014, 2013])
        i, j = lm.build_pairs(person, year)
        self.assertEqual(sorted(zip(i.tolist(), j.tolist())), [(0, 1), (0, 2), (1, 2), (4, 5)])   # 2010-2014 and 2011-2014 are three or more apart
        with self.assertRaises(lc.LinkedError):
            lm.build_pairs(np.array([1, 0]), np.array([2010, 2010]))

    def test_known_readings_order_terms_and_drift_are_recovered(self):
        s = Synthetic()
        f = s.fit()
        self.assertEqual(len(f.units), len(s.units))
        truth, trend = s.truth(f)
        np.testing.assert_allclose(f.beta, truth, atol=1e-9)
        shift = f.kappa[0] - s.kappa[0]
        np.testing.assert_allclose(f.kappa, s.kappa + shift, atol=1e-9)        # the order terms, up to their shared constant
        # ... which the drift takes with twice its opposite, beside the trend the readings may not carry
        np.testing.assert_allclose(f.gamma, s.gamma + trend * np.array([1.0, 2.0]) - 2 * shift, atol=1e-9)
        # the reading when a race came first and when it came second differ by twice the order term
        first, second = f.beta[0] - f.kappa[0], f.beta[0] + f.kappa[0]
        self.assertAlmostEqual(second - first, 2 * (s.kappa[0] + shift), places=9)

    def test_a_trend_over_the_years_is_not_in_the_readings(self):
        # Every edition 0.4% slower per calendar year: the pairs cannot tell that from runners slowing 0.4% a year,
        # so the readings stay as they were and the drift takes it.
        s = Synthetic()
        f = s.fit()
        years = np.array([u[1] for u in s.units])
        tilted = s.lf + 0.004 * (years[s.unit] - 2015)
        g = lm.fit(s.person, s.unit, s.group_of_unit, s.year, tilted)
        np.testing.assert_allclose(g.beta, f.beta, atol=1e-9)
        np.testing.assert_allclose(g.kappa, f.kappa, atol=1e-9)
        np.testing.assert_allclose(g.gamma, f.gamma + 0.004 * np.array([1.0, 2.0]), atol=1e-9)
        w = f.unit_weight
        self.assertAlmostEqual(float((f.beta * w).sum()), 0.0, places=9)
        self.assertAlmostEqual(float((f.beta * w * (f.years - (f.years * w).sum() / w.sum())).sum()), 0.0, places=9)

    def test_noise_leaves_the_readings_near_the_truth_and_the_bootstrap_brackets_them(self):
        s = Synthetic(noise=0.05, per_link=400)
        f = s.fit(boot=60)
        truth, _ = s.truth(f)
        self.assertLess(np.abs(f.beta - truth).max(), 0.02)
        spread = f.boot_beta.std(axis=0, ddof=1)
        self.assertTrue(0.4 < np.abs(f.beta - truth).mean() / spread.mean() < 1.6)   # the draws spread as far as the errors do
        self.assertLess(np.abs(f.boot_beta.mean(axis=0) - f.beta).max(), 0.5 * spread.max())
        again = s.fit(boot=60)
        np.testing.assert_array_equal(f.boot_beta, again.boot_beta)            # a fixed seed: the same draws on every run

    def test_the_fit_equals_a_dense_weighted_least_squares(self):
        s = Synthetic(seed=3, races=3, years=(2015, 2016, 2017), per_link=110, noise=0.03, same_year=110)
        f = s.fit()
        i, j = lm.build_pairs(s.person, s.year)
        k = np.bincount(s.person[np.unique(np.r_[i, j])])
        w = 2.0 / k[s.person[i]]
        S, G = len(s.units), 3
        X = np.zeros((len(i), S + G + 2))
        gap = s.year[j] - s.year[i]
        X[np.arange(len(i)), s.unit[j]] += 1
        X[np.arange(len(i)), s.unit[i]] -= 1
        pos = gap > 0
        np.add.at(X, (np.flatnonzero(pos), S + s.group_of_unit[s.unit[i[pos]]]), 1)
        np.add.at(X, (np.flatnonzero(pos), S + s.group_of_unit[s.unit[j[pos]]]), 1)
        X[np.flatnonzero(pos), S + G + gap[pos] - 1] = 1
        d = s.lf[j] - s.lf[i]
        sol = np.linalg.lstsq(X * np.sqrt(w)[:, None], d * np.sqrt(w), rcond=None)[0]
        np.testing.assert_allclose(f.beta, normalised(sol[:S], f.years, f.unit_weight)[0], atol=1e-8)   # readings, under the same two rules
        np.testing.assert_allclose(f.kappa - f.kappa[0], sol[S:S + G] - sol[S], atol=1e-8)   # order terms, as differences
        self.assertEqual(f.pairs, len(i))
        self.assertEqual(f.same_year_pairs, int((~pos).sum()))

    def test_an_edition_needs_one_hundred_connecting_runners(self):
        s = Synthetic(races=3, years=(2015, 2016, 2017))
        thin = len(s.units)   # a new edition of race 0 in 2018, tied to one fitted edition by 99 runners
        base = s.unit_code[(1, 2017)]
        def with_extra(n):
            pid = s.person.max() + 1 + np.arange(n)
            person = np.r_[s.person, pid, pid]
            unit = np.r_[s.unit, np.full(n, base), np.full(n, thin)]
            year = np.r_[s.year, np.full(n, 2017), np.full(n, 2018)]
            lf = np.r_[s.lf, np.full(n, 9.5), np.full(n, 9.6)]
            order = np.lexsort((unit, year, person))
            return lm.fit(person[order], unit[order], np.r_[s.group_of_unit, 0], year[order], lf[order])
        self.assertNotIn(thin, with_extra(99).units.tolist())
        self.assertEqual(with_extra(99).dropped['under_connected_floor'], 1)
        self.assertIn(thin, with_extra(100).units.tolist())

    def test_only_the_largest_connected_set_of_editions_is_fitted(self):
        s = Synthetic(races=3, years=(2015, 2016, 2017))
        n, e1, e2, e3 = 150, len(s.units), len(s.units) + 1, len(s.units) + 2   # an island: three editions of a fourth race
        pid = s.person.max() + 1 + np.arange(3 * n)
        person = np.r_[s.person, pid, pid]
        unit = np.r_[s.unit, np.repeat([e1, e1, e2], n), np.repeat([e2, e3, e3], n)]
        year = np.r_[s.year, np.repeat([2015, 2015, 2016], n), np.repeat([2016, 2017, 2017], n)]
        lf = np.r_[s.lf, np.full(3 * n, 9.5), np.full(3 * n, 9.55)]
        order = np.lexsort((unit, year, person))
        f = lm.fit(person[order], unit[order], np.r_[s.group_of_unit, 3, 3, 3], year[order], lf[order])
        self.assertEqual(f.dropped['outside_largest_component'], 3)
        self.assertFalse({e1, e2, e3} & set(f.units.tolist()))

    def test_a_race_seen_only_as_the_later_race_is_not_fitted(self):
        # A race whose one edition is in the last year: every pair has it second, so its reading cannot be told from its order term.
        s = Synthetic(races=3, years=(2015, 2016, 2017))
        n, new = 200, len(s.units)
        pid = s.person.max() + 1 + np.arange(2 * n)
        earlier = np.r_[np.full(n, s.unit_code[(0, 2017)]), np.full(n, s.unit_code[(1, 2016)])]
        person = np.r_[s.person, pid, pid]
        unit = np.r_[s.unit, earlier, np.full(2 * n, new)]
        year = np.r_[s.year, np.r_[np.full(n, 2017), np.full(n, 2016)], np.full(2 * n, 2018)]
        lf = np.r_[s.lf, np.full(2 * n, 9.5), np.full(2 * n, 9.58)]
        order = np.lexsort((unit, year, person))
        f = lm.fit(person[order], unit[order], np.r_[s.group_of_unit, 3], year[order], lf[order])
        self.assertEqual(f.dropped['undetermined'], 1)
        self.assertNotIn(new, f.units.tolist())
        np.testing.assert_allclose(f.beta, s.truth(f)[0], atol=1e-9)   # the editions that stay keep their true readings

    def test_two_results_in_one_edition_are_refused(self):
        with self.assertRaises(lc.LinkedError):
            lm.fit(np.array([0, 0]), np.array([0, 0]), np.array([0]), np.array([2015, 2015]), np.array([9.5, 9.6]))


class Readings(unittest.TestCase):
    def test_against_the_other_years(self):
        np.testing.assert_allclose(lr.against_others(np.array([1.0, 2.0, 6.0])), [1 - 4, 2 - 3.5, 6 - 1.5])
        np.testing.assert_allclose(lr.against_others(np.array([[0.0, 1.0], [2.0, 5.0]])), [[-1, 1], [-3, 3]])

    def test_a_year_is_fast_or_slow_only_when_its_interval_clears_one_percent(self):
        self.assertEqual(lr.year_verdict(1.2, 3.0, 1.0), 'slow')
        self.assertEqual(lr.year_verdict(1.2, 3.0, None), 'slow')
        self.assertIsNone(lr.year_verdict(1.0, 3.0, 1.0))        # touching the margin is not clearing it
        self.assertIsNone(lr.year_verdict(1.2, 3.0, -0.1))       # the high-links reading points the other way
        self.assertEqual(lr.year_verdict(-3.0, -1.01, -2.0), 'fast')
        self.assertEqual(lr.year_verdict(-0.9, 0.9, None), 'usual')
        self.assertIsNone(lr.year_verdict(-0.9, 1.0, None))
        self.assertIsNone(lr.year_verdict(-1.5, 2.5, None))

    def race(self, **over):
        r = {'reading_pct': -2.0, 'lo_pct': -3.0, 'hi_pct': -1.0, 'boot_lo_pct': -2.4, 'boot_hi_pct': -1.6, 'earlier_pct': -1.5, 'later_pct': -2.5,
             'variants': {'verified': {'editions': 5, 'reading_pct': -1.9}, 'high': {'editions': 5, 'reading_pct': -2.2}, 'wider': None}}
        r.update(over)
        return r

    def test_a_race_reads_faster_or_slower_only_under_every_guard(self):
        self.assertEqual(lr.race_verdict(self.race()), 'faster')
        self.assertIsNone(lr.race_verdict(self.race(hi_pct=0.1)))                 # the interval across editions holds zero
        self.assertIsNone(lr.race_verdict(self.race(boot_hi_pct=0.1)))            # the runner bootstrap holds zero
        self.assertIsNone(lr.race_verdict(self.race(earlier_pct=0.4)))            # first and second disagree in sign
        self.assertIsNone(lr.race_verdict(self.race(variants={'verified': {'editions': 4, 'reading_pct': 0.3}, 'high': None, 'wider': None})))
        self.assertEqual(lr.race_verdict(self.race(variants={'verified': None, 'high': None, 'wider': {'editions': 9, 'reading_pct': 4.0}})), 'faster')
        slower = self.race(reading_pct=2.0, lo_pct=1.0, hi_pct=3.0, boot_lo_pct=1.6, boot_hi_pct=2.4, earlier_pct=1.5, later_pct=2.5,
                           variants={'verified': None, 'high': None, 'wider': None})
        self.assertEqual(lr.race_verdict(slower), 'slower')

    def test_about_the_same_needs_everything_inside_the_band(self):
        same = self.race(reading_pct=0.2, lo_pct=-0.9, hi_pct=1.3, boot_lo_pct=-0.1, boot_hi_pct=0.5, earlier_pct=-0.4, later_pct=0.8)
        self.assertEqual(lr.race_verdict(same), 'about_the_same')
        self.assertIsNone(lr.race_verdict({**same, 'hi_pct': 2.0}))               # a wide interval says nothing, not "the same"
        self.assertIsNone(lr.race_verdict({**same, 'later_pct': 2.3}))

    def test_the_interval_of_a_race_uses_students_t(self):
        # the table: the density integrated to the tabulated point gives 97.5%
        for df in (1, 2, 3, 4, 10, 30, 60):
            x = np.linspace(-400, lc.T975[df - 1], 2_000_001)
            density = math.gamma((df + 1) / 2) / (math.sqrt(df * math.pi) * math.gamma(df / 2)) * (1 + x * x / df) ** (-(df + 1) / 2)
            area = float(((density[1:] + density[:-1]) / 2 * np.diff(x)).sum())
            self.assertAlmostEqual(area + (0.5 - math.atan(400 / math.sqrt(df)) / math.pi if df == 1 else 0.0), 0.975, places=3)
        self.assertEqual(lc.t_multiplier(3), 4.3027)
        self.assertEqual(lc.t_multiplier(61), 2.0003)
        self.assertEqual(lc.t_multiplier(62), 2.0)
        self.assertTrue(all(a > b >= 2.0 for a, b in zip(lc.T975, lc.T975[1:])))   # never narrower than two standard errors
        with self.assertRaises(lc.LinkedError):
            lc.t_multiplier(1)

    def test_an_edition_far_from_its_race_is_held_and_enters_nothing(self):
        t = pd.DataFrame({'label': ['A'] * 5 + ['B'] * 2, 'basis': ['chip_or_net'] * 7, 'year': [2015, 2016, 2017, 2018, 2019, 2015, 2016],
                          'beta': [0.0, 0.01, -0.01, 0.005, 0.08, 0.0, 0.5], 'code': np.arange(7), 'pos': np.arange(7)})
        held = lr.held_outliers(t)
        self.assertEqual(held.tolist(), [False, False, False, False, True, False, False])   # B has two editions: no median to hold against
        self.assertAlmostEqual(lr.from_median(t)[4], 100 * math.expm1(0.08 - 0.005), places=9)
        self.assertTrue(np.isnan(lr.from_median(t)[5]))
        groups = lr.comparison_groups(t, frozenset(t.code[held].tolist()))
        self.assertEqual({k: v.tolist() for k, v in groups.items()}, {('A', 'chip_or_net'): [0, 1, 2, 3]})

    def test_editions_are_compared_only_on_the_same_timing_basis(self):
        t = pd.DataFrame({'label': ['A'] * 7, 'basis': ['chip_or_net'] * 3 + ['gun'] * 3 + [None], 'year': list(range(2010, 2017)),
                          'beta': np.zeros(7), 'code': np.arange(7), 'pos': np.arange(7)})
        groups = lr.comparison_groups(t)
        self.assertEqual({k: v.tolist() for k, v in groups.items()}, {('A', 'chip_or_net'): [0, 1, 2], ('A', 'gun'): [3, 4, 5]})
        self.assertEqual(lr.comparison_groups(t, min_editions=4), {})

    def test_runners_that_tie_a_race_to_other_races_are_counted_each_way(self):
        # editions 0 and 1 are race A (2015, 2016), 2 is race B (2016), 3 is race C (2017)
        t = pd.DataFrame({'race': [0, 0, 1, 2], 'pos': np.arange(4)})
        fit = lm.Fit(units=np.arange(4), groups=np.arange(3), years=np.array([2015, 2016, 2016, 2017]), beta=np.zeros(4), kappa=np.zeros(3),
                     gamma=np.zeros(2), unit_weight=np.ones(4), runners=np.ones(4), pairs=6, people=5, same_year_pairs=1, dropped={},
                     pair_person=np.array([0, 1, 1, 2, 3, 4]), pair_ua=np.array([0, 0, 1, 1, 2, 0]), pair_ub=np.array([1, 3, 3, 2, 3, 2]),
                     pair_gap=np.array([1, 2, 1, 0, 1, 1]))
        # runner 0: A then A (the same race: not counted); runner 1: A then C, twice (one runner); runner 2: A and B in one year (no order);
        # runner 3: B then C (not A); runner 4: A then B
        self.assertEqual(lr.people_by_way(fit, t, np.array([0, 1])), (2, 0))
        self.assertEqual(lr.people_by_way(fit, t, np.array([2])), (1, 1))
        self.assertEqual(lr.people_by_way(fit, t, np.array([3])), (0, 2))

    def test_the_relation_inside_races_removes_each_race_mean(self):
        frame = pd.DataFrame({'label': ['A'] * 3 + ['B'] * 3 + ['C'] * 2, 'basis': ['chip_or_net'] * 8,
                              'x': [1.0, 2.0, 3.0, 11.0, 12.0, 13.0, 50.0, 90.0], 'y': [10.0, 20.0, 30.0, 0.0, 10.0, 20.0, 5.0, 500.0]})
        rel = lr.within_relation(frame, 'x', 'y', 3)
        self.assertEqual((rel['editions'], rel['groups'], rel['r'], rel['slope']), (6, 2, 1.0, 10.0))
        self.assertIsNone(lr.within_relation(frame, 'x', 'y', 4))


class RaceLevels(unittest.TestCase):
    RHO = {'A': -0.02, 'B': 0.01, 'C': 0.03}
    TAU = {2014: 0.004, 2015: -0.006, 2016: 0.010, 2017: 0.0, 2018: -0.012, 2019: 0.007}

    def table(self, years_of=None):
        rows = []
        for label, rho in self.RHO.items():
            for year, tau in self.TAU.items():
                if years_of is None or year in years_of[label]:
                    rows.append({'label': label, 'basis': 'chip_or_net', 'year': year, 'beta': rho + tau})
        t = pd.DataFrame(rows)
        t['code'] = np.arange(len(t))
        t['pos'] = np.arange(len(t))
        return t

    def test_race_and_year_levels_are_recovered(self):
        t = self.table()
        two = lr.TwoWay(t, np.ones(len(t)))
        rho, tau, resid = two.split(t.beta.to_numpy())
        self.assertEqual(two.groups, [(x, 'chip_or_net') for x in 'ABC'])
        mean_tau = np.mean(list(self.TAU.values()))
        np.testing.assert_allclose(rho, [v + mean_tau for v in self.RHO.values()], atol=1e-12)   # the year levels have mean zero
        np.testing.assert_allclose(tau, [v - mean_tau for v in self.TAU.values()], atol=1e-12)
        np.testing.assert_allclose(resid, 0, atol=1e-12)
        draws = np.vstack([t.beta.to_numpy(), t.beta.to_numpy() + 0.5])
        np.testing.assert_allclose(two.split(draws)[0][1] - two.split(draws)[0][0], 0.5, atol=1e-12)   # many draws at once

    def test_a_race_is_read_against_the_other_races_of_the_same_years(self):
        # A is seen in the early years only and C in the late ones: their plain means carry the years they were seen in.
        t = self.table({'A': {2014, 2015, 2016, 2017}, 'B': set(self.TAU), 'C': {2016, 2017, 2018, 2019}})
        two = lr.TwoWay(t, np.ones(len(t)))
        rho, _, _ = two.split(t.beta.to_numpy())
        np.testing.assert_allclose(rho - rho[1], [-0.03, 0.0, 0.02], atol=1e-12)
        plain = t.groupby('label').beta.mean()
        self.assertGreater(abs((plain['A'] - plain['B']) + 0.03), 1e-3)
        # ... and a trend over the years that every edition shares moves no race against another
        tilted = t.beta.to_numpy() + 0.004 * (t.year.to_numpy() - 2014)
        rho2, _, _ = two.split(tilted)
        np.testing.assert_allclose(rho2 - rho2[1], rho - rho[1], atol=1e-12)

    def test_the_standard_error_allows_for_thin_years(self):
        rng = np.random.default_rng(4)
        # Dense years: twelve races in every year. The leverage-corrected form is close to the plain spread over root n.
        rows = [{'label': f'R{r:02d}', 'basis': 'chip_or_net', 'year': y, 'beta': rng.normal(0, 0.02)} for r in range(12) for y in range(2010, 2020)]
        t = pd.DataFrame(rows)
        t['code'] = t['pos'] = np.arange(len(t))
        two = lr.TwoWay(t, np.ones(len(t)))
        _, _, resid = two.split(t.beta.to_numpy())
        for gi in range(12):
            plain = resid[two.g == gi].std(ddof=1) / math.sqrt(10)
            self.assertGreaterEqual(two.level_se(resid, gi), plain)
            self.assertLess(two.level_se(resid, gi), 1.25 * plain)
        # Thin years: a race whose three years it shares with one other race only. Its year levels take half of its own
        # deviations, so the plain spread understates what is known about its level.
        thin = [{'label': 'Thin', 'basis': 'chip_or_net', 'year': y, 'beta': b} for y, b in zip((2001, 2002, 2003), (0.03, -0.02, 0.01))]
        mate = [{'label': 'R00', 'basis': 'chip_or_net', 'year': y, 'beta': 0.0} for y in (2001, 2002, 2003)]
        t2 = pd.concat([t, pd.DataFrame(thin + mate)], ignore_index=True)
        t2['code'] = t2['pos'] = np.arange(len(t2))
        two2 = lr.TwoWay(t2, np.ones(len(t2)))
        _, _, resid2 = two2.split(t2.beta.to_numpy())
        gi = two2.groups.index(('Thin', 'chip_or_net'))
        plain = resid2[two2.g == gi].std(ddof=1) / math.sqrt(3)
        self.assertGreater(two2.level_se(resid2, gi), 1.3 * plain)
        self.assertAlmostEqual(float(two2.leverage.sum()), len(two2.groups) + len(two2.years) - 1, places=8)   # the levels the split fits

    def test_only_the_largest_tied_set_of_races_and_years_is_split(self):
        t = self.table()
        island = pd.DataFrame({'label': ['Z'] * 3, 'basis': ['chip_or_net'] * 3, 'year': [1990, 1991, 1992], 'beta': [0.5, 0.5, 0.5],
                               'code': [100, 101, 102], 'pos': [18, 19, 20]})
        t = pd.concat([t, island], ignore_index=True)
        two = lr.TwoWay(t, np.ones(len(t)))
        self.assertEqual(two.groups, [(x, 'chip_or_net') for x in 'ABC'])
        self.assertEqual(len(two.pos), 18)
        held = lr.TwoWay(t, np.ones(len(t)), exclude_codes=frozenset({0}))
        self.assertEqual(len(held.pos), 17)

    def test_a_variant_fit_is_put_on_the_main_fits_rules(self):
        t = self.table()
        variant = t.iloc[2:].copy()
        variant['beta'] = variant.beta + 0.02 + 0.003 * (variant.year - 2010)     # another zero and another trend
        variant['pos'] = np.arange(len(variant))
        np.testing.assert_allclose(lr.align(variant, t, np.linspace(1, 2, len(t))), t.beta.to_numpy()[2:], atol=1e-12)


def history_of(rows):
    return lh.history(results_frame(rows))


class Histories(unittest.TestCase):
    def test_one_marathon_per_year_rule(self):
        h = history_of([(0, 0, 2015, 14000), (0, 1, 2016, 13900), (0, 2, 2016, 13800), (0, 3, 2018, 13700),
                        (1, 0, 2015, 15000), (1, 3, 2018, 14900)])
        self.assertEqual(h.one_per_year.tolist(), [False] * 4 + [True] * 2)
        self.assertEqual(h.attempt.tolist(), [1, 2, 3, 4, 1, 2])
        self.assertEqual(lh.best_counts(h), {2: (1, 1)})                        # the runner with two marathons in 2016 enters nothing
        self.assertEqual(len(lh.step_pairs(h, max_gap=None)), 1)
        self.assertEqual(len(lh.step_pairs(h)), 0)                              # 2015 to 2018 is more than two years apart

    def test_a_recorded_best_is_faster_than_every_earlier_one(self):
        h = history_of([(0, 0, 2010, 15000), (0, 1, 2011, 14000), (0, 2, 2012, 14000), (0, 3, 2013, 14500), (0, 4, 2015, 13999)])
        self.assertEqual(np.nan_to_num(h.best_prior.to_numpy(), nan=-1).tolist(), [-1, 15000, 14000, 14000, 14000])
        self.assertEqual(np.nan_to_num(h.best_year.to_numpy(), nan=-1).tolist(), [-1, 2010, 2011, 2012, 2012])   # the latest year that holds the best
        self.assertEqual(lh.best_counts(h), {2: (1, 1), 3: (1, 0), 4: (1, 0), 5: (1, 1)})                       # a tie is not a new best

    def test_a_share_is_called_only_under_its_guard(self):
        self.assertEqual(lh.share_verdict(540, 1000, 0.5, [0.53, 0.55, None]), 'more_often')
        self.assertIsNone(lh.share_verdict(540, 1000, 0.5, [0.49, 0.55, None]))      # a variant on the other side
        self.assertIsNone(lh.share_verdict(505, 1000, 0.5, []))                      # inside one point, but the interval is wider
        self.assertEqual(lh.share_verdict(50_500, 100_000, 0.5, []), 'as_often')
        self.assertEqual(lh.share_verdict(1_790, 10_000, 0.2, [0.17, 0.18, 0.19]), 'less_often')
        self.assertIsNone(lh.share_verdict(60, 110, 0.5, []))                        # 4.5 points off on 110 results: under 1.96 standard errors
        self.assertIsNone(lh.share_verdict(60, 99, 0.5, []))                         # under the floor

    def test_birth_years_come_only_from_exact_ages(self):
        person = np.array([0, 0, 0, 1, 1, 2, 2, 3, 4, 4, 4])
        exact = np.array([1980, 1981, 1981, 1975, 1977, -1, -1, 1990, 1970, 1971, -1])
        self.assertEqual(lh.birth_years(person, exact, 5).tolist(), [1981, -1, -1, 1990, 1970])   # more frequent; span over one year; none; one; tie to the earlier

    def test_age_pairs_use_exact_birth_years_and_never_an_age_group_floor(self):
        rows = []
        for p in range(3):   # runner 0: exact birth year; runner 1: only age-group floors (no exact year); runner 2: exact, two marathons in one year
            for k, year in enumerate((2010, 2011, 2012, 2014, 2018)):
                rows.append((p, k, year, 14000 * (1.01 ** (year - 2010)), 1, True, 1970 if p != 1 else -1))
        rows.append((2, 9, 2011, 15000, 1, True, 1970))
        h = lh.history(results_frame(rows))
        pairs, cross = lh.age_table(h, np.zeros(10, dtype=np.int64))
        self.assertEqual(len(pairs), 3)                                         # runner 0 only: 2010-11, 2011-12, 2012-14 (2014-18 is four years apart)
        self.assertEqual(pairs.from_attempt.tolist(), [1, 2, 3])
        np.testing.assert_allclose(pairs.rate, math.log(1.01))
        self.assertEqual(pairs.mid_age.tolist(), [40.5, 41.5, 43.0])
        self.assertEqual(pairs.seen_again.tolist(), [True, True, True])
        self.assertEqual(len(cross), 11)                                        # every result of the two runners with an exact birth year

    def test_age_bands(self):
        self.assertEqual(lh._band_index(np.array([18.0, 24.5, 25.0, 29.9, 69.5, 70.0, 85.0])).tolist(), [0, 0, 1, 1, 9, 10, 10])


def bests_fixture(n_runners=260, attempts=4, seed=5, thin_from=None):
    rng = np.random.default_rng(seed)
    rows = []
    for p in range(n_runners):
        k = attempts if thin_from is None or p < thin_from else 2
        base = rng.uniform(11000, 20000)
        for a in range(k):
            rows.append((p, a, 2010 + a, base * math.exp(rng.normal(0, 0.05)), 1 + p % 2, p % 3 != 0, 1975 if p % 4 else -1, False, False, k))
    return results_frame(rows)


class Bests(unittest.TestCase):
    def setUp(self):
        self.r = bests_fixture()
        self.editions = pd.DataFrame({'code': np.arange(4), 'tier': ['stamped', 'stamped', 'partial', 'stamped_weaker_source'], 'race': [0, 1, 2, 3]})
        ones = np.ones(len(self.r), dtype=bool)
        self.masks = {'F': ones, 'verified': self.r.edition.to_numpy() != 2, 'high': self.r.high.to_numpy(), 'complete': ones}

    def test_the_table_recounts_and_stops_where_an_attempt_is_thin(self):
        b = lh.build_bests(self.r, self.editions, self.masks)
        self.assertEqual([row['recorded_attempt'] for row in b['by_recorded_attempt']], [2, 3, 4])
        h = lh.history(self.r)
        for row in b['by_recorded_attempt']:
            a = row['recorded_attempt']
            sel = h[h.attempt == a]
            self.assertEqual(row['results'], len(sel))
            self.assertEqual(row['recorded_bests'], int((sel.fin < sel.best_prior).sum()))
            self.assertEqual(row['shuffled_share'], round(1 / a, 10))
        self.assertEqual(b['cohort']['tiers'], {'stamped': 260, 'stamped_weaker_source': 260, 'partial': 260})
        thin = bests_fixture(thin_from=99)        # only 99 runners have a third and a fourth recorded marathon
        ones = np.ones(len(thin), dtype=bool)
        b = lh.build_bests(thin, self.editions, {'F': ones, 'verified': ones, 'high': ones, 'complete': ones})
        self.assertEqual([row['recorded_attempt'] for row in b['by_recorded_attempt']], [2])
        self.assertEqual([row['from_recorded_attempt'] for row in b['steps']['by_step']], [1])

    def test_a_variant_under_the_floor_is_left_out(self):
        masks = dict(self.masks, high=self.r.person.to_numpy() < 99)
        b = lh.build_bests(self.r, self.editions, masks)
        self.assertTrue(all(row['variants']['high'] is None for row in b['by_recorded_attempt']))
        self.assertTrue(all(row['variants']['verified'] is not None for row in b['by_recorded_attempt'][:1]))

    def test_the_first_step_is_banded_by_the_mean_of_the_two_finishes_only(self):
        b = lh.build_bests(self.r, self.editions, self.masks)
        bands = b['steps']['first_recorded_to_second_by_mean_finish']
        self.assertTrue(all(row['pairs'] >= 100 for row in bands))
        self.assertTrue(all(set(row) >= {'mean_finish_from_s', 'mean_finish_to_s', 'faster', 'pairs'} for row in bands))
        self.assertLessEqual(sum(row['pairs'] for row in bands), b['steps']['by_step'][0]['pairs'])

    def test_fewer_than_one_hundred_second_marathons_is_refused(self):
        r = bests_fixture(n_runners=99)
        ones = np.ones(len(r), dtype=bool)
        with self.assertRaises(lc.LinkedError):
            lh.build_bests(r, self.editions, {'F': ones, 'verified': ones, 'high': ones, 'complete': ones})


class Age(unittest.TestCase):
    def fixture(self, n=450, with_floor_runners=200):
        rng = np.random.default_rng(11)
        rows = []
        for p in range(n + with_floor_runners):
            yob = int(rng.integers(1950, 1980))
            exact = yob if p < n else -1     # the last runners carry age-group floors only: they have no exact birth year
            base = rng.uniform(11000, 19000)
            for a in range(6):
                year = 2008 + 2 * a
                rows.append((p, a % 4, year, base * math.exp(0.008 * 2 * a + rng.normal(0, 0.01)), 1 + p % 2, p % 5 != 0, exact))
        return results_frame(rows)

    def test_bands_floors_and_variants(self):
        r = self.fixture()
        editions = pd.DataFrame({'code': np.arange(4), 'tier': ['stamped', 'stamped', 'partial', 'stamped'], 'race': [0, 0, 1, 1]})
        ones = np.ones(len(r), dtype=bool)
        age = lh.build_age(r, editions, {'F': ones, 'verified': r.edition.to_numpy() != 2, 'high': r.high.to_numpy()})
        self.assertEqual(age['cohort']['people_with_an_exact_birth_year'], 450)
        self.assertEqual(age['cohort']['pairs'], 450 * 5)
        self.assertEqual(age['cohort']['pairs_from_the_third_recorded_marathon'], 450 * 3)
        self.assertTrue(all(b['pairs'] >= 100 for b in age['bands']))
        ages = [(b['age_from'], b['age_to']) for b in age['bands']]
        self.assertEqual(ages, sorted(ages))
        for b in age['bands']:
            self.assertAlmostEqual(b['median_pct_per_year'], 100 * math.expm1(0.008), delta=0.25)
            for part in (b['same_race'], b['verified'], b['high'], b['by_sex']['F'], b['by_sex']['M']):
                self.assertTrue(part is None or part['pairs'] >= 100)
            for part in b['cross_section'].values():
                self.assertTrue(part is None or part['results'] >= 100)
        self.assertEqual(age['years_apart'], [1, 3])

    def test_runners_with_age_group_floors_only_never_enter(self):
        r = self.fixture(n=0, with_floor_runners=300)
        editions = pd.DataFrame({'code': np.arange(4), 'tier': ['stamped'] * 4, 'race': [0, 0, 1, 1]})
        ones = np.ones(len(r), dtype=bool)
        with self.assertRaises(lc.LinkedError):
            lh.build_age(r, editions, {'F': ones, 'verified': ones, 'high': ones})


class Return(unittest.TestCase):
    def test_next_year(self):
        person = np.array([0, 0, 0, 1, 1, 2])
        year = np.array([2010, 2010, 2013, 2011, 2012, 2015])
        self.assertEqual(lret.next_year(person, year).tolist(), [2013, 2013, 0, 2012, 0, 0])

    def test_the_matched_comparison_weights_cells_by_their_finishes_with_a_slowdown(self):
        rows, pid = [], 0
        def cell(edition, fin, n_slow, back_slow, n_not, back_not):
            nonlocal pid
            for slow, n, back in ((True, n_slow, back_slow), (False, n_not, back_not)):
                for i in range(n):
                    rows.append((pid, edition, 2012, fin, 1, True, -1, True, slow, 1))
                    if i < back:
                        rows.append((pid, 9, 2014, fin))
                    pid += 1
        cell(0, 14400, 40, 10, 60, 30)      # 25% against 50%
        cell(1, 15000, 60, 30, 20, 5)       # 50% against 25%
        cell(2, 15000, 19, 19, 50, 0)       # under 20 on one side: no cell
        cell(3, 16000, 30, 3, 30, 6)
        r = results_frame(rows)
        c, raw = lret.cells(r)
        self.assertEqual(len(c), 3)
        with_, without = lret.matched(c)
        self.assertAlmostEqual(with_, 43 / 130)
        self.assertAlmostEqual(without, (40 * 0.5 + 60 * 0.25 + 30 * 0.2) / 130)
        self.assertEqual(raw['with_slowdown'], {'finishes': 149, 'seen_again': 62})
        editions = pd.DataFrame({'code': np.arange(10), 'tier': ['stamped'] * 10})
        out = lret.build(r, editions, {'F': np.ones(len(r), dtype=bool), 'high': np.ones(len(r), dtype=bool)}, reps=50)
        self.assertEqual((out['cells'], out['editions'], out['with_slowdown']['finishes']), (3, 3, 130))
        self.assertLessEqual(out['difference_lo_points'], out['difference_points'])
        self.assertLessEqual(out['difference_points'], out['difference_hi_points'])
        two = results_frame([row for row in rows if row[1] in (0, 1, 9)])
        self.assertIsNone(lret.build(two, editions, {'F': np.ones(len(two), dtype=bool), 'high': np.ones(len(two), dtype=bool)}, reps=10))   # two editions


class Published(unittest.TestCase):
    LABELS = frozenset({'Berlin', 'Runners World Marathon'})

    def ok(self, value):
        lc.check_published(value, 'file', self.LABELS)

    def bad(self, value):
        with self.assertRaises(lc.LinkedError):
            lc.check_published(value, 'file', self.LABELS)

    def test_no_identifier_name_or_person_id(self):
        self.ok({'races': {'Berlin': {'2019': {'tier': 'stamped', 'finishes': 5000, 'verdict': None}}}})
        for key in ('runner', 'runner_id', 'person_id', 'name', 'bib', 'record_id', 'id', 'match_key', 'url'):
            self.bad({key: 1})
        self.bad({'rule': 'linked by p51_6a939b600f1cf575'})
        self.bad({'label': 'Springfield'})                                  # not a registry label
        self.ok({'label': 'Runners World Marathon'})
        self.bad({'note': 'a free string'})
        self.bad({'tier': 'held_for_review'})
        self.bad({'list': ['Berlin']})

    def test_no_rank_no_order_no_converted_time(self):
        for key in ('rank', 'race_rank', 'order', 'sorted_order', 'position', 'fastest', 'equivalent_time', 'adjusted_s', 'converted'):
            self.bad({key: 1})
        self.ok({'earlier_pct': 1.0, 'later_pct': 2.0, 'shuffled_share': 0.5})

    def test_best_and_first_say_recorded(self):
        self.bad({'best_share': 0.5})
        self.bad({'first_to_second': {}})
        self.ok({'recorded_bests': 5, 'first_recorded_to_second': {}})
        self.bad({'rule': 'the share of results that were a best so far'})
        self.ok({'rule': 'the share of results that were a recorded best so far'})

    def test_words_no_file_string_may_hold(self):
        for text in ('this is the fastest race', 'a 3:45 is equivalent to a 3:39', 'what your chance of a best is', 'the heat cost five percent',
                     'runners hit the wall', 'slower because of the heat', 'a recorded PB', 'a debut marathon', 'you will slow one percent a year',
                     'a slowdown puts runners off', 'ranked by reading', 'from the pace-notes-marathon-half-20261113-1113 release', 'a goal time'):
            self.assertTrue(lc.word_problems(text) or lc.RELEASE_LABEL.search(text), text)
            self.bad({'rule': text})
        self.ok({'rule': 'records linked by name; a first recorded marathon is the first in these records'})

    def test_numbers_are_finite_and_plain(self):
        self.bad({'x': float('nan')})
        self.bad({'x': np.int64(1)})
        self.ok({'x': 1.5, 'y': [1, 2.5, None, True]})
        self.assertEqual(lc.pct(-0.0004), 0.0)
        self.assertEqual(str(lc.pct(-0.0004)), '0.0')
        self.assertEqual(lc.encode({'b': 1, 'a': [1.5, None]}), b'{"a":[1.5,null],"b":1}\n')


class TimingClasses(unittest.TestCase):
    def test_every_code_has_a_basis_and_a_mixed_edition_has_none(self):
        self.assertEqual(set(lc.TIMING_CLASS.values()), set(lc.TIMING_CODES))
        self.assertEqual(set(lc.TIMING_BASIS), set(lc.TIMING_CODES))
        self.assertIsNone(lc.TIMING_BASIS['mixed'])
        self.assertEqual({lc.TIMING_BASIS[c] for c in ('chip', 'chip_fallback')}, {lc.RACE_BASIS})
        self.assertEqual(lc.TIMING_CLASS[None], 'not_stated')


if __name__ == '__main__':
    unittest.main()
