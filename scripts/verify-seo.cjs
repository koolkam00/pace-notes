#!/usr/bin/env node
/**
 * Search and social metadata checks on the static export (plan G1, docs/SEO.md).
 *
 *   npm run build && npm run verify:seo
 *   node scripts/verify-seo.cjs --out <dir>   check another export folder (default: out/)
 *   node scripts/verify-seo.cjs --all         list every page in each failed group (default: the first 25)
 *   node scripts/verify-seo.cjs --today YYYY-MM-DD   the date a sitemap lastmod may not pass (default: today, UTC)
 *
 * The route policy comes from lib/seo-routes.ts (NOINDEX, THIN_PACKS, pack aliases, sitemapEntries()), loaded with
 * the same TypeScript require hook as scripts/verify-units.cjs, and the finish count from finishesM() in lib/seo.tsx.
 * Failures are grouped by check and the script exits 1 when any check fails. Long titles and descriptions,
 * and a few policy notes, are warnings only.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const OUT = path.resolve(option('--out') || path.join(ROOT, 'out'));
const SHOW_ALL = args.includes('--all');
const TODAY = option('--today') || new Date().toISOString().slice(0, 10);
const LIMIT = 25;

// ---------- Policy from the TypeScript sources ----------

const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest);
};
process.chdir(ROOT); // lib/insights-server.ts reads public/data from the working directory, as next build does.
const routes = require(path.join(ROOT, 'lib/seo-routes.ts'));
const { finishesM } = require(path.join(ROOT, 'lib/seo.tsx'));
const { ogImageCandidates } = require(path.join(ROOT, 'lib/og-paths.ts'));
const { SITE_URL, NOINDEX, THIN_PACKS, ROBOTS_DISALLOW } = routes;
const SITE_HOST = new URL(SITE_URL).host;
const OLD_HOST = 'htw-live-study.vercel.app';
const FINISHES_M = finishesM();

// ---------- Results ----------

const CHECKS = {
  'head-tags': 'Each page (404 excepted) has one non-empty <title>, one meta description and one <h1>',
  'robots-meta': 'noindex exactly on NOINDEX, THIN_PACKS and 404, with no conflicting robots tags',
  canonical: 'Indexable pages have one clean canonical on the production host, equal to canonicalPathFor(); noindex pages have none',
  aliases: 'Pack aliases point at a built, indexable, self-canonical primary page',
  'social-tags': 'Indexable pages have og:title, og:description, og:image, twitter:card, and og:url equal to the canonical',
  'og-image': 'Every og:image and twitter:image is a file in the export, on the production host, 1200x630',
  duplicates: 'Indexable pages have unique titles and descriptions',
  sitemap: 'sitemap.xml parses, lists exactly the indexable self-canonical pages (sitemapEntries()), with honest lastmod dates',
  'robots-txt': 'robots.txt names the sitemap and blocks only the runner-name folders',
  'json-ld': 'JSON-LD parses, uses schema.org, names no Person but Andrew Kam (without a URL), none on /runners, breadcrumbs 1..n on the host',
  'banned-words': '"the wall", "arithmetic" and "your chance" appear nowhere: visible text, alt text, metadata or JSON-LD',
  fastest: '"fastest" is in no title, description, H1 or og/twitter tag',
  'runner-counts': 'Titles and descriptions count finishes, never runners',
  'personal-data': 'No q= in a canonical, og:url, the sitemap or JSON-LD, and /runners is noindex',
  'units-links': 'No internal link in the static HTML carries units=mi (the default unit)',
  'old-host': `${OLD_HOST} is in no <head>`,
  'finish-counts': `Every "N.N million" or "N.NM" in a title or description equals finishesM() ("${FINISHES_M}")`,
};
const WARNINGS = {
  'title-length': 'Titles over 60 characters',
  'description-length': 'Descriptions over 155 characters',
  'og-image-fallback': 'Pages that could have their own share card but use a fallback (run npm run og:images)',
  policy: 'Policy notes',
};
const failures = new Map(Object.keys(CHECKS).map((key) => [key, []]));
const warnings = new Map(Object.keys(WARNINGS).map((key) => [key, []]));
const fail = (check, page, message) => failures.get(check).push({ page, message });
const warn = (group, page, message) => warnings.get(group).push({ page, message });

// ---------- HTML helpers (no dependencies) ----------

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', times: '×', minus: '−' };
function decode(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value <= 0x10FFFF ? String.fromCodePoint(value) : whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, code.toLowerCase()) ? NAMED[code.toLowerCase()] : whole;
  });
}
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attributes(tag) {
  const inner = tag.replace(/^<[a-zA-Z][\w:-]*/, '').replace(/\/?>$/, '');
  const result = {};
  for (const match of inner.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (!(name in result)) result[name] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}
