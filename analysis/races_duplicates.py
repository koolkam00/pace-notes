"""The duplicate-edition audit: pairs of written marathon editions that hold the same finishers (docs/RACES.md,
"Duplicate editions"; lead's addendum of 2026-11-14 to the race-directory brief).

    python3 -I analysis/races_duplicates.py --input <adapted FULL or CORE dir> --out <evidence .json> [--work DIR]
    python3 -I analysis/races_duplicates.py --input <adapted FULL or CORE dir> --check-names     (the name rule in SQL against the one in Python)

The site's duplicate guard (scripts/verify-duplicate-editions.cjs) compares nine-checkpoint records inside one city and
reads the marathon cohort, so it sees only the editions an analysis may read. This audit reads every written marathon
row of the adapted input and compares every pair of editions, of one race or not, by three rules (RULE below repeats
them for the evidence file):

- **exact** (the rule as the lead worded it): the same name with the same finish time. A pair is listed when the two
  editions share at least 50 keys, or at least a fifth of the smaller edition's keys.
- **near** (added because the exact rule cannot see a list loaded twice with shifted times, such as gun times beside
  net times): the same name with finish times that differ by nearly the same amount for the whole list. For the names
  the two editions have in common, the differences are counted in one-minute bins; `aligned` is the most names in two
  adjacent bins. A pair is listed when at least 10 names and a fifth of the smaller edition are aligned, or at least 50
  names and half of the names in common are.
- **time_only** (no names; for a list loaded twice with the names written differently): the finish times two editions
  of one race, or of one year, have in common, second by second, less what they would have in common by chance (the
  same count with one edition's times moved by one minute either way; a whole minute, so that two lists whose times
  are rounded to a minute or half a minute do not look alike). A pair is listed when the smaller edition has at least
  20 finish times and that excess is at least half of them, or at least 50 and a fifth of them.

It excludes nothing and names nobody: the evidence file gives edition pairs and counts only (no runner name, bib,
record id or person id; a name is read only to be compared). The lead rules on each listed pair in
analysis/race-notes.json, and scripts/verify-races.cjs fails unless that reviewed list holds exactly the pairs of this
file.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import races_common as rc  # noqa: E402
from races_common import RacesError, fail  # noqa: E402

SCRIPTS = ('races_duplicates.py', 'races_common.py')
MEMBERS = ('race_records.parquet', 'edition_meta.parquet', 'release_keys.parquet')

EXACT_ROWS = 50            # exact: at least this many shared keys ...
SHARE = (1, 5)             # ... or at least this fraction (one fifth) of the smaller edition, for every rule
BIN_SECONDS = 60           # near: the width of a bin of the finish-time difference
NEAR_NAMES = 10            # near: at least this many aligned names beside the fifth of the smaller edition
NEAR_PART_NAMES = 50       # near, a list inside a longer list: at least this many aligned names ...
NEAR_PART_OF_COMMON = (1, 2)   # ... and at least this fraction (one half) of the names in common
SHIFT_SECONDS = 60         # time_only: the shift that measures the chance level
TIME_ROWS = 20             # time_only: the smaller edition has at least this many finish times
TIME_PART_ROWS = 50        # time_only, part of a list: an excess of at least this many rows, beside the fifth of the smaller edition
TIME_WHOLE = (1, 2)        # time_only, a whole small list: an excess of at least this fraction (one half) of the smaller edition
WHOLE = (4, 5)             # a list is "whole" in a pair when at least four fifths of it is matched
LISTED = 10                # how many of the closest unlisted pairs the evidence file shows per measure

RULE = {
    'universe': 'every row of race_records.parquet of the adapted marathon input; an edition is a race label and a year',
    'name': ('the recorded name with accents dropped (canonical decomposition, every mark removed), lower case, ł ø đ ð ß æ œ þ ı written as '
             'l o d d ss ae oe th i (and the final sigma as σ); every run of characters that are not letters or digits separates words; the words in sorted order, joined by one '
             'space, so "Surname, Given" and "Given Surname" are one name. A row with no word has no name. Names are compared through the 128-bit MD5 '
             'number of this text'),
    'finish': ('the finish time in whole seconds: the clock string parsed as the pacing pipeline parses it (H:MM:SS or M:SS, decimals allowed), rounded '
               'down. A row whose finish does not parse has none'),
    'key': 'a row with a name and a finish has the key (name, finish); an edition’s keys are its distinct keys',
    'exact': (f'shared = the keys two editions both hold. Listed when shared >= {EXACT_ROWS}, or shared is at least one fifth of the smaller edition’s '
              'keys (5 x shared >= the smaller count)'),
    'near': (f'single names = the names that occur on exactly one keyed row of an edition. For the single names two editions have in common, d = the '
             f'finish in the first edition minus the finish in the second (first = the earlier in label, then year, order), bin = floor(d / {BIN_SECONDS}). '
             'aligned = the most names in two adjacent bins (a window of two minutes; the lowest such window on a tie). Listed when aligned >= '
             f'{NEAR_NAMES} and aligned is at least one fifth of the smaller edition’s single names, or when aligned >= {NEAR_PART_NAMES} and aligned is at '
             'least half of the names in common'),
    'time_only': (f'for two editions of one race, or of one year: matched(s) = the sum over finish seconds t of the smaller of the first edition’s rows at t '
                  f'and the second edition’s rows at t + s. excess = matched(0) minus the mean of matched(+{SHIFT_SECONDS}) and matched(-{SHIFT_SECONDS}). '
                  f'Listed when the smaller edition has at least {TIME_ROWS} rows with a finish and excess is at least half of that count, or at least '
                  f'{TIME_PART_ROWS} and one fifth of that count (two small unrelated lists share a few seconds by chance, so a fifth alone is not enough)'),
    'kind': ('matched = the largest of shared, aligned and the time-only excess among the rules that list the pair, as a share of each edition (of its '
             'keys, its single names or its rows with a finish, by that rule); a list is whole when the share is at least four fifths. '
             'One race, two years: same_list_twice when the smaller list is whole. Two races, one year: one_race_two_keys when both lists are whole, '
             'combined_list when only the smaller is. Two races, two years: same_list_under_another_race when the smaller list is whole. '
             'Anything else: partial_overlap'),
    'order': 'pairs are sorted by the first edition’s label and year, then the second’s (Unicode code point order)',
    'publishes': 'edition labels, years and counts only; no runner name, bib, record id or person id',
}
KIND_WORDS = {
    'same_list_twice': 'the same list loaded under two years of one race',
    'one_race_two_keys': 'one race of one year under two race keys',
    'combined_list': 'one list inside a longer list of the same year (a combined list)',
    'same_list_under_another_race': 'the same list under another race and another year',
    'partial_overlap': 'part of one list repeated in the other',
}

# SQL twins of name_key() below. DuckDB's strip_accents drops every mark (Unicode categories Mn, Mc, Me) of the decomposed text.
NAME_MACROS = (
    """CREATE MACRO fold_name(s) AS (
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(strip_accents(s)),
        'ł', 'l'), 'ø', 'o'), 'đ', 'd'), 'ð', 'd'), 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th'), 'ı', 'i'), 'ς', 'σ'))""",
    r"""CREATE MACRO name_key(s) AS (
      array_to_string(list_sort(list_filter(string_split(regexp_replace(fold_name(s), '[^\p{L}\p{N}]+', ' ', 'g'), ' '), x -> x <> '')), ' '))""",
)
_FOLD = {'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ı': 'i', 'ς': 'σ'}


