#!/usr/bin/env node
/**
 * Renders the 1200x630 social share cards (Open Graph and X) into public/og/:
 *   public/og/stories/<slug>.png   one per story in lib/stories.ts (kicker and title)
 *   public/og/tools/<slug>.png     one per tool in lib/tools/registry.ts (group and heading)
 *   public/og/courses/<slug>.png   one per course page (the race name, and the supplied route outline when there is one)
 *   public/og/sections/<name>.png  stories, tools, courses, analyses and packs (the research archive)
 * public/og/default.png is kept as it is. lib/og-paths.ts picks the image for each page.
 *
 * Cards carry words only: the brand, a section label, the title or race name and the credit. No data numbers
 * (they would go stale) and no runner names. The design is the default card's: the site's fonts from
 * node_modules/@fontsource-variable and the colour tokens from app/globals.css.
 *
 * Usage:
 *   npm run og:images                         render missing or changed cards (unchanged cards are skipped)
 *   node scripts/build-og-images.cjs --force  render every card again
 *   node scripts/build-og-images.cjs --only courses/berlin   render the cards whose file name contains the text
 *   npm run og:check                          no browser: report missing, changed, oversized or orphaned cards
 *
 * Deterministic: the card list comes from the registries in a fixed order, and each PNG stores a tEXt chunk
 * with a hash of its HTML (text, layout, colours and font package versions). The PNG pixels are deterministic
 * for a given Chromium and font build; another machine may anti-alias slightly differently.
 * Needs Playwright with Chromium: `playwright` from node_modules, else /opt/node-tools/node_modules/playwright.
 * It is not a project dependency; the generated PNGs are committed. See docs/SEO.md.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const OG_DIR = path.join(ROOT, 'public', 'og');
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 120 * 1024;
const CHUNK_KEY = 'pace-notes-og';
const GROUPS = ['stories', 'tools', 'courses', 'sections'];

// ---------- TypeScript registries (the same require hook as scripts/verify-units.cjs) ----------

function loadTypeScript() {
  const ts = require('typescript');
  for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...args);
  };
  // lib/insights-server.ts reads public/data relative to the working directory, as next build does.
  process.chdir(ROOT);
}

// ---------- Design tokens (app/globals.css) ----------

const TOKENS = {
  night: '#0E1116', night3: '#252B36', nightInk: '#F5F0E6', nightInk2: '#B9B3A6', ink: '#15171C', card: '#FFFDF8',
  orange: '#FF5B2E', gold: '#F4B23E', blue: '#2F5BFF', green: '#17A673', rose: '#E2416B', violet: '#7A4DFF', teal: '#0FA3A3',
};

/** The tokens app/globals.css must still define with these values; the script stops if the site's palette moved. */
function checkTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  const expected = { '--night': TOKENS.night, '--night-3': TOKENS.night3, '--night-ink': TOKENS.nightInk, '--night-ink-2': TOKENS.nightInk2, '--ink': TOKENS.ink, '--card': TOKENS.card,
    '--orange': TOKENS.orange, '--gold': TOKENS.gold, '--blue': TOKENS.blue, '--green': TOKENS.green, '--rose': TOKENS.rose, '--violet': TOKENS.violet, '--teal': TOKENS.teal };
  const moved = Object.entries(expected).filter(([name, value]) => !new RegExp(`${name}:\\s*${value};`, 'i').test(css));
  if (moved.length) throw new Error(`app/globals.css colour tokens changed (${moved.map(([n]) => n).join(', ')}); update TOKENS in scripts/build-og-images.cjs.`);
}

// ---------- Card list ----------

const SECTION_CARDS = [
  { name: 'stories', eyebrow: 'Stories from the data', title: 'What recorded marathon finishes *show.*', accent: TOKENS.orange },
  { name: 'tools', eyebrow: 'Runner tools', title: 'Tools that know how marathons *really* go.', accent: TOKENS.blue },
  { name: 'courses', eyebrow: 'Courses', title: 'Marathon courses: *elevation and pacing.*', accent: TOKENS.teal },
  { name: 'analyses', eyebrow: 'Analyses · Plan your race', title: 'Marathon pacing questions, *answered with recorded splits.*', accent: TOKENS.green },
  { name: 'packs', eyebrow: 'Research archive', title: 'The marathon pacing *research archive.*', accent: TOKENS.violet },
];

