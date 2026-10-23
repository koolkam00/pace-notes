"""Top 100 charts, courses and weather (analysis/build_charts.py).

Courses and weather. Weather is the reviewed edition-level row at the scheduled start (edition context, never a
personal exposure); climb is the supplied-route gain (context, never an adjustment). Pacing-shape statistics use only
the editions that pass the start-offset screen."""
from datetime import date
import math

import numpy as np

from charts_common import SECTIONS, count_phrase, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


def _editions_of(c, city):
    """Edition indices of a city that hold finishes, in index order."""
    return [int(e) for e in np.flatnonzero((c.ed_city == city) & (c.ed_n > 0))]


# ---------------------------------------------------------------------------------------------------------------------
# same-race-warmer-return
# (label, test on the rounded change in start temperature, °C, tone): the two ends and the middle of the change.
RETURN_BINS = [
    ('Much warmer', lambda d: d >= 6, 'signal'),
    ('About the same', lambda d: (d > -1) & (d < 1), 'quiet'),
    ('Much cooler', lambda d: d <= -6, 'quiet'),
]


def _edition_days(c):
    """Each edition's race date (days since 1970-01-01) from the weather evidence; NaN where it has none."""
    by = {(row['city'], row['year']): row.get('date') for row in c.weather['editions']}
    out = np.full(len(c.editions), np.nan)
    for e, ed in enumerate(c.editions):
        d = by.get((ed['city'], ed['year']))
        if d:
            out[e] = (date.fromisoformat(d) - date(1970, 1, 1)).days
    return out


def same_race_pairs(c):
    """Consecutive finishes of one linked record at the same race, in race-date order, 1–2 calendar years apart, both
    editions with a start temperature; same-day pairs dropped. Returns the earlier and later row of each pair."""
    days = _edition_days(c)
    d = days[c.edition]
    idx = np.arange(c.n)
    o = np.lexsort((idx, d, c.city, c.profile))
    p, ci, dd, y = c.profile[o], c.city[o], d[o], c.year[o]
    gap = y[1:].astype(int) - y[:-1].astype(int)
    keep = (p[1:] == p[:-1]) & (ci[1:] == ci[:-1]) & np.isfinite(dd[1:]) & np.isfinite(dd[:-1]) & (dd[1:] != dd[:-1]) & (gap >= 1) & (gap <= 2)
    a, b = o[:-1][keep], o[1:][keep]
    ok = np.isfinite(c.ed_temp_c[c.edition[a]]) & np.isfinite(c.ed_temp_c[c.edition[b]])
    return a[ok], b[ok]


