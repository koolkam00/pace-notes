"""Whole-race and linked-history analyses from public source records, producing chart aggregates.

All timing outcomes are recomputed from CORE. FULL supplies identity candidates,
never its supplied PB, ability, half-split, prediction or outcome fields.
"""
import argparse
import hashlib
import json
import random
from pathlib import Path

import duckdb
from build_pacing import COMMON_METHOD, MIN_CELL, POINTS, PATTERNS, Publisher, chart, filter_for, prepare, records
from source_quality import source_quality_report

HISTORY_METHOD = [
    'For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.',
    'Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.',
    'Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.',
]
OBSERVATIONAL = 'These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.'
OPENINGS = ['Faster opening', 'Similar opening', 'Slower opening']
SERIES_SPREAD = [{'key':'p10','label':'10th percentile'}, {'key':'median','label':'Median'}, {'key':'p90','label':'90th percentile'}]
CANONICAL_ID_RELEASES = {'private-export-20260911-1107', 'private-export-20260912-0934', 'htw-db-2026-10-16-1652'}


def canonical_id_contract(db, source):
    """Use numeric IDs only for a reviewed release, checking alignment every run."""
    provenance_path = source / 'provenance.json'
    tag = json.loads(provenance_path.read_text()).get('release_tag') if provenance_path.exists() else None
    if tag not in CANONICAL_ID_RELEASES:
        return False
    location = str(source / 'race_records.parquet').replace("'", "''")
    db.execute(f"CREATE TEMP VIEW canonical_raw AS SELECT * FROM read_parquet('{location}')")
    for table, key in [('canonical_raw', 'id'), ('features', 'record_id')]:
        assert db.execute(f'SELECT count(*)=count({key}) AND count(*)=count(DISTINCT {key}) FROM {table}').fetchone()[0], 'Canonical record IDs must be unique and non-null'
    assert db.execute('''SELECT count(*) FROM canonical_raw r FULL JOIN features f ON r.id=f.record_id
      WHERE r.id IS NULL OR f.record_id IS NULL''').fetchone()[0] == 0, 'Canonical CORE/FULL ID sets differ'
    assert db.execute('''SELECT count(*) FROM canonical_raw r JOIN features f ON r.id=f.record_id
      WHERE r.city IS DISTINCT FROM f.city OR r.year IS DISTINCT FROM f.year
      OR r.race IS DISTINCT FROM f.race OR lower(trim(r.runner)) IS DISTINCT FROM lower(trim(f.runner_name))''').fetchone()[0] == 0, 'Canonical ID labels disagree'
    return True


def size(db, table, where='true'):
    return db.execute(f'SELECT count(*) FROM {table} WHERE {where}').fetchone()[0]


def prepare_history(db, source):
    location = str(source/'features.parquet').replace("'", "''")
    db.execute(f"CREATE TEMP VIEW features AS SELECT * FROM read_parquet('{location}')")
    assert db.execute('SELECT count(*)=count(DISTINCT record_id) FROM features').fetchone()[0], 'Feature record IDs are not unique'
    canonical = canonical_id_contract(db, source)
    db.execute('''CREATE TEMP TABLE safe_ids AS SELECT runner_id FROM features
      WHERE runner_id IS NOT NULL AND NOT is_ambiguous GROUP BY runner_id
      HAVING count(DISTINCT CASE WHEN lower(trim(sex)) IN ('m','male','men','man') THEN 'm'
        WHEN lower(trim(sex)) IN ('f','female','women','woman') THEN 'f' END)<=1
      AND coalesce(max(yob)-min(yob),0)<=2
      AND count(*)=count(DISTINCT (city,year,race))''')
    location = str(source/'race_conditions.parquet').replace("'", "''")
    db.execute(f"CREATE TEMP VIEW weather_raw AS SELECT * FROM read_parquet('{location}')")
    db.execute('''CREATE TEMP TABLE weather AS SELECT city,year,
      min(try_cast(race_date AS DATE)) AS event_date,avg(temp_c) AS temperature,
      avg(dewpoint_c) AS dewpoint,avg(wind_mps) AS wind,avg(precip_mm) AS rain
      FROM weather_raw GROUP BY city,year
      HAVING count(*)=1 AND count(DISTINCT try_cast(race_date AS DATE))=1
      AND year(min(try_cast(race_date AS DATE)))=year''')
    segment_names=['05','10','15','20','25','30','35','40','42']
    timing_match=' AND '.join(f'round(f.seg_{name}*60,3)=round(e.t{i}-'+(f'e.t{i-1}' if i else '0')+',3)' for i,name in enumerate(segment_names))
    identity_match = 'f.record_id=e.rid' if canonical else 'f.city=e.city AND f.year=e.year AND f.race=e.race AND lower(trim(f.runner_name))=lower(trim(u.runner))'
    db.execute(f'''CREATE TEMP TABLE candidate_links AS SELECT e.rid,f.record_id,f.runner_id,
      count(*) OVER(PARTITION BY e.rid) AS raw_matches,
      count(*) OVER(PARTITION BY f.record_id) AS feature_matches
      FROM eligible e JOIN unique_records u USING(rid)
      JOIN features f ON {identity_match}
        AND round(f.finish_time*60,3)=round(e.t8,3) AND {timing_match}
      WHERE f.runner_id IS NOT NULL AND NOT f.is_ambiguous''')
    db.execute('''CREATE TEMP TABLE linked AS SELECT e.*,f.runner_id AS uid,w.event_date,
      w.temperature,w.dewpoint,w.wind,w.rain
      FROM eligible e JOIN candidate_links f USING(rid)
      JOIN safe_ids s ON f.runner_id=s.runner_id
      LEFT JOIN weather w ON e.city=w.city AND e.year=w.year
      WHERE f.raw_matches=1 AND f.feature_matches=1''')
    db.execute('''CREATE TEMP TABLE prior AS SELECT a.rid,count(*) AS prior_count,
      count(*) FILTER(WHERE a.city=b.city) AS prior_city_count,
      min(b.t8) AS earlier_best,first(b.rid ORDER BY b.t8,b.year,b.rid) AS earlier_best_rid,
      min(b.t8) FILTER(WHERE b.year>=a.year-2) AS recent_best
      FROM linked a JOIN linked b ON a.uid=b.uid AND b.year<a.year GROUP BY a.rid''')
    db.execute('''CREATE TEMP TABLE history AS WITH measured AS (
      SELECT l.*,p.prior_count,p.prior_city_count,p.earlier_best,p.earlier_best_rid,p.recent_best,
        100*(l.t8/p.recent_best-1) AS performance,
        100*((l.t1/10)/(p.recent_best/42.195)-1) AS opening
      FROM linked l JOIN prior p USING(rid) WHERE p.recent_best IS NOT NULL
    ) SELECT *,CASE WHEN opening < -2 THEN 'Faster opening' WHEN opening<=2 THEN 'Similar opening' ELSE 'Slower opening' END AS opening_group,
      CASE WHEN recent_best<10800 THEN 'Under 3 hours' WHEN recent_best<12600 THEN '3–3:30'
        WHEN recent_best<14400 THEN '3:30–4 hours' ELSE '4 hours or longer' END AS ability_band,
      CASE WHEN performance < -2 THEN 'More than 2% faster' WHEN performance<=2 THEN 'Within 2%' ELSE 'More than 2% slower' END AS outcome_group
      FROM measured''')
    # Order by calendar year; only retain pairs with exactly one recorded race in
    # BOTH years and consecutive positions in the complete linked sequence.
    db.execute('''CREATE TEMP TABLE pairs AS WITH counted AS (
      SELECT *,count(*) OVER(PARTITION BY uid,year) AS year_n FROM linked
    ), ordered AS (SELECT *,lead(rid) OVER win AS next_rid,
      lead(year) OVER win AS next_year,lead(year_n) OVER win AS next_year_n,
      lead(event_date) OVER win AS next_date FROM counted
      WINDOW win AS (PARTITION BY uid ORDER BY year,rid)
    ) SELECT a.rid,a.uid,a.city,b.city AS next_city,a.year,a.event_date,a.next_date,a.next_rid,
      a.t8 AS previous_finish,b.t8 AS next_finish,a.change20 AS previous_change,b.change20 AS next_change,
      a.pattern AS previous_pattern,b.pattern AS next_pattern,
      100*(a.p8/a.p7-1) AS kick_change,
      100*(b.t8/a.t8-1) AS finish_change,
      a.next_year-a.year AS year_gap,date_diff('day',a.event_date,a.next_date) AS days,
      a.age AS previous_age,b.age AS next_age,a.gender,
      100*((b.t1/10)/(a.t1/10)-1) AS opening_change
      FROM ordered a JOIN linked b ON a.next_rid=b.rid
      WHERE a.year_n=1 AND a.next_year_n=1 AND a.next_year>a.year AND a.next_year<=a.year+3''')
    assert db.execute('SELECT count(*) FROM prior p JOIN linked a USING(rid) JOIN linked b ON b.rid=p.earlier_best_rid WHERE b.year>=a.year').fetchone()[0]==0
    return {'feature_rows':size(db,'features'),'safe_identity_groups':size(db,'safe_ids'),
            'record_join_method':'canonical_record_id' if canonical else 'natural_key',
            'canonical_id_contract_verified':canonical,
            'candidate_link_rows':size(db,'candidate_links'),
            'natural_key_candidate_rows':0 if canonical else size(db,'candidate_links'),
            'canonical_id_candidate_rows':size(db,'candidate_links') if canonical else 0,
            'ambiguous_cross_export_matches':size(db,'candidate_links','raw_matches>1 OR feature_matches>1'),
            'linked_eligible_finishes':size(db,'linked'),'recent_benchmark_finishes':size(db,'history'),
            'consecutive_cross_year_pairs':size(db,'pairs'),
            'linked_with_supplied_date':size(db,'linked','event_date IS NOT NULL')}