const stripScripts = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
const BLOCK_TAGS = 'address|article|aside|blockquote|br|button|caption|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|option|p|pre|section|select|summary|table|tbody|td|tfoot|th|thead|tr|ul|svg|g|text|tspan|title|desc|label';
function textOf(html) {
  return decode(html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), ' ')
    .replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}
const snippet = (text, index, length) => `…${text.slice(Math.max(0, index - 40), index + length + 40).replace(/\s+/g, ' ')}…`;
const chars = (text) => [...text].length;

// ---------- Pages ----------

function htmlFiles(dir, base = '') {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { if (entry.name !== '_next') found.push(...htmlFiles(path.join(dir, entry.name), relative)); }
    else if (entry.name.endsWith('.html')) found.push(relative);
  }
  return found;
}
const isNotFound = (file) => file === '404.html' || file === '_not-found.html';
function pagePath(file) {
  const bare = file.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return '/' + bare;
}

function parsePage(file) {
  const html = fs.readFileSync(path.join(OUT, file), 'utf8');
  const headStart = html.search(/<head\b/i);
  const headEnd = html.search(/<\/head>/i);
  const head = headStart >= 0 && headEnd > headStart ? html.slice(headStart, headEnd) : '';
  const body = headEnd >= 0 ? html.slice(headEnd) : html;
  const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => textOf(m[1]));
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attributes(m[0]));
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attributes(m[0]));
  const named = (key) => metas.filter((m) => (m.name || '').toLowerCase() === key || (m.property || '').toLowerCase() === key).map((m) => m.content ?? '');
  const social = {};
  for (const meta of metas) {
    const key = (meta.property || meta.name || '').toLowerCase();
    if (/^(og|twitter|article):/.test(key)) (social[key] = social[key] || []).push(meta.content ?? '');
  }
  const h1 = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => textOf(m[1]));
  const jsonLd = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => /application\/ld\+json/i.test(attributes(`<script${m[1]}>`).type || ''))
    .map((m) => m[2]);
  const withoutScripts = stripScripts(body);
  const hrefs = [...withoutScripts.matchAll(/<[a-z][\w:-]*\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)].map((m) => decode(m[1] ?? m[2]));
  const attributeText = [...withoutScripts.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)].flatMap((m) => {
    const a = attributes(m[0]);
    return ['alt', 'title', 'aria-label', 'placeholder'].filter((k) => a[k]).map((k) => a[k]);
  });
  return {
    file, path: pagePath(file), notFound: isNotFound(file), html, head, titles, metas, links, h1, jsonLd, hrefs,
    title: titles[0] ?? '', descriptions: named('description'), robots: named('robots').concat(named('googlebot')),
    canonicals: links.filter((l) => (l.rel || '').toLowerCase().split(/\s+/).includes('canonical')).map((l) => l.href ?? ''),
    social, visible: textOf(body), attributeText,
  };
}

if (!fs.existsSync(OUT) || !fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error(`verify-seo: no export at ${OUT}. Run npm run build first (output: 'export' writes out/).`);
  process.exit(1);
}
const pages = htmlFiles(OUT).map(parsePage);
const byPath = new Map(pages.filter((p) => !p.notFound).map((p) => [p.path, p]));

/** The policy's answer for a page; a file name that is not a clean site path (spaces, odd characters) counts as noindex and fails below. */
const unclean = new Set();
const expectNoindex = (page) => {
  if (page.notFound) return true;
  try { return routes.isNoindex(page.path); } catch { unclean.add(page.path); return true; }
};
const hasNoindex = (page) => page.robots.some((r) => /\b(noindex|none)\b/i.test(r));

// ---------- URL helpers ----------

/** A URL on the production host with no query, fragment or trailing slash (the root may be bare or end in /). */
function cleanSiteUrl(value) {
  let url;
  try { url = new URL(value); } catch { return 'is not an absolute URL'; }
  if (url.protocol !== 'https:' || url.host !== SITE_HOST) return `is not on ${SITE_URL}`;
  if (value.includes('?') || value.includes('#')) return 'has a query or fragment';
  if (url.pathname !== '/' && url.pathname.endsWith('/')) return 'has a trailing slash';
  return null;
}
const samePage = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');
const sitePath = (value) => { const url = new URL(value); return decodeURIComponent(url.pathname.replace(/\/$/, '')) || '/'; };
const hasQueryName = (value) => /[?&]q=/.test(value);

// ---------- Image size (PNG, JPEG, WebP headers) ----------

