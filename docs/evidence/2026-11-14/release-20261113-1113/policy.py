"""The counted-editions policy of pace-notes-marathon-half-20261113-1113, built from a stated rule and frozen.

    python3 -I policy.py <adapted dir> <edition-screen.csv>                    recount; fail unless it equals the frozen file
    python3 -I policy.py <adapted dir> <edition-screen.csv> --review OUT.json  the same, and write every edition's facts
    python3 -I policy.py <adapted dir> <edition-screen.csv> --write [--exceptions FILE]   freeze (a reviewed refresh only)

Inputs: the adapter's EDITIONS.json (tier, split tier, official count and the written rows of every written marathon
edition, under the race labels the adapter writes as `city`), the three screens of the 1652 review run on the adapted
records (docs/evidence/2026-10-21/release-0829/screen.py), the frozen race registry (analysis/race-registry.json, read
only to check that every counted or own-record edition belongs to a race with a plain or reviewed label) and the
reviewed exception list kept in the frozen file itself (analysis/edition-policy-20261113-1113.json,
`reviewed_exceptions`). It imports no builder. The rule, in words, is RULE below; the frozen file repeats it.

Two levels of use (lead ruling R4, 2026-11-14). A counted edition supplies every pooled statistic and every peer
comparison. An edition that is not counted only because it is unverified, or partial and outside the coverage band,
and whose split grid passes the three screens, keeps an own-record view (`own_record` true in the frozen list): a
runner's own sections can be shown with the edition's tier, and nothing of it enters a pooled figure or a peer
comparison. Every other edition that is not counted gives recorded times only.
"""
import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
TAG = 'pace-notes-marathon-half-20261113-1113'
FROZEN = ROOT / 'analysis' / 'edition-policy-20261113-1113.json'
REGISTRY = ROOT / 'analysis' / 'race-registry.json'
ROW_EXCEPTIONS = ROOT / 'analysis' / 'reviewed-row-exceptions.json'
OWN_RECORD_CATEGORIES = ('unverified', 'partial_coverage')
COVERAGE = (0.95, 1.05)          # recorded finishes / official finishers, both ends included
USABLE_MIN_PCT = 5.0             # screen (a): under this share of finishers with a usable grid fails
SELECTIVE = (75.0, 50.0)         # screen (b): at least the first in the quickest quarter, under the second in the slowest
MIXED_MIN_PCT = 25.0             # screen (c): at least this share of complete grids on mixed timing bases fails
VERIFIED_TIERS = ('stamped', 'stamped_weaker_source')
COUNT_TIERS = VERIFIED_TIERS + ('partial',)
RULE = {
    'universe': ('every marathon edition with at least one row in the adapted race_records.parquet, named as the pipeline names it: `city` is the label '
                 'of the edition’s race in the frozen race registry (a plain key such as Berlin is its own label), with the year'),
    'counted': 'an edition supplies pooled pacing statistics (is counted) only when conditions 1 to 5 all hold',
    '1_split_tier': 'its split tier is `splits` (the producer sets `finish_time_only` when under half the rows have any intermediate split)',
    '2_tier': 'its verification tier is `stamped`, `stamped_weaker_source` or `partial` (never `held_for_review` or `unverified`; an `excluded` edition has no rows)',
    '3_coverage': ('it is stamped (`stamped` or `stamped_weaker_source`: the producer checked the release’s finishes against an independent official count, within 0.5%), '
                   'or it is `partial` and the release’s rows with a finish time divided by its official finisher count lie between 0.95 and 1.05, both ends included'),
    '4_screens': ('it passes the three timing screens of the October 16, 2026 review, computed on the adapted records by '
                  'docs/evidence/2026-10-21/release-0829/screen.py and read as that file prints them (percentages to one or two decimals): '
                  '(a) at least 5% of the rows with a finish time pass the timing checks (an edition with none fails); '
                  '(b) not both: at least 75% of the quarter with the shortest finish times and under 50% of the quarter with the longest pass them; '
                  '(c) under 25% of the complete grids put the finish at or before 40 km or run the last 2.195 km faster than 2:00 per km'),
    '5_exceptions': 'it is not on the reviewed exception list (`reviewed_exceptions`): the decisions carried from the master-20261103b policy, and Honolulu 2021 to 2025',
    'category_order': ('an edition that is not counted takes one category and reason, the first that applies: a reviewed exception; '
                       'finish_time_only (condition 1); held_for_review, then unverified (condition 2); partial_coverage (condition 3); '
                       'invalid_split_grid (condition 4, screen a, then b, then c)'),
    'own_record': ('an edition that is not counted keeps an own-record view (`own_record` true) only when its category is unverified or partial_coverage '
                   'and it fails none of the three screens of condition 4; it then supplies no pooled statistic and no peer comparison, but a record’s own '
                   'sections may be shown with the edition’s tier (lead ruling R4, 2026-11-14). Every other edition that is not counted gives recorded '
                   'times only'),
    'labels': ('every counted edition and every edition with an own-record view belongs to a race whose label is a plain key or a reviewed label of the '
               'race registry (lead decision D19, 2026-11-14); the build fails otherwise'),
    'row_exceptions': ('every edition with a reviewed row exception (analysis/reviewed-row-exceptions.json; lead ruling D33, 2026-11-14) is counted: the adapter '
                       'writes a listed row only when the frozen policy counts its edition, and this build fails when the policy it rebuilds would not'),
    'order': 'the frozen list is sorted by city label, then year (Unicode code point order)',
}
REASONS = {
    'finish_time_only': 'Finish times only: fewer than half of this edition’s records have any checkpoint time, so it supplies no pacing statistic.',
    'held_for_review': 'The producer holds this edition for review, so it carries no verified badge and supplies no pooled statistic.',
    'unverified': 'No independent finisher count has been checked for this edition, so it is shown as unverified and supplies no pooled statistic.',
}
HONOLULU = ('The source list for this edition mixes in 10 km-type finishes and unfinished runs whose last checkpoint was stored as the '
            'finish. The rows that can be identified are removed, and the producer says others may remain, so the edition supplies no '
            'pooled statistic.')
