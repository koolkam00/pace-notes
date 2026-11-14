"""Reviewed, dated entries of the linked-records family (docs/LINKED_RECORDS.md, "Reviews"; rulings of the lead of
2026-11-14 on the review evidence). No frozen number moves here: the 6% screen holds what it held.

Two kinds of entry, each checked against the data on every build:

- **A held edition released by review.** The screen cannot tell an extreme year from a faulty list, so a held edition
  is reviewed against measurements that use no person link, and is released only if all of the conditions of
  `review_of` hold. A released edition gets its reading and verdict like any other and carries `reviewed_release`.
  The build stops if the screen holds a reviewed edition that no longer meets every condition.
- **A note of the producer that states a virtual run or another course.** Every edition of the finish-time universe
  is searched (`NOTE_FIELDS`, `NOTE_PATTERNS`); every sentence found must be on the reviewed list with a ruling. An
  `excluded` edition enters no fit of the pair model, no comparison group and no race reading; a `kept` sentence was
  read and does not state either. The build stops on a sentence that is not listed, and on a listed sentence the
  notes no longer hold.

scripts/verify-linked.cjs holds its own copy of the releases and of the exclusions.
"""
from __future__ import annotations

import re

import pandas as pd

import linked_common as lc
from linked_common import MIN_EDITIONS, fail, num, pct

OFFICIAL_TOLERANCE = 0.005     # the release's finishes within 0.5% of the official count

# ---------------------------------------------------------------------------------------------------------------
# Held editions released by review (the 6% bar itself does not move)
# ---------------------------------------------------------------------------------------------------------------
REVIEWED_RELEASES = (
    {'label': 'New York', 'year': 2022, 'reviewer': 'lead', 'reviewed_on': '2026-11-14'},
)


def review_of(row, t: pd.DataFrame, editions: pd.DataFrame, field_share: pd.DataFrame, distance_pct: float) -> dict:
    """The measurements a held edition is reviewed against, none of which uses a person link, and whether each
    condition of a release holds. `row`: the edition's row of the unit table `t`; `editions` is indexed by edition
    code; `field_share`: counted editions (code, eligible, slow); `distance_pct`: its distance from its group's median.

    A release needs all six: (1) tier stamped; (2) its timing code is the code of every other edition of its
    comparison group; (3) the release's finishes within 0.5% of the official count; (4) held on the slow side;
    (5) counted, and its whole-field sustained-slowdown share the highest of its race's counted years (at least three,
    no tie); (6) a weather row, and its start temperature the highest of its race's fitted years with a weather row
    (at least three, no tie). A measurement that is missing fails its condition: there is no release path without it."""
    code = int(row.code)
    me = editions.loc[code]
    group = t[(t.rkey == row.rkey) & (t.basis == row.basis) & (t.code != code)]
    ratio = None if pd.isna(me.official_ratio) else float(me.official_ratio)
    out = {
        'stamped': bool(row.tier == 'stamped'),
        'timing_as_its_group': bool(len(group) >= MIN_EDITIONS - 1 and set(group.timing) == {row.timing}),
        'official_difference_pct': None if ratio is None else num(100.0 * (ratio - 1.0), 2),
        'official_within_half_pct': bool(ratio is not None and abs(ratio - 1.0) <= OFFICIAL_TOLERANCE),
        'slow_side': bool(distance_pct > lc.OUTLIER_PCT),
    }
    # the whole field's sustained-slowdown share, over the race's counted years
    share = field_share.set_index('code')
    counted = editions[(editions.rkey == row.rkey) & editions.counted]
    shares = {int(c): float(share.loc[c, 'slow']) / float(share.loc[c, 'eligible']) for c in counted.code}
    mine = shares.get(code)
    out['field_share_pct'] = None if mine is None else num(100.0 * mine, 2)
    out['counted_years'] = len(shares)
    out['counted_years_as_high'] = None if mine is None else sum(1 for c, v in shares.items() if c != code and v >= mine)
    out['field_share_highest'] = bool(mine is not None and len(shares) >= MIN_EDITIONS and out['counted_years_as_high'] == 0)
    # the start temperature of the weather row, over the race's fitted years that have one
    fitted = editions.loc[t[t.rkey == row.rkey].code]
    temps = {int(c): float(v) for c, v in zip(fitted.code, fitted.temp_start) if not pd.isna(v)}
    warm = temps.get(code)
    out['start_temperature_c'] = None if warm is None else num(warm, 2)
    out['weather_years'] = len(temps)
    out['weather_years_as_warm'] = None if warm is None else sum(1 for c, v in temps.items() if c != code and v >= warm)
    out['start_warmest'] = bool(warm is not None and len(temps) >= MIN_EDITIONS and out['weather_years_as_warm'] == 0)
    out['meets_every_condition'] = all(out[k] for k in CONDITIONS)
    return out


