"""Build the marathon race directory, public/data/races/ (docs/RACES.md).

    python3 -I analysis/build_races.py --input <adapted FULL or CORE dir> [--out public/data/races] [--accept-counts]

Reads the adapted marathon input read-only (its MANIFEST.json must be the one the frozen edition policy was frozen on),
the frozen edition policy and its published list, the frozen race registry, the family's reviewed notes
(analysis/race-notes.json: race flags, search aliases, the rulings on duplicate editions, and the evidence files it
names) and the pipeline's evidence (every edition's facts, the cohort's sensitivity readings). Writes:

- directory.json   every marathon race with at least one recorded result: label, name, place, page type, flags,
                   years, and its editions as compact rows (year, tier, split tier, recorded results, finishes with a
                   time, use and category, timing basis, review state). No official count, coverage or note.
- pages.json       the short head: the races with a page, for lists and navigation.
- race/<slug>.json one file per race with a page: its editions, finish-time facts for the editions of the
                   finish-time universe, and the race's reading where its floors hold.
- editions.csv     the downloadable edition table for /methodology (official counts, coverage, notes, reasons).
- summary.json     the counts /methodology and the home page print, each with what it counts.
- manifest.json    binds every file to the release, the adapted input, the policy, the registry, the notes, the
                   evidence files and every builder script.

Nothing typed: every value is read or counted. The only record-level columns read are the edition, the recorded sex
and the finish time; no name, bib, record id or person id is read into an output. Two builds give the same bytes (no
clock time). A rebuild whose counts differ from the manifest already in --out prints the change and fails unless
--accept-counts (a reviewed refresh only).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import races_common as rc  # noqa: E402
from races_common import RacesError, fail  # noqa: E402

SCRIPTS = ('build_races.py', 'races_common.py')
MEMBERS = ('race_records.parquet', 'EDITIONS.json')
SCHEMA_VERSION = 1

# The course pages the site had before this adoption (lib/analytics-policy.ts COURSE_SLUGS at fbe410786, read
# 2026-11-14). Plan decision D15: each keeps its page whatever it has left; their addresses never change.
COURSE_SLUGS_BEFORE = ('amsterdam', 'auckland', 'austin', 'barcelona', 'berlin', 'boston', 'chicago', 'copenhagen', 'dubai', 'eindhoven', 'frankfurt',
                       'gold-coast', 'hamburg', 'helsinki', 'london', 'madrid', 'new-york', 'oslo', 'paris', 'prague', 'rotterdam', 'singapore',
                       'stockholm', 'sydney', 'valencia', 'warsaw', 'washington')
RESERVED_SLUGS = ('all',)

# Code lists: a data file stores the position in these lists. The tiers, split tiers and timing classes, their order
# and their words are those of lib/tiers.ts, the site's one module for them (plan decision D16); the builder cannot
# import it, so scripts/verify-races.cjs holds every list, word and class below to the module's.
TIERS = ('stamped', 'stamped_weaker_source', 'partial', 'unverified', 'held_for_review')
BADGE_TIERS = ('stamped', 'stamped_weaker_source')
SPLIT_TIERS = ('splits', 'finish_time_only')
USES = ('counted', 'own_record', 'recorded_times_only')
CATEGORIES = ('finish_time_only', 'held_for_review', 'unverified', 'partial_coverage', 'invalid_split_grid', 'unreconciled_hold', 'selected_field',
              'mixed_distance_list', 'incomplete_ingestion')
TIMINGS = ('chip', 'chip_fallback', 'gun', 'mixed', 'not_stated')
PAGES = ('course', 'results', 'row')
REVIEWS = ('none', 'possible_duplicate', 'copy')
# The words lib/tiers.ts gives a tier, a split tier and a timing class: only these are written in words (the edition
# table); an edition with checkpoint times and one not timed by the gun say nothing more.
TIER_WORDS = {'stamped': 'Verified', 'stamped_weaker_source': 'Verified, weaker source', 'partial': 'Partial results',
              'unverified': 'Unverified', 'held_for_review': 'Held for review'}
FINISH_TIMES_ONLY = 'Finish times only'
GUN_TIMES = 'Gun times'

# The producer's marathon timing-basis texts of this release, classed as lib/tiers.ts TIMING_BASES classes them (the
# linked-records contract's classes). An unknown text stops the build, so that it is classed there in a reviewed change.
TIMING_CLASS = {
    'chip': 'chip', 'chip (ot) as published': 'chip', 'real time as published': 'chip',
    'realTime (net) as published, else officialTime': 'chip_fallback', 'chip (clock if no chip)': 'chip_fallback',
    'chip (delta_net), clock if no chip': 'chip_fallback', 'chip (gun if no chip)': 'chip_fallback', 'chip time else gun': 'chip_fallback',
    'chip elapsed (gun if no chip)': 'chip_fallback', 'chip where published, else gun': 'chip_fallback', "net 'time' (gun if none)": 'chip_fallback',
    'gun': 'gun', 'mixed': 'mixed', 'unknown': 'not_stated', 'as published': 'not_stated', 'as published (Time)': 'not_stated', None: 'not_stated',
}
# Where the official count comes from, in words a visitor can read, by the start of the producer's source-type string.
# The first start that matches classes the string (all 72 strings of pace-notes-marathon-half-20261113-1113 that come
# with a count, read 2026-11-14); a string no start matches stops the build, so that it is classed in a reviewed change.
SOURCE_CLASS = (
    ('stats_site', 'A statistics site'),
    ('wikipedia_', 'A Wikipedia results table'),
    ('official_press_release', 'The organiser’s press release'),
    ('organizer press release', 'The organiser’s press release'),
    ('official_stats', 'The organiser’s statistics or results'),
    ('official_results', 'The organiser’s statistics or results'),
    ('official timing results list', 'The organiser’s statistics or results'),
    ('NYRR ', 'The organiser’s statistics or results'),
    ('government_stats', 'Government statistics'),
    ('peer_reviewed_paper', 'A peer-reviewed paper'),
    ('press/stats', 'A press report'),
    ('press (', 'A press report'),
)
NO_INDEPENDENT_COUNT = 'No independent count: the timing platform’s own result list'

# Floors (AGENTS rule 13: never lowered to keep a figure).
MIN_FINISHES = 100          # finishes behind any number of an edition
MIN_EDITIONS = 3            # editions behind any statement across editions
RESULTS_PAGE_EDITION = 100  # recorded results of a badge-verified edition that counts toward a results page
RESULTS_PAGE_TOTAL = 3000   # recorded results of the race in all
SEX_RECORDED = (9, 10)      # a share of women needs a recorded sex on at least nine tenths of the finishes
COVERAGE = (0.95, 1.05)     # a partial edition of the finish-time universe: finishes with a time / official count
NOT_ABOUT_GRID = ('incomplete_ingestion', 'mixed_distance_list', 'selected_field', 'unreconciled_hold')
ABOUT_GRID = ('finish_time_only', 'invalid_split_grid')

# Race flags the site reads, from the registry's flags (rule) and the notes file (reviewed).
FLAG_FROM_REGISTRY = {
    'virtual': lambda f: 'virtual_in_title' in f,
    'cancelled': lambda f: 'cancelled_in_title' in f,
    'placeholder': lambda f: 'placeholder_place' in f,
    'not_a_marathon_title': lambda f: 'no_marathon_word_in_title' in f and 'other_event_in_title' in f,
    'hand_cycle_title': lambda f: 'title_names_a_hand_cycle_race' in f,
    'mountain_or_trail': lambda f: 'mountain_or_trail_course' in f or 'trail_or_mountain_word_in_title' in f,
    'two_races': lambda f: 'several_race_names' in f,
}
FLAGS = tuple(FLAG_FROM_REGISTRY)
BLOCKING_FLAGS = ('virtual', 'cancelled', 'placeholder', 'not_a_marathon_title', 'hand_cycle_title')
NOTE_FLAGS = ('virtual', 'cancelled', 'placeholder', 'not_a_marathon_title')
RULINGS = ('pending', 'set_aside', 'keep_both')
# Where a race date comes from: the weather row, a reviewed entry resting on the producer's own note, or a reviewed
# entry resting on a cited source outside the release (plan decision D27). Anything else stops the build.
DATE_SOURCES = (None, 'weather', 'reviewed', 'external')
# Reviewed notes on an edition of a listed pair, and the reasons an edition is set aside (the lead's rulings of 2026-11-14).
EDITION_NOTES = ('one_list_two_years', 'one_race_two_keys', 'repeated_finish_times')

RULES = {
    'universe': 'every marathon edition with at least one written row in the adapted input (an edition of the release with no row never appears)',
    'race': 'a race is an entry of the frozen race registry; its label is the pipeline’s `city`, its slug the registry’s, shown only when the race has a page',
    'results': 'recorded results = written rows of the edition; finishes = written rows with a finish time',
    'use': ('counted = the edition policy counts it (it supplies pooled pacing statistics); own_record = not counted, but a record keeps its own pacing view; '
            'recorded_times_only = every other edition; `category` is the policy’s category of an edition that is not counted'),
    'timing': ('the producer’s timing basis classed as lib/tiers.ts classes it: chip (chip or net time), chip_fallback (chip or net time where the source '
               'has one, else gun or clock time), gun, mixed or not_stated'),
    'flags': ('virtual, cancelled, placeholder: the registry flags the title or place (virtual_in_title, cancelled_in_title, placeholder_place) or the notes file '
              'flags the race; not_a_marathon_title: the registry finds no marathon word in the title and another event named in it, or the notes file flags '
              'it; hand_cycle_title: the registry’s reviewed flag (the title is never printed beside a runner); mountain_or_trail and two_races are for '
              'information. The notes file may clear a flag the rule gives, with its evidence. A race with virtual, cancelled, placeholder, '
              'not_a_marathon_title or hand_cycle_title has no page unless the notes file records the lead’s ruling that allows it'),
    'aliases': ('for the list’s search only, never shown as a name: the notes file holds a reviewed table of place words as the release writes them and their '
                'common English names; a race takes the alias when its label, name or place holds the word and none of them holds the alias. A difference '
                'of accents alone needs no alias: the search folds accents'),
    'page': (f'course = {MIN_EDITIONS} or more counted editions, or one of the {len(COURSE_SLUGS_BEFORE)} course pages the site had before this adoption whatever it has '
             f'left; results = not a course page, {MIN_EDITIONS} or more badge-verified editions (stamped or stamped_weaker_source) of at least {RESULTS_PAGE_EDITION} '
             f'recorded results each, and at least {RESULTS_PAGE_TOTAL} recorded results in all; row = every other race. An edition set aside as a copy counts '
             'toward nothing'),
    'finish_time_universe': ('plan decision D22: an edition whose tier is stamped or stamped_weaker_source, or partial with the release’s finishes between 95% and '
                             '105% of the official count (both ends included), and that the edition policy does not list as selected_field, '
                             'mixed_distance_list, incomplete_ingestion or unreconciled_hold; any split tier'),
    'edition_numbers': (f'only for an edition of the finish-time universe with at least {MIN_FINISHES} finishes: the median and the quartiles of its finish '
                        'times (linear interpolation between order statistics), and the share of women among the finishes with a recorded sex of F or M '
                        f'when those are at least {MIN_FINISHES} and at least nine tenths of the finishes. Sex is the published sex or the published category, '
                        'never a name. An edition outside the universe lists its year, tier, split tier, use and recorded results'),
    'reading': (f'median finish in a typical verified year = the median of the edition medians over the race’s badge-verified editions of the finish-time '
                f'universe with at least {MIN_FINISHES} finishes; stated only with {MIN_EDITIONS} or more such editions, else null. Where the registry gives a '
                'label a series note, the reading is per series and the label has none'),
    'duplicates': ('an edition the notes file sets aside as a copy (the lead’s ruling on a pair of the duplicate-edition audit) is listed with review `copy` '
                   'and, in `set_aside_editions`, the edition kept; it carries no number, counts toward no total, floor, page type or reading, and is not '
                   'shown on a page as an edition of the race; a pair still pending is listed with review `possible_duplicate` and changes nothing else'),
    'left_out': ('a race with no live edition (every edition set aside as a copy) is left out of `races`: it has no results to list. Its editions are '
                 'kept under `left_out`, so that every edition with rows is in the file exactly once'),
    'order': 'races are in registry order (by race id); a race’s editions by year',
}


def log(message: str) -> None:
    print(message, flush=True)


# ---------------------------------------------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------------------------------------------
@dataclass
class Inputs:
    """Everything the build reads, already checked against each other."""
    source: Path
    tag: str
    meta: dict                 # the adapted input's identity (races_common.adapted_input)
    editions: list             # EDITIONS.json `editions`
    policy: dict
    policy_path: Path
    published_policy: dict
    published_policy_path: Path
    registry: dict
    registry_path: Path
    notes: dict
    notes_path: Path
    audit: dict
    audit_path: Path
    sensitivity: dict
    sensitivity_path: Path
    facts: dict | None         # the pipeline's per-edition facts (edition-policy-review.json), when the notes name it
    facts_path: Path | None
    root: Path = rc.ROOT       # the repository the inputs were read under: file names in the manifest are relative to it
    without_results: int = 0   # EDITIONS.json `not_written`: editions the release names that have no written row
    digests: dict = field(default_factory=dict)


def _read(path: Path):
    data = Path(path).read_bytes()
    return json.loads(data), rc.bytes_sha256(data)


def _relative(path: Path, root: Path = rc.ROOT) -> str:
    path = Path(path).resolve()
    return path.relative_to(Path(root).resolve()).as_posix() if rc.inside(path, root) else path.name


def default_policy_path(tag: str) -> Path:
    """The frozen edition policy of `tag`; importing analysis/source_quality.py refuses the file unless its digest is
    the one that module pins."""
    import source_quality
    stamp = '_'.join(tag.split('-')[-2:])
    path = getattr(source_quality, f'POLICY_FILE_{stamp}', None)
    if path is None or tag not in source_quality.REVIEWED_POLICIES:
        fail(f'no frozen edition policy for {tag} in analysis/source_quality.py')
    return Path(path)


def load_inputs(source: Path, *, release_path: Path = rc.RELEASE_PATH, registry_path: Path = rc.REGISTRY_PATH, notes_path: Path = rc.NOTES_PATH,
                policy_path: Path | None = None, published_policy_path: Path | None = None, root: Path = rc.ROOT) -> Inputs:
    source = Path(source)
    if rc.inside(source, rc.ROOT):
        fail(f'{source} is inside the repository; record-level sources stay outside it')
    meta = rc.adapted_input(source)
    tag = json.loads(Path(release_path).read_text())['tag']
    if meta['release_tag'] != tag:
        fail(f"the adapted input is {meta['release_tag']}, the adopted release is {tag}")
    for name in MEMBERS:
        rc.check_member(source, meta['files'], name)
    manifest_sha = meta['input_manifest_sha256']
    document, _ = _read(source / 'EDITIONS.json')
    if document.get('tag') != tag:
        fail('EDITIONS.json of the adapted input is for another release')
    not_written = document.get('not_written')
    if not isinstance(not_written, list) or (meta['editions_without_rows'] is not None and meta['editions_without_rows'] != len(not_written)):
        fail('EDITIONS.json does not list the editions without a written row that the adapted input’s MANIFEST.json counts')

    policy_path = Path(policy_path) if policy_path else default_policy_path(tag)
    policy, policy_sha = _read(policy_path)
    if policy.get('tag') != tag or policy['inputs']['adapted_manifest_sha256'] != manifest_sha:
        fail(f"the edition policy was frozen on another adapted input ({policy['inputs'].get('adapted_manifest_sha256')}) than this one ({manifest_sha}); "
             're-adapt or refreeze the policy before any race build')
    registry, registry_sha = _read(registry_path)
    if registry.get('tag') != tag or registry.get('distance') != 'marathon':
        fail('the race registry is for another release or distance')
    if policy['inputs'].get('race_registry_sha256') != registry_sha:
        fail('the edition policy was frozen on another race registry than the one given')
    published_policy_path = Path(published_policy_path) if published_policy_path else root / 'public' / 'data' / 'edition-policy.json'
    published, published_sha = _read(published_policy_path)
    if published.get('release_tag') != tag or published.get('input_manifest_sha256') != manifest_sha:
        fail('public/data/edition-policy.json was built for another release or adapted input')

    notes, notes_sha = _read(notes_path)
    if notes.get('schema_version') != 1 or notes.get('tag') != tag:
        fail(f'{Path(notes_path).name} is for another release or schema; review it for {tag}')
    evidence = notes.get('evidence', {})
    paths = {}
    for key in ('duplicate_editions', 'cohort_sensitivity'):
        if not evidence.get(key):
            fail(f'{Path(notes_path).name}: evidence.{key} names no file')
        paths[key] = root / evidence[key]
    audit, audit_sha = _read(paths['duplicate_editions'])
    if audit.get('release_tag') != tag or audit.get('input_manifest_sha256') != manifest_sha:
        fail('the duplicate-edition audit was run on another release or adapted input; run analysis/races_duplicates.py again')
    for name, digest in audit.get('scripts', {}).items():
        if rc.file_sha256(root / name) != digest:
            fail(f'{name} changed after the duplicate-edition audit was run; run analysis/races_duplicates.py again')
    sensitivity, sensitivity_sha = _read(paths['cohort_sensitivity'])
    if sensitivity.get('release_tag') != tag or sensitivity.get('input_manifest_sha256') != manifest_sha or sensitivity.get('frozen_policy_sha256') != policy_sha:
        fail('the cohort sensitivity evidence is for another release, adapted input or edition policy')
    facts = facts_path = facts_sha = None
    if evidence.get('edition_facts'):
        facts_path = root / evidence['edition_facts']
        facts, facts_sha = _read(facts_path)
        if facts.get('tag') != tag or facts.get('frozen_policy_sha256') != policy_sha:
            fail('the edition facts evidence is for another release or edition policy')
    digests = {'policy': policy_sha, 'published_policy': published_sha, 'registry': registry_sha, 'notes': notes_sha, 'audit': audit_sha,
               'sensitivity': sensitivity_sha, 'facts': facts_sha,
               'members': {name: meta['files'][name]['sha256'] for name in MEMBERS}}
    return Inputs(source=source, tag=tag, meta=meta, editions=document['editions'], without_results=len(not_written), policy=policy, policy_path=policy_path, published_policy=published,
                  published_policy_path=published_policy_path, registry=registry, registry_path=Path(registry_path), notes=notes, notes_path=Path(notes_path),
                  audit=audit, audit_path=paths['duplicate_editions'], sensitivity=sensitivity, sensitivity_path=paths['cohort_sensitivity'],
                  facts=facts, facts_path=facts_path, root=Path(root), digests=digests)


# ---------------------------------------------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------------------------------------------
def source_words(source_type, official) -> str | None:
    """Where an official count comes from, in words; None when there is no count."""
    if official is None:
        return None
    text = source_type or ''
    for prefix, words in SOURCE_CLASS:
        if text.startswith(prefix):
            return words
    fail(f'the official source type {source_type!r} is not classed in analysis/build_races.py SOURCE_CLASS; class it in a reviewed change')


def duplicate_states(notes: dict, audit: dict, known: set) -> dict:
    """(label, year) -> ('possible_duplicate', other) or ('copy', original), from the notes' rulings. The reviewed list
    must hold exactly the audit's pairs."""
    pair_key = lambda a, b: tuple(sorted([(a[0], int(a[1])), (b[0], int(b[1]))]))  # noqa: E731
    audited = {pair_key((p['a']['city'], p['a']['year']), (p['b']['city'], p['b']['year'])): p for p in audit['pairs']}
    reviewed = {}
    for entry in notes.get('duplicate_editions', []):
        editions = entry.get('editions') or []
        if len(editions) != 2 or any(len(e) != 2 for e in editions):
            fail(f'race-notes: a duplicate entry does not name two editions: {entry}')
        key = pair_key(*editions)
        if key in reviewed:
            fail(f'race-notes: the pair {key} is reviewed twice')
        if entry.get('ruling') not in RULINGS:
            fail(f"race-notes: the pair {key} has the ruling {entry.get('ruling')!r}; one of {RULINGS}")
        if entry['ruling'] == 'pending':
            if entry.get('set_aside') is not None:
                fail(f'race-notes: the pair {key} is pending and sets an edition aside')
        elif not entry.get('ruled_by') or not entry.get('ruled_on') or not entry.get('words'):
            fail(f'race-notes: the ruling on {key} needs ruled_by, ruled_on and the words of the ruling')
        if entry['ruling'] == 'set_aside' and tuple(entry.get('set_aside') or ()) not in {tuple(e) for e in editions}:
            fail(f'race-notes: the ruling on {key} must set aside one of its two editions')
        if entry['ruling'] == 'keep_both' and entry.get('set_aside') is not None:
            fail(f'race-notes: the pair {key} keeps both editions and sets one aside')
        reviewed[key] = entry
    if set(reviewed) != set(audited):
        missing, stale = sorted(set(audited) - set(reviewed)), sorted(set(reviewed) - set(audited))
        fail(f'race-notes: the reviewed duplicate list is not the audit’s list (not reviewed: {missing}; no longer listed by the audit: {stale})')
    states = {}
    for key, entry in sorted(reviewed.items()):
        for edition in key:
            if edition not in known:
                fail(f'race-notes: the duplicate pair {key} names an edition with no written row')
        if entry['ruling'] == 'pending':
            for edition, other in (key, key[::-1]):
                states.setdefault(edition, ('possible_duplicate', other))
        elif entry['ruling'] == 'set_aside':
            copy = (entry['set_aside'][0], int(entry['set_aside'][1]))
            original = key[1] if key[0] == copy else key[0]
            states[copy] = ('copy', original)
    for edition, (state, other) in states.items():
        if state == 'copy' and states.get(other, ('', None))[0] == 'copy':
            fail(f'race-notes: {edition} is set aside as a copy of {other}, which is itself set aside')
    return states


