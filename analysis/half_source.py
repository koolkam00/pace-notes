"""The combined release as the half builders read it (docs/HALF_MARATHON.md, rules R0 to R3).

The half rows, the edition tiers and the person links are files of the release the site adopts
(pace-notes-marathon-half-20261113-1113), pinned by sha256 in analysis/half-release.json (schema 4):

- the CORE members `race_records.parquet`, `edition_meta.parquet`, `record_flags.parquet`, `qa_row_flags.parquet`,
  `pending_review_flags.parquet`, `RELEASE-ROW-EXCLUSIONS.parquet` and `EDITION-TIERS.csv` (`--core`, the unpacked
  archive's folder);
- `person-ids-v5.1-race_results_linked.parquet` and `person-ids-v5.1-persons.parquet` (`--release`, the folder of the
  release's assets);
- the pipeline's identity file `identity.parquet` (`--identity`; analysis/build_identity.py builds it from the pinned
  link file). Its sha256 must be the one the marathon cohort's manifest names, so the half and the marathon analyses
  read one identity.

`attach` makes, in a DuckDB connection, the schema `h` every half builder reads. Its relations are shaped like the
tables of the earlier half snapshots, so the policy engine (analysis/half_quality.py) reads them unchanged:

    h.race_records    the half rows of the half database (distance = half, source_db = half): id, city, year, race,
                      sex (the published sex, else the published category's: rule R1 of the contract), sex_published,
                      sex_category, split_21_1km, bib, distance_km, runner, split_10km
    h.record_flags    (record_id, flag): the platform's record flags of those rows
    h.qa_flags        (record_id, flag): the release's row-quality flags that are set (qa_row_flags.parquet, long)
    h.pending_flags   (record_id, flag): the pending-review flags of rows present in CORE
    h.edition_meta    the registry rows of the half database with the tier of EDITION-TIERS.csv as
                      `completeness_status` (the tier table is the complete one; an edition it lacks keeps the
                      registry's own tier, which is `no_rows`), the timing basis and the split tier
    h.tiers           EDITION-TIERS.csv, the half rows of either source database
    h.excluded_rows   (city, year, n): the rows RELEASE-ROW-EXCLUSIONS.parquet lists per edition of the half database
    h.course_suspect  (city, year, n, flagged): editions with a row the link file flags `course_shortened_suspect`
    h.identity_left_out  (record_id): the half-database rows the identity file marks `left_out`

`link_tables` makes the schema `l` set B reads (analysis/half_pairs.py):

    l.people   (person_id, sex, ns_keys, in_union): every runner key of the identity file with a keyed half row of the
               half database and a keyed marathon row, whose persons.parquet sex is M or F
    l.links    (person_id, db, distance, record_id, confidence, keyed, variant_union, finish_s, sex, city, year,
               ns_keys): every linked row of those people in the link file, whatever its confidence or status

`ns_keys` is the frozen SQL of the v4 extract, unchanged (NS_KEYS_SQL): distinct age keys per normalized name and sex
over every row of the link file of either distance that has an age key; a person takes the largest over its rows whose
own confidence is high_elite, high or medium.

No name leaves SQL except through `h.race_records.runner`, which only the record rules read (the R6 key is a digest
computed in DuckDB) and which analysis/half_extract.py copies into the local extract for the Node recount.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import CORE_MEMBERS, ROOT, fail, file_sha256, inside  # noqa: E402

COHORT = ROOT / 'analysis' / 'marathon-cohort'
LINKS_FILE = 'person-ids-v5.1-race_results_linked.parquet'
PERSONS_FILE = 'person-ids-v5.1-persons.parquet'
STRONG = ('high_elite', 'high', 'medium')          # the confidences that key a row (adapt_combined.IDENTITY)
PERSON_ID = r'^p51_[0-9a-f]{16}$'
# The producer's two v4 unions (checks.no_union_people keeps its v4 meaning) and the v5.1 variant union (set B, rule 3).
UNION_METHODS = ('middle_name_union', 'natdiff_union')
VARIANT_UNION = 'variant_union'
# The row-quality flags of qa_row_flags.parquet, in the file's own order. Another column fails the build: a flag the
# rules have not read must not pass unnoticed.
QA_FLAGS = ('split_nonmonotonic', 'split_after_finish', 'finish_equals_earlier_split', 'finish_ge_24h', 'finish_zero',
            'finish_implausibly_fast', 'finish_faster_than_world_record', 'no_finish_time', 'age_implausible', 'finish_6h_to_24h')
# The link file's columns the half reads, with their parquet types (person-ids-v5.1-COLUMNS.md).
RRL_COLUMNS = {'person_id': 'VARCHAR', 'confidence': 'VARCHAR', 'method': 'VARCHAR', 'distance': 'VARCHAR', 'year': 'BIGINT',
               'city': 'VARCHAR', 'finish_seconds': 'DOUBLE', 'sex': 'VARCHAR', 'age_key': 'VARCHAR', 'name_norm': 'VARCHAR',
               'source_db': 'VARCHAR', 'record_id': 'BIGINT', 'course_shortened_suspect': 'BOOLEAN'}
PERSONS_COLUMNS = {'person_id': 'VARCHAR', 'sex': 'VARCHAR'}
IDENTITY_COLUMNS = {'source_db': 'VARCHAR', 'record_id': 'BIGINT', 'distance': 'VARCHAR', 'runner_key': 'VARCHAR', 'status': 'VARCHAR',
                    'person_id': 'VARCHAR'}

# ns_keys, like for like with runner links v1 and the v4 extract (docs/HALF_MARATHON.md, rule R3.2): distinct age keys per
# normalized name and sex over every row of the link file with one; each linked row's block count (0 when its block holds
# no age key, NULL when the row has no name or no sex M or F); a person's value, the largest over the person's rows whose
# own confidence is high_elite, high or medium (either distance, whatever the record's status). Frozen: its sha256 is in
# the extract's build table and in the manifest.
NS_KEYS_SQL = """
CREATE TEMP TABLE ns_block AS
  SELECT name_norm, sex, count(DISTINCT age_key) AS ns_keys FROM rrl
  WHERE age_key IS NOT NULL AND name_norm IS NOT NULL AND sex IN ('M', 'F')
  GROUP BY name_norm, sex;
