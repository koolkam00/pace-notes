"""Sample each course route every STEP km and reverse-geocode with Nominatim (1 req/s)
to find OSM ways tagged bridge/tunnel/covered/layer. Cached in osm/nominatim.jsonl."""
import json, sys, time, math, urllib.request, urllib.parse, os
import pandas as pd
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'osm', 'nominatim.jsonl')
STEP = float(sys.argv[1]) if len(sys.argv) > 1 else 0.3
order = sys.argv[2].split(',') if len(sys.argv) > 2 else None
df = pd.read_parquet('/home/user/data/1050-full/course_profiles.parquet')
done = set()
if os.path.exists(OUT):
    for line in open(OUT):
        r = json.loads(line)
        if not r.get('error'): done.add((r['city'], r['d_km']))
cities = list(df.city)
if order: cities = order + [c for c in cities if c not in order]
def interp(pts, d):
    for a, b in zip(pts, pts[1:]):
        if a['d_km'] <= d <= b['d_km']:
            f = 0 if b['d_km'] == a['d_km'] else (d - a['d_km']) / (b['d_km'] - a['d_km'])
            return a['lat'] + f * (b['lat'] - a['lat']), a['lon'] + f * (b['lon'] - a['lon'])
    return pts[-1]['lat'], pts[-1]['lon']
with open(OUT, 'a') as fh:
    for city in cities:
        pts = json.loads(df[df.city == city].iloc[0].points_json)
        n = int(pts[-1]['d_km'] / STEP)
        for i in range(n + 1):
            d = round(i * STEP, 3)
            if (city, d) in done: continue
            lat, lon = interp(pts, d)
            q = urllib.parse.urlencode(dict(lat=f'{lat:.6f}', lon=f'{lon:.6f}', format='jsonv2', zoom=17, extratags=1))
            req = urllib.request.Request('https://nominatim.openstreetmap.org/reverse?' + q, headers={'User-Agent': 'pace-notes-course-audit/1.0 (research; low volume)'})
            t0 = time.time()
            j = None
            for attempt in range(6):
                try:
                    j = json.load(urllib.request.urlopen(req, timeout=30)); break
                except Exception as e:
                    j = {'error': str(e)}; time.sleep(20 * (attempt + 1))
            rec = dict(city=city, d_km=d, lat=round(lat, 6), lon=round(lon, 6), name=j.get('name'), osm=f"{j.get('osm_type')}/{j.get('osm_id')}",
                       type=j.get('type'), category=j.get('category'), tags=j.get('extratags') or {}, error=j.get('error'))
            fh.write(json.dumps(rec) + '\n'); fh.flush()
            time.sleep(1.6)
        print('done', city, flush=True)
