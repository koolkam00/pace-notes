// Recounts of the people charts of the Top 100 (scripts/verify-charts.cjs): each rebuilds the chart's
// values and plotted numbers from the streamed cohort, from the chart's definition, without the Python builder.

const MEN = 1, WOMEN = 2;
const isMW = (g) => g === MEN || g === WOMEN;

/** Per-edition counts of finishes passing a predicate. */
function edCounts(C, pred) {
  const out = new Float64Array(C.editions.length);
  for (let i = 0; i < C.n; i++) if (pred(i)) out[C.edition[i]]++;
  return out;
}

/** Editions without gender-recording gaps: not listed, at most 2% without a men's or women's gender, `min` recorded,
 * and at least 80% of the edition's records (read before eligibility) kept as finishes. */
function genderOk(C, min) {
  const mw = edCounts(C, (i) => isMW(C.gender[i])), other = edCounts(C, (i) => C.gender[i] === 0);
  return C.editions.map((_, e) => !C.genderGapEdition[e] && mw[e] >= min && other[e] <= 0.02 * C.edN[e] && C.rawN[e] > 0 && C.edN[e] >= 0.8 * C.rawN[e]);
}

const sorted = (arr) => Float64Array.from(arr).sort();

/** The races of a set of editions, most editions first (ties by name), as prose: 'New York, Washington and Paris'. */
function racesOf(C, eds) {
  const k = new Map();
  for (const e of eds) k.set(C.ed.city[e], (k.get(C.ed.city[e]) || 0) + 1);
  const names = [...k.keys()].sort((a, b) => k.get(b) - k.get(a) || (a < b ? -1 : a > b ? 1 : 0));
  return { races: names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0], races_n: names.length };
}

