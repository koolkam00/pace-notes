"""One row per written marathon record: counted, own-record, or limited with a reason code.

    python3 -s analysis/build_record_status.py --input <adapted FULL or CORE dir> --output record-status.parquet

Two levels of use (lead ruling R4 of the adoption plan, 2026-11-14). A record is

- `counted` when it passes the timing checks and its edition is counted by the edition policy: it supplies pooled
  statistics and peer comparisons;
- `own_record` when it passes the timing checks and its edition is not counted but keeps an own-record view (the
  policy's `own_record`: unverified, or partial outside the coverage band, with a split grid that passes the three
  screens): the runner's own sections may be shown with the edition's tier, and it enters no pooled figure and no
  peer comparison;
- `limited` otherwise: recorded times only. `reason` then says why, edition first: an edition that gives recorded
  times only names its reason for every record of it (`finish_time_only`, `held_for_review`, `invalid_split_grid`,
  which also stands for an unverified or partial edition whose grid fails a screen, or `reviewed_exception` for every
  other reviewed category); in a counted or own-record edition the reason is the record's own timing outcome
  (`duplicate`, `missing_checkpoints`, `times_out_of_order`, `outside_bounds`).

The statuses come from the pipeline's own `prepare` (analysis/build_pacing.py) and the installed edition policy, so
they cannot disagree with the cohort: the builder stops unless `counted` is exactly the eligible cohort and each
timing outcome has the count `prepare` reports. Columns:

    record_id         BIGINT   race_records.id
    city, year                 the edition, as the pipeline names it (`city` is the race's registry label)
    status            VARCHAR  counted | own_record | limited
    reason            VARCHAR  null unless limited (codes above)
    timing            VARCHAR  the record's own timing outcome: eligible | duplicate | missing_checkpoints |
                               times_out_of_order | outside_bounds (checked in that order, as prepare does)
    edition_use       VARCHAR  counted | own_record | recorded_times_only
    edition_category  VARCHAR  the policy's category of an edition that is not counted, else null
    duplicate_of      BIGINT   for timing = duplicate: the record kept (the smallest id among identical records)

No name is written. Rows are ordered by record_id. The parquet's key-value metadata repeats the release tag, the input
manifest digest, the policy digest, the script digests and the counts; `<output>.json` holds the same with the
file's sha256.
"""
import argparse
import hashlib
import json
from pathlib import Path

import duckdb

from build_pacing import FIELDS, POINTS, prepare
from source_quality import edition_counts, edition_report

SCHEMA_VERSION = 1
# The identity of a record for prepare's duplicate removal (build_pacing.prepare `fields`), restated: the builder stops
# if the groups these form are not exactly prepare's unique records.
SAME_RECORD = ['race', 'year', 'city', 'runner', 'sex', 'age', 'age_group', 'age_or_group'] + FIELDS
EDITION_REASON = {'finish_time_only': 'finish_time_only', 'held_for_review': 'held_for_review', 'invalid_split_grid': 'invalid_split_grid',
                  'unverified': 'invalid_split_grid', 'partial_coverage': 'invalid_split_grid'}
