"""Courses, weather and the years.

Three descriptive views of the same eligible finishes:

* Course fingerprints. Each course's pace curve is the mean of its editions'
  median relative-pace curves. The typical curve is the median across courses.
  Removing each edition's overall fade (a fitted multiple of the typical
  curve) leaves a residual "signature", and a leave-one-edition-out
  nearest-centroid test asks how often that shape alone names the course.
* Race-morning weather. Each edition is weighted equally and paired with the
  supplied modelled weather hour at the scheduled start, read from the
  verified runner-context shards. Within-course slopes compare editions of the
  same course, and intervals resample whole courses. This is an edition-level
  overlay, never personal exposure, and it is not the prespecified weather
  screen.
* The years. Field sizes are eligible finishes in this dataset, not official
  participation. A within-course comparison sets 2015-19 against 2022-26
  editions of the same high-coverage courses.

The start-offset editions are left out of every shape statistic (fingerprints,
fade, heat signature). Finish-time, slowdown and weather statistics keep them.
"""
import gzip
import json
from pathlib import Path

import numpy as np

from build_all_finisher_context import verified_context
from build_fast_start import digest, require, verified_manifest
from insights_data import SECTION_KM, relative_pace, start_offset_screen, sustained_slowdown
from insights_stats import MIN_CELL, SEED, r

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = ['0–5', '5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2']
W = SECTION_KM / 42.195
SW = np.sqrt(W)
BOOT = 4000
PAIR_GAP_C = 5.0
ERA_PRE, ERA_POST = (2015, 2019), (2022, 2026)
COVERAGE_MIN = .95
MATCH_BANDS = [(240, 270), (270, 300), (300, 330), (330, 360), (360, 420)]  # 5–20 km pace, s/km
FINISH_BANDS = [(0, 10800, 'Under 3:00'), (10800, 14400, '3:00–3:59'), (14400, 18000, '4:00–4:59'), (18000, 10 ** 9, '5:00 and over')]
CURVE_TEMPS = [0, 5, 10, 15, 20]


def pace_label(s):
    return f'{s // 60}:{s % 60:02d}'


# ---------------------------------------------------------------- context

def edition_context(editions):
    """Weather and terrain per edition from the verified runner-context shards."""
    pin = json.loads((ROOT / 'analysis/release.json').read_text())
    runner_manifest, runner_hash = verified_manifest(ROOT / 'public/data/runners', pin, ROOT / 'analysis')
    require([dict(city=e['city'], year=e['year']) for e in runner_manifest['editions']] ==
            [dict(city=e['city'], year=e['year']) for e in editions], 'Edition list differs from the runner manifest')
    context_root = ROOT / 'public/data/runner-context'
    _, manifest, _ = verified_context(context_root, runner_manifest, runner_hash, ROOT / 'analysis')
    out = []
    for index in range(len(editions)):
        item = manifest['editions'][str(index)]
        compressed = (context_root / item['file']).read_bytes()
        require(len(compressed) == item['bytes'] and digest(compressed) == item['sha256'], f'Context shard changed: {index}')
        shard = json.loads(gzip.decompress(compressed))
        out.append(dict(weather=shard['weather'], terrain=shard['terrain']))
    return out


# ---------------------------------------------------------------- edition table

def edition_rows(f, detected, R, block, after20):
    order = np.argsort(f.edition, kind='stable')
    uniq, starts = np.unique(f.edition[order], return_index=True)
    ends = np.r_[starts[1:], len(order)]
    rows = []
    for e, a, b in zip(uniq, starts, ends):
        idx = order[a:b]
        if len(idx) < MIN_CELL:
            continue
        fin = f.finish[idx]
        ed = f.editions[e]
        rows.append(dict(
            e=int(e), city=ed['city'], year=int(ed['year']), race=ed.get('race', ''), idx=idx, n=int(len(idx)),
            median=float(np.median(fin)), p10=float(np.quantile(fin, .1)), p90=float(np.quantile(fin, .9)),
            slowdown=float(detected[idx].mean()), block=float(np.median(block[idx])), block10=float((block[idx] > 10).mean()),
            after20=float(np.median(after20[idx])), sub3=float((fin < 10800).mean()), sub4=float((fin < 14400).mean()),
            women=float((f.gender[idx] == 2).mean()), baseline=float(np.median(f.baseline[idx])),
            curve=np.median(R[idx], axis=0)))
    return rows


