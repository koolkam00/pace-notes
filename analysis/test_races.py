"""analysis/build_races.py on a small made-up release: page types by rule, the floors, the finish-time universe, the
readings, flags, aliases, duplicate rulings, the refusals, and that no runner detail reaches a published file."""
import contextlib
import copy
import csv
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_races as br  # noqa: E402
import races_common as rc  # noqa: E402

TAG = 'pace-notes-marathon-half-20990101-0000'
EVIDENCE = 'docs/evidence/2099-01-01/release-20990101-0000'
REASONS = {'finish_time_only': 'Finish times only.', 'held_for_review': 'Held for review.', 'unverified': 'No independent count.',
           'partial_coverage': 'Partial, outside the band.', 'selected_field': 'A selected field.'}
# label, slug, name, place, registry flags, labelled_by, then editions:
# (year, tier, split tier, rows, rows without a finish, use or policy category, official count, share of rows with no recorded sex in percent)
RACES = [
    ('Alpha', 'alpha', 'Alpha Marathon', 'Alpha', [], 'plain key', [
        (2019, 'stamped', 'splits', 120, 0, 'counted', 120, 0),
        (2020, 'stamped', 'splits', 130, 5, 'counted', 125, 0),
        (2021, 'partial', 'splits', 140, 0, 'counted', 141, 0),          # within 5% of the official count
        (2022, 'partial', 'splits', 150, 0, 'partial_coverage', 300, 0),  # outside it: no number
        (2023, 'unverified', 'splits', 160, 0, 'unverified', None, 0)]),
    ('Berlin', 'berlin', 'Berlin Marathon', 'Berlin', [], 'plain key', [
        (2024, 'unverified', 'splits', 130, 0, 'own_record', None, 0)]),
    ('Gamma City', 'gamma-city', 'Gamma City Marathon', 'Gamma City, GC', ['platform_prefix'], 'reviewed label', [
        (2018, 'stamped_weaker_source', 'finish_time_only', 1500, 20, 'finish_time_only', 1480, 0),
        (2019, 'stamped_weaker_source', 'finish_time_only', 1200, 0, 'finish_time_only', 1200, 15),   # sex missing for 15%: no share
        (2020, 'stamped_weaker_source', 'finish_time_only', 400, 0, 'finish_time_only', 400, 0),
        (2021, 'held_for_review', 'finish_time_only', 50, 0, 'held_for_review', None, 0),
        (2022, 'stamped', 'finish_time_only', 101, 2, 'finish_time_only', 99, 0)]),                   # 99 finishes: under the floor
    ('Delta Half & 10K', 'delta-half-10k', 'Delta Half & 10K', 'Delta', ['no_marathon_word_in_title', 'other_event_in_title'], 'name', [
        (2018, 'stamped_weaker_source', 'finish_time_only', 1050, 0, 'finish_time_only', 1050, 0),
        (2019, 'stamped_weaker_source', 'finish_time_only', 1050, 0, 'finish_time_only', 1050, 0),
        (2020, 'stamped_weaker_source', 'finish_time_only', 1050, 0, 'finish_time_only', 1050, 0)]),
    ('Epsilon Marathon', 'epsilon-marathon', 'Epsilon Marathon', None, [], 'name', [
        (2018, 'unverified', 'finish_time_only', 30, 0, 'finish_time_only', None, 0),
        (2019, 'stamped', 'splits', 110, 0, 'selected_field', 110, 0)]),                              # stamped, but a selected field: outside the universe
    ('Zeta', 'zeta', 'New Zeta Marathon', 'Zeta', ['several_race_names'], 'plain key', [
        (2015, 'stamped', 'finish_time_only', 620, 0, 'finish_time_only', 620, 0),
        (2016, 'stamped', 'finish_time_only', 620, 0, 'finish_time_only', 620, 0),
        (2017, 'stamped', 'finish_time_only', 620, 0, 'finish_time_only', 620, 0),
        (2018, 'stamped', 'finish_time_only', 620, 0, 'finish_time_only', 620, 0),
        (2019, 'stamped', 'finish_time_only', 620, 0, 'finish_time_only', 620, 0),
        (2020, 'unverified', 'finish_time_only', 620, 0, 'finish_time_only', None, 0)]),
]
SERIES = [{'name': 'Old Zeta Marathon', 'first_year': 2015, 'last_year': 2017}, {'name': 'New Zeta Marathon', 'first_year': 2018, 'last_year': 2020}]


def finish(label, year, i):
    """A made-up finish in whole seconds: the same rule for the fixture and for the expectations."""
    return 9000 + 13 * i + 7 * (year % 10) + len(label)


def linear_quantile(values, q):
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def clock(seconds):
    return f'{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}'


