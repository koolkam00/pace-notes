#!/usr/bin/env node
'use strict';
// Verification of the linked-records family (public/data/linked; docs/LINKED_RECORDS.md). It runs from the repository
// alone, without the adapted input, and imports no Python builder:
//
//   1. Provenance: the manifest against the pins (analysis/release.json, the frozen edition policy and the digest
//      analysis/source_quality.py pins for it, analysis/race-registry.json, the adapted input the policy names, the
//      release's link file); every builder script's sha256 (a changed builder without a rebuild fails); every published
//      file's bytes and sha256; the frozen numbers against the copy below.
//   2. Shape, floors and bans: every group at least 100 finishes, results or pairs; three editions behind every reading;
//      no identifier, name, rank, order or converted-time key; strings only as closed codes or registry labels; no person
//      id, release label or banned word in any string; "recorded" in every key that says best or first; races in label
//      order.
//   3. Verdicts: every verdict recomputed from the published numbers (a fast or slow year, a race read faster, slower or
//      about the same, a share against what an uninformative order would give, an age band whose rate is stated, the
//      whole-field check, the matched comparison); a race's interval from its reading, standard error and Student's t;
//      every share from its counts.
//   4. Recounts: the checks from their published points (the relation with temperature and with the whole field's
//      sustained-slowdown share inside races, the other fits), the summaries from the rows, and the files against each
//      other and against the manifest.
//
//   node scripts/verify-linked.cjs [--data <folder>] [--self-test]
//
// `--data` reads another copy of the family (development only). `--self-test` checks that the verifier itself refuses
// broken files: it copies the family to a temp folder, breaks one thing at a time and expects a failure each time.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const W = require('./lib/words.cjs');
const args = process.argv.slice(2);
const opt = { data: path.join(ROOT, 'public/data/linked'), selfTest: args.includes('--self-test') };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--data' && args[i + 1]) opt.data = path.resolve(args[++i]);
  else if (args[i] !== '--self-test') throw new Error('Usage: node scripts/verify-linked.cjs [--data <folder>] [--self-test]');
}

// ---------- The frozen numbers (analysis/linked_common.py holds the same; the manifest must carry them) ----------
const MIN_CELL = 100;
const MIN_EDITIONS = 3;
const MIN_MATCH_SIDE = 20;
const YEAR_MARGIN_PCT = 1.0;
const RACE_BAND_PCT = 2.0;
const OUTLIER_PCT = 6.0;
const FIELD_R_MIN = 0.7;
const BESTS_MARGIN = 0.01;
const AGE_AGREE_PCT = 0.3;
const T975 = [12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.3060, 2.2622, 2.2281, 2.2010, 2.1788, 2.1604, 2.1448,
  2.1314, 2.1199, 2.1098, 2.1009, 2.0930, 2.0860, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595, 2.0555, 2.0518, 2.0484,
  2.0452, 2.0423, 2.0395, 2.0369, 2.0345, 2.0322, 2.0301, 2.0281, 2.0262, 2.0244, 2.0227, 2.0211, 2.0195, 2.0181,
  2.0167, 2.0154, 2.0141, 2.0129, 2.0117, 2.0106, 2.0096, 2.0086, 2.0076, 2.0066, 2.0057, 2.0049, 2.0040, 2.0032,
  2.0025, 2.0017, 2.0010, 2.0003];
const DEFINITIONS = {
  min_cell: MIN_CELL, min_editions: MIN_EDITIONS, min_connected: 100, min_match_side: MIN_MATCH_SIDE, max_years_apart: 2,
  finish_range_s: [7200, 43200], link_tiers: ['high_elite', 'high', 'medium'], high_tiers: ['high_elite', 'high'],
  universe_tiers: ['stamped', 'stamped_weaker_source', 'partial'], coverage: [0.95, 1.05],
  never_for_a_reason_other_than_the_split_grid: ['incomplete_ingestion', 'mixed_distance_list', 'selected_field', 'unreconciled_hold'],
  year_margin_pct: YEAR_MARGIN_PCT, race_band_pct: RACE_BAND_PCT, outlier_pct: OUTLIER_PCT, field_r_min: FIELD_R_MIN, bests_margin: BESTS_MARGIN,
  age_agree_pct: AGE_AGREE_PCT, age_range: [18, 85], pair_years: [1, 3], step_max_years_apart: 2, seed: 20261114, t975: T975, bootstrap_draws: 400,
};
const F_TIERS = ['stamped', 'stamped_weaker_source', 'partial'];
const VERIFIED_TIERS = ['stamped', 'stamped_weaker_source'];
const TIMING_BASIS = { chip: 'chip_or_net', chip_fallback: 'chip_or_net', gun: 'gun', mixed: null, not_stated: 'not_stated' };
const TIMING_CODES = Object.keys(TIMING_BASIS);
const FILES = ['editions.json', 'races.json', 'bests.json', 'age.json', 'return.json', 'checks.json'];
const REQUIRED = ['editions.json', 'races.json', 'bests.json', 'age.json', 'checks.json'];   // return.json is left out when its floors fail
const BUILDERS = /^(build_linked|linked_.*)\.py$/;
const SHARED = ['analysis/build_pacing.py', 'analysis/build_public_explorer.py'];   // the cohort and the sustained-slowdown test the builders import

// ---------- What a family file may hold ----------
const IDENTITY_KEY = /^(ids?|rids?|record_?ids?|profile_?ids?|runners?|runner_?ids?|bibs?|bib_?(no|number)|names?|(full|first|last|given|family)_?names?|participants?|participant_?ids?|persons?|person_?ids?|edition_?ids?|match_?keys?|series_key|urls?|source_url)$/i;
const RANK_KEY = /(^|_)(rank(s|ed|ing)?|order(ed|ing)?|position|place|top|bottom|fastest|slowest|league|equivalent|converted|adjusted)(_|$)/i;
const PERSON_ID = /\bp\d+_[0-9a-f]{8,}\b/;
const CODES = {
  tier: new Set(F_TIERS), timing: new Set(TIMING_CODES), basis: new Set(['chip_or_net', 'gun', 'not_stated']),
  verdict: new Set(['fast', 'slow', 'usual', 'faster', 'slower', 'about_the_same', 'more_often', 'less_often', 'as_often', 'stated', 'holds']),
  family: new Set(['linked']), file: new Set(FILES),
};
// The scout's "must not print" lists, beside the site's word rules (scripts/lib/words.cjs BANNED).
const LINKED_BANNED = [
  [/\bslowest\b|\brank|\bleague\b|\btop \d|\bquickest\b/i, 'a rank word'],
  [/\bequivalent\b|\bconver(?:sion|t|ts|ted|ting)\b|\badjust/i, 'an equivalent or adjusted time'],
  [/\bPBs?\b|\bpersonal (?:best|record)s?\b|\bPRs?\b/i, '"personal best" (a best is a recorded best)'],
  [/\bdebut/i, '"debut" (a first is a first recorded marathon)'],
  [/\blearn|\bexperience makes\b|\bputs? (?:runners|people) off\b|\bnever run another\b/i, 'a claim the records cannot carry'],
  [/\bage?ing\b/i, 'an ageing claim'],
];
const wordsOf = (text) => {
  const found = W.wordProblems(text, [...W.BANNED, ...LINKED_BANNED]);
  if (/\b(bests?|firsts?)\b/i.test(text.replace(/_/g, ' ')) && !/recorded/i.test(text)) found.push('"best" or "first" without "recorded"');
  return found;
};

