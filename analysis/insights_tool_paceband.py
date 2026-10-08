"""Pace band: what finishes that achieved a goal actually ran at each 5 km mat.

For a whole-minute goal G (2:30 to 6:30), the window holds finishes from G − 5:00 up to
G − 0:01, i.e. finishes that achieved the goal by up to five minutes. For each course
(and All courses) and recorded gender, three groups are published when they reach 100
finishes: all finishes in the window, those that held pace (no sustained slowdown) and
those with a sustained slowdown. Each group gives the 25th, 50th and 75th percentiles of
elapsed time at the nine timing points and of section pace (seconds per km).

Groups are selected by outcome; differences between them are descriptive, not a plan.
"""
import numpy as np

from insights_stats import MIN_CELL, r
from insights_tools_common import slugify, tool_cohort

GOALS = range(150, 391)
WINDOW_S = 300
GENDERS = (('all', None), ('men', 1), ('women', 2))
GROUPS = ('all', 'held', 'slowdown')
ONSETS = (20, 25, 30, 35)


def ints(values):
    return [int(round(float(v))) for v in values]


def stats(s, idx, group):
    """Elapsed-time percentiles at the nine timing points and section-pace percentiles (whole seconds per km).

    The 'all' group carries the elapsed interquartile range for the mat table; the held and slowdown groups carry
    the section-pace interquartile range for the comparison chart. Medians are always present."""
    e = np.quantile(s.times[idx], (.25, .5, .75), axis=0)
    p = np.quantile(s.paces[idx], (.25, .5, .75), axis=0)
    out = dict(n=int(len(idx)), ed=int(len(np.unique(s.edition[idx]))), e50=ints(e[1]), s50=ints(p[1]))
    if group == 'all':
        out.update(e25=ints(e[0]), e75=ints(e[2]))
    else:
        out.update(s25=ints(p[0]), s75=ints(p[2]))
    return out


def build(cohort):
    s, detected, onset, screens = tool_cohort(cohort)
    scopes = [('all', None, np.ones(s.n, bool))] + [(slugify(c), c, s.city == ci) for ci, c in enumerate(s.cities)]
    extra, index = {}, []
    for slug, city, sm in scopes:
        if sm.sum() < MIN_CELL:
            continue
        shard_genders = {}
        for gname, gcode in GENDERS:
            gm = sm if gcode is None else sm & (s.gender == gcode)
            members = np.flatnonzero(gm)
            members = members[np.argsort(s.finish[members], kind='stable')]
            sorted_finish = s.finish[members]
            rows = {g: [] for g in GROUPS}
            goals = []
            for G in GOALS:
                # finishes in [G − 5:00, G)
                lo, hi = np.searchsorted(sorted_finish, [G * 60 - WINDOW_S, G * 60], side='left')
                idx = np.sort(members[lo:hi])
                if len(idx) < MIN_CELL:
                    continue
                goals.append(G)
                d = detected[idx]
                for group, sel in (('all', idx), ('held', idx[~d]), ('slowdown', idx[d])):
                    if len(sel) >= MIN_CELL:
                        row = dict(g=G, **stats(s, sel, group))
                        if group == 'all':
                            row['sd'] = r(float(d.mean()), 4)
                            row['onset'] = [int((onset[idx] == km).sum()) for km in ONSETS]
                        rows[group].append(row)
            if not goals:
                continue
            payload = {group: {key: [row[key] for row in rr] for key in rr[0]} for group, rr in rows.items() if rr}
            extra[f'tools/pace-band/{slug}/{gname}.json'] = dict(scope=slug, city=city, gender=gname, window_s=WINDOW_S, groups=payload)
            shard_genders[gname] = dict(goals=[goals[0], goals[-1]], count=len(goals),
                                        held=len(rows['held']), slowdown=len(rows['slowdown']))
        if shard_genders:
            index.append(dict(slug=slug, city=city, finishes=int(sm.sum()), editions=int(len(np.unique(s.edition[sm]))), genders=shard_genders))
    return dict(
        extra_files=extra, cohort_n=int(s.n), editions=int(len(np.unique(s.edition))), window_s=WINDOW_S,
        goals=[GOALS[0], GOALS[-1]], onset_sections=list(ONSETS), scopes=index, screens=screens,
        method=('For a whole-minute goal G the window holds finishes from G − 5:00 to G − 0:01 on the chosen course and recorded gender. '
                'Held pace means no sustained slowdown; sustained slowdown is the published definition (a 5 km section after 20 km at least '
                '25% slower than the 5–20 km pace, contiguous sections totalling at least 5 km; doi:10.1371/journal.pone.0251513). Groups '
                'with fewer than 100 finishes are not published. Percentiles are observed variation among achieved finishes, not a plan.'),
    )
