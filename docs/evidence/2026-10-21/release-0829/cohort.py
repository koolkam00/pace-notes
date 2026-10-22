"""Cohort counts under an edition policy, mirroring analysis/build_pacing.py prepare(); reproduces the 1652 cohort (3,871,767 eligible, 211 editions, 28 cities). Usage: python cohort.py <FULL dir> <1652|0829-proposed> <out.json>."""
import json, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[4] / 'analysis'))
import duckdb
from build_pacing import FIELDS, POINTS
from source_quality import RULES_1652
src, which, out = sys.argv[1:4]
carried_out = {('Amsterdam', 2020), ('Chicago', 2015), ('Frankfurt', 2019), ('Amsterdam', 2025), ('Oslo', 2026)}
PROPOSED = [(c, y, cat) for c, y, cat, _ in RULES_1652 if (c, y) not in carried_out] + \
    [('London', y, 'unreconciled_hold') for y in (2015, 2016, 2017, 2018, 2021, 2022, 2023, 2024)] + \
    [('Stockholm', 2025, 'unreconciled_hold')] + [('Vienna', y, 'unreconciled_hold') for y in (2022, 2023, 2024)] + \
    [('Madrid', 2023, 'invalid_split_grid'), ('Auckland', 2017, 'invalid_split_grid'), ('Chicago', 2005, 'invalid_split_grid'), ('Chicago', 2007, 'selected_field')]
policy = [(c, y, cat) for c, y, cat, _ in RULES_1652] if which == '1652' else PROPOSED
db = duckdb.connect(); db.execute("SET memory_limit='6GB'"); db.execute('SET threads=4')
db.execute('CREATE TABLE q_ed (city VARCHAR, year BIGINT, category VARCHAR)'); db.executemany('INSERT INTO q_ed VALUES (?,?,?)', policy)
db.execute(r"""CREATE MACRO seconds(s) AS (
  CASE WHEN regexp_full_match(trim(s), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9](\.[0-9]+)?')
    THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*3600 + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)*60 + try_cast(split_part(trim(s), ':', 3) AS DOUBLE)
  WHEN regexp_full_match(trim(s), '[0-9]{1,4}:[0-5][0-9](\.[0-9]+)?')
    THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*60 + try_cast(split_part(trim(s), ':', 2) AS DOUBLE) ELSE NULL END)""")
fields = ', '.join(['race', 'year', 'city', 'runner', 'sex', 'age', 'age_group', 'age_or_group'] + FIELDS)
db.execute(f"CREATE TABLE u AS SELECT DISTINCT {fields} FROM read_parquet('{src}/race_records.parquet')")
parsed = ', '.join(f'seconds({f}) AS t{i}' for i, f in enumerate(FIELDS))
paces = ', '.join(f'(t{i}-{f"t{i-1}" if i else "0"})/{POINTS[i]-(POINTS[i-1] if i else 0):.6f} AS p{i}' for i in range(9))
db.execute(f"CREATE TABLE pa AS SELECT *, {paces} FROM (SELECT city, year, sex, age, {parsed} FROM u)")
complete = ' AND '.join(f't{i} IS NOT NULL' for i in range(9)); inc = 't0>0 AND ' + ' AND '.join(f't{i}>t{i-1}' for i in range(1, 9))
ok = 't8 BETWEEN 5400 AND 43200 AND ' + ' AND '.join(f'p{i} BETWEEN 120 AND 1200' for i in range(9))
db.execute(f'CREATE TABLE te AS SELECT * FROM pa WHERE {complete} AND {inc} AND {ok}')
db.execute('CREATE TABLE el AS SELECT * FROM te WHERE NOT EXISTS (SELECT 1 FROM q_ed q WHERE q.city=te.city AND q.year=te.year)')
one = lambda s: db.execute(s).fetchone()[0]
c = dict(raw=one(f"SELECT count(*) FROM read_parquet('{src}/race_records.parquet')"), deduplicated=one('SELECT count(*) FROM u'),
         complete=one(f'SELECT count(*) FROM pa WHERE {complete}'), increasing=one(f'SELECT count(*) FROM pa WHERE {complete} AND {inc}'),
         timing_eligible=one('SELECT count(*) FROM te'), eligible=one('SELECT count(*) FROM el'))
c.update(missing_or_unparsed=c['deduplicated']-c['complete'], non_increasing=c['complete']-c['increasing'], outside_quality_bounds=c['increasing']-c['timing_eligible'],
         source_quality_excluded=c['timing_eligible']-c['eligible'], policy_editions=len(policy),
         policy_editions_present=one("SELECT count(*) FROM q_ed q WHERE EXISTS (SELECT 1 FROM u WHERE u.city=q.city AND u.year=q.year)"),
         cohort_editions=one('SELECT count(DISTINCT (city, year)) FROM el'), cohort_cities=one('SELECT count(DISTINCT city) FROM el'),
         raw_editions=one('SELECT count(DISTINCT (city, year)) FROM u'), raw_cities=one('SELECT count(DISTINCT city) FROM u'))
c['by_city'] = {city: dict(eligible=n, editions=e, first=a, last=b) for city, n, e, a, b in db.execute('SELECT city, count(*), count(DISTINCT year), min(year), max(year) FROM el GROUP BY 1 ORDER BY 2 DESC').fetchall()}
c['excluded_by_edition'] = {f'{city} {year}': n for city, year, n in db.execute('SELECT te.city, te.year, count(*) FROM te JOIN q_ed q USING (city, year) GROUP BY ALL ORDER BY 3 DESC').fetchall()}
c['policy'] = policy
json.dump(c, open(out, 'w'), indent=1)
print(json.dumps({k: v for k, v in c.items() if k not in ('by_city', 'excluded_by_edition', 'policy')}))
