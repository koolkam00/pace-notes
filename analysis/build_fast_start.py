"""Describe opening pace, finish change and later slowing from verified runner shards.

This additive, read-only calculation uses the published screened identity
candidates. It reconstructs the same strictly-earlier-year benchmark as the
source pipeline and refuses publication unless the full cohort reconciles.
"""
import argparse
from array import array
from datetime import datetime, timezone
from decimal import Decimal
import gzip
import hashlib
import json
import math
from pathlib import Path
import re

import numpy as np


POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
LENGTHS = np.diff([0, *POINTS])
MIN_CELL = 100
RATIO_EPSILON = 1e-12
PACE_BOUND_EPSILON = 1e-8
AGE_BANDS = ['all', '18–24', *[f'{age}–{age+4}' for age in range(25, 90, 5)]]
GENDERS = ['all', 'Men', 'Women']
PRIOR_BANDS = ['all', 'under3', '3to330', '330to4', '4plus']
BANDS = [
    dict(id='fast10', label='More than 10% faster', lower=None, upper=-10, lower_inclusive=False, upper_inclusive=False),
    dict(id='fast5', label='5–10% faster', lower=-10, upper=-5, lower_inclusive=True, upper_inclusive=False),
    dict(id='fast2', label='2–5% faster', lower=-5, upper=-2, lower_inclusive=True, upper_inclusive=False),
    dict(id='steady', label='Within 2%', lower=-2, upper=2, lower_inclusive=True, upper_inclusive=True),
    dict(id='slow2', label='2–5% slower', lower=2, upper=5, lower_inclusive=False, upper_inclusive=True),
    dict(id='slow5', label='More than 5% slower', lower=5, upper=None, lower_inclusive=False, upper_inclusive=False),
]
SOURCE_SCRIPTS = {'build_public_explorer.py', 'build_runner_lookup.py',
                  'build_pacing.py', 'build_extended.py', 'source_quality.py'}

# Numeric observation columns; exact integer group codes remain representable.
CITY, AGE, GENDER, PRIOR, EDITION, BAND, FINISH, OPENING, REMAINDER, ONSET, LATE = range(11)
PACE = 11
WIDTH = 20


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False,
                       separators=(',', ':')) + '\n').encode()


def opening_band(value):
    """Percent pace change; predefined descriptions, not fitness thresholds."""
    require(math.isfinite(value), 'Opening percentage must be finite')
    if value < -10:
        return 0
    if value < -5:
        return 1
    if value < -2:
        return 2
    if value <= 2:
        return 3
    if value <= 5:
        return 4
    return 5


def opening_band_for_times(opening_seconds, earlier_finish):
    """Compare decimal timing cross-products without binary boundary drift.

    For example 2,850 s / 10 km against 12,658.5 s / 42.195 km is exactly
    5% faster, while a binary division can yield −5.000000000000004%.
    The JSON decimal times are compared directly; no timing is rounded.
    """
    left = Decimal(str(opening_seconds))*4219500
    right = Decimal(str(earlier_finish))*10000
    require(left.is_finite() and right.is_finite() and left > 0 and right > 0,
            'Opening and earlier finish times must be finite and positive')
    if left < right*90:
        return 0
    if left < right*95:
        return 1
    if left < right*98:
        return 2
    if left <= right*102:
        return 3
    if left <= right*105:
        return 4
    return 5


