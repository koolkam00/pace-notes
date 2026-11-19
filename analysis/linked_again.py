"""Who is recorded again: a descriptive table beside the matched comparison (docs/LINKED_RECORDS.md, "Who is recorded
again"; defined on 2026-11-14 before any build of it on real data).

The finishes are those of analysis/linked_return.py before matching: timing-eligible finishes of linked runners in
counted editions of 2010 to 2019 with a recorded sex. "Recorded again within two years" is that module's "seen again":
a kept result of the same linked runner in the finish-time universe in one of the next two calendar years.

A share of finishes whose runner is recorded again is a floor that depends on which races the records hold and how well
each can be linked, so no row is a plain share. Every group (a finish band, an age band) is read inside its own
editions: its share against the share of the other finishes of the same editions, weighted as the group is spread over
them. An edition counts for a group only when its other finishes number at least `MIN_OTHERS`. The interval resamples
the group's editions whole. Five variants repeat the calculation: verified tiers, high links, recorded again at the same
race only, men only and women only. A row has a verdict only when the difference is at least `MARGIN_POINTS`, its
interval is clear of zero and all five variants exist and share its sign.

The sexes are not compared with each other: the links join records by name, so a changed surname breaks a link, and the
records cannot tell that from a difference between the sexes. The age of a finish comes from its own record's exact
birth year, never from the runner's other results (that would pick out runners who have another record).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import linked_common as lc
import linked_histories
import linked_return
from linked_common import MIN_CELL, MIN_EDITIONS, SEED, fail, num, sh

YEARS = linked_return.YEARS                  # the matched comparison's editions ...
WITHIN_YEARS = linked_return.WITHIN_YEARS    # ... and its window
BAND_SECONDS = linked_return.BAND_SECONDS
MARGIN_POINTS = 1.0     # a row is said to be recorded again more or less often only from one point
MIN_OTHERS = 100        # other finishes of an edition for the edition to count in a row
FIRST_BAND, LAST_BAND = 9000, 23400          # under 2:30 is one row, 6:30 and over another
FINISH_BANDS = ((None, FIRST_BAND),) + tuple((s, s + BAND_SECONDS) for s in range(FIRST_BAND, LAST_BAND, BAND_SECONDS)) + ((LAST_BAND, None),)
FINISH_GROUPS = linked_return.FINISH_BANDS   # under 3:30, 3:30 to 3:59, 4:00 to 4:29, 4:30 to 4:59, 5:00 and over
AGE_BANDS = linked_histories.AGE_BANDS
VARIANTS = ('verified', 'high', 'same_race', 'men', 'women')
TABLES = ('by_finish_band', 'by_finish', 'by_age_band')


def band_of(values: np.ndarray, bands) -> np.ndarray:
    """Index into `bands` ((from, to) pairs, from included, to excluded, None open) per value; -1 outside every band."""
    out = np.full(len(values), -1, dtype=np.int64)
    for i, (lo, hi) in enumerate(bands):
        out[(values >= (-np.inf if lo is None else lo)) & (values < (np.inf if hi is None else hi))] = i
    return out


def age_band_of(age: np.ndarray) -> np.ndarray:
    """Index into AGE_BANDS (both ends included) per whole age; -1 outside 18 to 85."""
    return band_of(age, tuple((lo, hi + 1) for lo, hi in AGE_BANDS))


def finishes(results: pd.DataFrame, race: np.ndarray) -> pd.DataFrame:
    """One row per finish of the table: its edition, sex, finish, the age its own record gives (-1 when none), and whether
    its runner is recorded again within the window, at any race and at the same race. `results` is sorted by runner and
    year (every builder's order) and is the universe at hand: the later results that count are its own."""
    r = results
    if len(r) == 0:
        return pd.DataFrame({'edition': np.zeros(0, dtype=np.int64), 'sex': np.zeros(0, dtype=np.int8), 'fin': np.zeros(0), 'age': np.zeros(0, dtype=np.int64),
                             'back': np.zeros(0, dtype=bool), 'back_same': np.zeros(0, dtype=bool)})
    person, year = r.person.to_numpy(), r.year.to_numpy().astype(np.int64)
    nxt = linked_return.next_year(person, r.year.to_numpy())
    back = (nxt > 0) & (nxt <= year + WITHIN_YEARS)
    # the same at the runner's own race: the next later year with a result of the same runner at the same race
    here = race[r.edition.to_numpy()].astype(np.int64)
    key = person.astype(np.int64) * (int(race.max()) + 1) + here
    order = np.lexsort((year, key))
    nxt_same = np.zeros(len(r), dtype=np.int64)
    nxt_same[order] = linked_return.next_year(key[order], year[order])
    back_same = (nxt_same > 0) & (nxt_same <= year + WITHIN_YEARS)
    yob = r.exact_yob.to_numpy().astype(np.int64)
    age = np.where(yob >= 0, year - yob, -1)
    age[(age < lc.AGE_RANGE[0]) | (age > lc.AGE_RANGE[1])] = -1
    use = r.eligible.to_numpy() & (year >= YEARS[0]) & (year <= YEARS[1]) & (r.sex.to_numpy() > 0)
    return pd.DataFrame({'edition': r.edition.to_numpy()[use].astype(np.int64), 'sex': r.sex.to_numpy()[use], 'fin': r.fin.to_numpy()[use],
                         'age': age[use], 'back': back[use], 'back_same': back_same[use]})


def inside_editions(edition: np.ndarray, group: np.ndarray, back: np.ndarray, n_groups: int) -> list:
    """Per group: the editions that count for it (codes), and there its finishes n, those recorded again x, and the share
    q among the edition's other finishes. `group` is -1 for a finish outside every group: it takes no part, not even as
    another finish of its edition."""
    keep = group >= 0
    codes, ei = np.unique(edition[keep], return_inverse=True)
    n = np.zeros((len(codes), n_groups))
    x = np.zeros((len(codes), n_groups))
    np.add.at(n, (ei, group[keep]), 1.0)
    np.add.at(x, (ei, group[keep]), back[keep].astype(float))
    total_n, total_x = n.sum(axis=1), x.sum(axis=1)
    out = []
    for g in range(n_groups):
        others_n, others_x = total_n - n[:, g], total_x - x[:, g]
        counts = (n[:, g] > 0) & (others_n >= MIN_OTHERS)
        out.append({'editions': codes[counts], 'n': n[counts, g], 'x': x[counts, g], 'q': others_x[counts] / others_n[counts]})
    return out


def difference(part: dict) -> tuple[float, float, float]:
    """(share, expected share, difference in points) of one group over its editions."""
    total = part['n'].sum()
    share, expected = part['x'].sum() / total, (part['n'] * part['q']).sum() / total
    return float(share), float(expected), float(100.0 * (share - expected))


def interval(part: dict, reps: int, seed) -> tuple[float, float]:
    """The 2.5th and 97.5th percentile of the difference when the group's editions are resampled whole."""
    k = len(part['n'])
    rng = np.random.default_rng(seed)
    w = rng.multinomial(k, np.full(k, 1.0 / k), size=reps).astype(float)
    draws = 100.0 * (w @ (part['x'] - part['n'] * part['q'])) / (w @ part['n'])
    return float(np.percentile(draws, 2.5)), float(np.percentile(draws, 97.5))


def row_verdict(row: dict) -> str | None:
    """more_often or less_often (than the other finishes of the same editions) only at one point or more, with the
    interval clear of zero and every one of the five variants there and on the same side."""
    variants = [row[name] for name in VARIANTS]
    if any(v is None for v in variants):
        return None
    d = row['difference_points']
    if d >= MARGIN_POINTS and row['lo_points'] > 0 and all(v['difference_points'] > 0 for v in variants):
        return 'more_often'
    if d <= -MARGIN_POINTS and row['hi_points'] < 0 and all(v['difference_points'] < 0 for v in variants):
        return 'less_often'
    return None


def published(part: dict) -> bool:
    return part['n'].sum() >= MIN_CELL and len(part['n']) >= MIN_EDITIONS


def table(frames: dict, group_of, bounds: list, field: pd.DataFrame | None, reps: int, seed: int, table_id: int) -> list:
    """The rows of one table. `frames`: the finishes of each universe (F, verified, high); `group_of(frame)` gives the group
    index per finish; `bounds` the published bounds of each group; `field`: every timing-eligible finish by edition and
    group (edition, group, n), linked or not."""
    f = frames['F']
    group = group_of(f)
    main = inside_editions(f.edition.to_numpy(), group, f.back.to_numpy(), len(bounds))
    parts = {
        'verified': inside_editions(frames['verified'].edition.to_numpy(), group_of(frames['verified']), frames['verified'].back.to_numpy(), len(bounds)),
        'high': inside_editions(frames['high'].edition.to_numpy(), group_of(frames['high']), frames['high'].back.to_numpy(), len(bounds)),
        'same_race': inside_editions(f.edition.to_numpy(), group, f.back_same.to_numpy(), len(bounds)),
    }
    for name, sex in (('men', 1), ('women', 2)):
        m = f.sex.to_numpy() == sex
        parts[name] = inside_editions(f.edition.to_numpy()[m], group[m], f.back.to_numpy()[m], len(bounds))
    rows = []
    for g, bound in enumerate(bounds):
        part = main[g]
        if not published(part):
            continue
        share, expected, diff = difference(part)
        lo, hi = interval(part, reps, [seed, table_id, g])
        row = {**bound, 'finishes': int(part['n'].sum()), 'recorded_again': int(part['x'].sum()), 'editions': int(len(part['n'])),
               'share': sh(share), 'expected_share': sh(expected), 'difference_points': num(diff, 3), 'lo_points': num(lo, 3), 'hi_points': num(hi, 3)}
        if field is not None:
            mine = field[(field.group == g) & field.edition.isin(part['editions'])]
            row['all_finishes'] = int(mine.n.sum())
            if row['all_finishes'] < row['finishes']:
                fail('a recorded-again row holds more linked finishes than the editions hold finishes in its band')
        for name in VARIANTS:
            vp = parts[name][g]
            row[name] = {'finishes': int(vp['n'].sum()), 'editions': int(len(vp['n'])), 'difference_points': num(difference(vp)[2], 3)} if published(vp) else None
        row['verdict'] = row_verdict(row)
        rows.append(row)
    return rows


def cohort_of(frame: pd.DataFrame) -> dict:
    return {'finishes': int(len(frame)), 'recorded_again': int(frame.back.sum()), 'editions': int(frame.edition.nunique()),
            'share': sh(frame.back.mean()) if len(frame) else None}


def build(results: pd.DataFrame, editions: pd.DataFrame, masks: dict, field_bands: pd.DataFrame | None, field_ages: pd.DataFrame | None, *,
          reps: int = lc.BOOT_REPS, seed: int = SEED) -> dict | None:
    """recorded_again.json, or None when the finishes are under the floors or no row can be published. `editions` carries
    `race` (the race code of every edition); `field_bands` (edition, band, n) and `field_ages` (edition, age, n) count
    every timing-eligible finish with a recorded sex of the counted editions, linked or not."""
    race = editions.sort_values('code').race.to_numpy()
    frames = {name: finishes(results[masks[name]], race) for name in ('F', 'verified', 'high')}
    f = frames['F']
    if len(f) < MIN_CELL or f.edition.nunique() < MIN_EDITIONS:
        return None
    aged = {name: frame[frame.age >= 0] for name, frame in frames.items()}

    def field_of(table: pd.DataFrame | None, column: str, to_group) -> pd.DataFrame | None:
        if table is None:
            return None
        g = to_group(table[column].to_numpy())
        out = pd.DataFrame({'edition': table.edition.to_numpy()[g >= 0], 'group': g[g >= 0], 'n': table.n.to_numpy()[g >= 0]})
        return out.groupby(['edition', 'group'], as_index=False).n.sum()
    seconds = None if field_bands is None else field_bands.assign(fin=field_bands.band.to_numpy() * float(BAND_SECONDS))
    out = {
        'years': list(YEARS), 'within_years': WITHIN_YEARS, 'band_seconds': BAND_SECONDS, 'margin_points': MARGIN_POINTS, 'min_finishes': MIN_CELL,
        'min_editions': MIN_EDITIONS, 'min_others': MIN_OTHERS, 'bootstrap_draws': int(reps),
        'cohort': cohort_of(f), 'age_cohort': cohort_of(aged['F']),
        'by_finish_band': table(frames, lambda fr: band_of(fr.fin.to_numpy(), FINISH_BANDS), [{'finish_from_s': lo, 'finish_to_s': hi} for lo, hi in FINISH_BANDS],
                                field_of(seconds, 'fin', lambda v: band_of(v, FINISH_BANDS)), reps, seed, 0),
        'by_finish': table(frames, lambda fr: band_of(fr.fin.to_numpy(), FINISH_GROUPS), [{'finish_from_s': lo, 'finish_to_s': hi} for lo, hi in FINISH_GROUPS],
                           field_of(seconds, 'fin', lambda v: band_of(v, FINISH_GROUPS)), reps, seed, 1),
        'by_age_band': table(aged, lambda fr: age_band_of(fr.age.to_numpy()), [{'age_from': lo, 'age_to': hi} for lo, hi in AGE_BANDS],
                             field_of(field_ages, 'age', age_band_of), reps, seed, 2),
    }
    if not any(out[name] for name in TABLES):
        return None
    return out


__all__ = ['build', 'finishes', 'inside_editions', 'difference', 'interval', 'row_verdict', 'band_of', 'age_band_of']
