"""The reviewed record and edition policy for the half-marathon snapshot (docs/HALF_MARATHON.md; spec 1.3).

Mirrors analysis/source_quality.py `REVIEWED_POLICIES`: a release-specific policy, reviewed by a person, with every
count asserted. `REVIEWED_HALF_POLICIES[key]` holds the rules, thresholds and the reviewed edition and sub-race lists of
one snapshot, keyed by the pin's `half.key`; `--write-policy` freezes it as analysis/half-policy-<stamp>.json, the single
policy input of the independent Node source recount (shared inputs, not shared code). The builder recomputes every
computed screen (R3, R4, E0, E2–E8) from the source and fails unless it equals the frozen lists, so a new snapshot fails
here until its lists are reviewed. Each entry carries its own rule constants (patterns, status groups, categories, the
reviewed E2 decisions, the same-city labels, the battery rules), so an earlier entry keeps producing its frozen file
byte for byte (analysis/test_half.py) after a later snapshot changes a rule.

Record rules (first match wins): R1 a producer exclusion flag; R2 an unparsed or non-positive finish; R3 a sub-race on
the reviewed non-running name list; R4 a sub-race with at least 5% (and at least 2) finishes under 56:42; R5 a finish
under 56:42 or over 6:00:00; R6 a within-edition duplicate (same token-sorted name, finish and published sex; the copy
from the largest sub-race list is kept, then the lowest id). The rows left are record-usable. R7 then removes the Oslo
Half bib block (same-day marathon finishers listed under the half): a range rule, never a list of people.

Edition rules (an edition supplies nothing if any applies; computed on the record-usable rows before R7, the order
the reviewed lists were made in): E0 no registry row (and, from 1904 on, a partial load the producer's README names,
whether or not a registry row appears); E1 a held status (and, from 1904 on, a removed status, which must have no rows);
E2 the reviewed duplicates, overlaps and non-half distances (and, from 1904 on, virtual events); E3 count screens; E4
one-sex lists; E5 truncated top lists; E6 round-number caps without an independent count; E7 atypical fields; E8 the
same-race median screen. The rest are `use_finish`. `use_sex` keeps editions whose sex is at least 95% published with
each sex at least 3%. From 1904 on, a status in no group fails the build, and so does an edition in the producer's empty
placeholder status that holds record-usable rows. Every record-usable finish after R7 is used or removed by exactly one
edition rule (use_finish + E0 + E1 held + E2–E8 = record-usable after R7), else the build fails.

The verified scope.
- half-snapshot-20261029-1133 (stamp correction, reviewed 2026-10-30): an edition is verified only if it is `stamped` in
  that snapshot AND in the producer's corrected metadata (release half-dataset-20261029-2157, `csv-edition_meta.csv.zst`,
  which withdrew the stamps whose count came from a non-independent source); the reviewed list of the 72 withdrawn stamps
  turns those editions into unverified ones before the edition rules.
- half-dataset-20261030-1904 (reviewed 2026-10-31): the snapshot's own edition_meta carries the producer's correction, so
  an edition is verified when it is `stamped` there and the stamped set equals the reviewed list. The builder fails if
  the stamped set differs from the list or from the stamped set of the pinned 2157 reference file, if any of the 72
  stamps withdrawn on 2026-10-29 is stamped again, missing from the snapshot's never_stamp table or in another status,
  if any never_stamp edition is stamped, if never_stamp differs from the frozen 78 rows, if this release's
  csv-edition_meta.csv.zst differs from the SQLite edition_meta, or if a weaker-source stamp is not a verified usable
  edition.

Names, bibs and URLs never leave SQL: the R6 key is a digest computed in DuckDB and R7 is a boolean computed there.

    python3 -I analysis/half_quality.py --write-policy [--key KEY]   freeze REVIEWED_HALF_POLICIES[KEY] as its policy JSON
    python3 -I analysis/half_quality.py --check --half FILE [--stamp-reference FILE] [--edition-meta FILE]
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

TAG = 'pace-notes-marathon-half-20261113-1113'   # the pinned release's key (analysis/half-release.json half.key)
TAG_1904 = 'half-dataset-20261030-1904'          # the previous pin's snapshot, kept as history (its policy file is frozen)
TAG_1133 = 'half-snapshot-20261029-1133'         # the first pin's snapshot, kept as history (its policy file is frozen)

# ---------------------------------------------------------------------------------------------------------------
# Rules and thresholds shared by every reviewed entry (fixed before the editions were read; an entry that changed one
# would version it below, and the 1133 file's byte-for-byte test catches a shared change)
# ---------------------------------------------------------------------------------------------------------------

PRODUCER_EXCLUDE = ('duplicate', 'duplicate_load', 'duplicate_subset_list', 'wrong_year_copy', 'not_running',
                    'not_half_distance', 'separate_edition', 'separate_championship_list', 'trail_not_road_half',
                    'implausible_time', 'slow_outlier', 'disqualified', 'suspect_result_set')
WR_FLOOR_S = 3402        # 56:42, the men's half-marathon world record (Kiplimo, Barcelona, 16 February 2025)
SLOW_CAP_S = 21600       # 6:00:00 = 17:04 min/km, the marathon pipeline's 12-hour bound per km
SUBRACE_FAST_SHARE = 0.05
SUBRACE_FAST_MIN = 2
NAME_ANONYMOUS_RE = 'anonim|anonym|unknown|zawodnik'
R7 = {'city': 'Oslo Half', 'years': [2016, 2025], 'bib': [73000, 75999],
      'reason': 'Same-day Oslo marathon finishers listed under the half in a bib block.'}
SINGLE_SEX_EVENT_RE = (r"(?:women|woman|womens|girl|mujer|femme|filly|mother|divas|pink series|ladies|dames|frauen|damer|"
                       r"kvinn|men's half|mens half|herren)")
ROUND_CAPS = (500, 1000, 2000, 5000, 10000)
COUNT_TOLERANCE = 0.02
ONE_SEX = {'min_finishes': 50, 'min_coverage': 0.9, 'min_share': 0.03}
TRUNCATED = {'min_finishes': 200, 'max_p99_over_median': 1.20}
ATYPICAL = {'fast_share_under_s': 3900, 'fast_share': 0.03, 'fast_median_s': 4500, 'slow_median_s': 12600}
MEDIAN_SCREEN = {'min_finishes': 100, 'min_editions': 3, 'max_abs_log_ratio': 0.15}
USE_SEX = {'min_coverage': 0.95, 'min_share': 0.03, 'max_share': 0.97}
REASON_MAX = 160

# ---------------------------------------------------------------------------------------------------------------
# half-snapshot-20261029-1133 (reviewed 2026-10-29, stamp correction 2026-10-30): its own rule constants
# ---------------------------------------------------------------------------------------------------------------

# Reviewed sub-race names of other sports and assisted or combined classifications, matched on lower(race) (RE2 and
# JavaScript agree on this pattern; \b is an ASCII word boundary, so "Tordesillas" does not match).
NONRUN_SUBRACE_RE_20261029_1133 = (
    r'(rullaluistelu|patinaje|patines|\bmtb\b|sillas?\s+de\s+rueda|\bsillas?\b|wheelchair|\bwch\b|'
    r'veh[ií]culo adaptado|pmrs?-puolimaraton|jo[eë]lette|combinata|half duathlon|'
    r'discapacitad|discapacidad|capacidades (especiales|diferentes)|categor[ií]as especiales)')
STATUSES_20261029_1133 = {
    'verified': ('stamped',),
    'unverified': ('counts_internal_only', 'counts_internal_only_winner_ok', 'counts_reconciled_winner_pending'),
    'held': ('held_for_review', 'held_for_andrew_decision', 'duplicate_held_for_review'),
}
INDEPENDENT_RE_20261029_1133 = (r'independent|organiser|press|kondis|ffa federation|wikipedia|rfea|club|race report|media guide|racenerd|'
                                r'official results pdf|nyrr_api|racecast|marathon4you|uitslagen|enduhub|aggregator')
NOT_INDEPENDENT_RE_20261029_1133 = r'not independent|internal only|derived'
CATEGORY_RULE_20261029_1133 = {
    'no_edition_meta': 'E0', 'held_by_producer': 'E1', 'cross_edition_duplicate': 'E2', 'cross_edition_overlap_hold': 'E2',
    'not_half_distance': 'E2', 'count_excess_vs_independent': 'E3', 'count_shortfall_vs_independent': 'E3',
    'rows_short_of_source_list': 'E3', 'one_sex_list': 'E4', 'truncated_top_list': 'E5', 'round_count_cap': 'E6',
    'atypical_fast_field': 'E7', 'atypical_slow_field': 'E7', 'series_median_shift': 'E8',
}
# The reviewed E2 decisions (audit 2026-10-29, understand/half-audit.md 1.7), by registry id or by city and year.
REVIEWED_E2_20261029_1133 = (
    (6690, 'cross_edition_duplicate', "Same 564 results (names and times) as Celina, OH: Grand Lake Half Marathon 5k/Kid's Run 2015 (id 2860), loaded from a second RunSignup race id."),
    (3707, 'cross_edition_duplicate', 'Same results as Valparaiso, IN: Valparaiso Half Marathon 2014 (id 3559): 365 of 365 finish times and 359 names shared, same race date.'),
    (7854, 'cross_edition_duplicate', 'All 318 rows repeat names and times from Southport 2016 (id 7860, 1,154 rows): a subset list of the same race.'),
    (7508, 'cross_edition_duplicate', 'Identical 81 results to Coupeville, WA: Race the Reserve Whidbey Island 2019 (id 7482), second RunSignup race id.'),
    (7509, 'cross_edition_duplicate', 'Identical 86 results to Coupeville, WA: Race the Reserve Whidbey Island 2018 (id 7483), second RunSignup race id.'),
    (3666, 'cross_edition_duplicate', 'Same 376 runners and race date as South Hero, VT: Champlain Islands Marathon & Half Marathon 2015 (id 687); times differ by a few seconds (a second timing basis).'),
    (6740, 'cross_edition_overlap_hold', 'Run Holden Beach 2017 shares 193 identical finish times and 314 of 372 names with Run Ocean Isle Beach 2017, a race three weeks later: one list contains rows of the other.'),
    (7012, 'cross_edition_overlap_hold', 'Run Ocean Isle Beach 2017 shares 193 identical finish times and 314 names with Run Holden Beach 2017 (see id 6740).'),
)
REVIEWED_E2_BY_KEY_20261029_1133 = (
    ('Brunico: 3/4 Mezza Maratona', 2013, 'not_half_distance', 'The race is a three-quarter half marathon (about 15.8 km), not a half marathon.'),
)
DATE_SUSPECTS_20261029_1133 = (
    (8712, 'Gdańsk', 2026, 'Dated 2026-09-27, the Warsaw marathon date; 126 linked people finished both.'),
    (7565, 'Ribera', 2019, 'Ribera 2019 and Gela 2019 are both dated 2019-12-01; 209 linked people finished both with different times.'),
    (7677, 'Gela', 2019, 'Ribera 2019 and Gela 2019 are both dated 2019-12-01; 209 linked people finished both with different times.'),
)
# Same city, same year (women.json): half city labels for each marathon city (frozen with the policy).
SAME_CITY_LABELS_20261029_1133 = {
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

# The flagship battery's verified-half members and leave-outs (analysis/half_linked.py), pre-registered 2026-10-30 at
# 20:33 UTC by the post-correction decision, before the next half release existed, and stated here in words so a recount
# follows them without reading the code. Each policy entry names its own off-road labels and weaker-source stamps.
LEAVE_OUTS_RULE = ('for verified_halves and for verified_federation, one variant per verified half edition with a pair in the '
                   'member, that edition left out; every variant must pass each clause its member must pass (its median '
                   'multiple within [2.15, 2.25]; that multiple at the pooled median half within 180 s of the pooled minutes '
                   'over double; under double under 15%; for verified_halves also its own minutes over double within 180 s '
                   'of the pooled), with no minimum edition size and no exemption; a variant under 100 pairs cannot pass')
BATTERY_RULES_20261029_1133 = {
    'verified_federation': 'the verified halves without the weaker-source stamps (stamp_correction.weaker_source, by edition id)',
    'verified_road': 'the verified halves whose edition label is not one of off_road_labels',
    'leave_outs': LEAVE_OUTS_RULE,
}
BATTERY_RULES = BATTERY_RULES_20261029_1133   # compatibility name (half_linked.py cites it)

# ---------------------------------------------------------------------------------------------------------------
# half-dataset-20261030-1904 (reviewed 2026-10-31): the rules it changes, versioned; the rest are the shared ones
# ---------------------------------------------------------------------------------------------------------------

NONRUN_SUBRACE_RE_20261030_1904 = NONRUN_SUBRACE_RE_20261029_1133   # unchanged: R3 matches the same 54 sub-races
# The producer's own status vocabulary in this snapshot. `duplicate_deleted` (the producer deleted a double load) maps to
# E1 and must hold no rows; `no_rows` is the producer's placeholder for an edition with nothing loaded. A status in no
# group fails the build.
STATUSES_20261030_1904 = {
    'verified': ('stamped',),
    'unverified': ('counts_internal_only', 'counts_internal_only_winner_ok', 'counts_reconciled_winner_pending'),
    'held': ('held_for_review', 'held_for_andrew_decision', 'duplicate_held_for_review'),
    'removed': ('duplicate_deleted',),
    'empty': ('no_rows',),
}
# nyrr_api is dropped: the producer labels nyrr_api_totalItems a platform-internal count (edition 8749's source text).
INDEPENDENT_RE_20261030_1904 = (r'independent|organiser|press|kondis|ffa federation|wikipedia|rfea|club|race report|media guide|racenerd|'
                                r'official results pdf|racecast|marathon4you|uitslagen|enduhub|aggregator')
NOT_INDEPENDENT_RE_20261030_1904 = NOT_INDEPENDENT_RE_20261029_1133
CATEGORY_RULE_20261030_1904 = {**CATEGORY_RULE_20261029_1133, 'partial_load': 'E0', 'removed_by_producer': 'E1',
                               'virtual_event': 'E2'}
SAME_CITY_LABELS_20261030_1904 = SAME_CITY_LABELS_20261029_1133   # unchanged (New York 2019 now enters the all-usable check)
DATE_SUSPECTS_20261030_1904 = DATE_SUSPECTS_20261029_1133         # the same three, ids and dates unchanged in 1904
# A virtual race is self-timed efforts, not a race field (review R10, 2026-10-31): the edition's label contains `virtual`
# or `virtuel` (any case), or its place (the label before the first colon) is a placeholder that starts with
# `Anywhere`. The reviewed not-virtual exceptions are frozen in half_policy_lists.py.
VIRTUAL_RULE_20261030_1904 = {
    'label_pattern': 'virtual|virtuel',
    'placeholder_place_pattern': '^anywhere\\b',
    'applies_to': ("the edition label (edition_meta.city, as race_records writes it), lowercased; the place is the label "
                   "before its first ':' with surrounding spaces trimmed"),
    'order': 'after the reviewed E2 decisions and before E3, on editions no earlier rule removes',
}
# The count each edition screen compares, and E3's three conditions, in words (verify round 2, October 31, 2026: the policy
# said every screen ran on record-usable rows before R7 and held only E3's patterns and tolerance, so a recount from the
# text flagged 103 E3 editions, not 5, and one more E6 cap; the screens themselves are main's, unchanged, and every count
# stays equal). R6's no-key clause states what the builder and the Node recount already did with a name that has no
# a-z or 0-9 character left. Written for the 1904 entry only, so the 1133 policy bytes stay as frozen (review R9).
POLICY_WORDS_20261030_1904 = {
    'computed_on': (
        "named per screen. n_db is every race_records row of the edition's city and year, whatever record rule removes it "
        "(all rows loaded); n_usable is the edition's record-usable rows before R7 (rows no record rule R1–R6 removes, R7 "
        "not applied), and the edition's median, 99th percentile, share under 1:05 and recorded-sex counts are over those "
        "rows. E3 count_excess_vs_independent, E3 rows_short_of_source_list and E6 compare n_db; E3 "
        "count_shortfall_vs_independent, E4, E5, E7 and E8 use n_usable"),
    'E3': {
        'independent': ('official_source_type, lowercased (a null as empty), matches independent_pattern and does not '
                        'match not_independent_pattern'),
        'count_excess_vs_independent': ("the source is independent, the edition's status group is not verified, "
                                        'official_finishers is present, and n_db > (1 + tolerance) × official_finishers'),
        'count_shortfall_vs_independent': ("the source is independent, the edition's status group is not verified, "
                                           'official_finishers is present, and n_usable < (1 - tolerance) × official_finishers'),
        'rows_short_of_source_list': ('the source is not independent (any status group), official_finishers is present '
                                      'and above 0, and n_db < (1 - tolerance) × official_finishers'),
        'order': 'the first of the three that applies, in this order; every inequality is strict',
    },
    'E6': "the edition's status group is not verified and n_db equals one of caps exactly",
    'R6_no_key': ('a name with no a-z or 0-9 character left after this normalisation has no key and is never compared, so '
                  'it is never an R6 duplicate'),
}
BATTERY_RULES_20261030_1904 = {
    'verified_federation': 'the verified halves without the weaker-source stamps (stamps.weaker_source, by edition id)',
    'verified_road': 'the verified halves whose edition label is not one of off_road_labels',
    'leave_outs': LEAVE_OUTS_RULE,
}
STAMP_RULE_20261030_1904 = {
    'rule': "verified = stamped in this snapshot's own edition_meta, equal to the policy's reviewed list",
    'reviewed': '2026-10-31',
    'reads': {
        'stamped': "this snapshot's SQLite edition_meta.completeness_status = 'stamped' (edition ids), equal to `stamped`",
        'reference': ("completeness_status of the reference file (stamps.reference: release half-dataset-20261029-2157, "
                      "csv-edition_meta.csv.zst, sha256 pinned): its stamped ids equal this snapshot's, each with this "
                      "snapshot's city and year"),
        'withdrawn': ("for each row of stamps.reference.withdrawn (the 72 stamps withdrawn on 2026-10-29, frozen from the 2157 "
                      "file): this snapshot's edition_meta city, year and completeness_status (equal to corrected_status, "
                      "never stamped) and the edition id in this snapshot's never_stamp table; the frozen reasons are the "
                      "2157 file's clauses and are not reread from this snapshot"),
        'never_stamp': ("this snapshot's never_stamp table (edition_id, reason, added_at) verbatim, equal to `never_stamp`; "
                        "no never_stamp edition is stamped"),
        'edition_meta_csv': ("this release's csv-edition_meta.csv.zst (sha256 pinned) against the SQLite edition_meta: the same "
                             "ids, and for each id city, year, completeness_status, completeness_reason and "
                             "official_source_type exactly"),
        'weaker_source': ("official_source_type of each weaker-source stamp in this snapshot's SQLite edition_meta, under the "
                          "reason rule's length cut, equal to `source`; each stamp a verified usable edition"),
    },
    'reason_rule': CORRECTION_20261029_2157['reason_rule'],
    'weaker_source_rule': (
        "the stamps the release's README names as resting on an organiser or local-press count rather than a federation "
        "count (the same six names as the README of half-dataset-20261029-2157: Cracovia 2022, Kraków (Cracovia) 2025, "
        "Szczecin 2023, Szczecin 2026, Piła 2026 and Lisbon 2024), each name taken as every stamped edition in that city and "
        "year: 'Lisbon 2024' denotes two, the EDP Lisbon Half (edition 275) and the Meia Maratona dos Descobrimentos in "
        "Lisbon's Belém district (edition 8823, its 2015, 2018 and 2025 editions labelled Lisboa), whose own source text "
        "reads 'labelled weaker press'; every other name denotes one. They stay verified; `source` is official_source_type "
        "under the reason rule's length cut. Reviewed 2026-10-31 on the release's README and edition_meta, before any 1904 "
        "figure was built; the producer is asked to confirm"),
}

from half_policy_lists import (  # noqa: E402  (the reviewed lists, kept apart for length)
    FROZEN_20261029_1133, FROZEN_20261030_1904, KNOWN_PARTIAL_LOADS_20261030_1904, LABEL_COUNTRIES_20261029_1133,
    LABEL_COUNTRIES_20261030_1904, LINK_EDITIONS_20261030_1904, NEVER_STAMP_20261030_1904, NOT_VIRTUAL_20261030_1904,
    OFF_ROAD_LABELS_20261029_1133, OFF_ROAD_LABELS_20261030_1904, REVIEWED_E2_ADDED_20261030_1904, STAMPED_20261030_1904,
    WEAKER_SOURCE_20261029_2157, WEAKER_SOURCE_20261030_1904, WITHDRAWN_STAMPS_20261029_2157)

REVIEWED_E2_20261030_1904 = REVIEWED_E2_20261029_1133 + tuple(REVIEWED_E2_ADDED_20261030_1904)
REVIEWED_E2_BY_KEY_20261030_1904 = REVIEWED_E2_BY_KEY_20261029_1133

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
    TAG_1133: {
        'file': 'analysis/half-policy-20261029-1133.json',
        'schema_version': 1,
        'reviewed': '2026-10-29',
        'corrected': '2026-10-30',
        'expected': EXPECTED_20261029_1133,
        'frozen': FROZEN_20261029_1133,
        'label_countries': LABEL_COUNTRIES_20261029_1133,
        'correction': {**CORRECTION_20261029_2157, 'withdrawn': WITHDRAWN_STAMPS_20261029_2157,
                       'weaker_source': WEAKER_SOURCE_20261029_2157},
        'battery': {'reviewed': '2026-10-30', 'off_road_labels': OFF_ROAD_LABELS_20261029_1133},
        'rules': {
            'nonrun_subrace_re': NONRUN_SUBRACE_RE_20261029_1133, 'statuses': STATUSES_20261029_1133,
            'independent_re': INDEPENDENT_RE_20261029_1133, 'not_independent_re': NOT_INDEPENDENT_RE_20261029_1133,
            'category_rule': CATEGORY_RULE_20261029_1133, 'reviewed_e2': REVIEWED_E2_20261029_1133,
            'reviewed_e2_by_key': REVIEWED_E2_BY_KEY_20261029_1133, 'date_suspects': DATE_SUSPECTS_20261029_1133,
            'same_city_labels': SAME_CITY_LABELS_20261029_1133, 'battery_rules': BATTERY_RULES_20261029_1133,
            'unknown_status': None, 'partial_loads': (), 'virtual': None, 'not_virtual': (), 'policy_words': None,
        },
    },
}

# Reviewed 2026-10-31 from the real run of this entry against the 1904 snapshot, after every list entry was read against
# its written rule (docs/HALF_MARATHON.md). Against 1133 with the 2157 correction: 810,397 more rows; verified editions
# are 1133's 238 plus Belém 2024 (238 -> 239, 753,476 -> 757,985 finishes); E0 holds the producer's four partial NYRR
# loads and three editions without a registry row (2 -> 7); E1 gains the RunSignup trail and eco holds of 2157 (614 ->
# 1,518 held) and the producer's 13 deleted double loads (no rows); E2-E8 gain 35 duplicate loads and copies, 8 virtual
# events and 9 screen entries, and lose the 6 editions now held (66 -> 116). `stamp_withdrawn` (the 1133 overlay) is
# replaced by `stamp_check`.
EXPECTED_20261030_1904 = {
    'raw': 7_665_217, 'R1': 99_056, 'R2': 0, 'R3': 1_395, 'R4': 1_180, 'R5_fast': 157, 'R5_slow': 451, 'R6': 3_292,
    'record_usable': 7_559_686, 'R7': 606, 'record_usable_after_R7': 7_559_080,
    'E0_editions': 7, 'E0_finishes': 18_576, 'E1_held_editions': 1_518, 'E1_held_finishes': 744_406, 'E1_removed_editions': 13,
    'E2_E8_editions': 116, 'E2_E8_finishes': 173_476,
    'use_finish': {'finishes': 6_622_622, 'editions': 8_200},
    'verified': {'finishes': 757_985, 'editions': 239},
    'verified_use_sex': {'finishes': 738_809, 'editions': 232},
    'undated': {'finishes': 845_780, 'editions': 262},
    'stamp_check': {'stamped': 243, 'verified_usable': 239, 'withdrawn_unstamped': 72, 'never_stamp': 78},
}

REVIEWED_HALF_POLICIES[TAG_1904] = {
    'file': 'analysis/half-policy-20261030-1904.json',
    'schema_version': 2,
    'reviewed': '2026-10-31',
    'expected': EXPECTED_20261030_1904,
    'frozen': FROZEN_20261030_1904,
    'label_countries': LABEL_COUNTRIES_20261030_1904,
    'stamps': {
        **STAMP_RULE_20261030_1904,
        'stamped': list(STAMPED_20261030_1904),
        'never_stamp': [{'edition_id': e, 'reason': r, 'added_at': a} for e, r, a in NEVER_STAMP_20261030_1904],
        'reference': {**{k: CORRECTION_20261029_2157[k] for k in ('repository', 'tag', 'asset', 'sha256', 'readme_sha256')},
                      'withdrawn': WITHDRAWN_STAMPS_20261029_2157, 'weaker_source': WEAKER_SOURCE_20261029_2157},
        'edition_meta_csv': {'asset': 'csv-edition_meta.csv.zst',
                             'sha256': 'a0f48f1501fe1a17a669c98f0e497d16a7e52722b61c7dad3936e056724a9abe'},
        'weaker_source': WEAKER_SOURCE_20261030_1904,
    },
    'battery': {'reviewed': '2026-10-31', 'off_road_labels': OFF_ROAD_LABELS_20261030_1904},
    'link_editions': LINK_EDITIONS_20261030_1904,
    'rules': {
        'nonrun_subrace_re': NONRUN_SUBRACE_RE_20261030_1904, 'statuses': STATUSES_20261030_1904,
        'independent_re': INDEPENDENT_RE_20261030_1904, 'not_independent_re': NOT_INDEPENDENT_RE_20261030_1904,
        'category_rule': CATEGORY_RULE_20261030_1904, 'reviewed_e2': REVIEWED_E2_20261030_1904,
        'reviewed_e2_by_key': REVIEWED_E2_BY_KEY_20261030_1904, 'date_suspects': DATE_SUSPECTS_20261030_1904,
        'same_city_labels': SAME_CITY_LABELS_20261030_1904, 'battery_rules': BATTERY_RULES_20261030_1904,
        'unknown_status': 'fail', 'partial_loads': tuple(KNOWN_PARTIAL_LOADS_20261030_1904),
        'virtual': VIRTUAL_RULE_20261030_1904, 'not_virtual': tuple(NOT_VIRTUAL_20261030_1904),
        'policy_words': POLICY_WORDS_20261030_1904,
    },
}

# ---------------------------------------------------------------------------------------------------------------
# pace-notes-marathon-half-20261113-1113 (the combined release). Its rules were recorded on 2026-11-14 before any build
# (docs/HALF_MARATHON.md, "The combined release: rules recorded before any build"): the 1904 rules translated like for
# like, with the lead's decisions D6, D23, D24 and D28 of the adoption plan. What changes, each versioned here:
# - statuses are the release's tiers (EDITION-TIERS.csv); a partial tier is E0;
# - R8, applied after R1: the rows the pipeline's frozen half row rule leaves out (adapt_combined.HALF_ROW_RULE);
# - the sex a rule reads is the published sex, else the published category's (the view h.race_records, half_source.py);
# - "every row loaded" (E3, E6) counts the release's listed row exclusions as well as the rows in CORE;
# - a reviewed duplicate or overlap decision applies only while the twin it names still has rows;
# - gun-time editions must be held; course-suspected-short editions supply nothing; neither is an E8 reference;
# - the tier check replaces the stamp check; there are no partial loads by name and no link editions.
# ---------------------------------------------------------------------------------------------------------------

from half_policy_lists import (  # noqa: E402
    COURSE_SUSPECT_20261113_1113, DATE_SUSPECT_DATES_20261113_1113, GROSS_TIMING_20261113_1113, LABEL_COUNTRIES_20261113_1113,
    NEVER_STAMP_20261113_1113, NOT_VIRTUAL_20261113_1113, OFF_ROAD_LABELS_20261113_1113, REVIEWED_E2_TWINS_20261113_1113,
    STAMPED_20261113_1113, WEAKER_SOURCE_20261113_1113)
import half_policy_lists as _lists  # noqa: E402

STATUSES_20261113_1113 = {
    'verified': ('stamped', 'stamped_weaker_source'),
    'unverified': ('unverified',),
    'held': ('held_for_review',),
    'partial': ('partial',),
    'removed': ('excluded',),
    'empty': ('no_rows',),
}
CATEGORY_RULE_20261113_1113 = {
    'no_edition_meta': 'E0', 'partial_tier': 'E0', 'held_by_producer': 'E1', 'removed_by_producer': 'E1',
    'cross_edition_duplicate': 'E2', 'cross_edition_overlap_hold': 'E2', 'not_half_distance': 'E2', 'virtual_event': 'E2',
    'course_suspected_short': 'E2',
    'count_excess_vs_independent': 'E3', 'count_shortfall_vs_independent': 'E3', 'rows_short_of_source_list': 'E3',
    'one_sex_list': 'E4', 'truncated_top_list': 'E5', 'round_count_cap': 'E6', 'atypical_fast_field': 'E7',
    'atypical_slow_field': 'E7', 'series_median_shift': 'E8',
}
# The three date suspects, carried by edition id and year with the label each id carries in this release (Ribera's and
# Gela's labels were renamed since 1904) and the date each reason names (DATE_SUSPECT_DATES_20261113_1113).
DATE_SUSPECTS_20261113_1113 = (
    (8712, 'Gdańsk', 2026, 'Dated 2026-09-27, the date of the Warsaw marathon; carried from the reviews of the 1133 and 1904 snapshots, the date unchanged in this release.'),
    (7565, 'Ribera: Half Marathon Arancia di Ribera D.O.P.', 2019, 'Ribera 2019 and Gela 2019 are both dated 2019-12-01 and linked people finished both with different times; carried from the reviews of the 1133 and 1904 snapshots, the date unchanged in this release.'),
    (7677, 'Gela: Maratonina del Golfo', 2019, 'Ribera 2019 and Gela 2019 are both dated 2019-12-01 and linked people finished both with different times; carried from the reviews of the 1133 and 1904 snapshots, the date unchanged in this release.'),
)
POLICY_WORDS_20261113_1113 = {
    **POLICY_WORDS_20261030_1904,
    'computed_on': (
        "named per screen. n_db is every row loaded for the edition's city and year: its race_records rows of the half "
        "database, whatever record rule removes them, plus its rows in RELEASE-ROW-EXCLUSIONS.parquet (the release removes rows "
        "the earlier snapshots still held); an edition with no row in race_records has n_db 0. n_usable is the edition's "
        "record-usable rows before R7 (rows no record rule R1, R8, R2–R6 removes, R7 not applied), and the edition's median, "
        "99th percentile, share under 1:05 and recorded-sex counts are over those rows. E3 count_excess_vs_independent, E3 "
        "rows_short_of_source_list and E6 compare n_db; E3 count_shortfall_vs_independent, E4, E5, E7 and E8 use n_usable"),
}
TIER_RULE_20261113_1113 = {
    'rule': ("verified = tier stamped or stamped_weaker_source in the release's EDITION-TIERS.csv, equal to the policy's reviewed "
             "list, never an edition of the frozen never-stamp list"),
    'reviewed': '2026-11-14',
    'source': ("EDITION-TIERS.csv (verification_tier, weaker_source, split_tier), joined on source_db = half, city and year: the "
               "complete tier table. The registry row of an edition (edition id, race date, official count and source type, "
               "timing basis) is edition_meta.parquet's; where both name an edition their tiers must be equal"),
    'reads': {
        'stamped': 'the edition ids whose tier is stamped or stamped_weaker_source, equal to `stamped`',
        'never_stamp': ("each row of `never_stamp` (the 1904 snapshot's never_stamp table, carried verbatim with the year and "
                        "label its edition id carries in this release): the edition with that id must exist with that year and "
                        "must not carry a badge tier; a changed label is reported, not failed"),
        'weaker_source': ("the edition ids whose tier is stamped_weaker_source, equal to `weaker_source`, each with its city, "
                          "year and official_source_type under the reason rule's length cut; after the edition rules each is a "
                          "verified usable edition"),
        'gross_timing': ("the editions whose edition_meta.timing_basis, lowercased, starts with gross: equal to `gross_timing`, "
                         "and each held (lead decision D6)"),
        'course_suspected_short': ("the editions whose every row of the half database carries course_shortened_suspect in the "
                                   "person-links file: equal to `course_suspected_short`; an edition flagged on some rows only "
                                   "fails (lead decision D24, item 10)"),
        'removed_and_empty': 'an edition whose tier is excluded, or whose registry tier is no_rows, holds no row in race_records',
    },
    'reason_rule': CORRECTION_20261029_2157['reason_rule'],
}
BATTERY_RULES_20261113_1113 = {
    'verified_federation': 'the verified halves without the weaker-source stamps (tiers.weaker_source, by edition id)',
    'verified_road': 'the verified halves whose edition label is not one of off_road_labels',
    'leave_outs': LEAVE_OUTS_RULE,
}
# The reviewed counts and the frozen computed lists: set from the real run on the final inputs, after each list entry is
# read against its rule and each difference from the plan's measurements is read. None until then: a build refuses.
EXPECTED_20261113_1113 = getattr(_lists, 'EXPECTED_20261113_1113', None)
FROZEN_20261113_1113 = getattr(_lists, 'FROZEN_20261113_1113', None)


def _half_row_rule():
    import half_source
    return half_source.row_rule()


REVIEWED_HALF_POLICIES[TAG] = {
    'file': 'analysis/half-policy-20261113-1113.json',
    'schema_version': 3,
    'reviewed': '2026-11-14',
    'expected': EXPECTED_20261113_1113,
    'frozen': FROZEN_20261113_1113,
    'label_countries': LABEL_COUNTRIES_20261113_1113,
    'tiers': {
        **TIER_RULE_20261113_1113,
        'stamped': list(STAMPED_20261113_1113),
        'never_stamp': [{'edition_id': e, 'year': y, 'city': c, 'reason': r, 'added_at': a} for e, y, c, r, a in NEVER_STAMP_20261113_1113],
        'never_stamp_from': {**{k: CORRECTION_20261029_2157[k] for k in ('repository', 'tag', 'asset', 'sha256')},
                             'table': "the never_stamp table of half-dataset-20261030-1904 (analysis/half-policy-20261030-1904.json stamps.never_stamp)"},
        'weaker_source': WEAKER_SOURCE_20261113_1113,
        'gross_timing': [{'edition_id': e, 'city': c, 'year': y} for e, c, y in GROSS_TIMING_20261113_1113],
        'course_suspected_short': [{'edition_id': e, 'city': c, 'year': y} for e, c, y in COURSE_SUSPECT_20261113_1113],
    },
    'battery': {'reviewed': '2026-11-14', 'off_road_labels': OFF_ROAD_LABELS_20261113_1113},
    'rules': {
        'nonrun_subrace_re': NONRUN_SUBRACE_RE_20261030_1904, 'statuses': STATUSES_20261113_1113,
        'independent_re': INDEPENDENT_RE_20261030_1904, 'not_independent_re': NOT_INDEPENDENT_RE_20261030_1904,
        'category_rule': CATEGORY_RULE_20261113_1113, 'reviewed_e2': REVIEWED_E2_20261030_1904,
        'reviewed_e2_twins': REVIEWED_E2_TWINS_20261113_1113,
        'reviewed_e2_by_key': REVIEWED_E2_BY_KEY_20261030_1904, 'date_suspects': DATE_SUSPECTS_20261113_1113,
        'date_suspect_dates': DATE_SUSPECT_DATES_20261113_1113,
        'same_city_labels': SAME_CITY_LABELS_20261030_1904, 'battery_rules': BATTERY_RULES_20261113_1113,
        'unknown_status': 'fail', 'partial_loads': (), 'virtual': VIRTUAL_RULE_20261030_1904,
        'not_virtual': tuple(NOT_VIRTUAL_20261113_1113), 'policy_words': POLICY_WORDS_20261113_1113,
        'tiers': True, 'row_rule': _half_row_rule,
    },
}

# Compatibility names for the pinned entry (the builders read them; every rule they name is the pinned entry's).
SAME_CITY_LABELS = REVIEWED_HALF_POLICIES[TAG]['rules']['same_city_labels']


def entry(tag: str = TAG) -> dict:
    if tag not in REVIEWED_HALF_POLICIES:
        fail(f'no reviewed half policy for {tag}')
    return REVIEWED_HALF_POLICIES[tag]


def rules_of(tag: str = TAG) -> dict:
    return entry(tag)['rules']


def _edition_rules_doc(p: dict) -> dict:
    """The edition-rule block of the policy JSON (E3–E8 thresholds and the reviewed list), the entry's own patterns."""
    rules, frozen = p['rules'], p['frozen']
    doc = {
        'order': ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'],
        'edition': 'city and year; registry rows from edition_meta joined on city and year',
        'computed_on': 'record-usable rows before R7',
        'E3': {'independent_pattern': rules['independent_re'], 'not_independent_pattern': rules['not_independent_re'],
               'tolerance': COUNT_TOLERANCE},
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
        'categories': rules['category_rule'],
        'editions': frozen['editions'],
    }
    if rules['partial_loads']:
        doc['E0'] = {
            'rule': ('a city and year with records but no registry row; and, first, every partial load the producer\'s README '
                     'names (keyed by city and year), whether or not a registry row appears: it supplies nothing'),
            'partial_loads': [{'city': c, 'year': y, 'reason': r} for c, y, r in rules['partial_loads']],
        }
    if 'removed' in rules['statuses']:
        doc['E1'] = {'rule': ('a held status supplies nothing; a removed status (the producer deleted the rows of a double '
                              'load) supplies nothing and must hold no rows, else the build fails'),
                     'held': list(rules['statuses']['held']), 'removed': list(rules['statuses']['removed'])}
    words = rules['policy_words']
    if words:
        doc['computed_on'] = words['computed_on']
        doc['E3'] = {**doc['E3'], 'conditions': words['E3']}
        doc['E6'] = {**doc['E6'], 'condition': words['E6']}
    if rules['virtual']:
        doc['E2'] = {'virtual_event': {**rules['virtual'], 'not_virtual': [{'edition_id': e, 'reason': r} for e, r in rules['not_virtual']],
                                       'reason': 'A virtual race: self-timed efforts, not a race field.'}}
    return doc