module.exports = {
  'gap-widest-at-the-front': (C, file, H) => {
    const P = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90];
    const nm = edCounts(C, (i) => C.gender[i] === MEN), nw = edCounts(C, (i) => C.gender[i] === WOMEN);
    const gaps = P.map(() => []);
    let n = 0, eds = 0, wider = 0;
    for (let e = 0; e < C.editions.length; e++) {
      if (C.genderGapEdition[e] || nm[e] < 1000 || nw[e] < 1000) continue;
      const m = [], w = [];
      for (const i of C.rowsOf(e)) { if (C.gender[i] === MEN) m.push(C.finish[i]); else if (C.gender[i] === WOMEN) w.push(C.finish[i]); }
      const sm = sorted(m), sw = sorted(w);
      const g = P.map((p) => H.quantileSorted(sw, p) / H.quantileSorted(sm, p) - 1);
      g.forEach((v, j) => gaps[j].push(v));
      if (g[1] > g[6]) wider++;
      n += m.length + w.length; eds++;
    }
    const med = gaps.map((g) => H.median(g));
    const labels = ['1st', '5th', '10th', '25th', '50th', '75th', '90th'];
    return {
      values: { front: med[1], back: med[6], mid: med[4], first: med[0], p10: med[2], p25: med[3], p75: med[5],
        front_max: Math.max(...med.slice(0, 3)), rest_max: Math.max(...med.slice(3)), eds, wider_eds: wider, wider_share: wider / eds },
      plot: { rows: med.map((v, j) => ({ label: labels[j], value: v, tone: j === 1 ? 'signal' : j === 6 ? 'ink' : 'quiet' })) },
      cohort_n: n,
    };
  },

  'younger-finishes-slowed-more': (C) => {
    const ages = [18, 30, 40, 50, 60, 70, 80];
    const hits = Array.from({ length: 6 }, () => new Float64Array(6)), cnt = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let i = 0; i < C.n; i++) {
      if (!C.exactAgeOk[i] || !C.shapeKeep[i] || C.gender[i] !== MEN || C.genderGapEdition[C.edition[i]]) continue;
      const a = C.exactAge[i], f = C.finish[i];
      if (a < 18 || a >= 80 || f < 10800 || f >= 21600) continue;
      const r = ages.findIndex((lo, k) => a >= lo && a < ages[k + 1]);
      const c = Math.floor((f - 10800) / 1800);
      cnt[r][c]++; if (C.slow[i]) hits[r][c]++;
    }
    let n = 0;
    const cells = cnt.map((row, r) => Array.from(row, (k, c) => { if (k < 100) return null; n += k; return hits[r][c] / k; }));
    let mono = 0;
    for (let c = 0; c < 6; c++) {
      const col = cells.map((row) => row[c]).filter((v) => v !== null);
      if (col.length >= 2 && col.every((v, k) => k === 0 || v < col[k - 1])) mono++;
    }
    const sig = cells.map((row) => row[2]);
    const line = (c, label, tone) => ({ label, tone, points: cells.map((row, r) => [r, row[c]]).filter(([, v]) => v !== null) });
    return {
      values: { young: cells[0][2], old: cells[5][2], mono_cols: mono, cols: 6, mono_signal: sig.every((v, k) => v !== null && (k === 0 || v < sig[k - 1])) ? 1 : 0 },
      plot: { series: [line(0, '3:00–3:30', 'quiet'), line(4, '5:00–5:30', 'quiet'), line(2, '4:00–4:30', 'signal')] },
      cohort_n: n,
    };
  },

  'womens-share-by-finish-time': (C, file, H) => {
    const ok = genderOk(C, 1);
    const J = 14; // under 3:00, then 15-minute bands from 3:00 to 6:15
    const band = (f) => (f < 10800 ? 0 : 1 + Math.floor((f - 10800) / 900));
    const per = Array.from({ length: J }, () => []);
    let n = 0, used = 0, pw = 0, pt = 0, under10 = 0;
    for (let e = 0; e < C.editions.length; e++) {
      if (!ok[e] || C.edN[e] < 2000) continue;
      const tot = new Float64Array(J), wom = new Float64Array(J);
      let k = 0;
      for (const i of C.rowsOf(e)) {
        if (!isMW(C.gender[i])) continue;
        k++;
        const j = band(C.finish[i]);
        if (j < J) { tot[j]++; if (C.gender[i] === WOMEN) wom[j]++; }
      }
      // One fixed set of editions: only those holding 100+ such finishes in every band.
      if (Math.min(...tot) < 100) continue;
      for (let j = 0; j < J; j++) per[j].push(wom[j] / tot[j]);
      pw += wom[0]; pt += tot[0]; if (wom[0] / tot[0] < 0.10) under10++;
      used++; n += k;
    }
    const med = per.map((v) => H.median(v));
    let cross = null;
    for (let j = J - 1; j > 0; j--) { if (med[j] > 0.5) cross = j; else break; }
    const labels = ['<3:00', ...Array.from({ length: J - 1 }, (_, k) => { const m = 180 + 15 * k; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; })];
    const start = (j) => (j === 0 ? 0 : 10800 + 900 * (j - 1));
    const values = { sub3: med[0], cross: start(cross), cross_share: med[cross], before_cross: med[cross - 1], last_start: start(J - 1), last_end: start(J - 1) + 900,
      last_share: med[J - 1], eds: used, sub3_pooled: pw / pt, sub3_under10: under10 };
    return {
      values,
      plot: { cols: med.map((v, j) => ({ label: labels[j], value: v, tone: j === 0 ? 'signal' : j >= cross ? 'ink' : 'quiet' })), ref: { value: 0.5 } },
      cohort_n: n,
    };
  },

  'sixties-beat-the-young-median': (C, file, H) => {
    const ref = {};
    for (const g of [MEN, WOMEN]) {
      const young = [];
      for (let i = 0; i < C.n; i++) if (C.exactAgeOk[i] && !C.genderGapEdition[C.edition[i]] && C.gender[i] === g && C.exactAge[i] >= 25 && C.exactAge[i] < 35) young.push(C.finish[i]);
      ref[g] = { median: H.median(young), count: young.length };
    }
    // Five-year bands 35–39 … 75–79.
    const quick = { [MEN]: new Float64Array(9), [WOMEN]: new Float64Array(9) }, tot = { [MEN]: new Float64Array(9), [WOMEN]: new Float64Array(9) };
    for (let i = 0; i < C.n; i++) {
      const g = C.gender[i], a = C.exactAge[i];
      if (!C.exactAgeOk[i] || C.genderGapEdition[C.edition[i]] || !isMW(g) || a < 35 || a >= 80) continue;
      const b = Math.floor((a - 35) / 5);
      tot[g][b]++; if (C.finish[i] < ref[g].median) quick[g][b]++;
    }
    const share = (g, b) => quick[g][b] / tot[g][b];
    let yq = 0;
    const eds = new Set();
    for (let i = 0; i < C.n; i++) {
      if (!C.exactAgeOk[i] || C.genderGapEdition[C.edition[i]] || C.gender[i] !== MEN) continue;
      eds.add(C.edition[i]);
      if (C.exactAge[i] >= 25 && C.exactAge[i] < 35 && C.finish[i] < ref[MEN].median) yq++;
    }
    const rows = [{ label: '25–34', value: yq / ref[MEN].count, tone: 'ink' },
      ...Array.from({ length: 9 }, (_, b) => ({ label: `${35 + 5 * b}–${39 + 5 * b}`, value: share(MEN, b), tone: b === 5 ? 'signal' : 'quiet' }))];
    return {
      values: { m6064: share(MEN, 5), ref: ref[MEN].median, w6064: share(WOMEN, 5), w_ref: ref[WOMEN].median, m7074: share(MEN, 7), m4044: share(MEN, 1), m3539: share(MEN, 0),
        ...racesOf(C, eds) },
      plot: { rows },
      cohort_n: tot[MEN].reduce((a, b) => a + b, 0) + ref[MEN].count,
    };
  },

  'even-pace-paradox': (C) => {
    // cell -> [women, men, women even, men even]
    const cells = new Map();
    let n = 0, pw = 0, pwe = 0, pm = 0, pme = 0;
    for (let i = 0; i < C.n; i++) {
      const g = C.gender[i], f = C.finish[i];
      if (!C.shapeKeep[i] || C.genderGapEdition[C.edition[i]] || !isMW(g)) continue;
      n++;
      const p = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => C.pace(i, k));
      const mean = (p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7]) / 8;
      const even = p.every((v) => Math.abs(v / mean - 1) <= 0.03);
      const key = C.edition[i] * 1000 + Math.floor(f / 60);
      let c = cells.get(key);
      if (!c) { c = [0, 0, 0, 0]; cells.set(key, c); }
      if (g === WOMEN) { c[0]++; pw++; if (even) { c[2]++; pwe++; } } else { c[1]++; pm++; if (even) { c[3]++; pme++; } }
    }
    const matched = (lo, hi) => {
      let w = 0, sw = 0, sm = 0;
      for (const [key, c] of cells) {
        const minute = key % 1000;
        if (minute * 60 < lo || minute * 60 >= hi) continue;
        const k = Math.min(c[0], c[1]);
        if (!k) continue;
        w += k; sw += (k * c[2]) / c[0]; sm += (k * c[3]) / c[1];
      }
      return { women: sw / w, men: sm / w, weight: w };
    };
    const all = matched(0, 1e9);
    const bands = [[0, 12600, 'Under 3:30'], [12600, 16200, '3:30–4:30'], [16200, 1e9, '4:30+']].map(([lo, hi, label]) => ({ label, ...matched(lo, hi) }));
    const rows = [{ label: 'Same finish', a: all.men, b: all.women, tone: 'signal' }, ...bands.map((b) => ({ label: b.label, a: b.men, b: b.women, tone: 'quiet' })),
      { label: 'All finishes', a: pme / pm, b: pwe / pw, tone: 'ink' }];
    return {
      values: { ratio: all.women / all.men, women: all.women, men: all.men, women_pooled: pwe / pw, men_pooled: pme / pm, weight: all.weight },
      plot: { rows },
      cohort_n: n,
    };
  },

  'front-of-the-field-is-younger': (C, file, H) => {
    const top1 = [], top10 = [], top25 = [], slow10 = [], all = [];
    let eds = 0, minGroup = Infinity;
    const used = [];
    for (let e = 0; e < C.editions.length; e++) {
      if (C.genderGapEdition[e]) continue;
      const rows = Array.from(C.rowsOf(e)).filter((i) => C.exactAgeOk[i] && C.gender[i] === MEN);
      if (rows.length < 10000) continue;
      eds++; used.push(e);
      const s = sorted(rows.map((i) => C.finish[i]));
      const q1 = H.quantileSorted(s, 0.01), q10 = H.quantileSorted(s, 0.10), q25 = H.quantileSorted(s, 0.25), q90 = H.quantileSorted(s, 0.90);
      let g1 = 0;
      for (const i of rows) {
        const f = C.finish[i], a = C.exactAge[i];
        all.push(a);
        if (f <= q1) { top1.push(a); g1++; }
        if (f <= q10) top10.push(a);
        if (f <= q25) top25.push(a);
        if (f >= q90) slow10.push(a);
      }
      minGroup = Math.min(minGroup, g1);
    }
    const v = { top1: H.median(top1), top10: H.median(top10), top25: H.median(top25), all: H.median(all), slow10: H.median(slow10) };
    return {
      values: { ...v, top1_40plus: top1.filter((a) => a >= 40).length / top1.length, min_group: minGroup, eds, top1_count: top1.length, ...racesOf(C, used) },
      plot: { rows: [{ label: 'Quickest 1%', value: v.top1, tone: 'signal' }, { label: 'Quickest 10%', value: v.top10, tone: 'quiet' },
        { label: 'Quickest 25%', value: v.top25, tone: 'quiet' }, { label: 'Slowest 10%', value: v.slow10, tone: 'quiet' }, { label: "All men's", value: v.all, tone: 'ink' }] },
      cohort_n: all.length,
    };
  },

  'seventy-plus-under-four': (C, file, H) => {
    const f = [];
    // Age-group codes 11+ are 70–74, 75–79, 80–84 and 85–89 (AGE_LABELS).
    const eds = new Set();
    for (let i = 0; i < C.n; i++) if (C.age[i] >= 11) { f.push(C.finish[i]); eds.add(C.edition[i]); }
    const u4 = f.filter((x) => x < 14400).length, u5 = f.filter((x) => x < 18000).length, n70 = f.length;
    return {
      values: { u4, u5, n70, u4_share: u4 / n70, med: H.median(f), eds: eds.size },
      plot: { value: u4, compare: [{ label: 'Under 4:00', value: u4, tone: 'signal' }, { label: 'Under 5:00', value: u5, tone: 'ink' }, { label: 'All at 70+', value: n70, tone: 'quiet' }] },
      cohort_n: n70,
    };
  },

  'womens-share-by-city': (C) => {
    const E = C.editions.length;
    const ok = genderOk(C, 1000);
    const byCity = new Map();
    for (let e = 0; e < E; e++) if (ok[e]) { const c = C.ed.city[e]; if (!byCity.has(c)) byCity.set(c, []); byCity.get(c).push(e); }
    const picked = [];
    for (const es of byCity.values()) {
      const last = es.reduce((a, b) => (C.ed.year[b] > C.ed.year[a] ? b : a));
      if (es.length >= 5 && C.ed.year[last] >= 2023 && C.edN[last] >= 10000) picked.push(last);
    }
    // Recorded men's and women's finishes under 4:00 in each picked edition.
    const men = new Map(picked.map((e) => [e, 0])), women = new Map(picked.map((e) => [e, 0]));
    for (const e of picked) for (const i of C.rowsOf(e)) {
      if (C.finish[i] >= 14400) continue;
      if (C.gender[i] === MEN) men.set(e, men.get(e) + 1); else if (C.gender[i] === WOMEN) women.set(e, women.get(e) + 1);
    }
    const share = (e) => women.get(e) / (men.get(e) + women.get(e));
    picked.sort((a, b) => share(b) - share(a) || (C.ed.city[a] < C.ed.city[b] ? -1 : 1));
    const top = picked[0], low = picked[picked.length - 1];
    return {
      values: { top: share(top), top_city: C.ed.city[top], low: share(low), low_city: C.ed.city[low], second: share(picked[1]), second_city: C.ed.city[picked[1]],
        races_n: picked.length, n_min: Math.min(...picked.map((e) => men.get(e) + women.get(e))), latest_min_year: Math.min(...picked.map((e) => C.ed.year[e])) },
      plot: { rows: picked.map((e) => ({ label: C.ed.city[e], value: share(e), tone: e === top ? 'signal' : e === low ? 'ink' : 'quiet' })) },
      cohort_n: picked.reduce((a, e) => a + men.get(e) + women.get(e), 0),
    };
  },
};
