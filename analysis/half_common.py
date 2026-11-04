"""Shared helpers for the half-marathon builders (docs/HALF_MARATHON.md).

The half snapshot and its person links (the owner's public CC BY 4.0 release half-dataset-20261030-1904) are
record-level files that stay outside the repository. Every builder reads them read-only through DuckDB and publishes aggregates only
(public/data/half/): every shown group holds at least
`MIN_CELL` finishes or pairs and at least `MIN_EDITIONS` editions behind any claim that crosses editions.

This module holds what every builder shares: the pin reader, the DuckDB connection (`ATTACH … (TYPE sqlite, READ_ONLY)`,
refused when a non-empty -wal sits beside the file, since DuckDB cannot open a SQLite immutable), the finish
time parser, the repository quantile, the publication rounding, the deterministic JSON encoding and the scan that
keeps identifiers, names and stray strings out of the published files.

Data-reading scripts run with `python3 -I`, which leaves the script's folder off `sys.path`; the entry points
(build_half.py, half_quality.py) add the analysis folder themselves before importing their siblings.
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

from insights_stats import SEED, SHARE_DIGITS, quantile  # noqa: E402  (after the path fix above)

PIN_PATH = ANALYSIS / 'half-release.json'
RELEASE_PATH = ANALYSIS / 'release.json'
OUTPUT = ROOT / 'public' / 'data' / 'half'

MIN_CELL = 100          # finishes or pairs behind every shown group
MIN_EDITIONS = 3        # editions behind any claim that crosses editions
MIN_EDGE_SLICE = 10     # pairs in each one-minute edge slice of a published linked window (spec 1.5)

__all__ = ['ANALYSIS', 'ROOT', 'PIN_PATH', 'RELEASE_PATH', 'OUTPUT', 'MIN_CELL', 'MIN_EDITIONS', 'MIN_EDGE_SLICE', 'SEED',
           'SHARE_DIGITS', 'quantile', 'HalfError', 'fail', 'file_sha256', 'bytes_sha256', 'load_pin', 'check_pin', 'pinned_digest',
           'snapshot_date', 'check_no_wal', 'wal_paths', 'connect',
           'TIME_PATTERN', 'secs_sql', 'parse_time', 'sh', 'sec', 'encode', 'check_published', 'inside']


class HalfError(ValueError):
    """A builder refuses: a count changed, a source is missing, a floor or a ban would be broken."""


def fail(message: str):
    raise HalfError(message)


def bytes_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


PIN_SCHEMA = 3
_KEY = re.compile(r'[a-z0-9]+(-[a-z0-9]+)+')
_DIGEST = re.compile(r'[0-9a-f]{64}')


def check_pin(pin: dict, release_tag: str) -> dict:
    """Schema 3 of the half pin (analysis/half-release.json): `half.key` and `links.key` name the snapshot and the link
    build (the identities the policy and the reviewed counts are keyed by); `private_tag` and `doi` are provenance and may
    be null; `links.applies_to` is the snapshot the link build's half record ids are joined to; `stamps.reference` is the
    pinned cross-check of the verified stamps; `links.extract_content_sha256` is null until the extract is cut and pinned
    (a builder then refuses). Returns the pin."""
    if pin.get('schema_version') != PIN_SCHEMA:
        fail(f"analysis/half-release.json is schema {pin.get('schema_version')}, the builders read schema {PIN_SCHEMA}")
    if pin['marathon_release'] != release_tag:
        fail(f"analysis/half-release.json binds marathon release {pin['marathon_release']}, but the adopted release is {release_tag}")
    for part in ('half', 'links'):
        x = pin[part]
        if not (isinstance(x.get('key'), str) and _KEY.fullmatch(x['key']) and isinstance(x.get('tag'), str) and _KEY.fullmatch(x['tag'])):
            fail(f'analysis/half-release.json {part}: a tag and a key are required')
        if x.get('private_tag') is not None and not (isinstance(x['private_tag'], str) and _KEY.fullmatch(x['private_tag'])):
            fail(f'analysis/half-release.json {part}.private_tag: a release name or null')
        if not x.get('assets') or not all(isinstance(d, str) and _DIGEST.fullmatch(d) and '/' not in n for n, d in x['assets'].items()):
            fail(f'analysis/half-release.json {part}.assets: names and sha256 digests')
    if pin['half'].get('doi') is not None and not isinstance(pin['half']['doi'], str):
        fail('analysis/half-release.json half.doi: a DOI or null')
    if not _DIGEST.fullmatch(pin['half'].get('sqlite_sha256') or ''):
        fail('analysis/half-release.json half.sqlite_sha256: a sha256 digest')
    if pin['links']['applies_to'] != pin['half']['key']:
        fail('the pinned link build does not apply to the pinned half snapshot (links.applies_to is not half.key)')
    cov = pin['links'].get('coverage') or {}
    if not all(isinstance(cov.get(k), int) and cov[k] > 0 for k in ('half_rows', 'half_max_record_id', 'marathon_rows')):
        fail('analysis/half-release.json links.coverage: the link build\'s half rows, half record id boundary and marathon rows')
    digest = pin['links'].get('extract_content_sha256')
    if digest is not None and not _DIGEST.fullmatch(digest):
        fail('analysis/half-release.json links.extract_content_sha256: a sha256 digest or null')
    ref = (pin.get('stamps') or {}).get('reference') or {}
    if not (_KEY.fullmatch(ref.get('tag') or '') and ref.get('asset') and all(_DIGEST.fullmatch(ref.get(k) or '') for k in ('sha256', 'readme_sha256'))):
        fail('analysis/half-release.json stamps.reference: a release tag, asset, sha256 and readme_sha256')
    return pin


def load_pin() -> dict:
    """The half pin, checked (check_pin) and bound to the adopted marathon release (the link record ids follow it)."""
    pin = json.loads(PIN_PATH.read_text())
    release = json.loads(RELEASE_PATH.read_text())
    return check_pin(pin, release['tag'])


def pinned_digest(pin: dict, key: str = 'extract_content_sha256') -> str:
    """links.extract_content_sha256, refusing a pin that has none yet."""
    digest = pin['links'].get(key)
    if digest is None:
        fail('the pin holds no links extract digest yet: cut the extract with python3 -I analysis/half_links_extract.py --pin')
    return digest


def snapshot_date(pin: dict) -> str:
    """The snapshot's date, YYYY-MM-DD, from half.key (…-YYYYMMDD-HHMM)."""
    m = re.search(r'(\d{4})(\d{2})(\d{2})-\d{4}$', pin['half']['key'])
    if not m:
        fail(f"cannot read a date from the half snapshot key {pin['half']['key']}")
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}'


