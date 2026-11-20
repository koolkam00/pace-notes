"""Edition-balanced pacing comparisons without an earlier-finish requirement.

Only the marathon cohort's counted records (the published runner records until
November 19, 2026) and matching verified context are inputs. Each outcome is descriptive; weather, early pace and current-route
terrain are neither randomized exposure nor a basis for adjusted finish times.
"""
import argparse
from datetime import datetime, timezone
import gzip
import json
import math
from pathlib import Path
import re

import numpy as np

from build_fast_start import (
    AGE, AGE_BANDS, BAND, BANDS, CITY, EDITION, FINISH, GENDER, GENDERS,
    LATE, ONSET, PACE, POINTS, REMAINDER, digest, encode, require, rounded,
    verified_manifest,
)
from build_fast_start_all import ACTUAL_FINISH, read_observations


MIN_CELL, MIN_EDITION, MIN_EDITIONS = 100, 20, 3
PACE_EPSILON = 1e-8
EARLY_PACE_BANDS = [
    dict(id='all', lower_s_per_km=None, upper_s_per_km=None),
    dict(id='under270', lower_s_per_km=None, upper_s_per_km=270),
    dict(id='270to330', lower_s_per_km=270, upper_s_per_km=330),
    dict(id='330to390', lower_s_per_km=330, upper_s_per_km=390),
    dict(id='390plus', lower_s_per_km=390, upper_s_per_km=None),
]
TEMPERATURE_BANDS = [
    dict(id='under5', label='Below 5°C', lower_c=None, upper_c=5),
    dict(id='5to10', label='5 to below 10°C', lower_c=5, upper_c=10),
    dict(id='10to15', label='10 to below 15°C', lower_c=10, upper_c=15),
    dict(id='15to20', label='15 to below 20°C', lower_c=15, upper_c=20),
    dict(id='20plus', label='20°C or warmer', lower_c=20, upper_c=None),
]


def early_pace_codes(observations):
    """Half-open same-race early pace bands, without selecting on finish time.

    Finish minus its even-pace difference recovers the original 5–20 km
    baseline. Snap only binary arithmetic noise at an exact boundary; source
    times are millisecond-resolution, far wider than this 1e-8 s/km tolerance.
    """
    baseline = (observations[:, ACTUAL_FINISH]-observations[:, FINISH])/42.195
    for boundary in (270, 330, 390):
        baseline[np.abs(baseline-boundary) <= PACE_EPSILON] = boundary
    return np.searchsorted([270, 330, 390], baseline, side='right')+1


def temperature_code(value):
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return int(np.searchsorted([5, 10, 15, 20], value, side='right'))


def terrain_code(terrain):
    """A fixed descriptive supplied-route category; unknown is never flat."""
    if terrain is None:
        return None
    sections = terrain.get('sections')
    require(isinstance(sections, list) and len(sections) == 9, 'Invalid terrain sections')
    opening = sections[0]
    require(opening['start_km'] == 0 and opening['end_km'] == 5, 'Invalid terrain opening span')
    net = opening.get('net_m')
    require(isinstance(net, (int, float)) and math.isfinite(net), 'Missing terrain net change')
    return 'downhill' if net < -25 else 'other'


