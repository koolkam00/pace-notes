import type { CaptureResult } from 'posthog-js';
import { TEN_ANALYSES } from './ten-analyses';
import { TOOLS } from './tools/registry';
import { WEATHER_QUESTIONS } from './weather-catalog';

export const ANALYTICS_PREFERENCE = 'marathon-analytics-disabled';
export const ANALYTICS_CHANGED = 'marathon-analytics-changed';
export const ANALYTICS_HOSTS = new Set(['splithappens.run', 'www.splithappens.run', 'htw-live-study.vercel.app']);
// The search pages (docs/SEO.md), named here rather than imported: this module ships to every page, and importing the
// qualifying standards and pace-chart helpers just for their paths would add them to every page's JavaScript.
// scripts/verify-analytics.cjs builds the same list from those sources and checks every sitemap page keeps its own
// path, so a new or renamed page cannot fall to /other unnoticed.
const searchPages = ['/tools/marathon-pace-chart', '/tools/half-marathon-pace-chart', '/finish-times',
  ...['3-00', '3-30', '4-00', '4-30', '5-00'].map(goal => '/tools/marathon-pace/' + goal),
  ...['boston', 'nyc', 'london', 'chicago', 'berlin', 'sydney'].map(race => '/tools/qualifying/' + race)];
const pages = new Set(['/', '/analyses', '/analyses/downhill-start', '/runners', '/about', '/methodology', '/privacy', '/request-analysis', '/slowdown', '/htw', '/your-race', '/research/personalized',
  ...TEN_ANALYSES.map(item => '/analyses/' + item.slug), ...WEATHER_QUESTIONS.map(item => '/analyses/' + item.slug),
  '/tools', ...TOOLS.map(tool => '/tools/' + tool.slug), ...searchPages]);
const analyses = new Set([...TEN_ANALYSES.map(item => item.id), ...WEATHER_QUESTIONS.map(item => item.id)]);

export type AnalyticsEvents = {
  runner_search_submitted: Record<string, never>;
  runner_search_completed: { outcome: 'matches' | 'no_matches' | 'error' };
  runner_profile_opened: Record<string, never>;
  race_comparison_opened: { selection: 'one' | 'multiple'; availability: 'eligible' | 'mixed' | 'limited' };
  analysis_filters_applied: { analysis: string; course_scope: 'all' | 'single' };
  data_download_clicked: { destination: 'release' | 'site_data' };
  units_changed: { units: 'mi' | 'km' };
};
const eventProperties: Record<keyof AnalyticsEvents | '$pageview', Record<string, readonly string[]>> = {
  $pageview: {}, runner_search_submitted: {}, runner_search_completed: { outcome: ['matches', 'no_matches', 'error'] },
  runner_profile_opened: {}, race_comparison_opened: { selection: ['one', 'multiple'], availability: ['eligible', 'mixed', 'limited'] },
  analysis_filters_applied: { analysis: [...analyses], course_scope: ['all', 'single'] },
  data_download_clicked: { destination: ['release', 'site_data'] }, units_changed: { units: ['mi', 'km'] },
};

// The application route of a URL or path, without the deployment's base path, query string, fragment or trailing slash.
function routePath(value: string, basePath: string): string {
  let path = new URL(value, 'https://splithappens.run').pathname.replace(/\/$/, '') || '/';
  const base = basePath.replace(/\/$/, '');
  if (base && (path === base || path.startsWith(base + '/'))) path = path.slice(base.length) || '/';
  return path;
}

// Only known public pages are retained. Query strings, fragments, names, record IDs and unknown paths never leave the site.
export function analyticsPath(value: string, basePath = ''): string {
  try {
    const path = routePath(value, basePath);
    if (pages.has(path)) return path;
    if (path === '/courses' || path.startsWith('/courses/')) return '/courses';
    if (path === '/packs' || path.startsWith('/packs/')) return '/packs';
    if (path === '/stories' || path.startsWith('/stories/')) return '/stories';
  } catch {}
  return '/other';
}

export function referringDomain(value: string): string {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.hostname : ''; } catch { return ''; }
}

export function downloadDestination(href: string): 'release' | 'site_data' | null {
  try {
    const url = new URL(href, 'https://splithappens.run');
    if (url.hostname === 'github.com' && /^\/koolkam00\/htw-live-study\/releases(?:\/|$)/.test(url.pathname)) return 'release';
    if (ANALYTICS_HOSTS.has(url.hostname) && url.pathname.startsWith('/data/')) return 'site_data';
  } catch {}
  return null;
}

// Session replay. The runner-search pages show real runners' names and record IDs and the visitor's search text, so
// they are never recorded: lib/analytics.ts stops the recorder there, their containers carry `ph-no-capture`, and
// lib/replay-policy.ts drops anything recorded on them. The rest of the replay policy lives in that module, which loads
// with the SDK, so none of it is in a page's initial JavaScript.
export const REPLAY_BLOCKED_PAGES: readonly string[] = ['/runners', '/your-race'];
// A link from a runner's profile into a tool or analysis (components/RunnerContext.tsx) puts that runner's recorded
// times in its query, so it carries this marker and the page it opens is never recorded either.
export const RUNNER_HANDOFF = 'via=runner';
export const runnerHandoffHref = (href: string): string => href + (href.includes('?') ? '&' : '?') + RUNNER_HANDOFF;

