"""Set B: half and marathon records linked by name (spec 1.3, link rules), the input of every linked figure.

The link rule, like for like with runner links v1 (lead rulings L, October 31, 2026), on the v4 person IDs of
links-v4.sqlite (analysis/half_links_extract.py):
1. People: a v4 person_id (`^p4_[0-9a-f]{16}$`, asserted) whose tier is high_elite, high or medium (high_elite and high
   count as high), with `ns_keys` at most 3 (the distinct age keys of the person's name and published sex, the largest
   over the person's strong rows: rows whose own confidence is high_elite, high or medium, of either distance, whatever
   the status of their record). The producer's own unions are applied; there are no candidate merges.
2. Strong rows only: both records of a pair carry their own confidence high_elite, high or medium, so a record the link
   build attached without an age or a sex (low_noage, low_noage_series, low_nosex) or a low one never pairs.
3. Their halves: `use_finish` finishes, dated, not in the R7 bib block, not in a date-suspect edition, not in one of the
   policy's link editions (`link_editions`: an edition with rows on both sides of the link build's coverage boundary,
   or one re-timed after the build); no other usable half of the person on the same date, and no eligible marathon of
   the person on that date, both counted over every linked row of the person whatever its confidence, the link editions'
   rows and the R7 rows included.
4. Their marathons: the site's eligible finishes (analysis/half_marathon.py), joined on the canonical record id.
5. Pairs: for each eligible marathon, the nearest earlier half 21 to 112 days before it (ties: the lower half record
   id); one pair per person and marathon.

Two signals are counted with the reviewed counts and never exclude a pair (review R6; no exclusion rule added after the
data, lead rulings): halves used by two or more pairs, and pairs whose person has another eligible marathon (any linked
row) within 13 days of the paired one.

Linked records are candidates, never verified people: every count here is a pair of records. The person key never leaves
this module and DuckDB.
"""
from __future__ import annotations

import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import fail  # noqa: E402

TIERS = ('high_elite', 'high', 'medium')     # the person's tier and each paired row's own confidence
NS_KEYS_MAX = 3
WINDOW_DAYS = (21, 112)
CLOSE_MARATHON_DAYS = 13
PERSON_ID = r'^p4_[0-9a-f]{16}$'
LINK_RULES = {'tiers': list(TIERS), 'row_tiers': list(TIERS), 'ns_keys_max': NS_KEYS_MAX,
              'ns_keys': ("distinct age keys per normalized name and published sex over every row of the link build; a person takes "
                          "the largest over the person's rows whose own confidence is high_elite, high or medium (either distance, "
                          "whatever the record's status)"),
              'window_days': list(WINDOW_DAYS), 'pairing': 'nearest prior half, one pair per person and marathon',
              'conflicts': 'over every linked row of the person, whatever its confidence',
              'link_editions': "the policy's link-partial and re-timed editions supply no linked half",
              'unions': 'applied by the link build'}

# The reviewed set B, keyed by the link build (pin links.key). Earlier builds stay in Git history: runner-links-20261029-1156
# with half-snapshot-20261029-1133 and the 2157 correction gave 23,929 pairs, 20,234 people, 107 marathon editions in 21
# cities, 1,045 half editions, 5,947 women's and 17,982 men's pairs and 2,024 verified halves.
EXPECTED = {
    # 2026-10-31 (s2-extract-setb): half-dataset-20261030-1904 under its reviewed policy, person links v4 under the rule
    # above, private-export-20261021-1050's eligible marathons: 58,497 pairs, 50,526 people, 181 marathon editions in 26
    # cities, 2,570 half editions, 17,822 women's and 40,675 men's pairs, 4,598 verified halves; 339 halves serve two or
    # more and 77 pairs have another eligible marathon of the person within 13 days (review R6; counted, not excluded).
    # 2026-11-04: the same snapshot, policy and links against master-20261103b's eligible marathons. The released
    # Amsterdam 2023 and New York 2008 add 100 pairs (80 people, one marathon edition, one half edition, 23 women's and
    # 77 men's pairs, 43 verified halves); New York 2026 has no v4 row and no race date, so it adds none; the R6 signals
    # are unchanged.
    'person-ids-v4-20261030-1150': {'pairs': 58_597, 'people': 50_606, 'marathon_editions': 182, 'marathon_cities': 26,
                                    'half_editions': 2_571, 'women_pairs': 17_845, 'men_pairs': 40_752, 'verified_halves': 4_641,
                                    'halves_in_two_or_more_pairs': 339, 'pairs_with_a_close_marathon': 77},
}


