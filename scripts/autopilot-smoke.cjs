#!/usr/bin/env node
/**
 * Does the live (or a preview) site work? Opens its pages in Chromium and checks each one (docs/AUTOPILOT.md).
 *
 *   node scripts/autopilot-smoke.cjs --base https://splithappens.run                    every sitemap page
 *   node scripts/autopilot-smoke.cjs --base https://<preview>.vercel.app --quick --expect-sha <sha> --json smoke.json
 *
 *   --quick            a fixed list of key pages instead of the whole sitemap
 *   --expect-sha <sha> fail unless <base>/version.json (scripts/write-version.cjs) names this commit
 *   --json <file>      write every result to <file>; stdout gets a short summary
 *
 * Each page opens at 390×844 (mobile); / and /tools also at 1366×900, and is scrolled to the bottom in steps (so
 * lazy images and anything loaded on scroll are requested too) and watched for at least 5 seconds from the start of
 * its navigation (so an error a few seconds after hydration is seen) before it is read. A check fails when the final HTTP
 * status is not 200, the page throws (pageerror), Next.js shows "Application error", there is no visible <h1>, an
 * error page is on screen (the heading from app/error.tsx or app/global-error.tsx when they exist, or any element
 * marked data-error-boundary), or a request to the site itself (a script, stylesheet or data file) answers 400 or
 * more. The quick list is opened again as Safari before 16.4 behaves (constructing a RegExp with lookbehind throws
 * SyntaxError), with the same checks.
 *
 * Every request is routed: the base origin is allowed, *.posthog.com is aborted and counted (expected on production,
 * never a failure; posthog-js also ignores headless browsers, so nothing reaches analytics), on *.vercel.app previews
 * Vercel's own toolbar (vercel.live) is aborted and counted the same way, and any other host is
 * aborted and fails the run (a privacy tripwire), with the host and page printed. A check whose first load failed for
 * a network reason (navigation timeout, a 5xx, a request to the site that failed or answered 500 or more) is loaded
 * once more in a fresh context and counts as failed only if that load fails too; a page error, a crash screen or a
 * missing heading with no network cause fails at once. The home page is then loaded three times at 390 px with 4× CPU
 * throttling and a 1.6 Mbps / 150 ms network to report LCP, CLS and total blocking time; only a median CLS above 0.25
 * fails (no finished lab run is a warning). sitemap.xml and version.json are fetched up to three times.
 *
 * Exit 0 when every check passes, 1 when a page or check failed, 3 when the run could not finish (the browser did not
 * start, or sitemap.xml or version.json could not be read) and nothing failed: the merge workflow then tries again or
 * reports it, rather than blaming the change.
 *
 * Needs Playwright with Chromium (npm ci, then npx playwright install chromium) and network access. Node's fetch
 * (sitemap, version.json) does not read HTTPS_PROXY by itself; behind a proxy run with NODE_USE_ENV_PROXY=1.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const BASE_ARG = option('--base');
const QUICK = args.includes('--quick');
const JSON_FILE = option('--json');
const EXPECT_SHA = option('--expect-sha');

const CONCURRENCY = 4;
const NAV_TIMEOUT_MS = 45000;
const SETTLE_MS = 1500;
const OBSERVE_MS = 5000; // the least time a page is watched from the start of its navigation, so late errors show
const SCROLL_STEPS = 30;
const FETCH_ATTEMPTS = 3;
const PERF_RUNS = 3;
const CLS_LIMIT = 0.25;
const MOBILE = { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { name: 'desktop', viewport: { width: 1366, height: 900 } };
const DESKTOP_TOO = new Set(['/', '/tools']);
const QUICK_ROUTES = ['/', '/stories', '<story>', '/tools', '<tools>', '/analyses', '/analyses/pacing-pattern', '/runners', '/courses', '<course>', '/about', '/privacy', '/request-analysis', '/packs'];
const POSTHOG_HOST = /(^|\.)posthog\.com$/i;
// Vercel adds its toolbar (vercel.live/_next-live/feedback/feedback.js) to preview deployments; it is not site code.
const PREVIEW_TOOLBAR_HOST = /^vercel\.live$/i;
const PREVIEW_HOST = /\.vercel\.app$/i;
const NEXT_CRASH = 'Application error: a client-side exception has occurred';

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    const fallback = '/opt/node-tools/node_modules/playwright';
    if (fs.existsSync(fallback)) return require(fallback);
    throw new Error(`Playwright is not installed (${error.message.split('\n')[0]}). Run npm ci, then npx playwright install chromium.`);
  }
}

/** Headings of the site's own error pages, read from the source so the check follows any rewording. */
function errorHeadings() {
  const headings = [];
  for (const file of ['app/error.tsx', 'app/global-error.tsx']) {
    let source;
    try { source = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
    for (const match of source.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/g)) {
      const text = match[1]
        .replace(/\{\s*([`'"])([\s\S]*?)\1\s*\}/g, '$2')
        .replace(/<[^>]+>/g, '')
        .replace(/&apos;|&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (text && !/[{}]/.test(text) && !headings.includes(text)) headings.push(text);
    }
  }
  return headings;
}

// Runs in the page before any of its scripts: Safari < 16.4 throws SyntaxError when a RegExp with lookbehind is built.
function oldSafariInit() {
  window.__smokeLookbehind = 0;
  const Native = RegExp;
  const check = (list) => {
    const source = list[0] instanceof Native ? list[0].source : String(list[0]);
    if (/\(\?<[=!]/.test(source)) { window.__smokeLookbehind += 1; throw new SyntaxError('Invalid regular expression: invalid group specifier name'); }
  };
  window.RegExp = new Proxy(Native, {
    construct(target, list, newTarget) { check(list); return Reflect.construct(target, list, newTarget); },
    apply(target, self, list) { check(list); return Reflect.apply(target, self, list); },
  });
}

// Runs in the page before any of its scripts: LCP, CLS (largest session window) and long tasks for the lab run.
function perfInit() {
  const perf = { lcp: null, cls: 0, longTasks: [] };
  window.__smokePerf = perf;
  const observe = (type, onEntry) => { try { new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true }); } catch { /* unsupported entry type */ } };
  observe('largest-contentful-paint', (entry) => { perf.lcp = entry.renderTime || entry.loadTime || entry.startTime; });
  let windowValue = 0;
  let first = 0;
  let last = 0;
  observe('layout-shift', (entry) => {
    if (entry.hadRecentInput) return;
    if (windowValue && entry.startTime - last < 1000 && entry.startTime - first < 5000) windowValue += entry.value;
    else { windowValue = entry.value; first = entry.startTime; }
    last = entry.startTime;
    perf.cls = Math.max(perf.cls, windowValue);
  });
  observe('longtask', (entry) => { perf.longTasks.push([entry.startTime, entry.duration]); });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** GET with up to three attempts for network errors, 5xx and 429; any other answer is final. */
async function fetchText(url) {
  for (let attempt = 1; ; attempt += 1) {
    let retry;
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'pace-notes-autopilot-smoke/1 (+https://splithappens.run)', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
      if (response.ok) return await response.text();
      retry = response.status >= 500 || response.status === 429;
      if (!retry || attempt >= FETCH_ATTEMPTS) throw Object.assign(new Error(`${url} answered ${response.status}`), { final: true });
    } catch (error) {
      if (error.final || attempt >= FETCH_ATTEMPTS) throw error;
    }
    await pause(attempt * 2000);
  }
}

async function sitemapPaths(base) {
  const xml = await fetchText(`${base}/sitemap.xml`);
  const paths = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => {
    try { return new URL(m[1]).pathname.replace(/\/$/, '') || '/'; } catch { return null; }
  }).filter(Boolean);
  if (!paths.length) throw new Error(`${base}/sitemap.xml lists no URLs`);
  return [...new Set(paths)];
}

const median = (values) => {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function main() {
  if (!BASE_ARG) {
    console.error('Usage: node scripts/autopilot-smoke.cjs --base <url> [--quick] [--json <file>] [--expect-sha <sha>]');
    return 2;
  }
  const base = new URL(BASE_ARG).origin;
  const started = Date.now();
  const failures = [];
  const warnings = [];
  // infrastructure: the run could not check something (exit 3 if nothing else failed), as opposed to a page that failed.
  const fail = (where, message, { infrastructure = false } = {}) => failures.push({ where, message, ...(infrastructure ? { infrastructure } : {}) });
  const preview = PREVIEW_HOST.test(new URL(base).hostname);
  const report = { base, mode: QUICK ? 'quick' : 'full', startedAt: new Date(started).toISOString(), expectSha: EXPECT_SHA || null, version: null, routes: [], checks: [], perf: null, posthogRequests: 0, previewToolbarRequests: 0, thirdParty: [], failures, warnings, durationMs: 0 };

  if (EXPECT_SHA) {
    // A wrong commit is read again a few times (an edge cache catching up) before it counts.
    for (let attempt = 1; ; attempt += 1) {
      try {
        const version = JSON.parse(await fetchText(`${base}/version.json?cb=${Date.now()}-${attempt}`));
        report.version = version;
        if (version.sha === EXPECT_SHA) break;
        if (attempt >= FETCH_ATTEMPTS) { fail('version.json', `serves commit ${version.sha}, expected ${EXPECT_SHA}`); break; }
      } catch (error) {
        fail('version.json', `could not be read: ${error.message}`, { infrastructure: true });
        break;
      }
      await pause(10000);
    }
  }

  let sitemap = [];
  try { sitemap = await sitemapPaths(base); } catch (error) { fail('sitemap.xml', `could not be read: ${error.message}`, { infrastructure: true }); }
  const first = (pattern) => sitemap.find((p) => pattern.test(p));
  const quick = [];
  for (const route of QUICK_ROUTES) {
    if (route === '<story>') { const p = first(/^\/stories\/[^/]+$/); if (p) quick.push(p); else if (sitemap.length) fail('sitemap.xml', 'lists no story page'); }
    else if (route === '<course>') { const p = first(/^\/courses\/[^/]+$/); if (p) quick.push(p); else if (sitemap.length) fail('sitemap.xml', 'lists no course page'); }
    else if (route === '<tools>') quick.push(...sitemap.filter((p) => /^\/tools\/[^/]+$/.test(p)));
    else quick.push(route);
  }
  const routes = QUICK ? [...new Set(quick)] : [...new Set([...sitemap, ...quick])];
  report.routes = routes;

  const tasks = [];
  for (const route of routes) {
    tasks.push({ route, device: MOBILE, oldSafari: false });
    if (DESKTOP_TOO.has(route)) tasks.push({ route, device: DESKTOP, oldSafari: false });
  }
  for (const route of [...new Set(quick)]) tasks.push({ route, device: MOBILE, oldSafari: true });

  const thirdParty = new Map();
  /** Writes the JSON and the summary. Exit 1 on any failure, 3 when only problems with the run itself (infrastructure) stopped it. */
  function finish() {
    const incomplete = failures.length > 0 && failures.every((f) => f.infrastructure);
    report.posthogRequests = report.checks.reduce((sum, c) => sum + c.posthog, 0);
    report.previewToolbarRequests = report.checks.reduce((sum, c) => sum + c.previewToolbar, 0);
    report.thirdParty = [...thirdParty].map(([host, pages]) => ({ host, pages: [...pages] }));
    report.durationMs = Date.now() - started;
    report.ok = failures.length === 0;
    if (JSON_FILE) fs.writeFileSync(JSON_FILE, `${JSON.stringify(report, null, 2)}\n`);

    const passed = report.checks.filter((c) => c.ok).length;
    const oldSafari = report.checks.filter((c) => c.oldSafari);
    const retried = report.checks.filter((c) => c.ok && c.attempts > 1);
    const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
    const m = report.perf ? report.perf.median : null;
    const labRuns = report.perf ? report.perf.runs.filter((r) => !r.error).length : 0;
    const lines = [
      `autopilot-smoke: ${base} (${report.mode}: ${routes.length} pages, ${report.checks.length} checks, ${seconds(report.durationMs)})`,
      EXPECT_SHA ? `version.json: ${report.version ? `commit ${String(report.version.sha).slice(0, 12)}` : 'unreadable'} (expected ${EXPECT_SHA.slice(0, 12)})` : 'version.json: not checked (no --expect-sha)',
      `Pages: ${passed} of ${report.checks.length} checks passed; old Safari: ${oldSafari.filter((c) => c.ok).length} of ${oldSafari.length}${retried.length ? `; ${retried.length} passed only on a second load: ${retried.slice(0, 5).map((c) => `${c.route} [${c.device}${c.oldSafari ? ', old Safari' : ''}] (${c.firstAttemptProblems[0]})`).join('; ')}` : ''}`,
      `PostHog requests aborted: ${report.posthogRequests}${report.posthogRequests ? ' (expected on production; never sent)' : ''}${preview ? `; Vercel preview toolbar requests aborted: ${report.previewToolbarRequests}` : ''}`,
      `Third-party requests: ${report.thirdParty.length ? report.thirdParty.map((t) => `${t.host} on ${t.pages.slice(0, 3).join(', ')}`).join('; ') : 'none'}`,
      !report.perf ? 'Home lab: not run' : m ? `Home lab (390 px, 4x CPU, 1.6 Mbps / 150 ms, median of ${labRuns}): LCP ${seconds(m.lcpMs || 0)}, CLS ${m.cls.toFixed(3)}, TBT ${Math.round(m.tbtMs)} ms` : 'Home lab: no run finished',
    ];
    for (const w of warnings) lines.push(`Warning: ${w.where}: ${w.message}`);
    if (incomplete) {
      lines.push(`COULD NOT FINISH: ${failures.length} problem${failures.length === 1 ? '' : 's'} with the run itself, none with the pages checked`);
      for (const f of failures) lines.push(`  ${f.where}: ${f.message}`);
    } else if (failures.length) {
      lines.push(`FAIL: ${failures.length} problem${failures.length === 1 ? '' : 's'}`);
      for (const f of failures.slice(0, 40)) lines.push(`  ${f.where}: ${f.message}`);
      if (failures.length > 40) lines.push(`  … and ${failures.length - 40} more${JSON_FILE ? ` (see ${JSON_FILE})` : ''}`);
    } else lines.push('PASS');
    console.log(lines.join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const summary = [`### Smoke test: ${base} (${report.mode})`, '', `**${incomplete ? 'Could not finish' : failures.length ? `Failed: ${failures.length} problem${failures.length === 1 ? '' : 's'}` : 'Passed'}**`, '', ...lines.slice(1, 6).map((l) => `- ${l}`)];
      if (failures.length) summary.push('', ...failures.slice(0, 20).map((f) => `- \`${f.where}\`: ${f.message.replace(/\|/g, '\\|')}`));
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n\n`);
    }
    return incomplete ? 3 : failures.length ? 1 : 0;
  }

  const headings = errorHeadings();
  report.errorHeadings = headings;
  // Behind an HTTPS proxy (a sandbox), route the browser through it too, except for a site on this machine.
  const proxyServer = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(base).hostname) ? null : process.env.HTTPS_PROXY || process.env.https_proxy;
  let browser;
  try {
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
      ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    });
  } catch (error) {
    fail('browser', `did not start: ${String(error.message).split('\n')[0]}`, { infrastructure: true });
    return finish();
  }

  async function newContext(device, page) {
    const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor, serviceWorkers: 'block' });
    const seen = { posthog: 0, toolbar: 0, thirdParty: [] };
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      if (POSTHOG_HOST.test(url.hostname)) { seen.posthog += 1; return route.abort('blockedbyclient'); }
      if (preview && PREVIEW_TOOLBAR_HOST.test(url.hostname)) { seen.toolbar += 1; return route.abort('blockedbyclient'); }
      seen.thirdParty.push(url.host);
      const pages = thirdParty.get(url.host) || new Set();
      pages.add(page);
      thirdParty.set(url.host, pages);
      return route.abort('blockedbyclient');
    });
    return { context, seen };
  }

  /** One load of one page in a fresh context: its status, problems and requests. */
  async function load(task) {
    const out = { status: null, problems: [], networkCause: null, h1: null, lookbehindThrown: 0, posthog: 0, previewToolbar: 0, thirdParty: [], sameOriginErrors: [], consoleErrors: 0 };
    const networkCause = (why) => { if (!out.networkCause) out.networkCause = why; };
    const { context, seen } = await newContext(task.device, task.route);
    if (task.oldSafari) await context.addInitScript(oldSafariInit);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error).split('\n')[0].slice(0, 200)));
    page.on('console', (message) => { if (message.type() === 'error') out.consoleErrors += 1; });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin !== base) return;
      if (response.status() >= 400) out.sameOriginErrors.push(`${response.status()} ${url.pathname}`);
      if (response.status() >= 500) networkCause(`${response.status()} ${url.pathname}`);
    });
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      const why = request.failure() ? request.failure().errorText : 'no answer';
      // ERR_ABORTED is the page (or the end of the load) cancelling a request, not the network failing.
      if (url.origin === base && !/ERR_ABORTED/.test(why)) networkCause(`${url.pathname} failed (${why})`);
    });
    const navigationStart = Date.now();
    try {
      const response = await page.goto(`${base}${task.route}`, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
      out.status = response ? response.status() : null;
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      // Scroll to the bottom in steps, so lazy images and anything loaded on scroll go through the tripwire too.
      await page.evaluate(async (steps) => {
        const step = Math.max(400, Math.floor(window.innerHeight * 1.5));
        for (let i = 0, y = step; i < steps && y < document.documentElement.scrollHeight + step; i += 1, y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        window.scrollTo(0, 0);
      }, SCROLL_STEPS).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(Math.max(SETTLE_MS, OBSERVE_MS - (Date.now() - navigationStart)));
      if (out.status !== 200) out.problems.push(`HTTP ${out.status}`);
      if (out.status >= 500) networkCause(`HTTP ${out.status}`);
      const state = await page.evaluate(({ headings, crash }) => {
        const norm = (s) => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
        const text = document.body ? document.body.innerText : '';
        const h1 = document.querySelector('h1');
        return { crashed: text.includes(crash), errorHeading: headings.find((h) => norm(text).includes(norm(h))) || null, errorBoundary: Boolean(document.querySelector('[data-error-boundary]')), h1: h1 ? h1.textContent.trim().slice(0, 80) : null, lookbehind: window.__smokeLookbehind || 0 };
      }, { headings, crash: NEXT_CRASH }).catch((error) => ({ evalError: String(error.message).split('\n')[0] }));
      if (state.evalError) out.problems.push(`could not read the page: ${state.evalError}`);
      else {
        out.h1 = state.h1;
        out.lookbehindThrown = state.lookbehind;
        if (state.crashed) out.problems.push(`shows "${NEXT_CRASH}"`);
        if (state.errorHeading) out.problems.push(`shows the error page ("${state.errorHeading}")`);
        else if (state.errorBoundary) out.problems.push('shows an error page (an element marked data-error-boundary)');
        const visible = await page.locator('h1').first().isVisible().catch(() => false);
        if (!state.h1) out.problems.push('no <h1>');
        else if (!visible) out.problems.push('the <h1> is not visible');
      }
    } catch (error) {
      out.problems.push(`navigation failed: ${String(error.message).split('\n')[0].slice(0, 200)}`);
      networkCause('navigation failed');
    }
    for (const message of [...new Set(pageErrors)].slice(0, 3)) out.problems.push(`pageerror: ${message}`);
    out.posthog = seen.posthog;
    out.previewToolbar = seen.toolbar;
    out.thirdParty = [...new Set(seen.thirdParty)];
    for (const host of out.thirdParty) out.problems.push(`request to third-party host ${host} (aborted)`);
    for (const failed of [...new Set(out.sameOriginErrors)].slice(0, 5)) out.problems.push(`same-origin request failed: ${failed}`);
    await context.close();
    return out;
  }

  /**
   * A first load that failed for a network reason is tried once more in a fresh context and fails only if that load
   * fails too, so one dropped request or a slow edge does not revert a good deploy. A failure with no network cause (a
   * page error, the crash screen, a missing heading) is the page's own and fails at once, so an error that shows up
   * on some loads only is not hidden by a clean second one. A third-party request on either load always fails.
   */
  async function visit(task) {
    const label = `${task.route} [${task.device.name}${task.oldSafari ? ', old Safari' : ''}]`;
    const t0 = Date.now();
    const first = await load(task);
    let final = first;
    let firstProblems = [];
    const retried = first.problems.length > 0 && Boolean(first.networkCause);
    if (retried) {
      final = await load(task);
      firstProblems = first.problems;
      for (const problem of first.problems) if (problem.startsWith('request to third-party host') && !final.problems.includes(problem)) final.problems.push(problem);
    }
    const result = { route: task.route, device: task.device.name, oldSafari: task.oldSafari, ok: final.problems.length === 0, ...final, attempts: retried ? 2 : 1, firstAttemptProblems: firstProblems, retryCause: retried ? first.networkCause : null, durationMs: Date.now() - t0 };
    for (const problem of result.problems) fail(label, problem);
    return result;
  }

  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      report.checks.push(await visit(task));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  report.checks.sort((a, b) => tasks.findIndex((t) => t.route === a.route && t.device.name === a.device && t.oldSafari === a.oldSafari) - tasks.findIndex((t) => t.route === b.route && t.device.name === b.device && t.oldSafari === b.oldSafari));

  // Home page lab performance, one load at a time.
  const runs = [];
  for (let i = 0; i < PERF_RUNS; i += 1) {
    const { context } = await newContext(MOBILE, '/ (performance)');
    await context.addInitScript(perfInit);
    const page = await context.newPage();
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await page.goto(`${base}/`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForTimeout(5000);
      const measured = await page.evaluate(() => {
        const perf = window.__smokePerf;
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        const fcp = fcpEntry ? fcpEntry.startTime : 0;
        const tbt = perf.longTasks.filter(([start]) => start >= fcp).reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
        return { lcp: perf.lcp, cls: perf.cls, tbt, fcp: fcpEntry ? fcpEntry.startTime : null, longTasks: perf.longTasks.length };
      });
      runs.push(measured);
    } catch (error) {
      runs.push({ error: String(error.message).split('\n')[0] });
    }
    await context.close();
  }
  await browser.close();
  const good = runs.filter((r) => !r.error);
  report.perf = {
    page: '/', viewport: '390x844', cpuThrottling: 4, network: '1.6 Mbps down, 750 kbps up, 150 ms RTT', runs,
    median: good.length ? { lcpMs: median(good.map((r) => r.lcp)), cls: median(good.map((r) => r.cls)), tbtMs: median(good.map((r) => r.tbt)), fcpMs: median(good.map((r) => r.fcp)) } : null,
  };
  if (!good.length) warnings.push({ where: '/ (performance)', message: `no lab run finished (reported, not a failure): ${runs.map((r) => r.error).join('; ')}` });
  else if (report.perf.median.cls > CLS_LIMIT) fail('/ (performance)', `median CLS ${report.perf.median.cls.toFixed(3)} is above ${CLS_LIMIT}`);
  return finish();
}

main().then((code) => { process.exitCode = code; }, (error) => { console.error(`autopilot-smoke: ${error.stack || error.message}`); process.exitCode = 3; });
