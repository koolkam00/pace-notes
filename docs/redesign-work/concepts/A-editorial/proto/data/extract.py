"""Build the two small extracts the prototype reads, from the checked-in release files.

Run with: python3 -I extract.py /home/user/wt/insights/public/data
Writes fast-start-cities.json (every course, all ages and genders) and site-totals.json.
Nothing is computed beyond selecting rows; every number stays as the source file has it.
"""
import json
import sys
from pathlib import Path

src = Path(sys.argv[1])
here = Path(__file__).resolve().parent

fs = json.loads((src / 'fast-start/all-finishers.json').read_text())
rows = [r for r in fs['rows'] if r['age'] == 'all' and r['gender'] == 'all' and r['prior'] == 'all']
keep = ['band', 'n', 'editions', 'slowdown_n', 'onset', 'pace_pct', 'after20_delta_median_s', 'actual_finish_median_s']
fast_start = {
    'release_tag': fs['release_tag'],
    'bands': fs['bands'],
    'points_km': fs['points_km'],
    'onset_starts_km': fs['onset_starts_km'],
    'min_cell': fs['min_cell'],
    'rows': [{'city': r['city'], 'groups': [{k: g[k] for k in keep} for g in r['groups']]} for r in rows],
}
(here / 'fast-start-cities.json').write_text(json.dumps(fast_start, separators=(',', ':')))

af = json.loads((src / 'all-finisher-context/evidence.json').read_text())
all_row = next(r for r in af['rows'] if r['city'] == 'All courses' and r['age'] == 'all' and r['gender'] == 'all' and r['early_pace'] == 'all')
runners = json.loads((src / 'runners/manifest.json').read_text())
totals = {
    'release_tag': runners['release_tag'],
    'raw_records': runners['raw_records'],
    'eligible_records': runners['eligible_records'],
    'editions': len(runners['editions']),
    'cities': len({e['city'] for e in runners['editions']}),
    'first_year': min(e['year'] for e in runners['editions']),
    'last_year': max(e['year'] for e in runners['editions']),
    'downhill': [{k: d[k] for k in ('id', 'terrain', 'opening', 'n', 'edition_n', 'city_n', 'slowdown_pct')} for d in all_row['downhill']],
    'downhill_first5_net_below_m': af['downhill_first5_net_below_m'],
}
(here / 'site-totals.json').write_text(json.dumps(totals, separators=(',', ':')))
print('fast-start rows', len(fast_start['rows']), 'totals', {k: v for k, v in totals.items() if k != 'downhill'})
