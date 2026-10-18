const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PacingReadings, SectionComparison, RunnerPeerComparison, RunnerConditions, defaultGroup } = require('../components/RunnerContext.tsx');
const { runnerMetrics, RUNNER_POINTS } = require('../lib/runner-search.ts');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
/** Method, source and caveat copy, which since October 16, 2026 is on /methodology only. */
const METHOD_COPY = /Source:|source note|supplied|modell?ed weather|personal exposure|historical validity|not established|preceding-hour total includes|Higher means|ties count halfway|nearest millisecond|contains your own result|middle half|add up to the finish-time difference|at least 101|eligible finishes in|not inferred|do not establish|does not establish|cannot isolate|not a verified reconstruction|does not identify headwind/i;
const race = { id: 1, edition: 0, name: 'Fixture Runner', sex: 'F', age: 35, eligible: true, reason: null, times: RUNNER_POINTS.map(km => km * 300) };
const reference = { ...race, id: 2, edition: 1, times: RUNNER_POINTS.map(km => km * 320) };
const manifest = { editions: [{ city: 'London', year: 2020, race: 'London Marathon' }, { city: 'London', year: 2020, race: 'London Marathon' }] };
const metrics = runnerMetrics(race);
const weather = {
  date: '2020-01-01', scheduled_start: '09:00', start_hour: '2020-01-01T09:00', four_hour: '2020-01-01T13:00',
  temp_c: 0, feels_like_c: null, dewpoint_c: -1, humidity_pct: 50, wind_mps: 0, wind_dir_deg: null,
  precip_mm: 0, cloud_pct: null, pressure_hpa: null, warming_c: 2,
  hours: [{ time: '2020-01-01T09:00', temp_c: 0, feels_like_c: null, dewpoint_c: -1, humidity_pct: 50, wind_mps: 0, precip_mm: 0 },
    { time: '2020-01-01T13:00', temp_c: 2, feels_like_c: null, dewpoint_c: -1, humidity_pct: null, wind_mps: null, precip_mm: null }],
  source: 'Test source', source_url: 'https://example.org/weather', notes: 'A recorded source note.',
  context_label: 'Modeled weather near the scheduled start.', precipitation_note: 'The preceding-hour total includes rain, showers and snow.',
};
const terrain = {
  course_key: 'london', gain_m: 100, loss_m: 60, net_m: 35, source: 'Test route', source_url: 'https://example.org/route',
  notes: 'The first 5 km uses a supplied route proxy.', context_label: 'Supplied current-route context.', historical_validity_known: false,
  valid_from_year: null, valid_to_year: null, profile_distance_km: 42.161, segment_span_km: 42.195,
  reported_profile_gain_m: 120, reported_profile_loss_m: 80, aggregation_method: 'Sum the supplied sections through 42.195 km.',
  sections: RUNNER_POINTS.map((end, i) => ({ start_km: i ? RUNNER_POINTS[i - 1] : 0, end_km: end, gain_m: 10, loss_m: 6, net_m: 4 })),
};
const context = { weather, terrain, weather_reason: null, terrain_reason: null };
const original = JSON.stringify(context);
const mileConditions = render(RunnerConditions, { context, metrics, units: 'mi' });
assert.match(mileConditions, /32°F/);
assert.match(mileConditions, /\+3\.6°F/);
assert.doesNotMatch(mileConditions, /35\.6°F<\/strong>/, 'A two-degree temperature rise is 3.6°F, without adding the freezing-point offset');
assert.match(mileConditions, /0 mph/); assert.match(mileConditions, /0 in/); assert.match(mileConditions, /Not available/);
assert.match(mileConditions, /328 ft/); assert.doesNotMatch(mileConditions, /\d\.\d ft\b/, 'Climbs in whole feet, as the course pages print them'); assert.match(mileConditions, /40K–finish/, 'Sections are named by their mats in both units'); assert.doesNotMatch(mileConditions, /\d\.\d\d\s*mi\b/, 'Miles never to two decimals');
assert.doesNotMatch(mileConditions, /first 3\.11 mi|A recorded source note|example\.org/, 'The weather and route records\' own notes and sources are not shown');
assert.doesNotMatch(mileConditions, METHOD_COPY, 'No method or source copy in the conditions');
assert.match(mileConditions, /Scheduled start: 09:00 local time/); assert.match(mileConditions, /Start-hour observation: 09:00/);
const metricConditions = render(RunnerConditions, { context, metrics, units: 'km' });
assert.match(metricConditions, /0°C/); assert.match(metricConditions, /\+2°C/); assert.match(metricConditions, /0 km\/h/); assert.match(metricConditions, /0 mm/); assert.match(metricConditions, /100 m/);
assert.equal(JSON.stringify(context), original, 'Display conversions must not mutate the source context');
assert.equal(defaultGroup(race), 'age_gender');
assert.equal(defaultGroup({ ...race, sex: null }), 'age', 'A usable age still supports age peers when gender is unrecorded');
assert.equal(defaultGroup({ ...race, age: null }), 'gender');
assert.equal(defaultGroup({ ...race, age: 1923, sex: null }), 'all', 'Do not turn an invalid recorded age into an age cohort');
const absent = render(RunnerConditions, { context: { weather: null, terrain: null, weather_reason: 'Ambiguous scheduled start.', terrain_reason: 'No exact course match.' }, metrics, units: 'mi' });
assert.match(absent, /Weather is not available for this edition/); assert.match(absent, /Terrain is not available for this edition/); assert.doesNotMatch(absent, /0°F|0 mph|0 ft/);
assert.doesNotMatch(absent, /Ambiguous scheduled start|No exact course match/, 'The data screen\'s reasons are not shown');

