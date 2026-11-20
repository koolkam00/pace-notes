"""The supporting study: how often sustained slowdown occurs and how it varies (adoption decision D26, 2026-11-14).

    python3 -s analysis/build_study.py --input <adapted FULL dir> --identity <identity.parquet> --output <fresh dir>
        [--cohort analysis/marathon-cohort]

It reads the adapted input, as the other pacing families do, and must reproduce the marathon cohort's counts, edition
policy and linkage exactly (analysis/cohort.py); the evidence names the cohort manifest's digest. Linked histories use
the identity file (analysis/build_identity.py). The history figure, which follows linked runners, is stored a second
time with runners followed over high_elite and high links alone (`high_links`, decision D38), for the table on
/methodology. Written by build_public_explorer.py with the runner lookup until November 19, 2026; the lookup is now the
lookup agents' and this file is the study's only builder. import_study.py verifies and imports it and writes
public/data/live.json.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import cohort as marathon_cohort
from build_pacing import prepare, records
from build_extended import prepare_history
from source_quality import source_quality_report

SCRIPTS = ['build_study.py', 'build_pacing.py', 'build_extended.py', 'source_quality.py', 'cohort.py']
# The tables and views prepare_history creates; dropped before it runs again on high links alone.
HISTORY_OBJECTS = [('TABLE', 'pairs'), ('TABLE', 'history'), ('TABLE', 'prior'), ('TABLE', 'linked'),
                   ('TABLE', 'weather'), ('VIEW', 'weather_raw'), ('TABLE', 'safe_ids'), ('TABLE', 'identity_keys'),
                   ('VIEW', 'canonical_raw'), ('VIEW', 'features')]


LENGTHS = [5, 5, 5, 5, 2.195]
STARTS = [20, 25, 30, 35, 40]
# Absorb binary subtraction roundoff, far below millisecond timing precision.
# Without this, e.g. 345/300 - 1 is slightly below the exact 15% boundary.
RATIO_EPSILON = 1e-12


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n').encode()


def threshold_sql(threshold, length):
    """Whole contiguous recorded sections; no interpolation at an onset."""
    conditions = []
    for start in range(5):
        distance = 0
        for end in range(start, 5):
            distance += LENGTHS[end]
            if distance + 1e-9 >= length:
                conditions.append('('+' AND '.join(f's{i}+{RATIO_EPSILON}>={threshold}' for i in range(start, end+1))+')')
                break
    return '('+' OR '.join(conditions)+')' if conditions else 'FALSE'


def prepare_slowdown(db):
    ratios = ','.join(f'p{i+4}/((t3-t0)/15)-1 AS s{i}' for i in range(5))
    db.execute('CREATE TEMP TABLE slowdown_ratios AS SELECT *, '+ratios+' FROM eligible')
    lengths = []
    for i in range(5):
        terms = ['CASE WHEN '+' AND '.join(f's{k}+{RATIO_EPSILON}>=0.25' for k in range(i,j+1))+f' THEN {LENGTHS[j]} ELSE 0 END' for j in range(i,5)]
        lengths.append('('+'+'.join(terms)+f') AS length{i}')
    db.execute('CREATE TEMP TABLE slowdown_runs AS SELECT *, '+','.join(lengths)+' FROM slowdown_ratios')
    onset = 'CASE '+' '.join(f'WHEN length{i}>=5 THEN {STARTS[i]}' for i in range(5))+' ELSE NULL END'
    distance = 'CASE '+' '.join(f'WHEN length{i}>=5 THEN length{i}' for i in range(5))+' ELSE NULL END'
    severity = '('+'+'.join(f'greatest(s{i},0)*{LENGTHS[i]}' for i in range(5))+')/22.195*100'
    db.execute(f'CREATE TEMP TABLE slowdown AS SELECT *,{threshold_sql(.25,5)} AS detected,{onset} AS onset,{distance} AS episode_km,{severity} AS severity FROM slowdown_runs')


def plot(title, rows, unit='%', series=None, **extra):
    return {'title':title, 'rows':rows, 'unit':unit, 'xLabel':'Group', 'series':series or [dict(key='value', label=title)], **extra}


def answer(title, text, method, charts, detail=''):
    return dict(title=title, answer=text, detail=detail, method=method, charts=charts, available=bool(charts))


def build_study(db, provenance):
    n = db.execute('SELECT count(*) FROM slowdown').fetchone()[0]
    hits = db.execute('SELECT count(*) FROM slowdown WHERE detected').fetchone()[0]
    rate = 100*hits/n
    definition = 'At least 25% slower than the 5–20 km reference pace for contiguous recorded sections totaling at least 5 km after 20 km. The final section is 2.195 km. Onset is a section boundary, not an exact moment.'
    rates = lambda group, where='true': records(db, f'''SELECT {group} AS label,100.0*avg(detected::INTEGER) AS value,count(*) AS n_value,sum(detected::INTEGER)::BIGINT AS successes FROM slowdown WHERE {where} GROUP BY ALL HAVING count(*)>=100 ORDER BY label''')
    city = rates('city')
    overview = answer('How often do runners experience sustained slowdown?', f'{rate:.1f}% of eligible finishes meet the sustained slowdown definition.', [definition, 'Use the same complete-split and reviewed edition-quality cohort as the main analyses. Missing age or gender alone does not remove a finish. Rates describe recorded finishes, not unique people or physiological causes.'], [plot('Sustained slowdown by course',city)], f'{hits:,} of {n:,} eligible finishes. The same runner may appear more than once.')
    timing_rows = records(db, 'SELECT onset AS label,count(*) AS episodes,count(*) AS n_value FROM slowdown WHERE detected GROUP BY onset ORDER BY onset')
    # All onset categories share the full detected-episode denominator.
    for row in timing_rows: row.update(value=100*row['episodes']/hits,n_value=hits)
    timing = answer('When do sustained slowdown episodes begin?', 'Detected episodes begin at different recorded sections. These boundaries locate the first qualifying section, not an exact onset.', [definition,'The denominator is finishes with a detected episode. Distances are not proof that distance predicts slowing better than elapsed time.'], [plot('First qualifying section starts at',timing_rows,xLabel='Distance (km)',xNumeric=True)])
    curves=[]
    for length in [5,10,15,20]:
        for threshold in [.10,.15,.20,.25,.30,.40,.50]:
            count=db.execute(f'SELECT sum(({threshold_sql(threshold,length)})::INTEGER) FROM slowdown_ratios').fetchone()[0]
            curves.append(dict(label=threshold*100,length=f'{length} km',value=100*count/n,n_value=n,count=count))
    figures=[dict(id='sensitivity',title='How much does the definition matter?',answer='Changing the amount or duration of slowing changes how many finishes qualify.',method=[definition,'Each curve uses the same eligible finishes. These are descriptive thresholds, not physiological cutoffs.'],charts=[plot('Slowdown threshold and frequency',curves,xLabel='Minimum slowdown (%)',kind='line',xNumeric=True,filters=[dict(key='length',label='Minimum distance',preferred='5 km')])])]
    ages=records(db, '''SELECT age_band AS label,gender,100.0*avg(detected::INTEGER) AS value,count(*) AS n_value FROM slowdown WHERE age_band IS NOT NULL GROUP BY ALL HAVING count(*)>=100 ORDER BY label,gender''')
    figures.append(dict(id='age',title='How does slowdown vary by recorded age?',answer='Age groups have different observed rates. Age, fitness, conditions and field composition are not separated.',method=['Use exact recorded ages from 18 through 89, in the displayed age bands. Missing ages remain missing. Every cell requires 100 finishes.'],charts=[plot('Sustained slowdown by age',ages,filters=[dict(key='gender',label='Recorded gender',preferred='Women')])]))
    prior=records(db, '''SELECT h.ability_band AS label,100.0*avg(s.detected::INTEGER) AS value,count(*) AS n_value FROM history h JOIN slowdown s USING(rid) GROUP BY ALL HAVING count(*)>=100 ORDER BY min(h.recent_best)''')
    pb=records(db, '''WITH best AS (SELECT uid,first(year ORDER BY t8,year,rid) AS best_year FROM linked GROUP BY uid) SELECT l.year-b.best_year AS label,100.0*avg(s.detected::INTEGER) AS value,count(*) AS n_value FROM linked l JOIN best b USING(uid) JOIN slowdown s USING(rid) WHERE l.year-b.best_year BETWEEN -9 AND 9 GROUP BY ALL HAVING count(*)>=100 ORDER BY label''')
    figures.append(dict(id='history',title='How does slowing compare with recorded performance?',answer='Earlier performance and the year of an observed best provide two different comparisons.',method=['The earlier-performance chart uses only the fastest eligible finish in the two strictly earlier calendar years.','The second chart is retrospective: select each candidate identity’s fastest eligible recorded finish, resolving ties by earliest year then record ID. Year zero includes that best. Unequal follow-up and selecting a best can explain the pattern; it is not a training effect or lifetime best.','Source identity groups pass ambiguity, gender, birth-year and duplicate-edition checks, but are not independently verified people.'],charts=[plot('Slowing by earlier recorded best',prior),plot('Years from a recorded personal best',pb,kind='line',xNumeric=True,xLabel='Years from recorded best')]))
    severity=records(db, '''SELECT CASE WHEN severity<10 THEN 'Below 10%' WHEN severity<25 THEN '10 to <25%' WHEN severity<40 THEN '25 to <40%' ELSE '40% or more' END AS label,count(*) AS count FROM slowdown GROUP BY ALL ORDER BY min(severity)''')
    for row in severity:row.update(value=100*row['count']/n,n_value=n)
    severity_answer=answer('How much do runners slow in the later sections?','The severity distribution describes average positive slowing across 20–42.195 km.', ['Average positive section slowing relative to the 5–20 km pace, weighted by section distance. Faster sections contribute zero. This differs from a sustained episode and is not a physiological diagnosis.'],[plot('Average positive late-race slowing',severity)])
    landmark=[]
    for minutes in [180,210,240]:
        before,after=db.execute('SELECT count(*) FILTER(WHERE t8>=? AND t8<?),count(*) FILTER(WHERE t8>=? AND t8<?) FROM slowdown',[minutes*60-60,minutes*60,minutes*60,minutes*60+60]).fetchone()
        landmark.append(dict(label=f'{minutes//60}:{minutes%60:02}',before=before,after=after,n_before=n,n_after=n))
    landmarks=answer('Do finishes cluster around time landmarks?','Compare the recorded finishes in the minute before and the minute after each milestone.', ['Half-open one-minute windows immediately before and after 3:00, 3:30 and 4:00. These counts use eligible complete finishes. They do not reveal declared goals or establish a psychological mechanism.'],[plot('Finishes beside common milestones',landmark,unit='finishes',series=[dict(key='before',label='Minute before'),dict(key='after',label='Minute after')])])
    return dict(**provenance,n=n,detected=hits,rate=rate,overview=overview,timing=timing,figures=figures,severity=severity_answer,landmarks=landmarks)


def history_figure(study):
    return next(figure for figure in study['figures'] if figure['id'] == 'history')


def run(source, output, identity, cohort_root):
    repository = Path(__file__).resolve().parent.parent
    pin = json.loads((repository/'analysis/release.json').read_text())
    base, base_sha = marathon_cohort.verified_manifest(cohort_root, pin, repository/'analysis')
    manifest = json.loads((source/'MANIFEST.json').read_text()); origin = json.loads((source/'provenance.json').read_text())
    from source_quality import REVIEWED_POLICIES
    assert origin['release_tag'] in REVIEWED_POLICIES, 'Review the new source and edition policy before adoption'
    assert origin['release_tag'] == base['release_tag'] and origin['manifest_sha256'] == base['input_manifest_sha256'], 'The cohort was built from another input'
    db = duckdb.connect(); db.execute("SET memory_limit='8GB'"); db.execute('SET threads=2')
    scratch = output.parent/'study-temp'; scratch.mkdir(parents=True, exist_ok=True)
    db.execute('SET temp_directory=?', [str(scratch)]); db.execute("SET max_temp_directory_size='4GB'")
    counts = prepare(db, source, keep_record_id=True)
    assert counts['raw'] == manifest['n_records'] and counts == base['cohort'], 'The input does not reproduce the cohort'
    quality = source_quality_report(db, source)
    assert quality == base['source_quality'], 'The edition policy is not the cohort\'s'
    # Free the record tables nothing reads again before the joins (unique_records stays: prepare_history reads it twice).
    for table in ['timing_eligible', 'paced', 'parsed']:
        db.execute(f'DROP TABLE {table}')
    linkage = prepare_history(db, source, identity)
    db.execute('DROP TABLE candidate_links')
    assert linkage['canonical_id_contract_verified']
    assert linkage['linked_eligible_finishes'] == base['linkage']['counted_records_with_a_runner'] \
        and linkage['recent_benchmark_finishes'] == base['linkage']['recent_benchmark_finishes'], 'The linked histories are not the cohort\'s'
    prepare_slowdown(db)
    provenance = dict(schema_version=1, release_tag=origin['release_tag'], input_as_of=manifest['created_at'],
                      as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
                      input_asset_sha256=origin['asset_sha256'], input_manifest_sha256=origin['manifest_sha256'],
                      cohort_manifest_sha256=base_sha, cohort_manifest_as_of=base['as_of'],
                      cohort=counts, source_quality=quality, linkage=linkage,
                      scripts={name: hashlib.sha256((Path(__file__).parent/name).read_bytes()).hexdigest() for name in SCRIPTS})
    study = build_study(db, provenance)
    # The same history figure with runners followed over high_elite and high links alone (decision D38).
    for kind, name in HISTORY_OBJECTS:
        db.execute(f'DROP {kind} IF EXISTS {name}')
    high = prepare_history(db, source, identity, high_only=True)
    assert high['recent_benchmark_finishes'] == base['linkage']['high_links']['recent_benchmark_finishes'] \
        and high['linked_eligible_finishes'] == base['linkage']['high_links']['counted_records_with_a_runner'], 'The high-link histories are not the cohort\'s'
    study['high_links'] = dict(rule='Runners followed over the records whose link tier is high_elite or high only (decision D38).',
                               linkage=high, history=history_figure(build_study(db, provenance)))
    (output/'study').mkdir(parents=True, exist_ok=True)
    (output/'study/evidence.json').write_bytes(encode(study))
    print(json.dumps({'study_n': study['n'], 'detected': study['detected'], 'rate': study['rate'],
                      'history_n': linkage['recent_benchmark_finishes'], 'high_history_n': high['recent_benchmark_finishes']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--identity', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cohort', type=Path, default=Path(__file__).resolve().parent/'marathon-cohort')
    args = parser.parse_args()
    run(args.input, args.output, args.identity, args.cohort)
