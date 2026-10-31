#!/usr/bin/env node
'use strict';
// Layer 1 of the half-marathon verification (docs/HALF_MARATHON.md; spec 1.6). It runs from the repository alone, without
// the half snapshot or its links (the owner's public releases, which the workflow's `source` job and the local source
// recount read) and without importing the Python builders:
//
//   1. Provenance: the manifest against the pin (analysis/half-release.json), the adopted marathon release, the runner
//      manifest, the weather evidence and the cited marathon files; every builder script's sha (a changed builder
//      without a rebuild fails); every published file's bytes and sha; the reviewed policy file.
//   2. Floors and bans: identifier and name keys, strings only under allow-listed keys, no release labels, every shown
//      group at least 100 finishes or pairs and 3 editions; the words list (scripts/lib/words.cjs) on every file string,
//      nugget, dek, tool sentence and card word (lib/charts/text/half.ts, with the card rules of the Top 100).
//   3. Exact recounts from the published aggregates: every share under a time from the minute histogram and the sex
//      bins, the quantiles against their bins, the densest 30 minutes, the round marks (the smooth curve refitted in
//      Node within 0.05), the women's band medians and crossing, the same-city shares, and the marathon side of every
//      same-city pair recounted from the public runner shards (scripts/charts/cohort.cjs) under the charts' sex rule.
//   4. Consistency of the linked aggregates (their source rows are not in the repository): floors, monotone quantiles, mark shares inside
//      the bounds their quantile levels allow, exact share fractions, contiguous ranges, edge slices, sexes summing to
//      all, the goal rows recomputed from the windows with clean crossings, the battery against the checks, the tool
//      file equal to linked.json window for window, the cards equal to their sources.
//   5. The source-recount receipt (docs/evidence/half/source-recount.json, written by scripts/verify-half-source.cjs
//      from the source files): status pass, no mismatches, and bound to the current manifest, recount scripts, half
//      snapshot, links extract, stamp reference and edition_meta CSV, runner manifest and policy. A rebuild or a changed recount without a fresh local recount
//      fails.
//   6. `--html` (after `npm run build`): the scope chip and status words (spec 9), the reading links, "records linked by
//      name" as a term link, "Not a prediction.", and every /methodology#half-* anchor.
//
//   node scripts/verify-half.cjs [--html] [--out <folder>] [--no-shards] [--data <half folder>]
//
// `--no-shards` skips the same-city marathon recount (about 20 s) and `--data` reads another copy of the half folder
// (mutation tests of this verifier); both are for development only. CI runs the full check on public/data/half.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT); // lib/half-server.ts reads public/data/half from the working folder
const args = process.argv.slice(2);
const opt = { html: args.includes('--html'), shards: !args.includes('--no-shards'), out: path.join(ROOT, 'out'), data: path.join(ROOT, 'public/data/half') };
const USAGE = 'Usage: node scripts/verify-half.cjs [--html] [--out <folder>] [--no-shards] [--data <half folder>]';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) opt.out = path.resolve(args[++i]);
  else if (args[i] === '--data' && args[i + 1]) opt.data = path.resolve(args[++i]);
  else if (!['--html', '--no-shards'].includes(args[i])) throw new Error(USAGE);
}
const D = require('./half/derive.cjs');
const W = require('./lib/words.cjs');

const started = Date.now();
const problems = [];
let checks = 0;
const ok = (cond, message) => { checks++; if (!cond) problems.push(message); return !!cond; };
// Deep equality with keys in any order (the published files sort their keys; recounts build objects in their own order).
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (a, b, message) => ok(JSON.stringify(canon(a)) === JSON.stringify(canon(b)), `${message}: ${JSON.stringify(canon(a))} vs ${JSON.stringify(canon(b))}`);
const close = (a, b, tol, message) => ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol, `${message}: ${a} vs ${b} (tolerance ${tol})`);
const rel = (p) => path.join(ROOT, p);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = (p) => sha(fs.readFileSync(rel(p)));
const readJson = (p) => JSON.parse(fs.readFileSync(rel(p), 'utf8'));
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const int = (x, min = 0) => Number.isSafeInteger(x) && x >= min;

