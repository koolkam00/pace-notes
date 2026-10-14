const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args); };
const policy = require('../lib/analytics-policy.ts');
const replayPath = require.resolve('../lib/replay-policy.ts');
const replay = require(replayPath);

// The SDK's random IDs (uuidv7): the tab's anonymous distinct_id and the session and window IDs that link a recording.
const TAB_ID = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b', SESSION_ID = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2c', WINDOW_ID = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2d';
const dirty = { event: '$pageview', uuid: 'test-event', $set: { email: 'private@example.com' }, $set_once: { name: 'Private Name' }, properties: {
  token: 'test-project', distinct_id: TAB_ID, $session_id: SESSION_ID, $window_id: WINDOW_ID, $device_id: 'private-device',
  $current_url: 'https://splithappens.run/runners?q=Private+Name&email=private@example.com#123',
  $referrer: 'https://www.google.com/search?q=Private+Name', $pathname: '/runners',
  $raw_user_agent: 'Mozilla/5.0 AnalyticsVerification/1.0',
  $initial_current_url: 'https://splithappens.run/?q=Private+Name', $session_entry_url: 'https://splithappens.run/?q=Private+Name',
  $set: { email: 'private@example.com' }, $set_once: { $initial_person_info: { email: 'private@example.com' } },
  q: 'Private Name', name: 'Private Name', record_id: 123, age: 40, $browser: 'Chrome', $device_type: 'Desktop',
} };
const clean = policy.sanitizeAnalyticsEvent(dirty);
assert.equal(clean.properties.$current_url, 'https://splithappens.run/runners');
assert.equal(clean.properties.$referrer, 'https://www.google.com');
assert.equal(clean.properties.$referring_domain, 'www.google.com');
assert.equal(clean.properties.$cookieless_mode, undefined, 'Recording needs session IDs, so events are no longer cookieless');
assert.equal(clean.properties.distinct_id, TAB_ID, 'The SDK keeps its random per-tab ID');
assert.equal(clean.properties.$session_id, SESSION_ID, 'Events keep the session ID that links them to a recording');
assert.equal(clean.properties.$window_id, WINDOW_ID);
assert.equal(clean.properties.$raw_user_agent, dirty.properties.$raw_user_agent);
assert.equal(clean.properties.$host, 'splithappens.run');
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, properties: { ...dirty.properties, $raw_user_agent: { name: 'Private Name' } } }).properties.$raw_user_agent, undefined);
for (const key of ['distinct_id', '$session_id', '$window_id']) {
  assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, properties: { ...dirty.properties, [key]: 'private@example.com' } }), null, `An event whose ${key} is not an SDK random ID is dropped`);
  assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, properties: { ...dirty.properties, [key]: undefined } }), null, `An event without ${key} is dropped`);
}
assert.equal(clean.properties.$process_person_profile, false);
assert.doesNotMatch(JSON.stringify(clean), /Private|private@|record_id|initial_current_url|session_entry_url|private-device/);
assert.equal(dirty.properties.q, 'Private Name', 'Sanitizing must not mutate the caller');
for (const event of ['$autocapture', '$identify', '$exception', '$rageclick', '$dead_click', '$web_vitals', 'unknown', 'constructor']) assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event }), null);
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event: '$snapshot', properties: { ...dirty.properties, $snapshot_data: [{ type: 4, data: { href: 'https://splithappens.run/' } }] } }), null, 'The event allowlist alone drops every recording chunk');
assert.equal(replay.sanitizeEvent({ ...dirty, event: '$snapshot' }), null, 'A $snapshot without recording data is dropped');
assert.equal(replay.sanitizeEvent(dirty).properties.$current_url, 'https://splithappens.run/runners', 'Once loaded, the replay module sends other events through the same allowlist');
assert.equal(policy.analyticsPath('/analyses/starting-pace?age=35#private'), '/analyses/starting-pace');
assert.equal(policy.analyticsPath('/htw-live-study/analyses/starting-pace?age=35#private', '/htw-live-study'), '/analyses/starting-pace');
assert.equal(policy.analyticsPath('/htw-live-study/', '/htw-live-study'), '/');
assert.equal(policy.analyticsPath('/htw-live-study-other/runners', '/htw-live-study'), '/other');
assert.equal(policy.analyticsPath('/unknown/Private-Name'), '/other');
assert.equal(policy.analyticsPath('/courses/Private-Name'), '/courses');
assert.equal(policy.analyticsPath('/tools/split-check?s=0:25:00,0:50:00#x'), '/tools/split-check', 'Tool pages keep their path, never their inputs');
assert.equal(policy.analyticsPath('/tools/qualifying?born=1990-01-01'), '/tools/qualifying');
assert.equal(policy.analyticsPath('/tools/Private-Name'), '/other');

// The search pages keep their own clean path; their inputs never survive. Lists come from the pages' own sources.
const { GOAL_PAGE_MINUTES, goalPagePath } = require('../lib/tools/pace-chart.ts');
const { STANDARDS } = require('../lib/tools/qualifying.ts');
const searchPages = ['/tools/marathon-pace-chart', '/tools/half-marathon-pace-chart', '/finish-times', ...GOAL_PAGE_MINUTES.map(goalPagePath), ...STANDARDS.map(s => '/tools/qualifying/' + s.key)];
assert.ok(GOAL_PAGE_MINUTES.length >= 5 && STANDARDS.length >= 6, 'The goal and qualifying race lists loaded');
for (const page of searchPages) {
  assert.equal(policy.analyticsPath(page), page, `${page} keeps its path`);
  assert.equal(policy.analyticsPath(`https://splithappens.run${page}/?units=km&goal=4:00&born=1990-01-01#cutoffs`), page, `${page} drops its query, fragment and trailing slash`);
  const event = policy.sanitizeAnalyticsEvent({ ...dirty, properties: { ...dirty.properties, $current_url: `https://splithappens.run${page}?q=Private+Name#x`, $pathname: page } });
  assert.equal(event.properties.$current_url, 'https://splithappens.run' + page);
  assert.equal(event.properties.$pathname, page);
}
for (const unknown of ['/tools/marathon-pace/3-15', '/tools/marathon-pace/Private-Name', '/tools/marathon-pace', '/tools/qualifying/Private-Name', '/finish-times/Private-Name']) assert.equal(policy.analyticsPath(unknown), '/other', `${unknown} is not a known page`);

