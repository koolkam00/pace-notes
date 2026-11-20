"""Shared cohort and helpers for the Top 100 charts (/charts).

analysis/build_charts.py loads the adopted release once through the verified marathon cohort (the same reader as the
stories, insights_data.read_finishes), wraps it in a ChartCohort and hands it to every chart builder in the charts_*.py
modules. A builder returns the raw numbers its takeaway reads (`values`), the chart spec (`plot`, lib/charts/spec.ts),
an optional table, its cohort size and a method line for /methodology. scripts/verify-charts.cjs recounts every chart
from the cohort. The finishes are in cohort order (by edition as the manifest lists them, then record id); `c.editions`
is the cohort manifest's list, which also names the editions that keep only an own-record view and hold no finish.

Rules every builder keeps (AGENTS.md): counts are finishes, not runners; a published group has at least 100 finishes;
shares are observed shares; associations only; linked records are candidates, not verified people; exact ages only in
granular-age editions; start-offset editions stay out of pacing-shape statistics; no halfway, goal or DNF claims;
weather is edition-level context (humidity withheld, wind a precise null).
"""
import copy
import json
import math
from pathlib import Path

import numpy as np

import insights_data
from insights_stats import MIN_CELL, SHARE_DIGITS, quantile, r

ROOT = Path(__file__).resolve().parents[1]
POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
MATS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish']
SECTIONS = ['0–5K', '5–10K', '10–15K', '15–20K', '20–25K', '25–30K', '30–35K', '35–40K', '40K–finish']
GENDER_GAP_EDITIONS = (('London', 2023), ('London', 2025), ('London', 2026), ('Berlin', 2024), ('Berlin', 2025), ('Chicago', 2024))
AGE_FLOOR_CITIES_YEARS = (('Berlin', 2023), ('Berlin', 2024), ('Berlin', 2025), ('Frankfurt', 2022), ('Vienna', 2022))

# The charts whose numbers follow linked records (the same runner in two or more races). Lead ruling D38 of the adoption
# plan (November 14, 2026, under ruling R6): each of them stores, beside its values, the same values counted with only
# high-confidence links keying a linked record (`high_links` in the chart's file; ChartCohort.high_links), recounted by
# its Node twin, for one table on /methodology. analysis/test_charts.py holds this list to the builders that read
# `c.profile`; scripts/verify-charts.cjs holds the published files to its twin of the list.
LINKED_CHARTS = (
    'slowdowns-run-in-streaks', 'same-race-warmer-return', 'most-records-appear-once', 'new-york-2021-returners',
    'place-in-the-field-sticks', 'quicker-every-time', 'quick-double-mostly-slower', 'just-over-3-then-next',
    'quicker-second-20k-again', 'quicker-finishes-more-repeatable', 'in-step-once-in-step-again', 'a-year-apart',
    'where-the-slow-day-happened', 'new-york-sped-up-at-25k', 'same-records-years-later', 'five-races-in-same-share',
    'every-new-york-in-the-data',
)

__all__ = ['ChartCohort', 'MIN_CELL', 'SHARE_DIGITS', 'quantile', 'r', 'share', 'sh', 'sec', 'POINTS', 'MATS', 'SECTIONS',
           'require_cell', 'median', 'edition_ranks', 'count_phrase', 'LINKED_CHARTS']


def require_cell(n, what):
    if int(n) < MIN_CELL:
        raise ValueError(f'{what}: {int(n)} finishes is under the {MIN_CELL}-finish threshold')
    return int(n)


def share(mask, within=None):
    """An observed share of finishes (exact, unrounded) and its denominator."""
    mask = np.asarray(mask, bool)
    if within is not None:
        within = np.asarray(within, bool)
        mask = mask & within
        d = int(within.sum())
    else:
        d = len(mask)
    return (float(mask.sum()) / d if d else math.nan), d


def sh(value):
    """A share (or a share-like ratio) as published: SHARE_DIGITS digits, so a page rounds it once."""
    return r(value, SHARE_DIGITS)


