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

const dirty = { event: '$pageview', uuid: 'test-event', $set: { email: 'private@example.com' }, $set_once: { name: 'Private Name' }, properties: {
  token: 'test-project', distinct_id: '$posthog_cookieless', $current_url: 'https://splithappens.run/runners?q=Private+Name&email=private@example.com#123',
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
assert.equal(clean.properties.$cookieless_mode, true);
assert.equal(clean.properties.$raw_user_agent, dirty.properties.$raw_user_agent, 'Cookieless ingestion requires the SDK browser user agent');
assert.equal(clean.properties.$host, 'splithappens.run', 'Cookieless ingestion requires the canonical host');
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, properties: { ...dirty.properties, $raw_user_agent: { name: 'Private Name' } } }).properties.$raw_user_agent, undefined);
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, properties: { ...dirty.properties, distinct_id: 'private@example.com' } }).properties.distinct_id, '$posthog_cookieless');
assert.equal(clean.properties.$process_person_profile, false);
assert.doesNotMatch(JSON.stringify(clean), /Private|private@|record_id|initial_current_url|session_entry_url/);
assert.equal(dirty.properties.q, 'Private Name', 'Sanitizing must not mutate the caller');
for (const event of ['$autocapture', '$snapshot', '$identify', '$exception', 'unknown', 'constructor']) assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event }), null);
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
assert.equal(policy.sanitizeAnalyticsEvent({ ...dirty, event: 'runner_search_completed', properties: { outcome: 'Private Name' } }).properties.outcome, undefined);

async function main() {
  const originalLoad = Module._load;
  let sdkLoads = 0, config;
  const events = [], storage = new Map();
  const sdk = {
    init(_key, options) { config = options; },
    capture(event, properties) { const safe = config.before_send({ event, properties }); if (safe) events.push(safe); },
  };
  Module._load = function(request, ...args) { if (request === 'posthog-js') { sdkLoads++; return sdk; } return originalLoad.call(this, request, ...args); };
  const target = new EventTarget();
  global.window = { location: { hostname: 'splithappens.run', pathname: '/' }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, dispatchEvent: event => target.dispatchEvent(event) };
  global.document = { referrer: 'https://www.google.com/search?q=Private+Name' };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { doNotTrack: '0', globalPrivacyControl: false } });
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-project';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
  const analytics = require('../lib/analytics.ts');
  const settle = () => new Promise(resolve => setImmediate(resolve));
  // Missing settings, previews, development and privacy signals must not even load the vendor SDK.
  window.location.hostname = 'preview.vercel.app'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  window.location.hostname = 'splithappens.run';
  process.env.NODE_ENV = 'development'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  process.env.NODE_ENV = 'production'; delete process.env.NEXT_PUBLIC_POSTHOG_KEY; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-project';
  navigator.doNotTrack = '1'; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  navigator.doNotTrack = '0'; navigator.globalPrivacyControl = true; analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  navigator.globalPrivacyControl = false; analytics.setAnalyticsDisabled(true); analytics.trackPage('/'); await settle(); assert.equal(sdkLoads, 0);
  analytics.setAnalyticsDisabled(false); analytics.trackPage('/'); analytics.trackPage('/'); await settle();
  assert.equal(sdkLoads, 1); assert.equal(events.length, 1, 'One initial pageview, including React Strict Mode');
  assert.equal(config.cookieless_mode, 'always'); assert.equal(config.disable_persistence, true); assert.equal(config.person_profiles, 'never');
  assert.equal(config.autocapture, false); assert.equal(config.disable_session_recording, true); assert.equal(config.capture_exceptions, false);
  window.location.pathname = '/runners'; analytics.trackPage('/runners'); await settle(); assert.equal(events.length, 2);
  analytics.trackAnalytics('runner_search_completed', { outcome: 'no_matches', name: 'Private Name' }); await settle();
  assert.equal(events.at(-1).properties.outcome, 'no_matches'); assert.equal(events.at(-1).properties.name, undefined);
  process.env.NEXT_PUBLIC_BASE_PATH = '/htw-live-study';
  window.location.pathname = '/htw-live-study/analyses/starting-pace';
  analytics.trackPage('/analyses/starting-pace'); await settle();
  assert.equal(events.at(-1).properties.$pathname, '/analyses/starting-pace', 'Subdirectory deployments retain their application route');
  window.location.pathname = '/htw-live-study/runners';
  analytics.trackAnalytics('runner_search_submitted', {}); await settle();
  assert.equal(events.at(-1).properties.$current_url, 'https://splithappens.run/runners', 'Feature events also remove the configured base path');
  delete process.env.NEXT_PUBLIC_BASE_PATH;
  const count = events.length;
  analytics.setAnalyticsDisabled(true); analytics.trackAnalytics('runner_search_submitted', {}); await settle(); assert.equal(events.length, count);
  assert.equal(config.before_send(dirty), null, 'Opt-out also blocks an already-initialized SDK');
  analytics.setAnalyticsDisabled(false); navigator.globalPrivacyControl = true; assert.equal(config.before_send(dirty), null);
  navigator.globalPrivacyControl = false;
  storage.set(policy.ANALYTICS_PREFERENCE, 'true'); assert.equal(config.before_send(dirty), null, 'Other tabs must honor stored opt-out');
  analytics.setAnalyticsDisabled(true); storage.set(policy.ANALYTICS_PREFERENCE, 'false'); assert.equal(analytics.analyticsDisabled(), false, 'A changed choice in another tab must be reflected');
  const originalStorage = window.localStorage;
  window.localStorage = { getItem() { throw new Error('blocked storage'); }, setItem() { throw new Error('blocked storage'); } };
  analytics.setAnalyticsDisabled(true); assert.equal(analytics.analyticsDisabled(), true, 'Opt-out must work with unavailable storage');
  analytics.setAnalyticsDisabled(false); window.localStorage = originalStorage;
  storage.clear();
  sdk.capture = () => { throw new Error('blocked analytics'); };
  analytics.trackAnalytics('runner_search_submitted', {}); await settle(); // No unhandled rejection or broken site action.
  Module._load = originalLoad;
  console.log(`Analytics checks passed: URL/name redaction, event allowlists, ${searchPages.length} search pages and all ${sitemap.length} sitemap pages recorded under their clean path, cookieless settings, production gating, pageview deduplication, opt-out/DNT/GPC and SDK failure isolation.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
