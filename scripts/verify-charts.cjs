#!/usr/bin/env node
// Independent reconciliation of the Top 100 charts (public/data/charts, /charts).
// It does not import the Python builders: the eligible finishes are rebuilt from the marathon cohort
// (analysis/marathon-cohort, read through scripts/lib/cohort.cjs by scripts/charts/cohort.cjs) and every chart's takeaway
// values and plotted numbers are recounted by its own function in scripts/charts/<module>.cjs. A registered chart without
// a recount fails. Before the recounts it checks provenance (the adopted release, the exact cohort manifest, the edition
// policy the cohort states, the catalog, the weather evidence, every script hash), the inventory, the group-size
// threshold, identifier fields, release labels in copy, the words every title and takeaway may not use, title and
// description lengths, and that no chart string equals a recorded runner name. A chart whose takeaway's guard does not
// hold is not an error: it must be in the fallback state in every slot (a neutral title, the fallback sentence, a
// drawing with no mark of the reading, no share card, no caption). The cohort holds no names: they are read
// through scripts/charts/names.cjs (the committed runner lookup of the adopted release, or the names file that
// PACE_NOTES_NAMES_FILE points at), and without either the verifier fails; it never passes without checking them.
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
const { loadCohort, verifiedManifest, quantile, quantileSorted, median, normaliseName, MIN_CELL, LENGTHS, AGE_LABELS, GENDER_LABELS } = require('./charts/cohort.cjs');
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
// The marathon cohort the charts must be built from (since November 14, 2026; before it, the runner lookup's manifest):
// the adopted release's, with its checkpoints, identity contract, script list, counts and edition policy checked.
const { pin, manifest: cohort, sha256: cohortSha } = verifiedManifest(root);
const manifest = read(path.join(input, 'manifest.json'));
assert.equal(manifest.schema_version, 1, 'Charts manifest schema');
assert.equal(manifest.release_tag, pin.tag, 'Charts use the adopted release');
// The field keeps its name from the lookup's time; it holds the SHA-256 of analysis/marathon-cohort/manifest.json.
assert.equal(manifest.runner_manifest_sha256, cohortSha, 'Exact marathon cohort binding');
assert.equal(manifest.runner_manifest_as_of, cohort.as_of); assert.equal(manifest.input_as_of, cohort.input_as_of);
// The edition policy and the scripts of the cohort, as the charts state them (the policy's digests and counts were
// checked against the published list, public/data/edition-policy.json, when the cohort manifest was read).
assert.deepEqual(manifest.source_quality, cohort.source_quality, 'The charts state the edition policy of the cohort they were built from');
assert.deepEqual(manifest.source_scripts, cohort.scripts, 'The charts state the scripts that wrote the cohort');
// With --only (development), other charts' catalog rows may have changed since this folder was built; the listed charts'
// rows are still checked file by file below. A full run requires the exact catalog.
const catalogSha = hash(fs.readFileSync(path.join(root, 'lib/charts/catalog.json')));
if (only && manifest.catalog_sha256 !== catalogSha) console.warn('Note: the catalog changed since this folder was built (development run).');
else assert.equal(manifest.catalog_sha256, catalogSha, 'The charts were built from the current catalog');
assert.equal(manifest.weather.release_tag, read(path.join(root, 'analysis/weather-release.json')).tag, 'Weather evidence pin');
assert.equal(manifest.weather.evidence_sha256, hash(fs.readFileSync(path.join(dataRoot, 'weather/evidence.json'))), 'Exact weather evidence binding');
assert.equal(manifest.eligible_records, cohort.eligible_records, 'Eligible source records');
assert.deepEqual(manifest.genders, GENDER_LABELS); assert.deepEqual(manifest.ages, AGE_LABELS);
assert.deepEqual(manifest.duplicate_edition_screen, [], 'No duplicate-edition screen in this release');
const analysisDir = path.join(root, 'analysis');
for (const name of ['build_charts.py', 'charts_common.py', 'build_insights.py', 'insights_data.py', 'insights_stats.py', 'build_fast_start.py']) ok(name in manifest.scripts, `Shared script bound: ${name}`);
const unbound = fs.readdirSync(analysisDir).filter((n) => /^charts_.*\.py$/.test(n) && !(n in manifest.scripts));
assert.deepEqual(unbound, [], 'Every charts_*.py module is bound to the manifest');
// With --only, other themes' modules may have moved on since this folder was built; only the listed charts' modules count.
const ownModules = only ? new Set(catalog.filter((c) => only.has(c.slug)).map((c) => `${c.module}.py`)) : null;
const bound = Object.entries({ ...cohort.scripts, ...manifest.scripts }).filter(([name]) => !ownModules || !/^charts_/.test(name) || name === 'charts_common.py' || ownModules.has(name));
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
// The words every title and takeaway may not use, and the release labels copy may not cite: scripts/lib/words.cjs,
// shared with scripts/verify-half.cjs.
const { BANNED, RELEASE_LABEL } = require('./lib/words.cjs');
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
    if (key !== 'method' && key !== 'refused' && !['release_tag', 'runner_manifest_sha256', 'input_as_of', 'runner_manifest_as_of', 'theme', 'slug', 'family', 'weighting', 'form', 'fmt', 'tone', 'mark', 'anchor', 'axis'].includes(key)) {
      for (const [re, what] of BANNED) ok(!re.test(value), `${where}: ${what}: ${value}`);
    }
    const norm = normaliseName(value);
    if (norm && norm.includes(' ')) strings.set(norm, where);
  }
}
for (const [slug, doc] of files) scan(doc, slug, null);

