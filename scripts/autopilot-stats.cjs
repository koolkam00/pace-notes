#!/usr/bin/env node
/**
 * Small, honest statistics for the autopilot's tiny samples (docs/AUTOPILOT.md). Plain words by default, JSON with --json.
 *
 *   node scripts/autopilot-stats.cjs ab --a 12/340 --b 19/352        A/B test: two observed rates (x of n)
 *   node scripts/autopilot-stats.cjs prepost --before 40/300 --after 52/310
 *   node scripts/autopilot-stats.cjs mde --p 0.12 --n 400             smallest difference n per group can detect
 *   node scripts/autopilot-stats.cjs need --p 0.12 --lift 0.05        visits per group to detect that difference
 *   node scripts/autopilot-stats.cjs median --values 1200,1350,980    (also p75) for web-vitals style values
 *   node scripts/autopilot-stats.cjs --self-test                      checks against published and exact values
 *
 * Methods: Wilson score intervals for each rate; Newcombe's hybrid score interval (method 10, Newcombe 1998) for the
 * difference B − A; a pooled two-proportion z-test (two-sided); and P(B > A) for Beta(1 + x, 1 + n − x) posteriors,
 * from the exact closed-form sum (Evan Miller, "Formulas for Bayesian A/B testing"), so the same input always gives
 * the same answer. Sample sizes use the normal approximation without continuity correction (Fleiss), alpha 0.05
 * two-sided and power 0.8. Quantiles interpolate linearly between order statistics (R type 7, NumPy's default).
 * No dependencies.
 */
'use strict';

const Z_975 = 1.959963984540054; // two-sided alpha 0.05
const Z_80 = 0.8416212335729143; // power 0.8

// ---------- Special functions ----------

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < 9; i += 1) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}
const logBeta = (a, b) => logGamma(a) + logGamma(b) - logGamma(a + b);

/** Complementary error function: the Taylor series of erf below 2.5, Lentz's continued fraction above (about 1e-14 relative error). */
function erfc(x) {
  const z = Math.abs(x);
  let value;
  if (z < 2.5) {
    let term = z;
    let sum = z;
    for (let n = 1; n < 100; n += 1) {
      term *= (-z * z) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    value = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    let f = z;
    let c = z;
    let d = 0;
    for (let n = 1; n < 500; n += 1) {
      d = 1 / (z + (n / 2) * d);
      c = z + n / 2 / c;
      f *= c * d;
      if (Math.abs(c * d - 1) < 1e-16) break;
    }
    value = Math.exp(-z * z) / (Math.sqrt(Math.PI) * f);
  }
  return x >= 0 ? value : 2 - value;
}
const normalCdf = (z) => 0.5 * erfc(-z / Math.SQRT2);
const normalUpperTail = (z) => 0.5 * erfc(z / Math.SQRT2);

// ---------- Proportions ----------

function parseCount(text, label) {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(text ?? ''));
  if (!match) throw new UsageError(`${label} must look like x/n, for example 12/340 (got "${text ?? ''}")`);
  const x = Number(match[1]);
  const n = Number(match[2]);
  if (n < 1) throw new UsageError(`${label}: n must be at least 1`);
  if (x > n) throw new UsageError(`${label}: x (${x}) cannot be larger than n (${n})`);
  return { x, n };
}

function wilson({ x, n }, z = Z_975) {
  const p = x / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Newcombe's hybrid score interval for p2 − p1 (method 10). */
function newcombe(first, second, z = Z_975) {
  const p1 = first.x / first.n;
  const p2 = second.x / second.n;
  const [l1, u1] = wilson(first, z);
  const [l2, u2] = wilson(second, z);
  const d = p2 - p1;
  return [d - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2), d + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2)];
}

/** Pooled two-proportion z-test of p2 − p1; two-sided p-value. */
function zTest(first, second) {
  const pooled = (first.x + second.x) / (first.n + second.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / first.n + 1 / second.n));
  if (!(se > 0)) return { z: 0, p: 1 };
  const z = (second.x / second.n - first.x / first.n) / se;
  return { z, p: Math.min(1, 2 * normalUpperTail(Math.abs(z))) };
}

