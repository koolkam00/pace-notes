"""Per-edition screens (a)-(c) of the 1652 policy review; reproduces docs/evidence/2026-10-16/refresh-1652/edition-screen.csv exactly on the 1652 FULL (every screen column). Usage: python screen.py <FULL dir> <out.csv>."""
import csv, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[4] / 'analysis'))
import duckdb
from build_pacing import FIELDS, POINTS
src, out = sys.argv[1], sys.argv[2]
db = duckdb.connect(); db.execute("SET memory_limit='6GB'"); db.execute('SET threads=4')
db.execute(r"""CREATE MACRO seconds(s) AS (
  CASE WHEN regexp_full_match(trim(s), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9](\.[0-9]+)?')
    THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*3600 + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)*60 + try_cast(split_part(trim(s), ':', 3) AS DOUBLE)
  WHEN regexp_full_match(trim(s), '[0-9]{1,4}:[0-5][0-9](\.[0-9]+)?')
    THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*60 + try_cast(split_part(trim(s), ':', 2) AS DOUBLE) ELSE NULL END)""")
parsed = ', '.join(f'seconds({f}) AS t{i}' for i, f in enumerate(FIELDS))
db.execute(f"CREATE TABLE p AS SELECT id, city, year, sex, {parsed} FROM read_parquet('{src}/race_records.parquet')")
paces = ', '.join(f'(t{i}-{f"t{i-1}" if i else "0"})/{POINTS[i]-(POINTS[i-1] if i else 0):.6f} AS p{i}' for i in range(9))
complete = ' AND '.join(f't{i} IS NOT NULL' for i in range(9)); inc = 't0>0 AND ' + ' AND '.join(f't{i}>t{i-1}' for i in range(1, 9))
ok = 't8 BETWEEN 5400 AND 43200 AND ' + ' AND '.join(f'p{i} BETWEEN 120 AND 1200' for i in range(9))
db.execute(f'''CREATE TABLE q AS SELECT *, ({complete}) AS complete, ({complete} AND {inc} AND {ok}) AS te,
  lower(trim(sex)) IN ('f','female','woman','women') AS woman FROM (SELECT *, {paces} FROM p)''')
db.execute('''CREATE TABLE fq AS SELECT *, ntile(4) OVER (PARTITION BY city, year ORDER BY t8, id) AS quart FROM q WHERE t8 IS NOT NULL''')
missing = ', '.join(f"round(100.0*count(*) FILTER (WHERE t8 IS NOT NULL AND t{i} IS NULL)/nullif(count(t8),0),1) AS missing_{k}km_pct_of_finishers" for i, k in enumerate([5,10,15,20,25,30,35,40]))
rows = db.execute(f'''WITH b AS (SELECT city, year, count(*) AS raw_records, count(t8) AS finishers,
    count(*) FILTER (WHERE te) AS timing_eligible,
    count(*) FILTER (WHERE complete) AS complete_grids,
    count(*) FILTER (WHERE complete AND (t8<=t7 OR (t8-t7)/2.195<120)) AS complete_grids_mixed_basis,
    round(100.0*count(*) FILTER (WHERE t8 IS NOT NULL AND woman)/nullif(count(t8),0),1) AS women_pct_all_finishers,
    round(100.0*count(*) FILTER (WHERE te AND woman)/nullif(count(*) FILTER (WHERE te),0),1) AS women_pct_timing_eligible,
    {missing} FROM q GROUP BY ALL),
  qq AS (SELECT city, year, round(100.0*count(*) FILTER (WHERE quart=1 AND te)/nullif(count(*) FILTER (WHERE quart=1),0),1) AS fastest_quartile_eligible_pct,
    round(100.0*count(*) FILTER (WHERE quart=4 AND te)/nullif(count(*) FILTER (WHERE quart=4),0),1) AS slowest_quartile_eligible_pct FROM fq GROUP BY ALL)
  SELECT b.city, b.year, raw_records, finishers, timing_eligible, round(100.0*timing_eligible/nullif(finishers,0),2) AS timing_eligible_pct_of_finishers,
    fastest_quartile_eligible_pct, slowest_quartile_eligible_pct, complete_grids, complete_grids_mixed_basis,
    round(100.0*complete_grids_mixed_basis/nullif(complete_grids,0),1) AS mixed_basis_pct_of_complete, women_pct_all_finishers, women_pct_timing_eligible,
    {', '.join(f'missing_{k}km_pct_of_finishers' for k in [5,10,15,20,25,30,35,40])}
  FROM b LEFT JOIN qq USING (city, year) ORDER BY 1, 2''')
cols = [d[0] for d in rows.description]
with open(out, 'w', newline='') as f:
    w = csv.writer(f); w.writerow(cols); w.writerows(rows.fetchall())
