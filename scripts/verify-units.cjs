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
  paceValue, paceLabel, elevationValue, elevationLabel, unitText, matLabel, sectionLabel: matSection, distance, MARATHON_KM,
} = require(path.join(__dirname, '../lib/units.ts'));
const { paceTicks } = require(path.join(__dirname, '../lib/pace-ticks.ts'));

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

// Mats are named the same in both unit modes (owner decision 4, spec section 3.10): 5K … 40K and Finish, sections
// "0–5K" … "35–40K" and "40K–finish". Other distances in prose take one decimal in miles, never two.
assert.equal(MARATHON_KM, 42.195);
assert.deepEqual([0, 5, 10, 20, 21.0975, 30, 35, 40, 42.195, 42.2].map(matLabel), ['Start', '5K', '10K', '20K', '21.1K', '30K', '35K', '40K', 'Finish', 'Finish']);
assert.equal(matLabel(NaN), '—');
assert.deepEqual([[0, 5], [5, 10], [20, 25], [35, 40], [40, 42.195], [0, 42.195], [5, 20]].map(([a, b]) => matSection(a, b)),
  ['0–5K', '5–10K', '20–25K', '35–40K', '40K–finish', 'Start–finish', '5–20K']);
assert.equal(distance(42.195, 'mi'), '26.2 mi');
assert.equal(distance(42.195, 'km'), '42.2 km');
assert.equal(distance(2.195, 'mi'), '1.4 mi', 'The last 2.195 km reads 1.4 mi in prose');
assert.equal(distance(5, 'mi'), '3.1 mi');
assert.equal(distance(5, 'km'), '5 km');
assert.equal(distance(NaN, 'mi'), '—');
for (const km of [0.5, 1, 2.195, 5, 12.195, 21.0975, 42.195]) assert.doesNotMatch(distance(km, 'mi'), /\.\d\d/, 'Prose miles never take two decimals');
{
  const viz = require('../lib/viz/format.ts');
  for (const units of ['mi', 'km']) {
    assert.deepEqual([5, 10, 20, 30, 40, 42.195].map((km) => viz.checkpointLabel(km, units)), ['5K', '10K', '20K', '30K', '40K', 'Finish'], `${units}: checkpoints are mats`);
    assert.deepEqual(viz.SECTION_BOUNDS.map((_, i) => viz.sectionLabel(i, units)), ['0–5K', '5–10K', '10–15K', '15–20K', '20–25K', '25–30K', '30–35K', '35–40K', '40K–finish'], `${units}: sections are named by their mats`);
  }
  assert.equal(viz.sectionLabel(9), '—');
}

