"""Reproduce the pace band's tool cohort (start-offset + grid screens) and save the arrays the measurement needs."""
import sys, json
import numpy as np
sys.path.insert(0, '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/charts')
from chartlab import L
from insights_tools_common import tool_cohort
s, detected, onset, screens = tool_cohort(L.f)
M = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/measure'
eds = L.editions
np.savez(M + '/cohort_tool.npz', times=s.times.astype(np.int32), finish=s.finish.astype(np.int32), edition=s.edition.astype(np.int16),
         city=s.city.astype(np.int16), gender=s.gender.astype(np.int8), slow=detected, onset=onset.astype(np.int8),
         ed_year=np.array([e['year'] for e in eds]), cities=np.array(s.cities))
print(s.n, len(s.cities), s.times.shape, screens['note'])
# check NY 5:15 all
ci = list(s.cities).index('New York')
m = (s.city == ci) & (s.finish >= 315*60-300) & (s.finish < 315*60)
print(m.sum(), np.quantile(s.times[m], .5, axis=0).round())
