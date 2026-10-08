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
const {
  DEFAULT_UNITS, KM_PER_MILE, METRES_PER_FOOT, distanceValue, distanceLabel,
  paceValue, paceLabel, elevationValue, elevationLabel, unitText,
} = require(path.join(__dirname, '../lib/units.ts'));

assert.equal(DEFAULT_UNITS, 'mi');
assert.equal(KM_PER_MILE, 1.609344);
assert.equal(METRES_PER_FOOT, 0.3048);
assert.equal(distanceLabel(42.195, 'mi'), '26.22 mi');
assert.equal(distanceLabel(42.195, 'km'), '42.195 km');
assert.equal(distanceLabel(42.195, 'mi', 1), '26.2 mi');
assert.equal(distanceLabel(5, 'mi'), '3.11 mi');
assert.equal(distanceLabel(5, 'km'), '5 km');
assert.deepEqual([20, 30, 35].map(km => distanceLabel(km, 'mi')), ['12.43 mi', '18.64 mi', '21.75 mi']);
for (const km of [0, 5, 20, 30, 35, 40, 42.195]) {
  assert.equal(distanceValue(km, 'km'), km);
  assert.ok(Math.abs(distanceValue(km, 'mi') * KM_PER_MILE - km) < 1e-12, 'Distance conversion must retain full precision');
}
assert.equal(paceLabel(300, 'mi'), '8:03/mi');
assert.equal(paceLabel(300, 'km'), '5:00/km');
assert.equal(paceLabel(300, 'mi', false), '8:03');
assert.equal(paceLabel(299.8, 'km'), '5:00/km', 'Carry seconds into the next minute');
assert.equal(paceLabel(299.8, 'mi'), '8:02/mi', 'Convert the unrounded source value');
assert.equal(paceLabel(6000, 'mi'), '160:56/mi');
assert.equal(paceLabel(NaN, 'mi'), '—');
assert.equal(paceLabel(-1, 'mi'), '—');
assert.equal(paceValue(5, 'mi'), 8.04672);
assert.equal(paceValue(5, 'km'), 5);
assert.equal(elevationValue(0.3048, 'mi'), 1);
assert.equal(elevationValue(100, 'km'), 100);
assert.equal(elevationLabel(100, 'mi'), '328.1 ft');
assert.equal(elevationLabel(-10, 'mi'), '-32.8 ft');
assert.equal(elevationLabel(100, 'km'), '100 m');

const conversions = [
  ['First 5 km', 'First 3.11 mi'],
  ['Optional recent-5-km pace', 'Optional recent-3.11-mi pace'],
  ['A 5-kilometre section', 'A 3.11-mile section'],
  ['1.609344 kilometres', '1 mile'],
  ['40–42.195 km', '24.85–26.22 mi'],
  ['5–20 km baseline', '3.11–12.43 mi baseline'],
  ['20, 30 or 35 km', '12.43, 18.64 or 21.75 mi'],
  ['20, 30, or 35 km', '12.43, 18.64, or 21.75 mi'],
  ['20 and 30 km', '12.43 and 18.64 mi'],
  ['20 to 30 km', '12.43 to 18.64 mi'],
  ['5:00/km and 100:00/km', '8:03/mi and 160:56/mi'],
  ['5:00 per km', '8:03/mi'],
  ['5 min/km; 300 sec/km', '8.05 min/mi; 482.8 sec/mi'],
  ['Section end (km) · min/km · sec/km', 'Section end (mi) · min/mi · sec/mi'],
  ['minutes per km', 'minutes per mile'],
  ['1,000 m of climbing; −10 m net change', '3280.8 ft of climbing; −32.8 ft net change'],
  ['10–20 m', '32.8–65.6 ft'],
  ['5 kilometres at a pace per kilometre', '3.11 miles at a pace per mile'],
  ['https://example.org/5km?unit=km and 5 km', 'https://example.org/5km?unit=km and 3.11 mi'],
  ['www.example.org/km/5-km — 5 km', 'www.example.org/km/5-km — 3.11 mi'],
];
for (const [canonical, imperial] of conversions) {
  assert.equal(unitText(canonical, 'mi'), imperial, canonical);
  assert.equal(unitText(canonical, 'km'), canonical, 'Metric prose must remain unchanged');
}
for (const text of ['4:00 finish; 10:00–100:00 elapsed', '25% pace change at 15–19.9°C', '2,739,842 finishes across 162 editions', 'No published measurements', '3:20, 30 minutes', '30 m/s']) {
  assert.equal(unitText(text, 'mi'), text, 'Do not change non-distance quantities');
}

