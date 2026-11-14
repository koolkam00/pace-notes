#!/usr/bin/env node
'use strict';
// Runner lookup v2: the complete verifier of a build, from its files alone (docs/RUNNERS_AND_REPORT.md).
//
//   node scripts/verify-lookup.cjs [--data-root DIR] [--cohort FILE] [--pipeline DIR] [--never-shown FILE] [--allow-provisional] [--fixture] [--self-test] [--quiet]
//
// DIR holds the `runners` folder (default public/data). It reads every file once and collects every failure, so one
// run shows them all. What it proves:
//   1. Chain: the manifest's shape; editions.json.gz and every directory page against the manifest; every leaf and
//      shard against its page; no file the chain does not list; the content digests of the uncompressed bodies.
//   2. Editions: unique and in order; codes in range; every edition has a result; the record-id base of each.
//   3. Profiles, every shard: column lengths; every result once across both distances (source database and id); names
//      that normalise to a word, are not on the reviewed placeholder list and are used; result order; link codes (0
//      only on a result that stands alone, in the shard its key hashes to; confirmed links never twice in one edition
//      and never of two sexes; a person's confirmed tiers all keyed or none); marathon status against the result's own
//      times and its edition; no person id and no release tag in any body.
//   4. Counts: results, statuses, link codes, tiers, profiles, names, search names, index rows and heavy words each
//      recounted and compared with the manifest; the rows of each distance add up.
//   5. Index, rebuilt: from the profile shards alone it forms every posting the rules require (search words by this
//      file's own JavaScript normalisation, so the Python builder and the browser agree on every name), assigns each
//      to its leaf by the directory, and compares count and two 256-bit accumulators per leaf with the leaf's rows;
//      rows in order; every directory key recomputed; a light word in one leaf; the heavy list recounted.
//   6. Limits: rows and distinct profiles per leaf (the privacy floors), bytes per leaf and shard, the whole build.
//   7. Search, with scripts/lib/lookup.cjs (the planner the browser client ports): EVERY search name typed in full
//      is found by its stage-1 plan, none needs more than 1 MB and at least 99.9% need at most 300 KB; a set of
//      queries drawn from the build (beginnings of words, short words, the heaviest word alone, a group cut across
//      leaves, non-Latin names) returns exactly what a scan of every search name returns; a plan over 1 MB is never read.
//   8. The planner's own cases on small made-up directories, and (--self-test) that a changed byte, swapped leaves,
//      a missing posting, a wrong directory key, a wrong count and a repeated result each fail.
//
// --fixture reads the index rules and floors from the manifest instead of the production constants and skips the
// checks against the repository's pin and reviewed files: it is for the small build of the Python tests and says so.
// --cohort FILE (default <DIR>/cohort/manifest.json when the manifest names a cohort) checks the binding.
// --pipeline DIR compares the build with the pipeline's own descriptions of its two files (record-status.parquet.json
// and identity.parquet.json): the digests the build read and the counts by status. Row by row, against the release
// and those files, is analysis/lookup_audit.py's work (it needs the release; this needs only the published files).
// --never-shown FILE takes the keys of the rows that must not appear (rows left out, unnamed, placeholder names),
// written by that audit from the release, and checks that none is in a shard and that their counts are the manifest's.
// Measured 2026-11-14 on the development build of pace-notes-marathon-half-20261113-1113: see the contract.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const os = require('node:os');
const L = require('./lib/lookup.cjs');

const repo = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const HEX64 = /^[a-f0-9]{64}$/;
const PRODUCTION_RULES = { target_rows: 6000, max_rows: 8000, min_rows: 2000, heavy_over: 6000, order: 'code point' };
const LIMITS = { leafBytes: 150000, shardBytes: 150000, leafProfiles: 1500, totalBytes: 850e6, autoShare: 0.999 };
const SEX = 'MFX-';
const LENGTHS_KM = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
const cmp = L.compareCodePoints;

/** Collects failures by check, keeping the first few examples of each. */
class Collector {
  constructor() { this.byCheck = new Map(); this.total = 0; }
  fail(check, message) {
    this.total++;
    const entry = this.byCheck.get(check) || { count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 4) entry.examples.push(message);
    this.byCheck.set(check, entry);
  }
  check(ok, check, message) { if (!ok) this.fail(check, typeof message === 'function' ? message() : message); return ok; }
  lines() {
    const out = [];
    for (const [check, entry] of this.byCheck) {
      out.push(`${check}: ${entry.count} failure${entry.count === 1 ? '' : 's'}`);
      for (const example of entry.examples) out.push(`    ${example}`);
    }
    return out;
  }
}

/** Two 256-bit multiset accumulators (a sum and an exclusive-or over eight 32-bit lanes of SHA-256) and a count. */
class Accumulators {
  constructor(size) { this.count = new Uint32Array(size); this.sum = new Uint32Array(size * 8); this.xor = new Uint32Array(size * 8); }
  add(slot, text) {
    const digest = crypto.createHash('sha256').update(text).digest();
    const base = slot * 8;
    for (let lane = 0; lane < 8; lane++) {
      const value = digest.readUInt32LE(lane * 4);
      this.sum[base + lane] = (this.sum[base + lane] + value) >>> 0;
      this.xor[base + lane] ^= value;
    }
    this.count[slot]++;
  }
  /** Fold slot `from` into slot `to` (a group cut across leaves is compared as one run). */
  merge(to, from) {
    for (let lane = 0; lane < 8; lane++) {
      this.sum[to * 8 + lane] = (this.sum[to * 8 + lane] + this.sum[from * 8 + lane]) >>> 0;
      this.xor[to * 8 + lane] ^= this.xor[from * 8 + lane];
      this.sum[from * 8 + lane] = 0; this.xor[from * 8 + lane] = 0;
    }
    this.count[to] += this.count[from]; this.count[from] = 0;
  }
  same(other, slot) {
    if (this.count[slot] !== other.count[slot]) return false;
    for (let lane = 0; lane < 8; lane++) if (this.sum[slot * 8 + lane] !== other.sum[slot * 8 + lane] || this.xor[slot * 8 + lane] !== other.xor[slot * 8 + lane]) return false;
    return true;
  }
}

const postingText = (word, partner, name, shard, position, e, y, s, m, h, q, p) => JSON.stringify([word, partner, name, shard, position, e, y, s, m, h, q, p]);
const keyCompare = (w1, o1, w2, o2) => cmp(w1, w2) || cmp(o1, o2);
const bitCount = mask => { let n = 0; for (let rest = mask; rest; rest >>>= 1) n += rest & 1; return n; };

/** The shortest beginning of `after` that still sorts after `before` (whole code points). */
function separator(before, after) {
  const a = Array.from(before), b = Array.from(after);
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  return b.slice(0, at + 1).join('');
}

/** The (word, partner) keys of a search name's postings, in order. */
function postingKeys(words, heavy) {
  const keys = [];
  for (const word of words) {
    if (!heavy.has(word)) keys.push([word, '']);
    else if (words.length === 1) keys.push([word, '']);
    else for (const other of words) if (other !== word) keys.push([word, other]);
  }
  return keys;
}