KM = [5, 10, 15, 20, 25, 30, 35, 40]


def number(value):
    return None if value in ('', None) else float(value)


def read_inputs(source, screen_path):
    document = json.loads((source / 'EDITIONS.json').read_text())
    assert document['tag'] == TAG, 'EDITIONS.json is for another release'
    editions = {(e['city'], e['year']): e for e in document['editions'] if e['n_records']}
    with open(screen_path, newline='') as stream:
        screens = {(r['city'], int(r['year'])): r for r in csv.DictReader(stream)}
    assert set(screens) == set(editions), 'the screens and EDITIONS.json name different editions'
    return editions, screens


def facts(edition, screen):
    official = edition['official_finishers']
    out = {
        'tier': edition['verification_tier'], 'split_tier': edition['split_tier'], 'rows': edition['n_records'], 'finishes': edition['n_finishes'],
        'rows_in_release': edition['rows_in_release'], 'finishes_in_release': edition['finishes_in_release'],
        'official_finishers': None if official is None else int(official),
        'coverage': None if not official else edition['finishes_in_release'] / official,
        'timing_eligible': int(screen['timing_eligible']), 'screen_finishers': int(screen['finishers']),
        'usable_pct': number(screen['timing_eligible_pct_of_finishers']), 'quickest_quarter_pct': number(screen['fastest_quartile_eligible_pct']),
        'slowest_quarter_pct': number(screen['slowest_quartile_eligible_pct']), 'complete_grids': int(screen['complete_grids']),
        'mixed_basis_pct': number(screen['mixed_basis_pct_of_complete']),
        'missing_for_all': [k for k in KM if number(screen[f'missing_{k}km_pct_of_finishers']) == 100.0],
    }
    usable, quick, slow, mixed = out['usable_pct'], out['quickest_quarter_pct'], out['slowest_quarter_pct'], out['mixed_basis_pct']
    out['screen_a'] = usable is None or usable < USABLE_MIN_PCT
    out['screen_b'] = quick is not None and slow is not None and quick >= SELECTIVE[0] and slow < SELECTIVE[1]
    out['screen_c'] = mixed is not None and mixed >= MIXED_MIN_PCT
    out['tier_and_coverage'] = out['split_tier'] == 'splits' and (out['tier'] in VERIFIED_TIERS or (
        out['tier'] == 'partial' and out['coverage'] is not None and COVERAGE[0] <= out['coverage'] <= COVERAGE[1]))
    return out


def listed(km):
    names = [f'{k} km' for k in km]
    return names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1]


def pct(value):
    return f'{value:.1f}'.rstrip('0').rstrip('.')


