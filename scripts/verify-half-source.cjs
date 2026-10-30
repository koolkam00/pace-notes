#!/usr/bin/env node
'use strict';
// Layer 2 of the half-marathon verification (docs/HALF_MARATHON.md; spec 1.6): an independent Node recount of every
// published half value from the record-level sources (the owner's public CC BY 4.0 releases, fetched anonymously by
// analysis/download_half.py), run by whoever rebuilds the half data and by the Half marathon workflow's `source` job. It
// never imports the Python builders and shares only their inputs:
//
//   - the half snapshot and the links extract, opened read-only with node:sqlite and checked against the pin
//     (analysis/half-release.json): the snapshot's sha256, the extract's canonical content digest and link build;
//   - the corrected edition metadata (half-dataset-20261029-2157, csv-edition_meta.csv.zst; its sha256 pinned): the
//     recount rederives the withdrawn stamps from it and compares them with the frozen list (verified = stamped in both);
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
//   npm run verify:half-source -- [--half platform_half.sqlite] [--links links-slim.sqlite] [--corrected-meta FILE] [--no-write]
//
// Defaults: $PACE_HALF_DIR/platform_half.sqlite, $PACE_HALF_DIR/links-slim.sqlite and
// $PACE_HALF_DIR/<correction tag>/csv-edition_meta.csv.zst (PACE_HALF_DIR defaults to ~/data/half-1133). About 80 s and under 1 GB of memory (typed arrays for 6.9 million records and 4.1 million marathon
// finishes); the sha256 of the 3.7 GB snapshot is read once.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (/SQLite|[Zz]std/.test(String(warning)) ? undefined : emitWarning.call(process, warning, ...rest));
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const D = require('./half/derive.cjs');
const { applyPolicy, dateDay, readCorrection, correctionReason, trimText } = require('./half/policy.cjs');
const { loadMarathons } = require('./half/marathon.cjs');
const Fam = require('./half/families.cjs');

const started = Date.now();
const log = (message) => console.log(`[${Math.round((Date.now() - started) / 1000)} s] ${message}`);
const argv = process.argv.slice(2);
const halfDir = process.env.PACE_HALF_DIR || path.join(os.homedir(), 'data', 'half-1133');
const pinFor = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'analysis', 'half-release.json'), 'utf8'));
const opt = { half: path.join(halfDir, 'platform_half.sqlite'), links: path.join(halfDir, 'links-slim.sqlite'),
  corrected: path.join(halfDir, pinFor.metadata_correction.tag, pinFor.metadata_correction.asset), write: true };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--half' && argv[i + 1]) opt.half = path.resolve(argv[++i]);
  else if (argv[i] === '--links' && argv[i + 1]) opt.links = path.resolve(argv[++i]);
  else if (argv[i] === '--corrected-meta' && argv[i + 1]) opt.corrected = path.resolve(argv[++i]);
  else if (argv[i] === '--no-write') opt.write = false;
  else throw new Error('Usage: node scripts/verify-half-source.cjs [--half platform_half.sqlite] [--links links-slim.sqlite] [--corrected-meta FILE] [--no-write]');
}
const rel = (p) => path.join(ROOT, p);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(rel(p), 'utf8'));
const inside = (p) => !path.relative(ROOT, path.resolve(p)).startsWith('..');
const fail = (message) => { console.error(`verify-half-source: ${message}`); process.exit(1); };

// ---------- Inputs and their pins ----------
const pin = readJson('analysis/half-release.json');
const release = readJson('analysis/release.json');
const manifestBytes = fs.readFileSync(rel('public/data/half/manifest.json'));
const manifest = JSON.parse(manifestBytes);
const policyBytes = fs.readFileSync(rel(pin.policy));
const policy = JSON.parse(policyBytes);
if (pin.marathon_release !== release.tag) fail('the pin binds another marathon release');
if (policy.tag !== pin.half.private_tag) fail('the policy is not the pinned snapshot’s');
const MC = pin.metadata_correction, SC = policy.stamp_correction;
if (!MC || !SC || MC.tag !== SC.tag || MC.asset !== SC.asset || MC.sha256 !== SC.sha256 || MC.applied !== SC.applied) fail('the pin and the policy name different stamp corrections');
for (const [p, what] of [[opt.half, '--half'], [opt.links, '--links'], [opt.corrected, '--corrected-meta']]) {
  if (!fs.existsSync(p)) fail(`${what}: missing ${p}`);
  if (inside(p)) fail(`${what}: ${p} is inside the repository; record-level sources stay outside it`);
}
if (path.basename(opt.half) !== pin.half.sqlite || path.basename(opt.links) !== pin.links.extract) fail('the sources must be the pinned files');

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

