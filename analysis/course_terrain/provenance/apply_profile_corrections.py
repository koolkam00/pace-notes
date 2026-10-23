#!/usr/bin/env python3
"""Apply the structure and profile corrections in profiles.json to the raw course profiles.

  python3 apply_profile_corrections.py --profiles /home/user/data/1050-full/course_profiles.parquet \
      --corrections profiles.json --out corrected_course_profiles.parquet [--json corrected_points.json]

Only courses classified "b" are changed. Every correction is expressed on the supplied route's own
distance axis (points_json d_km; it is the GPX length, not the official 42.195 km). Modes:
  replace_range    drop the profile points inside [km_from, km_to] and insert the anchors (lat/lon are
                   interpolated along the original route polyline);
  point_overrides  set the nearest existing point (within 0.10 km) of each anchor to the anchor value;
  replace_all      replace the whole profile with the anchors (a rebuilt profile from an authoritative
                   terrain model with structure decks).
Courses classified "a" are copied unchanged; courses classified "c" are copied unchanged and listed in
the output's "no_terrain_split" field (their band should stay even pace). Summary fields (gain, loss,
min, max, segments_json) are recomputed for changed courses with the threshold the source notes used
(1.0 m for NED courses, 2.0 m otherwise). The input file's SHA-256 must match profiles.json.
"""
import argparse, hashlib, json, sys
import numpy as np
import pandas as pd


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()


def interp_latlon(pts, d):
    ds = np.array([p['d_km'] for p in pts])
    return float(np.interp(d, ds, [p['lat'] for p in pts])), float(np.interp(d, ds, [p['lon'] for p in pts]))


def apply_one(pts, corr):
    mode = corr.get('mode', 'replace_range')
    anchors = sorted(corr['anchors'])
    if mode == 'point_overrides':
        out = [dict(p) for p in pts]
        for d, z in anchors:
            i = int(np.argmin([abs(p['d_km'] - d) for p in out]))
            if abs(out[i]['d_km'] - d) <= 0.10: out[i]['elev_m'] = float(z); out[i]['corrected'] = corr['id']
        return out
    if mode == 'replace_all':
        out = []
        for d, z in anchors:
            la, lo = interp_latlon(pts, d)
            out.append(dict(d_km=round(float(d), 3), elev_m=float(z), lat=round(la, 6), lon=round(lo, 6), corrected=corr['id']))
        return out
    a, b = float(corr['km_from']), float(corr['km_to'])
    keep = [dict(p) for p in pts if p['d_km'] < a or p['d_km'] > b]
    for d, z in anchors:
        if a - 1e-9 <= d <= b + 1e-9:
            la, lo = interp_latlon(pts, d)
            keep.append(dict(d_km=round(float(d), 3), elev_m=float(z), lat=round(la, 6), lon=round(lo, 6), corrected=corr['id']))
    return sorted(keep, key=lambda p: p['d_km'])


def gain_loss(z, thr):
    g = l = 0.0; ref = z[0]
    for v in z[1:]:
        if v - ref >= thr: g += v - ref; ref = v
        elif ref - v >= thr: l += ref - v; ref = v
    return round(g, 1), round(l, 1)


def segments(pts, thr, step=5.0):
    ds = np.array([p['d_km'] for p in pts]); zs = np.array([p['elev_m'] for p in pts]); out = []
    k = 0.0
    while k < ds[-1]:
        hi = min(k + step, ds[-1]); grid = np.arange(k, hi + 1e-9, 0.05); z = np.interp(grid, ds, zs)
        g, l = gain_loss(z, thr)
        out.append(dict(km_from=round(k, 1), km_to=round(hi, 2), elev_gain_m=g, elev_loss_m=l, elev_net_m=round(float(z[-1] - z[0]), 1), elev_mean_m=round(float(z.mean()), 1)))
        k += step
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--profiles', required=True)
    ap.add_argument('--corrections', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--json')
    ap.add_argument('--allow-hash-mismatch', action='store_true')
    a = ap.parse_args()
    spec = json.load(open(a.corrections))
    actual = sha256(a.profiles)
    if actual != spec['input']['sha256'] and not a.allow_hash_mismatch:
        sys.exit(f"course_profiles.parquet SHA-256 {actual} does not match profiles.json {spec['input']['sha256']}")
    df = pd.read_parquet(a.profiles)
    by_city = {c['city']: c for c in spec['courses']}
    report, pts_out, no_split = {}, {}, []
    for i, row in df.iterrows():
        c = by_city.get(row['city'])
        if c is None: continue
        if c['class'] == 'c': no_split.append(row['city'])
        if c['class'] != 'b' or not c.get('corrections'): continue
        pts = json.loads(row['points_json'])
        for corr in sorted(c['corrections'], key=lambda x: 0 if x.get('mode') == 'replace_all' else 1):
            pts = apply_one(pts, corr)
        thr = 1.0 if 'ned10m' in str(row['source']) else 2.0
        z = np.interp(np.arange(0, pts[-1]['d_km'], 0.05), [p['d_km'] for p in pts], [p['elev_m'] for p in pts])
        g, l = gain_loss(z, thr)
        before = (float(row['elev_gain_m']), float(row['elev_loss_m']))
        df.at[i, 'points_json'] = json.dumps(pts)
        df.at[i, 'elev_gain_m'] = g; df.at[i, 'elev_loss_m'] = l
        df.at[i, 'elev_min_m'] = round(float(min(p['elev_m'] for p in pts)), 1); df.at[i, 'elev_max_m'] = round(float(max(p['elev_m'] for p in pts)), 1)
        df.at[i, 'segments_json'] = json.dumps(segments(pts, thr))
        df.at[i, 'source'] = f"{row['source']}+corrections:{spec['version']}"
        df.at[i, 'notes'] = f"{row['notes']} | Structure/profile corrections {spec['version']}: " + '; '.join(x['id'] for x in c['corrections'])
        report[row['city']] = dict(gain_loss_before=before, gain_loss_after=(g, l), corrections=[x['id'] for x in c['corrections']])
        pts_out[row['city']] = pts
    df.to_parquet(a.out, index=False)
    if a.json: json.dump(dict(version=spec['version'], points=pts_out, no_terrain_split=no_split), open(a.json, 'w'))
    print(json.dumps(dict(changed=report, unchanged_no_terrain_split=no_split), indent=1))


if __name__ == '__main__':
    main()