// Every page in the sitemap is recorded under its own path, or its section's for courses, stories and packs; none falls to /other.
process.chdir(path.join(__dirname, '..')); // lib/insights-server.ts reads public/data from the working directory, as next build does.
const { sitemapEntries, EXTRA_SITEMAP_PAGES } = require('../lib/seo-routes.ts');
for (const { path: page } of EXTRA_SITEMAP_PAGES) assert.ok(searchPages.includes(page), `${page} is a registered search page; add it to this check and to lib/analytics-policy.ts`);
const sections = ['/courses', '/stories', '/packs'];
const sitemap = sitemapEntries();
for (const { path: page } of sitemap) {
  const section = sections.find(root => page.startsWith(root + '/'));
  assert.equal(policy.analyticsPath(page), section ?? page, `sitemap page ${page} is recorded as ${section ?? 'itself'}`);
}
assert.equal(policy.referringDomain('javascript:alert(1)'), '');
assert.equal(policy.downloadDestination('https://github.com/koolkam00/htw-live-study/releases/tag/example'), 'release');
assert.equal(policy.downloadDestination('/data/weather/evidence.json'), 'site_data');
assert.equal(policy.downloadDestination('https://evil.example/data/x.json'), null);
assert.equal(policy.downloadDestination('https://github.com/koolkam00/htw-live-study/releases-malicious'), null);
const action = policy.sanitizeAnalyticsEvent({ ...dirty, event: 'analysis_filters_applied', properties: { ...dirty.properties, analysis: 'opening', course_scope: 'single', goal: 240, previous: 210 } });
assert.equal(action.properties.analysis, 'opening');
assert.equal(action.properties.course_scope, 'single');
assert.equal(action.properties.goal, undefined);
assert.equal(action.properties.previous, undefined);
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event: 'runner_search_completed', properties: { ...dirty.properties, outcome: 'Private Name' } }).properties.outcome, undefined);

// Session replay: blocked pages, page addresses and DOM attributes.
for (const page of ['/runners', '/your-race', '/runners/', '/RUNNERS', '/runners/Private-Name', '/your-race?age=40#guide', 'https://www.splithappens.run/runners?q=Private+Name']) {
  assert.equal(policy.recordingBlocked(page), true, `${page} is never recorded`);
}
assert.equal(policy.recordingBlocked('/htw-live-study/runners', '/htw-live-study'), true, 'Blocked pages are found under a base path');
for (const page of ['/', '/tools/qualifying', '/analyses', '/runnersclub', '/privacy', '/tools/split-check?s=0:24:11,0:48:33&course=boston', '/tools/split-check?via=other']) assert.equal(policy.recordingBlocked(page), false, `${page} can be recorded`);
// A link from a runner's profile carries that runner's times, so the page it opens is never recorded.
const handoff = policy.runnerHandoffHref('/tools/split-check?s=0:36:33,1:12:57,1:52:01,2:32:22,3:16:40,4:00:35,4:44:20,5:28:08,5:46:49&course=london');
assert.equal(handoff, '/tools/split-check?s=0:36:33,1:12:57,1:52:01,2:32:22,3:16:40,4:00:35,4:44:20,5:28:08,5:46:49&course=london&via=runner');
assert.equal(policy.runnerHandoffHref('/analyses/pacing-pattern'), '/analyses/pacing-pattern?via=runner');
for (const page of [handoff, handoff + '&units=km', 'https://splithappens.run/analyses/pacing-pattern?race=London&goal=347&age=all&gender=all&via=runner#comparison', '/tools/split-check?via=runner']) assert.equal(policy.recordingBlocked(page), true, `${page} (runner handoff) is never recorded`);
assert.equal(replay.replayPageUrl('https://www.splithappens.run/tools/qualifying?t=3:29:00&born=1990-01-01#cards'), 'https://splithappens.run/tools/qualifying');
assert.equal(replay.replayPageUrl('http://127.0.0.1:4300/htw-live-study/analyses/starting-pace?age=35', '/htw-live-study'), 'https://splithappens.run/analyses/starting-pace');
assert.equal(replay.replayPageUrl('/runners/Private-Name?q=Private'), 'https://splithappens.run/runners', 'A blocked page keeps its own path, never /other');
assert.equal(replay.replayPageUrl('/unknown/Private-Name'), 'https://splithappens.run/other');
assert.equal(replay.replayPageUrl(handoff), 'https://splithappens.run/tools/split-check', 'Recorded page addresses never carry a query string');
assert.equal(replay.recorderPageUrl(handoff), 'https://splithappens.run/tools/split-check?via=runner', 'The recorder keeps only the handoff marker, so the sanitizer recognizes the page');
assert.equal(replay.recorderPageUrl('/tools/split-check?s=0:24:11,0:48:33#main'), 'https://splithappens.run/tools/split-check');
// Once a tab has opened a handoff page, a page that keeps a query stays unrecorded until one without a query opens:
// a filter change or an onward link can drop the marker but keep the runner's race and times.
assert.equal(replay.pageRecordable('/tools'), true);
assert.equal(replay.pageRecordable(handoff), false, 'A runner handoff page is not recorded');
for (const page of ['/analyses/pacing-pattern?race=Washington&goal=335&age=35%E2%80%9339&gender=all', '/analyses/starting-pace?opening=fast5&race=Washington&gender=Men', '/tools/pace-band?goal=335']) {
  assert.equal(replay.pageRecordable(page), false, `${page} after a runner handoff is not recorded`);
  assert.equal(replay.recorderPageUrl(page), 'https://splithappens.run' + new URL(page, 'https://splithappens.run').pathname + '?via=runner', `${page}: the recorder marks it, so the sanitizer drops it`);
}
assert.equal(replay.pageRecordable('/stories?units=km'), true, 'A page whose only query is the units choice ends the handoff');
assert.equal(replay.pageRecordable(handoff), false);
assert.equal(replay.pageRecordable('/stories'), true, 'Opening a page without a query ends the handoff');
// The handoff is noted when the page opens, before the recorder is ready: a quick filter change cannot hide it.
policy.noteRunnerHandoff('https://splithappens.run/analyses/pacing-pattern?race=London&goal=347&age=all&gender=all&via=runner');
assert.equal(replay.pageRecordable('/analyses/pacing-pattern?race=London&goal=347&age=35-39&gender=all'), false, 'A handoff noted at page load still blocks the page after a filter change');
assert.equal(replay.pageRecordable('/tools'), true);
assert.equal(replay.pageRecordable('/tools/split-check?s=0:24:11&course=boston'), true, "The visitor's own tool link is recorded again");
assert.equal(replay.recorderPageUrl('/tools/split-check?s=0:24:11&course=boston'), 'https://splithappens.run/tools/split-check');
// Links and sources: everything from the first ? or # goes, whatever follows it (commas included); site links become the
// clean page address.
const splitLink = 'https://splithappens.run/tools/split-check?s=0:24:11,0:48:33,1:12:57,1:37:29,2:02:14,2:27:41,2:54:02,3:20:47,3:33:19&course=boston#main';
assert.equal(replay.replayAttribute('href', splitLink), 'https://splithappens.run/tools/split-check');
assert.equal(replay.replayAttribute('href', splitLink, false, 'a'), 'https://splithappens.run/tools/split-check');
assert.equal(replay.replayAttribute('href', 'https://splithappens.run/runners?q=Smith, Clara', false, 'A'), 'https://splithappens.run/runners');
assert.equal(replay.replayAttribute('href', 'https://splithappens.run/runners?q=Smith,Clara'), 'https://splithappens.run/runners');
assert.equal(replay.replayAttribute('href', '/tools/pace-calculator?t=3:30:00#result'), '/tools/pace-calculator');
assert.equal(replay.replayAttribute('href', '/tools/pace-calculator?t=3:30:00#result', false, 'a'), 'https://splithappens.run/tools/pace-calculator');
assert.equal(replay.replayAttribute('href', 'https://www.splithappens.run/courses/berlin?units=km', false, 'a'), 'https://splithappens.run/courses');
assert.equal(replay.replayAttribute('action', '/runners?q=Smith, Clara', false, 'form'), 'https://splithappens.run/runners');
assert.equal(replay.replayAttribute('href', 'https://github.com/koolkam00/htw-live-study/releases?q=Smith, Clara#x', false, 'a'), 'https://github.com/koolkam00/htw-live-study/releases', 'Other sites keep their path, never a query');
assert.equal(replay.replayAttribute('href', 'mailto:someone@example.com?subject=Analysis&body=Private%20Name', false, 'a'), 'mailto:someone@example.com');
assert.equal(replay.replayAttribute('href', '/_next/static/css/app.css?v=1', false, 'link'), '/_next/static/css/app.css', 'Stylesheets keep their own address');
assert.equal(replay.replayAttribute('srcset', '/a.png?x=1 1x, /b.png?y=2 2x'), '/a.png 1x, /b.png 2x');
assert.equal(replay.replayAttribute('srcset', '/a.png?s=0:24:11,0:48:33 1x, /b.png?q=Smith,Clara 2x'), '/a.png 1x, /b.png 2x');
assert.equal(replay.replayAttribute('data-href', '/tools/split-check?s=0:24:11,0:48:33, 3:33:19'), '/tools/split-check', 'A URL in another attribute loses its query, whatever follows');
assert.equal(replay.replayAttribute('data-share', 'Copy /tools/split-check?s=0:24:11,0:48:33 now'), 'Copy /tools/split-check now', 'Relative site URLs in text lose their query');
assert.equal(replay.replayAttribute('style', 'background:url(https://splithappens.run/x.png?id=123)'), 'background:url(https://splithappens.run/x.png)');
assert.equal(replay.replayAttribute('style', 'width: 37.5%'), 'width: 37.5%');
// Masked regions: descriptive and state attributes keep no length or value, and inline styles (bar widths) go.
assert.equal(replay.replayAttribute('aria-label', '3:29:00 qualifies', true), '***', 'Masked regions mask descriptive attributes');
for (const [name, value] of [['aria-pressed', 'true'], ['aria-pressed', 'false'], ['aria-checked', 'true'], ['aria-selected', 'false'], ['aria-current', 'page'], ['value', 'Women'], ['data-goal', '227'], ['title', 'Non-binary']]) {
  assert.equal(replay.replayAttribute(name, value, true), '***', `${name}="${value}" is masked to a fixed placeholder`);
}
assert.equal(replay.replayAttribute('style', 'left: 12%; width: 31.4%', true), '', 'Inline styles in masked regions are removed');
assert.equal(replay.replayAttribute('aria-label', 'Open the menu'), 'Open the menu');
assert.equal(replay.replayAttribute('aria-pressed', 'true'), 'true', 'Outside masked regions, controls keep their state');
let lookedUp = 0;
assert.equal(replay.replayAttribute('d', 'M70.6 60.4 L131.7 58.9', () => { lookedUp++; return true; }), 'M70.6 60.4 L131.7 58.9');
assert.equal(lookedUp, 0, 'The masked region is only looked up for attributes that can be masked');
assert.equal(replay.maskText('Women'), '***'); assert.equal(replay.maskText('Non-binary'), '***'); assert.equal(replay.maskText('  '), '  ');
const maskedSelectors = replay.REPLAY_MASKED_TEXT.split(', ');
for (const selector of ['.tool-workspace', '.analysis-layout', '.personalized-guide', '.which-card', '.finish-lookup', '[role="status"]', '[role="alert"]', '[aria-live]']) assert.ok(maskedSelectors.includes(selector), `${selector} text is masked in replays`);
const blockedSelectors = replay.REPLAY_BLOCKED_ELEMENTS.split(', ');
for (const selector of ['.tool-results', '.tool-workspace svg', '.analysis-layout svg', '.personalized-guide svg', '.which-card svg', '.finish-lookup svg', '.viz svg', '.replay']) assert.ok(blockedSelectors.includes(selector), `${selector} is left out of replays`);