class Fixture:
    """A small made-up repository: an adapted folder, registry, policy, notes and evidence that agree with each other, laid
    out as the real one is (so scripts/verify-races.cjs can read it with --root). Change a part, write() again, and the
    digests follow."""

    def __init__(self, tmp):
        self.root = Path(tmp)
        self.source = self.root / 'input' / 'full'
        self.source.mkdir(parents=True)
        self.p = {'release': self.root / 'analysis' / 'release.json', 'registry': self.root / 'analysis' / 'race-registry.json',
                  'notes': self.root / 'analysis' / 'race-notes.json', 'policy': self.root / 'analysis' / 'edition-policy-20990101-0000.json',
                  'published': self.root / 'public' / 'data' / 'edition-policy.json', 'audit': self.root / EVIDENCE / 'duplicate-editions.json',
                  'sensitivity': self.root / EVIDENCE / 'cohort-sensitivity.json', 'facts': self.root / EVIDENCE / 'edition-policy-review.json',
                  'cohort': self.root / 'analysis' / 'marathon-cohort' / 'manifest.json'}
        self.out = self.root / 'public' / 'data' / 'races'
        self.races = copy.deepcopy(RACES)
        self.notes = {'schema_version': 1, 'tag': TAG, 'reviewed': '2099-01-01',
                      'evidence': {'duplicate_editions': f'{EVIDENCE}/duplicate-editions.json', 'cohort_sensitivity': f'{EVIDENCE}/cohort-sensitivity.json',
                                   'edition_facts': f'{EVIDENCE}/edition-policy-review.json'},
                      'flags': [], 'clears': [], 'page_rulings': [], 'aliases': [], 'duplicate_editions': [], 'set_aside_editions': [], 'edition_notes': []}
        self.audit_pairs = []
        self.series = {'Zeta': SERIES}
        self.hold_notes = {('Alpha', 2022): 'Re-pull on hold (source 403)'}
        self.timing = {('Alpha', 2019): 'chip', ('Alpha', 2020): 'gun', ('Gamma City', 2018): 'chip (clock if no chip)'}
        self.source_types = {}
        self.records_written = False

    def rows(self):
        for label, slug, name, place, flags, labelled_by, editions in self.races:
            for year, tier, split, n, unfinished, use, official, unsexed in editions:
                yield label, slug, name, year, tier, split, n, unfinished, use, official, unsexed

    RECORDS = {}   # the records file of each set of races, written once per test run

    def write_records(self):
        key = repr(self.races)
        if key not in Fixture.RECORDS:
            listing = self.root / 'records.csv'
            with listing.open('w', newline='') as stream:
                writer, rid = csv.writer(stream), 0
                for label, _, _, year, _, _, n, unfinished, _, _, unsexed in self.rows():
                    for i in range(n):
                        rid += 1
                        sex = '' if i * 100 < unsexed * n else 'X' if i == 1 and n > 500 else 'F' if i % 3 == 0 else 'M'
                        writer.writerow([rid, label, year, f'Qqfixture Runnerzz{rid}', sex, '' if i >= n - unfinished else clock(finish(label, year, i))])
            db = duckdb.connect()
            columns = "{'id': 'BIGINT', 'city': 'VARCHAR', 'year': 'BIGINT', 'runner': 'VARCHAR', 'sex': 'VARCHAR', 'split_42_2km': 'VARCHAR'}"
            db.execute(f"""COPY (SELECT * FROM read_csv('{rc.quote(listing)}', header = false, columns = {columns}, nullstr = ''))
                TO '{rc.quote(self.source / 'race_records.parquet')}' (FORMAT PARQUET)""")
            db.close()
            listing.unlink()
            Fixture.RECORDS[key] = (self.source / 'race_records.parquet').read_bytes()
        (self.source / 'race_records.parquet').write_bytes(Fixture.RECORDS[key])
        self.records_written = True

    def write(self):
        if not self.records_written:
            self.write_records()
        dump = lambda path, value: (path.parent.mkdir(parents=True, exist_ok=True), path.write_text(json.dumps(value)))  # noqa: E731
        editions, counted, listed = [], [], []
        for label, slug, name, year, tier, split, n, unfinished, use, official, _ in self.rows():
            editions.append({
                'city': label, 'year': year, 'race': name, 'race_id': slug, 'release_city': f'Somewhere: {name}', 'n_records': n, 'n_finishes': n - unfinished,
                'rows_in_release': n, 'finishes_in_release': n - unfinished, 'official_finishers': None if official is None else float(official),
                'official_source_type': self.source_types.get((label, year), 'stats_site (a race summary)' if official is not None else 'sometimer result rows (internal only)'),
                'verification_tier': tier, 'verified_badge': tier in br.BADGE_TIERS, 'weaker_source': tier == 'stamped_weaker_source',
                'split_tier': split, 'release_note': None, 'hold_note': self.hold_notes.get((label, year)),
                'timing_basis': self.timing.get((label, year)), 'race_date': None, 'race_date_source': None})
            if use == 'counted':
                counted.append([label, year])
            else:
                category = 'unverified' if use == 'own_record' else use
                listed.append({'city': label, 'year': year, 'category': category, 'reason': REASONS[category], 'rule': 'x', 'own_record': use == 'own_record'})
        dump(self.source / 'EDITIONS.json', {'tag': TAG, 'editions': editions, 'not_written': []})
        manifest = {'created_at': '2099-01-01T00:00:00Z', 'files': {name: {'sha256': rc.file_sha256(self.source / name)} for name in br.MEMBERS}}
        dump(self.source / 'MANIFEST.json', manifest)
        manifest_sha = rc.file_sha256(self.source / 'MANIFEST.json')
        dump(self.source / 'provenance.json', {'release_tag': TAG, 'manifest_sha256': manifest_sha})
        dump(self.p['release'], {'tag': TAG})
        registry = {'tag': TAG, 'distance': 'marathon', 'races': []}
        for label, slug, name, place, flags, labelled_by, own in sorted(self.races, key=lambda r: r[1]):
            race = {'race_id': slug, 'slug': slug, 'label': label, 'name': name, 'place': place, 'keys': [f'Somewhere: {name}'], 'flags': flags,
                    'labelled_by': labelled_by, 'first_year': min(e[0] for e in own), 'last_year': max(e[0] for e in own), 'editions': len(own),
                    'rows': sum(e[3] for e in own)}
            if label in self.series:
                race['series'] = self.series[label]
            registry['races'].append(race)
        dump(self.p['registry'], registry)
        policy = {'tag': TAG, 'inputs': {'adapted_manifest_sha256': manifest_sha, 'race_registry_sha256': rc.file_sha256(self.p['registry'])},
                  'expected': {'editions_with_rows': len(editions)}, 'counted': counted, 'editions': listed}
        dump(self.p['policy'], policy)
        policy_sha = rc.file_sha256(self.p['policy'])
        # What the verifier reads beside the family's own inputs: the pinned policy digest, the scripts, the cohort manifest.
        (self.root / 'analysis' / 'source_quality.py').write_text(f"POLICY_FILE_SHA256_20990101_0000 = '{policy_sha}'\n")
        for name in ('build_races.py', 'races_common.py', 'races_duplicates.py'):
            shutil.copyfile(rc.ANALYSIS / name, self.root / 'analysis' / name)
        eligible = sum(n - unfinished for *_, n, unfinished, use, _, _ in self.rows() if use == 'counted')
        held = [e for e in editions if [e['city'], e['year']] in counted or any(x['city'] == e['city'] and x['year'] == e['year'] and x['own_record'] for x in listed)]
        dump(self.p['cohort'], {
            'release_tag': TAG, 'input_manifest_sha256': manifest_sha, 'eligible_records': eligible,
            'editions': [{'city': e['city'], 'year': e['year'], 'raw': e['n_records'], 'use': 'counted' if [e['city'], e['year']] in counted else 'own_record',
                          'tier': e['verification_tier'], 'timing_basis': e['timing_basis']} for e in held],
            'other_editions': {'columns': ['city', 'year', 'raw', 'category'],
                               'rows': [[x['city'], x['year'], next(e['n_records'] for e in editions if (e['city'], e['year']) == (x['city'], x['year'])), x['category']]
                                        for x in listed if not x['own_record']]}})
        dump(self.p['published'], {
            'release_tag': TAG, 'input_manifest_sha256': manifest_sha, 'cohort': {'eligible': eligible},
            'columns': ['city', 'year', 'category', 'reason', 'own_record', 'raw_records', 'deduplicated_records', 'timing_eligible_excluded'],
            'editions': [[e['city'], e['year'], e['category'], 0, e['own_record'], 1, 1, 0] for e in listed]})
        reading = {'eligible_finishes': eligible, 'eligible_editions': len(counted), 'eligible_cities': len({c for c, _ in counted}), 'sustained_slowdown': 100,
                   'sustained_slowdown_pct': 25.0}
        dump(self.p['sensitivity'], {
            'release_tag': TAG, 'input_manifest_sha256': manifest_sha, 'frozen_policy_sha256': policy_sha,
            'readings': {'policy': reading, 'verified_tiers_only': {**reading, 'eligible_editions': 2}, 'without_weaker_source_editions': reading},
            'policy_by_tier': {'stamped': {**reading, 'eligible_editions': 2}}})
        dump(self.p['audit'], {
            'release_tag': TAG, 'input_manifest_sha256': manifest_sha,
            'scripts': {f'analysis/{name}': rc.file_sha256(rc.ANALYSIS / name) for name in ('races_common.py', 'races_duplicates.py')},
            'pairs': [{'a': {'city': a[0], 'year': a[1]}, 'b': {'city': b[0], 'year': b[1]}} for a, b in self.audit_pairs]})
        dump(self.p['facts'], {'tag': TAG, 'frozen_policy_sha256': policy_sha, 'editions': [
            {'city': label, 'year': year, 'tier': tier, 'split_tier': split, 'rows': n, 'finishes': n - unfinished, 'finishes_in_release': n - unfinished,
             'official_finishers': None if official is None else float(official), 'counted': use == 'counted',
             'category': None if use == 'counted' else 'unverified' if use == 'own_record' else use, 'own_record': use == 'own_record'}
            for label, _, _, year, tier, split, n, unfinished, use, official, _ in self.rows()]})
        dump(self.p['notes'], self.notes)
        return self

    def kwargs(self):
        return dict(release_path=self.p['release'], registry_path=self.p['registry'], notes_path=self.p['notes'], policy_path=self.p['policy'],
                    published_policy_path=self.p['published'], root=self.root)

    def load(self):
        return br.load_inputs(self.source, **self.kwargs())

    def build(self):
        files, built = br.build(self.write().load())
        return {name: (json.loads(data) if name.endswith('.json') else data) for name, data in files.items()}, built, files


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(br, 'COURSE_SLUGS_BEFORE', ('berlin',))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.fx = Fixture(self.tmp.name)

    def refused(self, words):
        with self.assertRaises(rc.RacesError) as caught:
            self.fx.build()
        self.assertIn(words, str(caught.exception))