def verified_context(context_root, runner_manifest, runner_hash, script_root):
    raw = (context_root/'manifest.json').read_bytes()
    manifest = json.loads(raw)
    for field in ('release_tag', 'input_as_of', 'input_asset_sha256', 'input_manifest_sha256',
                  'cohort', 'source_quality'):
        require(manifest[field] == runner_manifest[field], f'Context {field} mismatch')
    require(manifest['runner_manifest_sha256'] == runner_hash, 'Context runner binding mismatch')
    require(manifest['runner_manifest_as_of'] == runner_manifest['as_of'], 'Context runner time mismatch')
    # The context binds the marathon cohort (since November 19, 2026): one file per counted edition with peers, weather or
    # terrain, keyed by the cohort manifest's edition index; a counted edition without one is listed with its finishes.
    require(manifest.get('cohort_manifest_sha256') == runner_hash, 'Context cohort binding mismatch')
    without = {str(item['index']): item for item in manifest['editions_without_context']}
    require(manifest['totals']['eligible'] + sum(item['eligible_n'] for item in without.values()) == runner_manifest['eligible_records'],
            'Context eligible mismatch')
    for name, expected in manifest['scripts'].items():
        require(re.fullmatch(r'[a-z_]+\.py', name) is not None, 'Invalid context script name')
        require(digest((script_root/name).read_bytes()) == expected, f'Context script mismatch: {name}')
    counted = {str(i) for i, e in enumerate(runner_manifest['editions']) if e['use'] == 'counted'}
    require(set(manifest['editions']) | set(without) == counted and not set(manifest['editions']) & set(without),
            'Context edition coverage mismatch')
    contexts = []
    for index, entry in enumerate(runner_manifest['editions']):
        edition = dict(city=entry['city'], year=entry['year'], race=entry['race'])
        item = manifest['editions'].get(str(index))
        if item is None:
            # An own-record edition (no counted finish) or a counted edition with nothing to compare: no weather or terrain.
            contexts.append(dict(index=index, **edition, eligible_n=entry['eligible'], temperature=None, terrain=None,
                                 temp_c=None, opening_net_m=None))
            continue
        require(item['file'] == f'editions/{index:03d}.json.gz', 'Invalid context shard path')
        compressed = (context_root/item['file']).read_bytes()
        require(len(compressed) == item['bytes'] and digest(compressed) == item['sha256'],
                f'Context checksum/size mismatch: {index}')
        shard = json.loads(gzip.decompress(compressed))
        require(shard['release_tag'] == manifest['release_tag'], 'Context shard release mismatch')
        require(shard['edition'] == dict(index=index, **edition), 'Context edition identity mismatch')
        weather = shard['weather']
        if weather is not None:
            require(weather['city'] == edition['city'] and weather['year'] == edition['year'],
                    'Weather edition mismatch')
            require(temperature_code(weather['temp_c']) is not None, 'Invalid weather temperature')
            require(weather['personal_exposure'] is False, 'Unexpected personal weather exposure claim')
        terrain = shard['terrain']
        contexts.append(dict(index=index, city=edition['city'], year=edition['year'], race=edition['race'],
                             eligible_n=shard['eligible_n'], temperature=temperature_code(weather['temp_c'])
                             if weather is not None else None, terrain=terrain_code(terrain),
                             temp_c=weather['temp_c'] if weather is not None else None,
                             opening_net_m=terrain['sections'][0]['net_m'] if terrain is not None else None))
    return contexts, manifest, digest(raw)


def summarize_edition(selected, index, context, min_edition=MIN_EDITION):
    if len(selected) < min_edition:
        return None
    quantiles = np.quantile(selected[:, [LATE, REMAINDER, *range(PACE, PACE+9)]],
                            [.1, .5, .9], axis=0, method='linear')
    onset = np.array([np.count_nonzero(selected[:, ONSET] == start) for start in (20, 25, 30, 35)])
    return dict(index=int(index), city=context['city'], temperature=context['temperature'], terrain=context['terrain'],
                n=len(selected), detected_n=int(onset.sum()), onset=onset,
                slowdown_pct=100*onset.sum()/len(selected), late_pct=quantiles[1, 0],
                late_spread_pct=quantiles[2, 0]-quantiles[0, 0], after20_delta_s=quantiles[1, 1],
                profile_pct=quantiles[1, 2:], finishes=selected[:, ACTUAL_FINISH])


def combine_editions(editions, identity, min_cell=MIN_CELL, min_editions=MIN_EDITIONS):
    """Equal edition weights for associations; explicitly pooled finish/onset context."""
    n = sum(item['n'] for item in editions)
    if n < min_cell or len(editions) < min_editions:
        return None
    detected_n = sum(item['detected_n'] for item in editions)
    onset = np.sum([item['onset'] for item in editions], axis=0)
    require(int(onset.sum()) == detected_n, 'Onset denominator mismatch')
    result = dict(identity, n=n, edition_n=len(editions), city_n=len({item['city'] for item in editions}),
                  edition_indices=sorted(item['index'] for item in editions), detected_n=detected_n,
                  onset_n=[int(value) for value in onset] if detected_n >= min_cell else None,
                  onset_pct=[rounded(100*value/detected_n) for value in onset] if detected_n >= min_cell else None,
                  actual_finish_median_s=rounded(np.median(np.concatenate([item['finishes'] for item in editions]))),
                  profile_pct=[rounded(value) for value in np.mean([item['profile_pct'] for item in editions], axis=0)])
    for field in ('slowdown_pct', 'late_pct', 'late_spread_pct', 'after20_delta_s'):
        result[field] = rounded(np.mean([item[field] for item in editions]))
    for output, field in [('slowdown_spread_pct', 'slowdown_pct'), ('late_edition_spread_pct', 'late_pct')]:
        result[output] = [rounded(value) for value in np.quantile([item[field] for item in editions], [.1, .9])]
    return result


