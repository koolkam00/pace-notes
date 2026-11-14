"""Build the half-marathon aggregates, public/data/half/ (docs/HALF_MARATHON.md).

    python3 -I analysis/build_half.py [--core DIR] [--release DIR] [--identity FILE] [--out public/data/half] [--accept-counts]

Reads, read-only and outside the repository, the pinned files of the combined release the site adopts
(pace-notes-marathon-half-20261113-1113, fetched anonymously by analysis/download_half.py and checked against
analysis/half-release.json, schema 4): the CORE members with the half rows, flags, registry and tiers (`--core`), the
two person-link parquet files (`--release`) and the pipeline's identity file (`--identity`, which must be the one the
marathon cohort was built on). Defaults: $PACE_HALF_CORE, $PACE_HALF_RELEASE, $PACE_HALF_IDENTITY, else `core/`,
`release/` and `identity.parquet` under $PACE_HALF_DIR (default ~/data/half-20261113-1113). It applies the frozen
policy (analysis/half-policy-20261113-1113.json, checked against analysis/half_quality.py) and takes the marathon side
from the checked-in marathon cohort (analysis/marathon-cohort).
Writes aggregates only: field.json and women.json (verified half finishes), linked.json and tools/half-to-full.json
(half and marathon records linked by name), cards.json (the card plots, read from those files), then manifest.json,
which binds every file to the pin, the policy, the files read, the identity file, the marathon cohort (and through it
the counted list), the cited marathon files and every builder script. The output is deterministic: two builds give the
same bytes (no timestamps; `as_of` is the release's date).

Every count of the policy, the marathon side and set B is asserted by its module. A rebuild whose policy counts or
cohort differ from the manifest already in --out prints the change and fails unless --accept-counts (a reviewed refresh
only). DuckDB settings: PACE_HALF_DUCKDB_THREADS (default 2), PACE_HALF_DUCKDB_MEMORY (default 4GB),
PACE_HALF_DUCKDB_MAX_TEMP (the spill cap, default 4GB), TMPDIR for spill.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import half_common  # noqa: E402
from half_common import ANALYSIS, OUTPUT, ROOT, HalfError, bytes_sha256, check_published, encode, fail, file_sha256, load_pin  # noqa: E402

SCRIPTS = ('build_half.py', 'half_common.py', 'half_quality.py', 'half_policy_lists.py', 'half_source.py',
           'half_marathon.py', 'half_pairs.py', 'half_field.py', 'half_women.py', 'half_linked.py', 'half_cards.py')
MARATHON_INPUTS = ('insights/finish-times.json', 'charts/womens-share-by-finish-time.json')
FILES = {'field.json': 'verified', 'women.json': 'verified', 'linked.json': 'linked', 'tools/half-to-full.json': 'linked',
         'cards.json': 'per-card'}


def log(message: str) -> None:
    print(message, flush=True)


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


def manifest(pin, policy_sha, module_sha, counts, set_b, marathons, files, out_bytes, digests, link_counts) -> dict:
    import half_source
    from half_pairs import LINK_RULES
    cohort = marathons.manifest
    quality = cohort['source_quality']
    return {
        'schema_version': 3, 'family': 'half', 'as_of': as_of(pin),
        'access': pin['access'], 'repository': pin['repository'], 'license': pin['license'],
        'half': {**{k: pin['half'][k] for k in ('tag', 'key', 'private_tag')},
                 'core_sha256sums_sha256': pin['half']['core']['sha256sums_sha256'],
                 'members': {name: digests[name] for name in sorted(pin['half']['core']['members'])}},
        'links': {**{k: pin['links'][k] for k in ('tag', 'key', 'private_tag', 'applies_to', 'extract_content_sha256')},
                  'assets': {name: digests[name] for name in (half_source.LINKS_FILE, half_source.PERSONS_FILE)},
                  'identity_sha256': digests['identity.parquet'],
                  'ns_keys_sql_sha256': half_source.sql_sha256(half_source.NS_KEYS_SQL),
                  'tables': link_counts},
        'stamps': {'rule': pin['stamps']['rule']},
        'marathon': {'release_tag': cohort['release_tag'], 'cohort_manifest_sha256': marathons.manifest_sha256,
                     'cohort_as_of': cohort['as_of'], 'counted_list_sha256': quality['editions_sha256'],
                     'edition_policy_sha256': quality['policy_sha256'], 'counts': marathons.counts,
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
    """The pin's verified rule must be the one the policy reviewed, and the never-stamp list's provenance the pin's."""
    tiers = reviewed['tiers']
    if pin['stamps']['rule'] != tiers['rule']:
        fail('analysis/half-release.json stamps.rule differs from the rule the policy reviewed')
    ref, frozen = pin['stamps']['never_stamp']['reference'], tiers['never_stamp_from']
    if any(ref.get(k) != frozen[k] for k in ('tag', 'asset', 'sha256')) or pin['stamps']['never_stamp']['rows'] != len(tiers['never_stamp']):
        fail("analysis/half-release.json stamps.never_stamp differs from the policy's frozen never-stamp list")
    if frozen['repository'] != pin['repository']:
        fail('the frozen never-stamp list names another repository than the pin')


