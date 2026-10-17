"""Simplified course routes and elevation silhouettes for illustrations.

Input is the release's course_profiles.parquet, verified against the SHA-256
recorded in the adopted runner-context manifest. Output is a small JSON with a
unit-box route polyline and an elevation profile per supplied course. These
are current supplied routes: historical route validity is unknown and they are
never used to adjust any timing.

A profile is drawn only where the adopted runner context attached it to at least
one recorded edition of its city (one profile, the same race name, inside any
supplied validity interval). A profile the context refused for every edition is
listed under `omitted` with the context's reason (since 1652: Washington, whose
profile is named "Marine Corps Marathon" while its records say "Washington
Marathon"), so no page draws one race's route for another.

Usage:
  python analysis/build_course_geometry.py --profiles PATH/course_profiles.parquet \
      --output public/data/insights/course-geometry.json
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def simplify(points, tolerance):
    """Ramer–Douglas–Peucker on (x, y, km) tuples, keeping endpoints."""
    if len(points) < 3:
        return points
    (x0, y0, _), (x1, y1, _) = points[0], points[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = math.hypot(dx, dy) or 1e-12
    worst, index = -1.0, 0
    for i, (x, y, _) in enumerate(points[1:-1], 1):
        d = abs(dy * (x - x0) - dx * (y - y0)) / norm if math.hypot(dx, dy) > 1e-12 else math.hypot(x - x0, y - y0)
        if d > worst:
            worst, index = d, i
    if worst <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def course(row):
    points = json.loads(row['points_json'])
    require(len(points) >= 20, f"Too few route points for {row['city']}")
    lat0 = sum(p['lat'] for p in points) / len(points)
    k = math.cos(math.radians(lat0))
    xy = [((p['lon']) * k, -p['lat'], p['d_km']) for p in points]
    xs, ys = [p[0] for p in xy], [p[1] for p in xy]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    require(span > 0, 'Degenerate route')
    ox = min(xs) + (max(xs) - min(xs)) / 2 - span / 2
    oy = min(ys) + (max(ys) - min(ys)) / 2 - span / 2
    unit = [((x - ox) / span, (y - oy) / span, d) for x, y, d in xy]
    kept = simplify(unit, .0025)
    distance = float(row['distance_km'])
    require(abs(kept[-1][2] - points[-1]['d_km']) < 1e-9 and kept[0][2] == 0, 'Route distances must start at zero and reach the end')
    # Elevation resampled every 0.5 km of the supplied route distance.
    elevation = []
    j = 0
    steps = int(distance / .5)
    for s in range(steps + 1):
        d = min(distance, s * .5)
        while j < len(points) - 2 and points[j + 1]['d_km'] < d:
            j += 1
        a, b = points[j], points[j + 1]
        f = 0 if b['d_km'] == a['d_km'] else (d - a['d_km']) / (b['d_km'] - a['d_km'])
        elevation.append(round(a['elev_m'] + max(0.0, min(1.0, f)) * (b['elev_m'] - a['elev_m']), 1))
    return dict(city=row['city'], race=row['race'], distance_km=round(distance, 3),
                gain_m=round(float(row['elev_gain_m']), 1), loss_m=round(float(row['elev_loss_m']), 1),
                min_m=round(float(row['elev_min_m']), 1), max_m=round(float(row['elev_max_m']), 1),
                route=[[round(x, 4), round(y, 4)] for x, y, _ in kept], route_km=[round(d, 3) for _, _, d in kept],
                elevation_step_km=.5, elevation_m=elevation, source=row['source'], historical_validity_known=False)


def attached_profiles(context_manifest, manifest):
    """{city: {course_key}} the runner context attached, and {city: refusal reasons}, from its verified edition shards."""
    import gzip
    root = Path(context_manifest).parent
    attached, refused = {}, {}
    for meta in manifest['editions'].values():
        data = (root / meta['file']).read_bytes()
        require(len(data) == meta['bytes'] and hashlib.sha256(data).hexdigest() == meta['sha256'], f"Runner-context shard mismatch: {meta['file']}")
        shard = json.loads(gzip.decompress(data))
        city = shard['edition']['city']
        if shard.get('terrain'):
            attached.setdefault(city, set()).add(shard['terrain']['course_key'])
        elif shard.get('terrain_reason'):
            refused.setdefault(city, set()).add(shard['terrain_reason'])
    return attached, refused


def run(profiles, output, context_manifest):
    manifest = json.loads(Path(context_manifest).read_text())
    expected = manifest['input_files']['course_profiles.parquet']
    actual = sha256(profiles)
    require(actual == expected, 'course_profiles.parquet does not match the adopted runner-context input')
    db = duckdb.connect()
    result = db.execute('SELECT * FROM read_parquet(?) ORDER BY city', [str(profiles)])
    columns = [c[0] for c in result.description]
    rows = [dict(zip(columns, row)) for row in result.fetchall()]
    require(len({row['city'] for row in rows}) == len(rows), 'Expected one supplied profile per city')
    attached, refused = attached_profiles(context_manifest, manifest)
    courses, omitted = [], []
    for row in rows:
        if row['course_key'] in attached.get(row['city'], set()):
            courses.append(course(row))
        else:
            reasons = sorted(refused.get(row['city'], set())) or ['No recorded edition of this city.']
            omitted.append(dict(city=row['city'], race=row['race'], reasons=reasons))
    payload = dict(schema_version=1, release_tag=manifest['release_tag'], input_as_of=manifest['input_as_of'],
                   as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
                   course_profiles_sha256=actual, context_manifest_sha256=sha256(context_manifest),
                   script_sha256=sha256(__file__), courses=courses, omitted=omitted,
                   methodology=('Routes are the supplied current course files, projected with an equirectangular approximation around each '
                                "course's centre and simplified for drawing. Elevation is the supplied smoothed profile resampled every 0.5 km. "
                                'Historical route validity is unknown; these are illustrations and context, never timing adjustments. '
                                'A profile is drawn only where the runner context attached it to a recorded edition of the same race.'))
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    tmp = output.with_suffix('.tmp')
    tmp.write_bytes(data)
    tmp.replace(output)
    print(json.dumps(dict(output=str(output), bytes=len(data), courses=len(courses), omitted=[o['city'] for o in omitted], sha256=hashlib.sha256(data).hexdigest())))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--profiles', required=True)
    p.add_argument('--output', default=str(ROOT / 'public/data/insights/course-geometry.json'))
    p.add_argument('--context-manifest', default=str(ROOT / 'public/data/runner-context/manifest.json'))
    a = p.parse_args()
    run(Path(a.profiles), a.output, a.context_manifest)


if __name__ == '__main__':
    main()