class ExtendedPublisher(Publisher):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,common_method=COMMON_METHOD[:2]+[
          'Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.', OBSERVATIONAL],script=__file__,**kwargs)

    def publish(self,*args,unit='eligible finishes',scope='descriptive',**kwargs):
        super().publish(*args,**kwargs)
        target=self.output/self.packs[-1]['id']/'pack_meta.json'
        meta=json.loads(target.read_text())
        meta.update({'analysis_version':2,'observation_unit':unit,'evidence_scope':scope,
          'supporting_script_sha256':hashlib.sha256(Path(__file__).with_name('build_pacing.py').read_bytes()).hexdigest()})
        if meta['question_id']=='r18_bq_rule_changes':
            meta['source_links']=[{'href':'https://www.baa.org/races/boston-marathon/qualify/','label':'B.A.A. historical qualifying standards'},
              {'href':'https://www.baa.org/news/2020-boston-marathon-qualifier-acceptances-announced/','label':'B.A.A. 2020 standards and acceptance announcement'}]
        if meta['question_id']=='r15_weather_penalty_who':
            meta['source_links']=[{'href':'https://open-meteo.com/en/docs/historical-weather-api','label':'Open-Meteo historical weather methods'}]
        target.write_text(json.dumps(meta,indent=2,allow_nan=False)+'\n')


def spread(db, table, group, where='true', filters=''):
    prefix=(filters+',') if filters else ''
    return records(db,f'''SELECT {prefix}{group} AS label,
      quantile_cont(performance,0.1) AS p10,median(performance) AS median,quantile_cont(performance,0.9) AS p90,
      count(*) AS n_p10,count(*) AS n_median,count(*) AS n_p90
      FROM {table} WHERE {where} GROUP BY ALL HAVING count(*)>=100 ORDER BY {prefix}label''')


def group_rates(db, table, group, outcome, where='true'):
    return records(db,f'''SELECT {group} AS label,100.0*avg(({outcome})::INTEGER) AS value,
      count(*) AS n_value,sum(({outcome})::INTEGER)::BIGINT AS successes FROM {table}
      WHERE {where} GROUP BY ALL HAVING count(*)>=100 ORDER BY label''')


def matched_openings(db):
    db.execute('''CREATE TEMP TABLE opening_cells AS SELECT city,year,race,gender,
      floor(recent_best/900) AS prior_band,opening_group,count(*) AS n,avg(performance) AS value
      FROM history GROUP BY ALL HAVING count(*)>=20''')
    rows=records(db,'''WITH strata AS (SELECT city,year,race,gender,prior_band,min(n) AS weight
      FROM opening_cells GROUP BY ALL HAVING count(*)=3)
      SELECT c.city,c.year,c.race,c.opening_group,sum(c.n)::BIGINT AS n,
        sum(s.weight) AS weight,sum(s.weight*c.value) AS numerator
      FROM opening_cells c JOIN strata s USING(city,year,race,gender,prior_band) GROUP BY ALL''')
    editions=sorted(set((r['city'],r['year'],r['race']) for r in rows))
    by={g:{(r['city'],r['year'],r['race']):r for r in rows if r['opening_group']==g} for g in OPENINGS}
    rng=random.Random(20260908)
    draws=[rng.choices(editions,k=len(editions)) for _ in range(500)]
    output=[]
    for group in OPENINGS:
        cells=by[group]
        n=sum(r['n'] for r in cells.values())
        if n<100: continue
        samples=sorted(sum(cells[e]['numerator'] for e in draw)/sum(cells[e]['weight'] for e in draw) for draw in draws)
        output.append({'label':group,'value':sum(r['numerator'] for r in cells.values())/sum(r['weight'] for r in cells.values()),
          'low':samples[12],'high':samples[487],'n_value':n,'n_low':n,'n_high':n,'editions':len(editions)})
    return output


