"""Seen again after a sustained slowdown: one matched comparison (docs/LINKED_RECORDS.md, section 7).

Timing-eligible finishes of linked runners in counted editions of 2010 to 2019, with a recorded sex. A finish with a
sustained slowdown is compared with the finishes without one in the same edition, sex and 10-minute finish band (cells
with at least 20 finishes on each side; each cell weighs its finishes with a slowdown). "Seen again within two years"
means a kept result of the same linked runner in the finish-time universe in one of the next two calendar years; a
marathon outside these records does not count, so the two shares are floors and only their difference is read. The
interval of the difference resamples whole editions.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import linked_common as lc
from linked_common import MIN_CELL, MIN_MATCH_SIDE, SEED, num, sh

YEARS = (2010, 2019)
WITHIN_YEARS = 2
BAND_SECONDS = 600
FINISH_BANDS = ((None, 12600), (12600, 14400), (14400, 16200), (16200, 18000), (18000, None))


def next_year(person: np.ndarray, year: np.ndarray) -> np.ndarray:
    """The next later calendar year in which the runner has a result (0 when there is none). Sorted by (person, year)."""
    year = year.astype(np.int64)
    change = np.r_[True, (person[1:] != person[:-1]) | (year[1:] != year[:-1])]
    first = np.flatnonzero(change)
    run_person, run_year = person[first], year[first]
    following = np.r_[np.where(run_person[1:] == run_person[:-1], run_year[1:], 0), 0]
    return following[np.cumsum(change) - 1]


def cells(results: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """(one row per matched cell: edition, sex, finish band, finishes and returns on each side; the unmatched counts)."""
    r = results
    nxt = next_year(r.person.to_numpy(), r.year.to_numpy())
    year = r.year.to_numpy().astype(np.int64)
    back = (nxt > 0) & (nxt <= year + WITHIN_YEARS)
    use = r.eligible.to_numpy() & (year >= YEARS[0]) & (year <= YEARS[1]) & (r.sex.to_numpy() > 0)
    frame = pd.DataFrame({'edition': r.edition.to_numpy()[use], 'sex': r.sex.to_numpy()[use],
                          'band': np.floor(r.fin.to_numpy()[use] / BAND_SECONDS).astype(np.int64),
                          'slow': r.slow.to_numpy()[use], 'back': back[use]})
    g = frame.groupby(['edition', 'sex', 'band', 'slow'], sort=True).agg(n=('back', 'size'), b=('back', 'sum')).reset_index()
    with_ = g[g.slow].drop(columns='slow').rename(columns={'n': 'n1', 'b': 'b1'})
    without = g[~g.slow].drop(columns='slow').rename(columns={'n': 'n0', 'b': 'b0'})
    c = with_.merge(without, on=['edition', 'sex', 'band'])
    c = c[(c.n1 >= MIN_MATCH_SIDE) & (c.n0 >= MIN_MATCH_SIDE)].reset_index(drop=True)
    raw = {'with_slowdown': {'finishes': int(frame.slow.sum()), 'seen_again': int((frame.slow & frame.back).sum())},
           'without': {'finishes': int((~frame.slow).sum()), 'seen_again': int((~frame.slow & frame.back).sum())}}
    return c, raw


def matched(c: pd.DataFrame) -> tuple[float, float]:
    """(share seen again with a slowdown, share of their matches without one), weighted by the finishes with a slowdown."""
    n1 = c.n1.to_numpy(float)
    total = n1.sum()
    return float(c.b1.sum() / total), float((n1 * c.b0.to_numpy(float) / c.n0.to_numpy(float)).sum() / total)


def summary(c: pd.DataFrame) -> dict:
    a, b = matched(c)
    return {'cells': int(len(c)), 'editions': int(c.edition.nunique()),
            'with_slowdown': {'finishes': int(c.n1.sum()), 'seen_again': int(c.b1.sum()), 'share': sh(a)},
            'matched_without': {'finishes': int(c.n0.sum()), 'share': sh(b)}, 'difference_points': num(100.0 * (a - b), 3)}


def build(results: pd.DataFrame, editions: pd.DataFrame, masks: dict, *, reps: int = lc.BOOT_REPS, seed: int = SEED) -> dict | None:
    """return.json, or None when the comparison holds under 100 finishes with a slowdown or under 3 editions."""
    c, raw = cells(results[masks['F']])
    if len(c) == 0 or c.n1.sum() < MIN_CELL or c.edition.nunique() < lc.MIN_EDITIONS:
        return None
    out = summary(c)
    # the interval: whole editions resampled with replacement
    rng = np.random.default_rng(seed)
    codes, inverse = np.unique(c.edition.to_numpy(), return_inverse=True)
    n1, b1, share0 = c.n1.to_numpy(float), c.b1.to_numpy(float), c.b0.to_numpy(float) / c.n0.to_numpy(float)
    draws = np.zeros(reps)
    for rep in range(reps):
        w = np.bincount(rng.integers(0, len(codes), len(codes)), minlength=len(codes)).astype(float)[inverse]
        total = (w * n1).sum()
        draws[rep] = 100.0 * ((w * b1).sum() - (w * n1 * share0).sum()) / total if total > 0 else np.nan
    if np.isnan(draws).any():
        return None
    out['difference_lo_points'] = num(float(np.percentile(draws, 2.5)), 3)
    out['difference_hi_points'] = num(float(np.percentile(draws, 97.5)), 3)
    out['unmatched'] = raw
    bands = []
    for lo, hi in FINISH_BANDS:
        part = c[(c.band * BAND_SECONDS >= (lo or 0)) & (c.band * BAND_SECONDS < (hi or np.inf))]
        if len(part) and part.n1.sum() >= MIN_CELL and part.edition.nunique() >= lc.MIN_EDITIONS:
            bands.append({'finish_from_s': lo, 'finish_to_s': hi, **summary(part)})
    out['by_finish'] = bands
    hc, _ = cells(results[masks['high']])
    out['high'] = summary(hc) if len(hc) and hc.n1.sum() >= MIN_CELL and hc.edition.nunique() >= lc.MIN_EDITIONS else None
    high_diff = None if out['high'] is None else out['high']['difference_points']
    lo_p, hi_p = out['difference_lo_points'], out['difference_hi_points']
    if hi_p < 0 and (high_diff is None or high_diff < 0):
        out['verdict'] = 'less_often'
    elif lo_p > 0 and (high_diff is None or high_diff > 0):
        out['verdict'] = 'more_often'
    else:
        out['verdict'] = None
    tiers = editions.set_index('code').tier.reindex(c.edition.unique())
    out['tiers'] = {tier: int((tiers == tier).sum()) for tier in lc.F_TIERS}
    out.update({'years': list(YEARS), 'within_years': WITHIN_YEARS, 'band_seconds': BAND_SECONDS, 'min_each_side': MIN_MATCH_SIDE, 'bootstrap_draws': int(reps)})
    return out
