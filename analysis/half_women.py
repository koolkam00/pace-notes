"""women.json (verified): women's share by finish time, and the same city's half and marathon (spec 2.3, /half beats 3
and 4).

Bands: the median over a fixed set of verified editions (at least 2,000 finishes, at most 2% unrecorded sex, at least
100 recorded finishes in every band) of each edition's women's share of recorded finishes, every edition counting once
(the marathon chart's rule, charts/womens-share-by-finish-time.json). Rows are published unnamed.

Same city, same year: a half edition (use_finish and use_sex, at least 1,000 finishes and 100 recorded women's and
men's) under a reviewed label of the marathon city (analysis/half_quality.py SAME_CITY_LABELS), paired with that city's
eligible marathon of the same year under the charts' gender rule (not a gender-gap edition, at most 2% unrecorded, at
least 80% of raw records kept, at least 1,000 finishes and 100 of each sex). Where one city-year has two half labels,
the pair uses the larger edition. Shares are of recorded women's and men's finishes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

from charts_common import GENDER_GAP_EDITIONS  # noqa: E402
from half_common import MIN_CELL, ROOT, fail, file_sha256, sh  # noqa: E402

BANDS = [(0, 5400, 'Under 1:30'), (5400, 6300, '1:30'), (6300, 7200, '1:45'), (7200, 8100, '2:00'), (8100, 9000, '2:15'),
         (9000, 9900, '2:30'), (9900, 10800, '2:45'), (10800, None, '3:00+')]
BAND_RULE = {'min_finishes': 2000, 'max_unrecorded': 0.02, 'min_recorded_per_band': 100}
MIN_BAND_EDITIONS = 20
MARATHON_FILE = 'charts/womens-share-by-finish-time.json'
PAIR_HALF = {'min_finishes': 1000, 'min_per_sex': 100}
PAIR_MARATHON = {'max_unrecorded': 0.02, 'min_kept_of_raw': 0.8, 'min_finishes': 1000, 'min_per_sex': 100}
RULE = {'half': 'use_sex, >=1,000 finishes, >=100 recorded women and men',
        'marathon': 'not a gender-gap edition, <=2% unrecorded, >=80% of raw records kept, >=1,000 finishes, >=100 of each sex'}


def band_index(seconds):
    edges = np.array([b[0] for b in BANDS[1:]], float)
    return np.searchsorted(edges, seconds, side='right')


def bands(verified):
    """Per-edition recorded and women's counts in each band, for the editions that pass the band rule."""
    rows = []
    for _, d in verified.groupby('edition_id', sort=True):
        if len(d) < BAND_RULE['min_finishes']:
            continue
        recorded = d.sex.isin(['F', 'M']).to_numpy()
        if 1 - recorded.mean() > BAND_RULE['max_unrecorded']:
            continue
        k = d[recorded]
        idx = band_index(k.finish_s.to_numpy(float))
        n = np.bincount(idx, minlength=len(BANDS))
        f = np.bincount(idx[(k.sex == 'F').to_numpy()], minlength=len(BANDS))
        if n.min() < BAND_RULE['min_recorded_per_band']:
            continue
        rows.append({'n': [int(v) for v in n], 'F': [int(v) for v in f]})
    rows.sort(key=lambda row: (-sum(row['n']), row['n'], row['F']))
    return rows


def crossing(shares):
    """The start of the first band from which every median share is over one half, or None."""
    for j in range(len(shares)):
        if all(s > 0.5 for s in shares[j:]) and (j == 0 or shares[j - 1] <= 0.5):
            return BANDS[j][0]
    return None


def marathon_counts(marathons):
    """Per city-year of the eligible marathon: finishes, recorded women's and men's, raw records, and the sex rule."""
    gap = set(GENDER_GAP_EDITIONS)
    out = {}
    for e in np.unique(marathons.edition):
        sel = marathons.edition == e
        g = marathons.gender[sel]
        ed = marathons.editions[e]
        n, nf, nm, raw = int(sel.sum()), int((g == 2).sum()), int((g == 1).sum()), int(marathons.raw_by_edition[e])
        ok = ((ed['city'], ed['year']) not in gap and 1 - (nf + nm) / n <= PAIR_MARATHON['max_unrecorded']
              and n >= PAIR_MARATHON['min_kept_of_raw'] * raw and n >= PAIR_MARATHON['min_finishes']
              and nf >= PAIR_MARATHON['min_per_sex'] and nm >= PAIR_MARATHON['min_per_sex'])
        out[(ed['city'], int(ed['year']))] = {'n': n, 'F': nf, 'M': nm, 'ok': ok}
    return out


