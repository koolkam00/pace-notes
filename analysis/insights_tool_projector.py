"""Race-day projector: what finishes at the same mat, on the same even-pace band, went on to run.

For every 5 km mat (5–40 km) the runner's elapsed time E implies an even-pace finish
P = E × 42.195 / mat. Finishes are grouped into 2-minute bands of P, so "on 4:00 pace"
means the same thing at every mat. Each published cell (at least 100 finishes) gives the
observed finish percentiles (5th to 95th in steps of 5), the observed elapsed percentiles at every later mat, the median remaining pace and the
sustained-slowdown share split into "already recorded" and "after this mat".

Variants: all finishes and, from 10 km, the latest 5 km compared with the average so far
(faster than 2% quicker, similar within ±2%, slower); on All courses also recorded men and
recorded women. Gender and trend are never crossed.

Accuracy is checked out of sample: cells built only from 2005–2021 races score every
2022–2026 finish, against the even-pace projection that live trackers show.
"""
import numpy as np

from insights_stats import MIN_CELL, r
from insights_tools_common import MARATHON_KM, MATS_KM, group_index, q, slugify, tool_cohort

BAND_S = 120
TREND = 0.02
VARIANTS = ('all', 'men', 'women', 'faster', 'similar', 'slower')
COURSE_VARIANTS = ('all', 'faster', 'similar', 'slower')  # gender cuts on All courses only, to keep course shards small
QUANTS = tuple(round(.05 * i, 2) for i in range(1, 20))  # 5th to 95th percentile
TRAIN_LAST_YEAR = 2021


def variant_mask(s, k, v):
    if v == 'all':
        return np.ones(s.n, bool)
    if v == 'men':
        return s.gender == 1
    if v == 'women':
        return s.gender == 2
    if k == 0:
        return np.zeros(s.n, bool)
    t = s.times
    ratio = ((t[:, k] - t[:, k - 1]) / 5.0) / (t[:, k] / MATS_KM[k]) - 1.0
    if v == 'faster':
        return ratio < -TREND
    if v == 'similar':
        return np.abs(ratio) <= TREND
    return ratio > TREND


def band_of(s, k):
    projected = s.times[:, k] * MARATHON_KM / MATS_KM[k]
    return np.floor(projected / BAND_S).astype(np.int64)


def cell(s, idx, k, detected, onset):
    fin = s.finish[idx]
    km = MATS_KM[k]
    remaining = (fin - s.times[idx, k]) / (MARATHON_KM - km)
    d = detected[idx]
    already = d & (onset[idx] + 5 <= km)
    return dict(
        n=int(len(idx)), ed=int(len(np.unique(s.edition[idx]))), q=q(fin, QUANTS),
        later=[q(s.times[idx, j], (.1, .5, .9)) for j in range(k + 1, 8)],
        rp=r(float(np.median(remaining)), 1), sd=[r(float(already.mean()), 4), r(float((d & ~already).mean()), 4)])


def columns(rows):
    """Column arrays (one entry per band) keep the shards small."""
    return {key: [row[key] for row in rows] for key in ('b', 'n', 'ed', 'q', 'later', 'rp', 'sd')}


def scope_rows(s):
    """(scope slug, city or None, row mask) for All courses and every course."""
    yield 'all', None, np.ones(s.n, bool)
    for ci, city in enumerate(s.cities):
        m = s.city == ci
        if m.sum() >= MIN_CELL:
            yield slugify(city), city, m