const imageSizes = new Map();
function imageSize(file) {
  if (imageSizes.has(file)) return imageSizes.get(file);
  let result;
  try {
    const bytes = fs.readFileSync(file);
    if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504E47 && bytes.toString('latin1', 12, 16) === 'IHDR') {
      result = { type: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      for (let at = 2; at + 9 < bytes.length;) {
        if (bytes[at] !== 0xFF) break;
        const marker = bytes[at + 1];
        const length = bytes.readUInt16BE(at + 2);
        if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) { result = { type: 'jpeg', width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) }; break; }
        at += 2 + length;
      }
    } else if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP' && bytes.toString('latin1', 12, 16) === 'VP8X') {
      result = { type: 'webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    }
    if (!result) result = { error: 'is not a PNG, JPEG or WebP image it can read' };
  } catch (error) { result = { error: error.code === 'ENOENT' ? 'is missing from the export' : error.message }; }
  imageSizes.set(file, result);
  return result;
}

// ---------- Per-page checks ----------

const indexable = [];
for (const page of pages) {
  const where = page.notFound ? '404' : page.path;
  const noindexExpected = expectNoindex(page);

  if (unclean.has(page.path)) fail('canonical', where, 'the file name is not a clean site path (lowercase letters, digits, - and / only are safe)');

  // Head tags
  if (!page.notFound) {
    if (page.titles.length !== 1 || !page.title) fail('head-tags', where, page.titles.length === 1 ? 'empty <title>' : `${page.titles.length} <title> elements in <head>`);
    if (page.descriptions.length !== 1 || !page.descriptions[0].trim()) fail('head-tags', where, page.descriptions.length === 1 ? 'empty meta description' : `${page.descriptions.length} meta descriptions`);
    if (page.h1.length !== 1) fail('head-tags', where, `${page.h1.length} <h1> elements in the static HTML`);
    else if (!page.h1[0]) fail('head-tags', where, 'empty <h1>');
  }

  // Robots meta
  const noindexFound = hasNoindex(page);
  if (noindexExpected && !noindexFound) fail('robots-meta', where, `should be noindex (${page.notFound ? '404' : NOINDEX.includes(page.path) ? 'NOINDEX' : 'thin or legacy pack'}) but robots says "${page.robots.join(' | ') || 'nothing'}"`);
  if (!noindexExpected && noindexFound) fail('robots-meta', where, `is noindex but lib/seo-routes.ts says it is indexable (robots "${page.robots.join(' | ')}")`);
  if (!page.notFound && page.robots.length > 1 && page.robots.some((r) => /\bnoindex\b/i.test(r)) && page.robots.some((r) => /(^|[\s,])index\b/i.test(r) && !/\bnoindex\b/i.test(r))) {
    fail('robots-meta', where, `conflicting robots tags: ${page.robots.map((r) => `"${r}"`).join(' and ')}`);
  }
  if (noindexExpected && noindexFound && page.robots.some((r) => /\bnofollow\b/i.test(r))) warn('policy', where, 'noindex page also says nofollow; the policy is noindex, follow');
  if (!page.notFound && noindexExpected && !unclean.has(page.path) && !NOINDEX.includes(page.path) && !THIN_PACKS.map((id) => `/packs/${id}`).includes(page.path)) {
    fail('robots-meta', where, 'is noindex only because packCanonical() finds no primary page for it; add it to THIN_PACKS or map it to its primary question');
  }

  // Canonical
  const canonical = page.canonicals[0];
  if (noindexExpected) {
    if (page.canonicals.length) fail('canonical', where, `noindex page declares a canonical (${page.canonicals.join(', ')})`);
  } else {
    const expectedPath = routes.canonicalPathFor(page.path);
    const expected = routes.absoluteUrl(expectedPath);
    if (page.canonicals.length !== 1) fail('canonical', where, page.canonicals.length ? `${page.canonicals.length} canonical links` : `no <link rel="canonical"> (expected ${expected})`);
    if (canonical !== undefined) {
      const problem = cleanSiteUrl(canonical);
      if (problem) fail('canonical', where, `canonical ${canonical} ${problem}`);
      else if (!samePage(canonical, expected)) fail('canonical', where, `canonical is ${canonical}, expected ${expected}`);
    }
    indexable.push(page);

    // Pack aliases
    if (expectedPath !== page.path) {
      const target = byPath.get(expectedPath);
      if (!routes.isIndexable(expectedPath)) fail('aliases', where, `canonical target ${expectedPath} is not indexable`);
      else if (!target) fail('aliases', where, `canonical target ${expectedPath} was not built`);
      else if (hasNoindex(target)) fail('aliases', where, `canonical target ${expectedPath} is noindex in the build`);
      else if (target.canonicals.length !== 1 || !samePage(target.canonicals[0], expected)) fail('aliases', where, `canonical target ${expectedPath} is not self-canonical (${target.canonicals.join(', ') || 'no canonical'})`);
    }

    // Social tags
    const one = (key) => (page.social[key] || []).find((v) => v.trim()) || '';
    for (const key of ['og:title', 'og:description', 'og:image', 'twitter:card']) if (!one(key)) fail('social-tags', where, `missing ${key}`);
    const ogUrl = one('og:url');
    if (!ogUrl) fail('social-tags', where, 'missing og:url');
    else if (canonical && !samePage(ogUrl, canonical)) fail('social-tags', where, `og:url ${ogUrl} is not the canonical ${canonical}`);
    if (one('twitter:card') && one('twitter:card') !== 'summary_large_image') warn('policy', where, `twitter:card is "${one('twitter:card')}", not summary_large_image`);
  }

  // Share images (every page that names one)
  const images = [...(page.social['og:image'] || []), ...(page.social['og:image:url'] || []), ...(page.social['twitter:image'] || [])].filter(Boolean);
  for (const image of new Set(images)) {
    let url;
    try { url = new URL(image); } catch { fail('og-image', where, `image ${image} is not an absolute URL`); continue; }
    if (url.protocol !== 'https:' || url.host !== SITE_HOST) { fail('og-image', where, `image ${image} is not on ${SITE_URL}`); continue; }
    const size = imageSize(path.join(OUT, decodeURIComponent(url.pathname)));
    if (size.error) fail('og-image', where, `${url.pathname} ${size.error}`);
    else if (size.width !== 1200 || size.height !== 630) fail('og-image', where, `${url.pathname} is ${size.width}x${size.height}, not 1200x630`);
  }
  for (const [key, want] of [['og:image:width', '1200'], ['og:image:height', '630']]) {
    for (const value of page.social[key] || []) if (value !== want) fail('og-image', where, `${key} is ${value}, not ${want}`);
  }
  if (!page.notFound && !noindexExpected && images.length) {
    const candidates = ogImageCandidates(page.path);
    const own = candidates.length === 3 ? candidates[0] : null; // a section with per-page cards
    const used = (() => { try { return new URL(images[0]).pathname; } catch { return ''; } })();
    const usable = used && !imageSize(path.join(OUT, decodeURIComponent(used))).error; // a missing image is already a failure
    if (own && usable && used !== own) {
      warn('og-image-fallback', where, imageSize(path.join(OUT, own)).error ? `uses ${used}; ${own} does not exist yet` : `uses ${used} although ${own} exists (stale build, or a custom image)`);
    }
  }

  // Old host
  if (page.head.includes(OLD_HOST)) fail('old-host', where, `<head> mentions ${OLD_HOST}`);

  // Query names in URLs
  for (const value of [...page.canonicals, ...(page.social['og:url'] || [])]) if (hasQueryName(value)) fail('personal-data', where, `q= in ${value}`);

  // Internal links with the default unit
  const unitLinks = new Set(page.hrefs.filter((href) => {
    const internal = href.startsWith('/') ? !href.startsWith('//') : href.startsWith(SITE_URL) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
    return internal && /[?&]units=mi(?:[&#]|$)/.test(href);
  }));
  if (unitLinks.size) fail('units-links', where, `${unitLinks.size} link${unitLinks.size === 1 ? '' : 's'} with units=mi, e.g. ${[...unitLinks].slice(0, 2).join(' , ')}`);

  // Words: metadata, H1, visible text, alt text and JSON-LD
  const metaTexts = [
    ['title', page.titles.join(' ')],
    ['description', page.descriptions.join(' ')],
    ...Object.entries(page.social).filter(([key]) => /:(title|description|image:alt|site_name)$/.test(key)).map(([key, values]) => [key, values.join(' ')]),
  ];
  const headline = [['title', page.title], ['description', page.descriptions[0] || ''], ...metaTexts.filter(([key]) => /^(og|twitter):(title|description)$/.test(key))];

  const banned = [[/\bthe\s+wall\b/i, '"the wall" (say "sustained slowdown")'], [/arithmetic/i, '"arithmetic"'], [/\byour\s+chances?\b/i, '"your chance"']];
  const sources = [...metaTexts, ['h1', page.h1.join(' ')], ['visible text', page.visible], ['alt/title/aria-label', page.attributeText.join(' | ')]];
  for (const [pattern, label] of banned) {
    for (const [source, text] of sources) {
      const match = pattern.exec(text);
      if (match) fail('banned-words', where, `${label} in ${source}: ${snippet(text, match.index, match[0].length)}`);
    }
  }
  for (const [source, text] of [...metaTexts, ['h1', page.h1.join(' ')]]) {
    const match = /fastest/i.exec(text);
    if (match) fail('fastest', where, `"fastest" in ${source}: ${snippet(text, match.index, match[0].length)}`);
  }
  for (const [source, text] of headline) {
    const match = /\bmillion\s+runners\b|\d[\d,.]*\s+runners\b/i.exec(text);
    if (match) fail('runner-counts', where, `"${match[0]}" in ${source}; counts are finishes`);
    for (const count of text.matchAll(/(\d+(?:\.\d+)?)(?:\s*[Mm]illion\b|M\b)/g)) {
      if (count[1] !== FINISHES_M) fail('finish-counts', where, `"${count[0]}" in ${source}, but finishesM() is ${FINISHES_M}`);
    }
  }

  // JSON-LD
  checkJsonLd(page, where, banned);

  // Length warnings
  if (!page.notFound && page.title && chars(page.title) > 60) warn('title-length', where, `${chars(page.title)} characters: "${page.title}"`);
  if (!page.notFound && page.descriptions[0] && chars(page.descriptions[0]) > 155) warn('description-length', where, `${chars(page.descriptions[0])} characters`);
}

function checkJsonLd(page, where, banned) {
  const NOTHING_HERE = ['/privacy', '/request-analysis', '/your-race', '/htw', '/packs/smyth_htw'];
  if (!page.jsonLd.length) return;
  if (page.path === '/runners' && !page.notFound) fail('json-ld', where, `${page.jsonLd.length} JSON-LD block(s) on /runners; it must have none`);
  else if (page.notFound || NOTHING_HERE.includes(page.path)) warn('policy', where, 'has JSON-LD; the plan keeps this page without structured data');
  page.jsonLd.forEach((raw, index) => {
    const label = `JSON-LD block ${index + 1}`;
    let data;
    try { data = JSON.parse(raw); } catch (error) { fail('json-ld', where, `${label} does not parse: ${error.message}`); return; }
    const top = Array.isArray(data) ? data : [data];
    for (const item of top) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { fail('json-ld', where, `${label} has a top-level value that is not an object`); continue; }
      const context = item['@context'];
      const contexts = Array.isArray(context) ? context : [context];
      if (!contexts.some((c) => typeof c === 'string' && /^https?:\/\/schema\.org\/?$/.test(c))) fail('json-ld', where, `${label}: @context is ${JSON.stringify(context)}, not https://schema.org`);
    }
    const strings = [];
    const walk = (node, trail) => {
      if (typeof node === 'string') { strings.push([trail, node]); return; }
      if (Array.isArray(node)) { node.forEach((child, i) => walk(child, `${trail}[${i}]`)); return; }
      if (!node || typeof node !== 'object') return;
      const types = [].concat(node['@type'] || []);
      if (types.includes('Person')) {
        if (node.name !== 'Andrew Kam') fail('json-ld', where, `${label}: Person ${JSON.stringify(node.name)} at ${trail || 'top'}; the only Person is "Andrew Kam"`);
        for (const key of ['url', 'sameAs', '@id', 'email', 'image']) if (key in node) fail('json-ld', where, `${label}: Person has "${key}"; Andrew Kam is credited by name only`);
      }
      if (types.includes('ProfilePage')) fail('json-ld', where, `${label}: ProfilePage; no profile markup for runners`);
      for (const type of ['FAQPage', 'HowTo', 'SoftwareApplication', 'SearchAction', 'Event']) if (types.includes(type)) warn('policy', where, `${label}: ${type} markup is not used on this site by policy`);
      if (types.includes('WebSite') && page.path !== '/') warn('policy', where, `${label}: WebSite markup belongs on the home page only`);
      if (types.includes('BreadcrumbList')) checkBreadcrumbs(node.itemListElement, where, label);
      for (const [key, value] of Object.entries(node)) walk(value, trail ? `${trail}.${key}` : key);
    };
    walk(data, '');
    for (const [trail, value] of strings) {
      if (value.includes(OLD_HOST)) fail('old-host', where, `${label} ${trail} mentions ${OLD_HOST}`);
      if (/^https?:\/\//i.test(value) && hasQueryName(value)) fail('personal-data', where, `${label} ${trail}: q= in ${value}`);
      if (value.startsWith(SITE_URL) && (value.includes('?') || value.includes('#'))) fail('json-ld', where, `${label} ${trail}: site URL with a query or fragment (${value})`);
      for (const [pattern, wording] of banned) {
        const match = pattern.exec(value);
        if (match) fail('banned-words', where, `${wording} in ${label} ${trail}: ${snippet(value, match.index, match[0].length)}`);
      }
    }
  });
}

function checkBreadcrumbs(items, where, label) {
  if (!Array.isArray(items) || !items.length) { fail('json-ld', where, `${label}: BreadcrumbList without itemListElement`); return; }
  items.forEach((item, i) => {
    if (!item || item['@type'] !== 'ListItem') fail('json-ld', where, `${label}: breadcrumb ${i + 1} is not a ListItem`);
    if (!item || item.position !== i + 1) fail('json-ld', where, `${label}: breadcrumb positions are ${items.map((x) => x && x.position).join(',')}, not 1..${items.length}`);
    if (!item || typeof item.name !== 'string' || !item.name.trim()) fail('json-ld', where, `${label}: breadcrumb ${i + 1} has no name`);
    const target = item && (typeof item.item === 'string' ? item.item : item.item && item.item['@id']);
    if (target === undefined || target === null) {
      if (i !== items.length - 1) fail('json-ld', where, `${label}: breadcrumb ${i + 1} (${item && item.name}) has no item URL; only the last may leave it out`);
    } else {
      const problem = cleanSiteUrl(String(target));
      if (problem) fail('json-ld', where, `${label}: breadcrumb ${i + 1} URL ${target} ${problem}`);
    }
  });
}

// ---------- Duplicates among indexable pages ----------

for (const [field, read] of [['title', (p) => p.title], ['description', (p) => p.descriptions[0] || '']]) {
  const groups = new Map();
  for (const page of indexable) {
    const value = read(page).trim();
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(page.path);
  }
  for (const [value, paths] of groups) if (paths.length > 1) fail('duplicates', paths.join(', '), `share the ${field} "${value.length > 90 ? value.slice(0, 90) + '…' : value}"`);
}

// ---------- noindex set ----------

for (const listed of [...NOINDEX, ...THIN_PACKS.map((id) => `/packs/${id}`)]) {
  if (!byPath.has(listed)) warn('policy', listed, 'is in NOINDEX or THIN_PACKS but has no page in the export');
}
if (!pages.some((p) => p.notFound)) fail('robots-meta', '404', 'the export has no 404.html');
const runners = byPath.get('/runners');
if (!runners) fail('personal-data', '/runners', 'no /runners page in the export to check');
else if (!hasNoindex(runners)) fail('personal-data', '/runners', 'is not noindex; runner lookups must never be indexable');

// ---------- Sitemap ----------

/** A small XML well-formedness parser for the sitemap: elements, attributes, text, comments, CDATA and the five entities. */
function parseXml(xml) {
  const root = { name: '#document', children: [] };
  const stack = [root];
  let i = xml.charCodeAt(0) === 0xFEFF ? 1 : 0;
  const entity = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;
  const open = /<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
  const close = /<\/([A-Za-z_][\w.:-]*)\s*>/y;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = xml.slice(i, lt < 0 ? xml.length : lt);
    if (text) {
      for (let k = text.indexOf('&'); k >= 0; k = text.indexOf('&', k + 1)) if (!entity.test(text.slice(k))) throw new Error(`unescaped & at offset ${i + k}`);
      if (stack.length === 1) { if (text.trim()) throw new Error(`text outside the root element at offset ${i}`); }
      else stack[stack.length - 1].children.push({ text: decode(text) });
    }
    if (lt < 0) break;
    const skip = (start, end, what) => { const at = xml.indexOf(end, lt + start.length); if (at < 0) throw new Error(`unterminated ${what} at offset ${lt}`); return at + end.length; };
    if (xml.startsWith('<?', lt)) { if (stack.length > 1) throw new Error('processing instruction inside an element'); i = skip('<?', '?>', 'declaration'); continue; }
    if (xml.startsWith('<!--', lt)) { i = skip('<!--', '-->', 'comment'); continue; }
    if (xml.startsWith('<![CDATA[', lt)) { const end = skip('<![CDATA[', ']]>', 'CDATA'); stack[stack.length - 1].children.push({ text: xml.slice(lt + 9, end - 3) }); i = end; continue; }
    if (xml.startsWith('<!DOCTYPE', lt)) { i = skip('<!DOCTYPE', '>', 'DOCTYPE'); continue; }
    close.lastIndex = lt;
    const closing = close.exec(xml);
    if (closing) {
      const top = stack.pop();
      if (!top || top.name !== closing[1]) throw new Error(`</${closing[1]}> at offset ${lt} does not close <${top ? top.name : '?'}>`);
      i = close.lastIndex;
      continue;
    }
    open.lastIndex = lt;
    const opening = open.exec(xml);
    if (!opening) throw new Error(`malformed tag at offset ${lt}: ${JSON.stringify(xml.slice(lt, lt + 40))}`);
    const element = { name: opening[1], attributes: attributes(`<x${opening[2]}>`), children: [] };
    if (stack.length === 1 && root.children.some((c) => c.name)) throw new Error('more than one root element');
    stack[stack.length - 1].children.push(element);
    if (!opening[3]) stack.push(element);
    i = open.lastIndex;
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> is never closed`);
  const top = root.children.find((c) => c.name);
  if (!top) throw new Error('no root element');
  return top;
}
const textContent = (element) => element.children.map((c) => (c.text !== undefined ? c.text : textContent(c))).join('');

let sitemapLocs = [];
(function checkSitemap() {
  const file = path.join(OUT, 'sitemap.xml');
  if (!fs.existsSync(file)) { fail('sitemap', 'sitemap.xml', 'missing from the export'); return; }
  let urlset;
  try { urlset = parseXml(fs.readFileSync(file, 'utf8')); } catch (error) { fail('sitemap', 'sitemap.xml', `does not parse: ${error.message}`); return; }
  if (urlset.name !== 'urlset' || urlset.attributes.xmlns !== 'http://www.sitemaps.org/schemas/sitemap/0.9') fail('sitemap', 'sitemap.xml', `root is <${urlset.name} xmlns="${urlset.attributes.xmlns || ''}">, not the sitemaps.org 0.9 urlset`);
  let expected;
  try { expected = new Map(routes.sitemapEntries().map((e) => [e.path, e.lastmod])); } catch (error) { fail('sitemap', 'lib/seo-routes.ts', `sitemapEntries() throws: ${error.message}`); expected = new Map(); }
  const sourceDates = new Set(routes.allSourceDates());
  const seen = new Set();
  for (const url of urlset.children.filter((c) => c.name)) {
    if (url.name !== 'url') { fail('sitemap', 'sitemap.xml', `unexpected <${url.name}> in <urlset>`); continue; }
    const locs = url.children.filter((c) => c.name === 'loc');
    const lastmods = url.children.filter((c) => c.name === 'lastmod');
    for (const extra of url.children.filter((c) => c.name && !['loc', 'lastmod'].includes(c.name))) {
      if (['changefreq', 'priority'].includes(extra.name)) warn('policy', 'sitemap.xml', `<${extra.name}> is ignored by Google; the policy leaves it out`);
      else fail('sitemap', 'sitemap.xml', `unexpected <${extra.name}> in <url>`);
    }
    if (locs.length !== 1) { fail('sitemap', 'sitemap.xml', `a <url> has ${locs.length} <loc> elements`); continue; }
    const loc = textContent(locs[0]).trim();
    sitemapLocs.push(loc);
    if (hasQueryName(loc)) fail('personal-data', 'sitemap.xml', `q= in <loc> ${loc}`);
    const problem = cleanSiteUrl(loc);
    if (problem) { fail('sitemap', loc, `<loc> ${problem}`); continue; }
    const pathname = sitePath(loc);
    if (seen.has(pathname)) { fail('sitemap', loc, 'listed twice'); continue; }
    seen.add(pathname);
    const page = byPath.get(pathname);
    if (!page) fail('sitemap', loc, 'has no page in the export');
    else {
      if (expectNoindex(page) || hasNoindex(page)) fail('sitemap', loc, 'is a noindex page');
      else if (routes.canonicalPathFor(pathname) !== pathname) fail('sitemap', loc, `is an alias of ${routes.canonicalPathFor(pathname)}`);
      if (page.canonicals.length !== 1 || !samePage(page.canonicals[0], loc)) fail('sitemap', loc, `the page's canonical is ${page.canonicals.join(', ') || 'missing'}, not the <loc>`);
    }
    if (!expected.has(pathname)) fail('sitemap', loc, 'is not in sitemapEntries() (stale build?)');
    if (lastmods.length > 1) fail('sitemap', loc, `${lastmods.length} <lastmod> elements`);
    const lastmod = lastmods.length ? textContent(lastmods[0]).trim() : undefined;
    if (lastmod !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(lastmod) || !Number.isFinite(Date.parse(lastmod))) fail('sitemap', loc, `lastmod "${lastmod}" is not a W3C date`);
      else {
        const day = lastmod.slice(0, 10);
        if (day > TODAY) fail('sitemap', loc, `lastmod ${lastmod} is in the future (today ${TODAY})`);
        if (!sourceDates.has(day)) fail('sitemap', loc, `lastmod ${day} is not one of the data or content dates (${[...sourceDates].join(', ')})`);
      }
    }
    if (expected.has(pathname) && expected.get(pathname) !== (lastmod ? lastmod.slice(0, 10) : undefined)) fail('sitemap', loc, `lastmod ${lastmod || 'missing'} but sitemapEntries() says ${expected.get(pathname) || 'none'}`);
  }
  for (const [pathname] of expected) if (!seen.has(pathname)) fail('sitemap', pathname, 'is in sitemapEntries() but not in sitemap.xml');
  for (const page of indexable) {
    if (routes.canonicalPathFor(page.path) === page.path && !seen.has(page.path)) fail('sitemap', page.path, 'indexable, self-canonical page missing from the sitemap (add it to EXTRA_SITEMAP_PAGES in lib/seo-routes.ts)');
  }
})();

