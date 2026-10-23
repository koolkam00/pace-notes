"""Top 100 charts, pacing (second batch) (analysis/build_charts.py). Pacing shapes: where sustained slowdowns
began, the quickest and slowest 5K, each section after 20K against the 5-20K pace, the gap between a linked record's
quickest and slowest finish, the slowest 5K after 20K, a steady 15-20K, a quicker second 5K, and where slowdowns began by place at 20K. Every chart reads the
start-screened editions only (c.shape_keep), since each is a pacing-shape or early-split statistic."""
import numpy as np

from charts_common import SECTIONS, count_phrase, edition_ranks, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


def _finishes(n):
    """'3,970,364 finishes'."""
    return count_phrase(n, 'finish')


def _screened(c):
    keep = np.asarray(c.shape_keep, bool)
    return keep, int(keep.sum()), int(len(np.unique(c.edition[keep])))


@chart('where-slowdowns-began')
def where_slowdowns_began(c):
    """Every 100 sustained slowdowns, by the 5K mat where the slowdown began (20K, 25K, 30K or 35K)."""
    keep, n, k = _screened(c)
    require_cell(n, 'screened finishes')
    slow = keep & np.asarray(c.slow, bool)
    ns = require_cell(slow.sum(), 'sustained slowdowns')
    at = {km: require_cell((slow & (c.onset == km)).sum(), f'slowdowns from {km}K') for km in (20, 25, 30, 35)}
    late = (at[30] + at[35]) / ns
    early = (at[20] + at[25]) / ns
    return dict(
        values=dict(slow=sh(ns / n), late=sh(late), early=sh(early), at25=sh(at[25] / ns), at20=sh(at[20] / ns), slowdowns=int(ns)),
        # Two parts, so each part's whole squares match its printed share (72 + 28 = 100); a 20K/25K split would print
        # 9% beside 8 squares, since the renderer rounds only the signal part on its own.
        plot=dict(form='waffle', parts=[
            dict(share=sh(late), tone='signal', label='began at 30K or 35K'),
            dict(share=sh(early), tone='o2', label='began at 20K or 25K'),
        ]),
        cohort_n=n, editions_n=k, weighting='pooled',
        method=f'Every sustained slowdown in start-screened editions ({_finishes(n)}, {count_phrase(ns, "slowdown")}), by the 5K mat where it began.',
    )


@chart('quickest-and-slowest-5k')
def quickest_and_slowest_5k(c):
    """Which of the eight full 5K sections was each finish's quickest and which its slowest."""
    keep, n, k = _screened(c)
    require_cell(n, 'screened finishes')
    p8 = c.paces[keep, :8]
    lo = np.bincount(np.argmin(p8, axis=1), minlength=8)
    hi = np.bincount(np.argmax(p8, axis=1), minlength=8)
    left = [sh(lo[i] / n) for i in range(8)]
    right = [sh(hi[i] / n) for i in range(8)]
    # The reading is the slowest 5K at 35-40K (signal, right side only); the quickest 5K before 15K is the ink side.
    rows = [dict(label=SECTIONS[i], left=left[i], right=right[i], toneLeft='ink' if i < 3 else 'quiet',
                 toneRight='signal' if i == 7 else 'quiet', **({'tone': 'signal'} if i == 7 else {})) for i in range(8)]
    return dict(
        values=dict(slow=right[7], quick=sh((lo[0] + lo[1] + lo[2]) / n), first_quick=left[0], slow_30=right[6]),
        plot=dict(form='pyramid', rows=rows, left='Quickest 5K', right='Slowest 5K', fmt='share',
                  max=sh(max(left + right))),
        cohort_n=n, editions_n=k, weighting='pooled',
        method=f'Every finish in start-screened editions ({_finishes(n)}): which of its eight full 5K sections was quickest and which slowest.',
    )


EVEN_AFTER_20K = 22.195 / 42.195
SECTION_KM = [5.0] * 8 + [2.195]


