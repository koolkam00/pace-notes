"""Small, dependency-free (NumPy) statistics used by the story analyses."""
import math

import numpy as np

MIN_CELL = 100
SEED = 20261006
# Digits for every share (and share-like ratio) that a page prints as a percentage, with one decimal or whole.
# Four digits made the page round twice: Chicago 2018's 13,377 of 44,224 (30.2483%) was stored as 0.3025 and printed
# as 30.3%. Ten digits keep a single rounding from the exact share: a count share k/n with n under a million that is
# not exactly on a half-way point is at least 1/(2000n) away from it, far more than the 5e-11 the stored value can
# move. scripts/verify-insights.cjs checks printed values against its own exact recounts (courses, course goals,
# final kick and pace band).
SHARE_DIGITS = 10


def count_phrase(n, noun):
    """'15 editions', '1 edition' or 'no editions' for method prose, so a count printed there comes from the data."""
    n = int(n)
    return f'no {noun}s' if n == 0 else f'1 {noun}' if n == 1 else f'{n:,} {noun}s'


def poisson_poly_fit(x, y, degree, mask):
    """Poisson log-link polynomial fitted by IRLS on `mask`; predictions for every x."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    xc = (x - x.mean()) / (x.std() + 1e-12)
    X = np.vander(xc, degree + 1, increasing=True)
    Xf, yf = X[mask], y[mask]
    beta = np.zeros(degree + 1)
    beta[0] = math.log(max(yf.mean(), 1e-9))
    for _ in range(200):
        eta = Xf @ beta
        mu = np.exp(eta)
        z = eta + (yf - mu) / mu
        new = np.linalg.solve((Xf.T * mu) @ Xf + 1e-9 * np.eye(len(beta)), (Xf.T * mu) @ z)
        done = np.max(np.abs(new - beta)) < 1e-10
        beta = new
        if done:
            break
    return np.exp(X @ beta)


def bspline_basis(x, knots, k=3):
    t = np.concatenate([[knots[0]] * k, knots, [knots[-1]] * k])
    B = np.zeros((len(x), len(t) - 1))
    for i in range(len(t) - 1):
        B[:, i] = ((x >= t[i]) & (x < t[i + 1])).astype(float)
    B[x == knots[-1], len(knots) + k - 2] = 1
    for d in range(1, k + 1):
        Bn = np.zeros((len(x), len(t) - 1 - d))
        for i in range(len(t) - 1 - d):
            a = (x - t[i]) / (t[i + d] - t[i]) if t[i + d] > t[i] else 0
            b = (t[i + d + 1] - x) / (t[i + d + 1] - t[i + 1]) if t[i + d + 1] > t[i + 1] else 0
            Bn[:, i] = a * B[:, i] + b * B[:, i + 1]
        B = Bn
    return B


def poisson_design_fit(X, y, mask):
    Xf, yf = X[mask], y[mask]
    beta = np.linalg.lstsq(Xf, np.log(yf + 1), rcond=None)[0]
    for _ in range(300):
        eta = Xf @ beta
        mu = np.exp(eta)
        z = eta + (yf - mu) / mu
        new = np.linalg.solve((Xf.T * mu) @ Xf + 1e-8 * np.eye(len(beta)), (Xf.T * mu) @ z)
        done = np.max(np.abs(new - beta)) < 1e-9
        beta = new
        if done:
            break
    return np.exp(X @ beta)


def quantile(values, q):
    """Linear-interpolation quantile ((n−1)·q), matching the repository verifiers."""
    v = np.sort(np.asarray(values, float))
    if not len(v):
        return math.nan
    pos = (len(v) - 1) * q
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(v) - 1)
    return float(v[lo] + (v[hi] - v[lo]) * (pos - lo))


def r(value, digits=6):
    """Round for publication; refuse non-finite values."""
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('Non-finite value in a published aggregate')
    return round(value, digits)


def edition_bootstrap(edition_ids, statistic, reps=200, seed=SEED):
    """Resample whole editions with replacement; statistic(indices) -> float."""
    rng = np.random.default_rng(seed)
    uniq, inverse = np.unique(edition_ids, return_inverse=True)
    members = [np.flatnonzero(inverse == k) for k in range(len(uniq))]
    out = []
    for _ in range(reps):
        picks = rng.integers(0, len(uniq), len(uniq))
        idx = np.concatenate([members[p] for p in picks])
        out.append(statistic(idx))
    out = np.asarray(out, float)
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))]


def kmeans(X, k, seed=SEED, iterations=100, init=None):
    """Deterministic k-means (k-means++ seeding, Lloyd iterations)."""
    rng = np.random.default_rng(seed)
    n = len(X)
    if init is None:
        centres = [X[rng.integers(n)]]
        d2 = ((X - centres[0]) ** 2).sum(1)
        for _ in range(1, k):
            probs = d2 / d2.sum()
            centres.append(X[rng.choice(n, p=probs)])
            d2 = np.minimum(d2, ((X - centres[-1]) ** 2).sum(1))
        centres = np.array(centres)
    else:
        centres = np.array(init, float)
    labels = np.zeros(n, dtype=np.int32)
    for _ in range(iterations):
        dist = ((X[:, None, :] - centres[None, :, :]) ** 2).sum(2)
        new = dist.argmin(1).astype(np.int32)
        moved = (new != labels).any()
        labels = new
        for j in range(k):
            members = X[labels == j]
            if len(members):
                centres[j] = members.mean(0)
        if not moved:
            break
    return centres, labels


def assign(X, centres, chunk=500_000):
    out = np.empty(len(X), dtype=np.int32)
    for start in range(0, len(X), chunk):
        part = X[start:start + chunk]
        out[start:start + chunk] = ((part[:, None, :] - centres[None, :, :]) ** 2).sum(2).argmin(1)
    return out