// The replay policy is not in a page's initial JavaScript: analytics-policy.ts (imported by every page) has none of it,
// and replay-policy.ts is only ever loaded by the SDK's dynamic import.
const policySource = fs.readFileSync(path.join(__dirname, '../lib/analytics-policy.ts'), 'utf8');
assert.doesNotMatch(policySource, /sanitizeReplayData|replayAttribute|replayPageUrl|REPLAY_MASKED_TEXT|\$snapshot_data|maskAttributeFn/, 'analytics-policy.ts holds no snapshot sanitizer or recording options');
const sourceFiles = dir => fs.readdirSync(path.join(__dirname, '..', dir), { recursive: true }).filter(file => /\.(ts|tsx)$/.test(file)).map(file => path.join(dir, file));
for (const file of [...sourceFiles('components'), ...sourceFiles('app'), ...sourceFiles('lib')]) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.doesNotMatch(source, /^import\s(?!type\s)[^;]*['"](?:@\/lib\/|\.\/|\.\.\/)*(?:lib\/)?replay-policy['"]/m, `${file} must not import replay-policy statically`);
}

// Each masked region, results panel and runner-name container is still on the element that needs it, file by file, as a
// whole class token, so a rename or a removed class cannot silently unmask it.
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const classStrings = source => [...source.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)].map(m => m[1] ?? m[2] ?? m[3]);
const hasClass = (source, token) => classStrings(source).some(value => new RegExp(`(?<![\\w-])${token}(?![\\w-])`).test(value));
const hasClasses = (source, ...tokens) => classStrings(source).some(value => tokens.every(token => new RegExp(`(?<![\\w-])${token}(?![\\w-])`).test(value)));
const { TOOLS } = require('../lib/tools/registry.ts');
const toolComponents = TOOLS.map(tool => {
  const page = read(`app/tools/${tool.slug}/page.tsx`);
  const component = [...page.matchAll(/^import (\w+)[^;]* from '@\/components\/tools\/(\w+)'/gm)].map(m => `components/tools/${m[2]}.tsx`).find(file => /useQueryState[<(]/.test(read(file)));
  assert.ok(component, `/tools/${tool.slug} renders a tool component`);
  return component;
});
assert.equal(new Set(toolComponents).size, TOOLS.length, 'Every registered tool has its own component');
const required = { 'tool-workspace': toolComponents, 'tool-results': toolComponents,
  'analysis-layout': ['components/AnalysisExplorer.tsx', 'components/AllFinisherAnalysis.tsx', 'components/FastStartAnalysis.tsx', 'components/WeatherAnalysis.tsx'],
  'personalized-guide': ['components/PersonalizedGuide.tsx'], 'which-card': ['components/story/ArchetypeStory.tsx'], 'finish-lookup': ['components/story/FinishTimeStory.tsx'] };
for (const [token, files] of Object.entries(required)) {
  for (const file of files) assert.ok(hasClass(read(file), token), `${file} still renders .${token}`);
  assert.ok(maskedSelectors.includes('.' + token) || blockedSelectors.includes('.' + token), `.${token} is masked or left out`);
}
// Every tool input sits in a component that renders the masked workspace.
for (const file of sourceFiles('components/tools')) {
  const source = read(file);
  if (file.endsWith('ui.tsx') || !/<(?:input|textarea|select|DurationField)\b/.test(source)) continue;
  assert.ok(toolComponents.includes(file) && hasClass(source, 'tool-workspace'), `${file} has form fields outside a .tool-workspace`);
}
// Status lines, alerts and live regions are masked by attribute wherever they are, so none may set its role dynamically.
for (const file of [...sourceFiles('components')]) assert.doesNotMatch(read(file), /role=\{[^}]*['"](?:status|alert)['"]|aria-live=\{/, `${file}: write role="status"/"alert" and aria-live as plain attributes so replay masks them`);
// Runner names and search text: ph-no-capture on the very element, as a class token.
const runnerSearch = read('components/RunnerSearch.tsx');
for (const container of ['runner-search-form', 'runner-results', 'runner-selection']) assert.ok(hasClasses(runnerSearch, container, 'ph-no-capture'), `RunnerSearch: .${container} carries ph-no-capture`);
const tags = source => [...source.matchAll(/<\w+\s[^<>]*>/g)].map(m => m[0]);
for (const attribute of ['id="runner-profile"', 'ref={analysisRef}']) {
  const tag = tags(runnerSearch).find(t => t.includes(attribute));
  assert.ok(tag && hasClass(tag, 'ph-no-capture'), `RunnerSearch: the ${attribute} element carries ph-no-capture`);
}
const runnerContext = read('components/RunnerContext.tsx');
assert.ok(hasClasses(runnerContext, 'runner-context', 'ph-no-capture'), 'RunnerContext carries ph-no-capture');
// Every link from a runner's profile to another page of the site carries the handoff marker (the others are sources).
const contextLinks = [...runnerContext.matchAll(/<(UnitLink|Link|a)\s[^<>]*?href=\{([^}]*)/g)].filter(m => m[1] !== 'a' || !/source_url$/.test(m[2].trim())).map(m => m[2].trim());
assert.ok(contextLinks.length >= 2, 'RunnerContext links found');
for (const link of contextLinks) assert.match(link, /^runnerHandoffHref\(/, `RunnerContext link ${link.slice(0, 40)} is marked as a runner handoff`);
for (const file of sourceFiles('components')) if (/splitCheckHref\(/.test(read(file))) assert.match(read(file), /runnerHandoffHref\(/, `${file} builds a split-check link from a runner's times without the handoff marker`);
assert.match(read('lib/analytics.ts'), /export function trackPage[^}]*?noteRunnerHandoff\([^}]*?syncRecording/, 'trackPage notes a runner handoff before anything waits for the SDK or the recorder');
// The projector's saved runner cards show the visitor's labels, mat times and start clocks outside its workspace.
assert.ok(hasClasses(read('components/tools/Projector.tsx'), 'projector-cards', 'ph-no-capture'), 'Projector: the saved runner cards carry ph-no-capture');
assert.ok(blockedSelectors.includes('.projector-cards'), 'The saved runner cards are left out of replays');
// A page that crashes sends no analytics. Older Safari crashes on a lookbehind or a newer built-in anywhere in the page's
// JavaScript, so the shared check (npm run verify:compat) covers every browser source file, not only the analytics ones.
const compat = require('./verify-browser-compat.cjs');
const compatProblems = compat.sourceProblems().problems;
assert.equal(compatProblems.length, 0, compat.describe(compatProblems));
// The course chooser's list of every course follows the visitor's goal, outside its workspace.
const courseChooser = read('components/tools/CourseChooser.tsx');
assert.ok(hasClasses(courseChooser, 'course-chooser-list', 'ph-no-capture') && hasClasses(courseChooser, 'tool-callout', 'ph-no-capture'), 'CourseChooser: the course list and pace-band callout carry ph-no-capture');
assert.match(courseChooser, /<div className="ph-no-capture">\s*<EvidencePanel kind="data" title=\{`Not published at \$\{goalText\}`\}/, 'CourseChooser: the not-published panel sits in a ph-no-capture element');
assert.ok(blockedSelectors.includes('#recharts_measurement_span'), "Recharts' text-measuring span is left out");
// The gender and division choices are left out of replays.
for (const [file, label] of [['components/tools/QualifyingChecker.tsx', 'Division'], ['components/tools/SplitCheck.tsx', 'Recorded gender'], ['components/tools/PaceBand.tsx', 'Recorded gender']]) {
  const match = read(file).match(new RegExp(`<div\\s[^<>]*><Choice label="${label}"`));
  assert.ok(match && hasClass(match[0], 'ph-no-capture'), `${file}: the ${label} choice sits in a ph-no-capture element`);
}

const freshReplay = () => { delete require.cache[replayPath]; return require(replayPath); };
const replayPolicy = freshReplay();
const meta = (href, timestamp = 1) => ({ type: 4, data: { href, width: 1280, height: 800 }, timestamp });
const custom = (tag, payload, timestamp = 1) => ({ type: 5, data: { tag, payload }, timestamp });
const element = (tagName, attributes, childNodes = []) => ({ type: 2, tagName, attributes, childNodes, id: Math.floor(Math.random() * 1e6) });
const text = textContent => ({ type: 3, textContent, id: Math.floor(Math.random() * 1e6) });
const fullSnapshot = (...children) => ({ type: 2, data: { node: { type: 0, childNodes: [element('html', {}, [element('body', {}, children)])] }, initialOffset: { top: 0, left: 0 } }, timestamp: 2 });
const snapshot = (data, extra = {}) => ({ event: '$snapshot', uuid: 'snapshot-event', timestamp: new Date(), properties: {
  token: 'test-project', distinct_id: TAB_ID, $session_id: SESSION_ID, $window_id: WINDOW_ID, $snapshot_bytes: 999, $snapshot_host: 'preview.vercel.app',
  $lib: 'web', $lib_version: '1.433.10', $config_defaults: '2026-05-30', $cookieless_mode: true, $sdk_debug_replay_unstringifiable_events_dropped: 1,
  name: 'Private Name', $current_url: 'https://splithappens.run/?q=Private', $snapshot_data: data, ...extra,
} });
assert.equal(replayPolicy.sanitizeEvent(snapshot([fullSnapshot(text('Before any page'))])), null, 'Until a Meta event names the page, nothing is sent');
const homeData = [
  meta('https://splithappens.run/tools/qualifying?t=3:29:00&born=1990-01-01#cards'),
  fullSnapshot(
    // rrweb resolves the skip link and every in-page # link to the full current address, query string included.
    element('a', { class: 'skip-link', href: 'https://splithappens.run/tools/split-check?s=0:24:11,0:48:33,1:12:57,1:37:29,2:02:14,2:27:41,2:54:02,3:20:47,3:33:19&course=boston#main' }, [text('Skip to content')]),
    element('a', { href: '/runners?q=Smith,Clara#r', 'aria-label': 'Find your races' }, [text('Find your races')]),
    element('a', { href: 'https://splithappens.run/runners?q=Smith, Clara' }, [text('Search again')]),
    element('a', { href: 'https://mail.google.com/mail/?view=cm&to=someone%40example.com&body=Private%20Name' }, [text('Open draft in Gmail')]),
    element('img', { src: '/art/course.png?record=123', srcset: '/a.png?x=1 1x, /b.png?q=Smith,Clara 2x', rr_dataURL: 'data:image/png;base64,UHJpdmF0ZQ==' }),
    element('link', { rel: 'stylesheet', href: '/_next/static/css/app.css', _cssText: 'body{color:red}' }),
    element('input', { type: 'checkbox', checked: true }), element('select', {}, [element('option', { value: 'Women', selected: true }, [text('Women')])]),
    element('div', { 'data-link': '/tools/split-check?s=0:24:11,0:48:33, 3:33:19' }),
    text('Share https://splithappens.run/tools/pace-calculator?t=3:30:00 with a friend, or /tools/predictor?r=1:45:00'),
  ),
  { type: 3, data: { source: 0, texts: [{ id: 1, value: 'See https://splithappens.run/tools/predictor?r=1:45:00#x' }], attributes: [{ id: 2, attributes: { href: '/tools/split-check?s=0:25:00,0:50:00,3:33:19', style: { color: 'red' }, title: null, checked: true } }], removes: [], adds: [{ parentId: 1, nextId: null, node: element('a', { href: '/finish-times?goal=3:30#cutoffs' }, [text('Finish times')]) }] }, timestamp: 3 },
  { type: 3, data: { source: 5, text: '1990-01-01', isChecked: false, id: 7 }, timestamp: 4 },
  { type: 3, data: { source: 5, text: 'on', isChecked: true, id: 8 }, timestamp: 4 },
  { type: 3, data: { source: 2, type: 2, id: 7, x: 10, y: 20 }, timestamp: 5 },
  { type: 3, data: { source: 9, id: 9, type: 0, commands: [{ property: 'fillText', args: ['Private Name', 0, 0] }] }, timestamp: 5 },
  { type: 6, data: { plugin: 'rrweb/console@1', payload: { level: 'log', payload: ['"Private Name"'] } }, timestamp: 6 },
  { type: 6, data: { plugin: 'rrweb/network@1', payload: { requests: [{ name: 'https://splithappens.run/data/runners/profiles/123.json' }] } }, timestamp: 6 },
  custom('$url_changed', { href: 'https://splithappens.run/tools/pace-calculator?t=3:30:00#result' }, 7),
  custom('$pageview', { href: 'https://splithappens.run/tools/pace-calculator?t=3:30:00' }, 7),
  custom('$json_ld', { '@type': 'Person', name: 'Private Name' }, 7),
  { type: 2, cv: '2024-10', data: 'H4sIAAAAAAAAA6tWykvMTVWyUlAKKMrPS8xRqAUAblzQzBQAAAA=', timestamp: 8 },
];
const homeOriginal = JSON.stringify(homeData);
const sent = replayPolicy.sanitizeEvent(snapshot(homeData));
assert.equal(JSON.stringify(homeData), homeOriginal, 'Sanitizing a recording must not mutate the recorder buffer');
assert.deepEqual(Object.keys(sent.properties).sort(), ['$lib', '$lib_version', '$session_id', '$snapshot_bytes', '$snapshot_data', '$snapshot_host', '$window_id', 'distinct_id', 'token'],
  'A $snapshot carries only the fields PostHog needs to store the recording');
assert.equal(sent.properties.$snapshot_host, 'splithappens.run');
assert.equal(sent.properties.$snapshot_bytes, JSON.stringify(sent.properties.$snapshot_data).length);
const sentJson = JSON.stringify(sent);
assert.doesNotMatch(sentJson, /Private|Smith|Clara|1990|born=|3:29:00|3:30:00|1:45:00|0:2[45]:|0:48:33|0:50:00|1:12:57|3:20:47|3:33:19|course=|goal=|record=|\?q=|someone|body=|rrweb\/console|rrweb\/network|"cv"|rr_dataURL|fillText|"checked"|"selected"|#cards|#result|#main|#r"|#x|#cutoffs/,
  'No query string (commas included), fragment, typed value, name, choice, console or network data and no compressed event leaves the browser');
const hrefs = []; JSON.parse(sentJson, (key, value) => { if (['href', 'src', 'data-link', 'srcset'].includes(key)) hrefs.push(value); return value; });
assert.ok(hrefs.includes('https://splithappens.run/tools/qualifying') && hrefs.includes('https://splithappens.run/tools/pace-calculator'), 'Page addresses are the clean production path');
assert.ok(hrefs.includes('https://splithappens.run/tools/split-check') && hrefs.includes('https://splithappens.run/runners') && hrefs.includes('https://splithappens.run/finish-times'), 'Links to the site are the clean page address');
for (const href of hrefs) assert.doesNotMatch(href, /[?#]/, `${href} has no query string or fragment`);
assert.deepEqual(sent.properties.$snapshot_data.map(event => event.type), [4, 2, 3, 3, 3, 3, 5, 5], 'Plugin, canvas, JSON-LD and compressed events are dropped');
assert.equal(sent.properties.$snapshot_data[3].data.text, '***', 'Input events are masked even if the recorder sent a value');
assert.equal(sent.properties.$snapshot_data[4].data.isChecked, false, 'Checkbox and radio input events never say what was chosen');
assert.match(sentJson, /\/_next\/static\/css\/app\.css/, 'Stylesheet links survive, so replays keep the site styling');
for (const extra of [{ distinct_id: 'private@example.com' }, { $session_id: undefined }, { $window_id: 'Private Name' }, { token: undefined }]) {
  assert.equal(replayPolicy.sanitizeEvent(snapshot([meta('https://splithappens.run/'), fullSnapshot(text('Home'))], extra)), null, `A snapshot with ${JSON.stringify(extra)} is dropped`);
}
// Blocked pages: nothing recorded on /runners or /your-race leaves, from the page change until the next allowed page.
assert.equal(replayPolicy.sanitizeEvent(snapshot([meta('https://splithappens.run/runners'), fullSnapshot(element('strong', {}, [text('Private Name')]))])), null, 'A snapshot taken on /runners is dropped');
assert.equal(replayPolicy.sanitizeEvent(snapshot([{ type: 3, data: { source: 0, texts: [{ id: 1, value: 'Private Name' }], attributes: [], removes: [], adds: [] }, timestamp: 9 }])), null, 'Later events on the blocked page are dropped too');
const resumed = replayPolicy.sanitizeEvent(snapshot([meta('https://splithappens.run/'), fullSnapshot(text('Home')), custom('$url_changed', { href: 'https://splithappens.run/your-race?age=40' }), { type: 3, data: { source: 0, texts: [{ id: 1, value: 'Private Name' }], attributes: [], removes: [], adds: [] }, timestamp: 9 }, custom('$pageview', { href: 'https://splithappens.run/your-race' })]));
assert.deepEqual(resumed.properties.$snapshot_data.map(event => event.type), [4, 2], 'Recording resumes on an allowed page and stops at the change to /your-race');
assert.doesNotMatch(JSON.stringify(resumed), /Private|your-race/);
// A runner handoff page, as the recorder names it (recorderPageUrl), is dropped like a blocked page.
const handedOff = replayPolicy.sanitizeEvent(snapshot([meta('https://splithappens.run/tools'), fullSnapshot(text('Tools')), custom('$url_changed', { href: replay.recorderPageUrl('https://splithappens.run' + handoff) }), { type: 3, data: { source: 0, texts: [], attributes: [{ id: 3, attributes: { d: 'M70.6 60.4 L131.7 58.9' } }], removes: [], adds: [{ parentId: 1, nextId: null, node: text('Finish 5:46:49') }] }, timestamp: 9 }]));
assert.deepEqual(handedOff.properties.$snapshot_data.map(event => event.type), [4, 2], 'Nothing recorded after the change to a runner handoff page is sent');
assert.doesNotMatch(JSON.stringify(handedOff), /5:46:49|M70\.6|via=/);
assert.equal(replayPolicy.sanitizeEvent(snapshot([meta(replay.recorderPageUrl('https://splithappens.run' + handoff)), fullSnapshot(text('Finish 5:46:49'))])), null, 'A snapshot taken on a runner handoff page is dropped');
const paused = replayPolicy.sanitizeEvent(snapshot([meta('https://splithappens.run/analyses'), custom('recording paused', { reason: 'url blocker' }), { type: 3, data: { source: 0, texts: [{ id: 1, value: 'Private Name' }], attributes: [], removes: [], adds: [] }, timestamp: 9 }]));
assert.deepEqual(paused.properties.$snapshot_data.map(event => event.type === 5 ? event.data.tag : event.type), [4, 'recording paused'], "PostHog's own URL-blocklist pause also stops what follows");
assert.equal(replayPolicy.sanitizeEvent(snapshot([{ type: 3, data: { source: 1, positions: [] }, timestamp: 10 }])), null);
assert.equal(replayPolicy.sanitizeEvent(snapshot([meta('https://splithappens.run/htw-live-study/runners'), fullSnapshot(text('Private Name'))]), '/htw-live-study'), null, 'Blocked under a base path');

async function main() {
  const originalLoad = Module._load;
  let sdkLoads = 0, recorderLoads = 0, config;
  const events = [], storage = new Map(), session = new Map(), recordingCalls = [], idle = [];
  const plugins = { getRecordConsolePlugin() {}, getRecordNetworkPlugin() {} };
  const sdk = {
    config: {},
    init(_key, options) { config = options; sdk.config = { ...options }; },
    // The real SDK adds its random tab, session and window IDs to every event before before_send runs.
    capture(event, properties) { const safe = config.before_send({ event, properties: { ...properties, distinct_id: TAB_ID, $session_id: SESSION_ID, $window_id: WINDOW_ID } }); if (safe) events.push(safe); },
    startSessionRecording() { recordingCalls.push('start'); sdk.config.disable_session_recording = false; },
    stopSessionRecording() { recordingCalls.push('stop'); sdk.config.disable_session_recording = true; },
  };
  Module._load = function(request, ...args) {
    if (request === 'posthog-js') { sdkLoads++; return sdk; }
    // posthog-js/dist/posthog-recorder registers rrweb and its plugins on window.__PosthogExtensions__ when it runs.
    if (request === 'posthog-js/dist/posthog-recorder') { recorderLoads++; window.__PosthogExtensions__ = { rrwebPlugins: plugins, rrweb: { record() {} } }; return {}; }
    return originalLoad.call(this, request, ...args);
  };
  // The recorder waits for load, a pause and an idle callback: the pause is shortened here, and idle callbacks run when
  // the test says so.
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms >= 1000 ? 1 : ms, ...rest);
  const settle = () => new Promise(resolve => realSetTimeout(resolve, 15));
  const runIdle = async () => { await settle(); while (idle.length) idle.shift()(); await settle(); };
  const target = new EventTarget();
  const sessionStorage = { getItem: key => session.has(key) ? session.get(key) : null, setItem: (key, value) => session.set(key, String(value)), removeItem: key => session.delete(key) };
  global.window = { location: { hostname: 'splithappens.run', pathname: '/', search: '' }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, sessionStorage,
    dispatchEvent: event => target.dispatchEvent(event), requestIdleCallback: (callback, options) => { assert.ok(options.timeout > 0, 'Idle callbacks have a timeout'); idle.push(callback); return idle.length; } };
  global.document = { referrer: 'https://www.google.com/search?q=Private+Name', readyState: 'complete' };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { doNotTrack: '0', globalPrivacyControl: false } });
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-project';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
  const analytics = require('../lib/analytics.ts');
  const go = (pathname, search = '') => { window.location.pathname = pathname; window.location.search = search; };
  // Missing settings, previews, development and privacy signals must not even load the vendor SDK or the recorder.
  window.location.hostname = 'preview.vercel.app'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  window.location.hostname = 'localhost'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  window.location.hostname = 'splithappens.run';
  process.env.NODE_ENV = 'development'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  process.env.NODE_ENV = 'production'; delete process.env.NEXT_PUBLIC_POSTHOG_KEY; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-project';
  navigator.doNotTrack = '1'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  navigator.doNotTrack = '0'; navigator.globalPrivacyControl = true; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  navigator.globalPrivacyControl = false; analytics.setAnalyticsDisabled(true); analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  assert.equal(recorderLoads, 0, 'Recording starts only on production hosts with analytics allowed');
  analytics.setAnalyticsDisabled(false); analytics.trackPage('/'); analytics.trackPage('/'); await settle();
  assert.equal(sdkLoads, 1); assert.equal(events.length, 1, 'One initial pageview, including React Strict Mode');
  assert.equal(recorderLoads, 1, 'The recorder is bundled and loaded with the SDK');
  const source = fs.readFileSync(path.join(__dirname, '../lib/analytics.ts'), 'utf8');
  assert.match(source, /Promise\.all\(\[import\('posthog-js'\), import\('posthog-js\/dist\/posthog-recorder'\), import\('\.\/replay-policy'\)\]\)/, 'The recorder and the replay policy are imported inside the dynamic import');
  assert.doesNotMatch(source, /^import\s(?!type\s)[^;]*['"](?:posthog-js(\/[^'"]*)?|\.\/replay-policy)['"]/m, 'Neither the SDK, the recorder nor the replay policy is a static import, so none enters the initial page JavaScript');
  assert.deepEqual(window.__PosthogExtensions__.rrwebPlugins, {}, 'The console and network recording plugins are removed');
  // The SDK configuration: per-tab sessionStorage identity, recording with masking, everything else off.
  assert.equal(config.persistence, 'sessionStorage'); assert.equal(config.cookieless_mode, undefined); assert.notEqual(config.disable_persistence, true);
  assert.equal(session.size, 0, 'The sessionStorage check leaves nothing behind');
  assert.equal(config.person_profiles, 'never');
  assert.equal(config.disable_session_recording, true, 'The SDK starts with recording off, so the first snapshot never runs during page load');
  assert.deepEqual(recordingCalls, [], 'Recording waits for an idle moment after load');
  analytics.trackPage('/tools'); go('/tools'); analytics.trackPage('/tools'); await settle(); assert.deepEqual(recordingCalls, [], 'A navigation before then does not start it either');
  await runIdle(); assert.deepEqual(recordingCalls, ['start'], 'Recording starts once the page is idle');
  go('/'); analytics.trackPage('/'); await settle();
  assert.equal(config.enable_recording_console_log, false); assert.equal(config.capture_performance, false);
  const recording = config.session_recording;
  assert.deepEqual(Object.keys(recording).sort(), Object.keys(replay.replayRecordingOptions()).sort(), 'The recording options come from lib/replay-policy.ts');
  assert.equal(recording.maskAllInputs, true); assert.equal(recording.maskTextSelector, replay.REPLAY_MASKED_TEXT); assert.equal(recording.blockClass, 'ph-no-capture');
  assert.equal(recording.blockSelector, replay.REPLAY_BLOCKED_ELEMENTS, 'Results panels and the charts in masked regions are left out');
  assert.equal(recording.maskTextFn('Women'), '***'); assert.equal(recording.maskTextFn('Non-binary'), '***', 'Masked text keeps no length');
  assert.equal(recording.maskInputFn('3:24:51'), '***'); assert.equal(recording.maskInputFn(''), '', 'Masked inputs keep no length');
  assert.equal(recording.recordHeaders, false); assert.equal(recording.recordBody, false); assert.equal(recording.captureCanvas.recordCanvas, false);
  assert.equal(recording.captureJsonLd, false); assert.equal(recording.recordCrossOriginIframes, false);
  assert.equal(recording.compress_events, false, 'Snapshots stay readable so before_send can check them');
  assert.ok(recording.inlineStylesheetBudgetRules > 0 && recording.inlineStylesheetBudgetRules <= 200, 'Most stylesheet rules are inlined after the first snapshot');
  assert.equal(recording.maskCapturedNetworkRequestFn({ name: 'https://splithappens.run/tools/qualifying?t=3:29:00&born=1990-01-01#x' }).name, 'https://splithappens.run/tools/qualifying', 'Recorded page addresses are cleaned at the source');
  assert.equal(recording.maskCapturedNetworkRequestFn({ name: 'https://splithappens.run/runners/Private-Name' }).name, 'https://splithappens.run/runners');
  assert.equal(recording.maskCapturedNetworkRequestFn({ name: 'https://splithappens.run' + handoff }).name, 'https://splithappens.run/tools/split-check?via=runner');
  const inMaskedRegion = { tagName: 'BUTTON', closest: selector => selector === replay.REPLAY_MASKED_TEXT ? {} : null }, outside = { tagName: 'A', closest: () => null };
  assert.equal(recording.maskAttributeFn('aria-label', 'Born 1990', inMaskedRegion), '***', 'Attributes inside masked regions are masked');
  assert.equal(recording.maskAttributeFn('aria-pressed', 'true', inMaskedRegion), '***', 'and so is which button is pressed');
  assert.equal(recording.maskAttributeFn('aria-label', 'Menu', outside), 'Menu');
  assert.equal(recording.maskAttributeFn('href', 'https://splithappens.run/tools/split-check?s=0:24:11,0:48:33,3:33:19#main', outside), 'https://splithappens.run/tools/split-check', 'Links lose their whole query, commas included');
  for (const key of ['autocapture', 'rageclick', 'capture_pageview', 'capture_pageleave', 'capture_dead_clicks', 'capture_exceptions', 'capture_heatmaps', 'save_referrer', 'save_campaign_params']) assert.equal(config[key], false, `${key} is off`);
  for (const key of ['disable_surveys', 'disable_product_tours', 'disable_conversations', 'disable_web_experiments', 'disable_external_dependency_loading', 'advanced_disable_feature_flags', 'advanced_disable_feature_flags_on_first_load', 'advanced_disable_toolbar_metrics', 'disable_capture_url_hashes', 'respect_dnt']) assert.equal(config[key], true, `${key} is on`);
  assert.notEqual(config.advanced_disable_flags, true, 'Remote config must load: it switches recording on and carries the URL blocklist');
  // Recorded data passes the same before_send: a $snapshot is checked, and dropped once analytics is off.
  const viaSdk = config.before_send(snapshot([meta('https://splithappens.run/?q=Private+Name'), fullSnapshot(text('Home'))]));
  assert.equal(viaSdk.properties.$snapshot_data[0].data.href, 'https://splithappens.run/');
  // Blocked pages stop and resume the recorder on navigation.
  recordingCalls.length = 0;
  const views = events.length;
  go('/runners'); analytics.trackPage('/runners'); await settle(); assert.equal(events.length, views + 1, 'The /runners page view is still counted');
  assert.deepEqual(recordingCalls, ['stop'], 'Navigating onto /runners stops recording');
  analytics.trackAnalytics('runner_search_completed', { outcome: 'no_matches', name: 'Private Name' }); await settle();
  assert.equal(events.at(-1).properties.outcome, 'no_matches'); assert.equal(events.at(-1).properties.name, undefined);
  assert.equal(events.at(-1).properties.$session_id, SESSION_ID, 'Feature events keep the session ID');
  // A runner's profile links to the split check with that runner's times: recording stays off there, and after a reload.
  go('/tools/split-check', handoff.slice(handoff.indexOf('?'))); analytics.trackPage('/tools/split-check'); await settle();
  assert.deepEqual(recordingCalls, ['stop'], 'A runner handoff page keeps recording off');
  assert.equal(events.at(-1).properties.$current_url, 'https://splithappens.run/tools/split-check', 'and its page view has no query string');
  go('/'); analytics.trackPage('/'); await settle();
  assert.deepEqual(recordingCalls, ['stop', 'start'], 'Leaving resumes recording');
  go('/analyses/pacing-pattern', '?race=London&goal=347&age=all&gender=all&via=runner'); analytics.trackPage('/analyses/pacing-pattern'); await settle();
  assert.deepEqual(recordingCalls, ['stop', 'start', 'stop'], 'Arriving on a handoff page (Back or Forward) stops recording');
  go('/tools'); analytics.trackPage('/tools'); await settle();
  go('/tools/split-check', '?s=0:24:11,0:48:33&course=boston'); analytics.trackPage('/tools/split-check'); await settle();
  assert.deepEqual(recordingCalls.slice(3), ['start'], 'The visitor\'s own split check is recorded (with its results left out)');
  go('/tools'); analytics.trackPage('/tools'); await settle(); assert.equal(recordingCalls.length, 4, 'Allowed-to-allowed navigation does not touch the recorder');
  go('/your-race/'); analytics.trackPage('/your-race'); await settle(); assert.deepEqual(recordingCalls.slice(4), ['stop'], '/your-race stops recording');
  go('/analyses'); analytics.trackPage('/analyses'); await settle(); assert.deepEqual(recordingCalls.slice(4), ['stop', 'start']);
  process.env.NEXT_PUBLIC_BASE_PATH = '/htw-live-study';
  go('/htw-live-study/analyses/starting-pace');
  analytics.trackPage('/analyses/starting-pace'); await settle();
  assert.equal(events.at(-1).properties.$pathname, '/analyses/starting-pace', 'Subdirectory deployments retain their application route');
  go('/htw-live-study/runners');
  analytics.trackPage('/runners'); await settle(); assert.deepEqual(recordingCalls.slice(6), ['stop'], 'Blocked pages are found under a base path');
  analytics.trackAnalytics('runner_search_submitted', {}); await settle();
  assert.equal(events.at(-1).properties.$current_url, 'https://splithappens.run/runners', 'Feature events also remove the configured base path');
  delete process.env.NEXT_PUBLIC_BASE_PATH;
  go('/'); analytics.trackPage('/'); await settle(); assert.deepEqual(recordingCalls.slice(6), ['stop', 'start']);
  // A runner handoff: a page it leads to with a query stays unrecorded, also after a reload, until one without a query.
  recordingCalls.length = 0;
  go('/tools/split-check', handoff.slice(handoff.indexOf('?'))); analytics.trackPage('/tools/split-check'); await settle();
  go('/analyses/starting-pace', '?opening=fast5&race=London&gender=Men'); analytics.trackPage('/analyses/starting-pace'); await settle();
  assert.deepEqual(recordingCalls, ['stop'], 'A page reached from a runner handoff, with its query, is not recorded');
  assert.equal(session.get('pace-notes-runner-handoff'), '1', 'The tab remembers the handoff across a reload');
  go('/stories'); analytics.trackPage('/stories'); await settle();
  assert.deepEqual(recordingCalls, ['stop', 'start'], 'Opening a page without a query resumes recording');
  assert.equal(session.has('pace-notes-runner-handoff'), false, 'and clears the flag');
  // Opt-out, Do Not Track and Global Privacy Control stop recording as well as events (SiteAnalytics calls trackPage on each change).
  const count = events.length;
  recordingCalls.length = 0;
  analytics.setAnalyticsDisabled(true); analytics.trackPage('/'); analytics.trackAnalytics('runner_search_submitted', {}); await settle(); assert.equal(events.length, count);
  assert.deepEqual(recordingCalls, ['stop'], 'The /privacy opt-out stops recording');
  assert.equal(config.before_send(dirty), null, 'Opt-out also blocks an already-initialized SDK');
  assert.equal(config.before_send(snapshot([meta('https://splithappens.run/'), fullSnapshot(text('Home'))])), null, 'and its recordings');
  analytics.setAnalyticsDisabled(false); analytics.trackPage('/'); await settle(); assert.deepEqual(recordingCalls, ['stop', 'start'], 'Opting back in resumes recording');
  navigator.doNotTrack = '1'; analytics.trackPage('/'); await settle(); assert.deepEqual(recordingCalls, ['stop', 'start', 'stop'], 'Do Not Track stops recording');
  assert.equal(config.before_send(snapshot([meta('https://splithappens.run/'), fullSnapshot(text('Home'))])), null);
  navigator.doNotTrack = '0'; analytics.trackPage('/'); await settle();
  navigator.globalPrivacyControl = true; analytics.trackPage('/'); await settle(); assert.deepEqual(recordingCalls.slice(-2), ['start', 'stop'], 'Global Privacy Control stops recording');
  assert.equal(config.before_send(dirty), null);
  navigator.globalPrivacyControl = false; analytics.trackPage('/'); await settle();
  storage.set(policy.ANALYTICS_PREFERENCE, 'true'); assert.equal(config.before_send(dirty), null, 'Other tabs must honor stored opt-out');
  analytics.trackPage('/'); await settle(); assert.equal(recordingCalls.at(-1), 'stop', "Another tab's opt-out stops this tab's recording");
  analytics.setAnalyticsDisabled(true); storage.set(policy.ANALYTICS_PREFERENCE, 'false'); assert.equal(analytics.analyticsDisabled(), false, 'A changed choice in another tab must be reflected');
  const originalStorage = window.localStorage;
  window.localStorage = { getItem() { throw new Error('blocked storage'); }, setItem() { throw new Error('blocked storage'); } };
  analytics.setAnalyticsDisabled(true); assert.equal(analytics.analyticsDisabled(), true, 'Opt-out must work with unavailable storage');
  analytics.setAnalyticsDisabled(false); window.localStorage = originalStorage;
  storage.clear();
  sdk.capture = () => { throw new Error('blocked analytics'); };
  sdk.startSessionRecording = sdk.stopSessionRecording = () => { throw new Error('blocked recorder'); };
  analytics.trackAnalytics('runner_search_submitted', {}); await settle(); // No unhandled rejection or broken site action.
  go('/runners'); analytics.trackPage('/runners'); await settle(); // A recorder failure must not break navigation.

  // A visit that starts on a blocked page initializes with recording off, then starts it on the next allowed page.
  const fresh = () => { delete require.cache[require.resolve('../lib/analytics.ts')]; return require('../lib/analytics.ts'); };
  recordingCalls.length = 0; sdk.config = {};
  sdk.startSessionRecording = function() { recordingCalls.push('start'); sdk.config.disable_session_recording = false; };
  sdk.stopSessionRecording = function() { recordingCalls.push('stop'); sdk.config.disable_session_recording = true; };
  let page = fresh();
  go('/runners'); page.trackPage('/runners'); await runIdle();
  assert.equal(config.disable_session_recording, true, 'A visit that lands on /runners starts with recording off');
  assert.deepEqual(recordingCalls, []);
  go('/'); page.trackPage('/'); await settle(); assert.deepEqual(recordingCalls, ['start']);
  // So does a reload of a runner handoff page.
  recordingCalls.length = 0; sdk.config = {};
  page = fresh();
  go('/tools/split-check', handoff.slice(handoff.indexOf('?'))); page.trackPage('/tools/split-check'); await runIdle();
  assert.deepEqual(recordingCalls, [], 'A reloaded runner handoff page is not recorded');
  // Without working sessionStorage, PostHog would fall back to a cookie and localStorage: the tab's ID stays in memory instead.
  recordingCalls.length = 0; sdk.config = {};
  window.sessionStorage = { getItem() { return null; }, setItem() { throw new DOMException('full', 'QuotaExceededError'); }, removeItem() {} };
  page = fresh();
  go('/'); page.trackPage('/'); await runIdle();
  assert.equal(config.persistence, 'memory', 'A failing sessionStorage never leads to cookie or localStorage persistence');
  assert.deepEqual(recordingCalls, ['start'], 'Recording still works within the page');
  window.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  sdk.config = {}; page = fresh(); go('/about'); page.trackPage('/about'); await runIdle();
  assert.equal(config.persistence, 'memory', 'Blocked storage also keeps the ID in memory');
  for (const value of ['localStorage', 'cookie', 'localStorage+cookie']) assert.notEqual(config.persistence, value);
  Module._load = originalLoad;
  global.setTimeout = realSetTimeout;
  console.log(`Analytics checks passed: URL/name redaction, event allowlists with session IDs, ${searchPages.length} search pages and all ${sitemap.length} sitemap pages recorded under their clean path, session replay (sessionStorage identity with an in-memory fallback, bundled recorder and lazily loaded replay policy, recording started after load, masking without length, results panels and charts left out, console/network capture off, snapshot field allowlist, clean page addresses and links, blocked /runners, /your-race and runner handoff pages), per-file masking guards, production gating, pageview deduplication, opt-out/DNT/GPC stopping events and recording, and SDK failure isolation.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