// The links extract: its canonical content digest (analysis/half_links_extract.py docstring), computed here.
const ldb = new DatabaseSync(opt.links, { readOnly: true });
const build = Object.fromEntries(ldb.prepare('SELECT k, v FROM build').all().map((r) => [r.k, r.v]));
let linksSha;
{
  const hash = crypto.createHash('sha256');
  const field = (v) => (v === null ? '\\N' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : fail('a REAL in the extract')) : String(v));
  for (const [table, cols] of [['people', 'person_id, sex, confidence, ns_keys, key_type, in_candidate_merge'], ['links', 'person_id, db, record_id, confidence']]) {
    const names = cols.split(', ');
    for (const row of ldb.prepare(`SELECT ${cols} FROM ${table} ORDER BY ${cols}`).iterate()) hash.update(`${names.map((c) => field(row[c])).join('\t')}\n`);
  }
  linksSha = hash.digest('hex');
}
if (linksSha !== pin.links.extract_content_sha256 || build.extract_content_sha256 !== linksSha) fail(`${opt.links} is not the pinned extract (content sha256 ${linksSha})`);
if (build.links_tag !== pin.links.private_tag || build.pairs_with !== pin.half.private_tag || build.marathon_release !== release.tag) fail('the extract was cut from another link build');
const correctedBytes = fs.readFileSync(opt.corrected);
const correctedSha = sha(correctedBytes);
if (correctedSha !== MC.sha256) fail(`${opt.corrected} is not the pinned corrected metadata (sha256 ${correctedSha})`);
const corrected = readCorrection(correctedBytes);
log('sources and the corrected metadata match the pin');

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
const hdb = new DatabaseSync(opt.half, { readOnly: true });
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

// The stamp correction, rederived from the corrected metadata: every stamped edition of the snapshot whose corrected
// status is not stamped (the frozen list, with its trimmed reason), the weaker-source stamps, and the verified scope.
{
  const derived = [];
  let missing = 0;
  for (const r of P.editions) {
    if (r.status !== 'stamped' || r.edition_id === null) continue;
    const c = corrected.get(r.edition_id);
    if (!c || c.city !== r.city || c.year !== r.year) { missing++; continue; }
    if (c.status !== 'stamped') derived.push({ edition_id: r.edition_id, city: r.city, year: r.year, corrected_status: c.status, reason: correctionReason(c.reason) });
  }
  compare('policy', 'stamp correction: stamped editions missing from or renamed in the corrected metadata', 0, missing);
  compare('policy', 'stamp correction: withdrawn stamps (from the corrected metadata)', sorted(SC.withdrawn), sorted(derived));
  const weaker = SC.weaker_source.map((x) => { const c = corrected.get(x.edition_id); return c && c.status === 'stamped' ? { edition_id: x.edition_id, city: c.city, year: c.year, source: trimText(c.source_type) } : null; });
  compare('policy', 'stamp correction: weaker-source stamps stay stamped', sorted(SC.weaker_source), sorted(weaker.filter(Boolean)));
  let wrong = 0, weakVerified = 0;
  const weakIds = new Set(SC.weaker_source.map((x) => x.edition_id));
  for (const r of P.editions) {
    if (!r.use_finish || r.edition_id === null) continue;
    const stamped = corrected.get(r.edition_id)?.status === 'stamped';
    if (stamped !== (r.group === 'verified')) wrong++;
    if (weakIds.has(r.edition_id) && r.group === 'verified') weakVerified++;
  }
  compare('policy', 'stamp correction: usable editions verified exactly when stamped in both', 0, wrong);
  compare('policy', 'stamp correction: weaker-source stamps verified', weakIds.size, weakVerified);
}

// ---------- The marathon side ----------
log('reading the runner shards');
const MAR = loadMarathons(ROOT);
const REVIEWED_MARATHON = { 'private-export-20261021-1050': { eligible: 4108749, sustained: 1266780, dated_editions: 215 } };
compare('policy', 'marathon side', REVIEWED_MARATHON[MAR.releaseTag] || null, { eligible: MAR.n, sustained: MAR.slowdowns, dated_editions: MAR.datedEditions });
if (MAR.manifestSha !== manifest.marathon.runner_manifest_sha256) fail('the runner manifest changed after the half build');
if (MAR.weatherSha !== manifest.marathon.weather_evidence_sha256) fail('the weather evidence changed after the half build');

