'use strict';
// The half record and edition rules, reimplemented for the source recount (scripts/verify-half-source.cjs) from the
// policy's published definitions (docs/HALF_MARATHON.md, rules R1 and R2 of the combined release), independently of
// analysis/half_quality.py: its own time parser, sub-race pattern, name key, duplicate rule, sex rule and row rule. The
// record rules R1, R8, R2–R7 are applied here; the edition screens E3–E8, the virtual-event rule, the twin rule of the
// carried E2 decisions and the course-suspected-short rule are recomputed only to compare with the frozen lists, and the
// editions are then removed exactly as the frozen policy JSON lists them (E0, E2–E8) plus the held tier (E1).
//
// One policy schema: 3 (pace-notes-marathon-half-20261113-1113). It reads the extract analysis/half_extract.py cuts from
// the release's parquet files (this recount has no parquet reader): statuses are the release's tiers; verified = a
// badge tier, checked by `checkTiers` against the frozen lists. The policies of the earlier half snapshots (schemas 1
// and 2) and their recounts are in Git history; their sources are no longer pinned. Every record-usable finish after R7
// is used or removed by one edition rule.
//
// One pass over race_records in id order keeps per-row numbers in typed arrays (no names: a name enters only as a
// 53-bit hash of its duplicate key; the few rows whose keys collide are reread by id to compare the keys themselves).

// The producer's exclusion flags (record_flags); time_hour_reconstructed alone never excludes.
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
// The release's tiers as status groups (EDITION-TIERS.csv; an edition the tier table lacks keeps the registry's no_rows).
const STATUS = {
  verified: ['stamped', 'stamped_weaker_source'],
  unverified: ['unverified'],
  held: ['held_for_review'],
  partial: ['partial'],
  removed: ['excluded'],
  empty: ['no_rows'],
};
// The row-quality flags the release can set (qa_row_flags.parquet); the row rule may name only these.
const QA_FLAGS = ['split_nonmonotonic', 'split_after_finish', 'finish_equals_earlier_split', 'finish_ge_24h', 'finish_zero',
  'finish_implausibly_fast', 'finish_faster_than_world_record', 'no_finish_time', 'age_implausible', 'finish_6h_to_24h'];
