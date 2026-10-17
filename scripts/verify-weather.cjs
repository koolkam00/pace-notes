const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};
const root = path.join(__dirname, '..');
const { getWeatherEvidence, getWeatherAnalyses } = require('../lib/weather-data.ts');
const { WEATHER_QUESTIONS } = require('../lib/weather-catalog.ts');
const { weatherValue, weatherLabel, weatherFinding } = require('../lib/weather-display.ts');
const { sourceReleaseTag, sourceReleaseHref, sourceLabel } = require('../lib/data-source.ts');
const evidence = getWeatherEvidence();
const canonical = JSON.stringify(evidence);
const sum = values => values.reduce((a, b) => a + b, 0);
const close = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const mainRelease = readJson('analysis/release.json').tag;
const weatherRelease = readJson('analysis/weather-release.json').tag;
assert.equal(weatherRelease, mainRelease, 'Every published weather analysis must use the same release as the main study');
const guideMeta = readJson('public/data/packs/ext_personalized_guide/pack_meta.json');
const guideSummary = readJson('public/data/packs/ext_personalized_guide/summary.json');
function checkCohort(cohort) {
  const exclusions = ['duplicates_removed', 'missing_or_unparsed', 'non_increasing', 'outside_quality_bounds'];
  const sourceExcluded = cohort.source_quality_excluded ?? 0;
  for (const value of [...exclusions.map(key => cohort[key]), sourceExcluded, cohort.eligible, cohort.raw]) assert.ok(Number.isInteger(value) && value >= 0);
  assert.equal(sum(exclusions.map(key => cohort[key])) + sourceExcluded + cohort.eligible, cohort.raw, 'Timing and reviewed source exclusions must reconcile to raw rows');
  if ('timing_eligible' in cohort) assert.equal(cohort.timing_eligible, sourceExcluded + cohort.eligible);
}
function checkSourceQuality(report, cohort, release, scriptHash) {
  if (!report) {
    assert.ok(!('source_quality_excluded' in cohort), 'New source-quality counts require the matching edition audit');
    return;
  }
  assert.equal(report.release_tag, release);
  assert.equal(report.script_sha256, digest('analysis/source_quality.py'));
  assert.equal(scriptHash, report.script_sha256);
  assert.match(report.policy_sha256, /^[0-9a-f]{64}$/);
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
  const policy = { version: report.version, release_tag: report.release_tag, reviewed_edition_policy: report.reviewed_edition_policy,
    editions: report.editions.map(({ city, year, category, reason }) => ({ city, year, category, reason })) };
  // source_quality.py hashes json.dumps(..., ensure_ascii=False): UTF-8 text, not \u escapes (as verify-research and
  // verify-public-explorer do). The 1652 reasons are the first with non-ASCII characters (’ and –).
  const serialized = JSON.stringify(sorted(policy));
  assert.equal(crypto.createHash('sha256').update(serialized).digest('hex'), report.policy_sha256, 'Edition audit rules must match their frozen policy checksum');
  for (const row of report.editions) {
    const sizes = [row.raw_records, row.deduplicated_records, row.timing_eligible_excluded];
    assert.ok(sizes.every(value => Number.isInteger(value) && value >= 0));
    assert.ok(sizes[0] >= sizes[1] && sizes[1] >= sizes[2]);
  }
  assert.equal(sum(report.editions.map(row => row.timing_eligible_excluded)), cohort.source_quality_excluded);
}

// Publication requires a reproducible calculation and an explicit source vintage.
assert.equal(evidence.schema_version, 1);
assert.equal(evidence.input.release_tag, weatherRelease, 'Weather evidence and its explicit source pin must match');
const readFileSync = fs.readFileSync;
try {
  fs.readFileSync = () => JSON.stringify({ ...evidence, input: { ...evidence.input, release_tag: 'private-export-20260907-1318' } });
  assert.throws(() => getWeatherEvidence(), /must match the current study release/, 'The page reader must reject stale weather payloads');
} finally { fs.readFileSync = readFileSync; }
for (const tag of [weatherRelease, mainRelease]) assert.match(tag, /^(?:private-export-\d{8}-\d{4}|htw-db-\d{4}-\d{2}-\d{2}-\d{4})$/);
assert.equal(evidence.calculation.script_sha256, digest('analysis/build_weather.py'), 'Weather evidence must be regenerated after changing its calculation');
assert.equal(evidence.calculation.pacing_script_sha256, digest('analysis/build_pacing.py'), 'The exact eligibility parser must match the recorded provenance');
for (const key of ['asset_sha256', 'manifest_sha256', 'race_conditions_sha256']) assert.match(evidence.input[key], /^[0-9a-f]{64}$/);
assert.ok(Number.isFinite(Date.parse(evidence.input.as_of)));
assert.ok(Date.parse(evidence.as_of) >= Date.parse(evidence.input.as_of));
assert.equal(sourceReleaseTag(guideMeta.input_export_id), mainRelease, 'The essential ten and their pin must identify the same imported release');
assert.equal(sourceReleaseTag(guideSummary.export_id), mainRelease);
assert.equal(guideSummary.n, guideMeta.cohort.eligible);
checkCohort(guideMeta.cohort);
checkSourceQuality(guideMeta.source_quality, guideMeta.cohort, mainRelease, guideMeta.source_quality_script_sha256);
for (const id of Object.keys(readJson('analysis/pack_registry.json'))) {
  const metadata = readJson(`public/data/packs/${id}/pack_meta.json`);
  assert.equal(sourceReleaseTag(metadata.input_export_id), mainRelease, `${id}: an incomplete refresh would mix release vintages`);
  assert.equal(metadata.cohort.raw, guideMeta.cohort.raw);
  assert.equal(metadata.cohort.eligible, guideMeta.cohort.eligible);
  checkCohort(metadata.cohort);
  checkSourceQuality(metadata.source_quality, metadata.cohort, mainRelease, metadata.source_quality_script_sha256);
}

