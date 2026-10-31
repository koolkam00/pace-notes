"""Tests for the half-marathon builders (spec 7.1): the record and edition rules, set B, the windows, the floors and
determinism, the stamp correction (1133) and the stamp check (1904), the pin (schema 3), the anonymous downloader and the
links extract, on synthetic sources built in a temp folder; and, when the owner's public sources are on this machine
(PACE_HALF_DIR, default ~/data/half-1904, holds platform_half.sqlite and csv-edition_meta.csv.zst, and the 2157 stamp
reference sits at $PACE_HALF_DIR/half-dataset-20261029-2157/ or at $PACE_HALF_STAMP_REFERENCE) and
PACE_HALF_SOURCE_TESTS=1, the frozen 1904 policy lists, counts and stamps recomputed from the real snapshot.
Run: python3 -I -m unittest discover -s analysis -p 'test_half.py'
"""
from __future__ import annotations

import json
import os
import re
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
        pattern = re.compile(hq.rules_of()['nonrun_subrace_re'])
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
        ids['bib_none'] = s.record('Oslo Half', 2016, 7001)                 # no bib: outside the block
        ids['bib_text'] = s.record('Oslo Half', 2016, 7002, bib='A12')      # a bib that is no integer: outside too
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
        # Verify round 1 (October 31, 2026): a missing or non-integer bib is outside the range (false, never null), so the
        # record stays usable in every count; a null here once dropped the Oslo Half's unbibbed rows from use_finish.
        for key in ('bib_none', 'bib_text'):
            self.assertIs(self.r7[self.ids[key]], False, key)
            self.assertEqual(self.db.execute('SELECT count(*) FROM hfin WHERE record_id = ? AND NOT r7_block', [self.ids[key]]).fetchone()[0], 1, key)
        self.assertEqual(self.db.execute('SELECT count(*) FROM hr WHERE r7_block IS NULL').fetchone()[0], 0)

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
        hq.check_policy_file(hq.TAG_1133)
        doc = json.loads(hq.policy_path(hq.TAG_1133).read_text())
        self.assertEqual(doc['record_rules']['R3']['pattern'], hq.NONRUN_SUBRACE_RE_20261029_1133)
        self.assertEqual(doc['expected'], hq.EXPECTED_20261029_1133)
        self.assertEqual(len(doc['edition_rules']['editions']), 68)
        self.assertEqual([doc['record_rules']['R7'][k] for k in ('city', 'years', 'bib')], ['Oslo Half', [2016, 2025], [73000, 75999]],
                         'the frozen policy carries the R7 block itself, the Node recount reads it from there')
        self.assertEqual(doc['battery']['off_road_labels'], ['Kystleden Half', 'Nordmarka Skogsmaraton Half', 'Trondheim Skogsmaraton Half'],
                         'the off-road labels pre-registered on 2026-10-30, exactly as the snapshot writes them')
        self.assertEqual(doc['battery']['reviewed'], '2026-10-30')
        self.assertEqual(set(doc['battery']), {'reviewed', 'off_road_labels', 'verified_federation', 'verified_road', 'leave_outs'})
        lists = hq.battery_lists(hq.TAG_1133)
        self.assertEqual(lists['weaker_source'], {x['edition_id'] for x in doc['stamp_correction']['weaker_source']})
        self.assertEqual(lists['off_road_labels'], set(doc['battery']['off_road_labels']))

    def test_off_road_labels_must_be_verified_labels(self):
        labels = hq.REVIEWED_HALF_POLICIES[hq.TAG]['battery']['off_road_labels']
        m = pd.DataFrame({'city': [*labels, 'Oslo Half'], 'use_finish': True, 'status_group': 'verified'})
        hq.check_battery_lists(m)
        for broken in (m.iloc[1:], m.assign(status_group=['unverified'] + ['verified'] * len(labels)), m.assign(use_finish=[False] + [True] * len(labels))):
            with self.assertRaisesRegex(hc.HalfError, 'off-road label'):
                hq.check_battery_lists(broken)


def pid(i: int) -> str:
    """A v4 person id (^p4_[0-9a-f]{16}$)."""
    return f'p4_{i:016x}'


class SetB(unittest.TestCase):
    """The pairing rules (lead rulings L) on a synthetic links extract and marathon side."""

    def build(self, people, halves, marathons, link_editions=None, coverage=False):
        """people: (person, sex, tier, ns_keys); halves: (person, record, date or None, flags) with flags 'r7', 'suspect',
        'noage' (the row's own confidence low_noage), 'link' (a link edition); marathons: (person, record, date[, flags])
        with flag 'noage'."""
        db = hc.connect()
        db.execute("ATTACH ':memory:' AS l")
        db.execute('CREATE TABLE l.people (person_id TEXT, sex TEXT, tier TEXT, ns_keys INT, key_type TEXT, in_union INT, k INT, k_block TEXT)')
        db.execute('CREATE TABLE l.links (person_id TEXT, db TEXT, record_id BIGINT, confidence TEXT, finish_s BIGINT, sex TEXT, city TEXT, year INT, ns_keys INT)')
        for p, sex, tier, ns in people:
            db.execute('INSERT INTO l.people VALUES (?, ?, ?, ?, ?, 0, 1, ?)', [p, sex, tier, ns, 'yob', 'b' * 16])
        db.execute("""CREATE TEMP TABLE hfin (record_id BIGINT, edition_id BIGINT, city VARCHAR, year INTEGER, race VARCHAR, race_date DATE,
            status_group VARCHAR, sex VARCHAR, use_sex BOOLEAN, finish_s DOUBLE, r7_block BOOLEAN, date_suspect BOOLEAN)""")
        link = set()
        for p, rid, day, flags in halves:
            db.execute('INSERT INTO l.links VALUES (?, ?, ?, ?, 6300, NULL, ?, 2022, 1)', [p, 'half', rid, 'low_noage' if 'noage' in flags else 'medium', 'H'])
            db.execute('INSERT INTO hfin VALUES (?, ?, ?, ?, ?, ?, ?, NULL, false, ?, ?, ?)',
                       [rid, rid, 'H', 2022, 'H', day, 'verified', 6300.0, 'r7' in flags, 'suspect' in flags])
            if 'link' in flags:
                link.add(rid)
        editions, dates, ids, ed = [], {}, [], []
        for i, row in enumerate(marathons):
            p, rid, day = row[:3]
            flags = row[3] if len(row) > 3 else ''
            db.execute('INSERT INTO l.links VALUES (?, ?, ?, ?, 14000, NULL, ?, 2022, 1)', [p, 'full', rid, 'low_noage' if 'noage' in flags else 'high', f'M{i}'])
            editions.append({'city': f'M{i}', 'year': 2022, 'race': f'M{i}'})
            dates[i] = day.isoformat()
            ids.append(rid)
            ed.append(i)
        m = Marathons(np.array(ids, np.uint64), np.array(ed, np.int32), np.ones(len(ids), np.uint8), np.full(len(ids), 14000.0),
                      np.zeros(len(ids), bool), editions, np.ones(len(ids), np.int64), dates, 'x', {}, 'y')
        le = link_editions or {'link_partial': frozenset(link), 'retimed': frozenset()}
        pairs = half_pairs.build(db, m, 'fixture', link_editions=le, check=False)
        got = {(r.person_id, int(r.m_record_id)): int(r.h_record_id) for r in pairs.itertuples()}
        if coverage:
            return got, pairs, half_pairs.coverage(db, m, link_editions=le)
        return got, pairs

    def test_pairing_rules(self):
        d = date(2022, 6, 1)
        before = lambda days: d - timedelta(days=days)
        P = {i: pid(i) for i in range(1, 30)}
        people = [(P[1], 'F', 'medium', 1), (P[2], 'M', 'high', 2), (P[3], 'M', 'medium', 1), (P[4], 'M', 'medium', 1),
                  (P[5], 'F', 'medium', 3), (P[6], 'M', 'medium', 4), (P[7], 'M', 'low', 1), (P[8], 'F', 'medium', 1), (P[9], 'M', 'medium', 1),
                  (P[10], 'M', 'medium', 1), (P[11], 'F', 'high', 1), (P[12], 'M', 'medium', 0), (P[13], 'M', 'medium', 1),
                  (P[14], 'F', 'medium', 1), (P[15], 'M', 'high', 1), (P[16], 'F', 'high_elite', 1), (P[17], 'M', 'medium', 2), (P[18], 'F', 'medium', 1)]
        halves = [
            (P[1], 11, before(21), ''), (P[1], 12, before(54), ''), (P[1], 13, before(20), ''),
            (P[2], 21, before(112), ''), (P[2], 22, before(113), ''),
            (P[3], 31, before(30), ''), (P[3], 32, before(30), ''),
            (P[4], 41, before(31), ''),
            (P[5], 51, before(40), 'suspect'), (P[5], 52, before(41), 'r7'),
            (P[6], 61, before(30), ''), (P[7], 71, before(30), ''),
            (P[8], 81, before(60), ''),
            (P[9], 91, None, ''),
            (P[10], 101, before(30), 'noage'),
            (P[11], 111, before(30), ''), (P[11], 112, before(30), 'noage'),
            (P[12], 121, before(30), ''),
            (P[13], 131, before(30), 'link'),
            (P[14], 141, before(30), ''), (P[14], 142, before(30), 'link'),
            (P[15], 151, before(30), ''),
            (P[16], 161, before(30), ''),
            (P[17], 171, before(40), ''),
            (P[18], 181, before(40), ''),
        ]
        marathons = [(P[1], 101, d), (P[2], 201, d), (P[3], 301, d), (P[4], 401, d), (P[4], 402, before(31)), (P[5], 501, d),
                     (P[6], 601, d), (P[7], 701, d), (P[8], 801, d), (P[8], 802, d - timedelta(days=30)), (P[9], 901, d),
                     (P[10], 1001, d), (P[11], 1101, d), (P[12], 1201, d), (P[12], 1202, before(30), 'noage'), (P[13], 1301, d),
                     (P[14], 1401, d), (P[15], 1501, d, 'noage'), (P[16], 1601, d), (P[17], 1701, d), (P[17], 1702, d + timedelta(days=10)),
                     (P[18], 1801, d), (P[18], 1802, d - timedelta(days=5), 'noage')]
        got, pairs = self.build(people, halves, marathons)
        self.assertEqual(got[(P[1], 101)], 11, 'the nearest earlier half from 21 days (20 days is out)')
        self.assertEqual(got[(P[2], 201)], 21, '112 days is in, 113 out')
        self.assertNotIn((P[3], 301), got, 'two halves on one date: neither pairs')
        self.assertNotIn((P[4], 401), got, 'a half on the date of one of the person’s marathons never pairs')
        self.assertNotIn((P[5], 501), got, 'date suspects and the R7 block never pair')
        self.assertNotIn((P[6], 601), got, 'ns_keys over 3 is out')
        self.assertNotIn((P[7], 701), got, 'the low tier is out')
        self.assertEqual((got[(P[8], 801)], got[(P[8], 802)]), (81, 81), 'one pair per person and marathon; a half may serve two')
        self.assertNotIn((P[9], 901), got, 'undated halves enter no window')
        self.assertNotIn((P[10], 1001), got, 'a half attached without an age never pairs')
        self.assertNotIn((P[11], 1101), got, 'a second half on the date blocks, whatever its own confidence')
        self.assertNotIn((P[12], 1201), got, 'a marathon on the half’s date blocks, whatever its own confidence')
        self.assertNotIn((P[13], 1301), got, 'a half in a link edition never pairs')
        self.assertNotIn((P[14], 1401), got, 'a half in a link edition on the same date still blocks')
        self.assertNotIn((P[15], 1501), got, 'a marathon attached without an age never pairs')
        self.assertEqual(got[(P[16], 1601)], 161, 'high_elite counts as high')
        self.assertEqual((got[(P[17], 1701)], got[(P[17], 1702)]), (171, 171))
        self.assertEqual(got[(P[18], 1801)], 181)
        self.assertEqual(len(got), 8)
        s = half_pairs.summary(pairs)
        self.assertEqual(s['halves_in_two_or_more_pairs'], 2, 'halves 81 and 171 each serve two pairs')
        self.assertEqual(s['pairs_with_a_close_marathon'], 3, '1701 and 1702 are 10 days apart; 1802 (attached without an age) is 5 days from 1801')
        self.assertEqual([s['pairs'], s['people'], s['women_pairs'], s['men_pairs']], [8, 6, 5, 3])
        self.assertEqual(set(pairs.tier), {'medium', 'high', 'high_elite'})

    def test_the_link_rule_refuses_ids_that_are_not_v4(self):
        with self.assertRaisesRegex(hc.HalfError, 'without a v4 person id'):
            self.build([('p1', 'F', 'medium', 1)], [('p1', 11, date(2022, 5, 1), '')], [('p1', 101, date(2022, 6, 1))])

    def test_coverage_counts_rows_that_may_pair(self):
        d = date(2022, 6, 1)
        people = [(pid(1), 'F', 'medium', 1), (pid(2), 'M', 'medium', 1), (pid(3), 'M', 'medium', 5), (pid(4), 'F', 'high', 1)]
        halves = [(pid(1), 11, d - timedelta(days=300), ''), (pid(2), 21, d - timedelta(days=30), 'noage'), (pid(3), 31, d, ''),
                  (pid(4), 41, d, 'link')]
        marathons = [(pid(1), 101, d), (pid(2), 201, d), (pid(3), 301, d), (pid(4), 401, d), (pid(1), 102, d, 'noage')]
        _, _, cov = self.build(people, halves, marathons, coverage=True)
        linked = {c['city']: c['linked'] for c in cov}
        self.assertEqual(linked, {'M0': 1, 'M1': 0, 'M2': 0, 'M3': 0, 'M4': 0},
                         'only a strong marathon row, of a person with a strong row on a usable half, counts as linked')

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
                          'in_union': rng.random(n) < 0.05, 'h_record_id': np.arange(n), 'h_edition_id': rng.integers(0, 400, n),
                          'h_status_group': np.where(rng.random(n) < 0.6, 'verified', 'unverified'), 'h_finish_s': h,
                          'm_record_id': np.arange(n) + 10**6, 'm_city': city, 'm_year': year,
                          'm_date': [date(int(y), 4, 1) + timedelta(days=int(k)) for y, k in zip(year, rng.integers(0, 200, n))],
                          'm_finish_s': m, 'm_sustained': rng.random(n) < 0.25, 'days': 40})
    frame['h_label'] = np.where(frame.h_edition_id % 40 == 7, 'Trail Half', 'H' + (frame.h_edition_id % 25).astype(str))
    frame['m_ed'] = frame.m_city + ' ' + frame.m_year.astype(str)
    frame['verified'] = frame.h_status_group == 'verified'
    return frame


