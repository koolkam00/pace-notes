"""field.json (verified): where half-marathon finish times sit (spec 2.2, /half beats 1 and 2).

Every value comes from the 310 usable stamped editions after R7, finishes pooled (the claim is about finishes, as the
marathon's field median is). Recorded sex only, and only in editions that pass the sex rule (`use_sex`). The round
marks use the site's own smooth curve, `insights_round.local_fit` (Poisson log-cubic over ±25 minutes leaving out five
minutes before and ten after the mark and short windows around other 10- and 15-minute marks) on a half minute matrix
of 40 to 300 minutes, with a 200-draw whole-edition bootstrap (`insights_stats.SEED`). The scope checks are for
/methodology only: all usable editions pooled; verified editions weighted equally (those of at least 1,000 finishes,
and all of them); the same race in verified and unverified years (each kind's median of edition medians, per city
label with both); and the verified finishes by country (the reviewed label map in the policy; groups of at least 3
editions and 100 finishes).
"""
from __future__ import annotations

import contextlib
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

import insights_round  # noqa: E402
from half_common import MIN_CELL, MIN_EDITIONS, SEED, fail, quantile, sec, sh  # noqa: E402
from insights_stats import r  # noqa: E402

HIST_LO, HIST_HI = 65, 210              # minutes published: 1:05 to 3:29, tails kept apart
SEX_BIN_S, SEX_LO_S, SEX_HI_S = 300, 3900, 12600
UNDER_FROM_S, UNDER_TO_S, UNDER_STEP_S = 4200, 10800, 300
FIT_M0, FIT_M1 = 40, 300                 # the minute matrix of the round-mark fits
MARKS = (90, 105, 120, 135, 150)
WINDOW_MIN = 30
EDITIONS_EQUAL_MIN = 1000
BOOT_REPS = 200

# fin columns: edition_id (int), city (the edition's label), verified (bool), sex ('F', 'M' or None), use_sex (bool),
# finish_s (float)


@contextlib.contextmanager
def half_minutes():
    """insights_round indexes its counts from module constants M0 and M1 (the marathon's 90–480); the half uses 40–300."""
    saved = insights_round.M0, insights_round.M1
    insights_round.M0, insights_round.M1 = FIT_M0, FIT_M1
    try:
        yield
    finally:
        insights_round.M0, insights_round.M1 = saved


def label(minutes: int) -> str:
    return f'{minutes // 60}:{minutes % 60:02d}'


def tailed(values, lo, hi, step):
    """Counts in [lo, hi) bins of `step`, with the tails apart (values are seconds or minutes)."""
    v = np.asarray(values, float)
    edges = np.arange(lo, hi + step, step)
    counts = np.histogram(v[(v >= lo) & (v < hi)], bins=edges)[0]
    return {'under_lo': int((v < lo).sum()), 'at_or_over_hi': int((v >= hi).sum()), 'counts': [int(c) for c in counts]}


def round_marks(minutes, edition):
    """The five round marks against the smooth curve, with the whole-edition bootstrap interval of the ratio."""
    eds, inverse = np.unique(edition, return_inverse=True)
    keep = (minutes >= FIT_M0) & (minutes < FIT_M1)
    M = np.zeros((len(eds), FIT_M1 - FIT_M0))
    np.add.at(M, (inverse[keep], minutes[keep] - FIT_M0), 1)
    total = M.sum(axis=0)
    rng = np.random.default_rng(SEED)
    picks = [rng.integers(0, len(eds), len(eds)) for _ in range(BOOT_REPS)]
    boots = [M[p].sum(axis=0) for p in picks]
    out = []
    with half_minutes():
        for B in MARKS:
            est = insights_round.local_fit(total, B, **insights_round.MAIN)
            ratios = [insights_round.local_fit(bt, B, **insights_round.MAIN)['ratio_pre1'] for bt in boots]
            if est['obs_pre1'] < MIN_CELL:
                fail(f'round mark {label(B)}: the minute before holds under {MIN_CELL} finishes')
            out.append({'mark': label(B), 'minutes': B, 'minute_before': int(est['obs_pre1']), 'minute_after': int(est['obs_post1']),
                        'expected_minute_before': r(est['exp_pre1'], 1), 'ratio': r(est['ratio_pre1'], 4),
                        'ratio_ci95': [r(np.percentile(ratios, 2.5), 4), r(np.percentile(ratios, 97.5), 4)],
                        'cliff': r(insights_round.cliff_index(total, B), 4)})
    return out


def same_race(fin):
    """Per city label with both verified and unverified usable editions: the verified editions' median of edition
    medians minus the unverified editions'; the quartiles of those differences over labels."""
    rows = []
    for (label, verified), g in fin.groupby(['city', 'verified'], observed=True, sort=True):
        meds = [quantile(e.to_numpy(float), 0.5) for _, e in g.groupby('edition_id', sort=True).finish_s]
        rows.append((str(label), bool(verified), float(np.median(meds))))
    by = {}
    for label, verified, med in rows:
        by.setdefault(label, {})[verified] = med
    diffs = [v[True] - v[False] for v in by.values() if True in v and False in v]
    if len(diffs) < MIN_EDITIONS:
        fail('field: too few races with both verified and unverified editions')
    return {'races': len(diffs), 'diff_s': {f'p{int(p * 100)}': sec(quantile(diffs, p)) for p in (0.25, 0.5, 0.75)}}