CREATE TEMP TABLE lr AS
  SELECT r.person_id, r.source_db AS db, r.distance, r.record_id, r.confidence, r.method, r.sex,
         r.finish_seconds, r.city, r.year,
         CASE WHEN r.name_norm IS NOT NULL AND r.sex IN ('M', 'F') THEN coalesce(b.ns_keys, 0) END AS ns_keys
  FROM rrl r LEFT JOIN ns_block b ON b.name_norm = r.name_norm AND b.sex = r.sex
  WHERE r.person_id IS NOT NULL;
CREATE TEMP TABLE person_ns AS
  SELECT person_id, max(ns_keys) AS ns_keys FROM lr WHERE confidence IN ('high_elite', 'high', 'medium') GROUP BY person_id;
"""


def sql_sha256(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def lit(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


@dataclass(frozen=True)
class Source:
    """Where the pinned files are: the unpacked CORE folder, the folder of the release's assets and the identity file."""
    core: Path
    release: Path
    identity: Path

    def member(self, name: str) -> Path:
        return self.core / name

    @property
    def links(self) -> Path:
        return self.release / LINKS_FILE

    @property
    def persons(self) -> Path:
        return self.release / PERSONS_FILE


def half_dir() -> Path:
    """$PACE_HALF_DIR, defaulting to ~/data/half-20261113-1113: `core/` (the unpacked CORE members), `release/` (the
    release's assets), `identity.parquet` and the extract analysis/half_extract.py cuts."""
    return Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-20261113-1113').expanduser()


def default_source(core: Path | None = None, release: Path | None = None, identity: Path | None = None) -> Source:
    base = half_dir()
    pick = lambda given, env, default: Path(given or os.environ.get(env) or default).expanduser()  # noqa: E731
    return Source(pick(core, 'PACE_HALF_CORE', base / 'core'), pick(release, 'PACE_HALF_RELEASE', base / 'release'),
                  pick(identity, 'PACE_HALF_IDENTITY', base / 'identity.parquet'))


