"""Top 100 charts, finish times (second batch; analysis/build_charts.py). Each builder takes the ChartCohort and
returns its values, its chart spec, its cohort size, its weighting and a method line."""
import datetime
import math

import numpy as np

from charts_common import MIN_CELL, count_phrase, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


def minute_label(minutes):
    """Whole minutes as h:mm: 190 → "3:10"."""
    return f'{minutes // 60}:{minutes % 60:02d}'


def minute_counts(finish):
    return np.bincount(np.floor(finish / 60).astype(np.int64), minlength=721).astype(float)


def step(counts, k):
    """The step across minute boundary k (between minute k − 1 and minute k): the ratio of the two minutes' finishes,
    over the geometric mean of the same ratio one and two minutes either side, so the local slope is removed."""
    local = (counts[k - 1] / counts[k]) / math.sqrt((counts[k - 3] / counts[k - 2]) * (counts[k + 1] / counts[k + 2]))
    return float(local)


def finishes(n):
    return f'{int(n):,} finishes'


def clock(seconds):
    s = int(round(seconds))
    return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}'


def edition_order(c, eds):
    return sorted(eds, key=lambda e: (int(c.ed_year[e]), e))


# ---------------------------------------------------------------------------------------------------------------------
MARKS = [180, 210, 240, 270, 300]


@chart('men-bunch-at-round-marks')
def men_bunch_at_round_marks(c):
    """Each gender's finishes in the minute before each hour and half-hour mark from 3:00 to 5:00, over the minute after
    (gender-recording-gap editions left out)."""
    ok = ~c.gender_gap_edition[c.edition]
    men, women = (c.gender == 1) & ok, (c.gender == 2) & ok
    cm, cw = minute_counts(c.finish[men]), minute_counts(c.finish[women])
    used = [cnt[k + d] for cnt in (cm, cw) for k in MARKS for d in (-1, 0)]
    n_min = int(min(used))
    require_cell(n_min, 'smallest one-minute count')
    rows = []
    for k in MARKS:
        a, b = sh(cw[k - 1] / cw[k]), sh(cm[k - 1] / cm[k])
        rows.append(dict(label=minute_label(k), a=a, b=b, tone='signal' if k == 180 else 'quiet'))
    values = dict(men=rows[0]['b'], women=rows[0]['a'], men4=rows[2]['b'], women4=rows[2]['a'], n_min=n_min)
    n = int((men | women).sum())
    return dict(
        values=values,
        plot=dict(form='dumbbell', rows=rows, fmt='ratio2', a="women's", b="men's",
                  x=dict(min=0.9, max=1.9, fmt='ratio', ticks=[1, 1.5], title='minute before the mark over the minute after'),
                  ref=dict(axis='x', value=1, label='no bunching', tone='quiet')),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[men | women]))), weighting='pooled',
        method=f'Men\'s and women\'s finishes outside the {int(c.gender_gap_edition.sum())} gender-recording-gap editions ({finishes(n)}), counted by whole finish minute: at each mark, the finishes in the minute before over the minute after, within each gender.',
    )


# ---------------------------------------------------------------------------------------------------------------------
@chart('mens-median-on-the-mark')
def mens_median_on_the_mark(c):
    """The pooled men's finishes either side of 4:00, against all finishes, outside the gender-recording-gap editions."""
    ok = ~c.gender_gap_edition[c.edition]
    men = (c.gender == 1) & ok
    require_cell(men.sum(), 'men')
    m, a = sec(median(c.finish[men])), sec(median(c.finish[ok]))
    eq = []
    for e in range(len(c.editions)):
        me = men & (c.edition == e)
        if me.sum() >= MIN_CELL:
            eq.append(median(c.finish[me]))
    values = dict(men=m, all=a, men_eq=sec(median(eq)), men_under4=sh(float((c.finish[men] < 14400).mean())),
                  all_under4=sh(float((c.finish[ok] < 14400).mean())))
    n = int(ok.sum())
    gaps = int(c.gender_gap_edition[np.unique(c.edition)].sum())
    return dict(
        values=values,
        plot=dict(form='big', value=values['men_under4'], fmt='share1', caption="men's finishes under 4:00",
                  compare=[dict(label="Men's", value=values['men_under4'], tone='signal'), dict(label='All finishes', value=values['all_under4'], tone='ink')], compareFmt='share1'),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[ok]))), weighting='pooled',
        method=f'Every eligible finish outside the {gaps} gender-recording-gap editions ({finishes(n)}), pooled: the share of men\'s finishes, and of all finishes, under 4:00. The pooled median men\'s finish is {clock(m)} and the median over editions of each edition\'s men\'s median ({len(eq)} editions with 100+ men\'s finishes) is {clock(median(eq))}.',
    )


