"""Top 100 charts, pacing batch one (analysis/build_charts.py).

Every chart here is a pacing-shape statistic, so each one reads only the finishes in editions that pass the
start-offset screen (c.shape_keep). Shares are pooled over finishes: every finish counts once.
"""
import numpy as np

from charts_common import SECTIONS, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


# Finish-time bands: half-hour steps from 3:00 to 6:00, with the open ends (seconds, [lo, hi)).
BANDS = [(0, 10800, 'Under 3:00', '<3:00'), (10800, 12600, '3:00–3:30', '3:00'), (12600, 14400, '3:30–4:00', '3:30'),
         (14400, 16200, '4:00–4:30', '4:00'), (16200, 18000, '4:30–5:00', '4:30'), (18000, 19800, '5:00–5:30', '5:00'),
         (19800, 21600, '5:30–6:00', '5:30'), (21600, 10 ** 9, '6:00+', '6:00+')]


def bands(c, keep):
    """The band masks (inside `keep`), each held to the 100-finish threshold."""
    out = []
    for lo, hi, label, short in BANDS:
        m = keep & (c.finish >= lo) & (c.finish < hi)
        require_cell(m.sum(), label)
        out.append((m, label, short))
    return out


def editions_in(c, mask):
    return int(len(np.unique(c.edition[mask])))


def screened(c, n=None):
    """The method line's cohort: start-screened editions, with the chart's own finish count (the whole screen by default)."""
    k = int(c.shape_keep.sum()) if n is None else int(n)
    return f'start-screened editions ({k:,} finishes)'


@chart('even-pace-1-in-13')
def even_pace(c):
    """Finishes whose eight full 5K sections all stayed within 3% of their own average 5K pace, by finish band."""
    keep = c.shape_keep
    tol = 0.03
    mean5 = c.times[:, 7] / 40.0
    even = np.all(np.abs(c.paces[:, :8] / mean5[:, None] - 1.0) <= tol, axis=1)
    n = require_cell(keep.sum(), 'start-screened finishes')
    share = sh(even[keep].mean())
    rows, masks = [], []
    for k, (m, label, _) in enumerate(bands(c, keep)):
        masks.append(m)
        tone = 'signal' if k == 0 else 'ink' if k == len(BANDS) - 1 else 'quiet'
        rows.append(dict(label=label, value=sh(even[m].mean()), tone=tone))
    men, women = keep & (c.gender == 1), keep & (c.gender == 2)
    require_cell(men.sum(), 'men'); require_cell(women.sum(), 'women')
    return dict(
        values=dict(share=share, tol=tol, sub3=rows[0]['value'], slow=rows[-1]['value'], men=sh(even[men].mean()),
                    women=sh(even[women].mean()), n_slow=int(masks[-1].sum())),
        plot=dict(form='bars', rows=rows, fmt='share1', x=dict(min=0, max=0.35, fmt='share')),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Finishes in {screened(c)} whose every full 5K section stayed within 3% of their own average 5K pace '
               '(the last 2.2 km left out), by finish time.',
    )


R0_BINS = [('8%+ quicker', -np.inf, -0.08), ('5–8% quicker', -0.08, -0.05), ('3–5% quicker', -0.05, -0.03),
           ('1–3% quicker', -0.03, -0.01), ('Steady (±1%)', -0.01, 0.01), ('1–3% slower', 0.01, 0.03), ('3%+ slower', 0.03, np.inf)]


def r0_bin(r0):
    """Index of R0_BINS: quicker bins hold their upper edge (r0 <= hi); steady is open; slower bins hold their lower edge."""
    out = np.full(len(r0), -1)
    out[r0 <= -0.08] = 0
    out[(r0 > -0.08) & (r0 <= -0.05)] = 1
    out[(r0 > -0.05) & (r0 <= -0.03)] = 2
    out[(r0 > -0.03) & (r0 <= -0.01)] = 3
    out[(r0 > -0.01) & (r0 < 0.01)] = 4
    out[(r0 >= 0.01) & (r0 < 0.03)] = 5
    out[r0 >= 0.03] = 6
    return out