CONDITIONS = ('stamped', 'timing_as_its_group', 'official_within_half_pct', 'slow_side', 'field_share_highest', 'start_warmest')


def releases(t: pd.DataFrame, held, reviews: dict, editions: pd.DataFrame, entries=None) -> dict:
    """code -> the review entry, for the reviewed releases that apply on this build: the screen holds the edition and
    it meets every condition. Stops when the screen holds a reviewed edition that fails one, or when an entry names an
    edition the finish-time universe does not hold. `reviews`: code -> review_of(...) for the held editions."""
    entries = REVIEWED_RELEASES if entries is None else entries
    out = {}
    held_codes = set(t.code[held].tolist())
    for entry in entries:
        match = editions[(editions.label == entry['label']) & (editions.year == entry['year'])]
        if len(match) != 1 or not bool(match.in_f.iloc[0]):
            fail(f"the reviewed release of {entry['label']} {entry['year']} names an edition the finish-time universe does not hold")
        code = int(match.code.iloc[0])
        if code not in held_codes:
            continue        # the screen does not hold it on this build: an ordinary edition, and the entry is not needed
        review = reviews[code]
        if not review['meets_every_condition']:
            failed = ', '.join(k for k in CONDITIONS if not review[k])
            fail(f"the reviewed release of {entry['label']} {entry['year']} no longer meets its conditions ({failed}): review it again")
        out[code] = entry
    return out


# ---------------------------------------------------------------------------------------------------------------
# The producer's notes: a virtual run or another course
# ---------------------------------------------------------------------------------------------------------------
NOTE_FIELDS = ('completeness_reason', 'release_note', 'hold_note', 'course_notes', 'weather_notes')
NOTE_PATTERNS = (
    ('virtual_run', re.compile(r'virtual|virtuel|virtueel|self[- ]timed|app[- ]recorded|\bremote(?:ly)?\b|wherever you are', re.I)),
    ('another_course', re.compile(r'\bloops?\b|\blaps?\b|\b(?:another|different|alternat\w*|replacement|changed|shortened|modified) course\b|\bnew course\b(?! record)'
                                  r'|\bcourse (?:was |is |has |had )?(?:been )?(?:changed|shortened|altered|modified|moved|replaced)\b|\bshort course\b|\bshortened\b|\btrack\b', re.I)),
)
# Every sentence the search finds in the notes of an edition of the finish-time universe, with its ruling. `says` is the
# sentence with every run of digits read as #; `years` None means any year of the label. `quoted` is what a page prints.
REVIEWED_NOTES = (
    {'label': 'Warsaw', 'years': (2020,), 'field': 'completeness_reason', 'kind': 'another_course', 'ruling': 'excluded',
     'says': 'COVID edition: four separate waves (max # each) on a # km city loop, #-#-#/#',
     'quoted': 'COVID edition: four separate waves (max 250 each) on a 5 km city loop, 2020-09-26/27', 'reviewer': 'lead', 'reviewed_on': '2026-11-14'},
    # Kept: read, and not a statement that the edition was a virtual run or was run on another course. The three below were
    # entered by the builder on 2026-11-14 for the lead to confirm (the lead ruled on the search, not yet on these sentences).
    {'label': 'Houston', 'years': None, 'field': 'completeness_reason', 'kind': 'virtual_run', 'ruling': 'kept',
     'says': 'not loaded: # outside main place chain (wheelchair/handcycle/assisted/unplaced), # virtual',     # a count of rows that were not loaded
     'reviewer': 'builder, for the lead to confirm', 'reviewed_on': '2026-11-14'},
    {'label': 'Madrid', 'years': None, 'field': 'course_notes', 'kind': 'another_course', 'ruling': 'kept',
     'says': "Madrid's course changed over #-#",                    # the course profile's note: the race's course changed over the years, no edition named
     'reviewer': 'builder, for the lead to confirm', 'reviewed_on': '2026-11-14'},
    {'label': 'Washington', 'years': None, 'field': 'course_notes', 'kind': 'another_course', 'ruling': 'kept',
     'says': 'MCM course changed several times #-#',                # the same kind of note, on the Marine Corps Marathon
     'reviewer': 'builder, for the lead to confirm', 'reviewed_on': '2026-11-14'},
)
RULINGS = ('excluded', 'kept')


