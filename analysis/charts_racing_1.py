"""Top 100 charts: the racing charts of this module (analysis/build_charts.py).

Racing within a field: where the field stood when its front finished, women moving up the finishing order, pairs of
finishes in step, gaps reversed, the even-4:00 margin, slowing that still gained places, and finishes matched at
every mat. Places are clock-time orders within an edition, never road positions; every pair count is exact.
"""
import numpy as np

from charts_common import MATS, MIN_CELL, count_phrase, edition_ranks, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
TOL = 5.0  # seconds: "in step" and "matched" mean within 5 s of each other


def edition_rows(c, keep):
    """Row indices of each kept edition, in edition index order, rows in cohort order."""
    order = np.argsort(c.edition, kind='stable')
    bounds = np.r_[0, np.cumsum(np.bincount(c.edition, minlength=len(c.editions)))]
    out = []
    for e in range(len(c.editions)):
        idx = order[bounds[e]:bounds[e + 1]]
        if len(idx) and keep[idx].all():
            out.append((e, idx))
    return out


def finishes(n):
    """'3,969,514 finishes' for method prose."""
    return count_phrase(n, 'finish')


def require_editions(rows, min_n, what=''):
    """The kept editions, or a refusal naming what is missing (small cohorts such as the unit test's)."""
    if not rows:
        raise ValueError(f'no editions with {min_n:,}+ finishes{what}')
    return rows


def screened(c, min_n):
    """Start-screened editions (c.shape_keep, an edition-level flag) with at least min_n finishes."""
    return c.shape_keep & (c.ed_n[c.edition] >= min_n)


def prefix_counts(y, ks, qs):
    """For each query (k, q): how many of y[0:k] are below q. y are integer ranks; a merge-sort tree, one sorted
    level per power of two, each prefix decomposed into its full blocks."""
    y = np.asarray(y, np.int64)
    ks = np.asarray(ks, np.int64)
    qs = np.asarray(qs, np.int64)
    m = len(y)
    out = np.zeros(len(ks), np.int64)
    if not m:
        return out
    R = int(y.max()) + 2
    level = 0
    while (1 << level) <= m:
        size = 1 << level
        nb = m // size
        keys = np.sort(np.repeat(np.arange(nb, dtype=np.int64), size) * R + y[:nb * size])
        sel = ((ks >> level) & 1).astype(bool)
        if sel.any():
            b = (ks[sel] >> level) - 1
            out[sel] += np.searchsorted(keys, b * R + qs[sel], 'left') - b * size
        level += 1
    return out


def dense_ranks(v):
    return np.unique(v, return_inverse=True)[1].astype(np.int64)


# ----------------------------------------------------------------
@chart('when-the-front-1-percent-finish')
def when_front_finish(c):
    """Per edition of 2,000+ screened finishes: t1 = the 1st-percentile finish; the share of finishes whose split at each
    mat was at or under t1; the median over editions."""
    keep = screened(c, 2000)
    shares, t1s, sizes = [], [], []
    for e, idx in require_editions(edition_rows(c, keep), 2000):
        t1 = quantile(c.finish[idx], 0.01)
        shares.append([float((c.times[idx, k] <= t1).mean()) for k in range(9)])
        t1s.append(t1)
        sizes.append(len(idx))
    shares = np.array(shares)
    med = [median(shares[:, k]) for k in range(9)]
    n = int(keep.sum())
    require_cell(min(sizes), 'smallest edition')
    cols = [dict(label=MATS[k], value=sh(med[k]), tone='signal' if k == 5 else 'quiet') for k in range(3, 9)]
    return dict(
        values=dict(past20=sh(med[3]), past25=sh(med[4]), past30=sh(med[5]), past35=sh(med[6]), past40=sh(med[7]),
                    t1=sec(median(t1s)), eds=len(sizes), n_min=int(min(sizes))),
        plot=dict(form='columns', cols=cols, fmt='share', values='all',
                  y=dict(min=0, max=1.12, fmt='share', ticks=[0, 0.5, 1])),
        cohort_n=n, editions_n=len(sizes), weighting='editions-equal',
        method=(f'In each start-screened edition of at least 2,000 finishes ({len(sizes)} editions, {finishes(n)}), the running '
                'time of its quickest 1% of finishes (the 1st-percentile finish) against every finish\'s split at each mat; '
                'the median edition. This is running time, not a moment on the clock: waves start apart.'),
    )