def cohort_manifest(root: Path = COHORT) -> tuple[dict, str]:
    """The marathon cohort's manifest and the sha256 of its exact bytes (what the half manifest binds)."""
    data = (Path(root) / 'manifest.json').read_bytes()
    return json.loads(data), hashlib.sha256(data).hexdigest()


def check_files(pin: dict, source: Source, cohort_root: Path = COHORT) -> dict:
    """Every file the half reads against its pinned sha256; the identity file against the digest the marathon cohort's
    manifest names. Returns {name: sha256} of what was read (the manifest and the extract's build table record them)."""
    out = {}
    wanted = [(source.member(name), digest, name) for name, digest in pin['half']['core']['members'].items()]
    wanted += [(source.links, pin['links']['assets'][LINKS_FILE], LINKS_FILE), (source.persons, pin['links']['assets'][PERSONS_FILE], PERSONS_FILE)]
    if set(pin['half']['core']['members']) != set(CORE_MEMBERS):
        fail('the pin does not name the CORE members the builders read')
    for path, digest, name in wanted:
        if not path.is_file():
            fail(f'missing {path}; fetch the pinned release with python3 -I analysis/download_half.py')
        if inside(path, ROOT):
            fail(f'{path} is inside the repository; record-level sources stay outside it (pages publish aggregates)')
        got = file_sha256(path)
        if got != digest:
            fail(f'{path} is not the pinned {name} (sha256 {got})')
        out[name] = got
    if not source.identity.is_file():
        fail(f'missing the identity file {source.identity} (analysis/build_identity.py writes it)')
    if inside(source.identity, ROOT):
        fail(f'{source.identity} is inside the repository; record-level sources stay outside it')
    manifest, _ = cohort_manifest(cohort_root)
    want = (manifest.get('inputs', {}).get('identity') or {}).get('sha256')
    got = file_sha256(source.identity)
    if got != want:
        fail(f'{source.identity} (sha256 {got}) is not the identity file the marathon cohort was built on ({want}): the half and '
             'the marathon analyses must read one identity')
    if manifest.get('release_tag') != pin['marathon_release']:
        fail(f"the marathon cohort is of {manifest.get('release_tag')}, the pin binds {pin['marathon_release']}")
    out['identity.parquet'] = got
    return out


def _columns(db, relation: str) -> dict:
    return {r[0]: r[1] for r in db.execute(f'DESCRIBE SELECT * FROM {relation}').fetchall()}


def _require_columns(db, relation: str, wanted: dict, what: str) -> None:
    have = _columns(db, relation)
    bad = {c: (have.get(c), t) for c, t in wanted.items() if have.get(c) != t}
    if bad:
        fail(f'{what}: columns of another type or missing (found, expected): {bad}')


