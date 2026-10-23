"""Top 100 charts, finish times (analysis/build_charts.py): round marks, shared seconds,
linked records a year apart, the last stretch around 3:00, places per ten minutes, cities against 4:00 and the share
under each round time. Each builder takes the ChartCohort and returns its values, its chart spec, its cohort size, its
weighting and a method line for /methodology."""
import datetime

import numpy as np

from charts_common import count_phrase, median, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


def finishes(n):
    """'4,108,749 finishes' for method prose."""
    return count_phrase(n, 'finish')


def n_editions(c, mask=None):
    return int(len(np.unique(c.edition if mask is None else c.edition[mask])))


@chart('minute-before-the-hour')
def minute_before_the_hour(c):
    """Finishes per finish minute from 2:40 to 3:10; the minute before 3:00 lit, the minute after it in ink."""
    minutes = np.floor(c.finish / 60).astype(np.int64)
    counts = np.bincount(minutes, minlength=721)
    lo, hi = 160, 190
    for m in range(lo, hi):
        require_cell(counts[m], f'finish minute {m}')
    tone = {179: 'signal', 180: 'ink'}
    bins = [dict(x0=m * 60, x1=(m + 1) * 60, v=int(counts[m]), tone=tone.get(m, 'quiet')) for m in range(lo, hi)]
    before, after = int(counts[179]), int(counts[180])
    ratio = before / after
    return dict(
        values=dict(before=before, after=after, ratio=sh(ratio), ratio4=sh(counts[239] / counts[240])),
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=lo * 60, max=hi * 60, fmt='hm', ticks=[9600, 10200, 10800, 11400]),
                  y=dict(min=0, max=23000, fmt='count', ticks=[0, 5000, 10000, 15000, 20000], title='finishes'),
                  notes=[dict(x=10770, y=before, text='2:59: {v} the next minute', value=sh(ratio), fmt='ratio2', tone='signal', dy=-12)]),
        cohort_n=int(c.n), editions_n=n_editions(c), weighting='pooled',
        method=f'Every eligible finish ({finishes(c.n)}) by its whole finish minute from 2:40 to 3:10, pooled over all editions; the minute before 3:00 is lit.',
    )


SIZE_BANDS = [(35000, None, '35,000+ finishes'), (20000, 35000, '20,000–35,000'), (10000, 20000, '10,000–20,000'),
              (5000, 10000, '5,000–10,000'), (0, 5000, 'Under 5,000')]


@chart('shared-second')
def shared_second(c):
    """How many eligible finishes of the same edition share each finish's whole recorded second, by edition size."""
    key = c.edition.astype(np.int64) * 100000 + np.floor(c.finish).astype(np.int64)
    _, inverse, counts = np.unique(key, return_inverse=True, return_counts=True)
    tie = counts[inverse]
    shared = tie >= 2
    size = c.ed_n[c.edition]
    rows, vals = [], {}
    for i, (a, b, label) in enumerate(SIZE_BANDS):
        m = (size >= a) & ((size < b) if b else True)
        d = require_cell(m.sum(), label)
        rows.append(dict(label=label, value=sh(shared[m].mean()), tone='signal' if i == 0 else 'ink' if i == len(SIZE_BANDS) - 1 else 'quiet'))
        if i == 0:
            vals['big'] = rows[-1]['value']
        if i == len(SIZE_BANDS) - 1:
            vals['small'] = rows[-1]['value']
            vals['n_small'] = d
    alone = sh((tie == 1).mean())
    return dict(
        values=dict(big=vals['big'], small=vals['small'], alone_all=alone, n_small=vals['n_small'], big_min=SIZE_BANDS[0][0],
                    small_max=SIZE_BANDS[-1][1]),
        plot=dict(form='bars', rows=rows, x=dict(min=0, max=1, fmt='share'), fmt='share'),
        cohort_n=int(c.n), editions_n=n_editions(c), weighting='pooled',
        method=(f'Every eligible finish ({finishes(c.n)}), by how many eligible finishes in the same edition share its whole '
                'recorded second; pooled within each band of edition size (eligible finishes).'),
    )