# The battery lists of the synthetic sets: two weaker-source editions and one off-road label (half_quality.battery_lists).
LISTS = {'weaker_source': frozenset({11, 12}), 'off_road_labels': frozenset({'Trail Half'})}


def build_linked(frame, **kw):
    return half_linked.build(frame, **LISTS, **kw)


def member(linked, id_):
    return next(m for m in linked['checks']['battery']['members'] if m['id'] == id_)


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
        linked, tool, ranges = build_linked(frame)
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
                         ['pooled', 'verified_halves', 'verified_federation', 'verified_road', 'other_marathons', 'ns_keys_1',
                          'one_per_person', 'editions_equal_20', 'editions_equal_100', 'city_equal'])
        self.assertEqual({m['id'] for m in linked['checks']['battery']['members']}, hc.BATTERY_IDS)
        hc.check_published(linked, 'linked')
        self.assertTrue(half_linked.flagship_guard(linked))
        moved = json.loads(json.dumps(linked))
        member(moved, 'ns_keys_1')['multiple_p50'] = 2.30
        self.assertFalse(half_linked.flagship_guard(moved), 'one member outside [2.15, 2.25] fails the guard')
        moved = json.loads(json.dumps(linked))
        member(moved, 'verified_halves')['extra_p50_s'] += 200
        self.assertFalse(half_linked.flagship_guard(moved))

    def test_verified_federation_and_verified_road(self):
        frame = synthetic_pairs()
        linked, _, _ = build_linked(frame)
        v = frame.verified.to_numpy(bool)
        weak = frame.h_edition_id.isin(LISTS['weaker_source']).to_numpy(bool)
        trail = (frame.h_label == 'Trail Half').to_numpy(bool)
        self.assertTrue((v & weak).any() and (v & trail).any(), 'the synthetic set holds both kinds of verified half')
        m, h = frame.m_finish_s.to_numpy(float), frame.h_finish_s.to_numpy(float)
        for id_, keep in (('verified_halves', v), ('verified_federation', v & ~weak), ('verified_road', v & ~trail)):
            self.assertEqual(member(linked, id_), {'id': id_, **half_linked.member_values(m[keep], h[keep])}, id_)
        self.assertLess(member(linked, 'verified_federation')['n'], member(linked, 'verified_halves')['n'])
        self.assertLess(member(linked, 'verified_road')['n'], member(linked, 'verified_halves')['n'])
        for id_ in ('verified_federation', 'verified_road'):
            for change in ({'multiple_p50': 2.30}, {'multiple_p50': 2.149}, {'under_double': 0.15}, {'multiple_p50': 2.25 + 0.1}):
                moved = json.loads(json.dumps(linked))
                member(moved, id_).update(change)
                self.assertFalse(half_linked.flagship_guard(moved), f'{id_} {change}: the new members carry every member clause')
            moved = json.loads(json.dumps(linked))
            moved['checks']['battery']['members'] = [x for x in moved['checks']['battery']['members'] if x['id'] != id_]
            self.assertFalse(half_linked.flagship_guard(moved), f'a battery without {id_} cannot pass')

    def test_one_verified_half_edition_out(self):
        frame = synthetic_pairs()
        linked, _, _ = build_linked(frame)
        b = linked['checks']['battery']
        pooled = member(linked, 'pooled')
        extra, half = pooled['extra_p50_s'], b['pooled_half_p50_s']
        v = frame.verified.to_numpy(bool)
        weak = frame.h_edition_id.isin(LISTS['weaker_source']).to_numpy(bool)
        m, h, ed = frame.m_finish_s.to_numpy(float), frame.h_finish_s.to_numpy(float), frame.h_edition_id.to_numpy('int64')
        self.assertEqual(list(b['leave_outs']), ['verified_halves', 'verified_federation'])
        for id_, keep in (('verified_halves', v), ('verified_federation', v & ~weak)):
            x = b['leave_outs'][id_]
            eds = sorted(set(ed[keep].tolist()))
            self.assertEqual(x['variants'], len(eds), 'one variant per verified half edition with a pair in the member')
            self.assertEqual(x['under_floor'], 0)
            variants = [{'half_edition': e, 'left_out': int((keep & (ed == e)).sum()), **half_linked.member_values(m[keep & (ed != e)], h[keep & (ed != e)])}
                        for e in eds]
            clauses = half_linked.LEAVE_OUTS[id_]
            self.assertEqual(set(x['worst']), {k for c in clauses for k in half_linked.WORST[c]})
            self.assertEqual(x['worst']['multiple_low'], min(variants, key=lambda q: (q['multiple_p50'], q['half_edition'])))
            self.assertEqual(x['worst']['multiple_high'], min(variants, key=lambda q: (-q['multiple_p50'], q['half_edition'])))
            self.assertEqual(x['worst']['under_double'], min(variants, key=lambda q: (-q['under_double'], q['half_edition'])))
            gap = lambda q: abs((q['multiple_p50'] - 2) * half - extra)  # noqa: E731
            self.assertEqual(x['worst']['reexpressed'], min(variants, key=lambda q: (-gap(q), q['half_edition'])))
            for w in x['worst'].values():
                self.assertEqual(w['n'] + w['left_out'], member(linked, id_)['n'])
            self.assertEqual(x['failing'], {c: 0 for c in clauses})
            self.assertEqual(x['failed'], 0)
        self.assertIn('extra', b['leave_outs']['verified_halves']['worst'], 'verified-halves variants also carry the minutes clause')
        self.assertNotIn('extra', b['leave_outs']['verified_federation']['worst'])
        self.assertTrue(half_linked.flagship_guard(linked))
        for id_, key, change in (('verified_halves', 'multiple_low', {'multiple_p50': 2.149}), ('verified_halves', 'multiple_high', {'multiple_p50': 2.2501}),
                                 ('verified_halves', 'under_double', {'under_double': 0.15}), ('verified_halves', 'extra', {'extra_p50_s': extra - 181}),
                                 ('verified_federation', 'reexpressed', {'multiple_p50': 2 + (extra + 181) / half}),
                                 ('verified_federation', 'under_double', {'under_double': 0.2})):
            moved = json.loads(json.dumps(linked))
            moved['checks']['battery']['leave_outs'][id_]['worst'][key].update(change)
            self.assertFalse(half_linked.flagship_guard(moved), f'{id_} {key} {change}: one failing variant fails the guard')
        for id_ in ('verified_halves', 'verified_federation'):
            moved = json.loads(json.dumps(linked))
            moved['checks']['battery']['leave_outs'][id_]['under_floor'] = 1
            self.assertFalse(half_linked.flagship_guard(moved), 'a variant under the floor cannot pass')
            moved = json.loads(json.dumps(linked))
            del moved['checks']['battery']['leave_outs'][id_]
            self.assertFalse(half_linked.flagship_guard(moved), 'without its leave-outs the guard cannot pass')

    def test_a_leave_out_catches_what_its_member_hides(self):
        # Verified halves at about 2.13 times the half, one edition of 30% of them at 2.40: the member's median sits over
        # 2.15, and without that edition it falls under the band. No minimum edition size, no exemption.
        frame = synthetic_pairs()
        rng = np.random.default_rng(9)
        v = frame.verified.to_numpy(bool)
        big = v & (frame.h_edition_id.to_numpy() % 10 < 3)
        mult = np.where(big, 2.40, rng.normal(2.13, 0.05, len(frame)))
        frame.loc[v, 'h_edition_id'] = np.where(big[v], 500, frame.h_edition_id[v])
        frame.loc[v, 'm_finish_s'] = (frame.h_finish_s[v] * mult[v]).round()
        linked, _, _ = build_linked(frame)
        self.assertGreaterEqual(member(linked, 'verified_halves')['multiple_p50'], 2.15)
        x = linked['checks']['battery']['leave_outs']['verified_halves']
        self.assertEqual(x['worst']['multiple_low']['half_edition'], 500)
        self.assertLess(x['worst']['multiple_low']['multiple_p50'], 2.15)
        self.assertEqual(x['failing']['multiple'], 1)
        self.assertFalse(half_linked.flagship_guard(linked))
        hc.check_published(linked, 'linked')

    def test_a_member_of_one_edition_leaves_nothing_to_judge(self):
        frame = synthetic_pairs()
        v = frame.verified.to_numpy(bool)
        frame.loc[v, 'h_edition_id'] = 600
        linked, _, _ = build_linked(frame)
        x = linked['checks']['battery']['leave_outs']['verified_halves']
        self.assertEqual((x['variants'], x['under_floor'], x['failed']), (1, 1, 1))
        self.assertEqual(set(x['worst'].values()), {None})
        self.assertFalse(half_linked.flagship_guard(linked))

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

    def test_an_edition_id_only_names_a_worst_leave_out(self):
        ok = {'checks': {'battery': {'leave_outs': {'verified_federation': {'worst': {'multiple_low': {'half_edition': 8671, 'n': 1372}}}}}}}
        hc.check_published(ok, 'linked.json')
        for bad in ({'checks': {'battery': {'leave_outs': {'verified_federation': {'worst': {'multiple_low': {'half_edition': '8671'}}}}}}},
                    {'checks': {'battery': {'leave_outs': {'verified_federation': {'worst': {'multiple_low': {'half_edition': 86.0}}}}}}},
                    {'checks': {'battery': {'leave_outs': {'verified_road': {'worst': {'multiple_low': {'half_edition': 8671}}}}}}},
                    {'checks': {'by_city': [{'half_edition': 8671}]}}, {'half_edition': 3},
                    {'checks': {'battery': {'leave_outs': {'verified_halves': {'worst': {'multiple_low': {'edition_id': 8671}}}}}}}):
            with self.assertRaises(hc.HalfError, msg=bad):
                hc.check_published(bad, 'linked.json')

    def test_open_tails_hold_the_floor(self):
        for bad in ({'F': {'under_lo': 16, 'at_or_over_hi': 500, 'counts': [200]}}, {'under_lo': 100, 'at_or_over_hi': 99, 'counts': []}):
            with self.assertRaisesRegex(hc.HalfError, 'open tail', msg=bad):
                hc.check_published(bad, 'x')
        hc.check_published({'under_lo': 100, 'at_or_over_hi': 1363, 'counts': [183]}, 'ok')

    def test_small_groups_are_left_out(self):
        frame = synthetic_pairs(n=9000)
        linked, _, ranges = build_linked(frame)
        lo, hi = ranges['F']
        everything = half_linked.Pairs(frame).group('F')
        for H in (lo - 1, hi + 1):
            w = half_linked.window(everything, H)
            self.assertTrue(w is None or w['n'] < hc.MIN_CELL or w['e'] < hc.MIN_EDITIONS or w['edge_min'] < hc.MIN_EDGE_SLICE
                            or not (half_linked.CLIP_MIN[0] <= H <= half_linked.CLIP_MIN[1]), H)

    def test_womens_bands_need_twenty_editions(self):
        # The band medians are published from at least 20 editions and are otherwise left out, never published from fewer
        # (review, October 30, 2026: the floor had been lowered to 3 to keep 15 editions' columns on /half).
        import half_women
        self.assertEqual(half_women.MIN_BAND_EDITIONS, 20)
        row = lambda f: {'n': [200] * 8, 'F': [round(200 * x) for x in f]}
        rising = [0.1, 0.2, 0.3, 0.45, 0.6, 0.62, 0.64, 0.66]
        few = half_women.band_fields([row(rising)] * 19)
        self.assertEqual((few['band_editions'], few['median_share'], few['cross_s']), ([], [], None))
        self.assertEqual((few['band_editions_qualifying'], few['min_band_editions']), (19, 20))
        enough = half_women.band_fields([row(rising)] * 20)
        self.assertEqual((len(enough['band_editions']), enough['cross_s'], enough['band_editions_qualifying']), (20, 8100, 20))
        self.assertEqual(enough['median_share'][4], 0.6)
        # Twenty editions whose crossing moves when one is left out fail loudly.
        mixed = [row(rising)] * 10 + [row([0.1, 0.2, 0.3, 0.45, 0.45, 0.62, 0.64, 0.66])] * 10
        with self.assertRaisesRegex(hc.HalfError, 'crossing'):
            half_women.band_fields(mixed)

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


