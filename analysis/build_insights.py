"""Build the Pace Notes story analyses from the verified public runner shards.

Each family writes one JSON file under public/data/insights/, and manifest.json
binds them to the adopted release, the exact runner and context manifests,
the duplicate-edition screen and every script hash.

Usage:
  python analysis/build_insights.py [--output public/data/insights] [--only family,...]
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

import numpy as np

import insights_data
from insights_data import AGE_LABELS, GENDER_LABELS, read_finishes, screen_duplicates

ROOT = Path(__file__).resolve().parents[1]
FAMILY_MODULES = {}


def register(name, module, filename):
    FAMILY_MODULES[name] = (module, filename)


def families():
    import insights_round
    import insights_replay
    register('finish-times', insights_round, 'finish-times.json')
    register('replay', insights_replay, 'replay.json')
    for name, module, filename in optional_families():
        register(name, module, filename)
    return FAMILY_MODULES


def optional_families():
    found = []
    for name, module_name, filename in (
        ('archetypes', 'insights_archetypes', 'archetypes.json'),
        ('positions', 'insights_positions', 'positions.json'),
        ('demographics', 'insights_demographics', 'demographics.json'),
        ('courses', 'insights_courses', 'courses.json'),
        ('kick', 'insights_kick', 'kick.json'),
        ('tool-projector', 'insights_tool_projector', 'tools/projector.json'),
        ('tool-pace-band', 'insights_tool_paceband', 'tools/pace-band.json'),
        ('tool-weather-match', 'insights_tool_weather', 'tools/weather-match.json'),
        ('tool-course-goal', 'insights_tool_coursegoal', 'tools/course-goal.json'),
    ):
        path = Path(__file__).with_name(module_name + '.py')
        if path.exists():
            found.append((name, __import__(module_name), filename))
    return found


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    return sha256_bytes(Path(path).read_bytes())


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_bytes(data)
    tmp.replace(path)


def load_cohort(cache=None):
    pin = json.loads((ROOT / 'analysis/release.json').read_text())
    runner_root = ROOT / 'public/data/runners'
    if cache and Path(cache).exists():
        # Development shortcut only: arrays previously written from the verified shards.
        from build_fast_start import verified_manifest
        manifest, manifest_sha = verified_manifest(runner_root, pin, ROOT / 'analysis')
        z = np.load(cache)
        f = insights_data.Finishes(z['times'], z['edition'], z['gender'], z['age'], z['exact_age'], z['profile'], manifest['editions'])
        f.raw_by_edition = z['raw_by_edition'] if 'raw_by_edition' in z else None
        if f.n != manifest['eligible_records']:
            raise ValueError('Cached arrays do not match the runner manifest')
    else:
        f, manifest, manifest_sha = read_finishes(runner_root, pin, ROOT / 'analysis')
    return pin, f, manifest, manifest_sha


def run(output, only=None, cache=None):
    started = time.time()
    pin, full, manifest, manifest_sha = load_cohort(cache)
    cohort, screen = screen_duplicates(full)
    context_manifest = ROOT / 'public/data/runner-context/manifest.json'
    scripts = {name: sha256_file(Path(__file__).with_name(name)) for name in sorted(
        p.name for p in Path(__file__).parent.glob('insights_*.py')) + ['build_insights.py', 'build_fast_start.py']}
    common = dict(
        schema_version=1, release_tag=manifest['release_tag'], input_as_of=manifest['input_as_of'],
        runner_manifest_sha256=manifest_sha, runner_manifest_as_of=manifest['as_of'],
        eligible_records=int(full.n), analysis_n=int(cohort.n), duplicate_edition_screen=screen,
    )
    output = Path(output)
    files = {}
    for name, (module, filename) in families().items():
        if only and name not in only:
            previous = json.loads((output / 'manifest.json').read_text())['files'] if (output / 'manifest.json').exists() else {}
            for kept, meta in previous.items():
                if kept == filename or kept.startswith(filename.replace('.json', '/')):
                    if (output / kept).exists() and sha256_file(output / kept) == meta['sha256']:
                        files[kept] = meta
            continue
        t = time.time()
        result = module.build(cohort)
        extra = result.pop('extra_files', {})
        for extra_name, extra_payload in extra.items():
            extra_data = encode(dict(family=name, release_tag=common['release_tag'], runner_manifest_sha256=manifest_sha, **extra_payload))
            write(output / extra_name, extra_data)
            files[extra_name] = dict(bytes=len(extra_data), sha256=sha256_bytes(extra_data))
        data = encode(dict(family=name, **common, **result))
        write(output / filename, data)
        files[filename] = dict(bytes=len(data), sha256=sha256_bytes(data))
        print(json.dumps(dict(family=name, bytes=len(data), seconds=round(time.time() - t, 1))), flush=True)
    geometry = output / 'course-geometry.json'
    if geometry.exists():
        files['course-geometry.json'] = dict(bytes=geometry.stat().st_size, sha256=sha256_file(geometry))
    cities = sorted({cohort.editions[e]['city'] for e in np.unique(cohort.edition)})
    manifest_out = dict(
        **common, as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        context_manifest_sha256=sha256_file(context_manifest), scripts=scripts, source_scripts=manifest['scripts'],
        cohort=dict(eligible=int(full.n), after_duplicate_screen=int(cohort.n),
                    editions=int(len(np.unique(cohort.edition))), cities=len(cities),
                    men=int((cohort.gender == 1).sum()), women=int((cohort.gender == 2).sum()),
                    other_or_not_recorded=int((cohort.gender == 0).sum()), exact_age=int(np.isfinite(cohort.exact_age).sum())),
        genders=list(GENDER_LABELS), ages=list(AGE_LABELS), files=dict(sorted(files.items())),
        methodology=[
            'Every story uses eligible finishes from the adopted release: all nine checkpoints present and increasing, a finish between '
            '1:30 and 12:00, every section between 2 and 20 minutes per kilometre, and the reviewed source-quality exclusions.',
            'The stories additionally leave out Chicago 2018 and 2019, whose records duplicate the Chicago 2024 field. This screen applies '
            'only to these stories; the reviewed source policy and the existing analyses are unchanged.',
            'Counts are race finishes, not unique runners. Associations are descriptive, never causal. Published groups have at least 100 finishes.',
        ],
    )
    write(output / 'manifest.json', encode(manifest_out))
    print(json.dumps(dict(analysis_n=cohort.n, seconds=round(time.time() - started, 1), files=len(files))))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', default=str(ROOT / 'public/data/insights'))
    p.add_argument('--only', default='')
    p.add_argument('--cache', default=None, help=argparse.SUPPRESS)
    a = p.parse_args()
    run(a.output, {x for x in a.only.split(',') if x} or None, a.cache)


if __name__ == '__main__':
    main()
