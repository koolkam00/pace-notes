"""Verified eligible-finish arrays for the Pace Notes story analyses.

Reads the checked-in marathon cohort (analysis/marathon-cohort, through its one
Python reader analysis/cohort.py: the names-free records every marathon analysis
reads since the adoption of November 14, 2026), verifies its manifest and every
edition file, and returns column arrays. The cohort holds no name and nothing is
imputed.

An additional analysis-specific screen can remove editions whose records
duplicate another edition (see DUPLICATE_EDITIONS). It never changes the
reviewed source-quality policy used by the existing analyses.
"""
import math
from pathlib import Path

import numpy as np

from build_fast_start import LENGTHS, PACE_BOUND_EPSILON, POINTS, digest, require
import cohort as marathon_cohort

# The scripts a cohort manifest must name; a reader refuses a cohort whose scripts differ from the checkout's.
COHORT_SCRIPTS = frozenset({'build_cohort.py', 'cohort.py', 'build_pacing.py', 'source_quality.py', 'build_record_status.py', 'build_identity.py'})

# Empty since htw-db-2026-10-16-1652. Under private-export-20260912-0934 the 2018 and 2019 Chicago
# labels largely repeated the 2024 field and were listed here (see Git history and docs/KNOWN_ISSUES.md).
# The producer reloaded both editions with new records; across all 287 editions no same-city pair now
# shares more than one nine-time tuple (scripts/verify-duplicate-editions.cjs repeats that scan).
# A rule is dict(city=..., year=..., duplicate_of=..., reason=...) and must pass the evidence check below.
DUPLICATE_EDITIONS = ()
GENDER_LABELS = ('Other / not recorded', 'Men', 'Women')
AGE_LABELS = ('Unknown', '18–24', '25–29', '30–34', '35–39', '40–44', '45–49', '50–54',
              '55–59', '60–64', '65–69', '70–74', '75–79', '80–84', '85–89')


class Finishes:
    """Column arrays for every eligible finish, in cohort order: by edition as the manifest lists them, then record id."""

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
        out.raw_by_edition = getattr(self, 'raw_by_edition', None)
        for name in ('record_id', 'runner', 'keyed'):   # set by read_finishes; absent on arrays built by hand
            if hasattr(self, name):
                setattr(out, name, getattr(self, name)[mask])
        out.edition_city, out.edition_year = self.edition_city, self.edition_year
        out.n = int(mask.sum()) if mask.dtype == bool else len(mask)
        return out


def exact_age_value(age):
    if age is None or not isinstance(age, (int, float)) or not math.isfinite(age):
        return math.nan
    if age < 18 or age >= 90 or age != math.floor(age):
        return math.nan
    return float(age)


def verified_cohort_manifest(cohort_root, pin, script_root):
    """The cohort manifest, after the checks a builder makes before it trusts the cohort: it is the adopted release's,
    its checkpoints are the nine the analyses use, the scripts that wrote it are the checkout's, and its counts
    agree with each other. Returns (manifest, SHA-256 of the manifest's exact bytes)."""
    try:
        manifest, manifest_sha = marathon_cohort.read_manifest(cohort_root)
    except AssertionError as error:
        raise ValueError(f'Unreadable cohort manifest: {error}') from error
    require(manifest['release_tag'] == pin['tag'], 'Cohort release does not match adopted pin')
    require(manifest['points_km'] == POINTS, 'Unexpected checkpoint mapping')
    require(manifest['linkage']['record_join_method'] == 'canonical_record_id', 'This calculation requires the audited canonical identity contract')
    require(COHORT_SCRIPTS <= set(manifest['scripts']), 'Unexpected source script contract')
    for name, expected in manifest['scripts'].items():
        require(digest((Path(script_root) / name).read_bytes()) == expected, f'Source script changed: {name}')
    require(manifest['raw_records'] == manifest['cohort']['raw'] and manifest['eligible_records'] == manifest['cohort']['eligible'],
            'Inconsistent source cohort metadata')
    return manifest, manifest_sha


