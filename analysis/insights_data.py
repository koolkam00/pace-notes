"""Verified eligible-finish arrays for the Pace Notes story analyses.

Reads the checked-in public runner shards (the same audited source as the
fast-start and all-finisher builders), verifies every shard, and returns
column arrays. No raw names leave this module and nothing is imputed.

An additional analysis-specific screen removes editions whose records
duplicate another edition (see DUPLICATE_EDITIONS). It does not change the
reviewed source-quality policy used by the existing analyses.
"""
from array import array
import gzip
import json
import math
from pathlib import Path
import re

import numpy as np

from build_fast_start import (LENGTHS, PACE_BOUND_EPSILON, POINTS, age_code, digest,
                              gender_code, require, verified_manifest)

# Found while building these stories: the 2018 and 2019 Chicago labels contain
# the 2024 field (shared source participant ids; identical names, finishes and
# all nine checkpoints). Counting them would add ~103,000 copied finishes.
DUPLICATE_EDITIONS = (
    dict(city='Chicago', year=2018, duplicate_of=2024,
         reason='Source participant ids, names and all nine checkpoint times match the Chicago 2024 field.'),
    dict(city='Chicago', year=2019, duplicate_of=2024,
         reason='Source participant ids, names and all nine checkpoint times match the Chicago 2024 field.'),
)
GENDER_LABELS = ('Other / not recorded', 'Men', 'Women')
AGE_LABELS = ('Unknown', '18–24', '25–29', '30–34', '35–39', '40–44', '45–49', '50–54',
              '55–59', '60–64', '65–69', '70–74', '75–79', '80–84', '85–89')


class Finishes:
    """Column arrays for every eligible finish, in verified shard order."""

    def __init__(self, times, edition, gender, age, exact_age, profile, editions):
        self.times = times            # (n, 9) cumulative seconds at POINTS
        self.edition = edition        # (n,) index into editions
        self.gender = gender          # 0 other/not recorded, 1 men, 2 women
        self.age = age                # 0 unknown, else AGE_LABELS index
        self.exact_age = exact_age    # float, NaN when not an integer 18–89
        self.profile = profile        # screened identity candidate (not a verified person)
        self.editions = editions
        self.n = len(edition)
        durations = np.diff(np.concatenate([np.zeros((self.n, 1)), times], axis=1), axis=1)
        self.paces = durations / np.asarray(LENGTHS)   # seconds per km per section
        self.baseline = (times[:, 3] - times[:, 0]) / 15.0
        self.finish = times[:, 8]
        cities = sorted({e['city'] for e in editions})
        self.cities = cities
        city_index = {c: i for i, c in enumerate(cities)}
        self.edition_city = np.array([city_index[e['city']] for e in editions], dtype=np.int16)
        self.edition_year = np.array([e['year'] for e in editions], dtype=np.int16)
        self.city = self.edition_city[edition]
        self.year = self.edition_year[edition]

    def subset(self, mask):
        out = Finishes.__new__(Finishes)
        for name in ('times', 'edition', 'gender', 'age', 'exact_age', 'profile', 'paces', 'baseline', 'finish', 'city', 'year'):
            setattr(out, name, getattr(self, name)[mask])
        out.editions, out.cities = self.editions, self.cities
        out.edition_city, out.edition_year = self.edition_city, self.edition_year
        out.n = int(mask.sum()) if mask.dtype == bool else len(mask)
        return out


def exact_age_value(age):
    if age is None or not isinstance(age, (int, float)) or not math.isfinite(age):
        return math.nan
    if age < 18 or age >= 90 or age != math.floor(age):
        return math.nan
    return float(age)


