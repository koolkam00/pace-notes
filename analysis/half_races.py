"""The half race list (public/data/half/races/; docs/HALF_MARATHON.md, rule R6; the page /half/races).

A family of its own beside the half aggregates, with its own manifest and checks: every half-marathon edition of the
adopted release that has rows, of either source database, under its race. It mirrors the marathon race directory's file
names and shapes (docs/RACES.md, "Schema") where they apply: `directory.json` (every race with its editions as compact
rows), `summary.json` (the counts a page prints), `editions.csv` (the edition table for /methodology and the download)
and `manifest.json`. No race or edition has an address, so there is no `pages.json` and no `race/<slug>.json`.

What an edition row holds: its year; its tier and split tier as the release's EDITION-TIERS.csv states them; its
results, counted after the record rules R1 to R8 (a removed row is never counted); how the half policy uses it and, when
it does not, the policy's category; the class of its timing basis (lib/tiers.ts: the class `gun` reads "Gun times"); the
course-suspected-short mark; and a median finish only for a verified edition of at least 100 usable finishes that
carries no mark. An edition the policy sets aside as a copy of another (category cross_edition_duplicate) is listed with
no number and is not shown. An `excluded` edition has no rows and never appears. The eight half editions of the
marathon database are outside the half policy (its scope is the half database): they are listed, supply no figure, and
their results are the rows with a readable finish that the frozen half row rule keeps.

The races are the frozen half race registry's (analysis/half-race-registry.json, built and checked by
analysis/half_race_registry.py): a release key joins a race only by a reviewed join; a key with no entry is its own
race, named from the key alone; its label is what a visitor reads. Half and marathon are separate name spaces.
Race-level flags and search aliases live in the half registry, never in the marathon's.

Never in these files: a runner's name, a bib, a winner, a source URL, the producer's status or reason texts, an official
count. Tier, split-tier and timing codes are the tier module's lists (lib/tiers.ts), read from its text here and checked
against the module itself by scripts/verify-half.cjs; names are data and pass no copy word rule.
"""
from __future__ import annotations

import csv
import html
import io
import json
import re
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import half_race_registry  # noqa: E402
import race_registry  # noqa: E402  (the marathon registry's folding function; no marathon data is read)
from half_common import ANALYSIS, ROOT, bytes_sha256, encode, fail, file_sha256, sec, secs_sql  # noqa: E402

TIER_MODULE = ROOT / 'lib' / 'tiers.ts'
MEDIAN_MIN_RESULTS = 100
FULL_LIST_MIN_VERIFIED = 3
BADGE_TIERS = ('stamped', 'stamped_weaker_source')
USES = ('verified', 'usable', 'none')
REVIEWS = ('none', 'copy')
MARKS = ('course_suspected_short',)
MARATHON_DATABASE = 'marathon_database'
COPY_CATEGORY = 'cross_edition_duplicate'
EDITION_COLUMNS = ['year', 'tier', 'split_tier', 'results', 'use', 'category', 'timing', 'mark', 'median_s', 'review']
RULES = {
    'listed': 'every half-marathon edition of the release with rows, of either source database; an excluded edition has no rows and never appears',
    'race': ('the races, their labels, names and places are the frozen half race registry’s (analysis/half-race-registry.json, rebuilt from the tier table '
             'and compared before every build): a release key joins a race only by a reviewed join; a key with no entry is its own race, named from the key alone; '
             'half and marathon are separate name spaces'),
    'results': 'an edition’s results are its rows after the record rules R1 to R8 of the half policy; for the half editions of the marathon database, the rows with a readable finish that the frozen half row rule keeps',
    'use': 'verified: a verified usable edition (it supplies the verified figures); usable: an unverified usable edition (it supplies only figures that carry the scope chip); none: it supplies no figure',
    'median': 'the median finish of a verified usable edition of at least 100 results that carries no mark; no other edition has a time',
    'copy': 'an edition the half policy sets aside as a copy of another edition is listed with no number and is not shown',
    'order': 'races by name (accents and case aside), then place, then label; a race’s editions by year, then source database',
    'never': 'no runner name, bib, winner, source URL, producer status or reason text, or official count',
    'codes': 'tier, split-tier and timing codes are the lists of lib/tiers.ts when the files were built; scripts/verify-half.cjs compares every code, class and word with the module itself',
}