/** Same rule as raceName() in app/courses/[city]/page.tsx: the supplied route's race, else the course summary's, else the city plus " Marathon". */
function raceName(city, geometry, summary) {
  return (geometry && geometry.race) || (summary && summary.race) || `${city} Marathon`;
}

function cardSpecs() {
  loadTypeScript();
  const { STORIES } = require(path.join(ROOT, 'lib/stories.ts'));
  const { TOOLS } = require(path.join(ROOT, 'lib/tools/registry.ts'));
  const { getCourseNames, slugifyCity } = require(path.join(ROOT, 'lib/course-data.ts'));
  const { getInsightsManifest, readInsight } = require(path.join(ROOT, 'lib/insights-server.ts'));
  const manifest = getInsightsManifest();
  const geometry = readInsight('course-geometry.json').courses;
  const summaries = manifest.files['courses.json'] ? readInsight('courses.json').courses : [];
  const slug = (value) => { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`Unsafe card slug: ${value}`); return value; };
  const cards = [];
  for (const story of STORIES) {
    cards.push({ file: `stories/${slug(story.slug)}.png`, eyebrow: `Data story · ${story.kicker}`, title: story.title, accent: story.accent });
  }
  for (const tool of TOOLS) {
    cards.push({ file: `tools/${slug(tool.slug)}.png`, eyebrow: `Runner tools · ${tool.group}`, title: tool.heading || tool.title, accent: tool.accent });
  }
  for (const city of getCourseNames()) {
    const route = geometry.find((c) => c.city === city);
    const summary = summaries.find((c) => c.city === city);
    cards.push({ file: `courses/${slug(slugifyCity(city))}.png`, eyebrow: 'Courses · Course profile', title: raceName(city, route, summary), accent: TOKENS.teal,
      route: route ? route.route.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]) : null });
  }
  for (const section of SECTION_CARDS) cards.push({ file: `sections/${section.name}.png`, eyebrow: section.eyebrow, title: section.title, accent: section.accent, markup: true });
  const files = cards.map((c) => c.file);
  if (new Set(files).size !== files.length) throw new Error('Two cards would share one file name.');
  return cards;
}

// ---------- HTML template ----------

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Hand-written section titles mark italics with *…*; registry titles are always plain text. */
/** Hyphenated words ("finish-time", "race-day") never break at the hyphen. */
const keepHyphens = (html) => html.replace(/[^\s*]*[^\s*-]-[^\s*-][^\s*]*/g, (word) => `<span class="nb">${word}</span>`);
const titleHtml = (card) => card.markup ? keepHyphens(esc(card.title)).replace(/\*([^*]+)\*/g, '<em>$1</em>') : keepHyphens(esc(card.title));
const plainTitle = (card) => card.markup ? card.title.replace(/\*/g, '') : card.title;

/** A dark accent (the qualifying tool's ink) would vanish on the night background; use the night ink instead. */
function visibleAccent(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25 ? TOKENS.nightInk : hex;
}

/** Small deterministic hash of the card name, used to stagger the runner dots so cards differ a little. */
function seed(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9E3779B9) >>> 0; return h / 4294967296; };
}

function lanes(card, accent) {
  const random = seed(card.file);
  const colours = [TOKENS.gold, TOKENS.blue, TOKENS.orange, TOKENS.green, TOKENS.violet, TOKENS.rose].filter((c) => c.toLowerCase() !== accent.toLowerCase());
  // Two runners per lane, at least 70px apart; the runner furthest ahead wears the card's accent.
  const dots = [];
  for (const y of [28, 62, 96]) {
    const first = 560 + Math.round(random() * 520);
    let second = 560 + Math.round(random() * 520);
    for (let tries = 0; Math.abs(second - first) < 70 && tries < 20; tries += 1) second = 560 + Math.round(random() * 520);
    if (Math.abs(second - first) < 70) second = first > 820 ? first - 140 : first + 140;
    dots.push({ x: first, y }, { x: second, y });
  }
  const leader = dots.reduce((best, d) => (d.x > best.x ? d : best));
  let next = 0;
  for (const d of dots) d.fill = d === leader ? accent : colours[next++ % colours.length];
  return `<svg class="lanes" viewBox="0 0 1200 122" aria-hidden="true">
  <g stroke="${TOKENS.night3}" stroke-width="2" stroke-dasharray="10 12"><line x1="0" y1="28" x2="1200" y2="28"/><line x1="0" y1="62" x2="1200" y2="62"/><line x1="0" y1="96" x2="1200" y2="96"/></g>
  <g stroke="${TOKENS.night}" stroke-width="4">${dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="10" fill="${d.fill}"/>`).join('')}</g>
