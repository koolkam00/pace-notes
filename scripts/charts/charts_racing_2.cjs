// Recounts of the racing charts, second batch (scripts/verify-charts.cjs), each written from its definition:
// start-screened editions only, places as clock ranks within an edition (ties in shard order).
const KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const MATS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'];
const SECTIONS = ['0–5K', '5–10K', '10–15K', '15–20K', '20–25K', '25–30K', '30–35K', '35–40K', '40K–finish'];

/** Editions whose screened field holds at least `size` finishes, in index order. */
function bigEditions(C, size) {
  const out = [];
  for (let e = 0; e < C.editions.length; e++) {
    const rows = C.rowsOf(e);
    if (rows.length && C.shapeKeep[rows[0]] && rows.length >= size) out.push(e);
  }
  return out;
}

const sortedMedian = (H, arr) => H.quantileSorted(Float64Array.from(arr).sort(), 0.5);

let cache = null;
/** Places (0 first … 1 last) at the eight mats and the finish, within each screened edition of 1,000+ finishes. */
function places(C) {
  if (cache && cache.C === C) return cache;
  const eds = bigEditions(C, 1000);
  const R = Array.from({ length: 9 }, () => new Float64Array(C.n).fill(NaN));
  const keep = new Uint8Array(C.n);
  for (const e of eds) {
    const rows = Array.from(C.rowsOf(e));
    for (const i of rows) keep[i] = 1;
    const m = rows.length;
    for (let k = 0; k < 9; k++) {
      const v = rows.map((i) => C.times[i * 9 + k]);
      const order = rows.map((_, j) => j).sort((a, b) => v[a] - v[b] || a - b);
      order.forEach((j, rank) => { R[k][rows[j]] = rank / (m - 1); });
    }
  }
  cache = { C, eds, R, keep };
  return cache;
}

