"""The reviewed marathon race registry: from a release's race keys to races with an id, a display name and a slug.

    python3 -I analysis/race_registry.py --input <adapted FULL or CORE dir>            rebuild; fail unless it equals the frozen file
    python3 -I analysis/race_registry.py --input <adapted dir> --write [--reviewed FILE]   freeze (a reviewed refresh only)

A combined release keys an edition by a free string (`city`) and a year. The 34 keys of the earlier releases are plain
city names ("Berlin", "New York"); the 860 new ones are composite, "<place>: <event title>" as a timing platform printed
it ("Los Angeles, CA: Los Angeles Marathon", "XACT: Philadelphia Marathon Race Weekend"), and one race can sit under
several keys that differ by case, accents, an edition number, a year or a title sponsor. A key is therefore not a race,
a name or a URL. This module builds the table the site reads instead: one entry per race with its `race_id` (also its
slug), display name, place and the keys it joins, by the rule below plus a short reviewed list
(`analysis/race-registry.json`, `reviewed`), and freezes the result in the same file. Nothing is looked up outside the
release: a place is the text the key states, never a country or a corrected spelling.

The rule (RULE repeats it for the frozen file):
1. Keys join into one race only (a) by the grouping form: HTML entities decoded, accents dropped, lower case, a
   trailing year or two-digit number dropped, an edition number at the start of the event title dropped (with the
   words edition, edición or edizione), punctuation and runs of spaces made one space; or (b) by a reviewed join.
   Keys that would give one race two editions in the same year never join: the build fails.
2. A plain key (no ": ") is a city: its place is the key, its name the race name of its latest edition, and its slug
   the course rule the site already uses (lower case, accents dropped, other characters to hyphens), so the slugs of
   the existing course pages cannot change.
3. A composite key's place is the part before the first ": ", without parts that are empty, "TBD" or "?", without
   repeated parts, and absent when that part is a timing platform's name; its name is the part after it with HTML
   entities decoded, a trailing year removed and, when it is written all in capitals, each word capitalised. The
   name of a race of several keys is the name of the key with its latest edition, unless a reviewed join names it.
4. A composite race's slug is its name under the course rule (the key, when that gives nothing). Where two races would
   share a slug, each composite one adds its place, then its first year; a plain key's slug is never changed.
5. Flags mark titles that need a reader's care before they are shown; they change nothing else.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

FROZEN = Path(__file__).with_name('race-registry.json')
PLATFORMS = {'XACT'}
PLACEHOLDERS = {'', 'TBD', '?'}
RULE = {
    'join': ('keys join into one race only by the grouping form (HTML entities decoded, accents dropped, lower case, a trailing year or two-digit number '
             'dropped, an edition number at the start of the event title dropped with the words edition, edición or edizione, punctuation and runs of '
             'spaces made one space) or by a reviewed join; keys that would give a race two editions in one year never join'),
    'plain_key': ('a key with no ": " is a city: its place is the key, its name the race name of its latest edition (the one with most rows when a year '
                  'has two), its slug the site’s course rule (lower case, accents dropped, other characters to hyphens)'),
    'composite_key': ('place: the part before the first ": ", without parts that are empty, "TBD" or "?", without repeated parts, absent when it is a timing '
                      'platform’s name (XACT); name: the part after it, HTML entities decoded, a trailing year removed, each word capitalised when the title is '
                      'all capitals; a race of several keys takes the name and place of the key with its latest edition unless a reviewed join names it'),
    'slug': ('a composite race’s slug is its name under the course rule (the key, when that gives nothing); where two races would share a slug each '
             'composite one adds its place, then its first year; a plain key’s slug is never changed'),
    'flags': {
        'virtual_in_title': 'the key contains "virtual" or "virtuel"',
        'cancelled_in_title': 'the key contains "cancel" or "annul"',
        'placeholder_place': 'the place part holds "TBD" or "?"',
        'platform_prefix': 'the part before ": " is a timing platform’s name, so the key states no place',
        'no_marathon_word_in_title': 'the event title has no marathon word (marat…, 42) once half-marathon words are set aside',
        'other_event_in_title': 'the event title names another event (half, semi, medio, mezza, 5K, 10K, 21K, relay, ultra, trail, duathlon)',
        'trail_or_mountain_word_in_title': 'the event title has a trail or mountain word (trail, ecomaratona, sky, mountain, montagna, dolomiti, alpin)',
        'several_race_names': 'a plain key whose editions carry more than one race name',
    },
    'order': 'races are sorted by race_id; a race’s keys by first year, then key',
}


def fold(text):
    """Accents dropped (NFKD, combining marks removed)."""
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))


def slug(text):
    """The site's course rule (lib/course-data.ts slugifyCity; analysis/insights_tools_common.py slugify)."""
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', fold(text.lower())))


