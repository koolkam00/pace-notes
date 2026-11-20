"""pacing.json (usable): how halves are paced (docs/HALF_MARATHON.md, rule R5; the surface at the foot of /half).

The first half-only family on results that are mostly unverified: the scope is every usable finish (after the record
rules R1 to R8 and the edition rules), so every surface of it carries the chip "Includes unverified half results". No
verified-only value exists: too few verified editions publish a 10 km time for their field.

The measure, per result: pace over the last 11.0975 km against pace over the first 10 km,
`((finish − t10) / 11.0975) / (t10 / 10) − 1`. A result qualifies when it is a usable finish outside the R7 block, its
`split_10km` parses with the marathon pipeline's parser (analysis/build_pacing.py: `H:MM:SS` or `M:SS`, minutes and
seconds 00 to 59, an optional fraction, the text trimmed; anything else is unparsed), 0 < t10 < finish, both parts lie
between 2:00 and 20:00 per km inclusive, and the release sets neither `split_nonmonotonic` nor `split_after_finish` on
it. An edition qualifies when it has at least 500 qualifying results, they are at least half of its usable finishes,
and its own median change lies between −6% and +12% inclusive (the screen that says where the 10 km mat is). A race
label is the edition's `city` key in the release.

Values: the pooled median change and the pooled shares that ran the last 11.1 km faster (change below zero) and more
than 10% slower; the same three with editions weighted equally (the median over editions of each edition's own value)
and with labels weighted equally (the median over labels of each label's own value, the label's results pooled); for
each label, the pooled median and the pooled share faster with that label left out; the pooled three by 20-minute
finish band from 1:00 to 3:19; and a histogram of the change in 1-point bins with open tails, overall and by band, from
which the layer 1 verifier restates each pooled share exactly and the bin of each pooled median.

Builder floors (never lowered; a floor that fails leaves the group out, or the whole family with its beat): every
shown group holds at least 100 results from at least 3 editions, and so does every histogram bin and open tail (100
results); a finish band also needs at least 3 labels; the family is published only from at least 20 qualifying
editions of at least 10 labels with no label over half of the results. A label's own values are shown only from 100
results of 3 editions; its leave-out values are the rest's and always are. Per-edition rows are unnamed.
"""
from __future__ import annotations

import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

from half_common import MIN_CELL, MIN_EDITIONS, fail, sh  # noqa: E402

FIRST_KM, LAST_KM = 10.0, 11.0975
PACE_S_PER_KM = (120.0, 1200.0)                 # both parts, inclusive
EDITION_MIN_RESULTS = 500
EDITION_MIN_SHARE = 0.5                         # of the edition's usable finishes
SCREEN = (-0.06, 0.12)                          # the edition's own median change, inclusive
SLOWER = 0.10
BAND_S, BANDS_FROM_S, BANDS_TO_S = 1200, 3600, 12000    # 20-minute finish bands, 1:00 to 3:19
MIN_BAND_LABELS = 3
FAMILY_MIN_EDITIONS, FAMILY_MIN_LABELS, FAMILY_MAX_LABEL_SHARE = 20, 10, 0.5
SPLIT_FLAGS = ('split_nonmonotonic', 'split_after_finish')
# The marathon pipeline's parser of elapsed clock strings (analysis/build_pacing.py `seconds`), text for text.
T10_SQL = r"""(CASE WHEN regexp_full_match(trim(r.split_10km), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9](\.[0-9]+)?')
        THEN try_cast(split_part(trim(r.split_10km), ':', 1) AS DOUBLE)*3600
           + try_cast(split_part(trim(r.split_10km), ':', 2) AS DOUBLE)*60
           + try_cast(split_part(trim(r.split_10km), ':', 3) AS DOUBLE)
      WHEN regexp_full_match(trim(r.split_10km), '[0-9]{1,4}:[0-5][0-9](\.[0-9]+)?')
        THEN try_cast(split_part(trim(r.split_10km), ':', 1) AS DOUBLE)*60
           + try_cast(split_part(trim(r.split_10km), ':', 2) AS DOUBLE)
      ELSE NULL END)"""
RULE = {
    'measure': 'pace over the last 11.0975 km against pace over the first 10 km: ((finish - t10) / 11.0975) / (t10 / 10) - 1',
    'result': 'a usable finish outside the R7 block whose 10 km time parses (H:MM:SS or M:SS), 0 < t10 < finish, both parts '
              '2:00 to 20:00 per km inclusive, neither split_nonmonotonic nor split_after_finish set by the release',
    'edition': 'at least 500 qualifying results, at least half of its usable finishes, its own median change from -6% to +12% inclusive',
    'label': "the edition's city key in the release",
    'faster': 'change below zero',
    'slower10': 'change above +10%',
    'histogram': 'whole points of the change, rounded down; every bin and both open tails hold at least 100 results',
}