def fade_fit(x, typical):
    A = np.c_[np.ones(9), typical]
    coef = np.linalg.lstsq(A * SW[:, None], x * SW, rcond=None)[0]
    return float(coef[1]), x - A @ coef


def weighted_distance(a, b):
    return float(np.sqrt((((a - b) ** 2) * W).sum()))


def correlation_distance(a, b):
    return 1.0 - float(np.corrcoef(a, b)[0, 1])


def identify(pool, key, distance, shape=None):
    """Leave-one-edition-out nearest course centroid.

    Without `shape`, rows carry a precomputed vector `key`. With `shape` (every shape edition, each with a `curve`), the
    held-out edition is also left out of the typical curve, and every vector is rebuilt from that typical curve: `key`
    'residual' removes each edition's fade, 'deviation' subtracts the typical curve.
    """
    out = []
    for k, row in enumerate(pool):
        rest = [p for j, p in enumerate(pool) if j != k]
        if shape is None:
            vec = lambda p: p[key]
        else:
            others = [p for p in shape if p is not row]
            names = sorted({p['city'] for p in others})
            typical = np.median(np.array([np.mean([p['curve'] for p in others if p['city'] == c], axis=0) for c in names]), axis=0)
            vec = (lambda p, t=typical: fade_fit(p['curve'], t)[1]) if key == 'residual' else (lambda p, t=typical: p['curve'] - t)
        cities = sorted({p['city'] for p in rest})
        vectors = [(p['city'], vec(p)) for p in rest]
        centroids = {c: np.mean([v for city, v in vectors if city == c], axis=0) for c in cities}
        x = vec(row)
        ranked = sorted(cities, key=lambda c: distance(x, centroids[c]))
        out.append(dict(city=row['city'], year=row['year'], predicted=ranked[0], rank=ranked.index(row['city']) + 1,
                        candidates=len(cities)))
    return out


# ---------------------------------------------------------------- within-course regression

class Within:
    """Course-demeaned OLS with a course-cluster bootstrap. Each course keeps its own demeaned rows when resampled."""

    def __init__(self, rows, ycol, xcols, rng, reps=BOOT):
        rows = [p for p in rows if all(p.get(c) is not None for c in [ycol, *xcols])]
        cities = sorted({p['city'] for p in rows})
        X, y, groups = [], [], []
        for c in cities:
            g = [p for p in rows if p['city'] == c]
            Xc = np.array([[p[x] for x in xcols] for p in g], float)
            yc = np.array([p[ycol] for p in g], float)
            X.append(Xc - Xc.mean(0))
            y.append(yc - yc.mean())
            groups.append(c)
        self.editions, self.courses = len(rows), len(cities)
        Xa, ya = np.concatenate(X), np.concatenate(y)
        self.coef = np.linalg.lstsq(Xa, ya, rcond=None)[0]
        resid = ya - Xa @ self.coef
        self.r2 = float(1 - (resid ** 2).sum() / (ya ** 2).sum())
        XtX = np.array([x.T @ x for x in X])
        Xty = np.array([x.T @ v for x, v in zip(X, y)])
        draws = []
        for _ in range(reps):
            pick = rng.integers(0, len(cities), len(cities))
            try:
                draws.append(np.linalg.solve(XtX[pick].sum(0), Xty[pick].sum(0)))
            except np.linalg.LinAlgError:
                continue
        self.draws = np.array(draws)

    def ci(self, weights):
        values = self.draws @ np.asarray(weights, float)
        return [r(np.percentile(values, 2.5), 4), r(np.percentile(values, 97.5), 4)]

    def slope(self, scale=1.0):
        return dict(slope=r(self.coef[0] * scale, 4), ci95=self.ci([scale] + [0] * (len(self.coef) - 1)),
                    r2=r(self.r2, 4), editions=self.editions, courses=self.courses)


def pooled_fit(rows, ycol, xcol):
    x = np.array([p[xcol] for p in rows], float)
    y = np.array([p[ycol] for p in rows], float)
    slope, intercept = np.polyfit(x, y, 1)
    resid = y - (slope * x + intercept)
    return dict(slope=r(slope, 4), r2=r(1 - (resid ** 2).sum() / ((y - y.mean()) ** 2).sum(), 4), editions=len(rows))


# ---------------------------------------------------------------- build

def build(f):
    rng = np.random.default_rng(SEED)
    detected, _ = sustained_slowdown(f)
    R = relative_pace(f)
    block = 100 * ((f.times[:, 7] - f.times[:, 3]) / f.times[:, 3] - 1)
    after20 = (f.times[:, 8] - f.times[:, 3]) - 22.195 * f.baseline
    keep_shape, offset_audit = start_offset_screen(f)
    offset_keys = {(a['city'], a['year']) for a in offset_audit}
    rows = edition_rows(f, detected, R, block, after20)
    for p in rows:
        p['shape'] = (p['city'], p['year']) not in offset_keys

    # ---- fingerprints (shape editions only)
    shape = [p for p in rows if p['shape']]
    cities = sorted({p['city'] for p in shape})
    city_curve = {c: np.mean([p['curve'] for p in shape if p['city'] == c], axis=0) for c in cities}
    typical = np.median(np.array([city_curve[c] for c in cities]), axis=0)
    for p in shape:
        p['fade'], p['residual'] = fade_fit(p['curve'], typical)
        p['deviation'] = p['curve'] - typical

    # ---- context: terrain per city (current supplied route) and weather per edition
    context = edition_context(f.editions)
    terrain = {}
    for e, ctx in enumerate(context):
        t = ctx['terrain']
        if t is None or len(t['sections']) != 9:
            continue
        city = f.editions[e]['city']
        grade = [100 * s['net_m'] / (1000 * s['distance_km']) for s in t['sections']]
        if city in terrain:
            require(terrain[city]['course_key'] == t['course_key'], f'More than one supplied course for {city}')
        terrain[city] = dict(course_key=t['course_key'], grade=grade, gain_m=t['gain_m'], loss_m=t['loss_m'])

    # Ability bands: pooled median curve per course × finish band (shape cohort), minus the band's typical curve.
    s_idx = np.flatnonzero(keep_shape)
    band_curves = {}
    for lo, hi, label in FINISH_BANDS:
        sel = s_idx[(f.finish[s_idx] >= lo) & (f.finish[s_idx] < hi)]
        for c in cities:
            cid = f.cities.index(c)
            m = sel[f.city[sel] == cid]
            if len(m) >= MIN_CELL:
                band_curves[(c, label)] = (len(m), np.median(R[m], axis=0))
    band_typical = {}
    for _, _, label in FINISH_BANDS:
        curves = [v[1] for (c, b), v in band_curves.items() if b == label]
        band_typical[label] = np.median(np.array(curves), axis=0)

    # Identification: courses with at least three shape editions; four variants, all reported.
    counts = {c: sum(p['city'] == c for p in shape) for c in cities}
    pool = [p for p in shape if counts[p['city']] >= 3]
    variants = {}
    chosen = None
    for name, key, distance in (('Fade removed, weighted distance', 'residual', weighted_distance),
                                ('Fade removed, correlation', 'residual', correlation_distance),
                                ('Raw deviation, weighted distance', 'deviation', weighted_distance),
                                ('Raw deviation, correlation', 'deviation', correlation_distance)):
        result = identify(pool, key, distance, shape)
        variants[name] = r(np.mean([x['predicted'] == x['city'] for x in result]), 4)
        if chosen is None:
            chosen = result
    by_key = {(p['city'], p['year']): p for p in pool}
    identification = dict(
        method='Fade removed, weighted distance', variants=variants, editions_tested=len(chosen),
        courses=len({x['city'] for x in chosen}), correct=sum(x['predicted'] == x['city'] for x in chosen),
        top3=sum(x['rank'] <= 3 for x in chosen), chance=r(np.mean([1 / x['candidates'] for x in chosen]), 4),
        per_course=[dict(city=c, editions=sum(x['city'] == c for x in chosen), correct=sum(x['city'] == c and x['predicted'] == c for x in chosen))
                    for c in sorted({x['city'] for x in chosen})],
        editions=[dict(city=x['city'], year=x['year'], n=by_key[(x['city'], x['year'])]['n'], predicted=x['predicted'], rank=x['rank'],
                       signature=[r(v, 2) for v in by_key[(x['city'], x['year'])]['residual']]) for x in chosen])

    # Pace vs supplied net grade across course-sections.
    cs = [(c, i, city_curve[c][i] - typical[i], terrain[c]['grade'][i]) for c in cities if c in terrain for i in range(9)]
    gx = np.array([g for *_, g in cs])
    gy = np.array([d for _, _, d, _ in cs])
    g_slope = float(np.polyfit(gx, gy, 1)[0])
    g_cities = sorted({c for c, *_ in cs})
    g_members = [np.array([k for k, row in enumerate(cs) if row[0] == c]) for c in g_cities]
    g_draws = []
    for _ in range(BOOT):
        pick = rng.integers(0, len(g_cities), len(g_cities))
        sel = np.concatenate([g_members[j] for j in pick])
        if gx[sel].std() > 0:
            g_draws.append(np.polyfit(gx[sel], gy[sel], 1)[0])
    grade_association = dict(slope=r(g_slope, 4), ci95=[r(np.percentile(g_draws, 2.5), 4), r(np.percentile(g_draws, 97.5), 4)],
                             pearson_r=r(np.corrcoef(gx, gy)[0, 1], 4), course_sections=len(cs), courses=len(g_cities))

    # ---- weather editions (all non-duplicate editions with at least 100 finishes and a valid weather row)
    excluded = []
    weather_rows = []
    for p in rows:
        w = context[p['e']]['weather']
        if w is None:
            excluded.append(dict(city=p['city'], year=p['year'], n=p['n'], reason='No valid weather row'))
            continue
        if w['weather_race'].strip().casefold() != p['race'].strip().casefold():
            excluded.append(dict(city=p['city'], year=p['year'], n=p['n'], reason='Weather race name differs'))
            continue
        p['weather'] = w
        weather_rows.append(dict(city=p['city'], year=p['year'], n=p['n'], temp=w['temp_c'], dew=w['dewpoint_c'], humidity=w['humidity_pct'],
                                 wind=w['wind_mps'], warming=w['warming_c'], slowdown=100 * p['slowdown'], finish=p['median'] / 60,
                                 block=p['block'], fade=p.get('fade'), shape=p['shape'],
                                 **{f'r{i}': float(p['curve'][i]) for i in range(9)}))
    for p in [q for q in rows if q['n'] < MIN_CELL]:
        excluded.append(dict(city=p['city'], year=p['year'], n=p['n'], reason='Fewer than 100 finishes'))
    temps = np.array([w['temp'] for w in weather_rows])
    mean_temp = float(temps.mean())
    fits = dict(
        slowdown_across=pooled_fit(weather_rows, 'slowdown', 'temp'),
        slowdown_within=Within(weather_rows, 'slowdown', ['temp'], rng).slope(),
        finish_within=Within(weather_rows, 'finish', ['temp'], rng).slope(),
        block_within=Within(weather_rows, 'block', ['temp'], rng).slope(),
        dew_within=Within(weather_rows, 'slowdown', ['dew'], rng).slope(),
        warming_within=Within(weather_rows, 'slowdown', ['warming'], rng).slope(),
        wind_within=Within(weather_rows, 'slowdown', ['wind'], rng).slope(),
        humidity_within=Within(weather_rows, 'slowdown', ['humidity'], rng).slope(),
        fade_within=Within([w for w in weather_rows if w['shape']], 'fade', ['temp'], rng).slope(10),
    )
    with_year = Within(weather_rows, 'slowdown', ['temp', 'year'], rng)
    fits['slowdown_within_year_control'] = dict(slope=r(with_year.coef[0], 4), ci95=with_year.ci([1, 0]),
                                                 year_slope=r(with_year.coef[1], 4), year_ci95=with_year.ci([0, 1]))
    loo = []
    for c in sorted({w['city'] for w in weather_rows}):
        loo.append(Within([w for w in weather_rows if w['city'] != c], 'slowdown', ['temp'], rng, reps=0).coef[0])
    fits['slowdown_within_leave_one_course_out'] = [r(min(loo), 4), r(max(loo), 4)]
    for w in weather_rows:
        w['temp2'] = w['temp'] ** 2
    curvature = {}
    for key, ycol in (('finish_min_per_c', 'finish'), ('slowdown_points_per_c', 'slowdown')):
        q = Within(weather_rows, ycol, ['temp', 'temp2'], rng)
        curvature[key] = [dict(temp=t, slope=r(q.coef[0] + 2 * q.coef[1] * t, 4), ci95=q.ci([1, 2 * t])) for t in CURVE_TEMPS]
        curvature[key.replace('_per_c', '_curve')] = [dict(temp=t, change=r(q.coef[0] * (t - 10) + q.coef[1] * (t * t - 100), 3))
                                                      for t in range(0, 27)]
    heat = []
    shape_weather = [w for w in weather_rows if w['shape']]
    for i in range(9):
        q = Within(shape_weather, f'r{i}', ['temp'], rng)
        heat.append(dict(section=SECTIONS[i], per_10c=r(q.coef[0] * 10, 3), ci95=[r(v * 10, 3) for v in q.ci([1])]))
    pairs, agree = [], 0
    by_city = {}
    for w in weather_rows:
        by_city.setdefault(w['city'], []).append(w)
    for c, g in sorted(by_city.items()):
        g = sorted(g, key=lambda w: w['year'])
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                if abs(g[i]['temp'] - g[j]['temp']) >= PAIR_GAP_C:
                    hot, cool = (g[i], g[j]) if g[i]['temp'] > g[j]['temp'] else (g[j], g[i])
                    hit = hot['slowdown'] > cool['slowdown']
                    agree += hit
                    pairs.append(dict(city=c, hot_year=hot['year'], cool_year=cool['year'], hot_temp=r(hot['temp'], 1), cool_temp=r(cool['temp'], 1),
                                      hot_slowdown=r(hot['slowdown'] / 100, 4), cool_slowdown=r(cool['slowdown'] / 100, 4), hotter_slowed_more=bool(hit)))
    hot_cool = []
    per_course_slopes = []
    for c, g in sorted(by_city.items()):
        if len(g) >= 3:
            hot = max(g, key=lambda w: w['temp'])
            cool = min(g, key=lambda w: w['temp'])
            hot_cool.append(dict(city=c, editions=len(g),
                                 hot=dict(year=hot['year'], temp=r(hot['temp'], 1), slowdown=r(hot['slowdown'] / 100, 4), median_s=r(hot['finish'] * 60, 0)),
                                 cool=dict(year=cool['year'], temp=r(cool['temp'], 1), slowdown=r(cool['slowdown'] / 100, 4), median_s=r(cool['finish'] * 60, 0))))
        t = np.array([w['temp'] for w in g])
        if len(g) >= 5 and t.max() - t.min() >= 5:
            s = np.array([w['slowdown'] for w in g])
            per_course_slopes.append(dict(city=c, editions=len(g), slope=r(np.polyfit(t, s, 1)[0], 3), pearson_r=r(np.corrcoef(t, s)[0, 1], 3)))
    hot_cool.sort(key=lambda x: -(x['hot']['temp'] - x['cool']['temp']))
    weather = dict(
        cohort=dict(editions=len(weather_rows), courses=len(by_city), finishes=int(sum(w['n'] for w in weather_rows))),
        excluded=sorted(excluded, key=lambda x: (x['city'], x['year'])), mean_start_temp=r(mean_temp, 2),
        editions=[dict(city=w['city'], year=w['year'], n=w['n'], temp=r(w['temp'], 1), dew=r(w['dew'], 1), wind=r(w['wind'], 2),
                       humidity=r(w['humidity'], 0), slowdown=r(w['slowdown'] / 100, 4), median_s=r(w['finish'] * 60, 0),
                       fade=None if w['fade'] is None else r(w['fade'], 3)) for w in weather_rows],
        fits=fits, curvature=curvature, heat_signature=heat,
        pairs=dict(min_gap_c=PAIR_GAP_C, total=len(pairs), hotter_slowed_more=int(agree), list=pairs),
        hot_cool=hot_cool, per_course_slopes=sorted(per_course_slopes, key=lambda x: -x['slope']))

    # ---- matched first 20 km: 5–20 km pace bands, editions weighted equally
    matched = []
    for lo, hi in MATCH_BANDS:
        courses = {}
        for p in rows:
            idx = p['idx']
            m = idx[(f.baseline[idx] >= lo) & (f.baseline[idx] < hi)]
            if len(m) < MIN_CELL:
                continue
            courses.setdefault(p['city'], []).append((len(m), float(detected[m].mean()), float(np.median(after20[m])), float(f.baseline[m].mean())))
        out = []
        for c, cells in sorted(courses.items()):
            out.append(dict(city=c, editions=len(cells), finishes=int(sum(x[0] for x in cells)), slowdown=r(np.mean([x[1] for x in cells]), 4),
                            after20_s=r(np.mean([x[2] for x in cells]), 0), mean_baseline_s=r(np.mean([x[3] for x in cells]), 1)))
        matched.append(dict(lo_s=lo, hi_s=hi, label=f'{pace_label(lo)}–{pace_label(hi)}/km', courses=sorted(out, key=lambda x: x['slowdown'])))

    # ---- courses summary
    courses = []
    for c in sorted({p['city'] for p in rows}):
        g = [p for p in rows if p['city'] == c]
        gs = [p for p in g if p['shape']]
        cid = f.cities.index(c)
        lo_e = min(g, key=lambda p: p['slowdown'])
        hi_e = max(g, key=lambda p: p['slowdown'])
        entry = dict(
            city=c, race=g[-1]['race'], finishes=int((f.city == cid).sum()), editions=len(g), years=[p['year'] for p in g],
            median_s=r(np.mean([p['median'] for p in g]), 0), slowdown=r(np.mean([p['slowdown'] for p in g]), 4),
            slowdown_range=[r(lo_e['slowdown'], 4), r(hi_e['slowdown'], 4)], slowdown_range_years=[lo_e['year'], hi_e['year']],
            block10=r(np.mean([p['block10'] for p in g]), 4), after20_s=r(np.mean([p['after20'] for p in g]), 0),
            shape_editions=len(gs))
        if gs:
            dev = city_curve[c] - typical
            sig = np.mean([p['residual'] for p in gs], axis=0)
            fades = [p['fade'] for p in gs]
            k = int(np.abs(dev).argmax())
            entry.update(
                curve=[r(v, 2) for v in city_curve[c]], deviation=[r(v, 2) for v in dev], signature=[r(v, 2) for v in sig],
                fade=r(np.mean(fades), 3), fade_range=[r(min(fades), 3), r(max(fades), 3)],
                signature_section=SECTIONS[k], signature_points=r(dev[k], 2),
                slowest_section=SECTIONS[int(np.argmax(city_curve[c][:8]))],
                bands=[dict(band=label, n=band_curves[(c, label)][0],
                            deviation=[r(v, 2) for v in band_curves[(c, label)][1] - band_typical[label]])
                       for _, _, label in FINISH_BANDS if (c, label) in band_curves])
        if c in terrain:
            entry['grade_pct'] = [r(v, 3) for v in terrain[c]['grade']]
        ident = next((x for x in identification['per_course'] if x['city'] == c), None)
        if ident:
            entry['identified'] = dict(editions=ident['editions'], correct=ident['correct'])
        courses.append(entry)
    courses.sort(key=lambda x: -x['finishes'])

    # ---- years
    years = []
    for y in sorted({p['year'] for p in rows}):
        g = [p for p in rows if p['year'] == y]
        m = f.year == y
        years.append(dict(year=y, editions=len(g), courses=len({p['city'] for p in g}), finishes=int(sum(p['n'] for p in g)),
                          pooled_median_s=r(np.median(f.finish[m]), 0), median_s=r(np.mean([p['median'] for p in g]), 0),
                          slowdown=r(np.mean([p['slowdown'] for p in g]), 4)))
    cells = [dict(city=p['city'], year=p['year'], n=p['n'], median_s=r(p['median'], 0), slowdown=r(p['slowdown'], 4),
                  temp=r(p['weather']['temp_c'], 1) if 'weather' in p else None) for p in rows]
    raw = f.raw_by_edition
    for p in rows:
        p['coverage'] = p['n'] / raw[p['e']] if raw is not None and raw[p['e']] else None
        p['era'] = 'pre' if ERA_PRE[0] <= p['year'] <= ERA_PRE[1] else 'post' if ERA_POST[0] <= p['year'] <= ERA_POST[1] else None
    era_courses = []
    for c in sorted({p['city'] for p in rows}):
        pre = [p for p in rows if p['city'] == c and p['era'] == 'pre']
        post = [p for p in rows if p['city'] == c and p['era'] == 'post']
        if not pre or not post:
            continue
        cov_pre = np.mean([p['coverage'] for p in pre])
        cov_post = np.mean([p['coverage'] for p in post])
        row = dict(city=c, pre_editions=len(pre), post_editions=len(post), coverage_pre=r(cov_pre, 4), coverage_post=r(cov_post, 4),
                   high_coverage=bool(cov_pre >= COVERAGE_MIN and cov_post >= COVERAGE_MIN))
        for key in ('p10', 'median', 'p90', 'sub3', 'slowdown'):
            a, b = np.mean([p[key] for p in pre]), np.mean([p[key] for p in post])
            digits = 0 if key in ('p10', 'median', 'p90') else 4
            row[key] = [r(a, digits), r(b, digits)]
        w_pre = [p['weather']['temp_c'] for p in pre if 'weather' in p]
        w_post = [p['weather']['temp_c'] for p in post if 'weather' in p]
        row['temp'] = [r(np.mean(w_pre), 1), r(np.mean(w_post), 1)] if w_pre and w_post else None
        era_courses.append(row)
    hc = [x for x in era_courses if x['high_coverage']]
    era_summary = {}
    for key in ('p10', 'median', 'p90', 'sub3', 'slowdown'):
        d = np.array([x[key][1] - x[key][0] for x in hc], float)
        boots = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(10000)]
        scale = 1 / 60 if key in ('p10', 'median', 'p90') else 1
        era_summary[key] = dict(change=r(d.mean() * scale, 4), ci95=[r(np.percentile(boots, 2.5) * scale, 4), r(np.percentile(boots, 97.5) * scale, 4)],
                                lower=int((d < 0).sum()), higher=int((d > 0).sum()))
    spread = np.array([(x['p90'][1] - x['p10'][1]) - (x['p90'][0] - x['p10'][0]) for x in hc], float) / 60
    boots = [spread[rng.integers(0, len(spread), len(spread))].mean() for _ in range(10000)]
    era_summary['spread'] = dict(change=r(spread.mean(), 4), ci95=[r(np.percentile(boots, 2.5), 4), r(np.percentile(boots, 97.5), 4)],
                                 lower=int((spread < 0).sum()), higher=int((spread > 0).sum()))
    temp_d = [x['temp'][1] - x['temp'][0] for x in hc if x['temp']]
    era_summary['temp'] = dict(change=r(np.mean(temp_d), 3), median_change=r(np.median(temp_d), 3), warmer=int(sum(d > 0 for d in temp_d)),
                               cooler=int(sum(d < 0 for d in temp_d)), courses=len(temp_d))
    recovery = []
    for c in sorted({p['city'] for p in rows}):
        g = {p['year']: p['n'] for p in rows if p['city'] == c}
        if 2019 not in g:
            continue
        back = next((y for y in (2020, 2021, 2022, 2023) if y in g), None)
        latest = max(g)
        recovery.append(dict(city=c, n2019=g[2019], first_back_year=back, first_back_n=g.get(back), latest_year=latest, latest_n=g[latest]))
    trends = {}
    for key, scale in (('median', 1 / 60), ('p10', 1 / 60), ('p90', 1 / 60), ('sub3', 100), ('slowdown', 100)):
        eligible = [dict(city=p['city'], year=p['year'], y=p[key] * scale) for p in rows
                    if sum(q['city'] == p['city'] for q in rows) >= 3]
        trends[key] = Within(eligible, 'y', ['year'], rng).slope()

    shape_n = int(sum(p['n'] for p in shape))
    return dict(
        sections=SECTIONS, typical_curve=[r(v, 3) for v in typical],
        shape_cohort=dict(editions=len(shape), courses=len(cities), finishes=shape_n, start_offset_editions=offset_audit),
        edition_cohort=dict(editions=len(rows), courses=len({p['city'] for p in rows}), finishes=int(sum(p['n'] for p in rows))),
        courses=courses, identification=identification, grade_association=grade_association,
        weather=weather, matched=matched,
        years=dict(by_year=years, cells=cells, eras=dict(pre=list(ERA_PRE), post=list(ERA_POST), coverage_rule=COVERAGE_MIN,
                                                         high_coverage_courses=[x['city'] for x in hc], summary=era_summary, courses=era_courses),
                   recovery=recovery, trends=trends),
        method=('Relative pace is each section\'s pace against the finish\'s own whole-race average pace. A course curve is the mean of its '
                'editions\' median curves; the typical curve is the median across courses. The fade multiplier fits each edition curve as a '
                'multiple of the typical curve (distance-weighted), and the signature is what remains. Weather is the supplied modelled '
                'hour at the scheduled start; within-course slopes compare editions of the same course with each edition weighted equally, '
                'and intervals resample whole courses. Editions need at least 100 finishes. Thirteen editions whose first 5 km looks '
                'inflated are left out of the shape statistics.'),
    )
