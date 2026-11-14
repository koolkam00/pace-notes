#!/usr/bin/env node
'use strict';
// Layer 2 of the half-marathon verification (docs/HALF_MARATHON.md): an independent Node recount of every published half
// value from the record-level source (the owner's public CC BY 4.0 release the site adopts, fetched anonymously by
// analysis/download_half.py), run by whoever rebuilds the half data and by the Half marathon workflow's `source` job. It
// never imports the Python builders and shares only their inputs:
//
//   - the extract analysis/half_extract.py cuts from the release's parquet files and the pipeline's identity file (this
//     recount has no parquet reader), opened read-only with node:sqlite and checked against the pin
//     (analysis/half-release.json, schema 4): its canonical content digest over every table, the release and link build
//     it was cut for, the sha256 of every pinned file it was cut from, the identity file (which must be the one the
//     marathon cohort's manifest names) and the frozen ns_keys SQL. The Python builders read the parquet files, not the
//     extract, so a wrong cut shows here as a mismatch;
//   - the frozen policy (analysis/half-policy-<stamp>.json, schema 3), whose rule text must equal this recount's own
//     constants;
//   - the marathon side from the checked-in marathon cohort (scripts/half/marathon.cjs).
//
// It reapplies R1, R8 and R2–R7 with its own parser, sub-race pattern, duplicate key, sex rule and row rule
// (scripts/half/policy.cjs), recomputes the edition screens to compare with the frozen lists, runs the tier check,
// removes the frozen editions, asserts every policy count, rebuilds set B and every published file
// (scripts/half/families.cjs) and compares them value for value: integers and shares exactly, quantiles exactly at their
// published rounding, the round-mark curve within 0.05 (its ratio and cliff within 1e-4). The whole-edition bootstrap of
// the round-mark intervals is Python-only; the recount checks the published ratio lies inside it. It then writes the
// receipt docs/evidence/half/source-recount.json (a date, the bound digests, the counts it checked and the mismatches;
// no rows), which scripts/verify-half.cjs requires in CI.
//
//   npm run verify:half-source -- [--extract half-extract.sqlite] [--out DIR] [--no-write] [--policy-only]
//
// Default: $PACE_HALF_DIR/half-extract.sqlite (PACE_HALF_DIR defaults to ~/data/half-20261113-1113). `--out` compares
// another folder than public/data/half (a trial build); `--policy-only` stops after the policy and the tier check (a new
// release's review, before any figure exists): neither writes the receipt.
//
// The link tables (`people`, `links`): every person (sex, ns_keys) and every link row, joined to race_records (a half:
// the sex the sex rule gives wherever the link file has one, and the finish within 0.5 s where it parses) or to the
// cohort (an eligible marathon: finish within 0.5 s, recorded sex mapped). Names and ages are not in the link tables, so
// ns_keys cannot be rebuilt here; each person's value is recounted as the largest block count over its rows whose own
// confidence is high_elite, high or medium, and the digest and the source job's re-cut bind the block counts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (/SQLite|[Zz]std/.test(String(warning)) ? undefined : emitWarning.call(process, warning, ...rest));
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const D = require('./half/derive.cjs');
const { applyPolicy, checkTiers } = require('./half/policy.cjs');
const { loadMarathons } = require('./half/marathon.cjs');
const Fam = require('./half/families.cjs');

const started = Date.now();
const log = (message) => console.log(`[${Math.round((Date.now() - started) / 1000)} s] ${message}`);
const argv = process.argv.slice(2);
const halfDir = process.env.PACE_HALF_DIR || path.join(os.homedir(), 'data', 'half-20261113-1113');
const pinFor = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'analysis', 'half-release.json'), 'utf8'));
const opt = { extract: path.join(halfDir, pinFor.links.extract), out: path.join(ROOT, 'public', 'data', 'half'), write: true, policyOnly: false, trial: false };
const USAGE = 'Usage: node scripts/verify-half-source.cjs [--extract half-extract.sqlite] [--out DIR] [--no-write] [--policy-only]';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--extract' && argv[i + 1]) opt.extract = path.resolve(argv[++i]);
  else if (argv[i] === '--out' && argv[i + 1]) { opt.out = path.resolve(argv[++i]); opt.write = false; opt.trial = true; }
  else if (argv[i] === '--no-write') opt.write = false;
  else if (argv[i] === '--policy-only') { opt.policyOnly = true; opt.write = false; }
  else throw new Error(USAGE);
}
const rel = (p) => path.join(ROOT, p);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(rel(p), 'utf8'));
const inside = (p) => !path.relative(ROOT, path.resolve(p)).startsWith('..');
const fail = (message) => { console.error(`verify-half-source: ${message}`); process.exit(1); };