def rows(db):
    """Every usable finish outside the R7 block with a 10 km text, and each usable edition's finishes (pandas frames)."""
    flags = ', '.join(f"'{f}'" for f in SPLIT_FLAGS)
    frame = db.execute(f"""SELECT f.edition_id, f.city, f.year, f.status_group = 'verified' AS verified, f.finish_s, {T10_SQL} AS t10,
          EXISTS (SELECT 1 FROM h.qa_flags q WHERE q.record_id = f.record_id AND q.flag IN ({flags})) AS flagged
        FROM hfin f JOIN h.race_records r ON r.id = f.record_id
        WHERE NOT f.r7_block AND r.split_10km IS NOT NULL
        ORDER BY f.edition_id, f.finish_s, t10, f.record_id""").df()
    usable = db.execute('SELECT edition_id, count(*) AS n FROM hfin WHERE NOT r7_block GROUP BY 1').df()
    return frame, dict(zip(usable.edition_id.astype(int), usable.n.astype(int)))


def change_of(finish, t10):
    """The measure, in the one order of operations the Node recount repeats (scripts/half/pacing.cjs)."""
    return ((finish - t10) / LAST_KM) / (t10 / FIRST_KM) - 1


def qualifying(finish, t10, flagged):
    """Which results qualify, and the funnel's counts (each step counts what the steps before it kept)."""
    parsed = ~np.isnan(t10)
    clean = parsed & ~flagged
    ordered = clean & (t10 > 0) & (t10 < finish)
    with np.errstate(divide='ignore', invalid='ignore'):
        first, last = t10 / FIRST_KM, (finish - t10) / LAST_KM
    lo, hi = PACE_S_PER_KM
    ok = ordered & (first >= lo) & (first <= hi) & (last >= lo) & (last <= hi)
    counts = {'with_10km_time': int(len(t10)), 'unparsed': int((~parsed).sum()), 'flagged': int((parsed & flagged).sum()),
              'out_of_order': int((clean & ~ordered).sum()), 'out_of_pace_bounds': int((ordered & ~ok).sum()), 'qualifying': int(ok.sum())}
    return ok, counts


def three(c) -> dict:
    """The three values of a group of changes."""
    c = np.asarray(c, float)
    return {'median': sh(np.median(c)), 'faster': sh((c < 0).mean()), 'slower10': sh((c > SLOWER).mean())}


def histogram(c):
    """Whole-point bins of the change with open tails, every bin and tail at least MIN_CELL: the widest run of bins of
    at least MIN_CELL around the median's bin, narrowed until each tail holds MIN_CELL. None when no such range holds
    the edges 0 and +10 points, which the two shares are restated at."""
    c = np.asarray(c, float)
    b = np.floor(c * 100).astype(np.int64)
    base = int(b.min())
    counts = np.bincount(b - base)
    get = lambda k: int(counts[k - base]) if 0 <= k - base < len(counts) else 0
    m = int(np.floor(np.median(c) * 100))
    if get(m) < MIN_CELL:
        return None
    lo, hi = m, m + 1
    while get(lo - 1) >= MIN_CELL:
        lo -= 1
    while get(hi) >= MIN_CELL:
        hi += 1
    under, over = int((b < lo).sum()), int((b >= hi).sum())
    while under < MIN_CELL and lo < hi:
        under += get(lo)
        lo += 1
    while over < MIN_CELL and lo < hi:
        hi -= 1
        over += get(hi)
    edge = int(round(SLOWER * 100))
    if not (lo <= 0 and hi >= edge):
        return None
    out = {'lo': lo, 'hi': hi, 'under_lo': under, 'at_or_over_hi': over, 'counts': [get(k) for k in range(lo, hi)]}
    # The shares restated from the bins must be the shares counted on the values (a value exactly on an edge would differ).
    faster = under + sum(out['counts'][:0 - lo])
    slower = over + sum(out['counts'][edge - lo:])
    if faster != int((c < 0).sum()) or slower != int((c > SLOWER).sum()):
        fail('half pacing: a change sits exactly on a bin edge, so the histogram cannot restate a share; decide the edge rule')
    return out


def group(c, editions, labels):
    """A shown group's values, or None under a floor: 100 results from 3 editions, and a histogram that holds the edges."""
    e, lab = len(np.unique(editions)), len(np.unique(labels))
    if len(c) < MIN_CELL or e < MIN_EDITIONS:
        return None
    hist = histogram(c)
    if hist is None:
        return None
    return {'n': int(len(c)), 'e': int(e), 'l': int(lab), **three(c), 'hist': hist}


