"""Tests for the half-marathon builders (spec 7.1): the record and edition rules, set B, the windows, the floors and
determinism, on synthetic sources built in a temp folder; and, when the private sources are on this machine
(PACE_HALF_DIR holds platform_half.sqlite and links-slim.sqlite), the frozen policy lists recomputed from the real
snapshot. Run: python -m unittest discover -s analysis -p 'test_half.py'
"""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

import half_common as hc
import half_field
import half_linked
import half_pairs
import half_quality as hq
from half_marathon import Marathons, _dates

ROOT = Path(__file__).resolve().parents[1]

HALF_SCHEMA = """
CREATE TABLE race_records (
  id INTEGER PRIMARY KEY, race TEXT NOT NULL, year INTEGER NOT NULL, city TEXT NOT NULL,
  distance_km REAL NOT NULL DEFAULT 21.0975,
  runner TEXT, sex TEXT, age INTEGER, age_group TEXT, age_or_group TEXT,
  split_5km TEXT, split_10km TEXT, split_15km TEXT, split_20km TEXT,
  split_21_1km TEXT,
  split_25km TEXT, split_30km TEXT, split_35km TEXT, split_40km TEXT, split_42_2km TEXT,
  bib TEXT, source_runner_id TEXT,
  source_url TEXT NOT NULL, ingested_at TEXT NOT NULL,
  UNIQUE (race, year, distance_km, source_url)
);
CREATE TABLE edition_meta (
  id INTEGER PRIMARY KEY, city TEXT NOT NULL, year INTEGER NOT NULL, distance_km REAL NOT NULL DEFAULT 21.0975,
  race TEXT, race_date TEXT, official_finishers INTEGER, official_source_url TEXT, official_source_type TEXT,
  official_checked_at TEXT, db_count_at_check INTEGER, checked_at TEXT,
  completeness_status TEXT, completeness_reason TEXT, tolerance_pct REAL,
  has_splits INTEGER, split_points TEXT,
  winner_m TEXT, winner_m_time TEXT, winner_f TEXT, winner_f_time TEXT, winner_check TEXT, year_check TEXT,
  timing_basis TEXT, course_notes TEXT, updated_at TEXT, count_check text,
  UNIQUE(city, year, distance_km)
);
CREATE TABLE record_flags(record_id INTEGER NOT NULL, flag TEXT NOT NULL, reason TEXT, flagged_at TEXT NOT NULL, UNIQUE(record_id,flag));
"""


def hms(s):
    s = int(s)
    return f'{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}'


class Source:
    """A synthetic half snapshot with the real schema."""

    def __init__(self, folder):
        self.path = Path(folder) / 'platform_half.sqlite'
        self.con = sqlite3.connect(self.path)
        self.con.executescript(HALF_SCHEMA)
        self.next_id = 1
        self.next_edition = 1

    def edition(self, city, year, status='stamped', official=None, source_type='independent results', race_date=None, race=None):
        eid = self.next_edition
        self.next_edition += 1
        self.con.execute('INSERT INTO edition_meta (id, city, year, race, race_date, official_finishers, official_source_type, completeness_status) '
                         'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (eid, city, year, race or f'{city} Half', race_date or f'{year}-04-01', official, source_type, status))
        return eid

    def record(self, city, year, finish, sex='M', race=None, runner=None, bib=None, flags=()):
        rid = self.next_id
        self.next_id += 1
        text = finish if isinstance(finish, str) else hms(finish)
        self.con.execute('INSERT INTO race_records (id, race, year, city, runner, sex, split_21_1km, bib, source_url, ingested_at) '
                         'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                         (rid, race or f'{city} Half', year, city, runner if runner is not None else f'Runner Number{rid:05d}', sex, text, bib,
                          f'fixture://{rid}', '2026-10-29'))
        for flag in flags:
            self.con.execute('INSERT INTO record_flags VALUES (?, ?, NULL, ?)', (rid, flag, '2026-10-29'))
        return rid

    def field(self, city, year, times, sexes=('M', 'F'), race=None):
        return [self.record(city, year, t, sex=sexes[i % len(sexes)], race=race) for i, t in enumerate(times)]

    def close(self):
        self.con.commit()
        self.con.close()