def grouping_form(key):
    """The form under which keys join by rule (the scout's norm_series, 2026-11-14, ported)."""
    text = fold(html.unescape(key)).lower()
    text = re.sub(r'\s+((19|20)[0-9]{2}|[0-9]{2})\s*$', '', text)
    text = re.sub(r':\s*[0-9]{1,3}\s*(\^|a|ª|º|°|o|e|eme|th|st|nd|rd|\.)?\s+(eme\s+)?((edicion|edition|edizione)\s+(du\s+|de\s+|del\s+)?)?', ': ', text)
    text = re.sub(r'\s+[0-9]{1,3}(th|st|nd|rd)\s+edition\s*$', '', text)
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9:]+', ' ', text)).strip()


def split_key(key):
    """(place, event title) of a composite key, (key, None) of a plain one."""
    text = re.sub(r'\s+', ' ', html.unescape(key)).strip()
    left, separator, event = text.partition(': ')
    if not separator:
        return text, None
    if left.strip() in PLATFORMS:
        return None, event.strip()
    parts = []
    for part in (p.strip() for p in left.split(',')):
        if part not in PLACEHOLDERS and part not in parts:
            parts.append(part)
    return (', '.join(parts) or None), event.strip()


def display_name(event):
    name = re.sub(r'[\s,\-–—]*\b(19|20)[0-9]{2}$', '', event).strip() or event
    letters = [ch for ch in name if ch.isalpha()]
    if letters and all(ch.isupper() for ch in letters):
        name = ' '.join(word[:1].upper() + word[1:].lower() for word in name.split(' '))
    return name


def key_flags(key):
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
        if left.strip() in PLATFORMS:
            flags.append('platform_prefix')
        title = fold(event).lower()
        without_half = re.sub(r'half[- ]?marathon|semi[- ]?marathon|medio maraton|media maraton|mezza maratona|halbmarathon|maratonina', ' ', title)
        if not re.search(r'marat|42', without_half):
            flags.append('no_marathon_word_in_title')
        if re.search(r'\b(half|semi|medio|media|mezza|5k|10k|21k|relay|ultra|trail|duathlon)\b', title):
            flags.append('other_event_in_title')
        if re.search(r'trail|ecomaratona|sky|mountain|montagna|dolomiti|alpin', title):
            flags.append('trail_or_mountain_word_in_title')
    return flags


def build(editions, reviewed):
    """`editions`: rows (key, year, race name, rows). `reviewed`: {'joins': [...], 'flags': [...]}. Returns the races."""
    keys = {}
    for key, year, race, n in editions:
        entry = keys.setdefault(key, {'years': {}, 'names': {}})
        entry['years'][year] = entry['years'].get(year, 0) + n
        entry['names'][(year, race)] = entry['names'].get((year, race), 0) + n
    parent = {key: key for key in keys}

    def find(key):
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key
    by_form = {}
    for key in sorted(keys):
        first = by_form.setdefault(grouping_form(key), key)
        if first != key:
            parent[find(key)] = find(first)
    named = {}
    for join in reviewed['joins']:
        missing = [k for k in join['keys'] if k not in keys]
        assert not missing and len(join['keys']) == len(set(join['keys'])) >= 2, f"reviewed join {join['id']}: unknown or repeated keys {missing}"
        roots = {find(k) for k in join['keys']}
        assert len(roots) > 1, f"reviewed join {join['id']} joins nothing the rule has not joined"
        for k in join['keys'][1:]:
            parent[find(k)] = find(join['keys'][0])
    for join in reviewed['joins']:
        assert find(join['keys'][0]) not in named, f"reviewed join {join['id']} overlaps another"
        named[find(join['keys'][0])] = join
    groups = {}
    for key in keys:
        groups.setdefault(find(key), []).append(key)
    extra = {}
    for flag in reviewed['flags']:
        assert flag['key'] in keys, f"reviewed flag on an unknown key {flag['key']}"
        extra.setdefault(find(flag['key']), []).append(flag['flag'])
    races = []
    for root, members in groups.items():
        years = {}
        for key in members:
            for year in keys[key]['years']:
                assert year not in years, f'{members}: two keys hold an edition of {year}; they cannot be one race'
                years[year] = key
        members.sort(key=lambda k: (min(keys[k]['years']), k))
        latest = years[max(years)]
        join = named.get(root)
        place, event = split_key(latest)
        if event is None:
            last = max(keys[latest]['years'])
            name = max(((n, race) for (year, race), n in keys[latest]['names'].items() if year == last))[1]
        else:
            name = display_name(event)
        flags = sorted({f for key in members for f in key_flags(key)} | set(extra.get(root, []))
                       | ({'several_race_names'} if any(': ' not in k and len({r for _, r in keys[k]['names']}) > 1 for k in members) else set()))
        plain = [k for k in members if ': ' not in k]
        assert len(plain) <= 1, f'{members}: two plain keys cannot be one race'
        races.append({
            'slug': slug(plain[0]) if plain else None, 'name': (join or {}).get('name') or name,
            'place': (join or {}).get('place') or (plain[0] if plain else place), 'keys': members,
            'joined_by': f"reviewed join {join['id']}" if join else 'rule' if len(members) > 1 else 'single key',
            'flags': flags, 'first_year': min(years), 'last_year': max(years), 'editions': len(years),
        })
    # Slugs: plain keys keep the course rule; composite races take their name's, and those that collide add their place,
    # then their first year (all races of a collision move together, so the outcome does not depend on order).
    taken = [race['slug'] for race in races if race['slug']]
    assert len(taken) == len(set(taken)), 'two plain keys share a slug'
    pending = [race for race in races if not race['slug']]
    for race in pending:
        base = slug(race['name']) or slug(race['keys'][0])
        steps = [base] + ([f"{base}-{slug(race['place'])}".strip('-')] if race['place'] and slug(race['place']) else [])
        race['steps'], race['at'] = steps + [f"{steps[-1]}-{race['first_year']}"], 0
    while True:
        counts = {}
        for value in taken + [race['steps'][race['at']] for race in pending]:
            counts[value] = counts.get(value, 0) + 1
        collided = [race for race in pending if counts[race['steps'][race['at']]] > 1 or not race['steps'][race['at']]]
        if not collided:
            break
        assert any(race['at'] < len(race['steps']) - 1 for race in collided), f"no unique slug by the rule for {[r['keys'] for r in collided]}"
        for race in collided:
            race['at'] = min(race['at'] + 1, len(race['steps']) - 1)
    for race in pending:
        race['slug'] = race.pop('steps')[race.pop('at')]
    assert len({race['slug'] for race in races}) == len(races), 'slugs are not unique'
    out = []
    for race in sorted(races, key=lambda r: r['slug']):
        out.append({'race_id': race['slug'], **race})
    return out


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def read_editions(source):
    import duckdb
    db = duckdb.connect()
    path = str(Path(source) / 'race_records.parquet').replace("'", "''")
    return [tuple(r) for r in db.execute(f"SELECT city, year, race, count(*) FROM read_parquet('{path}') GROUP BY ALL ORDER BY 1, 2, 3").fetchall()]