const pin = readJson('analysis/half-release.json');
const release = readJson('analysis/release.json');
const manifestBytes = fs.readFileSync(path.join(opt.data, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);

// ---------- 0. Parity with the Python builders (scripts/half/fixtures/parity.json, also checked by analysis/test_half.py) ----------
{
  const parity = readJson('scripts/half/fixtures/parity.json');
  for (const [i, c] of parity.cases.entries()) {
    const sorted = D.ascending(c.values);
    eq(parity.levels.map((q) => D.quantileSorted(sorted, q)), c.quantiles, `parity case ${i}: the linear quantile`);
    eq(c.quantiles.map(D.sec), c.published, `parity case ${i}: seconds as published (Python rounding, ties to even)`);
  }
  eq([D.sec(100.25), D.sec(7040), D.sh(1 / 2048), D.r(2.20145, 4)], [100.2, 7040, 0.0004882812, 2.2014], 'Python rounding of exact and inexact ties (2.20145 is stored just under the tie)');
}

// ---------- 1. Provenance ----------
// Pin schema 3: `key` names the snapshot and the link build (what the policy and the reviewed counts are keyed by);
// `private_tag` and `doi` are provenance, null where none exists; `stamps.reference` is the stamp cross-check.
eq([manifest.schema_version, manifest.family], [2, 'half'], 'half manifest schema');
eq([manifest.half.tag, manifest.half.key, manifest.half.private_tag, manifest.half.sqlite_sha256], [pin.half.tag, pin.half.key, pin.half.private_tag, pin.half.sqlite_sha256], 'the manifest binds the pinned half snapshot');
eq([manifest.links.tag, manifest.links.key, manifest.links.private_tag, manifest.links.applies_to, manifest.links.extract_content_sha256],
  [pin.links.tag, pin.links.key, pin.links.private_tag, pin.links.applies_to, pin.links.extract_content_sha256], 'the manifest binds the pinned links extract');
eq(manifest.links.coverage, { half_max_record_id: pin.links.coverage.half_max_record_id, half_rows: pin.links.coverage.half_rows, marathon_rows: pin.links.coverage.marathon_rows }, 'the manifest binds the link build’s coverage');
ok(/^[0-9a-f]{64}$/.test(pin.links.extract_content_sha256 || ''), 'the pin holds the links extract digest');
eq(pin.links.applies_to, pin.half.key, 'the pinned link build applies to the pinned half snapshot');
// The source is the owner's public release (owner decision, October 30, 2026: "publish everything and full merge").
eq([pin.schema_version, pin.repository, pin.license, pin.access], [3, 'koolkam00/pace-notes', 'CC BY 4.0', 'public (CC BY 4.0), owner releases; pages publish aggregates'], 'the pin names the owner’s public release and its access');
eq([manifest.repository, manifest.license, manifest.access], [pin.repository, pin.license, pin.access], 'the manifest names the pinned public source');
ok([pin.half, pin.links].every((x) => /^half-dataset-\d{8}-\d{4}$/.test(x.tag) && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(x.key) && Object.values(x.assets).every((d) => /^[0-9a-f]{64}$/.test(d))), 'the pin names public release tags, keys and asset digests');
ok([pin.half, pin.links].every((x) => x.private_tag === null || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(x.private_tag)) && (pin.half.doi === null || typeof pin.half.doi === 'string'), 'private_tag and doi are a name or null');
eq(pin.provenance.private_repository, 'koolkam00/pace-notes-db-backup', 'the pin keeps the private releases as provenance');
// The archives /methodology#downloads-half names, and the producer's hand review it cites: claims transcribed from the
// pinned READMEs and MATCHING_V4.md (analysis/test_half.py compares the review with the file where it is on disk).
const DOI = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/;
ok(['doi', 'supersedes_doi'].every((k) => pin.stamps.reference[k] == null || DOI.test(pin.stamps.reference[k])), 'stamps.reference.doi and supersedes_doi: a DOI or null');
{
  const rv = pin.links.producer_review;
  ok(rv == null || (pin.links.assets[rv.source] && int(rv.n_per_cell, 1) && finite(rv.zero_of_n_upper95) && rv.zero_of_n_upper95 > 0 && rv.zero_of_n_upper95 < 1 && Array.isArray(rv.last_rounds) && rv.last_rounds.length > 0
    && rv.last_rounds.every((r) => typeof r.round === 'string' && ['rare_missed', 'common_missed', 'rare_false_merge', 'common_false_merge'].every((k) => finite(r[k]) && r[k] >= 0 && r[k] <= 1))),
  'links.producer_review: a pinned source file, a cell size, and shares for each of its last rounds');
}
const REF = pin.stamps?.reference || {};
eq(manifest.stamps, { reference: { asset: REF.asset, sha256: REF.sha256, tag: REF.tag }, rule: pin.stamps?.rule }, 'the manifest binds the pinned stamp reference');
eq([/^half-dataset-\d{8}-\d{4}$/.test(REF.tag || ''), /^[0-9a-f]{64}$/.test(REF.sha256 || ''), pin.stamps?.rule], [true, true, 'verified = stamped in this snapshot\'s own edition_meta, equal to the policy\'s reviewed list'], 'the stamp rule and its reference: a public release and a digest');
eq([pin.marathon_release, manifest.marathon.release_tag], [release.tag, release.tag], 'the half data use the adopted marathon release');
const stamp = /(\d{4})(\d{2})(\d{2})-\d{4}$/.exec(pin.half.key);
eq(manifest.as_of, stamp && `${stamp[1]}-${stamp[2]}-${stamp[3]}`, 'as_of is the snapshot date (from half.key)');
const runnerBytes = fs.readFileSync(rel('public/data/runners/manifest.json'));
const runners = JSON.parse(runnerBytes);
eq(runners.release_tag, release.tag, 'the runner shards are the adopted release');
eq(manifest.marathon.runner_manifest_sha256, sha(runnerBytes), 'the exact runner manifest');
eq(manifest.marathon.runner_manifest_as_of, runners.as_of, 'the runner manifest timestamp');
eq(manifest.marathon.weather_evidence_sha256, fileSha('public/data/weather/evidence.json'), 'the exact weather evidence');
const weather = readJson('public/data/weather/evidence.json');
eq(weather.input.release_tag, readJson('analysis/weather-release.json').tag, 'the weather evidence matches its pin');
eq(Object.keys(manifest.marathon.inputs).sort(), ['charts/womens-share-by-finish-time.json', 'insights/finish-times.json'], 'the cited marathon files');
for (const [name, digest] of Object.entries(manifest.marathon.inputs)) eq(digest, fileSha(`public/data/${name}`), `the cited marathon file ${name}`);
const policyBytes = fs.readFileSync(rel(pin.policy));
const policy = JSON.parse(policyBytes);
eq([manifest.policy.file, manifest.policy.sha256], [pin.policy, sha(policyBytes)], 'the reviewed half policy file');
eq([policy.tag, policy.schema_version], [pin.half.key, 2], 'the policy is the snapshot’s');
// The flagship battery's pre-registered verified-half members (October 30, 2026): the rules in words and the reviewed
// off-road labels; the weaker-source stamps are the policy's stamps.weaker_source.
eq(Object.keys(policy.battery || {}).sort(), ['leave_outs', 'off_road_labels', 'reviewed', 'verified_federation', 'verified_road'], 'the policy states the battery’s verified-half members and leave-outs');
ok(Array.isArray(policy.battery?.off_road_labels) && policy.battery.off_road_labels.length > 0 && policy.battery.off_road_labels.every((l) => typeof l === 'string' && l.length > 0)
  && new Set(policy.battery.off_road_labels).size === policy.battery.off_road_labels.length, 'the policy’s off-road labels: distinct label strings');
{
  // The stamp check in the policy (schema 2): the pinned reference and edition_meta CSV, the reviewed stamped list, the
  // never_stamp rows, the reference's withdrawn stamps (each now an unverified status, none stamped) and the
  // weaker-source stamps (each stamped, none withdrawn), with the counts the recount asserts.
  const PS = policy.stamps || {};
  eq([PS.reference?.tag, PS.reference?.asset, PS.reference?.sha256, PS.reference?.readme_sha256, PS.rule], [REF.tag, REF.asset, REF.sha256, REF.readme_sha256, pin.stamps?.rule], 'the policy’s stamp reference is the pinned one');
  eq(PS.edition_meta_csv?.sha256, pin.half.assets[PS.edition_meta_csv?.asset], 'the policy’s edition_meta CSV is the pinned one');
  const stampedIds = new Set(PS.stamped || []);
  eq(stampedIds.size, (PS.stamped || []).length, 'the stamped list: one entry per edition');
  ok((PS.reference?.withdrawn || []).every((w) => policy.statuses.unverified.includes(w.corrected_status) && !stampedIds.has(w.edition_id) && typeof w.reason === 'string' && w.reason.length > 0 && w.reason.length <= 160), 'the withdrawn stamps: an unverified status, never stamped, a reason each');
  ok((PS.never_stamp || []).every((r) => Number.isSafeInteger(r.edition_id) && !stampedIds.has(r.edition_id) && typeof r.reason === 'string' && typeof r.added_at === 'string'), 'the never_stamp rows: none stamped');
  ok((PS.reference?.withdrawn || []).every((w) => (PS.never_stamp || []).some((r) => r.edition_id === w.edition_id)), 'every withdrawn stamp is in never_stamp');
  ok((PS.weaker_source || []).length > 0 && PS.weaker_source.every((x) => stampedIds.has(x.edition_id)), 'the weaker-source stamps are stamped');
  ok((PS.reference?.weaker_source || []).every((x) => PS.weaker_source.some((y) => y.edition_id === x.edition_id && y.source === x.source)), 'the reference’s weaker-source stamps stay weaker-source');
  eq(policy.expected?.stamp_check && [policy.expected.stamp_check.stamped, policy.expected.stamp_check.never_stamp, policy.expected.stamp_check.withdrawn_unstamped],
    [stampedIds.size, (PS.never_stamp || []).length, (PS.reference?.withdrawn || []).length], 'the stamp_check counts are the policy’s lists');
  const LE = policy.link_editions || {};
  eq([LE.link_build, LE.half_max_record_id], [pin.links.key, pin.links.coverage.half_max_record_id], 'the policy’s link-build editions are the pinned link build’s');
}
eq(manifest.policy.module_sha256, sha(Buffer.concat(['analysis/half_quality.py', 'analysis/half_policy_lists.py'].map((p) => fs.readFileSync(rel(p))))), 'the policy modules');
const counts = manifest.policy.counts;
const { set_b: setB, ...policyCounts } = counts;
eq(policyCounts, policy.expected, 'the manifest’s policy counts are the reviewed ones');
// Every half builder module is bound, and each sha is the file in the repository.
const halfModules = fs.readdirSync(rel('analysis')).filter((n) => /^(half_.*|build_half)\.py$/.test(n)).map((n) => `analysis/${n}`).sort();
eq(Object.keys(manifest.scripts).sort(), halfModules, 'every half builder module is bound to the manifest');
for (const [name, digest] of Object.entries(manifest.scripts)) ok(digest === fileSha(name), `stale half data: ${name} changed after the build (rerun analysis/build_half.py)`);
// The v4 link rule (lead rulings L, October 31, 2026; analysis/half_pairs.py LINK_RULES).
eq(manifest.link_rules, { conflicts: 'over every linked row of the person, whatever its confidence', link_editions: "the policy's link-partial and re-timed editions supply no linked half", ns_keys: "distinct age keys per normalized name and published sex over every row of the link build; a person takes the largest over the person's rows whose own confidence is high_elite, high or medium (either distance, whatever the record's status)", ns_keys_max: 3, pairing: 'nearest prior half, one pair per person and marathon', row_tiers: ['high_elite', 'high', 'medium'], tiers: ['high_elite', 'high', 'medium'], unions: 'applied by the link build', window_days: [21, 112] }, 'the link rules (spec 1.3)');
eq(manifest.cohort, { linked: { half_editions: setB.half_editions, marathon_editions: setB.marathon_editions, pairs: setB.pairs }, usable: counts.use_finish, verified: counts.verified }, 'the manifest cohort is its policy counts');
// Set B's reviewed counts (analysis/half_pairs.EXPECTED), with review R6's two signals, counted and never excluded (lead
// rulings, October 31, 2026): halves that serve two or more pairs, and pairs whose person has another eligible marathon
// within 13 days. Each is a count of set B and at most what it counts.
eq(Object.keys(setB).sort(), ['half_editions', 'halves_in_two_or_more_pairs', 'marathon_editions', 'pairs', 'pairs_with_a_close_marathon', 'people'], 'set B: its reviewed counts and the two R6 signals');
ok(Object.values(setB).every((v) => int(v)) && setB.people <= setB.pairs && setB.half_editions <= setB.pairs && 2 * setB.halves_in_two_or_more_pairs <= setB.pairs
  && setB.pairs_with_a_close_marathon <= setB.pairs, 'set B: counts within the pairs (a half serving two pairs counts once)');
// The policy counts add up.
eq(counts.raw - counts.R1 - counts.R2 - counts.R3 - counts.R4 - counts.R5_fast - counts.R5_slow - counts.R6, counts.record_usable, 'R1–R6 leave the record-usable rows');
eq(counts.record_usable - counts.R7, counts.record_usable_after_R7, 'R7 leaves the record-usable rows after R7');
// Every record-usable finish after R7 is used or removed by one edition rule (verify round 1, October 31, 2026: a status
// without a rule, such as the producer's empty placeholder holding rows, would otherwise drop finishes unnoticed).
eq(counts.use_finish.finishes + counts.E0_finishes + counts.E1_held_finishes + counts.E2_E8_finishes, counts.record_usable_after_R7, 'the editions account for every record-usable finish after R7 (used, E0, E1 held, E2–E8)');
ok(typeof policy.empty_status === 'string', 'the policy states that an empty status holds no record-usable rows');
ok(counts.verified.finishes <= counts.use_finish.finishes && counts.verified_use_sex.finishes <= counts.verified.finishes, 'verified ⊂ usable, sex ⊂ verified');
const frozen = policy.edition_rules.editions;
eq(frozen.filter((e) => e.rule !== 'E0').length, counts.E2_E8_editions, 'the frozen E2–E8 list');
eq(frozen.filter((e) => e.rule !== 'E0').reduce((a, e) => a + e.finishes, 0), counts.E2_E8_finishes, 'the frozen E2–E8 finishes');
eq(frozen.filter((e) => e.rule === 'E0').reduce((a, e) => a + e.finishes, 0), counts.E0_finishes, 'the frozen E0 finishes');

// ---------- 2. Inventory ----------
const SCOPES = { 'field.json': 'verified', 'women.json': 'verified', 'linked.json': 'linked', 'tools/half-to-full.json': 'linked', 'cards.json': 'per-card' };
const present = [];
(function walk(dir, prefix) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}${e.name}/`); else present.push(`${prefix}${e.name}`); } })(opt.data, '');
eq(present.filter((f) => f !== 'manifest.json').sort(), Object.keys(manifest.files).sort(), 'exactly the manifest’s files are published, and nothing else');
eq(Object.keys(manifest.files).sort(), Object.keys(SCOPES).sort(), 'the half families');
const files = {};
for (const [name, meta] of Object.entries(manifest.files)) {
  const bytes = fs.readFileSync(path.join(opt.data, name));
  eq([bytes.length, sha(bytes)], [meta.bytes, meta.sha256], `${name}: bytes and sha256`);
  eq(meta.scope, SCOPES[name], `${name}: scope`);
  ok(bytes.length < 400_000, `${name}: ${bytes.length} bytes (aggregates only, about 300 KB in all)`);
  ok(bytes[bytes.length - 1] === 0x0a, `${name}: deterministic JSON ends with a newline`);
  files[name] = JSON.parse(bytes);
  if (meta.scope !== 'per-card') eq(files[name].scope, meta.scope, `${name}: the file’s own scope`);
}
const field = files['field.json'], women = files['women.json'], linked = files['linked.json'], tool = files['tools/half-to-full.json'], cards = files['cards.json'];
eq(field.policy, { sha256: manifest.policy.sha256, module_sha256: manifest.policy.module_sha256 }, 'field.json binds the policy');

// ---------- 3. Bans: keys, strings, labels, floors (analysis/half_common.check_published, independently) ----------
const IDENTITY_KEY = /^(ids?|rids?|record_?ids?|profile_?ids?|runners?|runner_?ids?|bibs?|bib_?(no|number)|names?|(full|first|last|given|family)_?names?|participants?|participant_?ids?|persons?|person_?ids?|edition_?ids?|h_record_id|m_record_id|series_key|urls?|source_url)$/i;
const STRING_KEYS = new Set(['city', 'label', 'mark', 'scope', 'family', 'file', 'weighting', 'id', 'slug', 'path']);
const PLOT_STRING_KEYS = new Set(['form', 'tone', 'rest', 'fmt', 'a', 'b']);
// verified_federation and verified_road were pre-registered on October 30, 2026 (the policy's `battery`).
const BATTERY_IDS = new Set(['pooled', 'verified_halves', 'verified_federation', 'verified_road', 'other_marathons', 'ns_keys_1', 'one_per_person', 'editions_equal_20', 'editions_equal_100', 'city_equal']);
// The one place a family file names an edition: a worst leave-out variant, by its integer edition id (no label).
const HALF_EDITION_AT = /^linked\.json\.checks\.battery\.leave_outs\.(verified_halves|verified_federation)\.worst\.[a-z_]+$/;
const fileStrings = [];
function scan(value, where, { inRule = false, plot = false } = {}) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => { ok(typeof v !== 'string' || inRule, `${where}[${i}]: a bare string in a list`); scan(v, `${where}[${i}]`, { inRule, plot }); });
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'id') ok(BATTERY_IDS.has(v), `${where}.id: only the battery members may use "id" (${JSON.stringify(v)})`);
      else if (k === 'half_edition') ok(Number.isSafeInteger(v) && v >= 0 && HALF_EDITION_AT.test(where), `${where}.half_edition: an edition id only as an integer naming a worst leave-out variant (${JSON.stringify(v)})`);
      else ok(!IDENTITY_KEY.test(k), `${where}.${k}: an identifier or name key`);
      if (typeof v === 'string') {
        if (k === 'sha256' || k === 'module_sha256') ok(/^[0-9a-f]{64}$/.test(v), `${where}.${k}: not a sha256 digest`);
        else ok(inRule || k === 'rule' || STRING_KEYS.has(k) || (plot && PLOT_STRING_KEYS.has(k)), `${where}.${k}: a string under a key that may not hold one (${JSON.stringify(v)})`);
        ok(!W.RELEASE_LABEL.test(v), `${where}.${k}: a release label in a family file`);
        if (!/sha256$/.test(k) && k !== 'scope' && k !== 'id') fileStrings.push([`${where}.${k}`, v]);
      }
      scan(v, `${where}.${k}`, { inRule: inRule || k === 'rule', plot });
    }
  } else if (typeof value === 'number') ok(Number.isFinite(value), `${where}: a non-finite number`);
  else ok(value === null || typeof value === 'boolean' || typeof value === 'string', `${where}: an unexpected value`);
}
for (const [name, doc] of Object.entries(files)) scan(doc, name, { plot: name === 'cards.json' });
// Manifest strings are provenance: tags, digests and paths, each checked above against the pin or the files.
for (const [where, v] of fileStrings) {
  const problemsHere = W.wordProblems(v, [...W.BANNED, ...W.HALF_BANNED, ...W.STATUS_WORDS, ...W.VERIFICATION_WORDS]);
  ok(!problemsHere.length, `${where}: ${problemsHere.join(', ')}: ${v}`);
}

// ---------- 4. field.json: exact recounts ----------
const M = field.minutes;
eq([M.lo, M.hi, M.counts.length], [70, 200, 130], 'field: the minute histogram spans 1:10 to 3:19 (every minute and both tails at least 100 since the stamp correction)');
eq(D.tailedTotal(M), field.cohort.finishes, 'field: the histogram holds every verified finish');
ok(M.counts.every((c) => int(c, D.MIN_CELL)), 'field: every published minute holds at least 100 finishes');
ok(int(M.under_lo, D.MIN_CELL) && int(M.at_or_over_hi, D.MIN_CELL), `field: both tails of the minute histogram hold at least 100 finishes (${M.under_lo}, ${M.at_or_over_hi})`);
ok(int(field.cohort.finishes, D.MIN_CELL) && int(field.cohort.editions, D.MIN_EDITIONS) && int(field.cohort.sex_editions, D.MIN_EDITIONS), 'field: the cohort floors');
eq([field.cohort.finishes, field.cohort.editions], [counts.verified.finishes, counts.verified.editions], 'field: the cohort is the verified policy count');
eq([field.cohort.sex_finishes, field.cohort.sex_editions], [counts.verified_use_sex.finishes, counts.verified_use_sex.editions], 'field: the sex cohort is the policy count');
const B = field.sex_bins;
eq([B.bin_s, B.lo_s, B.hi_s], [300, 4500, 12600], 'field: the 5-minute sex bins (from 1:15, the first published mark)');
eq(D.tailedTotal(B.F) + D.tailedTotal(B.M), field.cohort.sex_finishes, 'field: the sex bins hold every recorded finish of the sex editions');
for (const g of ['F', 'M']) {
  eq(B[g].counts.length, (B.hi_s - B.lo_s) / B.bin_s, `field: ${g} bins`);
  ok(B[g].counts.every((c) => int(c, D.MIN_CELL)), `field: every published ${g} bin holds at least 100 finishes`);
  ok(int(B[g].under_lo, D.MIN_CELL) && int(B[g].at_or_over_hi, D.MIN_CELL), `field: both tails of the ${g} bins hold at least 100 finishes (${B[g].under_lo}, ${B[g].at_or_over_hi})`);
}
const nAll = D.tailedTotal(M), nF = D.tailedTotal(B.F), nM = D.tailedTotal(B.M);
eq(field.under.map((u) => u.s), Array.from({ length: (10800 - 4500) / 300 + 1 }, (_, i) => 4500 + 300 * i), 'field: a share under every 5 minutes from 1:15 to 3:00');
for (const u of field.under) {
  eq(u.all, D.sh(D.underMinutes(M, u.s) / nAll), `field.under ${u.s}: all, from the histogram`);
  eq(u.F, D.sh(D.underBins(B, B.F, u.s) / nF), `field.under ${u.s}: recorded women’s, from the bins`);
  eq(u.M, D.sh(D.underBins(B, B.M, u.s) / nM), `field.under ${u.s}: recorded men’s, from the bins`);
}
for (const [g, levels] of [['all', [0.1, 0.25, 0.5, 0.75, 0.9]], ['F', [0.25, 0.5, 0.75]], ['M', [0.25, 0.5, 0.75]]]) {
  eq(Object.keys(field.quantiles[g]).sort(), levels.map((q) => `p${Math.round(q * 100)}`).sort(), `field.quantiles.${g}: levels`);
  for (const q of levels) {
    const v = field.quantiles[g][`p${Math.round(q * 100)}`];
    const bounds = g === 'all' ? D.quantileBounds(M, M.lo * 60, 60, q) : D.quantileBounds(B[g], B.lo_s, B.bin_s, q);
    ok(bounds && v >= bounds[0] && v < bounds[1], `field.quantiles.${g}.p${Math.round(q * 100)} ${v} lies in its bins ${JSON.stringify(bounds)}`);
    ok(Number.isInteger(v) || Number.isInteger(Math.round(v * 10)), `field.quantiles.${g}: seconds or one decimal`);
  }
}
{
  // The median minute is where the cumulative count first reaches half the finishes.
  let seen = M.under_lo, minute = null;
  for (let i = 0; i < M.counts.length && minute === null; i++) { seen += M.counts[i]; if (seen >= nAll / 2) minute = M.lo + i; }
  eq(Math.floor(field.quantiles.all.p50 / 60), minute, 'field: the median sits in the minute where the cumulative count crosses one half');
}
{
  const best = D.densest(M, 30, 40, 300);
  ok(best, 'field.window30: the densest 30 minutes are decided by the published histogram');
  if (best) eq([field.window30.lo_minute, field.window30.share], [best.lo, D.sh(best.count / nAll)], 'field.window30');
}
eq(field.marks.map((m) => m.minutes), [90, 105, 120, 135, 150], 'field: the five round marks');
const count = (m) => (m >= M.lo && m < M.hi ? M.counts[m - M.lo] : NaN);
// A mark whose 50-minute fit window (25 either side) reaches under the published minutes cannot be refitted here: those
// minutes sit in the open tail because each holds under 100 finishes (1:05 held 82 after the stamp correction). Its
// expected count is recounted by the source recount instead, and section 8 requires a fresh passing receipt for it.
const sourceOnlyFits = [];
for (const m of field.marks) {
  eq(m.mark, D.clock(60 * m.minutes), `field.marks ${m.minutes}: label`);
  eq([m.minute_before, m.minute_after], [count(m.minutes - 1), count(m.minutes)], `field.marks ${m.mark}: the minutes either side, from the histogram`);
  if (m.minutes - 25 >= M.lo && m.minutes + 24 < M.hi) {
    const fit = D.localFit(count, m.minutes);
    close(m.expected_minute_before, fit.exp_pre1, 0.05, `field.marks ${m.mark}: the smooth curve refitted in Node`);
  } else {
    ok(m.minutes - 25 < M.lo && m.minutes + 24 < M.hi && M.lo - (m.minutes - 25) <= 5, `field.marks ${m.mark}: only the first minutes of its fit window lie under the published histogram`);
    sourceOnlyFits.push(m.mark);
  }
  close(m.ratio, m.minute_before / m.expected_minute_before, 6e-5, `field.marks ${m.mark}: the ratio is the minute over its expectation`);
  ok(m.ratio_ci95[0] <= m.ratio && m.ratio <= m.ratio_ci95[1] && m.ratio_ci95[0] > 0, `field.marks ${m.mark}: the ratio lies in its bootstrap interval`);
  close(m.cliff, D.r(D.cliffIndex(count, m.minutes), 4), 1e-4, `field.marks ${m.mark}: the cliff index from the histogram`);
}
{
  const a = field.checks.all_usable, e = field.checks.editions_equal;
  eq([a.finishes, a.editions], [counts.use_finish.finishes, counts.use_finish.editions], 'field.checks.all_usable: the usable policy counts');
  ok(a.finishes >= field.cohort.finishes && [a.under_7200, a.under_6300].every((s) => D.isShareOf(s, a.finishes)), 'field.checks.all_usable: exact shares of the usable finishes');
  ok(int(e.editions, D.MIN_EDITIONS) && e.editions <= field.cohort.editions && e.min_finishes === 1000, 'field.checks.editions_equal: editions');
  // /methodology only: every verified edition weighted equally, the same race in verified and unverified years, the
  // verified finishes by country (source-only values; their floors and shapes here, their values in the recount).
  const ea = field.checks.editions_equal_all;
  eq(ea.editions, field.cohort.editions, 'field.checks.editions_equal_all: every verified edition');
  ok(ea.under_7200 > 0 && ea.under_7200 < 1, 'field.checks.editions_equal_all: a share');
  const sr = field.checks.same_race;
  ok(int(sr.races, D.MIN_EDITIONS) && finite(sr.diff_s.p25) && sr.diff_s.p25 <= sr.diff_s.p50 && sr.diff_s.p50 <= sr.diff_s.p75, 'field.checks.same_race: races and ordered quartiles');
  const cs = field.checks.countries;
  ok(cs.length >= 1 && cs.every((c) => /^[A-Z]{2}$/.test(c.label) && int(c.editions, D.MIN_EDITIONS) && int(c.small_editions) && c.small_editions <= c.editions
    && D.isShareOf(c.share, field.cohort.finishes) && Math.round(c.share * field.cohort.finishes) >= D.MIN_CELL), 'field.checks.countries: codes, floors and exact shares of the verified finishes');
  ok(cs.every((c, i) => !i || c.share < cs[i - 1].share || (c.share === cs[i - 1].share && c.label > cs[i - 1].label)), 'field.checks.countries: by share');
  ok(cs.reduce((a, c) => a + c.share, 0) <= 1 + 1e-9 && cs.reduce((a, c) => a + c.editions, 0) <= field.cohort.editions, 'field.checks.countries: within the verified finishes and editions');
  eq(new Set(cs.map((c) => c.label)).size, cs.length, 'field.checks.countries: one row per country');
}

// ---------- 5. women.json: exact recounts; the same-city marathon side from the shards ----------
eq(women.bands.map((b) => [b.lo_s, b.hi_s, b.label]), [[0, 5400, 'Under 1:30'], [5400, 6300, '1:30'], [6300, 7200, '1:45'], [7200, 8100, '2:00'], [8100, 9000, '2:15'], [9000, 9900, '2:30'], [9900, 10800, '2:45'], [10800, null, '3:00+']], 'women: the bands');
eq(women.band_rule, { max_unrecorded: 0.02, min_finishes: 2000, min_recorded_per_band: 100 }, 'women: the band rule');
// The band medians are published from at least 20 editions (analysis/half_women.py MIN_BAND_EDITIONS) and then only
// while the crossing holds with any one edition left out; with fewer qualifying they are left out, never published from
// fewer (15 qualify since the stamp correction, October 30, 2026; review of that day: the floor had been lowered to 3).
eq(women.min_band_editions, 20, 'women: the band medians need 20 editions');
ok(int(women.band_editions_qualifying) && women.band_editions_qualifying <= field.cohort.editions, `women: ${women.band_editions_qualifying} qualifying band editions`);
const bandsPublished = women.band_editions_qualifying >= women.min_band_editions;
if (bandsPublished) {
  eq(women.band_editions.length, women.band_editions_qualifying, `women: all ${women.band_editions_qualifying} qualifying band editions are published`);
  const medians = (rows) => women.bands.map((_, j) => D.npMedian(rows.map((row) => row.F[j] / row.n[j])));
  const cross = D.crossing(medians(women.band_editions), women.bands);
  ok(women.band_editions.every((_, i) => D.crossing(medians(women.band_editions.filter((__, k) => k !== i)), women.bands) === cross), 'women: the crossing holds with any one band edition left out');
} else {
  eq([women.band_editions.length, women.median_share.length, women.cross_s], [0, 0, null], `women: ${women.band_editions_qualifying} band editions are under the 20 the medians need, so none is published`);
}
for (const [i, row] of women.band_editions.entries()) {
  ok(row.n.length === 8 && row.F.length === 8 && row.n.every((v, j) => int(v, women.band_rule.min_recorded_per_band) && int(row.F[j]) && row.F[j] <= v), `women.band_editions[${i}]: eight bands, each at least 100 recorded finishes`);
  ok(row.n.reduce((a, b) => a + b, 0) >= women.band_rule.min_finishes * (1 - women.band_rule.max_unrecorded), `women.band_editions[${i}]: an edition of at least 2,000 finishes`);
}
if (bandsPublished) {
  const bandShares = women.bands.map((_, j) => D.npMedian(women.band_editions.map((row) => row.F[j] / row.n[j])));
  eq(women.median_share, bandShares.map(D.sh), 'women: the median share of each band from the unnamed rows');
  eq(women.cross_s, D.crossing(bandShares, women.bands), 'women: the crossing from the band medians');
}
const womensChart = readJson(`public/data/${women.marathon.file}`);
eq([women.marathon.file, women.marathon.sha256], ['charts/womens-share-by-finish-time.json', manifest.marathon.inputs['charts/womens-share-by-finish-time.json']], 'women: the cited marathon chart');
eq([women.marathon.cross_s, women.marathon.sub3], [womensChart.values.cross, womensChart.values.sub3], 'women: the marathon values equal the cited chart');
const SC = women.same_city;
eq(SC.rule, { half: 'use_sex, >=1,000 finishes, >=100 recorded women and men', marathon: 'not a gender-gap edition, <=2% unrecorded, >=80% of raw records kept, >=1,000 finishes, >=100 of each sex' }, 'women.same_city: the rule');
const labelCities = new Set(Object.keys(policy.same_city_labels));
const pairKeys = new Set();
for (const p of SC.pairs) {
  const where = `women.same_city ${p.city} ${p.year}`;
  ok(labelCities.has(p.city), `${where}: a marathon city of the reviewed label list`);
  ok(!pairKeys.has(`${p.city} ${p.year}`), `${where}: one pair per city and year`);
  pairKeys.add(`${p.city} ${p.year}`);
  for (const side of ['half', 'marathon']) {
    const c = p[side];
    ok(int(c.n, 1000) && int(c.F, D.MIN_CELL) && int(c.M, D.MIN_CELL) && c.F + c.M <= c.n, `${where}: the ${side} side holds at least 1,000 finishes and 100 of each recorded sex`);
  }
  ok(1 - (p.half.F + p.half.M) / p.half.n <= 0.05, `${where}: the half edition’s sex is at least 95% recorded`);
}
eq(SC.pairs.map((p) => `${p.city}\u0000${p.year}`), SC.pairs.map((p) => `${p.city}\u0000${p.year}`).sort(), 'women.same_city: pairs in city and year order');
eq(SC.summary, D.sameCitySummary(SC.pairs), 'women.same_city.summary from the pair counts');
eq(SC.cities, D.cityRows(SC.pairs), 'women.same_city.cities: the mean of each city’s pairs');
ok(SC.all_scope_check.pairs >= SC.summary.pairs && SC.all_scope_check.cities >= SC.summary.cities && SC.all_scope_check.half_higher <= SC.all_scope_check.pairs, 'women.same_city.all_scope_check: a superset of the verified pairs');
let cohort = null;
if (opt.shards) {
  const strings = new Map();
  const { normaliseName, loadCohort } = require('./charts/cohort.cjs');
  for (const [where, v] of fileStrings) { const n = normaliseName(v); if (n && n.includes(' ')) strings.set(n, where); }
  cohort = loadCohort({ root: ROOT, dataRoot: rel('public/data'), strings });
  eq(cohort.nameHits, [], 'no half file string equals a recorded runner name');
  eq(cohort.manifestSha, manifest.marathon.runner_manifest_sha256, 'the shards read are the bound runner manifest');
  const E = cohort.editions.length, n = new Int32Array(E), f = new Int32Array(E), m = new Int32Array(E);
  for (let i = 0; i < cohort.n; i++) { const e = cohort.edition[i]; n[e]++; if (cohort.gender[i] === 2) f[e]++; else if (cohort.gender[i] === 1) m[e]++; }
  const byKey = new Map(cohort.editions.map((ed, e) => [`${ed.city}\u0000${ed.year}`, e]));
  for (const p of SC.pairs) {
    const e = byKey.get(`${p.city}\u0000${p.year}`);
    if (!ok(e !== undefined, `women.same_city ${p.city} ${p.year}: a marathon edition of the adopted release`)) continue;
    eq(p.marathon, { F: f[e], M: m[e], n: n[e] }, `women.same_city ${p.city} ${p.year}: the marathon side recounted from the runner shards`);
    const passes = !cohort.genderGapEdition[e] && 1 - (f[e] + m[e]) / n[e] <= 0.02 && n[e] >= 0.8 * cohort.rawN[e] && n[e] >= 1000 && f[e] >= 100 && m[e] >= 100;
    ok(passes, `women.same_city ${p.city} ${p.year}: the marathon passes the charts’ sex rule`);
  }
}

// ---------- 6. linked.json and the tool file: consistency ----------
const Q = linked.Q;
eq(Q, Array.from({ length: 19 }, (_, i) => Math.round(0.05 * (i + 1) * 100) / 100), 'linked: the 19 quantile levels');
const S = linked.set;
eq([S.pairs, S.people, S.marathon_editions, S.half_editions], [setB.pairs, setB.people, setB.marathon_editions, setB.half_editions], 'linked.set: the manifest’s set B');
eq(S.women_pairs + S.men_pairs, S.pairs, 'linked.set: recorded women’s and men’s pairs make every pair');
ok(int(S.pairs, D.MIN_CELL) && int(S.marathon_editions, D.MIN_EDITIONS) && S.people <= S.pairs && S.marathon_cities <= S.marathon_editions, 'linked.set: floors');
eq(S.window_days, manifest.link_rules.window_days, 'linked.set: the pairing window');
eq(S.verified_half_share, D.sh(linked.checks.verified.pairs / S.pairs), 'linked.set: the verified half share is the verified pairs over all pairs');
const ov = linked.overall;
const xs = ['p10', 'p25', 'p50', 'p75', 'p90'].map((k) => ov.extra_s[k]);
ok(xs.every((v, i) => !i || v >= xs[i - 1]), 'linked.overall: the extra over double rises with its level');
const ud = ['0', '10', '20', '30', '40'].map((k) => ov.under_double_plus_min[k]);
ok(ud.every((v, i) => D.isShareOf(v, S.pairs) && (!i || v >= ud[i - 1])), 'linked.overall: within double plus 0–40 minutes rises, each an exact share of the pairs');
ok(D.isShareOf(ov.sustained, S.pairs), 'linked.overall: the sustained-slowdown share is an exact share of the pairs');
ok((ov.ratio_p50 > 2) === (ov.extra_s.p50 > 0), 'linked.overall: the multiple and the minutes over double agree in sign');

const GROUP_N = { all: S.pairs, F: S.women_pairs, M: S.men_pairs };
const byH = {};
for (const g of ['all', 'F', 'M']) {
  const ws = linked.windows[g];
  byH[g] = new Map(ws.map((w) => [w.h, w]));
  ok(ws.length >= 2, `linked.windows.${g}: a published range`);
  ws.forEach((w, i) => {
    const where = `linked.windows.${g} ${D.clock(w.h)}`;
    ok(w.h % 60 === 0 && w.h >= 4200 && w.h <= 9900 && (!i || w.h === ws[i - 1].h + 60), `${where}: whole minutes, contiguous, inside 1:10–2:45`);
    ok(int(w.n, D.MIN_CELL) && int(w.e, D.MIN_EDITIONS) && w.e <= w.n && w.e <= S.marathon_editions && w.n <= GROUP_N[g], `${where}: at least 100 pairs from 3 marathon editions`);
    ok(int(w.edge_min, D.MIN_EDGE_SLICE), `${where}: every one-minute edge slice holds at least 10 pairs`);
    ok(w.q.length === 19 && w.q.every((v, k) => finite(v) && (!k || v >= w.q[k - 1])), `${where}: 19 non-decreasing quantiles`);
    ok(w.q.every((v) => Number.isInteger(v) || Math.abs(v * 10 - Math.round(v * 10)) < 1e-6), `${where}: quantiles in seconds or one decimal`);
    ok(D.isShareOf(w.sus, w.n) && D.isShareOf(w.under_double, w.n), `${where}: exact shares of its pairs`);
    ok(finite(w.extra_p50), `${where}: the extra over double`);
    const times = w.marks.map(([t]) => t);
    eq(times, D.markTimes(w.q), `${where}: the marks are the quarter-hours inside p05–p95 nearest the median`);
    w.marks.forEach(([t, s], k) => {
      ok(D.isShareOf(s, w.n), `${where}: the share under ${D.clock(t)} is an exact share of its pairs`);
      const [lo, hi] = D.shareBounds(w.q, Q, t, w.n);
      ok(s >= lo - 1e-12 && s <= hi + 1e-12, `${where}: the share under ${D.clock(t)} (${s}) keeps the bounds of its quantiles [${lo}, ${hi}]`);
      ok(!k || (t > w.marks[k - 1][0] && s >= w.marks[k - 1][1]), `${where}: marks rise with time`);
    });
  });
}
for (const [h, w] of byH.all) {
  const f = byH.F.get(h), m = byH.M.get(h);
  if (f && m) eq(f.n + m.n, w.n, `linked.windows ${D.clock(h)}: recorded women’s and men’s pairs make every pair`);
  if (f) ok(f.n < w.n, `linked.windows ${D.clock(h)}: women’s within all`);
  if (m) ok(m.n < w.n, `linked.windows ${D.clock(h)}: men’s within all`);
}
for (const g of ['F', 'M']) for (const h of byH[g].keys()) ok(byH.all.has(h), `linked.windows.${g} ${D.clock(h)}: inside the all-pairs range`);
// The goal rows: the slowest window whose median is under the goal, recomputed, with clean crossings.
eq(linked.goals.map((g) => g.goal_s), [10800, 12600, 14400, 16200, 18000], 'linked.goals: the five goal pages');
for (const goal of linked.goals) {
  const where = `linked.goals ${D.clock(goal.goal_s)}`;
  const all = D.goalRow(linked.windows.all, goal.goal_s, true);
  ok(all && all.clean, `${where}: a clean crossing in the all-pairs windows`);
  eq(goal.all, all && all.row, `${where}: all pairs`);
  for (const g of ['F', 'M']) {
    const row = D.goalRow(linked.windows[g], goal.goal_s, false);
    ok(!row || row.clean, `${where}: a clean ${g} crossing`);
    eq(goal[g], row ? row.row : null, `${where}: recorded ${g}`);
  }
}
// The sex strata and the checks.
const sx = linked.sexes;
eq(sx.rule, 'half band x marathon city, >=20 pairs per sex', 'linked.sexes: rule');
ok(int(sx.strata, 1) && int(sx.women_lower) && sx.women_lower <= sx.strata, 'linked.sexes: women lower in at most every stratum');
close(sx.diff_points, 100 * (sx.men_std - sx.women_std), 1e-6, 'linked.sexes: the gap is men’s minus women’s');
const C = linked.checks;
ok(C.verified.sexes.women_lower <= C.verified.sexes.strata && C.verified.sexes.strata <= sx.strata, 'linked.checks.verified.sexes: a subset of strata');
const bat = Object.fromEntries(C.battery.members.map((m) => [m.id, m]));
eq(Object.keys(bat), [...BATTERY_IDS], 'linked.checks.battery: the ten weighting members (spec 2.4; verified_federation and verified_road pre-registered October 30, 2026)');
eq([bat.pooled.n, bat.pooled.extra_p50_s, bat.pooled.multiple_p50, bat.pooled.under_double], [S.pairs, ov.extra_s.p50, ov.ratio_p50, ov.under_double_plus_min['0']], 'battery: the pooled member is the overall reading');
eq([bat.verified_halves.n, bat.verified_halves.extra_p50_s, bat.verified_halves.under_double], [C.verified.pairs, C.verified.extra_p50_s, C.verified.under_double], 'battery: verified halves are the verified check');
eq([bat.other_marathons.n, bat.other_marathons.extra_p50_s], [C.other_marathons.pairs, C.other_marathons.extra_p50_s], 'battery: other marathons');
eq([bat.ns_keys_1.n, bat.one_per_person.n], [C.ns_keys_1.pairs, C.one_per_person.pairs], 'battery: rarest names and one pair per person');
eq(C.one_per_person.pairs, S.people, 'linked.checks.one_per_person: one pair per person');
eq([bat.editions_equal_20.n, bat.editions_equal_20.extra_p50_s, bat.editions_equal_20.under_double], [C.editions_equal.editions, C.editions_equal.extra_p50_s, C.editions_equal.under_double], 'battery: editions equal (20 pairs) is the editions-equal check');
ok(bat.editions_equal_100.n <= bat.editions_equal_20.n && bat.city_equal.n <= S.marathon_cities, 'battery: group counts');
for (const m of Object.values(bat)) {
  ok(m.id.startsWith('editions_equal') || m.id === 'city_equal' ? int(m.n, D.MIN_EDITIONS) : int(m.n, D.MIN_CELL), `battery ${m.id}: floors`);
  if (m.id !== 'pooled' && !m.id.startsWith('editions') && m.id !== 'city_equal') ok(m.n < bat.pooled.n, `battery ${m.id}: a subset of the pairs`);
  ok(finite(m.multiple_p50) && finite(m.extra_p50_s) && m.under_double >= 0 && m.under_double < 1, `battery ${m.id}: values`);
  if (!m.id.startsWith('editions') && m.id !== 'city_equal') ok(D.isShareOf(m.under_double, m.n), `battery ${m.id}: an exact share of its pairs`);
}
ok(!!bat.verified_federation && !!bat.verified_road && bat.verified_federation.n <= bat.verified_halves.n && bat.verified_road.n <= bat.verified_halves.n, 'battery: verified_federation and verified_road are subsets of the verified halves');
// The one-verified-half-edition-out variants of verified_halves and verified_federation (pre-registered October 30,
// 2026): the clauses each must pass, as its member does; counts that add up; the worst variant of each clause is the
// member without one edition, at or over the floor, an exact share of its pairs; a clause no variant fails is one its worst
// variant passes, and one some variant fails is one its worst variant fails.
{
  const LO = C.battery.leave_outs || {};
  eq(Object.keys(LO).sort(), Object.keys(D.LEAVE_OUTS).sort(), 'battery.leave_outs: verified_halves and verified_federation');
  const pooledExtra = bat.pooled.extra_p50_s, half = C.battery.pooled_half_p50_s;
  for (const [id, clauses] of Object.entries(D.LEAVE_OUTS)) {
    const x = LO[id];
    if (!ok(x && typeof x === 'object' && bat[id], `battery.leave_outs.${id}: present, with its member`)) continue;
    const keys = clauses.flatMap((c) => D.WORST[c]);
    eq([Object.keys(x.failing).sort(), Object.keys(x.worst).sort()], [[...clauses].sort(), [...keys].sort()], `battery.leave_outs.${id}: its clauses and worst variants`);
    ok(int(x.variants, 1) && int(x.under_floor) && x.under_floor <= x.variants && int(x.failed) && x.failed <= x.variants && x.failed >= x.under_floor, `battery.leave_outs.${id}: counts`);
    ok(x.variants <= bat[id].n && x.variants <= S.half_editions, `battery.leave_outs.${id}: at most one variant per half edition of the member`);
    for (const c of clauses) {
      ok(int(x.failing[c]) && x.failing[c] <= x.failed - x.under_floor, `battery.leave_outs.${id}: failing ${c}`);
      for (const k of D.WORST[c]) {
        const w = x.worst[k];
        if (w === null) { ok(x.under_floor === x.variants && x.failing[c] === 0, `battery.leave_outs.${id}.worst.${k}: null only when every variant is under the floor`); continue; }
        ok(int(w.half_edition) && int(w.left_out, 1) && int(w.n, D.MIN_CELL) && w.n + w.left_out === bat[id].n, `battery.leave_outs.${id}.worst.${k}: the member without one edition, at or over the floor`);
        ok(finite(w.multiple_p50) && finite(w.extra_p50_s) && D.isShareOf(w.under_double, w.n), `battery.leave_outs.${id}.worst.${k}: values, an exact share of its pairs`);
      }
      const worst = D.WORST[c].map((k) => x.worst[k]);
      if (worst.every(Boolean)) eq(worst.every((w) => D.passes(c, w, pooledExtra, half)), x.failing[c] === 0, `battery.leave_outs.${id}: its worst variants pass ${c} exactly when no variant fails it`);
    }
    if (x.worst.multiple_low && x.worst.multiple_high) ok(x.worst.multiple_low.multiple_p50 <= x.worst.multiple_high.multiple_p50, `battery.leave_outs.${id}: the band's two sides in order`);
  }
}
ok(C.no_union_people.pairs <= S.pairs && C.ns_keys_1.pairs <= S.pairs && C.other_marathons.pairs < S.pairs, 'linked.checks: subsets of set B');
for (const k of ['verified', 'editions_equal', 'other_marathons', 'ns_keys_1', 'one_per_person']) ok(C[k].w105_under_14400 > 0 && C[k].w105_under_14400 < 1, `linked.checks.${k}: the 1:45 check share`);
ok(C.battery.pooled_half_p50_s >= linked.windows.all[0].h && C.battery.pooled_half_p50_s <= linked.windows.all.at(-1).h, 'linked.checks.battery: the pooled median half lies in the published range');
// /methodology only: the multiple by 5-minute band, the marathon cities, link coverage by city.
{
  const bands = C.multiple_by_band, all = linked.windows.all;
  eq(bands.map((b) => b.h), all.filter((w) => w.h % 300 === 0).map((w) => w.h), 'linked.checks.multiple_by_band: every 5-minute band of the all-pairs range');
  for (const b of bands) {
    const w = all.find((x) => x.h === b.h);
    // Every half in the window lies in [h − 150, h + 150), so the median multiple lies between the median marathon over those ends.
    ok(w && b.ratio_p50 >= D.r(w.q[9] / (b.h + 150), 4) && b.ratio_p50 <= D.r(w.q[9] / (b.h - 150), 4), `linked.checks.multiple_by_band ${b.h}: within the bounds its window's median allows`);
  }
  const cities = C.by_city;
  ok(cities.every((c) => int(c.pairs, D.MIN_CELL) && int(c.e, D.MIN_EDITIONS) && finite(c.multiple_p50) && finite(c.extra_p50_s) && D.isShareOf(c.under_double, c.pairs) && D.isShareOf(c.verified_half_share, c.pairs)
    && (c.mid === null || (int(c.mid.pairs, D.MIN_CELL) && int(c.mid.e, D.MIN_EDITIONS) && c.mid.pairs <= c.pairs && c.mid.e <= c.e && finite(c.mid.extra_p50_s)))), 'linked.checks.by_city: floors and exact shares');
  eq(cities.map((c) => c.city), cities.map((c) => c.city).sort(), 'linked.checks.by_city: in city order');
  ok(cities.reduce((a, c) => a + c.pairs, 0) <= S.pairs && cities.length <= S.marathon_cities && cities.reduce((a, c) => a + c.e, 0) <= S.marathon_editions, 'linked.checks.by_city: within set B');
  // The battery's city_equal member is the median over exactly these cities.
  eq(bat.city_equal.n, cities.length, 'linked.checks.by_city: the city_equal member’s cities');
  close(bat.city_equal.extra_p50_s, D.npMedian(cities.map((c) => c.extra_p50_s)), 0.05, 'linked.checks.by_city: city_equal’s minutes are the median city’s');
  close(bat.city_equal.multiple_p50, D.npMedian(cities.map((c) => c.multiple_p50)), 5e-5, 'linked.checks.by_city: city_equal’s multiple is the median city’s');
  close(bat.city_equal.under_double, D.npMedian(cities.map((c) => c.under_double)), 1e-9, 'linked.checks.by_city: city_equal’s under-double share is the median city’s');
  // Where the pairs come from (verify round 1, October 31, 2026), over every marathon city: the fewest cities, most pairs
  // first (ties by name), holding more than half of the pairs, each at least 100 pairs, no more pairs or editions than set
  // B, and a city that is also in by_city carries by_city's pairs and editions. Minimal: without the last city they hold
  // half or less, and no city outside them holds more pairs than the last (the list is the largest ones).
  const PF = C.pairs_from;
  if (PF !== null) {
    ok(Array.isArray(PF.cities) && PF.cities.length > 0 && PF.cities.length <= S.marathon_cities && PF.cities.every((c) => typeof c.city === 'string' && int(c.pairs, D.MIN_CELL) && int(c.e, 1))
      && new Set(PF.cities.map((c) => c.city)).size === PF.cities.length, 'linked.checks.pairs_from: distinct cities of at least 100 pairs');
    eq(PF.pairs, PF.cities.reduce((a, c) => a + c.pairs, 0), 'linked.checks.pairs_from: its pairs are its cities’');
    ok(PF.cities.every((c, i) => !i || c.pairs < PF.cities[i - 1].pairs || (c.pairs === PF.cities[i - 1].pairs && c.city > PF.cities[i - 1].city)), 'linked.checks.pairs_from: most pairs first, ties by name');
    ok(2 * PF.pairs > S.pairs && 2 * (PF.pairs - PF.cities.at(-1).pairs) <= S.pairs && PF.pairs <= S.pairs && PF.cities.reduce((a, c) => a + c.e, 0) <= S.marathon_editions, 'linked.checks.pairs_from: the fewest cities holding more than half of the pairs');
    for (const c of PF.cities) { const b = cities.find((x) => x.city === c.city); if (b) eq([c.pairs, c.e], [b.pairs, b.e], `linked.checks.pairs_from ${c.city}: by_city’s pairs and editions`); }
    // A by_city city not in the list holds no more pairs than the list's last (the list takes the largest first).
    ok(cities.every((b) => PF.cities.some((c) => c.city === b.city) || b.pairs < PF.cities.at(-1).pairs || (b.pairs === PF.cities.at(-1).pairs && b.city > PF.cities.at(-1).city)), 'linked.checks.pairs_from: no city of by_city outside it holds more pairs than its last');
    if (cohort) for (const c of PF.cities) ok(cohort.editions.some((e) => e.city === c.city), `linked.checks.pairs_from ${c.city}: a marathon city of the adopted release`);
  }
  const cov = C.coverage;
  ok(Array.isArray(cov) && cov.length >= 2 && cov.every((c) => int(c.finishes, 1000) && D.isShareOf(c.share, c.finishes) && Math.round(c.share * c.finishes) >= D.MIN_CELL), 'linked.checks.coverage: floors (1,000 finishes, 100 linked) and exact shares');
  ok(cov.every((c, i) => !i || c.share < cov[i - 1].share || (c.share === cov[i - 1].share && c.city > cov[i - 1].city)), 'linked.checks.coverage: by share');
  if (cohort) {
    const eligible = new Map();
    for (let i = 0; i < cohort.n; i++) { const city = cohort.editions[cohort.edition[i]].city; eligible.set(city, (eligible.get(city) || 0) + 1); }
    for (const c of cov) eq(c.finishes, eligible.get(c.city), `linked.checks.coverage ${c.city}: the eligible finishes, recounted from the runner shards`);
    for (const c of cities) ok(eligible.has(c.city), `linked.checks.by_city ${c.city}: a marathon city of the adopted release`);
  }
}
const guard = D.flagshipGuard(linked);
console.log(JSON.stringify({ flagship_guard: guard }));