def name_key(name) -> str:
    """The rule's name in plain Python (the reference the SQL macro is tested against)."""
    if not name:
        return ''
    text = ''.join(ch for ch in unicodedata.normalize('NFD', name) if not unicodedata.category(ch).startswith('M')).lower()
    text = ''.join(_FOLD.get(ch, ch) for ch in text)
    return ' '.join(sorted(''.join(ch if ch.isalnum() else ' ' for ch in text).split()))


def kind_of(same_race: bool, same_year: bool, share_a: float, share_b: float) -> str:
    whole = lambda share: share * WHOLE[1] >= WHOLE[0]  # noqa: E731
    smaller, both = whole(max(share_a, share_b)), whole(min(share_a, share_b))
    if same_race:
        return 'same_list_twice' if smaller else 'partial_overlap'
    if same_year:
        return 'one_race_two_keys' if both else 'combined_list' if smaller else 'partial_overlap'
    return 'same_list_under_another_race' if smaller else 'partial_overlap'


def _rows(db, query):
    result = db.execute(query)
    columns = [c[0] for c in result.description]
    return [dict(zip(columns, row)) for row in result.fetchall()]


def scan(db, records: Path, *, same_year_times: bool = True, log=print) -> dict:
    """Read `records` (a race_records.parquet) into `db` and apply the three rules. Returns the counts, the listed pairs
    and the closest unlisted ones; editions are named by label and year."""
    started = time.time()
    for macro in NAME_MACROS:
        db.execute(macro)
    # A name is held as the 128-bit MD5 number of its key (`nk`), so that no later step sorts or joins on text: two
    # different names share a number with a probability of about 10^-25 over the whole release.
    db.execute(f"""CREATE TABLE r AS SELECT city, year, CASE WHEN name = '' THEN NULL ELSE md5_number(name) END AS nk, fin
        FROM (SELECT city, year, coalesce(name_key(runner), '') AS name, CAST(floor(seconds(split_42_2km)) AS INTEGER) AS fin
              FROM read_parquet('{rc.quote(records)}'))""")
    db.execute("""CREATE TABLE ed AS SELECT city, year, (row_number() OVER (ORDER BY city, year) - 1)::INTEGER AS code, n, named, timed
        FROM (SELECT city, year, count(*) AS n, count(nk) AS named, count(fin) AS timed FROM r GROUP BY ALL)""")
    db.execute("""CREATE TABLE k AS SELECT e.code, r.nk, r.fin, count(*)::INTEGER AS c FROM r JOIN ed e USING (city, year)
        WHERE r.nk IS NOT NULL AND r.fin IS NOT NULL GROUP BY ALL""")
    db.execute("""CREATE TABLE dk AS SELECT code, count(*) AS keys, sum(c) AS keyed_rows, count(*) FILTER(WHERE c > 1) AS repeated_keys,
        coalesce(sum(c) FILTER(WHERE c > 1), 0) AS repeated_rows FROM k GROUP BY 1""")
    log(f'duplicates: rows read and keyed ({time.time() - started:.0f} s)')

    # exact
    db.execute('CREATE TABLE ex AS SELECT a.code AS a, b.code AS b, count(*) AS shared FROM k a JOIN k b ON a.nk = b.nk AND a.fin = b.fin AND a.code < b.code GROUP BY ALL')
    # near: names on exactly one keyed row of their edition
    db.execute('CREATE TABLE u AS SELECT code, nk, min(fin) AS fin FROM k GROUP BY code, nk HAVING count(*) = 1 AND sum(c) = 1')
    db.execute('CREATE TABLE du AS SELECT code, count(*) AS names FROM u GROUP BY 1')
    db.execute(f"""CREATE TABLE h AS SELECT a.code AS a, b.code AS b, CAST(floor((a.fin - b.fin) / {BIN_SECONDS}.0) AS INTEGER) AS bin, count(*) AS n
        FROM u a JOIN u b ON a.nk = b.nk AND a.code < b.code GROUP BY ALL""")
    db.execute("""CREATE TABLE nr AS
        WITH w AS (SELECT h1.a, h1.b, h1.bin, h1.n + coalesce(h2.n, 0) AS n2 FROM h h1 LEFT JOIN h h2 ON h2.a = h1.a AND h2.b = h1.b AND h2.bin = h1.bin + 1),
             m AS (SELECT a, b, max(n2) AS aligned FROM w GROUP BY ALL),
             t AS (SELECT a, b, sum(n) AS common FROM h GROUP BY ALL)
        SELECT m.a, m.b, t.common, m.aligned, min(w.bin) AS bin FROM m JOIN w ON w.a = m.a AND w.b = m.b AND w.n2 = m.aligned JOIN t ON t.a = m.a AND t.b = m.b
        GROUP BY ALL""")
    log(f'duplicates: exact and near rules ({time.time() - started:.0f} s)')

    # time_only: one race, or one year. The second edition's seconds are moved first, so that each comparison is a
    # plain equality join on (race or year, second).
    db.execute('CREATE TABLE fs AS SELECT e.code, e.city, e.year, r.fin, count(*)::INTEGER AS c FROM r JOIN ed e USING (city, year) WHERE r.fin IS NOT NULL GROUP BY ALL')
    db.execute(f"""CREATE TABLE fm AS SELECT f.code, f.city, f.year, f.fin - s.shift AS fin, f.c, s.shift
        FROM fs f CROSS JOIN (VALUES (0), ({SHIFT_SECONDS}), (-{SHIFT_SECONDS})) s(shift)""")
    db.execute("""CREATE TABLE tm AS SELECT x.code AS a, y.code AS b, y.shift, sum(least(x.c, y.c)) AS matched
        FROM fs x JOIN fm y ON y.city = x.city AND y.fin = x.fin WHERE x.code < y.code GROUP BY ALL""")
    if same_year_times:
        db.execute("""INSERT INTO tm SELECT x.code AS a, y.code AS b, y.shift, sum(least(x.c, y.c)) AS matched
            FROM fs x JOIN fm y ON y.year = x.year AND y.fin = x.fin WHERE x.code < y.code AND y.city <> x.city GROUP BY ALL""")
    db.execute(f"""CREATE TABLE tr AS SELECT a, b, coalesce(sum(matched) FILTER(WHERE shift = 0), 0) AS same,
        coalesce(sum(matched) FILTER(WHERE shift = {SHIFT_SECONDS}), 0) AS plus, coalesce(sum(matched) FILTER(WHERE shift = -{SHIFT_SECONDS}), 0) AS minus
        FROM tm GROUP BY ALL""")
    log(f'duplicates: time-only rule ({time.time() - started:.0f} s)')

    # One row per pair that any rule measured, with both editions' sizes.
    db.execute("""CREATE TABLE measured AS
        SELECT p.a, p.b, ea.city AS city_a, ea.year AS year_a, eb.city AS city_b, eb.year AS year_b,
          ea.n AS rows_a, eb.n AS rows_b, ea.timed AS timed_a, eb.timed AS timed_b,
          coalesce(ka.keys, 0) AS keys_a, coalesce(kb.keys, 0) AS keys_b, coalesce(ua.names, 0) AS names_a, coalesce(ub.names, 0) AS names_b,
          coalesce(ex.shared, 0) AS shared, coalesce(nr.common, 0) AS common, coalesce(nr.aligned, 0) AS aligned, nr.bin,
          tr.same IS NOT NULL AS timed_pair, coalesce(tr.same, 0) AS same, coalesce(tr.plus, 0) AS plus, coalesce(tr.minus, 0) AS minus
        FROM (SELECT a, b FROM ex UNION SELECT a, b FROM nr UNION SELECT a, b FROM tr) p
        JOIN ed ea ON ea.code = p.a JOIN ed eb ON eb.code = p.b
        LEFT JOIN dk ka ON ka.code = p.a LEFT JOIN dk kb ON kb.code = p.b LEFT JOIN du ua ON ua.code = p.a LEFT JOIN du ub ON ub.code = p.b
        LEFT JOIN ex ON ex.a = p.a AND ex.b = p.b LEFT JOIN nr ON nr.a = p.a AND nr.b = p.b LEFT JOIN tr ON tr.a = p.a AND tr.b = p.b""")
    exact = f'(shared >= {EXACT_ROWS} OR (shared > 0 AND {SHARE[1]} * shared >= {SHARE[0]} * least(keys_a, keys_b)))'
    near = (f'((aligned >= {NEAR_NAMES} AND {SHARE[1]} * aligned >= {SHARE[0]} * least(names_a, names_b)) '
            f'OR (aligned >= {NEAR_PART_NAMES} AND {NEAR_PART_OF_COMMON[1]} * aligned >= {NEAR_PART_OF_COMMON[0]} * common))')
    # With twice the excess, d = 2 * same - plus - minus: excess >= smaller / 2 <=> d >= smaller; excess >= 50 <=> d >= 100;
    # excess >= smaller / 5 <=> 5 * d >= 2 * smaller.
    twice = '(2 * same - plus - minus)'
    timed = (f'(timed_pair AND least(timed_a, timed_b) >= {TIME_ROWS} AND ({TIME_WHOLE[1]} * {twice} >= 2 * {TIME_WHOLE[0]} * least(timed_a, timed_b) '
             f'OR ({twice} >= 2 * {TIME_PART_ROWS} AND {SHARE[1]} * {twice} >= 2 * {SHARE[0]} * least(timed_a, timed_b))))')
    db.execute(f'CREATE TABLE listed AS SELECT *, {exact} AS by_exact, {near} AS by_near, {timed} AS by_time FROM measured')

    columns = 'a, b, city_a, year_a, city_b, year_b, rows_a, rows_b, timed_a, timed_b, keys_a, keys_b, names_a, names_b, shared, common, aligned, bin, timed_pair, same, plus, minus, by_exact, by_near, by_time'
    order = 'ORDER BY city_a, year_a, city_b, year_b'
    pairs = []
    for row in _rows(db, f'SELECT {columns} FROM listed WHERE by_exact OR by_near OR by_time {order}'):
        differences = db.execute(f"""SELECT count(*), count(*) FILTER(WHERE x.fin = y.fin), median(x.fin - y.fin),
            quantile_cont(x.fin - y.fin, 0.1), quantile_cont(x.fin - y.fin, 0.9)
            FROM u x JOIN u y ON y.nk = x.nk WHERE x.code = {row['a']} AND y.code = {row['b']}""").fetchone()
        pairs.append(_pair(row, differences))
    closest = {
        'exact_by_shared_keys': [_pair(r) for r in _rows(db, f'SELECT {columns} FROM listed WHERE NOT (by_exact OR by_near OR by_time) AND shared > 0 ORDER BY shared DESC, city_a, year_a, city_b, year_b LIMIT {LISTED}')],
        'exact_by_share_of_the_smaller': [_pair(r) for r in _rows(db, f"""SELECT {columns} FROM listed WHERE NOT (by_exact OR by_near OR by_time) AND shared >= 2
            ORDER BY shared * 1.0 / least(keys_a, keys_b) DESC, city_a, year_a, city_b, year_b LIMIT {LISTED}""")],
        'near_by_share_of_the_smaller': [_pair(r) for r in _rows(db, f"""SELECT {columns} FROM listed WHERE NOT (by_exact OR by_near OR by_time) AND aligned >= {NEAR_NAMES}
            ORDER BY aligned * 1.0 / least(names_a, names_b) DESC, city_a, year_a, city_b, year_b LIMIT {LISTED}""")],
        'near_by_share_of_the_names_in_common': [_pair(r) for r in _rows(db, f"""SELECT {columns} FROM listed WHERE NOT (by_exact OR by_near OR by_time) AND aligned >= {NEAR_PART_NAMES}
            ORDER BY aligned * 1.0 / common DESC, city_a, year_a, city_b, year_b LIMIT {LISTED}""")],
        'time_only_by_excess': [_pair(r) for r in _rows(db, f"""SELECT {columns} FROM listed WHERE NOT (by_exact OR by_near OR by_time) AND timed_pair AND least(timed_a, timed_b) >= {TIME_ROWS}
            ORDER BY (2 * same - plus - minus) * 1.0 / least(timed_a, timed_b) DESC, city_a, year_a, city_b, year_b LIMIT {LISTED}""")],
    }
    one = lambda query: db.execute(query).fetchone()  # noqa: E731
    rows, named, timed_rows, editions = one('SELECT sum(n), sum(named), sum(timed), count(*) FROM ed')
    keys, keyed_rows, repeated_keys, repeated_rows = one('SELECT sum(keys), sum(keyed_rows), sum(repeated_keys), sum(repeated_rows) FROM dk')
    in_two, = one('SELECT count(*) FROM (SELECT nk, fin FROM k GROUP BY ALL HAVING count(*) > 1)')
    counts = {
        'universe': {
            'editions': int(editions), 'rows': int(rows), 'rows_without_a_name': int(rows - named), 'rows_without_a_finish': int(rows - timed_rows),
            'rows_with_a_key': int(keyed_rows or 0), 'keys': int(keys or 0),
            'keys_repeated_inside_an_edition': int(repeated_keys or 0), 'rows_on_a_key_repeated_inside_an_edition': int(repeated_rows or 0),
            'single_names': int(one('SELECT coalesce(sum(names), 0) FROM du')[0]),
            'editions_with_fewer_than_10_single_names': int(one(f'SELECT count(*) FROM ed e LEFT JOIN du d USING (code) WHERE coalesce(d.names, 0) < {NEAR_NAMES}')[0]),
            'editions_with_fewer_than_20_finish_times': int(one(f'SELECT count(*) FROM ed WHERE timed < {TIME_ROWS}')[0]),
        },
        'exact': {'keys_in_two_or_more_editions': int(in_two), 'pairs_sharing_a_key': int(one('SELECT count(*) FROM ex')[0]),
                  'largest_shared': int(one('SELECT coalesce(max(shared), 0) FROM ex')[0]), 'listed': sum(1 for p in pairs if 'exact' in p['rules'])},
        'near': {'pairs_with_a_single_name_in_common': int(one('SELECT count(*) FROM nr')[0]),
                 'pairs_with_10_or_more_aligned_names': int(one(f'SELECT count(*) FROM nr WHERE aligned >= {NEAR_NAMES}')[0]),
                 'listed': sum(1 for p in pairs if 'near' in p['rules'])},
        'time_only': {'scope': 'pairs of one race, and pairs of one year' if same_year_times else 'pairs of one race',
                      'pairs_compared': int(one("""SELECT count(*) FROM ed x JOIN ed y ON x.code < y.code AND (x.city = y.city""" + (' OR x.year = y.year' if same_year_times else '') + ')')[0]),
                      'pairs_with_a_finish_second_in_common': int(one('SELECT count(*) FROM tr WHERE same > 0')[0]),
                      'listed': sum(1 for p in pairs if 'time_only' in p['rules'])},
    }
    log(f"duplicates: {len(pairs)} pairs listed ({time.time() - started:.0f} s)")
    return {'counts': counts, 'pairs': pairs, 'closest_unlisted': closest}


