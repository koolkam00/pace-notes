"""Build the half-marathon aggregates, public/data/half/ (docs/HALF_MARATHON.md; spec 2).

    python3 -I analysis/build_half.py --half "$PACE_HALF_DIR/platform_half.sqlite" --links "$PACE_HALF_DIR/links-slim.sqlite" \
        [--corrected-meta "$PACE_HALF_DIR/half-dataset-20261029-2157/csv-edition_meta.csv.zst"] [--out public/data/half] [--accept-counts]

Reads the half snapshot and the links extract read-only (the owner's public CC BY 4.0 release half-dataset-20261029-1202,
fetched by analysis/download_half.py outside the repository and checked against analysis/half-release.json), the
corrected edition metadata of half-dataset-20261029-2157 (verified = stamped in both; its sha256 is pinned), the frozen
policy (analysis/half-policy-20261029-1133.json, checked against analysis/half_quality.py), and the marathon side from
public files only (the runner shards and the weather evidence).
Writes aggregates only: field.json and women.json (verified half finishes), linked.json and tools/half-to-full.json
(half and marathon records linked by name), cards.json (the four card plots, read from those files), then
manifest.json, which binds every file to the pin, the policy, the adopted marathon release, the runner manifest, the
weather evidence, the cited marathon files and every builder script. The output is deterministic: two builds give the same bytes (no timestamps; `as_of` is the snapshot's date).

Every count of the policy, the marathon side and set B is asserted by its module. A rebuild whose policy counts or
cohort differ from the manifest already in --out prints the change and fails unless --accept-counts (a reviewed refresh
only). DuckDB settings: PACE_HALF_DUCKDB_THREADS (default 2), PACE_HALF_DUCKDB_MEMORY (default 4GB), TMPDIR for spill.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import half_common  # noqa: E402
from half_common import ANALYSIS, OUTPUT, ROOT, HalfError, bytes_sha256, check_published, encode, fail, file_sha256, load_pin  # noqa: E402

SCRIPTS = ('build_half.py', 'half_common.py', 'half_quality.py', 'half_policy_lists.py', 'half_links_extract.py',
           'half_marathon.py', 'half_pairs.py', 'half_field.py', 'half_women.py', 'half_linked.py', 'half_cards.py')
MARATHON_INPUTS = ('insights/finish-times.json', 'charts/womens-share-by-finish-time.json')
FILES = {'field.json': 'verified', 'women.json': 'verified', 'linked.json': 'linked', 'tools/half-to-full.json': 'linked',
         'cards.json': 'per-card'}


def log(message: str) -> None:
    print(message, flush=True)


def check_sources(pin: dict, half: Path, links: Path) -> None:
    """The half snapshot's sha and the links extract's content digest must equal the pin."""
    for path, what in ((half, '--half'), (links, '--links')):
        if not path.is_file():
            fail(f'{what}: missing {path}')
        if half_common.inside(path, ROOT):
            fail(f'{what}: {path} is inside the repository; record-level sources stay outside it (pages publish aggregates)')
    if half.name != pin['half']['sqlite']:
        fail(f"--half must be the pinned {pin['half']['sqlite']}")
    if links.name != pin['links']['extract']:
        fail(f"--links must be the pinned {pin['links']['extract']}")
    sha = file_sha256(half)
    if sha != pin['half']['sqlite_sha256']:
        fail(f'{half} is not the pinned half snapshot (sha256 {sha})')
    import half_links_extract
    con = sqlite3.connect(f'file:{links.as_posix()}?mode=ro', uri=True)
    try:
        build = dict(con.execute('SELECT k, v FROM build').fetchall())
        digest = half_links_extract.content_sha256(con)
    finally:
        con.close()
    if digest != pin['links']['extract_content_sha256'] or build.get('extract_content_sha256') != digest:
        fail(f'{links} is not the pinned links extract (content sha256 {digest})')
    if build.get('links_tag') != pin['links']['private_tag'] or build.get('pairs_with') != pin['half']['private_tag']:
        fail(f'{links} was cut from another link build')


def finishes(db):
    """use_finish finishes after R7 as a pandas frame (edition_id, city label, verified, sex, use_sex, finish_s)."""
    db.execute("CREATE TYPE IF NOT EXISTS half_sex AS ENUM ('F', 'M')")
    db.execute("CREATE TYPE IF NOT EXISTS half_label AS ENUM (SELECT DISTINCT city FROM hfin WHERE city IS NOT NULL ORDER BY city)")
    fin = db.execute("""SELECT edition_id, city::half_label AS city, status_group = 'verified' AS verified, sex::half_sex AS sex,
        use_sex, finish_s FROM hfin WHERE NOT r7_block ORDER BY edition_id, finish_s""").df()
    return fin


def as_of(pin: dict) -> str:
    m = re.search(r'(\d{4})(\d{2})(\d{2})-\d{4}$', pin['half']['private_tag'])
    if not m:
        fail(f"cannot read a date from the half snapshot tag {pin['half']['private_tag']}")
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}'


def manifest(pin, policy_sha, module_sha, counts, set_b, marathons, files, out_bytes) -> dict:
    runner_manifest = json.loads((ROOT / 'public/data/runners/manifest.json').read_text())
    from half_pairs import LINK_RULES
    return {
        'schema_version': 1, 'family': 'half', 'as_of': as_of(pin),
        'access': pin['access'], 'repository': pin['repository'], 'license': pin['license'],
        'half': {'tag': pin['half']['tag'], 'private_tag': pin['half']['private_tag'], 'sqlite_sha256': pin['half']['sqlite_sha256']},
        'links': {'tag': pin['links']['tag'], 'private_tag': pin['links']['private_tag'],
                  'extract_content_sha256': pin['links']['extract_content_sha256']},
        'metadata_correction': {k: pin['metadata_correction'][k] for k in ('tag', 'asset', 'sha256', 'applied')},
        'marathon': {'release_tag': runner_manifest['release_tag'], 'runner_manifest_sha256': marathons.manifest_sha256,
                     'runner_manifest_as_of': runner_manifest['as_of'], 'weather_evidence_sha256': marathons.weather_sha256,
                     'inputs': {name: file_sha256(ROOT / 'public/data' / name) for name in MARATHON_INPUTS}},
        'policy': {'file': pin['policy'], 'sha256': policy_sha, 'module_sha256': module_sha,
                   'counts': {**counts, 'set_b': {k: set_b[k] for k in ('pairs', 'people', 'marathon_editions', 'half_editions')}}},
        'link_rules': LINK_RULES,
        'scripts': {f'analysis/{name}': file_sha256(ANALYSIS / name) for name in SCRIPTS},
        'cohort': {'verified': counts['verified'], 'usable': counts['use_finish'],
                   'linked': {k: set_b[k] for k in ('pairs', 'marathon_editions', 'half_editions')}},
        'files': {name: {'bytes': len(out_bytes[name]), 'sha256': bytes_sha256(out_bytes[name]), 'scope': files[name]} for name in sorted(out_bytes)},
    }


def compare_counts(out: Path, new: dict, accept: bool) -> None:
    path = out / 'manifest.json'
    if not path.exists():
        return
    old = json.loads(path.read_text())
    changes = []
    for key in ('counts',):
        a, b = old.get('policy', {}).get(key), new['policy'][key]
        if a != b:
            changes.append(f'policy.{key}: {json.dumps(a)} -> {json.dumps(b)}')
    if old.get('cohort') != new['cohort']:
        changes.append(f"cohort: {json.dumps(old.get('cohort'))} -> {json.dumps(new['cohort'])}")
    if changes:
        print('count changes against the published manifest:\n  ' + '\n  '.join(changes), file=sys.stderr)
        if not accept:
            fail('counts changed; review them, then rebuild with --accept-counts')


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_bytes(data)
    tmp.replace(path)


def check_correction_pin(pin: dict, correction: dict) -> None:
    """The pin's metadata correction must be the one the policy reviewed."""
    mc = pin.get('metadata_correction') or {}
    for key in ('tag', 'asset', 'sha256', 'readme_sha256', 'applied'):
        if mc.get(key) != correction[key]:
            fail(f'analysis/half-release.json metadata_correction.{key} differs from the reviewed stamp correction')
    if correction['repository'] != pin['repository']:
        fail('the reviewed stamp correction names another repository than the pin')


