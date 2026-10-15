'use strict';
// Chromium for the privacy checks. Each Run is one browser context (a fresh visitor) whose every request is routed:
// the site's hosts are answered from out/ (server.cjs), *.posthog.com by the mock (posthog-mock.cjs), and anything else
// is recorded and aborted. The browser's proxy is a dead port, so nothing the routing misses can leave the machine
// either. An init script hides the headless signals posthog-js drops events for (navigator.webdriver, a HeadlessChrome
// brand), applies a run's privacy and storage modes, emulates Safari before 16.4 when asked, and reports every storage
// and cookie write, so the checks in inspect.cjs see what the page did as well as what it sent.
//
// What was sent to PostHog is read inside the page: the init script reports every body the page hands to fetch,
// XMLHttpRequest or sendBeacon for a PostHog host, as it is handed over. Playwright and the DevTools protocol can report a
// beacon sent while its page unloads without its body (and every batch goes to the same address), so a body is never
// matched to a request by its address. The network log only checks that every PostHog request the browser made was one
// the page handed over (inspect.cjs counts them per address); one that was not, or a body that could not be read, fails.
const { chromium } = require('playwright');
const { respond } = require('./server.cjs');
const mock = require('./posthog-mock.cjs');

const SITE = 'https://splithappens.run';
const SITE_HOSTS = new Set(['splithappens.run', 'www.splithappens.run']);
// A Vercel preview address (not an analytics host) and localhost, both answered from out/ like the site.
const PREVIEW_HOST = 'htw-live-study-git-e2e-koolkam00.vercel.app';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const LOOKBEHIND = /\(\?<[=!]/;
// Where S7's self-test sends a planted beacon (a path posthog-js never uses), so it is searched but not taken for an event.
const SELF_TEST_PATH = '/e2e-self-test/';

/** Playwright's Chromium (PLAYWRIGHT_CHROMIUM_PATH, when set, names another executable). */
function launch() {
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--disable-blink-features=AutomationControlled', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'],
  });
}

