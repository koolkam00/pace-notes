"""Find OSM bridge/tunnel ways along a route range and sample a surface model along them."""
import math, numpy as np
from route import points, project, osm_bbox_ways, densify, elev_at
def route_range(city, d0, d1):
    pts = points(city)
    sel = [p for p in pts if d0 - 0.2 <= p['d_km'] <= d1 + 0.2]
    la = [p['lat'] for p in sel]; lo = [p['lon'] for p in sel]
    return pts, min(la) - 0.002, min(lo) - 0.003, max(la) + 0.002, max(lo) + 0.003
def ways_on_route(city, d0, d1, key='bridge', max_m=25, bbox_split=1):
    pts, s, w, n, e = route_range(city, d0, d1)
    ways = []
    # split bbox into tiles to stay under API limits
    k = bbox_split
    for i in range(k):
        for j in range(k):
            ss = s + (n - s) * i / k; nn = s + (n - s) * (i + 1) / k
            ww = w + (e - w) * j / k; ee = w + (e - w) * (j + 1) / k
            ways += osm_bbox_ways(ss, ww, nn, ee, key)
    seen = set(); out = []
    for wid, tags, coords in ways:
        if wid in seen or len(coords) < 2: continue
        seen.add(wid)
        if tags.get(key) in ('no',): continue
        dens = densify(coords, 10)
        proj = []
        for a, b in dens:
            pr = [x for x in project(pts, a, b, max_m) if d0 - 0.3 <= x[0] <= d1 + 0.3]
            proj.append(min(pr, key=lambda x: x[1]) if pr else None)
        frac = sum(p is not None for p in proj) / len(proj)
        if frac >= 0.6:
            ds = [p[0] for p in proj if p]
            out.append(dict(id=wid, name=tags.get('name') or tags.get('bridge:name'), highway=tags.get('highway'), tags=tags,
                            d_from=round(min(ds), 3), d_to=round(max(ds), 3), mean_off_m=round(float(np.mean([p[1] for p in proj if p])), 1),
                            coords=dens, proj=proj))
    return sorted(out, key=lambda x: x['d_from'])
