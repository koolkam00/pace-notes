"""linked.json and tools/half-to-full.json (linked): the marathons that followed a half 3 to 16 weeks before (spec 2.4).

Every value is computed from set B (analysis/half_pairs.py), pairs of records linked by name whose halves include
unverified editions (pages carry the "Includes unverified half results" chip). Distributions pool pairs, as the
marathon's finish-time context pools finishes; the weighting companions sit in `checks` for /methodology only.

Windows: for each whole half minute H, the pairs whose half is in [60H − 150, 60H + 150) seconds ("near H"); the
window at a multiple of five minutes is the 5-minute band centred on that time. A group's published range is the
longest contiguous run of windows with at least 100 pairs, at least 3 marathon editions and at least 10 pairs in each
one-minute edge slice (the pairs a window gains or loses when it moves by a minute), clipped to 1:10–2:45.
Quantiles are linear ((n − 1)q, `insights_stats.quantile`).
"""
from __future__ import annotations

import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

from half_common import MIN_CELL, MIN_EDGE_SLICE, MIN_EDITIONS, fail, quantile, sec, sh  # noqa: E402
from half_pairs import WINDOW_DAYS  # noqa: E402
from insights_stats import r  # noqa: E402

Q = [round(0.05 * i, 2) for i in range(1, 20)]
WINDOW_S = 300
CLIP_MIN = (70, 165)                     # published windows: 1:10 to 2:45 at most
GOALS = (10800, 12600, 14400, 16200, 18000)
UNDER_PLUS_MIN = (0, 10, 20, 30, 40)
STRATA_MIN_PER_SEX = 20
EDITIONS_EQUAL = (20, 100)
CITY_EQUAL = {'min_pairs': 100, 'min_editions': 3}
OTHER_THAN = ('Valencia', 'Warsaw')      # "other marathons": without the two marathons that hold most pairs
CHECK_WINDOW = 105                       # the 1:45 window of the flagship's beat 1
CHECK_GOAL = 14400
GROUPS = ('all', 'F', 'M')


class Pairs:
    """Set B as arrays (half and marathon seconds, sex, marathon edition and city, sustained slowdown)."""

    def __init__(self, frame):
        self.frame = frame
        self.h = frame.h_finish_s.to_numpy(float)
        self.m = frame.m_finish_s.to_numpy(float)
        self.extra = self.m - 2 * self.h
        self.sex = frame.sex.to_numpy(object)
        self.ed = frame.m_ed.to_numpy(object)
        self.city = frame.m_city.to_numpy(object)
        self.sus = frame.m_sustained.to_numpy(bool)
        self.n = len(frame)

    def subset(self, mask):
        return Pairs(self.frame[np.asarray(mask, bool)])

    def group(self, g):
        return self if g == 'all' else self.subset(self.sex == g)


def in_window(p, H):
    return (p.h >= 60 * H - WINDOW_S / 2) & (p.h < 60 * H + WINDOW_S / 2)


def marks(values, q):
    """Up to three quarter-hours t with p05 < t <= p95, nearest the median (ties to the earlier), with the exact share
    of the window's marathons under t."""
    med, p05, p95 = q[9], q[0], q[-1]
    first = int(np.floor(p05 / 900)) * 900
    cands = [t for t in range(max(first, 900), int(p95) + 900, 900) if p05 < t <= p95]
    cands.sort(key=lambda t: (abs(t - med), t))
    return [[t, sh((values < t).mean())] for t in sorted(cands[:3])]


def window(p, H):
    w = p.subset(in_window(p, H))
    if not w.n:
        return None
    q = [quantile(w.m, x) for x in Q]
    lead = ((p.h >= 60 * H - 150) & (p.h < 60 * H - 90)).sum()
    trail = ((p.h >= 60 * H + 90) & (p.h < 60 * H + 150)).sum()
    return {'h': 60 * H, 'n': int(w.n), 'e': int(len(set(w.ed))), 'q': [sec(v) for v in q], 'sus': sh(w.sus.mean()),
            'extra_p50': sec(quantile(w.extra, 0.5)), 'under_double': sh((w.extra < 0).mean()), 'edge_min': int(min(lead, trail)),
            'marks': marks(w.m, q), '_q': q}


def published(windows):
    """The longest contiguous run of passing windows inside the clip (ties: the earlier run)."""
    ok = [H for H in range(CLIP_MIN[0], CLIP_MIN[1] + 1)
          if windows.get(H) and windows[H]['n'] >= MIN_CELL and windows[H]['e'] >= MIN_EDITIONS and windows[H]['edge_min'] >= MIN_EDGE_SLICE]
    best, run = [], []
    for H in ok:
        run = run + [H] if run and H == run[-1] + 1 else [H]
        if len(run) > len(best):
            best = list(run)
    if not best:
        fail('linked: no window passes the floors')
    return best[0], best[-1]


