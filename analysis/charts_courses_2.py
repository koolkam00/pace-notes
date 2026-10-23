"""Top 100 charts, module charts_courses_2 (analysis/build_charts.py). Course and weather readings from the editions that
pass the start-offset screen (pacing-shape statistics): the last stretch after 40K, the quickest and slowest 5K by city,
the second 20K against the first, and morning wind and temperature against each race's usual."""
import numpy as np

from charts_common import MIN_CELL, count_phrase, load_geometry, median, quantile, require_cell, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


# Weather charts: editions with at least this many screened finishes, races with at least three such editions.
WEATHER_MIN = 5 * MIN_CELL
BOOT_DRAWS, BOOT_SEED = 2000, 20261023


def finishes(n):
    """'4,108,749 finishes' for method prose."""
    return count_phrase(n, 'finish')


def _need_city(c, city, what):
    """Refuse when a race the claim names is absent from the cohort."""
    if city not in c.cities:
        raise ValueError(f'no {city} finishes for {what}')


def _sections(c):
    """Section seconds of the eight full 5K sections (n × 8)."""
    t = c.times[:, :8]
    return np.diff(np.c_[np.zeros(len(t)), t], axis=1)


def _edition_shares(c, flag):
    """Per edition: screened finishes and the share of them with `flag` (NaN under 100)."""
    E = len(c.editions)
    k = c.shape_keep
    d = np.bincount(c.edition[k], minlength=E)
    hits = np.bincount(c.edition[k], weights=flag[k].astype(float), minlength=E)
    return d, np.where(d >= MIN_CELL, hits / np.maximum(d, 1), np.nan)


def _city_editions(c, d, min_editions=3):
    """Cities (in c.cities order) with at least `min_editions` screened editions of 100+ finishes: {city: [editions]}."""
    out = {}
    for ci, city in enumerate(c.cities):
        eds = [e for e in range(len(c.editions)) if c.ed_city[e] == city and d[e] >= MIN_CELL]
        if len(eds) >= min_editions:
            out[city] = eds
    return out


def _seq_mean(xs):
    s = 0.0
    for x in xs:
        s += float(x)
    return s / len(xs)


def _centred_weather(c, value, need_wind):
    """Editions with weather and WEATHER_MIN+ screened finishes in races with 3+ of them; each edition's temperature,
    wind and `value` minus its race's mean over those editions. Returns the editions (index order) and the arrays."""
    E = len(c.editions)
    d = np.bincount(c.edition[c.shape_keep], minlength=E)
    ok = [e for e in range(E) if d[e] >= WEATHER_MIN and np.isfinite(c.ed_temp_c[e]) and (not need_wind or np.isfinite(c.ed_wind[e]))]
    by = {}
    for e in ok:
        by.setdefault(str(c.ed_city[e]), []).append(e)
    keep = sorted(e for city, eds in by.items() if len(eds) >= 3 for e in eds)
    ct, cw, cv = {}, {}, {}
    for city, eds in by.items():
        if len(eds) < 3:
            continue
        mt, mw, mv = _seq_mean([c.ed_temp_c[e] for e in eds]), _seq_mean([c.ed_wind[e] for e in eds]) if need_wind else 0.0, _seq_mean([value[e] for e in eds])
        for e in eds:
            ct[e] = float(c.ed_temp_c[e]) - mt
            cw[e] = float(c.ed_wind[e]) - mw if need_wind else 0.0
            cv[e] = float(value[e]) - mv
    return keep, ct, cw, cv, d


def _thirds(keep, x):
    """Tercile of each edition by x (pooled thresholds; the middle third holds the lower cut)."""
    vals = [x[e] for e in keep]
    q1, q2 = quantile(vals, 1 / 3), quantile(vals, 2 / 3)
    return {e: int(x[e] >= q1) + int(x[e] >= q2) for e in keep}


KICK_ROWS = 8


