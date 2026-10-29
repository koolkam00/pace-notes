'use strict';
// The half record and edition rules, reimplemented for the source recount (scripts/verify-half-source.cjs) from the
// policy's published definitions (docs/HALF_MARATHON.md; spec 1.3), independently of analysis/half_quality.py: its own
// time parser, sub-race pattern, name key and duplicate rule. The record rules R1–R7 are applied here; the edition
// screens E3–E8 are recomputed only to compare with the frozen lists, and the editions are then removed exactly as the
// frozen policy JSON lists them (E0, E2–E8) plus the held statuses (E1).
//
// One pass over race_records in id order keeps per-row numbers in typed arrays (no names: a name enters only as a
// 53-bit hash of its duplicate key; the few rows whose keys collide are reread by id to compare the keys themselves).

// The producer's exclusion flags (the half snapshot README); time_hour_reconstructed alone never excludes.
const PRODUCER_EXCLUDE = ['duplicate', 'duplicate_load', 'duplicate_subset_list', 'wrong_year_copy', 'not_running', 'not_half_distance',
  'separate_edition', 'separate_championship_list', 'trail_not_road_half', 'implausible_time', 'slow_outlier', 'disqualified', 'suspect_result_set'];
const WR_FLOOR_S = 3402;     // 56:42
const SLOW_CAP_S = 21600;    // 6:00:00
const SUBRACE_FAST = { share: 0.05, count: 2 };
// Other sports and assisted or combined classifications in a sub-race name, on the lowercased name. RE2 `\s` is
// [\t\n\f\r ] and `\b` an ASCII word boundary (as in a non-unicode JavaScript pattern), so "Tordesillas" does not match.
const NONRUN = /(rullaluistelu|patinaje|patines|\bmtb\b|sillas?[\t\n\f\r ]+de[\t\n\f\r ]+rueda|\bsillas?\b|wheelchair|\bwch\b|veh[ií]culo adaptado|pmrs?-puolimaraton|jo[eë]lette|combinata|half duathlon|discapacitad|discapacidad|capacidades (especiales|diferentes)|categor[ií]as especiales)/;
const NONRUN_POLICY = '(rullaluistelu|patinaje|patines|\\bmtb\\b|sillas?\\s+de\\s+rueda|\\bsillas?\\b|wheelchair|\\bwch\\b|veh[ií]culo adaptado|pmrs?-puolimaraton|jo[eë]lette|combinata|half duathlon|discapacitad|discapacidad|capacidades (especiales|diferentes)|categor[ií]as especiales)';
const ANONYMOUS = /anonim|anonym|unknown|zawodnik/;
const R7 = { city: 'Oslo Half', years: [2016, 2025], bib: [73000, 75999] };
const STATUS = {
  verified: ['stamped'],
  unverified: ['counts_internal_only', 'counts_internal_only_winner_ok', 'counts_reconciled_winner_pending'],
  held: ['held_for_review', 'held_for_andrew_decision', 'duplicate_held_for_review'],
};

const need = (cond, message) => { if (!cond) throw new Error(`half policy: ${message}`); };

/** Seconds of an `H…:MM:SS` finish, or null. */
function parseTime(text) {
  if (typeof text !== 'string') return null;
  const m = /^([0-9]+):([0-9]{2}):([0-9]{2})$/.exec(text);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** DuckDB's try_cast(text AS INTEGER) for the forms a bib takes (digits, a sign, a decimal or exponent); else null. */
function tryInt(text) {
  if (typeof text !== 'string') return Number.isInteger(text) ? text : null;
  const s = text.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) return null;
  const v = Math.round(Number(s));
  return Number.isSafeInteger(v) && Math.abs(v) <= 2147483647 ? v : null;
}

/**
 * The within-edition duplicate key of a name (R6): null without a usable name (null, at most three characters after
 * trimming space separators, or an anonymous placeholder); else the tokens of the name lowercased, accents stripped,
 * every character outside a-z, 0-9 and space made a space, sorted and joined by one space (null when none is left).
 */
