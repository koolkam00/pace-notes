"""Top 100 charts, trends batch 1 (analysis/build_charts.py).

Over-the-years charts: fixed races compared across periods, and records linked by name followed from one finish to the
next. Linked records are candidates (finishes linked by name across races), never verified people: counts are records
or pairs of finishes. A record's finishes are put in race-date order (edition dates from the weather evidence); a finish
that shares its race date with another finish of the same record (two people under one name) is left out of every
linked sequence, so the order is never decided by a tie.
"""
from datetime import date

import numpy as np

from charts_common import MIN_CELL, count_phrase, edition_ranks, median, require_cell, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


EIGHT = ['Berlin', 'Chicago', 'New York', 'Boston', 'Amsterdam', 'Rotterdam', 'Hamburg', 'Copenhagen']
EARLY, LATE = (2013, 2019), (2022, 2025)
# The fields chart keeps races whose eligible share of raw records moves under 5 points across 2019, 2021 and the latest
# edition; the women's-share chart leaves out editions under 80% of their raw records. Both are computed from the data.
RETENTION_SPREAD, MIN_RETENTION = 0.05, 0.8
DUMBBELL_ROWS = 11
# The women's-share chart's example race (another card leads on Berlin's women's share).
EXAMPLE = 'Copenhagen'


def raw_counts(c):
    """Raw records per edition (before eligibility), for the retention screens."""
    raw = getattr(c.f, 'raw_by_edition', None)
    if raw is None:
        raise ValueError('no raw record counts by edition for the retention screen')
    return raw


def in_period(year, period):
    return period[0] <= year <= period[1]


def edition_days(c):
    """Each edition's race date as a day number (weather evidence), -1 where an edition has no finishes."""
    by = {(row['city'], row['year']): row.get('date') for row in c.weather['editions']}
    out = np.full(len(c.editions), -1, dtype=np.int64)
    for e, ed in enumerate(c.editions):
        d = by.get((ed['city'], ed['year']))
        if d:
            out[e] = (date.fromisoformat(d) - date(2000, 1, 1)).days
    if (out[c.ed_n > 0] < 0).any():
        raise ValueError('An edition with finishes has no race date')
    return out


_SEQ = {}


def sequences(c, shape_only):
    """Linked sequences: (order, starts, counts) where order lists finish indices record by record in race-date order."""
    key = (id(c), shape_only)
    if key in _SEQ:
        return _SEQ[key]
    day = edition_days(c)[c.edition]
    prof = c.profile.astype(np.int64)
    pd_ = prof * 100000 + day
    _, inv, cnt = np.unique(pd_, return_inverse=True, return_counts=True)
    keep = cnt[inv] == 1
    if shape_only:
        keep &= c.shape_keep
    idx = np.flatnonzero(keep)
    order = idx[np.lexsort((day[idx], prof[idx]))]
    p = prof[order]
    first = np.r_[True, p[1:] != p[:-1]]
    starts = np.flatnonzero(first)
    counts = np.diff(np.r_[starts, len(order)])
    _SEQ[key] = (order, starts, counts)
    return _SEQ[key]


def first_k(c, k, shape_only):
    """Finish indices (records × k) of the first k linked finishes of every record with k or more."""
    order, starts, counts = sequences(c, shape_only)
    s = starts[counts >= k]
    return np.stack([order[s + j] for j in range(k)], 1)