def _pair(row: dict, differences=None) -> dict:
    """A measured pair as the evidence file writes it."""
    rules = [name for name, key in (('exact', 'by_exact'), ('near', 'by_near'), ('time_only', 'by_time')) if row[key]]
    out = {
        'a': {'city': row['city_a'], 'year': int(row['year_a']), 'rows': int(row['rows_a']), 'keys': int(row['keys_a']), 'single_names': int(row['names_a']),
              'rows_with_a_finish': int(row['timed_a'])},
        'b': {'city': row['city_b'], 'year': int(row['year_b']), 'rows': int(row['rows_b']), 'keys': int(row['keys_b']), 'single_names': int(row['names_b']),
              'rows_with_a_finish': int(row['timed_b'])},
        'rules': rules,
        'exact': {'shared': int(row['shared'])},
        'near': {'names_in_common': int(row['common']), 'aligned': int(row['aligned']),
                 'window_seconds': None if row['bin'] is None else [int(row['bin']) * BIN_SECONDS, (int(row['bin']) + 2) * BIN_SECONDS]},
        'time_only': None if not row['timed_pair'] else {
            'matched': int(row['same']), 'matched_shifted_plus': int(row['plus']), 'matched_shifted_minus': int(row['minus']),
            'excess': round(float(row['same']) - (float(row['plus']) + float(row['minus'])) / 2, 1)},
    }
    if not rules:
        return out
    # The best measure among the rules that list the pair, as a share of each edition.
    measures = []
    if row['by_exact']:
        measures.append((int(row['shared']), int(row['keys_a']), int(row['keys_b'])))
    if row['by_near']:
        measures.append((int(row['aligned']), int(row['names_a']), int(row['names_b'])))
    if row['by_time']:
        measures.append((out['time_only']['excess'], int(row['timed_a']), int(row['timed_b'])))
    matched, base_a, base_b = max(measures, key=lambda m: m[0])
    share_a, share_b = matched / base_a, matched / base_b
    same_race, same_year = row['city_a'] == row['city_b'], row['year_a'] == row['year_b']
    out['matched'] = matched
    out['share_of_a'], out['share_of_b'] = round(share_a, 4), round(share_b, 4)
    out['relation'] = 'one race, two years' if same_race else 'two races, one year' if same_year else 'two races, two years'
    out['kind'] = kind_of(same_race, same_year, share_a, share_b)
    out['kind_in_words'] = KIND_WORDS[out['kind']]
    if differences is not None and differences[0]:
        out['near']['finish_differences'] = {
            'names': int(differences[0]), 'identical': int(differences[1]), 'median_seconds': round(float(differences[2]), 1),
            'tenth_percentile_seconds': round(float(differences[3]), 1), 'ninetieth_percentile_seconds': round(float(differences[4]), 1)}
    return out


