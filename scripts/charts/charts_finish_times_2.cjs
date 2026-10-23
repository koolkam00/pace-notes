// Recounts of the Top 100 charts, finish times (second batch; scripts/verify-charts.cjs): each rebuilds the chart's
// values and plotted numbers from the cohort the verifier streamed, without the Python builder.
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/** Finishes per whole finish minute, for the finishes `keep` admits. */
function minuteCounts(C, keep = () => true) {
  const counts = new Float64Array(721);
  for (let i = 0; i < C.n; i++) if (keep(i)) counts[Math.floor(C.finish[i] / 60)]++;
  return counts;
}

/** The step across boundary k: minute k − 1 over minute k, against the same ratio one and two minutes either side. */
const step = (c, k) => (c[k - 1] / c[k]) / Math.sqrt((c[k - 3] / c[k - 2]) * (c[k + 1] / c[k + 2]));

/** Finish seconds of each edition, sorted. */
function editionFinishes(C, e) {
  return Float64Array.from(C.rowsOf(e), (i) => C.finish[i]).sort();
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

module.exports = {
  'men-bunch-at-round-marks': (C) => {
    const ok = (i) => !C.genderGapEdition[C.edition[i]];
    const men = minuteCounts(C, (i) => C.gender[i] === 1 && ok(i)), women = minuteCounts(C, (i) => C.gender[i] === 2 && ok(i));
    const marks = [180, 210, 240, 270, 300];
    let nMin = Infinity;
    for (const c of [men, women]) for (const k of marks) nMin = Math.min(nMin, c[k - 1], c[k]);
    // The minute before each mark over the minute after, within each gender.
    const rows = marks.map((k) => ({ label: hm(k), a: women[k - 1] / women[k], b: men[k - 1] / men[k], tone: k === 180 ? 'signal' : 'quiet' }));
    let n = 0;
    for (let i = 0; i < C.n; i++) if ((C.gender[i] === 1 || C.gender[i] === 2) && ok(i)) n++;
    return { values: { men: rows[0].b, women: rows[0].a, men4: rows[2].b, women4: rows[2].a, n_min: nMin }, plot: { rows, ref: { value: 1 } }, cohort_n: n };
  },

  'mens-median-on-the-mark': (C, file, H) => {
    // Gender-recording-gap editions stay out of the whole card.
    const men = [], every = [], perEdition = Array.from(C.editions, () => []);
    for (let i = 0; i < C.n; i++) {
      if (C.genderGapEdition[C.edition[i]]) continue;
      const f = C.finish[i];
      every.push(f);
      if (C.gender[i] === 1) { men.push(f); perEdition[C.edition[i]].push(f); }
    }
    const under = (xs) => xs.filter((f) => f < 14400).length / xs.length;
    const su = under(men), sa = under(every);
    const eq = H.median(perEdition.filter((x) => x.length >= H.MIN_CELL).map((x) => H.median(x)));
    return {
      values: { men: H.median(men), all: H.median(every), men_eq: eq, men_under4: su, all_under4: sa },
      plot: { value: su, compare: [{ label: "Men's", value: su, tone: 'signal' }, { label: 'All finishes', value: sa, tone: 'ink' }] },
      cohort_n: every.length,
    };
  },

  'long-back-of-the-field': (C, file, H) => {
    // Inside each edition of 2,000+ finishes: each percentile's distance from that edition's median; then the median
    // of each distance over the editions.
    const pcts = [[0.99, 'Slowest 1%'], [0.01, 'Quickest 1%'], [0.9, 'Slowest 10%'], [0.1, 'Quickest 10%'], [0.75, 'Slowest 25%'], [0.25, 'Quickest 25%']];
    const dist = pcts.map(() => []);
    let longer = 0, eds = 0, n = 0;
    for (let e = 0; e < C.editions.length; e++) {
      if (C.edN[e] < 2000) continue;
      const f = editionFinishes(C, e), m = H.quantileSorted(f, 0.5);
      eds++;
      n += f.length;
      pcts.forEach(([p], j) => dist[j].push(Math.abs(H.quantileSorted(f, p) - m)));
      if (H.quantileSorted(f, 0.99) - m > m - H.quantileSorted(f, 0.01)) longer++;
    }
    const rows = pcts.map(([p, label], j) => ({ label, value: H.median(dist[j]), tone: p === 0.99 ? 'signal' : p === 0.01 ? 'ink' : 'quiet' }));
    return { values: { back: rows[0].value, front: rows[1].value, eds_back_longer: longer, eds }, plot: { rows, ref: { value: 0 } }, cohort_n: n };
  },

  'even-ten-minute-marks': (C) => {
    const c = minuteCounts(C);
    const marks = (from, to) => { const out = []; for (let k = from; k <= to; k += 10) if (k % 30 !== 0) out.push({ k, v: step(c, k) }); return out; };
    const early = marks(160, 230), late = marks(250, 350);
    const avg = (xs) => mean(xs.map((d) => d.v));
    return {
      values: { ten: avg(early), ten_late: avg(late), at310: step(c, 190) },
      plot: {
        groups: [
          { label: 'Marks from 4:10 to 5:50', dots: late.map((d) => ({ v: d.v, tone: 'ink' })) },
          { label: 'Marks from 2:40 to 3:50', dots: early.map((d) => ({ v: d.v, tone: 'signal' })) },
        ],
        refs: [{ axis: 'x', value: 1 }],
      },
      cohort_n: C.n,
    };
  },

  'fields-stretching-out': (C, file, H) => {
    const byCity = new Map();
    for (let e = 0; e < C.editions.length; e++) {
      if (C.edN[e] < 3000) continue;
      if (!byCity.has(C.ed.city[e])) byCity.set(C.ed.city[e], []);
      byCity.get(C.ed.city[e]).push(e);
    }
    const rows = [];
    let n = 0;
    for (const [city, list] of byCity) {
      const eds = list.slice().sort((x, y) => C.ed.year[x] - C.ed.year[y] || x - y);
      if (eds.length < 6 || C.ed.year[eds[eds.length - 1]] - C.ed.year[eds[0]] < 8) continue;
      const span = eds.map((e) => { const f = editionFinishes(C, e); n += f.length; return H.quantileSorted(f, 0.9) - H.quantileSorted(f, 0.1); });
      const a = mean(span.slice(0, 3)), b = mean(span.slice(-3));
      const yy = (e) => String(C.ed.year[e] % 100).padStart(2, '0');
      rows.push({ label: `${city} ’${yy(eds[0])}–${yy(eds[eds.length - 1])}`, city, a, b });
    }
    rows.sort((x, y) => (y.b - y.a) - (x.b - x.a) || (x.label < y.label ? -1 : 1));
    const berlin = rows.find((r) => r.city === 'Berlin');
    return {
      values: {
        n_wider: rows.filter((r) => r.b > r.a).length, races: rows.length, berlin: berlin.b - berlin.a, berlin_first: berlin.a, berlin_last: berlin.b,
        min_change: Math.min(...rows.map((r) => r.b - r.a)), max_change: Math.max(...rows.map((r) => r.b - r.a)),
      },
      plot: { rows: rows.map(({ label, city, a, b }) => ({ label, value: b - a, tone: city === 'Berlin' ? 'signal' : 'quiet' })) },
      cohort_n: n,
    };
  },

  'one-hour-holds-half': (C) => {
    // A window starting on a whole minute holds exactly the finishes of its 60 whole finish minutes.
    const c = minuteCounts(C);
    let best = -1, start = 0;
    for (let m = 120; m <= 360; m++) {
      let k = 0;
      for (let j = m; j < m + 60; j++) k += c[j];
      if (k > best) { best = k; start = m; }
    }
    let before = 0;
    for (let i = 0; i < C.n; i++) if (C.finish[i] < start * 60) before++;
    const share = best / C.n;
    const bins = [];
    for (let m = 120; m < 420; m += 2) bins.push({ x0: m * 60, x1: (m + 2) * 60, v: c[m] + c[m + 1], tone: m >= start && m < start + 60 ? 'signal' : 'quiet' });
    return {
      values: { share, start: start * 60, end: (start + 60) * 60, before: before / C.n, after: (C.n - before - best) / C.n },
      plot: { bins },
      cohort_n: C.n,
    };
  },

  'quick-double-mostly-slower': (C, file, H) => {
    // Race dates come from the pinned weather evidence; days since 2000-01-01.
    const iso = new Map(C.weather.editions.map((r) => [`${r.city}|${r.year}`, r.date]));
    const edDay = C.editions.map((e) => {
      const d = iso.get(`${e.city}|${e.year}`);
      return d ? (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(2000, 0, 1)) / 86400000 : -1;
    });
    const day = (i) => edDay[C.edition[i]];
    // Every record's finishes in race-date order; a pair is two neighbours in that order.
    const order = Array.from({ length: C.n }, (_, i) => i).sort((x, y) => C.profile[x] - C.profile[y] || day(x) - day(y) || C.edition[x] - C.edition[y] || x - y);
    const bands = [[0, 12600, 'Under 3:30'], [12600, 14400, '3:30–4:00'], [14400, 16200, '4:00–4:30'], [16200, 18000, '4:30–5:00'], [18000, Infinity, '5:00+']];
    // cells[band][race pair] = { dbl: [quicker...], yr: [quicker...] } with the pairs' finish indices.
    const cells = bands.map(() => new Map());
    for (let k = 1; k < order.length; k++) {
      const a = order[k - 1], b = order[k];
      if (C.profile[a] !== C.profile[b]) continue;
      const gap = day(b) - day(a);
      const isDbl = gap >= 1 && gap <= 21 && C.city[a] !== C.city[b];
      const isYr = gap >= 301 && gap <= 430;
      if (!isDbl && !isYr) continue;
      const m = (C.finish[a] + C.finish[b]) / 2;
      const bi = bands.findIndex(([lo, hi]) => m >= lo && m < hi);
      const key = `${C.cities[C.city[a]]} then ${C.cities[C.city[b]]}`;
      if (!cells[bi].has(key)) cells[bi].set(key, { dbl: [], yr: [] });
      cells[bi].get(key)[isDbl ? 'dbl' : 'yr'].push([a, b]);
    }
    const quick = ([a, b]) => (C.finish[b] < C.finish[a] ? 1 : 0);
    const used = new Uint8Array(C.n);
    let pairsDbl = 0, pairsYr = 0;
    const rows = [], sizes = [];
    let slowerTop = 0;
    bands.forEach(([lo, , label], bi) => {
      let nd = 0, qd = 0, ny = 0, wq = 0;
      for (const { dbl, yr } of cells[bi].values()) {
        if (!dbl.length || yr.length < 10) continue;
        nd += dbl.length; ny += yr.length;
        const qy = yr.reduce((s, p) => s + quick(p), 0) / yr.length;
        wq += dbl.length * qy;
        for (const p of dbl) { qd += quick(p); if (bi === 0 && C.finish[p[1]] > C.finish[p[0]]) slowerTop++; }
        for (const [a, b] of dbl.concat(yr)) used[a] = used[b] = 1;
      }
      pairsDbl += nd; pairsYr += ny;
      rows.push({ label, a: wq / nd, b: qd / nd, tone: lo === 0 ? 'signal' : 'quiet' });
      sizes.push([nd, ny]);
    });
    const gaps = rows.map((r) => r.a - r.b);
    let cohort = 0;
    for (let i = 0; i < C.n; i++) cohort += used[i];
    return {
      values: {
        dbl: rows[0].b, yr: rows[0].a, n_dbl: sizes[0][0], n_yr: sizes[0][1], slower_dbl: slowerTop / sizes[0][0],
        gap_top: gaps[0], gap_max_rest: Math.max(...gaps.slice(1).map(Math.abs)), gap_back: gaps[gaps.length - 1],
        min_pairs: Math.min(...sizes.flat()), pairs_dbl: pairsDbl, pairs_yr: pairsYr,
      },
      plot: { rows, ref: { axis: 'x', value: 0.5 }, notes: [{ x: rows[0].b, row: 0, value: rows[0].b }, { x: rows[0].a, row: 0, value: rows[0].a }] },
      cohort_n: cohort,
    };
  },
};
