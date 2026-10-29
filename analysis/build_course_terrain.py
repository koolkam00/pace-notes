"""Terrain splits for the race planner and the pace band (family tool-course-terrain).

Input is the adopted release's course_profiles.parquet and the audited
correction registry analysis/course_terrain/corrections.json. The parquet must
be byte-for-byte the file the registry was audited against and the file the
adopted runner-context manifest records. Corrections (bridge decks, tunnels,
rebuilt profiles) are applied on each supplied route's own distance axis,
the corrected points are rounded (0.001 km, 0.01 m) and published as the only
model input, and terrain_model.py spreads a goal over every course marked
band "terrain". The output holds no finish data and no wall-clock time, so
two builds from the same inputs are byte-identical.

Usage:
  python analysis/build_course_terrain.py --profiles PATH/course_profiles.parquet \
      --corrections analysis/course_terrain/corrections.json \
      --output public/data/insights/tools/course-terrain.json

The builder refuses (non-zero exit, naming the course) on any hash mismatch, a
terrain course of class c, without sources or with a `why`, a smoothed grade
above 8% anywhere, a plan share that is not strictly increasing from 0 to 1, a
feature outside its correction or structure range, and a terrain slug that is
not a pace-band scope.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

import duckdb
import numpy as np

import terrain_model as tm

ROOT = Path(__file__).resolve().parents[1]
CONTEXT = ROOT / 'public/data/runner-context/manifest.json'
RELEASE = ROOT / 'analysis/release.json'
PACE_BAND = ROOT / 'public/data/insights/tools/pace-band.json'
FAMILY = 'tool-course-terrain'
MAX_GRADE_PCT = 8.0
STRIP_STEP_KM = 0.5
STRIP_SAMPLES = 85  # 0, 0.5, ..., 42.0 km on the official axis
GAIN_THRESHOLD_M = 2.0
OVERRIDE_REACH_KM = 0.10
WHY = ('held', 'profile')
MODEL = dict(name='strava-2017-quadratic', a1=tm.A1, a2=tm.A2, clamp_pct=[-tm.GMAX, tm.GMAX], grid_points=tm.GRID_POINTS,
             median_samples=tm.MEDIAN_SAMPLES, sigma_samples=tm.SIGMA_SAMPLES, kernel_half_width=tm.KERNEL_HALF_WIDTH,
             edges='nearest', grade='central-differences', weights='trapezoid')


class Refused(Exception):
    """The inputs do not satisfy the terrain-split contract; nothing is written."""


def require(condition, message):
    if not condition:
        raise Refused(message)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def slugify(name):
    """Same rule as courseSlug in lib/tools/links.ts and slugify in insights_tools_common.py."""
    s = unicodedata.normalize('NFKD', name.lower())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', s))


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')) + '\n').encode()


def read_profiles(path):
    """{city: (race, [(d_km, elev_m), ...])} from the supplied course profiles."""
    rows = duckdb.connect().execute('SELECT city, race, points_json FROM read_parquet(?) ORDER BY city', [str(path)]).fetchall()
    out = {}
    for city, race, points_json in rows:
        require(city not in out, f'{city}: more than one supplied course profile')
        out[city] = (race, [(float(p['d_km']), float(p['elev_m'])) for p in json.loads(points_json)])
    return out


def apply_one(points, corr, city):
    """One correction on the route's own axis (lat/lon are not needed and are not kept)."""
    mode = corr.get('mode', 'replace_range')
    anchors = sorted((float(d), float(z)) for d, z in corr['anchors'])
    require(anchors, f"{city}: correction {corr['id']} has no anchors")
    if mode == 'point_overrides':
        out = list(points)
        for d, z in anchors:
            i = int(np.argmin([abs(p[0] - d) for p in out]))
            require(abs(out[i][0] - d) <= OVERRIDE_REACH_KM, f"{city}: correction {corr['id']} anchor at {d} km matches no profile point")
            out[i] = (out[i][0], z)
        return out
    if mode == 'replace_all':
        return [(round(d, 3), z) for d, z in anchors]
    require(mode == 'replace_range', f"{city}: correction {corr['id']} has unknown mode {mode!r}")
    a, b = float(corr['km_from']), float(corr['km_to'])
    require(a < b, f"{city}: correction {corr['id']} has an empty range")
    require(all(a - 1e-9 <= d <= b + 1e-9 for d, _ in anchors), f"{city}: correction {corr['id']} has an anchor outside its range")
    keep = [p for p in points if p[0] < a or p[0] > b]
    keep.extend((round(d, 3), z) for d, z in anchors)
    return sorted(keep, key=lambda p: p[0])