def no_link_sql(link_editions: dict) -> str:
    """SQL on `f.edition_id`: true unless the half edition is one of the policy's link editions (they supply no linked half)."""
    ids = sorted(int(e) for e in set(link_editions['link_partial']) | set(link_editions['retimed']))
    return f"f.edition_id NOT IN ({', '.join(str(e) for e in ids)})" if ids else 'TRUE'


def build(db, marathons, links_tag: str, *, link_editions: dict, expected: dict | None = None, check: bool = True):
    """Set B as a pandas frame (one row per pair). Needs `hfin` (half_quality.apply) and the links extract as `l`;
    `link_editions` is half_quality.link_editions (the edition ids that supply no linked half). With `check` (always,
    outside tests) the counts must equal the reviewed ones."""
    tiers = ', '.join(f"'{t}'" for t in TIERS)
    bad = db.execute(f"SELECT count(*) FROM l.people WHERE NOT regexp_full_match(person_id, '{PERSON_ID}')").fetchone()[0]
    if bad:
        fail(f'{bad} people in the links extract without a v4 person id')
    no_link = no_link_sql(link_editions)
    db.register('mar_df', marathons.frame())
    db.execute('CREATE OR REPLACE TEMP TABLE mar AS SELECT * FROM mar_df')
    db.unregister('mar_df')
    db.execute(f"""CREATE OR REPLACE TEMP TABLE pp AS SELECT person_id, sex, tier, ns_keys, k, in_union = 1 AS in_union
        FROM l.people WHERE tier IN ({tiers}) AND ns_keys <= {NS_KEYS_MAX}""")
    # Every linked row of the people, whatever its confidence: usable halves and eligible marathons, for the conflicts.
    db.execute("""CREATE OR REPLACE TEMP TABLE phc AS SELECT p.person_id, f.race_date AS h_date
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'half' JOIN hfin f ON f.record_id = k.record_id""")
    db.execute("""CREATE OR REPLACE TEMP TABLE pmc AS SELECT DISTINCT p.person_id, m.m_record_id, m.m_date
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'full' JOIN mar m ON m.m_record_id = k.record_id""")
    # The strong rows that may form a pair (halves: use_finish, outside the link editions; marathons: eligible).
    db.execute(f"""CREATE OR REPLACE TEMP TABLE ph AS SELECT p.person_id, f.record_id AS h_record_id, f.edition_id AS h_edition_id,
        f.city AS h_label, f.race_date AS h_date, f.status_group AS h_status_group, f.finish_s AS h_finish_s, f.r7_block, f.date_suspect
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'half' AND k.confidence IN ({tiers})
        JOIN hfin f ON f.record_id = k.record_id WHERE {no_link}""")
    db.execute(f"""CREATE OR REPLACE TEMP TABLE pm AS SELECT p.person_id, m.*
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'full' AND k.confidence IN ({tiers})
        JOIN mar m ON m.m_record_id = k.record_id""")
    # A second usable half of the person on the same date (the R7 rows and the link editions included), and a half on the
    # date of one of the person's eligible marathons.
    db.execute("""CREATE OR REPLACE TEMP TABLE ph2 AS SELECT h.*, d.n > 1 AS same_date_conflict, md.person_id IS NOT NULL AS sameday_marathon
        FROM ph h
        LEFT JOIN (SELECT person_id, h_date, count(*) AS n FROM phc WHERE h_date IS NOT NULL GROUP BY ALL) d
          ON d.person_id = h.person_id AND d.h_date = h.h_date
        LEFT JOIN (SELECT DISTINCT person_id, m_date FROM pmc) md ON md.person_id = h.person_id AND md.m_date = h.h_date""")
    lo, hi = WINDOW_DAYS
    db.execute(f"""CREATE OR REPLACE TEMP TABLE setb AS SELECT * FROM (
        SELECT m.person_id, p.sex, p.tier, p.ns_keys, p.k, p.in_union,
          h.h_record_id, h.h_edition_id, h.h_label, h.h_date, h.h_status_group, h.h_finish_s,
          m.m_record_id, m.m_edition, m.m_city, m.m_year, m.m_date, m.m_gender, m.m_finish_s, m.m_sustained,
          date_diff('day', h.h_date, m.m_date) AS days,
          row_number() OVER (PARTITION BY m.person_id, m.m_record_id ORDER BY date_diff('day', h.h_date, m.m_date), h.h_record_id) AS pick
        FROM pm m JOIN ph2 h USING (person_id) JOIN pp p USING (person_id)
        WHERE h.h_date IS NOT NULL AND date_diff('day', h.h_date, m.m_date) BETWEEN {lo} AND {hi}
          AND NOT h.r7_block AND NOT h.date_suspect AND NOT h.same_date_conflict AND NOT h.sameday_marathon)
        WHERE pick = 1""")
    # Review R6's signal: another eligible marathon of the person (any linked row) within 13 days of the paired one.
    db.execute(f"""CREATE OR REPLACE TEMP TABLE close13 AS SELECT DISTINCT s.person_id, s.m_record_id FROM setb s
        JOIN pmc o ON o.person_id = s.person_id AND o.m_record_id <> s.m_record_id
        WHERE abs(date_diff('day', o.m_date, s.m_date)) <= {CLOSE_MARATHON_DAYS}""")
    pairs = db.execute("""SELECT s.person_id, s.sex, s.tier, s.ns_keys, s.k, s.in_union, s.h_record_id, s.h_edition_id, s.h_label, s.h_date,
        s.h_status_group, s.h_finish_s, s.m_record_id, s.m_edition, s.m_city, s.m_year, s.m_date, s.m_finish_s, s.m_sustained, s.days,
        c.person_id IS NOT NULL AS m_close_marathon
        FROM setb s LEFT JOIN close13 c USING (person_id, m_record_id) ORDER BY s.m_record_id, s.person_id""").df()
    for t in ('pp', 'phc', 'pmc', 'ph', 'pm', 'ph2', 'setb', 'close13', 'mar'):
        db.execute(f'DROP TABLE {t}')
    pairs['m_ed'] = pairs.m_city.astype(str) + ' ' + pairs.m_year.astype(str)
    pairs['verified'] = pairs.h_status_group == 'verified'
    if check:
        got = summary(pairs)
        want = (expected or EXPECTED).get(links_tag)
        if want is None:
            fail(f'no reviewed set B counts for links build {links_tag}')
        if got != want:
            fail(f'set B counts {got} differ from the reviewed {want}')
    if not pairs.sex.isin(['F', 'M']).all():
        fail('a set B pair without a recorded sex on its person')
    return pairs


