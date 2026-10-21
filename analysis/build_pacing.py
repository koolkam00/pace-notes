"""Recompute aggregate pacing packs from a verified CORE export.

No network calls, runner-level outputs, identity matching, or core-pack writes.
"""
import argparse
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import duckdb
from source_quality import METHOD as SOURCE_QUALITY_METHOD, install_policy, source_quality_report

POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
FIELDS = [f"split_{k}km" for k in [5, 10, 15, 20, 25, 30, 35, 40]] + ["split_42_2km"]
MIN_CELL = 100
MIN_MATCH = 20
PATTERNS = ["Faster second 20 km", "Similar 20 km blocks", "Moderate slowing", "Pronounced slowing"]
COMMON_METHOD = [
    "Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.",
    "Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.",
    "Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.",
]


def records(db, query, params=None):
    result = db.execute(query, params or [])
    columns = [c[0] for c in result.description]
    return [dict(zip(columns, row)) for row in result.fetchall()]


def chart(title, table, unit, series=None, **kwargs):
    return {"title": title, "table": table, "unit": unit, "xLabel": "Group",
            "series": series or [{"key": "value", "label": title}], **kwargs}


def filter_for(key, label, preferred):
    return [{"key": key, "label": label, "preferred": preferred}]


def prepare(db, source, keep_record_id=False):
    install_policy(db, source)
    # Parse elapsed durations, never wall-clock timestamps. Invalid strings become NULL.
    db.execute(r"""CREATE MACRO seconds(s) AS (
      CASE WHEN regexp_full_match(trim(s), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9](\.[0-9]+)?')
        THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*3600
           + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)*60
           + try_cast(split_part(trim(s), ':', 3) AS DOUBLE)
      WHEN regexp_full_match(trim(s), '[0-9]{1,4}:[0-5][0-9](\.[0-9]+)?')
        THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*60
           + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)
      ELSE NULL END)""")
    # Names are used only to avoid collapsing different people with identical splits.
    fields = ', '.join(['race', 'year', 'city', 'runner', 'sex', 'age', 'age_group', 'age_or_group'] + FIELDS)
    query = f'SELECT min(id) AS rid, {fields} FROM read_parquet(?) GROUP BY ALL' if keep_record_id else f'SELECT DISTINCT {fields} FROM read_parquet(?)'
    db.execute('CREATE TEMP TABLE unique_records AS '+query, [str(source / 'race_records.parquet')])
    parsed = ', '.join(f'seconds({field}) AS t{i}' for i, field in enumerate(FIELDS))
    db.execute(f"""CREATE TEMP TABLE parsed AS SELECT {'rid,' if keep_record_id else ''} city, race, year, age,
      CASE WHEN lower(trim(sex)) IN ('f','female','woman','women') THEN 'Women'
           WHEN lower(trim(sex)) IN ('m','male','man','men') THEN 'Men'
           ELSE 'Other / not recorded' END AS gender,
      {parsed} FROM unique_records""")
    pace_cols = []
    previous = 0
    for i, distance in enumerate(POINTS):
        previous_time = f't{i-1}' if i else '0'
        pace_cols.append(f'(t{i}-{previous_time})/{distance-previous:.6f} AS p{i}')
        previous = distance
    db.execute('CREATE TEMP TABLE paced AS SELECT *, ' + ', '.join(pace_cols) + ' FROM parsed')
    complete = ' AND '.join(f't{i} IS NOT NULL' for i in range(9))
    increasing = 't0>0 AND ' + ' AND '.join(f't{i}>t{i-1}' for i in range(1, 9))
    plausible = 't8 BETWEEN 5400 AND 43200 AND ' + ' AND '.join(f'p{i} BETWEEN 120 AND 1200' for i in range(9))
    db.execute(f'CREATE TEMP TABLE timing_eligible AS SELECT * FROM paced WHERE {complete} AND {increasing} AND {plausible}')
    db.execute(f"""CREATE TEMP TABLE eligible AS SELECT *,
      100*((t7-t3)/t3-1) AS change20,
      (t8-t5)/60 AS remaining30,
      CASE WHEN 100*((t7-t3)/t3-1)<-2 THEN '{PATTERNS[0]}'
           WHEN 100*((t7-t3)/t3-1)<=2 THEN '{PATTERNS[1]}'
           WHEN 100*((t7-t3)/t3-1)<=10 THEN '{PATTERNS[2]}'
           ELSE '{PATTERNS[3]}' END AS pattern,
      CASE WHEN p3/p2<0.98 THEN 'Accelerating'
           WHEN p3/p2>1.02 THEN 'Slowing' ELSE 'Steady' END AS trend20,
      CASE WHEN age>=18 AND age<90 AND age=floor(age)
        THEN CASE WHEN age<30 THEN '18–29' ELSE cast(floor(age/10)*10 AS INTEGER)::VARCHAR || '–' || cast(floor(age/10)*10+9 AS INTEGER)::VARCHAR END
        ELSE NULL END AS age_band
      FROM timing_eligible p WHERE NOT EXISTS (
        SELECT 1 FROM source_quality_editions q WHERE q.city=p.city AND q.year=p.year)""")
    counts = records(db, f"""SELECT count(*) AS deduplicated,
      count(*) FILTER(WHERE {complete}) AS complete,
      count(*) FILTER(WHERE {complete} AND {increasing}) AS increasing,
      count(*) FILTER(WHERE {complete} AND {increasing} AND {plausible}) AS timing_eligible FROM paced""")[0]
    counts['eligible'] = db.execute('SELECT count(*) FROM eligible').fetchone()[0]
    counts['source_quality_excluded'] = counts['timing_eligible'] - counts['eligible']
    counts['raw'] = db.execute('SELECT count(*) FROM read_parquet(?)', [str(source / 'race_records.parquet')]).fetchone()[0]
    counts['duplicates_removed'] = counts['raw'] - counts['deduplicated']
    counts['missing_or_unparsed'] = counts['deduplicated'] - counts['complete']
    counts['non_increasing'] = counts['complete'] - counts['increasing']
    counts['outside_quality_bounds'] = counts['increasing'] - counts['timing_eligible']
    assert sum(counts[k] for k in ['duplicates_removed', 'missing_or_unparsed', 'non_increasing', 'outside_quality_bounds', 'source_quality_excluded', 'eligible']) == counts['raw']
    assert counts['eligible'] > 0
    sections = []
    for i, point in enumerate(POINTS):
        sections.append(f"SELECT city,race,year,gender,pattern,{point} AS distance,100*(p{i}/(t8/42.195)-1) AS relative FROM eligible")
    db.execute('CREATE TEMP VIEW sections AS ' + ' UNION ALL '.join(sections))
    # Every runner's distance-weighted normalized pace must integrate to zero.
    balance = ' + '.join(f'({POINTS[i]-(POINTS[i-1] if i else 0)})*(p{i}/(t8/42.195)-1)' for i in range(9))
    assert db.execute(f'SELECT max(abs({balance})) FROM eligible').fetchone()[0] < 1e-7
    return counts


