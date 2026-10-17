'use strict';
// S8 (I10): the JavaScript a page loads before anything else, gzipped: every script its exported HTML names. Every page
// type (each app/**/page.tsx route) has a figure in scripts/e2e/budget.json, measured on one of its pages, and may grow
// by at most 1.5 KB over it; a larger change needs a new budget, measured with `--only=S8 --write-budget` (which also
// adds a page for any route without one) and committed with the reason. A new route without a figure of its own is
// measured on one of its pages and held to the largest figure in its section (the budgeted pages that share its first
// path segment; in a new section, the largest of all) + 1.5 KB, and a note names it, so a pull request that cannot
// edit scripts/ (an autopilot one) can still add a page; the owner then measures its own figure. The lazily loaded
// analytics chunks (the SDK, the recorder, Web Vitals, the replay policy) are not initial JavaScript and are not counted.
//
// A second job measures layout shift in the lab (CLS, Chromium's layout-shift entries in session windows, as web-vitals
// counts them): a phone at 390 px with the CPU slowed 4x loads each page in LAB_PAGES, waits, then scrolls to the
// bottom; CLS must stay at or below 0.1. iOS Safari reports no CLS in the field (docs/ANALYTICS.md), so this is the only
// phone CLS figure. It also notes each page's LCP, which here has no network delay (the files are served locally).
//
//   node scripts/e2e/scenarios/s8-budget.cjs --self-test     the budget rules against a stand-in build (no browser)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BUDGET = path.join(__dirname, '..', 'budget.json');
const APP = path.join(__dirname, '..', '..', '..', 'app');
const TOLERANCE = 1536;

/** The exported HTML file for a page, or null. */
function htmlFile(out, pathname) {
  return [pathname === '/' ? 'index.html' : pathname.slice(1) + '.html', pathname.slice(1) + '/index.html'].map(f => path.join(out, f)).find(f => fs.existsSync(f)) || null;
}

