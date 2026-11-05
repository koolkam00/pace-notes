"""Adapt a pinned `master-*` release into the marathon input folder the existing builders read unchanged.

    python3 -I analysis/adapt_master.py --output DIR [--bundle CORE|FULL] [--from-dir DIR ...] [--baseline-dir DIR]

A `master-*` release (first `master-20261103b`, November 3, 2026) is one results table for both distances
(`master_results_FULL.parquet`, with a `distance` column), an edition table (`editions.csv`) and the producer's QA files.
It has no hourly weather, course profiles, `features.parquet`, `MANIFEST.json` or per-edition documents, so the builders
cannot read it directly. This adapter turns the pinned assets into a folder with the members, column order and types of
a `pace-notes-*` input (the October 21 1050 export is the model), and proves at run time that it is faithful:

1. **Download** every asset the pin (`analysis/release.json`, `layout: master`) names, anonymously from
   `https://github.com/<repository>/releases/download/<tag>/<asset>` (never api.github.com, no token). Each release's own
   `SHA256SUMS` must have the pinned digest and list every pinned asset with the pinned digest, and every file must hash
   to it. The overlays (hourly weather, courses, edition metadata, record flags, sources) come the same way from the
   pin's `overlays` release, and the 1050 CORE archive (`baseline`) is checked against the pin and 1050's release
   checksum file. `--from-dir` takes folders already filled from those releases (with their `SHA256SUMS`, or for the
   baseline a folder from `download_release.py --bundle CORE --tag <baseline tag>`), checked the same way.
2. **Reconcile, failing loudly** (a failure removes every member already written, so no partial folder is left): the QA report's totals and schema; the `record_uid`,
   `edition_uid`, distance and source-database contract of every marathon row; `editions.csv` and
   `MANIFEST_editions.csv` row counts edition by edition; the producer's own flag derivation (`code/build.py`) and the
   overlay flag table; the edition table against the overlay edition metadata, weather and course elevation; the
   overlays against the baseline's members where this release is reviewed to repeat them; and a per-edition checksum
   delta against the baseline's `EDITION-CHECKSUMS.csv` that fails on any edition not on the reviewed list (`REVIEWED`).
3. **Write** `race_records.parquet` (the CORE marathon rows, `in_core`, in 1050's columns and types, ordered by id),
   the overlays in 1050's schemas (the baseline's own bytes where the values are equal, so pinned hashes such as the
   course-terrain registry's stay valid), an identity subset `features.parquet` (FULL; record id, labels, section and
   cumulative minutes from the raw strings, the producer's `person_id` as the cross-race key under the frozen `IDENTITY`
   rule, a `link_preliminary` flag, and a reviewed race date where the weather has none), and documents that say on their first line
   that they are adapter outputs, not producer claims: `MANIFEST.json`, `EDITIONS.json`, `races_summary.json`,
   `EDITION-CHECKSUMS.csv`, `RECONCILIATION.json`, `CHANGE-REPORT.md`, `ID-CONTRACT.md`, `MATCHING.md`,
   `FEATURE-FIELD-NOTES.md`, `README.md` and `SHA256SUMS.txt`; then `provenance.json`.

The verified source files stay in `<output>/master-assets`, `<output>/overlay-assets` and `<output>/baseline` (runner
context re-hashes the master parquet against `provenance.asset_sha256`). Every member is deterministic: two runs on the
same pin give the same bytes. No value is inferred: a missing split stays missing, `X` and null sex stay unrecorded (as
in 1050's features), and records the `IDENTITY` rule gives no `person_id` get no cross-race key.
About 1.0 GB of disk beside the 0.54 GB master parquet; DuckDB is capped at `PACE_NOTES_ADAPT_MEMORY` (default 6GB).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
import time
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb  # noqa: E402

ADAPTER_VERSION = 2
# Version 2 (2026-11-05, owner decision: "Everywhere", and for New York 2026 "Use them, labelled"): the cross-race key in
# features.parquet is the producer's person_id, not the v1 runner_id, and New York 2026 has a reviewed race date.
# The identity rule, frozen before any outcome was computed (2026-11-05): a record's key is its person_id when its link
# version is the v4 build and its confidence is high, medium or low, or when its version is the New York 2026
# preliminary build (which has no confidence). `low_series_name_only` links (a name and a sex with no age key, weaker
# than the v1 key ever was) leave the record without a key. Any other version or confidence value stops the adapter.
IDENTITY = {
    'master-20261103b': {
        'versions': {'v4_20261030': ['high', 'medium', 'low']},
        'preliminary_versions': ['nyc2026_incremental_preliminary'],
        'unkeyed_confidences': ['low_series_name_only', 'withheld_too_many_candidates'],
    },
}
RACE_DATES_PATH = Path(__file__).with_name('reviewed-race-dates.json')
MASTER_TAG = re.compile(r'master-[0-9]{8}[a-z]?')
DOWNLOAD_HOST = 'github.com'
USER_AGENT = 'pace-notes-adapt-master'
PIN_PATH = Path(__file__).with_name('release.json')
SOURCE_DIR, OVERLAY_DIR, BASELINE_DIR = 'master-assets', 'overlay-assets', 'baseline'
LABEL = 'Adapter output (analysis/adapt_master.py), not a producer document.'

FIELDS = ['split_5km', 'split_10km', 'split_15km', 'split_20km', 'split_25km', 'split_30km', 'split_35km', 'split_40km',
          'split_42_2km']
# 1050's race_records.parquet: these columns, in this order (docs/REFRESH_20261021_1050.md).
RACE_RECORDS = [('id', 'BIGINT'), ('race', 'VARCHAR'), ('year', 'BIGINT'), ('city', 'VARCHAR'), ('runner', 'VARCHAR'),
                ('sex', 'VARCHAR'), ('age', 'DOUBLE'), ('age_group', 'VARCHAR')] + [(f, 'VARCHAR') for f in FIELDS] + [
                ('source_url', 'VARCHAR'), ('ingested_at', 'VARCHAR'), ('age_or_group', 'VARCHAR')]
# The overlays in 1050's parquet schemas (column order and types), read from the producer's CSV export.
OVERLAY_SCHEMAS = {
    'race_conditions': [
        ('id', 'BIGINT'), ('city', 'VARCHAR'), ('year', 'BIGINT'), ('race', 'VARCHAR'), ('race_date', 'VARCHAR'),
        ('start_local', 'VARCHAR'), ('timezone', 'VARCHAR'), ('lat', 'DOUBLE'), ('lon', 'DOUBLE'), ('temp_c', 'DOUBLE'),
        ('feels_like_c', 'DOUBLE'), ('dewpoint_c', 'DOUBLE'), ('humidity_pct', 'DOUBLE'), ('wind_mps', 'DOUBLE'),
        ('wind_dir_deg', 'DOUBLE'), ('precip_mm', 'DOUBLE'), ('weather_code', 'BIGINT'), ('pressure_hpa', 'DOUBLE'),
        ('cloud_pct', 'DOUBLE'), ('source', 'VARCHAR'), ('source_url', 'VARCHAR'), ('observed_at', 'VARCHAR'),
        ('hourly_json', 'VARCHAR'), ('notes', 'VARCHAR'), ('updated_at', 'VARCHAR'), ('source_kind', 'VARCHAR'),
        ('station_id', 'VARCHAR'), ('station_name', 'VARCHAR'), ('station_distance_km', 'DOUBLE'),
        ('exposure_window_start_local', 'VARCHAR'), ('exposure_window_end_local', 'VARCHAR'),
        ('temp_c_win_mean', 'DOUBLE'), ('temp_c_win_max', 'DOUBLE'), ('dewpoint_c_win_mean', 'DOUBLE'),
        ('humidity_win_mean', 'DOUBLE'), ('wind_kmh_win_mean', 'DOUBLE'), ('precip_mm_win_sum', 'DOUBLE')],
    'course_profiles': [
        ('id', 'BIGINT'), ('city', 'VARCHAR'), ('race', 'VARCHAR'), ('course_key', 'VARCHAR'), ('valid_from_year', 'DOUBLE'),
        ('valid_to_year', 'INTEGER'), ('distance_km', 'DOUBLE'), ('elev_gain_m', 'DOUBLE'), ('elev_loss_m', 'DOUBLE'),
        ('elev_min_m', 'DOUBLE'), ('elev_max_m', 'DOUBLE'), ('start_lat', 'DOUBLE'), ('start_lon', 'DOUBLE'),
        ('finish_lat', 'DOUBLE'), ('finish_lon', 'DOUBLE'), ('points_json', 'VARCHAR'), ('source', 'VARCHAR'),
        ('source_url', 'VARCHAR'), ('notes', 'VARCHAR'), ('updated_at', 'VARCHAR'), ('segments_json', 'VARCHAR')],
    'course_segments': [
        ('id', 'BIGINT'), ('city', 'VARCHAR'), ('course_key', 'VARCHAR'), ('race', 'VARCHAR'), ('seg_from_km', 'DOUBLE'),
        ('seg_to_km', 'DOUBLE'), ('elev_gain_m', 'DOUBLE'), ('elev_loss_m', 'DOUBLE'), ('elev_net_m', 'DOUBLE'),
        ('elev_min_m', 'DOUBLE'), ('elev_max_m', 'DOUBLE'), ('elev_mean_m', 'DOUBLE'), ('gain_m', 'DOUBLE'),
        ('loss_m', 'DOUBLE'), ('net_m', 'DOUBLE'), ('avg_grade', 'DOUBLE'), ('max_grade', 'DOUBLE'), ('n_points', 'BIGINT'),
        ('source', 'VARCHAR'), ('updated_at', 'VARCHAR')],
    'sources': [
        ('id', 'BIGINT'), ('race', 'VARCHAR'), ('city', 'VARCHAR'), ('paper_city', 'VARCHAR'), ('year', 'BIGINT'),
        ('url', 'VARCHAR'), ('url_scope', 'VARCHAR'), ('url_as_published', 'VARCHAR'), ('timing_vendor', 'VARCHAR'),
        ('format', 'VARCHAR'), ('last_ingested', 'VARCHAR'), ('has_5km_splits', 'VARCHAR'), ('corpus', 'VARCHAR'),
        ('notes', 'VARCHAR')],
    'edition_meta': [
        ('id', 'BIGINT'), ('city', 'VARCHAR'), ('year', 'BIGINT'), ('official_finishers', 'DOUBLE'),
        ('official_source_url', 'VARCHAR'), ('official_source_type', 'VARCHAR'), ('official_checked_at', 'VARCHAR'),
        ('db_count_at_check', 'BIGINT'), ('checked_at', 'VARCHAR'), ('completeness_status', 'VARCHAR'),
        ('completeness_reason', 'VARCHAR'), ('tolerance_pct', 'DOUBLE'), ('wave_starts_json', 'VARCHAR'),
        ('timing_basis', 'VARCHAR'), ('timing_basis_evidence', 'VARCHAR'), ('age_basis', 'VARCHAR'),
        ('course_notes', 'VARCHAR'), ('updated_at', 'VARCHAR')],
    'record_flags': [
        ('record_id', 'BIGINT'), ('city', 'VARCHAR'), ('year', 'BIGINT'), ('division', 'VARCHAR'),
        ('division_evidence', 'VARCHAR'), ('dnf_split_as_finish', 'DOUBLE'), ('split_nonmonotonic', 'DOUBLE'),
        ('last_split_after_finish', 'DOUBLE'), ('pace_implausible', 'DOUBLE'), ('shifted_mat', 'VARCHAR'),
        ('age_is_group_floor', 'DOUBLE'), ('sex_fixed_from_category', 'DOUBLE'), ('splits_corrected', 'DOUBLE'),
        ('note', 'VARCHAR'), ('updated_at', 'VARCHAR')],
}
OVERLAY_KEYS = {'race_conditions': 'id', 'course_profiles': 'id', 'course_segments': 'id', 'sources': 'id',
                'edition_meta': 'id', 'record_flags': 'record_id'}
OVERLAY_ASSET = 'marathon-{}.csv.zst'
MASTER_ASSETS = {'master_results_FULL.parquet', 'editions.csv', 'MANIFEST_editions.csv',
                 'marathon_record_flags_detail.parquet', 'sources.csv', 'README.md', 'DATA_DICTIONARY.md', 'CHANGELOG.md',
                 'QA-REPORT.json', 'NYC2026_rows_missing_splits.csv'}
BASELINE_MEMBERS = ['MANIFEST.json', 'SHA256SUMS.txt', 'EDITION-CHECKSUMS.csv', 'EDITIONS.json', 'race_conditions.parquet',
                    'course_profiles.parquet', 'course_segments.parquet', 'edition_meta.parquet', 'record_flags.parquet']

DATA_MEMBERS = ['race_records.parquet', 'race_conditions.parquet', 'course_profiles.parquet', 'course_segments.parquet',
                'sources.parquet', 'edition_meta.parquet', 'record_flags.parquet']
DOC_MEMBERS = ['EDITIONS.json', 'races_summary.json', 'EDITION-CHECKSUMS.csv', 'RECONCILIATION.json', 'CHANGE-REPORT.md',
               'ID-CONTRACT.md', 'MATCHING.md', 'FEATURE-FIELD-NOTES.md', 'README.md']
# The members a master-layout input holds (CORE); FULL adds features.parquet. provenance.json is local, as for every layout.
EXPECTED_MASTER = set(DATA_MEMBERS) | set(DOC_MEMBERS) | {'MANIFEST.json', 'SHA256SUMS.txt'}
EXPECTED_MASTER_FULL = EXPECTED_MASTER | {'features.parquet'}
CHECKSUM_COLUMNS = [name for name, _ in RACE_RECORDS]
CHECKSUM_METHOD = ('sha256 over the edition rows ordered by id, each row serialized as a compact JSON array of all '
                   'race_records columns + newline (the producer’s method, 1050 MANIFEST.json)')

# What a review of each master release accepted (docs/REFRESH_20261103b.md). Anything else fails the run.
# - changed / added / removed: editions whose per-edition producer checksum differs from the baseline's, is new, or is gone.
# - baseline_equal: overlays whose values must equal the baseline member; its bytes are then kept.
# - edition_meta_changed: editions whose overlay edition metadata may differ from the baseline's (statuses re-checked).
# - flags_changed: editions whose record-flag rows may differ from the baseline's.
# - no_overlay_meta: editions that have editions.csv metadata but no overlay edition_meta row.
# - excluded: editions out of CORE (in_core false), the only rows the adapter leaves out.
REVIEWED = {
    'master-20261103b': {
        'changed': [('Amsterdam', 2023)], 'added': [('New York', 2026)], 'removed': [],
        'baseline_equal': ['race_conditions', 'course_profiles', 'course_segments'],
        'edition_meta_changed': [('Amsterdam', 2023), ('New York', 2008)],
        'flags_changed': [('Amsterdam', 2023)],
        'no_overlay_meta': [('New York', 2026)],
        'excluded': [('Amsterdam', 2020)],
    },
}


class AdaptError(RuntimeError):
    pass


def fail(message):
    raise AdaptError(message)


def file_sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def is_digest(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def parse_sums(text, where='SHA256SUMS'):
    """A `sha256sum` listing, {name: digest}; a leading `./` (master's form) is dropped, any other path is refused."""
    listed = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            fail(f'{where}: malformed line')
        digest, name = parts[0], parts[1].strip().lstrip('*')
        name = name[2:] if name.startswith('./') else name
        if not is_digest(digest) or not name or name in listed:
            fail(f'{where}: malformed or repeated line for {name!r}')
        listed[name] = digest
    return listed


# ---------------------------------------------------------------------------------------------------------------
# The pin
# ---------------------------------------------------------------------------------------------------------------

def check_pin(pin):
    """The pin's shape: a master tag, every asset with a digest, the overlays and the baseline named in full."""
    if pin.get('layout') != 'master' or not MASTER_TAG.fullmatch(pin.get('tag', '')):
        fail('the pin is not a master-layout release (analysis/release.json layout "master", tag master-YYYYMMDD[a-z])')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', pin.get('repository', '')):
        fail('the pin names no repository')
    for key in ('sha256sums_sha256',):
        if not is_digest(pin.get(key)):
            fail(f'the pin has no {key}')
    if set(pin.get('assets', {})) != MASTER_ASSETS or not all(is_digest(v) for v in pin['assets'].values()):
        fail(f'the pin must list exactly these master assets with digests: {sorted(MASTER_ASSETS)}')
    overlays = pin.get('overlays', {})
    wanted = {OVERLAY_ASSET.format(name) for name in OVERLAY_SCHEMAS}
    if (not re.fullmatch(r'[A-Za-z0-9_.-]+', overlays.get('tag', '')) or not is_digest(overlays.get('sha256sums_sha256'))
            or set(overlays.get('assets', {})) != wanted or not all(is_digest(v) for v in overlays['assets'].values())):
        fail(f'the pin must name the overlay release, its SHA256SUMS digest and exactly {sorted(wanted)}')
    baseline = pin.get('baseline', {})
    if (not re.fullmatch(r'[A-Za-z0-9_.-]+', baseline.get('tag', '')) or not str(baseline.get('asset', '')).endswith('.tar.gz')
            or not is_digest(baseline.get('sha256')) or not is_digest(baseline.get('checksums_sha256'))
            or not baseline.get('checksums_asset')):
        fail('the pin must name the baseline release, its CORE archive and checksum file with digests')
    if pin['tag'] not in REVIEWED:
        fail(f"{pin['tag']} has no reviewed adapter expectations (REVIEWED in analysis/adapt_master.py)")
    return pin


def load_pin(path=PIN_PATH):
    return check_pin(json.loads(Path(path).read_text()))


# ---------------------------------------------------------------------------------------------------------------
# Anonymous downloads (github.com release URLs only, never api.github.com, no Authorization header)
# ---------------------------------------------------------------------------------------------------------------

def public_url(repo, tag, name):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'[A-Za-z0-9_.-]+', tag):
        fail(f'not a public release address: {repo} {tag}')
    return f'https://{DOWNLOAD_HOST}/{repo}/releases/download/{tag}/{quote(name)}'