def read_finishes(runner_root, pin, script_root):
    """Verify the runner manifest and every shard; return (Finishes, manifest, sha, audit)."""
    manifest, manifest_sha = verified_manifest(runner_root, pin, script_root)
    editions = manifest['editions']
    times, edition, gender, age, exact, profile = array('d'), array('H'), array('B'), array('B'), array('d'), array('Q')
    record_ids = array('Q')
    raw = eligible = 0
    for relative, expected in sorted(manifest['shards'].items()):
        require(re.fullmatch(r'(profiles|index)/[0-9a-f]{3}\.json\.gz', relative) is not None, 'Unexpected shard path')
        compressed = (runner_root / relative).read_bytes()
        require(len(compressed) == expected['bytes'] and digest(compressed) == expected['sha256'],
                f'Runner shard checksum/size mismatch: {relative}')
        if not relative.startswith('profiles/'):
            continue
        shard = json.loads(gzip.decompress(compressed))
        require(shard['release_tag'] == manifest['release_tag'], f'Shard release mismatch: {relative}')
        for p in shard['profiles']:
            for race in p['races']:
                raw += 1
                record_ids.append(race['id'])
                if not race['eligible']:
                    continue
                eligible += 1
                t = race['times']
                require(len(t) == 9 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in t),
                        'Eligible race must have nine finite times')
                require(0 < t[0] and all(a < b for a, b in zip(t, t[1:])) and 5400 <= t[-1] <= 43200,
                        'Eligible race violates the timing contract')
                durations = [t[0], *[b - a for a, b in zip(t, t[1:])]]
                require(all(120 - PACE_BOUND_EPSILON <= d / L <= 1200 + PACE_BOUND_EPSILON for d, L in zip(durations, LENGTHS)),
                        'Eligible race violates section pace bounds')
                times.extend(t)
                edition.append(race['edition'])
                gender.append(gender_code(race['sex']))
                age.append(age_code(race['age']))
                exact.append(exact_age_value(race['age']))
                profile.append(p['id'])
    require(raw == manifest['raw_records'], 'Raw record count does not reconcile')
    require(eligible == manifest['eligible_records'], 'Eligible record count does not reconcile')
    ids = np.sort(np.frombuffer(record_ids, dtype=np.uint64))
    require(len(ids) and bool(np.all(np.diff(ids) > 0)), 'Duplicate record ids')
    finishes = Finishes(np.frombuffer(times, dtype=np.float64).reshape(-1, 9).copy(),
                        np.frombuffer(edition, dtype=np.uint16).astype(np.int32),
                        np.frombuffer(gender, dtype=np.uint8).copy(),
                        np.frombuffer(age, dtype=np.uint8).copy(),
                        np.frombuffer(exact, dtype=np.float64).copy(),
                        np.frombuffer(profile, dtype=np.uint64).copy(),
                        editions)
    return finishes, manifest, manifest_sha


def screen_duplicates(finishes):
    """Remove the documented duplicate editions; return the kept cohort and an audit."""
    drop = np.zeros(finishes.n, dtype=bool)
    audit = []
    for rule in DUPLICATE_EDITIONS:
        idx = [i for i, e in enumerate(finishes.editions) if e['city'] == rule['city'] and e['year'] == rule['year']]
        target = [i for i, e in enumerate(finishes.editions) if e['city'] == rule['city'] and e['year'] == rule['duplicate_of']]
        require(len(idx) == 1 and len(target) == 1, f"Duplicate-edition rule does not match exactly one edition: {rule}")
        mask = finishes.edition == idx[0]
        # Evidence check: most finishes must have an identical nine-time twin in the target edition.
        source = {tuple(np.round(row, 3)) for row in finishes.times[finishes.edition == target[0]]}
        twins = sum(tuple(np.round(row, 3)) in source for row in finishes.times[mask])
        require(mask.sum() >= 100 and twins / mask.sum() >= .95, f"Duplicate evidence below threshold for {rule['city']} {rule['year']}")
        drop |= mask
        audit.append({**rule, 'eligible_removed': int(mask.sum()), 'identical_nine_time_twins': int(twins)})
    return finishes.subset(~drop), audit


SECTION_KM = np.asarray(LENGTHS, dtype=float)
START_GAP_POINTS = 10.0  # edition median r(0–5 km) minus r(5–10 km); all-edition median ≈ 0.7, next-largest ≈ 6.5


def relative_pace(f):
    """Percent each section's pace differs from the finish's own whole-race average pace (integrates to zero)."""
    return 100.0 * (f.paces / (f.finish[:, None] / 42.195) - 1.0)


def sustained_slowdown(f):
    """Published definition: a recorded 5 km section after 20 km at least 25% slower than the 5–20 km pace.

    Contiguous recorded sections must total at least 5 km, so the final 2.195 km cannot qualify alone.
    Returns (detected bool array, onset km or -1).
    """
    ratio = f.paces[:, 4:8] / f.baseline[:, None] - 1.0 + 1e-12
    hits = ratio >= .25
    detected = hits.any(1)
    onset = np.where(detected, 20 + 5 * hits.argmax(1), -1)
    return detected, onset


def start_offset_screen(f):
    """Flag editions whose first 5 km looks inflated relative to 5–10 km (consistent with start delay in early splits).

    Shape-based stories (pacing types, profiles, rank changes, final kick) leave these editions out; finish-time
    stories keep them. Returns (keep mask, audit list).
    """
    R = relative_pace(f)
    gap = R[:, 0] - R[:, 1]
    audit, flagged = [], []
    for e in np.unique(f.edition):
        idx = f.edition == e
        n = int(idx.sum())
        if n < 100:
            continue
        g = float(np.median(R[idx, 0]) - np.median(R[idx, 1]))
        if g > START_GAP_POINTS:
            flagged.append(e)
            ed = f.editions[e]
            audit.append(dict(city=ed['city'], year=ed['year'], finishes=n, median_gap_points=round(g, 2)))
    keep = ~np.isin(f.edition, flagged)
    return keep, sorted(audit, key=lambda a: (a['city'], a['year']))
