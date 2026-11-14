"""analysis/adapt_combined.py on a small synthetic combined release: the folder it writes, determinism, each loud failure."""
import csv
import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapt_combined  # noqa: E402
import adapt_master  # noqa: E402
import download_release  # noqa: E402

TAG = 'pace-notes-marathon-half-20990101-0000'
BASE_TAG = 'private-export-20981231-0000'
ARCHIVE = 'pace-notes-CORE-20990101-0000.tar.gz'
SUMS = 'RELEASE-SHA256SUMS-20990101-0000.txt'
POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
NEWTOWN = 'Newtown, NT: Newtown Marathon'
# (city, year, tier, split tier, official finishers, completeness note): Oldtown 2019 is excluded (no rows), Newtown is
# finish-time only with a composite city key and a date only in the producer's note (kept apart, never the race date),
# Testville 2021 has no date at all.
EDITIONS = [('Testville', 2020, 'stamped', 'splits', 4.0, 'DB 4 vs official 4'),
            ('Testville', 2021, 'partial', 'splits', 5.0, 'DB 4 vs official 5'),
            (NEWTOWN, 2022, 'unverified', 'finish_time_only', None, 'internal count only db=3 rows=3 platform=x date=2022-10-02 splits=finish only'),
            ('Oldtown', 2019, 'excluded', None, None, None)]
IDENTITY = {'build': 'person-ids v5.1', 'prefix': 'p51_', 'keyed_confidences': ['high_elite', 'high', 'medium'],
            'possible_confidences': ['medium_variant', 'low', 'low_noage']}
ROW_RULE = {'pending_review_flags': ['wheelchair_handcycle_published_category'], 'qa_row_flags': ['finish_faster_than_world_record', 'finish_zero'],
            'kept_unlabelled': ['adaptive_division_published_category']}
RACE_DATES = {'releases': {TAG: []}}


def clock(seconds):
    s = int(round(seconds))
    return f'{s // 3600:02}:{s % 3600 // 60:02}:{s % 60:02}'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def literal(path):
    return "'" + str(path).replace("'", "''") + "'"


def result_rows():
    """Marathon ids 101-111; half ids 101 and 102 in the half id space (101 repeats a marathon id) and 201 from a marathon list."""
    out, rid = [], 100
    for city, year, tier, split_tier, _, _ in EDITIONS:
        if tier == 'excluded':
            continue
        for i in range(3 if city == NEWTOWN else 4):
            rid += 1
            pace = 300 + 10 * i
            times = [clock(p * pace) for p in POINTS]
            if split_tier == 'finish_time_only':
                times[:8] = [None] * 8
            if rid == 104:
                times[2] = None  # a missing split stays missing
            sex = ['M', 'F', 'X', None][i % 4]
            out.append(['marathon', 'full', rid, f'{city} Race', year, city, 42.195, f'Runner {i}', sex, float(30 + i) if i % 2 == 0 else None, 'M30', 'M30',
                        *times[:4], None, *times[4:8], times[8], times[8], None, None, f'https://example.org/{rid}', '2026-01-01T00:00:00Z'])
    for source_db, rid in (('half', 101), ('half', 102), ('full', 201)):
        out.append(['half', source_db, rid, 'Half Race', 2020, 'Halfville', 21.0975, f'Half Runner {rid}', 'F', 40.0, None, None, '00:25:00', '00:50:00',
                    '01:15:00', '01:40:00', '01:45:00', None, None, None, None, None, '01:45:00', '7' if source_db == 'half' else None,
                    'src' if source_db == 'half' else None, None, None])
    return out


