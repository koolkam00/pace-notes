const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const crypto = require('node:crypto');
const canonicalJson = value => JSON.stringify((function sort(item) {
  if (Array.isArray(item)) return item.map(sort);
  if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]));
  return item;
})(value));

process.chdir(path.resolve(__dirname, '..'));
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename,
);

const { parseCsv, finite, formatNumber } = require('../lib/csv.ts');
const { getQuestions, getStudyAnswer, getExtraAnswer, getWallTimingAnswer, getCoursePacingChart, getStudyEvidence, table } = require('../lib/research-data.ts');
const { getStudyFigures, getSlowdownFigures } = require('../lib/study-figures.ts');
const { splitAnswer, NO_ANSWER, NOT_AVAILABLE, noAnswer, forPage } = require('../lib/research-display.ts');
const { EXTRA_TITLES, QUESTIONS, THEMES } = require('../lib/question-catalog.ts');
const { PACKS } = require('../lib/packs.ts');
const { getExtensions } = require('../lib/extension-data.ts');
const { getCourseNames, getIndividualCourseAnswer, slugifyCity } = require('../lib/course-data.ts');
const { resolveSelection, filterOptions } = require('../lib/chart-selection.ts');
const { sectionLabel, MARATHON_SECTION_ENDS } = require('../lib/section-labels.ts');

assert.deepEqual(parseCsv('name,n,note\r\n"New York, NY",,"A ""quote""\nand a line"\r\nBoston,0,NaN\r\nnone,1,none'), [
  { name: 'New York, NY', n: null, note: 'A "quote"\nand a line' },
  { name: 'Boston', n: 0, note: null },
  { name: 'none', n: 1, note: 'none' },
]);
for (const value of [null, undefined, '', ' ', 'NaN']) assert.equal(finite(value), null);
assert.equal(finite(0), 0);
assert.equal(formatNumber(-1.5, '% change'), '-1.5%');
// Sections are named by their mats in both unit modes (the redesign spec, section 3.10).
assert.equal(sectionLabel(5), '0–5K');
assert.equal(sectionLabel(40), '35–40K');
assert.equal(sectionLabel(42.195), '40K–finish');

const questions = getQuestions();
const extensions = getExtensions();
const extras = [...Object.keys(EXTRA_TITLES).map(getExtraAnswer), getWallTimingAnswer(), ...extensions.map(pack => getExtraAnswer(pack.id))];
const figures = getStudyFigures();
const ids = QUESTIONS.flatMap(question => [question.id, ...(question.aliases || [])]);
assert.equal(new Set(ids).size, ids.length, 'Question anchors must be unique');
for (const pack of PACKS) assert.ok(ids.includes(pack.id) || EXTRA_TITLES[pack.id], `${pack.id}: missing from the question catalog`);
for (const question of questions) assert.ok(THEMES.some(theme => theme.id === question.theme), `${question.id}: inaccessible research theme`);