def strategy_analyses(db,pub):
    n=size(db,'history')
    good=size(db,'history','performance < -2')
    profile=[]
    for i,distance in enumerate(POINTS):
        profile += records(db,f'''SELECT outcome_group AS outcome,{distance} AS label,
          median(100*(p{i}/(recent_best/42.195)-1)) AS value,count(*) AS n_value
          FROM history GROUP BY outcome_group HAVING count(*)>=100 ORDER BY outcome_group''')
    pub.publish('performance_profiles','r05_exceptional_vs_prior','What does an unusually good race look like?',
      f'{100*good/n:.1f}% of linked finishes were more than 2% faster than the runner’s best recorded finish in the previous two calendar years.',
      'Compare where those improvements appeared across the race. This benchmark uses earlier results only.',
      ['Define a substantially improved performance as a finish more than 2% faster than the recent recorded best. Compare each section’s pace with the full-marathon pace of that earlier benchmark, then plot the median by outcome group.']+HISTORY_METHOD,
      [chart('Pace relative to the earlier benchmark','profiles.csv','% pace',kind='line',xNumeric=True,xLabel='Distance (km)',filters=filter_for('outcome','Current performance','More than 2% faster'))],
      {'profiles.csv':profile},n,{'improved':good,'denominator':n})
    matched=matched_openings(db)
    pub.publish('opening_tradeoffs','r01_banking_time','What are the rewards and risks of an aggressive start?',
      'Opening pace and final performance are related, even after comparing runners within the same race edition, recorded gender and prior-time band.',
      'The chart uses a benchmark from earlier years. It does not establish what would happen if an individual changed strategy.',
      ['Match faster, similar and slower openings within city, year, race, recorded gender and 15-minute bands of recent recorded best. Keep strata with at least 20 in all three groups. Weight every group by the smallest group count in that stratum.',
       'Show the weighted mean percentage change from the prior benchmark. The lower and upper limits are percentile confidence limits from 500 bootstrap draws of whole race editions, seed 20260908. This captures edition clustering but not dependence when the same runner appears in different editions. No multiple-comparison significance claims are made.']+HISTORY_METHOD,
      [chart('Performance after matching prior ability and race edition','matched_openings.csv','%',series=[{'key':'value','label':'Mean change'},{'key':'low','label':'95% interval: lower'},{'key':'high','label':'95% interval: upper'}],note='Negative is faster than the earlier benchmark. Intervals reflect uncertainty in group means, not the range of individual outcomes.')],
      {'matched_openings.csv':matched},sum(r['n_value'] for r in matched))
    db.execute('''CREATE TEMP TABLE slow_starts AS SELECT *,CASE
      WHEN p1/p0<0.95 THEN 'Accelerated more than 5%'
      WHEN p1/p0<0.98 THEN 'Accelerated 2–5%' ELSE 'Little acceleration or slowing' END AS response
      FROM history WHERE p0/(recent_best/42.195)>1.05''')
    slow=spread(db,'slow_starts','response')
    pub.publish('slow_start_responses','r02_recover_slow_start','How do runners respond to a slow start?',
      'After a slow opening 5 km, the next section can reveal very different responses. Their finish outcomes are shown below.',
      'A slow opening could reflect restraint, terrain or crowding. The available splits cannot identify the cause.',
      ['A slow start is 0–5 km pace more than 5% slower than the earlier benchmark’s average. Group the change from 0–5 to 5–10 km as more than 5% acceleration, 2–5% acceleration, or less acceleration/slowing. Plot the 10th, 50th and 90th percentiles of final performance change. These groups are not matched on course or fitness.']+HISTORY_METHOD,
      [chart('Finish outcomes after a slow start','responses.csv','%',series=SERIES_SPREAD,note='Percentiles describe individual outcomes. Negative is faster than the prior benchmark.')],
      {'responses.csv':slow},size(db,'slow_starts'))
    rates=group_rates(db,'history','pattern','performance < -2')
    pub.publish('split_pattern_success','r30_negative_split_success','Is a faster second half always better?',
      'A stronger second 20 km is one race pattern to compare, rather than a definition of success. Each bar asks how often that pattern accompanies an improvement on an earlier best.',
      'We compare equal 20 km blocks because no measured halfway checkpoint is available.',
      ['Within each complete-race pattern, divide finishes more than 2% faster than the earlier benchmark by all linked finishes with that pattern. This conditions on a pattern known after the finish; it is a retrospective association, not a pre-race strategy trial.']+HISTORY_METHOD,
      [chart('Improved finishes within each race pattern','success_rates.csv','%')],{'success_rates.csv':rates},n)
    mix=records(db,'''WITH total AS (SELECT count(*) AS n FROM history WHERE performance < -2)
      SELECT pattern AS label,100.0*count(*)/any_value(total.n) AS value,any_value(total.n) AS n_value,count(*) AS successes
      FROM history CROSS JOIN total WHERE performance < -2 GROUP BY pattern HAVING count(*)>=100 ORDER BY value DESC''')
    pub.publish('successful_race_shapes','r31_multiple_good_strategies','Is there one good pacing strategy, or several?',
      'Improved performances can be described by more than one full-race shape. The mix below shows which shapes occurred among finishes that beat an earlier benchmark.',
      'A common successful pattern can simply be a common pattern overall; compare this with the success rate within each pattern in the previous question.',
      ['Restrict to finishes more than 2% faster than the recent recorded best. Divide the number in each equal-distance pattern by all such improved finishes. Suppress any pattern with fewer than 100 improved finishes; if a pattern is suppressed, visible shares need not sum to 100.']+HISTORY_METHOD,
      [chart('Race patterns among improved finishes','pattern_mix.csv','%')],{'pattern_mix.csv':mix},good)
    distribution=spread(db,'history','opening_group',filters='ability_band')
    risk=group_rates(db,'history','opening_group','performance>5')
    pub.publish('strategy_outcome_spread','r34_pacing_risk_reward','Which pacing approaches have more variable outcomes?',
      'Compare both the typical result and the range of outcomes. An approach’s median can hide a wide spread between strong and poor performances.',
      'The spread is grouped by prior performance, while the second chart records finishes more than 5% slower than that prior benchmark.',
      ['Within each prior-time band and opening group, calculate the 10th, 50th and 90th percentiles of finish-time percentage change. Also calculate the share more than 5% slower than the earlier benchmark. These distributions are unadjusted for course and edition, and describe observed finishers only.']+HISTORY_METHOD,
      [chart('Outcome spread by prior performance','spread.csv','%',series=SERIES_SPREAD,filters=filter_for('ability_band','Earlier best','3:30–4 hours')),
       chart('Finishes more than 5% slower than the earlier benchmark','shortfalls.csv','%')],
      {'spread.csv':distribution,'shortfalls.csv':risk},n)


