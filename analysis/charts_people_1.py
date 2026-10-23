"""Top 100 charts, people module (analysis/build_charts.py). Who runs: exact recorded ages, recorded
gender and the two together. Exact ages come only from granular-age editions (c.exact_age_ok); pacing-shape matches keep
to the start-offset screen (c.shape_keep)."""
import numpy as np

from charts_common import MATS, median, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


MEN, WOMEN = 1, 2


def matched_weights(cell, group, a, b):
    """Within each cell, both groups weighted to the smaller group's count (min(na, nb) / own count per finish)."""
    ids, inv = np.unique(cell, return_inverse=True)
    na = np.bincount(inv, weights=(group == a).astype(float), minlength=len(ids))
    nb = np.bincount(inv, weights=(group == b).astype(float), minlength=len(ids))
    w = np.minimum(na, nb)
    wt = np.zeros(len(cell))
    ma, mb = group == a, group == b
    wt[ma] = (w[inv] / np.maximum(na[inv], 1))[ma]
    wt[mb] = (w[inv] / np.maximum(nb[inv], 1))[mb]
    return wt, float(w.sum())


def wmean(y, w):
    return float((y * w).sum() / w.sum())


def gap_words(s):
    """A time gap in words for a chart note, as the takeaway prints it: '18 seconds', '2 min 18 s' (never m:ss)."""
    s = int(abs(s))
    if s < 60:
        return f'{s} seconds'
    return f'{s // 60} min' + (f' {s % 60} s' if s % 60 else '')


def granular_races(c, eds):
    """The races behind a granular-age statistic, most editions first: 'New York, Washington, Austin, Paris and Auckland'."""
    k = {}
    for e in eds:
        k[c.ed_city[e]] = k.get(c.ed_city[e], 0) + 1
    names = sorted(k, key=lambda x: (-k[x], x))
    return (', '.join(names[:-1]) + ' and ' + names[-1]) if len(names) > 1 else names[0], len(names)


def finishes(k):
    """'1,067,027 finishes' (the shared count_phrase does not add -es)."""
    k = int(k)
    return f'{k:,} finish' + ('' if k == 1 else 'es')


# ---------- Milestone birthdays ----------
@chart('big-birthday-bulge')
def big_birthday_bulge(c):
    """New York finishes by exact recorded age; the round birthdays stand out against their neighbours."""
    ny = c.exact_age_ok & c.mask_city('New York')
    ages = c.exact_age[ny].astype(int)
    counts = np.bincount(ages, minlength=91)

    def bulge(a, cnt=counts):
        return float(cnt[a] / ((cnt[a - 1] + cnt[a + 1]) / 2) - 1)

    lo, hi = 18, 78
    for a in range(lo, hi + 1):
        require_cell(counts[a], f'New York age {a}')
    eds = [e for e in c.granular_age_editions if c.ed_city[e] == 'New York']
    # Editions where 40, 50 and 60 each stand 5% above their neighbours (70 is too thin for one edition).
    above = 0
    for e in eds:
        ce = np.bincount(c.exact_age[c.exact_age_ok & (c.edition == e)].astype(int), minlength=91)
        above += int(min(bulge(40, ce), bulge(50, ce), bulge(60, ce)) > 0.05)
    round_ages = (40, 50, 60, 70)
    bins = [dict(x0=a - 0.5, x1=a + 0.5, v=int(counts[a]), tone='signal' if a in round_ages else 'quiet') for a in range(lo, hi + 1)]
    r = {a: bulge(a) for a in (30,) + round_ages}
    values = dict(r50=sh(r[50]), r40=sh(r[40]), r60=sh(r[60]), r70=sh(r[70]), r30=sh(r[30]),
                  lo=sh(min(r[a] for a in round_ages)), hi=sh(max(r[a] for a in round_ages)),
                  at49=int(counts[49]), at50=int(counts[50]), at51=int(counts[51]), eds_above=int(above), eds=int(len(eds)))
    ymax = int(counts[lo:hi + 1].max())
    notes = [dict(x=a, y=int(counts[a]), text='{v}', value=values[f'r{a}'], fmt='dpct', tone='signal', dy=-8,
                  anchor='start' if a == 60 else 'middle', dx=4 if a == 60 else 0) for a in round_ages]
    notes.append(dict(x=30, y=int(counts[30]), text='{v}', value=values['r30'], fmt='dpct', tone='quiet', dy=-8, anchor='middle'))
    return dict(
        values=values,
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=lo - 0.5, max=hi + 0.5, fmt='int', ticks=[20, 30, 40, 50, 60, 70], title='Recorded age'),
                  y=dict(min=0, max=int(ymax * 1.1), fmt='count', ticks=[0, 10000, 20000], title='finishes'),
                  notes=notes),
        cohort_n=int(ny.sum()), editions_n=int(len(eds)), weighting='pooled',
        method=(f'Every New York finish with an exact recorded age ({finishes(ny.sum())}, {len(eds)} editions), counted by '
                'age; a round age is compared with the mean of the two ages either side. Ages 40, 50 and 60 each stand more than 5% '
                f'above their neighbours in {above} of the {len(eds)} editions.'),
    )


