"""Top 100 charts, trends (second batch): builders run by analysis/build_charts.py.

Most of these read records linked by name across races (c.profile): candidate links, never verified people, and the
profile id itself is never published. "Consecutive linked finishes" are a record's finishes in race-date order (each
edition dated from the weather evidence, ties by edition index), with same-day pairs dropped.
"""
from datetime import date

import numpy as np

from charts_common import count_phrase, median, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


_LINKED = {}


def linked(c):
    """Race-date order of every record's linked finishes, once per cohort: rank (0 = first), count, and the
    consecutive pairs (a → b) of the same record on different days."""
    key = id(c)
    if key in _LINKED:
        return _LINKED[key]
    dates = {(row['city'], row['year']): row.get('date') for row in c.weather['editions']}
    ed_day = np.full(len(c.editions), -1, np.int64)
    for e, ed in enumerate(c.editions):
        d = dates.get((ed['city'], ed['year']))
        if d:
            ed_day[e] = (date.fromisoformat(d) - date(2000, 1, 1)).days
    if (ed_day[c.ed_n > 0] < 0).any():
        raise ValueError('Every edition with finishes needs a race date for the linked-record order')
    day = ed_day[c.edition]
    order = np.lexsort((c.edition, day, c.profile))
    p = c.profile[order]
    new = np.r_[True, p[1:] != p[:-1]]
    starts = np.flatnonzero(new)
    group = np.cumsum(new) - 1
    sizes = np.diff(np.r_[starts, len(p)])
    rank = np.empty(c.n, np.int64)
    rank[order] = np.arange(len(p)) - starts[group]
    count = np.empty(c.n, np.int64)
    count[order] = sizes[group]
    pid = np.empty(c.n, np.int64)
    pid[order] = group
    same = ~new[1:]
    a, b = order[:-1][same], order[1:][same]
    keep = day[a] != day[b]
    out = dict(day=day, rank=rank, count=count, pid=pid, records=int(len(starts)), a=a[keep], b=b[keep])
    _LINKED[key] = out
    return out


@chart('most-records-appear-once')
def most_records_appear_once(c):
    """Records linked by name with three or more eligible finishes: their share of all records, then of all finishes."""
    L = linked(c)
    first = L['rank'] == 0
    records = L['records']
    records3 = require_cell(int((L['count'][first] >= 3).sum()), 'records with three or more finishes')
    rec3 = records3 / records
    held3 = float((L['count'] >= 3).sum()) / c.n
    compare = [dict(label='Share of records', value=sh(rec3), tone='ink'),
               dict(label='Share of finishes', value=sh(held3), tone='signal')]
    return dict(
        values=dict(rec3=sh(rec3), held3=sh(held3), one_in=sh(records / records3), records=records, records3=records3),
        plot=dict(form='big', value=sh(held3), fmt='share1', caption='of finishes are by names seen 3+ times',
                  compare=compare, compareFmt='share1'),
        cohort_n=int(c.n), editions_n=int(len(np.unique(c.edition))), weighting='pooled',
        method=f'Every eligible finish ({int(c.n):,} finishes) grouped by its record linked by name ({records:,} records); the bars are the '
               f'{records3:,} records with three or more finishes and the finishes they hold. Links differ by race, so repeat counts are approximate.',
    )


@chart('every-new-york-in-the-data')
def every_new_york_in_the_data(c):
    """Records linked by name by how many New York editions they finished."""
    L = linked(c)
    ny = c.mask_city('New York')
    k = int(len(np.unique(c.edition[ny])))
    per = np.bincount(L['pid'][ny], minlength=L['records'])
    at_least = {m: int((per >= m).sum()) for m in (2, 5, 10, 15, k)}
    all_k = require_cell(at_least[k], 'records with every New York edition')
    compare = [dict(label='At least 10', value=at_least[10], tone='ink'), dict(label=f'{k} editions', value=all_k, tone='signal')]
    return dict(
        values=dict(all16=all_k, n_eds=k, ten=at_least[10], five=at_least[5], fifteen=at_least[15], two=at_least[2]),
        plot=dict(form='big', value=all_k, fmt='count', caption=f'records finished {k} editions',
                  compare=compare, compareFmt='count'),
        cohort_n=int(ny.sum()), editions_n=k, weighting='pooled',
        method=f'New York finishes ({int(ny.sum()):,} finishes, {k} editions) grouped by record linked by name; '
               'counts are records, which are candidate links rather than verified people.',
    )