@chart('where-the-slow-day-happened')
def where_the_slow_day_happened(c):
    """Records linked by name with two or more screened finishes: in which section the gap between their quickest and
    their slowest finish opened, pooled over every gap of more than a minute, against each section's share of the
    distance."""
    idx = np.flatnonzero(np.asarray(c.shape_keep, bool))
    order = idx[np.lexsort((c.finish[idx], c.profile[idx]))]
    prof = c.profile[order]
    first = np.r_[True, prof[1:] != prof[:-1]]
    last = np.r_[prof[1:] != prof[:-1], True]
    starts, ends = np.flatnonzero(first), np.flatnonzero(last)
    multi = ends > starts
    quick, slow = order[starts[multi]], order[ends[multi]]
    gap_f = c.finish[slow] - c.finish[quick]
    ok = gap_f > 60
    records = require_cell(ok.sum(), 'linked records')
    quick, slow, gap_f = quick[ok], slow[ok], gap_f[ok]
    gap_20 = c.times[slow, 3] - c.times[quick, 3]
    after = (gap_f - gap_20) / gap_f
    pooled = float((gap_f - gap_20).sum() / gap_f.sum())
    zero = np.zeros((records, 1))
    per = np.diff(np.c_[zero, c.times[slow]] - np.c_[zero, c.times[quick]], axis=1).sum(axis=0) / gap_f.sum()
    dist = [km / 42.195 for km in SECTION_KM]
    top = 4 + int(np.argmax(per[4:8]))
    # Every section after 20K is lit as one reading: together they hold the pooled share of the gap.
    rows = [dict(label=SECTIONS[i], a=sh(dist[i]), b=sh(per[i]), tone='signal' if i >= 4 else 'quiet') for i in range(9)]
    finishes = int(2 * records)
    return dict(
        values=dict(pooled=sh(pooled), even=sh(EVEN_AFTER_20K), after=sh(median(after)), over_even=sh(float((after > EVEN_AFTER_20K).mean())),
                    med_gap=sec(median(gap_f)), top=int(top), top_b=sh(per[top]), top_a=sh(dist[top]),
                    after_wider=int(sum(per[i] > dist[i] for i in range(4, 9))), n=records),
        plot=dict(form='dumbbell', rows=rows, x=dict(min=0.03, max=0.19, fmt='share', ticks=[0.05, 0.1, 0.15]), fmt='share',
                  a='distance', b='time gap',
                  notes=[dict(row=5, x=0.108, text='After 20K:\n{v} of the gap', value=sh(pooled), fmt='share', tone='signal', anchor='end', dy=5)]),
        cohort_n=finishes, editions_n=int(len(np.unique(c.edition[np.r_[quick, slow]]))), weighting='pairs',
        method=(f'Records linked by name (not verified people) with two or more finishes in start-screened editions ({count_phrase(records, "record")} '
                'with a gap over a minute): the gap between each record\'s quickest and slowest finish, split by section and pooled over every '
                f'record, against each section\'s share of the distance (the median record opened {round(median(after) * 100)}% of its gap after 20K).'),
    )


Y_TOP = 0.08
WORST_LO, WORST_STEP, WORST_BINS, WORST_DRAWN = -0.1, 0.025, 45, 36  # bins from -10% (the first also holds every finish below -7.5%); drawn to +80%


def worst_after_20k(c, keep):
    base = c.baseline[keep]
    return np.max(c.paces[keep, 4:8] / base[:, None], axis=1) - 1