@chart('same-race-warmer-return')
def same_race_warmer_return(c):
    """The same linked pairs by change in start temperature, both finishes in start-screened editions: the median change
    in each section's pace against the same record's previous visit. The reading is a shared start that fans out with
    every 5K; the much warmer line's 35–40K point is the accent, and each end group's finish change sits under its label."""
    a, b = same_race_pairs(c)
    screened = c.shape_keep[a] & c.shape_keep[b]
    a, b = a[screened], b[screened]
    n_pairs = require_cell(len(a), 'start-screened same-race pairs')
    ea, eb = c.edition[a], c.edition[b]
    dT = np.round(c.ed_temp_c[eb] - c.ed_temp_c[ea], 1)
    change = c.paces[b] / c.paces[a] - 1          # pairs × 9 sections
    fin = c.finish[b] / c.finish[a] - 1
    st, series = {}, []
    for label, test, tone in RETURN_BINS:
        m = test(dT)
        require_cell(m.sum(), f'pairs, {label}')
        med = [sh(median(change[m, k])) for k in range(9)]
        st[label] = dict(m=m, med=med, n=int(m.sum()), fin=sh(median(fin[m])),
                         ep=len(set(zip(ea[m].tolist(), eb[m].tolist()))), races=len(set(c.city[a][m].tolist())))
        series.append(dict(label=label, points=[[k, med[k]] for k in range(9)], tone=tone, dots=tone == 'signal'))
    warm, same, cool = st['Much warmer'], st['About the same'], st['Much cooler']
    # Robustness on much warmer returns: edition pairs holding 100+ pairs, and leaving out one edition pair at a time.
    mw = warm['m']
    keys = sorted(set(zip(ea[mw].tolist(), eb[mw].tolist())))
    big = late_gt = 0
    loo = []
    for x, y in keys:
        inside = mw & (ea == x) & (eb == y)
        if inside.sum() >= 100:
            big += 1
            late_gt += int(median(change[inside, 7]) > median(change[inside, 0]))
        loo.append(median(change[mw & ~inside, 7]))
    ys = [p for s in series for _, p in s['points']]
    hi = math.ceil((max(ys) + 0.012) / 0.01) * 0.01
    lo = math.floor((min(ys) - 0.01) / 0.01) * 0.01
    return dict(
        values=dict(warm_start=warm['med'][0], warm_late=warm['med'][7], same_start=same['med'][0], same_late=same['med'][7],
                    cool_start=cool['med'][0], cool_late=cool['med'][7], warm_finish=warm['fin'], cool_finish=cool['fin'],
                    same_finish=same['fin'], n_warm=warm['n'], n_same=same['n'], n_cool=cool['n'], ep_warm=warm['ep'],
                    ep_same=same['ep'], ep_cool=cool['ep'], races_warm=warm['races'], races_same=same['races'],
                    races_cool=cool['races'], ep_warm_100=big, ep_warm_late_gt=late_gt, loo_lo=sh(min(loo)), loo_hi=sh(max(loo)),
                    pairs=n_pairs),
        plot=dict(form='lines', series=series,
                  x=dict(min=-0.3, max=8.3, fmt='int', cats=list(SECTIONS), ticks=[0, 4, 7]),
                  y=dict(min=float(round(lo, 2)), max=float(round(hi, 2)), fmt='dpct', ticks=[-0.04, 0, 0.04],
                         title='slower'),
                  notes=[dict(x=7, y=warm['med'][7], text='{v} slower', value=warm['med'][7], fmt='share', tone='signal',
                              anchor='middle', dy=-11),
                         dict(x=0, y=0, text='same start', tone='quiet', anchor='start', dx=-6, dy=-30),
                         dict(x=8, y=warm['med'][8], text='finish {v}', value=warm['fin'], fmt='dpct1', tone='quiet',
                              anchor='start', dx=14, dy=22),
                         dict(x=8, y=cool['med'][8], text='finish {v}', value=cool['fin'], fmt='dpct1', tone='quiet',
                              anchor='start', dx=14, dy=22)]),
        cohort_n=n_pairs, editions_n=int(len(np.unique(np.concatenate([ea, eb])))), weighting='pairs',
        method=(f'Records linked by name (candidates, not verified people) returning to the same race 1–2 calendar years later, '
                f'both finishes in editions that pass the start-offset screen: {count_phrase(n_pairs, "pair")} of consecutive '
                f'finishes. Each line is the median change in each 5K section\'s pace (and the last 2.2 km) against the same '
                f'record\'s previous visit, by the change in the edition\'s start temperature: warmer by 6 °C or more '
                f'({count_phrase(warm["n"], "pair")}, {warm["ep"]} edition pairs, {warm["races"]} races), within 1 °C '
                f'({count_phrase(same["n"], "pair")}, {same["ep"]} edition pairs, {same["races"]} races) or cooler by 6 °C or '
                f'more ({count_phrase(cool["n"], "pair")}, {cool["ep"]} edition pairs, {cool["races"]} races); the end notes '
                f'are the median change in finish time. On much warmer returns the 35–40K change exceeded the 0–5K change in '
                f'{late_gt} of the {big} edition pairs with 100 or more pairs, and leaving out any one edition pair keeps the '
                f'35–40K change between {100 * min(loo):+.1f}% and {100 * max(loo):+.1f}%. Weather is edition context at the '
                f'scheduled start, never a personal exposure.'),
    )


# ---------------------------------------------------------------------------------------------------------------------
# every-race-has-its-minute
MINUTE_RACES = ['Valencia', 'Boston', 'Berlin']  # clock order of their usual busiest minute
# The two clock minutes before 3:00, 3:30 and 4:00 (2:58 and 2:59, 3:28 and 3:29, 3:58 and 3:59).
MINUTE_WINDOWS = [(178, 179), (208, 209), (238, 239)]