const registry = JSON.parse(fs.readFileSync('analysis/pack_registry.json', 'utf8'));
const scriptHash = file => {
  const bytes = fs.readFileSync(`analysis/${file}`);
  assert.ok(bytes.length, `Cannot verify empty source: ${file}`);
  return crypto.createHash('sha256').update(bytes).digest('hex');
};
assert.deepEqual(extensions.map(extension => extension.id).sort(), Object.keys(registry).sort(), 'All owned analyses must be present');
assert.equal(new Set(extensions.map(extension => extension.questionId)).size, 33);
for (const extension of extensions) {
  assert.ok(QUESTIONS.some(question => question.id === extension.questionId));
  const question = questions.find(question => question.id === extension.questionId);
  assert.equal(question.dataset.exportId, extension.exportId);
  assert.equal(question.answer, extension.answer.answer, 'Question must use its verified extension result');
  const metadata = JSON.parse(fs.readFileSync(`public/data/packs/${extension.id}/pack_meta.json`, 'utf8'));
  for (const key of ['input_asset_sha256', 'input_manifest_sha256', 'analysis_script_sha256']) assert.match(metadata[key], /^[a-f0-9]{64}$/);
  if (['private-20260911-1107', 'private-20260912-0934', 'htw-db-2026-10-16-1652'].includes(metadata.input_export_id)) {
    assert.ok([1, 2].includes(metadata.analysis_version));
    assert.equal(metadata.analysis_script_sha256, scriptHash(metadata.analysis_version === 1 ? 'build_pacing.py' : 'build_extended.py'), `${extension.id}: calculation code mismatch`);
    if (metadata.analysis_version === 2) assert.equal(metadata.supporting_script_sha256, scriptHash('build_pacing.py'), `${extension.id}: eligibility parser mismatch`);
    if (metadata.narrative_script_sha256) assert.equal(metadata.narrative_script_sha256, scriptHash('write_findings.py'));
  }
  assert.ok(Number.isFinite(Date.parse(metadata.live_json_as_of)));
  const c = metadata.cohort;
  assert.equal(c.raw, c.duplicates_removed + c.missing_or_unparsed + c.non_increasing + c.outside_quality_bounds + (c.source_quality_excluded || 0) + c.eligible);
  if (['private-20260911-1107', 'private-20260912-0934', 'htw-db-2026-10-16-1652'].includes(metadata.input_export_id)) assert.ok(metadata.source_quality?.reviewed_edition_policy, 'This source requires the reviewed edition policy');
  if (metadata.source_quality) {
    const policy = metadata.source_quality;
    const hash = crypto.createHash('sha256').update(fs.readFileSync('analysis/source_quality.py')).digest('hex');
    assert.equal(metadata.source_quality_script_sha256, hash);
    assert.equal(policy.script_sha256, hash);
    assert.match(policy.policy_sha256, /^[a-f0-9]{64}$/);
    const policyDefinition = { version: policy.version, release_tag: policy.release_tag, reviewed_edition_policy: policy.reviewed_edition_policy,
      editions: policy.editions.map(({ city, year, category, reason }) => ({ city, year, category, reason })) };
    assert.equal(policy.policy_sha256, crypto.createHash('sha256').update(canonicalJson(policyDefinition)).digest('hex'), 'Edition reasons must match the recorded policy hash');
    assert.equal(policy.release_tag.replace('private-export-', 'private-'), metadata.input_export_id);
    assert.equal(new Set(policy.editions.map(row => row.city + '/' + row.year)).size, policy.editions.length);
    for (const row of policy.editions) {
      assert.ok(row.city && Number.isInteger(row.year) && row.category && row.reason);
      assert.ok([row.raw_records, row.deduplicated_records, row.timing_eligible_excluded].every(n => Number.isInteger(n) && n >= 0));
      assert.ok(row.raw_records >= row.deduplicated_records && row.deduplicated_records >= row.timing_eligible_excluded);
    }
    assert.equal(policy.editions.reduce((sum, row) => sum + row.timing_eligible_excluded, 0), c.source_quality_excluded);
    assert.equal(c.timing_eligible, c.eligible + c.source_quality_excluded);
  }
  assert.ok(metadata.n <= c.eligible);
  if (metadata.narrative_script_sha256) assert.match(metadata.narrative_script_sha256, /^[a-f0-9]{64}$/);
  for (const chart of extension.answer.charts) for (const row of chart.rows) {
    if (typeof row.p10 === 'number' && typeof row.median === 'number' && typeof row.p90 === 'number') assert.ok(row.p10 <= row.median && row.median <= row.p90);
    if (chart.unit === '%') for (const series of chart.series) if (row[series.key] !== null) assert.ok(row[series.key] >= 0 && row[series.key] <= 100, `${extension.id}: percentage outside 0–100`);
    if (chart.unit === 'correlation') for (const series of chart.series) assert.ok(Math.abs(row[series.key]) <= 1);
  }
  if (metadata.analysis_version >= 2) {
    assert.ok(Number.isInteger(metadata.linkage_audit.ambiguous_cross_export_matches) && metadata.linkage_audit.ambiguous_cross_export_matches >= 0);
    assert.ok(metadata.linkage_audit.recent_benchmark_finishes <= metadata.linkage_audit.linked_eligible_finishes);
    assert.match(metadata.supporting_script_sha256, /^[a-f0-9]{64}$/);
    assert.ok(metadata.observation_unit && metadata.evidence_scope);
  }
}
const newShapes = table('ext_pacing_shapes', 'patterns.csv');
assert.ok(Math.abs(newShapes.reduce((sum, row) => sum + row.value, 0) - 100) < 1e-8);
assert.equal(newShapes.reduce((sum, row) => sum + row.count, 0), newShapes[0].n_value);
for (const row of newShapes) assert.ok(Math.abs(row.value - 100 * row.count / row.n_value) < 1e-8);
for (const row of table('ext_checkpoint_outcomes', 'goal_rates.csv')) {
  assert.ok(row.hits >= 0 && row.hits <= row.n_value);
  assert.ok(Math.abs(row.value - 100 * row.hits / row.n_value) < 1e-8);
}
const newProfiles = table('ext_course_pacing_profiles', 'course_profiles.csv');
assert.deepEqual(questions.find(question => question.id === 's3_course_breaks').charts[0].sectionEnds, MARATHON_SECTION_ENDS);
assert.ok(questions.find(question => question.id === 'r08_early_blowup_signal').charts.every(chart => !chart.sectionEnds), 'Checkpoint forecasts are not interval pace averages');
for (const city of new Set(newProfiles.map(row => row.city))) {
  const rows = newProfiles.filter(row => row.city === city);
  assert.deepEqual(rows.map(row => row.label), [5,10,15,20,25,30,35,40,42.195]);
  assert.equal(new Set(rows.map(row => row.n_value)).size, 1, 'Course checkpoints need the same eligible cohort');
  assert.equal(getIndividualCourseAnswer(city).dataset.n, rows[0].n_value);
}
assert.equal(new Set(getCourseNames().map(slugifyCity)).size, getCourseNames().length, 'Course URLs must be unique');
assert.equal(formatNumber(2026, 'year'), '2026');
for (const chart of questions.find(q => q.id === 'r26_pacing_over_20y').charts) {
  for (const city of new Set(chart.rows.map(row => row.city))) {
    const rows = chart.rows.filter(row => row.city === city);
    for (let i = 1; i < rows.length; i++) assert.equal(rows[i].label - rows[i-1].label, 1, 'Missing years must break the chart line');
  }
}