function verify(dataRoot, options = {}) {
  const started = Date.now();
  const c = new Collector();
  const log = options.quiet ? () => {} : text => console.log(text);
  const root = path.join(dataRoot, 'runners');
  const readFile = relative => { try { return fs.readFileSync(path.join(root, relative)); } catch { return null; } };
  const facts = {};

  // ---- 1. the manifest
  const manifestBytes = readFile('manifest.json');
  if (!manifestBytes) { c.fail('chain', 'runners/manifest.json is missing'); return { failures: c, facts }; }
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch (error) { c.fail('chain', `manifest.json does not parse: ${error.message}`); return { failures: c, facts }; }
  const shape = () => {
    const m = manifest;
    c.check(m.schema_version === L.SCHEMA_VERSION, 'manifest', `schema_version is ${m.schema_version}`);
    c.check(typeof m.release_tag === 'string' && m.release_tag.length > 0, 'manifest', 'no release tag');
    for (const stamp of ['input_as_of', 'as_of']) c.check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(m[stamp] || '') && Number.isFinite(Date.parse(m[stamp])), 'manifest', `${stamp} is not a UTC time`);
    c.check(Array.isArray(m.provisional) && m.provisional.every(item => typeof item === 'string'), 'manifest', 'provisional is not a list');
    c.check(m.time_unit_ms === 1000, 'manifest', `time_unit_ms is ${m.time_unit_ms}`);
    c.check(JSON.stringify(m.points_km) === JSON.stringify(L.POINTS_KM), 'manifest', 'points_km differ from the format');
    c.check(m.inputs && Object.values(m.inputs).every(value => HEX64.test(value)), 'manifest', 'an input digest is not a SHA-256');
    c.check(m.scripts && Object.values(m.scripts).every(value => HEX64.test(value)), 'manifest', 'a script digest is not a SHA-256');
    c.check(m.content && ['profiles_raw_sha256', 'index_raw_sha256', 'editions_raw_sha256', 'names_normalized_sha256'].every(key => HEX64.test(m.content[key] || '')), 'manifest', 'content digests are missing');
    c.check(m.rules && JSON.stringify(m.rules.fold) === JSON.stringify(L.FOLD), 'manifest', 'rules.fold is not the fold table of scripts/lib/lookup.cjs');
    c.check(m.rules && m.rules.search && m.rules.search.auto_bytes === L.SEARCH_AUTO && m.rules.search.hard_cap_bytes === L.SEARCH_HARD_CAP, 'manifest', 'rules.search differs from the planner’s limits');
    const rules = m.rules && m.rules.index;
    c.check(rules && [rules.target_rows, rules.max_rows, rules.min_rows, rules.heavy_over].every(Number.isSafeInteger) && rules.min_rows > 0 &&
      rules.min_rows <= rules.target_rows && rules.target_rows <= rules.max_rows && rules.heavy_over + rules.min_rows <= rules.max_rows && rules.order === 'code point', 'manifest', 'rules.index is not a consistent set');
    if (!options.fixture) c.check(JSON.stringify(rules) === JSON.stringify(PRODUCTION_RULES), 'manifest', `rules.index is ${JSON.stringify(rules)}, not the published ${JSON.stringify(PRODUCTION_RULES)}`);
    c.check(m.editions && m.editions.file === 'editions.json.gz' && Number.isSafeInteger(m.editions.bytes) && HEX64.test(m.editions.sha256 || ''), 'manifest', 'editions entry');
    c.check(m.index && Number.isSafeInteger(m.index.leaves) && m.index.leaves > 0 && Array.isArray(m.index.pages) && m.index.pages.length === Math.ceil(m.index.leaves / L.PAGE_SIZE) &&
      m.index.pages.every(page => Array.isArray(page) && page.length === 5 && typeof page[0] === 'string' && typeof page[1] === 'string' && (page[2] === 0 || page[2] === 1) && Number.isSafeInteger(page[3]) && HEX64.test(page[4])) &&
      Array.isArray(m.index.heavy) && m.index.heavy.every(row => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && Number.isSafeInteger(row[1])), 'manifest', 'index entry');
    c.check(m.profiles && m.profiles.shards === L.PROFILE_SHARDS && Array.isArray(m.profiles.pages) && m.profiles.pages.length === L.PROFILE_SHARDS / L.PAGE_SIZE &&
      m.profiles.pages.every(page => Array.isArray(page) && page.length === 2 && Number.isSafeInteger(page[0]) && HEX64.test(page[1])), 'manifest', 'profiles entry');
    c.check(m.counts && m.counts.marathon && m.counts.half, 'manifest', 'counts are missing');
  };
  try { shape(); } catch (error) { c.fail('manifest', `the manifest is not in the published shape: ${error.message}`); }
  if (c.total) return { failures: c, facts };
  const rules = manifest.rules.index;
  const tag = manifest.release_tag;
  if (manifest.provisional.length && !options.allowProvisional) c.fail('provisional', `the build is provisional (${manifest.provisional.join(', ')}): only a final build may be imported`);
  if (!options.fixture) {
    const pin = JSON.parse(fs.readFileSync(path.join(repo, 'analysis/release.json'), 'utf8'));
    c.check(tag === pin.tag, 'pin', `the build is of ${tag}; the pin (analysis/release.json) names ${pin.tag}`);
    for (const [name, digest] of Object.entries(manifest.scripts)) {
      const file = path.join(repo, 'analysis', name);
      c.check(fs.existsSync(file) && sha256(fs.readFileSync(file)) === digest, 'stale', `the build was made by another analysis/${name}`);
    }
    for (const name of ['race-registry.json', 'lookup-half-records.json', 'lookup-placeholders.json']) {
      const file = path.join(repo, 'analysis', name);
      const same = fs.existsSync(file) && manifest.inputs[name] === sha256(fs.readFileSync(file));
      if (!same && !(name === 'race-registry.json' && manifest.provisional.includes('race_registry'))) c.fail('stale', `the build read another analysis/${name}`);
    }
    for (const name of Object.keys(pin.assets || {})) if (name in manifest.inputs) c.check(manifest.inputs[name] === pin.assets[name], 'pin', `${name} is not the pinned file`);
  }
  let policyRows = null;
  if (!options.fixture && manifest.inputs['edition-policy.json']) {
    const file = path.join(repo, 'public/data/edition-policy.json');
    if (c.check(fs.existsSync(file) && sha256(fs.readFileSync(file)) === manifest.inputs['edition-policy.json'], 'stale', 'the build read another public/data/edition-policy.json')) {
      const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
      const at = name => policy.columns.indexOf(name);
      policyRows = new Map(policy.editions.map(row => [row[at('city')] + '\u0000' + row[at('year')], policy.reasons[row[at('reason')]]]));
      c.check(manifest.pipeline && manifest.pipeline.policy_sha256 === policy.policy_sha256, 'pipeline', 'the edition policy file is not the policy the status file was made under');
    }
  }
  const placeholderKeys = new Set();
  if (!options.fixture) for (const entry of JSON.parse(fs.readFileSync(path.join(repo, 'analysis/lookup-placeholders.json'), 'utf8')).names) placeholderKeys.add(L.searchWords(entry.name).join(' '));

  // ---- 1. the chain: editions, directory pages, no stray file
  const gunzipJson = (relative, bytes, expectBytes, expectSha, hash) => {
    if (!bytes) { c.fail('chain', `${relative} is missing`); return null; }
    if (bytes.length !== expectBytes || sha256(bytes) !== expectSha) { c.fail('chain', `${relative} differs from the size or SHA-256 its parent lists`); return null; }
    let body;
    try { body = zlib.gunzipSync(bytes); } catch (error) { c.fail('chain', `${relative} is not gzip: ${error.message}`); return null; }
    if (hash) hash.update(body);
    const text = body.toString('utf8');
    if (text.includes(tag)) c.fail('privacy', `${relative} repeats the release tag`);
    if (/p[0-9]{2}_[0-9a-f]{16}/.test(text)) c.fail('privacy', `${relative} holds something shaped like a person id`);
    try { return { data: JSON.parse(text), body }; } catch (error) { c.fail('chain', `${relative} does not parse: ${error.message}`); return null; }
  };
  const editionsFile = gunzipJson('editions.json.gz', readFile('editions.json.gz'), manifest.editions.bytes, manifest.editions.sha256);
  if (!editionsFile) return { failures: c, facts };
  c.check(sha256(editionsFile.body) === manifest.content.editions_raw_sha256, 'content', 'editions_raw_sha256 differs from the file');
  let editions;
  try { editions = L.decodeEditions(editionsFile.data); } catch (error) { c.fail('editions', error.message); return { failures: c, facts }; }
  const E = editions.length;

  const indexPages = new Map(), leafEntries = [];
  manifest.index.pages.forEach((entry, number) => {
    const relative = L.indexPagePath(number);
    const file = gunzipJson(relative, readFile(relative), entry[3], entry[4]);
    if (!file) return;
    const page = file.data;
    const ok = c.check(page && page.v === L.SCHEMA_VERSION && page.first === number * L.PAGE_SIZE && Array.isArray(page.leaves) &&
      page.leaves.length === Math.min(L.PAGE_SIZE, manifest.index.leaves - number * L.PAGE_SIZE) &&
      page.leaves.every(leaf => Array.isArray(leaf) && leaf.length === 6 && typeof leaf[0] === 'string' && typeof leaf[1] === 'string' && (leaf[2] === 0 || leaf[2] === 1) &&
        Number.isSafeInteger(leaf[3]) && leaf[3] > 0 && Number.isSafeInteger(leaf[4]) && HEX64.test(leaf[5])), 'chain', `${relative} is not a directory page of ${L.PAGE_SIZE} leaves`);
    if (!ok) return;
    c.check(page.leaves[0][0] === entry[0] && page.leaves[0][1] === entry[1] && page.leaves[0][2] === entry[2], 'chain', `${relative}: the manifest’s start key is not its first leaf’s`);
    indexPages.set(number, page);
    page.leaves.forEach((leaf, at) => { leafEntries[page.first + at] = leaf; });
  });
  const shardEntries = [];
  manifest.profiles.pages.forEach((entry, number) => {
    const relative = L.profilePagePath(number);
    const file = gunzipJson(relative, readFile(relative), entry[0], entry[1]);
    if (!file) return;
    const page = file.data;
    const ok = c.check(page && page.v === L.SCHEMA_VERSION && page.first === number * L.PAGE_SIZE && Array.isArray(page.shards) && page.shards.length === L.PAGE_SIZE &&
      page.shards.every(shard => Array.isArray(shard) && shard.length === 4 && shard.slice(0, 3).every(Number.isSafeInteger) && HEX64.test(shard[3])), 'chain', `${relative} is not a directory page of ${L.PAGE_SIZE} shards`);
    if (ok) page.shards.forEach((shard, at) => { shardEntries[page.first + at] = shard; });
  });
  const Lc = manifest.index.leaves;
  if (leafEntries.filter(Boolean).length !== Lc || shardEntries.filter(Boolean).length !== L.PROFILE_SHARDS) { c.fail('chain', 'directory pages are missing or broken'); return { failures: c, facts }; }
  const expectFiles = (folder, names) => {
    let actual = [];
    try { actual = fs.readdirSync(path.join(root, folder)).sort(); } catch { /* reported as missing below */ }
    const wanted = names.slice().sort();
    if (actual.length !== wanted.length || actual.some((name, at) => name !== wanted[at])) {
      const extra = actual.filter(name => !wanted.includes(name)).slice(0, 3), missing = wanted.filter(name => !actual.includes(name)).slice(0, 3);
      c.fail('chain', `${folder || 'runners'}: files differ from the chain (not listed: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`);
    }
  };
  expectFiles('', ['manifest.json', 'editions.json.gz', 'index', 'profiles']);
  expectFiles('index', leafEntries.map((_, number) => path.basename(L.leafPath(number))).concat('p'));
  expectFiles('index/p', manifest.index.pages.map((_, number) => path.basename(L.indexPagePath(number))));
  expectFiles('profiles', shardEntries.map((_, number) => path.basename(L.shardPath(number))).concat('p'));
  expectFiles('profiles/p', manifest.profiles.pages.map((_, number) => path.basename(L.profilePagePath(number))));

  // ---- 2. editions
  const races = editionsFile.data.races;
  c.check(Array.isArray(races) && races.every(race => Array.isArray(race) && race.length === 3 && (race[0] === 'm' || race[0] === 'h') && typeof race[1] === 'string' && race[1] && typeof race[2] === 'string' && race[2]), 'editions', 'a race is not [distance, label, display name]');
  c.check(new Set(races.map(race => race[0] + '\u0000' + race[1])).size === races.length, 'editions', 'a race label appears twice at one distance');
  const usedRaces = new Set(editionsFile.data.sr), usedReasons = new Set(editionsFile.data.rs.filter(at => at >= 0));
  c.check(usedRaces.size === races.length && editionsFile.data.sr.every(at => Number.isSafeInteger(at) && at >= 0 && at < races.length), 'editions', 'a race is unused or an edition names no race');
  c.check(usedReasons.size === editionsFile.data.reasons.length && new Set(editionsFile.data.reasons).size === editionsFile.data.reasons.length &&
    editionsFile.data.rs.every(at => Number.isSafeInteger(at) && at >= -1 && at < editionsFile.data.reasons.length), 'editions', 'a reason sentence is unused, repeated or out of range');
  for (let at = 0; at < E; at++) {
    const e = editions[at], where = `edition ${at}`;
    c.check(Number.isSafeInteger(e.year) && e.year >= 1900 && e.year <= 2100, 'editions', `${where}: year ${e.year}`);
    c.check(Number.isSafeInteger(e.tier) && e.tier >= 0 && e.tier < L.TIERS.length && '01'.includes(editionsFile.data.sp[at]) && 'fh'.includes(e.db) && [0, 1, 2].includes(e.noComparison), 'editions', `${where}: a code is out of range`);
    c.check(Number.isSafeInteger(e.q) && e.q >= 0 && Number.isSafeInteger(e.unlisted) && e.unlisted >= 0, 'editions', `${where}: q or nl`);
    if (e.distance === 'half') c.check(e.context === null && e.reason === null, 'editions', `${where}: a half edition has a cohort index or a reason`);
    else c.check(e.noComparison === 0 && e.db === 'f', 'editions', `${where}: a marathon edition is marked not compared, or is in the half database`);
    if (at) {
      const p = editions[at - 1];
      const order = (p.distance === e.distance ? 0 : p.distance === 'marathon' ? -1 : 1) || cmp(p.city, e.city) || (p.year - e.year) || cmp(p.db, e.db);
      c.check(order < 0, 'editions', `${where}: not after the edition before it (distance, race label, year, database)`);
    }
  }
  if (policyRows) {
    let listed = 0;
    for (const e of editions) if (e.distance === 'marathon') {
      const sentence = policyRows.get(e.city + '\u0000' + e.year);
      c.check((sentence === undefined ? null : sentence) === e.reason, 'editions', `edition ${e.index}: its reason is not the published edition policy’s`);
      if (sentence !== undefined) listed++;
    }
    facts.policyEditions = [listed, policyRows.size];
  }
  const contexts = editions.filter(e => e.context !== null).map(e => e.context);
  c.check(new Set(contexts).size === contexts.length, 'editions', 'two editions share a cohort index');
  facts.editions = E;
  log(`Manifest, ${manifest.index.pages.length + manifest.profiles.pages.length} directory pages and ${E.toLocaleString('en-US')} editions verified; reading ${L.PROFILE_SHARDS.toLocaleString('en-US')} profile shards.`);

  // ---- flat directory for the assignment of postings
  const heavy = L.heavyOf(manifest.index);
  const keyW = leafEntries.map(entry => entry[0]), keyO = leafEntries.map(entry => entry[1]), keyC = leafEntries.map(entry => entry[2]);
  for (let i = 1; i < Lc; i++) c.check(keyCompare(keyW[i - 1], keyO[i - 1], keyW[i], keyO[i]) < 0 || (keyC[i] === 1 && keyW[i - 1] === keyW[i] && keyO[i - 1] === keyO[i]), 'directory', `leaf ${i}: its key is not after the key before it`);
  c.check(keyW[0] === '' && keyO[0] === '' && keyC[0] === 0, 'directory', 'the first leaf’s key is not empty');
  const leafOf = (word, partner) => {            // the last leaf whose key is at or before (word, partner)
    let low = 0, high = Lc;
    while (low < high) { const middle = (low + high) >> 1; if (keyCompare(keyW[middle], keyO[middle], word, partner) <= 0) low = middle + 1; else high = middle; }
    return low - 1;
  };
  const runStart = new Int32Array(Lc);           // a leaf marked c continues the run of the leaf before it
  for (let i = 0; i < Lc; i++) runStart[i] = keyC[i] === 1 && i > 0 ? runStart[i - 1] : i;

  // ---- search samples, fixed before the profile pass so that one scan of every search name answers them all
  const queries = [];
  const addQuery = (tokens, stage, why) => { if (tokens.length && tokens.every(Boolean) && !queries.some(q => q.stage === stage && q.tokens.join(' ') === tokens.join(' '))) queries.push({ tokens, stage, why, truth: new Set() }); };
  const head = (word, n) => Array.from(word).slice(0, n).join('');
  const sampleNames = (data, every) => {
    let taken = 0;
    for (let at = 0; at < data.n.length && taken < 48; at += every) {
      const words = L.searchWords(data.n[at]);
      if (!words.length) continue;
      taken++;
      addQuery(words, 1, 'a name typed in full');
      if (words.length >= 2) {
        addQuery([head(words[0], 4), head(words[1], 4)], 2, 'the first four letters of two words');
        addQuery([words[0], head(words[1], 3)], 2, 'a word and three letters of another');
        addQuery([words[words.length - 1], words[0]], 1, 'two words in the other order');
      }
      addQuery([head(words[words.length - 1], 5)], 2, 'five letters of one word');
      if (words.some(word => Array.from(word).length < 3)) addQuery(words, 2, 'a name with a word under three letters, as beginnings');
      if (words.some(word => /[^\x00-\x7f]/.test(word))) addQuery(words.map(word => head(word, 3)), 2, 'beginnings of non-ASCII words');
    }
  };
  const firstShard = readFile(L.shardPath(0));
  try { sampleNames(JSON.parse(zlib.gunzipSync(firstShard).toString('utf8')), 37); } catch { /* the shard pass reports it */ }
  const heaviest = manifest.index.heavy.slice().sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, 3);
  for (const [word] of heaviest) { addQuery([word], 1, 'a heavy word alone'); addQuery([word], 2, 'a heavy word alone, as a beginning'); addQuery([head(word, 3)], 2, 'three letters of a heavy word'); }
  for (let i = 1; i < Lc; i++) if (keyC[i] === 1) { addQuery([keyW[i], keyO[i]].filter(Boolean), 1, 'a group cut across leaves'); addQuery([keyW[i], keyO[i]].filter(Boolean), 2, 'a group cut across leaves, as beginnings'); }
  for (const [word] of manifest.index.heavy) if (Array.from(word).length < 3) { addQuery([word], 1, 'a short heavy word alone'); if (queries.length > 400) break; }
  const exactFirst = new Map(), prefixFirst = [];
  for (const query of queries) {
    query.exact = query.tokens.map(token => L.tokenIsExact(token, query.stage));
    query.alone = query.stage === 1 && query.tokens.length === 1 && heavy.has(query.tokens[0]);
    if (query.exact[0]) { if (!exactFirst.has(query.tokens[0])) exactFirst.set(query.tokens[0], []); exactFirst.get(query.tokens[0]).push(query); } else prefixFirst.push(query);
  }

  // ---- 3 to 5. the profile pass
  const expected = new Accumulators(Lc), actual = new Accumulators(Lc);
  const resultKeys = new Float64Array(Math.max(1, manifest.counts.results | 0));
  const perEdition = new Uint32Array(E), minId = new Float64Array(E).fill(Infinity), statusSeen = new Uint8Array(E);
  const profilesHash = crypto.createHash('sha256'), namesHash = crypto.createHash('sha256');
  const wordCount = new Map();
  const count = { results: 0, profiles: 0, names: 0, searchNames: 0, postings: 0, marathon: 0, half: 0, noFinish: { marathon: 0, half: 0 },
    tier: { marathon: {}, half: {} }, link: { marathon: {}, half: {} }, status: {}, noComparison: {}, kinds: { one_result: 0, confirmed_only: 0, confirmed_and_possible: 0, possible_only: 0 } };
  const bump = (object, key) => { object[key] = (object[key] || 0) + 1; };
  const plans = { checked: 0, notFound: 0, overAuto: 0, overCap: 0, max: 0, leaves: {}, bytes: [] };
  let shardBytes = 0, largestShard = 0;
  for (let number = 0; number < L.PROFILE_SHARDS; number++) {
    const entry = shardEntries[number], relative = L.shardPath(number);
    const bytes = readFile(relative);
    const file = gunzipJson(relative, bytes, entry[2], entry[3], profilesHash);
    if (!file) continue;
    shardBytes += bytes.length; largestShard = Math.max(largestShard, bytes.length);
    c.check(bytes.length <= LIMITS.shardBytes, 'limits', `${relative} is ${bytes.length} bytes, over ${LIMITS.shardBytes}`);
    const d = file.data;
    const R = Array.isArray(d.e) ? d.e.length : -1;
    const columnsOk = d.v === L.SCHEMA_VERSION && R >= 0 && ['k', 'u', 'n', 'i', 'f', 'a', 'j', 'm', 'd'].every(key => Array.isArray(d[key])) && ['x', 'c', 's'].every(key => typeof d[key] === 'string') &&
      ['i', 'f', 'x', 'a', 'c', 'j', 's', 'm'].every(key => d[key].length === R) && d.k.length === d.u.length;
    if (!c.check(columnsOk, 'shape', `${relative}: columns are missing or of different lengths`)) continue;
    let sumK = 0, sumU = 0, sumBits = 0;
    for (let p = 0; p < d.k.length; p++) { sumK += d.k[p]; sumU += d.u[p]; }
    for (let r = 0; r < R; r++) sumBits += bitCount(d.m[r]);
    if (!c.check(sumK === R && sumU === d.n.length && sumBits === d.d.length && d.k.every(k => Number.isSafeInteger(k) && k >= 1) && d.u.every(u => Number.isSafeInteger(u) && u >= 1), 'shape', `${relative}: k, u, m do not add up to the columns`)) continue;
    c.check(entry[0] === d.k.length && entry[1] === R, 'chain', `${relative}: its page lists ${entry[0]} profiles and ${entry[1]} results, it holds ${d.k.length} and ${R}`);
    let row = 0, nameAt = 0, gapAt = 0, unlinkedSeen = false, lastUnlinked = -1;
    for (let p = 0; p < d.k.length; p++) {
      const k = d.k[p], u = d.u[p], where = `${relative} profile ${p}`;
      const groups = new Map();
      let cm = 0, ch = 0, y0 = Infinity, y1 = -Infinity, cy0 = Infinity, cy1 = -Infinity, e1 = -1, sexes = 0, keyed = 0, screened = 0, firstUse = 0;
      const confirmedEditions = new Set();
      const nameWords = new Array(u);
      for (let at = 0; at < u; at++) {
        const name = d.n[nameAt + at];
        if (!c.check(typeof name === 'string' && name.length > 0, 'names', `${where}: an empty name`)) { nameWords[at] = { words: [], key: '' }; continue; }
        namesHash.update(L.normalizeName(name) + '\n');
        const words = L.searchWords(name), key = words.join(' ');
        c.check(words.length > 0, 'names', `${where}: a name with no search word`);
        if (placeholderKeys.has(key)) c.fail('names', `${where}: a name on the reviewed placeholder list`);
        nameWords[at] = { words, key };
      }
      c.check(new Set(d.n.slice(nameAt, nameAt + u)).size === u, 'names', `${where}: a recorded name is listed twice`);
      let previous = null;
      for (let end = row + k; row < end; row++) {
        const e = d.e[row], edition = editions[e];
        if (!c.check(Number.isSafeInteger(e) && edition !== undefined, 'results', `${where}: unknown edition ${e}`)) { gapAt += bitCount(d.m[row]); continue; }
        const half = edition.distance === 'half', distance = edition.distance;
        const id = d.i[row] + 256 * edition.q, finish = d.f[row], link = d.c[row], status = d.s[row], mask = d.m[row], j = d.j[row];
        c.check(Number.isSafeInteger(d.i[row]) && d.i[row] >= 0 && Number.isSafeInteger(finish) && finish >= -1 && SEX.includes(d.x[row]) && Number.isSafeInteger(d.a[row]) && d.a[row] >= -1 && d.a[row] <= 150 &&
          L.LINK_CODES.includes(link) && Number.isSafeInteger(mask) && mask >= 0 && mask < (1 << L.CHECKPOINTS[distance]) && Number.isSafeInteger(j) && j >= 0 && j < u, 'results', `${where}: a value is out of range`);
        c.check(half ? status === '-' : '0123456'.includes(status), 'results', `${where}: status ${status} at this distance`);
        if (j === firstUse) firstUse++; else c.check(j < firstUse, 'names', `${where}: names are not in first-use order`);
        const here = [half ? 1 : 0, edition.year, id, edition.db === 'h' ? 1 : 0];
        if (previous && (here[0] - previous[0] || here[1] - previous[1] || here[2] - previous[2] || here[3] - previous[3]) <= 0) c.fail('results', `${where}: results are not in order (marathon before half, year, id, database)`);
        previous = here;
        if (count.results < resultKeys.length) resultKeys[count.results] = id * 2 + here[3];
        count.results++; count[distance]++; perEdition[e]++; if (id < minId[e]) minId[e] = id;
        bump(count.tier[distance], edition.tier); bump(count.link[distance], link);
        if (finish < 0) count.noFinish[distance]++;
        if (half) { if (edition.noComparison) bump(count.noComparison, edition.noComparison); } else bump(count.status, status);
        // times
        const points = L.CHECKPOINTS[distance];
        let total = 0, complete = finish >= 0, increasing = true, last = 0, inBounds = true, clearlyInside = true;
        for (let bit = 0; bit < points; bit++) {
          if (mask >> bit & 1) {
            total += d.d[gapAt++];
            if (!half) {
              const elapsed = total - last, pace = elapsed / LENGTHS_KM[bit];
              if (!(elapsed > 0)) increasing = false;
              if (!(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8)) inBounds = false;
              if (!(pace >= 120 + 1e-8 && pace <= 1200 - 1e-8)) clearlyInside = false;
              last = total;
            }
          } else complete = false;
        }
        if (!half) {
          if (complete) {
            const elapsed = finish - last, pace = elapsed / LENGTHS_KM[8];
            if (!(elapsed > 0)) increasing = false;
            if (!(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8) || finish < 5400 || finish > 43200) inBounds = false;
            if (!(pace >= 120 + 1e-8 && pace <= 1200 - 1e-8) || finish < 5400 || finish > 43200) clearlyInside = false;
          }
          statusSeen[e] |= 1 << Number(status);
          if (status === '0' || status === '1') c.check(complete && increasing && inBounds, 'status', `${where}: status ${status} without nine times in order and within the bounds`);
          if (status === '3') c.check(!complete, 'status', `${where}: status 3 with every time recorded`);
          if (status === '4') c.check(complete && !increasing, 'status', `${where}: status 4 with times in order, or with a time missing`);
          if (status === '5') c.check(complete && increasing && !clearlyInside, 'status', `${where}: status 5 with times inside the bounds`);
        }
        // links
        if (link === '0') {
          c.check(k === 1, 'links', `${where}: a result with no link inside a profile of ${k}`);
          const key = L.unlinkedKey(edition.db, id);
          c.check(parseInt(sha256(Buffer.from(key)).slice(0, 3), 16) === number, 'links', `${where}: a result with no link is not in the shard its key hashes to`);
          const order = (edition.db === 'h' ? 1 : 0) * 2 ** 40 + id;
          c.check(order > lastUnlinked, 'links', `${where}: results with no link are not in order of database and id`);
          lastUnlinked = order; unlinkedSeen = true;
        } else if (row === end - k) c.check(!unlinkedSeen, 'links', `${where}: a linked profile after one with no link`);
        const confirmed = L.CONFIRMED_LINKS.includes(link);
        if (confirmed) {
          keyed++;
          c.check(!confirmedEditions.has(e), 'links', `${where}: two confirmed results in one edition`);
          confirmedEditions.add(e);
          if (d.x[row] === 'M') sexes |= 1; else if (d.x[row] === 'F') sexes |= 2;
          if (half) ch++; else cm++;
          if (edition.year < cy0) cy0 = edition.year;
          if (edition.year > cy1) cy1 = edition.year;
        } else if ('bcd'.includes(link)) screened++;
        if (edition.year < y0) y0 = edition.year;
        if (edition.year > y1) y1 = edition.year;
        e1 = e;
        // the result's search name
        const key = nameWords[j] ? nameWords[j].key : '';
        let group = groups.get(key);
        if (!group) { group = { words: nameWords[j] ? nameWords[j].words : [], ns: 0, ncs: 0, y0: Infinity, y1: -Infinity, e: -1, best: null, shown: '' }; groups.set(key, group); }
        group.ns++; if (confirmed) group.ncs++;
        if (edition.year < group.y0) group.y0 = edition.year;
        if (edition.year > group.y1) group.y1 = edition.year;
        group.e = e;
        // the shown spelling: the latest year, marathon before half, the lowest id, the marathon database first
        const rank = [-edition.year, here[0], id, here[3]];
        if (group.best === null || (rank[0] - group.best[0] || rank[1] - group.best[1] || rank[2] - group.best[2] || rank[3] - group.best[3]) < 0) { group.best = rank; group.shown = d.n[nameAt + j]; }
      }
      c.check(firstUse === u, 'names', `${where}: a recorded name no result uses`);
      c.check(sexes !== 3, 'links', `${where}: confirmed results of two sexes`);
      c.check(!(keyed && screened), 'links', `${where}: keyed and unkeyed links of a confirmed tier in one profile`);
      count.profiles++; count.names += u;
      bump(count.kinds, k === 1 ? 'one_result' : cm + ch === k ? 'confirmed_only' : cm + ch === 0 ? 'possible_only' : 'confirmed_and_possible');
      // the profile's search names and their postings
      for (const group of groups.values()) {
        const words = group.words;
        if (!words.length) continue;
        count.searchNames++;
        const possibleOnly = cm + ch > 0 && group.ncs === 0;
        const one = possibleOnly ? group.ns === 1 : k === 1;
        const fields = one ? [possibleOnly ? group.e : e1, 0, 0, 0, 0, 0] : possibleOnly ? [-1, group.y0, group.y1 - group.y0, 0, 0, group.ns]
          : cm + ch > 0 ? [-1, cy0, cy1 - cy0, cm, ch, k - cm - ch] : [-1, y0, y1 - y0, 0, 0, k];
        for (const word of words) wordCount.set(word, (wordCount.get(word) || 0) + 1);
        const keys = postingKeys(words, heavy);
        for (const [word, partner] of keys) {
          const leaf = leafOf(word, partner);
          expected.add(leaf, postingText(word, partner, group.shown, number, p, fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], possibleOnly ? 1 : 0));
          count.postings++;
        }
        // the name typed in full: stage 1 must reach a leaf that holds it
        const plan = L.planSearch(words, 1, manifest.index, indexPages);
        plans.checked++;
        if (plan.bytes > L.SEARCH_AUTO) plans.overAuto++;
        if (plan.bytes > L.SEARCH_HARD_CAP) plans.overCap++;
        if (plan.bytes > plans.max) { plans.max = plan.bytes; plans.maxLeaves = plan.leaves.length; }
        bump(plans.leaves, plan.leaves.length);
        if (plans.checked % 41 === 0) plans.bytes.push(plan.bytes);
        const partner = !heavy.has(plan.primary) ? '' : plan.alone !== null ? '' : plan.partner !== null ? plan.partner : (words.find(word => word !== plan.primary) || '');
        let needed = leafOf(plan.primary, partner), found = words.includes(plan.primary) && (plan.alone === null || words.length === 1);
        for (; found; needed--) {
          if (!plan.leaves.includes(needed)) found = false;
          if (!(keyC[needed] === 1 && keyW[needed] === plan.primary && keyO[needed] === partner)) break;
        }
        if (!found && !(plan.alone !== null && words.length > 1)) { plans.notFound++; c.fail('search', `${where}: the name typed in full is not reached by its stage-1 plan`); }
        // the sample queries, answered here by a scan
        const pointer = `${number}:${p}:${group.shown}`;
        for (const word of words) {
          const list = exactFirst.get(word);
          if (list) for (const query of list) if ((!query.alone || words.length === 1) && L.rowMatches(words, query.tokens, query.stage)) query.truth.add(pointer);
        }
        for (const query of prefixFirst) if (L.rowMatches(words, query.tokens, query.stage)) query.truth.add(pointer);
      }
      nameAt += u;
    }
  }
  c.check(profilesHash.digest('hex') === manifest.content.profiles_raw_sha256, 'content', 'profiles_raw_sha256 differs from the shards');
  c.check(namesHash.digest('hex') === manifest.content.names_normalized_sha256, 'parity', 'the JavaScript normalisation of the recorded names differs from the builder’s (names_normalized_sha256)');
  // every result once
  const keys = resultKeys.subarray(0, Math.min(count.results, resultKeys.length)).sort();
  let repeated = 0;
  for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) repeated++;
  c.check(repeated === 0, 'results', `${repeated} results appear more than once (source database and record id)`);
  for (let e = 0; e < E; e++) {
    if (!c.check(perEdition[e] > 0, 'editions', `edition ${e} has no result`)) continue;
    c.check(editions[e].q === Math.floor(minId[e] / 256), 'editions', `edition ${e}: q is not its lowest record id divided by 256`);
    // One kind of use per marathon edition: counted (statuses 0 and 2 to 5), own record (1 and 2 to 5) or recorded times only (6).
    const seen = statusSeen[e];
    if (editions[e].distance === 'marathon' && manifest.inputs['edition-policy.json']) {
      if (editions[e].reason === null) c.check((seen & 0b1000010) === 0, 'status', `edition ${e} is counted and holds an own-record or times-only result`);
      else c.check(seen === 0b1000000 || (seen & 0b1000001) === 0, 'status', `edition ${e} is not counted and mixes kinds of use (statuses ${seen.toString(2)})`);
    }
  }
  // ---- the rows that must not appear, when the source-side audit supplies their keys (analysis/lookup_audit.py --never-shown)
  const counts = manifest.counts;
  if (options.neverShown) {
    const list = JSON.parse(fs.readFileSync(options.neverShown, 'utf8'));
    c.check(list.record_status_sha256 === manifest.inputs['record-status.parquet'], 'never-shown', 'the list of rows that must not appear was made from another status file');
    const has = key => { let low = 0, high = keys.length; while (low < high) { const middle = (low + high) >> 1; if (keys[middle] < key) low = middle + 1; else high = middle; } return low < keys.length && keys[low] === key; };
    let present = 0, listed = 0;
    for (const distance of ['marathon', 'half']) {
      const kinds = list.kinds[distance] || {}, stated = counts[distance];
      const size = kind => Object.values(kinds[kind] || {}).reduce((sum, ids) => sum + ids.length, 0);
      for (const byDb of Object.values(kinds)) for (const [letter, ids] of Object.entries(byDb)) for (const id of ids) { listed++; if (has(id * 2 + (letter === 'h' ? 1 : 0))) present++; }
      c.check(size('left_out') === stated.left_out.rows && size('unnamed') === stated.unnamed && size('placeholder_flagged') === stated.placeholder.flagged && size('placeholder_listed') === stated.placeholder.listed,
        'never-shown', `${distance}: the release has ${size('left_out')} rows left out, ${size('unnamed')} unnamed, ${size('placeholder_flagged')} and ${size('placeholder_listed')} placeholder; the manifest states ${stated.left_out.rows}, ${stated.unnamed}, ${stated.placeholder.flagged} and ${stated.placeholder.listed}`);
    }
    c.check(present === 0, 'never-shown', `${present} rows that must not appear are in a shard`);
    facts.neverShown = listed;
  }
  // ---- 4. counts
  const equal = (name, actualValue, stated) => c.check(JSON.stringify(actualValue) === JSON.stringify(stated), 'counts', `${name}: the files give ${JSON.stringify(actualValue)}, the manifest states ${JSON.stringify(stated)}`);
  const sorted = object => Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
  equal('results', count.results, counts.results);
  equal('profiles', count.profiles, counts.profiles);
  equal('names', count.names, counts.names);
  equal('search names', count.searchNames, counts.search_names);
  equal('index rows', count.postings, counts.index_rows);
  equal('profiles by kind', count.kinds, counts.profiles_by_kind);
  for (const distance of ['marathon', 'half']) {
    const block = counts[distance];
    equal(`${distance} results`, count[distance], block.results);
    equal(`${distance} results with no finish`, count.noFinish[distance], block.no_finish);
    equal(`${distance} results by tier`, sorted(count.tier[distance]), block.tier);
    equal(`${distance} results by link code`, sorted(count.link[distance]), block.link);
    equal(`${distance} editions`, editions.filter(e => e.distance === distance).length, block.editions);
    c.check(block.release_rows === block.left_out.rows + block.unnamed + block.placeholder.flagged + block.placeholder.listed + block.results, 'counts', `${distance}: release rows are not the rows left out, unnamed, placeholder and listed`);
    equal(`${distance} rows kept and not listed`, editions.filter(e => e.distance === distance).reduce((sum, e) => sum + e.unlisted, 0) + block.unlisted_editions.reduce((sum, row) => sum + row[4], 0), block.unnamed + block.placeholder.flagged + block.placeholder.listed);
  }
  equal('marathon results by status', sorted(count.status), counts.marathon.status);
  const unlistedStatus = counts.marathon.unlisted_status || {};
  equal('marathon rows kept and not listed, by status', Object.values(unlistedStatus).reduce((sum, value) => sum + value, 0), counts.marathon.unnamed + counts.marathon.placeholder.flagged + counts.marathon.placeholder.listed);
  const statusFile = manifest.pipeline && manifest.pipeline.record_status;
  if (statusFile) {
    const totals = { counted: 0, limited: 0, own_record: 0 };
    for (const source of [count.status, unlistedStatus]) for (const [digit, value] of Object.entries(source)) totals[digit === '0' ? 'counted' : digit === '1' ? 'own_record' : 'limited'] += value;
    equal('marathon rows by status against the status file', totals, sorted(statusFile.by_status));
    equal('marathon rows against the status file', counts.marathon.results + counts.marathon.unnamed + counts.marathon.placeholder.flagged + counts.marathon.placeholder.listed, statusFile.records);
  } else if (!manifest.provisional.includes('record-status')) c.check(options.fixture, 'pipeline', 'the manifest carries no counts of the status file');
  if (options.pipeline) {
    const sidecar = name => { try { return JSON.parse(fs.readFileSync(path.join(options.pipeline, name + '.json'), 'utf8')); } catch { return null; } };
    const status = sidecar('record-status.parquet'), identity = sidecar('identity.parquet');
    if (!c.check(status !== null, 'pipeline', `${options.pipeline} has no record-status.parquet.json`)) { /* reported */ } else {
      c.check(status.file.sha256 === manifest.inputs['record-status.parquet'], 'pipeline', 'the build did not read this record-status.parquet');
      c.check(statusFile && JSON.stringify(sorted(status.counts.by_status)) === JSON.stringify(sorted(statusFile.by_status)) && status.counts.records === statusFile.records, 'pipeline', 'the status file’s counts differ from the manifest’s');
      c.check(status.policy_sha256 === manifest.pipeline.policy_sha256 && status.input_manifest_sha256 === manifest.pipeline.input_manifest_sha256, 'pipeline', 'the status file’s policy or input digest differs from the manifest’s');
    }
    if (c.check(identity !== null, 'pipeline', `${options.pipeline} has no identity.parquet.json`)) c.check(identity.file.sha256 === manifest.inputs['identity.parquet'], 'pipeline', 'the build did not read this identity.parquet');
  }
  equal('half results in editions never compared', sorted(count.noComparison), counts.half.no_comparison);
  const heavyFound = Array.from(wordCount).filter(([, n]) => n > rules.heavy_over).sort((a, b) => cmp(a[0], b[0]));
  equal('heavy words', heavyFound, manifest.index.heavy);
  equal('heavy word count', heavyFound.length, counts.heavy_words);
  facts.results = count.results; facts.profiles = count.profiles; facts.searchNames = count.searchNames; facts.words = wordCount.size;
  log(`Read ${count.results.toLocaleString('en-US')} results in ${count.profiles.toLocaleString('en-US')} profiles (${count.searchNames.toLocaleString('en-US')} search names, ${wordCount.size.toLocaleString('en-US')} words); reading ${Lc.toLocaleString('en-US')} index leaves.`);

  // ---- 5 and 6. the leaf pass
  const indexHash = crypto.createHash('sha256');
  const shardProfiles = shardEntries.map(entry => entry[0]);
  let indexBytes = 0, largestLeaf = 0, fewestRows = Infinity, mostRows = 0, fewestProfiles = Infinity, leafRows = 0;
  let lastW = null, lastO = null, lastName = null, lastB = -1, lastP = -1;
  const leafCache = new Map();
  for (let number = 0; number < Lc; number++) {
    const entry = leafEntries[number], relative = L.leafPath(number);
    const bytes = readFile(relative);
    const file = gunzipJson(relative, bytes, entry[4], entry[5], indexHash);
    if (!file) { lastW = null; continue; }
    indexBytes += bytes.length; largestLeaf = Math.max(largestLeaf, bytes.length);
    c.check(bytes.length <= LIMITS.leafBytes, 'limits', `${relative} is ${bytes.length} bytes, over ${LIMITS.leafBytes}`);
    const d = file.data;
    const N = Array.isArray(d.n) ? d.n.length : -1;
    if (!c.check(d.v === L.SCHEMA_VERSION && N > 0 && ['b', 'o', 'e', 'y', 's', 'm', 'h', 'q', 'p'].every(key => Array.isArray(d[key]) && d[key].length === N), 'shape', `${relative}: columns are missing or of different lengths`)) { lastW = null; continue; }
    c.check(N === entry[3], 'chain', `${relative}: its page lists ${entry[3]} rows, it holds ${N}`);
    leafRows += N; fewestRows = Math.min(fewestRows, N); mostRows = Math.max(mostRows, N);
    if (Lc > 1) c.check(N >= rules.min_rows && N < rules.max_rows + rules.min_rows, 'limits', `${relative} holds ${N} rows, outside ${rules.min_rows} to ${rules.max_rows + rules.min_rows - 1}`);
    const people = new Set();
    let firstW = null, firstO = null;
    for (let at = 0; at < N; at++) {
      const name = d.n[at], b = d.b[at], o = d.o[at], e = d.e[at], y = d.y[at], s = d.s[at], m = d.m[at], h = d.h[at], q = d.q[at], p = d.p[at];
      const where = `${relative} row ${at}`;
      const ok = typeof name === 'string' && name.length > 0 && Number.isSafeInteger(b) && b >= 0 && b < L.PROFILE_SHARDS && Number.isSafeInteger(o) && o >= 0 && o < shardProfiles[b] &&
        Number.isSafeInteger(e) && e >= -1 && e < E && [y, s, m, h, q].every(value => Number.isSafeInteger(value) && value >= 0) && (p === 0 || p === 1);
      if (!c.check(ok, 'index', `${where}: a value is out of range`)) continue;
      if (e >= 0) c.check(y === 0 && s === 0 && m === 0 && h === 0 && q === 0, 'index', `${where}: a row of one result carries a summary`);
      else c.check(y >= 1900 && y + s <= 2100 && (p === 1 ? m === 0 && h === 0 && q >= 2 : m + h + q >= 2), 'index', `${where}: a summary that describes fewer than two results`);
      people.add(b * 4194304 + o);
      // which of the name's postings this row is: the smallest that sorts after the row before it
      const words = L.searchWords(name);
      let word = null, partner = null;
      for (const [w, other] of postingKeys(words, heavy)) {
        if (lastW !== null) {
          const side = keyCompare(w, other, lastW, lastO) || cmp(name, lastName) || (b - lastB) || (o - lastP);
          if (side <= 0) continue;
        }
        if (word === null || keyCompare(w, other, word, partner) < 0) { word = w; partner = other; }
      }
      if (word === null) { c.fail('index', `${where}: the row is out of order, or its name has no posting here`); continue; }
      const target = leafOf(word, partner);
      if (!(target === number || (runStart[target] === runStart[number]))) c.fail('index', `${where}: the row belongs to leaf ${target} by the directory`);
      actual.add(number, postingText(word, partner, name, b, o, e, y, s, m, h, q, p));
      if (firstW === null) { firstW = word; firstO = partner; }
      lastW = word; lastO = partner; lastName = name; lastB = b; lastP = o;
    }
    fewestProfiles = Math.min(fewestProfiles, people.size);
    if (!options.fixture) c.check(people.size >= LIMITS.leafProfiles, 'limits', `${relative} holds rows of ${people.size} profiles, under ${LIMITS.leafProfiles}`);
    // the directory key, recomputed from the rows on each side of the cut
    if (firstW !== null && number > 0 && leafEntries[number].previousLast) {
      const [beforeW, beforeO] = leafEntries[number].previousLast;
      const key = firstW !== beforeW ? [separator(beforeW, firstW), '', 0] : firstO !== beforeO ? [firstW, separator(beforeO, firstO), 0] : [firstW, firstO, 1];
      c.check(key[0] === entry[0] && key[1] === entry[1] && key[2] === entry[2], 'directory', `${relative}: its key is ${JSON.stringify(entry.slice(0, 3))}, the rows give ${JSON.stringify(key)}`);
      if (firstW === beforeW) c.check(heavy.has(firstW), 'directory', `${relative}: a light word is cut across two leaves`);
    }
    if (number + 1 < Lc && lastW !== null) Object.defineProperty(leafEntries[number + 1], 'previousLast', { value: [lastW, lastO], enumerable: false, configurable: true });
  }
  c.check(indexHash.digest('hex') === manifest.content.index_raw_sha256, 'content', 'index_raw_sha256 differs from the leaves');
  equal('index rows in the leaves', leafRows, counts.index_rows);
  for (let i = Lc - 1; i > 0; i--) if (runStart[i] !== i) { expected.merge(runStart[i], i); actual.merge(runStart[i], i); }
  let differing = 0;
  for (let i = 0; i < Lc; i++) if (!expected.same(actual, i)) { differing++; c.fail('index', `leaf ${i}${keyC[i + 1] === 1 ? ' and the leaves that continue it' : ''}: its rows are not the postings the profiles require (${actual.count[i]} rows, ${expected.count[i]} required)`); }
  facts.indexBytes = indexBytes; facts.profileBytes = shardBytes; facts.largestLeaf = largestLeaf; facts.largestShard = largestShard;
  facts.leafRows = [fewestRows, mostRows]; facts.fewestProfiles = fewestProfiles;
  const pageBytes = manifest.index.pages.reduce((sum, page) => sum + page[3], 0) + manifest.profiles.pages.reduce((sum, page) => sum + page[0], 0);
  facts.totalBytes = indexBytes + shardBytes + pageBytes + manifest.editions.bytes + manifestBytes.length;
  facts.files = 2 + Lc + manifest.index.pages.length + L.PROFILE_SHARDS + manifest.profiles.pages.length;
  if (!options.fixture) c.check(facts.totalBytes <= LIMITS.totalBytes, 'limits', `the build is ${facts.totalBytes} bytes, over the budget of ${LIMITS.totalBytes}`);

  // ---- 7. search
  plans.bytes.sort((a, b) => a - b);
  const at = share => plans.bytes.length ? plans.bytes[Math.min(plans.bytes.length - 1, Math.floor(plans.bytes.length * share))] : 0;
  facts.fullName = { checked: plans.checked, notFound: plans.notFound, over300KB: plans.overAuto, over1MB: plans.overCap, largest: plans.max, median: at(0.5), p99: at(0.99), p999: at(0.999), leaves: plans.leaves };
  c.check(plans.checked === count.searchNames, 'search', 'not every search name was planned');
  c.check(plans.overCap === 0, 'search', `${plans.overCap} search names, typed in full, need more than ${L.SEARCH_HARD_CAP} bytes`);
  c.check(plans.checked === 0 || 1 - plans.overAuto / plans.checked >= LIMITS.autoShare, 'search', `${plans.overAuto} of ${plans.checked} search names, typed in full, need more than ${L.SEARCH_AUTO} bytes: under the stated share of ${LIMITS.autoShare}`);
  const readLeafRows = number => {
    if (!leafCache.has(number)) {
      if (leafCache.size > 40) leafCache.delete(leafCache.keys().next().value);
      const data = JSON.parse(zlib.gunzipSync(readFile(L.leafPath(number))).toString('utf8'));
      leafCache.set(number, data.n.map((name, i) => ({ name, pointer: `${data.b[i]}:${data.o[i]}:${name}`, words: L.searchWords(name) })));
    }
    return leafCache.get(number);
  };
  const run = { queries: 0, executed: 0, refused: 0, wrong: 0, bytes: [] };
  for (const query of queries) {
    run.queries++;
    const tokens = L.queryTokens(query.tokens.join(' '), query.stage);
    let plan;
    try { plan = L.planSearch(tokens, query.stage, manifest.index, indexPages); } catch (error) { c.fail('search', `planning ${query.why} failed: ${error.message}`); continue; }
    const pagesNeeded = L.indexPagesFor(tokens, query.stage, manifest.index);
    try { L.planSearch(tokens, query.stage, manifest.index, new Map(pagesNeeded.map(page => [page, indexPages.get(page)]))); } catch (error) { c.fail('search', `indexPagesFor does not name every page planSearch reads (${query.why})`); }
    if (query.alone) c.check(plan.alone === query.tokens[0] && plan.names === heavy.get(query.tokens[0]), 'search', `a heavy word alone does not return its count (${query.why})`);
    if (plan.bytes > L.SEARCH_HARD_CAP) { run.refused++; continue; }     // never read: the client shows its message instead
    run.executed++; run.bytes.push(plan.bytes);
    const found = new Set();
    for (const number of plan.leaves) for (const row of readLeafRows(number)) if (L.rowMatches(row.words, tokens, query.stage, plan)) found.add(row.pointer);
    let same = found.size === query.truth.size;
    if (same) for (const pointer of found) if (!query.truth.has(pointer)) { same = false; break; }
    if (!same) { run.wrong++; c.fail('search', `${query.why} (stage ${query.stage}, ${tokens.length} word${tokens.length === 1 ? '' : 's'}): the planned leaves give ${found.size} names, a scan of every name gives ${query.truth.size}`); }
  }
  facts.queries = { asked: run.queries, read: run.executed, refusedOver1MB: run.refused, wrong: run.wrong, largestRead: run.bytes.length ? Math.max(...run.bytes) : 0 };
  if (!options.fixture) c.check(run.executed >= 20 && run.refused >= 1, 'search', `the sample ran ${run.executed} queries and refused ${run.refused}: too few to mean anything`);

  // ---- the cohort binding
  const cohortPath = options.cohort || (manifest.cohort ? path.join(dataRoot, 'cohort/manifest.json') : null);
  if (manifest.cohort) {
    if (!fs.existsSync(cohortPath)) c.fail('cohort', `the manifest names a cohort and ${cohortPath} does not exist`);
    else {
      const cohortBytes = fs.readFileSync(cohortPath), cohort = JSON.parse(cohortBytes.toString('utf8'));
      c.check(sha256(cohortBytes) === manifest.cohort.manifest_sha256, 'cohort', 'the cohort manifest is not the one this build names');
      const raw = counts.marathon.results + counts.marathon.unnamed + counts.marathon.placeholder.flagged + counts.marathon.placeholder.listed;
      if (Number.isSafeInteger(cohort.raw_records)) c.check(cohort.raw_records === raw, 'cohort', `the cohort’s raw records are ${cohort.raw_records}; the lookup’s marathon results with the unnamed and placeholder rows are ${raw}`);
      if (Number.isSafeInteger(cohort.eligible_records)) c.check(cohort.eligible_records === (counts.marathon.status['0'] || 0), 'cohort', `the cohort holds ${cohort.eligible_records} eligible records; ${counts.marathon.status['0'] || 0} results are counted`);
      if (Array.isArray(cohort.editions)) for (const e of editions) if (e.context !== null) {
        const listed = cohort.editions[e.context];
        c.check(listed && listed.city === e.city && Number(listed.year) === e.year, 'cohort', `edition ${e.index}: its cohort index names another edition`);
      }
    }
  } else if (!manifest.provisional.includes('cohort')) c.fail('cohort', 'the manifest names no cohort and does not say so in `provisional`');

  facts.seconds = Math.round((Date.now() - started) / 100) / 10;
  return { failures: c, facts, manifest };
}