function nameKey(runner) {
  if (typeof runner !== 'string') return null;
  const trimmed = runner.replace(/^\p{Zs}+|\p{Zs}+$/gu, '');
  if ([...trimmed].length <= 3) return null;
  if (ANONYMOUS.test(runner.toLowerCase())) return null;
  let s = runner.replaceAll(',', ' ');
  if (/[^\x20-\x7e]/.test(s)) s = s.normalize('NFD').replace(/\p{M}/gu, '');
  s = s.toLowerCase().replace(/[^a-z0-9 ]/gu, ' ');
  const tokens = s.split(' ').filter((t) => t !== '');
  if (!tokens.length) return null;
  tokens.sort();
  return tokens.join(' ');
}

/** A 53-bit string hash (cyrb53). */
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Days since 1970-01-01 of a race date as DuckDB's try_cast(… AS DATE) reads it, or NaN. */
function dateDay(text) {
  if (typeof text !== 'string') return NaN;
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(text);
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t / 86400000 : NaN;
}

/** The linear quantile ((n − 1)q) of an ascending typed array segment. */
function quantileSeg(a, lo, hi, q) {
  const n = hi - lo;
  if (!n) return NaN;
  const pos = (n - 1) * q;
  const f = Math.floor(pos);
  const c = Math.min(f + 1, n - 1);
  return a[lo + f] + (a[lo + c] - a[lo + f]) * (pos - f);
}