@chart('same-20k-different-finish')
def same_20k(c):
    """Finishes through 20K in 1:50:00-1:54:59, by first-5K pace against their 5-20K pace: the spread of finish times."""
    lo20, hi20 = 6600, 6900
    keep = c.shape_keep & (c.times[:, 3] >= lo20) & (c.times[:, 3] < hi20)
    n = require_cell(keep.sum(), '20K in 1:50-1:55')
    r0 = c.paces[:, 0] / c.baseline - 1.0
    b = r0_bin(r0)
    rows, meds, sizes = [], [], []
    for k, (label, _, _) in enumerate(R0_BINS):
        m = keep & (b == k)
        sizes.append(require_cell(m.sum(), label))
        f = c.finish[m]
        meds.append(median(f))
        tone = 'signal' if k == 0 else 'ink' if k == 4 else 'quiet'
        rows.append(dict(label=label, tone=tone, lo=sec(quantile(f, 0.1)), q1=sec(quantile(f, 0.25)), mid=sec(meds[-1]),
                         q3=sec(quantile(f, 0.75)), hi=sec(quantile(f, 0.9))))
    gap = sec(meds[0] - meds[4])
    return dict(
        values=dict(gap=gap, cut=0.08, fast_n=sizes[0], even_n=sizes[4], fast_med=sec(meds[0]), even_med=sec(meds[4]),
                    t20_lo=lo20, t20_hi=hi20),
        plot=dict(form='range', rows=rows, fmt='hm', x=dict(min=13800, max=18300, fmt='hm', ticks=[14400, 15300, 16200, 17100, 18000]),
                  legend=dict(lo='', mid='', hi=''),
                  key=[dict(label='median', tone='ink', mark='dot'), dict(label='middle half', tone='o2', mark='square'),
                       dict(label='10th–90th', tone='quiet', mark='line')],
                  notes=[dict(row=0, x=rows[0]['mid'], text='{v}', value=gap, fmt='dmins', tone='signal', dy=-13)]),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Finishes in {screened(c, n)} that reached 20K in 1:50:00–1:54:59, grouped by how their 0–5K pace compared '
               'with their own 5–20K pace.',
    )


@chart('second-20k-rarely-quicker')
def second_20k(c):
    """Finishes whose 20-40K block took less time than their 0-20K block, overall and by finish band."""
    keep = c.shape_keep
    n = require_cell(keep.sum(), 'start-screened finishes')
    neg = (c.times[:, 7] - c.times[:, 3]) < c.times[:, 3]
    by = [sh(neg[m].mean()) for m, _, _ in bands(c, keep)]
    allv = sh(neg[keep].mean())
    return dict(
        values=dict(all=allv, sub3=by[0], slow=by[-1]),
        plot=dict(form='big', value=allv, fmt='share1', caption='ran 20–40K in less time than 0–20K',
                  compare=[dict(label='All finishes', value=allv, tone='signal'), dict(label=BANDS[0][2], value=by[0], tone='ink')],
                  compareFmt='share1'),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Every finish in {screened(c)}: the time from 20K to 40K against the time to 20K (the last 2.2 km left out).',
    )


@chart('two-ways-to-run-359')
def two_ways(c):
    """Finishes of 3:59:00-3:59:59, with and without a sustained slowdown: median section pace against the finish's own
    average pace (finish time over 42.195 km), so the lines read in % and not in the reader's units. The reading is the
    slowdown group's quick first 15K against a no-slowdown line that stays near its average throughout."""
    keep = c.shape_keep & (c.finish >= 14340) & (c.finish < 14400)
    n = require_cell(keep.sum(), '3:59 finishes')
    slow, rest = keep & c.slow, keep & ~c.slow
    n_slow, n_rest = require_cell(slow.sum(), 'slowdown'), require_cell(rest.sum(), 'no slowdown')
    rel = c.paces / (c.finish / 42.195)[:, None] - 1.0
    def line(m):
        return [[k, sh(median(rel[m, k]))] for k in range(9)]
    a, b = line(rest), line(slow)
    first = [-p[1] for p in b[:3]]          # how much quicker than average, 0-5K to 10-15K
    early = sh(float(np.mean(first)))
    rest_max = sh(max(abs(p[1]) for p in a))
    ys = [p[1] for p in a + b]
    # Slower is up; room under the lowest point for the note at the dip.
    lo, hi = 0.05 * np.floor(min(ys) / 0.05) - 0.05, 0.05 * np.ceil(max(ys) / 0.05)
    return dict(
        values=dict(early=early, early_min=sh(min(first)), early_max=sh(max(first)), rest_max=rest_max, tol=0.05,
                    n_slow=n_slow, n_rest=n_rest),
        plot=dict(form='lines',
                  series=[dict(label='No slowdown', points=a, tone='ink', dots=True),
                          dict(label='Slowdown', points=b, tone='signal', dots=True)],
                  x=dict(min=-0.4, max=8.4, fmt='int', cats=list(SECTIONS), ticks=[0, 4, 7]),
                  y=dict(min=float(round(lo, 2)), max=float(round(hi, 2)), fmt='dpct', ticks=[-0.1, 0, 0.1, 0.2],
                         title='slower than average'),
                  # The reading under the slowdown line's early dip.
                  notes=[dict(x=1, y=b[1][1], text='{v} quicker to 15K', value=early, fmt='share', tone='signal',
                              anchor='start', dx=-6, dy=30)]),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Finishes of 3:59:00–3:59:59 in {screened(c, n)}, split by whether a sustained slowdown was recorded; '
               'lines are the median pace of each section against the finish\'s own average pace.',
    )


