"""The inputs of the linked-records family: the edition sets, the linked runners and their kept results.

Everything here is a frozen rule of docs/LINKED_RECORDS.md:

- **F**, the finish-time universe (plan decision D22): an edition with rows whose tier is stamped or weaker-source
  stamped, or partial with its finishes within 5% of the official count; never an edition the edition policy lists
  for a reason that is not about its split grid. **V** is F without the partial editions; **W** is F with the
  unverified editions that the policy lists for no other reason (a sensitivity reading, never published as a figure).
- **A linked runner** is a runner key of the release's identity file (analysis/build_identity.py; plan decision
  D24.2): the producer's person id of a link of high_elite, high or medium whose person passes three screens over
  all of its keyed rows, marathon and half together: at most one recorded sex, birth years at most two apart, never
  two results in one edition. No builder of this family derives a key itself.
- **A kept result** is a record of a linked runner in W with a finish time from 2:00:00 to 12:00:00.
- **An exact birth year** comes only from a record whose age key is a birth year and that the link build does not flag
  as an age-group floor; a runner has one when such records exist and agree to within one year.
- **The whole field's sustained-slowdown share** of a counted edition is read with the site's own cohort code
  (build_pacing.prepare and build_public_explorer.threshold_sql): no link enters it.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

import linked_common as lc
from linked_common import fail

SEX_CODE = {'M': 1, 'F': 2}
TIER_CODE = {tier: i for i, tier in enumerate(('stamped', 'stamped_weaker_source', 'partial', 'unverified'))}
TIERS = tuple(TIER_CODE)
INPUT_MEMBERS = ('features.parquet', 'edition_meta.parquet', 'race_conditions.parquet', 'race_records.parquet', 'EDITIONS.json')
IDENTITY_BUILDER = 'build_identity.py'


# ---------------------------------------------------------------------------------------------------------------
# Input checks
# ---------------------------------------------------------------------------------------------------------------
def check_inputs(source: Path, links: Path, identity: Path, *, release_path: Path = lc.RELEASE_PATH, registry_path: Path = lc.REGISTRY_PATH) -> dict:
    """The adapted input, the link file, the identity file, the edition policy and the race registry must be the pinned
    ones, and the identity file must have been built from this input, this link file and the identity builder in the
    repository.

    Returns what the manifest binds: the release tag, the adapted input's manifest digest and time, the policy file
    and digest, the registry digest, the link file's digest, and the identity file's digest with its builder's."""
    import source_quality
    source, links, identity = Path(source), Path(links), Path(identity)
    for path in (source, links, identity):
        if lc.inside(path, lc.ROOT):
            fail(f'{path} is inside the repository; record-level sources stay outside it (the family publishes aggregates)')
    release = json.loads(release_path.read_text())
    tag = release['tag']
    provenance = json.loads((source / 'provenance.json').read_text())
    if provenance.get('release_tag') != tag:
        fail(f"the adapted input is {provenance.get('release_tag')}, the adopted release is {tag}")
    manifest_bytes = (source / 'MANIFEST.json').read_bytes()
    manifest_sha = lc.bytes_sha256(manifest_bytes)
    manifest = json.loads(manifest_bytes)
    if provenance.get('manifest_sha256') != manifest_sha:
        fail('the adapted input: provenance.json names another MANIFEST.json than the one beside it')
    for name in INPUT_MEMBERS:
        digest = lc.file_sha256(source / name)
        if manifest['files'].get(name, {}).get('sha256') != digest:
            fail(f'the adapted input: {name} is not the file its MANIFEST.json lists (sha256 {digest})')
    if tag not in source_quality.REVIEWED_POLICIES:
        fail(f'no reviewed edition policy for {tag}')
    policy_path = policy_file(tag)
    policy_bytes = policy_path.read_bytes()
    policy = json.loads(policy_bytes)
    if policy['tag'] != tag or policy['inputs']['adapted_manifest_sha256'] != manifest_sha:
        fail(f"the edition policy was frozen on another adapted input ({policy['inputs']['adapted_manifest_sha256']}) than this one ({manifest_sha}); "
             're-adapt or refreeze the policy before any linked build')
    registry_bytes = registry_path.read_bytes()
    registry = json.loads(registry_bytes)
    if registry['tag'] != tag or registry.get('distance') != 'marathon':
        fail('the race registry is for another release or distance')
    if policy['inputs'].get('race_registry_sha256') != lc.bytes_sha256(registry_bytes):
        fail('the edition policy was frozen on another race registry than analysis/race-registry.json')
    link_sha = lc.file_sha256(links)
    if links.name != lc.LINK_ASSET or release['assets'].get(lc.LINK_ASSET) != link_sha:
        fail(f'{links} is not the pinned {lc.LINK_ASSET} (sha256 {link_sha})')
    return {
        **check_identity(identity, tag, manifest_sha, link_sha),
        'release_tag': tag, 'input_manifest_sha256': manifest_sha, 'input_as_of': manifest['created_at'],
        'adapter_sha256': manifest['adapter']['sha256'],
        'policy_file': f'analysis/{policy_path.name}', 'policy_sha256': lc.bytes_sha256(policy_bytes),
        'registry_file': f'analysis/{registry_path.name}', 'registry_sha256': lc.bytes_sha256(registry_bytes),
        'link_file': lc.LINK_ASSET, 'link_file_sha256': link_sha,
    }