const cohort = evidence.cohort;
checkCohort(cohort);
checkSourceQuality(evidence.source_quality, cohort, weatherRelease, evidence.calculation.source_quality_script_sha256);
{
  assert.equal(cohort.raw, guideMeta.cohort.raw, 'The same release must describe the same raw population');
  assert.equal(cohort.eligible, guideMeta.cohort.eligible, 'Shared timing and source-quality rules must agree');
  assert.equal(evidence.input.asset_sha256, guideMeta.input_asset_sha256);
  assert.equal(evidence.input.manifest_sha256, guideMeta.input_manifest_sha256);
}
assert.equal(evidence.editions.length, cohort.weather_analysis_editions);
assert.equal(new Set(evidence.editions.map(row => row.city + '/' + row.year)).size, evidence.editions.length, 'One independent weather observation per edition');
assert.equal(new Set(evidence.editions.map(row => row.city)).size, cohort.weather_analysis_courses);
assert.equal(sum(evidence.editions.map(row => row.n)), cohort.weather_analysis_finishes);
assert.equal(sum(Object.entries(evidence.exclusions).filter(([key]) => key.endsWith('_finishes')).map(([, value]) => value)) + cohort.weather_analysis_finishes, cohort.eligible);
assert.ok(cohort.weather_analysis_finishes <= cohort.eligible);
for (const row of evidence.editions) {
  assert.ok(Number.isInteger(row.n) && row.n >= 100, 'Every published edition has at least 100 eligible finishes');
  for (const key of ['pace_change_pct', 'temp_c', 'dewpoint_c', 'humidity_pct', 'wind_mps', 'warming_c']) assert.ok(Number.isFinite(row[key]), `${row.city} ${row.year}: ${key}`);
  assert.equal(new Date(row.date).getUTCFullYear(), row.year);
  assert.ok(row.dewpoint_c <= row.temp_c + .2);
  assert.ok(row.humidity_pct >= 0 && row.humidity_pct <= 100 && row.wind_mps >= 0);
  const startHour = Date.parse(row.start_hour + 'Z');
  assert.equal(Date.parse(row.four_hour + 'Z') - startHour, 4 * 60 * 60 * 1000, 'The weather window is always four hours, regardless of finish speed');
  assert.ok(Math.abs(startHour - Date.parse(row.date + 'T' + row.scheduled_start + ':00Z')) <= 30 * 60 * 1000, 'Weather must be close to the supplied local start');
  assert.ok(!evidence.source_quality?.editions.some(excluded => excluded.city === row.city && excluded.year === row.year), 'A source-excluded edition cannot appear in the weather comparison');
}

