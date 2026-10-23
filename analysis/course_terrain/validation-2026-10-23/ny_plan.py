"""New York 5:15 as the visitor would see it: per mile and per km from the corrected profile (and the raw profile for
contrast), the nine mats beside the steady-runner shape and even pace, with the crossings named on the official axis."""
import json, pickle, sys
import numpy as np
import pandas as pd

V = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/validate'
R = V + '/../research'; M = V + '/../measure'
sys.path.insert(0, V)
import terrain_model as tm

GOAL = 5 * 3600 + 15 * 60; MI = 1.609344; KM = tm.KM


def hms(s):
    s = int(round(s)); return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}'


def ms(s):
    s = int(round(s)); return f'{s // 60}:{s % 60:02d}'


raw = pd.read_parquet('/home/user/data/1050-full/course_profiles.parquet')
r = raw[raw.city == 'New York'].iloc[0]; L = float(r.distance_km)
rp = json.loads(r.points_json)
cp = json.load(open(R + '/corrected_points.json'))['points']['New York']
prof = {c['city']: c for c in json.load(open(R + '/profiles.json'))['courses']}['New York']
k = KM / L
named = {'nyc-verrazzano': 'Verrazzano-Narrows Bridge (upper level)', 'nyc-pulaski': 'Pulaski Bridge (halfway)',
         'nyc-queensboro': 'Queensboro (59th St) Bridge', 'nyc-willis': 'Willis Avenue Bridge', 'nyc-madison': 'Madison Avenue Bridge'}
crossings = []
for c in prof['corrections']:
    if c['id'] in named:
        crossings.append(dict(id=c['id'], name=named[c['id']], km=[round(c['km_from'] * k, 2), round(c['km_to'] * k, 2)],
                              mi=[round(c['km_from'] * k / MI, 2), round(c['km_to'] * k / MI, 2)]))
crossings += [dict(id='first-ave', name='First Avenue (Manhattan, northbound)', km=[round(25.94 * k, 2), round(30.9 * k, 2)], mi=[round(25.94 * k / MI, 2), round(30.9 * k / MI, 2)], note='approximate, from the Queensboro exit to the Willis Avenue Bridge')]

out = dict(goal=hms(GOAL), crossings=crossings)
for pk, pts in (('corrected', cp), ('raw', rp)):
    x, zz, g = tm.grade_profile([p['d_km'] for p in pts], [p['elev_m'] for p in pts])
    T = tm.cum_time(x, g, GOAL)
    miles = list(np.arange(1, 27) * MI) + [KM]
    t_mi = np.round(np.interp(miles, x, T)); t_mi[-1] = GOAL
    kms = list(np.arange(1, 43, 1.0)) + [KM]
    t_km = np.round(np.interp(kms, x, T)); t_km[-1] = GOAL
    def feats(a, b):
        return [c['name'] for c in crossings if c['km'][0] < b and c['km'][1] > a]
    mrows = []
    prev = 0; pa = 0
    for i, (d, t) in enumerate(zip(miles, t_mi)):
        dist = d - pa
        z0, z1 = np.interp(pa, x, zz), np.interp(d, x, zz)
        sel = (x >= pa) & (x <= d)
        climb = float(np.sum(np.clip(np.diff(zz[sel]), 0, None)))
        mrows.append(dict(mile='26.2' if i == 26 else str(i + 1), elapsed=hms(t), split=ms(t - prev),
                          pace_per_mile=ms((t - prev) / (dist / MI)), net_m=round(float(z1 - z0), 1), climb_m=round(climb, 1), features=feats(pa, d)))
        prev = t; pa = d
    krows = []
    prev = 0; pa = 0
    for i, (d, t) in enumerate(zip(kms, t_km)):
        dist = d - pa
        krows.append(dict(km='42.2' if i == 42 else str(i + 1), elapsed=hms(t), split=ms(t - prev), pace_per_km=ms((t - prev) / dist),
                          net_m=round(float(np.interp(d, x, zz) - np.interp(pa, x, zz)), 1), features=feats(pa, d)))
        prev = t; pa = d
    mats = tm.mat_times(x, g, GOAL)
    sh = tm.shape(x, g)
    half = float(np.interp(KM / 2, x, T))
    out[pk] = dict(miles=mrows, km=krows, mats=[hms(v) for v in mats], mat_splits=[ms(v) for v in np.diff(np.r_[0, mats])],
                   segment_relative_pace=[round(float(v), 4) for v in sh], halfway=hms(half),
                   halves=f"{hms(half)} + {hms(GOAL - half)}", fastest_mile=min(mrows[:-1], key=lambda m: m['pace_per_mile'])['mile'],
                   slowest_mile=max(mrows[:-1], key=lambda m: m['pace_per_mile'])['mile'])
cells = pickle.load(open(M + '/cells.pkl', 'rb'))
for gnd in ('all', 'men', 'women'):
    d2 = cells[('New York', gnd, 315)]['D2_A3_wide']
    t = np.round(np.cumsum(d2['shape'] * tm.LEN) / KM * GOAL)
    out[f'steady_{gnd}'] = dict(n=int(d2['n']), editions=int(d2['ed']), mats=[hms(v) for v in t], mat_splits=[ms(v) for v in np.diff(np.r_[0, t])],
                                rel=[round(float(v), 4) for v in d2['shape']])
out['even'] = dict(mats=[hms(v) for v in np.round(tm.MATS[1:] / KM * GOAL)], pace_per_mile=ms(GOAL / (KM / MI)), pace_per_km=ms(GOAL / KM))
json.dump(out, open(V + '/ny_515.json', 'w'), indent=1)

print('crossings', json.dumps(crossings))
print('mats    ', ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'F'])
for kk in ('corrected', 'raw'): print(kk, out[kk]['mats'], out[kk]['mat_splits'], out[kk]['halves'])
for gnd in ('all', 'men', 'women'): print('steady', gnd, out[f'steady_{gnd}']['n'], out[f'steady_{gnd}']['mats'], out[f'steady_{gnd}']['mat_splits'])
print('even', out['even'])
for a, b in zip(out['corrected']['miles'], out['raw']['miles']):
    print(a['mile'], a['elapsed'], a['split'], a['pace_per_mile'], a['net_m'], a['climb_m'], '; '.join(a['features']), '| raw', b['split'], b['net_m'])
print(' '.join(f"{r['km']}:{r['split']}" for r in out['corrected']['km']))
