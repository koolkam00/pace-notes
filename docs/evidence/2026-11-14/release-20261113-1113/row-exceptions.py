"""Evidence for the reviewed row exceptions (lead ruling D33 of the adoption plan, 2026-11-14).

    python3 -I row-exceptions.py <adapted FULL dir> <record-status.parquet> row-exceptions.json

Reads the adapted input's RECONCILIATION.json and release_keys.parquet, the record status file, the reviewed list
(analysis/reviewed-row-exceptions.json) and the frozen edition policy, and writes: the ruling in the lead's words,
each listed row with what became of it, and, for every counted edition, how many rows the same flag leaves out and
their fastest and slowest finish, so a reader sees what the exception restores and what it does not.
"""
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[4]
TAG = 'pace-notes-marathon-half-20261113-1113'
FLAG = 'finish_faster_than_world_record'


def main(source, status, output):
    source = Path(source)
    report = json.loads((source / 'RECONCILIATION.json').read_text())
    listed = json.loads((ROOT / 'analysis/reviewed-row-exceptions.json').read_text())['releases'][TAG]
    counted = {(city, year) for city, year in json.loads((ROOT / 'analysis/edition-policy-20261113-1113.json').read_text())['counted']}
    check = next(c for c in report['checks'] if c['check'].startswith(f'rows that {FLAG} leaves out, by edition'))
    db = duckdb.connect()
    label = {(key, year): city for key, year, city in db.execute(f"SELECT release_city, year, city FROM read_parquet('{source / 'release_keys.parquet'}')").fetchall()}
    rows = []
    for name, (n, fastest, slowest) in check['measured'].items():
        key, year = name.rsplit(' ', 1)
        city = label[(key, int(year))]
        rows.append({'city': city, 'year': int(year), 'counted': (city, int(year)) in counted, 'rows': n, 'fastest': fastest, 'slowest': slowest})
    assert sum(r['rows'] for r in rows) == next(c for c in report['checks'] if c['check'].startswith('rows left out, by flag'))['measured'][f'qa_row_flags.{FLAG}']
    ids = [e['record_id'] for e in listed]
    became = {rid: (st, reason) for rid, st, reason in db.execute(
        f"SELECT record_id, status, reason FROM read_parquet('{status}') WHERE record_id IN ({', '.join(str(i) for i in ids)})").fetchall()}
    edition = db.execute(f"SELECT count(*) FILTER(WHERE status='counted'), count(*) FROM read_parquet('{status}') WHERE city='London' AND year=2026").fetchone()
    document = {
        'document': ('Reviewed row exceptions of this release (lead ruling D33 of the adoption plan, 2026-11-14): a deliberate, documented departure from the database '
                     'lead’s rule 7 for three rows. Three rows of London 2026, the race’s podium, are written to the adapted marathon input although they carry '
                     f'the row-quality flag {FLAG}, whose bound is the record that stood before this race. The list, its conditions and its external evidence are in '
                     'analysis/reviewed-row-exceptions.json; analysis/adapt_combined.py checks every condition and stops when one fails. Every other row with the flag '
                     'stays out. Measured, nothing typed.'),
        'tag': TAG,
        'adapted_manifest_sha256': report.get('adapted_manifest_sha256') or __import__('hashlib').sha256((source / 'MANIFEST.json').read_bytes()).hexdigest(),
        'exceptions': [{'record_id': e['record_id'], 'edition': f"{e['city']} {e['year']}", 'finish': e['finish'], 'flag': e['flag'], 'edition_facts': e['edition'],
                        'producer_record_note': e['producer_record_note'], 'record_status': became[e['record_id']][0], 'record_status_reason': became[e['record_id']][1]}
                       for e in listed],
        'london_2026': {'counted_finishes': edition[0], 'written_rows': edition[1]},
        'flag_leaves_out': {
            'rows': sum(r['rows'] for r in rows), 'editions': len(rows),
            'in_counted_editions': {'rows': sum(r['rows'] for r in rows if r['counted']), 'editions': sum(1 for r in rows if r['counted'])},
            'in_other_editions': {'rows': sum(r['rows'] for r in rows if not r['counted']), 'editions': sum(1 for r in rows if not r['counted'])},
            'by_counted_edition': [{k: r[k] for k in ('city', 'year', 'rows', 'fastest', 'slowest')} for r in sorted(rows, key=lambda r: (r['city'], r['year'])) if r['counted']],
            'by_other_edition': [{k: r[k] for k in ('city', 'year', 'rows', 'fastest', 'slowest')} for r in sorted(rows, key=lambda r: (r['city'], r['year'])) if not r['counted']],
        },
    }
    Path(output).write_text(json.dumps(document, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({k: document[k] for k in ('exceptions', 'london_2026')}, ensure_ascii=False)[:900])
    print(json.dumps({k: v for k, v in document['flag_leaves_out'].items() if not k.startswith('by_')}))
    print([(r['city'], r['year'], r['rows'], r['fastest'], r['slowest']) for r in document['flag_leaves_out']['by_counted_edition']])


if __name__ == '__main__':
    main(*sys.argv[1:4])