# ----------------------------------------------------------------
def ahead_share(tw, tm):
    """The share of (woman, man) pairs with the woman's elapsed time strictly lower; a tie counts as half."""
    s = np.sort(tm)
    hi = np.searchsorted(s, tw, 'right')
    lo = np.searchsorted(s, tw, 'left')
    return float(((len(s) - hi).sum() + 0.5 * (hi - lo).sum()) / (len(tw) * len(tm)))


X_KM = [0, 1, 2, 3, 4, 5, 6, 7, 7.439]   # mats on a distance scale, 5 km per step (the finish is 2.195 km after 40K)


def gender_editions(c, min_n=1000):
    """Start-screened editions of min_n+ finishes with 100+ recorded women and men, no gender-recording gap and at
    most 2% of finishes without a recorded gender (the women-versus-men screen)."""
    keep = screened(c, min_n)
    out = []
    for e, idx in edition_rows(c, keep):
        g = c.gender[idx]
        if c.gender_gap_edition[e] or (g == 0).sum() > 0.02 * len(idx):
            continue
        w, m = idx[g == 2], idx[g == 1]
        if len(w) >= MIN_CELL and len(m) >= MIN_CELL:
            out.append((e, idx, w, m))
    return out


@chart('women-move-up-after-20k')
def women_move_up(c):
    """Every woman-man pair in each screened edition (gender screen above): the share with the woman ahead by elapsed
    time at each mat; the median race per mat."""
    rows = []
    for e, idx, w, m in require_editions(gender_editions(c), 1000, ' and 100+ recorded women and men'):
        T = c.times
        rows.append((len(idx), min(len(w), len(m)), [ahead_share(T[w, k], T[m, k]) for k in range(9)]))
    S = np.array([r[2] for r in rows])
    med = [median(S[:, k]) for k in range(9)]
    up = S[:, 8] - S[:, 3]
    n = int(sum(r[0] for r in rows))
    n_min = int(min(r[1] for r in rows))
    require_cell(n_min, 'smallest gender group')
    pts = [[X_KM[k], sh(med[k])] for k in range(9)]
    marks = [dict(label='20K mark', tone='ink', points=[pts[3]], width=3, labelAt='none', dots=True),
             dict(label='Finish mark', tone='signal', points=[pts[8]], width=3, labelAt='none', dots=True)]
    return dict(
        values=dict(s5=sh(med[0]), s20=sh(med[3]), s30=sh(med[5]), s40=sh(med[7]), sfin=sh(med[8]), rise=sh(median(up)),
                    eds_up=int((up > 0).sum()), eds=len(rows), n_min=n_min),
        plot=dict(form='lines',
                  series=[dict(label='Woman ahead', tone='signal', points=pts, width=3, labelAt='none')] + marks,
                  x=dict(min=-0.9, max=7.439, fmt='int', cats=[MATS[k] for k in range(8)]),
                  y=dict(min=0.28, max=0.36, fmt='share', ticks=[0.28, 0.3, 0.32, 0.34, 0.36], title='of pairs, woman ahead'),
                  notes=[dict(x=3, y=sh(med[3]), text='{v} at 20K', value=sh(med[3]), fmt='share', tone='ink', anchor='middle', dy=-14),
                         dict(x=7.439, y=sh(med[8]), text='{v} at the finish', value=sh(med[8]), fmt='share', tone='signal', anchor='end', dy=-16)]),
        cohort_n=n, editions_n=len(rows), weighting='editions-equal',
        method=(f'Every pair of a recorded woman\'s and a recorded man\'s finish in each start-screened edition of at least 1,000 '
                f'finishes with 100 of each and at most 2% of finishes without a recorded gender, editions with gender-recording '
                f'gaps left out ({len(rows)} editions, {finishes(n)}): the share of pairs with the woman ahead by elapsed time '
                'at each mat (a tie counts as half); the median edition. Places are clock-time orders, not road positions.'),
    )


# ---------------------------------------------------------------- in-step pairs (shared by two charts)
_PAIRS = {}