def wal_paths(path) -> list[Path]:
    """The -wal files a read of `path` may use: beside the path given and, when it is a symlink, beside the file it
    resolves to, which is where SQLite (DuckDB's scanner and node:sqlite alike) looks (verify round 2, October 31, 2026:
    a symlinked snapshot whose target had a non-empty -wal passed a guard that looked only beside the link)."""
    given, real = Path(path), Path(path).resolve()
    return [Path(f'{p}-wal') for p in dict.fromkeys([given, real])]


def check_no_wal(path) -> None:
    """A WAL-mode SQLite with a non-empty -wal beside it holds rows the main file does not; DuckDB's sqlite scanner cannot
    open it immutable, so a builder refuses it (review R13, 2026-10-31), wherever a symlink leads."""
    for wal in wal_paths(path):
        if wal.exists() and wal.stat().st_size > 0:
            fail(f'{wal} is not empty: the snapshot has uncommitted pages beside it; restore the pinned file (download_half.py)')


def inside(path, parent) -> bool:
    try:
        Path(path).resolve().relative_to(Path(parent).resolve())
        return True
    except ValueError:
        return False


def connect(half: Path | None = None, links: Path | None = None):
    """A DuckDB connection with the half snapshot attached as `h` and the links extract as `l`, both read-only.

    Settings come from the environment: PACE_HALF_DUCKDB_THREADS (default 2), PACE_HALF_DUCKDB_MEMORY (default 4GB),
    PACE_HALF_DUCKDB_MAX_TEMP (the spill cap, default 4GB, as in analysis/half_links_extract.py; review R13) and TMPDIR
    for spill files (no temp file the builder leaves behind).
    """
    import duckdb
    db = duckdb.connect()
    db.execute(f"SET threads={int(os.environ.get('PACE_HALF_DUCKDB_THREADS', '2'))}")
    sizes = {}
    for name in ('PACE_HALF_DUCKDB_MEMORY', 'PACE_HALF_DUCKDB_MAX_TEMP'):
        sizes[name] = os.environ.get(name, '4GB')
        if not re.fullmatch(r'\d+(\.\d+)?\s*[KMGT]i?B', sizes[name]):
            fail(f'{name} must look like 4GB, not {sizes[name]!r}')
    db.execute(f"SET memory_limit='{sizes['PACE_HALF_DUCKDB_MEMORY']}'")
    spill = (os.environ.get('TMPDIR') or tempfile.gettempdir()).replace("'", "''")
    db.execute(f"SET temp_directory='{spill}'")
    db.execute(f"SET max_temp_directory_size='{sizes['PACE_HALF_DUCKDB_MAX_TEMP']}'")
    db.execute('SET preserve_insertion_order=false')
    if half is not None or links is not None:
        db.execute('INSTALL sqlite')
        db.execute('LOAD sqlite')
    for alias, path in (('h', half), ('l', links)):
        if path is None:
            continue
        path = Path(path)
        if not path.is_file():
            fail(f'missing {path}')
        if inside(path, ROOT):
            fail(f'{path} is inside the repository; record-level sources stay outside it (pages publish aggregates)')
        check_no_wal(path)
        quoted = path.as_posix().replace("'", "''")
        db.execute(f"ATTACH '{quoted}' AS {alias} (TYPE sqlite, READ_ONLY)")
    return db


