import json, math
import numpy as np, pandas as pd
P = '/home/user/data/1050-full/course_profiles.parquet'
_df = None
def profiles():
    global _df
    if _df is None: _df = pd.read_parquet(P)
    return _df
def points(city):
    return json.loads(profiles().query('city == @city').iloc[0].points_json)
def project(pts, lat, lon, max_m=30):
    """Return list of (d_km, dist_m) candidate projections of a point on the route polyline within max_m."""
    lat0 = math.radians(pts[0]['lat']); kx = 111320 * math.cos(lat0); ky = 110540
    xs = np.array([p['lon'] for p in pts]) * kx; ys = np.array([p['lat'] for p in pts]) * ky
    ds = np.array([p['d_km'] for p in pts])
    px, py = lon * kx, lat * ky
    ax, ay, bx, by = xs[:-1], ys[:-1], xs[1:], ys[1:]
    vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy; L2[L2 == 0] = 1e-9
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1)
    cx, cy = ax + t * vx, ay + t * vy
    dist = np.hypot(px - cx, py - cy)
    out = []
    for i in np.where(dist <= max_m)[0]:
        out.append((float(ds[i] + t[i] * (ds[i + 1] - ds[i])), float(dist[i])))
    return out
def elev_at(pts, d):
    ds = [p['d_km'] for p in pts]; es = [p['elev_m'] for p in pts]
    return float(np.interp(d, ds, es))

import os, urllib.request, xml.etree.ElementTree as ET
OSMD = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/osm'
def osm_way(wid):
    """Return (tags, [(lat,lon),...]) for an OSM way via the OSM API (cached)."""
    os.makedirs(OSMD, exist_ok=True); p = os.path.join(OSMD, f'way_{wid}.xml')
    if not os.path.exists(p):
        req = urllib.request.Request(f'https://api.openstreetmap.org/api/0.6/way/{wid}/full', headers={'User-Agent': 'pace-notes-course-audit/1.0'})
        open(p, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    root = ET.parse(p).getroot()
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
    w = root.find('way')
    tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
    return tags, [nodes[nd.get('ref')] for nd in w.findall('nd')]
def osm_bbox_ways(s, w, n, e, key='bridge'):
    """All ways in a small bbox with the given tag key (OSM API map call, cached)."""
    os.makedirs(OSMD, exist_ok=True); p = os.path.join(OSMD, f'map_{s:.5f}_{w:.5f}_{n:.5f}_{e:.5f}.xml')
    if not os.path.exists(p):
        req = urllib.request.Request(f'https://api.openstreetmap.org/api/0.6/map?bbox={w},{s},{e},{n}', headers={'User-Agent': 'pace-notes-course-audit/1.0'})
        open(p, 'wb').write(urllib.request.urlopen(req, timeout=120).read())
    root = ET.parse(p).getroot()
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
    out = []
    for wy in root.iter('way'):
        tags = {t.get('k'): t.get('v') for t in wy.findall('tag')}
        if key in tags and 'highway' in tags:
            out.append((wy.get('id'), tags, [nodes[nd.get('ref')] for nd in wy.findall('nd') if nd.get('ref') in nodes]))
    return out
def densify(coords, step_m=10):
    out = [coords[0]]
    for (a, b), (c, d) in zip(coords, coords[1:]):
        L = math.hypot((d - b) * 111320 * math.cos(math.radians(a)), (c - a) * 110540)
        n = max(1, int(L / step_m))
        for k in range(1, n + 1): out.append((a + (c - a) * k / n, b + (d - b) * k / n))
    return out