def set_aside_editions(notes: dict, states: dict) -> list[dict]:
    """The notes' `set_aside_editions` (label, year, the edition kept, the reason): the list another builder reads to
    skip a copy's rows. It must say exactly what the rulings say."""
    ruled = {edition: other for edition, (state, other) in states.items() if state == 'copy'}
    listed = {}
    for entry in notes.get('set_aside_editions', []):
        kept = entry.get('kept') or {}
        if not entry.get('label') or entry.get('year') is None or not kept.get('label') or kept.get('year') is None or entry.get('reason') not in EDITION_NOTES:
            fail(f'race-notes: a set-aside edition needs a label, a year, the edition kept and a reason of {EDITION_NOTES}: {entry}')
        key = (entry['label'], int(entry['year']))
        if key in listed:
            fail(f'race-notes: {key} is set aside twice')
        listed[key] = ((kept['label'], int(kept['year'])), entry['reason'])
    if {key: kept for key, (kept, _) in listed.items()} != ruled:
        fail(f'race-notes: set_aside_editions is not what the rulings on the duplicate pairs set aside ({sorted(ruled.items())})')
    return [{'label': key[0], 'year': key[1], 'kept': {'label': kept[0], 'year': kept[1]}, 'reason': reason} for key, (kept, reason) in sorted(listed.items())]