def uniform(lo, hi, n):
    return [int(lo + (hi - lo) * (i + 0.5) / n) for i in range(n)]


class Parsing(unittest.TestCase):
    def test_times(self):
        self.assertEqual(hc.parse_time('01:23:45'), 5025.0)
        self.assertEqual(hc.parse_time('1:23:45'), 5025.0)
        self.assertEqual(hc.parse_time('1234:00:00'), 1234 * 3600.0)   # parses, then R5 (over 6:00:00) removes it
        for bad in ('-1:00:00', '1:23', '1:23:45.5', '', None, '1:2:03'):
            self.assertIsNone(hc.parse_time(bad), bad)

    def test_sql_parser_matches_python(self):
        db = hc.connect()
        for text in ('01:23:45', '1:23:45', '1234:00:00', '-1:00:00', '1:23', 'DNF'):
            got = db.execute(f"SELECT {hc.secs_sql('t')} FROM (SELECT ?::VARCHAR AS t)", [text]).fetchone()[0]
            self.assertEqual(got, hc.parse_time(text), text)

    def test_subrace_pattern_is_whole_word(self):
        import re
        pattern = re.compile(hq.NONRUN_SUBRACE_RE)
        self.assertIsNone(pattern.search('media maratón de tordesillas'))
        for name in ('10k sillas de ruedas', 'half wheelchair', 'mtb 21k', 'wch half marathon', 'categorías especiales'):
            self.assertIsNotNone(pattern.search(name), name)
        self.assertIsNone(pattern.search('mtbike club half'))