// The tool file is linked.json, window for window.
eq([tool.schema_version, tool.family, tool.scope, tool.window_s, tool.Q], [1, 'half-tool', 'linked', 300, Q], 'tools/half-to-full.json: header');
eq(Object.keys(tool.groups).sort(), ['F', 'M', 'all'], 'tools/half-to-full.json: groups');
for (const g of ['all', 'F', 'M']) {
  const ws = linked.windows[g], t = tool.groups[g];
  eq([t.from, t.to], [ws[0].h, ws.at(-1).h], `tools/half-to-full.json ${g}: its range is linked.json’s`);
  eq(t.w, ws.map((w) => [w.n, w.e, w.sus, w.q, w.marks]), `tools/half-to-full.json ${g}: every window equals linked.json’s`);
  const probe = D.windowFor(tool, t.from + 89, g);
  eq(probe && probe.h, t.from + 60, `tools/half-to-full.json ${g}: a typed half reads its nearest whole minute`);
  eq(D.windowFor(tool, t.from - 31, g), null, `tools/half-to-full.json ${g}: nothing outside the range`);
}

// The cards draw their sources' values.
eq(cards.family, 'half-cards', 'cards.json: family');
const card = Object.fromEntries(cards.cards.map((c) => [c.slug, c]));
eq(Object.keys(card), ['half-under-2', 'half-more-women', 'half-double', 'half-same-half'], 'cards.json: the four unnumbered cards');
{
  const u = field.under.find((x) => x.s === 7200);
  const c1 = card['half-under-2'];
  eq([c1.scope, c1.source, c1.values, c1.plot.parts[0].share], ['verified', { file: 'field.json', path: 'under[s=7200].all' },
    { editions: field.cohort.editions, finishes: field.cohort.finishes, men_under_7200: u.M, under_7200: u.all, women_under_7200: u.F }, u.all], 'card half-under-2');
  const c2 = card['half-more-women'];
  // The marathon is the hollow ring and the half the filled dot (the page's key), under the two medians as a signal row.
  eq([c2.scope, c2.plot.a, c2.plot.b, c2.plot.rows], ['verified', 'Marathon', 'Half',
    [{ a: SC.summary.marathon_median, b: SC.summary.half_median, label: 'Typical', tone: 'signal' }, ...SC.cities.map((c) => ({ a: c.marathon, b: c.half, label: c.city }))]],
  'card half-more-women: the typical row and the city rows');
  eq(c2.values, { cities: SC.summary.cities, half_higher: SC.summary.half_higher, half_median: SC.summary.half_median, marathon_median: SC.summary.marathon_median, pairs: SC.summary.pairs }, 'card half-more-women: values');
  const c3 = card['half-double'];
  const [u0, u20] = [ov.under_double_plus_min['0'], ov.under_double_plus_min['20']];
  eq([c3.scope, c3.plot.parts.map((p) => [p.share, p.tone]), c3.values], ['linked', [[u0, 'signal'], [D.sh(u20 - u0), 'ink']],
    { extra_p50_s: ov.extra_s.p50, pairs: S.pairs, under_double: u0, within_20: u20 }], 'card half-double: under double, then within 20 minutes over it');
  const c4 = card['half-same-half'];
  const rows = [5400, 6300, 7200, 8100].filter((h) => byH.F.has(h) && byH.M.has(h));
  const flag = Math.round(linked.checks.battery.pooled_half_p50_s / 300) * 300;
  eq(c4.scope, 'linked', 'card half-same-half: scope');
  // The men's share is the ring and the women's the filled dot, which the signal row lights: the women's share the
  // takeaway prints in orange is the orange mark (round 2 review).
  eq([c4.plot.a, c4.plot.b], ['Recorded men’s', 'Recorded women’s'], 'card half-same-half: the ring is the men’s share, the filled dot the women’s');
  eq(c4.plot.rows, rows.map((h) => ({ a: byH.M.get(h).sus, b: byH.F.get(h).sus, label: D.clock(h), ...(h === flag ? { tone: 'signal' } : {}) })),
    'card half-same-half: the windows at 1:30, 1:45, 2:00 and 2:15, the flagship band the signal row');
  eq(c4.values, Object.fromEntries(rows.flatMap((h) => [[`F_${h}`, byH.F.get(h).sus], [`M_${h}`, byH.M.get(h).sus]]).sort(([a], [b]) => (a < b ? -1 : 1))), 'card half-same-half: values');
}