class MethodologyChecks(unittest.TestCase):
    """The source-only values /methodology reads: by country, the same race in both kinds of year, by city, coverage."""

    def test_countries_floors_and_unreviewed_labels(self):
        fin = synthetic_finishes().assign(city=lambda f: np.where(f.edition_id < 12, 'Oslo Half', np.where(f.edition_id < 28, 'Paris', 'Graz')))
        verified = fin[fin.verified]
        rows = half_field.countries(verified, {'Oslo Half': 'NO', 'Paris': 'FR', 'Graz': 'AT'})
        self.assertEqual([r['label'] for r in rows], ['FR', 'NO'], 'Graz has 2 verified editions here: under the floor, left out')
        self.assertEqual([r['editions'] for r in rows], [16, 12])
        self.assertAlmostEqual(sum(r['share'] for r in rows), 28 / 30)
        hc.check_published({'countries': rows}, 'countries')
        with self.assertRaisesRegex(hc.HalfError, 'without a reviewed country'):
            half_field.countries(verified, {'Oslo Half': 'NO'})

    def test_same_race_is_verified_minus_unverified(self):
        fin = synthetic_finishes().assign(city=lambda f: 'R' + (f.edition_id % 5).astype(str))
        fin.loc[~fin.verified, 'finish_s'] += 60              # unverified years a minute slower
        sr = half_field.same_race(fin)
        self.assertEqual(sr['races'], 5)
        self.assertLess(sr['diff_s']['p50'], 0)
        self.assertLessEqual(sr['diff_s']['p25'], sr['diff_s']['p50'])
        with self.assertRaises(hc.HalfError):
            half_field.same_race(fin[fin.verified])

    def test_by_city_is_the_city_equal_member(self):
        frame = synthetic_pairs()
        linked, _, ranges = build_linked(frame)
        cities = linked['checks']['by_city']
        member = next(m for m in linked['checks']['battery']['members'] if m['id'] == 'city_equal')
        self.assertEqual(len(cities), member['n'])
        for c in cities:
            self.assertGreaterEqual(c['pairs'], hc.MIN_CELL)
            self.assertGreaterEqual(c['e'], hc.MIN_EDITIONS)
            self.assertTrue(c['mid'] is None or (c['mid']['pairs'] >= hc.MIN_CELL and c['mid']['pairs'] <= c['pairs']))
        bands = linked['checks']['multiple_by_band']
        self.assertEqual([b['h'] for b in bands], [60 * H for H in range(ranges['all'][0], ranges['all'][1] + 1) if H % 5 == 0])
        self.assertNotIn('coverage', linked['checks'], 'coverage only when the builder passes it')

    def test_pairs_from_counts_every_marathon_city(self):
        # Verify round 1 (October 31, 2026): the limits sentence's cities come from every marathon city, so a city under
        # by_city's 3-edition rule is named when it holds many pairs.
        frame = synthetic_pairs()
        frame.loc[frame.m_city == 'Paris', 'm_year'] = 2024                  # Paris: one edition, out of by_city
        frame['m_ed'] = frame.m_city + ' ' + frame.m_year.astype(str)
        frame.loc[frame.index[:6000], ['m_city', 'm_ed']] = ['Paris', 'Paris 2024']
        linked, _, _ = build_linked(frame)
        self.assertNotIn('Paris', [c['city'] for c in linked['checks']['by_city']])
        counts = frame.groupby('m_city').size().sort_values(ascending=False)
        want, held = [], 0
        for city in sorted(counts.index, key=lambda c: (-counts[c], c)):
            if 2 * held > len(frame):
                break
            want.append(city)
            held += int(counts[city])
        got = linked['checks']['pairs_from']
        self.assertEqual([c['city'] for c in got['cities']], want)
        self.assertEqual(got['cities'][0], {'city': 'Paris', 'pairs': int(counts['Paris']), 'e': 1})
        self.assertEqual(got['pairs'], held)
        self.assertGreater(2 * got['pairs'], len(frame))
        self.assertLessEqual(2 * (got['pairs'] - got['cities'][-1]['pairs']), len(frame), 'the fewest cities')
        # A city under 100 pairs among them: no list (the sentence falls back to "unevenly").
        spread = frame.assign(m_city=['C%03d' % (i % 200) for i in range(len(frame))])
        self.assertIsNone(half_linked.pairs_from(half_linked.Pairs(spread)))

    def test_coverage_floors(self):
        rows = half_linked.coverage_rows([{'city': 'A', 'finishes': 5000, 'linked': 2000}, {'city': 'B', 'finishes': 900, 'linked': 300},
                                          {'city': 'C', 'finishes': 50000, 'linked': 99}, {'city': 'D', 'finishes': 20000, 'linked': 100}])
        self.assertEqual([r['city'] for r in rows], ['A', 'D'], 'under 1,000 finishes or 100 linked: left out; by share')
        self.assertEqual(rows[1]['share'], 0.005)


class Determinism(unittest.TestCase):
    def test_two_builds_give_the_same_bytes(self):
        frame = synthetic_pairs()
        a = [hc.encode(x) for x in build_linked(frame)[:2]]
        b = [hc.encode(x) for x in build_linked(frame.sample(frac=1, random_state=1))[:2]]
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


class Cards(unittest.TestCase):
    """analysis/half_cards.py: the card plots read their family files and draw what the pages draw."""

    @staticmethod
    def families(pooled_half=6318, under=(0.0772, 0.476)):
        win = lambda h, sus: {'h': h, 'sus': sus}  # noqa: E731
        field = {'under': [{'s': 7200, 'all': 0.56, 'F': 0.35, 'M': 0.68}], 'cohort': {'finishes': 1000, 'editions': 9}}
        women = {'same_city': {'cities': [{'city': 'A', 'half': 0.4, 'marathon': 0.25}, {'city': 'B', 'half': 0.3, 'marathon': 0.2}],
                               'summary': {'half_median': 0.35, 'marathon_median': 0.22, 'pairs': 12, 'cities': 2, 'half_higher': 12}}}
        linked = {'overall': {'under_double_plus_min': {'0': under[0], '20': under[1]}, 'extra_s': {'p50': 1254}},
                  'set': {'pairs': 500}, 'checks': {'battery': {'pooled_half_p50_s': pooled_half}},
                  'windows': {'F': [win(h, 0.1) for h in (5400, 6300, 7200)], 'M': [win(h, 0.3) for h in (5400, 6300, 7200, 8100)]}}
        return field, women, linked

    def test_plots(self):
        import half_cards
        cards = {c['slug']: c for c in half_cards.build(*self.families())['cards']}
        self.assertEqual(list(cards), ['half-under-2', 'half-more-women', 'half-double', 'half-same-half'])
        self.assertEqual(cards['half-under-2']['values']['women_under_7200'], 0.35)
        rows = cards['half-more-women']['plot']['rows']
        self.assertEqual(rows[0], {'label': 'Typical', 'a': 0.22, 'b': 0.35, 'tone': 'signal'}, 'the medians first, the marathon the ring')
        self.assertEqual(rows[1], {'label': 'A', 'a': 0.25, 'b': 0.4})
        parts = cards['half-double']['plot']['parts']
        self.assertEqual([p['share'] for p in parts], [0.0772, hc.sh(0.476 - 0.0772)])
        same = cards['half-same-half']['plot']['rows']
        self.assertEqual([r['label'] for r in same], ['1:30', '1:45', '2:00'], 'a band needs both recorded sexes')
        self.assertEqual([r.get('tone') for r in same], [None, 'signal', None], 'the band nearest the pooled median half is the signal')
        plot = cards['half-same-half']['plot']
        self.assertEqual((plot['a'], plot['b']), ('Recorded men’s', 'Recorded women’s'), 'the women’s share is the filled dot the signal lights')
        self.assertEqual((same[1]['a'], same[1]['b']), (0.3, 0.1), 'the ring at the men’s share, the dot at the women’s')

    def test_flagship_band_rounds_like_the_site(self):
        import half_cards
        # 6150 s is exactly between the 1:40 and 1:45 bands: JavaScript's Math.round (the nuggets) takes 1:45.
        self.assertEqual(half_cards.flagship_band(self.families(pooled_half=6150)[2]), 6300)
        self.assertEqual(half_cards.flagship_band(self.families(pooled_half=6149)[2]), 6000)

    def test_shares_out_of_order_refuse(self):
        import half_cards
        with self.assertRaises(hc.HalfError):
            half_cards.build(*self.families(under=(0.5, 0.4)))