REASONS = ['finish_time_only', 'held_for_review', 'invalid_split_grid', 'reviewed_exception', 'duplicate', 'missing_checkpoints',
           'times_out_of_order', 'outside_bounds']


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build(db, source):
    """Create the table `record_status` from a prepared cohort; returns (cohort counts, policy, counts by status)."""
    cohort = prepare(db, source, keep_record_id=True)
    policy = edition_report(db, source)
    records = str(source / 'race_records.parquet').replace("'", "''")
    same = ', '.join(f'"{field}"' for field in SAME_RECORD)
    db.execute(f"CREATE TEMP TABLE status_ids AS SELECT id, city, year, min(id) OVER (PARTITION BY {same}) AS rid FROM read_parquet('{records}')")
    assert db.execute('SELECT count(DISTINCT rid) = (SELECT count(*) FROM unique_records) AND count(*) FILTER(WHERE rid NOT IN (SELECT rid FROM unique_records)) = 0 '
                      'FROM status_ids').fetchone()[0], 'the duplicate groups differ from prepare’s unique records'
    # The timing checks of prepare, restated in its order (complete, increasing, plausible); the counts must be prepare's.
    complete = ' AND '.join(f't{i} IS NOT NULL' for i in range(9))
    increasing = 't0>0 AND ' + ' AND '.join(f't{i}>t{i-1}' for i in range(1, 9))
    plausible = 't8 BETWEEN 5400 AND 43200 AND ' + ' AND '.join(f'p{i} BETWEEN 120 AND 1200' for i in range(9))
    assert len(POINTS) == 9
    reason_case = 'CASE q.category ' + ' '.join(f"WHEN '{category}' THEN '{code}'" for category, code in EDITION_REASON.items()) + " ELSE 'reviewed_exception' END"
    db.execute(f"""CREATE TEMP TABLE record_status AS WITH timed AS (
        SELECT s.id AS record_id, s.city, s.year, s.rid,
          CASE WHEN s.id <> s.rid THEN 'duplicate' WHEN NOT coalesce({complete}, false) THEN 'missing_checkpoints'
               WHEN NOT ({increasing}) THEN 'times_out_of_order' WHEN NOT ({plausible}) THEN 'outside_bounds' ELSE 'eligible' END AS timing
        FROM status_ids s JOIN paced p ON p.rid = s.rid),
      used AS (SELECT t.*, q.category AS edition_category,
          CASE WHEN q.city IS NULL THEN 'counted' WHEN q.own_record THEN 'own_record' ELSE 'recorded_times_only' END AS edition_use,
          {reason_case} AS edition_reason
        FROM timed t LEFT JOIN source_quality_editions q ON q.city = t.city AND q.year = t.year)
      SELECT record_id, city, year,
        CASE WHEN timing = 'eligible' AND edition_use = 'counted' THEN 'counted'
             WHEN timing = 'eligible' AND edition_use = 'own_record' THEN 'own_record' ELSE 'limited' END AS status,
        CASE WHEN timing = 'eligible' AND edition_use <> 'recorded_times_only' THEN NULL
             WHEN edition_use = 'recorded_times_only' THEN edition_reason ELSE timing END AS reason,
        timing, edition_use, edition_category, CASE WHEN timing = 'duplicate' THEN rid END AS duplicate_of
      FROM used ORDER BY record_id""")
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    pairs = lambda query: {str(k): v for k, v in db.execute(query).fetchall()}  # noqa: E731
    counts = {'records': one('SELECT count(*) FROM record_status'), 'by_status': pairs('SELECT status, count(*) FROM record_status GROUP BY 1 ORDER BY 1'),
              'by_reason': pairs("SELECT reason, count(*) FROM record_status WHERE status = 'limited' GROUP BY 1 ORDER BY 1"),
              'by_timing': pairs('SELECT timing, count(*) FROM record_status GROUP BY 1 ORDER BY 1'),
              'by_edition_use': pairs('SELECT edition_use, count(*) FROM record_status GROUP BY 1 ORDER BY 1'),
              'editions_by_use': pairs('SELECT edition_use, count(DISTINCT (city, year)) FROM record_status GROUP BY 1 ORDER BY 1')}
    # The checks that tie the file to the cohort: nothing here is a second opinion.
    assert counts['records'] == cohort['raw'] == one('SELECT count(DISTINCT record_id) FROM record_status'), 'not one row per written record'
    assert counts['by_status'].get('counted', 0) == cohort['eligible'], 'the counted records are not the eligible cohort'
    assert one("SELECT count(*) FROM record_status r WHERE status = 'counted' AND record_id NOT IN (SELECT rid FROM eligible)") == 0, 'a counted record is not in the eligible cohort'
    timing = counts['by_timing']
    assert (timing.get('duplicate', 0), timing.get('missing_checkpoints', 0), timing.get('times_out_of_order', 0), timing.get('outside_bounds', 0), timing.get('eligible', 0)) == (
        cohort['duplicates_removed'], cohort['missing_or_unparsed'], cohort['non_increasing'], cohort['outside_quality_bounds'], cohort['timing_eligible']), \
        'the timing outcomes differ from prepare’s counts'
    listed = edition_counts(policy['editions'])
    assert counts['by_status'].get('own_record', 0) == listed['timing_eligible_own_record'], 'the own-record records differ from the policy’s own-record editions'
    assert cohort['timing_eligible'] - cohort['eligible'] - counts['by_status'].get('own_record', 0) == one(
        "SELECT count(*) FROM record_status WHERE timing = 'eligible' AND status = 'limited'"), 'the timing-eligible records do not add up'
    assert set(counts['by_reason']) <= set(REASONS)
    return cohort, policy, counts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    db = duckdb.connect()
    db.execute("SET memory_limit='6GB'")
    db.execute('SET threads=3')
    db.execute('SET preserve_insertion_order=true')
    cohort, policy, counts = build(db, args.input)
    provenance = json.loads((args.input / 'provenance.json').read_text())
    info = {
        'schema_version': SCHEMA_VERSION, 'release_tag': provenance['release_tag'], 'input_manifest_sha256': provenance['manifest_sha256'],
        'policy_sha256': policy['policy_sha256'], 'policy_version': policy['version'],
        'scripts': {name: digest(Path(__file__).with_name(name)) for name in ('build_record_status.py', 'build_pacing.py', 'source_quality.py')},
        'cohort': cohort, 'counts': counts,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    target = str(args.output).replace("'", "''")
    metadata = ', '.join(f"{key}: '{json.dumps(value, sort_keys=True).replace(chr(39), chr(39) * 2)}'" for key, value in info.items())
    db.execute(f"COPY (SELECT * FROM record_status ORDER BY record_id) TO '{target}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 200000, KV_METADATA {{{metadata}}})")
    info['file'] = {'name': args.output.name, 'bytes': args.output.stat().st_size, 'sha256': digest(args.output)}
    args.output.with_name(args.output.name + '.json').write_text(json.dumps(info, indent=1) + '\n')
    print(json.dumps({'written': str(args.output), **info['file'], 'counts': counts}, indent=1))


if __name__ == '__main__':
    main()
