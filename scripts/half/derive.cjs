'use strict';
// Pure derivations for the half-marathon checks (docs/HALF_MARATHON.md), shared by scripts/verify-half.cjs (layer 1,
// from the published aggregates), scripts/verify-half-source.cjs (layer 2, from the source files),
// scripts/nuggets/half.cjs (the nugget recount) and scripts/verify-tools.cjs (the half panels). Nothing here reads a
// file: every function takes values and returns values.
//
// Rounding and order statistics reproduce the Python builders bit for bit (analysis/half_common.py and
// insights_stats): `pyRound` is Python's round(x, n) (the exact binary value rounded half to even, then read back as
// the nearest double), `quantileSorted` the repository's linear quantile ((n − 1)q, `v[lo] + (v[hi] − v[lo]) · f`),
// `npMedian` numpy's median and `pairwiseSum` numpy's float64 sum. scripts/half/fixtures/parity.json pins the quantile
// and the seconds rounding against the Python side.

const SHARE_DIGITS = 10;
const MIN_CELL = 100;
const MIN_EDITIONS = 3;
const MIN_EDGE_SLICE = 10;

// ---------- Python parity ----------

const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

/** Python's round(x, digits) for digits >= 0: the exact value of the double, rounded half to even, read back. */
function pyRound(x, digits) {
  if (!Number.isFinite(x)) throw new Error(`pyRound: a non-finite value ${x}`);
  if (!Number.isInteger(digits) || digits < 0 || digits > 20) throw new Error(`pyRound: digits ${digits}`);
  if (x === 0) return x;
  F64[0] = x;
  const bits = U64[0];
  const negative = bits >> 63n === 1n;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  // x = mantissa · 2^exponent exactly.
  const mantissa = exponentBits === 0 ? fraction : fraction | (1n << 52n);
  const exponent = (exponentBits === 0 ? -1074 : exponentBits - 1075);
  const scale = 10n ** BigInt(digits);
  let q;
  if (exponent >= 0) q = (mantissa << BigInt(exponent)) * scale;
  else {
    const num = mantissa * scale;
    const den = 1n << BigInt(-exponent);
    q = num / den;
    const twice = 2n * (num % den);
    if (twice > den || (twice === den && q % 2n === 1n)) q += 1n;
  }
  let text = q.toString();
  if (digits > 0) {
    text = text.padStart(digits + 1, '0');
    text = `${text.slice(0, -digits)}.${text.slice(-digits)}`;
  }
  const out = Number(text);
  return negative ? -out : out;
}

/** A share as published (SHARE_DIGITS digits). */
const sh = (x) => pyRound(x, SHARE_DIGITS);
/** insights_stats.r: round(x, digits). */
const r = (x, digits = 6) => pyRound(x, digits);
/** half_common.sec: seconds as an integer, or one decimal where a median or quantile falls between two values. */
function sec(x) {
  if (!Number.isFinite(x)) throw new Error('sec: a non-finite time');
  const whole = Math.round(x);
  if (Math.abs(x - whole) < 1e-9) return whole;
  return pyRound(x, 1);
}