// Every course view must serve the current individually normalized median profile.
// A median curve need not integrate to zero; normalization is checked per runner
// by the raw-data builder before aggregation.
const profiles = getCoursePacingChart();
assert.deepEqual(profiles.rows, newProfiles);
assert.ok(profiles.rows.length, 'Complete course profiles must be available');
for (const city of new Set(profiles.rows.map(row => row.city))) {
  assert.deepEqual(profiles.rows.filter(row => row.city === city).map(row => row.label), MARATHON_SECTION_ENDS);
}

const improved = JSON.parse(fs.readFileSync('public/data/packs/ext_performance_profiles/summary.json', 'utf8')).statistics;
const patternRates = table('ext_split_pattern_success', 'success_rates.csv');
assert.equal(patternRates.reduce((sum,row) => sum + row.n_value, 0), improved.denominator);
assert.equal(patternRates.reduce((sum,row) => sum + row.successes, 0), improved.improved);
for (const row of patternRates) assert.ok(Math.abs(row.value - 100 * row.successes / row.n_value)<1e-8);
const patternMix = table('ext_successful_race_shapes', 'pattern_mix.csv');
assert.ok(patternMix.reduce((sum,row)=>sum+row.value,0)<=100+1e-8);
for (const row of patternMix) assert.ok(Math.abs(row.value-100*row.successes/improved.improved)<1e-8);
const gains = table('ext_earlier_best_section_gains', 'gains.csv');
const gainSummary = JSON.parse(fs.readFileSync('public/data/packs/ext_earlier_best_section_gains/summary.json', 'utf8')).statistics;
assert.ok(Math.abs(gains.reduce((sum,row)=>sum+row.value,0)-gainSummary.mean_total_gain_min)<1e-7);
assert.ok(gains.every(row=>row.n_value===gainSummary.pair_count));
const forecastSummary = JSON.parse(fs.readFileSync('public/data/packs/ext_checkpoint_forecast_validation/summary.json', 'utf8')).statistics;
assert.equal(forecastSummary.training_before_year,forecastSummary.test_start_year);
for (const row of table('ext_checkpoint_forecast_validation','errors.csv')) {
  for (const key of ['even_pace','elapsed','trend']) assert.equal(row[`n_${key}`],forecastSummary.test_n);
}
for (const row of table('ext_checkpoint_forecast_validation','calibration.csv')) {
  assert.ok(row.coverage>=0 && row.coverage<=100 && row.width>=0 && row.error90>=0);
  assert.ok(row.fallback_count>=0 && row.fallback_count<=forecastSummary.test_n);
}
const transitions = table('ext_pacing_habit_persistence','transitions.csv');
for (const previous of new Set(transitions.map(row=>row.previous))) {
  assert.ok(Math.abs(transitions.filter(row=>row.previous===previous).reduce((sum,row)=>sum+row.value,0)-100)<1e-8);
}
const coursePairs=table('ext_paired_course_comparisons','course_pairs.csv');
for (const row of coursePairs) {
  const reverse=coursePairs.find(other=>other.origin===row.label && other.label===row.origin);
  assert.ok(reverse && Math.abs(reverse.value+row.value)<1e-8 && reverse.n_value===row.n_value);
}
for (const row of table('ext_opening_tradeoffs','matched_openings.csv')) assert.ok(row.low<=row.high && row.editions>=2);
for (const id of ['r16_groups_hold_or_fall', 'r33_start_congestion']) {
  const question = questions.find(question => question.id === id);
  assert.equal(question.charts.length, 0, `${id}: uncomputed research must not have fabricated chart values`);
  assert.ok(question.nextAnalysis?.measure && question.nextAnalysis?.compare && question.nextAnalysis?.needs, `${id}: missing research specification`);
}