@chart('finishing-kick-by-city')
def finishing_kick_by_city(c):
    """Per screened edition, the share of finishes whose pace after 40K beat their 35–40K pace; the largest races."""
    kick = c.paces[:, 8] < c.paces[:, 7]
    d, shares = _edition_shares(c, kick)
    rows, used = [], []
    sizes = {city: int(sum(d[e] for e in eds)) for city, eds in _city_editions(c, d).items()}
    largest = sorted(sizes, key=lambda city: (-sizes[city], city))[:KICK_ROWS]
    for city, eds in _city_editions(c, d).items():
        total = sizes[city]
        if city not in largest:
            continue
        require_cell(min(d[e] for e in eds), f'{city} edition')
        v = [float(shares[e]) for e in eds]
        rows.append(dict(label=city, lo=sh(min(v)), mid=sh(median(v)), hi=sh(max(v)), total=total))
        used += eds
    if len(rows) < 2:
        raise ValueError('too few races with three screened editions of 100+ finishes')
    rows.sort(key=lambda r: (-r['mid'], r['label']))
    top, bottom = rows[0], rows[-1]
    # The reading is the race whose finishes kicked least (signal); the race with the highest median is the comparison (ink).
    for r in rows:
        r['tone'] = 'signal' if r is bottom else 'ink' if r is top else 'quiet'
    n_min = min(r.pop('total') for r in rows)
    n = int(sum(d[e] for e in used))
    others_low = min(r['lo'] for r in rows if r is not bottom)
    return dict(
        values=dict(top_city=top['label'], bottom_city=bottom['label'], chi=top['mid'], bos=bottom['mid'], chi_low=top['lo'],
                    bos_high=bottom['hi'], second_low=rows[-2]['mid'], others_low=others_low, n_min=n_min),
        plot=dict(form='range', rows=[dict(label=r['label'], tone=r['tone'], lo=r['lo'], mid=r['mid'], hi=r['hi']) for r in rows],
                  x=dict(min=0.4, max=1, fmt='share', ticks=[0.5, 0.7, 0.9]), fmt='share',
                  legend=dict(lo='', mid='', hi=''),
                  key=[dict(label='typical edition', tone='ink', mark='dot'), dict(label='lowest to highest edition', tone='quiet', mark='line')]),
        cohort_n=n, editions_n=len(used), weighting='editions-equal',
        method=(f'Finishes in start-screened editions of the eight races with the most such finishes ({finishes(n)}, '
                f'{len(used)} editions): per edition, the share whose pace from 40K to the finish was quicker than their 35–40K pace; '
                'each race shows its lowest, median and highest edition.'),
    )


