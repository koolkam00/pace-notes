"""Convert cached OSM /map XML corridor downloads into compact highway-only JSON (gz) and delete the XML."""
import os, glob, json, gzip, sys, xml.etree.ElementTree as ET
D = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/osm_corridor'
KEEP = ('highway', 'bridge', 'tunnel', 'covered', 'layer', 'name', 'bridge:name', 'ref', 'wikipedia')
n = 0
for f in glob.glob(os.path.join(D, '*.xml')):
    out = f[:-4] + '.hw.json.gz'
    try:
        root = ET.parse(f).getroot()
        nodes = {nd.get('id'): (round(float(nd.get('lat')), 7), round(float(nd.get('lon')), 7)) for nd in root.iter('node')}
        ways = []
        for wy in root.iter('way'):
            tags = {t.get('k'): t.get('v') for t in wy.findall('tag')}
            if 'highway' not in tags: continue
            ways.append(dict(id=wy.get('id'), tags={k: tags[k] for k in KEEP if k in tags}, c=[nodes[r.get('ref')] for r in wy.findall('nd') if r.get('ref') in nodes]))
        with gzip.open(out, 'wt') as g: json.dump(ways, g)
        os.remove(f); n += 1
    except Exception as e:
        print('fail', f, e, file=sys.stderr)
print('converted', n)