class StampCorrection(unittest.TestCase):
    """The stamp correction (verified = stamped in the snapshot and in the corrected metadata) on a synthetic snapshot,
    and the reviewed list frozen in the policy."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        s = Source(cls.tmp.name)
        normal = uniform(5400, 10800, 300)
        cls.ids = {}
        for city, status in (('Withdrawn', 'stamped'), ('Kept', 'stamped'), ('Weaker', 'stamped'), ('Internal', 'counts_internal_only')):
            cls.ids[city] = s.edition(city, 2024, status=status, official=300, source_type='list rows (internal only)')
            s.field(city, 2024, normal)
        s.close()
        cls.db = hc.connect(half=s.path)
        cls.rules = hq.rules_of(hq.TAG_1133)   # the stamp correction is the 1133 entry's
        hq.record_rules(cls.db, cls.rules)
        cls.correction = {
            'withdrawn': [{'edition_id': cls.ids['Withdrawn'], 'city': 'Withdrawn', 'year': 2024, 'corrected_status': 'counts_internal_only',
                           'reason': 'unstamped 2026-10-29 per user standing rule: timing-platform internal total is not independent'}],
            'weaker_source': [{'edition_id': cls.ids['Weaker'], 'city': 'Weaker', 'year': 2024, 'source': 'local press own finisher total — weaker than federation'}],
        }

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        cls.tmp.cleanup()

    def rows(self, **status):
        base = {'Withdrawn': ('counts_internal_only', 'db=300 listed=300 | unstamped 2026-10-29 per user standing rule: timing-platform internal total is not independent', 'x'),
                'Kept': ('stamped', 'press 300 vs db 300', 'federation results list'),
                'Weaker': ('stamped', 'press 300', 'local press own finisher total — weaker than federation'),
                'Internal': ('counts_internal_only', 'db=300', 'list rows (internal only)')}
        out = {}
        for city, (st, why, src) in base.items():
            out[self.ids[city]] = {'city': city, 'year': 2024, 'status': status.get(city, st), 'reason': why, 'source_type': src}
        return out

    def table(self, rows):
        m = hq.edition_table(self.db, self.rules)
        applied = hq.apply_stamp_correction(m, self.correction, rows)
        return hq.edition_rules(m, self.rules), applied

    def test_the_withdrawn_list_is_applied(self):
        m, applied = self.table(self.rows())
        hq.check_corrected_verified(m, self.correction, self.rows())
        g = m.set_index('city')
        self.assertEqual(applied, [self.ids['Withdrawn']])
        self.assertEqual(g.loc['Withdrawn', 'status_group'], 'unverified')
        self.assertTrue(g.loc['Withdrawn', 'use_finish'], 'a withdrawn stamp stays usable, as an unverified edition')
        self.assertEqual(g.loc['Withdrawn', 'corrected_status'], 'counts_internal_only')
        self.assertEqual([g.loc[c, 'status_group'] for c in ('Kept', 'Weaker', 'Internal')], ['verified', 'verified', 'unverified'])

    def test_no_verified_edition_lacks_a_corrected_stamp(self):
        # A stamp the metadata withdrew that the reviewed list misses fails the rederived list.
        with self.assertRaisesRegex(hc.HalfError, 'differ from the corrected metadata'):
            self.table(self.rows(Kept='counts_internal_only'))
        # An edition stamped only in the corrected metadata: verified needs both stamps, so the check fails loudly.
        m, _ = self.table(self.rows(Internal='stamped'))
        with self.assertRaisesRegex(hc.HalfError, 'stamped in the corrected metadata but unverified'):
            hq.check_corrected_verified(m, self.correction, self.rows(Internal='stamped'))
        # A verified edition the corrected metadata does not stamp.
        m, _ = self.table(self.rows())
        rows = self.rows()
        rows[self.ids['Kept']] = {**rows[self.ids['Kept']], 'status': 'counts_internal_only'}
        with self.assertRaisesRegex(hc.HalfError, 'not stamped in the corrected metadata'):
            hq.check_corrected_verified(m, self.correction, rows)

    def test_the_weaker_source_stamps_stay_verified(self):
        rows = self.rows()
        rows[self.ids['Weaker']] = {**rows[self.ids['Weaker']], 'source_type': 'federation results list'}
        with self.assertRaisesRegex(hc.HalfError, 'weaker-source stamp'):
            self.table(rows)
        with self.assertRaisesRegex(hc.HalfError, 'differ from the corrected metadata|weaker-source stamp'):
            self.table(self.rows(Weaker='counts_internal_only'))
        m, _ = self.table(self.rows())
        self.assertEqual(m.set_index('city').loc['Weaker', 'status_group'], 'verified')

    def test_the_corrected_metadata_must_be_the_pinned_file(self):
        import shutil
        import subprocess
        if shutil.which('zstd') is None:
            self.skipTest('the zstd command is not installed')
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'csv-edition_meta.csv.zst'
            text = 'id,city,year,completeness_status,completeness_reason,official_source_type\n1,"A, B",2024,stamped,"x | y",z\n'
            path.write_bytes(subprocess.run(['zstd', '-q', '-c'], input=text.encode(), check=True, capture_output=True).stdout)
            with self.assertRaisesRegex(hc.HalfError, 'is not the reviewed corrected metadata'):
                hq.read_correction(path, {'tag': 't', 'asset': path.name, 'sha256': '0' * 64})
            rows = hq.read_correction(path, {'tag': 't', 'asset': path.name, 'sha256': hc.file_sha256(path)})
            self.assertEqual(rows, {1: {'city': 'A, B', 'year': 2024, 'status': 'stamped', 'reason': 'x | y', 'source_type': 'z'}})
        with self.assertRaisesRegex(hc.HalfError, 'missing the corrected metadata'):
            hq.read_correction(Path(tempfile.gettempdir()) / 'no-such.csv.zst', hq.CORRECTION_20261029_2157)

    def test_reasons_are_the_withdrawal_clause(self):
        self.assertEqual(hq.correction_reason('db=1 | unstamped 2026-10-29 per user | later'), 'unstamped 2026-10-29 per user')
        self.assertEqual(hq.correction_reason('stamped on derived count  2,782\n(newspaper)'), 'stamped on derived count 2,782 (newspaper)')
        long = 'unstamped ' + 'word ' * 60
        self.assertTrue(hq.correction_reason(long).endswith('…') and len(hq.correction_reason(long)) <= hq.REASON_MAX)

    def test_the_reviewed_correction_in_the_policy(self):
        doc = json.loads(hq.policy_path(hq.TAG_1133).read_text())
        c = doc['stamp_correction']
        self.assertEqual([c['tag'], c['asset'], c['sha256'], c['applied'], c['reviewed']],
                         ['half-dataset-20261029-2157', 'csv-edition_meta.csv.zst', '2b8ad1106a6ee8845147ebd4563b5dcb64a2a8fe9a9044b83a0f1e34f681e842',
                          'verified = stamped in both', '2026-10-30'])
        self.assertEqual(doc['tag'], hq.TAG_1133, 'the policy keeps the snapshot tag')
        w = c['withdrawn']
        self.assertEqual(len(w), 72)
        self.assertEqual(len({x['edition_id'] for x in w}), 72)
        self.assertEqual({x['corrected_status'] for x in w}, {'counts_internal_only', 'counts_internal_only_winner_ok'})
        self.assertEqual(sum(x['corrected_status'] == 'counts_internal_only' for x in w), 46)
        self.assertTrue({('Paris', 2017), ('Berlin', 2026), ('New York', 2025), ('Valencia', 2024)} <= {(x['city'], x['year']) for x in w})
        weaker = {(x['city'], x['year']) for x in c['weaker_source']}
        self.assertEqual(weaker, {('Kraków: Cracovia Półmaraton Królewski', 2022), ('Kraków', 2025), ('Szczecin', 2023), ('Szczecin', 2026), ('Piła', 2026), ('Lisbon', 2024)})
        self.assertFalse(weaker & {(x['city'], x['year']) for x in w}, 'the six weaker-source stamps stay verified')
        self.assertEqual(doc['expected']['verified'], {'finishes': 753_476, 'editions': 238})
        self.assertEqual(doc['expected']['stamp_withdrawn'], {'finishes': 869_551, 'editions': 72})
        self.assertEqual(doc['expected']['verified']['editions'] + doc['expected']['stamp_withdrawn']['editions'], 310,
                         'every edition verified before the correction is either still verified or withdrawn')


class DownloadHalf(unittest.TestCase):
    """analysis/download_half.py on synthetic parts: SHA256SUMS and the pin, reassembly, anonymous public URLs only."""

    def setUp(self):
        import download_half
        self.dh = download_half
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def parts(self, name='half-20990101-0000.sqlite.zst', wal=False):
        """A tiny SQLite, compressed with zstd and split into two parts; returns (sqlite sha, {part: sha})."""
        import shutil
        import subprocess
        if shutil.which('zstd') is None:
            self.skipTest('the zstd command is not installed')
        db = self.folder / 'source.sqlite'
        con = sqlite3.connect(db)
        if wal:   # the links release is a WAL-mode SQLite: reading it leaves -wal and -shm files beside it
            con.execute('PRAGMA journal_mode=WAL')
        con.executescript('CREATE TABLE t (x INTEGER); ' + ' '.join(f'INSERT INTO t VALUES ({i});' for i in range(500)))
        con.commit()
        con.close()
        packed = subprocess.run(['zstd', '-q', '-c', str(db)], check=True, capture_output=True).stdout
        cut = len(packed) // 2
        shas = {}
        for i, chunk in enumerate((packed[:cut], packed[cut:])):
            path = self.folder / f'{name}.part{i:02d}'
            path.write_bytes(chunk)
            shas[path.name] = hc.bytes_sha256(chunk)
        sqlite_sha = hc.file_sha256(db)
        db.unlink()
        return sqlite_sha, shas

    def spec(self, shas, sqlite_sha):
        return {'key': 'half', 'tag': 'half-snapshot-20990101-0000', 'assets': dict(shas), 'parts': sorted(shas),
                'target': 'platform_half.sqlite', 'target_sha256': sqlite_sha}

    def test_sums_file(self):
        good = self.folder / 'SHA256SUMS'
        good.write_text(f"{'a' * 64}  one.md\n{'b' * 64} *two.zst.part00\n")
        self.assertEqual(self.dh.read_sums(good), {'one.md': 'a' * 64, 'two.zst.part00': 'b' * 64})
        good.write_text(f"{'a' * 64}  one.md\n{'a' * 64}  one.md\n")
        with self.assertRaises(hc.HalfError):
            self.dh.read_sums(good)

    def test_the_real_pin_names_the_public_releases(self):
        pin = hc.load_pin()
        specs = self.dh.all_specs(pin)
        self.assertEqual([s['key'] for s in specs], ['half', 'links', 'stamps'])
        self.assertEqual([s['tag'] for s in specs], ['half-dataset-20261030-1904', 'half-dataset-20261030-1904', 'half-dataset-20261029-2157'])
        self.assertEqual(specs[0]['parts'], ['half-20261030-1904.sqlite.zst.part00'])
        self.assertEqual(specs[0]['target_sha256'], pin['half']['sqlite_sha256'])
        self.assertEqual(specs[0]['assets']['csv-edition_meta.csv.zst'], hq.entry()['stamps']['edition_meta_csv']['sha256'])
        self.assertEqual(specs[1]['parts'], [], 'the v4 links are parquet files, not SQLite parts')
        self.assertTrue({'race_results_linked.parquet', 'persons.parquet', 'MATCHING_V4.md', 'code.tgz'} <= set(specs[1]['assets']))
        self.assertEqual(specs[1]['target'], 'links-v4.sqlite')
        self.assertEqual(specs[2]['assets']['csv-edition_meta.csv.zst'], hq.CORRECTION_20261029_2157['sha256'])
        self.assertEqual(pin['repository'], 'koolkam00/pace-notes')
        self.assertEqual([pin['half']['key'], pin['links']['key']], [hq.TAG, 'person-ids-v4-20261030-1150'])
        self.assertEqual([pin['half']['private_tag'], pin['links']['private_tag'], pin['half']['doi']], [None, 'person-ids-v4-20261030-1150', None],
                         'no private twin of the 19:04 snapshot; the v4 build\'s private twin matched the public digests (2026-10-31); no DOI')
        sums = self.dh.sums_digests(pin)
        self.assertEqual(sums, {'half-dataset-20261030-1904': '9a9759bf6aff47a2dbc5c53f97d295dd55d440392e492cca9fec6a1bc06d9446',
                                'half-dataset-20261029-2157': 'fe72490f32557e4464cb5fa9577726b663a8d7c125f7456944bad6a84e4051b6'})

    def test_folder_check_and_reassembly(self):
        sqlite_sha, shas = self.parts()
        spec = self.spec(shas, sqlite_sha)
        sums = self.folder / 'SHA256SUMS'
        sums.write_text(''.join(f'{d}  {n}\n' for n, d in shas.items()))
        found = self.dh.check_folder(self.folder, spec)
        self.assertEqual(sorted(found), sorted(shas))
        self.assertEqual(self.dh.identify(self.folder, [spec]), [spec])
        out = self.folder / 'out'
        out.mkdir()
        record = self.dh.place(spec, found, out, downloaded=False, replace=False)
        self.assertEqual(record['sqlite']['sha256'], sqlite_sha)
        self.assertTrue(all(p.exists() for p in found.values()), 'an owner folder keeps its parts')
        self.assertEqual(self.dh.place(spec, found, out, downloaded=False, replace=False)['sqlite']['kept'], True)
        # A snapshot in place with an empty -wal and a -shm (an earlier read) is kept and its sidecars removed; a non-empty
        # -wal holds pages the pinned file does not, so it is refused.
        (out / 'platform_half.sqlite-wal').write_bytes(b'')
        (out / 'platform_half.sqlite-shm').write_bytes(b'x' * 64)
        self.assertEqual(self.dh.place(spec, found, out, downloaded=False, replace=False)['sqlite']['kept'], True)
        self.assertEqual(sorted(p.name for p in out.iterdir()), ['platform_half.sqlite'])
        (out / 'platform_half.sqlite-wal').write_bytes(b'pages')
        with self.assertRaisesRegex(hc.HalfError, 'is not empty'):
            self.dh.place(spec, found, out, downloaded=False, replace=False)
        (out / 'platform_half.sqlite-wal').unlink()
        # The release's SHA256SUMS itself must be the pinned one.
        with self.assertRaisesRegex(hc.HalfError, 'not the pinned SHA256SUMS'):
            self.dh.check_folder(self.folder, spec, 'e' * 64)
        self.assertEqual(sorted(self.dh.check_folder(self.folder, spec, hc.file_sha256(sums))), sorted(shas))
        # A part that differs from SHA256SUMS, a SHA256SUMS that differs from the pin, a wrong decompressed digest.
        first = self.folder / spec['parts'][0]
        first.write_bytes(first.read_bytes()[:-1] + b'\0')
        with self.assertRaisesRegex(hc.HalfError, 'does not match SHA256SUMS'):
            self.dh.check_folder(self.folder, spec)
        with self.assertRaisesRegex(hc.HalfError, 'with the digest pinned'):
            self.dh.check_folder(self.folder, {**spec, 'assets': {**shas, spec['parts'][0]: 'c' * 64}})
        sqlite_sha, shas = self.parts()
        with self.assertRaisesRegex(hc.HalfError, 'not the pinned one'):
            self.dh.reassemble([self.folder / n for n in sorted(shas)], out / 'again.sqlite', 'd' * 64)
        self.assertFalse((out / 'again.sqlite').exists(), 'nothing is left behind after a refused decompress')

    def test_downloaded_parts_are_deleted_after_a_verified_decompress(self):
        sqlite_sha, shas = self.parts()
        spec = self.spec(shas, sqlite_sha)
        out = self.folder / 'out'
        out.mkdir()
        record = self.dh.place(spec, {n: self.folder / n for n in shas}, out, downloaded=True, replace=False)
        self.assertEqual(record['parts'], 'downloaded, verified and deleted')
        self.assertFalse(any((self.folder / n).exists() for n in shas))

    def test_reassembly_leaves_no_sqlite_sidecar_files(self):
        sqlite_sha, shas = self.parts(wal=True)
        out = self.folder / 'out'
        out.mkdir()
        self.assertEqual(self.dh.reassemble([self.folder / n for n in sorted(shas)], out / 'links.sqlite', sqlite_sha), sqlite_sha)
        self.assertEqual(sorted(p.name for p in out.iterdir()), ['links.sqlite'], 'no -wal or -shm file is left beside it')

    def test_one_folder_holds_the_half_and_the_links(self):
        a, b = 'a' * 64, 'b' * 64
        (self.folder / 'SHA256SUMS').write_text(f'{a}  half.sqlite.zst.part00\n{b}  links.sqlite.zst.part00\n')
        specs = [{'key': 'half', 'tag': 't', 'assets': {'half.sqlite.zst.part00': a}}, {'key': 'links', 'tag': 't', 'assets': {'links.sqlite.zst.part00': b}},
                 {'key': 'stamps', 'tag': 'u', 'assets': {'csv-edition_meta.csv.zst': 'c' * 64}}]
        self.assertEqual([s['key'] for s in self.dh.identify(self.folder, specs)], ['half', 'links'])

    def test_the_stamp_reference_lands_in_its_tag_folder(self):
        csv = self.folder / 'csv-edition_meta.csv.zst'
        csv.write_bytes(b'meta')
        readme = self.folder / 'README.md'
        readme.write_bytes(b'readme')
        spec = {'key': 'stamps', 'tag': 'half-dataset-20990101-0000', 'parts': [], 'target': csv.name,
                'assets': {csv.name: hc.bytes_sha256(b'meta'), 'README.md': hc.bytes_sha256(b'readme')}}
        out = self.folder / 'out'
        out.mkdir()
        record = self.dh.place(spec, {csv.name: csv, 'README.md': readme}, out, downloaded=False, replace=False)
        self.assertEqual(record['file'], 'half-dataset-20990101-0000/csv-edition_meta.csv.zst')
        self.assertEqual((out / 'half-dataset-20990101-0000' / csv.name).read_bytes(), b'meta')

    def test_downloads_are_anonymous_public_release_urls(self):
        from unittest.mock import patch
        url = self.dh.public_url('koolkam00/pace-notes', 'half-dataset-20261029-1202', 'SHA256SUMS')
        self.assertEqual(url, 'https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-1202/SHA256SUMS')
        request = self.dh.public_request(url)
        self.assertNotIn('Authorization', request.headers)
        self.assertNotIn('Authorization', request.unredirected_hdrs)
        for bad in ('https://api.github.com/repos/koolkam00/pace-notes/releases/tags/x', 'http://github.com/o/r/releases/download/t/f',
                    'https://github.com/o/r/archive/main.zip', 'https://example.com/o/r/releases/download/t/f'):
            with self.assertRaises(hc.HalfError, msg=bad):
                self.dh.public_request(bad)
        with self.assertRaises(hc.HalfError):
            self.dh.public_url('o/r/../x', 't', 'f')
        body = b'part bytes'

        class Response:
            def __init__(self):
                self.left = body

            def read(self, n=-1):
                out, self.left = (self.left, b'') if n < 0 else (self.left[:n], self.left[n:])
                return out

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        seen = []

        class Opener:
            def open(self, req, timeout):
                seen.append(req)
                return Response()

        with patch.object(self.dh, '_opener', return_value=Opener()):
            with self.assertRaisesRegex(hc.HalfError, 'not the pinned one'):
                self.dh.fetch_sums('koolkam00/pace-notes', 'half-dataset-20261029-1202', 'f' * 64)
            self.dh.download(url, self.folder / 'x.part00', hc.bytes_sha256(body))
            self.assertEqual((self.folder / 'x.part00').read_bytes(), body)
            self.assertTrue(all('Authorization' not in r.headers and 'Authorization' not in r.unredirected_hdrs for r in seen))
            with self.assertRaises(hc.HalfError):
                self.dh.download(url, self.folder / 'z.part00', 'e' * 64)
            self.assertFalse((self.folder / 'z.part00').exists(), 'nothing is left behind after a refused download')
            spec = {'key': 'half', 'tag': 'half-dataset-20261029-1202', 'assets': {'x.part00': hc.bytes_sha256(body)}}
            with self.assertRaisesRegex(hc.HalfError, 'SHA256SUMS does not list'):
                self.dh.fetch_release(spec, 'koolkam00/pace-notes', self.folder / 'dl', {'x.part00': 'f' * 64})
        source = Path(self.dh.__file__).read_text()
        self.assertNotIn('api.github.com/repos', source, 'the downloader never asks the API')
        self.assertNotIn('add_unredirected_header', source)

    def test_the_links_are_cut_from_the_v4_files_beside_the_snapshot(self):
        pin = hc.load_pin()
        spec = self.dh.releases(pin)[1]
        out = self.folder / 'out'
        out.mkdir()
        v4 = self.folder / 'v4'
        v4.mkdir()
        assets = {name: v4 / name for name in spec['assets']}
        for path in assets.values():
            path.write_bytes(b'x')
        with self.assertRaisesRegex(hc.HalfError, 'reads the snapshot'):
            self.dh.place(spec, assets, out, downloaded=True, replace=False)
        (out / pin['half']['sqlite']).write_bytes(b'')
        from unittest.mock import patch
        import half_links_extract
        seen = []
        with patch.object(half_links_extract, 'main', side_effect=lambda argv: seen.append(argv) or 0):
            record = self.dh.place(spec, assets, out, downloaded=True, replace=False)
        self.assertEqual(seen, [['--v4-dir', str(v4), '--half', str(out / pin['half']['sqlite']), '--out', str(out / 'links-v4.sqlite')]])
        self.assertEqual(record['parquet'], 'downloaded, verified, cut and deleted')
        self.assertFalse((v4 / 'race_results_linked.parquet').exists() or (v4 / 'persons.parquet').exists())
        self.assertTrue((v4 / 'MATCHING_V4.md').exists(), 'only the two parquet files are deleted')
        for name in ('race_results_linked.parquet', 'persons.parquet'):
            (v4 / name).write_bytes(b'x')
        def refuse(argv):
            raise SystemExit(2)
        with patch.object(half_links_extract, 'main', side_effect=refuse):
            with self.assertRaisesRegex(hc.HalfError, 'could not be cut'):
                self.dh.place(spec, assets, out, downloaded=False, replace=False)
        self.assertTrue((v4 / 'persons.parquet').exists(), 'files read in place are never deleted')

    def test_the_v4_links_spec_names_the_parquet_files(self):
        import copy
        pin = copy.deepcopy(hc.load_pin())
        pin['links']['assets'].pop('persons.parquet')
        with self.assertRaisesRegex(hc.HalfError, 'persons.parquet'):
            self.dh.releases(pin)
        pin = copy.deepcopy(hc.load_pin())
        pin['stamps']['reference']['sha256sums_sha256'] = None
        with self.assertRaisesRegex(hc.HalfError, 'no SHA256SUMS digest'):
            self.dh.sums_digests(pin)

    def test_refuses_an_output_inside_the_repository(self):
        self.assertEqual(self.dh.main(['--from-dir', str(self.folder), '--out', str(ROOT / 'public' / 'data' / 'half')]), 1)


# The release's own schema of half-dataset-20261030-1904's v4 person links (COLUMNS_V4.md and the parquet types), so the
# fixtures are read the way the real files are (the October 30, 2026 lesson: a fixture in another form hid a type bug).
RRL_SCHEMA = [('person_id', 'VARCHAR'), ('confidence', 'VARCHAR'), ('method', 'VARCHAR'), ('unlinked_reason', 'VARCHAR'),
              ('person_id_v2', 'VARCHAR'), ('person_id_v3', 'VARCHAR'), ('runner_id_v1', 'VARCHAR'), ('distance', 'VARCHAR'),
              ('distance_km', 'DOUBLE'), ('race_series', 'VARCHAR'), ('race', 'VARCHAR'), ('year', 'BIGINT'), ('city', 'VARCHAR'),
              ('finish_seconds', 'DOUBLE'), ('finish_raw', 'VARCHAR'), ('sex', 'VARCHAR'), ('age', 'BIGINT'), ('age_group', 'VARCHAR'),
              ('age_key', 'VARCHAR'), ('nationality', 'VARCHAR'), ('name_raw', 'VARCHAR'), ('name_norm', 'VARCHAR'),
              ('source_db', 'VARCHAR'), ('record_id', 'BIGINT'), ('record_flags', 'VARCHAR'), ('finish_time_only_tier', 'BOOLEAN'),
              ('course_shortened_suspect', 'BOOLEAN'), ('excluded_by_record_flag', 'BOOLEAN'), ('noage_tier', 'BOOLEAN')]
PERSONS_SCHEMA = [('person_id', 'VARCHAR'), ('name_norm_example', 'VARCHAR'), ('sex', 'VARCHAR'), ('n_results', 'BIGINT'),
                  ('n_halves', 'BIGINT'), ('n_marathons', 'BIGINT'), ('n_series', 'BIGINT'), ('first_year', 'BIGINT'),
                  ('last_year', 'BIGINT'), ('n_runner_ids_v1', 'BIGINT'), ('n_person_ids_v2', 'BIGINT'), ('n_person_ids_v3', 'BIGINT'),
                  ('confidences', 'VARCHAR'), ('nationality_example', 'VARCHAR')]


class V4Source:
    """A synthetic v4 link build (the two parquet files), its half snapshot and the eligible marathons."""

    def __init__(self):
        self.rows = []
        self.snapshot_only = []   # snapshot rows the link build does not cover
        self.overrides = {}       # record_id -> snapshot fields that differ from the v4 row
        self.persons_over = {}    # person_id -> persons.parquet fields to replace
        self.eligible = []        # (record_id, city, year, gender, finish)

    def row(self, person, db, record_id, *, confidence='medium', method='merged', name='anna berg', sex='F', age=None,
            age_key='yob:1980', finish=6300, finish_raw=None, city=None, year=2022, race=None, eligible=True):
        city = city or ('Halfton' if db == 'half' else 'Fullton')
        r = {'person_id': person, 'confidence': confidence if person else None, 'method': method if person else None,
             'distance': 'half' if db == 'half' else 'marathon', 'distance_km': 21.0975 if db == 'half' else 42.195,
             'race_series': city, 'race': race or f'{city} {db} {record_id}', 'year': year, 'city': city,
             'finish_seconds': float(finish), 'finish_raw': finish_raw or hms(finish), 'sex': sex, 'age': age,
             'age_key': age_key, 'name_raw': name.title() if name else None, 'name_norm': name, 'source_db': db,
             'record_id': record_id, 'finish_time_only_tier': True, 'course_shortened_suspect': False,
             'excluded_by_record_flag': False, 'noage_tier': confidence.startswith('low_noage') if person else None}
        self.rows.append(r)
        if db == 'full' and eligible:
            self.eligible.append((record_id, city, year, {'M': 1, 'F': 2}.get(sex, 0), float(finish)))
        return r

    def write(self, folder):
        import duckdb
        folder = Path(folder)
        v4 = folder / 'v4'
        v4.mkdir(exist_ok=True)
        con = duckdb.connect()
        con.execute(f"CREATE TABLE rrl ({', '.join(f'{c} {t}' for c, t in RRL_SCHEMA)})")
        cols = [c for c, _ in RRL_SCHEMA]
        con.executemany(f"INSERT INTO rrl VALUES ({', '.join('?' for _ in cols)})", [[r.get(c) for c in cols] for r in self.rows])
        con.execute(f"COPY rrl TO '{(v4 / 'race_results_linked.parquet').as_posix()}' (FORMAT parquet)")
        con.execute(f"CREATE TABLE persons ({', '.join(f'{c} {t}' for c, t in PERSONS_SCHEMA)})")
        people = {}
        for r in self.rows:
            if r['person_id']:
                x = people.setdefault(r['person_id'], {'person_id': r['person_id'], 'sex': None, 'n_results': 0, 'n_halves': 0, 'n_marathons': 0})
                x['n_results'] += 1
                x['n_halves' if r['source_db'] == 'half' else 'n_marathons'] += 1
                x['sex'] = x['sex'] or r['sex']
        pcols = [c for c, _ in PERSONS_SCHEMA]
        con.executemany(f"INSERT INTO persons VALUES ({', '.join('?' for _ in pcols)})",
                        [[{**x, **self.persons_over.get(x['person_id'], {})}.get(c) for c in pcols] for x in people.values()])
        con.execute(f"COPY persons TO '{(v4 / 'persons.parquet').as_posix()}' (FORMAT parquet)")
        con.close()
        snap = folder / 'platform_half.sqlite'
        sq = sqlite3.connect(snap)
        sq.executescript(HALF_SCHEMA)
        for r in [x for x in self.rows if x['source_db'] == 'half'] + self.snapshot_only:
            o = {'id': r['record_id'], 'race': r['race'], 'year': r['year'], 'city': r['city'], 'runner': r.get('name_raw'),
                 'sex': r['sex'], 'age': r.get('age'), 'split_21_1km': r['finish_raw'], **self.overrides.get(r['record_id'], {})}
            sq.execute('INSERT INTO race_records (id, race, year, city, runner, sex, age, split_21_1km, source_url, ingested_at) '
                       "VALUES (:id, :race, :year, :city, :runner, :sex, :age, :split_21_1km, 'fixture://' || :id, '2026-10-30')", o)
        sq.commit()
        sq.close()
        editions = sorted({(c, y) for _, c, y, _, _ in self.eligible})
        index = {e: i for i, e in enumerate(editions)}
        n = len(self.eligible)
        m = Marathons(np.array([e[0] for e in self.eligible], np.uint64), np.array([index[(e[1], e[2])] for e in self.eligible], np.int32),
                      np.array([e[3] for e in self.eligible], np.uint8), np.array([e[4] for e in self.eligible]), np.zeros(n, bool),
                      [{'city': c, 'year': y, 'race': c} for c, y in editions], np.ones(len(editions), np.int64),
                      {i: f'{y}-10-01' for i, (c, y) in enumerate(editions)}, 'manifest-sha', {}, 'weather-sha')
        return v4, snap, m


def v4_source():
    """The reference fixture: people of each kind, the checks' reviewed exceptions, a snapshot row beyond the boundary."""
    s = V4Source()
    A, B, C, D, E, F, G, H = (pid(i) for i in range(1, 9))
    # A: high, yob; a half row attached without an age stays in links; the unlinked row and H's row share A's name and sex.
    s.row(A, 'half', 1, confidence='high', name='anna berg', age=42, age_key='yob:1980')
    s.row(A, 'half', 2, confidence='low_noage', method='noage_attach', name='anna berg', age_key=None)
    s.row(A, 'full', 101, confidence='high', name='anna berg', age_key='yob:1980', finish=14000)
    s.row(None, 'half', 3, name='anna berg', age_key='ag:40-44')
    s.row(H, 'half', 4, confidence='low', method='new', name='berg anna', age_key='yob:1985')
    # B: medium, age bins only.
    s.row(B, 'half', 5, name='bo li', sex='M', age_key='ag:40-44')
    s.row(B, 'full', 102, name='bo li', sex='M', age_key='ag:40-44', finish=13000)
    # C: high, a union person (two names; the smallest sorted name is its block), yob and bin keys.
    s.row(C, 'half', 6, confidence='high', method='merged+middle_name_union', name='carl de jong', sex='M', age_key='yob:1970')
    s.row(C, 'full', 103, confidence='high', method='merged', name='carl jong', sex='M', age_key='ag:50-54', finish=12000)
    # D: low tier; E: medium without a marathon row that may pair; G: medium in a block with no age key.
    s.row(D, 'half', 7, confidence='low', method='new', name='dan ek', sex='M')
    s.row(D, 'full', 104, confidence='low', method='new', name='dan ek', sex='M', finish=15000)
    s.row(E, 'half', 8, name='eva ros')
    s.row(E, 'full', 105, confidence='low_noage', method='noage_attach', name='eva ros', age_key=None, finish=16000)
    s.row(G, 'half', 9, name='zed', sex='M', age_key=None)
    s.row(G, 'full', 106, name='zed', sex='M', age_key=None, finish=13500)
    # F: a marathon only (not in people) and an ineligible marathon of B.
    s.row(F, 'full', 107, name='fay ng', finish=14100)
    s.row(B, 'full', 108, name='bo li', sex='M', age_key='ag:40-44', finish=13100, eligible=False)
    # The reviewed exceptions: a re-timed edition, an unparsed equal text, an X sex, a name sharing no token.
    s.row(None, 'half', 10, name='rex', city='Retimed City', year=2024, finish=5000)
    s.overrides[10] = {'split_21_1km': hms(5100)}
    s.row(None, 'half', 11, name='neg', finish=-3600, finish_raw='-1:00:00')
    s.row(None, 'half', 12, name='sam', sex=None)
    s.overrides[12] = {'sex': 'X'}
    s.row(None, 'half', 13, name='lol')
    s.overrides[13] = {'runner': 'Somebody Else'}
    s.snapshot_only.append({'record_id': 20, 'race': 'Late Half', 'year': 2026, 'city': 'Late', 'name_raw': 'Late Runner', 'sex': 'M',
                            'finish_raw': hms(6000)})
    return s