def attach(db, source: Source) -> None:
    """The schema `h` (module docstring). The files must have passed check_files."""
    rr, em, rf, qa, pf, rx, tiers = (lit(source.member(n).as_posix()) for n in CORE_MEMBERS)
    links, identity = lit(source.links.as_posix()), lit(source.identity.as_posix())
    qa_columns = list(_columns(db, f'read_parquet({qa})'))
    if qa_columns != ['distance', 'source_db', 'record_id', 'city', 'year', *QA_FLAGS, 'sex_from_category']:
        fail(f'qa_row_flags.parquet has columns the half rules have not read: {qa_columns}')
    _require_columns(db, f'read_parquet({links})', RRL_COLUMNS, LINKS_FILE)
    _require_columns(db, f'read_parquet({identity})', IDENTITY_COLUMNS, 'the identity file')
    db.execute("ATTACH ':memory:' AS h")
    half = "distance = 'half' AND source_db = 'half'"
    db.execute(f"""CREATE VIEW h.race_records AS
        SELECT r.id, r.city, r.year, r.race,
               CASE WHEN r.sex IS NULL OR trim(r.sex) = '' THEN q.sex_from_category ELSE r.sex END AS sex,
               r.sex AS sex_published, q.sex_from_category AS sex_category,
               r.split_21_1km, r.bib, r.distance_km, r.runner, r.split_10km
        FROM read_parquet({rr}) r
        LEFT JOIN (SELECT record_id, sex_from_category FROM read_parquet({qa}) WHERE {half} AND sex_from_category IS NOT NULL) q
          ON q.record_id = r.id
        WHERE r.distance = 'half' AND r.source_db = 'half'""")
    db.execute(f"CREATE VIEW h.record_flags AS SELECT record_id, flag FROM read_parquet({rf}) WHERE {half}")
    db.execute(f"""CREATE TABLE h.qa_flags AS SELECT record_id, flag FROM (
        UNPIVOT (SELECT record_id, {', '.join(QA_FLAGS)} FROM read_parquet({qa}) WHERE {half})
        ON {', '.join(QA_FLAGS)} INTO NAME flag VALUE v) WHERE v""")
    db.execute(f"CREATE TABLE h.pending_flags AS SELECT record_id, flag FROM read_parquet({pf}) WHERE {half} AND present_in_core")
    db.execute(f"""CREATE TABLE h.tiers AS SELECT source_db, city, try_cast(year AS BIGINT) AS year, try_cast(n_records AS BIGINT) AS n_records,
          verification_tier, nullif(badge_label, '') AS badge_label, lower(weaker_source) = 'true' AS weaker_source, nullif(split_tier, '') AS split_tier
        FROM read_csv({tiers}, header = true, all_varchar = true) WHERE distance = 'half'""")
    bad = db.execute("SELECT count(*) FROM h.tiers WHERE year IS NULL OR verification_tier IS NULL OR city IS NULL").fetchone()[0]
    dup = db.execute('SELECT count(*) FROM (SELECT source_db, city, year FROM h.tiers GROUP BY ALL HAVING count(*) > 1)').fetchone()[0]
    if bad or dup:
        fail(f'EDITION-TIERS.csv: {bad} half rows without a city, year or tier and {dup} editions listed twice')
    db.execute(f"""CREATE TABLE h.edition_meta AS
        SELECT e.id, e.city, e.year, e.race, e.race_date, e.official_finishers, e.official_source_type, e.completeness_reason,
               coalesce(t.verification_tier, e.verification_tier) AS completeness_status, e.completeness_status AS status_release,
               t.verification_tier IS NOT NULL AS in_tier_table, e.verification_tier AS tier_registry, e.timing_basis,
               coalesce(t.split_tier, e.split_tier) AS split_tier
        FROM read_parquet({em}) e LEFT JOIN h.tiers t ON t.source_db = 'half' AND t.city = e.city AND t.year = e.year
        WHERE e.distance = 'half' AND e.source_db = 'half'""")
    differ = db.execute("SELECT count(*) FROM h.edition_meta WHERE in_tier_table AND completeness_status IS DISTINCT FROM tier_registry").fetchone()[0]
    if differ:
        fail(f'{differ} half editions carry another tier in edition_meta.parquet than in EDITION-TIERS.csv')
    db.execute(f"CREATE TABLE h.excluded_rows AS SELECT city, year::BIGINT AS year, count(*) AS n FROM read_parquet({rx}) WHERE {half} GROUP BY ALL")
    db.execute(f"""CREATE TABLE h.course_suspect AS SELECT city, year::BIGINT AS year, count(*) AS n,
          count(*) FILTER (WHERE course_shortened_suspect) AS flagged
        FROM read_parquet({links}) WHERE {half} GROUP BY ALL HAVING flagged > 0""")
    db.execute(f"CREATE TABLE h.identity_left_out AS SELECT record_id FROM read_parquet({identity}) WHERE {half} AND status = 'left_out'")


def row_rule() -> dict:
    """The frozen half row rule of the pipeline (lead decision D28): `HALF_ROW_RULE` of analysis/adapt_combined.py, the one
    list of flags that leave a half row out. The half modules import it and hold no second list."""
    try:
        from adapt_combined import HALF_ROW_RULE
    except ImportError:
        fail('analysis/adapt_combined.py holds no HALF_ROW_RULE yet: the half record rule R8 imports it (lead decision D28)')
    rule = HALF_ROW_RULE
    if 'pending_review_flags' not in rule:      # keyed by release tag, as ROW_RULE is
        tag = json.loads((ROOT / 'analysis' / 'release.json').read_text())['tag']
        if tag not in rule:
            fail(f'HALF_ROW_RULE of analysis/adapt_combined.py has no entry for the adopted release {tag}')
        rule = rule[tag]
    if not (isinstance(rule.get('pending_review_flags'), (list, tuple)) and isinstance(rule.get('qa_row_flags'), (list, tuple))):
        fail('HALF_ROW_RULE of analysis/adapt_combined.py: pending_review_flags and qa_row_flags are required')
    return rule


