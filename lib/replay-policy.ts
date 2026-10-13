import type { BeforeSendFn, CaptureResult, PostHogConfig, SessionRecordingOptions } from 'posthog-js';
import { ANALYTICS_HOSTS, RUNNER_HANDOFF, analyticsPath, blockedPagePath, continuesRunnerHandoff, noteRunnerHandoff, recordingBlocked, runnerHandoff, sanitizeAnalyticsEvent, sdkIds } from './analytics-policy';

// Session replay policy and the SDK options. lib/analytics.ts loads this module with the SDK and the recorder, so none of
// it is in a page's initial JavaScript. lib/analytics-policy.ts keeps what pages need before then: the event allowlist
// and which pages (REPLAY_BLOCKED_PAGES, and runner handoff links) are never recorded.

// Regions that show back what the visitor typed or chose: the tools, the analysis pages and personalized guide, and the
// stories' "your time" calculators. Status lines, alerts and live regions anywhere also announce results (a tool's
// screen-reader summary sits outside its workspace), so their text is masked too.
const MASKED_REGIONS = ['.tool-workspace', '.analysis-layout', '.personalized-guide', '.which-card', '.finish-lookup'];
export const REPLAY_MASKED_TEXT = [...MASKED_REGIONS, '[role="status"]', '[role="alert"]', '[aria-live]'].join(', ');
// Left out of recordings: rrweb records an empty box of the same size and nothing inside it. Every tool's results panel,
// and the charts in the masked regions, whose shapes and positions encode the visitor's or a runner's times. The story
// charts (`.viz`, about three quarters of the homepage's elements) and the animated race replay, whose clock changes every
// frame, are left out too: the first full snapshot is one long task, and this keeps it short. Recharts measures axis
// labels (a pace from the visitor's goal, say) in a hidden span it adds to the page. The projector's saved runner cards
// (`.projector-cards`) hold the visitor's own labels, mat times and start clocks outside its workspace.
export const REPLAY_BLOCKED_ELEMENTS = ['.tool-results', ...MASKED_REGIONS.flatMap(region => [`${region} svg`, `${region} canvas`]),
  '.viz svg', '.replay', '#recharts_measurement_span', '.projector-cards'].join(', ');

/**
 * Every page address in a recording is the canonical host plus the clean analytics path: no query string or fragment.
 * A blocked page keeps its own path (never /other), so a later check still recognizes it.
 */
export function replayPageUrl(value: string, basePath = ''): string {
  return 'https://splithappens.run' + (blockedPagePath(value, basePath) ?? analyticsPath(value, basePath));
}

/**
 * The page address the recorder itself stores (rrweb Meta events and PostHog's `$url_changed` markers). A runner handoff
 * page keeps its marker so sanitizeReplayData can tell it is blocked; everything recorded there is then dropped, so the
 * marker never leaves the browser.
 */
export function recorderPageUrl(value: string, basePath = ''): string {
  return replayPageUrl(value, basePath) + (runnerHandoff(value) || continuesRunnerHandoff(value) ? '?' + RUNNER_HANDOFF : '');
}

/** Whether the page now open may be recorded in this tab (see continuesRunnerHandoff in lib/analytics-policy.ts). */
export function pageRecordable(value: string, basePath = ''): boolean {
  noteRunnerHandoff(value);
  return !recordingBlocked(value, basePath) && !continuesRunnerHandoff(value);
}

