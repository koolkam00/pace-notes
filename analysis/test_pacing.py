"""Small, hand-checkable input validation cases. No production or public fixtures."""
import tempfile
import unittest
from pathlib import Path

import duckdb

from build_pacing import FIELDS, prepare


class PacingValidation(unittest.TestCase):
    def test_manifest_corpus_reads_either_edition_count_name(self):
        from build_pacing import manifest_corpus
        older = {'n_records': 5, 'n_cities': 2, 'n_race_years': 3, 'created_at': 'x'}
        pace_notes = {'n_records': 5, 'n_cities': 2, 'n_editions': 3, 'created_at': 'x'}
        self.assertEqual(manifest_corpus(older), manifest_corpus(pace_notes))
        self.assertEqual(manifest_corpus(pace_notes), {'n_records': 5, 'n_cities': 2, 'n_race_years': 3})
        with self.assertRaises(KeyError):
            manifest_corpus({'n_records': 5, 'n_cities': 2})

    def test_clock_parsing_and_exclusion_accounting(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)
            db = duckdb.connect()
            definitions = ','.join(f'"{f}" VARCHAR' for f in FIELDS)
            db.execute(f'CREATE TABLE fixture (race VARCHAR,year INTEGER,city VARCHAR,runner VARCHAR,sex VARCHAR,age DOUBLE,age_group VARCHAR,age_or_group VARCHAR,{definitions})')
            # 5 min/km throughout, including the 2.195 km finish section.
            split = ['0:25:00','0:50:00','1:15:00','1:40:00','2:05:00','2:30:00','2:55:00','3:20:00','3:30:58.5']
            good = ['Marathon',2020,'Example','Fixture A','F',35,'35-39','35'] + split
            duplicate = good.copy()
            missing = good.copy(); missing[3]='Fixture B'; missing[8]=None
            malformed = good.copy(); malformed[3]='Fixture C'; malformed[9]='00:99:00'
            backwards = good.copy(); backwards[3]='Fixture D'; backwards[9]='0:20:00'
            outlier = good.copy(); outlier[3]='Fixture E'; outlier[8]='0:01:00'
            db.executemany('INSERT INTO fixture VALUES ('+','.join('?' for _ in good)+')',[good,duplicate,missing,malformed,backwards,outlier])
            db.execute('COPY fixture TO ? (FORMAT PARQUET)', [str(source/'race_records.parquet')])
            stats=prepare(db,source)
            self.assertEqual(stats['raw'],6)
            self.assertEqual(stats['duplicates_removed'],1)
            self.assertEqual(stats['missing_or_unparsed'],2)
            self.assertEqual(stats['non_increasing'],1)
            self.assertEqual(stats['outside_quality_bounds'],1)
            self.assertEqual(stats['eligible'],1)
            self.assertAlmostEqual(db.execute('SELECT p8 FROM eligible').fetchone()[0],300)
            self.assertAlmostEqual(db.execute('SELECT change20 FROM eligible').fetchone()[0],0)
            self.assertLess(db.execute('SELECT max(abs(relative)) FROM sections').fetchone()[0],1e-10)
            self.assertEqual(db.execute("SELECT seconds('1:02:03'),seconds('62:03'),seconds('1:70:00')").fetchone(),(3723.,3723.,None))


if __name__ == '__main__':
    unittest.main()
