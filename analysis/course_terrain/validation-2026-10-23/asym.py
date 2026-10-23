"""Asymmetry diagnostic: does the steady-runner shape follow the model's uphill and downhill parts equally?
y = observed - leave-one-course-out common pattern; x_up/x_dn = segment means of (f(g)-1) over climbing / descending steps.
All demeaned within each cell over segments 5-40 km; least squares y ~ a x_up + b x_dn; cluster bootstrap by course."""
import json, numpy as np
exec(open('validate.py').read().split('# per course: mean over goals')[0].replace("json.dump(dict(model=","_x=(dict(model=").replace("open(V + '/model_shapes.json', 'w'), indent=1)","None)"))
def comps(cc):
    x, zz, g = G[(cc, 'corrected')]; fx = tm.f(g) - 1
    up, dn = [], []
    for a, b in zip(tm.MATS[:-1], tm.MATS[1:]):
        s = (x >= a) & (x < b); up.append(np.mean(np.where(g[s] > 0, fx[s], 0))); dn.append(np.mean(np.where(g[s] < 0, fx[s], 0)))
    return np.array(up), np.array(dn)
C = {cc: comps(cc) for cc in geo_courses}
def fit(sub, segs=slice(1, 8)):
    Y, U, D = [], [], []
    for _, r in sub.iterrows():
        common = r.obs - r.dev_obs - (r.model - r.dev_mod)     # other courses' mean obs - other courses' mean model
        y = (r.obs - common)[segs]; u, d = C[r.city][0][segs], C[r.city][1][segs]
        Y.append(y - y.mean()); U.append(u - u.mean()); D.append(d - d.mean())
    Y, U, D = map(np.concatenate, (Y, U, D))
    X = np.c_[U, D]; coef = np.linalg.lstsq(X, Y, rcond=None)[0]
    return coef
res = {}
for name, sel in (('publishable_a_b', usable), ('a_b_without_Warsaw', [c for c in usable if c != 'Warsaw'])):
    sub = df[(df.prof == 'corrected') & df.city.isin(sel)]
    for lo, hi in ((180, 360), (180, 225), (240, 285), (300, 360)):
        s = sub[(sub.goal >= lo) & (sub.goal <= hi)]
        a, b = fit(s)
        rng = np.random.default_rng(2); cs = sorted(s.city.unique()); bs = []
        for _ in range(1000):
            pick = rng.choice(cs, len(cs)); bs.append(fit(pd.concat([s[s.city == c] for c in pick])))
        bs = np.array(bs)
        res[f'{name} {lo}-{hi}'] = dict(cells=len(s), uphill=round(float(a), 2), uphill_ci90=[round(float(v), 2) for v in np.quantile(bs[:, 0], [.05, .95])],
                                       downhill=round(float(b), 2), downhill_ci90=[round(float(v), 2) for v in np.quantile(bs[:, 1], [.05, .95])])
        print(name, lo, hi, res[f'{name} {lo}-{hi}'])
json.dump(res, open(V + '/asymmetry.json', 'w'), indent=1)
