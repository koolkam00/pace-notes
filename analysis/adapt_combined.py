"""Adapt the pinned combined release `pace-notes-marathon-half-<stamp>` into the marathon input folder the builders read.

    python3 -I analysis/adapt_combined.py --output DIR [--bundle CORE|FULL] [--from-dir DIR ...] [--core-dir DIR]
                                           [--baseline-dir DIR]

A combined release (first `pace-notes-marathon-half-20261113-1113`, November 13, 2026) holds both distances in one CORE
archive: `race_records.parquet` with a `distance` and a `source_db` column, per-edition verification tiers
(`edition_meta.parquet`, `EDITION-TIERS.csv`), row flags (`qa_row_flags`, `record_flags`, `pending_review_flags`) and the
producer's exclusion lists. It has no FULL bundle and no `features.parquet`: cross-race identity is a separate pair of
files, person links v5.1 (`person-ids-v5.1-race_results_linked.parquet`, one row per CORE row). The builders read a
marathon folder in the layout of the October 21 export (1050), so this adapter writes one and proves it faithful:

1. **Fetch** every asset the pin (`analysis/release.json`, `layout: combined`) names, anonymously from
   `https://github.com/<repository>/releases/download/<tag>/<asset>` (never api.github.com, no token). The release's
   `RELEASE-SHA256SUMS-<stamp>.txt` must have the pinned digest and list every pinned asset with the pinned digest, and
   every file must hash to it. The CORE archive is unpacked (23 members, each checked against the archive's own
   `SHA256SUMS.txt`, whose digest is pinned too). `--from-dir` takes folders already filled from the release,
   `--core-dir` an already unpacked CORE folder (its members are then linked instead of unpacked again, and checked
   the same way), and `--baseline-dir` a folder from `download_release.py --bundle CORE --tag <baseline tag>`.
2. **Reconcile, failing loudly** (a failure removes every member already written): each count the producer's
   `MANIFEST.json`, README, data card and change report state that can be recounted (rows, editions, city keys, years,
   tiers, split tiers, row flags, pending flags, exclusions, the per-edition checksums of every marathon edition), the id
   contract on (`source_db`, `id`), the edition tables against each other, the person links against the results, the
   record delta against the baseline release, and the overlays against the baseline's members. Every check is written
   to `RECONCILIATION.json` with its expected and measured value. A check that fails stops the run unless a reviewer
   has listed it (`REVIEWED[tag]['known_mismatches']`); a listed mismatch is still written as a mismatch.
3. **Write** `race_records.parquet` (marathon rows only, `distance = 'marathon'`, in 1050's 20 columns and types, ordered
   by id; the rows of the frozen `ROW_RULE` are left out and counted; blank published sex takes the producer's
   `sex_from_category`, never a name; `city` is the label of the edition's race in the frozen race registry,
   `analysis/race-registry.json`, which the adapter rebuilds from the rows it writes and must find unchanged, and `race`
   is that race's display name, except that an edition under a plain key keeps the race name the release gives it; the
   release's own key and race name of every written edition are kept in `release_keys.parquet`), the weather and
   course members (the baseline's own bytes, since their values
   are equal, so pinned hashes such as the course-terrain registry's stay valid), `sources`, `edition_meta` (1050's
   columns, then the tier columns and notes of `EDITION-TIERS.csv`, the tier table that reproduces the README, a race
   date only where the weather table or a reviewed entry gives one, and beside it the unreviewed date the producer's
   own note states; written editions only), `qa_row_flags`,
   `record_flags` (the release's long format), an identity subset `features.parquet` (FULL) whose cross-race key
   follows the frozen `IDENTITY` rule and which keeps every link's `person_id`, confidence tier and method, and
   documents that say on their first line that they are adapter outputs, not producer claims.

The verified source files stay in `<output>/release-assets` (the archive and the link files; the unpacked members in
`release-assets/core`) and `<output>/baseline`. Every member is deterministic: two runs on the same pin give the same
bytes. Nothing is inferred: a missing split stays missing, `X` and blank sex stay unrecorded, and a record whose link
the rule does not key stands alone. DuckDB is capped at `PACE_NOTES_ADAPT_MEMORY` (default 6GB); about 3 GB of disk
beside the source files.
"""
from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tarfile
import time
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb  # noqa: E402

import adapt_master  # noqa: E402
import race_registry  # noqa: E402
from adapt_master import (AdaptError, FIELDS, OVERLAY_SCHEMAS, RACE_RECORDS, SECONDS, copy_parquet, encode_json, fail,  # noqa: E402
                          file_sha256, is_digest, literal, parse_sums, place, rows, scalar)

ADAPTER_VERSION = 2   # 2 (2026-11-14): registry labels in `city`, release_keys.parquet, the edition-wide exception of the row rule
COMBINED_TAG = re.compile(r'pace-notes-marathon-half-[0-9]{8}-[0-9]{4}')
LAYOUT = 'combined'
PIN_PATH = Path(__file__).with_name('release.json')
RACE_DATES_PATH = Path(__file__).with_name('reviewed-race-dates.json')
SOURCE_DIR, CORE_DIR, BASELINE_DIR = 'release-assets', 'release-assets/core', 'baseline'
LABEL = 'Adapter output (analysis/adapt_combined.py), not a producer document.'

# The 23 members of a combined CORE archive (all under one folder named after the tag).
CORE_MEMBERS = {
    'race_records.parquet', 'qa_row_flags.parquet', 'record_flags.parquet', 'pending_review_flags.parquet',
    'pending_review_flags.csv', 'edition_meta.parquet', 'edition_meta.csv', 'EDITIONS.json', 'EDITION-TIERS.csv',
    'EDITION-CHECKSUMS.csv', 'RELEASE-EXCLUSIONS.csv', 'RELEASE-ROW-EXCLUSIONS.parquet', 'sources.parquet',
    'race_conditions.parquet', 'course_profiles.parquet', 'course_segments.parquet', 'races_summary.json', 'MANIFEST.json',
    'SHA256SUMS.txt', 'README.md', 'DATA-CARD.md', 'CHANGE-REPORT.md', 'ID-CONTRACT.md'}
# Release-level assets that repeat an archive member and must equal it byte for byte.
REPEATED_ASSETS = ['EDITION-TIERS.csv', 'RELEASE-EXCLUSIONS.csv', 'DATA-CARD.md', 'CHANGE-REPORT.md']
LINKS, PERSONS = 'person-ids-v5.1-race_results_linked.parquet', 'person-ids-v5.1-persons.parquet'
# The assets a combined pin must name, beside the CORE archive (named in pin['core']).
PINNED_ASSETS = {LINKS, PERSONS, 'EDITION-TIERS.csv', 'RELEASE-EXCLUSIONS.csv', 'README.md', 'DATA-CARD.md', 'CHANGE-REPORT.md',
                 'person-ids-v5.1-README.md', 'person-ids-v5.1-COLUMNS.md', 'person-ids-v5.1-MATCHING.md',
                 'person-ids-v5.1-MATCHING-V5-BASE.md', 'person-ids-v5.1-MATCHING-V4-BASE.md', 'person-ids-v5.1-checks.txt',
                 'person-ids-v5.1-eval-metrics.txt'}
BASELINE_MEMBERS = ['MANIFEST.json', 'SHA256SUMS.txt', 'race_records.parquet', 'race_conditions.parquet',
                    'course_profiles.parquet', 'course_segments.parquet']
# The combined race_records.parquet: these columns, in this order (the producer's per-edition checksum covers all 27).
SOURCE_COLUMNS = ['distance', 'source_db', 'id', 'race', 'year', 'city', 'distance_km', 'runner', 'sex', 'age', 'age_group',
                  'age_or_group', 'split_5km', 'split_10km', 'split_15km', 'split_20km', 'split_21_1km', 'split_25km',
                  'split_30km', 'split_35km', 'split_40km', 'split_42_2km', 'finish_time', 'bib', 'source_runner_id',
                  'source_url', 'ingested_at']
INTERMEDIATE = ['split_5km', 'split_10km', 'split_15km', 'split_20km', 'split_25km', 'split_30km', 'split_35km', 'split_40km']
QA_FLAGS = ['split_nonmonotonic', 'split_after_finish', 'finish_equals_earlier_split', 'finish_ge_24h', 'finish_zero',
            'finish_implausibly_fast', 'finish_faster_than_world_record', 'no_finish_time', 'age_implausible',
            'finish_6h_to_24h']
TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'held_for_review', 'unverified', 'excluded']
CHECKSUM_COLUMNS = [name for name, _ in RACE_RECORDS]
CHECKSUM_METHOD = ('sha256 over the edition rows ordered by id, each row serialized as a compact JSON array of the 20 '
                   'race_records columns of this folder + newline (the method of the 1050 MANIFEST.json and of '
                   'analysis/adapt_master.py; an age that is a whole number is written as an integer)')
PRODUCER_CHECKSUM_METHOD = ('sha256 over the edition rows ordered by id, each row a compact JSON array of all 27 '
                            'race_records columns of the release + newline (the release MANIFEST.json; ages stay decimals)')
NOTE_DATE = r'date=([0-9]{4}-[0-9]{2}-[0-9]{2})'

# The edition_meta member: 1050's 18 columns from the release's edition_meta.parquet; then the tier fields and notes of
# EDITION-TIERS.csv (the tier table that reproduces the README's counts; the two tables must agree on every marathon
# edition's tier fields, else the adapter stops), the release exclusion, and the dates the adapter attaches: `race_date`
# with its source (the weather row, else a reviewed and cited date; nothing else dates an edition for an analysis) and
# `producer_note_date`, the one `date=YYYY-MM-DD` the producer's completeness note states, kept as unreviewed
# information. Half-only columns of the release table (all null for marathons) are not written.
EDITION_META = OVERLAY_SCHEMAS['edition_meta'] + [
    ('verification_tier', 'VARCHAR'), ('verified_badge', 'BOOLEAN'), ('weaker_source', 'BOOLEAN'), ('badge_label', 'VARCHAR'),
    ('split_tier', 'VARCHAR'), ('release_exclusion', 'VARCHAR'), ('release_note', 'VARCHAR'), ('hold_note', 'VARCHAR'),
    ('race_date', 'VARCHAR'), ('race_date_source', 'VARCHAR'), ('producer_note_date', 'VARCHAR')]
TIER_FIELDS = ("""t.verification_tier, lower(t.verified_badge)='true' AS verified_badge,
        CASE WHEN t.weaker_source IS NOT NULL THEN lower(t.weaker_source)='true' END AS weaker_source, t.badge_label, t.split_tier,
        e.release_exclusion, t.release_note, t.hold_note""")
EDITION_META_HALF_ONLY = ['distance_km', 'race', 'race_date', 'has_splits', 'split_points', 'winner_m', 'winner_m_time',
                          'winner_f', 'winner_f_time', 'winner_check', 'year_check', 'count_check',
                          'completeness_status_platform']
# sources.parquet is the release's own source list: `city` and `race` there are the source's strings, not labels, and a
# source row need not belong to a written edition. `edition_city` is the label of the written edition with its key and
# year, when there is one.
SOURCES = OVERLAY_SCHEMAS['sources'] + [('release_status', 'VARCHAR'), ('edition_city', 'VARCHAR')]
# release_keys.parquet: one row per written edition, from the pipeline's (city, year) to the release's own key and race
# name. `city` is the registry label, `race` the race name written in race_records and features.
RELEASE_KEYS = [('city', 'VARCHAR'), ('year', 'BIGINT'), ('race', 'VARCHAR'), ('race_id', 'VARCHAR'), ('release_city', 'VARCHAR'),
                ('release_race', 'VARCHAR'), ('n_records', 'BIGINT')]
RECORD_FLAGS = [('record_id', 'BIGINT'), ('city', 'VARCHAR'), ('year', 'BIGINT'), ('flag', 'VARCHAR'), ('detail', 'VARCHAR')]
QA_ROW_FLAGS = [('record_id', 'BIGINT'), ('city', 'VARCHAR'), ('year', 'BIGINT')] + [(f, 'BOOLEAN') for f in QA_FLAGS] + [
    ('sex_from_category', 'VARCHAR')]

DATA_MEMBERS = ['race_records.parquet', 'race_conditions.parquet', 'course_profiles.parquet', 'course_segments.parquet',
                'sources.parquet', 'edition_meta.parquet', 'record_flags.parquet', 'qa_row_flags.parquet', 'release_keys.parquet']
DOC_MEMBERS = ['EDITIONS.json', 'races_summary.json', 'EDITION-CHECKSUMS.csv', 'RECONCILIATION.json', 'CHANGE-REPORT.md',
               'ID-CONTRACT.md', 'MATCHING.md', 'FEATURE-FIELD-NOTES.md', 'README.md']
# The members a combined-layout input holds (CORE); FULL adds features.parquet. provenance.json is local, as for every layout.
EXPECTED_COMBINED = set(DATA_MEMBERS) | set(DOC_MEMBERS) | {'MANIFEST.json', 'SHA256SUMS.txt'}
EXPECTED_COMBINED_FULL = EXPECTED_COMBINED | {'features.parquet'}

