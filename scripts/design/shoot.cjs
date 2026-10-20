#!/usr/bin/env node
'use strict';
// Screenshots of the static export for design review (docs: the redesign spec, section 8.0).
//
//   node scripts/design/shoot.cjs --routes=/,/research,/stories/round-numbers --out=<dir>
//        [--profiles=all|phone,desktop,tablet,dark,reduced,km,zoom,phone664,phone714] [--ix] [--dir=out]
//        [--mask=canvas,.replay-hud] [--animations=allow] [--max-screens=60] [--no-scroll]
//
// --routes takes a comma list or @file (one route per line, # comments allowed). Pages are served from the export in
// --dir (default out/) through scripts/e2e/server.cjs inside Playwright's routing, the way Vercel serves it: no port is
// opened and every other host is refused, so a capture can never reach analytics or a third party. One browser, pages
// in series: the machine is shared.
//
// Each capture waits for document.fonts.ready and 800 ms, scrolls through the page once so reveals fire, and returns to
// the top. CSS animations are stopped at their end state unless --animations=allow. --mask=<selectors> (a comma list,
// e.g. canvas,.replay-hud,.runner-track) paints those elements one flat colour, so a before/after comparison
// (sheet.py diff) ignores the replay's moving dots and clock and the looping runners. --ix runs the
// interaction scripts in scripts/design/interactions.cjs after the captures, on the phone and desktop profiles (and
// at 200% zoom those that say so).
//
// Writes <out>/<profile>/<slug>-first.png and -full.png (default <out>: pace-notes-shots in the system temp folder), and
// merges a JSON report into <out>/report.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { respond } = require('../e2e/server.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'https://splithappens.run';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID_UA };
/** Profile name → context options, what it captures, and which routes it applies to under --profiles=all. */
const PROFILES = {
  phone: { context: phone, captures: ['first', 'full'] },
  phone664: { context: { ...phone, viewport: { width: 390, height: 664 } }, captures: ['first'], homeOnly: true },
  phone714: { context: { ...phone, viewport: { width: 402, height: 714 } }, captures: ['first'], homeOnly: true },
  desktop: { context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: DESKTOP_UA }, captures: ['first', 'full'] },
  // A tablet held sideways or a small laptop, between the two-column layout (900 px) and the chapter rail (1180 px): the
  // tool routes' cards change layout there (October 20, 2026: the planner's course-shape card).
  tablet: { context: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, userAgent: DESKTOP_UA }, captures: ['first', 'full'], toolsOnly: true },
  dark: { context: phone, captures: ['first', 'full'], dark: true },   // the system setting dark (colorScheme)
  reduced: { context: { ...phone, reducedMotion: 'reduce' }, captures: ['full'] },
  km: { context: phone, captures: ['first'], query: { units: 'km' } },
  zoom: { context: { ...phone, viewport: { width: 195, height: 332 } }, captures: ['first'] },
};
const ALL = Object.keys(PROFILES);

function args(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/** The routes named by a comma list or an @file. */
function readRoutes(spec) {
  if (!spec || spec === true) throw new Error('--routes is required (a comma list or @file)');
  const text = spec.startsWith('@') ? fs.readFileSync(path.resolve(spec.slice(1)), 'utf8').split(/\r?\n/) : spec.split(',');
  return text.map((r) => r.replace(/#.*/, '').trim()).filter(Boolean).map((r) => (r.startsWith('/') ? r : '/' + r));
}

/** A file-safe name for a route: / → home, /stories/round-numbers → stories__round-numbers. */
function slugOf(route) {
  const [p, q] = route.split('?');
  const base = p.replace(/^\/+|\/+$/g, '').replace(/\//g, '__') || 'home';
  return q ? `${base}_q_${q.replace(/[^a-z0-9]+/gi, '-')}` : base;
}

function withQuery(route, query) {
  if (!query) return route;
  const url = new URL(route, SITE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

/** Routes every request: the site's host from the export, anything else refused and recorded. */
async function serve(context, dir, foreign) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'splithappens.run' || url.hostname === 'www.splithappens.run') {
      const file = respond(dir, url.pathname);
      return route.fulfill({ status: file.status, contentType: file.contentType, body: file.body });
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    foreign.push(url.href.slice(0, 160));
    return route.abort('blockedbyclient');
  });
}

/** Scrolls through the page once (so reveals and lazy figures fire), then back to the top. */
async function scrollThrough(page, step, maxSteps) {
  await page.evaluate(async ({ step, maxSteps }) => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    let y = 0;
    for (let i = 0; i < maxSteps; i++) {
      const h = document.documentElement.scrollHeight;
      if (y >= h) break;
      y += step;
      window.scrollTo(0, y);
      await pause(110);
    }
    await pause(400);
    window.scrollTo(0, 0);
    await pause(400);
  }, { step, maxSteps });
}

/** Loads a route and settles it the way every capture expects. */
async function open(page, route, opts) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e && e.message || e).slice(0, 240)));
  // A request this tool refused (another host, such as analytics under a dummy key) logs ERR_BLOCKED_BY_CLIENT; it is
  // listed in `foreign` instead, so it is not the page's error.
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push('console: ' + m.text().slice(0, 240)); });
  let status = null;
  try {
    const res = await page.goto(SITE + route, { waitUntil: 'load', timeout: 60000 });
    status = res ? res.status() : null;
  } catch (e) {
    errors.push('goto: ' + String(e).slice(0, 200));
  }
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(800);
  if (!opts.noScroll) {
    const vh = page.viewportSize().height;
    await scrollThrough(page, Math.round(vh * 0.8), 400);
  }
  return { status, errors };
}

