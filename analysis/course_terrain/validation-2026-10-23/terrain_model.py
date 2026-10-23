"""The recommended terrain-split model (research/model.json 'recommendation'), as a small library.

f(g) = 1 + 0.02869556 g + 0.001520768 g^2 (g in percent, clamped to [-10, 10]); grade from the route profile
rescaled to 42.195 km, resampled every 10 m, despiked with a 210 m rolling median, smoothed with a Gaussian
(sigma 100 m), central differences. Weights w_i = f(g_i) ds_i; T(d) = G * cumsum(w) / sum(w): the goal is spread,
never adjusted. `sens` scales the grade before f (sens=1 is the published curve) and is used only for the
sensitivity check, never for the band.
"""
import numpy as np

KM = 42.195
STEP = 0.010  # km
MATS = np.array([0, 5, 10, 15, 20, 25, 30, 35, 40, KM])
LEN = np.diff(MATS)
A1, A2 = 0.02869556, 0.001520768
GMAX = 10.0


def f(g, sens=1.0):
    g = np.clip(np.asarray(g, float) * sens, -GMAX, GMAX)
    return 1 + A1 * g + A2 * g * g


def rolling_median(z, w):
    h = w // 2
    zp = np.pad(z, h, mode='edge')
    from numpy.lib.stride_tricks import sliding_window_view
    return np.median(sliding_window_view(zp, w), axis=1)


def gaussian(z, sigma_samples):
    r = int(4 * sigma_samples)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_samples) ** 2); k /= k.sum()
    return np.convolve(np.pad(z, r, mode='edge'), k, mode='valid')


def grade_profile(d_km, z_m, median_m=210, sigma_m=100):
    """Return (x km on the official 42.195 axis, smoothed elevation m, grade % at x) every 10 m."""
    d = np.asarray(d_km, float); z = np.asarray(z_m, float)
    o = np.argsort(d, kind='stable'); d, z = d[o], z[o]
    d = (d - d[0]) * KM / (d[-1] - d[0])
    x = np.linspace(0, KM, int(round(KM / STEP)) + 1)
    zz = np.interp(x, d, z)
    zz = rolling_median(zz, int(round(median_m / 10)) | 1)
    zz = gaussian(zz, sigma_m / 10)
    g = np.gradient(zz, x * 1000) * 100
    return x, zz, g


def cum_time(x, g, goal_s, sens=1.0):
    """Cumulative time (s) at every x, ending exactly on goal_s. Step weights use the mean of f at both ends."""
    fx = f(g, sens)
    w = 0.5 * (fx[1:] + fx[:-1]) * np.diff(x)
    T = np.r_[0, np.cumsum(w)]
    return T * goal_s / T[-1]


def at(x, T, km):
    return np.interp(km, x, T)


def shape(x, g, sens=1.0):
    """Relative pace of the nine mat segments (segment pace / goal average pace); goal-independent."""
    T = cum_time(x, g, 1.0, sens)
    t = at(x, T, MATS)
    return (np.diff(t) / LEN) / (1.0 / KM)


def mat_times(x, g, goal_s, sens=1.0):
    """Elapsed seconds at 5K..40K and the finish, rounded to whole seconds (finish = goal)."""
    T = cum_time(x, g, goal_s, sens)
    return np.round(at(x, T, MATS[1:])).astype(int)


def gain(z, thr=2.0):
    gsum = 0.0; ref = z[0]
    for v in z[1:]:
        if v - ref >= thr: gsum += v - ref; ref = v
        elif ref - v >= thr: ref = v
    return gsum
