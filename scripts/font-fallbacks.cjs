#!/usr/bin/env node
/**
 * Metric-matched local fallbacks for the four self-hosted font families (the fallback faces in app/styles/fonts.css).
 *
 * While a web font loads, the page is drawn in the next family of its stack. Each fallback face scales a system font
 * (size-adjust) so the site's copy has the same width as in the web font, and gives it the web font's ascent, descent
 * and line gap, so text keeps its line breaks when the web font swaps in and the page does not move.
 *
 * - Vertical metrics: read from the self-hosted WOFF2 files in public/fonts (head, hhea and OS/2; all four set USE_TYPO_METRICS,
 *   so browsers on every system use the hhea/typo values).
 * - Widths: the built pages are opened in Chromium and every run of text set in a web font is measured twice, as the
 *   page sets it (size, weight, style, variation settings, case) and in the fallback, so the match includes each font's
 *   instance, kerning and shaping. Letter and word spacing are left out: they are the same in both fonts.
 * - Fallbacks: Times New Roman, Arial and Courier New, measured through Liberation Serif, Sans and Mono, which share their
 *   metrics. Android has none of them, so Noto Serif and Roboto get the same match scaled by their width relative to
 *   Times New Roman and Arial in the capsize metrics bundled with Next.js.
 *
 * Usage, after `npm run build` (Liberation fonts installed, as on Debian and Ubuntu with fonts-liberation):
 *   node scripts/font-fallbacks.cjs           prints the @font-face rules
 *   node scripts/font-fallbacks.cjs --check   fails when app/styles/fonts.css holds other values (to within 0.3 points)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');
const { respond } = require('./e2e/server.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const SITE = 'https://splithappens.run';
// /design-system holds the redesign's type (Fraunces at 420 to 450, its italic accent) until the area pages carry it; WP9
// swaps it for those pages when it deletes the gallery.
const PAGES = ['/', '/stories', '/stories/pacing-types', '/stories/final-kick', '/tools', '/tools/predictor', '/tools/pace-band', '/analyses', '/analyses/pacing-pattern', '/courses', '/runners', '/about', '/design-system'];
const FONTS = path.join(ROOT, 'public/fonts');

const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** Ascent, descent and line gap (in em) from a WOFF2 file: its table directory, then one Brotli stream of the tables. */
function verticalMetrics(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${file} is not WOFF2`);
  let at = 48;
  const base128 = () => { let value = 0; for (let i = 0; i < 5; i++) { const byte = buf[at++]; value = value * 128 + (byte & 127); if (!(byte & 128)) return value; } throw new Error(`${file}: bad UIntBase128`); };
  const directory = [];
  for (let i = 0; i < buf.readUInt16BE(12); i++) {
    const flags = buf[at++];
    let tag = WOFF2_TAGS[flags & 63];
    if ((flags & 63) === 63) { tag = buf.toString('latin1', at, at + 4); at += 4; }
    const length = base128();
    // glyf and loca are transformed unless the version bits say otherwise; any other table only when they are set.
    const transformed = tag === 'glyf' || tag === 'loca' ? flags >> 6 === 0 : flags >> 6 !== 0;
    directory.push({ tag, length: transformed ? base128() : length });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(at, at + buf.readUInt32BE(20)));
  const tables = {};
  let offset = 0;
  for (const { tag, length } of directory) { tables[tag] = data.subarray(offset, offset + length); offset += length; }
  const unitsPerEm = tables.head.readUInt16BE(18);
  const os2 = tables['OS/2'], hhea = tables.hhea;
  const metrics = { ascent: os2.readInt16BE(68), descent: -os2.readInt16BE(70), lineGap: os2.readInt16BE(72) };
  if (!(os2.readUInt16BE(62) & 128) || metrics.ascent !== hhea.readInt16BE(4) || -metrics.descent !== hhea.readInt16BE(6) || metrics.lineGap !== hhea.readInt16BE(8)) {
    throw new Error(`${path.basename(file)}: typo and hhea metrics differ, so browsers would not agree on its line metrics`);
  }
  return { ascent: metrics.ascent / unitsPerEm, descent: metrics.descent / unitsPerEm, lineGap: metrics.lineGap / unitsPerEm };
}

const LOCAL = {
  serif: ['Times New Roman', 'TimesNewRomanPSMT', 'Liberation Serif', 'LiberationSerif', 'LiberationSerif-Regular', 'Tinos', 'Tinos-Regular'],
  serifItalic: ['Times New Roman Italic', 'TimesNewRomanPS-ItalicMT', 'Liberation Serif Italic', 'LiberationSerif-Italic', 'Tinos Italic', 'Tinos-Italic'],
  serifBold: ['Times New Roman Bold', 'TimesNewRomanPS-BoldMT', 'Liberation Serif Bold', 'LiberationSerif-Bold', 'Tinos Bold', 'Tinos-Bold'],
  serifBoldItalic: ['Times New Roman Bold Italic', 'TimesNewRomanPS-BoldItalicMT', 'Liberation Serif Bold Italic', 'LiberationSerif-BoldItalic', 'Tinos Bold Italic', 'Tinos-BoldItalic'],
  notoSerif: ['Noto Serif', 'NotoSerif', 'NotoSerif-Regular'],
  sans: ['Arial', 'ArialMT', 'Liberation Sans', 'LiberationSans', 'Arimo', 'Arimo-Regular'],
  sansBold: ['Arial Bold', 'Arial-BoldMT', 'Liberation Sans Bold', 'LiberationSans-Bold', 'Arimo Bold', 'Arimo-Bold'],
  roboto: ['Roboto', 'Roboto-Regular', 'Roboto Regular'],
  mono: ['Courier New', 'CourierNewPSMT', 'Liberation Mono', 'LiberationMono', 'Cousine', 'Cousine-Regular'],
  monoBold: ['Courier New Bold', 'CourierNewPS-BoldMT', 'Liberation Mono Bold', 'LiberationMono-Bold', 'Cousine Bold', 'Cousine-Bold'],
};

/**
 * The fallback faces. `weight` and `style` are the face's descriptors, so each face stands in for the runs of text its web
 * font sets at those weights and styles, and is measured on them against `measure`. Fraunces (opsz and wght only, no
 * SOFT or WONK) is set at 420–450 in the redesign's type, matched against the regular serif from 20 px up, and at
 * 600–700 in the legacy pages: titles at 680 get their own match, headings at 600–640 another, both at their display
 * optical sizes (`minOpsz`). Bricolage Grotesque only sets figures, at 700–780. The Android faces are single regular faces (Android
 * draws them bold the way it draws any bold system text), so they are measured on every run against the regular
 * Liberation font and scaled by the capsize widths in `scale`.
 *
 * `narrow` scales a face below its average match. Fraunces italics are short phrases inside headings, and the italic
 * file arrives after the upright one, so for a moment a heading is upright Fraunces with its italic phrase in the
 * fallback. Single phrases range from 0.84 to 1.11 times their Fraunces width in the matched fallback. Over the first
 * screens of the 38 pages with an italic heading, at 21 widths from 320 to 1920 px, the average match changed a heading's
 * line count 17 times, as the upright arrived or then the italic (12 of them the race replay story's first section
 * title, at every width from 1280 px: CLS 0.075); 96.5% of the average, 3 times (October 15, 2026).
 */
const FACES = [
  { family: 'Fraunces Fallback', web: 'Fraunces Variable', weight: '100 529', minOpsz: 20, local: LOCAL.serif, measure: 'Liberation Serif', file: 'fraunces-latin-opsz-normal.woff2' },
  { family: 'Fraunces Fallback', web: 'Fraunces Variable', weight: '530 659', minOpsz: 96, local: LOCAL.serifBold, measure: 'Liberation Serif Bold', file: 'fraunces-latin-opsz-normal.woff2' },
  { family: 'Fraunces Fallback', web: 'Fraunces Variable', weight: '660 900', minOpsz: 96, local: LOCAL.serifBold, measure: 'Liberation Serif Bold', file: 'fraunces-latin-opsz-normal.woff2' },
  { family: 'Fraunces Fallback', web: 'Fraunces Variable', weight: '100 529', style: 'italic', minOpsz: 20, narrow: 0.965, local: LOCAL.serifItalic, measure: 'Liberation Serif Italic', file: 'fraunces-latin-opsz-italic.woff2' },
  { family: 'Fraunces Fallback', web: 'Fraunces Variable', weight: '530 900', style: 'italic', minOpsz: 96, narrow: 0.965, local: LOCAL.serifBoldItalic, measure: 'Liberation Serif Bold Italic', file: 'fraunces-latin-opsz-italic.woff2' },
  { family: 'Fraunces Fallback Android', web: 'Fraunces Variable', minOpsz: 96, local: LOCAL.notoSerif, measure: 'Liberation Serif', scale: ['timesNewRoman', 'notoSerif'], file: 'fraunces-latin-opsz-normal.woff2' },
  { family: 'Inter Fallback', web: 'Inter Variable', weight: '100 599', local: LOCAL.sans, measure: 'Liberation Sans', file: 'inter-latin-wght-normal.woff2' },
  { family: 'Inter Fallback', web: 'Inter Variable', weight: '600 900', local: LOCAL.sansBold, measure: 'Liberation Sans Bold', file: 'inter-latin-wght-normal.woff2' },
  { family: 'Inter Fallback Android', web: 'Inter Variable', local: LOCAL.roboto, measure: 'Liberation Sans', scale: ['arial', 'roboto'], file: 'inter-latin-wght-normal.woff2' },
  { family: 'JetBrains Mono Fallback', web: 'JetBrains Mono Variable', weight: '100 599', local: LOCAL.mono, measure: 'Liberation Mono', file: 'jetbrains-mono-latin-wght-normal.woff2' },
  { family: 'JetBrains Mono Fallback', web: 'JetBrains Mono Variable', weight: '600 900', local: LOCAL.monoBold, measure: 'Liberation Mono Bold', file: 'jetbrains-mono-latin-wght-normal.woff2' },
  { family: 'Bricolage Grotesque Fallback', web: 'Bricolage Grotesque Variable', weight: '100 900', local: LOCAL.sansBold, measure: 'Liberation Sans Bold', file: 'bricolage-grotesque-latin-wght-normal.woff2' },
];

/** Runs in the page: total width of the text runs each face stands in for, in the web font and in the face's fallback. */
function measurePage(faces) {
  const totals = faces.map(() => [0, 0]);
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:0;top:0;white-space:pre;visibility:hidden;letter-spacing:0;word-spacing:0';
  document.body.append(probe);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || el === probe || el.closest('script, style, svg, noscript, [hidden]')) continue;
    const style = getComputedStyle(el);
    const web = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const weight = Number(style.fontWeight), italic = style.fontStyle !== 'normal';
    // Without font-optical-sizing: none, the optical size follows the font size in pixels.
    const opsz = Number((style.fontVariationSettings.match(/"opsz" ([\d.]+)/) || [])[1] || parseFloat(style.fontSize));
    const takes = faces.map((face) => face.web === web && opsz >= (face.minOpsz || 0)
      && (face.style === undefined ? !italic || !face.weight : italic === (face.style === 'italic'))
      && (!face.weight || (weight >= Number(face.weight.split(' ')[0]) && weight <= Number(face.weight.split(' ')[1]))));
    if (!takes.includes(true)) continue;
    for (const key of ['fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariationSettings', 'fontFeatureSettings', 'fontVariantNumeric', 'fontVariantLigatures', 'fontKerning', 'fontOpticalSizing', 'textTransform']) probe.style[key] = style[key];
    probe.textContent = text;
    probe.style.fontFamily = `"${web}"`;
    const width = probe.getBoundingClientRect().width;
    takes.forEach((take, i) => {
      if (!take) return;
      probe.style.fontFamily = `"Measure ${faces[i].measure}"`;
      totals[i][0] += width;
      totals[i][1] += probe.getBoundingClientRect().width;
    });
  }
  probe.remove();
  return totals;
}

async function measure() {
  if (!fs.existsSync(path.join(OUT, 'index.html'))) throw new Error('Run `npm run build` first: the widths are measured on the built pages.');
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const totals = FACES.map(() => [0, 0]);
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    // Serve the export inside Playwright and refuse everything else, so nothing leaves the machine.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== SITE) return route.abort();
      const { status, contentType, body } = respond(OUT, url.pathname);
      return route.fulfill({ status, contentType, body });
    });
    const measured = [...new Set(FACES.map((face) => face.measure))];
    const css = measured.map((name) => `@font-face { font-family: 'Measure ${name}'; src: local('${name}'); }`).join('\n');
    for (const page of PAGES) {
      const tab = await context.newPage();
      await tab.goto(SITE + page, { waitUntil: 'load' });
      await tab.addStyleTag({ content: css });
      const missing = await tab.evaluate(async (names) => {
        await document.fonts.ready;
        const absent = [];
        for (const name of names) if (!(await document.fonts.load(`16px "Measure ${name}"`)).length) absent.push(name);
        return absent;
      }, measured);
      if (missing.length) throw new Error(`Install the Liberation fonts: ${missing.join(', ')} not found`);
      const pageTotals = await tab.evaluate(measurePage, FACES);
      pageTotals.forEach(([web, fallback], i) => { totals[i][0] += web; totals[i][1] += fallback; });
      await tab.close();
    }
  } finally {
    await browser.close();
  }
  return totals;
}

const percent = (value) => `${(value * 100).toFixed(2)}%`;

async function rules() {
  const totals = await measure();
  const capsize = require(path.join(ROOT, 'node_modules/next/dist/server/capsize-font-metrics.json'));
  const width = (name) => capsize[name].xWidthAvg / capsize[name].unitsPerEm;
  return FACES.map((face, i) => {
    if (!totals[i][1]) throw new Error(`No text on the measured pages is set the way ${face.family} ${face.weight || ''} ${face.style || ''} expects`);
    const scale = (totals[i][0] / totals[i][1]) * (face.scale ? width(face.scale[0]) / width(face.scale[1]) : 1) * (face.narrow || 1);
    const { ascent, descent, lineGap } = verticalMetrics(path.join(FONTS, face.file));
    // Browsers apply the metric overrides to the size-adjusted font, so each is divided by the scale.
    return `@font-face { font-family: '${face.family}'; src: ${face.local.map((name) => `local('${name}')`).join(', ')};`
      + `${face.weight ? ` font-weight: ${face.weight};` : ''}${face.style ? ` font-style: ${face.style};` : ''}`
      + ` size-adjust: ${percent(scale)}; ascent-override: ${percent(ascent / scale)}; descent-override: ${percent(descent / scale)}; line-gap-override: ${percent(lineGap / scale)}; }`;
  });
}

rules().then((lines) => {
  if (!process.argv.includes('--check')) { console.log(lines.join('\n')); return; }
  const globals = fs.readFileSync(path.join(ROOT, 'app/styles/fonts.css'), 'utf8').split('\n');
  const numbers = (line) => (line.match(/[\d.]+%/g) || []).map(parseFloat);
  const problems = lines.filter((line) => {
    const head = line.slice(0, line.indexOf(' size-adjust'));
    const current = globals.find((l) => l.startsWith(head + ' size-adjust'));
    return !current || numbers(current).some((value, k) => Math.abs(value - numbers(line)[k]) > 0.3);
  });
  if (problems.length) { console.error(`app/styles/fonts.css font fallbacks differ from what the fonts measure:\n${problems.join('\n')}`); process.exit(1); }
  console.log(`Font fallbacks match the fonts (${lines.length} faces).`);
}).catch((error) => { console.error(error.message); process.exit(1); });