@chart('slowed-in-every-5k')
def slowed_every(c):
    """Finishes whose each 5K from 20-25K to 35-40K was slower than the 5K before it (15-20K the first reference)."""
    keep = c.shape_keep
    n = require_cell(keep.sum(), 'start-screened finishes')
    p = c.paces
    every = (p[:, 4] > p[:, 3]) & (p[:, 5] > p[:, 4]) & (p[:, 6] > p[:, 5]) & (p[:, 7] > p[:, 6])
    by = [sh(every[m].mean()) for m, _, _ in bands(c, keep)]
    pk = int(np.argmax(by))
    share = sh(every[keep].mean())
    rows = [dict(label=BANDS[k][2], value=v, tone='signal' if k == pk else 'ink' if k == len(BANDS) - 1 else 'quiet')
            for k, v in enumerate(by)]
    return dict(
        values=dict(share=share, peak=by[pk], peak_lo=BANDS[pk][0], peak_hi=BANDS[pk][1], sub3=by[0], slow6=by[-1]),
        plot=dict(form='bars', rows=rows, fmt='share', x=dict(min=0, max=0.4, fmt='share')),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Finishes in {screened(c)} whose each 5K section from 20–25K to 35–40K was slower than the one before it; '
               'it includes finishes with and without a sustained slowdown.',
    )


KICK_BANDS = [(0, 10800, 'Under 3:00'), (10800, 12600, '3:00–3:30'), (12600, 14400, '3:30–4:00'), (14400, 16200, '4:00–4:30'),
              (16200, 18000, '4:30–5:00'), (18000, 10 ** 9, '5:00+')]


@chart('kick-but-not-early-pace')
def kick(c):
    """The last 2.2 km against 35-40K pace and against the finish's own 5-20K pace, overall and by finish band."""
    keep = c.shape_keep
    n = require_cell(keep.sum(), 'start-screened finishes')
    last = c.paces[:, 8]
    k35 = last < c.paces[:, 7]
    early = last < c.baseline
    rows = [dict(label='All finishes', a=sh(early[keep].mean()), b=sh(k35[keep].mean()), tone='signal')]
    for lo, hi, label in KICK_BANDS:
        m = keep & (c.finish >= lo) & (c.finish < hi)
        require_cell(m.sum(), label)
        rows.append(dict(label=label, a=sh(early[m].mean()), b=sh(k35[m].mean()), tone='quiet'))
    sl = keep & c.slow
    require_cell(sl.sum(), 'slowdown finishes')
    return dict(
        values=dict(kick=rows[0]['b'], early=rows[0]['a'], slow_kick=sh(k35[sl].mean()), slow_early=sh(early[sl].mean())),
        plot=dict(form='dumbbell', rows=rows, fmt='share', a='quicker than 5–20K pace', b='quicker than 35–40K pace',
                  x=dict(min=0, max=1, fmt='share', ticks=[0, 0.25, 0.5, 0.75, 1]),
                  # The two shares the takeaway prints, over their marks on the all-finishes row.
                  notes=[dict(row=0, x=rows[0]['a'], text='{v}', value=rows[0]['a'], fmt='share', tone='ink', anchor='middle', dy=-8),
                         dict(row=0, x=rows[0]['b'], text='{v}', value=rows[0]['b'], fmt='share', tone='signal', anchor='middle', dy=-8)]),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Finishes in {screened(c)}: pace from 40K to the finish against the same finish\'s 35–40K pace and its '
               '5–20K pace.',
    )