// Runs in every document before the page's own scripts.
const INIT = ({ dnt, gpc, storage, safari15, plant }) => {
  const report = entry => { try { window.__e2eReport(entry); } catch { /* the binding is gone while the page unloads */ } };
  try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true }); } catch {}
  const brands = [{ brand: 'Chromium', version: '140' }, { brand: 'Google Chrome', version: '140' }, { brand: 'Not=A?Brand', version: '24' }];
  const uaData = { brands, mobile: false, platform: 'Linux', getHighEntropyValues: async () => ({ brands, mobile: false, platform: 'Linux', fullVersionList: brands }), toJSON() { return { brands, mobile: false, platform: 'Linux' }; } };
  try { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => uaData, configurable: true }); } catch {}
  if (dnt) Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1', configurable: true });
  if (gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
  if (safari15) {
    // Safari before 16.4 cannot build a lookbehind: constructing one throws a SyntaxError there.
    const Native = RegExp;
    window.__e2eLookbehind = [];
    const check = args => { const source = args[0] instanceof Native ? args[0].source : String(args[0]); if (/\(\?<[!=]/.test(source)) { window.__e2eLookbehind.push(source.slice(0, 60)); throw new SyntaxError('Invalid regular expression: invalid group specifier name'); } };
    window.RegExp = new Proxy(Native, { construct(target, args, newTarget) { check(args); return Reflect.construct(target, args, newTarget); }, apply(target, self, args) { check(args); return Reflect.apply(target, self, args); } });
  }
  // Values a scenario puts in place before the page loads (a stale experiment variant, say), written before the
  // storage log starts so they are not counted as the site's own writes.
  if (plant) {
    try { for (const [key, value] of Object.entries(plant.session || {})) sessionStorage.setItem(key, value); } catch {}
    const mark = () => { if (!document.documentElement) return false; for (const [name, value] of Object.entries(plant.html || {})) document.documentElement.setAttribute(name, value); return true; };
    if (!mark()) new MutationObserver((_, observer) => { if (mark()) observer.disconnect(); }).observe(document, { childList: true });
  }
  const area = target => { try { return target === window.localStorage ? 'local' : 'session'; } catch { return 'session'; } };
  for (const op of ['setItem', 'removeItem', 'clear']) {
    const original = Storage.prototype[op];
    Storage.prototype[op] = function (...args) {
      const where = area(this);
      report({ kind: 'storage', op, area: where, key: args[0] === undefined ? null : String(args[0]), path: location.pathname });
      if (storage === 'quota' && op === 'setItem' && where === 'session') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return original.apply(this, args);
    };
  }
  if (storage === 'throw') Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  // Every PostHog body as the page hands it over. A Blob's bytes cannot be read at once (and a beacon's page may be gone
  // a moment later), so the parts each Blob is made of are kept as it is made.
  const NativeBlob = window.Blob;
  const blobParts = new WeakMap();
  class RecordedBlob extends NativeBlob {
    constructor(parts, options) { super(parts, options); blobParts.set(this, Array.from(parts || [])); }
    static [Symbol.hasInstance](value) { return value instanceof NativeBlob; }
  }
  window.Blob = RecordedBlob;
  const encoder = new TextEncoder();
  const bytesOf = body => {
    if (body === null || body === undefined) return new Uint8Array(0);
    if (typeof body === 'string') return encoder.encode(body);
    if (body instanceof URLSearchParams) return encoder.encode(body.toString());
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    const parts = body instanceof NativeBlob ? blobParts.get(body) : null;
    if (!parts) return null; // a Blob the page did not build (or FormData): unreadable here, so reported as such
    const chunks = parts.map(bytesOf);
    if (chunks.some(chunk => !chunk)) return null;
    const all = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
    chunks.reduce((at, chunk) => { all.set(chunk, at); return at + chunk.length; }, 0);
    return all;
  };
  const base64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(text); };
  const toPostHog = url => { try { return /(^|\.)posthog\.(com|net)$/.test(new URL(url, location.href).hostname); } catch { return false; } };
  const handed = (via, url, body) => {
    if (!toPostHog(url)) return;
    let bytes = null;
    try { bytes = bytesOf(body); } catch { /* reported as unreadable */ }
    report({ kind: 'posthog-body', via, url: new URL(url, location.href).href, body: bytes ? base64(bytes) : null, path: location.pathname });
  };
  const sendBeacon = Navigator.prototype.sendBeacon;
  Navigator.prototype.sendBeacon = function (url, data) { handed('sendBeacon', url, data); return sendBeacon.call(this, url, data); };
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const request = typeof input === 'string' || input instanceof URL ? null : input;
      if (String((init && init.method) || (request && request.method) || 'GET').toUpperCase() === 'POST') handed('fetch', request ? request.url : String(input), init && 'body' in init ? init.body : request ? request : null);
    } catch { /* never in the page's way */ }
    return nativeFetch.apply(this, arguments);
  };
  const xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send, xhrTarget = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url) { xhrTarget.set(this, [String(method).toUpperCase(), String(url)]); return xhrOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) { const [method, url] = xhrTarget.get(this) || []; if (method === 'POST') handed('xhr', url, body); return xhrSend.apply(this, arguments); };
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get() { return cookie.get.call(this); }, set(value) { report({ kind: 'cookie', value: String(value).split(';')[0].slice(0, 80), path: location.pathname }); return cookie.set.call(this, value); } });
  // Next.js's "Application error" screen (a crash) and the site's own error pages, once per document: app/error.tsx
  // inside the site's header and footer, or app/global-error.tsx in place of the whole document.
  const seen = new Set();
  setInterval(() => {
    if (!document.body) return;
    for (const heading of document.getElementsByTagName('h2')) if (!seen.has('app') && heading.textContent.startsWith('Application error')) { seen.add('app'); report({ kind: 'app-error', path: location.pathname }); }
    const which = document.querySelector('.page-error') ? 'page' : document.title.startsWith('This page didn') && !document.querySelector('nav.main-nav') ? 'global' : null;
    if (which && !seen.has(which)) { seen.add(which); report({ kind: 'error-page', which, path: location.pathname }); }
  }, 250);
};

/**
 * One visitor: a browser context with the routing and listeners above. Options:
 *   viewport {width,height}, mobile, reducedMotion   the device
 *   dnt, gpc                                          the browser's privacy signals
 *   storage: 'throw' | 'quota'                        sessionStorage unreadable, or every write failing
 *   safari15                                          emulate Safari before 16.4
 *   blocklist (default true)                          the project's URL blocklist in the mock remote config
 *   plant: { session, html }                          sessionStorage values and <html> attributes set before load
 *   initScript: function                              another script to run in every document before the page's own
 *   html: (text, path) => text                        a change to each HTML page as it is served
 *   expectNoPostHog                                   no PostHog request may be made at all (I7)
 *   expectErrors: [RegExp]                            page errors the scenario causes on purpose (I8)
 *   allowErrorPage                                    the site's error page may show (I8)
 *   needles: [string | RegExp | {needle, allowAt}]    more strings that must not appear in PostHog traffic (I4)
 */
