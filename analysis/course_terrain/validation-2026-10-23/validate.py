"""Validate the terrain-split model (Strava 2017 quadratic) on the raw and corrected course profiles against the
steady-runner shapes (D2: |q-1| <= 3%, window G-10:00..G+9:59) from ../measure/cells.pkl.

Outputs: model_shapes.json (every course x profile x goal: segment relative paces + nine elapsed times),
comparison.json (per course x goal metrics, pooled terrain correlations, calibration), ny_515.json (the visitor's plan).
"""
import json, pickle, sys
import numpy as np
import pandas as pd

V = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/validate'
R = V + '/../research'; M = V + '/../measure'
sys.path.insert(0, V)
import terrain_model as tm

GOALS = [180, 240, 315, 360]
SEGS = ['0-5', '5-10', '10-15', '15-20', '20-25', '25-30', '30-35', '35-40', '40-F']
LEN = tm.LEN; KM = tm.KM


def hms(s):
    s = int(round(s)); return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}'


def ms(s):
    s = int(round(s)); return f'{s // 60}:{s % 60:02d}'


# ---------------- profiles ----------------
raw = pd.read_parquet('/home/user/data/1050-full/course_profiles.parquet')
corr_pts = json.load(open(R + '/corrected_points.json'))
prof = json.load(open(R + '/profiles.json'))
cls = {c['city']: c['class'] for c in prof['courses']}
P = {}
for _, r in raw.iterrows():
    pts = json.loads(r.points_json)
    P[(r.city, 'raw')] = ([p['d_km'] for p in pts], [p['elev_m'] for p in pts], float(r.distance_km))
    cp = corr_pts['points'].get(r.city)
    if cp is not None:
        P[(r.city, 'corrected')] = ([p['d_km'] for p in cp], [p['elev_m'] for p in cp], float(r.distance_km))
    else:
        P[(r.city, 'corrected')] = P[(r.city, 'raw')]
cities = sorted(raw.city)

G = {}  # (city, prof) -> (x, z, g)
shapes = {}
out_shapes = {}
for cc in cities:
    for pk in ('raw', 'corrected'):
        d, z, L = P[(cc, pk)]
        x, zz, g = tm.grade_profile(d, z)
        G[(cc, pk)] = (x, zz, g)
        sh = tm.shape(x, g); shapes[(cc, pk)] = sh
        seg_net = [float(np.interp(b, x, zz) - np.interp(a, x, zz)) for a, b in zip(tm.MATS[:-1], tm.MATS[1:])]
        seg_grade = [n / (l * 1000) * 100 for n, l in zip(seg_net, LEN)]
        half = (np.sum(sh[4:] * LEN[4:]) / (KM - 20)) / (np.sum(sh[:4] * LEN[:4]) / 20)
        e = dict(cls=cls.get(cc), profile_points=len(d), route_km=L, smoothed_gain_m=round(tm.gain(zz), 1),
                 max_abs_grade_pct=round(float(np.max(np.abs(g))), 2), share_beyond_8pct=round(float(np.mean(np.abs(g) > 8)), 4),
                 segment_net_m=[round(v, 1) for v in seg_net], segment_mean_grade_pct=[round(v, 2) for v in seg_grade],
                 segment_relative_pace=[round(float(v), 4) for v in sh], halves_ratio=round(float(half), 4),
                 goals={hms(Gm * 60): dict(elapsed=[hms(t) for t in tm.mat_times(x, g, Gm * 60)],
                                           segment_split=[ms(v) for v in np.diff(np.r_[0, tm.mat_times(x, g, Gm * 60)])]) for Gm in GOALS})
        out_shapes.setdefault(cc, {})[pk] = e
json.dump(dict(model='f(g)=1+0.02869556g+0.001520768g^2, |g|<=10%, 10 m resample, 210 m median, Gaussian sigma 100 m, 42.195 km axis',
               segments=SEGS, note='relative pace = segment pace / goal average pace; goal-independent by construction', courses=out_shapes),
          open(V + '/model_shapes.json', 'w'), indent=1)