def same_city(fin, editions, marathons, labels, verified_only):
    """The same-city, same-year pairs of one scope."""
    label_city = {label: city for city, ls in labels.items() for label in ls}
    eds = editions[editions.use_finish & editions.use_sex & editions.city.isin(label_city)][['edition_id', 'city', 'year', 'status_group']]
    if verified_only:
        eds = eds[eds.status_group == 'verified']
    sub = fin[fin.edition_id.isin(set(eds.edition_id.astype(int)))]
    counts = sub.groupby('edition_id').agg(n=('finish_s', 'size'), F=('sex', lambda s: int((s == 'F').sum())), M=('sex', lambda s: int((s == 'M').sum())))
    half = {}
    for r in eds.itertuples(index=False):
        c = counts.loc[int(r.edition_id)]
        n, nf, nm = int(c.n), int(c.F), int(c.M)
        if n < PAIR_HALF['min_finishes'] or nf < PAIR_HALF['min_per_sex'] or nm < PAIR_HALF['min_per_sex']:
            continue
        key = (label_city[r.city], int(r.year))
        if key not in half or (n, -int(r.edition_id)) > (half[key]['n'], -half[key]['edition_id']):
            half[key] = {'n': n, 'F': nf, 'M': nm, 'edition_id': int(r.edition_id)}
    mar = marathon_counts(marathons)
    pairs = []
    for (city, year), h in sorted(half.items()):
        m = mar.get((city, year))
        if not m or not m['ok']:
            continue
        pairs.append({'city': city, 'year': year, 'half': {k: h[k] for k in ('n', 'F', 'M')}, 'marathon': {k: m[k] for k in ('n', 'F', 'M')}})
    return pairs


def women_share(c):
    return c['F'] / (c['F'] + c['M'])


def summarize(pairs):
    hs = np.array([women_share(p['half']) for p in pairs])
    ms = np.array([women_share(p['marathon']) for p in pairs])
    d = 100 * (hs - ms)
    return {'pairs': len(pairs), 'cities': len({p['city'] for p in pairs}), 'half_higher': int((d > 0).sum()),
            'half_median': sh(np.median(hs)), 'marathon_median': sh(np.median(ms)), 'diff_median_points': sh(np.median(d)),
            'diff_min_points': sh(d.min()), 'diff_max_points': sh(d.max())}


def build(fin, editions, marathons, labels) -> dict:
    verified = fin[fin.verified.to_numpy()]
    rows = bands(verified)
    if len(rows) < MIN_BAND_EDITIONS:
        fail(f'women: {len(rows)} band editions, under {MIN_BAND_EDITIONS}')
    shares = [float(np.median([row['F'][j] / row['n'][j] for row in rows])) for j in range(len(BANDS))]
    chart = json.loads((ROOT / 'public' / 'data' / MARATHON_FILE).read_text())
    pairs = same_city(fin, editions, marathons, labels, verified_only=True)
    every = same_city(fin, editions, marathons, labels, verified_only=False)
    for p in pairs + every:
        if min(p['half']['n'], p['marathon']['n']) < 1000:
            fail('women: a same-city pair names an edition under 1,000 finishes')
    cities = {}
    for p in pairs:
        cities.setdefault(p['city'], []).append(p)
    city_rows = [{'city': c, 'pairs': len(ps), 'half': sh(np.mean([women_share(p['half']) for p in ps])),
                  'marathon': sh(np.mean([women_share(p['marathon']) for p in ps]))} for c, ps in cities.items()]
    city_rows.sort(key=lambda c: (-c['half'], c['city']))
    every_summary = summarize(every)
    return {
        'schema_version': 1, 'family': 'half-women', 'scope': 'verified',
        'bands': [{'lo_s': lo, 'hi_s': hi, 'label': label} for lo, hi, label in BANDS],
        'band_rule': BAND_RULE,
        'band_editions': rows,
        'median_share': [sh(s) for s in shares],
        'cross_s': crossing(shares),
        'marathon': {'file': MARATHON_FILE, 'sha256': file_sha256(ROOT / 'public' / 'data' / MARATHON_FILE),
                     'cross_s': int(chart['values']['cross']), 'sub3': chart['values']['sub3']},
        'same_city': {
            'rule': RULE,
            'pairs': pairs,
            'cities': city_rows,
            'summary': summarize(pairs),
            'all_scope_check': {k: every_summary[k] for k in ('pairs', 'cities', 'half_higher', 'diff_median_points')},
        },
    }