// ---------- Inputs and their pins ----------
const pin = readJson('analysis/half-release.json');
const release = readJson('analysis/release.json');
const policyBytes = fs.readFileSync(rel(pin.policy));
const policy = JSON.parse(policyBytes);
if (pin.schema_version !== 4) fail(`the pin is schema ${pin.schema_version}; this recount reads schema 4`);
if (pin.marathon_release !== release.tag || pin.half.tag !== release.tag || pin.half.key !== release.tag) fail('the pin binds another release than the adopted one');
if (policy.tag !== pin.half.key || policy.schema_version !== 3) fail('the policy is not the pinned release’s (schema 3, keyed by half.key)');
if (pin.links.applies_to !== pin.half.key) fail('the pinned link build does not apply to the pinned half rows');
if (policy.tiers?.rule !== pin.stamps.rule) fail('the pin and the policy state different rules for a verified edition');
if (!fs.existsSync(opt.extract)) fail(`--extract: missing ${opt.extract} (cut it with python3 -I analysis/half_extract.py)`);
if (inside(opt.extract)) fail(`--extract: ${opt.extract} is inside the repository; record-level sources stay outside it`);
if (path.basename(opt.extract) !== pin.links.extract) fail('the extract must be the pinned file');
for (const wal of new Set([`${opt.extract}-wal`, `${fs.realpathSync(opt.extract)}-wal`])) {
  if (fs.existsSync(wal) && fs.statSync(wal).size > 0) fail(`${wal} is not empty: the extract has uncommitted pages beside it`);
}

// The extract's canonical content digest (analysis/half_extract.py docstring), computed here: every table but `build`,
// each table's rows ordered by every column in declared order, each field as its SQLite text (integers in decimal, NULL
// as \N, a backslash, tab, line feed and carriage return of a text field escaped), joined by a tab, every row ended by \n.
const TABLES = [
  ['subraces', ['sub_id', 'city', 'year', 'race']],
  ['race_records', ['id', 'sub_id', 'sex', 'sex_category', 'split_21_1km', 'bib', 'runner', 'split_10km']],
  ['record_flags', ['record_id', 'flag']],
  ['qa_flags', ['record_id', 'flag']],
  ['pending_flags', ['record_id', 'flag']],
  ['edition_meta', ['id', 'city', 'year', 'race', 'race_date', 'official_finishers', 'official_source_type', 'completeness_status', 'timing_basis']],
  ['tiers', ['source_db', 'city', 'year', 'n_records', 'verification_tier', 'weaker_source', 'split_tier']],
  ['excluded_rows', ['city', 'year', 'n']],
  ['course_suspect', ['city', 'year', 'n', 'flagged']],
  ['identity_left_out', ['record_id']],
  ['people', ['pid', 'person_id', 'sex', 'ns_keys', 'in_union']],
  ['links', ['pid', 'db', 'distance', 'record_id', 'confidence', 'keyed', 'variant_union', 'finish_s', 'sex', 'ns_keys']],
];
const xdb = new DatabaseSync(opt.extract, { readOnly: true });
const build = Object.fromEntries(xdb.prepare('SELECT k, v FROM build').all().map((r) => [r.k, r.v]));
log('computing the extract’s content digest');
let extractSha;
{
  const hash = crypto.createHash('sha256');
  const field = (v) => (v === null ? '\\N' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : fail('a REAL in the extract'))
    : typeof v === 'string' ? v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r') : fail(`a field the canonical TSV cannot hold: ${JSON.stringify(v)}`));
  for (const [table, names] of TABLES) {
    const cols = names.join(', ');
    let chunk = [];
    for (const row of xdb.prepare(`SELECT ${cols} FROM ${table} ORDER BY ${cols}`).iterate()) {
      chunk.push(names.map((c) => field(row[c])).join('\t'));
      if (chunk.length >= 20000) { hash.update(`${chunk.join('\n')}\n`); chunk = []; }
    }
    if (chunk.length) hash.update(`${chunk.join('\n')}\n`);
  }
  extractSha = hash.digest('hex');
}
if (build.extract_content_sha256 !== extractSha) fail(`${opt.extract} does not hold the content its build table names (content sha256 ${extractSha})`);
if (!opt.policyOnly && (!pin.links.extract_content_sha256 || extractSha !== pin.links.extract_content_sha256)) fail(`${opt.extract} is not the pinned extract (content sha256 ${extractSha})`);
if (build.links_key !== pin.links.key || build.marathon_release !== release.tag || build.half_key !== pin.half.key) fail('the extract was cut for another release or link build');
const pinned = { ...pin.half.core.members, 'person-ids-v5.1-race_results_linked.parquet': pin.links.assets['person-ids-v5.1-race_results_linked.parquet'],
  'person-ids-v5.1-persons.parquet': pin.links.assets['person-ids-v5.1-persons.parquet'] };