def check_identity(identity: Path, tag: str, manifest_sha: str, link_sha: str, *, builder: Path | None = None) -> dict:
    """The identity file states beside itself (`<file>.json`) what it was built from; each must be what this build reads:
    the file itself, the release, the adapted input, the link file, and the identity builder in the repository."""
    identity = Path(identity)
    builder = lc.ANALYSIS / IDENTITY_BUILDER if builder is None else Path(builder)
    side = Path(f'{identity}.json')
    if not identity.is_file() or not side.is_file():
        fail(f'{identity}: the identity file or the .json beside it is missing (analysis/{IDENTITY_BUILDER} writes both)')
    sidecar = json.loads(side.read_text())
    identity_sha, builder_sha = lc.file_sha256(identity), lc.file_sha256(builder)
    if sidecar.get('file', {}).get('sha256') != identity_sha:
        fail(f'{identity} is not the file its .json describes (sha256 {identity_sha})')
    if sidecar.get('release_tag') != tag or sidecar.get('input_manifest_sha256') != manifest_sha or sidecar.get('link_file', {}).get('sha256') != link_sha:
        fail(f'{identity} was built for another release, adapted input or link file; rebuild it (analysis/{IDENTITY_BUILDER})')
    if sidecar.get('scripts', {}).get(IDENTITY_BUILDER) != builder_sha:
        fail(f'{identity} was built by another analysis/{IDENTITY_BUILDER} than the one in the repository; rebuild it')
    return {'identity_file': identity.name, 'identity_sha256': identity_sha, 'identity_builder_sha256': builder_sha}


def policy_file(tag: str) -> Path:
    import source_quality
    path = getattr(source_quality, 'POLICY_FILE_20261113_1113', None)
    if tag != getattr(source_quality, 'RELEASE_20261113_1113', None) or path is None:
        fail(f'analysis/linked_universe.py knows no frozen policy file for {tag}; add it with the adoption that pins that release')
    # The import above already refused the file when its digest is not the one analysis/source_quality.py pins.
    return Path(path)


def registry_labels(registry: dict) -> dict:
    """label -> race entry. A registry written before plan decision D19 has no `label`; its plain keys label themselves."""
    out = {}
    for race in registry['races']:
        label = race.get('label')
        if label is None:
            fail('the race registry has no labels yet (plan decision D19): rebuild it before a linked build')
        if label in out:
            fail(f'the race registry repeats the label {label!r}')
        out[label] = race
    return out