@chart('downhill-start-quick-first-5k')
def downhill_start_quick_first_5k(c):
    """Per city, the share of screened finishes whose quickest of the eight full 5K sections was the first, against the
    supplied route's net gradient over its first 5 km."""
    s = _sections(c)
    first = np.argmin(s, axis=1) == 0
    geo = {g['city']: g for g in load_geometry()['courses']}
    pts = []
    for ci, city in enumerate(c.cities):
        # New York's and Dubai's profiles read the water under a bridge deck, so their first-5K elevation is not usable.
        if city not in geo or city in ('New York', 'Dubai'):
            continue
        g = geo[city]
        assert g['elevation_step_km'] == 0.5
        m = c.shape_keep & (c.city == ci)
        if m.sum() < 10 * MIN_CELL:
            continue
        require_cell(m.sum(), city)
        grade = (g['elevation_m'][10] - g['elevation_m'][0]) / 5000
        pts.append(dict(city=city, x=sh(grade), y=sh(first[m].mean()), total=int(m.sum())))
    if len(pts) < 3:
        raise ValueError('too few races with a route profile and 1,000+ screened finishes')
    xs, ys = np.array([p['x'] for p in pts]), np.array([p['y'] for p in pts])
    rr = float(np.corrcoef(xs, ys)[0, 1])
    b = float(((xs - xs.mean()) * (ys - ys.mean())).sum() / ((xs - xs.mean()) ** 2).sum())
    a = float(ys.mean() - b * xs.mean())
    lo, hi = float(xs.min()), float(xs.max())
    n = int(sum(p['total'] for p in pts))
    uphill = [p for p in pts if p['x'] > UPHILL]
    falling = [p for p in pts if p['x'] < -UPHILL]
    if len(uphill) < 2 or len(falling) < 3:
        raise ValueError('too few races whose first 5K climbs or falls more than 0.3%')
    # The reading: the races whose first 5K climbs most (the signal group), with the highest share among them noted;
    # the races whose first 5K falls most are the comparison (ink), with their median noted on its dot.
    top_up = max(uphill, key=lambda p: (p['y'], p['city']))
    fall_med = sh(median([p['y'] for p in falling]))
    med_dot = min(falling, key=lambda p: (abs(p['y'] - fall_med), p['city']))
    climb_lo = min(p['x'] for p in uphill)
    fall_hi = max(p['x'] for p in falling)
    below = [p['x'] for p in pts if 0 < p['x'] <= UPHILL]
    above = [p['x'] for p in pts if -UPHILL <= p['x'] < 0]
    up_ids, fall_ids = {id(p) for p in uphill}, {id(p) for p in falling}

    def dot(p):
        if id(p) in up_ids:
            return dict(x=p['x'], y=p['y'], tone='signal', r=5)
        if id(p) in fall_ids:
            return dict(x=p['x'], y=p['y'], tone='ink', r=4.5)
        return dict(x=p['x'], y=p['y'], tone='quiet')
    points = [dot(p) for p in pts]
    return dict(
        values=dict(uphill_max=top_up['y'], uphill_max_grade=top_up['x'], uphill_races=len(uphill), climb_lo=climb_lo,
                    next_climb=max(below, default=0.0), falling_median=fall_med, falling_races=len(falling), fall_hi=fall_hi,
                    next_fall=min(above, default=0.0), r=sh(rr), cities=len(pts), n_min=min(p['total'] for p in pts)),
        plot=dict(form='scatter', points=points,
                  x=dict(min=-0.022, max=0.016, fmt='dpct', ticks=[-0.02, -0.01, 0, 0.01], title='Net gradient of the first 5K: downhill ← → uphill'),
                  notes=[dict(x=top_up['x'], y=top_up['y'], text='{v}', value=top_up['y'], fmt='share', tone='signal', anchor='start', dx=6, dy=16),
                         dict(x=med_dot['x'], y=med_dot['y'], text='{v}', value=fall_med, fmt='share', anchor='middle', dy=24)],
                  y=dict(min=0, max=0.8, fmt='share', ticks=[0, 0.2, 0.4, 0.6, 0.8], title='quickest 5K first'),
                  fit=dict(x0=lo, y0=sh(a + b * lo), x1=hi, y1=sh(a + b * hi))),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[c.shape_keep & np.isin(c.city, [c.cities.index(p['city']) for p in pts])]))), weighting='pooled',
        method=(f'Finishes in start-screened editions of {len(pts)} races with a supplied route profile and 1,000+ such finishes '
                f'({finishes(n)}): the share whose quickest of the eight full 5K sections was 0–5K, against the route\'s '
                'net elevation change over its first 5 km as a gradient (New York and Dubai, whose profiles read the water under a bridge, '
                'are left out); the line is a least-squares fit. The highlighted races are those whose first 5 km climbs more than 0.3% net, '
                'with the highest share among them noted; the falling-start figure is the median over races whose first 5 km falls more than 0.3% net.'),
    )


UPHILL = 0.003  # a first 5K that climbs more than 0.3% net

SLOWEST_ROWS = ['Boston', 'London', 'Berlin']