def check_name_parity(db, records: Path, *, log=print) -> dict:
    """Every distinct recorded name through the SQL macro and through name_key(): how many differ (counts only)."""
    result = db.execute(f"SELECT runner, coalesce(name_key(runner), '') FROM (SELECT DISTINCT runner FROM read_parquet('{rc.quote(records)}') WHERE runner IS NOT NULL)")
    names = differ = 0
    while True:
        chunk = result.fetchmany(200_000)
        if not chunk:
            break
        names += len(chunk)
        differ += sum(1 for name, key in chunk if name_key(name) != key)
    log(f'duplicates: name parity over {names:,} distinct recorded names: {differ:,} differ')
    return {'distinct_recorded_names': names, 'keys_that_differ_between_sql_and_python': differ}


def edition_facts(source: Path, tag: str) -> dict:
    """(label, year) -> tier, split tier, the release's own key and the edition policy's use: what the lead needs beside
    a listed pair. Read from the adapted input and the frozen policy."""
    import duckdb
    db = duckdb.connect()
    facts = {}
    for city, year, tier, split in db.execute(
            f"SELECT city, year, verification_tier, split_tier FROM read_parquet('{rc.quote(source / 'edition_meta.parquet')}')").fetchall():
        facts[(city, int(year))] = {'tier': tier, 'split_tier': split}
    for city, year, key in db.execute(f"SELECT city, year, release_city FROM read_parquet('{rc.quote(source / 'release_keys.parquet')}')").fetchall():
        facts.setdefault((city, int(year)), {})['release_key'] = key
    db.close()
    policy = json.loads(policy_file(tag).read_text())
    for city, year in policy['counted']:
        facts.setdefault((city, int(year)), {})['use'] = 'counted'
    for row in policy['editions']:
        entry = facts.setdefault((row['city'], int(row['year'])), {})
        entry['use'] = 'own_record' if row['own_record'] else 'recorded_times_only'
        entry['policy_category'] = row['category']
    return facts


