"""Shared cohort and helpers for the Top 100 charts (/charts).

analysis/build_charts.py loads the adopted release once through the verified runner shards (the same reader as the
stories), wraps it in a ChartCohort and hands it to every chart builder in the charts_*.py modules. A builder returns
the raw numbers its takeaway reads (`values`), the chart spec (`plot`, lib/charts/spec.ts), an optional table, its
cohort size and a method line for /methodology. scripts/verify-charts.cjs recounts every chart from the shards.

Rules every builder keeps (AGENTS.md): counts are finishes, not runners; a published group has at least 100 finishes;
shares are observed shares; associations only; linked records are candidates, not verified people; exact ages only in
granular-age editions; start-offset editions stay out of pacing-shape statistics; no halfway, goal or DNF claims;
weather is edition-level context (humidity withheld, wind a precise null).
"""
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

__all__ = ['ChartCohort', 'MIN_CELL', 'SHARE_DIGITS', 'quantile', 'r', 'share', 'sh', 'sec', 'POINTS', 'MATS', 'SECTIONS',
           'require_cell', 'median', 'edition_ranks', 'count_phrase']


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


def count_phrase(n, noun):
    from insights_stats import count_phrase as phrase
    return phrase(n, noun)


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