# The rows left out of the adapted marathon input (lead decision D2 of the adoption plan, 2026-11-14; frozen before any
# outcome was computed). A marathon row is left out when it carries one of these pending-review flags (present in CORE)
# or one of these QA flags. `kept_unlabelled` pending flags leave their rows in as ordinary results; the adapter writes
# no pending-review flag at all, so no row is labelled. Any other pending flag on a marathon row stops the adapter.
# `kept_when_edition_wide` (lead ruling R2, 2026-11-14, after the first reconciliation showed four small editions losing
# every row): one of these flags removes nothing from an edition whose every release row carries it, because it then
# describes how the source laid the edition out (the finish repeated in a split column; a status column that holds
# place numbers), not the row. A row of such an edition is still left out when it carries another flag of the rule.
ROW_RULE = {
    'pace-notes-marathon-half-20261113-1113': {
        'pending_review_flags': ['wheelchair_handcycle_published_category', 'sportstats_nonfinish_status',
                                 'philadelphia_2010_place_sequence_outlier'],
        'qa_row_flags': ['finish_faster_than_world_record', 'finish_ge_24h', 'finish_zero', 'finish_equals_earlier_split'],
        'kept_unlabelled': ['adaptive_division_published_category'],
        'kept_when_edition_wide': ['finish_equals_earlier_split', 'sportstats_nonfinish_status'],
    },
}
# The identity rule (lead decision D4, 2026-11-14; frozen before any outcome was computed). A record's cross-race key
# (`runner_id` and `match_key` in features.parquet) is its v5.1 `person_id` when the link's confidence is one of
# `keyed_confidences`. A link of a `possible_confidences` tier keeps its `person_id`, `link_confidence` and
# `link_method` in their own columns and gets no key, so the record stands alone in every history-based output and a
# lookup can show it as a possible match. A record without a `person_id` is unlinked. Any other confidence value, or
# a `person_id` outside the build's prefix, stops the adapter.
IDENTITY = {
    'pace-notes-marathon-half-20261113-1113': {
        'build': 'person-ids v5.1', 'prefix': 'p51_',
        'keyed_confidences': ['high_elite', 'high', 'medium'],
        'possible_confidences': ['medium_variant', 'low', 'low_noage', 'low_noage_series', 'low_nosex', 'low_city_pace',
                                 'low_carryover'],
    },
}
# What the producer's documents state in prose only (the machine-readable counts are read from the release
# MANIFEST.json at run time). Each is recounted; the documents themselves are pinned by digest.
CLAIMS = {
    'pace-notes-marathon-half-20261113-1113': {
        # CHANGE-REPORT.md section B: marathon versus private-export-20261021-1050, by race_records.id.
        'change_report_vs_baseline': {
            'removed': 2158, 'added': 2497076, 'changed': 16013, 'unchanged': 5309333,
            'removed_by_edition': {'Honolulu 2021': 111, 'Honolulu 2022': 433, 'Honolulu 2023': 434, 'Honolulu 2024': 437,
                                   'Honolulu 2025': 743},
            'changed_by_edition': {'Amsterdam 2023': 16013}},
        # README.md: half rows from 8 of the 17 mixed-distance marathon lists; DATA-CARD.md known issues.
        'readme': {'mixed_lists': 17, 'mixed_lists_with_half_rows': 8, 'stamp_tolerance_pct': 0.5},
        'data_card': {'lemignano_2012_rows': 631, 'kilkenny_2025_rows_ge_24h': 114},
        # person-ids-v5.1-README.md and person-ids-v5.1-checks.txt.
        'person_links': {
            'rows': 15715888, 'linked': 15031404, 'persons': 7448629, 'persons_2plus_series': 1942958,
            'persons_half_and_marathon': 952539,
            'confidence_rows': {'medium': 5647726, 'high': 5528395, 'low_noage': 2010777, 'low': 1334714, 'unlinked': 684484,
                                'medium_variant': 295683, 'low_noage_series': 78124, 'low_nosex': 71006,
                                'low_city_pace': 31219, 'high_elite': 17720, 'low_carryover': 16040},
            'unlinked_reason': {'no_published_sex': 326467, 'noage_no_compatible': 296770, 'noage_ambiguous': 25462,
                                'placeholder_name': 19054, 'single_token_wide_interval': 7972, 'no_name': 4409,
                                'common_name_wide_interval': 2295, 'post51_same_race_collision': 1240,
                                'excluded_by_record_flag': 436, 'nosex_same_race_collision': 318,
                                'post_comb_same_event_collision': 36, 'noage_same_race_collision': 18,
                                'same_race_collision': 6, 'inconsistent_age_text': 1},
            'sex_source': {'none': 403232, 'published': 15104725, 'category': 207931}},
    },
}
# What a review of each combined release accepted (docs/evidence/2026-11-14/release-20261113-1113). Anything else fails.
# - baseline_equal: members whose marathon values must equal the baseline's; its bytes are then kept.
# - left_out: the rows the ROW_RULE removes (distinct rows; a row can carry two of the flags).
# - edition_wide_kept: the editions whose every row carries a `kept_when_edition_wide` flag, by flag, with their rows.
# - written_rows: marathon rows written.
# - known_mismatches: reconciliation checks reviewed as real mismatches (family, check); still written as mismatches.
REVIEWED = {
    'pace-notes-marathon-half-20261113-1113': {
        'baseline_equal': ['race_conditions', 'course_profiles', 'course_segments'],
        # Read on 2026-11-14 after ruling R2: 2,431 rows carry a flag of the rule; 448 of them are every row of four small
        # editions and stay (none carries another flag of the rule), so 1,983 are left out and 7,820,439 written.
        'left_out': 1983, 'written_rows': 7820439,
        'edition_wide_kept': {
            'pending_review_flags.sportstats_nonfinish_status': {
                'King George Island, TBD: Antarctica Marathon & Half Marathon - Voyage 2 2019': 116},
            'qa_row_flags.finish_equals_earlier_split': {
                'Ottawa, ON: Ottawa Fall Colours Run 2010': 105, 'TBD, TBD: Run Barbados Festival 2002': 95,
                'TBD, TBD: Run Barbados Festival 2003': 132}},
        # Read on 2026-11-14. The two edition tables are not the same table: on the marathon side edition_meta.parquet
        # keeps an official count for 4 excluded editions (no rows) and the status `unverified` for the 17 mixed-distance
        # lists where EDITION-TIERS.csv is blank; on the half side edition_meta.parquet has 273 `no_rows` editions that
        # EDITION-TIERS.csv does not list and lacks 13 that it does (the 8 half lists taken from marathon lists among
        # them). The marathon tier fields agree on all 2,901 editions, which is what this adapter writes; the half pages
        # must read their tiers from EDITION-TIERS.csv or EDITIONS.json.
        'known_mismatches': [
            ['editions_marathon', 'EDITION-TIERS.csv against edition_meta.parquet: official count and completeness status'],
            ['editions_half', 'EDITION-TIERS.csv against edition_meta.parquet: the same editions, tier, badge, weaker-source label, split tier and release note'],
            ['editions_half', 'EDITION-TIERS.csv against edition_meta.parquet: official count and completeness status'],
        ],
    },
}

_STARTED = time.monotonic()


