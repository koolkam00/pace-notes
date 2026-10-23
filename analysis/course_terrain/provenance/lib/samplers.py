"""Ground (terrain) and surface samplers for national elevation services. Each sampler: f(lats, lons) -> list of metres."""
import os, json, math, time, hashlib, urllib.request, urllib.parse, glob
import numpy as np
from pyproj import Transformer
import wcs, geotiff
CACHE = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/api'
os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'pace-notes-course-audit/1.0 (one-off research)'}

def _cached(key, fn):
    p = os.path.join(CACHE, hashlib.sha1(key.encode()).hexdigest()[:20] + '.json')
    if os.path.exists(p): return json.load(open(p))
    v = fn(); json.dump(v, open(p, 'w')); return v

def _get(url, data=None, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            return json.load(urllib.request.urlopen(req, timeout=90))
        except Exception as e:
            err = e; time.sleep(2 * (k + 1))
    raise err

def ign_fr(lats, lons):
    out = []
    for i in range(0, len(lats), 100):
        la = '|'.join(f'{x:.6f}' for x in lats[i:i + 100]); lo = '|'.join(f'{x:.6f}' for x in lons[i:i + 100])
        url = f'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon={lo}&lat={la}&resource=ign_rge_alti_wld&zonly=true'
        v = _cached(url, lambda: _get(url)['elevations'])
        out += [x if x is not None and x > -99 else float('nan') for x in v]
    return out

def kartverket(lats, lons):
    out = []
    for i in range(0, len(lats), 50):
        pts = json.dumps([[round(b, 6), round(a, 6)] for a, b in zip(lats[i:i + 50], lons[i:i + 50])])
        url = 'https://ws.geonorge.no/hoydedata/v1/punkt?' + urllib.parse.urlencode(dict(koordsys=4258, punkter=pts, geojson='false'))
        v = _cached(url, lambda: [(p['z'] if p.get('datakilde', '').startswith('dtm') else None) for p in _get(url)['punkter']])
        out += [x if x is not None else float('nan') for x in v]
    return out

def gsi(lats, lons):
    out = []
    for a, b in zip(lats, lons):
        url = f'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={b:.6f}&lat={a:.6f}&outtype=JSON'
        def f():
            j = _get(url); time.sleep(0.15)
            return j.get('elevation') if isinstance(j.get('elevation'), (int, float)) else None
        v = _cached(url, f); out.append(v if v is not None else float('nan'))
    return out

_tr5514 = Transformer.from_crs(4326, 5514, always_xy=True)
def cuzk(lats, lons, service='dmr5g'):
    xs, ys = _tr5514.transform(np.asarray(lons), np.asarray(lats)); out = []
    for x, y in zip(xs, ys):
        geom = json.dumps({'x': round(float(x), 2), 'y': round(float(y), 2), 'spatialReference': {'wkid': 5514}})
        url = f'https://ags.cuzk.cz/arcgis2/rest/services/{service}/ImageServer/identify?' + urllib.parse.urlencode(dict(geometry=geom, geometryType='esriGeometryPoint', returnGeometry='false', returnCatalogItems='false', f='json'))
        def f():
            v = _get(url).get('value')
            try: return float(v)
            except Exception: return None
        v = _cached(url, f); out.append(v if v is not None else float('nan'))
    return out

def otd(dataset, name):
    return lambda la, lo: wcs.opentopodata(dataset, list(la), list(lo), name + '_' + hashlib.sha1(json.dumps([round(x, 5) for x in list(la)[:50]]).encode()).hexdigest()[:8])

def linz_dsm(la, lo):
    T = glob.glob('/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/linz/*_dsm.tiff')
    return geotiff.sample_mosaic(T, 2193, la, lo, 1.5, 25)

GROUND = {
    'ahn': lambda a, b: wcs.sample_route('ahn_dtm', a, b, 2.0, 50),
    'nrw': lambda a, b: wcs.sample_route('nrw_dgm', a, b, 2.0, 50),
    'es': lambda a, b: wcs.sample_route('es_mdt05', a, b, 3.0, 50),
    'ea': lambda a, b: wcs.sample_route('ea_dtm', a, b, 2.0, 50),
    'pl': lambda a, b: wcs.sample_route('pl_nmt', a, b, 2.0, 50),
    'ign_fr': ign_fr, 'kartverket': kartverket, 'gsi': gsi, 'cuzk': cuzk,
    'nz': None,  # set per course via otd()
}
SURFACE = {
    'ahn': lambda a, b: wcs.sample_route('ahn_dsm', a, b, 1.0, 25),
    'nrw': lambda a, b: wcs.sample_route('nrw_dom', a, b, 1.0, 25),
    'ea': lambda a, b: wcs.sample_route('ea_dsm', a, b, 1.0, 25),
    'cuzk': lambda a, b: cuzk(a, b, 'dmp1g'),
    'pl': lambda a, b: wcs.sample_route('pl_nmpt', a, b, 1.0, 25),
    'linz': linz_dsm,
}