const withdrawnCards = [];
// The guards the --html page rules follow (section 9), read from the nuggets in section 7.
const pageGuards = {};
// ---------- 7. Words: the half nuggets, deks and tool sentences ----------
{
  const ts = require('typescript');
  for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true },
  }).outputText, filename);
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) { return resolve.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest); };
  const N = require(path.join(ROOT, 'lib/nuggets/half.ts'));
  const T = require(path.join(ROOT, 'lib/tools/half-to-full.ts'));
  const texts = [];
  const plain = (s) => String(s).replace(/\*/g, '');
  for (const [id, build] of Object.entries(N.HALF_NUGGETS)) {
    const n = build();
    texts.push([`${id} headline`, n.headline], [`${id} fallback`, n.fallback]);
    if (n.key) texts.push([`${id} key`, n.key]);
    if (n.figure) texts.push([`${id} figure`, `${n.figure.value} ${n.figure.sr || ''}`]);
    ok((String(n.headline).match(/\*/g) || []).length <= 2, `${id}: at most one accent`);
  }
  for (const [k, v] of Object.entries(N.halfDeks())) if (typeof v === 'string') texts.push([`deks.${k}`, v]);
  const sexes = N.halfSexesFrom(linked);
  Object.assign(pageGuards, { cities: N.halfCitiesFrom(women).guard, extra: N.halfExtraFrom(linked).guard, sexes: sexes.guard, sexesHeadline: plain(sexes.headline), sexesFallback: plain(sexes.fallback),
    guess: N.halfSexesGuessFrom(linked).guard && N.halfDeks().guess !== null });
  for (const g of ['all', 'F', 'M']) {
    for (const w of linked.windows[g]) {
      const win = T.fromLinked(w);
      texts.push([`tool ${g} ${w.h}`, T.linkedSentence(win, Q, g)], [`tool ${g} ${w.h} slowdown`, T.slowdownSentence(win, g)], ...T.markLabels(win).map((s) => [`tool ${g} mark`, s]));
      // A sex's sentences name recorded sex where they name the marathons (round 4 review, October 30, 2026).
      if (g !== 'all') for (const said of [T.linkedSentence(win, Q, g), T.slowdownSentence(win, g)]) ok(said.includes(`recorded ${g === 'F' ? 'women’s' : 'men’s'} marathon`), `tool ${g} ${w.h}: names recorded sex: ${said}`);
    }
  }
  for (const g of ['F', 'M']) texts.push([`tool too few ${g}`, T.tooFewSentence(tool, g)], [`tool too few ${g} near a half`, T.tooFewSentence(tool, g, 5100)]);
  texts.push(['tool linked line', T.LINKED_LINE], ['tool out of range', T.outOfRangeSentence(tool.groups.all)]);
  for (const goal of linked.goals) for (const [k, v] of Object.entries(T.goalLines(goal))) if (v && k !== 'link') texts.push([`goal ${goal.goal_s} ${k}`, v]);
  texts.push(['not a prediction', T.NOT_A_PREDICTION]);
  // The words of the "From the half" cards (lib/charts/text/half.ts), held to the Top 100's card rules: the guard
  // holds for this build, titles fit 47 characters, one accent, a takeaway of at most 150 characters; a card of records
  // linked by name says so (and its footer carries the chip, scripts/half/card-images.cjs); a verified card does not.
  // A card whose takeaway's guard fails for this build is withdrawn, never drawn with words its page has fallen back
  // from: no PNG (scripts/half/card-images.cjs draws only holding cards; --check reports a leftover as an orphan) and no
  // "Save the image" link (--html, section 9).
  const CW = require(path.join(ROOT, 'lib/charts/text/half.ts'));
  const docs = { field, women, linked };
  // The published captions (docs/CHARTS_INSTAGRAM.md, written by node scripts/build-chart-cards.cjs --captions) are the
  // cards' own words: a drawn card's caption is its title and its takeaway as the PNG prints it, and a withdrawn card
  // has none (post-merge review, round 2, October 31, 2026: half-under-2 was re-stamped with new words while its caption
  // kept the old ones).
  const captionsDoc = fs.existsSync(rel('docs/CHARTS_INSTAGRAM.md')) ? fs.readFileSync(rel('docs/CHARTS_INSTAGRAM.md'), 'utf8') : '';
  const halfCaptions = captionsDoc.slice(Math.max(0, captionsDoc.indexOf('\n## From the half (not numbered)\n')));
  for (const c of cards.cards) {
    const said = CW.HALF_CARD_TEXT[c.slug].words(c.values, docs);
    const words = CW.halfCardWords(c, docs);
    const png = fs.existsSync(rel(`public/charts/cards/${c.slug}.png`));
    if (said.guard) ok(halfCaptions.includes(`\n### ${words.title}\n\n\`${c.slug}.png\`\n\n${words.plain}\n`), `card ${c.slug}: its caption in docs/CHARTS_INSTAGRAM.md is not its title and takeaway (node scripts/build-chart-cards.cjs --captions)`);
    else ok(!halfCaptions.includes(`\`${c.slug}.png\``), `card ${c.slug}: withdrawn, but docs/CHARTS_INSTAGRAM.md still carries its caption (node scripts/build-chart-cards.cjs --captions)`);
    ok(said.guard === png, said.guard ? `card ${c.slug}: its guard holds but public/charts/cards/${c.slug}.png is missing (node scripts/build-chart-cards.cjs --set half)`
      : `card ${c.slug}: the takeaway's guard fails for this build, so the card is withdrawn; delete public/charts/cards/${c.slug}.png or rewrite the card's words (${said.fallback})`);
    if (!said.guard) withdrawnCards.push(c.slug);
    for (const t of [said.title, said.titleFallback]) ok(t.length <= 47, `card ${c.slug}: the title "${t}" is over 47 characters`);
    ok((said.headline.match(/\*/g) || []).length === 2, `card ${c.slug}: the takeaway has exactly one *…* accent`);
    ok(words.plain.length <= 150, `card ${c.slug}: the takeaway is ${words.plain.length} characters (at most 150)`);
    ok(/records linked by name/.test(words.plain) === (c.scope === 'linked'), `card ${c.slug}: "records linked by name" exactly when the card is linked`);
    eq(words.chip, c.scope === 'linked' ? 'Includes unverified half results' : null, `card ${c.slug}: the chip only on a linked card`);
    texts.push([`card ${c.slug} title`, said.title], [`card ${c.slug} title fallback`, said.titleFallback], [`card ${c.slug} takeaway`, said.headline],
      [`card ${c.slug} fallback`, said.fallback], [`card ${c.slug} kicker`, `${words.kicker} ${words.theme}`]);
  }
  const rules =[...W.BANNED, ...W.HALF_BANNED, ...W.STATUS_WORDS, ...W.VERIFICATION_WORDS];
  for (const [where, text] of texts) {
    const found = W.wordProblems(plain(text), rules);
    ok(!found.length, `${where}: ${found.join(', ')}: ${text}`);
    ok(!W.RELEASE_LABEL.test(text), `${where}: a release label`);
    ok(!/\bran\b/.test(plain(text)) || !/records/.test(plain(text)), `${where}: records are linked, they never ran: ${text}`);
  }
  ok(texts.length > 300, `words: ${texts.length} half sentences checked`);
  // The client sources whose strings show on a half surface (the loader's messages, the predictor's half panel, the
  // story's predictor link, the strip): their string literals and JSX text, comments removed, keep the status and
  // verification words off, since --html sees only the server render (round 4 review, October 30, 2026: the loader's
  // "could not be verified" showed under the chip on a digest mismatch).
  for (const file of ['lib/half.ts', 'components/tools/LinkedPanel.tsx', 'components/half/PredictorLink.client.tsx', 'components/tools/FinishStrip.tsx']) {
    const src = fs.readFileSync(rel(file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    const strings = [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|>([^<>{}]*[A-Za-z][^<>{}]*)</g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]).filter((t) => /[A-Za-z]{2,}\s+[A-Za-z]/.test(t));
    ok(strings.length > 0, `${file}: its client strings were read`);
    for (const t of strings) for (const [re, what] of [...W.STATUS_WORDS, ...W.VERIFICATION_WORDS]) ok(!re.test(t), `${file}: ${what} in a string a half surface shows: ${t}`);
  }
}

