"""Twelve personalized questions, computed from public export tables.

This module reuses the validated in-memory CORE/FULL linkage prepared by
build_extended. Only fixed, minimum-size aggregate cohorts leave the job.
"""
import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from build_pacing import POINTS, manifest_corpus, records
from source_quality import source_quality_report, METHOD as SOURCE_QUALITY_METHOD

PACK = 'ext_personalized_guide'
MIN_N = 100
TARGET_MIN = 90
TARGET_MAX = 720
TARGETS = list(range(TARGET_MIN, TARGET_MAX + 1))
LENGTHS = [POINTS[i] - (POINTS[i-1] if i else 0) for i in range(9)]


def cdf_from_bins(bins):
    """Bins identify the first whole-minute target a finish strictly beats."""
    counts = defaultdict(int)
    for threshold, n in bins:
        counts[int(threshold)] += int(n)
    running = 0
    output = []
    for target in TARGETS:
        running += counts[target]
        output.append(running)
    return output


def clean(value):
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('Non-finite public aggregate')
        return round(value, 4)
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    return value


def distribution(db, extras=(), where='true', cdf=True, pace=True, view='pg'):
    keys = ['c'] + list(extras)
    columns = ','.join(keys)
    pace_sql = ',' + ','.join(f'quantile_cont(p{i},[0.25,0.5,0.75]) AS pace{i}' for i in range(9)) if pace else ''
    result = records(db, f'''SELECT {columns}, count(*) AS n,
      count(DISTINCT edition) AS editions, quantile_cont(t8,[0.1,0.5,0.9]) AS finish,
      median(change20) AS retention, median(late_change) AS late {pace_sql}
      FROM {view} WHERE {where} GROUP BY {columns} HAVING count(*)>={MIN_N}''')
    mapped = {}
    for row in result:
        key = tuple(row.pop(k) for k in keys)
        row['pace'] = [row.pop(f'pace{i}') for i in range(9)] if pace else []
        row['cdf'] = []
        if cdf:
            row['cdf_min'] = TARGET_MIN
        mapped[key] = row
    if cdf and mapped:
        hist = records(db, f'''SELECT {columns},
          least({TARGET_MAX + 1},greatest({TARGET_MIN},floor(t8/60)::INTEGER+1)) AS threshold,count(*) AS n
          FROM {view} WHERE {where} GROUP BY ALL''')
        bins = defaultdict(list)
        for row in hist:
            key = tuple(row[k] for k in keys)
            if key in mapped:
                bins[key].append((row['threshold'],row['n']))
        for key, row in mapped.items():
            row['cdf'] = cdf_from_bins(bins[key])
            assert len(row['cdf']) == len(TARGETS) and all(0 <= n <= row['n'] for n in row['cdf'])
            assert row['cdf'] == sorted(row['cdf'])
    return mapped


def near_targets(db):
    sums = ','.join(f'sum(d{i}) AS s{i}' for i in range(9))
    rows = records(db, f'''SELECT c,floor(t8/60)::INTEGER AS minute,count(*) AS n,
      list(DISTINCT edition) AS events,{sums}
      FROM pg WHERE t8>={TARGET_MIN - 5}*60 AND t8<{TARGET_MAX + 5}*60 GROUP BY c,minute''')
    buckets = defaultdict(dict)
    for row in rows:
        buckets[row['c']][row['minute']] = row
    out = defaultdict(list)
    for cohort, bins in buckets.items():
        for target in TARGETS:
            pair = []
            for start in [target-5,target]:
                selected = [bins[m] for m in range(start,start+5) if m in bins]
                n = sum(row['n'] for row in selected)
                if n < MIN_N:
                    break
                durations = [sum(row[f's{i}'] for row in selected)/n for i in range(9)]
                pair.append({'n':n,'editions':len({event for row in selected for event in row['events']}), 'durations':durations})
            if len(pair) == 2:
                out[cohort].append({'target':target,'below':pair[0],'above':pair[1]})
    return out


def terrain_for(db, city):
    fields = {row[0] for row in db.execute('DESCRIBE pg_terrain').fetchall()}
    gain = next((x for x in ['elev_gain_m','gain_m','ascent_m'] if x in fields), None)
    loss = next((x for x in ['elev_loss_m','loss_m','descent_m'] if x in fields), None)
    return records(db, f'''SELECT seg_to_km AS "end",avg(elev_net_m) AS net,
      {f'avg({gain})' if gain else 'NULL::DOUBLE'} AS gain,
      {f'avg({loss})' if loss else 'NULL::DOUBLE'} AS loss
      FROM pg_terrain WHERE city=? GROUP BY seg_from_km,seg_to_km
      HAVING count(*)=1 AND avg(elev_net_m) IS NOT NULL ORDER BY seg_to_km''',[city])