@chart('boston-slowest-before-35k')
def boston_slowest_before_35k(c):
    """Which full 5K section was each screened finish's slowest: before 30K, 30–35K or 35–40K, by city and over all."""
    for city in SLOWEST_ROWS:
        _need_city(c, city, 'the slowest-5K rows')
    s = _sections(c)
    slowest = np.argmax(s, axis=1)
    k = c.shape_keep

    def parts(m):
        require_cell(m.sum(), 'slowest-5K group')
        # 30–35K, 35–40K and 0–30K.
        return [sh((slowest[m] == 6).mean()), sh((slowest[m] == 7).mean()), sh((slowest[m] <= 5).mean())]

    groups = {city: parts(k & c.mask_city(city)) for city in SLOWEST_ROWS}
    groups['All races'] = parts(k)
    bos = c.mask_city('Boston')
    E = len(c.editions)
    d = np.bincount(c.edition[k], minlength=E)
    a = np.bincount(c.edition[k & (slowest == 6)], minlength=E)
    b = np.bincount(c.edition[k & (slowest == 7)], minlength=E)
    beds = [e for e in range(E) if c.ed_city[e] == 'Boston' and d[e] >= MIN_CELL]
    lead = sum(1 for e in beds if a[e] > b[e])
    n = int(k.sum())
    # One bar per group: the share whose slowest 5K was 30–35K. Boston is the reading, all races the comparison.
    tone = {'Boston': 'signal', 'All races': 'ink'}
    rows = [dict(label=g, tone=tone.get(g, 'quiet'), value=v[0]) for g, v in groups.items()]
    bp = groups['Boston']
    return dict(
        values=dict(b=bp[0], b_late=bp[1], b_early=bp[2], typ=groups['All races'][0], london=groups['London'][0], berlin=groups['Berlin'][0],
                    eds=int(lead), boston_editions=len(beds), boston_n=int((k & bos).sum())),
        plot=dict(form='bars', rows=rows, x=dict(min=0, max=0.5, fmt='share'), fmt='share'),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[k]))), weighting='pooled',
        method=(f'Finishes in start-screened editions ({finishes(n)}): which of the eight full 5K sections was slowest, '
                'grouped as 0–30K, 30–35K and 35–40K, for three races and for every race pooled; each bar is the share whose slowest was 30–35K.'),
    )