// ---------- 8. The source-recount receipt ----------
{
  const receiptPath = 'docs/evidence/half/source-recount.json';
  if (ok(fs.existsSync(rel(receiptPath)), `${receiptPath} is missing: run npm run verify:half-source locally (docs/HALF_MARATHON.md)`)) {
    const receipt = readJson(receiptPath);
    eq([receipt.schema_version, receipt.family, receipt.status, receipt.mismatches], [1, 'half-source-recount', 'pass', 0], 'the source recount passed with no mismatches');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(receipt.date), 'the receipt carries a date only');
    const stale = (what) => `the source-recount receipt is stale (${what}): rerun npm run verify:half-source locally`;
    ok(receipt.manifest_sha256 === sha(manifestBytes), stale('the half data were rebuilt'));
    ok(receipt.verify_half_source_sha256 === fileSha('scripts/verify-half-source.cjs'), stale('scripts/verify-half-source.cjs changed'));
    ok(receipt.recount_scripts && receipt.recount_scripts['scripts/verify-half-source.cjs'] === receipt.verify_half_source_sha256, 'the receipt lists the recount script');
    for (const [name, digest] of Object.entries(receipt.recount_scripts || {})) ok(fs.existsSync(rel(name)) && digest === fileSha(name), stale(`${name} changed`));
    ok(receipt.half_sqlite_sha256 === pin.half.sqlite_sha256, stale('another half snapshot'));
    ok(receipt.links_extract_content_sha256 === pin.links.extract_content_sha256, stale('another links extract'));
    ok(receipt.stamp_reference_sha256 === REF.sha256 && receipt.edition_meta_csv_sha256 === pin.half.assets['csv-edition_meta.csv.zst'], stale('another stamp reference or edition_meta CSV'));
    // The marks whose fit windows reach under the published minutes are recounted only there (section 4).
    if (sourceOnlyFits.length) ok(receipt.files && receipt.files['field.json'] && receipt.files['field.json'].mismatches === 0 && receipt.tolerances && receipt.tolerances['field.json marks[].expected_minute_before'] === 0.05,
      `field.marks ${sourceOnlyFits.join(', ')}: the source recount refits their smooth curve within 0.05`);
    ok(receipt.runner_manifest_sha256 === sha(runnerBytes), stale('the runner manifest changed'));
    ok(receipt.policy_sha256 === sha(policyBytes), stale('the policy changed'));
    ok(int(receipt.values_checked, 1000), 'the receipt counts the values it checked');
    if (receipt.counts) {
      const { set_b: recountedSetB, marathon: recountedMarathon, ...recounted } = receipt.counts;
      eq(recounted, policyCounts, 'the recounted policy counts are the manifest’s');
      eq(recountedSetB, setB, 'the recounted set B is the manifest’s');
      ok(recountedMarathon && recountedMarathon.eligible === runners.eligible_records, 'the recount read every eligible marathon finish');
    } else ok(false, 'the receipt carries its recounted counts');
    eq(Object.keys(receipt.files || {}).sort(), Object.keys(manifest.files).sort(), 'the receipt recounted every published file');
    for (const [name, c] of Object.entries(receipt.files || {})) ok(int(c.values, 1) && c.mismatches === 0, `the receipt recounted ${name} without a mismatch`);
    const text = fs.readFileSync(rel(receiptPath), 'utf8');
    ok(!/"(person_id|record_id|edition_id|runner|name|bib|url)"/.test(text), 'the receipt holds no row data');
  }
}

