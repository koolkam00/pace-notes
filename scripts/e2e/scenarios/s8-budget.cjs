'use strict';
// S8 (I10): the JavaScript a page loads before anything else, gzipped: every script its exported HTML names. Every page
// type (each app/**/page.tsx route, a new one included) has a figure in scripts/e2e/budget.json, measured on one of its
// pages, and may grow by at most 1.5 KB over it; a larger change needs a new budget, measured with
// `--only=S8 --write-budget` (which also adds a page for any route without one) and committed with the reason. The
// lazily loaded analytics chunks (the SDK, the recorder, Web Vitals, the replay policy) are not initial JavaScript and
// are not counted.
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
function routes() {
  const found = [];
  const walk = (dir, segments) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), /^\(.*\)$/.test(entry.name) ? segments : [...segments, entry.name]);
      else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) found.push(segments);
    }
  };
  walk(APP, []);
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

function budget(h, write) {
  let committed = JSON.parse(fs.readFileSync(BUDGET, 'utf8'));
  const all = routes();
  const unbudgeted = all.filter(route => !Object.keys(committed.pages).some(page => routeOf(all, page) === route));
  if (write) {
    const pages = [...Object.keys(committed.pages), ...unbudgeted.map(route => sample(h.out, all, route)).filter(Boolean)];
    committed = { ...committed, pages: Object.fromEntries(pages.map(page => [page, initialJs(h.out, page)])) };
    fs.writeFileSync(BUDGET, JSON.stringify(committed, null, 2) + '\n');
    h.note(`wrote ${path.relative(process.cwd(), BUDGET)}${unbudgeted.length ? `, adding ${unbudgeted.map(r => r.route).join(', ')}` : ''}`);
  }
  const missing = all.filter(route => !Object.keys(committed.pages).some(page => routeOf(all, page) === route));
  h.check('every page type (app/**/page.tsx) has a budget', !missing.length, missing.map(route => `${route.route} (measure ${sample(h.out, all, route) || 'one of its pages'} with --write-budget)`));
  const rows = Object.entries(committed.pages).map(([page, bytes]) => ({ page, bytes: initialJs(h.out, page), budget: bytes, limit: bytes + TOLERANCE }));
  h.check('every budgeted page is in the build, under a route of its own', rows.every(r => r.bytes !== null && routeOf(all, r.page)), rows.filter(r => r.bytes === null || !routeOf(all, r.page)).map(r => r.page));
  const over = rows.filter(r => r.bytes !== null && r.bytes > r.limit);
  h.check('I10 initial JavaScript within budget + 1.5 KB', !over.length, over.map(r => `${r.page}: ${r.bytes} B, limit ${r.limit} B`));
  h.note('initial JS gzip, bytes (budget): ' + rows.map(r => `${r.page} ${r.bytes} (${r.budget})`).join(', '));
}

module.exports = {
  id: 'S8',
  title: 'Initial JavaScript budget',
  jobs: ({ args }) => [{ name: 'initial JavaScript', weight: 1, run: async h => budget(h, args.includes('--write-budget')) }],
};