# ---------- Age and median finish ----------
@chart('age-barely-shows-until-45')
def age_barely_shows_until_45(c):
    """Median finish by exact recorded age, men and women, in the granular-age editions (a cross-section)."""
    base = c.exact_age_ok & ~np.asarray(c.gender_gap_edition, bool)[c.edition]
    series = {}
    for g in (MEN, WOMEN):
        pts = []
        for a in range(20, 76):
            m = base & (c.gender == g) & (c.exact_age == a)
            if m.sum() >= 100:
                pts.append([a, sec(median(c.finish[m]))])
        series[g] = pts

    def anchor(g, a):
        m = base & (c.gender == g) & (c.exact_age >= a - 2) & (c.exact_age <= a + 2)
        require_cell(m.sum(), f'gender {g} ages {a}±2')
        return float(median(c.finish[m]))

    am = {a: anchor(MEN, a) for a in (25, 45, 65)}
    aw = {a: anchor(WOMEN, a) for a in (25, 45, 65)}
    values = dict(d1=sec(am[45] - am[25]), d2=sec(am[65] - am[45]), w1=sec(aw[45] - aw[25]), w2=sec(aw[65] - aw[45]),
                  m25=sec(am[25]), m45=sec(am[45]), m65=sec(am[65]))
    mw = base & ((c.gender == MEN) | (c.gender == WOMEN))
    races, races_n = granular_races(c, sorted(set(int(e) for e in np.unique(c.edition[mw]))))
    values.update(races=races, races_n=int(races_n))
    pm = dict(series[MEN])
    for a in (38, 58):
        if a not in pm:
            raise ValueError(f"under 100 men's finishes at age {a}")
    return dict(
        values=values,
        plot=dict(form='lines',
                  series=[dict(label="Women's", points=series[WOMEN], tone='quiet'),
                          dict(label="Men's", points=series[MEN], tone='ink'),
                          dict(label='25 to 45', points=[p for p in series[MEN] if 25 <= p[0] <= 45], tone='signal', width=4, labelAt='none')],
                  x=dict(min=8, max=76, fmt='int', ticks=[20, 30, 40, 50, 60, 70], title='Recorded age'),
                  y=dict(min=12000, max=22800, fmt='hm', ticks=[14400, 18000, 21600]),
                  notes=[dict(x=38, y=pm[38], text='25→45: {v}', value=values['d1'], fmt='dmins', tone='signal', dy=36, anchor='middle'),
                         dict(x=58, y=pm[58], text='45→65: {v}', value=values['d2'], fmt='dmins', tone='ink', dx=20, dy=40, anchor='start')]),
        cohort_n=int(mw.sum()), editions_n=int(len(c.granular_age_editions)), weighting='pooled',
        method=(f'Median finish by exact recorded age in the granular-age editions without gender-recording gaps ({finishes(mw.sum())}); '
                'ages 20 to 75 with at least 100 finishes per age and gender are drawn; the three anchor ages pool two years either side. A cross-section of different finishes at each age, not people ageing.'),
    )


