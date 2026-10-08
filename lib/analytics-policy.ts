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

// Only known public pages are retained. Query strings, fragments, names, record IDs and unknown paths never leave the site.
export function analyticsPath(value: string, basePath = ''): string {
  try {
    let path = new URL(value, 'https://splithappens.run').pathname.replace(/\/$/, '') || '/';
    const base = basePath.replace(/\/$/, '');
    if (base && (path === base || path.startsWith(base + '/'))) path = path.slice(base.length) || '/';
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

// This allowlist also runs on the SDK's generated properties. Do not add raw form values or nested objects.
export function sanitizeAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || !Object.prototype.hasOwnProperty.call(eventProperties, event.event)) return null;
  const source = event.properties;
  const properties: Record<string, unknown> = {};
  // PostHog requires the browser user agent to derive its rotating cookieless identity.
  // Removing this SDK-generated field causes ingestion to drop otherwise valid events.
  if (typeof source.$raw_user_agent === 'string') properties.$raw_user_agent = source.$raw_user_agent;
  for (const key of ['token', '$lib', '$lib_version', '$browser', '$browser_version', '$os', '$os_version', '$device_type', '$screen_height', '$screen_width', '$viewport_height', '$viewport_width', '$config_defaults']) {
    if (['string', 'number', 'boolean'].includes(typeof source[key])) properties[key] = source[key];
  }
  const path = analyticsPath(String(source.$current_url || source.$pathname || '/'));
  properties.$current_url = 'https://splithappens.run' + path;
  properties.$pathname = path;
  properties.$host = 'splithappens.run';
  const domain = referringDomain(String(source.$referrer || ''));
  properties.$referrer = domain ? 'https://' + domain : '$direct';
  properties.$referring_domain = domain || '$direct';
  properties.$cookieless_mode = true;
  properties.distinct_id = '$posthog_cookieless';
  properties.$process_person_profile = false;
  properties.$is_identified = false;
  for (const [key, values] of Object.entries(eventProperties[event.event as keyof typeof eventProperties])) {
    if (typeof source[key] === 'string' && values.includes(source[key])) properties[key] = source[key];
  }
  return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties };
}
