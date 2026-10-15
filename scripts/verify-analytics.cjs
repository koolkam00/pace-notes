const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
// VERIFY_ANALYTICS_REGISTRY names a registry file to run every check with in place of lib/experiments.ts. This script
// runs itself that way once (at the end), with experiments running, so no check depends on the registry being empty.
const REGISTRY = path.join(__dirname, '../lib/experiments.ts');
const registryFile = process.env.VERIFY_ANALYTICS_REGISTRY || REGISTRY;
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename === REGISTRY ? registryFile : filename, 'utf8'), {
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
for (const event of ['$autocapture', '$identify', '$exception', '$rageclick', '$dead_click', '$heatmap', '$feature_flag_called', 'unknown', 'constructor']) assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event }), null);
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event: '$snapshot', properties: { ...dirty.properties, $snapshot_data: [{ type: 4, data: { href: 'https://splithappens.run/' } }] } }), null, 'The event allowlist alone drops every recording chunk');
assert.equal(replay.sanitizeEvent({ ...dirty, event: '$snapshot' }), null, 'A $snapshot without recording data is dropped');
assert.equal(replay.sanitizeEvent(dirty).properties.$current_url, 'https://splithappens.run/runners', 'Once loaded, the replay module sends other events through the same allowlist');
assert.equal(policy.analyticsPath('/analyses/starting-pace?age=35#private'), '/analyses/starting-pace');
assert.equal(policy.analyticsPath('/htw-live-study/analyses/starting-pace?age=35#private', '/htw-live-study'), '/analyses/starting-pace');
assert.equal(policy.analyticsPath('/htw-live-study/', '/htw-live-study'), '/');
assert.equal(policy.analyticsPath('/htw-live-study-other/runners', '/htw-live-study'), '/other');
assert.equal(policy.analyticsPath('/unknown/Private-Name'), '/other');
assert.equal(policy.analyticsPath('/courses/Private-Name'), '/courses');
assert.equal(policy.analyticsPath('/stories/Private-Name'), '/stories', 'A story path that is not a published story falls to its section');
assert.equal(policy.analyticsPath('/courses/berlin/Private-Name'), '/courses');
assert.equal(policy.analyticsPath('/courses/berlin?runner=Private+Name#x'), '/courses/berlin', 'Course pages keep their own path, never a query');
assert.equal(policy.analyticsPath('/packs/smyth_htw'), '/packs', 'Research archive packs stay grouped');
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
const sections = ['/packs'];
const sitemap = sitemapEntries();
// The story and course lists in lib/analytics-policy.ts are literal (that module ships to every page); they must match
// the stories and courses the site publishes.
const { STORIES } = require('../lib/stories.ts');
const { getCourseNames, slugifyCity } = require('../lib/course-data.ts');
assert.deepEqual([...policy.STORY_SLUGS].sort(), STORIES.map(story => story.slug).sort(), 'STORY_SLUGS in lib/analytics-policy.ts lists every story in lib/stories.ts');
assert.deepEqual([...policy.COURSE_SLUGS].sort(), getCourseNames().map(slugifyCity).sort(), 'COURSE_SLUGS in lib/analytics-policy.ts lists every course page');
for (const root of ['/stories', '/courses']) assert.deepEqual(sitemap.filter(entry => entry.path.startsWith(root + '/')).map(entry => entry.path.slice(root.length + 1)).sort(), [...(root === '/stories' ? policy.STORY_SLUGS : policy.COURSE_SLUGS)].sort(), `every ${root} page in the sitemap keeps its own path`);
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

// Every declared event keeps only its enumerated values; anything else in the same field is dropped.
const UUID_A = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a30', UUID_B = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a31';
const sanitize = (event, properties) => policy.sanitizeAnalyticsEvent({ ...dirty, event, properties: { ...dirty.properties, ...properties } });
const kept = (event, properties) => { const result = sanitize(event, properties); assert.ok(result, `${event} is a declared event`); return result.properties; };
const enumerated = {
  runner_search_completed: { outcome: ['matches', 'no_matches', 'error'], results: ['0', '1', '2-5', '6+'] },
  tool_used: { action: ['edit', 'print', 'copy_link'] },
  page_feedback: { answer: ['yes', 'no'] },
  page_feedback_reason: { reason: ['hard_to_follow', 'not_what_i_needed', 'numbers_look_wrong', 'something_broke'] },
  site_error: { category: ['js_error', 'unhandled_rejection', 'chunk_load', 'data_fetch', 'render'] },
  section_viewed: { section: [...policy.TRACKED_SECTIONS] },
  units_changed: { units: ['mi', 'km'] },
  data_download_clicked: { destination: ['release', 'site_data'] },
  race_comparison_opened: { selection: ['one', 'multiple'], availability: ['eligible', 'mixed', 'limited'] },
};
const junk = ['Private Name', 'TypeError: x', '7', 'maybe', 'ID 123', '', ' edit', 'EDIT', 'edit,print', '__proto__'];
for (const [event, fields] of Object.entries(enumerated)) {
  for (const [key, values] of Object.entries(fields)) {
    for (const value of values) assert.equal(kept(event, { [key]: value })[key], value, `${event}.${key}=${value} is kept`);
    for (const value of [...junk, 7, true, null, ['edit'], { value: 'edit' }]) assert.equal(kept(event, { [key]: value })[key], undefined, `${event}.${key}=${JSON.stringify(value)} is dropped`);
  }
}
assert.equal(kept('site_error', { category: 'js_error', message: 'boom 3:16:41 Private Name', stack: 'at x (https://splithappens.run/tools?t=3:16:41)', filename: 'https://splithappens.run/_next/x.js' }).message, undefined);
assert.doesNotMatch(JSON.stringify(sanitize('site_error', { category: 'js_error', message: 'boom 3:16:41 Private Name', stack: 'at x', $exception_list: [{ value: 'Private' }] })), /boom|3:16:41|Private|stack|exception/, 'An error report carries its kind only');
assert.deepEqual([...policy.TRACKED_SECTIONS], ['hero', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => 'chapter-' + n), 'stories', 'tools', 'analyses', 'cta', 'faq', 'related']);
// Campaign tags: only the owner's fixed Instagram values, and only on a page view.
const tagged = kept('$pageview', { utm_source: 'instagram', utm_medium: 'social', utm_content: 'bio', utm_campaign: 'Private Name', utm_term: 'x', gclid: 'abc', fbclid: 'abc' });
assert.deepEqual([tagged.utm_source, tagged.utm_medium, tagged.utm_content, tagged.utm_campaign, tagged.utm_term, tagged.gclid, tagged.fbclid], ['instagram', 'social', 'bio', undefined, undefined, undefined, undefined]);
for (const content of ['bio', 'story', 'highlight', 'reel', 'post']) assert.equal(kept('$pageview', { utm_content: content }).utm_content, content);
assert.deepEqual(policy.CAMPAIGN.utm_content, ['bio', 'story', 'highlight', 'reel', 'post'], 'Every campaign value names a place many people see the link');
// A link sent in a direct message would tie the one person who opened it to the whole tab, so dm is not a value.
for (const [key, value] of [['utm_source', 'facebook'], ['utm_source', 'Instagram'], ['utm_medium', 'email'], ['utm_content', 'Private Name'], ['utm_content', 'bio2'], ['utm_content', 'dm']]) assert.equal(kept('$pageview', { [key]: value })[key], undefined, `${key}=${value} is not one of the fixed tags`);
for (const event of ['$pageleave', '$web_vitals', 'tool_used', 'units_changed']) assert.equal(kept(event, { utm_source: 'instagram', utm_medium: 'social', utm_content: 'bio' }).utm_source, undefined, `${event} never carries campaign tags`);
// Time on page and scroll depth: in range, on their grid (whole seconds, 5% steps), with no floating-point noise.
const view = kept('$pageview', { $prev_pageview_duration: 12.3456, $prev_pageview_max_scroll_percentage: 0.1499, $prev_pageview_max_content_percentage: 0.8523,
  $prev_pageview_last_scroll: 900, $prev_pageview_max_scroll: 1200, $prev_pageview_last_scroll_percentage: 0.5, $prev_pageview_pathname: '/tools/split-check?s=0:24:11#x', $pageview_id: UUID_A, $prev_pageview_id: UUID_B });
