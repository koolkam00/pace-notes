"""Terrain splits: one published grade curve spread over a corrected route profile.

A port of the reference model the terrain splits were validated with
(analysis/course_terrain/validation-2026-10-23/terrain_model.py, without its
sensitivity parameter). Nothing here is fitted to Pace Notes data, and nothing
here reads a finish time: the visitor's goal only sets the scale.

  f(g) = 1 + A1 g + A2 g^2, g = grade in percent, clamped to [-10, 10]
  (Strava 2017 equal-heart-rate curve, as fitted by a third party).

Pipeline (grade_profile, cumulative, u_at):
  1. sort the route points by distance (stable) and stretch them linearly to 42.195 km;
  2. resample on N = 4221 points (every 42.195 / 4220 km, about 10 m);
  3. running median over 21 samples, then a Gaussian with sigma 10 samples
     (kernel half-width 40), both padded with the nearest value;
  4. grade = numpy.gradient (central differences inside, one-sided at the ends);
  5. trapezoid weights w_i = (f(g_i) + f(g_i+1)) / 2 * dx_i and
     U = [0, cumsum(w)] / cumsum(w)[-1], so U[0] = 0 and U[N-1] = 1 exactly.
Elapsed time on the plan at distance d for a goal of G seconds is G * u(d).
"""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

KM = 42.195
GRID_POINTS = 4221
A1, A2 = 0.02869556, 0.001520768
GMAX = 10.0
MEDIAN_SAMPLES = 21
SIGMA_SAMPLES = 10
KERNEL_HALF_WIDTH = 40
MILE_KM = 1.609344


def f(g):
    """Pace on a grade divided by pace on the flat at equal effort (g in percent, clamped to +-10)."""
    g = np.clip(np.asarray(g, float), -GMAX, GMAX)
    return 1 + A1 * g + A2 * g * g


def rolling_median(z, w=MEDIAN_SAMPLES):
    """Centred running median over w samples, edges padded with the nearest value."""
    h = w // 2
    return np.median(sliding_window_view(np.pad(z, h, mode='edge'), w), axis=1)


def gaussian(z, sigma=SIGMA_SAMPLES, r=KERNEL_HALF_WIDTH):
    """Centred Gaussian smoothing (kernel exp(-k^2 / 2 sigma^2), k = -r..r, sum 1), edges padded with the nearest value."""
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(z, r, mode='edge'), k, mode='valid')


def grid():
    """The model grid on the official axis: N points from 0 to 42.195 km."""
    return np.linspace(0, KM, GRID_POINTS)


def grade_profile(d_km, z_m):
    """Return (x km on the official 42.195 km axis, smoothed elevation m, grade % at x)."""
    d = np.asarray(d_km, float)
    z = np.asarray(z_m, float)
    o = np.argsort(d, kind='stable')
    d, z = d[o], z[o]
    d = (d - d[0]) * KM / (d[-1] - d[0])
    x = grid()
    zz = np.interp(x, d, z)
    zz = rolling_median(zz)
    zz = gaussian(zz)
    g = np.gradient(zz, x * 1000) * 100
    return x, zz, g


def cumulative(x, g):
    """Share of the goal elapsed at every grid point: U[0] = 0, U[-1] = 1."""
    fx = f(g)
    w = 0.5 * (fx[1:] + fx[:-1]) * np.diff(x)
    T = np.r_[0, np.cumsum(w)]
    return T / T[-1]


def u_at(x, U, d):
    """Share of the goal elapsed at official distance(s) d km (linear between grid points)."""
    return np.interp(d, x, U)


def gain(z, thr=2.0):
    """Total climb counting only rises of at least thr metres from the last turning point."""
    total = 0.0
    ref = z[0]
    for v in z[1:]:
        if v - ref >= thr:
            total += v - ref
            ref = v
        elif ref - v >= thr:
            ref = v
    return total


def loss(z, thr=2.0):
    """Total descent with the same threshold rule as gain."""
    total = 0.0
    ref = z[0]
    for v in z[1:]:
        if v - ref >= thr:
            ref = v
        elif ref - v >= thr:
            total += ref - v
            ref = v
    return total
