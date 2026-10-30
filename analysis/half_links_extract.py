"""Cut links-slim.sqlite, the half builders' only input from the runner-links release (docs/HALF_MARATHON.md).

    python3 -I analysis/half_links_extract.py --links-parquet DIR [--out FILE] [--pin]
    python3 -I analysis/half_links_extract.py --links-sqlite runner_links.sqlite [--out FILE] [--pin]

The source (the owner's public CC BY 4.0 release half-dataset-20261029-1202, first released privately as
runner-links-20261029-1156) stays outside the repository, as every record-level file does: either the release's
`runner_links.sqlite` or the parquet tables extracted from it (`runner_links`, `runners`, `candidate_merges`, `build_info`). The extract is written next
to the half snapshot (default `$PACE_HALF_DIR/links-slim.sqlite`, `PACE_HALF_DIR` defaulting to `~/data/half-1133`)
and never under the repository.

Tables written:
- `people(person_id, sex, confidence, ns_keys, key_type, in_candidate_merge)`: one row per person with linked records
  in both databases (`runners.in_both = 1`) and confidence `high` or `medium`. `sex` is the key's published sex,
  `key_type` is `yob` or `age_bin` (from the link rule), `in_candidate_merge` is 1 when the person is in any
  candidate merge (merges are not applied).
- `links(person_id, db, record_id, confidence)`: every link row of those people, `db` 'half' (the half snapshot's
  `race_records.id`) or 'full' (the adopted marathon release's canonical `race_records.id`).
- `build(k, v)`: provenance of this cut (no timestamps of its own).

`person_id` is the first 16 hex digits of SHA-256 of the link `runner_id`. The `runner_id` embeds a normalised name,
so it never leaves this script; no names, keys, bibs or URLs are written.

`extract_content_sha256` is the SHA-256 of a canonical TSV of `people` then `links`: each table's rows ordered by
every column in declared order (SQLite BINARY collation, integers numeric), each field as its SQLite text (integers
in decimal, NULL as `\\N`), fields joined by a tab and every row terminated by `\\n`, with no header. It depends only
on the table contents, so either source form gives the same value, and the Node source recount computes it the same
way. `--pin` writes it into `analysis/half-release.json`; without `--pin` a differing pinned value fails.

DuckDB settings come from the environment: `PACE_HALF_DUCKDB_THREADS` (default 2), `PACE_HALF_DUCKDB_MEMORY`
(default 4GB) and `TMPDIR` for spill files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIN = ROOT / 'analysis' / 'half-release.json'
SOURCE_TABLES = ('runner_links', 'runners', 'candidate_merges', 'build_info')
TIERS = ('high', 'medium')

# Counts of the reviewed link build (link audit, 2026-10-29). A new build fails here until its counts are reviewed.
EXPECTED = {
    'runner-links-20261029-1156': {
        'built_at': '2026-10-29 15:51:57',
        'source': {'runners': 5_818_818, 'runner_links': 8_518_425, 'runner_links_half': 3_835_652,
                   'runner_links_full': 4_682_773, 'candidate_merges': 58_832},
        'people': {'all': 171_466, 'high': 53_152, 'medium': 118_314, 'F': 59_528, 'M': 111_938},
        'links': {'half': 330_311, 'full': 271_038},
    },
}

PEOPLE_COLUMNS = ('person_id', 'sex', 'confidence', 'ns_keys', 'key_type', 'in_candidate_merge')
LINKS_COLUMNS = ('person_id', 'db', 'record_id', 'confidence')
SCHEMA = """
CREATE TABLE people (person_id TEXT PRIMARY KEY, sex TEXT NOT NULL, confidence TEXT NOT NULL, ns_keys INT NOT NULL,
                     key_type TEXT NOT NULL, in_candidate_merge INT NOT NULL);
CREATE TABLE links (person_id TEXT NOT NULL REFERENCES people(person_id), db TEXT NOT NULL, record_id INT NOT NULL,
                    confidence TEXT NOT NULL);