def sec(value, digits=1):
    """Seconds as published (one decimal unless asked)."""
    return r(value, digits)


def median(values):
    return quantile(values, 0.5)


def plural(noun):
    """An English plural for the charts' count nouns: 'es' after s, sh, ch, x and z ('finishes'), else 's'."""
    return f'{noun}es' if noun.endswith(('s', 'sh', 'ch', 'x', 'z')) else f'{noun}s'


def count_phrase(n, noun):
    """'15 editions', '1 finish', '2,345 finishes' or 'no finishes' for chart prose, so a printed count comes from the
    data. The charts' own pluraliser: insights_stats.count_phrase stays as it is, since other manifests bind its hash."""
    n = int(n)
    return f'no {plural(noun)}' if n == 0 else f'1 {noun}' if n == 1 else f'{n:,} {plural(noun)}'


def race_dates(c):
    """{(city, year): 'YYYY-MM-DD'}: each edition's race date from the weather evidence, and for an edition the evidence has
    no row for, the reviewed and cited date in analysis/reviewed-race-dates.json for the evidence's release (New York 2026
    in master-20261103b, November 5, 2026; in the combined release of November 13, 2026 also the counted editions of
    Austin, Los Angeles, Oklahoma City and Toronto Waterfront, which have no weather row). A reviewed date orders linked
    finishes only; it is never a weather row. The cohort manifest states the same dates for its editions, and
    scripts/charts/cohort.cjs holds the two together."""
    by = {(row['city'], row['year']): row.get('date') for row in c.weather['editions']}
    reviewed = json.loads((ROOT / 'analysis/reviewed-race-dates.json').read_text())['releases']
    for d in reviewed.get((c.weather.get('input') or {}).get('release_tag'), []):
        if not by.get((d['city'], d['year'])):
            by[(d['city'], d['year'])] = d['date']
    return by


def require_race_dates(c, undated_edition):
    """Every edition with finishes needs a race date to order a record's linked finishes. An edition without one (no
    weather row and no reviewed date) is allowed only while each of its finishes is the only finish of its record (no
    cross-race key), so it can never enter a linked order or pair; no date is filled in. `undated_edition` is a boolean
    per edition."""
    undated = np.flatnonzero(undated_edition & (c.ed_n > 0))
    if not len(undated):
        return
    ids, counts = np.unique(c.profile, return_counts=True)
    finishes_of = counts[np.searchsorted(ids, c.profile)]
    if (finishes_of[np.isin(c.edition, undated)] > 1).any():
        raise ValueError('An edition with finishes has no race date')


def high_link_profile(f):
    """`profile` when only high-confidence links key a linked record: the linked-record index of every finish if a
    link of the medium class did not join it to a runner (lead rulings R6 and D38). `f.link_high` says, per finish,
    that it has a runner key and its link is of tier high_elite or high (analysis/cohort.py); a keyed finish without it
    is linked at medium confidence and stands alone here, as a finish without a key does. Returns None when the
    finishes carry no link class (arrays built by hand).

    A finish that stands alone is numbered by its own record id, negated: a runner is named by the smallest record id
    of its key, which can be the very record that now stands alone, and the two must not meet."""
    high = getattr(f, 'link_high', None)
    if high is None:
        return None
    high, keyed = np.asarray(high, bool), np.asarray(f.keyed, bool)
    if (high & ~keyed).any():
        raise ValueError('A finish without a runner key carries a high link')
    runner = np.where(high | ~keyed, np.asarray(f.runner, np.int64), -np.asarray(f.record_id, np.int64))
    return np.unique(runner, return_inverse=True)[1].astype(np.asarray(f.profile).dtype)


def edition_ranks(values, edition):
    """Each finish's place within its edition as a fraction from 0 (lowest value) to 1 ((rank) / (n − 1)), ties by
    stable order. Used for "quarter of the field" charts; positions are clock ranks, not road positions."""
    values = np.asarray(values, float)
    out = np.full(len(values), np.nan)
    for e in np.unique(edition):
        idx = np.flatnonzero(edition == e)
        if len(idx) < 2:
            continue
        order = idx[np.argsort(values[idx], kind='stable')]
        out[order] = np.arange(len(idx)) / (len(idx) - 1)
    return out