def age_code(age):
    if age is None or not isinstance(age, (int, float)) or not math.isfinite(age):
        return 0
    if age < 18 or age >= 90 or age != math.floor(age):
        return 0
    return 1 if age < 25 else int(age // 5) - 3


def gender_code(sex):
    normalized = (sex or '').strip().lower()
    if normalized in ('m', 'male', 'man', 'men'):
        return 1
    if normalized in ('f', 'female', 'woman', 'women'):
        return 2
    return 0


def prior_code(seconds):
    if seconds < 10800:
        return 1
    if seconds < 12600:
        return 2
    if seconds < 14400:
        return 3
    return 4


def recent_benchmarks(races, editions):
    """Yield eligible races with the best eligible finish in years y−2/y−1.

    A profile is a supplied screened identity candidate; never join names.
    Current and same-year performances cannot contribute to the benchmark.
    """
    eligible = [race for race in races if race['eligible']]
    best_by_year = {}
    for race in eligible:
        year = editions[race['edition']]['year']
        finish = race['times'][-1]
        best_by_year[year] = min(best_by_year.get(year, float('inf')), finish)
    for race in eligible:
        year = editions[race['edition']]['year']
        earlier = [best_by_year[y] for y in (year-2, year-1) if y in best_by_year]
        if earlier:
            yield race, min(earlier)


def observation(race, recent_best, city):
    """Measured metrics from actual recorded intervals, with no imputed splits."""
    times = race['times']
    require(len(times) == 9 and all(isinstance(t, (float, int)) and math.isfinite(t) for t in times),
            'Eligible race must have nine finite checkpoint times')
    require(5400 <= times[-1] <= 43200 and 0 < times[0]
            and all(a < b for a, b in zip(times, times[1:])),
            'Eligible race violates the timing contract')
    durations = [times[0], *[b-a for a, b in zip(times, times[1:])]]
    paces = [duration/length for duration, length in zip(durations, LENGTHS)]
    # The published eligibility flag already applies the source bounds. Decimal
    # elapsed subtraction and the final 2.195 km distance can drift slightly at
    # an exact limit, so use the independent runner verifier's rounding tolerance.
    require(all(120-PACE_BOUND_EPSILON <= pace <= 1200+PACE_BOUND_EPSILON for pace in paces),
            'Eligible race violates section pace bounds')
    baseline = (times[3]-times[0])/15
    # Every tested section here is 5 km. A qualifying final 2.195 km cannot
    # start an episode on its own; if it extends an episode, onset is earlier.
    onset = next((20+5*i for i in range(4)
                  if paces[i+4]/baseline-1+RATIO_EPSILON >= .25), -1)
    opening_delta = times[1]-recent_best*10/42.195
    finish_delta = times[-1]-recent_best
    late = 100*((times[-1]-times[5])/12.195/baseline-1)
    return [city, age_code(race['age']), gender_code(race['sex']), prior_code(recent_best),
            race['edition'], opening_band_for_times(times[1], recent_best), finish_delta, opening_delta,
            finish_delta-opening_delta, onset, late,
            *[100*(pace/(recent_best/42.195)-1) for pace in paces]]


def verified_manifest(runner_root, pin, script_root):
    manifest_bytes = (runner_root/'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    require(manifest['release_tag'] == pin['tag'], 'Runner release does not match adopted pin')
    require(manifest['points_km'] == POINTS, 'Unexpected checkpoint mapping')
    require(manifest['linkage']['canonical_id_contract_verified'] is True
            and manifest['linkage']['record_join_method'] == 'canonical_record_id',
            'This calculation requires the audited canonical identity contract')
    require(set(manifest['scripts']) == SOURCE_SCRIPTS, 'Unexpected source script contract')
    for name, expected in manifest['scripts'].items():
        require(digest((script_root/name).read_bytes()) == expected, f'Source script changed: {name}')
    require(manifest['raw_records'] == manifest['cohort']['raw']
            and manifest['eligible_records'] == manifest['cohort']['eligible'],
            'Inconsistent source cohort metadata')
    return manifest, digest(manifest_bytes)


def read_observations(runner_root, manifest):
    """Verify every published shard, then reconstruct history profile by profile."""
    editions = manifest['editions']
    cities = ['All courses', *sorted({e['city'] for e in editions})]
    city_codes = {city: i for i, city in enumerate(cities)}
    edition_cities = [city_codes[e['city']] for e in editions]
    data = array('d')
    record_ids, profile_ids = array('Q'), array('Q')
    raw = eligible = profiles = 0
    for number, (relative, expected) in enumerate(sorted(manifest['shards'].items()), 1):
        require(re.fullmatch(r'(profiles|index)/[0-9a-f]{3}\.json\.gz', relative) is not None,
                'Unexpected shard path')
        compressed = (runner_root/relative).read_bytes()
        require(len(compressed) == expected['bytes'] and digest(compressed) == expected['sha256'],
                f'Runner shard checksum/size mismatch: {relative}')
        if not relative.startswith('profiles/'):
            continue
        shard = json.loads(gzip.decompress(compressed))
        require(shard['release_tag'] == manifest['release_tag'], f'Shard release mismatch: {relative}')
        for profile in shard['profiles']:
            profile_ids.append(profile['id'])
            profiles += 1
            races = profile['races']
            for race in races:
                record_ids.append(race['id'])
                require(isinstance(race['edition'], int) and 0 <= race['edition'] < len(editions),
                        'Invalid edition reference')
                raw += 1
                eligible += bool(race['eligible'])
            for race, recent in recent_benchmarks(races, editions):
                data.extend(observation(race, recent, edition_cities[race['edition']]))
        if number % 512 == 0:
            print(json.dumps(dict(verified_shards=number, raw=raw, history_n=len(data)//WIDTH)), flush=True)
    require(raw == manifest['raw_records'], 'Raw record count does not reconcile')
    require(eligible == manifest['eligible_records'], 'Eligible record count does not reconcile')
    require(profiles == manifest['profiles'], 'Profile count does not reconcile')
    for values, label in [(record_ids, 'record'), (profile_ids, 'profile')]:
        ids = np.frombuffer(values, dtype=np.uint64)
        ordered = np.sort(ids)
        require(len(ordered) > 0 and ordered[0] > 0 and bool(np.all(np.diff(ordered) > 0)),
                f'Duplicate or invalid {label} IDs')
    history_n = len(data)//WIDTH
    require(history_n == manifest['linkage']['recent_benchmark_finishes'],
            f'Earlier-benchmark cohort mismatch: reconstructed {history_n}; source '
            f"{manifest['linkage']['recent_benchmark_finishes']}")
    print(json.dumps(dict(verified_raw=raw, verified_eligible=eligible,
                         profiles=profiles, reconstructed_history=history_n)), flush=True)
    return np.frombuffer(data, dtype=np.float64).reshape((-1, WIDTH)), cities


def rounded(value):
    require(math.isfinite(float(value)), 'Non-finite aggregate')
    return round(float(value), 6)


def summarize_group(selected, band, min_cell=MIN_CELL):
    n = len(selected)
    if n < min_cell:
        return None
    finish = np.quantile(selected[:, FINISH], [.1, .5, .9], method='linear')
    slowdown_n = int(np.sum(selected[:, ONSET] >= 0))
    onset = [int(np.sum(selected[:, ONSET] == start)) for start in (20, 25, 30, 35)]
    require(sum(onset) == slowdown_n, 'Slowdown onset counts disagree')
    mean_finish = float(np.mean(selected[:, FINISH]))
    mean_opening = float(np.mean(selected[:, OPENING]))
    mean_remainder = float(np.mean(selected[:, REMAINDER]))
    require(abs(mean_finish-mean_opening-mean_remainder) < 1e-8,
            'Opening and remaining time do not reconcile with finish difference')
    return dict(band=BANDS[band]['id'], n=n, editions=len(np.unique(selected[:, EDITION])),
                finish_delta_p10_s=rounded(finish[0]), finish_delta_median_s=rounded(finish[1]),
                finish_delta_p90_s=rounded(finish[2]), finish_delta_mean_s=rounded(mean_finish),
                opening_delta_mean_s=rounded(mean_opening), remainder_delta_mean_s=rounded(mean_remainder),
                slowdown_n=slowdown_n, onset=onset if slowdown_n >= min_cell else None,
                pace_pct=[rounded(x) for x in np.median(selected[:, PACE:], axis=0)],
                late_change_median_pct=rounded(np.median(selected[:, LATE])))


def aggregate(observations, cities, min_cell=MIN_CELL):
    """Compute each roll-up from its own records; never average cell medians."""
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
                gender_rows = age_rows if gender == 0 else age_rows[age_rows[:, GENDER] == gender]
                if len(gender_rows) < min_cell:
                    continue
                for prior, prior_name in enumerate(PRIOR_BANDS):
                    selected = gender_rows if prior == 0 else gender_rows[gender_rows[:, PRIOR] == prior]
                    if len(selected) < min_cell:
                        continue
                    groups = [group for band in range(len(BANDS))
                              if (group := summarize_group(selected[selected[:, BAND] == band], band, min_cell))]
                    if groups:
                        rows.append(dict(city=city_name, age=age_name, gender=gender_name,
                                         prior=prior_name, groups=groups))
        print(json.dumps(dict(aggregated_city=city_name, published_cohorts=len(rows))), flush=True)
    return rows


def run(runner_root, output, pin_path):
    script_root = Path(__file__).resolve().parent
    manifest, manifest_hash = verified_manifest(runner_root, json.loads(pin_path.read_bytes()), script_root)
    observations, cities = read_observations(runner_root, manifest)
    rows = aggregate(observations, cities)
    history_n = len(observations)
    payload = dict(
        schema_version=1, release_tag=manifest['release_tag'], input_as_of=manifest['input_as_of'],
        as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        input_asset_sha256=manifest['input_asset_sha256'], input_manifest_sha256=manifest['input_manifest_sha256'],
        runner_manifest_sha256=manifest_hash, runner_manifest_as_of=manifest['as_of'],
        scripts={'build_fast_start.py': digest(Path(__file__).read_bytes())}, source_scripts=manifest['scripts'],
        engine=f'NumPy {np.__version__}', cohort=manifest['cohort'], linkage=manifest['linkage'],
        source_quality=manifest['source_quality'], raw_records=manifest['raw_records'],
        eligible_records=manifest['eligible_records'], history_n=history_n,
        eligible_without_prior_n=manifest['eligible_records']-history_n, min_cell=MIN_CELL,
        points_km=POINTS, onset_starts_km=[20, 25, 30, 35],
        bands=BANDS, cities=cities, ages=AGE_BANDS, genders=GENDERS, prior_bands=PRIOR_BANDS,
        methodology_prose=[
            'Use the public runner profiles from the adopted source. Verify every compressed shard checksum and size, '
            'source calculation hashes, record and profile uniqueness, raw and eligible counts, and the reconstructed '
            'earlier-benchmark cohort against the audited runner manifest.',
            'Source identities are the producer\'s screened person links, not independently verified people; Pace Notes adds no name matching of its own. '
            'Use only eligible finishes, including for earlier benchmarks; held, incomplete and invalid timings cannot contribute.',
            'For each eligible race, recompute the fastest eligible finish in the two strictly earlier calendar years. '
            'Exclude the current race and every same-year race. This is an earlier recorded best, not verified fitness, '
            'a declared goal or necessarily a lifetime best. Eligible races without this benchmark are absent.',
            'Opening change is 100 × ((first 10 km elapsed time / 10) / (earlier best / 42.195) − 1). '
            'The six fixed percentage bands are descriptions, not physiological thresholds for starting too fast. '
            'Exact boundary inclusion is recorded with each band. Decimal timing cross-products determine '
            'band membership without binary-division boundary drift or rounding the source times.',
            'Finish change is current finish minus earlier best, in seconds. Opening difference compares actual first '
            '10 km elapsed time with 10/42.195 of that same earlier finish; remaining difference is the finish '
            'difference minus opening difference. Their means add to the mean finish difference. The even-pace '
            'reference is arithmetic, not a prediction of what a runner would have achieved with another strategy.',
            'The 10th, 50th and 90th percentiles describe individual finish differences, not confidence intervals. '
            'Section curves are medians of individual section pace differences from each runner’s earlier-best '
            'marathon pace. The separate section medians need not form an individual race or sum to a median finish.',
            'Sustained slowdown means at least 25% slower than the current race’s 5–20 km baseline for contiguous '
            'recorded sections totaling at least 5 km after 20 km, with a 1e−12 ratio rounding tolerance. '
            'The last 2.195 km cannot qualify alone. The first qualifying section starts at 20, 25, 30 or 35 km; '
            'timing mats do not reveal the exact instant that slowing began. The rate denominator includes every '
            'eligible finish in the displayed opening group; onset distributions use only detected finishes.',
            'Late pace change compares 30 km–finish with the same race’s 5–20 km pace. All-course, age, recorded '
            'gender and earlier-time roll-ups are recalculated from records. Missing age or gender stays in All '
            'and never becomes an invented subgroup. Each displayed opening group needs at least 100 finishes; '
            'an onset distribution also needs at least 100 detected finishes. Sparse selections are not broadened.',
            'These are observational associations among recorded finishers. Fitness changes, selection, training, '
            'intentions, conditions and course profiles remain mixed together. Faster openings may accompany better '
            'fitness and faster final times despite later slowing. The calculation cannot establish a causal '
            'time penalty, the best individual strategy, physiological failure or the chance of not finishing.',
        ],
        rows=rows,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    data = encode(payload)
    temporary.write_bytes(data)
    temporary.replace(output)
    print(json.dumps(dict(history_n=history_n, rows=len(rows),
                          groups=sum(len(row['groups']) for row in rows), bytes=len(data),
                          output=str(output))), flush=True)
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runners', type=Path, default=Path('public/data/runners'))
    parser.add_argument('--output', type=Path, default=Path('public/data/fast-start/evidence.json'))
    parser.add_argument('--pin', type=Path, default=Path('analysis/release.json'))
    args = parser.parse_args()
    run(args.runners, args.output, args.pin)
