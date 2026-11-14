"""Cut half-extract.sqlite, the one input of the independent Node source recount (docs/HALF_MARATHON.md, R0).

    python3 -I analysis/half_extract.py [--core DIR] [--release DIR] [--identity FILE] [--out FILE] [--pin]

The Node recount (scripts/verify-half-source.cjs) has no parquet reader. This script copies, from the pinned files of the
combined release and the pipeline's identity file, exactly the relations the Python builders read through
analysis/half_source.py (`h.*` and `l.*`) into one local SQLite file, record-level and never in the repository (default
`$PACE_HALF_DIR/half-extract.sqlite`). The Python builders do not read the extract: they read the parquet files, so the
two recounts do not share this cut, and a wrong cut shows as a mismatch between them.

Tables (integers are SQLite INTEGER, everything else TEXT; a NULL stays NULL):
- `subraces(sub_id, city, year, race)`: every (city, year, race) of the half rows of the half database, numbered in
  that order;
- `race_records(id, sub_id, sex, sex_category, split_21_1km, bib, runner, split_10km)`: every half row of the half
  database (`distance = half`, `source_db = half`); `sex` is the published sex as written, `sex_category`
  qa_row_flags.sex_from_category (the recount applies the sex rule itself);
- `record_flags(record_id, flag)`, `qa_flags(record_id, flag)` (the row-quality flags that are set),
  `pending_flags(record_id, flag)` (rows present in CORE);
- `edition_meta(id, city, year, race, race_date, official_finishers, official_source_type, completeness_status,
  timing_basis)`: the registry rows of the half database; `completeness_status` is the tier of EDITION-TIERS.csv, or
  the registry's own `no_rows` for an edition the tier table lacks;
- `tiers(source_db, city, year, n_records, verification_tier, weaker_source, split_tier)`: EDITION-TIERS.csv, half
  rows of either source database;
- `excluded_rows(city, year, n)`: rows of RELEASE-ROW-EXCLUSIONS.parquet per edition of the half database;
- `course_suspect(city, year, n, flagged)`: editions with a row flagged course_shortened_suspect in the link file;
- `identity_left_out(record_id)`: the half-database rows the identity file marks left_out;
- `people(pid, person_id, sex, ns_keys, in_union)` and `links(pid, db, distance, record_id, confidence, keyed,
  variant_union, finish_s, sex, ns_keys)`: analysis/half_source.py `l.people` and `l.links` (set B's inputs), a person
  numbered in person_id order;
- `build(k, v)`: provenance of this cut (no timestamps): the release and link build, every source's sha256, the
  identity file's, the frozen ns_keys SQL's and this script's sha256, and the row counts.

Checks while cutting (each fails loudly): every file against the pin and the identity file against the marathon
cohort's manifest (half_source.check_files); the half rows of the link file are exactly the rows of race_records, with
the same city and year, a finish within 0.5 s of the builders' parse wherever both exist, and the sex the sex rule
gives wherever the link file has one; every official count is a whole number.

`extract_content_sha256` is the SHA-256 of a canonical TSV of every table but `build`, in the order above: each table's
rows ordered by every column in declared order (SQLite BINARY collation, integers numeric), each field as its SQLite
text (integers in decimal, NULL as `\\N`; in a text field a backslash, a tab, a line feed and a carriage return are
written `\\\\`, `\\t`, `\\n` and `\\r`), fields joined by a tab and every row terminated by `\\n`, with no header. It
depends only on the table contents, and the Node recount computes it the same way. `--pin` writes it into
analysis/half-release.json; without `--pin` a differing pinned value fails.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import half_common  # noqa: E402
import half_source  # noqa: E402
from half_common import ROOT, HalfError, fail, file_sha256, load_pin, secs_sql  # noqa: E402

# Table, columns (name, SQLite type), the SELECT that fills it from the DuckDB relations, in digest order.
TABLES = (
    ('subraces', (('sub_id', 'INTEGER'), ('city', 'TEXT'), ('year', 'INTEGER'), ('race', 'TEXT')),
     'SELECT sub_id, city, year, race FROM x_subraces'),
    ('race_records', (('id', 'INTEGER'), ('sub_id', 'INTEGER'), ('sex', 'TEXT'), ('sex_category', 'TEXT'), ('split_21_1km', 'TEXT'),
                      ('bib', 'TEXT'), ('runner', 'TEXT'), ('split_10km', 'TEXT')),
     """SELECT r.id, s.sub_id, r.sex_published, r.sex_category, r.split_21_1km, r.bib, r.runner, r.split_10km
        FROM h.race_records r JOIN x_subraces s ON s.city IS NOT DISTINCT FROM r.city AND s.year = r.year AND s.race IS NOT DISTINCT FROM r.race"""),
    ('record_flags', (('record_id', 'INTEGER'), ('flag', 'TEXT')), 'SELECT record_id, flag FROM h.record_flags'),
    ('qa_flags', (('record_id', 'INTEGER'), ('flag', 'TEXT')), 'SELECT record_id, flag FROM h.qa_flags'),
    ('pending_flags', (('record_id', 'INTEGER'), ('flag', 'TEXT')), 'SELECT record_id, flag FROM h.pending_flags'),
    ('edition_meta', (('id', 'INTEGER'), ('city', 'TEXT'), ('year', 'INTEGER'), ('race', 'TEXT'), ('race_date', 'TEXT'),
                      ('official_finishers', 'INTEGER'), ('official_source_type', 'TEXT'), ('completeness_status', 'TEXT'),
                      ('timing_basis', 'TEXT')),
     """SELECT id, city, year, race, race_date, official_finishers::BIGINT, official_source_type, completeness_status, timing_basis
        FROM h.edition_meta"""),
    ('tiers', (('source_db', 'TEXT'), ('city', 'TEXT'), ('year', 'INTEGER'), ('n_records', 'INTEGER'), ('verification_tier', 'TEXT'),
               ('weaker_source', 'INTEGER'), ('split_tier', 'TEXT')),
     'SELECT source_db, city, year, n_records, verification_tier, weaker_source::INTEGER, split_tier FROM h.tiers'),
    ('excluded_rows', (('city', 'TEXT'), ('year', 'INTEGER'), ('n', 'INTEGER')), 'SELECT city, year, n FROM h.excluded_rows'),
    ('course_suspect', (('city', 'TEXT'), ('year', 'INTEGER'), ('n', 'INTEGER'), ('flagged', 'INTEGER')),
     'SELECT city, year, n, flagged FROM h.course_suspect'),
    ('identity_left_out', (('record_id', 'INTEGER'),), 'SELECT record_id FROM h.identity_left_out'),
    ('people', (('pid', 'INTEGER'), ('person_id', 'TEXT'), ('sex', 'TEXT'), ('ns_keys', 'INTEGER'), ('in_union', 'INTEGER')),
     'SELECT pid, person_id, sex, ns_keys, in_union FROM x_people'),
    ('links', (('pid', 'INTEGER'), ('db', 'TEXT'), ('distance', 'TEXT'), ('record_id', 'INTEGER'), ('confidence', 'TEXT'), ('keyed', 'INTEGER'),
               ('variant_union', 'INTEGER'), ('finish_s', 'INTEGER'), ('sex', 'TEXT'), ('ns_keys', 'INTEGER')),
     """SELECT p.pid, k.db, k.distance, k.record_id, k.confidence, k.keyed, k.variant_union, k.finish_s::BIGINT, k.sex, k.ns_keys
        FROM l.links k JOIN x_people p USING (person_id)"""),
)
INDEXES = ('CREATE INDEX links_pid ON links (pid)', 'CREATE INDEX links_record ON links (db, distance, record_id)')
EXTRACT = 'half-extract.sqlite'


def field(value) -> str:
    if value is None:
        return '\\N'
    if isinstance(value, bool):
        return '1' if value else '0'
    if isinstance(value, float):
        if value != int(value):
            fail(f'a fractional number reached the extract ({value!r})')
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    return str(value).replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')


def content_sha256(con: sqlite3.Connection) -> str:
    """The canonical TSV digest of every table but `build` (module docstring)."""
    digest = hashlib.sha256()
    for table, columns, _ in TABLES:
        cols = ', '.join(name for name, _ in columns)
        buffer = []
        for row in con.execute(f'SELECT {cols} FROM {table} ORDER BY {cols}'):
            buffer.append('\t'.join(field(v) for v in row))
            if len(buffer) >= 50_000:
                digest.update(('\n'.join(buffer) + '\n').encode('utf-8'))
                buffer = []
        if buffer:
            digest.update(('\n'.join(buffer) + '\n').encode('utf-8'))
    return digest.hexdigest()


def check_joins(db, source) -> dict:
    """The half rows of the link file against race_records (module docstring). Returns the counts it found."""
    links = half_source.lit(source.links.as_posix())
    db.execute(f"""CREATE TEMP TABLE x_join AS
        SELECT r.id, l.record_id, r.city IS DISTINCT FROM l.city OR r.year IS DISTINCT FROM l.year AS label_differs,
               {secs_sql('r.split_21_1km')} AS builder_s, l.finish_seconds AS link_s, r.sex AS rule_sex, l.sex AS link_sex
        FROM h.race_records r FULL JOIN (SELECT record_id, city, year, finish_seconds, sex FROM read_parquet({links})
                                         WHERE distance = 'half' AND source_db = 'half') l ON l.record_id = r.id""")
    one = lambda sql: db.execute(sql).fetchone()[0]  # noqa: E731
    out = {
        'half_rows': one('SELECT count(*) FROM x_join WHERE id IS NOT NULL'),
        'rows_without_a_link_row': one('SELECT count(*) FROM x_join WHERE record_id IS NULL'),
        'link_rows_without_a_row': one('SELECT count(*) FROM x_join WHERE id IS NULL'),
        'label_differs': one('SELECT count(*) FROM x_join WHERE label_differs'),
        'finish_differs': one('SELECT count(*) FROM x_join WHERE builder_s IS NOT NULL AND link_s IS NOT NULL AND abs(builder_s - link_s) > 0.5'),
        'finish_only_in_one': one('SELECT count(*) FROM x_join WHERE (builder_s IS NULL) <> (link_s IS NULL)'),
        'sex_differs': one("SELECT count(*) FROM x_join WHERE link_sex IS NOT NULL AND link_sex IS DISTINCT FROM rule_sex"),
        'sex_only_in_the_rule': one('SELECT count(*) FROM x_join WHERE link_sex IS NULL AND rule_sex IS NOT NULL'),
    }
    db.execute('DROP TABLE x_join')
    out = {k: int(v) for k, v in out.items()}
    for key in ('rows_without_a_link_row', 'link_rows_without_a_row', 'label_differs', 'finish_differs', 'sex_differs'):
        if out[key]:
            fail(f'the link file and race_records disagree on the half rows: {key} = {out[key]:,} ({out})')
    return out


def write_extract(db, out: Path, build: dict) -> tuple[str, dict]:
    tmp = out.with_name(out.name + '.tmp')
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    rows = {}
    try:
        con.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=8192;')
        for table, columns, select in TABLES:
            decl = ', '.join(f'{name} {kind}' for name, kind in columns)
            key = ' PRIMARY KEY' if table in ('subraces', 'race_records', 'identity_left_out', 'people') else ''
            decl = decl.replace(' INTEGER', ' INTEGER' + key, 1) if key else decl
            con.execute(f'CREATE TABLE {table} ({decl})')
            cols = ', '.join(name for name, _ in columns)
            marks = ', '.join('?' for _ in columns)
            cursor = db.execute(f'SELECT {cols} FROM ({select}) ORDER BY {cols}' if key or table == 'links' else f'SELECT {cols} FROM ({select})')
            n = 0
            while batch := cursor.fetchmany(100_000):
                con.executemany(f'INSERT INTO {table} ({cols}) VALUES ({marks})', batch)
                n += len(batch)
            rows[table] = n
        con.execute('CREATE TABLE build (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
        for statement in INDEXES:
            con.execute(statement)
        con.commit()
        orphans = con.execute('SELECT count(*) FROM links WHERE pid NOT IN (SELECT pid FROM people)').fetchone()[0]
        if orphans:
            fail(f'{orphans} link rows without a person')
        digest = content_sha256(con)
        build = {**build, **{f'rows:{t}': str(n) for t, n in rows.items()}, 'extract_content_sha256': digest}
        con.executemany('INSERT INTO build (k, v) VALUES (?, ?)', sorted(build.items()))
        con.commit()
        check = con.execute('PRAGMA integrity_check').fetchall()
        if check != [('ok',)]:
            fail(f'integrity_check: {check}')
    finally:
        con.close()
    os.replace(tmp, out)
    return digest, rows


def write_pin(digest: str) -> None:
    pin = json.loads(half_common.PIN_PATH.read_text())
    pin['links']['extract_content_sha256'] = digest
    half_common.PIN_PATH.write_text(json.dumps(pin, ensure_ascii=False, indent=2) + '\n')


def cut(source, out: Path, *, pin_it: bool = False, log=print) -> dict:
    pin = load_pin()
    if out.name != pin['links']['extract']:
        fail(f"--out must be named {pin['links']['extract']}")
    if half_common.inside(out, ROOT):
        fail(f'{out} is inside the repository; the extract is record-level and stays outside it')
    digests = half_source.check_files(pin, source)
    db = half_common.connect()
    half_source.attach(db, source)
    bad = db.execute('SELECT count(*) FROM h.edition_meta WHERE official_finishers IS NOT NULL AND official_finishers <> round(official_finishers)').fetchone()[0]
    if bad:
        fail(f'{bad} official counts are not whole numbers')
    joins = check_joins(db, source)
    log(f'the half rows of the link file are the rows of race_records: {joins}')
    link_counts = half_source.link_tables(db, source)
    db.execute("""CREATE TEMP TABLE x_subraces AS SELECT row_number() OVER (ORDER BY city NULLS FIRST, year, race NULLS FIRST) AS sub_id, city, year, race
        FROM (SELECT DISTINCT city, year::INTEGER AS year, race FROM h.race_records)""")
    db.execute('CREATE TEMP TABLE x_people AS SELECT row_number() OVER (ORDER BY person_id) AS pid, * FROM l.people')
    build = {
        'half_key': pin['half']['key'], 'links_key': pin['links']['key'], 'marathon_release': pin['marathon_release'],
        **{f'source_sha256:{name}': sha for name, sha in sorted(digests.items())},
        'ns_keys_sql_sha256': half_source.sql_sha256(half_source.NS_KEYS_SQL),
        'script_sha256': file_sha256(Path(__file__)), 'source_module_sha256': file_sha256(Path(half_source.__file__)),
        **{f'joins:{k}': str(v) for k, v in joins.items()}, **{f'links:{k}': str(v) for k, v in link_counts.items()},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    digest, rows = write_extract(db, out, build)
    db.close()
    pinned = pin['links'].get('extract_content_sha256')
    if pin_it:
        write_pin(digest)
    elif pinned is not None and pinned != digest:
        fail(f'the extract ({digest}) is not the pinned one ({pinned}); review the difference, then rerun with --pin')
    return {'extract_content_sha256': digest, 'rows': rows, 'joins': joins, 'links': link_counts, 'bytes': out.stat().st_size}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--core', type=Path, default=None)
    parser.add_argument('--release', type=Path, default=None)
    parser.add_argument('--identity', type=Path, default=None)
    parser.add_argument('--out', type=Path, default=None, help=f'default $PACE_HALF_DIR/{EXTRACT}')
    parser.add_argument('--pin', action='store_true', help='write the content digest into analysis/half-release.json')
    args = parser.parse_args(argv)
    try:
        result = cut(half_source.default_source(args.core, args.release, args.identity),
                     (args.out or half_source.half_dir() / EXTRACT).expanduser(), pin_it=args.pin)
    except HalfError as error:
        print(f'half_extract: {error}', file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