const { unitsFromSearch, withUnits } = require('../lib/unit-preference.ts');
assert.equal(unitsFromSearch('?units=mi'), 'mi');
assert.equal(unitsFromSearch('?race=New+York&units=km&goal=195'), 'km');
for (const search of ['', '?units=', '?units=miles', '?units=KM', '?goal=195']) assert.equal(unitsFromSearch(search), null);
const profileLink = '/analyses/pacing-pattern?race=All+courses&goal=195&age=all&gender=all#comparison';
const selectedLink = withUnits(profileLink, 'mi');
assert.equal(selectedLink, '/analyses/pacing-pattern?race=All+courses&goal=195&age=all&gender=all&units=mi#comparison');
assert.equal(withUnits(selectedLink, 'km'), selectedLink.replace('units=mi', 'units=km'));
assert.equal(withUnits('/analyses?units=mi&units=mi', 'km'), '/analyses?units=km');
assert.equal(withUnits('/#analyses', 'mi'), '/?units=mi#analyses');
assert.equal(withUnits('/tools/split-check?s=0:25:00,0:50:00&course=new-york', 'km'), '/tools/split-check?s=0:25:00,0:50:00&course=new-york&units=km', 'Tool links keep readable colons and commas');
assert.equal(withUnits('/analyses', 'km'), '/analyses?units=km');
for (const href of ['https://example.org/5km?units=km#source', '//example.org/data', 'mailto:study@example.org', '#method', 'relative/path']) {
  assert.equal(withUnits(href, 'mi'), href, 'Do not rewrite external, relative or fragment links');
}

// Internal links and addresses: miles (the default) carry no units parameter, so each page has one clean URL;
// kilometres keep units=km so the choice travels with every link even when stored preferences are unavailable.
const { unitHref, dropDefaults, FILTER_DEFAULTS } = require('../lib/unit-preference.ts');
assert.equal(unitHref('/analyses', 'mi'), '/analyses');
assert.equal(unitHref('/analyses', 'km'), '/analyses?units=km');
assert.equal(unitHref('/analyses?units=mi', 'mi'), '/analyses', 'Miles remove a stale units=mi');
assert.equal(unitHref('/analyses?units=km', 'mi'), '/analyses', 'Switching to miles removes units=km');
assert.equal(unitHref('/analyses?units=mi&units=km', 'mi'), '/analyses', 'Every units value goes');
assert.equal(unitHref('/analyses?units=mi', 'km'), '/analyses?units=km');
assert.equal(unitHref('/#analyses', 'mi'), '/#analyses');
assert.equal(unitHref('/?units=mi#analyses', 'mi'), '/#analyses', 'Fragments survive');
assert.equal(unitHref('/#analyses', 'km'), withUnits('/#analyses', 'km'));
assert.equal(unitHref(selectedLink, 'mi'), '/analyses/pacing-pattern?race=All+courses&goal=195&age=all&gender=all#comparison', 'Other parameters keep their order');
assert.equal(unitHref(selectedLink, 'km'), withUnits(selectedLink, 'km'));
assert.equal(unitHref('/tools/split-check?s=0:25:00,0:50:00&units=mi&course=new-york', 'mi'), '/tools/split-check?s=0:25:00,0:50:00&course=new-york', 'Tool links keep readable colons and commas');
assert.equal(unitHref('/tools/split-check?s=0:25:00,0:50:00&course=new-york', 'km'), '/tools/split-check?s=0:25:00,0:50:00&course=new-york&units=km');
assert.equal(unitHref('/tools/pace-band?goal=3%3A30', 'mi'), '/tools/pace-band?goal=3%3A30', 'A link with no units parameter is returned exactly as written');
assert.equal(unitHref('/runners?units=km', 'mi'), '/runners');
for (const href of ['https://example.org/5km?units=km#source', '//example.org/data?units=mi', 'mailto:study@example.org', '#method', 'relative/path?units=mi']) {
  assert.equal(unitHref(href, 'mi'), href, 'Do not rewrite external, relative or fragment links');
  assert.equal(unitHref(href, 'km'), href, 'Do not rewrite external, relative or fragment links');
}
for (const units of ['mi', 'km']) for (const href of ['/', '/courses/berlin', '/analyses/pacing-pattern?race=Boston&goal=210#comparison', '/tools/split-check?s=0:25:00,0:50:00']) {
  const once = unitHref(href, units);
  assert.equal(unitHref(once, units), once, 'unitHref is idempotent');
  assert.equal(unitsFromSearch(once.split('#')[0].slice(once.indexOf('?') < 0 ? once.length : once.indexOf('?'))), units === 'mi' ? null : 'km', 'Miles links read as no request, so the stored preference applies');
  assert.doesNotMatch(once, /units=mi/);
}