def public_request(url):
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname != DOWNLOAD_HOST or '/releases/download/' not in parts.path:
        fail(f'{url}: downloads go to public github.com release URLs only')
    return Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/octet-stream'})


def _opener():
    return build_opener()


def download(url, destination, expected_sha256):
    """Stream one public asset to `destination`, checking its digest; nothing is left behind on a mismatch."""
    digest = hashlib.sha256()
    tmp = destination.with_name(destination.name + '.download')
    try:
        with _opener().open(public_request(url), timeout=120) as response, tmp.open('wb') as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
                digest.update(chunk)
        if digest.hexdigest() != expected_sha256:
            fail(f'{destination.name}: the downloaded bytes differ from the pinned sha256')
        os.replace(tmp, destination)
    finally:
        tmp.unlink(missing_ok=True)


def place(source, destination):
    """Put a verified file from a --from-dir folder in place: a hard link when possible, else a copy."""
    destination.unlink(missing_ok=True)
    try:
        os.link(source, destination)
    except OSError:
        shutil.copyfile(source, destination)


def fetch_release(repo, tag, sums_name, sums_sha256, assets, folder, from_dirs):
    """Every pinned asset of one release in `folder`: its SHA256SUMS has the pinned digest and lists each asset with the
    pinned digest, and each file hashes to it. Read from a --from-dir folder whose SHA256SUMS is the pinned one, else
    downloaded anonymously."""
    folder.mkdir(parents=True, exist_ok=True)
    origin = next((d for d in from_dirs if (d / sums_name).is_file() and file_sha256(d / sums_name) == sums_sha256), None)
    target = folder / sums_name
    if origin is not None:
        place(origin / sums_name, target)
    elif not (target.is_file() and file_sha256(target) == sums_sha256):
        download(public_url(repo, tag, sums_name), target, sums_sha256)
    listed = parse_sums(target.read_text(), f'{tag}/{sums_name}')
    for name, digest in assets.items():
        if listed.get(name) != digest:
            fail(f'release {tag}: its {sums_name} does not list {name} with the pinned digest')
    found = {}
    for name, digest in assets.items():
        path = folder / name
        if not (path.is_file() and file_sha256(path) == digest):
            if origin is not None:
                if not (origin / name).is_file() or file_sha256(origin / name) != digest:
                    fail(f'{origin / name} is missing or differs from the pinned digest')
                place(origin / name, path)
            else:
                download(public_url(repo, tag, name), path, digest)
        found[name] = path
    return found