class Fixture:
    """A synthetic combined release in a folder (assets and checksum file), a baseline folder, and a pin naming them."""

    def __init__(self, root, mutate=None, manifest=None, tamper=None):
        self.root, self.release, self.core, self.baseline = root, root / 'release', root / 'core', root / 'baseline'
        for folder in (self.release, self.core, self.baseline):
            folder.mkdir(parents=True)
        self.db = db = duckdb.connect()
        types = {'distance': 'VARCHAR', 'source_db': 'VARCHAR', 'id': 'BIGINT', 'year': 'BIGINT', 'distance_km': 'DOUBLE', 'age': 'DOUBLE'}
        db.execute('CREATE TABLE rr (' + ', '.join(f'"{c}" {types.get(c, "VARCHAR")}' for c in adapt_combined.SOURCE_COLUMNS) + ')')
        db.executemany(f'INSERT INTO rr VALUES ({",".join("?" * 27)})', result_rows())
        self.tables()
        if mutate:
            mutate(self)
        self.write_core(manifest)
        if tamper:
            tamper(self)
        self.write_release()
        self.write_baseline()
        self.pin = self.make_pin()
        self.claims = self.make_claims()
        self.review = {'baseline_equal': ['race_conditions', 'course_profiles', 'course_segments'], 'left_out': 2, 'written_rows': 9,
                       'known_mismatches': []}

    def tables(self):
        db = self.db
        flags = ', '.join(f'{f} BOOLEAN' for f in adapt_combined.QA_FLAGS)
        db.execute(f'CREATE TABLE qa (distance VARCHAR, source_db VARCHAR, record_id BIGINT, city VARCHAR, year BIGINT, {flags}, sex_from_category VARCHAR)')

        def qa(rid, **values):
            row = {'distance': 'marathon', 'source_db': 'full', 'record_id': rid, 'city': 'Testville', 'year': 2020,
                   **{f: False for f in adapt_combined.QA_FLAGS}, 'sex_from_category': None, **values}
            db.execute(f'INSERT INTO qa VALUES ({",".join("?" * len(row))})', list(row.values()))
        qa(102, finish_faster_than_world_record=True)   # left out
        qa(103, split_nonmonotonic=True)                # kept
        qa(104, sex_from_category='F')                  # blank sex takes the published category
        db.execute('CREATE TABLE pend (distance VARCHAR, source_db VARCHAR, record_id BIGINT, city VARCHAR, year BIGINT, flag VARCHAR, detail VARCHAR, '
                   'present_in_core BOOLEAN, decision VARCHAR)')
        db.execute("INSERT INTO pend VALUES ('marathon', 'full', 102, 'Testville', 2020, 'wheelchair_handcycle_published_category', 'x', true, 'pending'), "
                   "('marathon', 'full', 106, 'Testville', 2021, 'wheelchair_handcycle_published_category', 'x', true, 'pending'), "
                   "('marathon', 'full', 107, 'Testville', 2021, 'adaptive_division_published_category', 'x', true, 'pending'), "
                   "('marathon', 'full', 999, 'Testville', 2021, 'wheelchair_handcycle_published_category', 'x', false, 'pending')")
        db.execute('CREATE TABLE rf (distance VARCHAR, source_db VARCHAR, record_id BIGINT, city VARCHAR, year BIGINT, flag VARCHAR, detail VARCHAR)')
        db.execute("INSERT INTO rf VALUES ('marathon', 'full', 102, 'Testville', 2020, 'note', 'left out with its record'), "
                   "('marathon', 'full', 105, 'Testville', 2021, 'shifted_mat', '25k mat early'), ('marathon', 'full', 105, 'Testville', 2021, 'pace_implausible', NULL)")
        db.execute('CREATE TABLE rx (distance VARCHAR, source_db VARCHAR, record_id BIGINT, city VARCHAR, year BIGINT, category VARCHAR, scope VARCHAR, reason VARCHAR)')
        db.execute("INSERT INTO rx VALUES ('marathon', 'full', 901, 'Oldtown', 2019, 'virtual_race', 'whole_edition', 'virtual'), "
                   "('marathon', 'full', 902, 'Oldtown', 2019, 'virtual_race', 'whole_edition', 'virtual')")
        db.execute("CREATE TABLE excl AS SELECT 'marathon' AS distance, 'full' AS source_db, 'Oldtown' AS city, 2019 AS year, 'virtual_race' AS category, "
                   "'whole_edition' AS scope, 2 AS n_rows, 'virtual' AS reason")
        meta = adapt_master.OVERLAY_SCHEMAS['edition_meta']
        extra = [('verification_tier', 'VARCHAR'), ('verified_badge', 'BOOLEAN'), ('weaker_source', 'BOOLEAN'), ('split_tier', 'VARCHAR'),
                 ('release_exclusion', 'VARCHAR'), ('release_note', 'VARCHAR')] + [(c, 'VARCHAR') for c in adapt_combined.EDITION_META_HALF_ONLY]
        db.execute('CREATE TABLE em (distance VARCHAR, source_db VARCHAR, ' + ', '.join(f'"{c}" {t}' for c, t in meta + extra) + ')')
        for i, (city, year, tier, split_tier, official, note) in enumerate(EDITIONS, 1):
            db.execute('INSERT INTO em (distance, source_db, id, city, year, official_finishers, completeness_status, completeness_reason, verification_tier, '
                       'verified_badge, weaker_source, split_tier, release_exclusion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       ['marathon', 'full', i, city, year, official, 'complete' if tier == 'stamped' else 'unverified', note, tier,
                        tier == 'stamped', False, split_tier, 'excluded: virtual_race' if tier == 'excluded' else None])
        db.execute("INSERT INTO em (distance, source_db, id, city, year, verification_tier, verified_badge, weaker_source, split_tier) "
                   "VALUES ('half', 'half', 1, 'Halfville', 2020, 'unverified', false, false, 'splits'), ('half', 'full', 2, 'Halfville', 2020, 'unverified', false, false, 'splits')")
        for name in ('race_conditions', 'course_profiles', 'course_segments', 'sources'):
            columns = adapt_master.OVERLAY_SCHEMAS[name] + ([('release_status', 'VARCHAR')] if name == 'sources' else [])
            db.execute(f'CREATE TABLE {name} (distance VARCHAR, source_db VARCHAR, ' + ', '.join(f'"{c}" {t}' for c, t in columns) + ')')
        db.execute("INSERT INTO race_conditions (distance, source_db, id, city, year, race_date, temp_c) VALUES ('marathon', 'full', 1, 'Testville', 2020, '2020-10-04', 12.5), "
                   "('half', 'half', 1, 'Halfville', 2020, '2020-03-01', 9.0)")
        db.execute("INSERT INTO course_profiles (distance, source_db, id, city, race, course_key, distance_km, points_json) "
                   "VALUES ('marathon', 'full', 1, 'Testville', 'Testville Race', 'testville', 42.2, '[]')")
        db.execute("INSERT INTO course_segments (distance, source_db, id, city, course_key, seg_from_km, seg_to_km) VALUES ('marathon', 'full', 1, 'Testville', 'testville', 0, 5)")
        db.execute("INSERT INTO sources (distance, source_db, id, race, city, year, url, release_status) VALUES ('marathon', 'full', 1, 'Testville Race', 'Testville', 2020, "
                   "'https://example.org', 'in CORE'), ('half', 'half', 1, 'Half Race', 'Halfville', 2020, 'https://example.org/h', 'in CORE')")
        # Person links: one row per result. 101 and 105 are one person (high); 103 is a possible match (low) of the person
        # of 107; 104 keyed (medium, with a birth-year key); 106 a name-variant link; 108 and 110 unlinked.
        db.execute("""CREATE TABLE lk AS SELECT NULL::VARCHAR AS person_id, NULL::VARCHAR AS confidence, NULL::VARCHAR AS method, 'no_name' AS unlinked_reason,
          NULL::VARCHAR AS runner_id_v1, distance, race AS race_series, race, year, city, finish_time AS finish_raw,
          CASE WHEN sex='X' THEN NULL ELSE sex END AS sex, CASE WHEN sex IN ('M', 'F') THEN 'published' END AS sex_source, age, NULL::VARCHAR AS age_key,
          source_db, id AS record_id FROM rr""")
        for rid, person, confidence, key in ((101, 'p51_a', 'high', 'yob:1990'), (105, 'p51_a', 'high', None), (103, 'p51_e', 'low', None),
                                             (104, 'p51_b', 'medium', 'yob:1988'), (106, 'p51_c', 'medium_variant', 'ag:30-34'), (102, 'p51_d', 'high_elite', None),
                                             (107, 'p51_e', 'high', None), (109, 'p51_f', 'low_noage', None), (111, 'p51_g', 'medium', None)):
            db.execute("UPDATE lk SET person_id=?, confidence=?, method='merged', unlinked_reason=NULL, age_key=?, runner_id_v1=? WHERE distance='marathon' AND record_id=?",
                       [person, confidence, key, f'runner|M|{key}' if key else None, rid])
        db.execute("UPDATE lk SET sex='F', sex_source='category' WHERE distance='marathon' AND record_id=104")
        db.execute("UPDATE lk SET person_id='p51_h', confidence='medium', method='new', unlinked_reason=NULL WHERE distance='half' AND source_db='half' AND record_id=101")

    def measured_manifest(self):
        """What a producer's MANIFEST.json would state for this data (counted here with separate queries)."""
        db, out = self.db, {}
        one = lambda q: db.execute(q).fetchone()[0]  # noqa: E731
        for distance in ('half', 'marathon'):
            w = f"distance='{distance}'"
            tiers = {t: {'editions': e, 'rows': n} for t, e, n in db.execute(f"""SELECT em.verification_tier, count(*), coalesce(sum(c.n), 0)::BIGINT FROM em
              LEFT JOIN (SELECT source_db, city, year, count(*) AS n FROM rr WHERE {w} GROUP BY ALL) c USING(source_db, city, year) WHERE em.{w} GROUP BY 1""").fetchall()}
            split = {t: {'editions': e, 'rows': n} for t, e, n in db.execute(f"""SELECT em.split_tier, count(*), sum(c.n)::BIGINT FROM em
              JOIN (SELECT source_db, city, year, count(*) AS n FROM rr WHERE {w} GROUP BY ALL) c USING(source_db, city, year) WHERE em.{w} GROUP BY 1""").fetchall()}
            flags = dict(zip(adapt_combined.QA_FLAGS + ['sex_from_category'], db.execute(
                'SELECT ' + ', '.join(f'coalesce(sum({f}::INT), 0)::BIGINT' for f in adapt_combined.QA_FLAGS) + f', count(sex_from_category) FROM qa WHERE {w}').fetchone()))
            out[distance] = {
                'n_records': one(f'SELECT count(*) FROM rr WHERE {w}'),
                'rows_by_source_db': dict(db.execute(f'SELECT source_db, count(*) FROM rr WHERE {w} GROUP BY 1').fetchall()),
                'editions': one(f'SELECT count(DISTINCT (source_db, city, year)) FROM rr WHERE {w}'), 'city_keys': one(f'SELECT count(DISTINCT city) FROM rr WHERE {w}'),
                'races': one(f'SELECT count(DISTINCT race) FROM rr WHERE {w}'), 'years': list(db.execute(f'SELECT min(year), max(year) FROM rr WHERE {w}').fetchone()),
                'tiers': tiers, 'split_tiers': split, 'rows_with_5km': one(f'SELECT count(split_5km) FROM rr WHERE {w}'), 'qa_row_flags': flags,
                'pending_flags': dict(db.execute(f'SELECT flag, count(*) FROM pend WHERE {w} AND present_in_core GROUP BY 1').fetchall()),
                'exclusions': {c: {'editions_whole': a, 'editions_partial': b, 'rows': n} for c, a, b, n in db.execute(
                    f"SELECT category, count(*) FILTER(WHERE scope='whole_edition'), count(*) FILTER(WHERE scope='rows'), sum(n_rows)::BIGINT FROM excl WHERE {w} GROUP BY 1").fetchall()},
                'excluded_rows': one(f'SELECT count(*) FROM rx WHERE {w}')}
        return out

    def write_core(self, manifest_override):
        db, core = self.db, self.core
        for table, name in (('rr', 'race_records'), ('qa', 'qa_row_flags'), ('rf', 'record_flags'), ('pend', 'pending_review_flags'), ('rx', 'RELEASE-ROW-EXCLUSIONS'),
                            ('em', 'edition_meta'), ('sources', 'sources'), ('race_conditions', 'race_conditions'), ('course_profiles', 'course_profiles'),
                            ('course_segments', 'course_segments')):
            order = 'ORDER BY distance, source_db, ' + ('id' if table in ('rr', 'em', 'sources', 'race_conditions', 'course_profiles', 'course_segments') else 'record_id')
            db.execute(f"COPY (SELECT * FROM {table} {order}) TO {literal(core / (name + '.parquet'))} (FORMAT parquet)")
        db.execute(f"COPY (SELECT * FROM excl) TO {literal(core / 'RELEASE-EXCLUSIONS.csv')} (HEADER)")
        db.execute(f"COPY (SELECT * FROM pend) TO {literal(core / 'pending_review_flags.csv')} (HEADER)")
        db.execute(f"COPY (SELECT * FROM em) TO {literal(core / 'edition_meta.csv')} (HEADER)")
        counts = {(d, s, c, y): (n, f, k, a) for d, s, c, y, n, f, k, a in db.execute(
            'SELECT distance, source_db, city, year, count(*), count(finish_time), count(split_5km), count(*) FILTER(WHERE '
            + ' OR '.join(f'{f} IS NOT NULL' for f in adapt_combined.INTERMEDIATE) + ') FROM rr GROUP BY ALL').fetchall()}
        sums = self.producer_checksums()
        tiers, editions, checks = [], [], []
        for d, s, c, y, tier, badge, weaker, split_tier, official, status, note in db.execute(
                'SELECT distance, source_db, city, year, verification_tier, verified_badge, weaker_source, split_tier, official_finishers, completeness_status, '
                'release_note FROM em ORDER BY distance, source_db, city, year').fetchall():
            n, f, k, a = counts.get((d, s, c, y), (0, 0, 0, 0))
            label = 'verified' if tier == 'stamped' else ''
            hold = 'on hold (source 403)' if tier == 'partial' else None
            tiers.append([d, s, c, y, n, None, f, k, a, tier, badge, label, weaker, split_tier, split_tier == 'finish_time_only', official, None, status, hold, note, False, 0])
            editions.append({'distance': d, 'source_db': s, 'city': c, 'year': y, 'n_records': n, 'verification_tier': tier, 'badge_label': label, 'hold_note': hold,
                             'tier_before_release_override': None, 'sha256_records': sums.get((d, s, c, y))})
            checks.append([d, s, c, y, n, sums.get((d, s, c, y)) or ''])
        header = ['distance', 'source_db', 'city', 'year', 'n_records', 'exclusion_category', 'n_with_finish', 'n_with_5km', 'n_with_any_intermediate_split',
                  'verification_tier', 'verified_badge', 'badge_label', 'weaker_source', 'split_tier', 'finish_time_only', 'official_finishers',
                  'official_source_url', 'completeness_status', 'hold_note', 'release_note', 'partly_excluded', 'n_pending_review_flag_rows']
        self.write_csv(core / 'EDITION-TIERS.csv', header, tiers)
        self.write_csv(core / 'EDITION-CHECKSUMS.csv', ['distance', 'source_db', 'city', 'year', 'n_records', 'sha256_records'], checks)
        (core / 'EDITIONS.json').write_text(json.dumps(editions))
        (core / 'races_summary.json').write_text(json.dumps([{'distance': d, 'source_db': s, 'city': c, 'year': y, 'n_records': n, 'n_with_5km': k}
                                                             for (d, s, c, y), (n, _, k, _) in sorted(counts.items())]))
        for name in ('README.md', 'DATA-CARD.md', 'CHANGE-REPORT.md', 'ID-CONTRACT.md'):
            (core / name).write_text(f'# Synthetic {name}\n')
        by_distance = self.measured_manifest()
        if manifest_override:
            manifest_override(by_distance)
        files = {}
        for path in sorted(core.iterdir()):
            rows = db.execute(f'SELECT count(*) FROM read_parquet({literal(path)})').fetchone()[0] if path.suffix == '.parquet' else None
            files[path.name] = {'rows': rows, 'bytes': path.stat().st_size, 'sha256': sha(path)}
        (core / 'MANIFEST.json').write_text(json.dumps({'created_at': '2099-01-01T12:00:00Z', 'tag': TAG, 'row_key': ['source_db', 'id'],
                                                        'snapshots': {'marathon': {'frozen': 'synthetic'}}, 'by_distance': by_distance, 'files': files}))
        self.write_core_sums()

    def write_core_sums(self):
        names = sorted(p.name for p in self.core.iterdir() if p.name != 'SHA256SUMS.txt')
        (self.core / 'SHA256SUMS.txt').write_text(''.join(f'{sha(self.core / n)}  {n}\n' for n in names))

    @staticmethod
    def write_csv(path, header, rows):
        stream = io.StringIO()
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(header)
        writer.writerows([['' if v is None else v for v in row] for row in rows])
        path.write_text(stream.getvalue())

    def producer_checksums(self):
        out, rows = {}, self.db.execute('SELECT * FROM rr ORDER BY distance, source_db, city, year, id').fetchall()
        for row in rows:
            out.setdefault((row[0], row[1], row[5], row[4]), hashlib.sha256()).update(
                (json.dumps(list(row), separators=(',', ':'), ensure_ascii=False) + '\n').encode())
        return {k: v.hexdigest() for k, v in out.items()}

    def write_release(self):
        release, db = self.release, self.db
        with tarfile.open(release / ARCHIVE, 'w:gz') as tar:
            for path in sorted(self.core.iterdir()):
                tar.add(path, arcname=f'{TAG}/{path.name}')
        db.execute(f"COPY (SELECT * FROM lk ORDER BY source_db, record_id) TO {literal(release / adapt_combined.LINKS)} (FORMAT parquet)")
        db.execute(f"""COPY (SELECT person_id, count(*) AS n_results, count(*) FILTER(WHERE distance='marathon') AS n_marathons FROM lk WHERE person_id IS NOT NULL
          GROUP BY 1 ORDER BY 1) TO {literal(release / adapt_combined.PERSONS)} (FORMAT parquet)""")
        for name in adapt_combined.REPEATED_ASSETS:
            (release / name).write_bytes((self.core / name).read_bytes())
        for name in sorted(adapt_combined.PINNED_ASSETS - set(adapt_combined.REPEATED_ASSETS) - {adapt_combined.LINKS, adapt_combined.PERSONS}):
            (release / name).write_text(f'synthetic {name}\n')
        self.write_release_sums()

    def write_release_sums(self):
        names = sorted(adapt_combined.PINNED_ASSETS | {ARCHIVE})
        (self.release / SUMS).write_text(''.join(f'{sha(self.release / n)}  {n}\n' for n in names))

    def write_baseline(self):
        """The previous release in 1050's layout: Testville 2020 and 2021; record 105 had no finish, record 190 has since
        been removed; its weather and course members hold the values of the new release's marathon rows."""
        db, folder = self.db, self.baseline
        cols = ', '.join(f'CAST("{c}" AS {t}) AS "{c}"' for c, t in adapt_master.RACE_RECORDS)
        db.execute(f"""CREATE TABLE before AS SELECT * REPLACE (CASE WHEN id=105 THEN NULL ELSE split_42_2km END AS split_42_2km)
          FROM (SELECT {cols} FROM rr WHERE distance='marathon' AND city='Testville')""")
        db.execute("INSERT INTO before (id, race, year, city, runner) VALUES (190, 'Testville Race', 2021, 'Testville', 'Removed Runner')")
        db.execute(f"COPY (SELECT * FROM before ORDER BY id) TO {literal(folder / 'race_records.parquet')} (FORMAT parquet)")
        for name in ('race_conditions', 'course_profiles', 'course_segments'):
            select = ', '.join(f'"{c}"' for c, _ in adapt_master.OVERLAY_SCHEMAS[name])
            db.execute(f"COPY (SELECT {select} FROM {name} WHERE distance='marathon' ORDER BY id) TO {literal(folder / (name + '.parquet'))} (FORMAT parquet)")
        files = {n: {'sha256': sha(folder / n)} for n in adapt_combined.BASELINE_MEMBERS if n not in ('MANIFEST.json', 'SHA256SUMS.txt')}
        (folder / 'MANIFEST.json').write_text(json.dumps({'files': files}))
        listing = {**{n: f['sha256'] for n, f in files.items()}, 'MANIFEST.json': sha(folder / 'MANIFEST.json')}
        (folder / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
        (folder / 'provenance.json').write_text(json.dumps({'release_tag': BASE_TAG, 'asset': 'pace-notes-CORE-x.tar.gz', 'asset_sha256': 'a' * 64}))

    def make_pin(self):
        return {'repository': 'example/pace-notes', 'tag': TAG, 'layout': 'combined', 'published_at': '2099-01-02T00:00:00Z',
                'checksums': {'asset': SUMS, 'sha256': sha(self.release / SUMS)},
                'core': {'asset': ARCHIVE, 'folder': TAG, 'sha256sums_sha256': sha(self.core / 'SHA256SUMS.txt'), 'manifest_sha256': sha(self.core / 'MANIFEST.json')},
                'assets': {n: sha(self.release / n) for n in sorted(adapt_combined.PINNED_ASSETS | {ARCHIVE})},
                'baseline': {'tag': BASE_TAG, 'asset': 'pace-notes-CORE-x.tar.gz', 'sha256': 'a' * 64, 'checksums_asset': 'RELEASE-SHA256SUMS-x.txt',
                             'checksums_sha256': 'b' * 64}}

    def make_claims(self):
        """The prose claims of the synthetic documents, as their writer would have counted them from the link table."""
        db = self.db
        one = lambda q: db.execute(q).fetchone()[0]  # noqa: E731
        named = lambda q: {('none' if k is None else k): v for k, v in db.execute(q).fetchall()}  # noqa: E731
        return {
            # Marathon ids against the baseline: 190 removed, Newtown's three added, 105's finish filled, seven unchanged.
            'change_report_vs_baseline': {'removed': 1, 'added': 3, 'changed': 1, 'unchanged': 7, 'removed_by_edition': {'Testville 2021': 1},
                                          'changed_by_edition': {'Testville 2021': 1}},
            'readme': {'mixed_lists': 0, 'mixed_lists_with_half_rows': 1, 'stamp_tolerance_pct': 0.5},
            'data_card': {'lemignano_2012_rows': 0, 'kilkenny_2025_rows_ge_24h': 0},
            'person_links': {
                'rows': one('SELECT count(*) FROM lk'), 'linked': one('SELECT count(person_id) FROM lk'), 'persons': one('SELECT count(DISTINCT person_id) FROM lk'),
                'persons_2plus_series': one('SELECT count(*) FROM (SELECT person_id FROM lk WHERE person_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT race_series) > 1)'),
                'persons_half_and_marathon': one('SELECT count(*) FROM (SELECT person_id FROM lk WHERE person_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT distance) > 1)'),
                'confidence_rows': named("SELECT coalesce(confidence, 'unlinked'), count(*) FROM lk GROUP BY 1"),
                'unlinked_reason': named('SELECT unlinked_reason, count(*) FROM lk WHERE unlinked_reason IS NOT NULL GROUP BY 1'),
                'sex_source': named('SELECT sex_source, count(*) FROM lk GROUP BY 1')}}

    def adapt(self, output, bundle='FULL', pin=None, core_dir=None):
        return adapt_combined.adapt(pin or self.pin, output, bundle, [self.release], core_dir, self.baseline, memory='1GB')


def offline():
    raise AssertionError('the tests never touch the network')


@mock.patch.object(adapt_master, '_opener', offline)
class AdaptCombined(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        dates = self.root / 'reviewed-race-dates.json'
        dates.write_text(json.dumps(RACE_DATES))
        for patcher in (mock.patch.object(adapt_combined, 'RACE_DATES_PATH', dates), mock.patch.dict(adapt_combined.IDENTITY, {TAG: IDENTITY}),
                        mock.patch.dict(adapt_combined.ROW_RULE, {TAG: ROW_RULE})):
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def fixture(self, name='f', **kwargs):
        fx = Fixture(self.root / name, **kwargs)
        self.reviewed(fx)
        return fx

    def reviewed(self, fx, **changes):
        """Install the synthetic release's claims and reviewed expectations (as CLAIMS and REVIEWED hold a real one's)."""
        for table, value in ((adapt_combined.CLAIMS, fx.claims), (adapt_combined.REVIEWED, {**fx.review, **changes})):
            patcher = mock.patch.dict(table, {TAG: value})
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_writes_the_marathon_input(self):
        fx = self.fixture()
        out = self.root / 'out'
        provenance = fx.adapt(out)
        members = {p.name for p in out.iterdir() if p.is_file()} - {'provenance.json'}
        self.assertEqual(members, adapt_combined.EXPECTED_COMBINED_FULL)
        self.assertEqual((provenance['release_tag'], provenance['layout'], provenance['bundle']), (TAG, 'combined', 'FULL'))
        self.assertEqual(sha(out / provenance['asset_path']), provenance['asset_sha256'])
        self.assertEqual(provenance['manifest_sha256'], sha(out / 'MANIFEST.json'))
        db = duckdb.connect()
        rr = literal(out / 'race_records.parquet')
        self.assertEqual([(c, t) for c, t, *_ in db.execute(f'DESCRIBE SELECT * FROM read_parquet({rr})').fetchall()], adapt_master.RACE_RECORDS)
        # Marathon rows only, in id order: the three half rows (one shares id 101), the record faster than the world record
        # (102, which also carries a wheelchair flag) and the wheelchair record (106) are left out; the adaptive-division
        # record (107) stays as an ordinary result.
        self.assertEqual(db.execute(f'SELECT list(id ORDER BY id) FROM read_parquet({rr})').fetchone()[0], [101, 103, 104, 105, 107, 108, 109, 110, 111])
        # Blank published sex takes the published category (104); X and an unfilled blank stay as recorded.
        self.assertEqual(db.execute(f'SELECT id, sex FROM read_parquet({rr}) WHERE id IN (103, 104, 108) ORDER BY id').fetchall(), [(103, 'X'), (104, 'F'), (108, None)])
        f = literal(out / 'features.parquet')
        self.assertEqual([c for c, *_ in db.execute(f'DESCRIBE SELECT * FROM read_parquet({f})').fetchall()][-8:],
                         ['match_key', 'is_ambiguous', 'runner_id', 'link_preliminary', 'person_id', 'link_confidence', 'link_method', 'sex_source'])
        rows = {r[0]: r[1:] for r in db.execute(
            f'SELECT record_id, runner_id, match_key, is_ambiguous, link_preliminary, person_id, link_confidence, yob, sex, sex_source FROM read_parquet({f})').fetchall()}
        self.assertEqual(rows[101], ('p51_a', 'p51_a', False, False, 'p51_a', 'high', 1990, 'M', 'published'))
        self.assertEqual(rows[105][:2], ('p51_a', 'p51_a'))
        # A low-confidence link keeps its person and tier but gets no key: a possible match, never merged.
        self.assertEqual(rows[103], (None, None, None, None, 'p51_e', 'low', None, None, None))
        self.assertEqual(rows[107][:2] + rows[107][4:6], ('p51_e', 'p51_e', 'p51_e', 'high'))
        self.assertEqual(rows[104], ('p51_b', 'p51_b', False, False, 'p51_b', 'medium', 1988, 'F', 'category'))
        self.assertEqual(rows[108], (None, None, None, None, None, None, None, None, None))
        self.assertEqual(rows[109][4:6], ('p51_f', 'low_noage'))
        # A missing split stays missing: 15 km is absent for record 104, so seg_15, seg_20 and cum_15 are null.
        self.assertEqual(db.execute(f'SELECT seg_15, seg_20, cum_15, seg_05 FROM read_parquet({f}) WHERE record_id=104').fetchone(), (None, None, None, 27.5))
        # Race dates: only the weather row (or a reviewed date) dates an edition; the date in a producer note does not.
        self.assertEqual(db.execute(f'SELECT DISTINCT city, year, race_date FROM read_parquet({f}) ORDER BY 1, 2').fetchall(),
                         [(NEWTOWN, 2022, None), ('Testville', 2020, '2020-10-04'), ('Testville', 2021, None)])
        meta = literal(out / 'edition_meta.parquet')
        self.assertEqual([(c, t) for c, t, *_ in db.execute(f'DESCRIBE SELECT * FROM read_parquet({meta})').fetchall()], adapt_combined.EDITION_META)
        self.assertEqual(db.execute(f'SELECT city, year, verification_tier, verified_badge, badge_label, split_tier, hold_note, race_date, race_date_source, '
                                    f'producer_note_date FROM read_parquet({meta}) ORDER BY id').fetchall(),
                         [('Testville', 2020, 'stamped', True, 'verified', 'splits', None, '2020-10-04', 'weather', None),
                          ('Testville', 2021, 'partial', False, None, 'splits', 'on hold (source 403)', None, None, None),
                          (NEWTOWN, 2022, 'unverified', False, None, 'finish_time_only', None, None, None, '2022-10-02'),
                          ('Oldtown', 2019, 'excluded', False, None, None, None, None, None, None)])
        # The weather and course members are the baseline's bytes; flags keep the release's form for the written records.
        for name in ('race_conditions', 'course_profiles', 'course_segments'):
            self.assertEqual(sha(out / f'{name}.parquet'), sha(fx.baseline / f'{name}.parquet'))
        self.assertEqual(db.execute(f"SELECT record_id, flag, detail FROM read_parquet({literal(out / 'record_flags.parquet')}) ORDER BY 1, 2").fetchall(),
                         [(105, 'pace_implausible', None), (105, 'shifted_mat', '25k mat early')])
        self.assertEqual(db.execute(f"SELECT list(record_id ORDER BY record_id) FROM read_parquet({literal(out / 'qa_row_flags.parquet')})").fetchone()[0], [103, 104])
        self.assertEqual(db.execute(f"SELECT count(*) FROM read_parquet({literal(out / 'sources.parquet')})").fetchone()[0], 1)
        # Documents: adapter outputs, labelled on their first line.
        for name in adapt_combined.DOC_MEMBERS:
            if name.endswith('.md'):
                self.assertTrue((out / name).read_text().startswith('> ' + adapt_combined.LABEL), name)
            elif name.endswith('.json'):
                self.assertEqual(next(iter(json.loads((out / name).read_text()).items())), ('document', adapt_combined.LABEL), name)
        manifest = json.loads((out / 'MANIFEST.json').read_text())
        self.assertEqual(manifest['document'], adapt_combined.LABEL)
        self.assertEqual((manifest['n_records'], manifest['n_cities'], manifest['n_editions'], manifest['rows_left_out']), (9, 2, 3, 2))
        self.assertEqual(manifest['created_at'], '2099-01-01T12:00:00Z')
        self.assertEqual(sorted(manifest['dependencies']), ['duckdb'])
        editions = {(e['city'], e['year']): e for e in json.loads((out / 'EDITIONS.json').read_text())['editions']}
        self.assertEqual([(k, e['n_records'], e['rows_left_out'], e['excluded']) for k, e in sorted(editions.items())],
                         [((NEWTOWN, 2022), 3, 0, False), (('Oldtown', 2019), 0, 0, True), (('Testville', 2020), 3, 1, False), (('Testville', 2021), 3, 1, False)])
        with (out / 'EDITION-CHECKSUMS.csv').open(newline='') as stream:
            listed = {(r['city'], int(r['year'])): (int(r['n_records']), r['sha256_records']) for r in csv.DictReader(stream)}
        self.assertEqual({k: v[0] for k, v in listed.items()}, {(NEWTOWN, 2022): 3, ('Testville', 2020): 3, ('Testville', 2021): 3})
        db.execute(f'CREATE VIEW out_rr AS SELECT * FROM read_parquet({rr})')
        self.assertEqual({k: v for k, v in adapt_master.edition_checksums(db, 'out_rr').items()}, listed)
        report = json.loads((out / 'RECONCILIATION.json').read_text())
        self.assertEqual(report['summary']['mismatched'], 0)
        self.assertTrue(all(set(c) == {'family', 'check', 'source', 'expected', 'measured', 'ok'} for c in report['checks']))
        delta = next(c for c in report['checks'] if c['family'] == 'baseline_delta' and c['check'].startswith('ids removed'))
        self.assertEqual(delta['measured'], {'removed': 1, 'added': 3, 'changed': 1, 'unchanged': 7})
        self.assertEqual(report['features_by_link_confidence'], {'high': 3, 'low': 1, 'low_noage': 1, 'medium': 2, 'unlinked': 2})
        sums = adapt_master.parse_sums((out / 'SHA256SUMS.txt').read_text())
        self.assertEqual(set(sums), adapt_combined.EXPECTED_COMBINED_FULL - {'SHA256SUMS.txt'})
        self.assertTrue(all(sha(out / n) == d for n, d in sums.items()))

    def test_deterministic_core_and_unpacked_folder(self):
        fx = self.fixture()
        fx.adapt(self.root / 'a')
        fx.adapt(self.root / 'b', core_dir=fx.core)
        fx.adapt(self.root / 'c', bundle='CORE')
        for name in sorted(adapt_combined.EXPECTED_COMBINED_FULL):
            self.assertEqual(sha(self.root / 'a' / name), sha(self.root / 'b' / name), name)
        self.assertFalse((self.root / 'c' / 'features.parquet').exists())
        self.assertEqual((self.root / 'a' / 'SHA256SUMS.txt').read_bytes(), (self.root / 'c' / 'SHA256SUMS.txt').read_bytes())
        self.assertEqual(json.loads((self.root / 'c' / 'provenance.json').read_text())['bundle'], 'CORE')
        self.assertEqual({p.name for p in (self.root / 'a' / adapt_combined.CORE_DIR).iterdir()}, adapt_combined.CORE_MEMBERS)

    def assertFails(self, message, fx, pin=None, core_dir=None, error=adapt_master.AdaptError):
        out = self.root / f'out{len(list(self.root.iterdir()))}'
        with self.assertRaisesRegex(error, message):
            fx.adapt(out, pin=pin, core_dir=core_dir)
        if out.exists():
            self.assertFalse({p.name for p in out.iterdir() if p.is_file()} & (adapt_combined.EXPECTED_COMBINED_FULL | {'provenance.json'}),
                             'a failed run leaves no member behind')

    def test_pin_and_digests(self):
        fx = self.fixture()
        with self.subTest('not a combined pin'):
            self.assertFails('combined-layout', fx, {**fx.pin, 'layout': 'master'})
        with self.subTest('an unreviewed tag'):
            self.assertFails('no reviewed adapter expectations', fx, {**fx.pin, 'tag': 'pace-notes-marathon-half-20990102-0000'})
        with self.subTest('an asset missing from the pin'):
            assets = dict(fx.pin['assets']); assets.pop('DATA-CARD.md')
            self.assertFails('exactly these assets', fx, {**fx.pin, 'assets': assets})
        with self.subTest('a pinned digest the release does not list'):
            self.assertFails('does not list DATA-CARD.md', fx, {**fx.pin, 'assets': {**fx.pin['assets'], 'DATA-CARD.md': 'c' * 64}})
        with self.subTest('another checksum file'):
            # The folder no longer matches the pin, so the adapter would download, which these tests never allow.
            self.assertFails('network', fx, {**fx.pin, 'checksums': {**fx.pin['checksums'], 'sha256': 'd' * 64}}, error=AssertionError)
        with self.subTest('another CORE checksum list'):
            self.assertFails('CORE SHA256SUMS.txt differs', fx, {**fx.pin, 'core': {**fx.pin['core'], 'sha256sums_sha256': 'e' * 64}})
        with self.subTest('another baseline'):
            self.assertFails('not the pinned baseline', fx, {**fx.pin, 'baseline': {**fx.pin['baseline'], 'sha256': 'e' * 64}})
        with self.subTest('an unpacked member that differs'):
            other = self.root / 'unpacked'
            other.mkdir()
            for path in fx.core.iterdir():
                (other / path.name).write_bytes(path.read_bytes())
            (other / 'ID-CONTRACT.md').write_text('changed after the checksums\n')
            self.assertFails('ID-CONTRACT.md differs from the digest', fx, core_dir=other)
        with self.subTest('a release asset that differs from its listed digest'):
            bad = self.fixture('bad')
            (bad.release / 'README.md').write_text('changed after the checksums\n')
            self.assertFails('differs from the pinned digest', bad)
        with self.subTest('an archive with an unexpected member'):
            def extra(f):
                (f.core / 'surprise.txt').write_text('x')
                f.write_core_sums()
            self.assertFails('unexpected, unsafe or repeated member', self.fixture('extra', tamper=extra))

    def test_a_stated_count_that_differs_stops_the_run(self):
        cases = [
            ('result rows', dict(manifest=lambda m: m['marathon'].update(n_records=99))),
            ('verification tiers', dict(manifest=lambda m: m['marathon']['tiers']['stamped'].update(rows=5))),
            ('row flags', dict(manifest=lambda m: m['marathon']['qa_row_flags'].update(finish_zero=1))),
            ('null or repeated', dict(mutate=lambda f: f.db.execute("UPDATE rr SET id=101 WHERE distance='marathon' AND id=103"))),
            ('CORE keys missing from the links', dict(mutate=lambda f: f.db.execute("DELETE FROM lk WHERE distance='marathon' AND record_id=108"))),
            ('labels differ', dict(mutate=lambda f: f.db.execute("UPDATE lk SET finish_raw='09:99:99' WHERE distance='marathon' AND record_id=108"))),
            ('is not the published sex', dict(mutate=lambda f: f.db.execute("UPDATE lk SET sex='M' WHERE distance='marathon' AND record_id=108"))),
            ('persons with two rows in one edition', dict(mutate=lambda f: f.db.execute("UPDATE lk SET person_id='p51_a' WHERE distance='marathon' AND record_id=107"))),
            ('excluded row ids still in race_records', dict(mutate=lambda f: f.db.execute("UPDATE rx SET record_id=101 WHERE record_id=901"))),
            ('half-only edition_meta columns', dict(mutate=lambda f: f.db.execute("UPDATE em SET winner_m='X' WHERE distance='marathon' AND city='Testville' AND year=2020"))),
            ('split tier is not', dict(mutate=lambda f: f.db.execute("UPDATE em SET split_tier='splits' WHERE city LIKE 'Newtown%'"))),
        ]
        for message, kwargs in cases:
            with self.subTest(message):
                self.assertFails(f'reconciliation check\\(s\\) differ.*{message}', self.fixture(f'f{len(list(self.root.iterdir()))}', **kwargs))

    def test_claims_in_prose_and_reviewed_counts_bind(self):
        fx = self.fixture()
        with self.subTest('the change report'):
            self.reviewed(fx)
            with mock.patch.dict(adapt_combined.CLAIMS, {TAG: {**fx.claims, 'change_report_vs_baseline': {**fx.claims['change_report_vs_baseline'], 'changed': 0}}}):
                self.assertFails('ids removed, added, changed', fx)
        with self.subTest('the link counts'):
            with mock.patch.dict(adapt_combined.CLAIMS, {TAG: {**fx.claims, 'person_links': {**fx.claims['person_links'], 'persons': 9}}}):
                self.assertFails('persons', fx)
        for key, value, message in (('left_out', 3, 'distinct rows left out'), ('written_rows', 8, 'marathon rows written')):
            with self.subTest(key), mock.patch.dict(adapt_combined.REVIEWED, {TAG: {**fx.review, key: value}}):
                self.assertFails(message, fx)
        with self.subTest('an overlay not reviewed to equal the baseline'), mock.patch.dict(adapt_combined.REVIEWED, {TAG: {**fx.review, 'baseline_equal': []}}):
            self.assertFails('writes these members only as its bytes', fx)

    def test_rules_stop_on_what_they_have_not_reviewed(self):
        with self.subTest('a pending flag'):
            fx = self.fixture('p', mutate=lambda f: f.db.execute("UPDATE pend SET flag='new_flag' WHERE record_id=107"))
            self.assertFails('row rule has not reviewed', fx)
        with self.subTest('a link confidence'):
            fx = self.fixture('c', mutate=lambda f: f.db.execute("UPDATE lk SET confidence='rejected' WHERE distance='marathon' AND record_id=107"))
            self.assertFails('identity rule has not reviewed', fx)
        with self.subTest('a person id of another build'):
            fx = self.fixture('b', mutate=lambda f: f.db.execute("UPDATE lk SET person_id='p4_x' WHERE distance='marathon' AND record_id=107"))
            self.assertFails('identity rule has not reviewed', fx)
        with self.subTest('an overlay that differs from the baseline'):
            fx = self.fixture('o', mutate=lambda f: f.db.execute("UPDATE race_conditions SET temp_c=13.0 WHERE distance='marathon'"))
            db = duckdb.connect()
            db.execute(f"COPY (SELECT * REPLACE (CAST(12.5 AS DOUBLE) AS temp_c) FROM read_parquet({literal(fx.baseline / 'race_conditions.parquet')})) TO "
                       f"{literal(fx.root / 'w.parquet')} (FORMAT parquet)")
            (fx.root / 'w.parquet').replace(fx.baseline / 'race_conditions.parquet')
            files = json.loads((fx.baseline / 'MANIFEST.json').read_text())['files']
            files['race_conditions.parquet']['sha256'] = sha(fx.baseline / 'race_conditions.parquet')
            (fx.baseline / 'MANIFEST.json').write_text(json.dumps({'files': files}))
            listing = {**{n: f['sha256'] for n, f in files.items()}, 'MANIFEST.json': sha(fx.baseline / 'MANIFEST.json')}
            (fx.baseline / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
            self.assertFails('race_conditions: marathon rows against', fx)

    def test_a_reviewed_mismatch_is_recorded_and_a_stale_one_refused(self):
        # The producer's manifest overstates one count. Unreviewed it stops the run (above); listed, the run goes on and
        # the record still shows the mismatch, never a pass.
        fx = self.fixture(manifest=lambda m: m['marathon'].update(rows_with_5km=99))
        check = ['counts_marathon', 'rows with a 5 km split']
        self.reviewed(fx, known_mismatches=[check])
        out = self.root / 'out'
        fx.adapt(out)
        report = json.loads((out / 'RECONCILIATION.json').read_text())
        self.assertEqual(report['summary']['mismatched'], 1)
        self.assertEqual(report['known_mismatches'], [check])
        row = next(c for c in report['checks'] if [c['family'], c['check']] == check)
        self.assertEqual((row['expected'], row['measured'], row['ok']), (99, 8, False))
        good = self.fixture('good')
        self.reviewed(good, known_mismatches=[check])
        self.assertFails('no longer differ', good)

    def test_a_reviewed_race_date_needs_its_evidence_and_must_agree(self):
        fx = self.fixture()
        dates = {'releases': {TAG: [{'city': 'Testville', 'year': 2021, 'date': '2021-10-03', 'source': 'synthetic', 'evidence_text': 'Year verified (race 2021-10-03)'}]}}
        adapt_combined.RACE_DATES_PATH.write_text(json.dumps(dates))
        self.assertFails('reviewed race date Testville 2021', fx)
        dates['releases'][TAG][0]['evidence_text'] = 'DB 4 vs official 5'
        adapt_combined.RACE_DATES_PATH.write_text(json.dumps(dates))
        out = self.root / 'dated'
        fx.adapt(out)
        self.assertEqual(duckdb.connect().execute(f"SELECT race_date, race_date_source FROM read_parquet({literal(out / 'edition_meta.parquet')}) "
                                                  "WHERE city='Testville' AND year=2021").fetchone(), ('2021-10-03', 'reviewed'))
        dates['releases'][TAG] = [{'city': NEWTOWN, 'year': 2022, 'date': '2022-10-09', 'source': 'synthetic', 'evidence_text': 'date=2022-10-02'}]
        adapt_combined.RACE_DATES_PATH.write_text(json.dumps(dates))
        self.assertFails('two race dates that disagree', fx)

    def test_downloader_hands_the_combined_pin_to_the_adapter(self):
        fx = self.fixture()
        checkout = self.root / 'checkout' / 'analysis'
        checkout.mkdir(parents=True)
        (checkout / 'release.json').write_text(json.dumps(fx.pin))
        calls = []
        with mock.patch.object(download_release, '__file__', str(checkout / 'download_release.py')), \
                mock.patch.object(adapt_combined, 'adapt', lambda pin, output, bundle: calls.append((pin['tag'], bundle)) or {}):
            download_release.main(['--output', str(self.root / 'dl'), '--bundle', 'CORE'])
            self.assertEqual(calls, [(TAG, 'CORE')])
            with self.assertRaisesRegex(ValueError, 'adapted only as the tag'):
                download_release.main(['--output', str(self.root / 'dl'), '--tag', 'pace-notes-marathon-half-20990102-0000'])
            # The previous layout is no longer the pin's: a master tag is refused, with its own message.
            with self.assertRaisesRegex(ValueError, 'layout master'):
                download_release.main(['--output', str(self.root / 'dl'), '--tag', 'master-20990101'])
        (checkout / 'release.json').write_text(json.dumps({**fx.pin, 'layout': 'master'}))
        with mock.patch.object(download_release, '__file__', str(checkout / 'download_release.py')):
            with self.assertRaisesRegex(ValueError, 'adapted only as the tag'):
                download_release.main(['--output', str(self.root / 'dl')])


    def test_repository_pin(self):
        """The committed pin is complete and names a reviewed tag (no network); the weather pin follows it; the previous
        release's pin is kept whole as the audit baseline."""
        pin = adapt_combined.load_pin()
        self.assertEqual(pin['tag'], 'pace-notes-marathon-half-20261113-1113')
        self.assertEqual(pin['assets'][pin['core']['asset']], 'a76b1615d2e6769dab61cfc3cfa1cf54a6b3897b1bf54c4bbc682083d6f790e0')
        self.assertEqual(pin['assets'][adapt_combined.LINKS], '60d528ee5f47360a6222674ea684af0e3631fd9ed1a696d825c88babe9f3a593')
        self.assertEqual(pin['checksums']['sha256'], '857c5add4e8bb73b63c59faa2829af3c1b03e4fccbde45aa78960d077f33f988')
        self.assertEqual(pin['baseline']['sha256'], 'b594fb6c79663962b31562ca27b53d83a7466ee9d2ea4403010502a2ebe60de8')
        weather = json.loads(adapt_combined.PIN_PATH.with_name('weather-release.json').read_text())
        self.assertEqual((weather['tag'], weather['layout']), (pin['tag'], 'combined'))
        self.assertEqual(weather['race_conditions']['archive_sha256'], pin['assets'][pin['core']['asset']])
        previous = adapt_combined.PIN_PATH.with_name(pin['previous']['pin'])
        self.assertEqual(sha(previous), pin['previous']['pin_sha256'])
        self.assertEqual(adapt_master.load_pin(previous)['tag'], pin['previous']['tag'])
        rule, identity = adapt_combined.ROW_RULE[pin['tag']], adapt_combined.IDENTITY[pin['tag']]
        self.assertEqual(sorted(rule['pending_review_flags']), ['philadelphia_2010_place_sequence_outlier', 'sportstats_nonfinish_status',
                                                                'wheelchair_handcycle_published_category'])
        self.assertEqual(sorted(rule['qa_row_flags']), ['finish_equals_earlier_split', 'finish_faster_than_world_record', 'finish_ge_24h', 'finish_zero'])
        self.assertEqual(identity['keyed_confidences'], ['high_elite', 'high', 'medium'])
        self.assertFalse(set(identity['keyed_confidences']) & set(identity['possible_confidences']))


    def test_audit_reads_the_adapted_folder(self):
        import audit_release
        fx = self.fixture()
        full, core = self.root / 'full', self.root / 'core'
        fx.adapt(full)
        fx.adapt(core, bundle='CORE')
        previous = self.root / 'previous'
        previous.mkdir()
        (previous / 'race_records.parquet').write_bytes((fx.baseline / 'race_records.parquet').read_bytes())
        (previous / 'provenance.json').write_text(json.dumps({'release_tag': BASE_TAG}))
        out = self.root / 'audit' / 'release-contract.json'
        audit_release.audit(full, core, previous, out)
        report = json.loads(out.read_text())
        check = report['combined_reconciliation']
        self.assertEqual({k: check[k] for k in ('release_rows_missing', 'rows_not_in_release', 'left_out_rows_present', 'rows_differ', 'rows_equal_or_differ',
                                                'rows_left_out', 'sex_from_category', 'release_marathon_rows')},
                         {'release_rows_missing': 0, 'rows_not_in_release': 0, 'left_out_rows_present': 0, 'rows_differ': 0, 'rows_equal_or_differ': 9,
                          'rows_left_out': 2, 'sex_from_category': 1, 'release_marathon_rows': 11})
        self.assertEqual(check['links'], {'without_link_row': 0, 'link_differs': 0, 'key_rule_breaches': 0, 'with_key': 5, 'possible_matches': 2, 'unlinked': 2})
        self.assertEqual(report['producer_counts']['editions_json_excluded'], ['Oldtown 2019'])
        self.assertEqual(report['producer_counts']['editions_json_mismatches'], [])
        self.assertTrue(report['core_full_shared_hashes_match'])
        self.assertTrue(all(row['valid_mismatches'] == 0 for row in report['timings']))
        # Against the previous input: 190 is gone and so are the two rows the row rule leaves out (102, 106); Newtown is
        # new; 105's finish and 104's sex (filled from the category) changed in place.
        self.assertEqual(report['previous_delta'], {'added': 3, 'deleted': 3, 'changed': 2, 'unchanged': 4})
        # A record changed after adaptation, with every adapter document rewritten to match, still fails: the audit compares
        # the folder with the release's own race_records, not with the adapter's documents.
        db = duckdb.connect()
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN id=103 THEN 'Changed' ELSE runner END AS runner) FROM read_parquet({literal(full / 'race_records.parquet')}) ORDER BY id) "
                   f"TO {literal(self.root / 'rr.parquet')} (FORMAT parquet)")
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=103 THEN 'Changed' ELSE runner_name END AS runner_name) FROM "
                   f"read_parquet({literal(full / 'features.parquet')}) ORDER BY record_id) TO {literal(self.root / 'f.parquet')} (FORMAT parquet)")
        (self.root / 'rr.parquet').replace(full / 'race_records.parquet')
        (self.root / 'f.parquet').replace(full / 'features.parquet')
        manifest = json.loads((full / 'MANIFEST.json').read_text())
        for name in ('race_records.parquet', 'features.parquet'):
            manifest['files'][name].update(bytes=(full / name).stat().st_size, sha256=sha(full / name))
        (full / 'MANIFEST.json').write_text(json.dumps(manifest))
        listing = {n: f['sha256'] for n, f in manifest['files'].items()}
        listing['MANIFEST.json'] = sha(full / 'MANIFEST.json')
        (full / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
        provenance = json.loads((full / 'provenance.json').read_text())
        provenance['manifest_sha256'] = sha(full / 'MANIFEST.json')
        (full / 'provenance.json').write_text(json.dumps(provenance))
        with self.assertRaisesRegex(AssertionError, "rows_differ': 1"):
            audit_release.audit(full, None, None, out)
        # A link changed in the features (a possible match given a key) fails too.
        fx.adapt(full)
        db.execute(f"COPY (SELECT * REPLACE (CASE WHEN record_id=103 THEN person_id ELSE runner_id END AS runner_id) FROM "
                   f"read_parquet({literal(full / 'features.parquet')}) ORDER BY record_id) TO {literal(self.root / 'f.parquet')} (FORMAT parquet)")
        (self.root / 'f.parquet').replace(full / 'features.parquet')
        manifest = json.loads((full / 'MANIFEST.json').read_text())
        manifest['files']['features.parquet'].update(bytes=(full / 'features.parquet').stat().st_size, sha256=sha(full / 'features.parquet'))
        (full / 'MANIFEST.json').write_text(json.dumps(manifest))
        listing = {n: f['sha256'] for n, f in manifest['files'].items()}
        listing['MANIFEST.json'] = sha(full / 'MANIFEST.json')
        (full / 'SHA256SUMS.txt').write_text(''.join(f'{d}  {n}\n' for n, d in sorted(listing.items())))
        provenance['manifest_sha256'] = sha(full / 'MANIFEST.json')
        (full / 'provenance.json').write_text(json.dumps(provenance))
        with self.assertRaises(AssertionError):  # a key with no "not ambiguous" mark, then the key rule itself
            audit_release.audit(full, None, None, out)


if __name__ == '__main__':
    unittest.main()