def half_records_block(p: dict) -> dict:
    """Which half rows never count or show, and which editions are listed but never compared: the one statement of the
    half record rule, in the shape the runner lookup's builder reads (its analysis/lookup-half-records.json). The flag
    lists are the pipeline's frozen HALF_ROW_RULE, imported, never typed here."""
    rule = p['rules']['row_rule']()
    return {
        'scope': 'every row of race_records with distance = half, from either source database',
        'left_out': {
            'words': ('A half row never counts and never shows when it carries one of these pending-review flags (present in '
                      'CORE) or one of these row-quality flags, unless the flag is one of kept_when_edition_wide and every row of '
                      'its edition carries it, or when its finish does not read as a time greater than zero. Nothing else about '
                      'such a row is written anywhere: no label, no count by person.'),
            'source': 'HALF_ROW_RULE of analysis/adapt_combined.py (lead decision D28 of the adoption plan, 2026-11-14)',
            'pending_review_flags': list(rule['pending_review_flags']), 'qa_row_flags': list(rule['qa_row_flags']),
            'kept_when_edition_wide': list(rule.get('kept_when_edition_wide', ())),
            'finish_not_a_positive_time': True,
        },
        'no_comparison': {
            'words': ("These editions are listed with their results and marked; a marked edition's results are never compared with "
                      'other years or races and never enter a best, a ranking, an average or any half figure. Editions are [source '
                      'database, release key, year].'),
            'gun_times': {'code': 1, 'rule': ('the release\'s edition_meta.timing_basis starts with "gross" (lead decision D6; the build '
                                              'stops unless that set equals this list and each is held)'),
                          'editions': [['half', x['city'], x['year']] for x in p['tiers']['gross_timing']]},
            'course_suspected_short': {'code': 2, 'rule': ('every row of the edition carries course_shortened_suspect in the person-links '
                                                           'file (lead decision D24, item 10; the build stops unless the flagged editions '
                                                           'equal this list and are flagged in full)'),
                                       'editions': [['half', x['city'], x['year']] for x in p['tiers']['course_suspected_short']]},
        },
    }


