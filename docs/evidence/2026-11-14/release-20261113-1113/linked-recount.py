"""An independent recount of the linked-records family's histories (docs/LINKED_RECORDS.md) from the adapted input.

    python3 -I linked-recount.py <adapted FULL dir> <person-ids-v5.1-race_results_linked.parquet> [<public/data/linked>]

It shares one thing with the builders, the edition sets (analysis/linked_universe.classify_editions, which has its own
tests), and nothing else: linked runners, kept results, recorded attempts, recorded bests, steps, exact birth years and
age pairs are counted again in SQL with window functions, where the builders use sorted arrays. It compares each count
with the published files and exits 1 on a difference. It does not recount the pair model's fit (the tests compare that
with a dense least-squares solution, and linked-build.txt records a comparison with the research prototype's solver).
DuckDB is capped at 2.5 GB; about 15 seconds.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'analysis'))
import duckdb  # noqa: E402
import linked_universe  # noqa: E402


def main(source, links, family):
    policy = json.loads((ROOT / 'analysis' / 'edition-policy-20261113-1113.json').read_text())
    db = duckdb.connect()
    db.execute("SET memory_limit='2500MB'; SET threads=2")
    meta = db.execute(f"SELECT city, year, verification_tier, split_tier, timing_basis FROM read_parquet('{source}/edition_meta.parquet') WHERE verification_tier <> 'excluded'").df()
    rows = [{**r, 'timing_basis': r['timing_basis'] if isinstance(r['timing_basis'], str) else None} for r in meta.to_dict('records')]
    editions = linked_universe.classify_editions(rows, json.loads((source / 'EDITIONS.json').read_text())['editions'], policy)   # noqa: F841 (read by SQL)
    db.execute(f"CREATE VIEW f AS SELECT * FROM read_parquet('{source}/features.parquet')")
    # linked runners: the adapter's key, one recorded sex, birth years at most two apart, never two records in an edition
    db.execute("""CREATE TEMP TABLE safe AS SELECT runner_id FROM f WHERE runner_id IS NOT NULL GROUP BY 1
        HAVING count(DISTINCT CASE WHEN sex IN ('M','F') THEN sex END) <= 1 AND coalesce(max(yob) - min(yob), 0) <= 2 AND count(*) = count(DISTINCT (city, year))""")
    db.execute("""CREATE TEMP TABLE k AS SELECT f.runner_id pid, f.year, round(f.finish_time * 60, 3) fin, f.sex, f.yob, f.record_id
        FROM f JOIN safe USING (runner_id) JOIN editions e ON e.label = f.city AND e.year = f.year
        WHERE e.in_f AND round(f.finish_time * 60, 3) BETWEEN 7200 AND 43200""")
    db.execute("""CREATE TEMP TABLE h AS SELECT *, row_number() OVER (PARTITION BY pid ORDER BY year) att, max(ny) OVER (PARTITION BY pid) max_per_year,
        min(fin) OVER (PARTITION BY pid ORDER BY year RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) best_prior
        FROM (SELECT *, count(*) OVER (PARTITION BY pid, year) ny FROM k)""")
    out = {'linked_runners': db.execute('SELECT count(*) FROM safe').fetchone()[0]}
    out['kept_results'], out['people'] = db.execute('SELECT count(*), count(DISTINCT pid) FROM k').fetchone()
    out['bests'] = {a: [n, b] for a, n, b in db.execute('SELECT att, count(*), sum((fin < best_prior)::INT) FROM h WHERE max_per_year = 1 AND att >= 2 GROUP BY 1 ORDER BY 1').fetchall()}
    out['steps'] = {a: [n, b, m] for a, n, b, m in db.execute("""SELECT a.att, count(*), sum((b.fin < a.fin)::INT), round(100 * (exp(median(ln(b.fin / a.fin))) - 1), 3)
        FROM h a JOIN h b ON a.pid = b.pid AND b.att = a.att + 1 WHERE a.max_per_year = 1 AND b.year - a.year <= 2 GROUP BY 1 ORDER BY 1""").fetchall()}
    # exact birth years: a birth-year key that is not an age-group floor; at most one year apart; the more frequent, the earlier on a tie
    db.execute(f"""CREATE TEMP TABLE floors AS SELECT record_id FROM read_parquet('{links}')
        WHERE distance = 'marathon' AND source_db = 'full' AND age_key LIKE 'yob:%' AND coalesce(record_flags, '') LIKE '%age_is_group_floor%'""")
    db.execute("""CREATE TEMP TABLE born AS WITH x AS (SELECT pid, yob, count(*) n FROM h WHERE yob IS NOT NULL AND record_id NOT IN (SELECT record_id FROM floors) GROUP BY 1, 2),
        s AS (SELECT pid, min(yob) lo, max(yob) hi FROM x GROUP BY 1)
        SELECT s.pid, CASE WHEN (SELECT n FROM x WHERE x.pid = s.pid AND x.yob = s.lo) >= (SELECT n FROM x WHERE x.pid = s.pid AND x.yob = s.hi) THEN s.lo ELSE s.hi END yob
        FROM s WHERE s.hi - s.lo <= 1""")
    out['people_with_an_exact_birth_year'] = db.execute('SELECT count(*) FROM born').fetchone()[0]
    bands = [(18, 25), (25, 30), (30, 35), (35, 40), (40, 45), (45, 50), (50, 55), (55, 60), (60, 65), (65, 70), (70, 999)]
    case = ' '.join(f'WHEN mid < {hi} THEN {lo}' for lo, hi in bands)
    age = db.execute(f"""WITH v AS (SELECT h.*, h.year - born.yob age FROM h JOIN born USING (pid) WHERE h.sex IN ('M','F') AND h.year - born.yob BETWEEN 18 AND 85),
        p AS (SELECT a.att, (a.age + b.age) / 2.0 mid, ln(b.fin / a.fin) / (b.year - a.year) rate FROM v a JOIN v b ON a.pid = b.pid AND b.att = a.att + 1
              WHERE a.max_per_year = 1 AND b.year - a.year BETWEEN 1 AND 3)
        SELECT CASE {case} END band, count(*), sum((att >= 3)::INT), round(100 * (exp(median(CASE WHEN att >= 3 THEN rate END)) - 1), 3) FROM p GROUP BY 1 ORDER BY 1""").fetchall()
    out['age_pairs'] = sum(r[1] for r in age)
    out['age_bands'] = {lo: [third, median] for lo, _, third, median in age}
    out['pairs_at_most_two_years_apart'] = db.execute("""SELECT count(*) FROM k a JOIN k b ON a.pid = b.pid
        AND (b.year > a.year OR (b.year = a.year AND b.record_id > a.record_id)) AND b.year - a.year <= 2""").fetchone()[0]
    print(json.dumps(out))
    if family is None:
        return 0
    manifest, bests, ages = (json.loads((family / n).read_text()) for n in ('manifest.json', 'bests.json', 'age.json'))
    u = manifest['cohort']['universe']
    problems = []

    def same(a, b, what):
        if a != b:
            problems.append(f'{what}: recount {a}, published {b}')
    same(out['linked_runners'], u['linked_runners'], 'linked runners')
    same([out['kept_results'], out['people']], [u['F']['kept_results'], u['F']['people']], 'kept results and their runners in F')
    for row in bests['by_recorded_attempt']:
        same(out['bests'].get(row['recorded_attempt']), [row['results'], row['recorded_bests']], f"recorded attempt {row['recorded_attempt']}")
    for row in bests['steps']['by_step']:
        same(out['steps'].get(row['from_recorded_attempt']), [row['pairs'], row['faster'], row['median_pct']], f"step from recorded attempt {row['from_recorded_attempt']}")
    same(out['people_with_an_exact_birth_year'], ages['cohort']['people_with_an_exact_birth_year'], 'runners with an exact birth year')
    same(out['age_pairs'], ages['cohort']['pairs'], 'age pairs')
    for band in ages['bands']:
        same(out['age_bands'].get(band['age_from']), [band['pairs'], band['median_pct_per_year']], f"age band from {band['age_from']}")
    compared = 3 + len(bests['by_recorded_attempt']) + len(bests['steps']['by_step']) + 2 + len(ages['bands'])
    for p in problems:
        print('MISMATCH', p)
    print(f'linked-recount: {compared} published groups compared, {len(problems)} differ')
    return 1 if problems else 0


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]) if len(sys.argv) == 4 else None))