# ---------------- observed steady shapes ----------------
cells = pickle.load(open(M + '/cells.pkl', 'rb'))
obs = {}
for (cc, g, Gm), c in cells.items():
    d2 = c.get('D2_A3_wide', {})
    if 'shape' in d2: obs[(cc, g, Gm)] = (np.asarray(d2['shape']), d2['n'], d2['ed'], d2.get('qmed'))
pb_courses = sorted({k[0] for k in obs})
geo_courses = [cc for cc in pb_courses if cc in cities and cc != 'Washington']   # Washington profile is not the timed course


def model_shape(cc, pk, sens=1.0):
    x, zz, g = G[(cc, pk)]
    return tm.shape(x, g, sens)


# per-goal common (non-terrain) pattern: mean over courses of (observed - model), leave-one-course-out
def per_goal_sets(Gm, gender='all', courses=None, pk='corrected'):
    ks = [cc for cc in (courses or geo_courses) if (cc, gender, Gm) in obs]
    O = np.array([obs[(cc, gender, Gm)][0] for cc in ks]); Mo = np.array([model_shape(cc, pk) for cc in ks])
    return ks, O, Mo


def corr(a, b):
    a = np.asarray(a); b = np.asarray(b)
    if a.std() == 0 or b.std() == 0: return None
    return float(np.corrcoef(a, b)[0, 1])


comp = dict(goals=GOALS, cells=[], pooled={}, calibration={})
rows = []
for Gm in range(180, 361, 15):
    for pk in ('raw', 'corrected'):
        ks, O, Mo = per_goal_sets(Gm, pk=pk)
        if len(ks) < 6: continue
        D = O - Mo
        for i, cc in enumerate(ks):
            common = np.delete(D, i, 0).mean(0)          # leave-one-course-out non-terrain pattern
            adj = Mo[i] + common; adj = adj * KM / float((adj * LEN).sum())
            ev = np.ones(9)
            even_common = np.delete(O, i, 0).mean(0)       # 'typical steady shape' with no terrain at all
            rows.append(dict(city=cc, goal=Gm, prof=pk, cls=cls.get(cc), n=int(obs[(cc, 'all', Gm)][1]), qmed=obs[(cc, 'all', Gm)][3],
                             obs=O[i], model=Mo[i], adj=adj, typical=even_common,
                             mad_raw=float(np.mean(np.abs(O[i] - Mo[i]))) * 100,
                             mad_adj=float(np.mean(np.abs(O[i] - adj))) * 100,
                             mad_even=float(np.mean(np.abs(O[i] - ev))) * 100,
                             mad_typical=float(np.mean(np.abs(O[i] - even_common))) * 100,
                             # terrain part: deviations from the other courses' means (segments 5-40 and all 9)
                             dev_obs=O[i] - np.delete(O, i, 0).mean(0), dev_mod=Mo[i] - np.delete(Mo, i, 0).mean(0)))

df = pd.DataFrame(rows)


def pooled(sub, segs=slice(1, 8), within_halves=False):
    a = np.concatenate([r for r in sub.dev_obs]).reshape(-1, 9); b = np.concatenate([r for r in sub.dev_mod]).reshape(-1, 9)
    if within_halves:
        a = a.copy(); b = b.copy()
        for lo, hi in ((0, 4), (4, 9)):
            a[:, lo:hi] -= a[:, lo:hi].mean(1, keepdims=True); b[:, lo:hi] -= b[:, lo:hi].mean(1, keepdims=True)
    a = a[:, segs].ravel(); b = b[:, segs].ravel()
    slope = float(np.sum(a * b) / np.sum(b * b))     # observed deviation per unit of model deviation (through origin)
    return dict(n=int(len(a)), corr=round(corr(a, b), 3), slope_obs_on_model=round(slope, 3),
                rmse_pp=round(float(np.sqrt(np.mean((a - b) ** 2))) * 100, 2), rmse_zero_pp=round(float(np.sqrt(np.mean(a ** 2))) * 100, 2))


def boot_slope(sub, segs=slice(1, 8), within_halves=False, B=2000, seed=1):
    rng = np.random.default_rng(seed); cs = sorted(sub.city.unique()); out = []
    by = {c: sub[sub.city == c] for c in cs}
    for _ in range(B):
        pick = rng.choice(cs, len(cs)); s = pd.concat([by[c] for c in pick])
        out.append(pooled(s, segs, within_halves)['slope_obs_on_model'])
    return [round(float(np.quantile(out, q)), 3) for q in (0.05, 0.5, 0.95)]


