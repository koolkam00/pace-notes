import type { PostHog } from 'posthog-js';
import { ANALYTICS_CHANGED, ANALYTICS_HOSTS, ANALYTICS_PREFERENCE, CAMPAIGN, analyticsPath, noteRunnerHandoff, type AnalyticsEvents } from './analytics-policy';
import { activeVariants } from './experiment-runtime';

let loading: Promise<PostHog | null> | undefined;
let instance: PostHog | null = null;
let disabledForPage = false;
let lastPage: string | null = null;
// The recorder's first full snapshot is one long task, so it starts only once the page has loaded and gone idle.
let recorderReady = false;
let replayPolicy: typeof import('./replay-policy') | undefined;
const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH || '';

export function browserRejectsAnalytics(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function analyticsDisabled(): boolean {
  if (browserRejectsAnalytics()) return true;
  try {
    const stored = window.localStorage.getItem(ANALYTICS_PREFERENCE);
    if (stored !== null) return stored === 'true';
  } catch {}
  return disabledForPage;
}

export function analyticsConfigured(): boolean {
  return typeof window !== 'undefined' && process.env.NODE_ENV === 'production' && ANALYTICS_HOSTS.has(window.location.hostname)
    && !!process.env.NEXT_PUBLIC_POSTHOG_KEY && ['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(process.env.NEXT_PUBLIC_POSTHOG_HOST || '');
}

export function setAnalyticsDisabled(disabled: boolean): void {
  disabledForPage = disabled;
  try { window.localStorage.setItem(ANALYTICS_PREFERENCE, String(disabled)); } catch {}
  lastPage = null;
  window.dispatchEvent(new Event(ANALYTICS_CHANGED));
}

// Session replay runs wherever analytics runs (production hosts, no Do Not Track, Global Privacy Control or opt-out),
// except on the runner-search pages (REPLAY_BLOCKED_PAGES), which show real runners' names and the visitor's search, and
// on a page opened from a runner's profile (its query holds that runner's times; see RUNNER_HANDOFF), including pages it
// leads to that keep a query (pageRecordable in lib/replay-policy.ts).
function recordingAllowed(): boolean {
  return !!replayPolicy && !analyticsDisabled() && replayPolicy.pageRecordable(window.location.pathname + window.location.search, basePath());
}

// Starts or stops the recorder to match the current page and privacy choice; only a change calls the SDK.
function syncRecording(posthog: PostHog): void {
  try {
    const record = recorderReady && recordingAllowed();
    if (record && posthog.config.disable_session_recording) posthog.startSessionRecording();
    else if (!record && !posthog.config.disable_session_recording) posthog.stopSessionRecording();
  } catch { /* Recording must never interrupt the page. */ }
}

async function client(): Promise<PostHog | null> {
  if (!analyticsConfigured() || analyticsDisabled()) return null;
  if (!loading) {
    // The recorder, the Web Vitals measurements and the replay policy (with the SDK options) are bundled into these lazily
    // loaded chunks (disable_external_dependency_loading stops the SDK fetching them from PostHog's CDN), so none of them
    // enters the page's initial JavaScript.
    loading = Promise.all([import('posthog-js'), import('posthog-js/dist/posthog-recorder'), import('./replay-policy'), import('posthog-js/dist/web-vitals')]).then(([{ default: posthog }, , replay]) => {
      if (analyticsDisabled()) return null;
      const base = basePath();
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, replay.posthogOptions(process.env.NEXT_PUBLIC_POSTHOG_HOST!, base, event => analyticsDisabled() ? null : replay.sanitizeEvent(event, base)));
      // Every event from this tab names the version of each running experiment it was shown (lib/experiment-runtime.ts).
      const variants = Object.entries(activeVariants());
      if (variants.length) posthog.register(Object.fromEntries(variants.map(([key, variant]) => ['$feature/' + key, variant])));
      instance = posthog;
      replayPolicy = replay;
      // Recording starts only once the page has loaded and gone idle; the page or choice may have changed by then.
      replay.whenIdle(() => { recorderReady = true; syncRecording(posthog); });
      return posthog;
    }).catch(() => null);
  }
  const result = await loading;
  if (!result) loading = undefined;
  return result;
}

async function send(event: keyof AnalyticsEvents | '$pageview', properties: Record<string, unknown>): Promise<void> {
  if (!analyticsConfigured() || analyticsDisabled()) return;
  const safeProperties = { ...properties, $current_url: 'https://splithappens.run' + analyticsPath(window.location.pathname, basePath()), $referrer: document.referrer };
  // The moment it happened, not when the SDK finished loading: the first page view's time on page starts here.
  const at = new Date();
  try {
    const posthog = await client();
    if (posthog && !analyticsDisabled()) posthog.capture(event, safeProperties, { timestamp: at });
  } catch { /* Analytics must never interrupt a search, comparison or download. */ }
}

export function trackAnalytics<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]): void {
  void send(event, properties);
}