if (Object.entries(pinned).some(([name, d]) => !d || build[`source_sha256:${name}`] !== d)) fail('the extract was cut from other files than the pin names');
// The frozen ns_keys SQL the extract was cut with must be the one analysis/half_source.py holds now. Read from the
// module's text; a module this cannot read fails, as a changed SQL does.
{
  const py = fs.readFileSync(rel('analysis/half_source.py'), 'utf8');
  const quotes = '"'.repeat(3);
  const ns = new RegExp(`^NS_KEYS_SQL = ${quotes}([\\s\\S]*?)${quotes}`, 'm').exec(py)?.[1];
  if (ns === undefined || /[{}]/.test(ns)) fail('cannot read the frozen NS_KEYS_SQL from analysis/half_source.py');
  if (build.ns_keys_sql_sha256 !== sha(Buffer.from(ns, 'utf8'))) fail('the extract was cut with another frozen ns_keys SQL than analysis/half_source.py holds; re-cut it');
}
log('the extract matches its build table and the pin');

// ---------- The policy alone (--policy-only): the record rules, the editions, the tier check ----------
function policyChecks(P) {
  const problems = [];
  const sortedRows = (rows) => rows.map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  if (!same(canon(P.counts), canon(policy.expected))) problems.push(`counts differ from the reviewed ones: ${JSON.stringify(canon(P.counts))} vs ${JSON.stringify(canon(policy.expected))}`);
  if (!same(sortedRows(P.lists.R3), sortedRows(policy.record_rules.R3.subraces))) problems.push('R3 sub-races differ from the frozen list');
  if (!same(sortedRows(P.lists.R4), sortedRows(policy.record_rules.R4.subraces))) problems.push('R4 sub-races differ from the frozen list');
  const EK = ['edition_id', 'city', 'year', 'rule', 'category', 'finishes'];
  const pickRows = (rows) => rows.map((r) => Object.fromEntries(EK.map((k) => [k, r[k]])));
  if (!same(sortedRows(pickRows(P.lists.editions)), sortedRows(pickRows(policy.edition_rules.editions)))) problems.push('the E0, E2–E8 editions differ from the frozen list');
  problems.push(...checkTiers(policy, P).problems);
  const offRoad = new Set(P.editions.filter((r) => r.use_finish && r.group === 'verified').map((r) => r.city));
  for (const l of policy.battery.off_road_labels) if (!offRoad.has(l)) problems.push(`off-road label ${l} is not a verified usable label`);
  for (const r of P.editions) if (r.use_finish && r.group === 'verified' && !(r.city in policy.verified_label_countries)) problems.push(`verified label ${r.city} has no reviewed country`);
  return problems;
}