/**
 * P(pB > pA) with pA ~ Beta(aA, bA) and pB ~ Beta(aB, bB), integer aB: the exact sum
 * Σ_{i=0}^{aB−1} B(aA + i, bA + bB) / ((bB + i) · B(1 + i, bB) · B(aA, bA)). Sums over the smaller first parameter.
 */
function probabilityGreater(aA, bA, aB, bB) {
  if (aB > aA) return 1 - probabilityGreater(aB, bB, aA, bA);
  const base = logBeta(aA, bA);
  let total = 0;
  for (let i = 0; i < aB; i += 1) total += Math.exp(logBeta(aA + i, bA + bB) - Math.log(bB + i) - logBeta(1 + i, bB) - base);
  return Math.min(1, Math.max(0, total));
}
const probabilityBBeatsA = (a, b) => probabilityGreater(1 + a.x, 1 + a.n - a.x, 1 + b.x, 1 + b.n - b.x);

function compare(a, b) {
  const rateA = a.x / a.n;
  const rateB = b.x / b.n;
  const [lo, hi] = newcombe(a, b);
  const test = zTest(a, b);
  return {
    a: { ...a, rate: rateA, interval95: wilson(a) },
    b: { ...b, rate: rateB, interval95: wilson(b) },
    difference: rateB - rateA,
    differenceInterval95: [lo, hi],
    relativeDifference: rateA > 0 ? rateB / rateA - 1 : null,
    z: test.z,
    pValue: test.p,
    probabilityBHigher: probabilityBBeatsA(a, b),
    intervalExcludesZero: lo > 0 || hi < 0,
  };
}

// ---------- Sample size ----------

/** Visits per group to detect p → p + lift (two-sided alpha 0.05, power 0.8, no continuity correction). */
function sampleSize(p, lift) {
  const p2 = p + lift;
  const mean = (p + p2) / 2;
  const top = Z_975 * Math.sqrt(2 * mean * (1 - mean)) + Z_80 * Math.sqrt(p * (1 - p) + p2 * (1 - p2));
  return (top * top) / (lift * lift);
}

/** The smallest absolute difference (up and down) that n per group detects: the inverse of sampleSize by bisection. */
function minimumDetectable(p, n) {
  const solve = (direction) => {
    const limit = direction > 0 ? 1 - p : p;
    if (limit <= 0 || sampleSize(p, direction * limit) > n) return null;
    let lo = 0; let hi = limit;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      if (sampleSize(p, direction * mid) > n) lo = mid; else hi = mid;
    }
    return hi;
  };
  return { up: solve(1), down: solve(-1) };
}

// ---------- Quantiles ----------

function parseValues(text) {
  const values = String(text ?? '').split(',').map((part) => part.trim()).filter(Boolean).map(Number);
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new UsageError('--values must be a comma-separated list of numbers, for example 1200,1350,980');
  return values;
}
function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

// ---------- Words ----------