def validate(s):
    """Out-of-sample check: 2005–2021 cells score 2022–2026 finishes (All courses)."""
    train = s.year <= TRAIN_LAST_YEAR
    test = ~train
    out = []
    for k, km in enumerate(MATS_KM):
        band = band_of(s, k)
        projected = s.times[:, k] * MARATHON_KM / km
        for v in ('all', 'trend'):
            if v == 'trend' and k == 0:
                continue
            variants = ('all',) if v == 'all' else ('faster', 'similar', 'slower')
            abs_err, abs_naive, covered, scored = [], [], 0, 0
            for name in variants:
                vm = variant_mask(s, k, name)
                table = {}
                for b, idx in group_index(np.where(train & vm, band, -1)):
                    if b < 0:
                        continue
                    table[int(b)] = np.quantile(s.finish[idx], (.1, .5, .9))
                rows = np.flatnonzero(test & vm)
                look = np.array([table.get(int(b), (np.nan,) * 3) for b in band[rows]]) if len(rows) else np.zeros((0, 3))
                ok = np.isfinite(look[:, 0])
                rows, look = rows[ok], look[ok]
                fin = s.finish[rows]
                covered += int(((fin >= look[:, 0]) & (fin <= look[:, 2])).sum())
                scored += len(rows)
                abs_err.append(np.abs(fin - look[:, 1]))
                abs_naive.append(np.abs(fin - projected[rows]))
            e = np.concatenate(abs_err)
            nv = np.concatenate(abs_naive)
            out.append(dict(mat=km, variant=v, test_finishes=int(scored), test_years='2022–2026', train_years='2005–2021',
                            coverage_p10_p90=r(covered / scored, 4), median_abs_error_s=int(round(float(np.median(e)))),
                            even_pace_median_abs_error_s=int(round(float(np.median(nv)))),
                            within_5_min=r(float((e <= 300).mean()), 4), even_pace_within_5_min=r(float((nv <= 300).mean()), 4)))
    return out


def build(cohort):
    s, detected, onset, screens = tool_cohort(cohort)
    extra = {}
    scopes = []
    for slug, city, sm in scope_rows(s):
        avail = {}
        for k, km in enumerate(MATS_KM):
            band = band_of(s, k)
            cells = {}
            for v in VARIANTS if slug == 'all' else COURSE_VARIANTS:
                m = sm & variant_mask(s, k, v)
                if not m.any():
                    continue
                keyed = np.where(m, band, -1)
                rows = []
                for b, idx in group_index(keyed):
                    if b < 0:
                        continue
                    rows.append(dict(b=int(b) * BAND_S, **cell(s, idx, k, detected, onset)))
                if rows:
                    cells[v] = columns(rows)
            if not cells:
                continue
            extra[f'tools/projector/{slug}/{km}.json'] = dict(scope=slug, city=city, mat_km=km, band_s=BAND_S, cells=cells)
            avail[str(km)] = dict(bands=[cells['all']['b'][0], cells['all']['b'][-1]] if 'all' in cells else None,
                                  variants=sorted(cells), cells=int(sum(len(v['b']) for v in cells.values())))
        if avail:
            scopes.append(dict(slug=slug, city=city, finishes=int(sm.sum()), editions=int(len(np.unique(s.edition[sm]))), mats=avail))
    return dict(
        extra_files=extra,
        cohort_n=int(s.n), editions=int(len(np.unique(s.edition))), band_s=BAND_S, trend_threshold=TREND,
        variants=list(VARIANTS), mats_km=list(MATS_KM), quantiles=list(QUANTS), scopes=scopes,
        validation=validate(s), screens=screens,
        method=('Elapsed time E at a 5 km mat implies an even-pace finish P = E × 42.195 / mat km. Finishes are grouped in 2-minute bands '
                'of P per mat, course and variant; cells with fewer than 100 finishes are not published. Each cell stores finish percentiles from the 5th to the 95th in steps of 5, so '
                'shares under a target are interpolated between them. Trend compares the latest 5 km '
                'pace with the average pace so far (faster below −2%, similar within ±2%, slower above +2%). Percentiles describe complete '
                'finishes only; runners who stopped are not in the data. Validation builds cells from 2005–2021 races only and scores every '
                '2022–2026 finish on All courses against the even-pace projection.'),
    )
