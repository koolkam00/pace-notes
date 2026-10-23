// Recounts of the charts_more Top 100 charts (scripts/verify-charts.cjs): each rebuilds its chart's values
// and plotted numbers from the streamed cohort, written from the chart's definition rather than from the Python builder.
const MEN = 1, WOMEN = 2;

const medianOf = (H, arr) => H.median(arr);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const groupBy = (keys, value) => {
  const m = new Map();
  keys.forEach((k, i) => { if (!m.has(k)) m.set(k, []); m.get(k).push(value(i)); });
  return m;
};

module.exports = {
  'women-median-matches-older-men': (C, file, H) => {
    const base = (i) => !C.genderGapEdition[C.edition[i]] && (C.gender[i] === MEN || C.gender[i] === WOMEN) && C.age[i] >= 1;
    const cells = new Map();
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!base(i)) continue;
      n++;
      const k = `${C.gender[i]}:${C.age[i]}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(C.finish[i]);
    }
    const med = (g, a) => { const v = cells.get(`${g}:${a}`); if (!v || v.length < 100) throw new Error(`cell ${g}:${a} under 100`); return H.median(v); };
    const w30 = med(WOMEN, 3), m50 = med(MEN, 7), m55 = med(MEN, 8), m60 = med(MEN, 9);
    // Edition by edition: minutes the men's 50–54 and 55–59 medians were ahead of the women's 30–34 median.
    const l50 = [], l55 = [];
    const races = new Set();
    for (let e = 0; e < C.editions.length; e++) {
      if (C.genderGapEdition[e]) continue;
      const w = [], x = [], y = [];
      for (const i of C.rowsOf(e)) {
        if (!base(i)) continue;
        if (C.gender[i] === WOMEN && C.age[i] === 3) w.push(C.finish[i]);
        if (C.gender[i] === MEN && C.age[i] === 7) x.push(C.finish[i]);
        if (C.gender[i] === MEN && C.age[i] === 8) y.push(C.finish[i]);
      }
      if (Math.min(w.length, x.length, y.length) < 100) continue;
      races.add(C.ed.race[e]);
      const wm = H.median(w);
      l50.push(wm - H.median(x));
      l55.push(wm - H.median(y));
    }
    const eds = l50.length;
    return {
      values: {
        w30, m50, m55, m60, lead50: w30 - m50, eds, eds_m50_ahead: l50.filter((v) => v > 0).length, eds_m55_ahead: l55.filter((v) => v > 0).length,
        typ_lead50: H.median(l50), typ_lead55: H.median(l55), min_lead50: Math.min(...l50), races: races.size,
      },
      plot: {
        groups: [
          { label: 'Men 50–54', dots: l50.map((v) => ({ v, tone: 'signal' })) },
          { label: 'Men 55–59', dots: l55.map((v) => ({ v, tone: 'ink' })) },
        ],
        refs: [{ value: 0 }],
      },
      cohort_n: n,
    };
  },

  'boston-packed-front-long-back': (C, file, H) => {
    const spread = (f) => {
      const s = Float64Array.from(f).sort();
      const p10 = H.quantileSorted(s, 0.1), p50 = H.quantileSorted(s, 0.5), p90 = H.quantileSorted(s, 0.9);
      return [p50 - p10, p90 - p50];
    };
    const per = new Map();
    for (let e = 0; e < C.editions.length; e++) {
      if (C.edN[e] < 2000) continue;
      const rows = Array.from(C.rowsOf(e));
      const [before, after] = spread(rows.map((i) => C.finish[i]));
      const row = { before, after, ratio: after / before, n: rows.length };
      for (const [g, k] of [[MEN, 'men'], [WOMEN, 'women']]) {
        const f = rows.filter((i) => C.gender[i] === g).map((i) => C.finish[i]);
        if (f.length >= 500) { const [b, a] = spread(f); row[k] = a / b; }
      }
      const city = C.ed.city[e];
      if (!per.has(city)) per.set(city, []);
      per.get(city).push(row);
    }
    const races = new Map([...per].filter(([, v]) => v.length >= 3));
    const rr = new Map([...races].map(([k, v]) => [k, H.median(v.map((r) => r.ratio))]));
    const boston = races.get('Boston'), others = [...races.keys()].filter((k) => k !== 'Boston');
    const values = {
      ratio: rr.get('Boston'), typ: H.median([...rr.values()]), next_max: Math.max(...others.map((k) => rr.get(k))),
      boston_min: Math.min(...boston.map((r) => r.ratio)), other_ed_max: Math.max(...others.flatMap((k) => races.get(k).map((r) => r.ratio))),
      other_ed_max_city: others.flatMap((k) => races.get(k).map((r) => [r.ratio, k])).sort((x, y) => y[0] - x[0])[0][1],
      before: H.median(boston.map((r) => r.before)), after: H.median(boston.map((r) => r.after)),
      men_ratio: H.median(boston.filter((r) => 'men' in r).map((r) => r.men)), women_ratio: H.median(boston.filter((r) => 'women' in r).map((r) => r.women)),
      eds: boston.length, races: races.size,
      // Elsewhere: the median over every edition of the other races.
      typ_ed: H.median(others.flatMap((k) => races.get(k).map((r) => r.ratio))), other_eds: sum(others.map((k) => races.get(k).length)),
    };
    const size = new Map([...races].map(([k, v]) => [k, sum(v.map((r) => r.n))]));
    // Rows: the eight races with the most finishes, ranked by the drawn ratio (median after ÷ median before).
    const mid = (k) => [H.median(races.get(k).map((r) => r.before)), H.median(races.get(k).map((r) => r.after))];
    const drawnRatio = (k) => { const [b, a] = mid(k); return a / b; };
    const shown = [...races.keys()].sort((a, b) => size.get(b) - size.get(a) || (a < b ? -1 : 1)).slice(0, 8).sort((a, b) => drawnRatio(b) - drawnRatio(a) || (a < b ? -1 : 1));
    const rows = shown.map((k) => ({ label: k, a: -mid(k)[0], b: mid(k)[1], tone: k === 'Boston' ? 'signal' : 'quiet' }));
    return { values, plot: { rows, ref: { value: 0 } }, cohort_n: sum([...races.values()].flat().map((r) => r.n)) };
  },

  'mornings-vary-by-year': (C, file, H) => {
    // Grouped by race (a city that changed race is two races), each with every edition's start temperature.
    const temps = new Map(), cityOf = new Map();
    for (let e = 0; e < C.editions.length; e++) {
      const t = C.ed.temp[e];
      if (C.edN[e] < 100 || !Number.isFinite(t)) continue;
      const race = C.ed.race[e];
      if (!temps.has(race)) temps.set(race, []);
      temps.get(race).push(t);
      cityOf.set(race, C.ed.city[e]);
    }
    const summary = (k) => {
      const races = [...temps].filter(([, t]) => t.length >= k);
      const meds = races.map(([, t]) => H.median(t));
      const gap = Math.max(...meds) - Math.min(...meds);
      const spans = new Map(races.map(([c, t]) => [c, Math.max(...t) - Math.min(...t)]));
      return { races, gap, spans, meds: new Map(races.map(([c, t]) => [c, H.median(t)])) };
    };
    const a = summary(11), b = summary(5);
    const all = b.races.flatMap(([, t]) => t);
    const dev = b.races.flatMap(([, t]) => { const m = sum(t) / t.length; return t.map((x) => x - m); });
    const variance = (v) => { const m = sum(v) / v.length; return sum(v.map((x) => (x - m) ** 2)) / v.length; };
    const order = a.races.map(([c]) => c).sort((x, y) => a.spans.get(y) - a.spans.get(x) || (x < y ? -1 : 1));
    let n = 0;
    for (let e = 0; e < C.editions.length; e++) if (C.edN[e] >= 100 && Number.isFinite(C.ed.temp[e]) && a.spans.has(C.ed.race[e])) n += C.edN[e];
    const meds = [...a.meds.values()];
    const rows = order.map((c) => ({ label: cityOf.get(c), value: a.spans.get(c) / a.gap, tone: 'signal' }));
    return {
      values: {
        races: a.races.length, wider: [...a.spans.values()].filter((s) => s > a.gap).length, gap: a.gap,
        widest: a.spans.get(order[0]), narrowest: a.spans.get(order[order.length - 1]), coolest_med: Math.min(...meds), warmest_med: Math.max(...meds),
        races5: b.races.length, wider5: [...b.spans.values()].filter((s) => s > b.gap).length, within: variance(dev) / variance(all),
      },
      plot: { rows, ref: { value: 1 } },
      cohort_n: n,
    };
  },

  'each-race-keeps-its-profile': (C, file, H) => {
    const keep = (i) => C.shapeKeep[i] === 1;
    const profile = (e, pred) => {
      const cols = Array.from({ length: 7 }, () => []);
      for (const i of C.rowsOf(e)) if (pred(i)) for (let k = 1; k <= 7; k++) cols[k - 1].push(C.pace(i, k) / C.baseline[i] - 1);
      return cols.map((v) => H.median(v));
    };
    const count = (e, pred) => { let m = 0; for (const i of C.rowsOf(e)) if (pred(i)) m++; return m; };
    let eds = [];
    for (let e = 0; e < C.editions.length; e++) if (count(e, keep) >= 500) eds.push(e);
    // "The race" is the race name (a city that changed race counts as two).
    const per = groupBy(eds.map((e) => C.ed.race[e]), (i) => eds[i]);
    eds = eds.filter((e) => per.get(C.ed.race[e]).length >= 3);
    const nearestSame = (P, city, year, gap = 0) => P.map((p, i) => {
      let best = Infinity, j = -1;
      P.forEach((q, k) => {
        if (k === i || (gap && city[k] === city[i] && Math.abs(year[k] - year[i]) < gap)) return;
        let d = 0;
        for (let t = 0; t < 7; t++) d += (p[t] - q[t]) ** 2;
        if (d < best) { best = d; j = k; }
      });
      return city[j] === city[i];
    });
    const chance = (city) => sum(city.map((x) => (city.filter((y) => y === x).length - 1) / (city.length - 1))) / city.length;
    const city = eds.map((e) => C.ed.race[e]), year = eds.map((e) => C.ed.year[e]);
    const P = eds.map((e) => profile(e, keep));
    const hit = nearestSame(P, city, year);
    const values = {
      share: hit.filter(Boolean).length / hit.length, chance: chance(city), hits: hit.filter(Boolean).length, eds: eds.length,
      races: new Set(city).size, gap3: nearestSame(P, city, year, 3).filter(Boolean).length / hit.length,
    };
    for (const [g, k] of [[MEN, 'men'], [WOMEN, 'women']]) {
      const pred = (i) => keep(i) && C.gender[i] === g;
      const ge = eds.filter((e) => count(e, pred) >= 500), gc = ge.map((e) => C.ed.race[e]);
      const h = nearestSame(ge.map((e) => profile(e, pred)), gc, ge.map((e) => C.ed.year[e]));
      values[k] = h.filter(Boolean).length / h.length;
      values[`${k}_chance`] = chance(gc);
      values[`${k}_eds`] = ge.length;
    }
    // Races where half or more of the editions are nearest to the same race.
    values.races_half = [...new Set(city)].filter((x) => {
      const own = hit.filter((h, i) => city[i] === x);
      return own.filter(Boolean).length / own.length >= 0.5;
    }).length;
    return {
      values,
      plot: { value: values.share, compare: [{ value: values.share, tone: 'signal' }, { value: values.chance, tone: 'ink' }] },
      cohort_n: sum(eds.map((e) => count(e, keep))),
    };
  },

  'late-climber-came-in-first': (C, file, H) => {
    const eds = shapeEditions(C, 1000);
    const per = eds.map((e) => {
      const rows = sortedRows(C, e, (i) => C.times[i * 9 + 7]);
      const hit = new Float64Array(5), tot = new Float64Array(5);
      eachLevelPair(rows, (i) => C.times[i * 9 + 7], 2, (i, j) => {
        const g = C.times[j * 9 + 5] - C.times[i * 9 + 5], d = C.finish[j] - C.finish[i];
        if (Math.abs(g) < 30 || d === 0) return;
        const a = Math.abs(g), k = a < 60 ? 0 : a < 120 ? 1 : a < 240 ? 2 : a < 600 ? 3 : 4;
        tot[k]++;
        if (g > 0 ? d < 0 : d > 0) hit[k]++;
      });
      return [hit, tot];
    });
    const big = per.filter(([, t]) => sum([...t]) >= 1000).map(([h, t]) => sum([...h]) / sum([...t]));
    const pairs = sum(per.map(([, t]) => sum([...t])));
    const values = {
      share: H.median(big), pooled: sum(per.map(([h]) => sum([...h]))) / pairs, pairs, eds: big.length,
      eds_above_half: big.filter((x) => x > 0.5).length, min_ed: Math.min(...big),
    };
    ['g30_60', 'g1_2', 'g2_4', 'g4_10', 'g10'].forEach((key, k) => {
      const v = per.filter(([, t]) => t[k] >= 100).map(([h, t]) => h[k] / t[k]);
      values[key] = H.median(v);
      values[`${key}_eds`] = v.length;
    });
    const cols = [{ label: 'All', value: values.share, tone: 'signal' }, ...['g30_60', 'g1_2', 'g2_4', 'g4_10', 'g10'].map((k) => ({ value: values[k], tone: 'quiet' }))];
    return { values, plot: { cols, ref: { value: 0.5 } }, cohort_n: sum(eds.map((e) => C.rowsOf(e).length)) };
  },

  'steady-climbers-twice-fallers': (C, file, H) => {
    const eds = shapeEditions(C, 1000);
    const up = [], down = [], ratios = [], by = { 1: [], 2: [] }, gain = [];
    let pu = 0, pd = 0, pn = 0;
    for (const e of eds) {
      const rows = Array.from(C.rowsOf(e));
      const ranks = [3, 4, 5, 6, 7, 8].map((k) => averageRanks(rows.map((i) => C.times[i * 9 + k])));
      let u = 0, w = 0;
      const gu = { 1: [0, 0, 0], 2: [0, 0, 0] }, g5 = [0, 0, 0, 0, 0];
      rows.forEach((i, r) => {
        let allUp = true, allDown = true;
        for (let s = 0; s < 5; s++) {
          const d = ranks[s + 1][r] - ranks[s][r];
          if (d < 0) g5[s]++;
          if (!(d < 0)) allUp = false;
          if (!(d > 0)) allDown = false;
        }
        if (allUp) u++;
        if (allDown) w++;
        const g = gu[C.gender[i]];
        if (g) { g[0]++; if (allUp) g[1]++; if (allDown) g[2]++; }
      });
      up.push(u / rows.length); down.push(w / rows.length); ratios.push(u / w);
      pu += u; pd += w; pn += rows.length;
      gain.push(g5.map((x) => x / rows.length));
      // Per recorded gender, outside the editions where recorded gender is incomplete.
      if (!C.genderGapEdition[e]) for (const g of [1, 2]) if (gu[g][0] >= 100) by[g].push([gu[g][1] / gu[g][0], gu[g][2] / gu[g][0]]);
    }
    const values = {
      ratio: H.median(ratios), up: H.median(up), down: H.median(down), eds: eds.length,
      eds_up_gt_down: up.filter((x, k) => x > down[k]).length, min_ratio: Math.min(...ratios), pooled_up: pu / pn, pooled_down: pd / pn,
    };
    const secMed = [0, 1, 2, 3, 4].map((s) => H.median(gain.map((x) => x[s])));
    values.gain_med_min = Math.min(...secMed);
    values.gain_med_max = Math.max(...secMed);
    values.gain_ed_min = Math.min(...gain.flat());
    for (const [g, k] of [[1, 'men'], [2, 'women']]) {
      values[`${k}_up`] = H.median(by[g].map((x) => x[0]));
      values[`${k}_down`] = H.median(by[g].map((x) => x[1]));
      values[`${k}_eds`] = by[g].length;
      values[`${k}_eds_up_gt_down`] = by[g].filter(([x, y]) => x > y).length;
    }
    return { values, plot: { parts: [{ share: values.up, tone: 'signal' }, { share: values.down, tone: 'ink2' }] }, cohort_n: pn };
  },

  'in-step-and-close-in-age': (C, file, H) => {
    const G = 90;
    const eds = shapeEditions(C, 1000).filter((e) => C.granular.has(e));
    const obs = new Map(), ctl = new Map();
    let ident = 0;
    for (const e of eds) {
      const rows = sortedRows(C, e, (i) => C.finish[i], (i) => C.exactAgeOk[i] === 1);
      eachLevelPair(rows, (i) => C.finish[i], 5, (i, j) => {
        let mx = 0, mx8 = 0;
        for (let k = 0; k < 9; k++) {
          const d = Math.abs(C.times[i * 9 + k] - C.times[j * 9 + k]);
          if (d > mx) mx = d;
          if (k < 8 && d > mx8) mx8 = d;
        }
        if (mx === 0) { ident++; return; }
        const inStep = mx <= 5, control = mx8 >= 30;
        if (!inStep && !control) return;
        const key = `${e}:${Math.floor(Math.min(C.finish[i], C.finish[j]) / 1800)}`;
        for (const m of [obs, ctl]) if (!m.has(key)) m.set(key, new Float64Array(G));
        const gap = Math.abs(C.exactAge[i] - C.exactAge[j]);
        if (inStep) obs.get(key)[gap]++;
        if (control) ctl.get(key)[gap]++;
      });
    }
    const total = (v) => v.reduce((a, b) => a + b, 0);
    const expected = (keys) => {
      const out = new Float64Array(G);
      for (const k of keys) {
        const o = total(obs.get(k)), cv = ctl.get(k), ct = total(cv);
        if (o && ct) for (let g = 0; g < G; g++) out[g] += (o * cv[g]) / ct;
      }
      return out;
    };
    const O = new Float64Array(G);
    for (const v of obs.values()) for (let g = 0; g < G; g++) O[g] += v[g];
    const E = expected([...obs.keys()]);
    const range = (v, a, b) => total(v.slice(a, b));
    const o2 = range(O, 0, 3) / total(O), e2 = range(E, 0, 3) / total(E);
    const scaled = Array.from(E, (x) => (x * total(O)) / total(E));
    let eds100 = 0, gt = 0;
    for (const e of eds) {
      const keys = [...obs.keys()].filter((k) => k.startsWith(`${e}:`));
      const Oe = new Float64Array(G);
      for (const k of keys) obs.get(k).forEach((x, g) => { Oe[g] += x; });
      if (total(Oe) < 100) continue;
      const Ee = expected(keys);
      eds100++;
      if (range(Oe, 0, 3) / total(Oe) > range(Ee, 0, 3) / total(Ee)) gt++;
    }
    let ctrlPairs = 0;
    for (const v of ctl.values()) ctrlPairs += total(v);
    const values = {
      ratio: o2 / e2, obs: o2, exp: e2, n_pairs: total(O), eds_100: eds100, eds_obs_gt_exp: gt, same: O[0] / total(O), same_exp: E[0] / total(E),
      hump: range(O, 29, 35) / total(scaled.slice(29, 35)), trough: range(O, 15, 22) / total(scaled.slice(15, 22)), ctrl_pairs: ctrlPairs, identical: ident,
    };
    // The gaps drawn: from 0 up to the last one before any gap holds fewer than 100 in-step pairs, at most 35 years.
    let top = -1;
    while (top + 1 < G && top + 1 <= 35 && O[top + 1] >= 100) top++;
    values.top_gap = top;
    const points = Array.from({ length: top + 1 }, (_, g) => [g, O[g] / scaled[g]]);
    // The first gap of 25 years or more where in-step pairs are again more common than expected.
    values.back = points.find(([g, r]) => g >= 25 && r > 1)[0];
    let n = 0;
    for (const e of eds) for (const i of C.rowsOf(e)) if (C.exactAgeOk[i]) n++;
    return { values, plot: { series: [{ label: 'In step', points, tone: 'signal' }], refs: [{ value: 1 }] }, cohort_n: n };
  },

  'in-step-once-in-step-again': (C, file, H) => {
    const eds = shapeEditions(C, 1);
    const maxGap = (i, j, k = 9) => {
      let mx = 0;
      for (let t = 0; t < k; t++) mx = Math.max(mx, Math.abs(C.times[i * 9 + t] - C.times[j * 9 + t]));
      return mx;
    };
    const inStep = (i, j) => { const mx = maxGap(i, j); return mx <= 5 && mx > 0; };
    // Linked records with two or more start-screened finishes: only their pairs can meet again in a later edition.
    const seen = new Map();
    for (let i = 0; i < C.n; i++) if (C.shapeKeep[i]) seen.set(C.profile[i], (seen.get(C.profile[i]) || 0) + 1);
    const K = 8388608; // 2^23 > every linked-record id, so p * K + q is an exact integer key
    let ymin = Infinity;
    for (const e of eds) ymin = Math.min(ymin, C.ed.year[e]);
    const first = new Map();
    const ctl = [];
    let pairs = 0;
    for (const e of eds) {
      const rows = sortedRows(C, e, (i) => C.finish[i]);
      const year = C.ed.year[e];
      eachLevelPair(rows, (i) => C.finish[i], 5, (i, j) => {
        const pi = C.profile[i], pj = C.profile[j];
        if (pi === pj) return;
        const p = Math.min(pi, pj), q = Math.max(pi, pj);
        if (inStep(i, j)) {
          pairs++;
          const key = `${p}:${q}`;
          if (!first.has(key) || year < first.get(key)[2]) first.set(key, [p, q, year]);
        } else if (maxGap(i, j, 8) >= 30 && seen.get(pi) >= 2 && seen.get(pj) >= 2) {
          // Level only at the finish: the key and the year packed into one exact number (key < 2^46, year in 6 bits).
          ctl.push((p * K + q) * 64 + (year - ymin));
        }
      });
    }
    const where = new Map();
    for (let i = 0; i < C.n; i++) {
      if (!C.shapeKeep[i] || !(seen.get(C.profile[i]) >= 2)) continue;
      if (!where.has(C.profile[i])) where.set(C.profile[i], new Map());
      where.get(C.profile[i]).set(C.edition[i], i);
    }
    // Every later start-screened edition both records finished, and whether they were in step there.
    const later = (p, q, y0, fn) => {
      const A = where.get(p), B = where.get(q);
      if (!A || !B) return;
      for (const [e, i] of A) {
        if (!B.has(e)) continue;
        const gap = C.ed.year[e] - y0;
        if (gap > 0) fn(gap, inStep(i, B.get(e)) ? 1 : 0);
      }
    };
    const tally = { all: [0, 0], 1: [0, 0], '2-3': [0, 0], '4+': [0, 0] };
    for (const [p, q, y0] of first.values()) {
      later(p, q, y0, (gap, again) => {
        for (const key of ['all', gap === 1 ? '1' : gap <= 3 ? '2-3' : '4+']) { tally[key][0]++; tally[key][1] += again; }
      });
    }
    const packed = Float64Array.from(ctl).sort();
    let ctrlKeys = 0, ctrlLater = 0, ctrlAgain = 0;
    for (let k = 0; k < packed.length; k++) {
      const key = Math.floor(packed[k] / 64);
      if (k && Math.floor(packed[k - 1] / 64) === key) continue;
      ctrlKeys++;
      later(Math.floor(key / K), key % K, (packed[k] % 64) + ymin, (gap, again) => { ctrlLater++; ctrlAgain += again; });
    }
    const r = (k) => tally[k][1] / tally[k][0];
    const values = {
      again: r('all'), n_later: tally.all[0], again_count: tally.all[1], again1: r('1'), again2_3: r('2-3'), again4: r('4+'),
      later1: tally[1][0], later2_3: tally['2-3'][0], later4: tally['4+'][0], keys: first.size, pairs,
      ctrl_pairs: packed.length, ctrl_keys: ctrlKeys, ctrl_later: ctrlLater, ctrl_again_count: ctrlAgain, ctrl_again: ctrlAgain / ctrlLater,
      under: 0.001, // the comparison column's printed bound ("under 0.1%")
    };
    if (!(values.ctrl_again < values.under)) throw new Error(`comparison in step again ${values.ctrl_again}, not under 0.1%`);
    const cols = [{ value: r('all'), tone: 'signal' }, { value: values.ctrl_again, tone: 'quiet' }];
    return { values, plot: { cols }, cohort_n: sum(eds.map((e) => C.rowsOf(e).length)) };
  },
};

// Editions of at least `min` finishes that pass the start-offset screen (an edition-level flag), in edition order.
function shapeEditions(C, min) {
  const out = [];
  for (let e = 0; e < C.editions.length; e++) { const rows = C.rowsOf(e); if (rows.length >= min && C.shapeKeep[rows[0]]) out.push(e); }
  return out;
}
// An edition's rows (optionally filtered), sorted by a key.
function sortedRows(C, e, key, keep = () => true) {
  return Array.from(C.rowsOf(e)).filter(keep).map((i) => [key(i), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}
// Every pair of rows (sorted by key) whose keys differ by at most tol.
function eachLevelPair(rows, key, tol, fn) {
  const k = rows.map(key);
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length && k[b] - k[a] <= tol; b++) fn(rows[a], rows[b]);
}
// Average ranks: ties share the mean of their positions.
function averageRanks(v) {
  const order = v.map((x, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(v.length);
  for (let s = 0; s < order.length;) {
    let t = s;
    while (t + 1 < order.length && v[order[t + 1]] === v[order[s]]) t++;
    for (let u = s; u <= t; u++) r[order[u]] = (s + t) / 2;
    s = t + 1;
  }
  return r;
}
