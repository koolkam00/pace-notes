/*
 * The terrain splits' grade model in plain JavaScript, written apart from analysis/terrain_model.py so scripts/verify-tools.cjs
 * can recompute every published share from the published model input (tools/course-terrain.json `route`) without Python.
 * It follows the normative pipeline (analysis/course_terrain/validation-2026-10-23/terrain_model.py, without its sensitivity
 * parameter) step by step, with numpy's own conventions spelled out where they matter:
 *
 *   f(g) = 1 + A1 g + A2 g^2, g = grade in percent, clamped to [-10, 10];
 *   1. stable sort by distance, then stretch linearly to 42.195 km: d = (d - d[0]) * 42.195 / (d[-1] - d[0]);
 *   2. grid x = linspace(0, 42.195, 4221) (x_i = i * step, the last point exactly 42.195);
 *   3. z = interp(x, d, elevation), linear, held at the end values outside the route;
 *   4. centred running median over 21 samples, edges padded with the nearest value;
 *   5. Gaussian, sigma 10 samples, kernel exp(-0.5 (k / sigma)^2) for k = -40..40 normalised to sum 1, edges padded with the
 *      nearest value, 'valid' convolution (N outputs);
 *   6. grade = numpy.gradient(z, x * 1000) * 100: second-order central differences for uneven spacing inside, one-sided
 *      first differences at the two ends;
 *   7. trapezoid weights w_i = (f(g_i) + f(g_i+1)) / 2 * (x_i+1 - x_i); U = [0, cumsum(w)] / cumsum(w)[-1];
 *   8. u(d) = interp(d, x, U).
 *
 * No Pace Notes data enters it: the goal only sets the scale (elapsed time at d is goal * u(d)).
 */
'use strict';

const KM = 42.195;
const GRID_POINTS = 4221;
const A1 = 0.02869556;
const A2 = 0.001520768;
const GMAX = 10;
const MEDIAN_SAMPLES = 21;
const SIGMA_SAMPLES = 10;
const KERNEL_HALF_WIDTH = 40;
const MILE_KM = 1.609344;

/** Pace on a grade divided by pace on the flat at equal effort (g in percent, clamped to ±10). */
function f(g) {
  const c = Math.min(GMAX, Math.max(-GMAX, g));
  return 1 + A1 * c + A2 * c * c;
}

/** numpy.linspace(0, KM, GRID_POINTS). */
function grid() {
  const step = KM / (GRID_POINTS - 1);
  const x = new Float64Array(GRID_POINTS);
  for (let i = 0; i < GRID_POINTS; i++) x[i] = i * step;
  x[GRID_POINTS - 1] = KM;
  return x;
}

/** numpy.interp(q, xs, ys) for one query: binary search, then the slope form numpy uses; the end values outside. */
function interp1(q, xs, ys) {
  const n = xs.length;
  if (q <= xs[0]) return ys[0];
  if (q >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= q) lo = mid; else hi = mid; }
  if (q === xs[lo]) return ys[lo];
  const slope = (ys[lo + 1] - ys[lo]) / (xs[lo + 1] - xs[lo]);
  return slope * (q - xs[lo]) + ys[lo];
}

const interp = (qs, xs, ys) => Float64Array.from(qs, (q) => interp1(q, xs, ys));

/** Pad with the nearest value (numpy.pad mode='edge'). */
function padEdge(z, h) {
  const out = new Float64Array(z.length + 2 * h);
  for (let i = 0; i < out.length; i++) out[i] = z[Math.min(z.length - 1, Math.max(0, i - h))];
  return out;
}

/** Centred running median over w (odd) samples, edges padded with the nearest value. */
function rollingMedian(z, w = MEDIAN_SAMPLES) {
  const h = w >> 1;
  const p = padEdge(z, h);
  const out = new Float64Array(z.length);
  const win = new Float64Array(w);
  for (let i = 0; i < z.length; i++) {
    for (let k = 0; k < w; k++) win[k] = p[i + k];
    win.sort();
    out[i] = win[h];
  }
  return out;
}