class Publisher:
    def __init__(self, output, provenance, manifest, counts, live_as_of, common_method=None, script=None, source_quality=None):
        self.output, self.provenance, self.manifest = output, provenance, manifest
        self.counts, self.live_as_of = counts, live_as_of
        self.as_of = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
        self.packs = []
        self.common_method = COMMON_METHOD if common_method is None else common_method
        self.script = Path(script or __file__)
        self.source_quality = source_quality

    def publish(self, slug, question_id, title, answer, detail, methods, charts, tables, n, statistics=None):
        pack = 'ext_' + slug
        target = self.output / pack
        target.mkdir(parents=True, exist_ok=True)
        (target / 'tables').mkdir(exist_ok=True)
        for filename, rows in tables.items():
            if not rows:
                raise ValueError(f'No publishable observations for {pack}/{filename}')
            for row in rows:
                for key, value in row.items():
                    if isinstance(value, float) and not math.isfinite(value):
                        raise ValueError('Non-finite aggregate')
                    if key.startswith('n_') and value is not None and value < MIN_CELL:
                        raise ValueError('Insufficient observations for a chart estimate')
            with (target / 'tables' / filename).open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
        meta = {
            'schema_version': 1, 'id': pack, 'question_id': question_id, 'title': title,
            'status': 'ready', 'as_of': self.as_of, 'n': n,
            'input_export_id': self.provenance['release_tag'].replace('private-export-', 'private-'),
            'input_as_of': self.manifest['created_at'], 'live_json_as_of': self.live_as_of,
            'input_asset_sha256': self.provenance['asset_sha256'],
            'input_manifest_sha256': self.provenance['manifest_sha256'],
            'analysis_script_sha256': hashlib.sha256(self.script.read_bytes()).hexdigest(),
            'analysis_version': 1, 'engine': f'DuckDB {duckdb.__version__}',
            'corpus': manifest_corpus(self.manifest),
            'cohort': self.counts, 'methodology_prose': methods + self.common_method,
            'observational': True, 'minimum_public_cell': MIN_CELL,
        }
        if self.source_quality is not None:
            meta['source_quality'] = self.source_quality
            meta['source_quality_script_sha256'] = self.source_quality['script_sha256']
            if self.source_quality['reviewed_edition_policy']:
                meta['methodology_prose'] += [SOURCE_QUALITY_METHOD]
        summary = {'answer_prose': answer, 'detail_prose': detail, 'charts': charts, 'statistics': statistics or {}}
        for filename, data in [('pack_meta.json', meta), ('summary.json', summary)]:
            (target / filename).write_text(json.dumps(data, indent=2, allow_nan=False) + '\n')
        self.packs.append({'id':pack, 'n':n, 'question_id':question_id})


