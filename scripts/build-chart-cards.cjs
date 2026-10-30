#!/usr/bin/env node
// The Instagram cards of the Top 100 charts: one 1080 × 1350 PNG per chart in public/charts/cards/<number>.png, drawn
// from the same ChartCard the page renders (components/charts), at 400 × 500 CSS px and a device scale of 2.7. The plot
// takes the height the card leaves it (measured in the browser, then the chart is laid out to fill it), so the image and
// the page share one drawing. Each PNG carries a stamp: the hash of everything it was drawn from (the chart's data file,
// its words, the chart code and styles, the fonts). `--check` needs no browser: it recomputes the stamps and fails on a
// missing, changed, oversized or orphaned card, so a served image never shows numbers the adopted release does not.
// `--captions` writes docs/CHARTS_INSTAGRAM.md, a caption per chart for the series.
//
// `--set half` works on the four unnumbered "From the half" cards instead (scripts/half/card-images.cjs): the same
// card, size and stamp scheme, in public/charts/cards/half-<…>.png. Each set checks only its own files; a file neither
// set owns is an orphan of the default set. `--captions` appends the half cards' captions under their own heading.
//
//   node scripts/build-chart-cards.cjs [--set half] [--check] [--force] [--only 12|slug] [--captions]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), Module = require('node:module');
const { createHash } = require('node:crypto');
const { stampPng, readPng } = require('./lib/png-stamp.cjs');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT); // lib/charts-server.ts reads public/data from the working directory.
const OUT = path.join(ROOT, 'public/charts/cards');
const KEY = 'pace-notes-chart';
const CSS_W = 400, CSS_H = 500, SCALE = 2.7, WIDTH = 1080, HEIGHT = 1350, MAX_BYTES = 260 * 1024;
const sha = (text) => createHash('sha256').update(text).digest('hex');

const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true },
}).outputText, f);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest); };

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ChartCard = require('../components/charts/ChartCard.tsx').default;
const { chartWords } = require('../lib/charts/registry.ts');
const { THEME_NAMES } = require('../lib/charts/types.ts');
const { CATALOG, readChart, getChartsManifest } = require('../lib/charts-server.ts');

/** The files a card's drawing depends on besides its own data: the chart code, the styles, the words and the fonts. */
const CODE = ['components/charts/ChartCard.tsx', 'components/charts/ChartSvg.tsx', 'components/charts/kit.tsx', 'components/charts/rows.tsx', 'components/charts/xy.tsx',
  'components/charts/grid.tsx', 'lib/charts/fmt.ts', 'lib/charts/measure.ts', 'lib/charts/spec.ts', 'lib/charts/typo.ts', 'lib/nuggets/format.ts', 'lib/units.ts',
  'app/styles/tokens.css', 'app/styles/fonts.css', 'app/styles/pages/charts.css', 'scripts/build-chart-cards.cjs'];
const FONTS = ['inter-latin-wght-normal.woff2', 'fraunces-latin-opsz-normal.woff2', 'bricolage-grotesque-latin-wght-normal.woff2'];
const codeHash = () => sha(CODE.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + FONTS.map((f) => sha(fs.readFileSync(path.join(ROOT, 'public/fonts', f)))).join(''));

