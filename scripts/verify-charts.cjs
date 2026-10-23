#!/usr/bin/env node
// Independent reconciliation of the Top 100 charts (public/data/charts, /charts).
// It does not import the Python builders: the eligible finishes are rebuilt from the checksum-verified runner shards
// (scripts/charts/cohort.cjs) and every chart's takeaway values and plotted numbers are recounted by its own function in
// scripts/charts/<module>.cjs. A registered chart without a recount fails. Before the recounts it checks provenance (the
// adopted release, the exact runner manifest, the catalog, the weather evidence, every script hash), the inventory, the
// group-size threshold, identifier fields, release labels in copy, the words every title and takeaway may not use,
// title and description lengths, and that no chart string equals a recorded runner name.
//
//   node scripts/verify-charts.cjs [--input public/data/charts] [--data-root public/data] [--text-only] [--only slug,...]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), Module = require('node:module');

const started = Date.now();
const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--text-only') opt.textOnly = true;
  else if (['--input', '--data-root', '--only'].includes(a) && argv[i + 1]) opt[a.slice(2)] = argv[++i];
  else throw new Error('Usage: node scripts/verify-charts.cjs [--input dir] [--data-root dir] [--text-only] [--only slug,...]');
}
const dataRoot = path.resolve(opt['data-root'] || path.join(root, 'public/data'));
const input = path.resolve(opt.input || path.join(dataRoot, 'charts'));
const only = opt.only ? new Set(opt.only.split(',')) : null;
// With --only (development: one theme's charts built into a folder of their own), the inventory, text and recount checks
// cover the listed charts alone. A full run (CI, verify:data) covers the whole catalog.
const scope = (list) => (only ? list.filter((c) => only.has(c.slug)) : list);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const { loadCohort, quantile, quantileSorted, median, normaliseName, MIN_CELL, LENGTHS, AGE_LABELS, GENDER_LABELS } = require('./charts/cohort.cjs');
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks++; };

// ---------- 1. Catalog and provenance ----------
const catalog = read(path.join(root, 'lib/charts/catalog.json'));
const THEMES = ['finish-times', 'pacing', 'racing', 'courses', 'people', 'trends'];
assert.deepEqual(catalog.map((c) => c.number), catalog.map((_, i) => i + 1), 'The catalog numbers its charts 1…n in order');
ok(new Set(catalog.map((c) => c.slug)).size === catalog.length, 'Unique chart slugs');
for (const c of catalog) {
  ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug), `${c.slug}: a lowercase slug`);
  ok(THEMES.includes(c.theme), `${c.slug}: a known theme`);
  ok(/^charts_[a-z0-9_]+$/.test(c.module) && fs.existsSync(path.join(root, 'analysis', `${c.module}.py`)), `${c.slug}: its builder module exists`);
}
const pin = read(path.join(root, 'analysis/release.json'));
const runnerBytes = fs.readFileSync(path.join(dataRoot, 'runners/manifest.json'));
const runners = JSON.parse(runnerBytes);
const manifest = read(path.join(input, 'manifest.json'));
assert.equal(manifest.schema_version, 1, 'Charts manifest schema');
assert.equal(runners.release_tag, pin.tag, 'Adopted runner source');
assert.equal(manifest.release_tag, pin.tag, 'Charts use the adopted release');
assert.equal(manifest.runner_manifest_sha256, hash(runnerBytes), 'Exact runner manifest binding');
assert.equal(manifest.runner_manifest_as_of, runners.as_of); assert.equal(manifest.input_as_of, runners.input_as_of);
// With --only (development), other charts' catalog rows may have changed since this folder was built; the listed charts'
// rows are still checked file by file below. A full run requires the exact catalog.
const catalogSha = hash(fs.readFileSync(path.join(root, 'lib/charts/catalog.json')));
if (only && manifest.catalog_sha256 !== catalogSha) console.warn('Note: the catalog changed since this folder was built (development run).');
else assert.equal(manifest.catalog_sha256, catalogSha, 'The charts were built from the current catalog');
assert.equal(manifest.weather.release_tag, read(path.join(root, 'analysis/weather-release.json')).tag, 'Weather evidence pin');
assert.equal(manifest.weather.evidence_sha256, hash(fs.readFileSync(path.join(dataRoot, 'weather/evidence.json'))), 'Exact weather evidence binding');
assert.equal(manifest.eligible_records, runners.eligible_records, 'Eligible source records');
assert.deepEqual(manifest.genders, GENDER_LABELS); assert.deepEqual(manifest.ages, AGE_LABELS);
assert.deepEqual(manifest.duplicate_edition_screen, [], 'No duplicate-edition screen in this release');
const analysisDir = path.join(root, 'analysis');
for (const name of ['build_charts.py', 'charts_common.py', 'build_insights.py', 'insights_data.py', 'insights_stats.py', 'build_fast_start.py']) ok(name in manifest.scripts, `Shared script bound: ${name}`);
const unbound = fs.readdirSync(analysisDir).filter((n) => /^charts_.*\.py$/.test(n) && !(n in manifest.scripts));
assert.deepEqual(unbound, [], 'Every charts_*.py module is bound to the manifest');
// With --only, other themes' modules may have moved on since this folder was built; only the listed charts' modules count.
const ownModules = only ? new Set(catalog.filter((c) => only.has(c.slug)).map((c) => `${c.module}.py`)) : null;
const bound = Object.entries({ ...runners.scripts, ...manifest.scripts }).filter(([name]) => !ownModules || !/^charts_/.test(name) || name === 'charts_common.py' || ownModules.has(name));
for (const [name, digest] of bound) {
  assert.match(name, /^[a-z0-9_]+\.py$/);
  assert.equal(digest, hash(fs.readFileSync(path.join(analysisDir, name))), `Stale calculation script: ${name}`);
}

