"""The half race registry: from the release's half-marathon race keys to races with a label and a name.

    python3 -I analysis/half_race_registry.py --tiers <EDITION-TIERS.csv>            rebuild; fail unless it equals the frozen file
    python3 -I analysis/half_race_registry.py --tiers <EDITION-TIERS.csv> --write --reviewed-on YYYY-MM-DD    freeze (a reviewed refresh only)

The frozen file is analysis/half-race-registry.json, in the shape of the marathon registry (analysis/race-registry.json):
the release tag, the rule in words, the reviewed entries, and one entry for every half race with rows (its label, its
name and place, the release keys it holds, its years, editions and rows). The half race list (analysis/half_races.py)
and the runner lookup read races from it; nothing else names a half race. Half and marathon races are separate name
spaces: no marathon key is read here, and the marathon registry reads nothing of this file.

The rule (RULE repeats it for the frozen file):
1. A release key of a half edition is its source database and its key ("half" for the half database, "full" for the
   eight half editions the marathon database holds). A key joins a race only by a reviewed join of the frozen file; a
   key with no entry is its own race. No key joins by similarity. Keys that would give a race two editions of one year
   in one database never join: the build fails.
2. A name comes from the key alone, by the marathon registry's naming functions (analysis/race_registry.py split_key and
   display_name): a plain key (no ": ") is its own name and states no separate place; a composite key's place is the
   part before the first ": " (without parts that are empty, "TBD" or "?", absent when it is a timing platform's name)
   and its name the part after it, HTML entities decoded, a trailing year removed, each word capitalised when the title
   is all capitals. A reviewed join names its race with a phrase one of its keys states.
3. A label is what a visitor reads in a list of races, unique among half races. A plain key's race takes the key; a
   reviewed label is taken as written; every other race takes its name. Where the labels of two races would read the
   same (compared without accents, case and punctuation), each such race that is not a plain key's or a reviewed
   label's adds its place in brackets, then its first year, then "marathon database" for a key of the marathon
   database, then a number in key order. A plain key's label and a reviewed label never change.
4. Flags mark titles that need a reader's care before they are shown; they change nothing else.

Nothing is looked up outside the release, and no runner's name is read: the input is the release's tier table.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import race_registry  # noqa: E402  (the marathon registry's naming functions; no marathon data is read)

ANALYSIS = Path(__file__).resolve().parent
FROZEN = ANALYSIS / 'half-race-registry.json'
RELEASE = ANALYSIS / 'release.json'
DATABASES = ('half', 'full')
DATABASE_WORDS = {'full': 'marathon database'}
FLAGS = {
    'virtual_in_title': 'the key contains "virtual" or "virtuel"',
    'cancelled_in_title': 'the key contains "cancel" or "annul"',
    'placeholder_place': 'the place part holds "TBD" or "?"',
    'platform_prefix': 'the part before ": " is a timing platform’s name, so the key states no place',
    'no_half_word_in_title': 'a composite key whose event title has no half-marathon word (half, halb, halv, semi, demi, medio, media, mezza, meia, mitja, mitad, 21)',
}
RULE = {
    'key': ('a release key of a half edition is its source database ("half": the half database; "full": the half editions the marathon database holds) '
            'and its key; every key with rows is in exactly one race'),
    'join': ('a key joins a race only by a reviewed join of this file; a key with no entry is its own race; no key joins by similarity; keys that would give '
             'a race two editions of one year in one database never join'),
    'name': ('from the key alone: a plain key (no ": ") is its own name and states no separate place; a composite key’s place is the part before the first '
             '": " (without parts that are empty, "TBD" or "?", absent when it is a timing platform’s name) and its name the part after it, HTML entities '
             'decoded, a trailing year removed, each word capitalised when the title is all capitals; a reviewed join names its race with a phrase one of its keys states'),
    'label': ('what a visitor reads in a list of races, unique among half races: a plain key’s race takes the key; a reviewed label is taken as written; every '
              'other race takes its name, and where two labels would read the same (accents, case and punctuation aside) each such race adds its place in '
              'brackets, then its first year, then "marathon database" for a key of the marathon database, then a number in key order; a plain key’s label and '
              'a reviewed label never change, so two plain keys that differ only by punctuation keep their keys as their labels'),
    'flags': FLAGS,
    'order': 'races are sorted by label (accents and case aside), then by label as written; a race’s keys by first year, then database, then key',
}
COMPARED = ('tag', 'distance', 'rule', 'expected', 'keys_sha256', 'races_sha256', 'reviewed', 'races')


class RegistryError(ValueError):
    pass


def fail(message: str):
    raise RegistryError(message)


def clean(key: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(key)).strip()


def key_flags(key: str) -> list[str]:
    text = html.unescape(key)
    left, separator, event = text.partition(': ')
    flags = []
    if re.search(r'virtual|virtuel', text, re.I):
        flags.append('virtual_in_title')
    if re.search(r'cancel|annul', text, re.I):
        flags.append('cancelled_in_title')
    if separator:
        if any(p.strip() in ('TBD', '?') for p in left.split(',')):
            flags.append('placeholder_place')
        if left.strip() in race_registry.PLATFORMS:
            flags.append('platform_prefix')
        if not re.search(r'half|halb|halv|semi|demi|medio|media|mezza|meia|mitja|mitad|21', race_registry.fold(event).lower()):
            flags.append('no_half_word_in_title')
    return flags


def name_of(key: str) -> tuple[str, str | None, bool]:
    """(name, place, plain) of a key, from the key alone."""
    place, event = race_registry.split_key(key)
    if event is None:
        return clean(key), None, True
    return race_registry.display_name(event), place, False


def read_editions(tiers: Path) -> list[tuple[str, str, int, int]]:
    """(source_db, key, year, rows) of every half edition with rows, from the release's tier table."""
    out = []
    with Path(tiers).open(encoding='utf-8', newline='') as handle:
        for row in csv.DictReader(handle):
            if row['distance'] != 'half':
                continue
            rows = int(row['n_records'] or 0)
            if rows <= 0:
                continue
            if row['source_db'] not in DATABASES:
                fail(f"the tier table names another database than {DATABASES}: {row['source_db']!r}")
            out.append((row['source_db'], row['city'], int(row['year']), rows))
    if len({(d, k, y) for d, k, y, _ in out}) != len(out):
        fail('the tier table lists a half edition twice')
    return out


