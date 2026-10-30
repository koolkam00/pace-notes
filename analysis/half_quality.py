"""The reviewed record and edition policy for the half-marathon snapshot (docs/HALF_MARATHON.md; spec 1.3).

Mirrors analysis/source_quality.py `REVIEWED_POLICIES`: a release-specific policy, reviewed by a person, with every
count asserted. `REVIEWED_HALF_POLICIES[tag]` holds the rules, thresholds and the reviewed edition and sub-race lists;
`--write-policy` freezes it as analysis/half-policy-<stamp>.json, the single policy input of the independent Node
source recount (shared inputs, not shared code). The builder recomputes every computed screen (R3, R4, E0, E2–E8)
from the source and fails unless it equals the frozen lists, so a new snapshot fails here until its lists are reviewed.

Record rules (first match wins): R1 a producer exclusion flag; R2 an unparsed or non-positive finish; R3 a sub-race on
the reviewed non-running name list; R4 a sub-race with at least 5% (and at least 2) finishes under 56:42; R5 a finish
under 56:42 or over 6:00:00; R6 a within-edition duplicate (same token-sorted name, finish and published sex; the copy
from the largest sub-race list is kept, then the lowest id). The rows left are record-usable. R7 then removes the Oslo
Half bib block (same-day marathon finishers listed under the half): a range rule, never a list of people.

Edition rules (an edition supplies nothing if any applies; computed on the record-usable rows before R7, the order
the reviewed lists were made in): E0 no registry row; E1 a held status; E2 the reviewed duplicates, overlaps and
non-half distances; E3 count screens; E4 one-sex lists; E5 truncated top lists; E6 round-number caps without an
independent count; E7 atypical fields; E8 the same-race median screen. The rest are `use_finish`. `use_sex` keeps
editions whose sex is at least 95% published with each sex at least 3%.

The verified scope (stamp correction, reviewed 2026-10-30): an edition is verified only if it is `stamped` in this
snapshot AND in the producer's corrected metadata (release half-dataset-20261029-2157, `csv-edition_meta.csv.zst`, which
withdrew the stamps whose count came from a non-independent source). The records stay this snapshot's. The reviewed,
frozen list of the 72 withdrawn stamps (half_policy_lists.py) turns those editions into unverified ones before the edition
rules, exactly like the other internal-only editions; the builder reads the corrected metadata, checks its sha256 and fails
unless the list equals what the metadata gives and every usable edition stamped there is verified here.

Names, bibs and URLs never leave SQL: the R6 key is a digest computed in DuckDB and R7 is a boolean computed there.

    python3 -I analysis/half_quality.py --write-policy      freeze REVIEWED_HALF_POLICIES as the policy JSON
    python3 -I analysis/half_quality.py --check --half FILE [--corrected-meta FILE]
                                                            recompute the screens and every count from the source
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import ANALYSIS, ROOT, encode, fail, file_sha256, secs_sql  # noqa: E402

TAG = 'half-snapshot-20261029-1133'

# ---------------------------------------------------------------------------------------------------------------
# Rules and thresholds (fixed before the editions were read)
# ---------------------------------------------------------------------------------------------------------------

PRODUCER_EXCLUDE = ('duplicate', 'duplicate_load', 'duplicate_subset_list', 'wrong_year_copy', 'not_running',
                    'not_half_distance', 'separate_edition', 'separate_championship_list', 'trail_not_road_half',
                    'implausible_time', 'slow_outlier', 'disqualified', 'suspect_result_set')
WR_FLOOR_S = 3402        # 56:42, the men's half-marathon world record (Kiplimo, Barcelona, 16 February 2025)
SLOW_CAP_S = 21600       # 6:00:00 = 17:04 min/km, the marathon pipeline's 12-hour bound per km
# Reviewed sub-race names of other sports and assisted or combined classifications, matched on lower(race) (RE2 and
# JavaScript agree on this pattern; \b is an ASCII word boundary, so "Tordesillas" does not match).
NONRUN_SUBRACE_RE = (r'(rullaluistelu|patinaje|patines|\bmtb\b|sillas?\s+de\s+rueda|\bsillas?\b|wheelchair|\bwch\b|'
                     r'veh[ií]culo adaptado|pmrs?-puolimaraton|jo[eë]lette|combinata|half duathlon|'
                     r'discapacitad|discapacidad|capacidades (especiales|diferentes)|categor[ií]as especiales)')
SUBRACE_FAST_SHARE = 0.05
SUBRACE_FAST_MIN = 2
NAME_ANONYMOUS_RE = 'anonim|anonym|unknown|zawodnik'
R7 = {'city': 'Oslo Half', 'years': [2016, 2025], 'bib': [73000, 75999],
      'reason': 'Same-day Oslo marathon finishers listed under the half in a bib block.'}

VERIFIED = ('stamped',)
UNVERIFIED = ('counts_internal_only', 'counts_internal_only_winner_ok', 'counts_reconciled_winner_pending')
HELD = ('held_for_review', 'held_for_andrew_decision', 'duplicate_held_for_review')

SINGLE_SEX_EVENT_RE = (r"(?:women|woman|womens|girl|mujer|femme|filly|mother|divas|pink series|ladies|dames|frauen|damer|"
                       r"kvinn|men's half|mens half|herren)")
ROUND_CAPS = (500, 1000, 2000, 5000, 10000)
INDEPENDENT_RE = (r'independent|organiser|press|kondis|ffa federation|wikipedia|rfea|club|race report|media guide|racenerd|'
                  r'official results pdf|nyrr_api|racecast|marathon4you|uitslagen|enduhub|aggregator')
NOT_INDEPENDENT_RE = r'not independent|internal only|derived'
COUNT_TOLERANCE = 0.02
ONE_SEX = {'min_finishes': 50, 'min_coverage': 0.9, 'min_share': 0.03}
TRUNCATED = {'min_finishes': 200, 'max_p99_over_median': 1.20}
ATYPICAL = {'fast_share_under_s': 3900, 'fast_share': 0.03, 'fast_median_s': 4500, 'slow_median_s': 12600}
MEDIAN_SCREEN = {'min_finishes': 100, 'min_editions': 3, 'max_abs_log_ratio': 0.15}
USE_SEX = {'min_coverage': 0.95, 'min_share': 0.03, 'max_share': 0.97}
DATE_SUSPECTS = (
    (8712, 'Gdańsk', 2026, 'Dated 2026-09-27, the Warsaw marathon date; 126 linked people finished both.'),
    (7565, 'Ribera', 2019, 'Ribera 2019 and Gela 2019 are both dated 2019-12-01; 209 linked people finished both with different times.'),
    (7677, 'Gela', 2019, 'Ribera 2019 and Gela 2019 are both dated 2019-12-01; 209 linked people finished both with different times.'),
)

CATEGORY_RULE = {
    'no_edition_meta': 'E0', 'held_by_producer': 'E1', 'cross_edition_duplicate': 'E2', 'cross_edition_overlap_hold': 'E2',
    'not_half_distance': 'E2', 'count_excess_vs_independent': 'E3', 'count_shortfall_vs_independent': 'E3',
    'rows_short_of_source_list': 'E3', 'one_sex_list': 'E4', 'truncated_top_list': 'E5', 'round_count_cap': 'E6',
    'atypical_fast_field': 'E7', 'atypical_slow_field': 'E7', 'series_median_shift': 'E8',
}

# The reviewed E2 decisions (audit 2026-10-29, understand/half-audit.md 1.7), by registry id or by city and year.
REVIEWED_E2 = (
    (6690, 'cross_edition_duplicate', "Same 564 results (names and times) as Celina, OH: Grand Lake Half Marathon 5k/Kid's Run 2015 (id 2860), loaded from a second RunSignup race id."),
    (3707, 'cross_edition_duplicate', 'Same results as Valparaiso, IN: Valparaiso Half Marathon 2014 (id 3559): 365 of 365 finish times and 359 names shared, same race date.'),
    (7854, 'cross_edition_duplicate', 'All 318 rows repeat names and times from Southport 2016 (id 7860, 1,154 rows): a subset list of the same race.'),
    (7508, 'cross_edition_duplicate', 'Identical 81 results to Coupeville, WA: Race the Reserve Whidbey Island 2019 (id 7482), second RunSignup race id.'),
    (7509, 'cross_edition_duplicate', 'Identical 86 results to Coupeville, WA: Race the Reserve Whidbey Island 2018 (id 7483), second RunSignup race id.'),
    (3666, 'cross_edition_duplicate', 'Same 376 runners and race date as South Hero, VT: Champlain Islands Marathon & Half Marathon 2015 (id 687); times differ by a few seconds (a second timing basis).'),
    (6740, 'cross_edition_overlap_hold', 'Run Holden Beach 2017 shares 193 identical finish times and 314 of 372 names with Run Ocean Isle Beach 2017, a race three weeks later: one list contains rows of the other.'),
    (7012, 'cross_edition_overlap_hold', 'Run Ocean Isle Beach 2017 shares 193 identical finish times and 314 names with Run Holden Beach 2017 (see id 6740).'),
)
REVIEWED_E2_BY_KEY = (
    ('Brunico: 3/4 Mezza Maratona', 2013, 'not_half_distance', 'The race is a three-quarter half marathon (about 15.8 km), not a half marathon.'),
)

# Same city, same year (women.json): half city labels for each marathon city (frozen with the policy).
SAME_CITY_LABELS = {
    'Amsterdam': ['Amsterdam'], 'Berlin': ['Berlin'], 'Cologne': ['Cologne'], 'Copenhagen': ['Copenhagen Half'],
    'Eindhoven': ['Eindhoven'], 'Hamburg': ['Hamburg'], 'Helsinki': ['Helsinki Half'], 'London': ['London Big Half'],
    'Madrid': ['Madrid: XXII Movistar Madrid Medio Maratón'], 'New York': ['New York'], 'Oslo': ['Oslo Half'],
    'Paris': ['Paris'], 'Prague': ['Prague: Generali Prague Half Marathon', 'Prague: Prague Half Marathon'],
    'Stockholm': ['Stockholm'], 'Valencia': ['Valencia'], 'Vienna': ['Vienna'],
    'Warsaw': ['Warszawa', 'Warszawa: Półmaraton Warszawski'], 'Washington': ['Washington, DC: DC Half Races'],
}

# The stamp correction (owner decision 2026-10-30: "publish everything and full merge"). The producer's corrected release
# supersedes the metadata of the snapshot this policy reviews; its edition ids are this snapshot's (0 city or year
# mismatches). Verified = stamped in this snapshot and in the corrected metadata.
CORRECTION_20261029_2157 = {
    'repository': 'koolkam00/pace-notes', 'tag': 'half-dataset-20261029-2157', 'asset': 'csv-edition_meta.csv.zst',
    'sha256': '2b8ad1106a6ee8845147ebd4563b5dcb64a2a8fe9a9044b83a0f1e34f681e842',
    'readme_sha256': '3ba5ed96096bab048da5d81d3bd0428962661ccc494aa99963efa505e7506332',
    'applied': 'verified = stamped in both', 'reviewed': '2026-10-30',
    'rule': ('an edition stamped in this snapshot whose corrected completeness_status is not stamped is unverified (it keeps '
             'its records and passes through the edition rules like any internal-only edition); an edition stamped only in the '
             'corrected metadata is not verified (no usable edition of this snapshot is)'),
    'reason_rule': ("the first ' | '-separated part of the corrected completeness_reason that contains 'unstamped', else the "
                    "first part; runs of spaces, tabs and newlines made one space; over 160 characters, cut to the last space "
                    "within the first 159 and ended with '…'"),
    'weaker_source_rule': ("the six stamps the corrected release's README names as resting on an organiser or local-press "
                           "count rather than a federation count; they stay verified; `source` is the corrected "
                           "official_source_type under the reason rule's length cut"),
}
REASON_MAX = 160

from half_policy_lists import (  # noqa: E402  (the reviewed lists, kept apart for length)
    FROZEN_20261029_1133, LABEL_COUNTRIES_20261029_1133, WEAKER_SOURCE_20261029_2157, WITHDRAWN_STAMPS_20261029_2157)

EXPECTED_20261029_1133 = {
    'raw': 6_854_820, 'R1': 98_768, 'R2': 0, 'R3': 1_395, 'R4': 1_088, 'R5_fast': 152, 'R5_slow': 397, 'R6': 1_949,
    'record_usable': 6_751_071, 'R7': 606, 'record_usable_after_R7': 6_750_465,
    'E0_editions': 2, 'E0_finishes': 1_080, 'E1_held_editions': 614, 'E1_held_finishes': 702_694,
    'E2_E8_editions': 66, 'E2_E8_finishes': 133_940,
    'use_finish': {'finishes': 5_912_751, 'editions': 8_019},
    # Verified = stamped here and in the corrected metadata (2026-10-30). Before the correction: 1,623,027 finishes in
    # 310 editions; with recorded sex 1,558,344 in 299 (Git history and docs/HALF_MARATHON.md keep the earlier figures).
    'verified': {'finishes': 753_476, 'editions': 238},
    'verified_use_sex': {'finishes': 734_301, 'editions': 231},
    'undated': {'finishes': 820_515, 'editions': 251},
    'stamp_withdrawn': {'finishes': 869_551, 'editions': 72},
}

REVIEWED_HALF_POLICIES = {
    TAG: {
        'file': 'analysis/half-policy-20261029-1133.json',
        'reviewed': '2026-10-29',
        'corrected': '2026-10-30',
        'expected': EXPECTED_20261029_1133,
        'frozen': FROZEN_20261029_1133,
        'label_countries': LABEL_COUNTRIES_20261029_1133,
        'correction': {**CORRECTION_20261029_2157, 'withdrawn': WITHDRAWN_STAMPS_20261029_2157,
                       'weaker_source': WEAKER_SOURCE_20261029_2157},
    },
}


def policy_document(tag: str = TAG) -> dict:
    """The frozen policy JSON: every rule, threshold, reviewed list and expected count the recount needs."""
    if tag not in REVIEWED_HALF_POLICIES:
        fail(f'no reviewed half policy for {tag}')
    p = REVIEWED_HALF_POLICIES[tag]
    frozen = p['frozen']
    return {
        'schema_version': 1,
        'tag': tag,
        'reviewed': p['reviewed'],
        'corrected': p['corrected'],
        'record_rules': {
            'order': ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'],
            'R1': {'flags': list(PRODUCER_EXCLUDE), 'never_alone': ['time_hour_reconstructed']},
            'R2': {'column': 'split_21_1km', 'pattern': '^[0-9]+:[0-9]{2}:[0-9]{2}$', 'min_s_exclusive': 0},
            'R3': {'pattern': NONRUN_SUBRACE_RE, 'applies_to': 'lower(race), on rows passing R1 and R2', 'subraces': frozen['R3']},
            'R4': {'floor_s': WR_FLOOR_S, 'min_share': SUBRACE_FAST_SHARE, 'min_count': SUBRACE_FAST_MIN,
                   'applies_to': 'sub-races (city, year, race) counted on rows passing R1 and R2', 'subraces': frozen['R4']},
            'R5': {'min_s': WR_FLOOR_S, 'max_s': SLOW_CAP_S},
            'R6': {'key': ('city, year, md5 of the name lowercased with accents stripped, commas and every character '
                           'outside a-z0-9 and space made spaces, split on spaces, empty tokens dropped, tokens sorted and '
                           'joined by one space; finish; published sex (null as ?)'),
                   'name_required': 'trim(name) longer than 3 characters and not matching the anonymous pattern',
                   'anonymous_pattern': NAME_ANONYMOUS_RE,
                   'keep': 'the copy from the largest sub-race list (R3 and R4 counts), then the lowest record id'},
            'R7': {**R7, 'applies_to': 'record-usable rows', 'bib_rule': 'try_cast(bib AS INTEGER) in the range, inclusive'},
        },
        'statuses': {'verified': list(VERIFIED), 'unverified': list(UNVERIFIED), 'held': list(HELD)},
        'edition_rules': {
            'order': ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'],
            'edition': 'city and year; registry rows from edition_meta joined on city and year',
            'computed_on': 'record-usable rows before R7',
            'E3': {'independent_pattern': INDEPENDENT_RE, 'not_independent_pattern': NOT_INDEPENDENT_RE, 'tolerance': COUNT_TOLERANCE},
            'E4': {**ONE_SEX, 'single_sex_event_pattern': SINGLE_SEX_EVENT_RE},
            'E5': TRUNCATED,
            'E6': {'caps': list(ROUND_CAPS)},
            'E7': ATYPICAL,
            # The reference set, said in words, so an independent recount follows the frozen list (review, October 30,
            # 2026: read without held editions, the screen also flags Graz 2024).
            'E8': {**MEDIAN_SCREEN, 'reference': (
                "the median of the edition medians of the label's other editions with at least 100 record-usable finishes "
                '(counted before R7) and a verified, unverified or held status, held (E1) editions and editions an earlier '
                'rule removes included; the label needs at least 3 such editions, the edition itself counted, and the screen '
                'applies only to editions no earlier rule removes')},
            'categories': CATEGORY_RULE,
            'editions': frozen['editions'],
        },
        'use_sex': USE_SEX,
        'stamp_correction': p['correction'],
        'date_suspects': [{'edition_id': e, 'city': c, 'year': y, 'reason': r} for e, c, y, r in DATE_SUSPECTS],
        'same_city_labels': SAME_CITY_LABELS,
        'verified_label_countries': p['label_countries'],
        'expected': p['expected'],
    }


def policy_path(tag: str = TAG) -> Path:
    return ROOT / REVIEWED_HALF_POLICIES[tag]['file']


def write_policy(tag: str = TAG) -> Path:
    path = policy_path(tag)
    path.write_bytes(json.dumps(policy_document(tag), ensure_ascii=False, indent=1, sort_keys=True).encode() + b'\n')
    return path


def check_policy_file(tag: str = TAG) -> str:
    """The frozen JSON must equal the reviewed policy in this module; returns its sha256."""
    path = policy_path(tag)
    if not path.is_file():
        fail(f'missing {path.relative_to(ROOT)}; write it with python3 -I analysis/half_quality.py --write-policy')
    expected = json.dumps(policy_document(tag), ensure_ascii=False, indent=1, sort_keys=True).encode() + b'\n'
    if path.read_bytes() != expected:
        fail(f'{path.relative_to(ROOT)} differs from REVIEWED_HALF_POLICIES[{tag!r}]; review, then rerun --write-policy')
    return file_sha256(path)


def module_sha256() -> str:
    """sha256 of the policy modules (this file and the reviewed lists)."""
    import hashlib
    digest = hashlib.sha256()
    for name in ('half_quality.py', 'half_policy_lists.py'):
        digest.update((ANALYSIS / name).read_bytes())
    return digest.hexdigest()


# ---------------------------------------------------------------------------------------------------------------
# Applying the policy (DuckDB, the snapshot attached as `h`)
# ---------------------------------------------------------------------------------------------------------------

def _sql_list(values) -> str:
    return ', '.join("'" + v.replace("'", "''") + "'" for v in values)


def record_rules(db) -> None:
    """Temp table `hr`: one row per race_records row with its first record rule (NULL = record-usable) and R7 flag."""
    excl = _sql_list(PRODUCER_EXCLUDE)
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hfl AS SELECT record_id, bool_or(flag IN ({excl})) AS producer_excluded
                   FROM h.record_flags GROUP BY record_id""")
    lo, hi = R7['bib']
    y0, y1 = R7['years']
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hr0 AS SELECT r.id AS record_id, r.city, r.year::INTEGER AS year, r.race,
        CASE WHEN r.sex IN ('M', 'F') THEN r.sex END AS sex, r.sex AS sex_published, {secs_sql('r.split_21_1km')} AS finish_s,
        coalesce(f.producer_excluded, false) AS producer_excluded,
        CASE WHEN r.runner IS NOT NULL AND length(trim(r.runner)) > 3 AND NOT regexp_matches(lower(r.runner), '{NAME_ANONYMOUS_RE}')
          THEN md5(array_to_string(list_sort(list_filter(string_split(regexp_replace(lower(strip_accents(replace(r.runner, ',', ' '))),
               '[^a-z0-9 ]', ' ', 'g'), ' '), x -> x <> '')), ' ')) END AS name_key,
        (r.city = '{R7['city']}' AND r.year BETWEEN {y0} AND {y1} AND try_cast(r.bib AS INTEGER) BETWEEN {lo} AND {hi}) AS r7_block,
        r.distance_km
        FROM h.race_records r LEFT JOIN hfl f ON f.record_id = r.id""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hsub AS SELECT city, year, race, count(*) AS n,
        count(*) FILTER (WHERE finish_s < {WR_FLOOR_S}) AS n_fast,
        regexp_matches(lower(race), '{NONRUN_SUBRACE_RE.replace("'", "''")}') AS name_nonrun
        FROM hr0 WHERE NOT producer_excluded AND finish_s IS NOT NULL AND finish_s > 0 GROUP BY city, year, race""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hsub2 AS SELECT city, year, race, n AS sub_n,
        CASE WHEN name_nonrun THEN 'R3' WHEN n_fast >= {SUBRACE_FAST_MIN} AND n_fast >= {SUBRACE_FAST_SHARE} * n THEN 'R4' END AS sub_rule
        FROM hsub""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hr1 AS SELECT r.*, s.sub_n, CASE
        WHEN r.producer_excluded THEN 'R1'
        WHEN r.finish_s IS NULL OR r.finish_s <= 0 THEN 'R2'
        WHEN s.sub_rule IS NOT NULL THEN s.sub_rule
        WHEN r.finish_s < {WR_FLOOR_S} THEN 'R5_fast'
        WHEN r.finish_s > {SLOW_CAP_S} THEN 'R5_slow' END AS rule0
        FROM hr0 r LEFT JOIN hsub2 s USING (city, year, race)""")
    db.execute("""CREATE OR REPLACE TEMP TABLE hdup AS SELECT unnest(list_filter(ids, x -> x <> keep)) AS record_id FROM (
        SELECT list(record_id) AS ids, arg_max(record_id, sub_n * 1e10 - record_id) AS keep FROM hr1
        WHERE rule0 IS NULL AND name_key IS NOT NULL
        GROUP BY city, year, name_key, finish_s, coalesce(sex_published, '?') HAVING count(*) > 1)""")
    db.execute("""CREATE OR REPLACE TEMP TABLE hr AS SELECT r.record_id, r.city, r.year, r.race, r.sex, r.sex_published,
        r.finish_s, r.r7_block, r.distance_km,
        CASE WHEN r.rule0 IS NOT NULL THEN r.rule0 WHEN d.record_id IS NOT NULL THEN 'R6' END AS rule
        FROM hr1 r LEFT JOIN hdup d USING (record_id)""")
    for t in ('hfl', 'hr0', 'hsub2', 'hr1', 'hdup'):
        db.execute(f'DROP TABLE {t}')


def subrace_lists(db) -> dict:
    """The R3 and R4 sub-races (computed), as frozen in the policy."""
    rows = db.execute(f"""SELECT s.city, s.year, s.race, s.n, s.n_fast, s.name_nonrun FROM hsub s
        WHERE s.name_nonrun OR (s.n_fast >= {SUBRACE_FAST_MIN} AND s.n_fast >= {SUBRACE_FAST_SHARE} * s.n)
        ORDER BY s.city, s.year, s.race""").fetchall()
    out = {'R3': [], 'R4': []}
    for city, year, race, n, n_fast, nonrun in rows:
        if nonrun:
            out['R3'].append({'city': city, 'year': int(year), 'race': race, 'finishes': int(n)})
        else:
            out['R4'].append({'city': city, 'year': int(year), 'race': race, 'finishes': int(n), 'under_floor': int(n_fast)})
    return out


def edition_table(db):
    """Per city-year metrics on the record-usable rows (before R7), joined to the registry; pandas DataFrame."""
    import pandas as pd
    dist = db.execute("SELECT count(*) FROM hr WHERE abs(distance_km - 21.0975) > 1e-9").fetchone()[0]
    if dist:
        fail(f'{dist} race_records rows are not 21.0975 km')
    dup = db.execute('SELECT count(*) FROM (SELECT city, year FROM h.edition_meta GROUP BY 1, 2 HAVING count(*) > 1)').fetchone()[0]
    if dup:
        fail(f'{dup} registry city-years have more than one edition_meta row')
    m = db.execute("""WITH a AS (SELECT city, year, count(*) AS n_db, count(*) FILTER (WHERE rule IS NULL) AS n_usable,
            median(finish_s) FILTER (WHERE rule IS NULL) AS med_s,
            quantile_cont(finish_s, 0.99) FILTER (WHERE rule IS NULL) AS p99_s,
            avg(CASE WHEN finish_s < 3900 THEN 1 ELSE 0 END) FILTER (WHERE rule IS NULL) AS share_sub65,
            count(*) FILTER (WHERE rule IS NULL AND sex_published = 'M') AS n_m,
            count(*) FILTER (WHERE rule IS NULL AND sex_published = 'F') AS n_f
          FROM hr GROUP BY city, year)
        SELECT coalesce(e.city, a.city) AS city, coalesce(e.year, a.year)::INTEGER AS year, e.id AS edition_id, e.race AS race_meta,
          e.race_date, try_cast(e.race_date AS DATE) AS race_day, e.completeness_status, e.official_finishers, e.official_source_type,
          coalesce(a.n_db, 0) AS n_db, coalesce(a.n_usable, 0) AS n_usable, a.med_s, a.p99_s, a.share_sub65,
          coalesce(a.n_m, 0) AS n_m, coalesce(a.n_f, 0) AS n_f
        FROM h.edition_meta e FULL OUTER JOIN a ON a.city = e.city AND a.year = e.year
        ORDER BY 1, 2""").df()
    m['edition_id'] = m['edition_id'].astype('Int64')
    for col in ('official_finishers', 'med_s', 'p99_s', 'share_sub65'):
        m[col] = m[col].astype('float')
    for col in ('n_db', 'n_usable', 'n_m', 'n_f'):
        m[col] = m[col].astype('int64')
    st = m.completeness_status.fillna('')
    m['status_group'] = 'no_rows'
    m.loc[st.isin(HELD), 'status_group'] = 'held'
    m.loc[st.isin(UNVERIFIED), 'status_group'] = 'unverified'
    m.loc[st.isin(VERIFIED), 'status_group'] = 'verified'
    m.loc[m.edition_id.isna(), 'status_group'] = 'no_edition_meta'
    t = m.official_source_type.fillna('').str.lower()
    m['independent'] = t.str.contains(INDEPENDENT_RE) & ~t.str.contains(NOT_INDEPENDENT_RE)
    sexed = m.n_m + m.n_f
    m['sex_coverage'] = (sexed / m.n_usable.where(m.n_usable > 0)).astype(float)
    m['women_share'] = (m.n_f / sexed.where(sexed > 0)).astype(float)
    m['p99_over_median'] = m.p99_s / m.med_s
    m['single_sex_event'] = (m.city.fillna('') + ' ' + m.race_meta.fillna('')).str.lower().str.contains(SINGLE_SEX_EVENT_RE)
    return m


def _edition_rule(r, by_id, by_key):
    """(category, reason) of the first edition rule that applies before E8, or (None, None)."""
    if r.status_group == 'no_edition_meta':
        return ('no_edition_meta', 'Records exist for this city and year but the edition registry has no row: no count, date or status; not verified.')
    if r.status_group == 'no_rows' or (r.n_usable == 0 and r.status_group != 'held'):
        return ('no_usable_rows', 'No usable finish rows.')
    if r.status_group == 'held':
        return ('held_by_producer', f'Producer status {r.completeness_status}.')
    eid = int(r.edition_id)
    if eid in by_id:
        return by_id[eid]
    if (r.city, int(r.year)) in by_key:
        return by_key[(r.city, int(r.year))]
    off = r.official_finishers
    has_off = off is not None and not (isinstance(off, float) and math.isnan(off))
    tol = COUNT_TOLERANCE
    if r.independent and r.status_group != 'verified' and has_off and r.n_db > (1 + tol) * off:
        return ('count_excess_vs_independent', f'{r.n_db:,} rows against an independent total of {int(off):,} finishers (+{(r.n_db / off - 1) * 100:.0f}%): the rows include other contests or entries.')
    if r.independent and r.status_group != 'verified' and has_off and r.n_usable < (1 - tol) * off:
        return ('count_shortfall_vs_independent', f'{r.n_usable:,} usable finishes against an independent total of {int(off):,} ({(1 - r.n_usable / off) * 100:.1f}% short).')
    if (not r.independent) and has_off and off > 0 and r.n_db < (1 - tol) * off:
        return ('rows_short_of_source_list', f'{r.n_db:,} rows loaded from a source list of {int(off):,} rows ({(1 - r.n_db / off) * 100:.1f}% short).')
    ws = r.women_share
    if (r.n_usable >= ONE_SEX['min_finishes'] and r.sex_coverage >= ONE_SEX['min_coverage']
            and (ws < ONE_SEX['min_share'] or ws > 1 - ONE_SEX['min_share']) and not r.single_sex_event):
        return ('one_sex_list', f'Sex is published for {r.sex_coverage * 100:.0f}% of rows but only one sex is present ({r.n_m:,} men, {r.n_f:,} women) and the event is not a single-sex race: the other list is missing.')
    if r.n_usable >= TRUNCATED['min_finishes'] and r.p99_over_median < TRUNCATED['max_p99_over_median']:
        return ('truncated_top_list', f'The slowest finishes stop close to the median (99th percentile {r.p99_over_median:.2f} x median): a top-finisher list, not the field.')
    if r.status_group != 'verified' and r.n_db in ROUND_CAPS:
        return ('round_count_cap', f'Exactly {r.n_db:,} rows with no independent count: the list may be cut at a page size.')
    if r.n_usable > 0 and (r.share_sub65 >= ATYPICAL['fast_share'] or r.med_s < ATYPICAL['fast_median_s']):
        return ('atypical_fast_field', f'{r.share_sub65 * 100:.1f}% of finishes under 1:05 (median {r.med_s / 60:.0f} min): an elite or championship-only list, or other distances mixed in.')
    if r.n_usable > 0 and r.med_s > ATYPICAL['slow_median_s']:
        return ('atypical_slow_field', f'Median finish {r.med_s / 3600:.2f} h: a trail, walking or challenge event rather than a road half-marathon field.')
    return (None, None)


def edition_rules(m):
    """Adds `category`, `reason`, `rule` (E0–E8) and the use flags to the edition table."""
    import numpy as np
    import pandas as pd
    by_id = {e: (c, r) for e, c, r in REVIEWED_E2}
    by_key = {(city, year): (c, r) for city, year, c, r in REVIEWED_E2_BY_KEY}
    rules = [_edition_rule(r, by_id, by_key) for r in m.itertuples(index=False)]
    m['category'] = [c for c, _ in rules]
    m['reason'] = [r for _, r in rules]
    s_ok = (m.n_usable >= MEDIAN_SCREEN['min_finishes']) & m.status_group.isin(['verified', 'unverified', 'held'])
    others = pd.Series(np.nan, index=m.index)
    n_eds = pd.Series(0, index=m.index)
    for _, idx in m[s_ok].groupby('city').groups.items():
        values = m.loc[idx, 'med_s']
        for i in idx:
            rest = values.drop(i)
            n_eds[i] = len(values)
            others[i] = rest.median() if len(rest) else np.nan
    log_dev = np.log(m.med_s / others)
    shift = m.category.isna() & s_ok & (n_eds >= MEDIAN_SCREEN['min_editions']) & (log_dev.abs() > MEDIAN_SCREEN['max_abs_log_ratio'])
    m.loc[shift, 'category'] = 'series_median_shift'
    m.loc[shift, 'reason'] = [
        f"Median finish {med / 60:.0f} min against {oth / 60:.0f} min in the same race’s other editions ({(math.exp(dev) - 1) * 100:+.0f}%): the time column may include the start delay or another contest."
        for med, oth, dev in zip(m.loc[shift, 'med_s'], others[shift], log_dev[shift])]
    m['rule'] = m.category.map(CATEGORY_RULE)
    m['use_finish'] = m.category.isna() & (m.n_usable > 0) & m.status_group.isin(['verified', 'unverified'])
    m['use_sex'] = (m.use_finish & (m.sex_coverage >= USE_SEX['min_coverage'])
                    & m.women_share.between(USE_SEX['min_share'], USE_SEX['max_share']))
    suspects = {e for e, *_ in DATE_SUSPECTS}
    m['date_suspect'] = m.edition_id.isin(suspects).fillna(False).astype(bool)
    return m


def edition_list(m) -> list:
    """The frozen edition list: every edition an E0, E2–E8 rule removes (E1 is a status rule and only counted)."""
    import pandas as pd
    rows = m[m.rule.notna() & (m.rule != 'E1')].sort_values(['rule', 'city', 'year'])
    out = []
    for r in rows.itertuples(index=False):
        out.append({'edition_id': None if pd.isna(r.edition_id) else int(r.edition_id), 'city': r.city, 'year': int(r.year),
                    'rule': r.rule, 'category': r.category, 'reason': r.reason, 'finishes': int(r.n_usable)})
    return out


# ---------------------------------------------------------------------------------------------------------------
# The stamp correction (the corrected metadata of half-dataset-20261029-2157)
# ---------------------------------------------------------------------------------------------------------------

def trim_text(text, limit: int = REASON_MAX) -> str:
    """Runs of ASCII whitespace made one space; over `limit` characters, cut at the last space within `limit - 1` and
    ended with an ellipsis (the policy's reason rule; scripts/half/policy.cjs `trimText` is the same)."""
    s = re.sub(r'[ \t\r\n]+', ' ', text or '').strip()
    if len(s) <= limit:
        return s
    cut = s[:limit - 1]
    space = cut.rfind(' ')
    return (cut[:space] if space > 0 else cut).rstrip(' ,;:') + '…'


def correction_reason(text) -> str:
    """The withdrawal clause of a corrected completeness_reason (the policy's reason rule)."""
    parts = [p.strip() for p in (text or '').split(' | ') if p.strip()]
    if not parts:
        return ''
    return trim_text(next((p for p in parts if 'unstamped' in p), parts[0]))


def read_correction(path: Path, correction: dict) -> dict:
    """The corrected edition registry, {edition_id: {city, year, status, reason, source_type}}, after its sha256 is
    checked against the reviewed correction (and so against the pin). Fails loudly on any other file."""
    from half_common import file_sha256 as _sha
    path = Path(path)
    if not path.is_file():
        fail(f"missing the corrected metadata {path} ({correction['tag']}/{correction['asset']}); fetch it with "
             'python3 -I analysis/download_half.py')
    got = _sha(path)
    if got != correction['sha256']:
        fail(f"{path} is not the reviewed corrected metadata of {correction['tag']} (sha256 {got}, reviewed {correction['sha256']})")
    if shutil.which('zstd') is None:
        fail('the zstd command is required to read the corrected metadata')
    raw = subprocess.run(['zstd', '-dc', '-q', str(path)], check=True, capture_output=True).stdout
    rows = {}
    for r in csv.DictReader(io.StringIO(raw.decode('utf-8'), newline='')):
        eid = int(r['id'])
        if eid in rows:
            fail(f'the corrected metadata lists edition {eid} twice')
        rows[eid] = {'city': r['city'], 'year': int(r['year']), 'status': r['completeness_status'],
                     'reason': r['completeness_reason'], 'source_type': r['official_source_type']}
    return rows


def default_correction_path(tag: str = TAG) -> Path:
    """Where download_half.py puts the corrected metadata: $PACE_HALF_DIR/<correction tag>/<asset>."""
    c = REVIEWED_HALF_POLICIES[tag]['correction']
    half_dir = Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1133').expanduser()
    return half_dir / c['tag'] / c['asset']


def apply_stamp_correction(m, correction: dict, rows: dict | None, *, compare: bool = True):
    """Turns the reviewed withdrawn stamps into unverified editions (before the edition rules). With the corrected
    metadata (`rows`), fails unless the reviewed list equals what the metadata gives and the six weaker-source stamps are
    stamped there. Returns the edition ids it changed."""
    withdrawn = {w['edition_id']: w for w in correction['withdrawn']}
    m['corrected_status'] = None
    applied = []
    for idx in m.index[m.edition_id.notna()]:
        eid = int(m.at[idx, 'edition_id'])
        w = withdrawn.get(eid)
        if w is None:
            continue
        here = (m.at[idx, 'city'], int(m.at[idx, 'year']), m.at[idx, 'completeness_status'])
        if here != (w['city'], w['year'], 'stamped'):
            if compare:
                fail(f"withdrawn stamp {eid} ({w['city']} {w['year']}) is {here} in this snapshot, not a stamped edition of that name")
            continue
        m.at[idx, 'status_group'] = 'unverified'
        m.at[idx, 'corrected_status'] = w['corrected_status']
        applied.append(eid)
    if compare and len(applied) != len(withdrawn):
        fail(f'{len(withdrawn) - len(applied)} reviewed withdrawn stamps are not editions of this snapshot')
    if rows is not None:
        derived = []
        for r in m[(m.completeness_status == 'stamped') & m.edition_id.notna()].itertuples(index=False):
            eid = int(r.edition_id)
            c = rows.get(eid)
            if c is None:
                fail(f'stamped edition {eid} ({r.city} {int(r.year)}) is missing from the corrected metadata')
            if (c['city'], c['year']) != (r.city, int(r.year)):
                fail(f"edition {eid} is {r.city} {int(r.year)} here and {c['city']} {c['year']} in the corrected metadata")
            if c['status'] != 'stamped':
                derived.append({'edition_id': eid, 'city': r.city, 'year': int(r.year), 'corrected_status': c['status'],
                                'reason': correction_reason(c['reason'])})
        derived.sort(key=lambda x: (x['city'], x['year'], x['edition_id']))
        if derived != correction['withdrawn']:
            got = {json.dumps(x, sort_keys=True, ensure_ascii=False) for x in derived}
            want = {json.dumps(x, sort_keys=True, ensure_ascii=False) for x in correction['withdrawn']}
            fail(f'the withdrawn stamps differ from the corrected metadata; new {sorted(got - want)[:3]}, gone {sorted(want - got)[:3]}')
        for x in correction['weaker_source']:
            c = rows.get(x['edition_id'])
            if c is None or (c['city'], c['year'], c['status']) != (x['city'], x['year'], 'stamped') or trim_text(c['source_type']) != x['source']:
                fail(f"weaker-source stamp {x['edition_id']} ({x['city']} {x['year']}) is not stamped with that source in the corrected metadata")
    return applied


def check_corrected_verified(m, correction: dict, rows: dict | None) -> None:
    """After the edition rules: every usable edition stamped in the corrected metadata is verified here, every verified
    edition is stamped there, and the weaker-source stamps stay verified."""
    usable = m[m.use_finish & m.edition_id.notna()]
    if rows is not None:
        for r in usable.itertuples(index=False):
            c = rows.get(int(r.edition_id))
            stamped_there = c is not None and c['status'] == 'stamped'
            if stamped_there and r.status_group != 'verified':
                fail(f'{r.city} {int(r.year)} is stamped in the corrected metadata but unverified in the build')
            if r.status_group == 'verified' and not stamped_there:
                fail(f'{r.city} {int(r.year)} is verified in the build but not stamped in the corrected metadata')
    ids = set(usable[usable.status_group == 'verified'].edition_id.astype(int))
    for x in correction['weaker_source']:
        if x['edition_id'] not in ids:
            fail(f"weaker-source stamp {x['city']} {x['year']} is not a verified usable edition of the build")


class PolicyResult:
    """The applied policy: counts (spec 1.3), the edition table and the computed lists."""

    def __init__(self, counts, editions, lists):
        self.counts = counts
        self.editions = editions
        self.lists = lists


def apply(db, tag: str = TAG, *, compare: bool = True, correction_rows: dict | None = None) -> PolicyResult:
    """Apply the policy; leave temp tables `hr` (every record and its rule) and `hfin` (use_finish finishes after R7,
    plus the R7 rows flagged) in `db`; return the counts. Fails when a computed list or count differs from the review.
    `correction_rows` is the corrected metadata (read_correction); a comparing run requires it."""
    import pandas as pd
    if tag not in REVIEWED_HALF_POLICIES:
        fail(f'no reviewed half policy for {tag}')
    reviewed = REVIEWED_HALF_POLICIES[tag]
    if compare and correction_rows is None:
        fail('the corrected metadata is required (read_correction; build_half.py --corrected-meta)')
    record_rules(db)
    subs = subrace_lists(db)
    m = edition_table(db)
    withdrawn_ids = apply_stamp_correction(m, reviewed['correction'], correction_rows, compare=compare)
    m = edition_rules(m)
    if compare:
        check_corrected_verified(m, reviewed['correction'], correction_rows)
    lists = {'R3': subs['R3'], 'R4': subs['R4'], 'editions': edition_list(m)}
    if compare:
        for key in ('R3', 'R4', 'editions'):
            if lists[key] != reviewed['frozen'][key]:
                got = {json.dumps(x, sort_keys=True, ensure_ascii=False) for x in lists[key]}
                want = {json.dumps(x, sort_keys=True, ensure_ascii=False) for x in reviewed['frozen'][key]}
                fail(f'{key}: the computed list differs from the reviewed one; new {sorted(got - want)[:5]}, gone {sorted(want - got)[:5]}')

    by_rule = dict(db.execute("SELECT coalesce(rule, 'usable'), count(*) FROM hr GROUP BY 1").fetchall())
    ed = m[['edition_id', 'city', 'year', 'status_group', 'rule', 'use_finish', 'use_sex', 'race_day', 'date_suspect']].copy()
    ed['edition_id'] = ed.edition_id.astype('float').astype('Int64')
    db.register('hed_df', ed)
    db.execute("""CREATE OR REPLACE TEMP TABLE hed AS SELECT edition_id::BIGINT AS edition_id, city, year::INTEGER AS year,
        status_group, rule, use_finish, use_sex, race_day, date_suspect FROM hed_df""")
    db.unregister('hed_df')
    db.execute("""CREATE OR REPLACE TEMP TABLE hfin AS SELECT r.record_id, e.edition_id, r.city, r.year, r.race, e.race_day AS race_date,
        e.status_group, r.sex, (e.use_sex AND r.sex IS NOT NULL) AS use_sex, r.finish_s, r.r7_block, e.date_suspect
        FROM hr r JOIN hed e ON e.city = r.city AND e.year = r.year
        WHERE r.rule IS NULL AND e.use_finish""")
    q = lambda sql: db.execute(sql).fetchone()
    raw = q('SELECT count(*) FROM hr')[0]
    usable = by_rule.get('usable', 0)
    r7 = q('SELECT count(*) FROM hr WHERE rule IS NULL AND r7_block')[0]
    r7_outside = q('SELECT count(*) FROM hfin WHERE r7_block')[0]
    if r7_outside != r7:
        fail(f'{r7 - r7_outside} R7 rows sit outside use_finish editions; the rule was reviewed on use_finish editions only')
    held = m[m.rule == 'E1']
    e0 = m[m.rule == 'E0']
    e28 = m[m.rule.isin(['E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'])]
    fin = lambda where: q(f'SELECT count(*), count(DISTINCT edition_id) FROM hfin WHERE NOT r7_block AND {where}')
    uf, vf, vs, nd = fin('TRUE'), fin("status_group = 'verified'"), fin("status_group = 'verified' AND use_sex"), fin('race_date IS NULL')
    wd = fin(f"edition_id IN ({', '.join(str(e) for e in withdrawn_ids) or 'NULL'})")
    counts = {
        'raw': raw, 'R1': by_rule.get('R1', 0), 'R2': by_rule.get('R2', 0), 'R3': by_rule.get('R3', 0), 'R4': by_rule.get('R4', 0),
        'R5_fast': by_rule.get('R5_fast', 0), 'R5_slow': by_rule.get('R5_slow', 0), 'R6': by_rule.get('R6', 0),
        'record_usable': usable, 'R7': r7, 'record_usable_after_R7': usable - r7,
        'E0_editions': len(e0), 'E0_finishes': int(e0.n_usable.sum()),
        'E1_held_editions': len(held), 'E1_held_finishes': int(held.n_usable.sum()),
        'E2_E8_editions': len(e28), 'E2_E8_finishes': int(e28.n_usable.sum()),
        'use_finish': {'finishes': uf[0], 'editions': uf[1]},
        'verified': {'finishes': vf[0], 'editions': vf[1]},
        'verified_use_sex': {'finishes': vs[0], 'editions': vs[1]},
        'undated': {'finishes': nd[0], 'editions': nd[1]},
        'stamp_withdrawn': {'finishes': wd[0], 'editions': wd[1]},
    }
    if compare and counts != reviewed['expected']:
        diff = {k: (counts.get(k), reviewed['expected'].get(k)) for k in set(counts) | set(reviewed['expected']) if counts.get(k) != reviewed['expected'].get(k)}
        fail(f'policy counts differ from the reviewed ones (got, reviewed): {diff}')
    return PolicyResult(counts, m, lists)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--write-policy', action='store_true', help='freeze REVIEWED_HALF_POLICIES as the policy JSON')
    parser.add_argument('--check', action='store_true', help='recompute the screens and counts from --half')
    parser.add_argument('--discover', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--half', type=Path)
    parser.add_argument('--corrected-meta', type=Path, default=None,
                        help='the corrected edition_meta CSV (default $PACE_HALF_DIR/<correction tag>/csv-edition_meta.csv.zst)')
    args = parser.parse_args(argv)
    if args.write_policy:
        print(f'wrote {write_policy().relative_to(ROOT)}')
    if args.check or args.discover:
        from half_common import connect
        if args.half is None:
            fail('--half is required')
        db = connect(half=args.half)
        rows = read_correction(args.corrected_meta or default_correction_path(), REVIEWED_HALF_POLICIES[TAG]['correction'])
        result = apply(db, compare=not args.discover, correction_rows=rows)
        if args.discover:
            print(json.dumps({'counts': result.counts, 'lists': result.lists}, ensure_ascii=False, indent=1))
        else:
            print(json.dumps(result.counts))
            print(f'policy {check_policy_file()} matches the source')
    return 0


if __name__ == '__main__':
    sys.exit(main())
