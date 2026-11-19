"""Shared helpers for the linked-records builders (docs/LINKED_RECORDS.md).

The family follows records linked by name across marathons: the same linked runner at different races and in
different years of one race, the runner's recorded bests, and the same runner some years older. Every builder reads
the adapted marathon input (analysis/adapt_combined.py) read-only and publishes aggregates only, under
public/data/linked/: no name, bib, record id or person id, every shown group at least `MIN_CELL` finishes or pairs,
and at least `MIN_EDITIONS` editions behind any claim that crosses editions.

This module holds what every builder shares: the frozen constants, the input checks, the DuckDB connection, the
rounding and the deterministic JSON encoding, and the scan that keeps identifiers, names, ranks and banned words out
of the published files. Data-reading scripts run with `python3 -I`, which leaves the script's folder off `sys.path`;
the entry point (build_linked.py) adds the analysis folder itself before importing its siblings.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
import tempfile
from pathlib import Path

ANALYSIS = Path(__file__).resolve().parent
ROOT = ANALYSIS.parent
if str(ANALYSIS) not in sys.path:
    sys.path.insert(0, str(ANALYSIS))

RELEASE_PATH = ANALYSIS / 'release.json'
REGISTRY_PATH = ANALYSIS / 'race-registry.json'
OUTPUT = ROOT / 'public' / 'data' / 'linked'
LINK_ASSET = 'person-ids-v5.1-race_results_linked.parquet'

# ---------------------------------------------------------------------------------------------------------------
# Frozen definitions (docs/LINKED_RECORDS.md repeats each in words; scripts/verify-linked.cjs holds the same numbers)
# ---------------------------------------------------------------------------------------------------------------
SCHEMA_VERSION = 1
SEED = 20261114
MIN_CELL = 100            # finishes, pairs or linked runners behind every shown group
MIN_EDITIONS = 3          # editions behind any claim that crosses editions
MIN_CONNECTED = 100       # linked runners that connect a fitted edition to another edition
MIN_MATCH_SIDE = 20       # finishes on each side of a matched cell (the return comparison)
MAX_GAP = 2               # calendar years between the two results of a model pair
FINISH_RANGE = (7200.0, 43200.0)   # a kept result finished between 2:00:00 and 12:00:00, both ends included
LINK_TIERS = ('high_elite', 'high', 'medium')     # links that key a runner (plan decision D4)
HIGH_TIERS = ('high_elite', 'high')               # the high-links-only variant
VERIFIED_TIERS = ('stamped', 'stamped_weaker_source')
F_TIERS = VERIFIED_TIERS + ('partial',)           # the finish-time universe F (plan decision D22)
COVERAGE = (0.95, 1.05)   # a partial edition: finishes with a time / official finishers, both ends included
# Policy categories that are not about an edition's split grid: such an edition never enters a linked analysis.
NOT_ABOUT_GRID = ('incomplete_ingestion', 'mixed_distance_list', 'selected_field', 'unreconciled_hold')
ABOUT_GRID = ('finish_time_only', 'invalid_split_grid')
YEAR_MARGIN_PCT = 1.0     # an edition is a fast or slow year only when its interval clears this, either side
RACE_BAND_PCT = 2.0       # a race reads "about the same" only when its whole interval lies inside this band
OUTLIER_PCT = 6.0         # an edition further than this from its race's median reading is held for review
FIELD_R_MIN = 0.7         # the fallback bar of the whole-field sustained-slowdown check
BOOT_REPS = 400           # runner bootstrap draws (Poisson weights per linked runner)
BESTS_MARGIN = 0.01       # a best share differs from 1/k only when it is more than one point away
AGE_AGREE_PCT = 0.3       # the same-race and verified-only variants must sit this close to the within-runner rate
AGE_RANGE = (18, 85)      # age at a race, from an exact birth year
PAIR_YEARS = (1, 3)       # consecutive recorded marathons this many calendar years apart (the age pairs)
STEP_MAX_GAP = 2          # consecutive recorded marathons at most this many calendar years apart (the steps)
FINISH_BAND_SECONDS = 600 # the 10-minute finish bands of the matched comparison and of the recorded-again table

# The release's `timing_basis` strings, each classed once. A string that is not listed stops the build.
# chip: the finish is a chip or net time (some sources say they fall back to gun or clock time for a row without one).
TIMING_CLASS = {
    'chip': 'chip',
    'chip (ot) as published': 'chip',
    'real time as published': 'chip',
    'realTime (net) as published, else officialTime': 'chip_fallback',
    'chip (clock if no chip)': 'chip_fallback',
    'chip (delta_net), clock if no chip': 'chip_fallback',
    'chip (gun if no chip)': 'chip_fallback',
    'chip time else gun': 'chip_fallback',
    'chip elapsed (gun if no chip)': 'chip_fallback',
    'chip where published, else gun': 'chip_fallback',
    "net 'time' (gun if none)": 'chip_fallback',
    'gun': 'gun',
    'mixed': 'mixed',
    'unknown': 'not_stated',
    'as published': 'not_stated',
    'as published (Time)': 'not_stated',
    None: 'not_stated',
}
TIMING_CODES = ('chip', 'chip_fallback', 'gun', 'mixed', 'not_stated')
# Editions are compared only with editions on the same basis: the two chip codes are one basis, a mixed edition has none.
TIMING_BASIS = {'chip': 'chip_or_net', 'chip_fallback': 'chip_or_net', 'gun': 'gun', 'mixed': None, 'not_stated': 'not_stated'}
RACE_BASIS = 'chip_or_net'    # a race reading uses its chip- or net-timed editions only

# Two-sided 95% points of Student's t by degrees of freedom (1 to 60); beyond 60 the multiplier is 2, so the interval
# of a race is never narrower than two standard errors. analysis/test_linked.py integrates the density to check them.
T975 = (12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.3060, 2.2622, 2.2281, 2.2010, 2.1788, 2.1604, 2.1448,
        2.1314, 2.1199, 2.1098, 2.1009, 2.0930, 2.0860, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595, 2.0555, 2.0518, 2.0484,
        2.0452, 2.0423, 2.0395, 2.0369, 2.0345, 2.0322, 2.0301, 2.0281, 2.0262, 2.0244, 2.0227, 2.0211, 2.0195, 2.0181,
        2.0167, 2.0154, 2.0141, 2.0129, 2.0117, 2.0106, 2.0096, 2.0086, 2.0076, 2.0066, 2.0057, 2.0049, 2.0040, 2.0032,
        2.0025, 2.0017, 2.0010, 2.0003)


def t_multiplier(n: int) -> float:
    """The half-width of a 95% interval in standard errors, for a mean over `n` editions (n at least 2)."""
    if n < 2:
        fail('an interval needs at least two editions')
    return T975[n - 2] if n - 1 <= len(T975) else 2.0


class LinkedError(ValueError):
    """A builder refuses: an input is not the pinned one, a count changed, a floor or a ban would be broken."""


def fail(message: str):
    raise LinkedError(message)


def bytes_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def inside(path, parent) -> bool:
    try:
        Path(path).resolve().relative_to(Path(parent).resolve())
        return True
    except ValueError:
        return False


def connect():
    """A DuckDB connection. Settings come from the environment: PACE_LINKED_DUCKDB_THREADS (default 2),
    PACE_LINKED_DUCKDB_MEMORY (default 4GB), PACE_LINKED_DUCKDB_MAX_TEMP (the spill cap, default 8GB) and TMPDIR."""
    import duckdb
    db = duckdb.connect()
    db.execute(f"SET threads={int(os.environ.get('PACE_LINKED_DUCKDB_THREADS', '2'))}")
    sizes = {}
    for name, default in (('PACE_LINKED_DUCKDB_MEMORY', '4GB'), ('PACE_LINKED_DUCKDB_MAX_TEMP', '8GB')):
        sizes[name] = os.environ.get(name, default)
        if not re.fullmatch(r'\d+(\.\d+)?\s*[KMGT]i?B', sizes[name]):
            fail(f'{name} must look like 4GB, not {sizes[name]!r}')
    db.execute(f"SET memory_limit='{sizes['PACE_LINKED_DUCKDB_MEMORY']}'")
    spill = (os.environ.get('TMPDIR') or tempfile.gettempdir()).replace("'", "''")
    db.execute(f"SET temp_directory='{spill}'")
    db.execute(f"SET max_temp_directory_size='{sizes['PACE_LINKED_DUCKDB_MAX_TEMP']}'")
    db.execute('SET preserve_insertion_order=false')
    return db


# ---------------------------------------------------------------------------------------------------------------
# Publication: rounding, encoding, and what may appear in a published file
# ---------------------------------------------------------------------------------------------------------------
PCT_DIGITS = 3      # percent changes and readings, as published
SHARE_DIGITS = 10   # shares, so a page rounds once from the exact value (analysis/insights_stats.py)


def finite(value) -> float:
    value = float(value)
    if not math.isfinite(value):
        fail('a non-finite number reached a published file')
    return value


def pct(value) -> float:
    """A percent as published (three decimals; a negative zero is written as zero)."""
    out = round(finite(value), PCT_DIGITS)
    return 0.0 if out == 0 else out


def sh(value) -> float:
    """A share as published."""
    return round(finite(value), SHARE_DIGITS)


def num(value, digits=4) -> float:
    out = round(finite(value), digits)
    return 0.0 if out == 0 else out


def log_pct(delta) -> float:
    """A log difference as a percent change of the finish time."""
    return 100.0 * math.expm1(float(delta))


def encode(value) -> bytes:
    """Deterministic JSON: sorted keys, no NaN, compact separators, one trailing newline."""
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')) + '\n').encode()


# verify-charts' identityKey with the half and link identifiers; a published key never names a record or a person.
IDENTITY_KEY = re.compile(r'^(ids?|rids?|record_?ids?|profile_?ids?|runners?|runner_?ids?|bibs?|bib_?(no|number)|names?|'
                          r'(full|first|last|given|family)_?names?|participants?|participant_?ids?|persons?|person_?ids?|'
                          r'edition_?ids?|match_?keys?|series_key|urls?|source_url)$', re.I)
# No rank, order or converted time in any key (plan decision D13.2: no rank, no "fastest" list, no time converter).
RANK_KEY = re.compile(r'(^|_)(rank(s|ed|ing)?|order(ed|ing)?|position|place|top|bottom|fastest|slowest|league|equivalent|converted|adjusted)(_|$)', re.I)
PERSON_ID = re.compile(r'\bp\d+_[0-9a-f]{8,}\b')
RELEASE_LABEL = re.compile(r'private-export|half-snapshot-|half-dataset-|runner-links-|person-ids-|htw-db-|20260912|20261016|20261021|20261029|'
                           r'20261030|master-[0-9]{8}|20261103|pace-notes-marathon-half|20261113')
# Strings are data codes under these keys, each from a closed set; a race label is a registry label; a `rule` is prose.
CODE_KEYS = {
    'tier': set(F_TIERS) | {'unverified'},
    'timing': set(TIMING_CODES),
    'basis': {'chip_or_net', 'gun', 'not_stated'},
    'verdict': {'fast', 'slow', 'usual', 'faster', 'slower', 'about_the_same', 'more_often', 'less_often', 'as_often', 'stated', 'holds'},
    'family': {'linked'},
    'file': {'editions.json', 'races.json', 'bests.json', 'age.json', 'return.json', 'recorded_again.json', 'checks.json'},
    'sex': {'F', 'M'},
    'scope': {'F', 'verified', 'high', 'wider', 'complete'},
    'reason': {'another_course', 'virtual_run'},      # why a review excluded an edition (analysis/linked_reviews.py)
}
LABEL_KEYS = {'label'}
SERIES_KEYS = {'series'}     # a string here is a series name of the registry's reviewed note (plan decision D29)
DATE_KEYS = {'reviewed_on'}  # the day of a review, YYYY-MM-DD
QUOTE_KEYS = {'quoted_note'} # the producer's own sentence behind a reviewed exclusion; held to the word rules like any prose
DIGEST_KEYS = {'sha256'}
# Words no string of a published family file may hold (the scout's "must not print" lists and AGENTS rule 17).
BANNED_WORDS = [
    (re.compile(r'arithmetic', re.I), 'the word "arithmetic"'),
    (re.compile(r'\bthe\s+wall\b|\bhit\s+the\s+wall\b', re.I), '"the wall"'),
    (re.compile(r'\byour\s+(?:[\w’\'-]+\s+){0,2}chances?\b', re.I), '"your chance"'),
    (re.compile(r'\byour odds\b|\byou will\b|\bpredict', re.I), 'odds, a promise or a prediction'),
    (re.compile(r'\bfast(?:est)\b|\bslowest\b|\brank|\bleague\b|\btop \d|\bquickest\b', re.I), 'a rank word'),
    (re.compile(r'\bequivalent\b|\bconver(?:sion|t|ts|ted|ting)\b|\badjust', re.I), 'an equivalent or adjusted time'),
    (re.compile(r'\b(?:causes?|caused|costs?|leads? to|led to|because|came from|due to|results? in|makes?|affects?|improves?|produces?|helps?)\b', re.I), 'a causal verb'),
    (re.compile(r'\bPBs?\b|\bpersonal (?:best|record)s?\b|\bPRs?\b', re.I), '"personal best" (a best is a recorded best)'),
    (re.compile(r'\bdebut', re.I), '"debut" (a first is a first recorded marathon)'),
    (re.compile(r'\blearn|\bexperience makes\b|\bputs? (?:runners|people) off\b|\bnever run another\b', re.I), 'a claim the records cannot carry'),
    (re.compile(r'\bage(?:ing|ing)? costs\b|\bageing\b|\baging\b', re.I), 'an ageing claim'),
    (re.compile(r'\bhalfway\b|\bhalf-way\b', re.I), 'a halfway claim'),
    (re.compile(r'\bgoals?\b|\btarget', re.I), 'a goal claim (goals are not recorded)'),
]
RECORDED = re.compile(r'recorded', re.I)
BEST_OR_FIRST = re.compile(r'\b(bests?|firsts?)\b', re.I)


def word_problems(text: str) -> list[str]:
    """The rules a string breaks. A string that says "best" or "first" must say "recorded" too."""
    found = [what for pattern, what in BANNED_WORDS if pattern.search(text)]
    if BEST_OR_FIRST.search(text.replace('_', ' ')) and not RECORDED.search(text):
        found.append('"best" or "first" without "recorded"')
    return found


def check_published(value, where: str, labels: frozenset, *, series: frozenset = frozenset(), in_rule: bool = False, by_series: bool = False) -> None:
    """Finite numbers; no identifier, rank or converter keys; strings only as closed codes, registry labels, series
    names of the registry, digests or `rule` prose; no person id, release tag or banned word in any string; a key that
    says best or first says recorded. A map may be keyed by label (`races`, `editions`, `series`) and, under a label of
    `series`, by series name. The floors are checked by each builder where it forms a group and again by
    scripts/verify-linked.cjs."""
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                fail(f'{where}: a non-string key')
            keyed_by_label = key in labels and where.endswith(('.races', '.editions', '.series'))
            if where.endswith('.series') and key not in labels:
                fail(f'{where}.{key}: the series map is keyed by registry label')
            if by_series and key not in series:
                fail(f'{where}.{key}: not a series name of the race registry')
            if not keyed_by_label and not by_series:
                if IDENTITY_KEY.match(key):
                    fail(f'{where}.{key}: an identifier or name key')
                if RANK_KEY.search(key):
                    fail(f'{where}.{key}: a rank, order or converted-time key')
                if BEST_OR_FIRST.search(key.replace('_', ' ')) and not RECORDED.search(key):
                    fail(f'{where}.{key}: a key that says best or first without "recorded"')
            if isinstance(item, str):
                if PERSON_ID.search(item):
                    fail(f'{where}.{key}: a person id in a published file')
                if key in DIGEST_KEYS:
                    if not re.fullmatch(r'[0-9a-f]{64}', item):
                        fail(f'{where}.{key}: not a sha256 digest')
                elif key in LABEL_KEYS:
                    if item not in labels:
                        fail(f'{where}.{key}: {item!r} is not a registry label')
                elif key in SERIES_KEYS and not in_rule:
                    if item not in series:
                        fail(f'{where}.{key}: {item!r} is not a series name of the race registry')
                elif key in DATE_KEYS and not in_rule:
                    if not re.fullmatch(r'20\d{2}-[01]\d-[0-3]\d', item):
                        fail(f'{where}.{key}: {item!r} is not a day')
                elif key in CODE_KEYS and not in_rule:
                    if item not in CODE_KEYS[key]:
                        fail(f'{where}.{key}: {item!r} is not one of the codes this key may hold')
                elif in_rule or key == 'rule' or key in QUOTE_KEYS:
                    problems = word_problems(item)
                    if problems:
                        fail(f'{where}.{key}: {", ".join(problems)}: {item!r}')
                else:
                    fail(f'{where}.{key}: a string under a key that may not hold one ({item!r})')
                if RELEASE_LABEL.search(item) and key != 'release_tag':
                    fail(f'{where}.{key}: a release tag in a published family file')
            check_published(item, f'{where}.{key}', labels, series=series, in_rule=in_rule or key == 'rule',
                            by_series=keyed_by_label and where.endswith('.series') and isinstance(item, dict))
    elif isinstance(value, list):
        for i, item in enumerate(value):
            if isinstance(item, str) and not in_rule:
                fail(f'{where}[{i}]: a bare string in a list')
            check_published(item, f'{where}[{i}]', labels, series=series, in_rule=in_rule)
    elif isinstance(value, bool) or value is None or isinstance(value, (int, str)):
        return
    elif isinstance(value, float):
        if not math.isfinite(value):
            fail(f'{where}: a non-finite number')
    else:
        fail(f'{where}: {type(value).__name__} reached a published file (convert NumPy values with int() or float())')