RACES8 = ['Berlin', 'Chicago', 'New York', 'Boston', 'Amsterdam', 'Rotterdam', 'Hamburg', 'Copenhagen']
SHOWN = [('Berlin', 'signal'), ('New York', 'quiet'), ('Chicago', 'quiet'), ('Boston', 'quiet')]


@chart('women-at-the-front-grew')
def women_at_the_front_grew(c):
    """Women's share of men's and women's sub-3:30 finishes, edition by edition, in eight races."""
    by = {}
    total = 0
    editions = 0
    for city in RACES8:
        rows = []
        eds = sorted(np.flatnonzero((c.ed_city == city) & (c.ed_n >= 1000) & ~c.gender_gap_edition), key=lambda e: c.ed_year[e])
        if len(eds) < 2:
            raise ValueError(f'{city}: under two editions with 1,000+ finishes and full gender recording')
        for e in eds:
            m = (c.edition == e) & (c.finish < 12600) & ((c.gender == 1) | (c.gender == 2))
            d = require_cell(int(m.sum()), f'{c.label(e)} sub-3:30 finishes')
            rows.append((int(c.ed_year[e]), float((c.gender[m] == 2).sum()) / d))
            total += d
            editions += 1
        by[city] = rows
    rose = sum(1 for city in RACES8 if by[city][-1][1] > by[city][0][1])
    berlin = by['Berlin']
    series = [dict(label=city, tone=tone, points=[[y, sh(v)] for y, v in by[city]], **({'width': 3, 'dots': True} if tone == 'signal' else {}))
              for city, tone in reversed(SHOWN)]
    return dict(
        values=dict(first=sh(berlin[0][1]), last=sh(berlin[-1][1]), y0=berlin[0][0], y1=berlin[-1][0], rose=rose, races=len(RACES8)),
        plot=dict(form='lines', series=series,
                  x=dict(min=2002, max=2026, fmt='year', ticks=[2005, 2010, 2015, 2020, 2025]),
                  y=dict(min=0, max=0.35, fmt='share', ticks=[0, 0.1, 0.2, 0.3], title='women'),
                  notes=[dict(x=berlin[0][0], y=sh(berlin[0][1]), text='{v}', value=sh(berlin[0][1]), fmt='share1', tone='signal', anchor='start', dy=-12),
                         dict(x=berlin[-1][0], y=sh(berlin[-1][1]), text='{v}', value=sh(berlin[-1][1]), fmt='share1', tone='signal', anchor='start', dx=6, dy=26)]),
        cohort_n=int(total), editions_n=int(editions), weighting='editions-equal',
        method=f"Women's share of men's and women's finishes under 3:30 in {editions} editions of 1,000+ finishes in eight races "
               '(Berlin, Chicago, New York, Boston, Amsterdam, Rotterdam, Hamburg, Copenhagen), editions with gender-recording gaps left out.',
    )


@chart('new-york-2021-returners')
def new_york_2021_returners(c):
    """New York finishes linked by name to a New York finish in the previous five calendar years."""
    ny = c.mask_city('New York')
    years = sorted(int(y) for y in np.unique(c.year[ny]))
    pools = {y: np.unique(c.profile[ny & (c.year == y)]) for y in years}
    cols, shares, total = [], {}, 0
    for y in [y for y in years if 2016 <= y <= 2025]:
        prev = [pools[p] for p in range(y - 5, y) if p in pools]
        if len(prev) < 2:
            raise ValueError(f'New York {y}: under two earlier editions in the five-year window')
        m = ny & (c.year == y)
        d = require_cell(int(m.sum()), f'New York {y}')
        shares[y] = float(np.isin(c.profile[m], np.concatenate(prev)).sum()) / d
        total += d
        cols.append(dict(label=f'’{y % 100:02d}', value=sh(shares[y]), tone='signal' if y == 2021 else 'quiet'))
    usual = median([v for y, v in shares.items() if y != 2021])
    return dict(
        values=dict(r21=sh(shares[2021]), usual=sh(usual), editions=len(cols)),
        plot=dict(form='columns', cols=cols, fmt='share', values='toned', ref=dict(axis='y', value=sh(usual), label='typical edition', tone='quiet'),
                  y=dict(min=0, max=0.4, fmt='share', ticks=[0, 0.1, 0.2, 0.3, 0.4])),
        cohort_n=int(total), editions_n=len(cols), weighting='pooled',
        method='Each New York finish from 2016 to 2025, and whether its record linked by name holds a New York finish in the five calendar years before.',
    )


