'use strict';
// What a run sent and stored, and the invariants every run must keep (I1–I9; I10, the JavaScript budget, is in
// scenarios/s8-budget.cjs). The rules come from the site's own TypeScript sources, loaded with the same require hook as
// scripts/verify-analytics.cjs, so the allowlist these checks hold the browser to is the one the site ships:
// sanitizeAnalyticsEvent and analyticsPath from lib/analytics-policy.ts, the runner-page rules, and lib/experiments.ts.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest);
};
const policy = require(path.join(ROOT, 'lib/analytics-policy.ts'));
const { EXPERIMENTS } = require(path.join(ROOT, 'lib/experiments.ts'));
const { SITE_HOSTS, PREVIEW_HOST } = require('./browser.cjs');
const { POSTHOG_HOST } = require('./posthog-mock.cjs');

const SITE = 'https://splithappens.run';
const RUNNING = new Map(EXPERIMENTS.filter(def => def.status === 'running').map(def => [def.key, def.variants]));

/**
 * Values a run puts in sessionStorage and on <html> before the page loads: a variant for an experiment that is not in
 * the registry (`e2e-fixture`, junk value) and, for each running experiment, its last variant. Only the running ones
 * may come back, as `$feature/<key>` on every event (expectedFeatures); with an empty registry nothing may.
 */
function experimentPlant() {
  const session = { 'pace-notes-exp:e2e-fixture': 'E2E-PLANT' };
  for (const [key, variants] of RUNNING) session['pace-notes-exp:' + key] = variants[variants.length - 1];
  return { session, html: { 'data-exp-e2e-fixture': 'E2E-PLANT' } };
}
const expectedFeatures = () => Object.fromEntries([...RUNNING].map(([key, variants]) => ['$feature/' + key, variants[variants.length - 1]]));

// ---------- Reading what was sent ----------