usable = [c for c in geo_courses if cls.get(c) in ('a', 'b')]
for pk in ('raw', 'corrected'):
    for name, sel in (('all_courses', geo_courses), ('publishable_a_b', usable), ('class_c', [c for c in geo_courses if cls.get(c) == 'c']),
                      ('class_b', [c for c in geo_courses if cls.get(c) == 'b'])):
        sub = df[(df.prof == pk) & df.city.isin(sel)]
        if not len(sub): continue
        comp['pooled'][f'{pk}:{name}'] = dict(courses=sorted(sub.city.unique()), cells=int(len(sub)),
            seg_5_40=pooled(sub), seg_all9=pooled(sub, slice(0, 9)), within_halves_5_40=pooled(sub, slice(1, 8), True),
            mad_obs_vs_model_pp=round(float(sub.mad_raw.mean()), 2), mad_obs_vs_model_plus_common_pp=round(float(sub.mad_adj.mean()), 2),
            mad_obs_vs_even_pp=round(float(sub.mad_even.mean()), 2), mad_obs_vs_typical_steady_pp=round(float(sub.mad_typical.mean()), 2))
    sub = df[(df.prof == pk) & df.city.isin(usable)]
    comp['calibration'][pk] = dict(slope_5_40_ci90=boot_slope(sub), slope_within_halves_ci90=boot_slope(sub, within_halves=True))

# per course: mean over goals; per goal on New York
per_course = {}
for (cc, pk), sub in df.groupby(['city', 'prof']):
    a = np.array(list(sub.dev_obs)); b = np.array(list(sub.dev_mod))
    O = np.array(list(sub.obs)).mean(0); Mo = np.array(list(sub.model)).mean(0); A = np.array(list(sub.adj)).mean(0)
    per_course.setdefault(cc, {})[pk] = dict(
        cls=cls.get(cc), goals=int(len(sub)), goal_range=[int(sub.goal.min()), int(sub.goal.max())],
        corr_terrain_dev_5_40=None if len(sub) == 0 else (round(corr(a[:, 1:8].ravel(), b[:, 1:8].ravel()), 3) if corr(a[:, 1:8].ravel(), b[:, 1:8].ravel()) is not None else None),
        corr_shape_9=round(corr(O, Mo), 3) if corr(O, Mo) is not None else None,
        corr_shape_plus_common_9=round(corr(O, A), 3),
        mad_pp=round(float(sub.mad_raw.mean()), 2), mad_plus_common_pp=round(float(sub.mad_adj.mean()), 2),
        mad_even_pp=round(float(sub.mad_even.mean()), 2), mad_typical_pp=round(float(sub.mad_typical.mean()), 2),
        obs_mean=[round(float(v), 3) for v in O], model=[round(float(v), 3) for v in Mo], model_plus_common=[round(float(v), 3) for v in A],
        diff_pp=[round(float(v) * 100, 1) for v in (O - A)], obs_qmed=round(float(np.nanmean([q for q in sub.qmed if q is not None])), 4),
        model_halves=out_shapes[cc][pk]['halves_ratio'])
comp['per_course'] = per_course

# common non-terrain pattern (all usable courses, corrected): what the model cannot explain on any course
common_by_goal = {}
for Gm in GOALS:
    ks, O, Mo = per_goal_sets(Gm, courses=usable)
    common_by_goal[hms(Gm * 60)] = dict(courses=len(ks), obs_minus_model_mean_pp=[round(float(v) * 100, 2) for v in (O - Mo).mean(0)])
comp['common_pattern_obs_minus_model'] = common_by_goal