@chart('rarely-back-to-early-pace')
def rarely_back(c):
    """Finishes whose sustained slowdown began in 20-25K, 25-30K or 30-35K (every onset with a later full 5K before 40K):
    did any later full 5K return near the finish's own 5-20K pace?"""
    keep = c.shape_keep & np.isin(c.onset, (20, 25, 30))
    n = require_cell(keep.sum(), 'onset before 35K')
    for o in (20, 25, 30):
        require_cell((keep & (c.onset == o)).sum(), f'onset {o}')
    rel = c.paces[:, :8] / c.baseline[:, None]
    # Later full 5K sections: after the onset section (onset km / 5 is its index), up to 35-40K (index 7).
    later = np.zeros((c.n, 8), bool)
    for o in (20, 25, 30):
        later[c.onset == o, o // 5 + 1:8] = True
    back10 = np.any(later & (rel < 1.10), axis=1)
    back15 = np.any(later & (rel < 1.15), axis=1)
    stayed = np.all(~later | (rel >= 1.25), axis=1)
    v = dict(back=sh(back10[keep].mean()), back15=sh(back15[keep].mean()), stayed=sh(stayed[keep].mean()), n=n, thr=0.10)
    return dict(
        values=v,
        plot=dict(form='big', value=v['back'], fmt='share1', caption='a later 5K within 10% of 5–20K pace',
                  compare=[dict(label='Back within 10%', value=v['back'], tone='signal'),
                           dict(label='Stayed 25%+ slower', value=v['stayed'], tone='quiet')],
                  compareFmt='share1'),
        cohort_n=n, editions_n=editions_in(c, keep), weighting='pooled',
        method=f'Finishes in {screened(c, n)} whose sustained slowdown began in the 20–25K, 25–30K or 30–35K section; each '
               'later full 5K up to 40K is compared with the same finish\'s 5–20K pace.',
    )


FADE_ROWS = [(9000, '2:30–3:00'), (10800, '3:00–3:30'), (12600, '3:30–4:00'), (14400, '4:00–4:30'), (16200, '4:30–5:00'), (18000, '5:00–5:30')]
FADE_COLS = [4, 5, 6, 7]


@chart('bigger-fade-later-finish')
def bigger_fade(c):
    """Median section pace against the finish's own 5-20K pace, for six contiguous 30-minute finish bands."""
    keep = c.shape_keep
    rel = c.paces / c.baseline[:, None] - 1.0
    cells, sizes = [], []
    union = np.zeros(c.n, bool)
    for lo, label in FADE_ROWS:
        m = keep & (c.finish >= lo) & (c.finish < lo + 1800)
        union |= m
        sizes.append(require_cell(m.sum(), label))
        cells.append([sh(median(rel[m, k])) for k in FADE_COLS])
    n = int(sum(sizes))
    last = {f'c{i}': row[3] for i, row in enumerate(cells)}
    return dict(
        values=dict(fast=cells[0][3], slow=cells[-1][3], n_min=int(min(sizes)), fast_lo=FADE_ROWS[0][0], slow_lo=FADE_ROWS[-1][0],
                    band=1800, **last),
        plot=dict(form='heatmap', rows=[r[1] for r in FADE_ROWS], cols=[SECTIONS[k] for k in FADE_COLS], cells=cells, fmt='dpct',
                  domain=[0, 0.22], highlight=[[5, 3]], rowTitle='Finish time', colTitle='Median pace against 5–20K pace',
                  values=True),
        cohort_n=n, editions_n=editions_in(c, union), weighting='pooled',
        method=f'Finishes in {screened(c, n)} in six 30-minute finish bands from 2:30 to 5:30; each cell is the median of a '
               'section\'s pace against the same finish\'s 5–20K pace.',
    )
