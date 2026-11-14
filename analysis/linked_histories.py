"""Recorded bests, the steps between recorded marathons, and getting older in the same linked runner
(docs/LINKED_RECORDS.md, sections 5 and 6).

A runner's history is the runner's kept results in the universe at hand, in calendar-year order. The release dates
too few editions to order two marathons of one year, so every figure here keeps only runners with at most one kept
result in every calendar year (the one-marathon-per-year rule); an attempt number is the result's place in that order.
"First", "second" and "best" always mean first, second and best in these records.

Every function takes the kept results of one universe (F, or a variant: verified tiers only, high links only, or the
runners none of whose linked records lies outside their kept results) and returns counts; nothing is rounded here.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

import linked_common as lc
from linked_common import MIN_CELL, fail, log_pct, num, pct, sh

AGE_BANDS = ((18, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 49), (50, 54), (55, 59), (60, 64), (65, 69), (70, 85))
MEAN_FINISH_BANDS = ((None, 10800), (10800, 12600), (12600, 14400), (14400, 16200), (16200, 18000), (18000, 21600), (21600, None))
YEARS_SINCE_CAP = 10          # "ten or more calendar years since the previous recorded best", narrowed when a bin is thin
SURVIVOR_YEARS = (2012, 2019)   # the later result of a survivorship pair
SURVIVOR_AGES = (45, 64)
VARIANTS = ('verified', 'high', 'complete')


def history(results: pd.DataFrame) -> pd.DataFrame:
    """The results with their place in the runner's recorded history. `results` is sorted by (person, year)."""
    person = results.person.to_numpy()
    year = results.year.to_numpy().astype(np.int64)
    fin = results.fin.to_numpy()
    n = len(person)
    if n == 0:
        fail('no results')
    if np.any(np.diff(person) < 0) or np.any((np.diff(person) == 0) & (np.diff(year) < 0)):
        fail('results must be sorted by runner, then year')
    start = np.r_[True, person[1:] != person[:-1]]
    first = np.flatnonzero(start)
    group = np.cumsum(start) - 1
    size = np.diff(np.r_[first, n])
    attempt = np.arange(n) - first[group] + 1
    same_year = np.r_[False, (~start[1:]) & (year[1:] == year[:-1])]
    multi = np.zeros(len(first), dtype=bool)
    multi[group[same_year]] = True
    h = results.copy()
    h['attempt'] = attempt
    h['n_total'] = size[group]
    h['one_per_year'] = ~multi[group]
    running = pd.Series(fin).groupby(group, sort=False).cummin().to_numpy()
    best_prior = np.r_[np.nan, running[:-1]]
    best_prior[start] = np.nan
    at_best = pd.Series(np.where(fin == running, year, np.nan)).ffill().to_numpy()
    best_year = np.r_[np.nan, at_best[:-1]]
    best_year[start] = np.nan
    h['best_prior'] = best_prior
    h['best_year'] = best_year
    h['prev_fin'] = np.where(start, np.nan, np.r_[np.nan, fin[:-1]])
    h['prev_year'] = np.where(start, np.nan, np.r_[np.nan, year[:-1].astype(float)])
    return h


def share_verdict(k: int, n: int, expected: float, variant_shares) -> str | None:
    """A share against what an uninformative order would give. more_often or less_often only when the share is more than
    BESTS_MARGIN away, further than 1.96 binomial standard errors under the expected share, and every variant that
    exists is on the same side; as_often only when the share and its 1.96-standard-error interval lie inside the
    margin; else no verdict."""
    if n < MIN_CELL:
        return None
    share = k / n
    diff = share - expected
    se = math.sqrt(expected * (1 - expected) / n)
    others = [v - expected for v in variant_shares if v is not None]
    if abs(diff) > lc.BESTS_MARGIN and abs(diff) > 1.96 * se and all(v * diff > 0 for v in others):
        return 'more_often' if diff > 0 else 'less_often'
    if abs(diff) + 1.96 * se <= lc.BESTS_MARGIN:
        return 'as_often'
    return None


def _quantiles(values) -> list[float]:
    v = np.sort(np.asarray(values, dtype=float))
    out = []
    for q in (0.25, 0.5, 0.75):
        pos = (len(v) - 1) * q
        lo = int(math.floor(pos))
        hi = min(lo + 1, len(v) - 1)
        out.append(float(v[lo] + (v[hi] - v[lo]) * (pos - lo)))
    return out