class Build(Base):
    @classmethod
    def setUpClass(cls):
        cls.shared = tempfile.TemporaryDirectory()
        with mock.patch.object(br, 'COURSE_SLUGS_BEFORE', ('berlin',)):
            cls.files, cls.built, cls.raw = Fixture(cls.shared.name).build()
        cls.directory = {race['label']: race for race in cls.files['directory.json']['races']}

    @classmethod
    def tearDownClass(cls):
        cls.shared.cleanup()

    def test_page_types_by_rule(self):
        self.assertEqual({label: race['page'] for label, race in self.directory.items()}, {
            'Alpha': 'course',              # three counted editions
            'Berlin': 'course',             # a course page the site had, whatever it has left
            'Gamma City': 'results',        # three badge-verified editions of 100 results, 3,000 results in all
            'Delta Half & 10K': 'row',      # the numbers of a results page, withheld by its flag
            'Epsilon Marathon': 'row', 'Zeta': 'results'})
        self.assertEqual(self.directory['Delta Half & 10K']['withheld'], 'results')
        self.assertEqual(self.directory['Delta Half & 10K']['flags'], ['not_a_marathon_title'])
        self.assertEqual({label: race.get('slug') for label, race in self.directory.items()},
                         {'Alpha': 'alpha', 'Berlin': 'berlin', 'Gamma City': 'gamma-city', 'Delta Half & 10K': None, 'Epsilon Marathon': None, 'Zeta': 'zeta'})
        self.assertEqual(self.built['counts']['pages'], {'course': 2, 'results': 2, 'row': 2})
        self.assertEqual(sorted(name for name in self.files if name.startswith('race/')), ['race/alpha.json', 'race/berlin.json', 'race/gamma-city.json', 'race/zeta.json'])

    def test_the_directory_lists_every_edition_once_as_a_compact_row(self):
        directory = self.files['directory.json']
        self.assertEqual(directory['edition_columns'], ['year', 'tier', 'split_tier', 'results', 'finishes', 'use', 'category', 'timing', 'review'])
        listed = [(race['label'], row[0]) for race in directory['races'] for row in race['editions']]
        self.assertEqual(sorted(listed), sorted((label, e[0]) for label, *_, editions in RACES for e in editions))
        self.assertEqual(len(listed), len(set(listed)))
        codes = directory['codes']
        row = dict(zip(directory['edition_columns'], self.directory['Alpha']['editions'][1]))
        self.assertEqual((row['year'], codes['tier'][row['tier']], codes['split_tier'][row['split_tier']], row['results'], row['finishes'],
                          codes['use'][row['use']], row['category'], codes['timing'][row['timing']], codes['review'][row['review']]),
                         (2020, 'stamped', 'splits', 130, 125, 'counted', None, 'gun', 'none'))
        last = dict(zip(directory['edition_columns'], self.directory['Alpha']['editions'][3]))
        self.assertEqual((codes['use'][last['use']], codes['category'][last['category']]), ('recorded_times_only', 'partial_coverage'))
        self.assertEqual(codes['use'][dict(zip(directory['edition_columns'], self.directory['Berlin']['editions'][0]))['use']], 'own_record')
        self.assertEqual((self.directory['Alpha']['years'], self.directory['Alpha']['results'], self.directory['Alpha']['finishes']), ([2019, 2023], 700, 695))
        self.assertEqual([race['label'] for race in directory['races']], ['Alpha', 'Berlin', 'Delta Half & 10K', 'Epsilon Marathon', 'Gamma City', 'Zeta'])   # registry order

    def test_official_counts_coverage_and_notes_stay_out_of_page_files(self):
        for name, data in self.raw.items():
            if name in ('editions.csv', 'summary.json'):
                continue
            text = data.decode()
            for banned in ('official', 'coverage_pct', 'hold_note', 'Re-pull', 'release_note', '"reason'):
                self.assertNotIn(banned, text, f'{name} holds {banned}')
        self.assertEqual(self.files['summary.json']['notes']['hold'], [{'label': 'Alpha', 'year': 2022, 'tier': 'partial', 'note': 'Re-pull on hold (source 403)'}])

    def test_edition_numbers_only_in_the_universe_and_over_the_floor(self):
        alpha = {row['year']: row for row in self.files['race/alpha.json']['editions']}
        times = [finish('Alpha', 2019, i) for i in range(120)]
        self.assertEqual((alpha[2019]['finishes'], alpha[2019]['median_s'], alpha[2019]['p25_s'], alpha[2019]['p75_s']),
                         (120, linear_quantile(times, .5), linear_quantile(times, .25), linear_quantile(times, .75)))
        self.assertEqual(alpha[2019]['women'], {'n': 40, 'of': 120, 'share': round(40 / 120, 4)})
        self.assertEqual(alpha[2020]['finishes'], 125)                                    # five rows without a finish
        self.assertEqual(alpha[2020]['median_s'], linear_quantile([finish('Alpha', 2020, i) for i in range(125)], .5))
        self.assertTrue(alpha[2021]['in_universe'])                                       # partial, within 5% of the official count
        for year in (2022, 2023):                                                          # partial outside the band; unverified
            self.assertEqual(alpha[year], {'year': year, 'tier': alpha[year]['tier'], 'split_tier': 'splits', 'results': 150 if year == 2022 else 160,
                                           'use': 'recorded_times_only', 'timing': 'not_stated', 'in_universe': False, 'category': alpha[year]['category']})
        gamma = {row['year']: row for row in self.files['race/gamma-city.json']['editions']}
        self.assertEqual((gamma[2018]['finishes'], gamma[2018]['women']['of']), (1480, 1479))   # one finish recorded as X
        self.assertIsNone(gamma[2019]['women'])                                            # sex recorded for 85% of the finishes
        self.assertIn('median_s', gamma[2019])
        self.assertEqual((gamma[2022]['in_universe'], gamma[2022]['finishes']), (True, 99))
        self.assertNotIn('median_s', gamma[2022])                                          # 99 finishes: under the floor of 100
        self.assertNotIn('women', gamma[2022])
        self.assertNotIn('finishes', gamma[2021])                                          # held for review: outside the universe
        self.assertEqual(self.files['race/berlin.json']['editions'], [{'year': 2024, 'tier': 'unverified', 'split_tier': 'splits', 'results': 130, 'use': 'own_record',
                                                                       'timing': 'not_stated', 'in_universe': False, 'category': 'unverified'}])
        self.assertEqual(self.built['counts']['editions_with_numbers'], 3 + 3 + 5)
        self.assertEqual(self.built['counts']['universe_editions'], 3 + 4 + 3 + 5)

    def test_the_reading_needs_three_verified_editions_of_100_finishes(self):
        gamma = self.files['race/gamma-city.json']
        medians = [linear_quantile([finish('Gamma City', year, i) for i in range(n)], .5) for year, n in ((2018, 1480), (2019, 1200), (2020, 400))]
        self.assertEqual(gamma['reading'], {'measure': 'median_finish_in_a_typical_verified_year', 'median_s': sorted(medians)[1], 'editions': 3, 'years': [2018, 2019, 2020],
                                            'lowest_s': min(medians), 'highest_s': max(medians), 'finishes': 1480 + 1200 + 400, 'timing': {'net': 1, 'not_stated': 2}})
        self.assertIsNone(gamma['reading_note'])
        alpha = self.files['race/alpha.json']                                              # two stamped editions and a partial one: the partial one is not badge-verified
        self.assertEqual((alpha['reading'], alpha['reading_note']), (None, 'fewer_than_three_verified_editions_of_100_finishes'))
        self.assertEqual(self.files['race/berlin.json']['reading'], None)

    def test_a_label_with_a_series_note_reads_per_series(self):
        zeta = self.files['race/zeta.json']
        self.assertEqual((zeta['reading'], zeta['reading_note']), (None, 'per_series'))
        old, new = zeta['series']
        self.assertEqual((old['name'], old['years'], old['reading']['editions'], old['reading']['years']), ('Old Zeta Marathon', [2015, 2016, 2017], 3, [2015, 2016, 2017]))
        self.assertEqual((new['name'], new['years'], new['reading']), ('New Zeta Marathon', [2018, 2019, 2020], None))   # two verified editions and an unverified one

    def test_the_summary_counts_what_the_directory_lists(self):
        summary, directory = self.files['summary.json'], self.files['directory.json']
        rows = [row for race in directory['races'] for row in race['editions']]
        self.assertEqual(summary['races']['total']['n'], len(directory['races']))
        self.assertEqual((summary['editions']['total']['n'], summary['editions']['total']['results'], summary['editions']['total']['finishes']),
                         (len(rows), sum(row[3] for row in rows), sum(row[4] for row in rows)))
        self.assertEqual(sum(cell['editions'] for cell in summary['editions']['by_tier_and_split_tier']), len(rows))
        self.assertEqual(summary['editions']['by_tier']['stamped_weaker_source'], {'races': 2, 'editions': 6, 'results': 1500 + 1200 + 400 + 3 * 1050, 'finishes': 1480 + 1200 + 400 + 3 * 1050})
        self.assertEqual(summary['editions']['by_split_tier']['splits']['races'], 3)   # Alpha, Berlin and Epsilon
        self.assertEqual(summary['editions']['badge_verified']['editions'], sum(1 for *_, editions in RACES for e in editions if e[1] in br.BADGE_TIERS))
        self.assertEqual(summary['races']['by_page'], {'course': 2, 'results': 2, 'row': 2})
        self.assertEqual((summary['counted']['editions'], summary['counted']['races'], summary['counted']['finishes']), (3, 1, 120 + 125 + 140))
        self.assertEqual(summary['sensitivity']['verified_tiers_only']['editions'], 2)
        self.assertEqual(summary['editions']['by_use']['own_record']['editions'], 1)
        self.assertEqual(summary['words']['tier']['stamped_weaker_source'], 'Verified, weaker source')
        self.assertTrue(all('what' in summary[key] for key in ('counted', 'finish_time_universe', 'duplicates', 'notes')))

    def test_the_edition_table_for_download(self):
        rows = list(csv.DictReader(io.StringIO(self.files['editions.csv'].decode())))
        self.assertEqual(len(rows), sum(len(editions) for *_, editions in RACES))
        self.assertEqual(list(rows[0]), list(br.CSV_COLUMNS))
        row = next(r for r in rows if (r['race'], r['year']) == ('Alpha', '2022'))
        self.assertEqual((row['tier_in_words'], row['official_count'], row['official_count_source'], row['coverage_pct'], row['use_in_words'], row['not_counted_category'],
                          row['reason_not_counted'], row['hold_note'], row['release_key']),
                         ('Partial results', '300', 'A statistics site', '50.0', 'Recorded times only', 'partial_coverage', 'Partial, outside the band.',
                          'Re-pull on hold (source 403)', 'Somewhere: Alpha Marathon'))
        none = next(r for r in rows if (r['race'], r['year']) == ('Berlin', '2024'))
        self.assertEqual((none['official_count'], none['official_count_source'], none['use_in_words'], none['split_tier_in_words']),
                         ('', br.NO_INDEPENDENT_COUNT, 'Own-record view', 'Checkpoint times'))

    def test_no_runner_detail_reaches_a_published_file(self):
        for name, data in self.raw.items():
            text = data.decode().lower()
            self.assertNotIn('qqfixture', text, name)
            self.assertNotIn('runnerzz', text, name)
        with self.assertRaises(rc.RacesError):
            br.check_published({'editions': [{'record_id': 7}]}, 'x')
        with self.assertRaises(rc.RacesError):
            br.check_published({'note': 'see p51_0000001'}, 'x')

    def test_the_manifest_binds_every_input_and_file(self):
        fx = self.fx
        inputs = fx.write().load()
        files, built = br.build(inputs)
        meta = br.manifest(inputs, files, built)
        self.assertEqual(sorted(meta['files']), sorted(files))
        self.assertEqual(meta['files']['directory.json'], {'bytes': len(files['directory.json']), 'sha256': rc.bytes_sha256(files['directory.json'])})
        self.assertEqual(meta['input']['manifest_sha256'], rc.file_sha256(fx.source / 'MANIFEST.json'))
        self.assertEqual((meta['policy']['sha256'], meta['registry']['sha256'], meta['notes']['sha256']),
                         tuple(rc.file_sha256(fx.p[name]) for name in ('policy', 'registry', 'notes')))
        self.assertEqual((meta['policy']['file'], meta['policy']['published_list']['file'], meta['registry']['file'], meta['notes']['file'], meta['evidence']['duplicate_editions']['file']),
                         ('analysis/edition-policy-20990101-0000.json', 'public/data/edition-policy.json', 'analysis/race-registry.json', 'analysis/race-notes.json',
                          f'{EVIDENCE}/duplicate-editions.json'))
        self.assertEqual(sorted(meta['evidence']), ['cohort_sensitivity', 'duplicate_editions', 'edition_facts'])
        self.assertEqual(sorted(meta['scripts']), ['analysis/build_races.py', 'analysis/races_common.py'])
        self.assertEqual(meta['review']['pages_without_a_reviewed_label'], [])
        self.assertEqual(meta['review']['flagged_races'], [{'label': 'Delta Half & 10K', 'flags': ['not_a_marathon_title'], 'withheld': 'results', 'editions': 3, 'results': 3150}])
        self.assertEqual(meta['review']['course_pages_before'], [{'slug': 'berlin', 'label': 'Berlin', 'editions': 1, 'counted_editions': 0, 'own_record_editions': 1,
                                                                 'universe_editions': 0, 'results': 130}])
        again, _ = br.build(fx.load())
        self.assertEqual(files, again)                                                     # two builds, the same bytes

    def test_write_and_the_count_gate(self):
        fx = self.fx.write()
        out = fx.root / 'out'
        kwargs = fx.kwargs()
        with mock.patch.object(br, 'log', lambda *_: None):
            meta = br.run(fx.source, out, **kwargs)
            (out / 'race' / 'stale.json').write_text('{}')
            self.assertEqual(br.run(fx.source, out, **kwargs), meta)
            self.assertFalse((out / 'race' / 'stale.json').exists())                       # a race file no build writes is removed
            for name, entry in meta['files'].items():
                self.assertEqual(rc.file_sha256(out / name), entry['sha256'])
            fx.races[4][6].append((2020, 'unverified', 'finish_time_only', 20, 0, 'finish_time_only', None, 0))   # one more edition
            fx.records_written = False
            fx.write()
            with contextlib.redirect_stderr(io.StringIO()) as printed:
                with self.assertRaises(rc.RacesError):
                    br.run(fx.source, out, **kwargs)
                self.assertEqual(br.run(fx.source, out, accept_counts=True, **kwargs)['counts']['editions'], meta['counts']['editions'] + 1)
            self.assertIn('editions: 22 -> 23', printed.getvalue())


