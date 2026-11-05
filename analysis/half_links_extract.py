"""Cut links-v4.sqlite, the half builders' only input from the v4 person links (docs/HALF_MARATHON.md).

    python3 -I analysis/half_links_extract.py --v4-dir DIR --half platform_half.sqlite [--out FILE] [--pin]

Sources (record-level, all outside the repository; the owner's public CC BY 4.0 release half-dataset-20261030-1904, whose
person IDs were first released privately as person-ids-v4-20261030-1150, the pin's `links.key`):
- `--v4-dir`: the release's race_results_linked.parquet and persons.parquet, with MATCHING_V4.md, COLUMNS_V4.md, checks.txt
  and code.tgz; every one must carry the sha256 the pin names (`links.assets`), and code.tgz's tosql4.py must write the
  producer build_info string the pin quotes (`links.coverage.producer_build_info`, a known understatement of the coverage).
- `--half`: the pinned half snapshot (platform_half.sqlite, sha256 checked; refused while a non-empty -wal sits beside
  it, since DuckDB's SQLite scanner cannot open a file immutable), for the join checks.
- the eligible marathons of the adopted marathon release, from the committed runner shards (analysis/half_marathon.py),
  for the join checks; the runner manifest's sha256 is recorded.
The extract is written next to the half snapshot (default `$PACE_HALF_DIR/links-v4.sqlite`, `PACE_HALF_DIR` defaulting to
`~/data/half-1904`) and never under the repository.

Checks (each fails loudly; the reviewed counts are EXPECTED[pin links.key], the re-timed editions the policy's
`link_editions`):
- Source: row, linked-row and person counts, the half rows and their largest record id, the marathon rows and the counts by
  confidence equal the review, and the half and marathon coverage equal the pin. None of these may occur: a repeated
  (source_db, record_id); a person with two published sexes, or two rows in one race series, race, year and distance; a
  person_id that does not match `^p4_[0-9a-f]{16}$` (so an ID that carries a name fails); a linked row without a
  confidence or an unlinked one with one; a person with more than one of the tiers high_elite, high, medium and low; an age
  key that is not `yob:<digits>` or `ag:<bin>` (a few yob keys carry years of under four digits, from the source's
  ages; they count as keys like any other); a finish in seconds with a fraction; a strong row (below) without a normalized
  name or a published sex M or F. persons.parquet must hold exactly the linked persons, each with the rows', half rows' and
  marathon rows' counts and the rows' published sex (review R16), and only sex M or F.
- Half rows against the snapshot: every snapshot row with an id up to the coverage boundary has a v4 row and no v4 half row
  lies beyond it or lacks a snapshot row; city, year, race and age are equal on every row; the finish text is equal except
  on the rows of the policy's re-timed editions (exactly their frozen row counts); where the text is equal and the builders
  parse it (half_common.TIME_PATTERN), the v4 seconds are within 0.5 s of the builders' seconds, and the equal texts the
  builders do not parse (they supply no finish) are counted; the published sex is equal except the reviewed differences;
  the v4 normalized name shares at least one token with the snapshot's name (both lowered, accents stripped, every run of
  characters other than a-z and 0-9 a space) except the reviewed rows (review R3).
- Eligible marathons against the v4 marathon rows (joined on the canonical record id): every one up to the link build's
  largest marathon record id has a v4 row, with the same city and year, a finish within 0.5 s and the published sex its
  recorded sex maps to (men M, women F, other or not recorded neither). Those above it were loaded after the build
  (New York 2026 in master-20261103b); they are counted by edition, frozen per marathon release, and supply no linked
  marathon (November 4, 2026).

Tables written:
- `people(person_id, sex, tier, ns_keys, key_type, in_union, k, k_block)`: every v4 person whose tier is high_elite,
  high or medium, whose persons.parquet sex is M or F, and who has at least one half row and one marathon row of that
  own confidence (the strong rows: rows whose own confidence is high_elite, high or medium, whatever the status of
  their record). `tier` is the single value among high_elite, high, medium and low the person's rows carry. `ns_keys`
  follows the v1 link rule like for like (lead rulings L.4, review R1; NS_KEYS_SQL, frozen): the number of distinct
  `age_key` values per (`name_norm`, published sex M or F), counted over every v4 row of either distance that has an age
  key, linked or not; each row takes its own block's count (0 when no row of the block has an age key), and a person
  takes the largest over the person's strong rows of either distance. `key_type` says which age keys those rows carry:
  `yob`, `age_bin`, `mixed` or `none`. `in_union` is 1 when a row of the person was joined by one of the producer's
  unions (method `+middle_name_union` or `+natdiff_union`). `k` (evidence only, never a filter or a battery member; lead
  rulings L) rebuilds the producer's block size the way code.tgz's final3.sql builds it, made deterministic (K_SQL,
  frozen): a person's block is the smallest sorted-token name over the person's rows and the persons.parquet sex, and `k`
  counts the persons of that block with a row not attached without an age; `k_block` is the first 16 hex digits of the
  block's SHA-256, so a recount can check that every person of a block carries one `k` and that a block holds no more
  extract people than `k` (review R17).
- `links(person_id, db, record_id, confidence, finish_s, sex, city, year, ns_keys)`: every linked row of those people,
  whatever its confidence (the same-date conflicts are counted over all of them), `db` 'half' (the snapshot's
  `race_records.id`) or 'full' (the adopted marathon release's canonical `race_records.id`), with the link build's own
  finish in whole seconds, published sex, city and year (review R3) and the row's block count.
- `build(k, v)`: provenance of this cut (no timestamps of its own): the link build, the snapshot it applies to, the
  marathon release, every source's sha256, the runner manifest's sha256, this script's and the two frozen SQL texts'
  sha256, the coverage, the producer's build_info string and the counts.
No names, name keys, ages, bibs or URLs are written.

`extract_content_sha256` is the SHA-256 of a canonical TSV of `people` then `links`: each table's rows ordered by every
column in declared order (SQLite BINARY collation, integers numeric), each field as its SQLite text (integers in decimal,
NULL as `\\N`), fields joined by a tab and every row terminated by `\\n`, with no header. It depends only on the table
contents, and the Node source recount computes it the same way. `--pin` writes it into `analysis/half-release.json`;
without `--pin` a differing pinned value fails.

DuckDB settings come from the environment: `PACE_HALF_DUCKDB_THREADS` (default 2), `PACE_HALF_DUCKDB_MEMORY` (default
4GB), `PACE_HALF_DUCKDB_MAX_TEMP` (the spill cap, default 4GB) and `TMPDIR` for spill files.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
PIN = ROOT / 'analysis' / 'half-release.json'
V4_FILES = ('race_results_linked.parquet', 'persons.parquet')
STRONG = ('high_elite', 'high', 'medium')        # the tiers a person, and each row of a pair, must hold
TIERS = ('high_elite', 'high', 'medium', 'low')  # the person tiers the producer's rows carry (final3.sql pconf)
PERSON_ID = r'^p4_[0-9a-f]{16}$'
_STRONG_SQL = ', '.join(f"'{t}'" for t in STRONG)

# The release's own schema (COLUMNS_V4.md; the columns this script reads, with their parquet types).
RRL_COLUMNS = {'person_id': 'VARCHAR', 'confidence': 'VARCHAR', 'method': 'VARCHAR', 'distance': 'VARCHAR',
               'race_series': 'VARCHAR', 'race': 'VARCHAR', 'year': 'BIGINT', 'city': 'VARCHAR', 'finish_seconds': 'DOUBLE',
               'finish_raw': 'VARCHAR', 'sex': 'VARCHAR', 'age': 'BIGINT', 'age_key': 'VARCHAR', 'name_norm': 'VARCHAR',
               'source_db': 'VARCHAR', 'record_id': 'BIGINT'}
PERSONS_COLUMNS = {'person_id': 'VARCHAR', 'sex': 'VARCHAR', 'n_results': 'BIGINT', 'n_halves': 'BIGINT',
                   'n_marathons': 'BIGINT'}

# ns_keys, like for like with runner links v1 (lead rulings L.4; review R1): distinct age keys per normalized name and
# published sex over every v4 row with one; each linked row's block count (0 when its block holds no age key, NULL when
# the row has no name or no published M or F sex); a person's value, the largest over the person's strong rows (own
# confidence high_elite, high or medium; either distance, whatever the record's status). Frozen: its sha256 is in the
# build table.
NS_KEYS_SQL = f"""
CREATE TEMP TABLE ns_block AS
  SELECT name_norm, sex, count(DISTINCT age_key) AS ns_keys FROM rrl
  WHERE age_key IS NOT NULL AND name_norm IS NOT NULL AND sex IN ('M', 'F')
  GROUP BY name_norm, sex;
