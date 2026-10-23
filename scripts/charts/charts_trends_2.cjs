// Recounts of the Top 100 charts, trends (second batch) (scripts/verify-charts.cjs), rebuilt from the cohort
// without the Python builders. Records linked by name (C.profile) are candidate links, never verified people.

/** Each record's finishes in race-date order (editions dated from the weather evidence, ties by edition index): rank,
 * count, record index, and the consecutive pairs on different days. Computed once per cohort. */
function linked(C) {
  if (C.__trends2) return C.__trends2;
  const key = (city, year) => `${city}\u0000${year}`;
  const dates = new Map(C.weather.editions.map((r) => [key(r.city, r.year), r.date]));
  const edDay = C.editions.map((e) => {
    const d = dates.get(key(e.city, e.year));
    return d ? Math.round((Date.parse(`${d}T00:00:00Z`) - Date.UTC(2000, 0, 1)) / 86400000) : -1;
  });
  for (let e = 0; e < C.editions.length; e++) if (C.edN[e] > 0 && edDay[e] < 0) throw new Error(`${C.editions[e].city} ${C.editions[e].year}: no race date`);
  const day = (i) => edDay[C.edition[i]];
  const order = Array.from({ length: C.n }, (_, i) => i);
  order.sort((x, y) => C.profile[x] - C.profile[y] || day(x) - day(y) || C.edition[x] - C.edition[y] || x - y);
  const rank = new Int32Array(C.n), count = new Int32Array(C.n), pid = new Int32Array(C.n);
  const a = [], b = [];
  let records = 0;
  for (let s = 0; s < order.length;) {
    let t = s;
    while (t < order.length && C.profile[order[t]] === C.profile[order[s]]) t++;
    for (let k = s; k < t; k++) {
      const i = order[k];
      rank[i] = k - s; count[i] = t - s; pid[i] = records;
      if (k > s && day(order[k - 1]) !== day(i)) { a.push(order[k - 1]); b.push(i); }
    }
    records++;
    s = t;
  }
  C.__trends2 = { rank, count, pid, records, a, b };
  return C.__trends2;
}

const cityOf = (C, i) => C.ed.city[C.edition[i]];
const BANDS = [[0, 10800, 'Under 3:00'], [10800, 12600, '3:00–3:30'], [12600, 14400, '3:30–4:00'], [14400, 16200, '4:00–4:30'], [16200, 18000, '4:30–5:00'], [18000, 21600, '5:00–6:00']];

