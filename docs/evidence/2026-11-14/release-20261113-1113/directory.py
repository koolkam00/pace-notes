"""A first build of the marathon edition directory (lead decision D5) and the review of the race registry's naming rule.

    python3 -I directory.py <adapted FULL dir> <edition-screen.csv> <edition-directory.json> <race-registry-review.json>

The directory is a proposal for a published data file, not yet one: every marathon edition with written rows in the
adapted input, named as the pipeline names it (`city` is its race's registry label), with its race
(analysis/race-registry.json), tier, badge, weaker-source label, split tier, official count and its source type,
coverage, hold and release notes, timing basis, dates, row counts, and whether the edition policy counts it and, if
not, the category, the reason and whether a record of it keeps an own-record view. Editions are rows of `editions` in
the order of `columns`; `reason` is an index into `reasons`. Nothing here is typed: every value is read from the adapted
input, the frozen policy (analysis/edition-policy-20261113-1113.json), the registry and the screens.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'analysis'))
import duckdb  # noqa: E402
import race_registry  # noqa: E402

POLICY = ROOT / 'analysis' / 'edition-policy-20261113-1113.json'
SCHEMA = {
    'city': 'the label of the edition’s race in the race registry: the pipeline’s `city`, the join key with year in every pack and data file',
    'year': 'the edition’s year',
    'race_id': 'the race in `races` (analysis/race-registry.json): its id (the label’s slug), display name, place and flags',
    'race': 'the race name written for the edition: the registry’s display name, or under a plain key the race name the release gives it',
    'release_city': 'the release’s own race key of the edition; never shown as a name',
    'tier': 'verification tier: stamped, stamped_weaker_source, partial, held_for_review or unverified',
    'verified_badge': 'true only on the two stamped tiers',
    'weaker_source': 'true when the stamp rests on a count likely built from the same timer file; the label must stay visible',
    'split_tier': 'splits, or finish_time_only when under half the rows have any intermediate split',
    'official_finishers': 'the independent official count the producer checked against, or null',
    'official_source_type': 'the producer’s description of that count’s source',
    'coverage_pct': 'the release’s rows with a finish time as a percentage of the official count (two decimals), or null',
    'hold_note': 'the producer’s hold note (on 20 editions, none of them held_for_review)',
    'release_note': 'the producer’s release note',
    'timing_basis': 'the producer’s timing basis for the edition (chip, gun, mixed, unknown, or a platform’s own wording); it changes inside some series',
    'race_date': 'the race date used for ordering: the weather row’s, else a reviewed and cited date; null otherwise (the edition is then ordered by year only)',
    'race_date_source': 'weather, reviewed or null',
    'producer_note_date': 'the one date=YYYY-MM-DD the producer’s completeness note states, unreviewed and never used as the race date',
    'rows': 'rows written to the adapted input (after the row rule)',
    'rows_in_release': 'marathon rows of the edition in the release',
    'rows_left_out': 'rows the adapter’s row rule leaves out',
    'finishes': 'written rows with a finish time',
    'timing_eligible': 'written rows that pass the timing checks: all nine checkpoints, increasing, finish 1:30 to 12:00, every section 2:00 to 20:00 per km',
    'counted': 'true when the edition supplies pooled pacing statistics under the frozen edition policy',
    'own_record': 'true when the edition is not counted but a record of it keeps an own-record view (unverified, or partial outside the coverage band, with a grid that passes the screens)',
    'not_counted_category': 'the policy’s category when it is not counted',
    'reason': 'index into `reasons`: the reason a visitor can read',
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main(argv):
    source, screen_path, out, review_out = Path(argv[1]), Path(argv[2]), Path(argv[3]), Path(argv[4])
    document = json.loads((source / 'EDITIONS.json').read_text())
    policy = json.loads(POLICY.read_text())
    registry = json.loads(race_registry.FROZEN.read_text())
    assert document['tag'] == policy['tag'] == registry['tag']
    assert policy['inputs']['adapted_manifest_sha256'] == sha(source / 'MANIFEST.json'), 'the policy was frozen on another adapted input'
    race_of = {race['label']: race['race_id'] for race in registry['races']}
    excluded = {(e['city'], e['year']): e for e in policy['editions']}
    counted = {tuple(k) for k in policy['counted']}
    with open(screen_path, newline='') as stream:
        eligible = {(r['city'], int(r['year'])): int(r['timing_eligible']) for r in csv.DictReader(stream)}
    reasons, index, rows = [], {}, []
    columns = list(SCHEMA)
    assert not any(e['rows_in_release'] for e in document['not_written']), 'an edition with release rows has no written row; the directory lists written editions'
    for e in sorted(document['editions'], key=lambda e: (e['city'], e['year'])):
        key = (e['city'], e['year'])
        assert (key in counted) != (key in excluded) and race_of[e['city']] == e['race_id'], key
        category, reason = (None, None) if key in counted else (excluded[key]['category'], excluded[key]['reason'])
        if reason is not None and reason not in index:
            index[reason] = len(reasons)
            reasons.append(reason)
        official = e['official_finishers']
        value = {
            'city': e['city'], 'year': e['year'], 'race_id': e['race_id'], 'race': e['race'], 'release_city': e['release_city'],
            'tier': e['verification_tier'], 'verified_badge': e['verified_badge'],
            'weaker_source': e['weaker_source'], 'split_tier': e['split_tier'], 'official_finishers': None if official is None else int(official),
            'official_source_type': e['official_source_type'],
            'coverage_pct': None if not official else round(100 * e['finishes_in_release'] / official, 2), 'hold_note': e['hold_note'],
            'release_note': e['release_note'], 'timing_basis': e['timing_basis'], 'race_date': e['race_date'], 'race_date_source': e['race_date_source'],
            'producer_note_date': e['producer_note_date'], 'rows': e['n_records'], 'rows_in_release': e['rows_in_release'], 'rows_left_out': e['rows_left_out'],
            'finishes': e['n_finishes'], 'timing_eligible': eligible.get(key, 0), 'counted': key in counted,
            'own_record': key in excluded and excluded[key]['own_record'], 'not_counted_category': category,
            'reason': None if reason is None else index[reason],
        }
        rows.append([value[c] for c in columns])
    at = {c: i for i, c in enumerate(columns)}
    assert all(r[at['race_id']] for r in rows)
    tiers = {}
    for r in rows:
        t = tiers.setdefault(r[at['tier']], {'editions': 0, 'rows': 0, 'counted': 0})
        t['editions'] += 1
        t['rows'] += r[at['rows']]
        t['counted'] += r[at['counted']]
    by_category = {}
    for r in rows:
        if r[at['not_counted_category']]:
            by_category[r[at['not_counted_category']]] = by_category.get(r[at['not_counted_category']], 0) + 1
    head = {
        'document': 'A first build of the marathon edition directory (proposal; decision D5 of the adoption plan). Not a published data file yet.',
        'schema_version': 0, 'tag': document['tag'], 'distance': 'marathon',
        'inputs': {'adapted_manifest_sha256': sha(source / 'MANIFEST.json'), 'edition_policy_sha256': sha(POLICY), 'race_registry_sha256': sha(race_registry.FROZEN),
                   'edition_screen_csv_sha256': sha(screen_path)},
        'totals': {'editions': len(rows), 'race_keys': len({r[at['release_city']] for r in rows}), 'races': len({r[at['race_id']] for r in rows}), 'rows': sum(r[at['rows']] for r in rows),
                   'rows_in_release': sum(r[at['rows_in_release']] for r in rows), 'counted_editions': sum(r[at['counted']] for r in rows),
                   'own_record_editions': sum(r[at['own_record']] for r in rows),
                   'editions_of_the_release_with_no_written_row': len(document['not_written']),
                   'timing_eligible_in_counted_editions': sum(r[at['timing_eligible']] for r in rows if r[at['counted']]),
                   'by_tier': dict(sorted(tiers.items())), 'not_counted_by_category': dict(sorted(by_category.items())),
                   'with_a_race_date': sum(1 for r in rows if r[at['race_date']]), 'with_only_a_producer_note_date': sum(1 for r in rows if not r[at['race_date']] and r[at['producer_note_date']]),
                   'counted_without_a_race_date': sorted(f'{r[0]} {r[1]}' for r in rows if r[at['counted']] and not r[at['race_date']])},
        'schema': SCHEMA, 'columns': columns, 'reasons': reasons,
        'races': [{k: race[k] for k in ('race_id', 'slug', 'label', 'name', 'place', 'keys', 'joined_by', 'labelled_by', 'flags')} for race in registry['races']],
    }
    lines = [json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows]
    out.write_text(json.dumps(head, indent=1, ensure_ascii=False)[:-2] + ',\n "editions": [\n' + ',\n'.join(lines) + '\n]}\n')
    json.loads(out.read_text())

    # The naming rule's review: the largest races, and what the rule handles badly.
    size, editions, verified, counted_n = {}, {}, {}, {}
    for r in rows:
        rid = r[at['race_id']]
        size[rid] = size.get(rid, 0) + r[at['rows']]
        editions[rid] = editions.get(rid, 0) + 1
        verified[rid] = verified.get(rid, 0) + bool(r[at['verified_badge']])
        counted_n[rid] = counted_n.get(rid, 0) + r[at['counted']]
    races = {race['race_id']: race for race in registry['races']}
    line = lambda rid: {'race_id': rid, 'label': races[rid]['label'], 'labelled_by': races[rid]['labelled_by'], 'name': races[rid]['name'],  # noqa: E731
                        'place': races[rid]['place'], 'keys': races[rid]['keys'], 'joined_by': races[rid]['joined_by'],
                        'flags': races[rid]['flags'], 'editions': editions[rid], 'verified_editions': verified[rid], 'counted_editions': counted_n[rid], 'rows': size[rid]}
    assert all(size[rid] == races[rid]['rows'] and editions[rid] == races[rid]['editions'] for rid in races), 'the registry’s rows or editions differ from the adapted input'
    ordered = sorted(races, key=lambda rid: (-size[rid], rid))
    slug_of_name = {rid: race_registry.slug(races[rid]['name']) for rid in races}
    shared_names = {}
    for rid in races:
        if any(': ' in k for k in races[rid]['keys']):
            shared_names.setdefault(slug_of_name[rid], []).append(rid)
    db = duckdb.connect()
    db.execute("SET memory_limit='2500MB'")
    db.execute('SET threads=2')
    db.execute('CREATE TABLE g (city VARCHAR, race VARCHAR, place VARCHAR)')
    # One row per race: features.city is the race's label; the place form compared is the registry place's.
    db.executemany('INSERT INTO g VALUES (?,?,?)', [(race['label'], rid, race_registry.grouping_form((race['place'] or '') + ': x').split(':')[0])
                                                  for rid, race in races.items()])
    features = str(source / 'features.parquet').replace("'", "''")
    db.execute(f"CREATE TABLE pk AS SELECT DISTINCT f.runner_id, g.race FROM read_parquet('{features}') f JOIN g USING(city) WHERE f.runner_id IS NOT NULL")
    db.execute(f"""CREATE TABLE gy AS SELECT g.race, any_value(g.place) AS place, list(DISTINCT f.year ORDER BY f.year) AS years, count(DISTINCT f.runner_id) AS runners
      FROM read_parquet('{features}') f JOIN g USING(city) GROUP BY 1""")
    candidates = [{'races': [a, b], 'names': [races[a]['name'], races[b]['name']], 'place': place, 'years': [f'{ya[0]} to {ya[-1]}', f'{yb[0]} to {yb[-1]}'],
                   'keyed_runners': [na, nb], 'keyed_runners_in_both': shared}
                  for a, b, shared, na, nb, ya, yb, place in db.execute("""WITH s AS (SELECT a.race AS ra, b.race AS rb, count(*) AS shared FROM pk a JOIN pk b
          ON a.runner_id=b.runner_id AND a.race < b.race GROUP BY ALL HAVING count(*) >= 25)
        SELECT s.ra, s.rb, s.shared, x.runners, y.runners, x.years, y.years, x.place FROM s JOIN gy x ON x.race=s.ra JOIN gy y ON y.race=s.rb
        WHERE x.place = y.place AND x.place <> '' AND len(list_intersect(x.years, y.years)) = 0 AND 10 * s.shared >= least(x.runners, y.runners)
        ORDER BY s.shared DESC, 1, 2""").fetchall()]
    review = {
        'document': 'Review of the race registry’s naming rule on this release (measured; nothing typed).',
        'registry_sha256': sha(race_registry.FROZEN), 'expected': registry['expected'],
        'course_slugs_unchanged': 'analysis/test_race_registry.py holds the 27 slugs of lib/analytics-policy.ts COURSE_SLUGS and requires each as a race_id',
        'largest_races': [line(rid) for rid in ordered[:race_registry.LARGEST]],
        'reviewed_labels': [{'label': races[rid]['label'], 'race_id': rid, 'name': races[rid]['name'], 'place': races[rid]['place'], 'keys': races[rid]['keys'],
                             'rank_by_rows': ordered.index(rid) + 1, 'rows': size[rid], 'editions': editions[rid], 'counted_editions': counted_n[rid],
                             'own_record_editions': sum(1 for r in rows if r[at['race_id']] == rid and r[at['own_record']])}
                            for rid in ordered if races[rid]['labelled_by'] == 'reviewed label'],
        'labels_by_kind': registry['expected']['races_by_label'],
        'longest_labels': [{'label': races[rid]['label'], 'length': len(races[rid]['label']), 'rows': size[rid]} for rid in sorted(races, key=lambda r: (-len(races[r]['label']), r))[:20]],
        'handled_badly': {
            'no_place_platform_prefix': [line(rid) for rid in ordered if 'platform_prefix' in races[rid]['flags'] and not races[rid]['place']],
            'placeholder_place': [line(rid) for rid in ordered if 'placeholder_place' in races[rid]['flags']],
            'place_part_looks_cut_or_repeated': sorted(k for rid in races for k in races[rid]['keys'] if ': ' in k and any(
                len(p.strip()) <= 2 and not p.strip().isupper() for p in k.split(': ')[0].split(',')[1:])),
            'slug_over_60_characters': [{'race_id': rid, 'length': len(rid), 'name': races[rid]['name']} for rid in sorted(races, key=lambda r: (-len(r), r)) if len(rid) > 60],
            'slug_needed_place_or_year': {s: sorted(ids) for s, ids in sorted(shared_names.items()) if len(ids) > 1},
            'title_is_an_event_weekend_or_a_list_of_events': [line(rid) for rid in ordered if 'other_event_in_title' in races[rid]['flags'] or 'no_marathon_word_in_title' in races[rid]['flags']][:60],
            'all_capitals_title_recased': sorted(races[rid]['name'] for rid in races if any(': ' in k and k.split(': ', 1)[1].upper() == k.split(': ', 1)[1] and any(ch.isalpha() for ch in k.split(': ', 1)[1]) for k in races[rid]['keys'][-1:])),
            'html_entity_in_key': sorted(k for rid in races for k in races[rid]['keys'] if '&#' in k or '&amp;' in k),
            'non_latin_or_empty_name_slug': sorted(rid for rid in races if any(': ' in k for k in races[rid]['keys']) and not slug_of_name[rid]),
        },
        'flags': {flag: [line(rid) for rid in ordered if flag in races[rid]['flags']][:40] for flag in
                  ('virtual_in_title', 'cancelled_in_title', 'platform_title_misleads', 'mountain_or_trail_course', 'trail_or_mountain_word_in_title',
                   'title_names_a_hand_cycle_race', 'several_race_names')},
        'not_joined_candidates': {
            'rule': ('pairs of races the registry keeps apart that share the place part, have no year in common and share at least 25 keyed runners and a '
                     'tenth of the smaller side’s; shared runners alone prove nothing (a small race shares runners with the big race nearby), so each '
                     'needs a reader'),
            'pairs': candidates},
    }
    review_out.write_text(json.dumps(review, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'directory': head['totals'], 'review': {k: len(v) for k, v in review['handled_badly'].items()}, 'candidates': len(candidates)}, indent=1)[:2500])


if __name__ == '__main__':
    main(sys.argv)