</svg>`;
}

/** The supplied route (points normalised to 0–1, as components/story/CourseArt.tsx draws it) in a square at the right. */
function routeSvg(points) {
  const size = 380;
  const pad = size * 0.08;
  const s = size - pad * 2;
  const xy = ([x, y]) => [(pad + x * s).toFixed(1), (pad + y * s).toFixed(1)];
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xy(p).join(' ')}`).join(' ');
  const [sx, sy] = xy(points[0]);
  const [fx, fy] = xy(points[points.length - 1]).map(Number);
  const f = size / 20;
  return `<svg class="route" viewBox="0 0 ${size} ${size}" aria-hidden="true">
  <path d="${d}" fill="none" stroke="${TOKENS.nightInk}" stroke-opacity="0.16" stroke-width="${(size / 22).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${TOKENS.nightInk}" stroke-width="${(size / 90).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${sx}" cy="${sy}" r="${(size / 45).toFixed(1)}" fill="${TOKENS.green}" stroke="${TOKENS.card}" stroke-width="${(size / 160).toFixed(2)}"/>
  <g transform="translate(${(fx - f / 2).toFixed(1)} ${(fy - f / 2).toFixed(1)})"><rect width="${f}" height="${f}" rx="${(size / 160).toFixed(2)}" fill="${TOKENS.card}" stroke="${TOKENS.ink}" stroke-width="${(size / 220).toFixed(2)}"/><rect width="${f / 2}" height="${f / 2}" fill="${TOKENS.ink}"/><rect x="${f / 2}" y="${f / 2}" width="${f / 2}" height="${f / 2}" fill="${TOKENS.ink}"/></g>
</svg>`;
}