/** Gzipped bytes (level 9) of every script the page's HTML names. */
function initialJs(out, pathname) {
  const file = htmlFile(out, pathname);
  if (!file) return null;
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]))];
  return scripts.reduce((sum, src) => sum + zlib.gzipSync(fs.readFileSync(path.join(out, decodeURIComponent(src.replace(/^\//, '')))), { level: 9 }).length, 0);
}

/**
 * Every page type: one per app/**\/page.tsx, as { route: '/tools/qualifying/[race]', test(pathname) }. Route groups
 * ("(name)") add no segment; a [param] matches one segment and a [...param] the rest.
 */
function routes(app = APP) {
  const found = [];
  const walk = (dir, segments) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), /^\(.*\)$/.test(entry.name) ? segments : [...segments, entry.name]);
      else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) found.push(segments);
    }
  };
  walk(app, []);
  return found.map(segments => {
    const route = '/' + segments.join('/');
    const source = segments.map(s => /^\[\.\.\..+\]$/.test(s) ? '.+' : /^\[.+\]$/.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
    const pattern = new RegExp('^/' + source + '$');
    return { route, dynamic: segments.filter(s => s.startsWith('[')).length, test: pathname => pattern.test(pathname) };
  });
}

/** The route a page belongs to: a fixed route before one with parameters (/packs/smyth_htw before /packs/[packId]). */
const routeOf = (all, pathname) => all.filter(r => r.test(pathname)).sort((a, b) => a.dynamic - b.dynamic)[0] || null;

/** A page to measure a route by: its own path, else the first sitemap page of that route, else the first page exported for it. */
function sample(out, all, route) {
  if (!route.dynamic) return route.route;
  const sitemap = [...fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8').matchAll(/<loc>https:\/\/splithappens\.run([^<]*)<\/loc>/g)].map(m => m[1] || '/');
  const exported = fs.readdirSync(out, { recursive: true }).filter(f => f.endsWith('.html')).map(f => '/' + f.replace(/\\/g, '/').replace(/(\/index)?\.html$/, '')).sort();
  return [...sitemap, ...exported].find(page => routeOf(all, page) === route) || null;
}

/** The first path segment of a page or route ('' for the home page): its section. */
const sectionOf = pathname => pathname.split('/')[1] || '';

/**
 * The figure a route without one of its own is held to: the largest figure among the budgeted pages of its section,
 * or, in a section with none, the largest of all. Returns { page, bytes }.
 */
function borrowed(pages, route) {
  const same = Object.entries(pages).filter(([page]) => sectionOf(page) === sectionOf(route.route));
  const [page, bytes] = (same.length ? same : Object.entries(pages)).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return { page, bytes };
}

function budget(h, write, { app = APP, file = BUDGET } = {}) {
  let committed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const all = routes(app);
  const unbudgeted = all.filter(route => !Object.keys(committed.pages).some(page => routeOf(all, page) === route));
  if (write) {
    const pages = [...Object.keys(committed.pages), ...unbudgeted.map(route => sample(h.out, all, route)).filter(Boolean)];
    committed = { ...committed, pages: Object.fromEntries(pages.map(page => [page, initialJs(h.out, page)])) };
    fs.writeFileSync(file, JSON.stringify(committed, null, 2) + '\n');
    h.note(`wrote ${path.relative(process.cwd(), file)}${unbudgeted.length ? `, adding ${unbudgeted.map(r => r.route).join(', ')}` : ''}`);
  }
  const rows = Object.entries(committed.pages).map(([page, bytes]) => ({ page, bytes: initialJs(h.out, page), budget: bytes, limit: bytes + TOLERANCE }));
  h.check('every budgeted page is in the build, under a route of its own', rows.every(r => r.bytes !== null && routeOf(all, r.page)), rows.filter(r => r.bytes === null || !routeOf(all, r.page)).map(r => r.page));
  // A route without a figure of its own is measured on one of its pages against the largest figure in its section.
  const missing = all.filter(route => !Object.keys(committed.pages).some(page => routeOf(all, page) === route)).map(route => {
    const page = sample(h.out, all, route);
    const from = borrowed(committed.pages, route);
    return { route: route.route, page, bytes: page ? initialJs(h.out, page) : null, budget: from.bytes, limit: from.bytes + TOLERANCE, from: from.page };
  });
  h.check('every page type (app/**/page.tsx) has a page in the build to measure', missing.every(r => r.bytes !== null), missing.filter(r => r.bytes === null).map(r => `${r.route} (no exported page of this route)`));
  const measured = [...rows, ...missing.filter(r => r.bytes !== null)];
  const over = measured.filter(r => r.bytes !== null && r.bytes > r.limit);
  h.check('I10 initial JavaScript within budget + 1.5 KB', !over.length, over.map(r => `${r.page}: ${r.bytes} B, limit ${r.limit} B${r.from ? ` (no figure of its own: the largest in its section, ${r.from})` : ''}`));
  if (missing.length) h.note(`no figure of its own yet, held to the largest figure in its section + 1.5 KB (the owner measures it with --write-budget): ${missing.map(r => `${r.route} ${r.page ? `${r.page} ${r.bytes}` : 'not built'} (${r.from} ${r.budget})`).join(', ')}`);
  h.note('initial JS gzip, bytes (budget): ' + rows.map(r => `${r.page} ${r.bytes} (${r.budget})`).join(', '));
}

// A story and an analysis joined at the redesign foundation (the story's header hides behind its reading bar).
const LAB_PAGES = ['/', '/tools/plan', '/courses/boston', '/stories/round-numbers', '/analyses/pacing-pattern'];
const CLS_LIMIT = 0.1;
// In every document before the page's own scripts: CLS as the largest session window of layout shifts not caused by
// input (gaps under 1 s, windows under 5 s), and the latest largest-contentful-paint time.
const OBSERVE = () => {
  const lab = window.__e2eLab = { cls: 0, lcp: null, shifts: [] };
  let session = 0, first = 0, last = 0;
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        if (session && entry.startTime - last < 1000 && entry.startTime - first < 5000) { session += entry.value; last = entry.startTime; }
        else { session = entry.value; first = last = entry.startTime; }
        lab.cls = Math.max(lab.cls, session);
        if (lab.shifts.length < 6) lab.shifts.push({ at: Math.round(entry.startTime), value: +entry.value.toFixed(4), nodes: (entry.sources || []).map(s => s.node && s.node.nodeType === 1 ? String(s.node.className || s.node.tagName).slice(0, 40) : '#text').slice(0, 3) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) lab.lcp = Math.round(entry.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* not Chromium: nothing to measure */ }
};

async function labShift(h) {
  const { SITE } = require('../browser.cjs');
  const rows = [];
  for (const pathname of LAB_PAGES) {
    const run = await h.run(`lab ${pathname}`, { viewport: { width: 390, height: 844 }, mobile: true, initScript: OBSERVE });
    const page = await run.newPage();
    await run.throttle(page, 4);
    await page.goto(SITE + pathname, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(3000);
    const lcp = await page.evaluate(() => window.__e2eLab.lcp);
    for (let i = 0; i < 60 && await page.evaluate(() => scrollY + innerHeight < document.documentElement.scrollHeight - 2); i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
    await page.waitForTimeout(1500);
    const { cls, shifts } = await page.evaluate(() => window.__e2eLab);
    await run.close();
    rows.push({ pathname, cls: +cls.toFixed(4), lcp, shifts });
  }
  h.check(`lab CLS at most ${CLS_LIMIT} on a 390 px phone with the CPU slowed 4x`, rows.every(r => r.cls <= CLS_LIMIT), rows.filter(r => r.cls > CLS_LIMIT));
  h.note('lab, 390 px, CPU 4x, no network delay: ' + rows.map(r => `${r.pathname} CLS ${r.cls}, LCP ${r.lcp} ms`).join('; '));
}

/** The rules above against a stand-in app/ folder, build and budget in a temporary folder. */
function selfTest() {
  const os = require('node:os');
  const crypto = require('node:crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-budget-'));
  const failures = [];
  let cases = 0;
  try {
    const app = path.join(dir, 'app');
    const out = path.join(dir, 'out');
    const file = path.join(dir, 'budget.json');
    const write = (at, text) => { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.writeFileSync(at, text); };
    // Random text barely compresses, so a script of n random hex characters is about n / 2 gzipped bytes.
    const script = (name, chars) => { write(path.join(out, '_next', name), crypto.randomBytes(Math.ceil(chars / 2)).toString('hex').slice(0, chars)); return `/_next/${name}`; };
    const shared = script('framework.js', 40000);
    const page = (route, extra = 0) => {
      write(path.join(app, ...route.split('/').filter(Boolean), 'page.tsx'), 'export default function Page() { return null; }\n');
      const scripts = [shared, ...(extra ? [script(`${route.replace(/\W/g, '_') || 'home'}.js`, extra)] : [])];
      write(path.join(out, route === '/' ? 'index.html' : `${route.slice(1)}.html`), `<html><head>${scripts.map(src => `<script src="${src}"></script>`).join('')}</head></html>`);
    };
    for (const [route, extra] of [['/', 8000], ['/tools', 2000], ['/tools/heavy', 20000], ['/about', 0]]) page(route, extra);
    write(path.join(out, 'sitemap.xml'), '<urlset></urlset>');
    const figures = Object.fromEntries(['/', '/tools', '/tools/heavy', '/about'].map(p => [p, initialJs(out, p)]));
    const run = (label, setup, want) => {
      cases += 1;
      fs.rmSync(path.join(app, 'guides'), { recursive: true, force: true }); fs.rmSync(path.join(app, 'tools', 'new'), { recursive: true, force: true }); fs.rmSync(path.join(app, 'stories'), { recursive: true, force: true });
      write(file, JSON.stringify({ pages: figures }));
      setup();
      const checks = [];
      const notes = [];
      try { budget({ out, check: (name, ok, detail) => checks.push({ name, ok: !!ok, detail }), note: text => notes.push(text) }, false, { app, file }); }
      catch (error) { failures.push(`${label}: threw ${error.message}`); return; }
      const failed = checks.filter(c => !c.ok).map(c => `${c.name}: ${JSON.stringify(c.detail)}`);
      if (want.pass !== !failed.length) failures.push(`${label}: expected ${want.pass ? 'a pass' : 'a failure'}, got ${failed.length ? failed.join(' | ') : 'a pass'}`);
      for (const text of want.failed || []) if (!failed.some(f => f.includes(text))) failures.push(`${label}: no failed check mentions "${text}"`);
      for (const text of want.noted || []) if (!notes.some(n => n.includes(text))) failures.push(`${label}: no note mentions "${text}"`);
    };
    run('the committed pages within their figures pass', () => {}, { pass: true });
    run('a budgeted page over its figure + 1.5 KB fails', () => write(file, JSON.stringify({ pages: { ...figures, '/about': figures['/about'] - TOLERANCE - 1 } })), { pass: false, failed: ['/about:'] });
    run('a new page in a new section passes under the largest figure of all', () => page('/guides', 4000), { pass: true, noted: ['/guides /guides', '(/tools/heavy '] });
    run('a new page in a new section over the largest figure of all + 1.5 KB fails', () => page('/guides', 20000 + 2 * TOLERANCE + 2000), { pass: false, failed: ['/guides: ', 'no figure of its own: the largest in its section, /tools/heavy'] });
    run('a new page in a section passes under the largest figure there', () => page('/tools/new', 12000), { pass: true, noted: ['/tools/new /tools/new', '(/tools/heavy '] });
    run('a new page in a section over the largest figure there + 1.5 KB fails', () => { write(file, JSON.stringify({ pages: { '/': figures['/'], '/tools': figures['/tools'], '/about': figures['/about'], '/tools/heavy': figures['/tools'] } })); page('/tools/new', 9000); }, { pass: false, failed: ['/tools/new: ', 'the largest in its section, /tools'] });
    run('a new route with no page in the build fails', () => write(path.join(app, 'stories', '[slug]', 'page.tsx'), 'export default function Page() { return null; }\n'), { pass: false, failed: ['/stories/[slug] (no exported page of this route)'] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error(`s8-budget self-test: ${failures.length} of ${cases} cases failed`);
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(`s8-budget self-test: ${cases} cases passed`);
  return 0;
}

module.exports = {
  id: 'S8',
  title: 'Initial JavaScript budget; lab layout shift',
  jobs: ({ args }) => [
    { name: 'initial JavaScript', weight: 1, run: async h => budget(h, args.includes('--write-budget')) },
    { name: 'lab layout shift and LCP', weight: 30, run: labShift },
  ],
};

if (require.main === module && process.argv.includes('--self-test')) process.exitCode = selfTest();