@chart('slowest-5k-after-20k')
def slowest_5k_after_20k(c):
    """Each finish's slowest 5K after 20K against its own 5-20K pace, in bins of 2.5 points, drawn up to +80%."""
    keep, n, k = _screened(c)
    require_cell(n, 'screened finishes')
    w = worst_after_20k(c, keep)
    b = np.clip(np.floor((w - WORST_LO) / WORST_STEP).astype(np.int64), 0, WORST_BINS - 1)
    counts = np.bincount(b, minlength=WORST_BINS)
    bins = [dict(x0=sh(WORST_LO + i * WORST_STEP), x1=sh(WORST_LO + (i + 1) * WORST_STEP), v=sh(counts[i] / n), tone='quiet') for i in range(WORST_DRAWN)]
    beyond = sh(counts[WORST_DRAWN:].sum() / n)
    med = median(w)
    vmax = max(bb['v'] for bb in bins)
    x_max = sh(WORST_LO + WORST_DRAWN * WORST_STEP)
    return dict(
        values=dict(med=sh(med), any_slower=sh(float((w > 0).mean())), over5=sh(float((w + 1e-12 >= 0.05).mean())), p90=sh(quantile(w, 0.9)), over25=sh(float((w + 1e-12 >= 0.25).mean())),
                    over50=sh(float((w >= 0.5).mean())), beyond=beyond),
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=WORST_LO, max=x_max, fmt='dpct', ticks=[0, 0.25, 0.5, 0.75], title='Slowest 5K after 20K, against the 5–20K pace'),
                  y=dict(min=0, max=Y_TOP if vmax < Y_TOP else sh(vmax * 1.05), fmt='share', ticks=[0, 0.04, 0.08]),
                  refs=[dict(axis='x', value=sh(med), label=f'typical finish: +{round(med * 100)}%', tone='signal')],
                  notes=[dict(x=x_max, y=0.012, text='{v} beyond +80%', value=beyond, fmt='share', tone='quiet', anchor='end')]),
        cohort_n=n, editions_n=k, weighting='pooled',
        method=(f'Every finish in start-screened editions ({_finishes(n)}): its slowest 5K section after 20K against its own 5–20K pace, in bins of '
                '2.5 points; the first bin also holds every finish 7.5% quicker or more, and finishes beyond 80% slower are counted in a note.'),
    )


DRIFT_BINS = ['2%+ quicker', 'Within 2%', '2–4% slower', '4–6% slower', '6%+ slower']
DRIFT_KEYS = ['faster', 'steady', 'drift2', 'drift4', 'drift']


def drift_bin(c, keep):
    d = c.paces[keep, 3] / c.paces[keep, 1] - 1
    return np.select([d < -0.02, d <= 0.02, d <= 0.04, d <= 0.06], [0, 1, 2, 3], 4)


@chart('steady-before-20k')
def steady_before_20k(c):
    """The sustained-slowdown share by how far 15-20K drifted from the 5-10K pace."""
    keep, n, k = _screened(c)
    require_cell(n, 'screened finishes')
    g = drift_bin(c, keep)
    slow = np.asarray(c.slow, bool)[keep]
    sizes = [require_cell((g == i).sum(), DRIFT_BINS[i]) for i in range(5)]
    shares = [sh(slow[g == i].sum() / sizes[i]) for i in range(5)]
    tones = ['quiet', 'ink', 'quiet', 'quiet', 'signal']
    return dict(
        values=dict(**{DRIFT_KEYS[i]: shares[i] for i in range(5)}, n_min=int(min(sizes))),
        plot=dict(form='bars', rows=[dict(label=DRIFT_BINS[i], value=shares[i], tone=tones[i]) for i in range(5)],
                  x=dict(min=0, max=0.6, fmt='share', ticks=[0, 0.25, 0.5]), fmt='share'),
        cohort_n=n, editions_n=k, weighting='pooled',
        method=f'Every finish in start-screened editions ({_finishes(n)}), by how far its 15–20K pace drifted from its 5–10K pace; the share with a sustained slowdown.',
    )


BANDS = [(0, 10800, 'Under 3:00'), (10800, 12600, '3:00–3:30'), (12600, 14400, '3:30–4:00'), (14400, 16200, '4:00–4:30'),
         (16200, 18000, '4:30–5:00'), (18000, 21600, '5:00–6:00'), (21600, 10 ** 9, '6:00+')]
BAND_TONES = ['quiet', 'ink', 'quiet', 'quiet', 'quiet', 'quiet', 'signal']