// ---------- Small helpers ----------
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const int = (x, min = 0) => Number.isSafeInteger(x) && x >= min;
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const byCodePoint = (a, b) => { const x = Array.from(a), y = Array.from(b); for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; } return x.length - y.length; };
const logOf = (pct) => Math.log1p(pct / 100);
const pctOf = (delta) => 100 * Math.expm1(delta);
const tMultiplier = (n) => (n - 1 <= T975.length ? T975[n - 2] : 2.0);

function yearVerdict(lo, hi, high) {
  if (lo > YEAR_MARGIN_PCT && (high === null || high > 0)) return 'slow';
  if (hi < -YEAR_MARGIN_PCT && (high === null || high < 0)) return 'fast';
  if (lo > -YEAR_MARGIN_PCT && hi < YEAR_MARGIN_PCT) return 'usual';
  return null;
}
function raceVerdict(r) {
  const variants = ['verified', 'high'].map((k) => r.variants[k]).filter((v) => v !== null).map((v) => v.reading_pct);
  for (const [sign, word] of [[-1, 'faster'], [1, 'slower']]) {
    if ([r.reading_pct, r.earlier_pct, r.later_pct, ...variants].every((x) => sign * x > 0)
      && (sign < 0 ? r.hi_pct < 0 && r.boot_hi_pct < 0 : r.lo_pct > 0 && r.boot_lo_pct > 0)) return word;
  }
  if ([r.lo_pct, r.hi_pct, r.boot_lo_pct, r.boot_hi_pct, r.earlier_pct, r.later_pct].every((x) => x > -RACE_BAND_PCT && x < RACE_BAND_PCT)) return 'about_the_same';
  return null;
}
function shareVerdict(k, n, expected, variantShares) {
  if (n < MIN_CELL) return null;
  const diff = k / n - expected;
  const se = Math.sqrt(expected * (1 - expected) / n);
  const others = variantShares.filter((v) => v !== null).map((v) => v - expected);
  if (Math.abs(diff) > BESTS_MARGIN && Math.abs(diff) > 1.96 * se && others.every((v) => v * diff > 0)) return diff > 0 ? 'more_often' : 'less_often';
  if (Math.abs(diff) + 1.96 * se <= BESTS_MARGIN) return 'as_often';
  return null;
}
/** Correlation and slope of y on x after removing each group's mean. */
function withinRelation(points, key, x, y, minEditions) {
  const groups = new Map();
  for (const p of points) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  let sxx = 0, syy = 0, sxy = 0, n = 0, g = 0;
  for (const rows of groups.values()) {
    if (rows.length < minEditions) continue;
    const mx = rows.reduce((a, p) => a + x(p), 0) / rows.length, my = rows.reduce((a, p) => a + y(p), 0) / rows.length;
    for (const p of rows) { const dx = x(p) - mx, dy = y(p) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    n += rows.length; g += 1;
  }
  return sxx > 0 && syy > 0 ? { editions: n, groups: g, r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx } : null;
}
function corr(pairs) {
  if (pairs.length < MIN_EDITIONS) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length, my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [a, b] of pairs) { sxx += (a - mx) ** 2; syy += (b - my) ** 2; sxy += (a - mx) * (b - my); }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---------- The check ----------
function verify(dataDir, { pins = true } = {}) {
  const problems = [];
  const notes = [];
  let checks = 0;
  const ok = (cond, message) => { checks++; if (!cond) problems.push(message); return !!cond; };
  const eq = (a, b, message) => ok(JSON.stringify(canon(a)) === JSON.stringify(canon(b)), `${message}: ${JSON.stringify(canon(a))} vs ${JSON.stringify(canon(b))}`);
  const close = (a, b, tol, message) => ok(finite(a) && finite(b) && Math.abs(a - b) <= tol, `${message}: ${a} vs ${b} (tolerance ${tol})`);
  const rel = (p) => path.join(ROOT, p);
  const read = (p) => fs.readFileSync(rel(p));

  if (!fs.existsSync(path.join(dataDir, 'manifest.json'))) { problems.push(`${dataDir}: no manifest.json (the family is not built)`); return { problems, checks, notes }; }
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json')));

  // ---------- 1. Provenance ----------
  const release = JSON.parse(read('analysis/release.json'));
  const registryBytes = read('analysis/race-registry.json');
  const registry = JSON.parse(registryBytes);
  const labels = new Set(registry.races.map((r) => r.label));
  eq([manifest.schema_version, manifest.family], [1, 'linked'], 'the manifest’s schema and family');
  let policy = null;
  if (pins) {
    eq(manifest.release_tag, release.tag, 'the family is built on the adopted release');
    const policyFile = manifest.policy?.file || '';
    ok(/^analysis\/edition-policy-[0-9-]+\.json$/.test(policyFile) && fs.existsSync(rel(policyFile)), `the manifest names a frozen edition policy file (${policyFile})`);
    if (fs.existsSync(rel(policyFile))) {
      const policyBytes = read(policyFile);
      policy = JSON.parse(policyBytes);
      eq(manifest.policy.sha256, sha(policyBytes), 'the exact edition policy file');
      eq(policy.tag, release.tag, 'the edition policy is the adopted release’s');
      ok(read('analysis/source_quality.py').toString().includes(`'${sha(policyBytes)}'`), 'analysis/source_quality.py pins the same policy digest');
      eq(manifest.input?.manifest_sha256, policy.inputs?.adapted_manifest_sha256, 'the adapted input is the one the edition policy was frozen on');
      eq(policy.inputs?.race_registry_sha256, sha(registryBytes), 'the edition policy names the race registry in the repository');
    }
    eq([manifest.registry?.file, manifest.registry?.sha256], ['analysis/race-registry.json', sha(registryBytes)], 'the exact race registry');
    eq(registry.tag, release.tag, 'the race registry is the adopted release’s');
    eq([manifest.links?.file, manifest.links?.sha256], ['person-ids-v5.1-race_results_linked.parquet', release.assets?.['person-ids-v5.1-race_results_linked.parquet']], 'the link file is the pinned release asset');
    ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(manifest.input_as_of || ''), 'input_as_of is the adapted input’s time');
    const builders = fs.readdirSync(rel('analysis')).filter((n) => BUILDERS.test(n)).map((n) => `analysis/${n}`);
    eq(Object.keys(manifest.scripts || {}).sort(), [...builders, ...SHARED].sort(), 'every linked builder module and each shared definition is bound to the manifest');
    for (const [name, digest] of Object.entries(manifest.scripts || {})) ok(fs.existsSync(rel(name)) && digest === sha(read(name)), `stale linked data: ${name} changed after the build (rerun analysis/build_linked.py)`);
    const { timing_classes: timingClasses, ...numbers } = manifest.definitions || {};
    eq(numbers, DEFINITIONS, 'the manifest’s frozen numbers are this verifier’s');
    ok(timingClasses && Object.values(timingClasses).every((c) => TIMING_CODES.includes(c)) && timingClasses[''] === 'not_stated', 'the manifest’s timing classes use the five codes');
  }

  // ---------- 2. Inventory ----------
  const present = fs.readdirSync(dataDir).filter((n) => n !== 'manifest.json').sort();
  eq(present, Object.keys(manifest.files || {}).sort(), 'exactly the manifest’s files are published, and nothing else');
  ok(REQUIRED.every((n) => present.includes(n)) && present.every((n) => FILES.includes(n)), `the family’s files (${present.join(', ')})`);
  const files = {};
  const raw = {};
  for (const [name, meta] of Object.entries(manifest.files || {})) {
    if (!fs.existsSync(path.join(dataDir, name))) continue;
    const bytes = fs.readFileSync(path.join(dataDir, name));
    eq([bytes.length, sha(bytes)], [meta.bytes, meta.sha256], `${name}: bytes and sha256`);
    ok(bytes[bytes.length - 1] === 0x0a, `${name}: deterministic JSON ends with a newline`);
    ok(bytes.length < 400_000, `${name}: ${bytes.length} bytes (aggregates only)`);
    raw[name] = bytes.toString('utf8');
    files[name] = JSON.parse(raw[name]);
    eq([files[name].family, files[name].file, files[name].schema_version], ['linked', name, 1], `${name}: its own family, file and schema`);
  }
  if (!REQUIRED.every((n) => files[n])) return { problems, checks, notes };
  const E = files['editions.json'], R = files['races.json'], B = files['bests.json'], A = files['age.json'], C = files['checks.json'], back = files['return.json'] || null;

  // ---------- 3. Bans: keys, strings, labels ----------
  const strings = [];
  const scan = (value, where, labelKeys) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => { ok(typeof v !== 'string', `${where}[${i}]: a bare string in a list`); scan(v, `${where}[${i}]`, false); });
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (labelKeys) ok(labels.has(k), `${where}: "${k}" is not a registry label`);
        else {
          ok(!IDENTITY_KEY.test(k), `${where}.${k}: an identifier or name key`);
          ok(!RANK_KEY.test(k), `${where}.${k}: a rank, order or converted-time key`);
          ok(!/\b(bests?|firsts?)\b/i.test(k.replace(/_/g, ' ')) || /recorded/i.test(k), `${where}.${k}: a key that says best or first without "recorded"`);
        }
        if (typeof v === 'string') {
          ok(!PERSON_ID.test(v), `${where}.${k}: a person id`);
          ok(!W.RELEASE_LABEL.test(v), `${where}.${k}: a release label in a family file`);
          if (k === 'label') ok(labels.has(v), `${where}.${k}: "${v}" is not a registry label`);
          else if (CODES[k]) ok(CODES[k].has(v), `${where}.${k}: "${v}" is not one of the codes this key may hold`);
          else ok(false, `${where}.${k}: a string under a key that may not hold one (${JSON.stringify(v)})`);
          strings.push([`${where}.${k}`, v, k]);
        }
        scan(v, `${where}.${k}`, k === 'races' && (where === 'editions.json' || where === 'races.json'));
      }
    } else if (typeof value === 'number') ok(Number.isFinite(value), `${where}: a non-finite number`);
    else ok(value === null || typeof value === 'boolean' || typeof value === 'string', `${where}: an unexpected value`);
  };
  for (const [name, doc] of Object.entries(files)) scan(doc, name, false);
  // The "must not print" words: on every string that is not a registry label or a closed code, and on every key.
  for (const [where, v, k] of strings) {
    if (k === 'label' || CODES[k]) continue;
    const found = wordsOf(v);
    ok(!found.length, `${where}: ${found.join(', ')}: ${v}`);
  }
  for (const name of Object.keys(files)) {
    ok(!W.RELEASE_LABEL.test(raw[name]), `${name}: a release label`);
    ok(!/"(?:rank|ranking|fastest|slowest|equivalent[a-z_]*|converted[a-z_]*)"\s*:/i.test(raw[name]), `${name}: a rank or converted-time field`);
  }

  // ---------- 4. editions.json: fast years and slow years ----------
  eq([E.margin_pct, E.min_editions, E.min_finishes], [YEAR_MARGIN_PCT, MIN_EDITIONS, MIN_CELL], 'editions.json: its margin and floors');
  const editionRows = [];
  for (const [label, years] of Object.entries(E.races || {})) {
    const groups = {};
    for (const [year, row] of Object.entries(years)) {
      const where = `editions.json ${label} ${year}`;
      ok(/^(19|20)\d{2}$/.test(year), `${where}: a year key`);
      eq(Object.keys(row).sort(), ['basis', 'finishes', 'hi_pct', 'high_pct', 'lo_pct', 'others', 'reading_pct', 'tier', 'timing', 'verdict'], `${where}: its fields`);
      ok(F_TIERS.includes(row.tier), `${where}: a tier of the finish-time universe (${row.tier})`);
      ok(TIMING_CODES.includes(row.timing) && TIMING_BASIS[row.timing] === row.basis && row.basis !== null, `${where}: timing ${row.timing} on basis ${row.basis}`);
      ok(int(row.finishes, MIN_CELL), `${where}: ${row.finishes} finishes, under the floor of ${MIN_CELL}`);
      ok(int(row.others, MIN_EDITIONS - 1), `${where}: compared with ${row.others} other editions, under the floor`);
      ok([row.reading_pct, row.lo_pct, row.hi_pct].every(finite) && row.lo_pct <= row.reading_pct && row.reading_pct <= row.hi_pct, `${where}: the reading inside its interval`);
      ok(row.high_pct === null || finite(row.high_pct), `${where}: the high-links reading`);
      if ([row.lo_pct, row.hi_pct].every(finite)) eq(row.verdict, yearVerdict(row.lo_pct, row.hi_pct, row.high_pct), `${where}: the verdict recomputed`);
      (groups[row.basis] ||= []).push(row);
      editionRows.push({ label, year: Number(year), ...row });
    }
    for (const [basis, rows] of Object.entries(groups)) {
      ok(rows.every((r) => r.others === rows.length - 1), `editions.json ${label} (${basis}): each edition is compared with the ${rows.length - 1} others on its basis`);
      // each reading is the edition against the mean of the others, so the log readings of a group sum to zero
      close(rows.reduce((a, r) => a + logOf(r.reading_pct), 0), 0, 2e-5 * rows.length, `editions.json ${label} (${basis}): the readings against the other years sum to zero`);
    }
  }
  const tally = (rows, key, values) => Object.fromEntries(values.map((v) => [v, rows.filter((r) => r[key] === v).length]));
  eq(E.summary, { editions: editionRows.length, races: Object.keys(E.races || {}).length, by_tier: tally(editionRows, 'tier', F_TIERS),
    by_verdict: tally(editionRows, 'verdict', ['fast', 'slow', 'usual']), no_verdict: editionRows.filter((r) => r.verdict === null).length }, 'editions.json: the summary recounted');
  ok(editionRows.length > 0, 'editions.json holds readings');

  // ---------- 5. races.json: the same linked runners at different races ----------
  eq([R.band_pct, R.min_editions, R.min_people_each_way], [RACE_BAND_PCT, MIN_EDITIONS, MIN_CELL], 'races.json: its band and floors');
  const raceLabels = Object.keys(R.races || {});
  eq(raceLabels, [...raceLabels].sort(byCodePoint), 'races.json: races in label order');
  const raceFields = ['boot_hi_pct', 'boot_lo_pct', 'earlier_pct', 'editions', 'editions_fitted', 'finishes', 'held_for_review', 'hi_pct', 'later_pct', 'lo_pct', 'people',
    'people_earlier', 'people_later', 'reading_pct', 'se', 'tiers', 'timing', 'trail_or_mountain', 'variants', 'verdict', 'year_sd_pct', 'years'];
  for (const [label, r] of Object.entries(R.races || {})) {
    const where = `races.json ${label}`;
    if (!eq(Object.keys(r).sort(), raceFields, `${where}: its fields`)) continue;
    const mine = editionRows.filter((e) => e.label === label && e.basis === 'chip_or_net');
    ok(int(r.editions, MIN_EDITIONS), `${where}: ${r.editions} editions, under the floor of ${MIN_EDITIONS}`);
    eq(r.editions, mine.length, `${where}: its editions are its chip- or net-timed readings in editions.json`);
    eq(r.tiers, tally(mine, 'tier', F_TIERS), `${where}: the tier mix of its editions`);
    eq(r.years, [Math.min(...mine.map((e) => e.year)), Math.max(...mine.map((e) => e.year))], `${where}: its first and last year`);
    eq(r.finishes, mine.reduce((a, e) => a + e.finishes, 0), `${where}: its finishes`);
    eq(Object.keys(r.timing).sort(), [...TIMING_CODES].sort(), `${where}: the timing codes of its fitted editions`);
    ok(Object.values(r.timing).every((n) => int(n)) && Object.values(r.timing).reduce((a, b) => a + b, 0) === r.editions_fitted, `${where}: the timing codes add up to its fitted editions`);
    ok(int(r.held_for_review) && r.editions_fitted >= editionRows.filter((e) => e.label === label).length + r.held_for_review, `${where}: fitted editions hold its readings and its held editions`);
    ok(int(r.people_earlier, MIN_CELL) && int(r.people_later, MIN_CELL), `${where}: ${r.people_earlier} and ${r.people_later} linked runners tie it to other races, under the floor each way`);
    ok(int(r.people) && r.people >= Math.max(r.people_earlier, r.people_later) && r.people <= r.finishes, `${where}: people within its finishes`);
    ok(typeof r.trail_or_mountain === 'boolean', `${where}: the trail-or-mountain flag`);
    eq(r.trail_or_mountain, (registry.races.find((x) => x.label === label)?.flags || []).some((f) => f === 'mountain_or_trail_course' || f === 'trail_or_mountain_word_in_title'), `${where}: the registry’s trail or mountain flags`);
    ok([r.reading_pct, r.se, r.lo_pct, r.hi_pct, r.boot_lo_pct, r.boot_hi_pct, r.earlier_pct, r.later_pct, r.year_sd_pct].every(finite) && r.se >= 0 && r.year_sd_pct >= 0, `${where}: finite numbers`);
    const t = tMultiplier(r.editions);
    close(r.lo_pct, pctOf(logOf(r.reading_pct) - t * r.se / 100), 0.003, `${where}: the lower end from the reading, its standard error and Student’s t (${t})`);
    close(r.hi_pct, pctOf(logOf(r.reading_pct) + t * r.se / 100), 0.003, `${where}: the upper end from the reading, its standard error and Student’s t (${t})`);
    ok(r.boot_lo_pct <= r.reading_pct && r.reading_pct <= r.boot_hi_pct, `${where}: the reading inside its runner-bootstrap interval`);
    close(logOf(r.earlier_pct) + logOf(r.later_pct), 2 * logOf(r.reading_pct), 4e-5, `${where}: the reading is the mean of the earlier and later readings`);
    eq(Object.keys(r.variants).sort(), ['high', 'verified', 'wider'], `${where}: its variants`);
    for (const [name, v] of Object.entries(r.variants)) ok(v === null || (int(v.editions, MIN_EDITIONS) && finite(v.reading_pct)), `${where}: the ${name} variant rests on three editions`);
    eq(r.verdict, raceVerdict(r), `${where}: the verdict recomputed`);
  }
  const raceRows = Object.values(R.races || {});
  if (raceRows.every((r) => r && typeof r.editions === 'number')) {
    const { under_the_floor_each_way: under, ...summary } = R.summary || {};
    eq(summary, { races: raceRows.length, by_verdict: tally(raceRows, 'verdict', ['faster', 'slower', 'about_the_same']), no_verdict: raceRows.filter((r) => r.verdict === null).length }, 'races.json: the summary recounted');
    ok(int(under), 'races.json: the count of races under the floor each way');
  }

  // ---------- 6. checks.json: the evidence, recounted from its points ----------
  const hasEdition = (label, year) => E.races?.[label]?.[String(year)] !== undefined;
  eq(C.outlier_pct, OUTLIER_PCT, 'checks.json: the outlier bar');
  {
    const s = C.slowdown;
    if (ok(s && Array.isArray(s.points) && s.relation, 'checks.json: the whole-field check is published')) {
      eq([s.bar, s.min_eligible, s.min_share_of_finishes, s.min_editions], [FIELD_R_MIN, 1000, 0.5, 4], 'checks.json slowdown: its bar and floors');
      ok(s.points.every((p) => labels.has(p.label) && int(p.eligible, s.min_eligible) && int(p.slow) && p.slow <= p.eligible && finite(p.level) && hasEdition(p.label, p.year)), 'checks.json slowdown: every point is a published edition with at least 1,000 eligible finishes');
      if (policy) { const counted = new Set(policy.counted.map(([c, y]) => `${c}|${y}`)); ok(s.points.every((p) => counted.has(`${p.label}|${p.year}`)), 'checks.json slowdown: every point is a counted edition of the policy'); }
      const again = withinRelation(s.points, (p) => `${p.label}|${p.basis}`, (p) => p.level, (p) => 100 * p.slow / p.eligible, s.min_editions);
      if (ok(again !== null, 'checks.json slowdown: the relation can be recounted')) {
        eq([s.relation.editions, s.relation.groups], [again.editions, again.groups], 'checks.json slowdown: editions and groups recounted');
        eq(again.editions, s.points.length, 'checks.json slowdown: every point sits in a group of at least four');
        close(s.relation.r, again.r, 1e-4, 'checks.json slowdown: the correlation inside races, recounted');
        close(s.relation.slope, again.slope, 1e-4 * Math.max(1, Math.abs(again.slope)), 'checks.json slowdown: the slope, recounted');
        eq(s.verdict, s.relation.r >= FIELD_R_MIN ? 'holds' : null, 'checks.json slowdown: the verdict recomputed');
      }
    }
    const t = C.temperature;
    if (ok(t && Array.isArray(t.points) && t.window, 'checks.json: the temperature check is published')) {
      ok(t.points.every((p) => labels.has(p.label) && finite(p.temp_window) && (p.temp_start === null || finite(p.temp_start)) && finite(p.level)), 'checks.json temperature: its points');
      const key = (p) => `${p.label}|${p.basis}`;
      const again = withinRelation(t.points, key, (p) => p.temp_window, (p) => p.level, MIN_EDITIONS);
      if (ok(again !== null, 'checks.json temperature: the relation can be recounted')) {
        eq([t.window.editions, t.window.groups], [again.editions, again.groups], 'checks.json temperature: editions and groups recounted');
        close(t.window.r, again.r, 1e-4, 'checks.json temperature: the correlation with the race-window temperature, recounted');
        close(t.window.slope, again.slope, 1e-4, 'checks.json temperature: the slope per degree, recounted');
      }
      const start = withinRelation(t.points.filter((p) => p.temp_start !== null), key, (p) => p.temp_start, (p) => p.level, MIN_EDITIONS);
      ok((t.start === null) === (start === null) && (start === null || Math.abs(t.start.r - start.r) <= 1e-4), 'checks.json temperature: the correlation with the start temperature, recounted');
      const means = new Map();
      for (const p of t.points) { const k = key(p); if (!means.has(k)) means.set(k, []); means.get(k).push(p.level); }
      const dev = (p) => p.level - means.get(key(p)).reduce((a, b) => a + b, 0) / means.get(key(p)).length;
      eq(t.bands.map((b) => [b.temp_from, b.temp_to]), [[null, 8], [8, 12], [12, 16], [16, 20], [20, null]], 'checks.json temperature: its bands');
      for (const b of t.bands) {
        const inBand = t.points.filter((p) => p.temp_window >= (b.temp_from ?? -Infinity) && p.temp_window < (b.temp_to ?? Infinity));
        eq([b.editions, b.races], [inBand.length, new Set(inBand.map((p) => p.label)).size], `checks.json temperature ${b.temp_from}–${b.temp_to}: editions and races recounted`);
        if (inBand.length >= MIN_EDITIONS) close(b.mean_pct, inBand.reduce((a, p) => a + dev(p), 0) / inBand.length, 2e-3, `checks.json temperature ${b.temp_from}–${b.temp_to}: the mean against the race’s own mean`);
        else eq(b.mean_pct, null, `checks.json temperature ${b.temp_from}–${b.temp_to}: under three editions, no mean`);
      }
    }
    eq(Object.keys(C.fits || {}).sort(), ['high', 'verified', 'wider'], 'checks.json: the three other fits');
    for (const [name, f] of Object.entries(C.fits || {})) {
      ok(int(f.pairs, 1) && int(f.people, 1) && int(f.editions_fitted, 1), `checks.json fits.${name}: its counts`);
      for (const part of ['editions', 'races']) {
        const x = f[part];
        eq(x.both, x.points.length, `checks.json fits.${name}.${part}: its points`);
        const again = corr(x.points);
        ok((x.r === null) === (again === null) && (again === null || Math.abs(x.r - again) <= 1e-4), `checks.json fits.${name}.${part}: the correlation with the main fit, recounted (${x.r} vs ${again})`);
      }
      const rp = f.races.points;
      eq(f.races.same_sign, rp.filter(([a, b]) => a * b > 0).length, `checks.json fits.${name}.races: readings with the main sign`);
      if (rp.length >= MIN_EDITIONS) close(f.races.sd_of_difference, sd(rp.map(([a, b]) => b - a)), 1e-3, `checks.json fits.${name}.races: the spread of the differences`);
      const mine = raceRows.filter((r) => r.variants?.[name]).map((r) => [r.reading_pct, r.variants[name].reading_pct]);
      eq([...rp].sort((a, b) => a[0] - b[0] || a[1] - b[1]), mine.sort((a, b) => a[0] - b[0] || a[1] - b[1]), `checks.json fits.${name}.races: the same pairs as races.json`);
    }
    if (C.fits?.high) {
      const mine = editionRows.filter((e) => e.high_pct !== null).map((e) => [e.reading_pct, e.high_pct]);
      const order = (a, b) => a[0] - b[0] || a[1] - b[1];
      eq([...C.fits.high.editions.points].sort(order), mine.sort(order), 'checks.json fits.high.editions: the same pairs as editions.json');
    }
    const verified = editionRows.filter((e) => VERIFIED_TIERS.includes(e.tier));
    eq(C.beyond, { editions: editionRows.length, verified_editions: verified.length,
      over_2_pct: editionRows.filter((e) => Math.abs(e.reading_pct) > 2).length, verified_over_2_pct: verified.filter((e) => Math.abs(e.reading_pct) > 2).length,
      over_3_pct: editionRows.filter((e) => Math.abs(e.reading_pct) > 3).length, verified_over_3_pct: verified.filter((e) => Math.abs(e.reading_pct) > 3).length }, 'checks.json: the editions beyond 2% and 3%, recounted');
    if (raceRows.length >= MIN_EDITIONS && raceRows.every((r) => finite(r.year_sd_pct) && finite(r.reading_pct))) {
      eq(C.spread.races, raceRows.length, 'checks.json spread: its races');
      close(C.spread.median_year_sd_pct, median(raceRows.map((r) => r.year_sd_pct)), 1e-3, 'checks.json spread: the median year-to-year spread');
      close(C.spread.race_sd_pct, sd(raceRows.map((r) => r.reading_pct)), 1e-3, 'checks.json spread: the spread between races');
    }
    const five = raceRows.filter((r) => r.editions >= 5);
    eq(C.floor_of_five, { min_editions: 5, races: five.length, by_verdict: tally(five, 'verdict', ['faster', 'slower', 'about_the_same']), no_verdict: five.filter((r) => r.verdict === null).length }, 'checks.json: a floor of five editions, recounted');
    const plain = C.plain_mean_and_two_standard_errors;
    ok(plain && plain.points.length === raceRows.length && plain.faster + plain.slower + plain.neither === raceRows.length, 'checks.json: the plain-mean rule covers the same races');
    if (plain && plain.points.length >= MIN_EDITIONS) close(plain.r, corr(plain.points), 1e-4, 'checks.json: the plain means against the readings, recounted');
    ok(Array.isArray(C.year_levels) && C.year_levels.every((y, i) => int(y.year, 1900) && int(y.editions, 1) && (i === 0 || y.year > C.year_levels[i - 1].year) && ((y.level_pct === null) === (y.editions < MIN_EDITIONS))), 'checks.json: year levels in year order, none under three editions');
    ok(Array.isArray(C.held_for_review) && C.held_for_review.every((h) => labels.has(h.label) && !hasEdition(h.label, h.year) && F_TIERS.includes(h.tier) && int(h.finishes, MIN_CELL)
      && finite(h.from_median_pct) && Math.abs(h.from_median_pct) > OUTLIER_PCT), 'checks.json: an edition held for review is more than 6% from its race’s median and has no reading');
    eq(raceRows.reduce((a, r) => a + (r.held_for_review || 0), 0) <= (C.held_for_review || []).length, true, 'checks.json: the held editions cover those the races count');
  }

  // ---------- 7. bests.json: recorded bests and steps ----------
  {
    eq([B.margin, B.min_results], [BESTS_MARGIN, MIN_CELL], 'bests.json: its margin and floor');
    const variantShare = (v, k, n) => (v === null ? null : v[k] / v[n]);
    const attempts = B.by_recorded_attempt || [];
    eq(attempts.map((r) => r.recorded_attempt), attempts.map((_, i) => i + 2), 'bests.json: recorded attempts from the second, none skipped');
    attempts.forEach((r, i) => {
      const where = `bests.json recorded attempt ${r.recorded_attempt}`;
      ok(int(r.results, MIN_CELL) && int(r.recorded_bests) && r.recorded_bests <= r.results, `${where}: ${r.results} results, under the floor`);
      close(r.share, r.recorded_bests / r.results, 1e-9, `${where}: the share from its counts`);
      close(r.shuffled_share, 1 / r.recorded_attempt, 1e-9, `${where}: one in ${r.recorded_attempt}`);
      eq(Object.keys(r.variants).sort(), ['complete', 'high', 'verified'], `${where}: its variants`);
      for (const [name, v] of Object.entries(r.variants)) ok(v === null || (int(v.results, MIN_CELL) && int(v.recorded_bests) && v.recorded_bests <= v.results), `${where}: the ${name} variant under the floor`);
      eq(r.verdict, shareVerdict(r.recorded_bests, r.results, 1 / r.recorded_attempt, Object.values(r.variants).map((v) => variantShare(v, 'recorded_bests', 'results'))), `${where}: the verdict recomputed`);
      if (i > 0) ok(r.results <= attempts[i - 1].results, `${where}: no more results than the attempt before`);
    });
    const years = B.by_years_since_previous_recorded_best || [];
    eq(years.map((r) => [r.years, r.or_more]), years.map((_, i) => [i + 1, i === years.length - 1]), 'bests.json: years since the previous recorded best from one, the last bin open');
    for (const r of years) { ok(int(r.results, MIN_CELL) && int(r.recorded_bests) && r.recorded_bests <= r.results, `bests.json ${r.years} years since: under the floor`); close(r.share, r.recorded_bests / r.results, 1e-9, `bests.json ${r.years} years since: the share`); }
    const size = B.new_recorded_best_size || {};
    ok(int(size.recorded_bests, MIN_CELL) && size.q25_pct <= size.median_pct && size.median_pct <= size.q75_pct && size.q25_minutes <= size.median_minutes && size.median_minutes <= size.q75_minutes
      && size.q25_pct > 0 && int(size.under_one_minute) && size.under_one_minute <= size.recorded_bests, 'bests.json: the size of a new recorded best');
    const cohort = B.cohort || {};
    eq(size.recorded_bests, cohort.recorded_bests, 'bests.json: every new recorded best is sized');
    ok(attempts.reduce((a, r) => a + r.recorded_bests, 0) <= cohort.recorded_bests && attempts.reduce((a, r) => a + r.results, 0) <= cohort.results_with_an_earlier_recorded_marathon, 'bests.json: the attempts within the cohort');
    eq(attempts[0]?.results, cohort.people_with_two_or_more, 'bests.json: one second recorded marathon per runner with two or more');
    eq(Object.values(cohort.tiers || {}).reduce((a, b) => a + b, 0), cohort.results_with_an_earlier_recorded_marathon, 'bests.json: the tier mix adds up');
    eq(Object.keys(cohort.tiers || {}).sort(), [...F_TIERS].sort(), 'bests.json: the tiers of the finish-time universe');
    const steps = B.steps?.by_step || [];
    eq(B.steps?.max_years_apart, 2, 'bests.json steps: at most two years apart');
    eq(steps.map((r) => r.from_recorded_attempt), steps.map((_, i) => i + 1), 'bests.json: steps from the first recorded marathon, none skipped');
    const stepOk = (r, where) => ok(int(r.pairs, MIN_CELL) && int(r.faster) && r.faster <= r.pairs && r.q25_pct <= r.median_pct && r.median_pct <= r.q75_pct, `${where}: its pairs and quartiles`);
    steps.forEach((r, i) => {
      const where = `bests.json step from recorded attempt ${r.from_recorded_attempt}`;
      stepOk(r, where);
      close(r.share_faster, r.faster / r.pairs, 1e-9, `${where}: the share faster`);
      for (const [name, v] of Object.entries(r.variants)) ok(v === null || stepOk(v, `${where} (${name})`), `${where}: the ${name} variant`);
      eq(r.verdict, shareVerdict(r.faster, r.pairs, 0.5, Object.values(r.variants).map((v) => variantShare(v, 'faster', 'pairs'))), `${where}: the verdict recomputed`);
      if (attempts[i]) ok(r.pairs <= attempts[i].results, `${where}: no more pairs than results of the later attempt`);
    });
    const any = B.steps?.first_recorded_to_second_any_years_apart || {};
    ok(stepOk(any, 'bests.json first recorded to second, any years apart') && any.pairs >= (steps[0]?.pairs ?? Infinity) && Math.abs(any.share_faster - any.faster / any.pairs) <= 1e-9, 'bests.json: the first step over any years apart holds the two-year pairs');
    eq(any.pairs, attempts[0]?.results, 'bests.json: one first-to-second pair per second recorded marathon');
    const bands = B.steps?.first_recorded_to_second_by_mean_finish || [];
    ok(bands.length > 0 && bands.every((b, i) => stepOk(b, `bests.json mean-finish band ${i}`) && Math.abs(b.share_faster - b.faster / b.pairs) <= 1e-9 && (i === 0 || b.mean_finish_from_s === bands[i - 1].mean_finish_to_s)), 'bests.json: the bands of the mean finish are contiguous');
    ok(bands.reduce((a, b) => a + b.pairs, 0) <= (steps[0]?.pairs ?? 0), 'bests.json: the bands hold no more than the first step');
    ok(!/"(?:first|second)_finish_(?:from|to)_s"/.test(raw['bests.json']), 'bests.json: no banding by the first or the second finish alone');
  }

  // ---------- 8. age.json ----------
  {
    eq([A.agree_pct, A.min_pairs, A.years_apart, A.age_range], [AGE_AGREE_PCT, MIN_CELL, [1, 3], [18, 85]], 'age.json: its margin, floor and ranges');
    const bands = A.bands || [];
    ok(bands.length > 0 && bands.every((b, i) => i === 0 || b.age_from === bands[i - 1].age_to + 1), 'age.json: age bands in order, none skipped');
    for (const b of bands) {
      const where = `age.json ${b.age_from}–${b.age_to}`;
      ok(int(b.pairs, MIN_CELL) && finite(b.median_pct_per_year) && int(b.slower) && b.slower <= b.pairs, `${where}: ${b.pairs} pairs, under the floor`);
      const part = (v, max) => v === null || (int(v.pairs, MIN_CELL) && v.pairs <= max && finite(v.median_pct_per_year));
      ok(part(b.same_race, b.pairs) && part(b.verified, b.pairs) && part(b.high, b.pairs) && part(b.by_sex.F, b.pairs) && part(b.by_sex.M, b.pairs), `${where}: a variant or a sex under the floor`);
      ok(int(b.all_pairs.pairs, b.pairs) && finite(b.all_pairs.median_pct_per_year), `${where}: every pair, the first recorded steps included`);
      if (b.by_sex.F && b.by_sex.M) eq(b.by_sex.F.pairs + b.by_sex.M.pairs, b.pairs, `${where}: the two recorded sexes add up`);
      for (const s of ['F', 'M']) ok(b.cross_section[s] === null || (int(b.cross_section[s].results, MIN_CELL) && finite(b.cross_section[s].pct_per_year)), `${where}: the cross-section (${s}) under the floor`);
      const agree = [b.same_race, b.verified, b.high].every((v) => v !== null && Math.abs(v.median_pct_per_year - b.median_pct_per_year) <= AGE_AGREE_PCT + 1e-9);
      eq(b.verdict, agree ? 'stated' : null, `${where}: the verdict recomputed`);
    }
    const cohort = A.cohort || {};
    ok(bands.reduce((a, b) => a + b.pairs, 0) <= cohort.pairs_from_the_third_recorded_marathon && cohort.pairs_from_the_third_recorded_marathon <= cohort.pairs, 'age.json: the bands within the cohort');
    eq(Object.values(cohort.tiers || {}).reduce((a, b) => a + b, 0), cohort.pairs_from_the_third_recorded_marathon, 'age.json: the tier mix adds up');
    const sv = A.survivorship;
    ok(sv === null || (int(sv.seen_again.pairs, MIN_CELL) && int(sv.not_seen_again.pairs, MIN_CELL) && finite(sv.seen_again.median_pct_per_year) && finite(sv.not_seen_again.median_pct_per_year)), 'age.json: the survivorship check under the floor');
  }

  // ---------- 9. return.json ----------
  if (back) {
    eq([back.years, back.within_years, back.band_seconds, back.min_each_side], [[2010, 2019], 2, 600, MIN_MATCH_SIDE], 'return.json: its years, window and cell floor');
    const part = (x, where) => ok(int(x.cells, 1) && int(x.editions, MIN_EDITIONS) && int(x.with_slowdown.finishes, MIN_CELL) && int(x.with_slowdown.seen_again) && x.with_slowdown.seen_again <= x.with_slowdown.finishes
      && Math.abs(x.with_slowdown.share - x.with_slowdown.seen_again / x.with_slowdown.finishes) <= 1e-9 && x.matched_without.share >= 0 && x.matched_without.share <= 1
      && int(x.matched_without.finishes, MIN_MATCH_SIDE * x.cells) && x.with_slowdown.finishes >= MIN_MATCH_SIDE * x.cells
      && Math.abs(x.difference_points - 100 * (x.with_slowdown.share - x.matched_without.share)) <= 1e-3, `${where}: floors, shares and the difference`);
    part(back, 'return.json');
    ok(back.difference_lo_points <= back.difference_points && back.difference_points <= back.difference_hi_points, 'return.json: the difference inside its interval');
    ok(back.high === null || part(back.high, 'return.json high links'), 'return.json: the high-links variant');
    const hd = back.high === null ? null : back.high.difference_points;
    eq(back.verdict, back.difference_hi_points < 0 && (hd === null || hd < 0) ? 'less_often' : back.difference_lo_points > 0 && (hd === null || hd > 0) ? 'more_often' : null, 'return.json: the verdict recomputed');
    ok(Array.isArray(back.by_finish) && back.by_finish.every((b) => part(b, `return.json finish band from ${b.finish_from_s}`)) && back.by_finish.reduce((a, b) => a + b.with_slowdown.finishes, 0) <= back.with_slowdown.finishes, 'return.json: the finish bands within the whole');
    eq(Object.values(back.tiers).reduce((a, b) => a + b, 0), back.editions, 'return.json: the tier mix adds up');
    ok(back.unmatched.with_slowdown.finishes >= back.with_slowdown.finishes && back.unmatched.without.finishes >= back.matched_without.finishes, 'return.json: the matched cells within the unmatched counts');
  }

  // ---------- 10. The manifest's counts against the files ----------
  {
    const c = manifest.cohort || {};
    eq(c.editions, E.summary, 'manifest: the edition summary is the file’s');
    eq(c.races, R.summary, 'manifest: the race summary is the file’s');
    eq(c.bests, { results_with_an_earlier_recorded_marathon: B.cohort.results_with_an_earlier_recorded_marathon, people_with_two_or_more: B.cohort.people_with_two_or_more, recorded_bests: B.cohort.recorded_bests }, 'manifest: the recorded-bests counts are the file’s');
    eq(c.age, { people_with_an_exact_birth_year: A.cohort.people_with_an_exact_birth_year, pairs: A.cohort.pairs, pairs_from_the_third_recorded_marathon: A.cohort.pairs_from_the_third_recorded_marathon }, 'manifest: the age counts are the file’s');
    eq(c.return, back ? { cells: back.cells, editions: back.editions, finishes_with_slowdown: back.with_slowdown.finishes } : null, 'manifest: the return counts are the file’s');
    const u = c.universe || {};
    ok(u.F && u.verified && u.wider && u.verified.editions <= u.F.editions && u.F.editions <= u.wider.editions && u.F.editions <= u.editions_with_rows, 'manifest: verified within F within the wider set');
    ok(u.F && Object.keys(u.F.editions_by_tier).every((t) => F_TIERS.includes(t)) && Object.values(u.F.editions_by_tier).reduce((a, b) => a + b, 0) === u.F.editions, 'manifest: F holds stamped, weaker-source and partial editions only');
    ok(u.F && c.fit && c.fit.editions_fitted <= u.F.editions && E.summary.editions + c.fit.held_for_review <= c.fit.editions_fitted, 'manifest: the readings within the fitted editions within F');
    eq(c.fit?.held_for_review, (C.held_for_review || []).length, 'manifest: the held editions are those checks.json lists');
    eq(c.fit?.bootstrap_draws, manifest.definitions?.bootstrap_draws, 'manifest: the bootstrap draws of the fit');
    if (policy) {
      eq(u.counted?.editions, policy.counted.length, 'manifest: the counted editions are the policy’s');
      eq(u.editions_with_rows, policy.expected.editions_with_rows, 'manifest: the editions with rows are the policy’s');
      // The counted cohort is the site's own (build_pacing.prepare). The release's published edition-policy list states the
      // same cohort and the same adapted input, and so does the runner lookup once it is rebuilt on the release.
      const listed = fs.existsSync(rel('public/data/edition-policy.json')) ? JSON.parse(read('public/data/edition-policy.json')) : null;
      if (ok(listed !== null && listed.release_tag === manifest.release_tag, 'public/data/edition-policy.json is the adopted release’s list')) {
        eq([listed.input_manifest_sha256, listed.cohort?.eligible, listed.editions_counted, listed.editions_with_records],
          [manifest.input?.manifest_sha256, u.counted?.eligible_finishes, u.counted?.editions, u.editions_with_rows], 'manifest: the adapted input, the counted finishes and the edition counts are the published edition-policy list’s');
      }
      const runners = JSON.parse(read('public/data/runners/manifest.json'));
      const lookupEligible = runners.eligible_records ?? runners.cohort?.eligible_records;   // the second form is the lookup's next layout
      if (runners.release_tag === manifest.release_tag && int(lookupEligible)) eq(u.counted.eligible_finishes, lookupEligible, 'manifest: the counted finishes are the runner lookup’s eligible records');
      else notes.push(`the counted finishes (${u.counted?.eligible_finishes}) are not compared with the runner lookup (${runners.release_tag})`);
    }
  }
  return { problems, checks, notes };
}

