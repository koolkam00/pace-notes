// Recounts of the Top 100 charts people module (scripts/verify-charts.cjs): exact recorded ages (granular-age
// editions only), recorded gender, and finishes matched on edition and finish minute, each rebuilt from the cohort.
const MEN = 1, WOMEN = 2;
const MATS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'];
const recorded = (C, i) => C.gender[i] === MEN || C.gender[i] === WOMEN;

/** Cell-matched weights: in each cell both groups count as the smaller group's size, spread evenly over their finishes. */
function matched(rows, cellOf, groupOf) {
  const cells = new Map();
  for (const i of rows) {
    const k = cellOf(i);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = [0, 0]));
    c[groupOf(i)]++;
  }
  let total = 0;
  for (const c of cells.values()) total += Math.min(c[0], c[1]);
  const weight = (i) => { const c = cells.get(cellOf(i)); return Math.min(c[0], c[1]) / c[groupOf(i)]; };
  return { weight, total };
}

/** The races of a set of editions, most editions first (ties by name), as prose: 'New York, Washington and Paris'. */
function racesOf(C, eds) {
  const k = new Map();
  for (const e of eds) k.set(C.ed.city[e], (k.get(C.ed.city[e]) || 0) + 1);
  const names = [...k.keys()].sort((a, b) => k.get(b) - k.get(a) || (a < b ? -1 : a > b ? 1 : 0));
  return { races: names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0], races_n: names.length };
}

function exactAgeCounts(C, rowPred) {
  const counts = new Float64Array(91);
  for (let i = 0; i < C.n; i++) if (C.exactAgeOk[i] && rowPred(i)) counts[C.exactAge[i]]++;
  return counts;
}

