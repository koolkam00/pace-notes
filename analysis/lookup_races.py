"""Runner lookup v2: the race of every edition, as a label and a display name. A release key never reaches a file.

Marathon keys come from the reviewed race registry (analysis/race-registry.json, lead decisions D14 and D19 of the
adoption plan): a key's label is the pipeline's `city`, so it equals the cohort's and every pack's.

Half keys have no registry yet (the half rebuild writes one). Until it exists, and afterwards for any key it does not
list, a half key is its own race, named by the registry module's own functions and nothing else:
- a key with no ": " is its own label and name (entities decoded, runs of spaces made one);
- a composite key's name is `race_registry.display_name` of the part after the first ": " and its place is
  `race_registry.split_key`'s; its label is its name, and where the labels of two half races would give one slug
  (`race_registry.slug`), each such composite race adds its place in brackets, then the first year it has a kept
  row. A plain key’s label and a registry label never change.
No race name is read from the result rows: a half edition's rows can carry several (design section 2.3).
"""
from __future__ import annotations

import hashlib
import json

from race_registry import display_name, slug, split_key

HALF_RULE = ('a half key without a registry entry is its own race: a key with no ": " is its own label and name; a composite '
             'key’s name is the part after the first ": " (entities decoded, a trailing year removed, an all-capitals title '
             're-cased) and its label is that name, with its place in brackets and then the first year it has a kept row added where two '
             'half labels would give one slug')


class RaceError(Exception):
    pass


def read_registry(path, distance):
    """{release key: (label, display name)} of a registry file, its tag and its sha256."""
    data = path.read_bytes()
    registry = json.loads(data)
    if registry.get('distance') != distance:
        raise RaceError(f'{path} is not the {distance} race registry')
    by_key, labels = {}, set()
    for race in registry['races']:
        label, name = race.get('label'), race.get('name')
        if not label or not name:
            raise RaceError(f'{path}: race {race.get("race_id")!r} has no label or name (lead decision D19 needs a registry with labels: schema 2)')
        if label in labels:
            raise RaceError(f'{path}: the label {label!r} names two races')
        labels.add(label)
        for key in race['keys']:
            if key in by_key:
                raise RaceError(f'{path}: the key {key!r} is in two races')
            by_key[key] = (label, name)
    return by_key, registry.get('tag'), hashlib.sha256(data).hexdigest()


def half_races(first_years, registry=None):
    """{half release key: (label, display name)}. `first_years`: {key: first year with a listed result}; `registry`:
    {key: (label, name)} of a half registry, or None. Keys the registry lacks follow the default rule (HALF_RULE)."""
    registry = registry or {}
    out, fixed, pending = {}, {}, []
    for key in sorted(first_years):
        if key in registry:
            out[key] = registry[key]
            fixed[slug(registry[key][0])] = registry[key][0]
            continue
        place, event = split_key(key)
        if event is None:
            if not place:
                raise RaceError(f'the half key {key!r} gives no name')
            out[key] = (place, place)
            fixed.setdefault(slug(place), place)
            continue
        name = display_name(event)
        if not name:
            raise RaceError(f'the half key {key!r} gives no name')
        steps = [name]
        if place and slug(place):
            steps.append(f'{name} ({place})')
        steps.append(f'{steps[-1][:-1]}, {first_years[key]})' if len(steps) == 2 else f'{name} ({first_years[key]})')
        pending.append({'key': key, 'name': name, 'steps': steps, 'at': 0})
    while True:
        counts = dict.fromkeys(fixed, 1)
        for race in pending:
            value = slug(race['steps'][race['at']])
            counts[value] = counts.get(value, 0) + 1
        moved = False
        for race in pending:
            if counts[slug(race['steps'][race['at']])] > 1 and race['at'] < len(race['steps']) - 1:
                race['at'] += 1
                moved = True
        if not moved:
            break
    for race in pending:
        out[race['key']] = (race['steps'][race['at']], race['name'])
    by_label = {}
    for key, (label, _) in out.items():
        if key not in registry:
            by_label.setdefault(label, []).append(key)
    registry_labels = {label for label, _ in registry.values()}
    clashes = {label: keys for label, keys in by_label.items() if len(keys) > 1 or label in registry_labels}
    if clashes:
        raise RaceError(f'half race labels are not unique by the default rule; these need a registry entry: {sorted(clashes.items())[:5]}')
    return out