const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const points = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)} points`;
const pValueText = (p) => (p < 0.001 ? 'below 0.001' : p.toFixed(3));
const probabilityText = (p) => (p > 0.99 ? 'more than 99%' : p < 0.01 ? 'less than 1%' : pct(p, 0));

function describeComparison(result, { first, second, prepost }) {
  const { a, b } = result;
  const [lo, hi] = result.differenceInterval95;
  const lines = [
    `${first}: ${a.x} of ${a.n} (${pct(a.rate)}, 95% interval ${pct(a.interval95[0])} to ${pct(a.interval95[1])})`,
    `${second}: ${b.x} of ${b.n} (${pct(b.rate)}, 95% interval ${pct(b.interval95[0])} to ${pct(b.interval95[1])})`,
    `Difference ${second} − ${first}: ${points(result.difference)} (95% interval ${points(lo)} to ${points(hi)})${result.relativeDifference === null ? '' : `, ${result.relativeDifference >= 0 ? '+' : '−'}${Math.abs(result.relativeDifference * 100).toFixed(0)}% relative`}`,
    `Two-sided p-value ${pValueText(result.pValue)} (z = ${result.z.toFixed(2)})`,
    `Probability that the ${prepost ? 'after' : 'B'} rate is really higher (uniform priors): ${probabilityText(result.probabilityBHigher)}`,
  ];
  const small = Math.min(a.n, b.n) < 100 || Math.min(a.x, b.x, a.n - a.x, b.n - b.x) < 10;
  if (result.intervalExcludesZero) lines.push(`Reading: the 95% interval excludes zero, so ${result.difference > 0 ? 'an increase' : 'a decrease'} is likely real, though its size is uncertain (anywhere from ${points(lo)} to ${points(hi)}).`);
  else lines.push(`Reading: the 95% interval includes zero, so this does not show a difference${small ? '; the samples are small, so only a large effect could show up' : ''}. Call it inconclusive rather than a win or a loss.`);
  if (small) lines.push('Small sample: fewer than 100 visits or fewer than 10 events in a group; treat every number above as rough.');
  if (prepost) lines.push('Before/after comparisons are not experiments: seasonality, traffic mix (a new link, a race weekend) and other changes can move the rate on their own. Prefer an A/B test when the decision matters.');
  return lines.join('\n');
}

// ---------- CLI ----------

class UsageError extends Error {}
const USAGE = 'Usage: node scripts/autopilot-stats.cjs ab --a x/n --b x/n | prepost --before x/n --after x/n | mde --p <rate> --n <per group> | need --p <rate> --lift <difference> | median|p75 --values a,b,c [--json] | --self-test';

function rate(text, label) {
  const value = Number(text);
  if (!(text !== undefined && Number.isFinite(value) && value > 0 && value < 1)) throw new UsageError(`${label} must be a rate between 0 and 1, for example 0.12 (got "${text ?? ''}")`);
  return value;
}

function run(argv) {
  const [command] = argv;
  const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  if (command === 'ab' || command === 'prepost') {
    const prepost = command === 'prepost';
    const a = parseCount(option(prepost ? '--before' : '--a'), prepost ? '--before' : '--a');
    const b = parseCount(option(prepost ? '--after' : '--b'), prepost ? '--after' : '--b');
    const result = { command, ...compare(a, b) };
    if (prepost) result.note = 'Before/after comparisons are not experiments (seasonality, traffic mix).';
    return { result, text: describeComparison(result, prepost ? { first: 'Before', second: 'After', prepost } : { first: 'A', second: 'B' }) };
  }
  if (command === 'mde') {
    const p = rate(option('--p'), '--p');
    const n = Number(option('--n'));
    if (!(Number.isFinite(n) && n >= 2)) throw new UsageError('--n must be the number of visits per group (at least 2)');
    const { up, down } = minimumDetectable(p, n);
    const result = { command, baseline: p, perGroup: n, alpha: 0.05, power: 0.8, minimumDetectableIncrease: up, minimumDetectableDecrease: down };
    const text = up === null
      ? `With ${n} visits per group and a ${pct(p)} baseline, no increase is reliably detectable.`
      : `With ${n} visits per group and a ${pct(p)} baseline, a test detects (80% power, two-sided 5% level) an increase of at least ${points(up)} (to ${pct(p + up)}, ${(up / p * 100).toFixed(0)}% relative)${down === null ? '' : ` or a decrease of at least ${points(-down)}`}. Smaller real changes would usually be missed.`;
    return { result, text };
  }
  if (command === 'need') {
    const p = rate(option('--p'), '--p');
    const lift = Number(option('--lift'));
    if (!(Number.isFinite(lift) && lift !== 0 && p + lift > 0 && p + lift < 1)) throw new UsageError('--lift must be an absolute difference such that the new rate stays between 0 and 1, for example 0.05');
    const exact = sampleSize(p, lift);
    const perGroup = Math.ceil(exact);
    const result = { command, baseline: p, lift, target: p + lift, alpha: 0.05, power: 0.8, perGroup, total: perGroup * 2, exact };
    return { result, text: `To detect ${pct(p)} → ${pct(p + lift)} (${points(lift)}) with 80% power at the two-sided 5% level: ${perGroup.toLocaleString('en-US')} visits per group, ${(perGroup * 2).toLocaleString('en-US')} in total.` };
  }
  if (command === 'median' || command === 'p75') {
    const values = parseValues(option('--values'));
    const q = command === 'median' ? 0.5 : 0.75;
    const value = quantile(values, q);
    const result = { command, n: values.length, quantile: q, value, min: Math.min(...values), max: Math.max(...values) };
    return { result, text: `${command === 'median' ? 'Median' : '75th percentile'} of ${values.length} value${values.length === 1 ? '' : 's'}: ${Number(value.toFixed(3))} (range ${result.min} to ${result.max})${values.length < 20 ? '. Fewer than 20 values: a rough guide only.' : ''}` };
  }
  throw new UsageError(command ? `unknown command "${command}"` : 'no command given');
}

// ---------- Self-test ----------

function selfTest() {
  const failures = [];
  let checks = 0;
  const near = (label, got, want, tolerance) => {
    checks += 1;
    if (!(Math.abs(got - want) <= tolerance)) failures.push(`${label}: got ${got}, expected ${want} ± ${tolerance}`);
  };
  // Wilson intervals: Newcombe (1998a), Statistics in Medicine 17:857, Table I, method 3.
  for (const [x, n, lo, hi] of [[81, 263, 0.2553, 0.3662], [15, 148, 0.0624, 0.1605], [0, 20, 0, 0.1611], [1, 29, 0.0061, 0.1718]]) {
    const [l, u] = wilson({ x, n });
    near(`Wilson ${x}/${n} lower`, l, lo, 0.00006); near(`Wilson ${x}/${n} upper`, u, hi, 0.00006);
  }
  // Newcombe (1998b), Statistics in Medicine 17:873, Table II, method 10 (hybrid score), for p1 − p2; here B − A.
  for (const [x1, n1, x2, n2, lo, hi] of [[56, 70, 48, 80, 0.0524, 0.3339], [9, 10, 3, 10, 0.1705, 0.8090], [5, 56, 0, 29, -0.0381, 0.1926]]) {
    const [l, u] = newcombe({ x: x2, n: n2 }, { x: x1, n: n1 });
    near(`Newcombe ${x1}/${n1} − ${x2}/${n2} lower`, l, lo, 0.00006); near(`Newcombe ${x1}/${n1} − ${x2}/${n2} upper`, u, hi, 0.00006);
  }
  // Normal tail and the z-test.
  near('P(|Z| > 1.959964)', 2 * normalUpperTail(Z_975), 0.05, 1e-12);
  near('Phi(-3)', normalCdf(-3), 0.0013498980316301, 1e-14);
  near('Phi(1)', normalCdf(1), 0.8413447460685429, 1e-14);
  near('Phi(-8)', normalCdf(-8), 6.22096057427178e-16, 1e-27);
  const zt = zTest({ x: 48, n: 80 }, { x: 56, n: 70 });
  const pooled = 104 / 150;
  const zWant = 0.2 / Math.sqrt(pooled * (1 - pooled) * (1 / 70 + 1 / 80));
  near('z-test z (56/70 vs 48/80)', zt.z, zWant, 1e-12);
  near('z-test p (56/70 vs 48/80), against Python math.erfc', zt.p, 0.00804508136819659, 1e-12);
  near('z-test with no events', zTest({ x: 0, n: 10 }, { x: 0, n: 12 }).p, 1, 0);
  // P(B > A): closed forms for small Beta parameters, and symmetry.
  near('P(Beta(2,1) > Beta(1,1))', probabilityGreater(1, 1, 2, 1), 2 / 3, 1e-12);
  near('P(Beta(1,1) > Beta(2,1))', probabilityGreater(2, 1, 1, 1), 1 / 3, 1e-12);
  near('P(Beta(2,1) > Beta(1,2))', probabilityGreater(1, 2, 2, 1), 5 / 6, 1e-12);
  near('P(B > A), same counts', probabilityBBeatsA({ x: 37, n: 410 }, { x: 37, n: 410 }), 0.5, 1e-9);
  const mirrored = probabilityBBeatsA({ x: 12, n: 340 }, { x: 19, n: 352 }) + probabilityBBeatsA({ x: 19, n: 352 }, { x: 12, n: 340 });
  near('P(B > A) + P(A > B)', mirrored, 1, 1e-9);
  // Against a numerical integral of f_B(t) F_A(t) on a fine grid (midpoint rule).
  const integral = (a, b, steps = 200000) => {
    const [aA, bA, aB, bB] = [1 + a.x, 1 + a.n - a.x, 1 + b.x, 1 + b.n - b.x];
    const density = (t, al, be) => Math.exp((al - 1) * Math.log(t) + (be - 1) * Math.log(1 - t) - logBeta(al, be));
    let cdfA = 0; let total = 0; const h = 1 / steps;
    for (let k = 0; k < steps; k += 1) {
      const t = (k + 0.5) * h;
      const fA = density(t, aA, bA) * h;
      total += density(t, aB, bB) * h * (cdfA + fA / 2);
      cdfA += fA;
    }
    return total;
  };
  for (const [a, b] of [[{ x: 12, n: 340 }, { x: 19, n: 352 }], [{ x: 3, n: 20 }, { x: 9, n: 21 }], [{ x: 410, n: 1200 }, { x: 455, n: 1210 }]]) {
    near(`P(B > A) ${a.x}/${a.n} vs ${b.x}/${b.n} against integration`, probabilityBBeatsA(a, b), integral(a, b), 2e-6);
  }
  // Sample size: 10% → 15% needs 686 per group (Fleiss, no continuity correction); mde inverts it.
  near('need 0.10 → 0.15', Math.ceil(sampleSize(0.1, 0.05)), 686, 0);
  near('need 0.50 → 0.60', Math.ceil(sampleSize(0.5, 0.1)), 388, 0);
  near('mde inverts need', minimumDetectable(0.1, sampleSize(0.1, 0.05)).up, 0.05, 1e-9);
  near('mde decrease inverts need', minimumDetectable(0.3, sampleSize(0.3, -0.08)).down, 0.08, 1e-9);
  // Quantiles (type 7).
  near('median odd', quantile([5, 1, 3], 0.5), 3, 0);
  near('median even', quantile([4, 1, 3, 2], 0.5), 2.5, 0);
  near('p75', quantile([1, 2, 3, 4, 5], 0.75), 4, 0);
  near('p75 interpolated', quantile([10, 20, 30, 40], 0.75), 32.5, 1e-12);
  near('single value', quantile([7], 0.75), 7, 0);
  // Determinism and the CLI.
  const once = JSON.stringify(run(['ab', '--a', '12/340', '--b', '19/352']).result);
  const twice = JSON.stringify(run(['ab', '--a', '12/340', '--b', '19/352']).result);
  checks += 1;
  if (once !== twice) failures.push('ab: the same input gave different output');
  const pre = run(['prepost', '--before', '40/300', '--after', '52/310']);
  checks += 1;
  if (!/not experiments/.test(pre.text) || !pre.result.note) failures.push('prepost: no note that before/after is not an experiment');
  for (const bad of [['ab', '--a', '5/3', '--b', '1/2'], ['ab', '--a', '1/0', '--b', '1/2'], ['ab', '--a', 'x', '--b', '1/2'], ['mde', '--p', '1.2', '--n', '10'], ['need', '--p', '0.9', '--lift', '0.2'], ['median', '--values', '1,a'], ['nope']]) {
    checks += 1;
    try { run(bad); failures.push(`${bad.join(' ')}: accepted`); } catch (error) { if (!(error instanceof UsageError)) failures.push(`${bad.join(' ')}: ${error.message}`); }
  }
  if (failures.length) {
    console.error(`autopilot-stats self-test: ${failures.length} of ${checks} checks failed`);
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(`autopilot-stats self-test: ${checks} checks passed (Wilson and Newcombe against published tables, exact Beta probabilities, sample sizes, quantiles)`);
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  try {
    const { result, text } = run(argv);
    console.log(argv.includes('--json') ? JSON.stringify(result, null, 2) : text);
    return 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`autopilot-stats: ${error.message}\n${USAGE}`);
    return 2;
  }
}

module.exports = { wilson, newcombe, zTest, probabilityBBeatsA, sampleSize, minimumDetectable, quantile, compare };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