def run(half: Path, links: Path, out: Path, accept_counts: bool = False, corrected_meta: Path | None = None) -> dict:
    started = time.time()
    import half_cards
    import half_field
    import half_linked
    import half_marathon
    import half_pairs
    import half_quality
    import half_women
    pin = load_pin()
    if pin['half']['private_tag'] != half_quality.TAG or pin['policy'] != half_quality.REVIEWED_HALF_POLICIES[half_quality.TAG]['file']:
        fail('the pin and the reviewed policy name different snapshots or policy files')
    policy_sha = half_quality.check_policy_file(half_quality.TAG)
    module_sha = half_quality.module_sha256()
    correction = half_quality.REVIEWED_HALF_POLICIES[half_quality.TAG]['correction']
    check_correction_pin(pin, correction)
    check_sources(pin, half, links)
    rows = half_quality.read_correction(corrected_meta or half_quality.default_correction_path(), correction)
    log(f'sources and the corrected metadata match the pin ({time.time() - started:.0f} s)')

    db = half_common.connect(half=half, links=links)
    policy = half_quality.apply(db, half_quality.TAG, correction_rows=rows)
    fin = finishes(db)
    log(f"policy applied: {policy.counts['use_finish']['finishes']:,} usable finishes ({time.time() - started:.0f} s)")
    marathons = half_marathon.load()
    log(f'marathon side: {marathons.n:,} eligible finishes ({time.time() - started:.0f} s)')
    pairs = half_pairs.build(db, marathons, pin['links']['private_tag'])
    set_b = half_pairs.summary(pairs)
    coverage = half_pairs.coverage(db, marathons)
    log(f"set B: {set_b['pairs']:,} pairs ({time.time() - started:.0f} s)")
    db.close()

    families = {
        'field.json': half_field.build(fin, policy_sha256=policy_sha, module_sha256=module_sha,
                                       label_countries=half_quality.REVIEWED_HALF_POLICIES[half_quality.TAG]['label_countries']),
        'women.json': half_women.build(fin, policy.editions, marathons, half_quality.SAME_CITY_LABELS),
    }
    families['linked.json'], families['tools/half-to-full.json'], _ = half_linked.build(pairs, coverage=coverage)
    families['cards.json'] = half_cards.build(families['field.json'], families['women.json'], families['linked.json'])
    out_bytes = {}
    for name, value in families.items():
        check_published(value, name, extra_string_keys=half_cards.PLOT_STRING_KEYS if name == 'cards.json' else frozenset())
        out_bytes[name] = encode(value)
    meta = manifest(pin, policy_sha, module_sha, policy.counts, set_b, marathons, FILES, out_bytes)
    compare_counts(out, meta, accept_counts)
    for name, data in out_bytes.items():
        write(out / name, data)
    write(out / 'manifest.json', encode(meta))
    log(json.dumps({'files': {k: len(v) for k, v in out_bytes.items()}, 'seconds': round(time.time() - started)}))
    return meta


def main(argv=None) -> int:
    half_dir = Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1133')
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--half', type=Path, default=half_dir / 'platform_half.sqlite', help='the half snapshot (platform_half.sqlite)')
    parser.add_argument('--links', type=Path, default=half_dir / 'links-slim.sqlite', help='the links extract (links-slim.sqlite)')
    parser.add_argument('--corrected-meta', type=Path, default=None,
                        help='the corrected edition_meta CSV of the pinned metadata correction (default $PACE_HALF_DIR/<tag>/<asset>)')
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--accept-counts', action='store_true', help='accept reviewed count changes (a refresh only)')
    args = parser.parse_args(argv)
    try:
        run(args.half.expanduser(), args.links.expanduser(), args.out, args.accept_counts,
            args.corrected_meta.expanduser() if args.corrected_meta else None)
    except HalfError as error:
        print(f'build_half: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
