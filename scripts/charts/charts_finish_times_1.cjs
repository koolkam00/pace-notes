// Recounts of the finish-times Top 100 charts (scripts/verify-charts.cjs): each rebuilds the chart's values
// and plotted numbers from the cohort the verifier streamed, from the chart's definition, without the Python builder.

/** Finishes per whole finish minute (floor of seconds / 60), optionally within a subset. */
function perMinute(C, include = () => true) {
  const tot = new Float64Array(721);
  for (let i = 0; i < C.n; i++) if (include(i)) tot[Math.floor(C.finish[i] / 60)]++;
  return tot;
}

/** Days since 2000-01-01 of an ISO date (UTC, whole days). */
const dayOf = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(2000, 0, 1)) / 86400000);

module.exports = {
  'minute-before-the-hour': (C) => {
    const counts = perMinute(C);
    const bins = [];
    for (let m = 160; m < 190; m++) bins.push({ x0: m * 60, x1: (m + 1) * 60, v: counts[m], tone: m === 179 ? 'signal' : m === 180 ? 'ink' : 'quiet' });
    return {
      values: { before: counts[179], after: counts[180], ratio: counts[179] / counts[180], ratio4: counts[239] / counts[240] },
      plot: { bins }, cohort_n: C.n,
    };
  },

  'shared-second': (C) => {
    // For every edition, count finishes per whole recorded second; a finish shares its second when that count is 2+.
    const perSecond = new Uint32Array(43202);
    const bands = [[35000, Infinity, '35,000+ finishes'], [20000, 35000, '20,000–35,000'], [10000, 20000, '10,000–20,000'], [5000, 10000, '5,000–10,000'], [0, 5000, 'Under 5,000']];
    const hit = new Float64Array(5), tot = new Float64Array(5);
    let alone = 0;
    for (let e = 0; e < C.editions.length; e++) {
      const rows = C.rowsOf(e);
      if (!rows.length) continue;
      const band = bands.findIndex(([a, b]) => C.edN[e] >= a && C.edN[e] < b);
      for (const i of rows) perSecond[Math.floor(C.finish[i])]++;
      for (const i of rows) {
        const k = perSecond[Math.floor(C.finish[i])];
        tot[band]++;
        if (k >= 2) hit[band]++; else alone++;
      }
      for (const i of rows) perSecond[Math.floor(C.finish[i])] = 0;
    }
    const rows = bands.map(([, , label], j) => ({ label, value: hit[j] / tot[j], tone: j === 0 ? 'signal' : j === 4 ? 'ink' : 'quiet' }));
    return {
      values: { big: rows[0].value, small: rows[4].value, alone_all: alone / C.n, n_small: tot[4], big_min: bands[0][0], small_max: bands[4][1] },
      plot: { rows }, cohort_n: C.n,
    };
  },

  'seconds-before-the-mark': (C) => {
    const counts = new Float64Array(25);
    for (let i = 0; i < C.n; i++) {
      const s = Math.floor(C.finish[i]);
      if (s >= 10620 && s < 10870) counts[Math.floor((s - 10620) / 10)]++;
    }
    const bins = [];
    for (let k = 0; k < 24; k++) bins.push({ x0: 10620 + 10 * k, x1: 10630 + 10 * k, v: counts[k], tone: k === 17 ? 'signal' : k === 12 ? 'ink' : k >= 18 ? 'faint' : 'quiet' });
    // 2:59:00–2:59:09 is the 13th step, 2:59:50–2:59:59 the 18th, 3:00:00–3:00:09 the 19th.
    const first = counts[12], last = counts[17];
    return { values: { first, last, drop: 1 - last / first, after: counts[18] }, plot: { bins, refs: [{ axis: 'x', value: 10800 }] }, cohort_n: C.n };
  },

  'a-year-apart': (C) => {
    const date = new Map(C.weather.editions.map((r) => [`${r.city}\u0000${r.year}`, r.date]));
    const edDay = C.editions.map((e) => { const d = date.get(`${e.city}\u0000${e.year}`); return d ? dayOf(d) : -1; });
    // Each record's finishes in race-date order (edition, then source order, on the same day); consecutive pairs.
    const order = Array.from({ length: C.n }, (_, i) => i);
    const day = (i) => edDay[C.edition[i]];
    order.sort((x, y) => C.profile[x] - C.profile[y] || day(x) - day(y) || C.edition[x] - C.edition[y] || x - y);
    const ny = C.cities.indexOf('New York');
    const edges = 48, hist = new Float64Array(edges), used = new Uint8Array(C.n);
    let n = 0, within = 0, beyond = 0, nNy = 0, withinNy = 0;
    for (let k = 1; k < order.length; k++) {
      const a = order[k - 1], b = order[k];
      if (C.profile[a] !== C.profile[b]) continue;
      if (day(a) < 0 || day(b) < 0) throw new Error('An edition with finishes has no race date');
      const gap = day(b) - day(a);
      if (gap < 300 || gap > 429) continue;
      n++; used[a] = used[b] = 1;
      const d = C.finish[b] - C.finish[a];
      const close = Math.abs(d) <= 300;
      if (close) within++;
      if (Math.abs(d) > 1200) beyond++;
      if (d >= -3600 && d <= 3600) hist[Math.min(edges - 1, Math.floor((d + 3600) / 150))]++;
      const da = C.exactAge[b] - C.exactAge[a];
      if (C.city[a] === ny && C.city[b] === ny && C.year[b] - C.year[a] === 1 && C.exactAgeOk[a] && C.exactAgeOk[b] && da >= 0 && da <= 2) {
        nNy++;
        if (close) withinNy++;
      }
    }
    const bins = [];
    for (let k = 0; k < edges; k++) {
      const x0 = -3600 + 150 * k, x1 = x0 + 150;
      bins.push({ x0, x1, v: hist[k] / n, tone: x0 >= -300 && x1 <= 300 ? 'signal' : x1 <= -1200 || x0 >= 1200 ? 'faint' : 'quiet' });
    }
    let cohort = 0;
    for (let i = 0; i < C.n; i++) cohort += used[i];
    return {
      values: { within: within / n, tol: 300, beyond20: beyond / n, n, within_ny: withinNy / nNy, n_ny: nNy },
      plot: { bins }, cohort_n: cohort,
    };
  },

  'kick-just-under-the-mark': (C) => {
    const tot = new Float64Array(721), hit = new Float64Array(721);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      n++;
      const m = Math.floor(C.finish[i] / 60);
      tot[m]++;
      if (C.pace(i, 8) < C.pace(i, 7)) hit[m]++;
    }
    const at = (m) => hit[m] / tot[m];
    // The highest share among the other minutes from ten before a half-hour mark to five after it.
    const near = (mark) => {
      let best = -1;
      for (let m = mark - 10; m <= mark + 5; m++) if (m !== mark - 1) best = Math.max(best, at(m));
      return best;
    };
    const line = [];
    for (let m = 170; m <= 249; m++) line.push([m * 60 + 30, at(m)]);
    return {
      values: {
        a: at(179), a0: at(178), b: at(180), b1: at(181), near3: near(180),
        peak330: at(209), near330: near(210), peak4: at(239), near4: near(240),
        n_min: Math.min(tot[178], tot[179], tot[180]),
      },
      plot: {
        series: [
          { label: 'Every minute', points: line, tone: 'quiet' },
          { label: '2:59', points: [[179 * 60 + 30, at(179)]], tone: 'signal' },
          { label: '3:00', points: [[180 * 60 + 30, at(180)]], tone: 'ink' },
        ],
      },
      cohort_n: n,
    };
  },

  'ten-minutes-many-places': (C, file, H) => {
    const marks = [['2:30', 9000, 'w230'], ['3:00', 10800, 'w3'], ['3:30', 12600, 'w330'], ['4:00', 14400, 'w4'], ['4:30', 16200, 'w430'], ['5:00', 18000, 'w5']];
    const per = Object.fromEntries(marks.map(([, , k]) => [k, []]));
    let eds = 0, n = 0;
    for (let e = 0; e < C.editions.length; e++) {
      const rows = C.rowsOf(e);
      if (rows.length < 30000) continue;
      eds++; n += rows.length;
      for (const [, mark, k] of marks) {
        let c = 0;
        for (const i of rows) if (C.finish[i] >= mark - 300 && C.finish[i] < mark + 300) c++;
        per[k].push((c * 40000) / rows.length);
      }
    }
    if (!eds) throw new Error('no editions with 30,000+ finishes');
    const v = Object.fromEntries(marks.map(([, , k]) => [k, H.median(per[k])]));
    v.lo4 = Math.min(...per.w4); v.hi3 = Math.max(...per.w3); v.eds = eds; v.scale = 40000; v.size_min = 30000;
    return { values: v, plot: { cols: marks.map(([label, , k]) => ({ label, value: v[k], tone: k === 'w4' ? 'signal' : k === 'w230' ? 'ink' : 'quiet' })) }, cohort_n: n };
  },

  'same-four-hours-different-place': (C) => {
    const cityN = new Float64Array(C.cities.length), slower = new Float64Array(C.cities.length);
    let allSlower = 0;
    for (let i = 0; i < C.n; i++) {
      cityN[C.city[i]]++;
      if (C.finish[i] > 14400) { slower[C.city[i]]++; allSlower++; }
    }
    const top = C.cities.map((name, i) => ({ name, i })).sort((a, b) => cityN[b.i] - cityN[a.i] || (a.name < b.name ? -1 : 1)).slice(0, 12);
    const rows = top.map(({ name, i }) => ({ label: name, value: slower[i] / cityN[i] }))
      .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1))
      .map((r) => ({ ...r, tone: r.label === 'Washington' ? 'signal' : r.label === 'Valencia' ? 'ink' : 'quiet' }));
    const wash = C.cities.indexOf('Washington'), val = C.cities.indexOf('Valencia');
    return {
      values: { wash: slower[wash] / cityN[wash], val: slower[val] / cityN[val], all: allSlower / C.n },
      plot: { rows },
      cohort_n: top.reduce((s, { i }) => s + cityN[i], 0),
    };
  },

  'only-1-in-20-under-3': (C, file, H) => {
    const marks = [[9000, 'sub230'], [10800, 'sub3'], [12600, 'sub330'], [14400, 'sub4'], [18000, 'sub5'], [21600, 'sub6']];
    const v = {};
    for (const [t, k] of marks) v[k] = H.share((i) => C.finish[i] < t).share;
    v.sub3to4 = H.share((i) => C.finish[i] >= 10800 && C.finish[i] < 14400).share;
    const shares = [];
    for (let e = 0; e < C.editions.length; e++) {
      const rows = C.rowsOf(e);
      if (rows.length < 1000) continue;
      let c = 0;
      for (const i of rows) if (C.finish[i] < 10800) c++;
      shares.push(c / rows.length);
    }
    if (!shares.length) throw new Error('no editions with 1,000+ finishes');
    v.ed_med = H.median(shares); v.eds = shares.length;
    const parts = [{ share: v.sub3, tone: 'signal', label: 'under 3:00' }, { share: v.sub3to4, tone: 'ink', label: '3:00–4:00' }];
    return { values: v, plot: { parts }, cohort_n: C.n };
  },
};