def in_step_pairs(c):
    """Every pair of finishes in the same screened edition of 1,000+ finishes within 5 s at 5, 10, 15 and 20K. Returns
    per pair: the earlier member's 20K time, whether still within 5 s at every mat so far (20K … finish), the edition;
    and per finish: whether it had such a partner and whether one stayed within 5 s at all nine points."""
    key = id(c)
    if key in _PAIRS:
        return _PAIRS[key]
    keep = screened(c, 1000)
    T = c.times
    t20s, cums, eds = [], [], []
    has20 = np.zeros(c.n, bool)
    full = np.zeros(c.n, bool)
    for e, idx in require_editions(edition_rows(c, keep), 1000):
        o = idx[np.argsort(T[idx, 3], kind='stable')]
        t = T[o]
        m = len(o)
        s = 1
        while s < m:
            d20 = t[s:, 3] - t[:-s, 3]
            if d20.min() > TOL:
                break
            ok = d20 <= TOL
            for j in range(3):
                ok &= np.abs(t[s:, j] - t[:-s, j]) <= TOL
            if ok.any():
                a = np.flatnonzero(ok)
                b = a + s
                cum = np.cumprod(np.abs(t[b, 3:] - t[a, 3:]) <= TOL, axis=1).astype(bool)
                t20s.append(t[a, 3])
                cums.append(cum)
                eds.append(np.full(len(a), e))
                has20[o[a]] = True
                has20[o[b]] = True
                f = cum[:, -1]
                full[o[a[f]]] = True
                full[o[b[f]]] = True
            s += 1
    if not t20s:
        raise ValueError('no in-step pairs through 20K')
    out = dict(t20=np.concatenate(t20s), cum=np.concatenate(cums), ed=np.concatenate(eds), has20=has20, full=full, keep=keep)
    _PAIRS[key] = out
    return out


SPLIT_LABELS = ['20–25K', '25–30K', '30–35K', '35–40K', '40K–finish']
BANDS = [(9900, 11700, '2:45–3:15'), (11700, 13500, '3:15–3:45'), (13500, 15300, '3:45–4:15'), (15300, 17100, '4:15–4:45'),
         (17100, 18900, '4:45–5:15')]


def band_of(t20):
    proj = t20 * 42.195 / 20
    out = np.full(len(t20), -1)
    for i, (lo, hi, _) in enumerate(BANDS):
        out[(proj >= lo) & (proj < hi)] = i
    return out


@chart('pairs-in-step-split-up')
def pairs_in_step(c):
    """Pairs in step through 20K by the finish their 20K split projects (20K × 42.195/20): the share still within 5 s at
    every later mat, and for the quickest band (2:45–3:15) the section in which each pair parted. The order of the
    bands is checked per finish and per race too."""
    P = in_step_pairs(c)
    pb = band_of(P['t20'])
    fb = band_of(c.times[:, 3])
    surv, npairs, per_ed, fin = [], [], [], []
    for i, (_, _, label) in enumerate(BANDS):
        m = pb == i
        npairs.append(require_cell(m.sum(), f'pairs {label}'))
        surv.append(P['cum'][m].mean(0))
        eds = []
        for e in np.unique(P['ed'][m]):
            me = m & (P['ed'] == e)
            if me.sum() >= MIN_CELL:
                eds.append(float(P['cum'][me, -1].mean()))
        if not eds:
            raise ValueError(f'no race with 100+ pairs {label}')
        per_ed.append(median(eds))
        # The per-finish version: finishes with an in-step partner through 20K, by their own projected band.
        mf = P['has20'] & (fb == i)
        require_cell(mf.sum(), f'finishes with a partner {label}')
        fin.append(float(P['full'][mf].mean()))
    # Where the quick pairs (2:45–3:15 splits at 20K) parted: the first mat after 20K more than 5 s apart.
    q = surv[0]
    parted = [float(q[j] - q[j + 1]) for j in range(5)]
    require_cell(npairs[0], 'quick pairs')
    rows = [dict(label=lab, value=sh(v), tone='signal' if j == 0 else 'quiet') for j, (lab, v) in enumerate(zip(SPLIT_LABELS, parted))]
    rows.append(dict(label='Still in step', value=sh(q[-1]), tone='ink'))
    n = int(P['keep'].sum())
    values = dict(slow=sh(surv[4][-1]), fast=sh(surv[0][-1]), mid=sh(surv[2][-1]), n_fast=npairs[0], n_slow=npairs[4],
                  slow_f=sh(fin[4]), fast_f=sh(fin[0]), slow_ed=sh(per_ed[4]), fast_ed=sh(per_ed[0]),
                  at25=sh(q[1]), apart25=sh(parted[0]), top_part=sh(max(parted)))
    for j in range(5):
        values[f'part{j}'] = sh(parted[j])
    for i in range(5):
        values[f'pair{i}'], values[f'fin{i}'], values[f'race{i}'] = sh(surv[i][-1]), sh(fin[i]), sh(per_ed[i])
    return dict(
        values=values,
        plot=dict(form='bars', rows=rows, fmt='share1',
                  x=dict(min=0, max=0.8, fmt='share', ticks=[0, 0.25, 0.5, 0.75])),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[P['keep']]))), weighting='pairs',
        method=(f'Every pair of finishes in the same start-screened edition of at least 1,000 finishes ({finishes(n)}) '
                'within 5 seconds of each other at 5, 10, 15 and 20K, grouped by the finish the earlier 20K split projects '
                '(20K time × 42.195/20); for the 2:45–3:15 group, the section in which each pair parted (first more than 5 '
                'seconds apart at the mat that ends it) or that it stayed within 5 seconds to the finish. Across groups, the share still within 5 seconds at every later mat rises with the '
                'projected finish. A pack of k finishes gives '
                'k(k−1)/2 pairs, so the same five groups were also counted per finish (finishes with such a partner that '
                'kept one to the finish) and per edition (the median edition of 100+ pairs): the order of the groups is the same.'),
    )