def baseline_members(pin, root, from_dirs, baseline_dir=None):
    """The baseline CORE members the reconciliation reads, each checked against the baseline's own SHA256SUMS.txt and
    MANIFEST.json, whose archive is the pinned one (by its digest and the release checksum file)."""
    base = pin['baseline']
    folder = root / BASELINE_DIR
    folder.mkdir(parents=True, exist_ok=True)
    if baseline_dir is not None:
        provenance = json.loads((baseline_dir / 'provenance.json').read_text())
        if (provenance.get('release_tag') != base['tag'] or provenance.get('asset') != base['asset']
                or provenance.get('asset_sha256') != base['sha256']):
            fail(f'{baseline_dir} is not the pinned baseline ({base["tag"]} {base["asset"]})')
        for name in BASELINE_MEMBERS:
            place(baseline_dir / name, folder / name)
    else:
        sums = fetch_release(pin['repository'], base['tag'], base['checksums_asset'], base['checksums_sha256'],
                             {base['asset']: base['sha256']}, folder, from_dirs)
        archive = sums[base['asset']]
        with tarfile.open(archive, 'r:gz') as tar:
            seen = set()
            for member in tar:
                name = Path(member.name).name
                if member.isdir() or name not in BASELINE_MEMBERS:
                    continue
                if not member.isfile() or name in seen:
                    fail(f'the baseline archive has an invalid or repeated member {name}')
                with tar.extractfile(member) as source, (folder / name).open('wb') as target:
                    shutil.copyfileobj(source, target)
                seen.add(name)
        archive.unlink()
    listed = parse_sums((folder / 'SHA256SUMS.txt').read_text(), 'baseline SHA256SUMS.txt')
    manifest = json.loads((folder / 'MANIFEST.json').read_text())
    for name in BASELINE_MEMBERS:
        if name == 'SHA256SUMS.txt':
            continue
        digest = file_sha256(folder / name)
        if listed.get(name) != digest or (name != 'MANIFEST.json' and manifest['files'].get(name, {}).get('sha256') != digest):
            fail(f'baseline {name} differs from its SHA256SUMS.txt or MANIFEST.json')
    return folder, manifest


# ---------------------------------------------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------------------------------------------

_STARTED = time.monotonic()


def step(label):
    """A progress line on stderr (elapsed seconds), so a slow step is visible."""
    print(f'[adapt_master {time.monotonic() - _STARTED:7.1f}s] {label}', file=sys.stderr, flush=True)


def scalar(db, query, params=None):
    return db.execute(query, params or []).fetchone()[0]


def rows(db, query, params=None):
    result = db.execute(query, params or [])
    names = [c[0] for c in result.description]
    return [dict(zip(names, row)) for row in result.fetchall()]


def editions(pairs):
    return sorted(f'{city} {year}' for city, year in pairs)


def literal(path):
    return "'" + str(path).replace("'", "''") + "'"


SECONDS = r"""CREATE OR REPLACE MACRO seconds(s) AS (
  CASE WHEN regexp_full_match(trim(s), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9](\.[0-9]+)?')
    THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*3600
       + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)*60
       + try_cast(split_part(trim(s), ':', 3) AS DOUBLE)
  WHEN regexp_full_match(trim(s), '[0-9]{1,4}:[0-5][0-9](\.[0-9]+)?')
    THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*60
       + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)
  ELSE NULL END)"""
# The producer's marathon flag string (master code/build.py, table mflags), from the wide flag table.
FLAG_STRING = """nullif(concat_ws(',',
 CASE WHEN division IS NOT NULL THEN 'division:'||division END, CASE WHEN dnf_split_as_finish=1 THEN 'dnf_split_as_finish' END,
 CASE WHEN split_nonmonotonic=1 THEN 'split_nonmonotonic' END, CASE WHEN last_split_after_finish=1 THEN 'last_split_after_finish' END,
 CASE WHEN pace_implausible=1 THEN 'pace_implausible' END, CASE WHEN shifted_mat IS NOT NULL THEN 'shifted_mat:'||shifted_mat END,
 CASE WHEN age_is_group_floor=1 THEN 'age_is_group_floor' END, CASE WHEN sex_fixed_from_category=1 THEN 'sex_fixed_from_category' END,
 CASE WHEN splits_corrected=1 THEN 'splits_corrected' END, CASE WHEN note LIKE '%RELEASE_EXCLUDE%' THEN 'release_exclude' END),'')"""
FLAG_EXCLUDE = "(dnf_split_as_finish=1 OR pace_implausible=1 OR note LIKE '%RELEASE_EXCLUDE%')"
ARROW_TYPES = {'string': 'VARCHAR', 'int64': 'BIGINT', 'double': 'DOUBLE', 'bool': 'BOOLEAN'}