CREATE TABLE build (k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""
INDEXES = 'CREATE UNIQUE INDEX links_record ON links (db, record_id);'


def fail(message: str) -> None:
    raise SystemExit(f'half_links_extract: {message}')


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def connect():
    import duckdb
    db = duckdb.connect()
    db.execute(f"SET threads={int(os.environ.get('PACE_HALF_DUCKDB_THREADS', '2'))}")
    memory = os.environ.get('PACE_HALF_DUCKDB_MEMORY', '4GB')
    if not re.fullmatch(r'\d+(\.\d+)?\s*[KMGT]i?B', memory):
        fail(f'PACE_HALF_DUCKDB_MEMORY must look like 4GB, not {memory!r}')
    db.execute(f"SET memory_limit='{memory}'")
    spill = (os.environ.get('TMPDIR') or tempfile.gettempdir()).replace("'", "''")
    db.execute(f"SET temp_directory='{spill}'")
    db.execute('SET preserve_insertion_order=false')
    return db


def open_source(db, parquet_dir: Path | None, sqlite_path: Path | None) -> dict[str, str]:
    """Views `src_<table>` over either source form; returns {file name: sha256} of the source files."""
    if parquet_dir is not None:
        files = {}
        for table in SOURCE_TABLES:
            path = parquet_dir / f'{table}.parquet'
            if not path.is_file():
                fail(f'missing {path}')
            db.execute(f"CREATE VIEW src_{table} AS SELECT * FROM read_parquet('{path.as_posix()}')")
            files[path.name] = file_sha256(path)
        return files
    assert sqlite_path is not None
    if not sqlite_path.is_file():
        fail(f'missing {sqlite_path}')
    db.execute('INSTALL sqlite')
    db.execute('LOAD sqlite')
    db.execute(f"ATTACH '{sqlite_path.as_posix()}' AS src (TYPE sqlite, READ_ONLY)")
    for table in SOURCE_TABLES:
        db.execute(f'CREATE VIEW src_{table} AS SELECT * FROM src.{table}')
    return {sqlite_path.name: file_sha256(sqlite_path)}


def check_source(db, expected: dict) -> str:
    built = db.execute("SELECT v FROM src_build_info WHERE k = 'built_at'").fetchall()
    if [row[0] for row in built] != [expected['built_at']]:
        fail(f"build_info built_at is {built}, expected {expected['built_at']}")
    got = {
        'runners': db.execute('SELECT count(*) FROM src_runners').fetchone()[0],
        'runner_links': db.execute('SELECT count(*) FROM src_runner_links').fetchone()[0],
        'runner_links_half': db.execute("SELECT count(*) FROM src_runner_links WHERE db = 'half'").fetchone()[0],
        'runner_links_full': db.execute("SELECT count(*) FROM src_runner_links WHERE db = 'full'").fetchone()[0],
        'candidate_merges': db.execute('SELECT count(*) FROM src_candidate_merges').fetchone()[0],
    }
    if got != expected['source']:
        fail(f"source counts {got} differ from the reviewed {expected['source']}")
    return expected['built_at']


def select_people(db) -> None:
    """Temp tables `p` (the people, with runner_id) and `pl` (their link rows); runner_id stays inside DuckDB."""
    tiers = ', '.join(f"'{t}'" for t in TIERS)
    db.execute(f"""CREATE TEMP TABLE p0 AS SELECT runner_id, sex, confidence, ns_keys FROM src_runners
                   WHERE in_both = 1 AND confidence IN ({tiers})""")
    db.execute("""CREATE TEMP TABLE pl AS SELECT l.runner_id, substr(sha256(l.runner_id), 1, 16) AS person_id, l.db,
                    l.record_id, l.confidence, CASE WHEN l.match_rule LIKE '%yob' THEN 'yob' ELSE 'age_bin' END AS key_type
                  FROM src_runner_links l JOIN p0 USING (runner_id)""")
    db.execute("""CREATE TEMP TABLE cmf AS SELECT runner_id_a AS runner_id FROM src_candidate_merges
                  UNION SELECT runner_id_b FROM src_candidate_merges""")
    db.execute("""CREATE TEMP TABLE p AS SELECT substr(sha256(p0.runner_id), 1, 16) AS person_id, p0.sex, p0.confidence,
                    p0.ns_keys, k.key_type, (cmf.runner_id IS NOT NULL)::INT AS in_candidate_merge
                  FROM p0 JOIN (SELECT runner_id, min(key_type) AS key_type, count(DISTINCT key_type) AS key_types,
                                       count(DISTINCT db) AS dbs
                                FROM pl GROUP BY runner_id) k USING (runner_id)
                  LEFT JOIN (SELECT DISTINCT runner_id FROM cmf) cmf USING (runner_id)
                  WHERE k.key_types = 1 AND k.dbs = 2""")
    checks = {
        'people without exactly one key type and links in both databases':
            'SELECT (SELECT count(*) FROM p0) - (SELECT count(*) FROM p)',
        'repeated person_id': 'SELECT count(*) - count(DISTINCT person_id) FROM p',
        'link rows whose confidence differs from the person': """SELECT count(*) FROM pl JOIN p0 USING (runner_id)
                                                                 WHERE pl.confidence <> p0.confidence""",
        'repeated (db, record_id)': 'SELECT count(*) - count(DISTINCT (db, record_id)) FROM pl',
        'null fields': """SELECT count(*) FROM p WHERE sex IS NULL OR confidence IS NULL OR ns_keys IS NULL
                          OR key_type IS NULL""",
        'null link fields': 'SELECT count(*) FROM pl WHERE db IS NULL OR record_id IS NULL OR confidence IS NULL',
        'sex outside M and F': "SELECT count(*) FROM p WHERE sex NOT IN ('M', 'F')",
    }
    for name, sql in checks.items():
        n = db.execute(sql).fetchone()[0]
        if n:
            fail(f'{name}: {n}')


def check_counts(db, expected: dict) -> dict[str, int]:
    people = dict(db.execute('SELECT confidence, count(*) FROM p GROUP BY 1').fetchall())
    people.update(dict(db.execute('SELECT sex, count(*) FROM p GROUP BY 1').fetchall()))
    people['all'] = db.execute('SELECT count(*) FROM p').fetchone()[0]
    links = dict(db.execute('SELECT db, count(*) FROM pl GROUP BY 1').fetchall())
    if people != expected['people']:
        fail(f"people {people} differ from the reviewed {expected['people']}")
    if links != expected['links']:
        fail(f"link rows {links} differ from the reviewed {expected['links']}")
    return {'people': people['all'], 'people_high': people['high'], 'people_medium': people['medium'],
            'links_half': links['half'], 'links_full': links['full']}


def field(value) -> str:
    if value is None:
        return '\\N'
    if isinstance(value, int):
        return str(value)
    if not isinstance(value, str) or '\t' in value or '\n' in value or '\\' in value:
        fail(f'cannot write field {value!r} into the canonical TSV')
    return value


def content_sha256(con: sqlite3.Connection) -> str:
    """The canonical TSV digest of `people` then `links` (module docstring)."""
    digest = hashlib.sha256()
    for table, columns in (('people', PEOPLE_COLUMNS), ('links', LINKS_COLUMNS)):
        cols = ', '.join(columns)
        for row in con.execute(f'SELECT {cols} FROM {table} ORDER BY {cols}'):
            digest.update(('\t'.join(field(v) for v in row) + '\n').encode('utf-8'))
    return digest.hexdigest()


def write_extract(db, out: Path, build: dict[str, str]) -> tuple[str, dict[str, int]]:
    tmp = out.with_name(out.name + '.tmp')
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    try:
        con.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;' + SCHEMA)
        for table, columns in (('people', PEOPLE_COLUMNS), ('links', LINKS_COLUMNS)):
            source = 'p' if table == 'people' else 'pl'
            cols = ', '.join(columns)
            cursor = db.execute(f'SELECT {cols} FROM {source} ORDER BY {cols}')
            marks = ', '.join('?' for _ in columns)
            while rows := cursor.fetchmany(50_000):
                con.executemany(f'INSERT INTO {table} ({cols}) VALUES ({marks})', rows)
        con.execute(INDEXES)
        con.commit()
        orphans = con.execute('SELECT count(*) FROM links WHERE person_id NOT IN (SELECT person_id FROM people)').fetchone()[0]
        if orphans:
            fail(f'{orphans} link rows without a person')
        digest = content_sha256(con)
        rows = {'people': con.execute('SELECT count(*) FROM people').fetchone()[0],
                'links': con.execute('SELECT count(*) FROM links').fetchone()[0]}
        build = {**build, 'extract_content_sha256': digest}
        con.executemany('INSERT INTO build (k, v) VALUES (?, ?)', sorted(build.items()))
        con.commit()
        con.execute('VACUUM')
        check = con.execute('PRAGMA integrity_check').fetchall()
        if check != [('ok',)]:
            fail(f'integrity_check: {check}')
    finally:
        con.close()
    os.replace(tmp, out)
    return digest, rows


def inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def write_pin(pin: dict, digest: str) -> None:
    pin['links']['extract_content_sha256'] = digest
    PIN.write_text(json.dumps(pin, indent=2, ensure_ascii=False) + '\n')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--links-parquet', type=Path, help='folder with runner_links, runners, candidate_merges and build_info .parquet')
    source.add_argument('--links-sqlite', type=Path, help="the release's runner_links.sqlite")
    half_dir = Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1133')
    parser.add_argument('--out', type=Path, default=half_dir / 'links-slim.sqlite')
    parser.add_argument('--pin', action='store_true', help='write extract_content_sha256 into analysis/half-release.json')
    args = parser.parse_args(argv)

    out = args.out.expanduser()
    if inside(out, ROOT):
        fail(f'{out} is inside the repository; the extract is record-level and lives next to the half snapshot')
    if not out.parent.is_dir():
        fail(f'missing folder {out.parent}')
    pin = json.loads(PIN.read_text())
    tag = pin['links']['private_tag']
    if tag not in EXPECTED:
        fail(f'no reviewed counts for links build {tag}')
    if pin['links']['pairs_with'] != pin['half']['private_tag']:
        fail('the pinned link build does not pair with the pinned half snapshot')
    if out.name != pin['links']['extract']:
        fail(f"the extract must be named {pin['links']['extract']}")
    release = json.loads((ROOT / 'analysis' / 'release.json').read_text())
    if pin['marathon_release'] != release['tag']:
        fail(f"the pin binds marathon release {pin['marathon_release']}, but the adopted release is {release['tag']}")
    expected = EXPECTED[tag]

    db = connect()
    files = open_source(db, args.links_parquet, args.links_sqlite)
    built_at = check_source(db, expected)
    if pin['links']['built_at'] != built_at.replace(' ', 'T'):
        fail(f"the pin says the links were built at {pin['links']['built_at']}, the source says {built_at}")
    select_people(db)
    counts = check_counts(db, expected)
    build = {
        'schema_version': '1',
        'links_tag': tag,
        'pairs_with': pin['links']['pairs_with'],
        'marathon_release': pin['marathon_release'],
        'built_at': built_at,
        'tiers': ','.join(TIERS),
        'source_form': 'parquet' if args.links_parquet else 'sqlite',
        'script_sha256': file_sha256(Path(__file__)),
        **{f'source_sha256:{name}': sha for name, sha in sorted(files.items())},
        **{k: str(v) for k, v in counts.items()},
    }
    digest, rows = write_extract(db, out, build)
    db.close()
    print(f'{out}: {rows["people"]:,} people, {rows["links"]:,} link rows '
          f'({counts["links_half"]:,} half, {counts["links_full"]:,} full); {out.stat().st_size:,} bytes')
    print(f'extract_content_sha256 {digest}')

    pinned = pin['links']['extract_content_sha256']
    if args.pin:
        if pinned != digest:
            write_pin(pin, digest)
            print(f'wrote extract_content_sha256 into {PIN.relative_to(ROOT)}')
        else:
            print(f'{PIN.relative_to(ROOT)} already pins this extract')
    elif re.fullmatch(r'[0-9a-f]{64}', pinned) and pinned != digest:
        print(f'the pin holds {pinned}; review the change, then rerun with --pin', file=sys.stderr)
        return 1
    elif pinned != digest:
        print('the pin holds no extract digest yet; rerun with --pin to write it')
    return 0


if __name__ == '__main__':
    sys.exit(main())
