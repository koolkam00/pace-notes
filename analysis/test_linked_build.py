"""The linked-records family from end to end on a synthetic adapted input written to a temp folder: the edition sets
(the finish-time universe, its verified part, the wider set), the linked-runner screens, the whole build, its floors,
what it may publish, and determinism (two builds, the same bytes).
Run: python3 -I -m unittest discover -s analysis -p 'test_linked*.py'
"""
from __future__ import annotations

import copy
import json
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

import build_linked
import linked_common as lc
import linked_universe as lu

TAG = 'test-linked-release'
YEARS = list(range(2012, 2020))
RACES = {'Alpha': 'stamped', 'Beta': 'stamped_weaker_source', 'Gamma': 'partial'}
# A reviewed series note as the registry carries it (plan decision D29): the label Alpha holds two races.
ALPHA_SERIES = [{'name': 'Alpha Spring Marathon', 'first_year': 2012, 'last_year': 2015},
                {'name': 'Alpha Autumn Marathon', 'first_year': 2016, 'last_year': 2019, 'months': 'September and October'}]
KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]


def hms(seconds: float) -> str:
    s = int(round(seconds))
    return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}'


def edition_table():
    """(label, year) -> tier, split tier, timing basis, coverage (finishes / official)."""
    table = {}
    for label, tier in RACES.items():
        for year in YEARS:
            row = {'tier': tier, 'split_tier': 'splits', 'timing_basis': 'chip', 'coverage': 1.0}
            if label == 'Beta':
                row['timing_basis'] = 'chip (clock if no chip)'
                if year >= 2018:
                    row['split_tier'] = 'finish_time_only'
            if label == 'Gamma':
                if year <= 2014:
                    row['timing_basis'] = 'gun'
                if year == 2016:
                    row['coverage'] = 0.90      # a partial edition outside the 5% band
                if year == 2017:
                    row['tier'] = 'unverified'  # in the wider set only
                if year == 2018:
                    row['tier'] = 'held_for_review'
            table[(label, year)] = row
    return table


