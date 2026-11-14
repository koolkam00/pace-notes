"""analysis/adapt_master.py on small synthetic releases: the folder it writes, determinism, and each loud failure."""
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapt_master  # noqa: E402
import download_release  # noqa: E402

TAG = 'master-20990101'
BASE_TAG = 'private-export-20981231-0000'
OVERLAY_TAG = 'dataset-20990101-0000'
QA_SCHEMA = ['record_uid:string', 'distance:string', 'distance_km:double', 'source_db:string', 'source_record_id:int64',
             'race:string', 'city:string', 'year:int64', 'edition_uid:string', 'runner:string', 'sex:string', 'age:int64',
             'age_group:string', 'age_or_group:string', 'bib:string', 'source_runner_id:string', 'split_5km:string',
             'split_10km:string', 'split_15km:string', 'split_20km:string', 'split_21_1km:string', 'split_25km:string',
             'split_30km:string', 'split_35km:string', 'split_40km:string', 'split_42_2km:string', 'finish_time:string',
             'finish_seconds:double', 'record_flags:string', 'analysis_exclude_flag:bool', 'in_core:bool', 'runner_id:string',
             'person_id:string', 'person_link_confidence:string', 'person_link_method:string', 'person_link_version:string',
             'person_unlinked_reason:string', 'verification_tier:string', 'finish_time_only:bool', 'source_url:string',
             'ingested_at:string']
EDITION_COLUMNS = ['edition_uid', 'distance', 'city', 'year', 'race', 'race_date', 'official_finishers', 'official_source_type',
                   'official_source_url', 'completeness_status', 'completeness_reason', 'has_splits', 'winner_m', 'winner_m_time',
                   'winner_f', 'winner_f_time', 'never_stamp', 'temp_c', 'feels_like_c', 'dewpoint_c', 'humidity_pct', 'wind_mps',
                   'precip_mm', 'temp_c_win_mean', 'weather_source', 'elev_gain_m', 'elev_loss_m', 'verification_tier',
                   'finish_time_only', 'rows_snapshot', 'rows_full', 'rows_core', 'rows_with_finish', 'rows_with_5k', 'package_note']
POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
# (city, year, status, rows): Testville 2019 is out of CORE, 2021 changes against the baseline, Newtown 2022 is new.
EDITIONS = [('Testville', 2019, 'excluded', 3), ('Testville', 2020, 'complete', 4), ('Testville', 2021, 'complete', 4),
            ('Newtown', 2022, 'complete', 3)]
WEATHER = {('Testville', 2020): 12.5, ('Testville', 2021): 15.0}
REVIEW = {'changed': [('Testville', 2021)], 'added': [('Newtown', 2022)], 'removed': [],
          'baseline_equal': ['race_conditions', 'course_profiles', 'course_segments'],
          'edition_meta_changed': [('Testville', 2021)], 'flags_changed': [('Testville', 2021)],
          'no_overlay_meta': [('Newtown', 2022)], 'excluded': [('Testville', 2019)]}


def clock(seconds):
    s = int(round(seconds))
    return f'{s // 3600:02}:{s % 3600 // 60:02}:{s % 60:02}'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def literal(path):
    return "'" + str(path).replace("'", "''") + "'"


def master_rows():
    out, rid = [], 100
    for city, year, status, n in EDITIONS:
        tier = {'complete': 'stamped', 'excluded': 'excluded_from_release'}.get(status, 'unverified')
        for i in range(n):
            rid += 1
            pace = 300 + 10 * i
            times = [clock(p * pace) for p in POINTS]
            if (city, year) == ('Testville', 2020) and i == 3:
                times[2] = None  # a missing split stays missing
            sex = ['M', 'F', 'X', None][i % 4]
            runner_id = None if city == 'Newtown' else (f'runner {i}|{sex}|yob:{1980 + i}' if i % 2 == 0 else f'runner {i}|{sex}|ag:40-44')
            if sex in ('X', None):
                runner_id = None
            # person_id (the cross-race key since adapter version 2): the v4 build for every record with a v1 key; in
            # Newtown (no v1 key, like New York 2026) one record joins runner 0 through the preliminary build, one has a
            # name-only series link (no key under the rule) and one has none.
            person = (f'p2_r{i}', 'high', 'exact_key', 'v4_20261030', None) if runner_id else (None, None, None, None, 'no_age_key')
            if city == 'Newtown':
                person = [('p2_r0', None, 'attach_unique', 'nyc2026_incremental_preliminary', None),
                          ('p2s_n1', 'low_series_name_only', 'series_name_sex_only', 'v4_20261030', None),
                          (None, None, None, None, None)][i]
            flags = {(101 + 0): 'release_exclude', 105: 'age_is_group_floor'}.get(rid)
            out.append([f'M-{rid}', 'marathon', 42.195, 'platform.sqlite', rid, f'{city} Marathon', city, year,
                        f'marathon|{city}|{year}', f'Runner {i}', sex, 30 + i, 'M30', 'M30', None, None,
                        *times[:4], None, *times[4:8], times[8], times[8], None, flags, rid == 101, tier != 'excluded_from_release',
                        runner_id, *person, tier, False, f'https://example.org/{rid}', '2026-01-01T00:00:00Z'])
    # One half row, which the adapter must leave out.
    out.append(['H-1', 'half', 21.0975, 'platform_half.sqlite', 1, 'Half', 'Testville', 2020, 'half|Testville|2020', 'Half Runner',
                'F', 40, None, None, '7', None, '00:25:00', '00:50:00', '01:15:00', '01:40:00', '01:45:00', None, None, None, None,
                None, '01:45:00', 6300.0, None, False, True, None, None, None, None, None, None, 'stamped', False, None, None])
    return out