// ---------------------------------------------------------------------------------------------------------------
// The planner on small made-up directories (always run), and the mutations of --self-test
// ---------------------------------------------------------------------------------------------------------------

function plannerCases() {
  const failures = [];
  const expect = (ok, what) => { if (!ok) failures.push(what); };
  // Code point order: a letter above the surrogates (U+FA0E) sorts before an astral character (U+20BB7).
  expect(L.compareCodePoints('\ufa0e', '\u{20bb7}') < 0 && L.compareCodePoints('\u{20bb7}', '\ufa0e') > 0, 'compareCodePoints: U+FA0E before U+20BB7');
  expect(L.compareCodePoints('a', 'ab') < 0 && L.compareCodePoints('ab', 'a') > 0 && L.compareCodePoints('', '') === 0 && L.compareCodePoints('\u{20bb7}', '\u{20bb8}') < 0 && L.compareCodePoints('z', 'é') < 0, 'compareCodePoints: basics');
  expect(L.normalizeName('  José  O’Neal-Straße  ') === 'jose o neal strasse' && L.normalizeName('ŁUKASZ Żółć') === 'lukasz zolc' && L.normalizeName('Æsa Þórsdóttir, Guðrún') === 'aesa thorsdottir gudrun' &&
    L.normalizeName('IŞIK Işık İpek') === 'isik isik ipek' && L.normalizeName('GROẞ Đorđe Œuvre Søren') === 'gross dorde oeuvre soren' && L.normalizeName('ＬＩ 李 １２') === 'li 李 12' && L.normalizeName(null) === '', 'normalizeName: the fold table and the scripts');
  expect(JSON.stringify(L.searchWords('Smith, José (GBR)')) === '["jose","smith"]' && JSON.stringify(L.searchWords('(USA)')) === '["usa"]' && JSON.stringify(L.searchWords('Lee (ESP)\n')) === '["esp","lee"]' &&
    JSON.stringify(L.searchWords('Lee Lee')) === '["lee"]' && L.searchWords('***').length === 0, 'searchWords: the code, a code alone, a newline, repeats');
  expect(JSON.stringify(L.queryTokens('Anna ann  SMITH li li', 2)) === '["anna","smith","li"]' && JSON.stringify(L.queryTokens('Anna ann', 1)) === '["anna","ann"]', 'queryTokens: a beginning of another token is dropped in stage 2 only');
  expect(L.rowMatches(['jose', 'smith'], ['jos', 'smi'], 2) && !L.rowMatches(['jose', 'smith'], ['jos', 'smi'], 1) && !L.rowMatches(['liam', 'smith'], ['li'], 2) && L.rowMatches(['li', 'smith'], ['li', 'smi'], 2) &&
    !L.rowMatches(['jose', 'smith'], [], 1) && !L.rowMatches(['ann', 'smith'], ['smith'], 1, { alone: 'smith' }) && L.rowMatches(['smith'], ['smith'], 1, { alone: 'smith' }), 'rowMatches: stages, short tokens, a heavy word alone');

  // The parity fixture of names (written by analysis/test_runner_lookup_verifier.py): JavaScript must give what Python gave.
  try {
    for (const entry of JSON.parse(fs.readFileSync(path.join(__dirname, 'lib/lookup-parity.json'), 'utf8')).cases) {
      expect(L.normalizeName(entry.name) === entry.normalized && JSON.stringify(L.searchWords(entry.name)) === JSON.stringify(entry.words), `parity: ${JSON.stringify(entry.name)} normalises differently in JavaScript and Python`);
    }
  } catch (error) { failures.push(`parity: scripts/lib/lookup-parity.json could not be read (${error.message})`); }

  // A made-up index: postings in order, cut by hand into leaves; the planner must reach every matching name.
  const heavyList = ['john', 'smith', 'van'];
  const names = [['adam', 'smith'], ['adam', 'west'], ['ann', 'smith'], ['berg', 'van'], ['dam', 'van'], ['der', 'van', 'berg'], ['der', 'van', 'dam'], ['der', 'van', 'eck'], ['john'], ['john', 'smith'],
    ['john', 'smithers'], ['johnson', 'li'], ['li', 'smith'], ['smit'], ['smith'], ['smith', 'zed'], ['smithers'], ['zed'], ['\ufa0ex'], ['\u{20bb7}y'], ['john', 'van'], ['smart', 'john']].map(words => words.slice().sort(L.compareCodePoints));
  const postings = [];
  names.forEach((words, id) => { for (const [word, partner] of postingKeys(words, new Set(heavyList))) postings.push({ word, partner, id }); });
  postings.sort((a, b) => keyCompare(a.word, a.partner, b.word, b.partner) || a.id - b.id);
  for (const size of [1, 2, 3, 4, 5, 7, 50]) {
    // cut every `size` postings, but never inside a light word; mark c where a (word, partner) group is cut
    const leaves = [];
    let open = [];
    for (let i = 0; i < postings.length; i++) {
      const posting = postings[i];
      const light = !heavyList.includes(posting.word);
      if (open.length >= size && !(light && open[open.length - 1].word === posting.word)) { leaves.push(open); open = []; }
      open.push(posting);
    }
    if (open.length) leaves.push(open);
    const entries = leaves.map((rows, i) => {
      const first = rows[0], before = i ? leaves[i - 1][leaves[i - 1].length - 1] : null;
      const key = !before ? ['', '', 0] : first.word !== before.word ? [separator(before.word, first.word), '', 0] : first.partner !== before.partner ? [first.word, separator(before.partner, first.partner), 0] : [first.word, first.partner, 1];
      return [...key, rows.length, 100 * rows.length, '0'.repeat(64)];
    });
    for (const perPage of [2, 64]) {
      const pages = new Map(), pageList = [];
      for (let first = 0; first < entries.length; first += perPage) { pages.set(first / perPage, { v: 2, first, leaves: entries.slice(first, first + perPage) }); pageList.push([...entries[first].slice(0, 3), 0, '0'.repeat(64)]); }
      const index = { leaves: entries.length, pages: pageList, heavy: heavyList.map(word => [word, names.filter(words => words.includes(word)).length]) };
      const ask = [['smith'], ['john'], ['john', 'smith'], ['smith', 'john'], ['van', 'der'], ['der', 'van', 'berg'], ['van'], ['li', 'smith'], ['li'], ['zed'], ['smit'], ['smi'], ['joh'], ['joh', 'smi'], ['smith', 'adam'],
        ['ada', 'smi'], ['van', 'dam'], ['van', 'd'], ['\ufa0ex'], ['\u{20bb7}y'], ['\ufa0e'], ['zzz'], ['a'], ['smithers'], ['smithe'], ['john', 'van'], ['joh', 'va'], ['sma', 'joh'], ['ber'], ['berg'], ['adam']];
      for (const stage of [1, 2]) for (const typed of ask) {
        const tokens = L.queryTokens(typed.join(' '), stage);
        let plan;
        try { plan = L.planSearch(tokens, stage, index, new Map(L.indexPagesFor(tokens, stage, index).map(page => [page, pages.get(page)]))); } catch (error) { failures.push(`planner (${size}/${perPage}) ${typed} stage ${stage}: ${error.message}`); continue; }
        const got = new Set();
        for (const number of plan.leaves) for (const posting of leaves[number]) if (L.rowMatches(names[posting.id], tokens, stage, plan)) got.add(posting.id);
        const truth = names.map((words, id) => id).filter(id => L.rowMatches(names[id], tokens, stage, plan));
        expect(got.size === truth.length && truth.every(id => got.has(id)), `planner (leaves of ${size}, pages of ${perPage}): ${JSON.stringify(typed)} stage ${stage} reaches ${got.size} of ${truth.length} names`);
        // the binary-search ranges give the same plan as trying every leaf
        const heavySet = L.heavyOf(index);
        const typedTokens = tokens.map(token => ({ token, exact: L.tokenIsExact(token, stage) }));
        let cheapest = null;
        typedTokens.forEach((primary, p) => {
          const partners = plan.alone !== null ? [{ token: '', exact: true }] : [null].concat(typedTokens.filter((_, i) => i !== p));
          for (const partner of partners) {
            const needed = entries.map((entry, i) => L.leafNeeded(entry, i + 1 < entries.length ? entries[i + 1] : null, primary, partner, heavySet) ? i : -1).filter(i => i >= 0);
            const bytes = needed.reduce((sum, i) => sum + entries[i][4], 0);
            if (cheapest === null || bytes < cheapest.bytes || (bytes === cheapest.bytes && needed.length < cheapest.leaves.length)) cheapest = { bytes, leaves: needed };
          }
        });
        expect(JSON.stringify(cheapest.leaves) === JSON.stringify(plan.leaves), `planner (leaves of ${size}, pages of ${perPage}): ${JSON.stringify(typed)} stage ${stage}: the ranges give leaves ${plan.leaves}, every leaf tried gives ${cheapest.leaves}`);
      }
      // a heavy word alone covers only its one-word names and says how many names hold the word
      const plan = L.planSearch(['smith'], 1, index, pages);
      expect(plan.alone === 'smith' && plan.names === index.heavy.find(row => row[0] === 'smith')[1] && plan.partner === '', `planner (leaves of ${size}): a heavy word alone`);
      // the partner narrows a heavy word to fewer leaves than the word alone as a beginning
      if (size <= 2) expect(L.planSearch(['van', 'eck'], 1, index, pages).leaves.length < L.planSearch(['van'], 2, index, pages).leaves.length, `planner (leaves of ${size}): a partner narrows a heavy word`);
    }
  }
  return failures;
}