CREATE TEMP TABLE lr AS
  SELECT r.person_id, r.source_db AS db, r.record_id, r.confidence, r.method, r.age_key, r.name_norm, r.sex,
         r.finish_seconds, r.city, r.year,
         CASE WHEN r.name_norm IS NOT NULL AND r.sex IN ('M', 'F') THEN coalesce(b.ns_keys, 0) END AS ns_keys
  FROM rrl r LEFT JOIN ns_block b ON b.name_norm = r.name_norm AND b.sex = r.sex
  WHERE r.person_id IS NOT NULL;
CREATE TEMP TABLE person_ns AS
  SELECT person_id, max(ns_keys) AS ns_keys FROM lr WHERE confidence IN ({_STRONG_SQL}) GROUP BY person_id;
"""
# k, the producer's block size (code.tgz final3.sql `bk`), rebuilt deterministically: the smallest sorted-token name over
# the person's rows (final3 takes any_value) and the persons.parquet sex; persons with a row not attached without an age
# count. Evidence only (lead rulings L). Frozen: its sha256 is in the build table.
K_SQL = """
CREATE TEMP TABLE person_block AS
  SELECT l.person_id, min(array_to_string(list_sort(string_split(l.name_norm, ' ')), ' ')) AS ns, min(p.sex) AS sx,
         count(*) FILTER (WHERE l.method LIKE 'noage%' OR l.method LIKE 'name_only%') < count(*) AS aged
  FROM lr l JOIN persons p USING (person_id) GROUP BY l.person_id;
