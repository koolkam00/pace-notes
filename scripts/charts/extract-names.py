#!/usr/bin/env python3
"""Every recorded runner name of the adapted marathon input, for the name guard of the recounts.

The marathon cohort (analysis/marathon-cohort) holds no names, so a recount that checks "no published string equals a
recorded runner name" (scripts/charts/names.cjs, read by scripts/verify-charts.cjs) needs them from somewhere else:
the runner lookup's index once it is committed, and until then the file this script writes. The file is never
committed; a verifier is told where it is by the environment variable PACE_NOTES_NAMES_FILE.

It writes two files:

  <output>        gzip text, UTF-8, one name per line, distinct, sorted by code point: the non-empty `runner` value of
                  every row of <input>/race_records.parquet, as recorded, except that a carriage return, line feed or
                  tab inside a name is written as a space (so a line is a name; no reader's normalisation is changed
                  by it, since each one already turns every run of such characters into a space).
  <output>.json   what the file was read from: the SHA-256 of <input>/MANIFEST.json (the adapted input's manifest, the
                  digest the cohort manifest stores as `input_manifest_sha256`), the release tag, the row counts, the
                  number of names, the size and SHA-256 of the gzip file and the SHA-256 of this script. The reader
                  refuses a names file whose sidecar is missing or does not match the cohort it is checking.

Usage (Python that reads downloaded data runs isolated):
  python3 -I scripts/charts/extract-names.py --input /path/to/adapted/full --output /path/outside/the/checkout/names.txt.gz
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import duckdb

FORMAT = 1


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True, help='the adapted marathon input folder that holds MANIFEST.json and race_records.parquet')
    p.add_argument('--output', required=True, help='the gzip names file to write (outside the checkout); a .json sidecar is written beside it')
    a = p.parse_args()
    root, output = Path(a.input), Path(a.output)
    repository = Path(__file__).resolve().parents[2]
    if repository in output.resolve().parents:
        raise SystemExit('The names file holds recorded names for a local check and is never committed: write it outside the checkout.')
    manifest = json.loads((root / 'MANIFEST.json').read_text())
    records = str(root / 'race_records.parquet')
    con = duckdb.connect()
    con.execute("SET memory_limit = '1GB'")
    con.execute('SET threads = 2')
    rows, named = con.execute(
        "SELECT count(*), count(*) FILTER (WHERE runner IS NOT NULL AND trim(runner) <> '') FROM read_parquet(?)", [records]).fetchone()
    cursor = con.execute(
        "SELECT DISTINCT regexp_replace(runner, '[\\r\\n\\t]', ' ', 'g') AS name FROM read_parquet(?) "
        "WHERE runner IS NOT NULL AND trim(runner) <> '' ORDER BY name", [records])
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_name(output.name + '.tmp')
    names, previous = 0, None
    with open(tmp, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=6, mtime=0, filename='') as out:
        while True:
            batch = cursor.fetchmany(200_000)
            if not batch:
                break
            for (name,) in batch:
                # DuckDB orders text by its UTF-8 bytes, which is code-point order; the check keeps the file's promise.
                if previous is not None and not previous.encode() < name.encode():
                    raise SystemExit('The names did not come back distinct and sorted.')
                if '\n' in name or '\r' in name:
                    raise SystemExit('A name still holds a line break.')
                out.write(name.encode() + b'\n')
                previous = name
                names += 1
    tmp.replace(output)
    sidecar = dict(
        format=FORMAT,
        document='Recorded runner names of the adapted marathon input, for the name guard of the recounts. Never committed.',
        release_tag=manifest.get('tag_stub') or (manifest.get('source') or {}).get('tag'),
        input_manifest_sha256=sha256_file(root / 'MANIFEST.json'),
        source='race_records.parquet, column runner',
        rows=int(rows), named_rows=int(named), names=names,
        bytes=output.stat().st_size, sha256=sha256_file(output),
        script='scripts/charts/extract-names.py', script_sha256=sha256_file(Path(__file__).resolve()),
    )
    Path(str(output) + '.json').write_text(json.dumps(sidecar, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps(sidecar, ensure_ascii=False))


if __name__ == '__main__':
    main()
