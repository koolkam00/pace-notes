"""Summarise cells.pkl into results.json (coverage, robustness, flatness, terrain sanity check, biases, example tables)."""
import json, pickle
import numpy as np

M = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/measure'
REPO = '/home/user/wt/shape'
LEN = np.array([5.0] * 8 + [2.195]); KM = 42.195
SEGS = ['0-5', '5-10', '10-15', '15-20', '20-25', '25-30', '30-35', '35-40', '40-F']
POINTS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish']
cells = pickle.load(open(M + '/cells.pkl', 'rb'))
CANDS = ['current', 'asrun_rel', 'A2', 'A3', 'A5', 'A2o', 'A3o', 'A5o', 'B', 'C', 'D1_steadiest_third', 'D2_A3_wide', 'D3_fit_q1', 'D4_typsteady_x_course']
DESC = {
 'current': 'published rule: median elapsed time at each mat in the G-5:00..G-0:01 window, scaled to the goal',
 'asrun_rel': 'same window, median of each segment pace / own average pace (as run)',
 'A2': 'steady halves, |q-1| <= 2% (q = 20K-to-finish pace / 0-20K pace)', 'A3': 'steady halves, |q-1| <= 3%', 'A5': 'steady halves, |q-1| <= 5%',
 'A2o': 'one-sided, q <= 1.02', 'A3o': 'one-sided, q <= 1.03', 'A5o': 'one-sided, q <= 1.05',
 'B': 'no sustained slowdown (published definition) in the window',
 'C': 'as-run shape / median as-run shape of all courses at the same goal and gender, renormalised',
 'D1_steadiest_third': 'lowest third of the window by spread (SD) of the 5-40 km segment paces',
 'D2_A3_wide': '|q-1| <= 3% in a 20-minute window G-10:00..G+9:59 (shape only)',
 'D3_fit_q1': 'per-segment least-squares line of relative pace on (q-1) over the window (|q-1|<=0.3), value at q=1',
 'D4_typsteady_x_course': 'typical A3 shape of all courses x (course as-run / typical as-run)',
}
def elapsed(shape, goal_s): return np.cumsum(shape * LEN) / KM * goal_s
def fmt(s):
    s = int(round(s)); return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}'
def ok(c, k): return 'shape' in c.get(k, {})

base = {k: c for k, c in cells.items() if ok(c, 'current')}   # the published course-shape cells today
res = dict(release='private-export-20261021-1050 (pace band tool cohort, start-offset and grid screens)', candidates=DESC,
           base_cells=len(base), definitions=dict(
    relative_pace='segment pace / the finish\'s own average pace; shape = per-segment median, renormalised so the plan ends on the goal',
    q='(20K-to-finish pace) / (0-20K pace) of each finish', qualifying_cell='>= 100 finishes from >= 3 editions',
    halves='editions in the selection sorted by year, older half vs newer half (by edition count); both halves >= 50 finishes',
    pp='percentage points of relative pace (1 pp = 1% of the average pace)'))

# ---------- coverage ----------
cov = {}
for k in CANDS:
    q = [kk for kk in base if ok(base[kk], k)]
    by_g = {g: (sum(1 for kk in q if kk[1] == g), sum(1 for kk in base if kk[1] == g)) for g in ('all', 'men', 'women')}
    per_course = {}
    for cc in sorted({kk[0] for kk in base}):
        bg = sorted(kk[2] for kk in base if kk[0] == cc and kk[1] == 'all'); qg = sorted(kk[2] for kk in q if kk[0] == cc and kk[1] == 'all')
        per_course[cc] = dict(base=len(bg), kept=len(qg), base_range=[bg[0], bg[-1]] if bg else None, kept_range=[qg[0], qg[-1]] if qg else None)
    dropped_courses = [cc for cc, v in per_course.items() if v['base'] and not v['kept']]
    ny = {g: dict(n=cells[('New York', g, 315)][k]['n'], ed=cells[('New York', g, 315)][k]['ed'], qualifies=ok(cells[('New York', g, 315)], k)) for g in ('all', 'men', 'women')}
    cov[k] = dict(cells=len(q), share=round(len(q) / len(base), 4), by_gender={g: dict(kept=a, base=b, share=round(a / b, 4)) for g, (a, b) in by_g.items()},
                  courses_with_none_all_genders=dropped_courses, per_course_all=per_course, new_york_315=ny)
res['coverage'] = cov

# ---------- robustness ----------
def mx(a, b): return float(np.max(np.abs(a - b))) * 100
def summ(v):
    v = np.array(v); return dict(cells=int(len(v)), median=round(float(np.median(v)), 2), p90=round(float(np.quantile(v, .9)), 2), max=round(float(v.max()), 2)) if len(v) else None