def busiest_minutes(c, city, floor=3000):
    """(edition, busiest finish minute) for each edition of the city with `floor`+ finishes; ties take the earlier minute."""
    out = []
    for e in _editions_of(c, city):
        if c.ed_n[e] < floor:
            continue
        counts = np.bincount(np.floor(c.finish[c.edition == e] / 60).astype(np.int64), minlength=721)
        out.append((e, int(np.argmax(counts))))
    return out


@chart('every-race-has-its-minute')
def every_race_has_its_minute(c):
    per, rows = {}, []
    for city in MINUTE_RACES:
        per[city] = busiest_minutes(c, city)
        ms = [m for _, m in per[city]]
        k = len(ms)
        if k == 0:
            raise ValueError(f'{city}: no editions with 3,000+ finishes')
        parts = [sum(1 for m in ms if m in w) / k for w in MINUTE_WINDOWS]
        rows.append(dict(label=city, parts=[sh(p) for p in parts] + [sh(1 - sum(parts))],
                         tone='signal' if city == 'Berlin' else 'ink' if city == 'Valencia' else 'quiet'))
    ber = [m for _, m in per['Berlin']]
    val = [m for _, m in per['Valencia']]
    eds = [e for city in MINUTE_RACES for e, _ in per[city]]
    n = int(sum(int(c.ed_n[e]) for e in eds))
    return dict(
        values=dict(bk=int(sum(1 for m in ber if m in MINUTE_WINDOWS[2])), bn=len(ber), bmark=14400,
                    vk=int(sum(1 for m in val if m in MINUTE_WINDOWS[0])), vn=len(val), vmark=10800,
                    n_min=int(min(int(c.ed_n[e]) for e in eds))),
        plot=dict(form='stacked', rows=rows, fmt='share',
                  parts=[dict(label='2:58–59', tone='ink'), dict(label='3:28–29', tone='o2'),
                         dict(label='3:58–59', tone='signal'), dict(label='Other', tone='faint')]),
        cohort_n=n, editions_n=len(eds), weighting='editions-equal',
        method=(f'The busiest finish minute (the clock minute holding the most finishes) of each edition with 3,000 or more finishes '
                f'in Valencia, Boston and Berlin ({len(eds)} editions, {n:,} finishes), grouped as the two minutes '
                f'before 3:00, 3:30 or 4:00, or another minute; each edition counts once.'),
    )


# ---------------------------------------------------------------------------------------------------------------------
# where-each-race-slows
BAND = (330, 360)  # 5–20K pace, s/km: the same early pace in every race
SLOW_CITIES = ['Hamburg', 'Berlin', 'Chicago', 'London', 'Boston', 'New York']


def band_mask(c):
    return c.shape_keep & (c.baseline >= BAND[0]) & (c.baseline < BAND[1])


@chart('where-each-race-slows')
def where_each_race_slows(c):
    band = band_mask(c)
    k = SECTIONS.index('20–25K')
    rel = c.paces[:, k] / c.baseline - 1
    per, used, total = {}, [], 0
    for city in SLOW_CITIES:
        eds = [e for e in _editions_of(c, city) if (band & (c.edition == e)).sum() >= 100]
        n = int(sum(int((band & (c.edition == e)).sum()) for e in eds))
        require_cell(n, city)
        total += n
        used += eds
        per[city] = sh(median([median(rel[band & (c.edition == e)]) for e in eds]))
    order = sorted(SLOW_CITIES, key=lambda k: (-per[k], k))
    # The comparator is the runner-up: the race with the next-largest slowdown after New York.
    nxt = [city for city in order if city != 'New York'][0]
    rows = [dict(label=city, value=per[city], tone='signal' if city == 'New York' else 'ink' if city == nxt else 'quiet')
            for city in order]
    ny_next = max(v for city, v in per.items() if city != 'New York')
    return dict(
        values=dict(ny=per['New York'], next=per[nxt], next_city=nxt, ny_next=ny_next, ny_rank=order.index('New York') + 1),
        plot=dict(form='bars', rows=rows, fmt='dpct1',
                  x=dict(min=0, max=0.08, ticks=[0, 0.02, 0.04, 0.06, 0.08], fmt='dpct'),
                  notes=[dict(row=len(rows) - 2, x=0.1, text='20–25K pace\nvs 5–20K pace', anchor='end', tone='quiet', dy=5)]),
        cohort_n=total, editions_n=len(used), weighting='editions-equal',
        method=(f'Finishes with a 5–20K pace of 5:30–6:00 per km in editions that pass the start-offset screen, in Hamburg, Berlin, '
                f'Chicago, London, Boston and New York ({total:,} finishes in {len(used)} editions with 100 or more each): the 20–25K '
                f'pace against the 5–20K pace, the median within each edition, then the median over the race\'s editions.'),
    )