def build(db) -> dict | None:
    """pacing.json, or None when the family is under a builder floor (it is then left out with its beat)."""
    frame, usable = rows(db)
    finish, t10 = frame.finish_s.to_numpy(float), frame.t10.to_numpy(float)
    edition = frame.edition_id.to_numpy(np.int64)
    ok, funnel = qualifying(finish, t10, frame.flagged.to_numpy(bool))
    with np.errstate(divide='ignore', invalid='ignore'):
        change_all = change_of(finish, t10)

    # The edition rule, then the screen.
    candidates, kept, removed = 0, [], []
    for eid in np.unique(edition[ok]):
        at = ok & (edition == eid)
        n = int(at.sum())
        if n < EDITION_MIN_RESULTS or n < EDITION_MIN_SHARE * usable[int(eid)]:
            continue
        candidates += 1
        med = float(np.median(change_all[at]))
        if SCREEN[0] <= med <= SCREEN[1]:
            kept.append(int(eid))
        else:
            first = frame[at].iloc[0]
            removed.append({'label': str(first.city), 'year': int(first.year), 'n': n, 'below': bool(med < SCREEN[0])})
    removed.sort(key=lambda x: (x['label'], x['year']))
    use = ok & np.isin(edition, kept)
    d = frame[use]
    c = change_all[use]
    ed, lab = d.edition_id.to_numpy(np.int64), d.city.astype(str).to_numpy()
    fin = d.finish_s.to_numpy(float)
    names, counts = np.unique(lab, return_counts=True)
    if len(kept) < FAMILY_MIN_EDITIONS or len(names) < FAMILY_MIN_LABELS or counts.max() > FAMILY_MAX_LABEL_SHARE * len(c):
        return None
    overall = group(c, ed, lab)
    if overall is None:
        return None

    # Editions weighted equally: each edition's own three values, unnamed.
    edition_rows = []
    for eid in kept:
        ce = c[ed == eid]
        edition_rows.append({'n': int(len(ce)), **three(ce)})
    edition_rows.sort(key=lambda x: (x['n'], x['median'], x['faster'], x['slower10']))
    med = lambda key, rows_: sh(np.median([x[key] for x in rows_]))
    editions_equal = {'editions': len(edition_rows), 'median': med('median', edition_rows), 'faster': med('faster', edition_rows),
                      'slower10': med('slower10', edition_rows), 'above_zero': sum(1 for x in edition_rows if x['median'] > 0)}

    # Labels weighted equally, and each label left out. A label's own values are shown only from 3 editions.
    label_rows, own = [], []
    for name in names:
        mine = lab == name
        cl, rest = c[mine], c[~mine]
        e = len(np.unique(ed[mine]))
        values = three(cl)
        own.append(values)
        shown = len(cl) >= MIN_CELL and e >= MIN_EDITIONS
        label_rows.append({'label': str(name), 'n': int(len(cl)), 'e': int(e), 'share': sh(len(cl) / len(c)),
                           'median': values['median'] if shown else None, 'faster': values['faster'] if shown else None,
                           'slower10': values['slower10'] if shown else None,
                           'without': {'median': sh(np.median(rest)), 'faster': sh((rest < 0).mean())}})
    label_rows.sort(key=lambda x: (-x['n'], x['label']))
    labels_equal = {'labels': len(own), 'median': med('median', own), 'faster': med('faster', own), 'slower10': med('slower10', own)}
    without = [x['without'] for x in label_rows]
    leave_label_out = {'median_min': min(x['median'] for x in without), 'median_max': max(x['median'] for x in without),
                       'faster_min': min(x['faster'] for x in without), 'faster_max': max(x['faster'] for x in without)}

    # Finish bands.
    bands = []
    for lo in range(BANDS_FROM_S, BANDS_TO_S, BAND_S):
        at = (fin >= lo) & (fin < lo + BAND_S)
        g = group(c[at], ed[at], lab[at]) if at.any() else None
        if g is not None and g['l'] >= MIN_BAND_LABELS:
            bands.append({'lo_s': lo, **g})

    verified = d.verified.to_numpy(bool)
    return {
        'family': 'half-pacing', 'schema_version': 1, 'scope': 'usable',
        'rule': RULE,
        'rules': {'first_km': FIRST_KM, 'last_km': LAST_KM, 'pace_s_per_km': list(PACE_S_PER_KM), 'edition_min_results': EDITION_MIN_RESULTS,
                  'edition_min_share': EDITION_MIN_SHARE, 'screen': list(SCREEN), 'slower': SLOWER, 'band_s': BAND_S,
                  'bands_from_s': BANDS_FROM_S, 'bands_to_s': BANDS_TO_S, 'min_band_labels': MIN_BAND_LABELS,
                  'family_min_editions': FAMILY_MIN_EDITIONS, 'family_min_labels': FAMILY_MIN_LABELS,
                  'family_max_label_share': FAMILY_MAX_LABEL_SHARE},
        'cohort': {'results': int(len(c)), 'editions': len(kept), 'labels': int(len(names)),
                   'usable_finishes': int(sum(usable[e] for e in kept)), 'funnel': funnel,
                   'verified': {'editions': int(len(np.unique(ed[verified]))), 'results': int(verified.sum())}},
        'screen': {'candidates': candidates, 'removed': removed},
        'overall': overall,
        'editions_equal': editions_equal,
        'labels_equal': labels_equal,
        'leave_label_out': leave_label_out,
        'labels': label_rows,
        'edition_rows': edition_rows,
        'bands': bands,
    }