def write_input(folder: Path, seed=1, runners=3000):
    """A small adapted input (the members the linked builders read) and its link file; returns (policy, registry)."""
    import duckdb
    rng = np.random.default_rng(seed)
    editions = edition_table()
    year_effect = {y: e for y, e in zip(YEARS, rng.normal(0, 0.015, len(YEARS)))}
    race_effect = {'Alpha': -0.02, 'Beta': 0.0, 'Gamma': 0.03}
    records, features, links, identity = [], [], [], []
    rid = 1000
    labels = list(RACES)
    for p in range(runners):
        ability = rng.normal(math.log(4 * 3600), 0.05)
        yob = int(rng.integers(1972, 1977))
        sex = 'M' if p % 6 else 'F'
        conf = ('high', 'medium', 'high_elite', 'low')[p % 4] if p % 97 else None
        floor_only = p % 5 == 0          # this runner's ages are age-group floors: no exact birth year
        screened = p % 53 == 0           # the identity file takes this runner's key: a half result widens the birth years
        years = sorted(rng.choice(YEARS, size=4, replace=False).tolist())
        for k, year in enumerate(years):
            label = labels[int(rng.integers(0, 3))]
            e = editions[(label, year)]
            fin = math.exp(ability + race_effect[label] + year_effect[year] + 0.004 * k + rng.normal(0, 0.03))
            fin = min(max(fin, 2.2 * 3600), 6.5 * 3600)
            slow = rng.random() < 0.4
            pace = fin / 42.195
            sections = [5 * pace] * 8 + [2.195 * pace]
            if slow:
                sections[6] *= 1.32                 # 30 to 35 km a third slower than the 5 to 20 km pace
                sections[0] *= 1 - 0.32 * 5 / 5     # ... paid for early, so the finish is unchanged
            cum = np.cumsum(sections)
            splits = [hms(c) for c in cum]
            if e['split_tier'] != 'splits':
                splits[:8] = [None] * 8
            fin_s = float(hms(cum[-1]).split(':')[0]) * 3600 + float(hms(cum[-1]).split(':')[1]) * 60 + float(hms(cum[-1]).split(':')[2])
            name = f'Runner {p}'
            records.append((rid, f'{label} Marathon', year, label, name, sex, float(year - yob), None, *splits, 'https://example.org', '2026-01-01', None))
            keyed = conf in lc.LINK_TIERS
            pid = None if conf is None else f'px_{p:016x}'
            features.append((rid, label, year, f'{label} Marathon', name, sex, float(year - yob), yob, fin_s / 60.0, pid if keyed else None,
                             False if keyed else None, pid if keyed else None, pid, conf))
            links.append((rid, 'marathon', 'full', f'yob:{yob}', 'age_is_group_floor' if floor_only else None, pid))
            status = 'unlinked' if pid is None else 'keyed' if keyed and not screened else 'possible_match'
            reason = {'unlinked': 'unlinked', 'keyed': None}.get(status, 'birth_year_spread' if keyed else 'tier_below_medium')
            identity.append(('full', rid, 'marathon', pid if status == 'keyed' else None, status, conf, pid, reason))
            rid += 1
    rec = pd.DataFrame(records, columns=['id', 'race', 'year', 'city', 'runner', 'sex', 'age', 'age_group', *[f'split_{k}km' for k in (5, 10, 15, 20, 25, 30, 35, 40)],
                                         'split_42_2km', 'source_url', 'ingested_at', 'age_or_group'])
    feat = pd.DataFrame(features, columns=['record_id', 'city', 'year', 'race', 'runner_name', 'sex', 'age', 'yob', 'finish_time', 'match_key', 'is_ambiguous',
                                           'runner_id', 'person_id', 'link_confidence'])
    link = pd.DataFrame(links, columns=['record_id', 'distance', 'source_db', 'age_key', 'record_flags', 'person_id'])
    meta = pd.DataFrame([{'city': k[0], 'year': k[1], 'verification_tier': v['tier'], 'split_tier': v['split_tier'], 'timing_basis': v['timing_basis']}
                         for k, v in editions.items()])
    # as the release's weather rows are: the start temperature to a tenth of a degree, the window mean to a hundredth (the
    # family publishes both to a hundredth, so the verifier's recount from the published points is exact)
    weather = pd.DataFrame([{'city': k[0], 'year': k[1], 'temp_c': round(8.0 + 60 * year_effect[k[1]] + i % 3, 1),
                             'temp_c_win_mean': round(10.0 + 400 * year_effect[k[1]] + i % 2, 2)}
                            for i, k in enumerate(editions) if k[0] != 'Beta'])
    con = duckdb.connect()
    for frame, name in ((rec, 'race_records'), (feat, 'features'), (meta, 'edition_meta'), (weather, 'race_conditions')):
        con.register('frame', frame)
        con.execute(f"COPY (SELECT * FROM frame) TO '{folder / (name + '.parquet')}' (FORMAT parquet)")
        con.unregister('frame')
    (folder / 'links').mkdir()
    con.register('frame', link)
    con.execute(f"COPY (SELECT * FROM frame) TO '{folder / 'links' / lc.LINK_ASSET}' (FORMAT parquet)")
    con.unregister('frame')
    # the identity file: one row per release row; a half row and a row the row rule left out are there too and are never read
    extra = [('half', 1, 'half', 'px_half', 'keyed', 'high', 'px_half', None), ('full', 1, 'marathon', None, 'left_out', 'high', 'px_out', 'left_out_by_row_rule')]
    con.register('frame', pd.DataFrame(identity + extra, columns=['source_db', 'record_id', 'distance', 'runner_key', 'status', 'link_tier', 'person_id', 'not_keyed_reason']))
    con.execute(f"COPY (SELECT * FROM frame) TO '{folder / 'links' / 'identity.parquet'}' (FORMAT parquet)")
    con.close()
    counts = rec.groupby(['city', 'year']).size().to_dict()
    editions_json = [{'city': k[0], 'year': k[1], 'n_records': int(counts.get(k, 0)), 'n_finishes': int(counts.get(k, 0)),
                      'finishes_in_release': int(counts.get(k, 0)), 'official_finishers': float(round(counts.get(k, 0) / v['coverage']))}
                     for k, v in editions.items()]
    (folder / 'EDITIONS.json').write_text(json.dumps({'tag': TAG, 'editions': editions_json}))
    (folder / 'provenance.json').write_text(json.dumps({'release_tag': TAG}))
    listed, counted = [], []
    for k, v in sorted(editions.items()):
        if v['split_tier'] != 'splits':
            listed.append({'city': k[0], 'year': k[1], 'category': 'finish_time_only'})
        elif v['tier'] in ('held_for_review', 'unverified'):
            listed.append({'city': k[0], 'year': k[1], 'category': v['tier']})
        elif v['coverage'] < 0.95:
            listed.append({'city': k[0], 'year': k[1], 'category': 'partial_coverage'})
        else:
            counted.append([k[0], k[1]])
    policy = {'tag': TAG, 'counted': counted, 'editions': listed}
    registry = {'tag': TAG, 'distance': 'marathon', 'races': [{'race_id': x.lower(), 'slug': x.lower(), 'label': x, 'keys': [x], 'flags': []} for x in RACES]}
    return policy, registry