# ---------------------------------------------------------------------------------------------------------------------
# how-spread-out-each-race-is
SPREAD_CITIES = 7


@chart('how-spread-out-each-race-is')
def how_spread_out_each_race_is(c):
    big = c.ed_n >= 1000
    per = {}
    for city in sorted(set(c.ed_city[big].tolist())):
        qs = []
        for e in _editions_of(c, city):
            if not big[e]:
                continue
            f = c.finish[c.edition == e]
            qs.append([quantile(f, q) for q in (0.1, 0.25, 0.5, 0.75, 0.9)])
        if len(qs) >= 3:
            qs = np.array(qs)
            q = [median(qs[:, j]) for j in range(5)]
            # The middle half as drawn: the race's median 75th minus its median 25th percentile.
            per[city] = dict(q=q, iqr=q[3] - q[1], eds=len(qs),
                             n=int(sum(int(c.ed_n[e]) for e in _editions_of(c, city) if big[e])))
    # The races with three or more such editions, the most finishes first.
    if len(per) < SPREAD_CITIES:
        raise ValueError(f'too few races with three or more editions of 1,000+ finishes: {len(per)}, under {SPREAD_CITIES}')
    chosen = sorted(per, key=lambda k: (-per[k]['n'], k))[:SPREAD_CITIES]
    chosen.sort(key=lambda k: (-per[k]['iqr'], k))
    top, low = chosen[0], chosen[-1]
    rows = []
    for city in chosen:
        q = per[city]['q']
        tone = 'signal' if city == top else 'ink' if city == low else 'quiet'
        rows.append(dict(label=city, lo=sec(q[0]), q1=sec(q[1]), mid=sec(q[2]), q3=sec(q[3]), hi=sec(q[4]), tone=tone))
    n = int(sum(per[k]['n'] for k in chosen))
    return dict(
        values=dict(top=top, low=low, top_iqr=sec(per[top]['iqr']), low_iqr=sec(per[low]['iqr'])),
        plot=dict(form='range', rows=rows, fmt='hm', legend=dict(lo='10th', mid='Median', hi='90th', box='Middle half'),
                  x=dict(min=9900, max=25500, fmt='hm', ticks=[10800, 14400, 18000, 21600]),
                  # The two middle halves the takeaway quotes, printed at the end of their rows (the axis runs on past 6:00
                  # to hold the top row's).
                  notes=[dict(row=i, x=rows[i]['hi'], text='{v}', value=sec(per[k]['iqr']), fmt='mins', tone=t, anchor='start',
                              dx=9, dy=5) for i, k, t in ((0, top, 'signal'), (len(rows) - 1, low, 'ink'))]),
        cohort_n=n, editions_n=int(sum(per[k]['eds'] for k in chosen)), weighting='editions-equal',
        method=(f'The seven races with the most finishes among those with three or more editions of 1,000 or more finishes: each '
                f'edition\'s 10th, 25th, 50th, 75th and 90th percentile finish times, then the median over the race\'s editions '
                f'({n:,} finishes); the middle half is the span from the 25th to the 75th.'),
    )


# ---------------------------------------------------------------------------------------------------------------------
# Edition-level slowdown shares in screened editions
def screened_edition_shares(c):
    """Sustained slowdown share of each edition that passes the start-offset screen with 100+ finishes; NaN otherwise."""
    E = len(c.editions)
    k = c.shape_keep
    num = np.bincount(c.edition[k], weights=c.slow[k].astype(float), minlength=E)
    den = np.bincount(c.edition[k], minlength=E)
    return np.where(den >= 100, num / np.maximum(den, 1), np.nan), den