const study = getStudyEvidence();
assert.ok(study, 'A current supporting study must be published');
const total = study.n;
const cities = study.overview.charts[0].rows;
assert.equal(cities.reduce((sum, row) => sum + row.n_value, 0), total);
const overallRate = cities.reduce((sum, row) => sum + row.n_value * row.value, 0) / total;
assert.ok(Math.abs(overallRate - study.rate) < 1e-8);
assert.ok(getStudyAnswer().answer.includes(study.rate.toFixed(1) + '%'));
assert.equal(getStudyAnswer().dataset.exportId, JSON.parse(fs.readFileSync('analysis/release.json')).tag);
assert.equal(figures.length, study.figures.length);
assert.deepEqual(figures.map(f=>f.id), ['sensitivity','age','history']);
assert.ok(Math.abs(study.severity.charts[0].rows.reduce((sum, row) => sum + row.value, 0)-100)<1e-8);
assert.deepEqual(table('rn1_wall_severity', 'severity_band_counts.csv'), [], 'Legacy tables cannot re-enter the current site');
for (const figure of figures) assert.equal(figure.releaseTag, study.release_tag);
const charts = [...questions, ...extras].flatMap(question => question.charts).concat(figures.flatMap(figure => figure.charts));
for (const chart of charts) {
  assert.ok(chart.rows.length, `${chart.title}: empty chart`);
  for (const row of chart.rows) {
    assert.ok(row.label !== undefined && row.label !== null, `${chart.title}: missing label`);
    if (chart.xNumeric) assert.ok(Number.isFinite(row.label), `${chart.title}: invalid numeric distance/time`);
    for (const series of chart.series) {
      if (row[series.key] != null) assert.ok(Number.isFinite(row[series.key]), `${chart.title}: non-finite value`);
      const count = row[`n_${series.key}`];
      if (count != null) assert.ok(Number.isInteger(count) && count >= 0, `${chart.title}: invalid sample size`);
    }
  }
  const selections = resolveSelection(chart);
  assert.ok(chart.rows.some(row => Object.entries(selections).every(([key, value]) => String(row[key]) === value)), `${chart.title}: empty initial selection`);
  if (chart.filters?.length) for (const first of filterOptions(chart,0,selections)) {
    const changed = resolveSelection(chart,{...selections,[chart.filters[0].key]:first});
    assert.ok(chart.rows.some(row=>Object.entries(changed).every(([key,value])=>String(row[key])===value)), `${chart.title}: changing the first filter must retain valid downstream choices`);
  }
}
for (const question of [...questions, ...extras]) for (const source of question.sources) {
  const href = source.href.replace(process.env.NEXT_PUBLIC_BASE_PATH || /^$/, '');
  if (href.startsWith('/')) assert.ok(fs.existsSync(`public${href}`), `${source.href}: missing source file`);
}