# ---------------------------------------------------------------------------------------------------------------------
PCTS = [(0.99, 'Slowest 1%'), (0.01, 'Quickest 1%'), (0.90, 'Slowest 10%'), (0.10, 'Quickest 10%'), (0.75, 'Slowest 25%'), (0.25, 'Quickest 25%')]


@chart('long-back-of-the-field')
def long_back_of_the_field(c):
    """Within each edition of 2,000+ finishes, how far each percentile sits from that edition's median; the typical
    edition (the median over editions) of each distance."""
    eds = [e for e in range(len(c.editions)) if c.ed_n[e] >= 20 * MIN_CELL]
    if not eds:
        raise ValueError('no edition with at least 2,000 finishes')
    dist = {p: [] for p, _ in PCTS}
    longer = 0
    for e in eds:
        f = c.finish[c.edition == e]
        m = quantile(f, 0.5)
        for p, _ in PCTS:
            dist[p].append(abs(quantile(f, p) - m))
        longer += int(quantile(f, 0.99) - m > m - quantile(f, 0.01))
    rows = [dict(label=label, value=sec(median(dist[p])), tone='signal' if p == 0.99 else 'ink' if p == 0.01 else 'quiet') for p, label in PCTS]
    values = dict(back=rows[0]['value'], front=rows[1]['value'], eds_back_longer=longer, eds=len(eds))
    n = int(sum(int(c.ed_n[e]) for e in eds))
    return dict(
        values=values,
        plot=dict(form='bars', rows=rows, fmt='mins', x=dict(min=0, max=7200, fmt='mins'),
                  ref=dict(axis='x', value=0, tone='quiet', label='minutes from the median')),
        cohort_n=n, editions_n=len(eds), weighting='editions-equal',
        method=f'Each edition with at least 2,000 finishes ({len(eds)} editions, {finishes(n)}): the distance of its 1st, 10th, 25th, 75th, 90th and 99th percentile finishes from its own median, and the median of each distance over those editions; in {longer} of the {len(eds)} editions the 99th percentile sat further from the median than the 1st. Course cut-offs bound the far tail.',
    )


# ---------------------------------------------------------------------------------------------------------------------
@chart('even-ten-minute-marks')
def even_ten_minute_marks(c):
    """The local step across the ten-minute marks from 2:40 to 3:50 and from 4:10 to 5:50 (hours and half hours left
    to the round-mark cards)."""
    counts = minute_counts(c.finish)
    require_cell(min(counts[157:242]), 'smallest one-minute count')
    require_cell(min(counts[247:353]), 'smallest one-minute count, 4:10 to 5:50')
    early = [dict(v=sh(step(counts, k)), k=k) for k in range(160, 240, 10) if k % 30]
    late = [dict(v=sh(step(counts, k)), k=k) for k in range(250, 351, 10) if k % 30]
    mean = lambda xs: sh(float(np.mean([d['v'] for d in xs])))
    values = dict(ten=mean(early), ten_late=mean(late), at310=sh(step(counts, 190)))
    dots = lambda xs, tone: [dict(v=d['v'], tone=tone) for d in xs]
    groups = [dict(label='Marks from 4:10 to 5:50', dots=dots(late, 'ink')),
              dict(label='Marks from 2:40 to 3:50', dots=dots(early, 'signal'))]
    return dict(
        values=values,
        plot=dict(form='strip', groups=groups, x=dict(min=0.9, max=1.6, fmt='ratio2', ticks=[1, 1.2, 1.4], title='drop across the mark, against nearby minutes'),
                  refs=[dict(axis='x', value=1, tone='quiet')],
                  notes=[dict(x=values['at310'], row=len(groups) - 1, text='3:10', tone='signal', anchor='middle', dy=19),
                         dict(x=max(d['v'] for d in early) + 0.02, row=len(groups) - 1, text='average {v}', value=values['ten'],
                              fmt='ratio2', tone='signal', anchor='start', dy=5),
                         dict(x=max(d['v'] for d in late) + 0.02, row=len(groups) - 2, text='average {v}', value=values['ten_late'],
                              fmt='ratio2', tone='ink', anchor='start', dy=5)]),
        cohort_n=int(c.n), editions_n=int(len(np.unique(c.edition))), weighting='pooled',
        method=f'Every eligible finish ({finishes(c.n)}) counted by whole finish minute: across each ten-minute mark from 2:40 to 3:50 and from 4:10 to 5:50 other than the hours and half hours, the finishes in the minute before over the minute after, divided by the same ratio one and two minutes either side (geometric mean).',
    )


