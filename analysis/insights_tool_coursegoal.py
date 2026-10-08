"""Course chooser: for a goal pace, how finishes that ran that pace through 20 km held up on each course.

For goal G (2:30 to 6:30 in 5-minute steps) the even goal pace is g = G / 42.195. On each
course, finishes whose 5–20 km pace is within ±2% of g form the cohort. An edition counts when
it has at least 20 such finishes; a course row is published with at least 3 editions and 100
finishes. Rows report the pooled share finishing under G, the edition-balanced sustained-slowdown
share and the edition-balanced median time after 20 km beyond the 5–20 km pace, plus pooled finish
percentiles. Context per course (race months, start temperatures, supplied route gain/loss/net) is
descriptive only. This is not a difficulty ranking and no course is called fastest.
"""
import numpy as np

from insights_courses import edition_context
from insights_stats import MIN_CELL, r
from insights_tools_common import MARATHON_KM, slugify, tool_cohort

GOALS = range(150, 391, 5)
TOLERANCE = 0.02
MIN_EDITION = 20
MIN_EDITIONS = 3
DOWNHILL_OPENING_M = -25


def rounded(value):
    return None if value is None else r(float(value), 1)


def build(cohort):
    s, detected, onset, screens = tool_cohort(cohort)
    context = edition_context(s.editions)
    after20 = (s.finish - s.times[:, 3]) - (MARATHON_KM - 20) * s.baseline
    rows, unavailable, courses = [], [], []
    for ci, city in enumerate(s.cities):
        cm = s.city == ci
        if not cm.any():
            continue
        eds = np.unique(s.edition[cm])
        temps, months = [], set()
        terrain = None
        for e in eds:
            ctx = context[e]
            w = ctx['weather']
            if w and w.get('temp_c') is not None and w['weather_race'].strip().casefold() == s.editions[e].get('race', '').strip().casefold():
                temps.append(w['temp_c'])
                if w.get('date'):
                    months.add(int(w['date'][5:7]))
            if terrain is None and ctx.get('terrain'):
                terrain = ctx['terrain']
        first = (terrain or {}).get('sections') or []
        courses.append(dict(
            slug=slugify(city), city=city, editions=int(len(eds)), finishes=int(cm.sum()), months=sorted(months),
            start_temp_c=[r(min(temps), 1), r(max(temps), 1)] if temps else None, weather_editions=len(temps),
            gain_m=rounded((terrain or {}).get('gain_m')), loss_m=rounded((terrain or {}).get('loss_m')), net_m=rounded((terrain or {}).get('net_m')),
            downhill_opening=bool(first and first[0].get('net_m') is not None and first[0]['net_m'] < DOWNHILL_OPENING_M),
            terrain_note='Supplied current route profile; historical routes may differ.' if terrain else None))
        for G in GOALS:
            g = G * 60 / MARATHON_KM
            sel = np.flatnonzero(cm & (np.abs(s.baseline / g - 1) <= TOLERANCE))
            parts = []
            for e in np.unique(s.edition[sel]):
                p = sel[s.edition[sel] == e]
                if len(p) >= MIN_EDITION:
                    parts.append(p)
            n = int(sum(len(p) for p in parts))
            if len(parts) < MIN_EDITIONS or n < MIN_CELL:
                unavailable.append(dict(goal=G, city=city, reason=f'{len(parts)} editions with at least {MIN_EDITION} finishes at this pace; {n} finishes'))
                continue
            pooled = np.concatenate(parts)
            rows.append(dict(
                goal=G, city=city, n=n, ed=len(parts),
                under=r(float((s.finish[pooled] < G * 60).mean()), 4),
                sd=r(float(np.mean([detected[p].mean() for p in parts])), 4),
                after20=int(round(float(np.mean([np.median(after20[p]) for p in parts])))),
                fin=[int(round(v)) for v in np.quantile(s.finish[pooled], (.1, .5, .9))]))
    return dict(
        cohort_n=int(s.n), goals=[GOALS[0], GOALS[-1]], goal_step_min=5, tolerance=TOLERANCE,
        min_edition_finishes=MIN_EDITION, min_editions=MIN_EDITIONS, rows=rows, unavailable=unavailable, courses=courses, screens=screens,
        method=('Finishes whose 5–20 km pace is within ±2% of the goal\'s even pace, on each course. An edition counts with at least 20 such '
                'finishes; a course needs 3 editions and 100 finishes. "Under goal" is the pooled share finishing under the goal; the '
                'sustained-slowdown share and the median time after 20 km beyond the 5–20 km pace are averaged with equal weight per edition. '
                'Courses differ in field, qualifying rules, weather, era and route; edition balancing does not remove this.'),
    )
