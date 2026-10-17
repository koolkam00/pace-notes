"""Reviewed, release-specific edition exclusions; never infer them from row counts.

The complete source export is retained. These rules select the analytical cohort,
independently of the feature engine's gender-dependent ``valid_splits`` flag.
"""
import hashlib
import json
from pathlib import Path


RELEASE = 'private-export-20260911-1107'
RULES = [
    ('Honolulu', 2016, 'invalid_split_grid', 'Producer explicitly force-dropped this incomplete 5 km grid.'),
    ('Rotterdam', 2012, 'invalid_split_grid', 'Producer explicitly force-dropped this incomplete 5 km grid.'),
    ('Eindhoven', 2009, 'invalid_split_grid', 'Producer explicitly force-dropped this incomplete 5 km grid.'),
    ('Eindhoven', 2010, 'invalid_split_grid', 'Producer explicitly force-dropped this incomplete 5 km grid.'),
    ('Frankfurt', 2019, 'invalid_split_grid', 'Producer explicitly force-dropped this 5 km grid; numerically plausible rows are not reinstated.'),
    ('New York', 2008, 'incomplete_ingestion', 'Release notes identify a partial live-ingestion snapshot of only 200 records.'),
    ('Chicago', 2016, 'incomplete_ingestion', 'Producer handoff identifies this 6,512-record edition as incomplete and on HOLD.'),
    ('Tokyo', 2026, 'selected_field', 'Source notes identify top-500 PDFs, not a representative full marathon field.'),
    ('Amsterdam', 2025, 'unreconciled_hold', 'Source audit marks HOLD: 23,328 listed versus 23,325 retrieved. This conservative hold does not establish a large bias from the three missing records.'),
    ('Valencia', 2017, 'incomplete_ingestion', 'Source audit marks HOLD: 3,373 listed detail pages missing; the observed records also lack 20 km.'),
]
LATEST_RELEASE = 'private-export-20260912-0934'
LATEST_RULES = [
    (city, year, 'unreconciled_hold',
     'Previously partial ingestion has grown to 38,047 records, but source-total reconciliation and explicit completion evidence are absent; keep the prior hold pending review.')
    if (city, year) == ('New York', 2008) else (city, year, category, reason)
    for city, year, category, reason in RULES
] + [
    ('Valencia', 2018, 'incomplete_ingestion', 'Producer handoff retains an incomplete/HOLD status; the edition also lacks the observed 20 km checkpoint.'),
]

