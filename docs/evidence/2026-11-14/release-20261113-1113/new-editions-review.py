"""A reading of the newly counted editions before they enter a pooled figure (lead note of 2026-11-14 on Los Angeles).

    python3 -I new-editions-review.py <adapted FULL dir> <out.json>

For every counted edition under a composite race key (none was reviewed by hand before): the sustained-slowdown share
(the definition of analysis/build_public_explorer.py: at least 25% over the 5-20 km pace on a recorded 5 km section
between 20 and 40 km), the same share inside finish-time bands against the counted editions of the earlier releases,
and the section profile of each edition's quickest tenth (section pace over the runner's mean pace), which shows a
misplaced mat or a mixed timing basis as a jump that even even-paced runners share. Timing eligibility is recounted
here from features.parquet with the pipeline's bounds; the cohort run (cohort.py) is the reference for totals.
"""
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[4]
SEGMENTS = ['seg_05', 'seg_10', 'seg_15', 'seg_20', 'seg_25', 'seg_30', 'seg_35', 'seg_40', 'seg_42']
LENGTHS = [5, 5, 5, 5, 5, 5, 5, 5, 2.195]
BANDS = [(0, 180, 'under 3:00'), (180, 210, '3:00 to 3:30'), (210, 240, '3:30 to 4:00'), (240, 270, '4:00 to 4:30'), (270, 300, '4:30 to 5:00'),
         (300, 360, '5:00 to 6:00'), (360, 721, '6:00 and over')]


def main(argv):
    source, out = Path(argv[1]), Path(argv[2])
    policy = json.loads((ROOT / 'analysis' / 'edition-policy-20261113-1113.json').read_text())
    db = duckdb.connect()
    db.execute("SET memory_limit='2500MB'")
    db.execute('SET threads=2')
    db.execute('CREATE TABLE counted (city VARCHAR, year BIGINT)')
    db.executemany('INSERT INTO counted VALUES (?,?)', policy['counted'])
    eligible = ' AND '.join(f'{s} > 0 AND {s}/{n} BETWEEN 2 AND 20' for s, n in zip(SEGMENTS, LENGTHS)) + ' AND finish_time BETWEEN 90 AND 720'
    slow = ' OR '.join(f'{s}/5/((cum_20 - cum_05)/15) - 1 + 1e-12 >= 0.25' for s in SEGMENTS[4:8])
    features = str(source / 'features.parquet').replace("'", "''")
    # `city` is the race's registry label; the release's own key of each edition is in release_keys.parquet.
    keys = str(source / 'release_keys.parquet').replace("'", "''")
    db.execute(f"""CREATE TABLE s AS SELECT f.city, f.year, f.finish_time, {', '.join(SEGMENTS)}, ({slow}) AS slow, (k.release_city LIKE '%: %') AS new_key
      FROM read_parquet('{features}') f JOIN counted c ON c.city=f.city AND c.year=f.year
      JOIN read_parquet('{keys}') k ON k.city=f.city AND k.year=f.year WHERE {eligible}""")
    rows = lambda q: [dict(zip([d[0] for d in db.description], r)) for r in db.execute(q).fetchall()]  # noqa: E731
    band = 'CASE ' + ' '.join(f"WHEN finish_time < {hi} THEN '{label}'" for _, hi, label in BANDS) + ' END'
    profile = ', '.join(f'round(median(({s}/{n})/(finish_time/42.195)), 3) AS "{label}"' for s, n, label in zip(
        SEGMENTS, LENGTHS, ['0-5', '5-10', '10-15', '15-20', '20-25', '25-30', '30-35', '35-40', '40-42.195']))
    db.execute(f"""CREATE TABLE reference AS SELECT city, year, {profile} FROM (SELECT *, ntile(10) OVER (PARTITION BY city, year ORDER BY finish_time) AS tenth
      FROM s WHERE NOT new_key) WHERE tenth = 1 GROUP BY ALL""")
    labels = ['0-5', '5-10', '10-15', '15-20', '20-25', '25-30', '30-35', '35-40', '40-42.195']
    quantile = lambda q: {label: round(db.execute(f'SELECT quantile_cont("{label}", {q}) FROM reference').fetchone()[0], 3) for label in labels}  # noqa: E731
    report = {
        'tag': policy['tag'], 'frozen_policy_sha256': __import__('hashlib').sha256((ROOT / 'analysis' / 'edition-policy-20261113-1113.json').read_bytes()).hexdigest(),
        'pooled': rows("""SELECT CASE WHEN new_key THEN 'counted editions under a composite key' ELSE 'counted editions of the earlier releases' END AS editions,
          count(DISTINCT (city, year)) AS n_editions, count(*) AS finishes, round(100.0 * avg(slow::INT), 2) AS sustained_slowdown_pct,
          round(median(finish_time), 1) AS median_finish_min FROM s GROUP BY 1 ORDER BY 1"""),
        'new_editions': rows("""SELECT city, year, count(*) AS finishes, round(100.0 * avg(slow::INT), 2) AS sustained_slowdown_pct, round(median(finish_time), 1) AS median_finish_min
          FROM s WHERE new_key GROUP BY ALL ORDER BY 1, 2"""),
        'by_finish_band': rows(f"""SELECT CASE WHEN new_key THEN city ELSE 'counted editions of the earlier releases' END AS race, {band} AS finish_band, count(*) AS finishes,
          round(100.0 * avg(slow::INT), 1) AS sustained_slowdown_pct FROM s GROUP BY ALL ORDER BY 1, min(finish_time)"""),
        'quickest_tenth_section_pace_over_own_mean_pace': {
            'new_editions': rows(f"""SELECT city, year, count(*) AS finishes, {profile} FROM (SELECT *, ntile(10) OVER (PARTITION BY city, year ORDER BY finish_time) AS tenth
              FROM s WHERE new_key) WHERE tenth = 1 GROUP BY ALL ORDER BY 1, 2"""),
            'earlier_editions_across_editions': {'editions': db.execute('SELECT count(*) FROM reference').fetchone()[0], 'p05': quantile(0.05), 'median': quantile(0.5), 'p95': quantile(0.95)}},
        'earlier_editions_sustained_slowdown_pct': {
            'distribution': rows("""SELECT round(min(p), 1) AS lowest, round(quantile_cont(p, 0.25), 1) AS p25, round(median(p), 1) AS median, round(quantile_cont(p, 0.75), 1) AS p75,
              round(max(p), 1) AS highest, count(*) AS editions FROM (SELECT city, year, 100.0 * avg(slow::INT) AS p FROM s WHERE NOT new_key GROUP BY ALL)""")[0],
            'highest': rows("""SELECT city, year, round(100.0 * avg(slow::INT), 1) AS sustained_slowdown_pct, count(*) AS finishes, round(median(finish_time), 1) AS median_finish_min
              FROM s WHERE NOT new_key GROUP BY ALL ORDER BY 3 DESC LIMIT 8""")},
    }
    out.write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps(report['pooled']), json.dumps(report['earlier_editions_sustained_slowdown_pct']['distribution']))


if __name__ == '__main__':
    main(sys.argv)