def goal_row(rows, G, full):
    """The slowest published window whose median is under G, when the crossing is clean (the window a minute slower
    has a median at or over G, the one a minute quicker under it); else None."""
    under = [i for i, w in enumerate(rows) if w['_q'][9] < G]
    if not under:
        return None
    i = max(under)
    if i == len(rows) - 1 or i == 0:
        return None
    if not (rows[i + 1]['_q'][9] >= G and rows[i - 1]['_q'][9] < G):
        fail(f'linked: the crossing of the {G}-second goal at window {rows[i]["h"]} is not clean')
    w = rows[i]
    out = {'h': w['h'], 'n': w['n'], 'e': w['e']}
    if full:
        out.update({'q50': w['q'][9], 'p10': w['q'][1], 'p90': w['q'][17]})
    return out


def sexes(p):
    """Recorded women's against men's sustained slowdowns within half band × marathon city strata."""
    band = np.floor((p.h + 150) / 300).astype(int)
    rows = []
    for key in sorted(set(zip(band.tolist(), p.city.tolist()))):
        s = (band == key[0]) & (p.city == key[1])
        f, m = s & (p.sex == 'F'), s & (p.sex == 'M')
        if f.sum() >= STRATA_MIN_PER_SEX and m.sum() >= STRATA_MIN_PER_SEX:
            rows.append((int(s.sum()), p.sus[f].mean(), p.sus[m].mean()))
    if not rows:
        fail('linked: no sex strata')
    n = np.array([x[0] for x in rows], float)
    wf = np.array([x[1] for x in rows])
    wm = np.array([x[2] for x in rows])
    women, men = (wf * n).sum() / n.sum(), (wm * n).sum() / n.sum()
    return {'strata': len(rows), 'women_lower': int((wf < wm).sum()), 'women_std': sh(women), 'men_std': sh(men),
            'diff_points': sh(100 * (men - women))}


def latest_per_person(p):
    f = p.frame.sort_values(['person_id', 'm_date', 'm_record_id'])
    return Pairs(f.groupby('person_id', sort=False).tail(1))


def under_goal_at(p, H=CHECK_WINDOW, G=CHECK_GOAL):
    w = p.m[in_window(p, H)]
    if len(w) < MIN_CELL:
        fail(f'linked: a check window holds {len(w)} pairs')
    return sh((w < G).mean())


def battery(p):
    """The flagship's weighting checks: pooled medians for pair members; medians over editions or cities otherwise."""
    mult = p.m / p.h
    members = []

    def pairs_member(id_, q):
        mq = q.m / q.h
        members.append({'id': id_, 'n': int(q.n), 'multiple_p50': r(quantile(mq, 0.5), 4), 'extra_p50_s': sec(quantile(q.extra, 0.5)),
                        'under_double': sh((q.extra < 0).mean())})

    pairs_member('pooled', p)
    pairs_member('verified_halves', p.subset(p.frame.verified.to_numpy(bool)))
    pairs_member('other_marathons', p.subset(~np.isin(p.city, OTHER_THAN)))
    pairs_member('ns_keys_1', p.subset(p.frame.ns_keys.to_numpy() == 1))
    pairs_member('one_per_person', latest_per_person(p))

    def groups_member(id_, keys, k, min_editions=None):
        rows = []
        for key in sorted(set(keys.tolist())):
            s = keys == key
            if s.sum() < k or (min_editions and len(set(p.ed[s])) < min_editions):
                continue
            rows.append((quantile(mult[s], 0.5), quantile(p.extra[s], 0.5), (p.extra[s] < 0).mean()))
        a = np.array(rows)
        members.append({'id': id_, 'n': len(rows), 'multiple_p50': r(np.median(a[:, 0]), 4), 'extra_p50_s': sec(np.median(a[:, 1])),
                        'under_double': sh(np.median(a[:, 2]))})

    for k in EDITIONS_EQUAL:
        groups_member(f'editions_equal_{k}', p.ed, k)
    groups_member('city_equal', p.city, CITY_EQUAL['min_pairs'], CITY_EQUAL['min_editions'])
    return {'pooled_half_p50_s': sec(quantile(p.h, 0.5)), 'members': members}