module.exports = {
  'ahead-at-20k-gone-by-40k': (C, file, H) => {
    const rows = [];
    for (let i = 0; i < C.n; i++) if (C.shapeKeep[i] && C.finish[i] >= 14340 && C.finish[i] < 14400) rows.push(i);
    const margin = KM.map((km, k) => rows.map((i) => (14400 * km) / 42.195 - C.times[i * 9 + k]));
    const q = (p) => margin.map((m) => H.quantile(m, p));
    const q25 = q(0.25), q50 = q(0.5), q75 = q(0.75);
    const pts = (arr) => [[0, 0], ...arr.map((y, k) => [KM[k] / 5, y])]; // every margin is 0 at the start
    const behind = margin[7].filter((m) => m < 0).length / rows.length;
    let pk = 0;
    q50.forEach((y, k) => { if (y > q50[pk]) pk = k; });
    return {
      values: { ahead: q50[3], behind, peak: q50[pk], peak_mat: MATS[pk], ahead40: q50[7], ahead_finish: q50[8], finishes: rows.length },
      plot: {
        series: [{ label: 'Upper quartile', points: pts(q75) }, { label: 'Lower quartile', points: pts(q25) }, { label: 'Median', points: pts(q50) }],
        refs: [{ axis: 'y', value: 0 }],
      },
      cohort_n: rows.length,
    };
  },

  'front-settles-early': (C, file, H) => {
    const { R, keep } = places(C);
    // The five fifths of the finishing order.
    const tenths = ['Front fifth', '2nd fifth', 'Middle fifth', '4th fifth', 'Back fifth'].map((l, f) => [[2 * f, 2 * f + 1], l]);
    const hit = tenths.map(() => new Float64Array(8)), d = new Float64Array(tenths.length);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!keep[i]) continue;
      n++;
      const rf = R[8][i], t = Math.min(9, Math.floor(rf * 10));
      const row = tenths.findIndex(([ds]) => ds.includes(t));
      if (row < 0) continue;
      d[row]++;
      for (let k = 0; k < 8; k++) if (Math.abs(R[k][i] - rf) <= 0.05) hit[row][k]++;
    }
    const full = hit.map((h, r) => Array.from(h, (x) => x / d[r]));
    const cols = [1, 2, 3, 4, 5, 6];
    return {
      values: { d20: full[2][3], d35: full[2][6], d30: full[2][5], front5: full[0][0], back5: full[4][0], front20: full[0][3], back20: full[4][3] },
      plot: { rows: tenths.map(([, l]) => l), cols: cols.map((k) => MATS[k]), cells: full.map((f) => cols.map((k) => f[k])) },
      cohort_n: n,
    };
  },

  'same-second-different-20k': (C, file, H) => {
    const gaps = [], sub3 = [], over6 = [];
    let n = 0;
    for (const e of bigEditions(C, 1000)) {
      const rows = Array.from(C.rowsOf(e));
      n += rows.length;
      rows.sort((a, b) => C.finish[a] - C.finish[b]); // stable: ties keep shard order
      for (let j = 1; j < rows.length; j++) {
        const a = rows[j - 1], b = rows[j];
        if (C.finish[a] !== C.finish[b]) continue;
        const g = Math.abs(C.times[b * 9 + 3] - C.times[a * 9 + 3]);
        gaps.push(g);
        if (C.finish[b] < 10800) sub3.push(g);
        if (C.finish[b] >= 21600) over6.push(g);
      }
    }
    const pairs = gaps.length, frac = (f) => gaps.filter(f).length / pairs;
    const counts = new Float64Array(61);
    for (const g of gaps) counts[Math.floor(Math.min(g, 900) / 15)]++;
    const bins = [];
    for (let i = 0; i < 60; i++) bins.push({ x0: i * 15, x1: (i + 1) * 15, v: counts[i] / pairs, tone: 'quiet' });
    const gap = H.median(gaps);
    return {
      values: { gap, within10: frac((g) => g < 10), within15: frac((g) => g < 15), over3: frac((g) => g >= 180), over15: frac((g) => g >= 900), pairs, gap_sub3: H.median(sub3), gap_6h: H.median(over6) },
      plot: { bins, refs: [{ axis: 'x', value: gap }] },
      cohort_n: n,
    };
  },

  'three-hour-crowd-at-20k': (C) => {
    const inside = new Float64Array(9), outside = new Float64Array(9);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      n++;
      for (let k = 0; k < 9; k++) {
        // Whole-second windows of equal width: 2:59 splits, then the same number of seconds after it (3:00 splits).
        const t = C.times[i * 9 + k];
        const lo = Math.ceil((10740 * KM[k]) / 42.195), hi = Math.ceil((10800 * KM[k]) / 42.195);
        if (t >= lo && t < hi) inside[k]++;
        else if (t >= hi && t < 2 * hi - lo) outside[k]++;
      }
    }
    const r = (k) => inside[k] / outside[k] - 1;
    return {
      values: { r20p: r(3), r10: r(1), r30: r(5), rf: r(8), r5: r(0), n_in: inside[3], n_out: outside[3] },
      plot: { rows: MATS.map((label, k) => ({ label, value: r(k), tone: k === 3 ? 'signal' : k === 8 ? 'ink' : 'quiet' })) },
      cohort_n: n,
    };
  },

  'order-shuffled-faster-after-20k': (C, file, H) => {
    const { R, keep, eds } = places(C);
    const moves = (k, rows) => rows.map((i) => Math.abs(R[k][i] - R[k - 1][i]) * 100);
    const all = [];
    for (let i = 0; i < C.n; i++) if (keep[i]) all.push(i);
    const pooled = {};
    for (let k = 1; k < 8; k++) pooled[k] = sortedMedian(H, moves(k, all));
    const ratios = eds.map((e) => { const rows = Array.from(C.rowsOf(e)); return sortedMedian(H, moves(6, rows)) / sortedMedian(H, moves(3, rows)); });
    const cols = [];
    let low = 1;
    for (let k = 1; k < 8; k++) {
      cols.push({ label: SECTIONS[k], value: pooled[k] / pooled[3], tone: k === 6 ? 'signal' : k === 3 ? 'ink' : 'quiet' });
      if (pooled[k] < pooled[low]) low = k;
    }
    return {
      values: {
        ratio: pooled[6] / pooled[3], ed_ratio: H.median(ratios), above1: ratios.filter((x) => x > 1).length, eds: eds.length,
        late: pooled[6], mid: pooled[3], early: pooled[1], low_section: SECTIONS[low],
      },
      plot: { rows: cols, ref: { axis: 'x', value: 1 } },
      cohort_n: all.length,
    };
  },

  'how-a-race-spreads-out': (C, file, H) => {
    const eds = bigEditions(C, 2000);
    let n = 0;
    const spread = Array.from({ length: 8 }, () => []);
    for (const e of eds) {
      const rows = C.rowsOf(e);
      n += rows.length;
      for (let k = 0; k < 8; k++) {
        const t = Float64Array.from(rows, (i) => C.times[i * 9 + k]).sort();
        spread[k].push(H.quantileSorted(t, 0.9) - H.quantileSorted(t, 0.1));
      }
    }
    const med = spread.map((g) => H.median(g));
    const rate = med[0];
    return {
      values: { early: rate, spread40: med[7], linear40: 8 * rate, extra: med[7] - 8 * rate, spread20: med[3], eds: eds.length },
      plot: {
        series: [
          { label: 'first 5K rate', points: [[0, 0], [8, 8 * rate]] },
          { label: 'middle 80%', points: [[0, 0], ...med.map((y, k) => [k + 1, y])] },
          // The bracket at 40K: from the spread actually reached down to the first-5K-rate line.
          { label: 'extra spread', points: [[8, med[7]], [8, 8 * rate]] },
        ],
      },
      cohort_n: n,
    };
  },

  'warm-mornings-reshuffle': (C) => {
    // Pairs ordered one way at 20K and the other way at the finish, counted with a Fenwick tree over finish ranks.
    const swapShare = (e) => {
      const rows = Array.from(C.rowsOf(e));
      const m = rows.length;
      const fins = [...new Set(rows.map((i) => C.finish[i]))].sort((a, b) => a - b);
      const rankOf = new Map(fins.map((f, j) => [f, j + 1]));
      rows.sort((a, b) => C.times[a * 9 + 3] - C.times[b * 9 + 3] || C.finish[a] - C.finish[b]);
      const tree = new Float64Array(fins.length + 1);
      let inv = 0;
      rows.forEach((i, seen) => {
        const r = rankOf.get(C.finish[i]);
        let le = 0;
        for (let x = r; x > 0; x -= x & -x) le += tree[x];
        inv += seen - le;
        for (let x = r; x <= fins.length; x += x & -x) tree[x]++;
      });
      return inv / ((m * (m - 1)) / 2);
    };
    const byCity = new Map();
    for (const e of bigEditions(C, 1000)) {
      if (!Number.isFinite(C.ed.temp[e])) continue;
      if (!byCity.has(C.ed.city[e])) byCity.set(C.ed.city[e], []);
      byCity.get(C.ed.city[e]).push(e);
    }
    const rows = [];
    for (const city of [...byCity.keys()].sort()) {
      const es = byCity.get(city);
      if (es.length < 5) continue;
      let cool = es[0], warm = es[0];
      for (const e of es) { if (C.ed.temp[e] < C.ed.temp[cool]) cool = e; if (C.ed.temp[e] > C.ed.temp[warm]) warm = e; }
      const a = swapShare(cool), b = swapShare(warm);
      rows.push({ city, a, b, used: C.edN[cool] + C.edN[warm], more: b >= a + 0.005, less: a >= b + 0.005 });
    }
    // Every race as one dot at its gap, in three groups by the half-point rule (a group only when it holds a race).
    const gap = (r) => r.b - r.a;
    const top = [...rows].sort((x, y) => gap(y) - gap(x) || (x.city < y.city ? -1 : 1))[0];
    const groups = [
      ['more on the warmest morning', (r) => r.more, 'signal'],
      ['about the same', (r) => !r.more && !r.less, 'ink'],
      ['less on the warmest morning', (r) => r.less, 'quiet'],
    ].map(([label, pick, tone]) => {
      const dots = rows.filter(pick).map((r) => ({ v: gap(r), tone }));
      return { label: `${dots.length.toLocaleString('en-US')} ${dots.length === 1 ? 'race' : 'races'}: ${label}`, dots };
    }).filter((g) => g.dots.length);
    return {
      values: {
        warm_count: rows.filter((r) => r.more).length, cool_count: rows.filter((r) => r.less).length,
        level_count: rows.filter((r) => !r.more && !r.less).length, up_count: rows.filter((r) => r.b > r.a).length,
        cities: rows.length, top_city: top.city, top_cool: top.a, top_warm: top.b,
      },
      plot: { groups, refs: [{ axis: 'x', value: 0 }] },
      cohort_n: rows.reduce((s, r) => s + r.used, 0),
    };
  },
};