# ---------- Women's share by age ----------
@chart('women-outnumber-men-mid-20s')
def women_outnumber_men_mid_20s(c):
    # Granular-age editions with complete gender recording (on the adopted release that is every one of them).
    eds = [e for e in c.granular_age_editions if not c.gender_gap_edition[e]]
    if not eds:
        raise ValueError('no granular-age editions with complete gender recording')
    base = c.exact_age_ok & np.isin(c.edition, eds) & ((c.gender == MEN) | (c.gender == WOMEN))
    pts, nmin = [], None
    for a in range(18, 81):
        m = base & (c.exact_age == a)
        k = require_cell(m.sum(), f'age {a}')
        nmin = k if nmin is None else min(nmin, k)
        pts.append([a, sh((c.gender[m] == WOMEN).mean())])
    above = [a for a, s in pts if s > 0.5]
    if not above:
        raise ValueError("no age with more women's finishes than men's")
    a0, a1 = min(above), max(above)
    contiguous = int(above == list(range(a0, a1 + 1)))
    peak_age, peak = max(pts, key=lambda p: (p[1], -p[0]))
    at = dict(pts)
    inside = [p for p in pts if a0 <= p[0] <= a1]
    races, races_n = granular_races(c, eds)
    values = dict(a0=int(a0), a1=int(a1), peak=peak, peak_age=int(peak_age), at40=at[40], contiguous=contiguous, n_min=int(nmin), last_age=int(pts[-1][0]),
                  first_under=int(min(a for a, s in pts if a > a1 and s < 0.5)), under_after=int(all(s < 0.5 for a, s in pts if a > a1)),
                  races=races, races_n=int(races_n))
    return dict(
        values=values,
        plot=dict(form='lines',
                  series=[dict(label="Women's share", points=pts, tone='ink', labelAt='none'),
                          dict(label='Majority', points=inside, tone='signal', width=4, labelAt='none')],
                  x=dict(min=13, max=80, fmt='int', ticks=[20, 30, 40, 50, 60, 70, 80], title='Recorded age'),
                  y=dict(min=0, max=0.6, fmt='share', ticks=[0, 0.2, 0.4, 0.6], title='women'),
                  refs=[dict(axis='y', value=0.5, label='half', tone='ink')],
                  notes=[dict(x=peak_age, y=peak, text='{v} at ' + str(peak_age), value=peak, fmt='share', tone='signal', dx=22, dy=4, anchor='start')]),
        cohort_n=int(base.sum()), editions_n=int(len(eds)), weighting='pooled',
        method=(f'Women\'s share of men\'s and women\'s finishes at each exact recorded age, 18 to 80, in the granular-age editions '
                f'({finishes(base.sum())}; every age holds at least {finishes(nmin)}).'),
    )


