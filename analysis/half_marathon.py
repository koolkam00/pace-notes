"""The marathon side of the half-marathon analyses, from public files only (spec 1.4).

Eligible finishes, their canonical record ids, nine mat times, recorded sex and edition come from the committed runner
shards (public/data/runners), checked exactly as analysis/insights_data.read_finishes checks them (every shard's size
and sha against the verified runner manifest, the timing contract of every eligible race). The shard race `id` is the
adopted release's canonical `race_records.id`, the id the link build uses for its marathon records. Sustained slowdown
is `insights_data.sustained_slowdown` (at least 25% slower for at least 5 km after 20 km against the 5–20 km pace).
Race dates come from public/data/weather/evidence.json, pinned by analysis/weather-release.json.

No raw names are read: the shards' profile names are skipped and nothing here leaves the process except counts.
"""
from __future__ import annotations

import gzip
import json
import math
import re
import sys
from array import array
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

from build_fast_start import LENGTHS, PACE_BOUND_EPSILON, digest, gender_code, require, verified_manifest  # noqa: E402
from half_common import ROOT, fail, file_sha256  # noqa: E402
from insights_data import Finishes, sustained_slowdown  # noqa: E402

RUNNERS = ROOT / 'public' / 'data' / 'runners'
WEATHER_EVIDENCE = ROOT / 'public' / 'data' / 'weather' / 'evidence.json'
WEATHER_PIN = ROOT / 'analysis' / 'weather-release.json'

# The adopted release's reviewed counts (analysis/release.json private-export-20261021-1050).
EXPECTED = {'private-export-20261021-1050': {'eligible': 4_108_749, 'sustained': 1_266_780, 'dated_editions': 215}}


class Marathons:
    """Every eligible marathon finish: record id, edition (city-year), recorded sex, finish and sustained slowdown."""

    def __init__(self, record_id, edition, gender, finish, sustained, editions, raw_by_edition, dates, manifest_sha,
                 manifest, weather_sha):
        self.record_id = record_id          # (n,) uint64, the canonical race_records.id
        self.edition = edition              # (n,) index into editions
        self.gender = gender                # 0 other or not recorded, 1 men, 2 women (build_fast_start.gender_code)
        self.finish = finish                # seconds
        self.sustained = sustained          # bool
        self.editions = editions            # [{city, year, race}] from the runner manifest
        self.raw_by_edition = raw_by_edition
        self.dates = dates                  # {edition index: 'YYYY-MM-DD'} for every edition with eligible finishes
        self.manifest_sha256 = manifest_sha
        self.manifest = manifest
        self.weather_sha256 = weather_sha
        self.n = len(record_id)

    def frame(self):
        """A pandas frame for DuckDB: one row per eligible finish."""
        import pandas as pd
        city = np.array([e['city'] for e in self.editions], dtype=object)
        year = np.array([e['year'] for e in self.editions], dtype=np.int32)
        date = np.array([self.dates.get(i) for i in range(len(self.editions))], dtype=object)
        return pd.DataFrame({
            'm_record_id': self.record_id.astype(np.int64), 'm_edition': self.edition.astype(np.int32),
            'm_city': city[self.edition], 'm_year': year[self.edition], 'm_date': pd.to_datetime(date[self.edition]).date,
            'm_gender': self.gender.astype(np.int8), 'm_finish_s': self.finish, 'm_sustained': self.sustained,
        })