// ---------- The self-test: the verifier must refuse each broken copy ----------
function selfTest() {
  const base = verify(opt.data);
  if (base.problems.length) throw new Error(`self-test needs a family that passes first (${base.problems.length} problems)`);
  const mutations = [
    ['an edition under the floor of finishes', 'editions.json', (d) => { const row = Object.values(Object.values(d.races)[0])[0]; row.finishes = 99; }],
    ['a verdict the numbers do not carry', 'editions.json', (d) => { const row = Object.values(d.races).flatMap((y) => Object.values(y)).find((r) => r.verdict === null || r.verdict === 'usual'); row.verdict = 'slow'; }],
    ['a rank field', 'races.json', (d) => { Object.values(d.races)[0].rank = 1; }],
    ['a race verdict the numbers do not carry', 'races.json', (d) => { const r = Object.values(d.races).find((x) => x.verdict !== 'faster'); r.verdict = 'faster'; }],
    ['a race interval narrower than Student’s t', 'races.json', (d) => { const r = Object.values(d.races)[0]; r.lo_pct = r.reading_pct - 0.01; r.hi_pct = r.reading_pct + 0.01; }],
    ['a race reading on two editions', 'races.json', (d) => { Object.values(d.races)[0].editions = 2; }],
    ['a person id', 'races.json', (d) => { Object.values(d.races)[0].note = 'p51_6a939b600f1cf575'; }],
    ['a label that is not in the registry', 'races.json', (d) => { d.races['No Such Race Anywhere'] = Object.values(d.races)[0]; }],
    ['a best without "recorded"', 'bests.json', (d) => { d.best_share = 0.5; }],
    ['an attempt under the floor', 'bests.json', (d) => { const r = d.by_recorded_attempt[d.by_recorded_attempt.length - 1]; r.results = 99; r.recorded_bests = Math.min(r.recorded_bests, 99); }],
    ['a share that is not its counts', 'bests.json', (d) => { d.by_recorded_attempt[0].share += 0.01; }],
    ['an age band under the floor', 'age.json', (d) => { d.bands[0].pairs = 99; }],
    ['an age verdict without agreement', 'age.json', (d) => { const b = d.bands[0]; b.verdict = 'stated'; b.same_race = null; }],
    ['a whole-field correlation that is not its points', 'checks.json', (d) => { d.slowdown.relation.r = 0.99; }],
    ['a banned word in a string', 'checks.json', (d) => { d.temperature.note = 'the heat cost five percent'; }],
  ];
  let failed = 0;
  for (const [what, file, mutate] of mutations) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-linked-'));
    try {
      for (const name of fs.readdirSync(opt.data)) fs.copyFileSync(path.join(opt.data, name), path.join(dir, name));
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      mutate(doc);
      const bytes = Buffer.from(`${JSON.stringify(doc)}\n`);
      fs.writeFileSync(path.join(dir, file), bytes);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      manifest.files[file] = { bytes: bytes.length, sha256: sha(bytes) };   // so that only the broken content can fail
      fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
      const result = verify(dir);
      if (!result.problems.length) { failed++; console.error(`self-test: ${what} was not refused`); }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  if (failed) { console.error(`verify-linked self-test: ${failed} of ${mutations.length} broken copies passed`); process.exit(1); }
  console.log(`verify-linked self-test: ${mutations.length} broken copies refused`);
}

if (require.main === module) {
  const started = Date.now();
  if (opt.selfTest) selfTest();
  else {
    const { problems, checks, notes } = verify(opt.data);
    for (const note of notes) console.log(`verify-linked: note: ${note}`);
    if (problems.length) {
      console.error(`verify-linked: ${problems.length} of ${checks} checks failed`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`verify-linked: ${checks} checks passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
}
module.exports = { verify, yearVerdict, raceVerdict, shareVerdict, tMultiplier };
