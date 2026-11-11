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
// November 11, 2026: the renders of components/QuestionViz.tsx and components/AnalysisChart.tsx (the range chart's
// one visible number, no negative padded times, no off-scale zero, its exact-values table, a labelled zero on signed
// ranges, marks on one scale, other series keys, confidence bounds never drawn as runner percentiles, no invented range
// for a missing endpoint, the empty and h2 states, the profile's mat-named sections in km, the chart choice buttons and
// select, and the empty status) were removed with those components, which no page rendered since the October 18, 2026
// redesign (architecture review P1-6). The shipped pages are rendered below; the profile's mat names on the shipped
// /analyses/pacing-pattern are checked by verify-units.

// A failed load shows the loader's own words, never the browser's ("Failed to fetch"): design review D8, November 11, 2026.
{
  const { loadErrorText } = require('../lib/error-text.ts');
  const fallback = 'The comparison could not load.';
  assert.equal(loadErrorText(new TypeError('Failed to fetch'), fallback), fallback);
  assert.equal(loadErrorText(new SyntaxError('Unexpected end of JSON input'), fallback), fallback);
  assert.equal(loadErrorText(new DOMException('The operation was aborted.', 'AbortError'), fallback), fallback);
  assert.equal(loadErrorText('oops', fallback), fallback);
  assert.equal(loadErrorText(new Error('  '), fallback), fallback);
  assert.equal(loadErrorText(new Error('The runner data could not be verified. Please reload and try again.'), fallback), 'The runner data could not be verified. Please reload and try again.');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
  for (const file of walk('components')) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:setError|setFailure)\((?:reason|error|e)\.message\)|(?:reason|error|e) instanceof Error(?: && (?:reason|error|e)\.message)? \? (?:reason|error|e)\.message/, `${file}: a failed load's words go through loadErrorText (lib/error-text.ts)`);
  }
}

// Analyses show insights only: method, definitions, coverage and sources live on /methodology (owner request, 2026-10-16).
for (const definition of TEN_ANALYSES) {
  for (const field of ['purpose', 'readChart', 'caution']) assert.ok(!(field in definition), `${definition.id}: no ${field} copy on the analysis page`);
  assert.ok(definition.dek && definition.dek.length <= 140, `${definition.id}: a short dek`);
}
// Chart notes explain method; analyses show the chart only. November 11, 2026: re-pointed from the removed AnalysisChart
// render to the components that draw the analysis charts today, which never read a chart's note.
for (const file of ['components/AnalysisExplorer.tsx', 'components/analysis/ExplorerChart.tsx']) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\.note\b/, `${file}: chart notes stay on /methodology`);
const METHOD_COPY = [/How we calculated this/, /How to read this/, /Keep in mind/, /Input data:/, /Read the full methods/, /marathons, years and data fields/,
  /requires earlier results/, /strictly earlier/, /15-minute band/, /strictly below this time/, /selects a 15-minute band/, /unit of evidence/,
  /at least 100/, /Runner comparison groups contain/, /source-quality rules/, /\d[\d,]* (?:complete |eligible |achieved )?finishes (?:across|in the displayed)/,
  /race editions\./, /historical intentions are unknown/, /not a confidence interval/, /Fewer than 100/, /middle 80% of complete finishes/, /Distances follow the recorded timing points/];