// ---------- 2. Inventory ----------
const present = fs.readdirSync(input).filter((f) => f !== 'manifest.json').sort();
if (!only) {
  assert.deepEqual(present, catalog.map((c) => `${c.slug}.json`).sort(), 'Exactly one file per catalog chart, and nothing else');
  assert.deepEqual(Object.keys(manifest.files), present, 'The manifest lists every chart file');
}
const files = new Map();
for (const c of scope(catalog)) {
  const bytes = fs.readFileSync(path.join(input, `${c.slug}.json`));
  assert.equal(bytes.length, manifest.files[`${c.slug}.json`].bytes, `${c.slug}: bytes`);
  assert.equal(hash(bytes), manifest.files[`${c.slug}.json`].sha256, `${c.slug}: checksum`);
  const doc = JSON.parse(bytes);
  for (const k of ['release_tag', 'runner_manifest_sha256', 'input_as_of', 'runner_manifest_as_of', 'eligible_records', 'analysis_n']) assert.equal(doc[k], manifest[k], `${c.slug}: ${k}`);
  assert.deepEqual([doc.family, doc.number, doc.slug, doc.theme], ['chart', c.number, c.slug, c.theme], `${c.slug}: its catalog row`);
  ok(Number.isSafeInteger(doc.cohort_n) && doc.cohort_n >= MIN_CELL, `${c.slug}: cohort_n`);
  ok(['pooled', 'editions-equal', 'pairs'].includes(doc.weighting), `${c.slug}: weighting`);
  ok(typeof doc.method === 'string' && doc.method.length > 20, `${c.slug}: a method line for /methodology`);
  files.set(c.slug, doc);
}

