"""Measure fade-free, terrain-shaped split plans for every pace-band course x goal x recorded gender.

Inputs: cohort_tool.npz (prep.py: the pace band's own screened tool cohort, release private-export-20261021-1050),
the published pace-band index (which cells exist), and course-geometry.json ONLY as an after-the-fact sanity check.
Outputs: results.json (summaries, example tables) and cells.json (per-cell n / editions / shape per candidate)."""
import json, sys
import numpy as np

M = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/measure'
REPO = '/home/user/wt/shape'
LEN = np.array([5.0] * 8 + [2.195]); KM = 42.195
POINTS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish']
SEGS = ['0-5', '5-10', '10-15', '15-20', '20-25', '25-30', '30-35', '35-40', '40-F']
GOALS = range(150, 391); WIN = 300; MIN_N = 100; MIN_ED = 3
GENDERS = (('all', None), ('men', 1), ('women', 2))

z = np.load(M + '/cohort_tool.npz')
times = z['times'].astype(np.float64); finish = z['finish'].astype(np.float64)
edition = z['edition'].astype(np.int64); city = z['city']; gender = z['gender']; slow = z['slow']; ed_year = z['ed_year']
cities = [str(c) for c in z['cities']]
seg = np.diff(np.c_[np.zeros(len(times)), times], axis=1)
r_all = (seg / LEN) / (finish / KM)[:, None]          # each segment's pace / the finish's own average pace
q_all = ((finish - times[:, 3]) / (KM - 20)) / (times[:, 3] / 20)   # 20K-to-finish pace / 0-20K pace
spread_all = r_all[:, 1:8].std(axis=1)                # spread of the 5-40 km segment paces (start and 2.2 km kick left out)
del seg

index = json.load(open(REPO + '/public/data/insights/tools/pace-band.json'))
scopes = [s for s in index['scopes'] if s['slug'] != 'all']
pub = {}  # published 'all' cells (course, gender) -> {G: (n, ed, e50)}
for s in scopes:
    for g in s['genders']:
        sh = json.load(open(f"{REPO}/public/data/insights/tools/pace-band/{s['slug']}/{g}.json"))['groups']['all']
        pub[(s['city'], g)] = {G: (n, ed, e50) for G, n, ed, e50 in zip(sh['g'], sh['n'], sh['ed'], sh['e50'])}

def shape_of(r):
    m = np.median(r, axis=0)
    return m * KM / float((m * LEN).sum())

def renorm(m):
    return m * KM / float((m * LEN).sum())

def elapsed(shape, goal_s):
    return np.cumsum(shape * LEN) / KM * goal_s

def halves(sel_ed):
    """Split the selection's editions by year: older half vs newer half (editions, not finishes)."""
    u = np.unique(sel_ed)
    if len(u) < 2: return None
    u = u[np.argsort(ed_year[u], kind='stable')]
    k = len(u) // 2
    return np.isin(sel_ed, u[:k]), np.isin(sel_ed, u[k:])

A_T = (0.02, 0.03, 0.05)
CANDS = ['current', 'asrun_rel'] + [f'A{int(t*100)}' for t in A_T] + [f'A{int(t*100)}o' for t in A_T] + \
        ['B', 'C', 'D1_steadiest_third', 'D2_A3_wide', 'D3_fit_q1', 'D4_typsteady_x_course']