def read_overlay(db, name, path):
    """An overlay CSV read with 1050's column types (the producer writes empty fields for nulls)."""
    columns = '{' + ','.join(f"'{c}':'{t}'" for c, t in OVERLAY_SCHEMAS[name]) + '}'
    db.execute(f"""CREATE OR REPLACE TABLE ov_{name} AS SELECT * FROM read_csv({literal(path)}, header=true,
      columns={columns}, nullstr='', quote='"', escape='"', max_line_size=8000000, strict_mode=false)""")
    header = [c for c, *_ in db.execute(f"DESCRIBE SELECT * FROM read_csv({literal(path)}, header=true, all_varchar=true, "
                                        "quote='\"', escape='\"', max_line_size=8000000, strict_mode=false)").fetchall()]
    if header != [c for c, _ in OVERLAY_SCHEMAS[name]]:
        fail(f'{Path(path).name} does not have the columns of the {name} schema')


def table_difference(db, left, right, schema, key):
    """Rows only on one side, and per column the joined rows whose values differ (NULL-aware)."""
    only_left = scalar(db, f'SELECT count(*) FROM {left} l ANTI JOIN {right} r USING({key})')
    only_right = scalar(db, f'SELECT count(*) FROM {right} r ANTI JOIN {left} l USING({key})')
    changed = {}
    for column, _ in schema:
        if column == key:
            continue
        n = scalar(db, f'SELECT count(*) FROM {left} l JOIN {right} r USING({key}) WHERE l."{column}" IS DISTINCT FROM r."{column}"')
        if n:
            changed[column] = n
    return {'only_left': only_left, 'only_right': only_right, 'changed_columns': changed}


def edition_checksums(db, table):
    """{(city, year): (rows, sha256)} with the producer's method over the 1050 race_records columns."""
    out = {}
    cursor = db.execute(f'SELECT {", ".join(CHECKSUM_COLUMNS)} FROM {table} ORDER BY city, year, id')
    city_at, year_at = CHECKSUM_COLUMNS.index('city'), CHECKSUM_COLUMNS.index('year')
    age_at = CHECKSUM_COLUMNS.index('age')
    key, digest, n = None, None, 0
    while batch := cursor.fetchmany(100_000):
        for row in batch:
            row = list(row)
            here = (row[city_at], row[year_at])
            if here != key:
                if key is not None:
                    out[key] = (n, digest.hexdigest())
                key, digest, n = here, hashlib.sha256(), 0
            if row[age_at] is not None and float(row[age_at]).is_integer():
                row[age_at] = int(row[age_at])
            digest.update((json.dumps(row, separators=(',', ':'), ensure_ascii=False) + '\n').encode())
            n += 1
    if key is not None:
        out[key] = (n, digest.hexdigest())
    return out


