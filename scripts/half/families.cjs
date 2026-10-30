'use strict';
// The published half families rebuilt from the private sources for the source recount (scripts/verify-half-source.cjs),
// independently of the Python builders (analysis/half_field.py, half_women.py, half_linked.py, half_cards.py): each
// function takes the recount's own arrays and returns the file in its published shape, so the recount compares them
// value for value. The whole-edition bootstrap of the round-mark intervals is Python-only (numpy's generator); the
// recount checks the published ratio lies inside it.
const D = require('./derive.cjs');

const MIN_CELL = 100, MIN_EDITIONS = 3, MIN_EDGE = 10;
const need = (cond, message) => { if (!cond) throw new Error(`half families: ${message}`); };
const label = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** Counts in [lo, hi) bins of `step` with the tails apart. */
function tailed(values, lo, hi, step) {
  const counts = new Array(Math.round((hi - lo) / step)).fill(0);
  let under = 0, over = 0;
  for (const v of values) {
    if (v < lo) under++;
    else if (v >= hi) over++;
    else counts[Math.floor((v - lo) / step)]++;
  }
  return { under_lo: under, at_or_over_hi: over, counts };
}
const shareUnder = (sorted, s) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < s) lo = m + 1; else hi = m; } return lo / sorted.length; };

// ---------- field.json ----------

/** Per city label with both verified and unverified editions: verified minus unverified median of edition medians. */
function sameRace(fin, editions) {
  const byEd = new Map();
  for (let k = 0; k < fin.n; k++) {
    if (fin.r7[k]) continue;
    if (!byEd.has(fin.ed[k])) byEd.set(fin.ed[k], []);
    byEd.get(fin.ed[k]).push(fin.finish[k]);
  }
  const byLabel = new Map();
  for (const [e, values] of byEd) {
    const ed = editions[e];
    const key = ed.city;
    if (!byLabel.has(key)) byLabel.set(key, { true: [], false: [] });
    byLabel.get(key)[ed.group === 'verified'].push(D.quantile(values, 0.5));
  }
  const diffs = [];
  for (const g of byLabel.values()) if (g.true.length && g.false.length) diffs.push(D.npMedian(g.true) - D.npMedian(g.false));
  need(diffs.length >= MIN_EDITIONS, 'too few races with both verified and unverified editions');
  return { races: diffs.length, diff_s: { p25: D.sec(D.quantile(diffs, 0.25)), p50: D.sec(D.quantile(diffs, 0.5)), p75: D.sec(D.quantile(diffs, 0.75)) } };
}