class Editions(unittest.TestCase):
    def classify(self, meta, facts, counted=(), listed=()):
        policy = {'counted': [list(k) for k in counted], 'editions': [{'city': c, 'year': y, 'category': cat} for (c, y), cat in listed]}
        return lu.classify_editions(meta, facts, policy)

    def row(self, tier, split='splits', basis='chip', label='A', year=2015):
        return {'city': label, 'year': year, 'verification_tier': tier, 'split_tier': split, 'timing_basis': basis}

    def fact(self, finishes=1000, official=1000.0, label='A', year=2015):
        return {'city': label, 'year': year, 'n_records': finishes, 'n_finishes': finishes, 'finishes_in_release': finishes, 'official_finishers': official}

    def test_the_finish_time_universe(self):
        cases = [  # tier, split tier, finishes/official, policy category -> (F, V, W)
            ('stamped', 'splits', (1000, 1000.0), None, (True, True, True)),
            ('stamped_weaker_source', 'finish_time_only', (1000, 1000.0), 'finish_time_only', (True, True, True)),
            ('stamped', 'splits', (1000, 1000.0), 'invalid_split_grid', (True, True, True)),       # a broken grid leaves the finish times
            ('partial', 'splits', (950, 1000.0), None, (True, False, True)),                       # the band holds both ends
            ('partial', 'splits', (1050, 1000.0), None, (True, False, True)),
            ('partial', 'splits', (949, 1000.0), 'partial_coverage', (False, False, False)),
            ('partial', 'finish_time_only', (1051, 1000.0), 'finish_time_only', (False, False, False)),
            ('partial', 'finish_time_only', (1000, 1000.0), 'finish_time_only', (True, False, True)),
            ('unverified', 'splits', (1000, None), 'unverified', (False, False, True)),            # the wider set only
            ('held_for_review', 'splits', (1000, 1000.0), 'held_for_review', (False, False, False)),
            ('stamped', 'splits', (1000, 1000.0), 'selected_field', (False, False, False)),        # never, for a reason that is not about the grid
            ('stamped', 'splits', (1000, 1000.0), 'unreconciled_hold', (False, False, False)),
            ('unverified', 'splits', (1000, None), 'mixed_distance_list', (False, False, False)),
            ('partial', 'splits', (1000, 1000.0), 'incomplete_ingestion', (False, False, False)),
        ]
        for i, (tier, split, (fin, official), category, expected) in enumerate(cases):
            key = ('A', 2000 + i)
            e = self.classify([self.row(tier, split, year=key[1])], [self.fact(fin, official, year=key[1])],
                              counted=[] if category else [key], listed=[(key, category)] if category else [])
            self.assertEqual((bool(e.in_f[0]), bool(e.in_v[0]), bool(e.in_w[0])), expected, (tier, split, fin, category))
            self.assertEqual(bool(e.counted[0]), category is None)

    def test_timing_classes_and_refusals(self):
        e = self.classify([self.row('stamped', basis=None)], [self.fact()], counted=[('A', 2015)])
        self.assertEqual((e.timing[0], e.basis[0]), ('not_stated', 'not_stated'))
        e = self.classify([self.row('stamped', basis='mixed')], [self.fact()], counted=[('A', 2015)])
        self.assertEqual(e.timing[0], 'mixed')
        self.assertTrue(e.basis[0] is None)
        with self.assertRaises(lc.LinkedError):     # a timing basis nobody has classed
            self.classify([self.row('stamped', basis='hand-held stopwatch')], [self.fact()], counted=[('A', 2015)])
        with self.assertRaises(lc.LinkedError):     # the policy counts an edition this module would leave out
            self.classify([self.row('unverified')], [self.fact()], counted=[('A', 2015)])
        with self.assertRaises(lc.LinkedError):     # in the universe, yet listed for a reason this module does not know
            self.classify([self.row('stamped')], [self.fact()], listed=[(('A', 2015), 'something_new')])
        with self.assertRaises(lc.LinkedError):     # the two readings of the 5% band differ
            self.classify([self.row('partial')], [self.fact(900, 1000.0)], listed=[(('A', 2015), 'invalid_split_grid')])
        with self.assertRaises(lc.LinkedError):     # the policy and EDITIONS.json name different editions
            self.classify([self.row('stamped')], [self.fact()], counted=[])