def step(label):
    """A progress line on stderr (elapsed seconds), so a slow step is visible."""
    print(f'[adapt_combined {time.monotonic() - _STARTED:7.1f}s] {label}', file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------------------------------------------
# The pin
# ---------------------------------------------------------------------------------------------------------------

def check_pin(pin):
    """The pin's shape: a combined tag, the checksum file, the CORE archive and every other asset with a digest, the
    baseline named in full, and a reviewed tag."""
    tag = pin.get('tag', '')
    if pin.get('layout') != LAYOUT or not COMBINED_TAG.fullmatch(tag):
        fail('the pin is not a combined-layout release (analysis/release.json layout "combined", tag '
             'pace-notes-marathon-half-YYYYMMDD-HHMM)')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', pin.get('repository', '')):
        fail('the pin names no repository')
    sums = pin.get('checksums', {})
    if not re.fullmatch(r'RELEASE-SHA256SUMS[A-Za-z0-9_.-]*\.txt', sums.get('asset', '')) or not is_digest(sums.get('sha256')):
        fail('the pin must name the release checksum file and its digest')
    core = pin.get('core', {})
    if (not str(core.get('asset', '')).endswith('.tar.gz') or not re.fullmatch(r'[A-Za-z0-9_.-]+', core.get('folder', ''))
            or not is_digest(core.get('sha256sums_sha256')) or not is_digest(core.get('manifest_sha256'))):
        fail('the pin must name the CORE archive, its folder and the digests of its SHA256SUMS.txt and MANIFEST.json')
    assets = pin.get('assets', {})
    if set(assets) != PINNED_ASSETS | {core['asset']} or not all(is_digest(v) for v in assets.values()):
        fail(f"the pin must list exactly these assets with digests: {sorted(PINNED_ASSETS | {core['asset']})}")
    baseline = pin.get('baseline', {})
    if (not re.fullmatch(r'[A-Za-z0-9_.-]+', baseline.get('tag', '')) or not str(baseline.get('asset', '')).endswith('.tar.gz')
            or not is_digest(baseline.get('sha256')) or not is_digest(baseline.get('checksums_sha256'))
            or not baseline.get('checksums_asset')):
        fail('the pin must name the baseline release, its CORE archive and checksum file with digests')
    for table, name in ((REVIEWED, 'REVIEWED'), (ROW_RULE, 'ROW_RULE'), (IDENTITY, 'IDENTITY'), (CLAIMS, 'CLAIMS')):
        if tag not in table:
            fail(f'{tag} has no reviewed adapter expectations ({name} in analysis/adapt_combined.py)')
    return pin


def load_pin(path=PIN_PATH):
    return check_pin(json.loads(Path(path).read_text()))


# ---------------------------------------------------------------------------------------------------------------
# The source files
# ---------------------------------------------------------------------------------------------------------------

def core_members(pin, archive, root, core_dir=None):
    """The 23 CORE members in `<root>/release-assets/core`, each equal to the digest the archive's own SHA256SUMS.txt
    lists; that file and MANIFEST.json have the pinned digests. Unpacked from the verified archive, or hard-linked
    from an already unpacked `core_dir`."""
    folder = root / CORE_DIR
    folder.mkdir(parents=True, exist_ok=True)
    if core_dir is not None:
        for name in sorted(CORE_MEMBERS):
            if not (core_dir / name).is_file():
                fail(f'{core_dir} has no {name}')
            if (core_dir / name).resolve() != (folder / name).resolve():
                place(core_dir / name, folder / name)
    else:
        seen = set()
        with tarfile.open(archive, 'r:gz') as tar:
            for member in tar:
                if member.isdir():
                    continue
                path = Path(member.name)
                if (not member.isfile() or path.is_absolute() or '..' in path.parts or len(path.parts) != 2
                        or path.parts[0] != pin['core']['folder'] or path.name not in CORE_MEMBERS or path.name in seen):
                    fail(f'the CORE archive has an unexpected, unsafe or repeated member {member.name}')
                with tar.extractfile(member) as source, (folder / path.name).open('wb') as target:
                    shutil.copyfileobj(source, target)
                seen.add(path.name)
        if seen != CORE_MEMBERS:
            fail(f'the CORE archive lacks {sorted(CORE_MEMBERS - seen)}')
    if file_sha256(folder / 'SHA256SUMS.txt') != pin['core']['sha256sums_sha256']:
        fail('the CORE SHA256SUMS.txt differs from the pinned digest')
    listed = parse_sums((folder / 'SHA256SUMS.txt').read_text(), 'CORE SHA256SUMS.txt')
    if set(listed) != CORE_MEMBERS - {'SHA256SUMS.txt'}:
        fail('the CORE SHA256SUMS.txt does not list exactly the other 22 members')
    for name, digest in listed.items():
        if file_sha256(folder / name) != digest:
            fail(f'CORE member {name} differs from the digest in SHA256SUMS.txt')
    if listed['MANIFEST.json'] != pin['core']['manifest_sha256']:
        fail('the CORE MANIFEST.json differs from the pinned digest')
    return folder


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
            if (baseline_dir / name).resolve() != (folder / name).resolve():
                place(baseline_dir / name, folder / name)
    else:
        sums = adapt_master.fetch_release(pin['repository'], base['tag'], base['checksums_asset'], base['checksums_sha256'],
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
    return folder


# ---------------------------------------------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------------------------------------------

class Checks:
    """The reconciliation record: every check with its source, its expected and its measured value."""

    def __init__(self):
        self.items = []

    def add(self, family, check, source, expected, measured):
        """A recount of a stated value; `expected` None records a measurement nobody states."""
        ok = None if expected is None else expected == measured
        self.items.append({'family': family, 'check': check, 'source': source, 'expected': expected, 'measured': measured, 'ok': ok})
        return ok

    def failed(self):
        return [c for c in self.items if c['ok'] is False]

    def summary(self):
        families = {}
        for c in self.items:
            f = families.setdefault(c['family'], {'checks': 0, 'matched': 0, 'mismatched': 0, 'measured_only': 0})
            f['checks'] += 1
            f['matched' if c['ok'] else 'measured_only' if c['ok'] is None else 'mismatched'] += 1
        return {'checks': len(self.items), 'mismatched': len(self.failed()), 'by_family': families}


def pairs(db, query):
    """A two-column result as a dict with sorted keys (None becomes 'none')."""
    return {('none' if k is None else str(k)): v for k, v in sorted(db.execute(query).fetchall(), key=lambda r: str(r[0]))}


def csv_table(db, name, path):
    db.execute(f"""CREATE OR REPLACE TABLE {name} AS SELECT * FROM read_csv({literal(path)}, header=true, all_varchar=true,
      quote='"', escape='"', max_line_size=10000000, strict_mode=false, nullstr='')""")


def open_sources(db, core, assets):
    """Views over the verified release files (both distances), and the per-edition counts every later check reads."""
    for view, name in (('rr', 'race_records'), ('em', 'edition_meta'), ('qa', 'qa_row_flags'), ('rf', 'record_flags'),
                       ('pend', 'pending_review_flags'), ('rx', 'RELEASE-ROW-EXCLUSIONS'), ('src', 'sources'),
                       ('wx', 'race_conditions'), ('cp', 'course_profiles'), ('cs', 'course_segments')):
        db.execute(f"CREATE OR REPLACE VIEW {view} AS SELECT * FROM read_parquet({literal(core / (name + '.parquet'))})")
    db.execute(f"CREATE OR REPLACE VIEW lk AS SELECT * FROM read_parquet({literal(assets[LINKS])})")
    db.execute(f"CREATE OR REPLACE VIEW pp AS SELECT * FROM read_parquet({literal(assets[PERSONS])})")
    csv_table(db, 'tiers_csv', core / 'EDITION-TIERS.csv')
    csv_table(db, 'excl_csv', core / 'RELEASE-EXCLUSIONS.csv')
    csv_table(db, 'sums_csv', core / 'EDITION-CHECKSUMS.csv')
    columns = [c for c, *_ in db.execute('DESCRIBE rr').fetchall()]
    if columns != SOURCE_COLUMNS:
        fail(f'race_records.parquet does not have the 27 columns of a combined release: {columns}')
    any_split = ' OR '.join(f'{f} IS NOT NULL' for f in INTERMEDIATE)
    db.execute(f"""CREATE OR REPLACE TABLE ed AS SELECT distance, source_db, city, year, count(*) AS n, count(finish_time) AS n_fin,
      count(split_5km) AS n_5k, count(*) FILTER(WHERE {any_split}) AS n_split FROM rr GROUP BY ALL""")


def reconcile(db, pin, core, assets, baseline):
    """Every recount before anything is written. Returns the Checks; the caller decides what a mismatch means."""
    tag = pin['tag']
    claims, rule = CLAIMS[tag], ROW_RULE[tag]
    checks = Checks()
    manifest = json.loads((core / 'MANIFEST.json').read_text())
    if manifest.get('tag') != tag or manifest.get('row_key') != ['source_db', 'id']:
        fail('the CORE MANIFEST.json is not for the pinned tag, or names another row key')
    open_sources(db, core, assets)

    step('manifest: files')
    for name, entry in sorted(manifest['files'].items()):
        path = core / name
        checks.add('manifest_files', f'{name}: bytes', 'MANIFEST.json files', entry['bytes'], path.stat().st_size)
        if entry.get('rows') is not None:
            checks.add('manifest_files', f'{name}: rows', 'MANIFEST.json files', entry['rows'],
                       scalar(db, f'SELECT count(*) FROM read_parquet({literal(path)})'))

    step('manifest: counts by distance')
    for distance, stated in sorted(manifest['by_distance'].items()):
        family, source = f'counts_{distance}', 'MANIFEST.json by_distance (README.md and DATA-CARD.md repeat it)'
        where = f"distance='{distance}'"
        checks.add(family, 'result rows', source, stated['n_records'], scalar(db, f'SELECT count(*) FROM rr WHERE {where}'))
        checks.add(family, 'rows by source database', source, dict(sorted(stated['rows_by_source_db'].items())),
                   pairs(db, f'SELECT source_db, count(*) FROM rr WHERE {where} GROUP BY 1'))
        checks.add(family, 'editions with rows', source, stated['editions'], scalar(db, f'SELECT count(*) FROM ed WHERE {where}'))
        checks.add(family, 'city keys', source, stated['city_keys'], scalar(db, f'SELECT count(DISTINCT city) FROM ed WHERE {where}'))
        checks.add(family, 'race names', source, stated['races'], scalar(db, f'SELECT count(DISTINCT race) FROM rr WHERE {where}'))
        checks.add(family, 'first and last year', source, stated['years'],
                   list(db.execute(f'SELECT min(year), max(year) FROM rr WHERE {where}').fetchone()))
        checks.add(family, 'rows with a 5 km split', source, stated['rows_with_5km'],
                   scalar(db, f'SELECT count(split_5km) FROM rr WHERE {where}'))
        tiered = f"""(SELECT t.verification_tier, t.split_tier, ed.n FROM tiers_csv t LEFT JOIN ed
          ON ed.distance=t.distance AND ed.source_db=t.source_db AND ed.city=t.city AND ed.year=t.year::BIGINT WHERE t.{where})"""
        measured = {t: {'editions': e, 'rows': r} for t, e, r in db.execute(
            f'SELECT verification_tier, count(*), coalesce(sum(n), 0)::BIGINT FROM {tiered} GROUP BY 1').fetchall()}
        checks.add(family, 'verification tiers: editions and rows (EDITION-TIERS.csv tiers, rows recounted)', source,
                   dict(sorted(stated['tiers'].items())), dict(sorted(measured.items())))
        measured = {t: {'editions': e, 'rows': r} for t, e, r in db.execute(
            f'SELECT split_tier, count(*), sum(n)::BIGINT FROM {tiered} WHERE n IS NOT NULL GROUP BY 1').fetchall()}
        checks.add(family, 'split tiers: editions and rows (EDITION-TIERS.csv tiers, rows recounted)', source,
                   dict(sorted(stated['split_tiers'].items())), dict(sorted(measured.items())))
        flags = db.execute('SELECT ' + ', '.join(f'coalesce(sum({f}::INT), 0)::BIGINT' for f in QA_FLAGS)
                           + f', count(sex_from_category) FROM qa WHERE {where}').fetchone()
        checks.add(family, 'row flags (rows kept)', source, dict(sorted(stated['qa_row_flags'].items())),
                   dict(sorted(zip(QA_FLAGS + ['sex_from_category'], flags))))
        checks.add(family, 'pending-review flags (rows in CORE)', source, dict(sorted(stated['pending_flags'].items())),
                   pairs(db, f'SELECT flag, count(*) FROM pend WHERE {where} AND present_in_core GROUP BY 1'))
        measured = {c: {'editions_whole': w, 'editions_partial': p, 'rows': n} for c, w, p, n in db.execute(f"""SELECT category,
          count(*) FILTER(WHERE scope='whole_edition'), count(*) FILTER(WHERE scope='rows'), sum(n_rows::BIGINT)::BIGINT
          FROM excl_csv WHERE {where} GROUP BY 1""").fetchall()}
        checks.add(family, 'release exclusions by category', source, dict(sorted(stated['exclusions'].items())), dict(sorted(measured.items())))
        checks.add(family, 'rows excluded from the release', source, stated['excluded_rows'], scalar(db, f'SELECT count(*) FROM rx WHERE {where}'))
        checks.add(family, 'excluded row ids by category equal RELEASE-EXCLUSIONS.csv', 'RELEASE-ROW-EXCLUSIONS.parquet against RELEASE-EXCLUSIONS.csv',
                   pairs(db, f'SELECT category, sum(n_rows::BIGINT)::BIGINT FROM excl_csv WHERE {where} GROUP BY 1'),
                   pairs(db, f'SELECT category, count(*) FROM rx WHERE {where} GROUP BY 1'))

    step('documents: prose claims')
    any_split = ' OR '.join(f'{f} IS NOT NULL' for f in INTERMEDIATE)
    checks.add('documents', 'editions whose split tier is not "finish_time_only exactly when under half the rows have an intermediate split"',
               'README.md, Verification tiers', 0, scalar(db, """SELECT count(*) FROM em JOIN ed USING(distance, source_db, city, year)
                 WHERE em.split_tier IS DISTINCT FROM CASE WHEN 2 * ed.n_split < ed.n THEN 'finish_time_only' ELSE 'splits' END"""))
    checks.add('documents', 'mixed-distance marathon lists (release_note says recovered by published category)', 'README.md notes',
               claims['readme']['mixed_lists'], scalar(db, "SELECT count(*) FROM em WHERE distance='marathon' AND release_note LIKE 'recovered by published category%'"))
    checks.add('documents', 'mixed-distance lists that supply half rows (source_db = full, distance = half)', 'README.md',
               claims['readme']['mixed_lists_with_half_rows'], scalar(db, "SELECT count(*) FROM ed WHERE distance='half' AND source_db='full'"))
    tolerance = claims['readme']['stamp_tolerance_pct'] / 100
    checks.add('documents', f"stamped editions whose finishes with a time differ from the official count by more than {claims['readme']['stamp_tolerance_pct']}%",
               'DATA-CARD.md, Verification', 0, scalar(db, f"""SELECT count(*) FROM em JOIN ed USING(distance, source_db, city, year)
                 WHERE em.verification_tier IN ('stamped', 'stamped_weaker_source') AND (em.official_finishers IS NULL
                   OR abs(ed.n_fin / em.official_finishers - 1) > {tolerance})"""))
    checks.add('documents', 'verified badge exactly on the two stamped tiers; weaker-source label exactly on stamped_weaker_source', 'README.md, Verification tiers', 0,
               scalar(db, """SELECT count(*) FROM em WHERE verified_badge IS DISTINCT FROM (verification_tier IN ('stamped', 'stamped_weaker_source'))
                 OR weaker_source IS DISTINCT FROM (verification_tier = 'stamped_weaker_source')"""))
    checks.add('documents', 'Lemignano SDAM 2012 marathon rows', 'DATA-CARD.md, Known issues', claims['data_card']['lemignano_2012_rows'],
               scalar(db, "SELECT count(*) FROM rr WHERE distance='marathon' AND city LIKE '%Lemignano%' AND year=2012"))
    checks.add('documents', 'Kilkenny 2025 marathon rows flagged finish_ge_24h', 'DATA-CARD.md, Known issues', claims['data_card']['kilkenny_2025_rows_ge_24h'],
               scalar(db, "SELECT count(*) FROM qa WHERE distance='marathon' AND city LIKE 'Kilkenny%' AND year=2025 AND finish_ge_24h"))

    step('id contract')
    source = 'ID-CONTRACT.md'
    checks.add('id_contract', 'rows whose (source_db, id) is null or repeated', source, 0,
               scalar(db, 'SELECT count(*) - count(DISTINCT (source_db, id)) FROM rr') + scalar(db, 'SELECT count(*) FROM rr WHERE id IS NULL OR source_db IS NULL'))
    checks.add('id_contract', 'ids used in both id spaces (the claim is that the spaces overlap)', source, True,
               scalar(db, 'SELECT count(*) FROM (SELECT id FROM rr GROUP BY id HAVING count(DISTINCT source_db) > 1)') > 0)
    checks.add('id_contract', 'marathon rows outside source_db full', source, 0, scalar(db, "SELECT count(*) FROM rr WHERE distance='marathon' AND source_db<>'full'"))
    checks.add('id_contract', 'qa_row_flags keys that are repeated', source, 0, scalar(db, 'SELECT count(*) - count(DISTINCT (source_db, record_id)) FROM qa'))
    for table in ('qa', 'rf', 'pend'):
        extra = ' WHERE t.present_in_core' if table == 'pend' else ''
        checks.add('id_contract', f'{table} keys with no race_records row', source, 0,
                   scalar(db, f'SELECT count(*) FROM (SELECT DISTINCT source_db, record_id FROM {table} t{extra}) t ANTI JOIN rr ON rr.source_db=t.source_db AND rr.id=t.record_id'))
    checks.add('id_contract', 'excluded row ids still in race_records', 'README.md, Excluded from this release', 0,
               scalar(db, 'SELECT count(*) FROM rx SEMI JOIN rr ON rr.source_db=rx.source_db AND rr.id=rx.record_id'))
    contract = rows(db, """SELECT count(*) FILTER(WHERE distance_km IS DISTINCT FROM 42.195) AS distance_km,
      count(*) FILTER(WHERE finish_time IS DISTINCT FROM split_42_2km) AS finish_column,
      count(*) FILTER(WHERE split_21_1km IS NOT NULL OR bib IS NOT NULL OR source_runner_id IS NOT NULL) AS half_columns,
      count(*) FILTER(WHERE sex IS NOT NULL AND sex NOT IN ('M', 'F', 'X')) AS sex_values,
      count(*) FILTER(WHERE city IS NULL OR year IS NULL OR race IS NULL) AS null_labels FROM rr WHERE distance='marathon'""")[0]
    checks.add('id_contract', 'marathon rows that break the record contract the adapter relies on', 'analysis/adapt_combined.py',
               {k: 0 for k in contract}, contract)

    step('edition tables')
    for distance in ('marathon', 'half'):
        source = 'EDITION-TIERS.csv, EDITIONS.json, races_summary.json, edition_meta.parquet'
        where = f"distance='{distance}'"
        differ = rows(db, f"""SELECT count(*) AS editions, count(*) FILTER(WHERE ed.city IS NULL AND t.n_records::BIGINT <> 0) AS without_rows,
          count(*) FILTER(WHERE t.city IS NULL) AS not_listed,
          count(*) FILTER(WHERE ed.city IS NOT NULL AND t.n_records::BIGINT IS DISTINCT FROM ed.n) AS n_records,
          count(*) FILTER(WHERE ed.city IS NOT NULL AND t.n_with_finish::BIGINT IS DISTINCT FROM ed.n_fin) AS n_with_finish,
          count(*) FILTER(WHERE ed.city IS NOT NULL AND t.n_with_5km::BIGINT IS DISTINCT FROM ed.n_5k) AS n_with_5km,
          count(*) FILTER(WHERE ed.city IS NOT NULL AND t.n_with_any_intermediate_split::BIGINT IS DISTINCT FROM ed.n_split) AS n_with_any_intermediate_split
          FROM (SELECT * FROM tiers_csv WHERE {where}) t FULL JOIN (SELECT * FROM ed WHERE {where}) ed
            ON t.source_db=ed.source_db AND t.city=ed.city AND t.year::BIGINT=ed.year""")[0]
        checks.add(f'editions_{distance}', 'EDITION-TIERS.csv counts against the rows, edition by edition', source,
                   {k: 0 for k in differ if k != 'editions'}, {k: v for k, v in differ.items() if k != 'editions'})
        checks.add(f'editions_{distance}', 'EDITION-TIERS.csv rows (editions with rows and excluded editions)', 'MANIFEST.json by_distance tiers',
                   sum(t['editions'] for t in manifest['by_distance'][distance]['tiers'].values()), differ['editions'])
        differ = rows(db, f"""SELECT count(*) FILTER(WHERE em.city IS NULL) AS only_in_edition_tiers, count(*) FILTER(WHERE t.city IS NULL) AS only_in_edition_meta,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND t.verification_tier IS DISTINCT FROM em.verification_tier) AS verification_tier,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND (lower(t.verified_badge)='true') IS DISTINCT FROM em.verified_badge) AS verified_badge,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND em.verification_tier<>'excluded'
            AND (lower(t.weaker_source)='true') IS DISTINCT FROM em.weaker_source) AS weaker_source,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND t.split_tier IS DISTINCT FROM em.split_tier) AS split_tier,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND t.release_note IS DISTINCT FROM em.release_note) AS release_note,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND t.official_finishers::DOUBLE IS DISTINCT FROM em.official_finishers) AS official_finishers,
          count(*) FILTER(WHERE t.city IS NOT NULL AND em.city IS NOT NULL AND t.completeness_status IS DISTINCT FROM em.completeness_status) AS completeness_status
          FROM (SELECT * FROM tiers_csv WHERE {where}) t FULL JOIN (SELECT * FROM em WHERE {where}) em
            ON t.source_db=em.source_db AND t.city=em.city AND t.year::BIGINT=em.year""")[0]
        tier_fields = ['only_in_edition_tiers', 'only_in_edition_meta', 'verification_tier', 'verified_badge', 'weaker_source', 'split_tier', 'release_note']
        checks.add(f'editions_{distance}', 'EDITION-TIERS.csv against edition_meta.parquet: the same editions, tier, badge, weaker-source label, split tier and release note',
                   source, {k: 0 for k in tier_fields}, {k: differ[k] for k in tier_fields})
        checks.add(f'editions_{distance}', 'EDITION-TIERS.csv against edition_meta.parquet: official count and completeness status',
                   source, {'official_finishers': 0, 'completeness_status': 0}, {k: differ[k] for k in ('official_finishers', 'completeness_status')})
        if distance == 'marathon' and any(differ[k] for k in tier_fields):
            fail(f'EDITION-TIERS.csv and edition_meta.parquet disagree on a marathon edition’s tier fields; the adapter writes the CSV’s and requires the two to agree: {differ}')
        checks.add(f'editions_{distance}', 'editions in only one of EDITION-TIERS.csv and edition_meta.parquet, by table and tier', 'measured', None, {
            'only_in_edition_meta': pairs(db, f"""SELECT em.verification_tier, count(*) FROM em ANTI JOIN tiers_csv t ON t.distance=em.distance AND t.source_db=em.source_db
              AND t.city=em.city AND t.year::BIGINT=em.year WHERE em.{where} GROUP BY 1"""),
            'only_in_edition_tiers': pairs(db, f"""SELECT t.source_db || ' ' || t.verification_tier, count(*) FROM tiers_csv t ANTI JOIN em ON t.distance=em.distance
              AND t.source_db=em.source_db AND t.city=em.city AND t.year::BIGINT=em.year WHERE t.{where} GROUP BY 1""")})
    editions_json = json.loads((core / 'EDITIONS.json').read_text())
    db.execute('CREATE OR REPLACE TABLE ej (distance VARCHAR, source_db VARCHAR, city VARCHAR, year BIGINT, n_records BIGINT, tier VARCHAR, '
               'hold_note VARCHAR, badge_label VARCHAR, sha256_records VARCHAR, tier_before VARCHAR)')
    db.executemany('INSERT INTO ej VALUES (?,?,?,?,?,?,?,?,?,?)', [
        [e['distance'], e['source_db'], e['city'], e['year'], e['n_records'], e['verification_tier'], e.get('hold_note'),
         e.get('badge_label') or None, e.get('sha256_records'), e.get('tier_before_release_override')] for e in editions_json])
    differ = rows(db, """SELECT count(*) FILTER(WHERE t.city IS NULL OR j.city IS NULL) AS unmatched,
      count(*) FILTER(WHERE t.n_records::BIGINT IS DISTINCT FROM j.n_records) AS n_records,
      count(*) FILTER(WHERE t.verification_tier IS DISTINCT FROM j.tier) AS verification_tier,
      count(*) FILTER(WHERE t.hold_note IS DISTINCT FROM j.hold_note) AS hold_note,
      count(*) FILTER(WHERE t.badge_label IS DISTINCT FROM j.badge_label) AS badge_label
      FROM tiers_csv t FULL JOIN ej j ON t.distance=j.distance AND t.source_db=j.source_db AND t.city=j.city AND t.year::BIGINT=j.year""")[0]
    checks.add('editions_both', 'EDITIONS.json against EDITION-TIERS.csv, edition by edition', 'EDITIONS.json', {k: 0 for k in differ}, differ)
    differ = rows(db, """SELECT count(*) FILTER(WHERE s.city IS NULL OR j.city IS NULL) AS unmatched,
      count(*) FILTER(WHERE s.n_records::BIGINT IS DISTINCT FROM j.n_records) AS n_records,
      count(*) FILTER(WHERE s.sha256_records IS DISTINCT FROM j.sha256_records) AS sha256_records
      FROM sums_csv s FULL JOIN ej j ON s.distance=j.distance AND s.source_db=j.source_db AND s.city=j.city AND s.year::BIGINT=j.year""")[0]
    checks.add('editions_both', 'EDITION-CHECKSUMS.csv against EDITIONS.json, edition by edition', 'EDITION-CHECKSUMS.csv', {k: 0 for k in differ}, differ)
    summary = json.loads((core / 'races_summary.json').read_text())
    db.execute('CREATE OR REPLACE TABLE rs (distance VARCHAR, source_db VARCHAR, city VARCHAR, year BIGINT, n_records BIGINT, n_with_5km BIGINT)')
    db.executemany('INSERT INTO rs VALUES (?,?,?,?,?,?)', [[e['distance'], e['source_db'], e['city'], e['year'], e['n_records'], e['n_with_5km']] for e in summary])
    checks.add('editions_both', 'races_summary.json editions that differ from the rows', 'races_summary.json', 0, scalar(db, """SELECT count(*)
      FROM rs FULL JOIN ed USING(distance, source_db, city, year) WHERE rs.n_records IS DISTINCT FROM ed.n OR rs.n_with_5km IS DISTINCT FROM ed.n_5k"""))
    checks.add('editions_marathon', 'editions held for review that carry a hold note', 'EDITION-TIERS.csv hold_note (measured; the owner’s intake note expects one per held edition)', None,
               {'held_for_review': scalar(db, "SELECT count(*) FROM tiers_csv WHERE distance='marathon' AND verification_tier='held_for_review'"),
                'with_hold_note': scalar(db, "SELECT count(*) FROM tiers_csv WHERE distance='marathon' AND verification_tier='held_for_review' AND hold_note IS NOT NULL"),
                'hold_notes_on_other_tiers': scalar(db, "SELECT count(*) FROM tiers_csv WHERE distance='marathon' AND verification_tier<>'held_for_review' AND hold_note IS NOT NULL")})
    checks.add('editions_marathon', 'tier source the adapter writes: EDITION-TIERS.csv (editions by tier)',
               'EDITION-TIERS.csv, the tier table that reproduces the README; edition_meta.parquet must agree on every marathon edition (checked above)', None,
               pairs(db, "SELECT verification_tier, count(*) FROM tiers_csv WHERE distance='marathon' GROUP BY 1"))
    checks.add('editions_marathon', 'half-only edition_meta columns that carry a value on a marathon row', 'edition_meta.parquet', 0,
               scalar(db, "SELECT count(*) FROM em WHERE distance='marathon' AND (" + ' OR '.join(f'"{c}" IS NOT NULL' for c in EDITION_META_HALF_ONLY) + ')'))
    values = rows(db, """SELECT count(*) AS record_ids, count(*) FILTER(WHERE with_detail = 0) AS without_any_detail FROM (
      SELECT record_id, count(detail) AS with_detail FROM rf WHERE distance='marathon' GROUP BY 1)""")[0]
    values['flags_with_a_value_column'] = 0
    values['rows_by_flag_with_detail'] = pairs(db, "SELECT flag, count(detail) FROM rf WHERE distance='marathon' GROUP BY 1")
    checks.add('editions_marathon', 'record_flags (long format): no column holds a flag’s 0/1 value, only `detail` text', 'record_flags.parquet (measured)', None, values)

    step('person links against the results')
    people, source = claims['person_links'], 'person-ids-v5.1-README.md, person-ids-v5.1-checks.txt'
    checks.add('person_links', 'link rows', source, people['rows'], scalar(db, 'SELECT count(*) FROM lk'))
    checks.add('person_links', 'link rows by distance equal the CORE rows by distance', source,
               pairs(db, 'SELECT distance, count(*) FROM rr GROUP BY 1'), pairs(db, 'SELECT distance, count(*) FROM lk GROUP BY 1'))
    checks.add('person_links', 'link keys that are null or repeated', source, 0,
               scalar(db, 'SELECT count(*) - count(DISTINCT (source_db, record_id)) FROM lk') + scalar(db, 'SELECT count(*) FROM lk WHERE record_id IS NULL OR source_db IS NULL'))
    checks.add('person_links', 'CORE keys missing from the links', source, 0,
               scalar(db, 'SELECT count(*) FROM rr ANTI JOIN lk ON lk.source_db=rr.source_db AND lk.record_id=rr.id'))
    checks.add('person_links', 'link keys not in CORE', source, 0,
               scalar(db, 'SELECT count(*) FROM lk ANTI JOIN rr ON lk.source_db=rr.source_db AND lk.record_id=rr.id'))
    labels = rows(db, """SELECT count(*) FILTER(WHERE lk.distance IS DISTINCT FROM rr.distance) AS distance,
      count(*) FILTER(WHERE lk.city IS DISTINCT FROM rr.city OR lk.year IS DISTINCT FROM rr.year) AS edition,
      count(*) FILTER(WHERE lk.race IS DISTINCT FROM rr.race) AS race,
      count(*) FILTER(WHERE lk.finish_raw IS DISTINCT FROM rr.finish_time) AS finish,
      count(*) FILTER(WHERE lk.age IS DISTINCT FROM rr.age) AS age
      FROM lk JOIN rr ON lk.source_db=rr.source_db AND lk.record_id=rr.id""")[0]
    checks.add('person_links', 'link rows whose labels differ from the result row', source, {k: 0 for k in labels}, labels)
    checks.add('person_links', 'linked rows', source, people['linked'], scalar(db, 'SELECT count(person_id) FROM lk'))
    checks.add('person_links', 'persons (distinct person_id)', source, people['persons'], scalar(db, 'SELECT count(DISTINCT person_id) FROM lk'))
    checks.add('person_links', 'persons.parquet rows', source, people['persons'], scalar(db, 'SELECT count(*) FROM pp'))
    checks.add('person_links', 'persons.parquet ids, result counts and marathon counts that differ from the links', source, 0, scalar(db, """SELECT count(*)
      FROM (SELECT person_id, count(*) AS n, count(*) FILTER(WHERE distance='marathon') AS nm FROM lk WHERE person_id IS NOT NULL GROUP BY 1) l
      FULL JOIN pp USING(person_id) WHERE l.person_id IS NULL OR pp.person_id IS NULL OR l.n IS DISTINCT FROM pp.n_results OR l.nm IS DISTINCT FROM pp.n_marathons"""))
    checks.add('person_links', 'rows by confidence', source, dict(sorted(people['confidence_rows'].items())),
               pairs(db, "SELECT coalesce(confidence, 'unlinked'), count(*) FROM lk GROUP BY 1"))
    checks.add('person_links', 'unlinked rows by reason', source, dict(sorted(people['unlinked_reason'].items())),
               pairs(db, 'SELECT unlinked_reason, count(*) FROM lk WHERE unlinked_reason IS NOT NULL GROUP BY 1'))
    checks.add('person_links', 'rows by sex source', source, dict(sorted(people['sex_source'].items())),
               pairs(db, 'SELECT sex_source, count(*) FROM lk GROUP BY 1'))
    checks.add('person_links', 'persons with more than one sex', source, 0,
               scalar(db, 'SELECT count(*) FROM (SELECT person_id FROM lk WHERE person_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT sex) > 1)'))
    checks.add('person_links', 'persons with two rows in one edition (distance, city, year)', source, 0,
               scalar(db, 'SELECT count(*) FROM (SELECT person_id FROM lk WHERE person_id IS NOT NULL GROUP BY person_id, distance, city, year HAVING count(*) > 1)'))
    checks.add('person_links', 'persons in two or more race series', source, people['persons_2plus_series'],
               scalar(db, 'SELECT count(*) FROM (SELECT person_id FROM lk WHERE person_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT race_series) > 1)'))
    checks.add('person_links', 'persons with a half and a marathon', source, people['persons_half_and_marathon'],
               scalar(db, 'SELECT count(*) FROM (SELECT person_id FROM lk WHERE person_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT distance) > 1)'))
    checks.add('person_links', 'link rows whose sex is not the published sex or, where it is blank, the published category’s', source, 0, scalar(db, """SELECT count(*)
      FROM lk JOIN rr ON lk.source_db=rr.source_db AND lk.record_id=rr.id LEFT JOIN qa ON qa.source_db=rr.source_db AND qa.record_id=rr.id
      WHERE lk.sex IS DISTINCT FROM CASE WHEN rr.sex='X' THEN NULL ELSE coalesce(rr.sex, qa.sex_from_category) END
        OR lk.sex_source IS DISTINCT FROM CASE WHEN rr.sex IN ('M', 'F') THEN 'published' WHEN rr.sex IS NULL AND qa.sex_from_category IS NOT NULL THEN 'category' END"""))
    checks.add('person_links', 'marathon rows by confidence', 'measured (no document states the marathon side alone)', None,
               pairs(db, "SELECT coalesce(confidence, 'unlinked'), count(*) FROM lk WHERE distance='marathon' GROUP BY 1"))

    step('rows the adapter leaves out')
    known = set(rule['pending_review_flags']) | set(rule['kept_unlabelled'])
    unknown = [f for (f,) in db.execute("SELECT DISTINCT flag FROM pend WHERE distance='marathon'").fetchall() if f not in known]
    if unknown:
        fail(f'pending-review flags on marathon rows that the row rule has not reviewed: {sorted(unknown)}')
    qa_columns = [c for c, *_ in db.execute('DESCRIBE qa').fetchall()]
    if qa_columns != ['distance', 'source_db', 'record_id', 'city', 'year'] + QA_FLAGS + ['sex_from_category']:
        fail(f'qa_row_flags.parquet has columns the row rule has not reviewed: {qa_columns}')
    parts = [f"SELECT record_id, 'pending_review_flags.{f}' AS reason FROM pend WHERE distance='marathon' AND source_db='full' AND present_in_core AND flag='{f}'"
             for f in rule['pending_review_flags']]
    parts += [f"SELECT record_id, 'qa_row_flags.{f}' AS reason FROM qa WHERE distance='marathon' AND source_db='full' AND {f}" for f in rule['qa_row_flags']]
    db.execute('CREATE OR REPLACE TABLE left_out_flags AS ' + ' UNION ALL '.join(parts))
    # A flag every release row of an edition carries describes the source's layout, not the row: it removes nothing.
    if not set(rule['kept_when_edition_wide']) <= set(rule['pending_review_flags']) | set(rule['qa_row_flags']):
        fail('the row rule keeps an edition-wide flag that it does not leave out')
    wide = [('pending_review_flags.' if f in rule['pending_review_flags'] else 'qa_row_flags.') + f for f in rule['kept_when_edition_wide']]
    db.execute(f"""CREATE OR REPLACE TABLE edition_wide AS SELECT r.city, r.year, x.reason, count(*) AS n
      FROM left_out_flags x JOIN rr r ON r.distance='marathon' AND r.source_db='full' AND r.id=x.record_id
      JOIN ed e ON e.distance='marathon' AND e.source_db='full' AND e.city=r.city AND e.year=r.year
      WHERE x.reason IN ({', '.join(literal(w) for w in wide) or 'NULL'}) GROUP BY r.city, r.year, x.reason, e.n HAVING count(*) = e.n""")
    db.execute("""CREATE OR REPLACE TABLE left_out_kept AS SELECT x.record_id, x.reason, w.city IS NOT NULL AS edition_wide
      FROM left_out_flags x JOIN rr r ON r.distance='marathon' AND r.source_db='full' AND r.id=x.record_id
      LEFT JOIN edition_wide w ON w.city=r.city AND w.year=r.year AND w.reason=x.reason""")
    db.execute('CREATE OR REPLACE TABLE left_out AS SELECT record_id, count(*) AS flags FROM left_out_kept WHERE NOT edition_wide GROUP BY 1')
    stated = manifest['by_distance']['marathon']
    expected = {f'pending_review_flags.{f}': stated['pending_flags'].get(f, 0) for f in rule['pending_review_flags']}
    expected.update({f'qa_row_flags.{f}': stated['qa_row_flags'].get(f, 0) for f in rule['qa_row_flags']})
    measured = pairs(db, 'SELECT reason, count(*) FROM left_out_flags GROUP BY 1')
    checks.add('rows_left_out', 'rows by flag', 'MANIFEST.json by_distance.marathon (pending_flags, qa_row_flags)', dict(sorted(expected.items())),
               dict(sorted({**{k: 0 for k in expected}, **measured}.items())))
    kept = {}
    for city, year, reason, n in db.execute('SELECT city, year, reason, n FROM edition_wide ORDER BY 3, 1, 2').fetchall():
        kept.setdefault(reason, {})[f'{city} {year}'] = n
    checks.add('rows_left_out', 'rows kept although flagged, because every row of their edition carries the flag (by flag and edition)',
               'analysis/adapt_combined.py REVIEWED edition_wide_kept (lead ruling R2, 2026-11-14)', REVIEWED[tag]['edition_wide_kept'], kept)
    checks.add('rows_left_out', 'rows left out, by flag (a row can carry two)', 'measured', None,
               pairs(db, 'SELECT reason, count(*) FROM left_out_kept WHERE NOT edition_wide GROUP BY 1'))
    checks.add('rows_left_out', 'distinct rows left out', 'analysis/adapt_combined.py REVIEWED', REVIEWED[tag]['left_out'], scalar(db, 'SELECT count(*) FROM left_out'))
    checks.add('rows_left_out', 'rows carrying two of the flags that leave them out', 'measured', None, scalar(db, 'SELECT count(*) FROM left_out WHERE flags > 1'))
    checks.add('rows_left_out', 'rows with an edition-wide flag that another flag still leaves out', 'measured', None,
               scalar(db, 'SELECT count(DISTINCT record_id) FROM left_out_kept WHERE edition_wide AND record_id IN (SELECT record_id FROM left_out)'))
    checks.add('rows_left_out', 'marathon rows written', 'analysis/adapt_combined.py REVIEWED', REVIEWED[tag]['written_rows'],
               scalar(db, "SELECT count(*) FROM rr WHERE distance='marathon'") - scalar(db, 'SELECT count(*) FROM left_out'))
    checks.add('rows_left_out', 'kept, never labelled: rows with a pending flag the rule keeps', 'MANIFEST.json by_distance.marathon pending_flags',
               {f: stated['pending_flags'].get(f, 0) for f in rule['kept_unlabelled']},
               {f: scalar(db, f"SELECT count(*) FROM pend WHERE distance='marathon' AND present_in_core AND flag='{f}'") for f in rule['kept_unlabelled']})
    sex = rows(db, """SELECT count(*) FILTER(WHERE rr.sex IS NULL AND qa.sex_from_category IS NOT NULL) AS filled_from_category,
      count(*) FILTER(WHERE rr.sex IS NOT NULL AND qa.sex_from_category IS NOT NULL) AS category_on_a_published_sex,
      count(*) FILTER(WHERE qa.sex_from_category IS NOT NULL AND qa.sex_from_category NOT IN ('M', 'F')) AS category_values
      FROM rr LEFT JOIN qa ON qa.source_db=rr.source_db AND qa.record_id=rr.id WHERE rr.distance='marathon'""")[0]
    checks.add('sex', 'marathon rows whose blank sex takes the published category', 'MANIFEST.json by_distance.marathon qa_row_flags.sex_from_category',
               {'filled_from_category': stated['qa_row_flags']['sex_from_category'], 'category_on_a_published_sex': 0, 'category_values': 0}, sex)
    checks.add('sex', 'marathon rows by published sex', 'measured', None, pairs(db, "SELECT sex, count(*) FROM rr WHERE distance='marathon' GROUP BY 1"))

    step('record delta against the baseline release')
    db.execute(f"CREATE OR REPLACE VIEW base_rr AS SELECT * FROM read_parquet({literal(baseline / 'race_records.parquet')})")
    schema = [(c, t) for c, t, *_ in db.execute('DESCRIBE base_rr').fetchall()]
    if schema != RACE_RECORDS:
        fail('the baseline race_records.parquet does not have the 20 columns the adapter writes')
    differ = ' OR '.join(f'r."{c}" IS DISTINCT FROM CAST(b."{c}" AS {t})' for c, t in RACE_RECORDS if c != 'id')
    db.execute(f"""CREATE OR REPLACE TABLE base_delta AS SELECT coalesce(r.city, b.city) AS city, coalesce(r.year, b.year) AS year,
      count(*) FILTER(WHERE b.id IS NULL) AS added, count(*) FILTER(WHERE r.id IS NULL) AS removed,
      count(*) FILTER(WHERE r.id IS NOT NULL AND b.id IS NOT NULL AND ({differ})) AS changed,
      count(*) FILTER(WHERE r.id IS NOT NULL AND b.id IS NOT NULL AND NOT ({differ})) AS unchanged
      FROM (SELECT * FROM rr WHERE distance='marathon') r FULL JOIN base_rr b ON r.id=b.id GROUP BY ALL""")
    stated, source = claims['change_report_vs_baseline'], f"CHANGE-REPORT.md section B (marathon versus {pin['baseline']['tag']})"
    totals = rows(db, 'SELECT sum(removed)::BIGINT AS removed, sum(added)::BIGINT AS added, sum(changed)::BIGINT AS changed, sum(unchanged)::BIGINT AS unchanged FROM base_delta')[0]
    checks.add('baseline_delta', 'ids removed, added, changed in place and unchanged', source, {k: stated[k] for k in totals}, totals)
    checks.add('baseline_delta', 'removed ids by edition', source, dict(sorted(stated['removed_by_edition'].items())),
               pairs(db, "SELECT city || ' ' || year, removed FROM base_delta WHERE removed > 0"))
    checks.add('baseline_delta', 'changed ids by edition', source, dict(sorted(stated['changed_by_edition'].items())),
               pairs(db, "SELECT city || ' ' || year, changed FROM base_delta WHERE changed > 0"))
    columns = db.execute('SELECT ' + ', '.join(f'count(*) FILTER(WHERE r."{c}" IS DISTINCT FROM CAST(b."{c}" AS {t}))' for c, t in RACE_RECORDS if c != 'id')
                         + " FROM (SELECT * FROM rr WHERE distance='marathon') r JOIN base_rr b ON r.id=b.id").fetchone()
    checks.add('baseline_delta', 'columns that differ on a shared id', 'measured', None,
               {c: n for (c, _), n in zip([x for x in RACE_RECORDS if x[0] != 'id'], columns) if n})
    checks.add('baseline_delta', 'baseline editions that keep every row unchanged', 'measured', None,
               {'baseline_editions': scalar(db, 'SELECT count(*) FROM base_delta WHERE removed + changed + unchanged > 0'),
                'unchanged_editions': scalar(db, 'SELECT count(*) FROM base_delta WHERE unchanged > 0 AND removed = 0 AND changed = 0 AND added = 0'),
                'editions_with_added_rows': scalar(db, 'SELECT count(*) FROM base_delta WHERE added > 0 AND removed + changed + unchanged > 0'),
                'new_editions': scalar(db, 'SELECT count(*) FROM base_delta WHERE removed + changed + unchanged = 0')})

    step('overlays against the baseline')
    for name, view, key in (('race_conditions', 'wx', 'id'), ('course_profiles', 'cp', 'id'), ('course_segments', 'cs', 'id')):
        member = baseline / f'{name}.parquet'
        db.execute(f'CREATE OR REPLACE TABLE bl_{name} AS SELECT * FROM read_parquet({literal(member)})')
        if [(c, t) for c, t, *_ in db.execute(f'DESCRIBE bl_{name}').fetchall()] != OVERLAY_SCHEMAS[name]:
            fail(f'the baseline {name}.parquet does not have the schema the adapter writes')
        db.execute(f'CREATE OR REPLACE TABLE ov_{name} AS SELECT ' + ', '.join(f'CAST("{c}" AS {t}) AS "{c}"' for c, t in OVERLAY_SCHEMAS[name])
                   + f" FROM {view} WHERE distance='marathon'")
        diff = adapt_master.table_difference(db, f'ov_{name}', f'bl_{name}', OVERLAY_SCHEMAS[name], key)
        expected = {'only_left': 0, 'only_right': 0, 'changed_columns': {}} if name in REVIEWED[tag]['baseline_equal'] else None
        checks.add('overlays', f'{name}: marathon rows against the {pin["baseline"]["tag"]} member (rows only in the release, only in the baseline, changed columns)',
                   'analysis/adapt_combined.py REVIEWED baseline_equal', expected, diff)
    checks.add('overlays', 'marathon weather rows that repeat an edition', 'race_conditions.parquet', 0,
               scalar(db, "SELECT count(*) - count(DISTINCT (city, year)) FROM wx WHERE distance='marathon'"))
    checks.add('overlays', 'weather and course rows of the release by distance', 'measured', None,
               {'race_conditions': pairs(db, 'SELECT distance, count(*) FROM wx GROUP BY 1'), 'course_profiles': pairs(db, 'SELECT distance, count(*) FROM cp GROUP BY 1'),
                'course_segments': pairs(db, 'SELECT distance, count(*) FROM cs GROUP BY 1')})
    return checks


def written_editions(db):
    """(release key, year, release race name, rows) of the rows the adapter writes: what the race registry is built from."""
    return [tuple(r) for r in db.execute("""SELECT city, year, race, count(*) FROM rr WHERE distance='marathon'
      AND id NOT IN (SELECT record_id FROM left_out) GROUP BY ALL ORDER BY 1, 2, 3""").fetchall()]


def registry_tables(db, pin, checks):
    """The frozen race registry (analysis/race-registry.json) over the rows about to be written: `reg`, from a release
    key to its race's label, display name and id, and `wed`, one row per written edition with the `city` and `race` the
    adapter writes beside the release's own. The registry is rebuilt from these rows and its reviewed part; any
    difference from the frozen file stops the run. `race` is the registry's display name, except that an edition under a
    plain key keeps the race name the release gives it (a plain key's names are already display names, and one key,
    Warsaw, holds two races that must not be renamed as each other)."""
    editions = written_editions(db)
    try:
        by_key, frozen_sha = race_registry.frozen_races(pin['tag'], editions)
    except (RuntimeError, AssertionError) as error:
        fail(f'race registry: {error}')
    db.execute('CREATE OR REPLACE TABLE reg (release_city VARCHAR, city VARCHAR, race_name VARCHAR, race_id VARCHAR, plain BOOLEAN)')
    db.executemany('INSERT INTO reg VALUES (?,?,?,?,?)',
                   [[key, race['label'], race['name'], race['race_id'], ': ' not in key] for key, race in sorted(by_key.items())])
    db.execute("""CREATE OR REPLACE TABLE wed AS SELECT g.city, e.year, CASE WHEN g.plain THEN e.race ELSE g.race_name END AS race, g.race_id,
        e.city AS release_city, e.race AS release_race, e.n AS n_records, e.names
      FROM (SELECT city, year, min(race) AS race, count(DISTINCT race) AS names, count(*) AS n FROM rr WHERE distance='marathon'
        AND id NOT IN (SELECT record_id FROM left_out) GROUP BY ALL) e JOIN reg g ON g.release_city=e.city""")
    if scalar(db, 'SELECT count(*) FROM wed') != len({(key, year) for key, year, _, _ in editions}):
        fail('race registry: a written edition has no race')
    if scalar(db, 'SELECT count(*) FROM wed WHERE names <> 1'):
        fail('an edition carries more than one race name; release_keys.parquet keeps one per edition')
    if scalar(db, 'SELECT count(*) - count(DISTINCT (city, year)) FROM wed'):
        fail('race registry: two release editions would be written under one label and year')
    races = {race['race_id']: race for race in by_key.values()}
    checks.add('race_registry', 'the frozen registry equals a rebuild from the written rows (keys, races, written editions and rows)',
               'analysis/race-registry.json (rebuilt by analysis/race_registry.py from the rows about to be written; a difference stops the adapter)',
               {'keys': len(by_key), 'races': len(races), 'editions': sum(r['editions'] for r in races.values()), 'rows': sum(r['rows'] for r in races.values())},
               {'keys': scalar(db, 'SELECT count(DISTINCT release_city) FROM wed'), 'races': scalar(db, 'SELECT count(DISTINCT city) FROM wed'),
                'editions': scalar(db, 'SELECT count(*) FROM wed'), 'rows': scalar(db, 'SELECT sum(n_records)::BIGINT FROM wed')})
    checks.add('race_registry', 'written editions whose label or race name differs from the release’s own key or race name', 'measured', None,
               rows(db, """SELECT count(*) FILTER(WHERE city <> release_city) AS editions_relabelled, coalesce(sum(n_records) FILTER(WHERE city <> release_city), 0)::BIGINT AS rows_relabelled,
                 count(*) FILTER(WHERE race <> release_race) AS editions_renamed, coalesce(sum(n_records) FILTER(WHERE race <> release_race), 0)::BIGINT AS rows_renamed,
                 count(*) FILTER(WHERE city = release_city AND race <> release_race) AS plain_key_editions_renamed FROM wed""")[0])
    return {'file': 'analysis/race-registry.json', 'sha256': frozen_sha, 'races': len(races), 'keys': len(by_key)}


def edition_checksums(db):
    """One pass over the marathon rows in (city, year, id) order: the producer's 27-column checksum of every release
    edition (under the release's own key), and the 20-column checksum (1050's method) of the rows the adapter writes,
    with the sex, label and race name it writes, under the label."""
    position = {c: i for i, c in enumerate(SOURCE_COLUMNS)}
    keep = [position[c] for c in CHECKSUM_COLUMNS]
    sex_at, age_at = CHECKSUM_COLUMNS.index('sex'), CHECKSUM_COLUMNS.index('age')
    label_at, race_at = CHECKSUM_COLUMNS.index('city'), CHECKSUM_COLUMNS.index('race')
    city_at, year_at = position['city'], position['year']
    cursor = db.execute("""SELECT rr.*, coalesce(rr.sex, qa.sex_from_category) AS sex_out, lo.record_id IS NOT NULL AS left_out,
        g.city AS label, CASE WHEN g.plain THEN rr.race ELSE g.race_name END AS race_out
      FROM rr LEFT JOIN qa ON qa.source_db=rr.source_db AND qa.record_id=rr.id LEFT JOIN left_out lo ON lo.record_id=rr.id
      LEFT JOIN reg g ON g.release_city=rr.city
      WHERE rr.distance='marathon' ORDER BY rr.city, rr.year, rr.id""")
    produced, written = {}, {}
    key = source = out = label = None
    n = m = 0

    def close():
        if key is not None:
            produced[key] = (n, source.hexdigest())
            if m:
                written[(label, key[1])] = (m, out.hexdigest())
    while batch := cursor.fetchmany(100_000):
        for row in batch:
            here = (row[city_at], row[year_at])
            if here != key:
                close()
                key, source, out, n, m, label = here, hashlib.sha256(), hashlib.sha256(), 0, 0, row[29]
            source.update((json.dumps(row[:27], separators=(',', ':'), ensure_ascii=False) + '\n').encode())
            n += 1
            if not row[28]:
                record = [row[i] for i in keep]
                record[sex_at], record[label_at], record[race_at] = row[27], row[29], row[30]
                if record[age_at] is not None and float(record[age_at]).is_integer():
                    record[age_at] = int(record[age_at])
                out.update((json.dumps(record, separators=(',', ':'), ensure_ascii=False) + '\n').encode())
                m += 1
    close()
    return produced, written


def check_producer_checksums(db, checks, produced):
    listed = {(c, y): (n, d) for c, y, n, d in db.execute(
        "SELECT city, year::BIGINT, n_records::BIGINT, sha256_records FROM sums_csv WHERE distance='marathon' AND n_records::BIGINT > 0").fetchall()}
    wrong = sorted(f'{c} {y}' for (c, y) in set(listed) | set(produced) if listed.get((c, y)) != produced.get((c, y)))
    checks.add('editions_marathon', 'marathon editions whose recomputed checksum differs from EDITION-CHECKSUMS.csv',
               f'EDITION-CHECKSUMS.csv ({PRODUCER_CHECKSUM_METHOD})', {'editions': len(listed), 'differ': []}, {'editions': len(produced), 'differ': wrong[:50]})


def verdict(pin, checks):
    """Stop on any mismatch a reviewer has not listed; a listed one stays in the record as a mismatch."""
    known = {tuple(x) for x in REVIEWED[pin['tag']]['known_mismatches']}
    failed = [c for c in checks.failed() if (c['family'], c['check']) not in known]
    if failed:
        first = failed[0]
        names = '; '.join(f"[{c['family']}] {c['check']}" for c in failed[:12])
        fail(f"{len(failed)} reconciliation check(s) differ: {names}. The first: expected "
             f"{json.dumps(first['expected'], ensure_ascii=False)[:400]}, measured {json.dumps(first['measured'], ensure_ascii=False)[:400]}")
    stale = known - {(c['family'], c['check']) for c in checks.failed()}
    if stale:
        fail(f'reviewed mismatches that no longer differ (remove them from REVIEWED): {sorted(stale)}')


# ---------------------------------------------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------------------------------------------

def edition_dates(db, pin):
    """A race date per marathon edition and where it comes from: the weather row, else the reviewed and cited date in
    analysis/reviewed-race-dates.json. Nothing else dates an edition, so the other editions are ordered by year only.
    `producer_note_date` is kept beside it: the one date the producer's own completeness note states as
    `date=YYYY-MM-DD`, when it lies in the edition's year. It is unreviewed and never used as the race date; a reviewed or
    weather date that disagrees with it stops the adapter. The table is keyed by the release's own key (`city`) and year."""
    dates = json.loads(RACE_DATES_PATH.read_text())['releases'].get(pin['tag'], [])
    resolved = []
    for d in dates:
        # A reviewed entry names the edition as the pipeline does, by its label; the release's own key comes from the registry.
        found = rows(db, f"SELECT release_city AS k FROM wed WHERE city={literal(d['city'])} AND year={int(d['year'])}")
        if len(found) != 1 or d.get('release_city', found[0]['k']) != found[0]['k']:
            fail(f"reviewed race date {d['city']} {d['year']}: no written edition has this label and year, or its release key is not the one the entry names")
        key = found[0]['k']
        note = rows(db, f"SELECT completeness_reason AS r FROM em WHERE distance='marathon' AND city={literal(key)} AND year={int(d['year'])}")
        if len(note) != 1 or d['evidence_text'] not in (note[0]['r'] or ''):
            fail(f"reviewed race date {d['city']} {d['year']}: the edition metadata no longer says {d['evidence_text']!r}")
        if scalar(db, f"SELECT count(*) FROM wx WHERE distance='marathon' AND city={literal(key)} AND year={int(d['year'])}"):
            fail(f"reviewed race date {d['city']} {d['year']}: the weather table now has a row; review the date again")
        day = datetime.date.fromisoformat(d['date'])
        if day.year != int(d['year']) or ('weekday' in d and day.strftime('%A') != d['weekday']):
            fail(f"reviewed race date {d['city']} {d['year']}: {d['date']} is not in the edition’s year, or not on the weekday the entry states")
        resolved.append((key, int(d['year']), d['date']))
    reviewed = ' UNION ALL '.join(f"SELECT {literal(k)} AS city, {y} AS year, {literal(v)} AS race_date" for k, y, v in resolved) \
        or 'SELECT NULL::VARCHAR AS city, NULL::BIGINT AS year, NULL::VARCHAR AS race_date WHERE false'
    db.execute(f"""CREATE OR REPLACE TABLE edition_dates AS WITH note AS (
        SELECT city, year, list_distinct(regexp_extract_all(completeness_reason, '{NOTE_DATE}', 1)) AS found FROM em WHERE distance='marathon'),
      noted AS (SELECT city, year, found[1] AS race_date FROM note WHERE len(found) = 1 AND try_cast(found[1] AS DATE) IS NOT NULL
        AND year(try_cast(found[1] AS DATE)) = year),
      weather AS (SELECT city, year, min(race_date) AS race_date FROM wx WHERE distance='marathon' GROUP BY ALL)
      SELECT e.city, e.year, coalesce(w.race_date, r.race_date) AS race_date,
        CASE WHEN w.race_date IS NOT NULL THEN 'weather' WHEN r.race_date IS NOT NULL THEN 'reviewed' END AS race_date_source,
        n.race_date AS producer_note_date,
        (w.race_date IS NOT NULL AND n.race_date IS NOT NULL AND w.race_date <> n.race_date)
          OR (r.race_date IS NOT NULL AND n.race_date IS NOT NULL AND r.race_date <> n.race_date) AS conflict
      FROM (SELECT city, year FROM em WHERE distance='marathon') e LEFT JOIN weather w USING(city, year)
      LEFT JOIN ({reviewed}) r USING(city, year) LEFT JOIN noted n USING(city, year)""")
    if scalar(db, 'SELECT count(*) FROM edition_dates WHERE conflict'):
        fail('an edition has two race dates that disagree (weather or reviewed date against the producer note)')


def write_members(db, pin, core, baseline, root, checks):
    tag = pin['tag']
    review, identity = REVIEWED[tag], IDENTITY[tag]
    step('race_records')
    adapted = {'sex': 'coalesce(r.sex, q.sex_from_category) AS sex', 'city': 'g.city AS city',
               'race': 'CASE WHEN g.plain THEN r.race ELSE g.race_name END AS race'}
    select = ', '.join(adapted.get(c) or f'CAST(r."{c}" AS {t}) AS "{c}"' for c, t in RACE_RECORDS)
    copy_parquet(db, f"""SELECT {select} FROM rr r JOIN reg g ON g.release_city=r.city LEFT JOIN qa q ON q.source_db=r.source_db AND q.record_id=r.id
      WHERE r.distance='marathon' AND r.id NOT IN (SELECT record_id FROM left_out) ORDER BY r.id""", root / 'race_records.parquet')
    db.execute(f"CREATE OR REPLACE VIEW out_rr AS SELECT * FROM read_parquet({literal(root / 'race_records.parquet')})")
    if scalar(db, 'SELECT count(*) FROM out_rr') != review['written_rows']:
        fail('race_records.parquet does not hold the reviewed number of marathon rows')
    step('weather, courses, sources, edition metadata, flags')
    written = {}
    for name in ('race_conditions', 'course_profiles', 'course_segments'):
        if name not in review['baseline_equal']:
            fail(f'{name} is not reviewed to equal the baseline member; the adapter writes these members only as its bytes')
        shutil.copyfile(baseline / f'{name}.parquet', root / f'{name}.parquet')
        written[name] = f"{pin['baseline']['tag']} bytes (marathon values equal to the release member)"
    copy_parquet(db, 'SELECT ' + ', '.join('w.city AS edition_city' if c == 'edition_city' else f'CAST(s."{c}" AS {t}) AS "{c}"' for c, t in SOURCES)
                 + " FROM src s LEFT JOIN wed w ON w.release_city=s.city AND w.year=s.year WHERE s.distance='marathon' ORDER BY s.id", root / 'sources.parquet')
    copy_parquet(db, 'SELECT ' + ', '.join(f'CAST("{c}" AS {t}) AS "{c}"' for c, t in RELEASE_KEYS) + ' FROM wed ORDER BY city, year', root / 'release_keys.parquet')
    edition_dates(db, pin)
    meta = ', '.join('w.city AS city' if c == 'city' else f'CAST(e."{c}" AS {t}) AS "{c}"' for c, t in OVERLAY_SCHEMAS['edition_meta'])
    copy_parquet(db, f"""SELECT {meta}, {TIER_FIELDS}, d.race_date, d.race_date_source, d.producer_note_date
      FROM em e JOIN tiers_csv t ON t.distance=e.distance AND t.source_db=e.source_db AND t.city=e.city AND t.year::BIGINT=e.year
      JOIN edition_dates d ON d.city=e.city AND d.year=e.year JOIN wed w ON w.release_city=e.city AND w.year=e.year
      WHERE e.distance='marathon' ORDER BY e.id""", root / 'edition_meta.parquet')
    if scalar(db, f"SELECT count(*) FROM read_parquet({literal(root / 'edition_meta.parquet')})") != scalar(db, 'SELECT count(*) FROM wed'):
        fail('edition_meta.parquet does not hold one row per written edition')
    copy_parquet(db, """SELECT f.record_id, o.city, f.year, f.flag, f.detail FROM rf f JOIN out_rr o ON o.id=f.record_id
      WHERE f.distance='marathon' ORDER BY f.record_id, f.flag""", root / 'record_flags.parquet')
    copy_parquet(db, 'SELECT f.record_id, o.city, f.year, ' + ', '.join(f'f.{flag}' for flag in QA_FLAGS) + """, f.sex_from_category
      FROM qa f JOIN out_rr o ON o.id=f.record_id WHERE f.distance='marathon' ORDER BY f.record_id""", root / 'qa_row_flags.parquet')
    written['sources'] = 'the release’s marathon source list, with its own keys; edition_city is the written edition’s label'
    written['release_keys'] = 'one row per written edition: the label and race name written, the release’s own key and race name'
    written['edition_meta'] = 'the release’s marathon rows of the written editions, under their labels'
    for name in ('record_flags', 'qa_row_flags'):
        written[name] = 'the release’s marathon rows of the written records, under their labels'
    step('features')
    # features.parquet: the identity subset the builders read (FULL; computed for both bundles so their documents agree).
    confidences = rows(db, "SELECT confidence AS c, count(*) AS n, count(person_id) AS with_person FROM lk WHERE distance='marathon' GROUP BY 1")
    allowed = set(identity['keyed_confidences']) | set(identity['possible_confidences']) | {None}
    surprise = [x for x in confidences if x['c'] not in allowed or (x['c'] is None) != (x['with_person'] == 0) or (x['c'] is not None and x['with_person'] != x['n'])]
    if surprise or scalar(db, f"SELECT count(*) FROM lk WHERE distance='marathon' AND person_id IS NOT NULL AND NOT starts_with(person_id, '{identity['prefix']}')"):
        fail(f'link confidences or person ids the identity rule has not reviewed: {surprise}')
    db.execute(SECONDS)
    secs = ', '.join(f'seconds({f}) AS t{i}' for i, f in enumerate(FIELDS))
    names = ['05', '10', '15', '20', '25', '30', '35', '40', '42']
    seg = ', '.join(f'(t{i}-{"t" + str(i - 1) if i else "0"})/60 AS seg_{n}' for i, n in enumerate(names))
    cum = ', '.join(f't{i}/60 AS cum_{n}' for i, n in enumerate(names[:8]))
    keyed = ', '.join(f"'{c}'" for c in identity['keyed_confidences'])
    copy_parquet(db, f"""WITH p AS (SELECT r.*, {secs} FROM out_rr r),
      k AS (SELECT p.*, l.person_id, l.confidence, l.method, l.age_key, l.sex_source,
        CASE WHEN l.confidence IN ({keyed}) THEN l.person_id END AS pid FROM p JOIN lk l ON l.distance='marathon' AND l.source_db='full' AND l.record_id=p.id)
      SELECT k.id AS record_id, k.city, k.year, d.race_date, k.race, k.runner AS runner_name,
        CASE WHEN k.sex='X' THEN NULL ELSE k.sex END AS sex, k.age,
        CAST(nullif(regexp_extract(k.age_key, '^yob:([0-9]{{4}})$', 1), '') AS BIGINT) AS yob, k.age_group,
        {seg}, t8/60 AS finish_time, {cum}, k.pid AS match_key, CASE WHEN k.pid IS NOT NULL THEN false END AS is_ambiguous,
        k.pid AS runner_id, CASE WHEN k.pid IS NOT NULL THEN false END AS link_preliminary,
        k.person_id, k.confidence AS link_confidence, k.method AS link_method, k.sex_source
      FROM k JOIN wed w ON w.city=k.city AND w.year=k.year LEFT JOIN edition_dates d ON d.city=w.release_city AND d.year=k.year
      ORDER BY record_id""", root / 'features.parquet')
    features = rows(db, f"""SELECT count(*) AS rows, count(runner_id) AS with_key, count(DISTINCT runner_id) AS keys,
      count(person_id) AS with_person_id, count(*) FILTER(WHERE person_id IS NOT NULL AND runner_id IS NULL) AS possible_match_rows,
      count(*) FILTER(WHERE person_id IS NULL) AS unlinked, count(yob) AS with_yob, count(*) FILTER(WHERE race_date IS NULL) AS without_race_date,
      count(*) FILTER(WHERE sex_source='category') AS sex_from_category
      FROM read_parquet({literal(root / 'features.parquet')})""")[0]
    if features['rows'] != review['written_rows']:
        fail('features.parquet does not hold one row per written record')
    by_confidence = pairs(db, f"SELECT coalesce(link_confidence, 'unlinked'), count(*) FROM read_parquet({literal(root / 'features.parquet')}) GROUP BY 1")
    yob = rows(db, r"""SELECT count(*) FILTER(WHERE age_key LIKE 'yob:%') AS link_age_key_years,
      count(*) FILTER(WHERE regexp_matches(runner_id_v1, '\|yob:[0-9]{4}$')) AS v1_key_years,
      count(*) FILTER(WHERE regexp_matches(runner_id_v1, '\|yob:[0-9]{4}$') AND age_key LIKE 'yob:%'
        AND regexp_extract(runner_id_v1, '\|yob:([0-9]{4})$', 1) <> substr(age_key, 5)) AS years_that_disagree,
      count(*) FILTER(WHERE regexp_matches(runner_id_v1, '\|yob:[0-9]{4}$') AND age_key NOT LIKE 'yob:%') AS v1_year_with_another_age_key,
      count(*) FILTER(WHERE regexp_matches(runner_id_v1, '\|yob:[0-9]{4}$') AND age_key IS NULL) AS v1_year_without_age_key
      FROM lk WHERE distance='marathon'""")[0]
    if yob['years_that_disagree']:
        fail(f'the link age keys disagree with the v1 keys on a birth year: {yob}')
    dates = rows(db, """SELECT count(*) AS editions_with_rows, count(*) FILTER(WHERE d.race_date_source='weather') AS weather,
      count(*) FILTER(WHERE d.race_date_source='reviewed') AS reviewed, count(*) FILTER(WHERE d.race_date IS NULL) AS without_a_race_date,
      count(*) FILTER(WHERE d.race_date IS NULL AND d.producer_note_date IS NOT NULL) AS of_those_with_a_producer_note_date
      FROM wed e JOIN edition_dates d ON d.city=e.release_city AND d.year=e.year""")[0]
    return {'members_written': written, 'features': features, 'features_by_link_confidence': by_confidence,
            'identity_rule': identity, 'row_rule': ROW_RULE[tag], 'birth_year_keys': yob, 'race_dates': dates}


def write_documents(db, pin, core, assets, root, checks, details, sums):
    tag = pin['tag']
    producer = json.loads((core / 'MANIFEST.json').read_text())
    adapter_sha = file_sha256(__file__)
    eds = rows(db, f"""SELECT e.city, e.year, e.official_finishers, e.official_source_url, e.official_source_type, e.official_checked_at,
        e.completeness_status, e.completeness_reason, e.timing_basis, {TIER_FIELDS}, d.race_date, d.race_date_source, d.producer_note_date,
        coalesce(c.n, 0) AS rows_in_release,
        coalesce(c.n_fin, 0) AS finishes_in_release, coalesce(l.n, 0) AS rows_left_out,
        w.city AS label, w.race AS race_out, w.race_id, w.release_race
      FROM em e JOIN tiers_csv t ON t.distance=e.distance AND t.source_db=e.source_db AND t.city=e.city AND t.year::BIGINT=e.year
      JOIN edition_dates d ON d.city=e.city AND d.year=e.year LEFT JOIN wed w ON w.release_city=e.city AND w.year=e.year
      LEFT JOIN (SELECT city, year, n, n_fin FROM ed WHERE distance='marathon') c ON c.city=e.city AND c.year=e.year
      LEFT JOIN (SELECT r.city, r.year, count(*) AS n FROM left_out lo JOIN rr r ON r.source_db='full' AND r.id=lo.record_id GROUP BY ALL) l
        ON l.city=e.city AND l.year=e.year
      WHERE e.distance='marathon' ORDER BY e.city, e.year""")
    counted = {(c, y): (n, f, k) for c, y, n, f, k in db.execute(
        "SELECT city, year, count(*), count(split_42_2km), count(*) FILTER(WHERE nullif(trim(split_5km), '') IS NOT NULL) FROM out_rr GROUP BY ALL").fetchall()}
    # Written editions are listed as the pipeline names them (`city` is the label), with the release's own key and race
    # name beside it; a marathon edition of the release tables with no written row (an excluded edition, or one whose
    # every row the row rule leaves out) is listed apart under its release key and reaches no data member.
    editions_json, not_written = [], []
    for e in eds:
        key = (e['label'], e['year'])
        n, finishes, _ = counted.get(key, (0, 0, 0)) if e['label'] is not None else (0, 0, 0)
        if n != e['rows_in_release'] - e['rows_left_out']:
            fail(f"{e['city']} {e['year']}: written rows differ from the release rows less the rows left out")
        if e['label'] is None:
            not_written.append({
                'release_city': e['city'], 'year': e['year'], 'rows_in_release': e['rows_in_release'], 'rows_left_out': e['rows_left_out'],
                'verification_tier': e['verification_tier'], 'release_exclusion': e['release_exclusion'], 'release_note': e['release_note'],
                'official_finishers': e['official_finishers'], 'completeness_status': e['completeness_status'],
                'excluded': e['verification_tier'] == 'excluded'})
            continue
        editions_json.append({
            'city': e['label'], 'year': e['year'], 'race': e['race_out'], 'race_id': e['race_id'], 'release_city': e['city'],
            'release_race': e['release_race'], 'n_records': n, 'n_finishes': finishes, 'rows_in_release': e['rows_in_release'],
            'finishes_in_release': e['finishes_in_release'], 'rows_left_out': e['rows_left_out'],
            'official_finishers': e['official_finishers'], 'official_source_url': e['official_source_url'],
            'official_source_type': e['official_source_type'], 'official_checked_at': e['official_checked_at'],
            'completeness_status': e['completeness_status'], 'completeness_reason': e['completeness_reason'],
            'verification_tier': e['verification_tier'], 'verified_badge': e['verified_badge'], 'weaker_source': e['weaker_source'],
            'badge_label': e['badge_label'], 'split_tier': e['split_tier'], 'release_exclusion': e['release_exclusion'],
            'release_note': e['release_note'], 'hold_note': e['hold_note'], 'timing_basis': e['timing_basis'], 'race_date': e['race_date'],
            'race_date_source': e['race_date_source'], 'producer_note_date': e['producer_note_date'],
            'sha256_records': sums[key][1], 'excluded': False})
    editions_json.sort(key=lambda e: (e['city'], e['year']))
    not_written.sort(key=lambda e: (e['release_city'], e['year']))
    if set(counted) != {(e['city'], e['year']) for e in editions_json} or set(sums) != set(counted):
        fail('race_records.parquet, EDITIONS.json and the edition checksums name different editions')
    summary = [{'city': c, 'year': y, 'n_records': n, 'n_with_5km': k} for (c, y), (n, _, k) in sorted(counted.items())]
    stream = io.StringIO()
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['city', 'year', 'n_records', 'sha256_records'])
    for (c, y), (n, d) in sorted(sums.items()):
        writer.writerow([c, y, n, d])
    report = {'document': LABEL, 'tag': tag, 'adapter_version': ADAPTER_VERSION, 'summary': checks.summary(),
              'known_mismatches': REVIEWED[tag]['known_mismatches'], **details, 'checks': checks.items}
    head = f'> {LABEL} Built from `{tag}` (pinned in analysis/release.json); adapter version {ADAPTER_VERSION}.\n\n'
    f, rule, identity = details['features'], ROW_RULE[tag], IDENTITY[tag]
    left = {c['check']: c['measured'] for c in checks.items if c['family'] == 'rows_left_out'}
    delta = next(c['measured'] for c in checks.items if c['family'] == 'baseline_delta' and c['check'].startswith('ids removed'))
    docs = {
        'EDITIONS.json': encode_json({'document': LABEL, 'tag': tag, 'editions': editions_json, 'not_written': not_written}),
        'races_summary.json': encode_json({'document': LABEL, 'tag': tag, 'editions': summary}),
        'EDITION-CHECKSUMS.csv': stream.getvalue().encode(),
        'RECONCILIATION.json': encode_json(report),
        'CHANGE-REPORT.md': (
            f'{head}# Change report: {tag} (marathon rows) against {pin["baseline"]["tag"]}\n\n'
            'Measured by the adapter, row by row on `race_records.id` over the release’s marathon rows (before any row is left out):\n\n'
            f'- ids removed: {delta["removed"]:,}; ids added: {delta["added"]:,}; same id, values changed: {delta["changed"]:,}; '
            f'same id, unchanged: {delta["unchanged"]:,}.\n'
            f'- The adapter then leaves out {left["distinct rows left out"]:,} rows by its frozen row rule and writes '
            f'{f["rows"]:,}; {f["sex_from_category"]:,} of the written rows take their sex from the published category.\n\n'
            '## The producer’s CHANGE-REPORT.md (verbatim)\n\n' + (core / 'CHANGE-REPORT.md').read_text()).encode(),
        'ID-CONTRACT.md': (
            f'{head}# ID contract: {tag} (adapted, marathon rows)\n\n'
            '- `race_records.id` is the release’s `id` for `source_db = full`, `distance = marathon`: the marathon platform’s '
            'race-result id. Half rows, whose id space overlaps, are not in this folder.\n'
            '- An edition is (`city`, `year`). `city` is the label of the edition’s race in the frozen race registry '
            '(analysis/race-registry.json), not the release’s own key: a plain key keeps its name, and several keys of one race '
            'share one label. `release_keys.parquet` gives, for every written edition, the release’s own key and race name.\n'
            '- `features.record_id`, `record_flags.record_id` and `qa_row_flags.record_id` use this id. Never use a row index.\n'
            '- `features.runner_id` is the v5.1 `person_id` under the adapter’s frozen identity rule (see MATCHING.md); '
            '`features.person_id` keeps every link. Person ids are not stable between link builds.\n'
            '- Do not join runners across races by name alone.\n\n'
            '## The producer’s ID-CONTRACT.md (verbatim)\n\n' + (core / 'ID-CONTRACT.md').read_text()).encode(),
        'MATCHING.md': (
            f'{head}# Cross-race matching: {tag} (adapted, marathon rows)\n\n'
            f'`features.person_id`, `link_confidence` and `link_method` repeat the producer’s {identity["build"]} link of every '
            'record (null when the record is unlinked). `features.runner_id` and `match_key` are that `person_id` only when the '
            f'confidence is {", ".join(identity["keyed_confidences"])}; a link of another tier '
            f'({", ".join(identity["possible_confidences"])}) gives no key, so the record stands alone in every '
            'history-based output and can be shown only as a possible match. `is_ambiguous` and `link_preliminary` are false '
            'where a key is present and unknown (null) where it is absent. `yob` is the year of the link build’s `age_key` '
            '(`yob:YYYY`), and null otherwise. `sex_source` says whether the sex is the published one or the published '
            'category’s. These are records linked by name, not verified people. '
            f'Records with a key: {f["with_key"]:,} in {f["keys"]:,} keys; possible matches without a key: '
            f'{f["possible_match_rows"]:,}; unlinked: {f["unlinked"]:,}.\n\n'
            '## The producer’s person-ids-v5.1-COLUMNS.md (verbatim)\n\n' + assets['person-ids-v5.1-COLUMNS.md'].read_text()
            + '\n## The producer’s person-ids-v5.1-MATCHING.md (verbatim)\n\n' + assets['person-ids-v5.1-MATCHING.md'].read_text()).encode(),
        'FEATURE-FIELD-NOTES.md': (
            f'{head}# Feature fields: {tag} (adapted, marathon rows)\n\n'
            '`features.parquet` is an identity subset with one row per `race_records.id`: `record_id, city, year, race_date, '
            'race, runner_name, sex, age, yob, age_group`, the section minutes `seg_05 … seg_40, seg_42` (the last 2.195 km), '
            '`finish_time` and the cumulative minutes `cum_05 … cum_40`, parsed from the raw clock strings with the pacing '
            'parser (null when a string does not parse), then `match_key, is_ambiguous, runner_id, link_preliminary, person_id, '
            'link_confidence, link_method, sex_source`. Recorded sex `X` is null here, as in 1050’s features; nothing is inferred. '
            '`race_date` is the weather row’s date, else the reviewed date in analysis/reviewed-race-dates.json '
            '(`edition_meta.race_date_source` says which); every other edition has none and is ordered by year only. The '
            'unreviewed date a producer note states is kept apart, in `edition_meta.producer_note_date`. It has none of a producer engine’s columns (`valid_splits`, `wall_*`, '
            'paces, ranks, personal bests): no site builder reads them.\n').encode(),
        'README.md': (
            f'{head}# {tag}, marathon rows adapted for the Pace Notes builders\n\n'
            f'Marathon rows (`distance = marathon`) of the combined release, in the layout of `{pin["baseline"]["tag"]}`. Halves are '
            'not in this folder; never pool the two distances. '
            f'{left["distinct rows left out"]:,} rows are left out by the frozen row rule (pending-review flags '
            f'{", ".join(rule["pending_review_flags"])}; QA flags {", ".join(rule["qa_row_flags"])}; a flag among '
            f'{", ".join(rule["kept_when_edition_wide"])} removes nothing from an edition whose every row carries it) and no '
            'pending-review flag is written, so no kept row is labelled. `city` is the label of the edition’s race in the frozen '
            'race registry and `race` its display name (an edition under a plain key keeps the race name the release gives it); '
            '`release_keys.parquet` keeps the release’s own key and race name of every written edition, and `sources.parquet` is '
            'the release’s source list under its own keys. `race_records.sex` is the published sex and, where that is blank, the '
            'producer’s `sex_from_category`. `record_flags.parquet` keeps the release’s long format (`flag`, `detail`), which has '
            'no column for a flag’s 0/1 value. `MANIFEST.json`, `EDITIONS.json`, `races_summary.json`, `EDITION-CHECKSUMS.csv`, '
            '`RECONCILIATION.json`, `features.parquet` and these notes are written by the adapter and are not producer claims; '
            'the producer’s own files are in `release-assets/`.\n\n'
            '## The producer’s README.md (verbatim)\n\n' + assets['README.md'].read_text()).encode(),
    }
    for name, data in docs.items():
        (root / name).write_bytes(data)
    files = {}
    for name in DATA_MEMBERS + ['features.parquet'] + DOC_MEMBERS:
        path = root / name
        n = scalar(db, f'SELECT count(*) FROM read_parquet({literal(path)})') if name.endswith('.parquet') else None
        files[name] = {'rows': n, 'bytes': path.stat().st_size, 'sha256': file_sha256(path), 'tier': 'FULL' if name == 'features.parquet' else 'CORE'}
    coverage = db.execute('SELECT count(*), count(DISTINCT city), count(DISTINCT (city, year)), min(id), max(id) FROM out_rr').fetchone()
    manifest = {
        'document': LABEL, 'adapter': {'script': 'analysis/adapt_combined.py', 'version': ADAPTER_VERSION, 'sha256': adapter_sha},
        'created_at': producer['created_at'], 'created_at_source': 'created_at of the release’s own CORE MANIFEST.json',
        'producer_snapshots': producer.get('snapshots'), 'tag_stub': tag, 'layout': LAYOUT,
        'source': {'repository': pin['repository'], 'tag': tag, 'published_at': pin['published_at'], 'checksums': pin['checksums'],
                   'core': pin['core'], 'assets': pin['assets'], 'baseline': pin['baseline']},
        'n_records': coverage[0], 'n_cities': coverage[1], 'n_editions': coverage[2], 'id_min': coverage[3], 'id_max': coverage[4],
        'n_release_keys': scalar(db, 'SELECT count(DISTINCT release_city) FROM wed'), 'race_registry': details['race_registry'],
        'rows_left_out': left['distinct rows left out'], 'rows_left_out_by_flag': left['rows left out, by flag (a row can carry two)'],
        'rows_kept_edition_wide': left['rows kept although flagged, because every row of their edition carries the flag (by flag and edition)'],
        'editions_without_rows': len(not_written),
        'canonical_record_id': 'race_records.id (= the release id for source_db full, distance marathon)',
        'edition_checksum_method': CHECKSUM_METHOD,
        'tiers': {'CORE': sorted(EXPECTED_COMBINED), 'FULL': 'CORE + features.parquet'},
        'dependencies': {'duckdb': duckdb.__version__},
        'files': files,
    }
    (root / 'MANIFEST.json').write_bytes(encode_json(manifest))
    listing = {name: entry['sha256'] for name, entry in files.items()}
    listing['MANIFEST.json'] = file_sha256(root / 'MANIFEST.json')
    (root / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
    return manifest


def adapt(pin, output, bundle='FULL', from_dirs=(), core_dir=None, baseline_dir=None, memory=None, registry_editions=None):
    """Fetch or read the pinned files, reconcile, write the input folder; returns its provenance. With
    `registry_editions` (a path) it writes no member: after the reconciliation it writes there the row-rule checks and
    the written editions (`editions`: rows [release key, year, release race name, rows]), for analysis/race_registry.py
    to freeze the registry from before a first adaptation, and returns None."""
    pin = check_pin(pin)
    if bundle not in ('CORE', 'FULL'):
        fail('bundle must be CORE or FULL')
    root = Path(output).resolve()
    root.mkdir(parents=True, exist_ok=True)
    from_dirs = [Path(d).resolve() for d in from_dirs]
    assets = adapt_master.fetch_release(pin['repository'], pin['tag'], pin['checksums']['asset'], pin['checksums']['sha256'], pin['assets'],
                                        root / SOURCE_DIR, from_dirs)
    core = core_members(pin, assets[pin['core']['asset']], root, Path(core_dir).resolve() if core_dir else None)
    for name in REPEATED_ASSETS:
        if file_sha256(core / name) != pin['assets'][name]:
            fail(f'the release asset {name} differs from the CORE archive member of the same name')
    baseline = baseline_members(pin, root, from_dirs, Path(baseline_dir).resolve() if baseline_dir else None)
    members = ['features.parquet', 'MANIFEST.json', 'SHA256SUMS.txt'] + DATA_MEMBERS + DOC_MEMBERS
    for name in ['provenance.json'] + members if registry_editions is None else []:
        (root / name).unlink(missing_ok=True)
    scratch = root / 'adapt-temp'
    scratch.mkdir(exist_ok=True)
    db = duckdb.connect()
    db.execute(f"SET memory_limit='{memory or os.environ.get('PACE_NOTES_ADAPT_MEMORY', '6GB')}'")
    db.execute('SET threads=3')
    db.execute('SET preserve_insertion_order=true')
    db.execute('SET temp_directory=?', [str(scratch)])
    try:
        checks = reconcile(db, pin, core, assets, baseline)
        if registry_editions is not None:
            Path(registry_editions).write_text(json.dumps({
                'document': LABEL, 'tag': pin['tag'], 'rows_left_out': [c for c in checks.items if c['family'] == 'rows_left_out'],
                'editions': written_editions(db)}, ensure_ascii=False) + '\n')
            return None
        step('race registry')
        registry = registry_tables(db, pin, checks)
        step('edition checksums')
        produced, sums = edition_checksums(db)
        check_producer_checksums(db, checks, produced)
        verdict(pin, checks)
        details = write_members(db, pin, core, baseline, root, checks)
        details['race_registry'] = registry
        step('documents')
        manifest = write_documents(db, pin, core, assets, root, checks, details, sums)
    except BaseException:
        for name in members if registry_editions is None else []:
            (root / name).unlink(missing_ok=True)
        raise
    finally:
        db.close()
        shutil.rmtree(scratch, ignore_errors=True)
    if bundle == 'CORE':
        (root / 'features.parquet').unlink()
    archive = pin['core']['asset']
    provenance = {
        'repository': pin['repository'], 'release_tag': pin['tag'], 'release_published_at': pin['published_at'],
        'layout': LAYOUT, 'asset': archive, 'asset_sha256': pin['assets'][archive],
        'asset_path': f'{SOURCE_DIR}/{archive}', 'bundle': bundle,
        'manifest_sha256': file_sha256(root / 'MANIFEST.json'),
        'release_checksums': dict(pin['checksums']), 'core': pin['core'], 'assets': pin['assets'], 'baseline': pin['baseline'],
        'adapter_sha256': manifest['adapter']['sha256'], 'adapter_version': ADAPTER_VERSION,
        'race_registry_sha256': manifest['race_registry']['sha256'],
    }
    (root / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    return provenance


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--bundle', choices=['CORE', 'FULL'], default='FULL')
    parser.add_argument('--from-dir', type=Path, action='append', default=[], help='a folder already filled from the release (with its checksum file)')
    parser.add_argument('--core-dir', type=Path, help='an already unpacked CORE archive folder')
    parser.add_argument('--baseline-dir', type=Path, help='a verified baseline CORE folder from download_release.py')
    parser.add_argument('--pin', type=Path, default=PIN_PATH)
    parser.add_argument('--registry-editions', type=Path, help='write only the written editions, as JSON, for a first freeze of the race registry')
    args = parser.parse_args(argv)
    try:
        provenance = adapt(json.loads(args.pin.read_text()), args.output, args.bundle, args.from_dir, args.core_dir, args.baseline_dir,
                           registry_editions=args.registry_editions)
    except AdaptError as error:
        raise SystemExit(f'adapt_combined: {error}')
    if provenance is None:
        print(f'Wrote the written editions to {args.registry_editions}; no member was written.')
        return
    print(f"Adapted {provenance['release_tag']} ({args.bundle}) into {args.output.resolve()}; manifest {provenance['manifest_sha256']}.")


if __name__ == '__main__':
    main()
