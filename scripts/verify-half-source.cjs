#!/usr/bin/env node
'use strict';
// Layer 2 of the half-marathon verification (docs/HALF_MARATHON.md; spec 1.6): an independent Node recount of every
// published half value from the record-level sources (the owner's public CC BY 4.0 releases, fetched anonymously by
// analysis/download_half.py), run by whoever rebuilds the half data and by the Half marathon workflow's `source` job. It
// never imports the Python builders and shares only their inputs:
//
//   - the half snapshot and the links extract, opened read-only with node:sqlite and checked against the pin
//     (analysis/half-release.json, schema 3): the snapshot's sha256 (a non-empty -wal beside it is refused), the
//     extract's canonical content digest and link build;
//   - the stamp reference (half-dataset-20261029-2157, csv-edition_meta.csv.zst) and the release's own
//     csv-edition_meta.csv.zst, both sha256 pinned: the recount checks the snapshot's stamps against the frozen list, the
//     reference, the withdrawn stamps, never_stamp and that CSV (verified = stamped in the snapshot's own edition_meta);
//   - the frozen policy (analysis/half-policy-<stamp>.json), whose rule text must equal this recount's own constants;
//   - the marathon side from the public runner shards and the weather evidence (scripts/half/marathon.cjs).
//
// It reapplies R1–R7 with its own parser, sub-race pattern and duplicate key (scripts/half/policy.cjs), recomputes the
// edition screens to compare with the frozen lists, removes the frozen editions, asserts every policy count, rebuilds
// set B and every published file (scripts/half/families.cjs) and compares them value for value: integers and shares
// exactly, quantiles exactly at their published rounding, the round-mark curve within 0.05 (its ratio and cliff within
// 1e-4). The whole-edition bootstrap of the round-mark intervals is Python-only; the recount checks the published ratio
// lies inside it. It then writes the receipt docs/evidence/half/source-recount.json (a date, the bound digests, the
// counts it checked and the mismatches; no rows), which scripts/verify-half.cjs requires in CI.
//
//   npm run verify:half-source -- [--half platform_half.sqlite] [--links links-v4.sqlite] [--stamp-reference FILE]
//                                 [--edition-meta FILE] [--no-write] [--policy-only]
//
// Defaults: $PACE_HALF_DIR/platform_half.sqlite, $PACE_HALF_DIR/links-v4.sqlite,
// $PACE_HALF_DIR/<reference tag>/csv-edition_meta.csv.zst and $PACE_HALF_DIR/csv-edition_meta.csv.zst (PACE_HALF_DIR
// defaults to ~/data/half-1904). `--policy-only` stops after the policy and the stamp check (a new snapshot's review,
// before any extract or figure exists): it never writes the receipt. Measured 2026-10-31 on half-dataset-20261030-1904
// with the v4 links extract: 126 s and a peak of 1.8 GB resident for 7.67 million records and 2.45 million link rows
// (typed arrays; the snapshot's sha256 is read once, the extract's digest once).
//
// The links extract (analysis/half_links_extract.py): its canonical content digest over every column; then every person
// (tier, sex, ns_keys, k and its block: one k per block, no more of the extract's people in a block than k, every high
// person alone in its block) and every link row, joined to the snapshot (a half: its id inside the coverage boundary,
// city, year, published sex, and the finish within 0.5 s where the snapshot's parses, except the re-timed editions) or to
// the runner shards (an eligible marathon: city, year, finish within 0.5 s, recorded sex mapped). Names and ages are not
// in the extract, so their join checks run only where it is cut; its digest binds them, and the source job re-cuts it
// from the public parquet files. Each person's ns_keys is recounted as the largest block count over the rows that may
// pair (lead rulings L.4); k is evidence only and never decides a pair.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (/SQLite|[Zz]std/.test(String(warning)) ? undefined : emitWarning.call(process, warning, ...rest));
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const D = require('./half/derive.cjs');
const { applyPolicy, dateDay, readCorrection, checkStamps, linkPartial } = require('./half/policy.cjs');
const { loadMarathons } = require('./half/marathon.cjs');
const Fam = require('./half/families.cjs');

