"""Build the half-marathon aggregates, public/data/half/ (docs/HALF_MARATHON.md; spec 2).

    python3 -I analysis/build_half.py --half "$PACE_HALF_DIR/platform_half.sqlite" --links "$PACE_HALF_DIR/links-v4.sqlite" \
        [--stamp-reference "$PACE_HALF_DIR/half-dataset-20261029-2157/csv-edition_meta.csv.zst"] \
        [--edition-meta "$PACE_HALF_DIR/csv-edition_meta.csv.zst"] [--out public/data/half] [--accept-counts]

Reads the half snapshot and the links extract read-only (the owner's public CC BY 4.0 release half-dataset-20261030-1904
with person links v4, fetched by analysis/download_half.py outside the repository and checked against
analysis/half-release.json, schema 3), this release's csv-edition_meta and the stamp reference of half-dataset-20261029-2157
(verified = stamped in the snapshot's own edition_meta, cross-checked; both sha256 pinned), the frozen policy
(analysis/half-policy-20261030-1904.json, checked against analysis/half_quality.py), and the marathon side from public
files only (the runner shards and the weather evidence).
Writes aggregates only: field.json and women.json (verified half finishes), linked.json and tools/half-to-full.json
(half and marathon records linked by name), cards.json (the four card plots, read from those files), then
manifest.json, which binds every file to the pin, the policy, the adopted marathon release, the runner manifest, the
weather evidence, the cited marathon files and every builder script. The output is deterministic: two builds give the same bytes (no timestamps; `as_of` is the snapshot's date).

Every count of the policy, the marathon side and set B is asserted by its module. A rebuild whose policy counts or
cohort differ from the manifest already in --out prints the change and fails unless --accept-counts (a reviewed refresh
only). DuckDB settings: PACE_HALF_DUCKDB_THREADS (default 2), PACE_HALF_DUCKDB_MEMORY (default 4GB),
PACE_HALF_DUCKDB_MAX_TEMP (the spill cap, default 4GB), TMPDIR for spill.
"""
from __future__ import annotations

import argparse
import json
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
    """The half snapshot's sha and the links extract's content digest and link build must equal the pin."""
    for path, what in ((half, '--half'), (links, '--links')):
        if not path.is_file():
            fail(f'{what}: missing {path}')
        if half_common.inside(path, ROOT):
            fail(f'{what}: {path} is inside the repository; record-level sources stay outside it (pages publish aggregates)')
    if half.name != pin['half']['sqlite']:
        fail(f"--half must be the pinned {pin['half']['sqlite']}")
    if links.name != pin['links']['extract']:
        fail(f"--links must be the pinned {pin['links']['extract']}")
    half_common.check_no_wal(half)
    pinned = half_common.pinned_digest(pin)
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
    if digest != pinned or build.get('extract_content_sha256') != digest:
        fail(f'{links} is not the pinned links extract (content sha256 {digest})')
    if build.get('links_key') != pin['links']['key'] or build.get('applies_to') != pin['links']['applies_to']:
        fail(f'{links} was cut from another link build or for another snapshot')


def finishes(db):
    """use_finish finishes after R7 as a pandas frame (edition_id, city label, verified, sex, use_sex, finish_s)."""
    db.execute("CREATE TYPE IF NOT EXISTS half_sex AS ENUM ('F', 'M')")
    db.execute("CREATE TYPE IF NOT EXISTS half_label AS ENUM (SELECT DISTINCT city FROM hfin WHERE city IS NOT NULL ORDER BY city)")
    fin = db.execute("""SELECT edition_id, city::half_label AS city, status_group = 'verified' AS verified, sex::half_sex AS sex,
        use_sex, finish_s FROM hfin WHERE NOT r7_block ORDER BY edition_id, finish_s""").df()
    return fin


def as_of(pin: dict) -> str:
    """The snapshot's date, from half.key (schema 3; private_tag may be null)."""
    return half_common.snapshot_date(pin)