/** The measurements every capture records alongside its pictures. */
async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vh = window.innerHeight;
    const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter((r) => r.w > 0 && r.h > 0);
    return {
      title: document.title,
      h1: Array.from(document.querySelectorAll('h1')).map((h) => h.innerText.trim().slice(0, 120)),
      scrollHeight: de.scrollHeight,
      screens: +(de.scrollHeight / vh).toFixed(2),
      overflowX: de.scrollWidth > de.clientWidth + 1 ? de.scrollWidth - de.clientWidth : 0,
      canvases,
    };
  });
}

async function capture(browser, route, name, opts, ix) {
  const profile = PROFILES[name];
  const foreign = [];
  // The dark profile is a phone whose system setting is dark: the page follows prefers-color-scheme (tokens.css), as a
  // reader's phone does, with nothing set on the page.
  const context = await browser.newContext({ ...profile.context, reducedMotion: profile.context.reducedMotion || 'no-preference', colorScheme: profile.dark ? 'dark' : 'light' });
  await serve(context, opts.dir, foreign);
  const page = await context.newPage();
  const target = withQuery(route, profile.query);
  const { status, errors } = await open(page, target, opts);
  const metrics = await measure(page);
  const dir = path.join(opts.out, name);
  fs.mkdirSync(dir, { recursive: true });
  const slug = slugOf(route);
  const shot = { animations: opts.animations === 'allow' ? 'allow' : 'disabled', caret: 'hide', timeout: 120000 };
  if (opts.mask) Object.assign(shot, { mask: String(opts.mask).split(',').filter(Boolean).map((s) => page.locator(s)), maskColor: '#FF00FF' });
  const files = {};
  for (const kind of profile.captures) {
    const file = path.join(dir, `${slug}-${kind}.png`);
    try {
      if (kind === 'first') await page.screenshot({ ...shot, path: file });
      else {
        const vp = page.viewportSize();
        const max = vp.height * opts.maxScreens;
        if (metrics.scrollHeight > max) {
          await page.screenshot({ ...shot, path: file, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: max } });
          files.truncatedAt = max;
        } else await page.screenshot({ ...shot, path: file, fullPage: true });
      }
      files[kind] = path.relative(opts.out, file);
    } catch (e) {
      errors.push(`screenshot ${kind}: ` + String(e).slice(0, 200));
    }
  }
  let interactions = [];
  if (ix && (name === 'phone' || name === 'desktop' || name === 'zoom')) {
    const { runInteractions } = require('./interactions.cjs');
    interactions = await runInteractions(page, { dir, slug, profile: name, route, shot });
  }
  await context.close();
  return { route, slug, profile: name, url: target, status, files, ...metrics, errors, foreign, interactions };
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 20).join('\n')); return; }
  const routes = readRoutes(a.routes);
  const out = path.resolve(a.out || path.join(os.tmpdir(), 'pace-notes-shots'));
  const dir = path.resolve(ROOT, a.dir || 'out');
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`No export at ${dir}: run npm run build first.`);
  const requested = !a.profiles || a.profiles === 'all' ? ALL : String(a.profiles).split(',').map((s) => s.trim());
  for (const p of requested) if (!PROFILES[p]) throw new Error(`Unknown profile ${p}; one of ${ALL.join(', ')}`);
  const explicit = a.profiles && a.profiles !== 'all';
  const opts = { out, dir, mask: a.mask, animations: a.animations, noScroll: !!a['no-scroll'], maxScreens: Number(a['max-screens'] || 60) };
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--font-render-hinting=none'],
  });
  const results = [];
  try {
    for (const route of routes) {
      for (const name of requested) {
        if (PROFILES[name].homeOnly && !explicit && route.split('?')[0] !== '/') continue;
        if (PROFILES[name].toolsOnly && !explicit && !route.startsWith('/tools/')) continue;
        const t0 = Date.now();
        const r = await capture(browser, route, name, opts, !!a.ix);
        results.push(r);
        const ixNote = r.interactions.length ? ` ix=${r.interactions.filter((i) => i.ok).length}/${r.interactions.length}` : '';
        console.log(`${name.padEnd(8)} ${route} ${r.status} screens=${r.screens}${r.overflowX ? ` OVERFLOW-X=${r.overflowX}` : ''}${r.errors.length ? ` errors=${r.errors.length}` : ''}${ixNote} ${Date.now() - t0}ms`);
      }
    }
  } finally {
    await browser.close();
  }
  const reportFile = path.join(out, 'report.json');
  let report = [];
  try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { /* a new report */ }
  const key = (r) => `${r.profile} ${r.route}`;
  const fresh = new Set(results.map(key));
  report = report.filter((r) => !fresh.has(key(r))).concat(results);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1) + '\n');
  const bad = results.filter((r) => r.errors.length || r.status !== 200 || r.overflowX);
  for (const r of bad) console.log(`  ! ${r.profile} ${r.route}: status ${r.status}${r.overflowX ? `, overflows by ${r.overflowX}px` : ''}${r.errors.length ? `, ${r.errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`${results.length} captures → ${out} (report.json)`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}

module.exports = { PROFILES, readRoutes, slugOf, serve, open, scrollThrough, SITE };
