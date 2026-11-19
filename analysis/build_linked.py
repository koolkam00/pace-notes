"""Build the linked-records family, public/data/linked/ (docs/LINKED_RECORDS.md).

    python3 -I analysis/build_linked.py --input "$PACE_INPUT_DIR" --identity "$PACE_INPUT_DIR/../identity.parquet" \
        --links "$PACE_RELEASE_DIR/person-ids-v5.1-race_results_linked.parquet" [--out public/data/linked] [--boot 400] [--accept-counts]

Reads the adapted marathon input (analysis/adapt_combined.py; FULL bundle), the release's identity file for the runner
keys (analysis/build_identity.py) and, for the age-group-floor flag only, the release's link file, all read-only and all
checked: the input's MANIFEST.json is the one the frozen edition policy was built on, every member read is the file the
manifest lists, the link file is the release asset analysis/release.json pins, and the identity file was built from
this input and this link file by the identity builder in the repository. Writes aggregates only:

    editions.json   fast years and slow years: an edition against the race's other years, by registry label and year
    races.json      the same linked runners at different races: a reading per race, in label order, no rank
                    (a label whose registry entry has a reviewed series note holds several races: its editions are
                    compared inside their series, and its readings are per series)
    bests.json      recorded bests by recorded attempt, and the steps between recorded marathons
    age.json        the change per year of age in the same linked runner, with the cross-section beside it
    return.json     seen again after a sustained slowdown: one matched comparison
    recorded_again.json   who is recorded again: each finish band and age band against the other finishes of its editions
    checks.json     the evidence behind the first two files, recomputed on every build
    manifest.json   binds every file to the release, the input, the policy, the registry and every builder script

The output is deterministic: two builds give the same bytes (no timestamp; a fixed bootstrap seed; one BLAS thread).
A rebuild whose cohort counts differ from the manifest already in --out prints the change and fails unless
--accept-counts (a reviewed refresh only). DuckDB settings: PACE_LINKED_DUCKDB_THREADS, PACE_LINKED_DUCKDB_MEMORY,
PACE_LINKED_DUCKDB_MAX_TEMP, TMPDIR.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

for _name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):   # one BLAS thread: the same bytes on every run
    os.environ.setdefault(_name, '1')
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

import linked_common as lc  # noqa: E402
from linked_common import ANALYSIS, OUTPUT, LinkedError, bytes_sha256, check_published, encode, fail, file_sha256  # noqa: E402

SCRIPTS = ('build_linked.py', 'linked_common.py', 'linked_universe.py', 'linked_model.py', 'linked_races.py', 'linked_histories.py',
           'linked_return.py', 'linked_again.py', 'linked_reviews.py')
# The definitions this family imports from the site's builders: the timing-eligible cohort (build_pacing.prepare) and the
# sustained-slowdown test (build_public_explorer.threshold_sql). The edition policy is bound by its own file's digest, and
# scripts/verify-linked.cjs compares the counted cohort with the release's published edition-policy list.
SHARED_SCRIPTS = ('build_pacing.py', 'build_public_explorer.py')
FILES = ('editions.json', 'races.json', 'bests.json', 'age.json', 'return.json', 'recorded_again.json', 'checks.json')
TRAIL_FLAGS = ('mountain_or_trail_course', 'trail_or_mountain_word_in_title')   # analysis/race-registry.json: reviewed, and by rule


def log(message: str) -> None:
    print(message, flush=True)


def definitions() -> dict:
    """The frozen numbers, as the manifest carries them (scripts/verify-linked.cjs compares them with its own)."""
    return {
        'min_cell': lc.MIN_CELL, 'min_editions': lc.MIN_EDITIONS, 'min_connected': lc.MIN_CONNECTED, 'min_match_side': lc.MIN_MATCH_SIDE,
        'max_years_apart': lc.MAX_GAP, 'finish_range_s': list(lc.FINISH_RANGE), 'link_tiers': list(lc.LINK_TIERS),
        'high_tiers': list(lc.HIGH_TIERS), 'universe_tiers': list(lc.F_TIERS), 'coverage': list(lc.COVERAGE),
        'never_for_a_reason_other_than_the_split_grid': list(lc.NOT_ABOUT_GRID),
        'year_margin_pct': lc.YEAR_MARGIN_PCT, 'race_band_pct': lc.RACE_BAND_PCT, 'outlier_pct': lc.OUTLIER_PCT, 'field_r_min': lc.FIELD_R_MIN,
        'bests_margin': lc.BESTS_MARGIN, 'age_agree_pct': lc.AGE_AGREE_PCT, 'age_range': list(lc.AGE_RANGE), 'pair_years': list(lc.PAIR_YEARS),
        'step_max_years_apart': lc.STEP_MAX_GAP, 'seed': lc.SEED, 't975': list(lc.T975),
        'timing_classes': {str(k): v for k, v in lc.TIMING_CLASS.items() if k is not None} | {'': lc.TIMING_CLASS[None]},
    }


def universe_counts(u, masks: dict) -> dict:
    e, r = u.editions, u.results
    out = {'editions_with_rows': int(len(e)), **{k: u.counts[k] for k in ('linked_runners', 'keyed_records', 'keys_before_the_screens', 'keyed_records_before_the_screens',
                                                                         'linked_results_outside_the_finish_range')}}
    found = u.reviewed_notes or []
    out['reviewed_notes'] = {'sentences_found': len(found), 'kept': sum(1 for x in found if x['ruling'] == 'kept'), 'excluded': sum(1 for x in found if x['ruling'] == 'excluded')}
    for name, column in (('F', 'in_f'), ('verified', 'in_v'), ('wider', 'in_w')):
        part = e[e[column]]
        kept = r[masks[name]]
        out[name] = {'editions': int(len(part)), 'races': int(part.rkey.nunique()),
                     'editions_by_tier': {tier: int((part.tier == tier).sum()) for tier in sorted(part.tier.unique())},
                     'kept_results': int(len(kept)), 'people': int(kept.person.nunique()),
                     'people_with_two_or_more': int((np.bincount(kept.person.to_numpy()) >= 2).sum())}
    out['high'] = {'kept_results': int(masks['high'].sum()), 'people': int(r[masks['high']].person.nunique())}
    out['complete'] = {'kept_results': int(masks['complete'].sum()), 'people': int(r[masks['complete']].person.nunique())}
    f = e[e.in_f]
    out['F']['editions_by_timing'] = {c: int((f.timing == c).sum()) for c in lc.TIMING_CODES}
    out['F']['editions_by_split_tier'] = {c: int((f.split_tier == c).sum()) for c in sorted(f.split_tier.unique())}
    noted = e[e.series.notna()]
    out['series'] = {'labels': int(noted.label.nunique()), 'races': int(noted.rkey.nunique()), 'editions': int(len(noted))}   # labels that hold several races
    share = u.field_share
    out['counted'] = {'editions': int(len(share)), 'eligible_finishes': int(share.eligible.sum()), 'sustained_slowdowns': int(share.slow.sum())}
    return out


def make_masks(u) -> dict:
    r, e = u.results, u.editions.sort_values('code')
    code = r.edition.to_numpy()
    in_f, in_v, in_w = (e[c].to_numpy()[code] for c in ('in_f', 'in_v', 'in_w'))
    kept_f = np.bincount(r.person.to_numpy()[in_f], minlength=int(r.person.max()) + 1)
    complete = in_f & (kept_f[r.person.to_numpy()] == r.n_any.to_numpy())
    return {'F': in_f, 'verified': in_v, 'wider': in_w, 'high': in_f & r.high.to_numpy(), 'complete': complete}


def manifest(binding: dict, counts: dict, out_bytes: dict, boot: int) -> dict:
    return {
        'schema_version': lc.SCHEMA_VERSION, 'family': 'linked', 'release_tag': binding['release_tag'], 'input_as_of': binding['input_as_of'],
        'input': {'manifest_sha256': binding['input_manifest_sha256'], 'adapter_sha256': binding['adapter_sha256']},
        'policy': {'file': binding['policy_file'], 'sha256': binding['policy_sha256']},
        'registry': {'file': binding['registry_file'], 'sha256': binding['registry_sha256']},
        'links': {'file': binding['link_file'], 'sha256': binding['link_file_sha256'], 'use': 'the age-group-floor flag of a record'},
        'identity': {'file': binding['identity_file'], 'sha256': binding['identity_sha256'], 'builder': 'analysis/build_identity.py',
                     'builder_sha256': binding['identity_builder_sha256']},
        'scripts': {f'analysis/{name}': file_sha256(ANALYSIS / name) for name in SCRIPTS + SHARED_SCRIPTS},
        'definitions': definitions() | {'bootstrap_draws': int(boot)},
        'cohort': counts,
        'files': {name: {'bytes': len(data), 'sha256': bytes_sha256(data)} for name, data in sorted(out_bytes.items())},
    }


def compare_counts(out: Path, new: dict, accept: bool) -> None:
    path = out / 'manifest.json'
    if not path.exists():
        return
    old = json.loads(path.read_text())
    if old.get('cohort') != new['cohort']:
        changes = [f'  {key}: {json.dumps(old.get("cohort", {}).get(key))} -> {json.dumps(new["cohort"].get(key))}'
                   for key in sorted(set(old.get('cohort', {})) | set(new['cohort'])) if old.get('cohort', {}).get(key) != new['cohort'].get(key)]
        print('count changes against the published manifest:\n' + '\n'.join(changes), file=sys.stderr)
        if not accept:
            fail('counts changed; review them, then rebuild with --accept-counts')


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_bytes(data)
    tmp.replace(path)


def run(source: Path, links: Path, identity: Path, out: Path, *, boot: int = lc.BOOT_REPS, accept_counts: bool = False,
        registry_path: Path = lc.REGISTRY_PATH) -> dict:
    started = time.time()
    import linked_universe
    binding = linked_universe.check_inputs(source, links, identity, registry_path=registry_path)
    policy = json.loads((lc.ROOT / binding['policy_file']).read_text())
    registry = json.loads(Path(registry_path).read_text())
    log(f'linked: inputs match their pins ({time.time() - started:.0f} s)')
    u = linked_universe.load(source, links, identity, policy, registry, log=log)
    return assemble(u, binding, registry, out, boot=boot, accept_counts=accept_counts, started=started)


def assemble(u, binding: dict, registry: dict, out: Path, *, boot: int = lc.BOOT_REPS, accept_counts: bool = False, started: float | None = None) -> dict:
    """Everything after the inputs are read: the analyses, the scan of what may be published, the manifest, the files."""
    import resource

    import linked_again
    import linked_histories
    import linked_races
    import linked_return
    import linked_universe
    started = time.time() if started is None else started
    by_label = linked_universe.registry_labels(registry)
    labels = frozenset(by_label)
    series = linked_universe.series_names(registry)
    if 'rkey' not in u.editions.columns:
        fail('the edition table carries no race keys (analysis/linked_universe.py with_series writes them)')
    masks = make_masks(u)
    counts = {'universe': universe_counts(u, masks)}
    log(f"linked: universe F {counts['universe']['F']['editions']} editions, {counts['universe']['F']['kept_results']:,} kept results ({time.time() - started:.0f} s)")

    races = linked_races.build(u.results, u.editions, u.field_share, boot=boot, log=log)
    for label, rows in [*((label, [row]) for label, row in races['races.json']['races'].items()),
                        *((label, list(rows.values())) for label, rows in races['races.json'].get('series', {}).items())]:
        for row in rows:   # so that a page can set a mountain or trail course apart
            row['trail_or_mountain'] = any(f in TRAIL_FLAGS for f in by_label[label].get('flags', []))
    counts.update(races['counts'])
    log(f'linked: readings done ({time.time() - started:.0f} s)')
    history_masks = {k: masks[k] for k in ('F', 'verified', 'high', 'complete')}
    editions = u.editions.sort_values('code').copy()
    editions['race'] = linked_races.race_codes(editions)
    bests = linked_histories.build_bests(u.results, editions, history_masks)
    age = linked_histories.build_age(u.results, editions, history_masks)
    back = linked_return.build(u.results, editions, history_masks, reps=boot)
    again = linked_again.build(u.results, editions, history_masks, u.field_bands, u.field_ages, reps=boot)
    if again is not None and (u.field_bands is None or u.field_ages is None):
        fail('the universe carries no count of every finish by band (analysis/linked_universe.py load writes it)')
    if again is not None and back is not None:   # the table's finishes are the matched comparison's before matching
        raw = back['unmatched']
        if (again['cohort']['finishes'], again['cohort']['recorded_again']) != (
                raw['with_slowdown']['finishes'] + raw['without']['finishes'], raw['with_slowdown']['seen_again'] + raw['without']['seen_again']):
            fail('the recorded-again table and the matched comparison count different finishes')
    counts['bests'] = {k: bests['cohort'][k] for k in ('results_with_an_earlier_recorded_marathon', 'people_with_two_or_more', 'recorded_bests')}
    counts['age'] = {k: age['cohort'][k] for k in ('people_with_an_exact_birth_year', 'pairs', 'pairs_from_the_third_recorded_marathon')}
    counts['return'] = None if back is None else {'cells': back['cells'], 'editions': back['editions'], 'finishes_with_slowdown': back['with_slowdown']['finishes']}
    counts['recorded_again'] = None if again is None else {'finishes': again['cohort']['finishes'], 'recorded_again': again['cohort']['recorded_again'],
                                                           'editions': again['cohort']['editions'], 'rows': {name: len(again[name]) for name in linked_again.TABLES}}
    log(f'linked: histories done ({time.time() - started:.0f} s)')

    families = {'editions.json': races['editions.json'], 'races.json': races['races.json'], 'checks.json': races['checks.json'],
                'bests.json': bests, 'age.json': age}
    if back is not None:
        families['return.json'] = back
    if again is not None:
        families['recorded_again.json'] = again
    out_bytes = {}
    for name, body in families.items():
        value = {'family': 'linked', 'file': name, 'schema_version': lc.SCHEMA_VERSION, **body}
        check_published(value, name, labels, series=series)
        out_bytes[name] = encode(value)
    meta = manifest(binding, counts, out_bytes, boot)
    compare_counts(out, meta, accept_counts)
    for stale in FILES:
        if stale not in out_bytes and (out / stale).exists():
            (out / stale).unlink()
    for name, data in out_bytes.items():
        write(out / name, data)
    write(out / 'manifest.json', encode(meta))
    log(json.dumps({'files': {k: len(v) for k, v in out_bytes.items()}, 'seconds': round(time.time() - started),
                    'peak_rss_mb': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)}))
    return meta


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--input', type=Path, default=Path(os.environ['PACE_INPUT_DIR']) if os.environ.get('PACE_INPUT_DIR') else None,
                        help='the adapted FULL input folder (analysis/adapt_combined.py)')
    parser.add_argument('--links', type=Path, default=None, help=f'the release asset {lc.LINK_ASSET}')
    parser.add_argument('--identity', type=Path, default=None, help='the release\'s identity file (analysis/build_identity.py), with its .json beside it')
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--boot', type=int, default=lc.BOOT_REPS, help='runner bootstrap draws (the published build uses the default)')
    parser.add_argument('--accept-counts', action='store_true', help='accept reviewed count changes (a refresh only)')
    parser.add_argument('--registry', type=Path, default=lc.REGISTRY_PATH, help=argparse.SUPPRESS)   # development only; the verifier pins the real one
    args = parser.parse_args(argv)
    if args.input is None or args.links is None or args.identity is None:
        parser.error('--input, --links and --identity are required')
    try:
        run(args.input.expanduser(), args.links.expanduser(), args.identity.expanduser(), args.out, boot=args.boot, accept_counts=args.accept_counts,
            registry_path=args.registry)
    except LinkedError as error:
        print(f'build_linked: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