def build_synthetic(cls, *, runners=3000, series=None, outs=('out1', 'out2')):
    """Write the synthetic input into a temp folder of the test class and build the family once per name in `outs`."""
    cls.tmp = tempfile.TemporaryDirectory()
    cls.folder = Path(cls.tmp.name)
    cls.source = cls.folder / 'input'
    cls.source.mkdir()
    cls.policy, cls.registry = write_input(cls.source, runners=runners)
    if series is not None:
        for race in cls.registry['races']:
            if race['label'] in series:
                race['series'] = copy.deepcopy(series[race['label']])
    (cls.folder / 'policy.json').write_text(json.dumps(cls.policy))
    (cls.folder / 'registry.json').write_text(json.dumps(cls.registry))
    cls.links = cls.source / 'links' / lc.LINK_ASSET
    cls.identity = cls.source / 'links' / 'identity.parquet'
    cls.binding = {'release_tag': TAG, 'input_manifest_sha256': 'a' * 64, 'input_as_of': '2026-01-01T00:00:00Z', 'adapter_sha256': 'b' * 64,
                   'policy_file': str(cls.folder / 'policy.json'), 'policy_sha256': 'c' * 64, 'registry_file': 'registry.json',
                   'registry_sha256': 'd' * 64, 'link_file': lc.LINK_ASSET, 'link_file_sha256': 'e' * 64,
                   'identity_file': 'identity.parquet', 'identity_sha256': 'f' * 64, 'identity_builder_sha256': '0' * 64}
    # The site's cohort code applies the reviewed policy of the input's release tag: give the test tag the same list.
    import source_quality
    original = lu.check_inputs
    lu.check_inputs = lambda *a, **k: dict(cls.binding)
    source_quality.REVIEWED_POLICIES[TAG] = [(e['city'], e['year'], e['category'], 'a test edition') for e in cls.policy['editions']]
    try:
        cls.metas = [build_linked.run(cls.source, cls.links, cls.identity, cls.folder / name, boot=25, registry_path=cls.folder / 'registry.json') for name in outs]
    finally:
        lu.check_inputs = original
        del source_quality.REVIEWED_POLICIES[TAG]
    cls.files = {name: json.loads((cls.folder / outs[0] / name).read_text()) for name in (*build_linked.FILES, 'manifest.json')}


