"""Who holds their pace: recorded gender and age, compared at the same finish times.

Pooled numbers mix very different finish times. Here women and men (or age
groups) are compared within the same race edition and the same whole finish
minute, each cell weighted by its smaller group. This holds finish time fixed;
it does not hold fitness, experience, goals or conditions fixed.
"""
import numpy as np

from insights_data import granular_age_editions, relative_pace, start_offset_screen, sustained_slowdown
from insights_stats import MIN_CELL, SEED, r

BANDS = list(range(150, 360, 10))  # 2:30 … 5:50 starts of 10-minute finish bands
AGE_BANDS = [(18, 25), (25, 30), (30, 35), (35, 40), (40, 45), (45, 50), (50, 55), (55, 60), (60, 65), (65, 70), (70, 75), (75, 80), (80, 85), (85, 90)]


def label(lo, width):
    return f'{lo // 60}:{lo % 60:02d}–{(lo + width) // 60}:{(lo + width) % 60:02d}'


def matched_weights(cell, group, a, b):
    """Weights so that groups a and b contribute min(n_a, n_b) per cell."""
    ids, inv = np.unique(cell, return_inverse=True)
    na = np.bincount(inv, weights=(group == a), minlength=len(ids))
    nb = np.bincount(inv, weights=(group == b), minlength=len(ids))
    w = np.minimum(na, nb)
    wt = np.zeros(len(cell))
    ma, mb = group == a, group == b
    wt[ma] = (w[inv] / np.maximum(na[inv], 1))[ma]
    wt[mb] = (w[inv] / np.maximum(nb[inv], 1))[mb]
    return wt, float(w.sum())


def wmean(y, wt):
    s = wt.sum()
    return float((y * wt).sum() / s) if s > 0 else float('nan')


def boot_gap(y, wt, group, edition, a, b, reps, rng):
    """Edition-cluster bootstrap for the weighted mean difference a − b."""
    eds, inv = np.unique(edition, return_inverse=True)
    sa = np.bincount(inv, weights=y * wt * (group == a), minlength=len(eds))
    wa = np.bincount(inv, weights=wt * (group == a), minlength=len(eds))
    sb = np.bincount(inv, weights=y * wt * (group == b), minlength=len(eds))
    wb = np.bincount(inv, weights=wt * (group == b), minlength=len(eds))
    out = []
    for _ in range(reps):
        p = rng.integers(0, len(eds), len(eds))
        out.append(sa[p].sum() / wa[p].sum() - sb[p].sum() / wb[p].sum())
    return [r(np.percentile(out, 2.5), 4), r(np.percentile(out, 97.5), 4)]