cells = {}   # (city, gender, G) -> {cand: dict(n, ed, shape, halves_diff)}
sel_stats = {}
for s in scopes:
    ci = cities.index(s['city'])
    for gname, gcode in GENDERS:
        if (s['city'], gname) not in pub: continue
        mem = np.flatnonzero((city == ci) & (True if gcode is None else (gender == gcode)))
        mem = mem[np.argsort(finish[mem], kind='stable')]
        F = finish[mem]; R = r_all[mem]; Q = q_all[mem]; SL = slow[mem]; SP = spread_all[mem]; ED = edition[mem]
        for G in GOALS:
            lo, hi = np.searchsorted(F, [G * 60 - WIN, G * 60])
            if hi - lo < MIN_N: continue
            out = {}
            w = slice(lo, hi); Rw, Qw, EDw = R[w], Q[w], ED[w]
            def put(name, mask, Rsrc=Rw, EDsrc=EDw, extra=None):
                n = int(mask.sum()); ed = int(len(np.unique(EDsrc[mask]))) if n else 0
                d = dict(n=n, ed=ed)
                if n >= MIN_N and ed >= MIN_ED:
                    d['shape'] = shape_of(Rsrc[mask])
                    h = halves(EDsrc[mask])
                    if h is not None and h[0].sum() >= 50 and h[1].sum() >= 50:
                        d['half'] = (shape_of(Rsrc[mask][h[0]]), shape_of(Rsrc[mask][h[1]]))
                        d['half_n'] = (int(h[0].sum()), int(h[1].sum()))
                    d['qmed'] = float(np.median(Qsrc_of(name)[mask])) if extra is None else extra
                out[name] = d
            def Qsrc_of(name):
                return Qx if name == 'D2_A3_wide' else Qw
            allm = np.ones(hi - lo, bool)
            # current published rule: e50 x goal / e50[finish]
            n, ed, e50 = pub[(s['city'], gname)].get(G, (hi - lo, len(np.unique(EDw)), None))
            cur = dict(n=int(hi - lo), ed=int(len(np.unique(EDw))))
            if cur['n'] >= MIN_N and cur['ed'] >= MIN_ED:
                e = np.median(times[mem[w]], axis=0)
                cur['shape'] = renorm(np.diff(np.r_[0, e]) / LEN)
                h = halves(EDw)
                if h is not None and h[0].sum() >= 50 and h[1].sum() >= 50:
                    e0 = np.median(times[mem[w]][h[0]], axis=0); e1 = np.median(times[mem[w]][h[1]], axis=0)
                    cur['half'] = (renorm(np.diff(np.r_[0, e0]) / LEN), renorm(np.diff(np.r_[0, e1]) / LEN))
                cur['qmed'] = float(np.median(Qw))
            out['current'] = cur
            put('asrun_rel', allm)
            for t in A_T:
                put(f'A{int(t*100)}', np.abs(Qw - 1) <= t)
                put(f'A{int(t*100)}o', Qw <= 1 + t)
            put('B', ~SL[w])
            k = (hi - lo) // 3
            third = np.zeros(hi - lo, bool); third[np.argsort(SP[w], kind='stable')[:k]] = True
            put('D1_steadiest_third', third)
            # wider window for shape only: G-10:00 .. G+9:59
            lo2, hi2 = np.searchsorted(F, [G * 60 - 600, G * 60 + 600]); Qx = Q[lo2:hi2]
            put('D2_A3_wide', np.abs(Qx - 1) <= 0.03, Rsrc=R[lo2:hi2], EDsrc=ED[lo2:hi2])
            # D3: per-segment OLS of r_j on (q - 1) over the window (|q-1| <= 0.3), intercept = the shape at even halves
            mk = np.abs(Qw - 1) <= 0.3
            if mk.sum() >= MIN_N and len(np.unique(EDw[mk])) >= MIN_ED:
                X = np.c_[np.ones(mk.sum()), Qw[mk] - 1]
                beta = np.linalg.lstsq(X, Rw[mk], rcond=None)[0]
                d3 = dict(n=int(mk.sum()), ed=int(len(np.unique(EDw[mk]))), shape=renorm(beta[0]), qmed=1.0)
                h = halves(EDw[mk])
                if h is not None and h[0].sum() >= 50 and h[1].sum() >= 50:
                    hh = []
                    for hm in h:
                        b = np.linalg.lstsq(X[hm], Rw[mk][hm], rcond=None)[0]; hh.append(renorm(b[0]))
                    d3['half'] = tuple(hh)
            else:
                d3 = dict(n=int(mk.sum()), ed=int(len(np.unique(EDw[mk]))))
            out['D3_fit_q1'] = d3
            cells[(s['city'], gname, G)] = out

# C and D4 need every course's shape at the same goal and gender
for gname, _ in GENDERS:
    for G in GOALS:
        keys = [k for k in cells if k[1] == gname and k[2] == G and 'shape' in cells[k]['asrun_rel']]
        if not keys: continue
        typ_asrun = renorm(np.median([cells[k]['asrun_rel']['shape'] for k in keys], axis=0))
        stk = [k for k in keys if 'shape' in cells[k]['A3']]
        typ_steady = renorm(np.median([cells[k]['A3']['shape'] for k in stk], axis=0)) if stk else None
        for k in [k for k in cells if k[1] == gname and k[2] == G]:
            c = cells[k]; base = c['asrun_rel']
            dC = dict(n=base['n'], ed=base['ed']); dD4 = dict(n=base['n'], ed=base['ed'])
            if 'shape' in base:
                dC['shape'] = renorm(base['shape'] / typ_asrun)
                if typ_steady is not None: dD4['shape'] = renorm(typ_steady * base['shape'] / typ_asrun)
                if 'half' in base:
                    dC['half'] = tuple(renorm(h / typ_asrun) for h in base['half'])
                    if typ_steady is not None: dD4['half'] = tuple(renorm(typ_steady * h / typ_asrun) for h in base['half'])
            c['C'] = dC; c['D4_typsteady_x_course'] = dD4
            c['_typ'] = dict(asrun=typ_asrun, steady=typ_steady, ncourses=len(keys))

import pickle
pickle.dump(cells, open(M + '/cells.pkl', 'wb'))
print('cells', len(cells))
