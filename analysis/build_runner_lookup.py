"""Runner lookup v2: every named marathon and half-marathon result of the adopted release, as static search files.

    python3 -I analysis/build_runner_lookup.py --core <unpacked CORE folder> --links <person-ids linked parquet> \\
        --status <record-status.parquet> --identity <identity.parquet> [--cohort analysis/marathon-cohort/manifest.json] \\
        [--policy public/data/edition-policy.json] [--registry analysis/race-registry.json] [--half-registry FILE] \\
        [--race-notes analysis/race-notes.json] \\
        --output <dir>/runners [--as-of 2026-11-14T00:00:00Z] [--temp-limit-gb 4]
    node scripts/verify-lookup.cjs --data-root <dir>
    python3 -I analysis/import_runner_lookup.py --input <dir>        # verifies again, then replaces public/data/runners

The lookup is a browser artefact (lead decision D24 of the adoption plan, 2026-11-14): a visitor's browser searches
15.7 million recorded results by name and opens a runner's linked results with no server. No analysis reads it; the
analyses bind to the names-free marathon cohort, whose digest the lookup's manifest names. The format is
analysis/lookup_format.py and the contract docs/RUNNERS_AND_REPORT.md; the design it implements is recorded there.

What it reads, and refuses when a digest differs from the pin (analysis/release.json):
- the release: race_records, qa_row_flags, pending_review_flags, edition_meta and EDITION-TIERS.csv of the unpacked
  CORE archive (through the archive's own SHA256SUMS.txt, whose digest the pin holds) and the person-links file;
- from the pipeline: the marathon record status and the one identity file of both distances, which between them say
  which rows never appear (a marathon row the status file does not hold, a half row the identity file marks left
  out: this builder applies no row rule of its own), the race registry, the edition policy's reason sentences and
  the cohort manifest;
- from the race directory: analysis/race-notes.json, whose `set_aside_editions` are kept and never listed;
- its own reviewed data files: analysis/lookup-half-records.json (the two kinds of half edition that are never
  compared) and analysis/lookup-placeholders.json (names that are not a person's).

It stops on anything it cannot place: an edition without a tier, a key without a race, a time that is not a whole
number of units, a kept marathon row whose finish text does not read, a status or link value it does not know, a
person in two shards, a reviewed count that differs, a row the pipeline leaves out without a flag of its row rule.
It never infers a sex or a person from a name and never labels a row by a category: rows the release flags as never
to be shown are absent, and nothing else about them is written.

Streaming: DuckDB holds the rows (memory limit 3 GB, 2 threads, a temporary database beside the output). A table is
dropped as soon as the next one is made from it, and the two ordered streams are read one range of shards or of words
at a time, so nothing is sorted on disk and one shard or leaf is in memory at once. Every order is total, so two runs
give the same bytes with the same Python and zlib; across zlib builds the manifest's `content` digests of the
uncompressed bodies compare instead.

Disk: the temporary folder (the database and whatever DuckDB spills) is measured every two seconds; each progress line
gives its size and the last line its peak. A build whose folder passes --temp-limit-gb is stopped. The folder is
removed when the build ends, fails or is stopped by SIGTERM, SIGINT or SIGHUP, and a build that does not finish removes
what it wrote of the output, so a failed or stopped build leaves nothing behind.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import resource
import shutil
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb

# Data-reading scripts run with `python3 -I`, which leaves the script's folder off sys.path.
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from lookup_format import (  # noqa: E402
    CHECKPOINTS, CONFIRMED, INDEX_RULES, LINK_SCREENED, LINK_TIERS, NO_COMPARISON, PAGE_SIZE, POINTS_KM, PROFILE_SHARDS, SCHEMA_VERSION,
    SEARCH_AUTO, SEARCH_HARD_CAP, STATUS_WORDS, TIERS, TIME_UNIT_MS, LeafCutter, ShardBody, editions_body, encode, index_page_body,
    index_page_path, leaf_body, leaf_path, profile_page_body, profile_page_path, shard_path, write_gz)
from lookup_names import FOLD, NORMALIZATION, SEARCH_WORDS, normalize_name, search_key  # noqa: E402
from lookup_races import HALF_RULE, RaceError, half_races, read_registry  # noqa: E402

HERE = Path(__file__).resolve().parent
PIN_PATH = HERE / 'release.json'
HALF_RECORDS_PATH = HERE / 'lookup-half-records.json'
RACE_NOTES_PATH = HERE / 'race-notes.json'
PLACEHOLDERS_PATH = HERE / 'lookup-placeholders.json'
REGISTRY_PATH = HERE / 'race-registry.json'
POLICY_PATH = HERE.parent / 'public/data/edition-policy.json'
COHORT_PATH = HERE / 'marathon-cohort/manifest.json'
SCRIPTS = ['build_runner_lookup.py', 'lookup_format.py', 'lookup_names.py', 'lookup_races.py', 'race_registry.py']
CORE_FILES = ['race_records.parquet', 'qa_row_flags.parquet', 'pending_review_flags.parquet', 'edition_meta.parquet',
              'EDITION-TIERS.csv', 'MANIFEST.json']
LINKS_SUFFIX = 'race_results_linked.parquet'
PERSON_ID = r'^p51_[0-9a-f]{16}$'      # person-ids v5.1 (the adapter's IDENTITY prefix); the id itself is never published
# The rows the pipeline leaves out: marathon rows by the adapter's row rule (decision D2 with ruling R2), half rows by
# the half row rule the lead froze (decision D28). The pipeline's files decide which rows those are: a marathon row
# is absent from the status file, a half row is marked left out in the identity file. These lists only name the reason
# of each absent row for the published counts; a row that is absent without one of its distance's flags stops the build,
# and so does an identity file whose own description names other flags for the half rule.
MARATHON_LEFT_OUT = {
    'pending_review_flags': ['wheelchair_handcycle_published_category', 'sportstats_nonfinish_status', 'philadelphia_2010_place_sequence_outlier'],
    'qa_row_flags': ['finish_faster_than_world_record', 'finish_ge_24h', 'finish_zero', 'finish_equals_earlier_split'],
}
HALF_LEFT_OUT = {
    'pending_review_flags': ['wheelchair_handcycle_published_category', 'published_disqualified_status', 'sportstats_nonfinish_status',
                             'philadelphia_2010_place_sequence_outlier'],
    'qa_row_flags': ['finish_faster_than_world_record', 'finish_ge_24h', 'finish_zero', 'finish_equals_earlier_split', 'finish_implausibly_fast'],
}
IDENTITY_STATUS = ('keyed', 'left_out', 'possible_match', 'unlinked')      # the identity file's `status` of a release row
# The vocabulary of analysis/build_record_status.py (status, reason), mapped to the digit of `s`
# (analysis/lookup_format.py STATUS_WORDS). An edition that gives recorded times only names one of four reasons for
# every record of it; the lookup keeps one code for them, and the edition's own sentence says which.
STATUS_VALUES = {
    ('counted', None): '0', ('own_record', None): '1', ('limited', 'duplicate'): '2', ('limited', 'missing_checkpoints'): '3',
    ('limited', 'times_out_of_order'): '4', ('limited', 'outside_bounds'): '5', ('limited', 'finish_time_only'): '6',
    ('limited', 'held_for_review'): '6', ('limited', 'invalid_split_grid'): '6', ('limited', 'reviewed_exception'): '6',
}
TIME = '[0-9]+:[0-5][0-9]:[0-5][0-9]'
TEMP_LIMIT_GB = 4.0      # a build stops when its temporary folder passes this; the measured peak is in docs/RUNNERS_AND_REPORT.md
SHARD_RANGE = 256        # profile shards per ordered read (about a million results: sorted in memory)
POSTING_RANGES = 24      # word ranges the postings are read in (under a million and a half rows each)
MARATHON_SPLITS = ['split_5km', 'split_10km', 'split_15km', 'split_20km', 'split_25km', 'split_30km', 'split_35km', 'split_40km']
RULES = {
    'normalization': NORMALIZATION,
    'fold': FOLD,
    'search_words': SEARCH_WORDS,
    'search_names': ('one per profile and set of search words; its shown spelling is the recorded name of the profile’s latest result with that set '
                     '(latest year, marathon before half, lowest record id, marathon database before half database)'),
    'results': ('a result is one row of the release, keyed by its source database and record id; listed when it is not left out, its edition is '
                'not set aside, its name has a search word and its name is not a placeholder'),
    'left_out': {
        'marathon': 'the rows absent from the pipeline’s record-status file: the row rule of the adapted marathon input (counts by flag in `counts`)',
        'half': 'the rows the pipeline’s identity file marks left_out: the half row rule (counts by flag in `counts`)',
    },
    'set_aside': ('not listed: the kept rows of a marathon edition that analysis/race-notes.json sets aside (one race recorded under two keys or '
                  'two years); the edition stays in the release and in the cohort’s counts'),
    'placeholders': ('not listed: a result whose name the producer flags as a placeholder, or whose set of search words equals that of a name on '
                     'the reviewed list analysis/lookup-placeholders.json'),
    'identity': ('a profile is one person of the producer’s person links, or one result with no link; link code 0 = no link; 1 high_elite, '
                 '2 high, 3 medium = confirmed (the link keys a runner in the pipeline’s identity file); 4 medium_variant, 5 low, 6 low_noage, '
                 '7 low_noage_series, 8 low_nosex, 9 low_city_pace, a low_carryover = possible match; b, c, d = tier 1, 2, 3 without a key '
                 '(a screen failed), shown as possible match. Links are the producer’s, by recorded name, sex and age or birth year; no name '
                 'matching is added and a profile is not a verified person'),
    'profiles': ('shard = the first three hex digits of the person id after its prefix, or of sha256("f:<id>") or sha256("h:<id>") for a result with '
                 'no link; inside a shard, persons in id order, then results with no link by source database (f before h) and record id; '
                 'a profile’s results by marathon before half, year, record id, database'),
    'status': STATUS_WORDS,
    'no_comparison': NO_COMPARISON,
    'sex': 'the published sex (M, F, X), or the published category’s when that is blank; - when neither; never from a name',
    'age': 'the recorded age as a whole number; -1 when none was recorded or the release flags it as implausible',
    'times': ('whole units of time_unit_ms; a checkpoint whose text is not a time is not recorded, and neither is a finish whose text is not '
              'a time greater than zero (the result is listed with no finish time); a gap is the time from the previous recorded '
              'checkpoint, or from the start'),
    'index': dict(INDEX_RULES),
    'search': {'auto_bytes': SEARCH_AUTO, 'hard_cap_bytes': SEARCH_HARD_CAP},
    'half_races': HALF_RULE,
}


class BuildError(Exception):
    pass


class Stopped(BaseException):
    """A signal asked the build to stop (main() turns SIGTERM, SIGINT and SIGHUP into this, so the folders are cleaned)."""


def fail(message):
    raise BuildError(message)


class TempWatch(threading.Thread):
    """The size of the temporary folder, read every two seconds while a build runs: the peak for the log, and a stop
    when the folder passes the limit (the machine this runs on keeps a floor of free disk for other work)."""

    def __init__(self, folder, limit, db):
        super().__init__(daemon=True)
        self.folder, self.limit, self.db = folder, limit, db
        self.peak, self.over = 0, False
        self._done = threading.Event()

    def size(self):
        total = 0
        for path in self.folder.rglob('*'):
            try:
                total += path.stat().st_blocks * 512 if path.is_file() else 0
            except OSError:      # a spill file removed between the listing and the reading
                pass
        self.peak = max(self.peak, total)
        if self.limit and total > self.limit:
            self.over = True
        return total

    def run(self):
        while not self._done.wait(2):
            self.size()
            if self.over:
                self.db.interrupt()      # ends a running query; between queries check() stops the build

    def check(self):
        if self.over:
            fail(f'the temporary folder passed {self.limit / (1 << 30):.1f} GB: the build is stopped (raise --temp-limit-gb only with the disk to spare)')

    def stop(self):
        self._done.set()
        self.join()


_STARTED = time.monotonic()
LOG = False      # main() turns the progress lines on
_WATCH = None    # the running build's TempWatch


def step(label, **facts):
    if _WATCH is not None:
        facts['temp_mb'] = _WATCH.size() >> 20
        _WATCH.check()
    if LOG:
        print(json.dumps({'t': round(time.monotonic() - _STARTED, 1), 'step': label, **facts}, ensure_ascii=False), flush=True)


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        while block := stream.read(1 << 20):
            digest.update(block)
    return digest.hexdigest()


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def seconds(column):
    return (f"CASE WHEN regexp_full_match({column}, '{TIME}') THEN split_part({column}, ':', 1)::BIGINT*3600"
            f" + split_part({column}, ':', 2)::BIGINT*60 + split_part({column}, ':', 3)::BIGINT END")


# ---------------------------------------------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------------------------------------------

def verify_release(pin, core, links):
    """The release files this build reads, each equal to the pinned digest. Returns (input_as_of, {name: sha256})."""
    if pin.get('layout') != 'combined' or not pin.get('tag'):
        fail('the pin is not a combined-layout release (analysis/release.json)')
    sums_path = core / 'SHA256SUMS.txt'
    if not sums_path.is_file():
        fail(f'{core} has no SHA256SUMS.txt: give the unpacked CORE folder of {pin["tag"]}')
    if file_sha256(sums_path) != pin['core']['sha256sums_sha256']:
        fail('the CORE SHA256SUMS.txt differs from the pinned digest: this is not the pinned release')
    listed = {}
    for line in sums_path.read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (\S+)', line)
        if not match:
            fail(f'the CORE SHA256SUMS.txt has a line that is not "<sha256>  <name>": {line!r}')
        listed[match.group(2)] = match.group(1)
    digests = {}
    for name in CORE_FILES:
        if name not in listed:
            fail(f'the CORE SHA256SUMS.txt does not list {name}')
        if not (core / name).is_file():
            fail(f'{core} has no {name}')
        digests[name] = file_sha256(core / name)
        if digests[name] != listed[name]:
            fail(f'{name} differs from the digest in the pinned SHA256SUMS.txt')
    if listed['MANIFEST.json'] != pin['core']['manifest_sha256']:
        fail('the CORE MANIFEST.json differs from the pinned digest')
    if listed['EDITION-TIERS.csv'] != pin['assets'].get('EDITION-TIERS.csv'):
        fail('EDITION-TIERS.csv in CORE differs from the pinned release asset')
    wanted = [name for name in pin['assets'] if name.endswith(LINKS_SUFFIX)]
    if len(wanted) != 1:
        fail('the pin does not name exactly one person-links file')
    if not links.is_file():
        fail(f'{links} does not exist')
    digests[wanted[0]] = file_sha256(links)
    if digests[wanted[0]] != pin['assets'][wanted[0]]:
        fail(f'{links.name} differs from the pinned digest of {wanted[0]}')
    manifest = json.loads((core / 'MANIFEST.json').read_text())
    if manifest.get('tag') != pin['tag']:
        fail(f'the CORE MANIFEST.json names {manifest.get("tag")!r}, the pin {pin["tag"]!r}')
    return manifest['created_at'], digests


def parquet_notes(db, path):
    """The key-value metadata the writer of a Parquet file left in it."""
    rows = db.execute(f'SELECT key, value FROM parquet_kv_metadata({quote(path)})').fetchall()
    text = lambda value: value.decode('utf-8', 'replace') if isinstance(value, (bytes, bytearray)) else str(value)
    return {text(key): text(value) for key, value in rows}


def columns_of(db, relation):
    return {row[0]: row[1] for row in db.execute(f'DESCRIBE SELECT * FROM {relation}').fetchall()}


def load_status(db, path):
    """VIEW status(record_id, st, city, year) over the file: one row per written marathon record with the digit of its
    status and the edition as the pipeline names it. Returns (rows, the sidecar document or None)."""
    relation = f'read_parquet({quote(path)})'
    columns = columns_of(db, relation)
    missing = [name for name in ('record_id', 'status', 'reason', 'city', 'year') if name not in columns]
    if missing:
        fail(f'{path.name}: expected columns record_id, city, year, status, reason; missing {missing}')
    values = db.execute(f'SELECT status, reason, count(*) FROM {relation} GROUP BY ALL ORDER BY ALL').fetchall()
    unknown = [(status, why, n) for status, why, n in values if (status, why) not in STATUS_VALUES]
    if unknown:
        fail(f'{path.name}: status values this builder does not know: {unknown}')
    cases = ' '.join(f"WHEN status={quote(status)} AND reason IS NOT DISTINCT FROM {quote(why) if why else 'NULL'} THEN '{digit}'"
                     for (status, why), digit in STATUS_VALUES.items())
    db.execute(f'CREATE TEMP VIEW status AS SELECT record_id::BIGINT AS record_id, CASE {cases} END AS st, city, year::INTEGER AS year FROM {relation}')
    rows, ids = db.execute('SELECT count(*), count(DISTINCT record_id) FROM status').fetchone()
    if rows != ids:
        fail(f'{path.name}: {rows} rows for {ids} record ids')
    sidecar_path = path.with_name(path.name + '.json')
    sidecar = json.loads(sidecar_path.read_text()) if sidecar_path.is_file() else None
    if sidecar is not None:
        by_status = {}
        for status, why, n in values:
            by_status[status] = by_status.get(status, 0) + n
        if sidecar.get('file', {}).get('sha256') != file_sha256(path) or sidecar.get('counts', {}).get('by_status') != by_status:
            fail(f'{sidecar_path.name} does not describe {path.name} (digest or counts by status)')
    return rows, sidecar


def load_identity(db, path):
    """VIEW ident(dbh, record_id, runner_key, link_tier, status) over the file: one row per release row of both
    distances. Returns (rows, the file's own description or None)."""
    relation = f'read_parquet({quote(path)})'
    columns = columns_of(db, relation)
    missing = [name for name in ('source_db', 'record_id', 'runner_key', 'link_tier', 'status') if name not in columns]
    if missing:
        fail(f'{path.name}: expected columns source_db, record_id, runner_key, link_tier, status; missing {missing}')
    db.execute(f"""CREATE TEMP VIEW ident AS SELECT source_db='half' AS dbh, record_id::BIGINT AS record_id,
        runner_key::VARCHAR AS runner_key, link_tier::VARCHAR AS link_tier, status::VARCHAR AS status FROM {relation}""")
    rows, keys, sources = db.execute("SELECT count(*), count(DISTINCT (dbh, record_id)), (SELECT count(*) FROM (SELECT DISTINCT source_db FROM "
                                     f"{relation} WHERE source_db NOT IN ('full', 'half'))) FROM ident").fetchone()
    if rows != keys or sources:
        fail(f'{path.name}: {rows} rows for {keys} records, {sources} unknown source databases')
    values = db.execute('SELECT status, count(*), count(*) FILTER (WHERE (status IS NOT DISTINCT FROM \'keyed\') <> (runner_key IS NOT NULL)) '
                        'FROM ident GROUP BY status ORDER BY status').fetchall()
    unknown = [value for value, _, _ in values if value not in IDENTITY_STATUS]
    if unknown:
        fail(f'{path.name}: status values this builder does not know: {unknown}')
    wrong = sum(n for _, _, n in values)
    if wrong:
        fail(f'{path.name}: {wrong} rows are keyed without a runner key, or carry a runner key without being keyed')
    sidecar_path = path.with_name(path.name + '.json')
    sidecar = json.loads(sidecar_path.read_text()) if sidecar_path.is_file() else None
    if sidecar is not None:
        if sidecar.get('file', {}).get('sha256') != file_sha256(path):
            fail(f'{sidecar_path.name} does not describe {path.name} (digest)')
        stated = sidecar.get('half_row_rule')
        if stated is not None and any(sorted(stated.get(kind, [])) != sorted(HALF_LEFT_OUT[kind]) for kind in HALF_LEFT_OUT):
            fail(f'{sidecar_path.name} names other flags for the half row rule than this builder knows (HALF_LEFT_OUT): {stated}')
    return rows, sidecar


def load_policy(path):
    """The not-counted marathon editions: {(city, year): (reason sentence, own_record)}, the document and its sha256.
    Reads public/data/edition-policy.json (rows in the order of `columns`, `reason` an index into `reasons`), or a
    frozen policy file whose `editions` are objects."""
    data = path.read_bytes()
    policy = json.loads(data)
    out = {}
    if 'columns' in policy:
        at = {name: policy['columns'].index(name) for name in ('city', 'year', 'reason', 'own_record')}
        rows = [(row[at['city']], row[at['year']], policy['reasons'][row[at['reason']]], bool(row[at['own_record']])) for row in policy['editions']]
    else:
        rows = [(row['city'], row['year'], row['reason'], None) for row in policy['editions']]
    for city, year, reason, own in rows:
        key = (city, int(year))
        if key in out or not reason:
            fail(f'{path.name}: the edition {key} is listed twice or has no reason')
        out[key] = (reason, own)
    return out, policy, hashlib.sha256(data).hexdigest()


def load_cohort(path):
    """The cohort manifest (analysis/marathon-cohort/manifest.json, format in analysis/cohort.py): the block the lookup
    repeats, {(city, year): index} of the editions that have a cohort file (the index keys the runner-context files),
    {(city, year): raw records} of every edition it knows, and the manifest itself."""
    data = path.read_bytes()
    cohort = json.loads(data)
    editions = cohort.get('editions')
    if not isinstance(editions, list) or not editions:
        fail(f'{path}: the cohort manifest lists no editions')
    index, raw = {}, {}
    for at, edition in enumerate(editions):
        key = (edition['city'], int(edition['year']))
        if key in index:
            fail(f'{path}: the cohort manifest lists {key} twice')
        index[key] = at
        raw[key] = edition['raw']
    others = cohort.get('other_editions') or {'columns': ['city', 'year', 'raw'], 'rows': []}
    at = {name: others['columns'].index(name) for name in ('city', 'year', 'raw')}
    for row in others['rows']:
        key = (row[at['city']], int(row[at['year']]))
        if key in raw:
            fail(f'{path}: the cohort manifest lists {key} twice')
        raw[key] = row[at['raw']]
    block = {'manifest_sha256': hashlib.sha256(data).hexdigest(), 'release_tag': cohort.get('release_tag'), 'as_of': cohort.get('as_of'),
             'input_as_of': cohort.get('input_as_of'), 'raw_records': cohort.get('raw_records'),
             'eligible_records': cohort.get('eligible_records'), 'own_record_records': cohort.get('own_record_records'),
             'editions': len(editions)}
    return block, index, raw, cohort


# ---------------------------------------------------------------------------------------------------------------
# The build
# ---------------------------------------------------------------------------------------------------------------

def build(core, links, status, identity, output, *, pin_path=PIN_PATH, registry_path=REGISTRY_PATH, half_registry_path=None,
          policy_path=None, cohort_path=None, race_notes_path=None, half_records_path=HALF_RECORDS_PATH, placeholders_path=PLACEHOLDERS_PATH,
          as_of=None, temp=None, memory='3GB', threads=2, index_rules=None, provisional=(), temp_limit_gb=TEMP_LIMIT_GB):
    """Write the lookup into `output` (which must not hold a build). Returns the manifest. A build that does not finish
    removes what it wrote; the temporary folder is removed either way."""
    index_rules = dict(index_rules or INDEX_RULES)
    output = Path(output)
    if output.exists() and any(output.iterdir()):
        fail(f'{output} is not empty: a build never overwrites another')
    pin = json.loads(Path(pin_path).read_text())
    tag = pin['tag']
    scripts = {name: file_sha256(HERE / name) for name in SCRIPTS}       # as they are when the build starts
    input_as_of, digests = verify_release(pin, Path(core), Path(links))
    step('release files equal the pin', tag=tag)
    half_rule = json.loads(Path(half_records_path).read_text())
    placeholders = json.loads(Path(placeholders_path).read_text())
    for name, data in (('lookup-half-records.json', half_rule), ('lookup-placeholders.json', placeholders)):
        if data.get('tag') != tag:
            fail(f'analysis/{name} was reviewed for {data.get("tag")!r}, not for {tag!r}: review it for this release')
    digests['lookup-half-records.json'] = file_sha256(half_records_path)
    digests['lookup-placeholders.json'] = file_sha256(placeholders_path)
    notes = set(provisional)

    global _WATCH
    temp = Path(temp) if temp else output.parent / (output.name + '-build-temp')
    limit = int(temp_limit_gb * (1 << 30)) if temp_limit_gb else 0
    db = watch = None
    finished = False
    try:
        if temp.exists():
            shutil.rmtree(temp)
        temp.mkdir(parents=True)
        output.mkdir(parents=True, exist_ok=True)
        db = duckdb.connect(str(temp / 'lookup.duckdb'))
        db.execute(f"SET memory_limit='{memory}'")
        db.execute(f'SET threads={int(threads)}')
        db.execute(f"SET temp_directory={quote(temp / 'spill')}")
        if limit:
            db.execute(f"SET max_temp_directory_size='{max(1, limit >> 20)}MiB'")
        db.execute('SET preserve_insertion_order=false')
        watch = _WATCH = TempWatch(temp, limit, db)
        watch.start()
        try:
            manifest = _build(db, pin, Path(core), Path(links), Path(status), Path(identity), output, temp, input_as_of, digests, notes,
                              half_rule, placeholders, Path(registry_path), half_registry_path, policy_path, cohort_path, race_notes_path,
                              as_of, index_rules, scripts)
        except duckdb.InterruptException:
            watch.check()
            raise
        if scripts != {name: file_sha256(HERE / name) for name in SCRIPTS}:
            fail('a builder script changed while the build ran: the build is withdrawn; build again')
        finished = True
    finally:
        _WATCH = None
        if watch is not None:
            watch.stop()
        if db is not None:
            db.close()
        shutil.rmtree(temp, ignore_errors=True)
        if not finished:
            shutil.rmtree(output, ignore_errors=True)      # everything in it is this run's: the folder was empty at the start
    step('temporary folder removed', peak_temp_mb=watch.peak >> 20, peak_rss_mb=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024)
    return manifest


def _build(db, pin, core, links, status_path, identity_path, output, temp, input_as_of, digests, notes, half_rule, placeholders,
           registry_path, half_registry_path, policy_path, cohort_path, race_notes_path, as_of, index_rules, scripts):
    tag = pin['tag']
    records = f"read_parquet({quote(core / 'race_records.parquet')})"
    qa = f"read_parquet({quote(core / 'qa_row_flags.parquet')})"
    pending = f"read_parquet({quote(core / 'pending_review_flags.parquet')})"
    link = f'read_parquet({quote(links)})'

    # ---- the pipeline's two files
    for name, path in (('record-status.parquet', status_path), ('identity.parquet', identity_path)):
        if not path.is_file():
            fail(f'{path} does not exist')
        digests[name] = file_sha256(path)
        if parquet_notes(db, path).get('provisional') == 'true':
            notes.add(name.split('.')[0])
    status_rows, status_sidecar = load_status(db, status_path)
    if status_sidecar is not None and status_sidecar.get('release_tag') != tag:
        fail(f"the status file is of {status_sidecar.get('release_tag')!r}, not {tag!r}")
    identity_rows, identity_sidecar = load_identity(db, identity_path)
    if identity_sidecar is not None and identity_sidecar.get('release_tag') != tag:
        fail(f"the identity file is of {identity_sidecar.get('release_tag')!r}, not {tag!r}")
    step('pipeline files read', status_rows=status_rows, identity_rows=identity_rows)

    # ---- every release row, parsed
    release_rows, release_keys = db.execute(f'SELECT count(*), count(DISTINCT (source_db, id)) FROM {records}').fetchone()
    link_rows, joined = db.execute(f"""SELECT (SELECT count(*) FROM {link}), count(*) FROM {records} r
        JOIN {link} l ON l.source_db=r.source_db AND l.record_id=r.id""").fetchone()
    if not (release_rows == release_keys == link_rows == joined):
        fail(f'the release rows and the person-links rows do not pair one to one ({release_rows}, {release_keys}, {link_rows}, {joined})')
    splits = ', '.join(f'{seconds("r." + column)} AS s{i}' for i, column in enumerate(MARATHON_SPLITS))
    unread = ' + '.join(f'(r.{column} IS NOT NULL AND NOT regexp_full_match(r.{column}, {quote(TIME)}))::INTEGER' for column in MARATHON_SPLITS)
    fraction = ' OR '.join(f"regexp_full_match(r.{column}, {quote(TIME + '[.,][0-9]+')})"
                           for column in MARATHON_SPLITS + ['finish_time', 'split_21_1km', 'split_42_2km'])
    db.execute(f"""CREATE TABLE base AS SELECT r.distance='half' AS h, r.source_db='half' AS dbh, r.id, r.city, r.year::INTEGER AS year,
        coalesce(r.runner, '') AS name,
        CASE WHEN r.sex IN ('M', 'F', 'X') THEN r.sex WHEN r.sex IS NOT NULL THEN '?'
             WHEN q.sex_from_category IN ('M', 'F') THEN q.sex_from_category WHEN q.sex_from_category IS NOT NULL THEN '?' ELSE '-' END AS x,
        CASE WHEN r.age IS NULL OR coalesce(q.age_implausible, false) THEN -1 ELSE r.age END AS age,
        (r.age IS NOT NULL AND coalesce(q.age_implausible, false)) AS age_hidden,
        {splits}, nullif({seconds('r.finish_time')}, 0) AS fin, r.finish_time IS NOT NULL AS has_finish, {unread} AS unread,
        ({fraction}) AS fraction,
        (r.finish_time IS DISTINCT FROM CASE WHEN r.distance='half' THEN r.split_21_1km ELSE r.split_42_2km END
          OR CASE WHEN r.distance='half' THEN r.split_42_2km IS NOT NULL OR r.split_25km IS NOT NULL OR r.split_30km IS NOT NULL
                    OR r.split_35km IS NOT NULL OR r.split_40km IS NOT NULL ELSE r.split_21_1km IS NOT NULL END) AS odd_layout,
        l.person_id, l.confidence, coalesce(l.unlinked_reason='placeholder_name', false) AS flagged,
        coalesce(l.course_shortened_suspect, false) AS short,
        s.st, s.city AS status_city, s.year AS status_year, s.record_id IS NOT NULL AS in_status
      FROM {records} r JOIN {link} l ON l.source_db=r.source_db AND l.record_id=r.id
      LEFT JOIN {qa} q ON q.source_db=r.source_db AND q.record_id=r.id
      LEFT JOIN status s ON s.record_id=CASE WHEN r.distance='half' THEN NULL ELSE r.id END""")
    checks = db.execute(f"""SELECT count(*) FILTER (WHERE x='?'), count(*) FILTER (WHERE fraction), count(*) FILTER (WHERE odd_layout),
        count(*) FILTER (WHERE age<>-1 AND (age<>floor(age) OR age<0 OR age>150)), count(*) FILTER (WHERE year NOT BETWEEN 1900 AND 2100),
        count(*) FILTER (WHERE person_id IS NOT NULL AND NOT regexp_full_match(person_id, {quote(PERSON_ID[1:-1])})),
        count(*) FILTER (WHERE (person_id IS NULL) <> (confidence IS NULL)), count(*) FILTER (WHERE NOT h AND dbh) FROM base""").fetchone()
    checks += db.execute(f"SELECT count(*) FROM {records} WHERE distance NOT IN ('marathon', 'half') OR source_db NOT IN ('full', 'half')").fetchone()
    for count, what in zip(checks, ['a sex value other than M, F, X or blank', 'a time with a fraction of a second (time_unit_ms must shrink)',
                                    'a finish that differs from the last split column, or a split column of the other distance',
                                    'an age that is not a whole number from 0 to 150', 'a year outside 1900 to 2100',
                                    'a person id that is not the pinned build’s form', 'a person id without a confidence, or the reverse',
                                    'a marathon row in the half database', 'a distance or source database this builder does not know']):
        if count:
            fail(f'{count} release rows have {what}')
    tiers_known = ', '.join(quote(t) for t in LINK_TIERS)
    unknown = db.execute(f'SELECT confidence, count(*) FROM base WHERE confidence IS NOT NULL AND confidence NOT IN ({tiers_known}) GROUP BY ALL').fetchall()
    if unknown:
        fail(f'link confidence values this builder does not know: {unknown}')
    step('release rows parsed', rows=release_rows)

    # ---- rows that never appear
    def flag_rows(rule, distance):
        parts = [f"SELECT source_db='half' AS dbh, record_id AS id, flag FROM {pending} WHERE present_in_core AND distance={quote(distance)} "
                 f"AND flag IN ({', '.join(quote(f) for f in rule['pending_review_flags'])})"]
        parts += [f"SELECT source_db='half', record_id, {quote(flag)} FROM {qa} WHERE distance={quote(distance)} AND {flag}"
                  for flag in rule['qa_row_flags']]
        return ' UNION ALL '.join(parts)
    db.execute(f"""CREATE TEMP TABLE flags AS SELECT false AS h, * FROM ({flag_rows(MARATHON_LEFT_OUT, 'marathon')})
        UNION ALL SELECT true, * FROM ({flag_rows(HALF_LEFT_OUT, 'half')})""")
    # Every join below is on equalities alone: a condition on one side only inside ON (`NOT b.h AND …`) makes DuckDB
    # compare every pair of rows, which on 15.7 million rows never ends (found on the first full build, November 14, 2026).
    db.execute('CREATE TEMP TABLE flagged AS SELECT DISTINCT h, dbh, id FROM flags')
    db.execute("CREATE TEMP TABLE left_rows AS SELECT dbh, record_id AS id FROM ident WHERE status='left_out'")
    # The kept rows: a marathon row the status file holds, a half row the identity file does not mark left out (lead
    # ruling, November 14, 2026: the half rows left out are the identity file's, never a second list). A view: the
    # parsed rows are not copied.
    db.execute("""CREATE TEMP VIEW kept AS SELECT b.* FROM base b
        LEFT JOIN left_rows f ON f.dbh=b.dbh AND f.id=CASE WHEN b.h THEN b.id END
        WHERE CASE WHEN b.h THEN f.id IS NULL ELSE b.in_status END""")
    strays = db.execute('SELECT count(*) FROM status s ANTI JOIN (SELECT id FROM base WHERE NOT h) b ON b.id=s.record_id').fetchone()[0]
    if strays:
        fail(f'the status file names {strays} records that are not marathon rows of the release')
    strays = db.execute('SELECT count(*) FROM left_rows f ANTI JOIN base b ON b.dbh=f.dbh AND b.id=f.id').fetchone()[0]
    if strays:
        fail(f'the identity file marks {strays} records left out that are not rows of the release')
    apart = db.execute("""SELECT count(*) FROM (SELECT dbh, id, in_status FROM base WHERE NOT h) b
        LEFT JOIN left_rows f ON f.dbh=b.dbh AND f.id=b.id WHERE b.in_status=(f.id IS NOT NULL)""").fetchone()[0]
    if apart:
        fail(f'the status file and the identity file disagree on {apart} marathon rows: one leaves a row out that the other keeps')
    unflagged = dict(db.execute("""SELECT b.h, count(*) FROM base b
        LEFT JOIN left_rows f ON f.dbh=b.dbh AND f.id=CASE WHEN b.h THEN b.id END
        ANTI JOIN flagged g ON g.h=b.h AND g.dbh=b.dbh AND g.id=b.id
        WHERE CASE WHEN b.h THEN f.id IS NOT NULL ELSE NOT b.in_status END GROUP BY b.h""").fetchall())
    if unflagged:
        fail(f'{unflagged.get(False, 0)} marathon rows and {unflagged.get(True, 0)} half rows are left out by the pipeline’s files and carry no flag '
             'of their row rule: the status file or the identity file is not of this release')
    db.execute("""CREATE TEMP TABLE flagged_kept AS SELECT k.h, k.dbh, k.id FROM kept k
        SEMI JOIN flagged f ON f.h=k.h AND f.dbh=k.dbh AND f.id=k.id""")
    base_rows = dict(db.execute('SELECT h, count(*) FROM base GROUP BY h').fetchall())
    kept_by = {h: (rows, unreadable) for h, rows, unreadable in db.execute(
        'SELECT h, count(*), count(*) FILTER (WHERE has_finish AND fin IS NULL) FROM kept GROUP BY h').fetchall()}
    left_out = {}
    for half, name in ((False, 'marathon'), (True, 'half')):
        by_flag = dict(db.execute("""SELECT f.flag, count(*) FROM flags f ANTI JOIN flagged_kept k ON k.h=f.h AND k.dbh=f.dbh AND k.id=f.id
            WHERE f.h=? GROUP BY f.flag ORDER BY f.flag""", [half]).fetchall())
        left_out[name] = {'rows': base_rows.get(half, 0) - kept_by.get(half, (0, 0))[0], 'by_flag': by_flag}
    if identity_sidecar is not None:
        stated = {name: (identity_sidecar.get('counts', {}).get('by_status', {}).get(name) or {}).get('left_out') for name in left_out}
        if stated != {name: value['rows'] for name, value in left_out.items()}:
            fail(f"the rows left out are {json.dumps({name: value['rows'] for name, value in left_out.items()})}; "
                 f'the identity file’s own description counts {json.dumps(stated)}')
    # A finish text that is not a time greater than zero: a kept half row is listed without a finish (lead ruling,
    # November 14, 2026: no time shown, never the text); for a kept marathon row nobody has ruled, so the build stops.
    finish_unread = {name: kept_by.get(half, (0, 0))[1] for half, name in ((False, 'marathon'), (True, 'half'))}
    if finish_unread['marathon']:
        fail(f"{finish_unread['marathon']} kept marathon rows have a finish text that does not read as a time: decide whether they are shown before building")
    step('rows left out', **{name: value['rows'] for name, value in left_out.items()})

    # ---- names: normalised once per distinct recorded name, by the function the browser mirrors
    names_file = temp / 'names.ndjson'
    cursor = db.execute('SELECT DISTINCT name FROM base')
    distinct = 0
    with names_file.open('w', encoding='utf-8') as stream:
        while batch := cursor.fetchmany(100000):
            stream.write(''.join(json.dumps({'name': name, 'norm': normalize_name(name), 'skey': search_key(name)}, ensure_ascii=False) + '\n'
                                 for (name,) in batch))
            distinct += len(batch)
    db.execute("""CREATE TABLE names AS SELECT * FROM read_json(?, format='newline_delimited',
        columns={'name': 'VARCHAR', 'norm': 'VARCHAR', 'skey': 'VARCHAR'})""", [str(names_file)])
    names_file.unlink()
    read_back, unmatched = db.execute("""SELECT (SELECT count(*) FROM names), (SELECT count(*) FROM (SELECT DISTINCT name FROM base) k
        ANTI JOIN names n ON n.name=k.name)""").fetchone()
    if read_back != distinct or unmatched:
        fail(f'{distinct} distinct names were written and {read_back} read back; {unmatched} do not match their own text')
    listed_names = {}
    for entry in placeholders['names']:
        key = search_key(entry['name'])
        if not key or key in listed_names:
            fail(f"analysis/lookup-placeholders.json: {entry['name']!r} has no search word or repeats another entry")
        listed_names[key] = entry
    db.execute('CREATE TEMP TABLE listed_names (skey VARCHAR)')
    if listed_names:
        db.executemany('INSERT INTO listed_names VALUES (?)', [(key,) for key in listed_names])
    # A reviewed count is of every release row with that name, whatever else is left out, so it moves with the release alone.
    measured = dict(db.execute("""SELECT n.skey, count(*) FROM base b JOIN names n ON n.name=b.name SEMI JOIN listed_names l ON l.skey=n.skey
        GROUP BY n.skey""").fetchall())
    differing = {entry['name']: measured.get(key, 0) for key, entry in listed_names.items() if measured.get(key, 0) != entry['release_rows']}
    if differing:
        fail(f'analysis/lookup-placeholders.json: the release rows of these names differ from the reviewed counts (measured): {differing}')
    step('names normalised', distinct=distinct)

    # ---- editions the race directory sets aside (lead decision D40): their rows are kept and never listed
    set_aside = {}
    if race_notes_path:
        race_notes = json.loads(Path(race_notes_path).read_text())
        digests['race-notes.json'] = file_sha256(race_notes_path)
        if race_notes.get('tag') != tag:
            fail(f"analysis/race-notes.json was reviewed for {race_notes.get('tag')!r}, not for {tag!r}: review it for this release")
        for entry in race_notes.get('set_aside_editions', []):
            key = (entry.get('label'), entry.get('year'))
            if not isinstance(key[0], str) or not isinstance(key[1], int) or key in set_aside:
                fail(f'analysis/race-notes.json: a set-aside edition has no label and year, or is listed twice: {entry!r}')
            set_aside[key] = 0
    else:
        notes.add('race_notes')
    db.execute('CREATE TEMP TABLE set_aside (label VARCHAR, year INTEGER)')
    if set_aside:
        db.executemany('INSERT INTO set_aside VALUES (?, ?)', list(set_aside))

    # ---- listed results
    # A join of the wide rows runs as it is written, wide rows first: what they are joined to (the names, the editions)
    # is hashed in memory and the 15.7 million rows stream past it. Left to its estimates DuckDB hashed the wide rows
    # themselves and spilled 3 GB (measured November 14, 2026), so its two choices of side are switched off for these.
    def as_written(statement):
        db.execute("SET disabled_optimizers='join_order,build_side_probe_side'")
        try:
            db.execute(statement)
        finally:
            db.execute("SET disabled_optimizers=''")
    as_written("""CREATE TABLE sorted AS SELECT k.h, k.dbh, k.id, k.city, k.year, k.name, k.x, k.age::INTEGER AS a, k.age_hidden, k.fin, k.has_finish,
        k.s0, k.s1, k.s2, k.s3, k.s4, k.s5, k.s6, k.s7, k.unread, k.st, k.status_city, k.status_year, k.short, n.skey,
        CASE WHEN a.label IS NOT NULL THEN 'set_aside' WHEN n.blank THEN 'unnamed' WHEN k.flagged THEN 'flagged'
             WHEN l.skey IS NOT NULL THEN 'listed' ELSE 'result' END AS kind,
        coalesce(k.person_id, CASE WHEN k.dbh THEN 'h:' ELSE 'f:' END || k.id::VARCHAR) AS pk, k.person_id IS NOT NULL AS linked, k.confidence
      FROM kept k JOIN (SELECT name, skey, norm='' AS blank FROM names) n ON n.name=k.name LEFT JOIN listed_names l ON l.skey=n.skey
      LEFT JOIN set_aside a ON a.label=k.status_city AND a.year=k.status_year""")
    kept_rows, sorted_rows = sum(rows for rows, _ in kept_by.values()), db.execute('SELECT count(*) FROM sorted').fetchone()[0]
    if kept_rows != sorted_rows:
        fail(f'{kept_rows} kept rows became {sorted_rows} after the name join')
    for label, year, rows in db.execute("SELECT status_city, status_year, count(*) FROM sorted WHERE kind='set_aside' GROUP BY ALL").fetchall():
        set_aside[(label, year)] = rows
    empty = sorted(key for key, rows in set_aside.items() if not rows)
    if empty:
        fail(f'analysis/race-notes.json sets aside {empty}: no kept marathon row of this release is in an edition of that label and year')
    db.execute('DROP VIEW kept')
    for table in ('base', 'names'):       # read into `sorted`; their space is used again
        db.execute(f'DROP TABLE {table}')
    db.execute('CHECKPOINT')
    # The identity file against the listed results, on the few columns it takes: every listed result has a row of it,
    # with the release's own link tier; only a confirmed tier carries a runner key; a key is one person.
    confirmed = ', '.join(quote(tier) for tier, code in LINK_TIERS.items() if code in CONFIRMED)
    absent, tier_differs, key_on_possible = db.execute(f"""SELECT count(*) FILTER (WHERE i.record_id IS NULL),
        count(*) FILTER (WHERE i.record_id IS NOT NULL AND i.link_tier IS DISTINCT FROM s.confidence),
        count(*) FILTER (WHERE i.runner_key IS NOT NULL AND (NOT s.linked OR s.confidence NOT IN ({confirmed})))
      FROM (SELECT dbh, id, linked, confidence FROM sorted WHERE kind='result') s
      LEFT JOIN (SELECT dbh, record_id, link_tier, runner_key FROM ident) i ON i.dbh=s.dbh AND i.record_id=s.id""").fetchone()
    if absent or tier_differs or key_on_possible:
        fail(f'the identity file does not fit the release: {absent} listed results have no identity row, {tier_differs} have another '
             f'link tier than the person-links file, {key_on_possible} carry a runner key without a confirmed tier')
    keys, persons, pairs = db.execute("""SELECT count(DISTINCT i.runner_key), count(DISTINCT s.pk), count(DISTINCT {'key': i.runner_key, 'person': s.pk})
        FROM (SELECT dbh, id, pk FROM sorted WHERE kind='result' AND linked) s
        JOIN (SELECT dbh, record_id, runner_key FROM ident WHERE runner_key IS NOT NULL) i ON i.dbh=s.dbh AND i.record_id=s.id""").fetchone()
    if not keys == persons == pairs:
        fail(f'runner keys and persons do not pair one to one among confirmed links ({keys} keys, {persons} persons, {pairs} pairs)')
    step('rows joined to their names', rows=sorted_rows)

    # ---- editions
    db.execute("""CREATE TEMP TABLE ed AS SELECT h, dbh, city, year, count(*) FILTER (WHERE kind='result') AS n,
        count(*) FILTER (WHERE kind<>'result') AS unlisted, min(id) FILTER (WHERE kind='result') AS id0,
        count(*) FILTER (WHERE short) AS short, count(*) AS rows FROM sorted GROUP BY ALL""")
    tiers = {}
    for distance, source_db, city, year, tier, split in db.execute(f"""SELECT distance, source_db, city, year::INTEGER, verification_tier, split_tier
            FROM read_csv({quote(core / 'EDITION-TIERS.csv')}, header=true, all_varchar=true)""").fetchall():
        key = (distance == 'half', source_db == 'half', city, year)
        if key in tiers:
            fail(f'EDITION-TIERS.csv lists the edition {key} twice')
        tiers[key] = (tier, split)
    gross = {(row[0], row[1], row[2]) for row in db.execute(f"""SELECT source_db='half', city, year::INTEGER FROM read_parquet({quote(core / 'edition_meta.parquet')})
        WHERE distance='half' AND lower(timing_basis) LIKE 'gross%'""").fetchall()}
    never = half_rule['no_comparison']
    listed_gross = {(db_name == 'half', city, year) for db_name, city, year in never['gun_times']['editions']}
    if gross != listed_gross:
        fail(f'the half editions whose timing basis starts with "gross" are not the reviewed gun-time list: {sorted(gross ^ listed_gross)}')
    listed_short = {(db_name == 'half', city, year) for db_name, city, year in never['course_suspected_short']['editions']}
    edition_rows = db.execute('SELECT h, dbh, city, year, n, unlisted, id0, short, rows FROM ed ORDER BY ALL').fetchall()
    short_found = {(dbh, city, year) for h, dbh, city, year, n, unlisted, id0, short, rows in edition_rows if short}
    partly = [(city, year) for h, dbh, city, year, n, unlisted, id0, short, rows in edition_rows if short and (short != rows or not h)]
    if short_found != listed_short or partly:
        fail(f'the editions flagged course_shortened_suspect are not the reviewed list, or are flagged in part: {sorted(short_found ^ listed_short)} {partly}')

    try:
        marathon_keys, registry_tag, digests['race-registry.json'] = read_registry(registry_path, 'marathon')
        half_registry = None
        if half_registry_path:
            half_registry, half_tag, digests['half-race-registry.json'] = read_registry(Path(half_registry_path), 'half')
            if half_tag != tag:
                fail(f'the half race registry is of {half_tag!r}, not {tag!r}')
        else:
            notes.add('half_registry')
        first_years = {}
        for h, dbh, city, year, *_ in edition_rows:
            if h:
                first_years[city] = min(year, first_years.get(city, year))
        half_keys = half_races(first_years, half_registry)
    except RaceError as error:
        fail(str(error))
    if registry_tag != tag:
        fail(f'the race registry is of {registry_tag!r}, not {tag!r}')
    if registry_path.resolve() != REGISTRY_PATH.resolve() and file_sha256(REGISTRY_PATH) != digests['race-registry.json']:
        notes.add('race_registry')
    policy, cohort, cohort_index = {}, None, {}
    pipeline = {}
    if status_sidecar is not None:
        pipeline = {'input_manifest_sha256': status_sidecar.get('input_manifest_sha256'), 'policy_sha256': status_sidecar.get('policy_sha256')}
    if policy_path:
        policy, policy_document, digests['edition-policy.json'] = load_policy(Path(policy_path))
        if policy_document.get('release_tag', policy_document.get('tag')) != tag:
            fail(f'the edition policy file is not of {tag!r}')
        if pipeline.get('policy_sha256') and policy_document.get('policy_sha256') and policy_document['policy_sha256'] != pipeline['policy_sha256']:
            fail('the edition policy file and the status file were made under different policies (policy_sha256)')
    else:
        notes.add('edition_policy')
    # The status file names each record's edition as the pipeline does: the registry label and the year.
    labels = db.execute("""SELECT city, status_city, year, status_year, count(*) FROM sorted WHERE NOT h GROUP BY ALL""").fetchall()
    absent = sorted({city for city, *_ in labels if city not in marathon_keys})
    if absent:
        fail(f'the marathon key {absent[0]!r} (and {len(absent) - 1} more) has no race: the registry is not of these rows')
    wrong = [(city, year, named, named_year) for city, named, year, named_year, n in labels if marathon_keys[city][0] != named or year != named_year]
    if wrong:
        fail(f'{len(wrong)} marathon editions are named differently by the status file and the race registry, for example {wrong[:3]}')
    cohort_raw = {}
    if cohort_path:
        cohort, cohort_index, cohort_raw, cohort_document = load_cohort(Path(cohort_path))
        if cohort.get('release_tag') != tag:
            fail(f"the cohort manifest is of {cohort['release_tag']!r}, not {tag!r}")
        # The cohort and the lookup must be cut from the same two files of the pipeline.
        for name, key in (('record-status.parquet', 'record_status'), ('identity.parquet', 'identity')):
            listed = (cohort_document.get('inputs') or {}).get(key, {}).get('sha256')
            if listed != digests[name]:
                fail(f'the cohort was built from another {name} than this build reads ({listed} against {digests[name]})')
    else:
        notes.add('cohort')

    races, race_index, reasons, reason_index, editions, unlisted_editions = [], {}, [], {}, [], []
    for h, dbh, city, year, n, unlisted, id0, short, rows in edition_rows:
        if (h, dbh, city, year) not in tiers:
            fail(f'the edition {(h, dbh, city, year)} has rows and no row in EDITION-TIERS.csv')
        tier, split = tiers[(h, dbh, city, year)]
        if tier not in TIERS or split not in ('splits', 'finish_time_only'):
            fail(f'the edition {(city, year)} has the tier {tier!r} and split tier {split!r}, which this builder does not know')
        names_of = half_keys if h else marathon_keys
        if city not in names_of:
            fail(f'the {"half" if h else "marathon"} key {city!r} has no race: the registry is not of these rows')
        label, name = names_of[city]
        entry = {'h': h, 'dbh': dbh, 'city': city, 'label': label, 'name': name, 'year': year, 'tier': TIERS.index(tier),
                 'splits': split == 'splits', 'db': 'h' if dbh else 'f', 'unlisted': unlisted,
                 'no_comparison': 0 if not h else 1 if (dbh, city, year) in listed_gross else 2 if (dbh, city, year) in listed_short else 0}
        if cohort_raw and not h and cohort_raw.get((label, year)) != rows:
            fail(f'{label} {year} holds {rows} kept rows; the cohort manifest counts {cohort_raw.get((label, year))} raw records')
        if not n:
            unlisted_editions.append(['h' if h else 'm', label, year, entry['db'], unlisted])
            continue
        entry['q'] = id0 // 256
        listed = None if h else policy.get((label, year), policy.get((city, year)))
        sentence = listed[0] if listed else None
        entry['own_record'] = listed[1] if listed else None
        entry['cohort'] = -1 if h else cohort_index.get((label, year), -1)
        if sentence is None:
            entry['reason'] = -1
        else:
            if sentence not in reason_index:
                reason_index[sentence] = len(reasons)
                reasons.append(sentence)
            entry['reason'] = reason_index[sentence]
        editions.append(entry)
    editions.sort(key=lambda e: (e['h'], e['label'], e['year'], e['dbh']))
    for at, entry in enumerate(editions):
        if at and (entry['h'], entry['label'], entry['year'], entry['dbh']) == tuple(editions[at - 1][k] for k in ('h', 'label', 'year', 'dbh')):
            fail(f"two editions share the distance, race label, year and database: {entry['label']!r} {entry['year']}")
        triple = ('h' if entry['h'] else 'm', entry['label'], entry['name'])
        if triple[:2] not in race_index:
            race_index[triple[:2]] = len(races)
            races.append(list(triple))
        elif races[race_index[triple[:2]]][2] != triple[2]:
            fail(f'the race label {triple[1]!r} has two display names')
        entry['race'] = race_index[triple[:2]]
    # Reason sentences in first-use order of the final edition order, so the file does not depend on the scan order above.
    order, remap = [], {}
    for entry in editions:
        if entry['reason'] >= 0 and entry['reason'] not in remap:
            remap[entry['reason']] = len(order)
            order.append(reasons[entry['reason']])
    for entry in editions:
        entry['reason'] = remap.get(entry['reason'], -1)
    reasons = order
    db.execute('CREATE TEMP TABLE edx (h BOOLEAN, dbh BOOLEAN, city VARCHAR, year INTEGER, e INTEGER)')
    db.executemany('INSERT INTO edx VALUES (?, ?, ?, ?, ?)', [(e['h'], e['dbh'], e['city'], e['year'], at) for at, e in enumerate(editions)])
    db.execute('CREATE TEMP TABLE edt (e INTEGER, tier INTEGER, g INTEGER)')
    db.executemany('INSERT INTO edt VALUES (?, ?, ?)', [(at, e['tier'], e['no_comparison']) for at, e in enumerate(editions)])
    body = editions_body(races, editions, reasons)
    editions_bytes, editions_sha = write_gz(output / 'editions.json.gz', body)
    editions_raw = hashlib.sha256(body).hexdigest()
    step('editions written', editions=len(editions), races=len(races), bytes=editions_bytes)

    # ---- results with their edition, profile and shard
    # A link of a confirmed tier is confirmed when the identity file gives its record a runner key; else a screen failed.
    # (One number names a record of either database: twice its id, plus one in the half database.)
    link_code = ' '.join(f"WHEN s.confidence={quote(tier)} THEN CASE WHEN s.keyed THEN '{code}' ELSE '{LINK_SCREENED.get(code, code)}' END"
                         for tier, code in LINK_TIERS.items())
    as_written(f"""CREATE TABLE res AS SELECT s.h, s.dbh, s.id, s.year, s.name, s.x, s.a, s.fin, s.s0, s.s1, s.s2, s.s3, s.s4, s.s5, s.s6, s.s7,
        CASE WHEN s.h THEN '-' ELSE s.st END AS st, s.skey, CASE WHEN NOT s.linked THEN '0' {link_code} END AS c, s.pk, s.linked, x.e,
        CASE WHEN s.linked THEN ('0x' || substr(s.pk, 5, 3))::INTEGER ELSE ('0x' || substr(sha256(s.pk), 1, 3))::INTEGER END AS shard
      FROM (SELECT *, (id*2 + dbh::INTEGER) IN (SELECT record_id*2 + dbh::INTEGER FROM ident WHERE runner_key IS NOT NULL) AS keyed
            FROM sorted WHERE kind='result') s
      JOIN edx x ON x.h=s.h AND x.dbh=s.dbh AND x.city=s.city AND x.year=s.year""")
    results = db.execute('SELECT count(*) FROM res').fetchone()[0]
    if results != db.execute("SELECT count(*) FROM sorted WHERE kind='result'").fetchone()[0]:
        fail('listed results were lost in the edition join')
    mixed = db.execute("""SELECT count(*) FROM (SELECT pk FROM res WHERE linked GROUP BY pk
        HAVING count(*) FILTER (WHERE c IN ('1', '2', '3'))>0 AND count(*) FILTER (WHERE c IN ('b', 'c', 'd'))>0)""").fetchone()[0]
    if mixed:
        fail(f'{mixed} persons have both keyed and unkeyed links of a confirmed tier: a screen applies to a whole person')
    doubled = db.execute('SELECT count(*) FROM (SELECT pk FROM res GROUP BY pk HAVING count(DISTINCT shard)>1)').fetchone()[0]
    if doubled:
        fail(f'{doubled} profiles fall in two shards')
    # A counted edition holds statuses 0 and 2 to 5; an own-record edition 1 and 2 to 5; an edition of recorded times only 6.
    for e, st, n in ([] if not policy else db.execute('SELECT e, st, count(*) FROM res WHERE NOT h GROUP BY ALL ORDER BY ALL').fetchall()):
        listed, own = editions[e]['reason'] >= 0, editions[e]['own_record']
        allowed = '02345' if not listed else '6' if own is False else '12345' if own else '123456'
        if st not in allowed:
            fail(f"{n} results of {editions[e]['label']} {editions[e]['year']} have status {st}, which does not fit the edition policy file")
    db.execute(f"""CREATE TABLE prof AS WITH g AS (SELECT pk, min(shard) AS shard, bool_or(linked) AS linked, count(*)::INTEGER AS n,
          (count(*) FILTER (WHERE c IN ('1', '2', '3') AND NOT h))::INTEGER AS cm, (count(*) FILTER (WHERE c IN ('1', '2', '3') AND h))::INTEGER AS ch,
          min(year) AS y0, max(year) AS y1, min(year) FILTER (WHERE c IN ('1', '2', '3')) AS cy0, max(year) FILTER (WHERE c IN ('1', '2', '3')) AS cy1,
          min(e) AS e1, min(dbh::INTEGER) AS d0, min(id) AS id0 FROM res GROUP BY pk)
        SELECT *, (row_number() OVER (PARTITION BY shard ORDER BY NOT linked, CASE WHEN linked THEN pk END, d0, id0) - 1)::INTEGER AS pos FROM g""")
    profiles = db.execute('SELECT count(*) FROM prof').fetchone()[0]
    loose = db.execute("SELECT count(*) FROM prof WHERE NOT linked AND n<>1").fetchone()[0]
    assert loose == 0, 'a result with no link is its own profile'

    # ---- counts of the rows, each recounted by scripts/verify-lookup.cjs from the files
    counts = {}
    for half, name in ((False, 'marathon'), (True, 'half')):
        kinds = dict(db.execute('SELECT kind, count(*) FROM sorted WHERE h=? GROUP BY kind', [half]).fetchall())
        block = {
            'release_rows': base_rows.get(half, 0),
            'left_out': left_out[name],
            'set_aside': {'rows': kinds.get('set_aside', 0) if not half else 0,
                          'editions': [[label, year, rows] for (label, year), rows in sorted(set_aside.items())] if not half else []},
            'unnamed': kinds.get('unnamed', 0),
            'placeholder': {'flagged': kinds.get('flagged', 0), 'listed': kinds.get('listed', 0)},
            'results': kinds.get('result', 0),
            'no_finish': db.execute('SELECT count(*) FROM res WHERE h=? AND fin IS NULL', [half]).fetchone()[0],
            'finish_unread': db.execute('SELECT count(*) FROM sorted WHERE h=? AND kind=\'result\' AND has_finish AND fin IS NULL', [half]).fetchone()[0],
            'editions': sum(1 for entry in editions if entry['h'] == half),
            'unlisted_editions': [row for row in unlisted_editions if row[0] == ('h' if half else 'm')],
            'tier': {str(code): n for code, n in db.execute('SELECT t.tier, count(*) FROM res r JOIN edt t USING (e) WHERE r.h=? GROUP BY ALL ORDER BY 1', [half]).fetchall()},
            'link': dict(db.execute('SELECT c, count(*) FROM res WHERE h=? GROUP BY c ORDER BY c', [half]).fetchall()),
            'age_hidden': db.execute("SELECT count(*) FROM sorted WHERE h=? AND kind='result' AND age_hidden", [half]).fetchone()[0],
            'checkpoints_unread': db.execute("SELECT coalesce(sum(unread), 0)::BIGINT FROM sorted WHERE h=? AND kind='result'", [half]).fetchone()[0],
        }
        if not half:
            block['status'] = dict(db.execute("SELECT st, count(*) FROM res WHERE NOT h GROUP BY st ORDER BY st").fetchall())
            block['unlisted_status'] = dict(db.execute("SELECT st, count(*) FROM sorted WHERE NOT h AND kind<>'result' GROUP BY st ORDER BY st").fetchall())
        else:
            block['no_comparison'] = {str(code): n for code, n in db.execute('SELECT t.g, count(*) FROM res r JOIN edt t USING (e) WHERE r.h AND t.g>0 GROUP BY ALL ORDER BY 1').fetchall()}
        if block['release_rows'] != (block['left_out']['rows'] + block['set_aside']['rows'] + block['unnamed'] + block['placeholder']['flagged']
                                     + block['placeholder']['listed'] + block['results']) or (half and kinds.get('set_aside')):
            fail(f'the {name} rows do not add up: {json.dumps(block)}')
        counts[name] = block
    kinds = dict(db.execute("""SELECT CASE WHEN n=1 THEN 'one_result' WHEN cm + ch=n THEN 'confirmed_only' WHEN cm + ch=0 THEN 'possible_only'
        ELSE 'confirmed_and_possible' END, count(*) FROM prof GROUP BY ALL""").fetchall())
    profiles_by_kind = {kind: kinds.get(kind, 0) for kind in ('one_result', 'confirmed_only', 'confirmed_and_possible', 'possible_only')}
    names_count = db.execute('SELECT count(*) FROM (SELECT DISTINCT pk, name FROM res)').fetchone()[0]
    if status_sidecar is not None:
        totals = {'counted': 0, 'own_record': 0, 'limited': 0}
        for source in (counts['marathon']['status'], counts['marathon']['unlisted_status']):
            for digit, n in source.items():
                totals['counted' if digit == '0' else 'own_record' if digit == '1' else 'limited'] += n
        if totals != {key: status_sidecar['counts']['by_status'].get(key, 0) for key in totals}:
            fail(f"the kept marathon rows by status are {totals}; the status file's own counts are {status_sidecar['counts']['by_status']}")
        pipeline['record_status'] = {'records': status_sidecar['counts']['records'], 'by_status': status_sidecar['counts']['by_status']}
    if cohort:
        raw = (counts['marathon']['results'] + counts['marathon']['unnamed'] + sum(counts['marathon']['placeholder'].values())
               + counts['marathon']['set_aside']['rows'])
        if cohort['raw_records'] != raw:
            fail(f"the marathon results with the unnamed, placeholder and set-aside rows are {raw}; the cohort’s raw records are {cohort['raw_records']}")
        # Counted and own-record rows: the listed results and the kept rows that are not listed (no usable name, a placeholder name).
        for digit, field, what in (('0', 'eligible_records', 'counted'), ('1', 'own_record_records', 'own-record')):
            kept = counts['marathon']['status'].get(digit, 0) + counts['marathon']['unlisted_status'].get(digit, 0)
            if cohort[field] is not None and cohort[field] != kept:
                fail(f'{kept} kept marathon rows are {what}; the cohort holds {cohort[field]}')
    db.execute('DROP TABLE sorted')
    db.execute('CHECKPOINT')
    step('profiles formed', results=results, profiles=profiles)

    # ---- profile shards
    bases = [entry['q'] * 256 for entry in editions]
    profiles_hash, names_hash = hashlib.sha256(), hashlib.sha256()
    shard_entries, shard_bytes = [], 0

    def write_shard(number, shard):
        nonlocal shard_bytes
        body = shard.body()
        profiles_hash.update(body)
        size, digest = write_gz(output / shard_path(number), body)
        shard_bytes += size
        shard_entries.append([shard.profiles(), shard.results(), size, digest])

    # One range of shards at a time, in shard order: each read sorts in memory, and the rows arrive in one total order.
    ordered = """SELECT p.shard, p.pos, r.e, r.id, r.name, r.fin, r.x, r.a, r.c, r.st, r.h, r.s0, r.s1, r.s2, r.s3, r.s4, r.s5, r.s6, r.s7
        FROM res r JOIN prof p USING (pk) WHERE r.shard BETWEEN ? AND ? AND p.shard BETWEEN ? AND ?
        ORDER BY p.shard, p.pos, r.h, r.year, r.id, r.dbh"""
    current, shard, position, written = -1, None, None, 0
    half_points = CHECKPOINTS['half']
    for first in range(0, PROFILE_SHARDS, SHARD_RANGE):
        if _WATCH is not None:
            _WATCH.check()
        cursor = db.execute(ordered, [first, first + SHARD_RANGE - 1] * 2)
        while batch := cursor.fetchmany(100000):
            for row in batch:
                if row[0] != current:
                    if shard is not None:
                        write_shard(current, shard)
                    for empty in range(current + 1, row[0]):
                        write_shard(empty, ShardBody())
                    current, shard, position = row[0], ShardBody(), None
                if row[1] != position:
                    if row[1] != shard.profiles():
                        fail(f'profile positions of shard {current:03x} are not consecutive')
                    shard.start_profile()
                    position = row[1]
                offset = row[3] - bases[row[2]]
                if offset < 0:
                    fail('a record id lies under its edition’s base')
                if shard.add(row[2], offset, row[5], row[6], row[7], row[8], row[4], row[9], row[11:11 + half_points] if row[10] else row[11:19]):
                    names_hash.update(normalize_name(row[4]).encode('utf-8') + b'\n')
                written += 1
    if shard is not None:
        write_shard(current, shard)
    for empty in range(current + 1, PROFILE_SHARDS):
        write_shard(empty, ShardBody())
    if written != results or sum(entry[0] for entry in shard_entries) != profiles or len(shard_entries) != PROFILE_SHARDS:
        fail(f'{written} of {results} results and {sum(entry[0] for entry in shard_entries)} of {profiles} profiles were written')
    profile_pages = []
    for first in range(0, PROFILE_SHARDS, PAGE_SIZE):
        size, digest = write_gz(output / profile_page_path(first // PAGE_SIZE), profile_page_body(first, shard_entries[first:first + PAGE_SIZE]))
        profile_pages.append([size, digest])
    step('profile shards written', bytes=shard_bytes, largest=max(entry[2] for entry in shard_entries))

    # ---- search names and postings
    db.execute("""CREATE TABLE srows AS WITH sn AS (SELECT pk, skey,
          arg_min(name, ((9999 - year)::BIGINT*2 + h::INTEGER)*100000000000 + id*2 + dbh::INTEGER) AS shown,
          count(*)::INTEGER AS ns, (count(*) FILTER (WHERE c IN ('1', '2', '3')))::INTEGER AS ncs,
          min(year) AS y0s, max(year) AS y1s, min(e) AS e1s FROM res GROUP BY pk, skey),
        snr AS (SELECT s.skey, s.shown, p.shard, p.pos,
          CASE WHEN p.cm + p.ch>0 AND s.ncs=0 THEN 1 ELSE 0 END AS pf,
          CASE WHEN p.cm + p.ch>0 AND s.ncs=0 THEN s.ns=1 ELSE p.n=1 END AS one,
          s.ns, s.y0s, s.y1s, s.e1s, p.n, p.cm, p.ch, p.y0, p.y1, p.cy0, p.cy1, p.e1 FROM sn s JOIN prof p USING (pk))
        SELECT skey, shown, shard, pos,
          CASE WHEN NOT one THEN -1 WHEN pf=1 THEN e1s ELSE e1 END AS e,
          CASE WHEN one THEN 0 WHEN pf=1 THEN y0s WHEN cm + ch>0 THEN cy0 ELSE y0 END AS y,
          CASE WHEN one THEN 0 WHEN pf=1 THEN y1s - y0s WHEN cm + ch>0 THEN cy1 - cy0 ELSE y1 - y0 END AS s,
          CASE WHEN one OR pf=1 THEN 0 ELSE cm END AS m, CASE WHEN one OR pf=1 THEN 0 ELSE ch END AS hh,
          CASE WHEN one THEN 0 WHEN pf=1 THEN ns ELSE n - cm - ch END AS q, pf FROM snr""")
    for table in ('res', 'prof'):
        db.execute(f'DROP TABLE {table}')
    db.execute('CHECKPOINT')
    search_names = db.execute('SELECT count(*) FROM srows').fetchone()[0]
    db.execute("CREATE TABLE words AS SELECT w, count(*) AS n FROM (SELECT unnest(string_split(skey, ' ')) AS w FROM srows) GROUP BY w")
    heavy = db.execute('SELECT w, n FROM words WHERE n>? ORDER BY w', [index_rules['heavy_over']]).fetchall()
    db.execute('CREATE TEMP TABLE heavy AS SELECT w FROM words WHERE n>?', [index_rules['heavy_over']])
    word_count = db.execute('SELECT count(*) FROM words').fetchone()[0]
    # Every posting, written once and then read one range of words at a time: each read sorts in memory.
    db.execute("""CREATE TABLE post AS WITH u AS (SELECT r.*, string_split(skey, ' ') AS ws FROM srows r), v AS (SELECT u.*, unnest(ws) AS w FROM u),
        light AS (SELECT w, '' AS o, shown, shard, pos, e, y, s, m, hh, q, pf FROM v ANTI JOIN heavy USING (w)),
        hv AS (SELECT w, unnest(CASE WHEN len(ws)=1 THEN [''] ELSE list_filter(ws, lambda other: other<>w) END) AS o,
                      shown, shard, pos, e, y, s, m, hh, q, pf FROM v SEMI JOIN heavy USING (w))
        SELECT * FROM light UNION ALL SELECT * FROM hv""")
    for table in ('srows', 'words'):
        db.execute(f'DROP TABLE {table}')
    db.execute('CHECKPOINT')
    starts = [row[0] for row in db.execute(f"""WITH per AS (SELECT w, count(*) AS n FROM post GROUP BY w),
        run AS (SELECT w, sum(n) OVER (ORDER BY w) AS upto, sum(n) OVER () AS total FROM per)
        SELECT min(w) FROM run GROUP BY ((upto - 1) * {int(POSTING_RANGES)} // total) ORDER BY 1""").fetchall()]
    step('search names formed', search_names=search_names, words=word_count, heavy=len(heavy))

    index_hash = hashlib.sha256()
    leaf_entries, leaf_stats = [], {'bytes': 0, 'largest': 0, 'fewest_rows': None, 'most_rows': 0, 'fewest_profiles': None}

    def write_leaf(leaf):
        rows = leaf['rows']
        body = leaf_body(rows)
        index_hash.update(body)
        size, digest = write_gz(output / leaf_path(len(leaf_entries)), body)
        people = len({(row[3], row[4]) for row in rows})
        leaf_entries.append([leaf['key'][0], leaf['key'][1], leaf['key'][2], len(rows), size, digest])
        leaf_stats['bytes'] += size
        leaf_stats['largest'] = max(leaf_stats['largest'], size)
        leaf_stats['most_rows'] = max(leaf_stats['most_rows'], len(rows))
        leaf_stats['fewest_rows'] = len(rows) if leaf_stats['fewest_rows'] is None else min(leaf_stats['fewest_rows'], len(rows))
        leaf_stats['fewest_profiles'] = people if leaf_stats['fewest_profiles'] is None else min(leaf_stats['fewest_profiles'], people)

    cutter = LeafCutter({word for word, _ in heavy}, write_leaf, index_rules)
    for at, low in enumerate(starts):
        if _WATCH is not None:
            _WATCH.check()
        last = at + 1 == len(starts)
        cursor = db.execute(f"""SELECT w, o, shown, shard, pos, e, y, s, m, hh, q, pf FROM post WHERE w>=? {'' if last else 'AND w<?'}
            ORDER BY w, o, shown, shard, pos""", [low] if last else [low, starts[at + 1]])
        while batch := cursor.fetchmany(100000):
            for row in batch:
                cutter.add(row)
    cutter.finish()
    index_rows = sum(entry[3] for entry in leaf_entries)
    if index_rows != cutter.rows:
        fail('postings were lost between the cutter and the leaves')
    index_pages = []
    for first in range(0, len(leaf_entries), PAGE_SIZE):
        size, digest = write_gz(output / index_page_path(first // PAGE_SIZE), index_page_body(first, leaf_entries[first:first + PAGE_SIZE]))
        index_pages.append([leaf_entries[first][0], leaf_entries[first][1], leaf_entries[first][2], size, digest])
    if len(index_pages) > 100:
        fail('more than 100 index pages: the page file names need a third digit')
    step('index written', leaves=len(leaf_entries), rows=index_rows, **leaf_stats)

    counts.update({'results': results, 'profiles': profiles, 'profiles_by_kind': profiles_by_kind, 'names': names_count,
                   'search_names': search_names, 'index_rows': index_rows, 'heavy_words': len(heavy)})

    manifest = {
        'schema_version': SCHEMA_VERSION, 'release_tag': tag, 'input_as_of': input_as_of,
        'as_of': as_of or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'provisional': sorted(notes),
        'inputs': dict(sorted(digests.items())),
        'scripts': scripts,
        'cohort': cohort, 'pipeline': pipeline,
        'time_unit_ms': TIME_UNIT_MS, 'points_km': POINTS_KM,
        'counts': counts,
        'rules': {**RULES, 'index': index_rules},
        'content': {'profiles_raw_sha256': profiles_hash.hexdigest(), 'index_raw_sha256': index_hash.hexdigest(),
                    'editions_raw_sha256': editions_raw, 'names_normalized_sha256': names_hash.hexdigest()},
        'editions': {'file': 'editions.json.gz', 'bytes': editions_bytes, 'sha256': editions_sha, 'count': len(editions), 'races': len(races)},
        'index': {'leaves': len(leaf_entries), 'pages': index_pages, 'heavy': [[word, n] for word, n in heavy]},
        'profiles': {'shards': PROFILE_SHARDS, 'pages': profile_pages},
    }
    (output / 'manifest.json').write_bytes(encode(manifest))
    step('manifest written', provisional=manifest['provisional'], files=2 + len(leaf_entries) + len(index_pages) + PROFILE_SHARDS + len(profile_pages),
         bytes=shard_bytes + leaf_stats['bytes'] + editions_bytes + sum(p[3] for p in index_pages) + sum(p[0] for p in profile_pages))
    return manifest


def build_lookup(db, source, output, provenance):
    """The version 1 lookup, as analysis/build_public_explorer.py still calls it. Kept only until the pipeline stops
    writing the version 1 files (lead decision D24.1: the analyses read the names-free cohort); remove it with that call."""
    from lookup_v1_legacy import build_lookup as legacy
    return legacy(db, source, output, provenance)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--core', type=Path, required=True, help='the unpacked CORE folder of the pinned release')
    parser.add_argument('--links', type=Path, required=True, help='the pinned person-links Parquet file')
    parser.add_argument('--status', type=Path, required=True, help='the pipeline’s record-status.parquet')
    parser.add_argument('--identity', type=Path, required=True, help='the pipeline’s identity.parquet')
    parser.add_argument('--cohort', type=Path, default=COHORT_PATH if COHORT_PATH.is_file() else None,
                        help='the cohort manifest (default analysis/marathon-cohort/manifest.json; without one the build is provisional)')
    parser.add_argument('--policy', type=Path, default=POLICY_PATH if POLICY_PATH.is_file() else None,
                        help='the edition policy with its reason sentences (default public/data/edition-policy.json; without one the build is provisional)')
    parser.add_argument('--registry', type=Path, default=REGISTRY_PATH)
    parser.add_argument('--half-registry', type=Path)
    parser.add_argument('--race-notes', type=Path, default=RACE_NOTES_PATH if RACE_NOTES_PATH.is_file() else None,
                        help='the race directory’s notes, whose set_aside_editions are kept and never listed (default analysis/race-notes.json; '
                             'without one the build is provisional)')
    parser.add_argument('--pin', type=Path, default=PIN_PATH)
    parser.add_argument('--output', type=Path, required=True, help='the runners folder to write; it must not hold a build')
    parser.add_argument('--as-of', help='the build time to record (UTC, YYYY-MM-DDTHH:MM:SSZ); default now')
    parser.add_argument('--temp', type=Path)
    parser.add_argument('--memory', default='3GB')
    parser.add_argument('--temp-limit-gb', type=float, default=TEMP_LIMIT_GB,
                        help=f'stop the build when its temporary folder passes this size (default {TEMP_LIMIT_GB}; 0 for no limit)')
    parser.add_argument('--threads', type=int, default=2)
    args = parser.parse_args(argv)
    if args.as_of and not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', args.as_of):
        parser.error('--as-of must read YYYY-MM-DDTHH:MM:SSZ')
    global LOG
    LOG = True

    def stop(number, frame):
        raise Stopped(signal.Signals(number).name)
    for name in ('SIGTERM', 'SIGINT', 'SIGHUP'):
        signal.signal(getattr(signal, name), stop)
    try:
        build(args.core, args.links, args.status, args.identity, args.output, pin_path=args.pin, registry_path=args.registry,
              half_registry_path=args.half_registry, policy_path=args.policy, cohort_path=args.cohort, race_notes_path=args.race_notes, as_of=args.as_of,
              temp=args.temp, memory=args.memory, threads=args.threads, temp_limit_gb=args.temp_limit_gb)
    except BuildError as error:
        print(f'build_runner_lookup: {error}', file=sys.stderr)
        return 1
    except (duckdb.OutOfMemoryException, duckdb.IOException) as error:
        print(f'build_runner_lookup: DuckDB ran out of memory or of its temporary space, and the build is stopped: {error}', file=sys.stderr)
        return 1
    except (Stopped, RuntimeError) as error:
        # A signal that arrives inside a query comes back from DuckDB as "Query interrupted", caused by Stopped.
        stopped = error if isinstance(error, Stopped) else error.__cause__
        if not isinstance(stopped, Stopped):
            raise
        print(f'build_runner_lookup: stopped by {stopped}; the temporary folder and the unfinished output are removed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