# ----------------------------------------------------------------
FIN_BANDS = [(0, 10800, 'Under 3:00'), (10800, 12600, '3:00–3:30'), (12600, 14400, '3:30–4:00'), (14400, 16200, '4:00–4:30'),
             (16200, 18000, '4:30–5:00'), (18000, 19800, '5:00–5:30'), (19800, 21600, '5:30–6:00'), (21600, 10 ** 9, '6:00+')]
SLOW_BAND = 6


@chart('matched-at-every-mat')
def matched_every_mat(c):
    """Finishes within 5 s of another finish in the same screened race at all nine mats, by finish band."""
    P = in_step_pairs(c)
    keep, full = P['keep'], P['full']
    rows, shares = [], []
    for i, (lo, hi, label) in enumerate(FIN_BANDS):
        m = keep & (c.finish >= lo) & (c.finish < hi)
        require_cell(m.sum(), label)
        s = float(full[m].mean())
        shares.append(s)
        rows.append(dict(label=label, value=sh(s), tone='signal' if i == SLOW_BAND else 'ink' if i == 0 else 'quiet'))
    n = int(keep.sum())
    allv = float(full[keep].mean())
    rows.append(dict(label='All finishes', value=sh(allv), tone='faint'))
    return dict(
        values=dict(all=sh(allv), slow=sh(shares[SLOW_BAND]), fast=sh(shares[0]), top=sh(max(shares)),
                    matched=int(full[keep].sum())),
        plot=dict(form='bars', rows=rows, fmt='share1',
                  x=dict(min=0, max=0.15, fmt='share', ticks=[0, 0.05, 0.1, 0.15])),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=(f'Finishes in start-screened editions of at least 1,000 finishes ({finishes(n)}) that had another finish '
                'within 5 seconds of elapsed time at 5, 10, 15, 20, 25, 30, 35, 40K and the finish. Chip times only: '
                'nothing says the two ran together.'),
    )


# ----------------------------------------------------------------
GAP_EDGES = [0, 60, 120, 300, 600, 900, 1200, 1800]
GAP_LABELS = ['0–1', '1–2', '2–5', '5–10', '10–15', '15–20', '20–30']


def reversals(tk, f):
    """For one edition and one mat: per gap bin, pairs with that gap at the mat (ties excluded) and how many finished in
    the reverse order (finish ties excluded from both)."""
    o = np.argsort(tk, kind='stable')
    ts = tk[o]
    fr = dense_ranks(f)
    y = fr[o]
    starts = [np.searchsorted(ts, tk, 'right')] + [np.searchsorted(ts, tk + g, 'left') for g in GAP_EDGES[1:]]
    m = len(tk)
    ks = np.concatenate(starts + starts)
    qs = np.concatenate([fr] * len(starts) + [fr + 1] * len(starts))
    cnt = prefix_counts(y, ks, qs)
    E = len(starts)
    less = [cnt[i * m:(i + 1) * m].sum() for i in range(E)]
    leq = [cnt[(E + i) * m:(E + i + 1) * m].sum() for i in range(E)]
    tot = [s.sum() for s in starts]
    out = []
    for b in range(E - 1):
        pairs = int(tot[b + 1] - tot[b])
        ties = int((leq[b + 1] - less[b + 1]) - (leq[b] - less[b]))
        rev = int(less[b + 1] - less[b])
        out.append((pairs - ties, rev))
    return out