def checkpoint_analyses(db,pub):
    years=[r[0] for r in db.execute('SELECT DISTINCT year FROM eligible ORDER BY year').fetchall()]
    assert len(years)>=6
    cutoff=years[-3]
    forecast=[]
    calibration=[]
    test_n=size(db,'eligible',f'year>={cutoff}')
    for i,km in [(0,5),(1,10),(2,15),(3,20),(4,25),(5,30),(6,35),(7,40)]:
        trend=f"CASE WHEN p{i}/p{i-1}<0.98 THEN 'Accelerating' WHEN p{i}/p{i-1}>1.02 THEN 'Slowing' ELSE 'Steady' END" if i else "'First checkpoint'"
        db.execute(f'''CREATE OR REPLACE TEMP TABLE forecast_input AS SELECT year,t{i} AS elapsed,t8 AS finish,
          floor(t{i}/{km}/30) AS pace_band,{trend} AS trend,
          t8/(t{i}*42.195/{km}) AS ratio FROM eligible''')
        db.execute(f'''CREATE OR REPLACE TEMP TABLE forecast_base AS SELECT pace_band,median(ratio) AS factor,
          quantile_cont(ratio,.1) AS lo,quantile_cont(ratio,.9) AS hi
          FROM forecast_input WHERE year<{cutoff} GROUP BY pace_band HAVING count(*)>=100''')
        db.execute(f'''CREATE OR REPLACE TEMP TABLE forecast_trend AS SELECT pace_band,trend,median(ratio) AS factor,
          quantile_cont(ratio,.1) AS lo,quantile_cont(ratio,.9) AS hi
          FROM forecast_input WHERE year<{cutoff} GROUP BY ALL HAVING count(*)>=100''')
        fallback=records(db,f'SELECT median(ratio) AS factor,quantile_cont(ratio,.1) AS lo,quantile_cont(ratio,.9) AS hi FROM forecast_input WHERE year<{cutoff}')[0]
        db.execute(f'''CREATE OR REPLACE TEMP TABLE forecast_test AS SELECT a.finish,
          a.elapsed*42.195/{km} AS naive,
          a.elapsed*42.195/{km}*coalesce(b.factor,{fallback['factor']}) AS baseline,
          a.elapsed*42.195/{km}*coalesce(t.factor,b.factor,{fallback['factor']}) AS predicted,
          a.elapsed*42.195/{km}*coalesce(t.lo,b.lo,{fallback['lo']}) AS lo,
          a.elapsed*42.195/{km}*coalesce(t.hi,b.hi,{fallback['hi']}) AS hi,
          (t.factor IS NULL) AS used_fallback FROM forecast_input a
          LEFT JOIN forecast_base b USING(pace_band) LEFT JOIN forecast_trend t USING(pace_band,trend)
          WHERE year>={cutoff}''')
        assert size(db,'forecast_test')==test_n
        forecast+=records(db,f'''SELECT {km} AS label,
          median(abs(naive-finish))/60 AS even_pace,median(abs(baseline-finish))/60 AS elapsed,
          median(abs(predicted-finish))/60 AS trend,
          count(*) AS n_even_pace,count(*) AS n_elapsed,count(*) AS n_trend FROM forecast_test''')
        calibration+=records(db,f'''SELECT {km} AS label,
          100*avg((finish BETWEEN lo AND hi)::INTEGER) AS coverage,
          median((hi-lo)/60) AS width,quantile_cont(abs(predicted-finish)/60,.9) AS error90,
          sum(used_fallback::INTEGER)::BIGINT AS fallback_count,
          count(*) AS n_coverage,count(*) AS n_width,count(*) AS n_error90 FROM forecast_test''')
    pub.publish('checkpoint_forecast_validation','r08_early_blowup_signal','How early can splits reveal the finish?',
      f"In unseen {cutoff}–{years[-1]} race editions, the trend model’s median finish-time error was {forecast[3]['trend']:.1f} minutes at 20 km and {forecast[5]['trend']:.1f} minutes at 30 km.",
      f'All model fitting uses editions before {cutoff}; all checkpoints are evaluated on the same {test_n:,} complete finishes in the later years.',
      ['At each checkpoint, start with elapsed time × 42.195 / distance. The elapsed-only model multiplies this by the training median actual/projected ratio in 30-second-per-km elapsed-pace bands. The trend model adds the most recent section’s change from the previous section (faster than −2%, within ±2%, or slower than +2%). At 5 km no trend exists.',
       f'Hold out the latest three observed calendar years ({cutoff}–{years[-1]}). Fit every factor and the 10th–90th percentile ratio interval on earlier years only. Training cells need at least 100 records; missing trend cells fall back to the pace-band model, then the pooled training model. No future splits, finishing-time groups, identities or supplied ability fields enter a prediction.',
       'Report median absolute error for all three methods, plus observed coverage and median width of the nominal 80% prediction interval and the 90th percentile absolute error. Model selection is fixed before examining these results. A runner may occur in training and test in different years; identities are not used. Results apply to complete eligible finishers and do not predict withdrawals.'],
      [chart('Median finish-time error in later race years','errors.csv','min',kind='line',xNumeric=True,xLabel='Checkpoint (km)',series=[{'key':'even_pace','label':'Even-pace extrapolation'},{'key':'elapsed','label':'Learned from elapsed pace'},{'key':'trend','label':'Elapsed pace + recent trend'}]),
       chart('Observed coverage of the 80% prediction interval','calibration.csv','%',xLabel='Checkpoint (km)',series=[{'key':'coverage','label':'Finish inside interval'}]),
       chart('Prediction width and larger errors','calibration.csv','min',xLabel='Checkpoint (km)',series=[{'key':'width','label':'Median interval width'},{'key':'error90','label':'90th percentile absolute error'}])],
      {'errors.csv':forecast,'calibration.csv':calibration},test_n,{'training_before_year':cutoff,'test_start_year':cutoff,'test_end_year':years[-1],'training_n':size(db,'eligible',f'year<{cutoff}'),'test_n':test_n},scope='validated forecast')
    db.execute('''CREATE TEMP TABLE patches AS SELECT *,CASE
      WHEN p4>1.10*((t3-t0)/15) AND p4>1.10*p3 THEN 4
      WHEN p5>1.10*((t3-t0)/15) AND p5>1.10*p4 THEN 5
      WHEN p6>1.10*((t3-t0)/15) AND p6>1.10*p5 THEN 6 END AS patch FROM eligible''')
    patch=[]
    for i in [4,5,6]:
        patch+=records(db,f'''SELECT {(i+1)*5} AS label,
          100*avg((p{i+1}<=1.05*((t3-t0)/15))::INTEGER) AS value,count(*) AS n_value,
          sum((p{i+1}<=1.05*((t3-t0)/15))::INTEGER)::BIGINT AS successes
          FROM patches WHERE patch={i} HAVING count(*)>=100''')
    pub.publish('bad_patch_recovery','r09_bad_patch_recoverable','When can runners regain their rhythm?',
      'A slow section does not always become a lasting fade. The chart shows how often pace returns near the earlier baseline in the very next 5 km.',
      'Recovery is assessed after the first qualifying patch; the patch is not selected because recovery later occurred.',
      ['Scan 20–25, 25–30 and 30–35 km in order. A patch is the first section more than 10% slower than both the immediately preceding section and the 5–20 km baseline pace. Recovery means the next full 5 km is no more than 5% slower than that baseline.',
       'Every runner contributes at most one patch. The outcome is next-section recovery, not a diagnosis or necessarily a return maintained to the finish. Course sections and different runner mixes can account for differences across distances. Five-kilometer timing cannot distinguish stops, walking, fatigue or terrain.'],
      [chart('Returned near baseline in the next 5 km','recovery.csv','%',xLabel='Patch ends at (km)')],{'recovery.csv':patch},size(db,'patches','patch IS NOT NULL'))
    db.execute('''CREATE TEMP TABLE onset AS SELECT *,CASE WHEN p4>1.1*(t3-t0)/15 THEN 4
      WHEN p5>1.1*(t3-t0)/15 THEN 5 WHEN p6>1.1*(t3-t0)/15 THEN 6
      WHEN p7>1.1*(t3-t0)/15 THEN 7 ELSE NULL END AS onset_section,
      CASE WHEN (t3-t0)/15<240 THEN 'Under 4 min/km' WHEN (t3-t0)/15<300 THEN '4–5 min/km'
      WHEN (t3-t0)/15<360 THEN '5–6 min/km' ELSE '6 min/km or slower' END AS early_pace FROM eligible''')
    dist=[]; elapsed=[]
    for i in [4,5,6,7]:
        dist+=records(db,f'''SELECT early_pace AS pace,{(i+1)*5} AS label,
          100*avg((onset_section={i})::INTEGER) AS value,count(*) AS n_value
          FROM onset WHERE onset_section IS NOT NULL GROUP BY early_pace HAVING count(*)>=100''')
        elapsed+=records(db,f'''SELECT early_pace AS pace,{(i+1)*5} AS label,
          median(t{i-1}/60) AS lower,median(t{i}/60) AS upper,
          count(*) AS n_lower,count(*) AS n_upper FROM onset WHERE onset_section={i}
          GROUP BY early_pace HAVING count(*)>=100''')
    pub.publish('distance_and_elapsed_change','r07_wall_clock_vs_distance','Do pacing changes follow distance or elapsed time?',
      'The same late-race section occurs at very different elapsed times for different runners. Both views are needed to describe when slowing first appears.',
      'The timing mats locate the first slow section, not the exact instant the pace changed. This descriptive comparison cannot identify a distance-driven or time-driven cause.',
      ['Define the first section after 20 km whose average pace is more than 10% slower than 5–20 km. Look only through 40 km so all tested sections are 5 km long. Group runners using their observed 5–20 km pace.',
       'Among runners with such a section, plot the distribution of its end distance. For each distance and early-pace group, show median elapsed arrival at the start and end of that section. The medians bound a typical observation interval; they are not confidence limits. This broader 10% section definition is separate from the sustained slowdown definition.'],
      [chart('First slow section by early-race pace','distance.csv','%',xLabel='Section ends at (km)',filters=filter_for('pace','5–20 km pace','5–6 min/km')),
       chart('Elapsed time at the two timing mats','elapsed.csv','min',xLabel='Section ends at (km)',series=[{'key':'lower','label':'At section start'},{'key':'upper','label':'At section end'}],filters=filter_for('pace','5–20 km pace','5–6 min/km'))],
      {'distance.csv':dist,'elapsed.csv':elapsed},size(db,'onset','onset_section IS NOT NULL'))
    milestones=[]; hits=[]; slips=[]
    goal_n=0
    for minutes,target in [(180,'Under 3 hours'),(210,'Under 3:30'),(240,'Under 4 hours'),(270,'Under 4:30'),(300,'Under 5 hours')]:
        db.execute(f'''CREATE OR REPLACE TEMP TABLE near_goal AS SELECT *,CASE
          WHEN t7*42.195/40/60-{minutes} < -2 THEN '2–5 minutes ahead'
          WHEN t7*42.195/40/60-{minutes} <=0 THEN 'Up to 2 minutes ahead'
          WHEN t7*42.195/40/60-{minutes} <=2 THEN 'Up to 2 minutes behind'
          ELSE '2–5 minutes behind' END AS margin FROM eligible
          WHERE abs(t7*42.195/40/60-{minutes})<=5''')
        a=records(db,'''SELECT margin AS label,median(100*(p8/p7-1)) AS value,count(*) AS n_value
          FROM near_goal GROUP BY margin HAVING count(*)>=100 ORDER BY label''')
        b=group_rates(db,'near_goal','margin',f't8 < {minutes*60}')
        milestones += [{'target':target,**r} for r in a]
        hits += [{'target':target,**r} for r in b]
        db.execute(f'''CREATE OR REPLACE TEMP TABLE goal_crossing AS SELECT *,CASE
          WHEN t4>{minutes*60*25/42.195} THEN 25 WHEN t5>{minutes*60*30/42.195} THEN 30
          WHEN t6>{minutes*60*35/42.195} THEN 35 WHEN t7>{minutes*60*40/42.195} THEN 40 END AS first_behind
          FROM eligible WHERE t3 BETWEEN {minutes*60*20/42.195*.99} AND {minutes*60*20/42.195}''')
        goal_n+=size(db,'goal_crossing','first_behind IS NOT NULL')
        slips += [{'target':target,**r} for r in group_rates(db,'goal_crossing','first_behind',f't8<{minutes*60}','first_behind IS NOT NULL')]
    pub.publish('milestone_finishing_speed','r17_milestone_kick','How much finishing speed appears near a milestone?',
      'Compare the final 2.195 km when a round-number finish looks just ahead or just behind at 40 km.',
      'Groups are defined at 40 km, before the finishing section. Round times are possible incentives, not declared goals.',
      ['Project finish time at 40 km by multiplying elapsed time by 42.195/40. Keep projections within five minutes of a round target and divide the margin into four bands. The kick measure is 100 × (40–42.195 km pace / 35–40 km pace − 1); negative means a faster final section.',
       'Plot the median kick and the share finishing strictly below the target. Different courses, ability and fatigue can produce the same projected margin. These are unadjusted associations, not evidence that a milestone caused a sprint.'],
      [chart('Final-section pace change','kick.csv','% pace',filters=filter_for('target','Finish target','Under 4 hours')),
       chart('Target achieved from that position','hits.csv','%',filters=filter_for('target','Finish target','Under 4 hours'))],
      {'kick.csv':milestones,'hits.csv':hits},sum(r['n_value'] for r in milestones))
    pub.publish('goal_slip_recovery','s10_goal_slips','What happens when a goal slips away?',
      'Falling behind an even-pace time budget is not the same as losing every chance of the target. The chart tracks whether runners subsequently finished under it.',
      'Each runner was on or slightly ahead of the target at 20 km, and then first crossed behind it at a later checkpoint.',
      ['At 20 km keep elapsed time from 99% through 100% of the target’s even-pace budget. Find the first 25, 30, 35 or 40 km checkpoint where elapsed time exceeds that budget. Divide eventual strict sub-target finishes by all such first-crossing observations.',
       'This uses inferred round-time benchmarks and elapsed chip times. It cannot establish when a runner mentally abandoned a goal. First-crossing groups differ, and results include only complete eligible finishes.'],
      [chart('Still finished under the target','slips.csv','%',xLabel='First checkpoint behind budget (km)',filters=filter_for('target','Finish target','Under 4 hours'))],
      {'slips.csv':slips},goal_n)


