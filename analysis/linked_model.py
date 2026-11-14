"""The pair model of the linked-records family: the same linked runner at two marathons at most two years apart.

For every pair of kept results of one linked runner whose calendar years are at most `MAX_GAP` apart (a the earlier
year, b the later; two results of one year form a pair whose order is unknown):

    ln(time b) - ln(time a) = reading(edition b) - reading(edition a)
                              + [different years] x (drift(years apart) + order(race a) + order(race b)) + noise

fitted by weighted least squares; a runner with k paired results weighs 2/k per pair, so every runner counts k - 1.

- `reading` is one number per edition: how the same linked runners finished there against their other marathons.
- `order` is one number per race: half the difference between "this race was the later of the pair" and "this race
  was the earlier". With it a race's reading is the mean of the two orders: `reading - order` when the race came
  first, `reading + order` when it came second.
- `drift` is the mean change from the earlier to the later race, one number per count of years apart.

The pairs leave three things undetermined, and each is set by a stated rule:
1. a constant on every reading: the pair-weighted mean reading of the fitted editions is zero;
2. a constant on every order term (with twice its opposite on every drift): the pair-weighted mean order term is zero;
3. a straight-line trend of the readings over calendar years (with its opposite, per year apart, on the drift): a
   steady change that every edition shares cannot be told apart from the average change in a runner between two
   races, so the readings carry none: their pair-weighted trend over calendar years is zero and the drift takes it.
A reading is therefore a reading against the common trend of the years, never a statement about that trend.

An edition is fitted when at least `MIN_CONNECTED` linked runners connect it to another fitted edition, it lies in the
largest connected set of editions, and its reading is determined by the pairs (an edition whose reading cannot be told
apart from its race's order term, such as a race seen only in the last year of the records, is not fitted). The
interval of a reading comes from a runner bootstrap: every linked runner takes an independent Poisson(1) weight.

No name and no identifier enters this module: runners, editions and races are integer codes.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from linked_common import BOOT_REPS, MAX_GAP, MIN_CONNECTED, SEED, fail

NULL_TOLERANCE = 1e-9     # an eigenvalue under this share of the largest is zero
LOADING_TOLERANCE = 1e-6  # a reading that loads on an undetermined direction is not fitted


def build_pairs(person, year, max_gap: int = MAX_GAP):
    """Index pairs (i, j), i before j, of results of one runner at most `max_gap` calendar years apart.

    `person` and `year` are sorted by (person, year). Returns int64 arrays i, j."""
    person = np.asarray(person)
    year = np.asarray(year).astype(np.int64)
    n = len(person)
    if n and (np.any(np.diff(person) < 0) or np.any((np.diff(person) == 0) & (np.diff(year) < 0))):
        fail('results must be sorted by runner, then year')
    out_i, out_j = [], []
    idx = np.arange(n - 1, dtype=np.int64)
    offset = 1
    while len(idx):
        idx = idx[idx + offset < n]
        idx = idx[person[idx + offset] == person[idx]]
        if not len(idx):
            break
        near = idx[year[idx + offset] - year[idx] <= max_gap]
        out_i.append(near)
        out_j.append(near + offset)
        offset += 1
    if not out_i:
        return np.zeros(0, np.int64), np.zeros(0, np.int64)
    i, j = np.concatenate(out_i), np.concatenate(out_j)
    order = np.lexsort((j, i))
    return i[order], j[order]


def _components(n_units: int, ua, ub) -> np.ndarray:
    """Connected-component label of every unit (the smallest unit code in its component)."""
    parent = list(range(n_units))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    edges = np.unique(np.minimum(ua, ub).astype(np.int64) * n_units + np.maximum(ua, ub))
    for a, b in zip((edges // n_units).tolist(), (edges % n_units).tolist()):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    return np.array([find(x) for x in range(n_units)], dtype=np.int64)


def _runners_per_unit(person, ua, ub, n_units: int) -> np.ndarray:
    """Distinct runners with a pair at each unit."""
    both = np.unique(np.concatenate([person.astype(np.int64) * n_units + ua, person.astype(np.int64) * n_units + ub]))
    return np.bincount(both % n_units, minlength=n_units)


@dataclass
class Fit:
    units: np.ndarray        # codes of the fitted units (editions), ascending
    groups: np.ndarray       # codes of the groups (races) with an order term, ascending
    years: np.ndarray        # calendar year of each fitted unit
    beta: np.ndarray         # reading per fitted unit, centred and without a trend over the years (log units)
    kappa: np.ndarray        # order term per group, centred (log units)
    gamma: np.ndarray        # drift per years apart, 1..max_gap (log units)
    unit_weight: np.ndarray  # pair weight per fitted unit (the centring weights)
    runners: np.ndarray      # distinct runners connecting each fitted unit
    pairs: int               # fitted pairs
    people: int              # runners with a fitted pair
    same_year_pairs: int
    dropped: dict            # units left out, by reason
    boot_beta: np.ndarray | None = None    # (reps, units), centred with the same weights
    boot_kappa: np.ndarray | None = None   # (reps, groups)
    # per pair, for the callers' counts (fitted pairs only)
    pair_person: np.ndarray | None = None
    pair_ua: np.ndarray | None = None      # index into `units`
    pair_ub: np.ndarray | None = None
    pair_gap: np.ndarray | None = None


class _Design:
    """The normal equations of the model for a fixed pair set and any pair weights."""

    def __init__(self, ia, ib, ka, kb, gap, d, n_units, n_groups, max_gap):
        self.S, self.G, self.Y = n_units, n_groups, max_gap
        self.K = n_units + n_groups + max_gap
        self.pos = gap > 0
        self.d = d
        pos = self.pos
        # columns of a pair with different years: +reading b, -reading a, +order a, +order b, +drift
        self.cols_pos = [ib[pos], ia[pos], n_units + ka[pos], n_units + kb[pos], n_units + n_groups + gap[pos] - 1]
        self.sign_pos = [1.0, -1.0, 1.0, 1.0, 1.0]
        # a same-year pair has no order and no drift
        self.cols_zero = [ib[~pos], ia[~pos]]
        self.sign_zero = [1.0, -1.0]

    def normal(self, w):
        K = self.K
        A = np.zeros((K, K))
        b = np.zeros(K)
        for cols, signs, mask in ((self.cols_pos, self.sign_pos, self.pos), (self.cols_zero, self.sign_zero, ~self.pos)):
            wm = w[mask]
            wd = wm * self.d[mask]
            for x, (cx, sx) in enumerate(zip(cols, signs)):
                b += np.bincount(cx, weights=sx * wd, minlength=K)
                for y in range(x, len(cols)):
                    part = np.bincount(cx * K + cols[y], weights=(sx * signs[y]) * wm, minlength=K * K).reshape(K, K)
                    A += part if y == x else part + part.T
        return A, b


def values_scale(A) -> float:
    return float(np.abs(np.diag(A)).max())


def _solve(A, b):
    """Minimum-norm least-squares solution of a symmetric positive semi-definite system, and its null vectors."""
    values, vectors = np.linalg.eigh(A)
    keep = values > NULL_TOLERANCE * values[-1]
    solution = vectors[:, keep] @ ((vectors[:, keep].T @ b) / values[keep])
    return solution, vectors[:, ~keep]


def fit(person, unit, group_of_unit, year, lf, *, min_connected: int = MIN_CONNECTED, max_gap: int = MAX_GAP,
        boot: int = 0, seed: int = SEED, keep_pairs: bool = False) -> Fit:
    """Fit the pair model on results sorted by (person, year).

    person: runner code per result; unit: edition code per result; group_of_unit: race code for every unit code (an
    array indexed by unit code); year: calendar year per result; lf: ln(finish seconds) per result."""
    person = np.asarray(person, dtype=np.int64)
    unit = np.asarray(unit, dtype=np.int64)
    group_of_unit = np.asarray(group_of_unit, dtype=np.int64)
    lf = np.asarray(lf, dtype=float)
    i, j = build_pairs(person, year, max_gap)
    if not len(i):
        fail('no pairs to fit')
    year = np.asarray(year).astype(np.int64)
    pp, ua, ub = person[i], unit[i], unit[j]
    gap, d = year[j] - year[i], lf[j] - lf[i]
    if np.any(ua == ub):
        fail('a runner has two results in one edition')
    n_codes = int(max(unit.max(), len(group_of_unit) - 1)) + 1
    year_lo = np.full(n_codes, np.iinfo(np.int64).max)
    year_hi = np.full(n_codes, np.iinfo(np.int64).min)
    np.minimum.at(year_lo, unit, year)
    np.maximum.at(year_hi, unit, year)
    if np.any((year_hi > year_lo) & (year_hi >= 0)):
        fail('an edition holds results of two calendar years')
    dropped = {'under_connected_floor': 0, 'outside_largest_component': 0, 'undetermined': 0}
    alive = np.ones(len(pp), dtype=bool)
    removed = np.zeros(n_codes, dtype=bool)
    while True:
        # 1. the floor on connecting runners, to a fixed point
        while True:
            runners = _runners_per_unit(pp[alive], ua[alive], ub[alive], n_codes)
            present = runners > 0
            low = present & (runners < min_connected)
            if not low.any():
                break
            dropped['under_connected_floor'] += int(low.sum())
            removed |= low
            alive &= ~(removed[ua] | removed[ub])
        if not alive.any():
            fail(f'no edition is connected by {min_connected} linked runners')
        # 2. the largest connected set of editions
        comp = _components(n_codes, ua[alive], ub[alive])
        present = np.bincount(np.concatenate([ua[alive], ub[alive]]), minlength=n_codes) > 0
        sizes = np.bincount(np.concatenate([comp[ua[alive]], comp[ub[alive]]]), minlength=n_codes)
        main = int(np.argmax(sizes))   # the component with most pair ends; ties to the smallest code
        outside = present & (comp != main)
        if outside.any():
            dropped['outside_largest_component'] += int(outside.sum())
            removed |= outside
            alive &= ~(removed[ua] | removed[ub])
            continue
        # 3. every reading determined by the pairs
        units = np.flatnonzero(present)
        uidx = np.full(n_codes, -1, dtype=np.int64)
        uidx[units] = np.arange(len(units))
        groups = np.unique(group_of_unit[units])
        gidx = np.full(int(group_of_unit.max()) + 1, -1, dtype=np.int64)
        gidx[groups] = np.arange(len(groups))
        a_pp, a_ua, a_ub, a_gap, a_d = pp[alive], uidx[ua[alive]], uidx[ub[alive]], gap[alive], d[alive]
        if a_gap.max() < max_gap or not all((a_gap == g).any() for g in range(1, max_gap + 1)):
            fail('the pairs do not span every count of years apart')
        ka, kb = gidx[group_of_unit[ua[alive]]], gidx[group_of_unit[ub[alive]]]
        # weights: a runner with k paired results weighs 2/k per pair
        res_i, res_j = i[alive], j[alive]
        k_results = np.bincount(person[np.unique(np.concatenate([res_i, res_j]))], minlength=int(person.max()) + 1)
        w0 = 2.0 / k_results[a_pp]
        design = _Design(a_ua, a_ub, ka, kb, a_gap, a_d, len(units), len(groups), max_gap)
        A, b = design.normal(w0)
        solution, null = _solve(A, b)
        S, G = len(units), len(groups)
        # the three directions the model leaves free by construction: a constant on every reading; a constant on every
        # order term with twice its opposite on every drift; a trend of the readings over the years with its opposite,
        # per year apart, on the drift
        unit_year = year_lo[units].astype(float)
        known = np.zeros((design.K, 3))
        known[:S, 0] = 1.0
        known[S:S + G, 1] = 1.0
        known[S + G:, 1] = -2.0
        known[:S, 2] = unit_year - unit_year.mean()
        known[S + G:, 2] = -np.arange(1, max_gap + 1)
        if np.abs(A @ known).max() > 1e-6 * values_scale(A):
            fail('the pair model: a direction that should be free is not')
        known, _ = np.linalg.qr(known)
        extra = null - known @ (known.T @ null)
        # A reading the pairs do not determine: its value under the three rules moves along a free direction that is
        # not one of the three. The editions that move most go first; the rest are then judged again.
        unit_weight = np.bincount(a_ua, weights=w0, minlength=S) + np.bincount(a_ub, weights=w0, minlength=S)
        year_c = unit_year - (unit_year * unit_weight).sum() / unit_weight.sum()
        block = extra[:S] - (extra[:S] * unit_weight[:, None]).sum(axis=0) / unit_weight.sum()
        block = block - year_c[:, None] * ((block * (year_c * unit_weight)[:, None]).sum(axis=0) / (year_c * year_c * unit_weight).sum())
        loading = np.sqrt((block ** 2).sum(axis=1))
        order_block = extra[S:S + G] - extra[S:S + G].mean(axis=0)
        order_loading = np.sqrt((order_block ** 2).sum(axis=1))
        if loading.max() > LOADING_TOLERANCE or order_loading.max() > LOADING_TOLERANCE:
            bad_units = loading > max(LOADING_TOLERANCE, 0.5 * loading.max())
            if not bad_units.any():   # only order terms move: the editions of the races whose order term moves most go
                bad_groups = order_loading > 0.5 * order_loading.max()
                bad_units = np.isin(group_of_unit[units], groups[bad_groups])
            dropped['undetermined'] += int(bad_units.sum())
            removed[units[bad_units]] = True
            alive &= ~(removed[ua] | removed[ub])
            continue
        if null.shape[1] != 3:
            fail(f'the pair model leaves {null.shape[1]} directions free where three are expected')
        break

    pos = a_gap > 0
    group_weight = np.bincount(ka[pos], weights=w0[pos], minlength=G) + np.bincount(kb[pos], weights=w0[pos], minlength=G)

    steps = np.arange(1, max_gap + 1, dtype=float)

    def centred(sol):
        beta, kappa, gamma = sol[:S].copy(), sol[S:S + G].copy(), sol[S + G:].copy()
        beta -= (beta * unit_weight).sum() / unit_weight.sum()
        trend = (beta * year_c * unit_weight).sum() / (year_c * year_c * unit_weight).sum()
        beta -= trend * year_c
        shift = (kappa * group_weight).sum() / group_weight.sum()
        return beta, kappa - shift, gamma + trend * steps + 2 * shift

    beta, kappa, gamma = centred(solution)
    out = Fit(units=units, groups=groups, years=year_lo[units], beta=beta, kappa=kappa, gamma=gamma, unit_weight=unit_weight,
              runners=_runners_per_unit(a_pp, a_ua, a_ub, S), pairs=int(len(a_pp)), people=int(len(np.unique(a_pp))),
              same_year_pairs=int((~pos).sum()), dropped=dropped)
    if keep_pairs:
        out.pair_person, out.pair_ua, out.pair_ub, out.pair_gap = a_pp, a_ua, a_ub, a_gap
    if boot:
        rng = np.random.default_rng(seed)
        runners_u, inverse = np.unique(a_pp, return_inverse=True)
        out.boot_beta = np.zeros((boot, S))
        out.boot_kappa = np.zeros((boot, G))
        for rep in range(boot):
            mult = rng.poisson(1.0, size=len(runners_u)).astype(float)[inverse]
            Ar, br = design.normal(w0 * mult)
            sol, _ = _solve(Ar, br)
            out.boot_beta[rep], out.boot_kappa[rep], _ = centred(sol)
    return out


def default_boot() -> int:
    return BOOT_REPS