module.exports = {
  'most-records-appear-once': (C) => {
    const L = linked(C);
    let records3 = 0, held3 = 0;
    for (let i = 0; i < C.n; i++) {
      if (L.count[i] >= 3) { held3++; if (L.rank[i] === 0) records3++; }
    }
    const r = records3 / L.records, h = held3 / C.n;
    return {
      values: { rec3: r, held3: h, one_in: L.records / records3, records: L.records, records3 },
      plot: { value: h, compare: [{ label: 'Share of records', value: r, tone: 'ink' }, { label: 'Share of finishes', value: h, tone: 'signal' }] },
      cohort_n: C.n,
    };
  },

  'every-new-york-in-the-data': (C) => {
    const L = linked(C);
    const per = new Int32Array(L.records), eds = new Set();
    let n = 0;
    for (let i = 0; i < C.n; i++) if (cityOf(C, i) === 'New York') { per[L.pid[i]]++; eds.add(C.edition[i]); n++; }
    const k = eds.size, atLeast = (m) => per.reduce((s, v) => s + (v >= m ? 1 : 0), 0);
    return {
      values: { all16: atLeast(k), n_eds: k, ten: atLeast(10), five: atLeast(5), fifteen: atLeast(15), two: atLeast(2) },
      plot: { value: atLeast(k), compare: [{ label: 'At least 10', value: atLeast(10), tone: 'ink' }, { label: `${k} editions`, value: atLeast(k), tone: 'signal' }] },
      cohort_n: n,
    };
  },

  'women-at-the-front-grew': (C) => {
    const races = ['Berlin', 'Chicago', 'New York', 'Boston', 'Amsterdam', 'Rotterdam', 'Hamburg', 'Copenhagen'];
    const by = {};
    let total = 0;
    for (const city of races) {
      const eds = C.editions.map((e, i) => i).filter((e) => C.ed.city[e] === city && C.edN[e] >= 1000 && !C.genderGapEdition[e]).sort((x, y) => C.ed.year[x] - C.ed.year[y]);
      by[city] = eds.map((e) => {
        let d = 0, w = 0;
        for (const i of C.rowsOf(e)) if (C.finish[i] < 12600 && (C.gender[i] === 1 || C.gender[i] === 2)) { d++; if (C.gender[i] === 2) w++; }
        if (d < 100) throw new Error(`${city}: a small sub-3:30 cell`);
        total += d;
        return [C.ed.year[e], w / d];
      });
    }
    const rose = races.filter((c) => by[c][by[c].length - 1][1] > by[c][0][1]).length;
    const berlin = by.Berlin, last = berlin[berlin.length - 1];
    const shown = [['Boston', 'quiet'], ['Chicago', 'quiet'], ['New York', 'quiet'], ['Berlin', 'signal']];
    return {
      values: { first: berlin[0][1], last: last[1], y0: berlin[0][0], y1: last[0], rose, races: races.length },
      plot: { series: shown.map(([label, tone]) => ({ label, tone, points: by[label] })) },
      cohort_n: total,
    };
  },

  'new-york-2021-returners': (C, file, H) => {
    const pools = new Map();
    for (let i = 0; i < C.n; i++) if (cityOf(C, i) === 'New York') {
      if (!pools.has(C.year[i])) pools.set(C.year[i], new Set());
      pools.get(C.year[i]).add(C.profile[i]);
    }
    const years = [...pools.keys()].filter((y) => y >= 2016 && y <= 2025).sort((x, y) => x - y);
    const shares = new Map();
    let total = 0;
    for (const y of years) {
      let d = 0, hit = 0;
      for (let i = 0; i < C.n; i++) {
        if (cityOf(C, i) !== 'New York' || C.year[i] !== y) continue;
        d++;
        for (let p = y - 5; p < y; p++) if (pools.has(p) && pools.get(p).has(C.profile[i])) { hit++; break; }
      }
      shares.set(y, hit / d);
      total += d;
    }
    const usual = H.median(years.filter((y) => y !== 2021).map((y) => shares.get(y)));
    return {
      values: { r21: shares.get(2021), usual, editions: years.length },
      plot: { cols: years.map((y) => ({ label: `’${String(y % 100).padStart(2, '0')}`, value: shares.get(y), tone: y === 2021 ? 'signal' : 'quiet' })), ref: { value: usual } },
      cohort_n: total,
    };
  },

  'quicker-finishes-more-repeatable': (C) => {
    const L = linked(C);
    const hit = new Float64Array(BANDS.length), d = new Float64Array(BANDS.length);
    for (let k = 0; k < L.a.length; k++) {
      const fa = C.finish[L.a[k]], fb = C.finish[L.b[k]];
      const j = BANDS.findIndex(([lo, hi]) => fa >= lo && fa < hi);
      if (j < 0) continue;
      d[j]++;
      if (Math.abs(fb / fa - 1) <= 0.02) hit[j]++;
    }
    const rows = BANDS.map(([, , label], j) => ({ label, value: hit[j] / d[j], tone: j === 0 ? 'signal' : j === BANDS.length - 1 ? 'ink' : 'quiet' }));
    return {
      values: { fast: rows[0].value, slow: rows[rows.length - 1].value, n_fast: d[0], n_slow: d[BANDS.length - 1] },
      plot: { rows },
      cohort_n: d.reduce((s, v) => s + v, 0),
    };
  },

  'same-race-different-year': (C, file, H) => {
    // One row per race (not per city): editions of 100+ start-screened finishes, races with 8+ such editions; the eight widest ranges are drawn.
    const per = new Map();
    for (let e = 0; e < C.editions.length; e++) {
      let d = 0, s = 0;
      for (const i of C.rowsOf(e)) if (C.shapeKeep[i]) { d++; s += C.slow[i]; }
      if (d < 100) continue;
      const race = C.ed.race[e];
      if (!per.has(race)) per.set(race, { city: C.ed.city[e], shares: [], years: [], d: 0 });
      const r = per.get(race);
      r.shares.push(s / d); r.years.push(C.ed.year[e]); r.d += d;
    }
    const kept = [...per].filter(([, r]) => r.shares.length >= 8);
    const cities = kept.map(([, r]) => r.city);
    const stats = kept.map(([race, r]) => {
      const lo = Math.min(...r.shares), hi = Math.max(...r.shares);
      return { label: cities.filter((c) => c === r.city).length === 1 ? r.city : race, lo, mid: H.median(r.shares), hi, k: r.shares.length,
        loYear: r.years[r.shares.indexOf(lo)], hiYear: r.years[r.shares.indexOf(hi)], d: r.d };
    }).sort((x, y) => (y.hi - y.lo) - (x.hi - x.lo) || (x.label < y.label ? -1 : 1));
    const top = stats[0];
    return {
      values: { race: top.label, lo: top.lo, hi: top.hi, top_eds: top.k, hi_year: top.hiYear, lo_year: top.loYear,
        n20: stats.filter((r) => r.hi - r.lo >= 0.2).length, races: stats.length, swing: 0.2, min_eds: 8 },
      plot: { rows: stats.slice(0, 8).map((r, i) => ({ label: r.label, lo: r.lo, mid: r.mid, hi: r.hi, tone: i === 0 ? 'signal' : 'quiet' })) },
      cohort_n: stats.reduce((t, r) => t + r.d, 0),
    };
  },

  'just-over-3-then-next': (C) => {
    const L = linked(C);
    const under = new Float64Array(15), d = new Float64Array(15);
    for (let k = 0; k < L.a.length; k++) {
      const m = Math.floor(C.finish[L.a[k]] / 60) - 175;
      if (m < 0 || m >= 15) continue;
      d[m]++;
      if (C.finish[L.b[k]] < 10800) under[m]++;
    }
    const s = Array.from(d, (x, m) => under[m] / x);
    const steps = [];
    for (let m = 0; m < 14; m++) if (m !== 4) steps.push(s[m] - s[m + 1]);
    const pts = s.map((v, m) => [(175 + m) * 60 + 30, v]);
    return {
      values: { under: s[4], over: s[5], step: s[4] - s[5], mean_step: steps.reduce((x, y) => x + y, 0) / steps.length, max_step: Math.max(...steps) },
      plot: {
        series: [{ label: 'Next finish', tone: 'quiet', points: pts }, { label: 'Across 3:00', tone: 'signal', points: [pts[4], pts[5]] },
          { label: 'After 2:59', tone: 'ink', points: [pts[4]] }, { label: 'After 3:00', tone: 'ink', points: [pts[5]] }],
      },
      cohort_n: d.reduce((x, y) => x + y, 0),
    };
  },

  'quicker-second-20k-again': (C) => {
    const L = linked(C);
    const quick = (i) => C.times[i * 9 + 7] - C.times[i * 9 + 3] < C.times[i * 9 + 3];
    let dA = 0, hA = 0, dO = 0, hO = 0, kept = 0, kq = 0;
    for (let k = 0; k < L.a.length; k++) {
      const a = L.a[k], b = L.b[k];
      if (!C.shapeKeep[a] || !C.shapeKeep[b]) continue;
      if (quick(a)) { dA++; if (quick(b)) hA++; } else { dO++; if (quick(b)) hO++; }
    }
    for (let i = 0; i < C.n; i++) if (C.shapeKeep[i]) { kept++; if (quick(i)) kq++; }
    return {
      values: { after: hA / dA, other: hO / dO, ratio: (hA / dA) / (hO / dO), base: kq / kept, n_after: dA, n_other: dO },
      plot: { value: (hA / dA) / (hO / dO), compare: [{ label: 'After a quicker 20–40K', value: hA / dA, tone: 'ink' }, { label: 'After a slower 20–40K', value: hO / dO, tone: 'quiet' }] },
      cohort_n: dA + dO,
    };
  },

  'same-records-years-later': (C, file, H) => {
    const L = linked(C);
    const firstOf = new Int32Array(L.records).fill(-1);
    for (let i = 0; i < C.n; i++) if (L.rank[i] === 0 && L.count[i] >= 2 && C.exactAgeOk[i]) firstOf[L.pid[i]] = i;
    const bands = [[18, 30, '18–29', 'ink'], [30, 40, '30–39', 'quiet'], [40, 50, '40–49', 'quiet'], [50, 60, '50–59', 'signal'], [60, 90, '60+', 'quiet']];
    const cells = bands.map(() => Array.from({ length: 11 }, () => []));
    const at8 = { young: { early: [], late: [], all: [] }, fifties: { early: [], late: [], all: [] } };
    for (let i = 0; i < C.n; i++) {
      if (L.rank[i] < 1) continue;
      const f = firstOf[L.pid[i]];
      if (f < 0) continue;
      const dy = C.year[i] - C.year[f], change = C.finish[i] - C.finish[f], age = C.exactAge[f];
      const j = bands.findIndex(([lo, hi]) => age >= lo && age < hi);
      if (j < 0) continue;
      if (dy >= 1 && dy <= 10) cells[j][dy].push(change);
      if (dy === 8 && (j === 0 || j === 3)) {
        const g = at8[j === 0 ? 'young' : 'fifties'];
        g.all.push(change);
        (C.year[f] <= 2012 ? g.early : g.late).push(change);
      }
    }
    let total = 0;
    const series = bands.filter(([, , label]) => label !== '60+').map(([, , label, tone], j) => {
      const points = [];
      for (let y = 1; y <= 10; y++) if (cells[j][y].length >= 100) { points.push([y, H.median(cells[j][y])]); total += cells[j][y].length; }
      return { label, tone, points };
    });
    const rank = { quiet: 0, ink: 1, signal: 2 };
    const order = series.map((s, k) => [s, k]).sort((x, y) => rank[x[0].tone] - rank[y[0].tone] || x[1] - y[1]).map((x) => x[0]);
    const m = (v) => H.median(v);
    const eight = cells.map((c) => H.median(c[8]));
    const rising = eight.every((v, j) => j === 0 || eight[j - 1] < v) ? 1 : 0;
    return {
      values: {
        gap: m(at8.fifties.all) - m(at8.young.all), young: m(at8.young.all), fifties: m(at8.fifties.all),
        gap_early: m(at8.fifties.early) - m(at8.young.early), gap_late: m(at8.fifties.late) - m(at8.young.late),
        n_young: at8.young.all.length, n50: at8.fifties.all.length, rising,
      },
      plot: { series: order, refs: [{ value: 0 }, { value: 8 }], notes: [{ x: 8, y: m(at8.fifties.all), value: m(at8.fifties.all) }, { x: 8, y: m(at8.young.all), value: m(at8.young.all) }] },
      cohort_n: total,
    };
  },
};