// At most one report per kind of failure per page view, and five per page load, so a loop of errors cannot flood the project.
const failures = new Set<string>();
let failurePage: string | null = null;
let failuresSent = 0;
/** A failure, by its kind only: never its message, stack, address or the data involved. */
export function trackFailure(category: AnalyticsEvents['site_error']['category']): void {
  if (typeof window === 'undefined') return;
  if (failurePage !== window.location.pathname) { failurePage = window.location.pathname; failures.clear(); }
  if (failures.has(category) || failuresSent >= 5) return;
  failures.add(category);
  failuresSent++;
  void send('site_error', { category });
}

// The owner's own Instagram links carry fixed utm_* tags. They are read once, from the address the tab opened with, and
// sent with its first page view only when every tag in it is one of CAMPAIGN's values. Every utm_* is then removed from
// the address, with analytics on or off, so a copied tool link or a tool's own query never carries them on.
let campaign: Record<string, string> | undefined;
function readCampaign(): Record<string, string> {
  const tags: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of new Set(params.keys())) {
      if (!key.startsWith('utm_')) continue;
      const values = params.getAll(key), allowed = CAMPAIGN[key as keyof typeof CAMPAIGN];
      if (!allowed || values.length !== 1 || !allowed.includes(values[0])) return {};
      tags[key] = values[0];
    }
  } catch { return {}; }
  return tags;
}
const queryKey = (part: string) => { const key = part.split('=')[0].replace(/\+/g, ' '); try { return decodeURIComponent(key); } catch { return key; } };
function removeCampaign(): void {
  if (!/utm_/i.test(window.location.search)) return;
  // In a later task, after a tool has written its inputs to the address as it mounts; the rest of the query stays as written.
  setTimeout(() => {
    try {
      const { pathname, search, hash } = window.location;
      const kept = search.slice(1).split('&').filter(part => part && !queryKey(part).startsWith('utm_'));
      const next = pathname + (kept.length ? '?' + kept.join('&') : '') + (hash || '');
      if (next !== pathname + search + (hash || '')) window.history.replaceState(window.history.state, '', next);
    } catch { /* The address keeps its tags; analytics never sends them anyway. */ }
  }, 0);
}

export function trackPage(pathname: string): void {
  if (campaign === undefined) campaign = readCampaign();
  removeCampaign();
  // A runner handoff is noted as the page opens, before the SDK or the recorder is ready (see noteRunnerHandoff).
  if (analyticsConfigured() && !analyticsDisabled()) noteRunnerHandoff(window.location.pathname + window.location.search);
  // Navigation and privacy changes also start or stop the recorder: it stops before a blocked page's view is sent.
  if (instance) syncRecording(instance);
  if (!analyticsConfigured() || analyticsDisabled()) return;
  // Filters and unit changes update the URL but are not additional page views.
  if (pathname === lastPage) return;
  lastPage = pathname;
  void send('$pageview', campaign);
  campaign = {};
}