for (const units of ['mi', 'km']) {
  const html = render(PacingReadings, { race, metrics, manifest, units });
  assert.match(html, /3:30:58\.5/); assert.doesNotMatch(html, METHOD_COPY, 'No method copy beside the pacing');
  assert.match(html, units === 'mi' ? /8:03\/mi/ : /5:00\/km/);
  assert.match(html, /the same pace as your early pace/);
}
const comparison = {
  key: 'age_gender', label: 'Women, ages 35–39', n: 201, other_n: 200, rank: 50, ties: 2, percentile: 75, median_finish: 13000,
  pace: { n: 101, from_sec: 12150, to_sec: 13050, q25: Array(9).fill(290), median: Array(9).fill(305), q75: Array(9).fill(320), late_change: { q25: 5, median: 12, q75: 20 } },
};
const milePeers = render(RunnerPeerComparison, { comparison, metrics, units: 'mi' });
assert.match(milePeers, /2 other finishes share this time/); assert.match(milePeers, /faster than 75% of the 200 other finishes/); assert.match(milePeers, /Not an official race placing/);
assert.match(milePeers, /12 percentage points lower than/); assert.match(milePeers, /Your pace/); assert.match(milePeers, /Middle 50%/);
assert.doesNotMatch(milePeers, METHOD_COPY, 'No percentile definition or group caveat beside the peers');
assert.match(milePeers, /8:03\/mi/); assert.match(milePeers, /8:11\/mi/);
assert.match(render(RunnerPeerComparison, { comparison, metrics, units: 'km' }), /5:05\/km/);
const sparse = render(RunnerPeerComparison, { comparison: { ...comparison, pace: null }, metrics, units: 'mi' });
assert.match(sparse, /pace group is too small/); assert.doesNotMatch(sparse, /101 eligible finishes/); assert.doesNotMatch(sparse, /12 percentage points lower/);