def checks(p):
    ver = p.subset(p.frame.verified.to_numpy(bool))
    eds = {}
    for key in sorted(set(p.ed.tolist())):
        s = p.ed == key
        if s.sum() >= EDITIONS_EQUAL[0]:
            eds[key] = (quantile(p.extra[s], 0.5), (p.extra[s] < 0).mean())
    w = p.subset(in_window(p, CHECK_WINDOW))
    w_eds = [(w.m[w.ed == key] < CHECK_GOAL).mean() for key in sorted(set(w.ed.tolist())) if (w.ed == key).sum() >= EDITIONS_EQUAL[0]]
    other = p.subset(~np.isin(p.city, OTHER_THAN))
    ns1 = p.subset(p.frame.ns_keys.to_numpy() == 1)
    one = latest_per_person(p)
    no_merge = p.subset(~p.frame.in_candidate_merge.to_numpy(bool))
    vs = sexes(ver)
    return {
        'verified': {'pairs': int(ver.n), 'extra_p50_s': sec(quantile(ver.extra, 0.5)), 'under_double': sh((ver.extra < 0).mean()),
                     'w105_under_14400': under_goal_at(ver), 'sexes': {k: vs[k] for k in ('strata', 'women_lower', 'diff_points')}},
        'editions_equal': {'min_pairs': EDITIONS_EQUAL[0], 'editions': len(eds),
                           'extra_p50_s': sec(np.median([v[0] for v in eds.values()])),
                           'under_double': sh(np.median([v[1] for v in eds.values()])),
                           'w105_under_14400': sh(np.median(w_eds))},
        'other_marathons': {'pairs': int(other.n), 'extra_p50_s': sec(quantile(other.extra, 0.5)), 'w105_under_14400': under_goal_at(other)},
        'ns_keys_1': {'pairs': int(ns1.n), 'w105_under_14400': under_goal_at(ns1)},
        'one_per_person': {'pairs': int(one.n), 'w105_under_14400': under_goal_at(one)},
        'no_merge_people': {'pairs': int(no_merge.n), 'extra_p50_s': sec(quantile(no_merge.extra, 0.5))},
        'battery': battery(p),
    }


def flagship_guard(linked: dict) -> bool:
    """The flagship H1's guard (spec 3.2), the rule lib/nuggets/half.ts applies to `half.extra`: enough pairs and
    marathon editions; the pooled minutes over double between 10 and 60; every battery member's multiple within
    [2.15, 2.25] and, re-expressed at the pooled median half, within 3 minutes of the pooled minutes; the verified-halves
    and one-pair-per-person minutes within 3 minutes of the pooled; every member's under-double share under 15%."""
    battery = linked['checks']['battery']
    members = {m['id']: m for m in battery['members']}
    pooled = members['pooled']
    extra, half = pooled['extra_p50_s'], battery['pooled_half_p50_s']
    return (linked['set']['pairs'] >= MIN_CELL and linked['set']['marathon_editions'] >= MIN_EDITIONS and 600 <= extra <= 3600
            and all(2.15 <= m['multiple_p50'] <= 2.25 for m in members.values())
            and all(abs((m['multiple_p50'] - 2) * half - extra) <= 180 for m in members.values())
            and abs(extra - members['verified_halves']['extra_p50_s']) <= 180
            and abs(extra - members['one_per_person']['extra_p50_s']) <= 180
            and all(m['under_double'] < 0.15 for m in members.values()))


def build(frame):
    """(linked.json, tools/half-to-full.json, the published ranges)."""
    p = Pairs(frame)
    if p.n < MIN_CELL:
        fail('linked: set B is under the floor')
    windows, ranges = {}, {}
    for g in GROUPS:
        q = p.group(g)
        ws = {H: window(q, H) for H in range(CLIP_MIN[0] - 5, CLIP_MIN[1] + 6)}
        lo, hi = published(ws)
        ranges[g] = (lo, hi)
        windows[g] = [ws[H] for H in range(lo, hi + 1)]
    goals = []
    for G in GOALS:
        row = goal_row(windows['all'], G, full=True)
        if row is None:
            fail(f'linked: no clean all-pairs window for the {G}-second goal')
        goals.append({'goal_s': G, 'all': row, 'F': goal_row(windows['F'], G, full=False), 'M': goal_row(windows['M'], G, full=False)})
    clean = lambda w: {k: v for k, v in w.items() if not k.startswith('_')}
    linked = {
        'schema_version': 1, 'family': 'half-linked', 'scope': 'linked',
        'set': {'pairs': int(p.n), 'people': int(frame.person_id.nunique()), 'marathon_editions': int(len(set(p.ed))),
                'marathon_cities': int(len(set(p.city))), 'half_editions': int(frame.h_edition_id.nunique()),
                'women_pairs': int((p.sex == 'F').sum()), 'men_pairs': int((p.sex == 'M').sum()),
                'verified_half_share': sh(frame.verified.mean()), 'window_days': list(WINDOW_DAYS)},
        'overall': {'extra_s': {f'p{int(x * 100)}': sec(quantile(p.extra, x)) for x in (0.1, 0.25, 0.5, 0.75, 0.9)},
                    'ratio_p50': r(quantile(p.m / p.h, 0.5), 4),
                    'under_double_plus_min': {str(k): sh((p.extra < 60 * k).mean()) for k in UNDER_PLUS_MIN},
                    'sustained': sh(p.sus.mean())},
        'Q': Q,
        'windows': {g: [clean(w) for w in windows[g]] for g in GROUPS},
        'sexes': {'rule': 'half band x marathon city, >=20 pairs per sex', **sexes(p)},
        'goals': goals,
        'checks': checks(p),
    }
    tool = {
        'schema_version': 1, 'family': 'half-tool', 'scope': 'linked', 'Q': Q, 'window_s': WINDOW_S,
        'groups': {g: {'from': 60 * ranges[g][0], 'to': 60 * ranges[g][1],
                       'w': [[w['n'], w['e'], w['sus'], w['q'], w['marks']] for w in windows[g]]} for g in GROUPS},
    }
    return linked, tool, ranges
