"""The published list of the editions the edition policy leaves out, with each edition's counts in the cohort.

    python3 -s analysis/build_edition_policy.py --input <adapted FULL or CORE dir> --output public/data/edition-policy.json

From the combined release on (analysis/source_quality.py, LISTED_IN_ONE_FILE; lead ruling R8 of 2026-11-14) a pack, a
manifest or an evidence file states the policy's digests and counts and not the list: the policy names about 2,500
editions, and a copy in every output would add 0.6 MB to each. This builder writes the one copy every reader checks an
output against. It runs the pipeline's own `prepare` (analysis/build_pacing.py), so the counts are the cohort's: for
each listed edition its category, the reason a visitor can read, whether a record of it keeps an own-record view, and
its raw, deduplicated and timing-eligible records. `editions_sha256` is the digest every output of the release states;
a reader rebuilds the rows as objects in the order of `columns` and hashes them
(analysis/source_quality.py published_editions; scripts/lib/edition-policy.cjs).

The file holds no runner record. It is deterministic for one input and one checkout: it has no clock time of its own
(`input_as_of` is the input's).
"""
import argparse
import hashlib
import json
from pathlib import Path

import duckdb

from build_pacing import prepare
from source_quality import editions_document

SCHEMA_VERSION = 1


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build(source):
    db = duckdb.connect()
    db.execute("SET memory_limit='6GB'")
    db.execute('SET threads=3')
    cohort = prepare(db, source)
    document = editions_document(db, source)
    provenance = json.loads((source / 'provenance.json').read_text())
    manifest = json.loads((source / 'MANIFEST.json').read_text())
    assert provenance['release_tag'] == document['release_tag'] and digest(source / 'MANIFEST.json') == provenance['manifest_sha256']
    counts = document['counts']
    assert counts['timing_eligible_excluded'] == cohort['source_quality_excluded'], 'the listed editions do not account for the policy’s exclusions'
    with_records = db.execute('SELECT count(DISTINCT (city, year)) FROM read_parquet(?)', [str(source / 'race_records.parquet')]).fetchone()[0]
    counted = db.execute('SELECT count(DISTINCT (city, year)) FROM eligible').fetchone()[0]
    return {
        'schema_version': SCHEMA_VERSION,
        'document': ('Every marathon edition the edition policy of this release leaves out of pooled statistics: category, reason, whether a record of it '
                     'keeps an own-record view, and its raw, deduplicated and timing-eligible records. Rows are arrays in the order of `columns`; `reason` '
                     'is an index into `reasons`. Outputs of the release state `policy_sha256`, `editions_sha256` and `counts` and are checked against '
                     'this file.'),
        'input_export_id': provenance['release_tag'], 'input_as_of': manifest['created_at'],
        'input_asset_sha256': provenance['asset_sha256'], 'input_manifest_sha256': provenance['manifest_sha256'],
        'scripts': {name: digest(Path(__file__).with_name(name)) for name in ('build_edition_policy.py', 'build_pacing.py', 'source_quality.py')},
        'cohort': cohort,
        'editions_with_records': with_records, 'editions_counted': counted,
        **document,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    document = build(args.input)
    # One edition a line: readable in a diff, and a third of the size of an indented file.
    rows = document.pop('editions')
    head = json.dumps(document, indent=1, ensure_ascii=False, allow_nan=False)
    text = head[:-2] + ',\n "editions": [\n' + ',\n'.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows) + '\n ]\n}\n'
    assert json.loads(text) == {**document, 'editions': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text)
    print(json.dumps({'written': str(args.output), 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'editions': len(rows),
                      'editions_sha256': document['editions_sha256'], 'counts': document['counts']}, indent=1))


if __name__ == '__main__':
    main()