@chart('sub-3-went-mainstream')
def sub_3_went_mainstream(c):
    """The share of men's finishes under 3:00 (men's finishes under 3:00 over all men's finishes) in eight fixed races,
    each race's 2022–25 mean against its 2013–19 mean."""
    races, ratios, early, late, n_min = [], [], [], [], None
    for city in EIGHT:
        rows = []
        for e in np.flatnonzero((c.ed_city == city) & (c.ed_n >= 1000) & ~c.gender_gap_edition):
            men = (c.edition == e) & (c.gender == 1)
            m = require_cell(men.sum(), f'{c.label(e)} men')
            n_min = m if n_min is None else min(n_min, m)
            rows.append((int(c.ed_year[e]), float((c.finish[men] < 10800).mean())))
        ea, la = [v for y, v in rows if in_period(y, EARLY)], [v for y, v in rows if in_period(y, LATE)]
        if not ea or not la:
            raise ValueError(f'{city}: no 2013–19 and 2022–25 editions with 1,000+ finishes')
        a, b = float(np.mean(ea)), float(np.mean(la))
        races.append((city, rows, a, b))
        ratios.append(b / a)
        early.append(a)
        late.append(b)
    order = sorted(range(len(EIGHT)), key=lambda i: -ratios[i])
    bars = [dict(label=EIGHT[i], value=sh(ratios[i]), tone='quiet') for i in order]
    bars.append(dict(label='Median of eight', value=sh(median(ratios)), tone='signal'))
    per_race = {f"r_{city.lower().replace(' ', '_')}": sh(r) for city, r in zip(EIGHT, ratios)}
    ratios = np.array(ratios)
    n = int(sum(((c.edition == e) & (c.gender == 1)).sum() for city in EIGHT
                for e in np.flatnonzero((c.ed_city == city) & (c.ed_n >= 1000) & ~c.gender_gap_edition)))
    eds = int(sum(len(r[1]) for r in races))
    return dict(
        values=dict(ratio=sh(median(ratios)), min_ratio=sh(ratios.min()), rose=int((ratios > 1).sum()), races=len(EIGHT),
                    p1=sh(median(early)), p2=sh(median(late)), n_min=int(n_min), **per_race),
        plot=dict(form='bars', rows=bars, fmt='ratio',
                  x=dict(min=0, max=2.5, fmt='ratio', ticks=[0, 1, 2]),
                  ref=dict(axis='x', value=1, label='2013–19 level')),
        cohort_n=n, editions_n=eds, weighting='editions-equal',
        method=('Men’s finishes under 3:00 as a share of men’s finishes in eight races, every edition of 1,000+ finishes '
                'without a gender-recording gap; each race’s 2022–25 mean share (editions equal) over its 2013–19 mean, '
                'then the median over the eight races. Entry rules differ by race, so it describes who finished, not why.'),
    )


@chart('slowdowns-run-in-streaks')
def slowdowns_run_in_streaks(c):
    """The fourth linked finish's slowdown share by how many of the first three had one."""
    F = first_k(c, 4, True)
    s = c.slow[F]
    k = s[:, :3].sum(1)
    shares = []
    for j in range(4):
        m = k == j
        require_cell(m.sum(), f'{j} of 3')
        shares.append(sh(s[m, 3].mean()))
    tones = ['ink', 'quiet', 'quiet', 'signal']
    cols = [dict(label=f'{j} of 3', value=shares[j], tone=tones[j]) for j in range(4)]
    return dict(
        values=dict(none=shares[0], one=shares[1], two=shares[2], three=shares[3], n3=int((k == 3).sum()), records=int(len(F))),
        plot=dict(form='columns', cols=cols, fmt='share', values='all',
                  y=dict(min=0, max=0.8, fmt='share', ticks=[0, 0.2, 0.4, 0.6, 0.8], title='4th finish with a sustained slowdown')),
        cohort_n=int(len(F)), editions_n=int(len(np.unique(c.edition[F]))), weighting='pooled',
        method=(f'Records linked by name with four or more finishes in start-screened editions ({count_phrase(len(F), "record")}): '
                'their first four in race-date order, the fourth finish’s sustained-slowdown share by how many of the first three had one. '
                'Linked records are not verified people.'),
    )


FIFTHS = ['Quickest', '2nd', 'Middle', '4th', 'Slowest']


