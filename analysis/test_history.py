"""Hand-checkable linkage and no-future-information cases."""
import tempfile
import unittest
import json
from pathlib import Path
import duckdb
from build_pacing import FIELDS, POINTS, prepare
from build_extended import canonical_id_contract, prepare_history


def clock(seconds):
    return f'{int(seconds//3600)}:{int(seconds%3600//60):02}:{seconds%60:06.3f}'


class HistoryValidation(unittest.TestCase):
    def test_canonical_contract_requires_matching_ids_and_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)
            (source / 'provenance.json').write_text(json.dumps({'release_tag':'private-export-20260912-0934'}))
            def fixture(ids=(20, 10), wrong_name=False):
                db = duckdb.connect()
                db.execute("CREATE TABLE raw(id BIGINT, city VARCHAR, year INTEGER, race VARCHAR, runner VARCHAR)")
                db.execute("INSERT INTO raw VALUES (10,'Example',2020,'Marathon','Same Name'),(20,'Example',2021,'Marathon',NULL)")
                db.execute('COPY raw TO ? (FORMAT PARQUET)', [str(source/'race_records.parquet')])
                db.execute("CREATE TABLE features(record_id BIGINT, city VARCHAR, year INTEGER, race VARCHAR, runner_name VARCHAR)")
                db.execute("INSERT INTO features VALUES (?,'Example',2021,'Marathon',NULL),(?,'Example',2020,'Marathon',?)", [*ids, 'Wrong' if wrong_name else 'Same Name'])
                return db
            db = fixture()
            self.assertTrue(canonical_id_contract(db, source), 'Row order and a missing recorded name do not change canonical identity')
            db.close()
            # The htw-db release keeps the canonical contract, still checked at runtime (its ID-CONTRACT.md text names 1107).
            (source / 'provenance.json').write_text(json.dumps({'release_tag':'htw-db-2026-10-16-1652'}))
            db = fixture()
            self.assertTrue(canonical_id_contract(db, source))
            db.close()
            db = fixture((20, 11))
            with self.assertRaisesRegex(AssertionError, 'ID sets differ'): canonical_id_contract(db, source)
            db.close()
            (source / 'provenance.json').write_text(json.dumps({'release_tag':'htw-db-2026-10-17-0000'}))
            db = fixture()
            self.assertFalse(canonical_id_contract(db, source), 'An unreviewed htw-db tag is not canonical by its prefix alone')
            db.close()
            (source / 'provenance.json').write_text(json.dumps({'release_tag':'private-export-20260912-0934'}))
            for ids, wrong_name, message in [((20, 11), False, 'ID sets differ'), ((10, 10), False, 'unique and non-null'), ((20, 10), True, 'labels disagree')]:
                db = fixture(ids, wrong_name)
                with self.assertRaisesRegex(AssertionError, message): canonical_id_contract(db, source)
                db.close()
            (source/'provenance.json').write_text(json.dumps({'release_tag':'private-export-20260907-1318'}))
            db = fixture((9000, 9001))
            self.assertFalse(canonical_id_contract(db, source), 'Legacy IDs must never be reinterpreted as canonical')
            db.close()

    def test_natural_link_and_strictly_prior_benchmark(self):
        self.check_history(canonical=False)

    def test_canonical_link_retains_missing_name_but_rejects_bad_timing_and_future_history(self):
        self.check_history(canonical=True)

    def check_history(self, canonical):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder);db=duckdb.connect()
            if canonical:
                (source/'provenance.json').write_text(json.dumps({'release_tag':'private-export-20260911-1107'}))
            db.execute('CREATE TABLE raw (id BIGINT,race VARCHAR,year INTEGER,city VARCHAR,runner VARCHAR,sex VARCHAR,age DOUBLE,age_group VARCHAR,age_or_group VARCHAR,'+','.join(f'{f} VARCHAR' for f in FIELDS)+')')
            segment_names=['05','10','15','20','25','30','35','40','42']
            db.execute('CREATE TABLE feature (record_id BIGINT,city VARCHAR,year INTEGER,race VARCHAR,runner_name VARCHAR,runner_id VARCHAR,is_ambiguous BOOLEAN,sex VARCHAR,yob DOUBLE,finish_time DOUBLE,'+','.join(f'seg_{s} DOUBLE' for s in segment_names)+')')
            cases=[('A',2017,170,'Alpha'),('A',2020,200,'Alpha'),('A',2021,190,'Alpha'),
                   ('A',2021,180,'Beta'),('A',2022,185,'Alpha'),
                   ('B',2020,210,'Alpha'),('B',2022,205,'Alpha'),
                   ('Unmatched',2022,220,'Alpha'),
                   ('ConflictingMan',2020,210,'Alpha'),('ConflictingMan',2022,205,'Alpha'),
                   ('ConflictingWoman',2020,210,'Alpha'),('ConflictingWoman',2022,205,'Alpha'),
                   ('EquivalentWoman',2020,210,'Alpha'),('EquivalentWoman',2022,205,'Alpha')]
            for rid,(uid,year,finish,city) in enumerate(cases,1):
                times=[finish*60*km/42.195 for km in POINTS]
                raw=[rid,city+' Marathon',year,city,'Fixture '+uid,'F',year-1980,'35-44',str(year-1980)]+[clock(t) for t in times]
                if canonical and uid=='B' and year==2020: raw[4]=None
                db.execute('INSERT INTO raw VALUES ('+','.join('?' for _ in raw)+')',raw)
                rounded=[round(t,3) for t in times]
                segments=[(t-(rounded[i-1] if i else 0))/60 for i,t in enumerate(rounded)]
                if uid=='Unmatched': segments[0]+=1
                sex = {('ConflictingMan',2020):' man ', ('ConflictingWoman',2020):'woman',
                       ('ConflictingWoman',2022):'M', ('EquivalentWoman',2020):' WOMAN '}.get((uid,year),'F')
                feature=[rid+9000,city,year,city+' Marathon','Fixture '+uid,uid,False,sex,1980,rounded[-1]/60]+segments
                if canonical:
                    feature[0]=rid
                    feature[4]=raw[4]
                db.execute('INSERT INTO feature VALUES ('+','.join('?' for _ in feature)+')',feature)
            db.execute('CREATE TABLE weather_fixture (city VARCHAR,year INTEGER,race_date VARCHAR,temp_c DOUBLE,dewpoint_c DOUBLE,wind_mps DOUBLE,precip_mm DOUBLE)')
            for city,year in sorted(set((x[3],x[1]) for x in cases)):
                db.execute('INSERT INTO weather_fixture VALUES (?,?,?,10,5,2,0)',[city,year,f'{year}-10-01' if city=='Alpha' else f'{year}-05-01'])
            for table,file in [('raw','race_records'),('feature','features'),('weather_fixture','race_conditions')]:
                db.execute(f'COPY {table} TO ? (FORMAT PARQUET)',[str(source/(file+'.parquet'))])
            prepare(db,source,keep_record_id=True)
            audit=prepare_history(db,source)
            self.assertEqual(audit['record_join_method'],'canonical_record_id' if canonical else 'natural_key')
            self.assertEqual(audit['canonical_id_contract_verified'],canonical)
            self.assertEqual(audit['linked_eligible_finishes'],9,'Matching splits join despite unrelated IDs; changed sections and conflicting gender identities are excluded')
            self.assertEqual(db.execute("SELECT count(*) FROM linked WHERE uid LIKE 'Conflicting%'").fetchone()[0],0,'man and woman labels must participate in identity conflict checks')
            self.assertEqual(db.execute("SELECT count(*) FROM linked WHERE uid='EquivalentWoman'").fetchone()[0],2,'Equivalent woman and F labels must identify the same recorded category')
            row=db.execute("SELECT recent_best/60,earlier_best/60,prior_count FROM history WHERE uid='A' AND year=2022").fetchone()
            self.assertAlmostEqual(row[0],180,places=4)
            self.assertAlmostEqual(row[1],170,places=4)
            self.assertEqual(row[2],4)
            rows=db.execute("SELECT recent_best/60 FROM history WHERE uid='A' AND year=2021").fetchall()
            self.assertEqual(len(rows),2)
            for row in rows: self.assertAlmostEqual(row[0],200,places=4,msg='Same-year faster outcomes must never enter the pre-race benchmark')
            self.assertEqual(db.execute("SELECT count(*) FROM pairs WHERE uid='A'").fetchone()[0],1,'Pairs touching a multiple-race year must be excluded')


if __name__=='__main__':
    unittest.main()