CREATE TEMP TABLE block_k AS SELECT ns, sx, count(*) AS k FROM person_block WHERE aged GROUP BY ns, sx;
CREATE TEMP TABLE person_k AS
  SELECT b.person_id, coalesce(k.k, 0) AS k, substr(sha256(b.ns || chr(9) || b.sx), 1, 16) AS k_block, b.aged
  FROM person_block b LEFT JOIN block_k k USING (ns, sx);
"""

# Counts of the reviewed link build, measured 2026-10-31 on this branch (s2-extract-setb; the source counts equal the
# producer's checks.txt). A new build fails here until its counts are reviewed.
EXPECTED = {
    'person-ids-v4-20261030-1150': {
        'source': {'rows': 12_713_307, 'linked': 11_838_333, 'persons': 6_353_425, 'half_rows': 7_384_970,
                   'half_max_record_id': 7_411_867, 'marathon_rows': 5_328_337,
                   'confidence': {'high': 4_431_250, 'high_elite': 12_579, 'low': 879_785, 'low_noage': 1_707_889,
                                  'low_noage_series': 83_529, 'low_nosex': 101_592, 'medium': 4_621_709, 'null': 874_974}},
        'joins': {
            # covered half rows whose finish text equals the link build's but that the builders do not parse: negative
            # times in Rafaela 2020 (1), Rafaela 2021 (2) and Santander 2023 (3), which the link build read as negative
            # seconds; the builders give them no finish (R2), so they never pair
            'half_finish_unparsed': 6,
            # the published sex differs only where the snapshot says X and the link build has none
            'half_sex': [{'snapshot': 'X', 'v4': None, 'rows': 137}],
            # the v4 normalized name shares no token with the snapshot's name (review R3: one row, Luebeck 2025)
            'half_name_no_shared_token': [{'city': 'Luebeck', 'year': 2025, 'rows': 1}],
        },
        # The eligible marathons joined and those beyond the link build's marathon coverage, by adopted marathon release.
        'joins_by_marathon_release': {
            'private-export-20261021-1050': {'marathons': 4_108_749, 'marathons_beyond_coverage': []},
            # 2026-11-04: every eligible marathon up to the build's largest marathon id (5,752,904) joins, Amsterdam
            # 2023's filled finishes and the released New York 2008 included; New York 2026 (loaded after the build) has
            # no v4 row. The people, links and k counts are unchanged.
            'master-20261103b': {'marathons': 4_222_246,
                                 'marathons_beyond_coverage': [{'city': 'New York', 'year': 2026, 'rows': 60_231}]},
        },
        # 2026-10-31: people with a tier and a strong half row and a strong marathon row; ns_keys_0 are those whose strong
        # rows all sit in name-and-sex blocks without an age key (they pass ns_keys <= 3 and are not in ns_keys_1)
        'people': {'F': 181_617, 'M': 320_677, 'all': 502_294, 'high': 280_463, 'high_elite': 1_072, 'in_union': 159,
                   'medium': 220_759, 'ns_keys_0': 3_225},
        'links': {'full': 1_188_333, 'half': 1_260_231},
        # the rebuilt k against the producer's tiers: every high person is alone in its rebuilt block
        'k': {'high_k_not_1': 0},
    },
}

PEOPLE_COLUMNS = ('person_id', 'sex', 'tier', 'ns_keys', 'key_type', 'in_union', 'k', 'k_block')
LINKS_COLUMNS = ('person_id', 'db', 'record_id', 'confidence', 'finish_s', 'sex', 'city', 'year', 'ns_keys')
SCHEMA = """
CREATE TABLE people (person_id TEXT PRIMARY KEY, sex TEXT NOT NULL, tier TEXT NOT NULL, ns_keys INT NOT NULL,
                     key_type TEXT NOT NULL, in_union INT NOT NULL, k INT NOT NULL, k_block TEXT NOT NULL);
CREATE TABLE links (person_id TEXT NOT NULL REFERENCES people(person_id), db TEXT NOT NULL, record_id INT NOT NULL,
                    confidence TEXT NOT NULL, finish_s INT, sex TEXT, city TEXT NOT NULL, year INT NOT NULL, ns_keys INT);
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