@chart('wind-about-the-same')
def wind_about_the_same(c):
    """Editions grouped into thirds by how windy, and by how warm, their morning was against their race's usual; each
    third's mean sustained slowdown share against its race's usual (editions equal), with a city-resampled interval."""
    E = len(c.editions)
    _, slow_ed = _edition_shares(c, c.slow)
    keep, ct, cw, cs, d = _centred_weather(c, slow_ed, need_wind=True)
    if len(keep) < 9:
        raise ValueError(f'too few weather editions with {WEATHER_MIN}+ screened finishes in races with three or more')
    gw, gt = _thirds(keep, cw), _thirds(keep, ct)

    def mean_of(g, j):
        return _seq_mean([cs[e] for e in keep if g[e] == j])
    wind = [mean_of(gw, j) for j in range(3)]
    temp = [mean_of(gt, j) for j in range(3)]
    # The windy third's interval: resample races with replacement (a fixed Park–Miller stream, shared with the recount).
    cities = sorted({c.cities.index(str(c.ed_city[e])) for e in keep})
    num = {ci: 0.0 for ci in cities}
    den = {ci: 0 for ci in cities}
    for e in keep:
        if gw[e] == 2:
            ci = c.cities.index(str(c.ed_city[e]))
            num[ci] += cs[e]
            den[ci] += 1
    state, boots = BOOT_SEED, []
    for _ in range(BOOT_DRAWS):
        sn, sd = 0.0, 0
        for _ in cities:
            state = state * 48271 % 2147483647
            ci = cities[state % len(cities)]
            sn += num[ci]
            sd += den[ci]
        if sd:
            boots.append(sn / sd)
    if not boots:
        raise ValueError('no windy-third editions to resample')
    lo_b, hi_b = quantile(boots, 0.025), quantile(boots, 0.975)
    for j in range(3):
        require_cell(sum(d[e] for e in keep if gw[e] == j), 'wind third')
        require_cell(sum(d[e] for e in keep if gt[e] == j), 'temperature third')
    # The two outer thirds of each: temperature first (the reading), then wind; the middle thirds sit near zero.
    rows = [
        dict(label='Warmer than usual', tone='signal', value=sh(temp[2])),
        dict(label='Cooler than usual', tone='quiet', value=sh(temp[0])),
        dict(label='Windier than usual', tone='ink', value=sh(wind[2])),
        dict(label='Calmer than usual', tone='quiet', value=sh(wind[0])),
    ]
    n = int(sum(d[e] for e in keep))
    return dict(
        values=dict(windy=sh(wind[2]), windy_lo=sh(lo_b), windy_hi=sh(hi_b), calm=sh(wind[0]), wind_usual=sh(wind[1]),
                    warm=sh(temp[2]), cool=sh(temp[0]), temp_usual=sh(temp[1]), editions=len(keep), races=len(cities)),
        plot=dict(form='bars', rows=rows, x=dict(min=-0.06, max=0.06, fmt='dpts'), fmt='dpts', diverging=True),
        cohort_n=n, editions_n=len(keep), weighting='editions-equal',
        method=(f'{len(keep)} start-screened editions with {WEATHER_MIN}+ finishes and a reviewed weather row, from {len(cities)} races with three or more '
                f'({finishes(n)}): each edition\'s sustained slowdown share, start wind and start temperature minus its race\'s '
                'mean, grouped into thirds of the wind and of the temperature deviation; each bar is a third\'s mean, editions equal. '
                f'The windy third\'s 95% interval resamples races ({BOOT_DRAWS:,} draws). Weather is edition context, never a personal exposure.'),
    )


STRIP_R = 7  # large dots, so the swarm fills more of the card's frame
SAME = 0.005  # a weather gap under half a point reads "about the same"