def build_families(db, pin, policy, marathons, reviewed, key, policy_sha, module_sha, *, check: bool = True) -> tuple[dict, dict]:
    """Every published family from the applied policy, the marathon side and set B; returns (families, set B's counts)."""
    import half_cards
    import half_field
    import half_linked
    import half_pairs
    import half_quality
    import half_women
    fin = finishes(db)
    pairs = half_pairs.build(db, marathons, pin['links']['key'], check=check)
    set_b = half_pairs.summary(pairs)
    coverage = half_pairs.coverage(db, marathons)
    families = {
        'field.json': half_field.build(fin, policy_sha256=policy_sha, module_sha256=module_sha,
                                       label_countries=reviewed['label_countries']),
        'women.json': half_women.build(fin, policy.editions, marathons, reviewed['rules']['same_city_labels']),
    }
    families['linked.json'], families['tools/half-to-full.json'], _ = half_linked.build(pairs, coverage=coverage,
                                                                                    **half_quality.battery_lists(key))
    families['cards.json'] = half_cards.build(families['field.json'], families['women.json'], families['linked.json'])
    return families, set_b


def run(source, out: Path, accept_counts: bool = False) -> dict:
    started = time.time()
    import half_cards
    import half_marathon
    import half_quality
    import half_source
    pin = load_pin()
    key = pin['half']['key']
    if key != half_quality.TAG or pin['policy'] != half_quality.REVIEWED_HALF_POLICIES[half_quality.TAG]['file']:
        fail('the pin and the reviewed policy name different releases or policy files')
    reviewed = half_quality.REVIEWED_HALF_POLICIES[key]
    policy_sha = half_quality.check_policy_file(key)
    module_sha = half_quality.module_sha256()
    check_policy_pin(pin, reviewed)
    half_common.pinned_digest(pin)
    digests = half_source.check_files(pin, source)
    log(f'the release files and the identity file match the pin and the marathon cohort ({time.time() - started:.0f} s)')

    db = half_common.connect()
    half_source.attach(db, source)
    policy = half_quality.apply(db, key)
    log(f"policy applied: {policy.counts['use_finish']['finishes']:,} usable finishes ({time.time() - started:.0f} s)")
    marathons = half_marathon.load()
    log(f'marathon side: {marathons.n:,} eligible finishes ({time.time() - started:.0f} s)')
    link_counts = half_source.link_tables(db, source)
    log(f"link tables: {link_counts['people']:,} people, {link_counts['links']:,} rows ({time.time() - started:.0f} s)")
    families, set_b = build_families(db, pin, policy, marathons, reviewed, key, policy_sha, module_sha)
    log(f"set B: {set_b['pairs']:,} pairs ({time.time() - started:.0f} s)")
    db.close()

    out_bytes = {}
    for name, value in families.items():
        check_published(value, name, extra_string_keys=half_cards.PLOT_STRING_KEYS if name == 'cards.json' else frozenset())
        out_bytes[name] = encode(value)
    meta = manifest(pin, policy_sha, module_sha, policy.counts, set_b, marathons, FILES, out_bytes, digests, link_counts)
    compare_counts(out, meta, accept_counts)
    for name, data in out_bytes.items():
        write(out / name, data)
    write(out / 'manifest.json', encode(meta))
    log(json.dumps({'files': {k: len(v) for k, v in out_bytes.items()}, 'seconds': round(time.time() - started)}))
    return meta


def main(argv=None) -> int:
    import half_source
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--core', type=Path, default=None, help='the unpacked CORE folder of the pinned release')
    parser.add_argument('--release', type=Path, default=None, help="the folder of the release's assets (the person-link parquet files)")
    parser.add_argument('--identity', type=Path, default=None, help="the pipeline's identity.parquet")
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--accept-counts', action='store_true', help='accept reviewed count changes (a refresh only)')
    args = parser.parse_args(argv)
    try:
        run(half_source.default_source(args.core, args.release, args.identity), args.out, args.accept_counts)
    except HalfError as error:
        print(f'build_half: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