def corrected_points(course, points):
    """The supplied profile with the registry's corrections (class b only), replace_all first, in registry order."""
    corrections = course.get('corrections') or []
    if course['class'] != 'b':
        require(not corrections, f"{course['city']}: corrections on a class {course['class']} course")
        return list(points)
    for corr in sorted(corrections, key=lambda x: 0 if x.get('mode') == 'replace_all' else 1):
        points = apply_one(points, corr, course['city'])
    return points


def feature_ranges(course):
    """Route-axis ranges a feature may lie in: each range correction and each applied structure."""
    ranges = [(float(c['km_from']), float(c['km_to'])) for c in course.get('corrections') or [] if c.get('mode', 'replace_range') != 'replace_all']
    ranges += [(float(s['d_from']), float(s['d_to'])) for s in course.get('structures_applied') or []]
    return ranges


def check_u(U, city):
    require(U[0] == 0 and U[-1] == 1.0, f'{city}: plan share does not run from 0 to exactly 1')
    require(bool(np.all(np.diff(U) > 0)), f'{city}: plan share is not strictly increasing')


def terrain_course(course, race, points):
    city = course['city']
    pts = sorted(((round(d, 3), round(z, 2)) for d, z in corrected_points(course, points)), key=lambda p: p[0])
    d = np.array([p[0] for p in pts])
    z = np.array([p[1] for p in pts])
    require(len(d) >= 20 and bool(np.all(np.diff(d) > 0)), f'{city}: corrected route distances must strictly increase')
    route_km = float(d[-1] - d[0])
    x, zz, g = tm.grade_profile(d, z)
    max_grade = float(np.max(np.abs(g)))
    require(max_grade <= MAX_GRADE_PCT, f'{city}: smoothed grade {max_grade:.2f}% is above {MAX_GRADE_PCT:g}%')
    U = tm.cumulative(x, g)
    check_u(U, city)
    u = lambda km: [round(float(v), 7) for v in tm.u_at(x, U, np.asarray(km, float))]
    km, mi = u(np.arange(1, 43)), u(np.arange(1, 27) * tm.MILE_KM)
    half = u([tm.KM / 2])[0]
    require(all(0 < v < 1 for v in km + mi) and km[20] < half < km[21], f'{city}: plan shares out of order')
    official = lambda r: round((r - float(d[0])) * tm.KM / route_km, 3)
    ranges, features, ids = feature_ranges(course), [], set()
    for ft in course.get('features') or []:
        a, b = float(ft['km_from']), float(ft['km_to'])
        require(ft['id'] not in ids and all(isinstance(ft[k], str) and ft[k] for k in ('id', 'name', 'short')), f"{city}: feature {ft.get('id')} is not a unique named feature")
        require(a < b and any(lo - 1e-9 <= a and b <= hi + 1e-9 for lo, hi in ranges), f"{city}: feature {ft['id']} lies outside its correction range")
        ids.add(ft['id'])
        features.append(dict(id=ft['id'], name=ft['name'], short=ft['short'], from_km=official(a), to_km=official(b)))
    require(features == sorted(features, key=lambda ft: ft['from_km']), f'{city}: features are not in race order')
    # The corrected, smoothed profile the plan was spread over, every 0.5 km of the official axis (for the printed strip).
    strip_m = [round(float(v), 1) for v in np.interp(np.arange(STRIP_SAMPLES) * STRIP_STEP_KM, x, zz)]
    gain = round(tm.gain(zz, GAIN_THRESHOLD_M), 1)
    return {
        'slug': course['slug'], 'city': city, 'race': race, 'class': course['class'], 'route_km': round(route_km, 3),
        'route': {'d_km': [float(v) for v in d], 'm': [float(v) for v in z]},
        'km': km, 'mi': mi, 'half': half, 'features': features,
        'strip': {'step_km': STRIP_STEP_KM, 'm': strip_m, 'min': round(float(zz.min()), 1), 'max': round(float(zz.max()), 1),
                  'gain': gain, 'loss': round(tm.loss(zz, GAIN_THRESHOLD_M), 1)},
        'max_grade_pct': round(max_grade, 2), 'smoothed_gain_m': gain,
        'sources': [dict(s) for s in course['sources']], 'flags': list(course.get('flags') or []),
    }