def prepare_personal(db):
    durations = ','.join(f'e.t{i}-'+(f'e.t{i-1}' if i else '0')+f' AS d{i}' for i in range(9))
    db.execute(f'''CREATE TEMP TABLE personal_seed AS SELECT e.*,p.recent_best,
      p.earlier_best,p.earlier_best_rid,w.temperature,
      {durations},
      e.city || '|' || e.year::VARCHAR || '|' || e.race AS edition,
      CASE WHEN e.age>=18 AND e.age<90 AND e.age=floor(e.age) THEN
        CASE WHEN e.age<25 THEN '18–24' ELSE
          cast(floor(e.age/5)*5 AS INTEGER)::VARCHAR || '–' || cast(floor(e.age/5)*5+4 AS INTEGER)::VARCHAR END END AS age_key,
      CASE WHEN e.gender IN ('Women','Men') THEN e.gender END AS gender_key,
      CASE WHEN p.recent_best IS NOT NULL THEN (floor(p.recent_best/900)*15)::INTEGER::VARCHAR END AS prior_key,
      (floor(e.t8/900+0.5)*15)::INTEGER AS bucket,
      CASE WHEN (e.t1/10)/(p.recent_best/42.195)<0.98 THEN 'Faster opening'
        WHEN (e.t1/10)/(p.recent_best/42.195)<=1.02 THEN 'Similar opening'
        ELSE 'Slower opening' END AS opening_group,
      100*((e.t8-e.t5)/12.195/((e.t3-e.t0)/15)-1) AS late_change,
      100*(e.t8/p.recent_best-1) AS performance,
      CASE WHEN w.temperature<10 THEN 'Below 10°C' WHEN w.temperature<15 THEN '10–14.9°C'
        WHEN w.temperature<20 THEN '15–19.9°C' ELSE '20°C or warmer' END AS temperature_band
      FROM eligible e LEFT JOIN prior p USING(rid)
      LEFT JOIN weather w ON e.city=w.city AND e.year=w.year''')