def course_analyses(db,pub):
    location=str(Path(pub.provenance['_source'])/'course_segments.parquet').replace("'","''")
    db.execute(f"CREATE TEMP TABLE terrain AS SELECT * FROM read_parquet('{location}')")
    db.execute('''CREATE TEMP TABLE terrain_unique AS SELECT city,seg_from_km,seg_to_km,
      avg(elev_net_m)/(1000*(seg_to_km-seg_from_km)) AS grade,
      CASE WHEN avg(elev_net_m)/(1000*(seg_to_km-seg_from_km))>.0015 THEN 'Net uphill'
        WHEN avg(elev_net_m)/(1000*(seg_to_km-seg_from_km))<-.0015 THEN 'Net downhill'
        ELSE 'Near level' END AS terrain_group
      FROM terrain GROUP BY city,seg_from_km,seg_to_km HAVING count(*)=1''')
    terrain_rows=[]
    for i,km in enumerate(POINTS):
        terrain_rows+=records(db,f'''SELECT t.terrain_group AS terrain,{km} AS label,
          median(100*(e.p{i}/(e.t8/42.195)-1)) AS value,count(*) AS n_value
          FROM eligible e JOIN terrain_unique t ON e.city=t.city AND abs(t.seg_to_km-{km})<.001
          GROUP BY terrain_group HAVING count(*)>=100 ORDER BY terrain_group''')
    terrain_n=size(db,'eligible','city IN (SELECT DISTINCT city FROM terrain_unique)')
    pub.publish('terrain_pacing_proxy','r11_course_section_traps','How does pacing align with course terrain?',
      'Sections marked uphill, downhill or near level in the supplied course profiles have different observed pacing patterns. This is an exploratory alignment with a route proxy.',
      'The route files mostly describe recent editions. Their historical validity is unverified, so this cannot measure the effect of the hills actually run in every year.',
      ['Join a unique supplied course segment by city and exact checkpoint distance. Classify net grade above +0.15% as uphill, below −0.15% as downhill and the remainder near level. At each distance, plot median individual section pace relative to that runner’s full-marathon average.',
       'The course profiles use GPX geometry and digital elevation models, sometimes smoothed over 800 m. Net grade conceals mixed climbs and descents; bridge decks, tunnels and route changes may be wrong. Historical races are compared with the available city profile as a proxy only. Different terrain groups contain different courses and fields; no causal hill penalty or physiological effort is inferred.'],
      [chart('Observed pace alongside supplied terrain classes','terrain.csv','% pace',kind='line',xNumeric=True,xLabel='Distance (km)',filters=filter_for('terrain','Supplied net grade','Net uphill'))],
      {'terrain.csv':terrain_rows},terrain_n,scope='route proxy')
    db.execute('''CREATE TEMP TABLE course_pairs AS SELECT *,least(city,next_city) AS course_a,
      greatest(city,next_city) AS course_b,CASE WHEN city<next_city THEN 'A first' ELSE 'B first' END AS race_order,
      CASE WHEN city<next_city THEN (next_finish-previous_finish)/60 ELSE (previous_finish-next_finish)/60 END AS difference
      FROM pairs WHERE city<>next_city''')
    translation=records(db,'''WITH cells AS (SELECT course_a,course_b,race_order,count(*) AS n,avg(difference) AS value
      FROM course_pairs GROUP BY ALL HAVING count(*)>=20), balanced_orders AS (
      SELECT course_a,course_b,avg(value) AS value,sum(n)::BIGINT AS n_value
      FROM cells GROUP BY ALL HAVING count(*)=2 AND sum(n)>=100)
      SELECT course_a AS origin,course_b AS label,value,n_value FROM balanced_orders
      UNION ALL SELECT course_b AS origin,course_a AS label,-value,n_value FROM balanced_orders ORDER BY origin,label''')
    pub.publish('paired_course_comparisons','r12_fastest_by_ability','What changes when the same runners change course?',
      'Runners who completed both courses provide a more useful comparison than unrelated course averages. The chart balances which course came first.',
      'These are observed time differences across consecutive recorded races, not a personalized equivalent-time calculator.',
      ['Use consecutive linked races in different calendar years, at most three years apart, with one recorded eligible race in each endpoint year. For each course pair, calculate the mean destination-minus-origin finish time separately for runners taking each race order, then average those two means equally.',
       'Require at least 20 pairs in each order and at least 100 overall. Balancing order reduces simple order imbalance but cannot remove fitness, weather, aging, motivation or entry-selection effects. The same runner can supply more than one pair. Positive means a slower finish at the destination.']+HISTORY_METHOD[:1],
      [chart('Observed time difference at the destination','course_pairs.csv','min',filters=filter_for('origin','Compared with','Boston'))],
      {'course_pairs.csv':translation},size(db,'course_pairs'),unit='linked race pairs',scope='partial comparison')
    course_spread=spread(db,'history','city',filters='ability_band')
    pub.publish('course_outcome_spread','r13_great_day_vs_consistency','Which courses combine speed and consistency?',
      'Compare each course’s median result against an earlier best alongside the range of observed outcomes. Course averages alone hide that variation.',
      'Prior-time bands improve comparability, but this is still a comparison of different people and race days.',
      ['Within city and prior-time band, report the 10th, 50th and 90th percentiles of finish-time change versus the earlier benchmark. Pool available editions and require at least 100 observations per city and band. A wide percentile range describes individual variation, not uncertainty in the median.']+HISTORY_METHOD,
      [chart('Performance and spread on each course','course_spread.csv','%',series=SERIES_SPREAD,filters=filter_for('ability_band','Earlier best','3:30–4 hours'))],
      {'course_spread.csv':course_spread},size(db,'history'))
    familiarity=records(db,'''WITH cells AS (SELECT city,year,race,gender,floor(recent_best/900) AS prior_band,
      (prior_city_count>0) AS familiar,count(*) AS n,avg(change20) AS value FROM history GROUP BY ALL HAVING count(*)>=20),
      matched AS (SELECT city,year,race,gender,prior_band,min(n) AS weight FROM cells GROUP BY ALL HAVING count(*)=2)
      SELECT c.city,CASE WHEN c.familiar THEN 'Previously recorded on this course' ELSE 'First recorded on this course' END AS label,
      sum(m.weight*c.value)/sum(m.weight) AS value,sum(c.n)::BIGINT AS n_value
      FROM cells c JOIN matched m USING(city,year,race,gender,prior_band)
      GROUP BY c.city,c.familiar HAVING sum(c.n)>=100 ORDER BY c.city,c.familiar''')
    # Only show cities where both matched groups are publishable.
    city_counts={r['city']:sum(a['city']==r['city'] for a in familiarity) for r in familiarity}
    familiarity=[r for r in familiarity if city_counts[r['city']]==2]
    pub.publish('course_familiarity','r14_knowing_course','Does knowing the course improve execution?',
      'Compare late-race pace retention for runners with and without an earlier recorded appearance on the same course.',
      'A first appearance in this export may not be a runner’s first visit to the course, and returning runners are a selected group.',
      ['Familiar means at least one eligible linked appearance in the same city in an earlier calendar year. Match familiar and first-recorded groups within edition, recorded gender and 15-minute prior-time bands; each group needs 20 finishes per stratum. Use the smaller stratum count as a common weight.',
       'The outcome is mean percentage change from 0–20 to 20–40 km. Both groups have some prior recorded marathon history, but familiarity itself is not randomly assigned. Route changes and visits absent from the dataset are unknown.']+HISTORY_METHOD,
      [chart('Pace retention after matching prior ability','familiarity.csv','% pace',filters=filter_for('city','Course','Boston'))],
      {'familiarity.csv':familiarity},sum(r['n_value'] for r in familiarity))
    db.execute('''CREATE TEMP TABLE weather_history AS SELECT *,CASE
      WHEN temperature<10 THEN 'Below 10°C' WHEN temperature<15 THEN '10–14.9°C'
      WHEN temperature<20 THEN '15–19.9°C' ELSE '20°C or warmer' END AS temperature_band
      FROM history WHERE temperature BETWEEN -10 AND 40''')
    weather_outcomes=records(db,'''WITH editions AS (SELECT city,year,race,temperature_band,
      median(performance) AS value,count(*) AS n FROM weather_history GROUP BY ALL HAVING count(*)>=100)
      SELECT temperature_band AS label,avg(value) AS value,sum(n)::BIGINT AS n_value,count(*) AS editions
      FROM editions GROUP BY temperature_band HAVING count(*)>=5 ORDER BY label''')
    weather_profiles=[]
    for i,km in enumerate(POINTS):
        weather_profiles+=records(db,f'''WITH editions AS (SELECT city,year,race,temperature_band,
          median(100*(p{i}/(t8/42.195)-1)) AS value,count(*) AS n
          FROM weather_history GROUP BY ALL HAVING count(*)>=100)
          SELECT temperature_band AS temperature,{km} AS label,avg(value) AS value,sum(n)::BIGINT AS n_value,count(*) AS editions
          FROM editions GROUP BY temperature_band HAVING count(*)>=5 ORDER BY temperature_band''')
    pub.publish('weather_pacing_patterns','r15_weather_penalty_who','How does weather change observed pacing?',
      'The supplied start-time weather can be compared with the whole pacing profile and performance relative to earlier races.',
      'Each race edition receives equal weight. Temperature bands still contain different courses and fields, so these differences are not a temperature penalty.',
      ['Use the supplied Open-Meteo archive hour nearest the scheduled local start. Join the single city-year weather row whose race date parses and matches the record year. Group temperature below 10°C, 10–14.9°C, 15–19.9°C and at least 20°C.',
       'First calculate each edition’s median outcome among linked runners with a recent benchmark, requiring 100 finishes. Then average edition medians equally within temperature bands, requiring five editions. The profile is normalized by each runner’s own marathon average; performance is relative to the earlier benchmark.',
       'The modeled weather is a start-hour proxy, not each runner’s exposure. Start offsets are absent, temperatures change during the race and humidity, wind, sunshine, terrain and fitness remain potential confounders. Edition counts in the source table are the number of weather exposures; finish counts are not independent weather observations.']+HISTORY_METHOD,
      [chart('Pace through the race by start-hour temperature','weather_profiles.csv','% pace',kind='line',xNumeric=True,xLabel='Distance (km)',filters=filter_for('temperature','Start-hour temperature','10–14.9°C')),
       chart('Performance relative to earlier races','weather_outcomes.csv','%',note='Equal weight per eligible edition; at least five editions per band. Descriptive, without a causal weather adjustment.')],
      {'weather_profiles.csv':weather_profiles,'weather_outcomes.csv':weather_outcomes},size(db,'weather_history'),scope='weather proxy')
    days=spread(db,'history','year',filters='city')
    pub.publish('race_day_context','s5_pacing_vs_difficult_day','Was it my pacing or a difficult race day?',
      'Compare a performance with how the field did against its own earlier results. A race-wide shortfall and an individual shortfall answer different questions.',
      'The chart supplies a race-day benchmark. It cannot divide a runner’s lost time into weather, pacing, illness or other causes.',
      ['For every city and race year, calculate the median and 10th–90th percentiles of percentage finish change versus each linked runner’s recent recorded best. Require 100 such finishes per edition. Compare an individual’s percentage change with that edition median to describe their position relative to the field.',
       'This contemporaneous edition reference is retrospective, includes the runner when eligible, and may shift with selection and fitness changes. It is not a weather correction or a prediction available before race day.']+HISTORY_METHOD,
      [chart('How the field performed against its earlier benchmarks','race_days.csv','%',series=SERIES_SPREAD,xLabel='Race year',filters=filter_for('city','Course','Boston'))],
      {'race_days.csv':days},size(db,'history'),scope='partial comparison')
    adaptation=[]
    for i,km in enumerate(POINTS):
        adaptation+=records(db,f'''SELECT city,outcome_group AS outcome,{km} AS label,
          median(100*(p{i}/(t8/42.195)-1)) AS value,count(*) AS n_value
          FROM history GROUP BY city,outcome_group HAVING count(*)>=100 ORDER BY city,outcome_group''')
    pub.publish('course_response_profiles','r35_course_adaptation','Are stronger performances paced differently on each course?',
      'Compare the course-specific race shapes of improved, similar and slower performances. This identifies how their pace distributions differ on the same named course.',
      'A stronger finish does not prove better terrain adaptation. Historical route validity and direct effort measurements are still missing.',
      ['Normalize section pace by each runner’s own full-marathon average, then take the median by city and performance group. Performance groups use more than 2% faster than, within 2% of, or more than 2% slower than the prior benchmark. Require 100 per city and group.',
       'The outcome group is known after the race. Courses pool editions; neither terrain versions nor race-day conditions are held constant. This is a descriptive course-response profile, not evidence of optimal effort allocation on hills.']+HISTORY_METHOD,
      [chart('Course pacing profile by performance group','course_responses.csv','% pace',kind='line',xNumeric=True,xLabel='Distance (km)',filters=filter_for('city','Course','Boston')+filter_for('outcome','Performance','More than 2% faster'))],
      {'course_responses.csv':adaptation},size(db,'history'),scope='partial comparison')