def countries(verified, label_countries):
    """Verified finishes by country (the reviewed label map); groups under the floors are left out."""
    labels = verified.city.astype(str)
    missing = sorted(set(labels.unique()) - set(label_countries))
    if missing:
        fail(f'field: verified labels without a reviewed country: {missing[:5]}')
    country = labels.map(label_countries).to_numpy(object)
    edition = verified.edition_id.to_numpy(np.int64)
    sizes = verified.groupby('edition_id').size()
    small = set(sizes.index[sizes.to_numpy() < EDITIONS_EQUAL_MIN].tolist())
    n = len(verified)
    out = []
    for code in sorted(set(country.tolist())):
        s = country == code
        eds = set(edition[s].tolist())
        if s.sum() < MIN_CELL or len(eds) < MIN_EDITIONS:
            continue
        out.append({'label': code, 'editions': len(eds), 'small_editions': len(eds & small), 'share': sh(s.sum() / n)})
    out.sort(key=lambda c: (-c['share'], c['label']))
    return out


def build(fin, *, policy_sha256: str, module_sha256: str, label_countries: dict | None = None) -> dict:
    verified = fin[fin.verified.to_numpy()]
    x = verified.finish_s.to_numpy(float)
    edition = verified.edition_id.to_numpy(np.int64)
    n, n_ed = len(x), int(len(np.unique(edition)))
    if n < MIN_CELL or n_ed < MIN_EDITIONS:
        fail('field: too few verified finishes or editions')
    sexed = verified[verified.use_sex.to_numpy()]
    by_sex = {g: sexed.finish_s.to_numpy(float)[(sexed.sex == g).to_numpy()] for g in ('F', 'M')}
    for g, v in by_sex.items():
        if len(v) < MIN_CELL:
            fail(f'field: too few recorded {g} finishes')
    minutes = np.floor(x / 60).astype(np.int64)
    hist = tailed(minutes, HIST_LO, HIST_HI, 1)
    if min(hist['counts']) < MIN_CELL:
        fail(f'field: a published minute holds under {MIN_CELL} finishes')
    sex_bins = {'bin_s': SEX_BIN_S, 'lo_s': SEX_LO_S, 'hi_s': SEX_HI_S}
    for g, v in by_sex.items():
        sex_bins[g] = tailed(v, SEX_LO_S, SEX_HI_S, SEX_BIN_S)
        if min(sex_bins[g]['counts']) < MIN_CELL:
            fail(f'field: a published 5-minute bin of recorded {g} finishes holds under {MIN_CELL}')
    q = lambda v, p: sec(quantile(v, p))
    under = [{'s': s, 'all': sh((x < s).mean()), 'F': sh((by_sex['F'] < s).mean()), 'M': sh((by_sex['M'] < s).mean())}
             for s in range(UNDER_FROM_S, UNDER_TO_S + 1, UNDER_STEP_S)]
    counts = np.bincount(minutes, minlength=FIT_M1 + WINDOW_MIN)
    best = max(range(FIT_M0, FIT_M1), key=lambda a: counts[a:a + WINDOW_MIN].sum())
    if not (HIST_LO <= best and best + WINDOW_MIN <= HIST_HI):
        fail('field: the densest 30 minutes fall outside the published histogram')
    usable = fin.finish_s.to_numpy(float)
    eq_all = verified.groupby('edition_id').finish_s.agg(['size', lambda s: (s < 7200).mean(), lambda s: (s < 6300).mean()])
    eq_all.columns = ['size', 'u7200', 'u6300']
    eq = eq_all[eq_all['size'] >= EDITIONS_EQUAL_MIN]
    if label_countries is None:
        fail('field: the reviewed label countries are required')
    return {
        'schema_version': 1, 'family': 'half-field', 'scope': 'verified',
        'cohort': {'finishes': int(n), 'editions': n_ed, 'sex_finishes': int(len(sexed)), 'sex_editions': int(sexed.edition_id.nunique())},
        'minutes': {'lo': HIST_LO, 'hi': HIST_HI, **hist},
        'sex_bins': sex_bins,
        'quantiles': {'all': {f'p{int(p * 100)}': q(x, p) for p in (0.1, 0.25, 0.5, 0.75, 0.9)},
                      **{g: {f'p{int(p * 100)}': q(v, p) for p in (0.25, 0.5, 0.75)} for g, v in by_sex.items()}},
        'under': under,
        'window30': {'lo_minute': int(best), 'share': sh(counts[best:best + WINDOW_MIN].sum() / n)},
        'marks': round_marks(minutes, edition),
        'checks': {
            'all_usable': {'finishes': int(len(usable)), 'editions': int(fin.edition_id.nunique()),
                           'under_7200': sh((usable < 7200).mean()), 'under_6300': sh((usable < 6300).mean()), 'p50': q(usable, 0.5)},
            'editions_equal': {'min_finishes': EDITIONS_EQUAL_MIN, 'editions': int(len(eq)),
                               'under_7200': sh(float(np.median(eq.u7200))), 'under_6300': sh(float(np.median(eq.u6300)))},
            'editions_equal_all': {'editions': int(len(eq_all)), 'under_7200': sh(float(np.median(eq_all.u7200)))},
            'same_race': same_race(fin),
            'countries': countries(verified, label_countries),
        },
        'policy': {'sha256': policy_sha256, 'module_sha256': module_sha256},
    }