// Pace axes: a round minutes:seconds grid in the units shown, never a kilometre grid converted to miles (which read
// 8:15, 8:48, 9:21/mi on the pacing-pattern chart). Ticks are seconds per displayed unit; the domain is first to last.
const tickLabels = (axis, units) => axis.ticks.map(t => paceLabel(t / paceValue(1, units), units, false));
const exampleMiles = paceTicks(8.25 * 60, 10.45 * 60, 'mi');
assert.deepEqual(exampleMiles, { ticks: [480, 510, 540, 570, 600, 630], domain: [480, 630] });
assert.deepEqual(tickLabels(exampleMiles, 'mi'), ['8:00', '8:30', '9:00', '9:30', '10:00', '10:30'], 'A tick label reads back as its own grid value');
assert.deepEqual(paceTicks(5.13 * 60, 6.49 * 60, 'km'), { ticks: [300, 330, 360, 390, 420], domain: [300, 420] }, 'Seven 0:15/km ticks are too many: 0:30/km, with a fifth past the values on the side with less room');
assert.deepEqual(paceTicks(5.1 * 60, 5.9 * 60, 'km').ticks, [300, 315, 330, 345, 360], 'A narrow kilometre range keeps a 0:15 grid');
assert.deepEqual(paceTicks(552, 590, 'mi').ticks, [540, 555, 570, 585, 600], 'A narrow mile range (9:12 to 9:50) takes 0:15, where 0:30 would leave three ticks');
assert.deepEqual(paceTicks(540, 545, 'mi'), { ticks: [540, 541, 542, 543, 544, 545], domain: [540, 545] }, 'Five seconds of range tick every second');
assert.deepEqual(paceTicks(495, 585, 'mi').ticks, [480, 510, 540, 570, 600], 'The coarsest grid with five ticks: 0:30, not 0:15');
assert.deepEqual(paceTicks(540, 540, 'km').ticks, [538, 539, 540, 541, 542], 'One value still gets an axis');
assert.deepEqual(paceTicks(480, 600, 'mi').ticks, [480, 510, 540, 570, 600], 'Values on the grid add no tick beyond them');
assert.deepEqual(paceTicks(480 + 1e-9, 600 - 1e-9, 'mi').ticks, [480, 510, 540, 570, 600], 'A rounding error does not add a tick');
assert.deepEqual(paceTicks(300, 1200, 'mi').ticks, [300, 600, 900, 1200, 1500], 'A wide range steps up to whole minutes');
assert.ok(paceTicks(250, 1350, 'km').ticks.length <= 6);
for (const [min, max, units] of [[0, 0, 'mi'], [0, 7200, 'km'], [1e-6, 3e4, 'mi']]) assert.ok(paceTicks(min, max, units).ticks.length <= 6, 'Six ticks at most, however wide the range');
for (const [min, max] of [[NaN, 600], [600, Infinity], [600, 540]]) assert.equal(paceTicks(min, max, 'mi'), null);
// Never fewer gridlines than Recharts' own axis drew (five), on the coarsest listed grid that gives five or six.
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
for (let lo = 240; lo < 900; lo += 7.3) for (const span of [0, 3, 4, 10, 38, 45, 75, 130, 260, 600]) for (const units of ['mi', 'km']) {
  const axis = paceTicks(lo, lo + span, units);
  const step = axis.ticks[1] - axis.ticks[0];
  assert.ok(axis.domain[0] <= lo + 1e-6 && axis.domain[1] >= lo + span - 1e-6, 'The axis covers every value');
  assert.ok(axis.ticks.length >= 5 && axis.ticks.length <= 6, 'Five or six ticks');
  assert.ok(STEPS.includes(step) && axis.ticks.every(t => t % step === 0), `${units} ticks sit on a round grid`);
  const coarser = STEPS.filter(s => s > step).map(s => Math.round((Math.max(Math.floor(lo / s + 1e-9) * s + s, Math.ceil((lo + span) / s - 1e-9) * s) - Math.floor(lo / s + 1e-9) * s) / s) + 1);
  assert.ok(coarser.every(n => n < 5 || n > 6), 'No coarser grid gives five or six ticks');
  assert.equal(axis.ticks[0], axis.domain[0]); assert.equal(axis.ticks[axis.ticks.length - 1], axis.domain[1]);
}

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
  // The character before a number decides whether it converts: a sign, bracket, comma, quote, space or the start of
  // the text does; a word character, colon or dot does not (only the bare unit after it changes).
  ['x-5 km', 'x-3.11 mi'],
  ['x−10 m', 'x−32.8 ft'],
  ['(-5 km)', '(-3.11 mi)'],
  ['-5 km', '-3.11 mi'],
  ['5 km,10 km', '3.11 mi,6.21 mi'],
  ['5km-10km', '3.11 mi-6.21 mi'],
  ['1:05:00 per km', '1:05:00 per mile'],
  ['12:5:00/km', '12:5:00/mi'],
  ['v2.5 km', 'v2.5 mi'],
  ['.5 km', '.5 mi'],
  [':5 km', ':5 mi'],
  ['5 km.5 km', '3.11 mi.5 mi'],
  ['5 m/5 m', '5 m/16.4 ft'],
  ['42.195-km race', '26.22-mi race'],
  ['2 seconds lost per km', '3.22 seconds lost per mile'],
  ['\n5 km', '\n3.11 mi'],
  ['‘5 km’', '‘3.11 mi’'],
  ['_5 km', '_5 mi'],
  ['5_km', '5_km'],
];
for (const [canonical, imperial] of conversions) {
  assert.equal(unitText(canonical, 'mi'), imperial, canonical);
  assert.equal(unitText(canonical, 'km'), canonical, 'Metric prose must remain unchanged');
}
const unchanged = ['4:00 finish; 10:00–100:00 elapsed', '25% pace change at 15–19.9°C', '2,739,842 finishes across 162 editions', 'No published measurements', '3:20, 30 minutes', '30 m/s'];
for (const text of unchanged) {
  assert.equal(unitText(text, 'mi'), text, 'Do not change non-distance quantities');
}