def sql_sha256(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _size(name: str, default: str) -> str:
    value = os.environ.get(name, default)
    if not re.fullmatch(r'\d+(\.\d+)?\s*[KMGT]i?B', value):
        fail(f'{name} must look like 4GB, not {value!r}')
    return value


def connect():
    import duckdb
    db = duckdb.connect()
    db.execute(f"SET threads={int(os.environ.get('PACE_HALF_DUCKDB_THREADS', '2'))}")
    db.execute(f"SET memory_limit='{_size('PACE_HALF_DUCKDB_MEMORY', '4GB')}'")
    spill = (os.environ.get('TMPDIR') or tempfile.gettempdir()).replace("'", "''")
    db.execute(f"SET temp_directory='{spill}'")
    db.execute(f"SET max_temp_directory_size='{_size('PACE_HALF_DUCKDB_MAX_TEMP', '4GB')}'")
    db.execute('SET preserve_insertion_order=false')
    return db


def open_v4(db, v4_dir: Path) -> None:
    """Views `rrl` and `persons` over the two parquet files, failing on a missing column or another type."""
    for view, name, columns in (('rrl', 'race_results_linked.parquet', RRL_COLUMNS), ('persons', 'persons.parquet', PERSONS_COLUMNS)):
        path = (v4_dir / name).as_posix().replace("'", "''")
        types = dict(db.execute(f"SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_parquet('{path}'))").fetchall())
        wrong = {c: types.get(c) for c, t in columns.items() if types.get(c) != t}
        if wrong:
            fail(f'{name}: columns missing or of another type than the release schema: {wrong}')
        db.execute(f"CREATE OR REPLACE VIEW {view} AS SELECT * FROM read_parquet('{path}')")


def attach_half(db, half: Path) -> None:
    """The snapshot's race_records as view `hs` (read-only; the caller has refused a non-empty -wal)."""
    db.execute('INSTALL sqlite')
    db.execute('LOAD sqlite')
    db.execute(f"ATTACH '{half.as_posix()}' AS h (TYPE sqlite, READ_ONLY)")
    db.execute("""CREATE OR REPLACE VIEW hs AS SELECT id, city, year::BIGINT AS year, race, split_21_1km AS fin, sex,
                  age::BIGINT AS age, runner FROM h.race_records""")


def register_marathons(db, marathons) -> None:
    """Table `mar`: every eligible marathon finish (analysis/half_marathon.Marathons)."""
    frame = marathons.frame()[['m_record_id', 'm_city', 'm_year', 'm_gender', 'm_finish_s']]
    db.register('mar_df', frame)
    db.execute('CREATE OR REPLACE TEMP TABLE mar AS SELECT m_record_id::BIGINT AS m_record_id, m_city, m_year::BIGINT AS m_year, '
               'm_gender::INTEGER AS m_gender, m_finish_s::DOUBLE AS m_finish_s FROM mar_df')
    db.unregister('mar_df')


def _zero(db, checks: dict) -> None:
    """Fail naming every check whose count is not 0."""
    bad = {name: n for name, sql in checks.items() if (n := db.execute(sql).fetchone()[0])}
    if bad:
        fail('; '.join(f'{name}: {n:,}' for name, n in bad.items()))


def check_source(db, pin: dict) -> dict:
    """The source counts (EXPECTED[..]['source']) and the checks that must find nothing."""
    q = db.execute("""SELECT count(*), count(person_id), count(DISTINCT person_id),
        count(*) FILTER (WHERE source_db = 'half'), max(record_id) FILTER (WHERE source_db = 'half'),
        count(*) FILTER (WHERE source_db = 'full') FROM rrl""").fetchone()
    got = dict(zip(('rows', 'linked', 'persons', 'half_rows', 'half_max_record_id', 'marathon_rows'), (int(x) for x in q)))
    got['confidence'] = {('null' if c is None else c): int(n) for c, n in db.execute('SELECT confidence, count(*) FROM rrl GROUP BY 1').fetchall()}
    got['confidence'] = dict(sorted(got['confidence'].items()))
    cov = pin['links']['coverage']
    if [got['half_rows'], got['half_max_record_id'], got['marathon_rows']] != [cov['half_rows'], cov['half_max_record_id'], cov['marathon_rows']]:
        fail(f"the link build's coverage {got} differs from the pin's {cov}")
    strong = _STRONG_SQL
    tiers = ', '.join(f"'{t}'" for t in TIERS)
    _zero(db, {
        'rows of another source_db or distance': """SELECT count(*) FROM rrl WHERE source_db IS NULL OR source_db NOT IN ('half', 'full')
            OR distance IS DISTINCT FROM CASE source_db WHEN 'half' THEN 'half' ELSE 'marathon' END""",
        'repeated (source_db, record_id)': 'SELECT count(*) - count(DISTINCT (source_db, record_id)) FROM rrl',
        'rows without a record id': 'SELECT count(*) FROM rrl WHERE record_id IS NULL',
        'persons with two published sexes': """SELECT count(*) FROM (SELECT person_id FROM rrl WHERE person_id IS NOT NULL
            AND sex IS NOT NULL GROUP BY 1 HAVING count(DISTINCT sex) > 1)""",
        'persons with two rows in one race series, race, year and distance': """SELECT count(*) FROM (SELECT person_id FROM rrl
            WHERE person_id IS NOT NULL GROUP BY person_id, source_db, race_series, race, year HAVING count(*) > 1)""",
        f'person ids not matching {PERSON_ID}': f"SELECT count(*) FROM rrl WHERE person_id IS NOT NULL AND NOT regexp_full_match(person_id, '{PERSON_ID}')",
        'linked rows without a confidence, or unlinked rows with one': 'SELECT count(*) FROM rrl WHERE (person_id IS NULL) <> (confidence IS NULL)',
        'persons with more than one tier': f"""SELECT count(*) FROM (SELECT person_id FROM rrl WHERE person_id IS NOT NULL
            GROUP BY 1 HAVING count(DISTINCT confidence) FILTER (WHERE confidence IN ({tiers})) > 1)""",
        'age keys of another form': "SELECT count(*) FROM rrl WHERE age_key IS NOT NULL AND NOT regexp_full_match(age_key, '(yob:[0-9]+|ag:.+)')",
        'finishes in seconds with a fraction': 'SELECT count(*) FROM rrl WHERE finish_seconds IS NOT NULL AND finish_seconds <> round(finish_seconds)',
        'strong rows without a normalized name or a published sex M or F': f"""SELECT count(*) FROM rrl WHERE confidence IN ({strong})
            AND (name_norm IS NULL OR trim(name_norm) = '' OR sex IS NULL OR sex NOT IN ('M', 'F'))""",
    })
    # persons.parquet against the rows (review R16)
    _zero(db, {
        f'persons.parquet ids not matching {PERSON_ID}': f"SELECT count(*) FROM persons WHERE person_id IS NULL OR NOT regexp_full_match(person_id, '{PERSON_ID}')",
        'repeated persons.parquet ids': 'SELECT count(*) - count(DISTINCT person_id) FROM persons',
        'persons.parquet sex other than M or F': "SELECT count(*) FROM persons WHERE sex IS NULL OR sex NOT IN ('M', 'F')",
        'persons.parquet and the linked rows disagree (a person on one side only, n_results, n_halves, n_marathons or sex)': """
            WITH a AS (SELECT person_id, count(*) AS n, count(*) FILTER (WHERE source_db = 'half') AS nh,
                              count(*) FILTER (WHERE source_db = 'full') AS nm, min(sex) AS sx FROM rrl
                       WHERE person_id IS NOT NULL GROUP BY 1)
            SELECT count(*) FROM a FULL JOIN persons p USING (person_id)
            WHERE a.person_id IS NULL OR p.person_id IS NULL OR a.n <> p.n_results OR a.nh <> p.n_halves OR a.nm <> p.n_marathons
               OR (a.sx IS NOT NULL AND a.sx <> p.sex)""",
    })
    return got


# The tokens of a name for the half name check (review R3): lowered, accents stripped, every run of characters other than
# a-z and 0-9 a space.
NAME_TOKENS = "list_filter(string_split(regexp_replace(strip_accents(lower(coalesce({x}, ''))), '[^a-z0-9]+', ' ', 'g'), ' '), t -> t <> '')"


def check_half_join(db, pin: dict, link_editions: dict) -> dict:
    """The v4 half rows against the snapshot (module docstring). Returns the counted exceptions."""
    import half_common
    b = int(pin['links']['coverage']['half_max_record_id'])
    db.execute("""CREATE OR REPLACE TEMP TABLE vh AS SELECT record_id, city, year, race, finish_raw, finish_seconds, sex, age, name_norm
                  FROM rrl WHERE source_db = 'half'""")
    db.execute('CREATE OR REPLACE TEMP TABLE hsn AS SELECT * FROM hs')
    secs = half_common.secs_sql('h.fin')
    on = 'FROM hsn h JOIN vh v ON v.record_id = h.id'
    _zero(db, {
        'snapshot rows inside the coverage boundary without a v4 row': f'SELECT count(*) FROM hsn h ANTI JOIN vh v ON v.record_id = h.id WHERE h.id <= {b}',
        'v4 half rows beyond the coverage boundary': f'SELECT count(*) FROM vh WHERE record_id > {b}',
        'v4 half rows without a snapshot row': 'SELECT count(*) FROM vh v ANTI JOIN hsn h ON v.record_id = h.id',
        'covered rows whose city, year or race differ': f"""SELECT count(*) {on} WHERE h.city IS DISTINCT FROM v.city
            OR h.year IS DISTINCT FROM v.year OR h.race IS DISTINCT FROM v.race""",
        'covered rows whose age differs': f'SELECT count(*) {on} WHERE h.age IS DISTINCT FROM v.age',
        'covered rows whose finish text is equal but whose seconds differ from the builders\' by more than 0.5 s': f"""SELECT count(*) {on}
            WHERE h.fin IS NOT DISTINCT FROM v.finish_raw AND {secs} IS NOT NULL
              AND NOT coalesce(abs(v.finish_seconds - {secs}) <= 0.5, false)""",
    })
    text = [{'city': c, 'year': int(y), 'rows': int(n)} for c, y, n in db.execute(f"""SELECT h.city, h.year, count(*) {on}
        WHERE h.fin IS DISTINCT FROM v.finish_raw GROUP BY 1, 2 ORDER BY 1, 2""").fetchall()]
    want = sorted(({'city': x['city'], 'year': int(x['year']), 'rows': int(x['rows'])} for x in link_editions['retimed']),
                  key=lambda x: (x['city'], x['year']))
    if text != want:
        fail(f"the covered rows whose finish text differs from the link build's are {text}, not the policy's re-timed editions {want}")
    unparsed = int(db.execute(f'SELECT count(*) {on} WHERE h.fin IS NOT DISTINCT FROM v.finish_raw AND {secs} IS NULL').fetchone()[0])
    sex = [{'snapshot': hs, 'v4': vs, 'rows': int(n)} for hs, vs, n in db.execute(f"""SELECT h.sex, v.sex, count(*) {on}
        WHERE h.sex IS DISTINCT FROM v.sex GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2""").fetchall()]
    ht, vt = NAME_TOKENS.format(x='h.runner'), NAME_TOKENS.format(x='v.name_norm')
    names = [{'city': c, 'year': int(y), 'rows': int(n)} for c, y, n in db.execute(f"""SELECT h.city, h.year, count(*) {on}
        WHERE len({vt}) > 0 AND len(list_intersect({ht}, {vt})) = 0 GROUP BY 1, 2 ORDER BY 1, 2""").fetchall()]
    db.execute('DROP TABLE hsn')
    db.execute('DROP TABLE vh')
    return {'half_finish_unparsed': unparsed, 'half_sex': sex, 'half_name_no_shared_token': names}


def check_marathon_join(db) -> int:
    """Every eligible marathon (table `mar`) against its v4 marathon row. Returns the number of eligible marathons.

    The link build covers the marathon rows up to its largest marathon record id (the canonical race_records.id); an
    eligible marathon above it was loaded after the build (New York 2026 in master-20261103b) and has no v4 row: those
    are counted by edition in `marathon_coverage` and frozen per marathon release, never joined (November 4, 2026). A
    missing v4 row at or below that id fails, as before."""
    v = "(SELECT record_id, city, year, finish_seconds, sex FROM rrl WHERE source_db = 'full')"
    on = f'FROM mar m JOIN {v} v ON v.record_id = m.m_record_id'
    top = f'(SELECT max(record_id) FROM {v})'
    _zero(db, {
        'eligible marathons without a v4 row inside the link build\'s marathon coverage':
            f'SELECT count(*) FROM mar m ANTI JOIN {v} v ON v.record_id = m.m_record_id WHERE m.m_record_id <= {top}',
        'eligible marathons whose city or year differ': f'SELECT count(*) {on} WHERE v.city IS DISTINCT FROM m.m_city OR v.year IS DISTINCT FROM m.m_year',
        'eligible marathons whose finish differs by more than 0.5 s': f'SELECT count(*) {on} WHERE NOT coalesce(abs(v.finish_seconds - m.m_finish_s) <= 0.5, false)',
        'eligible marathons whose recorded sex does not map to the published sex': f"""SELECT count(*) {on} WHERE NOT CASE m.m_gender
            WHEN 1 THEN coalesce(v.sex = 'M', false) WHEN 2 THEN coalesce(v.sex = 'F', false)
            ELSE v.sex IS NULL OR v.sex NOT IN ('M', 'F') END""",
    })
    return int(db.execute('SELECT count(*) FROM mar').fetchone()[0])


def marathon_coverage(db) -> list:
    """The eligible marathons beyond the link build's marathon coverage (no v4 row, above its largest marathon record
    id), by edition: they supply no linked marathon."""
    v = "(SELECT record_id FROM rrl WHERE source_db = 'full')"
    rows = db.execute(f"""SELECT m.m_city, m.m_year, count(*) FROM mar m ANTI JOIN {v} v ON v.record_id = m.m_record_id
                          WHERE m.m_record_id > (SELECT max(record_id) FROM {v}) GROUP BY ALL ORDER BY ALL""").fetchall()
    return [{'city': c, 'year': int(y), 'rows': int(n)} for c, y, n in rows]


def select_people(db) -> None:
    """Temp tables `pe` (the people) and `le` (every linked row of theirs); see the module docstring."""
    for sql in (NS_KEYS_SQL, K_SQL):
        for statement in filter(str.strip, sql.split(';')):
            db.execute(statement)
    strong, tiers = _STRONG_SQL, ', '.join(f"'{t}'" for t in TIERS)
    db.execute(f"""CREATE TEMP TABLE person_stat AS SELECT person_id,
          min(confidence) FILTER (WHERE confidence IN ({tiers})) AS tier,
          bool_or(db = 'half' AND confidence IN ({strong})) AS strong_half,
          bool_or(db = 'full' AND confidence IN ({strong})) AS strong_full,
          bool_or(confidence IN ({strong}) AND age_key LIKE 'yob:%') AS has_yob,
          bool_or(confidence IN ({strong}) AND age_key LIKE 'ag:%') AS has_ag,
          bool_or(method LIKE '%+middle_name_union%' OR method LIKE '%+natdiff_union%') AS in_union
        FROM lr GROUP BY person_id""")
    db.execute(f"""CREATE TEMP TABLE pe AS SELECT s.person_id, p.sex, s.tier, n.ns_keys,
          CASE WHEN s.has_yob AND s.has_ag THEN 'mixed' WHEN s.has_yob THEN 'yob' WHEN s.has_ag THEN 'age_bin' ELSE 'none' END AS key_type,
          s.in_union::INTEGER AS in_union, k.k, k.k_block, k.aged
        FROM person_stat s JOIN persons p USING (person_id) JOIN person_ns n USING (person_id) JOIN person_k k USING (person_id)
        WHERE s.tier IN ({strong}) AND p.sex IN ('M', 'F') AND s.strong_half AND s.strong_full""")
    db.execute("""CREATE TEMP TABLE le AS SELECT l.person_id, l.db, l.record_id, l.confidence, CAST(l.finish_seconds AS BIGINT) AS finish_s,
          l.sex, l.city, l.year, l.ns_keys FROM lr l SEMI JOIN pe USING (person_id)""")
    _zero(db, {
        'people with a field missing': 'SELECT count(*) FROM pe WHERE ns_keys IS NULL OR k IS NULL OR k_block IS NULL OR tier IS NULL',
        'people with no row attached with an age (their k would not count them)': 'SELECT count(*) FROM pe WHERE NOT aged',
        'k blocks whose people carry two values of k': 'SELECT count(*) FROM (SELECT k_block FROM pe GROUP BY 1 HAVING count(DISTINCT k) > 1)',
        'k blocks holding more people than k': 'SELECT count(*) FROM (SELECT k_block FROM pe GROUP BY 1 HAVING count(*) > max(k))',
        'link rows without a city or a year': 'SELECT count(*) FROM le WHERE city IS NULL OR year IS NULL',
    })


def counts(db) -> dict:
    people = {'all': db.execute('SELECT count(*) FROM pe').fetchone()[0]}
    people.update(dict(db.execute('SELECT tier, count(*) FROM pe GROUP BY 1').fetchall()))
    people.update(dict(db.execute('SELECT sex, count(*) FROM pe GROUP BY 1').fetchall()))
    people['in_union'] = db.execute('SELECT count(*) FROM pe WHERE in_union = 1').fetchone()[0]
    people['ns_keys_0'] = db.execute('SELECT count(*) FROM pe WHERE ns_keys = 0').fetchone()[0]
    links = dict(db.execute('SELECT db, count(*) FROM le GROUP BY 1').fetchall())
    # The tier check of the rebuilt k (spec 4.3): the producer gives the high tier only to persons alone in their block,
    # so a high person whose rebuilt k is not 1 marks a block the rebuild cuts differently.
    k = {'high_k_not_1': db.execute("""SELECT count(*) FROM person_k k JOIN person_stat s USING (person_id)
                                       WHERE s.tier = 'high' AND k.k <> 1""").fetchone()[0]}
    as_int = lambda d: {key: int(v) for key, v in sorted(d.items())}
    return {'people': as_int(people), 'links': as_int(links), 'k': as_int(k)}


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
        for table, source, columns, order in (('people', 'pe', PEOPLE_COLUMNS, 'person_id'),
                                              ('links', 'le', LINKS_COLUMNS, 'person_id, db, record_id')):
            cols = ', '.join(columns)
            cursor = db.execute(f'SELECT {cols} FROM {source} ORDER BY {order}')
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


def check_files(pin: dict, v4_dir: Path, half: Path) -> dict[str, str]:
    """Every pinned v4 asset in --v4-dir and the snapshot carry their pinned sha256; code.tgz's tosql4.py writes the
    producer build_info string the pin quotes. Returns {name: sha256}."""
    import half_common
    files = {}
    for name, sha in sorted(pin['links']['assets'].items()):
        path = v4_dir / name
        if not path.is_file():
            fail(f'missing {path} (every pinned links asset is checked)')
        got = file_sha256(path)
        if got != sha:
            fail(f'{path} is not the pinned {name} (sha256 {got})')
        files[name] = got
    with tarfile.open(fileobj=io.BytesIO((v4_dir / 'code.tgz').read_bytes()), mode='r:gz') as tar:
        member = next((m for m in tar.getmembers() if m.isfile() and Path(m.name).name == 'tosql4.py'), None)
        text = tar.extractfile(member).read().decode('utf-8') if member else ''
    if pin['links']['coverage']['producer_build_info'] not in text:
        fail("code.tgz's tosql4.py does not write the producer build_info string the pin quotes")
    if half.name != pin['half']['sqlite']:
        fail(f"--half must be the pinned {pin['half']['sqlite']}")
    try:
        half_common.check_no_wal(half)
    except half_common.HalfError as error:
        fail(str(error))
    got = file_sha256(half)
    if got != pin['half']['sqlite_sha256']:
        fail(f'{half} is not the pinned half snapshot (sha256 {got})')
    files[half.name] = got
    return files


def compare(got: dict, want: dict) -> None:
    """Every reviewed count at once, so a refresh reads all its differences in one run."""
    diff = {k: {'got': got.get(k), 'reviewed': want.get(k)} for k in sorted(set(got) | set(want)) if got.get(k) != want.get(k)}
    if diff:
        fail('counts differ from the reviewed ones: ' + json.dumps(diff, ensure_ascii=False, sort_keys=True))


def main(argv: list[str] | None = None) -> int:
    import half_common
    import half_quality
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--v4-dir', type=Path, required=True, help='the folder with the pinned v4 assets (race_results_linked.parquet, persons.parquet, …)')
    parser.add_argument('--half', type=Path, required=True, help='the pinned half snapshot (platform_half.sqlite), for the join checks')
    half_dir = Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1904')
    parser.add_argument('--out', type=Path, default=half_dir / 'links-v4.sqlite')
    parser.add_argument('--pin', action='store_true', help='write extract_content_sha256 into analysis/half-release.json')
    args = parser.parse_args(argv)

    out, v4_dir, half = args.out.expanduser(), args.v4_dir.expanduser(), args.half.expanduser()
    for path, what in ((out, '--out'), (v4_dir, '--v4-dir'), (half, '--half')):
        if inside(path, ROOT):
            fail(f'{what}: {path} is inside the repository; the links and the snapshot are record-level and live outside it')
    if not out.parent.is_dir():
        fail(f'missing folder {out.parent}')
    try:
        pin = half_common.load_pin()
    except half_common.HalfError as error:
        fail(str(error))
    key = pin['links']['key']
    if key not in EXPECTED:
        fail(f'no reviewed counts for links build {key}')
    if out.name != pin['links']['extract']:
        fail(f"the extract must be named {pin['links']['extract']}")
    le = half_quality.entry(pin['half']['key']).get('link_editions')
    if not le or le['link_build'] != key or le['half_max_record_id'] != pin['links']['coverage']['half_max_record_id']:
        fail("the policy's link_editions were reviewed for another link build or coverage boundary")
    expected = EXPECTED[key]
    # The marathon side of the joins depends on the adopted marathon release (November 4, 2026).
    by_release = expected.get('joins_by_marathon_release', {})
    # A release without reviewed joins compares against None, so the run prints every count it measured, then fails.
    reviewed = by_release.get(pin['marathon_release'], {'marathons': None, 'marathons_beyond_coverage': None})
    expected = {**{k: v for k, v in expected.items() if k != 'joins_by_marathon_release'},
                'joins': {**expected['joins'], **reviewed}}

    files = check_files(pin, v4_dir, half)
    import half_marathon
    try:
        marathons = half_marathon.load()
    except half_common.HalfError as error:
        fail(f'the marathon side: {error}')
    db = connect()
    open_v4(db, v4_dir)
    attach_half(db, half)
    register_marathons(db, marathons)
    source = check_source(db, pin)
    joins = check_half_join(db, pin, le)
    joins['marathons'] = check_marathon_join(db)
    joins['marathons_beyond_coverage'] = marathon_coverage(db)
    select_people(db)
    got = {'source': source, 'joins': joins, **counts(db)}
    compare(got, expected)
    c = got
    build = {
        'schema_version': '2',
        'links_key': key,
        'links_tag': pin['links']['tag'],
        'applies_to': pin['links']['applies_to'],
        'half_key': pin['half']['key'],
        'marathon_release': pin['marathon_release'],
        'runner_manifest_sha256': marathons.manifest_sha256,
        'tiers': ','.join(STRONG),
        'script_sha256': file_sha256(Path(__file__)),
        'ns_keys_sql_sha256': sql_sha256(NS_KEYS_SQL),
        'k_sql_sha256': sql_sha256(K_SQL),
        'producer_build_info': pin['links']['coverage']['producer_build_info'],
        **{f'coverage:{k}': str(v) for k, v in sorted(pin['links']['coverage'].items()) if k != 'producer_build_info'},
        **{f'source_sha256:{name}': sha for name, sha in sorted(files.items())},
        **{f'people:{k}': str(v) for k, v in c['people'].items()},
        **{f'links:{k}': str(v) for k, v in c['links'].items()},
    }
    digest, rows = write_extract(db, out, build)
    db.close()
    print(f'{out}: {rows["people"]:,} people, {rows["links"]:,} link rows '
          f'({c["links"]["half"]:,} half, {c["links"]["full"]:,} full); {out.stat().st_size:,} bytes')
    print(f'extract_content_sha256 {digest}')

    pinned = pin['links']['extract_content_sha256']
    if args.pin:
        if pinned != digest:
            write_pin(json.loads(PIN.read_text()), digest)
            print(f'wrote extract_content_sha256 into {PIN.relative_to(ROOT)}')
        else:
            print(f'{PIN.relative_to(ROOT)} already pins this extract')
    elif pinned is not None and pinned != digest:
        print(f'the pin holds {pinned}; review the change, then rerun with --pin', file=sys.stderr)
        return 1
    elif pinned is None:
        print('the pin holds no extract digest yet; rerun with --pin to write it')
    return 0


if __name__ == '__main__':
    sys.exit(main())
