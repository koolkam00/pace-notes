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
const { getStudyFigures } = require('../lib/study-figures.ts');
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
assert.equal(sectionLabel(5), '0–5 km');
assert.equal(sectionLabel(40), '35–40 km');
assert.equal(sectionLabel(42.195), '40–42.195 km');

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

console.log(`Verified ${questions.length} questions, ${charts.length} chart views, all original analysis routes, source files, CSV edge cases, and the ${total.toLocaleString('en-US')}-finish denominator.`);
