#!/usr/bin/env node
'use strict';
// The race directory's verifier (docs/RACES.md). It runs from the repository alone: the adapted input is not needed and
// the Python builder is not imported. Every rule is written again here, so a published file is recounted, not trusted.
//
//   1. Provenance: the manifest against the pins. The adopted release; the frozen edition policy (its digest is the one
//      analysis/source_quality.py pins, and it names the adapted input and the race registry the manifest names); the
//      published policy list; the registry; the reviewed notes (analysis/race-notes.json); the evidence files; the
//      marathon cohort's adapted input; both builder scripts (a changed builder without a rebuild fails); every
//      published file's bytes and sha256, and no other file in the folder.
//   2. Editions: every edition with rows is listed exactly once and no other (the policy's counted and listed editions,
//      the pipeline's per-edition facts, the cohort's manifest); tier, split tier, recorded results, finishes, use and
//      category equal those sources; an edition of the release with no row is nowhere.
//   3. Races: label, name, place and slug are the registry's; flags and aliases recomputed from the registry and the
//      notes; page types recomputed by rule; the 27 course pages the site had are course pages; one file per page.
//   4. Race files: the finish-time universe recomputed; numbers only inside it and over the floors (100 finishes; a
//      recorded sex on nine tenths of the finishes); quartiles in order; every reading recomputed from the published
//      rows (three badge-verified editions), per series where the registry notes them.
//   5. summary.json and pages.json recounted from the directory, the policy and the evidence; editions.csv row by row.
//   6. Duplicate editions: the reviewed list is exactly the audit's list; review marks recomputed; a copy carries no
//      number and counts toward nothing; the audit was run on this adapted input by the scripts in the repository.
//   7. No identifier: only known keys, every string from a known vocabulary (the registry's labels, names and places,
//      the notes' aliases, the code lists), no release label, no person id.
//
//   node scripts/verify-races.cjs [--data <races folder>] [--root <repository>] [--self-test]
//
// `--data` reads another copy of the races folder and `--root` another repository (analysis/test_races.py runs this
// verifier on a made-up one); `--self-test` breaks copies of the published folder one way at a time and requires this
// verifier to refuse each for the reason it names.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const { RELEASE_LABEL } = require('./lib/words.cjs');

// ---------- The family's rules, written here independently of analysis/build_races.py ----------
const TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'held_for_review', 'unverified'];
const BADGE = ['stamped', 'stamped_weaker_source'];
const SPLITS = ['splits', 'finish_time_only'];
const USES = ['counted', 'own_record', 'recorded_times_only'];
const CATEGORIES = ['finish_time_only', 'held_for_review', 'unverified', 'partial_coverage', 'invalid_split_grid', 'unreconciled_hold', 'selected_field',
  'mixed_distance_list', 'incomplete_ingestion'];
const TIMINGS = ['net', 'gun', 'mixed', 'not_stated'];
const PAGES = ['course', 'results', 'row'];
const REVIEWS = ['none', 'possible_duplicate', 'copy'];
const FLAGS = ['virtual', 'cancelled', 'placeholder', 'not_a_marathon_title', 'hand_cycle_title', 'mountain_or_trail', 'two_races'];
const BLOCKING = ['virtual', 'cancelled', 'placeholder', 'not_a_marathon_title', 'hand_cycle_title'];
const NOT_ABOUT_GRID = ['incomplete_ingestion', 'mixed_distance_list', 'selected_field', 'unreconciled_hold'];
const EDITION_COLUMNS = ['year', 'tier', 'split_tier', 'results', 'finishes', 'use', 'category', 'timing', 'review'];
// The course pages the site had before this adoption (lib/analytics-policy.ts COURSE_SLUGS at fbe410786): never lost.
const COURSE_SLUGS = ['amsterdam', 'auckland', 'austin', 'barcelona', 'berlin', 'boston', 'chicago', 'copenhagen', 'dubai', 'eindhoven', 'frankfurt', 'gold-coast',
  'hamburg', 'helsinki', 'london', 'madrid', 'new-york', 'oslo', 'paris', 'prague', 'rotterdam', 'singapore', 'stockholm', 'sydney', 'valencia', 'warsaw', 'washington'];
const FLOORS = { finishes_behind_a_number: 100, editions_behind_a_statement: 3, results_page_edition_results: 100, results_page_results: 3000,
  sex_recorded_share: [9, 10], coverage: [0.95, 1.05] };
// Plan decision D16: the words of each tier.
const TIER_WORDS = { stamped: 'Verified', stamped_weaker_source: 'Verified, weaker source', partial: 'Partial results', held_for_review: 'Held for review', unverified: 'Unverified' };
const SPLIT_WORDS = { splits: 'Checkpoint times', finish_time_only: 'Finish times only' };
const USE_WORDS = { counted: 'Counted', own_record: 'Own-record view', recorded_times_only: 'Recorded times only' };
const TIMING_WORDS = { net: 'Chip or net times', gun: 'Gun times', mixed: 'Mixed', not_stated: 'Not stated' };
const REVIEW_WORDS = { none: '', possible_duplicate: 'Possible duplicate, under review', copy: 'Set aside as a copy' };
const TIMING_CLASS = new Map([
  ['chip', 'net'], ['chip (ot) as published', 'net'], ['real time as published', 'net'], ['realTime (net) as published, else officialTime', 'net'],
  ['chip (clock if no chip)', 'net'], ['chip (delta_net), clock if no chip', 'net'], ['chip (gun if no chip)', 'net'], ['chip time else gun', 'net'],
  ['chip elapsed (gun if no chip)', 'net'], ['chip where published, else gun', 'net'], ["net 'time' (gun if none)", 'net'],
  ['gun', 'gun'], ['mixed', 'mixed'], ['unknown', 'not_stated'], ['as published', 'not_stated'], ['as published (Time)', 'not_stated'], ['', 'not_stated'],
]);
const CSV_COLUMNS = ['race', 'race_name', 'place', 'year', 'tier', 'tier_in_words', 'split_tier', 'split_tier_in_words', 'recorded_results', 'finishes_with_a_time',
  'official_count', 'official_count_source', 'official_source_type', 'coverage_pct', 'use', 'use_in_words', 'not_counted_category', 'reason_not_counted', 'timing',
  'timing_basis', 'race_date', 'race_date_source', 'hold_note', 'release_note', 'review', 'copy_of_race', 'copy_of_year', 'reviewed_note', 'release_key'];
const EDITION_NOTES = ['one_list_two_years', 'one_race_two_keys', 'repeated_finish_times'];
const SOURCE_WORDS = ['A statistics site', 'A Wikipedia results table', 'The organiser’s press release', 'The organiser’s statistics or results', 'Government statistics',
  'A peer-reviewed paper', 'A press report'];
const NO_INDEPENDENT_COUNT = 'No independent count: the timing platform’s own result list';
const BANNED_KEYS = new Set(['runner', 'runner_id', 'runner_name', 'record_id', 'person_id', 'bib', 'id', 'match_key', 'age', 'yob']);

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const int = (x, min = 0) => Number.isSafeInteger(x) && x >= min;
const sum = (list, f = (x) => x) => list.reduce((t, x) => t + f(x), 0);
const key = (label, year) => `${label}\u0000${year}`;
// analysis/race_registry.py states(): a phrase as whole words, accents, case and punctuation aside.
const fold = (text) => String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
const hasWord = (text, word) => fold(word) !== '' && (` ${fold(text)} `).includes(` ${fold(word)} `);