def manifest_corpus(manifest):
    """The release's own totals; pace-notes manifests (from October 21, 2026) name the edition count n_editions."""
    editions = manifest['n_race_years'] if 'n_race_years' in manifest else manifest['n_editions']
    return {'n_records': manifest['n_records'], 'n_cities': manifest['n_cities'], 'n_race_years': editions}


def run(source, output, live_as_of):
    db = duckdb.connect()
    db.execute("SET memory_limit='4GB'")
    db.execute('SET threads=2')
    manifest = json.loads((source / 'MANIFEST.json').read_text())
    provenance = json.loads((source / 'provenance.json').read_text())
    counts = prepare(db, source)
    assert counts['raw'] == manifest['n_records'], 'Manifest count does not match the archive'
    n = counts['eligible']
    pub = Publisher(output, provenance, manifest, counts, live_as_of, source_quality=source_quality_report(db, source))
    number = lambda v: f'{v:,.0f}'
    coverage = records(db, 'SELECT city,year,race,count(*) AS n FROM eligible GROUP BY ALL ORDER BY city,year,race')
    profile = records(db, f'''SELECT distance AS label,median(relative) AS value,count(*) AS n_value
        FROM sections GROUP BY distance HAVING count(*)>={MIN_CELL} ORDER BY distance''')
    patterns = records(db, f'''SELECT pattern AS label,count(*) AS count,100.0*count(*)/{n} AS value,{n} AS n_value
        FROM eligible GROUP BY pattern''')
    patterns.sort(key=lambda row:PATTERNS.index(row['label']))
    assert sum(row['count'] for row in patterns) == n
    assert abs(sum(row['value'] for row in patterns)-100)<1e-8
    largest = max(patterns, key=lambda row:row['value'])
    pub.publish('pacing_shapes', 'r10_unravel_typology', 'How do people actually pace a marathon?',
        f"The most common pattern is {largest['label'].lower()}: {largest['value']:.1f}% of eligible finishes. The full-course profile also shows how pace changes within those broad blocks.",
        f"Calculated directly from {number(n)} complete, plausible split records in the public export.",
        ['For each runner, divide section pace by their full-marathon average pace and subtract one. Plot the median of these individual percentages at each checkpoint; zero is that runner’s own marathon pace. A median curve is not itself one runner’s race and need not integrate to zero.',
         'Compare elapsed time over 0–20 km with 20–40 km. Faster: more than 2% faster; similar: within 2%; moderate slowing: more than 2% through 10%; pronounced slowing: more than 10%. The final 2.195 km appears in the profile but not this equal-distance classification. These are descriptive categories, not slowdown episodes or measured half-marathon splits.'],
        [chart('The typical pace profile', 'profile.csv', '% pace', kind='line', xNumeric=True, xLabel='Distance (km)', note='Median of individually normalized section paces. Below zero is faster than the runner’s own marathon average.'),
         chart('How the second 20 km compares with the first', 'patterns.csv', '%', note='The final 2.195 km is excluded from this equal-distance comparison.')],
        {'profile.csv':profile, 'patterns.csv':patterns}, n)
    course = records(db, f'''SELECT city,distance AS label,median(relative) AS value,count(*) AS n_value
        FROM sections GROUP BY city,distance HAVING count(*)>={MIN_CELL} ORDER BY city,distance''')
    course_n = sum(row['n_value'] for row in course if row['label']==5)
    pub.publish('course_pacing_profiles', 's3_course_breaks', 'What is each course’s pacing fingerprint?',
        'Courses have distinct recorded pacing profiles. Choose a city to see where runners tend to speed up or slow down relative to their own average.',
        f"Individual split profiles are available for {len(set(row['city'] for row in course))} cities with at least {MIN_CELL} eligible finishes each.",
        ['Compute individual section pace relative to each runner’s full-marathon average, then take the median by city and section. Every checkpoint within a city uses the same complete-record cohort.',
         'Cities pool available race editions. Terrain, weather, field composition and route changes are not separated. Course-profile validity years are absent from CORE, so historical elevation has not been assigned to these runners.'],
        [chart('Pace through the selected course', 'course_profiles.csv', '% pace', kind='line', xNumeric=True, xLabel='Distance (km)', filters=filter_for('city','Course','New York'), note='Every runner is normalized before aggregation. This is an observed city profile, not an elevation-adjusted pacing prescription.')],
        {'course_profiles.csv':course}, course_n)
    goals = []
    for target, label in [(180,'Under 3 hours'),(210,'Under 3:30'),(240,'Under 4 hours'),(270,'Under 4:30'),(300,'Under 5 hours')]:
        for km, time in [(20,'t3'),(30,'t5'),(40,'t7')]:
            row = records(db, f'''SELECT count(*) AS n_value,count(*) FILTER(WHERE t8<{target*60}) AS hits
              FROM eligible WHERE {time} BETWEEN {target*60*km/42.195*.99} AND {target*60*km/42.195*1.01}''')[0]
            if row['n_value'] >= MIN_CELL:
                goals.append({'target':label,'label':km,'value':100*row['hits']/row['n_value'],**row})
    reference = [r for r in goals if r['target']=='Under 3 hours']
    goal_answer = 'Being close to target pace at a checkpoint does not guarantee the target finish.'
    if len(reference)==3:
        goal_answer += f" Among runners close to sub-3 pace, {reference[0]['value']:.1f}% broke three hours at the 20 km check, versus {reference[2]['value']:.1f}% at 40 km."
    pub.publish('checkpoint_outcomes', 'r04_on_pace_goal_hits', 'Does being on pace mean you will hit your goal?',
        goal_answer, 'Each checkpoint selects a different group of runners.',
        ['On pace means elapsed time within ±1% of the target’s even-pace time at that checkpoint. A goal is achieved only when the finish is strictly under the target. Divide successes by all eligible on-pace finishes for that goal and checkpoint.',
         'This window includes runners just ahead of and just behind the target; it is narrower than the older core table’s time-budget definition. Results pool editions and are descriptive historical frequencies, not a validated personal forecast. Goals are inferred benchmarks, not runners’ declared intentions.'],
        [chart('Target achieved among runners close to target pace', 'goal_rates.csv', '%', xLabel='Checkpoint (km)', filters=filter_for('target','Finish target','Under 3 hours'))],
        {'goal_rates.csv':goals}, n)
    db.execute(f'''CREATE TEMP TABLE trend_cells AS SELECT city,year,race,floor(t3/60) AS minute20,trend20,
        count(*) AS n,avg(t8/60) AS mean_finish FROM eligible GROUP BY ALL HAVING count(*)>={MIN_MATCH}''')
    db.execute('''CREATE TEMP TABLE trend_matched AS SELECT city,year,race,minute20,min(n) AS weight,
        max(n) FILTER(WHERE trend20='Accelerating') AS n_accel,
        max(n) FILTER(WHERE trend20='Steady') AS n_steady,
        max(n) FILTER(WHERE trend20='Slowing') AS n_slow,
        max(mean_finish) FILTER(WHERE trend20='Accelerating') AS accel,
        max(mean_finish) FILTER(WHERE trend20='Steady') AS steady,
        max(mean_finish) FILTER(WHERE trend20='Slowing') AS slow
        FROM trend_cells GROUP BY ALL HAVING count(*)=3''')
    matched = records(db, '''SELECT sum(n_accel)::BIGINT AS n_accel,sum(n_steady)::BIGINT AS n_steady,sum(n_slow)::BIGINT AS n_slow,
        sum(weight*(accel-steady))/sum(weight) AS accel_diff,
        sum(weight*(slow-steady))/sum(weight) AS slow_diff,count(*) AS strata FROM trend_matched''')[0]
    if matched['strata']:
        trend_rows = [{'label':'Accelerating','value':matched['accel_diff'],'n_value':matched['n_accel']},
                      {'label':'Steady','value':0.,'n_value':matched['n_steady']},
                      {'label':'Slowing','value':matched['slow_diff'],'n_value':matched['n_slow']}]
        pub.publish('pace_trend_at_20k','r03_accel_vs_decel_20k','Can two runners reach 20 km together but have different prospects?',
            f"Yes, their recent pace trend carries additional information. In matched groups, accelerating runners finished {abs(matched['accel_diff']):.1f} minutes {'faster' if matched['accel_diff']<0 else 'slower'} than steady runners on average.",
            'The comparison holds the race edition and the one-minute 20 km time band constant.',
            ['Compare the 15–20 km pace with 10–15 km. Accelerating is more than 2% faster, slowing more than 2% slower, and steady within 2%. Match within city, year, race and the same floored minute of elapsed time at 20 km.',
             f'Only strata with at least {MIN_MATCH} finishes in each of the three groups qualify. Use the smallest group count as each stratum’s common weight for all three groups, then average the within-stratum finish-time differences versus steady. Sample counts are actual observations, not matching weights.',
             'Runners arrive within the same 60-second band, not at an identical instant. Prior fitness and runner intention are unknown. This is a conditional association, not proof that accelerating causes a better finish or an out-of-sample prediction.'],
            [chart('Finish-time difference versus steady runners', 'matched_trends.csv', 'min', note='Negative means a faster finish. All three groups use the same race and 20 km time distribution.')],
            {'matched_trends.csv':trend_rows}, sum(row['n_value'] for row in trend_rows), matched)
    db.execute(f'''CREATE TEMP TABLE ranked AS WITH sized AS (
      SELECT *,count(*) OVER(PARTITION BY city,year,race) AS field_n FROM eligible
    ) SELECT city,year,race,field_n,
      rank() OVER(PARTITION BY city,year,race ORDER BY t5)+(count(*) OVER(PARTITION BY city,year,race,t5)-1)/2.0 AS r30,
      rank() OVER(PARTITION BY city,year,race ORDER BY t8)+(count(*) OVER(PARTITION BY city,year,race,t8)-1)/2.0 AS rf
      FROM sized WHERE field_n>={MIN_CELL}''')
    assert db.execute('SELECT max(abs(balance)) FROM (SELECT sum(r30-rf) AS balance FROM ranked GROUP BY city,year,race)').fetchone()[0] < 1e-7
    rank_summary = records(db, '''SELECT count(*) AS n,100.0*avg((abs(r30-rf)/(field_n-1)>0.05)::INTEGER) AS moved,
      median(abs(r30-rf)) AS median_positions FROM ranked''')[0]
    rank_rows = records(db, '''WITH changes AS (SELECT *, CASE WHEN (r30-rf)/(field_n-1)>0.05 THEN 'Gained more than 5 percentile points'
      WHEN (r30-rf)/(field_n-1)<-0.05 THEN 'Lost more than 5 percentile points' ELSE 'Stayed within 5 percentile points' END AS change FROM ranked)
      SELECT change AS label,100.0*count(*)/(SELECT count(*) FROM ranked) AS value,
      (SELECT count(*) FROM ranked) AS n_value,count(*) AS count FROM changes GROUP BY change ORDER BY value DESC''')
    pub.publish('late_rank_changes','r06_decided_after_30k','How much of a marathon is decided after 30 km?',
        f"For {rank_summary['moved']:.1f}% of eligible finishes, relative ranking shifted by more than five percentile points between 30 km and the finish.",
        'These are changes in elapsed-time rankings, not a count of physical overtakes.',
        ['Rank the same complete-record finishers at 30 km and at the finish within each city, year and race. Ties receive their average rank. Positive rank change means gaining places; all signed changes sum to zero within each edition.',
         'Convert rank changes to percentile points using field size minus one. A five-point move corresponds to about 500 positions in a 10,000-person eligible field. Missing-split finishers and non-finishers are absent. Different start waves mean elapsed-time ranks cannot count physical passes.'],
        [chart('How much elapsed-time position changes after 30 km','rank_changes.csv','%')],
        {'rank_changes.csv':rank_rows}, rank_summary['n'], rank_summary)
    age_rows = records(db, f'''SELECT age_band AS label,gender,median(t3/20/60) AS opening,median(change20) AS retention,count(*) AS n_opening,count(*) AS n_retention
      FROM eligible WHERE age_band IS NOT NULL AND gender IN ('Women','Men') GROUP BY ALL HAVING count(*)>={MIN_CELL} ORDER BY gender,label''')
    age_n = sum(row['n_opening'] for row in age_rows)
    pub.publish('age_pacing','r22_aging_changes','How do speed and pace retention vary by age?',
        'Age groups differ in both opening speed and later pace retention. These records can describe those differences, but they cannot tell us which changes first as an individual ages.',
        f"This comparison uses {number(age_n)} finishes with an exact age and a recorded women’s or men’s category. Age-group-only records are excluded.",
        ['Use exact integer ages from 18 through 89, grouping 18–29 then ten-year bands. Do not infer exact ages from age-group labels. Report median 0–20 km pace and median percentage pace change from 0–20 to 20–40 km, separately by recorded gender.',
         'This is cross-sectional: different people, races and performance levels are being compared. Selection into marathons, missing ages, course and prior ability can explain part of the pattern. It is not an estimate of an individual’s aging trajectory.'],
        [chart('Opening 20 km pace by age','age_pacing.csv','min/km',series=[{'key':'opening','label':'Median opening pace'}],xLabel='Exact age group',filters=filter_for('gender','Recorded gender','Women')),
         chart('Pace retention by age','age_pacing.csv','% pace',series=[{'key':'retention','label':'Second 20 km versus first'}],xLabel='Exact age group',filters=filter_for('gender','Recorded gender','Women'),note='Negative means the second 20 km was faster.')],
        {'age_pacing.csv':age_rows},age_n)
    gender_rows = records(db, f'''SELECT gender AS label,avg(change20) AS value,count(*) AS n_value
      FROM eligible WHERE gender IN ('Women','Men') GROUP BY gender HAVING count(*)>={MIN_CELL} ORDER BY gender''')
    db.execute(f'''CREATE TEMP TABLE gender_cells AS SELECT city,year,race,floor(t3/60) AS minute20,gender,count(*) AS n,avg(change20) AS pace_change
      FROM eligible WHERE gender IN ('Women','Men') GROUP BY ALL HAVING count(*)>={MIN_MATCH}''')
    db.execute('''CREATE TEMP TABLE gender_matched AS SELECT city,year,race,minute20,min(n) AS weight,
      max(n) FILTER(WHERE gender='Women') AS n_women,max(n) FILTER(WHERE gender='Men') AS n_men,
      max(pace_change) FILTER(WHERE gender='Women') AS women,max(pace_change) FILTER(WHERE gender='Men') AS men
      FROM gender_cells GROUP BY ALL HAVING count(*)=2''')
    gender = records(db, '''SELECT sum(weight*women)/sum(weight) AS women,sum(weight*men)/sum(weight) AS men,
      sum(n_women)::BIGINT AS n_women,sum(n_men)::BIGINT AS n_men,count(*) AS strata FROM gender_matched''')[0]
    if gender['strata']:
        matched_gender = [{'label':'Women','value':gender['women'],'n_value':gender['n_women']},{'label':'Men','value':gender['men'],'n_value':gender['n_men']}]
        pub.publish('gender_pacing','r23_gender_pacing','How does pacing differ across recorded gender groups?',
            f"After matching race edition and opening 20 km time, average second-20-km pace change is {gender['women']:.1f}% for women and {gender['men']:.1f}% for men.",
            'Matching the opening performance makes the comparison more specific, but does not establish why the difference exists.',
            ['Compare average percentage change from the first 20 km to the second 20 km. The pooled chart uses all eligible women’s and men’s records. The matched chart uses only race-edition and one-minute 20 km strata containing at least 20 finishes in each category.',
             'Use the smaller category count as a common stratum weight. Thus both matched estimates have the same race and opening-time distribution. Opening time is an observed race performance, not an independent measure of prior fitness. Age, experience and other factors remain uncontrolled.',
             'The export field is sex; labels follow its recorded categories. Other or missing categories remain in the overall pacing analyses but are not included in this two-category comparison.'],
            [chart('Pooled pace change','gender_pooled.csv','% pace',note='All eligible finishes in each recorded category.'),
             chart('Pace change after matching the race and opening time','gender_matched.csv','% pace',note='A different, matched subset with a common distribution of race editions and 20 km times.')],
            {'gender_pooled.csv':gender_rows,'gender_matched.csv':matched_gender},gender['n_women']+gender['n_men'],gender)
    annual = records(db, f'''SELECT city,year AS label,median(t3/20/60) AS opening,median(change20) AS retention,count(*) AS n_opening,count(*) AS n_retention
      FROM eligible GROUP BY city,year HAVING count(*)>={MIN_CELL} ORDER BY city,year''')
    years_per_city = {row['city']:sum(1 for r in annual if r['city']==row['city']) for row in annual}
    annual = [row for row in annual if years_per_city[row['city']]>=3]
    pub.publish('pacing_over_time','r26_pacing_over_20y','How have marathon speed and pacing changed over time?',
        'Opening speed and the ability to hold that pace are different trends. Track both within a city to see whether a faster year also had less slowing.',
        'The charts show observed yearly medians; they do not isolate changes in training, shoes or fueling.',
        ['For each city and year, calculate median first-20-km pace and median percentage pace change from the first 20 km to the second. Show city-years with at least 100 eligible finishes, and cities with at least three available years.',
         'The same cities, runners and course versions are not represented every year. Choose a city to avoid pooling changing city coverage into one global trend. Even within a city, field composition, route changes and conditions remain uncontrolled. Gaps are years without publishable data, not interpolated observations.'],
        [chart('Opening speed over time','yearly_pacing.csv','min/km',series=[{'key':'opening','label':'Median opening pace'}],kind='line',xNumeric=True,xLabel='Race year',filters=filter_for('city','Course','New York')),
         chart('Pace retention over time','yearly_pacing.csv','% pace',series=[{'key':'retention','label':'Second 20 km versus first'}],kind='line',xNumeric=True,xLabel='Race year',filters=filter_for('city','Course','New York'),note='A lower value means less slowing; negative means a faster second 20 km.')],
        {'yearly_pacing.csv':annual},sum(row['n_opening'] for row in annual))
    report = {'cohort':counts,'packs':pub.packs,'source_editions_with_eligible_records':len(coverage),
              'validation':{'exclusion_counts_reconcile':True,'individual_normalization_integrates_to_zero':True,'rank_changes_sum_to_zero':True,'pattern_shares_sum_to_100':True}}
    # Audit belongs alongside extension packs, not in the core INDEX or live.json.
    (output / 'ext_pacing_shapes' / 'summary.json').write_text(json.dumps({**json.loads((output / 'ext_pacing_shapes' / 'summary.json').read_text()), 'audit':report}, indent=2) + '\n')
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--live-as-of',required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    run(args.input.resolve(),args.output.resolve(),args.live_as_of)


if __name__ == '__main__':
    main()