assert.deepEqual([view.$prev_pageview_duration, view.$prev_pageview_max_scroll_percentage, view.$prev_pageview_max_content_percentage], [12, 0.15, 0.85]);
assert.equal(view.$prev_pageview_pathname, '/tools/split-check', "The previous page is a clean path");
assert.deepEqual([view.$pageview_id, view.$prev_pageview_id], [UUID_A, UUID_B]);
for (const key of ['$prev_pageview_last_scroll', '$prev_pageview_max_scroll', '$prev_pageview_last_scroll_percentage']) assert.equal(view[key], undefined, `${key} is not kept`);
assert.equal(kept('$pageview', { $prev_pageview_pathname: '/runners?q=Private+Name' }).$prev_pageview_pathname, '/runners');
for (const page of ['/runners/Private-Name', '/Private-Name']) assert.equal(kept('$pageview', { $prev_pageview_pathname: page }).$prev_pageview_pathname, '/other');
// $pageleave names the page it leaves too, cleaned the same way: the autopilot's story-completion figures read it there.
const leaving = kept('$pageleave', { $current_url: 'https://splithappens.run/stories/final-kick?x=1', $prev_pageview_pathname: '/stories/final-kick?x=Private+Name#end', $prev_pageview_max_scroll_percentage: 0.97, $prev_pageview_duration: 184.6, $pageview_id: UUID_A, $prev_pageview_id: UUID_B });
assert.deepEqual([leaving.$pathname, leaving.$prev_pageview_pathname, leaving.$prev_pageview_max_scroll_percentage, leaving.$prev_pageview_duration, leaving.$prev_pageview_id], ['/stories/final-kick', '/stories/final-kick', 0.95, 185, UUID_B]);
for (const page of ['/runners/Private-Name', '/stories/Private-Name']) assert.notEqual(kept('$pageleave', { $prev_pageview_pathname: page }).$prev_pageview_pathname, page, `$pageleave never names ${page}`);
for (const event of ['tool_used', '$web_vitals', 'section_viewed']) assert.equal(kept(event, { $prev_pageview_pathname: '/tools' }).$prev_pageview_pathname, undefined, `${event} names no previous page`);
for (let step = 0; step <= 20; step++) {
  const share = kept('$pageleave', { $prev_pageview_max_scroll_percentage: step === 20 ? 0.996 : step / 20 + 0.004 }).$prev_pageview_max_scroll_percentage;
  assert.equal(String(share), String(step / 20), `scroll depth ${step / 20} is on the 5% grid with no rounding noise`);
  assert.ok(String(share).length <= 4, `${share} has no floating-point noise`);
}
for (const bad of [99999, 3600.6, -1, NaN, Infinity, '12', null, { value: 12 }]) {
  assert.equal(kept('$pageleave', { $prev_pageview_duration: bad }).$prev_pageview_duration, undefined, `a duration of ${String(bad)} is dropped`);
  assert.equal(kept('$pageview', { $prev_pageview_max_scroll_percentage: bad }).$prev_pageview_max_scroll_percentage, undefined, `a scroll depth of ${String(bad)} is dropped`);
}
assert.equal(kept('$pageleave', { $prev_pageview_duration: 3600 }).$prev_pageview_duration, 3600);
assert.equal(kept('$pageleave', { $prev_pageview_duration: 0 }).$prev_pageview_duration, 0);
for (const bad of ['Private Name', 'private@example.com', 123, '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a3', UUID_A + 'x']) {
  assert.equal(kept('$pageview', { $pageview_id: bad }).$pageview_id, undefined, `$pageview_id ${bad} is not a random ID`);
  assert.equal(kept('$pageleave', { $prev_pageview_id: bad }).$prev_pageview_id, undefined);
}
assert.equal(kept('tool_used', { action: 'edit', $prev_pageview_duration: 12, $pageview_id: UUID_A }).$prev_pageview_duration, undefined, 'Reading figures belong to page views and page leaves only');
// Web Vitals: only the four values, in range and rounded; never the metric objects, their attribution or a page address.
const vitals = kept('$web_vitals', { $current_url: 'https://splithappens.run/tools/split-check?s=0:24:11,0:48:33#main',
  $web_vitals_LCP_value: 1234.5678, $web_vitals_FCP_value: 800.4, $web_vitals_INP_value: 56, $web_vitals_CLS_value: 0.123456, $web_vitals_TTFB_value: 300,
  $web_vitals_LCP_event: { name: 'LCP', value: 1234.5, attribution: { target: '#runner-name', url: 'https://splithappens.run/tools/split-check?s=0:24:11' }, $current_url: 'https://splithappens.run/tools/split-check?s=0:24:11' },
  $web_vitals_allowed_metrics: ['LCP'], $web_vitals_enabled_server_side: true });
assert.deepEqual([vitals.$web_vitals_LCP_value, vitals.$web_vitals_FCP_value, vitals.$web_vitals_INP_value, vitals.$web_vitals_CLS_value], [1235, 800, 56, 0.123]);
assert.equal(vitals.$current_url, 'https://splithappens.run/tools/split-check');
// Web Vitals arrive when the visitor first taps or leaves, possibly after a client-side navigation, so the SDK's page-view
// ID on them can name the next page view: they join to their page by $pathname and $session_id instead.
const vitalsIds = kept('$web_vitals', { $web_vitals_LCP_value: 900, $pageview_id: UUID_A, $prev_pageview_id: UUID_B });
assert.deepEqual([vitalsIds.$pageview_id, vitalsIds.$prev_pageview_id, vitalsIds.$session_id], [undefined, undefined, dirty.properties.$session_id], 'Web Vitals carry no page-view ID');
assert.doesNotMatch(JSON.stringify(vitals), /_event|attribution|runner-name|0:24:11|TTFB|allowed_metrics|enabled_server_side/, 'Web Vitals keep their values only');
for (const [key, bad] of [['$web_vitals_LCP_value', 60001], ['$web_vitals_FCP_value', -5], ['$web_vitals_INP_value', '56'], ['$web_vitals_CLS_value', 10.5], ['$web_vitals_CLS_value', NaN]]) assert.equal(kept('$web_vitals', { [key]: bad })[key], undefined, `${key}=${String(bad)} is dropped`);
assert.equal(kept('$web_vitals', { $web_vitals_CLS_value: 0.1 + 0.2 }).$web_vitals_CLS_value, 0.3, 'CLS is on its 0.001 grid with no rounding noise');
// The site's Web Vitals: every value waits until the page is hidden, then all go at once by beacon, each once per load.
{
  const reporters = {}, listeners = [], captured = [];
  const library = Object.fromEntries(['LCP', 'INP', 'CLS', 'FCP'].map(name => ['on' + name, report => { reporters[name] = report; }]));
  const saved = { window: global.window, document: global.document };
  global.window = { addEventListener: (type, listener, options) => listeners.push({ type, listener, options }), location: { href: 'https://splithappens.run/tools?x=1' } };
  global.document = { visibilityState: 'visible' };
  try {
    replay.measureWebVitals({ capture: (...args) => captured.push(args) }, library);
    assert.deepEqual(Object.keys(reporters).sort(), ['CLS', 'FCP', 'INP', 'LCP'], 'LCP, INP, CLS and FCP are measured');
    assert.deepEqual(listeners.map(l => [l.type, l.options]), [['visibilitychange', undefined]], 'One bubbling visibilitychange listener on window, after the library\'s own capturing one');
    const hide = () => { global.document.visibilityState = 'hidden'; for (const l of listeners) l.listener(); };
    const metric = (name, value, id) => ({ name, value, id, navigationURL: 'https://splithappens.run/stories/final-kick?q=Private+Name#x', attribution: { target: '#runner-name' } });
    reporters.FCP(metric('FCP', 208.4, 'v5-f1')); reporters.LCP(metric('LCP', 1234.5, 'v5-l1'));
    global.document.visibilityState = 'visible'; for (const l of listeners) l.listener();
    assert.equal(captured.length, 0, 'Nothing is sent while the page is visible');
    // As the tab closes, the library reports CLS and INP in its own listener; this one then sends everything at once.
    reporters.CLS(metric('CLS', 0.0213, 'v5-c1')); reporters.INP(metric('INP', 48, 'v5-i1')); hide();
    assert.equal(captured.length, 1, 'One event when the page is hidden');
    const [name, properties, options] = captured[0];
    assert.equal(name, '$web_vitals');
    assert.deepEqual(properties, { $current_url: 'https://splithappens.run/stories/final-kick?q=Private+Name#x', $web_vitals_FCP_value: 208.4, $web_vitals_LCP_value: 1234.5, $web_vitals_CLS_value: 0.0213, $web_vitals_INP_value: 48 }, 'Values only, for the page that loaded');
    assert.deepEqual(options, { send_instantly: true, transport: 'sendBeacon' }, 'Sent at once by beacon, which outlives a closing tab');
    const sentVitals = policy.sanitizeAnalyticsEvent({ ...dirty, event: '$web_vitals', properties: { ...dirty.properties, ...properties } }).properties;
    assert.deepEqual([sentVitals.$pathname, sentVitals.$web_vitals_LCP_value, sentVitals.$web_vitals_CLS_value, sentVitals.$web_vitals_INP_value, sentVitals.$web_vitals_FCP_value], ['/stories/final-kick', 1235, 0.021, 48, 208]);
    global.document.visibilityState = 'visible'; reporters.CLS(metric('CLS', 0.05, 'v5-c1')); hide();
    assert.equal(captured.length, 1, 'A value already sent for this page load is not sent again when the tab is hidden once more');
    reporters.FCP(metric('FCP', 31, 'v5-f2')); reporters.LCP(metric('LCP', 31, 'v5-l2')); global.document.visibilityState = 'visible'; hide();
    assert.deepEqual(Object.keys(captured[1][1]).filter(key => key.endsWith('_value')), ['$web_vitals_FCP_value', '$web_vitals_LCP_value'], 'A page restored from the back/forward cache reports its own new values');
    library.onINP = () => { throw new Error('unsupported'); }; listeners.length = 0;
    replay.measureWebVitals({ capture: () => assert.fail('nothing to send') }, library);
    assert.equal(listeners.length, 0, 'A browser the library cannot measure in sends nothing, and nothing throws');
  } finally { global.window = saved.window; global.document = saved.document; }
}

// The SDK's capture-time override markers (from capture(..., { timestamp })) never leave.
assert.equal(kept('$pageview', { $event_time_override_provided: true, $event_time_override_system_time: new Date() }).$event_time_override_provided, undefined);

