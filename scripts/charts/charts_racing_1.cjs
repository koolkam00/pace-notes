// Recounts of the racing charts in analysis/charts_racing_1.py (scripts/verify-charts.cjs). Every pair count is exact, rebuilt
// here with sweeps, merges and Fenwick trees rather than the builder's merge-sort tree and binary searches.
const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const MATS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'];
const TOL = 5;

/** Start-screened editions (the shape screen is edition-level) with at least `min` finishes, in index order. */
function screened(C, min) {
  const flagged = new Set(C.shapeFlagged), out = [];
  for (let e = 0; e < C.editions.length; e++) if (!flagged.has(e) && C.edN[e] >= min) out.push(e);
  return out;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);

class Fenwick {
  constructor(n) { this.t = new Int32Array(n + 1); }
  add(i) { for (i++; i < this.t.length; i += i & -i) this.t[i]++; }
  /** How many inserted ranks are at most i. */
  upTo(i) { let s = 0; for (i++; i > 0; i -= i & -i) s += this.t[i]; return s; }
}

/** Dense ranks (0…) of the values of `rows` under `valueOf`, as a Map-free array aligned with rows. */
function denseRanks(vals) {
  const sorted = Float64Array.from(vals).sort();
  const uniq = [];
  for (let i = 0; i < sorted.length; i++) if (!i || sorted[i] !== sorted[i - 1]) uniq.push(sorted[i]);
  const u = Float64Array.from(uniq);
  return Int32Array.from(vals, (v) => {
    let lo = 0, hi = u.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (u[mid] < v) lo = mid + 1; else hi = mid; }
    return lo;
  });
}

/** Share of (woman, man) pairs with the woman strictly quicker at mat k, a tie counting half: a merge of two sorted lists. */
function womanAhead(C, W, M, k) {
  const w = Float64Array.from(W, (i) => C.times[i * 9 + k]).sort(), m = Float64Array.from(M, (i) => C.times[i * 9 + k]).sort();
  let j = 0, total = 0;
  // Walk the women in time order; j counts men strictly quicker, then the run of equal men is a tie.
  for (let x = 0; x < w.length; x++) {
    while (j < m.length && m[j] < w[x]) j++;
    let t = j;
    while (t < m.length && m[t] === w[x]) t++;
    total += (m.length - t) + 0.5 * (t - j);
  }
  return total / (w.length * m.length);
}
const X_KM = [0, 1, 2, 3, 4, 5, 6, 7, 7.439];

/** In-step pairs (within 5 s at 5, 10, 15 and 20K) in screened editions of 1,000+ finishes, by direct search. */
let pairCache = null;
function inStep(C) {
  if (pairCache && pairCache.C === C) return pairCache;
  const eds = screened(C, 1000);
  const pairs = []; // [t20 of the earlier, edition, survival flags at 20K, 25K, 30K, 35K, 40K, finish]
  const has20 = new Uint8Array(C.n), full = new Uint8Array(C.n);
  const T = C.times;
  for (const e of eds) {
    const rows = Array.from(C.rowsOf(e)).sort((a, b) => T[a * 9 + 3] - T[b * 9 + 3] || a - b);
    for (let x = 0; x < rows.length; x++) {
      const i = rows[x];
      for (let y = x + 1; y < rows.length && T[rows[y] * 9 + 3] - T[i * 9 + 3] <= TOL; y++) {
        const j = rows[y];
        let ok = true;
        for (let k = 0; k < 3 && ok; k++) ok = Math.abs(T[j * 9 + k] - T[i * 9 + k]) <= TOL;
        if (!ok) continue;
        const surv = [];
        let still = true;
        for (let k = 3; k < 9; k++) { still = still && Math.abs(T[j * 9 + k] - T[i * 9 + k]) <= TOL; surv.push(still); }
        pairs.push([Math.min(T[i * 9 + 3], T[j * 9 + 3]), e, surv]);
        has20[i] = has20[j] = 1;
        if (still) full[i] = full[j] = 1;
      }
    }
  }
  const keep = new Uint8Array(C.n);
  for (const e of eds) for (const i of C.rowsOf(e)) keep[i] = 1;
  pairCache = { C, pairs, has20, full, keep, eds };
  return pairCache;
}