const paired = render(SectionComparison, { focus: { race, metrics }, reference: { race: reference, metrics: runnerMetrics(reference) }, manifest, units: 'mi' });
assert.match(paired, /0:14:03\.9 faster/); assert.match(paired, /0:01:40 less/); assert.doesNotMatch(paired, METHOD_COPY, 'No method copy beside the section comparison');
assert.doesNotMatch(paired, /improved|previous race|earlier race/, 'A same-year pair is an A/B comparison without inferred chronology');

// A copy edition (lib/duplicate-editions.ts), synthetic: the later year repeats the earlier field, so without the screen
// it would be the default focus race. With it, the copy is no focus option, comparison, context row or split-check link.
const RunnerContext = require('../components/RunnerContext.tsx').default;
const copyManifest = { editions: [{ city: 'Lakeside', year: 2021, race: 'Lakeside Marathon' }, { city: 'Lakeside', year: 2025, race: 'Lakeside Marathon' }] };
const source = { ...race, id: 31, edition: 0 }, repeated = { ...race, id: 32, edition: 1 };
const screen = [{ city: 'Lakeside', year: 2025, duplicate_of: 2021, eligible_removed: 400, identical_nine_time_twins: 390 }];
const contextView = copyEditions => render(RunnerContext, { races: [source, repeated], manifest: copyManifest, units: 'mi', copyEditions });
const focusOptions = html => (html.match(/<select id="[^"]*-focus"[^>]*>([\s\S]*?)<\/select>/)?.[1].match(/<option /g) || []).length;
const without = contextView([]), withCopy = contextView(screen);
assert.equal(focusOptions(without), 2); assert.match(without, /<option value="32" selected="">Lakeside 2025/); assert.match(without, /Across your selected races/);
assert.equal(without, render(RunnerContext, { races: [source, repeated], manifest: copyManifest, units: 'mi' }), 'An empty screen leaves the view as it was');
assert.equal(focusOptions(withCopy), 1, 'One focus option');
assert.equal((withCopy.match(/<option /g) || []).length, 1, 'No other race to compare with');
assert.match(withCopy, /<option value="31" selected="">Lakeside 2021/);
assert.doesNotMatch(withCopy, /2025|record 32|Across your selected races|rc-multi/, 'The copy appears nowhere in the view');
assert.equal((withCopy.match(/Read this race in the split check/g) || []).length, 1, 'One split-check link, for the source race');
assert.equal(render(RunnerContext, { races: [repeated], manifest: copyManifest, units: 'mi', copyEditions: screen }), '', 'A selection of copies alone has no context view');
// The race report (components/report/RaceReport.tsx, loaded on request): one "Make a race report" button, for the
// focus race, and none for a copy edition, which has no focus option; without the build's report data, no panel.
const reportData = { indexSha: null, archetypesSha: null, openingBands: [], typeCohort: null, courses: {} };
const withReport = render(RunnerContext, { races: [source, repeated], manifest: copyManifest, units: 'mi', copyEditions: screen, report: reportData });
assert.equal((withReport.match(/>Make a race report</g) || []).length, 1, 'One report button, for the eligible focus race');
assert.match(withReport, /Lakeside 2021 on one page\./); assert.doesNotMatch(withReport.split('rc-report')[1], /2025/, 'The report panel never names the copy');
assert.doesNotMatch(withReport, /record 32/);
assert.equal(render(RunnerContext, { races: [repeated], manifest: copyManifest, units: 'mi', copyEditions: screen, report: reportData }), '', 'A copy edition alone has no report button');
assert.doesNotMatch(render(RunnerContext, { races: [source], manifest: copyManifest, units: 'mi' }), /Make a race report/, 'No report panel without the report data');
assert.doesNotMatch(withReport, METHOD_COPY, 'No method copy in the context view');
console.log('Runner context UI passed: unchanged source values, weather/terrain units, missing versus zero, peer ties, rank and pace, exact checkpoints, same-year section differences, no method, source or caveat copy (on /methodology since October 16, 2026), and no focus option, comparison, split-check link or race report button for a copy edition.');