BANDS = [(0, 10800, 'Under 3:00'), (10800, 12600, '3:00–3:30'), (12600, 14400, '3:30–4:00'), (14400, 16200, '4:00–4:30'),
         (16200, 18000, '4:30–5:00'), (18000, 21600, '5:00–6:00')]


@chart('quicker-finishes-more-repeatable')
def quicker_finishes_more_repeatable(c):
    """Consecutive linked finishes: the share whose second came within 2% of the first, by the first finish's band."""
    L = linked(c)
    fa, fb = c.finish[L['a']], c.finish[L['b']]
    close = np.abs(fb / fa - 1) <= 0.02
    rows, sizes, total = [], [], 0
    for i, (lo, hi, label) in enumerate(BANDS):
        m = (fa >= lo) & (fa < hi)
        d = require_cell(int(m.sum()), f'{label} pairs')
        sizes.append(d)
        total += d
        rows.append(dict(label=label, value=sh(float(close[m].sum()) / d), tone='signal' if i == 0 else 'ink' if i == len(BANDS) - 1 else 'quiet'))
    return dict(
        values=dict(fast=rows[0]['value'], slow=rows[-1]['value'], n_fast=sizes[0], n_slow=sizes[-1]),
        plot=dict(form='bars', rows=rows, fmt='share', x=dict(min=0, max=0.4, fmt='share')),
        cohort_n=int(total), editions_n=int(len(np.unique(c.edition[L['a']]))), weighting='pairs',
        method=f'Consecutive finishes of records linked by name ({count_phrase(total, "pair")} of finishes on different days, first finish under 6:00): '
               'the share whose second finish was within 2% of the first.',
    )


MIN_EDITIONS = 8  # races with at least this many screened editions
SHOWN_ROWS = 8  # the widest ranges drawn: the range form fits eight rows on the card


@chart('same-race-different-year')
def same_race_different_year(c):
    """Each race's sustained slowdown share edition by edition: lowest, median and highest edition."""
    keep = c.shape_keep
    per, sizes, city_of, years = {}, {}, {}, {}
    for e in range(len(c.editions)):
        m = keep & (c.edition == e)
        d = int(m.sum())
        if d < 100:
            continue
        race = str(c.ed_race[e])
        per.setdefault(race, []).append(float(c.slow[m].sum()) / d)
        years.setdefault(race, []).append(int(c.ed_year[e]))
        sizes[race] = sizes.get(race, 0) + d
        city_of[race] = str(c.ed_city[e])
    races = [race for race in per if len(per[race]) >= MIN_EDITIONS]
    cities = [city_of[r] for r in races]
    label = {r: city_of[r] if cities.count(city_of[r]) == 1 else r for r in races}
    stats = sorted(((r, min(per[r]), median(per[r]), max(per[r]), len(per[r])) for r in races), key=lambda r: (-(r[3] - r[1]), label[r[0]]))
    swing = 0.2
    n20 = sum(1 for r in stats if r[3] - r[1] >= swing)
    top = stats[0]
    v = per[top[0]]
    hi_year, lo_year = years[top[0]][v.index(top[3])], years[top[0]][v.index(top[1])]
    rows = [dict(label=label[r], lo=sh(lo), mid=sh(mid), hi=sh(hi), tone='signal' if i == 0 else 'quiet')
            for i, (r, lo, mid, hi, _) in enumerate(stats[:SHOWN_ROWS])]
    return dict(
        values=dict(race=label[top[0]], lo=sh(top[1]), hi=sh(top[3]), top_eds=top[4], hi_year=hi_year, lo_year=lo_year,
                    n20=n20, races=len(stats), swing=swing, min_eds=MIN_EDITIONS),
        plot=dict(form='range', rows=rows, fmt='share', x=dict(min=0, max=0.6, fmt='share', ticks=[0, 0.2, 0.4, 0.6]),
                  legend=dict(lo='lowest', mid='median', hi='highest')),
        cohort_n=int(sum(sizes[r] for r in races)), editions_n=int(sum(r[4] for r in stats)), weighting='editions-equal',
        method='The sustained slowdown share of each edition of 100+ finishes that passes the start-offset screen, for the races with at least '
               f'eight such editions ({len(stats)} races, the {min(SHOWN_ROWS, len(stats))} widest drawn); each row runs from the lowest edition to the highest, '
               'the dot at the median edition.',
    )