def tier_mix(codes: np.ndarray, editions: pd.DataFrame) -> dict:
    tiers = editions.tier.to_numpy()[codes]
    return {tier: int((tiers == tier).sum()) for tier in lc.F_TIERS}


# ---------------------------------------------------------------------------------------------------------------
# Recorded bests and the steps between recorded marathons
# ---------------------------------------------------------------------------------------------------------------
def best_counts(h: pd.DataFrame) -> dict:
    """attempt -> (results, recorded bests so far) for one-per-year runners' results with an earlier recorded marathon."""
    later = h[h.one_per_year & (h.attempt >= 2)]
    is_best = later.fin.to_numpy() < later.best_prior.to_numpy()
    n = np.bincount(later.attempt.to_numpy())
    k = np.bincount(later.attempt.to_numpy(), weights=is_best).astype(np.int64)
    return {a: (int(n[a]), int(k[a])) for a in range(2, len(n)) if n[a]}


def step_pairs(h: pd.DataFrame, max_gap: int | None = lc.STEP_MAX_GAP) -> pd.DataFrame:
    """Consecutive recorded marathons of one-per-year runners: the earlier attempt number, the two finishes, the change."""
    later = h[h.one_per_year & (h.attempt >= 2)]
    gap = later.year.to_numpy() - later.prev_year.to_numpy()
    out = pd.DataFrame({'step': later.attempt.to_numpy() - 1, 'gap': gap.astype(np.int64), 'f1': later.prev_fin.to_numpy(), 'f2': later.fin.to_numpy()})
    out['d'] = np.log(out.f2 / out.f1)
    return out if max_gap is None else out[out.gap <= max_gap]


def _step_row(d: np.ndarray) -> dict:
    q25, q50, q75 = _quantiles(d)
    return {'pairs': int(len(d)), 'faster': int((d < 0).sum()), 'median_pct': pct(log_pct(q50)), 'q25_pct': pct(log_pct(q25)), 'q75_pct': pct(log_pct(q75))}