function selfTest(dataRoot, options) {
  const problems = [];
  const base = verify(dataRoot, { ...options, quiet: true });
  if (base.failures.total) return ['the build given to --self-test does not verify, so its mutations prove nothing'].concat(base.failures.lines());
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-lookup-'));
  const gzip = body => zlib.gzipSync(body, { level: 9 });
  const encode = value => Buffer.from(JSON.stringify(value) + '\n');
  const copy = name => { const target = path.join(temp, name); fs.cpSync(dataRoot, target, { recursive: true }); return target; };
  // Rewrite one leaf or shard and carry the new size and digest up the chain, so only the content is wrong.
  const rechain = (target, kind, number, mutate) => {
    const root = path.join(target, 'runners');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const relative = kind === 'leaf' ? L.leafPath(number) : L.shardPath(number);
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, relative))).toString('utf8'));
    const pageNumber = Math.floor(number / L.PAGE_SIZE), pageRelative = kind === 'leaf' ? L.indexPagePath(pageNumber) : L.profilePagePath(pageNumber);
    const page = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, pageRelative))).toString('utf8'));
    const entry = (kind === 'leaf' ? page.leaves : page.shards)[number % L.PAGE_SIZE];
    mutate(data, entry, manifest, page);
    const bytes = gzip(encode(data));
    fs.writeFileSync(path.join(root, relative), bytes);
    entry[entry.length - 2] = bytes.length; entry[entry.length - 1] = sha256(bytes);
    if (kind === 'leaf') entry[3] = data.n.length;
    const pageBytes = gzip(encode(page));
    fs.writeFileSync(path.join(root, pageRelative), pageBytes);
    const listed = (kind === 'leaf' ? manifest.index.pages : manifest.profiles.pages)[pageNumber];
    listed[listed.length - 2] = pageBytes.length; listed[listed.length - 1] = sha256(pageBytes);
    if (kind === 'leaf' && number % L.PAGE_SIZE === 0) { listed[0] = entry[0]; listed[1] = entry[1]; listed[2] = entry[2]; }
    fs.writeFileSync(path.join(root, 'manifest.json'), encode(manifest));
  };
  const leaves = base.manifest.index.leaves, middle = Math.min(leaves - 1, Math.max(1, leaves >> 1));
  const busiest = (() => { let best = 0; for (let number = 0; number < 64; number++) { try { if (fs.statSync(path.join(dataRoot, 'runners', L.shardPath(number))).size > fs.statSync(path.join(dataRoot, 'runners', L.shardPath(best))).size) best = number; } catch { /* reported above */ } } return best; })();
  const cases = [
    ['a changed byte in a leaf', 'chain', target => { const file = path.join(target, 'runners', L.leafPath(middle)); const bytes = fs.readFileSync(file); bytes[bytes.length - 9] ^= 1; fs.writeFileSync(file, bytes); }],
    ['two leaves swapped, each with its own digest', 'index', target => {
      const a = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(target, 'runners', L.leafPath(0)))).toString('utf8'));
      const b = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(target, 'runners', L.leafPath(middle)))).toString('utf8'));
      rechain(target, 'leaf', 0, data => { for (const key of Object.keys(data)) data[key] = b[key]; });
      rechain(target, 'leaf', middle, data => { for (const key of Object.keys(data)) data[key] = a[key]; });
    }],
    ['a missing posting', 'index', target => rechain(target, 'leaf', middle, data => { for (const key of Object.keys(data)) if (Array.isArray(data[key])) data[key].splice(1, 1); })],
    ['a posting that points at another profile', 'index', target => rechain(target, 'leaf', middle, data => { data.o[0] = data.o[0] === 0 ? 1 : 0; data.b[0] = busiest; })],
    ['a wrong directory key', 'directory', target => rechain(target, 'leaf', middle, (data, entry) => { if (entry[1] === '') entry[0] = entry[0] + '\u0001'; else entry[1] = entry[1] + '\u0001'; })],
    ['a wrong count', 'counts', target => { const file = path.join(target, 'runners/manifest.json'); const manifest = JSON.parse(fs.readFileSync(file, 'utf8')); manifest.counts.marathon.results++; manifest.counts.results++; fs.writeFileSync(file, encode(manifest)); }],
    ['a result listed twice', 'results', target => rechain(target, 'shard', busiest, data => { data.i[1] = data.i[0]; data.e[1] = data.e[0]; })],
    ['a recorded name changed in a shard', 'index', target => rechain(target, 'shard', busiest, data => { data.n[0] = data.n[0] + ' Zzzq'; })],
    ['a file the chain does not list', 'chain', target => fs.writeFileSync(path.join(target, 'runners/index/99999.json.gz'), 'x')],
    ['a release tag in a shard body', 'privacy', target => rechain(target, 'shard', busiest, (data, entry, manifest) => { data.n[0] = data.n[0] + ' ' + manifest.release_tag; })],
  ];
  try {
    for (const [name, check, mutate] of cases) {
      const target = copy(name.replace(/[^a-z]+/g, '-'));
      try { mutate(target); } catch (error) { problems.push(`self-test "${name}": the mutation could not be made (${error.message})`); continue; }
      const result = verify(target, { ...options, quiet: true });
      if (!result.failures.byCheck.has(check)) problems.push(`self-test "${name}": expected a failure of the ${check} check, got ${result.failures.total ? Array.from(result.failures.byCheck.keys()).join(', ') : 'none'}`);
      fs.rmSync(target, { recursive: true, force: true });
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const options = { fixture: false, allowProvisional: false, quiet: false, cohort: null, pipeline: null, neverShown: null };
  let dataRoot = path.join(repo, 'public/data'), self = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-root' && args[i + 1]) dataRoot = path.resolve(args[++i]);
    else if (args[i] === '--cohort' && args[i + 1]) options.cohort = path.resolve(args[++i]);
    else if (args[i] === '--pipeline' && args[i + 1]) options.pipeline = path.resolve(args[++i]);
    else if (args[i] === '--never-shown' && args[i + 1]) options.neverShown = path.resolve(args[++i]);
    else if (args[i] === '--fixture') options.fixture = true;
    else if (args[i] === '--allow-provisional') options.allowProvisional = true;
    else if (args[i] === '--self-test') self = true;
    else if (args[i] === '--quiet') options.quiet = true;
    else { console.error('Usage: node scripts/verify-lookup.cjs [--data-root DIR] [--cohort FILE] [--pipeline DIR] [--never-shown FILE] [--allow-provisional] [--fixture] [--self-test] [--quiet]'); process.exit(2); }
  }
  const planner = plannerCases();
  if (planner.length) { console.error(`verify-lookup: ${planner.length} planner case${planner.length === 1 ? '' : 's'} failed`); for (const line of planner.slice(0, 40)) console.error(`  ${line}`); process.exit(1); }
  if (!options.quiet) console.log('The planner reaches every matching name on the made-up directories, at every leaf size.');
  if (options.fixture) console.log('FIXTURE MODE: index rules and floors are read from the manifest, and the repository’s pin and reviewed files are not compared. This is not a verification of a published build.');
  if (self) {
    const problems = selfTest(dataRoot, options);
    if (problems.length) { console.error(`verify-lookup --self-test: ${problems.length} problem${problems.length === 1 ? '' : 's'}`); for (const line of problems) console.error(`  ${line}`); process.exit(1); }
    console.log('verify-lookup --self-test: every mutation (a changed byte, swapped leaves, a missing posting, a posting to another profile, a wrong directory key, a wrong count, a repeated result, a changed name, a stray file, a tag in a body) failed the check that should catch it.');
    return;
  }
  const { failures, facts, manifest } = verify(dataRoot, options);
  if (failures.total) {
    console.error(`verify-lookup: ${failures.total} failure${failures.total === 1 ? '' : 's'} in ${failures.byCheck.size} check${failures.byCheck.size === 1 ? '' : 's'}`);
    for (const line of failures.lines()) console.error(`  ${line}`);
    process.exit(1);
  }
  const n = value => value.toLocaleString('en-US');
  const full = facts.fullName;
  console.log(`Verified runner lookup of ${manifest.release_tag}${manifest.provisional.length ? ` (PROVISIONAL: ${manifest.provisional.join(', ')})` : ''}: ${n(facts.results)} results once each in ${n(facts.profiles)} profiles and ${n(facts.editions)} editions; ` +
    `${n(facts.files)} files, ${n(facts.totalBytes)} bytes (index ${n(facts.indexBytes)}, largest leaf ${n(facts.largestLeaf)}; profiles ${n(facts.profileBytes)}, largest shard ${n(facts.largestShard)}); ` +
    `leaves of ${n(facts.leafRows[0])} to ${n(facts.leafRows[1])} rows and at least ${n(facts.fewestProfiles)} profiles.`);
  console.log(`Search: all ${n(full.checked)} search names typed in full are reached by their stage-1 plan (median ${n(full.median)} B, 99th percentile ${n(full.p99)}, 99.9th ${n(full.p999)}, largest ${n(full.largest)}; ` +
    `${n(full.over300KB)} over 300 KB, ${n(full.over1MB)} over 1 MB; leaves per plan ${JSON.stringify(full.leaves)}). ${n(facts.queries.read)} sample queries read their leaves and matched a scan of every name (largest ${n(facts.queries.largestRead)} B); ` +
    `${n(facts.queries.refusedOver1MB)} planned over 1 MB and were not read.${facts.neverShown === undefined ? '' : ` None of the ${n(facts.neverShown)} rows that must not appear is in a shard.`} ${facts.seconds} s, peak memory ${n(Math.round(process.resourceUsage().maxRSS / 1024))} MB.`);
}

if (require.main === module) main();
module.exports = { verify, plannerCases, selfTest };