def _dates(editions, eligible_editions, weather):
    """Race date of every edition with eligible finishes, from the weather evidence (one row per city and year)."""
    by_key = {}
    for row in weather['editions']:
        key = (row['city'], int(row['year']))
        if key in by_key and by_key[key] != row.get('date'):
            fail(f'weather evidence holds two dates for {key}')
        by_key[key] = row.get('date')
    dates = {}
    for e in eligible_editions:
        ed = editions[e]
        date = by_key.get((ed['city'], int(ed['year'])))
        if not isinstance(date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or int(date[:4]) != int(ed['year']):
            fail(f"no race date in the weather evidence for {ed['city']} {ed['year']}")
        dates[int(e)] = date
    return dates


def load(runner_root: Path = RUNNERS, weather_path: Path = WEATHER_EVIDENCE, expected: dict | None = None) -> Marathons:
    """Verify the runner manifest and every shard; return every eligible finish with its record id."""
    pin = json.loads((ROOT / 'analysis' / 'release.json').read_text())
    manifest, manifest_sha = verified_manifest(runner_root, pin, ROOT / 'analysis')
    editions = manifest['editions']
    ids, times, edition, gender = array('Q'), array('d'), array('H'), array('B')
    all_ids = array('Q')
    raw_by_edition = np.zeros(len(editions), dtype=np.int64)
    raw = eligible = 0
    for relative, meta in sorted(manifest['shards'].items()):
        require(re.fullmatch(r'(profiles|index)/[0-9a-f]{3}\.json\.gz', relative) is not None, 'Unexpected shard path')
        compressed = (runner_root / relative).read_bytes()
        require(len(compressed) == meta['bytes'] and digest(compressed) == meta['sha256'], f'Runner shard checksum/size mismatch: {relative}')
        if not relative.startswith('profiles/'):
            continue
        shard = json.loads(gzip.decompress(compressed))
        require(shard['release_tag'] == manifest['release_tag'], f'Shard release mismatch: {relative}')
        for profile in shard['profiles']:
            for race in profile['races']:
                raw += 1
                raw_by_edition[race['edition']] += 1
                all_ids.append(race['id'])
                if not race['eligible']:
                    continue
                eligible += 1
                t = race['times']
                require(len(t) == 9 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in t), 'Eligible race must have nine finite times')
                require(0 < t[0] and all(a < b for a, b in zip(t, t[1:])) and 5400 <= t[-1] <= 43200, 'Eligible race violates the timing contract')
                durations = [t[0], *[b - a for a, b in zip(t, t[1:])]]
                require(all(120 - PACE_BOUND_EPSILON <= d / L <= 1200 + PACE_BOUND_EPSILON for d, L in zip(durations, LENGTHS)),
                        'Eligible race violates section pace bounds')
                ids.append(race['id'])
                times.extend(t)
                edition.append(race['edition'])
                gender.append(gender_code(race['sex']))
    require(raw == manifest['raw_records'], 'Raw record count does not reconcile')
    require(eligible == manifest['eligible_records'], 'Eligible record count does not reconcile')
    every = np.sort(np.frombuffer(all_ids, dtype=np.uint64))
    require(len(every) and bool(np.all(np.diff(every) > 0)), 'Duplicate record ids')
    times_arr = np.frombuffer(times, dtype=np.float64).reshape(-1, 9).copy()
    edition_arr = np.frombuffer(edition, dtype=np.uint16).astype(np.int32)
    gender_arr = np.frombuffer(gender, dtype=np.uint8).copy()
    n = len(edition_arr)
    f = Finishes(times_arr, edition_arr, gender_arr, np.zeros(n, np.uint8), np.full(n, np.nan), np.zeros(n, np.uint64), editions)
    sustained, _ = sustained_slowdown(f)

    weather_pin = json.loads(WEATHER_PIN.read_text())
    weather = json.loads(Path(weather_path).read_text())
    if weather['input']['release_tag'] != weather_pin['tag']:
        fail('the weather evidence does not match analysis/weather-release.json')
    eligible_editions = np.unique(edition_arr)
    keys = [(editions[e]['city'], editions[e]['year']) for e in eligible_editions]
    if len(set(keys)) != len(keys):
        fail('two eligible marathon editions share a city and year')
    dates = _dates(editions, eligible_editions, weather)
    m = Marathons(np.frombuffer(ids, dtype=np.uint64).copy(), edition_arr, gender_arr, times_arr[:, 8].copy(), sustained,
                  editions, raw_by_edition, dates, manifest_sha, manifest, file_sha256(weather_path))
    want = (expected or EXPECTED).get(manifest['release_tag'])
    if want is None:
        fail(f"no reviewed marathon counts for {manifest['release_tag']}")
    got = {'eligible': int(m.n), 'sustained': int(sustained.sum()), 'dated_editions': len(dates)}
    if got != want:
        fail(f'marathon side counts {got} differ from the reviewed {want}')
    return m