def row_groups(selected, contexts, min_cell=MIN_CELL, min_edition=MIN_EDITION, min_editions=MIN_EDITIONS):
    summaries, openings = [], {key: [] for key in range(len(BANDS))}
    for index in np.unique(selected[:, EDITION]).astype(int):
        edition_rows = selected[selected[:, EDITION] == index]
        summary = summarize_edition(edition_rows, index, contexts[index], min_edition)
        if summary is not None:
            summaries.append(summary)
        if contexts[index]['terrain'] is not None:
            for opening in range(len(BANDS)):
                summary = summarize_edition(edition_rows[edition_rows[:, BAND] == opening], index,
                                            contexts[index], min_edition)
                if summary is not None:
                    openings[opening].append(summary)
    courses, weather, downhill, race_days = [], [], [], []
    for item in summaries:
        context = contexts[item['index']]
        group = combine_editions([item], dict(id=f"edition:{item['index']}",
                                  label=f"{context['city']} {context['year']} · {context['race']}",
                                  edition_index=item['index'], temp_c=context.get('temp_c'),
                                  opening_net_m=context.get('opening_net_m'),
                                  historical_route_verified=False), min_cell, 1)
        if group is not None:
            race_days.append(group)
    for city in sorted({item['city'] for item in summaries}):
        group = combine_editions([item for item in summaries if item['city'] == city],
                                 dict(id=city, label=city), min_cell, min_editions)
        if group is not None:
            courses.append(group)
    for band, spec in enumerate(TEMPERATURE_BANDS):
        group = combine_editions([item for item in summaries if item['temperature'] == band],
                                 spec, min_cell, min_editions)
        if group is not None:
            weather.append(group)
    for terrain in ('downhill', 'other'):
        for opening, spec in enumerate(BANDS):
            group = combine_editions([item for item in openings[opening] if item['terrain'] == terrain],
                                     dict(id=f"{terrain}:{spec['id']}",
                                          label=f"{'Downhill opening' if terrain == 'downhill' else 'Other supplied openings'}: {spec['label']}",
                                          terrain=terrain, opening=spec['id']), min_cell, min_editions)
            if group is not None:
                downhill.append(group)
    return dict(courses=courses, weather=weather, downhill=downhill, editions=race_days)


def aggregate(observations, cities, contexts, min_cell=MIN_CELL, min_edition=MIN_EDITION, min_editions=MIN_EDITIONS):
    rows = []
    for city, name in enumerate(cities):
        city_rows = observations if city == 0 else observations[observations[:, CITY] == city]
        if len(city_rows) < min_cell:
            continue
        for age, age_name in enumerate(AGE_BANDS):
            age_rows = city_rows if age == 0 else city_rows[city_rows[:, AGE] == age]
            if len(age_rows) < min_cell:
                continue
            for gender, gender_name in enumerate(GENDERS):
                gender_rows = age_rows if gender == 0 else age_rows[age_rows[:, GENDER] == gender]
                if len(gender_rows) < min_cell:
                    continue
                codes = early_pace_codes(gender_rows)
                for pace, spec in enumerate(EARLY_PACE_BANDS):
                    selected = gender_rows if pace == 0 else gender_rows[codes == pace]
                    if len(selected) < min_cell:
                        continue
                    groups = row_groups(selected, contexts, min_cell, min_edition, min_editions)
                    if any(groups.values()):
                        rows.append(dict(city=name, age=age_name, gender=gender_name, early_pace=spec['id'], **groups))
        print(json.dumps(dict(aggregated_city=name, rows=len(rows))), flush=True)
    return rows


