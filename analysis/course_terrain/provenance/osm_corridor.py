"""Download OSM map data along each route corridor (OSM API 0.6 /map, small bboxes, cached) and list
highway ways tagged bridge/tunnel/covered that the route runs along. Output: osm/structures.json"""
import sys, os, json, math, time, urllib.request, concurrent.futures as cf
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import xml.etree.ElementTree as ET
from route import profiles, project, densify
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dl', 'osm_corridor'); os.makedirs(D, exist_ok=True)
OUT = os.environ.get('CORRIDOR_OUT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'osm', 'structures.json')
def boxes(pts, span_lat=0.0035, span_lon=0.005, pad=0.0007):
    out = []; i = 0
    while i < len(pts):
        la0 = la1 = pts[i]['lat']; lo0 = lo1 = pts[i]['lon']; j = i + 1
        while j < len(pts):
            a, b = pts[j]['lat'], pts[j]['lon']
            if max(la1, a) - min(la0, a) > span_lat or max(lo1, b) - min(lo0, b) > span_lon: break
            la0, la1, lo0, lo1 = min(la0, a), max(la1, a), min(lo0, b), max(lo1, b); j += 1
        out.append((round(la0 - pad, 5), round(lo0 - pad, 5), round(la1 + pad, 5), round(lo1 + pad, 5)))
        i = max(j - 1, i + 1) if j < len(pts) else j
    return out
def fetch(b):
    s, w, n, e = b
    p = os.path.join(D, f'{s}_{w}_{n}_{e}.xml')
    if os.path.exists(p) and os.path.getsize(p) > 0: return p
    for k in range(5):
        try:
            req = urllib.request.Request(f'https://api.openstreetmap.org/api/0.6/map?bbox={w},{s},{e},{n}', headers={'User-Agent': 'pace-notes-course-audit/1.0 (one-off research)'})
            data = urllib.request.urlopen(req, timeout=120).read(); open(p, 'wb').write(data); return p
        except Exception as ex:
            err = str(ex); time.sleep(5 * (k + 1))
    open(p + '.err', 'w').write(err); return None
def main(cities):
    df = profiles(); result = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for city in cities:
        pts = json.loads(df.query('city == @city').iloc[0].points_json)
        bx = boxes(pts)
        with cf.ThreadPoolExecutor(3) as ex: files = list(ex.map(fetch, bx))
        ways = {}
        for f in files:
            if not f: continue
            try: root = ET.parse(f).getroot()
            except Exception: continue
            nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
            for wy in root.iter('way'):
                tags = {t.get('k'): t.get('v') for t in wy.findall('tag')}
                if 'highway' not in tags: continue
                if not (tags.get('bridge', 'no') != 'no' or tags.get('tunnel', 'no') != 'no' or tags.get('covered', 'no') != 'no' or tags.get('layer', '0') not in ('0',)): continue
                coords = [nodes[r.get('ref')] for r in wy.findall('nd') if r.get('ref') in nodes]
                if len(coords) >= 2: ways[wy.get('id')] = (tags, coords)
        found = []
        for wid, (tags, coords) in ways.items():
            dens = densify(coords, 8); proj = []
            for a, b in dens:
                pr = project(pts, a, b, 12); proj.append(pr)
            hit = [p for p in proj if p]
            if len(hit) < 3 or len(hit) / len(proj) < 0.5: continue
            # a way may be passed more than once (loops): cluster projections by distance
            ds = sorted(d for p in hit for d, _ in p)
            groups = [[ds[0]]]
            for d in ds[1:]:
                if d - groups[-1][-1] > 0.15: groups.append([d])
                else: groups[-1].append(d)
            for g in groups:
                if g[-1] - g[0] < 0.03: continue
                found.append(dict(way=wid, name=tags.get('name') or tags.get('bridge:name') or tags.get('ref'), highway=tags.get('highway'),
                                  bridge=tags.get('bridge'), tunnel=tags.get('tunnel'), covered=tags.get('covered'), layer=tags.get('layer'),
                                  bridge_name=tags.get('bridge:name'), wikipedia=tags.get('wikipedia') or tags.get('wikidata'),
                                  d_from=round(g[0], 3), d_to=round(g[-1], 3)))
        result[city] = dict(boxes=len(bx), failed=sum(f is None for f in files), ways=sorted(found, key=lambda x: x['d_from']))
        json.dump(result, open(OUT, 'w'), indent=1)
        print('done', city, len(bx), len(found), flush=True)
if __name__ == '__main__':
    cs = sys.argv[1].split(',') if len(sys.argv) > 1 else list(profiles().city)
    main(cs)