/** Verified finishes by country (the policy's reviewed label map); groups under the floors left out. */
function countries(byEd, editions, labelCountries, n) {
  const groups = new Map();
  for (const [e, values] of byEd) {
    const code = labelCountries[editions[e].city];
    need(code, `a verified label without a reviewed country: ${editions[e].city}`);
    if (!groups.has(code)) groups.set(code, { n: 0, eds: 0, small: 0 });
    const g = groups.get(code);
    g.n += values.length; g.eds++; if (values.length < 1000) g.small++;
  }
  return [...groups].filter(([, g]) => g.n >= MIN_CELL && g.eds >= MIN_EDITIONS)
    .map(([label, g]) => ({ label, editions: g.eds, small_editions: g.small, share: D.sh(g.n / n) }))
    .sort((a, b) => b.share - a.share || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

function field({ fin, editions, policySha, moduleSha, labelCountries }) {
  const verified = [], all = [], byEd = new Map();
  const F = [], M = [];
  const sexEds = new Set(), eds = new Set();
  for (let k = 0; k < fin.n; k++) {
    if (fin.r7[k]) continue;
    const e = editions[fin.ed[k]];
    all.push(fin.finish[k]);
    if (e.group !== 'verified') continue;
    const x = fin.finish[k];
    verified.push(x);
    eds.add(fin.ed[k]);
    if (!byEd.has(fin.ed[k])) byEd.set(fin.ed[k], []);
    byEd.get(fin.ed[k]).push(x);
    if (e.use_sex && fin.sex[k]) { (fin.sex[k] === 2 ? F : M).push(x); sexEds.add(fin.ed[k]); }
  }
  const x = D.ascending(verified), xf = D.ascending(F), xm = D.ascending(M), xa = D.ascending(all);
  const minutes = verified.map((v) => Math.floor(v / 60));
  const hist = tailed(minutes, 65, 210, 1);
  const q = (a, p) => D.sec(D.quantileSorted(a, p));
  const under = [];
  for (let s = 4200; s <= 10800; s += 300) under.push({ s, all: D.sh(shareUnder(x, s)), F: D.sh(shareUnder(xf, s)), M: D.sh(shareUnder(xm, s)) });
  const counts = new Array(330).fill(0);
  for (const m of minutes) if (m < counts.length) counts[m]++;
  let best = 40, bestSum = -1;
  for (let a = 40; a < 300; a++) { let s = 0; for (let m = a; m < a + 30; m++) s += counts[m]; if (s > bestSum) { best = a; bestSum = s; } }
  // The round marks against the smooth curve of the pooled minute counts (40 to 299 minutes).
  const total = (m) => (m >= 40 && m < 300 ? counts[m] : NaN);
  const marks = [90, 105, 120, 135, 150].map((B) => {
    const fit = D.localFit(total, B);
    return { mark: label(B), minutes: B, minute_before: fit.obs_pre1, minute_after: fit.obs_post1, expected_minute_before: D.r(fit.exp_pre1, 1),
      ratio: D.r(fit.ratio_pre1, 4), cliff: D.r(D.cliffIndex(total, B), 4) };
  });
  const eq = [...byEd.values()].filter((v) => v.length >= 1000);
  const shareOf = (v, s) => v.filter((t) => t < s).length / v.length;
  return {
    schema_version: 1, family: 'half-field', scope: 'verified',
    cohort: { finishes: x.length, editions: eds.size, sex_finishes: xf.length + xm.length, sex_editions: sexEds.size },
    minutes: { lo: 65, hi: 210, ...hist },
    sex_bins: { bin_s: 300, lo_s: 3900, hi_s: 12600, F: tailed(F, 3900, 12600, 300), M: tailed(M, 3900, 12600, 300) },
    quantiles: { all: { p10: q(x, 0.1), p25: q(x, 0.25), p50: q(x, 0.5), p75: q(x, 0.75), p90: q(x, 0.9) },
      F: { p25: q(xf, 0.25), p50: q(xf, 0.5), p75: q(xf, 0.75) }, M: { p25: q(xm, 0.25), p50: q(xm, 0.5), p75: q(xm, 0.75) } },
    under,
    window30: { lo_minute: best, share: D.sh(bestSum / x.length) },
    marks,
    checks: {
      all_usable: { finishes: xa.length, editions: new Set(Array.from(fin.ed).filter((_, k) => !fin.r7[k])).size,
        under_7200: D.sh(shareUnder(xa, 7200)), under_6300: D.sh(shareUnder(xa, 6300)), p50: q(xa, 0.5) },
      editions_equal: { min_finishes: 1000, editions: eq.length, under_7200: D.sh(D.npMedian(eq.map((v) => shareOf(v, 7200)))), under_6300: D.sh(D.npMedian(eq.map((v) => shareOf(v, 6300)))) },
      editions_equal_all: { editions: byEd.size, under_7200: D.sh(D.npMedian([...byEd.values()].map((v) => shareOf(v, 7200)))) },
      same_race: sameRace(fin, editions),
      countries: countries(byEd, editions, labelCountries, x.length),
    },
    policy: { sha256: policySha, module_sha256: moduleSha },
  };
}

// ---------- women.json ----------

const BANDS = [[0, 5400, 'Under 1:30'], [5400, 6300, '1:30'], [6300, 7200, '1:45'], [7200, 8100, '2:00'], [8100, 9000, '2:15'], [9000, 9900, '2:30'], [9900, 10800, '2:45'], [10800, null, '3:00+']];
const EDGES = BANDS.slice(1).map((b) => b[0]);
const bandOf = (x) => { let j = 0; while (j < EDGES.length && EDGES[j] <= x) j++; return j; };
const cmpLists = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

function women({ fin, editions, marathons, labels, chart, chartSha }) {
  const byEd = new Map();
  for (let k = 0; k < fin.n; k++) {
    if (fin.r7[k]) continue;
    if (!byEd.has(fin.ed[k])) byEd.set(fin.ed[k], []);
    byEd.get(fin.ed[k]).push(k);
  }
  const rows = [];
  for (const [e, ks] of [...byEd].sort((a, b) => editions[a[0]].edition_id - editions[b[0]].edition_id)) {
    if (editions[e].group !== 'verified' || ks.length < 2000) continue;
    const recorded = ks.filter((k) => fin.sex[k]);
    if (1 - recorded.length / ks.length > 0.02) continue;
    const n = new Array(8).fill(0), f = new Array(8).fill(0);
    for (const k of recorded) { const j = bandOf(fin.finish[k]); n[j]++; if (fin.sex[k] === 2) f[j]++; }
    if (Math.min(...n) < 100) continue;
    rows.push({ n, F: f });
  }
  rows.sort((a, b) => b.n.reduce((s, v) => s + v, 0) - a.n.reduce((s, v) => s + v, 0) || cmpLists(a.n, b.n) || cmpLists(a.F, b.F));
  need(rows.length >= 20, `${rows.length} band editions`);
  const shares = BANDS.map((_, j) => D.npMedian(rows.map((r) => r.F[j] / r.n[j])));
  const bands = BANDS.map(([lo_s, hi_s, l]) => ({ lo_s, hi_s, label: l }));
  // Same city, same year.
  const labelCity = new Map();
  for (const [city, ls] of Object.entries(labels)) for (const l of ls) labelCity.set(l, city);
  const marathonCounts = new Map();
  const gap = new Set(['London\u00002023', 'London\u00002025', 'London\u00002026', 'Berlin\u00002024', 'Berlin\u00002025', 'Chicago\u00002024']);
  {
    const E = marathons.editions.length, n = new Int32Array(E), f = new Int32Array(E), m = new Int32Array(E);
    for (let i = 0; i < marathons.n; i++) { const e = marathons.edition[i]; n[e]++; if (marathons.gender[i] === 2) f[e]++; else if (marathons.gender[i] === 1) m[e]++; }
    for (let e = 0; e < E; e++) {
      if (!n[e]) continue;
      const ed = marathons.editions[e];
      const ok = !gap.has(`${ed.city}\u0000${ed.year}`) && 1 - (f[e] + m[e]) / n[e] <= 0.02 && n[e] >= 0.8 * marathons.rawN[e] && n[e] >= 1000 && f[e] >= 100 && m[e] >= 100;
      marathonCounts.set(`${ed.city}\u0000${ed.year}`, { n: n[e], F: f[e], M: m[e], ok });
    }
  }
  const sameCity = (verifiedOnly) => {
    const half = new Map();
    for (const [e, ks] of byEd) {
      const ed = editions[e];
      if (!ed.use_finish || !ed.use_sex || !labelCity.has(ed.city) || (verifiedOnly && ed.group !== 'verified')) continue;
      const n = ks.length, nf = ks.filter((k) => fin.sex[k] === 2).length, nm = ks.filter((k) => fin.sex[k] === 1).length;
      if (n < 1000 || nf < 100 || nm < 100) continue;
      const key = `${labelCity.get(ed.city)}\u0000${ed.year}`;
      const cur = half.get(key);
      if (!cur || n > cur.n || (n === cur.n && ed.edition_id < cur.edition_id)) half.set(key, { n, F: nf, M: nm, edition_id: ed.edition_id, city: labelCity.get(ed.city), year: ed.year });
    }
    const pairs = [];
    for (const h of [...half.values()].sort((a, b) => (a.city < b.city ? -1 : a.city > b.city ? 1 : a.year - b.year))) {
      const m = marathonCounts.get(`${h.city}\u0000${h.year}`);
      if (!m || !m.ok) continue;
      pairs.push({ city: h.city, year: h.year, half: { n: h.n, F: h.F, M: h.M }, marathon: { n: m.n, F: m.F, M: m.M } });
    }
    return pairs;
  };
  const pairs = sameCity(true), every = sameCity(false);
  const everySummary = D.sameCitySummary(every);
  return {
    schema_version: 1, family: 'half-women', scope: 'verified', bands,
    band_rule: { min_finishes: 2000, max_unrecorded: 0.02, min_recorded_per_band: 100 },
    band_editions: rows,
    median_share: shares.map(D.sh),
    cross_s: D.crossing(shares, bands),
    marathon: { file: 'charts/womens-share-by-finish-time.json', sha256: chartSha, cross_s: Math.trunc(chart.values.cross), sub3: chart.values.sub3 },
    same_city: {
      rule: { half: 'use_sex, >=1,000 finishes, >=100 recorded women and men', marathon: 'not a gender-gap edition, <=2% unrecorded, >=80% of raw records kept, >=1,000 finishes, >=100 of each sex' },
      pairs, cities: D.cityRows(pairs), summary: D.sameCitySummary(pairs),
      all_scope_check: { pairs: everySummary.pairs, cities: everySummary.cities, half_higher: everySummary.half_higher, diff_median_points: everySummary.diff_median_points },
    },
  };
}

// ---------- linked.json and tools/half-to-full.json ----------

const Q = Array.from({ length: 19 }, (_, i) => D.pyRound(0.05 * (i + 1), 2));

/** Set B as columns. `P` holds h, m (seconds), sex ('F'|'M'), ed (marathon edition key), city, sus, verified, nsKeys, inMerge, person, mDay, mId. */
function subset(P, keep) {
  const out = {};
  for (const [k, v] of Object.entries(P)) if (Array.isArray(v)) out[k] = v.filter((_, i) => keep[i]);
  out.n = out.h.length;
  return out;
}
function columns(P) { const n = P.h.length; return { ...P, n, extra: P.h.map((h, i) => P.m[i] - 2 * h) }; }

function windowOf(p, H) {
  const lo = 60 * H - 150, hi = 60 * H + 150;
  const idx = [];
  let lead = 0, trail = 0;
  for (let i = 0; i < p.n; i++) {
    const h = p.h[i];
    if (h >= lo && h < hi) idx.push(i);
    if (h >= lo && h < lo + 60) lead++;
    if (h >= hi - 60 && h < hi) trail++;
  }
  if (!idx.length) return null;
  const m = D.ascending(idx.map((i) => p.m[i]));
  const qs = Q.map((x) => D.quantileSorted(m, x));
  const extra = D.ascending(idx.map((i) => p.extra[i]));
  const n = idx.length;
  const med = qs[9], p05 = qs[0], p95 = qs[18];
  const cands = [];
  for (let t = Math.max(Math.floor(p05 / 900) * 900, 900); t < Math.trunc(p95) + 900; t += 900) if (p05 < t && t <= p95) cands.push(t);
  cands.sort((a, b) => Math.abs(a - med) - Math.abs(b - med) || a - b);
  const marks = cands.slice(0, 3).sort((a, b) => a - b).map((t) => [t, D.sh(shareUnder(m, t))]);
  return {
    h: 60 * H, n, e: new Set(idx.map((i) => p.ed[i])).size, q: qs.map(D.sec), sus: D.sh(idx.filter((i) => p.sus[i]).length / n),
    extra_p50: D.sec(D.quantileSorted(extra, 0.5)), under_double: D.sh(idx.filter((i) => p.extra[i] < 0).length / n),
    edge_min: Math.min(lead, trail), marks, _q: qs,
  };
}

function publishedRange(ws) {
  const ok = [];
  for (let H = 70; H <= 165; H++) { const w = ws.get(H); if (w && w.n >= MIN_CELL && w.e >= MIN_EDITIONS && w.edge_min >= MIN_EDGE) ok.push(H); }
  let best = [], run = [];
  for (const H of ok) { run = run.length && H === run[run.length - 1] + 1 ? [...run, H] : [H]; if (run.length > best.length) best = [...run]; }
  need(best.length, 'no window passes the floors');
  return [best[0], best[best.length - 1]];
}

function goalRow(rows, G, full) {
  let i = -1;
  rows.forEach((w, k) => { if (w._q[9] < G) i = k; });
  if (i < 0 || i === 0 || i === rows.length - 1) return null;
  need(rows[i + 1]._q[9] >= G && rows[i - 1]._q[9] < G, `the crossing of ${G} s is not clean`);
  const w = rows[i];
  return full ? { h: w.h, n: w.n, e: w.e, q50: w.q[9], p10: w.q[1], p90: w.q[17] } : { h: w.h, n: w.n, e: w.e };
}

function sexes(p) {
  const keyOf = (i) => [Math.floor((p.h[i] + 150) / 300), p.city[i]];
  const groups = new Map();
  for (let i = 0; i < p.n; i++) {
    const [b, c] = keyOf(i);
    const k = `${b}\u0000${c}`;
    if (!groups.has(k)) groups.set(k, { b, c, idx: [] });
    groups.get(k).idx.push(i);
  }
  const keys = [...groups.values()].sort((x, y) => x.b - y.b || (x.c < y.c ? -1 : x.c > y.c ? 1 : 0));
  const rows = [];
  for (const g of keys) {
    const f = g.idx.filter((i) => p.sex[i] === 'F'), m = g.idx.filter((i) => p.sex[i] === 'M');
    if (f.length >= 20 && m.length >= 20) rows.push([g.idx.length, f.filter((i) => p.sus[i]).length / f.length, m.filter((i) => p.sus[i]).length / m.length]);
  }
  need(rows.length, 'no sex strata');
  const n = Float64Array.from(rows, (r) => r[0]);
  const wf = rows.map((r) => r[1]), wm = rows.map((r) => r[2]);
  const nn = D.pairwiseSum(n);
  const women = D.pairwiseSum(Float64Array.from(wf, (v, i) => v * n[i])) / nn, men = D.pairwiseSum(Float64Array.from(wm, (v, i) => v * n[i])) / nn;
  return { strata: rows.length, women_lower: wf.filter((v, i) => v < wm[i]).length, women_std: D.sh(women), men_std: D.sh(men), diff_points: D.sh(100 * (men - women)) };
}

function latestPerPerson(p) {
  const best = new Map();
  for (let i = 0; i < p.n; i++) {
    const b = best.get(p.person[i]);
    if (b === undefined || p.mDay[i] > p.mDay[b] || (p.mDay[i] === p.mDay[b] && p.mId[i] > p.mId[b])) best.set(p.person[i], i);
  }
  const keep = new Array(p.n).fill(false);
  for (const i of best.values()) keep[i] = true;
  return columns(subset(p, keep));
}

const inWindow = (p, H) => p.h.map((h) => h >= 60 * H - 150 && h < 60 * H + 150);
function underGoalAt(p, H = 105, G = 14400) {
  const w = p.m.filter((_, i) => p.h[i] >= 60 * H - 150 && p.h[i] < 60 * H + 150);
  need(w.length >= MIN_CELL, `a check window holds ${w.length} pairs`);
  return D.sh(w.filter((v) => v < G).length / w.length);
}
const median50 = (values) => D.quantile(values, 0.5);

function battery(p) {
  const members = [];
  const pairsMember = (id, q) => members.push({ id, n: q.n, multiple_p50: D.r(median50(q.m.map((m, i) => m / q.h[i])), 4), extra_p50_s: D.sec(median50(q.extra)), under_double: D.sh(q.extra.filter((x) => x < 0).length / q.n) });
  pairsMember('pooled', p);
  pairsMember('verified_halves', columns(subset(p, p.verified)));
  pairsMember('other_marathons', columns(subset(p, p.city.map((c) => !['Valencia', 'Warsaw'].includes(c)))));
  pairsMember('ns_keys_1', columns(subset(p, p.nsKeys.map((k) => k === 1))));
  pairsMember('one_per_person', latestPerPerson(p));
  const groupsMember = (id, keys, k, minEditions) => {
    const by = new Map();
    keys.forEach((key, i) => { if (!by.has(key)) by.set(key, []); by.get(key).push(i); });
    const rows = [];
    for (const key of [...by.keys()].sort()) {
      const idx = by.get(key);
      if (idx.length < k || (minEditions && new Set(idx.map((i) => p.ed[i])).size < minEditions)) continue;
      rows.push([median50(idx.map((i) => p.m[i] / p.h[i])), median50(idx.map((i) => p.extra[i])), idx.filter((i) => p.extra[i] < 0).length / idx.length]);
    }
    members.push({ id, n: rows.length, multiple_p50: D.r(D.npMedian(rows.map((r) => r[0])), 4), extra_p50_s: D.sec(D.npMedian(rows.map((r) => r[1]))), under_double: D.sh(D.npMedian(rows.map((r) => r[2]))) });
  };
  groupsMember('editions_equal_20', p.ed, 20);
  groupsMember('editions_equal_100', p.ed, 100);
  groupsMember('city_equal', p.city, 100, 3);
  return { pooled_half_p50_s: D.sec(median50(p.h)), members };
}

function checks(p) {
  const ver = columns(subset(p, p.verified));
  const by = new Map();
  p.ed.forEach((key, i) => { if (!by.has(key)) by.set(key, []); by.get(key).push(i); });
  const eds = [...by.keys()].sort().filter((k) => by.get(k).length >= 20).map((k) => { const idx = by.get(k); return [median50(idx.map((i) => p.extra[i])), idx.filter((i) => p.extra[i] < 0).length / idx.length]; });
  const win = inWindow(p, 105);
  const wBy = new Map();
  p.ed.forEach((key, i) => { if (!win[i]) return; if (!wBy.has(key)) wBy.set(key, []); wBy.get(key).push(i); });
  const wEds = [...wBy.keys()].sort().filter((k) => wBy.get(k).length >= 20).map((k) => { const idx = wBy.get(k); return idx.filter((i) => p.m[i] < 14400).length / idx.length; });
  const other = columns(subset(p, p.city.map((c) => !['Valencia', 'Warsaw'].includes(c))));
  const ns1 = columns(subset(p, p.nsKeys.map((k) => k === 1)));
  const one = latestPerPerson(p);
  const noMerge = columns(subset(p, p.inMerge.map((x) => !x)));
  const vs = sexes(ver);
  return {
    verified: { pairs: ver.n, extra_p50_s: D.sec(median50(ver.extra)), under_double: D.sh(ver.extra.filter((x) => x < 0).length / ver.n), w105_under_14400: underGoalAt(ver), sexes: { strata: vs.strata, women_lower: vs.women_lower, diff_points: vs.diff_points } },
    editions_equal: { min_pairs: 20, editions: eds.length, extra_p50_s: D.sec(D.npMedian(eds.map((v) => v[0]))), under_double: D.sh(D.npMedian(eds.map((v) => v[1]))), w105_under_14400: D.sh(D.npMedian(wEds)) },
    other_marathons: { pairs: other.n, extra_p50_s: D.sec(median50(other.extra)), w105_under_14400: underGoalAt(other) },
    ns_keys_1: { pairs: ns1.n, w105_under_14400: underGoalAt(ns1) },
    one_per_person: { pairs: one.n, w105_under_14400: underGoalAt(one) },
    no_merge_people: { pairs: noMerge.n, extra_p50_s: D.sec(median50(noMerge.extra)) },
    battery: battery(p),
  };
}

/** The median multiple in each 5-minute band of the published all-pairs range. */
function multipleByBand(p, lo, hi) {
  const out = [];
  for (let H = lo; H <= hi; H++) {
    if (H % 5) continue;
    const r = [];
    for (let i = 0; i < p.n; i++) if (p.h[i] >= 60 * H - 150 && p.h[i] < 60 * H + 150) r.push(p.m[i] / p.h[i]);
    out.push({ h: 60 * H, ratio_p50: D.r(median50(r), 4) });
  }
  return out;
}

/** Marathon cities with at least 100 pairs from 3 editions, and their halves of 1:40 to 1:59 where those pass too. */
function byCity(p) {
  const by = new Map();
  p.city.forEach((c, i) => { if (!by.has(c)) by.set(c, []); by.get(c).push(i); });
  const out = [];
  for (const city of [...by.keys()].sort()) {
    const idx = by.get(city);
    const eds = new Set(idx.map((i) => p.ed[i]));
    if (idx.length < 100 || eds.size < 3) continue;
    const mid = idx.filter((i) => p.h[i] >= 6000 && p.h[i] < 7200);
    const midEds = new Set(mid.map((i) => p.ed[i]));
    out.push({ city, pairs: idx.length, e: eds.size, multiple_p50: D.r(median50(idx.map((i) => p.m[i] / p.h[i])), 4),
      extra_p50_s: D.sec(median50(idx.map((i) => p.extra[i]))), under_double: D.sh(idx.filter((i) => p.extra[i] < 0).length / idx.length),
      verified_half_share: D.sh(idx.filter((i) => p.verified[i]).length / idx.length),
      mid: mid.length >= MIN_CELL && midEds.size >= MIN_EDITIONS ? { pairs: mid.length, e: midEds.size, extra_p50_s: D.sec(median50(mid.map((i) => p.extra[i]))) } : null });
  }
  return out;
}

/** Link coverage by marathon city: at least 1,000 eligible finishes and 100 linked ones, by share. */
const coverageRows = (rows) => rows.filter((c) => c.finishes >= 1000 && c.linked >= MIN_CELL)
  .map((c) => ({ city: c.city, finishes: c.finishes, share: D.sh(c.linked / c.finishes) }))
  .sort((a, b) => b.share - a.share || (a.city < b.city ? -1 : a.city > b.city ? 1 : 0));

function linked(P, { people, halfEditions, coverage }) {
  const p = columns(P);
  need(p.n >= MIN_CELL, 'set B is under the floor');
  const windows = {}, ranges = {};
  for (const g of ['all', 'F', 'M']) {
    const q = g === 'all' ? p : columns(subset(p, p.sex.map((s) => s === g)));
    const ws = new Map();
    for (let H = 65; H <= 170; H++) ws.set(H, windowOf(q, H));
    const [lo, hi] = publishedRange(ws);
    ranges[g] = [lo, hi];
    windows[g] = [];
    for (let H = lo; H <= hi; H++) windows[g].push(ws.get(H));
  }
  const goals = [10800, 12600, 14400, 16200, 18000].map((G) => {
    const row = goalRow(windows.all, G, true);
    need(row, `no clean all-pairs window for ${G} s`);
    return { goal_s: G, all: row, F: goalRow(windows.F, G, false), M: goalRow(windows.M, G, false) };
  });
  const clean = (w) => Object.fromEntries(Object.entries(w).filter(([k]) => !k.startsWith('_')));
  const extraSorted = D.ascending(p.extra);
  const out = {
    schema_version: 1, family: 'half-linked', scope: 'linked',
    set: { pairs: p.n, people, marathon_editions: new Set(p.ed).size, marathon_cities: new Set(p.city).size, half_editions: halfEditions,
      women_pairs: p.sex.filter((s) => s === 'F').length, men_pairs: p.sex.filter((s) => s === 'M').length,
      verified_half_share: D.sh(p.verified.filter(Boolean).length / p.n), window_days: [21, 112] },
    overall: {
      extra_s: Object.fromEntries([0.1, 0.25, 0.5, 0.75, 0.9].map((x) => [`p${Math.round(x * 100)}`, D.sec(D.quantileSorted(extraSorted, x))])),
      ratio_p50: D.r(median50(p.m.map((m, i) => m / p.h[i])), 4),
      under_double_plus_min: Object.fromEntries([0, 10, 20, 30, 40].map((k) => [String(k), D.sh(p.extra.filter((x) => x < 60 * k).length / p.n)])),
      sustained: D.sh(p.sus.filter(Boolean).length / p.n),
    },
    Q,
    windows: Object.fromEntries(Object.entries(windows).map(([g, ws]) => [g, ws.map(clean)])),
    sexes: { rule: 'half band x marathon city, >=20 pairs per sex', ...sexes(p) },
    goals,
    checks: { ...checks(p), multiple_by_band: multipleByBand(p, ...ranges.all), by_city: byCity(p), ...(coverage ? { coverage: coverageRows(coverage) } : {}) },
  };
  const tool = {
    schema_version: 1, family: 'half-tool', scope: 'linked', Q, window_s: 300,
    groups: Object.fromEntries(['all', 'F', 'M'].map((g) => [g, { from: 60 * ranges[g][0], to: 60 * ranges[g][1], w: windows[g].map((w) => [w.n, w.e, w.sus, w.q, w.marks]) }])),
  };
  return { linked: out, tool };
}

// ---------- cards.json ----------

function cards(fieldDoc, womenDoc, linkedDoc) {
  const under = fieldDoc.under.find((u) => u.s === 7200);
  const SC = womenDoc.same_city;
  const ud = linkedDoc.overall.under_double_plus_min['0'], u20 = linkedDoc.overall.under_double_plus_min['20'];
  const win = (g, h) => linkedDoc.windows[g].find((w) => w.h === h) || null;
  // The flagship's band: the 5-minute band nearest the pooled median half (lib/nuggets/half.ts flagshipWindow).
  const flagship = Math.round(linkedDoc.checks.battery.pooled_half_p50_s / 300) * 300;
  const rows = [], values = {};
  for (const h of [5400, 6300, 7200, 8100]) {
    const f = win('F', h), m = win('M', h);
    if (!f || !m) continue;
    rows.push({ label: label(h / 60), a: f.sus, b: m.sus, ...(h === flagship ? { tone: 'signal' } : {}) });
    values[`F_${h}`] = f.sus;
    values[`M_${h}`] = m.sus;
  }
  const axis = { min: 0, max: 0.6, ticks: [0, 0.2, 0.4, 0.6], fmt: 'share' };
  return {
    schema_version: 1, family: 'half-cards',
    cards: [
      { slug: 'half-under-2', scope: 'verified', plot: { form: 'waffle', parts: [{ share: under.all, tone: 'signal', label: 'under 2:00' }], rest: '2:00 or slower' },
        values: { under_7200: under.all, women_under_7200: under.F, men_under_7200: under.M, finishes: fieldDoc.cohort.finishes, editions: fieldDoc.cohort.editions },
        source: { file: 'field.json', path: 'under[s=7200].all' } },
      { slug: 'half-more-women', scope: 'verified',
        plot: { form: 'dumbbell', rows: [{ label: 'Typical', a: SC.summary.marathon_median, b: SC.summary.half_median, tone: 'signal' }, ...SC.cities.map((c) => ({ label: c.city, a: c.marathon, b: c.half }))],
          x: axis, fmt: 'share', a: 'Marathon', b: 'Half' },
        values: { half_median: SC.summary.half_median, marathon_median: SC.summary.marathon_median, pairs: SC.summary.pairs, cities: SC.summary.cities, half_higher: SC.summary.half_higher },
        source: { file: 'women.json', path: 'same_city.cities' } },
      { slug: 'half-double', scope: 'linked',
        plot: { form: 'waffle', parts: [{ share: ud, tone: 'signal', label: 'under double' }, { share: D.sh(u20 - ud), tone: 'ink', label: '0–20 min over' }], rest: '20+ min over' },
        values: { under_double: ud, within_20: u20, pairs: linkedDoc.set.pairs, extra_p50_s: linkedDoc.overall.extra_s.p50 }, source: { file: 'linked.json', path: 'overall.under_double_plus_min.0' } },
      { slug: 'half-same-half', scope: 'linked', plot: { form: 'dumbbell', rows, x: axis, fmt: 'share', a: 'Recorded women’s', b: 'Recorded men’s' },
        values, source: { file: 'linked.json', path: 'windows.F[h].sus, windows.M[h].sus' } },
    ],
  };
}

module.exports = { field, women, linked, cards, Q, tailed, windowOf };