@chart('leads-overturned')
def leads_overturned(c):
    """Every pair of finishes in each screened edition of 1,000+ finishes, by their gap at 20K (and 30K): the share
    whose finish order was the reverse; the median race per gap."""
    keep = screened(c, 1000)
    per = {3: [], 5: []}
    for e, idx in require_editions(edition_rows(c, keep), 1000):
        for k in per:
            per[k].append(reversals(c.times[idx, k], c.finish[idx]))
    meds, pooled = {}, {}
    for k, rows in per.items():
        arr = np.array(rows, dtype=np.float64)          # editions × bins × (pairs, reversed)
        meds[k] = [median(arr[:, b, 1] / arr[:, b, 0]) for b in range(len(GAP_LABELS))]
        pooled[k] = [arr[:, b, 1].sum() / arr[:, b, 0].sum() for b in range(len(GAP_LABELS))]
        for b in range(len(GAP_LABELS)):
            require_cell(int(arr[:, b, 0].min()), f'pairs {GAP_LABELS[b]} min apart at {MATS[k]}')
        if k == 3:
            pairs_min = int(arr[:, :, 0].min())
    n = int(keep.sum())
    rows = [dict(label=f'{GAP_LABELS[b]} min', value=sh(meds[3][b]), tone='signal' if b == 3 else 'ink' if b == 0 else 'quiet') for b in range(len(GAP_LABELS))]
    return dict(
        values=dict(p20=sh(meds[3][3]), p20_pooled=sh(pooled[3][3]), p30=sh(meds[5][3]), p20_1=sh(meds[3][0]),
                    p20_15=sh(meds[3][5]), pairs_min=pairs_min),
        plot=dict(form='bars', rows=rows, fmt='share',
                  x=dict(min=0, max=0.5, fmt='share', ticks=[0, 0.25, 0.5])),
        cohort_n=n, editions_n=int(len(per[3])), weighting='editions-equal',
        method=(f'Every pair of finishes in each start-screened edition of at least 1,000 finishes ({finishes(n)}), by their '
                'gap in elapsed time at 20K or 30K, and whether the finish order was the reverse (ties at either point left out); '
                f'the median edition (every pair pooled, 5–10 minutes at 20K: {pooled[3][3] * 100:.1f}%).'),
    )


# ----------------------------------------------------------------
AHEAD_LO, AHEAD_HI = -6, 20     # bins of 30 s, centred on whole half-minutes from −3:00 to +10:00


@chart('time-in-hand-for-4')
def time_in_hand(c):
    """Screened finishes by their margin on 4:00 splits at a mat (14400 × km/42.195 − split, 30-s bins): the share
    that finished under 4:00."""
    keep = c.shape_keep
    under = c.finish < 14400
    series, on, half, ns = {}, {}, {}, {}
    for k, tone in ((3, 'signal'), (5, 'quiet'), (6, 'quiet'), (7, 'quiet')):
        ahead = 14400 * POINTS[k] / 42.195 - c.times[:, k]
        b = np.floor((ahead + 15) / 30)
        pts = []
        for j in range(AHEAD_LO, AHEAD_HI + 1):
            m = keep & (b == j)
            require_cell(m.sum(), f'{MATS[k]} bin {j}')
            pts.append([j * 30, sh(under[m].mean())])
            if j == 0:
                on[k], ns[k] = float(under[m].mean()), int(m.sum())
        half[k] = next((x for x, y in pts if y >= 0.5), None)
        if half[k] is None:
            raise ValueError(f'no {MATS[k]} margin where at least half finished under 4:00')
        series[k] = dict(label=MATS[k], tone=tone, points=pts, width=3 if k == 3 else 2)
    n = int(keep.sum())
    return dict(
        values=dict(on=sh(on[3]), on30=sh(on[5]), on35=sh(on[6]), on40=sh(on[7]), n_on=ns[3], half20=half[3], half40=half[7]),
        plot=dict(form='lines', series=[series[7], series[3]],
                  x=dict(min=-180, max=600, fmt='dmins', ticks=[0, 300, 600], title='ahead of 4:00 splits at the mat'),
                  y=dict(min=0, max=1, fmt='share', ticks=[0.25, 0.5, 0.75, 1], title='finished under 4:00'),
                  refs=[dict(axis='y', value=0.5, tone='quiet')],
                  notes=[dict(x=0, y=sh(on[3]), text='{v} at 20K', value=sh(on[3]), fmt='share', tone='signal', anchor='start', dx=8, dy=14),
                         dict(x=half[3], y=0.5, text='half at {v}', value=half[3], fmt='delta', tone='ink', anchor='start', dx=8, dy=22)]),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=(f'Start-screened finishes ({finishes(n)}) by their margin on 4:00 splits at 20K, 30K, 35K and 40K '
                '(4:00 × km/42.195 minus the split, in 30-second bins centred on whole half-minutes, so "on 4:00 splits" is '
                'within 15 seconds); the share of each bin that finished under 4:00.'),
    )