def edition_notes(notes: dict, audit: dict) -> dict:
    """(label, year) -> the reviewed note of an edition. A note may sit only on an edition of a pair the audit lists."""
    audited = {(side['city'], int(side['year'])) for pair in audit['pairs'] for side in (pair['a'], pair['b'])}
    out = {}
    for entry in notes.get('edition_notes', []):
        key = (entry.get('label'), int(entry.get('year', 0)))
        if key not in audited or entry.get('note') not in EDITION_NOTES or key in out:
            fail(f'race-notes: an edition note names, once, an edition of a pair the audit lists and a note of {EDITION_NOTES}: {entry}')
        out[key] = entry['note']
    return out


def edition_table(inputs: Inputs) -> list[dict]:
    """One dict per edition with rows, in (label, year) order: the release's facts, the policy's use, the finish-time
    universe, the timing class and the review state."""
    policy = inputs.policy
    counted = {(c, int(y)) for c, y in policy['counted']}
    listed = {(e['city'], int(e['year'])): e for e in policy['editions']}
    if counted & set(listed):
        fail('the edition policy counts and lists the same edition')
    published = {(row[0], int(row[1])): dict(zip(inputs.published_policy['columns'], row)) for row in inputs.published_policy['editions']}
    if set(published) != set(listed) or any(published[k]['category'] != listed[k]['category'] or bool(published[k]['own_record']) != bool(listed[k]['own_record'])
                                           for k in listed):
        fail('public/data/edition-policy.json does not list the editions of the frozen edition policy')
    known = {(e['city'], int(e['year'])) for e in inputs.editions}
    if len(known) != len(inputs.editions):
        fail('EDITIONS.json names an edition twice')
    if known != counted | set(listed):
        fail('the edition policy and EDITIONS.json name different editions with rows')
    states = duplicate_states(inputs.notes, inputs.audit, known)
    reviewed_notes = edition_notes(inputs.notes, inputs.audit)
    facts = None if inputs.facts is None else {(e['city'], int(e['year'])): e for e in inputs.facts['editions']}
    if facts is not None and set(facts) != known:
        fail('the edition facts evidence and EDITIONS.json name different editions')
    rows = []
    for e in sorted(inputs.editions, key=lambda e: (e['city'], int(e['year']))):
        key = (e['city'], int(e['year']))
        tier, split = e['verification_tier'], e['split_tier']
        if tier not in TIERS or split not in SPLIT_TIERS:
            fail(f'{key}: tier {tier!r} or split tier {split!r} is not one this family knows')
        if bool(e['verified_badge']) != (tier in BADGE_TIERS) or bool(e['weaker_source']) != (tier == 'stamped_weaker_source'):
            fail(f'{key}: the badge or weaker-source flag does not follow the tier')
        results, finishes = int(e['n_records']), int(e['n_finishes'])
        if results <= 0 or not 0 <= finishes <= results:
            fail(f'{key}: an edition with no written row, or more finishes than rows')
        if e['timing_basis'] not in TIMING_CLASS:
            fail(f"{key}: the timing basis {e['timing_basis']!r} is not classed in analysis/build_races.py TIMING_CLASS; class it in a reviewed change")
        if e['race_date_source'] not in DATE_SOURCES or (e['race_date'] is None) != (e['race_date_source'] is None):
            fail(f"{key}: the race date source {e['race_date_source']!r} is not one this family knows, or a date and its source do not come together")
        official = None if e['official_finishers'] is None else int(e['official_finishers'])
        if official is not None and official != e['official_finishers']:
            fail(f'{key}: the official count is not a whole number')
        coverage = None if not official else e['finishes_in_release'] / official
        entry = listed.get(key)
        category = None if entry is None else entry['category']
        if category is not None and category not in CATEGORIES:
            fail(f'{key}: the policy category {category!r} is not one this family knows')
        use = 'counted' if key in counted else 'own_record' if entry['own_record'] else 'recorded_times_only'
        tier_ok = tier in BADGE_TIERS or (tier == 'partial' and coverage is not None and COVERAGE[0] <= coverage <= COVERAGE[1])
        universe = tier_ok and category not in NOT_ABOUT_GRID
        # The same cross-checks analysis/linked_universe.py makes: this reading of D22 must agree with the policy.
        if key in counted and not (universe and split == 'splits'):
            fail(f'{key}: the policy counts an edition that the finish-time universe leaves out')
        if universe and key not in counted and category not in ABOUT_GRID:
            fail(f'{key}: in the finish-time universe but listed by the policy as {category}, which is not about its split grid')
        if tier == 'partial' and split == 'splits' and category not in NOT_ABOUT_GRID and (not tier_ok) != (category == 'partial_coverage'):
            fail(f'{key}: this module and the edition policy read the 5% coverage band differently')
        if facts is not None:
            f = facts[key]
            if (f['tier'], f['split_tier'], int(f['rows']), int(f['finishes']), bool(f['counted']), f.get('category'), bool(f.get('own_record'))) != \
                    (tier, split, results, finishes, key in counted, category, use == 'own_record'):
                fail(f'{key}: EDITIONS.json and the edition facts evidence disagree')
        state, other = states.get(key, ('none', None))
        rows.append({
            'label': e['city'], 'year': key[1], 'race_name': e['race'], 'race_id': e['race_id'], 'release_key': e['release_city'],
            'tier': tier, 'split_tier': split, 'results': results, 'finishes': finishes,
            'official': official, 'official_source_type': e['official_source_type'], 'official_source': source_words(e['official_source_type'], official),
            'coverage_pct': None if coverage is None else round(100 * coverage, 2),
            'hold_note': e['hold_note'] or None, 'release_note': e['release_note'] or None,
            'timing_basis': e['timing_basis'], 'timing': TIMING_CLASS[e['timing_basis']],
            'race_date': e['race_date'], 'race_date_source': e['race_date_source'],
            'use': use, 'category': category, 'reason': None if entry is None else entry['reason'],
            'universe': bool(universe), 'review': state, 'review_other': other, 'reviewed_note': reviewed_notes.get(key),
        })
    return rows