@chart('seconds-before-the-mark')
def seconds_before_the_mark(c):
    """Finishes in ten-second steps from 2:57:00 to 3:00:59."""
    s = np.floor(c.finish).astype(np.int64)
    lo = 10620
    sel = (s >= lo) & (s < lo + 240)
    counts = np.bincount((s[sel] - lo) // 10, minlength=24)
    for k in range(24):
        require_cell(counts[k], f'ten-second bin {k}')
    tone = {12: 'ink', 17: 'signal'}
    bins = [dict(x0=lo + 10 * k, x1=lo + 10 * (k + 1), v=int(counts[k]), tone=tone.get(k, 'faint' if k >= 18 else 'quiet')) for k in range(24)]
    first, last, after = int(counts[12]), int(counts[17]), int(counts[18])
    drop = 1 - last / first
    return dict(
        values=dict(first=first, last=last, drop=sh(drop), after=after),
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=lo, max=lo + 240, fmt='hms', ticks=[10680, 10800]),
                  y=dict(min=0, max=3500, fmt='count', ticks=[0, 1000, 2000, 3000], title='finishes'),
                  refs=[dict(axis='x', value=10800, tone='quiet')],
                  notes=[dict(x=10800, y=2650, text='{v} vs\n2:59:00', value=sh(-drop), fmt='dpct', tone='signal', anchor='start', dx=6, dy=0),
                         dict(x=10745, y=first, text='2:59:00', tone='ink', dy=-14, leader=True)]),
        cohort_n=int(c.n), editions_n=n_editions(c), weighting='pooled',
        method=(f'Every eligible finish ({finishes(c.n)}) in ten-second steps of its whole recorded second around 3:00, '
                'pooled over all editions.'),
    )


def race_days(c):
    """Each edition's race date (days since 2000-01-01) from the weather evidence."""
    by = {(row['city'], row['year']): row.get('date') for row in c.weather['editions']}
    days = np.full(len(c.editions), -1, np.int64)
    for e, ed in enumerate(c.editions):
        d = by.get((ed['city'], ed['year']))
        if d:
            days[e] = (datetime.date.fromisoformat(d) - datetime.date(2000, 1, 1)).days
    if (days[c.ed_n > 0] < 0).any():
        raise ValueError('An edition with finishes has no race date')
    return days


@chart('a-year-apart')
def a_year_apart(c):
    """Consecutive linked finishes of the same record (by race date), 300 to 429 days apart: the change in finish time."""
    day = race_days(c)[c.edition]
    order = np.lexsort((np.arange(c.n), c.edition, day, c.profile))
    p = c.profile[order]
    same = p[1:] == p[:-1]
    a, b = order[:-1][same], order[1:][same]
    gap = day[b] - day[a]
    keep = (gap >= 300) & (gap <= 429)
    a, b = a[keep], b[keep]
    n = require_cell(len(a), 'pairs')
    change = c.finish[b] - c.finish[a]
    within = np.abs(change) <= 300
    beyond = np.abs(change) > 1200
    ny = c.cities.index('New York')
    m_ny = ((c.city[a] == ny) & (c.city[b] == ny) & (c.year[b] - c.year[a] == 1) & c.exact_age_ok[a] & c.exact_age_ok[b])
    da = c.exact_age[b] - c.exact_age[a]
    m_ny &= (da >= 0) & (da <= 2)
    n_ny = require_cell(m_ny.sum(), 'New York pairs')
    used = np.zeros(c.n, bool)
    used[a] = used[b] = True
    edges = np.arange(-3600, 3601, 150)
    hist = np.histogram(change, bins=edges)[0]
    bins = []
    for k in range(len(edges) - 1):
        x0, x1 = int(edges[k]), int(edges[k + 1])
        tone = 'signal' if x0 >= -300 and x1 <= 300 else 'faint' if x1 <= -1200 or x0 >= 1200 else 'quiet'
        bins.append(dict(x0=x0, x1=x1, v=sh(hist[k] / n), tone=tone))
    return dict(
        values=dict(within=sh(within.mean()), tol=300, beyond20=sh(beyond.mean()), n=n, within_ny=sh(within[m_ny].mean()), n_ny=n_ny),
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=-3600, max=3600, fmt='dmins', ticks=[-3600, -1200, 0, 1200, 3600], title='← quicker next time · slower next time →'),
                  y=dict(min=0, max=0.07, fmt='share', ticks=[0, 0.02, 0.04, 0.06], title='of pairs'),
                  notes=[dict(x=0, y=sh(hist[23] / n), text='{v} within 5 min', value=sh(within.mean()), fmt='share', tone='signal', dy=-12),
                         dict(x=3500, y=0.0535, text='{v} beyond 20 min\neither way', value=sh(beyond.mean()), fmt='share', tone='quiet', anchor='end', dy=0)]),
        cohort_n=int(used.sum()), editions_n=n_editions(c, used), weighting='pairs',
        method=(f'Consecutive finishes of the same record linked by name (not a verified person), ordered by race date, 300 to 429 days apart '
                f'({count_phrase(n, "pair")}); same-day pairs are left out. A check on New York pairs one year apart whose exact ages step by '
                '0 to 2 years gives the same picture.'),
    )


