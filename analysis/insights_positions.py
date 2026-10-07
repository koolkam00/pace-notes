"""Places on the clock: how the order of a field changes after 30 km.

Ranks compare elapsed (chip/net) times among eligible finishes in the same
edition. They are clock ranks, not on-road positions: wave starts mean two
finishes adjacent on the clock may never have been near each other.
"""
import numpy as np

from insights_data import start_offset_screen, sustained_slowdown
from insights_stats import MIN_CELL, SEED, quantile, r

GAP_BINS = np.arange(0, 901, 30)
CHECKS = {20: 3, 30: 5, 35: 6, 40: 7}


def average_ranks(values):
    """1-based ranks with ties averaged (as SQL rank() + (count−1)/2)."""
    order = np.argsort(values, kind='stable')
    sorted_v = values[order]
    ranks = np.empty(len(values))
    starts = np.flatnonzero(np.r_[True, sorted_v[1:] != sorted_v[:-1]])
    ends = np.r_[starts[1:], len(values)]
    for a, b in zip(starts, ends):
        ranks[order[a:b]] = (a + 1 + b) / 2.0
    return ranks


def build(f):
    keep, flagged = start_offset_screen(f)
    s = f.subset(keep)
    n = s.n
    sizes = np.bincount(s.edition, minlength=len(s.editions))
    ok = sizes[s.edition] >= MIN_CELL
    s = s.subset(ok)
    sizes = np.bincount(s.edition, minlength=len(s.editions))
    ranks = np.zeros((s.n, 9))
    for e in np.flatnonzero(sizes):
        idx = np.flatnonzero(s.edition == e)
        for k in range(9):
            ranks[idx, k] = average_ranks(s.times[idx, k])
    N = sizes[s.edition].astype(float)
    pct = lambda k: 100 * (N - ranks[:, k]) / (N - 1)          # 100 = fastest
    gain30 = 100 * (ranks[:, 5] - ranks[:, 8]) / (N - 1)
    detected, _ = sustained_slowdown(s)
    change20 = 100 * ((s.times[:, 7] - s.times[:, 3]) / s.times[:, 3] - 1)
    surger, sinker = gain30 >= 10, gain30 <= -10
    hist_edges = np.arange(-30, 16, 1.0)
    hist = np.histogram(np.clip(gain30, -30, 15 - 1e-9), bins=hist_edges)[0]
    rng = np.random.default_rng(SEED)
    coin = coin_flip(s, rng)
    shuffle = section_shuffle(s, rng)
    # Break-even: 30–40 km pace vs own 5–20 km pace, median places change per 1-point bin.
    x = 100 * (((s.times[:, 7] - s.times[:, 5]) / 10) / s.baseline - 1)
    breakeven = []
    for lo in range(-20, 80, 2):
        m = (x >= lo) & (x < lo + 2)
        if m.sum() >= MIN_CELL:
            breakeven.append(dict(x=lo + 1, n=int(m.sum()), median=r(np.median(gain30[m]), 3),
                                  p10=r(quantile(gain30[m], .1), 3), p90=r(quantile(gain30[m], .9), 3), gained=r((gain30[m] > 0).mean(), 4)))
    crossing = next((b0['x'] + (b1['x'] - b0['x']) * b0['median'] / (b0['median'] - b1['median'])
                     for b0, b1 in zip(breakeven, breakeven[1:]) if b0['median'] > 0 >= b1['median']), None)
    # Where you were at 30 km vs where you finished (percentile fans).
    q30, qf = pct(5), pct(8)
    fan = []
    for lo in range(0, 100, 2):
        m = (q30 >= lo) & (q30 < lo + 2)
        if m.sum() >= MIN_CELL:
            fan.append(dict(at30=lo + 1, n=int(m.sum()), p10=r(quantile(qf[m], .1), 2), p50=r(quantile(qf[m], .5), 2), p90=r(quantile(qf[m], .9), 2),
                            surger=r(surger[m].mean(), 4), sinker=r(sinker[m].mean(), 4)))
    # Median runner ledger: exact passes made / suffered after 30 km for finishes at the 49–51st percentile at 30 km.
    ledger = middle_ledger(s, q30)
    # Women vs men on the mixed clock, per edition.
    editions = []
    for e in np.flatnonzero(sizes):
        m = s.edition == e
        w, mm = m & (s.gender == 2), m & (s.gender == 1)
        if w.sum() >= MIN_CELL and mm.sum() >= MIN_CELL:
            ed = s.editions[e]
            editions.append(dict(city=ed['city'], year=ed['year'], women=r(gain30[w].mean(), 3), men=r(gain30[mm].mean(), 3),
                                 women_n=int(w.sum()), men_n=int(mm.sum())))
    groups = []
    for label, m in (('Faster second 20 km', change20 < -2), ('Similar 20 km blocks', (change20 >= -2) & (change20 <= 2)),
                     ('Moderate slowing', (change20 > 2) & (change20 <= 10)), ('Pronounced slowing', change20 > 10),
                     ('No sustained slowdown', ~detected), ('Sustained slowdown', detected)):
        groups.append(dict(label=label, n=int(m.sum()), median=r(np.median(gain30[m]), 3), gained=r((gain30[m] > 0).mean(), 4),
                           surgers=r(surger[m].mean(), 5), sinkers=r(sinker[m].mean(), 5)))
    women_surgers = (surger & (s.gender == 2)).sum() / surger.sum()
    women_sinkers = (sinker & (s.gender == 2)).sum() / sinker.sum()
    return dict(
        cohort_n=int(s.n), start_offset_editions=len(flagged), editions_n=int((sizes > 0).sum()),
        gained_share=r((gain30 > 0).mean(), 4), surger_share=r(surger.mean(), 5), sinker_share=r(sinker.mean(), 5),
        surgers=int(surger.sum()), sinkers=int(sinker.sum()),
        women_share=r((s.gender == 2).mean(), 4), women_share_of_surgers=r(women_surgers, 4), women_share_of_sinkers=r(women_sinkers, 4),
        histogram=[dict(lo=float(a), share=r(c / s.n, 6)) for a, c in zip(hist_edges[:-1], hist)],
        coin_flip=coin, shuffle=shuffle, breakeven=breakeven, breakeven_crossing=r(crossing, 2) if crossing is not None else None,
        fan=fan, ledger=ledger, gender_editions=editions, groups=groups,
        women_ahead_editions=int(sum(e['women'] > e['men'] for e in editions)),
        method=('Within each edition every eligible finish is ranked by elapsed time at each checkpoint, ties sharing the average rank. Points gained '
                'are 100 × (rank at 30 km − rank at the finish) / (field − 1). Coin-flip rates sample up to 12 partners per finish among finishes '
                'behind it within 15 minutes at the checkpoint, weighted so every such pair counts equally, and ask how often the trailing finish '
                'crossed the line first. Section reshuffles sample random same-edition pairs. Editions with fewer than 100 eligible finishes and the '
                'editions whose first 5 km appears to include start delay are left out.'),
    )


