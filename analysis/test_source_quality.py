"""Small fixtures distinguish timing failures, edition holds and demographics."""
import copy
import json
import re
import tempfile
import unittest
from pathlib import Path

import duckdb

from build_pacing import FIELDS, Publisher, prepare
import source_quality
from source_quality import (RELEASE, RULES, LATEST_RELEASE, LATEST_RULES, RELEASE_1652, RULES_1652, RELEASE_1050, RULES_1050, RELEASE_MASTER_20261103B,
                            RULES_MASTER_20261103B, RELEASE_20261113_1113, RULES_20261113_1113, REVIEWED_POLICIES,
                            policy_metadata, source_quality_report, validate_source_quality)

ROOT = Path(__file__).resolve().parents[1]
RANK = re.compile(r'\b(?:rank|ranks|ranked|ranking|rankings|fastest|toughest|hardest|easiest|harder|easier|tougher|similar|best|worst|top \d+)\b', re.I)


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
        # 2026-11-14: the combined release pace-notes-marathon-half-20261113-1113 has its own reviewed policy (below).
        self.assertEqual(set(REVIEWED_POLICIES), {RELEASE, LATEST_RELEASE, RELEASE_1652, RELEASE_1050, RELEASE_MASTER_20261103B, RELEASE_20261113_1113})
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

    def test_release_1050_policy(self):
        keys = [(city, year) for city, year, _, _ in RULES_1050]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(RULES_1050), 41)
        rule = {(city, year): (category, reason) for city, year, category, reason in RULES_1050}
        # Released: the finished Chicago 2015 load, Frankfurt 2019, Amsterdam 2025, Oslo 2026; Amsterdam 2020 left the release.
        for key in [('Chicago', 2015), ('Frankfurt', 2019), ('Amsterdam', 2025), ('Oslo', 2026), ('Amsterdam', 2020)]:
            self.assertNotIn(key, rule)
        # Owner decision (October 21, 2026): London 2025 and 2026 stay in despite the producer's hold; 2015-2018 and 2021-2024 leave.
        self.assertEqual(sorted(y for c, y in rule if c == 'London'), [2015, 2016, 2017, 2018, 2021, 2022, 2023, 2024])
        for key in [('London', y) for y in (2015, 2016, 2017, 2018, 2021, 2022, 2023, 2024)] + [('Stockholm', 2025)] + \
                [('Vienna', y) for y in (2022, 2023, 2024)] + [('New York', 2008)]:
            self.assertEqual(rule[key][0], 'unreconciled_hold', key)
        for key in [('Madrid', 2023), ('Auckland', 2017), ('Chicago', 2005)]:
            self.assertEqual(rule[key][0], 'invalid_split_grid', key)
        # The heat-shortened Chicago 2007 leaves whole, so its 1,734 re-routed finishes never reach a pacing or split analysis.
        self.assertEqual(rule[('Chicago', 2007)][0], 'selected_field')
        self.assertIn('1,734', rule[('Chicago', 2007)][1])
        self.assertIn('HOLD', rule[('New York', 2008)][1])
        self.assertIn('HOLD', rule[('Amsterdam', 2023)][1])
        # Every other 1652 rule is carried byte for byte.
        carried = {(c, y): r for c, y, *r in RULES_1652}
        for key, value in rule.items():
            if key in carried and key not in {('New York', 2008), ('Amsterdam', 2023)}:
                self.assertEqual(list(value), carried[key], key)
        self.assertEqual(set(carried) - set(rule), {('Chicago', 2015), ('Frankfurt', 2019), ('Amsterdam', 2025), ('Oslo', 2026), ('Amsterdam', 2020)})
        self.assertFalse(any('private-export' in reason or 'htw-db' in reason or '20261021' in reason for _, reason in rule.values()))
        rank = re.compile(r'\b(?:rank|ranks|ranked|ranking|rankings|fastest|toughest|hardest|easiest|harder|easier|tougher|similar|best|worst|top \d+)\b', re.I)
        self.assertEqual([key for key, (_, reason) in rule.items() if rank.search(reason)], [])
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE_1050, RULES_1050)
            counts = prepare(db, source, keep_record_id=True)
            self.assertEqual(counts['source_quality_excluded'], 41)
            self.assertEqual(counts['eligible'], 1)
            self.assertEqual(source_quality_report(db, source)['release_tag'], RELEASE_1050)
        # The 1652 policy is unchanged.
        self.assertEqual(len(policy_metadata(RELEASE_1652)['editions']), 30)

    def test_release_master_20261103b_policy(self):
        # Reviewed November 4, 2026 (docs/REFRESH_20261103b.md): RULES_1050 carried, New York 2008 and Amsterdam 2023 released.
        keys = [(city, year) for city, year, _, _ in RULES_MASTER_20261103B]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(RULES_MASTER_20261103B), 39)
        rule = {(city, year): (category, reason) for city, year, category, reason in RULES_MASTER_20261103B}
        before = {(city, year): (category, reason) for city, year, category, reason in RULES_1050}
        self.assertEqual(set(before) - set(rule), {('New York', 2008), ('Amsterdam', 2023)})
        self.assertEqual(set(rule) - set(before), set())
        # New York 2026 is new and passes the screens; London 2025 and 2026 stay in (owner, October 21, 2026).
        for key in [('New York', 2026), ('London', 2025), ('London', 2026), ('Amsterdam', 2020)]:
            self.assertNotIn(key, rule)
        # Categories never change; a reason changes only where it cited a producer HOLD, which master does not carry.
        reworded = {key for key in rule if rule[key][1] != before[key][1]}
        self.assertEqual(reworded, {key for key, (_, reason) in before.items() if 'HOLD' in reason} - {('New York', 2008), ('Amsterdam', 2023)})
        self.assertEqual(len(reworded), 14)
        for key in rule:
            self.assertEqual(rule[key][0], before[key][0], key)
        for key in reworded:
            self.assertTrue(rule[key][1].startswith('The producer lists this edition as partial'), key)
            self.assertEqual(re.findall(r'[0-9][0-9,.]*', rule[key][1]), re.findall(r'[0-9][0-9,.]*', before[key][1].replace('HOLD', '')), key)
        self.assertFalse(any('HOLD' in reason or 'master-' in reason or '20261103' in reason or 'private-export' in reason
                             for _, reason in rule.values()))
        rank = re.compile(r'\b(?:rank|ranks|ranked|ranking|rankings|fastest|toughest|hardest|easiest|harder|easier|tougher|similar|best|worst|top \d+)\b', re.I)
        self.assertEqual([key for key, (_, reason) in rule.items() if rank.search(reason)], [])
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE_MASTER_20261103B, RULES_MASTER_20261103B)
            counts = prepare(db, source, keep_record_id=True)
            self.assertEqual(counts['source_quality_excluded'], 39)
            self.assertEqual(counts['eligible'], 1)
            self.assertEqual(source_quality_report(db, source)['release_tag'], RELEASE_MASTER_20261103B)
        # The 1050 policy is unchanged.
        self.assertEqual(len(policy_metadata(RELEASE_1050)['editions']), 41)

    def test_release_20261113_1113_policy(self):
        """Reviewed November 14, 2026: a rule (lead decision D3), frozen as data, with the earlier decisions as its exceptions.
        Refrozen the same day after the lead's rulings: four small editions keep their rows (R2: 2,684 editions became
        2,688, and the list 2,487), an edition is named by its race's registry label (D19), and each listed edition says
        whether it keeps an own-record view (R4)."""
        frozen = json.loads(source_quality.POLICY_FILE_20261113_1113.read_text())
        rule = {(city, year): (category, reason) for city, year, category, reason in RULES_20261113_1113}
        self.assertEqual(len(rule), len(RULES_20261113_1113))
        counted = {tuple(key) for key in frozen['counted']}
        self.assertFalse(counted & set(rule))
        # 2026-11-14, after ruling R2: the four editions the row rule no longer empties are listed (two stamped by a weaker
        # source with no complete grid, two unverified), so 2,483 became 2,487; the 201 counted editions are the same.
        self.assertEqual((len(counted), len(rule), len(counted) + len(rule)), (201, 2487, 2688))
        self.assertEqual(frozen['expected']['not_counted_by_category'], {
            'finish_time_only': 1926, 'held_for_review': 163, 'incomplete_ingestion': 3, 'invalid_split_grid': 158, 'mixed_distance_list': 5,
            'partial_coverage': 12, 'selected_field': 6, 'unreconciled_hold': 12, 'unverified': 202})
        self.assertEqual([[c, y, *rule[(c, y)]] for c, y in sorted(rule)], [[e['city'], e['year'], e['category'], e['reason']] for e in frozen['editions']])
        # The 39 decisions of the previous policy are its reviewed exceptions: every category unchanged, every reason word
        # for word except the two whose numbers follow the adapted records.
        before = {(city, year): (category, reason) for city, year, category, reason in RULES_MASTER_20261103B}
        self.assertTrue(set(before) <= set(rule))
        reworded = {key for key in before if rule[key][1] != before[key][1]}
        self.assertEqual(reworded, {('Eindhoven', 2026), ('Tokyo', 2018)})
        self.assertTrue(all(rule[key][0] == before[key][0] for key in before))
        self.assertIn('1,877 of 4,463 complete grids', rule[('Eindhoven', 2026)][1])
        self.assertEqual({(e['city'], e['year']) for e in frozen['reviewed_exceptions']}, set(before) | {('Honolulu', y) for y in range(2021, 2026)})
        for year in range(2021, 2026):
            self.assertEqual(rule[('Honolulu', year)][0], 'mixed_distance_list')
        # Counted by rule, with no exception: London 2025 and 2026 (partial within 5%: the owner's October 21, 2026
        # "Keep London 2025-26" now holds by rule), New York 2026, and the first weaker-source editions.
        # 2026-11-14 (D19): an edition is named by its race's registry label, so a composite key never names one.
        for key in [('London', 2025), ('London', 2026), ('New York', 2026), ('Chicago', 2026), ('Los Angeles', 2024), ('Toronto Waterfront', 2019),
                    ('Austin', 2023), ('Oklahoma City', 2025)]:
            self.assertIn(key, counted, key)
        self.assertEqual([key for key in counted | set(rule) if ': ' in key[0] or key[0].startswith('XACT')], [])
        # Not counted by rule: an unverified edition that was eligible before, a partial one 6% short, a finish-time-only
        # one, a held one, a stamped one with no complete grid, and Los Angeles 2010 (screen b: 89.4% against 39.7%).
        for key, category in [(('Sydney', 2019), 'unverified'), (('New York', 2014), 'partial_coverage'), (('Boston', 2012), 'finish_time_only'),
                              (('Los Angeles', 2020), 'held_for_review'), (('Athens', 2019), 'invalid_split_grid'),
                              (('Los Angeles', 2010), 'invalid_split_grid')]:
            self.assertEqual(rule[key][0], category, key)
        self.assertIn('89.4%', rule[('Los Angeles', 2010)][1])
        self.assertIn('47,588 recorded finishes against 50,564 official finishers', rule[('New York', 2014)][1])
        # Visitor-visible reasons: no release label, no hold jargon, no rank word, none of the words the site never uses.
        banned = re.compile(r'master-|pace-notes-marathon|private-export|htw-db|2026111[34]|arithmetic|the wall|your chance', re.I)
        self.assertEqual([key for key, (_, reason) in rule.items() if banned.search(reason) or RANK.search(reason) or 'HOLD' in reason], [])
        self.assertEqual(len({reason for category, reason in rule.values() if category in ('finish_time_only', 'held_for_review', 'unverified')}), 3)
        # An independent recount from the stored facts of every edition (docs/evidence): the rule in a few lines, written
        # here and not imported, gives the frozen counted list.
        review = json.loads((ROOT / 'docs/evidence/2026-11-14/release-20261113-1113/edition-policy-review.json').read_text())
        self.assertEqual(review['frozen_policy_sha256'], source_quality.POLICY_FILE_SHA256_20261113_1113)
        exceptions = {(e['city'], e['year']) for e in frozen['reviewed_exceptions']}
        recount = set()
        for e in review['editions']:
            stamped = e['tier'] in ('stamped', 'stamped_weaker_source')
            within = e['tier'] == 'partial' and e['official_finishers'] and 0.95 <= e['finishes_in_release'] / e['official_finishers'] <= 1.05
            usable = e['usable_pct'] is not None and e['usable_pct'] >= 5
            selective = e['quickest_quarter_pct'] is not None and e['quickest_quarter_pct'] >= 75 and e['slowest_quarter_pct'] < 50
            mixed = e['mixed_basis_pct'] is not None and e['mixed_basis_pct'] >= 25
            if e['split_tier'] == 'splits' and (stamped or within) and usable and not selective and not mixed and (e['city'], e['year']) not in exceptions:
                recount.add((e['city'], e['year']))
        self.assertEqual(recount, counted)
        self.assertEqual({(e['city'], e['year']) for e in review['editions']}, counted | set(rule))
        # Two levels of use (ruling R4): an edition left out only as unverified or as partial outside the coverage band, with
        # a grid that passes the three screens, keeps an own-record view; recounted here from the same facts.
        own = {(e['city'], e['year']) for e in review['editions'] if not e['counted'] and e['category'] in ('unverified', 'partial_coverage')
               and (e['usable_pct'] is not None and e['usable_pct'] >= 5)
               and not (e['quickest_quarter_pct'] is not None and e['quickest_quarter_pct'] >= 75 and e['slowest_quarter_pct'] < 50)
               and not (e['mixed_basis_pct'] is not None and e['mixed_basis_pct'] >= 25)}
        self.assertEqual(own, set(source_quality.OWN_RECORD[RELEASE_20261113_1113]))
        self.assertEqual(own, {(e['city'], e['year']) for e in frozen['editions'] if e['own_record']})
        self.assertEqual((len(own), frozen['expected']['own_record_by_category']), (32, {'partial_coverage': 9, 'unverified': 23}))
        self.assertTrue({('New York', 2014), ('Sydney', 2019), ('Copenhagen', 2026), ('Singapore', 2025), ('San Sebastián', 2023)} <= own)
        self.assertFalse(own & ({('Athens', 2021), ('Helsinki', 2024), ('Los Angeles', 2020), ('Boston', 2012)} | counted))
        # Every counted or own-record edition belongs to a race with a plain or reviewed label of the race registry (D19).
        registry = json.loads((ROOT / 'analysis/race-registry.json').read_text())
        self.assertEqual(frozen['inputs']['race_registry_sha256'], __import__('hashlib').sha256((ROOT / 'analysis/race-registry.json').read_bytes()).hexdigest())
        reviewed_labels = {race['label'] for race in registry['races'] if race['labelled_by'] in ('plain key', 'reviewed label')}
        self.assertTrue({city for city, _ in counted | own} <= reviewed_labels)
        self.assertTrue({city for city, _ in counted | set(rule)} <= {race['label'] for race in registry['races']})
        # The policy as data: version 2 carries each rule's own-record flag, and its digest covers it.
        metadata = policy_metadata(RELEASE_20261113_1113)
        self.assertEqual((metadata['version'], len(metadata['editions']), sum(row['own_record'] for row in metadata['editions'])), (2, 2487, 32))
        self.assertEqual(set(metadata['editions'][0]), {'city', 'year', 'category', 'reason', 'own_record'})
        # The policy is applied only to its own tag, and prepare() excludes exactly the listed editions.
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE_20261113_1113, RULES_20261113_1113)
            counts = prepare(db, source, keep_record_id=True)
            self.assertEqual(counts['source_quality_excluded'], 2487)
            self.assertEqual(counts['eligible'], 1)
            self.assertEqual(source_quality_report(db, source)['release_tag'], RELEASE_20261113_1113)
            self.assertEqual(db.execute('SELECT count(*), count(*) FILTER(WHERE own_record) FROM source_quality_editions').fetchone(), (2487, 32))
        # Earlier releases are untouched: version 1, no own-record flag, the same digest as before this release was added.
        master = policy_metadata(RELEASE_MASTER_20261103B)
        self.assertEqual((master['version'], len(master['editions']), set(master['editions'][0])), (1, 39, {'city', 'year', 'category', 'reason'}))
        self.assertEqual(master['policy_sha256'], '3a673c3a' + master['policy_sha256'][8:])

    def test_an_output_states_digests_and_the_list_is_one_published_file(self):
        """Ruling R8 (2026-11-14): from the combined release on, an output carries the policy's digests and counts; the list
        with each edition's counts is one file, and a reader refuses a file that is not the one the output was built with."""
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE_20261113_1113, RULES_20261113_1113)
            counts = prepare(db, source, keep_record_id=True)
            report = source_quality_report(db, source)
            self.assertEqual(set(report), {'version', 'release_tag', 'reviewed_edition_policy', 'policy_sha256', 'script_sha256', 'editions_file', 'editions_sha256', 'counts'})
            self.assertEqual((report['version'], report['editions_file'], report['counts']['editions'], report['counts']['own_record_editions']),
                             (2, 'edition-policy.json', 2487, 32))
            # The fixture gives every listed edition one timing-eligible record (one of them twice, and one more without a split).
            self.assertEqual((report['counts']['timing_eligible_excluded'], report['counts']['timing_eligible_own_record'], report['counts']['raw_records']), (2487, 32, 2489))
            self.assertEqual(sum(c['editions'] for c in report['counts']['by_category'].values()), 2487)
            self.assertEqual(report['policy_sha256'], policy_metadata(RELEASE_20261113_1113)['policy_sha256'])
            document = source_quality.editions_document(db, source)
            self.assertEqual((document['editions_sha256'], document['counts'], document['columns']), (report['editions_sha256'], report['counts'], source_quality.EDITION_COLUMNS))
            self.assertEqual(len(document['editions']), 2487)
            published = source / 'edition-policy.json'
            published.write_text(json.dumps(document, ensure_ascii=False))
            editions = source_quality.published_editions(report, published)
            self.assertEqual(source_quality.canonical_sha256(editions), report['editions_sha256'])
            self.assertEqual([(e['city'], e['year'], e['category'], e['reason']) for e in editions], RULES_20261113_1113)
            meta = {'input_export_id': RELEASE_20261113_1113, 'cohort': counts, 'source_quality': report, 'source_quality_script_sha256': report['script_sha256']}
            validate_source_quality(meta, published)
            # A report that carries the list itself is refused for this release; so is a list for an earlier one.
            with self.assertRaisesRegex(AssertionError, 'wrong place'):
                validate_source_quality({**meta, 'source_quality': {**report, 'editions': editions}}, published)
            # The published file must be the one the output was built with: a changed count, reason or flag, or a file of
            # another policy, is refused; and the sums still have to reconcile with the cohort.
            for change, message in ((lambda d: d['editions'][0].__setitem__(7, d['editions'][0][7] + 1), 'does not hash'),
                                    (lambda d: d['reasons'].__setitem__(0, d['reasons'][0] + ' '), 'does not hash'),
                                    (lambda d: d['editions'][0].__setitem__(4, not d['editions'][0][4]), 'does not hash'),
                                    (lambda d: d.__setitem__('policy_sha256', '0' * 64), 'not the edition list this output was built with'),
                                    (lambda d: d.__setitem__('columns', d['columns'][::-1]), 'other columns')):
                other = copy.deepcopy(document)
                change(other)
                published.write_text(json.dumps(other, ensure_ascii=False))
                with self.assertRaisesRegex(AssertionError, message):
                    validate_source_quality(meta, published)
            published.write_text(json.dumps(document, ensure_ascii=False))
            with self.assertRaisesRegex(AssertionError, 'do not reconcile'):
                validate_source_quality({**meta, 'cohort': {**counts, 'source_quality_excluded': counts['source_quality_excluded'] - 1}}, published)
            with self.assertRaisesRegex(AssertionError, 'counts'):
                validate_source_quality({**meta, 'source_quality': {**report, 'counts': {**report['counts'], 'editions': 2486}}}, published)
        # An earlier release still carries its list in every output.
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); db = fixture(source, RELEASE_MASTER_20261103B, RULES_MASTER_20261103B)
            counts = prepare(db, source, keep_record_id=True)
            report = source_quality_report(db, source)
            self.assertEqual((report['version'], len(report['editions']), 'counts' in report), (1, 39, False))
            validate_source_quality({'input_export_id': RELEASE_MASTER_20261103B, 'cohort': counts, 'source_quality': report,
                                     'source_quality_script_sha256': report['script_sha256']})

    def test_a_frozen_policy_file_that_changed_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            other = Path(folder) / 'edition-policy.json'
            other.write_bytes(source_quality.POLICY_FILE_20261113_1113.read_bytes() + b'\n')
            with self.assertRaisesRegex(RuntimeError, 'not the reviewed edition policy'):
                source_quality.frozen_policy(other, source_quality.POLICY_FILE_SHA256_20261113_1113, RELEASE_20261113_1113)
        with self.assertRaisesRegex(RuntimeError, 'another release'):
            source_quality.frozen_policy(source_quality.POLICY_FILE_20261113_1113, source_quality.POLICY_FILE_SHA256_20261113_1113, RELEASE_1050)

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