@chart('cooler-mornings-more-even-pacing')
def cooler_mornings_more_even_pacing(c):
    """Even-paced finishes (every full 5K within 3% of the mean 5K pace) against the race's usual, by morning temperature:
    per race, its editions in the warmest third against those in the coolest third."""
    s = _sections(c)
    mean5 = c.times[:, 7] / 8
    even = (np.abs(s / mean5[:, None] - 1) <= 0.03).all(axis=1)
    _, even_ed = _edition_shares(c, even)
    keep, ct, _, cv, d = _centred_weather(c, even_ed, need_wind=False)
    if len(keep) < 9:
        raise ValueError(f'too few weather editions with {WEATHER_MIN}+ screened finishes in races with three or more')
    gt = _thirds(keep, ct)
    by = {}
    for e in keep:
        by.setdefault(str(c.ed_city[e]), []).append(e)
    dots = []
    for city in sorted(by):
        eds = by[city]
        warm, cool = [e for e in eds if gt[e] == 2], [e for e in eds if gt[e] == 0]
        if len(eds) < 5 or not warm or not cool:
            continue
        require_cell(sum(d[e] for e in warm), f'{city} warm third')
        require_cell(sum(d[e] for e in cool), f'{city} cool third')
        dots.append(dict(city=city, v=sh(_seq_mean([cv[e] for e in warm]) - _seq_mean([cv[e] for e in cool]))))
    if len(dots) < 2:
        raise ValueError('too few races with five weather editions and both a warm and a cool third')
    dots.sort(key=lambda x: (x['v'], x['city']))
    lower = sum(1 for x in dots if x['v'] < 0)
    # A gap under half a point is "about the same" (as on every weather card): those races are the ink group, the races
    # whose warmer mornings had a share at least half a point lower are the signal group.
    clear = sum(1 for x in dots if x['v'] <= -SAME)
    same = sum(1 for x in dots if abs(x['v']) < SAME)
    xs = np.array([ct[e] for e in keep]); ys = np.array([cv[e] for e in keep])
    terc = [_seq_mean([cv[e] for e in keep if gt[e] == j]) for j in range(3)]
    n = int(sum(d[e] for e in keep))
    sig = [x['v'] for x in dots if x['v'] <= -SAME]
    inks = [x['v'] for x in dots if abs(x['v']) < SAME]
    notes = []
    if sig:
        notes.append(dict(x=sh(median(sig)), row=0, text='{v} races lower', value=clear, fmt='int', tone='signal', anchor='middle', dy=-30))
    if inks:
        notes.append(dict(x=sh(max(inks)), row=0, text='{v} about the same', value=same, fmt='int', anchor='end', dx=4, dy=40))
    return dict(
        values=dict(races=len(dots), lower=int(lower), lower_clear=int(clear), same=int(same), warm=sh(terc[2]), cool=sh(terc[0]),
                    r=sh(float(np.corrcoef(xs, ys)[0, 1])), widest=dots[0]['city'], widest_gap=dots[0]['v'], narrowest=dots[-1]['city'],
                    narrowest_gap=dots[-1]['v'], editions=len(keep)),
        plot=dict(form='strip', groups=[dict(label='Races', dots=[dict(v=x['v'], tone='signal' if x['v'] <= -SAME else 'ink' if abs(x['v']) < SAME else 'quiet') for x in dots])],
                  x=dict(min=-0.12, max=0.01, fmt='dpts', ticks=[-0.1, -0.05, 0], title='Even-paced share, warmer minus cooler mornings'),
                  refs=[dict(axis='x', value=0, tone='ink')], notes=notes, r=5),
        cohort_n=n, editions_n=len(keep), weighting='editions-equal',
        method=(f'{len(keep)} start-screened editions with {WEATHER_MIN}+ finishes and a reviewed start temperature, from races with three or more '
                f'({finishes(n)}): each edition\'s share of even-paced finishes (every full 5K within 3% of the mean 5K pace) and '
                'its start temperature minus its race\'s mean; editions grouped into thirds of the temperature deviation; each dot is one race with '
                'five or more such editions, its warmest-third mean minus its coolest-third mean; a gap under half a point counts as about the same. '
                'Weather is edition context, never a personal exposure.'),
    )


@chart('second-20k-quicker-by-city')
def second_20k_quicker_by_city(c):
    """Per screened edition, the share of finishes whose 20–40K took less time than their 0–20K; each race's mean over its
    editions (editions equal)."""
    t = c.times
    neg = (t[:, 7] - t[:, 3]) < t[:, 3]
    d, shares = _edition_shares(c, neg)
    pts, used = [], []
    for city, eds in _city_editions(c, d).items():
        require_cell(min(d[e] for e in eds), f'{city} edition')
        pts.append(dict(city=city, v=sh(_seq_mean([shares[e] for e in eds])), total=int(sum(d[e] for e in eds))))
        used += eds
    ny = next((p for p in pts if p['city'] == 'New York'), None)
    if ny is None or len(pts) < 2:
        raise ValueError('no New York row among races with three screened editions of 100+ finishes')
    pts.sort(key=lambda p: (-p['v'], p['city']))
    top = pts[0]
    if ny['v'] <= 0:
        raise ValueError('no New York finishes with a quicker second 20K')
    # Only the two races the takeaway names: a leader from above to a race inside the swarm would cross other dots.
    labels = {'New York', top['city']}
    dots = [dict(v=p['v'], tone='signal' if p is top else 'ink' if p is ny else 'quiet', **({'label': p['city']} if p['city'] in labels else {})) for p in pts]
    n = int(sum(d[e] for e in used))
    return dict(
        values=dict(top_city=top['city'], top=top['v'], second=pts[1]['v'], ny=ny['v'], ratio=sh(top['v'] / ny['v']), lowest_city=pts[-1]['city'], cities=len(pts),
                    n_min=min(p['total'] for p in pts)),
        plot=dict(form='strip', groups=[dict(label='Races', dots=dots)],
                  x=dict(min=0, max=0.2, fmt='share', ticks=[0, 0.05, 0.1, 0.15, 0.2], title='Finishes with a quicker 20–40K than 0–20K'), r=9),
        cohort_n=n, editions_n=len(used), weighting='editions-equal',
        method=(f'Finishes in start-screened editions of the {len(pts)} races with three or more screened editions of {MIN_CELL}+ finishes ({finishes(n)}, {len(used)} editions): '
                'per edition, the share whose 20–40K took less time than their 0–20K; each race\'s mean over its editions.'),
    )



