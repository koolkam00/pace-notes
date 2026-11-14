"""Cohort counts on an adapted input with the pipeline's own prepare() and the reviewed edition policy, and the same
counts under two other readings of the policy. No pack, story or runner file is written.

    python3 -s cohort.py <adapted FULL dir> <edition-policy-review.json> <out.json> [--previous <previous cohort-by-edition.json>]
    python3 -s cohort.py <previous adapted dir> - <out.json>      the previously adopted input under its own policy (the reference)

For each reading: records, timing-eligible, policy-excluded and eligible finishes, editions and cities, and the
sustained-slowdown count with the definition of analysis/build_public_explorer.py (its own `threshold_sql`: at least 25%
slower than the 5-20 km pace over at least 5 km of whole recorded sections after 20 km). The three readings:
  (a) the frozen policy (lead decision D3);
  (b) verified tiers only: (a) without the partial editions;
  (c) (a) plus the unverified split-bearing editions that pass the three screens and are not reviewed exceptions.
(b) and (c) are sensitivity readings, never a policy: they are summed from the same per-edition counts.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'analysis'))
import duckdb  # noqa: E402
from build_pacing import prepare  # noqa: E402
from build_public_explorer import RATIO_EPSILON, threshold_sql  # noqa: E402
from source_quality import source_quality_report  # noqa: E402

VERIFIED = ('stamped', 'stamped_weaker_source')


def per_edition(db):
    """Timing-eligible finishes, sustained slowdowns and the median finish of every edition (before the edition policy)."""
    ratios = ', '.join(f'p{i + 4}/((t3-t0)/15)-1 AS s{i}' for i in range(5))
    assert str(RATIO_EPSILON) in threshold_sql(.25, 5)
    rows = db.execute(f"""SELECT city, year, count(*), count(*) FILTER(WHERE {threshold_sql(.25, 5)}), median(t8)
      FROM (SELECT *, {ratios} FROM timing_eligible) GROUP BY ALL""").fetchall()
    return {(c, y): {'timing_eligible': n, 'sustained_slowdown': s, 'median_finish_s': m} for c, y, n, s, m in rows}


def total(editions, keys):
    chosen = [editions[k] for k in keys if k in editions]
    n, s = sum(e['timing_eligible'] for e in chosen), sum(e['sustained_slowdown'] for e in chosen)
    cities = {k[0] for k in keys if k in editions}
    return {'eligible_finishes': n, 'eligible_editions': len(chosen), 'eligible_cities': len(cities), 'sustained_slowdown': s,
            'sustained_slowdown_pct': round(100 * s / n, 4) if n else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source', type=Path)
    parser.add_argument('review')
    parser.add_argument('out', type=Path)
    parser.add_argument('--previous', type=Path, help='the reference run of the previously adopted input (this script, review "-")')
    args = parser.parse_args()
    db = duckdb.connect()
    db.execute("SET memory_limit='6GB'")
    db.execute('SET threads=3')
    db.execute('SET temp_directory=?', [str(args.out.parent / 'cohort-temp')])
    cohort = prepare(db, args.source)
    policy = source_quality_report(db, args.source)
    editions = per_edition(db)
    excluded = {(e['city'], e['year']) for e in policy['editions']}
    eligible = db.execute('SELECT count(*), count(DISTINCT (city, year)), count(DISTINCT city) FROM eligible').fetchone()
    with_rows = db.execute('SELECT count(DISTINCT (city, year)), count(DISTINCT city) FROM read_parquet(?)', [str(args.source / 'race_records.parquet')]).fetchone()
    a = total(editions, [k for k in editions if k not in excluded])
    assert (a['eligible_finishes'], a['eligible_editions'], a['eligible_cities']) == tuple(eligible), 'the per-edition sums differ from prepare()'
    assert cohort['timing_eligible'] == sum(e['timing_eligible'] for e in editions.values())
    report = {
        'release_tag': policy['release_tag'], 'input_manifest_sha256': json.loads((args.source / 'provenance.json').read_text())['manifest_sha256'],
        'policy': {k: policy[k] for k in ('version', 'reviewed_edition_policy', 'policy_sha256', 'script_sha256')}, 'policy_editions': len(policy['editions']),
        'cohort': cohort, 'editions_with_records': with_rows[0], 'cities_with_records': with_rows[1],
        'timing_eligible_editions': len(editions), 'timing_eligible_cities': len({k[0] for k in editions}),
        'policy_excluded_by_category': {}, 'readings': {'a_policy': {**a, 'policy_excluded_finishes': cohort['source_quality_excluded']}},
    }
    for e in policy['editions']:
        c = report['policy_excluded_by_category'].setdefault(e['category'], {'editions': 0, 'timing_eligible_excluded': 0})
        c['editions'] += 1
        c['timing_eligible_excluded'] += e['timing_eligible_excluded']
    by_edition = {f'{c}|{y}': {**v, 'eligible': (c, y) not in excluded} for (c, y), v in sorted(editions.items())}
    if args.review != '-':
        review = {(e['city'], e['year']): e for e in json.loads(Path(args.review).read_text())['editions']}
        counted = {k for k, e in review.items() if e['counted']}
        assert counted == set(review) - excluded, 'the review file and the installed policy disagree'
        b = [k for k in counted if review[k]['tier'] in VERIFIED]
        screened = [k for k, e in review.items() if e['tier'] == 'unverified' and e['split_tier'] == 'splits' and e.get('rule') != 'reviewed_exception'
                    and not (e['screen_a'] or e['screen_b'] or e['screen_c'])]
        report['readings']['b_verified_tiers_only'] = {**total(editions, b), 'policy_excluded_finishes': cohort['timing_eligible'] - total(editions, b)['eligible_finishes']}
        c = total(editions, list(counted) + screened)
        report['readings']['c_policy_plus_screened_unverified'] = {**c, 'policy_excluded_finishes': cohort['timing_eligible'] - c['eligible_finishes'],
                                                                   'unverified_editions_added': sorted(f'{k[0]} {k[1]}' for k in screened if k in editions)}
        report['readings']['a_policy']['by_tier'] = {t: total(editions, [k for k in counted if review[k]['tier'] == t]) for t in VERIFIED + ('partial',)}
        for key, value in by_edition.items():
            city, year = key.rsplit('|', 1)
            value.update(tier=review[(city, int(year))]['tier'], reading_b=(city, int(year)) in set(b), reading_c=(city, int(year)) in counted | set(screened))
        if args.previous:
            before = json.loads(args.previous.read_text())['by_edition']
            today = {k for k, v in before.items() if v['eligible']}
            now = {k for k, v in by_edition.items() if v['eligible']}
            leave = sorted(today - now)
            report['against_previous'] = {
                'previous_release': json.loads(args.previous.read_text())['release_tag'], 'eligible_then': len(today), 'eligible_now': len(now),
                'stay': len(today & now), 'leave': len(leave), 'join': len(now - today),
                'finishes_then_in_staying_editions': sum(before[k]['timing_eligible'] for k in today & now),
                'finishes_now_in_staying_editions': sum(by_edition[k]['timing_eligible'] for k in today & now),
                'leaving': [{'edition': k.replace('|', ' '), 'finishes_then': before[k]['timing_eligible'],
                             'category': review[(k.rsplit('|', 1)[0], int(k.rsplit('|', 1)[1]))].get('category'),
                             'tier': review[(k.rsplit('|', 1)[0], int(k.rsplit('|', 1)[1]))]['tier'],
                             'coverage_pct': None if review[(k.rsplit('|', 1)[0], int(k.rsplit('|', 1)[1]))]['coverage'] is None
                             else round(100 * review[(k.rsplit('|', 1)[0], int(k.rsplit('|', 1)[1]))]['coverage'], 2)} for k in leave],
                'joining': [{'edition': k.replace('|', ' '), 'finishes': by_edition[k]['timing_eligible'], 'tier': by_edition[k]['tier'],
                             'sustained_slowdown_pct': round(100 * by_edition[k]['sustained_slowdown'] / by_edition[k]['timing_eligible'], 2),
                             'median_finish_s': by_edition[k]['median_finish_s'], 'in_previous_release': k in before} for k in sorted(now - today)],
                'leaving_finishes': sum(before[k]['timing_eligible'] for k in leave),
                'leaving_by_category': {}, 'cities_then': sorted({k.rsplit('|', 1)[0] for k in today}), 'cities_now': sorted({k.rsplit('|', 1)[0] for k in now}),
            }
            for row in report['against_previous']['leaving']:
                c = report['against_previous']['leaving_by_category'].setdefault(row['category'], {'editions': 0, 'finishes_then': 0})
                c['editions'] += 1
                c['finishes_then'] += row['finishes_then']
            # Today's course cities (a city with eligible finishes then): counted editions and eligible finishes under each reading.
            cities = {}
            for city in report['against_previous']['cities_then']:
                mine = {k: v for k, v in by_edition.items() if k.rsplit('|', 1)[0] == city}
                row = {'then': {'editions': sum(1 for k in today if k.rsplit('|', 1)[0] == city), 'finishes': sum(before[k]['timing_eligible'] for k in today if k.rsplit('|', 1)[0] == city)}}
                for name, flag in (('a', 'eligible'), ('b', 'reading_b'), ('c', 'reading_c')):
                    row[name] = {'editions': sum(1 for v in mine.values() if v[flag]), 'finishes': sum(v['timing_eligible'] for v in mine.values() if v[flag])}
                cities[city] = row
            report['todays_course_cities'] = cities
    report['by_edition'] = by_edition
    args.out.write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({k: report[k] for k in ('release_tag', 'cohort', 'editions_with_records', 'readings') if k in report}, indent=1)[:3000])


if __name__ == '__main__':
    main()