def history_analyses(db,pub):
    pair_n=size(db,'pairs')
    habits=records(db,'''SELECT year_gap AS label,corr(previous_change,next_change) AS value,count(*) AS n_value
      FROM pairs GROUP BY year_gap HAVING count(*)>=100 ORDER BY year_gap''')
    transitions=records(db,'''WITH totals AS (SELECT previous_pattern,count(*) AS n FROM pairs GROUP BY previous_pattern)
      SELECT p.previous_pattern AS previous,p.next_pattern AS label,
      100.0*count(*)/any_value(t.n) AS value,any_value(t.n) AS n_value,count(*) AS count
      FROM pairs p JOIN totals t USING(previous_pattern) GROUP BY p.previous_pattern,p.next_pattern HAVING any_value(t.n)>=100
      ORDER BY p.previous_pattern,p.next_pattern''')
    pub.publish('pacing_habit_persistence','r20_pacing_personalities','Do runners have persistent pacing habits?',
      'A repeat runner’s two races can be compared directly: both the correlation in pace retention and the chance of changing race pattern.',
      'Persistence may reflect the runner, repeated course choices, or shared conditions. It is not an immutable pacing personality.',
      ['Use consecutive linked finishes in different years, no more than three years apart, with exactly one recorded eligible finish in each endpoint year. Calculate Pearson correlation between the two 0–20 versus 20–40 km pace changes, grouped by calendar-year gap.',
       'For each earlier race pattern, divide the number of next races in each pattern by all eligible pairs with that earlier pattern. These conditional transition percentages sum to 100 within the earlier pattern. Correlation is descriptive; repeat observations of a runner are not independent.']+HISTORY_METHOD[:1],
      [chart('Similarity in pace retention between races','correlation.csv','correlation',xLabel='Calendar-year gap'),
       chart('Pattern in the next recorded race','transitions.csv','%',filters=filter_for('previous','Earlier pattern',PATTERNS[2]))],
      {'correlation.csv':habits,'transitions.csv':transitions},pair_n,unit='linked race pairs')
    experience=records(db,'''SELECT CASE WHEN prior_count=1 THEN '1 earlier finish'
      WHEN prior_count=2 THEN '2 earlier finishes' WHEN prior_count<=4 THEN '3–4 earlier finishes' ELSE '5 or more earlier finishes' END AS label,
      median(opening) AS opening,median(change20) AS retention,count(*) AS n_opening,count(*) AS n_retention
      FROM history GROUP BY ALL HAVING count(*)>=100 ORDER BY label''')
    changes=records(db,'''SELECT previous_pattern AS label,median(next_change-previous_change) AS value,count(*) AS n_value
      FROM pairs GROUP BY previous_pattern HAVING count(*)>=100 ORDER BY previous_pattern''')
    pub.publish('experience_and_pacing','r21_learn_from_blowup','What changes as runners gain experience?',
      'Recorded experience can be compared with opening pace and retention, while linked race pairs show how the same runner’s retention changes next time.',
      'Experience here means appearances in this dataset. The first observed race is not necessarily a marathon debut.',
      ['Count eligible linked finishes in strictly earlier calendar years. Show median opening pace relative to the recent benchmark and median change between the two 20 km blocks by prior count.',
       'Separately, use consecutive cross-year pairs to calculate the median next-minus-previous pace-retention change, grouped by the previous pattern. Selecting an unusually good or bad first race creates regression to the mean, so improvement after pronounced slowing is not proof of learning. Continued participation and changing fitness also affect these comparisons.']+HISTORY_METHOD,
      [chart('Pacing by recorded experience','experience.csv','% pace',series=[{'key':'opening','label':'Opening vs earlier benchmark'},{'key':'retention','label':'Second 20 km vs first'}]),
       chart('How retention changed in the next race','next_changes.csv','% pace',note='Percentage-point change; negative means less slowing than in the previous race.')],
      {'experience.csv':experience,'next_changes.csv':changes},size(db,'history'))
    db.execute('''CREATE TEMP TABLE kicks AS SELECT *,finish_change AS performance,
      CASE WHEN kick_change < -5 THEN 'More than 5% faster finish section'
      WHEN kick_change<0 THEN 'Up to 5% faster finish section' ELSE 'Similar or slower finish section' END AS kick_group FROM pairs''')
    kick_spread=spread(db,'kicks','kick_group',filters='previous_pattern')
    kick_rates=group_rates(db,'kicks','kick_group','finish_change < -2')
    pub.publish('strong_finish_followup','r25_huge_kick_next','Does a strong finish suggest unused capacity?',
      'We can test whether a fast finishing section is followed by a better recorded marathon. That association alone cannot establish unused capacity.',
      'The comparison conditions on returning for another recorded race, and the next race may have a different course and conditions.',
      ['A finishing acceleration is the percentage change in pace from 35–40 to 40–42.195 km. Group it as more than 5% faster, up to 5% faster, or similar/slower. Use consecutive cross-year linked pairs at most three years apart.',
       'Measure next-finish percentage change relative to the first finish, report its 10th/50th/90th percentiles within the first race’s pacing pattern, and the share improving by more than 2%. This does not measure effort reserves, account for absent follow-up, or establish what would have happened with a harder earlier effort.']+HISTORY_METHOD[:1],
      [chart('Performance in the next race','kick_followup.csv','%',series=SERIES_SPREAD,filters=filter_for('previous_pattern','Earlier race shape',PATTERNS[2])),
       chart('Next finish improved by more than 2%','kick_success.csv','%')],
      {'kick_followup.csv':kick_spread,'kick_success.csv':kick_rates},pair_n,unit='linked race pairs',scope='partial comparison')
    db.execute('''CREATE TEMP TABLE complete_date_ids AS SELECT uid FROM linked GROUP BY uid
      HAVING count(*)=count(event_date) AND count(*)=count(DISTINCT event_date)''')
    db.execute('''CREATE TEMP TABLE dated_pairs AS WITH ordered AS (SELECT a.*,
      lead(t8) OVER win AS next_finish,lead(event_date) OVER win AS next_date
      FROM linked a JOIN complete_date_ids USING(uid)
      WINDOW win AS (PARTITION BY uid ORDER BY event_date))
      SELECT a.*,date_diff('day',event_date,next_date) AS gap_days,100*(next_finish/t8-1) AS performance,
      (t8<p.earlier_best) AS improved_on_earlier_years
      FROM ordered a LEFT JOIN prior p USING(rid)
      WHERE date_diff('day',event_date,next_date) BETWEEN 1 AND 1095''')
    spacing=[]
    gap="CASE WHEN gap_days<90 THEN '1–89 days' WHEN gap_days<180 THEN '90–179 days' WHEN gap_days<365 THEN '180–364 days' WHEN gap_days<730 THEN '365–729 days' ELSE '730–1095 days' END"
    for subset,where in [('All dated pairs','true'),('After beating an earlier-year best','improved_on_earlier_years')]:
        spacing += [{'sample':subset,**r} for r in spread(db,'dated_pairs',gap,where)]
    pub.publish('race_spacing_outcomes','r24_interval_after_pb','How does the previous marathon relate to the next one?',
      'Compare the next recorded finish across start-to-start intervals, including a separate view after a finish that beat the runner’s best in earlier years.',
      'These are observed scheduling choices, not recommendations for a recovery interval.',
      ['Use only linked identity groups for which every eligible record has a unique supplied race date. Order by that date, pair adjacent races and retain intervals of 1–1095 days. Unlike the year-based analyses, this includes same-year pairs. Dates come from the supplied calendar overlay and have not all been independently reverified.',
       'Calculate 100 × (next finish / previous finish − 1) and its 10th/50th/90th percentiles in the displayed day bands. The second view requires the earlier race to beat every recorded finish in earlier calendar years; same-year bests are not used for that label. Fitness, course, motivation and selection into short or long intervals remain confounders.']+HISTORY_METHOD[:1],
      [chart('Next performance by recorded race interval','spacing.csv','%',series=SERIES_SPREAD,filters=filter_for('sample','Starting race','All dated pairs'))],
      {'spacing.csv':spacing},size(db,'dated_pairs'),unit='dated race pairs')
    maxyear=db.execute('SELECT max(year) FROM eligible').fetchone()[0]
    db.execute('''CREATE TEMP TABLE observed_editions AS SELECT city,year FROM eligible GROUP BY city,year HAVING count(*)>=100''')
    db.execute(f'''CREATE TEMP TABLE return_index AS SELECT a.*,
      EXISTS(SELECT 1 FROM linked b WHERE b.uid=a.uid AND b.year BETWEEN a.year+1 AND a.year+2) AS returned
      FROM linked a WHERE a.year<={maxyear-2}
      AND EXISTS(SELECT 1 FROM observed_editions b WHERE b.city=a.city AND b.year=a.year+1)
      AND EXISTS(SELECT 1 FROM observed_editions b WHERE b.city=a.city AND b.year=a.year+2)''')
    returns=[]
    for minutes,target in [(180,'Under 3 hours'),(210,'Under 3:30'),(240,'Under 4 hours'),(270,'Under 4:30'),(300,'Under 5 hours')]:
        rows=group_rates(db,'return_index',f"CASE WHEN t8<{minutes*60} THEN 'Finished just under' ELSE 'Finished at or just over' END",'returned',f'abs(t8-{minutes*60})<=120')
        returns += [{'target':target,**r} for r in rows]
    pub.publish('near_miss_recorded_return','r19_near_miss_return','Does a near miss bring people back?',
      'Compare how often runners just under and just over a round target appear again in the following two calendar years.',
      'A missing later record means no eligible linked appearance was observed here. It does not mean the runner stopped racing.',
      ['Select linked finishes within two minutes of each round target. Under is strictly below the target; an exact target time belongs to the at-or-over group. Require two subsequent calendar years with at least 100 eligible finishes in the index city, and exclude the latest two observed years as index years.',
       'Return means any eligible linked finish anywhere in the export during the next two calendar years. Same-year returns do not count. Divide returns by every eligible index finish in each group, including those with no observed return. Coverage checks reduce administrative censoring but do not establish complete race ingestion. Repeat index observations, false/missed links, changing coverage and unrecorded goals can affect the association.']+HISTORY_METHOD[:1],
      [chart('Observed again in the following two years','returns.csv','%',filters=filter_for('target','Finish target','Under 4 hours'))],
      {'returns.csv':returns},sum(r['n_value'] for r in returns),scope='partial comparison')
    db.execute('''CREATE TEMP TABLE best_gains AS SELECT a.rid,
      (b.t1-a.t1)/60 AS opening_gain,((b.t5-b.t1)-(a.t5-a.t1))/60 AS middle_gain,
      ((b.t8-b.t5)-(a.t8-a.t5))/60 AS late_gain,(b.t8-a.t8)/60 AS total_gain
      FROM linked a JOIN prior p USING(rid) JOIN linked b ON b.rid=p.earlier_best_rid
      WHERE a.t8<p.earlier_best''')
    assert db.execute('SELECT max(abs(opening_gain+middle_gain+late_gain-total_gain)) FROM best_gains').fetchone()[0]<1e-7
    total=records(db,'SELECT count(*) AS n,avg(total_gain) AS gain FROM best_gains')[0]
    gains=[]
    for label,key,km in [('Opening 10 km','opening_gain',10),('Middle 20 km','middle_gain',20),('Final 12.195 km','late_gain',12.195)]:
        gains+=records(db,f"SELECT '{label}' AS label,avg({key}) AS value,avg({key})*60/{km} AS pace_gain,count(*) AS n_value,count(*) AS n_pace_gain FROM best_gains")
    assert abs(sum(r['value'] for r in gains)-total['gain'])<1e-7
    pub.publish('earlier_best_section_gains','r32_where_pbs_are_gained','Where is a faster recorded best gained?',
      f"These finishes improved on an earlier-year recorded best by {total['gain']:.1f} minutes on average. The three section gains below add up to that improvement.",
      'This is a best within the recorded earlier-year history. Races absent from the export and other races in the same year prevent a lifetime-PB claim.',
      ['For each eligible linked finish faster than every eligible recorded finish in strictly earlier calendar years, select the fastest earlier-year record as comparator. Break tied best times by earlier year and then stable raw record ID. Both races must have all nine valid checkpoints.',
       'Subtract current from earlier elapsed time over 0–10, 10–30 and 30–42.195 km. Positive means time gained. Compute means so that the three block means sum exactly to the mean finish improvement; separately divide each block by its own distance to show seconds gained per kilometer. Assert that block gains sum to total gain for every pair and in the published means. Different courses and conditions can contribute to gains.']+HISTORY_METHOD[:1],
      [chart('Where the finish-time improvement appeared','gains.csv','min'),
       chart('Gain per kilometer of each block','gains.csv','sec/km',series=[{'key':'pace_gain','label':'Seconds gained per km'}])],
      {'gains.csv':gains},total['n'],{'mean_total_gain_min':total['gain'],'pair_count':total['n']},unit='earlier-best comparisons',scope='partial comparison')