// Filters at their defaults (every course, age group and recorded gender) stay out of links.
assert.deepEqual({ ...FILTER_DEFAULTS }, { race: 'All courses', age: 'all', gender: 'all' });
const { EXAMPLE_PROFILE, profileSearch } = require('../lib/analysis-profile.ts');
const { ALL_FINISHER_DEFAULT } = require('../lib/all-finisher-context.ts');
const { FAST_START_DEFAULT } = require('../lib/fast-start.ts');
for (const selection of [EXAMPLE_PROFILE, ALL_FINISHER_DEFAULT, FAST_START_DEFAULT]) {
  assert.equal(selection.city, FILTER_DEFAULTS.race, 'The course default matches every comparison page');
  assert.equal(selection.age, FILTER_DEFAULTS.age); assert.equal(selection.gender, FILTER_DEFAULTS.gender);
}
assert.equal(dropDefaults({ race: 'All courses', age: 'all', gender: 'all' }), '');
assert.equal(dropDefaults(new URLSearchParams({ race: 'All courses', age: 'all', gender: 'all' })), '');
assert.equal(dropDefaults({ race: 'New York', age: 'all', gender: 'Women' }), '?race=New+York&gender=Women');
assert.equal(dropDefaults({ race: 'All courses', age: '40–44', gender: 'all' }), '?age=' + encodeURIComponent('40–44'));
assert.equal(dropDefaults(profileSearch({ ...EXAMPLE_PROFILE, goal: 195 })), '?goal=195', 'Other parameters stay');
assert.equal(dropDefaults(profileSearch({ ...EXAMPLE_PROFILE, previous: 230 })), '?goal=240&previous=230');
assert.equal(dropDefaults('?race=All+courses&s=0:25:00,0:50:00&units=km'), '?s=0:25:00,0:50:00&units=km', 'Readable colons and commas; units untouched');
assert.equal(dropDefaults(''), '');
assert.equal(dropDefaults('?race=all&age=All'), '?race=all&age=All', 'Only exact default values are dropped');
const { readAnalysisProfile } = require('../lib/analysis-profile.ts');
const profileSummary = { cities: [{ city: 'All courses' }, { city: 'Boston' }] };
for (const profile of [EXAMPLE_PROFILE, { ...EXAMPLE_PROFILE, goal: 195 }, { ...EXAMPLE_PROFILE, city: 'Boston', age: '40–44' }, { ...EXAMPLE_PROFILE, gender: 'Women', previous: 230 }]) {
  assert.deepEqual(readAnalysisProfile(dropDefaults(profileSearch(profile)), profileSummary), profile, 'A link without default filters reads back as the same comparison');
}

const { findingText } = require('../lib/analysis-display.ts');
const paceFinding = {
  answer: 'Among recorded finishes, 40–42.195 km has the slowest median section pace: 5:00/km.',
  charts: [{ unit: 'min/km', rows: [{ value: 4.5 }, { value: 299.8 / 60 }] }],
};
const paceFindingSource = JSON.stringify(paceFinding);
assert.equal(findingText(paceFinding, 'mi'), 'Among recorded finishes, 24.85–26.22 mi has the slowest median section pace: 8:02/mi.');
assert.equal(findingText(paceFinding, 'km'), paceFinding.answer);
assert.equal(JSON.stringify(paceFinding), paceFindingSource);
const elevationFinding = {
  answer: 'The supplied profile shows 10 m of net elevation change in 0–5 km, its largest section rise.',
  charts: [{ unit: 'm', rows: [{ value: -20 }, { value: 10.04 }] }],
};
const elevationFindingSource = JSON.stringify(elevationFinding);
assert.equal(findingText(elevationFinding, 'mi'), 'The supplied profile shows 32.9 ft of net elevation change in 0–3.11 mi, its largest section rise.');
assert.equal(findingText(elevationFinding, 'km'), elevationFinding.answer);
assert.equal(JSON.stringify(elevationFinding), elevationFindingSource);