const started = Date.now();
const log = (message) => console.log(`[${Math.round((Date.now() - started) / 1000)} s] ${message}`);
const argv = process.argv.slice(2);
const halfDir = process.env.PACE_HALF_DIR || path.join(os.homedir(), 'data', 'half-1904');
const pinFor = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'analysis', 'half-release.json'), 'utf8'));
const REF = pinFor.stamps.reference;
const opt = { half: path.join(halfDir, pinFor.half.sqlite), links: path.join(halfDir, pinFor.links.extract),
  reference: path.join(halfDir, REF.tag, REF.asset), editionMeta: path.join(halfDir, 'csv-edition_meta.csv.zst'), write: true, policyOnly: false };
const USAGE = 'Usage: node scripts/verify-half-source.cjs [--half platform_half.sqlite] [--links links-v4.sqlite] [--stamp-reference FILE] [--edition-meta FILE] [--no-write] [--policy-only]';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--half' && argv[i + 1]) opt.half = path.resolve(argv[++i]);
  else if (argv[i] === '--links' && argv[i + 1]) opt.links = path.resolve(argv[++i]);
  else if (argv[i] === '--stamp-reference' && argv[i + 1]) opt.reference = path.resolve(argv[++i]);
  else if (argv[i] === '--edition-meta' && argv[i + 1]) opt.editionMeta = path.resolve(argv[++i]);
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
if (pin.schema_version !== 3) fail(`the pin is schema ${pin.schema_version}; this recount reads schema 3`);
if (pin.marathon_release !== release.tag) fail('the pin binds another marathon release');
if (policy.tag !== pin.half.key || policy.schema_version !== 2) fail('the policy is not the pinned snapshot’s (schema 2, keyed by half.key)');
if (pin.links.applies_to !== pin.half.key) fail('the pinned link build does not apply to the pinned snapshot');
const PS = policy.stamps;
if (!PS || ['tag', 'asset', 'sha256', 'readme_sha256'].some((k) => PS.reference[k] !== REF[k]) || PS.rule !== pin.stamps.rule) fail('the pin and the policy name different stamp references or rules');
if (pin.half.assets[PS.edition_meta_csv.asset] !== PS.edition_meta_csv.sha256) fail('the pin and the policy name different edition_meta CSVs');
const LE = policy.link_editions;
if (!LE || LE.link_build !== pin.links.key || LE.half_max_record_id !== pin.links.coverage.half_max_record_id) fail('the policy’s link-build editions name another link build or boundary than the pin');
const sources = [[opt.half, '--half'], [opt.reference, '--stamp-reference'], [opt.editionMeta, '--edition-meta'], ...(opt.policyOnly ? [] : [[opt.links, '--links']])];
for (const [p, what] of sources) {
  if (!fs.existsSync(p)) fail(`${what}: missing ${p}`);
  if (inside(p)) fail(`${what}: ${p} is inside the repository; record-level sources stay outside it`);
}
if (path.basename(opt.half) !== pin.half.sqlite || (!opt.policyOnly && path.basename(opt.links) !== pin.links.extract)) fail('the sources must be the pinned files');
{
  const wal = `${opt.half}-wal`;
  if (fs.existsSync(wal) && fs.statSync(wal).size > 0) fail(`${wal} is not empty: the snapshot has uncommitted pages beside it`);
}

function fileSha(p) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.allocUnsafe(1 << 23);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
log('checking the half snapshot’s sha256');
const halfSha = fileSha(opt.half);
if (halfSha !== pin.half.sqlite_sha256) fail(`${opt.half} is not the pinned snapshot (sha256 ${halfSha})`);
const referenceBytes = fs.readFileSync(opt.reference), referenceSha = sha(referenceBytes);
if (referenceSha !== REF.sha256) fail(`${opt.reference} is not the pinned stamp reference (sha256 ${referenceSha})`);
const editionMetaBytes = fs.readFileSync(opt.editionMeta), editionMetaSha = sha(editionMetaBytes);
if (editionMetaSha !== PS.edition_meta_csv.sha256) fail(`${opt.editionMeta} is not the pinned edition_meta CSV (sha256 ${editionMetaSha})`);
const reference = readCorrection(referenceBytes), releaseMeta = readCorrection(editionMetaBytes);
log('the snapshot, the stamp reference and the edition_meta CSV match the pin');