class Rulings(Base):
    def test_a_pending_pair_is_marked_and_changes_nothing_else(self):
        plain, _, _ = self.fx.build()
        self.fx.audit_pairs = [(('Gamma City', 2019), ('Gamma City', 2020))]
        self.refused('not the audit’s list')
        self.fx.notes['duplicate_editions'] = [{'editions': [['Gamma City', 2020], ['Gamma City', 2019]], 'ruling': 'pending', 'set_aside': None}]
        files, built, _ = self.fx.build()
        gamma = {row[0]: row for row in next(r for r in files['directory.json']['races'] if r['label'] == 'Gamma City')['editions']}
        self.assertEqual([gamma[year][8] for year in (2018, 2019, 2020)], [0, 1, 1])
        self.assertEqual(files['summary.json']['duplicates'], {**files['summary.json']['duplicates'], 'pairs_listed_by_the_audit': 1, 'pairs_pending': 1,
                                                               'editions_set_aside': 0, 'results_set_aside': 0})
        self.assertEqual(files['summary.json']['editions'], plain['summary.json']['editions'])
        self.assertEqual(files['race/gamma-city.json']['reading'], plain['race/gamma-city.json']['reading'])

    def test_an_edition_set_aside_as_a_copy_counts_toward_nothing(self):
        self.fx.audit_pairs = [(('Gamma City', 2019), ('Gamma City', 2020))]
        ruling = {'editions': [['Gamma City', 2019], ['Gamma City', 2020]], 'ruling': 'set_aside', 'set_aside': ['Gamma City', 2020]}
        self.fx.notes['duplicate_editions'] = [ruling]
        self.refused('needs ruled_by, ruled_on and the words')
        ruling.update(ruled_by='lead', ruled_on='2099-01-02', words='Set the 2020 list aside.')
        self.refused('set_aside_editions is not what the rulings')                         # the list another builder reads must say the same
        listed = {'label': 'Gamma City', 'year': 2020, 'kept': {'label': 'Gamma City', 'year': 2019}, 'reason': 'one_list_two_years'}
        self.fx.notes['set_aside_editions'] = [listed]
        files, built, _ = self.fx.build()
        gamma = next(r for r in files['directory.json']['races'] if r['label'] == 'Gamma City')
        self.assertEqual((gamma['page'], gamma['results'], [row[8] for row in gamma['editions']]), ('row', 1500 + 1200 + 50 + 101, [0, 0, 2, 0, 0]))   # under 3,000 results without the copy
        self.assertEqual((files['directory.json']['set_aside_editions'], files['directory.json']['left_out'], gamma['years']), ([listed], [], [2018, 2022]))
        row = next(r for r in csv.DictReader(io.StringIO(files['editions.csv'].decode())) if (r['race'], r['year']) == ('Gamma City', '2020'))
        self.assertEqual((row['review'], row['copy_of_race'], row['copy_of_year']), ('Set aside as a copy', 'Gamma City', '2019'))
        self.assertNotIn('race/gamma-city.json', files)
        self.assertEqual((files['summary.json']['duplicates']['editions_set_aside'], files['summary.json']['duplicates']['results_set_aside']), (1, 400))
        self.assertEqual(files['summary.json']['editions']['total']['n'], sum(len(e) for *_, e in RACES) - 1)
        self.assertEqual(sum(len(r['editions']) for r in files['directory.json']['races']), sum(len(e) for *_, e in RACES))   # still listed
        ruling['set_aside'] = ['Gamma City', 2018]
        self.refused('must set aside one of its two editions')
        ruling.update(ruling='keep_both', set_aside=None)
        self.refused('set_aside_editions is not what the rulings')
        self.fx.notes['set_aside_editions'] = []
        self.fx.notes['edition_notes'] = [{'label': 'Gamma City', 'year': 2019, 'note': 'repeated_finish_times'}, {'label': 'Gamma City', 'year': 2020, 'note': 'repeated_finish_times'}]
        files, _, _ = self.fx.build()
        self.assertEqual(next(r for r in files['directory.json']['races'] if r['label'] == 'Gamma City')['page'], 'results')
        self.assertEqual(files['summary.json']['duplicates']['pairs_kept_as_two_editions'], 1)
        noted = [r['reviewed_note'] for r in csv.DictReader(io.StringIO(files['editions.csv'].decode())) if r['race'] == 'Gamma City']
        self.assertEqual(noted, ['', 'repeated_finish_times', 'repeated_finish_times', '', ''])
        self.assertNotIn('repeated_finish_times', self.fx.build()[2]['race/gamma-city.json'].decode())    # no mark in a page file beyond the tier
        self.fx.notes['edition_notes'].append({'label': 'Alpha', 'year': 2019, 'note': 'repeated_finish_times'})
        self.refused('an edition of a pair the audit lists')

    def test_a_copy_inside_a_page_race_carries_no_number(self):
        self.fx.audit_pairs = [(('Zeta', 2015), ('Zeta', 2016))]
        self.fx.notes['duplicate_editions'] = [{'editions': [['Zeta', 2015], ['Zeta', 2016]], 'ruling': 'set_aside', 'set_aside': ['Zeta', 2016], 'ruled_by': 'lead',
                                                'ruled_on': '2099-01-02', 'words': 'The 2016 list is the 2015 list.'}]
        self.fx.notes['set_aside_editions'] = [{'label': 'Zeta', 'year': 2016, 'kept': {'label': 'Zeta', 'year': 2015}, 'reason': 'one_list_two_years'}]
        files, _, _ = self.fx.build()
        head = next(p for p in files['pages.json']['pages'] if p['label'] == 'Zeta')
        self.assertEqual((head['editions'], head['years'], head['results']), (5, [2015, 2020], 5 * 620))   # the copy is not an edition of the page
        zeta = files['race/zeta.json']
        copy_row = next(row for row in zeta['editions'] if row['year'] == 2016)
        self.assertEqual(copy_row, {'year': 2016, 'tier': 'stamped', 'split_tier': 'finish_time_only', 'results': 620, 'use': 'recorded_times_only', 'timing': 'not_stated',
                                    'in_universe': False, 'category': 'finish_time_only', 'review': 'copy', 'copy_of': {'label': 'Zeta', 'year': 2015}})
        self.assertIsNone(zeta['series'][0]['reading'])                                    # two verified editions left in the old series

    def test_a_race_with_no_live_edition_is_left_out(self):
        self.fx.races.append(('Eta Run', 'eta-run', 'Eta Run', 'Eta', [], 'name', [(2019, 'unverified', 'finish_time_only', 40, 0, 'finish_time_only', None, 0)]))
        self.fx.audit_pairs = [(('Epsilon Marathon', 2019), ('Eta Run', 2019))]
        self.fx.notes['duplicate_editions'] = [{'editions': [['Epsilon Marathon', 2019], ['Eta Run', 2019]], 'ruling': 'set_aside', 'set_aside': ['Eta Run', 2019],
                                                'ruled_by': 'lead', 'ruled_on': '2099-01-02', 'words': 'One race of one day under two keys.'}]
        self.fx.notes['set_aside_editions'] = [{'label': 'Eta Run', 'year': 2019, 'kept': {'label': 'Epsilon Marathon', 'year': 2019}, 'reason': 'one_race_two_keys'}]
        files, built, _ = self.fx.build()
        directory, summary = files['directory.json'], files['summary.json']
        self.assertNotIn('Eta Run', [r['label'] for r in directory['races']])
        self.assertEqual(directory['left_out'], [{'label': 'Eta Run', 'name': 'Eta Run', 'place': 'Eta', 'editions': [[2019, 4, 1, 40, 40, 2, 0, 3, 2]]}])
        listed = [(r['label'], row[0]) for r in directory['races'] + directory['left_out'] for row in r['editions']]
        self.assertEqual((len(listed), len(set(listed))), (sum(len(e) for *_, e in self.fx.races), sum(len(e) for *_, e in self.fx.races)))   # every edition once
        self.assertEqual((summary['races']['total']['n'], summary['races']['left_out']['n'], summary['editions']['total']['n'], built['counts']['races_left_out']),
                         (6, 1, sum(len(e) for *_, e in RACES), 1))
        self.assertEqual(built['review']['races_left_out'], ['Eta Run'])
        rows = [r for r in csv.DictReader(io.StringIO(files['editions.csv'].decode())) if r['race'] == 'Eta Run']
        self.assertEqual([(r['review'], r['copy_of_race'], r['copy_of_year'], r['reviewed_note']) for r in rows], [('Set aside as a copy', 'Epsilon Marathon', '2019', '')])

    def test_a_noted_flag_withholds_a_page_and_a_ruling_allows_it(self):
        self.fx.notes['flags'] = [{'label': 'Gamma City', 'flag': 'virtual', 'evidence': 'Every edition of this made-up race was run remotely.'}]
        files, built, _ = self.fx.build()
        gamma = next(r for r in files['directory.json']['races'] if r['label'] == 'Gamma City')
        self.assertEqual((gamma['page'], gamma['withheld'], gamma['flags'], 'slug' in gamma), ('row', 'results', ['virtual'], False))
        self.fx.notes['page_rulings'] = [{'label': 'Gamma City', 'page': 'allowed', 'ruled_by': 'lead', 'ruled_on': '2099-01-02', 'words': 'It was run in person.'}]
        files, _, _ = self.fx.build()
        gamma = next(r for r in files['directory.json']['races'] if r['label'] == 'Gamma City')
        self.assertEqual((gamma['page'], gamma.get('withheld'), gamma['flags']), ('results', None, ['virtual']))
        self.fx.notes['flags'] = [{'label': 'Gamma City', 'flag': 'virtual'}]
        self.refused('a flag needs')
        self.fx.notes['flags'] = [{'label': 'Berlin', 'flag': 'cancelled', 'evidence': 'x'}]
        self.fx.notes['page_rulings'] = []
        self.refused('needs the lead’s ruling')

    def test_an_alias_goes_to_every_race_that_states_its_word(self):
        self.fx.notes['aliases'] = [{'word': 'Gamma City', 'alias': 'Gammatown', 'evidence': 'The made-up English name of Gamma City.'},
                                    {'word': 'Zeta', 'alias': 'Zed', 'evidence': 'The made-up English name of Zeta.'}]
        files, _, _ = self.fx.build()
        self.assertEqual({r['label']: r['aliases'] for r in files['directory.json']['races'] if 'aliases' in r}, {'Gamma City': ['Gammatown'], 'Zeta': ['Zed']})
        self.assertEqual(next(p for p in files['pages.json']['pages'] if p['label'] == 'Gamma City')['aliases'], ['Gammatown'])
        self.fx.notes['aliases'] = [{'word': 'Gammastadt', 'alias': 'Gammatown', 'evidence': 'x'}]
        self.refused('which no race needs')
        self.fx.notes['aliases'] = [{'word': 'City', 'alias': 'Gamma', 'evidence': 'x'}]      # the alias is already a word of the only race that holds the word
        self.refused('which no race needs')
        self.fx.notes['aliases'] = [{'word': 'Zeta', 'alias': 'Zed'}]
        self.refused('an alias needs')

    def test_the_notes_may_clear_a_flag_the_rule_gives(self):
        self.fx.notes['clears'] = [{'label': 'Delta Half & 10K', 'flag': 'not_a_marathon_title', 'evidence': 'The made-up title names a marathon in its small print.'}]
        files, _, _ = self.fx.build()
        delta = next(r for r in files['directory.json']['races'] if r['label'] == 'Delta Half & 10K')
        self.assertEqual((delta['page'], delta.get('flags'), delta.get('withheld')), ('results', None, None))
        self.fx.notes['clears'] = [{'label': 'Gamma City', 'flag': 'virtual', 'evidence': 'x'}]
        self.refused('is not one the rule gives the race')
        self.fx.notes['clears'] = [{'label': 'Delta Half & 10K', 'flag': 'not_a_marathon_title'}]
        self.refused('a cleared flag needs')


