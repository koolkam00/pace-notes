"""Top 100 charts, racing (second batch) (analysis/build_charts.py).

Every chart here reads the order or spread of a field, so all of them keep to the editions that pass the start-offset
screen (c.shape_keep). Places are clock ranks within an edition (0 the first, 1 the last), ties in row order; they say
nothing about who ran next to whom on the road."""
import math

import numpy as np

from charts_common import MATS, POINTS, SECTIONS, count_phrase, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


def finishes(n):
    """"42,160 finishes", "1 finish"."""
    return count_phrase(n, 'finish')


def screened_counts(c):
    """Screened (start-offset) finishes per edition."""
    return np.bincount(c.edition[c.shape_keep], minlength=len(c.editions))


def big_screened(c, size):
    """Screened finishes in editions holding at least `size` of them."""
    return c.shape_keep & (screened_counts(c)[c.edition] >= size)[...]


def ranks_in(values, edition, keep):
    """Within-edition places from 0 to 1 ((rank) / (n − 1)) among the kept finishes, ties in row order (as
    charts_common.edition_ranks)."""
    idx = np.flatnonzero(keep)
    order = idx[np.lexsort((values[idx], edition[idx]))]
    ed = edition[order]
    counts = np.bincount(ed, minlength=int(edition.max()) + 1)
    start = np.concatenate([[0], np.cumsum(counts)])
    pos = np.arange(len(order)) - start[ed]
    out = np.full(len(values), np.nan)
    out[order] = pos / (counts[ed] - 1)
    return out


_RANKS = {}


def mat_ranks(c):
    """Places at every mat and the finish within each screened edition of 1,000+ finishes (cached per cohort)."""
    key = id(c)
    if key not in _RANKS:
        keep = big_screened(c, 1000)
        if not keep.any():
            raise ValueError('no start-screened editions with 1,000+ finishes')
        _RANKS.clear()
        _RANKS[key] = (keep, np.column_stack([ranks_in(c.times[:, k], c.edition, keep) for k in range(9)]))
    return _RANKS[key]


@chart('ahead-at-20k-gone-by-40k')
def ahead_at_20k_gone_by_40k(c):
    """3:59 finishes against 4:00 splits (a constant pace for 4:00:00) at every mat: the quartiles and median of their
    margin."""
    keep = c.shape_keep & (c.finish >= 14340) & (c.finish < 14400)
    n = require_cell(keep.sum(), '3:59 finishes')
    km = np.array(POINTS)
    margin = 14400 * km / 42.195 - c.times[keep]
    q = {p: [quantile(margin[:, k], p) for k in range(9)] for p in (0.25, 0.5, 0.75)}
    xs = [sh(k / 5) for k in POINTS]
    behind = float((margin[:, 7] < 0).mean())
    pk = int(np.argmax(q[0.5]))
    # Every margin is 0 at the start by definition, so each line leaves the 4:00-splits line there.
    line = lambda p: [[0, 0]] + [[x, sh(y)] for x, y in zip(xs, q[p])]
    series = [
        dict(label='Upper quartile', points=line(0.75), tone='faint', labelAt='none'),
        dict(label='Lower quartile', points=line(0.25), tone='faint', labelAt='none'),
        dict(label='Median', points=line(0.5), tone='signal', dots=True, labelAt='none'),
    ]
    hi = 240 * math.ceil(max(q[0.75]) / 240)
    return dict(
        values=dict(ahead=sh(q[0.5][3]), behind=sh(behind), peak=sh(q[0.5][pk]), peak_mat=MATS[pk], ahead40=sh(q[0.5][7]),
                    ahead_finish=sh(q[0.5][8]), finishes=n),
        plot=dict(form='lines', series=series,
                  x=dict(min=0, max=sh(42.195 / 5), fmt='int', cats=['', '', '10K', '', '20K', '', '30K', '', '40K']),
                  y=dict(min=-100, max=hi, fmt='delta', ticks=list(range(240, hi + 1, 240)), title='ahead'),
                  refs=[dict(axis='y', value=0, tone='ink')],
                  notes=[dict(x=sh(POINTS[pk] / 5), y=sh(q[0.5][pk]), text='median {v}', value=sh(q[0.5][pk]), fmt='delta',
                              tone='signal', anchor='middle', dy=28),
                         dict(x=8, y=sh(q[0.5][7]), text='{v} at 40K', value=sh(q[0.5][7]), fmt='delta', tone='ink',
                              anchor='end', dx=-4, dy=34, leader=True),
                         dict(x=sh(POINTS[pk] / 5), y=sh((q[0.5][pk] + q[0.75][pk]) / 2), text='middle half', tone='quiet',
                              anchor='middle', dy=5),
                         dict(x=0.6, y=0, text='4:00 splits', tone='quiet', anchor='start', dy=20)]),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=f'Finishes from 3:59:00 to 3:59:59 in editions that pass the start-offset screen ({finishes(n)}), '
               'set against 4:00 splits (a constant pace for 4:00:00) at every mat; the lines are the quartiles and median '
               'of that margin.',
    )