const { insightHeadline } = require('../components/AnalysisExplorer.tsx');
/** The inner HTML of every night surface on a page (answer cards and receipts), matched to its closing </div>. */
function nightSurfaces(html) {
  const out = [];
  const open = /<div class="(?:answer-card|receipt) night[^"]*"[^>]*>/g;
  for (let m; (m = open.exec(html));) {
    const tags = /<\/?div\b[^>]*>/g; tags.lastIndex = m.index + m[0].length;
    let depth = 1, t;
    while (depth && (t = tags.exec(html))) depth += t[0][1] === '/' ? -1 : 1;
    out.push(html.slice(m.index + m[0].length, t ? t.index : html.length));
  }
  return out;
}
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
  // In the grammar of the page's own H1 (critic round 5, October 19, 2026), and measured against the page's example once
  // the selection differs from it.
  if (definition.id === 'sections') assert.match(headline, /^\d+% of the \d+:\d\d gap opened after 20K\.$/);
  if (definition.id === 'age') assert.match(headline, /^Across \d+ age groups, the second 20K ranged from [\d.]+% (?:slower|faster) \([\d–+]+\) to [\d.]+% (?:slower|faster) \([\d–+]+\) than the first\.$/);
  if (definition.id === 'profile') assert.match(headline, /^Near 4:00, finishes ran \d+ seconds a mile fast early and \d+ slow late\.$/);
  if (definition.id === 'ambition') assert.match(headline, /^\d+% of finishes were under 4:00\.$/, 'whole percent, as the chart reads it');
  const ref = { answer, goal: 240, city: 'All courses' };
  if (definition.id === 'profile') assert.match(insightHeadline('profile', answer, 240, 'mi', 'Berlin', undefined, ref), /^In Berlin, near 4:00, finishes ran \d+ seconds a mile fast early and \d+ slow late, against \d+ and \d+ on every course\.$/, 'profile: measured against the example');
  if (definition.id === 'sections') assert.match(insightHeadline('sections', answer, 240, 'mi', 'Berlin', undefined, ref), /^In Berlin, near 4:00, \d+% of the \d+:\d\d gap opened after 20K, against \d+% on every course\.$/, 'sections: measured against the example');
  if (definition.id === 'ambition') assert.match(insightHeadline('ambition', answer, 210, 'mi', 'All courses', undefined, ref), /^\d+% of finishes were under 3:30, against \d+% under 4:00\.$/, 'ambition: measured against the example');
  // Course comparison and race-day weather use the all-finisher explorer (verify-all-finisher-context-client pins their
  // headlines); this explorer has no course or temperature headline of its own (October 19, 2026).
}
const checkpointHtml = render(CheckpointExplorer, { summary, profile: EXAMPLE_PROFILE });
for (const pattern of METHOD_COPY) assert.doesNotMatch(checkpointHtml, pattern, `checkpoint: method copy belongs on /methodology (${pattern})`);