class Refusals(Base):
    def test_inputs_that_do_not_belong_together(self):
        fx = self.fx.write()
        kwargs = fx.kwargs()

        def refused(path, change, words):
            original = path.read_text()
            value = json.loads(original)
            change(value)
            path.write_text(json.dumps(value))
            with self.assertRaises(rc.RacesError) as caught:
                br.build(br.load_inputs(fx.source, **kwargs))
            self.assertIn(words, str(caught.exception))
            path.write_text(original)
        refused(fx.p['release'], lambda v: v.update(tag='another'), 'the adopted release is')
        refused(fx.p['policy'], lambda v: v['inputs'].update(adapted_manifest_sha256='0' * 64), 'frozen on another adapted input')
        refused(fx.p['policy'], lambda v: v['inputs'].update(race_registry_sha256='0' * 64), 'another race registry')
        refused(fx.p['published'], lambda v: v.update(input_manifest_sha256='0' * 64), 'edition-policy.json was built for another')
        refused(fx.p['published'], lambda v: v['editions'].pop(), 'does not list the editions of the frozen edition policy')
        refused(fx.p['audit'], lambda v: v.update(input_manifest_sha256='0' * 64), 'run analysis/races_duplicates.py again')
        refused(fx.p['sensitivity'], lambda v: v.update(frozen_policy_sha256='0' * 64), 'cohort sensitivity evidence is for another')
        refused(fx.p['sensitivity'], lambda v: v['readings']['policy'].update(eligible_editions=9), 'counts other editions or races')
        refused(fx.p['facts'], lambda v: v['editions'][0].update(rows=1), 'disagree')
        refused(fx.p['notes'], lambda v: v.update(tag='another'), 'for another release or schema')
        refused(fx.source / 'provenance.json', lambda v: v.update(manifest_sha256='0' * 64), 'names another MANIFEST.json')
        (fx.source / 'EDITIONS.json').write_text((fx.source / 'EDITIONS.json').read_text() + ' ')
        with self.assertRaises(rc.RacesError):
            br.load_inputs(fx.source, **kwargs)

    def test_a_stale_audit_script_stops_the_build(self):
        fx = self.fx.write()
        fx.load()                                                                        # the audit names the scripts as they are
        (fx.root / 'analysis' / 'races_duplicates.py').write_text('changed')
        with self.assertRaises(rc.RacesError) as caught:
            fx.load()
        self.assertIn('changed after the duplicate-edition audit', str(caught.exception))

    def test_facts_this_family_does_not_know_stop_the_build(self):
        self.fx.timing[('Alpha', 2021)] = 'sundial'
        self.refused('TIMING_CLASS')
        del self.fx.timing[('Alpha', 2021)]
        self.fx.source_types[('Alpha', 2021)] = 'hearsay'
        self.refused('SOURCE_CLASS')
        del self.fx.source_types[('Alpha', 2021)]
        self.fx.races[0][6][0] = (2019, 'gold', 'splits', 120, 0, 'counted', 120, 0)
        self.refused('is not one this family knows')

    def test_the_universe_must_agree_with_the_policy(self):
        self.fx.races[0][6][3] = (2022, 'partial', 'splits', 150, 0, 'counted', 300, 0)    # counted, yet 50% of the official count
        self.refused('the finish-time universe leaves out')
        self.fx.races[0][6][3] = (2022, 'partial', 'splits', 150, 0, 'partial_coverage', 150, 0)   # listed as outside the band, yet inside it
        self.refused('not about its split grid')

    def test_a_course_page_the_site_had_must_stay(self):
        with mock.patch.object(br, 'COURSE_SLUGS_BEFORE', ('berlin', 'vanished')):
            self.refused("not course pages now: ['vanished']")

    def test_series_notes_are_checked(self):
        self.fx.series['Zeta'] = [SERIES[0], {**SERIES[1], 'first_year': 2017}]
        self.refused('do not overlap')
        self.fx.series['Zeta'] = [SERIES[0], {**SERIES[1], 'last_year': 2019}]
        self.refused('in none of the label’s series')