def build(profiles, corrections, context=CONTEXT, release=RELEASE, pace_band=PACE_BAND):
    """Return the course-terrain JSON bytes, or raise Refused."""
    parquet_sha = sha256_bytes(Path(profiles).read_bytes())
    corrections_bytes = Path(corrections).read_bytes()
    context_bytes = Path(context).read_bytes()
    registry, manifest = json.loads(corrections_bytes), json.loads(context_bytes)
    tag = json.loads(Path(release).read_text())['tag']
    require(registry.get('schema') == 'pace-notes/course-profile-corrections' and registry.get('version'), 'corrections: unknown registry schema')
    require(manifest.get('release_tag') == tag, f"runner-context manifest names {manifest.get('release_tag')}, not the adopted {tag}")
    recorded = manifest['input_files'].get('course_profiles.parquet')
    require(parquet_sha == recorded, f'course_profiles.parquet SHA-256 {parquet_sha} is not the runner-context input {recorded}')
    require(parquet_sha == registry['input']['sha256'], f"course_profiles.parquet SHA-256 {parquet_sha} is not the audited corrections input {registry['input']['sha256']}")
    scopes = {s['slug'] for s in json.loads(Path(pace_band).read_text())['scopes'] if s['slug'] != 'all'}
    supplied = read_profiles(profiles)
    cities = [c['city'] for c in registry['courses']]
    require(len(set(cities)) == len(cities), 'corrections: a city is listed twice')
    require(set(cities) == set(supplied), f'corrections and course profiles list different cities: {sorted(set(cities) ^ set(supplied))}')
    courses, even = [], []
    for course in registry['courses']:
        city = course['city']
        require(course.get('slug') == slugify(city), f'{city}: slug must be {slugify(city)!r}')
        require(course.get('class') in ('a', 'b', 'c'), f'{city}: unknown class')
        band = course.get('band')
        if band == 'terrain':
            require(course['class'] in ('a', 'b'), f"{city}: a class {course['class']} profile cannot carry terrain splits")
            require('why' not in course, f'{city}: a terrain course has no why')
            sources = course.get('sources') or []
            require(sources and all(isinstance(s.get(k), str) and s[k] for s in sources for k in ('dataset', 'url', 'licence', 'retrieved')),
                    f'{city}: a terrain course needs sources with dataset, url, licence and retrieved')
            require(course['slug'] in scopes, f"{city}: {course['slug']} is not a pace-band scope")
            race, points = supplied[city]
            courses.append(terrain_course(course, race, points))
        else:
            require(band == 'even', f'{city}: band must be "terrain" or "even"')
            require(course.get('why') in WHY, f'{city}: an even-pace course needs why "held" or "profile"')
            require(not course.get('features'), f'{city}: features on an even-pace course')
            even.append(dict(slug=course['slug'], city=city, why=course['why']))
    require(courses, 'no terrain course')
    here = Path(__file__).resolve().parent
    doc = dict(
        family=FAMILY, schema_version=1, release_tag=tag, input_as_of=manifest['input_as_of'],
        context_manifest_sha256=sha256_bytes(context_bytes), course_profiles_sha256=parquet_sha,
        corrections_version=registry['version'], corrections_sha256=sha256_bytes(corrections_bytes),
        scripts={name: sha256_bytes((here / name).read_bytes()) for name in ('build_course_terrain.py', 'terrain_model.py')},
        model=MODEL, courses=sorted(courses, key=lambda c: c['slug']), even=sorted(even, key=lambda c: c['slug']),
    )
    return encode(doc)


def main(argv=None):
    p = argparse.ArgumentParser(description='Build tools/course-terrain.json (terrain splits).')
    p.add_argument('--profiles', required=True)
    p.add_argument('--corrections', default=str(ROOT / 'analysis/course_terrain/corrections.json'))
    p.add_argument('--output', default=str(ROOT / 'public/data/insights/tools/course-terrain.json'))
    p.add_argument('--context-manifest', default=str(CONTEXT))
    p.add_argument('--release', default=str(RELEASE))
    p.add_argument('--pace-band', default=str(PACE_BAND), help='pace-band index whose scopes a terrain course must be in')
    a = p.parse_args(argv)
    try:
        data = build(a.profiles, a.corrections, a.context_manifest, a.release, a.pace_band)
    except Refused as error:
        sys.exit(f'build_course_terrain: refused: {error}')
    out = Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + '.tmp')
    tmp.write_bytes(data)
    tmp.replace(out)
    doc = json.loads(data)
    print(json.dumps(dict(family=FAMILY, bytes=len(data), terrain=[c['slug'] for c in doc['courses']], even=len(doc['even']))))


if __name__ == '__main__':
    main()