// Linked charts (the same runner in two or more races) store their values on high-confidence links alone beside their
// values (lead rulings R6 and D38): exactly the charts of the list, each with every value of the chart, or with the
// builder's refusal when a group falls under a floor on high links alone (the floor is not lowered for it).
const { LINKED_CHARTS } = require('./charts/helpers.cjs');
for (const slug of LINKED_CHARTS) ok(catalog.some((c) => c.slug === slug), `${slug}: a linked chart the catalog does not hold`);
const highRefused = [];
for (const [slug, doc] of files) {
  const linked = LINKED_CHARTS.includes(slug);
  ok(('high_links' in doc) === linked, linked ? `${slug}: follows linked records, so it must store its values on high links alone (high_links)` : `${slug}: carries high_links but is not a linked chart`);
  if (!linked) continue;
  const high = doc.high_links;
  if (high.values === null) {
    ok(typeof high.refused === 'string' && high.refused.length > 0 && Object.keys(high).length === 2, `${slug}.high_links: no values, so the builder's refusal and nothing else`);
    highRefused.push({ chart: catalog.find((c) => c.slug === slug).number, slug, refused: high.refused });
  } else {
    assert.deepEqual(Object.keys(high), ['values', 'cohort_n'], `${slug}.high_links: values and cohort_n`);
    assert.deepEqual(Object.keys(high.values).sort(), Object.keys(doc.values).sort(), `${slug}.high_links: every value of the chart, and no other`);
    ok(Number.isSafeInteger(high.cohort_n) && high.cohort_n >= MIN_CELL, `${slug}.high_links: cohort_n`);
  }
}