def reconcile(db, pin, master, overlays, baseline):
    """Every check before anything is written; returns the reconciliation record, or fails with the first breach."""
    review = REVIEWED[pin['tag']]
    report = {'document': LABEL, 'tag': pin['tag'], 'checks': {}}
    checks = report['checks']
    qa = json.loads(master['QA-REPORT.json'].read_text())
    db.execute(f"CREATE OR REPLACE VIEW m AS SELECT * FROM read_parquet({literal(master['master_results_FULL.parquet'])}) WHERE distance='marathon'")
    step('QA totals and schema')
    # 1. QA totals and schema.
    schema = [(c, t) for c, t, *_ in db.execute(f"DESCRIBE SELECT * FROM read_parquet({literal(master['master_results_FULL.parquet'])})").fetchall()]
    claimed = [tuple(x.split(':', 1)) for x in qa['schema']]
    if [(c, ARROW_TYPES.get(t, t)) for c, t in claimed] != schema:
        fail('master_results_FULL.parquet does not have the schema QA-REPORT.json lists')
    full, core = scalar(db, 'SELECT count(*) FROM m'), scalar(db, 'SELECT count(*) FILTER(WHERE in_core) FROM m')
    if full != qa['full_rows']['marathon'] or core != qa['core_rows']['marathon']:
        fail(f"marathon rows {full} FULL / {core} CORE differ from QA-REPORT.json {qa['full_rows']['marathon']} / {qa['core_rows']['marathon']}")
    contract = rows(db, """SELECT count(*) AS rows,
      count(*) FILTER(WHERE record_uid IS DISTINCT FROM 'M-'||source_record_id) AS uid_not_m_id,
      count(*)-count(DISTINCT source_record_id) AS repeated_or_null_id, count(*)-count(source_record_id) AS null_id,
      count(*) FILTER(WHERE distance_km IS DISTINCT FROM 42.195) AS distance_km,
      count(*) FILTER(WHERE source_db IS DISTINCT FROM 'platform.sqlite') AS source_db,
      count(*) FILTER(WHERE edition_uid IS DISTINCT FROM 'marathon|'||city||'|'||year) AS edition_uid,
      count(*) FILTER(WHERE split_21_1km IS NOT NULL OR bib IS NOT NULL OR source_runner_id IS NOT NULL) AS half_columns,
      count(*) FILTER(WHERE finish_time IS DISTINCT FROM split_42_2km) AS finish_column,
      count(*) FILTER(WHERE in_core IS NULL OR in_core IS DISTINCT FROM (verification_tier<>'excluded_from_release')) AS in_core_rule,
      count(*) FILTER(WHERE finish_time_only) AS finish_time_only FROM m""")[0]
    if any(v for k, v in contract.items() if k != 'rows'):
        fail(f'master marathon rows break the record contract: {contract}')
    if scalar(db, "SELECT count(*)-count(DISTINCT record_uid) FROM read_parquet(?)", [str(master['master_results_FULL.parquet'])]) != qa['dup_record_uid_full']:
        fail('record_uid repeats differ from QA-REPORT.json')
    nyc = scalar(db, "SELECT count(*) FROM m WHERE city='New York' AND year=2026 AND " + ' AND '.join(f'{f} IS NOT NULL' for f in FIELDS[:8]))
    if 'nyc2026_rows_with_all_8_splits' in qa and nyc != qa['nyc2026_rows_with_all_8_splits']:
        fail('New York 2026 rows with all eight splits differ from QA-REPORT.json')
    checks['qa_report'] = {'full_rows_marathon': full, 'core_rows_marathon': core, 'record_contract': contract,
                           'nyc2026_rows_with_all_8_splits': nyc}
    step('NYC 2026 missing-split list')
    # The producer's list of New York 2026 rows missing an intermediate split.
    db.execute(f"CREATE OR REPLACE TABLE nyc_missing AS SELECT * FROM read_csv({literal(master['NYC2026_rows_missing_splits.csv'])}, header=true, all_varchar=true)")
    missing = rows(db, """WITH measured AS (SELECT 'M-'||source_record_id AS record_uid,
        CASE WHEN coalesce(split_5km,split_10km,split_15km,split_20km,split_25km,split_30km,split_35km,split_40km) IS NULL THEN 'no_splits' ELSE 'partial_splits' END AS status
        FROM m WHERE city='New York' AND year=2026 AND (""" + ' OR '.join(f'{f} IS NULL' for f in FIELDS[:8]) + """))
      SELECT (SELECT count(*) FROM measured) AS measured, (SELECT count(*) FROM nyc_missing) AS listed,
        (SELECT count(*) FROM measured a FULL JOIN nyc_missing b USING(record_uid) WHERE a.status IS DISTINCT FROM b.status) AS disagree""")[0]
    if missing['disagree'] or missing['measured'] != missing['listed']:
        fail(f'NYC2026_rows_missing_splits.csv differs from the measured rows: {missing}')
    checks['nyc2026_rows_missing_splits'] = missing
    step('editions.csv and MANIFEST_editions.csv')
    # 2. editions.csv and MANIFEST_editions.csv, edition by edition.
    db.execute(f"CREATE OR REPLACE TABLE e AS SELECT * FROM read_csv({literal(master['editions.csv'])}, header=true, all_varchar=false, max_line_size=10000000) WHERE distance='marathon'")
    db.execute(f"CREATE OR REPLACE TABLE e_all AS SELECT * FROM read_csv({literal(master['editions.csv'])}, header=true, all_varchar=true, max_line_size=10000000)")
    db.execute(f"CREATE OR REPLACE TABLE me AS SELECT * FROM read_csv({literal(master['MANIFEST_editions.csv'])}, header=true, all_varchar=true)")
    counted = rows(db, """WITH c AS (SELECT city,year,count(*) AS full_n,count(*) FILTER(WHERE in_core) AS core_n,
        count(split_42_2km) AS finish_n,count(split_5km) AS k5_n,any_value(verification_tier) AS tier,
        count(DISTINCT verification_tier) AS tiers FROM m GROUP BY ALL)
      SELECT count(*) AS editions, count(*) FILTER(WHERE c.city IS NULL OR e.city IS NULL) AS unmatched,
        count(*) FILTER(WHERE e.rows_full IS DISTINCT FROM c.full_n OR e.rows_snapshot IS DISTINCT FROM c.full_n) AS rows_full,
        count(*) FILTER(WHERE e.rows_core IS DISTINCT FROM c.core_n) AS rows_core,
        count(*) FILTER(WHERE e.rows_with_finish IS DISTINCT FROM c.finish_n) AS rows_with_finish,
        count(*) FILTER(WHERE e.rows_with_5k IS DISTINCT FROM c.k5_n) AS rows_with_5k,
        count(*) FILTER(WHERE c.tiers<>1 OR e.verification_tier IS DISTINCT FROM c.tier) AS tier,
        count(*) FILTER(WHERE e.verification_tier IS DISTINCT FROM CASE e.completeness_status WHEN 'complete' THEN 'stamped'
          WHEN 'excluded' THEN 'excluded_from_release' ELSE 'unverified' END) AS tier_rule
      FROM c FULL JOIN e USING(city,year)""")[0]
    if any(v for k, v in counted.items() if k != 'editions'):
        fail(f'editions.csv disagrees with the measured marathon rows: {counted}')
    columns = [c for c, *_ in db.execute('DESCRIBE me').fetchall()]
    manifest_diff = scalar(db, f"""SELECT count(*) FROM me FULL JOIN e_all USING(edition_uid) WHERE me.edition_uid IS NULL OR e_all.edition_uid IS NULL
      OR {' OR '.join(f'me."{c}" IS DISTINCT FROM e_all."{c}"' for c in columns if c != 'edition_uid')}""")
    if manifest_diff:
        fail(f'MANIFEST_editions.csv differs from editions.csv on {manifest_diff} editions')
    excluded = [tuple(r) for r in db.execute('SELECT city, year FROM e WHERE rows_core=0 ORDER BY 1,2').fetchall()]
    partially = scalar(db, 'SELECT count(*) FROM e WHERE rows_core<>0 AND rows_core<>rows_full')
    if excluded != sorted(review['excluded']) or partially:
        fail(f'editions out of CORE {editions(excluded)} (partly out: {partially}) differ from the reviewed {editions(review["excluded"])}')
    checks['editions_csv'] = {**counted, 'manifest_editions_rows': scalar(db, 'SELECT count(*) FROM me'),
                              'manifest_editions_differences': manifest_diff, 'excluded': editions(excluded)}
    step('record flags')
    # 3. Record flags: the producer's derivation, and the detail table against the overlay CSV.
    for name, path in overlays.items():
        read_overlay(db, name, path)
    db.execute(f"CREATE OR REPLACE TABLE flags_detail AS SELECT * FROM read_parquet({literal(master['marathon_record_flags_detail.parquet'])})")
    derived = rows(db, f"""WITH f AS (SELECT record_id, {FLAG_STRING} AS flags, {FLAG_EXCLUDE} AS excl FROM flags_detail)
      SELECT count(*) FILTER(WHERE m.record_flags IS DISTINCT FROM f.flags) AS flag_string,
        count(*) FILTER(WHERE m.analysis_exclude_flag IS DISTINCT FROM coalesce(f.excl,false)) AS exclude_flag,
        (SELECT count(*) FROM flags_detail d ANTI JOIN m ON d.record_id=m.source_record_id) AS orphan_flags,
        (SELECT count(*)-count(DISTINCT record_id) FROM flags_detail) AS repeated_flags
      FROM m LEFT JOIN f ON f.record_id=m.source_record_id""")[0]
    if any(derived.values()):
        fail(f'record_flags differ from the producer derivation of the flag table: {derived}')
    db.execute('CREATE OR REPLACE TABLE flags_cast AS SELECT ' + ', '.join(
        f'CAST("{c}" AS {t}) AS "{c}"' for c, t in OVERLAY_SCHEMAS['record_flags']) + ' FROM flags_detail')
    flag_diff = table_difference(db, 'flags_cast', 'ov_record_flags', OVERLAY_SCHEMAS['record_flags'], 'record_id')
    if flag_diff['only_left'] or flag_diff['only_right'] or flag_diff['changed_columns']:
        fail(f'marathon_record_flags_detail.parquet differs from the overlay record_flags: {flag_diff}')
    checks['record_flags'] = {**derived, 'detail_rows': scalar(db, 'SELECT count(*) FROM flags_detail'),
                              'overlay_rows': scalar(db, 'SELECT count(*) FROM ov_record_flags'), 'detail_vs_overlay': flag_diff}
    step('edition metadata, weather, elevation')
    # 4. editions.csv against the overlay edition metadata, weather and course elevation.
    meta = rows(db, """SELECT count(*) FILTER(WHERE o.city IS NULL) AS no_overlay_row, count(*) FILTER(WHERE e.city IS NULL) AS no_edition_row,
      count(*) FILTER(WHERE o.city IS NOT NULL AND e.city IS NOT NULL AND (e.official_finishers IS DISTINCT FROM o.official_finishers
        OR e.official_source_type IS DISTINCT FROM o.official_source_type OR e.official_source_url IS DISTINCT FROM o.official_source_url
        OR e.completeness_status IS DISTINCT FROM o.completeness_status OR e.completeness_reason IS DISTINCT FROM o.completeness_reason)) AS differ
      FROM e FULL JOIN ov_edition_meta o USING(city,year)""")[0]
    without = [tuple(r) for r in db.execute('SELECT city,year FROM e ANTI JOIN ov_edition_meta USING(city,year) ORDER BY 1,2').fetchall()]
    if meta['no_edition_row'] or meta['differ'] or without != sorted(review['no_overlay_meta']):
        fail(f'editions.csv disagrees with the overlay edition_meta: {meta}, without overlay rows {editions(without)}')
    weather_cols = ['temp_c', 'feels_like_c', 'dewpoint_c', 'humidity_pct', 'wind_mps', 'precip_mm', 'temp_c_win_mean']
    weather = rows(db, 'SELECT count(*) FILTER(WHERE w.city IS NOT NULL) AS with_weather, count(*) FILTER(WHERE w.city IS NOT NULL AND ('
                   + ' OR '.join(f'e.{c} IS DISTINCT FROM w.{c}' for c in weather_cols)
                   + ')) AS differ, count(*) FILTER(WHERE w.city IS NULL AND (' + ' OR '.join(f'e.{c} IS NOT NULL' for c in weather_cols)
                   + ')) AS scalars_without_row, (SELECT count(*)-count(DISTINCT (city,year)) FROM ov_race_conditions) AS repeated'
                   ' FROM e LEFT JOIN ov_race_conditions w USING(city,year)')[0]
    no_weather = [tuple(r) for r in db.execute('SELECT city,year FROM e ANTI JOIN ov_race_conditions USING(city,year) ORDER BY 1,2').fetchall()]
    if weather['differ'] or weather['scalars_without_row'] or weather['repeated']:
        fail(f'editions.csv weather disagrees with the overlay race_conditions: {weather}')
    elevation = rows(db, """SELECT count(*) FILTER(WHERE elev_gain_m IS NOT NULL OR elev_loss_m IS NOT NULL) AS with_elevation,
      count(*) FILTER(WHERE (elev_gain_m IS NOT NULL OR elev_loss_m IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM ov_course_profiles p
        WHERE p.city=e.city AND coalesce(p.valid_from_year,0)<=e.year AND coalesce(p.valid_to_year,9999)>=e.year
        AND p.elev_gain_m IS NOT DISTINCT FROM e.elev_gain_m AND p.elev_loss_m IS NOT DISTINCT FROM e.elev_loss_m)) AS without_profile
      FROM e""")[0]
    if elevation['without_profile']:
        fail(f'editions.csv elevation has no matching overlay course profile: {elevation}')
    checks['edition_overlays'] = {'edition_meta': {**meta, 'without_overlay_row': editions(without)},
                                  'weather': {**weather, 'editions_without_weather': editions(no_weather)},
                                  'elevation': elevation}
    step('baseline overlays')
    # 5. The baseline: overlays repeated where reviewed, and the per-edition checksum delta.
    base_dir, _ = baseline
    equal, differences = {}, {}
    for name in OVERLAY_SCHEMAS:
        member = base_dir / f'{name}.parquet'
        if not member.is_file():
            continue
        db.execute(f"CREATE OR REPLACE TABLE bl_{name} AS SELECT * FROM read_parquet({literal(member)})")
        base_schema = [(c, t) for c, t, *_ in db.execute(f'DESCRIBE bl_{name}').fetchall()]
        if base_schema != OVERLAY_SCHEMAS[name]:
            fail(f'the baseline {name}.parquet does not have the schema the adapter writes')
        diff = table_difference(db, f'ov_{name}', f'bl_{name}', OVERLAY_SCHEMAS[name], OVERLAY_KEYS[name])
        differences[name] = diff
        equal[name] = not (diff['only_left'] or diff['only_right'] or diff['changed_columns'])
    for name in review['baseline_equal']:
        if not equal.get(name):
            fail(f'the overlay {name} is reviewed to equal the baseline member but differs: {differences.get(name)}')
    meta_changed = [tuple(r) for r in db.execute(f"""SELECT coalesce(o.city,b.city), coalesce(o.year,b.year) FROM ov_edition_meta o
      FULL JOIN bl_edition_meta b USING(id) WHERE o.id IS NULL OR b.id IS NULL OR {' OR '.join(
        f'o."{c}" IS DISTINCT FROM b."{c}"' for c, _ in OVERLAY_SCHEMAS['edition_meta'] if c != 'id')} ORDER BY 1,2""").fetchall()]
    if meta_changed != sorted(review['edition_meta_changed']):
        fail(f'overlay edition_meta changed against the baseline in {editions(meta_changed)}, reviewed {editions(review["edition_meta_changed"])}')
    flags_changed = [tuple(r) for r in db.execute(f"""SELECT DISTINCT coalesce(o.city,b.city), coalesce(o.year,b.year)
      FROM (SELECT * FROM ov_record_flags WHERE record_id IN (SELECT source_record_id FROM m WHERE in_core)) o
      FULL JOIN bl_record_flags b USING(record_id) WHERE o.record_id IS NULL OR b.record_id IS NULL OR {' OR '.join(
        f'o."{c}" IS DISTINCT FROM b."{c}"' for c, _ in OVERLAY_SCHEMAS['record_flags'] if c != 'record_id')} ORDER BY 1,2""").fetchall()]
    if flags_changed != sorted(review['flags_changed']):
        fail(f'CORE record flags changed against the baseline in {editions(flags_changed)}, reviewed {editions(review["flags_changed"])}')
    checks['baseline_overlays'] = {'tag': pin['baseline']['tag'], 'equal': equal, 'differences': differences,
                                   'edition_meta_changed': editions(meta_changed), 'core_flags_changed': editions(flags_changed)}
    return report