# ---------------------------------------------------------------------------------------------------------------
# Races
# ---------------------------------------------------------------------------------------------------------------
def race_flags(race: dict, noted: dict, cleared: dict | None = None) -> list[str]:
    """The flags of a race: what the rule reads from the registry's flags, plus the flags the notes add, less the
    rule-made flags the notes clear (each with its evidence)."""
    registry_flags = set(race.get('flags') or [])
    by_rule = {name for name, test in FLAG_FROM_REGISTRY.items() if test(registry_flags)}
    removed = set((cleared or {}).get(race['label'], []))
    if not removed <= by_rule:
        fail(f"race-notes: {race['label']}: a cleared flag ({sorted(removed - by_rule)}) is not one the rule gives the race")
    found = (by_rule - removed) | set(noted.get(race['label'], []))
    return [name for name in FLAGS if name in found]


def series_of(race: dict) -> list[dict] | None:
    """The registry's reviewed series note of a label that holds more than one race, as [{name, first_year, last_year}],
    or None. The registry writes the note; this accepts a list of entries with a name and a first and last year."""
    note = race.get('series')
    if not note:
        return None
    entries = note.get('series') if isinstance(note, dict) else note
    out = []
    for entry in entries:
        first, last = entry.get('first_year', entry.get('from')), entry.get('last_year', entry.get('to'))
        if not entry.get('name') or first is None or last is None or int(first) > int(last):
            fail(f"{race['label']}: a series entry needs a name and a first and last year: {entry}")
        out.append({'name': entry['name'], 'first_year': int(first), 'last_year': int(last)})
    out.sort(key=lambda s: s['first_year'])
    if len(out) < 2 or any(a['last_year'] >= b['first_year'] for a, b in zip(out, out[1:])):
        fail(f"{race['label']}: a series note needs two or more series whose years do not overlap")
    return out