# ---------- Older and younger finishes at the same finish time ----------
@chart('older-finishes-draw-level')
def older_finishes_draw_level(c):
    young = (c.exact_age >= 18) & (c.exact_age < 30)
    old = (c.exact_age >= 60) & (c.exact_age < 70)
    m = c.exact_age_ok & c.shape_keep & (c.finish >= 9000) & (c.finish < 21600) & ((c.gender == MEN) | (c.gender == WOMEN)) & (young | old)
    ix = np.flatnonzero(m)
    grp = np.where(old[ix], 2, 1)
    minute = np.floor(c.finish[ix] / 60).astype(np.int64)
    cell = (c.edition[ix].astype(np.int64) * 10 + c.gender[ix]) * 1000 + minute
    wt, weight = matched_weights(cell, grp, 1, 2)
    require_cell(weight, 'matched weight')
    Y, O = grp == 1, grp == 2
    T = c.times[ix]
    # Whole seconds (round half up), so the recount compares them exactly.
    gap = [int(np.floor(wmean(T[O, k], wt[O]) - wmean(T[Y, k], wt[Y]) + 0.5)) for k in range(9)]
    values = dict(g20=gap[3], g40=-gap[7], gain=gap[3] - gap[7], falls25=int(gap[4] > gap[5] > gap[6] > gap[7]),
                  peak=max(gap), matched_weight=int(round(weight)))
    k_peak = int(np.argmax(gap))
    values['peak_mat'] = MATS[k_peak]
    points = [[k, gap[k]] for k in range(9)]
    used = wt > 0
    return dict(
        values=values,
        plot=dict(form='lines',
                  series=[dict(label='60–69', points=points, tone='signal', dots=True, labelAt='none')],
                  x=dict(min=0, max=8, fmt='int', cats=list(MATS), ticks=[1, 3, 5, 7]),
                  y=dict(min=-60, max=150, fmt='delta', ticks=[-60, 120]),
                  refs=[dict(axis='y', value=0, label='level', tone='ink')],
                  notes=[dict(x=3, y=gap[3], text=f'{gap_words(gap[3])} behind at 20K', tone='ink', dy=-12, anchor='middle'),
                         dict(x=7, y=gap[7], text=f'{gap_words(gap[7])} ahead at 40K', tone='signal', dy=22, anchor='end', dx=6)]),
        cohort_n=int(used.sum()), editions_n=int(len(np.unique(c.edition[ix][used]))), weighting='pairs',
        method=('Finishes at 60–69 and 18–29 (exact recorded ages, start-screened editions, finishes from 2:30 to 6:00) matched on '
                f'edition, recorded gender and finish minute, each cell weighted to its smaller group (matched weight {int(round(weight)):,}); '
                'the gap is the difference of their weighted mean clock times at each mat.'),
    )


# ---------- Sustained slowdown, women and men at the same finish time ----------
BANDS20 = [(9000, 10800, '2:30–3:00'), (10800, 12600, '3:00–3:30'), (12600, 14400, '3:30–4:00'), (14400, 16200, '4:00–4:30'),
           (16200, 18000, '4:30–5:00'), (18000, 19800, '5:00–5:30'), (19800, 21600, '5:30–6:00')]


@chart('women-slow-down-less')
def women_slow_down_less(c):
    gap = np.asarray(c.gender_gap_edition, bool)[c.edition]
    m = c.shape_keep & ~gap & (c.finish >= 9000) & (c.finish < 21600) & ((c.gender == MEN) | (c.gender == WOMEN))
    ix = np.flatnonzero(m)
    g = c.gender[ix]
    minute = np.floor(c.finish[ix] / 60).astype(np.int64)
    wt, weight = matched_weights(c.edition[ix].astype(np.int64) * 1000 + minute, g, WOMEN, MEN)
    require_cell(weight, 'matched weight')
    slow = c.slow[ix].astype(float)
    W, M = g == WOMEN, g == MEN
    fi = c.finish[ix]
    rows = [dict(label='All', a=sh(wmean(slow[W], wt[W])), b=sh(wmean(slow[M], wt[M])), tone='signal')]
    for lo, hi, label in BANDS20:
        b = (fi >= lo) & (fi < hi)
        require_cell((b & W & (wt > 0)).sum(), f'women {label}')
        require_cell((b & M & (wt > 0)).sum(), f'men {label}')
        require_cell(wt[b & W].sum(), f'matched weight {label}')
        rows.append(dict(label=label, a=sh(wmean(slow[b & W], wt[b & W])), b=sh(wmean(slow[b & M], wt[b & M])), tone='quiet'))
    cities = higher = 0
    city = c.city[ix]
    for ci in range(len(c.cities)):
        s = city == ci
        if wt[s & W].sum() < 2000:
            continue
        cities += 1
        higher += int(wmean(slow[s & M], wt[s & M]) > wmean(slow[s & W], wt[s & W]))
    used = wt > 0
    values = dict(w=rows[0]['a'], m=rows[0]['b'], ratio=sh(rows[0]['b'] / rows[0]['a']), cities_men_higher=int(higher), cities=int(cities),
                  pooled_w=sh(slow[W].mean()), pooled_m=sh(slow[M].mean()), matched_weight=int(round(weight)))
    return dict(
        values=values,
        plot=dict(form='dumbbell', rows=rows, x=dict(min=0, max=0.7, fmt='share', ticks=[0, 0.2, 0.4, 0.6]), fmt='share',
                  a="Women's", b="Men's",
                  notes=[dict(x=values['m'], row=0, text='{v}', value=values['ratio'], fmt='ratio', tone='signal', dx=16, dy=5, anchor='start')]),
        cohort_n=int(used.sum()), editions_n=int(len(np.unique(c.edition[ix][used]))), weighting='pairs',
        method=('Women\'s and men\'s finishes from 2:30 to 6:00 in start-screened editions without gender-recording gaps, matched on edition and finish minute (each cell '
                f'weighted to its smaller group; matched weight {int(round(weight)):,} per group); the share of each with a sustained slowdown. '
                f'Men\'s share is higher in {higher} of the {cities} races with a matched weight of at least 2,000.'),
    )