def checksum_delta(pin, written, base_dir):
    """The per-edition checksum delta against the baseline's EDITION-CHECKSUMS.csv; fails off the reviewed list."""
    review = REVIEWED[pin['tag']]
    with (base_dir / 'EDITION-CHECKSUMS.csv').open(newline='') as stream:
        listed = list(csv.DictReader(stream))
    # The baseline lists an edition it left out with 0 rows and no digest (1050: Amsterdam 2020); it held no rows there.
    empty = sorted((r['city'], int(r['year'])) for r in listed if int(r['n_records']) == 0 and not r['sha256_records'])
    before = {(r['city'], int(r['year'])): (int(r['n_records']), r['sha256_records']) for r in listed if int(r['n_records'])}
    changed = sorted(k for k in written if k in before and written[k] != before[k])
    added = sorted(k for k in written if k not in before)
    removed = sorted(k for k in before if k not in written)
    if changed != sorted(review['changed']) or added != sorted(review['added']) or removed != sorted(review['removed']):
        fail(f'edition checksums against {pin["baseline"]["tag"]}: changed {editions(changed)}, added {editions(added)}, '
             f'removed {editions(removed)}; reviewed changed {editions(review["changed"])}, added {editions(review["added"])}, '
             f'removed {editions(review["removed"])}')
    return {'baseline': pin['baseline']['tag'], 'baseline_editions': len(before), 'baseline_empty': editions(empty),
            'editions': len(written),
            'unchanged': sum(1 for k in written if before.get(k) == written[k]),
            'changed': [{'edition': f'{c} {y}', 'rows_before': before[(c, y)][0], 'rows': written[(c, y)][0]} for c, y in changed],
            'added': [{'edition': f'{c} {y}', 'rows': written[(c, y)][0]} for c, y in added],
            'removed': [{'edition': f'{c} {y}', 'rows_before': before[(c, y)][0]} for c, y in removed]}


# ---------------------------------------------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------------------------------------------

def copy_parquet(db, query, path):
    tmp = path.with_name(path.name + '.tmp')
    db.execute(f"COPY ({query}) TO {literal(tmp)} (FORMAT parquet, COMPRESSION snappy, ROW_GROUP_SIZE 200000)")
    os.replace(tmp, path)