// Verify the rendered numbers as well as helpers: labels alone must not switch
// units while the chart/table measurements retain their old numeric values.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const QuestionViz = require('../components/QuestionViz.tsx').default;
const render = (spec, unitSystem) => renderToStaticMarkup(React.createElement(QuestionViz, { spec, unitSystem }));
const spec = {
  title: 'A measured comparison', xLabel: 'Group', kind: 'bars',
  series: [{ key: 'value', label: 'Median' }], rows: [{ label: 'First 5 km', value: 5, n_value: 120 }],
};
const metricSpec = { ...spec, unit: 'min/km' };
const canonical = JSON.stringify(metricSpec);
const paceHtml = render(metricSpec);
assert.match(paceHtml, /8:03\/mi/);
assert.match(paceHtml, /First 3\.11 mi/);
assert.doesNotMatch(paceHtml, /5:00\/km/);
const metricHtml = render(metricSpec, 'km');
assert.match(metricHtml, /5:00\/km/);
assert.match(metricHtml, /First 5 km/);
assert.doesNotMatch(metricHtml, /8:03\/mi/);
assert.equal(JSON.stringify(metricSpec), canonical, 'Presentation must not mutate the original chart data');
for (const [unit, value, imperial, metric] of [
  ['m', 100, '328.1 ft', '100 m'],
  ['sec/km', 10, '16.1 sec/mi', '10 sec/km'],
  ['% pace', 25, '25%', '25%'],
  ['finish', 240, '4:00', '4:00'],
]) {
  const chart = { ...spec, unit, rows: [{ label: 'Recorded values', value, n_value: 120 }] };
  assert.ok(render(chart).includes(imperial), `${unit}: the imperial renderer must show ${imperial}`);
  assert.ok(render(chart, 'km').includes(metric), `${unit}: the metric renderer must show ${metric}`);
  assert.match(render(chart), /<td>120<\/td>/, 'Sample sizes must not be converted');
}

assert.equal(unitText('between 2 and 20 minutes per km', 'mi'), 'between 3.22 and 32.19 minutes/mi');
assert.equal(unitText('2–20 min/km', 'mi'), '3.22–32.19 min/mi');
// A rate with words between the unit and "per km" converts its number, not only its label.
assert.equal(unitText('37.0 seconds gained per km, versus 17.8 seconds per km in the opening 10 km.', 'mi'), '59.55 seconds gained per mile, versus 28.65 seconds/mi in the opening 6.21 mi.');
assert.equal(unitText('10 minutes or more per km', 'mi'), '16.09 minutes or more per mile');
assert.equal(unitText('18.7 minutes. The final 12.195 km', 'mi'), '18.7 minutes. The final 7.58 mi');
assert.equal(unitText('2 to 20 min/km', 'mi'), '3.22 to 32.19 min/mi');

// Current supporting charts and their prose follow the same display preference.
const StudyFigure = require('../components/StudyFigure.tsx').default;
const UnitsProvider = require('../components/UnitsProvider.tsx').default;
const { getStudyFigures } = require('../lib/study-figures.ts');
const studyFigures = getStudyFigures();
const definitionFigure = studyFigures.find(figure => figure.id === 'sensitivity');
assert.ok(definitionFigure, 'The current source must publish definition sensitivity');
const definitionSource = JSON.stringify(definitionFigure);
const definitionHtml = renderToStaticMarkup(React.createElement(UnitsProvider, null, React.createElement(StudyFigure, { figure: definitionFigure })));
assert.match(definitionHtml, /3\.11 mi/);
assert.doesNotMatch(definitionHtml, /at least 5 km/);
assert.match(definitionHtml, /data\/study\/evidence.json/);
assert.equal(JSON.stringify(definitionFigure), definitionSource);
const { getWallTimingAnswer } = require('../lib/research-data.ts');
const onsetChart = getWallTimingAnswer().charts[0];
assert.ok(onsetChart, 'Onset must be recomputed from the current source');
assert.match(render(onsetChart), /Distance \(mi\)/);
assert.match(render(onsetChart, 'km'), /Distance \(km\)/);

const { getAnalysisStart } = require('../lib/analysis-server.ts');
const profileSpec = getAnalysisStart().answers.find(answer => answer.id === 'profile').charts[0];
const sourceProfile = JSON.stringify(profileSpec);
const profileHtml = render(profileSpec);
assert.match(profileHtml, /0–3\.11 mi/);
assert.match(profileHtml, /24\.85–26\.22 mi/);
assert.match(profileHtml, /per mile/);
for (const row of profileSpec.rows) {
  assert.ok(profileHtml.includes(paceLabel(row.value * 60, 'mi')), 'Every real profile median must use the converted source pace');
  assert.ok(profileHtml.includes(distanceLabel(Number(row.label), 'mi')), 'Every original section endpoint must remain identifiable');
}
assert.match(render(profileSpec, 'km'), /40–42\.195 km/);
assert.equal(JSON.stringify(profileSpec), sourceProfile, 'Rendering both modes must preserve all source values');

console.log('Verified display-only mile, pace and elevation conversions, source precision, checkpoint labels, prose ranges, URL preservation, rendered measurements, unchanged samples and real profile sections in both units.');