common = [kk for kk in base if all(ok(base[kk], k) for k in CANDS)]
res['common_cells'] = len(common)
rob = {}
for k in CANDS:
    own = [kk for kk in base if ok(base[kk], k)]
    def halfdiff(keys):
        out, sec = [], []
        for kk in keys:
            h = base[kk][k].get('half')
            if h is not None:
                out.append(mx(h[0], h[1])); sec.append(float(np.max(np.abs(elapsed(h[0], kk[2] * 60) - elapsed(h[1], kk[2] * 60)))))
        return out, sec
    def adj(keys, step):
        out = []
        for kk in keys:
            nk = (kk[0], kk[1], kk[2] + step)
            if nk in base and ok(base[nk], k): out.append(mx(base[kk][k]['shape'], base[nk][k]['shape']))
        return out
    h_own, hs_own = halfdiff(own); h_c, hs_c = halfdiff(common)
    rob[k] = dict(edition_halves_pp=dict(own=summ(h_own), common=summ(h_c)), edition_halves_seconds=dict(own=summ(hs_own), common=summ(hs_c)),
                  adjacent_minute_pp=dict(own=summ(adj(own, 1)), common=summ(adj(common, 1))),
                  five_minutes_apart_pp=dict(own=summ(adj(own, 5)), common=summ(adj(common, 5))))
# threshold sensitivity
for fam in (('A2', 'A3', 'A5'), ('A2o', 'A3o', 'A5o')):
    keys = [kk for kk in base if all(ok(base[kk], k) for k in fam)]
    rob['t_sensitivity_' + fam[0][1:] if False else 't_sensitivity_' + ('two_sided' if fam[0] == 'A2' else 'one_sided')] = dict(
        t2_vs_t5_pp=summ([mx(base[kk][fam[0]]['shape'], base[kk][fam[2]]['shape']) for kk in keys]),
        t3_vs_t5_pp=summ([mx(base[kk][fam[1]]['shape'], base[kk][fam[2]]['shape']) for kk in keys]),
        t2_vs_t3_pp=summ([mx(base[kk][fam[0]]['shape'], base[kk][fam[1]]['shape']) for kk in keys]),
        per_segment_t2_vs_t5_median_pp=[round(float(np.median([abs(base[kk][fam[0]]['shape'][j] - base[kk][fam[2]]['shape'][j]) * 100 for kk in keys])), 2) for j in range(9)])
res['robustness'] = rob

# ---------- shape summaries: halves ratio, flatness, known features ----------
def hratio(sh): return float((sh[4:] * LEN[4:]).sum() / (KM - 20) / ((sh[:4] * LEN[:4]).sum() / 20))
feat = {}
for k in CANDS:
    d = {}
    for cc in ('Berlin', 'Chicago', 'Valencia', 'Amsterdam', 'Rotterdam'):
        ks = [kk for kk in base if kk[0] == cc and kk[1] == 'all' and 180 <= kk[2] <= 330 and ok(base[kk], k)]
        if ks:
            sh = np.array([base[kk][k]['shape'] for kk in ks])
            d[cc] = dict(goals=len(ks), mean_shape=[round(float(x), 3) for x in sh.mean(0)], range_5_40_pp=round(float(np.mean(sh[:, 1:8].max(1) - sh[:, 1:8].min(1))) * 100, 2),
                         halves_ratio=round(float(np.mean([hratio(s) for s in sh])), 3))
    for cc in ('New York', 'Boston', 'London', 'Austin', 'Madrid', 'Sydney'):
        ks = [kk for kk in base if kk[0] == cc and kk[1] == 'all' and 180 <= kk[2] <= 330 and ok(base[kk], k)]
        if ks:
            sh = np.array([base[kk][k]['shape'] for kk in ks])
            m = sh.mean(0)
            x = dict(goals=len(ks), mean_shape=[round(float(v), 3) for v in m], halves_ratio=round(float(np.mean([hratio(s) for s in sh])), 3))
            if cc == 'New York':
                x['bridge_20_25_minus_mean_15_20_and_25_30_pp'] = round(float(np.mean(sh[:, 4] - (sh[:, 3] + sh[:, 5]) / 2)) * 100, 2)
                x['first_ave_25_30_minus_20_25_pp'] = round(float(np.mean(sh[:, 5] - sh[:, 4])) * 100, 2)
            if cc == 'Boston':
                x['start_0_5_minus_mean_5_20_pp'] = round(float(np.mean(sh[:, 0] - sh[:, 1:4].mean(1))) * 100, 2)
                x['newton_30_35_minus_35_40_pp'] = round(float(np.mean(sh[:, 6] - sh[:, 7])) * 100, 2)
                x['newton_25_35_minus_15_25_pp'] = round(float(np.mean(sh[:, 5:7].mean(1) - sh[:, 3:5].mean(1))) * 100, 2)
            d[cc] = x
    feat[k] = d
res['course_features_goals_3h_to_5h30_all'] = feat

# ---------- terrain sanity check against supplied-route elevation (never an input) ----------
geo = {c['city']: c for c in json.load(open(REPO + '/public/data/insights/course-geometry.json'))['courses']}
MATS = np.array([0, 5, 10, 15, 20, 25, 30, 35, 40, KM])
grade = {}
for cc, c in geo.items():
    e = np.array(c['elevation_m'], float); xs = np.arange(len(e)) * c['elevation_step_km']
    el = np.interp(MATS * c['distance_km'] / KM, xs, e)
    grade[cc] = np.diff(el) / (np.diff(MATS) * 1000) * 100   # % grade per segment
