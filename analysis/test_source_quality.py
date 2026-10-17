"""Small fixtures distinguish timing failures, edition holds and demographics."""
import copy
import json
import re
import tempfile
import unittest
from pathlib import Path

import duckdb

from build_pacing import FIELDS, Publisher, prepare
from source_quality import (RELEASE, RULES, LATEST_RELEASE, LATEST_RULES, RELEASE_1652, RULES_1652, REVIEWED_POLICIES,
                            policy_metadata, source_quality_report, validate_source_quality)


def fixture(source, tag, rules=RULES):
    db = duckdb.connect()
    columns = ','.join(f'"{field}" VARCHAR' for field in FIELDS)
    db.execute(f'CREATE TABLE fixture (id BIGINT,race VARCHAR,year INTEGER,city VARCHAR,runner VARCHAR,sex VARCHAR,age DOUBLE,age_group VARCHAR,age_or_group VARCHAR,{columns})')
    splits = ['0:25:00','0:50:00','1:15:00','1:40:00','2:05:00','2:30:00','2:55:00','3:20:00','3:30:58.5']
    rows = [[i, city + ' Marathon', year, city, 'Fixture '+str(i), 'F', 35, '35-39', '35'] + splits
            for i, (city, year, _, _) in enumerate(rules, start=1)]
    unknown = [100, 'Other Marathon', 2020, 'Other', 'Unknown demographics', None, None, None, None] + splits
    rows.append(unknown)
    duplicate = rows[5].copy(); duplicate[0] = 101; rows.append(duplicate)
    missing = rows[4].copy(); missing[0] = 102; missing[4] = 'Missing timing'; missing[9] = None; rows.append(missing)
    db.executemany('INSERT INTO fixture VALUES (' + ','.join('?' for _ in rows[0]) + ')', rows)
    db.execute('COPY fixture TO ? (FORMAT PARQUET)', [str(source / 'race_records.parquet')])
    (source / 'provenance.json').write_text(json.dumps({'release_tag': tag}))
    return db


