// Recounts of the Top 100 charts' trends batch 1 (scripts/verify-charts.cjs): each rebuilds the chart's
// values and plotted numbers from the streamed cohort, without the Python builder. Linked sequences: a record's finishes
// in race-date order (weather-evidence dates), leaving out any finish that shares its race date with another finish of
// the same record.
const EIGHT = ['Berlin', 'Chicago', 'New York', 'Boston', 'Amsterdam', 'Rotterdam', 'Hamburg', 'Copenhagen'];
// Retention screens from the raw records read per edition (C.rawN): the fields chart keeps races whose eligible share
// moves under 5 points across 2019, 2021 and the latest edition; the women's-share chart drops editions under 80%.
const SPREAD = 0.05, MIN_RETENTION = 0.8, DUMBBELL_ROWS = 11;
const EXAMPLE = 'Copenhagen'; // the women's-share chart's example race
const retention = (C, e) => C.edN[e] / C.rawN[e];
const FIFTHS = ['Quickest', '2nd', 'Middle', '4th', 'Slowest'];
const early = (y) => y >= 2013 && y <= 2019, late = (y) => y >= 2022 && y <= 2025;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const yy = (y) => String(y % 100).padStart(2, '0');

const cache = new WeakMap();
/** Every record's finishes grouped and ordered by race date; finishes on a date the record already has are dropped. */
function linked(C) {
  if (cache.has(C)) return cache.get(C);
  const dateOf = new Map(C.weather.editions.map((r) => [`${r.city}\u0000${r.year}`, r.date]));
  const day = C.editions.map((e, k) => {
    const d = dateOf.get(`${e.city}\u0000${e.year}`);
    if (!d && C.edN[k] > 0) throw new Error(`${e.city} ${e.year}: no race date`);
    return d ? Date.parse(`${d}T00:00:00Z`) / 86400000 : -1;
  });
  let P = 0;
  for (let i = 0; i < C.n; i++) if (C.profile[i] + 1 > P) P = C.profile[i] + 1;
  const start = new Uint32Array(P + 1);
  for (let i = 0; i < C.n; i++) start[C.profile[i] + 1]++;
  for (let p = 0; p < P; p++) start[p + 1] += start[p];
  const order = new Uint32Array(C.n), cur = start.slice(0, P);
  for (let i = 0; i < C.n; i++) order[cur[C.profile[i]]++] = i;
  const dayOf = (i) => day[C.edition[i]];
  const groups = []; // [list of finish indices in date order] per record, clashes removed
  for (let p = 0; p < P; p++) {
    const g = Array.from(order.subarray(start[p], start[p + 1]));
    g.sort((a, b) => dayOf(a) - dayOf(b));
    const out = [];
    for (let k = 0; k < g.length; k++) {
      const d = dayOf(g[k]);
      if ((k > 0 && dayOf(g[k - 1]) === d) || (k + 1 < g.length && dayOf(g[k + 1]) === d)) continue;
      out.push(g[k]);
    }
    groups.push(out);
  }
  cache.set(C, groups);
  return groups;
}
/** The first k finishes of every record with k or more (start-screened editions only when shapeOnly). */
function firstK(C, k, shapeOnly) {
  const out = [];
  for (const g of linked(C)) {
    const s = shapeOnly ? g.filter((i) => C.shapeKeep[i]) : g;
    if (s.length >= k) out.push(s.slice(0, k));
  }
  return out;
}