if (opt.policyOnly) {
  log('applying the record rules and the editions (policy only)');
  const P = applyPolicy(xdb, policy, log);
  const problems = policyChecks(P);
  for (const m of problems) console.error(`  policy: ${m}`);
  console.log(JSON.stringify({ status: problems.length ? 'fail' : 'pass', problems: problems.length, counts: P.counts,
    lists: { R3: P.lists.R3.length, R4: P.lists.R4.length, editions: P.lists.editions.length, e2_dropped: P.lists.e2_dropped.length },
    recomputed: P.recomputed, label_changes: checkTiers(policy, P).label_changes, seconds: Math.round((Date.now() - started) / 1000) }));
  process.exit(problems.length ? 1 : 0);
}
const manifestBytes = fs.readFileSync(path.join(opt.out, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
// The link rule of set B, restated here (analysis/half_pairs.py LINK_RULES; recorded 2026-11-14 before any build): a
// changed rule needs a reviewed recount. Runners: a runner key of the identity file (a v5.1 person id) whose sex is M or
// F, with ns_keys at most 3. Keyed rows: only they pair, and never a variant-union row. Halves: usable, dated, not R7, not
// date-suspect, with no other usable half and no eligible marathon of the person on its date over every linked row of the
// person (any confidence or status). Pairs: the nearest prior half 21 to 112 days before each eligible marathon.
const STRONG = ['high_elite', 'high', 'medium'];
const LINK = { tiers: STRONG, row_tiers: STRONG, ns_keys_max: 3, window_days: [21, 112] };
const CLOSE_MARATHON_DAYS = 13;   // review R6: counted, never excluded
const CONFIDENCES = new Set([...STRONG, 'medium_variant', 'low', 'low_noage', 'low_noage_series', 'low_nosex', 'low_city_pace', 'low_carryover']);
const PERSON_ID = /^p51_[0-9a-f]{16}$/;
for (const [k, v] of Object.entries(LINK)) if (JSON.stringify(manifest.link_rules?.[k]) !== JSON.stringify(v)) fail(`the manifest's link rule ${k} is not this recount's`);
if (!/keyed rows of one runner key/.test(manifest.link_rules?.identity || '') || !/variant_union/.test(manifest.link_rules?.never_pairs || '')) fail("the manifest's link rule does not state the identity and variant-union clauses this recount applies");
if (manifest.links?.extract_content_sha256 !== extractSha) fail('the manifest names another extract than the one read');

// ---------- Comparison ----------
const mismatches = [];
const tally = {};
const SKIP = new Set(['ratio_ci95']);
function compare(file, where, published, mine, tol = () => 0) {
  const t = tally[file] || (tally[file] = { values: 0, mismatches: 0 });
  const miss = (msg) => { t.mismatches++; mismatches.push(`${file} ${where}: ${msg}`); };
  if (Array.isArray(published) || Array.isArray(mine)) {
    if (!Array.isArray(published) || !Array.isArray(mine) || published.length !== mine.length) return miss(`length ${JSON.stringify(published)?.slice(0, 80)} vs ${JSON.stringify(mine)?.slice(0, 80)}`);
    published.forEach((v, i) => compare(file, `${where}[${i}]`, v, mine[i], tol));
    return;
  }
  if (published && typeof published === 'object' && mine && typeof mine === 'object') {
    const keys = new Set([...Object.keys(published), ...Object.keys(mine)].filter((k) => !SKIP.has(k)));
    for (const k of keys) {
      if (!(k in published) || !(k in mine)) { miss(`key ${k} only in the ${k in published ? 'published file' : 'recount'}`); continue; }
      compare(file, where ? `${where}.${k}` : k, published[k], mine[k], tol);
    }
    return;
  }
  t.values++;
  const allowed = tol(where);
  if (typeof published === 'number' && typeof mine === 'number' && allowed > 0) { if (!(Math.abs(published - mine) <= allowed)) miss(`${published} vs ${mine} (tolerance ${allowed})`); }
  else if (!Object.is(published, mine) && !(published === 0 && mine === 0)) miss(`${JSON.stringify(published)} vs ${JSON.stringify(mine)}`);
}
const readHalf = (name) => JSON.parse(fs.readFileSync(path.join(opt.out, name), 'utf8'));
for (const [name, meta] of Object.entries(manifest.files)) {
  const bytes = fs.readFileSync(path.join(opt.out, name));
  if (bytes.length !== meta.bytes || sha(bytes) !== meta.sha256) fail(`${name} differs from its manifest`);
}

// ---------- The half rows: the record rules, the editions, the policy counts ----------
log('applying the record rules and the editions');
const P = applyPolicy(xdb, policy, log);
log(`policy applied: ${P.counts.use_finish.finishes.toLocaleString('en-US')} usable finishes in ${P.counts.use_finish.editions.toLocaleString('en-US')} editions`);
const { set_b: publishedSetB, ...publishedCounts } = manifest.policy.counts;
compare('policy', 'counts (reviewed)', policy.expected, P.counts);
compare('policy', 'counts (manifest)', publishedCounts, P.counts);
const sorted = (rows) => rows.map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort();
const pick = (rows, keys) => rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
compare('policy', 'R3 sub-races', sorted(policy.record_rules.R3.subraces), sorted(P.lists.R3));
compare('policy', 'R4 sub-races', sorted(policy.record_rules.R4.subraces), sorted(P.lists.R4));
const EK = ['edition_id', 'city', 'year', 'rule', 'category', 'finishes'];
compare('policy', 'E0, E2–E8 editions (recomputed screens)', sorted(pick(policy.edition_rules.editions, EK)), sorted(pick(P.lists.editions, EK)));
log(`policy compared: ${P.recomputed.duplicate_groups} duplicate groups, ${P.lists.editions.length} listed editions recomputed`);

// The tier check (policy.tiers.reads), recounted: every problem is a mismatch.
for (const m of policyChecks(P).filter((x) => !/^counts differ|^R3 |^R4 |^the E0, E2/.test(x))) compare('policy', `tier and list checks: ${m}`, 'pass', 'fail');
tally.policy.values++;

// ---------- The marathon side ----------
log('reading the marathon cohort');
const MAR = loadMarathons(ROOT);
// The cohort's eligible finishes, those with a sustained slowdown and the counted editions with a race date
// (half_marathon.EXPECTED's twin), set from the real run on the final inputs.
const REVIEWED_MARATHON = {};
const marathonCounts = { eligible: MAR.n, sustained: MAR.slowdowns, dated_editions: MAR.datedEditions,
  ...(MAR.undated.length || 'undated' in (REVIEWED_MARATHON[MAR.releaseTag] || {}) ? { undated: MAR.undated } : {}) };
if (!opt.trial) compare('policy', 'marathon side (reviewed)', REVIEWED_MARATHON[MAR.releaseTag] || null, marathonCounts);
compare('policy', 'marathon side (manifest)', manifest.marathon.counts, marathonCounts);
if (MAR.manifestSha !== manifest.marathon.cohort_manifest_sha256) fail('the marathon cohort changed after the half build');
// One identity for the half and the marathon analyses: the extract's identity file is the one the cohort was built on.
if (build['source_sha256:identity.parquet'] !== MAR.manifest.inputs?.identity?.sha256) fail('the extract was cut from another identity file than the marathon cohort was built on; re-cut it');
if (manifest.links.identity_sha256 !== build['source_sha256:identity.parquet']) fail('the manifest names another identity file than the extract was cut from');

// ---------- The link tables against their sources, and set B ----------
// One pass over the people, then one over the link rows grouped by person (ordered by pid): every row is joined to
// race_records (half) or the cohort (eligible marathons) and its link-build finish and sex re-verified; each person's
// ns_keys is recounted from its rows whose own confidence is high_elite, high or medium, and its sex against its rows'
// sex; and set B, its R6 signals and the link coverage are rebuilt person by person.
log('rebuilding set B from the link tables');
const findSorted = (arr, v) => { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === v) return m; if (arr[m] < v) lo = m + 1; else hi = m - 1; } return -1; };
const fin = P.fin, ED = P.editions, ROWS = P.rows;
const marOrder = Uint32Array.from({ length: MAR.n }, (_, i) => i).sort((a, b) => MAR.id[a] - MAR.id[b]);
const marIds = Float64Array.from(marOrder, (i) => MAR.id[i]);
const extractProblems = [];
const flagProblem = (what) => extractProblems.push(what);
const joins = {
  half_rows: 0, half_rows_unparsed: 0, half_rows_of_the_marathon_database: 0, half_missing: 0, half_sex: 0, half_finish: 0,
  marathon_rows: 0, marathon_rows_eligible: 0, marathon_finish: 0, marathon_sex: 0,
};
// People.
const personSex = [], personNs = [], personUnion = [];
let badPeople = 0, lastPerson = '';
for (const r of xdb.prepare('SELECT pid, person_id, sex, ns_keys, in_union FROM people ORDER BY pid').iterate()) {
  if (r.pid !== personSex.length + 1 || !PERSON_ID.test(r.person_id) || !(r.person_id > lastPerson) || !['M', 'F'].includes(r.sex) || !Number.isSafeInteger(r.ns_keys) || r.ns_keys < 0
    || ![0, 1].includes(r.in_union)) badPeople++;
  lastPerson = r.person_id;
  personSex.push(r.sex); personNs.push(r.ns_keys); personUnion.push(r.in_union === 1);
}
if (badPeople) flagProblem(`${badPeople} people with a malformed field (number, person id, sex, ns_keys or union) or out of person-id order`);
// Set B, person by person.
const eligiblePerson = (p) => ['M', 'F'].includes(personSex[p]) && personNs[p] <= LINK.ns_keys_max;
const pairs = { h: [], m: [], sex: [], ed: [], city: [], sus: [], verified: [], nsKeys: [], inUnion: [], person: [], mDay: [], mId: [], hEd: [], hLabel: [], hId: [], close: [] };
const pairPeople = new Set(), halfEds = new Set();
const linkedMar = new Uint8Array(MAR.n);
let nsMismatch = 0, sexMismatch = 0, withoutKeyedPair = 0, orphanRows = 0, badRows = 0, persons = 0, keyedWeak = 0;
const [W_LO, W_HI] = LINK.window_days;
function person(p, halves, fulls) {
  persons++;
  // ns_keys: the largest block count over the person's rows of a strong confidence, either distance.
  let ns = -1, keyedHalf = false, keyedFull = false;
  for (const r of [...halves, ...fulls]) if (r.strong) { if (r.ns === null) badRows++; else ns = Math.max(ns, r.ns); }
  for (const r of halves) if (r.keyed && r.i >= 0) keyedHalf = true;
  for (const r of fulls) if (r.keyed) keyedFull = true;
  if (ns !== personNs[p]) nsMismatch++;
  // The person's sex (persons.parquet's, which every pair takes) is the sex of each of its rows that has one.
  if ([...halves, ...fulls].some((r) => ['M', 'F'].includes(r.sex) && r.sex !== personSex[p])) sexMismatch++;
  if (!keyedHalf || !keyedFull) withoutKeyedPair++;
  if (!eligiblePerson(p)) return;
  // Conflicts over every linked row of the person, whatever its confidence or status (the R7 rows included).
  const perDate = new Map();
  for (const r of halves) if (r.k >= 0) { const d = ED[fin.ed[r.k]].day; if (!Number.isNaN(d)) perDate.set(d, (perDate.get(d) || 0) + 1); }
  const marDays = [];
  for (const r of fulls) if (r.j >= 0) marDays.push([MAR.id[r.j], MAR.day[MAR.edition[r.j]]]);
  const marDaySet = new Set(marDays.map(([, d]) => d));
  // The candidate halves: a keyed row that is not a variant-union row, a usable finish.
  const cand = halves.filter((r) => r.pairs && r.k >= 0).map((r) => r.k);
  if (cand.some((k) => !fin.r7[k])) for (const r of fulls) if (r.pairs && r.j >= 0) linkedMar[r.j] = 1;
  for (const r of fulls) {
    if (!r.pairs || r.j < 0) continue;
    const j = r.j, mDay = MAR.day[MAR.edition[j]];
    if (Number.isNaN(mDay)) continue;
    let best = -1, bestDays = Infinity;
    for (const k of cand) {
      const e = ED[fin.ed[k]];
      if (Number.isNaN(e.day) || fin.r7[k] || e.date_suspect || perDate.get(e.day) > 1 || marDaySet.has(e.day)) continue;
      const days = mDay - e.day;
      if (days < W_LO || days > W_HI) continue;
      if (days < bestDays || (days === bestDays && fin.id[k] < fin.id[best])) { best = k; bestDays = days; }
    }
    if (best < 0) continue;
    const med = MAR.editions[MAR.edition[j]], he = ED[fin.ed[best]];
    pairs.h.push(fin.finish[best]); pairs.m.push(MAR.finish[j]); pairs.sex.push(personSex[p]);
    pairs.ed.push(`${med.city} ${med.year}`); pairs.city.push(med.city); pairs.sus.push(MAR.sustained[j] === 1);
    pairs.verified.push(he.group === 'verified'); pairs.nsKeys.push(personNs[p]); pairs.inUnion.push(personUnion[p]);
    pairs.person.push(p); pairs.mDay.push(mDay); pairs.mId.push(MAR.id[j]); pairs.hEd.push(he.edition_id); pairs.hLabel.push(he.city); pairs.hId.push(fin.id[best]);
    // Review R6: another eligible marathon of the person (any linked row) within 13 days of the paired one.
    pairs.close.push(marDays.some(([id, d]) => id !== MAR.id[j] && Math.abs(d - mDay) <= CLOSE_MARATHON_DAYS));
    pairPeople.add(p); halfEds.add(fin.ed[best]);
  }
}
{
  let current = null, halves = [], fulls = [];
  const flush = () => { if (current !== null) person(current, halves, fulls); halves = []; fulls = []; };
  let lastPid = null;
  for (const r of xdb.prepare('SELECT pid, db, distance, record_id, confidence, keyed, variant_union, finish_s, sex, ns_keys FROM links ORDER BY pid, db, distance, record_id').iterate()) {
    const p = r.pid - 1;
    if (!(p >= 0 && p < personSex.length)) { orphanRows++; continue; }
    if (r.pid !== lastPid) { flush(); current = p; lastPid = r.pid; }
    if (!CONFIDENCES.has(r.confidence) || !Number.isSafeInteger(r.record_id) || ![0, 1].includes(r.keyed) || ![0, 1].includes(r.variant_union)
      || !(r.finish_s === null || Number.isSafeInteger(r.finish_s)) || !(r.ns_keys === null || Number.isSafeInteger(r.ns_keys))) badRows++;
    const strong = STRONG.includes(r.confidence), keyed = r.keyed === 1;
    if (keyed && !strong) keyedWeak++;
    const row = { strong, keyed, pairs: keyed && r.variant_union === 0, ns: r.ns_keys, sex: r.sex };
    if (r.db === 'half' && r.distance === 'half') {
      joins.half_rows++;
      const i = findSorted(ROWS.id, r.record_id);
      if (i < 0) { joins.half_missing++; continue; }
      // The link file's sex is the published sex, else the published category's: the sex rule's value wherever it has one.
      const ruleSex = ROWS.sexNames[ROWS.sex[i]];
      if (r.sex !== null && ruleSex !== r.sex) joins.half_sex++;
      // The link build's finish: within 0.5 s of race_records' where it parses; null or not positive where it does not.
      if (!Number.isNaN(ROWS.finish[i])) { if (r.finish_s === null || Math.abs(r.finish_s - ROWS.finish[i]) > 0.5) joins.half_finish++; }
      else { joins.half_rows_unparsed++; if (r.finish_s !== null && r.finish_s > 0) joins.half_finish++; }
      halves.push({ ...row, i, k: findSorted(fin.id, r.record_id) });
    } else if (r.db === 'full' && r.distance === 'marathon') {
      joins.marathon_rows++;
      const at = findSorted(marIds, r.record_id);
      const j = at >= 0 ? marOrder[at] : -1;
      if (j >= 0) {
        joins.marathon_rows_eligible++;
        if (r.finish_s === null || Math.abs(r.finish_s - MAR.finish[j]) > 0.5) joins.marathon_finish++;
        const g = MAR.gender[j];
        if (!(g === 1 ? r.sex === 'M' : g === 2 ? r.sex === 'F' : r.sex === null || !['M', 'F'].includes(r.sex))) joins.marathon_sex++;
      }
      fulls.push({ ...row, j });
    } else if (r.db === 'full' && r.distance === 'half') joins.half_rows_of_the_marathon_database++;   // a half from a mixed marathon list: never usable, never a marathon
    else badRows++;
  }
  flush();
}
if (persons !== personSex.length) flagProblem(`${personSex.length - persons} people without a link row`);
if (orphanRows) flagProblem(`${orphanRows} link rows without a person`);
if (badRows) flagProblem(`${badRows} link rows with a malformed field, or a strong row without ns_keys`);
if (keyedWeak) flagProblem(`${keyedWeak} keyed link rows whose confidence is below medium`);
if (nsMismatch) flagProblem(`${nsMismatch} people whose ns_keys is not the largest over their strong rows`);
if (sexMismatch) flagProblem(`${sexMismatch} people whose sex differs from the sex of one of their link rows`);
if (withoutKeyedPair) flagProblem(`${withoutKeyedPair} people without a keyed half row and a keyed marathon row`);
for (const k of ['half_missing', 'half_sex', 'half_finish', 'marathon_finish', 'marathon_sex']) if (joins[k]) flagProblem(`link rows against their sources: ${joins[k]} ${k.replace(/_/g, ' ')}`);
for (const m of extractProblems) compare('policy', `link tables: ${m}`, 'pass', 'fail');
tally.policy.values++;
const reuse = new Map();
for (const id of pairs.hId) reuse.set(id, (reuse.get(id) || 0) + 1);
const setB = { pairs: pairs.h.length, people: pairPeople.size, marathon_editions: new Set(pairs.ed).size, half_editions: halfEds.size,
  halves_in_two_or_more_pairs: [...reuse.values()].filter((n) => n >= 2).length, pairs_with_a_close_marathon: pairs.close.filter(Boolean).length };