res['segment_grade_pct'] = {cc: [round(float(v), 2) for v in grade[cc]] for cc in ('New York', 'Boston', 'Berlin', 'Chicago', 'London', 'Austin') if cc in grade}
terr = {}
for k in CANDS:
    rs, gs, hr, hg = [], [], [], []
    for G in range(180, 331, 15):
        ks = [kk for kk in base if kk[1] == 'all' and kk[2] == G and ok(base[kk], k) and kk[0] in grade]
        if len(ks) < 8: continue
        S = np.array([base[kk][k]['shape'] for kk in ks]); Gr = np.array([grade[kk[0]] for kk in ks])
        rs.append((S - S.mean(0))[:, 1:8].ravel()); gs.append((Gr - Gr.mean(0))[:, 1:8].ravel())
        # within-half variation only (remove each course's own half means): terrain inside each half
        Sw = S.copy(); Gw = Gr.copy()
        for a, b in ((1, 4), (4, 8)):
            Sw[:, a:b] -= Sw[:, a:b].mean(1, keepdims=True); Gw[:, a:b] -= Gw[:, a:b].mean(1, keepdims=True)
        hr.append((Sw - Sw.mean(0))[:, 1:8].ravel()); hg.append((Gw - Gw.mean(0))[:, 1:8].ravel())
    if rs:
        a, b = np.concatenate(rs), np.concatenate(gs); c1, c2 = np.concatenate(hr), np.concatenate(hg)
        terr[k] = dict(corr_with_grade=round(float(np.corrcoef(a, b)[0, 1]), 3), slope_pct_pace_per_pct_grade=round(float(np.polyfit(b, a * 100, 1)[0]), 2),
                       within_half_corr=round(float(np.corrcoef(c1, c2)[0, 1]), 3), within_half_slope=round(float(np.polyfit(c2, c1 * 100, 1)[0]), 2), points=int(len(a)))
res['terrain_sanity_check'] = dict(note='Each course-segment deviation from the all-course mean shape at the same goal (5-40 km segments, goals 3:00-5:30 every 15 min, all genders) against the supplied route grade deviation. Context check only; elevation is never an input.', by_candidate=terr)

# ---------- biases ----------
bias = {}
for k in CANDS:
    ks = [kk for kk in base if ok(base[kk], k)]
    sr = [base[kk][k]['n'] / base[kk]['current']['n'] for kk in ks]
    qm = [base[kk][k].get('qmed') for kk in ks if base[kk][k].get('qmed') is not None]
    kick = [base[kk][k]['shape'][8] for kk in ks]
    bias[k] = dict(selected_share_of_window_median=round(float(np.median(sr)), 3), q_median=round(float(np.median(qm)), 3) if qm else None,
                   last_2km_rel_pace_median=round(float(np.median(kick)), 3),
                   halves_ratio_median=round(float(np.median([hratio(base[kk][k]['shape']) for kk in ks])), 3))
res['biases'] = bias

# ---------- example tables ----------
EX = [('New York', 'all', 315), ('New York', 'men', 315), ('New York', 'women', 315), ('New York', 'all', 240), ('Boston', 'all', 240),
      ('Berlin', 'all', 210), ('Chicago', 'all', 270), ('Austin', 'all', 270), ('Helsinki', 'all', 270), ('Eindhoven', 'all', 240)]
tabs = {}
for kk in EX:
    c = cells.get(kk)
    if c is None: continue
    G = kk[2] * 60
    t = dict(even=dict(elapsed=[fmt(x) for x in elapsed(np.ones(9), G)]))
    for k in CANDS:
        d = c[k]; row = dict(n=d['n'], editions=d['ed'])
        if 'shape' in d:
            row['elapsed'] = [fmt(x) for x in elapsed(d['shape'], G)]; row['rel_pace'] = [round(float(x), 3) for x in d['shape']]
            row['halves_ratio'] = round(hratio(d['shape']), 3)
        else: row['elapsed'] = None
        t[k] = row
    tabs[f'{kk[0]} {kk[1]} {kk[2] // 60}:{kk[2] % 60:02d}'] = t
res['tables'] = dict(points=POINTS, segments=SEGS, rows=tabs)
json.dump(res, open(M + '/results.json', 'w'), indent=1)

# per-cell compact export
out = {}
for (cc, g, G), c in cells.items():
    out[f'{cc}|{g}|{G}'] = {k: ([c[k]['n'], c[k]['ed']] + ([round(float(x), 4) for x in c[k]['shape']] if 'shape' in c[k] else [])) for k in CANDS}
json.dump(dict(format='key course|gender|goal_minutes -> candidate -> [n, editions, rel pace x9 if qualifying]', cells=out), open(M + '/cells.json', 'w'))
print('ok', len(base), len(common))