# new-york-sped-up-at-25k: a finish sped up over 25–30K when that 5K took at most 98% of its 20–25K time (at least 2%
# quicker); races with three or more screened editions of this many finishes; New York's finish bands (clock time,
# half-hour steps from under 3:00 to 6:00+) for the guard.
REBOUND_MARGIN = 0.02
REBOUND_EDITION_MIN = 3 * MIN_CELL
REBOUND_CUTS = (3, 3.5, 4, 4.5, 5, 5.5, 6)


def _pct_label(v):
    """A share as a whole-percent label ('61%'), rounded half up like the recount."""
    return f'{int(np.floor(v * 100 + 0.5))}%'


@chart('new-york-sped-up-at-25k')
def new_york_sped_up_at_25k(c):
    """The share of screened finishes that ran 25–30K at least 2% quicker than their 20–25K, each race's typical edition
    (the reading: New York's); New York's finish bands against the other races' bands and records linked by name in
    New York and elsewhere as guards."""
    _need_city(c, 'New York', 'the 25–30K speed-up')
    s = _sections(c)
    sped = s[:, 5] <= (1 - REBOUND_MARGIN) * s[:, 4]
    quick_any = s[:, 5] < s[:, 4]
    k = c.shape_keep
    E = len(c.editions)
    d = np.bincount(c.edition[k], minlength=E)
    hit = np.bincount(c.edition[k], weights=sped[k].astype(float), minlength=E)
    hit_any = np.bincount(c.edition[k], weights=quick_any[k].astype(float), minlength=E)
    races = {}
    for city in c.cities:
        eds = [e for e in range(E) if c.ed_city[e] == city and d[e] >= REBOUND_EDITION_MIN]
        if len(eds) >= 3:
            races[city] = eds
    if 'New York' not in races or len(races) < 5:
        raise ValueError(f'too few races (or no New York) with three screened editions of {REBOUND_EDITION_MIN}+ finishes')
    race_n = {city: require_cell(int(sum(d[e] for e in eds)), f'{city} screened finishes') for city, eds in races.items()}
    typ_ed = {city: median([hit[e] / d[e] for e in eds]) for city, eds in races.items()}
    typ_any = {city: median([hit_any[e] / d[e] for e in eds]) for city, eds in races.items()}
    ny_eds = races['New York']
    ny_ed = [hit[e] / d[e] for e in ny_eds]
    used = sorted(e for eds in races.values() for e in eds)
    inset = k & np.isin(c.edition, used)
    is_ny_all = c.mask_city('New York')
    band = np.searchsorted(np.array(REBOUND_CUTS) * 3600, c.finish, side='right')
    ny_band, ot_band, ny_band_n = [], [], []
    for b in range(len(REBOUND_CUTS) + 1):
        mb = inset & (band == b)
        ny_band_n.append(require_cell((mb & is_ny_all).sum(), f'New York finish band {b}'))
        require_cell((mb & ~is_ny_all).sum(), f'other races finish band {b}')
        ny_band.append(sh(sped[mb & is_ny_all].mean()))
        ot_band.append(sh(sped[mb & ~is_ny_all].mean()))
    others = sorted(((v, city) for city, v in typ_ed.items() if city != 'New York'), reverse=True)
    # Records linked by name with a screened finish in New York and one elsewhere: their 25–30K speed-ups in each.
    idx = np.flatnonzero(k)
    is_ny = is_ny_all[idx]
    prof = c.profile[idx]
    both = np.intersect1d(np.unique(prof[is_ny]), np.unique(prof[~is_ny]))
    linked = np.isin(prof, both)
    ln_ny, ln_ot = idx[linked & is_ny], idx[linked & ~is_ny]
    require_cell(len(ln_ny), 'linked New York finishes')
    require_cell(len(ln_ot), 'linked finishes elsewhere')
    ny_n = require_cell((inset & is_ny_all).sum(), 'New York')
    n = int(inset.sum())
    typ = sh(median(list(typ_ed.values())))
    ny = sh(typ_ed['New York'])
    order = sorted(typ_ed, key=lambda city: (typ_ed[city], city))
    race_dots = [dict(v=sh(typ_ed[city]), tone='signal' if city == 'New York' else 'quiet') for city in order]
    v = dict(
        margin=REBOUND_MARGIN, ny=ny, typ=typ, next_city=others[0][1], next=sh(others[0][0]),
        ny_lo=sh(min(ny_ed)), ny_hi=sh(max(ny_ed)), ny_editions=len(ny_eds), ny_n=ny_n, races=len(races),
        race_n_min=min(race_n.values()),
        ny_any=sh(typ_any['New York']), typ_any=sh(median(list(typ_any.values()))),
        band_min=min(ny_band), band_max=max(ny_band), other_band_max=max(ot_band), band_n_min=min(ny_band_n),
        linked=int(len(both)), linked_ny=sh(sped[ln_ny].mean()), linked_other=sh(sped[ln_ot].mean()),
        linked_ny_n=int(len(ln_ny)), linked_other_n=int(len(ln_ot)),
    )
    return dict(
        values=v,
        plot=dict(form='strip', groups=[dict(label=f'{len(races)} races', dots=race_dots)],
                  x=dict(min=0, max=0.5, fmt='share', ticks=[0, 0.25, 0.5], title='Finishes 2%+ quicker over 25–30K than 20–25K'),
                  refs=[dict(axis='x', value=typ, label='typical race', tone='ink')],
                  # New York's name and value sit to the left of its dot, in the open stretch between the races.
                  notes=[dict(x=ny, row=0, text='New York {v}', value=ny, fmt='share', tone='signal', anchor='end', dx=-(STRIP_R + 6), dy=5)],
                  r=STRIP_R),
        cohort_n=n, editions_n=len(used), weighting='editions-equal',
        method=(f'Finishes in start-screened editions of the {len(races)} races with three or more such editions of {REBOUND_EDITION_MIN}+ finishes '
                f'({finishes(n)}, {len(used)} editions): the share whose 25–30K took at most 98% of their 20–25K time (at least 2% quicker). '
                'Each race dot is its typical edition (the median over its editions) and the typical race is the median of those dots. '
                f'New York\'s {len(ny_eds)} editions range from {_pct_label(min(ny_ed))} to {_pct_label(max(ny_ed))}; pooled in half-hour finish bands '
                f'from under 3:00 to 6:00+, its lowest band ({_pct_label(min(ny_band))}) is above the other races\' highest ({_pct_label(max(ot_band))}). '
                f'Counting any quicker 25–30K, the typical New York edition has {_pct_label(typ_any["New York"])} and the typical race {_pct_label(median(list(typ_any.values())))}. '
                f'{count_phrase(len(both), "record")} linked by name with finishes in New York and in another race sped up by 2% or more in '
                f'{_pct_label(sped[ln_ny].mean())} of their New York finishes and {_pct_label(sped[ln_ot].mean())} of their finishes elsewhere.'),
    )