@chart('place-in-the-field-sticks')
def place_in_the_field_sticks(c):
    """Consecutive linked finishes: the fifth of its race each one finished in."""
    order, starts, counts = sequences(c, False)
    same = c.profile[order[1:]] == c.profile[order[:-1]]
    a, b = order[:-1][same], order[1:][same]
    rank = edition_ranks(c.finish, c.edition)
    q = np.minimum(4, np.floor(rank * 5)).astype(int)
    M = np.zeros((5, 5), dtype=np.int64)
    np.add.at(M, (q[a], q[b]), 1)
    total = int(M.sum())
    rows = M / M.sum(1, keepdims=True)
    cells = [[sh(rows[i, j]) for j in range(5)] for i in range(5)]
    return dict(
        values=dict(front=sh(rows[0, 0]), back=sh(rows[4, 4]), middle=sh(rows[2, 2]), cross=sh(rows[0, 4]),
                    same=sh(np.trace(M) / total), pairs=total),
        plot=dict(form='heatmap', rows=FIFTHS, cols=FIFTHS, cells=cells, fmt='share', domain=[0, 0.75], values=True,
                  highlight=[[0, 0]], rowTitle='This finish', colTitle='Next finish'),
        cohort_n=total, editions_n=int(len(np.unique(c.edition[np.r_[a, b]]))), weighting='pairs',
        method=(f'Consecutive finishes of records linked by name in race-date order ({count_phrase(total, "pair")} of finishes); '
                'each finish’s fifth of its race’s complete finishes by finish time, as a share of the pairs starting in that fifth.'),
    )


@chart('fields-halved-in-2021')
def fields_halved_in_2021(c):
    """Finishes in 2021 and in the latest edition against 2019, race by race."""
    raw = raw_counts(c)
    kept, dropped = [], []
    for city in c.cities:
        es = {int(c.ed_year[e]): int(e) for e in np.flatnonzero((c.ed_city == city) & (c.ed_n > 0))}
        if 2019 not in es or 2021 not in es:
            continue
        trio = (es[2019], es[2021], es[max(es)])
        ret = [c.ed_n[e] / raw[e] for e in trio]
        (kept if max(ret) - min(ret) <= RETENTION_SPREAD else dropped).append((str(city), trio))
    if len(kept) < 3:
        raise ValueError(f'too few races with steady 2019, 2021 and latest editions ({len(kept)})')
    rows, n = [], 0
    for city, (e19, e21, eL) in kept:
        for e in (e19, e21, eL):
            require_cell(c.ed_n[e], c.label(e))
        n += int(c.ed_n[e19] + c.ed_n[e21] + c.ed_n[eL])
        rows.append(dict(label=f'{city} ’{int(c.ed_year[eL]) % 100:02d}', a=sh(c.ed_n[e21] / c.ed_n[e19]),
                         b=sh(c.ed_n[eL] / c.ed_n[e19]), size=int(c.ed_n[e19])))
    a = np.array([r['a'] for r in rows])
    b = np.array([r['b'] for r in rows])
    ny_row = next((r for r in rows if r['label'].startswith('New York ')), None)
    if ny_row is None:
        raise ValueError('no steady New York 2019, 2021 and latest editions')
    drawn = sorted(rows, key=lambda r: -r['size'])[:DUMBBELL_ROWS]
    if ny_row not in drawn:
        raise ValueError(f'no New York row among the {DUMBBELL_ROWS} largest steady races')
    drawn.sort(key=lambda r: -r['b'])
    ny = drawn.index(ny_row)
    for i, r in enumerate(drawn):
        r['tone'] = 'signal' if i == ny else 'quiet'
        del r['size']
    ny_year = int(c.ed_year[next(t[2] for city, t in kept if city == 'New York')])
    left_out = ', '.join(city for city, _ in dropped) or 'none'
    return dict(
        values=dict(med=sh(median(a)), bigger=int((b > 1).sum()), races=len(rows), low=sh(a.min()), high21=sh(a.max()), high=sh(b.max()),
                    med_latest=sh(median(b)),
                    ny21=ny_row['a'], ny_latest=ny_row['b'], ny_year=ny_year),
        plot=dict(form='dumbbell', rows=drawn, fmt='share', a='2021', b='Latest', arrow=True,
                  x=dict(min=0, max=2.5, fmt='share', ticks=[1, 2]),
                  ref=dict(axis='x', value=1, label='2019 level', tone='quiet'),
                  notes=[dict(row=ny, x=ny_row['a'], text='{v}', value=ny_row['a'], fmt='share', tone='signal', dx=-10, dy=5, anchor='end'),
                         dict(row=ny, x=ny_row['b'], text='{v}', value=ny_row['b'], fmt='share', tone='ink', dx=12, dy=5, anchor='start')]),
        cohort_n=n, editions_n=3 * len(rows), weighting='editions-equal',
        method=('Complete finishes in each race’s 2021 and latest edition as a share of its 2019 finishes, in the races with '
                '2019 and 2021 editions whose eligible share of records moved under 5 points across the three editions '
                f'(left out: {left_out}).'),
    )