def build_bests(results: pd.DataFrame, editions: pd.DataFrame, masks: dict) -> dict:
    """bests.json. `masks`: universe name -> boolean mask over `results` ('F' and the variants)."""
    hist = {name: history(results[mask]) for name, mask in masks.items()}
    h = hist['F']
    counts = {name: best_counts(x) for name, x in hist.items()}
    main = counts['F']
    last = 1
    while main.get(last + 1, (0, 0))[0] >= MIN_CELL:
        last += 1
    if last < 2:
        fail('no attempt holds 100 results with an earlier recorded marathon')
    by_attempt = []
    for a in range(2, last + 1):
        n, k = main[a]
        row = {'recorded_attempt': a, 'results': n, 'recorded_bests': k, 'share': sh(k / n), 'shuffled_share': sh(1 / a), 'variants': {}}
        shares = []
        for name in VARIANTS:
            vn, vk = counts[name].get(a, (0, 0))
            row['variants'][name] = {'results': vn, 'recorded_bests': vk} if vn >= MIN_CELL else None
            shares.append(vk / vn if vn >= MIN_CELL else None)
        row['verdict'] = share_verdict(k, n, 1 / a, shares)
        by_attempt.append(row)

    later = h[h.one_per_year & (h.attempt >= 2)]
    is_best = later.fin.to_numpy() < later.best_prior.to_numpy()
    # years since the previous recorded best, third and later recorded marathons
    third = later.attempt.to_numpy() >= 3
    since = (later.year.to_numpy() - later.best_year.to_numpy())[third].astype(np.int64)
    if len(since) and since.min() < 1:
        fail('a previous recorded best in the same calendar year: the one-marathon-per-year rule is broken')
    best3 = is_best[third]
    cap = YEARS_SINCE_CAP
    while cap > 1:
        binned = np.minimum(since, cap)
        if np.bincount(binned, minlength=cap + 1)[1:].min() >= MIN_CELL:
            break
        cap -= 1
    binned = np.minimum(since, cap)
    n_by, k_by = np.bincount(binned, minlength=cap + 1), np.bincount(binned, weights=best3, minlength=cap + 1).astype(np.int64)
    if n_by[1:].min() < MIN_CELL:
        fail('years since the previous recorded best: no bin holds 100 results')
    by_years = [{'years': y, 'or_more': y == cap, 'results': int(n_by[y]), 'recorded_bests': int(k_by[y]), 'share': sh(k_by[y] / n_by[y])} for y in range(1, cap + 1)]

    # the size of a new recorded best
    new = later[is_best]
    if len(new) < MIN_CELL:
        fail('fewer than 100 new recorded bests')
    gain = 100.0 * (1.0 - new.fin.to_numpy() / new.best_prior.to_numpy())
    minutes = (new.best_prior.to_numpy() - new.fin.to_numpy()) / 60.0
    g, m = _quantiles(gain), _quantiles(minutes)
    size = {'recorded_bests': int(len(new)), 'median_pct': pct(g[1]), 'q25_pct': pct(g[0]), 'q75_pct': pct(g[2]),
            'median_minutes': num(m[1], 2), 'q25_minutes': num(m[0], 2), 'q75_minutes': num(m[2], 2),
            'under_one_minute': int((new.best_prior.to_numpy() - new.fin.to_numpy() < 60).sum())}

    # the steps: consecutive recorded marathons at most two calendar years apart
    steps = {name: step_pairs(x) for name, x in hist.items()}
    main_steps = steps['F']
    by_step = []
    step = 1
    while int((main_steps.step == step).sum()) >= MIN_CELL:
        d = main_steps.d.to_numpy()[main_steps.step.to_numpy() == step]
        row = {'from_recorded_attempt': step, **_step_row(d), 'variants': {}}
        shares = []
        for name in VARIANTS:
            vd = steps[name].d.to_numpy()[steps[name].step.to_numpy() == step]
            row['variants'][name] = _step_row(vd) if len(vd) >= MIN_CELL else None
            shares.append((vd < 0).mean() if len(vd) >= MIN_CELL else None)
        row['share_faster'] = sh(row['faster'] / row['pairs'])
        row['verdict'] = share_verdict(row['faster'], row['pairs'], 0.5, shares)
        by_step.append(row)
        step += 1
    if not by_step:
        fail('fewer than 100 pairs from a first to a second recorded marathon')
    # the first step again: over any number of years apart, and by the mean of the two finishes (the symmetric banding)
    any_gap = step_pairs(h, max_gap=None)
    first_any = any_gap.d.to_numpy()[any_gap.step.to_numpy() == 1]
    first = main_steps[main_steps.step == 1]
    mean_fin = (first.f1.to_numpy() + first.f2.to_numpy()) / 2.0
    bands = []
    for lo, hi in MEAN_FINISH_BANDS:
        m_ = (mean_fin >= (lo or 0)) & (mean_fin < (hi or np.inf))
        bands.append((lo, hi, first.d.to_numpy()[m_]))
    while bands and len(bands[0][2]) < MIN_CELL:
        bands.pop(0)
    while bands and len(bands[-1][2]) < MIN_CELL:
        bands.pop()
    if any(len(b[2]) < MIN_CELL for b in bands):
        fail('a band of the mean of the two finishes holds fewer than 100 pairs between two that hold more')
    by_mean = [{'mean_finish_from_s': lo, 'mean_finish_to_s': hi, **_step_row(d), 'share_faster': sh((d < 0).mean())} for lo, hi, d in bands]

    with_prior = h[h.one_per_year & (h.attempt >= 2)]
    cohort = {
        'results': int(h.one_per_year.sum()), 'people': int(h[h.one_per_year].person.nunique()),
        'results_with_an_earlier_recorded_marathon': int(len(with_prior)), 'people_with_two_or_more': int(with_prior.person.nunique()),
        'editions': int(h[h.one_per_year].edition.nunique()), 'tiers': tier_mix(with_prior.edition.to_numpy(), editions),
        'left_out_by_the_one_marathon_per_year_rule': {'people_with_two_or_more': int(h[~h.one_per_year].person.nunique()),
                                                         'results': int((~h.one_per_year).sum())},
        'recorded_bests': int(is_best.sum()),
        'variants': {name: {'results_with_an_earlier_recorded_marathon': int((hist[name].one_per_year & (hist[name].attempt >= 2)).sum())} for name in VARIANTS},
    }
    return {'cohort': cohort, 'margin': lc.BESTS_MARGIN, 'min_results': MIN_CELL, 'by_recorded_attempt': by_attempt,
            'by_years_since_previous_recorded_best': by_years, 'new_recorded_best_size': size,
            'steps': {'max_years_apart': lc.STEP_MAX_GAP, 'by_step': by_step,
                      'first_recorded_to_second_any_years_apart': _step_row(first_any) | {'share_faster': sh((first_any < 0).mean())},
                      'first_recorded_to_second_by_mean_finish': by_mean}}


