"""NY 5:15 sensitivity: smoothing, model choice (Kay 2012 quartic), Verrazzano lower level (deck ~9 m lower at midspan)."""
import json, sys, numpy as np
V = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/validate'; sys.path.insert(0, V)
import terrain_model as tm
cp = json.load(open(V + '/../research/corrected_points.json'))['points']['New York']
d = np.array([p['d_km'] for p in cp]); z = np.array([p['elev_m'] for p in cp])
GOAL = 315 * 60; MI = 1.609344
def ms(s): s = int(round(s)); return f'{s // 60}:{s % 60:02d}'
def run(d, z, fx=None, **kw):
    x, zz, g = tm.grade_profile(d, z, **kw)
    F = tm.f(g) if fx is None else fx(np.clip(g, -10, 10))
    w = 0.5 * (F[1:] + F[:-1]) * np.diff(x); T = np.r_[0, np.cumsum(w)]; T = T * GOAL / T[-1]
    mats = np.round(np.interp(tm.MATS[1:], x, T)); miles = np.round(np.interp(np.r_[np.arange(1, 27) * MI, tm.KM], x, T))
    return [ms(v) for v in np.diff(np.r_[0, mats])], [ms(v) for v in np.diff(np.r_[0, miles])]
kay = lambda g: 1 + 3.639 * (g / 100) + 17.757 * (g / 100) ** 2 - 3.100 * (g / 100) ** 3 - 23.834 * (g / 100) ** 4
z_low = z.copy(); s = d <= 2.49
# lower level: midspan ~9 m lower, tapering to 0 at both towers' approach ends (linear in distance from midspan 1.236 km)
z_low[s] = z[s] - 9 * np.clip(1 - np.abs(d[s] - 1.236) / 1.25, 0, 1)
res = {}
for name, args in (('recommended (median 210 m, sigma 100 m)', dict()), ('sigma 200 m', dict(sigma_m=200)), ('sigma 50 m', dict(sigma_m=50)),
                   ('Kay 2012 quartic', dict(fx=kay)), ('Verrazzano lower level (approx -9 m at midspan)', dict(z=z_low))):
    zz = args.pop('z', z); m, mi = run(d, zz, **args)
    res[name] = dict(mat_splits=m, miles_1_2_15_16_24=[mi[0], mi[1], mi[14], mi[15], mi[23]])
    print(name, m, res[name]['miles_1_2_15_16_24'])
json.dump(res, open(V + '/ny_sensitivity.json', 'w'), indent=1)
