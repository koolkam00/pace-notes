"""Recount the marathon cohort from its files: against its manifest, the record status file and the identity file.

    python3 -s analysis/verify_cohort.py --cohort analysis/marathon-cohort [--status record-status.parquet] [--identity identity.parquet] [--input <adapted dir>]

From the checked-in files alone (as scripts/verify-cohort.cjs does in Node): every file the manifest lists is present
with its size and SHA-256 and no other file is; every edition decodes, and the digest of its decoded values is the
manifest's; ids are unique over the whole cohort; every timing-eligible record meets the timing contract of
analysis/build_pacing.py (nine increasing times, a finish from 1:30 to 12:00, every section from 2:00 to 20:00 per km)
and no other record with nine times does; a runner has at most one record per edition and at most one of the sexes M
and F, and a link class (h or m) exactly when it has a runner; every count in the manifest is the one the files give,
the counted records being the eligible cohort, the raw records closing on the manifest's cohort and the linkage counts
recounted over every link and over high links alone; and every counted edition has a race date, each date its source,
and an edition's `series`, where it has one, is its race name.

With `--status`: every written record is where the status file says: counted and own-record records in a file of an
edition of that use, the other records of those editions with the reason the status file gives, and the records of
every other edition in no file, with the raw count and category the manifest lists. With `--identity`: every runner
is the smallest written marathon record id of its key, a record has a runner exactly when the identity file keys
it, and its link class is the class of the tier the identity file gives the link. With `--input`: the manifest lists exactly the written editions of the adapted input, each with the tier,
weaker-source mark, split tier, timing basis and race date of its `edition_meta` row.
"""
import argparse
import json
import re
from pathlib import Path

import cohort as fmt

LENGTHS = [5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 2.195]


def timing_ok(t):
    """The timing contract of analysis/build_pacing.py prepare(), restated."""
    if not (t[0] > 0 and all(a < b for a, b in zip(t, t[1:])) and 5400 <= t[8] <= 43200):
        return False
    return all(120 <= (b - a) / length <= 1200 for a, b, length in zip([0.0, *t], t, LENGTHS))