// Check the declared evidence gate independently of the Python publication flag.
const gate = evidence.prespecified_gate;
assert.equal(gate.locked_before_outcomes, true);
assert.equal(gate.family_comparisons, 3);
close(gate.confidence, 1 - .05 / 3, 'Three-comparison confidence');
assert.equal(gate.practical_difference_pp, 1);
assert.equal(gate.minimum_finishes_per_edition, 100);
assert.equal(gate.minimum_editions, 30);
assert.equal(gate.minimum_courses, 10);
assert.equal(gate.minimum_courses_with_half_iqr_range, 10);
assert.equal(gate.maximum_vif, 10);
assert.equal(gate.minimum_valid_bootstrap_fraction, .95);
assert.equal(gate.bootstrap_draws, 6000);
assert.equal(gate.bootstrap_seed, 20260911);
assert.deepEqual(evidence.candidates.map(item => item.id).sort(), ['humidity', 'warming', 'wind']);
for (const candidate of evidence.candidates) {
  const { effect, support, exposure } = candidate;
  for (const value of [...Object.values(effect).filter(value => typeof value === 'number'), ...Object.values(exposure).filter(value => typeof value === 'number'), ...Object.values(support)]) assert.ok(Number.isFinite(value));
  assert.ok(effect.low <= effect.high, 'The uncertainty bounds must be ordered');
  close(effect.confidence, gate.confidence, 'Candidate confidence');
  assert.equal(effect.unit, 'percentage points', 'A difference in pace percentages is not a percentage change in finish time');
  assert.ok(exposure.min <= exposure.q25 && exposure.q25 < exposure.q75 && exposure.q75 <= exposure.max);
  close(exposure.q75 - exposure.q25, exposure.iqr, 'Observed interquartile contrast');
  assert.equal(support.editions, cohort.weather_analysis_editions);
  assert.equal(support.courses, cohort.weather_analysis_courses);
  assert.equal(support.finishes, cohort.weather_analysis_finishes);
  assert.equal(support.valid_bootstrap_draws + support.failed_bootstrap_draws, gate.bootstrap_draws);
  assert.equal(candidate.leave_course_out.length, support.courses);
  const leaveOut = candidate.leave_course_out.map(row => row.estimate).filter(value => value !== null);
  assert.equal(leaveOut.length + support.failed_leave_course_out_fits, support.courses);
  close(Math.min(...leaveOut), support.leave_course_out_min, 'Leave-one-course-out lower estimate');
  close(Math.max(...leaveOut), support.leave_course_out_max, 'Leave-one-course-out upper estimate');
  const adequate = support.editions >= gate.minimum_editions && support.courses >= gate.minimum_courses
    && support.courses_with_half_iqr_range >= gate.minimum_courses_with_half_iqr_range
    && support.vif <= gate.maximum_vif && support.valid_bootstrap_draws >= gate.bootstrap_draws * gate.minimum_valid_bootstrap_fraction
    && support.failed_leave_course_out_fits === 0;
  const association = (effect.low > 0 || effect.high < 0) && Math.abs(effect.estimate) >= gate.practical_difference_pp && leaveOut.every(value => value * effect.estimate > 0);
  const preciseNull = effect.low > -gate.practical_difference_pp && effect.high < gate.practical_difference_pp && leaveOut.every(value => Math.abs(value) < gate.practical_difference_pp);
  assert.equal(candidate.status === 'ready', adequate && (association || preciseNull));
  if (candidate.status === 'ready') {
    assert.equal(candidate.takeaway_type, association ? 'association' : 'precise_null');
    assert.equal(candidate.reasons.length, 0);
  } else {
    assert.equal(candidate.takeaway_type, null);
    assert.ok(candidate.reasons.length > 0, 'Withheld work retains the reason in the audit');
  }
}
const questions = getWeatherAnalyses();
const ready = evidence.candidates.filter(candidate => candidate.status === 'ready');
assert.deepEqual(questions.map(item => item.id).sort(), ready.map(item => item.id).sort(), 'The public catalog follows the current screening decisions');
const route = require('../app/analyses/[slug]/page.tsx');
const slugs = route.generateStaticParams().map(item => item.slug);
for (const definition of WEATHER_QUESTIONS) {
  const published = ready.some(item => item.id === definition.id);
  assert.equal(slugs.includes(definition.slug), published, 'Only supported weather questions receive static routes');
  if (!published) assert.throws(() => route.default({ params: { slug: definition.slug } }), /NEXT_NOT_FOUND/);
}
for (const ids of [[], ['humidity'], ['wind'], ['humidity', 'warming', 'wind']]) {
  const alternate = { ...evidence, candidates: evidence.candidates.map(candidate => ({ ...candidate, status: ids.includes(candidate.id) ? 'ready' : 'withheld' })) };
  assert.deepEqual(getWeatherAnalyses(alternate).map(item => item.id).sort(), ids.slice().sort(), 'Future screens must not inherit today’s list of ready candidates');
}

