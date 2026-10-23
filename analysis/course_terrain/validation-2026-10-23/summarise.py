"""Collect the validation into results.json with the per-course verdicts."""
import json
V = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/validate'
c = json.load(open(V + '/comparison.json')); a = json.load(open(V + '/asymmetry.json')); ny = json.load(open(V + '/ny_515.json')); s = json.load(open(V + '/ny_sensitivity.json'))
verdict = {
 'New York': ('publish', 'terrain corr -0.51 raw -> 0.79 corrected; bridge and First Avenue reproduced'),
 'Boston': ('publish, forewarn the downhill start', 'terrain corr 0.97, slope 1.04; steady finishers did not take the 0-5 km descent (model 0.973 vs 0.993)'),
 'Madrid': ('publish', 'terrain corr 0.88; model 1.14 pp vs even 1.60 pp from the steady shape'),
 'Valencia': ('publish', 'terrain corr 0.84, small effect (5-40 range 1.6 pp)'),
 'Austin': ('publish with caution', 'terrain corr 0.93 but model over-reacts (slope 0.67); 3 editions, small groups'),
 'London': ('publish (near even)', 'terrain small (1.0 pp range); corr 0.25'),
 'Amsterdam': ('publish (equals even pace)', 'range 0.2 pp'), 'Eindhoven': ('publish (equals even pace)', 'range 0.3 pp'),
 'Rotterdam': ('publish (equals even pace)', 'range 0.7 pp'), 'Chicago': ('publish (equals even pace)', 'range 0.2 pp'),
 'Warsaw': ('hold: even pace', 'model worse than no terrain (terrain RMSE 0.62 vs 0.34 pp; 9-segment MAD 1.39 vs even 0.95); route vintage or start alignment suspected'),
 'Oslo': ('hold until 39-42 km is checked', 'terrain corr 0.81 for 5-40 km but last 2.2 km misses by 4.0 pp (model plans a descent the steady finishers did not show)'),
 'Auckland': ('publishable on the profile audit only', 'no steady shape (2 editions): no observed check'),
 'Barcelona': ('publishable on the profile audit only', 'no steady shape (2 editions); straight decks assumed'),
 'Paris': ('publishable on the profile audit only', 'no steady shape (2 editions); quay tunnels assumed used'),
 'Sydney': ('even pace (class c confirmed)', 'model contradicts the steady shape: terrain corr -0.34, 10-15 km model 1.036 vs 0.986'),
 'Berlin': ('even pace (class c)', 'raw model agrees in direction (0.75) but amplitude 1.1 pp'),
 'Frankfurt': ('even pace (class c)', 'raw model 0.70, amplitude 1.4 pp'),
 'Stockholm': ('even pace (class c)', 'corr 0.49; Vasterbron unresolved'),
 'Hamburg': ('even pace (class c)', 'corr 0.33; Wallringtunnel unresolved'), 'Gold Coast': ('even pace (class c)', 'corr 0.40'),
 'Copenhagen': ('even pace (class c)', 'corr 0.10, flat'), 'Dubai': ('even pace (class c)', 'corr 0.06, flat'),
 'Helsinki': ('even pace (class c)', 'corr 0.55; 0-5 km steady 1.061 (start crowding)'), 'Singapore': ('even pace (class c)', 'no steady shape'),
 'Washington': ('even pace (class c)', 'profile is not the timed course'),
}
out = dict(
  pooled=c['pooled'], calibration=c['calibration'], asymmetry=a, grade_scale_scan=c['grade_scale_scan'],
  common_pattern_obs_minus_model_pp=c['common_pattern_obs_minus_model'], features=c['features'],
  per_course={k: dict(verdict=v[0], why=v[1], raw=c['per_course'].get(k, {}).get('raw'), corrected=c['per_course'].get(k, {}).get('corrected')) for k, v in verdict.items()},
  not_in_pace_band=['Athens', 'Cologne', 'Honolulu', 'Mexico City', 'Prague', 'Tokyo', 'Vienna'],
  calibration_verdict='not justified: the global slope (0.67, 90% CI 0.58-0.79) varies by course (Boston 1.04, New York 0.78, Madrid/Valencia/Oslo 0.58-0.60) and goal (0.64 at 3:00-3:45 to 0.81 at 5:00-6:00), the best global scale lowers mean terrain error only from 0.50 to 0.42 pp, and fitting it to outcome-selected Pace Notes data would mix badges',
  ny_515=ny, ny_sensitivity=s, examples=c['examples'])
json.dump(out, open(V + '/results.json', 'w'), indent=1)
print('ok')
