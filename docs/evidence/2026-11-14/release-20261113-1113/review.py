"""The edition-policy review of pace-notes-marathon-half-20261113-1113 in numbers: which thresholds reproduce the earlier
decisions, the editions close to a threshold, the carried decisions, the newly counted editions and the edge cases.

    python3 -I review.py <edition-policy-review.json> <release-contract.json> <cohort.json> <out.json>

Everything is read from files: the per-edition facts (policy.py --review), the audit's record delta against the
previous release, the cohort run, the frozen policy, and the previous review's policy and screens (git history keeps
them: analysis/source_quality.py RULES_MASTER_20261103B, docs/evidence/2026-11-04/release-master-20261103b).
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'analysis'))
from source_quality import RULES_MASTER_20261103B  # noqa: E402

FROZEN = ROOT / 'analysis' / 'edition-policy-20261113-1113.json'
PREVIOUS_SCREEN = ROOT / 'docs/evidence/2026-11-04/release-master-20261103b/edition-screen.csv'
# The screens that drove a decision in the October 16 and October 21 reviews (analysis/source_quality.py comments).
BY_SCREEN = {
    'a': [('Paris', y) for y in range(2014, 2019)],
    'b': [('Gold Coast', 2024), ('Auckland', 2018), ('Dubai', 2025), ('Barcelona', 2019), ('Eindhoven', 2026)],
    'c': [('New York', 2007), ('Barcelona', 2019), ('Eindhoven', 2026)],
}


def name(key):
    return f'{key[0]} {key[1]}'


def main(argv):
    review = json.loads(Path(argv[1]).read_text())
    contract = json.loads(Path(argv[2]).read_text())
    cohort = json.loads(Path(argv[3]).read_text())
    frozen = json.loads(FROZEN.read_text())
    assert review['frozen_policy_sha256'] == __import__('hashlib').sha256(FROZEN.read_bytes()).hexdigest()
    facts = {(e['city'], e['year']): e for e in review['editions']}
    reasons = {(e['city'], e['year']): e for e in frozen['editions']}
    before = {(c, y): (category, reason) for c, y, category, reason in RULES_MASTER_20261103B}
    with open(PREVIOUS_SCREEN, newline='') as stream:
        previous = {(r['city'], int(r['year'])): r for r in csv.DictReader(stream)}
    kept_before = {k for k, r in previous.items() if k not in before and int(r['timing_eligible']) > 0}
    assert len(previous) == 299 and len(kept_before) == 218 and set(previous) <= set(facts)
    t = frozen['thresholds']

    # 1. Which thresholds reproduce the earlier decisions, on this release's screen numbers of the 299 earlier editions.
    usable = lambda k: facts[k]['usable_pct']  # noqa: E731
    quick, slow, mixed = (lambda k: facts[k]['quickest_quarter_pct']), (lambda k: facts[k]['slowest_quarter_pct']), (lambda k: facts[k]['mixed_basis_pct'])  # noqa: E731
    lowest_kept = min(kept_before, key=usable)
    kept_quick = [k for k in kept_before if quick(k) >= t['screen_b_quickest_min_pct']]
    thresholds = {
        'method': ('each range is the set of threshold values that, on this release’s screen numbers, still excludes every edition the earlier reviews '
                   'excluded by that screen and still keeps every one of the 218 editions eligible under the previous policy'),
        'a_usable_pct': {'frozen': t['screen_a_min_usable_pct'], 'excluded_by_this_screen_before': {name(k): usable(k) for k in BY_SCREEN['a']},
                         'lowest_among_the_218_kept': {name(lowest_kept): usable(lowest_kept)},
                         'range_that_reproduces_the_past': [f"above {max(usable(k) for k in BY_SCREEN['a'])}", f'at most {usable(lowest_kept)}'],
                         'between_5_and_the_lowest_kept_among_all_editions_that_pass_conditions_1_to_3': sorted(
                             f'{name(k)}: {usable(k)}' for k, e in facts.items() if e['tier_and_coverage'] and 5 <= usable(k) < usable(lowest_kept)),
                         'note': ('any threshold in the range gives the same list today; the frozen 5 keeps the value fixed on October 16, 2026. The editions between 5 and the '
                                  'lowest kept one are all reviewed exceptions excluded by screens b and c or by hand')},
        'b_selective': {'frozen': [t['screen_b_quickest_min_pct'], t['screen_b_slowest_under_pct']],
                        'excluded_by_this_screen_before': {name(k): [quick(k), slow(k)] for k in BY_SCREEN['b']},
                        'kept_with_the_lowest_slowest_quarter': {name(k): [quick(k), slow(k)] for k in sorted(kept_quick, key=slow)[:5]},
                        'range_that_reproduces_the_past': {
                            'slowest_quarter_under': [f"above {max(slow(k) for k in BY_SCREEN['b'])}", f'at most {min(slow(k) for k in kept_quick)}'],
                            'quickest_quarter_at_least': [f"at most {min(quick(k) for k in BY_SCREEN['b'])}",
                                                          'any lower value: no kept edition has under 50% in its slowest quarter']},
                        'kept_with_under_50_in_the_slowest_quarter': sorted(name(k) for k in kept_before if slow(k) < t['screen_b_slowest_under_pct'])},
        'c_mixed_basis_pct': {'frozen': t['screen_c_min_mixed_pct'], 'excluded_by_this_screen_before': {name(k): mixed(k) for k in BY_SCREEN['c']},
                              'highest_among_the_218_kept': {name(k): mixed(k) for k in sorted(kept_before, key=lambda k: -(mixed(k) or 0))[:3]},
                              'range_that_reproduces_the_past': [f'above {max(mixed(k) or 0 for k in kept_before)}', f"at most {min(mixed(k) for k in BY_SCREEN['c'])}"]},
        'coverage_band': {'frozen': t['coverage'], 'note': ('new in this review (lead decision D3); the earlier policies held or released partial editions one by one. '
                                                           'Counted on rows with a finish time: the producer’s own stamps compare finishes with the official count, and '
                                                           'stamped editions hold rows without a finish time'),
                          'editions_where_rows_and_finishes_read_differently': sorted(
                              name(k) for k, e in facts.items() if e['official_finishers'] and e['split_tier'] == 'splits' and e['tier'] in ('stamped', 'stamped_weaker_source', 'partial')
                              and (0.95 <= e['rows_in_release'] / e['official_finishers'] <= 1.05) != (0.95 <= e['finishes_in_release'] / e['official_finishers'] <= 1.05))},
    }

    # 2. Editions close to a threshold, among those that pass conditions 1 to 3 and are not reviewed exceptions.
    open_editions = [k for k, e in facts.items() if e['tier_and_coverage'] and e.get('rule') != 'reviewed_exception']
    row = lambda k: {'edition': name(k), 'tier': facts[k]['tier'], 'counted': facts[k]['counted'], 'timing_eligible': facts[k]['timing_eligible'],  # noqa: E731
                     'usable_pct': usable(k), 'quickest_quarter_pct': quick(k), 'slowest_quarter_pct': slow(k), 'mixed_basis_pct': mixed(k)}
    close = {
        'a_usable_between_5_and_15': [row(k) for k in sorted(open_editions) if 5 <= usable(k) < 15],
        'a_usable_between_15_and_60': [row(k) for k in sorted(open_editions) if 15 <= usable(k) < 60],
        'b_slowest_quarter_50_to_60_with_quickest_at_least_75': [row(k) for k in sorted(open_editions) if quick(k) >= 75 and 50 <= slow(k) < 60],
        'b_fails': [row(k) for k in sorted(open_editions) if facts[k]['screen_b'] and not facts[k]['screen_a']],
        'c_mixed_between_10_and_25': [row(k) for k in sorted(open_editions) if mixed(k) is not None and 10 <= mixed(k) < 25],
        'coverage_within_1_5_points_of_a_band_edge': [
            {'edition': name(k), 'coverage_pct': round(100 * e['coverage'], 2), 'counted': e['counted'], 'timing_eligible': e['timing_eligible']}
            for k, e in sorted(facts.items()) if e['tier'] == 'partial' and e['split_tier'] == 'splits' and e['coverage'] is not None
            and (93.5 <= 100 * e['coverage'] <= 96.5 or 103.5 <= 100 * e['coverage'] <= 106.5)],
        'partial_editions_by_coverage': [
            {'edition': name(k), 'coverage_pct': round(100 * e['coverage'], 2), 'counted': e['counted'], 'category': e.get('category'), 'timing_eligible': e['timing_eligible']}
            for k, e in sorted(facts.items(), key=lambda x: x[1]['coverage'] or 0) if e['tier'] == 'partial' and e['split_tier'] == 'splits'],
    }

    # 3. The carried decisions: what each rests on now.
    delta = {(d['city'], d['year']): d for d in contract['previous_delta_by_edition']}
    carried = []
    for key, (category, reason) in before.items():
        e = facts[key]
        by_rule = ('finish_time_only' if e['split_tier'] != 'splits' else e['tier'] if e['tier'] in ('held_for_review', 'unverified')
                   else 'partial_coverage' if not e['tier_and_coverage'] else 'screen_a' if e['screen_a'] else 'screen_b' if e['screen_b'] else 'screen_c' if e['screen_c'] else None)
        carried.append({'edition': name(key), 'category': category, 'tier_now': e['tier'], 'coverage_pct': None if e['coverage'] is None else round(100 * e['coverage'], 2),
                        'timing_eligible': e['timing_eligible'], 'records_against_previous': {k: delta[key][k] for k in ('added', 'deleted', 'changed')} if key in delta else 'unchanged',
                        'reason_word_for_word': reasons[key]['reason'] == reason, 'the_rule_alone_would_give': by_rule or 'counted'})
    exceptions_needed = sorted(c['edition'] for c in carried if c['the_rule_alone_would_give'] == 'counted')

    # 4. The newly counted editions (none was reviewed by hand before), with the numbers read before they enter a pooled figure.
    joining = [{**j, **{k: facts[tuple([j['edition'].rsplit(' ', 1)[0], int(j['edition'].rsplit(' ', 1)[1])])][k]
                        for k in ('usable_pct', 'quickest_quarter_pct', 'slowest_quarter_pct', 'mixed_basis_pct', 'finishes', 'official_finishers')}}
               for j in cohort['against_previous']['joining']]
    out = {
        'tag': frozen['tag'], 'reviewed': frozen['reviewed'], 'frozen_policy_sha256': review['frozen_policy_sha256'], 'expected': frozen['expected'],
        'thresholds_that_reproduce_the_past': thresholds, 'close_to_a_threshold': close,
        'carried_decisions': {
            'rule': ('all 39 decisions of the previous policy are reviewed exceptions: the audit finds their records unchanged against the previous release except the rows '
                     'the adapter’s row rule leaves out (Barcelona 2019: 8, Eindhoven 2026: 3, New York 2007: 16, Tokyo 2018: 7) and the category sex of Honolulu 2016, and '
                     'every reason that says the producer lists the edition as partial names an edition whose tier is partial'),
            'needed_because_the_rule_alone_would_count_them': exceptions_needed,
            'reworded': sorted(c['edition'] for c in carried if not c['reason_word_for_word']),
            'partial_wording_checked': sorted(c['edition'] for c in carried if 'lists this edition as partial' in before[tuple([c['edition'].rsplit(' ', 1)[0], int(c['edition'].rsplit(' ', 1)[1])])][1]
                                              and c['tier_now'] == 'partial'),
            'partial_wording_on_another_tier': sorted(c['edition'] for c in carried if 'lists this edition as partial' in before[tuple([c['edition'].rsplit(' ', 1)[0], int(c['edition'].rsplit(' ', 1)[1])])][1]
                                                      and c['tier_now'] != 'partial'),
            'editions': carried},
        'honolulu_2021_to_2025': [{'edition': name(('Honolulu', y)), **{k: facts[('Honolulu', y)][k] for k in ('tier', 'timing_eligible', 'finishes', 'official_finishers')},
                                   'coverage_pct': None if facts[('Honolulu', y)]['coverage'] is None else round(100 * facts[('Honolulu', y)]['coverage'], 2),
                                   'removed_by_the_producer': delta.get(('Honolulu', y), {}).get('deleted')} for y in range(2021, 2026)],
        'london_2025_and_2026': {
            'facts': [{'edition': name(('London', y)), **{k: facts[('London', y)][k] for k in ('tier', 'counted', 'timing_eligible', 'finishes_in_release', 'official_finishers')},
                       'coverage_pct': round(100 * facts[('London', y)]['coverage'], 2)} for y in (2025, 2026)],
            'kept_holds': ('the owner’s decision of October 21, 2026 ("Keep London 2025-26") now holds by rule: both are partial within 5% of the official count, so no '
                           'exception keeps them. lib/kept-holds.json has no entry for this release and needs none; the /methodology sentence that names kept holds '
                           'then prints nothing, and the 5% rule needs words of its own there')},
        'newly_counted_editions': {
            'note': ('none was reviewed by hand before. new-editions-review.json holds the reading of 2026-11-14 (new-editions-review.py): their sustained-slowdown '
                     'shares by finish-time band beside the earlier counted editions, and the section profile of each edition’s quickest tenth, where a misplaced mat or a '
                     'mixed timing basis would show. No screen fails and they are counted, as the rule says; they are listed here so a pooled figure is never read without '
                     'them (by_tier_in_the_counted_cohort)'),
            'editions': joining, 'by_tier_in_the_counted_cohort': cohort['readings']['a_policy']['by_tier']},
        'row_rule_edge_cases': {
            'editions_with_no_written_row': contract['producer_counts']['editions_json_without_rows_after_row_rule'],
            'verified_editions_whose_written_finishes_fall_under_95_pct_of_the_count': sorted(
                f"{name(k)}: {e['finishes']} of {e['official_finishers']} ({e['rows_in_release'] - e['rows']} rows left out)" for k, e in facts.items()
                if e['tier'] in ('stamped', 'stamped_weaker_source') and e['official_finishers'] and e['finishes'] / e['official_finishers'] < 0.95),
            'note': 'the policy reads coverage on the release’s rows, so the row rule never moves an edition across the band'},
        'timing_eligible_by_tier_and_split_tier': {},
    }
    for e in facts.values():
        cell = out['timing_eligible_by_tier_and_split_tier'].setdefault(f"{e['tier']} / {e['split_tier']}", {'editions': 0, 'with_timing_eligible': 0, 'timing_eligible': 0, 'counted': 0})
        cell['editions'] += 1
        cell['with_timing_eligible'] += e['timing_eligible'] > 0
        cell['timing_eligible'] += e['timing_eligible']
        cell['counted'] += e['counted']
    out['timing_eligible_by_tier_and_split_tier'] = dict(sorted(out['timing_eligible_by_tier_and_split_tier'].items()))
    Path(argv[4]).write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'exceptions_needed': exceptions_needed, 'reworded': out['carried_decisions']['reworded'],
                      'partial_wording_on_another_tier': out['carried_decisions']['partial_wording_on_another_tier'],
                      'close': {k: len(v) for k, v in close.items()}, 'ranges': {k: v.get('range_that_reproduces_the_past') for k, v in thresholds.items() if isinstance(v, dict)},
                      'rows_vs_finishes': thresholds['coverage_band']['editions_where_rows_and_finishes_read_differently'],
                      'tier_cells': out['timing_eligible_by_tier_and_split_tier'], 'edge': out['row_rule_edge_cases']}, indent=1, ensure_ascii=False)[:6000])


if __name__ == '__main__':
    main(sys.argv)
