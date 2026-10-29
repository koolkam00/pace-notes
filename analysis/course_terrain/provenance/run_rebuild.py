"""Rebuild one course profile: python run_rebuild.py CITY GROUND [SURFACE|-] [json opts]. Writes osm/rebuild_<city>.json"""
import sys, os, json
R = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(R, 'lib'))
from rebuild import rebuild2, structures
import samplers
def scan_for(city):
    for f in ('structures.json', 'structures_b.json'):
        p = os.path.join(R, 'osm', f)
        if os.path.exists(p):
            j = json.load(open(p))
            if city in j: return j[city]['ways']
    raise KeyError(city)
if __name__ == '__main__':
    city, gname = sys.argv[1], sys.argv[2]
    sname = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else None
    opt = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
    st = structures(scan_for(city))
    st = [s for s in st if not any(x in ' '.join(s['names']) for x in opt.get('drop', []))]
    st = [s for s in st if not any(a <= s['d_from'] <= b for a, b in opt.get('drop_ranges', []))]
    for s in st:
        if any(x in ' '.join(s['names']) for x in opt.get('force_straight', [])) or opt.get('all_straight'): s['force_straight'] = True
    g = samplers.otd(opt['otd'], city) if gname == 'otd' else samplers.GROUND[gname]
    srf = samplers.SURFACE[sname] if sname else None
    r = rebuild2(city, g, st, srf, base=opt.get('base', 'ground'), smooth_k=opt.get('smooth_k', 5), snap_roads=opt.get('snap', True))
    r.update(city=city, ground=gname if gname != 'otd' else 'opentopodata:' + opt['otd'], surface=sname)
    json.dump(r, open(os.path.join(R, 'osm', f'rebuild_{city.replace(" ", "_")}.json'), 'w'))
    s = {k: v for k, v in r.items() if k not in ('anchors',)}
    print(json.dumps(s)[:5000])