# ---------- Men's sub-3:00 finishes by age ----------
# Each column is labelled by its first age (25 = 25–29) so all eight labels fit the card.
AGES22 = [(18, 25, '<25'), (25, 30, '25'), (30, 35, '30'), (35, 40, '35'), (40, 45, '40'), (45, 50, '45'),
          (50, 55, '50'), (55, 200, '55+')]


@chart('sub-3-not-only-for-the-young')
def sub_3_not_only_for_the_young(c):
    men = c.exact_age_ok & ~np.asarray(c.gender_gap_edition, bool)[c.edition] & (c.gender == MEN)
    a, f = c.exact_age[men], c.finish[men]
    sub3 = f < 10800
    a3 = a[sub3]
    require_cell(sub3.sum(), "men's sub-3:00")
    cols = []
    for lo, hi, label in AGES22:
        b = (a3 >= lo) & (a3 < hi)
        require_cell(b.sum(), f'sub-3:00 ages {label}')
        cols.append(dict(label=label, value=sh(b.mean()), tone='signal' if lo >= 40 else 'quiet'))
    m40 = sh((a3 >= 40).mean())
    races, races_n = granular_races(c, sorted(set(int(e) for e in np.unique(c.edition[men][sub3]))))
    values = dict(m40=m40, m50=sh((a3 >= 50).mean()), med=int(np.median(a3)), n=int(sub3.sum()), field=sh((a >= 40).mean()),
                  races=races, races_n=int(races_n))
    return dict(
        values=values,
        plot=dict(form='columns', cols=cols, y=dict(min=0, max=0.3, fmt='share', ticks=[0, 0.1, 0.2, 0.3], title="of men's finishes under 3:00"),
                  fmt='share', values='none',
                  notes=[dict(x=5.5, y=cols[4]['value'], text='{v} aged 40+', value=m40, fmt='share', tone='signal', dy=-30, anchor='middle')]),
        cohort_n=int(sub3.sum()), editions_n=int(len(np.unique(c.edition[men][sub3]))), weighting='pooled',
        method=(f'Men\'s finishes under 3:00 with an exact recorded age in the granular-age editions without gender-recording gaps ({finishes(sub3.sum())}), by '
                f'five-year band of recorded age. Of all men\'s finishes with an exact recorded age ({finishes(men.sum())}), '
                f'{round(values["field"] * 100)}% were at 40 or older.'),
    )