@chart('just-over-3-then-next')
def just_over_3_then_next(c):
    """Consecutive linked finishes with the first in 2:55–3:09: the share of next finishes under 3:00, minute by minute."""
    L = linked(c)
    fa, fb = c.finish[L['a']], c.finish[L['b']]
    minute = np.floor(fa / 60).astype(np.int64)
    under = fb < 10800
    shares, total = {}, 0
    for m in range(175, 190):
        sel = minute == m
        d = require_cell(int(sel.sum()), f'pairs from minute {m}')
        shares[m] = float(under[sel].sum()) / d
        total += d
    steps = [shares[m] - shares[m + 1] for m in range(175, 189) if m != 179]
    step = shares[179] - shares[180]
    mean_step = float(np.mean(steps))
    max_step = float(max(steps))
    pts = [[m * 60 + 30, sh(shares[m])] for m in range(175, 190)]
    series = [dict(label='Next finish', tone='quiet', points=pts, dots=True, labelAt='none', width=2),
              dict(label='Across 3:00', tone='signal', points=[pts[4], pts[5]], width=3, labelAt='none'),
              dict(label='After 2:59', tone='ink', points=[pts[4]], dots=True, labelAt='none'),
              dict(label='After 3:00', tone='ink', points=[pts[5]], dots=True, labelAt='none')]
    return dict(
        values=dict(under=sh(shares[179]), over=sh(shares[180]), step=sh(step), mean_step=sh(mean_step), max_step=sh(max_step)),
        plot=dict(form='lines', series=series,
                  x=dict(min=10440, max=11400, fmt='hm', ticks=[10500, 10800, 11100, 11400], title='Earlier linked finish'),
                  y=dict(min=0, max=0.75, fmt='share', ticks=[0, 0.25, 0.5, 0.75], title='next finish under 3:00'),
                  notes=[dict(x=pts[4][0], y=pts[4][1], text='2:59 → {v}', value=pts[4][1], fmt='share', tone='ink', anchor='end', dx=-8, dy=16),
                         dict(x=pts[5][0], y=pts[5][1], text='3:00 → {v}', value=pts[5][1], fmt='share', tone='ink', anchor='start', dx=12, dy=-2)]),
        cohort_n=int(total), editions_n=int(len(np.unique(c.edition[L['a']][(minute >= 175) & (minute < 190)]))), weighting='pairs',
        method=f'Consecutive finishes of records linked by name whose first finish was 2:55:00–3:09:59 ({count_phrase(total, "pair")} on different days): '
               'the share whose next finish was under 3:00, by the minute of the first.',
    )


@chart('quicker-second-20k-again')
def quicker_second_20k_again(c):
    """Consecutive linked finishes, both in start-screened editions: after a quicker 20–40K than 0–20K, the next one."""
    L = linked(c)
    keep = c.shape_keep
    quick = (c.times[:, 7] - c.times[:, 3]) < c.times[:, 3]
    ok = keep[L['a']] & keep[L['b']]
    a, b = L['a'][ok], L['b'][ok]
    qa = quick[a]
    d_after = require_cell(int(qa.sum()), 'pairs after a quicker second 20K')
    d_other = require_cell(int((~qa).sum()), 'pairs after a slower second 20K')
    after = float(quick[b][qa].sum()) / d_after
    other = float(quick[b][~qa].sum()) / d_other
    base = float(quick[keep].sum()) / int(keep.sum())
    ratio = after / other
    compare = [dict(label='After a quicker 20–40K', value=sh(after), tone='ink'), dict(label='After a slower 20–40K', value=sh(other), tone='quiet')]
    return dict(
        values=dict(after=sh(after), other=sh(other), ratio=sh(ratio), base=sh(base), n_after=d_after, n_other=d_other),
        plot=dict(form='big', value=sh(ratio), fmt='ratio', caption='as often as after a slower 20–40K',
                  compare=compare, compareFmt='share'),
        cohort_n=int(len(a)), editions_n=int(len(np.unique(c.edition[a]))), weighting='pairs',
        method=f'Consecutive finishes of records linked by name, both in editions that pass the start-offset screen ({count_phrase(len(a), "pair")} on different days): '
               'whether the 20–40K took less clock time than the 0–20K, in the first finish and in the next.',
    )