# ---------------------------------------------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------------------------------------------
def classify_editions(meta: list[dict], editions_json: list[dict], policy: dict) -> pd.DataFrame:
    """One row per edition with rows, in (label, year) order, with its tier, timing code and the sets it belongs to.

    `meta` rows: city, year, verification_tier, split_tier, timing_basis. `editions_json` rows: city, year, n_records,
    finishes_in_release, official_finishers. `policy`: the frozen edition policy (counted list, listed editions)."""
    facts = {(e['city'], e['year']): e for e in editions_json if e['n_records']}
    tiers = {(m['city'], m['year']): m for m in meta}
    counted = {(c, y) for c, y in policy['counted']}
    listed = {(e['city'], e['year']): e['category'] for e in policy['editions']}
    if counted & set(listed) or (counted | set(listed)) != set(facts):
        fail('the edition policy and EDITIONS.json name different editions with rows')
    rows = []
    for key in sorted(facts):
        e, m = facts[key], tiers.get(key)
        if m is None:
            fail(f'{key}: an edition with rows has no edition_meta row')
        tier, basis = m['verification_tier'], m['timing_basis']
        if basis not in lc.TIMING_CLASS:
            fail(f'{key}: the timing basis {basis!r} is not classed in analysis/linked_common.py TIMING_CLASS; class it in a reviewed change')
        official = e['official_finishers']
        coverage = e['finishes_in_release'] / official if official else None
        tier_ok = tier in lc.VERIFIED_TIERS or (tier == 'partial' and coverage is not None and lc.COVERAGE[0] <= coverage <= lc.COVERAGE[1])
        category = listed.get(key)
        clean = category not in lc.NOT_ABOUT_GRID
        in_f = tier_ok and clean
        in_w = (tier_ok or tier == 'unverified') and clean
        if key in counted and not (in_f and m['split_tier'] == 'splits'):
            fail(f'{key}: the policy counts an edition that the finish-time universe leaves out')
        if in_f and key not in counted and category not in lc.ABOUT_GRID:
            fail(f'{key}: in the finish-time universe but listed by the policy as {category}, which is not about its split grid')
        if tier == 'partial' and m['split_tier'] == 'splits' and clean and (not tier_ok) != (category == 'partial_coverage'):
            fail(f'{key}: this module and the edition policy read the 5% coverage band differently')
        timing = lc.TIMING_CLASS[basis]
        rows.append(dict(label=key[0], year=int(key[1]), tier=tier, split_tier=m['split_tier'], timing=timing, basis=lc.TIMING_BASIS[timing],
                         in_f=in_f, in_v=in_f and tier in lc.VERIFIED_TIERS, in_w=in_w, counted=key in counted, category=category,
                         finishes=int(e['n_finishes'])))
    return pd.DataFrame(rows)


@dataclass
class Universe:
    """Everything the analyses read, as plain arrays (no name, no record id, no person id)."""
    editions: pd.DataFrame          # one row per edition with rows; index = edition code
    results: pd.DataFrame           # kept results of linked runners in W, sorted by (person, year, edition)
    field_share: pd.DataFrame       # counted editions: edition code, eligible finishes, sustained slowdowns
    counts: dict = field(default_factory=dict)