delete pairs.hId; delete pairs.close;
log(`link tables: ${personSex.length.toLocaleString('en-US')} people, ${(joins.half_rows + joins.marathon_rows).toLocaleString('en-US')} link rows re-verified against race_records and the cohort`);
// Link coverage by marathon city: eligible marathon finishes linked, on a keyed row that is not a variant-union row, to
// a runner of set B's rule with such a row on a usable half outside the R7 block (dated or not, date-suspect or not),
// for /methodology.
const coverage = [];
{
  const byCity = new Map();
  for (let j = 0; j < MAR.n; j++) {
    const city = MAR.editions[MAR.edition[j]].city;
    let c = byCity.get(city);
    if (!c) { c = { city, finishes: 0, linked: 0 }; byCity.set(city, c); }
    c.finishes++;
    if (linkedMar[j]) c.linked++;
  }
  coverage.push(...[...byCity.values()].sort((a, b) => (a.city < b.city ? -1 : 1)));
}
compare('policy', 'set B (manifest)', publishedSetB, setB);
// The flagship battery's verified-half members (the policy's `battery`, pre-registered October 30, 2026): the
// weaker-source stamps by edition id, and the reviewed off-road labels, each the label of a verified usable edition.
const BAT = policy.battery;
if (!BAT || !Array.isArray(BAT.off_road_labels) || !BAT.off_road_labels.length || !BAT.off_road_labels.every((l) => typeof l === 'string')) fail('the policy names no off-road labels for the battery');
const battery = { weakerSource: new Set(policy.tiers.weaker_source.map((x) => x.edition_id)), offRoad: new Set(BAT.off_road_labels) };
{
  const verifiedLabels = new Set(P.editions.filter((r) => r.use_finish && r.group === 'verified').map((r) => r.city));
  compare('policy', 'battery: the off-road labels, each a verified usable edition’s label', BAT.off_road_labels, BAT.off_road_labels.filter((l) => verifiedLabels.has(l)));
}
log(`set B: ${setB.pairs.toLocaleString('en-US')} pairs, ${setB.people.toLocaleString('en-US')} people`);