/** The card's HTML with a {{FONTS}} placeholder, so the hash does not depend on where node_modules is. */
function cardHtml(card) {
  const accent = visibleAccent(card.accent);
  const withRoute = Array.isArray(card.route) && card.route.length > 1;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
{{FONTS}}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body { background: ${TOKENS.night}; color: ${TOKENS.nightInk}; font-family: 'Inter Variable', sans-serif; -webkit-font-smoothing: antialiased; position: relative; }
.brand { position: absolute; left: 84px; top: 72px; display: flex; align-items: center; gap: 22px; }
/* The words sit centred between the brand row (bottom 136px) and the runner lanes (top 508px). */
.body { position: absolute; left: 84px; top: 136px; width: ${withRoute ? 636 : 1032}px; height: 372px; display: flex; flex-direction: column; justify-content: center; }
.mark { position: relative; width: 64px; height: 64px; border-radius: 50%; background: ${TOKENS.orange}; overflow: hidden; flex: none; }
.mark i { position: absolute; display: block; background: ${TOKENS.ink}; border-radius: 4px; height: 6.4px; }
.mark i:nth-child(1) { left: 12.8px; right: 12.8px; top: 19.2px; }
.mark i:nth-child(2) { left: 19.2px; right: 12.8px; top: 30.9px; }
.mark i:nth-child(3) { left: 12.8px; right: 21.3px; top: 42.7px; }
.name { font-family: 'Fraunces Variable', serif; font-variation-settings: 'opsz' 48, 'SOFT' 60; font-weight: 700; font-size: 44px; letter-spacing: -.02em; line-height: 1; }
.eyebrow { font-size: 21px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: ${TOKENS.gold}; white-space: nowrap; overflow: hidden; text-overflow: clip; }
h1 { margin-top: 18px; font-family: 'Fraunces Variable', serif; font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 1; font-weight: 680; font-size: 84px; line-height: .98; letter-spacing: -.028em; max-width: ${withRoute ? 636 : 880}px; text-wrap: balance; }
h1 .nb { white-space: nowrap; }
h1 em { font-style: italic; font-weight: 600; color: ${TOKENS.orange}; }
.rule { width: 72px; height: 6px; margin-top: 22px; border-radius: 999px; background: ${accent}; }
.credit { margin-top: 20px; font-size: 24px; color: ${TOKENS.nightInk2}; }
svg.lanes { position: absolute; left: 0; right: 0; bottom: 0; width: ${WIDTH}px; height: 122px; }
svg.route { position: absolute; right: 64px; top: 64px; width: 380px; height: 380px; }
</style></head>
<body>
<div class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="name">Pace Notes</span></div>
<div class="body">
  <p class="eyebrow">${esc(card.eyebrow)}</p>
  <h1>${titleHtml(card)}</h1>
  <div class="rule" aria-hidden="true"></div>
  <p class="credit">by Andrew Kam</p>
</div>
${withRoute ? routeSvg(card.route) : ''}
${lanes(card, accent)}
</body></html>`;
}

const FONT_PACKAGES = ['fraunces', 'inter'];
function fontVersions() {
  return FONT_PACKAGES.map((name) => `${name}@${JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', name, 'package.json'), 'utf8')).version}`).join(',');
}
function fontLinks() {
  const href = (file) => `file://${path.join(ROOT, 'node_modules/@fontsource-variable', file)}`;
  // The same stylesheets app/layout.tsx imports (Fraunces with all axes, Inter by weight).
  return ['fraunces/full.css', 'fraunces/full-italic.css', 'inter/index.css'].map((file) => `<link rel="stylesheet" href="${href(file)}">`).join('\n');
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
function stamp(card, fonts) {
  return { card: card.file, hash: sha(cardHtml(card) + '\n' + fonts).slice(0, 16), eyebrow: card.eyebrow, title: plainTitle(card) };
}

// ---------- PNG helpers ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunks(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file');
  const chunks = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    chunks.push({ type, data: buffer.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
/** Keep only the image chunks, then add the card stamp as a tEXt chunk before IEND (no time or other varying chunks). */
function stampPng(buffer, stampValue) {
  const keep = pngChunks(buffer).filter((c) => ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(c.type));
  // tEXt is Latin-1: escape everything outside ASCII so titles with curly quotes or dashes survive.
  const json = JSON.stringify(stampValue).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const text = Buffer.concat([Buffer.from(CHUNK_KEY, 'latin1'), Buffer.from([0]), Buffer.from(json, 'latin1')]);
  return Buffer.concat([PNG_SIGNATURE, ...keep.filter((c) => c.type !== 'IEND').map((c) => chunk(c.type, c.data)), chunk('tEXt', text), chunk('IEND', Buffer.alloc(0))]);
}
function readPng(buffer) {
  const chunks = pngChunks(buffer);
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== 'IHDR') throw new Error('PNG without IHDR');
  const text = chunks.find((c) => c.type === 'tEXt' && c.data.toString('latin1').startsWith(CHUNK_KEY + '\0'));
  let stampValue = null;
  if (text) { try { stampValue = JSON.parse(text.data.toString('latin1').slice(CHUNK_KEY.length + 1)); } catch { stampValue = null; } }
  return { width: ihdr.data.readUInt32BE(0), height: ihdr.data.readUInt32BE(4), stamp: stampValue };
}

// ---------- Check (no browser) ----------

function existingCards() {
  return GROUPS.flatMap((group) => {
    const dir = path.join(OG_DIR, group);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => `${group}/${f}`) : [];
  });
}

/** Problems with the committed cards. Orphans are reported separately: a failure for --check, a reminder after rendering. */
function check(cards, fonts) {
  const problems = [];
  const wanted = new Set(cards.map((c) => c.file));
  for (const card of cards) {
    const file = path.join(OG_DIR, card.file);
    if (!fs.existsSync(file)) { problems.push(`missing  ${card.file}`); continue; }
    const bytes = fs.readFileSync(file);
    let info;
    try { info = readPng(bytes); } catch (error) { problems.push(`invalid  ${card.file}: ${error.message}`); continue; }
    if (info.width !== WIDTH || info.height !== HEIGHT) problems.push(`size     ${card.file} is ${info.width}x${info.height}, not ${WIDTH}x${HEIGHT}`);
    if (bytes.length > MAX_BYTES) problems.push(`too big  ${card.file} is ${(bytes.length / 1024).toFixed(1)} KB (limit ${MAX_BYTES / 1024} KB)`);
    const expected = stamp(card, fonts);
    if (!info.stamp || info.stamp.hash !== expected.hash) problems.push(`changed  ${card.file}: ${info.stamp ? `was "${info.stamp.title}"` : 'no stamp'}, now "${expected.title}"`);
  }
  if (!fs.existsSync(path.join(OG_DIR, 'default.png'))) problems.push('missing  default.png');
  const orphans = existingCards().filter((file) => !wanted.has(file)).map((file) => `orphan   ${file} (no story, tool, course or section uses it; delete it)`);
  return { problems, orphans };
}

// ---------- Render ----------

function loadPlaywright() {
  for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(id); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('Playwright is not installed. Install it outside the project (npm i -g playwright && npx playwright install chromium) or set NODE_PATH, then re-run.');
}

async function render(cards, fonts, { force, only }) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pace-notes-og-'));
  const links = fontLinks();
  const results = [];
  try {
    for (const card of cards) {
      if (only && !card.file.includes(only)) continue;
      const target = path.join(OG_DIR, card.file);
      const expected = stamp(card, fonts);
      if (!force && fs.existsSync(target)) {
        try {
          const existing = readPng(fs.readFileSync(target));
          if (existing.stamp && existing.stamp.hash === expected.hash) { results.push({ file: card.file, bytes: fs.statSync(target).size, skipped: true }); continue; }
        } catch { /* re-render */ }
      }
      const htmlFile = path.join(temp, 'card.html');
      fs.writeFileSync(htmlFile, cardHtml(card).replace('{{FONTS}}', links));
      await page.goto('file://' + htmlFile, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      // Fit the title: the largest size from 84px down that keeps it within three lines and leaves 40px clear
      // below the brand row and above the runner lanes.
      const fit = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const eyebrow = document.querySelector('.eyebrow');
        const credit = document.querySelector('.credit');
        const fits = (size) => Math.round(h1.getBoundingClientRect().height / (size * 0.98)) <= 3 && eyebrow.getBoundingClientRect().top >= 176 && credit.getBoundingClientRect().bottom <= 468;
        let size = 84;
        for (; size > 40; size -= 2) { h1.style.fontSize = `${size}px`; if (fits(size)) break; }
        const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}|${f.style}`);
        return { size, fits: fits(size), faces: [...new Set(faces)], eyebrowClipped: eyebrow.scrollWidth > eyebrow.clientWidth };
      });
      const needed = ['Fraunces Variable|normal', 'Inter Variable|normal', ...(card.markup && card.title.includes('*') ? ['Fraunces Variable|italic'] : [])];
      const missing = needed.filter((face) => !fit.faces.includes(face));
      if (missing.length) throw new Error(`${card.file}: fonts did not load (${missing.join(', ')})`);
      if (!fit.fits) throw new Error(`${card.file}: the title "${plainTitle(card)}" does not fit; shorten it.`);
      if (fit.eyebrowClipped) throw new Error(`${card.file}: the label "${card.eyebrow}" is too long for one line.`);
      const png = stampPng(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }), expected);
      if (png.length > MAX_BYTES) throw new Error(`${card.file}: ${(png.length / 1024).toFixed(1)} KB is over the ${MAX_BYTES / 1024} KB limit.`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, png);
      results.push({ file: card.file, bytes: png.length, size: fit.size });
    }
  } finally {
    await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? args[onlyAt + 1] : null;
  checkTokens();
  const cards = cardSpecs();
  const fonts = fontVersions();
  if (args.includes('--check')) {
    const { problems: found, orphans } = check(cards, fonts);
    const problems = [...found, ...orphans];
    if (problems.length) {
      console.error(`Share cards need attention (${problems.length}). Run: npm run og:images`);
      for (const line of problems) console.error('  ' + line);
      process.exit(1);
    }
    console.log(`Share cards up to date: ${cards.length} cards in public/og/{${GROUPS.join(',')}}, each ${WIDTH}x${HEIGHT} and at most ${MAX_BYTES / 1024} KB.`);
    return;
  }
  const results = await render(cards, fonts, { force, only });
  for (const r of results) console.log(`${r.skipped ? 'unchanged' : 'rendered '}  ${r.file.padEnd(36)} ${(r.bytes / 1024).toFixed(1).padStart(6)} KB${r.size ? `  title ${r.size}px` : ''}`);
  const { problems, orphans } = check(cards, fonts);
  if (orphans.length) console.warn(`\n${orphans.join('\n')}`);
  if (!only && problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`\n${results.filter((r) => !r.skipped).length} rendered, ${results.filter((r) => r.skipped).length} unchanged.`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