const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data', 'background', 'ping', 'longdesc', 'xlink:href', 'rr_src']);
const SRCSET_ATTRIBUTES = new Set(['srcset', 'imagesrcset']);
// Links to the site's own pages: their address becomes the clean page address, like the page's own.
const PAGE_LINKS: Record<string, string> = { a: 'href', area: 'href', form: 'action', button: 'formaction', input: 'formaction' };
const TEXT_ATTRIBUTE = /^(?:aria-(?:label|valuetext|valuenow|valuemin|valuemax|description|pressed|checked|selected|current)|title|alt|placeholder|label|value|style|data-.+)$/;
// A URL written into text or another attribute: absolute (`https://…`, `//…`) or a site path (`/tools/…`).
// No lookbehind: Safari before 16.4 cannot parse one, and a failure here would stop all analytics. The character before a
// site path is matched instead, and kept by the replacement.
const QUERY_IN_URL = /((?:https?:)?\/\/[^\s"'<>()?#]+|(?:^|[^\w/.~%-])\/[\w\-./~%]*)[?#][^\s"'<>()]*/gi;
const WHOLE_URL = /^(?:(?:https?:)?\/\/|\/)[^\s?#]*[?#]/i;
const stripUrl = (value: string) => value.replace(/[?#][\s\S]*$/, '');
const scrubText = (value: string) => /[?#]/.test(value) ? value.replace(QUERY_IN_URL, '$1') : value;
/** Masked text and values keep no length or shape: any non-blank string becomes `***`. */
export const maskText = (value: string): string => /\S/.test(value) ? '***' : value;

function sameSite(value: string): boolean {
  try {
    const url = new URL(value, 'https://splithappens.run');
    const here = typeof window !== 'undefined' ? window.location?.hostname : undefined;
    return (url.protocol === 'https:' || url.protocol === 'http:') && (ANALYTICS_HOSTS.has(url.hostname) || url.hostname === here);
  } catch { return false; }
}

/**
 * A recorded DOM attribute. Links to the site's pages become the clean page address; every other link or source loses
 * everything from its first `?` or `#`; inside a masked region, descriptive and state attributes are masked and inline
 * styles (bar widths, positions) are removed. `masked` may be a function, so the region is only looked up when needed.
 */
export function replayAttribute(name: string, value: string, masked: boolean | (() => boolean) = false, tagName = '', basePath = ''): string {
  const key = name.toLowerCase();
  if (key === '_csstext') return value; // The site's own stylesheets.
  if (PAGE_LINKS[tagName.toLowerCase()] === key && sameSite(value)) return replayPageUrl(value, basePath);
  if (URL_ATTRIBUTES.has(key)) return stripUrl(value);
  if (SRCSET_ATTRIBUTES.has(key)) return value.split(/,\s+/).map(candidate => candidate.replace(/[?#]\S*/g, '')).join(', ');
  if (TEXT_ATTRIBUTE.test(key) && (typeof masked === 'function' ? masked() : masked)) return key === 'style' ? '' : maskText(value);
  if (WHOLE_URL.test(value)) return stripUrl(value);
  return scrubText(value);
}

const regionOf = new WeakMap<Element, boolean>();
function inMaskedRegion(element: Element | undefined): boolean {
  if (!element || typeof element.closest !== 'function') return false;
  let masked = regionOf.get(element);
  if (masked === undefined) { masked = !!element.closest(REPLAY_MASKED_TEXT); regionOf.set(element, masked); }
  return masked;
}

/** The `session_recording` options for posthog.init. */
export function replayRecordingOptions(basePath = ''): SessionRecordingOptions {
  return {
    maskAllInputs: true,
    maskInputFn: value => value ? '***' : '',
    maskTextSelector: REPLAY_MASKED_TEXT,
    maskTextFn: maskText,
    blockClass: 'ph-no-capture',
    blockSelector: REPLAY_BLOCKED_ELEMENTS,
    maskAttributeFn: (name, value, element) => replayAttribute(name, value, () => inMaskedRegion(element), element?.tagName ?? '', basePath),
    // Also given every page address the recorder stores (rrweb Meta events, PostHog's navigation markers).
    maskCapturedNetworkRequestFn: request => ({ ...request, name: typeof request.name === 'string' ? recorderPageUrl(request.name, basePath) : request.name }),
    recordHeaders: false,
    recordBody: false,
    captureCanvas: { recordCanvas: false },
    captureJsonLd: false,
    recordCrossOriginIframes: false,
    // Requests are still compressed; events stay readable so before_send can check every snapshot.
    compress_events: false,
    // Stylesheet rules past this many are inlined in later idle callbacks instead of in the first snapshot's long task.
    inlineStylesheetBudgetRules: 100,
  };
}

// PostHog falls back to a cookie and localStorage when sessionStorage is unavailable (posthog-persistence.js), so the
// site checks first and keeps the tab's ID in memory instead: no cookie, and nothing outlives the page.
export function sessionStorageWorks(): boolean {
  try {
    const key = '__pace_notes_ss__';
    window.sessionStorage.setItem(key, '1');
    const ok = window.sessionStorage.getItem(key) === '1';
    window.sessionStorage.removeItem(key);
    return ok;
  } catch { return false; }
}

/** The posthog.init options. Recording starts off: lib/analytics.ts starts it from whenIdle, never during page load. */
export function posthogOptions(apiHost: string, basePath: string, beforeSend: BeforeSendFn): Partial<PostHogConfig> {
  // The recorder bundle also registers rrweb's console and network plugins. Remove them, so neither can be recorded
  // whatever the PostHog project settings say.
  const extensions = (window as Window & { __PosthogExtensions__?: { rrwebPlugins?: unknown } }).__PosthogExtensions__;
  if (extensions) extensions.rrwebPlugins = {};
  return {
    api_host: apiHost,
    defaults: '2026-05-30',
    // A random ID for this browser tab, kept in sessionStorage: no cookies, and nothing survives closing the tab.
    persistence: sessionStorageWorks() ? 'sessionStorage' : 'memory',
    person_profiles: 'never',
    autocapture: false,
    rageclick: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_performance: false,
    disable_session_recording: true,
    enable_recording_console_log: false,
    session_recording: replayRecordingOptions(basePath),
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    // Replay reads the project's remote config (recording on, URL blocklist), so only feature flags are switched off.
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    advanced_disable_toolbar_metrics: true,
    disable_capture_url_hashes: true,
    save_referrer: false,
    save_campaign_params: false,
    respect_dnt: true,
    before_send: beforeSend,
  };
}

const RECORDER_DELAY_MS = 3000;
/** After the load event, a pause, then the next idle moment (or a timeout, so a busy page still records). */
export function whenIdle(run: () => void): void {
  const idle = () => {
    const request = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof request === 'function') request.call(window, run, { timeout: 5000 }); else run();
  };
  const later = () => { setTimeout(idle, RECORDER_DELAY_MS); };
  if (typeof document === 'undefined' || document.readyState === 'complete' || typeof window.addEventListener !== 'function') later();
  else window.addEventListener('load', later, { once: true });
}

type Replay = Record<string, unknown>;
const isObject = (value: unknown): value is Replay => !!value && typeof value === 'object' && !Array.isArray(value);

function cleanAttributes(attributes: unknown, tagName: string, basePath: string): void {
  if (!isObject(attributes)) return;
  for (const [name, value] of Object.entries(attributes)) {
    // Canvas and image pixels, and which checkbox, radio button or option was chosen (rrweb records those unmasked).
    if (name === 'rr_dataURL' || name === 'checked' || name === 'selected') delete attributes[name];
    else if (typeof value === 'string') attributes[name] = replayAttribute(name, value, false, tagName, basePath);
  }
}

function cleanNode(node: unknown, basePath: string): void {
  if (!isObject(node)) return;
  cleanAttributes(node.attributes, typeof node.tagName === 'string' ? node.tagName : '', basePath);
  if (typeof node.textContent === 'string' && !node.isStyle) node.textContent = scrubText(node.textContent);
  if (Array.isArray(node.childNodes)) node.childNodes.forEach(child => cleanNode(child, basePath));
}

function cleanPayload(value: unknown, basePath: string): unknown {
  if (typeof value === 'string') return WHOLE_URL.test(value) ? stripUrl(value) : scrubText(value);
  if (Array.isArray(value)) return value.map(item => cleanPayload(item, basePath));
  if (!isObject(value)) return value;
  const result: Replay = {};
  for (const [key, item] of Object.entries(value)) result[key] = key === 'href' && typeof item === 'string' ? replayPageUrl(item, basePath) : cleanPayload(item, basePath);
  return result;
}

// Whether this tab's recording is on a page that must not be recorded. Unknown (dropped) until a Meta event names the
// page; rrweb starts every recording and every full snapshot with one, and PostHog marks later SPA navigations.
let onBlockedPage: boolean | undefined;

/**
 * The rrweb events of one `$snapshot` (uncompressed: recording options turn off per-event compression so they can be
 * checked here). Page addresses become clean production paths, links lose their query strings, typed input values and
 * choices are masked, console and network plugin data is dropped, and so is everything recorded on a blocked page.
 */
export function sanitizeReplayData(data: unknown, basePath = ''): Replay[] {
  if (!Array.isArray(data)) return [];
  const kept: Replay[] = [];
  for (const original of data) {
    // Compressed events (`cv`) cannot be checked, so they never leave.
    if (!isObject(original) || 'cv' in original || typeof original.type !== 'number') continue;
    const event = JSON.parse(JSON.stringify(original)) as Replay;
    const body = isObject(event.data) ? event.data : {};
    let keep: boolean;
    if (event.type === 4) { // Meta: the page and viewport at the start of a recording or full snapshot.
      onBlockedPage = typeof body.href !== 'string' || recordingBlocked(body.href, basePath);
      body.href = typeof body.href === 'string' ? replayPageUrl(body.href, basePath) : 'https://splithappens.run/other';
      keep = !onBlockedPage;
    } else if (event.type === 5) { // Custom: PostHog's markers.
      const tag = body.tag;
      const payload = isObject(body.payload) ? body.payload : {};
      if (tag === '$json_ld') continue;
      if (tag === '$url_changed') onBlockedPage = typeof payload.href !== 'string' || recordingBlocked(payload.href, basePath);
      keep = onBlockedPage === false;
      // PostHog pauses on its own project URL blocklist; keep the marker and drop what follows until the next page.
      if (tag === 'recording paused') onBlockedPage = true;
      if ((tag === '$pageview' || tag === '$url_changed') && (typeof payload.href !== 'string' || recordingBlocked(payload.href, basePath))) keep = false;
      body.payload = cleanPayload(body.payload, basePath);
    } else if (event.type === 6) continue; // Plugin: console logs and network requests are never recorded.
    else {
      keep = onBlockedPage === false;
      if (event.type === 2) cleanNode(body.node, basePath);
      if (event.type === 3) {
        if (body.source === 9 || body.source === 11) continue; // Canvas pixels and legacy console logs.
        if (body.source === 5) { // Typed input, already masked; and the checked state of a checkbox or radio button.
          if (typeof body.text === 'string') body.text = maskText(body.text);
          if ('isChecked' in body) body.isChecked = false;
        }
        if (body.source === 0) {
          if (Array.isArray(body.adds)) body.adds.forEach(add => { if (isObject(add)) cleanNode(add.node, basePath); });
          if (Array.isArray(body.texts)) body.texts.forEach(text => { if (isObject(text) && typeof text.value === 'string') text.value = scrubText(text.value); });
          if (Array.isArray(body.attributes)) body.attributes.forEach(change => { if (isObject(change)) cleanAttributes(change.attributes, '', basePath); });
        }
      }
    }
    if (keep) kept.push(event);
  }
  return kept;
}

/** A recording chunk leaves with only the fields PostHog needs to store it. */
export function sanitizeReplayEvent(event: CaptureResult | null, basePath = ''): CaptureResult | null {
  if (!event || event.event !== '$snapshot') return null;
  const source = event.properties;
  const ids = sdkIds(source);
  if (!ids || typeof source.token !== 'string') return null;
  const data = sanitizeReplayData(source.$snapshot_data, basePath);
  if (!data.length) return null;
  const properties: Record<string, unknown> = { token: source.token, ...ids, $snapshot_data: data, $snapshot_bytes: JSON.stringify(data).length, $snapshot_host: 'splithappens.run' };
  for (const key of ['$lib', '$lib_version']) if (typeof source[key] === 'string') properties[key] = source[key];
  return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties };
}

/** The before_send hook once the SDK has loaded: recordings are checked here, every other event by the event allowlist. */
export function sanitizeEvent(event: CaptureResult | null, basePath = ''): CaptureResult | null {
  return event?.event === '$snapshot' ? sanitizeReplayEvent(event, basePath) : sanitizeAnalyticsEvent(event, basePath);
}