class Run {
  constructor(browser, out, name, options = {}) {
    this.browser = browser;
    this.out = out;
    this.name = name;
    this.options = { blocklist: true, ...options };
    this.start = Date.now();
    this.requests = [];   // every request the browser made: { at, url, host, method, type }
    this.sent = [];       // every body the page handed to PostHog, decoded: { at, path, url, via, events, raw, decodeError }
    this.wire = [];       // every PostHog POST the browser made: { at, path, url }
    this.navs = [];       // main-frame addresses over time, per page: { at, page, url } (url null when the page closed)
    this.errors = [];     // uncaught page errors: { at, path, message }
    this.reports = [];    // from the init script: storage and cookie writes, error screens
    this.storage = [];    // each page's storage when it closed
    this.lookbehindScripts = [];
    this.blockers = [];
    this.delays = [];
    this.pages = new Set();
    this.pageCount = 0;
    this.privacySignalAt = null;
  }

  async open() {
    const o = this.options;
    this.context = await this.browser.newContext({
      userAgent: USER_AGENT, viewport: o.viewport || { width: 1280, height: 900 }, isMobile: !!o.mobile, hasTouch: !!o.mobile,
      locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: o.reducedMotion || 'no-preference', serviceWorkers: 'block',
    });
    await this.context.exposeBinding('__e2eReport', (source, entry) => {
      if (entry && entry.kind === 'posthog-body') {
        const url = new URL(entry.url);
        const decoded = entry.body === null ? { events: null } : mock.decodeBody(entry.url, Buffer.from(entry.body, 'base64'));
        this.sent.push({ at: Date.now(), path: url.pathname, url: entry.url, via: entry.via, page: entry.path, ...decoded });
      } else this.reports.push({ at: Date.now(), ...entry });
    });
    await this.context.addInitScript(INIT, { dnt: !!o.dnt, gpc: !!o.gpc, storage: o.storage || null, safari15: !!o.safari15, plant: o.plant || null });
    if (o.initScript) await this.context.addInitScript(o.initScript);
    this.context.on('request', request => this.onRequest(request));
    await this.context.route('**/*', route => this.route(route));
    return this;
  }

  onRequest(request) {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    const entry = { at: Date.now(), url: request.url(), host: url.hostname, path: url.pathname, method: request.method(), type: request.resourceType() };
    this.requests.push(entry);
    if (mock.POSTHOG_HOST.test(url.hostname) && request.method() === 'POST') this.wire.push({ at: entry.at, path: url.pathname, url: request.url() });
  }

  /** Slows the page's CPU by `rate` (6 is a slow phone), through the DevTools protocol. */
  async throttle(page, rate) {
    const cdp = await this.context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  }

  async route(route) {
    const request = route.request();
    const url = new URL(request.url());
    if (mock.POSTHOG_HOST.test(url.hostname)) return mock.answer(route, url, { blocklist: this.options.blocklist });
    if (SITE_HOSTS.has(url.hostname) || url.hostname === PREVIEW_HOST || LOCAL_HOSTS.has(url.hostname)) {
      if (this.blockers.some(block => block(url))) return route.abort('failed');
      const file = respond(this.out, url.pathname);
      if (this.options.safari15 && file.contentType === 'application/javascript' && LOOKBEHIND.test(file.body.toString('latin1'))) this.lookbehindScripts.push(url.pathname);
      // A scenario may change a page as served (S6 puts a fixture experiment's <head> markup in place of the build's).
      const body = this.options.html && file.contentType.startsWith('text/html') ? Buffer.from(this.options.html(file.body.toString('utf8'), url.pathname)) : file.body;
      for (const delay of this.delays) if (delay.test(url)) await new Promise(resolve => setTimeout(resolve, delay.ms));
      return route.fulfill({ status: file.status, contentType: file.contentType, body });
    }
    return route.abort(); // any other host (I1 reports it)
  }

  /** Answers requests to the site `ms` later while `predicate(url)` holds (a slow network); returns a function that ends it. */
  delay(predicate, ms) {
    const delay = { test: predicate, ms };
    this.delays.push(delay);
    return () => { this.delays = this.delays.filter(other => other !== delay); };
  }

  /** Makes requests to the site fail while `predicate(url)` holds; returns a function that lifts the block. */
  block(predicate) {
    this.blockers.push(predicate);
    return () => { this.blockers = this.blockers.filter(block => block !== predicate); };
  }