# Rows: the five fifths of the finishing order, each two tenths.
TENTHS = [((0, 1), 'Front fifth'), ((2, 3), '2nd fifth'), ((4, 5), 'Middle fifth'), ((6, 7), '4th fifth'), ((8, 9), 'Back fifth')]
SETTLE_COLS = [1, 2, 3, 4, 5, 6]  # 10K … 35K, evenly spaced


@chart('front-settles-early')
def front_settles_early(c):
    """Rows of the finishing order: the share whose place at a mat was within 5% of the field of its final place."""
    keep, R = mat_ranks(c)
    rf = R[:, 8]
    tenth = np.minimum(9, np.floor(np.where(keep, rf, 0) * 10)).astype(int)
    near = np.abs(R[:, :8] - rf[:, None]) <= 0.05
    full = []
    for ds, label in TENTHS:
        row = keep & np.isin(tenth, ds)
        require_cell(row.sum(), label)
        full.append([float(near[row, k].mean()) for k in range(8)])
    cells = [[sh(f[k]) for k in SETTLE_COLS] for f in full]
    n = int(keep.sum())
    return dict(
        values=dict(d20=sh(full[2][3]), d35=sh(full[2][6]), d30=sh(full[2][5]), front5=sh(full[0][0]), back5=sh(full[4][0]),
                    front20=sh(full[0][3]), back20=sh(full[4][3])),
        plot=dict(form='heatmap', rows=[label for _, label in TENTHS], cols=[MATS[k] for k in SETTLE_COLS], cells=cells,
                  fmt='share', domain=[0.2, 1], highlight=[[2, 2]], rowTitle='Finishing place', colTitle='Near the final place at'),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=f'Every finish in start-screened editions of at least 1,000 finishes ({finishes(n)}): its clock place within '
               'the edition at each mat against its place at the finish, counted as near when the two differ by at most 5% '
               'of the field; rows are the five fifths of the finishing order.',
    )


