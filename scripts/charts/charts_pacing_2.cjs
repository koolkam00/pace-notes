// Recounts of the Top 100 pacing charts, second batch (scripts/verify-charts.cjs): pacing shapes in the
// start-screened editions, each rebuilt from the cohort from its definition.
const SECTIONS = ['0–5K', '5–10K', '10–15K', '15–20K', '20–25K', '25–30K', '30–35K', '35–40K', '40K–finish'];
const EVEN = 22.195 / 42.195;

function screened(C) {
  let n = 0;
  for (let i = 0; i < C.n; i++) n += C.shapeKeep[i];
  return n;
}

module.exports = {
  'where-slowdowns-began': (C) => {
    let n = 0, slow = 0;
    const at = { 20: 0, 25: 0, 30: 0, 35: 0 };
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      n++;
      if (!C.slow[i]) continue;
      slow++;
      at[C.onset[i]]++;
    }
    const late = (at[30] + at[35]) / slow, early = (at[20] + at[25]) / slow;
    return {
      values: { slow: slow / n, late, early, at25: at[25] / slow, at20: at[20] / slow, slowdowns: slow },
      plot: { parts: [{ share: late, tone: 'signal', label: 'began at 30K or 35K' }, { share: early, tone: 'o2', label: 'began at 20K or 25K' }] },
      cohort_n: n,
    };
  },

  'quickest-and-slowest-5k': (C) => {
    const lo = new Float64Array(8), hi = new Float64Array(8);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      n++;
      let a = 0, b = 0, pa = C.pace(i, 0), pb = pa;
      for (let k = 1; k < 8; k++) {
        const p = C.pace(i, k);
        if (p < pa) { pa = p; a = k; }
        if (p > pb) { pb = p; b = k; }
      }
      lo[a]++; hi[b]++;
    }
    const rows = SECTIONS.slice(0, 8).map((label, k) => ({ label, left: lo[k] / n, right: hi[k] / n }));
    return {
      values: { slow: hi[7] / n, quick: (lo[0] + lo[1] + lo[2]) / n, first_quick: lo[0] / n, slow_30: hi[6] / n },
      plot: { rows, max: Math.max(...lo, ...hi) / n },
      cohort_n: n,
    };
  },

  'where-the-slow-day-happened': (C, file, H) => {
    // Per linked record: the quickest finish (first of ties in row order) and the slowest (last of ties).
    const P = C.runners.profiles;
    const qi = new Int32Array(P).fill(-1), si = new Int32Array(P).fill(-1), cnt = new Uint32Array(P);
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      const p = C.profile[i];
      cnt[p]++;
      if (qi[p] < 0 || C.finish[i] < C.finish[qi[p]]) qi[p] = i;
      if (si[p] < 0 || C.finish[i] >= C.finish[si[p]]) si[p] = i;
    }
    // Each record's gap split by section: section k of the slower finish minus section k of the quicker one.
    const after = [], gaps = [];
    const per = new Float64Array(9);
    let num = 0, den = 0;
    for (let p = 0; p < P; p++) {
      if (cnt[p] < 2) continue;
      const q = qi[p], s = si[p];
      const gf = C.finish[s] - C.finish[q];
      if (!(gf > 60)) continue;
      let prevS = 0, prevQ = 0;
      for (let k = 0; k < 9; k++) {
        const ts = C.times[s * 9 + k], tq = C.times[q * 9 + k];
        per[k] += (ts - prevS) - (tq - prevQ);
        prevS = ts; prevQ = tq;
      }
      const g20 = C.times[s * 9 + 3] - C.times[q * 9 + 3];
      after.push((gf - g20) / gf);
      gaps.push(gf);
      num += gf - g20; den += gf;
    }
    const km = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
    const b = Array.from(per, (x) => x / den);
    let top = 4;
    for (let k = 5; k < 8; k++) if (b[k] > b[top]) top = k;
    const rows = km.map((d, k) => ({ label: SECTIONS[k], a: d / 42.195, b: b[k], tone: k >= 4 ? 'signal' : 'quiet' }));
    return {
      values: {
        pooled: num / den, even: EVEN, after: H.median(after), over_even: after.filter((x) => x > EVEN).length / after.length,
        med_gap: H.median(gaps), top, top_b: b[top], top_a: km[top] / 42.195,
        after_wider: [4, 5, 6, 7, 8].filter((k) => b[k] > km[k] / 42.195).length, n: after.length,
      },
      plot: { rows },
      cohort_n: 2 * after.length,
    };
  },

  'slowest-5k-after-20k': (C, file, H) => {
    const n = screened(C), w = new Float64Array(n), counts = new Float64Array(45);
    let j = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      let m = -Infinity;
      for (let k = 4; k < 8; k++) m = Math.max(m, C.pace(i, k) / C.baseline[i]);
      const x = m - 1;
      w[j++] = x;
      counts[Math.min(44, Math.max(0, Math.floor((x - -0.1) / 0.025)))]++;
    }
    w.sort();
    let o5 = 0, o25 = 0, o50 = 0;
    for (const x of w) { if (x + 1e-12 >= 0.05) o5++; if (x + 1e-12 >= 0.25) o25++; if (x >= 0.5) o50++; }
    let any = 0, beyond = 0;
    for (const x of w) if (x > 0) any++;
    for (let k = 36; k < 45; k++) beyond += counts[k];
    const med = H.quantileSorted(w, 0.5);
    const bins = Array.from(counts.slice(0, 36), (c, k) => ({ x0: -0.1 + k * 0.025, x1: -0.1 + (k + 1) * 0.025, v: c / n, tone: 'quiet' }));
    return {
      values: { med, any_slower: any / n, over5: o5 / n, p90: H.quantileSorted(w, 0.9), over25: o25 / n, over50: o50 / n, beyond: beyond / n },
      plot: { bins, refs: [{ value: med, tone: 'signal' }] },
      cohort_n: n,
    };
  },

  'steady-before-20k': (C) => {
    const size = new Float64Array(5), slow = new Float64Array(5);
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      const d = C.pace(i, 3) / C.pace(i, 1) - 1;
      const g = d < -0.02 ? 0 : d <= 0.02 ? 1 : d <= 0.04 ? 2 : d <= 0.06 ? 3 : 4;
      size[g]++; slow[g] += C.slow[i];
    }
    const share = Array.from(slow, (s, g) => s / size[g]);
    return {
      values: { faster: share[0], steady: share[1], drift2: share[2], drift4: share[3], drift: share[4], n_min: Math.min(...size) },
      plot: { rows: share.map((value, g) => ({ value, tone: g === 4 ? 'signal' : g === 1 ? 'ink' : 'quiet' })) },
      cohort_n: screened(C),
    };
  },

  'most-ran-second-5k-quicker': (C) => {
    const cuts = [10800, 12600, 14400, 16200, 18000, 21600];
    const size = new Float64Array(7), quick = new Float64Array(7), slower = new Float64Array(7);
    let n = 0, all = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      let b = 0;
      while (b < 6 && C.finish[i] >= cuts[b]) b++;
      const p0 = C.pace(i, 0), p1 = C.pace(i, 1);
      const q = p1 < p0 ? 1 : 0;
      n++; all += q; size[b]++; quick[b] += q; slower[b] += p1 > p0 ? 1 : 0;
    }
    const rows = Array.from(quick, (q, b) => ({ value: q / size[b], tone: b === 6 ? 'signal' : b === 1 ? 'ink' : 'quiet' }));
    return {
      values: { all: all / n, slow: rows[6].value, peak: rows[1].value, slower_5_6: slower[5] / size[5], slower_6: slower[6] / size[6] },
      plot: { rows, ref: { value: 0.5, tone: 'quiet' } },
      cohort_n: n,
    };
  },

  'later-slowdowns-up-front': (C, file, H) => {
    // Fifth of the edition's clock order at the 20K mat, among screened finishes, ties in row order.
    const rank = H.editionRanks((i) => C.times[i * 9 + 3], (i) => C.shapeKeep[i] === 1 || C.shapeKeep[i] === true);
    const MATS = [20, 25, 30, 35];
    const size = new Float64Array(5), slow = new Float64Array(5), at = Array.from({ length: 5 }, () => new Float64Array(4));
    const E = C.editions.length;
    const edQ = new Float64Array(E), edQ35 = new Float64Array(E), edZ = new Float64Array(E), edZ35 = new Float64Array(E);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      n++;
      const f = Math.min(Math.floor(rank[i] * 5), 4);
      size[f]++;
      if (!C.slow[i]) continue;
      slow[f]++;
      at[f][MATS.indexOf(C.onset[i])]++;
      const e = C.edition[i], late = C.onset[i] === 35 ? 1 : 0;
      if (f === 0) { edQ[e]++; edQ35[e] += late; }
      if (f === 4) { edZ[e]++; edZ35[e] += late; }
    }
    let both = 0, higher = 0;
    for (let e = 0; e < E; e++) {
      if (edQ[e] < 100 || edZ[e] < 100) continue;
      both++;
      if (edQ35[e] / edQ[e] > edZ35[e] / edZ[e]) higher++;
    }
    const labels = ['Front fifth at 20K', 'Second fifth', 'Middle fifth', 'Fourth fifth', 'Back fifth'];
    const parts = at.map((a, f) => Array.from(a, (x) => x / slow[f]));
    return {
      values: {
        front35: parts[0][3], back35: parts[4][3], s35_2: parts[1][3], s35_3: parts[2][3], s35_4: parts[3][3],
        front20: parts[0][0], back20: parts[4][0], front_slow: slow[0] / size[0], back_slow: slow[4] / size[4],
        slowdowns_min: Math.min(...slow), finishes_min: Math.min(...size), editions_both: both, editions_front_higher: higher,
      },
      plot: {
        // Two parts per fifth: began at 20K, 25K or 30K (one quiet part), and began at 35K (the reading).
        rows: labels.map((label, f) => ({ label, parts: [(slow[f] - at[f][3]) / slow[f], parts[f][3]], tone: f > 0 && f < 4 ? 'quiet' : 'ink' })),
        parts: [{ label: 'Began 20–30K', tone: 'o2', values: false }, { label: 'Began at 35K', tone: 'signal' }],
      },
      cohort_n: n,
    };
  },

  'middle-split-orders-the-field': (C, file, H) => {
    // Places from 0 to 1 within one edition, ties at their average rank: (average rank − 1) / (n − 1).
    const places = (vals) => {
      const m = vals.length, idx = Array.from({ length: m }, (_, j) => j).sort((a, b) => vals[a] - vals[b] || a - b);
      const out = new Float64Array(m);
      for (let lo = 0; lo < m;) {
        let hi = lo;
        while (hi + 1 < m && vals[idx[hi + 1]] === vals[idx[lo]]) hi++;
        const p = ((lo + hi) / 2) / (m - 1);
        for (let j = lo; j <= hi; j++) out[idx[j]] = p;
        lo = hi + 1;
      }
      return out;
    };
    const perSection = Array.from({ length: 9 }, () => []), clock = [], sizes = [];
    let midOverLate = 0, peakMid = 0, splitVsClock = 0;
    for (let e = 0; e < C.editions.length; e++) {
      const rows = Array.from(C.rowsOf(e)).filter((i) => C.shapeKeep[i]);
      if (rows.length < 1000) continue;
      sizes.push(rows.length);
      const fin = places(rows.map((i) => C.times[i * 9 + 8]));
      const within = (pl) => { let h = 0; for (let j = 0; j < rows.length; j++) if (Math.abs(pl[j] - fin[j]) < 0.05) h++; return h / rows.length; };
      const s = [];
      for (let k = 0; k < 9; k++) s.push(within(places(rows.map((i) => C.times[i * 9 + k] - (k ? C.times[i * 9 + k - 1] : 0)))));
      const c30 = within(places(rows.map((i) => C.times[i * 9 + 5])));
      s.forEach((x, k) => perSection[k].push(x));
      clock.push(c30);
      if (s[5] > s[7]) midOverLate++;
      let best = 0;
      for (let k = 1; k < 9; k++) if (s[k] > s[best]) best = k;
      if (best === 4 || best === 5) peakMid++;
      if (s[5] >= c30) splitVsClock++;
    }
    const typ = perSection.map((a) => H.median(a));
    const keys = ['s0', 's5', 's10', 's15', 's20', 's25', 's30', 's35', 's40'];
    const tones = ['quiet', 'quiet', 'quiet', 'quiet', 'quiet', 'signal', 'quiet', 'ink', 'quiet'];
    const values = { clock30: H.median(clock), editions: sizes.length, mid_beats_late: midOverLate, peak_mid: peakMid, split_vs_clock: splitVsClock, n_min: Math.min(...sizes) };
    keys.forEach((k, j) => { values[k] = typ[j]; });
    return {
      values,
      plot: { rows: SECTIONS.map((label, k) => ({ label, value: typ[k], tone: tones[k] })) },
      cohort_n: sizes.reduce((a, b) => a + b, 0),
    };
  },
};