V4_PIN = {'links': {'coverage': {'half_rows': 13, 'half_max_record_id': 13, 'marathon_rows': 8, 'producer_build_info': 'x'}}}
V4_LINK_EDITIONS = {'link_build': 'fixture', 'half_max_record_id': 13,
                    'retimed': [{'edition_id': 1, 'city': 'Retimed City', 'year': 2024, 'rows': 1}], 'link_partial': []}


class LinksExtract(unittest.TestCase):
    """links-v4.sqlite from synthetic v4 parquet files in the release's own schema: the source and join checks, the people
    and their rows (ns_keys, k, unions), the content digest."""

    def setUp(self):
        import half_links_extract
        self.hle = half_links_extract
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_checks(self, s, pin=V4_PIN, le=V4_LINK_EDITIONS):
        folder = Path(tempfile.mkdtemp(dir=self.dir))
        v4, snap, m = s.write(folder)
        db = self.hle.connect()
        self.hle.open_v4(db, v4)
        self.hle.attach_half(db, snap)
        self.hle.register_marathons(db, m)
        got = {'source': self.hle.check_source(db, pin), 'joins': self.hle.check_half_join(db, pin, le)}
        got['joins']['marathons'] = self.hle.check_marathon_join(db)
        self.hle.select_people(db)
        got.update(self.hle.counts(db))
        return db, got, folder

    def test_people_links_and_counts(self):
        db, got, folder = self.run_checks(v4_source())
        A, B, C, G = pid(1), pid(2), pid(3), pid(7)
        people = db.execute(f"SELECT {', '.join(self.hle.PEOPLE_COLUMNS)} FROM pe ORDER BY person_id").fetchall()
        block = lambda ns, sx: hc.bytes_sha256(f'{ns}\t{sx}'.encode())[:16]
        self.assertEqual(people, [
            (A, 'F', 'high', 2, 'yob', 0, 2, block('anna berg', 'F')),
            (B, 'M', 'medium', 1, 'age_bin', 0, 1, block('bo li', 'M')),
            (C, 'M', 'high', 1, 'mixed', 1, 1, block('carl de jong', 'M')),
            (G, 'M', 'medium', 0, 'none', 0, 1, block('zed', 'M')),
        ], 'ns_keys counts every row with an age key, linked or not; k counts the aged persons of the sorted-name block')
        links = db.execute(f"SELECT {', '.join(self.hle.LINKS_COLUMNS)} FROM le ORDER BY person_id, db, record_id").fetchall()
        self.assertEqual([(r[0], r[1], r[2], r[3]) for r in links if r[0] == A],
                         [(A, 'full', 101, 'high'), (A, 'half', 1, 'high'), (A, 'half', 2, 'low_noage')], 'every linked row of a person')
        self.assertEqual([r[4:] for r in links if r[2] == 101], [(14000, 'F', 'Fullton', 2022, 2)], 'finish, sex, city, year and the row’s block count')
        self.assertEqual(sorted(r[2] for r in links if r[0] == B), [5, 102, 108])
        self.assertEqual(got['joins'], {'half_finish_unparsed': 1, 'half_sex': [{'snapshot': 'X', 'v4': None, 'rows': 1}],
                                        'half_name_no_shared_token': [{'city': 'Halfton', 'year': 2022, 'rows': 1}], 'marathons': 7})
        self.assertEqual(got['people'], {'F': 1, 'M': 3, 'all': 4, 'high': 2, 'in_union': 1, 'medium': 2, 'ns_keys_0': 1})
        self.assertEqual(got['links'], {'full': 5, 'half': 5})
        self.assertEqual(got['k'], {'high_k_not_1': 1}, 'A is high but shares its block with the aged H')
        self.assertEqual(got['source']['confidence'], {'high': 4, 'low': 3, 'low_noage': 2, 'medium': 7, 'null': 5})
        out = folder / 'links-v4.sqlite'
        digest, rows = self.hle.write_extract(db, out, {'links_key': 'fixture'})
        self.assertEqual(rows, {'people': 4, 'links': 10})
        con = sqlite3.connect(out)
        text = ''.join('\t'.join('\\N' if v is None else str(v) for v in row) + '\n'
                       for table, cols in (('people', self.hle.PEOPLE_COLUMNS), ('links', self.hle.LINKS_COLUMNS))
                       for row in con.execute(f"SELECT {', '.join(cols)} FROM {table} ORDER BY {', '.join(cols)}"))
        build = dict(con.execute('SELECT k, v FROM build').fetchall())
        con.close()
        self.assertEqual(digest, hc.bytes_sha256(text.encode()), 'the canonical TSV digest')
        self.assertEqual(build['extract_content_sha256'], digest)
        again = folder / 'again'
        again.mkdir()
        db2, _, _ = self.run_checks(v4_source())
        self.assertEqual(self.hle.write_extract(db2, again / 'links-v4.sqlite', {'links_key': 'fixture'})[0], digest, 'two cuts give one digest')

    def test_each_check_fails_loudly(self):
        def broken(change):
            s = v4_source()
            change(s)
            return s
        row = lambda s, rid, db='half': next(r for r in s.rows if r['record_id'] == rid and r['source_db'] == db)
        cases = [
            (lambda s: s.overrides.setdefault(5, {}).update(city='Elsewhere'), 'city, year or race differ'),
            (lambda s: s.overrides.setdefault(5, {}).update(age=33), 'age differs'),
            (lambda s: s.overrides.setdefault(5, {}).update(split_21_1km=hms(6400)), 're-timed editions'),
            (lambda s: row(s, 5).update(finish_seconds=6302.0), 'seconds differ'),
            (lambda s: s.snapshot_only.append({'record_id': 0, 'race': 'x', 'year': 2022, 'city': 'x', 'sex': 'M', 'finish_raw': '1:40:00'}),
             'inside the coverage boundary without a v4 row'),
            (lambda s: row(s, 101, 'full').update(finish_seconds=14001.0), 'finish differs by more than 0.5 s'),
            (lambda s: s.eligible.__setitem__(1, (102, 'Fullton', 2022, 2, 13000.0)), 'does not map'),
            (lambda s: s.eligible.append((999, 'Fullton', 2022, 2, 14000.0)), 'eligible marathons without a v4 row'),
            (lambda s: row(s, 1).update(person_id='p4_ANNA'), 'person ids not matching'),
            (lambda s: row(s, 2).update(sex='M'), 'two published sexes'),
            (lambda s: row(s, 108, 'full').update(record_id=107), 'repeated (source_db, record_id)'),
            (lambda s: row(s, 2).update(confidence='medium', method='merged'), 'more than one tier'),
            (lambda s: s.persons_over.setdefault(pid(2), {}).update(n_results=9), 'persons.parquet and the linked rows disagree'),
            # verify round 1 (October 31, 2026): every pair takes persons.parquet's sex, so it must be the rows' sex
            (lambda s: s.persons_over.setdefault(pid(2), {}).update(sex='F'), 'persons.parquet and the linked rows disagree'),
            (lambda s: row(s, 1).update(age_key='1980'), 'age keys of another form'),
            (lambda s: row(s, 5).update(name_norm=None), 'without a normalized name'),
        ]
        for change, message in cases:
            with self.subTest(message):
                with self.assertRaisesRegex(SystemExit, re.escape(message)):
                    self.run_checks(broken(change))

    def test_the_coverage_must_equal_the_pin(self):
        pin = {'links': {'coverage': {**V4_PIN['links']['coverage'], 'half_max_record_id': 14}}}
        with self.assertRaisesRegex(SystemExit, 'coverage'):
            self.run_checks(v4_source(), pin=pin)

    def test_a_column_of_another_type_fails(self):
        s = v4_source()
        folder = Path(tempfile.mkdtemp(dir=self.dir))
        v4, _, _ = s.write(folder)
        import duckdb
        con = duckdb.connect()
        path = (v4 / 'race_results_linked.parquet').as_posix()
        con.execute(f"COPY (SELECT * REPLACE (CAST(record_id AS VARCHAR) AS record_id) FROM read_parquet('{path}')) TO '{path}.x' (FORMAT parquet)")
        con.close()
        os.replace(f'{path}.x', path)
        with self.assertRaisesRegex(SystemExit, 'record_id'):
            self.hle.open_v4(self.hle.connect(), v4)

    def test_the_pinned_link_build_has_reviewed_counts(self):
        pin = hc.load_pin()
        key = pin['links']['key']
        self.assertTrue(all(v is not None for v in self.hle.EXPECTED[key].values()), 'every extract count is reviewed')
        want = half_pairs.EXPECTED[key]
        self.assertEqual(set(want), set(half_pairs.summary(pd.DataFrame({c: [] for c in ('h_record_id', 'person_id', 'm_ed', 'm_city', 'h_edition_id', 'sex', 'verified', 'm_close_marathon')}))))
        self.assertEqual(want['women_pairs'] + want['men_pairs'], want['pairs'])
        self.assertRegex(pin['links']['extract_content_sha256'] or '', '^[0-9a-f]{64}$')

    def test_the_frozen_rules_are_hashed(self):
        self.assertEqual(self.hle.sql_sha256(self.hle.NS_KEYS_SQL), hc.bytes_sha256(self.hle.NS_KEYS_SQL.encode()))
        self.assertIn("count(DISTINCT age_key)", self.hle.NS_KEYS_SQL)
        self.assertIn("WHERE age_key IS NOT NULL AND name_norm IS NOT NULL AND sex IN ('M', 'F')", self.hle.NS_KEYS_SQL)
        self.assertIn("max(ns_keys) AS ns_keys FROM lr WHERE confidence IN ('high_elite', 'high', 'medium') GROUP BY person_id", self.hle.NS_KEYS_SQL)
        self.assertIn('min(array_to_string(list_sort(string_split(l.name_norm', self.hle.K_SQL)