WARM_BINS = [('Least', -math.inf, -2), ('Less', -2, -0.5), ('Usual', -0.5, 0.5), ('More', 0.5, 2), ('Most', 2, math.inf)]


def warming_frame(c):
    """Editions with a share and weather, in races with 3+ such editions: centred share, start temperature and warming."""
    share, den = screened_edition_shares(c)
    ok = np.isfinite(share) & np.isfinite(c.ed_temp_c) & np.isfinite(c.ed_warming)
    eds = []
    for city in sorted(set(c.ed_city[ok].tolist())):
        es = [int(e) for e in np.flatnonzero(ok & (c.ed_city == city))]
        if len(es) >= 3:
            eds += es
    eds = np.array(sorted(eds))
    cs, ct, cw = np.zeros(len(eds)), np.zeros(len(eds)), np.zeros(len(eds))
    for city in sorted(set(c.ed_city[eds].tolist())):
        j = c.ed_city[eds] == city
        cs[j] = share[eds[j]] - share[eds[j]].mean()
        ct[j] = c.ed_temp_c[eds[j]] - c.ed_temp_c[eds[j]].mean()
        cw[j] = c.ed_warming[eds[j]] - c.ed_warming[eds[j]].mean()
    return eds, cs, ct, cw, den


def _column_note(i, v):
    """A quiet column's reading: its gap in whole points over or under the column, or about the same under half a point."""
    if abs(v) < 0.005:
        return dict(x=i, y=0, text='about\nthe same', tone='quiet', anchor='middle', dy=-29)
    return dict(x=i, y=sh(v), text='{v}', value=sh(v), fmt='dpts', tone='quiet', anchor='middle', dy=-6 if v >= 0 else 17)


