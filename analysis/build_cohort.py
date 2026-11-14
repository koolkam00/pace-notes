"""Write the marathon cohort: the names-free records the analyses read, cut by edition.

    python3 -s analysis/build_cohort.py --input <adapted FULL or CORE dir> --status record-status.parquet \
        --identity identity.parquet --output analysis/marathon-cohort

Inputs: the adapted input (through the pipeline's own prepare(), so every time is the one the packs are built on),
the record status file (analysis/build_record_status.py) and the identity file (analysis/build_identity.py). The
format, and why the cohort exists, are in analysis/cohort.py; the rule for what it holds is RULE below.

The builder stops unless the counted records are exactly the eligible cohort of prepare(), the status file agrees with
it record by record, every file reads back to the values written, and the manifest's sums close on the raw records.
"""
import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import duckdb

import cohort as fmt
from build_pacing import POINTS, prepare
from source_quality import edition_report, source_quality_report

RULE = {
    'editions': ('an edition has a file when the edition policy counts it or leaves it an own-record view (`use`: counted or own_record); every other '
                 'edition with written records gives recorded times only and is listed in `other_editions` with its raw count and the policy’s category'),
    'records': ('a file holds every written record of its edition: those that pass the timing checks with id, runner, sex, age and nine times (in a counted '
                'edition they are the counted records, in an own-record edition the own-record records), and every other one with its id, the reason '
                'its timing is not usable and its nine times when all nine parse'),
    'not_held': ('records of editions that give recorded times only: no analysis may use them. A reader that needs their number reads `other_editions`; '
                 'one that needs the records themselves reads the adapted input'),
    'runner': ('the runner of a record is the smallest record id among the written marathon records of its runner key in the identity file '
               '(analysis/build_identity.py: a link of a keyed tier whose person passes the three screens over both distances); a record without a key '
               'has none. No name, bib or person id is written'),
    'times': 'the nine cumulative times in seconds as analysis/build_pacing.py prepare() parses them, exactly',
}
SCRIPTS = ['build_cohort.py', 'cohort.py', 'build_pacing.py', 'source_quality.py', 'build_record_status.py', 'build_identity.py']


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def build(source, status_path, identity_path, output, memory='6GB'):
    source, output = Path(source), Path(output)
    provenance = json.loads((source / 'provenance.json').read_text())
    adapted = json.loads((source / 'MANIFEST.json').read_text())
    assert digest(source / 'MANIFEST.json') == provenance['manifest_sha256'], 'the adapted manifest is not the one its provenance names'
    status_info = json.loads(Path(str(status_path) + '.json').read_text())
    identity_info = json.loads(Path(str(identity_path) + '.json').read_text())
    for name, info, path in (('record status', status_info, status_path), ('identity', identity_info, identity_path)):
        assert info['release_tag'] == provenance['release_tag'] and info['input_manifest_sha256'] == provenance['manifest_sha256'], f'the {name} file is for another input'
        assert info['file']['sha256'] == digest(path), f'the {name} file differs from its own record'
    db = duckdb.connect()
    db.execute(f"SET memory_limit='{memory}'")
    db.execute('SET threads=3')
    counts = prepare(db, source, keep_record_id=True)
    quality = source_quality_report(db, source)
    listed = {(row['city'], row['year']): row for row in edition_report(db, source)['editions']}
    assert status_info['policy_sha256'] == quality['policy_sha256'], 'the record status file was built under another edition policy'
    db.execute(f'CREATE VIEW st AS SELECT * FROM read_parquet({literal(status_path)})')
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    assert one('SELECT count(*) FROM st') == counts['raw'], 'the record status file does not hold one row per written record'
    assert one("SELECT count(*) FROM (SELECT record_id FROM st WHERE status='counted') s FULL JOIN eligible e ON e.rid=s.record_id WHERE s.record_id IS NULL OR e.rid IS NULL") == 0, \
        'the counted records of the status file are not the eligible cohort'
    assert one("SELECT count(*) FROM st s LEFT JOIN timing_eligible t ON t.rid=s.record_id WHERE (s.timing='eligible') <> (t.rid IS NOT NULL)") == 0, \
        'the status file and prepare() disagree on a record’s timing'
    # A runner is named by the smallest written marathon record id of its key.
    db.execute(f"""CREATE TEMP TABLE runner AS SELECT record_id, min(record_id) OVER (PARTITION BY runner_key) AS u
      FROM read_parquet({literal(identity_path)}) WHERE distance='marathon' AND runner_key IS NOT NULL""")
    assert one('SELECT count(*) FROM runner r ANTI JOIN st s USING(record_id)') == 0, 'a runner key on a record that is not written'
    db.execute(f"""CREATE TEMP TABLE cohort_rows AS SELECT s.city, s.year, s.edition_use AS use, (s.timing <> 'eligible')::INTEGER AS kind, s.record_id AS id,
        coalesce(r.u, 0) AS u, raw.sex, raw.age, s.timing AS reason, p.t0, p.t1, p.t2, p.t3, p.t4, p.t5, p.t6, p.t7, p.t8
      FROM st s JOIN read_parquet({literal(source / 'race_records.parquet')}) raw ON raw.id=s.record_id
      LEFT JOIN runner r ON r.record_id=s.record_id LEFT JOIN paced p ON p.rid=coalesce(s.duplicate_of, s.record_id)
      WHERE s.edition_use IN ('counted', 'own_record')""")
    assert one("SELECT count(*) FROM cohort_rows WHERE kind=0 AND (t0 IS NULL OR t8 IS NULL)") == 0
    keys = {(c, y): (race, race_id) for c, y, race, race_id in db.execute(
        f"SELECT city, year, race, race_id FROM read_parquet({literal(source / 'release_keys.parquet')})").fetchall()}
    meta = {(c, y): dict(tier=t, weaker_source=w, timing_basis=b, race_date=d, race_date_source=ds) for c, y, t, w, b, d, ds in db.execute(
        f"SELECT city, year, verification_tier, weaker_source, timing_basis, race_date, race_date_source FROM read_parquet({literal(source / 'edition_meta.parquet')})").fetchall()}
    raw_by_edition = {(c, y): (n, use, category) for c, y, n, use, category in db.execute(
        'SELECT city, year, count(*), any_value(edition_use), any_value(edition_category) FROM st GROUP BY city, year').fetchall()}

    if output.exists():
        shutil.rmtree(output)
    (output / 'editions').mkdir(parents=True)
    entries = []

    def flush(key, use, rows):
        city, year = key
        records = [(r[4], r[5], r[6], r[7], list(r[9:18])) for r in rows if r[3] == 0]
        others = [(r[4], r[8], None if any(t is None for t in r[9:18]) else list(r[9:18])) for r in rows if r[3] == 1]
        race, race_id = keys[key]
        name = fmt.file_name(race_id, year)
        data = fmt.encode_edition(city, year, use, records, others)
        decoded = fmt.decode_edition(data)
        assert decoded['ids'] == [r[0] for r in records] and decoded['runner'] == [r[1] for r in records] and decoded['times'] == [r[4] for r in records] \
            and decoded['sex'] == [r[2] for r in records] and decoded['other_ids'] == [o[0] for o in others] and decoded['other_times'] == [o[2] for o in others] \
            and decoded['other_reasons'] == [o[1] for o in others] and all((a is None) == (r[3] is None) and (a is None or a == r[3]) for a, r in zip(decoded['age'], records)), \
            f'{name}: the file does not read back to the values written'
        assert not (output / name).exists(), f'{name}: two editions would share a file'
        (output / name).write_bytes(data)
        assert raw_by_edition[key][0] == len(records) + len(others)
        entries.append({'city': city, 'year': year, 'race': race, 'race_id': race_id, **meta[key], 'use': use, 'raw': len(records) + len(others),
                        'timing_eligible': len(records), 'eligible': len(records) if use == 'counted' else 0, 'own_record': len(records) if use == 'own_record' else 0,
                        'other': len(others), 'file': name, 'bytes': len(data), 'sha256': fmt.sha256(data), 'decoded_sha256': fmt.decoded_sha256(decoded)})

    cursor = db.execute('SELECT city, year, use, kind, id, u, sex, age, reason, t0, t1, t2, t3, t4, t5, t6, t7, t8 FROM cohort_rows ORDER BY city, year, kind, id')
    current, use, rows = None, None, []
    while batch := cursor.fetchmany(200_000):
        for row in batch:
            key = (row[0], row[1])
            if key != current:
                if rows:
                    flush(current, use, rows)
                current, use, rows = key, row[2], []
            rows.append(row)
    if rows:
        flush(current, use, rows)

    others = sorted([c, y, n, category] for (c, y), (n, use, category) in raw_by_edition.items() if use == 'recorded_times_only')
    assert {(e['city'], e['year']) for e in entries} == {k for k, v in raw_by_edition.items() if v[1] != 'recorded_times_only'}
    assert all(listed[(c, y)]['category'] == category for c, y, _, category in others) and all((e['use'] == 'counted') == ((e['city'], e['year']) not in listed) for e in entries)
    eligible, own = sum(e['eligible'] for e in entries), sum(e['own_record'] for e in entries)
    assert eligible == counts['eligible'], 'the counted records are not the eligible cohort'
    assert own == status_info['counts']['by_status'].get('own_record', 0) == quality.get('counts', {}).get('timing_eligible_own_record', own)
    assert sum(e['raw'] for e in entries) + sum(row[2] for row in others) == counts['raw'], 'the raw records do not add up'
    db.execute("CREATE TEMP TABLE counted_rows AS SELECT id, year, u FROM cohort_rows WHERE kind=0 AND use='counted'")
    linkage = {
        'identity_rule': 'analysis/build_identity.py (links of a keyed tier whose person passes the three screens, over both distances)',
        'record_join_method': 'canonical_record_id',
        'counted_records_with_a_runner': one('SELECT count(*) FROM counted_rows WHERE u > 0'),
        'runners_with_a_counted_record': one('SELECT count(DISTINCT u) FROM counted_rows WHERE u > 0'),
        'runners_with_two_or_more_counted_records': one('SELECT count(*) FROM (SELECT u FROM counted_rows WHERE u > 0 GROUP BY u HAVING count(*) > 1)'),
        'counted_records_of_those_runners': one('SELECT coalesce(sum(n), 0)::BIGINT FROM (SELECT count(*) AS n FROM counted_rows WHERE u > 0 GROUP BY u HAVING count(*) > 1)'),
        # A counted finish whose runner has another counted finish in one of the two calendar years before it (the
        # benchmark rule of analysis/build_extended.py, on this identity).
        'recent_benchmark_finishes': one("""SELECT count(*) FROM counted_rows a WHERE u > 0 AND EXISTS (
          SELECT 1 FROM counted_rows b WHERE b.u=a.u AND b.year < a.year AND b.year >= a.year - 2)"""),
    }
    entries.sort(key=lambda e: (e['city'], e['year']))
    manifest = {
        'schema_version': fmt.SCHEMA_VERSION,
        'document': ('The marathon cohort: the names-free records every marathon analysis and every recount reads (format: analysis/cohort.py; readers: '
                     'analysis/cohort.py and scripts/lib/cohort.cjs). An output stores the SHA-256 of this file’s exact bytes to say which cohort it was built on.'),
        'release_tag': provenance['release_tag'], 'input_as_of': adapted['created_at'],
        'as_of': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'input_asset_sha256': provenance['asset_sha256'], 'input_manifest_sha256': provenance['manifest_sha256'],
        'inputs': {'record_status': {'sha256': status_info['file']['sha256'], 'bytes': status_info['file']['bytes']},
                   'identity': {'sha256': identity_info['file']['sha256'], 'bytes': identity_info['file']['bytes']}},
        'scripts': {name: digest(Path(__file__).with_name(name)) for name in SCRIPTS},
        'rule': RULE, 'points_km': fmt.POINTS_KM,
        'cohort': counts, 'source_quality': quality,
        'raw_records': counts['raw'], 'eligible_records': eligible, 'own_record_records': own,
        'timing_eligible_records_held': sum(e['timing_eligible'] for e in entries), 'other_records_held': sum(e['other'] for e in entries),
        'records_in_other_editions': sum(row[2] for row in others),
        'linkage': linkage,
        'files': {'count': len(entries), 'bytes': sum(e['bytes'] for e in entries)},
        'decoded_sha256': fmt.sha256(''.join(e['decoded_sha256'] for e in entries).encode()),
        'editions': entries,
        'other_editions': {'columns': ['city', 'year', 'raw', 'category'], 'rows': others},
    }
    assert POINTS == fmt.POINTS_KM
    head = {k: v for k, v in manifest.items() if k not in ('editions', 'other_editions')}
    text = (json.dumps(head, indent=1, ensure_ascii=False, allow_nan=False)[:-2] + ',\n "editions": [\n'
            + ',\n'.join('  ' + json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries) + '\n ],\n "other_editions": {"columns": '
            + json.dumps(manifest['other_editions']['columns']) + ', "rows": [\n'
            + ',\n'.join('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in others) + '\n ]}\n}\n')
    assert json.loads(text) == manifest
    (output / 'manifest.json').write_text(text)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--status', type=Path, required=True)
    parser.add_argument('--identity', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    manifest = build(args.input, args.status, args.identity, args.output)
    print(json.dumps({'written': str(args.output), 'manifest_sha256': digest(args.output / 'manifest.json'),
                      **{k: manifest[k] for k in ('release_tag', 'raw_records', 'eligible_records', 'own_record_records', 'timing_eligible_records_held',
                                                  'other_records_held', 'records_in_other_editions', 'files', 'linkage', 'decoded_sha256')}}, indent=1))


if __name__ == '__main__':
    main()
