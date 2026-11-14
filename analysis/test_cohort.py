"""The marathon cohort on a small input: the builder, the Python and Node readers, and both verifiers."""
import hashlib
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
import build_cohort  # noqa: E402
import build_record_status  # noqa: E402
import cohort  # noqa: E402
import source_quality  # noqa: E402
import verify_cohort  # noqa: E402
from build_pacing import FIELDS, prepare  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TAG = 'pace-notes-marathon-half-20990101-0000'
RULES = [('Held', 2020, 'held_for_review', 'Held.'), ('Own', 2021, 'unverified', 'Unverified.')]
OWN = frozenset({('Own', 2021)})
GOOD = ['0:25:00', '0:50:00', '1:15:00', '1:40:00', '2:05:00', '2:30:00', '2:55:00', '3:20:00', '3:30:58']
HALVES = ['0:25:00.5', '0:50:01', '1:15:01.5', '1:40:02', '2:05:02.5', '2:30:03', '2:55:03.5', '3:20:04', '3:31:00.5']
MICRO = GOOD[:8] + ['3:30:58.123456']   # not a whole millisecond: kept exactly, as an exception row
# id, city, year, runner name, sex, age, times, runner key
RECORDS = [
    (21, 'Good', 2019, 'A', 'F', 34, GOOD, 'p51_a'), (22, 'Good', 2019, 'B', 'M', None, HALVES, 'p51_b'), (24, 'Good', 2019, 'C', 'X', 40.5, GOOD, 'p51_c'),
    (1, 'Good', 2020, 'A', 'F', 35, GOOD, 'p51_a'), (2, 'Good', 2020, 'A', 'F', 35, GOOD, None), (3, 'Good', 2020, 'D', None, 50, GOOD[:2] + [None] + GOOD[3:], None),
    (4, 'Good', 2020, 'E', 'M', 51, GOOD[:2] + ['1:45:00'] + GOOD[3:], None),
    (5, 'Good', 2020, 'F', 'M', 52, ['1:30:00', '3:00:00', '4:30:00', '6:00:00', '7:30:00', '9:00:00', '10:30:00', '12:00:00', '12:40:00'], None),
    (23, 'Good', 2020, 'G', 'M', 29, MICRO, None),
    (6, 'Own', 2021, 'A', 'F', 36, GOOD, 'p51_a'), (7, 'Own', 2021, 'H', 'F', 20, GOOD[:4] + [None] + GOOD[5:], None),
    (10, 'Held', 2020, 'I', 'M', 30, GOOD, None), (11, 'Held', 2020, 'C', 'X', 41, GOOD, 'p51_c'),
]
SECONDS = [1500.0, 3000.0, 4500.0, 6000.0, 7500.0, 9000.0, 10500.0, 12000.0, 12658.0]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_inputs(folder):
    """An adapted folder as the builders read it, its record status file and an identity file."""
    db = duckdb.connect()
    columns = ','.join(f'"{field}" VARCHAR' for field in FIELDS)
    db.execute(f'CREATE TABLE fixture (id BIGINT,race VARCHAR,year INTEGER,city VARCHAR,runner VARCHAR,sex VARCHAR,age DOUBLE,age_group VARCHAR,age_or_group VARCHAR,{columns})')
    db.executemany('INSERT INTO fixture VALUES (' + ','.join('?' * 18) + ')',
                   [[rid, city + ' Marathon', year, city, name, sex, age, None, None] + times for rid, city, year, name, sex, age, times, _ in RECORDS])
    db.execute(f"COPY (SELECT * FROM fixture ORDER BY id) TO '{folder / 'race_records.parquet'}' (FORMAT parquet)")
    db.execute(f"""COPY (SELECT DISTINCT city, year::BIGINT AS year, race, lower(city) AS race_id, city AS release_city, race AS release_race, 0::BIGINT AS n_records FROM fixture ORDER BY 1, 2)
      TO '{folder / 'release_keys.parquet'}' (FORMAT parquet)""")
    db.execute(f"""COPY (SELECT DISTINCT city, year::BIGINT AS year, 'stamped' AS verification_tier, false AS weaker_source, 'splits' AS split_tier, 'chip' AS timing_basis,
        CASE WHEN city='Good' THEN year::VARCHAR || '-10-04' END AS race_date, CASE WHEN city='Good' AND year=2020 THEN 'weather' WHEN city='Good' THEN 'external' END AS race_date_source
        FROM fixture ORDER BY 1, 2)
      TO '{folder / 'edition_meta.parquet'}' (FORMAT parquet)""")
    (folder / 'MANIFEST.json').write_text(json.dumps({'created_at': '2099-01-01T12:00:00Z'}))
    (folder / 'provenance.json').write_text(json.dumps({'release_tag': TAG, 'manifest_sha256': sha(folder / 'MANIFEST.json'), 'asset_sha256': 'b' * 64}))
    status = folder / 'record-status.parquet'
    build_record_status.main(['--input', str(folder), '--output', str(status)])
    identity = folder / 'identity.parquet'
    # Runner A's links are of tier high but for record 6 (medium); runner B's is high_elite, runner C's are medium. A record without a key has no tier here.
    tiers = {'p51_a': 'high', 'p51_b': 'high_elite', 'p51_c': 'medium'}
    db.execute('CREATE TABLE ident (source_db VARCHAR, record_id BIGINT, distance VARCHAR, runner_key VARCHAR, link_tier VARCHAR)')
    db.executemany("INSERT INTO ident VALUES ('full', ?, 'marathon', ?, ?)", [[rid, key, 'medium' if rid == 6 else tiers.get(key)] for rid, *_, key in RECORDS])
    db.execute("INSERT INTO ident VALUES ('half', 1, 'half', 'p51_a', 'high')")   # a half result of the same runner: another id space, never a marathon record
    db.execute(f"COPY (SELECT * FROM ident ORDER BY distance DESC, record_id) TO '{identity}' (FORMAT parquet)")
    Path(str(identity) + '.json').write_text(json.dumps({'release_tag': TAG, 'input_manifest_sha256': sha(folder / 'MANIFEST.json'),
                                                        'file': {'name': identity.name, 'bytes': identity.stat().st_size, 'sha256': sha(identity)}}))
    return status, identity