/** The repository's linear quantile of an ascending array ((n − 1)q). */
function quantileSorted(sorted, q) {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const ascending = (values) => Float64Array.from(values).sort();
const quantile = (values, q) => quantileSorted(ascending(values), q);

/** numpy's float64 pairwise sum (blocks of 8 accumulators up to 128 values, halves beyond). */
function pairwiseSum(a, start = 0, n = a.length - start) {
  if (n < 8) {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[start + i];
    return s;
  }
  if (n <= 128) {
    const r8 = [a[start], a[start + 1], a[start + 2], a[start + 3], a[start + 4], a[start + 5], a[start + 6], a[start + 7]];
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r8[j] += a[start + i + j];
    let s = ((r8[0] + r8[1]) + (r8[2] + r8[3])) + ((r8[4] + r8[5]) + (r8[6] + r8[7]));
    for (; i < n; i++) s += a[start + i];
    return s;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(a, start, n2) + pairwiseSum(a, start + n2, n - n2);
}
const npMean = (a) => pairwiseSum(Float64Array.from(a)) / a.length;

/** numpy's median: the middle value, or the mean of the two middle values. */
function npMedian(values) {
  const s = ascending(values);
  const n = s.length;
  if (!n) return NaN;
  const m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** True when some k in 0..n gives sh(k / n) === share (a published share is a count over n). */
function isShareOf(share, n) {
  if (!Number.isInteger(n) || n <= 0 || !Number.isFinite(share)) return false;
  const k0 = Math.round(share * n);
  for (let k = Math.max(0, k0 - 1); k <= Math.min(n, k0 + 1); k++) if (sh(k / n) === share) return true;
  return false;
}

// ---------- Words and times as pages print them ----------

/** Whole minutes at or below the value, as h:mm (lib/tools/half-to-full.ts floorHM). */
function clock(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60 + 1e-9);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
const pct = (share) => `${Math.round(share * 100)}%`;
/** "1 in d" within 10% (lib/nuggets/format inWords), else null. */
function oneIn(share) {
  let best = null;
  for (const d of [2, 3, 4, 5, 10, 20, 25, 50, 100]) {
    const err = Math.abs(1 / d - share) / share;
    if (err < 0.1 && (!best || err < best.err)) best = { d, err };
  }
  return best ? `1 in ${best.d}` : null;
}

// ---------- field.json ----------

const tailedTotal = (c) => c.under_lo + c.counts.reduce((a, b) => a + b, 0) + c.at_or_over_hi;

/** Finishes under `s` seconds from the minute histogram (s a whole minute inside [lo, hi]); null outside. */
function underMinutes(minutes, s) {
  if (s % 60 !== 0 || s / 60 < minutes.lo || s / 60 > minutes.hi) return null;
  let k = minutes.under_lo;
  for (let i = 0; i < s / 60 - minutes.lo; i++) k += minutes.counts[i];
  return k;
}

/** Finishes under `s` seconds from 5-minute bins (`bins` the field.sex_bins block, `c` one sex's counts); null outside. */
function underBins(bins, c, s) {
  if ((s - bins.lo_s) % bins.bin_s !== 0 || s < bins.lo_s || s > bins.hi_s) return null;
  let k = c.under_lo;
  for (let i = 0; i < (s - bins.lo_s) / bins.bin_s; i++) k += c.counts[i];
  return k;
}

/**
 * The bin (as [lo, hi) in the bins' unit) that holds the value of 0-based rank `rank` in tailed counts with bin edges
 * lo + i·step; null when the rank falls in a tail.
 */
function binOfRank(c, lo, step, rank) {
  let seen = c.under_lo;
  if (rank < seen) return null;
  for (let i = 0; i < c.counts.length; i++) {
    seen += c.counts[i];
    if (rank < seen) return [lo + i * step, lo + (i + 1) * step];
  }
  return null;
}

/**
 * Where a linear quantile at level q must lie, from tailed counts: between the bin of rank floor((n − 1)q) and the
 * bin of the next rank. Returns [min, max) in the bins' unit, or null when a rank falls in a tail.
 */
function quantileBounds(c, lo, step, q) {
  const n = tailedTotal(c);
  const pos = (n - 1) * q;
  const a = binOfRank(c, lo, step, Math.floor(pos));
  const b = binOfRank(c, lo, step, Math.min(Math.floor(pos) + 1, n - 1));
  return a && b ? [a[0], b[1]] : null;
}

/**
 * The densest `width` minutes (half_field: the first a in [from, to) maximising counts[a:a + width]) from the
 * published histogram, exact when every window that could win lies inside it: a window that reaches into a tail is
 * bounded above by its histogram part plus the whole tail and must be beaten strictly. Returns {lo, count} or null.
 */
function densest(minutes, width, from, to) {
  const at = (m) => (m >= minutes.lo && m < minutes.hi ? minutes.counts[m - minutes.lo] : null);
  let best = null;
  for (let a = Math.max(from, minutes.lo); a + width <= minutes.hi && a < to; a++) {
    let s = 0;
    for (let m = a; m < a + width; m++) s += at(m);
    if (!best || s > best.count) best = { lo: a, count: s };
  }
  if (!best) return null;
  for (let a = from; a < to; a++) {
    if (a >= minutes.lo && a + width <= minutes.hi) continue;
    let s = 0;
    for (let m = a; m < a + width; m++) { const v = at(m); if (v !== null) s += v; }
    if (a < minutes.lo) s += minutes.under_lo;
    if (a + width > minutes.hi) s += minutes.at_or_over_hi;
    if (s >= best.count) return null;
  }
  return best;
}

// ---------- The round-mark smooth curve (insights_stats.poisson_poly_fit, insights_round.local_fit) ----------

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** Poisson log-link polynomial fitted by IRLS on `mask`; predictions for every x. */
function poissonPolyFit(x, y, degree, mask) {
  const n = x.length;
  const mean = npMean(x);
  const std = Math.sqrt(npMean(x.map((v) => (v - mean) ** 2)));
  const xc = x.map((v) => (v - mean) / (std + 1e-12));
  const X = xc.map((v) => Array.from({ length: degree + 1 }, (_, k) => v ** k));
  const rows = [];
  for (let i = 0; i < n; i++) if (mask[i]) rows.push(i);
  const yf = rows.map((i) => y[i]);
  let beta = new Array(degree + 1).fill(0);
  beta[0] = Math.log(Math.max(npMean(yf), 1e-9));
  for (let it = 0; it < 200; it++) {
    const k = degree + 1;
    const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1e-9 : 0)));
    const b = new Array(k).fill(0);
    for (const i of rows) {
      const eta = X[i].reduce((s, v, j) => s + v * beta[j], 0);
      const mu = Math.exp(eta);
      const z = eta + (y[i] - mu) / mu;
      for (let a = 0; a < k; a++) {
        b[a] += X[i][a] * mu * z;
        for (let c = 0; c < k; c++) A[a][c] += X[i][a] * mu * X[i][c];
      }
    }
    const next = solve(A, b);
    const done = Math.max(...next.map((v, j) => Math.abs(v - beta[j]))) < 1e-10;
    beta = next;
    if (done) break;
  }
  return X.map((row) => Math.exp(row.reduce((s, v, j) => s + v * beta[j], 0)));
}