const css = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const STYLE = [
  css('app/styles/fonts.css').replace(/url\(\/fonts\//g, `url(file://${ROOT}/public/fonts/`),
  css('app/styles/tokens.css'),
  css('app/styles/pages/charts.css'),
  // The image frame: the card fills the 400 × 500 viewport, padded as on a tablet, with the plot taking what is left.
  `*{box-sizing:border-box} html,body{margin:0;width:${CSS_W}px;height:${CSS_H}px;background:var(--night)}
   body{font-family:var(--sans);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
   .chart-image .chart-card{width:${CSS_W}px;height:${CSS_H}px;max-width:none;margin:0;border-radius:0;--card-pad:22px;gap:8px}
   .chart-image .chart-card-plot{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;overflow:visible}`,
].join('\n');

/** A takeaway's one *…* accent as <em>, the way the page renders it (without the page's term link). */
function accent(text) {
  return text.split(/(\*[^*]+\*)/).filter(Boolean).map((part, i) => (part.startsWith('*') && part.endsWith('*')
    ? React.createElement('em', { key: i }, part.slice(1, -1)) : React.createElement('span', { key: i }, part)));
}

/** Development previews (--preview) read chart files from a folder of their own, without the manifest check. */
let previewDir = null;
function cardInputs(item) {
  const file = previewDir ? JSON.parse(fs.readFileSync(path.join(previewDir, `${item.slug}.json`), 'utf8')) : readChart(item.slug);
  const words = chartWords(item, file);
  return { item, file, words };
}

function cardHtml({ item, file, words }, fit) {
  const mark = React.createElement('span', { className: 'chart-mark', 'aria-hidden': 'true' }, React.createElement('i'), React.createElement('i'), React.createElement('i'));
  const foot = React.createElement(React.Fragment, null, React.createElement('b', null, mark, 'Pace Notes'), React.createElement('span', null, `splithappens.run/charts/${item.number}`));
  const card = React.createElement(ChartCard, {
    number: item.number, theme: THEME_NAMES[item.theme], title: words.title, takeaway: accent(words.headline), label: words.plain,
    spec: file.plot, units: 'mi', heading: 'h2', foot, fit,
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${STYLE}</style></head><body><div class="chart-image">${renderToStaticMarkup(card)}</div></body></html>`;
}

function stampOf({ item, file, words }, code) {
  const data = previewDir ? sha(JSON.stringify(file)) : getChartsManifest().files[`${item.slug}.json`].sha256;
  return { chart: item.number, slug: item.slug, title: words.title, hash: sha([code, data, words.title, words.headline].join('\n')).slice(0, 20) };
}

/** The half cards' files (scripts/half/card-images.cjs); every other file in the folder belongs to the Top 100. */
const isHalfCard = (f) => f.startsWith('half-');

/** The Top 100 as a card set: one card per catalog row, `<number>.png`. */
function topSet() {
  return {
    name: 'top100', label: 'chart cards', owns: (f) => !isHalfCard(f), orphan: 'no chart has this number', code: codeHash,
    items: () => CATALOG.filter((item) => !previewDir || fs.existsSync(path.join(previewDir, `${item.slug}.json`)))
      .map((item) => ({ id: item.number, slug: item.slug, file: previewDir ? `${item.number}-${item.slug}.png` : `${item.number}.png`, inputs: cardInputs(item) })),
    html: cardHtml, stamp: stampOf, title: (inputs) => inputs.words.title,
  };
}

/** The four unnumbered half cards as a card set (loaded only with --set half, so the Top 100 never reads half data). */
function halfSet() {
  const set = require('./half/card-images.cjs')({ React, renderToStaticMarkup, ChartCard, accent, frame: STYLE, root: ROOT, sha, topCode: codeHash });
  return { ...set, label: 'half cards', owns: isHalfCard, orphan: 'no half card has this name', title: (inputs) => inputs.words.title,
    items: () => set.items().map((it) => ({ ...it, slug: it.id })) };
}

function check(set) {
  const code = set.code();
  const problems = [];
  const items = set.items();
  const wanted = new Set(items.map((it) => it.file));
  for (const it of items) {
    const target = path.join(OUT, it.file);
    if (!fs.existsSync(target)) { problems.push(`missing  ${it.file} (${it.slug})`); continue; }
    const bytes = fs.readFileSync(target);
    let info;
    try { info = readPng(bytes, KEY); } catch (error) { problems.push(`invalid  ${it.file}: ${error.message}`); continue; }
    if (info.width !== WIDTH || info.height !== HEIGHT) problems.push(`size     ${it.file} is ${info.width}x${info.height}`);
    if (bytes.length > MAX_BYTES) problems.push(`too big  ${it.file} is ${(bytes.length / 1024).toFixed(1)} KB`);
    const expected = set.stamp(it.inputs, code);
    if (!info.stamp || info.stamp.hash !== expected.hash) problems.push(`changed  ${it.file}: ${info.stamp ? `was "${info.stamp.title}"` : 'no stamp'}, now "${expected.title}"`);
  }
  const orphans = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => set.owns(f) && !wanted.has(f)) : [];
  for (const f of orphans) problems.push(`orphan   ${f} (${set.orphan}; delete it)`);
  return { problems, count: items.length };
}

function loadPlaywright() {
  for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(id); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('Playwright is not installed. Install it outside the project (npm i -g playwright && npx playwright install chromium) or set NODE_PATH, then re-run.');
}

async function render(set, { force, only, out = OUT }) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: CSS_W, height: CSS_H }, deviceScaleFactor: SCALE });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pace-notes-chart-card-'));
  const code = set.code();
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  try {
    for (const it of set.items()) {
      if (only && !only.split(',').some((o) => o === String(it.id) || o === it.slug)) continue;
      const { inputs } = it;
      const target = path.join(out, it.file);
      const expected = set.stamp(inputs, code);
      if (!force && fs.existsSync(target)) {
        try { if (readPng(fs.readFileSync(target), KEY).stamp?.hash === expected.hash) { results.push({ chart: it.id, skipped: true }); continue; } } catch { /* re-render */ }
      }
      const htmlFile = path.join(temp, 'card.html');
      // Pass 1: the card without its plot, to measure the height the plot may take.
      fs.writeFileSync(htmlFile, set.html(inputs, undefined).replace(/<svg class="cx"[\s\S]*<\/svg>/, ''));
      await page.goto('file://' + htmlFile, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const box = await page.evaluate(() => { const r = document.querySelector('.chart-card-plot').getBoundingClientRect(); return { w: r.width, h: r.height }; });
      const fit = Math.floor(((box.h - 2) * 340) / box.w);
      // Pass 2: the chart laid out to fill it.
      fs.writeFileSync(htmlFile, set.html(inputs, fit));
      await page.goto('file://' + htmlFile, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        const card = document.querySelector('.chart-card'), plot = document.querySelector('.chart-card-plot'), svg = plot.querySelector('svg');
        const faces = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))];
        return { title: lines(document.querySelector('.chart-card-title')), take: lines(document.querySelector('.chart-card-take')), over: card.scrollHeight - card.clientHeight,
          svg: svg.getBoundingClientRect().height, plot: plot.getBoundingClientRect().height, faces };
      });
      for (const face of ['Inter Variable', 'Fraunces Variable']) if (!m.faces.includes(face)) throw new Error(`${it.id}: the ${face} font did not load`);
      if (m.title > 2) throw new Error(`${it.id}: the title "${set.title(inputs)}" takes ${m.title} lines on the card (at most 2); shorten it.`);
      if (m.take > 3) throw new Error(`${it.id}: the takeaway takes ${m.take} lines on the card (at most 3); shorten it.`);
      if (m.over > 0 || m.svg > m.plot + 1) throw new Error(`${it.id}: the chart is ${Math.round(m.svg)} px tall in a ${Math.round(m.plot)} px plot; it needs fewer rows or a shorter spec.`);
      const png = stampPng(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: CSS_W, height: CSS_H } }), KEY, expected);
      if (png.length > MAX_BYTES) throw new Error(`${it.id}: ${(png.length / 1024).toFixed(1)} KB is over the ${MAX_BYTES / 1024} KB limit.`);
      fs.writeFileSync(target, png);
      results.push({ chart: it.id, bytes: png.length, fit });
    }
  } finally {
    await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return results;
}

function captions() {
  const lines = ['# Top 100 charts: Instagram captions', '', 'Generated by `node scripts/build-chart-cards.cjs --captions` from the published chart data and words. Each card is `public/charts/cards/<number>.png` (1080 × 1350). Regenerate after a data release.', ''];
  for (const item of CATALOG) {
    const { words } = cardInputs(item);
    lines.push(`## ${item.number}. ${words.title}`, '', `${words.plain}`, '', `Chart ${item.number} of ${CATALOG.length} from Pace Notes. Every chart, its numbers and how it was made: splithappens.run/charts/${item.number}`, '');
  }
  const half = halfSet().captions();
  fs.writeFileSync(path.join(ROOT, 'docs/CHARTS_INSTAGRAM.md'), lines.concat(half).join('\n'));
  console.log(`docs/CHARTS_INSTAGRAM.md: ${CATALOG.length} captions${half.length ? ' and the half cards' : ''}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--captions')) return captions();
  const si = args.indexOf('--set');
  const setName = si >= 0 ? args[si + 1] : 'top100';
  if (!['top100', 'half'].includes(setName)) throw new Error(`Unknown card set "${setName}" (top100 or half).`);
  const pv = args.indexOf('--preview');
  if (pv >= 0) {
    // node scripts/build-chart-cards.cjs --preview <charts folder> <out folder> [--only slug,slug] (the Top 100 only)
    if (setName !== 'top100') throw new Error('--preview draws Top 100 charts from a folder; the half cards render from public/data/half.');
    previewDir = path.resolve(args[pv + 1]);
    const at = args.indexOf('--only');
    const results = await render(topSet(), { force: true, only: at >= 0 ? args[at + 1] : null, out: path.resolve(args[pv + 2]) });
    for (const r of results) console.log(JSON.stringify(r));
    return;
  }
  const set = setName === 'half' ? halfSet() : topSet();
  const run = set.name === 'half' ? 'node scripts/build-chart-cards.cjs --set half' : 'node scripts/build-chart-cards.cjs';
  if (args.includes('--check')) {
    const { problems, count } = check(set);
    if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} card problem(s). Run: ${run}`); process.exit(1); }
    console.log(`${set.label}: ${count} current`);
    return;
  }
  const at = args.indexOf('--only');
  const results = await render(set, { force: args.includes('--force'), only: at >= 0 ? args[at + 1] : null });
  for (const r of results) console.log(JSON.stringify(r));
  const { problems } = check(set);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });
