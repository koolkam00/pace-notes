"""Steady-halves variants: threshold t x window width, plus an adaptive window; coverage and stability.
Also the terrain sanity check and the NY/Boston features on one common set of cells, and NY 5:15 edition composition."""
import json, pickle
import numpy as np
M = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/measure'
REPO = '/home/user/wt/shape'
LEN = np.array([5.0] * 8 + [2.195]); KM = 42.195
z = np.load(M + '/cohort_tool.npz')
times = z['times'].astype(np.float64); finish = z['finish'].astype(np.float64)
edition = z['edition'].astype(np.int64); city = z['city']; gender = z['gender']; ed_year = z['ed_year']
cities = [str(c) for c in z['cities']]
seg = np.diff(np.c_[np.zeros(len(times)), times], axis=1)
r_all = (seg / LEN) / (finish / KM)[:, None]; del seg
q_all = ((finish - times[:, 3]) / (KM - 20)) / (times[:, 3] / 20)
cells = pickle.load(open(M + '/cells.pkl', 'rb'))
base = [k for k, c in cells.items() if 'shape' in c['current']]
def renorm(m): return m * KM / float((m * LEN).sum())
def halves(e):
    u = np.unique(e); u = u[np.argsort(ed_year[u], kind='stable')]; k = len(u) // 2
    return np.isin(e, u[:k]), np.isin(e, u[k:])
# windows as (lo offset, hi offset) seconds relative to G
WINDOWS = {'std_G-5_G': (-300, 0), 'G-5_G+5': (-300, 300), 'G-7.5_G+7.5': (-450, 450), 'G-10_G+10': (-600, 600), 'G-15_G+15': (-900, 900)}
TS = (0.02, 0.03)
G_ = {}
for (cc, g, G) in base: G_.setdefault((cc, g), []).append(G)
var = {}
for (cc, g), goals in G_.items():
    ci = cities.index(cc)
    mem = np.flatnonzero((city == ci) & (True if g == 'all' else (gender == (1 if g == 'men' else 2))))
    mem = mem[np.argsort(finish[mem], kind='stable')]
    F = finish[mem]; R = r_all[mem]; Q = q_all[mem]; ED = edition[mem]
    for G in goals:
        for wn, (a, b) in WINDOWS.items():
            lo, hi = np.searchsorted(F, [G * 60 + a, G * 60 + b])
            for t in TS:
                m = np.abs(Q[lo:hi] - 1) <= t
                n = int(m.sum()); e = ED[lo:hi][m]; ne = len(np.unique(e))
                d = dict(n=n, ed=ne)
                if n >= 100 and ne >= 3:
                    Rs = R[lo:hi][m]; d['shape'] = renorm(np.median(Rs, 0))
                    h = halves(e)
                    if h[0].sum() >= 50 and h[1].sum() >= 50:
                        d['half'] = (renorm(np.median(Rs[h[0]], 0)), renorm(np.median(Rs[h[1]], 0)))
                var[(cc, g, G, wn, t)] = d
def mx(a, b): return float(np.max(np.abs(a - b))) * 100
def summ(v):
    v = np.array(v); return dict(cells=int(len(v)), median=round(float(np.median(v)), 2), p90=round(float(np.quantile(v, .9)), 2)) if len(v) else None
out = {}
order = list(WINDOWS)
for t in TS:
    for wn in order:
        ks = [k for k in base if 'shape' in var[k + (wn, t)]]
        hd = [mx(*var[k + (wn, t)]['half']) for k in ks if 'half' in var[k + (wn, t)]]
        adj = [mx(var[k + (wn, t)]['shape'], var[(k[0], k[1], k[2] + 1, wn, t)]['shape']) for k in ks if (k[0], k[1], k[2] + 1, wn, t) in var and 'shape' in var[(k[0], k[1], k[2] + 1, wn, t)]]
        vs_std = [mx(var[k + (wn, t)]['shape'], var[k + ('std_G-5_G', 0.03)]['shape']) for k in ks if 'shape' in var[k + ('std_G-5_G', 0.03)]]
        out[f't{int(t*100)}_{wn}'] = dict(coverage=round(len(ks) / len(base), 4), cells=len(ks),
            by_gender={gg: round(sum(1 for k in ks if k[1] == gg) / sum(1 for k in base if k[1] == gg), 4) for gg in ('all', 'men', 'women')},
            edition_halves_pp=summ(hd), adjacent_minute_pp=summ(adj), vs_A3_standard_window_pp=summ(vs_std))
# adaptive: first window (narrowest) that qualifies, t = 3%
for t in TS:
    pick = {}
    for k in base:
        for wn in order:
            if 'shape' in var[k + (wn, t)]: pick[k] = wn; break
    cnt = {wn: sum(1 for v in pick.values() if v == wn) for wn in order}
    miss = [k for k in base if k not in pick]
    miss_c = {}
    for k in miss: miss_c.setdefault(f'{k[0]} {k[1]}', []).append(k[2])
    out[f'adaptive_t{int(t*100)}'] = dict(coverage=round(len(pick) / len(base), 4), window_used=cnt,
        uncovered={kk: [min(v), max(v), len(v)] for kk, v in sorted(miss_c.items())})
res = dict(variants=out)

# per-course coverage for t=3% G-10..G+10 (all genders), and uncovered goal ranges
cov = {}
for (cc, g), goals in sorted(G_.items()):
    kept = [G for G in goals if 'shape' in var[(cc, g, G, 'G-10_G+10', 0.03)]]
    lost = sorted(set(goals) - set(kept))
    cov[f'{cc} {g}'] = dict(base=len(goals), kept=len(kept), base_range=[min(goals), max(goals)], kept_range=[min(kept), max(kept)] if kept else None,
                            lost_inside_kept_range=[G for G in lost if kept and min(kept) < G < max(kept)][:20])
res['per_course_t3_G-10_G+10'] = cov

# terrain sanity check + features on ONE common set of cells (all genders, goals 3:00-5:30 every 15 min, courses with geometry)
geo = {c['city']: c for c in json.load(open(REPO + '/public/data/insights/course-geometry.json'))['courses']}
MATS = np.array([0, 5, 10, 15, 20, 25, 30, 35, 40, KM]); grade = {}
for cc, c in geo.items():
    e = np.array(c['elevation_m'], float); xs = np.arange(len(e)) * c['elevation_step_km']
    grade[cc] = np.diff(np.interp(MATS * c['distance_km'] / KM, xs, e)) / (np.diff(MATS) * 1000) * 100
CANDS = ['current', 'A2', 'A3', 'A5', 'A3o', 'B', 'C', 'D1_steadiest_third', 'D2_A3_wide', 'D3_fit_q1', 'D4_typsteady_x_course']
def shp(k, cand):
    return cells[k][cand].get('shape')
common = [k for k in base if k[1] == 'all' and k[2] in range(180, 331, 15) and k[0] in grade and all(shp(k, c) is not None for c in CANDS)]
terr = {}
for cand in CANDS:
    rs, gs, ws, wg = [], [], [], []
    for G in range(180, 331, 15):
        ks = [k for k in common if k[2] == G]
        if len(ks) < 8: continue
        S = np.array([shp(k, cand) for k in ks]); Gr = np.array([grade[k[0]] for k in ks])
        rs.append((S - S.mean(0))[:, 1:8].ravel()); gs.append((Gr - Gr.mean(0))[:, 1:8].ravel())
        Sw, Gw = S.copy(), Gr.copy()
        for a, b in ((1, 4), (4, 8)):
            Sw[:, a:b] -= Sw[:, a:b].mean(1, keepdims=True); Gw[:, a:b] -= Gw[:, a:b].mean(1, keepdims=True)
        ws.append((Sw - Sw.mean(0))[:, 1:8].ravel()); wg.append((Gw - Gw.mean(0))[:, 1:8].ravel())
    a, b, c1, c2 = map(np.concatenate, (rs, gs, ws, wg))
    terr[cand] = dict(corr=round(float(np.corrcoef(a, b)[0, 1]), 3), slope=round(float(np.polyfit(b, a * 100, 1)[0]), 2),
                      within_half_corr=round(float(np.corrcoef(c1, c2)[0, 1]), 3), within_half_slope=round(float(np.polyfit(c2, c1 * 100, 1)[0]), 2))
res['terrain_common_set'] = dict(cells=len(common), courses=sorted({k[0] for k in common}), by_candidate=terr)

# flat-course fade check on common set: Berlin and Chicago, mean over common goals
flat = {}
for cand in CANDS:
    d = {}
    for cc in ('Berlin', 'Chicago', 'New York', 'Boston'):
        ks = [k for k in common if k[0] == cc]
        if not ks: continue
        S = np.array([shp(k, cand) for k in ks]); m = S.mean(0)
        d[cc] = dict(goals=len(ks), mean_shape=[round(float(x), 3) for x in m], range_5_40_pp=round(float((S[:, 1:8].max(1) - S[:, 1:8].min(1)).mean()) * 100, 2),
                     slope_5_40_pp_per_5km=round(float(np.polyfit(np.arange(7), m[1:8] * 100, 1)[0]), 2))
    flat[cand] = d
res['shapes_common_set'] = flat

# NY 5:15 (all) edition composition: window vs steady (A3) selection, with race-day temperature
w = json.load(open(REPO + '/public/data/weather/evidence.json'))
man = json.load(open(REPO + '/public/data/runners/manifest.json'))['editions']
tk = {(e['city'], e['year']): e.get('temp_c') for e in w['editions']}
ci = cities.index('New York'); G = 315
m = (city == ci) & (finish >= G * 60 - 300) & (finish < G * 60)
q = q_all[m]; e = edition[m]; st = np.abs(q - 1) <= 0.03
rows = []
for ed in np.unique(e):
    sel = e == ed
    rows.append(dict(year=int(ed_year[ed]), temp_c=tk.get(('New York', int(ed_year[ed]))), window=int(sel.sum()), steady=int((sel & st).sum()),
                     steady_rate=round(float(st[sel].mean()), 3), median_q=round(float(np.median(q[sel])), 3)))
tv = 0.5 * sum(abs(r_['window'] / m.sum() - r_['steady'] / st.sum()) for r_ in rows)
temps = np.array([r_['temp_c'] if r_['temp_c'] is not None else np.nan for r_ in rows]); rates = np.array([r_['steady_rate'] for r_ in rows])
ok = np.isfinite(temps)
res['ny_315_editions'] = dict(rows=rows, total_variation_window_vs_steady=round(float(tv), 3),
                              corr_temp_steady_rate=round(float(np.corrcoef(temps[ok], rates[ok])[0, 1]), 3) if ok.sum() > 2 else None)
# window-wide: share of window that is steady by finish within window (does the steady group sit at the slow or fast end?)
json.dump(res, open(M + '/variants.json', 'w'), indent=1)
pickle.dump(var, open(M + '/variants.pkl', 'wb'))
print('ok')
