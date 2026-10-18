const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

process.chdir(path.resolve(__dirname, '..'));
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename,
);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(process.cwd(), request.slice(2)) : request, ...args);
};

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { EXAMPLE_PROFILE, readAnalysisProfile, profileSearch, sameProfile } = require('../lib/analysis-profile.ts');
const { TEN_ANALYSES, analysisBySlug, analysisHref } = require('../lib/ten-analyses.ts');
const { getAnalysisStart } = require('../lib/analysis-server.ts');
const { loadAnalysisAggregate } = require('../lib/analysis-aggregates.ts');
const QuestionViz = require('../components/QuestionViz.tsx').default;
const AnalysisChart = require('../components/AnalysisChart.tsx').default;
const AnalysisExplorer = require('../components/AnalysisExplorer.tsx').default;
const CheckpointExplorer = require('../components/CheckpointExplorer.tsx').default;
const { unitText } = require('../lib/units.ts');
const { summary, answers } = getAnalysisStart();

assert.equal(TEN_ANALYSES.length, 10);
assert.equal(new Set(TEN_ANALYSES.map(item => item.slug)).size, 10);
assert.deepEqual(TEN_ANALYSES.map(item => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
for (const definition of TEN_ANALYSES) {
  assert.equal(analysisBySlug(definition.slug), definition);
  assert.equal(analysisHref(definition), '/analyses/' + definition.slug);
  assert.ok(answers.find(answer => answer.id === definition.id), `${definition.id}: the curated question must have an implemented answer`);
}
assert.equal(analysisBySlug('unpublished-question'), undefined);

// Query links must preserve every active comparison, including hidden refinements.
for (const city of summary.cities.map(item => item.city)) for (const goal of [90, 177, 240, 360, 720]) {
  const profile = { ...EXAMPLE_PROFILE, city, goal, age: '30–34', gender: 'Women', previous: 255 };
  assert.deepEqual(readAnalysisProfile(profileSearch(profile), summary), profile);
  assert.ok(sameProfile(readAnalysisProfile(profileSearch(profile), summary), profile));
}
assert.deepEqual(readAnalysisProfile('', summary), EXAMPLE_PROFILE);
assert.equal(readAnalysisProfile('?race=NYC&goal=360', summary).city, 'New York');
for (const goal of ['', '89', '721', '177.5', 'NaN', 'Infinity', '3:00']) assert.equal(readAnalysisProfile('?goal=' + goal, summary).goal, 240);
for (const previous of ['', '89', '721', '177.5', 'NaN']) assert.equal(readAnalysisProfile('?previous=' + previous, summary).previous, null);
assert.deepEqual(readAnalysisProfile('?race=Missing&age=unknown&gender=unknown', summary), EXAMPLE_PROFILE);
assert.ok(!sameProfile(EXAMPLE_PROFILE, { ...EXAMPLE_PROFILE, previous: 255 }));
assert.ok(!sameProfile(EXAMPLE_PROFILE, { ...EXAMPLE_PROFILE, goal: 241 }));

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const rangeSpec = {
  title: 'Recorded finish range', unit: 'finish', xLabel: 'Group', kind: 'bars',
  series: [{ key: 'low', label: '10th percentile' }, { key: 'value', label: 'Median' }, { key: 'high', label: '90th percentile' }],
  rows: [{ label: 'Comparable finishes', low: 205, value: 240, high: 282, n_low: 200, n_value: 200, n_high: 200 }],
};
const rangeHtml = render(QuestionViz, { spec: rangeSpec });
assert.match(rangeHtml, /class="range-chart"/);
assert.match(rangeHtml, /class="range-values"><strong aria-label="Median: 4:00">4:00<\/strong><\/div>/, 'The compact range column needs one visible number and an accessible median label');
const timeAxis = rangeHtml.match(/class="range-axis"[^>]*>(.*?)<\/div>/)[1];
assert.doesNotMatch(timeAxis, />-/, 'Observed finish-time ranges must not acquire negative padded times');
assert.doesNotMatch(rangeHtml, /class="range-zero"/, 'Do not place an off-scale zero reference on a finish-time range');
for (const text of ['10th percentile', '90th percentile', '3:25', '4:00', '4:42', '200']) assert.ok(rangeHtml.includes(text), 'The exact-values table must preserve ' + text);
const signedSpec = { ...rangeSpec, unit: '% change', rows: [{ label: 'Course A', low: -10, value: -2, high: 8 }] };
const signedHtml = render(QuestionViz, { spec: signedSpec });
assert.match(signedHtml, /class="range-zero"/);
assert.match(signedHtml, /class="range-zero-label"[^>]*>0%<\/span>/, 'The faster/slower reference needs a visible zero label');
assert.match(signedHtml, /Median: -2%/);
for (const match of signedHtml.matchAll(/(?:left|width):([\d.-]+)%/g)) assert.ok(Number(match[1]) >= 0 && Number(match[1]) <= 100, 'Range marks must stay inside their shared scale');
const alternativeKeys = { ...signedSpec, series: [{ key: 'p10', label: '10th percentile' }, { key: 'median', label: 'Median' }, { key: 'p90', label: '90th percentile' }], rows: [{ label: 'Course A', p10: -10, median: -2, p90: 8 }] };
assert.match(render(QuestionViz, { spec: alternativeKeys }), /class="range-chart"/);
assert.doesNotMatch(render(QuestionViz, { spec: { ...rangeSpec, series: [{ key: 'low', label: 'Lower confidence bound' }, { key: 'value', label: 'Estimate' }, { key: 'high', label: 'Upper confidence bound' }] } }), /class="range-chart"/, 'Confidence intervals must not be relabeled as runner percentiles');
assert.doesNotMatch(render(QuestionViz, { spec: { ...rangeSpec, rows: [{ label: 'Partial', low: null, value: 240, high: 282 }] } }), /class="range-span"/, 'Do not draw an invented range when an endpoint is missing');
assert.match(render(QuestionViz, { spec: { ...rangeSpec, rows: [] } }), /No published values for this selection/);
assert.match(render(QuestionViz, { spec: rangeSpec, headingLevel: 2 }), /<h2[^>]*>Recorded finish range<\/h2>/);

const profileAnswer = answers.find(answer => answer.id === 'profile');
const profileHtml = render(QuestionViz, { spec: profileAnswer.charts[0], unitSystem: 'km' });
assert.match(profileHtml, /40K–finish/, 'Sections are named by their mats (the redesign spec, section 3.10)');
assert.match(profileHtml, /Course section/);
const choices = Array.from({ length: 4 }, (_, index) => ({ ...rangeSpec, title: 'Comparison ' + (index + 1) }));
const buttonsHtml = render(AnalysisChart, { analysisId: 'example', charts: choices.slice(0, 2) });
assert.equal([...buttonsHtml.matchAll(/aria-pressed="true"/g)].length, 1);
assert.equal([...buttonsHtml.matchAll(/aria-pressed="false"/g)].length, 1);
assert.match(render(AnalysisChart, { analysisId: 'example', charts: choices }), /<select[^>]+aria-controls=/);
assert.match(render(AnalysisChart, { analysisId: 'empty', charts: [] }), /role="status"/);

// Analyses show insights only: method, definitions, coverage and sources live on /methodology (owner request, 2026-10-16).
for (const definition of TEN_ANALYSES) {
  for (const field of ['purpose', 'readChart', 'caution']) assert.ok(!(field in definition), `${definition.id}: no ${field} copy on the analysis page`);
  assert.ok(definition.dek && definition.dek.length <= 140, `${definition.id}: a short dek`);
}
assert.doesNotMatch(render(AnalysisChart, { analysisId: 'note', charts: [{ ...rangeSpec, note: 'METHOD NOTE' }] }), /METHOD NOTE/, 'Chart notes explain method; analyses show the chart only');
const METHOD_COPY = [/How we calculated this/, /How to read this/, /Keep in mind/, /Input data:/, /Read the full methods/, /marathons, years and data fields/,
  /requires earlier results/, /strictly earlier/, /15-minute band/, /strictly below this time/, /selects a 15-minute band/, /unit of evidence/,
  /at least 100/, /Runner comparison groups contain/, /source-quality rules/, /\d[\d,]* (?:complete |eligible |achieved )?finishes (?:across|in the displayed)/,
  /race editions\./, /historical intentions are unknown/, /not a confidence interval/, /Fewer than 100/, /middle 80% of complete finishes/, /Distances follow the recorded timing points/];
const { insightHeadline } = require('../components/AnalysisExplorer.tsx');
for (const definition of TEN_ANALYSES.filter(item => item.id !== 'opening')) {
  const answer = answers.find(item => item.id === definition.id);
  const html = render(AnalysisExplorer, { definition, summary, initialAnswer: answer, weatherQuestions: [] });
  for (const pattern of METHOD_COPY) assert.doesNotMatch(html, pattern, `${definition.id}: method or source copy belongs on /methodology (${pattern})`);
  // Untouched, the explorer never repeats the page's answer: no headline until the visitor changes the selection.
  assert.doesNotMatch(html, /class="explore-title"/, `${definition.id}: the untouched explorer has no headline of its own`);
  assert.match(html, /class="miy-chip"/, `${definition.id}: the selection row`);
  assert.doesNotMatch((html.match(/class="miy-chip-text">([^<]*)</) || [])[1] || '', /All ages|All early paces/, `${definition.id}: the selection row leaves out defaults`);
  // Headlines state what the chart shows, read from the same rows, in mat grammar (the redesign spec, section 6.4).
  const headline = insightHeadline(definition.id, answer, 240, 'mi');
  if (definition.id === 'sections') assert.match(headline, /^The two groups split most in the (?:\d+–\d+K|40K–finish) section, where finishes just over 4:00 took \d+:\d\d more than those just under\.$/);
  if (definition.id === 'age') assert.match(headline, /^Across \d+ age groups, the second 20K ranged from [\d.]+% (?:slower|faster) \([\d–+]+\) to [\d.]+% (?:slower|faster) \([\d–+]+\) than the first\.$/);
  if (definition.id === 'profile') assert.match(headline, /^Finishes near 4:00 ran \d+ s\/mi fast early and \d+ s\/mi slow late, against even pace\.$/);
  if (definition.id === 'ambition') assert.match(headline, /^\d+% of these finishes were under 4:00\.$/, 'whole percent, as the chart reads it');
  if (definition.id === 'courses') {
    assert.match(headline, /^Across \d+ courses, median finishes ranged from .+ than the same runners’ earlier bests\.$/);
    for (const city of summary.courses.map(row => row.city)) assert.ok(!headline.includes(city), 'The course headline names no course: one course at the top of a range is not a difficulty ranking');
  }
}
const checkpointHtml = render(CheckpointExplorer, { summary, profile: EXAMPLE_PROFILE });
for (const pattern of METHOD_COPY) assert.doesNotMatch(checkpointHtml, pattern, `checkpoint: method copy belongs on /methodology (${pattern})`);

// Every analysis page (the redesign spec, section 4.2, under section 00): it opens on its finding (the H1) and its
// question dek, then the answer, with the explorer's default result already drawn (never an empty state), inside the
// masked .analysis-layout, ending on the .analysis-pagination chapter end. No Recharts, no method copy.
const UnitsProvider = require('../components/UnitsProvider.tsx').default;
const AnalysisPage = require('../app/analyses/[slug]/page.tsx').default;
const page = (slug) => renderToStaticMarkup(React.createElement(UnitsProvider, null, React.createElement(AnalysisPage, { params: { slug } })));
for (const slug of [...TEN_ANALYSES.map(item => item.slug), 'downhill-start']) {
  const html = page(slug);
  const definition = analysisBySlug(slug);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${slug}: one H1`);
  const h1 = html.indexOf('<h1'), answer = html.indexOf('id="answer"'), explore = html.indexOf('id="explore"'), end = html.indexOf('analysis-pagination');
  assert.ok(h1 >= 0 && answer >= 0 && h1 > answer && explore > h1 && end > explore, `${slug}: the finding, then the explorer, then the chapter end`);
  if (definition) assert.ok(html.includes(definition.title.replace(/'/g, '&#x27;')), `${slug}: the question dek`);
  assert.match(html, /class="analysis-layout analysis-flow"/, `${slug}: the page sits in the masked .analysis-layout`);
  // The answer is a picture: a chart, a dot grid or a receipt inside the hero (critic round 2, October 18, 2026: the
  // chart that proves the finding sits in the night card, not below Make it yours). The explorer opens on its selection
  // row alone on every page (critic round 3, October 18, 2026: starting pace's example result gave a second "after 20K"
  // figure on another baseline than the receipt's), and it draws its chart once the visitor changes something.
  const hero = html.slice(answer, explore);
  assert.match(hero, /<figure class="viz|class="receipt/, `${slug}: the answer is a figure`);
  assert.doesNotMatch(html, /class="explore-results"/, `${slug}: the untouched explorer is its selection row`);
  assert.match(html, /class="miy-chip"/, `${slug}: the Make it yours selection row`);
  assert.doesNotMatch(html, /Not enough results|Too few comparable|Loading the|recharts/i, `${slug}: no empty, loading or Recharts state`);
  for (const pattern of METHOD_COPY) assert.doesNotMatch(html, pattern, `${slug}: method copy belongs on /methodology (${pattern})`);
  assert.ok((html.match(/<section[^>]*class="beat/g) || []).length <= 3, `${slug}: at most two beats and the explorer after the answer`);
}
// The weather questions became tabs: race-day weather draws them, and their old routes forward with the tab's hash.
{
  const html = page('race-day-weather');
  for (const tab of ['temperature', 'warming', 'wind']) assert.match(html, new RegExp(`<div class="weather-panel" data-tab="${tab}"`), `race-day-weather: the ${tab} tab`);
  // The hash picks a tab; no element carries its id, so a redirected visitor lands on the finding, not below it.
  for (const tab of ['temperature', 'warming', 'wind']) assert.doesNotMatch(html, new RegExp(`id="${tab}"`), `race-day-weather: no #${tab} anchor to jump to`);
  for (const [slug, hash] of [['warming-and-pacing', 'warming'], ['wind-and-pacing', 'wind']]) {
    const stub = page(slug);
    assert.match(stub, /This page has moved/, `${slug}: a moved stub`);
    assert.ok(stub.includes(`href="/analyses/race-day-weather#${hash}"`), `${slug}: links to the ${hash} tab`);
  }
}

async function verifyTransport() {
  const previousFetch = global.fetch;
  const requests = [];
  let reply = () => ({ city: 'Test course', cohorts: {}, terrain: [] });
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    const data = await reply(url, options);
    return { ok: true, json: async () => data };
  };
  const signal = new AbortController().signal;
  const load = (file, vintage, city = 'Test course') => loadAnalysisAggregate(file, city, vintage, signal);
  try {
    await assert.rejects(load('../city_01.json', 'invalid'), /not available/);
    assert.equal(requests.length, 0, 'Invalid filenames must never reach the network');
    const first = await load('city_01.json', '2026-09-11 12:00');
    assert.ok(requests[0].url.endsWith('city_01.json?v=2026-09-11%2012%3A00'));
    assert.equal(requests[0].options.signal, signal);
    assert.equal(await load('city_01.json', '2026-09-11 12:00'), first);
    assert.equal(requests.length, 1, 'An unchanged city and vintage reuse the aggregate');
    await load('city_01.json', 'new-vintage');
    assert.equal(requests.length, 2, 'A different vintage must not reuse stale data');
    await assert.rejects(load('city_01.json', 'new-vintage', 'Different course'), /incomplete/, 'The cache must never return the wrong course');
    reply = () => ({ city: 'Test course', cohorts: {} });
    await assert.rejects(load('city_02.json', 'retry'), /incomplete/);
    reply = () => ({ city: 'Test course', cohorts: {}, terrain: [] });
    await load('city_02.json', 'retry');
    assert.equal(requests.filter(request => request.url.includes('city_02.json')).length, 2, 'Malformed responses must allow a clean retry');
    reply = () => { throw new Error('Offline'); };
    await assert.rejects(load('city_03.json', 'retry'), /Offline/);
    reply = () => ({ city: 'Test course', cohorts: {}, terrain: [] });
    await load('city_03.json', 'retry');
    reply = () => ({ city: 'Test course', rows: [] });
    assert.deepEqual(await load('checkpoint_03.json', 'empty'), { city: 'Test course', rows: [] }, 'An empty valid checkpoint file is a coverage result, not a transport error');
    const controller = new AbortController();
    reply = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    });
    const pending = loadAnalysisAggregate('city_04.json', 'Test course', 'cancelled', controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    reply = () => ({ city: 'Test course', cohorts: {}, terrain: [] });
    await load('city_04.json', 'cancelled');
    assert.equal(requests.filter(request => request.url.includes('city_04.json')).length, 2, 'A cancelled request must not poison the next request');
  } finally {
    global.fetch = previousFetch;
  }
}

verifyTransport().then(() => {
  console.log('Verified the ten analysis routes, insight-only copy (no method, coverage or source text), shareable profile round trips, exact accessible chart values, range units, comparison controls, aggregate vintage isolation, cancellation and retry behavior.');
}).catch(error => { console.error(error); process.exitCode = 1; });