class Pin(unittest.TestCase):
    """analysis/half-release.json schema 3 (half_common.check_pin) and the snapshot sidecar rule."""

    def setUp(self):
        self.pin = json.loads(hc.PIN_PATH.read_text())
        self.release = json.loads(hc.RELEASE_PATH.read_text())['tag']

    def test_the_pin_is_schema_3(self):
        pin = hc.load_pin()
        self.assertEqual(pin['schema_version'], 3)
        self.assertEqual(hc.snapshot_date(pin), '2026-10-30', 'the date comes from half.key (private_tag is null)')
        self.assertEqual(pin['links']['applies_to'], pin['half']['key'])
        self.assertEqual(pin['policy'], hq.entry()['file'])
        self.assertEqual(pin['half']['key'], hq.TAG)
        self.assertEqual(pin['stamps']['rule'], hq.entry()['stamps']['rule'])
        self.assertEqual({k: pin['stamps']['reference'][k] for k in ('tag', 'asset', 'sha256', 'readme_sha256')},
                         {k: hq.entry()['stamps']['reference'][k] for k in ('tag', 'asset', 'sha256', 'readme_sha256')})
        self.assertEqual(pin['links']['coverage']['half_max_record_id'], hq.entry()['link_editions']['half_max_record_id'])
        self.assertNotIn('metadata_correction', pin)
        self.assertNotIn('pairs_with', pin['links'])
        self.assertNotIn('built_at', pin['links'])

    def test_broken_pins_fail(self):
        import copy
        cases = [
            (lambda p: p.update(schema_version=2), 'schema'),
            (lambda p: p['links'].update(applies_to='half-dataset-20261029-1202'), 'does not apply'),
            (lambda p: p['half'].pop('key'), 'a tag and a key'),
            (lambda p: p['links'].update(private_tag='Not A Tag'), 'private_tag'),
            (lambda p: p['half']['assets'].update({'x.md': 'nope'}), 'assets'),
            (lambda p: p['links'].update(extract_content_sha256='abc'), 'extract_content_sha256'),
            (lambda p: p['links']['coverage'].pop('half_max_record_id'), 'coverage'),
            (lambda p: p['stamps']['reference'].pop('sha256'), 'stamps.reference'),
            (lambda p: p.update(marathon_release='private-export-20261021-0829'), 'marathon release'),
        ]
        for change, what in cases:
            pin = copy.deepcopy(self.pin)
            change(pin)
            with self.assertRaisesRegex(hc.HalfError, what, msg=what):
                hc.check_pin(pin, self.release)
        pin = copy.deepcopy(self.pin)
        pin['links']['extract_content_sha256'] = None
        hc.check_pin(pin, self.release)
        with self.assertRaisesRegex(hc.HalfError, 'no links extract digest'):
            hc.pinned_digest(pin)
        pin['half']['doi'] = '10.6084/m9.figshare.1.v2'
        hc.check_pin(pin, self.release)

    def test_a_non_empty_wal_beside_the_snapshot_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'platform_half.sqlite'
            con = sqlite3.connect(path)
            con.execute('CREATE TABLE t (x INTEGER)')
            con.commit()
            con.close()
            Path(f'{path}-wal').write_bytes(b'')
            hc.connect(half=path).close()
            Path(f'{path}-wal').write_bytes(b'uncommitted pages')
            with self.assertRaisesRegex(hc.HalfError, 'is not empty'):
                hc.connect(half=path)