/** Centred Gaussian smoothing, edges padded with the nearest value, 'valid' convolution. */
function gaussian(z, sigma = SIGMA_SAMPLES, r = KERNEL_HALF_WIDTH) {
  const k = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let j = -r; j <= r; j++) { k[j + r] = Math.exp(-0.5 * (j / sigma) ** 2); sum += k[j + r]; }
  for (let j = 0; j < k.length; j++) k[j] /= sum;
  const p = padEdge(z, r);
  const out = new Float64Array(z.length);
  for (let i = 0; i < z.length; i++) {
    let acc = 0;
    for (let j = 0; j < k.length; j++) acc += p[i + j] * k[k.length - 1 - j];
    out[i] = acc;
  }
  return out;
}

/** numpy.gradient(z, h) with a coordinate array h (edge_order 1). */
function gradient(z, h) {
  const n = z.length;
  const g = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const dx1 = h[i] - h[i - 1], dx2 = h[i + 1] - h[i];
    const a = -dx2 / (dx1 * (dx1 + dx2)), b = (dx2 - dx1) / (dx1 * dx2), c = dx1 / (dx2 * (dx1 + dx2));
    g[i] = a * z[i - 1] + b * z[i] + c * z[i + 1];
  }
  g[0] = (z[1] - z[0]) / (h[1] - h[0]);
  g[n - 1] = (z[n - 1] - z[n - 2]) / (h[n - 1] - h[n - 2]);
  return g;
}

/** The model from the route input: { x, z (smoothed m), g (grade %), U (share of the goal at each x) }. */
function model(dKm, zM) {
  if (!Array.isArray(dKm) || dKm.length !== zM.length || dKm.length < 2) throw new Error('terrain model: a route needs matching distance and elevation arrays');
  const order = dKm.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
  const d0 = dKm[order[0]], d1 = dKm[order[order.length - 1]];
  const d = Float64Array.from(order, (i) => ((dKm[i] - d0) * KM) / (d1 - d0));
  const elev = Float64Array.from(order, (i) => zM[i]);
  const x = grid();
  const z = gaussian(rollingMedian(interp(x, d, elev)));
  const g = gradient(z, Float64Array.from(x, (v) => v * 1000)).map((v) => v * 100);
  const T = new Float64Array(GRID_POINTS);
  for (let i = 1; i < GRID_POINTS; i++) T[i] = T[i - 1] + 0.5 * (f(g[i]) + f(g[i - 1])) * (x[i] - x[i - 1]);
  const U = T.map((t) => t / T[GRID_POINTS - 1]);
  return { x, z, g, U };
}

/** Share of the goal at official distance(s) d km. */
const uAt = (m, d) => (Array.isArray(d) ? d.map((v) => interp1(v, m.x, m.U)) : interp1(d, m.x, m.U));

/** What the builder publishes for a course, unrounded: u at 1..42 km, 1..26 mi and halfway, the max |grade| and the 0.5 km strip. */
function published(dKm, zM) {
  const m = model(dKm, zM);
  return {
    km: uAt(m, Array.from({ length: 42 }, (_, i) => i + 1)),
    mi: uAt(m, Array.from({ length: 26 }, (_, i) => (i + 1) * MILE_KM)),
    half: uAt(m, KM / 2),
    maxGrade: m.g.reduce((a, v) => Math.max(a, Math.abs(v)), 0),
    strip: Array.from({ length: 85 }, (_, i) => interp1(i * 0.5, m.x, m.z)),
    model: m,
  };
}

module.exports = { KM, GRID_POINTS, A1, A2, GMAX, MEDIAN_SAMPLES, SIGMA_SAMPLES, KERNEL_HALF_WIDTH, MILE_KM, f, grid, interp1, rollingMedian, gaussian, gradient, model, uAt, published };