def manifest(pin, policy_sha, module_sha, counts, set_b, marathons, files, out_bytes) -> dict:
    runner_manifest = json.loads((ROOT / 'public/data/runners/manifest.json').read_text())
    from half_pairs import LINK_RULES
    return {
        'schema_version': 2, 'family': 'half', 'as_of': as_of(pin),
        'access': pin['access'], 'repository': pin['repository'], 'license': pin['license'],
        'half': {k: pin['half'][k] for k in ('tag', 'key', 'private_tag', 'sqlite_sha256')},
        'links': {**{k: pin['links'][k] for k in ('tag', 'key', 'private_tag', 'applies_to', 'extract_content_sha256')},
                  'coverage': {k: pin['links']['coverage'][k] for k in ('half_rows', 'half_max_record_id', 'marathon_rows')}},
        'stamps': {'rule': pin['stamps']['rule'], 'reference': {k: pin['stamps']['reference'][k] for k in ('tag', 'asset', 'sha256')}},
        'marathon': {'release_tag': runner_manifest['release_tag'], 'runner_manifest_sha256': marathons.manifest_sha256,
                     'runner_manifest_as_of': runner_manifest['as_of'], 'weather_evidence_sha256': marathons.weather_sha256,
                     'inputs': {name: file_sha256(ROOT / 'public/data' / name) for name in MARATHON_INPUTS}},
        'policy': {'file': pin['policy'], 'sha256': policy_sha, 'module_sha256': module_sha,
                   'counts': {**counts, 'set_b': {k: set_b[k] for k in ('pairs', 'people', 'marathon_editions', 'half_editions',
                                                                     'halves_in_two_or_more_pairs', 'pairs_with_a_close_marathon')}}},
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


def check_policy_pin(pin: dict, reviewed: dict) -> None:
    """The pin's stamps, edition_meta CSV and link-build boundary must be the ones the policy reviewed."""
    stamps = reviewed['stamps']
    ref = pin['stamps']['reference']
    for key in ('tag', 'asset', 'sha256', 'readme_sha256'):
        if ref.get(key) != stamps['reference'][key]:
            fail(f'analysis/half-release.json stamps.reference.{key} differs from the reviewed stamp reference')
    if stamps['reference']['repository'] != pin['repository'] or pin['stamps']['rule'] != stamps['rule']:
        fail('the reviewed stamp reference names another repository or rule than the pin')
    csv = stamps['edition_meta_csv']
    if pin['half']['assets'].get(csv['asset']) != csv['sha256']:
        fail(f"analysis/half-release.json half.assets {csv['asset']} differs from the policy's reviewed edition_meta CSV")
    le = reviewed['link_editions']
    if le['link_build'] != pin['links']['key'] or le['half_max_record_id'] != pin['links']['coverage']['half_max_record_id']:
        fail("the policy's link-build editions were reviewed for another link build or coverage boundary")


def run(half: Path, links: Path, out: Path, accept_counts: bool = False, stamp_reference: Path | None = None,
        edition_meta: Path | None = None) -> dict:
    started = time.time()
    import half_cards
    import half_field
    import half_linked
    import half_marathon
    import half_pairs
    import half_quality
    import half_women
    pin = load_pin()
    key = pin['half']['key']
    if key != half_quality.TAG or pin['policy'] != half_quality.REVIEWED_HALF_POLICIES[half_quality.TAG]['file']:
        fail('the pin and the reviewed policy name different snapshots or policy files')
    reviewed = half_quality.REVIEWED_HALF_POLICIES[key]
    policy_sha = half_quality.check_policy_file(key)
    module_sha = half_quality.module_sha256()
    check_policy_pin(pin, reviewed)
    check_sources(pin, half, links)
    stamp_inputs = half_quality.read_stamp_inputs(key, stamp_reference, edition_meta)
    log(f'sources, the stamp reference and the edition_meta CSV match the pin ({time.time() - started:.0f} s)')

    db = half_common.connect(half=half, links=links)
    policy = half_quality.apply(db, key, stamp_inputs=stamp_inputs)
    fin = finishes(db)
    log(f"policy applied: {policy.counts['use_finish']['finishes']:,} usable finishes ({time.time() - started:.0f} s)")
    marathons = half_marathon.load()
    log(f'marathon side: {marathons.n:,} eligible finishes ({time.time() - started:.0f} s)')
    link_editions = half_quality.link_editions(key)
    pairs = half_pairs.build(db, marathons, pin['links']['key'], link_editions=link_editions)
    set_b = half_pairs.summary(pairs)
    coverage = half_pairs.coverage(db, marathons, link_editions=link_editions)
    log(f"set B: {set_b['pairs']:,} pairs ({time.time() - started:.0f} s)")
    db.close()

    families = {
        'field.json': half_field.build(fin, policy_sha256=policy_sha, module_sha256=module_sha,
                                       label_countries=reviewed['label_countries']),
        'women.json': half_women.build(fin, policy.editions, marathons, reviewed['rules']['same_city_labels']),
    }
    families['linked.json'], families['tools/half-to-full.json'], _ = half_linked.build(pairs, coverage=coverage,
                                                                                    **half_quality.battery_lists(key))
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
    import half_quality
    half_dir = half_quality.half_dir()
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--half', type=Path, default=half_dir / 'platform_half.sqlite', help='the half snapshot (platform_half.sqlite)')
    parser.add_argument('--links', type=Path, default=half_dir / 'links-v4.sqlite', help='the links extract (links-v4.sqlite)')
    parser.add_argument('--stamp-reference', type=Path, default=None,
                        help='the pinned stamp reference CSV (default $PACE_HALF_DIR/<reference tag>/csv-edition_meta.csv.zst)')
    parser.add_argument('--edition-meta', type=Path, default=None,
                        help="this release's csv-edition_meta.csv.zst (default $PACE_HALF_DIR/csv-edition_meta.csv.zst)")
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--accept-counts', action='store_true', help='accept reviewed count changes (a refresh only)')
    args = parser.parse_args(argv)
    try:
        run(args.half.expanduser(), args.links.expanduser(), args.out, args.accept_counts,
            args.stamp_reference.expanduser() if args.stamp_reference else None,
            args.edition_meta.expanduser() if args.edition_meta else None)
    except HalfError as error:
        print(f'build_half: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