# ---------------------------------------------------------------------------------------------------------------------
@chart('fields-stretching-out')
def fields_stretching_out(c):
    """Each long-running race: the 10th-to-90th percentile span of its first and last three editions of 3,000+."""
    rows, windows = [], []
    for cn in c.cities:
        eds = edition_order(c, [e for e in range(len(c.editions)) if c.ed_city[e] == cn and c.ed_n[e] >= 30 * MIN_CELL])
        if len(eds) < 6 or int(c.ed_year[eds[-1]]) - int(c.ed_year[eds[0]]) < 8:
            continue
        span = []
        for e in eds:
            f = c.finish[c.edition == e]
            span.append(quantile(f, 0.9) - quantile(f, 0.1))
        a, b = float(np.mean(span[:3])), float(np.mean(span[-3:]))
        yy = lambda e: f'{int(c.ed_year[e]) % 100:02d}'
        rows.append(dict(label=f'{cn} ’{yy(eds[0])}–{yy(eds[-1])}', city=cn, a=a, b=b))
        windows.append(f'{cn} {c.ed_year[eds[0]]}–{c.ed_year[eds[2]]} against {c.ed_year[eds[-3]]}–{c.ed_year[eds[-1]]}')
    if not any(r['city'] == 'Berlin' for r in rows):
        raise ValueError('no Berlin among the long-running races')
    rows.sort(key=lambda r: (-(r['b'] - r['a']), r['label']))
    for r in rows:
        r['tone'] = 'signal' if r['city'] == 'Berlin' else 'quiet'
    berlin = next(r for r in rows if r['city'] == 'Berlin')
    values = dict(n_wider=sum(1 for r in rows if r['b'] > r['a']), races=len(rows), berlin=sec(berlin['b'] - berlin['a']),
                  berlin_first=sec(berlin['a']), berlin_last=sec(berlin['b']), min_change=sec(min(r['b'] - r['a'] for r in rows)),
                  max_change=sec(max(r['b'] - r['a'] for r in rows)))
    cities = [r.pop('city') for r in rows]
    rows = [dict(label=r['label'], value=sec(r['b'] - r['a']), tone=r['tone']) for r in rows]
    eds_all = [e for e in range(len(c.editions)) if c.ed_city[e] in cities and c.ed_n[e] >= 30 * MIN_CELL]
    n = int(sum(int(c.ed_n[e]) for e in eds_all))
    return dict(
        values=values,
        plot=dict(form='bars', rows=rows, fmt='dmins', x=dict(min=0, max=2400, fmt='dmins', ticks=[0, 600, 1200, 1800])),
        cohort_n=n, editions_n=len(eds_all), weighting='editions-equal',
        method=f'Races with at least six editions of 3,000+ finishes spanning eight or more years ({len(rows)} races, {len(eds_all)} editions): the gap between the 10th and 90th percentile finish, averaged over the first three and the last three such editions ({"; ".join(windows)}).',
    )