def document(editions, reviewed, tag):
    races = build(editions, reviewed)
    keys = sorted({e[0] for e in editions})
    flags = {}
    for race in races:
        for flag in race['flags']:
            flags[flag] = flags.get(flag, 0) + 1
    joined = {}
    for race in races:
        kind = race['joined_by'].split(' ')[0] + (' join' if race['joined_by'].startswith('reviewed') else '')
        joined[kind] = joined.get(kind, 0) + 1
    return {
        'document': ('The reviewed marathon race registry of this release: every race key with rows in the adapted input, grouped into races by the rule '
                     'below and the reviewed joins and flags. analysis/race_registry.py rebuilds `races` from the adapted records and `reviewed`, and fails '
                     'on any difference.'),
        'schema_version': 1, 'tag': tag, 'distance': 'marathon', 'reviewed_on': '2026-11-14', 'rule': RULE,
        'expected': {'keys': len(keys), 'plain_keys': sum(1 for k in keys if ': ' not in k), 'races': len(races),
                     'races_by_join': dict(sorted(joined.items())), 'keys_in_races_of_several_keys': sum(len(r['keys']) for r in races if len(r['keys']) > 1),
                     'races_by_flag': dict(sorted(flags.items()))},
        'keys_sha256': digest(keys), 'races_sha256': digest(races),
        'reviewed': reviewed,
        'races': races,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True, help='an adapted input folder (race_records.parquet, provenance.json)')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--reviewed', type=Path, help='with --write: the reviewed joins and flags to freeze (default: the frozen file’s own)')
    args = parser.parse_args(argv)
    tag = json.loads((args.input / 'provenance.json').read_text())['release_tag']
    reviewed = json.loads((args.reviewed or FROZEN).read_text())
    reviewed = reviewed['reviewed'] if 'reviewed' in reviewed and 'races' in reviewed else reviewed
    built = document(read_editions(args.input), reviewed, tag)
    if args.write:
        FROZEN.write_text(json.dumps(built, indent=1, ensure_ascii=False) + '\n')
        print(json.dumps({'written': FROZEN.name, 'sha256': hashlib.sha256(FROZEN.read_bytes()).hexdigest(), **built['expected']}, indent=1))
        return
    frozen = json.loads(FROZEN.read_text())
    for key in ('tag', 'rule', 'expected', 'keys_sha256', 'races_sha256', 'reviewed', 'races'):
        if frozen[key] != built[key]:
            sys.exit(f'race_registry: the rebuild differs from the frozen registry in `{key}`')
    print(json.dumps({'rebuild_equals_frozen': True, 'frozen_sha256': hashlib.sha256(FROZEN.read_bytes()).hexdigest(), **built['expected']}, indent=1))


if __name__ == '__main__':
    main()
