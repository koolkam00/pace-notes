"""Shared pieces of the race-directory family (docs/RACES.md): paths, digests, deterministic JSON, the clock-string
parser and the DuckDB connection.

Nothing here reads a runner's name into a published value. The modules of the family are analysis/build_races.py (the
builder), analysis/races_duplicates.py (the duplicate-edition audit) and this one.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

ANALYSIS = Path(__file__).resolve().parent
ROOT = ANALYSIS.parent
RELEASE_PATH = ANALYSIS / 'release.json'
REGISTRY_PATH = ANALYSIS / 'race-registry.json'
NOTES_PATH = ANALYSIS / 'race-notes.json'
OUTPUT = ROOT / 'public' / 'data' / 'races'

# The pacing pipeline's parser of an elapsed clock string, word for word (analysis/build_pacing.py prepare(); a test
# compares the two texts): H:MM:SS or M:SS with optional decimals, anything else is no time.
SECONDS_MACRO = r"""CREATE MACRO seconds(s) AS (
      CASE WHEN regexp_full_match(trim(s), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9](\.[0-9]+)?')
        THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*3600
           + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)*60
           + try_cast(split_part(trim(s), ':', 3) AS DOUBLE)
      WHEN regexp_full_match(trim(s), '[0-9]{1,4}:[0-5][0-9](\.[0-9]+)?')
        THEN try_cast(split_part(trim(s), ':', 1) AS DOUBLE)*60
           + try_cast(split_part(trim(s), ':', 2) AS DOUBLE)
      ELSE NULL END)"""


class RacesError(ValueError):
    """A builder of the family refuses: an input is not the pinned one, a count differs, a floor or a ban would break."""


def fail(message: str):
    raise RacesError(message)


def bytes_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def encode(value) -> bytes:
    """Deterministic JSON: sorted keys, no NaN, compact separators, one trailing newline."""
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')) + '\n').encode()


def encode_readable(value) -> bytes:
    """Deterministic JSON for a file people read (evidence, reviewed notes): sorted keys, one-space indent."""
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=1) + '\n').encode()


def inside(path, parent) -> bool:
    try:
        Path(path).resolve().relative_to(Path(parent).resolve())
        return True
    except ValueError:
        return False


def quote(path) -> str:
    """A path as a SQL string literal's body."""
    return str(path).replace("'", "''")


def connect(database: str = ':memory:'):
    """DuckDB with the family's limits: PACE_RACES_DUCKDB_MEMORY (default 1200MB), PACE_RACES_DUCKDB_THREADS (default 2),
    spill to PACE_RACES_TMP or TMPDIR when one is set."""
    import duckdb
    db = duckdb.connect(database)
    db.execute(f"SET memory_limit='{os.environ.get('PACE_RACES_DUCKDB_MEMORY', '1200MB')}'")
    db.execute(f"SET threads={int(os.environ.get('PACE_RACES_DUCKDB_THREADS', '2'))}")
    spill = os.environ.get('PACE_RACES_TMP') or os.environ.get('TMPDIR')
    if spill:
        db.execute(f"SET temp_directory='{quote(spill)}'")
    db.execute(SECONDS_MACRO)
    return db


def adapted_input(source: Path) -> dict:
    """The adapted input's identity: its release tag and the digest and time of its MANIFEST.json, after checking that
    provenance.json names that manifest. Members are checked by the caller against `files`."""
    source = Path(source)
    manifest_bytes = (source / 'MANIFEST.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    provenance = json.loads((source / 'provenance.json').read_text())
    digest = bytes_sha256(manifest_bytes)
    if provenance.get('manifest_sha256') != digest:
        fail('the adapted input: provenance.json names another MANIFEST.json than the one beside it')
    return {'release_tag': provenance.get('release_tag'), 'input_manifest_sha256': digest, 'input_as_of': manifest.get('created_at'),
            'files': manifest.get('files', {}), 'adapter': manifest.get('adapter', {}), 'editions_without_rows': manifest.get('editions_without_rows')}


def check_member(source: Path, files: dict, name: str) -> None:
    digest = file_sha256(Path(source) / name)
    if files.get(name, {}).get('sha256') != digest:
        fail(f'the adapted input: {name} is not the file its MANIFEST.json lists (sha256 {digest})')