const BANDS = [[9900, 11700, '2:45–3:15'], [11700, 13500, '3:15–3:45'], [13500, 15300, '3:45–4:15'], [15300, 17100, '4:15–4:45'], [17100, 18900, '4:45–5:15']];
const bandOf = (t20) => { const p = t20 * 42.195 / 20; return BANDS.findIndex(([lo, hi]) => p >= lo && p < hi); };
const FIN_BANDS = [[0, 10800, 'Under 3:00'], [10800, 12600, '3:00–3:30'], [12600, 14400, '3:30–4:00'], [14400, 16200, '4:00–4:30'], [16200, 18000, '4:30–5:00'], [18000, 19800, '5:00–5:30'], [19800, 21600, '5:30–6:00'], [21600, 1e9, '6:00+']];
const SLOW = 6;
const GAPS = [0, 60, 120, 300, 600, 900, 1200, 1800];
const GAP_LABELS = ['0–1', '1–2', '2–5', '5–10', '10–15', '15–20', '20–30'];

module.exports = {
  'when-the-front-1-percent-finish': (C, file, H) => {
    const eds = screened(C, 2000), shares = Array.from({ length: 9 }, () => []), t1s = [];
    let n = 0, nMin = Infinity;
    for (const e of eds) {
      const rows = C.rowsOf(e);
      const t1 = H.quantileSorted(Float64Array.from(rows, (i) => C.finish[i]).sort(), 0.01);
      t1s.push(t1);
      for (let k = 0; k < 9; k++) { let c = 0; for (const i of rows) if (C.times[i * 9 + k] <= t1) c++; shares[k].push(c / rows.length); }
      n += rows.length; nMin = Math.min(nMin, rows.length);
    }
    const med = shares.map((s) => H.median(s));
    return {
      values: { past20: med[3], past25: med[4], past30: med[5], past35: med[6], past40: med[7], t1: H.median(t1s), eds: eds.length, n_min: nMin },
      plot: { cols: med.slice(3).map((v, j) => ({ label: MATS[j + 3], value: v, tone: j === 2 ? 'signal' : 'quiet' })) },
      cohort_n: n,
    };
  },

  'women-move-up-after-20k': (C, file, H) => {
    const S = [];
    let n = 0, nMin = Infinity;
    for (const e of screened(C, 1000)) {
      if (C.genderGapEdition[e]) continue;
      const rows = Array.from(C.rowsOf(e)), W = rows.filter((i) => C.gender[i] === 2), M = rows.filter((i) => C.gender[i] === 1);
      if (rows.length - W.length - M.length > 0.02 * rows.length || W.length < 100 || M.length < 100) continue;
      S.push(MATS.map((_, k) => womanAhead(C, W, M, k)));
      n += rows.length; nMin = Math.min(nMin, W.length, M.length);
    }
    const med = MATS.map((_, k) => H.median(S.map((r) => r[k])));
    const up = S.map((r) => r[8] - r[3]);
    return {
      values: { s5: med[0], s20: med[3], s30: med[5], s40: med[7], sfin: med[8], rise: H.median(up), eds_up: up.filter((d) => d > 0).length, eds: S.length, n_min: nMin },
      plot: { series: [{ label: 'Woman ahead', tone: 'signal', points: med.map((v, k) => [X_KM[k], v]) },
        { label: '20K mark', tone: 'ink', points: [[X_KM[3], med[3]]] }, { label: 'Finish mark', tone: 'signal', points: [[X_KM[8], med[8]]] }] },
      cohort_n: n,
    };
  },

  'pairs-in-step-split-up': (C, file, H) => {
    const P = inStep(C);
    const S = BANDS.map(() => new Float64Array(6)), N = new Float64Array(BANDS.length);
    const perEd = BANDS.map(() => new Map());
    for (const [t20, e, surv] of P.pairs) {
      const b = bandOf(t20);
      if (b < 0) continue;
      N[b]++;
      surv.forEach((s, k) => { if (s) S[b][k]++; });
      const m = perEd[b].get(e) || [0, 0];
      m[0]++; if (surv[5]) m[1]++;
      perEd[b].set(e, m);
    }
    const surv = S.map((row, b) => Array.from(row, (x) => x / N[b]));
    const edMed = perEd.map((m) => H.median([...m.values()].filter(([d]) => d >= 100).map(([d, h]) => h / d)));
    const fd = new Float64Array(5), fh = new Float64Array(5);
    for (let i = 0; i < C.n; i++) { if (!P.has20[i]) continue; const b = bandOf(C.times[i * 9 + 3]); if (b < 0) continue; fd[b]++; if (P.full[i]) fh[b]++; }
    const fin = Array.from(fd, (d, b) => fh[b] / d);
    const values = { slow: surv[4][5], fast: surv[0][5], mid: surv[2][5], n_fast: N[0], n_slow: N[4], slow_f: fin[4], fast_f: fin[0], slow_ed: edMed[4], fast_ed: edMed[0] };
    for (let b = 0; b < 5; b++) Object.assign(values, { [`pair${b}`]: surv[b][5], [`fin${b}`]: fin[b], [`race${b}`]: edMed[b] });
    // Where the 2:45–3:15 pairs parted: count each pair once, at the first mat after 20K where it is more than 5 s apart.
    const first = new Float64Array(6);
    let quick = 0;
    for (const [t20, , sv] of P.pairs) {
      if (bandOf(t20) !== 0) continue;
      quick++;
      const k = sv.indexOf(false);
      first[k < 0 ? 0 : k]++;     // k ≥ 1: parted in the section ending at mat k; never: slot 0
    }
    const parted = [1, 2, 3, 4, 5].map((k) => first[k] / quick);
    const LAB = ['20–25K', '25–30K', '30–35K', '35–40K', '40K–finish'];
    Object.assign(values, { at25: 1 - parted[0], apart25: parted[0], top_part: Math.max(...parted) });
    parted.forEach((v, j) => { values[`part${j}`] = v; });
    return {
      values,
      plot: { rows: [...parted.map((v, j) => ({ label: LAB[j], value: v, tone: j === 0 ? 'signal' : 'quiet' })), { label: 'Still in step', value: first[0] / quick, tone: 'ink' }] },
      cohort_n: P.keep.reduce((a, x) => a + x, 0),
    };
  },

  'matched-at-every-mat': (C) => {
    const P = inStep(C);
    let d = 0, h = 0;
    const rows = FIN_BANDS.map(([lo, hi, label], b) => {
      let bd = 0, bh = 0;
      for (let i = 0; i < C.n; i++) if (P.keep[i] && C.finish[i] >= lo && C.finish[i] < hi) { bd++; if (P.full[i]) bh++; }
      d += bd; h += bh;
      return { label, value: bh / bd, tone: b === SLOW ? 'signal' : b === 0 ? 'ink' : 'quiet' };
    });
    const top = Math.max(...rows.map((r) => r.value));
    return {
      values: { all: h / d, slow: rows[SLOW].value, fast: rows[0].value, top, matched: h },
      plot: { rows: [...rows, { label: 'All finishes', value: h / d, tone: 'faint' }] },
      cohort_n: d,
    };
  },

  'leads-overturned': (C, file, H) => {
    const eds = screened(C, 1000), shares = { 3: GAP_LABELS.map(() => []), 5: GAP_LABELS.map(() => []) };
    const pooled = { 3: GAP_LABELS.map(() => [0, 0]), 5: GAP_LABELS.map(() => [0, 0]) };
    let pairsMin = Infinity, n = 0;
    for (const e of eds) {
      const rows = Array.from(C.rowsOf(e));
      n += rows.length;
      const rank = denseRanks(rows.map((i) => C.finish[i]));
      for (const k of [3, 5]) {
        const ord = rows.map((_, j) => j).sort((x, y) => C.times[rows[x] * 9 + k] - C.times[rows[y] * 9 + k]);
        const t = Float64Array.from(ord, (j) => C.times[rows[j] * 9 + k]);
        // For each edge: a Fenwick tree over finish ranks of the first s positions, s the count of splits below t + edge.
        const fws = GAPS.map(() => new Fenwick(rows.length)), ptr = new Int32Array(GAPS.length);
        const tot = new Float64Array(GAPS.length), less = new Float64Array(GAPS.length), leq = new Float64Array(GAPS.length);
        for (let p = 0; p < ord.length; p++) {
          const ti = t[p], ri = rank[ord[p]];
          for (let q = 0; q < GAPS.length; q++) {
            const fw = fws[q], lim = ti + GAPS[q];
            if (q === 0) while (ptr[q] < ord.length && t[ptr[q]] <= ti) { fw.add(rank[ord[ptr[q]]]); ptr[q]++; }
            else while (ptr[q] < ord.length && t[ptr[q]] < lim) { fw.add(rank[ord[ptr[q]]]); ptr[q]++; }
            tot[q] += ptr[q];
            less[q] += ri ? fw.upTo(ri - 1) : 0;
            leq[q] += fw.upTo(ri);
          }
        }
        for (let b = 0; b < GAP_LABELS.length; b++) {
          const ties = (leq[b + 1] - less[b + 1]) - (leq[b] - less[b]);
          const pairs = tot[b + 1] - tot[b] - ties, rev = less[b + 1] - less[b];
          shares[k][b].push(rev / pairs);
          pooled[k][b][0] += pairs; pooled[k][b][1] += rev;
          if (pairs < 100) throw new Error(`edition ${e}: ${pairs} pairs ${GAP_LABELS[b]} min apart at ${MATS[k]}`);
          if (k === 3) pairsMin = Math.min(pairsMin, pairs);
        }
      }
    }
    const med = { 3: shares[3].map((s) => H.median(s)), 5: shares[5].map((s) => H.median(s)) };
    return {
      values: { p20: med[3][3], p20_pooled: pooled[3][3][1] / pooled[3][3][0], p30: med[5][3], p20_1: med[3][0], p20_15: med[3][5], pairs_min: pairsMin },
      plot: { rows: med[3].map((v, b) => ({ label: `${GAP_LABELS[b]} min`, value: v, tone: b === 3 ? 'signal' : b === 0 ? 'ink' : 'quiet' })) },
      cohort_n: n,
    };
  },

  'time-in-hand-for-4': (C) => {
    const series = {}, values = {};
    let n = 0;
    for (let i = 0; i < C.n; i++) if (C.shapeKeep[i]) n++;
    for (const k of [3, 5, 6, 7]) {
      const d = new Float64Array(27), h = new Float64Array(27);
      for (let i = 0; i < C.n; i++) {
        if (!C.shapeKeep[i]) continue;
        const b = Math.floor((14400 * POINTS[k] / 42.195 - C.times[i * 9 + k] + 15) / 30);
        if (b < -6 || b > 20) continue;
        d[b + 6]++; if (C.finish[i] < 14400) h[b + 6]++;
      }
      const pts = Array.from(d, (x, j) => [(j - 6) * 30, h[j] / x]);
      series[k] = { label: MATS[k], points: pts };
      values[k] = { on: h[6] / d[6], n: d[6], half: pts.find(([, y]) => y >= 0.5)[0] };
    }
    return {
      values: { on: values[3].on, on30: values[5].on, on35: values[6].on, on40: values[7].on, n_on: values[3].n, half20: values[3].half, half40: values[7].half },
      plot: { series: [series[7], series[3]], refs: [{ value: 0.5 }] },
      cohort_n: n,
    };
  },

  'slowing-that-still-gained': (C, file, H) => {
    const keepEd = new Set(screened(C, 1000));
    const keep = (i) => keepEd.has(C.edition[i]);
    const r20 = H.editionRanks((i) => C.times[i * 9 + 3], keep), r40 = H.editionRanks((i) => C.times[i * 9 + 7], keep);
    const crossing = (pred) => {
      const bins = new Map();
      for (let i = 0; i < C.n; i++) {
        if (!keep(i) || !pred(i)) continue;
        const t20 = C.times[i * 9 + 3], t40 = C.times[i * 9 + 7];
        const b = Math.floor(200 * (t40 - 2 * t20) / t20);
        if (b < -20 || b >= 100) continue;
        if (!bins.has(b)) bins.set(b, []);
        bins.get(b).push((r20[i] - r40[i]) * 100);
      }
      const med = new Map([...bins].filter(([, v]) => v.length >= 100).map(([b, v]) => [b, H.median(v)]));
      for (const b of [...med.keys()].sort((x, y) => x - y)) if (med.get(b) > 0 && (med.has(b + 1) ? med.get(b + 1) : 1) <= 0) return (b + 1) / 200;
      return NaN;
    };
    const all = crossing(() => true);
    const TENTHS = ['Front tenth', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', 'Back tenth'];
    const be = TENTHS.map((_, d) => crossing((i) => Math.min(Math.floor(r20[i] * 10), 9) === d));
    const slows = [];
    let n = 0;
    for (let i = 0; i < C.n; i++) if (keep(i)) { n++; const t20 = C.times[i * 9 + 3]; slows.push((C.times[i * 9 + 7] - 2 * t20) / t20); }
    const typical = H.median(slows);
    const values = { cross: all, front: be[0], back: be[9], typical };
    be.forEach((v, d) => { values[`tenth${d}`] = v; });
    return {
      values,
      plot: { rows: be.map((v, d) => ({ label: TENTHS[d], value: v, tone: d === 9 ? 'signal' : d === 0 ? 'ink' : 'quiet' })) },
      cohort_n: n,
    };
  },
};