@chart('most-ran-second-5k-quicker')
def most_ran_second_5k_quicker(c):
    """The share of finishes whose 5-10K was quicker than their 0-5K, by finish band, against all finishes."""
    keep, n, k = _screened(c)
    require_cell(n, 'screened finishes')
    quicker = keep & (c.paces[:, 1] < c.paces[:, 0])
    slower = keep & (c.paces[:, 1] > c.paces[:, 0])
    rows, slower_of = [], []
    for (lo, hi, label), tone in zip(BANDS, BAND_TONES):
        m = keep & (c.finish >= lo) & (c.finish < hi)
        d = require_cell(m.sum(), label)
        rows.append(dict(label=label, value=sh((quicker & m).sum() / d), tone=tone))
        slower_of.append(sh((slower & m).sum() / d))
    allv = sh(quicker.sum() / n)
    return dict(
        values=dict(all=allv, slow=rows[6]['value'], peak=rows[1]['value'], slower_5_6=slower_of[5], slower_6=slower_of[6]),
        plot=dict(form='bars', rows=rows, x=dict(min=0, max=0.7, fmt='share', ticks=[0, 0.25, 0.5]), fmt='share',
                  ref=dict(axis='x', value=0.5, label='half', tone='quiet')),
        cohort_n=n, editions_n=k, weighting='pooled',
        method=(f'Every finish in start-screened editions ({_finishes(n)}): the share whose 5–10K section was quicker than its 0–5K, by finish time '
                f'({round(allv * 100)}% of all finishes); "slower" in the title means strictly slower, and equal sections count as neither.'),
    )


FIFTHS = ['Front fifth at 20K', 'Second fifth', 'Middle fifth', 'Fourth fifth', 'Back fifth']
ONSET_MATS = (20, 25, 30, 35)
# The reading is the share that began at 35K (signal, with its share printed); the slowdowns that began at 20K, 25K or
# 30K are one quiet part beside it, so the key has two swatches that can be told apart.
ONSET_PARTS = [dict(label='Began 20–30K', tone='o2', values=False), dict(label='Began at 35K', tone='signal')]


def fifth_at_20k(c, keep):
    """Each screened finish's fifth (0 front … 4 back) of its edition's clock order at the 20K mat (stable ties)."""
    idx = np.flatnonzero(keep)
    r = edition_ranks(c.times[idx, 3], c.edition[idx])
    fifth = np.full(c.n, -1, np.int64)
    fifth[idx] = np.minimum(np.floor(r * 5), 4).astype(np.int64)
    return fifth


@chart('later-slowdowns-up-front')
def later_slowdowns_up_front(c):
    """Each fifth of the field at 20K (clock order within the edition): its sustained slowdowns by the 5K mat where
    they began (20K, 25K, 30K or 35K), as shares of that fifth's slowdowns."""
    keep, n, k = _screened(c)
    require_cell(n, 'screened finishes')
    fifth = fifth_at_20k(c, keep)
    slow = keep & np.asarray(c.slow, bool)
    rows, slow_of, sizes, counts, s20 = [], [], [], [], []
    for f, label in enumerate(FIFTHS):
        m = keep & (fifth == f)
        d = require_cell(m.sum(), f'{label} finishes')
        s = require_cell((slow & m).sum(), f'{label} slowdowns')
        on = c.onset[slow & m]
        parts = [sh((on == km).sum() / s) for km in ONSET_MATS]
        rows.append(dict(label=label, parts=[sh((on != 35).sum() / s), parts[3]], tone='quiet' if 0 < f < 4 else 'ink'))
        s20.append(parts[0])
        slow_of.append(sh(s / d)); sizes.append(d); counts.append(s)
    # Per edition: the front fifth's 35K share against the back fifth's, where both fifths hold 100+ slowdowns.
    both = higher = 0
    for e in np.unique(c.edition[keep]):
        me = slow & (c.edition == e)
        q, z = me & (fifth == 0), me & (fifth == 4)
        nq, nz = int(q.sum()), int(z.sum())
        if nq >= 100 and nz >= 100:
            both += 1
            higher += int((c.onset[q] == 35).sum() / nq > (c.onset[z] == 35).sum() / nz)
    s35 = [r['parts'][1] for r in rows]
    return dict(
        values=dict(front35=s35[0], back35=s35[4], s35_2=s35[1], s35_3=s35[2], s35_4=s35[3], front20=s20[0], back20=s20[4],
                    front_slow=slow_of[0], back_slow=slow_of[4], slowdowns_min=int(min(counts)), finishes_min=int(min(sizes)),
                    editions_both=int(both), editions_front_higher=int(higher)),
        plot=dict(form='stacked', rows=rows, parts=ONSET_PARTS, fmt='share'),
        cohort_n=n, editions_n=k, weighting='pooled',
        method=(f'Every sustained slowdown in start-screened editions ({_finishes(n)}, {count_phrase(sum(counts), "slowdown")}), by the fifth of '
                'its edition\'s clock order at the 20K mat and by the 5K mat where the slowdown began, as shares of each fifth\'s slowdowns '
                f'({round(slow_of[0] * 100)}% of front-fifth finishes and {round(slow_of[4] * 100)}% of back-fifth finishes had one); the front '
                f'fifth\'s share beginning at 35K was the higher in {higher} of the {both} editions with 100 or more slowdowns in both fifths.'),
    )