/**
 * insights_round.local_fit for mark B (minutes) on a count function `count(minute)`: degree 3 over B − W … B + W − 1,
 * leaving out B − XL … B + XR − 1 and the two minutes before (and the minute of) every other 10- and 15-minute mark.
 */
function localFit(count, B, { W = 25, XL = 5, XR = 10, D = 3 } = {}) {
  const ms = Array.from({ length: 2 * W }, (_, i) => B - W + i);
  const y = ms.map(count);
  const mask = ms.map((m) => !(m >= B - XL && m < B + XR));
  for (let K = B - W - 2; K < B + W + 3; K++) {
    if (K !== B && (K % 10 === 0 || K % 15 === 0)) ms.forEach((m, i) => { if (m >= K - 2 && m < K + 1) mask[i] = false; });
  }
  const exp = poissonPolyFit(ms, y, D, mask);
  const i1 = ms.indexOf(B - 1);
  return { obs_pre1: y[i1], exp_pre1: exp[i1], ratio_pre1: y[i1] / exp[i1], obs_post1: y[i1 + 1] };
}

/** insights_round.cliff_index: the drop at the mark against the drops either side. */
function cliffIndex(count, K) {
  return Math.exp(Math.log(count(K - 1) / count(K)) - 0.5 * (Math.log(count(K - 3) / count(K - 2)) + Math.log(count(K + 2) / count(K + 3))));
}

// ---------- women.json ----------

const womenShare = (c) => c.F / (c.F + c.M);

/** The start of the first band from which every share is over one half (half_women.crossing), or null. */
function crossing(shares, bands) {
  for (let j = 0; j < shares.length; j++) {
    if (shares.slice(j).every((s) => s > 0.5) && (j === 0 || shares[j - 1] <= 0.5)) return bands[j].lo_s;
  }
  return null;
}

/** half_women.summarize, from the pair counts. */
function sameCitySummary(pairs) {
  const hs = pairs.map((p) => womenShare(p.half));
  const ms = pairs.map((p) => womenShare(p.marathon));
  const d = hs.map((h, i) => 100 * (h - ms[i]));
  return {
    pairs: pairs.length, cities: new Set(pairs.map((p) => p.city)).size, half_higher: d.filter((x) => x > 0).length,
    half_median: sh(npMedian(hs)), marathon_median: sh(npMedian(ms)), diff_median_points: sh(npMedian(d)),
    diff_min_points: sh(Math.min(...d)), diff_max_points: sh(Math.max(...d)),
  };
}

/** half_women's city rows: the mean of each city's pairs, sorted by the half share (then city). */
function cityRows(pairs) {
  const by = new Map();
  for (const p of pairs) { if (!by.has(p.city)) by.set(p.city, []); by.get(p.city).push(p); }
  const rows = [...by].map(([city, ps]) => ({ city, pairs: ps.length, half: sh(npMean(ps.map((p) => womenShare(p.half)))), marathon: sh(npMean(ps.map((p) => womenShare(p.marathon)))) }));
  rows.sort((a, b) => b.half - a.half || (a.city < b.city ? -1 : a.city > b.city ? 1 : 0));
  return rows;
}