def _strings(text: str) -> list[str]:
    """The string literals of a TypeScript array or object body, single or double quoted."""
    out = []
    for m in re.finditer(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", text):
        raw = m.group(1) if m.group(1) is not None else m.group(2)
        out.append(re.sub(r'\\(.)', r'\1', raw))
    return out


def module_lists(path: Path = TIER_MODULE) -> dict:
    """The tier module's codes and words, read from its text (it imports nothing and holds only literals): the tiers,
    the split tiers, the timing classes with the release texts of each, and the words. scripts/verify-half.cjs checks
    every code and word written here against the module itself."""
    text = path.read_text()

    def array(name):
        m = re.search(rf'export const {name}[^=]*= \[(.*?)\]', text, re.S)
        if not m:
            fail(f'lib/tiers.ts: no {name}')
        return _strings(m.group(1))

    def constant(name):
        m = re.search(rf"export const {name}(?:: [A-Za-z]+)? = '([^']*)'", text)
        if not m:
            fail(f'lib/tiers.ts: no {name}')
        return m.group(1)

    body = re.search(r'export const TIMING_BASES[^=]*= \{(.*?)\n\};', text, re.S)
    words = re.search(r'export const TIER_WORDS[^=]*= \{(.*?)\n\};', text, re.S)
    if not body or not words:
        fail('lib/tiers.ts: no TIMING_BASES or TIER_WORDS')
    classes = array('TIMING_CLASSES')
    bases = {}
    for cls in classes:
        m = re.search(rf'\b{cls}: \[(.*?)\]', body.group(1), re.S)
        if not m:
            fail(f'lib/tiers.ts: TIMING_BASES has no class {cls}')
        bases[cls] = _strings(m.group(1))
    tier_words = dict(re.findall(r"\b([a-z_]+): '([^']*)'", words.group(1)))
    lists = {'tier': array('EDITION_TIERS'), 'never_shown': array('NEVER_SHOWN_TIERS'), 'split_tier': array('SPLIT_TIERS'), 'timing': classes,
             'timing_bases': bases, 'tier_words': tier_words, 'finish_times_only': constant('FINISH_TIMES_ONLY'), 'gun_times': constant('GUN_TIMES'),
             'gun_class': constant('GUN_TIMING')}
    shown = [t for t in lists['tier'] if t not in lists['never_shown']]
    if sorted(tier_words) != sorted(shown) or lists['gun_class'] not in classes:
        fail('lib/tiers.ts: the tier words do not cover the shown tiers, or the gun class is not a timing class')
    return lists


def timing_class(text, lists: dict) -> str:
    if text is None:
        return 'not_stated'
    for cls in lists['timing']:
        if text in lists['timing_bases'][cls]:
            return cls
    fail(f'lib/tiers.ts classes no timing basis {text!r}: class the release’s text there before the race list shows the edition')


def edition_rows(db, policy, source, lists: dict, twins: dict) -> list[dict]:
    """One row per half edition with rows: the half database's from the applied policy, the marathon database's from
    the release files."""
    m = policy.editions
    counts = {(c, int(y)): int(n) for c, y, n in db.execute(
        'SELECT city, year, count(*) FILTER (WHERE rule IS NULL AND NOT r7_block) FROM hr GROUP BY 1, 2').fetchall()}
    medians = {int(e): (float(s), int(n)) for e, s, n in db.execute(
        "SELECT edition_id, median(finish_s), count(*) FROM hfin WHERE NOT r7_block AND status_group = 'verified' GROUP BY 1").fetchall()}
    by_id = {int(r.edition_id): (r.city, int(r.year)) for r in m[m.edition_id.notna()].itertuples(index=False)}
    rows = []
    for r in m[m.n_core > 0].itertuples(index=False):
        tier = r.tier
        if tier not in lists['tier'] or tier in lists['never_shown']:
            fail(f'{r.city} {r.year}: an edition with rows is tiered {tier!r}')
        usable = bool(r.use_finish)
        use = 'verified' if usable and r.status_group == 'verified' else 'usable' if usable else 'none'
        category = None if usable else (r.category if isinstance(r.category, str) else 'no_usable_result')
        mark = 'course_suspected_short' if bool(r.course_suspect) else None
        timing = timing_class(r.timing_basis if isinstance(r.timing_basis, str) else None, lists)
        results = counts.get((r.city, int(r.year)), 0)
        copy = category == COPY_CATEGORY
        median = None
        if use == 'verified' and mark is None and timing != lists['gun_class'] and results >= MEDIAN_MIN_RESULTS:
            value, n = medians[int(r.edition_id)]
            if n != results:
                fail(f'{r.city} {r.year}: the verified finishes ({n}) are not the edition’s results ({results})')
            median = sec(value)
        twin = twins.get(str(int(r.edition_id))) if copy and r.edition_id == r.edition_id else None
        rows.append({'source_db': 'half', 'key': r.city, 'year': int(r.year), 'tier': tier, 'split_tier': r.split_tier, 'results': None if copy else results,
                     'use': use, 'category': category, 'timing': timing, 'timing_basis': r.timing_basis if isinstance(r.timing_basis, str) else None,
                     'mark': mark, 'median_s': median, 'review': 'copy' if copy else 'none', 'copy_of': by_id.get(int(twin)) if twin is not None else None,
                     'race_date': r.race_day.isoformat() if r.race_day == r.race_day and r.race_day is not None else None})
    # The half editions of the marathon database: outside the half policy; their tier from the tier table.
    rr, em, tiers = (str(source.member(n)).replace("'", "''") for n in ('race_records.parquet', 'edition_meta.parquet', 'EDITION-TIERS.csv'))
    ident = str(source.identity).replace("'", "''")
    full = db.execute(f"""WITH n AS (
            SELECT r.city, r.year::INTEGER AS year, count(*) AS rows,
                   count(*) FILTER (WHERE {secs_sql('r.split_21_1km')} IS NOT NULL AND i.record_id IS NULL) AS results
            FROM read_parquet('{rr}') r
            LEFT JOIN (SELECT record_id FROM read_parquet('{ident}') WHERE distance = 'half' AND source_db = 'full' AND status = 'left_out') i ON i.record_id = r.id
            WHERE r.distance = 'half' AND r.source_db = 'full' GROUP BY 1, 2)
        SELECT n.city, n.year, n.results, t.verification_tier, nullif(t.split_tier, ''), e.timing_basis, e.race_date
        FROM n LEFT JOIN (SELECT * FROM read_csv('{tiers}', header = true, all_varchar = true) WHERE distance = 'half' AND source_db = 'full') t
               ON t.city = n.city AND try_cast(t.year AS INTEGER) = n.year
             LEFT JOIN (SELECT city, year, timing_basis, race_date FROM read_parquet('{em}') WHERE distance = 'half' AND source_db = 'full') e
               ON e.city = n.city AND e.year = n.year
        ORDER BY 1, 2""").fetchall()
    for city, year, results, tier, split_tier, basis, race_date in full:
        if tier not in lists['tier'] or tier in lists['never_shown']:
            fail(f'{city} {year} (marathon database): an edition with rows is tiered {tier!r}')
        rows.append({'source_db': 'full', 'key': city, 'year': int(year), 'tier': tier, 'split_tier': split_tier, 'results': int(results), 'use': 'none',
                     'category': MARATHON_DATABASE, 'timing': timing_class(basis, lists), 'timing_basis': basis, 'mark': None, 'median_s': None,
                     'review': 'none', 'copy_of': None, 'race_date': str(race_date)[:10] if race_date else None})
    for row in rows:
        if row['split_tier'] not in lists['split_tier']:
            fail(f"{row['key']} {row['year']}: split tier {row['split_tier']!r} is not one of the module's")
    return rows


def build(db, policy, source, pin: dict, policy_sha: str, module_sha: str) -> dict[str, bytes]:
    """The family's files as bytes, by name."""
    lists = module_lists()
    # The frozen registry, rebuilt from the tier table first: any difference stops the build.
    try:
        registry = half_race_registry.check(source.member('EDITION-TIERS.csv'), pin['half']['tag'])
    except half_race_registry.RegistryError as error:
        fail(str(error))
    reviewed_policy = json.loads((ROOT / pin['policy']).read_text())
    twins = reviewed_policy['edition_rules']['E2'].get('twins', {})
    rows = edition_rows(db, policy, source, lists, twins)
    keys = sorted({(r['source_db'], r['key']) for r in rows})

    # Races: the frozen registry's, each with the keys it holds. Every edition with rows belongs to exactly one.
    race_of, races = {}, []
    for entry in registry['races']:
        race = {'label': entry['label'], 'name': entry['name'], 'place': entry['place'], 'keys': [[k['source_db'], k['key']] for k in entry['keys']],
                'flags': list(entry['flags']), 'aliases': list(entry.get('aliases', []))}
        races.append(race)
        for k in race['keys']:
            race_of[tuple(k)] = race
    if set(race_of) != set(keys):
        fail(f'the half race registry and the editions with rows name different keys ({len(set(race_of) ^ set(keys))} differ)')
    for race in races:
        race['editions'] = sorted((r for r in rows if race_of[(r['source_db'], r['key'])] is race), key=lambda r: (r['year'], r['source_db']))
        live = [e for e in race['editions'] if e['review'] != 'copy']
        years = [e['year'] for e in live]
        if len(set((e['year'], e['source_db']) for e in live)) != len(live):
            fail(f"{race['label']}: two live editions of one year and database")
        race['live'] = live
        race['years'] = [min(years), max(years)] if years else None
    fold = lambda s: race_registry.fold(s or '').lower()
    races.sort(key=lambda r: (fold(r['name']), fold(r['place']), r['label']))

    categories = sorted({r['category'] for r in rows if r['category'] is not None})
    codes = {'tier': lists['tier'], 'split_tier': lists['split_tier'], 'use': list(USES), 'category': categories, 'timing': lists['timing'],
             'mark': list(MARKS), 'review': list(REVIEWS), 'flags': sorted(half_race_registry.FLAGS)}
    index = {name: {v: i for i, v in enumerate(values)} for name, values in codes.items()}

    def compact(e):
        return [e['year'], index['tier'][e['tier']], index['split_tier'][e['split_tier']], e['results'], index['use'][e['use']],
                index['category'][e['category']] if e['category'] is not None else None, index['timing'][e['timing']],
                index['mark'][e['mark']] if e['mark'] is not None else None, e['median_s'], index['review'][e['review']]]

    def race_object(race):
        tiers = {}
        for e in race['live']:
            tiers[e['tier']] = tiers.get(e['tier'], 0) + 1
        out = {'label': race['label'], 'name': race['name'], 'place': race['place'], 'years': race['years'],
               'results': sum(e['results'] for e in race['live']), 'tiers': tiers, 'editions': [compact(e) for e in race['editions']]}
        if race['flags']:
            out['flags'] = race['flags']
        if race['aliases']:
            out['aliases'] = race['aliases']
        return out

    listed = [r for r in races if r['live']]
    left_out = [r for r in races if not r['live']]
    verified_editions = lambda r: sum(1 for e in r['live'] if e['tier'] in BADGE_TIERS)
    label_of = {tuple(k): r['label'] for r in races for k in r['keys']}
    directory = {
        'schema_version': 1, 'family': 'races', 'distance': 'half', 'codes': codes, 'edition_columns': EDITION_COLUMNS,
        'full_list': {'min_verified_editions': FULL_LIST_MIN_VERIFIED, 'races': [r['label'] for r in listed if verified_editions(r) >= FULL_LIST_MIN_VERIFIED]},
        'races': [race_object(r) for r in listed],
        'left_out': [{'label': r['label'], 'name': r['name'], 'place': r['place'], 'editions': [compact(e) for e in r['editions']]} for r in left_out],
        'set_aside_editions': [{'label': label_of[(e['source_db'], e['key'])], 'year': e['year'],
                                'kept': {'label': label_of.get(('half', e['copy_of'][0])), 'year': e['copy_of'][1]} if e['copy_of'] else None,
                                'reason': 'one_list_two_editions'}
                               for r in races for e in r['editions'] if e['review'] == 'copy'],
    }

    live = [e for r in listed for e in r['live']]

    def tally(group):
        out = {}
        for e in live:
            g = out.setdefault(group(e), {'editions': 0, 'results': 0})
            g['editions'] += 1
            g['results'] += e['results']
        return dict(sorted(out.items()))

    summary = {
        'schema_version': 1, 'family': 'races', 'distance': 'half',
        'races': {'total': len(listed), 'full_list': len(directory['full_list']['races']), 'with_a_verified_edition': sum(1 for r in listed if verified_editions(r) >= 1),
                  'flagged': sum(1 for r in listed if r['flags']), 'left_out': len(left_out)},
        'editions': {'total': {'editions': len(live), 'results': sum(e['results'] for e in live)},
                     'by_tier': tally(lambda e: e['tier']), 'by_split_tier': tally(lambda e: e['split_tier']), 'by_timing': tally(lambda e: e['timing']),
                     'by_use': tally(lambda e: e['use']), 'not_used_by_category': tally(lambda e: e['category'] or 'used'),
                     'by_source_db': tally(lambda e: e['source_db']),
                     'badge_verified': {'editions': sum(1 for e in live if e['tier'] in BADGE_TIERS), 'results': sum(e['results'] for e in live if e['tier'] in BADGE_TIERS)},
                     'with_a_median': sum(1 for e in live if e['median_s'] is not None), 'marked': tally(lambda e: e['mark'] or 'none'),
                     'set_aside_as_copies': len(directory['set_aside_editions'])},
    }
    summary['editions']['not_used_by_category'].pop('used', None)
    summary['editions']['marked'].pop('none', None)

    table = io.StringIO()
    writer = csv.writer(table, lineterminator='\n')
    writer.writerow(['race', 'race_name', 'place', 'year', 'tier', 'tier_in_words', 'split_tier', 'split_tier_in_words', 'results', 'use', 'not_used_category',
                     'timing', 'timing_in_words', 'timing_basis', 'mark', 'median_finish_s', 'race_date', 'review', 'copy_of_race', 'copy_of_year', 'source_db', 'release_key'])
    for race in sorted(races, key=lambda r: r['label']):
        for e in race['editions']:
            writer.writerow([race['label'], race['name'], race['place'] or '', e['year'], e['tier'], lists['tier_words'][e['tier']], e['split_tier'],
                             lists['finish_times_only'] if e['split_tier'] == 'finish_time_only' else '', '' if e['results'] is None else e['results'], e['use'],
                             e['category'] or '', e['timing'], lists['gun_times'] if e['timing'] == lists['gun_class'] else '', e['timing_basis'] or '',
                             e['mark'] or '', '' if e['median_s'] is None else e['median_s'], e['race_date'] or '', '' if e['review'] == 'none' else e['review'],
                             label_of.get(('half', e['copy_of'][0]), '') if e['copy_of'] else '', e['copy_of'][1] if e['copy_of'] else '', e['source_db'], e['key']])

    files = {'directory.json': encode(directory), 'summary.json': encode(summary), 'editions.csv': table.getvalue().encode()}
    check(directory, summary, rows, policy)
    manifest = {
        'schema_version': 1, 'family': 'races', 'distance': 'half', 'release_tag': pin['half']['tag'],
        'policy': {'file': pin['policy'], 'sha256': policy_sha, 'module_sha256': module_sha},
        'registry': {'file': 'analysis/half-race-registry.json', 'sha256': file_sha256(half_race_registry.FROZEN), 'races': len(registry['races']),
                     'reviewed_joins': len(registry['reviewed']['joins']), 'races_sha256': registry['races_sha256']},
        'tier_table_sha256': pin['half']['core']['members']['EDITION-TIERS.csv'],
        'scripts': {f'analysis/{name}': file_sha256(ANALYSIS / name) for name in ('half_races.py', 'half_race_registry.py', 'race_registry.py')},
        'rules': RULES, 'flags': half_race_registry.FLAGS, 'floors': {'median_min_results': MEDIAN_MIN_RESULTS, 'full_list_min_verified_editions': FULL_LIST_MIN_VERIFIED},
        'counts': {'races': len(listed), 'editions': len(live), 'results': sum(e['results'] for e in live), 'keys': len(keys)},
        'files': {name: {'bytes': len(data), 'sha256': bytes_sha256(data)} for name, data in sorted(files.items())},
    }
    files['manifest.json'] = encode(manifest)
    return files


def check(directory: dict, summary: dict, rows: list[dict], policy) -> None:
    """The family's own invariants, on what is about to be written."""
    codes = directory['codes']
    listed = [e for race in directory['races'] + directory['left_out'] for e in race['editions']]
    if len(listed) != len(rows):
        fail('an edition with rows is not listed exactly once')
    for race in directory['races']:
        for e in race['editions']:
            year, tier, split, results, use, category, timing, mark, median, review = e
            copy = codes['review'][review] == 'copy'
            if copy != (results is None):
                fail(f"{race['label']} {year}: a copy carries no number, and every other edition carries its results")
            if median is not None and not (codes['use'][use] == 'verified' and codes['tier'][tier] in BADGE_TIERS and mark is None
                                           and codes['timing'][timing] != 'gun' and results >= MEDIAN_MIN_RESULTS):
                fail(f"{race['label']} {year}: a time on an edition that may not show one")
            if (codes['use'][use] == 'none') != (category is not None):
                fail(f"{race['label']} {year}: an edition is used, or carries the category of why it is not")
    used = [e for race in directory['races'] for e in race['editions'] if codes['use'][e[4]] != 'none']
    counts = policy.counts
    if (len(used), sum(e[3] for e in used)) != (counts['use_finish']['editions'], counts['use_finish']['finishes']):
        fail('the usable editions of the race list are not the policy’s usable editions and finishes')
    verified = [e for e in used if codes['use'][e[4]] == 'verified']
    if (len(verified), sum(e[3] for e in verified)) != (counts['verified']['editions'], counts['verified']['finishes']):
        fail('the verified editions of the race list are not the policy’s verified editions and finishes')
    names = [(race_registry.fold(r['name']).lower(), race_registry.fold(r['place'] or '').lower(), r['label']) for r in directory['races']]
    if names != sorted(names):
        fail('the races are not in name order')
    if summary['editions']['total']['editions'] != sum(len([e for e in r['editions'] if codes['review'][e[9]] != 'copy']) for r in directory['races']):
        fail('the summary does not count the listed editions')