  async newPage() {
    const page = await this.context.newPage();
    const id = ++this.pageCount;
    this.pages.add(page);
    page.on('pageerror', error => this.errors.push({ at: Date.now(), path: safePath(page.url()), message: String(error && error.message || error).slice(0, 300) }));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) this.navs.push({ at: Date.now(), page: id, url: frame.url() }); });
    page.on('close', () => this.navs.push({ at: Date.now(), page: id, url: null }));
    return page;
  }

  /** Records the page's storage, then closes it (with `unload`, running its pagehide and beforeunload handlers). */
  async closePage(page, { unload = false } = {}) {
    if (!this.pages.has(page)) return;
    this.pages.delete(page);
    this.storage.push(await storageOf(page));
    await page.close({ runBeforeUnload: unload });
    if (unload) await new Promise(resolve => setTimeout(resolve, 500));
  }

  async close() {
    for (const page of [...this.pages]) await this.closePage(page);
    this.cookies = await this.context.cookies();
    await this.context.close();
    this.end = Date.now();
  }

  /** Every PostHog request the browser made after `after` (ms since the epoch). */
  posthogRequests(after = 0) { return this.requests.filter(r => mock.POSTHOG_HOST.test(r.host) && r.at > after); }

  /**
   * Analytics events (not recording chunks), as sent: { at, path, e }. A request still open when its page unloads is
   * sent again as a beacon; PostHog keeps one event per uuid, and so does this. The harness's own self-test beacon
   * (SELF_TEST_PATH, S7) is not an event; it is still searched with everything else.
   */
  events() {
    return once(this.sent.filter(r => !/^\/s\/?$/.test(r.path) && r.path !== SELF_TEST_PATH).flatMap(r => (r.events || []).map(e => ({ at: r.at, path: r.path, e }))));
  }

  /** The `$snapshot` events (recording chunks), as sent, one per uuid. */
  snapshots() {
    return once(this.sent.filter(r => /^\/s\/?$/.test(r.path)).flatMap(r => (r.events || []).map(e => ({ at: r.at, e }))));
  }

  /** Every rrweb event in the recording chunks: { at (request time), ev }. */
  rrweb() {
    return this.snapshots().flatMap(({ at, e }) => ((e.properties && e.properties.$snapshot_data) || []).map(ev => ({ at, ev })));
  }

  /** Waits until a recording chunk holding a full snapshot was sent after `after`. */
  async waitForRecording(page, after = this.start, timeout = 25000) {
    return waitFor(async () => {
      if (this.rrweb().some(({ at, ev }) => at > after && ev.type === 2)) return true;
      await wiggle(page, 1);
      return false;
    }, timeout, 400);
  }

  /** Moves the mouse and waits until the recorder has sent a chunk started at least 1.5 s from now. */
  async flush(page, timeout = 30000) {
    const mark = Date.now() + 1500;
    return waitFor(async () => {
      if (this.sent.some(r => /^\/s\/?$/.test(r.path) && r.at > mark)) return true;
      await wiggle(page, 1);
      return false;
    }, timeout, 400);
  }
}

function once(list) {
  const seen = new Set();
  return list.filter(({ e }) => !e || !e.uuid || (!seen.has(e.uuid) && seen.add(e.uuid)));
}

function safePath(url) { try { return new URL(url).pathname; } catch { return String(url); } }

async function storageOf(page) {
  return page.evaluate(() => {
    const read = area => { try { const store = window[area]; return Object.fromEntries(Object.keys(store).map(key => [key, String(store.getItem(key)).slice(0, 120)])); } catch (error) { return { __unreadable__: String(error).slice(0, 80) }; } };
    return { path: location.pathname, host: location.hostname, local: read('localStorage'), session: read('sessionStorage'), cookie: document.cookie };
  }).catch(error => ({ error: String(error).slice(0, 200) }));
}

async function waitFor(test, timeout = 20000, every = 250) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test()) return true;
    await new Promise(resolve => setTimeout(resolve, every));
  }
  return false;
}

/** A little mouse movement and scrolling, so the recorder has something to send. */
async function wiggle(page, moves = 6) {
  if (page.isClosed()) return;
  const { width, height } = page.viewportSize();
  try {
    for (let i = 0; i < moves; i++) {
      await page.mouse.move(20 + (i * 97) % (width - 40), 120 + (i * 61) % (height - 200), { steps: 2 });
      await page.waitForTimeout(40);
    }
    await page.mouse.wheel(0, 300); await page.waitForTimeout(80); await page.mouse.wheel(0, -300);
  } catch { /* the page navigated or closed meanwhile */ }
}

/** Types into a field the way a visitor does: click, clear, type, then Tab out. */
async function type(page, locator, value) {
  const field = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await field.scrollIntoViewIfNeeded({ timeout: 8000 });
  await field.click({ timeout: 8000 });
  await field.fill('');
  await field.pressSequentially(value, { delay: 15 });
  await page.keyboard.press('Tab');
}

module.exports = { SITE, SITE_HOSTS, PREVIEW_HOST, LOOKBEHIND, SELF_TEST_PATH, launch, Run, waitFor, wiggle, type };