def build(f):
    rng = np.random.default_rng(SEED)
    keep, _ = start_offset_screen(f)
    s = f.subset(keep)
    detected, _ = sustained_slowdown(s)
    block = 100 * ((s.times[:, 7] - s.times[:, 3]) / s.times[:, 3] - 1)
    R = relative_pace(s)
    kick = s.paces[:, 8] < s.times[:, 7] / 40          # final 2.195 km faster than own 0–40 km average pace
    minute = np.floor(s.finish / 60).astype(np.int64)
    cell = s.edition.astype(np.int64) * 1000 + minute
    in_range = (s.finish >= 9000) & (s.finish < 21600) & ((s.gender == 1) | (s.gender == 2))
    m = in_range
    wt, pairs = matched_weights(cell[m], s.gender[m], 2, 1)
    g, ed = s.gender[m], s.edition[m]
    W, M = g == 2, g == 1
    overall = dict(
        matched_weight=r(pairs, 0), editions=int(len(np.unique(ed[wt > 0]))),
        pooled_women_block=r(block[m][W].mean(), 3), pooled_men_block=r(block[m][M].mean(), 3),
        women_block=r(wmean(block[m][W], wt[W]), 3), men_block=r(wmean(block[m][M], wt[M]), 3),
        block_gap_ci95=boot_gap(block[m], wt, g, ed, 2, 1, 500, rng),
        women_slowdown=r(wmean(detected[m][W], wt[W]), 4), men_slowdown=r(wmean(detected[m][M], wt[M]), 4),
        slowdown_gap_ci95=boot_gap(detected[m].astype(float), wt, g, ed, 2, 1, 500, rng),
        women_kick=r(wmean(kick[m][W], wt[W]), 4), men_kick=r(wmean(kick[m][M], wt[M]), 4),
        women_negative=r(wmean(block[m][W] < 0, wt[W]), 4), men_negative=r(wmean(block[m][M] < 0, wt[M]), 4),
    )
    # Ghost race: mean (women − men) elapsed at each checkpoint, matched; positive = women behind on the clock.
    ghost = [r(wmean(s.times[m][W, k], wt[W]) - wmean(s.times[m][M, k], wt[M]), 1) for k in range(9)]
    bands = []
    for lo in BANDS:
        bm = (s.finish[m] >= lo * 60) & (s.finish[m] < (lo + 10) * 60)
        bw, bmn = bm & W, bm & M
        weight = float(wt[bw].sum())
        if weight < MIN_CELL:
            continue
        bands.append(dict(
            lo_min=lo, label=label(lo, 10), matched_weight=r(weight, 0), women_n=int(bw.sum()), men_n=int(bmn.sum()),
            women_slowdown=r(wmean(detected[m][bw], wt[bw]), 4), men_slowdown=r(wmean(detected[m][bmn], wt[bmn]), 4),
            women_block=r(wmean(block[m][bw], wt[bw]), 3), men_block=r(wmean(block[m][bmn], wt[bmn]), 3),
            women_kick=r(wmean(kick[m][bw], wt[bw]), 4), men_kick=r(wmean(kick[m][bmn], wt[bmn]), 4),
            ghost_s=[r(wmean(s.times[m][bw, k], wt[bw]) - wmean(s.times[m][bmn, k], wt[bmn]), 1) for k in range(9)],
            women_profile=[r(wmean(R[m][bw, k], wt[bw]), 2) for k in range(9)],
            men_profile=[r(wmean(R[m][bmn, k], wt[bmn]), 2) for k in range(9)]))
    # Age ladder (exact ages only from editions with granular ages).
    granular = granular_age_editions(s)
    ga = np.isin(s.edition, granular) & np.isfinite(s.exact_age) & ((s.gender == 1) | (s.gender == 2)) & (s.finish >= 9000) & (s.finish < 21600)
    gcell = s.edition.astype(np.int64) * 1000 + minute
    # Deviation from the same edition × finish-minute field (both genders), averaged per age × gender group.
    ids, inv = np.unique(gcell[ga], return_inverse=True)
    det_g = detected[ga].astype(float)
    blk_g = block[ga]
    cell_n = np.bincount(inv, minlength=len(ids))
    cell_det = np.bincount(inv, weights=det_g, minlength=len(ids)) / cell_n
    cell_blk = np.bincount(inv, weights=blk_g, minlength=len(ids)) / cell_n
    d_det = det_g - cell_det[inv]
    d_blk = blk_g - cell_blk[inv]
    ages, gens, fin = s.exact_age[ga], s.gender[ga], s.finish[ga]
    ladder = []
    for gcode, gname in ((1, 'Men'), (2, 'Women')):
        for lo, hi in AGE_BANDS:
            mm = (gens == gcode) & (ages >= lo) & (ages < hi)
            if mm.sum() < MIN_CELL:
                continue
            ladder.append(dict(gender=gname, age=f'{lo}–{hi - 1}', n=int(mm.sum()), median_finish_s=r(np.median(fin[mm]), 0),
                               slowdown=r(det_g[mm].mean(), 4), slowdown_vs_field=r(d_det[mm].mean(), 4), block_vs_field=r(d_blk[mm].mean(), 3)))
    # Young vs older, matched within edition × gender × minute.
    young = ga & (s.exact_age >= 18) & (s.exact_age < 30)
    older = ga & (s.exact_age >= 60) & (s.exact_age < 70)
    yo = young | older
    grp = np.where(young, 1, np.where(older, 2, 0))[yo]
    acell = (s.edition.astype(np.int64) * 10 + s.gender) * 1000 + minute
    wt2, w2 = matched_weights(acell[yo], grp, 1, 2)
    Y, O = grp == 1, grp == 2
    age_contrast = dict(
        young='18–29', older='60–69', young_n=int(young.sum()), older_n=int(older.sum()), matched_weight=r(w2, 0),
        young_slowdown=r(wmean(detected[yo][Y], wt2[Y]), 4), older_slowdown=r(wmean(detected[yo][O], wt2[O]), 4),
        young_block=r(wmean(block[yo][Y], wt2[Y]), 3), older_block=r(wmean(block[yo][O], wt2[O]), 3),
        young_ahead_at_20km_s=r(wmean(s.times[yo][O, 3], wt2[O]) - wmean(s.times[yo][Y, 3], wt2[Y]), 1),
        slowdown_gap_ci95=boot_gap(detected[yo].astype(float), wt2, grp, s.edition[yo], 1, 2, 300, rng))
    granular_cities = sorted({s.editions[e]['city'] for e in granular})
    # Women's share of finishes by finish band and within each city by year (coverage-flagged editions left out).
    flagged = composition_flags(s)
    ok = ~np.isin(s.edition, flagged)
    mw = ok & ((s.gender == 1) | (s.gender == 2))
    share_band = []
    for lo in range(150, 420, 10):
        b = mw & (s.finish >= lo * 60) & (s.finish < (lo + 10) * 60)
        if b.sum() >= MIN_CELL:
            share_band.append(dict(lo_min=lo, label=label(lo, 10), n=int(b.sum()), women_share=r((s.gender[b] == 2).mean(), 4)))
    city_years = []
    for c, city in enumerate(s.cities):
        rows = []
        for e in np.unique(s.edition[(s.city == c) & mw]):
            b = mw & (s.edition == e)
            if b.sum() >= MIN_CELL:
                rows.append(dict(year=int(s.editions[e]['year']), n=int(b.sum()), women_share=r((s.gender[b] == 2).mean(), 4)))
        if len(rows) >= 3:
            city_years.append(dict(city=city, years=sorted(rows, key=lambda x: x['year'])))
    return dict(
        cohort_n=int(m.sum()), overall=overall, ghost_s=ghost, bands=bands, ladder=ladder, age_contrast=age_contrast,
        granular_age_cities=granular_cities, granular_age_n=int(ga.sum()),
        composition_flagged=[dict(city=s.editions[e]['city'], year=s.editions[e]['year']) for e in flagged],
        women_share_by_band=share_band, women_share_by_city=city_years,
        method=('Women and men are compared within the same race edition and the same whole finish minute between 2:30 and 6:00; each '
                'edition-minute cell contributes the smaller of its two group sizes, so neither group dominates. The 20–40 km block change compares '
                'the 20–40 km block with the 0–20 km block, not measured half-marathon splits. Exact ages come only from editions whose age field '
                'holds at least 30 distinct values with fewer than 40% multiples of five; sources that record age-group floors are left out. '
                'Intervals resample whole editions.'),
    )


def composition_flags(s):
    """Editions where recorded gender or completeness limits composition comparisons."""
    out = []
    for e in np.unique(s.edition):
        m = s.edition == e
        other = (s.gender[m] == 0).mean()
        retained = m.sum() / s.raw_by_edition[e] if s.raw_by_edition is not None and s.raw_by_edition[e] else 1
        if other > .02 or retained < .8 or ((s.gender[m] == 1) | (s.gender[m] == 2)).sum() < MIN_CELL:
            out.append(int(e))
    return out