// Safari before 16.4 throws when a lookbehind RegExp is built, which crashed every page showing converted prose. Run the
// whole table again with RegExp failing the same way: same outputs, and no lookbehind built. Regex literals do not go
// through the constructor, so the source is checked for them too.
const unitsPath = require.resolve('../lib/units.ts');
assert.doesNotMatch(fs.readFileSync(unitsPath, 'utf8'), /\(\?<[=!]/, 'lib/units.ts has no lookbehind');
const NativeRegExp = RegExp;
let lookbehindsBuilt = 0;
const refuseLookbehind = args => {
  if (!/\(\?<[=!]/.test(args[0] instanceof NativeRegExp ? args[0].source : String(args[0]))) return;
  lookbehindsBuilt++;
  throw new SyntaxError('Invalid regular expression: invalid group specifier name');
};
const tableTexts = [...conversions.map(([canonical]) => canonical), ...unchanged];
const loadedUnits = require.cache[unitsPath];
let oldSafariOutputs;
global.RegExp = new Proxy(NativeRegExp, {
  construct(target, args, newTarget) { refuseLookbehind(args); return Reflect.construct(target, args, newTarget); },
  apply(target, self, args) { refuseLookbehind(args); return Reflect.apply(target, self, args); },
});
try {
  delete require.cache[unitsPath];
  const oldSafari = require(unitsPath);
  oldSafariOutputs = tableTexts.map(text => [oldSafari.unitText(text, 'mi'), oldSafari.unitText(text, 'km')]);
} finally {
  global.RegExp = NativeRegExp;
  require.cache[unitsPath] = loadedUnits;
}
assert.equal(lookbehindsBuilt, 0, 'lib/units.ts builds no lookbehind RegExp');
assert.deepEqual(oldSafariOutputs, tableTexts.map(text => [unitText(text, 'mi'), unitText(text, 'km')]), 'Safari before 16.4 gets the same conversions');

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
  answer: 'The largest section rise is in 0–5 km: 10 m of net elevation change.',
  charts: [{ unit: 'm', rows: [{ value: -20 }, { value: 10.04 }] }],
};
const elevationFindingSource = JSON.stringify(elevationFinding);
assert.equal(findingText(elevationFinding, 'mi'), 'The largest section rise is in 0–3.11 mi: 32.9 ft of net elevation change.');
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
// Since October 16, 2026 the figure shows its chart only; its download link is on /methodology (#downloads, #sustained-slowdown).
assert.doesNotMatch(definitionHtml, /data\/study\/evidence.json/, 'The figure links no download; /methodology does');
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
// The real pacing-pattern chart's axis in both units: every value covered, every label on its own grid.
const profilePaces = profileSpec.rows.flatMap(row => profileSpec.series.map(series => row[series.key] * 60));
for (const [units, ending] of [['mi', /:(?:00|15|30|45)$/], ['km', /:(?:00|15|30|45)$/]]) {
  const shown = profilePaces.map(seconds => paceValue(seconds, units));
  const axis = paceTicks(Math.min(...shown), Math.max(...shown), units);
  assert.ok(axis.domain[0] <= Math.min(...shown) && axis.domain[1] >= Math.max(...shown), `${units}: the pacing-pattern axis covers every pace`);
  for (const text of tickLabels(axis, units)) assert.match(text, ending, `${units}: pacing-pattern tick ${text} is on the round grid`);
}
// Both Recharts pace axes take these ticks rather than Recharts' decimal-minute ones.
const chartSource = name => fs.readFileSync(path.join(__dirname, '../components', name), 'utf8');
assert.match(chartSource('QuestionViz.tsx'), /paceTicks\(Math\.min\(\.\.\.allValues\) \* 60, Math\.max\(\.\.\.allValues\) \* 60, selectedUnits\)/);
assert.match(chartSource('QuestionLineChart.tsx'), /<YAxis [^>]*ticks=\{paceTicks\}[^>]*domain=\{paceTicks \? \[paceTicks\[0\], paceTicks\[paceTicks\.length - 1\]\]/);
// The runner view's pace chart (LineProfile, no Recharts since the October 18, 2026 redesign) takes the same ticks: its
// domain and every gridline come from paceTicks, labelled with paceLabel.
assert.match(chartSource('RunnerContext.tsx'), /const axis = paceTicks\([^;]*, units, 6\);\n\s*const grid = axis \? \[\.\.\.new Set\(\[axis\.ticks\[0\][^;]*axis\.ticks\[axis\.ticks\.length - 1\]\]\)\] : \[\];/);
assert.match(chartSource('RunnerContext.tsx'), /<LineProfile [^>]*yDomain=\{axis \? axis\.domain : undefined\}[\s\S]*?yTicks=\{grid\.map\(v => \(\{ value: v, label: clear\(v\) \? tick\(v\) : '' \}\)\)\}/);

// The header's units switch works on every page that shows text changing with the units (lib/unit-preference.ts), and
// the server render stops (so the build stops) when such text is on a page where the switch is inert.
{
  const { unitSwitchShown } = require('../lib/unit-preference.ts');
  for (const page of ['/', '/about', '/slowdown', '/research', '/analyses', '/analyses/pacing-pattern', '/runners',
    '/courses', '/courses/boston', '/stories', '/stories/final-kick', '/tools', '/tools/plan', '/tools/qualifying/boston', '/finish-times']) assert.ok(unitSwitchShown(page), `The units switch works on ${page}`);
  // The moved addresses' stubs (lib/seo-routes.ts movedTo) show no text that changes with the units.
  for (const page of ['/research/personalized', '/htw', '/your-race', '/packs', '/packs/smyth_htw', '/packs/r01_banking_time', '/methodology', '/privacy', '/request-analysis', '/_not-found', '/toolsx', '/research-notes']) assert.equal(unitSwitchShown(page), false, `${page} keeps the inert placeholder`);
  // A second copy of the provider whose next/navigation reports a chosen page, as the static export's render does.
  const providerFile = require.resolve('../components/UnitsProvider.tsx');
  let pathname = '/privacy';
  const realLoad = Module._load;
  const cached = require.cache[providerFile];
  delete require.cache[providerFile];
  Module._load = function (request, parent, ...rest) {
    if (parent?.filename === providerFile && request === 'next/navigation') return { usePathname: () => pathname };
    return realLoad.call(this, request, parent, ...rest);
  };
  let units;
  try { units = require(providerFile); } finally { Module._load = realLoad; require.cache[providerFile] = cached; }
  const page = (...children) => renderToStaticMarkup(React.createElement(units.default, null, ...children));
  const e = React.createElement;
  const inert = /\/privacy shows text that changes with the units, but the header's units switch is inert there/;
  assert.throws(() => page(e(units.UnitText, null, 'From the first 5 km to the finish.')), inert, 'Converted prose on an inert page stops the build');
  assert.throws(() => page(e(units.MarathonDistance)), inert);
  assert.throws(() => page(e(function Chart() { return `${units.useUnits().units} axis`; })), inert, 'So does any figure that reads the units');
  assert.equal(page(e(units.UnitText, null, 'Methods and sources.')), 'Methods and sources.', 'Prose with no kilometre figure is the same in both units and may go anywhere');
  assert.match(page(e(units.UnitSwitch), e(units.UnitLink, { href: '/tools' }, 'Tools')), /^<div class="unit-switch unit-switch-placeholder" aria-hidden="true">.*<a href="\/tools">Tools<\/a>$/, 'Links and the placeholder render on every page');
  const storyUnits = require('../components/story/Units.tsx');
  assert.equal(page(e(storyUnits.Checkpoint, { km: 30 }), ' ', e(storyUnits.Section, { i: 8 })), '30K 40K–finish', 'Mat names read the same everywhere, so they may go on any page');
  pathname = '/research';
  assert.equal(page(e(units.UnitText, null, 'From the first 5 km to the finish.')), 'From the first 3.11 mi to the finish.');
  assert.match(page(e(units.UnitSwitch)), /^<div class="unit-switch" role="group" aria-label="Distance and pace units">/, '/research has the working switch');
}

// A per-degree effect follows the reader's degree: a per-°C slope never sits beside a °F axis (the redesign spec,
// section 3.10). EffectBand takes per-°C data and a required unit system, converts and names the degree it shows.
{
  const EffectBand = require('../components/viz/EffectBand.tsx').default;
  const { perDegree } = require('../lib/nuggets/format.ts');
  assert.equal(perDegree(1.8, 'mi'), 1);
  assert.equal(perDegree(1.8, 'km'), 1.8);
  const band = (units) => renderToStaticMarkup(React.createElement(EffectBand, {
    units, label: 'Effect', bins: [{ id: 'a', label: 'A', value: 1.8, lo: 0.9, hi: 2.7 }], estimate: { value: 1.8, lo: 1.44, hi: 2.16, label: 'Fit' },
  }));
  const mi = band('mi'), km = band('km');
  assert.match(mi, /pts per °F/, 'Miles mode names °F on the effect scale');
  assert.doesNotMatch(mi, /°C/, 'Miles mode shows no per-°C value');
  assert.match(km, /pts per °C/, 'Kilometre mode names °C on the effect scale');
  assert.doesNotMatch(km, /°F/);
  const top = (html) => Number((html.match(/>\+([\d.]+) pts per/) || [])[1]);
  assert.ok(top(mi) >= 1.5 && top(mi) < 2.7, `The °F scale tops out over the converted interval (1.5 per °F), not the per-°C one: got ${top(mi)}`);
  assert.ok(top(km) >= 2.7, `The °C scale covers the per-°C interval: got ${top(km)}`);
}

console.log('Verified mat names (5K … 40K, Finish; 0–5K … 40K–finish) in both units, one-decimal prose miles, display-only mile, pace and elevation conversions, source precision, checkpoint labels, prose ranges, URL preservation, rendered measurements, unchanged samples, real profile sections and round pace-axis ticks in both units, the same conversions where a lookbehind RegExp cannot be built (Safari before 16.4), and the working units switch on every page whose text changes with the units (the build stops otherwise); per-degree effects follow the reader\'s degree.');
