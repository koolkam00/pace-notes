"""The marathon side of the half-marathon analyses, from the checked-in marathon cohort (docs/HALF_MARATHON.md, R0).

Eligible finishes, their record ids, nine mat times, recorded sex and edition are the counted records of the names-free
marathon cohort (analysis/marathon-cohort, read through analysis/insights_data.read_finishes, which verifies the cohort
manifest, every edition file and the timing contract of every record). A record id is the release's `race_records.id` of
the marathon database (`source_db = full`), the id the person links and the identity file use. Sustained slowdown is
`insights_data.sustained_slowdown` (at least 25% slower for at least 5 km after 20 km against the 5–20 km pace). Race
dates are the cohort manifest's (`race_date` of each edition: the weather evidence's date, or a reviewed one).

The cohort holds no name, and nothing here leaves the process except counts.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

from half_common import ANALYSIS, ROOT, fail  # noqa: E402
from insights_data import read_finishes, sustained_slowdown  # noqa: E402

COHORT = ROOT / 'analysis' / 'marathon-cohort'

# The adopted release's reviewed counts, keyed by its tag: the cohort's eligible finishes (its counted records), those
# with a sustained slowdown and the counted editions with a race date. An edition without one is allowed only on the
# release's reviewed `undated` list; it keeps its finishes and supplies no pair. Set from the real run on the final
# inputs after reading them against the pipeline's cohort record; earlier releases (the runner shards of
# private-export-20261021-1050 and master-20261103b) are in Git history.
EXPECTED = {}


class Marathons:
    """Every eligible marathon finish: record id, edition (city-year), recorded sex, finish and sustained slowdown."""

    def __init__(self, record_id, edition, gender, finish, sustained, editions, raw_by_edition, dates, manifest_sha,
                 manifest):
        self.record_id = record_id          # (n,) the release's race_records.id (source_db = full)
        self.edition = edition              # (n,) index into editions
        self.gender = gender                # 0 other or not recorded, 1 men, 2 women (build_fast_start.gender_code)
        self.finish = finish                # seconds
        self.sustained = sustained          # bool
        self.editions = editions            # the cohort manifest's editions: city (the race's registry label), year, race, …
        self.raw_by_edition = raw_by_edition
        self.dates = dates                  # {edition index: 'YYYY-MM-DD'}; a reviewed undated edition has none
        self.manifest_sha256 = manifest_sha # sha256 of the cohort manifest's exact bytes
        self.manifest = manifest
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


def _dates(editions, eligible_editions, undated=()):
    """Race date of every edition with eligible finishes, from the cohort manifest. An edition without one is allowed
    only on the release's reviewed `undated` list: it keeps its finishes and supplies no pair, since a pair needs both
    dates."""
    dates = {}
    for e in eligible_editions:
        ed = editions[e]
        date = ed.get('race_date')
        if date is None and [ed['city'], int(ed['year'])] in [list(u) for u in undated]:
            continue
        if not isinstance(date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or int(date[:4]) != int(ed['year']):
            fail(f"no race date in the marathon cohort for {ed['city']} {ed['year']}")
        dates[int(e)] = date
    return dates


def load(cohort_root: Path = COHORT, expected: dict | None = None, check: bool = True) -> Marathons:
    """Verify the cohort and return every eligible finish with its record id. With `check` (always, outside tests and
    discovery runs) the counts must equal the reviewed ones of the adopted release."""
    pin = json.loads((ROOT / 'analysis' / 'release.json').read_text())
    try:
        f, manifest, manifest_sha = read_finishes(cohort_root, pin, ANALYSIS)
    except ValueError as error:
        fail(f'the marathon cohort: {error}')
    editions = manifest['editions']
    sustained, _ = sustained_slowdown(f)
    eligible_editions = np.unique(f.edition)
    keys = [(editions[e]['city'], editions[e]['year']) for e in eligible_editions]
    if len(set(keys)) != len(keys):
        fail('two eligible marathon editions share a label and year')
    if any(editions[e]['use'] != 'counted' for e in eligible_editions):
        fail('an eligible marathon finish sits in an edition the cohort does not count')
    want = (expected if expected is not None else EXPECTED).get(manifest['release_tag'])
    if want is None and check:
        fail(f"no reviewed marathon counts for {manifest['release_tag']}")
    undated_ok = (want or {}).get('undated', ()) if check else [[editions[e]['city'], int(editions[e]['year'])] for e in eligible_editions]
    dates = _dates(editions, eligible_editions, undated_ok)
    m = Marathons(np.asarray(f.record_id, dtype=np.int64), f.edition.astype(np.int32), f.gender, f.finish.copy(), sustained,
                  editions, f.raw_by_edition, dates, manifest_sha, manifest)
    got = {'eligible': int(m.n), 'sustained': int(sustained.sum()), 'dated_editions': len(dates)}
    undated = sorted([editions[e]['city'], int(editions[e]['year'])] for e in eligible_editions if int(e) not in dates)
    if undated or (want and 'undated' in want):
        got['undated'] = undated
    m.counts = got
    if check and got != want:
        fail(f'marathon side counts {got} differ from the reviewed {want}')
    return m