def build(editions, reviewed: dict) -> list[dict]:
    """`editions`: (source_db, key, year, rows). `reviewed`: {'joins': [...], 'labels': [...], 'flags': [...]}."""
    keys = {}
    for database, key, year, rows in editions:
        keys.setdefault((database, key), {})[year] = rows
    owner, groups = {}, []
    for join in reviewed.get('joins', []):
        members = [tuple(k) for k in join['keys']]
        missing = [k for k in members if k not in keys]
        if missing or len(members) < 2 or len(set(members)) != len(members):
            fail(f"reviewed join {join.get('id')}: at least two keys of the release, each once (missing {missing[:2]})")
        if any(k in owner for k in members):
            fail(f"reviewed join {join.get('id')}: a key belongs to one race")
        if not all(isinstance(join.get(f), str) and join[f] for f in ('id', 'name', 'reason')):
            fail('a reviewed join needs an id, a name and a reason')
        seen = set()
        for k in members:
            for year in keys[k]:
                if (k[0], year) in seen:
                    fail(f"reviewed join {join['id']}: two editions of {year} in one database")
                seen.add((k[0], year))
        if not race_registry.states(join['name'], [k[1] for k in members]):
            fail(f"reviewed join {join['id']}: the name {join['name']!r} is not a phrase one of its keys states")
        group = {'keys': members, 'join': join}
        groups.append(group)
        for k in members:
            owner[k] = group
    for k in sorted(keys):
        if k not in owner:
            groups.append({'keys': [k], 'join': None})
    labels = {tuple(x['key']) if isinstance(x.get('key'), list) else None: x for x in reviewed.get('labels', [])}
    extra_flags = {tuple(x['key']): x['flags'] for x in reviewed.get('flags', [])}

    races = []
    for group in groups:
        members = sorted(group['keys'], key=lambda k: (min(keys[k]), k[0], k[1]))
        years = sorted({y for k in members for y in keys[k]})
        latest = max(members, key=lambda k: (max(keys[k]), k[0], k[1]))
        name, place, plain = name_of(latest[1])
        joined = 'single key'
        if group['join'] is not None:
            joined, name = 'reviewed join', group['join']['name']
            place = group['join'].get('place', place)
            plain = False
        flags = sorted({f for k in members for f in key_flags(k[1])} | {f for k in members for f in extra_flags.get(k, [])})
        unknown = [f for f in flags if f not in FLAGS]
        if unknown:
            fail(f'unknown flags {unknown}')
        reviewed_label = next((labels[k]['label'] for k in members if k in labels), None)
        race = {'name': name, 'place': place, 'keys': [{'source_db': k[0], 'key': k[1]} for k in members], 'joined_by': joined, 'flags': flags,
                'first_year': years[0], 'last_year': years[-1], 'editions': sum(len(keys[k]) for k in members), 'rows': sum(sum(keys[k].values()) for k in members),
                '_plain': plain and joined == 'single key', '_reviewed_label': reviewed_label, '_database': members[0][0] if len({k[0] for k in members}) == 1 else None}
        if reviewed_label is not None:
            if not race_registry.states(reviewed_label, [k[1] for k in members]):
                fail(f'the reviewed label {reviewed_label!r} is not a phrase one of its race’s keys states')
            race['label'], race['labelled_by'] = reviewed_label, 'reviewed label'
        elif race['_plain']:
            race['label'], race['labelled_by'] = name, 'plain key'
        else:
            race['label'], race['labelled_by'] = name, 'name'
        races.append(race)

    # Labels that would read the same: the races that may change add their place, their first year, their database, a number.
    def clashing():
        by = {}
        for race in races:
            by.setdefault(race_registry.slug(race['label']), []).append(race)
        return [group for group in by.values() if len(group) > 1]

    fixed = lambda race: race['labelled_by'] in ('plain key', 'reviewed label')

    def stage(words, how):
        for group in clashing():
            for race in group:
                if fixed(race):
                    continue
                extra = words(race)
                if extra is None:
                    continue
                label = race['label']
                race['label'] = f'{label[:-1]}, {extra})' if label.endswith(')') and race['labelled_by'] != 'name' else f'{label} ({extra})'
                race['labelled_by'] = how if race['labelled_by'] == 'name' else f"{race['labelled_by']}, {how}"
    stage(lambda race: race['place'], 'place')
    stage(lambda race: str(race['first_year']), 'first year')
    stage(lambda race: DATABASE_WORDS.get(race['_database']), 'database')
    for group in clashing():
        changing = sorted((race for race in group if not fixed(race)), key=lambda race: (race['keys'][0]['source_db'], race['keys'][0]['key']))
        start = 1 if len(changing) == len(group) else 0
        for number, race in enumerate(changing[start:], start=2):
            race['label'] = f"{race['label']} ({number})"
            race['labelled_by'] = f"{race['labelled_by']}, number"
    # What may still read the same: plain keys, or reviewed labels, that differ only by punctuation. They keep their labels.
    left = [group for group in clashing() if not all(fixed(race) for race in group)]
    if left:
        fail(f'two half races would read the same: {[r["label"] for r in left[0]]}')
    for race in races:
        race['labelled_by'] = {'place': 'name and place', 'place, first year': 'name, place and first year', 'first year': 'name and first year'}.get(
            race['labelled_by'], race['labelled_by'] if race['labelled_by'] in ('plain key', 'reviewed label', 'name') else 'name, ' + race['labelled_by'])
        for private in ('_plain', '_reviewed_label', '_database'):
            del race[private]
    # The id: the label without accents, case and punctuation; labels that read the same take a number in label order.
    taken = {}
    for race in sorted(races, key=lambda race: race['label']):
        base = race_registry.slug(race['label'])
        taken[base] = taken.get(base, 0) + 1
        race['race_id'] = base if taken[base] == 1 else f'{base}-{taken[base]}'
    if len({race['race_id'] for race in races}) != len(races) or len({race['label'] for race in races}) != len(races):
        fail('two half races share a label or an id')
    races.sort(key=lambda race: (race_registry.fold(race['label']).lower(), race['label']))
    order = ('race_id', 'label', 'name', 'place', 'keys', 'joined_by', 'labelled_by', 'flags', 'first_year', 'last_year', 'editions', 'rows')
    return [{field: race[field] for field in order} for race in races]


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def document(editions, reviewed: dict, tag: str) -> dict:
    races = build(editions, reviewed)
    keys = sorted({(d, k) for d, k, _, _ in editions})
    tally = lambda field: {v: sum(1 for r in races if r[field] == v) for v in sorted({r[field] for r in races})}
    return {
        'document': ('The half race registry of this release: every half-marathon race key with rows, of either source database, as a race with the label a '
                     'visitor reads, its name and place and the release keys it holds. analysis/half_race_registry.py rebuilds `races` from the release’s '
                     'tier table and `reviewed`, and stops on any difference; analysis/half_races.py and the runner lookup read races from this file.'),
        'schema_version': 2, 'tag': tag, 'distance': 'half', 'reviewed_on': reviewed.get('reviewed_on'),
        'rule': RULE,
        'expected': {'keys': len(keys), 'plain_keys': sum(1 for _, k in keys if ': ' not in clean(k)), 'keys_by_database': {d: sum(1 for x, _ in keys if x == d) for d in DATABASES},
                     'races': len(races), 'races_by_join': tally('joined_by'), 'races_by_label': tally('labelled_by'),
                     'races_by_flag': {f: sum(1 for r in races if f in r['flags']) for f in sorted(FLAGS)},
                     'editions': sum(r['editions'] for r in races), 'rows': sum(r['rows'] for r in races)},
        'keys_sha256': digest([list(k) for k in keys]), 'races_sha256': digest(races),
        'reviewed': {'reviewed_on': reviewed.get('reviewed_on'), 'joins': reviewed.get('joins', []), 'labels': reviewed.get('labels', []), 'flags': reviewed.get('flags', [])},
        'races': races,
    }