def decide(f, exception):
    """(category, reason, rule) of an edition that is not counted, or None."""
    if exception:
        return exception['category'], exception['reason'], 'reviewed_exception'
    if f['split_tier'] != 'splits':
        return 'finish_time_only', REASONS['finish_time_only'], '1_split_tier'
    if f['tier'] in ('held_for_review', 'unverified'):
        return f['tier'], REASONS[f['tier']], '2_tier'
    assert f['tier'] in COUNT_TIERS, f['tier']
    if not f['tier_and_coverage']:
        assert f['tier'] == 'partial' and f['coverage'] is not None, 'a partial edition without an official count needs a review'
        gap = abs(f['coverage'] - 1) * 100
        side = 'short of' if f['coverage'] < 1 else 'above'
        return ('partial_coverage', f'The producer lists this edition as partial: {f["finishes_in_release"]:,} recorded finishes against {f["official_finishers"]:,} '
                f'official finishers, {pct(gap)}% {side} the count and outside the 5% the edition policy allows.', '3_coverage')
    if f['screen_a']:
        if f['timing_eligible'] == 0:
            missing = f' ({listed(f["missing_for_all"])} missing for every finisher)' if f['missing_for_all'] else ''
            return 'invalid_split_grid', f'No finish in this edition has all nine checkpoint times{missing}, so it supplies no pacing statistic.', '4_screens_a'
        return ('invalid_split_grid', f'Only {f["timing_eligible"]:,} of {f["screen_finishers"]:,} finishes have a complete, plausible set of checkpoint '
                'times, too few to stand for the field.', '4_screens_a')
    if f['screen_b']:
        return ('invalid_split_grid', f'Complete checkpoint timings survive for {pct(f["quickest_quarter_pct"])}% of the quarter of finishers with the shortest '
                f'finish times but {pct(f["slowest_quarter_pct"])}% of the quarter with the longest, so they are not a sample of the field.', '4_screens_b')
    if f['screen_c']:
        return ('invalid_split_grid', f'{pct(f["mixed_basis_pct"])}% of the complete sets of checkpoint times put the finish at or before 40 km or run the '
                'last 2.195 km faster than 2:00 per km: the checkpoints and the finish are on different timing bases.', '4_screens_c')
    return None


def build(editions, screens, exceptions):
    by_key = {(x['city'], x['year']): x for x in exceptions}
    assert len(by_key) == len(exceptions) and set(by_key) <= set(editions), 'a reviewed exception names no edition with rows, or is repeated'
    counted, excluded, review = [], [], []
    for key in sorted(editions):
        f = facts(editions[key], screens[key])
        decision = decide(f, by_key.get(key))
        row = {'city': key[0], 'year': key[1], **f, 'counted': decision is None}
        if decision is None:
            counted.append([key[0], key[1]])
        else:
            own = decision[0] in OWN_RECORD_CATEGORIES and not (f['screen_a'] or f['screen_b'] or f['screen_c'])
            excluded.append({'city': key[0], 'year': key[1], 'category': decision[0], 'reason': decision[1], 'rule': decision[2], 'own_record': own})
            row.update(category=decision[0], reason=decision[1], rule=decision[2], own_record=own)
        review.append(row)
    return counted, excluded, review


def check_labels(counted, excluded):
    """Every counted or own-record edition belongs to a race with a plain or reviewed label. Returns the registry's digest."""
    data = REGISTRY.read_bytes()
    registry = json.loads(data)
    assert registry['tag'] == TAG, 'the race registry is for another release'
    reviewed = {race['label'] for race in registry['races'] if race['labelled_by'] in ('plain key', 'reviewed label')}
    known = {race['label'] for race in registry['races']}
    cities = {city for city, _ in counted} | {e['city'] for e in excluded}
    assert cities <= known, f'editions under a city the race registry does not label: {sorted(cities - known)[:5]}'
    unreviewed = sorted(({city for city, _ in counted} | {e['city'] for e in excluded if e['own_record']}) - reviewed)
    assert not unreviewed, f'races with a counted or own-record edition need a reviewed label in the race registry: {unreviewed}'
    return hashlib.sha256(data).hexdigest()