def average_percentiles(values):
    """Each value's place from 0 (lowest) to 1 (highest), ties at their average rank: (average rank − 1) / (n − 1)."""
    values = np.asarray(values, float)
    order = np.argsort(values, kind='stable')
    s = values[order]
    new = np.r_[True, s[1:] != s[:-1]]
    first = np.flatnonzero(new)
    last = np.r_[first[1:], len(s)] - 1
    avg = (first + last) / 2.0
    out = np.empty(len(values))
    out[order] = avg[np.cumsum(new) - 1]
    return out / (len(values) - 1)


ORDER_MIN = 1000
ORDER_KEYS = ['s0', 's5', 's10', 's15', 's20', 's25', 's30', 's35', 's40']
ORDER_TONES = ['quiet'] * 5 + ['signal', 'quiet', 'ink', 'quiet']


@chart('middle-split-orders-the-field')
def middle_split_orders_the_field(c):
    """Start-screened editions of 1,000+ finishes: each section's split on its own, ranked within the edition, against
    the finish clock-time rank; the share of finishes whose two places differ by under 5% of the field, typical
    edition (median over editions)."""
    keep = np.asarray(c.shape_keep, bool)
    eds = [e for e in range(len(c.editions)) if int((keep & (c.edition == e)).sum()) >= ORDER_MIN]
    if not eds:
        raise ValueError(f'no start-screened editions with {ORDER_MIN:,}+ finishes')
    near, clock30, sizes = [], [], []
    for e in eds:
        idx = np.flatnonzero(keep & (c.edition == e))
        sizes.append(require_cell(len(idx), c.label(e)))
        t = c.times[idx]
        split = np.diff(np.c_[np.zeros(len(idx)), t], axis=1)
        fin = average_percentiles(t[:, 8])
        near.append([float((np.abs(average_percentiles(split[:, k]) - fin) < 0.05).mean()) for k in range(9)])
        clock30.append(float((np.abs(average_percentiles(t[:, 5]) - fin) < 0.05).mean()))
    near, n = np.array(near), int(sum(sizes))
    typ = [sh(median(near[:, k])) for k in range(9)]
    c30 = sh(median(clock30))
    k = len(eds)
    mid_beats_late = int((near[:, 5] > near[:, 7]).sum())
    peak_mid = int(np.isin(np.argmax(near, axis=1), [4, 5]).sum())
    split_vs_clock = int((near[:, 5] >= np.array(clock30)).sum())
    rows = [dict(label=SECTIONS[i], value=typ[i], tone=ORDER_TONES[i]) for i in range(9)]
    return dict(
        values=dict(**{ORDER_KEYS[i]: typ[i] for i in range(9)}, clock30=c30, editions=k, mid_beats_late=mid_beats_late,
                    peak_mid=peak_mid, split_vs_clock=split_vs_clock, n_min=int(min(sizes))),
        # Bars in race order, top to bottom: nine section names fit the bars label gutter, not a column axis.
        plot=dict(form='bars', rows=rows, fmt='share', x=dict(min=0, max=0.8, fmt='share', ticks=[0, 0.25, 0.5, 0.75])),
        cohort_n=int(n), editions_n=k, weighting='editions-equal',
        method=(f'Start-screened editions of at least 1,000 finishes ({_finishes(n)}, {k} editions): within each edition, every '
                'finish is ranked on each section\'s split on its own (ties at their average rank) and on its finish clock time, and '
                'counted when the two places differ by under 5% of the field; each bar is the median over editions (the cumulative '
                f'30K clock time, ranked the same way, reached {round(c30 * 100)}%). The 20–25K or 25–30K split ranked closest in {peak_mid} of {k} editions.'),
    )