# Times in the snapshot are `H…:MM:SS` strings (any number of hour digits, no fractions). Anything else is unparsed.
TIME_PATTERN = r'[0-9]+:[0-9]{2}:[0-9]{2}'
_TIME_RE = re.compile(TIME_PATTERN)


def secs_sql(column: str) -> str:
    """SQL: seconds of an `H…:MM:SS` text column, NULL when it does not match (DuckDB)."""
    return (f"(CASE WHEN regexp_full_match({column}, '{TIME_PATTERN}') THEN "
            f"CAST(split_part({column}, ':', 1) AS DOUBLE) * 3600 + CAST(split_part({column}, ':', 2) AS DOUBLE) * 60 + "
            f"CAST(split_part({column}, ':', 3) AS DOUBLE) END)")


def parse_time(value):
    """Python twin of secs_sql: seconds, or None when the string is not `H…:MM:SS`."""
    if not isinstance(value, str) or not _TIME_RE.fullmatch(value):
        return None
    h, m, s = value.split(':')
    return float(h) * 3600 + float(m) * 60 + float(s)


def sh(value) -> float:
    """A share as published: SHARE_DIGITS digits, so a page rounds once from the exact value."""
    value = float(value)
    if not math.isfinite(value):
        fail('a non-finite share reached a published file')
    return round(value, SHARE_DIGITS)


def sec(value):
    """Seconds as published: an integer, or one decimal where a median or quantile falls between two values."""
    value = float(value)
    if not math.isfinite(value):
        fail('a non-finite time reached a published file')
    whole = round(value)
    if abs(value - whole) < 1e-9:
        return int(whole)
    out = round(value, 1)
    return int(out) if out == int(out) else out


def encode(value) -> bytes:
    """Deterministic JSON: sorted keys, no NaN, compact separators, one trailing newline."""
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')) + '\n').encode()


# ---------------------------------------------------------------------------------------------------------------
# What may appear in a published file (spec 1.5)
# ---------------------------------------------------------------------------------------------------------------

# verify-charts' identityKey, plus the half identifiers.
IDENTITY_KEY = re.compile(r'^(ids?|rids?|record_?ids?|profile_?ids?|runners?|runner_?ids?|bibs?|bib_?(no|number)|names?|'
                          r'(full|first|last|given|family)_?names?|participants?|participant_?ids?|persons?|person_?ids?|'
                          r'edition_?ids?|h_record_id|m_record_id|series_key|urls?|source_url)$', re.I)