@chart('same-second-different-20k')
def same_second_different_20k(c):
    """Adjacent finishes sharing a recorded second within an edition: how far apart their 20K splits were."""
    keep = big_screened(c, 1000)
    if not keep.any():
        raise ValueError('no start-screened editions with 1,000+ finishes')
    idx = np.flatnonzero(keep)
    order = idx[np.lexsort((c.finish[idx], c.edition[idx]))]
    ed, fin, t20 = c.edition[order], c.finish[order], c.times[order, 3]
    pair = (ed[1:] == ed[:-1]) & (fin[1:] == fin[:-1])
    gap = np.abs(t20[1:] - t20[:-1])[pair]
    band = fin[1:][pair]
    pairs = require_cell(len(gap), 'same-second pairs')
    sub3, over6 = gap[band < 10800], gap[band >= 21600]
    require_cell(len(sub3), 'sub-3:00 pairs')
    require_cell(len(over6), '6:00+ pairs')
    width, top = 15, 900
    counts = np.bincount(np.minimum(gap, top).astype(int) // width, minlength=top // width + 1)
    bins = [dict(x0=i * width, x1=(i + 1) * width, v=sh(counts[i] / pairs), tone='quiet') for i in range(top // width)]
    m = median(gap)
    over_top = float((gap >= top).mean())
    within15 = float((gap < 15).mean())
    peak = max(b['v'] for b in bins)
    ymax = 0.02 * math.ceil(peak * 1.12 / 0.02)
    return dict(
        values=dict(gap=sec(m), within10=sh((gap < 10).mean()), within15=sh(within15), over3=sh((gap >= 180).mean()),
                    over15=sh(over_top), pairs=pairs, gap_sub3=sec(median(sub3)), gap_6h=sec(median(over6))),
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=0, max=top, fmt='ms', ticks=[0, 300, 600, 900], title='Gap between the two 20K splits'),
                  y=dict(min=0, max=sh(ymax), fmt='share', ticks=[sh(0.02 * i) for i in range(int(round(ymax / 0.02)) + 1)],
                         title='of pairs'),
                  refs=[dict(axis='x', value=sec(m), tone='signal')],
                  notes=[dict(x=sec(m), y=sh(ymax - 0.01), text='median {v}', value=sec(m), fmt='ms', tone='signal', anchor='start', dx=5, dy=4),
                         dict(x=top, y=0.025, text='15:00 or more: {v}', value=sh(over_top), fmt='share', tone='quiet', anchor='end', dy=5)]),
        cohort_n=int(keep.sum()), editions_n=int(len(np.unique(c.edition[keep]))), weighting='pairs',
        method=f'Within each start-screened edition of at least 1,000 finishes, finishes sorted by recorded finish second; each '
               f'neighbouring pair with the same second counts once ({pairs:,} pairs), and the gap is the '
               'difference between their 20K splits (net running times, so not who ran beside whom).',
    )


def three_hour_windows(km):
    """Whole-second windows at a mat of equal width: elapsed times on 2:59 splits (inside) and the next window of
    the same number of seconds (outside, on 3:00 splits). Splits are whole seconds, so a window scaled from a
    minute of finish time is cut at whole seconds and both windows get the same count of them."""
    lo, hi = math.ceil(10740 * km / 42.195), math.ceil(10800 * km / 42.195)
    return lo, hi, hi + (hi - lo)


@chart('three-hour-crowd-at-20k')
def three_hour_crowd_at_20k(c):
    """Finishes on 2:59 splits against those on 3:00 splits, at every mat, in equal whole-second windows."""
    keep = c.shape_keep
    rows, vals = [], {}
    for k, km in enumerate(POINTS):
        t = c.times[keep, k]
        lo, hi, top = three_hour_windows(km)
        inside = int(((t >= lo) & (t < hi)).sum())
        outside = int(((t >= hi) & (t < top)).sum())
        require_cell(inside, f'{MATS[k]} inside')
        require_cell(outside, f'{MATS[k]} outside')
        vals[k] = (inside, outside, inside / outside - 1)
        rows.append(dict(label=MATS[k], value=sh(inside / outside - 1), tone='signal' if k == 3 else 'ink' if k == 8 else 'quiet'))
    n = int(keep.sum())
    return dict(
        values=dict(r20p=sh(vals[3][2]), r10=sh(vals[1][2]), r30=sh(vals[5][2]), rf=sh(vals[8][2]), r5=sh(vals[0][2]),
                    n_in=vals[3][0], n_out=vals[3][1]),
        plot=dict(form='bars', rows=rows, fmt='dpct', x=dict(min=0, max=0.8, fmt='dpct')),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=f'Finishes in start-screened editions ({finishes(n)}) whose elapsed time at a mat falls in the whole-second '
               'window of 2:59 splits (a constant pace for 2:59:00 to 2:59:59, scaled to that mat) against the next window '
               'of the same number of seconds (3:00 splits).',
    )


SHUFFLE = list(range(1, 8))  # sections 5–10K … 35–40K


@chart('order-shuffled-faster-after-20k')
def order_shuffled_faster_after_20k(c):
    """How far places moved in each 5K: the median change as a share of the field, pooled and per edition."""
    keep, R = mat_ranks(c)
    moves = {k: np.abs(R[keep, k] - R[keep, k - 1]) * 100 for k in SHUFFLE}
    pooled = {k: median(moves[k]) for k in SHUFFLE}
    ed = c.edition[keep]
    eds = [int(e) for e in np.unique(ed)]
    ratios = []
    for e in eds:
        m = ed == e
        ratios.append(median(moves[6][m]) / median(moves[3][m]))
    ratios = np.array(ratios)
    low = min(SHUFFLE, key=lambda k: pooled[k])
    tone = {1: 'quiet', 3: 'ink', 6: 'signal'}
    # Each section's median change against the 15–20K one, so the bar of the late section reads the takeaway's ratio.
    rows = [dict(label=SECTIONS[k], value=sh(pooled[k] / pooled[3]), tone=tone.get(k, 'quiet')) for k in SHUFFLE]
    n = int(keep.sum())
    hi = 0.5 * math.ceil(max(pooled.values()) / pooled[3] / 0.5)
    return dict(
        values=dict(ratio=sh(pooled[6] / pooled[3]), ed_ratio=sh(median(ratios)), above1=int((ratios > 1).sum()), eds=len(eds),
                    late=sh(pooled[6]), mid=sh(pooled[3]), early=sh(pooled[1]), low_section=SECTIONS[low]),
        plot=dict(form='bars', rows=rows, fmt='ratio', x=dict(min=0, max=sh(hi), fmt='ratio'),
                  ref=dict(axis='x', value=1, label='15–20K level', tone='quiet'),
                  notes=[dict(row=2, x=1, text='fewest changes', tone='ink', anchor='start', dx=40, dy=5)]),
        cohort_n=n, editions_n=len(eds), weighting='pooled',
        method=f'Every finish in start-screened editions of at least 1,000 finishes ({finishes(n)}, {len(eds)} editions): the '
               'change in its clock place within the edition over each 5K, as a share of the field; the bars are the median '
               'over all finishes, shown against the 15–20K one, and each edition also compares its own median change in 30–35K '
               'with its median change in 15–20K.',
    )


@chart('how-a-race-spreads-out')
def how_a_race_spreads_out(c):
    """Per edition, the gap between the 10th and 90th percentile of elapsed time at each mat; the median over editions,
    against the spread the field would have reached by keeping its first-5K rate."""
    keep = big_screened(c, 2000)
    eds = [int(e) for e in np.unique(c.edition[keep])]
    if not eds:
        raise ValueError('no start-screened editions with 2,000+ finishes')
    spread = []
    for e in eds:
        t = c.times[keep & (c.edition == e)]
        spread.append([quantile(t[:, k], 0.9) - quantile(t[:, k], 0.1) for k in range(8)])
    spread = np.array(spread)
    med = [median(spread[:, k]) for k in range(8)]
    rate = med[0]
    extra = med[7] - 8 * rate
    n = int(keep.sum())
    # Both lines are named in the plot; the right-hand gutter holds only the bracket at 40K between the two line ends
    # (drawn top to bottom, so its name sits at the dashed end with the gap's value on the line above it).
    series = [
        dict(label='first 5K rate', points=[[0, 0], [8, sec(8 * rate)]], tone='quiet', dash=True, labelAt='none'),
        dict(label='middle 80%', points=[[0, 0]] + [[k + 1, sec(med[k])] for k in range(8)], tone='ink', dots=True,
             labelAt='none'),
        dict(label='extra spread', points=[[8, sec(med[7])], [8, sec(8 * rate)]], tone='signal'),
    ]
    hi = 1800 * math.ceil(med[7] / 1800)
    return dict(
        values=dict(early=sec(rate), spread40=sec(med[7]), linear40=sec(8 * rate), extra=sec(extra), spread20=sec(med[3]),
                    eds=len(eds)),
        plot=dict(form='lines', series=series,
                  x=dict(min=0, max=8, fmt='int', cats=['Start', '', '10K', '', '20K', '', '30K', '', '40K']),
                  y=dict(min=0, max=hi, fmt='mins', ticks=list(range(1800, hi + 1, 1800))),
                  notes=[dict(x=8, y=sec(8 * rate), text='{v}', value=sec(extra), fmt='dmins', tone='signal',
                              anchor='start', dx=6, dy=-12),
                         dict(x=5, y=sec(med[4]), text='middle 80%', tone='ink', anchor='end', dx=-10, dy=-14),
                         dict(x=6, y=sec(6 * rate), text='first 5K rate', tone='quiet', anchor='start', dx=10, dy=24)]),
        cohort_n=n, editions_n=len(eds), weighting='editions-equal',
        method=f'Each start-screened edition of at least 2,000 finishes ({len(eds)} editions, {finishes(n)}): the gap '
               'between its 10th and 90th percentile elapsed time at every mat, and the median over editions; the dashed line '
               'is eight times the median gap at 5K, the spread the field would reach by 40K if it kept spreading at its '
               'first-5K rate.',
    )


def discordant(a):
    """Strict inversions of an integer sequence (pairs i < j with a[i] > a[j]), by bottom-up merging."""
    a = np.asarray(a, np.int64)
    n = len(a)
    M = int(a.max()) + 1
    idx = np.arange(n, dtype=np.int64)
    total, w = 0, 1
    while w < n:
        p = idx // (2 * w)
        left = (idx % (2 * w)) < w
        key = p * M + a
        lk, rk, rp = key[left], key[~left], p[~left]
        total += int((np.searchsorted(lk, (rp + 1) * M, side='left') - np.searchsorted(lk, rk, side='right')).sum())
        a = np.sort(key) % M
        w *= 2
    return total


def swap_share(t20, fin):
    """The share of all pairs of finishes whose order at 20K is the reverse of their order at the finish."""
    n = len(fin)
    order = np.lexsort((fin, t20))
    _, dense = np.unique(fin, return_inverse=True)
    return discordant(dense[order]) / (n * (n - 1) / 2)


@chart('warm-mornings-reshuffle')
def warm_mornings_reshuffle(c):
    """Each race's coolest and warmest weather edition, by the share of finish pairs whose order changed after 20K."""
    counts = screened_counts(c)
    ok = [e for e in range(len(c.editions)) if counts[e] >= 1000 and np.isfinite(c.ed_temp_c[e])]
    by_city = {}
    for e in ok:
        by_city.setdefault(c.ed_city[e], []).append(e)
    cities = sorted(city for city, es in by_city.items() if len(es) >= 5)
    if not cities:
        raise ValueError('no races with at least five start-screened weather editions of 1,000+ finishes')
    rows = []
    for city in cities:
        es = by_city[city]
        temps = np.array([c.ed_temp_c[e] for e in es])
        cool, warm = es[int(np.argmin(temps))], es[int(np.argmax(temps))]
        sw = {}
        for e in (cool, warm):
            m = c.shape_keep & (c.edition == e)
            sw[e] = swap_share(c.times[m, 3], c.finish[m])
        rows.append(dict(city=str(city), a=sw[cool], b=sw[warm], eds=(cool, warm),
                         more=bool(sw[warm] >= sw[cool] + 0.005), less=bool(sw[cool] >= sw[warm] + 0.005)))
    # Every race as one dot at its gap (warmest minus coolest morning), grouped by the claim: clearly more on the warmest
    # morning, about the same, clearly less (a group only when it holds a race).
    gap = lambda r: r['b'] - r['a']
    top = sorted(rows, key=lambda r: (-gap(r), r['city']))[0]
    groups = []
    for label, pick, tone in (('more on the warmest morning', lambda r: r['more'], 'signal'),
                              ('about the same', lambda r: not r['more'] and not r['less'], 'ink'),
                              ('less on the warmest morning', lambda r: r['less'], 'quiet')):
        dots = [dict(v=sh(gap(r)), tone=tone) for r in rows if pick(r)]
        if dots:
            groups.append(dict(label=f"{count_phrase(len(dots), 'race')}: {label}", dots=dots))
    used = [e for r in rows for e in r['eds']]
    n = int(sum(counts[e] for e in used))
    # The left edge sits a third of the right-hand reach below zero, so the zero line falls inside the group headings'
    # words rather than in a gap between them.
    lo = min(0.002 * math.floor(min(gap(r) for r in rows) / 0.002 - 1), -0.002 * math.ceil(max(gap(r) for r in rows) / 0.006))
    hi = 0.01 * math.ceil(max(max(gap(r) for r in rows), 0) / 0.01 + 0.5)
    ticks = [sh(0.02 * k) for k in range(math.ceil(lo / 0.02 - 1e-9), math.floor(hi / 0.02 + 1e-9) + 1)]
    return dict(
        values=dict(warm_count=sum(r['more'] for r in rows), cool_count=sum(r['less'] for r in rows),
                    level_count=sum(not r['more'] and not r['less'] for r in rows),
                    up_count=sum(r['b'] > r['a'] for r in rows), cities=len(cities), top_city=top['city'],
                    top_cool=sh(top['a']), top_warm=sh(top['b'])),
        plot=dict(form='strip', groups=groups, r=7, refs=[dict(axis='x', value=0, tone='quiet')],
                  x=dict(min=sh(lo), max=sh(hi), fmt='dpts', ticks=ticks,
                         title='Order changed after 20K, warmest minus coolest')),
        cohort_n=n, editions_n=len(used), weighting='pairs',
        method=f'The {len(cities)} races with at least five start-screened editions of 1,000+ finishes and a reviewed weather row: '
               'in the coolest and the warmest of them (temperature at the scheduled start, edition context only), the share of '
               'all pairs of finishes whose order at 20K is the reverse of their finishing order; a race counts as clearly '
               'higher on one morning when the gap is at least half a percentage point. The chart shows every race’s gap.',
    )
