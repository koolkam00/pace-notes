// Recounts of the Top 100 charts module charts_courses_2 (scripts/verify-charts.cjs): course and weather readings from the
// editions that pass the start-offset screen, rebuilt from the streamed cohort without the Python builders.
const E_ = (C) => C.editions.length;

/** Screened finishes per edition and, for a predicate, the hits per edition. */
function perEdition(C, pred) {
  const E = E_(C), d = new Float64Array(E), hits = new Float64Array(E);
  for (let i = 0; i < C.n; i++) {
    if (!C.shapeKeep[i]) continue;
    const e = C.edition[i];
    d[e]++;
    if (pred(i)) hits[e]++;
  }
  return { d, share: Array.from(d, (x, e) => (x >= 100 ? hits[e] / x : NaN)) };
}

/** Cities (sorted) with 3+ screened editions of 100+ finishes. */
function cityEditions(C, d, min = 3) {
  const out = [];
  for (const city of C.cities) {
    const eds = [];
    for (let e = 0; e < E_(C); e++) if (C.ed.city[e] === city && d[e] >= 100) eds.push(e);
    if (eds.length >= min) out.push([city, eds]);
  }
  return out;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sec = (C, i, k) => C.times[i * 9 + k] - (k ? C.times[i * 9 + k - 1] : 0);

/** Weather editions: 500+ screened finishes, a start temperature (and wind), races with 3+; values centred per race. */
function centred(C, value, needWind) {
  const E = E_(C), d = new Float64Array(E);
  for (let i = 0; i < C.n; i++) if (C.shapeKeep[i]) d[C.edition[i]]++;
  const groups = new Map();
  for (let e = 0; e < E; e++) {
    if (d[e] < 500 || !Number.isFinite(C.ed.temp[e]) || (needWind && !Number.isFinite(C.ed.wind[e]))) continue;
    if (!groups.has(C.ed.city[e])) groups.set(C.ed.city[e], []);
    groups.get(C.ed.city[e]).push(e);
  }
  const ct = {}, cw = {}, cv = {}, keep = [];
  for (const [, eds] of groups) {
    if (eds.length < 3) continue;
    const mt = mean(eds.map((e) => C.ed.temp[e])), mw = needWind ? mean(eds.map((e) => C.ed.wind[e])) : 0, mv = mean(eds.map((e) => value[e]));
    for (const e of eds) { ct[e] = C.ed.temp[e] - mt; cw[e] = needWind ? C.ed.wind[e] - mw : 0; cv[e] = value[e] - mv; keep.push(e); }
  }
  keep.sort((a, b) => a - b);
  return { keep, ct, cw, cv, d };
}
function thirds(H, keep, x) {
  const v = keep.map((e) => x[e]);
  const q1 = H.quantile(v, 1 / 3), q2 = H.quantile(v, 2 / 3);
  const g = {};
  for (const e of keep) g[e] = (x[e] >= q1 ? 1 : 0) + (x[e] >= q2 ? 1 : 0);
  return g;
}

module.exports = {
  'finishing-kick-by-city': (C, file, H) => {
    const { d, share } = perEdition(C, (i) => C.pace(i, 8) < C.pace(i, 7));
    const rows = [];
    let n = 0;
    const all = cityEditions(C, d).map(([city, eds]) => [city, eds, eds.reduce((s, e) => s + d[e], 0)]);
    const largest = new Set(all.slice().sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1)).slice(0, 8).map((x) => x[0]));
    for (const [city, eds, total] of all) {
      if (!largest.has(city)) continue;
      const v = eds.map((e) => share[e]);
      rows.push({ label: city, lo: Math.min(...v), mid: H.median(v), hi: Math.max(...v), total });
      n += total;
    }
    rows.sort((a, b) => b.mid - a.mid || (a.label < b.label ? -1 : 1));
    const top = rows[0], bot = rows[rows.length - 1];
    rows.forEach((r) => { r.tone = r === bot ? 'signal' : r === top ? 'ink' : 'quiet'; });
    return {
      values: {
        top_city: top.label, bottom_city: bot.label, chi: top.mid, bos: bot.mid, chi_low: top.lo, bos_high: bot.hi, second_low: rows[rows.length - 2].mid,
        others_low: Math.min(...rows.filter((r) => r !== bot).map((r) => r.lo)), n_min: Math.min(...rows.map((r) => r.total)),
      },
      plot: { rows: rows.map(({ label, tone, lo, mid, hi }) => ({ label, tone, lo, mid, hi })) },
      cohort_n: n,
    };
  },

  'downhill-start-quick-first-5k': (C, file, H) => {
    const geo = new Map(C.geometry.courses.map((g) => [g.city, g]));
    const hit = new Float64Array(C.cities.length), tot = new Float64Array(C.cities.length);
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      let best = 0;
      for (let k = 1; k < 8; k++) if (sec(C, i, k) < sec(C, i, best)) best = k;
      tot[C.city[i]]++;
      if (best === 0) hit[C.city[i]]++;
    }
    const pts = [];
    C.cities.forEach((city, ci) => {
      const g = geo.get(city);
      if (!g || city === 'New York' || city === 'Dubai' || tot[ci] < 1000) return;
      pts.push({ city, x: (g.elevation_m[10] - g.elevation_m[0]) / 5000, y: hit[ci] / tot[ci], total: tot[ci] });
    });
    const mx = mean(pts.map((p) => p.x)), my = mean(pts.map((p) => p.y));
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
    const b = sxy / sxx, a = my - b * mx;
    // Climbing starts: more than 0.3% net over the first 5K; falling starts: a loss of more than 0.3%.
    const up = pts.filter((p) => p.x > 0.003), down = pts.filter((p) => p.x < -0.003);
    const top = up.reduce((m, p) => (p.y > m.y || (p.y === m.y && p.city > m.city) ? p : m));
    const below = pts.filter((p) => p.x > 0 && p.x <= 0.003).map((p) => p.x);
    const above = pts.filter((p) => p.x < 0 && p.x >= -0.003).map((p) => p.x);
    const xs = pts.map((p) => p.x);
    const dot = (p) => (p.x > 0.003 ? { x: p.x, y: p.y, tone: 'signal', r: 5 } : p.x < -0.003 ? { x: p.x, y: p.y, tone: 'ink', r: 4.5 } : { x: p.x, y: p.y, tone: 'quiet' });
    return {
      values: {
        uphill_max: top.y, uphill_max_grade: top.x, uphill_races: up.length, climb_lo: Math.min(...up.map((p) => p.x)),
        next_climb: below.length ? Math.max(...below) : 0, falling_median: H.median(down.map((p) => p.y)), falling_races: down.length,
        fall_hi: Math.max(...down.map((p) => p.x)), next_fall: above.length ? Math.min(...above) : 0,
        r: sxy / Math.sqrt(sxx * syy), cities: pts.length, n_min: Math.min(...pts.map((p) => p.total)),
      },
      plot: {
        points: pts.map(dot),
        fit: { x0: Math.min(...xs), y0: a + b * Math.min(...xs), x1: Math.max(...xs), y1: a + b * Math.max(...xs) },
      },
      cohort_n: pts.reduce((s, p) => s + p.total, 0),
    };
  },

  'boston-slowest-before-35k': (C) => {
    const names = ['Boston', 'London', 'Berlin'];
    const idx = new Map(names.map((c, j) => [C.cities.indexOf(c), j]));
    const cnt = Array.from({ length: names.length + 1 }, () => [0, 0, 0, 0]);
    const E = E_(C), a = new Float64Array(E), bb = new Float64Array(E), d = new Float64Array(E);
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      let worst = 0;
      for (let k = 1; k < 8; k++) if (sec(C, i, k) > sec(C, i, worst)) worst = k;
      const part = worst <= 5 ? 0 : worst === 6 ? 1 : 2;
      const e = C.edition[i];
      d[e]++;
      if (worst === 6) a[e]++;
      if (worst === 7) bb[e]++;
      for (const j of [idx.get(C.city[i]), names.length]) if (j !== undefined) { cnt[j][part]++; cnt[j][3]++; }
    }
    const share = (c) => [c[1] / c[3], c[2] / c[3], c[0] / c[3]];
    const g = [...names.map((label, j) => [label, share(cnt[j])]), ['All races', share(cnt[names.length])]];
    const tone = { Boston: 'signal', 'All races': 'ink' };
    let lead = 0, eds = 0;
    for (let e = 0; e < E; e++) if (C.ed.city[e] === 'Boston' && d[e] >= 100) { eds++; if (a[e] > bb[e]) lead++; }
    const bos = g[0][1];
    return {
      values: {
        b: bos[0], b_late: bos[1], b_early: bos[2], typ: g[names.length][1][0], london: g[1][1][0], berlin: g[2][1][0],
        eds: lead, boston_editions: eds, boston_n: cnt[0][3],
      },
      plot: { rows: g.map(([label, p]) => ({ label, tone: tone[label] ?? 'quiet', value: p[0] })) },
      cohort_n: cnt[names.length][3],
    };
  },

  'wind-about-the-same': (C, file, H) => {
    const { share } = perEdition(C, (i) => C.slow[i] === 1);
    const { keep, ct, cw, cv, d } = centred(C, share, true);
    const gw = thirds(H, keep, cw), gt = thirds(H, keep, ct);
    const third = (g, j) => mean(keep.filter((e) => g[e] === j).map((e) => cv[e]));
    const wind = [0, 1, 2].map((j) => third(gw, j)), temp = [0, 1, 2].map((j) => third(gt, j));
    // Park–Miller stream over the races (sorted by name), the same stream the builder draws.
    const cities = [...new Set(keep.map((e) => C.cities.indexOf(C.ed.city[e])))].sort((x, y) => x - y);
    const num = new Map(cities.map((c) => [c, 0])), den = new Map(cities.map((c) => [c, 0]));
    for (const e of keep) if (gw[e] === 2) { const c = C.cities.indexOf(C.ed.city[e]); num.set(c, num.get(c) + cv[e]); den.set(c, den.get(c) + 1); }
    let state = 20261023;
    const boots = [];
    for (let b = 0; b < 2000; b++) {
      let sn = 0, sd = 0;
      for (let j = 0; j < cities.length; j++) {
        state = (state * 48271) % 2147483647;
        const c = cities[state % cities.length];
        sn += num.get(c); sd += den.get(c);
      }
      if (sd) boots.push(sn / sd);
    }
    const labels = [['Warmer than usual', temp[2], 'signal'], ['Cooler than usual', temp[0], 'quiet'], ['Windier than usual', wind[2], 'ink'], ['Calmer than usual', wind[0], 'quiet']];
    return {
      values: {
        windy: wind[2], windy_lo: H.quantile(boots, 0.025), windy_hi: H.quantile(boots, 0.975), calm: wind[0], wind_usual: wind[1],
        warm: temp[2], cool: temp[0], temp_usual: temp[1], editions: keep.length, races: cities.length,
      },
      plot: { rows: labels.map(([label, value, tone]) => ({ label, value, tone })) },
      cohort_n: keep.reduce((s, e) => s + d[e], 0),
    };
  },

  'cooler-mornings-more-even-pacing': (C, file, H) => {
    const even = (i) => {
      const m = C.times[i * 9 + 7] / 8;
      for (let k = 0; k < 8; k++) if (Math.abs(sec(C, i, k) / m - 1) > 0.03) return false;
      return true;
    };
    const { share } = perEdition(C, even);
    const { keep, ct, cv, d } = centred(C, share, false);
    const g = thirds(H, keep, ct);
    const byCity = new Map();
    for (const e of keep) { if (!byCity.has(C.ed.city[e])) byCity.set(C.ed.city[e], []); byCity.get(C.ed.city[e]).push(e); }
    const dots = [];
    for (const [city, eds] of byCity) {
      const warm = eds.filter((e) => g[e] === 2), cool = eds.filter((e) => g[e] === 0);
      if (eds.length < 5 || !warm.length || !cool.length) continue;
      dots.push({ city, v: mean(warm.map((e) => cv[e])) - mean(cool.map((e) => cv[e])) });
    }
    dots.sort((a, b) => a.v - b.v || (a.city < b.city ? -1 : 1));
    const xs = keep.map((e) => ct[e]), ys = keep.map((e) => cv[e]), mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, j) => { sxy += (x - mx) * (ys[j] - my); sxx += (x - mx) ** 2; syy += (ys[j] - my) ** 2; });
    const terc = [0, 1, 2].map((j) => mean(keep.filter((e) => g[e] === j).map((e) => cv[e])));
    // Under half a point apart reads "about the same" (ink); half a point or more lower on warmer mornings is the signal.
    const toneOf = (v) => (v <= -0.005 ? 'signal' : Math.abs(v) < 0.005 ? 'ink' : 'quiet');
    return {
      values: {
        races: dots.length, lower: dots.filter((x) => x.v < 0).length, lower_clear: dots.filter((x) => x.v <= -0.005).length,
        same: dots.filter((x) => Math.abs(x.v) < 0.005).length, warm: terc[2], cool: terc[0], r: sxy / Math.sqrt(sxx * syy),
        widest: dots[0].city, widest_gap: dots[0].v, narrowest: dots[dots.length - 1].city, narrowest_gap: dots[dots.length - 1].v, editions: keep.length,
      },
      plot: { groups: [{ label: 'Races', dots: dots.map((x) => ({ v: x.v, tone: toneOf(x.v) })) }], refs: [{ axis: 'x', value: 0, tone: 'ink' }] },
      cohort_n: keep.reduce((s, e) => s + d[e], 0),
    };
  },

  'second-20k-quicker-by-city': (C) => {
    const { d, share } = perEdition(C, (i) => C.times[i * 9 + 7] - C.times[i * 9 + 3] < C.times[i * 9 + 3]);
    const pts = cityEditions(C, d).map(([city, eds]) => ({ city, v: mean(eds.map((e) => share[e])), total: eds.reduce((s, e) => s + d[e], 0) }));
    pts.sort((a, b) => b.v - a.v || (a.city < b.city ? -1 : 1));
    const top = pts[0], ny = pts.find((p) => p.city === 'New York');
    const labels = new Set(['New York', top.city]);
    return {
      values: { top_city: top.city, top: top.v, second: pts[1].v, ny: ny.v, ratio: top.v / ny.v, lowest_city: pts[pts.length - 1].city, cities: pts.length, n_min: Math.min(...pts.map((p) => p.total)) },
      plot: { groups: [{ label: 'Races', dots: pts.map((p) => ({ v: p.v, tone: p === top ? 'signal' : p === ny ? 'ink' : 'quiet', ...(labels.has(p.city) ? { label: p.city } : {}) })) }] },
      cohort_n: pts.reduce((s, p) => s + p.total, 0),
    };
  },

  'new-york-sped-up-at-25k': (C, file, H) => {
    // A finish sped up over 25–30K when that 5K took no more than 98% of its 20–25K time.
    const MARGIN = 0.02;
    const sped = (i) => sec(C, i, 5) <= (1 - MARGIN) * sec(C, i, 4);
    const anyQuicker = (i) => sec(C, i, 5) < sec(C, i, 4);
    const E = E_(C), d = new Float64Array(E), h = new Float64Array(E), hAny = new Float64Array(E);
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      const e = C.edition[i];
      d[e]++;
      if (sped(i)) h[e]++;
      if (anyQuicker(i)) hAny[e]++;
    }
    // Races with three or more screened editions of 300+ finishes; each race's typical edition is its median edition.
    const races = new Map();
    for (const city of C.cities) {
      const eds = [];
      for (let e = 0; e < E; e++) if (C.ed.city[e] === city && d[e] >= 300) eds.push(e);
      if (eds.length >= 3) races.set(city, eds);
    }
    const inSet = new Uint8Array(E);
    for (const eds of races.values()) for (const e of eds) inSet[e] = 1;
    const typEd = new Map([...races].map(([city, eds]) => [city, H.median(eds.map((e) => h[e] / d[e]))]));
    const typAny = new Map([...races].map(([city, eds]) => [city, H.median(eds.map((e) => hAny[e] / d[e]))]));
    const raceN = [...races.values()].map((eds) => eds.reduce((s, e) => s + d[e], 0));
    const nyEd = races.get('New York').map((e) => h[e] / d[e]);
    // Half-hour finish bands: under 3:00, 3:00–3:30, …, 5:30–6:00, 6:00+.
    const B = 8, band = (t) => Math.min(B - 1, Math.max(0, Math.floor((t - 3 * 3600) / 1800) + 1));
    const nyT = new Float64Array(B), nyQ = new Float64Array(B), otT = new Float64Array(B), otQ = new Float64Array(B);
    const nyIdx = C.cities.indexOf('New York');
    let n = 0;
    const nyProf = new Set(), otProf = new Set();
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i]) continue;
      if (C.city[i] === nyIdx) nyProf.add(C.profile[i]); else otProf.add(C.profile[i]);
      if (!inSet[C.edition[i]]) continue;
      n++;
      const b = band(C.finish[i]), q = sped(i) ? 1 : 0;
      if (C.city[i] === nyIdx) { nyT[b]++; nyQ[b] += q; } else { otT[b]++; otQ[b] += q; }
    }
    let lN = 0, lNq = 0, lO = 0, lOq = 0, linked = 0;
    for (const p of nyProf) if (otProf.has(p)) linked++;
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i] || !nyProf.has(C.profile[i]) || !otProf.has(C.profile[i])) continue;
      if (C.city[i] === nyIdx) { lN++; if (sped(i)) lNq++; } else { lO++; if (sped(i)) lOq++; }
    }
    const nyBand = Array.from(nyQ, (q, b) => q / nyT[b]), otBand = Array.from(otQ, (q, b) => q / otT[b]);
    const raceDots = [...typEd].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([city, v]) => ({ v, tone: city === 'New York' ? 'signal' : 'quiet' }));
    const others = [...typEd.keys()].filter((c) => c !== 'New York').sort((a, b) => typEd.get(b) - typEd.get(a));
    const typ = H.median([...typEd.values()]);
    return {
      values: {
        margin: MARGIN, ny: typEd.get('New York'), typ, next_city: others[0], next: typEd.get(others[0]),
        ny_lo: Math.min(...nyEd), ny_hi: Math.max(...nyEd), ny_editions: nyEd.length, ny_n: nyT.reduce((s, x) => s + x, 0), races: races.size,
        race_n_min: Math.min(...raceN),
        ny_any: typAny.get('New York'), typ_any: H.median([...typAny.values()]),
        band_min: Math.min(...nyBand), band_max: Math.max(...nyBand), other_band_max: Math.max(...otBand), band_n_min: Math.min(...nyT),
        linked, linked_ny: lNq / lN, linked_other: lOq / lO, linked_ny_n: lN, linked_other_n: lO,
      },
      plot: {
        groups: [{ label: `${races.size} races`, dots: raceDots }],
        refs: [{ axis: 'x', value: typ, label: 'typical race', tone: 'ink' }],
      },
      cohort_n: n,
    };
  },
};
