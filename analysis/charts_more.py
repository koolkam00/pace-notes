"""Top 100 charts of the charts_more module (analysis/build_charts.py)."""
import numpy as np

from charts_common import MIN_CELL, SECTIONS, count_phrase, median, quantile, require_cell, sec, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


MEN, WOMEN = 1, 2
# Age-group codes 1…11: 18–24 … 70–74 (insights_data.AGE_LABELS), drawn with short labels so every one shows.
AGE_CODES = list(range(1, 12))
AGE_SHORT = ['<25', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70']
W30, M50, M55, M60 = 3, 7, 8, 9


@chart('women-median-matches-older-men')
def women_median_matches_older_men(c):
    """Edition by edition (outside the gender-gap editions, 100+ finishes in each group): how far the men's 50–54 and
    55–59 medians were ahead of the women's 30–34 median; with the pooled medians by recorded gender and age group."""
    base = ~c.gender_gap_edition[c.edition] & np.isin(c.gender, (MEN, WOMEN)) & (c.age >= 1)
    med = {}
    for g in (MEN, WOMEN):
        for a in AGE_CODES:
            m = base & (c.gender == g) & (c.age == a)
            require_cell(m.sum(), f'gender {g} age {a}')
            med[(g, a)] = float(median(c.finish[m]))
    w30, m50, m55, m60 = med[(WOMEN, W30)], med[(MEN, M50)], med[(MEN, M55)], med[(MEN, M60)]
    lead50, lead55 = [], []
    races = set()
    for e in range(len(c.editions)):
        if c.gender_gap_edition[e]:
            continue
        ix = _rows(c)[e]
        ix = ix[base[ix]]
        g, a, f = c.gender[ix], c.age[ix], c.finish[ix]
        w, a50, a55 = f[(g == WOMEN) & (a == W30)], f[(g == MEN) & (a == M50)], f[(g == MEN) & (a == M55)]
        if min(len(w), len(a50), len(a55)) < MIN_CELL:
            continue
        races.add(str(c.ed_race[e]))
        wm = median(w)
        lead50.append(float(wm - median(a50)))
        lead55.append(float(wm - median(a55)))
    if len(lead50) < 2:
        raise ValueError('too few editions with 100+ finishes in each of the three groups')
    eds = len(lead50)
    values = dict(w30=sec(w30), m50=sec(m50), m55=sec(m55), m60=sec(m60), lead50=sec(w30 - m50), eds=int(eds),
                  eds_m50_ahead=int(sum(x > 0 for x in lead50)), eds_m55_ahead=int(sum(x > 0 for x in lead55)),
                  typ_lead50=sec(median(lead50)), typ_lead55=sec(median(lead55)), min_lead50=sec(min(lead50)),
                  races=int(len(races)))
    # One dot per edition: minutes ahead of that edition's women's 30–34 median (the line at 0 is level with it).
    groups = [dict(label='Men 50–54', dots=[dict(v=sec(x), tone='signal') for x in lead50]),
              dict(label='Men 55–59', dots=[dict(v=sec(x), tone='ink') for x in lead55])]
    return dict(
        values=values,
        plot=dict(form='strip', groups=groups,
                  x=dict(min=-900, max=1500, fmt='dmins', ticks=[0, 600, 1200], title="Ahead of the women's 30–34 median"),
                  refs=[dict(axis='x', value=0, tone='ink')],
                  notes=[dict(x=0, row=0, text='all {v} ahead', value=int(eds), fmt='int', tone='signal', dx=-10, anchor='end')]),
        cohort_n=int(base.sum()), editions_n=int(eds), weighting='editions-equal',
        method=(f'Edition by edition, the median finish of men\'s finishes recorded 50–54 and 55–59 against the women\'s recorded 30–34, '
                f'in the {count_phrase(eds, "edition")} ({count_phrase(len(races), "race")}) outside those where recorded gender is incomplete '
                'with at least 100 finishes in each group; one dot per edition. Pooled over those editions\' men\'s and women\'s finishes '
                f'with a recorded age group ({count_phrase(base.sum(), "finish")}), the men\'s 50–54 median is '
                f'{round((w30 - m50) / 60)} minutes ahead of the women\'s 30–34 median.'),
    )


def _spread(f):
    f = np.sort(f)
    p10, p50, p90 = (quantile(f, q) for q in (0.1, 0.5, 0.9))
    return p50 - p10, p90 - p50


@chart('boston-packed-front-long-back')
def boston_packed_front_long_back(c):
    """Per edition of 2,000+ finishes: the 10th, 50th and 90th percentile finish; each race's median over its editions."""
    big = np.flatnonzero(c.ed_n >= 20 * MIN_CELL)
    per = {}
    for e in big:
        ix = _rows(c)[e]
        before, after = _spread(c.finish[ix])
        row = dict(before=before, after=after, ratio=after / before, n=int(len(ix)))
        for g, k in ((MEN, 'men'), (WOMEN, 'women')):
            fg = c.finish[ix][c.gender[ix] == g]
            if len(fg) >= 5 * MIN_CELL:
                b, a = _spread(fg)
                row[k] = a / b
        per.setdefault(str(c.ed_city[e]), []).append(row)
    races = {city: rows for city, rows in per.items() if len(rows) >= 3}
    if 'Boston' not in races:
        raise ValueError('no Boston race with three or more editions of 2,000+ finishes')
    race_ratio = {city: median([r['ratio'] for r in rows]) for city, rows in races.items()}
    boston = races['Boston']
    others = [city for city in races if city != 'Boston']
    if not others:
        raise ValueError('no race other than Boston with three or more editions of 2,000+ finishes')
    for k in ('men', 'women'):
        if not any(k in r for r in boston):
            raise ValueError(f"no Boston edition with 500+ {k}'s finishes")
    values = dict(
        ratio=sh(race_ratio['Boston']), typ=sh(median(list(race_ratio.values()))),
        typ_ed=sh(median([r['ratio'] for x in others for r in races[x]])), other_eds=int(sum(len(races[x]) for x in others)),
        next_max=sh(max(race_ratio[x] for x in others)), boston_min=sh(min(r['ratio'] for r in boston)),
        other_ed_max=sh(max(r['ratio'] for x in others for r in races[x])),
        other_ed_max_city=max(((r['ratio'], x) for x in others for r in races[x]))[1],
        before=sec(median([r['before'] for r in boston])), after=sec(median([r['after'] for r in boston])),
        men_ratio=sh(median([r['men'] for r in boston if 'men' in r])), women_ratio=sh(median([r['women'] for r in boston if 'women' in r])),
        eds=int(len(boston)), races=int(len(races)),
    )
    size = {city: sum(r['n'] for r in rows) for city, rows in races.items()}
    drawn = {city: (median([r['before'] for r in races[city]]), median([r['after'] for r in races[city]])) for city in races}
    # The eight races with the most finishes, ranked by the ratio the chart draws (90th's distance ÷ 10th's).
    shown = sorted(sorted(races, key=lambda x: (-size[x], x))[:8], key=lambda x: (-drawn[x][1] / drawn[x][0], x))
    rows = [dict(label=city, a=sec(-drawn[city][0]), b=sec(drawn[city][1]),
                 tone='signal' if city == 'Boston' else 'quiet') for city in shown]
    n = sum(r['n'] for rows_ in races.values() for r in rows_)
    return dict(
        values=values,
        plot=dict(form='dumbbell', rows=rows, fmt='dmins', a='10th percentile', b='90th percentile',
                  x=dict(min=-5400, max=7200, fmt='dmins', ticks=[-3600, 3600]),
                  ref=dict(axis='x', value=0, tone='ink'),
                  notes=[dict(x=0, row=len(rows) - 1, text='median', tone='ink', dy=32),
                         # The reading: Boston's back trails its median this many times as far as its front leads it.
                         dict(x=sec(drawn['Boston'][1]), row=shown.index('Boston'), text='{v}', value=values['ratio'], fmt='ratio',
                              tone='signal', dx=16, dy=6, anchor='start')]),
        cohort_n=int(n), editions_n=int(sum(len(v) for v in races.values())), weighting='editions-equal',
        method=(f'The 10th, 50th and 90th percentile finish of every edition with at least 2,000 finishes, in the '
                f'{count_phrase(len(races), "race")} with three or more such editions ({count_phrase(n, "finish")}); the ratio of the 90th '
                'percentile\'s distance from the median to the 10th\'s, edition by edition: Boston is the median over its editions, and '
                f'"elsewhere" the median over the {count_phrase(values["other_eds"], "edition")} of the other races; the chart shows the eight races with the most finishes, ranked by '
                f"the ratio of their median distances. The closest other edition ({values['other_ed_max_city']}) sits near Boston's least lopsided one."),
    )


@chart('mornings-vary-by-year')
def mornings_vary_by_year(c):
    """Start temperature of each edition (100+ finishes, a reviewed weather row): the spread across a race's years
    against the gap between the coolest and warmest race's median morning."""
    temps, label = {}, {}
    for e in range(len(c.editions)):
        if c.ed_n[e] >= MIN_CELL and np.isfinite(c.ed_temp_c[e]):
            temps.setdefault(str(c.ed_race[e]), []).append(float(c.ed_temp_c[e]))
            label[str(c.ed_race[e])] = str(c.ed_city[e])

    def summary(k):
        races = {city: t for city, t in temps.items() if len(t) >= k}
        if len(races) < 2:
            raise ValueError(f'too few races ({len(races)}) with {k} or more editions of 100+ finishes and a start temperature: '
                             'the gap between races needs two')
        meds ={city: median(t) for city, t in races.items()}
        gap = max(meds.values()) - min(meds.values())
        spans = {city: max(t) - min(t) for city, t in races.items()}
        return races, meds, gap, spans

    races, meds, gap, spans = summary(11)
    races5, meds5, gap5, spans5 = summary(5)
    allt = np.array([t for v in races5.values() for t in v])
    dev = np.array([t - np.mean(v) for v in races5.values() for t in v])
    rows = sorted(races, key=lambda x: (-spans[x], x))
    narrow = rows[-1]
    values = dict(races=int(len(races)), wider=int(sum(spans[x] > gap for x in races)), gap=sh(gap),
                  widest=sh(spans[rows[0]]), narrowest=sh(spans[narrow]), coolest_med=sh(min(meds.values())), warmest_med=sh(max(meds.values())),
                  races5=int(len(races5)), wider5=int(sum(spans5[x] > gap5 for x in races5)),
                  within=sh(float(np.var(dev) / np.var(allt))))
    n = int(sum(c.ed_n[e] for e in range(len(c.editions)) if c.ed_n[e] >= MIN_CELL and np.isfinite(c.ed_temp_c[e]) and str(c.ed_race[e]) in races))
    # Each race's spread across its years as a multiple of the gap between the races' typical mornings (the line at 1×).
    plot_rows = [dict(label=label[x], value=sh(spans[x] / gap), tone='signal') for x in rows]
    return dict(
        values=values,
        plot=dict(form='bars', fmt='ratio2', rows=plot_rows,
                  x=dict(min=0, max=3, fmt='ratio2'),
                  ref=dict(axis='x', value=1, label='gap between races', tone='ink')),
        cohort_n=n, editions_n=int(sum(len(v) for v in races.values())), weighting='editions-equal',
        method=(f'Start temperature at the scheduled start from the reviewed weather rows, one value per edition (editions with at least 100 '
                f'finishes), in the {count_phrase(len(races), "race")} with eleven or more such editions: each race\'s warmest minus its coolest '
                'morning, as a multiple of the gap between the coolest and the warmest race\'s median morning. Races are grouped by '
                'race name, so a city that changed race counts as two. These are mostly spring and autumn '
                f'races in temperate cities. Over the {count_phrase(len(races5), "race")} with five or more editions, differences between years '
                f'of the same race hold {round(values["within"] * 100)}% of the variance of start temperature.'),
    )


PROFILE = list(range(1, 8))  # 5–10K … 35–40K


def _rows(c):
    """Row indices of each edition, in cohort order."""
    if not hasattr(c, '_more_rows'):
        order = np.argsort(c.edition, kind='stable')
        c._more_rows = np.split(order, np.cumsum(np.bincount(c.edition, minlength=len(c.editions)))[:-1])
    return c._more_rows


def _profiles(c, mask, eds):
    """Each edition's median of (section pace / 5–20K pace − 1) over 5–10K … 35–40K, for the finishes in `mask`."""
    out = []
    for e in eds:
        ix = _rows(c)[e]
        ix = ix[mask[ix]]
        rel = c.paces[ix] / c.baseline[ix, None] - 1
        out.append([median(rel[:, k]) for k in PROFILE])
    return np.array(out)


def _nearest_same(P, city, year=None, gap=0):
    D = ((P[:, None, :] - P[None, :, :]) ** 2).sum(-1)
    np.fill_diagonal(D, np.inf)
    if gap:
        near = (city[:, None] == city[None, :]) & (np.abs(year[:, None] - year[None, :]) < gap)
        D[near] = np.inf
    return city[D.argmin(1)] == city


def _chance(city):
    return float(np.mean([((city == x).sum() - 1) / (len(city) - 1) for x in city]))


@chart('each-race-keeps-its-profile')
def each_race_keeps_its_profile(c):
    """Start-screened editions of 500+ finishes in races with 3+ such editions: is the nearest edition by its 7-point
    pace profile the same race?"""
    keep = c.shape_keep
    eds = [e for e in range(len(c.editions)) if keep[_rows(c)[e]].sum() >= 5 * MIN_CELL]
    races = {}
    for e in eds:
        races.setdefault(str(c.ed_race[e]), []).append(e)
    eds = np.array([e for e in eds if len(races[str(c.ed_race[e])]) >= 3])
    if not len(eds):
        raise ValueError('no race with three or more start-screened editions of 500+ finishes')
    city, year = c.ed_race[eds].astype(str), c.ed_year[eds].astype(int)
    P = _profiles(c, keep, eds)
    hit = _nearest_same(P, city)
    values = dict(share=sh(hit.mean()), chance=sh(_chance(city)), hits=int(hit.sum()), eds=int(len(eds)),
                  races=int(len(set(city))), gap3=sh(_nearest_same(P, city, year, 3).mean()))
    for g, k in ((MEN, 'men'), (WOMEN, 'women')):
        ge = np.array([e for e in eds if (keep & (c.gender == g))[_rows(c)[e]].sum() >= 5 * MIN_CELL])
        if len(ge) < 2:
            raise ValueError(f"too few start-screened editions with 500+ {k}'s finishes ({len(ge)}): the nearest other edition needs two")
        gc =c.ed_race[ge].astype(str)
        values[k] = sh(_nearest_same(_profiles(c, keep & (c.gender == g), ge), gc).mean())
        values[f'{k}_chance'] = sh(_chance(gc))
        values[f'{k}_eds'] = int(len(ge))
    # Per race, the share of its editions whose nearest edition is the same race (how many races clear half).
    per_race = [float(hit[city == x].mean()) for x in sorted(set(city))]
    values['races_half'] = int(sum(v >= 0.5 for v in per_race))
    n = int(sum(keep[_rows(c)[e]].sum() for e in eds))
    return dict(
        values=values,
        plot=dict(form='big', value=values['share'], fmt='share',
                  caption="paced most like their own race",
                  compare=[dict(label='Same race', value=values['share'], tone='signal'),
                           dict(label='A random pick', value=values['chance'], tone='ink')],
                  compareFmt='share'),
        cohort_n=n, editions_n=int(len(eds)), weighting='editions-equal',
        method=(f'Each start-screened edition with at least 500 finishes, in races with three or more such editions '
                f'({count_phrase(len(eds), "edition")}, {count_phrase(len(set(city)), "race")}, {count_phrase(n, "finish")}): the median '
                'of each 5K section\'s pace relative to the finish\'s own 5–20K pace, 5–10K to 35–40K; the nearest other edition by '
                'Euclidean distance over those seven values, against the share a random other edition would give. "The race" covers its '
                f'course, field and weather together, and is grouped by race name. In {values["races_half"]} of the '
                f'{values["races"]} races, half or more of the editions are nearest to the same race.'),
    )


def _level_pairs(order_key, tol):
    """Every pair (i, j) of positions in an array sorted by `order_key` whose keys differ by at most `tol`, offset by
    offset: yields (a, b) index arrays with b = a + k."""
    k = 1
    while k < len(order_key):
        a = np.flatnonzero(order_key[k:] - order_key[:-k] <= tol)
        if not len(a):
            return
        yield a, a + k
        k += 1


def _shape_editions(c, min_n):
    return [e for e in range(len(c.editions)) if len(_rows(c)[e]) >= min_n and c.shape_keep[_rows(c)[e][0]]]


GAP_BINS = [30, 60, 120, 240, 600]
GAP_LABELS = ['½–1', '1–2', '2–4', '4–10', '10+']
GAP_KEYS = ['g30_60', 'g1_2', 'g2_4', 'g4_10', 'g10']


@chart('late-climber-came-in-first')
def late_climber_came_in_first(c):
    """Start-screened editions of 1,000+ finishes: every pair within 2 s at the 40K mat whose 30K splits were 30+ s apart
    (finish ties dropped); how often the one behind at 30K finished ahead."""
    eds = _shape_editions(c, 10 * MIN_CELL)
    if not eds:
        raise ValueError('no start-screened editions with 1,000+ finishes')
    per = []
    for e in eds:
        ix = _rows(c)[e]
        ix = ix[np.argsort(c.times[ix, 7], kind='stable')]
        t30, t40, f = c.times[ix, 5], c.times[ix, 7], c.finish[ix]
        hit, tot = np.zeros(5), np.zeros(5)
        for a, b in _level_pairs(t40, 2):
            g, d = t30[b] - t30[a], f[b] - f[a]
            ok = (np.abs(g) >= 30) & (d != 0)
            ahead = np.where(g > 0, d < 0, d > 0)
            j = np.searchsorted(GAP_BINS, np.abs(g), side='right') - 1
            for k in range(5):
                m = ok & (j == k)
                tot[k] += m.sum()
                hit[k] += (ahead & m).sum()
        per.append((hit, tot))
    big = [h.sum() / t.sum() for h, t in per if t.sum() >= 10 * MIN_CELL]
    if not big:
        raise ValueError('no start-screened edition with 1,000+ level pairs')
    pairs =int(sum(t.sum() for _, t in per))
    values = dict(share=sh(median(big)), pooled=sh(sum(h.sum() for h, _ in per) / pairs), pairs=pairs, eds=int(len(big)),
                  eds_above_half=int(sum(x > 0.5 for x in big)), min_ed=sh(min(big)))
    for k, key in enumerate(GAP_KEYS):
        vals = [h[k] / t[k] for h, t in per if t[k] >= MIN_CELL]
        if not vals:
            raise ValueError(f'no edition with 100+ level pairs {GAP_LABELS[k]} minutes apart at 30K')
        values[key] = sh(median(vals))
        values[f'{key}_eds'] = int(len(vals))
    cols = [dict(label='All', value=values['share'], tone='signal')] + [dict(label=l, value=values[k], tone='quiet') for l, k in zip(GAP_LABELS, GAP_KEYS)]
    n = int(sum(len(_rows(c)[e]) for e in eds))
    return dict(
        values=values,
        plot=dict(form='columns', cols=cols, fmt='share', values='all',
                  y=dict(min=0, max=1, fmt='share', ticks=[0, 0.5]),
                  ref=dict(axis='y', value=0.5, tone='quiet'),
                  notes=[dict(x=3, y=0.97, text='by minutes behind at 30K', tone='ink', dy=-20)]),
        cohort_n=n, editions_n=int(len(eds)), weighting='editions-equal',
        method=(f'Every pair of finishes within 2 seconds of each other at the 40K mat whose 30K splits were at least 30 seconds apart, in the '
                f'{count_phrase(len(eds), "start-screened edition")} with at least 1,000 finishes ({pairs:,} pairs; equal finish times dropped): '
                'the share where the one behind at 30K finished ahead, edition by edition (editions with at least 1,000 such pairs, or 100 '
                f'within a gap band), as the median over editions; pooled over pairs it is {round(values["pooled"] * 100)}%. Order is clock '
                'order, not road position; a pack of k level finishes gives k(k−1)/2 pairs.'),
    )


def _avg_rank(v):
    """Average ranks (ties share the mean of their positions), as the places of a field."""
    o = np.argsort(v, kind='stable')
    s = v[o]
    start = np.r_[True, s[1:] != s[:-1]]
    first = np.flatnonzero(start)
    last = np.r_[first[1:], len(s)] - 1
    r = np.empty(len(v))
    r[o] = ((first + last) / 2)[np.cumsum(start) - 1]
    return r


@chart('steady-climbers-twice-fallers')
def steady_climbers_twice_fallers(c):
    """Start-screened editions of 1,000+ finishes: places by clock time at 20K, 25K, 30K, 35K, 40K and the finish;
    finishes that gained places in all five sections against those that lost places in all five."""
    eds = _shape_editions(c, 10 * MIN_CELL)
    if not eds:
        raise ValueError('no start-screened editions with 1,000+ finishes')
    up, down, ratios, gain = [], [], [], []
    pu = pd = pn = 0
    by = {MEN: [], WOMEN: []}
    for e in eds:
        ix = _rows(c)[e]
        d = np.diff(np.stack([_avg_rank(c.times[ix, k]) for k in range(3, 9)], 1), axis=1)
        u, w = (d < 0).all(1), (d > 0).all(1)
        gain.append((d < 0).mean(0))
        up.append(u.mean()); down.append(w.mean()); ratios.append(u.mean() / w.mean())
        pu += u.sum(); pd += w.sum(); pn += len(ix)
        for g in (MEN, WOMEN):
            m = c.gender[ix] == g
            if not c.gender_gap_edition[e] and m.sum() >= MIN_CELL:
                by[g].append((u[m].mean(), w[m].mean()))
    values = dict(ratio=sh(median(ratios)), up=sh(median(up)), down=sh(median(down)), eds=int(len(eds)),
                  eds_up_gt_down=int(sum(a > b for a, b in zip(up, down))), min_ratio=sh(min(ratios)),
                  pooled_up=sh(pu / pn), pooled_down=sh(pd / pn))
    gain = np.array(gain)
    # The share of finishes gaining places in each of the five sections: the edition median, and the lowest edition.
    values['gain_med_min'] = sh(min(median(gain[:, k]) for k in range(5)))
    values['gain_med_max'] = sh(max(median(gain[:, k]) for k in range(5)))
    values['gain_ed_min'] = sh(gain.min())
    for g, k in ((MEN, 'men'), (WOMEN, 'women')):
        a = by[g]
        if not a:
            raise ValueError(f"no start-screened edition with 100+ {k}'s finishes outside the gender-gap editions")
        values[f'{k}_up'] = sh(median([x for x, _ in a]))
        values[f'{k}_down'] = sh(median([y for _, y in a]))
        values[f'{k}_eds'] = int(len(a))
        values[f'{k}_eds_up_gt_down'] = int(sum(x > y for x, y in a))
    return dict(
        values=values,
        plot=dict(form='waffle', parts=[dict(share=values['up'], tone='signal', label='always gained'),
                                        dict(share=values['down'], tone='ink2', label='always lost')],
                  rest='mixed'),
        cohort_n=int(pn), editions_n=int(len(eds)), weighting='editions-equal',
        method=(f'Places are clock ranks within each of the {count_phrase(len(eds), "start-screened edition")} with at least 1,000 finishes '
                f'({count_phrase(pn, "finish")}), compared at 20K, 25K, 30K, 35K, 40K and the finish: the share that gained places in all '
                'five sections against the share that lost places in all five, as the median over editions. In every section after 20K the '
                f'typical edition has most finishes gaining places ({round(values["gain_med_min"] * 100)}–{round(values["gain_med_max"] * 100)}%) '
                'while a minority lose many, so steady gainers can outnumber steady losers. Outside the editions where recorded gender is '
                f'incomplete, men\'s finishes {round(values["men_up"] * 100)}% against {round(values["men_down"] * 100)}%, women\'s '
                f'{round(values["women_up"] * 100)}% against {round(values["women_down"] * 100)}%.'),
    )


@chart('in-step-and-close-in-age')
def in_step_and_close_in_age(c):
    """Granular-age, start-screened editions of 1,000+ finishes: pairs of finishes with exact ages within 5 s at all nine
    timing points, against pairs within 5 s at the finish but 30+ s apart at some mat, reweighted to the in-step pairs'
    edition × 30-minute finish band."""
    gran = {int(e) for e in c.granular_age_editions}
    eds = [e for e in _shape_editions(c, 10 * MIN_CELL) if e in gran]
    if not eds:
        raise ValueError('no granular-age start-screened editions with 1,000+ finishes')
    G = 90
    obs, ctl = {}, {}
    ident = 0
    for e in eds:
        ix = _rows(c)[e]
        ix = ix[c.exact_age_ok[ix]]
        ix = ix[np.argsort(c.finish[ix], kind='stable')]
        T, age = c.times[ix], c.exact_age[ix]
        f = T[:, 8]
        for a, b in _level_pairs(f, 5):
            D = np.abs(T[b] - T[a])
            same = (D == 0).all(1)
            ident += int(same.sum())
            ins, cl = (D.max(1) <= 5) & ~same, D[:, :8].max(1) >= 30
            gap = np.abs(age[b] - age[a]).astype(int)
            band = (np.minimum(f[a], f[b]) // 1800).astype(int)
            for s in np.unique(band):
                m = band == s
                key = (e, int(s))
                obs[key] = obs.get(key, np.zeros(G)) + np.bincount(gap[m & ins], minlength=G)
                ctl[key] = ctl.get(key, np.zeros(G)) + np.bincount(gap[m & cl], minlength=G)

    def expected(keys):
        out = np.zeros(G)
        for k in keys:
            if obs[k].sum() and ctl[k].sum():
                out += obs[k].sum() * ctl[k] / ctl[k].sum()
        return out
    if not obs:
        raise ValueError('no pairs of finishes with exact recorded ages within 5 seconds at the finish')
    O, E = sum(obs.values()), expected(list(obs))
    n_pairs = int(O.sum())
    require_cell(n_pairs, 'in-step pairs')
    if not E.sum():
        raise ValueError("no comparison pairs level only at the finish in the in-step pairs' edition and finish bands")
    o2, e2 = O[:3].sum() / O.sum(), E[:3].sum() / E.sum()
    scaled = E * O.sum() / E.sum()
    eds100 = gt = 0
    for e in eds:
        keys = [k for k in obs if k[0] == e]
        Oe = sum(obs[k] for k in keys)
        if Oe.sum() < MIN_CELL:
            continue
        Ee = expected(keys)
        eds100 += 1
        gt += int(Oe[:3].sum() / Oe.sum() > Ee[:3].sum() / Ee.sum())
    values = dict(ratio=sh(o2 / e2), obs=sh(o2), exp=sh(e2), n_pairs=n_pairs, eds_100=int(eds100), eds_obs_gt_exp=int(gt),
                  same=sh(O[0] / O.sum()), same_exp=sh(E[0] / E.sum()), hump=sh(O[29:35].sum() / scaled[29:35].sum()),
                  trough=sh(O[15:22].sum() / scaled[15:22].sum()), ctrl_pairs=int(sum(v.sum() for v in ctl.values())), identical=int(ident))
    # The gaps drawn: from 0 up to the last one before any gap holds fewer than 100 in-step pairs, at most 35 years.
    top = min(35, max(g for g in range(G) if O[: g + 1].min() >= MIN_CELL)) if O[0] >= MIN_CELL else 0
    rel = [[g, sh(O[g] / scaled[g])] for g in range(top + 1)]
    values['top_gap'] = int(top)
    n = int(sum(c.exact_age_ok[_rows(c)[e]].sum() for e in eds))
    back = min((g for g in range(25, top + 1) if O[g] / scaled[g] > 1), default=None)
    if back is None:
        raise ValueError(f'no age gap from 25 to {top} years where in-step pairs are back above 1×')
    values['back'] = int(back)
    return dict(
        values=values,
        plot=dict(form='lines',
                  series=[dict(label='In step', points=rel, tone='signal', labelAt='none')],
                  x=dict(min=-5, max=top, fmt='int', ticks=[0, 10, 20, 30], title='Years apart in recorded age'),
                  y=dict(min=0, max=5, fmt='ratio', ticks=[1, 2, 3, 4, 5], title='as often'),
                  bands=[{'axis': 'x', 'from': -0.25, 'to': 2.25, 'tone': 'signal'}],  # gaps 0, 1 and 2 years
                  refs=[dict(axis='y', value=1, tone='ink')],
                  # The comparison line is named over its left half, where the curve runs far below it.
                  notes=[dict(x=1, y=rel[1][1], text='within 2 years: {v}', value=values['ratio'], fmt='ratio', tone='signal', dx=20, dy=-6, anchor='start'),
                         dict(x=9, y=1, text='level only at the finish', tone='ink', dx=0, dy=-8, anchor='start')]),
        cohort_n=n, editions_n=int(len(eds)), weighting='pairs',
        method=(f'Pairs of finishes with exact recorded ages within 5 seconds of each other at all nine timing points (5K to 40K and the finish), '
                f'in the {count_phrase(len(eds), "start-screened edition")} with exact recorded ages and at least 1,000 finishes '
                f'({n_pairs:,} pairs; {ident} pairs identical at all nine points left out), against every pair within 5 seconds at the finish '
                'but 30 seconds or more apart at some mat, reweighted to the in-step pairs\' edition and 30-minute finish band. Pairs of '
                'finishes, not people.'),
    )


UNDER = 0.001  # the comparison's printed bound: under 0.1%


@chart('in-step-once-in-step-again')
def in_step_once_in_step_again(c):
    """Start-screened editions: pairs of finishes within 5 s at all nine timing points, keyed by their two linked records;
    every later start-screened edition both records finished, and whether they were in step again."""
    eds = _shape_editions(c, 1)
    first = {}
    pairs = 0
    # The comparison: pairs within 5 s at the finish but 30+ s apart at some mat ("level only at the finish"), of two
    # linked records that each have 2+ start-screened finishes (no other pair can share a later edition).
    rep = np.bincount(c.profile[c.shape_keep], minlength=int(c.profile.max()) + 1) >= 2
    K = np.int64(1 << 23)
    assert c.profile.max() < K
    ck, cy = [], []
    for e in eds:
        ix = _rows(c)[e]
        ix = ix[np.argsort(c.finish[ix], kind='stable')]
        T = c.times[ix]
        pr = c.profile[ix].astype(np.int64)
        for a, b in _level_pairs(T[:, 8], 5):
            D = np.abs(T[b] - T[a])
            ctl = (D[:, :8].max(1) >= 30) & rep[pr[a]] & rep[pr[b]] & (pr[a] != pr[b])
            ck.append(np.minimum(pr[a[ctl]], pr[b[ctl]]) * K + np.maximum(pr[a[ctl]], pr[b[ctl]]))
            cy.append(np.full(int(ctl.sum()), int(c.ed_year[e])))
            s = (D.max(1) <= 5) & ~(D == 0).all(1)
            pa, pb = c.profile[ix[a[s]]], c.profile[ix[b[s]]]
            year = int(c.ed_year[e])
            for p, q in zip(pa.tolist(), pb.tolist()):
                if p == q:
                    continue
                pairs += 1
                k = (min(p, q), max(p, q))
                if k not in first or year < first[k]:
                    first[k] = year
    need = np.array(sorted({p for k in first for p in k}))
    rows = np.flatnonzero(c.shape_keep & np.isin(c.profile, need))
    where = {}
    for i in rows.tolist():
        where.setdefault(int(c.profile[i]), {})[int(c.edition[i])] = i
    tally = {'all': [0, 0], '1': [0, 0], '2-3': [0, 0], '4+': [0, 0]}
    for (p, q), y0 in first.items():
        A, B = where[p], where[q]
        for e in set(A) & set(B):
            gap = int(c.ed_year[e]) - y0
            if gap <= 0:
                continue
            D = np.abs(c.times[A[e]] - c.times[B[e]])
            again = bool(D.max() <= 5 and not (D == 0).all())
            for key in ('all', '1' if gap == 1 else '2-3' if gap <= 3 else '4+'):
                tally[key][0] += 1
                tally[key][1] += int(again)
    for key, (m, _) in tally.items():
        require_cell(m, f'later shared editions {key}')
    ctrl = _later_again(c, np.concatenate(ck), np.concatenate(cy), K)
    require_cell(ctrl['later'], 'comparison later shared editions')
    sh_ = {k: sh(h / m) for k, (m, h) in tally.items()}
    values = dict(again=sh_['all'], n_later=int(tally['all'][0]), again_count=int(tally['all'][1]), again1=sh_['1'], again2_3=sh_['2-3'],
                  again4=sh_['4+'], later1=int(tally['1'][0]), later2_3=int(tally['2-3'][0]), later4=int(tally['4+'][0]),
                  keys=int(len(first)), pairs=int(pairs), ctrl_pairs=ctrl['pairs'], ctrl_keys=ctrl['keys'], ctrl_later=ctrl['later'],
                  ctrl_again_count=ctrl['again'], ctrl_again=sh(ctrl['again'] / ctrl['later']), under=UNDER)
    # The comparison prints as "under 0.1%" (a whole-percent label would read 0%, as if never).
    if not values['ctrl_again'] < UNDER:
        raise ValueError(f"pairs level only at the finish were in step again in {values['ctrl_again']:.4%} of later editions, not under {UNDER:.1%}")
    cols = [dict(label='In step at every mat', value=sh_['all'], tone='signal'),
            dict(label='Level only at finish', value=values['ctrl_again'], tone='quiet')]
    n = int(sum(len(_rows(c)[e]) for e in eds))
    return dict(
        values=values,
        plot=dict(form='columns', cols=cols, fmt='share', values='toned',
                  y=dict(min=0, max=0.4, fmt='share', ticks=[0, 0.2, 0.4]),
                  notes=[dict(x=1, y=values['ctrl_again'], text='under {v}', value=UNDER, fmt='share1', tone='quiet', dy=-10)]),
        cohort_n=n, editions_n=int(len(eds)), weighting='pairs',
        method=(f'Pairs of finishes within 5 seconds of each other at all nine timing points in the start-screened editions '
                f'({pairs:,} pairs of different linked records; pairs identical at all nine points left out), keyed by their two linked '
                f'records ({len(first):,} keys); every later start-screened edition that both records finished ({tally["all"][0]:,}), and '
                'whether the two finishes were in step at all nine points again. The comparison column does the same for pairs of linked records '
                f'within 5 seconds at the finish but 30 seconds or more apart at some mat ({ctrl["keys"]:,} keys, {ctrl["later"]:,} later '
                f'shared editions, {ctrl["again"]:,} in step). Records linked by name are candidates, not verified people.'),
    )


def _later_again(c, keys, years, K):
    """For pair keys (p·K + q) first seen in `years`: every later start-screened edition both records finished (each
    record's last finish in an edition), and how many of those were in step at all nine timing points."""
    o = np.lexsort((years, keys))
    keys, years = keys[o], years[o]
    first = np.r_[True, keys[1:] != keys[:-1]]
    uk, uy = keys[first], years[first]
    P, Q = uk // K, uk % K
    E = np.int64(len(c.editions))
    rows = np.flatnonzero(c.shape_keep)
    pe = c.profile[rows].astype(np.int64) * E + c.edition[rows]
    o = np.argsort(pe, kind='stable')
    pe, rows = pe[o], rows[o]
    last = np.r_[pe[1:] != pe[:-1], True]
    pe, rows = pe[last], rows[last]
    start, stop = np.searchsorted(pe, P * E), np.searchsorted(pe, P * E + E)
    lens = stop - start
    which = np.repeat(np.arange(len(uk)), lens)
    at = np.repeat(start, lens) + np.arange(lens.sum()) - np.repeat(np.cumsum(lens) - lens, lens)
    ra = rows[at]
    ea = c.edition[ra].astype(np.int64)
    later = c.ed_year[ea] > uy[which]
    which, ra, ea = which[later], ra[later], ea[later]
    want = Q[which] * E + ea
    j = np.minimum(np.searchsorted(pe, want), len(pe) - 1)
    ok = pe[j] == want
    ra, rb = ra[ok], rows[j[ok]]
    D = np.abs(c.times[ra] - c.times[rb])
    again = (D.max(1) <= 5) & ~(D == 0).all(1)
    return dict(pairs=int(len(keys)), keys=int(len(uk)), later=int(len(ra)), again=int(again.sum()))