// ---------- The policy alone (--policy-only): R1–R7, the editions, the stamp check, the link-build editions ----------
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
  problems.push(...checkStamps(hdb, policy, P, reference, releaseMeta));
  if (!same(canon(linkPartial(P, LE.half_max_record_id)), canon(LE.link_partial))) problems.push(`the link-partial editions differ: ${JSON.stringify(linkPartial(P, LE.half_max_record_id))}`);
  const usable = new Map(P.editions.filter((r) => r.use_finish).map((r) => [r.edition_id, r]));
  for (const x of LE.retimed) { const r = usable.get(x.edition_id); if (!r || r.city !== x.city || r.year !== x.year) problems.push(`re-timed edition ${x.edition_id} is not a usable edition`); }
  const offRoad = new Set(P.editions.filter((r) => r.use_finish && r.group === 'verified').map((r) => r.city));
  for (const l of policy.battery.off_road_labels) if (!offRoad.has(l)) problems.push(`off-road label ${l} is not a verified usable label`);
  return problems;
}

const hdb = new DatabaseSync(opt.half, { readOnly: true });
if (opt.policyOnly) {
  log('applying R1–R7 and the editions (policy only)');
  const P = applyPolicy(hdb, policy, log);
  const problems = policyChecks(P);
  for (const m of problems) console.error(`  policy: ${m}`);
  console.log(JSON.stringify({ status: problems.length ? 'fail' : 'pass', problems: problems.length, counts: P.counts,
    lists: { R3: P.lists.R3.length, R4: P.lists.R4.length, editions: P.lists.editions.length, link_partial: linkPartial(P, LE.half_max_record_id) },
    duplicate_groups: P.recomputed.duplicate_groups, seconds: Math.round((Date.now() - started) / 1000) }));
  process.exit(problems.length ? 1 : 0);
}
const manifestBytes = fs.readFileSync(rel('public/data/half/manifest.json'));
const manifest = JSON.parse(manifestBytes);
// The link rule of set B, restated here (analysis/half_pairs.py LINK_RULES; lead rulings L, October 31, 2026): a changed
// rule needs a reviewed recount. People: a v4 person id whose tier is high_elite, high or medium, with ns_keys at most 3.
// Rows that may pair: their own confidence high_elite, high or medium. Halves: usable, dated, not R7, not date-suspect,
// not in a link edition, with no other usable half and no eligible marathon of the person on its date over every linked
// row of the person (any confidence). Pairs: the nearest prior half 21 to 112 days before each eligible marathon.
const STRONG = ['high_elite', 'high', 'medium'];
const LINK = { tiers: STRONG, row_tiers: STRONG, ns_keys_max: 3, window_days: [21, 112] };
const CLOSE_MARATHON_DAYS = 13;   // review R6: counted, never excluded
const CONFIDENCES = new Set([...STRONG, 'low', 'low_noage', 'low_noage_series', 'low_nosex']);
const PERSON_ID = /^p4_[0-9a-f]{16}$/;
for (const [k, v] of Object.entries(LINK)) if (JSON.stringify(manifest.link_rules?.[k]) !== JSON.stringify(v)) fail(`the manifest's link rule ${k} is not this recount's`);
// The links extract: its canonical content digest (analysis/half_links_extract.py docstring), computed here: each table's
// rows ordered by every column in declared order, each field as its SQLite text (integers in decimal, NULL as \N), joined
// by a tab, every row ended by \n.
const PEOPLE_COLS = ['person_id', 'sex', 'tier', 'ns_keys', 'key_type', 'in_union', 'k', 'k_block'];
const LINK_COLS = ['person_id', 'db', 'record_id', 'confidence', 'finish_s', 'sex', 'city', 'year', 'ns_keys'];
const ldb = new DatabaseSync(opt.links, { readOnly: true });
const build = Object.fromEntries(ldb.prepare('SELECT k, v FROM build').all().map((r) => [r.k, r.v]));
let linksSha;
{
  const hash = crypto.createHash('sha256');
  const field = (v) => (v === null ? '\\N' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : fail('a REAL in the extract'))
    : typeof v === 'string' && !/[\t\n\\]/.test(v) ? v : fail(`a field the canonical TSV cannot hold: ${JSON.stringify(v)}`));
  for (const [table, names] of [['people', PEOPLE_COLS], ['links', LINK_COLS]]) {
    const cols = names.join(', ');
    for (const row of ldb.prepare(`SELECT ${cols} FROM ${table} ORDER BY ${cols}`).iterate()) hash.update(`${names.map((c) => field(row[c])).join('\t')}\n`);
  }
  linksSha = hash.digest('hex');
}
if (!pin.links.extract_content_sha256 || linksSha !== pin.links.extract_content_sha256 || build.extract_content_sha256 !== linksSha) fail(`${opt.links} is not the pinned extract (content sha256 ${linksSha})`);
if (build.links_key !== pin.links.key || build.applies_to !== pin.links.applies_to || build.marathon_release !== release.tag || build.half_key !== pin.half.key) fail('the extract was cut from another link build');
if (build[`source_sha256:${pin.half.sqlite}`] !== pin.half.sqlite_sha256 || Object.entries(pin.links.assets).some(([name, d]) => build[`source_sha256:${name}`] !== d)) fail('the extract was cut from other sources than the pin names');
log('the links extract matches the pin');

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
const readHalf = (name) => JSON.parse(fs.readFileSync(rel(`public/data/half/${name}`), 'utf8'));
for (const [name, meta] of Object.entries(manifest.files)) {
  const bytes = fs.readFileSync(rel(`public/data/half/${name}`));
  if (bytes.length !== meta.bytes || sha(bytes) !== meta.sha256) fail(`public/data/half/${name} differs from its manifest`);
}