def verify_family(folder: Path, registry: Path):
    """scripts/verify-linked.cjs on a synthetic family, against the family's own registry (its test-only mode)."""
    return subprocess.run(['node', str(lc.ROOT / 'scripts' / 'verify-linked.cjs'), '--data', str(folder), '--registry', str(registry), '--family-only'],
                          capture_output=True, text=True, check=False)


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build_synthetic(cls)
        cls.meta, cls.again = cls.metas

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_two_builds_give_the_same_bytes(self):
        names = sorted(p.name for p in (self.folder / 'out1').iterdir())
        self.assertEqual(names, sorted([*build_linked.FILES, 'manifest.json']))
        for name in names:
            self.assertEqual((self.folder / 'out1' / name).read_bytes(), (self.folder / 'out2' / name).read_bytes(), name)
            self.assertTrue((self.folder / 'out1' / name).read_bytes().endswith(b'\n'))

    def test_the_manifest_binds_inputs_scripts_and_files(self):
        m = self.files['manifest.json']
        self.assertEqual((m['family'], m['release_tag'], m['input']['manifest_sha256'], m['policy']['sha256'], m['registry']['sha256'], m['links']['sha256']),
                         ('linked', TAG, 'a' * 64, 'c' * 64, 'd' * 64, 'e' * 64))
        self.assertEqual(m['identity'], {'file': 'identity.parquet', 'sha256': 'f' * 64, 'builder': 'analysis/build_identity.py', 'builder_sha256': '0' * 64})
        self.assertEqual(sorted(m['scripts']), sorted(f'analysis/{n}' for n in build_linked.SCRIPTS + build_linked.SHARED_SCRIPTS))
        for name, digest in m['scripts'].items():
            self.assertEqual(digest, lc.file_sha256(lc.ROOT / name))
        for name, meta in m['files'].items():
            data = (self.folder / 'out1' / name).read_bytes()
            self.assertEqual((meta['bytes'], meta['sha256']), (len(data), lc.bytes_sha256(data)))
        self.assertEqual(m['definitions']['min_cell'], 100)
        self.assertEqual(m['definitions']['bootstrap_draws'], 25)

    def test_the_universe(self):
        u = self.files['manifest.json']['cohort']['universe']
        self.assertEqual(u['editions_with_rows'], 24)
        self.assertEqual(u['F']['editions'], 21)          # 24 less Gamma 2016 (coverage), 2017 (unverified) and 2018 (held)
        self.assertEqual(u['verified']['editions'], 16)
        self.assertEqual(u['wider']['editions'], 22)
        self.assertEqual(u['F']['editions_by_tier'], {'partial': 5, 'stamped': 8, 'stamped_weaker_source': 8})
        self.assertEqual(u['counted']['editions'], 19)    # the split editions of F
        # links: a quarter of the runners carry a low link, one in 97 none; neither keys a runner. Of the others the
        # identity file takes the key of one in 53 (a screen over both distances): the adapted features still carry it.
        keyed = [p for p in range(3000) if p % 97 and p % 4 != 3]
        self.assertEqual(u['keys_before_the_screens'], len(keyed))
        self.assertEqual(u['linked_runners'], len([p for p in keyed if p % 53]))
        self.assertEqual(u['keyed_records'], 4 * u['linked_runners'])

    def test_edition_readings_floors_and_bases(self):
        e = self.files['editions.json']
        self.assertEqual(sorted(e['races']), ['Alpha', 'Beta', 'Gamma'])
        self.assertEqual(sorted(e['races']['Gamma']), ['2012', '2013', '2014'])     # three gun-timed years; its two chip years are too few to compare
        self.assertEqual(len(e['races']['Alpha']), 8)
        for label, years in e['races'].items():
            for year, row in years.items():
                self.assertGreaterEqual(row['finishes'], 100)
                self.assertGreaterEqual(row['others'], 2)
                self.assertLessEqual(row['lo_pct'], row['reading_pct'])
                self.assertLessEqual(row['reading_pct'], row['hi_pct'])
                self.assertIn(row['verdict'], ('fast', 'slow', 'usual', None))
                group = [math.log1p(r['reading_pct'] / 100) for r in years.values() if r['basis'] == row['basis']]
                self.assertAlmostEqual(row['year_sd_pct'], 100 * float(np.std(group, ddof=1)) * (len(group) - 1) / len(group), delta=2e-3)
                self.assertEqual(row['basis'], 'gun' if label == 'Gamma' else 'chip_or_net')
        self.assertEqual(e['summary']['editions'], 19)

    def test_race_readings_are_in_label_order_without_rank(self):
        r = self.files['races.json']
        self.assertEqual(list(r['races']), ['Alpha', 'Beta'])                        # Gamma has two chip-timed fitted editions: no reading
        raw = (self.folder / 'out1' / 'races.json').read_text()
        self.assertLess(raw.index('"Alpha"'), raw.index('"Beta"'))
        self.assertNotRegex(raw, r'rank|order|position|fastest|equivalent')
        alpha, beta = r['races']['Alpha'], r['races']['Beta']
        self.assertLess(alpha['reading_pct'], beta['reading_pct'])                   # the fixture makes Alpha 2% quicker than Beta
        self.assertAlmostEqual(beta['reading_pct'] - alpha['reading_pct'], 2.0, delta=0.6)
        for row in (alpha, beta):
            self.assertGreaterEqual(row['editions'], 3)
            self.assertGreaterEqual(min(row['people_earlier'], row['people_later']), 100)
            self.assertEqual(sum(row['tiers'].values()), row['editions'])
            self.assertLess(row['lo_pct'], row['hi_pct'])

    def test_bests_age_and_return(self):
        b, a, back = self.files['bests.json'], self.files['age.json'], self.files['return.json']
        self.assertEqual([row['recorded_attempt'] for row in b['by_recorded_attempt']], [2, 3, 4])
        self.assertTrue(all(row['results'] >= 100 for row in b['by_recorded_attempt']))
        self.assertEqual(b['cohort']['left_out_by_the_one_marathon_per_year_rule']['results'], 0)
        self.assertTrue(all(band['pairs'] >= 100 for band in a['bands']))
        # one runner in five has age-group floors only, so no exact birth year
        linked = self.files['manifest.json']['cohort']['universe']['F']['people']
        self.assertLess(a['cohort']['people_with_an_exact_birth_year'], linked * 0.85)
        self.assertGreater(a['cohort']['people_with_an_exact_birth_year'], linked * 0.70)
        self.assertGreaterEqual(back['with_slowdown']['finishes'], 100)
        self.assertEqual(back['years'], [2010, 2019])

    def test_the_checks_keep_their_floors(self):
        c = self.files['checks.json']
        for band in c['temperature']['bands']:
            self.assertEqual(band['mean_pct'] is None, band['editions'] < 3)
        for point_group in (c['temperature']['points'],):
            sizes = {}
            for p in point_group:
                sizes[(p['label'], p['basis'])] = sizes.get((p['label'], p['basis']), 0) + 1
            self.assertTrue(all(n >= 3 for n in sizes.values()))
        for y in c['year_levels']:
            self.assertEqual(y['level_pct'] is None, y['editions'] < 3)
        self.assertIsNone(c['slowdown'])          # no edition of the fixture holds 1,000 timing-eligible finishes
        self.assertEqual(sorted(c['fits']), ['high', 'verified', 'wider'])
        self.assertEqual(c['beyond']['editions'], self.files['editions.json']['summary']['editions'])
        self.assertEqual(c['held_for_review'], [])

    def test_no_identifier_or_name_reaches_a_file(self):
        for name in build_linked.FILES:
            raw = (self.folder / 'out1' / name).read_text()
            self.assertNotRegex(raw, r'px_[0-9a-f]{16}|Runner \d|"(runner|person|record)_?id"|example\.org')
            self.assertNotIn(TAG, raw)

    def test_changed_counts_need_a_review(self):
        out = self.folder / 'out3'
        out.mkdir()
        manifest = dict(self.files['manifest.json'])
        manifest['cohort'] = {**manifest['cohort'], 'bests': {'results_with_an_earlier_recorded_marathon': 1}}
        (out / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(lc.LinkedError):
            build_linked.compare_counts(out, self.files['manifest.json'], accept=False)
        build_linked.compare_counts(out, self.files['manifest.json'], accept=True)


class BuildWithSeries(unittest.TestCase):
    """The same synthetic input, read with a registry whose label Alpha holds two races (plan decision D29). The fixture is
    larger so that the counted editions hold the 1,000 timing-eligible finishes of the whole-field check and the Node
    verifier can check the whole family."""

    @classmethod
    def setUpClass(cls):
        build_synthetic(cls, runners=8000, series={'Alpha': ALPHA_SERIES}, outs=('out1',))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_an_edition_is_compared_inside_its_series(self):
        e = self.files['editions.json']
        alpha = e['races']['Alpha']
        self.assertEqual(sorted(alpha), [str(y) for y in YEARS])
        for year, row in alpha.items():
            self.assertEqual(row['series'], 'Alpha Spring Marathon' if int(year) <= 2015 else 'Alpha Autumn Marathon')
            self.assertEqual(row['others'], 3)                                    # the three other years of its own series, not seven
        for name in ('Alpha Spring Marathon', 'Alpha Autumn Marathon'):
            logs = [math.log1p(row['reading_pct'] / 100) for row in alpha.values() if row['series'] == name]
            self.assertAlmostEqual(sum(logs), 0.0, delta=1e-4)                    # each series' readings are against its own other years
            self.assertEqual(len({row['year_sd_pct'] for row in alpha.values() if row['series'] == name}), 1)
        self.assertTrue(all('series' not in row for label in ('Beta', 'Gamma') for row in e['races'][label].values()))
        self.assertEqual(e['summary']['races'], 4)                                # two series of Alpha, Beta, and Gamma's gun-timed years

    def test_a_label_with_series_is_read_per_series(self):
        r = self.files['races.json']
        self.assertEqual(list(r['races']), ['Beta'])                              # no reading for the label Alpha itself
        self.assertEqual(list(r['series']), ['Alpha'])
        self.assertEqual(list(r['series']['Alpha']), ['Alpha Autumn Marathon', 'Alpha Spring Marathon'])
        for row in r['series']['Alpha'].values():
            self.assertEqual((row['editions'], row['editions_fitted']), (4, 4))
            self.assertGreaterEqual(min(row['people_earlier'], row['people_later']), 100)   # the other series counts as another race
            self.assertLess(row['reading_pct'], r['races']['Beta']['reading_pct'])           # the fixture makes Alpha 2% quicker than Beta
            self.assertIs(row['trail_or_mountain'], False)
        self.assertEqual(r['summary']['races'], 3)
        raw = (self.folder / 'out1' / 'races.json').read_text()
        self.assertNotRegex(raw, r'rank|order|position|fastest|equivalent')
        self.assertEqual(self.files['manifest.json']['cohort']['universe']['series'], {'labels': 1, 'races': 2, 'editions': 8})
        self.assertEqual(self.files['manifest.json']['cohort']['universe']['F']['races'], 4)
        self.assertEqual(self.files['manifest.json']['cohort']['fit']['races_fitted'], 4)

    def test_the_checks_group_by_series(self):
        c = self.files['checks.json']
        sizes = {}
        for p in c['temperature']['points']:
            self.assertEqual(p.get('series'), None if p['label'] != 'Alpha' else 'Alpha Spring Marathon' if p['year'] <= 2015 else 'Alpha Autumn Marathon')
            key = (p['label'], p.get('series'), p['basis'])
            sizes[key] = sizes.get(key, 0) + 1
        self.assertEqual(sizes[('Alpha', 'Alpha Spring Marathon', 'chip_or_net')], 4)
        self.assertTrue(all(n >= 3 for n in sizes.values()))
        self.assertIsNotNone(c['slowdown'])                                       # this fixture is large enough for the whole-field check
        self.assertTrue(all(('series' in p) == (p['label'] == 'Alpha') for p in c['slowdown']['points']))

    @unittest.skipUnless(shutil.which('node'), 'node is not installed')
    def test_the_node_verifier_checks_a_family_with_series(self):
        out, registry = self.folder / 'out1', self.folder / 'registry.json'
        done = verify_family(out, registry)
        self.assertEqual(done.returncode, 0, done.stdout[-3000:] + done.stderr[-3000:])
        self.assertIn('checks passed', done.stdout)

        def broken(name, change, registry_change=None):
            folder = self.folder / 'broken'
            shutil.rmtree(folder, ignore_errors=True)
            shutil.copytree(out, folder)
            doc = json.loads((folder / name).read_text())
            change(doc)
            data = (json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
            (folder / name).write_bytes(data)
            manifest = json.loads((folder / 'manifest.json').read_text())
            manifest['files'][name] = {'bytes': len(data), 'sha256': lc.bytes_sha256(data)}
            (folder / 'manifest.json').write_text(json.dumps(manifest) + '\n')
            other = registry
            if registry_change is not None:
                reg = copy.deepcopy(self.registry)
                registry_change(reg)
                other = self.folder / 'registry-broken.json'
                other.write_text(json.dumps(reg))
            return verify_family(folder, other)

        def swap_series(d):
            d['races']['Alpha']['2013']['series'] = 'Alpha Autumn Marathon'

        def drop_series(d):
            del d['races']['Alpha']['2013']['series']

        def label_reading(d):
            d['races']['Alpha'] = d['series']['Alpha']['Alpha Spring Marathon']

        def unknown_series(d):
            d['series']['Alpha']['Alpha Winter Marathon'] = d['series']['Alpha'].pop('Alpha Spring Marathon')

        def drop_note(reg):
            for race in reg['races']:
                race.pop('series', None)
        for what, result in (('an edition in the other series', broken('editions.json', swap_series)),
                             ('an edition without its series', broken('editions.json', drop_series)),
                             ('a reading for a label that holds two races', broken('races.json', label_reading)),
                             ('a series the registry does not name', broken('races.json', unknown_series)),
                             ('a registry without the note', broken('editions.json', lambda d: None, drop_note))):
            self.assertNotEqual(result.returncode, 0, what)
            self.assertIn('checks failed', result.stderr, what)


class Inputs(unittest.TestCase):
    def test_a_source_inside_the_repository_is_refused(self):
        with self.assertRaises(lc.LinkedError):
            lu.check_inputs(lc.ROOT / 'public' / 'data', Path('/nowhere') / lc.LINK_ASSET, Path('/nowhere') / 'identity.parquet')

    def test_the_identity_file_must_be_the_one_built_for_this_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            identity, builder = folder / 'identity.parquet', folder / 'build_identity.py'
            identity.write_bytes(b'rows')
            builder.write_text('# the identity builder')
            good = {'release_tag': 'tag', 'input_manifest_sha256': 'm' * 64, 'link_file': {'sha256': 'l' * 64},
                    'file': {'sha256': lc.file_sha256(identity)}, 'scripts': {'build_identity.py': lc.file_sha256(builder)}}

            def check(**change):
                (folder / 'identity.parquet.json').write_text(json.dumps({**good, **change}))
                return lu.check_identity(identity, 'tag', 'm' * 64, 'l' * 64, builder=builder)
            self.assertEqual(check(), {'identity_file': 'identity.parquet', 'identity_sha256': lc.file_sha256(identity), 'identity_builder_sha256': lc.file_sha256(builder)})
            for change in ({'release_tag': 'another'}, {'input_manifest_sha256': 'x' * 64}, {'link_file': {'sha256': 'x' * 64}},
                           {'file': {'sha256': 'x' * 64}}, {'scripts': {'build_identity.py': 'x' * 64}}):
                with self.assertRaises(lc.LinkedError):
                    check(**change)
            (folder / 'identity.parquet.json').unlink()
            with self.assertRaises(lc.LinkedError):
                lu.check_identity(identity, 'tag', 'm' * 64, 'l' * 64, builder=builder)

    def test_the_series_note_is_read_strictly(self):
        def registry(note, **extra):
            return {'races': [{'label': 'W', 'series': note}, {'label': 'X'}], **extra}
        good = [{'name': 'Spring', 'first_year': 2015, 'last_year': 2018, 'months': 'April'}, {'name': 'Autumn', 'first_year': 2019, 'last_year': 2026}]
        self.assertEqual(lu.series_notes(registry(good)), {'W': [('Spring', 2015, 2018), ('Autumn', 2019, 2026)]})
        self.assertEqual(lu.series_notes(registry(list(reversed(good)))), {'W': [('Spring', 2015, 2018), ('Autumn', 2019, 2026)]})   # in year order
        self.assertEqual(lu.series_names(registry(good)), frozenset({'Spring', 'Autumn'}))
        self.assertEqual(lu.series_notes({'races': [{'label': 'W'}, {'label': 'X', 'series': None}]}), {})
        for note in ('Spring 2015 to 2018; Autumn 2019 to 2026',                                    # prose is not read, and not guessed
                     good[:1],                                                                      # one series is no split
                     [{'name': 'Spring', 'years': [2015, 2018]}, good[1]],                          # another shape
                     [{**good[0], 'first_year': '2015'}, good[1]], [{**good[0], 'first_year': True}, good[1]],
                     [{**good[0], 'last_year': 2014}, good[1]],                                     # ends before it starts
                     [{**good[0], 'last_year': 2019}, good[1]],                                     # two series share 2019
                     [good[0], {**good[1], 'name': 'Spring'}], [{**good[0], 'name': ' '}, good[1]], [{**good[0], 'name': 'A\x1fB'}, good[1]]):
            with self.assertRaises(lc.LinkedError, msg=repr(note)):
                lu.series_notes(registry(note))
        # a registry that names series where this reader does not look is refused, never read as "no series"
        for extra in ({'reviewed': {'series': [{'key': 'W'}]}}, {'rule': {'series': 'a label that holds two races'}}, {'series_notes': []}):
            with self.assertRaises(lc.LinkedError, msg=repr(extra)):
                lu.series_notes({'races': [{'label': 'W'}], **extra})
        with self.assertRaises(lc.LinkedError):
            lu.series_notes({'races': [{'label': 'W', 'series_note': 'two races'}]})
        self.assertEqual(lu.series_notes({'races': [{'label': 'W'}], 'reviewed': {'joins': [{'evidence': {'years_by_key': {'W: Marathon Series': '2015'}}}]}}), {})   # a race title may say "series"

    def test_editions_take_the_series_that_holds_their_year(self):
        good = [{'name': 'Spring', 'first_year': 2015, 'last_year': 2018}, {'name': 'Autumn', 'first_year': 2019, 'last_year': 2026}]
        registry = {'races': [{'label': 'W', 'series': good}, {'label': 'X'}]}
        editions = pd.DataFrame({'label': ['W', 'W', 'X', 'W'], 'year': [2015, 2019, 2019, 2026]})
        out = lu.with_series(editions, registry)
        self.assertEqual(out.series.tolist(), ['Spring', 'Autumn', None, 'Autumn'])
        self.assertEqual(out.rkey.tolist(), ['W\x1fSpring', 'W\x1fAutumn', 'X', 'W\x1fAutumn'])
        plain = lu.with_series(editions, {'races': [{'label': 'W'}, {'label': 'X'}]})
        self.assertEqual((plain.series.tolist(), plain.rkey.tolist()), ([None] * 4, ['W', 'W', 'X', 'W']))       # without a note the race is the label
        with self.assertRaises(lc.LinkedError):                                                    # an edition outside every series of its label
            lu.with_series(pd.DataFrame({'label': ['W'], 'year': [2014]}), registry)
        with self.assertRaises(lc.LinkedError):                                                    # a note for a label the input does not hold
            lu.with_series(pd.DataFrame({'label': ['X'], 'year': [2019]}), registry)

    def test_the_registry_must_carry_labels(self):
        with self.assertRaises(lc.LinkedError):
            lu.registry_labels({'races': [{'race_id': 'x', 'keys': ['X']}]})
        with self.assertRaises(lc.LinkedError):
            lu.registry_labels({'races': [{'label': 'X'}, {'label': 'X'}]})
        self.assertEqual(list(lu.registry_labels({'races': [{'label': 'X'}, {'label': 'Y'}]})), ['X', 'Y'])


if __name__ == '__main__':
    unittest.main()
