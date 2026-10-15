'use strict';
// PostHog, answered locally. Nothing the browser sends reaches PostHog: browser.cjs routes every *.posthog.com request
// here, and the browser's proxy is a dead port, so a request the routing missed fails instead of leaving the machine.
// The remote config mirrors the project's settings as read on October 13, 2026 (docs/ANALYTICS.md): recording on, the
// `/s/` endpoint, inputs masked, console logs off, performance capture off, and the URL blocklist with both regexes.
// Scenarios can drop the blocklist to check that the site alone keeps runner pages out of recordings.
const zlib = require('node:zlib');

const POSTHOG_HOST = /(^|\.)posthog\.(com|net)$/;
const URL_BLOCKLIST = [
  { url: '^https?://[^/]+/(runners|your-race)(/|\\?|#|$)', matching: 'regex' },
  { url: '[?&]via=runner(&|#|$)', matching: 'regex' },
];

function remoteConfig(token, { blocklist = true } = {}) {
  return {
    token, supportedCompression: ['gzip', 'gzip-js'], hasFeatureFlags: false, defaultIdentifiedOnly: true,
    analytics: { endpoint: '/i/v0/e/' }, elementsChainAsString: true, siteApps: [], toolbarParams: {}, isAuthenticated: false,
    surveys: false, productTours: false, heatmaps: false, captureDeadClicks: false, autocapture_opt_out: true,
    autocaptureExceptions: false, capturePerformance: false,
    sessionRecording: {
      endpoint: '/s/', recorderVersion: 'v2', sampleRate: null, minimumDurationMilliseconds: null, linkedFlag: null,
      consoleLogRecordingEnabled: false, networkPayloadCapture: null, masking: { maskAllInputs: true },
      urlTriggers: [], eventTriggers: [], triggerMatchType: null, urlBlocklist: blocklist ? URL_BLOCKLIST : [],
      scriptConfig: { script: 'posthog-recorder' }, recordCanvas: false, canvasFps: null, canvasQuality: null,
    },
  };
}

/** The events in a request body: gzip, base64 (`data=`) or plain JSON, as an array; null when there is no body. */
function decodeBody(url, buffer) {
  if (!buffer || !buffer.length) return { events: null };
  let bytes = buffer;
  try {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = zlib.gunzipSync(bytes);
    let text = bytes.toString('utf8');
    if (new URL(url).searchParams.get('compression') === 'base64' || text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.replace(/^data=/, '')), 'base64').toString('utf8');
    const json = JSON.parse(text);
    return { events: Array.isArray(json) ? json : json.batch || [json] };
  } catch (error) {
    return { events: null, raw: bytes.toString('latin1').slice(0, 4000), decodeError: String(error) };
  }
}

/** Answers one routed PostHog request: the remote config, an empty flags answer, no script, and `{status: 1}` for sends. */
function answer(route, url, options) {
  const token = (url.pathname.match(/^\/array\/([^/]+)\/config$/) || [])[1];
  if (token) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(remoteConfig(token, options)) });
  if (url.pathname.startsWith('/flags') || url.pathname.startsWith('/decide')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...remoteConfig('mock', options), flags: {}, featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false }) });
  }
  // The site bundles everything it runs (disable_external_dependency_loading), so a script request is a finding.
  if (url.pathname.endsWith('.js')) return route.abort();
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
}

module.exports = { POSTHOG_HOST, URL_BLOCKLIST, remoteConfig, decodeBody, answer };