module.exports = {
  'big-birthday-bulge': (C) => {
    const ny = (i) => C.ed.city[C.edition[i]] === 'New York';
    const counts = exactAgeCounts(C, ny);
    const bulge = (cnt, a) => cnt[a] / ((cnt[a - 1] + cnt[a + 1]) / 2) - 1;
    const eds = [...C.granular].filter((e) => C.ed.city[e] === 'New York').sort((a, b) => a - b);
    let above = 0;
    for (const e of eds) {
      const ce = new Float64Array(91);
      for (const i of C.rowsOf(e)) if (C.exactAgeOk[i]) ce[C.exactAge[i]]++;
      if ([40, 50, 60].every((a) => bulge(ce, a) > 0.05)) above++;
    }
    const round = [40, 50, 60, 70];
    const bins = [];
    for (let a = 18; a <= 78; a++) bins.push({ x0: a - 0.5, x1: a + 0.5, v: counts[a], tone: round.includes(a) ? 'signal' : 'quiet' });
    const total = counts.reduce((s, x) => s + x, 0);
    const r = round.map((a) => bulge(counts, a));
    return {
      values: { r50: r[1], r40: r[0], r60: r[2], r70: r[3], r30: bulge(counts, 30), lo: Math.min(...r), hi: Math.max(...r), at49: counts[49], at50: counts[50], at51: counts[51], eds_above: above, eds: eds.length },
      plot: { bins }, cohort_n: total,
    };
  },

  'age-barely-shows-until-45': (C, file, H) => {
    const byAge = { [MEN]: Array.from({ length: 91 }, () => []), [WOMEN]: Array.from({ length: 91 }, () => []) };
    let n = 0;
    const eds = new Set();
    for (let i = 0; i < C.n; i++) {
      // Gender split: editions with gender-recording gaps stay out.
      if (!C.exactAgeOk[i] || C.genderGapEdition[C.edition[i]] || !recorded(C, i)) continue;
      n++;
      eds.add(C.edition[i]);
      byAge[C.gender[i]][C.exactAge[i]].push(C.finish[i]);
    }
    const line = (g) => {
      const pts = [];
      for (let a = 20; a <= 75; a++) if (byAge[g][a].length >= 100) pts.push([a, H.median(byAge[g][a])]);
      return pts;
    };
    const around = (g, a) => H.median([a - 2, a - 1, a, a + 1, a + 2].flatMap((x) => byAge[g][x]));
    const m = [25, 45, 65].map((a) => around(MEN, a)), w = [25, 45, 65].map((a) => around(WOMEN, a));
    return {
      values: { d1: m[1] - m[0], d2: m[2] - m[1], w1: w[1] - w[0], w2: w[2] - w[1], m25: m[0], m45: m[1], m65: m[2], ...racesOf(C, [...eds].sort((a, b) => a - b)) },
      plot: {
        series: [{ label: "Women's", points: line(WOMEN), tone: 'quiet' }, { label: "Men's", points: line(MEN), tone: 'ink' },
          { label: '25 to 45', points: line(MEN).filter(([a]) => a >= 25 && a <= 45), tone: 'signal' }],
      },
      cohort_n: n,
    };
  },

  'women-outnumber-men-mid-20s': (C) => {
    // Exact ages from granular-age editions whose gender recording is complete.
    const tally = Array.from({ length: 91 }, () => [0, 0]);
    const eds = new Set();
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.exactAgeOk[i] || C.genderGapEdition[C.edition[i]] || !recorded(C, i)) continue;
      n++;
      eds.add(C.edition[i]);
      tally[C.exactAge[i]][C.gender[i] === WOMEN ? 1 : 0]++;
    }
    const pts = [];
    let nMin = Infinity;
    for (let a = 18; a <= 80; a++) {
      const [m, w] = tally[a];
      nMin = Math.min(nMin, m + w);
      pts.push([a, w / (m + w)]);
    }
    const above = pts.filter((p) => p[1] > 0.5).map((p) => p[0]);
    const a0 = Math.min(...above), a1 = Math.max(...above);
    const contiguous = above.length === a1 - a0 + 1 ? 1 : 0;
    let best = pts[0];
    for (const p of pts) if (p[1] > best[1]) best = p;
    const at = new Map(pts);
    return {
      values: {
        a0, a1, peak: best[1], peak_age: best[0], at40: at.get(40), contiguous, n_min: nMin, last_age: pts[pts.length - 1][0],
        first_under: Math.min(...pts.filter(([a, s]) => a > a1 && s < 0.5).map(([a]) => a)),
        under_after: pts.every(([a, s]) => a <= a1 || s < 0.5) ? 1 : 0, ...racesOf(C, eds),
      },
      plot: { series: [{ label: "Women's share", points: pts, tone: 'ink' }, { label: 'Majority', points: pts.filter((p) => p[0] >= a0 && p[0] <= a1), tone: 'signal' }], refs: [{ value: 0.5 }] },
      cohort_n: n,
    };
  },

  'older-finishes-draw-level': (C) => {
    const rows = [];
    for (let i = 0; i < C.n; i++) {
      if (!C.exactAgeOk[i] || !C.shapeKeep[i] || !recorded(C, i) || C.finish[i] < 9000 || C.finish[i] >= 21600) continue;
      const a = C.exactAge[i];
      if ((a >= 18 && a < 30) || (a >= 60 && a < 70)) rows.push(i);
    }
    const group = (i) => (C.exactAge[i] >= 60 ? 1 : 0);
    const { weight, total } = matched(rows, (i) => `${C.edition[i]}|${C.gender[i]}|${Math.floor(C.finish[i] / 60)}`, group);
    const sum = [new Float64Array(9), new Float64Array(9)], wsum = [0, 0];
    let used = 0;
    const eds = new Set();
    for (const i of rows) {
      const w = weight(i), g = group(i);
      if (w > 0) { used++; eds.add(C.edition[i]); }
      wsum[g] += w;
      for (let k = 0; k < 9; k++) sum[g][k] += w * C.times[i * 9 + k];
    }
    const gap = Array.from({ length: 9 }, (_, k) => Math.floor(sum[1][k] / wsum[1] - sum[0][k] / wsum[0] + 0.5));
    const peak = Math.max(...gap);
    return {
      values: { g20: gap[3], g40: -gap[7], gain: gap[3] - gap[7], falls25: gap[4] > gap[5] && gap[5] > gap[6] && gap[6] > gap[7] ? 1 : 0, peak, peak_mat: MATS[gap.indexOf(peak)], matched_weight: Math.round(total) },
      plot: { series: [{ label: '60–69', points: gap.map((v, k) => [k, v]), tone: 'signal' }], refs: [{ value: 0 }] },
      cohort_n: used,
    };
  },

  'women-slow-down-less': (C) => {
    const rows = [];
    for (let i = 0; i < C.n; i++) {
      if (C.shapeKeep[i] && !C.genderGapEdition[C.edition[i]] && recorded(C, i) && C.finish[i] >= 9000 && C.finish[i] < 21600) rows.push(i);
    }
    const group = (i) => (C.gender[i] === WOMEN ? 0 : 1);
    const { weight, total } = matched(rows, (i) => C.edition[i] * 1000 + Math.floor(C.finish[i] / 60), group);
    // Weighted slowdown sums per band (0 = all, 1… = 30-minute bands from 2:30) and per city.
    const acc = () => ({ s: [0, 0], w: [0, 0] });
    const bands = Array.from({ length: 8 }, acc), cities = new Map();
    const pooled = { s: [0, 0], n: [0, 0] };
    let used = 0;
    const eds = new Set();
    for (const i of rows) {
      const w = weight(i), g = group(i), s = C.slow[i];
      pooled.s[g] += s; pooled.n[g]++;
      if (w > 0) { used++; eds.add(C.edition[i]); }
      for (const b of [bands[0], bands[1 + Math.floor((C.finish[i] - 9000) / 1800)]]) { b.s[g] += w * s; b.w[g] += w; }
      if (!cities.has(C.city[i])) cities.set(C.city[i], acc());
      const c = cities.get(C.city[i]);
      c.s[g] += w * s; c.w[g] += w;
    }
    const labels = ['All', '2:30–3:00', '3:00–3:30', '3:30–4:00', '4:00–4:30', '4:30–5:00', '5:00–5:30', '5:30–6:00'];
    const out = bands.map((b, k) => ({ label: labels[k], a: b.s[0] / b.w[0], b: b.s[1] / b.w[1], tone: k ? 'quiet' : 'signal' }));
    let nc = 0, higher = 0;
    for (const c of cities.values()) {
      if (c.w[0] < 2000) continue;
      nc++;
      if (c.s[1] / c.w[1] > c.s[0] / c.w[0]) higher++;
    }
    return {
      values: { w: out[0].a, m: out[0].b, ratio: out[0].b / out[0].a, cities_men_higher: higher, cities: nc, pooled_w: pooled.s[0] / pooled.n[0], pooled_m: pooled.s[1] / pooled.n[1], matched_weight: Math.round(total) },
      plot: { rows: out }, cohort_n: used,
    };
  },

  'sub-3-not-only-for-the-young': (C, file, H) => {
    // Men's sub-3:00 finishes with an exact recorded age, by five-year age band (55 and over pooled).
    const lows = [18, 25, 30, 35, 40, 45, 50, 55];
    const labels = ['<25', '25', '30', '35', '40', '45', '50', '55+'];
    const tally = lows.map(() => 0), ages = [], eds = new Set();
    let men = 0, men40 = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.exactAgeOk[i] || C.genderGapEdition[C.edition[i]] || C.gender[i] !== MEN) continue;
      const a = C.exactAge[i];
      men++;
      if (a >= 40) men40++;
      if (C.finish[i] >= 10800) continue;
      ages.push(a);
      eds.add(C.edition[i]);
      let k = lows.length - 1;
      while (a < lows[k]) k--;
      tally[k]++;
    }
    const n = ages.length;
    const cols = labels.map((label, k) => ({ label, value: tally[k] / n, tone: lows[k] >= 40 ? 'signal' : 'quiet' }));
    return {
      values: { m40: ages.filter((a) => a >= 40).length / n, m50: ages.filter((a) => a >= 50).length / n, med: Math.trunc(H.median(ages)), n, field: men40 / men, ...racesOf(C, eds) },
      plot: { cols }, cohort_n: n,
    };
  },

  'women-beat-the-median-man': (C, file, H) => {
    const shares = [];
    let used = 0;
    for (let e = 0; e < C.editions.length; e++) {
      // Editions without gender-recording gaps that kept at least 80% of their records as finishes.
      if (C.genderGapEdition[e] || !C.rawN[e] || C.edN[e] < 0.8 * C.rawN[e]) continue;
      const rows = C.rowsOf(e), men = [], women = [];
      let other = 0;
      for (const i of rows) (C.gender[i] === MEN ? men : C.gender[i] === WOMEN ? women : { push: () => other++ }).push(C.finish[i]);
      if (men.length < 500 || women.length < 500 || other / rows.length > 0.02) continue;
      const med = H.median(men);
      shares.push(women.filter((f) => f < med).length / women.length);
      used += men.length + women.length;
    }
    const s = H.median(shares);
    return {
      values: { share: s, lo: Math.min(...shares), hi: Math.max(...shares), eds: shares.length, eds_20_35: shares.filter((x) => x >= 0.2 && x <= 0.35).length / shares.length, eds_in: shares.filter((x) => x >= 0.2 && x <= 0.35).length, band_lo: 0.2, band_hi: 0.35 },
      plot: { parts: [{ share: s, tone: 'signal' }] }, cohort_n: used,
    };
  },

  'new-york-2006-vs-2025': (C) => {
    const lows = [18, 23, 28, 33, 38, 43, 48, 53];
    const ed = (y) => C.editions.findIndex((x) => x.city === 'New York' && x.year === y);
    const tallies = {};
    let n = 0;
    for (const y of [2006, 2025]) {
      const e = ed(y);
      if (!C.granular.has(e)) throw new Error(`New York ${y} is not a granular-age edition`);
      if (C.genderGapEdition[e]) throw new Error(`New York ${y} has gender-recording gaps`);
      const t = lows.map(() => [0, 0]);
      for (const i of C.rowsOf(e)) {
        if (!C.exactAgeOk[i] || !recorded(C, i)) continue;
        n++;
        let k = lows.length - 1;
        while (C.exactAge[i] < lows[k]) k--;
        t[k][C.gender[i] === WOMEN ? 1 : 0]++;
      }
      tallies[y] = t;
    }
    const share = (y) => tallies[y].map(([m, w]) => w / (m + w));
    const s06 = share(2006), s25 = share(2025);
    const nMin = Math.min(...[2006, 2025].flatMap((y) => tallies[y].flat()));
    const labels = ['18–22', '23–27', '28–32', '33–37', '38–42', '43–47', '48–52', '53+'];
    const top = lows.length - 1, rise = s25.map((s, k) => s - s06[k]);
    return {
      values: {
        a53: s06[top], b53: s25[top], ratio53: s25[top] / s06[top], rose_all: rise.every((d) => d > 0) ? 1 : 0, min_rise: Math.min(...rise), max_rise: Math.max(...rise),
        bands: s25.filter((s) => s > 0.5).length, bands06: s06.filter((s) => s > 0.5).length, n_min: nMin,
      },
      plot: { rows: labels.map((label, k) => ({ label, a: s06[k], b: s25[k], tone: k === top ? 'signal' : 'quiet' })) },
      cohort_n: n,
    };
  },
};