def coverage(db, marathons, *, link_editions: dict):
    """Link coverage by marathon city (for /methodology only): each city's eligible marathon finishes, and how many of
    them are linked, on a strong row (own confidence high_elite, high or medium), to a person who passes rule 1 and has
    a strong row on a usable half outside the link editions and the R7 block, dated or not and date-suspect or not (so a
    half that cannot itself pair still counts). It depends on how each source publishes age, not on runners' habits.
    Needs `hfin` and the links extract as `l`. A list of {city, finishes, linked}, every city."""
    tiers = ', '.join(f"'{t}'" for t in TIERS)
    no_link = no_link_sql(link_editions)
    db.register('mar_df', marathons.frame())
    rows = db.execute(f"""WITH pp AS (SELECT person_id FROM l.people WHERE tier IN ({tiers}) AND ns_keys <= {NS_KEYS_MAX}),
        wh AS (SELECT DISTINCT k.person_id FROM l.links k JOIN pp USING (person_id) JOIN hfin f ON f.record_id = k.record_id
               WHERE k.db = 'half' AND k.confidence IN ({tiers}) AND NOT f.r7_block AND {no_link}),
        lk AS (SELECT DISTINCT k.record_id FROM l.links k JOIN wh USING (person_id) WHERE k.db = 'full' AND k.confidence IN ({tiers}))
        SELECT m.m_city AS city, count(*) AS finishes, count(lk.record_id) AS linked
        FROM mar_df m LEFT JOIN lk ON lk.record_id = m.m_record_id GROUP BY 1 ORDER BY 1""").fetchall()
    db.unregister('mar_df')
    return [{'city': c, 'finishes': int(n), 'linked': int(k)} for c, n, k in rows]


def summary(pairs) -> dict:
    """The reviewed counts of set B, with review R6's two signals."""
    reused = pairs.groupby('h_record_id').size()
    return {'pairs': int(len(pairs)), 'people': int(pairs.person_id.nunique()), 'marathon_editions': int(pairs.m_ed.nunique()),
            'marathon_cities': int(pairs.m_city.nunique()), 'half_editions': int(pairs.h_edition_id.nunique()),
            'women_pairs': int((pairs.sex == 'F').sum()), 'men_pairs': int((pairs.sex == 'M').sum()),
            'verified_halves': int(pairs.verified.sum()),
            'halves_in_two_or_more_pairs': int((reused >= 2).sum()),
            'pairs_with_a_close_marathon': int(pairs.m_close_marathon.sum())}