// Every analysis page (the redesign spec, section 4.2, under section 00): it opens on its finding (the H1) and its
// question dek, then the answer, with the explorer's default result already drawn (never an empty state), inside the
// masked .analysis-layout, ending on the .analysis-pagination chapter end. No Recharts, no method copy.
const UnitsProvider = require('../components/UnitsProvider.tsx').default;
const AnalysisPage = require('../app/analyses/[slug]/page.tsx').default;
const page = (slug) => renderToStaticMarkup(React.createElement(UnitsProvider, null, React.createElement(AnalysisPage, { params: { slug } })));
// The pages whose H1 is the finding alone, their setup clause moved into the dek in place of the question.
// WP9 round 4: checkpoint, finish-time context and downhill start state the fact their H1 needs (who passed the mat, the
// median, the three courses) in place of the question.
const DEK_SETUP = ['age-and-pacing', 'pacing-pattern', 'where-time-is-gained', 'finding-improvement', 'race-day-weather', 'hills-and-pacing', 'course-comparison', 'starting-pace', 'checkpoint', 'finish-time-context', 'downhill-start'];
for (const slug of [...TEN_ANALYSES.map(item => item.slug), 'downhill-start']) {
  const html = page(slug);
  const definition = analysisBySlug(slug);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${slug}: one H1`);
  const h1 = html.indexOf('<h1'), answer = html.indexOf('id="answer"'), explore = html.indexOf('id="explore"'), end = html.indexOf('analysis-pagination');
  assert.ok(h1 >= 0 && answer >= 0 && h1 > answer && explore > h1 && end > explore, `${slug}: the finding, then the explorer, then the chapter end`);
  // The dek is the question, or (where the H1 is one clause, WP9 round 2) the setup the finding needs: never empty.
  assert.match(html, /<p class="reading-dek">[^<]+/, `${slug}: a dek under the H1`);
  if (definition && !html.includes(definition.title.replace(/'/g, '&#x27;'))) assert.ok(DEK_SETUP.includes(slug), `${slug}: the question dek, or a setup clause it is listed for`);
  assert.match(html, /class="analysis-layout analysis-flow"/, `${slug}: the page sits in the masked .analysis-layout`);
  // The answer is a picture: a chart, a dot grid or a receipt inside the hero (critic round 2, October 18, 2026: the
  // chart that proves the finding sits in the night card, not below Make it yours). The explorer opens on its selection
  // row alone on every page (critic round 3, October 18, 2026: starting pace's example result gave a second "after 20K"
  // figure on another baseline than the receipt's), and it draws its chart once the visitor changes something.
  const hero = html.slice(answer, explore);
  assert.match(hero, /<figure class="viz|class="receipt/, `${slug}: the answer is a figure`);
  // The night card holds the answer only: its "All numbers" sits on paper under it (critic round 5, October 19, 2026).
  const nights = nightSurfaces(html);
  assert.ok(nights.length >= 1 && nights.every((inside) => /<figure class="viz|receipt-/.test(inside)), `${slug}: the answer is on a night card`);
  for (const inside of nights) assert.doesNotMatch(inside, /class="values[ "]/, `${slug}: no "All numbers" inside a night card`);
  assert.doesNotMatch(html, /class="explore-results"/, `${slug}: the untouched explorer is its selection row`);
  assert.match(html, /class="miy-chip"/, `${slug}: the Make it yours selection row`);
  assert.doesNotMatch(html, /Not enough results|Too few comparable|Loading the|recharts/i, `${slug}: no empty, loading or Recharts state`);
  for (const pattern of METHOD_COPY) assert.doesNotMatch(html, pattern, `${slug}: method copy belongs on /methodology (${pattern})`);
  assert.ok((html.match(/<section[^>]*class="beat/g) || []).length <= 3, `${slug}: at most two beats and the explorer after the answer`);
}
// A null looks null (round 6): a null finding's H1 accent is ink italic (em.is-null), never the signal, on every page
// that sets it as its title (lib/nuggets/analyses.ts NULL_FINDINGS).
{
  const { NULL_FINDINGS } = require('../lib/nuggets/analyses.ts');
  const { getNugget } = require('../lib/nuggets/index.ts');
  assert.ok(NULL_FINDINGS.includes('downhill.opening') && NULL_FINDINGS.includes('weather.wind'), 'the two nulls are listed');
  for (const id of NULL_FINDINGS) {
    const n = getNugget(id);
    const slug = n.page.replace(/^\/analyses\//, '').replace(/#.*$/, '');
    if (n.page.includes('#')) {
      // A tab's finding is the H1 only once its tab is chosen (TabTitle renders the first tab on the server): the tab's
      // title is the null's Say, set quiet from the same list.
      const React = require('react');
      const { renderToStaticMarkup } = require('react-dom/server');
      const { Say } = require('../components/analysis/Shell.tsx');
      if (n.guard) assert.match(renderToStaticMarkup(React.createElement(Say, { nugget: n, quiet: true })), /<em class="is-null">/, `${id}: its quiet Say sets the null's ink italic`);
      assert.match(fs.readFileSync('components/analysis/pages/RaceDayWeather.tsx', 'utf8'), /quiet=\{NULL_FINDINGS\.includes\(nuggets\[id\]\.id\)\}/, `${id}: the weather tab's H1 is set quiet from NULL_FINDINGS`);
      continue;
    }
    const html = page(slug);
    const accents = [...html.matchAll(/<em( class="[^"]*")?>/g)].filter((m) => html.lastIndexOf('<h1', m.index) > html.lastIndexOf('</h1>', m.index));
    if (n.guard) assert.ok(accents.length && accents.some((m) => /is-null/.test(m[1] || '')), `${id}: its H1 accent on /analyses/${slug} is the null's ink italic`);
  }
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
  console.log('Verified the ten analysis routes, insight-only copy (no method, coverage or source text), shareable profile round trips, aggregate vintage isolation, cancellation and retry behavior.');
}).catch(error => { console.error(error); process.exitCode = 1; });