// ---------- The published files ----------
log('rebuilding the published files');
const moduleSha = sha(Buffer.concat(['analysis/half_quality.py', 'analysis/half_policy_lists.py'].map((p) => fs.readFileSync(rel(p)))));
const fieldMine = Fam.field({ fin, editions: ED, policySha: sha(policyBytes), moduleSha, labelCountries: policy.verified_label_countries });
const fieldPub = readHalf('field.json');
compare('field.json', '', fieldPub, fieldMine, (where) => (/^marks\[\d+\]\.expected_minute_before$/.test(where) ? 0.05 : /^marks\[\d+\]\.(ratio|cliff)$/.test(where) ? 1e-4 : 0));
for (const m of fieldPub.marks) {
  tally['field.json'].values++;
  if (!(m.ratio_ci95[0] <= m.ratio && m.ratio <= m.ratio_ci95[1])) { tally['field.json'].mismatches++; mismatches.push(`field.json marks ${m.mark}: the ratio lies outside its interval`); }
}
const chartBytes = fs.readFileSync(rel('public/data/charts/womens-share-by-finish-time.json'));
const womenMine = Fam.women({ fin, editions: ED, marathons: MAR, labels: policy.same_city_labels, chart: JSON.parse(chartBytes), chartSha: sha(chartBytes) });
compare('women.json', '', readHalf('women.json'), womenMine);
const { linked: linkedMine, tool: toolMine } = Fam.linked(pairs, { people: setB.people, halfEditions: setB.half_editions, coverage, ...battery });
compare('linked.json', '', readHalf('linked.json'), linkedMine);
compare('tools/half-to-full.json', '', readHalf('tools/half-to-full.json'), toolMine);
compare('cards.json', '', readHalf('cards.json'), Fam.cards(fieldMine, womenMine, linkedMine));