def run(cohort_root, context_root, output, pin_path):
    script_root = Path(__file__).resolve().parent
    manifest, runner_hash = verified_manifest(cohort_root, json.loads(pin_path.read_bytes()), script_root)
    contexts, context_manifest, context_hash = verified_context(context_root, manifest, runner_hash, script_root)
    observations, cities = read_observations(cohort_root, manifest)
    for item in contexts:
        require(np.count_nonzero(observations[:, EDITION] == item['index']) == item['eligible_n'],
                f"Context eligible count mismatch: {item['index']}")
    eligible_contexts = [item for item in contexts if item['eligible_n']]
    coverage = dict(eligible_editions=len(eligible_contexts))
    for field in ('weather', 'terrain'):
        key = 'temperature' if field == 'weather' else 'terrain'
        available = [item for item in eligible_contexts if item[key] is not None]
        coverage[f'{field}_n'] = sum(item['eligible_n'] for item in available)
        coverage[f'{field}_editions'] = len(available)
    rows = aggregate(observations, cities, contexts)
    payload = dict(
        schema_version=1, mode='all-finishers', release_tag=manifest['release_tag'],
        input_as_of=manifest['input_as_of'], as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        input_asset_sha256=manifest['input_asset_sha256'], input_manifest_sha256=manifest['input_manifest_sha256'],
        runner_manifest_sha256=runner_hash, runner_manifest_as_of=manifest['as_of'], cohort_manifest_sha256=runner_hash,
        context_manifest_sha256=context_hash, context_manifest_as_of=context_manifest['as_of'],
        scripts={name: digest((script_root/name).read_bytes()) for name in
                 ('build_all_finisher_context.py', 'build_fast_start_all.py', 'build_fast_start.py')},
        source_scripts=manifest['scripts'], context_source_scripts=context_manifest['scripts'],
        engine=f'NumPy {np.__version__}', cohort=manifest['cohort'], source_quality=manifest['source_quality'],
        raw_records=manifest['raw_records'], eligible_records=manifest['eligible_records'], analysis_n=len(observations),
        min_cell=MIN_CELL, min_edition=MIN_EDITION, min_editions=MIN_EDITIONS, min_race_day_cell=MIN_CELL,
        coverage=coverage,
        cities=cities, ages=AGE_BANDS, genders=GENDERS, early_pace_bands=EARLY_PACE_BANDS,
        temperature_bands=TEMPERATURE_BANDS, opening_bands=BANDS, points_km=POINTS,
        onset_starts_km=[20, 25, 30, 35], downhill_first5_net_below_m=-25,
        methodology_prose=[
            'Include every eligible recorded finish without any previous-result, identity-link or improvement requirement. Verify every edition file of the marathon cohort, record uniqueness, cohort/source policy, the exact cohort/context manifest binding, all context files and calculation source hashes.',
            'Calculate each exact course, recorded-age, recorded-gender and 5–20 km early-pace selection directly. Unknown demographics remain in All. The four early-pace bands have half-open 270, 330 and 390 seconds/km boundaries; a 1e-8 s/km tolerance removes binary recovery noise at exact boundaries. Early pace is observed within this race, not pre-race ability or a declared goal.',
            'Require 20 eligible finishes per exact edition/group before combining editions, then at least 100 finishes and three editions per displayed group. Sparse selections remain unavailable without broadening filters. Counts and coverage describe observed performances, not unique runners or all starters.',
            'The separate race-day view presents one recorded edition at a time and requires 100 finishes in its exact selection. Its metrics describe that single edition, so the across-edition three-edition minimum and between-edition spread interpretation do not apply.',
            'Give each included edition equal weight. Slowdown is the mean of edition percentages; late change, time after 20 km and section curves are means of edition medians. These are not pooled-runner rates or medians. Edition p10–p90 ranges show observed variation among edition summaries, not confidence intervals.',
            'Within-edition pacing spread is each edition’s 90th minus 10th percentile of individual late percentage changes, averaged equally across editions. It describes variability of late pacing, not repeatability of individuals, course-adjusted fitness or predicted finish times.',
            'Late change compares 30 km–finish pace with 5–20 km pace. After-20 km difference is actual elapsed time after 20 km minus 22.195 km at the 5–20 km reference pace. Section curves retain the nine recorded intervals relative to that baseline; separately summarized medians need not form one runner’s race. Actual finish median is pooled across included finishes solely to show field composition.',
            'Sustained slowdown remains at least 25% slower than 5–20 km pace for at least 5 km after 20 km, with 1e-12 ratio tolerance. The final 2.195 km cannot qualify alone. Pooled onset distributions use only detected finishes and require at least 100 detections; they have a different weighting and denominator from edition-balanced slowdown rates.',
            'Temperature is validated modeled weather at the supplied scheduled start, with fixed boundaries 5, 10, 15 and 20°C. Missing or rejected weather is omitted, never imputed; modeled conditions are not personal wave exposure. Weather comparisons can reflect course and field differences even after optional early-pace/course filtering.',
            'Opening terrain is the supplied current route’s first-5 km net change. The fixed descriptive downhill category is strictly below −25 m; other known openings include the exact boundary. No profile is treated as flat when missing. Historical route validity is unknown. The six opening bands compare first-5 km pace with the same race’s 5–20 km pace; the two ratios share a reference and do not measure effort or fitness.',
            'Course and weather comparisons describe eligible observed fields. Field composition, course selection, conditions, congestion, training and fitness remain confounded. They do not establish causal weather/terrain penalties, course difficulty rankings, an optimal pacing plan, an adjusted finish time or the chance of not finishing. Earlier-result views remain distinct analyses.',
        ], rows=rows,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    data = encode(payload)
    temporary = output.with_suffix('.tmp')
    temporary.write_bytes(data)
    temporary.replace(output)
    print(json.dumps(dict(analysis_n=len(observations), coverage=coverage, rows=len(rows),
                          groups=sum(sum(len(row[key]) for key in ('courses', 'weather', 'downhill', 'editions')) for row in rows),
                          bytes=len(data), sha256=digest(data), output=str(output))), flush=True)
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cohort', type=Path, default=Path(__file__).resolve().parent/'marathon-cohort')
    parser.add_argument('--context', type=Path, default=Path('public/data/runner-context'))
    parser.add_argument('--output', type=Path, default=Path('public/data/all-finisher-context/evidence.json'))
    parser.add_argument('--pin', type=Path, default=Path('analysis/release.json'))
    args = parser.parse_args()
    run(args.cohort, args.context, args.output, args.pin)