def generate(db, source, output, provenance, manifest, counts, diagnostics, live_as_of):
    prepare_personal(db)
    db.execute('CREATE TEMP TABLE pg_terrain AS SELECT * FROM read_parquet(?)',[str(source/'course_segments.parquet')])
    folder = output/PACK
    (folder/'tables').mkdir(parents=True,exist_ok=True)
    cities = [row[0] for row in db.execute('SELECT DISTINCT city FROM eligible ORDER BY city').fetchall()]
    summary = {'schema_version':1,'pack_id':PACK,'as_of':datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),
      'export_id':provenance['release_tag'].replace('private-export-','private-'),
      'input_as_of':manifest['created_at'],'n':counts['eligible'],
      'age_n':db.execute('SELECT count(*) FROM personal_seed WHERE age_key IS NOT NULL').fetchone()[0],
      'history_n':diagnostics['recent_benchmark_finishes'],'analyses':12,
      'target_min':TARGET_MIN,'target_max':TARGET_MAX,'cities':[],'courses':[]}
    coverage = defaultdict(int)
    for city_index, city in enumerate(['All courses']+cities):
        condition = 'true' if city=='All courses' else 'city=?'
        params = [] if city=='All courses' else [city]
        db.execute(f'CREATE OR REPLACE TEMP TABLE pc AS SELECT * FROM personal_seed WHERE {condition}',params)
        # Optional filters are explicit aggregate roll-ups. Unknown ages or
        # histories participate in All, never in a fabricated specific band.
        db.execute('''CREATE OR REPLACE TEMP TABLE pm AS SELECT rid,a,g,b,a || '|' || g || '|' || b AS c
          FROM pc CROSS JOIN unnest(CASE WHEN age_key IS NULL THEN ['all'] ELSE ['all',age_key] END) AS aa(a)
          CROSS JOIN unnest(CASE WHEN gender_key IS NULL THEN ['all'] ELSE ['all',gender_key] END) AS gg(g)
          CROSS JOIN unnest(CASE WHEN prior_key IS NULL THEN ['all'] ELSE ['all',prior_key] END) AS bb(b)''')
        db.execute('CREATE OR REPLACE TEMP VIEW pg AS SELECT pc.*,pm.c,pm.a,pm.g,pm.b FROM pc JOIN pm USING(rid)')
        basic = distribution(db)
        cohorts = {}
        for (key,), row in basic.items():
            a,g,b = key.split('|')
            cohorts[key] = {**row,'age':a,'gender':g,'prior':b,'profiles':{},'openings':{},'near':[], 'weather':[], 'gains':{}}
        for (key,bucket), row in distribution(db,('bucket',),f'bucket BETWEEN {TARGET_MIN} AND {TARGET_MAX}',cdf=False).items():
            cohorts[key]['profiles'][str(bucket)] = row
        for (key,opening), row in distribution(db,('opening_group',),'recent_best IS NOT NULL',pace=False).items():
            cohorts[key]['openings'][opening] = row
        for key, value in near_targets(db).items():
            if key in cohorts:
                cohorts[key]['near'] = value
        performance = records(db,'''SELECT c,count(*) AS n,count(DISTINCT edition) AS editions,
          quantile_cont(performance,[0.1,0.5,0.9]) AS "values" FROM pg WHERE recent_best IS NOT NULL
          GROUP BY c HAVING count(*)>=100''')
        for row in performance:
            key=row.pop('c');cohorts[key]['performance']=row
            if city!='All courses' and row['editions']>=3:
                a,g,b=key.split('|')
                summary['courses'].append({'city':city,'age':a,'gender':g,'prior':b,**row})
        weather = records(db,'''WITH events AS (SELECT c,temperature_band AS band,edition,
          count(*) AS n,median(performance) AS value FROM pg
          WHERE recent_best IS NOT NULL AND temperature BETWEEN -10 AND 40
          GROUP BY ALL HAVING count(*)>=20)
          SELECT c,band,sum(n)::BIGINT AS n,count(*) AS editions,avg(value) AS value
          FROM events GROUP BY c,band HAVING count(*)>=3 AND sum(n)>=100''')
        for row in weather:
            key=row.pop('c');cohorts[key]['weather'].append(row)
        old_profile=','.join(f'avg(100*(old.p{i}/(old.t8/42.195)-1)) AS old{i}' for i in range(9))
        new_profile=','.join(f'avg(100*(g.p{i}/(g.t8/42.195)-1)) AS new{i}' for i in range(9))
        repeat = records(db,f'''SELECT g.c,count(*) AS n,count(DISTINCT g.edition) AS editions,
          avg((g.t8-old.t8)/60) AS finish_change,{old_profile},{new_profile}
          FROM pg g JOIN pairs pair ON g.rid=pair.next_rid
          JOIN linked old ON old.rid=pair.rid WHERE pair.city=pair.next_city
          GROUP BY g.c HAVING count(*)>=100''')
        for row in repeat:
            key=row.pop('c');row['previous']=[row.pop(f'old{i}') for i in range(9)]
            row['current']=[row.pop(f'new{i}') for i in range(9)]
            assert abs(sum(LENGTHS[i]*row['previous'][i] for i in range(9)))<1e-6
            assert abs(sum(LENGTHS[i]*row['current'][i] for i in range(9)))<1e-6
            cohorts[key]['repeat']=row
        gains = records(db,f'''SELECT g.c,g.bucket,count(*) AS n,count(DISTINCT g.edition) AS editions,
          avg((old.t1-g.t1)/60) AS opening,
          avg(((old.t5-old.t1)-(g.t5-g.t1))/60) AS middle,
          avg(((old.t8-old.t5)-(g.t8-g.t5))/60) AS late,
          avg((old.t8-g.t8)/60) AS total,avg(old.t8) AS previous,avg(g.t8) AS current
          FROM pg g JOIN linked old ON old.rid=g.earlier_best_rid
          WHERE g.t8<old.t8 AND g.bucket BETWEEN {TARGET_MIN} AND {TARGET_MAX}
          GROUP BY g.c,g.bucket HAVING count(*)>=100''')
        for row in gains:
            key=row.pop('c');bucket=row.pop('bucket')
            row['values']=[row.pop(k) for k in ['opening','middle','late']]
            assert abs(sum(row['values'])-row['total'])<1e-7
            cohorts[key]['gains'][str(bucket)]=row
        terrain = [] if city=='All courses' else terrain_for(db,city)
        data = {'city':city,'cohorts':cohorts,'terrain':terrain}
        filename=f'city_{city_index:02}.json'
        (folder/'tables'/filename).write_text(json.dumps(clean(data),separators=(',',':'),allow_nan=False)+'\n')
        # Current checkpoint progress, age and recorded gender define this
        # comparison. Prior-time rollups are excluded to avoid duplicate finishes.
        checkpoint_rows=[]
        for index in [3,5,6]:
            km=POINTS[index]
            db.execute(f'''CREATE OR REPLACE TEMP VIEW pg_checkpoint AS SELECT *,
              (floor(t{index}/120)*2)::INTEGER AS elapsed,
              CASE WHEN p{index}/(t{index}/{km})<0.98 THEN 'Faster recent section'
                WHEN p{index}/(t{index}/{km})<=1.02 THEN 'Similar recent section'
                ELSE 'Slower recent section' END AS recent_trend
              FROM pg WHERE b='all' ''')
            db.execute('''CREATE OR REPLACE TEMP VIEW pg_cp AS SELECT * FROM pg_checkpoint
              CROSS JOIN unnest(['all',recent_trend]) AS tr(trend)''')
            cp=distribution(db,('elapsed','trend'),pace=False,view='pg_cp')
            for (key,elapsed,trend), row in cp.items():
                a,g,_=key.split('|')
                checkpoint_rows.append({'age':a,'gender':g,'checkpoint':km,'elapsed':elapsed,'trend':trend,**row})
        checkpoint_file=f'checkpoint_{city_index:02}.json'
        (folder/'tables'/checkpoint_file).write_text(json.dumps(clean({'city':city,'rows':checkpoint_rows}),separators=(',',':'),allow_nan=False)+'\n')
        summary['cities'].append({'city':city,'file':filename,'checkpoint_file':checkpoint_file,'n':db.execute('SELECT count(*) FROM pc').fetchone()[0]})
        for entry in cohorts.values():
            for key in ['profiles','openings','near','weather','repeat','gains','performance']:
                coverage[key]+=bool(entry.get(key))
        coverage['checkpoints']+=len(checkpoint_rows)
        print(json.dumps({'personalized_city':city,'cohorts':len(cohorts),'checkpoint_cells':len(checkpoint_rows)}),flush=True)
    assert all(coverage[key]>0 for key in ['profiles','openings','near','weather','repeat','gains','performance','checkpoints'])
    script_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    metadata={'schema_version':1,'id':PACK,'presentation':'personalized-guide','status':'ready','question_id':'personalized_guide',
      'title':'Twelve questions for your marathon','as_of':summary['as_of'],'input_as_of':manifest['created_at'],
      'input_export_id':summary['export_id'],'live_json_as_of':live_as_of,'n':counts['eligible'],'cohort':counts,
      'corpus':manifest_corpus(manifest),
      'input_asset_sha256':provenance['asset_sha256'],'input_manifest_sha256':provenance['manifest_sha256'],
      'analysis_script_sha256':script_hash,'supporting_script_sha256':hashlib.sha256(Path(__file__).with_name('build_extended.py').read_bytes()).hexdigest(),
      'linkage_audit':diagnostics,'minimum_public_cell':100,'analysis_count':12,
      'target_min':TARGET_MIN,'target_max':TARGET_MAX,'coverage':dict(coverage),
      'methodology_prose':[
        'All twelve personalized questions use the complete public export. Visitor targets are chosen thresholds, never inferred historical intentions. Targets from 90 to 720 whole minutes are evaluated with strict finish < target. Sparse achieved-time and comparison groups remain unavailable rather than being estimated.',
        'Exact ages define 18–24 then five-year bands through 85–89. Age-group-only labels are not converted into exact ages. Optional recorded gender is Women, Men or all available records. Previous performance selects a 15-minute band of best times in the two strictly earlier calendar years.',
        'Every public result has at least 100 finishes or linked pairs. Age, gender and prior-performance rollups are computed directly from the same records, not by averaging subgroup medians. The site labels any broader comparison used when a narrow combination is unavailable. Availability is not statistical certainty.',
        'Section paces use actual elapsed differences divided by 5 km or 2.195 km at the finish. Quantile ranges describe variation between finishes, not confidence intervals. Higher time per distance means slower. Every complete cohort uses the same runners at all nine checkpoints.',
        'The comparison is observational. Historical route changes and declared goals are absent. Supplied elevation and start-hour weather remain proxies. Current and same-year performances are excluded from prior benchmarks. Individual identity checks follow the linked-history pipeline.',
        'Preparing, choosing a course and reviewing a past result reorder the same twelve questions. Preference changes do not change the underlying evidence. Checkpoint comparisons use current elapsed progress instead of a previous-marathon filter.'
      ]}
    quality = source_quality_report(db, source)
    metadata['source_quality'] = quality
    metadata['source_quality_script_sha256'] = quality['script_sha256']
    metadata['pacing_script_sha256'] = hashlib.sha256(Path(__file__).with_name('build_pacing.py').read_bytes()).hexdigest()
    if quality['reviewed_edition_policy']:
        metadata['methodology_prose'].append(SOURCE_QUALITY_METHOD)
    (folder/'pack_meta.json').write_text(json.dumps(metadata,indent=2,allow_nan=False)+'\n')
    (folder/'summary.json').write_text(json.dumps(clean(summary),separators=(',',':'),allow_nan=False)+'\n')
    print(json.dumps({'personalized_complete':12,'files':len(list(folder.rglob('*.json'))),'bytes':sum(p.stat().st_size for p in folder.rglob('*.json')),'coverage':dict(coverage)}),flush=True)