def qualifying_analysis(db,pub):
    # A deliberately narrow, source-verified policy comparison. No individual
    # qualification eligibility or Boston-entry status is inferred.
    db.execute('''CREATE TEMP TABLE bq_cohort AS SELECT *,CASE WHEN year=2019 THEN '2019 races' ELSE '2016–2017 races' END AS period
      FROM eligible WHERE year IN (2016,2017,2019) AND age BETWEEN 18 AND 31 AND age=floor(age)
      AND gender IN ('Women','Men')''')
    rules=[]
    for key,male,female in [('Earlier standard',185,215),('Five-minute-faster standard',180,210)]:
        target=f"CASE WHEN gender='Men' THEN {male*60} ELSE {female*60} END"
        rows=records(db,f'''WITH near AS (SELECT city,period,count(*) AS n,avg((t8<=({target}))::INTEGER) AS share
          FROM bq_cohort WHERE abs(t8-({target}))<=120 GROUP BY city,period HAVING count(*)>=20),
          common AS (SELECT city,min(n) AS weight FROM near GROUP BY city HAVING count(*)=2)
          SELECT period AS label,100*sum(c.weight*n.share)/sum(c.weight) AS value,sum(n.n)::BIGINT AS n_value,
            count(*) AS cities FROM near n JOIN common c USING(city) GROUP BY period HAVING sum(n.n)>=100 ORDER BY period''')
        rules += [{'benchmark':key,**r} for r in rows]
    pub.publish('qualifying_threshold_comparison','r18_bq_rule_changes','Do qualifying rules change how people race?',
      'We can examine finish-time bunching around the old and new standards before and after Boston’s five-minute tightening. This is a descriptive policy comparison, not evidence of a causal rule effect.',
      'This initial analysis focuses on ages 18–31 in 2016–2017 and 2019; it does not assign individual Boston eligibility or acceptance.',
      ['The B.A.A. history lists 18–34 standards of 3:05 for men and 3:35 for women for 2013–2019 Boston races; the 2020 standards became 3:00 and 3:30, announced in September 2018. Compare 2016–2017 performances with 2019, excluding the transition year. Exact ages 18–31 avoid crossing the 35-year boundary within the next two years.',
       'Around each fixed old/new benchmark, select finishes within ±2 minutes. Within each city and period, calculate the share at or below the benchmark. Keep cities with at least 20 close finishes in both periods and weight both periods by the smaller city-period count. Report at least 100 observed finishes per displayed period.',
       'Acceptance cutoffs, declared intentions, age on a future Boston race day, certification and qualifying windows are not assigned to individuals. Round-number appeal, historical field changes and anticipatory behavior can explain bunching. This is not a difference-in-differences causal estimate, and the comparison does not cover every rule change.',
       'Official sources: https://www.baa.org/races/boston-marathon/qualify/ ; https://www.baa.org/news/2020-boston-marathon-qualifier-acceptances-announced/ . Historical values verified 2026-09-08.'],
      [chart('At or below the benchmark among nearby finishes','thresholds.csv','%',filters=filter_for('benchmark','Time benchmark','Five-minute-faster standard'))],
      {'thresholds.csv':rules},sum(r['n_value'] for r in rules),scope='partial comparison')