@chart('races-that-warmed-up')
def races_that_warmed_up(c):
    eds, cs, ct, cw, den = warming_frame(c)
    if len(eds) < 10:
        raise ValueError(f'too few screened editions with weather in races with three or more: {len(eds)}')
    # Within-race least squares of the share on start temperature and warming; the start-temperature part is removed.
    a11, a12, a22 = (ct * ct).sum(), (ct * cw).sum(), (cw * cw).sum()
    b1, b2 = (ct * cs).sum(), (cw * cs).sum()
    det = a11 * a22 - a12 * a12
    bt, bw = (a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det
    resid = cs - bt * ct
    cols, means = [], []
    for label, lo, hi in WARM_BINS:
        j = (cw >= lo) & (cw < hi)
        require_cell(den[eds[j]].sum(), label)
        means.append(float(resid[j].mean()))
        tone = 'signal' if label == 'Most' else 'ink' if label == 'Least' else 'quiet'
        cols.append(dict(label=label, value=sh(means[-1]), tone=tone, editions=int(j.sum())))
    n = int(den[eds].sum())
    return dict(
        values=dict(gap=sh(means[-1] - means[0]), most=sh(means[-1]), least=sh(means[0]), low=sh(min(means)), high=sh(max(means)), per_c=sh(bw), editions=len(eds),
                    cities=len(set(c.ed_city[eds].tolist())), eds_low=cols[0]['editions'], eds_high=cols[-1]['editions']),
        plot=dict(form='columns', cols=[{k: v for k, v in col.items() if k != 'editions'} for col in cols], fmt='dpts', values='toned',
                  y=dict(min=-0.1, max=0.1, fmt='dpts', ticks=[-0.1, 0, 0.1], title='Slowdown share against the race’s usual'),
                  # The two ends print as values; the quiet middle columns are noted, a gap under half a point as about the same.
                  notes=[_column_note(i, col['value']) for i, col in enumerate(cols) if col['tone'] == 'quiet']),
        cohort_n=n, editions_n=len(eds), weighting='editions-equal',
        method=(f'{len(eds)} editions that pass the start-offset screen with 100 or more finishes and a weather row, in races with three '
                f'or more such editions: each edition\'s sustained slowdown share and its warming over the four hours after the '
                f'scheduled start, both against the race\'s own average, with the within-race start-temperature slope removed; '
                f'editions grouped by warming more than 2 °C below the race\'s usual, 0.5–2 below, within 0.5, 0.5–2 above and 2 or more '
                f'above, each edition counted once. Weather is edition context, never a personal exposure.'),
    )


# ---------------------------------------------------------------------------------------------------------------------
# climb-a-loose-guide
@chart('climb-a-loose-guide')
def climb_a_loose_guide(c):
    band = band_mask(c)
    pts, total, neds = [], 0, 0
    for city in c.cities:
        gain = c.course_gain.get(city)
        if gain is None:
            continue
        shares, n = [], 0
        for e in _editions_of(c, city):
            m = band & (c.edition == e)
            if m.sum() >= 100:
                shares.append(float(c.slow[m].mean()))
                n += int(m.sum())
        if n < 1000:
            continue
        total += n
        neds += len(shares)
        pts.append((city, float(gain), float(np.mean(shares))))
    if len(pts) < 4:
        raise ValueError(f'too few races with a supplied route and 1,000+ finishes at the same early pace: {len(pts)}, under 4')
    names = {p[0] for p in pts}
    for city in ('Boston', 'Gold Coast'):
        if city not in names:
            raise ValueError(f'{city}: no supplied route with 1,000+ finishes at the same early pace')
    x = np.array([p[1] for p in pts]); y = np.array([p[2] for p in pts])
    rr = float(np.corrcoef(x, y)[0, 1])
    z, se = math.atanh(rr), 1 / math.sqrt(len(pts) - 3)
    lo, hi = math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)
    slope = float(((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum())
    icpt = float(y.mean() - slope * x.mean())
    sel = {p[0]: p for p in pts}
    points = []
    for city, g, s in pts:
        tone = 'signal' if city == 'Boston' else 'ink' if city == 'Gold Coast' else 'quiet'
        points.append(dict(x=sec(g), y=sh(s), tone=tone))
    x0, x1 = 0.0, 300.0
    return dict(
        values=dict(boston=sh(sel['Boston'][2]), gold=sh(sel['Gold Coast'][2]), r=sh(rr), r_lo=sh(lo), r_hi=sh(hi),
                    n_cities=len(pts), gap=sh(sel['Gold Coast'][2] - sel['Boston'][2])),
        plot=dict(form='scatter', points=points,
                  x=dict(min=-40, max=350, fmt='elev', title='Total climb on the course'),
                  y=dict(min=0.2, max=0.55, fmt='share', ticks=[0.3, 0.4, 0.5]),
                  fit=dict(x0=x0, y0=sh(icpt + slope * x0), x1=x1, y1=sh(icpt + slope * x1)),
                  # Both named beside their dots, raised clear of the gridlines (a point label sits on the 30% line).
                  notes=[dict(x=sec(sel[k][1]), y=sh(sel[k][2]), text=k, anchor='start', tone=t, dx=8, dy=-3)
                         for k, t in (('Gold Coast', 'ink'), ('Boston', 'signal'))]
                  # The accent: Boston's gap to Gold Coast, under Boston's name and clear of the 30% gridline.
                  + [dict(x=sec(sel['Boston'][1]), y=sh(sel['Boston'][2]), text='{v} vs\nGold Coast',
                          value=sh(sel['Boston'][2] - sel['Gold Coast'][2]), fmt='dpts', anchor='start', tone='signal',
                          dx=8, dy=26)]),
        cohort_n=total, editions_n=neds, weighting='editions-equal',
        method=(f'Finishes with a 5–20K pace of 5:30–6:00 per km in editions that pass the start-offset screen, in the {len(pts)} '
                f'races with a supplied route and 1,000 or more such finishes ({total:,} finishes): each race\'s sustained '
                f'slowdown share, its editions (100 or more such finishes each) weighted equally, against the whole-route climb of '
                f'its supplied course file (r = {rr:.2f}, 95% interval {lo:.2f} to {hi:.2f}). Each share folds in the weather of its editions; the climb is context, never an adjustment.'),
    )
