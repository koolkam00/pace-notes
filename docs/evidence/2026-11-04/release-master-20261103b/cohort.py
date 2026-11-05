"""Timing and policy counts on an adapted input with the pipeline's own prepare() and the reviewed edition policy;
no pack, story or runner file is written. Usage: python3 -s cohort.py <input dir> <out.json>."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'analysis'))
import duckdb
from build_pacing import prepare
from source_quality import source_quality_report
source, out = Path(sys.argv[1]), Path(sys.argv[2])
db = duckdb.connect(); db.execute("SET memory_limit='6GB'"); db.execute('SET threads=3')
db.execute('SET temp_directory=?', [str(out.parent / 'cohort-temp')])
cohort = prepare(db, source)
policy = source_quality_report(db, source)
editions = db.execute('SELECT count(DISTINCT (city,year)), count(DISTINCT city) FROM eligible').fetchone()
timing_editions = db.execute('SELECT count(DISTINCT (city,year)) FROM timing_eligible').fetchone()[0]
by_edition = {f'{c} {y}': n for c, y, n in db.execute(
    "SELECT city, year, count(*) FROM eligible WHERE (city, year) IN (('New York', 2026), ('New York', 2008), ('Amsterdam', 2023)) GROUP BY ALL ORDER BY 1, 2").fetchall()}
report = {'release_tag': policy['release_tag'], 'input_manifest_sha256': json.loads((source / 'provenance.json').read_text())['manifest_sha256'],
          'cohort': cohort, 'eligible_editions': editions[0], 'eligible_cities': editions[1], 'timing_eligible_editions': timing_editions,
          'eligible_in_changed_editions': by_edition,
          'policy': {k: policy[k] for k in ('version', 'reviewed_edition_policy', 'policy_sha256', 'script_sha256')},
          'policy_editions': policy['editions']}
out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({k: report[k] for k in ('cohort', 'eligible_editions', 'eligible_cities', 'eligible_in_changed_editions')}, indent=1))