# Strings are allowed only under these keys (and anywhere inside a `rule`); `sha256`-like keys must hold a digest.
STRING_KEYS = {'city', 'label', 'mark', 'scope', 'family', 'file', 'weighting', 'id', 'slug', 'path'}
DIGEST_KEYS = {'sha256', 'module_sha256'}
# `id` is allowed only for the flagship's battery members (spec 2.4), never a record or person id. verified_federation
# and verified_road were pre-registered on 2026-10-30 (analysis/half_quality.BATTERY_RULES).
BATTERY_IDS = {'pooled', 'verified_halves', 'verified_federation', 'verified_road', 'other_marathons', 'ns_keys_1',
               'one_per_person', 'editions_equal_20', 'editions_equal_100', 'city_equal'}
# The one place a published file names an edition: the worst one-verified-half-edition-out variant of each clause, by the
# snapshot's integer edition id (no label), under linked.json checks.battery.leave_outs.<member>.worst.<clause>.
HALF_EDITION_KEY = 'half_edition'
HALF_EDITION_AT = re.compile(r'\.checks\.battery\.leave_outs\.(verified_halves|verified_federation)\.worst\.[a-z_]+$')
RELEASE_LABEL = re.compile(r'private-export|half-snapshot-|half-dataset-|runner-links-|person-ids-|htw-db-|20260912|20261016|20261021|20261029|20261030|master-[0-9]{8}|20261103')


def check_published(value, where: str, *, in_rule: bool = False, extra_string_keys: frozenset = frozenset()) -> None:
    """Finite numbers; no identifier keys; strings only under allow-listed keys; no release labels; the open tails of
    every binned count (`under_lo`, `at_or_over_hi`) at least MIN_CELL. The other floors (at least MIN_CELL finishes or
    pairs, MIN_EDITIONS editions) are checked by each builder where it forms a group."""
    if isinstance(value, dict):
        for tail in ('under_lo', 'at_or_over_hi'):
            if tail in value and not (isinstance(value[tail], int) and value[tail] >= MIN_CELL):
                fail(f'{where}.{tail}: an open tail under {MIN_CELL} ({value[tail]!r})')
        for key, item in value.items():
            if not isinstance(key, str):
                fail(f'{where}: a non-string key')
            if key == 'id':
                if item not in BATTERY_IDS:
                    fail(f'{where}.id: only the battery member ids may use the key "id" ({item!r})')
            elif key == HALF_EDITION_KEY:
                if not (type(item) is int and item >= 0 and HALF_EDITION_AT.search(where)):
                    fail(f'{where}.{key}: an edition id is allowed only as an integer naming a worst leave-out variant ({item!r})')
            elif IDENTITY_KEY.match(key):
                fail(f'{where}.{key}: an identifier or name key')
            if isinstance(item, str):
                if key in DIGEST_KEYS:
                    if not re.fullmatch(r'[0-9a-f]{64}', item):
                        fail(f'{where}.{key}: not a sha256 digest')
                elif not (in_rule or key == 'rule' or key in STRING_KEYS or key in extra_string_keys):
                    fail(f'{where}.{key}: a string under a key that may not hold one ({item!r})')
                if RELEASE_LABEL.search(item):
                    fail(f'{where}.{key}: a release tag in a published family file')
            check_published(item, f'{where}.{key}', in_rule=in_rule or key == 'rule', extra_string_keys=extra_string_keys)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            if isinstance(item, str) and not in_rule:
                fail(f'{where}[{i}]: a bare string in a list')
            check_published(item, f'{where}[{i}]', in_rule=in_rule, extra_string_keys=extra_string_keys)
    elif isinstance(value, bool) or value is None or isinstance(value, (int, str)):
        return
    elif isinstance(value, float):
        if not math.isfinite(value):
            fail(f'{where}: a non-finite number')
    else:
        fail(f'{where}: {type(value).__name__} reached a published file (convert NumPy values with int() or float())')