def load(source: Path, links: Path, identity: Path, policy: dict, registry: dict, *, log=print) -> Universe:
    """Read the adapted input, the identity file's runner keys and the link file's age-group-floor flag through DuckDB
    into arrays."""
    from build_pacing import prepare
    from build_public_explorer import RATIO_EPSILON, threshold_sql
    source = Path(source)
    labels = registry_labels(registry)
    db = lc.connect()
    q = lambda p: str(p).replace("'", "''")  # noqa: E731
    db.execute(f"CREATE TEMP VIEW features AS SELECT * FROM read_parquet('{q(source / 'features.parquet')}')")
    meta = db.execute(f"""SELECT city, year, verification_tier, split_tier, timing_basis FROM read_parquet('{q(source / 'edition_meta.parquet')}')
        WHERE verification_tier <> 'excluded'""").df().to_dict('records')
    for row in meta:
        row['timing_basis'] = None if row['timing_basis'] is None or (isinstance(row['timing_basis'], float) and np.isnan(row['timing_basis'])) else row['timing_basis']
    editions_json = json.loads((source / 'EDITIONS.json').read_text())['editions']
    editions = classify_editions(meta, editions_json, policy)
    unknown = sorted(set(editions.label) - set(labels))
    if unknown:
        fail(f'{len(unknown)} race labels of the adapted input are not registry labels (first: {unknown[0]!r}); the input predates plan decision D19 or the registry is stale')
    weather = db.execute(f"""SELECT city, year, min(temp_c) AS temp_start, min(temp_c_win_mean) AS temp_window, count(*) AS n
        FROM read_parquet('{q(source / 'race_conditions.parquet')}') GROUP BY ALL""").df()
    if (weather.n != 1).any():
        fail('race_conditions holds two rows for one edition')
    editions = editions.merge(weather.drop(columns='n').rename(columns={'city': 'label'}), on=['label', 'year'], how='left')
    editions['code'] = np.arange(len(editions), dtype=np.int32)

    # The site's own cohort: timing-eligible finishes of counted editions and their sustained slowdowns.
    prepare(db, source, keep_record_id=True)
    ratios = ', '.join(f'p{i + 4}/((t3-t0)/15)-1 AS s{i}' for i in range(5))
    if str(RATIO_EPSILON) not in threshold_sql(.25, 5):
        fail('build_public_explorer.threshold_sql no longer carries its ratio tolerance')
    db.execute(f'CREATE TEMP TABLE slowdown AS SELECT rid, city, year, {threshold_sql(.25, 5)} AS slow FROM (SELECT *, {ratios} FROM eligible)')
    share = db.execute('SELECT city AS label, year, count(*) AS eligible, count(*) FILTER(WHERE slow) AS slow FROM slowdown GROUP BY ALL ORDER BY ALL').df()
    share = share.merge(editions[['label', 'year', 'code', 'counted']], on=['label', 'year'], how='left')
    if share.code.isna().any() or not share.counted.all() or len(share) != int(editions.counted.sum()):
        fail('the site cohort (build_pacing.prepare) and the counted editions of the policy are not the same editions')
    share['code'] = share.code.astype(np.int32)
    for table in ('eligible', 'timing_eligible', 'paced', 'parsed', 'unique_records'):
        db.execute(f'DROP TABLE {table}')

    # Linked runners: the runner keys of the identity file, never derived here. The adapted features carry the tier
    # condition of the same rule as `runner_id`, so every key must be that id, and a record that has the id and no key
    # must be one a screen took out.
    checks = db.execute(f"""SELECT count(*) FILTER(WHERE (runner_id IS NOT NULL) <> coalesce(link_confidence IN {lc.LINK_TIERS}, false)),
        count(*) FILTER(WHERE runner_id IS NOT NULL AND runner_id IS DISTINCT FROM person_id),
        count(*) FILTER(WHERE runner_id IS NOT NULL AND is_ambiguous IS DISTINCT FROM false),
        count(*), count(DISTINCT record_id) FROM features""").fetchone()
    if checks[0] or checks[1] or checks[2] or checks[3] != checks[4]:
        fail(f'the adapted features do not follow the identity rule this family reads (keys off the link tiers: {checks[0]}, keys that are not the '
             f'person id: {checks[1]}, ambiguous keys: {checks[2]}, repeated record ids: {checks[3] - checks[4]})')
    db.execute(f"""CREATE TEMP TABLE identity AS SELECT record_id, runner_key, status, not_keyed_reason FROM read_parquet('{q(identity)}')
        WHERE distance = 'marathon' AND source_db = 'full' AND status <> 'left_out'""")
    differ = db.execute("""SELECT count(*) FROM features f FULL JOIN identity i USING (record_id)
        WHERE f.record_id IS NULL OR i.record_id IS NULL OR (i.runner_key IS NULL) <> (i.status <> 'keyed')
           OR (i.runner_key IS NOT NULL AND i.runner_key IS DISTINCT FROM f.runner_id)
           OR (i.runner_key IS NULL AND f.runner_id IS NOT NULL
               AND coalesce(i.not_keyed_reason, '') NOT IN ('sex_conflict', 'birth_year_spread', 'two_results_in_one_edition'))""").fetchone()[0]
    if differ:
        fail(f'{differ} marathon records: the identity file and the adapted features disagree on a record or its key')
    db.execute("CREATE TEMP TABLE keyed AS SELECT record_id, runner_key FROM identity WHERE status = 'keyed'")
    keys = db.execute('SELECT count(DISTINCT runner_id), count(*) FROM features WHERE runner_id IS NOT NULL').fetchone()
    safe = db.execute('SELECT count(DISTINCT runner_key), count(*) FROM keyed').fetchone()

    # The age-group-floor flag lives only in the release's link file (the adapted record_flags lost its values).
    db.execute(f"""CREATE TEMP TABLE floors AS SELECT record_id, age_key FROM read_parquet('{q(links)}')
        WHERE distance = 'marathon' AND source_db = 'full' AND age_key LIKE 'yob:%' AND coalesce(record_flags, '') LIKE '%age_is_group_floor%'""")
    mismatch = db.execute(f"""SELECT count(*) FROM read_parquet('{q(links)}') l JOIN features f ON f.record_id = l.record_id
        WHERE l.distance = 'marathon' AND l.source_db = 'full'
          AND ((l.age_key LIKE 'yob:%') <> (f.yob IS NOT NULL) OR (f.yob IS NOT NULL AND try_cast(substr(l.age_key, 5) AS BIGINT) IS DISTINCT FROM f.yob)
               OR l.person_id IS DISTINCT FROM f.person_id)""").fetchone()[0]
    if mismatch:
        fail(f'{mismatch} records: the link file and the adapted features disagree on a birth-year key or a person id')

    db.execute('CREATE TEMP TABLE ed AS SELECT label, year, code, in_w FROM editions')
    db.execute(f"""CREATE TEMP TABLE kept AS SELECT k.runner_key AS pid, e.code AS edition, f.year::SMALLINT AS year, round(f.finish_time * 60, 3) AS fin,
          CASE f.sex WHEN 'M' THEN 1 WHEN 'F' THEN 2 ELSE 0 END::TINYINT AS sex,
          (f.link_confidence IN {lc.HIGH_TIERS}) AS high,
          coalesce(CASE WHEN f.yob IS NOT NULL AND g.record_id IS NULL THEN f.yob END, -1)::SMALLINT AS exact_yob,
          s.rid IS NOT NULL AS eligible, coalesce(s.slow, false) AS slow
        FROM features f JOIN keyed k USING (record_id) JOIN ed e ON e.label = f.city AND e.year = f.year
        LEFT JOIN floors g ON g.record_id = f.record_id LEFT JOIN slowdown s ON s.rid = f.record_id
        WHERE e.in_w AND round(f.finish_time * 60, 3) BETWEEN {lc.FINISH_RANGE[0]} AND {lc.FINISH_RANGE[1]}""")
    # Runner codes in the order of the person ids; every linked record of the person, on any tier and any link
    # confidence, is counted beside (it tests what a "first recorded" marathon rests on). No id leaves the database.
    db.execute("""CREATE TEMP TABLE people AS SELECT pid, (row_number() OVER (ORDER BY pid) - 1)::INTEGER AS person
        FROM (SELECT DISTINCT pid FROM kept)""")
    db.execute("""CREATE TEMP TABLE every AS SELECT person_id AS pid, count(*)::INTEGER AS n_any, min(year)::SMALLINT AS first_any
        FROM features WHERE person_id IS NOT NULL GROUP BY 1""")
    frame = db.execute("""SELECT p.person, k.edition, k.year, k.fin, k.sex, k.high, k.exact_yob, k.eligible, k.slow, a.n_any, a.first_any
        FROM kept k JOIN people p USING (pid) JOIN every a USING (pid) ORDER BY p.person, k.year, k.edition""").df()
    n_kept = db.execute('SELECT count(*) FROM kept').fetchone()[0]
    db.close()
    if len(frame) != n_kept:
        fail('a kept result has no person row')
    log(f'linked: {len(frame):,} kept results read')
    results = pd.DataFrame({
        'person': frame.person.to_numpy(np.int32), 'edition': frame.edition.to_numpy(np.int32), 'year': frame.year.to_numpy(np.int16),
        'fin': frame.fin.to_numpy(float), 'sex': frame.sex.to_numpy(np.int8), 'high': frame.high.to_numpy(bool),
        'exact_yob': frame.exact_yob.to_numpy(np.int16), 'eligible': frame.eligible.to_numpy(bool), 'slow': frame.slow.to_numpy(bool),
        'n_any': frame.n_any.to_numpy(np.int32), 'first_any': frame.first_any.to_numpy(np.int16),
    })
    counts = {'keys_before_the_screens': int(keys[0]), 'keyed_records_before_the_screens': int(keys[1]), 'linked_runners': int(safe[0]),
              'keyed_records': int(safe[1]), 'kept_results_wider': int(len(results)),
              'kept_runners_wider': int(results.person.max()) + 1 if len(results) else 0}
    return Universe(editions=editions, results=results, field_share=share[['code', 'eligible', 'slow']].reset_index(drop=True), counts=counts)