// Result pages show the answer and its charts; definitions, methods, sources and coverage live on /methodology.
{
  const Module = require('node:module');
  require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return resolveFilename.call(this, request.startsWith('@/') ? path.join(process.cwd(), request.slice(2)) : request, ...args);
  };
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const UnitsProvider = require('../components/UnitsProvider.tsx').default;
  const ResearchQuestion = require('../components/ResearchQuestion.tsx').default;
  const StudyFigure = require('../components/StudyFigure.tsx').default;
  const render = (component, props) => renderToStaticMarkup(React.createElement(UnitsProvider, null, React.createElement(component, props)));
  const methodCopy = /How we measured it|Full methodology|Methodology &amp; sources|Study methodology|Next analysis|Data needed:|Marathons, years and recorded data|Chart samples may be smaller|Points average the preceding section|lines do not locate pace changes|has not yet been documented/;
  for (const question of [getStudyAnswer(), getWallTimingAnswer(), ...questions, ...Object.keys(EXTRA_TITLES).map(getExtraAnswer)]) {
    const html = render(ResearchQuestion, { question: forPage(question), standalone: true });
    assert.doesNotMatch(html, methodCopy, `${question.id}: method copy belongs on /methodology`);
    assert.ok(!html.includes('/about#data-coverage') && !html.includes('pack_meta.json') && !html.includes('/data/study/evidence.json') && !html.includes('doi.org') && !html.includes('journals.plos.org'), `${question.id}: no source or download links on a result page`);
    if (question.dataset) assert.ok(!html.includes(`${new Intl.NumberFormat('en-US').format(question.dataset.n)} ${question.dataset.unit || 'eligible finishes'}`), `${question.id}: no standalone cohort size`);
    assert.equal((html.match(/<figure class="study-figure"/g) || []).length, question.charts.length, `${question.id}: every chart still renders`);
  }
  for (const figure of figures) {
    const html = render(StudyFigure, { figure });
    assert.doesNotMatch(html, methodCopy, `${figure.id}: method copy belongs on /methodology`);
    assert.ok(!html.includes('/data/study/evidence.json'), `${figure.id}: no download link on the figure`);
  }
  // Insights only (second pass, October 16, 2026): a result page shows the findings of its stored answer. Definitions,
  // sample notes and limits go to /methodology#question-methods (MethodsAnalyses AnswerNotes); the stored data is unchanged.
  const caveat = /\bsupplied (?:course|route|profile|terrain)|route proxy|exploratory alignment|under this definition|of eligible finishes|eligible editions|sample requirements|cannot establish|cannot tell us|does not (?:isolate|prove|establish)|not otherwise matched|not proof|not a (?:course ranking|measured temperature penalty|personal equivalent-time forecast|recommendation)|meet the sustained slowdown definition|describes average positive slowing|are not separated|select different runners|can affect this comparison/;
  for (const question of [getStudyAnswer(), getWallTimingAnswer(), ...questions, ...extras]) {
    const { shown, moved } = splitAnswer(question);
    assert.ok(shown.trim(), `${question.id}: a result page always shows an answer`);
    assert.doesNotMatch(shown, caveat, `${question.id}: the page answer still carries method or limit copy: ${shown}`);
    if (!question.available) assert.ok(shown === noAnswer(question.id) && moved.length, `${question.id}: an unanswered question shows the empty state and keeps its reason for /methodology`);
    const html = render(ResearchQuestion, { question: forPage(question), standalone: true });
    const shownMiles = require('../lib/units.ts').unitText(shown, 'mi').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    assert.ok(html.includes(shownMiles), `${question.id}: the page renders the findings answer`);
  }
  // Questions that ask whether something is available get a plain "Not available yet."; the others say they have no answer yet.
  assert.deepEqual(extras.filter(q => !q.available).map(q => [q.id, splitAnswer(q).shown]).sort(), [['p3_race_week_weather', NOT_AVAILABLE], ['p4_even_effort_gap', NOT_AVAILABLE]]);
  assert.deepEqual(questions.filter(q => !q.available).map(q => [q.id, splitAnswer(q).shown]).sort(), [['r16_groups_hold_or_fall', NO_ANSWER], ['r33_start_congestion', NO_ANSWER]]);
  // Wording that defines a term or says how a mean was balanced stays with the question's method on /methodology.
  const shownOf = id => splitAnswer([...questions, ...extras].find(q => q.id === id)).shown;
  assert.match(shownOf('r09_bad_patch_recoverable'), /after a first bad patch at 20–25 km/); assert.doesNotMatch(shownOf('r09_bad_patch_recoverable'), /qualifying patch/);
  assert.doesNotMatch(shownOf('r12_fastest_by_ability'), /equally weighting/); assert.match(shownOf('r12_fastest_by_ability'), /\d minutes (?:slower|faster)\.$/, 'The pair answer ends with the difference (Chicago slower under 0934, faster under 1652)');
  assert.doesNotMatch(shownOf('s3_course_breaks'), /relative to their own average/);
  for (const id of ['r09_bad_patch_recoverable', 'r12_fastest_by_ability', 's3_course_breaks']) assert.ok([...questions, ...extras].find(q => q.id === id).method.some(line => /patch is the first section|average those two means equally|relative to each runner’s full-marathon average/.test(line)), `${id}: the dropped wording is in its method on /methodology`);
  // The page data holds only what ResearchQuestion renders: no stored method, detail, source or sample fields, no chart notes.
  for (const question of [getStudyAnswer(), getWallTimingAnswer(), ...questions, ...extras]) {
    const page = forPage(question);
    assert.deepEqual(Object.keys(page).sort(), ['aliases', 'answer', 'available', 'charts', 'forPage', 'id', 'number', 'related', 'title'], `${question.id}: page data fields`);
    assert.ok(page.charts.every(spec => !('note' in spec)) && page.charts.length === question.charts.length, `${question.id}: every chart, without its note`);
    page.charts.forEach((spec, i) => assert.deepEqual(spec.rows, question.charts[i].rows, `${question.id}: chart rows unchanged`));
  }
  // Chart titles say what the chart shows, not the detection rule.
  assert.deepEqual([forPage(getWallTimingAnswer()).charts[0].title, forPage(getWallTimingAnswer()).charts[0].series[0].label], ['Where sustained slowdowns began', 'Where sustained slowdowns began']);
  for (const question of [getStudyAnswer(), getWallTimingAnswer(), ...questions, ...extras]) for (const spec of forPage(question).charts) assert.doesNotMatch(JSON.stringify([spec.title, spec.xLabel, spec.series, spec.filters ?? []]), /supplied|qualifying section/i, `${question.id}: chart wording`);
  // The page answer is prepared on the server: the client component never imports the display rules.
  assert.doesNotMatch(fs.readFileSync('components/ResearchQuestion.tsx', 'utf8'), /import \{[^}]*\} from '@\/lib\/research-display'/, 'ResearchQuestion takes a forPage() answer and imports only its type');
  // Answers read from chart rows match those rows.
  const courses = getStudyAnswer().charts[0].rows;
  const low = courses.reduce((a, b) => (b.value < a.value ? b : a)), high = courses.reduce((a, b) => (b.value > a.value ? b : a));
  assert.equal(splitAnswer(getStudyAnswer()).shown, `By course, the share ranged from ${low.value.toFixed(1)}% in ${low.label} to ${high.value.toFixed(1)}% in ${high.label}.`);
  const onset = getWallTimingAnswer().charts[0].rows, top = onset.reduce((a, b) => (b.value > a.value ? b : a));
  assert.ok(splitAnswer(getWallTimingAnswer()).shown.startsWith(`The most common start was the ${top.label}–${Number(top.label) + 5} km section, with ${top.value.toFixed(1)}% of sustained slowdowns.`));
  // The research hub shows the finding figures; the definition-sensitivity check is on /methodology. /slowdown (rebuilt
  // under the redesign, section 7.7) draws its own three findings from the same study: checked below.
  const shownFigures = getSlowdownFigures();
  assert.deepEqual(shownFigures.map(f => f.id), ['age', 'history']);
  for (const figure of shownFigures) {
    assert.match(figure.answer, /\d+(?:\.\d)?%/, `${figure.id}: the figure states its finding`);
    assert.doesNotMatch(figure.answer, caveat, `${figure.id}: no method copy in the figure answer`);
  }
}