@chart('even-pacing-rose-since-2019')
def even_pacing_rose_since_2019(c):
    """Even-paced finishes in eight fixed races, 2013–19 mean against 2022–25 mean."""
    p8 = c.paces[:, :8]
    # 1e-9 settles exact-boundary finishes the same way whatever the summation order.
    metro = (np.abs(p8 / p8.mean(1)[:, None] - 1) <= 0.03 + 1e-9).all(1)
    rows, n, eds = [], 0, 0
    for city in EIGHT:
        a, b = [], []
        for e in np.flatnonzero(c.ed_city == city):
            m = (c.edition == e) & c.shape_keep
            if m.sum() < 1000:
                continue
            y = int(c.ed_year[e])
            if in_period(y, EARLY):
                a.append(metro[m].mean())
            elif in_period(y, LATE):
                b.append(metro[m].mean())
            else:
                continue
            n += int(m.sum())
            eds += 1
        if not a or not b:
            raise ValueError(f'{city}: no 2013–19 and 2022–25 editions with 1,000+ start-screened finishes')
        rows.append(dict(label=city, a=sh(np.mean(a)), b=sh(np.mean(b))))
    rows.sort(key=lambda r: -(r['b'] - r['a']))
    for r in rows:
        r['tone'] = 'signal' if r['label'] == 'Amsterdam' else 'quiet'
    ai = next(i for i, r in enumerate(rows) if r['label'] == 'Amsterdam')
    am = rows[ai]
    up = sum(1 for r in rows if r['b'] > r['a'])
    return dict(
        values=dict(up=int(up), races=len(rows), a0=am['a'], a1=am['b']),
        plot=dict(form='dumbbell', rows=rows, fmt='share1', a='2013–19', b='2022–25', arrow=True,
                  x=dict(min=0, max=0.2, fmt='share', ticks=[0, 0.1, 0.2]),
                  notes=[dict(row=ai, x=am['a'], text='{v}', value=am['a'], fmt='share', tone='quiet', dx=-16, dy=5, anchor='end'),
                         dict(row=ai, x=am['b'], text='{v}', value=am['b'], fmt='share', tone='signal', dx=12, dy=5, anchor='start')]),
        cohort_n=n, editions_n=eds, weighting='editions-equal',
        method=('Finishes whose eight full 5 km sections all sit within 3% of their mean 5 km pace, in start-screened editions of '
                '1,000+ screened finishes of eight races; each race’s mean share over its 2013–19 and its 2022–25 editions.'),
    )


@chart('quicker-every-time')
def quicker_every_time(c):
    """Linked records with five or more finishes: did the first five get quicker (or slower) every time?"""
    F = c.finish[first_k(c, 5, False)]
    d = np.diff(F, axis=1)
    dec, inc = float((d < 0).all(1).mean()), float((d > 0).all(1).mean())
    null = 1 / 120
    records = int(len(F))
    return dict(
        values=dict(dec=sh(dec), inc=sh(inc), null=sh(null), vs_random=sh(dec / null), vs_random_inc=sh(inc / null),
                    records=records),
        plot=dict(form='big', value=sh(dec / null), fmt='ratio',
                  caption='as often as a random order would give',
                  compare=[dict(label='Quicker', value=sh(dec), tone='signal'),
                           dict(label='Random order', value=sh(null), tone='ink')],
                  compareFmt='share1'),
        cohort_n=records, editions_n=int(len(np.unique(c.edition[first_k(c, 5, False)]))), weighting='pooled',
        method=(f'Records linked by name with five or more finishes ({count_phrase(records, "record")}): their first five in race-date '
                'order, each finish time against the one before; a shuffled order would give one in 120 for either.'),
    )