def policy_file(tag: str) -> Path:
    """The frozen edition policy of `tag`. Importing analysis/source_quality.py refuses the file when its digest is not
    the one that module pins."""
    import source_quality
    stamp = '_'.join(tag.split('-')[-2:])
    path = getattr(source_quality, f'POLICY_FILE_{stamp}', None)
    if path is None or tag not in source_quality.REVIEWED_POLICIES:
        fail(f'no frozen edition policy for {tag} in analysis/source_quality.py')
    return Path(path)


def audit(source: Path, *, work: Path | None = None, same_year_times: bool = True, log=print) -> dict:
    """The evidence document for the adapted input at `source`."""
    source = Path(source)
    if rc.inside(source, rc.ROOT):
        fail(f'{source} is inside the repository; record-level sources stay outside it')
    meta = rc.adapted_input(source)
    release = json.loads(rc.RELEASE_PATH.read_text())
    if meta['release_tag'] != release['tag']:
        fail(f"the adapted input is {meta['release_tag']}, the adopted release is {release['tag']}")
    for name in MEMBERS:
        rc.check_member(source, meta['files'], name)
    folder = Path(tempfile.mkdtemp(prefix='races-duplicates-', dir=work))
    try:
        db = rc.connect(str(folder / 'work.duckdb'))
        result = scan(db, source / 'race_records.parquet', same_year_times=same_year_times, log=log)
        db.close()
    finally:
        shutil.rmtree(folder, ignore_errors=True)
    facts = edition_facts(source, meta['release_tag'])
    for pair in result['pairs']:
        for side in ('a', 'b'):
            pair[side].update(facts.get((pair[side]['city'], pair[side]['year']), {}))
    policy_path = policy_file(meta['release_tag'])
    document = {
        'document': ('The duplicate-edition audit of this release’s marathon editions (analysis/races_duplicates.py; rule in docs/RACES.md): pairs of '
                     'editions that hold the same finishers, by three rules, with counts only. It excludes nothing: the lead rules on each pair in '
                     'analysis/race-notes.json, and scripts/verify-races.cjs requires that reviewed list to hold exactly `pairs`.'),
        'schema_version': 1,
        'release_tag': meta['release_tag'], 'input_manifest_sha256': meta['input_manifest_sha256'], 'input_as_of': meta['input_as_of'],
        'policy': {'file': f'analysis/{policy_path.name}', 'sha256': rc.file_sha256(policy_path)},
        'scripts': {f'analysis/{name}': rc.file_sha256(rc.ANALYSIS / name) for name in SCRIPTS},
        'rule': RULE,
        'thresholds': {'exact_rows': EXACT_ROWS, 'share_of_the_smaller': list(SHARE), 'bin_seconds': BIN_SECONDS, 'near_names': NEAR_NAMES,
                       'near_part_names': NEAR_PART_NAMES, 'near_part_of_the_names_in_common': list(NEAR_PART_OF_COMMON), 'shift_seconds': SHIFT_SECONDS,
                       'time_rows': TIME_ROWS, 'time_part_rows': TIME_PART_ROWS, 'time_whole_list': list(TIME_WHOLE), 'whole_list': list(WHOLE)},
        **result['counts'],
        'pairs': result['pairs'],
        'closest_unlisted': result['closest_unlisted'],
    }
    return document


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--input', type=Path, required=True, help='the adapted marathon input (FULL or CORE folder)')
    parser.add_argument('--out', type=Path, help='the evidence file to write')
    parser.add_argument('--work', type=Path, default=None, help='a folder for the temporary database (default: the system temporary folder)')
    parser.add_argument('--check-names', action='store_true', help='only compare the SQL name rule with the Python one over every distinct recorded name')
    parser.add_argument('--no-same-year-times', action='store_true', help='apply the time-only rule to pairs of one race only')
    args = parser.parse_args(argv)
    if args.check_names:
        db = rc.connect()
        for macro in NAME_MACROS:
            db.execute(macro)
        print(json.dumps(check_name_parity(db, args.input.expanduser() / 'race_records.parquet', log=lambda *_: None)))
        return 0
    if args.out is None:
        parser.error('--out is required')
    try:
        document = audit(args.input.expanduser(), work=args.work, same_year_times=not args.no_same_year_times)
    except RacesError as error:
        print(f'races_duplicates: {error}', file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(rc.encode_readable(document))
    print(json.dumps({'written': str(args.out), 'pairs': len(document['pairs']), 'exact': document['exact'], 'near': document['near'],
                      'time_only': document['time_only']}, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