def left_out_sql(rule: dict) -> str:
    """SQL: the record ids the row rule leaves out of `h.race_records` (one row per id). A flag of
    `kept_when_edition_wide` removes nothing from an edition whose every row carries it (ruling R2: it then describes how
    the source laid the edition out, not the row); a row of such an edition is still left out by another flag of the rule."""
    known_p, known_q = set(rule['pending_review_flags']), set(rule['qa_row_flags'])
    if not known_q <= set(QA_FLAGS):
        fail(f'the half row rule names row-quality flags the release does not have: {sorted(known_q - set(QA_FLAGS))}')
    # A kept-when-edition-wide flag the rule does not leave out on half rows (a marathon-only flag) is inert here.
    wide = [f for f in rule.get('kept_when_edition_wide', ()) if f in known_p | known_q]
    p = ', '.join(lit(f) for f in sorted(known_p)) or 'NULL'
    q = ', '.join(lit(f) for f in sorted(known_q)) or 'NULL'
    w = ', '.join(lit(f) for f in wide) or 'NULL'
    return f"""WITH f AS (
          SELECT record_id, flag FROM h.pending_flags WHERE flag IN ({p})
          UNION ALL SELECT record_id, flag FROM h.qa_flags WHERE flag IN ({q})),
        fr AS (SELECT f.record_id, f.flag, r.city, r.year FROM f JOIN h.race_records r ON r.id = f.record_id),
        ed AS (SELECT city, year, count(*) AS n FROM h.race_records GROUP BY ALL),
        wide AS (SELECT fr.city, fr.year, fr.flag FROM fr JOIN ed USING (city, year) WHERE fr.flag IN ({w})
                 GROUP BY fr.city, fr.year, fr.flag, ed.n HAVING count(*) = ed.n)
        SELECT DISTINCT fr.record_id FROM fr LEFT JOIN wide USING (city, year, flag) WHERE wide.flag IS NULL"""