@chart('womens-share-rose-in-most-races')
def womens_share_rose_in_most_races(c):
    """Women's share of finishes in each race's earliest and latest edition here (10+ years apart)."""
    raw = raw_counts(c)
    share, size = {}, {}
    for e in np.flatnonzero(c.ed_n >= 1000):
        if c.gender_gap_edition[e] or c.ed_n[e] / raw[e] < MIN_RETENTION:
            continue
        g = c.gender[c.edition == e]
        if (g == 0).mean() > 0.02:
            continue
        men, women = int((g == 1).sum()), int((g == 2).sum())
        share[e] = women / (men + women)
        size[e] = men + women
    races = []
    for city in sorted({str(c.ed_city[e]) for e in share}):
        es = sorted((e for e in share if c.ed_city[e] == city), key=lambda e: c.ed_year[e])
        if c.ed_year[es[-1]] - c.ed_year[es[0]] < 10:
            continue
        races.append(dict(city=city, first=es[0], last=es[-1], total=sum(size[e] for e in es)))
    if len(races) < 3:
        raise ValueError(f'too few races with editions of 1,000+ finishes ten or more years apart ({len(races)})')
    up = sum(1 for r in races if share[r['last']] > share[r['first']])
    shown = sorted(races, key=lambda r: -r['total'])[:8]
    if not any(r['city'] == EXAMPLE for r in shown):
        raise ValueError(f'no {EXAMPLE} editions among the drawn races')
    shown.sort(key=lambda r: -(share[r['last']] - share[r['first']]))
    rows = []
    for r in shown:
        f, l = r['first'], r['last']
        for e in (f, l):
            require_cell(size[e], c.label(e))
        tone = 'signal' if r['city'] == EXAMPLE else 'quiet'
        label = f"{r['city']} ’{int(c.ed_year[f]) % 100:02d}–’{int(c.ed_year[l]) % 100:02d}"
        rows.append(dict(label=label, a=sh(share[f]), b=sh(share[l]), tone=tone))
    ex = next(r for r in races if r['city'] == EXAMPLE)
    bi = next(i for i, r in enumerate(shown) if r['city'] == EXAMPLE)
    n = int(sum(size[e] for e in share))
    # A drawn race whose share fell gets its change printed left of the start circle: a short leftward arrow hides under it.
    falls, fell = [], {}
    for i, r in enumerate(rows):
        if r['b'] < r['a']:
            if i == bi:
                raise ValueError(f'{EXAMPLE} share fell; its notes would collide')
            g = sh(r['b'] - r['a'])
            fell[f"fell_{shown[i]['city'].lower().replace(' ', '_')}"] = g
            falls.append(dict(row=i, x=r['b'], text='{v}', value=g, fmt='dpts', tone='quiet', dx=-12, dy=5, anchor='end'))
    return dict(
        values=dict(up=int(up), races=len(races), c0=sh(share[ex['first']]), c1=sh(share[ex['last']]),
                    c0_year=int(c.ed_year[ex['first']]), c1_year=int(c.ed_year[ex['last']]), fell_drawn=len(falls), **fell),
        plot=dict(form='dumbbell', rows=rows, fmt='share', a='Earliest', b='Latest', arrow=True,
                  x=dict(min=0, max=0.5, fmt='share', ticks=[0.25, 0.5]),
                  notes=[dict(row=bi, x=share[ex['first']], text='{v}', value=sh(share[ex['first']]), fmt='share', tone='quiet', dx=-10, dy=5, anchor='end'),
                         dict(row=bi, x=share[ex['last']], text='{v}', value=sh(share[ex['last']]), fmt='share', tone='signal', dx=12, dy=5, anchor='start')]
                  + falls),
        cohort_n=n, editions_n=len(share), weighting='editions-equal',
        method=('Women’s share of recorded men’s and women’s finishes in each race’s earliest and latest edition of 1,000+ finishes, '
                'races whose editions span ten years or more; editions with gender-recording gaps, over 2% unrecorded gender or '
                'under 80% of records retained are left out. The eight races with the most finishes are drawn; '
                'the earliest edition is the first that passes these rules, not the race’s first edition.'),
    )


