"""Runner-data diagnostics; reports counts and race-overlay metadata."""
import argparse
import json
from pathlib import Path
import duckdb
from build_pacing import records


def audit(source, output):
    db = duckdb.connect()
    db.execute("SET memory_limit='4GB'")
    db.execute('SET threads=2')
    db.execute('SET temp_directory=?', [str(source / 'audit-temp')])
    for view, file in [('f','features'),('r','race_records'),('w','race_conditions'),('c','course_segments'),('cp','course_profiles')]:
        location = str(source / (file+'.parquet')).replace("'", "''")
        db.execute(f"CREATE VIEW {view} AS SELECT * FROM read_parquet('{location}')")
    report = {}
    # An adapted master input (analysis/adapt_master.py) has an identity-subset features file without the producer
    # engine's valid_splits and pace columns; those two values are then reported as null, never computed here.
    present = {row[0] for row in db.execute('DESCRIBE f').fetchall()}
    valid = 'count(*) FILTER(WHERE valid_splits)' if 'valid_splits' in present else 'NULL'
    pace = 'median(pace_05)' if 'pace_05' in present else 'NULL'
    report['feature_values'] = records(db, f'''SELECT count(*) AS n,count(DISTINCT record_id) AS unique_record_ids,
      {valid} AS valid_flag,
      median(finish_time) AS median_finish,median(seg_05) AS median_seg05,
      {pace} AS median_pace05,median(cum_05) AS median_cum05,
      median(seg_05+seg_10+seg_15+seg_20+seg_25+seg_30+seg_35+seg_40+seg_42-finish_time) AS segment_sum_error,
      max(abs(seg_05+seg_10+seg_15+seg_20+seg_25+seg_30+seg_35+seg_40+seg_42-finish_time)) AS max_segment_sum_error
      FROM f''')[0]
    report['raw_ids'] = records(db, 'SELECT count(*) AS n,count(DISTINCT id) AS unique_ids FROM r')[0]
    report['id_join'] = records(db, '''SELECT count(*) AS matches,
      count(*) FILTER(WHERE f.city=r.city AND f.year=r.year AND f.race=r.race) AS same_race,
      count(*) FILTER(WHERE lower(trim(f.runner_name))=lower(trim(r.runner))) AS same_name
      FROM f JOIN r ON f.record_id=r.id''')[0]
    report['identity_conflicts'] = records(db, '''SELECT count(*) AS linked_ids,
      count(*) FILTER(WHERE gender_n>1) AS conflicting_gender,
      count(*) FILTER(WHERE yob_span>2) AS conflicting_birth_year,
      count(*) FILTER(WHERE race_count>edition_count) AS repeated_edition
      FROM (SELECT runner_id,count(DISTINCT lower(trim(sex))) FILTER(WHERE lower(trim(sex)) IN ('m','f','male','female')) AS gender_n,
        max(yob)-min(yob) AS yob_span,count(*) AS race_count,count(DISTINCT (city,year,race)) AS edition_count
        FROM f WHERE runner_id IS NOT NULL AND NOT is_ambiguous GROUP BY runner_id)''')[0]
    report['weather_notes'] = records(db, 'SELECT source,notes,count(*) AS editions FROM w GROUP BY source,notes ORDER BY count(*) DESC LIMIT 30')
    report['weather_coverage'] = records(db, '''SELECT count(*) AS n,
      count(*) FILTER(WHERE year(try_cast(race_date AS DATE))=year) AS date_year_agrees,
      min(temp_c) AS min_temperature,max(temp_c) AS max_temperature,
      min(humidity_pct) AS min_humidity,max(humidity_pct) AS max_humidity,
      min(wind_mps) AS min_wind,max(wind_mps) AS max_wind FROM w''')[0]
    report['dates'] = records(db, '''SELECT city,year,race_date,start_local,timezone,source FROM w ORDER BY city,year''')
    report['course_notes'] = records(db, 'SELECT source,notes,count(*) AS profiles FROM cp GROUP BY source,notes ORDER BY count(*) DESC LIMIT 30')
    report['segment_grid'] = records(db, '''SELECT seg_from_km,seg_to_km,count(*) AS n,
      min(avg_grade) AS min_grade,max(avg_grade) AS max_grade FROM c GROUP BY ALL ORDER BY seg_from_km,seg_to_km''')
    output.mkdir(parents=True, exist_ok=True)
    (output/'expanded-audit.json').write_text(json.dumps(report,indent=2,default=str,allow_nan=False)+'\n')
    print('Expanded audit complete; no runner records or identifiers exported.')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    audit(args.input,args.output)