// The comparison itself must bite: a copy of the recount with three values moved reports exactly three mismatches.
{
  const probe = JSON.parse(JSON.stringify(linkedMine));
  probe.windows.all[0].n += 1;
  probe.overall.under_double_plus_min['0'] += 1e-10;
  delete probe.sexes.strata;
  compare('self-test', '', linkedMine, probe);
  if (tally['self-test'].mismatches !== 3) fail(`the comparison missed a planted difference (${tally['self-test'].mismatches} of 3)`);
  mismatches.splice(mismatches.length - 3, 3);
  delete tally['self-test'];
}

// ---------- The receipt ----------
const total = Object.values(tally).reduce((a, t) => a + t.mismatches, 0);
const values = Object.values(tally).reduce((a, t) => a + t.values, 0);
if (total !== mismatches.length) fail('the mismatch tally does not add up');
// Every repository module this recount ran (the recount script and its helpers), bound by sha.
const scripts = Object.fromEntries(Object.keys(require.cache).filter((f) => f.startsWith(path.join(ROOT, 'scripts') + path.sep)).map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), sha(fs.readFileSync(f))]).sort(([a], [b]) => (a < b ? -1 : 1)));
const today = new Date();
const receipt = {
  schema_version: 2, family: 'half-source-recount',
  date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  status: total === 0 ? 'pass' : 'fail', mismatches: total, values_checked: values,
  manifest_sha256: sha(manifestBytes), verify_half_source_sha256: scripts['scripts/verify-half-source.cjs'], recount_scripts: scripts,
  extract_content_sha256: extractSha, identity_sha256: build['source_sha256:identity.parquet'], tier_table_sha256: build['source_sha256:EDITION-TIERS.csv'],
  cohort_manifest_sha256: MAR.manifestSha, policy_sha256: sha(policyBytes), marathon_release: release.tag,
  counts: { ...P.counts, set_b: setB, marathon: marathonCounts },
  // The link rows re-verified row by row: every half row against race_records, every eligible marathon row against the
  // cohort; names and ages are not in the extract, so ns_keys is bound by the digest and the source job's re-cut.
  links: { people: personSex.length, joins },
  row_rule: P.recomputed.row_rule, e2_decisions_dropped: P.lists.e2_dropped.length, label_changes: checkTiers(policy, P).label_changes,
  files: Object.fromEntries(Object.keys(manifest.files).sort().map((f) => [f, tally[f] || { values: 0, mismatches: 0 }])),
  policy_checks: tally.policy,
  python_only: ['field.json marks[].ratio_ci95: the 200-draw whole-edition bootstrap (numpy generator); the recount checks each published ratio lies inside it'],
  tolerances: { 'field.json marks[].expected_minute_before': 0.05, 'field.json marks[].ratio': 1e-4, 'field.json marks[].cliff': 1e-4, other: 'exact' },
};
if (!receipt.verify_half_source_sha256) fail('the recount script is not in its own module list');
if (opt.write) {
  const out = rel('docs/evidence/half/source-recount.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 1)}\n`);
  log(`wrote ${path.relative(ROOT, out)}`);
}
for (const m of mismatches.slice(0, 80)) console.error(`  mismatch: ${m}`);
if (mismatches.length > 80) console.error(`  … and ${mismatches.length - 80} more`);
console.log(JSON.stringify({ status: receipt.status, mismatches: total, values_checked: values, files: receipt.files, policy_checks: receipt.policy_checks, trial: opt.trial, seconds: Math.round((Date.now() - started) / 1000) }));
process.exit(total === 0 ? 0 : 1);
