"""Runner lookup v2: the source-side audit of a build, row by row against the release and the pipeline's files.

    python3 -I analysis/lookup_audit.py --core <unpacked CORE> --links <person-ids linked parquet> \\
        --status <record-status.parquet> --identity <identity.parquet> --build <dir that holds runners/> \\
        [--race-notes analysis/race-notes.json] [--never-shown FILE] [--receipt FILE]

scripts/verify-lookup.cjs proves a build from its own files; it cannot know what the release says. This does, with
queries written apart from the builder's:

1. The rows that must not appear, by kind and distance: rows left out (marathon: absent from the status file; half:
   marked left_out in the identity file), the kept rows of an edition the race notes set aside, rows whose name has no
   letter or number, rows the producer flags as placeholder names, rows whose name is on the reviewed placeholder
   list. None may be in a shard, and each count must equal the manifest's. `--never-shown FILE` writes their keys for
   scripts/verify-lookup.cjs --never-shown.
2. Every other row of the release must be in a shard exactly once, with the release's own name, sex (published, else
   the category's), age, finish and checkpoint times, the pipeline's status and link tier, in the edition whose race
   label, year, tier and split tier are the registry's and EDITION-TIERS.csv's. A finish text that is not a time
   greater than zero must be shown as no finish; those results are counted under their own reason
   (`finish_text_not_a_time` in the receipt) and the count must equal the manifest's `finish_unread`.
3. Profiles: two results share a profile exactly when they share a person id.

It stops at the first kind of difference and prints examples by record id only, never a name.

Disk: the two tables of 15.7 million rows it compares are in a temporary database (beside the build unless --temp
says otherwise). Every join hashes a few columns of one table in memory, on a one-number key, so nothing is spilled.
The folder is measured while the audit runs (the last line gives its peak), an audit whose folder passes
--temp-limit-gb stops, and the folder is removed when the audit ends, fails or is stopped by a signal.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import signal
import sys
import time
from pathlib import Path

import duckdb

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import lookup_format as fmt  # noqa: E402
from build_runner_lookup import Stopped, TempWatch  # noqa: E402  (the temporary-folder watch only: every query here is this file's own)
from lookup_names import normalize_name, search_key  # noqa: E402
from lookup_races import half_races, read_registry  # noqa: E402

HERE = Path(__file__).resolve().parent
TEMP_LIMIT_GB = 4.0      # the audit stops when its temporary folder passes this; the measured peak is in docs/RUNNERS_AND_REPORT.md
TIERS = {'high_elite': '1', 'high': '2', 'medium': '3', 'medium_variant': '4', 'low': '5', 'low_noage': '6', 'low_noage_series': '7',
         'low_nosex': '8', 'low_city_pace': '9', 'low_carryover': 'a'}
SPLITS = ['split_5km', 'split_10km', 'split_15km', 'split_20km', 'split_25km', 'split_30km', 'split_35km', 'split_40km']
STATUS = {'counted': '0', 'own_record': '1', 'duplicate': '2', 'missing_checkpoints': '3', 'times_out_of_order': '4', 'outside_bounds': '5',
          'finish_time_only': '6', 'held_for_review': '6', 'invalid_split_grid': '6', 'reviewed_exception': '6'}


class AuditError(Exception):
    pass


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def clock(column):
    """Whole seconds of an H:MM:SS text, null for anything else (a second way of writing the builder's parse)."""
    parts = f"string_split({column}, ':')"
    return (f"CASE WHEN {column} SIMILAR TO '[0-9]+:[0-5][0-9]:[0-5][0-9]' THEN {parts}[1]::BIGINT*3600 + {parts}[2]::BIGINT*60 + {parts}[3]::BIGINT END")


def as_written(db, statement):
    """Run a join as it is written and return its rows: the table on the right of each JOIN is hashed in memory and the
    rows on the left stream past it. Left to its own estimates DuckDB hashed the wide rows of the release and spilled
    gigabytes. (The rows are fetched here: the statement that restores the setting would replace a result not yet read.)"""
    db.execute("SET disabled_optimizers='join_order,build_side_probe_side'")
    try:
        return db.execute(statement).fetchall()
    finally:
        db.execute("SET disabled_optimizers=''")


KEY = "{id}*2 + ({db})::INTEGER"       # one number for a record of either database: twice its id, plus one in the half database


def source_tables(db, core, links, status, identity, placeholders, set_aside=()):
    """TABLE want: every release row with what the lookup should say of it and the kind of row it is, keyed by `k`.
    `set_aside` is the (label, year) of the marathon editions the race notes set aside. Made in two steps so that
    no statement hashes more than about a gigabyte: the release rows with their link and status, then the names and
    the identity file's two facts about a row (left out; keyed)."""
    records = f"read_parquet({quote(core / 'race_records.parquet')})"
    qa = f"read_parquet({quote(core / 'qa_row_flags.parquet')})"
    ident = f"read_parquet({quote(identity)})"
    db.execute('CREATE TABLE audit_aside (label VARCHAR, year BIGINT)')
    if set_aside:
        db.executemany('INSERT INTO audit_aside VALUES (?, ?)', [list(key) for key in set_aside])
    # names: unnamed and listed placeholders, from every distinct recorded name
    names_file = Path(db.execute("SELECT current_setting('temp_directory')").fetchone()[0]) / 'audit-names.ndjson'
    names_file.parent.mkdir(parents=True, exist_ok=True)
    listed = {search_key(entry['name']) for entry in placeholders['names']}
    cursor = db.execute(f"SELECT DISTINCT coalesce(runner, '') FROM {records}")
    with names_file.open('w', encoding='utf-8') as stream:
        while batch := cursor.fetchmany(100000):
            stream.write(''.join(json.dumps({'name': name, 'unnamed': normalize_name(name) == '', 'listed': search_key(name) in listed}, ensure_ascii=False) + '\n'
                                 for (name,) in batch))
    db.execute("CREATE TABLE audit_names AS SELECT * FROM read_json(?, format='newline_delimited', columns={'name': 'VARCHAR', 'unnamed': 'BOOLEAN', 'listed': 'BOOLEAN'})", [str(names_file)])
    names_file.unlink()
    splits = ', '.join(f'({clock("r." + column)})::INTEGER AS t{i}' for i, column in enumerate(SPLITS))
    status_case = ' '.join(f"WHEN {quote(word)} THEN '{digit}'" for word, digit in STATUS.items())
    tier_case = ' '.join(f"WHEN {quote(tier)} THEN CASE WHEN w.keyed THEN '{code}' ELSE '{fmt.LINK_SCREENED.get(code, code)}' END" for tier, code in TIERS.items())
    finish = clock('r.finish_time')
    as_written(db, f"""CREATE TABLE source AS SELECT r.distance, r.source_db='half' AS dbh, r.id, r.city, r.year::INTEGER AS year,
        coalesce(r.runner, '') AS name, coalesce(r.sex, q.sex_from_category, '-') AS x,
        CASE WHEN r.age IS NULL OR coalesce(q.age_implausible, false) THEN -1 ELSE r.age::INTEGER END AS a,
        (CASE WHEN {finish}>0 THEN {finish} ELSE -1 END)::INTEGER AS f,
        (r.finish_time IS NOT NULL AND coalesce({finish}, 0)<=0) AS finish_unread, {splits},
        s.word, s.label, s.label_year, s.record_id IS NOT NULL AS in_status, l.person_id, l.confidence, l.flagged
      FROM {records} r
      JOIN (SELECT {KEY.format(id='record_id', db="source_db='half'")} AS k, person_id, confidence, coalesce(unlinked_reason='placeholder_name', false) AS flagged
            FROM read_parquet({quote(links)})) l ON l.k={KEY.format(id='r.id', db="r.source_db='half'")}
      LEFT JOIN (SELECT source_db, record_id, sex_from_category, age_implausible FROM {qa}) q ON q.source_db=r.source_db AND q.record_id=r.id
      LEFT JOIN (SELECT record_id, coalesce(reason, status) AS word, city AS label, year AS label_year FROM read_parquet({quote(status)})) s
        ON s.record_id=CASE WHEN r.distance='marathon' THEN r.id END""")
    as_written(db, f"""CREATE TABLE want AS SELECT w.distance, CASE WHEN w.dbh THEN 'h' ELSE 'f' END AS db, w.id, {KEY.format(id='w.id', db='w.dbh')} AS k,
        w.city, w.year, w.name, w.x, w.a, w.f, w.finish_unread, w.t0, w.t1, w.t2, w.t3, w.t4, w.t5, w.t6, w.t7,
        CASE WHEN w.distance='half' THEN '-' ELSE CASE w.word {status_case} END END AS st,
        CASE WHEN w.person_id IS NULL THEN '0' ELSE CASE w.confidence {tier_case} END END AS c, w.person_id,
        CASE WHEN w.distance='marathon' AND NOT w.in_status THEN 'left_out'
             WHEN w.distance='half' AND w.left_out THEN 'left_out'
             WHEN a.label IS NOT NULL THEN 'set_aside'
             WHEN n.unnamed THEN 'unnamed' WHEN w.flagged THEN 'placeholder_flagged'
             WHEN n.listed THEN 'placeholder_listed' ELSE 'result' END AS kind
      FROM (SELECT *, ({KEY.format(id='id', db='dbh')}) IN (SELECT {KEY.format(id='record_id', db="source_db='half'")} FROM {ident} WHERE runner_key IS NOT NULL) AS keyed,
                   ({KEY.format(id='id', db='dbh')}) IN (SELECT {KEY.format(id='record_id', db="source_db='half'")} FROM {ident} WHERE status='left_out') AS left_out
            FROM source) w
      JOIN audit_names n ON n.name=w.name
      LEFT JOIN audit_aside a ON a.label=w.label AND a.year=w.label_year""")
    rows, total = db.execute(f'SELECT (SELECT count(*) FROM want), (SELECT count(*) FROM {records})').fetchone()
    if rows != total:
        raise AuditError(f'{total} release rows became {rows} in the audit table')
    for table in ('source', 'audit_names'):       # read into `want`; their space is used again
        db.execute(f'DROP TABLE {table}')
    db.execute('CHECKPOINT')


def never_shown(db):
    """{distance: {kind: {'f': [ids], 'h': [ids]}}} of the rows that must not appear."""
    out = {}
    for distance, kind, letter, ids in db.execute("""SELECT distance, kind, db, list(id ORDER BY id) FROM want WHERE kind<>'result'
            GROUP BY ALL ORDER BY ALL""").fetchall():
        out.setdefault(distance, {}).setdefault(kind, {})[letter] = ids
    return out


def load_build(db, build):
    """TABLE got: every result of the build's shards, decoded, keyed by `k` and with its profile as one number `p`;
    and TABLE got_editions."""
    import pandas

    root = build / 'runners'
    manifest = json.loads((root / 'manifest.json').read_text())
    editions = fmt.decode_editions(fmt.read_gz(root / 'editions.json.gz'))
    db.execute('CREATE TABLE got_editions (e INTEGER, distance VARCHAR, db VARCHAR, label VARCHAR, race VARCHAR, year INTEGER, tier INTEGER, splits BOOLEAN, g INTEGER)')
    db.executemany('INSERT INTO got_editions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   [(e['index'], e['distance'], e['db'], e['city'], e['race'], e['year'], e['tier'], e['splits'], e['no_comparison']) for e in editions])
    columns = ['shard', 'position', 'e', 'db', 'id', 'name', 'f', 'x', 'a', 'c', 'st'] + [f't{i}' for i in range(8)]
    db.execute('CREATE TABLE got (k BIGINT, p BIGINT, shard INTEGER, position INTEGER, e INTEGER, db VARCHAR, id BIGINT, name VARCHAR, f INTEGER, x VARCHAR, a INTEGER, '
               'c VARCHAR, st VARCHAR, ' + ', '.join(f't{i} INTEGER' for i in range(8)) + ')')
    pending = {column: [] for column in columns}

    def flush():
        frame = pandas.DataFrame(pending)  # noqa: F841 (DuckDB reads it by name)
        db.execute("INSERT INTO got SELECT id*2 + (db='h')::INTEGER, shard::BIGINT*1048576 + position, " + ', '.join(columns) + ' FROM frame')
        for values in pending.values():
            values.clear()
    for number in range(fmt.PROFILE_SHARDS):
        for position, profile in enumerate(fmt.decode_shard(fmt.read_gz(root / fmt.shard_path(number)), editions)):
            for row in profile['results']:
                times = row['times']
                pending['shard'].append(number)
                pending['position'].append(position)
                pending['e'].append(row['e'])
                pending['db'].append(row['db'])
                pending['id'].append(row['id'])
                pending['name'].append(row['name'])
                pending['f'].append(row['f'])
                pending['x'].append(row['x'])
                pending['a'].append(row['a'])
                pending['c'].append(row['c'])
                pending['st'].append(row['s'])
                for i in range(8):
                    pending[f't{i}'].append(times[i] if i < len(times) - 1 else None)
        if len(pending['id']) >= 400000:
            flush()
    flush()
    return manifest, editions


def audit(db, core, manifest, registry_path, half_registry_path=None):
    """Compare `got` with `want`. Returns the facts checked; raises AuditError on the first kind of difference.
    Every join is on the one-number key and hashes a few columns of one table (as written: the right side)."""
    facts = {}

    def none(name, query, what):
        rows = as_written(db, query)
        if rows:
            raise AuditError(f'{what}: {len(rows)} shown, for example {rows[:5]}')
        facts[name] = 'none'

    # 1. rows that must not appear, and the counts the manifest states for them
    none('never_shown_in_shards', "SELECT w.db, w.id, w.kind FROM (SELECT k FROM got) g JOIN (SELECT k, db, id, kind FROM want WHERE kind<>'result') w ON w.k=g.k LIMIT 20",
         'rows that must not appear are in a shard')
    counts = {distance: {} for distance in ('marathon', 'half')}
    for distance, kind, n in db.execute('SELECT distance, kind, count(*) FROM want GROUP BY ALL').fetchall():
        counts[distance][kind] = n
    for distance in ('marathon', 'half'):
        stated = manifest['counts'][distance]
        mine = {'left_out': counts[distance].get('left_out', 0), 'set_aside': counts[distance].get('set_aside', 0), 'unnamed': counts[distance].get('unnamed', 0),
                'placeholder_flagged': counts[distance].get('placeholder_flagged', 0), 'placeholder_listed': counts[distance].get('placeholder_listed', 0),
                'results': counts[distance].get('result', 0)}
        theirs = {'left_out': stated['left_out']['rows'], 'set_aside': stated['set_aside']['rows'], 'unnamed': stated['unnamed'],
                  'placeholder_flagged': stated['placeholder']['flagged'], 'placeholder_listed': stated['placeholder']['listed'], 'results': stated['results']}
        if mine != theirs:
            raise AuditError(f'{distance}: the release gives {mine}, the manifest states {theirs}')
    facts['counts'] = counts
    # Results whose finish text is not a time greater than zero: listed, shown with no finish (`f` is compared below), counted here.
    unread = {distance: 0 for distance in ('marathon', 'half')}
    unread.update(dict(db.execute("SELECT distance, count(*) FROM want WHERE kind='result' AND finish_unread GROUP BY distance").fetchall()))
    stated = {distance: manifest['counts'][distance]['finish_unread'] for distance in unread}
    if unread != stated:
        raise AuditError(f'results whose finish text is not a time: the release gives {unread}, the manifest states {stated}')
    facts['finish_text_not_a_time'] = unread
    # 2. every other row once, with the release's own values
    none('missing', "SELECT w.db, w.id FROM (SELECT k, db, id FROM want WHERE kind='result') w ANTI JOIN (SELECT k FROM got) g ON g.k=w.k LIMIT 20",
         'listed rows of the release are in no shard')
    none('extra', 'SELECT g.db, g.id FROM (SELECT k, db, id FROM got) g ANTI JOIN (SELECT k FROM want) w ON w.k=g.k LIMIT 20', 'results that are not rows of the release')
    none('twice', 'SELECT k FROM got GROUP BY k HAVING count(*)>1 LIMIT 20', 'results that appear twice')
    for columns in (['name'], ['x', 'a', 'st', 'c'], ['f'] + [f't{i}' for i in range(8)]):
        differs = ' OR '.join(f'w.{column} IS DISTINCT FROM g.{column}' for column in columns)
        which = 'CASE ' + ' '.join(f"WHEN w.{column} IS DISTINCT FROM g.{column} THEN '{column}'" for column in columns) + ' END'
        rows = as_written(db, f"""SELECT w.db, w.id, {which} FROM (SELECT k, db, id, {', '.join(columns)} FROM want WHERE kind='result') w
            JOIN (SELECT k, {', '.join(columns)} FROM got) g ON g.k=w.k WHERE {differs} LIMIT 20""")
        if rows:
            raise AuditError(f'the column {rows[0][2]} differs from the release or the pipeline: {len(rows)} shown, for example {[row[:2] for row in rows[:5]]}')
        for column in columns:
            facts[f'differs_{column}'] = 'none'
    # the edition of each result: the registry's label, the year, EDITION-TIERS.csv's tier and split tier
    marathon, _, _ = read_registry(registry_path, 'marathon')
    half_registry = read_registry(half_registry_path, 'half')[0] if half_registry_path else None
    first = dict(db.execute("SELECT city, min(year) FROM want WHERE distance='half' AND kind<>'left_out' GROUP BY city").fetchall())
    halves = half_races(first, half_registry)
    db.execute('CREATE TABLE want_races (distance VARCHAR, city VARCHAR, label VARCHAR, race VARCHAR)')
    db.executemany('INSERT INTO want_races VALUES (?, ?, ?, ?)', [('marathon', key, label, name) for key, (label, name) in marathon.items()]
                   + [('half', key, label, name) for key, (label, name) in halves.items()])
    tier_case = ' '.join(f"WHEN {quote(tier)} THEN {at}" for at, tier in enumerate(fmt.TIERS))
    db.execute(f"""CREATE TABLE want_tiers AS SELECT distance, CASE source_db WHEN 'half' THEN 'h' ELSE 'f' END AS db, city, year::INTEGER AS year,
        CASE verification_tier {tier_case} END AS tier, split_tier='splits' AS splits
      FROM read_csv({quote(core / 'EDITION-TIERS.csv')}, header=true, all_varchar=true)""")
    none('edition', """SELECT w.db, w.id FROM (SELECT k, db, id, distance, city, year FROM want WHERE kind='result') w
        JOIN (SELECT k, e FROM got) g ON g.k=w.k JOIN got_editions e ON e.e=g.e
        LEFT JOIN want_races r ON r.distance=w.distance AND r.city=w.city
        LEFT JOIN want_tiers t ON t.distance=w.distance AND t.db=w.db AND t.city=w.city AND t.year=w.year
        WHERE e.distance IS DISTINCT FROM w.distance OR e.db IS DISTINCT FROM w.db OR e.year IS DISTINCT FROM w.year
          OR e.label IS DISTINCT FROM r.label OR e.race IS DISTINCT FROM r.race OR e.tier IS DISTINCT FROM t.tier OR e.splits IS DISTINCT FROM t.splits LIMIT 20""",
         'results sit in an edition of another race, year, distance, database, tier or split tier')
    # 3. profiles are persons (`p` names a profile: its shard and its position there)
    none('split_person', """SELECT min(w.id) FROM (SELECT k, id, person_id FROM want WHERE kind='result' AND person_id IS NOT NULL) w
        JOIN (SELECT k, p FROM got) g ON g.k=w.k GROUP BY w.person_id HAVING min(g.p)<>max(g.p) LIMIT 20""", 'a person is spread over two profiles')
    none('joined_persons', """SELECT g.p FROM (SELECT k, coalesce(person_id, db || id::VARCHAR) AS person FROM want WHERE kind='result') w
        JOIN (SELECT k, p FROM got) g ON g.k=w.k GROUP BY g.p HAVING min(w.person)<>max(w.person) LIMIT 20""", 'a profile joins two persons, or results with no link')
    none('shard_of_person', """SELECT w.db, w.id FROM (SELECT k, db, id, person_id FROM want WHERE kind='result' AND person_id IS NOT NULL) w
        JOIN (SELECT k, shard FROM got) g ON g.k=w.k WHERE g.shard<>('0x' || substr(w.person_id, 5, 3))::INTEGER LIMIT 20""", 'a person is not in the shard of its id')
    facts['results'] = db.execute('SELECT count(*) FROM got').fetchone()[0]
    return facts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--core', type=Path, required=True)
    parser.add_argument('--links', type=Path, required=True)
    parser.add_argument('--status', type=Path, required=True)
    parser.add_argument('--identity', type=Path, required=True)
    parser.add_argument('--build', type=Path, help='the folder that holds the build’s runners folder; without it only --never-shown is written')
    parser.add_argument('--never-shown', type=Path, help='write the keys that must not appear, for scripts/verify-lookup.cjs --never-shown')
    parser.add_argument('--receipt', type=Path, help='write what was checked as JSON')
    parser.add_argument('--registry', type=Path, default=HERE / 'race-registry.json')
    parser.add_argument('--half-registry', type=Path)
    parser.add_argument('--race-notes', type=Path, default=HERE / 'race-notes.json' if (HERE / 'race-notes.json').is_file() else None,
                        help='the race directory’s notes; the build must have skipped the rows of its set_aside_editions')
    parser.add_argument('--placeholders', type=Path, default=HERE / 'lookup-placeholders.json')
    parser.add_argument('--temp', type=Path)
    parser.add_argument('--memory', default='3GB')
    parser.add_argument('--temp-limit-gb', type=float, default=TEMP_LIMIT_GB,
                        help=f'stop when the temporary folder passes this size (default {TEMP_LIMIT_GB}; 0 for no limit)')
    args = parser.parse_args(argv)
    started = time.monotonic()
    temp = args.temp or (args.build or args.never_shown.parent) / 'lookup-audit-temp'
    limit = int(args.temp_limit_gb * (1 << 30)) if args.temp_limit_gb else 0
    db = watch = None
    handlers = {}
    try:
        if __name__ == '__main__':       # as a command: a signal stops the audit through the `finally` below
            def stop(number, frame):
                raise Stopped(signal.Signals(number).name)
            handlers = {name: signal.signal(getattr(signal, name), stop) for name in ('SIGTERM', 'SIGINT', 'SIGHUP')}
        temp.mkdir(parents=True, exist_ok=True)
        db = duckdb.connect(str(temp / 'audit.duckdb'))
        db.execute(f"SET memory_limit='{args.memory}'")
        db.execute('SET threads=2')
        db.execute(f"SET temp_directory={quote(temp / 'spill')}")
        if limit:
            db.execute(f"SET max_temp_directory_size='{max(1, limit >> 20)}MiB'")
        watch = TempWatch(temp, limit, db)
        watch.start()
        set_aside = [(entry['label'], entry['year']) for entry in json.loads(args.race_notes.read_text()).get('set_aside_editions', [])] if args.race_notes else []
        source_tables(db, args.core, args.links, args.status, args.identity, json.loads(args.placeholders.read_text()), set_aside)
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()  # noqa: E731
        if args.never_shown:
            keys = never_shown(db)
            args.never_shown.write_text(json.dumps({'schema_version': 1, 'record_status_sha256': digest(args.status), 'kinds': keys}, separators=(',', ':')) + '\n')
            print(json.dumps({distance: {kind: sum(len(ids) for ids in by_db.values()) for kind, by_db in kinds.items()} for distance, kinds in keys.items()}))
        if args.build:
            manifest, _ = load_build(db, args.build)
            facts = audit(db, args.core, manifest, args.registry, args.half_registry)
            facts.update(manifest_sha256=digest(args.build / 'runners/manifest.json'), seconds=round(time.monotonic() - started))
            if args.receipt:
                args.receipt.write_text(json.dumps(facts, indent=1) + '\n')
            watch.size()
            print(f"Audited {facts['results']:,} results against the release and the pipeline's files: every listed row once with its own values, "
                  f"no row that must not appear, every count as the manifest states. {facts['seconds']} s; temporary folder peak {watch.peak >> 20:,} MB.")
    except AuditError as error:
        print(f'lookup_audit: {error}', file=sys.stderr)
        return 1
    except (duckdb.InterruptException, duckdb.OutOfMemoryException, duckdb.IOException) as error:
        # the watch ends a running query when the folder passes its limit; DuckDB refuses to spill past the same size
        print(f'lookup_audit: the temporary folder passed {args.temp_limit_gb} GB, or DuckDB ran out of memory, and the audit is stopped '
              f'(peak {(watch.peak if watch else 0) >> 20:,} MB): {str(error).splitlines()[0]}', file=sys.stderr)
        return 1
    except (Stopped, RuntimeError) as error:       # a signal inside a query comes back from DuckDB as "Query interrupted", caused by Stopped
        stopped = error if isinstance(error, Stopped) else error.__cause__
        if not isinstance(stopped, Stopped):
            raise
        print(f'lookup_audit: stopped by {stopped}; the temporary folder is removed', file=sys.stderr)
        return 1
    finally:
        if watch is not None:
            watch.stop()
        if db is not None:
            db.close()
        shutil.rmtree(temp, ignore_errors=True)
        for name, handler in handlers.items():
            signal.signal(getattr(signal, name), handler)
    return 0


if __name__ == '__main__':
    sys.exit(main())