# sensitivity scan: grade scale k, chosen to minimise within-halves error on usable courses (diagnostic only)
scan = {}
for k in (0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5):
    errs = []; errs_w = []
    for Gm in range(180, 361, 15):
        ks = [cc for cc in usable if (cc, 'all', Gm) in obs]
        if len(ks) < 6: continue
        O = np.array([obs[(cc, 'all', Gm)][0] for cc in ks]); Mo = np.array([model_shape(cc, 'corrected', k) for cc in ks])
        for i in range(len(ks)):
            dO = O[i] - np.delete(O, i, 0).mean(0); dM = Mo[i] - np.delete(Mo, i, 0).mean(0)
            errs.append(np.mean(np.abs(dO - dM)[1:8]))
            a = dO.copy(); b = dM.copy()
            for lo, hi in ((0, 4), (4, 9)): a[lo:hi] -= a[lo:hi].mean(); b[lo:hi] -= b[lo:hi].mean()
            errs_w.append(np.mean(np.abs(a - b)[1:8]))
    scan[str(k)] = dict(mean_abs_terrain_error_pp=round(float(np.mean(errs)) * 100, 3), within_halves_pp=round(float(np.mean(errs_w)) * 100, 3))
comp['grade_scale_scan'] = scan

# goal dependence on New York and Boston: bridge / hill size in observed vs model
feat = {}
for cc, a, b, nm in (('New York', 4, (3, 5), 'Queensboro segment 20-25 minus mean(15-20, 25-30)'), ('Boston', 6, (7,), 'Newton 30-35 minus 35-40'),
                     ('New York', 5, (4,), 'First Avenue 25-30 minus 20-25'), ('New York', 0, (1,), 'Verrazzano 0-5 minus 5-10')):
    rr = {}
    for Gm in GOALS + [210, 270, 300, 330]:
        if (cc, 'all', Gm) not in obs: continue
        o = obs[(cc, 'all', Gm)][0]
        rr[hms(Gm * 60)] = round(float(o[a] - np.mean([o[j] for j in b])) * 100, 2)
    mm = {pk: round(float(shapes[(cc, pk)][a] - np.mean([shapes[(cc, pk)][j] for j in b])) * 100, 2) for pk in ('raw', 'corrected')}
    feat[f'{cc}: {nm}'] = dict(observed_by_goal_pp=rr, model_pp=mm)
comp['features'] = feat

# example cells, table form
ex = {}
for cc, gnd, Gm in (('New York', 'all', 315), ('New York', 'men', 315), ('New York', 'women', 315), ('New York', 'all', 180), ('New York', 'all', 240), ('New York', 'all', 360),
                    ('Boston', 'all', 240), ('Berlin', 'all', 210), ('Sydney', 'all', 180), ('Sydney', 'all', 240), ('Chicago', 'all', 270), ('Chicago', 'all', 240),
                    ('London', 'all', 240), ('Amsterdam', 'all', 240), ('Rotterdam', 'all', 240), ('Valencia', 'all', 240)):
    e = {}
    for pk in ('raw', 'corrected'):
        x, zz, g = G[(cc, pk)]
        e[f'model_{pk}'] = dict(rel=[round(float(v), 3) for v in shapes[(cc, pk)]], elapsed=[hms(t) for t in tm.mat_times(x, g, Gm * 60)])
    if (cc, gnd, Gm) in obs:
        o, n, ed, qm = obs[(cc, gnd, Gm)]
        t = np.round(np.cumsum(o * LEN) / KM * Gm * 60)
        e['steady_D2'] = dict(n=int(n), editions=int(ed), qmed=round(float(qm), 4) if qm else None, rel=[round(float(v), 3) for v in o], elapsed=[hms(v) for v in t])
    e['even'] = [hms(v) for v in np.round(tm.MATS[1:] / KM * Gm * 60)]
    ex[f'{cc} {gnd} {hms(Gm * 60)}'] = e
comp['examples'] = ex

df_out = df.drop(columns=['obs', 'model', 'adj', 'typical', 'dev_obs', 'dev_mod'])
comp['cell_metrics'] = df_out.round(3).to_dict(orient='records')
json.dump(comp, open(V + '/comparison.json', 'w'), indent=1, default=float)

for k, v in comp['pooled'].items(): print(k, {kk: vv for kk, vv in v.items() if kk not in ('courses',)})
print(json.dumps(comp['calibration']))
print(json.dumps(comp['grade_scale_scan']))
print(json.dumps(comp['common_pattern_obs_minus_model']))
for k, v in feat.items(): print(k, v)