// ---------- 9. --html: the built pages (spec 9) ----------
if (opt.html) {
  const page = (route) => [`${route.slice(1) || 'index'}.html`, `${route.slice(1)}/index.html`].map((f) => path.join(opt.out, f)).find((f) => fs.existsSync(f));
  ok(page('/half') && page('/stories/half-to-full') && page('/methodology'), `--html needs the build in ${path.relative(ROOT, opt.out)}: run npm run build first`);
  const pages = [];
  (function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== '_next') walk(f); } else if (e.name.endsWith('.html')) pages.push(f); } })(opt.out);
  const routeOf = (file) => '/' + path.relative(opt.out, file).replace(/\\/g, '/').replace(/(\/index)?\.html$/, '').replace(/^index$/, '');
  const noScripts = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<template\b[\s\S]*?<\/template>/g, '');
  const textOf = (html) => html.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&rsquo;|&#39;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  // The element that starts at `start` (its start tag) up to its matching end tag.
  const elementAt = (html, start) => {
    const name = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))[1];
    const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'g');
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(html))) {
      if (m[2] === '/') { if (!depth) return html.slice(start, re.lastIndex); continue; }
      depth += m[1] ? -1 : 1;
      if (!depth) return html.slice(start, re.lastIndex);
    }
    return html.slice(start);
  };
  const elements = (html, attrRe) => {
    const out = [];
    // An attribute pattern, or a start-tag pattern when it begins with '<' (/<nav\\b/).
    const re = new RegExp(attrRe.source.startsWith('<') ? `${attrRe.source}[^>]*>` : `<[a-zA-Z][\\w-]*\\b[^>]*${attrRe.source}[^>]*>`, 'g');
    let m;
    while ((m = re.exec(html))) { out.push({ tag: m[0], html: elementAt(html, m.index), index: m.index }); }
    return out;
  };
  const remove = (html, attrRe) => { let h = html; for (const el of elements(h, attrRe).reverse()) h = h.slice(0, el.index) + ' ' + h.slice(el.index + el.html.length); return h; };
  const CHIP = /class="[^"]*\bscope-chip\b[^"]*"/;
  // Spec copy that names the tool by its short name (spec 3.2: "Your own half in the predictor →").
  const HTML_ALLOWED = ['Your own half in the predictor'];
  const LINKED_ROUTES = ['/stories/half-to-full'];
  const linkedHref = (href) => LINKED_ROUTES.some((r) => href === r || href.startsWith(`${r}#`) || href.startsWith(`${r}?`));
  const LINKED_FIGURES = [/double it plus/i, /under double the half/i, /linked by name/i, /over double the half/i];
  const methodology = fs.existsSync(path.join(opt.out, 'methodology.html')) ? fs.readFileSync(path.join(opt.out, 'methodology.html'), 'utf8') : '';
  const ids = new Set([...methodology.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ['half-data', 'half-coverage', 'half-linking', 'half-multiple', 'half-field', 'story-half-to-full', 'downloads-half', 'half-cards', 'evidence', 'sustained-slowdown']) ok(ids.has(id), `/methodology has #${id} (spec 5)`);
  // /methodology's half sentences, recounted from the files they read (v4 adoption, October 31, 2026).
  {
    const mtext = textOf(noScripts(methodology));
    const section = (id) => { const at = methodology.search(new RegExp(`\\sid="${id}"`)); return at < 0 ? '' : textOf(noScripts(elementAt(methodology, methodology.lastIndexOf('<', at)))); };
    // AGENTS rule 17: no release tag, no person-ids- name and no snapshot stamp in the page's visible text (the links keep
    // the names in their hrefs; the round-3 review found the half downloads printing them).
    ok(!W.RELEASE_LABEL.test(mtext) && !/\b20\d{6}-\d{4}\b/.test(mtext), `/methodology: a release tag or a snapshot stamp in the visible text (${(mtext.match(W.RELEASE_LABEL) || mtext.match(/\b20\d{6}-\d{4}\b/) || [''])[0]})`);
    const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
    const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const word = (k) => WORDS[k] ?? k.toLocaleString('en-US');
    // Where the pairs come from (the limits sentence, twice): linked.checks.pairs_from, the fewest marathon cities, over
    // every marathon city, holding more than half of all pairs ("most pairs are from the Valencia and Warsaw marathons" was
    // runner links v1's reading; verify round 1, October 31, 2026: by_city's cities alone left out the second-largest).
    const PFH = C.pairs_from;
    const top = PFH ? PFH.cities.map((c) => c.city) : [];
    const from = PFH && PFH.pairs * 2 > S.pairs && top.length ? `more than half of the pairs are from ${top.length === 1 ? 'one marathon' : `${word(top.length)} marathons`} (${andList(top)})` : 'the pairs come unevenly from the marathons';
    eq(mtext.split(from).length - 1, 2, `/methodology: the two limits sentences say "${from}"`);
    ok(!/most pairs (?:are|come) from/.test(mtext), '/methodology: no "most pairs are from" left from an earlier link build');
    // The story's method: while the flagship guard fails, the sentence names the clauses that fail, not an earlier build's.
    const story = section('story-half-to-full');
    const pooledM = C.battery.members.find((x) => x.id === 'pooled'), vh = C.battery.members.find((x) => x.id === 'verified_halves');
    if (!D.flagshipGuard(linked)) {
      ok(/so the story shows the pairs under a plain heading and states no reading of its own: its figure is the number of pairs\./.test(story), '#story-half-to-full: the fallback sentence, with the figure as the count');
      eq(/with verified halves only \(/.test(story), !D.passes('extra', vh, pooledM.extra_p50_s, C.battery.pooled_half_p50_s), '#story-half-to-full: names the verified-halves minutes as a reason exactly when that clause fails');
      for (const [id, clauses] of Object.entries(D.LEAVE_OUTS)) {
        const x = C.battery.leave_outs[id];
        for (const c of clauses) {
          const fails = !D.WORST[c].every((k) => x.worst[k] && D.passes(c, x.worst[k], pooledM.extra_p50_s, C.battery.pooled_half_p50_s));
          eq(story.includes(`${x.failing[c].toLocaleString('en-US')} of the ${x.variants.toLocaleString('en-US')} reruns of`) && fails, fails, `#story-half-to-full: names the failing reruns of ${id} (${c}) exactly when they fail`);
        }
      }
    } else ok(/The story states only the pooled reading\./.test(story), '#story-half-to-full: the holding guard\'s sentence');
    // How records are linked: the link-build editions, the two set B signals (review R6) and the producer's hand review.
    const linking = section('half-linking');
    const policyJson = readJson(manifest.policy.file);
    const le = policyJson.link_editions;
    if (le) {
      const k = le.link_partial.length, r = le.retimed.length;
      if (k) ok(linking.includes(`${word(k).replace(/^./, (c) => c.toUpperCase())} edition${k === 1 ? '' : 's'} loaded partly before the link build and partly after it`), '#half-linking: the link-partial editions, counted');
      if (r) ok(linking.includes(`${word(r)} edition${r === 1 ? '' : 's'} whose finish times were reloaded after it`), '#half-linking: the re-timed editions, counted');
      ok(!le.link_partial.concat(le.retimed).some((x) => linking.includes(String(x.edition_id))), '#half-linking: no edition id');
    }
    const sb = manifest.policy.counts.set_b;
    const closeDays = Number(/^CLOSE_MARATHON_DAYS = (\d+)$/m.exec(fs.readFileSync(rel('analysis/half_pairs.py'), 'utf8'))?.[1]);
    ok(linking.includes(`${sb.halves_in_two_or_more_pairs.toLocaleString('en-US')} halves are in two or more pairs, and ${sb.pairs_with_a_close_marathon.toLocaleString('en-US')} pairs have another eligible marathon of the record within ${closeDays} days`), '#half-linking: the two set B signals (review R6) with the builder\'s window');
    ok(/accepted or rejected some merges on how a half time fits a marathon time, so the tails of the multiple partly reflect the link build/.test(linking), '#half-linking: the time-screened links (review R5)');
    ok(!/1\.85|outside .{0,20}3\.0|false links? (?:at|of) about/.test(linking), '#half-linking: no ratio-based false-link figure (review R5)');
    const rv = pin.links.producer_review;
    if (rv) for (const r of rv.last_rounds) ok(linking.includes(`${(r.rare_missed * 100).toFixed(1)}%`), `#half-linking: the producer's rare-name missed links of round ${r.round}`);
  }
  // /methodology names the half releases and the policy file in words, their tags in the addresses only (AGENTS.md rule
  // 17; round 4 review, October 31, 2026: three tags were link text). Tags are removed with no space, so a name broken
  // into parts for wrapping still reads whole.
  if (methodology) {
    const plain = noScripts(methodology).replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '');
    const hit = /half-dataset-|half-snapshot-|runner-links-|half-policy-/.exec(plain);
    ok(!hit, `/methodology: a half release tag or the policy file's dated name in visible copy: …${hit ? plain.slice(Math.max(0, hit.index - 60), hit.index + 40) : ''}…`);
    // Nor a file name that carries a pinned release's date stamp ("half-20261029-1133.sqlite.zst.part00"; round 5: the
    // source files' names were link text). The stamps are read from every tag and asset name in the pin (schema 3 since
    // the v4 adoption: the stamp reference replaces metadata_correction, applies_to replaces pairs_with; merged from
    // fix/half-followups round 5, October 31, 2026).
    const ref = (pin.stamps || {}).reference || {};
    const stamps = [...new Set([pin.half.tag, pin.half.key, pin.half.private_tag, pin.links.tag, pin.links.key, pin.links.private_tag, pin.links.applies_to, ref.tag, ref.asset,
      ...Object.keys(pin.half.assets || {}), ...Object.keys(pin.links.assets || {})]
      .flatMap((name) => String(name || '').match(/20\d{6}/g) || []))];
    ok(stamps.length > 0, '/methodology: the pin names its date stamps');
    for (const stamp of stamps) {
      const at = plain.indexOf(stamp);
      ok(at < 0, `/methodology: a half release's date stamp ${stamp} in visible copy: …${at >= 0 ? plain.slice(Math.max(0, at - 60), at + 40) : ''}…`);
    }
    // While half.cities falls back, the methodology sentence about /half's same-city beat states no direction either
    // (AGENTS.md rule 13; round 5: it gave "the half had the larger women's share in 9 of them, by a median 16.8
    // points" and "the half was higher in 42 of 42 pairs" under /half's plain heading).
    if (pageGuards.cities === false) {
      const field = elements(noScripts(methodology), /id="half-field"/)[0];
      const said = field ? textOf(field.html) : '';
      ok(field && /same city, same year/i.test(said), '/methodology: #half-field has its same-city paragraph');
      const hitCity = /larger women’s share in \d|half was higher|half had the larger|by a median [\d.]+ points|more women/i.exec(said);
      ok(!hitCity, `/methodology: the same-city sentence states a direction while half.cities falls back: …${hitCity ? said.slice(Math.max(0, hitCity.index - 60), hitCity.index + 60) : ''}…`);
    }
  }
  let surfaces = 0, readings = 0;
  for (const file of pages) {
    const route = routeOf(file);
    const raw = fs.readFileSync(file, 'utf8');
    const html = noScripts(raw);
    for (const m of html.matchAll(/href="\/methodology#((?:story-)?half-[\w-]+)"/g)) ok(ids.has(m[1]), `${route}: links /methodology#${m[1]}, which /methodology does not have`);
    // A link that opens the pace calculator or the predictor on a half names the time too: without one the calculator
    // showed its marathon default, a half marathon in 4:00:00 (post-merge review, round 2, October 31, 2026), and the
    // predictor its built-in example half without the example's label (round 3).
    for (const m of html.matchAll(/href="(\/tools\/(?:pace-calculator|predictor)\?[^"]*)"/g)) {
      const q = new URLSearchParams(m[1].split('?')[1].replace(/&amp;/g, '&'));
      if (q.get('d') === 'half') ok(/^\d:\d\d:\d\d$/.test(q.get('t') || ''), `${route}: the tool link ${m[1]} opens on a half with no time (t=H:MM:SS)`);
    }
    for (const slug of withdrawnCards) ok(!html.includes(`/charts/cards/${slug}.png`), `${route}: links the withdrawn card ${slug}`);
    const scoped = elements(html, /data-half-scope="(?:verified|linked)"/);
    const links = elements(html, /data-half-link="linked"/);
    for (const el of links) {
      readings++;
      const own = /^<a\b/.test(el.tag) ? [/href="([^"]*)"/.exec(el.tag)?.[1] || ''] : [];
      const inner = [...el.html.slice(el.tag.length).matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1]);
      const toLinked = [...own, ...inner].filter(linkedHref);
      ok(own.length ? linkedHref(own[0]) && !inner.some(linkedHref) : toLinked.length === 1, `${route}: a reading marked data-half-link is a link to a linked page, or wraps exactly one (${JSON.stringify([...own, ...inner])})`);
      ok(!CHIP.test(el.html), `${route}: a reading repeated as a link carries no chip`);
      ok(!/half marathon finishes|half finishes|came in under 2:00/i.test(textOf(el.html)), `${route}: a reading link holds no other half figure`);
    }
    if (!scoped.length) {
      if (route !== '/methodology') ok(!CHIP.test(html), `${route}: a scope chip outside any half surface`);
      continue;
    }
    for (const el of scoped) {
      surfaces++;
      const scope = /data-half-scope="(verified|linked)"/.exec(el.tag)[1];
      const chips = elements(el.html, CHIP).length;
      if (scope === 'linked') eq(chips, 1, `${route}: a linked surface carries exactly one scope chip`);
      else {
        eq(chips, 0, `${route}: a verified surface carries no scope chip`);
        const rest = textOf(remove(el.html, /data-half-link="linked"/));
        for (const re of LINKED_FIGURES) ok(!re.test(rest), `${route}: a verified surface shows a linked figure outside a reading link (${re})`);
      }
      if (route !== '/methodology') {
        const words = textOf(remove(el.html, CHIP));
        for (const [re, what] of [...W.STATUS_WORDS, ...W.VERIFICATION_WORDS]) ok(!re.test(words), `${route}: ${what} on a half surface`);
        // The word rules apply to the half content itself: the chapter rail, navigation, the chapter's next card, the
        // feedback block and reading links repeat other pages' words.
        let content = el.html;
        for (const re of [/<aside\b/, /<nav\b/, /class="[^"]*\bchapter-end\b[^"]*"/, /class="[^"]*crumbs\b[^"]*"/, /class="[^"]*\bpage-feedback\b[^"]*"/, /data-half-link="linked"/, CHIP]) content = remove(content, re);
        const t = [...W.ALLOWED, ...HTML_ALLOWED].reduce((acc, a) => acc.split(a).join(' '), textOf(content));
        for (const [re, what] of [...W.BANNED, ...W.HALF_BANNED]) {
          const hit = re.exec(t);
          ok(!hit, `${route}: ${what} on a half surface: …${hit ? t.slice(Math.max(0, hit.index - 40), hit.index + 40) : ''}…`);
        }
      }
    }
    for (const el of elements(html, CHIP)) {
      ok(/Includes unverified half results/.test(textOf(el.html)) && /href="\/methodology#half-coverage"/.test(el.html), `${route}: the chip reads "Includes unverified half results" and links /methodology#half-coverage`);
      ok(!/\d/.test(textOf(el.html)), `${route}: the chip carries no numbers`);
    }
    // "Records linked by name": the first mention on a page is the term link to /methodology#half-linking.
    const main = html.slice(Math.max(0, html.indexOf('<main')));
    const at = textOf(main).search(/linked by name/i);
    if (at >= 0) {
      const firstLink = /<a\b[^>]*href="\/methodology#half-linking"[^>]*>([\s\S]*?)<\/a>/.exec(main);
      ok(firstLink && /linked by name/i.test(textOf(firstLink[1])) && textOf(main.slice(0, firstLink.index)).search(/linked by name/i) < 0, `${route}: the first "records linked by name" is the term link to /methodology#half-linking`);
    }
    if (route === '/stories/half-to-full') {
      ok(at >= 0, `${route}: says "records linked by name"`);
      ok(textOf(main).includes('Not a prediction.'), `${route}: "Not a prediction." under the scrubbed chart`);
      // The table's "Over double" adds up with its row: Typical − 2 × Half, in the printed whole minutes (round 4
      // review, October 30, 2026: after a 2:45 half "5:57" beside "+30 min" made 6:00).
      const bands = elements(html, /id="hf-bands"/)[0];
      const minutesOf = (t) => { const m = /^(\d+):(\d\d)$/.exec(t.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
      const heads = bands ? [...bands.html.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]).trim()) : [];
      const [hi, ti, xi] = ['Half', 'Typical', 'Over double'].map((h) => heads.indexOf(h));
      const rows = bands ? [...bands.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => textOf(c[1]).trim())).filter((r) => r.length === heads.length && r[0] !== 'Half') : [];
      ok(hi === 0 && ti > 0 && xi > 0 && rows.length >= 10, `${route}: the half-by-half table has its Half, Typical and Over double columns (${rows.length} rows)`);
      for (const r of rows) {
        const over = Number(r[xi].replace(/\s*min$/, '').replace('−', '-'));
        ok(minutesOf(r[ti]) - 2 * minutesOf(r[hi]) === over, `${route}: after a ${r[hi]} half, Typical ${r[ti]} is double plus ${r[xi]}`);
      }
      ok(!/more after a slower one/.test(textOf(main)), `${route}: the scale note promises no rise the windows do not show`);
      // While half.extra falls back, no slot states its reading: not the line under the scrubbed chart either ("Typical:
      // double the half plus 24 min …; 5 in 100 came in under double."; post-merge review, round 2, October 31, 2026).
      if (pageGuards.extra === false) ok(!/double the half (plus|minus)|came in under double/i.test(textOf(main)), `${route}: no "double the half plus" or "under double" reading while half.extra falls back`);
    }
    for (const el of elements(html, /id="goal-pace-half"/)) {
      ok(/data-half-scope="linked"/.test(el.tag), `${route}: the half-before panel is a linked surface`);
      ok(textOf(el.html).includes('Not a prediction.'), `${route}: "Not a prediction." in the half-before panel`);
      // Its heading names the half and states no reading: the share under the goal it had led with had no guard of its
      // own (round 4 review, October 31, 2026).
      const h2 = /<h2\b[^>]*id="goal-pace-half-title"[^>]*>([\s\S]*?)<\/h2>/.exec(el.html);
      const said = h2 ? textOf(h2[1]).trim() : '';
      ok(/^Marathons after a \d:\d\d half marathon\.$/.test(said), `${route}: the half-before heading states no reading ("${said}")`);
    }
    for (const el of elements(html, /id="half-field"/)) ok(/data-half-scope="verified"/.test(el.tag), `${route}: the observed half panel is a verified surface`);
    // The same-city table's gap is the row's Half minus its Marathon as printed (round 4 review, October 31, 2026: from
    // the unrounded shares three rows did not add up, Berlin 2016 25.7% and 38.6% beside +13.0).
    if (route === '/half') {
      const t = elements(html, /id="hf-cities"/)[0];
      const heads = t ? [...t.html.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]).trim()) : [];
      const [mi, hi, di] = ['Marathon', 'Half', 'Gap, points'].map((h) => heads.indexOf(h));
      const rows = t ? [...t.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => textOf(c[1]).trim())).filter((r) => r.length === heads.length && r[0] !== 'City') : [];
      ok(mi > 0 && hi > 0 && di > 0 && rows.length === women.same_city.pairs.length, `${route}: the same-city table has its Marathon, Half and Gap columns, a row per pair (${rows.length})`);
      const tenths = (v) => Math.round(Number(v.replace('%', '').replace('−', '-').replace('+', '')) * 10);
      for (const r of rows) ok(tenths(r[hi]) - tenths(r[mi]) === tenths(r[di]), `${route}: ${r[0]} ${r[1]}: Half ${r[hi]} minus Marathon ${r[mi]} is the printed gap ${r[di]}`);
    }
    // While half.cities falls back, its beat states no direction in any slot: no "typically" in the dumbbell's label,
    // no Typical row and no row drawn as the signal (post-merge review, October 30, 2026: the row and the label still
    // gave the two medians the dek had withdrawn).
    if (route === '/half' && pageGuards.cities === false) {
      const beat = elements(html, /id="two-distances"/)[0];
      ok(beat && !/typically/i.test(beat.html) && !/>Typical</.test(beat.html) && !/is-highlight|is-signal/.test(beat.html), `${route}: the same-city beat states no reading while half.cities falls back`);
    }
    // The guess's heading never gives its answer away: while the guess is up, the beat's H2 is half.sexes's neutral
    // line, and its reading comes with the reveal (post-merge review, October 30, 2026). The static page carries that
    // reveal too, in a <noscript>, while half.sexes holds (round 3: without JavaScript no element held the reading).
    if (route === '/stories/half-to-full' && pageGuards.guess) {
      const h2 = /<h2\b[^>]*id="women-men-title"[^>]*>([\s\S]*?)<\/h2>/.exec(html);
      const said = h2 ? textOf(h2[1]).replace(/\s+/g, ' ').trim() : '';
      ok(said === pageGuards.sexesFallback && said !== pageGuards.sexesHeadline, `${route}: the guess's heading is the neutral line, not the reading ("${said}")`);
      const quiet = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map((m) => textOf(m[1]).trim()).join(' ');
      ok(quiet.includes(pageGuards.sexesHeadline) === pageGuards.sexes, `${route}: the guess's no-script answer carries half.sexes's reading exactly while its guard holds (${pageGuards.sexes})`);
    }
    // The story's search description: half.extra's reading only under its guard, then half.sexes's under its own, else
    // the neutral line; a linked reading there names its scope (post-merge review, round 3, October 31, 2026).
    if (route === '/stories/half-to-full') {
      const meta = /<meta name="description" content="([^"]*)"/.exec(raw);
      const desc = meta ? textOf(meta[1]) : '';
      if (pageGuards.extra === false) ok(!/double it plus|over double|under double/i.test(desc), `${route}: no half.extra reading in the description while it falls back ("${desc}")`);
      if (pageGuards.extra === false) {
        const stated = desc.startsWith(pageGuards.sexesHeadline.replace(/\.$/, ''));
        ok(stated === pageGuards.sexes && (!stated || /records linked by name/.test(desc)) && (pageGuards.sexes || !/fewer|more/i.test(desc)), `${route}: the description states half.sexes's reading, with its scope, exactly while its guard holds (${pageGuards.sexes}): "${desc}"`);
      }
    }
    // Who holds pace's way into the half story states a direction ("recorded women’s marathons had fewer sustained
    // slowdowns after the same half marathon, too"), naming whose marathons, its measure and, as its term link before it,
    // its scope, only while the H1's reading (holds.title), the beat's (holds.unmask) and half.sexes's guards all hold,
    // recounted here from demographics.json; otherwise it is a pointer with no direction (post-merge review, round 3,
    // October 31, 2026: the link followed no guard; round 4: under the H2's recorded men "fewer … too" named no group).
    if (route === '/stories/who-holds-pace') {
      const o = readJson('public/data/insights/demographics.json').overall;
      const pooled = o.pooled_men_block - o.pooled_women_block, matched = o.men_block - o.women_block;
      const stateIt = o.women_slowdown > 0 && o.men_slowdown > 1.5 * o.women_slowdown && pooled > 0 && matched > 0 && matched / pooled >= 2 && pageGuards.sexes;
      const ways = links.map((el) => textOf(el.html).trim());
      ok(ways.length === 1, `${route}: one way into the half story (${JSON.stringify(ways)})`);
      for (const way of ways) {
        if (stateIt) {
          const line = elements(html, /data-half-said="stated"/)[0];
          ok(/^recorded women’s marathons had fewer sustained slowdowns\b/i.test(way) && /\btoo\b/.test(way) && line && /<a\b[^>]*href="\/methodology#half-linking"[^>]*>records linked by name<\/a>/.test(line.html), `${route}: the stated way names whose marathons, its measure and its scope ("${way}")`);
        } else ok(!/\b(?:too|fewer|more|less|far)\b/i.test(way) && !elements(html, /data-half-said="stated"/).length, `${route}: a guard fails, so the way into the half story states no direction ("${way}")`);
      }
    }
  }
  ok(surfaces >= 2 && readings >= 1, `--html: ${surfaces} half surfaces and ${readings} reading links found`);
  console.log(JSON.stringify({ html: { pages: pages.length, surfaces, readings } }));
}

const seconds = Math.round((Date.now() - started) / 100) / 10;
if (problems.length) {
  console.error(`verify-half: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${checks} checks:`);
  for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exit(1);
}
console.log(JSON.stringify({ half: 'ok', checks, files: Object.keys(files).length, shards: !!cohort, seconds }));