V4_DIR = Path(os.environ.get('PACE_HALF_V4_DIR') or Path.home() / 'data' / 'v4')


class ProducerClaims(unittest.TestCase):
    """The producer's claims /methodology cites from the pin (v4 adoption, October 31, 2026): the hand review of the link
    build, transcribed from the pinned MATCHING_V4.md, and the two archive DOIs of the stamp reference. The transcription
    is compared with the file itself wherever it is on disk with the pinned digest (PACE_HALF_V4_DIR, default ~/data/v4)."""

    def setUp(self):
        self.pin = json.loads(hc.PIN_PATH.read_text())

    def test_the_review_and_the_dois_have_their_shape(self):
        rv = self.pin['links']['producer_review']
        self.assertIn(rv['source'], self.pin['links']['assets'])
        self.assertGreater(rv['n_per_cell'], 0)
        self.assertTrue(rv['last_rounds'])
        for r in rv['last_rounds']:
            for k in ('rare_missed', 'common_missed', 'rare_false_merge', 'common_false_merge'):
                self.assertTrue(0 <= r[k] <= 1, (r['round'], k))
        ref = self.pin['stamps']['reference']
        for k in ('doi', 'supersedes_doi'):
            self.assertRegex(ref[k], r'^10\.\d{4,9}/\S+\.v\d+$')
        self.assertNotEqual(ref['doi'], ref['supersedes_doi'])

    @unittest.skipUnless((V4_DIR / 'MATCHING_V4.md').is_file(), 'MATCHING_V4.md is not on this machine (set PACE_HALF_V4_DIR)')
    def test_the_review_is_the_files_last_rounds(self):
        rv = self.pin['links']['producer_review']
        data = (V4_DIR / rv['source']).read_bytes()
        self.assertEqual(hc.bytes_sha256(data), self.pin['links']['assets'][rv['source']], 'the file on disk is the pinned one')
        text = data.decode('utf-8')
        rows = re.findall(r'^\| (r\d+) \([^)]*\) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$', text, re.M)
        self.assertGreaterEqual(len(rows), len(rv['last_rounds']))

        def share(cell):
            cell = cell.strip()
            return 0.0 if cell == '0' else round(float(cell.rstrip('%')) / 100, 6)
        last = rows[-len(rv['last_rounds']):]
        self.assertEqual([[r[0], *map(share, r[1:])] for r in last],
                         [[x['round'], x['rare_missed'], x['common_missed'], x['rare_false_merge'], x['common_false_merge']] for x in rv['last_rounds']])
        self.assertIn(f"n={rv['n_per_cell']} per cell", text)
        self.assertIn(f"0/{rv['n_per_cell']} means an upper 95% bound of about {round(rv['zero_of_n_upper95'] * 100)}%", text)
        self.assertIn('met in two consecutive rounds', text)


class StampCheck(unittest.TestCase):
    """The 1904 stamp check (half_quality.check_stamps): verified = stamped in the snapshot's own edition_meta, equal to the
    reviewed list, the reference, never_stamp and the release's CSV."""

    def setUp(self):
        import copy
        self.meta = {
            1: {'city': 'A', 'year': 2024, 'status': 'stamped', 'reason': 'federation 300 vs db 300', 'source_type': 'federation results list'},
            2: {'city': 'B', 'year': 2024, 'status': 'stamped', 'reason': 'press 300', 'source_type': 'local press own total — weaker than federation'},
            3: {'city': 'C', 'year': 2024, 'status': 'counts_internal_only', 'reason': 'db=300 | unstamped 2026-10-29 reconcile', 'source_type': 'list rows'},
            4: {'city': 'D', 'year': 2024, 'status': 'counts_internal_only_winner_ok', 'reason': None, 'source_type': None},
            5: {'city': 'E', 'year': 2024, 'status': 'held_for_review', 'reason': 'trail', 'source_type': 'runsignup rows'},
        }
        self.never_stamp = [(3, 'unstamped 2026-10-29: (NOT independent) list rows', '2026-10-29 17:31:08'),
                            (4, 'unstamped 2026-10-29: (NOT independent) press repost', '2026-10-29 17:31:08')]
        self.stamps = {
            'stamped': [1, 2],
            'never_stamp': [{'edition_id': e, 'reason': r, 'added_at': a} for e, r, a in self.never_stamp],
            'reference': {'tag': 'half-dataset-20990101-0000',
                          'withdrawn': [{'edition_id': 3, 'city': 'C', 'year': 2024, 'corrected_status': 'counts_internal_only', 'reason': 'unstamped 2026-10-29 reconcile'}],
                          'weaker_source': [{'edition_id': 2, 'city': 'B', 'year': 2024, 'source': 'local press own total — weaker than federation'}]},
            'weaker_source': [{'edition_id': 2, 'city': 'B', 'year': 2024, 'source': 'local press own total — weaker than federation'}],
        }
        blank = lambda r: {k: ('' if v is None else v) for k, v in r.items()}   # a CSV writes NULL as an empty field
        self.inputs = {'reference': copy.deepcopy(self.meta), 'edition_meta': {e: blank(r) for e, r in self.meta.items()}}

    def check(self, meta=None, never_stamp=None, stamps=None, inputs=None):
        hq.check_stamps(meta or self.meta, self.never_stamp if never_stamp is None else never_stamp, stamps or self.stamps, inputs or self.inputs)

    def test_a_consistent_snapshot_passes(self):
        self.check()

    def test_every_difference_fails(self):
        import copy
        def changed(fn):
            meta, ns, stamps, inputs = copy.deepcopy(self.meta), list(self.never_stamp), copy.deepcopy(self.stamps), copy.deepcopy(self.inputs)
            fn(meta, ns, stamps, inputs)
            return {'meta': meta, 'never_stamp': ns, 'stamps': stamps, 'inputs': inputs}
        def restamp(meta, ns, stamps, inputs):   # a withdrawn stamp stamped again, everywhere but never_stamp
            meta[3]['status'] = 'stamped'
            inputs['reference'][3]['status'] = 'stamped'
            inputs['edition_meta'][3]['status'] = 'stamped'
            stamps['stamped'].append(3)
        cases = [
            (lambda m, n, s, i: m[5].update(status='stamped'), 'differ from the reviewed list'),
            (restamp, 'never_stamp editions are stamped'),
            (lambda m, n, s, i: i['reference'][2].update(status='counts_internal_only'), 'stamp reference'),
            (lambda m, n, s, i: i['reference'][1].update(city='Z'), 'in the reference'),
            (lambda m, n, s, i: n.pop(), 'never_stamp table differs'),
            (lambda m, n, s, i: (n.pop(0), s['never_stamp'].pop(0)), 'missing from the never_stamp table'),
            (lambda m, n, s, i: n.__setitem__(0, (3, n[0][1] + ' (edited)', n[0][2])), 'never_stamp table differs'),
            (lambda m, n, s, i: (m[3].update(status='held_for_review'), i['edition_meta'][3].update(status='held_for_review')), 'held_for_review here'),
            (lambda m, n, s, i: i['edition_meta'][1].update(reason='another reason'), 'csv-edition_meta differs'),
            (lambda m, n, s, i: i['edition_meta'].pop(5), 'different editions'),
            (lambda m, n, s, i: (m[2].update(source_type='federation list'), i['edition_meta'][2].update(source_type='federation list'),
                                 i['reference'][2].update(source_type='federation list')), 'weaker-source stamp'),
        ]
        for fn, what in cases:
            with self.assertRaisesRegex(hc.HalfError, what, msg=what):
                self.check(**changed(fn))

    def test_after_the_editions_the_weaker_stamps_are_verified_usable(self):
        m = pd.DataFrame({'edition_id': pd.array([1, 2, 3], dtype='Int64'), 'status_group': ['verified', 'verified', 'unverified'],
                          'use_finish': [True, True, True]})
        hq.check_stamps_verified(m, self.stamps)
        with self.assertRaisesRegex(hc.HalfError, 'weaker-source stamp'):
            hq.check_stamps_verified(m.assign(use_finish=[True, False, True]), self.stamps)
        with self.assertRaisesRegex(hc.HalfError, 'not the reviewed stamped list'):
            hq.check_stamps_verified(m.assign(status_group=['verified', 'verified', 'verified']), self.stamps)