module.exports = {
  'sub-3-went-mainstream': (C, file, H) => {
    const ratios = [], p1 = [], p2 = [], bars = [], perRace = {};
    let nMin = Infinity, n = 0;
    for (const city of EIGHT) {
      const rows = [];
      for (let e = 0; e < C.editions.length; e++) {
        if (C.ed.city[e] !== city || C.edN[e] < 1000 || C.genderGapEdition[e]) continue;
        let men = 0, sub = 0;
        for (const i of C.rowsOf(e)) if (C.gender[i] === 1) { men++; if (C.finish[i] < 10800) sub++; }
        nMin = Math.min(nMin, men); n += men;
        rows.push([C.ed.year[e], sub / men]);
      }
      rows.sort((a, b) => a[0] - b[0]);
      const a = mean(rows.filter(([y]) => early(y)).map(([, v]) => v)), b = mean(rows.filter(([y]) => late(y)).map(([, v]) => v));
      ratios.push(b / a); p1.push(a); p2.push(b);
      perRace[`r_${city.toLowerCase().replace(/ /g, '_')}`] = b / a;
      bars.push({ label: city, value: b / a, tone: 'quiet' });
    }
    bars.sort((x, y) => y.value - x.value);
    bars.push({ label: 'Median of eight', value: H.median(ratios), tone: 'signal' });
    return {
      values: { ratio: H.median(ratios), min_ratio: Math.min(...ratios), rose: ratios.filter((r) => r > 1).length, races: EIGHT.length, p1: H.median(p1), p2: H.median(p2), n_min: nMin, ...perRace },
      plot: { rows: bars, ref: { value: 1 } }, cohort_n: n,
    };
  },

  'slowdowns-run-in-streaks': (C) => {
    const recs = firstK(C, 4, true), hit = [0, 0, 0, 0], tot = [0, 0, 0, 0];
    for (const r of recs) { const k = C.slow[r[0]] + C.slow[r[1]] + C.slow[r[2]]; tot[k]++; hit[k] += C.slow[r[3]]; }
    const s = hit.map((h, k) => h / tot[k]);
    const tones = ['ink', 'quiet', 'quiet', 'signal'];
    return {
      values: { none: s[0], one: s[1], two: s[2], three: s[3], n3: tot[3], records: recs.length },
      plot: { cols: s.map((v, k) => ({ label: `${k} of 3`, value: v, tone: tones[k] })) }, cohort_n: recs.length,
    };
  },

  'place-in-the-field-sticks': (C, file, H) => {
    const rank = H.editionRanks((i) => C.finish[i]);
    const q = (i) => Math.min(4, Math.floor(rank[i] * 5));
    const M = Array.from({ length: 5 }, () => new Float64Array(5));
    let total = 0;
    for (const g of linked(C)) for (let k = 1; k < g.length; k++) { M[q(g[k - 1])][q(g[k])]++; total++; }
    const row = (i, j) => M[i][j] / M[i].reduce((a, b) => a + b, 0);
    return {
      values: { front: row(0, 0), back: row(4, 4), middle: row(2, 2), cross: row(0, 4), same: [0, 1, 2, 3, 4].reduce((a, i) => a + M[i][i], 0) / total, pairs: total },
      plot: { cells: M.map((r, i) => Array.from(r, (_, j) => row(i, j))), rows: FIFTHS, cols: FIFTHS }, cohort_n: total,
    };
  },

  'fields-halved-in-2021': (C, file, H) => {
    const rows = [];
    let n = 0, nyYear = 0;
    for (const city of [...new Set(C.ed.city)].sort()) {
      const by = new Map();
      for (let e = 0; e < C.editions.length; e++) if (C.ed.city[e] === city && C.edN[e] > 0) by.set(C.ed.year[e], e);
      if (!by.has(2019) || !by.has(2021)) continue;
      const last = Math.max(...by.keys()), e19 = by.get(2019), e21 = by.get(2021), eL = by.get(last);
      const ret = [e19, e21, eL].map((e) => retention(C, e));
      if (Math.max(...ret) - Math.min(...ret) > SPREAD) continue;
      n += C.edN[e19] + C.edN[e21] + C.edN[eL];
      if (city === 'New York') nyYear = last;
      rows.push({ label: `${city} ’${yy(last)}`, a: C.edN[e21] / C.edN[e19], b: C.edN[eL] / C.edN[e19], size: C.edN[e19] });
    }
    const a = rows.map((r) => r.a), b = rows.map((r) => r.b);
    const drawn = [...rows].sort((x, y) => y.size - x.size).slice(0, DUMBBELL_ROWS).sort((x, y) => y.b - x.b)
      .map(({ size, ...r }) => ({ ...r, tone: r.label.startsWith('New York ') ? 'signal' : 'quiet' }));
    const ny = rows.find((r) => r.label.startsWith('New York '));
    return {
      values: { med: H.median(a), bigger: b.filter((x) => x > 1).length, races: rows.length, low: Math.min(...a), high21: Math.max(...a), high: Math.max(...b), med_latest: H.median(b), ny21: ny.a, ny_latest: ny.b, ny_year: nyYear },
      plot: { rows: drawn, ref: { value: 1 } }, cohort_n: n,
    };
  },

  'even-pacing-rose-since-2019': (C) => {
    const rows = [];
    let n = 0;
    for (const city of EIGHT) {
      const a = [], b = [];
      for (let e = 0; e < C.editions.length; e++) {
        if (C.ed.city[e] !== city) continue;
        const y = C.ed.year[e];
        if (!early(y) && !late(y)) continue;
        let m = 0, even = 0;
        for (const i of C.rowsOf(e)) {
          if (!C.shapeKeep[i]) continue;
          m++;
          let s = 0;
          for (let k = 0; k < 8; k++) s += C.pace(i, k);
          const avg = s / 8;
          let ok = true;
          for (let k = 0; k < 8 && ok; k++) if (Math.abs(C.pace(i, k) / avg - 1) > 0.03 + 1e-9) ok = false;
          if (ok) even++;
        }
        if (m < 1000) continue;
        n += m;
        (early(y) ? a : b).push(even / m);
      }
      rows.push({ label: city, a: mean(a), b: mean(b), tone: city === 'Amsterdam' ? 'signal' : 'quiet' });
    }
    rows.sort((x, y) => (y.b - y.a) - (x.b - x.a));
    const am = rows.find((r) => r.label === 'Amsterdam');
    return { values: { up: rows.filter((r) => r.b > r.a).length, races: rows.length, a0: am.a, a1: am.b }, plot: { rows }, cohort_n: n };
  },

  'quicker-every-time': (C) => {
    const recs = firstK(C, 5, false);
    let dec = 0, inc = 0;
    for (const r of recs) {
      const t = r.map((i) => C.finish[i]);
      if (t.every((x, k) => k === 0 || x < t[k - 1])) dec++;
      if (t.every((x, k) => k === 0 || x > t[k - 1])) inc++;
    }
    const d = dec / recs.length, u = inc / recs.length, nul = 1 / 120;
    return {
      values: { dec: d, inc: u, null: nul, vs_random: d / nul, vs_random_inc: u / nul, records: recs.length },
      plot: {
        value: d / nul,
        compare: [
          { label: 'Quicker', value: d, tone: 'signal' },
          { label: 'Random order', value: nul, tone: 'ink' },
        ],
      },
      cohort_n: recs.length,
    };
  },

  'womens-share-rose-in-most-races': (C) => {
    const share = new Map(), size = new Map();
    for (let e = 0; e < C.editions.length; e++) {
      if (C.edN[e] < 1000 || C.genderGapEdition[e] || retention(C, e) < MIN_RETENTION) continue;
      let men = 0, women = 0, other = 0;
      for (const i of C.rowsOf(e)) { if (C.gender[i] === 1) men++; else if (C.gender[i] === 2) women++; else other++; }
      if (other / C.edN[e] > 0.02) continue;
      share.set(e, women / (men + women)); size.set(e, men + women);
    }
    const races = [];
    for (const city of [...new Set([...share.keys()].map((e) => C.ed.city[e]))].sort()) {
      const es = [...share.keys()].filter((e) => C.ed.city[e] === city).sort((a, b) => C.ed.year[a] - C.ed.year[b]);
      const f = es[0], l = es[es.length - 1];
      if (C.ed.year[l] - C.ed.year[f] < 10) continue;
      races.push({ city, f, l, total: es.reduce((s, e) => s + size.get(e), 0) });
    }
    const rise = (r) => share.get(r.l) - share.get(r.f);
    const shown = [...races].sort((a, b) => b.total - a.total).slice(0, 8).sort((a, b) => rise(b) - rise(a));
    const rows = shown.map((r) => ({
      label: `${r.city} ’${yy(C.ed.year[r.f])}–’${yy(C.ed.year[r.l])}`, a: share.get(r.f), b: share.get(r.l),
      tone: r.city === EXAMPLE ? 'signal' : 'quiet',
    }));
    const ex = races.find((r) => r.city === EXAMPLE);
    const fell = {};
    for (const r of shown) if (share.get(r.l) < share.get(r.f)) fell[`fell_${r.city.toLowerCase().replace(/ /g, '_')}`] = share.get(r.l) - share.get(r.f);
    return {
      values: { up: races.filter((r) => share.get(r.l) > share.get(r.f)).length, races: races.length, c0: share.get(ex.f), c1: share.get(ex.l), c0_year: C.ed.year[ex.f], c1_year: C.ed.year[ex.l], fell_drawn: Object.keys(fell).length, ...fell },
      plot: { rows }, cohort_n: [...size.values()].reduce((a, b) => a + b, 0),
    };
  },

  'five-races-in-same-share': (C) => {
    const recs = firstK(C, 5, true), s = [0, 1, 2, 3, 4].map((k) => recs.reduce((a, r) => a + C.slow[r[k]], 0) / recs.length);
    return {
      values: { first: s[0], fifth: s[4], n: recs.length, low: Math.min(...s), high: Math.max(...s) },
      plot: { series: [{ label: 'Same records', points: s.map((v, k) => [k, v]) }] }, cohort_n: recs.length,
    };
  },

  'new-york-got-younger': (C) => {
    const under = [], over = [];
    let n = 0;
    const eds = [];
    for (let e = 0; e < C.editions.length; e++) if (C.ed.city[e] === 'New York' && C.edN[e] > 0 && C.granular.has(e)) eds.push(e);
    eds.sort((a, b) => C.ed.year[a] - C.ed.year[b]);
    for (const e of eds) {
      let m = 0, u = 0, o = 0;
      for (const i of C.rowsOf(e)) { if (!C.exactAgeOk[i]) continue; m++; if (C.exactAge[i] < 30) u++; if (C.exactAge[i] >= 60) o++; }
      n += m;
      under.push([C.ed.year[e], u / m]); over.push([C.ed.year[e], o / m]);
    }
    const at = (s, y) => s.find(([x]) => x === y)[1];
    return {
      values: { u06: at(under, 2006), u25: at(under, 2025), o06: at(over, 2006), o25: at(over, 2025), hi_early: Math.max(...under.filter(([y]) => y <= 2019).map(([, v]) => v)) },
      plot: { series: [{ label: 'Under 30', points: under }, { label: '60+', points: over }] }, cohort_n: n,
    };
  },
};