def race_table(inputs: Inputs, editions: list[dict]) -> list[dict]:
    """One dict per race with rows, in registry order, with its editions, flags, aliases and page type. A race whose
    every edition is set aside as a copy is marked `left_out`: it is in no list of races."""
    notes = inputs.notes
    labels = {race['label'] for race in inputs.registry['races']}
    if len(labels) != len(inputs.registry['races']):
        fail('the race registry repeats a label')
    by_label = {}
    for e in editions:
        by_label.setdefault(e['label'], []).append(e)
    if set(by_label) != labels:
        fail(f'the race registry and the adapted input name different races ({len(labels ^ set(by_label))} differ)')
    noted, cleared, aliases, allowed = {}, {}, {}, {}
    for entry in notes.get('flags', []):
        if entry.get('label') not in labels or entry.get('flag') not in NOTE_FLAGS or not entry.get('evidence'):
            fail(f'race-notes: a flag needs a registry label, one of {NOTE_FLAGS} and its evidence: {entry}')
        noted.setdefault(entry['label'], []).append(entry['flag'])
    for entry in notes.get('clears', []):
        if entry.get('label') not in labels or entry.get('flag') not in FLAGS or not entry.get('evidence'):
            fail(f'race-notes: a cleared flag needs a registry label, one of {FLAGS} and its evidence: {entry}')
        cleared.setdefault(entry['label'], []).append(entry['flag'])
    for entry in notes.get('page_rulings', []):
        if entry.get('label') not in labels or entry.get('page') != 'allowed' or not entry.get('ruled_by') or not entry.get('ruled_on') or not entry.get('words'):
            fail(f'race-notes: a page ruling needs a registry label, page "allowed", ruled_by, ruled_on and the words of the ruling: {entry}')
        allowed[entry['label']] = entry
    # Search aliases: a reviewed table of words (a place name as the release writes it) and the common English name.
    # A race takes the alias when its label, name or place holds the word and none of them holds the alias.
    words = notes.get('aliases', [])
    if len({entry.get('word') for entry in words}) != len(words):
        fail('race-notes: an alias word is listed twice')
    for entry in words:
        if not entry.get('word') or not entry.get('alias') or not entry.get('evidence'):
            fail(f'race-notes: an alias needs the word it stands for, the alias and its evidence: {entry}')
        taken = 0
        for race in inputs.registry['races']:
            texts = [race['label'], race['name'], race.get('place') or '']
            if any(_has_word(text, entry['word']) for text in texts) and not any(_has_word(text, entry['alias']) for text in texts):
                aliases.setdefault(race['label'], []).append(entry['alias'])
                taken += 1
        if not taken:
            fail(f"race-notes: the alias {entry['alias']!r} stands for {entry['word']!r}, which no race needs (no label, name or place holds it without the alias)")
    races = []
    for race in inputs.registry['races']:
        own = sorted(by_label[race['label']], key=lambda e: e['year'])
        if any(e['race_id'] != race['race_id'] for e in own):
            fail(f"{race['label']}: an edition names another race id than the registry’s")
        if (len(own), sum(e['results'] for e in own), own[0]['year'], own[-1]['year']) != (race['editions'], race['rows'], race['first_year'], race['last_year']):
            fail(f"{race['label']}: the registry’s editions, rows or years differ from the adapted input")
        live = [e for e in own if e['review'] != 'copy']
        flags = race_flags(race, noted, cleared)
        counted = sum(1 for e in live if e['use'] == 'counted')
        verified = sum(1 for e in live if e['tier'] in BADGE_TIERS and e['results'] >= RESULTS_PAGE_EDITION)
        results = sum(e['results'] for e in live)
        before = race['slug'] in COURSE_SLUGS_BEFORE
        by_numbers = 'course' if counted >= MIN_EDITIONS or before else 'results' if verified >= MIN_EDITIONS and results >= RESULTS_PAGE_TOTAL else 'row'
        blocking = [f for f in flags if f in BLOCKING_FLAGS]
        blocked = bool(blocking) and race['label'] not in allowed
        if blocked and before:
            fail(f"{race['label']}: one of the course pages the site had carries the flag {blocking}; it needs the lead’s ruling in race-notes page_rulings")
        races.append({
            'label': race['label'], 'name': race['name'], 'place': race.get('place'), 'slug': race['slug'], 'labelled_by': race.get('labelled_by'),
            'registry_flags': list(race.get('flags') or []), 'flags': flags, 'aliases': aliases.get(race['label'], []),
            'page': 'row' if blocked or not live else by_numbers, 'withheld': by_numbers if blocked and live and by_numbers != 'row' else None,
            'page_before': before, 'series': series_of(race), 'editions': own, 'left_out': not live,
            'years': [live[0]['year'], live[-1]['year']] if live else None,
            'counted_editions': counted, 'verified_editions_100': verified, 'results': results, 'finishes': sum(e['finishes'] for e in live),
        })
    slugs = [race['slug'] for race in races]
    if len(set(slugs)) != len(slugs):
        fail('two races share a slug')
    missing = sorted(set(COURSE_SLUGS_BEFORE) - {race['slug'] for race in races if race['page'] == 'course'})
    if missing:
        fail(f'course pages the site had are not course pages now: {missing}')
    return races


def _has_word(text: str, word: str) -> bool:
    """Whether `text` holds `word` as whole words, accents and case aside (the registry's phrase check)."""
    import race_registry
    return race_registry.states(word, [text])


# ---------------------------------------------------------------------------------------------------------------
# Finish-time facts
# ---------------------------------------------------------------------------------------------------------------
def finish_stats(source: Path, wanted: list[tuple]) -> dict:
    """(label, year) -> finishes, the quartiles of the finish times and the finishes recorded as women and as men, for
    the editions in `wanted`. Reads the edition, the recorded sex and the finish time of each row, and nothing else."""
    if not wanted:
        return {}
    db = rc.connect()
    path = rc.quote(Path(source) / 'race_records.parquet')
    sexes = {row[0] for row in db.execute(f"SELECT DISTINCT sex FROM read_parquet('{path}')").fetchall()}
    if not sexes <= {'M', 'F', 'X', None}:
        fail(f'the adapted input records a sex this family does not class: {sorted(str(s) for s in sexes - {"M", "F", "X", None})}')
    db.execute('CREATE TEMP TABLE want (city VARCHAR, year BIGINT)')
    db.executemany('INSERT INTO want VALUES (?, ?)', [list(key) for key in wanted])
    rows = db.execute(f"""SELECT r.city, r.year, count(*) AS finishes, quantile_cont(r.fin, [0.25, 0.5, 0.75]) AS q,
          count(*) FILTER(WHERE r.sex = 'F') AS women, count(*) FILTER(WHERE r.sex = 'M') AS men
        FROM (SELECT city, year, sex, seconds(split_42_2km) AS fin FROM read_parquet('{path}')) r JOIN want w ON w.city = r.city AND w.year = r.year
        WHERE r.fin IS NOT NULL GROUP BY ALL""").fetchall()
    db.close()
    return {(city, int(year)): {'finishes': int(n), 'p25': float(q[0]), 'median': float(q[1]), 'p75': float(q[2]), 'women': int(women), 'men': int(men)}
            for city, year, n, q, women, men in rows}


def seconds_value(value: float, places: int = 2):
    """A time in seconds as published: a whole number as an integer, else the exact decimal (quartiles of whole seconds
    are multiples of 0.25, a median of medians a multiple of 0.125)."""
    rounded = round(value, places)
    if abs(rounded - value) > 1e-9:
        fail(f'a quantile of whole seconds is not a multiple of {10 ** -places}: {value!r}')
    return int(rounded) if float(rounded).is_integer() else rounded