// ---------- The half snapshot: R1–R7, the editions, the policy counts ----------
log('applying R1–R7 and the editions');
const P = applyPolicy(hdb, policy, log);
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

// The stamp check (policy.stamps.reads) and the link-build editions, recounted: every problem is a mismatch.
for (const m of policyChecks(P).filter((x) => !/^counts differ|^R3 |^R4 |^the E0, E2/.test(x))) compare('policy', `stamp and link-build checks: ${m}`, 'pass', 'fail');
tally.policy.values++;

// ---------- The marathon side ----------
log('reading the runner shards');
const MAR = loadMarathons(ROOT);
const REVIEWED_MARATHON = { 'private-export-20261021-1050': { eligible: 4108749, sustained: 1266780, dated_editions: 215 } };
compare('policy', 'marathon side', REVIEWED_MARATHON[MAR.releaseTag] || null, { eligible: MAR.n, sustained: MAR.slowdowns, dated_editions: MAR.datedEditions });
if (MAR.manifestSha !== manifest.marathon.runner_manifest_sha256) fail('the runner manifest changed after the half build');
if (MAR.weatherSha !== manifest.marathon.weather_evidence_sha256) fail('the weather evidence changed after the half build');

// ---------- The links extract against its sources, and set B ----------
// One pass over the extract's people, then one over its link rows grouped by person (ordered by person_id): every row is
// joined to the snapshot (half) or the runner shards (eligible marathons) and its link-build finish, sex, city and year
// re-verified (review R3); each person's ns_keys is recounted from the rows that may pair (lead rulings L.4); the k blocks
// are checked (review R17); and set B, its R6 signals and the link coverage are rebuilt person by person.
log('rebuilding set B from the links extract');
const findSorted = (arr, v) => { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === v) return m; if (arr[m] < v) lo = m + 1; else hi = m - 1; } return -1; };
const fin = P.fin, ED = P.editions, ROWS = P.rows;
const boundary = pin.links.coverage.half_max_record_id;
const linkEditionIds = new Set([...LE.link_partial, ...LE.retimed].map((x) => x.edition_id));
const retimedIds = new Set(LE.retimed.map((x) => x.edition_id));
const marOrder = Uint32Array.from({ length: MAR.n }, (_, i) => i).sort((a, b) => MAR.id[a] - MAR.id[b]);
const marIds = Float64Array.from(marOrder, (i) => MAR.id[i]);
// The extract's own checks (problems are mismatches), and the join counts for the receipt.
const extractProblems = [];
const flagProblem = (what) => extractProblems.push(what);
const joins = {
  half_rows: 0, half_rows_retimed: 0, half_rows_unparsed: 0, half_sex_x_null: 0,
  half_missing: 0, half_beyond_boundary: 0, half_city_year: 0, half_sex: 0, half_finish: 0,
  marathon_rows: 0, marathon_rows_eligible: 0, marathon_city_year: 0, marathon_finish: 0, marathon_sex: 0,
};
// People.
const people = new Map();
const personSex = [], personNs = [], personUnion = [], personTier = [];
const blocks = new Map();
let highNotAlone = 0, badPeople = 0;
for (const r of ldb.prepare('SELECT person_id, sex, tier, ns_keys, key_type, in_union, k, k_block FROM people').iterate()) {
  if (!PERSON_ID.test(r.person_id) || !['M', 'F'].includes(r.sex) || !STRONG.includes(r.tier) || !Number.isSafeInteger(r.ns_keys) || r.ns_keys < 0
    || !['yob', 'age_bin', 'mixed', 'none'].includes(r.key_type) || ![0, 1].includes(r.in_union) || !Number.isSafeInteger(r.k) || r.k < 1 || !/^[0-9a-f]{16}$/.test(r.k_block || '')) badPeople++;
  people.set(r.person_id, personSex.length);
  personSex.push(r.sex); personNs.push(r.ns_keys); personUnion.push(r.in_union === 1); personTier.push(r.tier);
  const b = blocks.get(r.k_block);
  if (!b) blocks.set(r.k_block, { k: r.k, n: 1, ks: 1 });
  else { b.n++; if (b.k !== r.k) b.ks++; }
  if (r.tier === 'high' && r.k !== 1) highNotAlone++;
}
if (badPeople) flagProblem(`${badPeople} people with a malformed field (person id, sex, tier, ns_keys, key type, union, k or block)`);
// Review R17: every person of a block carries one k, and a block holds no more of the extract's people than its k (each of
// them has a row attached with an age, so each counts in k). The producer's high tier is given only to a person alone in
// its block (spec 4.3), so a high person with k other than 1 marks a block the rebuild cuts differently.
let blocksTwoK = 0, blocksOverK = 0;
for (const b of blocks.values()) { if (b.ks > 1) blocksTwoK++; if (b.n > b.k) blocksOverK++; }
if (blocksTwoK) flagProblem(`${blocksTwoK} k blocks whose people carry two values of k`);
if (blocksOverK) flagProblem(`${blocksOverK} k blocks holding more of the extract's people than k`);
if (highNotAlone) flagProblem(`${highNotAlone} high people whose rebuilt k is not 1`);
// Set B, person by person.
const eligiblePerson = (p) => STRONG.includes(personTier[p]) && personNs[p] <= LINK.ns_keys_max;
const pairs = { h: [], m: [], sex: [], ed: [], city: [], sus: [], verified: [], nsKeys: [], inUnion: [], person: [], mDay: [], mId: [], hEd: [], hLabel: [], hId: [], close: [] };
const pairPeople = new Set(), halfEds = new Set();
const linkedMar = new Uint8Array(MAR.n);
let nsMismatch = 0, withoutStrongPair = 0, orphanRows = 0, badRows = 0, persons = 0;
const [W_LO, W_HI] = LINK.window_days;
function person(p, halves, fulls) {
  persons++;
  // ns_keys: the largest block count over the rows that may pair (lead rulings L.4).
  let ns = -1, strongHalf = false, strongFull = false;
  for (const r of [...halves, ...fulls]) if (r.strong) { if (r.ns === null) badRows++; else ns = Math.max(ns, r.ns); }
  for (const r of halves) if (r.strong) strongHalf = true;
  for (const r of fulls) if (r.strong) strongFull = true;
  if (ns !== personNs[p]) nsMismatch++;
  if (!strongHalf || !strongFull) withoutStrongPair++;
  if (!eligiblePerson(p)) return;
  // Conflicts over every linked row of the person, whatever its confidence (the R7 rows and the link editions included).
  const perDate = new Map();
  for (const r of halves) if (r.k >= 0) { const d = ED[fin.ed[r.k]].day; if (!Number.isNaN(d)) perDate.set(d, (perDate.get(d) || 0) + 1); }
  const marDays = [];
  for (const r of fulls) if (r.j >= 0) marDays.push([MAR.id[r.j], MAR.day[MAR.edition[r.j]]]);
  const marDaySet = new Set(marDays.map(([, d]) => d));
  // The halves that may pair: own confidence strong, a usable finish, not in a link edition.
  const cand = halves.filter((r) => r.strong && r.k >= 0 && !linkEditionIds.has(ED[fin.ed[r.k]].edition_id)).map((r) => r.k);
  if (cand.some((k) => !fin.r7[k])) for (const r of fulls) if (r.strong && r.j >= 0) linkedMar[r.j] = 1;
  for (const r of fulls) {
    if (!r.strong || r.j < 0) continue;
    const j = r.j, mDay = MAR.day[MAR.edition[j]];
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
  let lastId = null;
  for (const r of ldb.prepare('SELECT person_id, db, record_id, confidence, finish_s, sex, city, year, ns_keys FROM links ORDER BY person_id, db, record_id').iterate()) {
    const p = people.get(r.person_id);
    if (p === undefined) { orphanRows++; continue; }
    if (r.person_id !== lastId) { flush(); current = p; lastId = r.person_id; }
    if (!CONFIDENCES.has(r.confidence) || !Number.isSafeInteger(r.record_id) || typeof r.city !== 'string' || !Number.isSafeInteger(r.year)
      || !(r.finish_s === null || Number.isSafeInteger(r.finish_s)) || !(r.ns_keys === null || Number.isSafeInteger(r.ns_keys))) badRows++;
    const strong = STRONG.includes(r.confidence);
    if (r.db === 'half') {
      joins.half_rows++;
      if (r.record_id > boundary) joins.half_beyond_boundary++;
      const i = findSorted(ROWS.id, r.record_id);
      if (i < 0) { joins.half_missing++; continue; }
      const e = ED[ROWS.ed[i]];
      if (e.city !== r.city || e.year !== r.year) joins.half_city_year++;
      const snapSex = ROWS.sexNames[ROWS.sex[i]];
      if (snapSex === 'X' && r.sex === null) joins.half_sex_x_null++;
      else if (snapSex !== r.sex) joins.half_sex++;
      // The link build's finish: within 0.5 s of this snapshot's where it parses; null or negative where it does not (the
      // link build read a few negative texts as negative seconds; the builders give them no finish); unchecked on the
      // re-timed editions, whose times changed after the link build (policy link_editions.retimed).
      if (retimedIds.has(e.edition_id)) joins.half_rows_retimed++;
      else if (!Number.isNaN(ROWS.finish[i])) { if (r.finish_s === null || Math.abs(r.finish_s - ROWS.finish[i]) > 0.5) joins.half_finish++; }
      else { joins.half_rows_unparsed++; if (r.finish_s !== null && r.finish_s >= 0) joins.half_finish++; }
      halves.push({ strong, ns: r.ns_keys, k: findSorted(fin.id, r.record_id) });
    } else if (r.db === 'full') {
      joins.marathon_rows++;
      const at = findSorted(marIds, r.record_id);
      const j = at >= 0 ? marOrder[at] : -1;
      if (j >= 0) {
        joins.marathon_rows_eligible++;
        const med = MAR.editions[MAR.edition[j]];
        if (med.city !== r.city || med.year !== r.year) joins.marathon_city_year++;
        if (r.finish_s === null || Math.abs(r.finish_s - MAR.finish[j]) > 0.5) joins.marathon_finish++;
        const g = MAR.gender[j];
        if (!(g === 1 ? r.sex === 'M' : g === 2 ? r.sex === 'F' : r.sex === null || !['M', 'F'].includes(r.sex))) joins.marathon_sex++;
      }
      fulls.push({ strong, ns: r.ns_keys, j });
    } else badRows++;
  }
  flush();
}
if (persons !== people.size) flagProblem(`${people.size - persons} people without a link row`);
if (orphanRows) flagProblem(`${orphanRows} link rows without a person`);
if (badRows) flagProblem(`${badRows} link rows with a malformed field, or a row that may pair without ns_keys`);
if (nsMismatch) flagProblem(`${nsMismatch} people whose ns_keys is not the largest over their rows that may pair`);
if (withoutStrongPair) flagProblem(`${withoutStrongPair} people without a half and a marathon row that may pair`);
for (const k of ['half_missing', 'half_beyond_boundary', 'half_city_year', 'half_sex', 'half_finish', 'marathon_city_year', 'marathon_finish', 'marathon_sex']) if (joins[k]) flagProblem(`link rows against their sources: ${joins[k]} ${k.replace(/_/g, ' ')}`);
for (const m of extractProblems) compare('policy', `links extract: ${m}`, 'pass', 'fail');
tally.policy.values++;
const reuse = new Map();
for (const id of pairs.hId) reuse.set(id, (reuse.get(id) || 0) + 1);
const setB = { pairs: pairs.h.length, people: pairPeople.size, marathon_editions: new Set(pairs.ed).size, half_editions: halfEds.size,
  halves_in_two_or_more_pairs: [...reuse.values()].filter((n) => n >= 2).length, pairs_with_a_close_marathon: pairs.close.filter(Boolean).length };
delete pairs.hId; delete pairs.close;
log(`links extract: ${people.size.toLocaleString('en-US')} people, ${(joins.half_rows + joins.marathon_rows).toLocaleString('en-US')} link rows re-verified against the snapshot and the shards`);
// Link coverage by marathon city: eligible marathon finishes linked, by a row that may pair, to a person of set B's rule
// with at least one half that may pair (any date, not R7, not in a link edition), for /methodology.
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
const battery = { weakerSource: new Set(PS.weaker_source.map((x) => x.edition_id)), offRoad: new Set(BAT.off_road_labels) };
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
  schema_version: 1, family: 'half-source-recount',
  date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  status: total === 0 ? 'pass' : 'fail', mismatches: total, values_checked: values,
  manifest_sha256: sha(manifestBytes), verify_half_source_sha256: scripts['scripts/verify-half-source.cjs'], recount_scripts: scripts,
  half_sqlite_sha256: halfSha, links_extract_content_sha256: linksSha, stamp_reference_sha256: referenceSha, edition_meta_csv_sha256: editionMetaSha, runner_manifest_sha256: MAR.manifestSha,
  policy_sha256: sha(policyBytes), weather_evidence_sha256: MAR.weatherSha, marathon_release: release.tag,
  counts: { ...P.counts, set_b: setB, marathon: { eligible: MAR.n, sustained: MAR.slowdowns, dated_editions: MAR.datedEditions } },
  // The links extract re-verified row by row (review R3): every half row against the snapshot, every eligible marathon row
  // against the runner shards; names and ages are not in the extract, so they are checked only when it is cut (the
  // digest binds them, and the source job re-cuts it from the public parquet files).
  links: { people: people.size, k_blocks: blocks.size, joins },
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
console.log(JSON.stringify({ status: receipt.status, mismatches: total, values_checked: values, files: receipt.files, policy_checks: receipt.policy_checks, seconds: Math.round((Date.now() - started) / 1000) }));
process.exit(total === 0 ? 0 : 1);