def coin_flip(s, rng, partners=12):
    """Share of same-edition clock pairs within 15 minutes where the trailing finish ends ahead, by gap and checkpoint."""
    out = {}
    for km, k in CHECKS.items():
        overturned = np.zeros(len(GAP_BINS) - 1)
        weight = np.zeros(len(GAP_BINS) - 1)
        for e in np.unique(s.edition):
            idx = np.flatnonzero(s.edition == e)
            order = idx[np.argsort(s.times[idx, k], kind='stable')]
            t = s.times[order, k]
            fin = s.finish[order]
            hi = np.searchsorted(t, t + 900, side='right')
            lo = np.searchsorted(t, t, side='right')
            cand = hi - lo
            has = cand > 0
            if not has.any():
                continue
            i = np.repeat(np.flatnonzero(has), partners)
            c = cand[has].repeat(partners)
            j = lo[i] + (rng.random(len(i)) * c).astype(np.int64)
            gap = t[j] - t[i]
            b = np.minimum(np.searchsorted(GAP_BINS, gap, side='right') - 1, len(GAP_BINS) - 2)
            w = c / partners
            np.add.at(weight, b, w)
            np.add.at(overturned, b, w * (fin[j] < fin[i]))
        out[str(km)] = [dict(gap_lo_s=int(a), share=r(o / w, 4)) for a, o, w in zip(GAP_BINS[:-1], overturned, weight) if w > 0]
    return out


def section_shuffle(s, rng, partners=40):
    """Share of random same-edition pairs whose clock order swaps between consecutive checkpoints."""
    swaps = np.zeros(8)
    pairs = 0
    for e in np.unique(s.edition):
        idx = np.flatnonzero(s.edition == e)
        a = np.repeat(idx, partners)
        b = idx[(rng.random(len(a)) * len(idx)).astype(np.int64)]
        keep = a != b
        a, b = a[keep], b[keep]
        d = np.sign(s.times[a] - s.times[b])
        swaps += ((d[:, 1:] * d[:, :-1]) < 0).sum(0)
        pairs += len(a)
    labels = ['5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2']
    km = [5, 5, 5, 5, 5, 5, 5, 2.195]
    return [dict(section=l, share=r(v / pairs, 6), per_km=r(v / pairs / k, 6)) for l, v, k in zip(labels, swaps, km)]


def middle_ledger(s, q30):
    """Exact clock passes after 30 km for finishes in the middle (49–51st percentile at 30 km) of each edition."""
    made, suffered, fields = [], [], []
    for e in np.unique(s.edition):
        idx = np.flatnonzero(s.edition == e)
        focal = idx[(q30[idx] >= 49) & (q30[idx] <= 51)]
        if not len(focal):
            continue
        t30, tf = s.times[idx, 5], s.finish[idx]
        for start in range(0, len(focal), 256):
            fc = focal[start:start + 256]
            a30, af = s.times[fc, 5][:, None], s.finish[fc][:, None]
            made.extend(((t30[None, :] < a30) & (tf[None, :] > af)).sum(1))
            suffered.extend(((t30[None, :] > a30) & (tf[None, :] < af)).sum(1))
            fields.extend([len(idx) - 1] * len(fc))
    made, suffered, fields = map(np.asarray, (made, suffered, fields))
    return dict(n=int(len(made)), median_field=r(np.median(fields + 1), 0),
                passes_per_1000=r(np.median(1000 * made / fields), 2), passed_by_per_1000=r(np.median(1000 * suffered / fields), 2),
                median_passes=r(np.median(made), 1), median_passed_by=r(np.median(suffered), 1))