# ---------- Women's finishes against the race's median men's finish ----------
@chart('women-beat-the-median-man')
def women_beat_the_median_man(c):
    raw = getattr(c.f, 'raw_by_edition', None)
    if raw is None:
        raise ValueError('no raw record counts for the 80% retention screen')
    shares, used = [], np.zeros(c.n, bool)
    for e in range(len(c.editions)):
        if c.gender_gap_edition[e] or not raw[e] or c.ed_n[e] < 0.8 * raw[e]:
            continue
        rows = c.edition == e
        g = c.gender[rows]
        if (g == MEN).sum() < 500 or (g == WOMEN).sum() < 500 or (g == 0).mean() > 0.02:
            continue
        f = c.finish[rows]
        med = median(f[g == MEN])
        shares.append(float((f[g == WOMEN] < med).mean()))
        used |= rows & ((c.gender == MEN) | (c.gender == WOMEN))
    if not shares:
        raise ValueError("no editions with 500+ recorded women's and 500+ men's finishes")
    shares = np.array(shares)
    share = sh(median(shares))
    values = dict(share=share, lo=sh(shares.min()), hi=sh(shares.max()), eds=int(len(shares)),
                  eds_20_35=sh(((shares >= 0.2) & (shares <= 0.35)).mean()), eds_in=int(((shares >= 0.2) & (shares <= 0.35)).sum()),
                  band_lo=0.2, band_hi=0.35)
    return dict(
        values=values,
        plot=dict(form='waffle', parts=[dict(share=share, tone='signal', label="Beat men's median")],
                  rest='Slower'),
        cohort_n=int(used.sum()), editions_n=int(len(shares)), weighting='editions-equal',
        method=(f'In each of {len(shares)} editions with at least 500 recorded women\'s and 500 men\'s finishes, at most 2% other or unrecorded '
                'gender and at least 80% of their records kept as finishes (the editions with gender-recording gaps left out), the share of women\'s finishes quicker than that edition\'s '
                'median men\'s finish; the chart shows the median edition.'),
    )


# ---------- New York, 2006 against 2025 ----------
NY_BANDS = [(18, 23, '18–22'), (23, 28, '23–27'), (28, 33, '28–32'), (33, 38, '33–37'), (38, 43, '38–42'), (43, 48, '43–47'),
            (48, 53, '48–52'), (53, 200, '53+')]


@chart('new-york-2006-vs-2025')
def new_york_2006_vs_2025(c):
    ed = {int(c.ed_year[e]): e for e in c.granular_age_editions if c.ed_city[e] == 'New York'}
    base = c.exact_age_ok & ((c.gender == MEN) | (c.gender == WOMEN))
    share, nmin = {}, None
    for y in (2006, 2025):
        if y not in ed:
            raise ValueError(f'no New York {y} edition with exact recorded ages')
        if c.gender_gap_edition[ed[y]]:
            raise ValueError(f'no complete gender recording in New York {y}')
        m = base & (c.edition == ed[y])
        out = []
        for lo, hi, label in NY_BANDS:
            b = m & (c.exact_age >= lo) & (c.exact_age < hi)
            nm, nw = int((c.gender[b] == MEN).sum()), int((c.gender[b] == WOMEN).sum())
            require_cell(min(nm, nw), f'New York {y} {label}')
            nmin = min(nm, nw) if nmin is None else min(nmin, nm, nw)
            out.append(nw / (nm + nw))
        share[y] = out
    over = [i for i, s in enumerate(share[2025]) if s > 0.5]
    top = len(NY_BANDS) - 1
    rows = [dict(label=label, a=sh(share[2006][i]), b=sh(share[2025][i]), tone='signal' if i == top else 'quiet') for i, (_, _, label) in enumerate(NY_BANDS)]
    a53, b53 = share[2006][top], share[2025][top]
    rises = [b - a for a, b in zip(share[2006], share[2025])]
    values = dict(a53=sh(a53), b53=sh(b53), ratio53=sh(b53 / a53), rose_all=int(min(rises) > 0), min_rise=sh(min(rises)), max_rise=sh(max(rises)),
                  bands=int(len(over)), bands06=int(sum(s > 0.5 for s in share[2006])), n_min=int(nmin))
    cohort = base & np.isin(c.edition, [ed[2006], ed[2025]])
    return dict(
        values=values,
        plot=dict(form='dumbbell', rows=rows, x=dict(min=0.1, max=0.65, fmt='share', ticks=[0.2, 0.3, 0.4, 0.5, 0.6]), fmt='share',
                  a='2006', b='2025', arrow=True,
                  notes=[dict(x=b53, row=top, text='{v}', value=sh(b53 / a53), fmt='ratio', tone='signal', dx=12, dy=5, anchor='start')]),
        cohort_n=int(cohort.sum()), editions_n=2, weighting='pooled',
        method=('Women\'s share of men\'s and women\'s New York finishes in each five-year band of exact recorded age, 2006 against 2025 '
                f'({finishes(cohort.sum())}; every band holds at least {finishes(nmin)} of each gender).'),
    )
