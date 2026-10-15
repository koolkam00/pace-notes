'use strict';
// S8 (I10): the JavaScript a page loads before anything else, gzipped: every script its exported HTML names. Each
// page type in scripts/e2e/budget.json may grow by at most 1.5 KB over its committed figure; a larger change needs a
// new budget, measured with `--only=S8 --write-budget` and committed with the reason. The lazily loaded analytics
// chunks (the SDK, the recorder, Web Vitals, the replay policy) are not initial JavaScript and are not counted.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BUDGET = path.join(__dirname, '..', 'budget.json');
const TOLERANCE = 1536;

/** Gzipped bytes (level 9) of every script the page's HTML names. */
function initialJs(out, pathname) {
  const file = [pathname === '/' ? 'index.html' : pathname.slice(1) + '.html', pathname.slice(1) + '/index.html'].map(f => path.join(out, f)).find(f => fs.existsSync(f));
  if (!file) return null;
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]))];
  return scripts.reduce((sum, src) => sum + zlib.gzipSync(fs.readFileSync(path.join(out, decodeURIComponent(src.replace(/^\//, '')))), { level: 9 }).length, 0);
}

function budget(h, write) {
  let committed = JSON.parse(fs.readFileSync(BUDGET, 'utf8'));
  const measured = Object.fromEntries(Object.keys(committed.pages).map(page => [page, initialJs(h.out, page)]));
  if (write) {
    committed = { ...committed, pages: measured };
    fs.writeFileSync(BUDGET, JSON.stringify(committed, null, 2) + '\n');
    h.note(`wrote ${path.relative(process.cwd(), BUDGET)}`);
  }
  const rows = Object.entries(measured).map(([page, bytes]) => ({ page, bytes, limit: committed.pages[page] + TOLERANCE }));
  h.check('every budgeted page is in the build', rows.every(r => r.bytes !== null), rows.filter(r => r.bytes === null).map(r => r.page));
  const over = rows.filter(r => r.bytes !== null && r.bytes > r.limit);
  h.check('I10 initial JavaScript within budget + 1.5 KB', !over.length, over.map(r => `${r.page}: ${r.bytes} B, limit ${r.limit} B`));
  h.note('initial JS gzip, bytes (budget): ' + rows.map(r => `${r.page} ${r.bytes} (${committed.pages[r.page]})`).join(', '));
}

module.exports = {
  id: 'S8',
  title: 'Initial JavaScript budget',
  jobs: ({ args }) => [{ name: 'initial JavaScript', weight: 1, run: async h => budget(h, args.includes('--write-budget')) }],
};
