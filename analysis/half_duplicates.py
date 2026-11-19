"""The duplicate-edition audit of the half editions: pairs of editions that hold the same finishers with shifted times.

    python3 -I analysis/half_duplicates.py --core <CORE folder> --out <evidence .json>

The half policy's rule E2 removes the reviewed copies of an edition (the same names and the same times, by edition id).
A list loaded twice with shifted times (gun times beside net times, or one list under two years) shares no name and
finish second, so that review cannot see it. This audit applies the marathon race directory's "near" rule
(analysis/races_duplicates.py on the races branch, 2026-11-14; lead decision D40) to every pair of half editions with
rows, of either source database:

- **Name key**: accents and marks dropped, lower case, ł ø đ ð ß æ œ þ ı folded, anything that is not a letter or a
  digit separates words, the words sorted. A name is read only to be compared.
- **Finish**: whole seconds of a readable finish (the half policy's parser).
- **near**: for the names that occur once in each of two editions and are in both, the differences of their finish
  times are counted in one-minute bins; `aligned` is the most names in two adjacent bins. A pair is listed when at
  least 10 names and a fifth of the smaller edition's single names are aligned, or at least 50 names and half of the
  names in common are.

To keep the comparison of every pair within a small machine, a name key that occurs in more than 20 editions takes no
part (a copy of a list still shares nearly all of its names). The audit excludes nothing and names nobody: the evidence
file gives edition pairs and counts only (no runner name, bib, record id or person id). Each listed pair is reported for
a ruling; the frozen policy lists change only by a reviewed decision.
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
from half_common import HalfError, fail, file_sha256, secs_sql  # noqa: E402

BIN_SECONDS = 60
NEAR_NAMES = 10
SHARE = (1, 5)
NEAR_PART_NAMES = 50
NEAR_PART_OF_COMMON = (1, 2)
MAX_EDITIONS_PER_NAME = 20
MIN_COMMON = 10
RULE = {
    'name_key': 'accents and marks dropped, lower case, ł ø đ ð ß æ œ þ ı folded, anything that is not a letter or digit separates words, words sorted',
    'finish': 'whole seconds of a readable finish (H:MM:SS)',
    'near': ('for names that occur once in each edition and are in both, the differences of their finish times in one-minute bins; aligned = the most '
             'names in two adjacent bins; listed at 10 aligned names and a fifth of the smaller edition’s single names, or 50 aligned names and half of the names in common'),
    'limit': 'a name key that occurs in more than 20 editions takes no part',
}
# The folds DuckDB's strip_accents leaves: each letter to its plain form, before anything that is not a letter or digit separates words.
NAME_KEY_SQL = r"""array_to_string(list_sort(list_filter(string_split(
    regexp_replace(translate(replace(replace(replace(replace(lower(strip_accents(runner)), 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th'), 'łøđðı', 'loddi'),
                   '[^a-z0-9]+', ' ', 'g'), ' '), x -> x <> '')), ' ')"""


def audit(core: Path, log=print) -> dict:
    started = time.time()
    records = (Path(core) / 'race_records.parquet').as_posix().replace("'", "''")
    db = half_common.connect()
    db.execute(f"""CREATE TEMP TABLE rows AS
        SELECT dense_rank() OVER (ORDER BY source_db, city, year) AS ed, source_db, city, year::INTEGER AS year,
               {NAME_KEY_SQL} AS name_key, floor({secs_sql('split_21_1km')})::INTEGER AS finish_s
        FROM read_parquet('{records}') WHERE distance = 'half' AND runner IS NOT NULL""")
    db.execute("CREATE TEMP TABLE editions AS SELECT ed, source_db, city, year, count(*) AS rows FROM rows GROUP BY ALL")
    db.execute("""CREATE TEMP TABLE single AS SELECT ed, name_key, any_value(finish_s) AS finish_s FROM rows
        WHERE name_key <> '' AND finish_s IS NOT NULL GROUP BY 1, 2 HAVING count(*) = 1""")
    db.execute('DROP TABLE rows')
    db.execute(f"""CREATE TEMP TABLE usable AS SELECT s.* FROM single s
        SEMI JOIN (SELECT name_key FROM single GROUP BY 1 HAVING count(*) BETWEEN 2 AND {MAX_EDITIONS_PER_NAME}) k USING (name_key)""")
    singles = dict(db.execute('SELECT ed, count(*) FROM single GROUP BY 1').fetchall())
    log(f"{len(singles):,} editions with single names; {db.execute('SELECT count(*) FROM usable').fetchone()[0]:,} names compared ({time.time() - started:.0f} s)")
    db.execute(f"""CREATE TEMP TABLE bins AS
        SELECT a.ed AS ea, b.ed AS eb, floor((a.finish_s - b.finish_s) / {BIN_SECONDS}.0)::INTEGER AS bin, count(*) AS n,
               count(*) FILTER (WHERE a.finish_s = b.finish_s) AS same_second
        FROM usable a JOIN usable b ON a.name_key = b.name_key AND a.ed < b.ed GROUP BY 1, 2, 3""")
    pairs = db.execute(f"""WITH c AS (SELECT ea, eb, sum(n) AS common, sum(same_second) AS same_second FROM bins GROUP BY 1, 2 HAVING sum(n) >= {MIN_COMMON}),
          adj AS (SELECT x.ea, x.eb, x.bin, x.n + coalesce(y.n, 0) AS aligned FROM bins x LEFT JOIN bins y ON y.ea = x.ea AND y.eb = x.eb AND y.bin = x.bin + 1)
        SELECT c.ea, c.eb, c.common, c.same_second, max(adj.aligned) AS aligned, arg_max(adj.bin, adj.aligned) AS bin
        FROM c JOIN adj USING (ea, eb) GROUP BY 1, 2, 3, 4""").fetchall()
    facts = {int(e): (d, c, int(y), int(n)) for e, d, c, y, n in db.execute('SELECT ed, source_db, city, year, rows FROM editions').fetchall()}
    listed = []
    for ea, eb, common, same_second, aligned, bin_ in pairs:
        smaller = min(singles.get(ea, 0), singles.get(eb, 0))
        whole = aligned >= NEAR_NAMES and aligned * SHARE[1] >= smaller * SHARE[0]
        part = aligned >= NEAR_PART_NAMES and aligned * NEAR_PART_OF_COMMON[1] >= common * NEAR_PART_OF_COMMON[0]
        if not (whole or part):
            continue
        a, b = facts[int(ea)], facts[int(eb)]
        listed.append({'a': {'source_db': a[0], 'key': a[1], 'year': a[2], 'rows': a[3], 'single_names': int(singles.get(ea, 0))},
                       'b': {'source_db': b[0], 'key': b[1], 'year': b[2], 'rows': b[3], 'single_names': int(singles.get(eb, 0))},
                       'names_in_common': int(common), 'same_finish_second': int(same_second), 'aligned': int(aligned),
                       'aligned_share_of_smaller': round(aligned / smaller, 4) if smaller else None,
                       'difference_seconds_from': int(bin_) * BIN_SECONDS, 'difference_seconds_to': (int(bin_) + 2) * BIN_SECONDS,
                       'listed_by': 'whole list' if whole else 'part of a list'})
    listed.sort(key=lambda p: (-p['aligned'], p['a']['key'], p['a']['year']))
    log(f'{len(pairs):,} pairs share at least {MIN_COMMON} names; {len(listed)} listed ({time.time() - started:.0f} s)')
    return {'schema_version': 1, 'family': 'half-duplicate-editions', 'rule': RULE,
            'input': {'race_records.parquet': file_sha256(Path(core) / 'race_records.parquet')},
            'counts': {'editions': len(facts), 'editions_with_single_names': len(singles), 'pairs_with_10_names_in_common': len(pairs), 'listed': len(listed)},
            'pairs': listed}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--core', type=Path, required=True, help='the unpacked CORE folder of the pinned release')
    parser.add_argument('--out', type=Path, required=True, help='the evidence file to write (outside the repository)')
    args = parser.parse_args(argv)
    try:
        if half_common.inside(args.out, half_common.ROOT):
            fail(f'{args.out} is inside the repository; the evidence file is local')
        result = audit(args.core)
    except HalfError as error:
        print(f'half_duplicates: {error}', file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps(result['counts']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