def sentences(text: str) -> list[str]:
    """A note cut into sentences at `;`, `|` and full stops (a stop inside a number is not one)."""
    return [part.strip() for part in re.split(r';|\||\.(?:\s|$)', text) if part.strip()]


def normal(sentence: str) -> str:
    """A sentence as the reviewed list writes it: spaces made one, every run of digits read as #."""
    return re.sub(r'\d+', '#', re.sub(r'\s+', ' ', sentence)).strip()


def found_in(notes: dict) -> list[dict]:
    """Every sentence of the notes that a pattern finds. `notes`: (label, year) -> {field: text or None}."""
    out = []
    for (label, year), fields in sorted(notes.items()):
        for field in NOTE_FIELDS:
            text = fields.get(field)
            if not isinstance(text, str):
                continue
            for sentence in sentences(text):
                for kind, pattern in NOTE_PATTERNS:
                    if pattern.search(sentence):
                        out.append({'label': label, 'year': int(year), 'field': field, 'kind': kind, 'says': normal(sentence), 'text': re.sub(r'\s+', ' ', sentence).strip()})
    return out


def rulings(notes: dict, entries=None) -> tuple[set, list]:
    """((label, year) of the editions excluded by review; the found sentences, each with its ruling). Stops on a sentence
    that is not on the reviewed list, on a listed sentence the notes no longer hold, and on an excluded edition whose
    quotation is no longer the note's own words."""
    entries = REVIEWED_NOTES if entries is None else entries
    for entry in entries:
        if entry['ruling'] not in RULINGS or entry['field'] not in NOTE_FIELDS or entry['kind'] not in dict(NOTE_PATTERNS):
            fail(f"the reviewed note of {entry['label']} is not written as the list requires")
    found = found_in(notes)
    excluded, unlisted, used = set(), [], set()
    for item in found:
        match = [i for i, e in enumerate(entries) if e['label'] == item['label'] and e['field'] == item['field'] and e['kind'] == item['kind'] and e['says'] == item['says']
                 and (e['years'] is None or item['year'] in e['years'])]
        if not match:
            unlisted.append(item)
            continue
        entry = entries[match[0]]
        used.add((match[0], item['year']))
        item['ruling'] = entry['ruling']
        if entry['ruling'] == 'excluded':
            if entry.get('quoted') != item['text']:
                fail(f"{item['label']} {item['year']}: the quotation of the reviewed exclusion is not the note’s own sentence any more")
            excluded.add((item['label'], item['year']))
    if unlisted:
        first = '; '.join(f"{x['label']} {x['year']} [{x['field']}, {x['kind']}]: {x['says']!r}" for x in unlisted[:5])
        fail(f'{len(unlisted)} sentences of the producer’s notes speak of a virtual run or another course and are not on the reviewed list '
             f'(analysis/linked_reviews.py REVIEWED_NOTES): {first}')
    for i, entry in enumerate(entries):
        years = {y for j, y in used if j == i}
        if not years or (entry['years'] is not None and set(entry['years']) != years):
            fail(f"the reviewed note of {entry['label']} ({entry['says']!r}) is no longer in the notes of every edition it names: review the list")
    return excluded, found


def published_exclusion(entry: dict, year: int, series: str | None) -> dict:
    out = {'label': entry['label'], 'year': int(year), 'reason': entry['kind'], 'quoted_note': entry['quoted'], 'reviewed_on': entry['reviewed_on']}
    if series is not None:
        out['series'] = series
    return out


def published_release(entry: dict, year: int, series: str | None, review: dict, distance_pct: float, applies: bool) -> dict:
    out = {'label': entry['label'], 'year': int(year), 'applies': bool(applies), 'reviewed_on': entry['reviewed_on']}
    if series is not None:
        out['series'] = series
    if applies:
        out['from_median_pct'] = pct(distance_pct)
        out['review'] = review
    return out


__all__ = ['REVIEWED_RELEASES', 'REVIEWED_NOTES', 'NOTE_FIELDS', 'NOTE_PATTERNS', 'CONDITIONS', 'review_of', 'releases', 'rulings', 'found_in', 'sentences', 'normal']
