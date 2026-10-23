"""Merge variants.json into results.json and add the recommendation with its New York 5:15 segment paces."""
import json, pickle
import numpy as np
M = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/measure'
r = json.load(open(M + '/results.json')); v = json.load(open(M + '/variants.json'))
cells = pickle.load(open(M + '/cells.pkl', 'rb'))
LEN = np.array([5.0] * 8 + [2.195]); KM = 42.195
def mmss(s): s = int(round(s)); return f'{s // 60}:{s % 60:02d}'
seg = {}
for g in ('all', 'men', 'women'):
    sh = cells[('New York', g, 315)]['D2_A3_wide']['shape']; avg = 315 * 60 / KM
    seg[g] = dict(per_km=[mmss(x * avg) for x in sh], per_mile=[mmss(x * avg * 1.609344) for x in sh], n=cells[('New York', g, 315)]['D2_A3_wide']['n'])
r['variants'] = v
r['recommendation'] = dict(
    candidate='D2_A3_wide', rule='finishes on the course and recorded gender from G-10:00 to G+9:59 whose 20K-to-finish pace is within +/-3% of their 0-20K pace; '
    'per-segment median of segment pace / own average pace at the nine timing points; renormalised to end on the goal; shape only where >= 100 such finishes from >= 3 editions, else even pace',
    coverage=v['variants']['t3_G-10_G+10'], ny_315_segment_paces=seg,
    alternatives=dict(standard_window_A3=r['coverage']['A3']['share'], wider_G15=v['variants']['t3_G-15_G+15']['coverage'], adaptive_t3=v['variants']['adaptive_t3']['coverage']))
json.dump(r, open(M + '/results.json', 'w'), indent=1)
print(json.dumps(seg))