def encode(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=1) + '\n'


def frozen(path: Path | None = None) -> dict:
    doc = json.loads((path or FROZEN).read_text())
    if doc.get('schema_version') != 2 or doc.get('distance') != 'half' or not isinstance(doc.get('races'), list):
        fail('analysis/half-race-registry.json: schema 2, distance half and the races are required')
    return doc


def check(tiers: Path, tag: str, path: Path | None = None) -> dict:
    """The frozen registry, after rebuilding it from the tier table: any difference stops the caller."""
    doc = frozen(path)
    rebuilt = document(read_editions(tiers), doc['reviewed'], tag)
    for field in COMPARED:
        if rebuilt[field] != doc[field]:
            fail(f'analysis/half-race-registry.json: `{field}` differs from the registry rebuilt from the tier table; review the difference, then freeze with --write')
    return doc


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--tiers', type=Path, required=True, help="the release's EDITION-TIERS.csv")
    parser.add_argument('--write', action='store_true', help='freeze the rebuilt registry (a reviewed refresh only)')
    parser.add_argument('--out', type=Path, default=None, help='another file than analysis/half-race-registry.json')
    parser.add_argument('--reviewed-on', default=None, help='with --write: the date of this review (YYYY-MM-DD)')
    args = parser.parse_args(argv)
    tag = json.loads(RELEASE.read_text())['tag']
    path = args.out or FROZEN
    try:
        if args.write:
            reviewed = frozen(path)['reviewed'] if path.is_file() and json.loads(path.read_text()).get('schema_version') == 2 else {'reviewed_on': None, 'joins': [], 'labels': [], 'flags': []}
            if args.reviewed_on:
                if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', args.reviewed_on):
                    fail('--reviewed-on: a date as YYYY-MM-DD')
                reviewed = {**reviewed, 'reviewed_on': args.reviewed_on}
            doc = document(read_editions(args.tiers), reviewed, tag)
            path.write_text(encode(doc))
        else:
            doc = check(args.tiers, tag, path)
    except RegistryError as error:
        print(f'half_race_registry: {error}', file=sys.stderr)
        return 1
    print(json.dumps(doc['expected'], ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