def _policy_document_3(p: dict, tag: str) -> dict:
    """The policy JSON of the combined release (schema 3): the rules in the words of docs/HALF_MARATHON.md, R0 to R3."""
    rules, frozen = p['rules'], p['frozen']
    row_rule = rules['row_rule']()
    edition = _edition_rules_doc(p)
    edition['edition'] = ('city and year within the half database (source_db = half); the tier from EDITION-TIERS.csv, the registry '
                          'row from edition_meta.parquet, both joined on city and year')
    edition['E0'] = {'rule': ('a city and year with records but no registry row (no edition_meta.parquet row), or tier partial: it '
                              'supplies nothing')}
    edition['E1'] = {'rule': ('a held tier supplies nothing; a removed tier (the release excluded the whole edition) supplies nothing '
                              'and must hold no rows, else the build fails'),
                     'held': list(rules['statuses']['held']), 'removed': list(rules['statuses']['removed'])}
    edition['E2'] = {
        **edition['E2'],
        'twin_rule': ('a reviewed duplicate or overlap decision (by edition id) applies only while the twin its reason names, by '
                      'edition id in `twins`, still has rows in race_records; where the release kept only the listed copy, that copy '
                      'is the only one and is usable. A decision whose own edition has no rows is moot'),
        'twins': {str(e): t for e, t in sorted(rules['reviewed_e2_twins'].items())},
        'decisions': [{'edition_id': e, 'category': c, 'reason': r} for e, c, r in rules['reviewed_e2']],
        'decisions_by_key': [{'city': c, 'year': y, 'category': k, 'reason': r} for c, y, k, r in rules['reviewed_e2_by_key']],
        'course_suspected_short': ('an edition on tiers.course_suspected_short supplies nothing to any figure, after the reviewed '
                                   'decisions and before the virtual-event rule'),
        'order': 'reviewed decisions by edition id, then by city and year, then course suspected short, then virtual events',
    }
    edition['E8'] = {**edition['E8'], 'reference': (
        "the median of the edition medians of the label's other editions with at least 100 record-usable finishes (counted "
        'before R7) and a verified, unverified or held status, held (E1) editions and editions an earlier rule removes '
        'included, except that an edition on tiers.gross_timing or tiers.course_suspected_short is never a reference edition; '
        'the label needs at least 3 editions, the reference editions and the edition itself counted, and the screen applies '
        'only to editions no earlier rule removes')}
    doc = {
        'schema_version': p['schema_version'],
        'tag': tag,
        'reviewed': p['reviewed'],
        'scope': ('the half rows of the half database: race_records rows with distance = half and source_db = half; a record is '
                  '(source_db, id), an edition (source_db, city, year). The half rows of the marathon database (source_db = full) '
                  'supply nothing to any figure'),
        'sex': ('a record\'s sex is its published sex; when that is blank (null, or empty after trimming), '
                'qa_row_flags.sex_from_category; the recorded sex is that value when it is M or F; never inferred from a name. '
                'Every rule and figure that reads sex reads this value'),
        'record_rules': {
            'order': ['R1', 'R8', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'],
            'R1': {'flags': list(PRODUCER_EXCLUDE), 'never_alone': ['time_hour_reconstructed']},
            'R8': {'rule': ('a row the pipeline\'s frozen half row rule leaves out: it carries one of pending_review_flags (present in '
                            'CORE) or one of qa_row_flags, unless that flag is one of kept_when_edition_wide and every race_records row '
                            'of its edition carries it'),
                   'source': 'HALF_ROW_RULE of analysis/adapt_combined.py (lead decision D28 of the adoption plan, 2026-11-14)',
                   'pending_review_flags': list(row_rule['pending_review_flags']), 'qa_row_flags': list(row_rule['qa_row_flags']),
                   'kept_when_edition_wide': list(row_rule.get('kept_when_edition_wide', ())),
                   'identity': ('every half row the identity file marks left_out must be removed by these record rules, else the '
                                'build fails')},
            'R2': {'column': 'split_21_1km', 'pattern': '^[0-9]+:[0-9]{2}:[0-9]{2}$', 'min_s_exclusive': 0},
            'R3': {'pattern': rules['nonrun_subrace_re'], 'applies_to': 'lower(race), on rows passing R1, R8 and R2', 'subraces': frozen['R3']},
            'R4': {'floor_s': WR_FLOOR_S, 'min_share': SUBRACE_FAST_SHARE, 'min_count': SUBRACE_FAST_MIN,
                   'applies_to': 'sub-races (city, year, race) counted on rows passing R1, R8 and R2', 'subraces': frozen['R4']},
            'R5': {'min_s': WR_FLOOR_S, 'max_s': SLOW_CAP_S},
            'R6': {'key': ('city, year, md5 of the name lowercased with accents stripped, commas and every character '
                           'outside a-z0-9 and space made spaces, split on spaces, empty tokens dropped, tokens sorted and '
                           'joined by one space; finish; sex as the sex rule gives it (null as ?)'),
                   'name_required': 'trim(name) longer than 3 characters and not matching the anonymous pattern',
                   'anonymous_pattern': NAME_ANONYMOUS_RE,
                   'keep': 'the copy from the largest sub-race list (R3 and R4 counts), then the lowest record id',
                   'no_key': rules['policy_words']['R6_no_key']},
            'R7': {**R7, 'applies_to': 'record-usable rows', 'bib_rule': 'try_cast(bib AS INTEGER) in the range, inclusive'},
        },
        'half_records': half_records_block(p),
        'statuses': {g: list(v) for g, v in rules['statuses'].items()},
        'edition_rules': edition,
        'tiers': p['tiers'],
        'use_sex': USE_SEX,
        'date_suspects': [{'edition_id': e, 'city': c, 'year': y, 'date': rules['date_suspect_dates'][e], 'reason': r}
                          for e, c, y, r in rules['date_suspects']],
        'date_suspect_rule': ('carried by edition id and year; each must still carry `date` as its race date, else the build fails for '
                              'review; a changed label is reported'),
        'same_city_labels': rules['same_city_labels'],
        'same_city_rule': "half labels for each marathon city; a marathon city is the marathon race's registry label",
        'verified_label_countries': p['label_countries'],
        'battery': {**rules['battery_rules'], **p['battery']},
        'expected': p['expected'],
        'unknown_status': 'a tier in none of the status groups fails the build, and so does an edition with rows and no row in EDITION-TIERS.csv',
        'empty_status': ("an edition whose registry tier is in the empty group (the producer's placeholder for an edition with nothing "
                         'loaded) must hold no rows, else the build fails'),
    }
    return doc


def policy_document(tag: str = TAG) -> dict:
    """The frozen policy JSON: every rule, threshold, reviewed list and expected count the recount needs."""
    p = entry(tag)
    rules, frozen = p['rules'], p['frozen']
    if p['expected'] is None or frozen is None:
        fail(f'the policy for {tag} has no reviewed counts or frozen lists yet (review the real run, then set them)')
    if p['schema_version'] >= 3:
        return _policy_document_3(p, tag)
    doc = {
        'schema_version': p['schema_version'],
        'tag': tag,
        'reviewed': p['reviewed'],
        'record_rules': {
            'order': ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'],
            'R1': {'flags': list(PRODUCER_EXCLUDE), 'never_alone': ['time_hour_reconstructed']},
            'R2': {'column': 'split_21_1km', 'pattern': '^[0-9]+:[0-9]{2}:[0-9]{2}$', 'min_s_exclusive': 0},
            'R3': {'pattern': rules['nonrun_subrace_re'], 'applies_to': 'lower(race), on rows passing R1 and R2', 'subraces': frozen['R3']},
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
        'statuses': {g: list(v) for g, v in rules['statuses'].items()},
        'edition_rules': _edition_rules_doc(p),
        'use_sex': USE_SEX,
        'date_suspects': [{'edition_id': e, 'city': c, 'year': y, 'reason': r} for e, c, y, r in rules['date_suspects']],
        'same_city_labels': rules['same_city_labels'],
        'verified_label_countries': p['label_countries'],
        'battery': {**rules['battery_rules'], **p['battery']},
        'expected': p['expected'],
    }
    if rules['policy_words']:
        doc['record_rules']['R6']['no_key'] = rules['policy_words']['R6_no_key']
    if 'correction' in p:
        doc['corrected'] = p['corrected']
        doc['stamp_correction'] = p['correction']
    if 'stamps' in p:
        doc['stamps'] = p['stamps']
    if rules['unknown_status'] == 'fail':
        doc['unknown_status'] = 'a completeness_status in none of the status groups fails the build'
    if 'empty' in rules['statuses']:
        doc['empty_status'] = ('an edition whose completeness_status is in the empty group (the producer\'s placeholder for an '
                               'edition with nothing loaded) must hold no record-usable rows, else the build fails')
    if 'link_editions' in p:
        doc['link_editions'] = p['link_editions']
    return doc


def policy_bytes(tag: str = TAG) -> bytes:
    return json.dumps(policy_document(tag), ensure_ascii=False, indent=1, sort_keys=True).encode() + b'\n'


def policy_path(tag: str = TAG) -> Path:
    return ROOT / entry(tag)['file']


def write_policy(tag: str = TAG) -> Path:
    path = policy_path(tag)
    path.write_bytes(policy_bytes(tag))
    return path


def check_policy_file(tag: str = TAG) -> str:
    """The frozen JSON must equal the reviewed policy in this module; returns its sha256."""
    path = policy_path(tag)
    if not path.is_file():
        fail(f'missing {path.relative_to(ROOT)}; write it with python3 -I analysis/half_quality.py --write-policy')
    if path.read_bytes() != policy_bytes(tag):
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


def record_rules(db, rules: dict | None = None) -> None:
    """Temp table `hr`: one row per race_records row with its first record rule (NULL = record-usable) and R7 flag."""
    rules = rules or rules_of()
    nonrun = rules['nonrun_subrace_re']
    excl = _sql_list(PRODUCER_EXCLUDE)
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hfl AS SELECT record_id, bool_or(flag IN ({excl})) AS producer_excluded
                   FROM h.record_flags GROUP BY record_id""")
    lo, hi = R7['bib']
    y0, y1 = R7['years']
    # R8 (the combined release on): the rows the pipeline's frozen half row rule leaves out, applied after R1.
    row_rule = rules.get('row_rule')
    if callable(row_rule):
        row_rule = row_rule()
    if row_rule:
        import half_source
        db.execute(f'CREATE OR REPLACE TEMP TABLE hrow8 AS {half_source.left_out_sql(row_rule)}')
    else:
        db.execute('CREATE OR REPLACE TEMP TABLE hrow8 AS SELECT NULL::BIGINT AS record_id WHERE false')
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hr0 AS SELECT r.id AS record_id, r.city, r.year::INTEGER AS year, r.race,
        CASE WHEN r.sex IN ('M', 'F') THEN r.sex END AS sex, r.sex AS sex_published, {secs_sql('r.split_21_1km')} AS finish_s,
        coalesce(f.producer_excluded, false) AS producer_excluded, r.id IN (SELECT record_id FROM hrow8) AS row_rule,
        CASE WHEN r.name_ok AND len(r.name_tokens) > 0 THEN md5(array_to_string(r.name_tokens, ' ')) END AS name_key,
        coalesce(r.city = '{R7['city']}' AND r.year BETWEEN {y0} AND {y1} AND try_cast(r.bib AS INTEGER) BETWEEN {lo} AND {hi}, false) AS r7_block,
        r.distance_km
        FROM (SELECT id, city, year, race, sex, split_21_1km, bib, distance_km,
            runner IS NOT NULL AND length(trim(runner)) > 3 AND NOT regexp_matches(lower(runner), '{NAME_ANONYMOUS_RE}') AS name_ok,
            CASE WHEN runner IS NOT NULL THEN list_sort(list_filter(string_split(regexp_replace(lower(strip_accents(replace(runner, ',', ' '))),
              '[^a-z0-9 ]', ' ', 'g'), ' '), x -> x <> '')) END AS name_tokens
          FROM h.race_records) r LEFT JOIN hfl f ON f.record_id = r.id""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hsub AS SELECT city, year, race, count(*) AS n,
        count(*) FILTER (WHERE finish_s < {WR_FLOOR_S}) AS n_fast,
        regexp_matches(lower(race), '{nonrun.replace("'", "''")}') AS name_nonrun
        FROM hr0 WHERE NOT producer_excluded AND NOT row_rule AND finish_s IS NOT NULL AND finish_s > 0 GROUP BY city, year, race""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hsub2 AS SELECT city, year, race, n AS sub_n,
        CASE WHEN name_nonrun THEN 'R3' WHEN n_fast >= {SUBRACE_FAST_MIN} AND n_fast >= {SUBRACE_FAST_SHARE} * n THEN 'R4' END AS sub_rule
        FROM hsub""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE hr1 AS SELECT r.*, s.sub_n, CASE
        WHEN r.producer_excluded THEN 'R1'
        WHEN r.row_rule THEN 'R8'
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
    db.execute('CREATE OR REPLACE TEMP TABLE hrow8_ids AS SELECT record_id FROM hrow8')
    for t in ('hfl', 'hr0', 'hsub2', 'hr1', 'hdup', 'hrow8'):
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


def edition_table(db, rules: dict | None = None):
    """Per city-year metrics on the record-usable rows (before R7), joined to the registry; pandas DataFrame."""
    import pandas as pd
    rules = rules or rules_of()
    dist = db.execute("SELECT count(*) FROM hr WHERE abs(distance_km - 21.0975) > 1e-9").fetchone()[0]
    if dist:
        fail(f'{dist} race_records rows are not 21.0975 km')
    dup = db.execute('SELECT count(*) FROM (SELECT city, year FROM h.edition_meta GROUP BY 1, 2 HAVING count(*) > 1)').fetchone()[0]
    if dup:
        fail(f'{dup} registry city-years have more than one edition_meta row')
    tiered = bool(rules.get('tiers'))
    extra = (", e.timing_basis, t.verification_tier AS tier, coalesce(t.weaker_source, false) AS weaker_source, t.split_tier, "
             "coalesce(x.n, 0) AS n_excluded, coalesce(cs.flagged, 0) AS n_course_suspect, coalesce(cs.n, 0) AS n_link_rows") if tiered else ''
    joins = (""" LEFT JOIN h.tiers t ON t.source_db = 'half' AND t.city = coalesce(e.city, a.city) AND t.year = coalesce(e.year, a.year)
          LEFT JOIN h.excluded_rows x ON x.city = coalesce(e.city, a.city) AND x.year = coalesce(e.year, a.year)
          LEFT JOIN h.course_suspect cs ON cs.city = coalesce(e.city, a.city) AND cs.year = coalesce(e.year, a.year)""") if tiered else ''
    status = 'coalesce(t.verification_tier, e.completeness_status)' if tiered else 'e.completeness_status'
    m = db.execute(f"""WITH a AS (SELECT city, year, count(*) AS n_db, count(*) FILTER (WHERE rule IS NULL) AS n_usable,
            median(finish_s) FILTER (WHERE rule IS NULL) AS med_s,
            quantile_cont(finish_s, 0.99) FILTER (WHERE rule IS NULL) AS p99_s,
            avg(CASE WHEN finish_s < 3900 THEN 1 ELSE 0 END) FILTER (WHERE rule IS NULL) AS share_sub65,
            count(*) FILTER (WHERE rule IS NULL AND sex_published = 'M') AS n_m,
            count(*) FILTER (WHERE rule IS NULL AND sex_published = 'F') AS n_f
          FROM hr GROUP BY city, year)
        SELECT coalesce(e.city, a.city) AS city, coalesce(e.year, a.year)::INTEGER AS year, e.id AS edition_id, e.race AS race_meta,
          e.race_date, try_cast(e.race_date AS DATE) AS race_day, {status} AS completeness_status, e.official_finishers, e.official_source_type,
          coalesce(a.n_db, 0) AS n_db, coalesce(a.n_usable, 0) AS n_usable, a.med_s, a.p99_s, a.share_sub65,
          coalesce(a.n_m, 0) AS n_m, coalesce(a.n_f, 0) AS n_f{extra}
        FROM h.edition_meta e FULL OUTER JOIN a ON a.city = e.city AND a.year = e.year{joins}
        ORDER BY 1, 2""").df()
    if tiered:
        # Rows loaded (E3, E6): the release removes rows the earlier snapshots still held, so an edition's loaded rows are
        # its rows in CORE plus its rows in RELEASE-ROW-EXCLUSIONS.parquet (docs/HALF_MARATHON.md, rule R2).
        m['n_core'] = m.n_db.astype('int64')
        m['n_db'] = m.n_db.where(m.n_db == 0, m.n_db + m.n_excluded)
        no_tier = m[(m.n_core > 0) & m.tier.isna()]
        if len(no_tier):
            fail(f'{len(no_tier)} half editions with rows have no row in EDITION-TIERS.csv: {no_tier.city.tolist()[:5]}')
        m['gross_timing'] = m.timing_basis.fillna('').str.lower().str.startswith('gross')
        partly = m[(m.n_course_suspect > 0) & ((m.n_course_suspect != m.n_link_rows) | (m.n_link_rows != m.n_core))]
        if len(partly):
            fail(f'{len(partly)} editions are only partly flagged course_shortened_suspect in the link file: {partly.city.tolist()[:5]}')
        m['course_suspect'] = m.n_course_suspect > 0
    m['edition_id'] = m['edition_id'].astype('Int64')
    for col in ('official_finishers', 'med_s', 'p99_s', 'share_sub65'):
        m[col] = m[col].astype('float')
    for col in ('n_db', 'n_usable', 'n_m', 'n_f'):
        m[col] = m[col].astype('int64')
    st = m.completeness_status.fillna('')
    groups = rules['statuses']
    m['status_group'] = 'no_rows'
    m.loc[st.isin(groups['held']), 'status_group'] = 'held'
    m.loc[st.isin(groups['unverified']), 'status_group'] = 'unverified'
    m.loc[st.isin(groups['verified']), 'status_group'] = 'verified'
    if 'removed' in groups:
        m.loc[st.isin(groups['removed']), 'status_group'] = 'removed'
    if 'partial' in groups:
        m.loc[st.isin(groups['partial']), 'status_group'] = 'partial'
    m.loc[m.edition_id.isna(), 'status_group'] = 'no_edition_meta'
    if rules['unknown_status'] == 'fail':
        known = {s for g in groups.values() for s in g}
        unknown = sorted(set(st[m.edition_id.notna() | (tiered & (m.n_db > 0))]) - known)
        if unknown:
            fail(f'completeness_status in no status group of the reviewed policy: {unknown}')
    t = m.official_source_type.fillna('').str.lower()
    m['independent'] = t.str.contains(rules['independent_re']) & ~t.str.contains(rules['not_independent_re'])
    sexed = m.n_m + m.n_f
    m['sex_coverage'] = (sexed / m.n_usable.where(m.n_usable > 0)).astype(float)
    m['women_share'] = (m.n_f / sexed.where(sexed > 0)).astype(float)
    m['p99_over_median'] = m.p99_s / m.med_s
    m['single_sex_event'] = (m.city.fillna('') + ' ' + m.race_meta.fillna('')).str.lower().str.contains(SINGLE_SEX_EVENT_RE)
    return m


def is_virtual_label(label, rule: dict | None) -> bool:
    """The virtual-event rule (VIRTUAL_RULE_20261030_1904): the label contains `virtual` or `virtuel`, or its place (the
    label before the first colon) starts with the placeholder `Anywhere`."""
    if not rule or not isinstance(label, str):
        return False
    low = label.lower()
    place = low.split(':', 1)[0].strip()
    return bool(re.search(rule['label_pattern'], low) or re.search(rule['placeholder_place_pattern'], place))


def _edition_rule(r, by_id, by_key, rules=None):
    """(category, reason) of the first edition rule that applies before E8, or (None, None)."""
    rules = rules or rules_of()
    partial = {(c, y): reason for c, y, reason in rules['partial_loads']}
    if (r.city, int(r.year)) in partial:
        return ('partial_load', partial[(r.city, int(r.year))])
    if rules.get('tiers') and r.completeness_status in rules['statuses'].get('partial', ()):
        return ('partial_tier', f'Tier {r.completeness_status}: the release marks the list as partial results.')
    if r.status_group == 'no_edition_meta':
        return ('no_edition_meta', 'Records exist for this city and year but the edition registry has no row: no count, date or status; not verified.')
    if r.status_group == 'removed':
        return ('removed_by_producer', f'Producer status {r.completeness_status}: the producer deleted the rows of a double load.')
    if r.status_group == 'no_rows' or (r.n_usable == 0 and r.status_group != 'held'):
        return ('no_usable_rows', 'No usable finish rows.')
    if r.status_group == 'held':
        return ('held_by_producer', f"{'Tier' if rules.get('tiers') else 'Producer status'} {r.completeness_status}.")
    eid = int(r.edition_id)
    if eid in by_id:
        return by_id[eid]
    if (r.city, int(r.year)) in by_key:
        return by_key[(r.city, int(r.year))]
    if rules.get('tiers') and r.course_suspect:
        return ('course_suspected_short', "Every row carries the link build's course_shortened_suspect flag: the course is suspected "
                                          'to have been short, so the edition is listed and marked and its times are never compared.')
    if is_virtual_label(r.city, rules['virtual']) and eid not in {e for e, _ in rules['not_virtual']}:
        return ('virtual_event', 'A virtual race: self-timed efforts, not a race field.')
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


def edition_rules(m, rules: dict | None = None):
    """Adds `category`, `reason`, `rule` (E0–E8) and the use flags to the edition table."""
    import numpy as np
    import pandas as pd
    rules = rules or rules_of()
    by_id = {e: (c, r) for e, c, r in rules['reviewed_e2']}
    if rules.get('reviewed_e2_twins') is not None:
        # A reviewed duplicate or overlap decision applies only while the twin its reason names still has rows (the
        # combined release on: where the release kept only the listed copy, that copy is the only one and is usable).
        have_rows = set(m[m.edition_id.notna() & (m.n_db > 0)].edition_id.astype(int))
        twins = rules['reviewed_e2_twins']
        if set(twins) != set(by_id):
            fail('every reviewed E2 decision by edition id needs its twin (an edition id, or None for a decision that names none)')
        m.attrs['e2_dropped'] = sorted((e, by_id[e][0], twins[e], 'no rows itself' if e not in have_rows else 'the twin has no rows')
                                       for e in by_id if e not in have_rows or (twins[e] is not None and twins[e] not in have_rows))
        by_id = {e: v for e, v in by_id.items() if twins[e] is None or twins[e] in have_rows}
    by_key = {(city, year): (c, r) for city, year, c, r in rules['reviewed_e2_by_key']}
    rows = [_edition_rule(r, by_id, by_key, rules) for r in m.itertuples(index=False)]
    m['category'] = [c for c, _ in rows]
    m['reason'] = [r for _, r in rows]
    s_ok = (m.n_usable >= MEDIAN_SCREEN['min_finishes']) & m.status_group.isin(['verified', 'unverified', 'held'])
    # The reference editions of E8: every screened edition, except (the combined release on) a gun-time edition or one
    # whose course is suspected short, which never enter a comparison.
    ref_ok = s_ok & ~(m.gross_timing | m.course_suspect) if rules.get('tiers') else s_ok
    others = pd.Series(np.nan, index=m.index)
    n_eds = pd.Series(0, index=m.index)
    for _, idx in m[s_ok].groupby('city').groups.items():
        values = m.loc[[i for i in idx if ref_ok[i]], 'med_s']
        for i in idx:
            rest = values.drop(i, errors='ignore')
            n_eds[i] = len(rest) + 1
            others[i] = rest.median() if len(rest) else np.nan
    log_dev = np.log(m.med_s / others)
    shift = m.category.isna() & s_ok & (n_eds >= MEDIAN_SCREEN['min_editions']) & (log_dev.abs() > MEDIAN_SCREEN['max_abs_log_ratio'])
    m.loc[shift, 'category'] = 'series_median_shift'
    m.loc[shift, 'reason'] = [
        f"Median finish {med / 60:.0f} min against {oth / 60:.0f} min in the same race’s other editions ({(math.exp(dev) - 1) * 100:+.0f}%): the time column may include the start delay or another contest."
        for med, oth, dev in zip(m.loc[shift, 'med_s'], others[shift], log_dev[shift])]
    m['rule'] = m.category.map(rules['category_rule'])
    m['use_finish'] = m.category.isna() & (m.n_usable > 0) & m.status_group.isin(['verified', 'unverified'])
    m['use_sex'] = (m.use_finish & (m.sex_coverage >= USE_SEX['min_coverage'])
                    & m.women_share.between(USE_SEX['min_share'], USE_SEX['max_share']))
    suspects = {e for e, *_ in rules['date_suspects']}
    m['date_suspect'] = m.edition_id.isin(suspects).fillna(False).astype(bool)
    removed_rows = m[(m.status_group == 'removed') & (m.n_db > 0)]
    if len(removed_rows):
        fail(f'{len(removed_rows)} editions with a removed status still hold rows: '
             f'{sorted(int(e) for e in removed_rows.edition_id)[:5]}')
    # The producer's empty placeholder (the `empty` status group, from 1904 on) means nothing was loaded: such an edition
    # has no E rule, so record-usable rows in it would leave every count unnoticed (verify round 1, October 31, 2026).
    empty_rows = m[m.completeness_status.isin(rules['statuses'].get('empty', ())) & ((m.n_db if rules.get('tiers') else m.n_usable) > 0)]
    if len(empty_rows):
        fail(f'{len(empty_rows)} editions with an empty status hold record-usable rows: '
             f'{sorted(int(e) for e in empty_rows.edition_id)[:5]}')
    for city, year, _ in rules['partial_loads']:
        hit = m[(m.city == city) & (m.year == year)]
        if len(hit) and (hit.use_finish.any() or not (hit.category == 'partial_load').all()):
            fail(f'the partial load {city} {year} supplies finishes')
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
# Edition metadata files (the 2157 corrected metadata; the 1904 release's own CSV)
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


def read_meta_csv(path: Path, sha256: str, what: str) -> dict:
    """An edition_meta CSV (zstd), {edition_id: {city, year, status, reason, source_type}}, after its sha256 is checked
    against the reviewed digest. Fails loudly on any other file."""
    path = Path(path)
    if not path.is_file():
        fail(f'missing {what} {path}; fetch it with python3 -I analysis/download_half.py')
    got = file_sha256(path)
    if got != sha256:
        fail(f'{path} is not the reviewed {what} (sha256 {got}, reviewed {sha256})')
    if shutil.which('zstd') is None:
        fail(f'the zstd command is required to read the {what}')
    raw = subprocess.run(['zstd', '-dc', '-q', str(path)], check=True, capture_output=True).stdout
    rows = {}
    for r in csv.DictReader(io.StringIO(raw.decode('utf-8'), newline='')):
        eid = int(r['id'])
        if eid in rows:
            fail(f'the {what} lists edition {eid} twice')
        rows[eid] = {'city': r['city'], 'year': int(r['year']), 'status': r['completeness_status'],
                     'reason': r['completeness_reason'], 'source_type': r['official_source_type']}
    return rows


def read_correction(path: Path, correction: dict) -> dict:
    """The corrected edition registry of a stamp correction (or the 1904 policy's stamp reference)."""
    if not Path(path).is_file():
        fail(f"missing the corrected metadata {path} ({correction['tag']}/{correction['asset']}); fetch it with "
             'python3 -I analysis/download_half.py')
    return read_meta_csv(path, correction['sha256'], f"corrected metadata of {correction['tag']}")


def half_dir() -> Path:
    """$PACE_HALF_DIR, defaulting to ~/data/half-1904 (where download_half.py puts the pinned sources)."""
    return Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1904').expanduser()


def default_correction_path(tag: str = TAG) -> Path:
    """Where download_half.py puts the 2157 metadata: $PACE_HALF_DIR/<its tag>/<asset> (the 1133 correction, the 1904
    stamp reference)."""
    p = entry(tag)
    c = p['correction'] if 'correction' in p else p['stamps']['reference']
    return half_dir() / c['tag'] / c['asset']


def default_edition_meta_path(tag: str = TAG) -> Path:
    """This release's own edition_meta CSV: $PACE_HALF_DIR/<asset>."""
    return half_dir() / entry(tag)['stamps']['edition_meta_csv']['asset']


def read_stamp_inputs(tag: str = TAG, reference: Path | None = None, edition_meta: Path | None = None) -> dict:
    """The two files the 1904 stamp check reads, each checked against its reviewed sha256."""
    s = entry(tag)['stamps']
    return {'reference': read_meta_csv(reference or default_correction_path(tag), s['reference']['sha256'],
                                       f"stamp reference of {s['reference']['tag']}"),
            'edition_meta': read_meta_csv(edition_meta or default_edition_meta_path(tag), s['edition_meta_csv']['sha256'],
                                          "release's csv-edition_meta")}


# ---------------------------------------------------------------------------------------------------------------
# The stamp correction (half-snapshot-20261029-1133 only)
# ---------------------------------------------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------------------------------------------
# The stamp check (half-dataset-20261030-1904 on): verified = stamped in the snapshot's own edition_meta
# ---------------------------------------------------------------------------------------------------------------

def snapshot_meta(db) -> dict:
    """This snapshot's edition_meta as {edition_id: {city, year, status, reason, source_type}} (the CSV reader's shape)."""
    return {int(e): {'city': c, 'year': int(y), 'status': s, 'reason': r, 'source_type': t} for e, c, y, s, r, t in db.execute(
        'SELECT id, city, year, completeness_status, completeness_reason, official_source_type FROM h.edition_meta').fetchall()}


def snapshot_never_stamp(db) -> list:
    """This snapshot's never_stamp table, verbatim, as [(edition_id, reason, added_at)] by edition id; [] without one."""
    tables = {r[0] for r in db.execute("SELECT table_name FROM duckdb_tables() WHERE database_name = 'h'").fetchall()}
    if 'never_stamp' not in tables:
        return []
    return [(int(e), r, a) for e, r, a in db.execute('SELECT edition_id, reason, added_at FROM h.never_stamp ORDER BY edition_id').fetchall()]


def _diff(got, want) -> str:
    got, want = set(got), set(want)
    return f'new {sorted(got - want)[:5]}, gone {sorted(want - got)[:5]}'


def check_stamps(meta: dict, never_stamp: list, stamps: dict, inputs: dict) -> None:
    """Before the edition rules: the snapshot's stamps against the reviewed list, the 2157 reference, the withdrawn stamps,
    never_stamp and this release's CSV (STAMP_RULE_20261030_1904 `reads`). Fails loudly on any difference."""
    stamped = {e for e, r in meta.items() if r['status'] == 'stamped'}
    if stamped != set(stamps['stamped']):
        fail(f'the stamped editions differ from the reviewed list: {_diff(stamped, stamps["stamped"])}')
    ref = inputs['reference']
    ref_stamped = {e for e, r in ref.items() if r['status'] == 'stamped'}
    if stamped != ref_stamped:
        fail(f"the stamped editions differ from the stamp reference {stamps['reference']['tag']}: {_diff(stamped, ref_stamped)}")
    for e in sorted(stamped):
        if (ref[e]['city'], ref[e]['year']) != (meta[e]['city'], meta[e]['year']):
            fail(f"stamped edition {e} is {meta[e]['city']} {meta[e]['year']} here and {ref[e]['city']} {ref[e]['year']} in the reference")
    frozen_ns = [(x['edition_id'], x['reason'], x['added_at']) for x in stamps['never_stamp']]
    if never_stamp != frozen_ns:
        fail(f'the snapshot never_stamp table differs from the reviewed rows: {_diff(never_stamp, frozen_ns)}')
    ns_ids = {e for e, _, _ in never_stamp}
    if ns_ids & stamped:
        fail(f'never_stamp editions are stamped: {sorted(ns_ids & stamped)[:5]}')
    for w in stamps['reference']['withdrawn']:
        here = meta.get(w['edition_id'])
        if here is None or (here['city'], here['year']) != (w['city'], w['year']):
            fail(f"withdrawn stamp {w['edition_id']} ({w['city']} {w['year']}) is not that edition in this snapshot")
        if here['status'] != w['corrected_status']:
            fail(f"withdrawn stamp {w['edition_id']} ({w['city']} {w['year']}) is {here['status']} here, not {w['corrected_status']}")
        if w['edition_id'] not in ns_ids:
            fail(f"withdrawn stamp {w['edition_id']} ({w['city']} {w['year']}) is missing from the never_stamp table")
    csv_rows = inputs['edition_meta']
    if set(csv_rows) != set(meta):
        fail(f"this release's csv-edition_meta and the SQLite edition_meta hold different editions: {_diff(csv_rows, meta)}")
    text = lambda row: {k: ('' if v is None else v) for k, v in row.items()}   # a NULL in SQLite is an empty CSV field
    bad = sorted(e for e in meta if text(csv_rows[e]) != text(meta[e]))
    if bad:
        fail(f"this release's csv-edition_meta differs from the SQLite edition_meta (city, year, status, reason or source) for {len(bad)} editions: {bad[:5]}")
    for x in (*stamps['weaker_source'], *stamps['reference']['weaker_source']):
        here = meta.get(x['edition_id'])
        if here is None or (here['city'], here['year'], here['status']) != (x['city'], x['year'], 'stamped') or trim_text(here['source_type']) != x['source']:
            fail(f"weaker-source stamp {x['edition_id']} ({x['city']} {x['year']}) is not stamped with that source in this snapshot")


def check_stamps_verified(m, stamps: dict) -> None:
    """After the edition rules: verified editions are exactly the stamped ones, and every weaker-source stamp is a
    verified usable edition."""
    verified = m[m.status_group == 'verified']
    if set(verified.edition_id.astype(int)) != set(stamps['stamped']):
        fail('the verified status group is not the reviewed stamped list')
    usable = set(m[m.use_finish & (m.status_group == 'verified')].edition_id.astype(int))
    for x in stamps['weaker_source']:
        if x['edition_id'] not in usable:
            fail(f"weaker-source stamp {x['city']} {x['year']} is not a verified usable edition of the build")


def stamp_counts(m, never_stamp: list, stamps: dict) -> dict:
    """The stamp_check counts: stamped editions, the verified usable ones, the reference's withdrawn stamps that are
    unstamped here, and the never_stamp rows."""
    by_id = {int(r.edition_id): r for r in m[m.edition_id.notna()].itertuples(index=False)}
    withdrawn = sum(1 for w in stamps['reference']['withdrawn']
                    if w['edition_id'] in by_id and by_id[w['edition_id']].completeness_status != 'stamped')
    return {'stamped': int((m.completeness_status == 'stamped').sum()),
            'verified_usable': int((m.use_finish & (m.status_group == 'verified')).sum()),
            'withdrawn_unstamped': withdrawn, 'never_stamp': len(never_stamp)}


# ---------------------------------------------------------------------------------------------------------------
# The tier check (the combined release on): verified = a badge tier of EDITION-TIERS.csv
# ---------------------------------------------------------------------------------------------------------------

def check_tiers(m, tiers: dict) -> list:
    """Before the edition rules: the release's tiers against the reviewed lists (TIER_RULE_20261113_1113 `reads`). Fails
    loudly on any difference; returns the label changes it reports (never-stamp editions whose label changed)."""
    reg = m[m.edition_id.notna()]
    by_id = {int(r.edition_id): r for r in reg.itertuples(index=False)}
    badge = set(reg[reg.status_group == 'verified'].edition_id.astype(int))
    if badge != set(tiers['stamped']):
        fail(f'the badge-tier editions differ from the reviewed list: {_diff(badge, tiers["stamped"])}')
    changed = []
    for x in tiers['never_stamp']:
        r = by_id.get(x['edition_id'])
        if r is None or int(r.year) != x['year']:
            fail(f"never-stamp edition {x['edition_id']} ({x['city']} {x['year']}) is not an edition of that id and year in this release")
        if r.status_group == 'verified':
            fail(f"never-stamp edition {x['edition_id']} ({x['city']} {x['year']}) carries a badge tier")
        if r.city != x['city']:
            changed.append({'edition_id': x['edition_id'], 'was': x['city'], 'now': r.city})
    weaker = set(reg[reg.completeness_status == 'stamped_weaker_source'].edition_id.astype(int)) | set(reg[reg.weaker_source].edition_id.astype(int))
    if weaker != {x['edition_id'] for x in tiers['weaker_source']}:
        fail(f"the weaker-source stamps differ from the reviewed list: {_diff(weaker, [x['edition_id'] for x in tiers['weaker_source']])}")
    for x in tiers['weaker_source']:
        r = by_id[x['edition_id']]
        if (r.city, int(r.year), r.completeness_status) != (x['city'], x['year'], 'stamped_weaker_source') or trim_text(r.official_source_type) != x['source']:
            fail(f"weaker-source stamp {x['edition_id']} ({x['city']} {x['year']}) is not that edition with that source in this release")
    import pandas as pd
    key = lambda rows: {(None if pd.isna(r.edition_id) else int(r.edition_id), r.city, int(r.year)) for r in rows.itertuples(index=False)}  # noqa: E731
    want = lambda name: {(x['edition_id'], x['city'], x['year']) for x in tiers[name]}  # noqa: E731
    if key(m[m.gross_timing]) != want('gross_timing'):
        fail(f"the gun-time editions differ from the reviewed list: {_diff(key(m[m.gross_timing]), want('gross_timing'))}")
    if not (m[m.gross_timing].status_group == 'held').all():
        fail('a gun-time edition is not held: it must never enter a comparison (lead decision D6)')
    if key(m[m.course_suspect]) != want('course_suspected_short'):
        fail(f"the course-suspected-short editions differ from the reviewed list: {_diff(key(m[m.course_suspect]), want('course_suspected_short'))}")
    return changed


def check_tiers_verified(m, tiers: dict) -> None:
    """After the edition rules: every weaker-source stamp is a verified usable edition, and a course-suspected-short
    edition supplies nothing."""
    usable = set(m[m.use_finish & (m.status_group == 'verified')].edition_id.astype(int))
    for x in tiers['weaker_source']:
        if x['edition_id'] not in usable:
            fail(f"weaker-source stamp {x['city']} {x['year']} is not a verified usable edition of the build")
    if m[m.course_suspect].use_finish.any() or m[m.gross_timing].use_finish.any():
        fail('a gun-time or course-suspected-short edition supplies finishes')


def tier_counts(m, tiers: dict) -> dict:
    return {'badge': int((m.status_group == 'verified').sum()),
            'verified_usable': int((m.use_finish & (m.status_group == 'verified')).sum()),
            'weaker_source': int((m.completeness_status == 'stamped_weaker_source').sum()),
            'never_stamp': len(tiers['never_stamp']),
            'gross_timing': int(m.gross_timing.sum()), 'course_suspected_short': int(m.course_suspect.sum())}


def check_date_suspects(m, rules: dict) -> list:
    """The date suspects are carried by edition id and year and must still carry the date their reason names; returns the
    label changes it reports."""
    by_id = {int(r.edition_id): r for r in m[m.edition_id.notna()].itertuples(index=False)}
    changed = []
    for eid, city, year, _ in rules['date_suspects']:
        r = by_id.get(eid)
        if r is None or int(r.year) != year:
            fail(f'date suspect {eid} ({city} {year}) is not an edition of that id and year in this release')
        if str(r.race_day)[:10] != rules['date_suspect_dates'][eid]:
            fail(f"date suspect {eid} ({city} {year}) is dated {r.race_date}, not {rules['date_suspect_dates'][eid]}: review it")
        if r.city != city:
            changed.append({'edition_id': eid, 'was': city, 'now': r.city})
    return changed


def check_identity_left_out(db) -> dict:
    """Every half row the identity file marks left_out is removed by the record rules (lead decision D28); also whether
    the rows R8's rule names and the identity file's left_out rows are the same set."""
    kept = db.execute("""SELECT count(*) FROM h.identity_left_out i JOIN hr ON hr.record_id = i.record_id
        WHERE hr.rule IS NULL AND NOT hr.r7_block""").fetchone()[0]
    missing = db.execute('SELECT count(*) FROM h.identity_left_out i WHERE i.record_id NOT IN (SELECT record_id FROM hr)').fetchone()[0]
    if kept or missing:
        fail(f'{kept} half rows the identity file marks left_out are record-usable, and {missing} are not rows of the half database')
    n_identity = db.execute('SELECT count(*) FROM h.identity_left_out').fetchone()[0]
    n_rule = db.execute('SELECT count(*) FROM hrow8_ids').fetchone()[0]
    both = db.execute('SELECT count(*) FROM hrow8_ids JOIN h.identity_left_out USING (record_id)').fetchone()[0]
    return {'rows_the_rule_names': int(n_rule), 'identity_left_out': int(n_identity), 'in_both': int(both)}


# ---------------------------------------------------------------------------------------------------------------
# The flagship battery's lists and the link-build edition lists
# ---------------------------------------------------------------------------------------------------------------

def weaker_source(tag: str = TAG) -> list:
    p = entry(tag)
    if 'tiers' in p:
        return p['tiers']['weaker_source']
    return p['stamps']['weaker_source'] if 'stamps' in p else p['correction']['weaker_source']


def battery_lists(tag: str = TAG) -> dict:
    """What the flagship battery's verified-half members leave out (the entry's battery rules): the weaker-source stamps'
    edition ids and the reviewed off-road labels of the policy entry."""
    return {'weaker_source': frozenset(int(x['edition_id']) for x in weaker_source(tag)),
            'off_road_labels': frozenset(entry(tag)['battery']['off_road_labels'])}


def check_battery_lists(m, tag: str = TAG) -> None:
    """After the edition rules: every reviewed off-road label is the label of a verified usable edition (the list names
    labels exactly as the snapshot writes them, so a renamed or unverified label fails instead of leaving nothing out)."""
    usable = m[m.use_finish & (m.status_group == 'verified')]
    labels = set(usable.city.tolist())
    for label in entry(tag)['battery']['off_road_labels']:
        if label not in labels:
            fail(f'off-road label {label!r} is not the label of a verified usable edition of the build')


def link_editions(tag: str = TAG) -> dict:
    """The editions that supply no linked half (link_editions of the policy): the link-partial and re-timed edition ids,
    and the link build's half coverage boundary."""
    le = entry(tag).get('link_editions')
    if not le:
        return {'link_partial': frozenset(), 'retimed': frozenset(), 'half_max_record_id': None, 'link_build': None}
    return {'link_partial': frozenset(x['edition_id'] for x in le['link_partial']),
            'retimed': frozenset(x['edition_id'] for x in le['retimed']),
            'half_max_record_id': le['half_max_record_id'], 'link_build': le['link_build']}


def check_link_editions(db, m, tag: str = TAG) -> list:
    """The link-partial editions recomputed from the snapshot (use_finish editions with record-usable rows on both sides
    of the link build's coverage boundary) must equal the frozen list; every re-timed edition must be a use_finish
    edition of this snapshot with the frozen city and year (its rows are compared with the link build by the links
    extract). Returns the computed link-partial list."""
    le = entry(tag).get('link_editions')
    if not le:
        return []
    b = int(le['half_max_record_id'])
    rows = db.execute(f"""SELECT edition_id, city, year, count(*) FILTER (WHERE record_id <= {b}) AS covered,
        count(*) FILTER (WHERE record_id > {b}) AS uncovered FROM hfin GROUP BY 1, 2, 3
        HAVING covered > 0 AND uncovered > 0 ORDER BY 2, 3""").fetchall()
    got = [{'edition_id': int(e), 'city': c, 'year': int(y), 'rows_covered': int(cv), 'rows_uncovered': int(uc)} for e, c, y, cv, uc in rows]
    if got != le['link_partial']:
        fail(f"the link-partial editions differ from the reviewed list: {got} against {le['link_partial']}")
    usable = {int(r.edition_id): r for r in m[m.use_finish & m.edition_id.notna()].itertuples(index=False)}
    for x in le['retimed']:
        r = usable.get(x['edition_id'])
        if r is None or (r.city, int(r.year)) != (x['city'], x['year']):
            fail(f"re-timed edition {x['edition_id']} ({x['city']} {x['year']}) is not a usable edition of this snapshot")
    return got


class PolicyResult:
    """The applied policy: counts (spec 1.3), the edition table and the computed lists."""

    def __init__(self, counts, editions, lists):
        self.counts = counts
        self.editions = editions
        self.lists = lists


def apply(db, tag: str = TAG, *, compare: bool = True, correction_rows: dict | None = None,
          stamp_inputs: dict | None = None) -> PolicyResult:
    """Apply the policy; leave temp tables `hr` (every record and its rule) and `hfin` (use_finish finishes after R7,
    plus the R7 rows flagged) in `db`; return the counts. Fails when a computed list or count differs from the review.
    A comparing run needs the entry's metadata files: `correction_rows` (read_correction) for the 1133 entry, and
    `stamp_inputs` (read_stamp_inputs) for an entry with a stamp check."""
    reviewed = entry(tag)
    rules = reviewed['rules']
    has_correction, has_stamps, has_tiers = 'correction' in reviewed, 'stamps' in reviewed, 'tiers' in reviewed
    if compare and has_correction and correction_rows is None:
        fail('the corrected metadata is required (read_correction; build_half.py --stamp-reference)')
    if compare and has_stamps and stamp_inputs is None:
        fail('the stamp reference and the release edition_meta CSV are required (read_stamp_inputs)')
    if compare and (reviewed['expected'] is None or reviewed['frozen'] is None):
        fail(f'no reviewed counts or frozen lists for {tag} yet')
    record_rules(db, rules)
    subs = subrace_lists(db)
    m = edition_table(db, rules)
    withdrawn_ids, never_stamp = [], []
    if has_correction:
        withdrawn_ids = apply_stamp_correction(m, reviewed['correction'], correction_rows, compare=compare)
    if has_stamps:
        never_stamp = snapshot_never_stamp(db)
        if compare:
            check_stamps(snapshot_meta(db), never_stamp, reviewed['stamps'], stamp_inputs)
    reported = {}
    if has_tiers:
        # The tier check runs on every run, a discovery run included: it reads no frozen computed list.
        reported['never_stamp_label_changes'] = check_tiers(m, reviewed['tiers'])
        reported['date_suspect_label_changes'] = check_date_suspects(m, rules)
        reported['row_rule'] = check_identity_left_out(db)
    m = edition_rules(m, rules)
    if has_tiers:
        check_tiers_verified(m, reviewed['tiers'])
        check_battery_lists(m, tag)
        reported['e2_decisions_dropped'] = [{'edition_id': e, 'category': c, 'twin': t, 'why': w} for e, c, t, w in m.attrs.get('e2_dropped', [])]
    if compare:
        if has_correction:
            check_corrected_verified(m, reviewed['correction'], correction_rows)
        if has_stamps:
            check_stamps_verified(m, reviewed['stamps'])
        check_battery_lists(m, tag)
    lists = {'R3': subs['R3'], 'R4': subs['R4'], 'editions': edition_list(m)}
    if has_tiers:
        lists['reported'] = reported
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
    lists['link_partial'] = check_link_editions(db, m, tag) if compare else []
    q = lambda sql: db.execute(sql).fetchone()
    raw = q('SELECT count(*) FROM hr')[0]
    usable = by_rule.get('usable', 0)
    r7 = q('SELECT count(*) FROM hr WHERE rule IS NULL AND r7_block')[0]
    r7_outside = q('SELECT count(*) FROM hfin WHERE r7_block')[0]
    if r7_outside != r7:
        fail(f'{r7 - r7_outside} R7 rows sit outside use_finish editions; the rule was reviewed on use_finish editions only')
    held = m[(m.rule == 'E1') & (m.status_group == 'held')]
    removed = m[(m.rule == 'E1') & (m.status_group == 'removed')]
    e0 = m[m.rule == 'E0']
    e28 = m[m.rule.isin(['E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'])]
    fin = lambda where: q(f'SELECT count(*), count(DISTINCT edition_id) FROM hfin WHERE NOT r7_block AND {where}')
    uf, vf, vs, nd = fin('TRUE'), fin("status_group = 'verified'"), fin("status_group = 'verified' AND use_sex"), fin('race_date IS NULL')
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
    }
    if has_correction:
        wd = fin(f"edition_id IN ({', '.join(str(e) for e in withdrawn_ids) or 'NULL'})")
        counts['stamp_withdrawn'] = {'finishes': wd[0], 'editions': wd[1]}
    if 'removed' in rules['statuses']:
        counts['E1_removed_editions'] = len(removed)
    if has_stamps:
        counts['stamp_check'] = stamp_counts(m, never_stamp, reviewed['stamps'])
    if has_tiers:
        counts['R8'] = by_rule.get('R8', 0)
        counts['tier_check'] = tier_counts(m, reviewed['tiers'])
    # Every record-usable finish after R7 is either used or removed by exactly one edition rule (E0, E1 held, E2–E8): a
    # status or category without a rule would otherwise drop finishes silently (verify round 1, October 31, 2026).
    accounted = counts['use_finish']['finishes'] + counts['E0_finishes'] + counts['E1_held_finishes'] + counts['E2_E8_finishes']
    if accounted != counts['record_usable_after_R7']:
        fail(f"{counts['record_usable_after_R7'] - accounted} record-usable finishes after R7 are neither used nor removed by an "
             f'edition rule (used {counts["use_finish"]["finishes"]}, E0 {counts["E0_finishes"]}, E1 {counts["E1_held_finishes"]}, '
             f'E2–E8 {counts["E2_E8_finishes"]})')
    if compare and counts != reviewed['expected']:
        diff = {k: (counts.get(k), reviewed['expected'].get(k)) for k in set(counts) | set(reviewed['expected']) if counts.get(k) != reviewed['expected'].get(k)}
        fail(f'policy counts differ from the reviewed ones (got, reviewed): {diff}')
    return PolicyResult(counts, m, lists)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--write-policy', action='store_true', help='freeze REVIEWED_HALF_POLICIES[--key] as its policy JSON')
    parser.add_argument('--check', action='store_true', help='recompute the screens and counts from --half')
    parser.add_argument('--discover', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--key', default=TAG, help=f'the reviewed entry (default {TAG}, the pinned snapshot)')
    parser.add_argument('--half', type=Path)
    parser.add_argument('--stamp-reference', '--corrected-meta', dest='reference', type=Path, default=None,
                        help='the 2157 csv-edition_meta.csv.zst (default $PACE_HALF_DIR/half-dataset-20261029-2157/csv-edition_meta.csv.zst)')
    parser.add_argument('--edition-meta', type=Path, default=None,
                        help="this release's csv-edition_meta.csv.zst (default $PACE_HALF_DIR/csv-edition_meta.csv.zst)")
    args = parser.parse_args(argv)
    if args.write_policy:
        print(f'wrote {write_policy(args.key).relative_to(ROOT)}')
    if args.check or args.discover:
        from half_common import connect
        if args.half is None:
            fail('--half is required')
        p = entry(args.key)
        db = connect(half=args.half)
        kw = {}
        if 'correction' in p:
            kw['correction_rows'] = read_correction(args.reference or default_correction_path(args.key), p['correction'])
        if 'stamps' in p:
            kw['stamp_inputs'] = read_stamp_inputs(args.key, args.reference, args.edition_meta)
        result = apply(db, args.key, compare=not args.discover, **kw)
        if args.discover:
            print(json.dumps({'counts': result.counts, 'lists': result.lists}, ensure_ascii=False, indent=1))
        else:
            print(json.dumps(result.counts))
            print(f'policy {check_policy_file(args.key)} matches the source')
    return 0


if __name__ == '__main__':
    sys.exit(main())