# ----------------------------------------------------------------
def break_even(rb, dp, mask):
    """The first 0.5% bin of 20K–40K slowdown at which the median places gained stops being positive (bins of 100+)."""
    b = rb[mask]
    d = dp[mask]
    o = np.argsort(b, kind='stable')
    b, d = b[o], d[o]
    ub, start = np.unique(b, return_index=True)
    ends = np.r_[start[1:], len(b)]
    med = {}
    for v, s, e in zip(ub, start, ends):
        if e - s >= MIN_CELL and -20 <= v < 100:
            med[int(v)] = median(d[s:e])
    for v in sorted(med):
        if med[v] > 0 and med.get(v + 1, 1.0) <= 0:
            return (v + 1) / 200
    raise ValueError('no slowdown bin where the median places gained turns from positive to none')


TENTHS = ['Front tenth', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', 'Back tenth']


@chart('slowing-that-still-gained')
def slowing_gained(c):
    """Screened editions of 1,000+ finishes: slowdown r = (t40 − t20)/t20 − 1; places gained = (place at 20K − place
    at 40K) × 100 as fractions of the field; the r at which the median places gained crosses zero, for each
    tenth of the field at 20K."""
    keep = screened(c, 1000)
    if not keep.any():
        raise ValueError('no editions with 1,000+ finishes')
    ed = np.where(keep, c.edition, -1)
    r20 = edition_ranks(c.times[:, 3], ed)
    r40 = edition_ranks(c.times[:, 7], ed)
    t20, t40 = c.times[:, 3], c.times[:, 7]
    rb = np.floor(200 * (t40 - 2 * t20) / t20)
    dp = (r20 - r40) * 100
    slow = (t40 - 2 * t20) / t20
    allv = break_even(rb, dp, keep)
    tenth = np.minimum(np.floor(r20 * 10), 9)
    be = []
    for d in range(10):
        m = keep & (tenth == d)
        require_cell(m.sum(), TENTHS[d])
        be.append(break_even(rb, dp, m))
    typical = median(slow[keep])
    rows = [dict(label=TENTHS[d], value=sh(be[d]), tone='signal' if d == 9 else 'ink' if d == 0 else 'quiet') for d in range(10)]
    n = int(keep.sum())
    return dict(
        values=dict(cross=sh(allv), front=sh(be[0]), back=sh(be[9]), typical=sh(typical),
                    **{f'tenth{d}': sh(be[d]) for d in range(10)}),
        plot=dict(form='bars', rows=rows, fmt='share1',
                  x=dict(min=0, max=0.2, fmt='share', ticks=[0, 0.1, 0.2])),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=(f'Finishes in start-screened editions of at least 1,000 finishes ({finishes(n)}), by their tenth of the edition\'s '
                'field at 20K (clock-time order): the 20–40K time against the 0–20K time, in half-percent bins, and places '
                'gained between 20K and 40K (in hundredths of the field); the first bin where the median places gained '
                f'is no longer positive (all finishes: {allv * 100:.1f}%). The median slowdown of all finishes was {typical * 100:.1f}%.'),
    )
