"""Shared cohort and helpers for the /tools data families.

The tools use the same screened cohort as the final-kick story: the story cohort
(duplicate editions removed), without the start-offset editions (first-split
start delays) and without editions whose mat grid looks shifted. Every published
group has at least 100 finishes. Counts are finishes, not unique runners.
"""
import re
import unicodedata

import numpy as np

from insights_data import start_offset_screen, sustained_slowdown
from insights_kick import grid_screen
from insights_stats import MIN_CELL

MATS_KM = (5, 10, 15, 20, 25, 30, 35, 40)
MARATHON_KM = 42.195


def slugify(name):
    """Same rule as slugifyCity in lib/course-data.ts."""
    s = unicodedata.normalize('NFKD', name.lower())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', s))


def tool_cohort(cohort):
    """Return (screened Finishes, detected, onset_km, screens) for the tools."""
    keep_offset, offset_audit = start_offset_screen(cohort)
    s0 = cohort.subset(keep_offset)
    R0 = s0.paces / s0.baseline[:, None] - 1
    kick0 = s0.paces[:, 8] / s0.paces[:, 7] - 1
    keep_grid, grid_audit = grid_screen(s0, R0, kick0)
    s = s0.subset(keep_grid)
    detected, onset = sustained_slowdown(s)
    screens = dict(start_offset=offset_audit, grid=grid_audit,
                   note='Start-offset editions (first split inflated by start delays) and editions with a shifted mat grid are left out.')
    return s, detected, onset, screens


def group_index(keys):
    """Sort `keys`; yield (key, row indices) for every group with at least MIN_CELL rows."""
    order = np.argsort(keys, kind='stable')
    ks = keys[order]
    starts = np.r_[0, np.flatnonzero(np.diff(ks)) + 1]
    ends = np.r_[starts[1:], len(ks)]
    for a, b in zip(starts, ends):
        if b - a >= MIN_CELL:
            yield ks[a], order[a:b]


def q(values, probs):
    """Quantiles with numpy's default linear interpolation, rounded to whole seconds."""
    return [int(round(float(v))) for v in np.quantile(values, probs)]