// /slowdown: where sustained slowdowns began and the earlier-best columns, each from the current study; the term links to its definition once; no method copy, source links or Recharts.
{
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const UnitsProvider = require('../components/UnitsProvider.tsx').default;
  const Slowdown = require('../app/slowdown/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(UnitsProvider, null, React.createElement(Slowdown)));
  const study = require('../lib/research-data.ts').getStudyEvidence();
  const rows = study.timing.charts[0].rows;
  const total = rows.reduce((s, r) => s + r.episodes, 0), late = rows.filter(r => r.label >= 30).reduce((s, r) => s + r.episodes, 0);
  // "Most … began at 30K or later" holds only while more than half of them did.
  assert.ok(late / total > 0.5, '/slowdown: most sustained slowdowns began at 30K or later');
  assert.match(html, /<h1[^>]*>Most <a class="term-link" href="\/methodology#sustained-slowdown">sustained slowdowns<\/a> began at <em>30K or later<\/em>\.<\/h1>/);
  assert.ok(html.includes(`>${Math.round(100 * late / total)}<`), '/slowdown: the reading is the share that began at 30K or later');
  for (const id of ['answer', 'history']) assert.match(html, new RegExp(`<section[^>]*id="${id}"`), `/slowdown: the ${id} beat`);
  // The spread across courses is course comparison's finding: /slowdown does not repeat it.
  assert.doesNotMatch(html, /<section[^>]*id="courses"/, '/slowdown: no course beat');
  assert.equal((html.match(/href="\/methodology#sustained-slowdown"/g) || []).length, 1, '/slowdown links the term to its definition once');
  const history = study.figures.find(f => f.id === 'history').charts[0].rows.filter(r => r.n_value >= 100);
  for (const r of history) assert.ok(html.includes(`${Math.round(r.value)}%`), `/slowdown: the ${r.label} column`);
  assert.doesNotMatch(html, /doi\.org|journals\.plos\.org|evidence\.json|recharts|at least 25%/i, '/slowdown: no definition, citation, source link or Recharts');
}

console.log(`Verified ${questions.length} questions, ${charts.length} chart views, all original analysis routes, source files, CSV edge cases, and the ${total.toLocaleString('en-US')}-finish denominator.`);