// Link tags that social apps add are not a runner's data: they do not continue (or keep open) a runner handoff.
for (const page of ['/?utm_source=instagram&utm_medium=social&utm_content=bio', '/stories?fbclid=abc', '/tools?igshid=abc&units=km']) assert.equal(policy.continuesRunnerHandoff(page), false, `${page} has no runner query`);

// Experiments: the registry's rules, the <head> script that assigns a variant, the CSS that shows it, and the
// $feature/<key> property. The real registry may be empty, so a fixture registry is used for behaviour.
const vm = require('node:vm');
const runtime = require('../lib/experiment-runtime.ts');
const { EXPERIMENTS } = require('../lib/experiments.ts');
assert.deepEqual(runtime.experimentProblems(EXPERIMENTS), [], 'lib/experiments.ts is a valid registry');
assert.equal(runtime.EXPERIMENT_DEFINITIONS, EXPERIMENTS, 'The framework reads the registry itself');
// The registry is data only (the autopilot guard reads it without running it): one exported literal array, optionally
// `as const`, and nothing else. This reader is the guard's own (readExperimentRegistry in scripts/autopilot-guard.cjs),
// copied without change, so a registry the guard accepts is one this check accepts: comments, either quote, escapes,
// numbers with exponents and trailing commas are fine; imports, types, spreads, calls, other statements and later
// changes are not.
function readRegistry(source) {
  if (source === null) return null;
  let at = 0;
  const tokens = [];
  while (at < source.length) {
    const rest = source.slice(at);
    const space = /^(?:\s+|\/\/[^\r\n\u2028\u2029]*(?:[\r\n\u2028\u2029]|$)|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (space) { at += space[0].length; continue; }
    const string = /^(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*')/.exec(rest);
    if (string) {
      // JSON escapes plus escaped single quotes. No template evaluation or JavaScript string execution.
      const raw = string[0];
      const value = raw[0] === '"' ? JSON.parse(raw) : JSON.parse('"' + raw.slice(1, -1).replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"') + '"');
      tokens.push({ kind: 'string', value }); at += raw.length; continue;
    }
    const word = /^(?:[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (word) { tokens.push({ kind: 'word', value: word[0] }); at += word[0].length; continue; }
    tokens.push({ kind: 'symbol', value: source[at++] });
  }
  let i = 0;
  const is = (value) => tokens[i]?.value === value && tokens[i]?.kind !== 'string';
  const need = (value) => { if (!is(value)) throw new Error(`expected ${value} in a data-only EXPERIMENTS registry`); i += 1; };
  const literal = (depth = 0) => {
    if (depth > 20) throw new Error('registry nesting is too deep');
    if (is('[')) {
      i += 1; const out = [];
      while (!is(']')) { out.push(literal(depth + 1)); if (!is(',')) break; i += 1; }
      need(']'); return out;
    }
    if (is('{')) {
      i += 1; const out = Object.create(null);
      while (!is('}')) {
        const key = tokens[i++];
        if (!key || !['string', 'word'].includes(key.kind) || Object.hasOwn(out, key.value)) throw new Error('invalid or duplicate registry property');
        need(':'); out[key.value] = literal(depth + 1); if (!is(',')) break; i += 1;
      }
      need('}'); return out;
    }
    const token = tokens[i++];
    if (token?.kind === 'string') return token.value;
    if (token?.kind === 'word') {
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      if (token.value === 'null') return null;
      if (/^-?\d/.test(token.value) && Number.isFinite(Number(token.value))) return Number(token.value);
    }
    throw new Error('registry values must be literals (no imports, spreads or executable expressions)');
  };
  need('export'); need('const'); need('EXPERIMENTS'); need('=');
  const result = literal();
  if (is('as')) { i += 1; need('const'); }
  if (is(';')) i += 1;
  if (i !== tokens.length || !Array.isArray(result)) throw new Error('registry must contain only export const EXPERIMENTS = [literal entries]');
  return result;
}
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(readRegistry(fs.readFileSync(registryFile, 'utf8'))), plain(EXPERIMENTS), 'lib/experiments.ts is one literal EXPERIMENTS array, read without running it');
for (const [source, entries] of [
  ["/* data */ export const EXPERIMENTS = [{key:'a-b',status:\"running\",pages:['/'],weights:[50,50,],},] as const; // done\n", [{ key: 'a-b', status: 'running', pages: ['/'], weights: [50, 50] }]],
  ["export const EXPERIMENTS = [{ hypothesis: 'A bolder \\\"Try a tool\\\" call gets more visitors into a tool.', note: 'it\\'s \"quoted\"' }];", [{ hypothesis: 'A bolder "Try a tool" call gets more visitors into a tool.', note: 'it\'s "quoted"' }]],
  ['export const EXPERIMENTS = [{ weights: [5e1, 5E+1], depth: -2.5e-1 }];', [{ weights: [50, 50], depth: -0.25 }]],
  ["export const EXPERIMENTS = [{ constructor: 'x', toString: 'y', hasOwnProperty: 'z' }];", [{ constructor: 'x', toString: 'y', hasOwnProperty: 'z' }]],
]) assert.deepEqual(plain(readRegistry(source)), entries, `Comments, either quote, escapes, exponents, trailing commas and any field name are fine: ${source}`);
for (const bad of ["import { X } from './x';\nexport const EXPERIMENTS = [];", 'export const EXPERIMENTS: readonly ExperimentDefinition[] = [];', 'export type E = {};\nexport const EXPERIMENTS = [];',
  'export const EXPERIMENTS = [...OTHER];', 'export const EXPERIMENTS = [make()];', 'export const EXPERIMENTS = []; EXPERIMENTS.push({ key: "x" });', 'export const EXPERIMENTS = [{ key: `x` }];',
  'export const EXPERIMENTS = [{ key: "a", key: "b" }];', 'const EXPERIMENTS = [];', 'export const EXPERIMENTS = [{ started: 2026 - 10 }];', 'export const EXPERIMENTS = []; // x\u2028EXPERIMENTS.length = 0;',
  'export const EXPERIMENTS = [{ weights: [1e999] }];', 'export const EXPERIMENTS = [' + '['.repeat(25) + ']'.repeat(25) + '];']) {
  assert.throws(() => readRegistry(bad), `Not a data-only registry: ${bad.replace(/\n/g, ' ')}`);
}
const FIXTURE = [
  { key: 'home-hero', variants: ['control', 'short-dek'], pages: ['/'], area: 'hero', status: 'running', started: '2026-10-14', hypothesis: 'A shorter hero line gets more visitors to the first chapter.' },
  { key: 'tool-order', variants: ['control', 'calc-first', 'band-first'], weights: [50, 30, 20], pages: ['/tools', '/tools/pace-calculator'], status: 'running', started: '2026-10-14', hypothesis: 'Listing the calculator first gets more tools used.' },
  { key: 'story-end', variants: ['control', 'cards'], pages: ['/stories/pacing-types'], status: 'paused', started: '2026-10-01', hypothesis: 'Story cards at the end get more next stories opened.' },
];
assert.deepEqual(runtime.experimentProblems(FIXTURE), [], 'The fixture registry is valid');
const refused = (patch, index = 0) => runtime.experimentProblems(FIXTURE.map((def, i) => i === index ? { ...def, ...patch } : def));
for (const patch of [{ key: 'Home_Hero' }, { key: 'hh' }, { key: 'a'.repeat(41) }, { key: '-home' }, { key: 'home--hero' }, { key: 'home-hero-' },
  { variants: ['control'] }, { variants: ['control', 'a', 'b', 'c', 'd'] }, { variants: ['a', 'control'] }, { variants: ['control', 'Short Dek'] }, { variants: ['control', 'control'] }, { variants: ['control', 'x'.repeat(25)] },
  { weights: [50, 49] }, { weights: [50.5, 49.5] }, { weights: [100] }, { weights: [0, 100] }, { weights: ['50', '50'] },
  { pages: [] }, { pages: ['/unknown'] }, { pages: ['/tools?x=1'] }, { pages: ['/other'] }, { pages: ['/courses/Private-Name'] }, { pages: ['/tools/'] }, { pages: ['/', '/'] }, { pages: ['*', '/tools'] }, { pages: '/' },
  { area: 'Hero' }, { area: '' }, { area: 'first screen' }, { area: 'hero-' }, { area: 7 },
  { status: 'live' }, { status: undefined }, { started: '2026-13-01' }, { started: '14/10/2026' }, { started: '2026-02-30' }, { started: undefined },
  { hypothesis: '' }, { hypothesis: 'Line one.\nLine two.' }, { hypothesis: 'Too short' }]) {
  assert.ok(refused(patch).length, `A registry entry with ${JSON.stringify(patch)} is refused`);
}
assert.ok(runtime.experimentProblems([...FIXTURE, { ...FIXTURE[0] }]).length, 'A key used twice is refused');
for (const [patch, index] of [[{ pages: ['*'] }, 2], [{ area: '*' }, 0], [{ area: undefined }, 0], [{ area: 'closing-cta' }, 0]]) assert.deepEqual(refused(patch, index), [], `A registry entry with ${JSON.stringify(patch)} is valid`);
const onPage = (key, pages, area, status = 'running') => ({ ...FIXTURE[0], key, pages, area, status });
assert.equal(runtime.MAX_RUNNING_EXPERIMENTS, 2);
assert.match(runtime.experimentProblems([onPage('test-a', ['/']), onPage('test-b', ['/tools']), onPage('test-c', ['/stories'])]).join(' '), /At most 2 experiments/, 'At most two experiments run at once');
assert.deepEqual(runtime.experimentProblems([onPage('test-a', ['/']), onPage('test-b', ['/tools']), onPage('test-c', ['/stories'], undefined, 'paused'), onPage('test-d', ['/'], undefined, 'paused')]), [], 'Paused experiments do not count');
for (const [a, b] of [[onPage('test-a', ['/']), onPage('test-b', ['/'])], [onPage('test-a', ['/'], 'hero'), onPage('test-b', ['/', '/tools'])], [onPage('test-a', ['/'], 'hero'), onPage('test-b', ['/'], 'hero')], [onPage('test-a', ['*'], 'hero'), onPage('test-b', ['/tools'])], [onPage('test-a', ['/'], '*'), onPage('test-b', ['/'], 'cta')]]) {
  assert.match(runtime.experimentProblems([a, b]).join(' '), /same area of a page/, `${a.key} on ${a.pages} (${a.area ?? 'whole page'}) and ${b.key} on ${b.pages} (${b.area ?? 'whole page'}) overlap`);
}
assert.deepEqual(runtime.experimentProblems([onPage('test-a', ['/'], 'hero'), onPage('test-b', ['/', '/tools'], 'cta')]), [], 'Two running experiments may share a page in different areas');
assert.deepEqual(runtime.experimentProblems([onPage('test-a', ['/']), onPage('test-b', ['/'], undefined, 'paused')]), [], 'A paused experiment occupies nothing');
// The boot script, run in a sandbox that holds only what it may touch: sessionStorage, <html> and Math.random.
assert.equal(runtime.experimentBootScript([]), '', 'No running experiment: no script');
assert.equal(runtime.experimentBootScript([FIXTURE[2]]), '', 'A paused experiment needs no script');
const bootSource = runtime.experimentBootScript(FIXTURE);
assert.doesNotMatch(bootSource, /fetch|XMLHttpRequest|sendBeacon|localStorage|cookie|location|navigator|story-end|<\/script|\(\?<[=!]|=>|\blet\b|\bconst\b|`/, 'The boot script sends nothing, reads only sessionStorage, leaves paused experiments alone and is old-style JavaScript');
function boot(defs, { stored = {}, random = 0.5, storage = 'ok' } = {}) {
  const items = new Map(Object.entries(stored)), writes = [], attributes = {};
  const sessionStorage = {
    getItem(key) { if (storage === 'throw') throw new Error('SecurityError'); return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { if (storage !== 'ok') throw new Error('QuotaExceededError'); writes.push([key, String(value)]); items.set(key, String(value)); },
  };
  const sandbox = { document: { documentElement: { setAttribute(name, value) { attributes[name] = value; } } }, Math: { random: () => random } };
  if (storage === 'blocked') Object.defineProperty(sandbox, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
  else sandbox.sessionStorage = sessionStorage;
  vm.runInNewContext(runtime.experimentBootScript(defs), sandbox);
  return { attributes, writes, items: Object.fromEntries(items) };
}
let booted = boot(FIXTURE, { random: 0.6 });
assert.deepEqual(booted.attributes, { 'data-exp-home-hero': 'short-dek', 'data-exp-tool-order': 'calc-first' }, 'A weighted pick for each running experiment, named on <html>');
assert.deepEqual(booted.writes, [['pace-notes-exp:home-hero', 'short-dek'], ['pace-notes-exp:tool-order', 'calc-first']], 'and kept in sessionStorage, holding only the variant');
booted = boot(FIXTURE, { random: 0, stored: { 'pace-notes-exp:home-hero': 'short-dek', 'pace-notes-exp:tool-order': 'band-first', 'pace-notes-exp:story-end': 'cards' } });
assert.deepEqual(booted.attributes, { 'data-exp-home-hero': 'short-dek', 'data-exp-tool-order': 'band-first' }, 'A stored variant persists for the tab');
assert.deepEqual(booted.writes, [], 'and is not written again');
booted = boot(FIXTURE, { random: 0.95, stored: { 'pace-notes-exp:home-hero': 'Private Name', 'pace-notes-exp:tool-order': 'control ' } });
assert.deepEqual(booted.attributes, { 'data-exp-home-hero': 'short-dek', 'data-exp-tool-order': 'band-first' }, 'An invalid stored value is replaced by a fresh pick');
assert.deepEqual(booted.items, { 'pace-notes-exp:home-hero': 'short-dek', 'pace-notes-exp:tool-order': 'band-first' });
for (const storage of ['throw', 'full', 'blocked']) {
  booted = boot(FIXTURE, { storage, random: 0.95 });
  assert.deepEqual(booted.attributes, {}, `With sessionStorage failing (${storage}) the tab sees the control and no variant is named, so none is reported`);
  assert.deepEqual(booted.writes, []);
}
assert.deepEqual([0, 0.4999, 0.5, 0.7999, 0.8, 0.9999].map(random => boot([FIXTURE[1]], { random }).attributes['data-exp-tool-order']), ['control', 'control', 'calc-first', 'calc-first', 'band-first', 'band-first'], 'Weights 50/30/20 split the random draw');
const three = { ...FIXTURE[0], key: 'three-way', variants: ['control', 'b', 'c'] };
assert.deepEqual([0, 0.3333, 0.3334, 0.6666, 0.6667, 0.99999].map(random => boot([three], { random }).attributes['data-exp-three-way']), ['control', 'control', 'b', 'b', 'c', 'c'], 'Without weights the variants share the draw equally');
// The CSS: an element wrapped for a variant shows only when <html> names that variant; otherwise the control shows.
function shown(css, html, show) {
  let best = null;
  for (const [, selector, display] of css.matchAll(/([^{}]+)\{display:(none|contents)\}/g)) {
    let match, specificity;
    const scoped = selector.match(/^html\[([\w-]+)="([^"]+)"\] \[data-exp-show="([^"]+)"\]$/);
    if (selector === '[data-exp-show]') { match = true; specificity = 10; }
    else if (selector === '[data-exp-show$=":control"]') { match = show.endsWith(':control'); specificity = 10; }
    else if (scoped) { match = html[scoped[1]] === scoped[2] && show === scoped[3]; specificity = 21; }
    else assert.fail(`Unexpected experiment CSS selector ${selector}`);
    if (match && (!best || specificity >= best.specificity)) best = { specificity, display };
  }
  return best?.display === 'contents';
}
const css = runtime.experimentCss(FIXTURE);
const visible = (html, keys) => keys.filter(show => shown(css, html, show));
const every = ['home-hero:control', 'home-hero:short-dek', 'tool-order:control', 'tool-order:calc-first', 'tool-order:band-first', 'story-end:control', 'story-end:cards', 'gone:control', 'gone:new'];
assert.deepEqual(visible({}, every), ['home-hero:control', 'tool-order:control', 'story-end:control', 'gone:control'], 'Without JavaScript, or with storage blocked, only the control shows');
assert.deepEqual(visible({ 'data-exp-home-hero': 'short-dek', 'data-exp-tool-order': 'band-first' }, every), ['home-hero:short-dek', 'tool-order:band-first', 'story-end:control', 'gone:control'], 'The named variant replaces the control');
assert.deepEqual(visible({ 'data-exp-story-end': 'cards', 'data-exp-gone': 'new', 'data-exp-home-hero': 'Private' }, every), ['home-hero:control', 'tool-order:control', 'story-end:control', 'gone:control'], 'A paused or removed experiment, or an unknown variant, shows the control');
assert.equal(runtime.experimentCss([]), '[data-exp-show]{display:none}[data-exp-show$=":control"]{display:contents}', 'With no experiment the CSS still hides leftover variant markup');
// activeVariants reads <html>, and only for running experiments and their own variants.
global.document = { documentElement: { getAttribute: name => ({ 'data-exp-home-hero': 'short-dek', 'data-exp-tool-order': 'Private Name', 'data-exp-story-end': 'cards' })[name] ?? null } };
assert.deepEqual(runtime.activeVariants(FIXTURE), { 'home-hero': 'short-dek' });
delete global.document;
assert.deepEqual(runtime.activeVariants(FIXTURE), {}, 'No document (the build): no variant');
// The event allowlist keeps $feature/<key> only for a running experiment and one of its variants. These checks put the
// fixture in place of the registry's entries and put the entries back afterwards, so they hold whatever the registry
// holds (and nothing else here sees the fixture).
const registryEntries = EXPERIMENTS.splice(0, EXPERIMENTS.length);
try {
  assert.equal(kept('$pageview', { '$feature/home-hero': 'short-dek' })['$feature/home-hero'], undefined, 'An experiment not in the registry is dropped');
  EXPERIMENTS.push(...FIXTURE);
  const featured = kept('$pageview', { '$feature/home-hero': 'short-dek', '$feature/tool-order': 'band-first', '$feature/story-end': 'cards', '$feature/gone': 'control', '$feature/home-hero-2': 'control', $feature_flag: 'x', $active_feature_flags: ['home-hero'] });
  assert.equal(featured['$feature/home-hero'], 'short-dek'); assert.equal(featured['$feature/tool-order'], 'band-first');
  for (const key of ['$feature/story-end', '$feature/gone', '$feature/home-hero-2', '$feature_flag', '$active_feature_flags']) assert.equal(featured[key], undefined, `${key} is dropped (paused, unknown or not an experiment property)`);
  for (const value of ['Private Name', 'Control', 'short-dek ', 1, true, null, ['short-dek']]) assert.equal(kept('tool_used', { '$feature/home-hero': value })['$feature/home-hero'], undefined, `$feature/home-hero=${JSON.stringify(value)} is not one of its variants`);
  for (const event of [...Object.keys(enumerated), '$pageview', '$pageleave', '$web_vitals', 'runner_search_submitted']) assert.equal(kept(event, { '$feature/home-hero': 'control' })['$feature/home-hero'], 'control', `${event} carries the tab's variant`);
} finally { EXPERIMENTS.splice(0, EXPERIMENTS.length, ...registryEntries); }

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
assert.equal(replay.replayAttribute('href', 'https://www.splithappens.run/courses/berlin?units=km', false, 'a'), 'https://splithappens.run/courses/berlin');
assert.equal(replay.replayAttribute('href', 'https://splithappens.run/courses/Private-Name', false, 'a'), 'https://splithappens.run/courses', 'A course path that is not a published course falls to its section');
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

// Source guards for the visit signals.
const feedbackSource = read('components/PageFeedback.tsx');
assert.doesNotMatch(feedbackSource, /<input|<textarea|<select|contentEditable|contenteditable/i, 'PageFeedback has no text box: nothing typed can be sent');
for (const file of ['components/SiteAnalytics.tsx', 'components/SectionTracker.tsx']) assert.doesNotMatch(read(file), /\.value\b|textContent|innerText|innerHTML|\.id\b|getAttribute|\.name\b/, `${file} never reads what was typed or which element it was`);
const analyticsSource = read('lib/analytics.ts');
const failureCalls = ['app', 'components', 'lib', 'hooks', 'context'].flatMap(sourceFiles).flatMap(file => [...read(file).matchAll(/\btrackFailure\(([^)]*)\)/g)].map(m => [file, m[1].trim()]));
for (const [file, argument] of failureCalls) {
  if (file === 'lib/analytics.ts' && argument.startsWith('category:')) continue; // The definition.
  assert.match(argument, /^'(?:js_error|unhandled_rejection|chunk_load|data_fetch|render)'$/, `${file}: trackFailure(${argument}) must name one literal category, never a message`);
}
for (const [file, count] of [['components/SiteAnalytics.tsx', 6], ['app/error.tsx', 2], ['app/global-error.tsx', 2], ['components/QuestionViz.tsx', 2], ['lib/data-fetch.ts', 2]]) assert.equal(failureCalls.filter(([f]) => f === file).length, count, `${file} reports its failures`);
// A failed file reloads the page, usually before any of the site's code runs (the <head> script in lib/chunk-reload.ts):
// the page it reloads into reports chunk_load, once, and a page that is about to reload reports nothing.
assert.match(read('components/SiteAnalytics.tsx'), /if \(reloadedAfterChunkError\(\)\) trackFailure\('chunk_load'\);/, 'The page a failed file reloaded reports it');
for (const file of ['app/error.tsx', 'app/global-error.tsx']) assert.match(read(file), /if \(reloadAfterChunkError\(error\)\) return;\s*if \(chunkLoadFailed\(error\)\) trackFailure\('chunk_load'\); else trackFailure\('render'\);/, `${file} reports a failure only when the page is not reloading for it`);
{
  const { reloadedAfterChunkError } = require('../lib/chunk-reload.ts');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance'), savedWindow = global.window;
  const load = (type, marker, storage = 'ok') => {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { getEntriesByType: kind => kind === 'navigation' && type ? [{ type }] : [] } });
    global.window = { sessionStorage: { getItem(key) { if (storage === 'throw') throw new Error('SecurityError'); return key === 'pace-notes-chunk-reload' && marker !== undefined ? String(marker) : null; } } };
    return reloadedAfterChunkError();
  };
  try {
    assert.equal(load('reload', Date.now() - 1500), true, 'A reload moments after a failed file is that failure');
    for (const [type, marker, storage, label] of [['navigate', Date.now() - 1500, 'ok', 'a new visit in the same tab'], ['back_forward', Date.now() - 1500, 'ok', 'Back to the page'], ['reload', Date.now() - 60_000, 'ok', 'the visitor reloading later'],
      ['reload', undefined, 'ok', 'a reload with no failed file'], ['reload', Date.now(), 'throw', 'storage that cannot be read'], [undefined, Date.now(), 'ok', 'a browser without navigation timing']]) assert.equal(load(type, marker, storage), false, `Not reported: ${label}`);
  } finally { Object.defineProperty(globalThis, 'performance', descriptor); global.window = savedWindow; }
}
assert.match(read('components/UnitsProvider.tsx'), /const setUnits = useCallback\(\(next: UnitSystem\) => \{\s*if \(next === shown\.current\) return;\s*shown\.current = next;\s*trackAnalytics\('units_changed'/, 'units_changed is sent only when the units really change');
assert.ok(hasClasses(read('components/tools/ui.tsx'), 'tool-share', 'share-bar'), 'ShareBar carries .share-bar');
// The controls that count as an edit: every tool's workspace, and the controls a tool keeps outside it, marked
// data-tool-controls. Buttons that only scroll, print or copy the link are not edits (.share-bar, data-not-edit).
const siteAnalyticsSource = read('components/SiteAnalytics.tsx');
assert.match(siteAnalyticsSource, /const TOOL_CONTROLS = '\.tool-workspace, \[data-tool-controls\]';\s*const NOT_EDITS = '\.share-bar, \[data-not-edit\]';[\s\S]*!target\?\.closest\(TOOL_CONTROLS\) \|\| target\.closest\(NOT_EDITS\)/, 'Edits are counted in the tool controls, without the copy-link, print and jump buttons');
assert.doesNotMatch(siteAnalyticsSource, /closest\('\.tool-share'\)|NOT_EDITS = '[^']*\.tool-share/, 'Other .tool-share rows (faster or slower paces, the projector fallbacks) are edits');
for (const [file, opening] of [['components/tools/PaceCalculator.tsx', '<div className="tool-tabs no-print"'], ['components/tools/PaceCalculator.tsx', '<section className="tool-panel panel-plain pace-chart"'], ['components/tools/CourseChooser.tsx', '<div className="course-chooser-list ph-no-capture"']]) {
  const tag = read(file).split(opening)[1];
  assert.ok(tag !== undefined && /^[^>]*\sdata-tool-controls[\s>]/.test(tag), `${file}: ${opening}> is marked data-tool-controls, so its controls count as edits`);
}
for (const file of sourceFiles('components/tools')) {
  for (const m of read(file).matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?<\/button>/g)) {
    if (/window\.print\(\)|onPrint\(|scrollIntoView|onClick=\{toResult\}/.test(m[0])) assert.match(m[0], /\sdata-not-edit[\s>]/, `${file}: a print or jump button is marked data-not-edit: ${m[0].slice(0, 90)}`);
  }
}
// Every event the site can send is described on /privacy and in docs/ANALYTICS.md.
const eventKeys = [...policySource.match(/export type AnalyticsEvents = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
assert.ok(eventKeys.length >= 12 && eventKeys.includes('section_viewed'), 'AnalyticsEvents read from lib/analytics-policy.ts');
const privacySource = read('app/privacy/page.tsx');
const counted = privacySource.match(/const COUNTED: Record<keyof AnalyticsEvents, string> = \{([\s\S]*?)\n\};/);
assert.ok(counted && /\{Object\.values\(COUNTED\)\.map/.test(privacySource), '/privacy lists every counted action from its COUNTED map');
const analyticsDoc = read('docs/ANALYTICS.md');
for (const key of eventKeys) {
  assert.match(counted[1], new RegExp(`^\\s+${key}: '`, 'm'), `/privacy describes ${key}`);
  assert.match(analyticsDoc, new RegExp(`^\\| \`${key}\` \\|`, 'm'), `docs/ANALYTICS.md's events table lists ${key}`);
}
for (const key of ['$pageview', '$pageleave', '$web_vitals']) assert.match(analyticsDoc, new RegExp(`^\\| \`\\${key}\` \\|`, 'm'), `docs/ANALYTICS.md's events table lists ${key}`);
for (const key of ['pace-notes-exp:<key>', 'pace-notes-chunk-reload']) assert.ok(analyticsDoc.includes('`' + key + '`'), `docs/ANALYTICS.md names the storage key ${key}`);
// Every data request in the browser goes through lib/data-fetch.ts, so a failed one is reported (as its kind only).
// Files that run only at build time may call fetch directly; none does today.
const BUILD_TIME_FETCH = [];
const withoutComments = file => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
for (const file of ['app', 'components', 'lib', 'hooks', 'context'].flatMap(sourceFiles)) {
  if (file === path.join('lib', 'data-fetch.ts') || BUILD_TIME_FETCH.includes(file)) continue;
  assert.doesNotMatch(withoutComments(file), /(?<![\w$])fetch\s*\(|\.fetch\s*\(/, `${file} calls fetch directly; use dataFetch from lib/data-fetch.ts so failures are reported`);
}
// Sections whose first view is counted: known ids only, and the home page marks its parts in reading order.
for (const file of ['app', 'components'].flatMap(sourceFiles)) {
  for (const m of withoutComments(file).matchAll(/data-track-section=(?:"([^"]*)"|\{([^}]*)\})/g)) assert.ok(m[1] !== undefined && policy.TRACKED_SECTIONS.includes(m[1]), `${file}: data-track-section ${m[1] ?? m[2]} must be a literal id from TRACKED_SECTIONS`);
}
const homeSource = read('app/(home)/page.tsx');
const homeSections = [...homeSource.matchAll(/data-track-section="([^"]+)"/g)];
const chapters = homeSections.map(m => m[1]).filter(id => id.startsWith('chapter-'));
assert.ok(chapters.length >= 4, 'The home page chapters are marked');
assert.deepEqual(homeSections.map(m => m[1]), ['hero', ...chapters.map((_, i) => 'chapter-' + (i + 1)), 'stories', 'tools', 'analyses', 'cta'], 'Home sections: hero, the chapters in order, all stories, tools, the ten analyses and the closing call');
for (const m of homeSections.filter(m => m[1].startsWith('chapter-'))) assert.equal(homeSource.slice(m.index).match(/Chapter (\d+) ·/)?.[1], m[1].slice(8).padStart(2, '0'), `${m[1]} marks the chapter it is numbered as`);
const layoutSource = read('app/layout.tsx');
assert.match(layoutSource, /<head>[^\n]*<ExperimentHead \/>[^\n]*<\/head>/, 'The experiments CSS and script are in <head>, before the page paints');
// A classic inline script: the parser runs it before building the body, so before the first paint. An async or module
// script can run after that paint on a slow phone, and the visitor would see the control first.
assert.match(read('components/Experiment.tsx'), /\{script \? <script dangerouslySetInnerHTML=\{\{ __html: script \}\} \/> : null\}/, 'The experiment boot script is a classic, parser-blocking script');
assert.equal((layoutSource.match(/<SectionTracker \/>/g) || []).length, 1, 'SectionTracker is mounted once, in the root layout');

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
  const events = [], storage = new Map(), session = new Map(), recordingCalls = [], idle = [], captureOptions = [], registered = {}, addresses = [];
  const plugins = { getRecordConsolePlugin() {}, getRecordNetworkPlugin() {} };
  const sdk = {
    config: {},
    init(_key, options) { config = options; sdk.config = { ...options }; },
    // The real SDK adds its random tab, session and window IDs and the registered (super) properties to every event
    // before before_send runs.
    capture(event, properties, options) { captureOptions.push(options); const safe = config.before_send({ event, properties: { ...registered, ...properties, distinct_id: TAB_ID, $session_id: SESSION_ID, $window_id: WINDOW_ID } }); if (safe) events.push(safe); },
    register(properties) { Object.assign(registered, properties); },
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
  // history.replaceState records each address the page is given (the campaign tags are removed with it).
  const history = { state: { tree: 'next' }, replaceState(state, _unused, url) { assert.equal(state, history.state, 'The router state is kept'); addresses.push(url); const parsed = new URL(url, 'https://splithappens.run'); Object.assign(window.location, { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash }); } };
  global.window = { location: { hostname: 'splithappens.run', pathname: '/', search: '', hash: '' }, history, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, sessionStorage,
    dispatchEvent: event => target.dispatchEvent(event), requestIdleCallback: (callback, options) => { assert.ok(options.timeout > 0, 'Idle callbacks have a timeout'); idle.push(callback); return idle.length; } };
  // <html> names no experiment variant (the boot script found no running experiment, or storage was blocked).
  const html = { getAttribute: () => null };
  global.document = { referrer: 'https://www.google.com/search?q=Private+Name', readyState: 'complete', documentElement: html };
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
  assert.match(source, /Promise\.all\(\[import\('posthog-js'\), import\('posthog-js\/dist\/posthog-recorder'\), import\('\.\/replay-policy'\)\]\)/, 'The recorder and the replay policy (with the Web Vitals code) are imported inside the dynamic import');
  assert.doesNotMatch(source, /posthog-js\/dist\/web-vitals|from 'web-vitals'/, "The SDK's Web Vitals bundle is not loaded; the site measures them in lib/replay-policy.ts");
  assert.match(read('lib/replay-policy.ts'), /^import \{ onCLS, onFCP, onINP, onLCP, type Metric \} from 'web-vitals';$/m, 'The Web Vitals library comes with the lazily loaded replay policy');
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
  assert.equal(config.enable_recording_console_log, false);
  assert.deepEqual(config.capture_performance, { web_vitals: false, network_timing: false },
    "The SDK's own Web Vitals capture is off (the site sends them; see measureWebVitals), and recordings hold no network timing");
  assert.equal(config.capture_pageleave, true, '$pageleave carries the last page view\'s time on page and scroll depth');
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
  for (const key of ['autocapture', 'rageclick', 'capture_pageview', 'capture_dead_clicks', 'capture_exceptions', 'capture_heatmaps', 'save_referrer', 'save_campaign_params']) assert.equal(config[key], false, `${key} is off`);
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

  // The visit signals, with fresh modules and a working SDK: campaign tags, failures, event times, experiments and data requests.
  sdk.capture = function(event, properties, options) { captureOptions.push(options); const safe = config.before_send({ event, properties: { ...registered, ...properties, distinct_id: TAB_ID, $session_id: SESSION_ID, $window_id: WINDOW_ID } }); if (safe) events.push(safe); };
  window.sessionStorage = sessionStorage; storage.clear(); navigator.doNotTrack = '0'; navigator.globalPrivacyControl = false;
  const signals = () => { for (const file of ['../lib/analytics.ts', '../lib/data-fetch.ts']) delete require.cache[require.resolve(file)]; return { analytics: require('../lib/analytics.ts'), data: require('../lib/data-fetch.ts') }; };
  const visit = (pathname, search = '', hash = '') => { go(pathname, search); window.location.hash = hash; };
  let fresh2 = signals();
  events.length = 0; addresses.length = 0; captureOptions.length = 0;
  visit('/tools/pace-calculator', '?utm_source=instagram&utm_medium=social&utm_content=bio&goal=3:30&dist=marathon', '#result');
  const asked = Date.now();
  fresh2.analytics.trackPage('/tools/pace-calculator'); await settle();
  const landing = events.at(-1);
  assert.equal(landing.event, '$pageview');
  assert.deepEqual([landing.properties.utm_source, landing.properties.utm_medium, landing.properties.utm_content], ['instagram', 'social', 'bio'], 'The first page view carries the fixed Instagram tags');
  assert.equal(landing.properties.$current_url, 'https://splithappens.run/tools/pace-calculator');
  assert.deepEqual(addresses, ['/tools/pace-calculator?goal=3:30&dist=marathon#result'], "Every utm_* leaves the address; the tool's own query stays as written");
  const when = captureOptions.at(-1)?.timestamp;
  assert.ok(when instanceof Date && when.getTime() >= asked && when.getTime() <= Date.now(), 'An event asked for before the SDK loaded carries the moment it was asked for');
  visit('/stories'); fresh2.analytics.trackPage('/stories'); await settle();
  assert.equal(events.at(-1).event, '$pageview'); assert.equal(events.at(-1).properties.utm_source, undefined, 'Only the first page view of a tab carries campaign tags');
  // posthog-js sends any capture given options at once, one request each; once it has loaded, events join its batch.
  assert.equal(captureOptions.at(-1), undefined, 'An event once the SDK has loaded is captured without options, so it joins the batch');
  assert.equal(addresses.length, 1, 'An address without tags is left alone');
  for (const search of ['?utm_source=instagram&utm_medium=social&utm_content=bio&utm_campaign=Private+Name', '?utm_source=instagram&utm_source=Private', '?utm_source=facebook', '?utm_content=Private%20Name&utm_source=instagram']) {
    fresh2 = signals(); events.length = 0; addresses.length = 0;
    visit('/', search); fresh2.analytics.trackPage('/'); await settle();
    assert.equal(events.at(-1).event, '$pageview');
    assert.doesNotMatch(JSON.stringify(events.at(-1)), /utm_|Private|instagram|facebook/, `${search}: any tag off the list means none is sent`);
    assert.deepEqual(addresses, ['/'], `${search}: the tags still leave the address`);
  }
  fresh2 = signals(); addresses.length = 0; const before = events.length;
  navigator.doNotTrack = '1'; visit('/about', '?utm_source=instagram&utm_content=Private&units=km'); fresh2.analytics.trackPage('/about'); await settle(); navigator.doNotTrack = '0';
  assert.deepEqual(addresses, ['/about?units=km'], 'The tags leave the address with analytics off as well');
  assert.equal(events.length, before, 'and nothing is sent');
  // Reading depth is the site's own, per page view: a client-side navigation to a longer page does not dilute the story's
  // depth, the previous page is the one that was open, $pageleave names the page it leaves, and a page restored from the
  // back/forward cache starts a new page view without reporting the closed one again.
  {
    fresh2 = signals(); events.length = 0;
    const scrolled = [];
    const page = { ...html, scrollHeight: 6000, clientHeight: 800, scrollTop: 0 };
    window.addEventListener = (type, listener) => { if (type === 'scroll') scrolled.push(listener); };
    global.document.documentElement = page;
    const scrollTo = y => { window.scrollY = y; for (const listener of scrolled) listener(); };
    // The SDK adds its own reading figures to a page view and a page leave; the site's replace them.
    const sdkCapture = sdk.capture;
    sdk.capture = (event, properties, options) => sdkCapture(event, event === '$pageview' ? { ...properties, $prev_pageview_pathname: window.location.pathname, $prev_pageview_max_scroll_percentage: 0.5, $prev_pageview_duration: 184 } : properties, options);
    try {
      visit('/stories/final-kick'); fresh2.analytics.trackPage('/stories/final-kick'); await settle();
      const first = events.at(-1).properties;
      assert.deepEqual(Object.keys(first).filter(key => key.startsWith('$prev_pageview_')), [], 'The first page view of a tab has no previous page');
      assert.equal(scrolled.length, 1, 'One scroll listener for the tab');
      for (const y of [1200, 3600, 5200]) scrollTo(y);
      // Next.js lays out the next, longer page and scrolls it to the top before the next page view is sent.
      visit('/'); page.scrollHeight = 12000; scrollTo(0); scrollTo(400);
      fresh2.analytics.trackPage('/'); await settle();
      const next = events.at(-1).properties;
      assert.deepEqual([next.$prev_pageview_pathname, next.$prev_pageview_max_scroll_percentage, next.$prev_pageview_max_content_percentage, next.$prev_pageview_duration], ['/stories/final-kick', 1, 1, 184], 'A story read to the end stays read to the end, under its own path');
      scrollTo(2600);
      const leave = config.before_send({ event: '$pageleave', properties: { ...dirty.properties, $current_url: 'https://splithappens.run/', $prev_pageview_pathname: '/stories/final-kick', $prev_pageview_max_scroll_percentage: 0.1, $prev_pageview_duration: 31.4 } }).properties;
      assert.deepEqual([leave.$pathname, leave.$prev_pageview_pathname, leave.$prev_pageview_max_scroll_percentage, leave.$prev_pageview_max_content_percentage, leave.$prev_pageview_duration], ['/', '/', 0.25, 0.3, 31], '$pageleave reports the page it leaves, measured by the site');
      fresh2.analytics.trackRestoredPage(); await settle();
      const restored = events.at(-1);
      assert.equal(restored.event, '$pageview', 'A page restored from the back/forward cache is a new page view');
      assert.deepEqual(Object.keys(restored.properties).filter(key => key.startsWith('$prev_pageview_')), [], 'and it does not report the page view its $pageleave already closed');
      // Two page views before the SDK has loaded: the second names the page the visitor was on, not the one now open.
      fresh2 = signals(); events.length = 0;
      visit('/stories'); fresh2.analytics.trackPage('/stories'); scrollTo(900);
      visit('/stories/pacing-types'); fresh2.analytics.trackPage('/stories/pacing-types'); await settle();
      assert.deepEqual(events.slice(-2).map(event => [event.properties.$pathname, event.properties.$prev_pageview_pathname]), [['/stories', undefined], ['/stories/pacing-types', '/stories']], 'A quick navigation names the right previous page');
      assert.ok(events.every(event => !('pace_notes_previous_page' in event.properties)), 'The site\'s own note of the previous page never leaves');
    } finally { sdk.capture = sdkCapture; delete window.addEventListener; delete window.scrollY; global.document.documentElement = html; }
  }
  // Failures: one per kind per page view, five per page load, and only the kind.
  fresh2 = signals(); events.length = 0;
  visit('/tools/pace-band'); fresh2.analytics.trackPage('/tools/pace-band'); await settle();
  const failures = () => events.filter(event => event.event === 'site_error').map(event => event.properties.category);
  for (let i = 0; i < 4; i++) fresh2.analytics.trackFailure('js_error');
  fresh2.analytics.trackFailure('data_fetch'); fresh2.analytics.trackFailure('chunk_load'); fresh2.analytics.trackFailure('data_fetch'); await settle();
  assert.deepEqual(failures(), ['js_error', 'data_fetch', 'chunk_load'], 'At most one report per kind of failure per page view');
  visit('/tools/predictor'); fresh2.analytics.trackPage('/tools/predictor');
  for (const category of ['js_error', 'render', 'unhandled_rejection', 'data_fetch']) fresh2.analytics.trackFailure(category); await settle();
  assert.deepEqual(failures(), ['js_error', 'data_fetch', 'chunk_load', 'js_error', 'render'], 'and at most five per page load, so a loop of errors cannot flood the project');
  assert.deepEqual(Object.keys(events.find(event => event.event === 'site_error').properties).filter(key => !key.startsWith('$') && !['token', 'distinct_id'].includes(key)), ['category']);
  // The trackers as the page runs them (components/SiteAnalytics.tsx, SectionTracker.tsx and PageFeedback.tsx), with a
  // minimal React: state, effects (after each render whose dependencies changed, the previous cleanup first) and
  // external stores. Each page view sends its first edit, each section's first view and each kind of failure once. A
  // page restored from the back/forward cache (pageshow with persisted) is a new page view, so each counts once more,
  // within the five failures per page load; "Was this useful?" keeps the answer already given on that page.
  {
    const COMPONENTS = path.join(__dirname, '../components') + path.sep;
    let hooks = null;
    const react = { useId: () => ':r0:', ...Object.fromEntries(['useState', 'useEffect', 'useSyncExternalStore'].map(name => [name, (...args) => hooks[name](...args)])) };
    const navigation = { usePathname: () => window.location.pathname };
    const mount = Component => {
      const slots = [], host = { tree: null };
      host.render = () => {
        const effects = [];
        let index = 0;
        hooks = {
          useState(initial) { const slot = slots[index++] ??= { value: initial }; return [slot.value, value => { slot.value = value; host.render(); }]; },
          useEffect(effect, deps) { const i = index++, slot = slots[i]; if (!slot || deps.some((dep, k) => !Object.is(dep, slot.deps[k]))) effects.push(() => { slot?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
          useSyncExternalStore(subscribe, get) { slots[index++] ??= { cleanup: subscribe(() => host.render()) }; return get(); },
        };
        host.tree = Component({});
        hooks = null;
        for (const run of effects) run();
      };
      host.unmount = () => { for (const slot of slots) if (typeof slot?.cleanup === 'function') slot.cleanup(); };
      host.render();
      return host;
    };
    const component = file => { const name = require.resolve(`../components/${file}.tsx`); delete require.cache[name]; return require(name).default; };
    const listeners = () => {
      const all = new Map();
      return { addEventListener: (type, fn) => { all.set(type, [...(all.get(type) || []), fn]); }, removeEventListener: (type, fn) => { all.set(type, (all.get(type) || []).filter(other => other !== fn)); },
        fire: (type, event = {}) => { for (const fn of all.get(type) || []) fn({ type, ...event }); } };
    };
    const win = listeners(), doc = listeners(), observers = new Set();
    class Element { closest() { return null; } }
    // A field in a tool's workspace, a site script that failed to load, and the home page's first two sections.
    const field = Object.assign(new Element(), { closest: selector => selector.includes('.tool-workspace') ? field : null });
    const HTMLScriptElement = class extends Element {}, script = Object.assign(new HTMLScriptElement(), { src: 'https://splithappens.run/_next/static/chunks/app/page-e2e.js' });
    const hero = { dataset: { trackSection: 'hero' } }, chapter = { dataset: { trackSection: 'chapter-1' } };
    // A section wholly on screen: each observer still watching it is told, as the browser does when it first observes one.
    const show = section => { for (const observer of [...observers]) if (observer.targets.has(section)) observer.callback([{ target: section, isIntersecting: true, intersectionRect: { height: 400 }, boundingClientRect: { height: 400 }, rootBounds: { height: 800 } }]); };
    const restore = () => win.fire('pageshow', { persisted: true });
    const loadNow = Module._load;
    Module._load = function(request, parent, ...rest) {
      if (parent?.filename?.startsWith(COMPONENTS) && request === 'react') return react;
      if (parent?.filename?.startsWith(COMPONENTS) && request === 'next/navigation') return navigation;
      return loadNow.call(this, request, parent, ...rest);
    };
    Object.assign(global, { Element, HTMLScriptElement, HTMLLinkElement: class extends Element {}, IntersectionObserver: class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this); }
      observe(target) { this.targets.add(target); } unobserve(target) { this.targets.delete(target); } disconnect() { this.targets.clear(); observers.delete(this); }
    } });
    Object.assign(window, { addEventListener: win.addEventListener, removeEventListener: win.removeEventListener });
    Object.assign(global.document, { addEventListener: doc.addEventListener, removeEventListener: doc.removeEventListener, querySelectorAll: () => [hero, chapter], documentElement: { ...html, scrollHeight: 2400, clientHeight: 800, scrollTop: 0 } });
    const mounted = [];
    try {
      fresh2 = signals(); events.length = 0;
      const signal = event => event.event === 'tool_used' ? event.properties.action : event.event === 'section_viewed' ? event.properties.section : event.event === 'site_error' ? event.properties.category : event.event === 'page_feedback' ? `answer:${event.properties.answer}` : event.event;
      const since = start => events.slice(start).map(signal);
      const edit = () => { doc.fire('input', { target: field }); doc.fire('input', { target: field }); };
      const fail = () => { win.fire('error', { target: window, message: 'TypeError: Private Name is not defined' }); win.fire('error', { target: window, message: 'TypeError: again' }); win.fire('unhandledrejection', { reason: new Error('Private Name') }); };
      visit('/');
      const site = mount(component('SiteAnalytics')); mounted.push(site, mount(component('SectionTracker')));
      show(hero); show(hero); show(chapter); win.fire('pageshow', { persisted: false }); await settle();
      assert.deepEqual(since(0), ['$pageview', 'hero', 'chapter-1'], 'Each section counts once per page view, and a page shown from a normal load is no new page view');
      restore(); show(hero); show(hero); show(chapter); await settle();
      assert.deepEqual(since(3), ['$pageview', 'hero', 'chapter-1'], 'A page restored from the back/forward cache is a new page view: a section seen before counts once more');
      visit('/tools/pace-calculator'); site.render();
      const answers = mount(component('PageFeedback')); mounted.push(answers);
      const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
      const button = label => elements(answers.tree).find(node => node.type === 'button' && node.props.children === label);
      const thanked = () => /Thank you/.test(elements(answers.tree).find(node => node.props?.role === 'status').props.children);
      show(hero); edit(); fail(); button('Yes').props.onClick(); await settle();
      assert.deepEqual(since(6), ['$pageview', 'hero', 'edit', 'js_error', 'unhandled_rejection', 'answer:yes'], 'A client-side navigation is a new page view: a section seen before counts once more, one edit, one report per kind of failure, one answer');
      restore(); edit(); fail(); win.fire('error', { target: script }); button('Yes').props.onClick(); button('No').props.onClick(); await settle();
      assert.deepEqual(since(12), ['$pageview', 'edit', 'js_error', 'unhandled_rejection', 'chunk_load'], 'After a restore the first edit and each kind of failure count once more, and the answer already given is not asked for again');
      assert.ok(button('Yes').props['aria-pressed'] === true && button('No').props['aria-disabled'] === true && thanked(), 'The restored page still shows its answer and thanks the visitor');
      restore(); edit(); fail(); win.fire('error', { target: script }); await settle();
      assert.deepEqual(since(17), ['$pageview', 'edit'], 'Failures stay within five per page load, restores included');
      assert.equal(failures().length, 5);
      assert.doesNotMatch(JSON.stringify(events), /Private Name|TypeError|page-e2e/, 'Failures are sent by kind only');
      visit('/tools/predictor'); answers.render();
      assert.ok(button('Yes').props['aria-pressed'] === false && !thanked(), 'Another page starts unanswered');
    } finally {
      for (const host of mounted) host.unmount();
      Module._load = loadNow;
      for (const key of ['Element', 'HTMLScriptElement', 'HTMLLinkElement', 'IntersectionObserver']) delete global[key];
      delete window.addEventListener; delete window.removeEventListener;
      for (const key of ['addEventListener', 'removeEventListener', 'querySelectorAll']) delete global.document[key];
      global.document.documentElement = html;
    }
    assert.equal(observers.size, 0, 'SectionTracker disconnects its observer');
  }
  // Data requests: a failure or error status is reported as data_fetch; the response or error is passed on unchanged.
  fresh2 = signals(); events.length = 0;
  visit('/tools/projector'); fresh2.analytics.trackPage('/tools/projector'); await settle();
  const previousFetch = global.fetch;
  const networkError = new TypeError('Failed to fetch'), served = new Response('{}', { status: 200 }), missing = new Response('', { status: 404 });
  let mode = 'ok';
  global.fetch = async (_url, init) => { if (mode === 'abort') throw new DOMException('Aborted', 'AbortError'); if (mode === 'network') { if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); throw networkError; } return mode === '404' ? missing : served; };
  try {
    const reports = () => failures().filter(category => category === 'data_fetch').length;
    assert.equal(await fresh2.data.dataFetch('/data/insights/tools/projector.json?v=1', {}), served, 'dataFetch returns what fetch returns'); await settle();
    assert.equal(reports(), 0);
    mode = 'abort'; await assert.rejects(fresh2.data.dataFetch('/data/x.json'), { name: 'AbortError' }); await settle();
    const cancelled = new AbortController(); cancelled.abort();
    mode = 'network'; await assert.rejects(fresh2.data.dataFetch('/data/x.json', { signal: cancelled.signal }), { name: 'AbortError' }); await settle();
    assert.equal(reports(), 0, 'A request the page cancelled is not a failure');
    mode = '404'; assert.equal(await fresh2.data.dataFetch('/data/x.json'), missing, 'An error status is returned for the caller to handle'); await settle();
    assert.equal(reports(), 1, 'and reported');
    visit('/tools/weather-match'); fresh2.analytics.trackPage('/tools/weather-match');
    mode = 'network'; await assert.rejects(fresh2.data.dataFetch('/data/x.json'), error => error === networkError, 'A network failure throws the same error'); await settle();
    assert.equal(reports(), 2, 'and is reported');
    assert.doesNotMatch(JSON.stringify(events), /data\/x|projector\.json|Failed to fetch/, 'Never the address or the message');
  } finally { global.fetch = previousFetch; }
  // Experiments: every event of the tab carries the variant named on <html>, and before_send keeps only valid ones.
  const entries = EXPERIMENTS.splice(0, EXPERIMENTS.length, ...FIXTURE);
  global.document.documentElement = { getAttribute: name => ({ 'data-exp-home-hero': 'short-dek', 'data-exp-story-end': 'cards', 'data-exp-tool-order': 'Private Name' })[name] ?? null };
  try {
    fresh2 = signals(); events.length = 0; for (const key of Object.keys(registered)) delete registered[key];
    visit('/'); fresh2.analytics.trackPage('/'); await settle();
    assert.deepEqual(registered, { '$feature/home-hero': 'short-dek' }, 'Only a running experiment with a valid variant on <html> is registered');
    assert.equal(events.at(-1).properties['$feature/home-hero'], 'short-dek', 'The page view carries the variant');
    Object.assign(registered, { '$feature/story-end': 'cards', '$feature/gone': 'control' });
    fresh2.analytics.trackAnalytics('section_viewed', { section: 'hero' }); await settle();
    assert.equal(events.at(-1).properties['$feature/home-hero'], 'short-dek');
    assert.equal(events.at(-1).properties['$feature/story-end'], undefined, 'A paused experiment is not reported');
    assert.equal(events.at(-1).properties['$feature/gone'], undefined, 'nor one no longer in the registry');
    registered['$feature/home-hero'] = 'Private Name'; fresh2.analytics.trackAnalytics('tool_used', { action: 'edit' }); await settle();
    assert.equal(events.at(-1).properties['$feature/home-hero'], undefined, 'nor a value that is not one of its variants');
  } finally { EXPERIMENTS.splice(0, EXPERIMENTS.length, ...entries); global.document.documentElement = html; for (const key of Object.keys(registered)) delete registered[key]; }
  Module._load = originalLoad;
  global.setTimeout = realSetTimeout;
  // Every check again with experiments running, as the autopilot will write them: the example in lib/experiments.ts's
  // header and a story experiment, both running, and a paused one, with keys and variants the fixtures above use too.
  // A check that holds only while the registry is empty fails here.
  if (!process.env.VERIFY_ANALYTICS_REGISTRY) {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'verify-analytics-'));
    const file = path.join(dir, 'experiments.ts');
    fs.writeFileSync(file, `// Written by scripts/verify-analytics.cjs.
export const EXPERIMENTS = [
  { key: 'home-hero', status: 'running', pages: ['/'], area: 'hero', variants: ['control', 'short-dek'],
    started: '2026-10-19', hypothesis: 'A shorter first line gets more phone visitors to the first chapter.' },
  { key: "story-end", status: "running", pages: ["/stories/pacing-types"], variants: ["control", "cards"], weights: [50, 50,],
    started: "2026-10-19", hypothesis: "Story cards at the end get more next stories opened.", },
  { key: 'tool-order', status: 'paused', pages: ['/tools'], variants: ['control', 'calc-first', 'band-first'], started: '2026-10-01', hypothesis: 'Listing the calculator first gets more tools used.' },
] as const;
`);
    try {
      const child = require('node:child_process').spawnSync(process.execPath, [__filename], { env: { ...process.env, VERIFY_ANALYTICS_REGISTRY: file }, encoding: 'utf8' });
      assert.equal(child.status, 0, `With experiments running (${file}), a check fails:\n${(child.stderr || child.stdout).slice(-3000)}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  if (process.env.VERIFY_ANALYTICS_REGISTRY) { console.log(`Analytics checks passed with the registry in ${registryFile}.`); return; }
  console.log(`Analytics checks passed: URL/name redaction, event allowlists with session IDs, ${searchPages.length} search pages and all ${sitemap.length} sitemap pages recorded under their clean path, session replay (sessionStorage identity with an in-memory fallback, bundled recorder and lazily loaded replay policy, recording started after load, masking without length, results panels and charts left out, console/network capture off, snapshot field allowlist, clean page addresses and links, blocked /runners, /your-race and runner handoff pages), per-file masking guards, production gating, pageview deduplication, opt-out/DNT/GPC stopping events and recording, SDK failure isolation, and the visit signals (enumerated values, reading figures and Web Vitals on their grid, campaign tags on the first page view only and removed from the address, failures by kind with rate limits, the once-per-page-view trackers through navigation and back/forward-cache restores with the feedback answer kept, every data request through dataFetch, section ids, the experiments registry, boot script, CSS and $feature allowlist, and every event described on /privacy and in docs/ANALYTICS.md), all of it again with experiments running.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