// The words on the pages: titles and takeaways from lib/charts/text, rendered with each chart's values.
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true },
}).outputText, f);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...rest); };
const { CHART_TEXT, chartWords } = require(path.join(root, 'lib/charts/registry.ts'));
const { readingMarks } = require(path.join(root, 'lib/charts/neutral.ts'));
const { chartPageState, chartCardPath } = require(path.join(root, 'lib/charts/page.ts'));
const { THEME_NAMES } = require(path.join(root, 'lib/charts/types.ts'));
const { typo } = require(path.join(root, 'lib/charts/typo.ts'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ChartCard = require(path.join(root, 'components/charts/ChartCard.tsx')).default;
// The card as the page draws it (components/charts/ChartPage.tsx hands ChartCard the same state), as text and markup.
const drawn = (c, state) => renderToStaticMarkup(React.createElement(ChartCard, { number: c.number, theme: THEME_NAMES[c.theme], title: state.words.title,
  takeaway: state.words.plain, label: state.words.plain, spec: state.plot, units: 'mi', heading: 'h1', foot: null }));
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const titles = new Set(), descriptions = new Set();
// The charts whose takeaway's guard does not hold on these values. They are in the fallback state (AGENTS rule 13): a
// guard is never loosened to keep a headline, and no slot may still state the reading it rejected. Each slot the words
// and the drawing feed is checked here; the card and the caption are checked against the files below.
const fallen = [];
for (const c of scope(catalog)) {
  const text = CHART_TEXT[c.slug];
  ok(text, `${c.slug}: its words are registered in lib/charts/text`);
  const doc = files.get(c.slug);
  const words = chartWords(c, doc);
  // What the page shows (lib/charts/page.ts): the same words, the spec it draws and the card it links.
  const state = chartPageState(c, doc);
  assert.deepEqual(state.words, words, `${c.slug}: the page's words are the chart's words`);
  const html = drawn(c, state);
  ok((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1] !== undefined && textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)[1]).trim() === words.title, `${c.slug}: the page's H1 is the title`);
  if (words.guard) {
    ok((words.headline.match(/\*/g) || []).length === 2, `${c.slug}: the takeaway has exactly one *…* accent`);
    ok(state.plot === doc.plot && state.card === chartCardPath(c.number), `${c.slug}: the page draws the chart's own spec and links its card`);
  } else {
    fallen.push(c);
    // The title: most titles state the reading, so the chart needs a title that names what it shows and no more.
    ok(typeof text.neutral === 'string' && text.neutral.trim().length > 0, `${c.slug}: the takeaway's guard does not hold on these values, so the chart is in the fallback state, and it has no neutral title: add \`neutral\` to its words in lib/charts/text (its fallback sentence: ${words.fallback})`);
    ok(text.neutral !== text.title, `${c.slug}: the neutral title is the title that states the reading`);
    ok(words.title === typo(text.neutral), `${c.slug}: in the fallback state the title is the neutral title`);
    // The takeaway, the chart's accessible name and the search description: the fallback sentence, with no accent.
    ok(words.headline === words.fallback && words.plain === words.fallback && words.description === words.fallback, `${c.slug}: in the fallback state the takeaway and the description are the fallback sentence`);
    ok(!words.fallback.includes('*'), `${c.slug}: a fallback sentence has no accent`);
    // The drawing and its table twin: no signal mark, no accent series, no note, no ring, no signal figure, in the
    // spec the page draws and in the markup that comes out of it; and no card to save.
    const left = readingMarks(state.plot);
    ok(left.length === 0, `${c.slug}: the fallback drawing still marks a reading (${left.join(', ')})`);
    const mark = /tf-signal|ts-signal|is-signal|is-lit|cx-notes|cx-cell-ring|class="cx-big"/.exec(html);
    ok(!mark, `${c.slug}: the fallback drawing's markup still carries a reading's mark (${mark && mark[0]})`);
    ok(state.card === null, `${c.slug}: in the fallback state the page links no share card`);
  }
  if (text.neutral !== undefined) {
    ok(typo(text.neutral).length <= 47, `${c.slug}: the neutral title is ${typo(text.neutral).length} characters (at most 47)`);
    for (const [re, what] of BANNED) ok(!re.test(text.neutral), `${c.slug} neutral title: ${what}: ${text.neutral}`);
    ok(!RELEASE_LABEL.test(text.neutral), `${c.slug} neutral title: an internal export label`);
  }
  ok(words.title.length <= 47, `${c.slug}: the title is ${words.title.length} characters (at most 47, so the page title fits 60)`);
  ok(words.description.length <= 155, `${c.slug}: the description is ${words.description.length} characters (at most 155)`);
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
// The share cards and the captions of the published charts (not of a folder built elsewhere): a chart has its card and
// its caption exactly while its guard holds. scripts/build-chart-cards.cjs --check holds each card to its stamp.
if (!opt.input) {
  const captions = fs.readFileSync(path.join(root, 'docs/CHARTS_INSTAGRAM.md'), 'utf8');
  for (const c of scope(catalog)) {
    const words = chartWords(c, files.get(c.slug));
    const png = fs.existsSync(path.join(root, 'public/charts/cards', `${c.number}.png`));
    ok(words.guard === png, words.guard ? `${c.slug}: its guard holds but public/charts/cards/${c.number}.png is missing (node scripts/build-chart-cards.cjs)`
      : `${c.slug}: the takeaway's guard fails on the published values, so the card is withdrawn; public/charts/cards/${c.number}.png must go (node scripts/build-chart-cards.cjs removes it)`);
    const heading = new RegExp(`^## ${c.number}\\. `, 'm');
    if (words.guard) ok(captions.includes(`\n## ${c.number}. ${words.title}\n\n${words.plain}\n\nChart ${c.number} of ${catalog.length} from Pace Notes.`), `${c.slug}: its caption in docs/CHARTS_INSTAGRAM.md is not its title and takeaway (node scripts/build-chart-cards.cjs --captions)`);
    else ok(!heading.test(captions), `${c.slug}: its card is withdrawn, but docs/CHARTS_INSTAGRAM.md still carries a caption for chart ${c.number} (node scripts/build-chart-cards.cjs --captions)`);
  }
}
// Each linked chart's own guard, read on its values on high links alone. A guard that holds on every link and fails
// on high links alone is reported here and changes nothing: the takeaway is published on the links the release keys
// (high and medium) and its guard is not altered; the two readings sit side by side on /methodology.
const highGuards = [];
for (const c of scope(catalog)) {
  const doc = files.get(c.slug);
  if (!LINKED_CHARTS.includes(c.slug) || doc.high_links.values === null) continue;
  const all = CHART_TEXT[c.slug].takeaway(doc.values), high = CHART_TEXT[c.slug].takeaway(doc.high_links.values);
  ok(typeof high.guard === 'boolean' && typeof high.headline === 'string', `${c.slug}: its takeaway reads on the high-links values`);
  highGuards.push({ chart: c.number, slug: c.slug, guard: all.guard, guard_high_links: high.guard });
}
const highOnlyFails = highGuards.filter((g) => g.guard && !g.guard_high_links).map((g) => g.chart);
console.log(JSON.stringify({ text: 'ok', charts: scope(catalog).length, fallback: fallen.map((c) => c.number),
  high_links: { charts: highGuards.length + highRefused.length, refused: highRefused.map((h) => h.chart), guard_fails_on_high_links_alone: highOnlyFails }, checks }));
if (opt.textOnly) process.exit(0);

// ---------- 4. Cohort and recounts ----------
const C = loadCohort({ root, dataRoot, strings });
assert.equal(C.manifestSha, cohortSha, 'The cohort did not change while it was read');
assert.ok(C.names.names > 0, 'The name guard read no recorded names');
assert.deepEqual(C.nameHits, [], 'A chart string equals a recorded runner name');
assert.equal(C.n, manifest.analysis_n, 'The story cohort (no duplicate-edition screen in this release)');
// The cohort counts the manifest states (/methodology#top-charts prints them), recounted from the cohort.
{
  const withFinishes = C.editions.map((_, e) => e).filter((e) => C.edN[e] > 0);
  const sum = (flags) => { let total = 0; for (let i = 0; i < C.n; i++) total += flags[i]; return total; };
  assert.deepEqual(manifest.cohort, {
    eligible: C.n, after_duplicate_screen: C.n, editions: withFinishes.length, cities: new Set(withFinishes.map((e) => C.ed.city[e])).size,
    shape: sum(C.shapeKeep), shape_editions_left_out: C.shapeFlagged.length, exact_age: sum(C.exactAgeOk), exact_age_editions: C.granular.size,
  }, 'The cohort counts in the charts manifest');
  checks++;
}
const H = require('./charts/helpers.cjs')(C);
const recounts = {};
// Every recount module in scripts/charts/ (one per builder module); the cohort reader, the helpers and the name
// guard's reader aside.
for (const name of fs.readdirSync(path.join(__dirname, 'charts')).filter((f) => f.endsWith('.cjs') && !['cohort.cjs', 'helpers.cjs', 'names.cjs'].includes(f)).sort()) {
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
  if (LINKED_CHARTS.includes(c.slug) && doc.high_links.values !== null) {
    // The same recount on the cohort whose linked records are keyed by high links only.
    assert.ok(C.highLinks, 'The charts store values on high links alone, but the cohort states no link class');
    const high = recounts[c.slug](C.highLinks, doc, H);
    H.compare({ values: doc.high_links.values, cohort_n: doc.high_links.cohort_n, plot: {} }, high, `${c.slug} (high links alone)`);
  }
  timings.push([c.slug, Date.now() - t]);
  checks++;
}
const slowest = timings.sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(JSON.stringify({ charts: timings.length, fallback: fallen.map((c) => c.number),
  high_links: { charts: highGuards.length + highRefused.length, refused: highRefused, guard_fails_on_high_links_alone: highOnlyFails },
  checks: checks + H.counted(), cohort: C.n, names: { source: C.names.source, where: C.names.where, read: C.names.names }, seconds: Math.round((Date.now() - started) / 100) / 10, slowest }));