# Reviewed October 16, 2026 for htw-db-2026-10-16-1652 (docs/REFRESH_20261016_1652.md and
# docs/evidence/2026-10-16/refresh-1652/edition-policy-review.json hold the measured evidence).
# The release is not append-only: Chicago 2018/2019 and Frankfurt 2019 were reloaded with new IDs,
# and Paris 2014-2018 checkpoints were rewritten in place. Decisions, in brief:
# - Carried unchanged: the four producer force-dropped grids, New York 2008 (no new evidence since
#   the reviewed 0934 hold), Amsterdam 2025, Valencia 2017 and 2018.
# - Chicago 2016 is released: its 0934 hold described a 6,512-record partial load. It is now 40,554
#   records, both finish-order lists run to their slowest finishers with no gaps, it sits 31 above
#   the outside finisher total, and the producer's freeze notes and the owner name only Chicago 2015
#   as partial in this snapshot.
# - Frankfurt 2019 changes to a hold: its records are now the real 2019 race (the producer's registry
#   says complete and winner-verified), but the producer's feature engine still force-drops it.
# - New, from producer flags: Chicago 2015 (partial), Oslo 2026 (INCOMPLETE), Amsterdam 2020 (virtual).
# - New, from top-finisher lists or a cut-off finisher set: Tokyo 2016-2018 (500 per sex, as Tokyo
#   2026) and Boston 2013 (the race was stopped, so no finish is slower than 4:45).
# - New, from three audit screens applied to every edition (thresholds fixed before reading the
#   results by edition; none uses edition size):
#   (a) residue: under 5% of an edition's finishers have a usable grid (Paris 2014-2018);
#   (b) outcome-selective timing: at least 75% of the fastest finish quartile but under 50% of the
#       slowest passes the timing checks (Gold Coast 2024, Auckland 2018, Dubai 2025, plus Barcelona
#       2019 and Eindhoven 2026), the next edition is Washington 2017 at 55.6% (kept, noted);
#   (c) mixed timing bases: at least 25% of complete grids finish at or before 40 km or run the last
#       2.195 km faster than 2:00/km (New York 2007, Barcelona 2019, Eindhoven 2026); the next
#       edition is Warsaw 2025 at 12.4% (kept, noted).
#   Plus two loads the audit found broken: Amsterdam 2023 (finish loaded on 17 of 16,030 records)
#   and Melbourne 2015 (about 500 of some 6,000 finishers, 26 repeated records).
# Reasons are shown to visitors (/runners, course pages), so they avoid rank words ("fastest" and the like), which the
# course pages' copy check rejects; reworded October 17, 2026 before the final calculation, decisions unchanged.
_PARIS_1652 = {2014: (40, 38672, 99), 2015: (70, 40261, 98), 2016: (526, 41795, 97), 2017: (11, 41734, 99), 2018: (11, 42522, 98)}
RELEASE_1652 = 'htw-db-2026-10-16-1652'
RULES_1652 = [
    rule for rule in LATEST_RULES if rule[:2] not in {('Chicago', 2016), ('Frankfurt', 2019), ('Tokyo', 2026)}
] + [
    ('Frankfurt', 2019, 'unreconciled_hold',
     'The earlier, wrongly dated records were replaced by the real 2019 race, which the producer lists as complete, '
     'but the producer\u2019s feature engine still drops this edition from its valid set. Held until the producer reconciles the two.'),
    ('Tokyo', 2026, 'selected_field',
     'Source notes identify top-500 result PDFs, not a representative full marathon field; the 770 records are all men.'),
    ('Chicago', 2015, 'incomplete_ingestion',
     'Producer notes say this edition was still being loaded when the snapshot was taken: 27,186 records, loaded in finish '
     'order and stopping at 5:31:05 for women and 4:45:16 for men, about three quarters of the field.'),
    ('Oslo', 2026, 'incomplete_ingestion',
     'Producer marks this edition INCOMPLETE: 3,461 of 3,462 listed runners were retrieved. One missing record is unlikely '
     'to bias the results; the edition is held until the producer completes it.'),
    ('Amsterdam', 2020, 'invalid_split_grid',
     'Producer notes mark this a virtual edition (the race on the course was cancelled in 2020), so these times are not '
     'checkpoint timings from the race course.'),
    ('Amsterdam', 2023, 'incomplete_ingestion',
     'The finish time was loaded for only 17 of 16,030 records, although 40 km is present for 16,008; the 14 complete '
     'grids are what is left, not a sample of the field.'),
    ('Melbourne', 2015, 'incomplete_ingestion',
     'Only about 500 of the roughly 6,000 finishers were loaded, from individual result pages, and 24 runners appear two or '
     'three times under name variants; the records are neither the full field nor a sample of it.'),
    ('Boston', 2013, 'selected_field',
     'The race was stopped after the bombings near the finish, so the recorded finishers are only those who finished before '
     'the course closed (none slower than 4:45). A finisher set cut off by finish time is not comparable with other editions.'),
] + [
    ('Tokyo', year, 'selected_field',
     f'Exactly 500 women and 500 men, the first 500 of each to finish (the last at {slowest}): a top-finisher list, not the '
     'full field of more than 30,000 finishers.')
    for year, slowest in [(2016, '3:35:49'), (2017, '3:29:26'), (2018, '3:27:07')]
] + [
    ('Paris', year, 'invalid_split_grid',
     f'This release rewrote the edition\u2019s 10\u201340 km checkpoints in place; 25 km is now blank for about {blank}% of '
     f'records, and the {kept:,} complete grids left of {finishers:,} finishes include leftover impossible timings, so they '
     'are not a sample of the field.')
    for year, (kept, finishers, blank) in sorted(_PARIS_1652.items())
] + [
    ('New York', 2007, 'invalid_split_grid',
     'The 25\u201340 km checkpoints are missing for about a third of finishers, and 40% of the complete grids have an impossible '
     'last section (checkpoint times include the start delay, the finish does not). The 40% of finishers that pass the '
     'timing checks are not a sample of the field.'),
    ('Barcelona', 2019, 'invalid_split_grid',
     'The checkpoint times include the start delay but the finish does not: half of the complete grids have an impossible '
     'last section, and the finishers that pass the timing checks are mostly the faster, earlier starters (80% of the quarter '
     'with the shortest finish times, 18% of the quarter with the longest).'),
    ('Eindhoven', 2026, 'invalid_split_grid',
     'Our audit, not the producer, flags this edition: its checkpoints mix two timing bases (the 5 km reading came from '
     'separate runner pages). 1,880 of 4,466 complete grids put the finish at or before 40 km, and the rows that pass the '
     'timing checks still run 5\u201310 km up to about 30% slower than 10\u201315 km.'),
    ('Gold Coast', 2024, 'invalid_split_grid',
     'The 35 km mat stopped recording partway through the field: 35 km is missing for 2,729 of 8,665 finishers, almost all '
     'of them slower ones, so complete timings survive for 95% of the quarter with the shortest finish times but 1% of the '
     'quarter with the longest.'),
    ('Auckland', 2018, 'invalid_split_grid',
     'The 40 km mat stopped recording partway through the field: 40 km is missing for 685 of 1,654 finishers, so complete '
     'timings survive for 97% of the quarter with the shortest finish times and none of the quarter with the longest.'),
    ('Dubai', 2025, 'invalid_split_grid',
     'The 40 km mat stopped recording late in the race: 40 km is missing for 267 of 1,809 finishers, almost all of them '
     'slower ones, so complete timings survive for nearly all of the three quarters with the shortest finish times but 41% '
     'of the quarter with the longest.'),
]
REVIEWED_POLICIES = {RELEASE: RULES, LATEST_RELEASE: LATEST_RULES, RELEASE_1652: RULES_1652}
METHOD = ('Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. '
          'Known invalid split grids (including grids that mix timing bases, a checkpoint that stopped recording partway '
          'through the field and a virtual edition), incomplete ingestion, unreconciled HOLD editions and selected fields '
          '(a top-finisher list, or finishers cut off when a race was stopped) do not contribute to the analyses or prior '
          'benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age '
          'or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse '
          'editions are not declared incomplete merely from their size.')