// The virtual-event screen (E2): the label contains `virtual` or `virtuel` (any case), or its place, the label before the
// first colon, starts with the placeholder `Anywhere`.
const VIRTUAL = { label: /virtual|virtuel/, place: /^anywhere\b/ };
const VIRTUAL_POLICY = { label_pattern: 'virtual|virtuel', placeholder_place_pattern: '^anywhere\\b' };
// The words the policy must say for the screens this recount computes: which count each edition screen compares (every
// row loaded, n_db, which counts the release's listed row exclusions, or record-usable rows before R7, n_usable), E3's
// three conditions, E6's and R6's no-key clause. They describe the code below; a policy that says anything else needs a
// reviewed recount first. The E3 tolerance is this recount's T.
const COUNT_TOLERANCE = 0.02;
const POLICY_WORDS = {
  computed_on: "named per screen. n_db is every row loaded for the edition's city and year: its race_records rows of the half "
    + 'database, whatever record rule removes them, plus its rows in RELEASE-ROW-EXCLUSIONS.parquet (the release removes rows '
    + "the earlier snapshots still held); an edition with no row in race_records has n_db 0. n_usable is the edition's "
    + "record-usable rows before R7 (rows no record rule R1, R8, R2–R6 removes, R7 not applied), and the edition's median, "
    + '99th percentile, share under 1:05 and recorded-sex counts are over those rows. E3 count_excess_vs_independent, E3 '
    + 'rows_short_of_source_list and E6 compare n_db; E3 count_shortfall_vs_independent, E4, E5, E7 and E8 use n_usable',
  E3: {
    independent: 'official_source_type, lowercased (a null as empty), matches independent_pattern and does not match not_independent_pattern',
    count_excess_vs_independent: "the source is independent, the edition's status group is not verified, official_finishers is present, and n_db > (1 + tolerance) × official_finishers",
    count_shortfall_vs_independent: "the source is independent, the edition's status group is not verified, official_finishers is present, and n_usable < (1 - tolerance) × official_finishers",
    rows_short_of_source_list: 'the source is not independent (any status group), official_finishers is present and above 0, and n_db < (1 - tolerance) × official_finishers',
    order: 'the first of the three that applies, in this order; every inequality is strict',
  },
  E6: "the edition's status group is not verified and n_db equals one of caps exactly",
  R6: 'a name with no a-z or 0-9 character left after this normalisation has no key and is never compared, so it is never an R6 duplicate',
};
/** Key-order-free equality of two JSON values (the policy is written with sorted keys). */
const sameJson = (a, b) => JSON.stringify(a, Object.keys(a ?? {}).sort()) === JSON.stringify(b, Object.keys(b ?? {}).sort());
const isVirtualLabel = (label) => {
  if (typeof label !== 'string') return false;
  const low = label.toLowerCase();
  return VIRTUAL.label.test(low) || VIRTUAL.place.test(low.split(':')[0].trim());
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
  need(policy.schema_version === 3, `policy schema ${policy.schema_version} is not one this recount reads`);
  const R = policy.record_rules;
  need(JSON.stringify(R.order) === JSON.stringify(['R1', 'R8', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']), 'record rule order');
  need(JSON.stringify([...R.R1.flags].sort()) === JSON.stringify([...PRODUCER_EXCLUDE].sort()), 'the R1 flags differ from this recount');
  need(R.R2.column === 'split_21_1km' && R.R2.pattern === '^[0-9]+:[0-9]{2}:[0-9]{2}$', 'the R2 parser');
  need(R.R3.pattern === NONRUN_POLICY, 'the R3 sub-race pattern differs from this recount');
  need(R.R4.floor_s === WR_FLOOR_S && R.R4.min_share === SUBRACE_FAST.share && R.R4.min_count === SUBRACE_FAST.count, 'the R4 screen');
  need(R.R5.min_s === WR_FLOOR_S && R.R5.max_s === SLOW_CAP_S, 'the R5 bounds');
  need(R.R6.anonymous_pattern === ANONYMOUS.source, 'the R6 anonymous pattern');
  need(R.R6.no_key === POLICY_WORDS.R6, "the policy's R6 no-key clause differs from this recount's (nameKey)");
  need(R.R7.city === R7.city && JSON.stringify(R.R7.years) === JSON.stringify(R7.years) && JSON.stringify(R.R7.bib) === JSON.stringify(R7.bib), 'the R7 block');
  // R8: the frozen half row rule, as the policy states it (generated from the pipeline's HALF_ROW_RULE) and as the lookup
  // reads it (half_records.left_out): two statements of one list.
  const R8 = R.R8, L = policy.half_records?.left_out;
  const strings = (x) => Array.isArray(x) && x.every((v) => typeof v === 'string');
  need(!!R8 && strings(R8.pending_review_flags) && strings(R8.qa_row_flags) && strings(R8.kept_when_edition_wide), 'the R8 row rule');
  need(R8.qa_row_flags.every((f) => QA_FLAGS.includes(f)), 'the R8 row rule names a row-quality flag the release does not have');
  need(!!L && ['pending_review_flags', 'qa_row_flags', 'kept_when_edition_wide'].every((k) => JSON.stringify(L[k]) === JSON.stringify(R8[k])) && L.finish_not_a_positive_time === true,
    'half_records.left_out is not the R8 row rule');
  need(typeof policy.sex === 'string' && /published sex/.test(policy.sex) && /sex_from_category/.test(policy.sex), 'the sex rule');
  need(JSON.stringify(Object.keys(policy.statuses).sort()) === JSON.stringify(Object.keys(STATUS).sort())
    && Object.keys(STATUS).every((g) => JSON.stringify(policy.statuses[g]) === JSON.stringify(STATUS[g])), 'the status groups');
  need(typeof policy.unknown_status === 'string', 'an unknown tier fails');
  need(typeof policy.empty_status === 'string', 'an empty status holds no rows');
  const ER = policy.edition_rules;
  need(JSON.stringify(ER.order) === JSON.stringify(['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']), 'edition rule order');
  need(ER.E3.tolerance === COUNT_TOLERANCE, 'the E3 tolerance differs from this recount');
  need(ER.computed_on === POLICY_WORDS.computed_on, 'the policy names another count basis for the edition screens than this recount computes');
  need(!!ER.E3.conditions && sameJson(ER.E3.conditions, POLICY_WORDS.E3), "the policy's E3 conditions differ from this recount's");
  need(ER.E6.condition === POLICY_WORDS.E6, "the policy's E6 condition differs from this recount's");
  need(typeof ER.E0?.rule === 'string' && JSON.stringify(ER.E1?.removed) === JSON.stringify(STATUS.removed) && JSON.stringify(ER.E1?.held) === JSON.stringify(STATUS.held), 'E0 and E1');
  const V = ER.E2?.virtual_event;
  need(!!V && V.label_pattern === VIRTUAL_POLICY.label_pattern && V.placeholder_place_pattern === VIRTUAL_POLICY.placeholder_place_pattern && Array.isArray(V.not_virtual), 'the virtual-event rule differs from this recount');
  need(typeof ER.E2.twin_rule === 'string' && ER.E2.twins && typeof ER.E2.twins === 'object' && Array.isArray(ER.E2.decisions) && Array.isArray(ER.E2.decisions_by_key)
    && ER.E2.decisions.every((x) => String(x.edition_id) in ER.E2.twins) && Object.keys(ER.E2.twins).length === ER.E2.decisions.length, 'the reviewed E2 decisions and their twins');
  need(['partial_tier', 'no_edition_meta'].every((c) => ER.categories[c] === 'E0') && ER.categories.removed_by_producer === 'E1'
    && ['virtual_event', 'course_suspected_short', 'cross_edition_duplicate', 'cross_edition_overlap_hold', 'not_half_distance'].every((c) => ER.categories[c] === 'E2'), 'the categories');
  need(/gross_timing/.test(ER.E8.reference) && /course_suspected_short/.test(ER.E8.reference), 'the E8 reference must leave out gun-time and course-suspected-short editions');
  const T = policy.tiers;
  const ids = (rows) => Array.isArray(rows) && rows.every((x) => Number.isSafeInteger(x.edition_id) && typeof x.city === 'string' && Number.isSafeInteger(x.year));
  need(!!T && Array.isArray(T.stamped) && ids(T.never_stamp) && ids(T.weaker_source) && ids(T.gross_timing) && ids(T.course_suspected_short), 'the tier check');
  need(Array.isArray(policy.date_suspects) && policy.date_suspects.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)), 'the date suspects carry their dates');
}

/**
 * Reads the extract and applies R1, R8, R2–R7 and the editions. Returns the counts, the computed lists, the usable
 * finishes (`fin`: typed arrays in record id order) with their editions, and every record (`rows`: id, edition, parsed
 * finish and the sex the sex rule gives, in id order) for the link rows' join checks.
 */
function applyPolicy(db, policy, log = () => {}) {
  checkPolicyText(policy);
  const exclude = new Set(PRODUCER_EXCLUDE);
  const { max: maxId, n: total } = db.prepare('SELECT max(id) AS max, count(*) AS n FROM race_records').get();
  const excluded = new Uint8Array(maxId + 1);
  for (const r of db.prepare('SELECT record_id, flag FROM record_flags').iterate()) if (exclude.has(r.flag) && r.record_id <= maxId) excluded[r.record_id] = 1;

  // Sub-races and editions, as the extract numbers them.
  const edIndex = new Map(), editions = [];
  const edOf = (city, year) => {
    const k = `${city}\u0000${year}`;
    let e = edIndex.get(k);
    if (e === undefined) { e = editions.length; edIndex.set(k, e); editions.push({ city, year }); }
    return e;
  };
  const subs = [];
  for (const s of db.prepare('SELECT sub_id, city, year, race FROM subraces ORDER BY sub_id').iterate()) {
    need(s.sub_id === subs.length + 1 && Number.isSafeInteger(s.year), 'the sub-races are numbered from 1 without a gap');
    subs.push({ e: edOf(s.city, s.year), race: s.race, n: 0, fast: 0 });
  }

  const id = new Uint32Array(total), ed = new Int32Array(total), sub = new Int32Array(total), finish = new Float64Array(total);
  const sexPub = new Uint8Array(total), flag = new Uint8Array(total), keyHash = new Float64Array(total).fill(NaN);
  // The sex the sex rule gives, exactly as written (no merging of null and '?'), for the link rows' join checks.
  const sexRaw = new Uint8Array(total), rawSexCodes = new Map(), rawSexNames = [];
  const rawSexCode = (s) => {
    const k = s === null || s === undefined ? '\u0000null' : String(s);
    let c = rawSexCodes.get(k);
    if (c === undefined) { c = rawSexNames.length; need(c < 256, 'too many sex values'); rawSexCodes.set(k, c); rawSexNames.push(s === undefined ? null : s); }
    return c;
  };
  const sexCodes = new Map([['\u0000null', 0]]), sexNames = [null];
  // Sex for the duplicate key; a null and a literal '?' share the key's code (coalesce(sex, '?')).
  const sexCode = (s) => {
    const k = s === null || s === undefined || s === '?' ? '\u0000null' : s;
    let c = sexCodes.get(k);
    if (c === undefined) { c = sexNames.length; sexCodes.set(k, c); sexNames.push(s); }
    return c;
  };
  // The sex rule: the published sex; when that is blank (null, or empty after trimming), the published category's.
  const sexOf = (published, category) => (published === null || published === undefined || String(published).trim() === '' ? (category ?? null) : published);
  let i = 0, lastId = 0;
  const index = new Map();   // nothing: ids are found by binary search (the arrays are in id order)
  for (const r of db.prepare('SELECT id, sub_id, runner, sex, sex_category, split_21_1km, bib FROM race_records ORDER BY id').iterate()) {
    need(r.id > lastId && r.sub_id >= 1 && r.sub_id <= subs.length, `record ${r.id}: order or sub-race`);
    lastId = r.id;
    id[i] = r.id;
    const s = r.sub_id - 1, e = subs[s].e;
    ed[i] = e; sub[i] = s;
    const t = parseTime(r.split_21_1km);
    finish[i] = t === null ? NaN : t;
    const sex = sexOf(r.sex, r.sex_category);
    sexPub[i] = sexCode(sex);
    sexRaw[i] = rawSexCode(sex);
    // bit 1: producer exclusion; bit 2: the R7 bib block; bit 4: sex 'M'; bit 8: sex 'F'; bit 16: the row rule (R8).
    let f = excluded[r.id] ? 1 : 0;
    const bib = tryInt(r.bib);
    const x = editions[e];
    if (x.city === R7.city && x.year >= R7.years[0] && x.year <= R7.years[1] && bib !== null && bib >= R7.bib[0] && bib <= R7.bib[1]) f |= 2;
    if (sex === 'M') f |= 4; else if (sex === 'F') f |= 8;
    flag[i] = f;
    const key = nameKey(r.runner);
    if (key !== null) keyHash[i] = hash53(key);
    i++;
    if (i % 1000000 === 0) log(`  ${i.toLocaleString('en-US')} records read`);
  }
  need(i === total && index.size === 0, 'every record read');
  const find = (rid) => { let lo = 0, hi = total - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (id[m] === rid) return m; if (id[m] < rid) lo = m + 1; else hi = m - 1; } return -1; };
  const nRows = new Int32Array(editions.length);
  for (let k = 0; k < total; k++) nRows[ed[k]]++;

  // R8: the frozen half row rule. A row carrying a listed pending-review or row-quality flag is left out, unless the flag
  // is one of kept_when_edition_wide and every race_records row of its edition carries it.
  const R8 = policy.record_rules.R8;
  const listed = new Map();   // flag -> the record indexes that carry it
  const carry = (table, flags) => {
    const want = new Set(flags);
    for (const r of db.prepare(`SELECT record_id, flag FROM ${table}`).iterate()) {
      if (!want.has(r.flag)) continue;
      const k = find(r.record_id);
      need(k >= 0, `${table}: record ${r.record_id} is not a half row of the half database`);
      if (!listed.has(r.flag)) listed.set(r.flag, []);
      listed.get(r.flag).push(k);
    }
  };
  carry('pending_flags', R8.pending_review_flags);
  carry('qa_flags', R8.qa_row_flags);
  const wideFlags = new Set(R8.kept_when_edition_wide);
  let ruleRows = 0;
  for (const [name, rows] of listed) {
    const perEd = new Map();
    for (const k of rows) perEd.set(ed[k], (perEd.get(ed[k]) || 0) + 1);
    for (const k of rows) {
      if (wideFlags.has(name) && perEd.get(ed[k]) === nRows[ed[k]]) continue;
      if (!(flag[k] & 16)) { flag[k] |= 16; ruleRows++; }
    }
  }

  // Sub-race screens (R3, R4) over the rows that pass R1, R8 and R2.
  for (let k = 0; k < total; k++) {
    if (flag[k] & 17 || !(finish[k] > 0)) continue;
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
  // rule codes: 0 usable, 1 R1, 2 R2, 3 R3, 4 R4, 5 R5 fast, 6 R5 slow, 7 R6, 8 R8.
  const rule = new Uint8Array(total);
  for (let k = 0; k < total; k++) {
    if (flag[k] & 1) rule[k] = 1;
    else if (flag[k] & 16) rule[k] = 8;
    else if (!(finish[k] > 0)) rule[k] = 2;
    else if (subs[sub[k]].rule === 'R3') rule[k] = 3;
    else if (subs[sub[k]].rule === 'R4') rule[k] = 4;
    else if (finish[k] < WR_FLOOR_S) rule[k] = 5;
    else if (finish[k] > SLOW_CAP_S) rule[k] = 6;
  }
  // R6: the same name key, finish and sex in one edition; keep the copy from the largest sub-race list, then the lowest
  // id. Rows are grouped on the key's hash; a group of two or more is reread to compare the keys themselves.
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
  const NAMES = ['usable', 'R1', 'R2', 'R3', 'R4', 'R5_fast', 'R5_slow', 'R6', 'R8'];
  const byRule = Object.fromEntries(NAMES.map((n) => [n, 0]));
  for (let k = 0; k < total; k++) byRule[NAMES[rule[k]]]++;

  // Every half row the identity file marks left_out must be removed by these record rules (lead decision D28).
  let leftOut = 0, leftOutKept = 0, leftOutInRule = 0;
  for (const r of db.prepare('SELECT record_id FROM identity_left_out').iterate()) {
    const k = find(r.record_id);
    need(k >= 0, `identity_left_out: record ${r.record_id} is not a half row of the half database`);
    leftOut++;
    if (!rule[k] && !(flag[k] & 2)) leftOutKept++;
    if (flag[k] & 16) leftOutInRule++;
  }
  need(leftOutKept === 0, `${leftOutKept} half rows the identity file marks left_out are record-usable`);

  // ---------- Editions: the registry and the tier table joined on city and year, with metrics on the record-usable rows (before R7) ----------
  const meta = new Map();
  for (const m of db.prepare('SELECT id, city, year, race, race_date, official_finishers, official_source_type, completeness_status, timing_basis FROM edition_meta').iterate()) {
    const k = `${m.city}\u0000${m.year}`;
    need(!meta.has(k), `two registry rows for ${m.city} ${m.year}`);
    meta.set(k, m);
    edOf(m.city, m.year);
  }
  const tier = new Map();
  for (const t of db.prepare("SELECT city, year, verification_tier, weaker_source FROM tiers WHERE source_db = 'half'").iterate()) {
    const k = `${t.city}\u0000${t.year}`;
    need(!tier.has(k), `two tier rows for ${t.city} ${t.year}`);
    tier.set(k, t);
  }
  const exclusions = new Map(db.prepare('SELECT city, year, n FROM excluded_rows').all().map((x) => [`${x.city}\u0000${x.year}`, x.n]));
  const suspect = new Map(db.prepare('SELECT city, year, n, flagged FROM course_suspect').all().map((x) => [`${x.city}\u0000${x.year}`, x]));
  const E = editions.length;
  const nCore = new Int32Array(E), nUse = new Int32Array(E), nM = new Int32Array(E), nF = new Int32Array(E), sub65 = new Int32Array(E);
  for (let k = 0; k < total; k++) {
    const e = ed[k];
    nCore[e]++;
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
  const notVirtual = new Set(rx.E2.virtual_event.not_virtual.map((x) => x.edition_id));
  const group = (status) => (STATUS.held.includes(status) ? 'held' : STATUS.unverified.includes(status) ? 'unverified' : STATUS.verified.includes(status) ? 'verified'
    : STATUS.removed.includes(status) ? 'removed' : STATUS.partial.includes(status) ? 'partial' : 'no_rows');
  const known = new Set(Object.values(STATUS).flat());
  const ET = editions.map((x, e) => {
    const key = `${x.city}\u0000${x.year}`;
    const m = meta.get(key), t = tier.get(key), cs = suspect.get(key);
    // The tier table is the complete one; an edition it lacks keeps the registry's own status (no_rows).
    const status = t ? t.verification_tier : m ? m.completeness_status : null;
    need(nCore[e] === 0 || !!t, `${x.city} ${x.year}: rows and no row in the tier table`);
    need(!(m && t) || m.completeness_status === t.verification_tier, `${x.city} ${x.year}: the registry and the tier table name different tiers`);
    need(status === null || known.has(status), `tier ${JSON.stringify(status)} is in no status group`);
    need(!cs || (cs.flagged === cs.n && cs.n === nCore[e]), `${x.city} ${x.year}: only partly flagged course_shortened_suspect`);
    const med = quantileSeg(sorted, start[e], start[e + 1], 0.5);
    const p99 = quantileSeg(sorted, start[e], start[e + 1], 0.99);
    const sexed = nM[e] + nF[e];
    return {
      e, city: x.city, year: x.year, edition_id: m ? m.id : null, race_meta: m ? m.race : null, day: m ? dateDay(m.race_date) : NaN, race_date: m ? m.race_date : null,
      status, group: m ? group(status) : 'no_edition_meta', partial: STATUS.partial.includes(status),
      official: m && m.official_finishers !== null && m.official_finishers !== undefined ? Number(m.official_finishers) : NaN,
      source_type: m ? m.official_source_type : null,
      independent: !!m && lowerHas(m.official_source_type, INDEPENDENT) && !lowerHas(m.official_source_type, NOT_INDEPENDENT),
      gross_timing: !!m && String(m.timing_basis ?? '').toLowerCase().startsWith('gross'), course_suspect: !!cs,
      // Rows loaded: the rows in CORE plus the release's listed row exclusions of the edition (none when CORE holds none).
      n_core: nCore[e], n_db: nCore[e] === 0 ? 0 : nCore[e] + (exclusions.get(key) || 0), n_usable: nUse[e], med, p99, share_sub65: nUse[e] ? sub65[e] / nUse[e] : NaN,
      n_m: nM[e], n_f: nF[e], sex_coverage: nUse[e] > 0 ? sexed / nUse[e] : NaN, women_share: sexed > 0 ? nF[e] / sexed : NaN,
      single_sex: SINGLE_SEX.test(`${x.city ?? ''} ${m && m.race !== null ? m.race : ''}`.toLowerCase()),
    };
  });
  // The reviewed E2 decisions (duplicates, overlaps, other distances) are carried by rule: a decision by edition id
  // applies only while the twin its reason names still has rows; one by city and year while the edition has rows.
  const haveRows = new Set(ET.filter((r) => r.edition_id !== null && r.n_db > 0).map((r) => r.edition_id));
  const e2ById = new Map(), dropped = [];
  for (const x of rx.E2.decisions) {
    const twin = rx.E2.twins[String(x.edition_id)];
    if (!haveRows.has(x.edition_id) || (twin !== null && !haveRows.has(twin))) dropped.push({ edition_id: x.edition_id, category: x.category, twin, why: !haveRows.has(x.edition_id) ? 'no rows itself' : 'the twin has no rows' });
    if (twin === null || haveRows.has(twin)) e2ById.set(x.edition_id, x.category);
  }
  const e2ByKey = new Map(rx.E2.decisions_by_key.map((x) => [`${x.city}\u0000${x.year}`, x.category]));
  // The edition screens in the reviewed order (half_quality._edition_rule), recomputed.
  const T = COUNT_TOLERANCE;
  for (const r of ET) {
    r.category = null;
    const hasOff = Number.isFinite(r.official);
    if (r.partial) r.category = 'partial_tier';
    else if (r.group === 'no_edition_meta') r.category = 'no_edition_meta';
    else if (r.group === 'removed') r.category = 'removed_by_producer';
    else if (r.group === 'no_rows' || (r.n_usable === 0 && r.group !== 'held')) r.category = 'no_usable_rows';
    else if (r.group === 'held') r.category = 'held_by_producer';
    else if (e2ById.has(r.edition_id)) r.category = e2ById.get(r.edition_id);
    else if (e2ByKey.has(`${r.city}\u0000${r.year}`)) r.category = e2ByKey.get(`${r.city}\u0000${r.year}`);
    else if (r.course_suspect) r.category = 'course_suspected_short';
    else if (isVirtualLabel(r.city) && !notVirtual.has(r.edition_id)) r.category = 'virtual_event';
    else if (r.independent && r.group !== 'verified' && hasOff && r.n_db > (1 + T) * r.official) r.category = 'count_excess_vs_independent';
    else if (r.independent && r.group !== 'verified' && hasOff && r.n_usable < (1 - T) * r.official) r.category = 'count_shortfall_vs_independent';
    else if (!r.independent && hasOff && r.official > 0 && r.n_db < (1 - T) * r.official) r.category = 'rows_short_of_source_list';
    else if (r.n_usable >= rx.E4.min_finishes && r.sex_coverage >= rx.E4.min_coverage && (r.women_share < rx.E4.min_share || r.women_share > 1 - rx.E4.min_share) && !r.single_sex) r.category = 'one_sex_list';
    else if (r.n_usable >= rx.E5.min_finishes && r.p99 / r.med < rx.E5.max_p99_over_median) r.category = 'truncated_top_list';
    else if (r.group !== 'verified' && rx.E6.caps.includes(r.n_db)) r.category = 'round_count_cap';
    else if (r.n_usable > 0 && (r.share_sub65 >= rx.E7.fast_share || r.med < rx.E7.fast_median_s)) r.category = 'atypical_fast_field';
    else if (r.n_usable > 0 && r.med > rx.E7.slow_median_s) r.category = 'atypical_slow_field';
  }
  // E8: an edition's median against the median of its label's other reference editions. A gun-time edition or one whose
  // course is suspected short is screened like any other but is never a reference edition.
  const byCity = new Map();
  for (const r of ET) if (r.n_usable >= rx.E8.min_finishes && ['verified', 'unverified', 'held'].includes(r.group)) {
    if (!byCity.has(r.city)) byCity.set(r.city, []);
    byCity.get(r.city).push(r);
  }
  const npMedian = (xs) => { const s = Float64Array.from(xs).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  for (const rows of byCity.values()) {
    const reference = rows.filter((o) => !o.gross_timing && !o.course_suspect);
    for (const r of rows) {
      if (r.category !== null) continue;
      const rest = reference.filter((o) => o !== r);
      if (rest.length + 1 < rx.E8.min_editions || !rest.length) continue;
      const others = npMedian(rest.map((o) => o.med));
      if (Math.abs(Math.log(r.med / others)) > rx.E8.max_abs_log_ratio) r.category = 'series_median_shift';
    }
  }
  for (const r of ET) r.rule = r.category ? (rx.categories[r.category] || null) : null;
  for (const r of ET) if (r.group === 'removed') need(r.n_core === 0, `${r.city} ${r.year}: a removed edition still holds ${r.n_core} rows`);
  for (const r of ET) if (STATUS.empty.includes(r.status)) need(r.n_core === 0, `${r.city} ${r.year}: an edition with an empty status holds ${r.n_core} rows`);
  lists.editions = ET.filter((r) => r.rule && r.rule !== 'E1').map((r) => ({ edition_id: r.edition_id, city: r.city, year: r.year, rule: r.rule, category: r.category, finishes: r.n_usable }));
  lists.e2_dropped = dropped;

  // ---------- The editions removed, as the frozen policy lists them ----------
  const frozen = new Set(policy.edition_rules.editions.map((x) => `${x.city}\u0000${x.year}`));
  const suspects = new Set(policy.date_suspects.map((x) => x.edition_id));
  const sexRule = policy.use_sex;
  for (const r of ET) {
    r.removed = frozen.has(`${r.city}\u0000${r.year}`) || r.group === 'held' || r.group === 'removed';
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
  for (const r of ET) if (r.gross_timing || r.course_suspect || r.partial) need(!r.use_finish, `${r.city} ${r.year}: a gun-time, course-suspected-short or partial edition supplies finishes`);
  const tally = (pred) => {
    let n = 0;
    const eds = new Set();
    for (let k = 0; k < nFin; k++) if (!fin.r7[k] && pred(k)) { n++; eds.add(fin.ed[k]); }
    return { finishes: n, editions: eds.size };
  };
  const sum = (rows) => rows.reduce((a, r) => a + r.n_usable, 0);
  const isE0 = (r) => r.group === 'no_edition_meta' || r.partial;
  const E0 = ET.filter((r) => r.rule === 'E0'), E1 = ET.filter((r) => r.rule === 'E1'), E28 = ET.filter((r) => r.rule && !['E0', 'E1'].includes(r.rule));
  const frozenE28 = policy.edition_rules.editions.filter((x) => x.rule !== 'E0');
  const counts = {
    raw: total, R1: byRule.R1, R8: byRule.R8, R2: byRule.R2, R3: byRule.R3, R4: byRule.R4, R5_fast: byRule.R5_fast, R5_slow: byRule.R5_slow, R6: byRule.R6,
    record_usable: byRule.usable, R7: r7All, record_usable_after_R7: byRule.usable - r7All,
    E0_editions: policy.edition_rules.editions.filter((x) => x.rule === 'E0').length,
    E0_finishes: ET.filter((r) => frozen.has(`${r.city}\u0000${r.year}`) && isE0(r)).reduce((a, r) => a + r.n_usable, 0),
    E1_held_editions: ET.filter((r) => r.group === 'held').length, E1_held_finishes: sum(ET.filter((r) => r.group === 'held')),
    E1_removed_editions: ET.filter((r) => r.group === 'removed').length,
    E2_E8_editions: frozenE28.length,
    E2_E8_finishes: ET.filter((r) => frozen.has(`${r.city}\u0000${r.year}`) && !isE0(r)).reduce((a, r) => a + r.n_usable, 0),
    use_finish: tally(() => true),
    verified: tally((k) => ET[fin.ed[k]].group === 'verified'),
    verified_use_sex: tally((k) => ET[fin.ed[k]].group === 'verified' && ET[fin.ed[k]].use_sex && fin.sex[k] > 0),
    undated: tally((k) => Number.isNaN(ET[fin.ed[k]].day)),
    tier_check: {
      badge: ET.filter((r) => r.group === 'verified').length,
      verified_usable: ET.filter((r) => r.use_finish && r.group === 'verified').length,
      weaker_source: ET.filter((r) => r.status === 'stamped_weaker_source').length,
      never_stamp: policy.tiers.never_stamp.length,
      gross_timing: ET.filter((r) => r.gross_timing).length, course_suspected_short: ET.filter((r) => r.course_suspect).length,
    },
  };
  // Every record-usable finish after R7 is used or removed by exactly one edition rule.
  const accounted = counts.use_finish.finishes + counts.E0_finishes + counts.E1_held_finishes + counts.E2_E8_finishes;
  need(accounted === counts.record_usable_after_R7, `${counts.record_usable_after_R7 - accounted} record-usable finishes after R7 are neither used nor removed by an edition rule`);
  const recomputed = { E0: E0.length, E1: E1.length, E2_E8: E28.length, E2_E8_finishes: sum(E28), duplicate_groups: groups,
    row_rule: { rows_the_rule_names: ruleRows, identity_left_out: leftOut, in_both: leftOutInRule } };
  // rows: every record in id order (its edition, parsed finish, the sex the sex rule gives), for the link rows' joins.
  const rows = { n: total, id, ed, finish, sex: sexRaw, sexNames: rawSexNames, rule };
  return { counts, lists, recomputed, editions: ET, fin, rows };
}

// ---------- The tier check, read without the Python builders ----------

/** half_quality.trim_text: runs of ASCII whitespace made one space; over `limit`, cut at the last space and ended "…". */
function trimText(text, limit = 160) {
  const s = String(text ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[ ,;:]+$/, '')}…`;
}


/**
 * The release's tiers against the frozen lists (policy.tiers.reads): the badge-tier editions, the never-stamp list (by
 * edition id and year; a changed label is reported, not failed), the weaker-source stamps with their source text, the
 * gun-time editions (each held), the course-suspected-short editions and the date suspects' dates; after the editions,
 * every weaker-source stamp is a verified usable edition. Returns { problems, label_changes }.
 */
function checkTiers(policy, P) {
  const T = policy.tiers, problems = [], changes = [];
  const fail = (m) => problems.push(m);
  const byId = new Map(P.editions.filter((r) => r.edition_id !== null).map((r) => [r.edition_id, r]));
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const badge = new Set(P.editions.filter((r) => r.group === 'verified' && r.edition_id !== null).map((r) => r.edition_id));
  if (!same(badge, new Set(T.stamped))) fail('the badge-tier editions differ from the reviewed list');
  for (const x of T.never_stamp) {
    const r = byId.get(x.edition_id);
    if (!r || r.year !== x.year) { fail(`never-stamp edition ${x.edition_id} is not an edition of that id and year`); continue; }
    if (r.group === 'verified') fail(`never-stamp edition ${x.edition_id} carries a badge tier`);
    if (r.city !== x.city) changes.push({ edition_id: x.edition_id, was: x.city, now: r.city });
  }
  const weaker = new Set(P.editions.filter((r) => r.status === 'stamped_weaker_source').map((r) => r.edition_id));
  if (!same(weaker, new Set(T.weaker_source.map((x) => x.edition_id)))) fail('the weaker-source stamps differ from the reviewed list');
  for (const x of T.weaker_source) {
    const r = byId.get(x.edition_id);
    if (!r || r.city !== x.city || r.year !== x.year || trimText(r.source_type) !== x.source) fail(`weaker-source stamp ${x.edition_id} is not that edition with that source`);
  }
  const key = (rows) => new Set(rows.map((r) => `${r.edition_id}\u0000${r.city}\u0000${r.year}`));
  if (!same(key(P.editions.filter((r) => r.gross_timing)), key(T.gross_timing))) fail('the gun-time editions differ from the reviewed list');
  for (const r of P.editions) if (r.gross_timing && r.group !== 'held') fail(`${r.city} ${r.year}: a gun-time edition is not held`);
  if (!same(key(P.editions.filter((r) => r.course_suspect)), key(T.course_suspected_short))) fail('the course-suspected-short editions differ from the reviewed list');
  for (const x of policy.date_suspects) {
    const r = byId.get(x.edition_id);
    if (!r || r.year !== x.year) { fail(`date suspect ${x.edition_id} is not an edition of that id and year`); continue; }
    if (Number.isNaN(r.day) || r.day !== dateDay(x.date)) fail(`date suspect ${x.edition_id} is dated ${r.race_date}, not ${x.date}`);
    if (r.city !== x.city) changes.push({ edition_id: x.edition_id, was: x.city, now: r.city });
  }
  const usable = new Set(P.editions.filter((r) => r.use_finish && r.group === 'verified').map((r) => r.edition_id));
  for (const x of T.weaker_source) if (!usable.has(x.edition_id)) fail(`weaker-source stamp ${x.edition_id} is not a verified usable edition`);
  return { problems, label_changes: changes };
}

module.exports = { applyPolicy, parseTime, tryInt, nameKey, hash53, dateDay, quantileSeg, PRODUCER_EXCLUDE, NONRUN, STATUS, QA_FLAGS,
  isVirtualLabel, trimText, checkTiers };
