"""Sample a WCS 2.0.1 (or 1.0.0) surface/terrain model along a route. Downloads go to dl/wcs/<service>/ ."""
import os, io, json, math, hashlib, urllib.request, urllib.parse, numpy as np, tifffile
from pyproj import Transformer
ROOT = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/wcs'
SERVICES = {
    # name: (url, coverage, epsg, axis labels (x,y), version)
    'ahn_dsm': ('https://service.pdok.nl/rws/ahn/wcs/v1_0', 'dsm_05m', 28992, ('x', 'y'), '2.0.1'),
    'ahn_dtm': ('https://service.pdok.nl/rws/ahn/wcs/v1_0', 'dtm_05m', 28992, ('x', 'y'), '2.0.1'),
    'nrw_dgm': ('https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', 'nw_dgm', 25832, ('x', 'y'), '2.0.1'),
    'nrw_dom': ('https://www.wcs.nrw.de/geobasis/wcs_nw_dom', 'nw_dom', 25832, ('x', 'y'), '2.0.1'),
    'es_mdt05': ('https://servicios.idee.es/wcs-inspire/mdt', 'Elevacion25830_5', 25830, ('x', 'y'), '2.0.1'),
    'pl_nmt': ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF', 'DTM_PL-KRON86-NH_TIFF', 2180, ('x', 'y'), '2.0.1'),
    'pl_nmpt': ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel', 'DSM_PL-KRON86-NH', 2180, ('x', 'y'), '2.0.1'),
    'ea_dsm': ('https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-last-return-dsm-1m/wcs', '9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m', 27700, ('E', 'N'), '2.0.1'),
    'ea_dtm': ('https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs', '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m', 27700, ('E', 'N'), '2.0.1'),
}
def fetch(service, x0, y0, x1, y1):
    url, cov, epsg, (ax, ay), ver = SERVICES[service]
    q = [('SERVICE', 'WCS'), ('VERSION', ver), ('REQUEST', 'GetCoverage'), ('COVERAGEID', cov), ('FORMAT', 'image/tiff'),
         ('SUBSET', f'{ax}({x0:.1f},{x1:.1f})'), ('SUBSET', f'{ay}({y0:.1f},{y1:.1f})')]
    full = url + '?' + urllib.parse.urlencode(q)
    d = os.path.join(ROOT, service); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, hashlib.sha1(full.encode()).hexdigest()[:16] + '.tif')
    if not os.path.exists(p):
        if os.environ.get('WCS_NO_CACHE'): pass
        req = urllib.request.Request(full, headers={'User-Agent': 'pace-notes-course-audit/1.0'})
        data = urllib.request.urlopen(req, timeout=120).read()
        open(p, 'wb').write(data)
    a = tifffile.imread(p).astype(float)
    if a.ndim == 3: a = a[0] if a.shape[0] <= 4 else a[..., 0]
    a[(a > 1e30) | (a < -1000)] = np.nan
    if service.startswith('pl_'): a[a <= 1.0] = np.nan  # GUGiK nodata is 0
    return a
def sample_route(service, lats, lons, win_m=1.5, pct=50):
    """For each (lat,lon) return the pct-percentile of the model within +-win_m metres."""
    url, cov, epsg, axes, ver = SERVICES[service]
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = tr.transform(np.asarray(lons), np.asarray(lats))
    out = []
    # fetch one block covering all points (in chunks of <= 1500 m)
    pts = list(zip(xs, ys)); i = 0
    while i < len(pts):
        j = i; bx0 = bx1 = pts[i][0]; by0 = by1 = pts[i][1]
        while j < len(pts) and max(bx1, pts[j][0]) - min(bx0, pts[j][0]) < 120 and max(by1, pts[j][1]) - min(by0, pts[j][1]) < 120:
            bx0 = min(bx0, pts[j][0]); bx1 = max(bx1, pts[j][0]); by0 = min(by0, pts[j][1]); by1 = max(by1, pts[j][1]); j += 1
        X0, X1, Y0, Y1 = bx0 - 10, bx1 + 10, by0 - 10, by1 + 10
        a = fetch(service, X0, Y0, X1, Y1)
        h, w = a.shape; rx = (X1 - X0) / w; ry = (Y1 - Y0) / h
        for x, y in pts[i:j]:
            c0 = int((x - win_m - X0) / rx); c1 = int(math.ceil((x + win_m - X0) / rx))
            r0 = int((Y1 - (y + win_m)) / ry); r1 = int(math.ceil((Y1 - (y - win_m)) / ry))
            v = a[max(r0, 0):max(r1, r0 + 1), max(c0, 0):max(c1, c0 + 1)]
            v = v[np.isfinite(v)]
            out.append(float(np.percentile(v, pct)) if v.size else float('nan'))
        i = j
    return out

import time as _time
def opentopodata(dataset, lats, lons, cache_name):
    """Public api.opentopodata.org, 100 points per call, >=1.1 s apart; cached by name."""
    p = os.path.join(ROOT, f'otd_{dataset}_{cache_name}.json')
    if os.path.exists(p): return json.load(open(p))
    out = []
    for i in range(0, len(lats), 100):
        locs = '|'.join(f'{a:.6f},{b:.6f}' for a, b in zip(lats[i:i + 100], lons[i:i + 100]))
        for k in range(5):
            try:
                req = urllib.request.Request(f'https://api.opentopodata.org/v1/{dataset}', data=urllib.parse.urlencode({'locations': locs}).encode(), headers={'User-Agent': 'pace-notes-course-audit/1.0'})
                j = json.load(urllib.request.urlopen(req, timeout=60)); break
            except Exception as e:
                _time.sleep(3 * (k + 1)); j = None
        out += [r['elevation'] if r['elevation'] is not None else float('nan') for r in (j or {}).get('results', [{'elevation': None}] * len(locs.split('|')))]
        _time.sleep(1.2)
    os.makedirs(ROOT, exist_ok=True); json.dump(out, open(p, 'w')); return out