/** The policy constants this recount uses must equal the frozen policy's, so a changed policy needs a reviewed recount. */
function checkPolicyText(policy) {
  const R = policy.record_rules;
  need(JSON.stringify(R.order) === JSON.stringify(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']), 'record rule order');
  need(JSON.stringify([...R.R1.flags].sort()) === JSON.stringify([...PRODUCER_EXCLUDE].sort()), 'the R1 flags differ from this recount');
  need(R.R2.column === 'split_21_1km' && R.R2.pattern === '^[0-9]+:[0-9]{2}:[0-9]{2}$', 'the R2 parser');
  need(R.R3.pattern === NONRUN_POLICY, 'the R3 sub-race pattern differs from this recount');
  need(R.R4.floor_s === WR_FLOOR_S && R.R4.min_share === SUBRACE_FAST.share && R.R4.min_count === SUBRACE_FAST.count, 'the R4 screen');
  need(R.R5.min_s === WR_FLOOR_S && R.R5.max_s === SLOW_CAP_S, 'the R5 bounds');
  need(R.R6.anonymous_pattern === ANONYMOUS.source, 'the R6 anonymous pattern');
  need(R.R7.city === R7.city && JSON.stringify(R.R7.years) === JSON.stringify(R7.years) && JSON.stringify(R.R7.bib) === JSON.stringify(R7.bib), 'the R7 block');
  need(['verified', 'unverified', 'held'].every((g) => JSON.stringify(policy.statuses[g]) === JSON.stringify(STATUS[g])) && Object.keys(policy.statuses).length === 3, 'the status groups');
  need(JSON.stringify(policy.edition_rules.order) === JSON.stringify(['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']), 'edition rule order');
}

/**
 * Reads the snapshot and applies R1–R7 and the editions. Returns the counts, the computed lists and the usable finishes
 * (`fin`: typed arrays in record id order) with their editions.
 */
function applyPolicy(db, policy, log = () => {}) {
  checkPolicyText(policy);
  const exclude = new Set(PRODUCER_EXCLUDE);
  const { max: maxId, n: total } = db.prepare('SELECT max(id) AS max, count(*) AS n FROM race_records').get();
  const excluded = new Uint8Array(maxId + 1);
  for (const r of db.prepare('SELECT record_id, flag FROM record_flags').iterate()) if (exclude.has(r.flag) && r.record_id <= maxId) excluded[r.record_id] = 1;

  const id = new Uint32Array(total), ed = new Int32Array(total), sub = new Int32Array(total), finish = new Float64Array(total);
  const sexPub = new Uint8Array(total), flag = new Uint8Array(total), keyHash = new Float64Array(total).fill(NaN);
  const edIndex = new Map(), editions = [];
  const subIndex = new Map(), subs = [];
  const sexCodes = new Map([['\u0000null', 0]]), sexNames = [null];
  const edOf = (city, year) => {
    const k = `${city}\u0000${year}`;
    let e = edIndex.get(k);
    if (e === undefined) { e = editions.length; edIndex.set(k, e); editions.push({ city, year }); }
    return e;
  };
  // Published sex as written; a null and a literal '?' share the duplicate key's code (coalesce(sex, '?')).
  const sexCode = (s) => {
    const k = s === null || s === undefined || s === '?' ? '\u0000null' : s;
    let c = sexCodes.get(k);
    if (c === undefined) { c = sexNames.length; sexCodes.set(k, c); sexNames.push(s); }
    return c;
  };
  let i = 0, lastId = 0;
  for (const r of db.prepare('SELECT id, race, year, city, distance_km, runner, sex, split_21_1km, bib FROM race_records ORDER BY id').iterate()) {
    need(r.id > lastId && Math.abs(r.distance_km - 21.0975) <= 1e-9, `record ${r.id}: order or distance`);
    lastId = r.id;
    id[i] = r.id;
    const e = edOf(r.city, r.year);
    ed[i] = e;
    const sk = `${e}\u0000${r.race}`;
    let s = subIndex.get(sk);
    if (s === undefined) { s = subs.length; subIndex.set(sk, s); subs.push({ e, race: r.race, n: 0, fast: 0 }); }
    sub[i] = s;
    const t = parseTime(r.split_21_1km);
    finish[i] = t === null ? NaN : t;
    sexPub[i] = sexCode(r.sex);
    // bit 1: producer exclusion; bit 2: the R7 bib block; bit 4: published sex 'M'; bit 8: published sex 'F'.
    let f = excluded[r.id] ? 1 : 0;
    const bib = tryInt(r.bib);
    if (r.city === R7.city && r.year >= R7.years[0] && r.year <= R7.years[1] && bib !== null && bib >= R7.bib[0] && bib <= R7.bib[1]) f |= 2;
    if (r.sex === 'M') f |= 4; else if (r.sex === 'F') f |= 8;
    flag[i] = f;
    const key = nameKey(r.runner);
    if (key !== null) keyHash[i] = hash53(key);
    i++;
    if (i % 1000000 === 0) log(`  ${i.toLocaleString('en-US')} records read`);
  }
  need(i === total, 'every record read');

  // Sub-race screens (R3, R4) over the rows that pass R1 and R2.
  for (let k = 0; k < total; k++) {
    if (flag[k] & 1 || !(finish[k] > 0)) continue;
    const s = subs[sub[k]];
    s.n++;
    if (finish[k] < WR_FLOOR_S) s.fast++;
  }
  for (const s of subs) s.rule = s.n === 0 ? null : NONRUN.test(String(s.race).toLowerCase()) ? 'R3' : (s.fast >= SUBRACE_FAST.count && s.fast >= SUBRACE_FAST.share * s.n ? 'R4' : null);
  const lists = { R3: [], R4: [] };
  for (const s of subs) {
    if (s.rule === 'R3') lists.R3.push({ city: editions[s.e].city, year: editions[s.e].year, race: s.race, finishes: s.n });
    if (s.rule === 'R4') lists.R4.push({ city: editions[s.e].city, year: editions[s.e].year, race: s.race, finishes: s.n, under_floor: s.fast });
  }
  // rule codes: 0 usable, 1 R1, 2 R2, 3 R3, 4 R4, 5 R5 fast, 6 R5 slow, 7 R6.
  const rule = new Uint8Array(total);
  for (let k = 0; k < total; k++) {
    if (flag[k] & 1) rule[k] = 1;
    else if (!(finish[k] > 0)) rule[k] = 2;
    else if (subs[sub[k]].rule === 'R3') rule[k] = 3;
    else if (subs[sub[k]].rule === 'R4') rule[k] = 4;
    else if (finish[k] < WR_FLOOR_S) rule[k] = 5;
    else if (finish[k] > SLOW_CAP_S) rule[k] = 6;
  }
  // R6: the same name key, finish and published sex in one edition; keep the copy from the largest sub-race list, then
  // the lowest id. Rows are grouped on the key's hash; a group of two or more is reread to compare the keys themselves.
  const cand = [];
  for (let k = 0; k < total; k++) if (!rule[k] && !Number.isNaN(keyHash[k])) cand.push(k);
  const order = Uint32Array.from(cand);
  order.sort((a, b) => ed[a] - ed[b] || keyHash[a] - keyHash[b] || finish[a] - finish[b] || sexPub[a] - sexPub[b]);
  const runnerOf = db.prepare('SELECT runner FROM race_records WHERE id = ?');
  let groups = 0;
  for (let a = 0; a < order.length;) {
    let b = a + 1;
    const x = order[a];
    while (b < order.length && ed[order[b]] === ed[x] && keyHash[order[b]] === keyHash[x] && finish[order[b]] === finish[x] && sexPub[order[b]] === sexPub[x]) b++;
    if (b - a > 1) {
      const byKey = new Map();
      for (let j = a; j < b; j++) {
        const k = order[j];
        const exact = nameKey(runnerOf.get(id[k]).runner);
        if (!byKey.has(exact)) byKey.set(exact, []);
        byKey.get(exact).push(k);
      }
      for (const rows of byKey.values()) {
        if (rows.length < 2) continue;
        groups++;
        let keep = rows[0];
        for (const k of rows) if (subs[sub[k]].n * 1e10 - id[k] > subs[sub[keep]].n * 1e10 - id[keep]) keep = k;
        for (const k of rows) if (k !== keep) rule[k] = 7;
      }
    }
    a = b;
  }
  const NAMES = ['usable', 'R1', 'R2', 'R3', 'R4', 'R5_fast', 'R5_slow', 'R6'];
  const byRule = Object.fromEntries(NAMES.map((n) => [n, 0]));
  for (let k = 0; k < total; k++) byRule[NAMES[rule[k]]]++;

  // ---------- Editions: the registry joined on city and year, with metrics on the record-usable rows (before R7) ----------
  const meta = new Map();
  for (const m of db.prepare('SELECT id, city, year, race, race_date, official_finishers, official_source_type, completeness_status FROM edition_meta').iterate()) {
    const k = `${m.city}\u0000${m.year}`;
    need(!meta.has(k), `two registry rows for ${m.city} ${m.year}`);
    meta.set(k, m);
    edOf(m.city, m.year);
  }
  const E = editions.length;
  const nDb = new Int32Array(E), nUse = new Int32Array(E), nM = new Int32Array(E), nF = new Int32Array(E), sub65 = new Int32Array(E);
  for (let k = 0; k < total; k++) {
    const e = ed[k];
    nDb[e]++;
    if (rule[k]) continue;
    nUse[e]++;
    if (flag[k] & 4) nM[e]++;
    if (flag[k] & 8) nF[e]++;
    if (finish[k] < 3900) sub65[e]++;
  }
  const start = new Int32Array(E + 1);
  for (let e = 0; e < E; e++) start[e + 1] = start[e] + nUse[e];
  const sorted = new Float64Array(start[E]);
  const cursor = start.slice(0, E);
  for (let k = 0; k < total; k++) if (!rule[k]) sorted[cursor[ed[k]]++] = finish[k];
  for (let e = 0; e < E; e++) sorted.subarray(start[e], start[e + 1]).sort();
  const lowerHas = (text, re) => re.test(String(text ?? '').toLowerCase());
  const rx = policy.edition_rules;
  const INDEPENDENT = new RegExp(rx.E3.independent_pattern), NOT_INDEPENDENT = new RegExp(rx.E3.not_independent_pattern);
  const SINGLE_SEX = new RegExp(rx.E4.single_sex_event_pattern);
  // E2 is a reviewed decision (duplicates, overlaps, other distances), not a computed screen: it comes from the frozen
  // list and, in the reviewed order, preempts the screens after it.
  const reviewedE2 = new Map(rx.editions.filter((x) => x.rule === 'E2').map((x) => [`${x.city}\u0000${x.year}`, x.category]));
  const group = (status) => (STATUS.held.includes(status) ? 'held' : STATUS.unverified.includes(status) ? 'unverified' : STATUS.verified.includes(status) ? 'verified' : 'no_rows');
  const ET = editions.map((x, e) => {
    const m = meta.get(`${x.city}\u0000${x.year}`);
    const med = quantileSeg(sorted, start[e], start[e + 1], 0.5);
    const p99 = quantileSeg(sorted, start[e], start[e + 1], 0.99);
    const sexed = nM[e] + nF[e];
    return {
      e, city: x.city, year: x.year, edition_id: m ? m.id : null, race_meta: m ? m.race : null, day: m ? dateDay(m.race_date) : NaN,
      status: m ? m.completeness_status : null, group: m ? group(m.completeness_status) : 'no_edition_meta',
      official: m && m.official_finishers !== null && m.official_finishers !== undefined ? Number(m.official_finishers) : NaN,
      independent: !!m && lowerHas(m.official_source_type, INDEPENDENT) && !lowerHas(m.official_source_type, NOT_INDEPENDENT),
      n_db: nDb[e], n_usable: nUse[e], med, p99, share_sub65: nUse[e] ? sub65[e] / nUse[e] : NaN,
      n_m: nM[e], n_f: nF[e], sex_coverage: nUse[e] > 0 ? sexed / nUse[e] : NaN, women_share: sexed > 0 ? nF[e] / sexed : NaN,
      single_sex: SINGLE_SEX.test(`${x.city ?? ''} ${m && m.race !== null ? m.race : ''}`.toLowerCase()),
    };
  });
  // The edition screens in the reviewed order (half_quality._edition_rule), recomputed.
  const T = 0.02;
  for (const r of ET) {
    r.category = null;
    const hasOff = Number.isFinite(r.official);
    if (r.group === 'no_edition_meta') r.category = 'no_edition_meta';
    else if (r.group === 'no_rows' || (r.n_usable === 0 && r.group !== 'held')) r.category = 'no_usable_rows';
    else if (r.group === 'held') r.category = 'held_by_producer';
    else if (reviewedE2.has(`${r.city}\u0000${r.year}`)) r.category = reviewedE2.get(`${r.city}\u0000${r.year}`);
    else if (r.independent && r.group !== 'verified' && hasOff && r.n_db > (1 + T) * r.official) r.category = 'count_excess_vs_independent';
    else if (r.independent && r.group !== 'verified' && hasOff && r.n_usable < (1 - T) * r.official) r.category = 'count_shortfall_vs_independent';
    else if (!r.independent && hasOff && r.official > 0 && r.n_db < (1 - T) * r.official) r.category = 'rows_short_of_source_list';
    else if (r.n_usable >= rx.E4.min_finishes && r.sex_coverage >= rx.E4.min_coverage && (r.women_share < rx.E4.min_share || r.women_share > 1 - rx.E4.min_share) && !r.single_sex) r.category = 'one_sex_list';
    else if (r.n_usable >= rx.E5.min_finishes && r.p99 / r.med < rx.E5.max_p99_over_median) r.category = 'truncated_top_list';
    else if (r.group !== 'verified' && rx.E6.caps.includes(r.n_db)) r.category = 'round_count_cap';
    else if (r.n_usable > 0 && (r.share_sub65 >= rx.E7.fast_share || r.med < rx.E7.fast_median_s)) r.category = 'atypical_fast_field';
    else if (r.n_usable > 0 && r.med > rx.E7.slow_median_s) r.category = 'atypical_slow_field';
  }
  // E8: an edition's median against the median of its label's other screened editions.
  const byCity = new Map();
  for (const r of ET) if (r.n_usable >= rx.E8.min_finishes && ['verified', 'unverified', 'held'].includes(r.group)) {
    if (!byCity.has(r.city)) byCity.set(r.city, []);
    byCity.get(r.city).push(r);
  }
  const npMedian = (xs) => { const s = Float64Array.from(xs).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  for (const rows of byCity.values()) {
    if (rows.length < rx.E8.min_editions) continue;
    for (const r of rows) {
      if (r.category !== null) continue;
      const others = npMedian(rows.filter((o) => o !== r).map((o) => o.med));
      if (Math.abs(Math.log(r.med / others)) > rx.E8.max_abs_log_ratio) r.category = 'series_median_shift';
    }
  }
  for (const r of ET) r.rule = r.category ? (rx.categories[r.category] || null) : null;
  lists.editions = ET.filter((r) => r.rule && r.rule !== 'E1').map((r) => ({ edition_id: r.edition_id, city: r.city, year: r.year, rule: r.rule, category: r.category, finishes: r.n_usable }));

  // ---------- The editions removed, as the frozen policy lists them ----------
  const frozen = new Set(policy.edition_rules.editions.map((x) => `${x.city}\u0000${x.year}`));
  const suspects = new Set(policy.date_suspects.map((x) => x.edition_id));
  const sexRule = policy.use_sex;
  for (const r of ET) {
    r.removed = frozen.has(`${r.city}\u0000${r.year}`) || r.group === 'held';
    r.use_finish = !r.removed && r.n_usable > 0 && (r.group === 'verified' || r.group === 'unverified');
    r.use_sex = r.use_finish && r.sex_coverage >= sexRule.min_coverage && r.women_share >= sexRule.min_share && r.women_share <= sexRule.max_share;
    r.date_suspect = r.edition_id !== null && suspects.has(r.edition_id);
  }
  // fin: record-usable rows of use_finish editions (the R7 rows included and flagged), in record id order.
  let nFin = 0;
  for (let k = 0; k < total; k++) if (!rule[k] && ET[ed[k]].use_finish) nFin++;
  const fin = { n: nFin, id: new Uint32Array(nFin), ed: new Int32Array(nFin), finish: new Float64Array(nFin), sex: new Uint8Array(nFin), r7: new Uint8Array(nFin) };
  let j = 0, r7All = 0;
  for (let k = 0; k < total; k++) {
    if (rule[k]) continue;
    if (flag[k] & 2) r7All++;
    if (!ET[ed[k]].use_finish) continue;
    fin.id[j] = id[k]; fin.ed[j] = ed[k]; fin.finish[j] = finish[k];
    fin.sex[j] = flag[k] & 4 ? 1 : flag[k] & 8 ? 2 : 0;
    fin.r7[j] = flag[k] & 2 ? 1 : 0;
    j++;
  }
  let r7In = 0;
  for (let k = 0; k < nFin; k++) r7In += fin.r7[k];
  need(r7In === r7All, `${r7All - r7In} R7 rows sit outside use_finish editions`);
  const tally = (pred) => {
    let n = 0;
    const eds = new Set();
    for (let k = 0; k < nFin; k++) if (!fin.r7[k] && pred(k)) { n++; eds.add(fin.ed[k]); }
    return { finishes: n, editions: eds.size };
  };
  const sum = (rows) => rows.reduce((a, r) => a + r.n_usable, 0);
  const E0 = ET.filter((r) => r.rule === 'E0'), E1 = ET.filter((r) => r.rule === 'E1'), E28 = ET.filter((r) => r.rule && !['E0', 'E1'].includes(r.rule));
  const frozenE28 = policy.edition_rules.editions.filter((x) => x.rule !== 'E0');
  const counts = {
    raw: total, R1: byRule.R1, R2: byRule.R2, R3: byRule.R3, R4: byRule.R4, R5_fast: byRule.R5_fast, R5_slow: byRule.R5_slow, R6: byRule.R6,
    record_usable: byRule.usable, R7: r7All, record_usable_after_R7: byRule.usable - r7All,
    E0_editions: policy.edition_rules.editions.filter((x) => x.rule === 'E0').length,
    E0_finishes: ET.filter((r) => frozen.has(`${r.city}\u0000${r.year}`) && r.group === 'no_edition_meta').reduce((a, r) => a + r.n_usable, 0),
    E1_held_editions: ET.filter((r) => r.group === 'held').length, E1_held_finishes: sum(ET.filter((r) => r.group === 'held')),
    E2_E8_editions: frozenE28.length,
    E2_E8_finishes: ET.filter((r) => frozen.has(`${r.city}\u0000${r.year}`) && r.group !== 'no_edition_meta').reduce((a, r) => a + r.n_usable, 0),
    use_finish: tally(() => true),
    verified: tally((k) => ET[fin.ed[k]].group === 'verified'),
    verified_use_sex: tally((k) => ET[fin.ed[k]].group === 'verified' && ET[fin.ed[k]].use_sex && fin.sex[k] > 0),
    undated: tally((k) => Number.isNaN(ET[fin.ed[k]].day)),
  };
  const recomputed = { E0: E0.length, E1: E1.length, E2_E8: E28.length, E2_E8_finishes: sum(E28), duplicate_groups: groups };
  return { counts, lists, recomputed, editions: ET, fin };
}

module.exports = { applyPolicy, parseTime, tryInt, nameKey, hash53, dateDay, quantileSeg, PRODUCER_EXCLUDE, NONRUN, STATUS };