def median_of(values: list) -> float:
    ordered = sorted(values)
    n = len(ordered)
    return float(ordered[n // 2]) if n % 2 else (ordered[n // 2 - 1] + ordered[n // 2]) / 2


def reading_of(editions: list[dict]) -> dict | None:
    """The race's reading over `editions` (already limited to one race or one series): the median finish in a typical
    verified year, or None under the floor."""
    used = [e for e in editions if e.get('median_s') is not None and e['tier'] in BADGE_TIERS]
    if len(used) < MIN_EDITIONS:
        return None
    medians = [e['median_s'] for e in used]
    timing = {}
    for e in used:
        timing[e['timing']] = timing.get(e['timing'], 0) + 1
    return {'measure': 'median_finish_in_a_typical_verified_year', 'median_s': seconds_value(median_of(medians), 3), 'editions': len(used),
            'years': [e['year'] for e in used], 'lowest_s': min(medians), 'highest_s': max(medians),
            'finishes': sum(e['finishes'] for e in used), 'timing': {name: timing[name] for name in TIMINGS if name in timing}}


def race_file(race: dict, stats: dict) -> dict:
    editions = []
    for e in race['editions']:
        row = {'year': e['year'], 'tier': e['tier'], 'split_tier': e['split_tier'], 'results': e['results'], 'use': e['use'], 'timing': e['timing'],
               'in_universe': e['universe'] and e['review'] != 'copy'}
        if e['category'] is not None:
            row['category'] = e['category']
        if e['review'] != 'none':
            row['review'] = e['review']
        if e['review'] == 'copy':
            row['copy_of'] = {'label': e['review_other'][0], 'year': e['review_other'][1]}
        if row['in_universe']:
            row['finishes'] = e['finishes']
            if e['finishes'] >= MIN_FINISHES:
                s = stats.get((e['label'], e['year']))
                if s is None or s['finishes'] != e['finishes']:
                    fail(f"{e['label']} {e['year']}: the finishes read from the records differ from EDITIONS.json")
                if not s['p25'] <= s['median'] <= s['p75']:
                    fail(f"{e['label']} {e['year']}: the quartiles are out of order")
                row['p25_s'], row['median_s'], row['p75_s'] = (seconds_value(s[k]) for k in ('p25', 'median', 'p75'))
                recorded = s['women'] + s['men']
                if recorded >= MIN_FINISHES and SEX_RECORDED[1] * recorded >= SEX_RECORDED[0] * e['finishes']:
                    row['women'] = {'n': s['women'], 'of': recorded, 'share': round(s['women'] / recorded, 4)}
                else:
                    row['women'] = None
        editions.append(row)
    out = {'schema_version': SCHEMA_VERSION, 'label': race['label'], 'name': race['name'], 'place': race['place'], 'slug': race['slug'], 'page': race['page'],
           'flags': race['flags'], 'editions': editions}
    # A reading reads the published rows, so it can never rest on a number the floors withheld.
    joined = [{**row, 'label': race['label']} for row in editions]
    if race['series']:
        out['series'] = []
        for s in race['series']:
            own = [row for row in joined if s['first_year'] <= row['year'] <= s['last_year']]
            out['series'].append({**s, 'years': [row['year'] for row in own], 'reading': reading_of(own)})
        outside = [row['year'] for row in joined if not any(s['first_year'] <= row['year'] <= s['last_year'] for s in race['series'])]
        if outside:
            fail(f"{race['label']}: editions {outside} are in none of the label’s series")
        out['reading'] = None
        out['reading_note'] = 'per_series'
    else:
        out['reading'] = reading_of(joined)
        out['reading_note'] = None if out['reading'] else 'fewer_than_three_verified_editions_of_100_finishes'
    return out


# ---------------------------------------------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------------------------------------------
EDITION_COLUMNS = ('year', 'tier', 'split_tier', 'results', 'finishes', 'use', 'category', 'timing', 'review')


def edition_row(e: dict) -> list:
    return [e['year'], TIERS.index(e['tier']), SPLIT_TIERS.index(e['split_tier']), e['results'], e['finishes'], USES.index(e['use']),
            None if e['category'] is None else CATEGORIES.index(e['category']), TIMINGS.index(e['timing']), REVIEWS.index(e['review'])]


def tier_counts(race: dict) -> dict:
    """The race's live editions by tier, tiers without an edition left out: what lib/tiers.ts `tierLine` takes to write a
    list row's tier line (it orders the tiers itself; a published object has its keys sorted)."""
    live = [e for e in race['editions'] if e['review'] != 'copy']
    return {tier: sum(1 for e in live if e['tier'] == tier) for tier in TIERS if any(e['tier'] == tier for e in live)}


def directory_file(races: list[dict], set_aside: list[dict]) -> dict:
    out = []
    for race in races:
        if race['left_out']:
            continue
        row = {'label': race['label'], 'name': race['name'], 'place': race['place'], 'page': race['page'],
               'years': race['years'], 'results': race['results'], 'finishes': race['finishes'], 'tiers': tier_counts(race),
               'editions': [edition_row(e) for e in race['editions']]}
        if race['page'] != 'row':
            row['slug'] = race['slug']
        if race['flags']:
            row['flags'] = race['flags']
        if race['aliases']:
            row['aliases'] = race['aliases']
        if race['withheld']:
            row['withheld'] = race['withheld']
        out.append(row)
    return {'schema_version': SCHEMA_VERSION, 'family': 'races', 'distance': 'marathon',
            'codes': {'tier': list(TIERS), 'split_tier': list(SPLIT_TIERS), 'use': list(USES), 'category': list(CATEGORIES), 'timing': list(TIMINGS),
                      'review': list(REVIEWS), 'page': list(PAGES), 'flags': list(FLAGS)},
            'edition_columns': list(EDITION_COLUMNS), 'races': out,
            'left_out': [{'label': race['label'], 'name': race['name'], 'place': race['place'], 'editions': [edition_row(e) for e in race['editions']]}
                         for race in races if race['left_out']],
            'set_aside_editions': set_aside}


def pages_file(races: list[dict]) -> dict:
    out = []
    for race in races:
        if race['page'] == 'row':
            continue
        live = [e for e in race['editions'] if e['review'] != 'copy']
        out.append({'label': race['label'], 'name': race['name'], 'place': race['place'], 'slug': race['slug'], 'page': race['page'],
                    'years': race['years'], 'editions': len(live), 'results': race['results'], 'finishes': race['finishes'],
                    'tiers': tier_counts(race),
                    'with_checkpoint_times': sum(1 for e in live if e['split_tier'] == 'splits'),
                    'counted_editions': race['counted_editions'], 'own_record_editions': sum(1 for e in live if e['use'] == 'own_record'),
                    'universe_editions': sum(1 for e in live if e['universe']), 'page_before': race['page_before'],
                    'flags': race['flags'], 'aliases': race['aliases']})
    return {'schema_version': SCHEMA_VERSION, 'family': 'races', 'distance': 'marathon', 'pages': out}


CSV_COLUMNS = ('race', 'race_name', 'place', 'year', 'tier', 'tier_in_words', 'split_tier', 'split_tier_in_words', 'recorded_results', 'finishes_with_a_time',
               'official_count', 'official_count_source', 'official_source_type', 'coverage_pct', 'use', 'not_counted_category', 'reason_not_counted',
               'timing', 'timing_in_words', 'timing_basis', 'race_date', 'race_date_source', 'hold_note', 'release_note', 'review', 'copy_of_race',
               'copy_of_year', 'reviewed_note', 'release_key')


def editions_csv(races: list[dict]) -> bytes:
    stream = io.StringIO()
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(CSV_COLUMNS)
    blank = lambda value: '' if value is None else value  # noqa: E731
    for race in sorted(races, key=lambda r: r['label']):
        for e in race['editions']:
            writer.writerow([race['label'], race['name'], blank(race['place']), e['year'], e['tier'], TIER_WORDS[e['tier']], e['split_tier'],
                             FINISH_TIMES_ONLY if e['split_tier'] == 'finish_time_only' else '', e['results'], e['finishes'], blank(e['official']),
                             blank(e['official_source']) if e['official'] is not None else NO_INDEPENDENT_COUNT,
                             blank(e['official_source_type']), blank(e['coverage_pct']), e['use'], blank(e['category']),
                             blank(e['reason']), e['timing'], GUN_TIMES if e['timing'] == 'gun' else '', blank(e['timing_basis']), blank(e['race_date']),
                             blank(e['race_date_source']), blank(e['hold_note']), blank(e['release_note']), '' if e['review'] == 'none' else e['review'],
                             e['review_other'][0] if e['review'] == 'copy' else '', e['review_other'][1] if e['review'] == 'copy' else '',
                             blank(e['reviewed_note']), e['release_key']])
    return stream.getvalue().encode()


def summary_file(inputs: Inputs, races: list[dict], editions: list[dict]) -> dict:
    left_out = [race for race in races if race['left_out']]
    races = [race for race in races if not race['left_out']]
    live = [e for e in editions if e['review'] != 'copy']
    tally = lambda own: {'races': len({e['label'] for e in own}), 'editions': len(own), 'results': sum(e['results'] for e in own),  # noqa: E731
                         'finishes': sum(e['finishes'] for e in own)}
    cells = []
    for tier in TIERS:
        for split in SPLIT_TIERS:
            own = [e for e in live if e['tier'] == tier and e['split_tier'] == split]
            if own:
                cells.append({'tier': tier, 'split_tier': split, **tally(own)})
    counted = [e for e in live if e['use'] == 'counted']
    readings = inputs.sensitivity['readings']
    policy_reading = readings['policy']
    if (policy_reading['eligible_editions'], policy_reading['eligible_cities']) != (len(counted), len({e['label'] for e in counted})):
        fail('the cohort sensitivity evidence counts other editions or races than the edition policy')
    if inputs.published_policy['cohort']['eligible'] != policy_reading['eligible_finishes']:
        fail('the cohort sensitivity evidence and public/data/edition-policy.json state different counted finishes')
    reading = lambda r: {'editions': r['eligible_editions'], 'races': r['eligible_cities'], 'finishes': r['eligible_finishes'],  # noqa: E731
                         'sustained_slowdown': r['sustained_slowdown'], 'sustained_slowdown_pct': r['sustained_slowdown_pct']}
    universe = [e for e in live if e['universe']]
    pending = sorted({tuple(sorted([(e['label'], e['year']), e['review_other']])) for e in editions if e['review'] == 'possible_duplicate'})
    copies = [e for e in editions if e['review'] == 'copy']
    return {
        'schema_version': SCHEMA_VERSION, 'family': 'races', 'distance': 'marathon',
        'races': {
            'total': {'n': len(races), 'what': 'marathon races with at least one recorded result in an edition that is not set aside as a copy'},
            'by_page': {page: sum(1 for r in races if r['page'] == page) for page in PAGES},
            'course_pages_kept': {'n': sum(1 for r in races if r['page_before']), 'what': 'course pages the site had before this release, all kept'},
            'flagged': {'n': sum(1 for r in races if any(f in BLOCKING_FLAGS for f in r['flags'])),
                        'what': 'races whose title or place is flagged virtual, cancelled, placeholder, not a marathon title or a hand-cycle title'},
            'page_withheld_by_a_flag': sum(1 for r in races if r['withheld']),
            'left_out': {'n': len(left_out), 'what': 'races whose every edition is set aside as a copy; they are in no count above and in no list'},
        },
        'editions': {
            'total': {'n': len(live), 'results': sum(e['results'] for e in live), 'finishes': sum(e['finishes'] for e in live),
                      'what': ('marathon editions with at least one recorded result; results are recorded results, finishes those with a finish time; in a '
                               'breakdown, races are the races with at least one such edition')},
            'by_tier_and_split_tier': cells,
            'by_tier': {tier: tally([e for e in live if e['tier'] == tier]) for tier in TIERS if any(e['tier'] == tier for e in live)},
            'by_split_tier': {split: tally([e for e in live if e['split_tier'] == split]) for split in SPLIT_TIERS if any(e['split_tier'] == split for e in live)},
            'by_timing': {timing: tally([e for e in live if e['timing'] == timing]) for timing in TIMINGS if any(e['timing'] == timing for e in live)},
            'without_results': {'n': inputs.without_results, 'what': 'editions the release names that have no recorded result; they are listed nowhere and are in no count here'},
            'badge_verified': {**tally([e for e in live if e['tier'] in BADGE_TIERS]), 'what': 'editions whose tier is stamped or stamped_weaker_source; races with at least one'},
            'by_use': {use: {'editions': sum(1 for e in live if e['use'] == use), 'results': sum(e['results'] for e in live if e['use'] == use)} for use in USES},
            'not_counted_by_category': {c: sum(1 for e in live if e['category'] == c) for c in CATEGORIES if any(e['category'] == c for e in live)},
        },
        'counted': {**reading(policy_reading), 'what': ('editions that supply pooled pacing statistics under the edition policy; finishes are those that pass '
                                                        'the timing checks; a sustained slowdown as /methodology defines it')},
        'sensitivity': {
            'verified_tiers_only': {**reading(readings['verified_tiers_only']), 'what': 'the same without partial editions'},
            'without_weaker_source_editions': {**reading(readings['without_weaker_source_editions']), 'what': 'the same without editions stamped against a weaker source'},
            'by_tier': {tier: reading(r) for tier, r in inputs.sensitivity['policy_by_tier'].items()},
        },
        'finish_time_universe': {'editions': len(universe), 'races': len({e['label'] for e in universe}), 'finishes': sum(e['finishes'] for e in universe),
                                 'editions_with_100_finishes': sum(1 for e in universe if e['finishes'] >= MIN_FINISHES),
                                 'what': 'editions whose finish times a linked analysis or a results page may read'},
        'notes': {
            'what': 'the producer’s notes, for /methodology only',
            'hold': [{'label': e['label'], 'year': e['year'], 'tier': e['tier'], 'note': e['hold_note']} for e in editions if e['hold_note']],
            'release': [{'label': e['label'], 'year': e['year'], 'tier': e['tier'], 'note': e['release_note']} for e in editions if e['release_note']],
        },
        'duplicates': {'pairs_listed_by_the_audit': len(inputs.audit['pairs']), 'pairs_pending': len(pending),
                       'pairs_kept_as_two_editions': sum(1 for entry in inputs.notes.get('duplicate_editions', []) if entry.get('ruling') == 'keep_both'),
                       'editions_set_aside': len(copies), 'results_set_aside': sum(e['results'] for e in copies),
                       'what': 'pairs of editions that hold the same finishers; an edition set aside as a copy is in no count above'},
    }


BANNED_KEYS = frozenset({'runner', 'runner_id', 'runner_name', 'record_id', 'person_id', 'bib', 'id', 'match_key', 'age', 'yob'})


def check_published(value, where: str) -> None:
    """No identifier key and no person id anywhere in a published JSON value."""
    if isinstance(value, dict):
        for key, inner in value.items():
            if key in BANNED_KEYS:
                fail(f'{where}: the key {key!r} may not be published')
            check_published(inner, where)
    elif isinstance(value, list):
        for inner in value:
            check_published(inner, where)
    elif isinstance(value, str) and ('p51_' in value or 'p4_' in value):
        fail(f'{where}: a person id may not be published')
    elif isinstance(value, float) and value != value:
        fail(f'{where}: not a number')


def build(inputs: Inputs) -> tuple[dict, dict]:
    """(file name -> bytes, counts) for the given inputs."""
    editions = edition_table(inputs)
    races = race_table(inputs, editions)
    states = {(e['label'], e['year']): (e['review'], e['review_other']) for e in editions if e['review'] != 'none'}
    set_aside = set_aside_editions(inputs.notes, states)
    wanted = [(e['label'], e['year']) for race in races if race['page'] != 'row' for e in race['editions']
              if e['universe'] and e['review'] != 'copy' and e['finishes'] >= MIN_FINISHES]
    stats = finish_stats(inputs.source, wanted)
    files = {'directory.json': directory_file(races, set_aside), 'pages.json': pages_file(races), 'summary.json': summary_file(inputs, races, editions)}
    race_files = {}
    for race in races:
        if race['page'] != 'row':
            race_files[f"race/{race['slug']}.json"] = race_file(race, stats)
    out = {}
    for name, value in {**files, **race_files}.items():
        check_published(value, name)
        out[name] = rc.encode(value)
    out['editions.csv'] = editions_csv(races)
    readings = [f['reading'] for f in race_files.values()] + [s['reading'] for f in race_files.values() for s in f.get('series', [])]
    pages = [race for race in races if race['page'] != 'row']
    listed = [race for race in races if not race['left_out']]
    counts = {
        'races': len(listed), 'races_left_out': len(races) - len(listed), 'editions': len(editions), 'results': sum(e['results'] for e in editions), 'finishes': sum(e['finishes'] for e in editions),
        'pages': {page: sum(1 for r in listed if r['page'] == page) for page in PAGES},
        'counted_editions': sum(1 for e in editions if e['use'] == 'counted'), 'own_record_editions': sum(1 for e in editions if e['use'] == 'own_record'),
        'universe_editions': sum(1 for e in editions if e['universe']),
        'editions_with_numbers': sum(1 for f in race_files.values() for row in f['editions'] if 'median_s' in row),
        'editions_with_a_share_of_women': sum(1 for f in race_files.values() for row in f['editions'] if row.get('women')),
        'readings': sum(1 for r in readings if r), 'races_with_a_withheld_page': sum(1 for r in races if r['withheld']),
        'duplicate_pairs': len(inputs.audit['pairs']), 'editions_set_aside': sum(1 for e in editions if e['review'] == 'copy'),
    }
    review = {
        'course_pages_before': [{'slug': r['slug'], 'label': r['label'], 'editions': len(r['editions']), 'counted_editions': r['counted_editions'],
                                 'own_record_editions': sum(1 for e in r['editions'] if e['use'] == 'own_record'),
                                 'universe_editions': sum(1 for e in r['editions'] if e['universe']), 'results': r['results']}
                                for r in sorted(races, key=lambda r: r['slug']) if r['page_before']],
        'pages_without_a_reviewed_label': sorted(r['label'] for r in pages if r['labelled_by'] not in ('plain key', 'reviewed label')),
        'page_slugs_over_30_characters': sorted(r['slug'] for r in pages if len(r['slug']) > 30),
        'page_slugs_reserved': sorted(r['slug'] for r in pages if r['slug'] in RESERVED_SLUGS),
        'flagged_races': [{'label': r['label'], 'flags': [f for f in r['flags'] if f in BLOCKING_FLAGS], 'withheld': r['withheld'], 'editions': len(r['editions']),
                           'results': r['results']} for r in listed if any(f in BLOCKING_FLAGS for f in r['flags'])],
        'races_left_out': [r['label'] for r in races if r['left_out']],
    }
    return out, {'counts': counts, 'review': review}


def manifest(inputs: Inputs, out: dict, built: dict) -> dict:
    root_file = lambda path: _relative(path, inputs.root)  # noqa: E731
    return {
        'schema_version': SCHEMA_VERSION, 'family': 'races', 'distance': 'marathon',
        'release_tag': inputs.tag, 'input_as_of': inputs.meta['input_as_of'],
        'input': {'manifest_sha256': inputs.meta['input_manifest_sha256'], 'members': inputs.digests['members']},
        'policy': {'file': root_file(inputs.policy_path), 'sha256': inputs.digests['policy'],
                   'published_list': {'file': root_file(inputs.published_policy_path), 'sha256': inputs.digests['published_policy']}},
        'registry': {'file': root_file(inputs.registry_path), 'sha256': inputs.digests['registry']},
        'notes': {'file': root_file(inputs.notes_path), 'sha256': inputs.digests['notes']},
        'evidence': {
            'duplicate_editions': {'file': root_file(inputs.audit_path), 'sha256': inputs.digests['audit']},
            'cohort_sensitivity': {'file': root_file(inputs.sensitivity_path), 'sha256': inputs.digests['sensitivity']},
            **({'edition_facts': {'file': root_file(inputs.facts_path), 'sha256': inputs.digests['facts']}} if inputs.facts_path else {}),
        },
        'scripts': {f'analysis/{name}': rc.file_sha256(rc.ANALYSIS / name) for name in SCRIPTS},
        'rules': RULES,
        'floors': {'finishes_behind_a_number': MIN_FINISHES, 'editions_behind_a_statement': MIN_EDITIONS, 'results_page_edition_results': RESULTS_PAGE_EDITION,
                   'results_page_results': RESULTS_PAGE_TOTAL, 'sex_recorded_share': list(SEX_RECORDED), 'coverage': list(COVERAGE)},
        'course_slugs_before': list(COURSE_SLUGS_BEFORE),
        'counts': built['counts'], 'review': built['review'],
        'files': {name: {'bytes': len(data), 'sha256': rc.bytes_sha256(data)} for name, data in sorted(out.items())},
    }


def compare_counts(out: Path, new: dict, accept: bool) -> None:
    path = out / 'manifest.json'
    if not path.exists():
        return
    old = json.loads(path.read_text())
    if old.get('release_tag') != new['release_tag'] or old.get('counts') == new['counts']:
        return
    changes = [f'{key}: {json.dumps(old["counts"].get(key))} -> {json.dumps(value)}' for key, value in new['counts'].items() if old.get('counts', {}).get(key) != value]
    print('count changes against the published manifest:\n  ' + '\n  '.join(changes), file=sys.stderr)
    if not accept:
        fail('counts changed; review them, then rebuild with --accept-counts')


def write(out: Path, files: dict, meta: dict) -> None:
    """Write every file, then the manifest; remove race files of an earlier build that are no longer built."""
    out = Path(out)
    wanted = set(files) | {'manifest.json'}
    for name, data in files.items():
        path = out / name
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + '.tmp')
        tmp.write_bytes(data)
        tmp.replace(path)
    tmp = out / 'manifest.json.tmp'
    tmp.write_bytes(rc.encode(meta))
    tmp.replace(out / 'manifest.json')
    for path in sorted(out.rglob('*')):
        if path.is_file() and path.relative_to(out).as_posix() not in wanted:
            path.unlink()


def run(source: Path, out: Path = rc.OUTPUT, accept_counts: bool = False, **paths) -> dict:
    started = time.time()
    inputs = load_inputs(source, **paths)
    log(f'races: the inputs agree with each other ({time.time() - started:.0f} s)')
    files, built = build(inputs)
    meta = manifest(inputs, files, built)
    compare_counts(Path(out), meta, accept_counts)
    write(Path(out), files, meta)
    sizes = {name: len(data) for name, data in files.items() if not name.startswith('race/')}
    sizes['race/*.json'] = sum(len(data) for name, data in files.items() if name.startswith('race/'))
    log(json.dumps({'counts': built['counts'], 'bytes': sizes, 'seconds': round(time.time() - started)}))
    return meta


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--input', type=Path, required=True, help='the adapted marathon input (FULL or CORE folder)')
    parser.add_argument('--out', type=Path, default=rc.OUTPUT)
    parser.add_argument('--accept-counts', action='store_true', help='accept reviewed count changes (a refresh only)')
    args = parser.parse_args(argv)
    try:
        run(args.input.expanduser(), args.out, args.accept_counts)
    except RacesError as error:
        print(f'build_races: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