# ---------------------------------------------------------------------------------------------------------------------
@chart('one-hour-holds-half')
def one_hour_holds_half(c):
    """The 60-minute window (whole-minute starts from 2:00 to 6:00) that holds the most finishes, over the histogram of
    every finish in two-minute bins."""
    s = np.sort(c.finish)
    best, start = -1, None
    for m in range(120, 361):
        k = int(np.searchsorted(s, (m + 60) * 60, 'left') - np.searchsorted(s, m * 60, 'left'))
        if k > best:
            best, start = k, m
    if start % 2:
        raise ValueError('the busiest hour does not start on a two-minute bin edge')
    before = int(np.searchsorted(s, start * 60, 'left'))
    after = int(c.n - before - best)
    values = dict(share=sh(best / c.n), start=start * 60, end=(start + 60) * 60, before=sh(before / c.n), after=sh(after / c.n))
    counts = minute_counts(c.finish)
    bins = [dict(x0=m * 60, x1=(m + 2) * 60, v=int(counts[m] + counts[m + 1]), tone='signal' if start <= m < start + 60 else 'quiet')
            for m in range(120, 420, 2)]
    peak = max(b['v'] for b in bins)
    return dict(
        values=values,
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=7200, max=25200, fmt='hm', ticks=[7200, 10800, 14400, 18000, 21600, 25200]),
                  y=dict(min=0, max=100000, fmt='count', ticks=[0, 25000, 50000, 75000], title='finishes'),
                  notes=[dict(x=(start + 30) * 60, y=peak, text='{v} in one hour', value=values['share'], fmt='share', tone='signal', dy=-12)]),
        cohort_n=int(c.n), editions_n=int(len(np.unique(c.edition))), weighting='pooled',
        method=f'Every eligible finish ({finishes(c.n)}), pooled, in two-minute bins of whole finish minutes from 2:00 to 7:00: of the 60-minute windows starting on a whole minute from 2:00 to 6:00, the one that holds the most finishes is lit.',
    )


# ---------------------------------------------------------------------------------------------------------------------
# Pairs are banded by the mean of their two finish times (not by the first), so neither group has regression to the
# mean built in: two finishes of one record that swap order land in the same band.
DOUBLE_BANDS = [(0, 12600, 'Under 3:30'), (12600, 14400, '3:30–4:00'), (14400, 16200, '4:00–4:30'), (16200, 18000, '4:30–5:00'),
                (18000, 10 ** 6, '5:00+')]
DOUBLE_DAYS, YEAR_DAYS = (1, 21), (301, 430)
MIN_RACE_PAIR = 10  # year-on pairs a race pair needs within a band to set the comparator for that band's doubles


def race_day(c):
    """Each finish's race date (days since 2000-01-01), from the pinned weather evidence."""
    if c.weather is None:
        raise ValueError('no weather evidence: race dates are missing')
    by = {(row['city'], row['year']): row.get('date') for row in c.weather['editions']}
    days = np.full(len(c.editions), -1, np.int64)
    for e, ed in enumerate(c.editions):
        d = by.get((ed['city'], ed['year']))
        if d:
            days[e] = (datetime.date.fromisoformat(d) - datetime.date(2000, 1, 1)).days
    if (days[c.ed_n > 0] < 0).any():
        raise ValueError('an edition with finishes has no race date')
    return days[c.edition]


