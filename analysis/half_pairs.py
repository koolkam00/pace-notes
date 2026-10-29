"""Set B: half and marathon records linked by name (spec 1.3, link rules), the input of every linked figure.

1. People from links-slim.sqlite: confidence high or medium, `ns_keys` at most 3; candidate merges not applied.
2. Their halves: `use_finish` finishes, dated, not in the R7 bib block, not in a date-suspect edition; no second half of
   the person on the same date; no half on the date of one of the person's eligible marathons.
3. Their marathons: the site's eligible finishes (analysis/half_marathon.py), joined on the canonical record id.
4. Pairs: for each eligible marathon, the nearest earlier half 21 to 112 days before it (ties: the lower half record
   id); one pair per person and marathon.

Linked records are candidates, never verified people: every count here is a pair of records. The person key is a hash
that never leaves this module and DuckDB.
"""
from __future__ import annotations

import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import fail  # noqa: E402

TIERS = ('high', 'medium')
NS_KEYS_MAX = 3
WINDOW_DAYS = (21, 112)
LINK_RULES = {'tiers': list(TIERS), 'ns_keys_max': NS_KEYS_MAX, 'window_days': list(WINDOW_DAYS),
              'pairing': 'nearest prior half, one pair per person and marathon', 'candidate_merges': 'not applied'}

# The reviewed set B of runner-links-20261029-1156 with half-snapshot-20261029-1133 (link audit and spec 1.3).
EXPECTED = {
    'runner-links-20261029-1156': {'pairs': 23_929, 'people': 20_234, 'marathon_editions': 107, 'marathon_cities': 21,
                                   'half_editions': 1_045, 'women_pairs': 5_947, 'men_pairs': 17_982, 'verified_halves': 14_321},
}


def build(db, marathons, links_tag: str, expected: dict | None = None, check: bool = True):
    """Set B as a pandas frame (one row per pair). Needs `hfin` (half_quality.apply) and the links extract as `l`.
    With `check` (always, outside tests) the counts must equal the reviewed ones."""
    tiers = ', '.join(f"'{t}'" for t in TIERS)
    db.register('mar_df', marathons.frame())
    db.execute('CREATE OR REPLACE TEMP TABLE mar AS SELECT * FROM mar_df')
    db.unregister('mar_df')
    db.execute(f"""CREATE OR REPLACE TEMP TABLE pp AS SELECT person_id, sex, confidence AS tier, ns_keys, key_type,
        in_candidate_merge = 1 AS in_candidate_merge FROM l.people WHERE confidence IN ({tiers}) AND ns_keys <= {NS_KEYS_MAX}""")
    db.execute("""CREATE OR REPLACE TEMP TABLE ph AS SELECT p.person_id, f.record_id AS h_record_id, f.edition_id AS h_edition_id,
        f.race_date AS h_date, f.status_group AS h_status_group, f.finish_s AS h_finish_s, f.r7_block, f.date_suspect
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'half' JOIN hfin f ON f.record_id = k.record_id""")
    db.execute("""CREATE OR REPLACE TEMP TABLE pm AS SELECT p.person_id, m.*
        FROM pp p JOIN l.links k ON k.person_id = p.person_id AND k.db = 'full' JOIN mar m ON m.m_record_id = k.record_id""")
    # A second half on the same date (any usable half of the person, the R7 rows included), and a half on the date of
    # one of the person's eligible marathons.
    db.execute("""CREATE OR REPLACE TEMP TABLE ph2 AS SELECT h.*, d.n > 1 AS same_date_conflict, md.person_id IS NOT NULL AS sameday_marathon
        FROM ph h
        LEFT JOIN (SELECT person_id, h_date, count(*) AS n FROM ph WHERE h_date IS NOT NULL GROUP BY ALL) d
          ON d.person_id = h.person_id AND d.h_date = h.h_date
        LEFT JOIN (SELECT DISTINCT person_id, m_date FROM pm) md ON md.person_id = h.person_id AND md.m_date = h.h_date""")
    lo, hi = WINDOW_DAYS
    db.execute(f"""CREATE OR REPLACE TEMP TABLE setb AS SELECT * FROM (
        SELECT m.person_id, p.sex, p.tier, p.ns_keys, p.key_type, p.in_candidate_merge,
          h.h_record_id, h.h_edition_id, h.h_date, h.h_status_group, h.h_finish_s,
          m.m_record_id, m.m_edition, m.m_city, m.m_year, m.m_date, m.m_gender, m.m_finish_s, m.m_sustained,
          date_diff('day', h.h_date, m.m_date) AS days,
          row_number() OVER (PARTITION BY m.person_id, m.m_record_id ORDER BY date_diff('day', h.h_date, m.m_date), h.h_record_id) AS k
        FROM pm m JOIN ph2 h USING (person_id) JOIN pp p USING (person_id)
        WHERE h.h_date IS NOT NULL AND date_diff('day', h.h_date, m.m_date) BETWEEN {lo} AND {hi}
          AND NOT h.r7_block AND NOT h.date_suspect AND NOT h.same_date_conflict AND NOT h.sameday_marathon)
        WHERE k = 1""")
    pairs = db.execute("""SELECT person_id, sex, tier, ns_keys, in_candidate_merge, h_record_id, h_edition_id, h_date,
        h_status_group, h_finish_s, m_record_id, m_edition, m_city, m_year, m_date, m_finish_s, m_sustained, days
        FROM setb ORDER BY m_record_id, person_id""").df()
    for t in ('pp', 'ph', 'pm', 'ph2', 'setb', 'mar'):
        db.execute(f'DROP TABLE {t}')
    pairs['m_ed'] = pairs.m_city + ' ' + pairs.m_year.astype(str)
    pairs['verified'] = pairs.h_status_group == 'verified'
    if check:
        got = summary(pairs)
        want = (expected or EXPECTED).get(links_tag)
        if want is None:
            fail(f'no reviewed set B counts for links build {links_tag}')
        if got != want:
            fail(f'set B counts {got} differ from the reviewed {want}')
    if not pairs.sex.isin(['F', 'M']).all():
        fail('a set B pair without a recorded sex on its link key')
    return pairs


def summary(pairs) -> dict:
    return {'pairs': int(len(pairs)), 'people': int(pairs.person_id.nunique()), 'marathon_editions': int(pairs.m_ed.nunique()),
            'marathon_cities': int(pairs.m_city.nunique()), 'half_editions': int(pairs.h_edition_id.nunique()),
            'women_pairs': int((pairs.sex == 'F').sum()), 'men_pairs': int((pairs.sex == 'M').sum()),
            'verified_halves': int(pairs.verified.sum())}