// ---------- 3. Structure and copy ----------
const identityKey = /^(ids?|rids?|record_?ids?|profile_?ids?|runners?|runner_?ids?|bibs?|bib_?(no|number)|names?|(full|first|last|given|family)_?names?|participants?|participant_?ids?|persons?|person_?ids?)$/i;
const groupKey = (key) => key === 'n' || /^(women|men|young|older)_n$/.test(key) || key === 'n_comparison' || key === 'matched_weight';
const RELEASE_LABEL = /private-export|20260912|htw-db-|20261016|20261021/;
// The union of the site's word rules (verify-nuggets, verify-seo, verify-tools, verify-weather): no causal verbs, no
// promise or odds, no "fastest", counts are finishes, the owner's banned words, no halfway, DNF, goal or "chased" claims.
const BANNED = [
  [/arithmetic/i, 'the word "arithmetic"'], [/\bthe\s+wall\b/i, '"the wall"'], [/\byour\s+(?:[\p{L}\p{N}’'-]+\s+){0,2}chances?\b/iu, '"your chance"'],
  [/\byour odds\b|\byou will\b|\bpredict/i, 'odds, a promise or a prediction'], [/\bfastest\b/i, '"fastest"'],
  [/\b\d[\d,.]*\s+(?:million\s+)?runners\b/i, 'a count of runners (counts are finishes)'],
  [/\b(?:causes?|caused|costs?|leads? to|led to|because|came from|due to|results? in|makes?|affects?|improves?|produces?|helps?)\b/i, 'a causal verb'],
  [/\bhalfway\b|\bhalf-way\b|\bhalf marathon split\b/i, 'a halfway claim (the data have 20K and 25K, not 21.1K)'],
  [/\bDNFs?\b|\bdropp?ed out\b|\bdid not finish\b|\bquit\b/i, 'a non-finisher claim'],
  [/\bchas(?:e|ed|ing)\b|\baim(?:ed|ing)? for\b|\btarget(?:ed|ing)?\b|\bgoals?\b/i, 'a goal claim (goals are not recorded)'],
  [/\bhumid/i, 'humidity (withheld)'], [/\btoughest\b|\bhardest\b|\beasiest\b|\bharder\b|\beasier\b/i, 'a course-difficulty ranking'],
];
const strings = new Map();
function scan(value, where, key) {
  if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${where}[${i}]`, key));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      ok(!identityKey.test(k), `${where}.${k}: a record identifier or name field`);
      if (groupKey(k)) { const vs = Array.isArray(v) ? v : [v]; ok(vs.every((x) => finite(x) && x >= MIN_CELL), `${where}.${k}: a published group below ${MIN_CELL} finishes`); }
      scan(v, `${where}.${k}`, k);
    }
    return;
  }
  if (typeof value === 'number') ok(Number.isFinite(value), `${where}: finite number`);
  if (typeof value === 'string') {
    if (key !== 'release_tag') ok(!RELEASE_LABEL.test(value), `${where}: copy cites an internal export label`);
    if (key !== 'method' && !['release_tag', 'runner_manifest_sha256', 'input_as_of', 'runner_manifest_as_of', 'theme', 'slug', 'family', 'weighting', 'form', 'fmt', 'tone', 'mark', 'anchor', 'axis'].includes(key)) {
      for (const [re, what] of BANNED) ok(!re.test(value), `${where}: ${what}: ${value}`);
    }
    const norm = normaliseName(value);
    if (norm && norm.includes(' ')) strings.set(norm, where);
  }
}
for (const [slug, doc] of files) scan(doc, slug, null);

// The words on the pages: titles and takeaways from lib/charts/text, rendered with each chart's values.
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true },
}).outputText, f);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...rest); };
const { CHART_TEXT, chartWords } = require(path.join(root, 'lib/charts/registry.ts'));
const titles = new Set(), descriptions = new Set();
for (const c of scope(catalog)) {
  const text = CHART_TEXT[c.slug];
  ok(text, `${c.slug}: its words are registered in lib/charts/text`);
  const words = chartWords(c, files.get(c.slug));
  ok(words.guard, `${c.slug}: the takeaway's guard no longer holds for this release; rewrite the chart's words (${words.fallback})`);
  ok(words.title.length <= 47, `${c.slug}: the title is ${words.title.length} characters (at most 47, so the page title fits 60)`);
  ok(words.description.length <= 155, `${c.slug}: the description is ${words.description.length} characters (at most 155)`);
  ok((words.headline.match(/\*/g) || []).length === 2, `${c.slug}: the takeaway has exactly one *…* accent`);
  ok(words.plain.length <= 150, `${c.slug}: the takeaway is ${words.plain.length} characters (at most 150, two lines on the card)`);
  ok(!titles.has(words.title) && !descriptions.has(words.description), `${c.slug}: a unique title and description`);
  titles.add(words.title); descriptions.add(words.description);
  for (const [field, value] of [['title', words.title], ['takeaway', words.plain], ['fallback', words.fallback], ['description', words.description]]) {
    for (const [re, what] of BANNED) ok(!re.test(value), `${c.slug} ${field}: ${what}: ${value}`);
    ok(!RELEASE_LABEL.test(value), `${c.slug} ${field}: an internal export label`);
    ok(!/\bsustained slowdown is\b|25% slower|5–20 km pace|doi:/i.test(value), `${c.slug} ${field}: the slowdown definition belongs on /methodology`);
    const norm = normaliseName(value);
    if (norm) strings.set(norm, `${c.slug} ${field}`);
  }
}
console.log(JSON.stringify({ text: 'ok', charts: catalog.length, checks }));
if (opt.textOnly) process.exit(0);

// ---------- 4. Cohort and recounts ----------
const C = loadCohort({ root, dataRoot, strings });
assert.deepEqual(C.nameHits, [], 'A chart string equals a recorded runner name');
assert.equal(C.n, manifest.analysis_n, 'The story cohort (no duplicate-edition screen in this release)');
const H = require('./charts/helpers.cjs')(C);
const recounts = {};
// Every recount module in scripts/charts/ (one per builder module), the cohort and helpers aside.
for (const name of fs.readdirSync(path.join(__dirname, 'charts')).filter((f) => f.endsWith('.cjs') && !['cohort.cjs', 'helpers.cjs'].includes(f)).sort()) {
  const file = path.join(__dirname, 'charts', name);
  for (const [slug, fn] of Object.entries(require(file))) {
    assert.ok(!recounts[slug], `${slug}: recounted twice`);
    recounts[slug] = fn;
  }
}
const missing = scope(catalog).filter((c) => !recounts[c.slug]).map((c) => c.slug);
assert.deepEqual(missing, [], 'Every registered chart has a recount');
if (!only) for (const slug of Object.keys(recounts)) ok(files.has(slug), `${slug}: a recount for a chart the catalog does not hold`);
const timings = [];
for (const c of scope(catalog)) {
  const t = Date.now(), doc = files.get(c.slug);
  const mine = recounts[c.slug](C, doc, H);
  H.compare(doc, mine, c.slug);
  timings.push([c.slug, Date.now() - t]);
  checks++;
}
const slowest = timings.sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(JSON.stringify({ charts: timings.length, checks: checks + H.counted(), cohort: C.n, seconds: Math.round((Date.now() - started) / 100) / 10, slowest }));