@chart('kick-just-under-the-mark')
def kick_just_under_the_mark(c):
    """In start-screened editions: the share of finishes whose 40K-finish pace beat their 35-40K pace, by finish minute."""
    keep = c.shape_keep
    kick = c.paces[:, 8] < c.paces[:, 7]
    minutes = np.floor(c.finish / 60).astype(np.int64)
    tot = np.bincount(minutes[keep], minlength=721)
    hit = np.bincount(minutes[keep & kick], minlength=721)
    lo, hi = 170, 249
    for m in range(lo, hi + 1):
        require_cell(tot[m], f'finish minute {m}')
    sh_at = lambda m: sh(hit[m] / tot[m])  # noqa: E731
    # Each half-hour mark M drawn (3:00, 3:30, 4:00): the minute before it against every other minute from M-10 to M+5.
    near = lambda mk: max(sh_at(m) for m in range(mk - 10, mk + 6) if m != mk - 1)  # noqa: E731
    line = [[m * 60 + 30, sh_at(m)] for m in range(lo, hi + 1)]
    return dict(
        values=dict(a=sh_at(179), a0=sh_at(178), b=sh_at(180), b1=sh_at(181), near3=near(180),
                    peak330=sh_at(209), near330=near(210), peak4=sh_at(239), near4=near(240),
                    n_min=int(min(tot[178], tot[179], tot[180]))),
        plot=dict(form='lines',
                  series=[dict(label='Every minute', points=line, tone='quiet', width=1.5, labelAt='none'),
                          dict(label='2:59', points=[[179 * 60 + 30, sh_at(179)]], tone='signal', dots=True, width=0.01, labelAt='none'),
                          dict(label='3:00', points=[[180 * 60 + 30, sh_at(180)]], tone='ink', dots=True, width=0.01, labelAt='none')],
                  x=dict(min=lo * 60, max=15000, fmt='hm', ticks=[10800, 12600, 14400]),
                  y=dict(min=0.45, max=0.85, fmt='share', ticks=[0.5, 0.65, 0.8], title='with a kick'),
                  notes=[dict(x=179 * 60 + 30, y=sh_at(179), text='2:59: {v}', value=sh_at(179), fmt='share', tone='signal', anchor='start', dx=8, dy=-24),
                         dict(x=180 * 60 + 30, y=sh_at(180), text='3:00: {v}', value=sh_at(180), fmt='share', tone='ink', anchor='start', dx=8, dy=-28, leader=True),
                         dict(x=209 * 60 + 30, y=sh_at(209), text='3:29', tone='quiet', dy=-10),
                         dict(x=239 * 60 + 30, y=sh_at(239), text='3:59', tone='quiet', dy=-10)]),
        cohort_n=int(keep.sum()), editions_n=n_editions(c, keep), weighting='pooled',
        method=(f'Finishes in editions that pass the start-offset screen ({finishes(int(keep.sum()))}), by finish minute: '
                'the share whose pace over 40K to the finish was quicker than over 35–40K.'),
    )


WINDOWS = [('2:30', 9000, 'w230'), ('3:00', 10800, 'w3'), ('3:30', 12600, 'w330'), ('4:00', 14400, 'w4'), ('4:30', 16200, 'w430'),
           ('5:00', 18000, 'w5')]


