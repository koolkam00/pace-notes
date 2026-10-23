// Recounts of the courses-and-weather Top 100 charts (scripts/verify-charts.cjs): each rebuilds its chart's values and
// plotted numbers from the streamed cohort, from the chart's definition, without the Python builder.
const SECTIONS = ['0–5K', '5–10K', '10–15K', '15–20K', '20–25K', '25–30K', '30–35K', '35–40K', '40K–finish'];

/** Editions of a city that hold finishes, in index order. */
const editionsOf = (C, city) => C.editions.map((_, e) => e).filter((e) => C.ed.city[e] === city && C.edN[e] > 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Each edition's sustained slowdown share among start-screened finishes (100+), NaN otherwise, and the counts. */
function screenedShares(C) {
  const E = C.editions.length, hit = new Float64Array(E), den = new Float64Array(E);
  for (let i = 0; i < C.n; i++) if (C.shapeKeep[i]) { den[C.edition[i]]++; hit[C.edition[i]] += C.slow[i]; }
  return { share: Array.from(den, (d, e) => (d >= 100 ? hit[e] / d : NaN)), den };
}

/** Rows of an edition at the same early pace (5–20K 330–360 s/km) in start-screened editions. */
const inBand = (C, i) => C.shapeKeep[i] === 1 && C.baseline[i] >= 330 && C.baseline[i] < 360;

module.exports = {
  'same-race-warmer-return': (C, file, H) => {
    // Race dates from the weather evidence, as days.
    const dates = new Map(C.weather.editions.map((r) => [`${r.city}|${r.year}`, r.date]));
    const day = C.editions.map((e) => { const d = dates.get(`${e.city}|${e.year}`); return d ? Date.parse(`${d}T00:00:00Z`) / 86400000 : NaN; });
    // One linked record's finishes at one race, in race-date order; neighbours form the pairs.
    const order = new Uint32Array(C.n).map((_, i) => i);
    order.sort((a, b) => (C.profile[a] - C.profile[b]) || (C.city[a] - C.city[b]) || (day[C.edition[a]] - day[C.edition[b]]) || (a - b));
    const temp = C.ed.temp;
    // Groups by the rounded change in start temperature: 0 much warmer (+6 or more), 1 within 1, 2 much cooler (−6 or more).
    const groupOf = (d) => (d >= 6 ? 0 : d > -1 && d < 1 ? 1 : d <= -6 ? 2 : -1);
    const G = [0, 1, 2].map(() => ({ sec: Array.from({ length: 9 }, () => []), fin: [], eps: new Map(), races: new Set() }));
    let pairs = 0;
    const eds = new Set();
    for (let k = 1; k < C.n; k++) {
      const a = order[k - 1], b = order[k];
      if (C.profile[a] !== C.profile[b] || C.city[a] !== C.city[b]) continue;
      const ea = C.edition[a], eb = C.edition[b];
      if (!Number.isFinite(day[ea]) || !Number.isFinite(day[eb]) || day[ea] === day[eb]) continue;
      const gap = C.year[b] - C.year[a];
      if (gap < 1 || gap > 2 || !Number.isFinite(temp[ea]) || !Number.isFinite(temp[eb])) continue;
      if (!C.shapeKeep[a] || !C.shapeKeep[b]) continue;
      pairs++; eds.add(ea); eds.add(eb);
      const j = groupOf(Math.round((temp[eb] - temp[ea]) * 10) / 10);
      if (j < 0) continue;
      const g = G[j], key = `${ea}|${eb}`, ch = [];
      for (let s = 0; s < 9; s++) { ch.push(C.pace(b, s) / C.pace(a, s) - 1); g.sec[s].push(ch[s]); }
      g.fin.push(C.finish[b] / C.finish[a] - 1);
      if (!g.eps.has(key)) g.eps.set(key, []);
      g.eps.get(key).push(ch);
      g.races.add(C.city[a]);
    }
    const med = G.map((g) => g.sec.map((xs) => H.median(xs)));
    const [w, s, c] = G;
    // Much warmer returns: edition pairs with 100+ pairs whose 35–40K change beat their 0–5K change, and the 35–40K
    // median with each edition pair left out in turn.
    let big = 0, lateGt = 0;
    const loo = [];
    for (const [key, rows] of w.eps) {
      if (rows.length >= 100) { big++; if (H.median(rows.map((r) => r[7])) > H.median(rows.map((r) => r[0]))) lateGt++; }
      const rest = [];
      for (const [k2, r2] of w.eps) if (k2 !== key) for (const r of r2) rest.push(r[7]);
      loo.push(H.median(rest));
    }
    const labels = ['Much warmer', 'About the same', 'Much cooler'], tones = ['signal', 'quiet', 'quiet'];
    return {
      values: {
        warm_start: med[0][0], warm_late: med[0][7], same_start: med[1][0], same_late: med[1][7], cool_start: med[2][0], cool_late: med[2][7],
        warm_finish: H.median(w.fin), cool_finish: H.median(c.fin), same_finish: H.median(s.fin),
        n_warm: w.fin.length, n_same: s.fin.length, n_cool: c.fin.length, ep_warm: w.eps.size, ep_same: s.eps.size, ep_cool: c.eps.size,
        races_warm: w.races.size, races_same: s.races.size, races_cool: c.races.size, ep_warm_100: big, ep_warm_late_gt: lateGt,
        loo_lo: Math.min(...loo), loo_hi: Math.max(...loo), pairs,
      },
      plot: { series: labels.map((label, j) => ({ label, tone: tones[j], points: med[j].map((y, k) => [k, y]) })) },
      cohort_n: pairs,
    };
  },

  'every-race-has-its-minute': (C) => {
    const races = ['Valencia', 'Boston', 'Berlin'], windows = [[178, 179], [208, 209], [238, 239]], per = {};
    let n = 0, nMin = Infinity;
    for (const city of races) {
      per[city] = [];
      for (const e of editionsOf(C, city)) {
        if (C.edN[e] < 3000) continue;
        const counts = new Uint32Array(721);
        for (const i of C.rowsOf(e)) counts[Math.floor(C.finish[i] / 60)]++;
        let best = 0;
        for (let m = 1; m < 721; m++) if (counts[m] > counts[best]) best = m;
        per[city].push(best);
        n += C.edN[e]; nMin = Math.min(nMin, C.edN[e]);
      }
    }
    const tone = (city) => (city === 'Berlin' ? 'signal' : city === 'Valencia' ? 'ink' : 'quiet');
    return {
      values: { bk: per.Berlin.filter((m) => m === 238 || m === 239).length, bn: per.Berlin.length, bmark: 14400, vk: per.Valencia.filter((m) => m === 178 || m === 179).length, vn: per.Valencia.length, vmark: 10800, n_min: nMin },
      plot: {
        rows: races.map((city) => {
          const ms = per[city], parts = windows.map((w) => ms.filter((m) => w.includes(m)).length / ms.length);
          return { label: city, tone: tone(city), parts: [...parts, 1 - parts.reduce((x, y) => x + y, 0)] };
        }),
        parts: ['2:58–59', '3:28–29', '3:58–59', 'Other'].map((label) => ({ label })),
      },
      cohort_n: n,
    };
  },

  'where-each-race-slows': (C, file, H) => {
    const cities = ['Hamburg', 'Berlin', 'Chicago', 'London', 'Boston', 'New York'], k = SECTIONS.indexOf('20–25K');
    let total = 0;
    const per = new Map();
    for (const city of cities) {
      const perEd = [];
      for (const e of editionsOf(C, city)) {
        const rows = Array.from(C.rowsOf(e)).filter((i) => inBand(C, i));
        if (rows.length < 100) continue;
        total += rows.length;
        perEd.push(H.median(rows.map((i) => C.pace(i, k) / C.baseline[i] - 1)));
      }
      per.set(city, H.median(perEd));
    }
    const order = [...cities].sort((a, b) => per.get(b) - per.get(a) || (a < b ? -1 : 1));
    const ny = per.get('New York');
    // The runner-up after New York is the comparator.
    const nextCity = order.filter((c) => c !== 'New York')[0];
    return {
      values: {
        ny, next: per.get(nextCity), next_city: nextCity, ny_next: Math.max(...cities.filter((c) => c !== 'New York').map((c) => per.get(c))),
        ny_rank: order.indexOf('New York') + 1,
      },
      plot: { rows: order.map((label) => ({ label, value: per.get(label), tone: label === 'New York' ? 'signal' : label === nextCity ? 'ink' : 'quiet' })) },
      cohort_n: total,
    };
  },

  'how-spread-out-each-race-is': (C, file, H) => {
    const per = [];
    for (const city of [...new Set(C.editions.map((e, i) => (C.edN[i] >= 1000 ? e.city : null)).filter(Boolean))].sort()) {
      const qs = [];
      let n = 0;
      for (const e of editionsOf(C, city)) {
        if (C.edN[e] < 1000) continue;
        const f = Float64Array.from(C.rowsOf(e), (i) => C.finish[i]).sort();
        qs.push([0.1, 0.25, 0.5, 0.75, 0.9].map((q) => H.quantileSorted(f, q)));
        n += C.edN[e];
      }
      if (qs.length < 3) continue;
      const q = [0, 1, 2, 3, 4].map((j) => H.median(qs.map((x) => x[j])));
      per.push({ city, n, q, iqr: q[3] - q[1] });
    }
    const byName = (a, b) => (a.city < b.city ? -1 : a.city > b.city ? 1 : 0);
    const chosen = per.sort((a, b) => b.n - a.n || byName(a, b)).slice(0, 7).sort((a, b) => b.iqr - a.iqr || byName(a, b));
    const top = chosen[0], low = chosen[chosen.length - 1];
    return {
      values: { top: top.city, low: low.city, top_iqr: top.iqr, low_iqr: low.iqr },
      plot: { rows: chosen.map((r) => ({ label: r.city, lo: r.q[0], q1: r.q[1], mid: r.q[2], q3: r.q[3], hi: r.q[4], tone: r === top ? 'signal' : r === low ? 'ink' : 'quiet' })) },
      cohort_n: sum(chosen.map((r) => r.n)),
    };
  },

  'races-that-warmed-up': (C) => {
    const { share, den } = screenedShares(C);
    const ok = (e) => Number.isFinite(share[e]) && Number.isFinite(C.ed.temp[e]) && Number.isFinite(C.ed.warming[e]);
    const byCity = new Map();
    C.editions.forEach((ed, e) => { if (ok(e)) byCity.set(ed.city, [...(byCity.get(ed.city) || []), e]); });
    const rows = [];
    for (const es of byCity.values()) {
      if (es.length < 3) continue;
      const ms = mean(es.map((e) => share[e])), mt = mean(es.map((e) => C.ed.temp[e])), mw = mean(es.map((e) => C.ed.warming[e]));
      for (const e of es) rows.push({ e, s: share[e] - ms, t: C.ed.temp[e] - mt, w: C.ed.warming[e] - mw });
    }
    const a11 = sum(rows.map((r) => r.t * r.t)), a12 = sum(rows.map((r) => r.t * r.w)), a22 = sum(rows.map((r) => r.w * r.w));
    const b1 = sum(rows.map((r) => r.t * r.s)), b2 = sum(rows.map((r) => r.w * r.s)), det = a11 * a22 - a12 * a12;
    const bt = (a22 * b1 - a12 * b2) / det, bw = (a11 * b2 - a12 * b1) / det;
    const edges = [[-Infinity, -2], [-2, -0.5], [-0.5, 0.5], [0.5, 2], [2, Infinity]];
    const labels = ['Least', 'Less', 'Usual', 'More', 'Most'];
    const groups = edges.map(([lo, hi]) => rows.filter((r) => r.w >= lo && r.w < hi));
    const means = groups.map((g) => mean(g.map((r) => r.s - bt * r.t)));
    return {
      values: {
        gap: means[4] - means[0], most: means[4], least: means[0], low: Math.min(...means), high: Math.max(...means), per_c: bw, editions: rows.length,
        cities: new Set(rows.map((r) => C.ed.city[r.e])).size, eds_low: groups[0].length, eds_high: groups[4].length,
      },
      plot: { cols: labels.map((label, j) => ({ label, value: means[j], tone: j === 4 ? 'signal' : j === 0 ? 'ink' : 'quiet' })) },
      cohort_n: sum(rows.map((r) => den[r.e])),
    };
  },

  'climb-a-loose-guide': (C) => {
    const gains = new Map((C.geometry.courses || []).map((g) => [g.city, g.gain_m]));
    const band = new Map();
    for (let i = 0; i < C.n; i++) {
      if (!inBand(C, i)) continue;
      const e = C.edition[i], b = band.get(e) || { n: 0, hit: 0 };
      b.n++; b.hit += C.slow[i]; band.set(e, b);
    }
    const pts = [];
    let total = 0;
    for (const city of C.cities) {
      const gain = gains.get(city);
      if (gain === undefined || gain === null) continue;
      const shares = [];
      let n = 0;
      for (const e of editionsOf(C, city)) {
        const b = band.get(e);
        if (b && b.n >= 100) { shares.push(b.hit / b.n); n += b.n; }
      }
      if (n < 1000) continue;
      total += n;
      pts.push({ city, x: gain, y: mean(shares) });
    }
    const mx = mean(pts.map((p) => p.x)), my = mean(pts.map((p) => p.y));
    const sxy = sum(pts.map((p) => (p.x - mx) * (p.y - my))), sxx = sum(pts.map((p) => (p.x - mx) ** 2)), syy = sum(pts.map((p) => (p.y - my) ** 2));
    const r = sxy / Math.sqrt(sxx * syy), z = Math.atanh(r), se = 1 / Math.sqrt(pts.length - 3);
    const slope = sxy / sxx, icpt = my - slope * mx;
    const get = (city) => pts.find((p) => p.city === city).y;
    const tone = (city) => (city === 'Boston' ? 'signal' : city === 'Gold Coast' ? 'ink' : 'quiet');
    return {
      values: {
        boston: get('Boston'), gold: get('Gold Coast'), r, r_lo: Math.tanh(z - 1.96 * se), r_hi: Math.tanh(z + 1.96 * se),
        n_cities: pts.length, gap: get('Gold Coast') - get('Boston'),
      },
      plot: { points: pts.map((p) => ({ x: p.x, y: p.y, tone: tone(p.city) })), fit: { x0: 0, y0: icpt, x1: 300, y1: icpt + slope * 300 } },
      cohort_n: total,
    };
  },
};
