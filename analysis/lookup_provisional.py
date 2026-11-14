"""Runner lookup v2: stand-ins for the two pipeline files, for development before the pipeline has written them.

    python3 -I analysis/lookup_provisional.py --core <unpacked CORE> --links <person-ids linked parquet> --output DIR

Writes `record-status.parquet` and `identity.parquet` in DIR, each marked `provisional` in its own Parquet metadata, so
a lookup built from them says so in its manifest and cannot be imported. They follow the stated rules of the adoption
plan as this module reads them; the pipeline's own files are the authority and replace them:

- Marathon rows left out (decision D2 with ruling R2): a row with one of the pending-review flags or row-quality flags
  below, except that `finish_equals_earlier_split` or `sportstats_nonfinish_status` does not count when every row of
  the row's edition carries it.
- Record status (ruling R4), for every other marathon row: `limited` with the edition's reason when its edition gives
  recorded times only (the frozen edition policy lists it, and not as unverified or partial coverage with every screen
  passed), in the vocabulary of analysis/build_record_status.py; `city` is the release key here, not a registry label;
  otherwise `limited/duplicate` (not the lowest id among rows equal in name, sex, age fields and nine times),
  `limited/missing_checkpoints` (one of the nine times absent or unreadable), `limited/times_out_of_order`, `limited/outside_bounds`
  (finish outside 1:30:00 to 12:00:00 or a section outside 2:00 to 20:00 per km); otherwise `counted` in a counted
  edition and `own_record` in an unverified or partial-coverage edition.
- Identity (decision D24.2): a link of tier high_elite, high or medium keys a runner when its person, over the kept
  rows of both distances, has at most one sex (published, else the category's), birth years (the link build's
  `yob:` key) at most 2 apart and no two rows in one edition; every other link is a possible match, and a row with no
  person is unlinked.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import duckdb

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

MARATHON_LEFT_OUT = {
    'pending_review_flags': ['wheelchair_handcycle_published_category', 'sportstats_nonfinish_status', 'philadelphia_2010_place_sequence_outlier'],
    'qa_row_flags': ['finish_faster_than_world_record', 'finish_ge_24h', 'finish_zero', 'finish_equals_earlier_split'],
    'kept_when_edition_wide': ['finish_equals_earlier_split', 'sportstats_nonfinish_status'],
}
KEYED = ['high_elite', 'high', 'medium']
FIELDS = [f'split_{k}km' for k in (5, 10, 15, 20, 25, 30, 35, 40)] + ['split_42_2km']
LENGTHS = [5, 5, 5, 5, 5, 5, 5, 5, 2.195]
SECONDS = ("CASE WHEN regexp_full_match({c}, '[0-9]+:[0-5][0-9]:[0-5][0-9]') THEN split_part({c}, ':', 1)::BIGINT*3600"
           " + split_part({c}, ':', 2)::BIGINT*60 + split_part({c}, ':', 3)::BIGINT END")


def quote(path):
    return "'" + str(path).replace("'", "''") + "'"


def write(db, query, path, metadata):
    pairs = ', '.join(f"{key}: {quote(value)}" for key, value in metadata.items())
    db.execute(f"COPY ({query}) TO {quote(path)} (FORMAT PARQUET, COMPRESSION ZSTD, KV_METADATA {{{pairs}}})")


def left_out_sql(core, rule=MARATHON_LEFT_OUT, distance='marathon'):
    """A query giving (source_db, record_id, flag) for every flag that leaves a row of `distance` out."""
    parts = [f"SELECT source_db, record_id, flag FROM read_parquet({quote(core / 'pending_review_flags.parquet')}) "
             f"WHERE present_in_core AND distance='{distance}' AND flag IN ({', '.join(quote(f) for f in rule['pending_review_flags'])})"]
    for flag in rule['qa_row_flags']:
        parts.append(f"SELECT source_db, record_id, '{flag}' AS flag FROM read_parquet({quote(core / 'qa_row_flags.parquet')}) "
                     f"WHERE distance='{distance}' AND {flag}")
    flagged = ' UNION ALL '.join(parts)
    wide = ', '.join(quote(f) for f in rule.get('kept_when_edition_wide', [])) or "''"
    records = f"read_parquet({quote(core / 'race_records.parquet')})"
    return f"""WITH flagged AS ({flagged}),
      located AS (SELECT f.*, r.city, r.year FROM flagged f JOIN {records} r ON r.source_db=f.source_db AND r.id=f.record_id),
      sizes AS (SELECT source_db, city, year, count(*) AS n FROM {records} WHERE distance='{distance}' GROUP BY ALL),
      wide AS (SELECT l.source_db, l.city, l.year, l.flag FROM located l JOIN sizes s USING (source_db, city, year)
               WHERE l.flag IN ({wide}) GROUP BY ALL HAVING count(*)=any_value(s.n))
      SELECT l.source_db, l.record_id, l.flag FROM located l ANTI JOIN wide w
        ON w.source_db=l.source_db AND w.city=l.city AND w.year=l.year AND w.flag=l.flag"""


def build(core, links, policy_path, review_path, output, memory='3GB', threads=2, identity_only=False):
    output.mkdir(parents=True, exist_ok=True)
    db = duckdb.connect()
    db.execute(f"SET memory_limit='{memory}'")
    db.execute(f'SET threads={int(threads)}')
    db.execute(f"SET temp_directory={quote(output / 'tmp')}")
    records = f"read_parquet({quote(core / 'race_records.parquet')})"
    qa = f"read_parquet({quote(core / 'qa_row_flags.parquet')})"
    db.execute(f'CREATE TEMP TABLE left_out AS SELECT DISTINCT source_db, record_id FROM ({left_out_sql(core)})')
    policy = json.loads(policy_path.read_text())
    review = {(e['city'], e['year']): e for e in json.loads(review_path.read_text())['editions']} if review_path else {}
    rows = []
    for edition in policy['editions']:
        facts = review.get((edition['city'], edition['year']), {})
        own = edition['category'] in ('unverified', 'partial_coverage') and not (
            facts.get('screen_a', True) or facts.get('screen_b', True) or facts.get('screen_c', True))
        reason = {'finish_time_only': 'finish_time_only', 'held_for_review': 'held_for_review', 'invalid_split_grid': 'invalid_split_grid',
                  'unverified': 'invalid_split_grid', 'partial_coverage': 'invalid_split_grid'}.get(edition['category'], 'reviewed_exception')
        rows.append((edition['city'], edition['year'], 'own' if own else 'times', reason))
    db.execute('CREATE TEMP TABLE policy (city VARCHAR, year BIGINT, kind VARCHAR, reason VARCHAR)')
    db.executemany('INSERT INTO policy VALUES (?, ?, ?, ?)', rows)
    times = ', '.join(f"{SECONDS.format(c=field)} AS t{i}" for i, field in enumerate(FIELDS))
    db.execute(f"""CREATE TEMP TABLE m AS SELECT r.id, r.city, r.year, r.race, r.runner, coalesce(r.sex, q.sex_from_category) AS sex,
        r.age, r.age_group, r.age_or_group, {', '.join(FIELDS)}, {times}
      FROM {records} r LEFT JOIN {qa} q ON q.source_db=r.source_db AND q.record_id=r.id
      ANTI JOIN left_out x ON x.source_db=r.source_db AND x.record_id=r.id WHERE r.distance='marathon'""")
    complete = ' AND '.join(f't{i} IS NOT NULL' for i in range(9))
    increasing = 't0>0 AND ' + ' AND '.join(f't{i}>t{i - 1}' for i in range(1, 9))
    paces = ' AND '.join(f"(t{i}-{'t%d' % (i - 1) if i else '0'})/{LENGTHS[i]} BETWEEN 120 AND 1200" for i in range(9))
    same = ', '.join(['race', 'year', 'city', 'runner', 'sex', 'age', 'age_group', 'age_or_group'] + FIELDS)
    status = f"""SELECT m.id AS record_id, m.city, m.year,
        CASE WHEN p.kind='times' THEN 'limited' WHEN m.id<>min(m.id) OVER (PARTITION BY {same}) THEN 'limited'
             WHEN NOT ({complete}) THEN 'limited' WHEN NOT ({increasing}) THEN 'limited'
             WHEN NOT (t8 BETWEEN 5400 AND 43200 AND {paces}) THEN 'limited'
             WHEN p.kind='own' THEN 'own_record' ELSE 'counted' END AS status,
        CASE WHEN p.kind='times' THEN p.reason WHEN m.id<>min(m.id) OVER (PARTITION BY {same}) THEN 'duplicate'
             WHEN NOT ({complete}) THEN 'missing_checkpoints' WHEN NOT ({increasing}) THEN 'times_out_of_order'
             WHEN NOT (t8 BETWEEN 5400 AND 43200 AND {paces}) THEN 'outside_bounds' END AS reason
      FROM m LEFT JOIN policy p ON p.city=m.city AND p.year=m.year ORDER BY 1"""
    note = {'provisional': 'true', 'generator': 'analysis/lookup_provisional.py', 'tag': policy['tag'],
            'policy_sha256': hashlib.sha256(policy_path.read_bytes()).hexdigest()}
    counts = []
    if not identity_only:
        write(db, status, output / 'record-status.parquet', note)
        counts = db.execute(f"SELECT status, reason, count(*) FROM read_parquet({quote(output / 'record-status.parquet')}) GROUP BY ALL ORDER BY 1, 2").fetchall()

    link = f"read_parquet({quote(links)})"
    half_out = half_left_out_sql(core)
    db.execute(f"""CREATE TEMP TABLE linked AS SELECT l.source_db, l.record_id, l.person_id, l.confidence, l.distance, l.city, l.year,
        coalesce(r.sex, q.sex_from_category) AS sex, try_cast(nullif(regexp_extract(l.age_key, '^yob:([0-9]{{4}})$', 1), '') AS INTEGER) AS yob,
        (x.record_id IS NOT NULL OR y.record_id IS NOT NULL) AS left_out
      FROM {link} l JOIN {records} r ON r.source_db=l.source_db AND r.id=l.record_id
      LEFT JOIN {qa} q ON q.source_db=l.source_db AND q.record_id=l.record_id
      LEFT JOIN left_out x ON x.source_db=l.source_db AND x.record_id=l.record_id
      LEFT JOIN (SELECT DISTINCT source_db, record_id FROM ({half_out})) y ON y.source_db=l.source_db AND y.record_id=l.record_id""")
    keyed = ', '.join(quote(tier) for tier in KEYED)
    db.execute(f"""CREATE TEMP TABLE screens AS SELECT person_id,
        count(DISTINCT CASE WHEN sex IN ('M', 'F') THEN sex END)>1 AS sex_conflict,
        coalesce(max(yob)-min(yob), 0)>2 AS birth_year_spread,
        count(*)<>count(DISTINCT (distance, source_db, city, year)) AS two_in_one_edition
      FROM linked WHERE person_id IS NOT NULL AND confidence IN ({keyed}) AND NOT left_out GROUP BY person_id""")
    identity = f"""SELECT l.source_db, l.record_id,
        CASE WHEN l.confidence IN ({keyed}) AND NOT l.left_out AND NOT (s.sex_conflict OR s.birth_year_spread OR s.two_in_one_edition)
             THEN l.person_id END AS runner_key,
        l.confidence AS link_tier,
        CASE WHEN l.person_id IS NULL THEN 'unlinked' WHEN l.left_out THEN 'row_left_out'
             WHEN l.confidence NOT IN ({keyed}) THEN 'tier_below_medium' WHEN s.sex_conflict THEN 'sex_conflict'
             WHEN s.birth_year_spread THEN 'birth_year_spread' WHEN s.two_in_one_edition THEN 'two_in_one_edition' END AS reason
      FROM linked l LEFT JOIN screens s USING (person_id) ORDER BY 1, 2"""
    write(db, identity, output / 'identity.parquet', {'provisional': 'true', 'generator': 'analysis/lookup_provisional.py', 'tag': policy['tag']})
    by_reason = db.execute(f"SELECT source_db, link_tier, reason, count(*) FROM read_parquet({quote(output / 'identity.parquet')}) GROUP BY ALL ORDER BY 1, 2, 3").fetchall()
    return {'status': [list(r) for r in counts], 'identity': [list(r) for r in by_reason]}


def half_left_out_sql(core):
    rule = json.loads(Path(__file__).with_name('lookup-half-records.json').read_text())['left_out']
    return left_out_sql(core, {'pending_review_flags': rule['pending_review_flags'], 'qa_row_flags': rule['qa_row_flags']}, 'half')


def main(argv=None):
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--core', type=Path, required=True)
    parser.add_argument('--links', type=Path, required=True)
    parser.add_argument('--policy', type=Path, default=here / 'edition-policy-20261113-1113.json')
    parser.add_argument('--policy-review', type=Path, default=here.parent / 'docs/evidence/2026-11-14/release-20261113-1113/edition-policy-review.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--identity-only', action='store_true', help='write identity.parquet alone (the status file already exists)')
    args = parser.parse_args(argv)
    print(json.dumps(build(args.core, args.links, args.policy, args.policy_review, args.output, identity_only=args.identity_only), ensure_ascii=False))


if __name__ == '__main__':
    main()
