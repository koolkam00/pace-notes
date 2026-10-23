// Recounts of the Top 100 charts' pacing batch one (scripts/verify-charts.cjs): each rebuilds the chart's values
// and plotted numbers from the streamed cohort, from the chart's definition, without the Python builder. Every chart here
// reads only the finishes of editions that pass the start-offset screen (C.shapeKeep).
const BANDS = [[0, 10800, 'Under 3:00', '<3:00'], [10800, 12600, '3:00–3:30', '3:00'], [12600, 14400, '3:30–4:00', '3:30'],
  [14400, 16200, '4:00–4:30', '4:00'], [16200, 18000, '4:30–5:00', '4:30'], [18000, 19800, '5:00–5:30', '5:00'],
  [19800, 21600, '5:30–6:00', '5:30'], [21600, Infinity, '6:00+', '6:00+']];
const bandOf = (f) => BANDS.findIndex(([lo, hi]) => f >= lo && f < hi);

/** Shares of a per-finish test over the screened finishes: overall and per finish band. */
function byBand(C, test) {
  const hit = new Float64Array(BANDS.length), den = new Float64Array(BANDS.length);
  let all = 0, n = 0;
  for (let i = 0; i < C.n; i++) {
    if (!C.shapeKeep[i]) continue;
    const b = bandOf(C.finish[i]), t = test(i) ? 1 : 0;
    hit[b] += t; den[b]++; all += t; n++;
  }
  for (const d of den) if (d < 100) throw new Error('A finish band under 100 finishes');
  return { all: all / n, n, bands: Array.from(hit, (h, b) => h / den[b]), den };
}