// ---------- robots.txt ----------

function robotsGroups(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === 'sitemap') sitemaps.push(value);
      else if ((key === 'allow' || key === 'disallow') && current) current.rules.push({ type: key, path: value });
    }
  }
  return { groups, sitemaps };
}
/** Google's matching: the longest matching rule wins, Allow wins a tie, * is a wildcard and a final $ anchors. */
function robotsAllows(rules, target) {
  let best = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    const anchored = rule.path.endsWith('$');
    const body = anchored ? rule.path.slice(0, -1) : rule.path;
    const pattern = new RegExp('^' + body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
    if (!pattern.test(target)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.type === 'allow')) best = rule;
  }
  return !best || best.type === 'allow';
}
(function checkRobots() {
  const file = path.join(OUT, 'robots.txt');
  if (!fs.existsSync(file)) { fail('robots-txt', 'robots.txt', 'missing from the export'); return; }
  const { groups, sitemaps } = robotsGroups(fs.readFileSync(file, 'utf8'));
  if (!sitemaps.includes(`${SITE_URL}/sitemap.xml`)) fail('robots-txt', 'robots.txt', `no "Sitemap: ${SITE_URL}/sitemap.xml" line (found ${sitemaps.join(', ') || 'none'})`);
  if (!groups.some((g) => g.agents.includes('*'))) fail('robots-txt', 'robots.txt', 'no "User-agent: *" group');
  const mustAllow = new Set(['/', '/_next/static/chunks/main.js', '/data/insights/manifest.json', '/data/live.json', '/data/runner-context/manifest.json', '/og/default.png', '/icons/icon-192.png',
    ...sitemapLocs.filter((loc) => !cleanSiteUrl(loc)).map(sitePath),
    ...pages.flatMap((p) => p.social['og:image'] || []).map((value) => { try { return new URL(value).pathname; } catch { return null; } }).filter(Boolean)]);
  for (const group of groups) {
    const who = `User-agent: ${group.agents.join(', ')}`;
    if (group.rules.some((r) => r.type === 'disallow' && r.path === '/')) fail('robots-txt', 'robots.txt', `${who} disallows /`);
    const blocked = [...mustAllow].filter((target) => !robotsAllows(group.rules, target));
    if (blocked.length) fail('robots-txt', 'robots.txt', `${who} blocks ${blocked.length} path(s) that must stay crawlable, e.g. ${blocked.slice(0, 4).join(', ')}`);
    if (group.agents.includes('*')) {
      for (const folder of ROBOTS_DISALLOW) if (robotsAllows(group.rules, folder + 'example.json')) fail('robots-txt', 'robots.txt', `${who} does not block ${folder} (ROBOTS_DISALLOW)`);
    }
  }
})();