@chart('quick-double-mostly-slower')
def quick_double_mostly_slower(c):
    """Consecutive finishes of one linked record (race-date order): doubles 1–21 days apart at two different races,
    against pairs 301–430 days apart at the same ordered race pair, reweighted to the doubles' race-pair mix within each
    band of the pair's mean finish time. The share of pairs whose second finish was quicker."""
    day = race_day(c)
    order = np.lexsort((np.arange(c.n), c.edition, day, c.profile))
    same = c.profile[order[1:]] == c.profile[order[:-1]]
    a, b = order[:-1][same], order[1:][same]
    gap = day[b] - day[a]
    ca, cb = c.city[a], c.city[b]
    quicker = c.finish[b] < c.finish[a]
    mean = (c.finish[a] + c.finish[b]) / 2
    dbl = (gap >= DOUBLE_DAYS[0]) & (gap <= DOUBLE_DAYS[1]) & (ca != cb)
    yr = (gap >= YEAR_DAYS[0]) & (gap <= YEAR_DAYS[1])
    pair_key = ca.astype(np.int64) * len(c.cities) + cb
    used_d, used_y = np.zeros(len(a), bool), np.zeros(len(a), bool)
    rows, sizes = [], []
    for lo, hi, label in DOUBLE_BANDS:
        band = (mean >= lo) & (mean < hi)
        d_keys, d_n = np.unique(pair_key[dbl & band], return_counts=True)
        kept, share_y, n_y = [], 0.0, 0
        for k, nd in zip(d_keys.tolist(), d_n.tolist()):
            ym = yr & band & (pair_key == k)
            if ym.sum() >= MIN_RACE_PAIR:
                kept.append((k, nd, float(quicker[ym].mean())))
                used_y |= ym
                n_y += int(ym.sum())
        dm = dbl & band & np.isin(pair_key, [k for k, _, _ in kept])
        used_d |= dm
        nd = require_cell(dm.sum(), f'doubles {label}')
        require_cell(n_y, f'year-on pairs {label}')
        share_y = sum(w * q for _, w, q in kept) / nd
        rows.append(dict(label=label, a=sh(share_y), b=sh(quicker[dm].mean()), tone='signal' if lo == 0 else 'quiet'))
        sizes.append((nd, n_y))
    gaps = [r['a'] - r['b'] for r in rows]
    values = dict(dbl=rows[0]['b'], yr=rows[0]['a'], n_dbl=int(sizes[0][0]), n_yr=int(sizes[0][1]),
                  slower_dbl=sh((c.finish[b] > c.finish[a])[used_d & (mean < DOUBLE_BANDS[0][1])].mean()),
                  gap_top=sh(gaps[0]), gap_max_rest=sh(max(abs(g) for g in gaps[1:])), gap_back=sh(gaps[-1]),
                  min_pairs=int(min(min(s) for s in sizes)), pairs_dbl=int(used_d.sum()), pairs_yr=int(used_y.sum()))
    # Context for the method line: the main race pairs of the doubles, and how noisy each kind of pair is.
    keys, counts = np.unique(pair_key[used_d], return_counts=True)
    top = sorted(zip(counts.tolist(), keys.tolist()), key=lambda t: (-t[0], t[1]))[:4]
    names = [f'{c.cities[k // len(c.cities)]} then {c.cities[k % len(c.cities)]}' for _, k in top]
    top_band = mean < DOUBLE_BANDS[0][1]
    wide = np.abs(c.finish[b] / c.finish[a] - 1) > 0.1
    wide_share = lambda m: float(wide[m & top_band].mean())  # noqa: E731
    used = np.zeros(c.n, bool)
    used[a[used_d | used_y]] = used[b[used_d | used_y]] = True
    return dict(
        values=values,
        plot=dict(form='dumbbell', rows=rows, fmt='share', a='A year on', b='Within three weeks',
                  x=dict(min=0.3, max=0.75, fmt='share', ticks=[0.4, 0.5, 0.6, 0.7], title='of pairs, the second finish quicker'),
                  ref=dict(axis='x', value=0.5, label='half', tone='quiet'),
                  notes=[dict(x=rows[0]['b'], row=0, text='{v}', value=rows[0]['b'], fmt='share', tone='signal', anchor='end', dx=-11, dy=5),
                         dict(x=rows[0]['a'], row=0, text='{v}', value=rows[0]['a'], fmt='share', tone='ink', anchor='start', dx=11, dy=5)]),
        cohort_n=int(used.sum()), editions_n=int(len(np.unique(c.edition[used]))), weighting='pairs',
        method=(f'Consecutive finishes of one record linked by name (a candidate, not a verified person), in race-date order from the '
                f'weather evidence: {count_phrase(values["pairs_dbl"], "double")} 1 to 21 days apart at two different races (mainly '
                f'{", ".join(names[:-1])} and {names[-1]}), against {count_phrase(values["pairs_yr"], "pair")} 301 to 430 days apart at the '
                f'same two races in the same order, reweighted within each band to the doubles\' mix of race pairs (race pairs with at '
                f'least {MIN_RACE_PAIR} such pairs in the band). Each pair is banded by the mean of its two finish times rather than the '
                f'first, so no regression to the mean is built into either group. Doubles are noisier pairs: under 3:30, the two finishes '
                f'differ by more than 10% in {wide_share(used_d):.0%} of doubles against {wide_share(used_y):.0%} of year-on pairs. The share of pairs whose second finish was quicker; ties '
                'count as not quicker.'),
    )