def encode_json(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode()


def write_members(db, pin, master, overlays, baseline, root, report):
    review = REVIEWED[pin['tag']]
    base_dir, base_manifest = baseline
    cast = ', '.join(f'CAST({"source_record_id" if c == "id" else c} AS {t}) AS {c}' for c, t in RACE_RECORDS)
    copy_parquet(db, f'SELECT {cast} FROM m WHERE in_core ORDER BY id', root / 'race_records.parquet')
    db.execute(f"CREATE OR REPLACE VIEW rr AS SELECT * FROM read_parquet({literal(root / 'race_records.parquet')})")
    if scalar(db, 'SELECT count(*) FROM rr') != report['checks']['qa_report']['core_rows_marathon']:
        fail('race_records.parquet does not hold every CORE marathon row')
    step('overlays')
    # Overlays: the baseline's bytes where equal, else the CSV values in 1050's schema.
    written = {}
    for name, columns in OVERLAY_SCHEMAS.items():
        target = root / f'{name}.parquet'
        select = ', '.join(f'"{c}"' for c, _ in columns)
        if name == 'edition_meta':
            extra = ("SELECT NULL::BIGINT, e.city, e.year, e.official_finishers, e.official_source_url, e.official_source_type, "
                     + ', '.join(['NULL'] * 3) + ", e.completeness_status, e.completeness_reason, " + ', '.join(['NULL'] * 7)
                     + ' FROM e ANTI JOIN ov_edition_meta USING(city,year)')
            query = f'SELECT * FROM (SELECT {select} FROM ov_edition_meta UNION ALL {extra}) ORDER BY id NULLS LAST, city, year'
        elif name == 'record_flags':
            query = f'SELECT {select} FROM flags_cast WHERE record_id IN (SELECT id FROM rr) ORDER BY record_id'
        else:
            query = f'SELECT {select} FROM ov_{name} ORDER BY {OVERLAY_KEYS[name]}'
        if name in review['baseline_equal'] and report['checks']['baseline_overlays']['equal'].get(name):
            shutil.copyfile(base_dir / f'{name}.parquet', target)
            written[name] = 'baseline bytes (values equal to the overlay CSV)'
        else:
            copy_parquet(db, query, target)
            written[name] = 'overlay values in the 1050 schema'
    report['overlays_written'] = written
    step('features')
    # features.parquet: the identity subset the builders read (FULL; computed for both bundles so their documents agree).
    db.execute(SECONDS)
    secs = ', '.join(f'seconds({f}) AS t{i}' for i, f in enumerate(FIELDS))
    names = ['05', '10', '15', '20', '25', '30', '35', '40', '42']
    seg = ', '.join(f'(t{i}-{"t" + str(i - 1) if i else "0"})/60 AS seg_{n}' for i, n in enumerate(names))
    cum = ', '.join(f't{i}/60 AS cum_{n}' for i, n in enumerate(names[:8]))
    rule = IDENTITY[pin['tag']]
    keyed = ', '.join(f"('{v}', '{c}')" for v, cs in rule['versions'].items() for c in cs)
    unknown = rows(db, "SELECT person_link_version AS v, person_link_confidence AS c, count(*) AS n FROM m WHERE in_core GROUP BY ALL")
    allowed = {(v, c) for v, cs in rule['versions'].items() for c in cs + rule['unkeyed_confidences']}
    allowed |= {(v, None) for v in rule['preliminary_versions']} | {(None, None)} | {(None, c) for c in rule['unkeyed_confidences']}
    surprise = [u for u in unknown if (u['v'], u['c']) not in allowed]
    if surprise:
        fail(f'person_link_version/confidence values the identity rule has not reviewed: {surprise}')
    report['identity_rule'] = dict(rule, distribution=sorted(unknown, key=lambda u: (str(u['v']), str(u['c']))))
    prelim = ', '.join(f"'{v}'" for v in rule['preliminary_versions'])
    dates = json.loads(RACE_DATES_PATH.read_text())['releases'].get(pin['tag'], [])
    for d in dates:
        note = rows(db, f"SELECT completeness_reason AS r, race_date AS d FROM e WHERE city={literal(d['city'])} AND year={int(d['year'])}")
        if len(note) != 1 or d['evidence_text'] not in (note[0]['r'] or '') or note[0]['d']:
            fail(f"reviewed race date {d['city']} {d['year']}: editions.csv no longer says {d['evidence_text']!r}, or now has a race_date")
        if scalar(db, f"SELECT count(*) FROM ov_race_conditions WHERE city={literal(d['city'])} AND year={int(d['year'])}"):
            fail(f"reviewed race date {d['city']} {d['year']}: the weather overlay now has a row; review the date again")
    reviewed_dates = ' UNION ALL '.join(f"SELECT {literal(d['city'])} AS city, {int(d['year'])} AS year, {literal(d['date'])} AS race_date"
                                        for d in dates) or "SELECT NULL::VARCHAR AS city, NULL::BIGINT AS year, NULL::VARCHAR AS race_date WHERE false"
    copy_parquet(db, f"""WITH p AS (SELECT r.*, {secs} FROM rr r), k AS (SELECT p.*, m.runner_id AS v1,
        CASE WHEN (m.person_link_version, m.person_link_confidence) IN ({keyed}) OR m.person_link_version IN ({prelim})
          THEN m.person_id END AS pid, m.person_link_version IN ({prelim}) AS prelim FROM p
        JOIN m ON m.source_record_id=p.id), rd AS ({reviewed_dates})
      SELECT k.id AS record_id, k.city, k.year, coalesce(w.race_date, rd.race_date) AS race_date, k.race, k.runner AS runner_name,
        CASE WHEN k.sex='X' THEN NULL ELSE k.sex END AS sex, k.age,
        CAST(nullif(regexp_extract(k.v1, '\\|yob:([0-9]{{4}})$', 1), '') AS BIGINT) AS yob, k.age_group,
        {seg}, t8/60 AS finish_time, {cum}, k.pid AS match_key, CASE WHEN k.pid IS NOT NULL THEN false END AS is_ambiguous,
        k.pid AS runner_id, CASE WHEN k.pid IS NOT NULL THEN coalesce(k.prelim, false) END AS link_preliminary
      FROM k LEFT JOIN ov_race_conditions w ON w.city=k.city AND w.year=k.year
      LEFT JOIN rd ON rd.city=k.city AND rd.year=k.year ORDER BY record_id""", root / 'features.parquet')
    features = rows(db, f"""SELECT count(*) AS rows, count(runner_id) AS with_runner_id, count(DISTINCT runner_id) AS runner_ids,
      count(*) FILTER(WHERE link_preliminary) AS with_preliminary_key,
      count(*) FILTER(WHERE runner_id IS NULL AND city='New York' AND year=2026) AS nyc2026_without_runner_id,
      count(*) FILTER(WHERE city='New York' AND year=2026) AS nyc2026_rows, count(yob) AS with_yob,
      count(*) FILTER(WHERE race_date IS NULL) AS without_race_date
      FROM read_parquet({literal(root / 'features.parquet')})""")[0]
    report['features'] = features
    step('edition checksums')
    # Per-edition checksums and the delta against the baseline.
    sums = edition_checksums(db, 'rr')
    report['checksum_delta'] = checksum_delta(pin, sums, base_dir)
    return sums


def write_documents(db, pin, master, root, report, sums):
    review = REVIEWED[pin['tag']]
    adapter_sha = file_sha256(__file__)
    eds = rows(db, """SELECT e.city, e.year, e.rows_core, e.rows_full, e.rows_with_finish, e.official_finishers,
        e.official_source_url, o.official_checked_at, e.completeness_status, e.completeness_reason, e.verification_tier, e.package_note
      FROM e LEFT JOIN ov_edition_meta o USING(city,year) ORDER BY e.city, e.year""")
    excluded = {f'{c} {y}' for c, y in review['excluded']}
    editions_json = []
    for e in eds:
        key = (e['city'], e['year'])
        out = f"{e['city']} {e['year']}" in excluded
        editions_json.append({
            'city': e['city'], 'year': e['year'], 'n_records': e['rows_full'] if out else e['rows_core'],
            'n_finishes': e['rows_with_finish'], 'official_finishers': e['official_finishers'],
            'official_source_url': e['official_source_url'], 'official_checked_at': e['official_checked_at'],
            'completeness_status': e['completeness_status'], 'completeness_reason': e['completeness_reason'],
            'verification_tier': e['verification_tier'], 'package_note': e['package_note'], 'hold_note': None,
            'sha256_records': None if out else sums[key][1], 'excluded': out})
    summary = [{'city': c, 'year': y, 'n_records': n, 'n_with_5km': k} for c, y, n, k in db.execute(
        "SELECT city, year, count(*), count(*) FILTER(WHERE nullif(trim(split_5km),'') IS NOT NULL) FROM rr GROUP BY ALL ORDER BY 1,2").fetchall()]
    lines = ['city,year,n_records,sha256_records'] + [f'{c},{y},{n},{d}' for (c, y), (n, d) in sorted(sums.items())]
    published = pin['published_at']
    head = f'> {LABEL} Built from `{pin["tag"]}` (pinned in analysis/release.json); adapter version {ADAPTER_VERSION}.\n\n'
    delta = report['checksum_delta']
    docs = {
        'EDITIONS.json': encode_json(editions_json),
        'races_summary.json': encode_json(summary),
        'EDITION-CHECKSUMS.csv': ('\n'.join(lines) + '\n').encode(),
        'RECONCILIATION.json': encode_json(report),
        'CHANGE-REPORT.md': (f'# Change report: {pin["tag"]} against {pin["baseline"]["tag"]}\n\n{head}'
                             f'Measured by the adapter with the producer’s per-edition checksum method ({CHECKSUM_METHOD}).\n\n'
                             f'- Editions: {delta["editions"]} (baseline {delta["baseline_editions"]}); unchanged checksums {delta["unchanged"]}.\n'
                             + ''.join(f'- Changed: {x["edition"]} ({x["rows_before"]:,} rows before, {x["rows"]:,} now).\n' for x in delta['changed'])
                             + ''.join(f'- Added: {x["edition"]} ({x["rows"]:,} rows).\n' for x in delta['added'])
                             + ''.join(f'- Removed: {x["edition"]} ({x["rows_before"]:,} rows before).\n' for x in delta['removed'])
                             + f'- Out of CORE (in FULL only): {", ".join(sorted(excluded)) or "none"}.\n\n'
                             '## The producer’s CHANGELOG.md (verbatim)\n\n' + master['CHANGELOG.md'].read_text()).encode(),
        'ID-CONTRACT.md': (f'# ID contract: {pin["tag"]} (adapted)\n\n{head}'
                           '- `race_records.id` is master `source_record_id`, the platform’s canonical marathon race-result id '
                           '(`record_uid` is `M-<id>`; checked on every row).\n'
                           '- `features.record_id`, `record_flags.record_id` and every overlay join use this id. Never use a row index.\n'
                           '- Do not join runners across races by name alone.\n'
                           '- `features.runner_id` is master’s `person_id` under the adapter’s frozen identity rule (see MATCHING.md), '
                           'not the v1 `runner_id` (owner decision, November 5, 2026).\n').encode(),
        'MATCHING.md': (f'# Cross-race matching: {pin["tag"]} (adapted)\n\n{head}'
                        '`features.runner_id` is master’s `person_id` (the producer’s person clusters, which link records across '
                        'races and years), kept for a record whose link version is the v4 build with confidence high, medium or '
                        'low, or the New York 2026 preliminary build (`nyc2026_incremental_preliminary`, which has no confidence); '
                        'a `low_series_name_only` link (a name and a sex with no age key) leaves the record without a key. '
                        '`link_preliminary` is true for a record keyed by the preliminary build. `match_key` repeats the key; '
                        '`is_ambiguous` is false where a key is present and unknown (null) where it is absent. `yob` is still the '
                        'year in the v1 `runner_id`’s `yob:` key, and null otherwise. These are records linked by name, not '
                        f'verified people. Keyed records: {report["features"]["with_runner_id"]:,} '
                        f'({report["features"]["with_preliminary_key"]:,} by the preliminary build).\n\n'
                        '## The producer’s DATA_DICTIONARY.md (verbatim)\n\n' + master['DATA_DICTIONARY.md'].read_text()).encode(),
        'FEATURE-FIELD-NOTES.md': (f'# Feature fields: {pin["tag"]} (adapted)\n\n{head}'
                                   '`features.parquet` is an identity subset with one row per `race_records.id`: `record_id, city, year, '
                                   'race_date, race, runner_name, sex, age, yob, age_group`, the section minutes `seg_05 … seg_40, seg_42` '
                                   '(the last 2.195 km), `finish_time` and the cumulative minutes `cum_05 … cum_40`, parsed from the raw '
                                   'clock strings with the pacing parser (null when a string does not parse), then `match_key, '
                                   'is_ambiguous, runner_id, link_preliminary`. Recorded sex `X` is null here, as in 1050’s features; nothing is '
                                   'inferred. `race_date` comes from the overlay race_conditions, else from analysis/reviewed-race-dates.json. It has none of the producer engine’s '
                                   'columns (`valid_splits`, `wall_*`, paces, ranks, personal bests): no site builder reads them.\n').encode(),
        'README.md': (f'# {pin["tag"]}, adapted for the Pace Notes marathon builders\n\n{head}'
                      f'Marathon rows with `in_core` from `master_results_FULL.parquet`; overlays from `{pin["overlays"]["tag"]}`; '
                      f'compared with `{pin["baseline"]["tag"]}`. Halves are not in this folder. `MANIFEST.json`, `EDITIONS.json`, '
                      '`races_summary.json`, `EDITION-CHECKSUMS.csv`, `RECONCILIATION.json`, `features.parquet` and these notes are '
                      'written by the adapter and are not producer claims; the producer’s own files are in `master-assets/`.\n\n'
                      '## The producer’s README.md (verbatim)\n\n' + master['README.md'].read_text()).encode(),
    }
    for name, data in docs.items():
        (root / name).write_bytes(data)
    snapshot = next((line.strip() for line in master['README.md'].read_text().splitlines() if line.startswith('Snapshot:')), None)
    files = {}
    for name in DATA_MEMBERS + ['features.parquet'] + DOC_MEMBERS:
        path = root / name
        n = None
        if name.endswith('.parquet'):
            n = scalar(db, f'SELECT count(*) FROM read_parquet({literal(path)})')
        files[name] = {'rows': n, 'bytes': path.stat().st_size, 'sha256': file_sha256(path),
                       'tier': 'FULL' if name == 'features.parquet' else 'CORE'}
    coverage = db.execute('SELECT count(*), count(DISTINCT city), count(DISTINCT (city,year)), min(id), max(id) FROM rr').fetchone()
    manifest = {
        'document': LABEL, 'adapter': {'script': 'analysis/adapt_master.py', 'version': ADAPTER_VERSION, 'sha256': adapter_sha},
        'created_at': published, 'created_at_source': 'the release’s GitHub published_at, pinned in analysis/release.json',
        'producer_snapshot_claim': snapshot, 'tag_stub': pin['tag'],
        'source': {'repository': pin['repository'], 'tag': pin['tag'], 'assets': pin['assets'],
                   'sha256sums_sha256': pin['sha256sums_sha256'], 'overlays': pin['overlays'], 'baseline': pin['baseline']},
        'n_records': coverage[0], 'n_cities': coverage[1], 'n_editions': coverage[2], 'id_min': coverage[3], 'id_max': coverage[4],
        'excluded_editions': [{'city': e['city'], 'year': e['year'], 'rows_in_master_full': e['n_records'],
                               'reason': 'in_core false in master (verification_tier excluded_from_release)'}
                              for e in editions_json if e['excluded']],
        'canonical_record_id': 'race_records.id (= master source_record_id)', 'edition_checksum_method': CHECKSUM_METHOD,
        'tiers': {'CORE': sorted(EXPECTED_MASTER), 'FULL': 'CORE + features.parquet'},
        'dependencies': {'duckdb': duckdb.__version__},
        'files': files,
    }
    (root / 'MANIFEST.json').write_bytes(encode_json(manifest))
    listing = {name: entry['sha256'] for name, entry in files.items()}
    listing['MANIFEST.json'] = file_sha256(root / 'MANIFEST.json')
    (root / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
    return manifest


def adapt(pin, output, bundle='FULL', from_dirs=(), baseline_dir=None, memory=None):
    """Download or read the pinned assets, reconcile, write the input folder; returns its provenance."""
    pin = check_pin(pin)
    if bundle not in ('CORE', 'FULL'):
        fail('bundle must be CORE or FULL')
    root = Path(output).resolve()
    root.mkdir(parents=True, exist_ok=True)
    from_dirs = [Path(d).resolve() for d in from_dirs]
    master = fetch_release(pin['repository'], pin['tag'], 'SHA256SUMS', pin['sha256sums_sha256'], pin['assets'],
                           root / SOURCE_DIR, from_dirs)
    ov = pin['overlays']
    found = fetch_release(pin['repository'], ov['tag'], 'SHA256SUMS', ov['sha256sums_sha256'], ov['assets'],
                          root / OVERLAY_DIR, from_dirs)
    overlays = {name: found[OVERLAY_ASSET.format(name)] for name in OVERLAY_SCHEMAS}
    baseline = baseline_members(pin, root, from_dirs, Path(baseline_dir).resolve() if baseline_dir else None)
    for name in ['provenance.json', 'features.parquet', 'MANIFEST.json', 'SHA256SUMS.txt'] + DATA_MEMBERS + DOC_MEMBERS:
        (root / name).unlink(missing_ok=True)
    scratch = root / 'adapt-temp'
    scratch.mkdir(exist_ok=True)
    db = duckdb.connect()
    db.execute(f"SET memory_limit='{memory or os.environ.get('PACE_NOTES_ADAPT_MEMORY', '6GB')}'")
    db.execute('SET threads=3')
    db.execute('SET preserve_insertion_order=true')
    db.execute('SET temp_directory=?', [str(scratch)])
    try:
        report = reconcile(db, pin, master, overlays, baseline)
        sums = write_members(db, pin, master, overlays, baseline, root, report)
        manifest = write_documents(db, pin, master, root, report, sums)
    except BaseException:
        for name in ['features.parquet', 'MANIFEST.json', 'SHA256SUMS.txt'] + DATA_MEMBERS + DOC_MEMBERS:
            (root / name).unlink(missing_ok=True)
        raise
    finally:
        db.close()
        shutil.rmtree(scratch, ignore_errors=True)
    if bundle == 'CORE':
        (root / 'features.parquet').unlink()
    provenance = {
        'repository': pin['repository'], 'release_tag': pin['tag'], 'release_published_at': pin['published_at'],
        'layout': 'master', 'asset': 'master_results_FULL.parquet', 'asset_sha256': pin['assets']['master_results_FULL.parquet'],
        'asset_path': f'{SOURCE_DIR}/master_results_FULL.parquet', 'bundle': bundle,
        'manifest_sha256': file_sha256(root / 'MANIFEST.json'),
        'release_checksums': {'asset': 'SHA256SUMS', 'sha256': pin['sha256sums_sha256']},
        'assets': pin['assets'], 'overlays': pin['overlays'], 'baseline': pin['baseline'],
        'adapter_sha256': manifest['adapter']['sha256'], 'adapter_version': ADAPTER_VERSION,
    }
    (root / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    return provenance


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--bundle', choices=['CORE', 'FULL'], default='FULL')
    parser.add_argument('--from-dir', type=Path, action='append', default=[])
    parser.add_argument('--baseline-dir', type=Path, help='a verified baseline CORE folder from download_release.py')
    parser.add_argument('--pin', type=Path, default=PIN_PATH)
    args = parser.parse_args(argv)
    try:
        provenance = adapt(json.loads(args.pin.read_text()), args.output, args.bundle, args.from_dir, args.baseline_dir)
    except AdaptError as error:
        raise SystemExit(f'adapt_master: {error}')
    print(f"Adapted {provenance['release_tag']} ({args.bundle}) into {args.output.resolve()}; manifest {provenance['manifest_sha256']}.")


if __name__ == '__main__':
    main()