class Policy1904(unittest.TestCase):
    """The 1904 entry's own rules on a synthetic snapshot: partial loads (E0), removed statuses (E1, no rows), virtual events
    (E2), an unknown status fails, and the link-partial editions."""

    @staticmethod
    def source(folder, extra=()):
        s = Source(folder)
        normal = uniform(5400, 10800, 300)
        s.edition('Alpha', 2022, status='counts_internal_only')
        s.field('Alpha', 2022, normal)
        s.field('New York', 2022, normal[:80])                                        # a partial load without a registry row
        s.edition('New York', 2018, status='counts_internal_only')
        s.field('New York', 2018, normal)                                             # a partial load with one: still E0
        s.edition('Gone', 2024, status='duplicate_deleted')                           # removed, no rows: E1
        s.edition('Austin, TX: 2020 Decker Challenge Virtual Half Marathon', 2020, status='counts_internal_only')
        s.field('Austin, TX: 2020 Decker Challenge Virtual Half Marathon', 2020, normal)
        s.edition('Anywhere USA, OH: Columbus Half Marathon 10K + 5K', 2015, status='counts_internal_only')
        s.field('Anywhere USA, OH: Columbus Half Marathon 10K + 5K', 2015, normal)
        s.edition('Phalempin:  Semi-Marathon de Phalempin Virtuel', 2021, status='held_for_review')
        s.field('Phalempin:  Semi-Marathon de Phalempin Virtuel', 2021, normal)
        s.edition('Homestead, FL: Gobbler 5K, 10K, & Half Marathon', 2023, status='counts_internal_only')
        s.field('Homestead, FL: Gobbler 5K, 10K, & Half Marathon', 2023, normal)
        for city, year, status, n in extra:
            s.edition(city, year, status=status)
            s.field(city, year, normal[:n])
        s.close()
        return s.path

    def editions(self, path, rules=None):
        db = hc.connect(half=path)
        rules = rules or hq.rules_of(hq.TAG)
        hq.record_rules(db, rules)
        m = hq.edition_rules(hq.edition_table(db, rules), rules)
        db.close()
        return m.set_index(['city', 'year'])

    def test_partial_loads_removed_and_virtual(self):
        with tempfile.TemporaryDirectory() as folder:
            m = self.editions(self.source(folder))
        rule = lambda key: (None if pd.isna(m.loc[key, 'category']) else m.loc[key, 'category'], m.loc[key, 'rule'] if isinstance(m.loc[key, 'rule'], str) else None)
        self.assertEqual(rule(('Alpha', 2022)), (None, None))
        self.assertEqual(rule(('New York', 2022)), ('partial_load', 'E0'))
        self.assertEqual(rule(('New York', 2018)), ('partial_load', 'E0'), 'a partial load stays out when a registry row appears')
        self.assertEqual(rule(('Gone', 2024)), ('removed_by_producer', 'E1'))
        self.assertEqual(rule(('Austin, TX: 2020 Decker Challenge Virtual Half Marathon', 2020)), ('virtual_event', 'E2'))
        self.assertEqual(rule(('Anywhere USA, OH: Columbus Half Marathon 10K + 5K', 2015)), ('virtual_event', 'E2'))
        self.assertEqual(rule(('Phalempin:  Semi-Marathon de Phalempin Virtuel', 2021)), ('held_by_producer', 'E1'), 'a held status comes first')
        self.assertEqual(rule(('Homestead, FL: Gobbler 5K, 10K, & Half Marathon', 2023)), (None, None))
        self.assertFalse(m.loc[('New York', 2018), 'use_finish'])

    def test_the_virtual_rule_and_its_exceptions(self):
        rule = hq.rules_of(hq.TAG)['virtual']
        for label, want in (('Anywhere USA, OH: Columbus Half Marathon 10K + 5K', True), ('anywhere: x', True),
                            ('Houston, TX: Koala Health & Wellness Houston VIRTUAL Half Marathon & 10K', True),
                            ('Phalempin:  Semi-Marathon de Phalempin Virtuel', True), ('Berlin: Virtuelle Halbmarathon', True),
                            ('Stockholm', False), ('Homestead, FL: Gobbler 5K', False), ('Boston: Run Anywhere Half', False),
                            ('Anywheresville, KS: Half', False), (None, False)):
            self.assertEqual(hq.is_virtual_label(label, rule), want, label)
        with tempfile.TemporaryDirectory() as folder:
            path = self.source(folder)
            db = hc.connect(half=path)
            eid = db.execute("SELECT id FROM h.edition_meta WHERE city LIKE 'Austin%'").fetchone()[0]
            db.close()
            rules = {**hq.rules_of(hq.TAG), 'not_virtual': ((eid, 'reviewed: a road race'),)}
            m = self.editions(path, rules)
        self.assertTrue(pd.isna(m.loc[('Austin, TX: 2020 Decker Challenge Virtual Half Marathon', 2020), 'category']), 'a reviewed exception is not virtual')

    def test_an_unknown_status_and_a_removed_edition_with_rows_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(hc.HalfError, 'in no status group'):
                self.editions(self.source(folder, extra=[('Odd', 2024, 'awaiting_review', 50)]))
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(hc.HalfError, 'removed status still hold rows'):
                self.editions(self.source(folder, extra=[('Gone Again', 2024, 'duplicate_deleted', 20)]))
        with tempfile.TemporaryDirectory() as folder:   # the 1133 entry knew no such rule: the same status falls to no_rows
            m = self.editions(self.source(folder, extra=[('Odd', 2024, 'awaiting_review', 50)]), hq.rules_of(hq.TAG_1133))
            self.assertEqual(m.loc[('Odd', 2024), 'category'], 'no_usable_rows')

    def test_an_empty_status_with_rows_fails_and_the_counts_add_up(self):
        # Verify round 1 (October 31, 2026): the producer's empty placeholder has no edition rule, so its rows would leave
        # every count unnoticed. It fails like a removed status with rows, and apply checks that every record-usable
        # finish after R7 is used or removed by one edition rule.
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(hc.HalfError, 'empty status hold record-usable rows'):
                self.editions(self.source(folder, extra=[('Loaded Late', 2024, 'no_rows', 300)]))
        with tempfile.TemporaryDirectory() as folder:
            path = self.source(folder)
            db = hc.connect(half=path)
            try:
                c = hq.apply(db, hq.TAG, compare=False).counts
            finally:
                db.close()
            self.assertEqual(c['use_finish']['finishes'] + c['E0_finishes'] + c['E1_held_finishes'] + c['E2_E8_finishes'], c['record_usable_after_R7'])
        with tempfile.TemporaryDirectory() as folder:
            path = self.source(folder, extra=[('Loaded Late', 2024, 'no_rows', 300)])
            saved = hq.REVIEWED_HALF_POLICIES[hq.TAG]['rules']
            db = hc.connect(half=path)
            try:   # without the empty group (and with unknown statuses allowed) the rows fall to no rule: apply refuses
                hq.REVIEWED_HALF_POLICIES[hq.TAG]['rules'] = {**saved, 'unknown_status': None,
                                                             'statuses': {g: v for g, v in saved['statuses'].items() if g != 'empty'}}
                with self.assertRaisesRegex(hc.HalfError, '300 record-usable finishes after R7 are neither used nor removed'):
                    hq.apply(db, hq.TAG, compare=False)
            finally:
                hq.REVIEWED_HALF_POLICIES[hq.TAG]['rules'] = saved
                db.close()

    def test_the_link_partial_editions(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.source(folder)
            db = hc.connect(half=path)
            result = hq.apply(db, hq.TAG, compare=False)
            ids = dict(((c, y), int(e)) for e, c, y in db.execute('SELECT DISTINCT edition_id, city, year FROM hfin').fetchall())
            alpha = db.execute("SELECT min(record_id), max(record_id), count(*) FROM hfin WHERE city = 'Alpha'").fetchone()
            boundary = alpha[0] + 99
            saved = hq.REVIEWED_HALF_POLICIES[hq.TAG]['link_editions']
            try:
                hq.REVIEWED_HALF_POLICIES[hq.TAG]['link_editions'] = {
                    **saved, 'half_max_record_id': boundary, 'retimed': [],
                    'link_partial': [{'edition_id': ids[('Alpha', 2022)], 'city': 'Alpha', 'year': 2022, 'rows_covered': 100, 'rows_uncovered': alpha[2] - 100}]}
                got = hq.check_link_editions(db, result.editions)
                self.assertEqual([x['city'] for x in got], ['Alpha'], 'only the edition with rows on both sides of the boundary')
                hq.REVIEWED_HALF_POLICIES[hq.TAG]['link_editions']['link_partial'] = []
                with self.assertRaisesRegex(hc.HalfError, 'link-partial editions differ'):
                    hq.check_link_editions(db, result.editions)
                hq.REVIEWED_HALF_POLICIES[hq.TAG]['link_editions'].update(
                    link_partial=got, retimed=[{'edition_id': 99999, 'city': 'Nowhere', 'year': 2020, 'rows': 1}])
                with self.assertRaisesRegex(hc.HalfError, 're-timed edition'):
                    hq.check_link_editions(db, result.editions)
            finally:
                hq.REVIEWED_HALF_POLICIES[hq.TAG]['link_editions'] = saved
                db.close()
        self.assertEqual(result.counts['E1_removed_editions'], 1)
        self.assertNotIn('stamp_withdrawn', result.counts)
        self.assertEqual(set(result.counts['stamp_check']), {'stamped', 'verified_usable', 'withdrawn_unstamped', 'never_stamp'})


class PolicyFiles(unittest.TestCase):
    """The frozen policy files: 1133 reproduced byte for byte by its own entry, 1904 equal to its entry, and the 1904
    review's decisions."""

    def test_the_1133_policy_is_reproduced_byte_for_byte(self):
        self.assertEqual(hq.policy_bytes(hq.TAG_1133), (ROOT / 'analysis' / 'half-policy-20261029-1133.json').read_bytes(),
                         'a later entry changed a rule the 1133 entry uses')

    def test_the_1904_policy_file_matches_its_entry(self):
        hq.check_policy_file(hq.TAG)
        doc = json.loads(hq.policy_path(hq.TAG).read_text())
        self.assertEqual([doc['tag'], doc['schema_version']], [hq.TAG, 2])
        self.assertNotIn('stamp_correction', doc)
        self.assertEqual(doc['expected'], hq.EXPECTED_20261030_1904)
        self.assertEqual(set(doc['statuses']), {'verified', 'unverified', 'held', 'removed', 'empty'})
        self.assertIn('fails', doc['unknown_status'])
        self.assertNotIn('nyrr_api', doc['edition_rules']['E3']['independent_pattern'])
        self.assertIn('nyrr_api', json.loads(hq.policy_path(hq.TAG_1133).read_text())['edition_rules']['E3']['independent_pattern'])
        self.assertEqual([(x['city'], x['year']) for x in doc['edition_rules']['E0']['partial_loads']],
                         [('New York', 2018), ('New York', 2022), ('New York', 2023), ('New York', 2024)])
        self.assertEqual(doc['edition_rules']['E2']['virtual_event']['not_virtual'], [])
        st = doc['stamps']
        self.assertEqual(len(st['stamped']), 243)
        self.assertEqual(len(st['never_stamp']), 78)
        self.assertEqual(len({r['edition_id'] for r in st['never_stamp']}), 78)
        self.assertEqual(len(st['reference']['withdrawn']), 72)
        self.assertTrue({w['edition_id'] for w in st['reference']['withdrawn']} <= {r['edition_id'] for r in st['never_stamp']})
        self.assertFalse(set(st['stamped']) & {r['edition_id'] for r in st['never_stamp']})
        self.assertEqual(set(st['reads']), {'stamped', 'reference', 'withdrawn', 'never_stamp', 'edition_meta_csv', 'weaker_source'})
        weaker = {x['edition_id'] for x in st['weaker_source']}
        self.assertEqual(weaker, {x['edition_id'] for x in st['reference']['weaker_source']} | {8823}, 'the six 2157 stamps and Belém 2024')
        self.assertTrue(weaker <= set(st['stamped']))
        self.assertEqual(doc['battery']['off_road_labels'], ['Kystleden Half', 'Nordmarka Skogsmaraton Half', 'Trondheim Skogsmaraton Half'])
        self.assertEqual(hq.battery_lists(hq.TAG)['weaker_source'], weaker)
        self.assertEqual(doc['verified_label_countries']['belém: GENERALI TRANQUILIDADE MEIA MARATONA DESCOBRIMENTOS'], 'PT')
        le = doc['link_editions']
        self.assertEqual([le['link_build'], le['half_max_record_id']], ['person-ids-v4-20261030-1150', 7411867])
        self.assertEqual([x['edition_id'] for x in le['link_partial']], [9895])
        self.assertEqual([x['edition_id'] for x in le['retimed']], [9055])
        self.assertEqual(doc['expected']['stamp_check'], {'stamped': 243, 'verified_usable': doc['expected']['verified']['editions'],
                                                          'withdrawn_unstamped': 72, 'never_stamp': 78})


SOURCE_DIR = Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1904')


@unittest.skipUnless((SOURCE_DIR / 'platform_half.sqlite').is_file() and os.environ.get('PACE_HALF_SOURCE_TESTS') == '1',
                     'the half snapshot is not on this machine (python3 -I analysis/download_half.py; set PACE_HALF_DIR and PACE_HALF_SOURCE_TESTS=1)')
class RealSource(unittest.TestCase):
    def test_frozen_lists_and_counts_recompute_from_the_snapshot(self):
        db = hc.connect(half=SOURCE_DIR / 'platform_half.sqlite')
        reference = os.environ.get('PACE_HALF_STAMP_REFERENCE')
        inputs = hq.read_stamp_inputs(hq.TAG, Path(reference) if reference else None, SOURCE_DIR / 'csv-edition_meta.csv.zst')
        # fails unless R3, R4, E0, E2–E8, the stamps, never_stamp, the CSV and the link-partial editions equal the review
        result = hq.apply(db, stamp_inputs=inputs)
        self.assertEqual(result.counts, hq.EXPECTED_20261030_1904)
        m = result.editions
        verified = m[m.use_finish & (m.status_group == 'verified')]
        stamps = hq.entry()['stamps']
        self.assertEqual(len(verified), result.counts['stamp_check']['verified_usable'])
        self.assertTrue(set(verified.edition_id.astype(int)) <= set(stamps['stamped']))
        self.assertTrue({x['edition_id'] for x in stamps['weaker_source']} <= set(verified.edition_id.astype(int)), 'the weaker-source stamps stay verified')
        self.assertEqual(result.lists['link_partial'], hq.entry()['link_editions']['link_partial'])

    def test_the_links_extract_is_the_pinned_one(self):
        import half_links_extract
        path = SOURCE_DIR / 'links-v4.sqlite'
        if not path.is_file():
            self.skipTest('no links-v4.sqlite beside the snapshot (python3 -I analysis/half_links_extract.py)')
        pin = hc.load_pin()
        con = sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)
        try:
            build = dict(con.execute('SELECT k, v FROM build').fetchall())
            self.assertEqual(half_links_extract.content_sha256(con), pin['links']['extract_content_sha256'])
            people = con.execute('SELECT count(*) FROM people').fetchone()[0]
        finally:
            con.close()
        self.assertEqual([build['links_key'], build['applies_to'], build['extract_content_sha256']],
                         [pin['links']['key'], pin['links']['applies_to'], pin['links']['extract_content_sha256']])
        self.assertEqual(people, half_links_extract.EXPECTED[pin['links']['key']]['people']['all'])


if __name__ == '__main__':
    unittest.main()