def release_tag(source):
    provenance = Path(source) / 'provenance.json'
    return json.loads(provenance.read_text()).get('release_tag') if provenance.exists() else None


def policy_metadata(tag):
    active = tag in REVIEWED_POLICIES
    rules = [{'city': city, 'year': year, 'category': category, 'reason': reason}
             for city, year, category, reason in REVIEWED_POLICIES[tag]] if active else []
    payload = {'version': 1, 'release_tag': tag, 'reviewed_edition_policy': active, 'editions': rules}
    payload['policy_sha256'] = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    payload['script_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    return payload


def install_policy(db, source):
    policy = policy_metadata(release_tag(source))
    db.execute('CREATE TEMP TABLE source_quality_editions (city VARCHAR, year INTEGER, category VARCHAR, reason VARCHAR)')
    if policy['editions']:
        db.executemany('INSERT INTO source_quality_editions VALUES (?,?,?,?)',
                       [[row[key] for key in ('city', 'year', 'category', 'reason')] for row in policy['editions']])
    return policy


def source_quality_report(db, source):
    """Read the prepared cohort's edition audit without exporting runner records."""
    policy = policy_metadata(release_tag(source))
    raw = dict(((city, year), n) for city, year, n in db.execute(
        'SELECT city,year,count(*) FROM read_parquet(?) GROUP BY city,year',
        [str(Path(source) / 'race_records.parquet')]).fetchall())
    deduplicated = dict(((city, year), n) for city, year, n in db.execute(
        'SELECT city,year,count(*) FROM unique_records GROUP BY city,year').fetchall())
    timing = dict(((city, year), n) for city, year, n in db.execute(
        'SELECT city,year,count(*) FROM timing_eligible GROUP BY city,year').fetchall())
    for row in policy['editions']:
        key = row['city'], row['year']
        row.update(raw_records=raw.get(key, 0), deduplicated_records=deduplicated.get(key, 0),
                   timing_eligible_excluded=timing.get(key, 0))
    return policy


def validate_source_quality(meta):
    """Validate policy provenance and disjoint exclusion counts during import."""
    tag = meta['input_export_id'].replace('private-', 'private-export-', 1)
    count = meta['cohort'].get('source_quality_excluded', 0)
    report = meta.get('source_quality')
    if report is None:
        assert tag not in REVIEWED_POLICIES and count == 0, 'Missing reviewed source-quality provenance'
        return
    expected = policy_metadata(tag)
    for key in ('version', 'release_tag', 'reviewed_edition_policy', 'policy_sha256', 'script_sha256'):
        assert report[key] == expected[key], f'Source-quality {key} mismatch'
    assert meta['source_quality_script_sha256'] == expected['script_sha256'], 'Source-quality script mismatch'
    assert len(report['editions']) == len(expected['editions']), 'Source-quality edition count mismatch'
    for row, rule in zip(report['editions'], expected['editions']):
        assert all(row[key] == value for key, value in rule.items()), 'Source-quality edition rule mismatch'
        sizes = [row[key] for key in ('raw_records', 'deduplicated_records', 'timing_eligible_excluded')]
        assert all(isinstance(n, int) and not isinstance(n, bool) and n >= 0 for n in sizes), 'Invalid source-quality counts'
        assert sizes[0] >= sizes[1] >= sizes[2], 'Source-quality counts do not nest'
    assert sum(row['timing_eligible_excluded'] for row in report['editions']) == count, 'Source-quality exclusions do not reconcile'
    assert meta['cohort']['timing_eligible'] == meta['cohort']['eligible'] + count, 'Timing and source eligibility do not reconcile'