def run(source,output,live_as_of,personalized_output=None):
    db=duckdb.connect()
    # 6 GB (4 GB until the 1652 refresh): the larger release spilled past the free temporary disk at 4 GB.
    db.execute("SET memory_limit='6GB'")
    db.execute('SET threads=2')
    db.execute('SET temp_directory=?',[str(source/'extended-temp')])
    counts=prepare(db,source,keep_record_id=True)
    manifest=json.loads((source/'MANIFEST.json').read_text())
    provenance=json.loads((source/'provenance.json').read_text())
    assert counts['raw']==manifest['n_records']
    provenance['_source']=str(source)
    diagnostics=prepare_history(db,source)
    assert diagnostics['recent_benchmark_finishes']>=100, 'Insufficient verified linked histories'
    print(json.dumps(diagnostics),flush=True)
    pub=ExtendedPublisher(output,provenance,manifest,counts,live_as_of,source_quality=source_quality_report(db,source))
    for function in [strategy_analyses,checkpoint_analyses,course_analyses,history_analyses,qualifying_analysis]:
        function(db,pub)
        print(f'{function.__name__}: {len(pub.packs)} aggregate packs calculated',flush=True)
    # Add aggregate linkage diagnostics to every chart pack.
    for entry in pub.packs:
        target=output/entry['id']/'pack_meta.json'
        meta=json.loads(target.read_text());meta['linkage_audit']=diagnostics
        target.write_text(json.dumps(meta,indent=2,allow_nan=False)+'\n')
    assert len(pub.packs)==25, 'Incomplete extended question set'
    print('Completed 25 extended packs. Only aggregate tables were written.',flush=True)
    if personalized_output is not None:
        from build_personalized import generate
        generate(db,source,personalized_output,provenance,manifest,counts,diagnostics,live_as_of)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--live-as-of',required=True)
    parser.add_argument('--personalized-output',type=Path)
    args=parser.parse_args()
    run(args.input,args.output,args.live_as_of,args.personalized_output)