// ---------- Set B ----------
log('rebuilding set B');
const people = new Map();
const personSex = [], personNs = [], personMerge = [];
for (const r of ldb.prepare('SELECT person_id, sex, confidence, ns_keys, in_candidate_merge FROM people').iterate()) {
  if (!['high', 'medium'].includes(r.confidence) || !(r.ns_keys <= 3)) continue;
  people.set(r.person_id, personSex.length);
  personSex.push(r.sex); personNs.push(r.ns_keys); personMerge.push(r.in_candidate_merge === 1);
}
const findSorted = (arr, v) => { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === v) return m; if (arr[m] < v) lo = m + 1; else hi = m - 1; } return -1; };
const fin = P.fin;
const marOrder = Uint32Array.from({ length: MAR.n }, (_, i) => i).sort((a, b) => MAR.id[a] - MAR.id[b]);
const marIds = Float64Array.from(marOrder, (i) => MAR.id[i]);
const halvesOf = new Map(), marsOf = new Map();
const push = (map, k, v) => { let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(v); };
for (const r of ldb.prepare('SELECT person_id, db, record_id FROM links').iterate()) {
  const p = people.get(r.person_id);
  if (p === undefined) continue;
  if (r.db === 'half') { const k = findSorted(fin.id, r.record_id); if (k >= 0) push(halvesOf, p, k); }
  else if (r.db === 'full') { const j = findSorted(marIds, r.record_id); if (j >= 0) push(marsOf, p, marOrder[j]); }
}
const ED = P.editions;
const pairs = { h: [], m: [], sex: [], ed: [], city: [], sus: [], verified: [], nsKeys: [], inMerge: [], person: [], mDay: [], mId: [] };
const pairPeople = new Set(), halfEds = new Set();
for (const [p, mars] of marsOf) {
  const halves = halvesOf.get(p) || [];
  const perDate = new Map();
  for (const k of halves) { const d = ED[fin.ed[k]].day; if (!Number.isNaN(d)) perDate.set(d, (perDate.get(d) || 0) + 1); }
  const marDays = new Set(mars.map((j) => MAR.day[MAR.edition[j]]));
  for (const j of mars) {
    const mDay = MAR.day[MAR.edition[j]];
    let best = -1, bestDays = Infinity;
    for (const k of halves) {
      const e = ED[fin.ed[k]];
      if (Number.isNaN(e.day) || fin.r7[k] || e.date_suspect || perDate.get(e.day) > 1 || marDays.has(e.day)) continue;
      const days = mDay - e.day;
      if (days < 21 || days > 112) continue;
      if (days < bestDays || (days === bestDays && fin.id[k] < fin.id[best])) { best = k; bestDays = days; }
    }
    if (best < 0) continue;
    const med = MAR.editions[MAR.edition[j]];
    pairs.h.push(fin.finish[best]); pairs.m.push(MAR.finish[j]); pairs.sex.push(personSex[p]);
    pairs.ed.push(`${med.city} ${med.year}`); pairs.city.push(med.city); pairs.sus.push(MAR.sustained[j] === 1);
    pairs.verified.push(ED[fin.ed[best]].group === 'verified'); pairs.nsKeys.push(personNs[p]); pairs.inMerge.push(personMerge[p]);
    pairs.person.push(p); pairs.mDay.push(mDay); pairs.mId.push(MAR.id[j]);
    pairPeople.add(p); halfEds.add(fin.ed[best]);
  }
}
const setB = { pairs: pairs.h.length, people: pairPeople.size, marathon_editions: new Set(pairs.ed).size, half_editions: halfEds.size };
// Link coverage by marathon city: eligible marathon finishes linked to someone with at least one usable half (any
// date, not R7), for /methodology.
const coverage = [];
{
  const linkedMars = new Set();
  for (const [p, mars] of marsOf) if ((halvesOf.get(p) || []).some((k) => !fin.r7[k])) for (const j of mars) linkedMars.add(j);
  const byCity = new Map();
  for (let j = 0; j < MAR.n; j++) {
    const city = MAR.editions[MAR.edition[j]].city;
    let c = byCity.get(city);
    if (!c) { c = { city, finishes: 0, linked: 0 }; byCity.set(city, c); }
    c.finishes++;
    if (linkedMars.has(j)) c.linked++;
  }
  coverage.push(...[...byCity.values()].sort((a, b) => (a.city < b.city ? -1 : 1)));
}
compare('policy', 'set B (manifest)', publishedSetB, setB);
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
const { linked: linkedMine, tool: toolMine } = Fam.linked(pairs, { people: setB.people, halfEditions: setB.half_editions, coverage });
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
  half_sqlite_sha256: halfSha, links_extract_content_sha256: linksSha, corrected_meta_sha256: correctedSha, runner_manifest_sha256: MAR.manifestSha,
  policy_sha256: sha(policyBytes), weather_evidence_sha256: MAR.weatherSha, marathon_release: release.tag,
  counts: { ...P.counts, set_b: setB, marathon: { eligible: MAR.n, sustained: MAR.slowdowns, dated_editions: MAR.datedEditions } },
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