// Distinguish a temperature change from an absolute temperature.
assert.equal(weatherValue(0, 'warming', 'mi'), 0);
assert.equal(weatherValue(5, 'warming', 'mi'), 9);
assert.equal(weatherValue(-5, 'warming', 'mi'), -9);
assert.equal(weatherValue(5, 'warming', 'km'), 5);
assert.equal(weatherValue(0, 'humidity', 'mi'), 32);
assert.equal(weatherValue(10, 'humidity', 'mi'), 50);
assert.equal(weatherValue(10, 'humidity', 'km'), 10);
close(weatherValue(1, 'wind', 'mi'), 2.2369362920544, 'm/s to mph');
close(weatherValue(1, 'wind', 'km'), 3.6, 'm/s to km/h');
assert.equal(weatherLabel(5, 'warming', 'mi'), '+9.0°F');
assert.equal(weatherLabel(5, 'warming', 'km'), '+5.0°C');
for (const candidate of evidence.candidates) {
  const negative = { ...candidate, status: 'ready', takeaway_type: 'association', effect: { ...candidate.effect, estimate: -2 } };
  const small = { ...candidate, status: 'ready', takeaway_type: 'precise_null' };
  assert.match(weatherFinding(negative), /less late-race slowing/);
  assert.match(weatherFinding(small), /little change/);
  assert.doesNotMatch(weatherFinding(small), /associated with (?:more|less)/);
  assert.doesNotMatch(weatherFinding({ ...candidate, status: 'withheld', takeaway_type: null }), /associated with (?:more|less)|showed little change/);
}
assert.equal(sourceReleaseTag('private-20300102-0304'), 'private-export-20300102-0304');
assert.equal(sourceReleaseTag('private-export-20300102-0304'), 'private-export-20300102-0304');
assert.doesNotMatch(sourceLabel(evidence.input.as_of, weatherRelease), /private-export|September|20260911/, 'Visible labels describe the data without internal identifiers or upload dates');

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const provider = require('../components/UnitsProvider.tsx');
const originalUseUnits = provider.useUnits;
const WeatherAnalysis = require('../components/WeatherAnalysis.tsx').default;
try {
  for (const units of ['mi', 'km']) {
    // Render the real page in each display mode without browser persistence noise.
    provider.useUnits = () => ({ units, setUnits() {} });
    for (const candidate of ready) {
      const definition = WEATHER_QUESTIONS.find(item => item.id === candidate.id);
      const html = renderToStaticMarkup(React.createElement(WeatherAnalysis, { definition, candidate, evidence, questions }));
      assert.ok(html.includes(sourceReleaseHref(weatherRelease)));
      assert.ok(html.includes(sourceLabel(evidence.input.as_of, weatherRelease)), 'The visible source describes the data');
      assert.ok(html.includes(`${candidate.support.editions} race editions`) && html.includes(`${candidate.support.courses} courses`) && html.includes(`${candidate.support.finishes.toLocaleString('en-US')} complete finishes`));
      assert.ok(html.includes('Each edition has equal weight'));
      assert.match(html, /98\.3% uncertainty interval/);
      assert.doesNotMatch(html, /95% uncertainty interval|95% confidence interval|95% interval/);
      assert.ok(html.includes(weatherLabel(candidate.exposure.q25, candidate.id, units)));
      assert.ok(html.includes(weatherLabel(candidate.exposure.q75, candidate.id, units)));
      assert.ok(html.includes('before adjustment') && html.includes('remains the full-study comparison'), 'Browsing editions must not be presented as a model refit');
      assert.ok(html.includes('percentage points'));
      assert.ok(html.includes(units === 'mi' ? '12.43–24.85 mi' : '20–40 km'));
      assert.ok(html.includes(units === 'mi' ? '0–12.43 mi' : '0–20 km'));
      assert.doesNotMatch(html, /half-marathon splits are measured|observed halfway/);
      for (const edition of evidence.editions) {
        assert.ok(html.includes(edition.city + ' ' + edition.year));
        assert.ok(html.includes(weatherLabel(edition[candidate.exposure.key], candidate.id, units)), 'Exact-values table converts the actual recorded weather measurement');
      }
      if (candidate.id === 'wind') assert.ok(html.includes('not evidence that strong winds are harmless'));
      if (candidate.id === 'warming') assert.ok(html.includes('does not prove that warming caused'));
    }
  }
} finally {
  provider.useUnits = originalUseUnits;
}
const AboutPage = require('../app/about/page.tsx').default;
const about = renderToStaticMarkup(React.createElement(AboutPage));
assert.ok(about.includes('Marathons and years'));
assert.ok(about.includes('Weather data') && about.includes('Elevation data'));
assert.doesNotMatch(about.replace(/<[^>]*>/g, ''), /private-export|September 11/);
assert.ok(about.includes(`${ready.length} of the ${evidence.candidates.length} questions met the publication rule`));
assert.ok(about.includes(`${cohort.weather_analysis_finishes.toLocaleString('en-US')} eligible finishes`));
const WeatherIndex = require('../components/WeatherIndex.tsx').default;
const index = renderToStaticMarkup(React.createElement(WeatherIndex));
if (ready.length) assert.ok(index.includes(sourceLabel(evidence.input.as_of, weatherRelease)));
else assert.equal(index, '', 'Do not show a weather directory with no supported questions');
assert.equal(JSON.stringify(evidence), canonical, 'Rendering and unit conversions must not mutate published evidence');
console.log('Verified weather provenance, reconciled edition cohorts, all three publication gates, supported routes, source units, corrected uncertainty and actual rendered results in miles and metric.');