AGE_BANDS = [(18, 30, '18–29', 'ink'), (30, 40, '30–39', 'quiet'), (40, 50, '40–49', 'quiet'), (50, 60, '50–59', 'signal'), (60, 90, '60+', 'quiet')]


UNDRAWN = {'60+'}  # in the age-order guard but not drawn: its steeper line crowds the 50–59 reading off the card


@chart('same-records-years-later')
def same_records_years_later(c):
    """From a record's first linked finish (exact age known) to each later one: median change by years since and start age."""
    L = linked(c)
    first = (L['rank'] == 0) & c.exact_age_ok & (L['count'] >= 2)
    fi = np.full(L['records'], -1, np.int64)
    fi[L['pid'][first]] = np.flatnonzero(first)
    later = (L['rank'] >= 1) & (fi[L['pid']] >= 0)
    li = np.flatnonzero(later)
    f0 = fi[L['pid'][li]]
    dy = c.year[li].astype(np.int64) - c.year[f0].astype(np.int64)
    change = c.finish[li] - c.finish[f0]
    age0 = c.exact_age[f0]
    y0 = c.year[f0]
    series, at8, total = [], {}, 0
    for lo, hi, label, tone in AGE_BANDS:
        band = (age0 >= lo) & (age0 < hi)
        at8[label] = band & (dy == 8)
        if label in UNDRAWN:
            continue
        pts = []
        for y in range(1, 11):
            m = band & (dy == y)
            if m.sum() >= 100:
                pts.append([y, sec(median(change[m]))])
                total += int(m.sum())
        series.append(dict(label=label, tone=tone, points=pts, **({'width': 3} if tone == 'signal' else {})))
    young, fifties = at8['18–29'], at8['50–59']
    n_young, n50 = require_cell(int(young.sum()), '18–29 at 8 years'), require_cell(int(fifties.sum()), '50–59 at 8 years')
    by_band = {}
    for label, m in at8.items():
        require_cell(int(m.sum()), f'{label} at 8 years')
        by_band[label] = median(change[m])
    rising = int(all(by_band[x] < by_band[y] for x, y in zip(list(by_band)[:-1], list(by_band)[1:])))
    gap = median(change[fifties]) - median(change[young])
    early, late = y0 <= 2012, y0 >= 2013
    gap_early = median(change[fifties & early]) - median(change[young & early])
    gap_late = median(change[fifties & late]) - median(change[young & late])
    for m, what in ((fifties & early, '50–59 early'), (young & early, '18–29 early'), (fifties & late, '50–59 late'), (young & late, '18–29 late')):
        require_cell(int(m.sum()), what)
    order = sorted(series, key=lambda s: {'quiet': 0, 'ink': 1, 'signal': 2}[s['tone']])
    return dict(
        values=dict(gap=sec(gap), young=sec(median(change[young])), fifties=sec(median(change[fifties])), gap_early=sec(gap_early), gap_late=sec(gap_late),
                    n_young=n_young, n50=n50, rising=rising),
        plot=dict(form='lines', series=order,
                  x=dict(min=0, max=10, fmt='int', ticks=[2, 4, 6, 8, 10], title='Years since the first linked finish'),
                  y=dict(min=-900, max=2700, fmt='dmins', ticks=[0, 900, 1800, 2700], title='vs first finish'),
                  refs=[dict(axis='y', value=0, tone='quiet'), dict(axis='x', value=8, tone='quiet')],
                  notes=[dict(x=8, y=sec(median(change[fifties])), text='{v}', value=sec(median(change[fifties])), fmt='dmins', tone='signal', anchor='end', dx=-8, dy=-14),
                         dict(x=8, y=sec(median(change[young])), text='{v}', value=sec(median(change[young])), fmt='dmins', tone='ink', anchor='end', dx=-6, dy=18)]),
        cohort_n=int(total), editions_n=int(len(np.unique(c.edition[li]))), weighting='pairs',
        method='Records linked by name whose first linked finish was in an edition with exact ages, and each later finish of the same record: '
               'the median change in finish time by whole years since the first and age at the first (points with 100+ pairs; only records still finishing). '
               'Records first seen at 60+ are not drawn; at eight years they lost more time than the 50–59 group.',
    )