class Rules(unittest.TestCase):
    """Record rules R1–R7 and edition rules E0–E8 on a synthetic snapshot."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        s = Source(cls.tmp.name)
        normal = uniform(5400, 10800, 300)
        cls.ids = {}
        s.edition('Alpha', 2022)
        s.field('Alpha', 2022, normal)
        s.edition('Beta', 2022, status='counts_internal_only', official=300, source_type='list rows (internal only)')
        s.field('Beta', 2022, normal)
        s.field('Gamma', 2022, normal)                                   # E0: no registry row
        s.edition('Delta', 2022, status='held_for_review')
        s.field('Delta', 2022, normal)                                   # E1
        s.edition('Epsilon', 2022, status='counts_internal_only', official=100)
        s.field('Epsilon', 2022, normal)                                 # E3: 300 rows against an independent 100
        s.edition('Zeta', 2022, status='counts_internal_only')
        s.field('Zeta', 2022, normal, sexes=('M',))                      # E4
        s.edition("Zeta Women's Half", 2022, status='counts_internal_only')
        s.field("Zeta Women's Half", 2022, normal, sexes=('F',))         # a single-sex event: kept
        s.edition('Eta', 2022, status='counts_internal_only')
        s.field('Eta', 2022, uniform(4700, 4900, 300))                    # E5: a top list
        s.edition('Theta', 2022, status='counts_internal_only', source_type='list rows (internal only)')
        s.field('Theta', 2022, uniform(5400, 10800, 500))                 # E6: exactly 500 rows
        s.edition('Iota', 2022, status='counts_internal_only')
        s.field('Iota', 2022, uniform(3500, 6500, 300))                   # E7 fast
        s.edition('Kappa', 2022, status='counts_internal_only')
        s.field('Kappa', 2022, uniform(9000, 20000, 300))                 # E7 slow
        for year, (lo, hi) in zip((2019, 2020, 2021, 2022), ((5400, 9000), (5400, 9000), (5400, 9000), (6800, 11200))):
            s.edition('Lambda', year, status='counts_internal_only')
            s.field('Lambda', year, uniform(lo, hi, 200))                 # E8 for 2022 (+25% against the others)
        # Record rules, in one stamped edition.
        s.edition('Rho', 2022)
        ids = cls.ids
        ids['plain'] = s.record('Rho', 2022, '01:23:45')
        ids['negative'] = s.record('Rho', 2022, '-1:00:00')
        ids['four_digit'] = s.record('Rho', 2022, '1234:00:00')
        ids['under_floor'] = s.record('Rho', 2022, 3401)
        ids['at_floor'] = s.record('Rho', 2022, 3402)
        ids['at_cap'] = s.record('Rho', 2022, 21600)
        ids['over_cap'] = s.record('Rho', 2022, 21601)
        ids['flagged'] = s.record('Rho', 2022, 7000, flags=('duplicate',))
        ids['reconstructed'] = s.record('Rho', 2022, 7001, flags=('time_hour_reconstructed',))
        ids['wheelchair'] = s.record('Rho', 2022, 7002, race='Rho Half — Sillas de ruedas')
        ids['tordesillas'] = s.record('Rho', 2022, 7003, race='Tordesillas Half')
        ids['elite'] = [s.record('Rho', 2022, t, race='Rho Elite') for t in (3300, 3350, 3500, 3600, 3700, 3800, 3900, 4000, 4100, 4200)]
        big = [s.record('Rho', 2022, 6000 + i, race='Rho Big') for i in range(20)]
        ids['dup_big'] = s.record('Rho', 2022, 7100, race='Rho Big', runner='Ann Lee', sex='F')
        ids['dup_small'] = s.record('Rho', 2022, 7100, race='Rho Small', runner='Lee, Ann', sex='F')
        ids['dup_tie_a'] = s.record('Rho', 2022, 7200, race='Rho Big', runner='Bo Diaz')
        ids['dup_tie_b'] = s.record('Rho', 2022, 7200, race='Rho Big', runner='Diaz Bo')
        ids['dup_other_sex'] = s.record('Rho', 2022, 7300, race='Rho Big', runner='Cy Ray', sex='M')
        ids['dup_other_sex_b'] = s.record('Rho', 2022, 7300, race='Rho Small', runner='Ray Cy', sex='F')
        ids['anonymous_a'] = s.record('Rho', 2022, 7400, runner='Anonimo')
        ids['anonymous_b'] = s.record('Rho', 2022, 7400, runner='Anonimo')
        del big
        s.edition('Oslo Half', 2016)
        s.edition('Oslo Half', 2015)
        s.field('Oslo Half', 2016, uniform(5400, 10800, 120))
        s.field('Oslo Half', 2015, uniform(5400, 10800, 120))
        ids['bib'] = {b: s.record('Oslo Half', 2016, 7000, bib=str(b)) for b in (72999, 73000, 75999, 76000)}
        ids['bib_2015'] = s.record('Oslo Half', 2015, 7000, bib='74000')
        s.close()
        cls.db = hc.connect(half=s.path)
        cls.result = hq.apply(cls.db, compare=False)
        cls.rule = dict(cls.db.execute('SELECT record_id, rule FROM hr').fetchall())
        cls.r7 = dict(cls.db.execute('SELECT record_id, r7_block FROM hr').fetchall())

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        cls.tmp.cleanup()

    def test_record_rules(self):
        r, ids = self.rule, self.ids
        self.assertIsNone(r[ids['plain']])
        self.assertEqual(r[ids['negative']], 'R2')
        self.assertEqual(r[ids['four_digit']], 'R5_slow')
        self.assertEqual(r[ids['under_floor']], 'R5_fast')
        self.assertIsNone(r[ids['at_floor']])
        self.assertIsNone(r[ids['at_cap']])
        self.assertEqual(r[ids['over_cap']], 'R5_slow')
        self.assertEqual(r[ids['flagged']], 'R1')
        self.assertIsNone(r[ids['reconstructed']], 'time_hour_reconstructed alone never excludes')
        self.assertEqual(r[ids['wheelchair']], 'R3')
        self.assertIsNone(r[ids['tordesillas']], '"Tordesillas" is not the word "sillas"')
        self.assertEqual({r[i] for i in ids['elite']}, {'R4'}, 'a sub-race with 2 of 10 finishes under 56:42')

    def test_within_edition_duplicates(self):
        r, ids = self.rule, self.ids
        self.assertIsNone(r[ids['dup_big']], 'the copy from the larger sub-race list is kept')
        self.assertEqual(r[ids['dup_small']], 'R6')
        self.assertIsNone(r[ids['dup_tie_a']], 'same list: the lower id is kept')
        self.assertEqual(r[ids['dup_tie_b']], 'R6')
        self.assertIsNone(r[ids['dup_other_sex']])
        self.assertIsNone(r[ids['dup_other_sex_b']], 'a different published sex is not a duplicate')
        self.assertIsNone(r[ids['anonymous_a']])
        self.assertIsNone(r[ids['anonymous_b']], 'anonymous names are never duplicates')

    def test_oslo_bib_block(self):
        bib = self.ids['bib']
        self.assertEqual([self.r7[bib[b]] for b in (72999, 73000, 75999, 76000)], [False, True, True, False])
        self.assertFalse(self.r7[self.ids['bib_2015']], 'R7 covers 2016–2025 only')
        self.assertEqual(self.result.counts['R7'], 2)
        self.assertEqual(self.result.counts['record_usable_after_R7'], self.result.counts['record_usable'] - 2)

    def test_edition_rules_fire(self):
        m = self.result.editions.set_index(['city', 'year'])
        expect = {('Alpha', 2022): None, ('Beta', 2022): None, ('Gamma', 2022): 'E0', ('Delta', 2022): 'E1',
                  ('Epsilon', 2022): 'E3', ('Zeta', 2022): 'E4', ("Zeta Women's Half", 2022): None, ('Eta', 2022): 'E5',
                  ('Theta', 2022): 'E6', ('Iota', 2022): 'E7', ('Kappa', 2022): 'E7', ('Lambda', 2019): None, ('Lambda', 2022): 'E8'}
        for key, rule in expect.items():
            got = m.loc[key, 'rule']
            self.assertEqual(None if pd.isna(got) else got, rule, key)
        self.assertTrue(m.loc[('Alpha', 2022), 'use_sex'])
        self.assertFalse(m.loc[("Zeta Women's Half", 2022), 'use_sex'], 'one-sex events stay out of sex comparisons')

    def test_lists_and_counts(self):
        rules = {e['rule'] for e in self.result.lists['editions']}
        self.assertEqual(rules, {'E0', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'})
        self.assertEqual([s['race'] for s in self.result.lists['R3']], ['Rho Half — Sillas de ruedas'])
        self.assertEqual([s['race'] for s in self.result.lists['R4']], ['Rho Elite'])
        c = self.result.counts
        self.assertEqual(c['raw'], sum(c[k] for k in ('R1', 'R2', 'R3', 'R4', 'R5_fast', 'R5_slow', 'R6')) + c['record_usable'])
        self.assertEqual(c['use_finish']['finishes'], self.db.execute('SELECT count(*) FROM hfin WHERE NOT r7_block').fetchone()[0])

    def test_reviewed_policy_file_matches_module(self):
        hq.check_policy_file()
        doc = json.loads(hq.policy_path().read_text())
        self.assertEqual(doc['record_rules']['R3']['pattern'], hq.NONRUN_SUBRACE_RE)
        self.assertEqual(doc['expected'], hq.EXPECTED_20261029_1133)
        self.assertEqual(len(doc['edition_rules']['editions']), 68)


class SetB(unittest.TestCase):
    """The pairing rules on a synthetic links extract and marathon side."""

    def build(self, people, halves, marathons):
        """people: (person, sex, tier, ns_keys); halves: (person, record, date or None, flags); marathons: (person, record, date)."""
        db = hc.connect()
        db.execute("ATTACH ':memory:' AS l")
        db.execute('CREATE TABLE l.people (person_id TEXT, sex TEXT, confidence TEXT, ns_keys INT, key_type TEXT, in_candidate_merge INT)')
        db.execute('CREATE TABLE l.links (person_id TEXT, db TEXT, record_id BIGINT, confidence TEXT)')
        for p, sex, tier, ns in people:
            db.execute('INSERT INTO l.people VALUES (?, ?, ?, ?, ?, 0)', [p, sex, tier, ns, 'yob'])
        db.execute("""CREATE TEMP TABLE hfin (record_id BIGINT, edition_id BIGINT, city VARCHAR, year INTEGER, race VARCHAR, race_date DATE,
            status_group VARCHAR, sex VARCHAR, use_sex BOOLEAN, finish_s DOUBLE, r7_block BOOLEAN, date_suspect BOOLEAN)""")
        for p, rid, day, flags in halves:
            db.execute('INSERT INTO l.links VALUES (?, ?, ?, ?)', [p, 'half', rid, 'medium'])
            db.execute('INSERT INTO hfin VALUES (?, ?, ?, ?, ?, ?, ?, NULL, false, ?, ?, ?)',
                       [rid, rid, 'H', 2022, 'H', day, 'verified', 6300.0, 'r7' in flags, 'suspect' in flags])
        editions, dates, ids, ed = [], {}, [], []
        for i, (p, rid, day) in enumerate(marathons):
            db.execute('INSERT INTO l.links VALUES (?, ?, ?, ?)', [p, 'full', rid, 'medium'])
            editions.append({'city': f'M{i}', 'year': 2022, 'race': f'M{i}'})
            dates[i] = day.isoformat()
            ids.append(rid)
            ed.append(i)
        m = Marathons(np.array(ids, np.uint64), np.array(ed, np.int32), np.ones(len(ids), np.uint8), np.full(len(ids), 14000.0),
                      np.zeros(len(ids), bool), editions, np.ones(len(ids), np.int64), dates, 'x', {}, 'y')
        pairs = half_pairs.build(db, m, 'fixture', check=False)
        return {(r.person_id, int(r.m_record_id)): int(r.h_record_id) for r in pairs.itertuples()}

    def test_pairing_rules(self):
        d = date(2022, 6, 1)
        before = lambda days: d - timedelta(days=days)
        people = [('p1', 'F', 'medium', 1), ('p2', 'M', 'high', 2), ('p3', 'M', 'medium', 1), ('p4', 'M', 'medium', 1),
                  ('p5', 'F', 'medium', 3), ('p6', 'M', 'medium', 4), ('p7', 'M', 'low', 1), ('p8', 'F', 'medium', 1), ('p9', 'M', 'medium', 1)]
        halves = [
            ('p1', 11, before(21), ''), ('p1', 12, before(54), ''), ('p1', 13, before(20), ''),
            ('p2', 21, before(112), ''), ('p2', 22, before(113), ''),
            ('p3', 31, before(30), ''), ('p3', 32, before(30), ''),
            ('p4', 41, before(31), ''),
            ('p5', 51, before(40), 'suspect'), ('p5', 52, before(41), 'r7'),
            ('p6', 61, before(30), ''), ('p7', 71, before(30), ''),
            ('p8', 81, before(60), ''),
            ('p9', 91, None, ''),
        ]
        marathons = [('p1', 101, d), ('p2', 201, d), ('p3', 301, d), ('p4', 401, d), ('p4', 402, before(31)), ('p5', 501, d),
                     ('p6', 601, d), ('p7', 701, d), ('p8', 801, d), ('p8', 802, d - timedelta(days=30)), ('p9', 901, d)]
        got = self.build(people, halves, marathons)
        self.assertEqual(got[('p1', 101)], 11, 'the nearest earlier half from 21 days (20 days is out)')
        self.assertEqual(got[('p2', 201)], 21, '112 days is in, 113 out')
        self.assertNotIn(('p3', 301), got, 'two halves on one date: neither pairs')
        self.assertNotIn(('p4', 401), got, 'a half on the date of one of the person’s marathons never pairs')
        self.assertNotIn(('p5', 501), got, 'date suspects and the R7 block never pair')
        self.assertNotIn(('p6', 601), got, 'ns_keys over 3 is out')
        self.assertNotIn(('p7', 701), got, 'tiers other than high and medium are out')
        self.assertEqual((got[('p8', 801)], got[('p8', 802)]), (81, 81), 'one pair per person and marathon; a half may serve two')
        self.assertNotIn(('p9', 901), got, 'undated halves enter no window')
        self.assertEqual(len(got), 4)

    def test_marathon_dates_come_from_the_evidence(self):
        editions = [{'city': 'A', 'year': 2022}, {'city': 'B', 'year': 2022}]
        weather = {'editions': [{'city': 'A', 'year': 2022, 'date': '2022-10-09'}, {'city': 'B', 'year': 2022, 'date': '2022-04-03'}]}
        self.assertEqual(_dates(editions, np.array([0, 1]), weather), {0: '2022-10-09', 1: '2022-04-03'})
        with self.assertRaises(hc.HalfError):
            _dates(editions, np.array([0, 1]), {'editions': [{'city': 'A', 'year': 2022, 'date': '2021-10-09'}]})


def synthetic_pairs(n=16000, seed=3, multiple=2.2):
    """Set B-shaped pairs: halves from 1:05 to 2:55, marathons about `multiple` × the half, 30 marathon editions."""
    rng = np.random.default_rng(seed)
    h = rng.uniform(3900, 10500, n).round()
    m = (h * rng.normal(multiple, 0.08, n)).round()
    sex = np.where(rng.random(n) < 0.3, 'F', 'M')
    city = rng.choice(['Valencia', 'Warsaw', 'Berlin', 'Oslo', 'Paris'], n)
    year = rng.choice([2022, 2023, 2024, 2025, 2026, 2019], n)
    frame = pd.DataFrame({'person_id': [f'p{i % (n - 200)}' for i in range(n)], 'sex': sex, 'tier': 'medium', 'ns_keys': rng.choice([1, 2, 3], n),
                          'in_candidate_merge': rng.random(n) < 0.05, 'h_record_id': np.arange(n), 'h_edition_id': rng.integers(0, 400, n),
                          'h_status_group': np.where(rng.random(n) < 0.6, 'verified', 'unverified'), 'h_finish_s': h,
                          'm_record_id': np.arange(n) + 10**6, 'm_city': city, 'm_year': year,
                          'm_date': [date(int(y), 4, 1) + timedelta(days=int(k)) for y, k in zip(year, rng.integers(0, 200, n))],
                          'm_finish_s': m, 'm_sustained': rng.random(n) < 0.25, 'days': 40})
    frame['m_ed'] = frame.m_city + ' ' + frame.m_year.astype(str)
    frame['verified'] = frame.h_status_group == 'verified'
    return frame


class Windows(unittest.TestCase):
    def test_window_membership(self):
        p = half_linked.Pairs(synthetic_pairs().head(10).assign(h_finish_s=[6150, 6449, 6450, 6509, 6510, 6000, 6300, 6600, 6750, 6749]))
        self.assertTrue(half_linked.in_window(p, 105)[0], '1:42:30 is in the 1:45 window')
        self.assertFalse(half_linked.in_window(p, 105)[2], '1:47:30 is not in the 1:45 window')
        self.assertTrue(half_linked.in_window(p, 106)[2], '1:47:30 is in the 1:46 window')
        self.assertTrue(half_linked.in_window(p, 110)[2], '1:47:30 is in the 1:50 band')
        self.assertFalse(half_linked.in_window(p, 106)[4])

    def test_marks(self):
        values = np.array(uniform(13000, 17000, 400), float)
        q = [hc.quantile(values, x) for x in half_linked.Q]
        marks = half_linked.marks(values, q)
        self.assertEqual([t for t, _ in marks], [14400, 15300, 16200])
        for t, share in marks:
            self.assertGreater(t, q[0])
            self.assertLessEqual(t, q[-1])
            self.assertEqual(share, hc.sh((values < t).mean()))
        tie = [0] * 19
        tie[0], tie[9], tie[18] = 13000, 14850, 17000            # 13500 and 16200 are both 1,350 s from the median
        self.assertEqual([t for t, _ in half_linked.marks(values, tie)], [13500, 14400, 15300], 'ties go to the earlier mark')
        tie[0], tie[18] = 14000, 15400                            # only 14400 and 15300 qualify; both kept
        self.assertEqual([t for t, _ in half_linked.marks(values, tie)], [14400, 15300])

    def test_published_range_is_the_longest_contiguous_run(self):
        good = {'n': 200, 'e': 10, 'edge_min': 20}
        ws = {H: dict(good) for H in range(65, 171)}
        ws[100] = {'n': 99, 'e': 10, 'edge_min': 20}
        self.assertEqual(half_linked.published(ws), (101, 165))
        ws[130] = {'n': 300, 'e': 2, 'edge_min': 20}
        self.assertEqual(half_linked.published(ws), (131, 165), 'the longer run (35 windows against 30 and 29)')
        ws[140] = {'n': 300, 'e': 10, 'edge_min': 9}
        self.assertEqual(half_linked.published(ws), (70, 99), 'an edge slice under 10 pairs clips the range')
        self.assertEqual(half_linked.published({H: dict(good) for H in range(60, 200)}), (70, 165), 'clipped to 1:10–2:45')

    def test_goal_inversion_and_clean_crossings(self):
        rows = [{'h': 60 * H, 'n': 200, 'e': 9, 'q': [0] * 19, '_q': [0] * 9 + [10000 + 120 * i] + [0] * 9} for i, H in enumerate(range(80, 100))]
        for w in rows:
            w['q'] = w['_q']
        row = half_linked.goal_row(rows, 10800, full=True)
        self.assertEqual(row['h'], 60 * 86, 'the slowest window whose median is under the goal')
        self.assertIsNone(half_linked.goal_row(rows, 9000, full=False), 'no window under the goal')
        rows[6]['_q'][9] = 11000                  # 1:26 over the goal, 1:27 under it again: the crossing at 1:27 is not clean
        with self.assertRaises(hc.HalfError):
            half_linked.goal_row(rows, 10900, full=False)

    def test_build_floors_and_guard(self):
        frame = synthetic_pairs()
        linked, tool, ranges = half_linked.build(frame)
        for g in ('all', 'F', 'M'):
            for w in linked['windows'][g]:
                self.assertGreaterEqual(w['n'], hc.MIN_CELL)
                self.assertGreaterEqual(w['e'], hc.MIN_EDITIONS)
                self.assertGreaterEqual(w['edge_min'], hc.MIN_EDGE_SLICE)
            hs = [w['h'] for w in linked['windows'][g]]
            self.assertEqual(hs, list(range(hs[0], hs[-1] + 60, 60)), 'contiguous')
            self.assertEqual(tool['groups'][g]['from'], hs[0])
            self.assertEqual([w[0] for w in tool['groups'][g]['w']], [w['n'] for w in linked['windows'][g]])
        self.assertEqual([m['id'] for m in linked['checks']['battery']['members']],
                         ['pooled', 'verified_halves', 'other_marathons', 'ns_keys_1', 'one_per_person', 'editions_equal_20',
                          'editions_equal_100', 'city_equal'])
        hc.check_published(linked, 'linked')
        self.assertTrue(half_linked.flagship_guard(linked))
        moved = json.loads(json.dumps(linked))
        moved['checks']['battery']['members'][3]['multiple_p50'] = 2.30
        self.assertFalse(half_linked.flagship_guard(moved), 'one member outside [2.15, 2.25] fails the guard')
        moved = json.loads(json.dumps(linked))
        moved['checks']['battery']['members'][1]['extra_p50_s'] += 200
        self.assertFalse(half_linked.flagship_guard(moved))

    def test_sex_strata(self):
        frame = synthetic_pairs()
        frame.loc[frame.sex == 'F', 'm_sustained'] = False
        s = half_linked.sexes(half_linked.Pairs(frame))
        self.assertEqual(s['women_lower'], s['strata'])
        self.assertEqual(s['women_std'], 0.0)


class Floors(unittest.TestCase):
    def test_identifier_keys_and_strings_are_refused(self):
        for bad in ({'record_id': 1}, {'person_id': 'a'}, {'bib': 4}, {'name': 'x'}, {'rows': [{'edition_id': 3}]}, {'series_key': 'x'},
                    {'note': 'free text'}, {'city': 'half-snapshot-20261029-1133'}, {'id': 'not-a-battery-member'}, {'x': float('nan')},
                    {'sha256': 'abc'}, {'values': ['a']}, {'n': np.int64(3)}):
            with self.assertRaises(hc.HalfError, msg=bad):
                hc.check_published(bad, 'x')
        hc.check_published({'city': 'Oslo', 'members': [{'id': 'pooled', 'n': 5}], 'rule': {'half': 'text'}, 'sha256': 'a' * 64}, 'ok')

    def test_small_groups_are_left_out(self):
        frame = synthetic_pairs(n=9000)
        linked, _, ranges = half_linked.build(frame)
        lo, hi = ranges['F']
        everything = half_linked.Pairs(frame).group('F')
        for H in (lo - 1, hi + 1):
            w = half_linked.window(everything, H)
            self.assertTrue(w is None or w['n'] < hc.MIN_CELL or w['e'] < hc.MIN_EDITIONS or w['edge_min'] < hc.MIN_EDGE_SLICE
                            or not (half_linked.CLIP_MIN[0] <= H <= half_linked.CLIP_MIN[1]), H)

    def test_quantile_parity_fixture(self):
        fixture = json.loads((ROOT / 'scripts/half/fixtures/parity.json').read_text())
        for case in fixture['cases']:
            self.assertEqual([hc.quantile(case['values'], q) for q in fixture['levels']], case['quantiles'])
            self.assertEqual([hc.sec(hc.quantile(case['values'], q)) for q in fixture['levels']], case['published'])
        self.assertEqual(hc.sec(100.25), 100.2)
        self.assertEqual(hc.sec(7040.0), 7040)
        self.assertIsInstance(hc.sec(7040.0), int)


def synthetic_finishes(n_editions=40, per=400, seed=5):
    rng = np.random.default_rng(seed)
    rows = []
    for e in range(n_editions):
        t = rng.normal(7100, 1000, per).clip(3500, 14000).round()
        sex = rng.choice(['F', 'M', None], per, p=[0.38, 0.6, 0.02])
        rows.append(pd.DataFrame({'edition_id': e, 'verified': e < 30, 'sex': sex, 'use_sex': [s is not None for s in sex], 'finish_s': t}))
    return pd.concat(rows, ignore_index=True)


class Determinism(unittest.TestCase):
    def test_two_builds_give_the_same_bytes(self):
        frame = synthetic_pairs()
        a = [hc.encode(x) for x in half_linked.build(frame)[:2]]
        b = [hc.encode(x) for x in half_linked.build(frame.sample(frac=1, random_state=1))[:2]]
        self.assertEqual(a, b, 'the row order of set B does not change a byte')
        fin = synthetic_finishes(per=2000)
        with self.assertRaises(hc.HalfError):
            half_field.build(fin, policy_sha256='0' * 64, module_sha256='0' * 64)  # the tails of a small field are under 100 a minute

    def test_encode_sorts_keys(self):
        self.assertEqual(hc.encode({'b': 1, 'a': [2.5, 3]}), b'{"a":[2.5,3],"b":1}\n')

    def test_refusals_name_what_is_missing(self):
        import build_half
        with self.assertRaisesRegex(hc.HalfError, 'missing'):
            hc.connect(half=Path(tempfile.gettempdir()) / 'no-such-half.sqlite')
        with self.assertRaisesRegex(hc.HalfError, 'inside the repository'):
            build_half.check_sources(hc.load_pin(), ROOT / 'analysis' / 'half-release.json', ROOT / 'analysis' / 'release.json')
        with tempfile.TemporaryDirectory() as folder:
            wrong = Path(folder) / 'other.sqlite'
            wrong.write_bytes(b'')
            with self.assertRaisesRegex(hc.HalfError, 'pinned platform_half.sqlite'):
                build_half.check_sources(hc.load_pin(), wrong, wrong)


SOURCE_DIR = Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1133')


@unittest.skipUnless((SOURCE_DIR / 'platform_half.sqlite').is_file() and os.environ.get('PACE_HALF_SOURCE_TESTS') == '1',
                     'the private half snapshot is not on this machine (set PACE_HALF_DIR and PACE_HALF_SOURCE_TESTS=1)')
class RealSource(unittest.TestCase):
    def test_frozen_lists_and_counts_recompute_from_the_snapshot(self):
        db = hc.connect(half=SOURCE_DIR / 'platform_half.sqlite')
        result = hq.apply(db)                     # fails unless R3, R4, E0 and E2–E8 equal the frozen lists
        self.assertEqual(result.counts, hq.EXPECTED_20261029_1133)


if __name__ == '__main__':
    unittest.main()
