"""Build the Top 100 charts (/charts) from the verified public runner shards.

The catalog (lib/charts/catalog.json) lists every chart: its number, slug, theme and the charts_*.py module that
builds it. Each chart writes public/data/charts/<slug>.json; manifest.json binds them to the adopted release, the exact
runner manifest, the weather evidence, the catalog and every script hash. scripts/verify-charts.cjs recounts every chart
independently from the shards.

Usage:
  python analysis/build_charts.py [--output public/data/charts] [--only slug,...]
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib
import json
import math
from pathlib import Path
import time

import numpy as np

from build_insights import encode, load_cohort, sha256_bytes, sha256_file, write
from charts_common import MIN_CELL, ChartCohort, load_geometry, load_weather
from insights_data import AGE_LABELS, GENDER_LABELS, screen_duplicates

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'lib/charts/catalog.json'
FORMS = {'bars', 'dumbbell', 'range', 'columns', 'histogram', 'lines', 'slope', 'scatter', 'heatmap', 'stacked', 'waffle',
         'big', 'flow', 'strip', 'multiples', 'pyramid', 'ridgeline'}
THEMES = {'finish-times': 'Finish times', 'pacing': 'Pacing', 'racing': 'Racing', 'courses': 'Courses and weather',
          'people': 'Who runs', 'trends': 'Over the years'}
# Keys the verifiers hold to the 100-finish threshold wherever they appear (scripts/verify-insights.cjs scan()).
SIZE_KEYS = {'n', 'women_n', 'men_n', 'young_n', 'older_n', 'n_comparison', 'matched_weight'}
IDENTITY_KEYS = {'id', 'name', 'names', 'runner', 'bib', 'profile_id', 'person', 'participant'}


def catalog():
    items = json.loads(CATALOG.read_text())
    numbers = [c['number'] for c in items]
    if numbers != list(range(1, len(items) + 1)):
        raise ValueError('The catalog must number its charts 1…n in order')
    if len({c['slug'] for c in items}) != len(items):
        raise ValueError('Chart slugs must be unique')
    for c in items:
        if c['theme'] not in THEMES:
            raise ValueError(f"{c['slug']}: unknown theme {c['theme']}")
    return items


def check(value, where):
    """Finite numbers, the size threshold on every size key, no identity keys, all the way down."""
    if isinstance(value, dict):
        for k, v in value.items():
            if k in IDENTITY_KEYS:
                raise ValueError(f'{where}: identity key {k}')
            if k in SIZE_KEYS and not (isinstance(v, int) and v >= MIN_CELL):
                raise ValueError(f'{where}.{k}: a group size must be an integer of at least {MIN_CELL}')
            check(v, f'{where}.{k}')
    elif isinstance(value, list):
        for i, v in enumerate(value):
            check(v, f'{where}[{i}]')
    elif isinstance(value, (np.generic, np.ndarray)):
        # np.float64 is a float subclass, so this test comes first.
        raise ValueError(f'{where}: a NumPy value reached the output; convert it with float() or int()')
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f'{where}: non-finite number')


def build_one(item, cohort):
    module = importlib.import_module(item['module'])
    builder = module.CHARTS.get(item['slug'])
    if builder is None:
        raise ValueError(f"{item['module']} has no builder for {item['slug']}")
    result = builder(cohort)
    for key in ('values', 'plot', 'cohort_n', 'weighting', 'method'):
        if key not in result:
            raise ValueError(f"{item['slug']}: the builder returned no {key}")
    if result['plot'].get('form') not in FORMS:
        raise ValueError(f"{item['slug']}: unknown chart form {result['plot'].get('form')}")
    if result['weighting'] not in ('pooled', 'editions-equal', 'pairs'):
        raise ValueError(f"{item['slug']}: weighting must be pooled, editions-equal or pairs")
    if not (isinstance(result['cohort_n'], int) and result['cohort_n'] >= MIN_CELL):
        raise ValueError(f"{item['slug']}: cohort_n must be an integer of at least {MIN_CELL}")
    check(result, item['slug'])
    return result


def run(output, only=None, cache=None, partial=False):
    started = time.time()
    pin, full, manifest, manifest_sha = load_cohort(cache)
    story, screen = screen_duplicates(full)
    weather = load_weather()
    cohort = ChartCohort(story, manifest, manifest_sha, weather=weather, geometry=load_geometry())
    items = catalog()
    here = Path(__file__).parent
    scripts = {name: sha256_file(here / name) for name in sorted(
        p.name for p in here.glob('charts_*.py')) + ['build_charts.py', 'build_insights.py', 'insights_data.py', 'insights_stats.py', 'build_fast_start.py']}
    common = dict(
        schema_version=1, release_tag=manifest['release_tag'], input_as_of=manifest['input_as_of'],
        runner_manifest_sha256=manifest_sha, runner_manifest_as_of=manifest['as_of'],
        eligible_records=int(full.n), analysis_n=int(story.n), duplicate_edition_screen=screen,
    )
    output = Path(output)
    previous = json.loads((output / 'manifest.json').read_text())['files'] if (output / 'manifest.json').exists() else {}
    files = {}
    for item in items:
        filename = f"{item['slug']}.json"
        if only and item['slug'] not in only:
            meta = previous.get(filename)
            if meta and (output / filename).exists() and sha256_file(output / filename) == meta['sha256']:
                files[filename] = meta
            continue
        t = time.time()
        result = build_one(item, cohort)
        data = encode(dict(family='chart', number=item['number'], slug=item['slug'], theme=item['theme'], **common, **result))
        write(output / filename, data)
        files[filename] = dict(bytes=len(data), sha256=sha256_bytes(data))
        print(json.dumps(dict(chart=item['number'], slug=item['slug'], bytes=len(data), seconds=round(time.time() - t, 1))), flush=True)
    missing = [f"{c['slug']}.json" for c in items if f"{c['slug']}.json" not in files]
    if missing and not partial:
        raise ValueError(f'Charts not built: {", ".join(missing)}')
    manifest_out = dict(
        **common, as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        catalog_sha256=sha256_file(CATALOG),
        weather=dict(release_tag=weather['input']['release_tag'], evidence_sha256=sha256_file(ROOT / 'public/data/weather/evidence.json')),
        scripts=scripts, source_scripts=manifest['scripts'],
        cohort=dict(eligible=int(full.n), after_duplicate_screen=int(story.n), editions=int(len(np.unique(story.edition))),
                    cities=len({story.editions[e]['city'] for e in np.unique(story.edition)}),
                    shape=int(cohort.shape_keep.sum()), shape_editions_left_out=len(cohort.shape_audit),
                    exact_age=int(cohort.exact_age_ok.sum()), exact_age_editions=len(cohort.granular_age_editions)),
        genders=list(GENDER_LABELS), ages=list(AGE_LABELS), themes=THEMES, files=dict(sorted(files.items())),
    )
    write(output / 'manifest.json', encode(manifest_out))
    print(json.dumps(dict(charts=len(files), seconds=round(time.time() - started, 1))))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', default=str(ROOT / 'public/data/charts'))
    p.add_argument('--only', default='')
    p.add_argument('--cache', default=None, help=argparse.SUPPRESS)
    # Development only: build some charts into a folder of their own without failing on the rest of the catalog.
    p.add_argument('--partial', action='store_true', help=argparse.SUPPRESS)
    a = p.parse_args()
    run(a.output, {x for x in a.only.split(',') if x} or None, a.cache, a.partial)


if __name__ == '__main__':
    main()