class ChartCohort:
    """The eligible finishes with the derived arrays every chart reads (names follow the exploration lab)."""

    def __init__(self, f, manifest, manifest_sha, weather=None, geometry=None):
        self.f = f
        self.manifest = manifest
        self.manifest_sha = manifest_sha
        self.n = f.n
        for k in ('times', 'paces', 'finish', 'baseline', 'gender', 'age', 'exact_age', 'profile', 'edition', 'city', 'year'):
            setattr(self, k, getattr(f, k))
        self.editions = f.editions
        self.cities = f.cities
        # The same index with only high-confidence links keying a linked record (None without a link class); high_links()
        # gives the cohort that reads it as `profile`.
        self.profile_high = high_link_profile(f)
        self._high = None
        self.slow, self.onset = insights_data.sustained_slowdown(f)
        self.shape_keep, self.shape_audit = insights_data.start_offset_screen(f)
        self.granular_age_editions = insights_data.granular_age_editions(f)
        self.exact_age_ok = np.isin(f.edition, self.granular_age_editions) & np.isfinite(f.exact_age)
        E = len(self.editions)
        self.ed_city = np.array([e['city'] for e in self.editions])
        self.ed_year = np.array([e['year'] for e in self.editions])
        self.ed_race = np.array([e['race'] for e in self.editions])
        self.ed_n = np.bincount(f.edition, minlength=E)
        gap = {(c, y) for c, y in GENDER_GAP_EDITIONS}
        self.gender_gap_edition = np.array([(e['city'], e['year']) in gap for e in self.editions])
        self.weather = weather
        self.ed_temp_c = self.ed_dew_c = self.ed_wind = self.ed_warming = np.full(E, np.nan)
        self.ed_date = np.array([''] * E, dtype=object)
        self.ed_start = np.array([''] * E, dtype=object)
        if weather is not None:
            by = {(row['city'], row['year']): row for row in weather['editions']}
            def col(key):
                return np.array([float(by[(e['city'], e['year'])][key]) if (e['city'], e['year']) in by and by[(e['city'], e['year'])].get(key) is not None
                                 else np.nan for e in self.editions])
            self.ed_temp_c, self.ed_dew_c, self.ed_wind, self.ed_warming = col('temp_c'), col('dewpoint_c'), col('wind_mps'), col('warming_c')
        self.course_gain = {c['city']: c.get('gain_m') for c in (geometry or {}).get('courses', [])}
        self.course_loss = {c['city']: c.get('loss_m') for c in (geometry or {}).get('courses', [])}

    def high_links(self):
        """This cohort with `profile` keyed by high-confidence links only: every array is shared, so a builder run on it
        gives the chart's numbers on high links alone. The view is kept, so the caches the modules key by cohort stay
        apart for the two readings."""
        if self.profile_high is None:
            raise ValueError('The finishes carry no link class, so there is no reading on high links alone')
        if self._high is None:
            view = copy.copy(self)
            view.profile, view.profile_high, view._high = self.profile_high, None, None
            self._high = view
        return self._high

    # A few names the builders use often.
    def mask_city(self, city):
        return self.city == self.cities.index(city)

    def label(self, e):
        ed = self.editions[e]
        return f"{ed['city']} {ed['year']}"


def load_weather():
    path = ROOT / 'public/data/weather/evidence.json'
    data = json.loads(path.read_text())
    pin = json.loads((ROOT / 'analysis/weather-release.json').read_text())
    if data['input']['release_tag'] != pin['tag']:
        raise ValueError('Weather evidence does not match its release pin')
    return data


def load_geometry():
    path = ROOT / 'public/data/insights/course-geometry.json'
    return json.loads(path.read_text()) if path.exists() else None