// ---------- Report ----------

const failed = [...failures].filter(([, list]) => list.length);
const warned = [...warnings].filter(([, list]) => list.length);
const noindexCount = pages.filter((p) => !p.notFound && expectNoindex(p)).length;
const aliasCount = indexable.filter((p) => routes.canonicalPathFor(p.path) !== p.path).length;
const outLabel = OUT === ROOT || OUT.startsWith(ROOT + path.sep) ? path.relative(ROOT, OUT) || '.' : OUT;
console.log(`verify-seo: ${outLabel}/ has ${pages.length} HTML pages (${indexable.length - aliasCount} indexable, ${aliasCount} aliases, ${noindexCount} noindex, ${pages.filter((p) => p.notFound).length} not-found); sitemap lists ${sitemapLocs.length} URLs; finishesM() = ${FINISHES_M}.\n`);

function printGroup(kind, key, title, list) {
  const pagesHit = new Set(list.map((item) => item.page)).size;
  console.log(`${kind}  ${key}: ${title}`);
  console.log(`      ${list.length} problem${list.length === 1 ? '' : 's'} on ${pagesHit} page${pagesHit === 1 ? '' : 's'}`);
  const shown = SHOW_ALL ? list : list.slice(0, LIMIT);
  for (const item of shown) console.log(`      - ${item.page}: ${item.message}`);
  if (shown.length < list.length) console.log(`      … and ${list.length - shown.length} more (run with --all to list them)`);
  console.log('');
}
for (const [key, list] of failed) printGroup('FAIL', key, CHECKS[key], list);
for (const [key, list] of warned) printGroup('WARN', key, WARNINGS[key], list);
for (const key of Object.keys(CHECKS)) if (!failures.get(key).length) console.log(`PASS  ${key}: ${CHECKS[key]}`);

const problemCount = failed.reduce((sum, [, list]) => sum + list.length, 0);
console.log(failed.length
  ? `\nverify-seo failed: ${failed.length} of ${Object.keys(CHECKS).length} checks (${problemCount} problems): ${failed.map(([key]) => key).join(', ')}.`
  : `\nverify-seo passed: all ${Object.keys(CHECKS).length} checks${warned.length ? `, with warnings in ${warned.map(([key]) => key).join(', ')}` : ''}.`);
process.exit(failed.length ? 1 : 0);