// Every string in the PostHog traffic (request URLs, bodies, undecodable bodies, object keys), with where it was.
function allStrings(run) {
  const out = [];
  const walk = (value, at) => {
    if (typeof value === 'string') out.push({ at, s: value });
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${at}[${i}]`));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { out.push({ at: at + '.<key>', s: key }); walk(item, at + '.' + key); }
  };
  run.requests.filter(r => POSTHOG_HOST.test(r.host)).forEach((r, i) => out.push({ at: `url${i}`, s: String(r.url) }));
  run.sent.forEach((r, i) => { if (r.raw) out.push({ at: `body${i}.raw`, s: r.raw }); walk(r.events, `body${i}(${r.path})`); });
  return out;
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asPattern = needle => needle instanceof RegExp ? needle : new RegExp(escape(needle), 'i');
// Matches that are not visitor data: the public release links in the site's header, footer and methods pages, and the
// project's URL blocklist, which the recorder echoes in its options marker.
const KNOWN_HARMLESS = /github\.com\/koolkam00\/htw-live-study\/releases(\/(tag|download)\/[\w.-]+)?|\[\?&\]via=runner\(&\|#\|\$\)/g;

/**
 * Where each needle appears in the run's PostHog traffic: [{ needle, at, excerpt }]. A needle is a string (matched
 * without case), a RegExp, or { needle, allowAt } where hits at a location matching `allowAt` are expected.
 */
function search(run, needles) {
  const strings = allStrings(run).map(({ at, s }) => ({ at, s: s.replace(KNOWN_HARMLESS, match => ' '.repeat(match.length)) }));
  const hits = [];
  for (const item of needles) {
    const { needle, allowAt } = typeof item === 'string' || item instanceof RegExp ? { needle: item } : item;
    const pattern = asPattern(needle);
    for (const { at, s } of strings) {
      const match = pattern.exec(s);
      if (!match || (allowAt && allowAt.test(at))) continue;
      hits.push({ needle: String(needle), at, excerpt: s.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80) });
    }
  }
  return hits;
}

const URL_ATTRIBUTES = new Set(['href', 'src', 'srcset', 'imagesrcset', 'xlink:href', 'action', 'formaction', 'poster', 'rr_src']);

/** Calls visitAttributes(attributes, tagName) for every attribute map in an rrweb event, and visitNode for each node. */
function eachNode(ev, visitAttributes, visitNode = () => {}) {
  const node = n => {
    if (!n || typeof n !== 'object') return;
    visitNode(n);
    if (n.attributes) visitAttributes(n.attributes, n.tagName || '');
    (n.childNodes || []).forEach(node);
  };
  const d = ev.data || {};
  if (ev.type === 2) node(d.node);
  if (ev.type === 3 && d.source === 0) {
    (d.adds || []).forEach(add => node(add && add.node));
    (d.attributes || []).forEach(change => change && change.attributes && visitAttributes(change.attributes, ''));
  }
}

/** The recordable text of a run's recordings as "kind|value" strings (text, attributes, typed input, markers). */
function domStrings(run) {
  const out = [];
  for (const { ev } of run.rrweb()) {
    const d = ev.data || {};
    eachNode(ev, attributes => { for (const [k, v] of Object.entries(attributes)) out.push(`attr:${k}|${typeof v === 'string' ? v : JSON.stringify(v)}`); },
      n => { if (typeof n.textContent === 'string' && n.textContent.trim()) out.push(`text|${n.textContent.trim()}`); });
    if (ev.type === 3 && d.source === 0) (d.texts || []).forEach(t => { if (t && typeof t.value === 'string' && t.value.trim()) out.push(`text|${t.value.trim()}`); });
    else if (ev.type === 3 && d.source === 5) out.push(`input|${d.text}|${d.isChecked}`);
    else if (ev.type === 4) out.push(`meta|${d.href}`);
    else if (ev.type === 5) out.push(`custom:${d.tag}|${JSON.stringify(d.payload).replace(/"(timestamp|lastActivityTimestamp|eventTimestamp|sessionId|windowId|threshold|bufferLength|bufferSize|[a-zA-Z_]*[Tt]imestamp|[a-zA-Z]*Id|id|duration|startTime|endTime|time)":("[^"]*"|-?[0-9.e+-]+)/g, '"$1":_')}`);
  }
  return out;
}

// ---------- The invariants ----------

const SNAPSHOT_KEYS = ['$lib', '$lib_version', '$session_id', '$snapshot_bytes', '$snapshot_data', '$snapshot_host', '$window_id', 'distinct_id', 'token'];
const isPrimitive = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);

// I1: the browser contacted only the site (answered from out/) and the PostHog mock.
function hosts(run) {
  const allowed = host => SITE_HOSTS.has(host) || host === PREVIEW_HOST || host === 'localhost' || host === '127.0.0.1' || POSTHOG_HOST.test(host);
  const problems = [...new Set(run.requests.filter(r => !allowed(r.host)).map(r => `contacted ${r.host} (${r.url.slice(0, 100)})`))];
  for (const r of run.requests) if (POSTHOG_HOST.test(r.host) && r.path.endsWith('.js')) problems.push(`requested a PostHog script ${r.url.slice(0, 100)} (external dependency loading must stay off)`);
  return problems;
}

// I2: every event is exactly what the allowlist lets through: sanitizing it again changes nothing, so its name, keys and
// enumerated values are allowed and its numbers are in range and on their grid. Its address is the clean path.
function events(run) {
  const problems = [];
  for (const { e } of run.events()) {
    const name = String(e && e.event);
    const extra = Object.keys(e || {}).filter(key => !['uuid', 'event', 'timestamp', 'properties'].includes(key));
    if (extra.length) problems.push(`${name}: top-level ${extra.join(', ')}`);
    const props = (e && e.properties) || {};
    const again = policy.sanitizeAnalyticsEvent(JSON.parse(JSON.stringify(e)));
    if (!again) { problems.push(`${name}: not an allowed event (or its IDs are not the SDK's random IDs)`); continue; }
    for (const [key, value] of Object.entries(props)) {
      if (!isPrimitive(value)) problems.push(`${name}.${key}: not a plain value (${JSON.stringify(value).slice(0, 60)})`);
      else if (!(key in again.properties)) problems.push(`${name}.${key}: not on the allowlist (${JSON.stringify(value).slice(0, 60)})`);
      else if (again.properties[key] !== value) problems.push(`${name}.${key}: ${JSON.stringify(value).slice(0, 60)} is not an allowed value (the allowlist makes it ${JSON.stringify(again.properties[key])})`);
    }
    for (const key of Object.keys(again.properties)) if (!(key in props)) problems.push(`${name}: ${key} missing, so the event did not pass the allowlist`);
    if (props.$current_url !== SITE + props.$pathname) problems.push(`${name}: $current_url ${props.$current_url} is not the host plus $pathname ${props.$pathname}`);
    if (policy.analyticsPath(String(props.$pathname)) !== props.$pathname) problems.push(`${name}: $pathname ${props.$pathname} is not a clean analytics path`);
    for (const key of Object.keys(props).filter(k => k.startsWith('$feature/'))) {
      const variants = RUNNING.get(key.slice('$feature/'.length));
      if (!variants || !variants.includes(props[key])) problems.push(`${name}.${key}: not a running experiment and one of its variants`);
    }
  }
  return problems;
}

// I3: a recording chunk has exactly its nine fields, and nothing in it that the replay policy removes.
function snapshots(run) {
  const problems = new Set();
  for (const { e } of run.snapshots()) {
    if (e.event !== '$snapshot') { problems.add(`a ${e.event} event was sent to the recording endpoint`); continue; }
    const keys = Object.keys(e.properties || {}).sort();
    if (keys.join() !== SNAPSHOT_KEYS.join()) problems.add(`$snapshot fields ${keys.join(', ')} (expected ${SNAPSHOT_KEYS.join(', ')})`);
    const extra = Object.keys(e).filter(key => !['uuid', 'event', 'timestamp', 'properties', 'sent_at'].includes(key));
    if (extra.length) problems.add(`$snapshot top-level ${extra.join(', ')}`);
    for (const ev of e.properties.$snapshot_data || []) {
      const d = ev.data || {};
      if ('cv' in ev) problems.add('a compressed rrweb event (cv), which before_send cannot check');
      if (ev.type === 6) problems.add('an rrweb plugin event (console or network)');
      if (ev.type === 3 && (d.source === 9 || d.source === 11)) problems.add(`rrweb incremental source ${d.source} (canvas or console)`);
      if (ev.type === 3 && d.source === 5 && d.isChecked === true) problems.add('a recorded checked state (isChecked: true)');
      if (ev.type === 4 && /[?#]/.test(String(d.href))) problems.add(`a page address with a query or fragment: ${String(d.href).slice(0, 100)}`);
      if (ev.type === 5 && d.payload && typeof d.payload.href === 'string' && /[?#]/.test(d.payload.href)) problems.add(`a ${d.tag} marker address with a query or fragment: ${d.payload.href.slice(0, 100)}`);
      eachNode(ev, (attributes, tag) => {
        for (const [key, value] of Object.entries(attributes)) {
          if (key === 'checked' || key === 'selected') problems.add(`a recorded ${key} attribute${tag ? ' on ' + tag : ''}`);
          if (URL_ATTRIBUTES.has(key.toLowerCase()) && typeof value === 'string' && /[?#]/.test(value)) problems.add(`${tag || 'an element'} ${key}="${value.slice(0, 100)}" keeps a query or fragment`);
        }
      });
    }
  }
  return [...problems];
}

// I4: none of the visitor's values, runner details, error texts or junk tags appear anywhere in the PostHog traffic.
// The planted experiment value (experimentPlant) is on <html>, so a recording shows it there like any attribute; it
// must never reach an event.
const ON_HTML = /\.attributes\.(<key>|data-exp-[\w-]+)$/;
const SENTINELS = ['Private Name', 'E2E sentinel', 'utm_campaign', 'fbclid', 'igshid', 'via=runner', 'pace-notes-runner-handoff',
  { needle: 'e2e-fixture', allowAt: ON_HTML }, { needle: 'E2E-PLANT', allowAt: ON_HTML }, 'Zebulon', 'Quixote', 'Wilhelmina', 'Ostrova', 'Testperson'];
function needles(run, extra = run.options.needles || []) {
  return [...unread(run), ...search(run, [...SENTINELS, ...extra]).map(hit => `"${hit.needle}" in ${hit.at}: …${hit.excerpt.replace(/\s+/g, ' ').slice(0, 220)}…`)];
}

/**
 * What was sent but not searched: a body the page handed over that could not be read or decoded, and any PostHog POST
 * the browser made that the page did not hand over through fetch, XMLHttpRequest or sendBeacon (more requests to an
 * address than bodies handed over for it), whose body was therefore never seen. The page may hand over more than the
 * browser sends (a beacon refused, then retried): those bodies are searched as well.
 */
function unread(run) {
  const problems = run.sent.filter(r => !r.events).map(r => `the body of POST ${r.path} (${r.via}) could not be ${r.raw ? 'decoded' : 'read'}, so it was not searched`);
  const handed = new Map();
  for (const r of run.sent) handed.set(r.url, (handed.get(r.url) || 0) + 1);
  const made = new Map();
  for (const r of run.wire) made.set(r.url, (made.get(r.url) || 0) + 1);
  for (const [url, count] of made) if (count > (handed.get(url) || 0)) problems.push(`${count - (handed.get(url) || 0)} of ${count} PostHog POSTs to ${new URL(url).pathname} were not handed over by the page, so their bodies were not searched`);
  return problems;
}

/**
 * The markup components/Experiment.tsx renders into <head> for a registry (the CSS, and the boot script when an
 * experiment runs), rendered with React as the build renders it. The registry array is swapped for `defs` only while
 * it renders, which is synchronous, so nothing else here sees the fixture.
 */
function experimentHead(defs) {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ExperimentHead } = require(path.join(ROOT, 'components/Experiment.tsx'));
  const saved = EXPERIMENTS.splice(0, EXPERIMENTS.length, ...defs);
  try { return renderToStaticMarkup(React.createElement(ExperimentHead)); } finally { EXPERIMENTS.splice(0, EXPERIMENTS.length, ...saved); }
}
/** A built page with its <head> experiments markup (the build's registry) replaced by the one for `defs`. */
function withExperiments(html, defs) {
  const built = /<style>\[data-exp-show\][^<]*<\/style>(?:<script>[\s\S]*?<\/script>)?/;
  if (!built.test(html)) throw new Error('the page has no experiments markup in <head> (components/Experiment.tsx)');
  const markup = experimentHead(defs);
  return html.replace(built, () => markup);
}

/**
 * The address open in each page over time, and whether the site's own rules let it be recorded at that moment
 * (recordingBlocked, plus a runner handoff continuing in that tab), replayed through lib/analytics-policy.ts.
 */
function pageTimeline(run) {
  const segments = [];
  const byPage = new Map();
  for (const nav of [...run.navs].sort((a, b) => a.at - b.at)) {
    if (!byPage.has(nav.page)) byPage.set(nav.page, []);
    byPage.get(nav.page).push(nav);
  }
  for (const [page, navs] of byPage) {
    policy.noteRunnerHandoff('/'); // a new tab starts with no handoff
    navs.forEach((nav, i) => {
      if (!nav.url) return;
      policy.noteRunnerHandoff(nav.url);
      const blocked = policy.recordingBlocked(nav.url) || policy.continuesRunnerHandoff(nav.url);
      segments.push({ page, from: nav.at, to: i + 1 < navs.length ? navs[i + 1].at : Infinity, url: nav.url, blocked });
    });
  }
  policy.noteRunnerHandoff('/');
  return segments;
}

// I5: nothing is recorded while a runner page, or a page opened from a runner's profile, is open.
function blockedPages(run) {
  const problems = new Set();
  const segments = pageTimeline(run);
  const recorded = new Map();
  for (const { ev } of run.rrweb()) {
    const open = segments.filter(s => s.from <= ev.timestamp && ev.timestamp < s.to);
    if (open.length && open.every(s => s.blocked)) problems.add(`rrweb ${labelOf(ev)} recorded while ${open.map(s => short(s.url)).join(' and ')} was open`);
    for (const s of open) if (!s.blocked) recorded.set(short(s.url), (recorded.get(short(s.url)) || 0) + 1);
    const d = ev.data || {};
    const href = ev.type === 4 ? d.href : ev.type === 5 && d.payload ? d.payload.href : null;
    if (typeof href === 'string' && policy.recordingBlocked(href)) problems.add(`a recording names the blocked page ${short(href)}`);
  }
  run.recordedPages = recorded;
  return [...problems];
}

const ALLOWED_LOCAL = new Set(['marathon-analytics-disabled', 'marathon-study-units',
  // Written by the tools only when the visitor saves something on this device (docs/TOOLS.md), and the site's motion
  // switch; never analytics.
  'pace-notes-qualifying-birth', 'pace-notes-projector-runners', 'pace-notes-projector-start', 'pace-notes-motion']);
const allowedSession = key => key.startsWith('ph_') || key === 'pace-notes-runner-handoff' || /^pace-notes-exp:[a-z0-9-]+$/.test(key) || key === 'pace-notes-chunk-reload' || key.startsWith('__e2e');
// Feature probes that write a test key and remove it in the same call (posthog-js and lib/replay-policy.ts).
const PROBES = { local: new Set(['__mplssupport__', 'test']), session: new Set(['__support__', '__pace_notes_ss__']) };
const allowedKey = (where, key) => where === 'local' ? ALLOWED_LOCAL.has(key) : allowedSession(key);

// I6: no cookie, and only the listed keys in localStorage and sessionStorage.
function storage(run) {
  const problems = new Set();
  for (const r of run.reports) {
    if (r.kind === 'cookie') problems.add(`a cookie was written: ${r.value.split('=')[0]} on ${r.path}`);
    if (r.kind === 'storage' && r.op === 'setItem' && !allowedKey(r.area, r.key) && !PROBES[r.area].has(r.key)) problems.add(`${r.area}Storage key ${r.key} written on ${r.path}`);
    if (r.kind === 'storage' && r.op === 'clear') problems.add(`${r.area}Storage cleared on ${r.path}`);
  }
  for (const state of run.storage) {
    if (state.error) continue;
    for (const key of Object.keys(state.local || {})) if (!ALLOWED_LOCAL.has(key)) problems.add(`localStorage holds ${key} (${state.path})`);
    for (const key of Object.keys(state.session || {})) if (key !== '__unreadable__' && !allowedSession(key)) problems.add(`sessionStorage holds ${key} (${state.path})`);
    if (state.cookie) problems.add(`document.cookie is "${state.cookie.slice(0, 60)}" (${state.path})`);
  }
  for (const cookie of run.cookies || []) problems.add(`the browser holds cookie ${cookie.name} for ${cookie.domain}`);
  return [...problems];
}

// I7: with Do Not Track, Global Privacy Control, on a preview host or on localhost nothing goes to PostHog at all. After
// the /privacy opt-out nothing captured from that moment on is sent, and no request leaves after the SDK's next batch
// (its 3 s flush interval): events and recording chunks captured before the click can still be in that batch, because
// posthog-js has no way to drop its send queue.
const FLUSH_GRACE_MS = 3500;
function privacy(run) {
  const problems = [];
  if (run.options.expectNoPostHog) for (const r of run.posthogRequests()) problems.push(`${r.method} ${r.host}${r.path} although analytics must be off`);
  const signal = run.privacySignalAt;
  if (signal) {
    for (const r of run.sent.filter(r => r.at >= signal)) {
      for (const e of r.events || []) {
        if (Date.parse(e.timestamp) >= signal) problems.push(`${e.event} captured ${Date.parse(e.timestamp) - signal} ms after the opt-out was sent`);
        const late = ((e.properties && e.properties.$snapshot_data) || []).filter(ev => ev.timestamp >= signal);
        if (late.length) problems.push(`${late.length} rrweb events recorded after the opt-out were sent`);
      }
    }
    for (const r of run.posthogRequests(signal + FLUSH_GRACE_MS)) problems.push(`${r.method} ${r.host}${r.path} ${r.at - signal} ms after the opt-out`);
  }
  return [...new Set(problems)].slice(0, 20);
}

// I8: no uncaught page error (other than the ones a scenario causes on purpose), no "Application error" screen, no error
// page unless the scenario expects one, and, in the old-Safari emulation, no script that holds a lookbehind.
function errors(run) {
  const expected = run.options.expectErrors || [];
  const problems = run.errors.filter(error => !expected.some(pattern => pattern.test(error.message))).map(error => `page error on ${error.path}: ${error.message.slice(0, 160)}`);
  for (const r of run.reports) {
    if (r.kind === 'app-error') problems.push(`"Application error" screen on ${r.path}`);
    if (r.kind === 'error-page' && !run.options.allowErrorPage) problems.push(`the ${r.which === 'global' ? 'whole-document (global) ' : ''}error page showed on ${r.path}`);
  }
  for (const script of run.lookbehindScripts) problems.push(`${script} holds a lookbehind, which Safari before 16.4 cannot parse`);
  return [...new Set(problems)];
}

/** I1–I8 for one run: { I1: [problems], … }. I9 compares two runs (diffStrings). */
function invariants(run) {
  return { I1: hosts(run), I2: events(run), I3: snapshots(run), I4: needles(run), I5: blockedPages(run), I6: storage(run), I7: privacy(run), I8: errors(run) };
}

// I9: what two runs with different visitor values recorded, outside the masked and left-out regions, differs only as
// scripts/e2e/known-differences.json allows (each entry reviewed: content that changes by itself, not the input).
function diffStrings(a, b) {
  const A = new Set(domStrings(a)), B = new Set(domStrings(b));
  return { onlyA: [...A].filter(x => !B.has(x)), onlyB: [...B].filter(x => !A.has(x)) };
}

function labelOf(ev) {
  const d = ev.data || {};
  if (ev.type === 2) return 'full snapshot';
  if (ev.type === 4) return 'meta';
  if (ev.type === 5) return `custom ${d.tag}`;
  if (ev.type === 3) return `incremental ${d.source}`;
  return `type ${ev.type}`;
}
// A page's path, with any query shown only as `?…`: a handoff page's query holds a runner's times.
const short = url => String(url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '?…') || '/';

module.exports = { ROOT, SITE, policy, RUNNING, experimentPlant, expectedFeatures, experimentHead, withExperiments, search, unread, domStrings, diffStrings, invariants };