@unittest.skipUnless(shutil.which('node'), 'node is not installed')
class Verifier(unittest.TestCase):
    """scripts/verify-races.cjs on what the builder writes for a made-up repository: the two are written apart and must
    agree on every rule."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.fx = Fixture(self.tmp.name)
        # The 27 course pages the site had: the made-up release has Berlin; give each of the others one small edition.
        for slug in br.COURSE_SLUGS_BEFORE:
            if slug != 'berlin':
                label = slug.replace('-', ' ').title()
                self.fx.races.append((label, slug, f'{label} Marathon', label, [], 'plain key', [(2024, 'unverified', 'finish_time_only', 12, 0, 'finish_time_only', None, 0)]))

    def verify(self, *options):
        with mock.patch.object(br, 'log', lambda *_: None):
            br.run(self.fx.write().source, self.fx.out, accept_counts=True, **self.fx.kwargs())
        return subprocess.run(['node', str(rc.ROOT / 'scripts' / 'verify-races.cjs'), '--root', str(self.fx.root), *options], capture_output=True, text=True)

    def test_the_verifier_recounts_the_build_and_its_self_test_bites(self):
        result = self.verify('--self-test')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('checks pass', result.stdout)
        self.assertRegex(result.stdout, r'self-test: (\d+) of \1 broken copies refused')

    def test_the_verifier_follows_rulings_flags_and_aliases(self):
        fx = self.fx
        fx.races.append(('Eta Run', 'eta-run', 'Eta Run', 'Eta', [], 'name', [(2019, 'unverified', 'finish_time_only', 40, 0, 'finish_time_only', None, 0)]))
        fx.audit_pairs = [(('Epsilon Marathon', 2019), ('Eta Run', 2019)), (('Zeta', 2015), ('Zeta', 2016)), (('Gamma City', 2019), ('Gamma City', 2020)),
                          (('Delta Half & 10K', 2018), ('Delta Half & 10K', 2019))]
        ruled = dict(ruled_by='lead', ruled_on='2099-01-02', words='As the made-up lead ruled.')
        fx.notes['duplicate_editions'] = [
            {'editions': [['Epsilon Marathon', 2019], ['Eta Run', 2019]], 'ruling': 'set_aside', 'set_aside': ['Eta Run', 2019], **ruled},      # leaves a race with no live edition
            {'editions': [['Zeta', 2015], ['Zeta', 2016]], 'ruling': 'set_aside', 'set_aside': ['Zeta', 2016], **ruled},                         # a copy inside a page race
            {'editions': [['Gamma City', 2019], ['Gamma City', 2020]], 'ruling': 'keep_both', 'set_aside': None, **ruled},
            {'editions': [['Delta Half & 10K', 2018], ['Delta Half & 10K', 2019]], 'ruling': 'pending', 'set_aside': None}]
        fx.notes['set_aside_editions'] = [{'label': 'Eta Run', 'year': 2019, 'kept': {'label': 'Epsilon Marathon', 'year': 2019}, 'reason': 'one_race_two_keys'},
                                          {'label': 'Zeta', 'year': 2016, 'kept': {'label': 'Zeta', 'year': 2015}, 'reason': 'one_list_two_years'}]
        fx.notes['edition_notes'] = [{'label': 'Gamma City', 'year': 2019, 'note': 'repeated_finish_times'}, {'label': 'Zeta', 'year': 2015, 'note': 'one_list_two_years'}]
        fx.notes['flags'] = [{'label': 'Epsilon Marathon', 'flag': 'cancelled', 'evidence': 'The made-up title says so elsewhere.'}]
        fx.notes['clears'] = [{'label': 'Delta Half & 10K', 'flag': 'not_a_marathon_title', 'evidence': 'The made-up title names a marathon in its small print.'}]
        fx.notes['aliases'] = [{'word': 'Gamma City', 'alias': 'Gammatown', 'evidence': 'The made-up English name of Gamma City.'}]
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)
        directory = json.loads((fx.out / 'directory.json').read_text())
        self.assertEqual(([r['label'] for r in directory['left_out']], len(directory['set_aside_editions'])), (['Eta Run'], 2))
        # A notes file that says something else than the build was made with is refused, and so is a ruling the build did not follow.
        notes = json.loads(fx.p['notes'].read_text())
        notes['duplicate_editions'][2].update(ruling='pending', ruled_by=None, ruled_on=None, words=None)
        fx.p['notes'].write_text(json.dumps(notes))
        result = subprocess.run(['node', str(rc.ROOT / 'scripts' / 'verify-races.cjs'), '--root', str(fx.root)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('the manifest binds the reviewed notes', result.stderr)


class Constants(unittest.TestCase):
    def test_the_course_slugs_are_the_registrys(self):
        registry = json.loads(rc.REGISTRY_PATH.read_text())
        self.assertEqual(len(br.COURSE_SLUGS_BEFORE), 27)
        self.assertLessEqual(set(br.COURSE_SLUGS_BEFORE), {race['slug'] for race in registry['races']})

    def test_the_timing_classes_cover_the_release(self):
        self.assertEqual(set(br.TIMING_CLASS.values()), set(br.TIMINGS))
        self.assertEqual(set(br.TIER_WORDS), set(br.TIERS))
        # Plan decision D16, word for word.
        self.assertEqual([br.TIER_WORDS[t] for t in br.TIERS], ['Verified', 'Verified, weaker source', 'Partial results', 'Held for review', 'Unverified'])
        self.assertEqual(br.SPLIT_WORDS['finish_time_only'], 'Finish times only')

    def test_quantile_values_are_published_exactly(self):
        self.assertEqual([br.seconds_value(v) for v in (9000.0, 9000.25, 9000.5, 9000.75)], [9000, 9000.25, 9000.5, 9000.75])
        self.assertEqual(br.seconds_value(9000.125, 3), 9000.125)
        with self.assertRaises(rc.RacesError):
            br.seconds_value(9000.1234)
        self.assertEqual((br.median_of([3, 1, 2]), br.median_of([4, 1, 2, 3])), (2.0, 2.5))


if __name__ == '__main__':
    unittest.main()
