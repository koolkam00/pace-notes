"""The identity rule of a combined release, evaluated once over both distances and written as one file.

    python3 -s analysis/build_identity.py --input <adapted FULL or CORE dir> --output identity.parquet

Every later builder reads this file and none derives a runner key again (lead ruling D24.2 of the adoption plan,
2026-11-14): the marathon analyses, the half rebuild and the runner lookup. One row per release row, marathon and half:

    source_db, record_id   the release's row key (the id spaces of the two distances overlap; never use the id alone)
    distance               marathon | half
    runner_key   VARCHAR   the key of the runner this result belongs to, or null (the producer's person id, RULE below)
    status       VARCHAR   keyed | possible_match | unlinked | left_out
    link_tier    VARCHAR   the link's confidence in the producer's build (null when the row is unlinked)
    person_id    VARCHAR   the producer's person id of the link, whatever its tier (null when unlinked): what a possible
                           match is a possible match of. Never a confirmed identity on its own.
    not_keyed_reason       null when keyed; else the first that applies of left_out_by_row_rule, unlinked,
                           tier_below_medium, sex_conflict, birth_year_spread, two_results_in_one_edition
    sex_conflict, birth_year_spread, two_results_in_one_edition
                           the three screens for the row's person (null unless the row is a candidate: written, and
                           linked in a keyed tier), so a person that fails two shows both

RULE states the rule in words; the file's key-value metadata and `<output>.json` repeat it with the counts by tier and
by screen for each distance, so a stranger can recount it from the release's link file and the adapted input.

Inputs, all from the adapted folder: the verified link file (`release-assets/person-ids-v5.1-race_results_linked.parquet`,
re-hashed here against the digest the adapter's provenance pins), and `race_records.parquet` for the marathon rows the
adapter wrote. The frozen rule (which tiers key) is IDENTITY in analysis/adapt_combined.py; for every written marathon
record the key here is that module's `features.runner_id` or null, which the builder checks row by row when the folder
holds features.parquet.
"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import duckdb

from adapt_combined import IDENTITY, LINKS, SOURCE_DIR

SCHEMA_VERSION = 1
BIRTH_YEAR_SPREAD = 2
REASONS = ['left_out_by_row_rule', 'unlinked', 'tier_below_medium', 'sex_conflict', 'birth_year_spread', 'two_results_in_one_edition']
RULE = {
    'key': ('a release row (source_db, record_id) gets a runner key when conditions 1 to 3 all hold; the key is the producer’s person id of its link, so one '
            'runner has one key across marathons and half marathons'),
    '1_written': ('the row is in the adapted input: a marathon row the adapter’s row rule leaves out gets no key and takes no part in any screen. Every '
                  'half row of the release takes part, because no row rule for half results is frozen yet; this file must be rebuilt when one is'),
    '2_tier': 'the confidence of its link in the producer’s build is one of the keyed tiers of IDENTITY in analysis/adapt_combined.py (high_elite, high, medium)',
    '3_screens': ('the person passes three screens, each evaluated once over all of the person’s rows that meet conditions 1 and 2, marathon and half '
                  'together: (a) sex: the rows carry at most one of the sexes M and F (the link file’s `sex`: the published sex, else the published '
                  'category’s; a blank and X are ignored); (b) birth year: the birth years the link build derived for the rows (`age_key` of the form '
                  f'yob:YYYY) span at most {BIRTH_YEAR_SPREAD} years (rows without one are ignored); (c) one result per edition: no two of the rows are '
                  'in the same edition (distance, the release’s city key, year)'),
    'not_keyed': ('a row without a key carries the first reason that applies: left_out_by_row_rule (condition 1), unlinked (no link), tier_below_medium '
                  '(condition 2), then sex_conflict, birth_year_spread, two_results_in_one_edition (condition 3). A linked row without a key is a possible '
                  'match of its person id and is never joined into a runner’s figures'),
    'origin': ('conditions 2 and 3 are the screens analysis/build_extended.py applied to a marathon input until this file existed (safe_ids: one recorded '
               'sex, birth years within two, one record per edition), now over both distances at once'),
}


_STARTED = time.monotonic()


def step(label):
    """A progress line on stderr (elapsed seconds), so a slow step is visible."""
    print(f'[build_identity {time.monotonic() - _STARTED:7.1f}s] {label}', file=sys.stderr, flush=True)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def build(db, links, written, identity):
    """Create the table `identity` from the link rows and the written marathon ids. `links` and `written` are SQL
    relations (views or read_parquet calls); `written` has a column `id`. Returns the counts."""
    keyed = ', '.join(literal(tier) for tier in identity['keyed_confidences'])
    known = set(identity['keyed_confidences']) | set(identity['possible_confidences'])
    tiers = {tier for (tier,) in db.execute(f'SELECT DISTINCT confidence FROM {links} WHERE confidence IS NOT NULL').fetchall()}
    assert tiers <= known, f'link tiers the identity rule has not reviewed: {sorted(tiers - known)}'
    assert db.execute(f"SELECT count(*) FROM {links} WHERE (person_id IS NULL) <> (confidence IS NULL) OR (person_id IS NOT NULL AND NOT starts_with(person_id, {literal(identity['prefix'])}))"
                      ).fetchone()[0] == 0, 'a link without a tier, a tier without a link, or a person id of another build'
    assert db.execute(f"SELECT count(*) FROM {links} WHERE distance NOT IN ('marathon', 'half') OR record_id IS NULL OR source_db IS NULL OR (distance='marathon' AND source_db<>'full')"
                      ).fetchone()[0] == 0, 'a link row outside the two distances, without its key, or a marathon row outside source_db full'
    step('link rows')
    # `candidate` is the row's person id when the row takes part in the screens (written, and linked in a keyed tier). The
    # joins below are on plain equalities: a condition on one side only inside a join made DuckDB compare every pair.
    db.execute(f"""CREATE OR REPLACE TEMP TABLE identity_written AS SELECT l.source_db, l.record_id, l.distance, l.city, l.year, l.person_id, l.confidence,
        CASE WHEN l.sex IN ('M', 'F') THEN l.sex END AS sex, CAST(nullif(regexp_extract(l.age_key, '^yob:([0-9]{{4}})$', 1), '') AS INTEGER) AS yob,
        (l.distance='marathon' AND l.record_id NOT IN (SELECT id FROM {written})) AS left_out
      FROM {links} l""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE identity_rows AS SELECT *, CASE WHEN NOT left_out AND confidence IN ({keyed}) THEN person_id END AS candidate
      FROM identity_written""")
    db.execute('DROP TABLE identity_written')
    step('screens')
    # One result per edition: the person's rows against its distinct (distance, city, year), counted on a small table.
    db.execute("""CREATE OR REPLACE TEMP TABLE identity_editions AS SELECT candidate, count(*) AS editions FROM (
        SELECT DISTINCT candidate, distance, city, year FROM identity_rows WHERE candidate IS NOT NULL) GROUP BY candidate""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE identity_persons AS SELECT g.person_id, g.sex_conflict, g.birth_year_spread, g.results <> e.editions AS two_results_in_one_edition,
        g.results, g.marathons, g.halves
      FROM (SELECT candidate AS person_id, (max(sex) <> min(sex)) IS TRUE AS sex_conflict, coalesce(max(yob) - min(yob), 0) > {BIRTH_YEAR_SPREAD} AS birth_year_spread,
          count(*) AS results, count(*) FILTER(WHERE distance='marathon') AS marathons, count(*) FILTER(WHERE distance='half') AS halves
        FROM identity_rows WHERE candidate IS NOT NULL GROUP BY candidate) g JOIN identity_editions e ON e.candidate=g.person_id""")
    step('one row per release row')
    db.execute("""CREATE OR REPLACE TEMP TABLE identity AS SELECT r.source_db, r.record_id, r.distance,
        CASE WHEN r.candidate IS NOT NULL AND NOT (p.sex_conflict OR p.birth_year_spread OR p.two_results_in_one_edition) THEN r.person_id END AS runner_key,
        CASE WHEN r.left_out THEN 'left_out' WHEN r.person_id IS NULL THEN 'unlinked'
             WHEN r.candidate IS NOT NULL AND NOT (p.sex_conflict OR p.birth_year_spread OR p.two_results_in_one_edition) THEN 'keyed' ELSE 'possible_match' END AS status,
        r.confidence AS link_tier, r.person_id,
        CASE WHEN r.left_out THEN 'left_out_by_row_rule' WHEN r.person_id IS NULL THEN 'unlinked' WHEN r.candidate IS NULL THEN 'tier_below_medium'
             WHEN p.sex_conflict THEN 'sex_conflict' WHEN p.birth_year_spread THEN 'birth_year_spread' WHEN p.two_results_in_one_edition THEN 'two_results_in_one_edition' END AS not_keyed_reason,
        p.sex_conflict, p.birth_year_spread, p.two_results_in_one_edition
      FROM identity_rows r LEFT JOIN identity_persons p ON p.person_id=r.candidate
      ORDER BY r.distance DESC, r.source_db, r.record_id""")
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    assert one('SELECT count(*) FROM identity') == one(f'SELECT count(*) FROM {links}') == one('SELECT count(DISTINCT (source_db, record_id)) FROM identity'), \
        'not one row per release row'
    assert one("SELECT count(*) FROM identity WHERE (runner_key IS NULL) = (status = 'keyed') OR (not_keyed_reason IS NULL) <> (status = 'keyed')") == 0
    step('counts')
    return counts(db)


def counts(db):
    """Counts by tier and by screen for each distance, and for the runner keys."""
    def table(query):
        out = {}
        for distance, name, n in db.execute(query).fetchall():
            out.setdefault(distance, {})[str(name)] = n
        return {d: dict(sorted(v.items())) for d, v in sorted(out.items())}
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    screens = {}
    for screen in ('sex_conflict', 'birth_year_spread', 'two_results_in_one_edition'):
        persons, results, marathons, halves = db.execute(f'SELECT count(*), coalesce(sum(results), 0)::BIGINT, coalesce(sum(marathons), 0)::BIGINT, '
                                                         f'coalesce(sum(halves), 0)::BIGINT FROM identity_persons WHERE {screen}').fetchone()
        screens[screen] = {'persons': persons, 'results': results, 'marathon': marathons, 'half': halves}
    failed = 'sex_conflict OR birth_year_spread OR two_results_in_one_edition'
    persons, results, marathons, halves = db.execute(f'SELECT count(*), coalesce(sum(results), 0)::BIGINT, coalesce(sum(marathons), 0)::BIGINT, '
                                                     f'coalesce(sum(halves), 0)::BIGINT FROM identity_persons WHERE {failed}').fetchone()
    return {
        'rows': table('SELECT distance, \'rows\', count(*) FROM identity GROUP BY 1'),
        'by_status': table('SELECT distance, status, count(*) FROM identity GROUP BY ALL'),
        'by_link_tier': table("SELECT distance, coalesce(link_tier, 'unlinked'), count(*) FROM identity GROUP BY ALL"),
        'keyed_by_link_tier': table("SELECT distance, link_tier, count(*) FROM identity WHERE status = 'keyed' GROUP BY ALL"),
        'by_not_keyed_reason': table('SELECT distance, not_keyed_reason, count(*) FROM identity WHERE not_keyed_reason IS NOT NULL GROUP BY ALL'),
        'screens': {**screens, 'any': {'persons': persons, 'results': results, 'marathon': marathons, 'half': halves}},
        'candidate_persons': one('SELECT count(*) FROM identity_persons'),
        'runner_keys': {'all': one('SELECT count(DISTINCT runner_key) FROM identity'),
                        'with_a_marathon': one("SELECT count(DISTINCT runner_key) FROM identity WHERE distance = 'marathon'"),
                        'with_a_half': one("SELECT count(DISTINCT runner_key) FROM identity WHERE distance = 'half'"),
                        'with_both_distances': one("SELECT count(*) FROM (SELECT runner_key FROM identity WHERE runner_key IS NOT NULL GROUP BY 1 HAVING count(DISTINCT distance) = 2)"),
                        'with_two_or_more_marathons': one("SELECT count(*) FROM (SELECT runner_key FROM identity WHERE runner_key IS NOT NULL AND distance = 'marathon' GROUP BY 1 HAVING count(*) > 1)")},
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    source = args.input
    provenance = json.loads((source / 'provenance.json').read_text())
    tag = provenance['release_tag']
    assert provenance.get('layout') == 'combined' and tag in IDENTITY, 'the identity file is built for an adapted combined release with a frozen identity rule'
    assert digest(source / 'MANIFEST.json') == provenance['manifest_sha256'], 'the adapted manifest is not the one its provenance names'
    link_file = source / SOURCE_DIR / LINKS
    assert digest(link_file) == provenance['assets'][LINKS], 'the person-link file is not the pinned one'
    db = duckdb.connect()
    db.execute("SET memory_limit='6GB'")
    db.execute('SET threads=3')
    db.execute('SET preserve_insertion_order=true')
    db.execute(f'SET temp_directory={literal(args.output.parent / "identity-temp")}')
    db.execute(f'CREATE VIEW link_rows AS SELECT * FROM read_parquet({literal(link_file)})')
    db.execute(f"CREATE VIEW written_rows AS SELECT id FROM read_parquet({literal(source / 'race_records.parquet')})")
    measured = build(db, 'link_rows', 'written_rows', IDENTITY[tag])
    one = lambda query: db.execute(query).fetchone()[0]  # noqa: E731
    # The adapter's features carry the rule's tier condition as runner_id: the key here is that id, or null where a screen failed.
    features = source / 'features.parquet'
    step('against the adapter’s features')
    if features.is_file():
        differ = one(f"""SELECT count(*) FROM read_parquet({literal(features)}) f FULL JOIN (SELECT * FROM identity WHERE distance='marathon' AND status <> 'left_out') i
          ON i.record_id=f.record_id WHERE f.record_id IS NULL OR i.record_id IS NULL OR f.person_id IS DISTINCT FROM i.person_id
            OR f.link_confidence IS DISTINCT FROM i.link_tier OR (i.runner_key IS NOT NULL AND i.runner_key IS DISTINCT FROM f.runner_id)
            OR (i.runner_key IS NULL AND f.runner_id IS NOT NULL AND i.not_keyed_reason NOT IN ('sex_conflict', 'birth_year_spread', 'two_results_in_one_edition'))""")
        assert differ == 0, f'{differ} written marathon records whose identity differs from the adapter’s features'
        # What the marathon builders derived until now: the same screens on the marathon rows alone (build_extended.py safe_ids).
        alone = db.execute(f"""WITH g AS (SELECT runner_id, count(DISTINCT CASE WHEN sex IN ('M', 'F') THEN sex END) > 1 OR coalesce(max(yob) - min(yob), 0) > {BIRTH_YEAR_SPREAD}
              OR count(*) <> count(DISTINCT (city, year, race)) AS fails, count(*) AS n FROM read_parquet({literal(features)}) WHERE runner_id IS NOT NULL GROUP BY 1)
          SELECT count(*) FILTER(WHERE NOT fails), coalesce(sum(n) FILTER(WHERE NOT fails), 0)::BIGINT, count(*) FILTER(WHERE fails), coalesce(sum(n) FILTER(WHERE fails), 0)::BIGINT FROM g""").fetchone()
        measured['marathon_rows_alone'] = {
            'note': 'the three screens on the written marathon records alone, as analysis/build_extended.py evaluated them before this file',
            'keys_passing': alone[0], 'records_passing': alone[1], 'keys_failing': alone[2], 'records_failing': alone[3],
            'marathon_records_keyed_alone_and_not_over_both_distances': alone[1] - measured['by_status']['marathon'].get('keyed', 0)}
    info = {
        'schema_version': SCHEMA_VERSION, 'release_tag': tag, 'input_manifest_sha256': provenance['manifest_sha256'],
        'link_file': {'asset': LINKS, 'sha256': provenance['assets'][LINKS]}, 'identity_rule': IDENTITY[tag], 'birth_year_spread_max': BIRTH_YEAR_SPREAD,
        'rule': RULE, 'scripts': {name: digest(Path(__file__).with_name(name)) for name in ('build_identity.py', 'adapt_combined.py')},
        'counts': measured,
    }
    step('write')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    metadata = ', '.join(f"{key}: {literal(json.dumps(value, sort_keys=True, ensure_ascii=False))}" for key, value in info.items())
    db.execute(f"COPY (SELECT * FROM identity ORDER BY distance DESC, source_db, record_id) TO {literal(args.output)} "
               f"(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 200000, KV_METADATA {{{metadata}}})")
    info['file'] = {'name': args.output.name, 'bytes': args.output.stat().st_size, 'sha256': digest(args.output)}
    args.output.with_name(args.output.name + '.json').write_text(json.dumps(info, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'written': str(args.output), **info['file'], 'counts': measured}, indent=1))


if __name__ == '__main__':
    main()
