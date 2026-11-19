"""Describe quick openings and later outcomes for every eligible recorded finish.

The reference is the same race's 5–20 km pace, so no earlier performance or
cross-race identity is required. This is descriptive within-race arithmetic,
not measured fitness or a causal estimate of a different pacing strategy.
"""
import argparse
from array import array
from datetime import datetime, timezone
from decimal import Decimal
import gzip
import json
import math
from pathlib import Path
import re

import numpy as np

from build_fast_start import (
    AGE, AGE_BANDS, BAND, BANDS, CITY, EDITION, FINISH, GENDER, GENDERS,
    LATE, LENGTHS, MIN_CELL, ONSET, OPENING, PACE, PACE_BOUND_EPSILON,
    POINTS, PRIOR, RATIO_EPSILON, REMAINDER, WIDTH as BASE_WIDTH,
    age_code, digest, encode, gender_code, require, rounded,
    summarize_group as summarize_base_group, verified_manifest,
)


ACTUAL_FINISH = BASE_WIDTH
WIDTH = BASE_WIDTH + 1
REFERENCE = dict(opening_km=5, baseline_start_km=5, baseline_end_km=20)


def opening_band_for_times(first5_seconds, at20_seconds):
    """Classify exact source-decimal ratios, including exact boundary values.

    The opening / baseline pace ratio is 3*t5 / (t20-t5). Subtract Decimal
    source values before cross-multiplication; binary subtraction before this
    step can move an exactly-on-boundary result into the neighboring band.
    """
    first = Decimal(str(first5_seconds))
    at20 = Decimal(str(at20_seconds))
    require(first.is_finite() and at20.is_finite() and 0 < first < at20,
            'Opening and 20 km times must be finite, positive and increasing')
    left, middle = 300*first, at20-first
    if left < 90*middle:
        return 0
    if left < 95*middle:
        return 1
    if left < 98*middle:
        return 2
    if left <= 102*middle:
        return 3
    if left <= 105*middle:
        return 4
    return 5


def observation(race, city):
    """Calculate an eligible race independently of any other race or history."""
    require(race['eligible'] is True, 'Only eligible finishes can supply outcomes')
    times = race['times']
    require(len(times) == 9 and all(isinstance(t, (float, int)) and math.isfinite(t) for t in times),
            'Eligible race must have nine finite checkpoint times')
    require(5400 <= times[-1] <= 43200 and 0 < times[0]
            and all(a < b for a, b in zip(times, times[1:])),
            'Eligible race violates the timing contract')
    durations = [times[0], *[b-a for a, b in zip(times, times[1:])]]
    paces = [duration/length for duration, length in zip(durations, LENGTHS)]
    require(all(120-PACE_BOUND_EPSILON <= pace <= 1200+PACE_BOUND_EPSILON for pace in paces),
            'Eligible race violates section pace bounds')
    baseline = (times[3]-times[0])/15
    onset = next((20+5*i for i in range(4)
                  if paces[i+4]/baseline-1+RATIO_EPSILON >= .25), -1)
    reference_finish = baseline*42.195
    finish_delta = times[-1]-reference_finish
    opening_delta = times[0]-baseline*5
    # 5–20 km defines the reference and therefore contributes zero difference.
    # This remaining difference is specifically the elapsed time after 20 km.
    after20_delta = times[-1]-times[3]-baseline*22.195
    require(abs(finish_delta-opening_delta-after20_delta) < 1e-8,
            'Opening and after-20 km time differences do not reconcile')
    late = 100*((times[-1]-times[5])/12.195/baseline-1)
    return [city, age_code(race['age']), gender_code(race['sex']), 0,
            race['edition'], opening_band_for_times(times[0], times[3]),
            finish_delta, opening_delta, after20_delta, onset, late,
            *[100*(pace/baseline-1) for pace in paces], times[-1]]


def profile_observations(races, edition_cities):
    """Include every eligible race, even a profile containing a single race."""
    for race in races:
        if race['eligible']:
            yield observation(race, edition_cities[race['edition']])


