"""Fast years and slow years, and the same linked runners at different races (docs/LINKED_RECORDS.md, sections 3 and 4).

Both read one fit of the pair model (analysis/linked_model.py) on the finish-time universe F:

- **An edition reading** (editions.json): the edition's reading minus the mean reading of the race's other fitted
  editions on the same timing basis, as a percent of the finish time, with the 2.5th and 97.5th percentiles of the
  runner bootstrap. It is published for a race and timing basis with at least three such editions; an edition more
  than 6% from the median of its race and basis is held for review and enters nothing.
- **A race reading** (races.json): the level of the race's chip- or net-timed fitted editions (at least three) once
  the level every race shares in a calendar year is taken out (a least-squares split of the edition readings into a
  race level and a year level, every edition counting once), so a race is read against the other races of the same
  years. Its 95% interval comes from the spread of its editions around that level (Student's t); the same level has a
  runner-bootstrap interval; and the order term gives the reading when the race was the earlier and the later of a
  pair.
- **The checks** (checks.json), recomputed on every build: the relation, inside a race, of the edition readings to the
  race-window temperature and to the whole field's sustained-slowdown share (neither enters the fit), and the same fit
  on verified tiers only, on high links only and on the wider set with unverified editions.

Verdicts are computed here and recomputed by scripts/verify-linked.cjs from the published numbers.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

import linked_common as lc
import linked_model
from linked_common import MIN_CELL, MIN_EDITIONS, fail, log_pct, num, pct

TEMP_BANDS = ((None, 8.0), (8.0, 12.0), (12.0, 16.0), (16.0, 20.0), (20.0, None))   # race-window mean temperature, °C
FIELD_MIN_ELIGIBLE = 1000      # timing-eligible finishes of a counted edition in the whole-field check
FIELD_MIN_SHARE = 0.5          # ... and at least this share of the edition's finishes
FIELD_MIN_EDITIONS = 4         # such editions per race and timing basis
BEYOND = (2.0, 3.0)
VARIANTS = ('verified', 'high', 'wider')


# ---------------------------------------------------------------------------------------------------------------
# From a fit to readings
# ---------------------------------------------------------------------------------------------------------------
def fit_universe(results: pd.DataFrame, editions: pd.DataFrame, mask, *, boot: int = 0, keep_pairs: bool = False):
    """Fit the pair model on the results `mask` keeps. `editions` is indexed by edition code and carries `race`."""
    part = results[mask]
    return linked_model.fit(part.person.to_numpy(), part.edition.to_numpy(), editions.race.to_numpy(), part.year.to_numpy(),
                            np.log(part.fin.to_numpy()), boot=boot, keep_pairs=keep_pairs)


def unit_table(fit, editions: pd.DataFrame) -> pd.DataFrame:
    """One row per fitted edition, in the order of the edition codes."""
    t = editions.loc[fit.units, ['label', 'year', 'tier', 'timing', 'basis', 'race']].reset_index(drop=True)
    t['code'] = fit.units
    t['beta'] = fit.beta
    t['finishes'] = fit.runners
    t['pos'] = np.arange(len(t))
    return t


def held_outliers(t: pd.DataFrame) -> np.ndarray:
    """True for an edition more than OUTLIER_PCT from the median reading of its race and timing basis (three or more)."""
    held = np.zeros(len(t), dtype=bool)
    for _, g in t[t.basis.notna()].groupby(['label', 'basis'], sort=True):
        if len(g) >= MIN_EDITIONS:
            median = float(np.median(g.beta.to_numpy()))
            far = np.abs(100.0 * np.expm1(g.beta.to_numpy() - median)) > lc.OUTLIER_PCT
            held[g.pos.to_numpy()[far]] = True
    return held


def comparison_groups(t: pd.DataFrame, exclude_codes=frozenset(), min_editions: int = MIN_EDITIONS) -> dict:
    """(label, basis) -> positions (in year order) of the fitted editions that are compared with one another."""
    out = {}
    usable = t[t.basis.notna() & ~t.code.isin(list(exclude_codes))]
    for key, g in usable.groupby(['label', 'basis'], sort=True):
        if len(g) >= min_editions:
            out[key] = g.sort_values('year').pos.to_numpy()
    return out


def against_others(values: np.ndarray) -> np.ndarray:
    """Each value minus the mean of the others (last axis)."""
    n = values.shape[-1]
    return (n * values - values.sum(axis=-1, keepdims=True)) / (n - 1)


class TwoWay:
    """The edition readings split into a level per race and timing basis and a level per calendar year, by least squares
    with every edition counting once. The year levels have pair-weighted mean zero over the editions used. Only the
    largest set of groups and years that the editions tie together is used."""

    def __init__(self, t: pd.DataFrame, weight: np.ndarray, exclude_codes=frozenset()):
        usable = t[t.basis.notna() & ~t.code.isin(list(exclude_codes))]
        keys = list(zip(usable.label, usable.basis))
        years = usable.year.to_numpy()
        # the largest connected set of (group, year)
        parent = {}

        def find(x):
            while parent.setdefault(x, x) != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for key, year in zip(keys, years.tolist()):
            a, b = find(('g', key)), find(('y', year))
            if a != b:
                parent[max(a, b)] = min(a, b)
        roots = [find(('g', key)) for key in keys]
        sizes = pd.Series(roots).value_counts()
        main = sorted(sizes[sizes == sizes.max()].index)[0]
        keep = np.array([r == main for r in roots], dtype=bool)
        usable = usable[keep]
        self.pos = usable.pos.to_numpy()
        self.groups = sorted(set(zip(usable.label, usable.basis)))
        self.years = sorted(set(usable.year.tolist()))
        gi = {g: i for i, g in enumerate(self.groups)}
        yi = {y: i for i, y in enumerate(self.years)}
        self.g = np.array([gi[k] for k in zip(usable.label, usable.basis)], dtype=np.int64)
        self.y = np.array([yi[y] for y in usable.year.tolist()], dtype=np.int64)
        n, G, Y = len(usable), len(self.groups), len(self.years)
        X = np.zeros((n, G + Y))
        X[np.arange(n), self.g] = 1.0
        X[np.arange(n), G + self.y] = 1.0
        if np.linalg.matrix_rank(X) != G + Y - 1:
            fail('the race and year levels are not determined by the fitted editions')
        self.solver = np.linalg.pinv(X)
        self.w = weight[self.pos]
        self.G = G

    def split(self, beta: np.ndarray):
        """(race levels, year levels, residuals) for readings `beta` (..., fitted units); the last axis is the unit."""
        b = beta[..., self.pos]
        theta = b @ self.solver.T
        rho, tau = theta[..., :self.G], theta[..., self.G:]
        shift = (tau[..., self.y] * self.w).sum(axis=-1, keepdims=True) / self.w.sum()
        rho, tau = rho + shift, tau - shift
        return rho, tau, b - rho[..., self.g] - tau[..., self.y]


def year_verdict(lo: float, hi: float, high: float | None) -> str | None:
    """fast or slow only when the interval clears the margin (and the high-links reading, where there is one, has the
    same sign); usual only when the whole interval lies inside the margin; else no verdict."""
    m = lc.YEAR_MARGIN_PCT
    if lo > m and (high is None or high > 0):
        return 'slow'
    if hi < -m and (high is None or high < 0):
        return 'fast'
    if lo > -m and hi < m:
        return 'usual'
    return None


def race_verdict(r: dict) -> str | None:
    """faster or slower only when both intervals exclude zero on the reading's side, the earlier and later readings
    share its sign and every variant that exists (verified tiers, high links) shares it; about the same only when both
    intervals and the earlier and later readings lie inside the band; else no verdict."""
    variants = [v['reading_pct'] for k, v in r['variants'].items() if k in ('verified', 'high') and v is not None]
    for sign, word in ((-1, 'faster'), (1, 'slower')):
        if all(sign * x > 0 for x in (r['reading_pct'], r['earlier_pct'], r['later_pct'], *variants)) \
                and (r['hi_pct'] < 0 if sign < 0 else r['lo_pct'] > 0) and (r['boot_hi_pct'] < 0 if sign < 0 else r['boot_lo_pct'] > 0):
            return word
    b = lc.RACE_BAND_PCT
    if all(-b < x < b for x in (r['lo_pct'], r['hi_pct'], r['boot_lo_pct'], r['boot_hi_pct'], r['earlier_pct'], r['later_pct'])):
        return 'about_the_same'
    return None


def align(variant_t: pd.DataFrame, main_t: pd.DataFrame, main_weight: np.ndarray) -> np.ndarray:
    """The variant's readings on the main fit's two rules: over the editions both fits hold, weighted by the main fit's
    pair weights, the two sets of readings have the same mean and the same trend over the years."""
    common = variant_t.merge(main_t[['code', 'beta', 'pos']], on='code', suffixes=('', '_main'))
    if len(common) < MIN_EDITIONS:
        fail('a variant fit shares too few editions with the main fit')
    w = main_weight[common.pos_main.to_numpy()]
    diff = (common.beta - common.beta_main).to_numpy()
    year = common.year.to_numpy(float)
    yc = year - (year * w).sum() / w.sum()
    level = (diff * w).sum() / w.sum()
    slope = ((diff - level) * yc * w).sum() / (yc * yc * w).sum() if (yc * yc * w).sum() > 0 else 0.0
    centre = (year * w).sum() / w.sum()
    return variant_t.beta.to_numpy() - level - slope * (variant_t.year.to_numpy(float) - centre)


def within_relation(frame: pd.DataFrame, x: str, y: str, min_editions: int) -> dict | None:
    """Correlation and slope of y on x after removing each (label, basis) mean, over groups of at least `min_editions`."""
    xs, ys, races = [], [], 0
    for _, g in frame.groupby(['label', 'basis'], sort=True):
        if len(g) >= min_editions:
            xs.append(g[x].to_numpy(float) - g[x].mean())
            ys.append(g[y].to_numpy(float) - g[y].mean())
            races += 1
    if not xs:
        return None
    xd, yd = np.concatenate(xs), np.concatenate(ys)
    sxx, syy, sxy = float((xd * xd).sum()), float((yd * yd).sum()), float((xd * yd).sum())
    if sxx <= 0 or syy <= 0:
        return None
    return {'editions': int(len(xd)), 'groups': races, 'r': num(sxy / math.sqrt(sxx * syy)), 'slope': num(sxy / sxx, 6)}


def people_by_way(fit, t: pd.DataFrame, positions: np.ndarray) -> tuple[int, int]:
    """Linked runners with a different-year pair between one of these editions and an edition of another race, by
    whether this race was the earlier or the later of the pair."""
    race = t.race.to_numpy()
    mine = np.zeros(len(t), dtype=bool)
    mine[positions] = True
    here = race[positions[0]]
    pos = fit.pair_gap > 0
    earlier = pos & mine[fit.pair_ua] & (race[fit.pair_ub] != here)
    later = pos & mine[fit.pair_ub] & (race[fit.pair_ua] != here)
    return int(len(np.unique(fit.pair_person[earlier]))), int(len(np.unique(fit.pair_person[later])))


def race_levels(fit, t: pd.DataFrame, held_codes, min_editions: int = MIN_EDITIONS) -> tuple[dict, TwoWay]:
    """label -> the race level of its chip- or net-timed fitted editions (at least `min_editions`), in log units."""
    two = TwoWay(t, fit.unit_weight, held_codes)
    rho, tau, resid = two.split(t.beta.to_numpy())
    kappa = dict(zip(fit.groups.tolist(), fit.kappa.tolist()))
    out = {}
    for gi, (label, basis) in enumerate(two.groups):
        members = np.flatnonzero(two.g == gi)
        if basis != lc.RACE_BASIS or len(members) < min_editions:
            continue
        positions = two.pos[members]
        e = resid[members]
        sd = float(e.std(ddof=1))
        out[label] = {'index': gi, 'positions': positions, 'editions': int(len(members)), 'level': float(rho[gi]), 'sd': sd,
                      'se': sd / math.sqrt(len(members)), 'kappa': kappa[int(t.race.to_numpy()[positions[0]])],
                      'plain_mean': float(t.beta.to_numpy()[positions].mean()), 'year_sd': float(t.beta.to_numpy()[positions].std(ddof=1))}
    return out, two


# ---------------------------------------------------------------------------------------------------------------
# The build
# ---------------------------------------------------------------------------------------------------------------
def build(results: pd.DataFrame, editions: pd.DataFrame, field_share: pd.DataFrame, *, boot: int = lc.BOOT_REPS, log=print) -> dict:
    """editions.json, races.json and checks.json (the three as dicts), with the counts the manifest keeps."""
    editions = editions.set_index('code', drop=False).sort_index()
    labels = sorted(editions.label.unique())
    editions['race'] = editions.label.map({label: i for i, label in enumerate(labels)}).astype(np.int64)
    code = results.edition.to_numpy()
    in_f, in_v, in_w = (editions[c].to_numpy()[code] for c in ('in_f', 'in_v', 'in_w'))
    high = results.high.to_numpy()

    main = fit_universe(results, editions, in_f, boot=boot, keep_pairs=True)
    log(f'linked: main fit {main.pairs:,} pairs, {main.people:,} linked runners, {len(main.units)} editions')
    t = unit_table(main, editions)
    held = held_outliers(t)
    held_codes = frozenset(t.code[held].tolist())
    groups = comparison_groups(t, held_codes)
    variants = {}
    for name, mask in (('verified', in_v), ('high', in_f & high), ('wider', in_w)):
        f = fit_universe(results, editions, mask)
        vt = unit_table(f, editions)
        vt['beta'] = align(vt, t, main.unit_weight)
        variants[name] = (f, vt)
        log(f'linked: {name} fit {f.pairs:,} pairs, {len(f.units)} editions')

    # ---- edition readings ----
    beta = t.beta.to_numpy()
    reading = np.full(len(t), np.nan)
    lo = np.full(len(t), np.nan)
    hi = np.full(len(t), np.nan)
    others = np.zeros(len(t), dtype=int)
    for positions in groups.values():
        reading[positions] = against_others(beta[positions])
        draws = against_others(main.boot_beta[:, positions])
        lo[positions] = np.percentile(draws, 2.5, axis=0)
        hi[positions] = np.percentile(draws, 97.5, axis=0)
        others[positions] = len(positions) - 1
    variant_reading = {}
    for name, (f, vt) in variants.items():
        values = {}
        for positions in comparison_groups(vt, held_codes).values():
            for c, v in zip(vt.code.to_numpy()[positions].tolist(), against_others(vt.beta.to_numpy()[positions]).tolist()):
                values[c] = v
        variant_reading[name] = values

    edition_rows = {}
    published = []
    for row in t.itertuples():
        if math.isnan(reading[row.pos]):
            continue
        r, l, h = log_pct(reading[row.pos]), log_pct(lo[row.pos]), log_pct(hi[row.pos])
        if not l <= r <= h:
            fail(f'{row.label} {row.year}: the reading lies outside its own bootstrap interval')
        hv = variant_reading['high'].get(row.code)
        hv = None if hv is None else pct(log_pct(hv))
        entry = {'tier': row.tier, 'timing': row.timing, 'basis': row.basis, 'finishes': int(row.finishes), 'others': int(others[row.pos]),
                 'reading_pct': pct(r), 'lo_pct': pct(l), 'hi_pct': pct(h), 'high_pct': hv}
        entry['verdict'] = year_verdict(entry['lo_pct'], entry['hi_pct'], hv)
        if entry['finishes'] < MIN_CELL or entry['others'] < MIN_EDITIONS - 1:
            fail(f'{row.label} {row.year}: an edition reading under a floor')
        edition_rows.setdefault(row.label, {})[str(int(row.year))] = entry
        published.append((row.label, int(row.year), row.tier, entry))

    # ---- race readings ----
    levels, two = race_levels(main, t, held_codes)
    boot_rho, _, _ = two.split(main.boot_beta)
    variant_levels = {}
    for name, (f, vt) in variants.items():
        lv, _ = race_levels(f, vt, held_codes)
        both = sorted(set(lv) & set(levels))
        shift = float(np.mean([levels[x]['level'] - lv[x]['level'] for x in both])) if both else 0.0   # the races both fits read have the same mean reading
        variant_levels[name] = {label: {'editions': v['editions'], 'level': v['level'] + shift} for label, v in lv.items()}
    race_rows = {}
    under_way_floor = 0
    fitted_by_label = t.groupby('label').size().to_dict()
    pair_people = main.pair_person
    for label, r in levels.items():
        positions = r['positions']
        earlier, later = people_by_way(main, t, positions)
        if earlier < MIN_CELL or later < MIN_CELL:
            under_way_floor += 1   # the earlier or the later reading would rest on fewer than MIN_CELL linked runners
            continue
        mult = lc.t_multiplier(r['editions'])
        draws = boot_rho[:, r['index']]
        members = t.iloc[positions]
        race_fitted = t[t.label == label]
        entry = {
            'editions': r['editions'], 'editions_fitted': int(fitted_by_label[label]),
            'years': [int(members.year.min()), int(members.year.max())],
            'tiers': {tier: int((members.tier == tier).sum()) for tier in lc.F_TIERS},
            'timing': {c: int((race_fitted.timing == c).sum()) for c in lc.TIMING_CODES},
            'held_for_review': int(race_fitted.code.isin(list(held_codes)).sum()),
            'finishes': int(members.finishes.sum()),
            'people': int(len(np.unique(np.concatenate([pair_people[np.isin(main.pair_ua, positions)], pair_people[np.isin(main.pair_ub, positions)]])))),
            'people_earlier': earlier, 'people_later': later,
            'reading_pct': pct(log_pct(r['level'])), 'se': num(100.0 * r['se'], 4), 'year_sd_pct': num(100.0 * r['year_sd'], 3),
            'lo_pct': pct(log_pct(r['level'] - mult * r['se'])), 'hi_pct': pct(log_pct(r['level'] + mult * r['se'])),
            'boot_lo_pct': pct(log_pct(np.percentile(draws, 2.5))), 'boot_hi_pct': pct(log_pct(np.percentile(draws, 97.5))),
            'earlier_pct': pct(log_pct(r['level'] - r['kappa'])), 'later_pct': pct(log_pct(r['level'] + r['kappa'])),
            'variants': {name: (None if label not in variant_levels[name] else
                                {'editions': int(variant_levels[name][label]['editions']), 'reading_pct': pct(log_pct(variant_levels[name][label]['level']))})
                         for name in VARIANTS},
        }
        entry['verdict'] = race_verdict(entry)
        race_rows[label] = entry

    checks = build_checks(main, t, held, reading, variants, variant_reading, levels, variant_levels, race_rows, published, editions, field_share, two)
    summary_e = {'editions': len(published), 'races': len(edition_rows),
                 'by_tier': {tier: sum(1 for p in published if p[2] == tier) for tier in lc.F_TIERS},
                 'by_verdict': {v: sum(1 for p in published if p[3]['verdict'] == v) for v in ('fast', 'slow', 'usual')},
                 'no_verdict': sum(1 for p in published if p[3]['verdict'] is None)}
    summary_r = {'races': len(race_rows), 'under_the_floor_each_way': under_way_floor,
                 'by_verdict': {v: sum(1 for r in race_rows.values() if r['verdict'] == v) for v in ('faster', 'slower', 'about_the_same')},
                 'no_verdict': sum(1 for r in race_rows.values() if r['verdict'] is None)}
    fit_counts = {'pairs': main.pairs, 'people': main.people, 'same_year_pairs': main.same_year_pairs, 'editions_fitted': int(len(main.units)),
                  'races_fitted': int(t.label.nunique()), 'fitted_by_tier': {tier: int((t.tier == tier).sum()) for tier in lc.F_TIERS},
                  'fitted_by_timing': {c: int((t.timing == c).sum()) for c in lc.TIMING_CODES},
                  'not_fitted': {k: int(v) for k, v in main.dropped.items()}, 'held_for_review': int(held.sum()),
                  'drift_pct': [pct(log_pct(g)) for g in main.gamma.tolist()], 'bootstrap_draws': int(boot)}
    return {
        'editions.json': {'margin_pct': lc.YEAR_MARGIN_PCT, 'min_editions': MIN_EDITIONS, 'min_finishes': MIN_CELL, 'summary': summary_e, 'races': edition_rows},
        'races.json': {'band_pct': lc.RACE_BAND_PCT, 'min_editions': MIN_EDITIONS, 'min_people_each_way': MIN_CELL, 'summary': summary_r, 'races': race_rows},
        'checks.json': checks,
        'counts': {'fit': fit_counts, 'editions': summary_e, 'races': summary_r},
    }


def build_checks(main, t, held, reading, variants, variant_reading, levels, variant_levels, race_rows, published, editions, field_share, two) -> dict:
    kept = t[~held & t.basis.notna()].copy()
    kept['level'] = 100.0 * kept.beta    # the edition's reading against the average fitted edition, in log points x 100
    ed = editions.loc[kept.code]
    kept['temp_window'] = ed.temp_window.to_numpy()
    kept['temp_start'] = ed.temp_start.to_numpy()
    kept['all_finishes'] = ed.finishes.to_numpy()

    # 1. temperature of the race window (dated editions only; no weather enters the fit)
    dated = kept[kept.temp_window.notna()].copy()
    dated = dated[dated.groupby(['label', 'basis'])['label'].transform('size') >= MIN_EDITIONS]
    temperature = None
    if len(dated):
        temperature = {'window': within_relation(dated, 'temp_window', 'level', MIN_EDITIONS),
                       'start': within_relation(dated[dated.temp_start.notna()], 'temp_start', 'level', MIN_EDITIONS)}
        dev = dated['level'] - dated.groupby(['label', 'basis'])['level'].transform('mean')
        bands = []
        for lo_t, hi_t in TEMP_BANDS:
            m = (dated.temp_window >= (lo_t if lo_t is not None else -np.inf)) & (dated.temp_window < (hi_t if hi_t is not None else np.inf))
            n = int(m.sum())
            bands.append({'temp_from': lo_t, 'temp_to': hi_t, 'editions': n, 'races': int(dated.label[m].nunique()),
                          'mean_pct': pct(dev[m].mean()) if n >= MIN_EDITIONS else None})
        temperature['bands'] = bands
        temperature['points'] = [{'label': r.label, 'year': int(r.year), 'basis': r.basis, 'level': num(r.level, 4),
                                  'temp_window': num(r.temp_window, 2), 'temp_start': None if pd.isna(r.temp_start) else num(r.temp_start, 2)}
                                 for r in dated.sort_values(['label', 'year']).itertuples()]

    # 2. the whole field's sustained-slowdown share on counted editions (no person link enters it)
    fs = field_share.set_index('code')
    field = kept[kept.code.isin(fs.index)].copy()
    field['eligible'] = fs.eligible.reindex(field.code).to_numpy()
    field['slow'] = fs.slow.reindex(field.code).to_numpy()
    field = field[(field.eligible >= FIELD_MIN_ELIGIBLE) & (field.eligible >= FIELD_MIN_SHARE * field.all_finishes)]
    field = field[field.groupby(['label', 'basis'])['label'].transform('size') >= FIELD_MIN_EDITIONS].copy()
    field['share_points'] = 100.0 * field.slow / field.eligible
    slowdown = None
    if len(field):
        rel = within_relation(field, 'level', 'share_points', FIELD_MIN_EDITIONS)
        slowdown = {'relation': rel, 'bar': lc.FIELD_R_MIN, 'verdict': 'holds' if rel is not None and rel['r'] >= lc.FIELD_R_MIN else None,
                    'min_eligible': FIELD_MIN_ELIGIBLE, 'min_share_of_finishes': FIELD_MIN_SHARE, 'min_editions': FIELD_MIN_EDITIONS,
                    'points': [{'label': r.label, 'year': int(r.year), 'basis': r.basis, 'level': num(r.level, 4), 'eligible': int(r.eligible),
                                'slow': int(r.slow)} for r in field.sort_values(['label', 'year']).itertuples()]}

    # 3. the same fit on verified tiers only, on high links only and on the wider set
    fits = {}
    main_reading = {int(c): float(v) for c, v in zip(t.code.to_numpy(), reading) if not math.isnan(v)}
    for name, (f, vt) in variants.items():
        both = sorted(set(main_reading) & set(variant_reading[name]))
        pairs_e = [[pct(log_pct(main_reading[c])), pct(log_pct(variant_reading[name][c]))] for c in both]
        both_r = sorted(set(race_rows) & set(variant_levels[name]))
        pairs_r = [[race_rows[label]['reading_pct'], pct(log_pct(variant_levels[name][label]['level']))] for label in both_r]
        fits[name] = {'pairs': f.pairs, 'people': f.people, 'editions_fitted': int(len(f.units)),
                      'editions': {'both': len(pairs_e), 'r': corr(pairs_e), 'points': pairs_e},
                      'races': {'both': len(pairs_r), 'r': corr(pairs_r), 'sd_of_difference': sd_diff(pairs_r), 'points': pairs_r,
                                'same_sign': sum(1 for a, b in pairs_r if a * b > 0)}}

    # 4. the spread, the 2% count, the year levels, and what other rules would give
    values = np.array([p[3]['reading_pct'] for p in published])
    verified = np.array([p[2] in lc.VERIFIED_TIERS for p in published], dtype=bool)
    beyond = {'editions': int(len(values)), 'verified_editions': int(verified.sum())}
    for mark in BEYOND:
        beyond[f'over_{mark:g}_pct'] = int((np.abs(values) > mark).sum())
        beyond[f'verified_over_{mark:g}_pct'] = int((np.abs(values[verified]) > mark).sum())
    year_sd = sorted(r['year_sd_pct'] for r in race_rows.values())
    spread = {'races': len(year_sd), 'median_year_sd_pct': num(float(np.median(year_sd)), 3) if year_sd else None,
              'race_sd_pct': num(float(np.std([r['reading_pct'] for r in race_rows.values()], ddof=1)), 3) if len(race_rows) >= MIN_EDITIONS else None}
    _, tau, _ = two.split(t.beta.to_numpy())
    per_year = np.bincount(two.y, minlength=len(two.years))
    year_levels = [{'year': int(y), 'editions': int(per_year[i]), 'level_pct': pct(log_pct(tau[i])) if per_year[i] >= MIN_EDITIONS else None}
                   for i, y in enumerate(two.years)]
    five = {'min_editions': 5, 'races': sum(1 for r in race_rows.values() if r['editions'] >= 5),
            'by_verdict': {v: sum(1 for r in race_rows.values() if r['editions'] >= 5 and r['verdict'] == v) for v in ('faster', 'slower', 'about_the_same')}}
    five['no_verdict'] = five['races'] - sum(five['by_verdict'].values())
    # the scout's rule alone, for comparison: the plain mean of the edition readings, two standard errors of that mean, and the order readings
    plain = {'faster': 0, 'slower': 0, 'neither': 0, 'points': []}
    for label in sorted(race_rows):
        lv = levels[label]
        mean, se, kappa = lv['plain_mean'], lv['year_sd'] / math.sqrt(lv['editions']), lv['kappa']
        word = 'neither'
        for sign, name in ((-1, 'faster'), (1, 'slower')):
            if sign * (mean - sign * 2 * se) > 0 and sign * (mean - kappa) > 0 and sign * (mean + kappa) > 0:
                word = name
        plain[word] += 1
        plain['points'].append([race_rows[label]['reading_pct'], pct(log_pct(mean))])
    plain['r'] = corr(plain['points'])
    held_rows = [{'label': r.label, 'year': int(r.year), 'tier': r.tier, 'basis': r.basis, 'finishes': int(r.finishes)}
                 for r in t[held].sort_values(['label', 'year']).itertuples()]
    return {'temperature': temperature, 'slowdown': slowdown, 'fits': fits, 'beyond': beyond, 'spread': spread, 'year_levels': year_levels,
            'floor_of_five': five, 'plain_mean_and_two_standard_errors': plain, 'held_for_review': held_rows, 'outlier_pct': lc.OUTLIER_PCT}


def corr(pairs) -> float | None:
    if len(pairs) < MIN_EDITIONS:
        return None
    a = np.array(pairs, dtype=float)
    x, y = a[:, 0] - a[:, 0].mean(), a[:, 1] - a[:, 1].mean()
    sxx, syy = float((x * x).sum()), float((y * y).sum())
    if sxx <= 0 or syy <= 0:
        return None
    return num(float((x * y).sum()) / math.sqrt(sxx * syy))


def sd_diff(pairs) -> float | None:
    if len(pairs) < MIN_EDITIONS:
        return None
    a = np.array(pairs, dtype=float)
    return num(float(np.std(a[:, 1] - a[:, 0], ddof=1)), 3)


__all__ = ['build', 'against_others', 'year_verdict', 'race_verdict', 'held_outliers', 'comparison_groups', 'within_relation', 'TwoWay', 'align']