# ---------------------------------------------------------------------------------------------------------------
# Getting older, in the same linked runner
# ---------------------------------------------------------------------------------------------------------------
def birth_years(person: np.ndarray, exact_yob: np.ndarray, n_people: int) -> np.ndarray:
    """A runner's birth year from the results that carry an exact one: the more frequent of at most two adjacent years
    (the earlier on a tie); -1 when there is none or they span more than one year."""
    has = exact_yob >= 0
    p, y = person[has], exact_yob[has].astype(np.int64)
    lo = np.full(n_people, np.iinfo(np.int64).max)
    hi = np.full(n_people, -1, dtype=np.int64)
    np.minimum.at(lo, p, y)
    np.maximum.at(hi, p, y)
    n_lo = np.bincount(p[y == lo[p]], minlength=n_people)
    n_hi = np.bincount(p[y == hi[p]], minlength=n_people)
    out = np.where(n_lo >= n_hi, lo, hi)
    out[(hi < 0) | (hi - lo > 1)] = -1
    return out


def age_table(h: pd.DataFrame, race: np.ndarray) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(pairs, rows): consecutive recorded marathons one to three calendar years apart of one-per-year runners with an
    exact birth year and a recorded sex, and every result of a runner with an exact birth year and a recorded sex."""
    person = h.person.to_numpy()
    n_people = int(person.max()) + 1
    yob = birth_years(person, h.exact_yob.to_numpy(), n_people)[person]
    age = h.year.to_numpy().astype(np.int64) - yob
    valid = (yob >= 0) & (h.sex.to_numpy() > 0) & (age >= lc.AGE_RANGE[0]) & (age <= lc.AGE_RANGE[1])
    rows = pd.DataFrame({'age': age[valid], 'sex': h.sex.to_numpy()[valid], 'lf': np.log(h.fin.to_numpy()[valid])})
    later = np.flatnonzero(h.one_per_year.to_numpy() & (h.attempt.to_numpy() >= 2) & valid)
    earlier = later - 1
    ok = valid[earlier]
    later, earlier = later[ok], earlier[ok]
    year = h.year.to_numpy().astype(np.int64)
    gap = year[later] - year[earlier]
    keep = (gap >= lc.PAIR_YEARS[0]) & (gap <= lc.PAIR_YEARS[1])
    later, earlier, gap = later[keep], earlier[keep], gap[keep]
    fin = h.fin.to_numpy()
    edition = h.edition.to_numpy()
    pairs = pd.DataFrame({
        'rate': np.log(fin[later] / fin[earlier]) / gap, 'mid_age': (age[later] + age[earlier]) / 2.0, 'sex': h.sex.to_numpy()[later],
        'from_attempt': h.attempt.to_numpy()[earlier], 'same_race': race[edition[later]] == race[edition[earlier]],
        'later_year': year[later], 'seen_again': h.attempt.to_numpy()[later] < h.n_total.to_numpy()[later], 'later_edition': edition[later],
    })
    return pairs, rows


def _band_index(mid_age: np.ndarray) -> np.ndarray:
    """Index into AGE_BANDS by the age at the midpoint of the pair (a band holds its upper year up to the next band)."""
    edges = np.array([b[0] for b in AGE_BANDS[1:]], dtype=float)
    return np.searchsorted(edges, mid_age, side='right')


def _median_pct(rate: np.ndarray) -> float:
    return pct(log_pct(float(np.median(rate))))


def _slope_pct(age: np.ndarray, lf: np.ndarray) -> float | None:
    if len(age) < MIN_CELL:
        return None
    x = age - age.mean()
    sxx = float((x * x).sum())
    if sxx <= 0:
        return None
    return pct(log_pct(float((x * (lf - lf.mean())).sum()) / sxx))


def build_age(results: pd.DataFrame, editions: pd.DataFrame, masks: dict) -> dict:
    """age.json. `masks`: 'F', 'verified' and 'high' boolean masks over `results`."""
    race = editions.sort_values('code').race.to_numpy()
    hist = {name: history(results[masks[name]]) for name in ('F', 'verified', 'high')}
    tables = {name: age_table(h, race) for name, h in hist.items()}
    pairs, rows = tables['F']
    third = pairs[pairs.from_attempt >= 3]
    band = _band_index(third.mid_age.to_numpy())
    counts = np.bincount(band, minlength=len(AGE_BANDS))
    usable = [i for i in range(len(AGE_BANDS)) if counts[i] >= MIN_CELL]
    if not usable:
        fail('no age band holds 100 pairs from the third recorded marathon on')
    first_band, last_band = usable[0], usable[-1]
    if any(counts[i] < MIN_CELL for i in range(first_band, last_band + 1)):
        fail('an age band holds fewer than 100 pairs between two that hold more')
    all_band = _band_index(pairs.mid_age.to_numpy())
    row_band = _band_index(rows.age.to_numpy().astype(float))
    variant_third = {}
    for name in ('verified', 'high'):
        vp = tables[name][0]
        vp = vp[vp.from_attempt >= 3]
        variant_third[name] = (vp.rate.to_numpy(), _band_index(vp.mid_age.to_numpy()))
    bands = []
    for i in range(first_band, last_band + 1):
        m = band == i
        rate = third.rate.to_numpy()[m]
        main_pct = _median_pct(rate)
        entry = {'age_from': AGE_BANDS[i][0], 'age_to': AGE_BANDS[i][1], 'pairs': int(m.sum()), 'median_pct_per_year': main_pct,
                 'slower': int((rate > 0).sum())}
        same = rate[third.same_race.to_numpy()[m]]
        entry['same_race'] = {'pairs': int(len(same)), 'median_pct_per_year': _median_pct(same)} if len(same) >= MIN_CELL else None
        for name in ('verified', 'high'):
            vr, vb = variant_third[name]
            v = vr[vb == i]
            entry[name] = {'pairs': int(len(v)), 'median_pct_per_year': _median_pct(v)} if len(v) >= MIN_CELL else None
        everyone = pairs.rate.to_numpy()[all_band == i]
        entry['all_pairs'] = {'pairs': int(len(everyone)), 'median_pct_per_year': _median_pct(everyone)}
        entry['by_sex'] = {}
        entry['cross_section'] = {}
        for code, key in ((2, 'F'), (1, 'M')):
            s = rate[third.sex.to_numpy()[m] == code]
            entry['by_sex'][key] = {'pairs': int(len(s)), 'median_pct_per_year': _median_pct(s)} if len(s) >= MIN_CELL else None
            rm = (row_band == i) & (rows.sex.to_numpy() == code)
            slope = _slope_pct(rows.age.to_numpy()[rm].astype(float), rows.lf.to_numpy()[rm])
            entry['cross_section'][key] = None if slope is None else {'results': int(rm.sum()), 'pct_per_year': slope}
        checks = [entry[name] for name in ('same_race', 'verified', 'high')]
        entry['verdict'] = 'stated' if all(c is not None and abs(c['median_pct_per_year'] - main_pct) <= lc.AGE_AGREE_PCT + 1e-9 for c in checks) else None
        bands.append(entry)

    # survivorship: the last recorded change of runners not seen again, against runners seen again
    sv = third[(third.later_year >= SURVIVOR_YEARS[0]) & (third.later_year <= SURVIVOR_YEARS[1])
               & (third.mid_age >= SURVIVOR_AGES[0]) & (third.mid_age < SURVIVOR_AGES[1] + 1)]
    seen, gone = sv.rate.to_numpy()[sv.seen_again.to_numpy()], sv.rate.to_numpy()[~sv.seen_again.to_numpy()]
    survivorship = None
    if min(len(seen), len(gone)) >= MIN_CELL:
        survivorship = {'later_year_from': SURVIVOR_YEARS[0], 'later_year_to': SURVIVOR_YEARS[1], 'age_from': SURVIVOR_AGES[0], 'age_to': SURVIVOR_AGES[1],
                        'seen_again': {'pairs': int(len(seen)), 'median_pct_per_year': _median_pct(seen)},
                        'not_seen_again': {'pairs': int(len(gone)), 'median_pct_per_year': _median_pct(gone)}}
    h = hist['F']
    person = h.person.to_numpy()
    yob = birth_years(person, h.exact_yob.to_numpy(), int(person.max()) + 1)
    cohort = {'people_with_an_exact_birth_year': int((yob >= 0).sum()), 'results': int(len(rows)), 'pairs': int(len(pairs)),
              'pairs_from_the_third_recorded_marathon': int(len(third)), 'tiers': tier_mix(third.later_edition.to_numpy(), editions),
              'results_with_their_own_exact_age': int((h.exact_yob.to_numpy() >= 0).sum())}
    return {'cohort': cohort, 'agree_pct': lc.AGE_AGREE_PCT, 'min_pairs': MIN_CELL, 'years_apart': list(lc.PAIR_YEARS), 'age_range': list(lc.AGE_RANGE),
            'bands': bands, 'survivorship': survivorship}