def read_finishes(cohort_root, pin, script_root):
    """Verify the cohort manifest and every edition file; return (Finishes, manifest, sha).

    The finishes are the cohort's counted records, the eligible cohort. `edition` indexes the manifest's `editions`
    (`Finishes.editions` is that list, with each edition's city, year, race, race date, tier and use), which also
    names the editions that keep only an own-record view: those have no finish here, as a held edition had none in
    the runner manifest this replaced. `profile` numbers the runners of the screened identity rule from 0 in order
    of their cohort runner id (equal values are one runner; a record without a runner key is a runner of its own);
    `runner` is that cohort id (the smallest written marathon record id of the key, or the record's own id),
    `keyed` says whether the record has a key, and `record_id` is the record's id, the order within an edition.
    `raw_by_edition` is every written record of each edition.
    """
    manifest, manifest_sha = verified_cohort_manifest(cohort_root, pin, script_root)
    editions = manifest['editions']
    try:
        arrays, _, loaded_sha = marathon_cohort.load(cohort_root)
    except AssertionError as error:
        raise ValueError(f'Cohort file check failed: {error}') from error
    require(loaded_sha == manifest_sha, 'The cohort manifest changed while it was read')
    times = arrays['times']
    n = len(times)
    require(sum(e['raw'] for e in editions) + sum(row[2] for row in manifest['other_editions']['rows']) == manifest['raw_records'],
            'Raw record count does not reconcile')
    require(n == manifest['eligible_records'] == sum(e['eligible'] for e in editions), 'Eligible record count does not reconcile')
    require(bool(np.isfinite(times).all()), 'Eligible race must have nine finite times')
    durations = np.diff(np.concatenate([np.zeros((n, 1)), times], axis=1), axis=1)
    require(bool((durations > 0).all()) and bool(((times[:, 8] >= 5400) & (times[:, 8] <= 43200)).all()),
            'Eligible race violates the timing contract')
    pace = durations / np.asarray(LENGTHS)
    require(bool(((pace >= 120 - PACE_BOUND_EPSILON) & (pace <= 1200 + PACE_BOUND_EPSILON)).all()), 'Eligible race violates section pace bounds')
    ids = np.sort(arrays['record_id'])
    require(n > 0 and bool(np.all(np.diff(ids) > 0)), 'Duplicate record ids')
    sex, age = arrays['sex'], arrays['age']
    gender = np.where(sex == b'M', 1, np.where(sex == b'F', 2, 0)).astype(np.uint8)
    whole = np.isfinite(age) & (age >= 18) & (age < 90) & (age == np.floor(age))   # exact_age_value, for every record
    banded = np.where(whole, age, 18.0)
    age_band = np.where(whole, np.where(banded < 25, 1, banded // 5 - 3), 0).astype(np.uint8)   # build_fast_start.age_code
    profile = np.unique(arrays['runner'], return_inverse=True)[1].astype(np.uint64)
    finishes = Finishes(times, arrays['edition'].astype(np.int32), gender, age_band, np.where(whole, age, np.nan), profile, editions)
    finishes.raw_by_edition = np.array([e['raw'] for e in editions], dtype=np.int64)
    finishes.record_id, finishes.runner, finishes.keyed = arrays['record_id'], arrays['runner'], arrays['keyed']
    return finishes, manifest, manifest_sha


def screen_duplicates(finishes, rules=DUPLICATE_EDITIONS):
    """Remove the documented duplicate editions; return the kept cohort and an audit."""
    drop = np.zeros(finishes.n, dtype=bool)
    audit = []
    for rule in rules:
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


PACE_TIE = 1e-12


def faster_pace(pace, reference):
    """True where `pace` is strictly faster (fewer seconds per km) than `reference`; an exact tie is not faster.

    The final section's length, 42.195 − 40 km, is 2.1950000000000003 in floating point, so a final 2.195 km run at
    exactly the 35–40 km pace (439 s against 1,000 s) comes out 1e-16 faster. Whole-second splits that really differ
    are at least about 2e-7 apart in this ratio, far above the tolerance. scripts/verify-insights.cjs uses the same rule.
    """
    return pace / reference - 1.0 < -PACE_TIE


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


def granular_age_editions(f):
    """Editions whose recorded ages look like exact ages: at least 30 distinct integer ages and under 40% multiples of 5.

    Some sources record age-group floors (30, 35, 40, …) in the age field; those are never treated as exact ages.
    """
    keep = []
    for e in np.unique(f.edition):
        a = f.exact_age[(f.edition == e) & np.isfinite(f.exact_age)]
        if len(a) >= 100 and len(np.unique(a)) >= 30 and np.mean(a % 5 == 0) < .4:
            keep.append(int(e))
    return keep
