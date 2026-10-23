"""Snap route sample points to the nearest aligned OSM highway centreline (from the cached corridor downloads)."""
import os, glob, math, numpy as np, xml.etree.ElementTree as ET
CORR = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/osm_corridor'
RUNNABLE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'pedestrian',
            'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road', 'busway', 'footway', 'cycleway', 'path', 'track'}
def corridor_segments(lat_min, lon_min, lat_max, lon_max):
    import gzip, json
    segs = []; seen = set()
    for f in glob.glob(os.path.join(CORR, '*.hw.json.gz')):
        s, w, n, e = map(float, os.path.basename(f)[:-len('.hw.json.gz')].split('_'))
        if n < lat_min or s > lat_max or e < lon_min or w > lon_max: continue
        try: ways = json.load(gzip.open(f, 'rt'))
        except Exception: continue
        for wy in ways:
            if wy['id'] in seen: continue
            tags = wy['tags']; hw = tags.get('highway')
            if hw not in RUNNABLE: continue
            if tags.get('tunnel', 'no') != 'no' or tags.get('bridge', 'no') != 'no' or tags.get('covered', 'no') != 'no': continue
            seen.add(wy['id']); c = wy['c']
            pri = 0 if hw not in ('footway', 'cycleway', 'path', 'track', 'service') else 1
            for a, b in zip(c, c[1:]): segs.append((a[0], a[1], b[0], b[1], pri))
    return np.array(segs) if segs else np.zeros((0, 5))
def snap(lats, lons, max_m=20.0, min_cos=0.6):
    lats = np.asarray(lats, float); lons = np.asarray(lons, float)
    segs = corridor_segments(lats.min() - 0.002, lons.min() - 0.002, lats.max() + 0.002, lons.max() + 0.002)
    out_la = lats.copy(); out_lo = lons.copy(); moved = np.zeros(len(lats))
    if len(segs) == 0: return out_la, out_lo, moved
    kx = 111320 * math.cos(math.radians(float(np.mean(lats)))); ky = 110540
    ax, ay, bx, by = segs[:, 1] * kx, segs[:, 0] * ky, segs[:, 3] * kx, segs[:, 2] * ky
    vx, vy = bx - ax, by - ay; L = np.hypot(vx, vy); L[L == 0] = 1e-9
    for i in range(len(lats)):
        px, py = lons[i] * kx, lats[i] * ky
        j0, j1 = max(i - 2, 0), min(i + 2, len(lats) - 1)
        tx, ty = (lons[j1] - lons[j0]) * kx, (lats[j1] - lats[j0]) * ky; tl = math.hypot(tx, ty) or 1e-9
        near = (np.minimum(ax, bx) - max_m <= px) & (np.maximum(ax, bx) + max_m >= px) & (np.minimum(ay, by) - max_m <= py) & (np.maximum(ay, by) + max_m >= py)
        idx = np.where(near)[0]
        if not len(idx): continue
        t = np.clip(((px - ax[idx]) * vx[idx] + (py - ay[idx]) * vy[idx]) / (L[idx] ** 2), 0, 1)
        cx, cy = ax[idx] + t * vx[idx], ay[idx] + t * vy[idx]
        dist = np.hypot(px - cx, py - cy)
        cos = np.abs((vx[idx] * tx + vy[idx] * ty) / (L[idx] * tl))
        score = dist + 8.0 * segs[idx, 4] + np.where(cos >= min_cos, 0, 1e6)
        k = int(np.argmin(score))
        if score[k] < max_m + 8.0 and dist[k] <= max_m:
            out_lo[i] = cx[k] / kx; out_la[i] = cy[k] / ky; moved[i] = dist[k]
    return out_la, out_lo, moved
