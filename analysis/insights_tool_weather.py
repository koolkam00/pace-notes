"""Weather match: past editions with a similar start temperature, and how finishes at a given 5–20 km pace held up.

Weather is the supplied modelled hour at each edition's scheduled start (runner-context shards),
never personal exposure. An edition matches a window (centre c, half-width w) when its start
temperature is within c ± w and it has at least 20 finishes in the 5–20 km pace band. A row is
published when at least 3 editions and 100 finishes match. Rates are edition-balanced (each
edition is one weather observation); finish percentiles are pooled and only describe the field.
Nothing here is a heat adjustment or a forecast.
"""
import numpy as np

from insights_courses import edition_context
from insights_stats import MIN_CELL, r
from insights_tools_common import MARATHON_KM, tool_cohort

CENTRES = range(-2, 29)
HALF_WIDTHS = (2, 3)
PACE_STEP = 15
PACE_LO, PACE_HI = 180, 675
MIN_EDITION = 20
MIN_EDITIONS = 3


def build(cohort):
    s, detected, onset, screens = tool_cohort(cohort)
    context = edition_context(s.editions)
    baseline = s.baseline
    after20 = (s.finish - s.times[:, 3]) - (MARATHON_KM - 20) * baseline
    late = ((s.finish - s.times[:, 5]) / (MARATHON_KM - 30)) / baseline - 1
    R = s.paces / baseline[:, None] - 1
    band = np.floor((baseline - PACE_LO) / PACE_STEP).astype(np.int64)
    nb = (PACE_HI - PACE_LO) // PACE_STEP
    order = np.argsort(s.edition, kind='stable')
    uniq, starts = np.unique(s.edition[order], return_index=True)
    ends = np.r_[starts[1:], len(order)]
    editions, excluded, per = [], [], {}
    for e, a, b in zip(uniq, starts, ends):
        idx = order[a:b]
        ed = s.editions[e]
        w = context[e]['weather']
        if w is None or w.get('temp_c') is None:
            excluded.append(dict(city=ed['city'], year=ed['year'], reason='No valid weather row'))
            continue
        if w['weather_race'].strip().casefold() != ed.get('race', '').strip().casefold():
            excluded.append(dict(city=ed['city'], year=ed['year'], reason='Weather race name differs'))
            continue
        row = dict(id=len(editions), city=ed['city'], year=int(ed['year']), date=w.get('date'), start=w.get('scheduled_start'),
                   temp_c=r(w['temp_c'], 1), dew_c=r(w['dewpoint_c'], 1) if w.get('dewpoint_c') is not None else None,
                   wind_mps=r(w['wind_mps'], 1) if w.get('wind_mps') is not None else None,
                   warming_c=r(w['warming_c'], 1) if w.get('warming_c') is not None else None, finishes=int(len(idx)))
        editions.append(row)
        # per pace band summary for this edition (only bands with MIN_EDITION finishes count toward a match)
        bands = {}
        for k in range(nb):
            sel = idx[band[idx] == k]
            if len(sel) >= MIN_EDITION:
                bands[k] = sel
        per[row['id']] = (w['temp_c'], bands)
    rows = []
    for c in CENTRES:
        for hw in HALF_WIDTHS:
            matched = [i for i, (t, _) in per.items() if abs(t - c) <= hw + 1e-9]
            for k in range(nb):
                eds = [i for i in matched if k in per[i][1]]
                if len(eds) < MIN_EDITIONS:
                    continue
                parts = [per[i][1][k] for i in eds]
                pooled = np.concatenate(parts)
                if len(pooled) < MIN_CELL:
                    continue
                rows.append(dict(
                    c=c, hw=hw, pace=PACE_LO + k * PACE_STEP, n=int(len(pooled)), ed=eds,
                    sd=r(float(np.mean([detected[p].mean() for p in parts])), 4),
                    after20=int(round(float(np.mean([np.median(after20[p]) for p in parts])))),
                    late=r(float(np.mean([np.median(late[p]) for p in parts])), 4),
                    fin=[int(round(v)) for v in np.quantile(s.finish[pooled], (.1, .5, .9))],
                    profile=[r(float(v), 4) for v in np.mean([np.median(R[p], axis=0) for p in parts], axis=0)]))
    return dict(
        cohort_n=int(s.n), editions=editions, excluded=excluded, rows=rows,
        centres_c=[CENTRES[0], CENTRES[-1]], half_widths_c=list(HALF_WIDTHS), pace_step_s=PACE_STEP, pace_range_s=[PACE_LO, PACE_HI],
        min_edition_finishes=MIN_EDITION, min_editions=MIN_EDITIONS, screens=screens,
        method=('Each edition contributes its supplied start-hour temperature (modelled, one city point, scheduled start; not personal '
                'exposure). For a window centred on the visitor\'s temperature, editions within the window that have at least 20 finishes '
                'in the 5–20 km pace band are matched; a row needs at least 3 editions and 100 finishes. Sustained-slowdown share, the median '
                'time after 20 km beyond the 5–20 km pace (after20, seconds) and the median 30 km-to-finish pace change (late) are averaged '
                'with equal weight per edition. Finish percentiles are pooled. These are descriptive comparisons of different races, '
                'courses, fields and years, not heat adjustments.'),
    )