// ---------- linked.json and the tool file ----------

/**
 * The marks of a window (half_linked.marks): up to three quarter-hours t with p05 < t ≤ p95, nearest the median (ties
 * to the earlier), in time order. `q` the 19 quantiles; returns the times only.
 */
function markTimes(q) {
  const med = q[9], p05 = q[0], p95 = q[18];
  const cands = [];
  for (let t = Math.max(Math.floor(p05 / 900) * 900, 900); t <= p95; t += 900) if (p05 < t && t <= p95) cands.push(t);
  cands.sort((a, b) => Math.abs(a - med) - Math.abs(b - med) || a - b);
  return cands.slice(0, 3).sort((a, b) => a - b);
}

/** The bounds a share of values under t must keep, from the quantile levels (a linear quantile over n values). */
function shareBounds(q, Q, t, n) {
  let lo = 0, hi = 1;
  for (let j = 0; j < Q.length; j++) {
    if (q[j] < t) lo = Math.max(lo, Q[j] - 1 / n);
    else hi = Math.min(hi, Q[j] + 1 / n);
  }
  return [lo, hi];
}

/** The window of the typed half's nearest whole minute in a group, or null outside its range (lib/tools/half-to-full.ts). */
function windowFor(tool, seconds, group) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const g = tool.groups[group];
  if (!g) return null;
  const h = Math.round(seconds / 60) * 60;
  if (h < g.from || h > g.to) return null;
  const row = g.w[(h - g.from) / 60];
  if (!row) return null;
  const [n, e, sus, q, marks] = row;
  return { h, n, e, sus, q, marks };
}

/** The readout's mark: the half-hour mark nearest the median, else the nearest mark (ties to the earlier). */
function readoutMark(win) {
  if (!win.marks.length) return null;
  const med = win.q[9];
  const nearest = (ms) => ms.reduce((b, m) => (Math.abs(m[0] - med) < Math.abs(b[0] - med) ? m : b));
  const hh = win.marks.filter(([t]) => t % 1800 === 0);
  return nearest(hh.length ? hh : win.marks);
}

/**
 * half_linked.goal_row on published windows: the slowest window whose median is under G; null when none is, or when it
 * is the first or the last window. `clean` reports whether the crossing is clean.
 */
function goalRow(rows, G, full) {
  let i = -1;
  rows.forEach((w, k) => { if (w.q[9] < G) i = k; });
  if (i < 0 || i === 0 || i === rows.length - 1) return null;
  const w = rows[i];
  const out = { h: w.h, n: w.n, e: w.e };
  if (full) Object.assign(out, { q50: w.q[9], p10: w.q[1], p90: w.q[17] });
  return { row: out, clean: rows[i + 1].q[9] >= G && rows[i - 1].q[9] < G };
}

/** The flagship H1's guard (spec 3.2; analysis/half_linked.flagship_guard and lib/nuggets/half.ts half.extra). */
function flagshipGuard(linked) {
  const battery = linked.checks.battery;
  const members = Object.fromEntries(battery.members.map((m) => [m.id, m]));
  const pooled = members.pooled;
  if (!pooled || !members.verified_halves || !members.one_per_person) return false;
  const extra = pooled.extra_p50_s, half = battery.pooled_half_p50_s;
  const all = Object.values(members);
  return linked.set.pairs >= MIN_CELL && linked.set.marathon_editions >= MIN_EDITIONS && extra >= 600 && extra <= 3600
    && all.every((m) => m.multiple_p50 >= 2.15 && m.multiple_p50 <= 2.25)
    && all.every((m) => Math.abs((m.multiple_p50 - 2) * half - extra) <= 180)
    && Math.abs(extra - members.verified_halves.extra_p50_s) <= 180
    && Math.abs(extra - members.one_per_person.extra_p50_s) <= 180
    && all.every((m) => m.under_double < 0.15);
}

module.exports = {
  SHARE_DIGITS, MIN_CELL, MIN_EDITIONS, MIN_EDGE_SLICE,
  pyRound, sh, r, sec, quantileSorted, quantile, ascending, pairwiseSum, npMean, npMedian, isShareOf,
  clock, pct, oneIn,
  tailedTotal, underMinutes, underBins, binOfRank, quantileBounds, densest,
  poissonPolyFit, localFit, cliffIndex,
  womenShare, crossing, sameCitySummary, cityRows,
  markTimes, shareBounds, windowFor, readoutMark, goalRow, flagshipGuard,
};
