"""An independent recount of the race directory's record-level numbers (docs/RACES.md, "How it is verified").

    python3 -I analysis/races_recount.py --input <adapted FULL or CORE dir> [--data public/data/races] --out <receipt .json>

scripts/verify-races.cjs recounts everything it can from the repository, but the finish times are not in the
repository, so it cannot recount an edition's finishes, its quartiles or its women. This script does, from the adapted
input, with other code than the builder's: analysis/build_races.py asks DuckDB for `quantile_cont` per edition; here
every finish time is read into numpy and each edition's values are sorted and interpolated by hand. It compares

- recorded results and finishes of every edition in directory.json (listed races and those left out),
- finishes, the three quartiles and the women's count, denominator and share of every edition in a race file, and
- the count of editions the release names that have no written row (EDITIONS.json `not_written`),

and writes a receipt bound to the adapted input and to the exact manifest of the published folder. The verifier fails
on a receipt that is missing, not clean, or bound to another build, so a rebuild needs a fresh recount. It reads the
edition, the recorded sex and the finish time of a row, nothing else, and writes counts only.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import races_common as rc  # noqa: E402
from races_common import RacesError, fail  # noqa: E402

SCRIPT = 'analysis/races_recount.py'


def quantile(ordered, q: float) -> float:
    """The linear quantile of sorted values: position (n - 1) q between order statistics."""
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return float(ordered[low]) + (float(ordered[high]) - float(ordered[low])) * (position - low)


def read_editions(source: Path) -> dict:
    """(label, year) -> rows, sorted finish times, women and men among the rows with a finish."""
    import numpy as np
    db = rc.connect()
    path = rc.quote(Path(source) / 'race_records.parquet')
    db.execute(f"""CREATE TEMP TABLE ed AS SELECT city, year, (row_number() OVER (ORDER BY city, year) - 1)::INTEGER AS code
        FROM (SELECT DISTINCT city, year FROM read_parquet('{path}'))""")
    names = {code: (city, int(year)) for city, year, code in db.execute('SELECT city, year, code FROM ed').fetchall()}
    table = db.execute(f"""SELECT e.code AS code, coalesce(seconds(r.split_42_2km), -1.0) AS fin,
        CASE r.sex WHEN 'F' THEN 1 WHEN 'M' THEN 2 ELSE 0 END::TINYINT AS sex
        FROM read_parquet('{path}') r JOIN ed e ON e.city = r.city AND e.year = r.year""").fetchnumpy()
    db.close()
    code, fin, sex = table['code'], table['fin'], table['sex']
    order = np.lexsort((fin, code))
    code, fin, sex = code[order], fin[order], sex[order]
    starts = np.flatnonzero(np.r_[True, code[1:] != code[:-1]])
    ends = np.r_[starts[1:], len(code)]
    out = {}
    for start, end in zip(starts, ends):
        times, sexes = fin[start:end], sex[start:end]
        finished = times >= 0
        out[names[int(code[start])]] = {'rows': int(end - start), 'times': times[finished],
                                        'women': int(np.count_nonzero(sexes[finished] == 1)), 'men': int(np.count_nonzero(sexes[finished] == 2))}
    return out


def recount(source: Path, data: Path) -> dict:
    source, data = Path(source), Path(data)
    if rc.inside(source, rc.ROOT):
        fail(f'{source} is inside the repository; record-level sources stay outside it')
    meta = rc.adapted_input(source)
    for name in ('race_records.parquet', 'EDITIONS.json'):
        rc.check_member(source, meta['files'], name)
    manifest_bytes = (data / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest['release_tag'] != meta['release_tag'] or manifest['input']['manifest_sha256'] != meta['input_manifest_sha256']:
        fail('the published race directory was built from another release or adapted input than the one given')
    for name, entry in manifest['files'].items():
        if rc.file_sha256(data / name) != entry['sha256']:
            fail(f'{name} is not the file the manifest lists; verify the folder before recounting it')
    editions = read_editions(source)
    directory = json.loads((data / 'directory.json').read_text())
    at = {column: i for i, column in enumerate(directory['edition_columns'])}
    mismatches, compared = [], {'editions': 0, 'editions_with_finishes': 0, 'editions_with_quartiles': 0, 'editions_with_a_share_of_women': 0, 'race_files': 0}
    listed = set()

    def differs(what, label, year, published, counted):
        if published != counted:
            mismatches.append({'what': what, 'label': label, 'year': year, 'published': published, 'recounted': counted})

    for race in directory['races'] + directory['left_out']:
        for row in race['editions']:
            key = (race['label'], row[at['year']])
            listed.add(key)
            mine = editions.get(key)
            compared['editions'] += 1
            if mine is None:
                mismatches.append({'what': 'an edition with no row in the adapted input', 'label': key[0], 'year': key[1]})
                continue
            differs('recorded results', *key, row[at['results']], mine['rows'])
            differs('finishes', *key, row[at['finishes']], len(mine['times']))
    for key in sorted(set(editions) - listed):
        mismatches.append({'what': 'an edition with rows that the directory does not list', 'label': key[0], 'year': key[1]})
    for name in sorted(manifest['files']):
        if not name.startswith('race/'):
            continue
        compared['race_files'] += 1
        race = json.loads((data / name).read_text())
        for row in race['editions']:
            key = (race['label'], row['year'])
            mine = editions.get(key)
            if mine is None:
                continue
            if 'finishes' in row:
                compared['editions_with_finishes'] += 1
                differs('finishes in a race file', *key, row['finishes'], len(mine['times']))
            if 'median_s' in row:
                compared['editions_with_quartiles'] += 1
                differs('quartiles', *key, [row['p25_s'], row['median_s'], row['p75_s']], [quantile(mine['times'], q) for q in (0.25, 0.5, 0.75)])
            if row.get('women'):
                compared['editions_with_a_share_of_women'] += 1
                recorded = mine['women'] + mine['men']
                differs('women', *key, [row['women']['n'], row['women']['of'], row['women']['share']],
                        [mine['women'], recorded, round(mine['women'] / recorded, 4) if recorded else None])
    without = len(json.loads((source / 'EDITIONS.json').read_text())['not_written'])
    compared['editions_without_results'] = without
    published = json.loads((data / 'summary.json').read_text())['editions']['without_results']['n']
    if published != without:
        mismatches.append({'what': 'editions without results', 'published': published, 'recounted': without})
    return {
        'document': ('The source recount of the race directory (analysis/races_recount.py): recorded results and finishes of every edition, the finishes, '
                     'quartiles and women of every edition in a race file and the count of editions without results, counted again from the adapted input '
                     'with other code than the builder’s. '
                     'scripts/verify-races.cjs requires it to be clean and bound to the published manifest.'),
        'schema_version': 1, 'status': 'pass' if not mismatches else 'fail',
        'release_tag': meta['release_tag'], 'input_manifest_sha256': meta['input_manifest_sha256'],
        'races_manifest_sha256': rc.bytes_sha256(manifest_bytes), 'script': {SCRIPT: rc.file_sha256(rc.ROOT / SCRIPT)},
        'compared': compared, 'mismatches': mismatches[:200], 'mismatch_count': len(mismatches),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--input', type=Path, required=True, help='the adapted marathon input (FULL or CORE folder)')
    parser.add_argument('--data', type=Path, default=rc.OUTPUT, help='the published races folder')
    parser.add_argument('--out', type=Path, required=True, help='the receipt to write')
    args = parser.parse_args(argv)
    try:
        receipt = recount(args.input.expanduser(), args.data)
    except RacesError as error:
        print(f'races_recount: {error}', file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(rc.encode_readable(receipt))
    print(json.dumps({'written': str(args.out), 'status': receipt['status'], 'compared': receipt['compared'], 'mismatches': receipt['mismatch_count']}))
    return 0 if receipt['status'] == 'pass' else 1


if __name__ == '__main__':
    sys.exit(main())