def read_observations(cohort_root, manifest):
    """Every counted record of the marathon cohort (analysis/cohort.py, which checks each file against the cohort
    manifest; the runner shards until November 19, 2026), with record-ID uniqueness, before aggregating."""
    import cohort as marathon_cohort
    arrays, read, _ = marathon_cohort.load(cohort_root)
    require(read['as_of'] == manifest['as_of'], 'The cohort changed while it was read')
    editions = manifest['editions']
    cities = ['All courses', *sorted({edition['city'] for edition in editions if edition['use'] == 'counted'})]
    city_codes = {city: i for i, city in enumerate(cities)}
    edition_cities = [city_codes.get(edition['city'], -1) for edition in editions]
    n = len(arrays['record_id'])
    require(n == manifest['eligible_records'], 'Eligible record count does not reconcile')
    ordered = np.sort(arrays['record_id'])
    require(n > 0 and ordered[0] > 0 and bool(np.all(np.diff(ordered) > 0)), 'Duplicate or invalid record IDs')
    sexes = {b'M': 'M', b'F': 'F', b'X': 'X', b'-': None}
    data = array('d')
    for k in range(n):
        age = float(arrays['age'][k])
        race = dict(eligible=True, edition=int(arrays['edition'][k]), times=[float(x) for x in arrays['times'][k]],
                    age=None if math.isnan(age) else age, sex=sexes[bytes(arrays['sex'][k])])
        data.extend(observation(race, edition_cities[race['edition']]))
    require(len(data)//WIDTH == n, 'All-eligible observation count does not reconcile')
    print(json.dumps(dict(verified_eligible=n, analysis_n=len(data)//WIDTH)), flush=True)
    return np.frombuffer(data, dtype=np.float64).reshape((-1, WIDTH)), cities


def summarize_group(selected, band, min_cell=MIN_CELL):
    group = summarize_base_group(selected[:, :BASE_WIDTH], band, min_cell)
    if group is None:
        return None
    after20 = np.quantile(selected[:, REMAINDER], [.1, .5, .9], method='linear')
    group.update(after20_delta_p10_s=rounded(after20[0]),
                 after20_delta_median_s=rounded(after20[1]),
                 after20_delta_p90_s=rounded(after20[2]),
                 actual_finish_median_s=rounded(np.median(selected[:, ACTUAL_FINISH])))
    return group


def aggregate(observations, cities, min_cell=MIN_CELL):
    """Exact course/age/gender roll-ups; never condition on the final outcome."""
    rows = []
    for city, city_name in enumerate(cities):
        city_rows = observations if city == 0 else observations[observations[:, CITY] == city]
        if len(city_rows) < min_cell:
            continue
        for age, age_name in enumerate(AGE_BANDS):
            age_rows = city_rows if age == 0 else city_rows[city_rows[:, AGE] == age]
            if len(age_rows) < min_cell:
                continue
            for gender, gender_name in enumerate(GENDERS):
                selected = age_rows if gender == 0 else age_rows[age_rows[:, GENDER] == gender]
                if len(selected) < min_cell:
                    continue
                groups = [group for band in range(len(BANDS))
                          if (group := summarize_group(selected[selected[:, BAND] == band], band, min_cell))]
                if groups:
                    rows.append(dict(city=city_name, age=age_name, gender=gender_name,
                                     prior='all', groups=groups))
        print(json.dumps(dict(aggregated_city=city_name, published_cohorts=len(rows))), flush=True)
    return rows


def run(cohort_root, output, pin_path):
    script_root = Path(__file__).resolve().parent
    manifest, manifest_hash = verified_manifest(cohort_root, json.loads(pin_path.read_bytes()), script_root)
    observations, cities = read_observations(cohort_root, manifest)
    rows = aggregate(observations, cities)
    analysis_n = len(observations)
    history_n = manifest['linkage']['recent_benchmark_finishes']
    payload = dict(
        schema_version=1, mode='all-finishers', release_tag=manifest['release_tag'],
        input_as_of=manifest['input_as_of'],
        as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        input_asset_sha256=manifest['input_asset_sha256'], input_manifest_sha256=manifest['input_manifest_sha256'],
        runner_manifest_sha256=manifest_hash, runner_manifest_as_of=manifest['as_of'], cohort_manifest_sha256=manifest_hash,
        scripts={name: digest((script_root/name).read_bytes())
                 for name in ('build_fast_start_all.py', 'build_fast_start.py')},
        source_scripts=manifest['scripts'], engine=f'NumPy {np.__version__}',
        cohort=manifest['cohort'], linkage=manifest['linkage'], source_quality=manifest['source_quality'],
        raw_records=manifest['raw_records'], eligible_records=manifest['eligible_records'],
        analysis_n=analysis_n, history_n=history_n,
        eligible_without_prior_n=manifest['eligible_records']-history_n,
        min_cell=MIN_CELL, reference=REFERENCE, points_km=POINTS,
        onset_starts_km=[20, 25, 30, 35], bands=BANDS, cities=cities,
        ages=AGE_BANDS, genders=GENDERS, prior_bands=['all'],
        methodology_prose=[
            'Verify every edition file\'s checksum and size against the marathon cohort\'s manifest, the cohort\'s calculation '
            'hashes, record uniqueness and the eligible count. '
            'Include every eligible finish independently of earlier history or cross-race identity. '
            'History counts are source provenance only and do not select this analysis cohort.',
            'Use actual recorded timings only. Held, incomplete and invalid timings cannot supply outcomes. '
            'Counts describe race performances, not unique runners. Missing demographics do not exclude '
            'an otherwise eligible finish from All.',
            'Opening change is 100 × ((first 5 km elapsed time / 5) / ((20 km elapsed time − 5 km elapsed time) / 15) − 1). '
            'The first section is excluded from its 5–20 km comparison baseline. Six fixed percentage bands '
            'describe opening pace relative to later early-race pace, not verified fitness or a physiological '
            'threshold for starting too fast. Exact decimal source-time subtraction and cross-products classify '
            'boundaries without rounding recorded times.',
            'The primary time outcome is elapsed time after 20 km minus 22.195 times the 5–20 km baseline pace. '
            'It does not reuse the first 5 km in the outcome. Its 10th, 50th and 90th percentiles describe '
            'individual observed differences, not confidence intervals, predicted finish times or causal losses.',
            'A whole-marathon even-pace reference is 42.195 times that same 5–20 km pace. Finish difference '
            'is actual finish minus this reference. Opening difference is actual first 5 km minus 5 times '
            'the baseline pace. The after-20 km difference is the remaining difference: their means sum '
            'to mean finish difference because the baseline section contributes zero by construction. '
            'This is signed arithmetic accounting, not an attainable alternative finish.',
            'Section curves show the median of individual section pace differences from each race’s '
            '5–20 km baseline. Separate section medians need not form a single race or add to a median finish. '
            'Late pace change compares 30 km–finish with that same baseline. The actual finish median '
            'describes each group without selecting runners by their final times.',
            'Sustained slowdown means at least 25% slower than the 5–20 km baseline for contiguous '
            'recorded sections totaling at least 5 km after 20 km, with a 1e−12 ratio rounding tolerance. '
            'The final 2.195 km cannot qualify alone. First qualifying sections start at 20, 25, 30 or 35 km. '
            'The rate denominator is every eligible finish in the displayed opening group; onset shares '
            'use only detected finishes. Timing mats locate a section, not the exact instant of slowing.',
            'Course, exact-age band and recorded-gender roll-ups are recalculated directly from their '
            'records. There is no earlier-time, target-time or current-finish filter. Unknown demographics '
            'remain in All, with no invented subgroup. Each opening group needs at least 100 finishes; '
            'onset distributions additionally need at least 100 detected finishes. Sparse filters are '
            'unavailable and never silently broadened.',
            'This method identifies a quick first section relative to the following 15 km; it cannot '
            'detect every overly ambitious start, including a pace maintained through 20 km. The same '
            '5–20 km baseline contributes to both opening classification and later outcomes, so baseline '
            'variation, early slowing, terrain, congestion, conditions, training and fitness can shape '
            'the association. Results do not establish a causal time penalty or an optimal strategy. '
            'Only eligible recorded finishers are represented; withdrawals and missing or invalid splits '
            'cannot be analyzed, and no chance of not finishing can be inferred.',
        ],
        rows=rows,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    data = encode(payload)
    temporary.write_bytes(data)
    temporary.replace(output)
    print(json.dumps(dict(analysis_n=analysis_n, rows=len(rows),
                          groups=sum(len(row['groups']) for row in rows), bytes=len(data),
                          sha256=digest(data), output=str(output))), flush=True)
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cohort', type=Path, default=Path(__file__).resolve().parent/'marathon-cohort')
    parser.add_argument('--output', type=Path, default=Path('public/data/fast-start/all-finishers.json'))
    parser.add_argument('--pin', type=Path, default=Path(__file__).resolve().parent/'release.json')
    args = parser.parse_args()
    run(args.cohort, args.output, args.pin)