def check_row_exceptions(counted):
    """Every edition with a reviewed row exception (analysis/reviewed-row-exceptions.json; lead ruling D33, 2026-11-14)
    is counted: the adapter wrote the row because the policy frozen at the time counted its edition, and a policy that
    stops counting it must not be frozen while the exception stands. Returns the editions."""
    listed = json.loads(ROW_EXCEPTIONS.read_text())['releases'].get(TAG, []) if ROW_EXCEPTIONS.exists() else []
    editions = sorted({(entry['city'], entry['year']) for entry in listed})
    missing = [f'{city} {year}' for city, year in editions if [city, year] not in counted]
    assert not missing, f'editions with a reviewed row exception that this policy does not count: {missing}'
    return [[city, year] for city, year in editions]


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def frozen_document(counted, excluded, exceptions, inputs):
    by_category, own = {}, {}
    for e in excluded:
        by_category[e['category']] = by_category.get(e['category'], 0) + 1
        if e['own_record']:
            own[e['category']] = own.get(e['category'], 0) + 1
    return {
        'document': ('The counted-editions policy of this release (lead decision D3 of the adoption plan, 2026-11-14), frozen. analysis/source_quality.py '
                     'reads `editions` as RULES_20261113_1113 and refuses this file when its digest differs from the one it pins; '
                     'docs/evidence/2026-11-14/release-20261113-1113/policy.py rebuilds it from the rule and fails on any difference.'),
        'schema_version': 2, 'tag': TAG, 'reviewed': '2026-11-14', 'rule': RULE,
        'thresholds': {'coverage': list(COVERAGE), 'screen_a_min_usable_pct': USABLE_MIN_PCT, 'screen_b_quickest_min_pct': SELECTIVE[0],
                       'screen_b_slowest_under_pct': SELECTIVE[1], 'screen_c_min_mixed_pct': MIXED_MIN_PCT},
        'inputs': inputs,
        'expected': {'editions_with_rows': len(counted) + len(excluded), 'counted': len(counted), 'not_counted': len(excluded),
                     'not_counted_by_category': dict(sorted(by_category.items())), 'own_record': sum(own.values()),
                     'own_record_by_category': dict(sorted(own.items())), 'reviewed_exceptions': len(exceptions)},
        'counted_sha256': digest(counted),
        'editions_sha256': digest([[e['city'], e['year'], e['category'], e['reason'], e['own_record']] for e in excluded]),
        'reviewed_exceptions': exceptions,
        'counted': counted,
        'editions': excluded,
    }


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source', type=Path, help='the adapted FULL (or CORE) folder')
    parser.add_argument('screens', type=Path, help='edition-screen.csv of that folder')
    parser.add_argument('--write', action='store_true', help='freeze the list (a reviewed refresh only)')
    parser.add_argument('--exceptions', type=Path, help='with --write: the reviewed exception list to freeze (default: the frozen file\'s own)')
    parser.add_argument('--review', type=Path, help='also write every edition\'s facts and decision to this file')
    args = parser.parse_args(argv)
    editions, screens = read_inputs(args.source, args.screens)
    exceptions = json.loads((args.exceptions or FROZEN).read_text())
    exceptions = exceptions['reviewed_exceptions'] if isinstance(exceptions, dict) else exceptions
    counted, excluded, review = build(editions, screens, exceptions)
    inputs = {'adapted_manifest_sha256': hashlib.sha256((args.source / 'MANIFEST.json').read_bytes()).hexdigest(),
              'race_registry_sha256': check_labels(counted, excluded),
              'editions_with_a_reviewed_row_exception': check_row_exceptions(counted),
              'editions_json_sha256': hashlib.sha256((args.source / 'EDITIONS.json').read_bytes()).hexdigest(),
              'edition_screen_csv_sha256': hashlib.sha256(args.screens.read_bytes()).hexdigest(),
              'screen_script': 'docs/evidence/2026-10-21/release-0829/screen.py',
              'screen_script_sha256': hashlib.sha256((ROOT / 'docs/evidence/2026-10-21/release-0829/screen.py').read_bytes()).hexdigest()}
    document = frozen_document(counted, excluded, exceptions, inputs)
    text = json.dumps(document, indent=1, ensure_ascii=False) + '\n'
    if args.write:
        FROZEN.write_text(text)
        print(json.dumps({'written': str(FROZEN.relative_to(ROOT)), 'sha256': hashlib.sha256(text.encode()).hexdigest(), **document['expected']}, indent=1))
    else:
        frozen = json.loads(FROZEN.read_text())
        for key in ('rule', 'thresholds', 'inputs', 'expected', 'counted_sha256', 'editions_sha256', 'reviewed_exceptions', 'counted', 'editions'):
            assert frozen[key] == document[key], f'the recount differs from the frozen policy in `{key}`'
        print(json.dumps({'recount_equals_frozen': True, 'frozen_sha256': hashlib.sha256(FROZEN.read_bytes()).hexdigest(), **document['expected']}, indent=1))
    if args.review:
        # One edition a line, so the file stays readable in a diff and about half the size of an indented one.
        head = {'tag': TAG, 'frozen_policy': str(FROZEN.relative_to(ROOT)), 'frozen_policy_sha256': hashlib.sha256(FROZEN.read_bytes()).hexdigest(),
                'thresholds': document['thresholds'], 'expected': document['expected'],
                'fields': ('per edition: the facts the rule reads (tier, split tier, written rows and finishes, the release’s rows and finishes, the official '
                           'count and the coverage, the screens’ numbers as edition-screen.csv prints them, each screen’s verdict) and the decision, with '
                           'whether an edition that is not counted keeps an own-record view; `reason` is in the frozen policy and is not repeated here')}
        lines = [json.dumps({k: (round(v, 6) if isinstance(v, float) else v) for k, v in row.items() if k != 'reason'}, ensure_ascii=False, separators=(',', ':'))
                 for row in review]
        args.review.write_text(json.dumps(head, indent=1, ensure_ascii=False)[:-2] + ',\n "editions": [\n' + ',\n'.join(lines) + '\n]}\n')
        json.loads(args.review.read_text())


if __name__ == '__main__':
    main(sys.argv[1:])