class SourceQualityTests(unittest.TestCase):
    def test_new_release_preserves_holds_without_applying_them_retroactively(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, LATEST_RELEASE, LATEST_RULES)
            counts = prepare(db, source, keep_record_id=True)
            self.assertEqual(counts['source_quality_excluded'], 11)
            self.assertEqual(counts['eligible'], 1)
            report = source_quality_report(db, source)
            nyc = next(row for row in report['editions'] if row['city'] == 'New York')
            self.assertEqual(nyc['category'], 'unreconciled_hold')
            self.assertIn('38,047', nyc['reason'])
            self.assertIn(('Valencia', 2018), [(row['city'], row['year']) for row in report['editions']])
        historical = policy_metadata(RELEASE)
        self.assertEqual(len(historical['editions']), 10)
        self.assertIn('200 records', next(row['reason'] for row in historical['editions'] if row['city'] == 'New York'))

    def test_htw_db_release_has_its_own_reviewed_policy(self):
        self.assertEqual(set(REVIEWED_POLICIES), {RELEASE, LATEST_RELEASE, RELEASE_1652})
        keys = [(city, year) for city, year, _, _ in RULES_1652]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(RULES_1652), 30)
        self.assertTrue({category for _, _, category, _ in RULES_1652} <= {
            'invalid_split_grid', 'incomplete_ingestion', 'unreconciled_hold', 'selected_field'})
        rule = {(city, year): (category, reason) for city, year, category, reason in RULES_1652}
        # Released: the reloaded Chicago 2016 (its old reason described a 6,512-record partial load).
        self.assertNotIn(('Chicago', 2016), rule)
        self.assertFalse(any('6,512' in reason for _, reason in rule.values()))
        # Producer flags and lists: the partial Chicago 2015, Oslo 2026, top-500 Tokyo lists, the stopped Boston 2013.
        self.assertEqual(rule[('Chicago', 2015)][0], 'incomplete_ingestion')
        self.assertEqual(rule[('Oslo', 2026)][0], 'incomplete_ingestion')
        for year in (2016, 2017, 2018, 2026):
            self.assertEqual(rule[('Tokyo', year)][0], 'selected_field')
        self.assertEqual(rule[('Boston', 2013)][0], 'selected_field')
        # Frankfurt 2019 now holds the real race but the producer engine still drops it: a hold, not a grid defect.
        self.assertEqual(rule[('Frankfurt', 2019)][0], 'unreconciled_hold')
        for key in [('Paris', y) for y in range(2014, 2019)] + [('New York', 2007), ('Barcelona', 2019), ('Eindhoven', 2026),
                                                                ('Gold Coast', 2024), ('Auckland', 2018), ('Dubai', 2025), ('Amsterdam', 2020)]:
            self.assertEqual(rule[key][0], 'invalid_split_grid', key)
        # Carried forward byte for byte from the reviewed 0934 policy.
        carried = {(c, y): r for c, y, *r in LATEST_RULES}
        for key in [('Honolulu', 2016), ('Rotterdam', 2012), ('Eindhoven', 2009), ('Eindhoven', 2010), ('New York', 2008),
                    ('Amsterdam', 2025), ('Valencia', 2017), ('Valencia', 2018)]:
            self.assertEqual(list(rule[key]), carried[key])
        # Visitor-visible reasons never carry internal release labels.
        self.assertFalse(any('private-export' in reason or 'htw-db' in reason for _, reason in rule.values()))
        # Nor the rank words the course pages' copy check rejects (scripts/verify-courses.cjs RANK); the reasons are printed there.
        rank = re.compile(r'\b(?:rank|ranks|ranked|ranking|rankings|fastest|toughest|hardest|easiest|harder|easier|tougher|similar|best|worst|top \d+)\b', re.I)
        self.assertEqual([key for key, (_, reason) in rule.items() if rank.search(reason)], [])
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE_1652, RULES_1652)
            counts = prepare(db, source, keep_record_id=True)
            self.assertEqual(counts['source_quality_excluded'], 30)
            self.assertEqual(counts['eligible'], 1)
            report = source_quality_report(db, source)
            self.assertEqual(sum(row['timing_eligible_excluded'] for row in report['editions']), 30)
            self.assertEqual(report['release_tag'], RELEASE_1652)
        # The two earlier reviewed policies are unchanged.
        self.assertEqual(len(policy_metadata(LATEST_RELEASE)['editions']), 11)
        self.assertIn(('Chicago', 2016), [(row['city'], row['year']) for row in policy_metadata(LATEST_RELEASE)['editions']])

    def test_known_grid_holds_and_selected_fields_are_excluded_without_double_counting(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE)
            counts = prepare(db, source, keep_record_id=True)
            self.assertEqual(counts['raw'], 13)
            self.assertEqual(counts['duplicates_removed'], 1)
            self.assertEqual(counts['missing_or_unparsed'], 1)
            self.assertEqual(counts['timing_eligible'], 11)
            self.assertEqual(counts['source_quality_excluded'], 10)
            self.assertEqual(counts['eligible'], 1)
            self.assertEqual(counts['outside_quality_bounds'], 0)
            # A false feature flag caused solely by unknown gender must not be an eligibility rule.
            self.assertEqual(db.execute('SELECT rid,gender,age_band FROM eligible').fetchall(), [(100, 'Other / not recorded', None)])
            report = source_quality_report(db, source)
            frankfurt = next(row for row in report['editions'] if row['city'] == 'Frankfurt')
            self.assertEqual([frankfurt[key] for key in ['raw_records','deduplicated_records','timing_eligible_excluded']], [2, 2, 1])
            new_york = next(row for row in report['editions'] if row['city'] == 'New York')
            self.assertEqual([new_york[key] for key in ['raw_records','deduplicated_records','timing_eligible_excluded']], [2, 1, 1])
            self.assertEqual(sum(row['timing_eligible_excluded'] for row in report['editions']), counts['source_quality_excluded'])

    def test_older_vintages_keep_the_existing_numerical_cohort(self):
        for tag in ['private-export-20260907-1318', 'private-export-20260911-0336']:
            with self.subTest(tag=tag), tempfile.TemporaryDirectory() as folder:
                source = Path(folder); db = fixture(source, tag)
                counts = prepare(db, source)
                self.assertEqual(counts['eligible'], 11)
                self.assertEqual(counts['source_quality_excluded'], 0)
                self.assertEqual(source_quality_report(db, source)['editions'], [])

    def test_publisher_records_exact_policy_and_import_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE)
            counts = prepare(db, source)
            report = source_quality_report(db, source)
            provenance = {'release_tag': RELEASE, 'asset_sha256': 'a'*64, 'manifest_sha256': 'b'*64}
            manifest = {'created_at': '2026-09-11T15:07:22Z', 'n_records': 13, 'n_cities': 10, 'n_race_years': 11}
            publisher = Publisher(source / 'output', provenance, manifest, counts, '2026-09-07', source_quality=report)
            publisher.publish('fixture', 'fixture', 'Fixture', 'Fixture', '', [], [], {}, 1)
            meta = json.loads((source / 'output/ext_fixture/pack_meta.json').read_text())
            validate_source_quality(meta)
            self.assertTrue(any('reviewed source-quality' in text for text in meta['methodology_prose']))
            for mutation in ('reason', 'count', 'hash', 'missing'):
                damaged = copy.deepcopy(meta)
                if mutation == 'reason': damaged['source_quality']['editions'][0]['reason'] = 'Invented reason'
                if mutation == 'count': damaged['source_quality']['editions'][0]['timing_eligible_excluded'] = 0
                if mutation == 'hash': damaged['source_quality']['policy_sha256'] = 'c'*64
                if mutation == 'missing': del damaged['source_quality']
                with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                    validate_source_quality(damaged)


if __name__ == '__main__':
    unittest.main()