def link_tables(db, source: Source) -> dict:
    """The schema `l` (module docstring). Returns the counts the extract and the manifest record."""
    links, persons, identity = (lit(p.as_posix()) for p in (source.links, source.persons, source.identity))
    _require_columns(db, f'read_parquet({persons})', PERSONS_COLUMNS, PERSONS_FILE)
    db.execute(f"CREATE TEMP VIEW rrl AS SELECT {', '.join(RRL_COLUMNS)} FROM read_parquet({links})")
    for statement in NS_KEYS_SQL.strip().split(';'):
        if statement.strip():
            db.execute(statement)
    db.execute(f"""CREATE TEMP TABLE ident AS SELECT source_db AS db, distance, record_id, runner_key, status, person_id
        FROM read_parquet({identity}) WHERE person_id IS NOT NULL""")
    bad = db.execute(f"""SELECT count(*) FILTER (WHERE NOT regexp_full_match(person_id, '{PERSON_ID}')),
        count(*) FILTER (WHERE status = 'keyed' AND runner_key IS DISTINCT FROM person_id),
        count(*) FILTER (WHERE status <> 'keyed' AND runner_key IS NOT NULL) FROM ident""").fetchone()
    if any(bad):
        fail(f'the identity file: {bad[0]} person ids that are not v5.1 ids, {bad[1]} keyed rows whose key is not their person id, '
             f'{bad[2]} rows with a key and another status')
    # Every linked row of the link file has its identity row with the same person id, and the reverse.
    differ = db.execute("""SELECT count(*) FROM lr FULL JOIN ident i ON i.db = lr.db AND i.record_id = lr.record_id AND i.distance = lr.distance
        WHERE lr.person_id IS DISTINCT FROM i.person_id""").fetchone()[0]
    if differ:
        fail(f'{differ} rows carry another person id in the identity file than in the pinned link file')
    strong = ', '.join(lit(t) for t in STRONG)
    weak_keyed = db.execute(f"""SELECT count(*) FROM lr JOIN ident i ON i.db = lr.db AND i.record_id = lr.record_id AND i.distance = lr.distance
        WHERE i.status = 'keyed' AND lr.confidence NOT IN ({strong})""").fetchone()[0]
    if weak_keyed:
        fail(f'{weak_keyed} keyed rows of the identity file carry a link below medium in the link file')
    unions = ' OR '.join(f"lr.method LIKE '%{u}%'" for u in UNION_METHODS)
    db.execute("ATTACH ':memory:' AS l")
    db.execute(f"""CREATE TABLE l.people AS
        WITH keyed AS (SELECT i.person_id, bool_or(i.distance = 'half' AND i.db = 'half') AS half, bool_or(i.distance = 'marathon') AS marathon
                       FROM ident i WHERE i.status = 'keyed' GROUP BY 1),
             u AS (SELECT lr.person_id, bool_or({unions}) AS in_union FROM lr GROUP BY 1)
        SELECT k.person_id, p.sex, n.ns_keys, u.in_union::INTEGER AS in_union
        FROM keyed k JOIN read_parquet({persons}) p USING (person_id) JOIN person_ns n USING (person_id) JOIN u USING (person_id)
        WHERE k.half AND k.marathon AND p.sex IN ('M', 'F')""")
    db.execute(f"""CREATE TABLE l.links AS
        SELECT lr.person_id, lr.db, lr.distance, lr.record_id, lr.confidence, (i.status = 'keyed')::INTEGER AS keyed,
               (lr.method LIKE '%{VARIANT_UNION}%')::INTEGER AS variant_union, lr.finish_seconds AS finish_s, lr.sex, lr.city, lr.year::INTEGER AS year,
               lr.ns_keys
        FROM lr JOIN l.people p USING (person_id)
        JOIN ident i ON i.db = lr.db AND i.record_id = lr.record_id AND i.distance = lr.distance""")
    zero = {
        'people without ns_keys': 'SELECT count(*) FROM l.people WHERE ns_keys IS NULL',
        'people whose rows carry another sex than persons.parquet': """SELECT count(DISTINCT k.person_id) FROM l.links k JOIN l.people p USING (person_id)
            WHERE k.sex IN ('M', 'F') AND k.sex <> p.sex""",
        'link rows repeated': 'SELECT count(*) FROM (SELECT db, distance, record_id FROM l.links GROUP BY ALL HAVING count(*) > 1)',
        'a finish with a fraction': 'SELECT count(*) FROM l.links WHERE finish_s IS NOT NULL AND finish_s <> round(finish_s)',
        'a person ns_keys that is not the largest of its strong rows': f"""SELECT count(*) FROM l.people p JOIN (
            SELECT person_id, max(ns_keys) AS m FROM l.links WHERE confidence IN ({strong}) GROUP BY 1) x USING (person_id)
            WHERE x.m IS DISTINCT FROM p.ns_keys""",
    }
    for what, sql in zero.items():
        n = db.execute(sql).fetchone()[0]
        if n:
            fail(f'the link tables: {n} {what}')
    counts = {'people': db.execute('SELECT count(*) FROM l.people').fetchone()[0]}
    counts.update(dict(db.execute("SELECT 'links_' || distance, count(*) FROM l.links GROUP BY 1").fetchall()))
    counts['links'] = db.execute('SELECT count(*) FROM l.links').fetchone()[0]
    counts['links_keyed'] = db.execute('SELECT count(*) FROM l.links WHERE keyed = 1').fetchone()[0]
    counts['links_variant_union'] = db.execute('SELECT count(*) FROM l.links WHERE variant_union = 1').fetchone()[0]
    counts['people_in_union'] = db.execute('SELECT count(*) FROM l.people WHERE in_union = 1').fetchone()[0]
    for t in ('ns_block', 'lr', 'person_ns', 'ident'):
        db.execute(f'DROP TABLE {t}')
    db.execute('DROP VIEW rrl')
    return {k: int(v) for k, v in counts.items()}