@chart('five-races-in-same-share')
def five_races_in_same_share(c):
    """Sustained slowdown share at each of the first five linked finishes of records with five or more."""
    F = first_k(c, 5, True)
    s = c.slow[F].mean(0)
    pts = [[j, sh(s[j])] for j in range(5)]
    records = int(len(F))
    return dict(
        values=dict(first=sh(s[0]), fifth=sh(s[4]), n=records, low=sh(s.min()), high=sh(s.max())),
        plot=dict(form='lines', series=[dict(label='Same records', points=pts, tone='signal', dots=True, labelAt='none')],
                  x=dict(min=-0.7, max=4.3, fmt='int', cats=['1st', '2nd', '3rd', '4th', '5th'], ticks=[0, 1, 2, 3, 4], title='Linked finish'),
                  y=dict(min=0, max=0.4, fmt='share', ticks=[0, 0.1, 0.2, 0.3, 0.4]),
                  notes=[dict(x=0, y=pts[0][1], text='{v}', value=pts[0][1], fmt='share1', tone='ink', dy=-12),
                         dict(x=4, y=pts[4][1], text='{v}', value=pts[4][1], fmt='share1', tone='signal', dy=-12, anchor='end')]),
        cohort_n=records, editions_n=int(len(np.unique(c.edition[F]))), weighting='pooled',
        method=(f'Records linked by name with five or more finishes in start-screened editions ({count_phrase(records, "record")}): '
                'the sustained-slowdown share at each of their first five finishes in race-date order, the same records in every column.'),
    )


@chart('new-york-got-younger')
def new_york_got_younger(c):
    """New York finishes with an exact recorded age: the under-30 and 60+ shares by year."""
    gran = set(int(e) for e in c.granular_age_editions)
    under, over, n = [], [], 0
    for e in sorted(np.flatnonzero((c.ed_city == 'New York') & (c.ed_n > 0)), key=lambda e: c.ed_year[e]):
        if int(e) not in gran:
            continue
        m = (c.edition == e) & c.exact_age_ok
        k = require_cell(m.sum(), c.label(e))
        n += k
        a = c.exact_age[m]
        y = int(c.ed_year[e])
        under.append([y, sh((a < 30).mean())])
        over.append([y, sh((a >= 60).mean())])
    u = dict(under)
    o = dict(over)
    hi_early = max(v for y, v in under if y <= 2019)
    return dict(
        values=dict(u06=u[2006], u25=u[2025], o06=o[2006], o25=o[2025], hi_early=hi_early),
        plot=dict(form='lines',
                  series=[dict(label='Under 30', points=under, tone='signal', dots=True),
                          dict(label='60+', points=over, tone='ink', dots=True)],
                  x=dict(min=2005.5, max=2025.5, fmt='year', ticks=[2006, 2010, 2015, 2019, 2025]),
                  y=dict(min=0, max=0.26, fmt='share', ticks=[0, 0.1, 0.2]),
                  notes=[dict(x=2006, y=u[2006], text='{v}', value=u[2006], fmt='share', tone='signal', dy=-12, anchor='start'),
                         dict(x=2006, y=o[2006], text='{v}', value=o[2006], fmt='share', tone='ink', dy=-12, anchor='start'),
                         dict(x=2025, y=u[2025], text='{v}', value=u[2025], fmt='share', tone='signal', dy=-12, anchor='end'),
                         dict(x=2025, y=o[2025], text='{v}', value=o[2025], fmt='share', tone='ink', dy=26, anchor='end')]),
        cohort_n=n, editions_n=len(under), weighting='editions-equal',
        method='New York finishes with an exact recorded age, edition by edition: the shares recorded under 30 and at 60 or older.',
    )