@chart('ten-minutes-many-places')
def ten_minutes_many_places(c):
    """Editions of 30,000+ finishes: finishes in the ten minutes around each round time, per 40,000 finishes; edition median."""
    big = np.flatnonzero(c.ed_n >= 30000)
    if not len(big):
        raise ValueError('no editions with 30,000+ finishes')
    per = {k: [] for _, _, k in WINDOWS}
    for e in big:
        f = c.finish[c.edition == e]
        for _, mark, k in WINDOWS:
            per[k].append(np.sum((f >= mark - 300) & (f < mark + 300)) * 40000 / len(f))
    v = {k: sec(median(np.array(x))) for k, x in per.items()}
    v['lo4'] = sec(min(per['w4']))
    v['hi3'] = sec(max(per['w3']))
    v['eds'] = int(len(big))
    v['scale'], v['size_min'] = 40000, 30000
    n = int(c.ed_n[big].sum())
    return dict(
        values=v,
        plot=dict(form='columns', cols=[dict(label=lab, value=v[k], tone='signal' if k == 'w4' else 'ink' if k == 'w230' else 'quiet') for lab, _, k in WINDOWS],
                  y=dict(min=0, max=3500, fmt='count', ticks=[0, 1000, 2000, 3000], title='finishes per 40,000'), fmt='count', values='toned'),
        cohort_n=n, editions_n=int(len(big)), weighting='editions-equal',
        method=(f'Editions of 30,000 or more eligible finishes ({len(big)} editions, {finishes(n)}): finishes from five minutes '
                'before to five minutes after each round time, scaled to a field of 40,000; the median over editions, window by window.'),
    )


@chart('same-four-hours-different-place')
def same_four_hours_different_place(c):
    """The twelve cities with the most eligible finishes: the share of each city's finishes slower than 4:00:00."""
    counts = np.bincount(c.city, minlength=len(c.cities))
    top = sorted(range(len(c.cities)), key=lambda i: (-counts[i], c.cities[i]))[:12]
    slower = c.finish > 14400
    rows = []
    for i in top:
        m = c.city == i
        require_cell(m.sum(), c.cities[i])
        rows.append(dict(label=c.cities[i], value=sh(slower[m].mean())))
    rows.sort(key=lambda r: (-r['value'], r['label']))
    for r in rows:
        r['tone'] = 'signal' if r['label'] == 'Washington' else 'ink' if r['label'] == 'Valencia' else 'quiet'
    wash = c.mask_city('Washington')
    val = c.mask_city('Valencia')
    every = sh(slower.mean())
    n = int(np.isin(c.city, top).sum())
    return dict(
        values=dict(wash=sh(slower[wash].mean()), val=sh(slower[val].mean()), all=every),
        plot=dict(form='bars', rows=rows, x=dict(min=0, max=1, fmt='share'), fmt='share'),
        cohort_n=n, editions_n=n_editions(c, np.isin(c.city, top)), weighting='pooled',
        method=(f'The twelve cities with the most eligible finishes ({finishes(n)}), pooled over their editions: the share of '
                'each city\'s finishes slower than 4:00:00. It describes the fields, not the courses.'),
    )


MARKS = [(9000, 'sub230'), (10800, 'sub3'), (12600, 'sub330'), (14400, 'sub4'), (18000, 'sub5'), (21600, 'sub6')]


@chart('only-1-in-20-under-3')
def only_1_in_20_under_3(c):
    """The share of all eligible finishes under 3:00 and from 3:00 to 4:00, pooled, as 100 squares; the median edition in
    the guard."""
    v = {k: sh((c.finish < t).mean()) for t, k in MARKS}
    v['sub3to4'] = sh(((c.finish >= 10800) & (c.finish < 14400)).mean())
    eds = np.flatnonzero(c.ed_n >= 1000)
    if not len(eds):
        raise ValueError('no editions with 1,000+ finishes')
    v['ed_med'] = sh(median(np.array([(c.finish[c.edition == e] < 10800).mean() for e in eds])))
    v['eds'] = int(len(eds))
    return dict(
        values=v,
        plot=dict(form='waffle', parts=[dict(share=v['sub3'], tone='signal', label='under 3:00'),
                                        dict(share=v['sub3to4'], tone='ink', label='3:00–4:00')],
                  rest='4:00 or slower'),
        cohort_n=int(c.n), editions_n=n_editions(c), weighting='pooled',
        method=(f'Every eligible finish ({finishes(c.n)}) against round finish times, pooled over all editions; the median '
                f'over the {len(eds)} editions of 1,000 or more finishes keeps one quick field from carrying the share under 3:00.'),
    )