/** A CSV as rows of strings (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function verify(dataDir, root = ROOT) {
  const problems = [];
  let checks = 0;
  const ok = (cond, message) => { checks++; if (!cond) problems.push(message); return !!cond; };
  const eq = (a, b, message) => ok(same(a, b), `${message}: ${JSON.stringify(canon(a))?.slice(0, 300)} vs ${JSON.stringify(canon(b))?.slice(0, 300)}`);
  const rel = (p) => path.join(root, p);
  const readJson = (p) => JSON.parse(fs.readFileSync(rel(p), 'utf8'));
  const data = (name) => fs.readFileSync(path.join(dataDir, name));
  const done = () => ({ problems, checks });

  // ---------- 1. Provenance ----------
  if (!ok(fs.existsSync(path.join(dataDir, 'manifest.json')), `${dataDir}: no manifest.json (the race directory is not built)`)) return done();
  const manifest = JSON.parse(data('manifest.json'));
  const release = readJson('analysis/release.json');
  eq([manifest.schema_version, manifest.family, manifest.distance], [1, 'races', 'marathon'], 'the manifest’s schema, family and distance');
  eq(manifest.release_tag, release.tag, 'the race directory uses the adopted release');
  ok(/^analysis\/edition-policy-[0-9-]+\.json$/.test(manifest.policy?.file || ''), 'the manifest names the frozen edition policy');
  if (problems.length) return done();
  const stamp = release.tag.split('-').slice(-2).join('_');
  const pinned = new RegExp(`POLICY_FILE_SHA256_${stamp} = '([0-9a-f]{64})'`).exec(fs.readFileSync(rel('analysis/source_quality.py'), 'utf8'));
  const policyBytes = fs.readFileSync(rel(manifest.policy.file));
  const policy = JSON.parse(policyBytes);
  ok(pinned && pinned[1] === sha(policyBytes), 'the frozen edition policy is the one analysis/source_quality.py pins');
  eq([manifest.policy.sha256, policy.tag], [sha(policyBytes), release.tag], 'the manifest binds the frozen edition policy of the release');
  eq(manifest.input?.manifest_sha256, policy.inputs.adapted_manifest_sha256, 'the adapted input is the one the edition policy was frozen on');
  const publishedBytes = fs.readFileSync(rel('public/data/edition-policy.json'));
  const published = JSON.parse(publishedBytes);
  eq([manifest.policy.published_list?.file, manifest.policy.published_list?.sha256], ['public/data/edition-policy.json', sha(publishedBytes)], 'the manifest binds the published policy list');
  eq([published.release_tag, published.input_manifest_sha256], [release.tag, manifest.input.manifest_sha256], 'the published policy list is of the same release and adapted input');
  const registryBytes = fs.readFileSync(rel('analysis/race-registry.json'));
  const registry = JSON.parse(registryBytes);
  eq([manifest.registry?.file, manifest.registry?.sha256, policy.inputs.race_registry_sha256, registry.tag, registry.distance],
    ['analysis/race-registry.json', sha(registryBytes), sha(registryBytes), release.tag, 'marathon'], 'the manifest and the edition policy bind the race registry');
  const notesBytes = fs.readFileSync(rel('analysis/race-notes.json'));
  const notes = JSON.parse(notesBytes);
  eq([manifest.notes?.file, manifest.notes?.sha256, notes.tag, notes.schema_version], ['analysis/race-notes.json', sha(notesBytes), release.tag, 1], 'the manifest binds the reviewed notes');
  const evidence = {};
  for (const name of ['duplicate_editions', 'cohort_sensitivity', 'edition_facts']) {
    const entry = manifest.evidence?.[name];
    if (!ok(entry && entry.file === notes.evidence?.[name] && /^docs\/evidence\/[0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(entry.file) && fs.existsSync(rel(entry.file)),
      `the manifest and the notes name the evidence file ${name}`)) continue;
    const bytes = fs.readFileSync(rel(entry.file));
    eq(entry.sha256, sha(bytes), `the evidence file ${name}`);
    evidence[name] = JSON.parse(bytes);
  }
  if (!ok(Object.keys(evidence).length === 3, 'the three evidence files are present')) return done();
  const audit = evidence.duplicate_editions, sensitivity = evidence.cohort_sensitivity, facts = evidence.edition_facts;
  eq([audit.release_tag, audit.input_manifest_sha256], [release.tag, manifest.input.manifest_sha256], 'the duplicate-edition audit was run on this adapted input');
  for (const [name, digest] of Object.entries(audit.scripts || {})) eq(digest, sha(fs.readFileSync(rel(name))), `${name} is the script the duplicate-edition audit was run with`);
  eq(Object.keys(audit.scripts || {}).sort(), ['analysis/races_common.py', 'analysis/races_duplicates.py'], 'the audit names its scripts');
  eq([sensitivity.release_tag, sensitivity.input_manifest_sha256, sensitivity.frozen_policy_sha256], [release.tag, manifest.input.manifest_sha256, sha(policyBytes)],
    'the cohort sensitivity evidence is of this release, adapted input and policy');
  eq([facts.tag, facts.frozen_policy_sha256], [release.tag, sha(policyBytes)], 'the edition facts evidence is of this release and policy');
  eq(Object.keys(manifest.scripts || {}).sort(), ['analysis/build_races.py', 'analysis/races_common.py'], 'the manifest names both builder scripts');
  for (const [name, digest] of Object.entries(manifest.scripts || {})) eq(digest, sha(fs.readFileSync(rel(name))), `${name} changed after the race directory was built (rebuild it)`);
  const cohortPath = rel('analysis/marathon-cohort/manifest.json');
  const cohort = fs.existsSync(cohortPath) ? JSON.parse(fs.readFileSync(cohortPath, 'utf8')) : null;
  if (cohort) eq([cohort.release_tag, cohort.input_manifest_sha256], [release.tag, manifest.input.manifest_sha256], 'the marathon cohort and the race directory were built on one adapted input');
  eq(manifest.floors, FLOORS, 'the floors the manifest states');
  eq(manifest.course_slugs_before, COURSE_SLUGS, 'the course pages the site had');

  const listedFiles = Object.keys(manifest.files || {}).sort();
  const onDisk = [];
  (function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (`${prefix}${entry.name}` !== 'manifest.json') onDisk.push(`${prefix}${entry.name}`);
    }
  })(dataDir, '');
  eq(onDisk.sort(), listedFiles, 'the folder holds exactly the files the manifest lists');
  for (const name of listedFiles) {
    if (!fs.existsSync(path.join(dataDir, name))) continue;
    const bytes = data(name);
    eq([bytes.length, sha(bytes)], [manifest.files[name].bytes, manifest.files[name].sha256], `${name}: bytes and sha256`);
  }
  for (const name of ['directory.json', 'pages.json', 'summary.json', 'editions.csv']) ok(listedFiles.includes(name), `the manifest lists ${name}`);
  if (problems.length) return done();   // nothing below is worth reading on files that are not the built ones

  const directory = JSON.parse(data('directory.json'));
  const pagesFile = JSON.parse(data('pages.json'));
  const summary = JSON.parse(data('summary.json'));

  // ---------- 2. Editions: the sources ----------
  const counted = new Set(policy.counted.map(([c, y]) => key(c, y)));
  const listed = new Map(policy.editions.map((e) => [key(e.city, e.year), e]));
  const fact = new Map(facts.editions.map((e) => [key(e.city, e.year), e]));
  eq([policy.counted.length + policy.editions.length, counted.size + listed.size, fact.size], [policy.expected.editions_with_rows, policy.expected.editions_with_rows, policy.expected.editions_with_rows],
    'the policy and the facts evidence name each edition with rows once');
  const cohortRaw = new Map();
  if (cohort) {
    for (const e of cohort.editions) cohortRaw.set(key(e.city, e.year), { raw: e.raw, use: e.use, tier: e.tier, timing_basis: e.timing_basis ?? '' });
    const at = Object.fromEntries(cohort.other_editions.columns.map((c, i) => [c, i]));
    for (const row of cohort.other_editions.rows) cohortRaw.set(key(row[at.city], row[at.year]), { raw: row[at.raw], use: 'recorded_times_only', category: row[at.category] });
    eq(cohortRaw.size, policy.expected.editions_with_rows, 'the cohort manifest names each edition with rows once');
  }
  const inUniverse = (k) => {
    const f = fact.get(k), category = listed.get(k)?.category ?? null;
    const coverage = f.official_finishers ? f.finishes_in_release / f.official_finishers : null;
    const tierOk = BADGE.includes(f.tier) || (f.tier === 'partial' && coverage !== null && coverage >= FLOORS.coverage[0] && coverage <= FLOORS.coverage[1]);
    return tierOk && !NOT_ABOUT_GRID.includes(category);
  };

  // ---------- 6 (first part). Duplicate editions: the reviewed list is the audit's list ----------
  const pairKey = (a, b) => [key(a[0], a[1]), key(b[0], b[1])].sort().join('\u0001');
  const audited = new Set((audit.pairs || []).map((p) => pairKey([p.a.city, p.a.year], [p.b.city, p.b.year])));
  const reviewed = new Map();
  for (const entry of notes.duplicate_editions || []) {
    if (!ok(Array.isArray(entry.editions) && entry.editions.length === 2 && entry.editions.every((e) => Array.isArray(e) && e.length === 2), 'a reviewed duplicate names two editions')) continue;
    const k = pairKey(entry.editions[0], entry.editions[1]);
    ok(!reviewed.has(k), `the pair ${entry.editions.map((e) => e.join(' ')).join(' / ')} is reviewed once`);
    ok(['pending', 'set_aside', 'keep_both'].includes(entry.ruling), `the ruling on ${entry.editions.map((e) => e.join(' ')).join(' / ')} is pending, set_aside or keep_both`);
    if (entry.ruling === 'pending') ok(entry.set_aside == null, 'a pending pair sets nothing aside');
    else ok(entry.ruled_by && entry.ruled_on && entry.words, `the ruling on ${entry.editions.map((e) => e.join(' ')).join(' / ')} names who ruled, when and in what words`);
    if (entry.ruling === 'set_aside') ok(entry.editions.some((e) => same(e, entry.set_aside)), 'a ruling sets aside one of its two editions');
    reviewed.set(k, entry);
  }
  eq([...reviewed.keys()].sort(), [...audited].sort(), 'the reviewed duplicate list is exactly the audit’s list');
  const review = new Map();   // edition -> ['possible_duplicate' | 'copy', other edition]
  for (const entry of reviewed.values()) {
    const [a, b] = entry.editions.map(([c, y]) => key(c, y));
    if (entry.ruling === 'pending') { if (!review.has(a)) review.set(a, ['possible_duplicate', b]); if (!review.has(b)) review.set(b, ['possible_duplicate', a]); }
  }
  for (const entry of reviewed.values()) {
    if (entry.ruling !== 'set_aside') continue;
    const [a, b] = entry.editions.map(([c, y]) => key(c, y));
    const copy = key(entry.set_aside[0], entry.set_aside[1]);
    review.set(copy, ['copy', copy === a ? b : a]);
  }
  const reviewOf = (k) => review.get(k)?.[0] ?? 'none';
  // The list another builder reads (`set_aside_editions`: label, year, the edition kept, the reason) says what the rulings say.
  const setAside = [...review].filter(([, [state]]) => state === 'copy').map(([copy, [, kept]]) => [copy, kept]).sort();
  const listedAside = (notes.set_aside_editions || []).map((e) => [key(e.label, e.year), key(e.kept?.label, e.kept?.year)]).sort();
  eq(listedAside, setAside, 'the notes’ set_aside_editions are exactly the editions the rulings set aside, each with the edition kept');
  ok((notes.set_aside_editions || []).every((e) => EDITION_NOTES.includes(e.reason)), 'every set-aside edition states a known reason');
  const auditedEditions = new Set((audit.pairs || []).flatMap((p) => [key(p.a.city, p.a.year), key(p.b.city, p.b.year)]));
  const reviewedNote = new Map();
  for (const n of notes.edition_notes || []) {
    const k = key(n.label, n.year);
    ok(auditedEditions.has(k) && EDITION_NOTES.includes(n.note) && !reviewedNote.has(k), `the edition note on ${n.label} ${n.year} names, once, an edition of a listed pair and a known note`);
    reviewedNote.set(k, n.note);
  }

  // ---------- 2 and 3. The directory ----------
  eq([directory.schema_version, directory.family, directory.distance], [1, 'races', 'marathon'], 'directory.json: schema');
  eq(directory.codes, { tier: TIERS, split_tier: SPLITS, use: USES, category: CATEGORIES, timing: TIMINGS, review: REVIEWS, page: PAGES, flags: FLAGS }, 'directory.json: the code lists');
  eq(directory.edition_columns, EDITION_COLUMNS, 'directory.json: the edition columns');
  eq(Object.keys(directory).sort(), ['codes', 'distance', 'edition_columns', 'family', 'left_out', 'races', 'schema_version', 'set_aside_editions'], 'directory.json: its keys');
  eq(directory.set_aside_editions, [...(notes.set_aside_editions || [])].map((e) => ({ label: e.label, year: e.year, kept: { label: e.kept?.label, year: e.kept?.year }, reason: e.reason }))
    .sort((a, b) => (key(a.label, a.year) < key(b.label, b.year) ? -1 : 1)), 'directory.json: the set-aside editions are the notes’, with the edition each copies');
  const noted = new Map(), cleared = new Map(), aliasOf = new Map(), allowed = new Set((notes.page_rulings || []).filter((r) => r.page === 'allowed' && r.ruled_by && r.ruled_on && r.words).map((r) => r.label));
  eq((notes.page_rulings || []).length, allowed.size, 'every page ruling allows a page and names who ruled, when and in what words');
  for (const f of notes.flags || []) {
    ok(['virtual', 'cancelled', 'placeholder', 'not_a_marathon_title'].includes(f.flag) && typeof f.evidence === 'string' && f.evidence.length > 0, `the noted flag on ${f.label} is a known flag with its evidence`);
    noted.set(f.label, [...(noted.get(f.label) || []), f.flag]);
  }
  for (const c of notes.clears || []) {
    ok(FLAGS.includes(c.flag) && typeof c.evidence === 'string' && c.evidence.length > 0, `the cleared flag on ${c.label} is a known flag with its evidence`);
    cleared.set(c.label, [...(cleared.get(c.label) || []), c.flag]);
  }
  const registryByLabel = new Map(registry.races.map((r) => [r.label, r]));
  eq(registryByLabel.size, registry.races.length, 'the registry’s labels are unique');
  // Search aliases: a reviewed table of words and their common English names; a race takes the alias when its label,
  // name or place holds the word and none of them holds the alias.
  eq(new Set((notes.aliases || []).map((a) => a.word)).size, (notes.aliases || []).length, 'each alias word is listed once');
  for (const a of notes.aliases || []) {
    if (!ok(a.word && a.alias && typeof a.evidence === 'string' && a.evidence.length > 0, `the alias ${a.alias} states the word it stands for and its evidence`)) continue;
    let taken = 0;
    for (const race of registry.races) {
      const texts = [race.label, race.name, race.place || ''];
      if (texts.some((t) => hasWord(t, a.word)) && !texts.some((t) => hasWord(t, a.alias))) { aliasOf.set(race.label, [...(aliasOf.get(race.label) || []), a.alias]); taken++; }
    }
    ok(taken > 0, `the alias ${a.alias} (for ${a.word}) is taken by at least one race`);
  }
  const ruleFlags = (race) => {
    const f = new Set(race.flags || []);
    return {
      virtual: f.has('virtual_in_title'), cancelled: f.has('cancelled_in_title'), placeholder: f.has('placeholder_place'),
      not_a_marathon_title: f.has('no_marathon_word_in_title') && f.has('other_event_in_title'), hand_cycle_title: f.has('title_names_a_hand_cycle_race'),
      mountain_or_trail: f.has('mountain_or_trail_course') || f.has('trail_or_mountain_word_in_title'), two_races: f.has('several_race_names'),
    };
  };
  for (const [label, flags] of cleared) ok(registryByLabel.has(label) && flags.every((f) => ruleFlags(registryByLabel.get(label))[f]), `${label}: a cleared flag is one the rule gives the race`);
  for (const label of noted.keys()) ok(registryByLabel.has(label), `${label}: a noted flag names a registry label`);
  const flagsOf = (race) => {
    const found = ruleFlags(race), extra = new Set(noted.get(race.label) || []), removed = new Set(cleared.get(race.label) || []);
    return FLAGS.filter((name) => (found[name] && !removed.has(name)) || extra.has(name));
  };
  // A race with no live edition (every edition set aside as a copy) is left out of `races` and kept under `left_out`.
  const yearsOf = new Map();
  for (const k of [...counted, ...listed.keys()]) { const [label, year] = k.split('\u0000'); yearsOf.set(label, [...(yearsOf.get(label) || []), Number(year)]); }
  const noLive = (label) => (yearsOf.get(label) || []).every((year) => reviewOf(key(label, year)) === 'copy');
  eq(directory.races.map((r) => r.label), registry.races.filter((r) => !noLive(r.label)).map((r) => r.label), 'directory.json lists the registry’s races with a live edition, in its order');
  eq((directory.left_out || []).map((r) => r.label), registry.races.filter((r) => noLive(r.label)).map((r) => r.label), 'directory.json keeps the races with no live edition under left_out');
  const seen = new Set();
  const derived = [];   // per race: what the rules give
  const leftOut = [];   // races with no live edition: their editions, for the edition table and the accounting
  const editionsOf = new Map();
  for (const race of [...directory.races, ...(directory.left_out || [])]) {
    const reg = registryByLabel.get(race.label);
    if (!reg) continue;
    const out = noLive(race.label);
    const where = `directory.json ${race.label}`;
    ok(Object.keys(race).every((k) => (out ? ['label', 'name', 'place', 'editions'] : ['label', 'name', 'place', 'page', 'years', 'results', 'finishes', 'editions', 'slug', 'flags', 'aliases', 'withheld']).includes(k)), `${where}: only known keys`);
    eq([race.name, race.place], [reg.name, reg.place ?? null], `${where}: the registry’s name and place`);
    const rows = [];
    let ordered = true;
    for (const row of race.editions) {
      if (!ok(Array.isArray(row) && row.length === EDITION_COLUMNS.length, `${where}: an edition row of ${EDITION_COLUMNS.length} values`)) continue;
      const [year, tier, split, results, finishes, use, category, timing, rev] = row;
      const k = key(race.label, year);
      if (rows.length && rows[rows.length - 1].year >= year) ordered = false;
      ok(!seen.has(k), `${race.label} ${year} is listed once`);
      seen.add(k);
      const f = fact.get(k);
      if (!ok(f && (counted.has(k) || listed.has(k)), `${race.label} ${year} is an edition with rows of the release (the policy and the facts evidence know it)`)) continue;
      const entry = listed.get(k);
      const e = { year, tier: TIERS[tier], split_tier: SPLITS[split], results, finishes, use: USES[use], category: category === null ? null : CATEGORIES[category],
        timing: TIMINGS[timing], review: REVIEWS[rev], k };
      ok(e.tier && e.split_tier && e.use && e.timing && e.review && (category === null || e.category), `${race.label} ${year}: codes inside their lists`);
      eq([e.tier, e.split_tier, e.results, e.finishes], [f.tier, f.split_tier, f.rows, f.finishes], `${race.label} ${year}: tier, split tier, recorded results and finishes equal the policy’s facts`);
      ok(int(results, 1) && int(finishes) && finishes <= results, `${race.label} ${year}: at least one recorded result, and no more finishes than results`);
      eq([e.use, e.category], [counted.has(k) ? 'counted' : entry.own_record ? 'own_record' : 'recorded_times_only', counted.has(k) ? null : entry.category],
        `${race.label} ${year}: use and category equal the frozen edition policy`);
      eq(e.review, reviewOf(k), `${race.label} ${year}: the review mark follows the rulings`);
      const c = cohortRaw.get(k);
      if (cohort && ok(c, `${race.label} ${year}: the cohort manifest names the edition`)) {
        eq([c.raw, c.use], [results, e.use], `${race.label} ${year}: recorded results and use equal the cohort manifest’s`);
        if (c.tier) eq([c.tier, TIMING_CLASS.get(c.timing_basis)], [e.tier, e.timing], `${race.label} ${year}: tier and timing class equal the cohort manifest’s`);
        else eq(c.category, e.category, `${race.label} ${year}: the category equals the cohort manifest’s`);
      }
      rows.push(e);
    }
    ok(ordered, `${where}: editions in year order`);
    editionsOf.set(race.label, rows);
    eq([rows.length, sum(rows, (e) => e.results), rows[0]?.year, rows[rows.length - 1]?.year], [reg.editions, reg.rows, reg.first_year, reg.last_year], `${where}: editions, rows and years equal the registry’s`);
    const live = rows.filter((e) => e.review !== 'copy');
    if (out) { leftOut.push({ label: race.label, reg, rows }); continue; }
    eq([race.years, race.results, race.finishes], [[live[0]?.year, live[live.length - 1]?.year], sum(live, (e) => e.results), sum(live, (e) => e.finishes)], `${where}: years, results and finishes recounted over the live editions`);
    const flags = flagsOf(reg), blocking = flags.filter((f) => BLOCKING.includes(f));
    const countedN = live.filter((e) => e.use === 'counted').length;
    const verified = live.filter((e) => BADGE.includes(e.tier) && e.results >= FLOORS.results_page_edition_results).length;
    const before = COURSE_SLUGS.includes(reg.slug);
    const byNumbers = countedN >= FLOORS.editions_behind_a_statement || before ? 'course'
      : verified >= FLOORS.editions_behind_a_statement && sum(live, (e) => e.results) >= FLOORS.results_page_results ? 'results' : 'row';
    const blocked = blocking.length > 0 && !allowed.has(race.label);
    const page = blocked ? 'row' : byNumbers;
    eq(race.page, page, `${where}: the page type by rule`);
    eq(race.withheld ?? null, blocked && byNumbers !== 'row' ? byNumbers : null, `${where}: the page a flag withholds`);
    eq(race.flags ?? [], flags, `${where}: flags from the registry and the notes`);
    eq(race.aliases ?? [], aliasOf.get(race.label) || [], `${where}: aliases from the notes`);
    eq(race.slug ?? null, page === 'row' ? null : reg.slug, `${where}: a slug only when the race has a page, and the registry’s`);
    derived.push({ label: race.label, reg, rows, live, flags, blocking, page, before, countedN, verified, withheld: blocked && byNumbers !== 'row' ? byNumbers : null });
  }
  eq(seen.size, policy.expected.editions_with_rows, 'every edition with rows is listed, and no other');
  ok([...counted, ...listed.keys()].every((k) => seen.has(k)), 'every counted or listed edition of the policy is in the directory');
  const coursePages = new Set(derived.filter((d) => d.page === 'course').map((d) => d.reg.slug));
  eq(COURSE_SLUGS.filter((s) => !coursePages.has(s)), [], 'the course pages the site had are course pages');
  const pageRaces = derived.filter((d) => d.page !== 'row');
  eq(new Set(pageRaces.map((d) => d.reg.slug)).size, pageRaces.length, 'page slugs are unique');
  for (const d of pageRaces) ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.reg.slug), `${d.label}: a lower-case slug`);
  eq(listedFiles.filter((n) => n.startsWith('race/')), pageRaces.map((d) => `race/${d.reg.slug}.json`).sort(), 'one race file per race with a page, and no other');

  // ---------- 4. Race files ----------
  const median = (values) => { const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const readingOf = (rows) => {
    const used = rows.filter((r) => r.median_s !== undefined && BADGE.includes(r.tier));
    if (used.length < FLOORS.editions_behind_a_statement) return null;
    const medians = used.map((r) => r.median_s), timing = {};
    for (const r of used) timing[r.timing] = (timing[r.timing] || 0) + 1;
    return { measure: 'median_finish_in_a_typical_verified_year', median_s: median(medians), editions: used.length, years: used.map((r) => r.year),
      lowest_s: Math.min(...medians), highest_s: Math.max(...medians), finishes: sum(used, (r) => r.finishes), timing };
  };
  const seriesOf = (reg) => {
    const note = reg.series;
    if (!note) return null;
    const entries = Array.isArray(note) ? note : note.series;
    return entries.map((s) => ({ name: s.name, first_year: s.first_year ?? s.from, last_year: s.last_year ?? s.to })).sort((a, b) => a.first_year - b.first_year);
  };
  const counts = { numbers: 0, women: 0, readings: 0 };
  for (const d of pageRaces) {
    const name = `race/${d.reg.slug}.json`;
    if (!listedFiles.includes(name)) continue;
    const file = JSON.parse(data(name));
    ok(Object.keys(file).every((k) => ['schema_version', 'label', 'name', 'place', 'slug', 'page', 'flags', 'editions', 'reading', 'reading_note', 'series'].includes(k)), `${name}: only known keys`);
    eq([file.schema_version, file.label, file.name, file.place, file.slug, file.page, file.flags], [1, d.label, d.reg.name, d.reg.place ?? null, d.reg.slug, d.page, d.flags], `${name}: the race as the directory has it`);
    eq(file.editions.map((r) => r.year), d.rows.map((e) => e.year), `${name}: every edition of the race, in year order`);
    for (const [i, row] of file.editions.entries()) {
      const e = d.rows[i];
      if (!e || e.year !== row.year) continue;
      const where = `${name} ${row.year}`;
      ok(Object.keys(row).every((k) => ['year', 'tier', 'split_tier', 'results', 'use', 'timing', 'in_universe', 'category', 'review', 'copy_of', 'finishes', 'p25_s', 'median_s', 'p75_s', 'women'].includes(k)), `${where}: only known keys`);
      eq([row.tier, row.split_tier, row.results, row.use, row.timing, row.category ?? null, row.review ?? 'none'], [e.tier, e.split_tier, e.results, e.use, e.timing, e.category, e.review], `${where}: the edition as the directory has it`);
      const universe = inUniverse(e.k) && e.review !== 'copy';
      eq(row.in_universe, universe, `${where}: the finish-time universe (tier, coverage and the policy’s category)`);
      if (e.review === 'copy') eq(row.copy_of, { label: review.get(e.k)[1].split('\u0000')[0], year: Number(review.get(e.k)[1].split('\u0000')[1]) }, `${where}: the edition it copies`);
      else ok(row.copy_of === undefined, `${where}: no copy_of on an edition that is not a copy`);
      if (!universe) { ok(['finishes', 'p25_s', 'median_s', 'p75_s', 'women'].every((k) => row[k] === undefined), `${where}: no number on an edition outside the finish-time universe`); continue; }
      eq(row.finishes, e.finishes, `${where}: finishes`);
      const numbered = e.finishes >= FLOORS.finishes_behind_a_number;
      eq(['p25_s', 'median_s', 'p75_s'].map((k) => row[k] !== undefined), [numbered, numbered, numbered], `${where}: quartiles exactly when the edition has ${FLOORS.finishes_behind_a_number} finishes`);
      eq('women' in row, numbered, `${where}: a share of women, or null, exactly when the edition has ${FLOORS.finishes_behind_a_number} finishes`);
      if (!numbered) continue;
      counts.numbers++;
      ok([row.p25_s, row.median_s, row.p75_s].every((v) => typeof v === 'number' && Number.isInteger(v * 4)) && 7200 <= row.p25_s && row.p25_s <= row.median_s && row.median_s <= row.p75_s && row.p75_s <= 86400,
        `${where}: quartiles of whole seconds, in order, between 2:00:00 and 24:00:00`);
      if (row.women !== null) {
        counts.women++;
        const w = row.women;
        ok(int(w.n) && int(w.of) && w.n <= w.of && w.of <= e.finishes && w.of >= FLOORS.finishes_behind_a_number && FLOORS.sex_recorded_share[1] * w.of >= FLOORS.sex_recorded_share[0] * e.finishes,
          `${where}: the share of women rests on ${FLOORS.finishes_behind_a_number} finishes with a recorded sex, nine tenths of the finishes`);
        ok(Object.keys(w).sort().join() === 'n,of,share' && Math.abs(w.share - w.n / w.of) <= 5e-5 + 1e-12, `${where}: the share is women over finishes with a recorded sex`);
      }
    }
    const rows = file.editions;
    const series = seriesOf(d.reg);
    if (series) {
      eq([file.reading, file.reading_note], [null, 'per_series'], `${name}: a label with a series note has no reading of its own`);
      eq((file.series || []).map((s) => [s.name, s.first_year, s.last_year]), series.map((s) => [s.name, s.first_year, s.last_year]), `${name}: the registry’s series`);
      ok(rows.every((r) => series.filter((s) => s.first_year <= r.year && r.year <= s.last_year).length === 1), `${name}: every edition is in one series`);
      for (const s of file.series || []) {
        const own = rows.filter((r) => s.first_year <= r.year && r.year <= s.last_year);
        eq([s.years, s.reading], [own.map((r) => r.year), readingOf(own)], `${name}: the series ${s.name} and its reading recomputed`);
        if (s.reading) counts.readings++;
      }
    } else {
      ok(file.series === undefined, `${name}: no series without a registry note`);
      const reading = readingOf(rows);
      eq([file.reading, file.reading_note], [reading, reading ? null : 'fewer_than_three_verified_editions_of_100_finishes'], `${name}: the reading recomputed from the published rows`);
      if (file.reading) counts.readings++;
    }
  }

  // ---------- 5. pages.json, summary.json, editions.csv ----------
  eq([pagesFile.schema_version, pagesFile.family, pagesFile.distance, Object.keys(pagesFile).sort()], [1, 'races', 'marathon', ['distance', 'family', 'pages', 'schema_version']], 'pages.json: schema');
  eq(pagesFile.pages, pageRaces.map((d) => ({
    label: d.label, name: d.reg.name, place: d.reg.place ?? null, slug: d.reg.slug, page: d.page, years: [d.live[0].year, d.live[d.live.length - 1].year], editions: d.live.length,
    results: sum(d.live, (e) => e.results), finishes: sum(d.live, (e) => e.finishes),
    tiers: Object.fromEntries(TIERS.filter((t) => d.live.some((e) => e.tier === t)).map((t) => [t, d.live.filter((e) => e.tier === t).length])),
    with_checkpoint_times: d.live.filter((e) => e.split_tier === 'splits').length, counted_editions: d.countedN, own_record_editions: d.live.filter((e) => e.use === 'own_record').length,
    universe_editions: d.live.filter((e) => inUniverse(e.k)).length, page_before: d.before, flags: d.flags, aliases: aliasOf.get(d.label) || [],
  })), 'pages.json: the races with a page, recounted');

  const all = [...derived, ...leftOut].flatMap((d) => d.rows.map((e) => ({ ...e, label: d.label })));
  const live = all.filter((e) => e.review !== 'copy');
  const what = (o) => typeof o?.what === 'string' && o.what.length > 10 && !/\d/.test(o.what);
  const tally = (own) => ({ races: new Set(own.map((e) => e.label)).size, editions: own.length, results: sum(own, (e) => e.results), finishes: sum(own, (e) => e.finishes) });
  const cells = [];
  for (const tier of TIERS) for (const split of SPLITS) {
    const own = live.filter((e) => e.tier === tier && e.split_tier === split);
    if (own.length) cells.push({ tier, split_tier: split, ...tally(own) });
  }
  const strip = ({ what: _, ...rest }) => rest;
  eq([summary.schema_version, summary.family, summary.distance], [1, 'races', 'marathon'], 'summary.json: schema');
  eq(Object.keys(summary).sort(), ['counted', 'distance', 'duplicates', 'editions', 'family', 'finish_time_universe', 'notes', 'races', 'schema_version', 'sensitivity', 'words'], 'summary.json: its keys');
  eq({ ...summary.races, total: strip(summary.races.total), course_pages_kept: strip(summary.races.course_pages_kept), flagged: strip(summary.races.flagged), left_out: strip(summary.races.left_out) }, {
    total: { n: derived.length }, by_page: Object.fromEntries(PAGES.map((p) => [p, derived.filter((d) => d.page === p).length])),
    course_pages_kept: { n: derived.filter((d) => d.before).length }, flagged: { n: derived.filter((d) => d.blocking.length).length },
    page_withheld_by_a_flag: derived.filter((d) => d.withheld).length, left_out: { n: leftOut.length },
  }, 'summary.json: races recounted from the directory');
  eq({ ...summary.editions, total: strip(summary.editions.total), badge_verified: strip(summary.editions.badge_verified) }, {
    total: { n: live.length, results: sum(live, (e) => e.results), finishes: sum(live, (e) => e.finishes) }, by_tier_and_split_tier: cells,
    by_tier: Object.fromEntries(TIERS.filter((t) => live.some((e) => e.tier === t)).map((t) => [t, tally(live.filter((e) => e.tier === t))])),
    by_split_tier: Object.fromEntries(SPLITS.filter((x) => live.some((e) => e.split_tier === x)).map((x) => [x, tally(live.filter((e) => e.split_tier === x))])),
    badge_verified: tally(live.filter((e) => BADGE.includes(e.tier))),
    by_use: Object.fromEntries(USES.map((u) => [u, { editions: live.filter((e) => e.use === u).length, results: sum(live.filter((e) => e.use === u), (e) => e.results) }])),
    not_counted_by_category: Object.fromEntries(CATEGORIES.filter((c) => live.some((e) => e.category === c)).map((c) => [c, live.filter((e) => e.category === c).length])),
  }, 'summary.json: editions recounted from the directory');
  ok([summary.races.total, summary.races.course_pages_kept, summary.races.flagged, summary.editions.total, summary.editions.badge_verified, summary.counted, summary.finish_time_universe,
    summary.notes, summary.duplicates, summary.sensitivity.verified_tiers_only, summary.sensitivity.without_weaker_source_editions].every(what), 'summary.json: every count says what it counts, in words without a number');
  const reading = (r) => ({ editions: r.eligible_editions, races: r.eligible_cities, finishes: r.eligible_finishes, sustained_slowdown: r.sustained_slowdown, sustained_slowdown_pct: r.sustained_slowdown_pct });
  const countedLive = live.filter((e) => e.use === 'counted');
  eq(strip(summary.counted), reading(sensitivity.readings.policy), 'summary.json: the counted cohort as the pipeline’s evidence states it');
  eq([summary.counted.editions, summary.counted.races, summary.counted.finishes], [countedLive.length, new Set(countedLive.map((e) => e.label)).size, published.cohort.eligible],
    'summary.json: counted editions and races recounted, counted finishes equal to the published policy list’s cohort');
  if (cohort) eq(summary.counted.finishes, cohort.eligible_records, 'summary.json: counted finishes equal the marathon cohort’s');
  eq({ verified_tiers_only: strip(summary.sensitivity.verified_tiers_only), without_weaker_source_editions: strip(summary.sensitivity.without_weaker_source_editions), by_tier: summary.sensitivity.by_tier }, {
    verified_tiers_only: reading(sensitivity.readings.verified_tiers_only), without_weaker_source_editions: reading(sensitivity.readings.without_weaker_source_editions),
    by_tier: Object.fromEntries(Object.entries(sensitivity.policy_by_tier).map(([tier, r]) => [tier, reading(r)])),
  }, 'summary.json: the sensitivity readings as the pipeline’s evidence states them');
  const universe = live.filter((e) => inUniverse(e.k));
  eq(strip(summary.finish_time_universe), { editions: universe.length, races: new Set(universe.map((e) => e.label)).size, finishes: sum(universe, (e) => e.finishes),
    editions_with_100_finishes: universe.filter((e) => e.finishes >= FLOORS.finishes_behind_a_number).length }, 'summary.json: the finish-time universe recounted');
  const pending = [...reviewed.values()].filter((r) => r.ruling === 'pending').length;
  const copies = all.filter((e) => e.review === 'copy');
  eq(strip(summary.duplicates), { pairs_listed_by_the_audit: audited.size, pairs_pending: pending, pairs_kept_as_two_editions: [...reviewed.values()].filter((r) => r.ruling === 'keep_both').length,
    editions_set_aside: copies.length, results_set_aside: sum(copies, (e) => e.results) }, 'summary.json: the duplicate review recounted');
  eq(summary.words, { tier: TIER_WORDS, split_tier: SPLIT_WORDS, use: USE_WORDS, timing: TIMING_WORDS }, 'summary.json: the words of the tiers (plan decision D16)');

  const csvRows = parseCsv(data('editions.csv').toString('utf8'));
  eq(csvRows[0], CSV_COLUMNS, 'editions.csv: its columns');
  const table = csvRows.slice(1).map((r) => Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, r[i]])));
  ok(csvRows.slice(1).every((r) => r.length === CSV_COLUMNS.length), 'editions.csv: every row has every column');
  eq(table.length, all.length, 'editions.csv: one row per edition');
  const byKey = new Map(all.map((e) => [e.k, e]));
  const tableKeys = new Set();
  const holdNotes = [], releaseNotes = [];
  for (const r of table) {
    const k = key(r.race, Number(r.year)), e = byKey.get(k), reg = registryByLabel.get(r.race), f = fact.get(k);
    if (!ok(e && reg && f && !tableKeys.has(k), `editions.csv: ${r.race} ${r.year} is an edition of the directory, once`)) continue;
    tableKeys.add(k);
    const where = `editions.csv ${r.race} ${r.year}`;
    eq([r.race_name, r.place, r.tier, r.tier_in_words, r.split_tier, r.split_tier_in_words, r.recorded_results, r.finishes_with_a_time, r.use, r.use_in_words, r.not_counted_category, r.timing, r.review],
      [reg.name, reg.place ?? '', e.tier, TIER_WORDS[e.tier], e.split_tier, SPLIT_WORDS[e.split_tier], String(e.results), String(e.finishes), e.use, USE_WORDS[e.use], e.category ?? '',
        TIMING_WORDS[e.timing], REVIEW_WORDS[e.review]], `${where}: the edition as the directory has it, in words`);
    eq(r.reason_not_counted, listed.get(k)?.reason ?? '', `${where}: the policy’s reason`);
    const kept = e.review === 'copy' ? review.get(k)[1].split('\u0000') : ['', ''];
    eq([r.copy_of_race, r.copy_of_year, r.reviewed_note], [kept[0], kept[1], reviewedNote.get(k) ?? ''], `${where}: the edition a copy copies, and the reviewed note`);
    eq(TIMING_CLASS.get(r.timing_basis), e.timing, `${where}: the producer’s timing basis gives the timing class`);
    ok(reg.keys.includes(r.release_key), `${where}: the release key is one of the race’s keys in the registry`);
    if (f.official_finishers == null) eq([r.official_count, r.official_count_source, r.coverage_pct], ['', NO_INDEPENDENT_COUNT, ''], `${where}: no official count`);
    else {
      ok(r.official_count === String(f.official_finishers) && SOURCE_WORDS.includes(r.official_count_source) && r.official_source_type.length > 0, `${where}: the official count of the policy’s facts, with its source in words`);
      ok(f.official_finishers === 0 ? r.coverage_pct === '' : Math.abs(Number(r.coverage_pct) - 100 * f.finishes_in_release / f.official_finishers) <= 0.005 + 1e-9, `${where}: coverage is the release’s finishes over the official count`);
    }
    ok(/^(|\d{4}-\d{2}-\d{2})$/.test(r.race_date) && ['', 'weather', 'reviewed'].includes(r.race_date_source) && (r.race_date === '') === (r.race_date_source === ''), `${where}: a race date with its source, or neither`);
    if (r.hold_note) holdNotes.push({ label: r.race, year: e.year, tier: e.tier, note: r.hold_note });
    if (r.release_note) releaseNotes.push({ label: r.race, year: e.year, tier: e.tier, note: r.release_note });
  }
  const byLabelYear = (a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.year - b.year);
  eq([[...summary.notes.hold].sort(byLabelYear), [...summary.notes.release].sort(byLabelYear)], [holdNotes.sort(byLabelYear), releaseNotes.sort(byLabelYear)],
    'summary.json: the producer’s notes are the edition table’s');

  // ---------- 7. No identifier, no release label ----------
  const names = new Set(), places = new Set(), seriesNames = new Set(), aliases = new Set((notes.aliases || []).map((a) => a.alias));
  for (const r of registry.races) { names.add(r.label); names.add(r.name); if (r.place) places.add(r.place); for (const s of seriesOf(r) || []) seriesNames.add(s.name); }
  const vocabulary = new Set([...TIERS, ...SPLITS, ...USES, ...CATEGORIES, ...TIMINGS, ...PAGES, ...REVIEWS, ...FLAGS, ...EDITION_COLUMNS, 'races', 'marathon', 'per_series',
    'fewer_than_three_verified_editions_of_100_finishes', 'median_finish_in_a_typical_verified_year',
    ...Object.values(TIER_WORDS), ...Object.values(SPLIT_WORDS), ...Object.values(USE_WORDS), ...Object.values(TIMING_WORDS)]);
  const noteTexts = new Set([...holdNotes, ...releaseNotes].map((n) => n.note));
  const scan = (value, file, under) => {
    if (Array.isArray(value)) { for (const v of value) scan(v, file, under); return; }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) { ok(!BANNED_KEYS.has(k), `${file}: the key ${k} may not be published`); scan(v, file, k); }
      return;
    }
    if (typeof value !== 'string') return;
    ok(!RELEASE_LABEL.test(value) && !/\bp(51|4)_[0-9a-z]/i.test(value), `${file}: a release label or a person id in "${value.slice(0, 60)}"`);
    const known = under === 'what' || vocabulary.has(value)
      || ((under === 'label' || under === 'name') && (names.has(value) || seriesNames.has(value))) || (under === 'place' && places.has(value))
      || (under === 'slug' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) || (under === 'aliases' && aliases.has(value)) || (under === 'note' && noteTexts.has(value))
      || (under === 'reason' && EDITION_NOTES.includes(value));
    ok(known, `${file}: the text "${value.slice(0, 60)}" under ${under} is from no known vocabulary`);
  };
  scan(directory, 'directory.json', '');
  scan(pagesFile, 'pages.json', '');
  scan(summary, 'summary.json', '');
  for (const name of listedFiles.filter((n) => n.startsWith('race/'))) scan(JSON.parse(data(name)), name, '');
  for (const r of table) for (const c of ['hold_note', 'release_note', 'reason_not_counted']) ok(!/\bp(51|4)_[0-9a-z]/i.test(r[c]) && !/\bbib\b/i.test(r[c]), `editions.csv ${r.race} ${r.year}: no identifier in ${c}`);

  // ---------- The manifest's own counts and review lists ----------
  eq(manifest.counts, {
    races: derived.length, races_left_out: leftOut.length, editions: all.length, results: sum(all, (e) => e.results), finishes: sum(all, (e) => e.finishes),
    pages: Object.fromEntries(PAGES.map((p) => [p, derived.filter((d) => d.page === p).length])),
    counted_editions: all.filter((e) => e.use === 'counted').length, own_record_editions: all.filter((e) => e.use === 'own_record').length,
    universe_editions: all.filter((e) => inUniverse(e.k)).length, editions_with_numbers: counts.numbers, editions_with_a_share_of_women: counts.women, readings: counts.readings,
    races_with_a_withheld_page: derived.filter((d) => d.withheld).length, duplicate_pairs: audited.size, editions_set_aside: copies.length,
  }, 'the manifest’s counts recounted');
  eq(manifest.review, {
    course_pages_before: derived.filter((d) => d.before).sort((a, b) => (a.reg.slug < b.reg.slug ? -1 : 1)).map((d) => ({ slug: d.reg.slug, label: d.label, editions: d.rows.length, counted_editions: d.countedN,
      own_record_editions: d.rows.filter((e) => e.use === 'own_record').length, universe_editions: d.rows.filter((e) => inUniverse(e.k)).length, results: sum(d.live, (e) => e.results) })),
    pages_without_a_reviewed_label: pageRaces.filter((d) => !['plain key', 'reviewed label'].includes(d.reg.labelled_by)).map((d) => d.label).sort(),
    page_slugs_over_30_characters: pageRaces.filter((d) => d.reg.slug.length > 30).map((d) => d.reg.slug).sort(),
    page_slugs_reserved: pageRaces.filter((d) => ['all'].includes(d.reg.slug)).map((d) => d.reg.slug).sort(),
    flagged_races: derived.filter((d) => d.blocking.length).map((d) => ({ label: d.label, flags: d.blocking, withheld: d.withheld, editions: d.rows.length, results: sum(d.live, (e) => e.results) })),
    races_left_out: leftOut.map((d) => d.label),
  }, 'the manifest’s review lists recounted');
  return done();
}

// ---------- Self-test: broken copies of the published folder, each refused for its own reason ----------
function selfTest(source, root = ROOT) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-races-'));
  const copy = (name) => { const dir = path.join(base, name); fs.cpSync(source, dir, { recursive: true }); return dir; };
  const rewrite = (dir, file, change) => {
    const target = path.join(dir, file);
    const before = fs.readFileSync(target, 'utf8');
    const after = file.endsWith('.json') ? (() => { const v = JSON.parse(before); change(v); return `${JSON.stringify(v)}\n`; })() : change(before);
    fs.writeFileSync(target, after);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (manifest.files[file]) { manifest.files[file] = { bytes: Buffer.byteLength(after), sha256: sha(Buffer.from(after)) }; fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`); }
  };
  const directory = JSON.parse(fs.readFileSync(path.join(source, 'directory.json'), 'utf8'));
  const pages = JSON.parse(fs.readFileSync(path.join(source, 'pages.json'), 'utf8')).pages;
  const results = pages.find((p) => p.page === 'results'), course = pages.find((p) => p.page === 'course' && p.counted_editions >= 3);
  const numbered = (file) => file.editions.findIndex((r) => r.median_s !== undefined);
  const withReading = pages.find((p) => JSON.parse(fs.readFileSync(path.join(source, `race/${p.slug}.json`), 'utf8')).reading);
  const first = (label) => directory.races.findIndex((r) => r.label === label);
  const cases = [
    ['a file changed after the manifest was written', (dir) => fs.appendFileSync(path.join(dir, 'summary.json'), ' '), /summary\.json: bytes and sha256/],
    ['a file the manifest does not list', (dir) => fs.writeFileSync(path.join(dir, 'race', 'extra.json'), '{}'), /exactly the files the manifest lists/],
    ['an edition left out', (dir) => rewrite(dir, 'directory.json', (v) => v.races[first(course.label)].editions.pop()), /editions, rows and years equal the registry|every edition with rows is listed/],
    ['an edition listed twice', (dir) => rewrite(dir, 'directory.json', (v) => { const r = v.races[first(course.label)]; r.editions.push(r.editions[r.editions.length - 1]); }), /is listed once/],
    ['an edition of no release', (dir) => rewrite(dir, 'directory.json', (v) => { const r = v.races[first(course.label)]; r.editions.push([2099, 0, 0, 500, 500, 0, null, 0, 0]); }), /is an edition with rows of the release/],
    ['a tier that is not the policy’s', (dir) => rewrite(dir, 'directory.json', (v) => { const row = v.races[first(results.label)].editions[0]; row[1] = (row[1] + 1) % 5; }), /tier, split tier, recorded results and finishes equal the policy/],
    ['an edition counted that the policy does not count', (dir) => rewrite(dir, 'directory.json', (v) => { const row = v.races[first(results.label)].editions[0]; row[5] = 0; row[6] = null; }), /use and category equal the frozen edition policy/],
    ['a page type that the rule does not give', (dir) => rewrite(dir, 'directory.json', (v) => { v.races[first(results.label)].page = 'course'; }), /the page type by rule/],
    ['a slug on a race without a page', (dir) => rewrite(dir, 'directory.json', (v) => { v.races.find((r) => r.page === 'row').slug = 'made-up'; }), /a slug only when the race has a page/],
    ['a name that is not the registry’s', (dir) => rewrite(dir, 'directory.json', (v) => { v.races[first(results.label)].name = 'Somebody Else'; }), /the registry’s name and place/],
    ['a total that the editions do not give', (dir) => rewrite(dir, 'summary.json', (v) => { v.editions.total.results += 1; }), /summary\.json: editions recounted/],
    ['a counted cohort that is not the evidence’s', (dir) => rewrite(dir, 'summary.json', (v) => { v.counted.finishes += 1; }), /the counted cohort as the pipeline’s evidence states it/],
    ['a number under the floor', (dir) => rewrite(dir, `race/${results.slug}.json`, (v) => { const row = v.editions.find((r) => r.finishes === undefined); Object.assign(row, { finishes: 120, p25_s: 9000, median_s: 9100, p75_s: 9200, women: null }); }),
      /no number on an edition outside the finish-time universe/],
    ['quartiles out of order', (dir) => rewrite(dir, `race/${results.slug}.json`, (v) => { const row = v.editions[numbered(v)]; row.p25_s = row.p75_s + 1; }), /quartiles of whole seconds, in order/],
    ['a share of women that is not women over recorded', (dir) => rewrite(dir, `race/${results.slug}.json`, (v) => { v.editions.find((r) => r.women).women.share = 0.9999; }), /the share is women over finishes with a recorded sex/],
    ['a reading that the rows do not give', (dir) => rewrite(dir, `race/${withReading.slug}.json`, (v) => { v.reading.median_s += 60; }), /the reading recomputed from the published rows/],
    ['a runner’s name in a file', (dir) => rewrite(dir, `race/${results.slug}.json`, (v) => { v.editions[0].note = 'A. Runner'; }), /only known keys|from no known vocabulary/],
    ['an identifier key', (dir) => rewrite(dir, 'pages.json', (v) => { v.pages[0].record_id = 12; }), /the key record_id may not be published|pages\.json: the races with a page/],
    ['a release label in a file', (dir) => rewrite(dir, 'summary.json', (v) => { v.counted.what += ' pace-notes-marathon-half'; }), /a release label or a person id/],
    ['an official count on a page file', (dir) => rewrite(dir, 'directory.json', (v) => { v.races[0].official_count = 5; }), /only known keys/],
    ['an edition table row that is not the directory’s', (dir) => rewrite(dir, 'editions.csv', (text) => text.replace(/,Verified,/, ',Unverified,')), /the edition as the directory has it, in words/],
    ['a builder count that the files do not give', (dir) => { const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); m.counts.readings += 1; fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m)); }, /the manifest’s counts recounted/],
  ];
  let refused = 0;
  const failures = [];
  for (const [name, breakIt, expected] of cases) {
    const dir = copy(String(refused + failures.length));
    breakIt(dir);
    const { problems } = verify(dir, root);
    if (problems.some((p) => expected.test(p))) refused++;
    else failures.push(`${name}: expected a problem matching ${expected}, got ${JSON.stringify(problems.slice(0, 3))}`);
  }
  fs.rmSync(base, { recursive: true, force: true });
  return { cases: cases.length, refused, failures };
}

function main() {
  const args = process.argv.slice(2);
  const opt = { data: null, root: ROOT, selfTest: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) opt.data = path.resolve(args[++i]);
    else if (args[i] === '--root' && args[i + 1]) opt.root = path.resolve(args[++i]);
    else if (args[i] === '--self-test') opt.selfTest = true;
    else throw new Error('Usage: node scripts/verify-races.cjs [--data <races folder>] [--root <repository>] [--self-test]');
  }
  opt.data ??= path.join(opt.root, 'public/data/races');
  const started = Date.now();
  const { problems, checks } = verify(opt.data, opt.root);
  if (problems.length) {
    console.error(`verify-races: ${problems.length} problem(s) in ${checks} checks`);
    for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
    if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
    process.exit(1);
  }
  console.log(`verify-races: ${checks.toLocaleString('en-US')} checks pass (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  if (opt.selfTest) {
    const result = selfTest(opt.data, opt.root);
    if (result.failures.length) {
      console.error(`verify-races self-test: ${result.failures.length} of ${result.cases} broken copies were not refused for the reason named`);
      for (const f of result.failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(`verify-races self-test: ${result.refused} of ${result.cases} broken copies refused, each for the reason it names`);
  }
}

if (require.main === module) main();
module.exports = { verify, parseCsv };