def verify_files(root):
    """Everything that needs only the cohort folder. Returns (manifest, manifest sha256, rows) where rows are
    (record_id, city, year, use or None, reason or None, runner, link class or None) for the later checks."""
    root = Path(root)
    manifest, manifest_sha = fmt.read_manifest(root)
    listed = [e['file'] for e in manifest['editions']]
    assert len(listed) == len(set(listed)), 'a file listed twice'
    present = sorted(str(p.relative_to(root)) for p in (root / 'editions').iterdir())
    assert present == sorted(listed), f'files that the manifest does not list, or listed files that are missing: {sorted(set(present) ^ set(listed))[:5]}'
    assert [(e['city'], e['year']) for e in manifest['editions']] == sorted((e['city'], e['year']) for e in manifest['editions']), 'editions out of order'
    for e in manifest['editions']:
        name = f"{e['city']} {e['year']}"
        assert (e['race_date'] is None) == (e['race_date_source'] is None), f'{name}: a race date without its source, or a source without a date'
        assert e['race_date'] is None or (re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', e['race_date']) and e['race_date_source'] in fmt.DATE_SOURCES), f'{name}: its race date'
        assert e['use'] != 'counted' or e['race_date'], f'{name}: a counted edition without a race date'
        assert e['series'] is None or e['series'] == e['race'], f'{name}: its series is not its race name'
    rows, seen = [], set()
    totals = {'raw': 0, 'timing_eligible': 0, 'eligible': 0, 'own_record': 0, 'other': 0, 'bytes': 0}
    runners, digests = {}, []
    for index, entry, edition in fmt.editions(root, manifest):
        assert fmt.decoded_sha256(edition) == entry['decoded_sha256'], f"{entry['file']}: decoded values differ from the manifest's digest"
        assert entry['file'] == fmt.file_name(entry['race_id'], entry['year'])
        digests.append(entry['decoded_sha256'])
        ids, others = edition['ids'], edition['other_ids']
        assert ids == sorted(set(ids)) and others == sorted(set(others)), f"{entry['file']}: ids out of order or repeated"
        for rid in ids + others:
            assert rid not in seen, f'record {rid} is in two places'
            seen.add(rid)
        n = len(ids)
        assert (entry['raw'], entry['eligible'], entry['own_record']) == (n + len(others), n if entry['use'] == 'counted' else 0, n if entry['use'] == 'own_record' else 0), \
            f"{entry['file']}: counts"
        for rid, runner, link, sex, times in zip(ids, edition['runner'], edition['link'], edition['sex'], edition['times']):
            assert timing_ok(times), f'record {rid}: a timing-eligible record breaks the timing contract'
            assert runner == 0 or 0 < runner <= rid, f'record {rid}: a runner id above the record’s own'
            assert (link in ('h', 'm')) if runner else link is None, f'record {rid}: a link class without a runner, or a runner without one'
            rows.append((rid, entry['city'], entry['year'], entry['use'], None, runner, link))
            if runner:
                seen_editions, sexes = runners.setdefault(runner, (set(), set()))
                assert index not in seen_editions, f'runner {runner}: two records in {entry["city"]} {entry["year"]}'
                seen_editions.add(index)
                if sex in ('M', 'F'):
                    sexes.add(sex)
                    assert len(sexes) == 1, f'runner {runner}: both sexes'
        for rid, reason, times in zip(others, edition['other_reasons'], edition['other_times']):
            assert (times is None) if reason == 'missing_checkpoints' else (times is not None or reason == 'duplicate'), f'record {rid}: times and reason disagree'
            assert reason == 'duplicate' or times is None or not timing_ok(times), f'record {rid}: a record that meets the timing contract is listed as {reason}'
            rows.append((rid, entry['city'], entry['year'], None, reason, 0, None))
        for key, value in (('raw', entry['raw']), ('timing_eligible', n), ('eligible', entry['eligible']), ('own_record', entry['own_record']),
                           ('other', len(others)), ('bytes', entry['bytes'])):
            totals[key] += value
    other_raw = sum(row[2] for row in manifest['other_editions']['rows'])
    for e in manifest['editions'] + fmt.other_editions(manifest):
        assert e['tier'] in fmt.TIERS and isinstance(e['weaker_source'], bool) and e['split_tier'] in fmt.SPLIT_TIERS, f"{e['city']} {e['year']}: its tier fields"
        assert e['weaker_source'] == (e['tier'] == 'stamped_weaker_source'), f"{e['city']} {e['year']}: its weaker-source mark is not its tier’s"
    assert not {(row[0], row[1]) for row in manifest['other_editions']['rows']} & {(e['city'], e['year']) for e in manifest['editions']}, 'an edition is listed twice'
    cohort = manifest['cohort']
    assert totals['eligible'] == manifest['eligible_records'] == cohort['eligible'], 'the counted records are not the eligible cohort'
    assert totals['raw'] + other_raw == manifest['raw_records'] == cohort['raw'], 'the raw records do not add up'
    assert (totals['own_record'], totals['timing_eligible'], totals['other'], other_raw) == (
        manifest['own_record_records'], manifest['timing_eligible_records_held'], manifest['other_records_held'], manifest['records_in_other_editions'])
    assert manifest['files'] == {'count': len(listed), 'bytes': totals['bytes']}
    assert manifest['decoded_sha256'] == fmt.sha256(''.join(digests).encode())
    quality = manifest['source_quality']
    if 'counts' in quality:
        assert quality['counts']['timing_eligible_own_record'] == totals['own_record'], 'the own-record records differ from the policy’s counts'
        assert quality['counts']['editions'] == len(manifest['other_editions']['rows']) + sum(1 for e in manifest['editions'] if e['use'] == 'own_record')
    assert cohort['timing_eligible'] == cohort['eligible'] + cohort['source_quality_excluded']
    def linked(records):
        """The linkage counts over counted records that are followed by their runner."""
        groups = {}
        for r in records:
            groups.setdefault(r[5], []).append(r[2])
        return {'counted_records_with_a_runner': len(records), 'runners_with_a_counted_record': len(groups),
                'runners_with_two_or_more_counted_records': sum(1 for years in groups.values() if len(years) > 1),
                'counted_records_of_those_runners': sum(len(years) for years in groups.values() if len(years) > 1),
                'recent_benchmark_finishes': sum(1 for years in groups.values() for y in years if any(y - 2 <= other < y for other in years))}
    counted = [r for r in rows if r[3] == 'counted']
    linkage = manifest['linkage']
    every = linked([r for r in counted if r[5]])
    assert {key: linkage[key] for key in every} == every, 'linkage counts or benchmark count'
    assert linkage['high_links'] == linked([r for r in counted if r[6] == 'h']), 'linkage counts on high links alone'
    return manifest, manifest_sha, rows


def verify_status(db, manifest, status_path):
    """The cohort against the record status file, record by record."""
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    path = str(status_path).replace("'", "''")
    db.execute(f"CREATE OR REPLACE VIEW st AS SELECT * FROM read_parquet('{path}')")
    assert one('SELECT count(*) FROM st') == manifest['raw_records'], 'the status file has another number of records'
    wrong = one("""SELECT count(*) FROM c FULL JOIN (SELECT * FROM st WHERE edition_use <> 'recorded_times_only') s ON s.record_id=c.record_id
      WHERE c.record_id IS NULL OR s.record_id IS NULL OR c.city IS DISTINCT FROM s.city OR c.year IS DISTINCT FROM s.year
        OR (c.use IS NOT NULL AND (s.status IS DISTINCT FROM c.use OR s.edition_use IS DISTINCT FROM c.use))
        OR (c.use IS NULL AND (s.status <> 'limited' OR s.reason IS DISTINCT FROM c.reason OR s.timing IS DISTINCT FROM c.reason))""")
    assert wrong == 0, f'{wrong} records differ between the cohort and the status file'
    others = {(c, y): (n, category) for c, y, n, category in db.execute(
        "SELECT city, year, count(*), any_value(edition_category) FROM st WHERE edition_use = 'recorded_times_only' GROUP BY city, year").fetchall()}
    assert others == {(row[0], row[1]): (row[2], row[3]) for row in manifest['other_editions']['rows']}, 'the editions without a file differ from the status file'
    by_status = dict(db.execute('SELECT status, count(*) FROM st GROUP BY 1').fetchall())
    assert (by_status.get('counted', 0), by_status.get('own_record', 0)) == (manifest['eligible_records'], manifest['own_record_records'])
    return {'records_in_the_status_file': manifest['raw_records'], 'counted': by_status.get('counted', 0), 'own_record': by_status.get('own_record', 0),
            'editions_without_a_file': len(others)}


def verify_identity_description(manifest, identity_path):
    """The checked-in description the manifest names is the one the identity builder wrote beside the identity file."""
    named = manifest['inputs']['identity'].get('description')
    if not named:
        return None
    checked_in = Path(__file__).resolve().parent.parent / named['file']
    assert fmt.sha256(checked_in.read_bytes()) == named['sha256'], f"{named['file']} is not the identity description the manifest names"
    assert checked_in.read_bytes() == Path(str(identity_path) + '.json').read_bytes(), f"{named['file']} is not the description beside the identity file"
    return named


def verify_identity(db, identity_path):
    """Every runner is the smallest written marathon record id of its key; a record has one exactly when it is keyed,
    and its link class is the class of the link's tier in the identity file."""
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    path = str(identity_path).replace("'", "''")
    high = ', '.join(f"'{tier}'" for tier in fmt.HIGH_TIERS)
    db.execute(f"""CREATE OR REPLACE TEMP TABLE runner_of AS SELECT record_id, min(record_id) OVER (PARTITION BY runner_key) AS u,
        CASE WHEN link_tier IN ({high}) THEN 'h' WHEN link_tier = 'medium' THEN 'm' END AS link
      FROM read_parquet('{path}') WHERE distance='marathon' AND runner_key IS NOT NULL""")
    wrong = one('SELECT count(*) FROM c LEFT JOIN runner_of r USING(record_id) WHERE c.use IS NOT NULL AND (c.runner <> coalesce(r.u, 0) OR c.link IS DISTINCT FROM r.link)')
    assert wrong == 0, f'{wrong} records whose runner or link class is not the identity file’s'
    return {'records_with_a_runner': one('SELECT count(*) FROM c WHERE runner > 0'), 'runners': one('SELECT count(DISTINCT runner) FROM c WHERE runner > 0'),
            'records_on_a_high_link': one("SELECT count(*) FROM c WHERE link = 'h'")}


def verify_tiers(db, manifest, source):
    """The manifest against the adapted input's edition_meta: exactly its written editions, each with its tier fields."""
    path = str(Path(source) / 'edition_meta.parquet').replace("'", "''")
    meta = {(c, y): rest for c, y, *rest in db.execute(
        f"SELECT city, year, verification_tier, weaker_source, split_tier, timing_basis, race_date, race_date_source FROM read_parquet('{path}')").fetchall()}
    held = {(e['city'], e['year']): [e['tier'], e['weaker_source'], e['split_tier'], e['timing_basis'], e['race_date'], e['race_date_source']] for e in manifest['editions']}
    others = {(e['city'], e['year']): [e['tier'], e['weaker_source'], e['split_tier']] for e in fmt.other_editions(manifest)}
    assert set(held) | set(others) == set(meta) and not set(held) & set(others), 'the manifest does not list exactly the written editions of the adapted input'
    wrong = [f'{c} {y}' for (c, y), fields in held.items() if fields != meta[(c, y)]] + [f'{c} {y}' for (c, y), fields in others.items() if fields != meta[(c, y)][:3]]
    assert not wrong, f'editions whose tier fields differ from the adapted edition_meta: {wrong[:10]}'
    return {'editions_checked': len(meta), 'by_tier': {tier: sum(1 for fields in meta.values() if fields[0] == tier) for tier in fmt.TIERS}}


def verify(root, status_path=None, identity_path=None, source=None):
    manifest, manifest_sha, rows = verify_files(root)
    report = {'cohort': str(root), 'manifest_sha256': manifest_sha, 'release_tag': manifest['release_tag'], 'files': manifest['files'],
              'raw_records': manifest['raw_records'], 'eligible_records': manifest['eligible_records'], 'own_record_records': manifest['own_record_records'],
              'records_recounted': len(rows)}
    if status_path or identity_path or source:
        import duckdb
        import pandas
        db = duckdb.connect()
        db.execute("SET memory_limit='4GB'")
        frame = pandas.DataFrame(rows, columns=['record_id', 'city', 'year', 'use', 'reason', 'runner', 'link'])
        db.register('cohort_frame', frame)
        db.execute('CREATE TEMP TABLE c AS SELECT * FROM cohort_frame')
        if status_path:
            report['status'] = verify_status(db, manifest, status_path)
        if identity_path:
            report['identity'] = verify_identity(db, identity_path)
            report['identity']['description'] = verify_identity_description(manifest, identity_path)
        if source:
            report['tiers'] = verify_tiers(db, manifest, source)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--cohort', type=Path, required=True)
    parser.add_argument('--status', type=Path)
    parser.add_argument('--identity', type=Path)
    parser.add_argument('--input', type=Path, help='the adapted input: check every edition’s tier fields against its edition_meta')
    args = parser.parse_args(argv)
    print(json.dumps(verify(args.cohort, args.status, args.identity, args.input), indent=1))


if __name__ == '__main__':
    main()