module.exports = {
  'even-pace-1-in-13': (C) => {
    let mh = 0, md = 0, wh = 0, wd = 0;
    const r = byBand(C, (i) => {
      const mean = C.times[i * 9 + 7] / 40;
      let even = true;
      for (let k = 0; k < 8; k++) if (Math.abs(C.pace(i, k) / mean - 1) > 0.03) { even = false; break; }
      if (C.gender[i] === 1) { md++; mh += even; } else if (C.gender[i] === 2) { wd++; wh += even; }
      return even;
    });
    const last = BANDS.length - 1;
    const rows = r.bands.map((v, b) => ({ label: BANDS[b][2], value: v, tone: b === 0 ? 'signal' : b === last ? 'ink' : 'quiet' }));
    return {
      values: { share: r.all, tol: 0.03, sub3: r.bands[0], slow: r.bands[last], men: mh / md, women: wh / wd, n_slow: r.den[last] },
      plot: { rows }, cohort_n: r.n,
    };
  },

  'same-20k-different-finish': (C, file, H) => {
    const groups = Array.from({ length: 7 }, () => []);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      const t20 = C.times[i * 9 + 3];
      if (!C.shapeKeep[i] || t20 < 6600 || t20 >= 6900) continue;
      n++;
      const r0 = C.pace(i, 0) / C.baseline[i] - 1;
      const g = r0 <= -0.08 ? 0 : r0 <= -0.05 ? 1 : r0 <= -0.03 ? 2 : r0 <= -0.01 ? 3 : r0 < 0.01 ? 4 : r0 < 0.03 ? 5 : 6;
      groups[g].push(C.finish[i]);
    }
    const labels = ['8%+ quicker', '5–8% quicker', '3–5% quicker', '1–3% quicker', 'Steady (±1%)', '1–3% slower', '3%+ slower'];
    const rows = groups.map((g, k) => {
      const s = Float64Array.from(g).sort();
      const q = (p) => H.quantileSorted(s, p);
      return { label: labels[k], tone: k === 0 ? 'signal' : k === 4 ? 'ink' : 'quiet', lo: q(0.1), q1: q(0.25), mid: q(0.5), q3: q(0.75), hi: q(0.9) };
    });
    return {
      values: { gap: rows[0].mid - rows[4].mid, cut: 0.08, fast_n: groups[0].length, even_n: groups[4].length, fast_med: rows[0].mid, even_med: rows[4].mid, t20_lo: 6600, t20_hi: 6900 },
      plot: { rows }, cohort_n: n,
    };
  },

  'second-20k-rarely-quicker': (C) => {
    const r = byBand(C, (i) => C.times[i * 9 + 7] - C.times[i * 9 + 3] < C.times[i * 9 + 3]);
    const last = BANDS.length - 1;
    return {
      values: { all: r.all, sub3: r.bands[0], slow: r.bands[last] },
      plot: {
        value: r.all,
        compare: [{ label: 'All finishes', value: r.all, tone: 'signal' }, { label: BANDS[0][2], value: r.bands[0], tone: 'ink' }],
      },
      cohort_n: r.n,
    };
  },

  'two-ways-to-run-359': (C, file, H) => {
    // Section pace against the finish's own average pace (its time over 42.195 km), by group: 0 no slowdown, 1 slowdown.
    const rel = [Array.from({ length: 9 }, () => []), Array.from({ length: 9 }, () => [])];
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i] || C.finish[i] < 14340 || C.finish[i] >= 14400) continue;
      const g = C.slow[i] ? 1 : 0, avg = C.finish[i] / 42.195;
      for (let k = 0; k < 9; k++) rel[g][k].push(C.pace(i, k) / avg - 1);
    }
    const [nRest, nSlow] = [rel[0][0].length, rel[1][0].length];
    const rest = rel[0].map((v) => H.median(v)), slow = rel[1].map((v) => H.median(v));
    // How much quicker than average the slowdown group ran 0-5K, 5-10K and 10-15K.
    const first = slow.slice(0, 3).map((x) => -x);
    return {
      values: {
        early: first.reduce((a, b) => a + b, 0) / 3, early_min: Math.min(...first), early_max: Math.max(...first),
        rest_max: Math.max(...rest.map(Math.abs)), tol: 0.05, n_slow: nSlow, n_rest: nRest,
      },
      plot: {
        series: [{ label: 'No slowdown', points: rest.map((y, k) => [k, y]), tone: 'ink' },
          { label: 'Slowdown', points: slow.map((y, k) => [k, y]), tone: 'signal' }],
      },
      cohort_n: nRest + nSlow,
    };
  },

  'slowed-in-every-5k': (C) => {
    // Five consecutive 5K sections (15-20K to 35-40K), each strictly slower than the one before.
    const r = byBand(C, (i) => {
      for (let k = 4; k < 8; k++) if (!(C.pace(i, k) > C.pace(i, k - 1))) return false;
      return true;
    });
    let peak = 0;
    r.bands.forEach((v, b) => { if (v > r.bands[peak]) peak = b; });
    const last = BANDS.length - 1;
    const rows = r.bands.map((v, b) => ({ label: BANDS[b][2], value: v, tone: b === peak ? 'signal' : b === last ? 'ink' : 'quiet' }));
    return {
      values: { share: r.all, peak: r.bands[peak], peak_lo: BANDS[peak][0], peak_hi: BANDS[peak][1], sub3: r.bands[0], slow6: r.bands[BANDS.length - 1] },
      plot: { rows }, cohort_n: r.n,
    };
  },

  'kick-but-not-early-pace': (C) => {
    // Six coarser bands here (5:00+ pooled), so the card holds every row.
    const starts = [0, 10800, 12600, 14400, 16200, 18000], labels = ['Under 3:00', '3:00–3:30', '3:30–4:00', '4:00–4:30', '4:30–5:00', '5:00+'];
    const e = new Float64Array(6), k = new Float64Array(6), d = new Float64Array(6);
    let ea = 0, ka = 0, n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      let b = 5;
      while (C.finish[i] < starts[b]) b--;
      const x = C.pace(i, 8) < C.baseline[i], y = C.pace(i, 8) < C.pace(i, 7);
      e[b] += x; k[b] += y; d[b]++; ea += x; ka += y; n++;
    }
    let sd = 0, sk = 0, se = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i] || !C.slow[i]) continue;
      sd++; sk += C.pace(i, 8) < C.pace(i, 7); se += C.pace(i, 8) < C.baseline[i];
    }
    const rows = [{ label: 'All finishes', a: ea / n, b: ka / n, tone: 'signal' }, ...labels.map((label, b) => ({ label, a: e[b] / d[b], b: k[b] / d[b], tone: 'quiet' }))];
    return { values: { kick: ka / n, early: ea / n, slow_kick: sk / sd, slow_early: se / sd }, plot: { rows }, cohort_n: n };
  },

  'rarely-back-to-early-pace': (C) => {
    let n = 0, b10 = 0, b15 = 0, stay = 0;
    for (let i = 0; i < C.n; i++) {
      const o = C.onset[i];
      // Onsets at 20, 25 or 30 km have at least one later full 5K before 40K; a 35K onset has none.
      if (!C.shapeKeep[i] || (o !== 20 && o !== 25 && o !== 30)) continue;
      n++;
      let any10 = false, any15 = false, all25 = true;
      // The onset section runs from the onset km (section o / 5); later full sections run to 35–40K (section 7).
      for (let k = o / 5 + 1; k <= 7; k++) {
        const rel = C.pace(i, k) / C.baseline[i];
        if (rel < 1.10) any10 = true;
        if (rel < 1.15) any15 = true;
        if (!(rel >= 1.25)) all25 = false;
      }
      b10 += any10; b15 += any15; stay += all25;
    }
    const v = { back: b10 / n, back15: b15 / n, stayed: stay / n, n, thr: 0.1 };
    return {
      values: v,
      plot: {
        value: v.back,
        compare: [{ label: 'Back within 10%', value: v.back, tone: 'signal' }, { label: 'Stayed 25%+ slower', value: v.stayed, tone: 'quiet' }],
      },
      cohort_n: n,
    };
  },

  'bigger-fade-later-finish': (C, file, H) => {
    const starts = [9000, 10800, 12600, 14400, 16200, 18000], cols = [4, 5, 6, 7];
    const cellsRaw = starts.map(() => cols.map(() => []));
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i] || C.finish[i] < 9000 || C.finish[i] >= 19800) continue;
      const r = Math.floor((C.finish[i] - 9000) / 1800);
      cols.forEach((k, j) => cellsRaw[r][j].push(C.pace(i, k) / C.baseline[i] - 1));
    }
    const sizes = cellsRaw.map((row) => row[0].length);
    const cells = cellsRaw.map((row) => row.map((v) => H.median(v)));
    const last = Object.fromEntries(cells.map((row, r) => [`c${r}`, row[3]]));
    return {
      values: { fast: cells[0][3], slow: cells[5][3], n_min: Math.min(...sizes), fast_lo: 9000, slow_lo: 18000, band: 1800, ...last },
      plot: { cells, rows: ['2:30–3:00', '3:00–3:30', '3:30–4:00', '4:00–4:30', '4:30–5:00', '5:00–5:30'] },
      cohort_n: sizes.reduce((a, b) => a + b, 0),
    };
  },
};
