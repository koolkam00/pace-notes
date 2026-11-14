"""Set B: half and marathon records linked by name (docs/HALF_MARATHON.md, rule R3), the input of every linked figure.

The link rule of runner links v1 and of the v4 person IDs, translated like for like to person links v5.1 and the
pipeline's one identity file (recorded 2026-11-14 before any build; analysis/half_source.py makes `l.people` and
`l.links`):
1. Runners: a runner key of the identity file, which is the producer's v5.1 person_id (`^p51_[0-9a-f]{16}$`, asserted) of
   a link that passes the identity rule (confidence high_elite, high or medium, and the person passes the three screens
   over both distances), whose persons.parquet sex is M or F, with `ns_keys` at most 3 (the distinct age keys of the
   person's name and sex, the largest over the person's rows whose own confidence is high_elite, high or medium, of
   either distance, whatever the status of their record).
2. Keyed rows only: both records of a pair are keyed rows of that runner in the identity file, so a `medium_variant` or
   `low_*` row, a row a row rule leaves out and a row of a person who fails a screen never pair; nor does a row whose
   link method contains `variant_union`.
3. Their halves: `use_finish` finishes, dated, not in the R7 bib block, not in a date-suspect edition; no other usable
   half of the person on the same date, and no eligible marathon of the person on that date, both counted over every
   linked row of the person in the link file, whatever its confidence or status, the R7 rows included.
4. Their marathons: the cohort's counted records (analysis/half_marathon.py), joined on (source_db = full, record id).
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

TIERS = ('high_elite', 'high', 'medium')     # the confidences that key a row (adapt_combined.IDENTITY)
NS_KEYS_MAX = 3
WINDOW_DAYS = (21, 112)
CLOSE_MARATHON_DAYS = 13
PERSON_ID = r'^p51_[0-9a-f]{16}$'
LINK_RULES = {'tiers': list(TIERS), 'row_tiers': list(TIERS), 'ns_keys_max': NS_KEYS_MAX,
              'identity': ("both rows of a pair are keyed rows of one runner key in the pipeline's identity file: the link's "
                           "confidence is high_elite, high or medium, no row rule leaves the row out, and the person passes the three "
                           "screens over both distances (one recorded sex, birth years within two, one result per edition)"),
              'ns_keys': ("distinct age keys per normalized name and sex over every row of the link build; a person takes "
                          "the largest over the person's rows whose own confidence is high_elite, high or medium (either distance, "
                          "whatever the record's status)"),
              'never_pairs': 'a row whose link method contains variant_union',
              'window_days': list(WINDOW_DAYS), 'pairing': 'nearest prior half, one pair per person and marathon',
              'conflicts': 'over every linked row of the person in the link file, whatever its confidence or status',
              'unions': 'applied by the link build'}

# The reviewed set B, keyed by the link build (pin links.key), set from the real run on the final inputs after each
# difference from the plan's measurements is read. Earlier builds stay in Git history: person-ids-v4-20261030-1150 with
# half-dataset-20261030-1904 against master-20261103b gave 58,597 pairs, 50,606 people, 182 marathon editions in 26
# cities, 2,571 half editions, 17,845 women's and 40,752 men's pairs and 4,641 verified halves.
EXPECTED = {}


def build(db, marathons, links_tag: str, *, expected: dict | None = None, check: bool = True):
    """Set B as a pandas frame (one row per pair). Needs `hfin` (half_quality.apply) and the link tables `l.people` and
    `l.links` (half_source.link_tables). With `check` (always, outside tests and discovery runs) the counts must equal
    the reviewed ones."""
    bad = db.execute(f"SELECT count(*) FROM l.people WHERE NOT regexp_full_match(person_id, '{PERSON_ID}')").fetchone()[0]
    if bad:
        fail(f'{bad} people in the link tables without a v5.1 person id')
    db.register('mar_df', marathons.frame())
    db.execute('CREATE OR REPLACE TEMP TABLE mar AS SELECT * FROM mar_df')
    db.unregister('mar_df')
    db.execute(f"""CREATE OR REPLACE TEMP TABLE pp AS SELECT person_id, sex, ns_keys, in_union = 1 AS in_union
        FROM l.people WHERE sex IN ('M', 'F') AND ns_keys <= {NS_KEYS_MAX}""")
    # Every linked row of the people, whatever its confidence or status: usable halves and eligible marathons, for the conflicts.
    db.execute("""CREATE OR REPLACE TEMP TABLE phc AS SELECT p.person_id, f.race_date AS h_date
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'half' AND k.distance = 'half' JOIN hfin f ON f.record_id = k.record_id""")
    db.execute("""CREATE OR REPLACE TEMP TABLE pmc AS SELECT DISTINCT p.person_id, m.m_record_id, m.m_date
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'full' AND k.distance = 'marathon' JOIN mar m ON m.m_record_id = k.record_id""")
    # The keyed rows that may form a pair (halves: use_finish; marathons: eligible), never a variant-union row.
    db.execute("""CREATE OR REPLACE TEMP TABLE ph AS SELECT p.person_id, f.record_id AS h_record_id, f.edition_id AS h_edition_id,
        f.city AS h_label, f.race_date AS h_date, f.status_group AS h_status_group, f.finish_s AS h_finish_s, f.r7_block, f.date_suspect
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'half' AND k.distance = 'half' AND k.keyed = 1 AND k.variant_union = 0
        JOIN hfin f ON f.record_id = k.record_id""")
    db.execute("""CREATE OR REPLACE TEMP TABLE pm AS SELECT p.person_id, m.*
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'full' AND k.distance = 'marathon' AND k.keyed = 1 AND k.variant_union = 0
        JOIN mar m ON m.m_record_id = k.record_id""")
    # A second usable half of the person on the same date (the R7 rows included), and a half on the date of one of the
    # person's eligible marathons.
    db.execute("""CREATE OR REPLACE TEMP TABLE ph2 AS SELECT h.*, d.n > 1 AS same_date_conflict, md.person_id IS NOT NULL AS sameday_marathon
        FROM ph h
        LEFT JOIN (SELECT person_id, h_date, count(*) AS n FROM phc WHERE h_date IS NOT NULL GROUP BY ALL) d
          ON d.person_id = h.person_id AND d.h_date = h.h_date
        LEFT JOIN (SELECT DISTINCT person_id, m_date FROM pmc) md ON md.person_id = h.person_id AND md.m_date = h.h_date""")
    lo, hi = WINDOW_DAYS
    db.execute(f"""CREATE OR REPLACE TEMP TABLE setb AS SELECT * FROM (
        SELECT m.person_id, p.sex, p.ns_keys, p.in_union,
          h.h_record_id, h.h_edition_id, h.h_label, h.h_date, h.h_status_group, h.h_finish_s,
          m.m_record_id, m.m_edition, m.m_city, m.m_year, m.m_date, m.m_gender, m.m_finish_s, m.m_sustained,
          date_diff('day', h.h_date, m.m_date) AS days,
          row_number() OVER (PARTITION BY m.person_id, m.m_record_id ORDER BY date_diff('day', h.h_date, m.m_date), h.h_record_id) AS pick
        FROM pm m JOIN ph2 h USING (person_id) JOIN pp p USING (person_id)
        WHERE h.h_date IS NOT NULL AND m.m_date IS NOT NULL AND date_diff('day', h.h_date, m.m_date) BETWEEN {lo} AND {hi}
          AND NOT h.r7_block AND NOT h.date_suspect AND NOT h.same_date_conflict AND NOT h.sameday_marathon)
        WHERE pick = 1""")
    # Review R6's signal: another eligible marathon of the person (any linked row) within 13 days of the paired one.
    db.execute(f"""CREATE OR REPLACE TEMP TABLE close13 AS SELECT DISTINCT s.person_id, s.m_record_id FROM setb s
        JOIN pmc o ON o.person_id = s.person_id AND o.m_record_id <> s.m_record_id
        WHERE abs(date_diff('day', o.m_date, s.m_date)) <= {CLOSE_MARATHON_DAYS}""")
    pairs = db.execute("""SELECT s.person_id, s.sex, s.ns_keys, s.in_union, s.h_record_id, s.h_edition_id, s.h_label, s.h_date,
        s.h_status_group, s.h_finish_s, s.m_record_id, s.m_edition, s.m_city, s.m_year, s.m_date, s.m_finish_s, s.m_sustained, s.days,
        c.person_id IS NOT NULL AS m_close_marathon
        FROM setb s LEFT JOIN close13 c USING (person_id, m_record_id) ORDER BY s.m_record_id, s.person_id""").df()
    for t in ('pp', 'phc', 'pmc', 'ph', 'pm', 'ph2', 'setb', 'close13', 'mar'):
        db.execute(f'DROP TABLE {t}')
    pairs['m_ed'] = pairs.m_city.astype(str) + ' ' + pairs.m_year.astype(str)
    pairs['verified'] = pairs.h_status_group == 'verified'
    if check:
        got = summary(pairs)
        want = (expected if expected is not None else EXPECTED).get(links_tag)
        if want is None:
            fail(f'no reviewed set B counts for links build {links_tag}')
        if got != want:
            fail(f'set B counts {got} differ from the reviewed {want}')
    if not pairs.sex.isin(['F', 'M']).all():
        fail('a set B pair without a recorded sex on its person')
    return pairs


def coverage(db, marathons):
    """Link coverage by marathon city (for /methodology only): each city's eligible marathon finishes, and how many of
    them are linked, on a keyed row that is not a variant-union row, to a runner who passes rule 1 and has such a row on
    a usable half outside the R7 block, dated or not and date-suspect or not (so a half that cannot itself pair still
    counts). It depends on how each source publishes age, not on runners' habits. Needs `hfin` and the link tables.
    A list of {city, finishes, linked}, every city."""
    db.register('mar_df', marathons.frame())
    rows = db.execute(f"""WITH pp AS (SELECT person_id FROM l.people WHERE sex IN ('M', 'F') AND ns_keys <= {NS_KEYS_MAX}),
        wh AS (SELECT DISTINCT k.person_id FROM l.links k JOIN pp USING (person_id) JOIN hfin f ON f.record_id = k.record_id
               WHERE k.db = 'half' AND k.distance = 'half' AND k.keyed = 1 AND k.variant_union = 0 AND NOT f.r7_block),
        lk AS (SELECT DISTINCT k.record_id FROM l.links k JOIN wh USING (person_id)
               WHERE k.db = 'full' AND k.distance = 'marathon' AND k.keyed = 1 AND k.variant_union = 0)
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