// The blocked page a URL belongs to, including its subpaths and other spellings; an unreadable URL counts as blocked.
export function blockedPagePath(value: string, basePath = ''): string | null {
  try {
    let path = routePath(value, basePath);
    try { path = decodeURIComponent(path); } catch {}
    path = path.toLowerCase();
    return REPLAY_BLOCKED_PAGES.find(page => path === page || path.startsWith(page + '/')) ?? null;
  } catch { return REPLAY_BLOCKED_PAGES[0]; }
}

export function runnerHandoff(value: string): boolean {
  try { return new URL(value, 'https://splithappens.run').searchParams.getAll('via').includes('runner'); } catch { return true; }
}

/** Whether a page (a URL, or a path with its query) must not be recorded. */
export function recordingBlocked(value: string, basePath = ''): boolean {
  return blockedPagePath(value, basePath) !== null || runnerHandoff(value);
}

// A page opened from a runner's profile keeps that runner's race and times in its query, and a filter change or an onward
// link can drop the marker while keeping the query. So once a tab has opened a handoff page, a later page with a query
// (other than the units choice) stays unrecorded until the visitor opens one without (the site's navigation links). One
// sessionStorage flag, holding no data, keeps that across a reload. lib/analytics.ts notes each page as it opens, before
// the SDK or the recorder is ready, so a quick filter change cannot hide the handoff.
const HANDOFF_FLAG = 'pace-notes-runner-handoff';
let handoffInTab = false;
function hasRunnerQuery(value: string): boolean {
  try { return Array.from(new URL(value, 'https://splithappens.run').searchParams.keys()).some(key => key !== 'units'); } catch { return true; }
}
/** Notes the start of a runner handoff (a page carrying the marker) or its end (a page without a query). */
export function noteRunnerHandoff(value: string): void {
  const handoff = runnerHandoff(value);
  if (!handoff && hasRunnerQuery(value)) return;
  handoffInTab = handoff;
  try {
    if (handoff) window.sessionStorage.setItem(HANDOFF_FLAG, '1');
    else window.sessionStorage.removeItem(HANDOFF_FLAG);
  } catch { /* Without sessionStorage the flag lasts for this page only. */ }
}
/** Whether a page continues a runner handoff in this tab: it has a query, and the tab opened a handoff page before. */
export function continuesRunnerHandoff(value: string): boolean {
  if (!hasRunnerQuery(value)) return false;
  if (handoffInTab) return true;
  try { return window.sessionStorage.getItem(HANDOFF_FLAG) === '1'; } catch { return false; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The SDK's random IDs: distinct_id per browser tab, and the session and window IDs that link events to a recording.
 * Anything else in these fields (an email, a name) means the event did not come from this setup, so it is dropped.
 */
export function sdkIds(source: Record<string, unknown>): { distinct_id: string; $session_id: string; $window_id: string } | null {
  const { distinct_id, $session_id, $window_id } = source;
  const id = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
  return id(distinct_id) && id($session_id) && id($window_id) ? { distinct_id, $session_id, $window_id } : null;
}

// This allowlist also runs on the SDK's generated properties. Do not add raw form values or nested objects.
export function sanitizeAnalyticsEvent(event: CaptureResult | null, basePath = ''): CaptureResult | null {
  if (!event) return null;
  const source = event.properties;
  const ids = sdkIds(source);
  // Recording chunks ($snapshot) are checked by lib/replay-policy.ts; here they are undeclared and dropped like any other.
  if (!ids || !Object.prototype.hasOwnProperty.call(eventProperties, event.event)) return null;
  const properties: Record<string, unknown> = { ...ids };
  if (typeof source.$raw_user_agent === 'string') properties.$raw_user_agent = source.$raw_user_agent;
  for (const key of ['token', '$lib', '$lib_version', '$browser', '$browser_version', '$os', '$os_version', '$device_type', '$screen_height', '$screen_width', '$viewport_height', '$viewport_width', '$config_defaults']) {
    if (['string', 'number', 'boolean'].includes(typeof source[key])) properties[key] = source[key];
  }
  const path = analyticsPath(String(source.$current_url || source.$pathname || '/'), basePath);
  properties.$current_url = 'https://splithappens.run' + path;
  properties.$pathname = path;
  properties.$host = 'splithappens.run';
  const domain = referringDomain(String(source.$referrer || ''));
  properties.$referrer = domain ? 'https://' + domain : '$direct';
  properties.$referring_domain = domain || '$direct';
  properties.$process_person_profile = false;
  properties.$is_identified = false;
  for (const [key, values] of Object.entries(eventProperties[event.event as keyof typeof eventProperties])) {
    if (typeof source[key] === 'string' && values.includes(source[key])) properties[key] = source[key];
  }
  return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties };
}