class Fixture:
    """A synthetic master release, its overlay release and a baseline folder, with a pin naming their digests."""

    def __init__(self, root, mutate=None, after_master=None):
        self.root = root
        self.master, self.overlays, self.baseline = root / 'master', root / 'overlays', root / 'baseline'
        for folder in (self.master, self.overlays, self.baseline):
            folder.mkdir(parents=True)
        db = duckdb.connect()
        types = {'string': 'VARCHAR', 'int64': 'BIGINT', 'double': 'DOUBLE', 'bool': 'BOOLEAN'}
        columns = [c.split(':') for c in QA_SCHEMA]
        db.execute('CREATE TABLE m (' + ', '.join(f'"{c}" {types[t]}' for c, t in columns) + ')')
        db.executemany(f'INSERT INTO m VALUES ({",".join("?" * len(columns))})', master_rows())
        self.db = db
        self.write_overlays()
        self.write_editions()
        if mutate:
            mutate(self)
        self.write_master()
        if after_master:
            # A change after the master files are written: the baseline (built next) or one master file then differs.
            after_master(self)
            self.write_master_sums()
        self.write_baseline()
        self.pin = self.make_pin()

    def write_overlays(self):
        db, schemas = self.db, adapt_master.OVERLAY_SCHEMAS
        for name, columns in schemas.items():
            db.execute(f'CREATE TABLE ov_{name} (' + ', '.join(f'"{c}" {t}' for c, t in columns) + ')')
        hourly = '{"time": ["T09:00"], "temperature_2m": [12.5]}'
        for i, ((city, year), temp) in enumerate(sorted(WEATHER.items()), 1):
            row = {c: None for c, _ in schemas['race_conditions']}
            row.update(id=i, city=city, year=year, race=f'{city} Marathon', race_date=f'{year}-10-01', start_local='09:00',
                       timezone='UTC', temp_c=temp, dewpoint_c=8.0, humidity_pct=70.0, wind_mps=2.5, precip_mm=0.0,
                       observed_at=f'{year}-10-01T09:00', hourly_json=hourly, source='open-meteo')
            db.execute(f'INSERT INTO ov_race_conditions VALUES ({",".join("?" * len(row))})', list(row.values()))
        db.execute("INSERT INTO ov_course_profiles (id, city, race, course_key, distance_km, elev_gain_m, elev_loss_m, points_json, source) "
                   "VALUES (1, 'Testville', 'Testville Marathon', 'testville', 42.2, 10.0, 12.0, '[{\"d_km\": 0.0}]', 'gpx')")
        db.execute("INSERT INTO ov_course_segments (id, city, course_key, race, seg_from_km, seg_to_km, elev_net_m, source) "
                   "VALUES (1, 'Testville', 'testville', 'Testville Marathon', 0, 5, -1.0, 'gpx')")
        db.execute("INSERT INTO ov_sources (id, race, city, year, url) VALUES (1, 'Testville Marathon', 'Testville', 2020, 'https://example.org')")
        for i, (city, year, status, n) in enumerate(EDITIONS[:3], 1):
            db.execute('INSERT INTO ov_edition_meta (id, city, year, official_finishers, official_source_url, official_source_type, '
                       'official_checked_at, completeness_status, completeness_reason) VALUES (?,?,?,?,?,?,?,?,?)',
                       [i, city, year, float(n), 'https://example.org/count', 'organiser', '2026-01-01', status, f'DB {n} finishes'])
        db.execute("INSERT INTO ov_record_flags (record_id, city, year, note) VALUES (101, 'Testville', 2019, 'RELEASE_EXCLUDE virtual')")
        db.execute("INSERT INTO ov_record_flags (record_id, city, year, age_is_group_floor) VALUES (105, 'Testville', 2020, 1)")
        db.execute("INSERT INTO ov_record_flags (record_id, city, year, note) VALUES (109, 'Testville', 2021, 'finish filled')")

    def write_editions(self):
        db = self.db
        db.execute('CREATE TABLE e (' + ', '.join(f'"{c}" VARCHAR' for c in EDITION_COLUMNS) + ')')
        for city, year, status, n in EDITIONS:
            tier = {'complete': 'stamped', 'excluded': 'excluded_from_release'}.get(status, 'unverified')
            row = {c: None for c in EDITION_COLUMNS}
            temp = WEATHER.get((city, year))
            row.update(edition_uid=f'marathon|{city}|{year}', distance='marathon', city=city, year=str(year), race=f'{city} Marathon',
                       official_finishers=None if city == 'Newtown' else str(float(n)), official_source_type=None if city == 'Newtown' else 'organiser',
                       official_source_url=None if city == 'Newtown' else 'https://example.org/count', completeness_status=status,
                       completeness_reason=f'DB {n} finishes' + ('. Year verified (race 2022-10-02).' if city == 'Newtown' else ''), has_splits='1', never_stamp='false', verification_tier=tier,
                       finish_time_only='false', rows_snapshot=str(n), rows_full=str(n), rows_core='0' if status == 'excluded' else str(n),
                       rows_with_finish=str(n), rows_with_5k=str(n))
            if city == 'Newtown':
                row.update(official_finishers=str(float(n)), official_source_type='press', official_source_url='https://example.org/new')
            if temp is not None:
                row.update(temp_c=str(temp), dewpoint_c='8.0', humidity_pct='70.0', wind_mps='2.5', precip_mm='0.0')
            if city == 'Testville':
                row.update(elev_gain_m='10.0', elev_loss_m='12.0')
            db.execute(f'INSERT INTO e VALUES ({",".join("?" * len(row))})', list(row.values()))
        db.execute("INSERT INTO e (edition_uid, distance, city, year, verification_tier, rows_full) VALUES ('half|Testville|2020', 'half', 'Testville', '2020', 'stamped', '1')")

    def write_master(self):
        db, folder = self.db, self.master
        db.execute(f"COPY (SELECT * FROM m ORDER BY record_uid) TO {literal(folder / 'master_results_FULL.parquet')} (FORMAT parquet)")
        db.execute(f"COPY (SELECT * FROM e) TO {literal(folder / 'editions.csv')} (HEADER)")
        db.execute(f"COPY (SELECT edition_uid, distance, city, year, verification_tier, finish_time_only, rows_snapshot, rows_full, rows_core, "
                   f"package_note FROM e) TO {literal(folder / 'MANIFEST_editions.csv')} (HEADER)")
        db.execute(f"COPY (SELECT record_id, city, year, division, division_evidence, " + ', '.join(
            f'CAST({c} AS BIGINT) AS {c}' for c in ['dnf_split_as_finish', 'split_nonmonotonic', 'last_split_after_finish', 'pace_implausible'])
            + ", shifted_mat, " + ', '.join(f'CAST({c} AS BIGINT) AS {c}' for c in ['age_is_group_floor', 'sex_fixed_from_category', 'splits_corrected'])
            + f", note, updated_at FROM ov_record_flags) TO {literal(folder / 'marathon_record_flags_detail.parquet')} (FORMAT parquet)")
        (folder / 'NYC2026_rows_missing_splits.csv').write_text('record_uid,status\n')
        full = db.execute("SELECT count(*) FROM m WHERE distance='marathon'").fetchone()[0]
        core = db.execute("SELECT count(*) FROM m WHERE distance='marathon' AND in_core").fetchone()[0]
        qa = {'full_rows': {'marathon': full, 'half': 1}, 'core_rows': {'marathon': core, 'half': 1}, 'dup_record_uid_full': 0,
              'nyc2026_rows_with_all_8_splits': 0, 'schema': QA_SCHEMA}
        if hasattr(self, 'qa_override'):
            qa.update(self.qa_override)
        (folder / 'QA-REPORT.json').write_text(json.dumps(qa))
        (folder / 'README.md').write_text('# Synthetic master\nSnapshot: synthetic, 2099-01-01.\n')
        for name in ['DATA_DICTIONARY.md', 'CHANGELOG.md', 'sources.csv']:
            (folder / name).write_text(f'synthetic {name}\n')
        self.write_master_sums()
        for name, _ in adapt_master.OVERLAY_SCHEMAS.items():
            db.execute(f"COPY (SELECT * FROM ov_{name}) TO {literal(self.overlays / adapt_master.OVERLAY_ASSET.format(name))} "
                       "(HEADER, COMPRESSION zstd)")
        (self.overlays / 'SHA256SUMS').write_text(''.join(
            f'{sha(p)}  {p.name}\n' for p in sorted(self.overlays.iterdir()) if p.name != 'SHA256SUMS'))

    def write_master_sums(self):
        names = sorted(adapt_master.MASTER_ASSETS)
        (self.master / 'SHA256SUMS').write_text(''.join(f'{sha(self.master / n)}  ./{n}\n' for n in names))

    def write_baseline(self):
        """The previous release: Testville 2020 and 2021 only, 2021 without its finish times; overlays as the CSV, except
        2021's edition status and flag note."""
        db, folder = self.db, self.baseline
        cols = ', '.join(f'CAST({"source_record_id" if c == "id" else c} AS {t}) AS {c}' for c, t in adapt_master.RACE_RECORDS)
        db.execute(f"""CREATE TABLE before AS SELECT * REPLACE (CASE WHEN year=2021 THEN NULL ELSE split_42_2km END AS split_42_2km)
          FROM (SELECT {cols} FROM m WHERE distance='marathon' AND city='Testville' AND year IN (2020, 2021))""")
        sums = adapt_master.edition_checksums(db, 'before')
        lines = ['city,year,n_records,sha256_records', 'Testville,2019,0,'] + [f'{c},{y},{n},{d}' for (c, y), (n, d) in sorted(sums.items())]
        (folder / 'EDITION-CHECKSUMS.csv').write_text('\n'.join(lines) + '\n')
        (folder / 'EDITIONS.json').write_text('[]\n')
        for name in ['race_conditions', 'course_profiles', 'course_segments', 'edition_meta', 'record_flags']:
            query = f'SELECT * FROM ov_{name}'
            if name == 'edition_meta':
                query = "SELECT * REPLACE (CASE WHEN year=2021 THEN 'hold' ELSE completeness_status END AS completeness_status) FROM ov_edition_meta"
            if name == 'record_flags':
                query = "SELECT * REPLACE (CASE WHEN record_id=109 THEN 'finish missing' ELSE note END AS note) FROM ov_record_flags WHERE year<>2019"
            db.execute(f"COPY ({query}) TO {literal(folder / (name + '.parquet'))} (FORMAT parquet)")
        files = {n: {'sha256': sha(folder / n)} for n in adapt_master.BASELINE_MEMBERS if n not in ('MANIFEST.json', 'SHA256SUMS.txt')}
        (folder / 'MANIFEST.json').write_text(json.dumps({'files': files}))
        listing = {**{n: f['sha256'] for n, f in files.items()}, 'MANIFEST.json': sha(folder / 'MANIFEST.json')}
        (folder / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
        (folder / 'provenance.json').write_text(json.dumps({'release_tag': BASE_TAG, 'asset': 'pace-notes-CORE-x.tar.gz', 'asset_sha256': 'a' * 64}))

    def make_pin(self):
        return {'repository': 'example/pace-notes', 'tag': TAG, 'layout': 'master', 'published_at': '2099-01-01T00:00:00Z',
                'sha256sums_sha256': sha(self.master / 'SHA256SUMS'),
                'assets': {n: sha(self.master / n) for n in sorted(adapt_master.MASTER_ASSETS)},
                'overlays': {'tag': OVERLAY_TAG, 'sha256sums_sha256': sha(self.overlays / 'SHA256SUMS'),
                             'assets': {adapt_master.OVERLAY_ASSET.format(n): sha(self.overlays / adapt_master.OVERLAY_ASSET.format(n))
                                        for n in adapt_master.OVERLAY_SCHEMAS}},
                'baseline': {'tag': BASE_TAG, 'asset': 'pace-notes-CORE-x.tar.gz', 'sha256': 'a' * 64,
                             'checksums_asset': 'RELEASE-SHA256SUMS-x.txt', 'checksums_sha256': 'b' * 64}}

    def adapt(self, output, bundle='FULL', pin=None):
        return adapt_master.adapt(pin or self.pin, output, bundle, [self.master, self.overlays], self.baseline, memory='1GB')


def offline():
    raise AssertionError('the tests never touch the network')


IDENTITY = {'versions': {'v4_20261030': ['high', 'medium', 'low']}, 'preliminary_versions': ['nyc2026_incremental_preliminary'],
            'unkeyed_confidences': ['low_series_name_only', 'withheld_too_many_candidates']}
RACE_DATES = {'releases': {TAG: [{'city': 'Newtown', 'year': 2022, 'date': '2022-10-02', 'source': 'synthetic',
                                  'evidence_text': 'Year verified (race 2022-10-02)'}]}}


@mock.patch.dict(adapt_master.REVIEWED, {TAG: REVIEW})
@mock.patch.dict(adapt_master.IDENTITY, {TAG: IDENTITY})
@mock.patch.object(adapt_master, '_opener', offline)
class AdaptMaster(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        dates = self.root / 'reviewed-race-dates.json'
        dates.write_text(json.dumps(RACE_DATES))
        patcher = mock.patch.object(adapt_master, 'RACE_DATES_PATH', dates)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def fixture(self, name='f', mutate=None, after_master=None):
        return Fixture(self.root / name, mutate, after_master)

    def test_an_unreviewed_link_confidence_stops_the_adapter(self):
        fx = self.fixture(mutate=lambda f: f.db.execute("UPDATE m SET person_link_confidence='rejected' WHERE source_record_id=104"))
        with self.assertRaisesRegex(adapt_master.AdaptError, 'identity rule has not reviewed'):
            fx.adapt(self.root / 'out')

    def test_a_reviewed_race_date_needs_its_evidence(self):
        fx = self.fixture(mutate=lambda f: f.db.execute("UPDATE e SET completeness_reason='DB 3 finishes' WHERE city='Newtown'"))
        with self.assertRaisesRegex(adapt_master.AdaptError, 'reviewed race date Newtown 2022'):
            fx.adapt(self.root / 'out')

    def test_writes_the_pace_notes_input(self):
        fx = self.fixture()
        out = self.root / 'out'
        provenance = fx.adapt(out)
        members = {p.name for p in out.iterdir() if p.is_file()} - {'provenance.json'}
        self.assertEqual(members, adapt_master.EXPECTED_MASTER_FULL)
        self.assertEqual(provenance['release_tag'], TAG)
        self.assertEqual(provenance['layout'], 'master')
        self.assertEqual(provenance['asset_sha256'], fx.pin['assets']['master_results_FULL.parquet'])
        self.assertEqual(sha(out / provenance['asset_path']), provenance['asset_sha256'])
        self.assertEqual(provenance['manifest_sha256'], sha(out / 'MANIFEST.json'))
        db = duckdb.connect()
        rr = literal(out / 'race_records.parquet')
        self.assertEqual([(c, t) for c, t, *_ in db.execute(f'DESCRIBE SELECT * FROM read_parquet({rr})').fetchall()],
                         adapt_master.RACE_RECORDS)
        # Only CORE marathon rows: Testville 2019 (out of CORE) and the half row are left out.
        self.assertEqual(db.execute(f'SELECT city, year, count(*) FROM read_parquet({rr}) GROUP BY ALL ORDER BY 1,2').fetchall(),
                         [('Newtown', 2022, 3), ('Testville', 2020, 4), ('Testville', 2021, 4)])
        f = literal(out / 'features.parquet')
        row = db.execute(f"SELECT sex, yob, seg_05, cum_10, finish_time, runner_id, is_ambiguous FROM read_parquet({f}) WHERE record_id=104").fetchone()
        self.assertEqual(row[:2], ('M', 1980))
        self.assertAlmostEqual(row[2], 25.0)
        self.assertAlmostEqual(row[3], 50.0)
        self.assertAlmostEqual(row[4], 42.195 * 5, places=1)
        self.assertEqual(row[5:], ('p2_r0', False))  # yob still comes from the v1 key (row[1])
        # Recorded X becomes null as in 1050's features; no runner_id, no key and no ambiguity claim.
        self.assertEqual(db.execute(f"SELECT sex, runner_id, is_ambiguous, yob FROM read_parquet({f}) WHERE record_id=106").fetchone(),
                         (None, None, None, None))
        # The key is person_id (adapter version 2): the v4 link of record 104, the preliminary link that joins Newtown's
        # first record to runner 0, no key for a name-only series link; the reviewed race date fills Newtown's (no weather).
        self.assertEqual(db.execute(f"SELECT runner_id, match_key, link_preliminary FROM read_parquet({f}) WHERE record_id=104").fetchone(),
                         ('p2_r0', 'p2_r0', False))
        self.assertEqual(db.execute(f"SELECT record_id, runner_id, is_ambiguous, link_preliminary, race_date FROM read_parquet({f}) "
                                    "WHERE city='Newtown' ORDER BY record_id").fetchall(),
                         [(112, 'p2_r0', False, True, '2022-10-02'), (113, None, None, None, '2022-10-02'),
                          (114, None, None, None, '2022-10-02')])
        self.assertEqual(db.execute(f"SELECT DISTINCT race_date FROM read_parquet({f}) WHERE city='Testville' AND year=2020").fetchall(), [('2020-10-01',)])
        manifest_deps = json.loads((out / 'MANIFEST.json').read_text())['dependencies']
        self.assertEqual(sorted(manifest_deps), ['duckdb'], 'the interpreter is left out, so the manifest digest does not depend on it')
        # A missing split stays missing: 15 km is absent for record 107, so seg_15, seg_20 and cum_15 are null.
        self.assertEqual(db.execute(f"SELECT seg_15, seg_20, cum_15 FROM read_parquet({f}) WHERE record_id=107").fetchone(), (None, None, None))
        # Overlays equal to the baseline keep its bytes; the others are rewritten in 1050's schema.
        for name in ['race_conditions', 'course_profiles', 'course_segments']:
            self.assertEqual(sha(out / f'{name}.parquet'), sha(fx.baseline / f'{name}.parquet'))
        meta = db.execute(f"SELECT city, year, completeness_status, id FROM read_parquet({literal(out / 'edition_meta.parquet')}) ORDER BY id NULLS LAST").fetchall()
        self.assertEqual(meta[-1], ('Newtown', 2022, 'complete', None))
        self.assertEqual(db.execute(f"SELECT list(record_id ORDER BY record_id) FROM read_parquet({literal(out / 'record_flags.parquet')})").fetchone()[0], [105, 109])
        report = json.loads((out / 'RECONCILIATION.json').read_text())
        self.assertEqual(report['checksum_delta']['unchanged'], 1)
        self.assertEqual([x['edition'] for x in report['checksum_delta']['changed']], ['Testville 2021'])
        self.assertEqual([x['edition'] for x in report['checksum_delta']['added']], ['Newtown 2022'])
        self.assertEqual(report['checksum_delta']['baseline_empty'], ['Testville 2019'])
        manifest = json.loads((out / 'MANIFEST.json').read_text())
        self.assertEqual(manifest['document'], adapt_master.LABEL)
        self.assertEqual((manifest['n_records'], manifest['n_cities'], manifest['n_editions']), (11, 2, 3))
        self.assertEqual(manifest['created_at'], '2099-01-01T00:00:00Z')
        self.assertEqual(manifest['producer_snapshot_claim'], 'Snapshot: synthetic, 2099-01-01.')
        self.assertEqual([(e['city'], e['year']) for e in manifest['excluded_editions']], [('Testville', 2019)])
        editions = json.loads((out / 'EDITIONS.json').read_text())
        self.assertEqual([(e['city'], e['year'], e['n_records'], e['excluded']) for e in editions],
                         [('Newtown', 2022, 3, False), ('Testville', 2019, 3, True), ('Testville', 2020, 4, False), ('Testville', 2021, 4, False)])
        for name in adapt_master.DOC_MEMBERS:
            if name.endswith('.md'):
                self.assertIn(adapt_master.LABEL, (out / name).read_text().splitlines()[2], name)
        listed = adapt_master.parse_sums((out / 'SHA256SUMS.txt').read_text())
        self.assertEqual(set(listed), adapt_master.EXPECTED_MASTER_FULL - {'SHA256SUMS.txt'})
        self.assertTrue(all(sha(out / n) == d for n, d in listed.items()))

    def test_deterministic_and_core(self):
        fx = self.fixture()
        fx.adapt(self.root / 'a')
        fx.adapt(self.root / 'b')
        fx.adapt(self.root / 'c', bundle='CORE')
        for name in sorted(adapt_master.EXPECTED_MASTER_FULL):
            self.assertEqual(sha(self.root / 'a' / name), sha(self.root / 'b' / name), name)
        self.assertFalse((self.root / 'c' / 'features.parquet').exists())
        self.assertEqual((self.root / 'a' / 'SHA256SUMS.txt').read_bytes(), (self.root / 'c' / 'SHA256SUMS.txt').read_bytes())
        self.assertEqual(json.loads((self.root / 'c' / 'provenance.json').read_text())['bundle'], 'CORE')

    def assertFails(self, message, fixture=None, pin=None, mutate=None, after_master=None):
        fx = fixture or self.fixture(f'f{len(list(self.root.iterdir()))}', mutate, after_master)
        out = self.root / f'out{len(list(self.root.iterdir()))}'
        with self.assertRaisesRegex(adapt_master.AdaptError, message):
            fx.adapt(out, pin=pin)
        if out.exists():
            self.assertFalse({p.name for p in out.iterdir() if p.is_file()} & (adapt_master.EXPECTED_MASTER_FULL | {'provenance.json'}),
                             'a failed run leaves no member behind')

    def test_pin_and_sums(self):
        fx = self.fixture()
        with self.subTest('not a master pin'):
            self.assertFails('master-layout', fx, {**fx.pin, 'layout': 'pace-notes'})
        with self.subTest('an unreviewed tag'):
            self.assertFails('no reviewed adapter expectations', fx, {**fx.pin, 'tag': 'master-20990102'})
        with self.subTest('an asset missing from the pin'):
            assets = dict(fx.pin['assets']); assets.pop('sources.csv')
            self.assertFails('exactly these master assets', fx, {**fx.pin, 'assets': assets})
        with self.subTest('a pinned digest the release does not list'):
            assets = {**fx.pin['assets'], 'sources.csv': 'c' * 64}
            self.assertFails('does not list sources.csv', fx, {**fx.pin, 'assets': assets})
        with self.subTest('another SHA256SUMS'):
            # The folder no longer matches the pin, so the adapter would download, which these tests never allow.
            with self.assertRaisesRegex(AssertionError, 'network'):
                fx.adapt(self.root / 'net', pin={**fx.pin, 'sha256sums_sha256': 'd' * 64})
        with self.subTest('a file that differs from its listed digest'):
            bad = self.fixture('bad')
            (bad.master / 'CHANGELOG.md').write_text('changed after the checksums\n')
            self.assertFails('differs from the pinned digest', bad)
        with self.subTest('another baseline'):
            base = {**fx.pin['baseline'], 'sha256': 'e' * 64}
            self.assertFails('not the pinned baseline', fx, {**fx.pin, 'baseline': base})
        with self.subTest('public downloads only'):
            with self.assertRaisesRegex(adapt_master.AdaptError, 'public github.com'):
                adapt_master.public_request('https://api.github.com/repos/x/y/releases/download/t/a')
            self.assertEqual(adapt_master.parse_sums('%s  ./a.csv\n' % ('0' * 64)), {'a.csv': '0' * 64})

    def test_reconciliation_failures(self):
        def qa(total):
            def mutate(fx):
                fx.qa_override = {'full_rows': {'marathon': total, 'half': 1}}
            return mutate

        def run(sql):
            return lambda fx: fx.db.execute(sql)
        cases = [
            ('differ from QA-REPORT', qa(99)),
            ('record contract', run("UPDATE m SET record_uid='M-9999' WHERE source_record_id=104")),
            ('record contract', run("UPDATE m SET split_21_1km='01:00:00' WHERE source_record_id=104")),
            ('editions.csv disagrees with the measured', run("UPDATE e SET rows_with_finish='2' WHERE city='Newtown'")),
            ('record_flags differ from the producer derivation', run("UPDATE m SET record_flags='pace_implausible' WHERE source_record_id=104")),
            ('overlay edition_meta', run("UPDATE e SET completeness_reason='other' WHERE city='Testville' AND year='2020'")),
            ('weather disagrees', run("UPDATE e SET temp_c='13.0' WHERE city='Testville' AND year='2020'")),
            ('elevation has no matching', run("UPDATE e SET elev_gain_m='11.0' WHERE city='Testville' AND year='2020'")),
        ]
        for message, mutate in cases:
            with self.subTest(message):
                self.assertFails(message, mutate=mutate)
        detail = lambda fx: fx.db.execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=109 THEN 'other' ELSE note END AS note) FROM read_parquet("
                                          f"{literal(fx.master / 'marathon_record_flags_detail.parquet')})) TO "
                                          f"{literal(fx.root / 'flags.parquet')} (FORMAT parquet)") and shutil.move(
            fx.root / 'flags.parquet', fx.master / 'marathon_record_flags_detail.parquet')
        later = [
            # The detail table's note changes, so its derivation still agrees with record_flags but not the overlay CSV.
            ('differs from the overlay record_flags', detail),
            # The baseline's weather differs from the overlay (built from the table after the CSV was written).
            ('reviewed to equal the baseline', run("UPDATE ov_race_conditions SET hourly_json='{}' WHERE year=2020")),
            # A record the review did not list changes against the baseline.
            ('edition checksums', run("UPDATE m SET runner='Renamed' WHERE source_record_id=104")),
        ]
        for message, after in later:
            with self.subTest(message):
                self.assertFails(message, after_master=after)

    def test_manifest_editions_mismatch(self):
        # MANIFEST_editions.csv is written from editions.csv, so it can only disagree when edited afterwards.
        fx = self.fixture()
        path = fx.master / 'MANIFEST_editions.csv'
        path.write_text(path.read_text().replace('marathon|Newtown|2022,marathon,Newtown,2022,stamped', 'marathon|Newtown|2022,marathon,Newtown,2022,unverified'))
        (fx.master / 'SHA256SUMS').write_text(''.join(f'{sha(fx.master / n)}  ./{n}\n' for n in sorted(adapt_master.MASTER_ASSETS)))
        self.assertFails('MANIFEST_editions.csv differs', fx, fx.make_pin())

    def test_reviewed_lists_bind(self):
        fx = self.fixture()
        for key, value, message in [('changed', [], 'edition checksums'), ('excluded', [], 'out of CORE'),
                                    ('edition_meta_changed', [], 'edition_meta changed'), ('flags_changed', [], 'record flags changed'),
                                    ('no_overlay_meta', [], 'overlay edition_meta')]:
            with self.subTest(key), mock.patch.dict(adapt_master.REVIEWED, {TAG: {**REVIEW, key: value}}):
                self.assertFails(message, fx)

    def test_downloader_hands_the_master_pin_to_the_adapter(self):
        fx = self.fixture()
        checkout = self.root / 'checkout' / 'analysis'
        checkout.mkdir(parents=True)
        (checkout / 'release.json').write_text(json.dumps(fx.pin))
        calls = []
        with mock.patch.object(download_release, '__file__', str(checkout / 'download_release.py')), \
                mock.patch.object(adapt_master, 'adapt', lambda pin, output, bundle: calls.append((pin['tag'], bundle)) or {}):
            download_release.main(['--output', str(self.root / 'dl'), '--bundle', 'CORE'])
            self.assertEqual(calls, [(TAG, 'CORE')])
            with self.assertRaisesRegex(ValueError, 'adapted only as the tag'):
                download_release.main(['--output', str(self.root / 'dl'), '--tag', 'master-20990102'])
        (checkout / 'release.json').write_text(json.dumps({**fx.pin, 'layout': 'pace-notes'}))
        with mock.patch.object(download_release, '__file__', str(checkout / 'download_release.py')):
            with self.assertRaisesRegex(ValueError, 'adapted only as the tag'):
                download_release.main(['--output', str(self.root / 'dl')])

    def test_audit_and_runner_context_read_the_adapted_folder(self):
        import audit_release
        import build_runner_context
        fx = self.fixture()
        full, core = self.root / 'full', self.root / 'core'
        fx.adapt(full)
        fx.adapt(core, bundle='CORE')
        out = self.root / 'audit' / 'release-contract.json'
        audit_release.audit(full, core, None, out)
        report = json.loads(out.read_text())
        self.assertEqual(report['master_reconciliation']['rows_differ'], 0)
        self.assertEqual(report['master_reconciliation']['rows_equal_or_differ'], 11)
        self.assertEqual(report['producer_counts']['editions_json_excluded'], ['Testville 2019'])
        self.assertTrue(report['core_full_shared_hashes_match'])
        self.assertTrue(all(row['valid_mismatches'] == 0 for row in report['timings']))
        provenance = json.loads((full / 'provenance.json').read_text())
        self.assertEqual(set(build_runner_context.verified_inputs(full, provenance)), set(build_runner_context.FILES))
        # A record changed after adaptation, with every adapter document rewritten to match, still fails: the audit compares
        # the folder with the producer's master file, not with the adapter's own documents.
        db = duckdb.connect()
        rr = full / 'race_records.parquet'
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN id=104 THEN 'Changed' ELSE runner END AS runner) FROM read_parquet({literal(rr)}) ORDER BY id) "
                   f"TO {literal(self.root / 'rr.parquet')} (FORMAT parquet)")
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=104 THEN 'Changed' ELSE runner_name END AS runner_name) FROM "
                   f"read_parquet({literal(full / 'features.parquet')}) ORDER BY record_id) TO {literal(self.root / 'f.parquet')} (FORMAT parquet)")
        shutil.move(self.root / 'rr.parquet', rr)
        shutil.move(self.root / 'f.parquet', full / 'features.parquet')
        manifest = json.loads((full / 'MANIFEST.json').read_text())
        for name in ('race_records.parquet', 'features.parquet'):
            manifest['files'][name].update(bytes=(full / name).stat().st_size, sha256=sha(full / name))
        (full / 'MANIFEST.json').write_text(json.dumps(manifest))
        listing = {n: f['sha256'] for n, f in manifest['files'].items()}
        listing['MANIFEST.json'] = sha(full / 'MANIFEST.json')
        (full / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
        provenance['manifest_sha256'] = sha(full / 'MANIFEST.json')
        (full / 'provenance.json').write_text(json.dumps(provenance))
        with self.assertRaisesRegex(AssertionError, "rows_differ': 1"):
            audit_release.audit(full, None, None, out)
        # Runner context re-hashes the master file and each member against the adapted manifest.
        (full / 'course_segments.parquet').write_bytes(b'changed')
        with self.assertRaisesRegex(AssertionError, 'course_segments.parquet differs'):
            build_runner_context.verified_inputs(full, provenance)
        (full / provenance['asset_path']).unlink()
        shutil.copyfile(fx.master / 'README.md', full / provenance['asset_path'])
        with self.assertRaisesRegex(AssertionError, 'Master results file checksum mismatch'):
            build_runner_context.verified_inputs(full, provenance)

    def test_repository_pin(self):
        """The master pin is complete and names a reviewed tag (no network).

        2026-11-14: analysis/release.json now pins the combined release pace-notes-marathon-half-20261113-1113
        (analysis/adapt_combined.py; its pin and the weather pin are checked in test_adapt_combined.py). The master pin is
        kept whole as analysis/release-master-20261103b.json, the bytes main held, because the audit of the new release
        rebuilds the previous input from it (adapt_master.py --pin); the expectations below are unchanged."""
        pin = adapt_master.load_pin(adapt_master.PIN_PATH.with_name('release-master-20261103b.json'))
        self.assertEqual(pin['tag'], 'master-20261103b')
        self.assertEqual(pin['assets']['master_results_FULL.parquet'], '41d575cde127c94a9acf4242cc4d385701bb1e7568ba2e8ee65e4341e15b69db')
        self.assertEqual(pin['baseline']['sha256'], 'b594fb6c79663962b31562ca27b53d83a7466ee9d2ea4403010502a2ebe60de8')
        self.assertEqual(pin['overlays']['assets']['marathon-race_conditions.csv.zst'], '4a781f7cecb1bd8dd6b1e883a0b5c25b63bf3937bfa6219ed08c710be50ad3b5')
        # The adopted pin is no longer a master pin, so the default loader refuses it; a master tag is rebuilt only with --pin.
        with self.assertRaisesRegex(adapt_master.AdaptError, 'not a master-layout release'):
            adapt_master.load_pin()

if __name__ == '__main__':
    unittest.main()