class Cohort(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.source = Path(self.tmp.name)
        for patcher in (mock.patch.dict(source_quality.REVIEWED_POLICIES, {TAG: RULES}), mock.patch.dict(source_quality.OWN_RECORD, {TAG: OWN}),
                        mock.patch.object(source_quality, 'LISTED_IN_ONE_FILE', source_quality.LISTED_IN_ONE_FILE | {TAG})):
            patcher.start()
            self.addCleanup(patcher.stop)
        with mock.patch('builtins.print'):
            self.status, self.identity = write_inputs(self.source)
        self.out = self.source / 'cohort'
        self.manifest = build_cohort.build(self.source, self.status, self.identity, self.out, memory='1GB')

    def tearDown(self):
        self.tmp.cleanup()

    def test_what_the_cohort_holds(self):
        m = self.manifest
        # The counted records are the eligible cohort of the pipeline's own prepare(); the raw records close.
        again = prepare(duckdb.connect(), self.source)
        self.assertEqual((m['eligible_records'], m['raw_records'], m['cohort']), (again['eligible'], again['raw'], again))
        self.assertEqual((m['eligible_records'], m['own_record_records'], m['timing_eligible_records_held'], m['other_records_held'], m['records_in_other_editions']), (5, 1, 6, 5, 2))
        self.assertEqual([(e['city'], e['year'], e['use'], e['raw'], e['eligible'], e['own_record'], e['other'], e['file']) for e in m['editions']],
                         [('Good', 2019, 'counted', 3, 3, 0, 0, 'editions/good-2019.json.gz'), ('Good', 2020, 'counted', 6, 2, 0, 4, 'editions/good-2020.json.gz'),
                          ('Own', 2021, 'own_record', 2, 0, 1, 1, 'editions/own-2021.json.gz')])
        # An edition without a file carries the release's tier fields too (changed 2026-11-14: four columns before): a policy category does not determine a tier.
        self.assertEqual(m['other_editions'], {'columns': ['city', 'year', 'raw', 'category', 'tier', 'weaker_source', 'split_tier'],
                                               'rows': [['Held', 2020, 2, 'held_for_review', 'stamped', False, 'splits']]})
        self.assertEqual(cohort.other_editions(m), [{'city': 'Held', 'year': 2020, 'raw': 2, 'category': 'held_for_review', 'tier': 'stamped', 'weaker_source': False,
                                                     'split_tier': 'splits'}])
        self.assertEqual({e['split_tier'] for e in m['editions']}, {'splits'})
        # Every counted edition has a race date and its source (changed 2026-11-14, lead ruling D27: 2019 was undated here); an own-record edition may have none.
        self.assertEqual((m['editions'][1]['race_date'], m['editions'][1]['tier'], m['editions'][0]['race_date'], m['editions'][0]['race_date_source']),
                         ('2020-10-04', 'stamped', '2019-10-04', 'external'))
        self.assertEqual((m['editions'][2]['race_date'], m['editions'][2]['race_date_source'], [e['series'] for e in m['editions']]), (None, None, [None, None, None]))
        self.assertEqual(m['inputs']['race_registry'], {'file': 'analysis/race-registry.json', 'sha256': None})
        self.assertIsNone(m['inputs']['identity']['description'])
        self.assertEqual(m['source_quality']['counts']['timing_eligible_own_record'], 1)
        # A runner is the smallest written marathon record id of its key, wherever that record is: runner A's is 1, runner
        # C's is 11, a record of an edition that has no file. The half result with id 1 is not a marathon record.
        self.assertEqual({k: v for k, v in m['linkage'].items() if k not in ('identity_rule', 'record_join_method', 'high_links')},
                         {'counted_records_with_a_runner': 4, 'runners_with_a_counted_record': 3, 'runners_with_two_or_more_counted_records': 1,
                          'counted_records_of_those_runners': 2, 'recent_benchmark_finishes': 1})
        # On high links alone (adoption ruling D38) runner C, whose links are medium, is not followed: three records of two runners.
        self.assertEqual(m['linkage']['high_links'], {'counted_records_with_a_runner': 3, 'runners_with_a_counted_record': 2, 'runners_with_two_or_more_counted_records': 1,
                                                      'counted_records_of_those_runners': 2, 'recent_benchmark_finishes': 1})
        files = {e['file']: cohort.read_edition(self.out, e) for e in m['editions']}
        good19, good20, own = files['editions/good-2019.json.gz'], files['editions/good-2020.json.gz'], files['editions/own-2021.json.gz']
        self.assertEqual((good19['ids'], good19['runner'], good19['sex'], good19['age']), ([21, 22, 24], [1, 22, 11], ['F', 'M', 'X'], [34, None, 40.5]))
        self.assertEqual((good19['link'], good20['link'], own['link']), (['h', 'h', 'm'], ['h', None], ['m']))
        self.assertEqual(good19['times'][0], SECONDS)
        self.assertEqual(good19['times'][1], [1500.5, 3001.0, 4501.5, 6002.0, 7502.5, 9003.0, 10503.5, 12004.0, 12660.5])
        self.assertEqual((good20['ids'], good20['runner'], good20['other_ids'], good20['other_reasons']),
                         ([1, 23], [1, 0], [2, 3, 4, 5], ['duplicate', 'missing_checkpoints', 'times_out_of_order', 'outside_bounds']))
        self.assertEqual(good20['times'][1][8], 12658.123456)   # exact, although not a whole millisecond
        self.assertEqual((good20['other_times'][0], good20['other_times'][1], good20['other_times'][2][2]), (SECONDS, None, 6300.0))
        self.assertEqual((own['use'], own['ids'], own['runner'], own['other_reasons']), ('own_record', [6], [1], ['missing_checkpoints']))
        # No name is in any file, and an edition file carries no tag and no clock time.
        import gzip
        for e in m['editions']:
            text = gzip.decompress((self.out / e['file']).read_bytes()).decode()
            self.assertNotIn(TAG, text)
            self.assertEqual(set(json.loads(text)), {'v', 'city', 'year', 'use', 'i', 'g', 'l', 'x', 'a', 's', 't', 'tx', 'oi', 'oc', 'on', 'ot', 'otx'})
        # The arrays an analysis reads: the eligible cohort, with one value per runner.
        arrays, manifest, digest = cohort.load(self.out)
        self.assertEqual((arrays['times'].shape, arrays['record_id'].tolist(), arrays['runner'].tolist(), arrays['keyed'].tolist(), arrays['edition'].tolist()),
                         ((5, 9), [21, 22, 24, 1, 23], [1, 22, 11, 1, 23], [True, True, True, True, False], [0, 0, 0, 1, 1]))
        self.assertEqual((digest, arrays['sex'].tolist()), (sha(self.out / 'manifest.json'), [b'F', b'M', b'X', b'F', b'M']))
        self.assertEqual(arrays['link_high'].tolist(), [True, True, False, True, False])
        self.assertEqual(cohort.load(self.out, uses=('own_record',))[0]['record_id'].tolist(), [6])

    def test_an_unchanged_edition_keeps_its_bytes(self):
        before = {e['file']: e['sha256'] for e in self.manifest['editions']}
        # A second build of the same input writes the same files; only the manifest's clock time may differ.
        again = build_cohort.build(self.source, self.status, self.identity, self.source / 'again', memory='1GB')
        self.assertEqual({e['file']: e['sha256'] for e in again['editions']}, before)
        self.assertEqual({k: v for k, v in again.items() if k != 'as_of'}, {k: v for k, v in self.manifest.items() if k != 'as_of'})

    def test_the_verifiers(self):
        report = verify_cohort.verify(self.out, self.status, self.identity, self.source)
        self.assertEqual((report['eligible_records'], report['records_recounted'], report['status']['editions_without_a_file'], report['identity']['runners']), (5, 11, 1, 3))
        self.assertEqual(report['tiers'], {'editions_checked': 4, 'by_tier': {'stamped': 4, 'stamped_weaker_source': 0, 'partial': 0, 'held_for_review': 0, 'unverified': 0}})
        if shutil.which('node'):
            done = subprocess.run(['node', str(ROOT / 'scripts' / 'verify-cohort.cjs'), '--root', str(self.out)], capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr[-2000:])
            self.assertIn('3 edition files, 5 counted and 1 own-record records, 5 other records held, 2 records in 1 editions without a file; 3 runners', done.stdout)
        manifest_path = self.out / 'manifest.json'
        original = manifest_path.read_text()

        def refused(message, text=None, node=True):
            if text is not None:
                manifest_path.write_text(text)
            with self.assertRaisesRegex(AssertionError, message):
                verify_cohort.verify(self.out, self.status, self.identity)
            if node and shutil.which('node'):
                self.assertNotEqual(subprocess.run(['node', str(ROOT / 'scripts' / 'verify-cohort.cjs'), '--root', str(self.out)], capture_output=True).returncode, 0, message)
            manifest_path.write_text(original)
        refused('eligible cohort', original.replace('"eligible_records": 5', '"eligible_records": 4'))
        refused('counted edition without a race date', original.replace('"race_date":"2019-10-04","race_date_source":"external"', '"race_date":null,"race_date_source":null'))
        refused('its series is not its race name', original.replace('"race_id":"good","series":null', '"race_id":"good","series":"Another Marathon"', 1))
        refused('raw records do not add up', original.replace('["Held",2020,2,"held_for_review",', '["Held",2020,3,"held_for_review",'))
        refused('its tier fields', original.replace('"held_for_review","stamped",false,"splits"]', '"held_for_review","verified",false,"splits"]'))
        refused('weaker-source mark', original.replace('"held_for_review","stamped",false,"splits"]', '"held_for_review","stamped",true,"splits"]'))
        # The tiers are the adapted input's: a manifest that says otherwise is refused when the input is given.
        manifest_path.write_text(original.replace('"held_for_review","stamped",false,"splits"]', '"held_for_review","unverified",false,"splits"]'))
        with self.assertRaisesRegex(AssertionError, 'tier fields differ from the adapted edition_meta'):
            verify_cohort.verify(self.out, source=self.source)
        manifest_path.write_text(original)
        refused('benchmark count|linkage counts', original.replace('"recent_benchmark_finishes": 1', '"recent_benchmark_finishes": 2', 1))
        # The counts on high links alone are recounted too, and a record's link class is the identity file's (adoption ruling D38).
        changed = json.loads(original)
        changed['linkage']['high_links']['runners_with_a_counted_record'] += 1
        refused('high links alone', json.dumps(changed))
        other = self.source / 'identity-other.parquet'
        duckdb.connect().execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=21 AND distance='marathon' THEN 'medium' ELSE link_tier END AS link_tier) "
                                 f"FROM read_parquet('{self.identity}')) TO '{other}' (FORMAT parquet)")
        with self.assertRaisesRegex(AssertionError, 'runner or link class is not the identity file’s'):
            verify_cohort.verify(self.out, identity_path=other)
        # A file changed after the manifest was written; a file the manifest does not list.
        target = self.out / 'editions/good-2020.json.gz'
        data = target.read_bytes()
        target.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
        refused('size or checksum differs')
        target.write_bytes(data)
        (self.out / 'editions/extra-2020.json.gz').write_bytes(data)
        refused('manifest does not list')
        (self.out / 'editions/extra-2020.json.gz').unlink()
        # A file rewritten with another time and a manifest that follows its bytes: the decoded digest still tells.
        entry = next(e for e in self.manifest['editions'] if e['file'] == 'editions/good-2020.json.gz')
        edition = cohort.decode_edition(data)
        records = [(rid, u, sex, age, times, link) for rid, u, sex, age, times, link in zip(edition['ids'], edition['runner'], edition['sex'], edition['age'], edition['times'],
                                                                                           edition['link'])]
        records[0] = (*records[0][:4], [t + 1 for t in records[0][4]], records[0][5])
        others = list(zip(edition['other_ids'], edition['other_reasons'], edition['other_times']))
        changed = cohort.encode_edition('Good', 2020, 'counted', records, others)
        target.write_bytes(changed)
        refused('decoded values differ', original.replace(entry['sha256'], cohort.sha256(changed)).replace(f'"bytes":{entry["bytes"]},"sha256":"{cohort.sha256(changed)}"',
                                                                                                         f'"bytes":{len(changed)},"sha256":"{cohort.sha256(changed)}"'))
        target.write_bytes(data)
        # The status file is the other witness: a cohort built under another status is refused record by record.
        db = duckdb.connect()
        other = self.source / 'other-status.parquet'
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=23 THEN 'limited' ELSE status END AS status) FROM read_parquet('{self.status}')) TO '{other}' (FORMAT parquet)")
        with self.assertRaisesRegex(AssertionError, 'records differ between the cohort and the status file'):
            verify_cohort.verify(self.out, other, None)
        with self.assertRaisesRegex(AssertionError, 'eligible cohort'):
            build_cohort.build(self.source, self._with_sidecar(other), self.identity, self.source / 'refused', memory='1GB')

    def _with_sidecar(self, status):
        info = json.loads(Path(str(self.status) + '.json').read_text())
        info['file'] = {'name': status.name, 'bytes': status.stat().st_size, 'sha256': sha(status)}
        Path(str(status) + '.json').write_text(json.dumps(info))
        return status


    def test_an_undated_counted_edition_stops_the_build_and_a_series_comes_from_the_registry(self):
        """Lead rulings D27 and D29 (2026-11-14)."""
        db = duckdb.connect()
        meta = self.source / 'edition_meta.parquet'
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN year=2019 THEN NULL ELSE race_date END AS race_date, CASE WHEN year=2019 THEN NULL ELSE race_date_source END AS race_date_source) "
                   f"FROM read_parquet('{meta}')) TO '{self.source / 'undated.parquet'}' (FORMAT parquet)")
        kept = meta.read_bytes()
        (self.source / 'undated.parquet').replace(meta)
        with self.assertRaisesRegex(AssertionError, r"counted editions without a race date: \['Good 2019'\]"):
            build_cohort.build(self.source, self.status, self.identity, self.source / 'undated', memory='1GB')
        meta.write_bytes(kept)
        # A registry whose race `good` holds two series, written beside the input as the adapter's provenance names it.
        registry = self.source / 'race-registry.json'
        registry.write_text(json.dumps({'races': [
            {'race_id': 'good', 'series': [{'name': 'Good Marathon', 'first_year': 2019, 'last_year': 2019}, {'name': 'Good Marathon', 'first_year': 2020, 'last_year': 2020}]},
            {'race_id': 'own'}, {'race_id': 'held'}]}))
        provenance = json.loads((self.source / 'provenance.json').read_text())
        (self.source / 'provenance.json').write_text(json.dumps({**provenance, 'race_registry_sha256': sha(registry)}))
        import race_registry
        # The checked-in description of the identity file is named by its digest; another file is refused.
        described = self.source / 'identity.json'
        described.write_bytes(Path(str(self.identity) + '.json').read_bytes())
        with mock.patch.object(race_registry, 'FROZEN', registry):
            m = build_cohort.build(self.source, self.status, self.identity, self.source / 'series', memory='1GB', identity_description=described)
            self.assertEqual(m['inputs']['identity']['description'], {'file': 'analysis/identity.json', 'sha256': sha(described)})
            described.write_text('{}')
            with self.assertRaisesRegex(AssertionError, 'is not the description the identity builder wrote'):
                build_cohort.build(self.source, self.status, self.identity, self.source / 'described', memory='1GB', identity_description=described)
            self.assertEqual([(e['city'], e['year'], e['series']) for e in m['editions']], [('Good', 2019, 'Good Marathon'), ('Good', 2020, 'Good Marathon'), ('Own', 2021, None)])
            self.assertEqual(m['inputs']['race_registry']['sha256'], sha(registry))
            registry.write_text(registry.read_text() + ' ')
            with self.assertRaisesRegex(AssertionError, 'not the registry the adapted input was written from'):
                build_cohort.build(self.source, self.status, self.identity, self.source / 'other', memory='1GB')


if __name__ == '__main__':
    unittest.main()
