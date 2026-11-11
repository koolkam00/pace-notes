#!/usr/bin/env node
/**
 * Search and social metadata checks on the static export (plan G1, docs/SEO.md).
 *
 *   npm run build && npm run verify:seo
 *   node scripts/verify-seo.cjs --out <dir>   check another export folder (default: out/)
 *   node scripts/verify-seo.cjs --all         list every page in each failed group (default: the first 25)
 *   node scripts/verify-seo.cjs --today YYYY-MM-DD   the date a sitemap lastmod may not pass (default: today, UTC)
 *   node scripts/verify-seo.cjs --self-test   only the built-in fixtures (the banned-words patterns); no export needed
 *
 * The route policy comes from lib/seo-routes.ts (NOINDEX, the moved addresses, sitemapEntries()), loaded with the same
 * TypeScript require hook as scripts/verify-units.cjs, and the finish count from finishesM() in lib/seo.tsx. The 308s
 * come from vercel.json, matched here the way Vercel matches them (a local redirect table), against movedTo().
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
const SELF_TEST_ONLY = args.includes('--self-test');
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
// The cards scripts/build-og-images.cjs makes (no browser needed), as image paths: /og/tools/qualifying/boston.png.
const { plannedCards, cardStamp, sectionLabel } = require(path.join(ROOT, 'scripts/build-og-images.cjs'));
const PLANNED_CARDS = new Set(plannedCards().map((file) => `/og/${file}`));
const { SITE_URL, NOINDEX, FORWARD_ONLY, ROBOTS_DISALLOW } = routes;
const MOVED_PAGES = routes.movedPages();
const MOVED_TEXT = 'This page has moved';
const SITE_HOST = new URL(SITE_URL).host;
const OLD_HOST = 'htw-live-study.vercel.app';
const FINISHES_M = finishesM();

// ---------- Results ----------

const CHECKS = {
  'head-tags': 'Each page (404 excepted) has one non-empty <title>, one meta description and one <h1>',
  'robots-meta': 'noindex exactly on NOINDEX, the moved addresses\' stubs and 404, with no conflicting robots tags',
  canonical: 'Indexable pages have one clean canonical on the production host, equal to canonicalPathFor(); noindex pages have none',
  stubs: 'Every moved address (movedPages()) has a stub: the H1 "This page has moved", a link to its target, the forward, og:url on the target, no JSON-LD; every target is built and indexable, with its #anchor',
  redirects: `vercel.json 308s every moved address but the forward-only ones to its target, first match winning, and redirects no page in the sitemap; on ${OLD_HOST} it 308s the root and every address to the same path on the production host (a local redirect table)`,
  'moved-links': 'No page links a moved address: every link goes straight to where the page moved',
  'social-tags': 'Indexable pages have og:title, og:description, og:image, twitter:card, and og:url equal to the canonical',
  'og-image': 'Every og:image and twitter:image is a file in the export, on the production host, 1200x630',
  duplicates: 'Indexable pages have unique titles and descriptions',
  sitemap: 'sitemap.xml parses, lists exactly the indexable self-canonical pages (sitemapEntries()), with honest lastmod dates',
  'robots-txt': 'robots.txt names the sitemap and blocks only the runner-name folders, in every group (a crawler obeys only the group that names it)',
  'json-ld': 'JSON-LD parses, uses schema.org, names no Person but Andrew Kam (without a URL), none on /runners, breadcrumbs 1..n on the host',
  article: 'Every story and analysis page carries one Article whose headline is the page\'s H1; wherever a page has an Article, og:type is "article", url and mainEntityOfPage are the canonical, the image is the og:image, each date equals its Open Graph tag and dateModified is the later of datePublished and the page\'s sitemap lastmod; no other page says og:type "article"',
  'banned-words': '"the wall", "arithmetic" and "your chance" (also with up to two words between, as in "your personal chance") appear nowhere: visible text, alt text, metadata or JSON-LD',
  fastest: '"fastest" is in no title, description, H1 or og/twitter tag',
  'runner-counts': 'Titles and descriptions count finishes, never runners',
  'personal-data': 'No q= in a canonical, og:url, the sitemap or JSON-LD; /runners is noindex; NOINDEX and ROBOTS_DISALLOW keep the personal pages and runner-name folders',
  'units-links': 'No internal link in the static HTML carries units=mi (the default unit)',
  'old-host': `${OLD_HOST} is in no <head>`,
  'finish-counts': `Every "N.N million" or "N.NM" in a title or description equals finishesM() ("${FINISHES_M}")`,
  orphans: 'Every story and analysis page is linked from /research, and every other sitemap page from at least one other page',
  'hub-counts': 'A hub whose line counts its pages ("Ten stories, one finding each.") lists that many and says the same count in its meta description and og:description; the count in the title and descriptions of /analyses and in the label of its share card (the PNG\'s stamp) is the number of analyses it lists',
  'course-elevation': 'A course page names elevation in its title, description and their og/twitter copies exactly when it prints the route\'s climb; the title and descriptions of /courses count the rows it lists and the rows that print a climb, and a row prints a climb exactly when its course page does',
  'home-form': "The home page's course list (#home-plan-course) has the planner's options (#plan-course), values and names in the same order",
  'title-brand': 'Every title ends " | Pace Notes", or names the brand itself, unless the suffix would take it past 60 characters (one rule for every page: courseTitle() and docs/SEO.md)',
  headers: 'vercel.json sends every address Referrer-Policy strict-origin, X-Content-Type-Options nosniff and the Permissions-Policy of scripts/lib/headers.cjs, which turns off only features no file in app/, components/ or lib/ uses and never clipboard-write or web-share',
  'methods-anchors': 'Every /methodology#<id> link (in the exported HTML, and as a literal in app/, components/ or lib/) and every #<id> link on /methodology names an element id on /methodology',
};
const WARNINGS = {
  'title-length': 'Titles over 60 characters',
  'description-length': 'Descriptions over 155 characters',
  'og-image-fallback': 'Pages that use a less specific share card than the one scripts/build-og-images.cjs makes for them (run npm run og:images)',
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

const parsePage = (file) => parseHtml(fs.readFileSync(path.join(OUT, file), 'utf8'), file);
function parseHtml(html, file) {
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

// ---------- Banned wording ----------

/**
 * Wording the site never uses. "your chance" covers every form: "your chances", and up to two words between
 * ("your personal chance", "your own personal chances"). Words are letters, digits, hyphens and apostrophes, so the
 * pattern does not reach across a sentence ("your race. Chance …").
 */
const BANNED = [
  [/\bthe\s+wall\b/i, '"the wall" (say "sustained slowdown")'],
  [/arithmetic/i, '"arithmetic"'],
  [/\byour\s+(?:[\p{L}\p{N}’'-]+\s+){0,2}chances?\b/iu, '"your chance"'],
];

/** The texts of a page that must not carry banned wording: metadata, the H1, visible text and alt/title/aria-label text. */
function pageTexts(page) {
  const metaTexts = [
    ['title', page.titles.join(' ')],
    ['description', page.descriptions.join(' ')],
    ...Object.entries(page.social).filter(([key]) => /:(title|description|image:alt|site_name)$/.test(key)).map(([key, values]) => [key, values.join(' ')]),
  ];
  return { metaTexts, sources: [...metaTexts, ['h1', page.h1.join(' ')], ['visible text', page.visible], ['alt/title/aria-label', page.attributeText.join(' | ')]] };
}

/** Each banned pattern's first hit in each of a page's texts: { label, source, text }. */
function bannedHits(page) {
  const hits = [];
  for (const [pattern, label] of BANNED) {
    for (const [source, text] of pageTexts(page).sources) {
      const match = pattern.exec(text);
      if (match) hits.push({ label, source, text: snippet(text, match.index, match[0].length) });
    }
  }
  return hits;
}

// ---------- vercel.json redirects ----------

/**
 * The redirects of vercel.json as Vercel applies them: in order, the first whose source matches wins. Sources use the
 * path-to-regexp forms this site needs (literal segments, :name, :name?, :name+ and :name*, where a starred parameter
 * also matches nothing, so /packs/:id* matches /packs); any other form throws, so an unchecked rule cannot slip in.
 * Rules with a `has` condition (the old host) are left out: they never apply on the site's own host. With a host
 * (November 9, 2026), the table is the one that host answers from: the same rules in the same order, with the rules
 * whose single `has` condition names that host. A starred parameter never matches the bare "/" (Vercel compiles
 * sources in strict mode), so "/:path*" alone leaves a host's root unredirected: the root needs its own "/" rule.
 */
function redirectRules(config, host = null) {
  const onHost = (rule) => host !== null && Array.isArray(rule.has) && rule.has.length === 1 && rule.has[0].type === 'host' && rule.has[0].value === host;
  return (config.redirects || []).filter((rule) => !rule.has || onHost(rule)).map((rule) => {
    const names = [];
    const pattern = rule.source.split('/').slice(1).map((segment) => {
      const param = /^:([A-Za-z_]\w*)([*+?]?)$/.exec(segment);
      if (param) {
        names.push(param[1]);
        return { '': '/([^/]+)', '?': '(?:/([^/]+))?', '+': '((?:/[^/]+)+)', '*': '((?:/[^/]+)*)' }[param[2]];
      }
      if (/[:()*+?\\[\]{}]/.test(segment)) throw new Error(`vercel.json source ${rule.source}: the redirect table does not read this pattern`);
      return '/' + segment.replace(/[.^$|]/g, '\\$&');
    }).join('');
    const status = rule.statusCode ?? (rule.permanent === false ? 307 : 308);
    return { ...rule, status, test: new RegExp(`^${pattern || '/'}$`), names };
  });
}
/** Where a path goes under these rules: { status, location, rule } for the first match, or null. */
function redirectFor(rules, pathname) {
  for (const rule of rules) {
    const match = rule.test.exec(pathname);
    if (!match) continue;
    const values = Object.fromEntries(rule.names.map((name, i) => [name, (match[i + 1] || '').replace(/^\//, '')]));
    const location = rule.destination.replace(/:([A-Za-z_]\w*)[*+?]?/g, (whole, name) => (name in values ? values[name] : whole)).replace(/(.)\/+(?=[?#]|$)/, '$1');
    return { status: rule.status, location, rule };
  }
  return null;
}

/** Fixtures for the banned-words check, run before every check of an export (and alone with --self-test). */
function selfTest() {
  const problems = [];
  // The redirect table: a starred parameter matches nothing or any number of segments, the first rule wins, a host rule
  // is left out, and a pattern the table cannot read throws.
  const fixtureConfig = { redirects: [
    { source: '/:path*', has: [{ type: 'host', value: 'old.example' }], destination: 'https://splithappens.run/:path*', permanent: true },
    { source: '/packs/smyth_htw', destination: '/slowdown', permanent: true },
    { source: '/packs/:id*', destination: '/methodology#downloads', permanent: true },
    { source: '/old/:slug', destination: '/new/:slug', permanent: true },
    { source: '/temp', destination: '/elsewhere', permanent: false },
  ] };
  const fixtureRules = redirectRules(fixtureConfig);
  const whereIn = (rules, pathname) => { const r = redirectFor(rules, pathname); return r ? `${r.status} ${r.location}` : 'none'; };
  const where = (pathname) => whereIn(fixtureRules, pathname);
  for (const [pathname, want] of [['/packs', '308 /methodology#downloads'], ['/packs/r01', '308 /methodology#downloads'], ['/packs/a/b', '308 /methodology#downloads'],
    ['/packs/smyth_htw', '308 /slowdown'], ['/packsx', 'none'], ['/old/x', '308 /new/x'], ['/old', 'none'], ['/old/x/y', 'none'], ['/temp', '307 /elsewhere'], ['/', 'none']]) {
    if (where(pathname) !== want) problems.push(`the redirect table sends ${pathname} to ${where(pathname)}, not ${want}`);
  }
  // The same table on the old host (November 9, 2026): its host rule comes first and keeps the path; "/:path*" alone
  // leaves the root unredirected, a "/" rule in front sends it to the apex, and another host's rule is left out.
  const starOnly = redirectRules(fixtureConfig, 'old.example');
  const withRoot = redirectRules({ redirects: [{ source: '/', has: [{ type: 'host', value: 'old.example' }], destination: 'https://splithappens.run/', permanent: true }, ...fixtureConfig.redirects] }, 'old.example');
  const otherHost = redirectRules(fixtureConfig, 'other.example');
  const hostFixtures = [[starOnly, 'the old host without a root rule', '/', 'none'], [starOnly, 'the old host without a root rule', '/tools', '308 https://splithappens.run/tools'],
    [starOnly, 'the old host without a root rule', '/packs/smyth_htw', '308 https://splithappens.run/packs/smyth_htw'], [withRoot, 'the old host with a root rule', '/', '308 https://splithappens.run'],
    [withRoot, 'the old host with a root rule', '/tools/plan', '308 https://splithappens.run/tools/plan'], [otherHost, 'another host', '/tools', 'none']];
  for (const [rules, label, pathname, want] of hostFixtures) {
    if (whereIn(rules, pathname) !== want) problems.push(`the redirect table on ${label} sends ${pathname} to ${whereIn(rules, pathname)}, not ${want}`);
  }
  try { redirectRules({ redirects: [{ source: '/a/(.*)', destination: '/b' }] }); problems.push('the redirect table read a regular-expression source it cannot check'); } catch { /* expected */ }
  // A Dataset that lists one file twice and names its topic twice is caught three ways (the address, the name, the
  // description); the same Dataset with each file once passes; a download that is no file in the export is caught.
  const download = (name) => ({ '@type': 'DataDownload', name, contentUrl: `${SITE_URL}/data/insights/${name}` });
  const datasetFixtures = [
    ['a Dataset that lists courses.json twice', 3, datasetProblems({ description: 'Files cover finish-time distributions, course pacing profiles, with weather as context, and course pacing profiles, with weather as context.', distribution: [download('finish-times.json'), download('courses.json'), download('courses.json')] }, () => true)],
    ['a Dataset that lists each file once', 0, datasetProblems({ description: 'Files cover finish-time distributions and course pacing profiles, with weather as context. Counts are finishes, not unique runners.', distribution: [download('finish-times.json'), download('courses.json')] }, () => true)],
    ['a Dataset whose download is not in the export', 1, datasetProblems({ distribution: [download('finish-times.json')] }, () => false)],
  ];
  for (const [label, want, found] of datasetFixtures) if (found.length !== want) problems.push(`${label} should give ${want} problem(s); it gave ${found.length}${found.length ? `: ${found.join('; ')}` : ''}`);
  // The analyses hub's counts against the rows it lists: the title's number, a description's opening number or count
  // word, and the share card's label, which must be the one the card script writes for that many analyses.
  const cardLabelled = (eyebrow) => ({ file: '/og/sections/analyses.png', stamp: eyebrow === null ? null : { eyebrow } });
  const hub = (over) => analysesCountProblems({ rows: 11, title: 'Marathon Pacing: 11 Analyses | Pace Notes',
    descriptions: [['description', '11 marathon pacing questions answered.'], ['og:description', 'Eleven marathon pacing questions answered.']],
    card: cardLabelled(sectionLabel('analyses', { analyses: 'eleven' })), ...over });
  const hubFixtures = [
    ['an analyses hub whose counts agree', 0, hub({})],
    ['an analyses hub whose card keeps the typed label', 1, hub({ card: cardLabelled('Analyses · the essential ten') })],
    ['an analyses hub whose card has no stamp', 1, hub({ card: cardLabelled(null) })],
    ['an analyses hub whose title counts ten', 1, hub({ title: 'Marathon Pacing: 10 Analyses | Pace Notes' })],
    ['an analyses hub whose descriptions open on other counts', 2, hub({ descriptions: [['description', '10 marathon pacing questions.'], ['og:description', 'Twelve marathon pacing questions.']] })],
    ['an analyses hub that states no count and has no card', 0, hub({ title: 'Marathon Pacing Analyses | Pace Notes', descriptions: [['description', 'Marathon pacing questions answered.']], card: null })],
    ['an analyses hub that lists thirteen', 0, hub({ rows: 13, title: 'Marathon Pacing: 13 Analyses | Pace Notes', descriptions: [['description', '13 marathon pacing questions.']], card: cardLabelled(sectionLabel('analyses', { analyses: '13' })) })],
  ];
  for (const [label, want, found] of hubFixtures) if (found.length !== want) problems.push(`${label} should give ${want} problem(s); it gave ${found.length}${found.length ? `: ${found.join('; ')}` : ''}`);
  // An Article against its page: the headline is the H1 (a word joiner and a no-break space in the H1 are layout, not
  // words), og:type follows the markup, each date equals its tag and dateModified is the later of the two days.
  const storyUrl = `${SITE_URL}/stories/round-numbers`;
  const storyNode = (over) => ({ '@type': 'Article', headline: 'Finishes crowd in just under 3:00.', url: storyUrl, mainEntityOfPage: storyUrl, image: [`${SITE_URL}/og/stories/round-numbers.png`], datePublished: '2026-10-07', dateModified: '2026-11-05', ...over });
  const article = (over) => articleProblems({ expected: true, nodes: [storyNode({})], h1: ['Finishes crowd in just under 3:00.'], canonical: storyUrl, ogType: 'article',
    ogImage: `${SITE_URL}/og/stories/round-numbers.png`, published: '2026-10-07', modified: '2026-11-05', lastmod: '2026-11-05', ...over });
  const undated = { datePublished: undefined, dateModified: '2026-11-05' };
  const articleFixtures = [
    ['a story whose Article agrees with its page', 0, article({})],
    ['a story whose headline is its short title', 1, article({ nodes: [storyNode({ headline: 'Round numbers' })] })],
    ['an H1 that keeps a range together with a word joiner and a no-break space', 0, article({ nodes: [storyNode({ headline: '41–50°F starts had the fewest sustained slowdowns.' })], h1: ['41–\u206050°F starts had the\u00a0fewest sustained slowdowns.'] })],
    ['an analysis with the day it last changed and no first-published day', 0, article({ nodes: [storyNode(undated)], published: '' })],
    ['an Article published after its sitemap lastmod', 0, article({ nodes: [storyNode({ datePublished: '2026-11-09', dateModified: '2026-11-09' })], published: '2026-11-09', modified: '2026-11-09' })],
    ['an Article whose dateModified is earlier than the sitemap lastmod', 1, article({ nodes: [storyNode({ dateModified: '2026-10-22' })], modified: '2026-10-22' })],
    ['an Article whose dateModified is not its Open Graph tag', 1, article({ modified: '2026-10-22' })],
    ['an Article and tags with no dates on a page the sitemap dates', 1, article({ nodes: [storyNode({ datePublished: undefined, dateModified: undefined })], published: '', modified: '' })],
    ['an Article with no dates under Open Graph tags that give both', 3, article({ nodes: [storyNode({ datePublished: undefined, dateModified: undefined })] })],
    ['an Article on a page that says og:type website', 1, article({ ogType: 'website' })],
    ['an Article whose image is not the og:image', 1, article({ ogImage: `${SITE_URL}/og/default.png` })],
    ['an Article whose url is another page', 2, article({ canonical: `${SITE_URL}/stories/places` })],
    ['a page with two Articles', 1, article({ nodes: [storyNode({}), storyNode({})] })],
    ['a story without an Article', 1, article({ nodes: [], ogType: 'website', published: '', modified: '' })],
    ['a tool page without an Article', 0, article({ expected: false, nodes: [], ogType: 'website', published: '', modified: '' })],
    ['a tool page that says og:type article and dates itself with no Article', 2, article({ expected: false, nodes: [], published: '' })],
  ];
  for (const [label, want, found] of articleFixtures) if (found.length !== want) problems.push(`${label} should give ${want} problem(s); it gave ${found.length}${found.length ? `: ${found.join('; ')}` : ''}`);
  // A course page names elevation exactly when it prints the route's climb, text by text; the hub's counts are its
  // rows and its rows with a climb, and a row prints a climb exactly when its page does.
  const withElevation = [['title', 'Boston Marathon: Elevation, Pacing and Finish Times'], ['description', 'Boston Marathon elevation profile, finish times by year and how 100 finishes paced each 5 km.']];
  const withoutElevation = [['title', 'Dubai Marathon: Pacing and Finish Times by Year'], ['description', 'Dubai Marathon finish times by year and how 100 finishes paced each 5 km.']];
  const hubRows = (n, climbs) => Array.from({ length: n }, (_, i) => ({ path: `/courses/c${i}`, climb: i < climbs }));
  const hubOf = (rows, title, description, prints = new Map(rows.map((row) => [row.path, row.climb]))) => courseHubProblems({ rows, texts: [['title', title], ['description', description]], prints });
  const counted = 'Sustained slowdown, climb, finishes and race-morning weather for 27 marathon courses, with route and elevation for 24.';
  const courseFixtures = [
    ['a course page that prints a climb and names elevation', 0, courseElevationProblems({ texts: withElevation, printsClimb: true })],
    ['a course page that names elevation twice and prints no climb', 2, courseElevationProblems({ texts: withElevation, printsClimb: false })],
    ['a course page that prints no climb and names no elevation', 0, courseElevationProblems({ texts: withoutElevation, printsClimb: false })],
    ['a course page that prints a climb only its description names', 1, courseElevationProblems({ texts: [withoutElevation[0], withElevation[1]], printsClimb: true })],
    ['a course hub whose counts are its rows', 0, hubOf(hubRows(27, 24), 'Marathon Courses: Pacing for 27 Races, Elevation for 24', counted)],
    ['a course hub that counts every route file', 2, hubOf(hubRows(27, 24), 'Marathon Courses: Pacing for 27 Races, Elevation for 26', counted.replace('for 24', 'for 26'))],
    ['a course hub that promises elevation for every race while three rows print none', 1, hubOf(hubRows(27, 24), 'Marathon Courses: Elevation and Pacing for 27 Races', counted)],
    ['a course hub whose every row prints a climb', 0, hubOf(hubRows(27, 27), 'Marathon Courses: Elevation and Pacing for 27 Races', counted.replace('for 24', 'for 27'))],
    ['a course hub that counts two more courses than it lists', 2, hubOf(hubRows(27, 24), 'Marathon Courses: Pacing for 29 Races, Elevation for 24', counted.replace('27 marathon courses', '29 marathon courses'))],
    ['a course hub whose row prints a climb its page does not', 1, hubOf(hubRows(27, 24), 'Marathon Courses: Pacing for 27 Races, Elevation for 24', counted, new Map(hubRows(27, 23).map((row) => [row.path, row.climb])))],
    ['a course hub whose row has no page', 1, hubOf(hubRows(27, 24), 'Marathon Courses: Pacing for 27 Races, Elevation for 24', counted, new Map(hubRows(26, 24).map((row) => [row.path, row.climb])))],
    ['a course hub with no rows', 1, hubOf([], 'Marathon Courses', 'Marathon courses.')],
  ];
  for (const [label, want, found] of courseFixtures) if (found.length !== want) problems.push(`${label} should give ${want} problem(s); it gave ${found.length}${found.length ? `: ${found.join('; ')}` : ''}`);
  // robots.txt: every group must block the folders, because a crawler obeys only the most specific group naming it.
  const folders = ['/data/runners/index/', '/data/runners/profiles/'];
  const everyone = 'User-agent: *\nAllow: /\nDisallow: /data/runners/index/\nDisallow: /data/runners/profiles/\n';
  const robotsFixtures = [
    ['a robots.txt whose one group blocks both folders', 0, everyone],
    ['a robots.txt whose named group repeats neither block', 2, `${everyone}\nUser-agent: GPTBot\nAllow: /\n`],
    ['a robots.txt whose named groups repeat one block', 1, `${everyone}\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nAllow: /\nDisallow: /data/runners/index/\n`],
    ['a robots.txt whose named group repeats both blocks', 0, `${everyone}\nUser-agent: GPTBot\nDisallow: /data/runners/\n`],
    ['a robots.txt whose * group blocks nothing', 2, 'User-agent: *\nAllow: /\n'],
  ];
  for (const [label, want, text] of robotsFixtures) {
    const found = robotsUnblocked(robotsGroups(text).groups, folders);
    if (found.length !== want) problems.push(`${label} should leave ${want} folder(s) crawlable; it left ${found.length}${found.length ? `: ${found.map(([who, folder]) => `${who} ${folder}`).join('; ')}` : ''}`);
  }
  const yourChance = BANNED.find(([, label]) => label === '"your chance"')[0];
  const caught = ['your chance', 'your chances', 'Your Chance', 'your personal chance', 'your own personal chances', 'your best possible chance', 'what are your\nreal chances'];
  const allowed = ['your race. Chance plays no part', 'your three extra words chance', 'yourchance', 'your chancellor', 'a chance for you'];
  for (const text of caught) if (!yourChance.test(text)) problems.push(`"your chance" pattern misses ${JSON.stringify(text)}`);
  for (const text of allowed) if (yourChance.test(text)) problems.push(`"your chance" pattern wrongly catches ${JSON.stringify(text)}`);
  const fixture = parseHtml(`<!doctype html><html><head><title>Fixture | Pace Notes</title>
    <meta name="description" content="What is your personal chance of a sub-4 finish?"><meta property="og:title" content="Your chances | Pace Notes"></head>
    <body><h1>Fixture</h1><p>Read <em>your own personal</em> chances here.</p><img src="/x.png" alt="your best possible chance"><p>Pick your race. Chance plays no part.</p></body></html>`, 'fixture.html');
  const hits = bannedHits(fixture).filter((hit) => hit.label === '"your chance"').map((hit) => hit.source).sort();
  const want = ['alt/title/aria-label', 'description', 'og:title', 'visible text'];
  if (JSON.stringify(hits) !== JSON.stringify(want)) problems.push(`the fixture page should hit "your chance" in ${want.join(', ')}; it hit ${hits.join(', ') || 'nothing'}`);
  if (problems.length) {
    console.error(`verify-seo self-test failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  return `${caught.length + allowed.length} pattern fixtures, a fixture page, ${10 + hostFixtures.length} redirect fixtures, ${datasetFixtures.length} Dataset fixtures, ${hubFixtures.length} hub-count fixtures, ${articleFixtures.length} Article fixtures, ${courseFixtures.length} course-elevation fixtures and ${robotsFixtures.length} robots fixtures`;
}
const SELF_TEST = selfTest();
if (SELF_TEST_ONLY) { console.log(`verify-seo self-test passed: ${SELF_TEST}.`); process.exit(0); }

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
  if (noindexExpected && !noindexFound) fail('robots-meta', where, `should be noindex (${page.notFound ? '404' : NOINDEX.includes(page.path) ? 'NOINDEX' : 'a moved address'}) but robots says "${page.robots.join(' | ') || 'nothing'}"`);
  if (!noindexExpected && noindexFound) fail('robots-meta', where, `is noindex but lib/seo-routes.ts says it is indexable (robots "${page.robots.join(' | ')}")`);
  if (!page.notFound && page.robots.length > 1 && page.robots.some((r) => /\bnoindex\b/i.test(r)) && page.robots.some((r) => /(^|[\s,])index\b/i.test(r) && !/\bnoindex\b/i.test(r))) {
    fail('robots-meta', where, `conflicting robots tags: ${page.robots.map((r) => `"${r}"`).join(' and ')}`);
  }
  if (noindexExpected && noindexFound && page.robots.some((r) => /\bnofollow\b/i.test(r))) warn('policy', where, 'noindex page also says nofollow; the policy is noindex, follow');

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
    // The most specific card the script makes for this page: its own card (a story, tool, goal page, qualifying race,
    // course or /finish-times), else the parent tool's or the section's. Pages with none (about, …) use the default.
    const own = ogImageCandidates(page.path).find((candidate) => PLANNED_CARDS.has(candidate)) ?? null;
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
  const { metaTexts } = pageTexts(page);
  const headline = [['title', page.title], ['description', page.descriptions[0] || ''], ...metaTexts.filter(([key]) => /^(og|twitter):(title|description)$/.test(key))];

  for (const hit of bannedHits(page)) fail('banned-words', where, `${hit.label} in ${hit.source}: ${hit.text}`);
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
  checkJsonLd(page, where, BANNED);

  // The brand: one ending for every title, dropped only where it would not fit (release, October 20, 2026).
  if (!page.notFound && page.title && !/Pace Notes/.test(page.title) && chars(`${page.title} | Pace Notes`) <= 60) fail('title-brand', where, `"${page.title}" would fit 60 characters with " | Pace Notes"`);
  if (!page.notFound && page.title && / \| Pace Notes$/.test(page.title) && /Pace Notes.* \| Pace Notes$/.test(page.title)) fail('title-brand', where, `"${page.title}" names the brand twice`);

  // Length warnings
  if (!page.notFound && page.title && chars(page.title) > 60) warn('title-length', where, `${chars(page.title)} characters: "${page.title}"`);
  if (!page.notFound && page.descriptions[0] && chars(page.descriptions[0]) > 155) warn('description-length', where, `${chars(page.descriptions[0])} characters`);
}

function checkJsonLd(page, where, banned) {
  const NOTHING_HERE = ['/privacy', '/request-analysis'];
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
      if (types.includes('Dataset')) checkDataset(node, where, label);
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

/**
 * A Dataset lists each download once, each download on the site is a file in the export, and its description repeats
 * no clause (November 9, 2026: two stories share courses.json, so /methodology listed the file twice and named its
 * topic twice in the description).
 */
function datasetProblems(node, fileExists) {
  const problems = [];
  const downloads = node.distribution === undefined ? [] : [].concat(node.distribution);
  for (const key of ['contentUrl', 'name']) {
    const values = downloads.map((download) => download && download[key]).filter((value) => typeof value === 'string');
    const repeated = [...new Set(values.filter((value, i) => values.indexOf(value) !== i))];
    if (repeated.length) problems.push(`Dataset distribution repeats the ${key} ${repeated.join(', ')}`);
  }
  for (const download of downloads) {
    const url = download && download.contentUrl;
    if (typeof url !== 'string' || !url) { problems.push(`Dataset download ${JSON.stringify(download && download.name)} has no contentUrl`); continue; }
    if (!url.startsWith(`${SITE_URL}/`)) continue;
    let pathname = null;
    try { pathname = decodeURIComponent(new URL(url).pathname); } catch { /* reported below */ }
    if (pathname === null || !fileExists(pathname)) problems.push(`Dataset download ${url} is not a file in the export`);
  }
  if (typeof node.description === 'string') {
    const clauses = node.description.split(/[.;:,](?:\s+|$)|\s+and\s+/).map((clause) => clause.trim().toLowerCase().replace(/^and\s+/, '')).filter((clause) => clause.split(/\s+/).length >= 3);
    const repeated = [...new Set(clauses.filter((clause, i) => clauses.indexOf(clause) !== i))];
    if (repeated.length) problems.push(`Dataset description says "${repeated[0]}" more than once`);
  }
  return problems;
}
function checkDataset(node, where, label) {
  const inExport = (pathname) => { const file = path.join(OUT, pathname); return file.startsWith(OUT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile(); };
  for (const problem of datasetProblems(node, inExport)) fail('json-ld', where, `${label}: ${problem}`);
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

for (const listed of NOINDEX) {
  if (!byPath.has(listed)) warn('policy', listed, 'is in NOINDEX but has no page in the export');
}
if (!pages.some((p) => p.notFound)) fail('robots-meta', '404', 'the export has no 404.html');
const runners = byPath.get('/runners');
if (!runners) fail('personal-data', '/runners', 'no /runners page in the export to check');
else if (!hasNoindex(runners)) fail('personal-data', '/runners', 'is not noindex; runner lookups must never be indexable');
// Privacy floors written here rather than read from lib/seo-routes.ts, so editing that file (which autopilot pull
// requests may do) cannot loosen them: the runner-name folders stay out of robots.txt and the personal pages noindex.
for (const folder of ['/data/runners/index/', '/data/runners/profiles/']) if (!ROBOTS_DISALLOW.includes(folder)) fail('personal-data', 'lib/seo-routes.ts', `ROBOTS_DISALLOW no longer lists ${folder} (it holds recorded runner names)`);
for (const page of ['/runners', '/your-race']) if (!NOINDEX.includes(page)) fail('personal-data', 'lib/seo-routes.ts', `NOINDEX no longer lists ${page} (a personal lookup page)`);

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

// ---------- Orphaned pages ----------

(function checkOrphans() {
  const target = (href) => {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('//')) return null;
    let url;
    try { url = new URL(href, SITE_URL + '/'); } catch { return null; }
    if (url.host !== SITE_HOST) return null;
    try { return decodeURIComponent(url.pathname.replace(/\/$/, '')) || '/'; } catch { return null; }
  };
  const inbound = new Map();
  for (const page of pages) {
    if (page.notFound) continue;
    for (const href of page.hrefs) {
      const to = target(href);
      if (!to || to === page.path) continue;
      if (!inbound.has(to)) inbound.set(to, new Set());
      inbound.get(to).add(page.path);
    }
  }
  let listed = [];
  try { listed = routes.sitemapEntries().map((e) => e.path); } catch { /* reported by the sitemap check */ }
  const hub = byPath.get('/research');
  if (!hub) fail('orphans', '/research', 'no research hub in the export');
  for (const path of listed) {
    const from = inbound.get(path) || new Set();
    if (/^\/(stories|analyses)\/[^/]+$/.test(path)) { if (hub && !from.has('/research')) fail('orphans', path, 'is not linked from /research'); }
    else if (path !== '/' && !from.size) fail('orphans', path, 'no other page in the export links to it');
  }
})();

// ---------- Hub counts ----------

/**
 * Problems with the counts /analyses states, against the rows it lists: the number before "Analyses" in its title, the
 * number or count word a description opens on, and its share card's label (the PNG's stamp), which must be the label
 * scripts/build-og-images.cjs writes for that many analyses. A text that states no count gives no problem; a card
 * without a stamp cannot be read, so it is one. Until November 9, 2026 the card's count was typed ("the essential ten"
 * while the hub listed eleven) and no check read a card.
 */
function analysesCountProblems({ rows, title, descriptions, card }) {
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const problems = [];
  const inTitle = /(\d+)\s+analyses\b/i.exec(title);
  if (inTitle && Number(inTitle[1]) !== rows) problems.push(`its title counts ${inTitle[1]} analyses but it lists ${rows}`);
  for (const [label, text] of descriptions) {
    const first = text.trim().split(/\s+/)[0] || '';
    const said = /^\d+$/.test(first) ? Number(first) : WORDS.indexOf(first.toLowerCase());
    if (said >= 0 && said !== rows) problems.push(`its ${label} opens on "${first}" but it lists ${rows}`);
  }
  if (card) {
    // As countWord() in lib/nuggets/format.ts writes a count: in words to twelve, in figures from 13.
    const want = sectionLabel('analyses', { analyses: WORDS[rows] ?? String(rows) });
    if (!card.stamp) problems.push(`its share card ${card.file} has no stamp, so its label cannot be read (run npm run og:images)`);
    else if (card.stamp.eyebrow !== want) problems.push(`its share card ${card.file} is labelled "${card.stamp.eyebrow}", not "${want}": it lists ${rows} (run npm run og:images)`);
  }
  return problems;
}

(function checkHubCounts() {
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  let counted = 0;
  const analyses = byPath.get('/analyses');
  if (analyses) {
    const cardFile = '/og/sections/analyses.png';
    const exported = path.join(OUT, cardFile);
    let card = null;
    if (fs.existsSync(exported)) { try { card = { file: cardFile, stamp: cardStamp(exported) }; } catch (error) { fail('hub-counts', '/analyses', `its share card ${cardFile} cannot be read: ${error.message}`); } }
    const found = analysesCountProblems({ rows: (analyses.html.match(/class="page-list-row"/g) || []).length, title: analyses.title,
      descriptions: [['description', analyses.descriptions[0] ?? ''], ['og:description', (analyses.social['og:description'] || [])[0] ?? '']], card });
    for (const problem of found) fail('hub-counts', '/analyses', problem);
  }
  for (const hub of ['/stories', '/analyses', '/tools']) {
    const page = byPath.get(hub);
    if (!page) continue;
    const dek = /<p class="contents-dek">([\s\S]*?)<\/p>/.exec(page.html);
    const first = dek ? textOf(dek[1]).trim().split(/\s+/)[0].toLowerCase() : '';
    const n = WORDS.indexOf(first);
    if (n < 0) continue;
    counted++;
    const rows = (page.html.match(/class="page-list-row"/g) || []).length;
    if (rows !== n) fail('hub-counts', hub, `its line says ${first} but it lists ${rows}`);
    for (const [label, text] of [['description', page.descriptions[0] ?? ''], ['og:description', (page.social['og:description'] || [])[0] ?? '']]) {
      const said = (text.trim().split(/\s+/)[0] || '').toLowerCase();
      if (WORDS.includes(said) && said !== first) fail('hub-counts', hub, `its ${label} opens on "${said}", its line on "${first}"`);
    }
  }
  if (!counted) fail('hub-counts', '/stories', 'no hub line with a count was found (the check reads <p class="contents-dek">)');
})();

// ---------- Article markup ----------

/**
 * Problems with a page's Article markup, read against the page itself: the headline is the page's one H1 (the sentence a
 * visitor reads first), `url` and `mainEntityOfPage` are the canonical, the image is the page's og:image, og:type is
 * "article" exactly where the page has an Article, each date equals its Open Graph tag, and dateModified is the later of
 * datePublished and the page's sitemap lastmod, so the sitemap, the tag and the markup give one day. `expected` is true
 * for a story or an analysis, which must carry one. Until November 9, 2026 a story's headline was its short title
 * ("Round numbers") while its H1 stated the finding, and an analysis carried no Article and no machine-readable date.
 */
function articleProblems({ expected, nodes, h1, canonical, ogType, ogImage, published, modified, lastmod }) {
  const problems = [];
  // The H1 keeps a range on one line with a word joiner (U+2060) and no-break spaces: layout, not words.
  const flat = (text) => String(text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  if (!nodes.length) {
    if (expected) problems.push('has no Article markup; every story and analysis carries one (articleLd() in lib/seo.tsx)');
    if (ogType === 'article') problems.push('says og:type "article" but has no Article markup');
    for (const [tag, value] of [['article:published_time', published], ['article:modified_time', modified]]) if (value) problems.push(`has ${tag} ${value} but no Article markup`);
    return problems;
  }
  if (nodes.length > 1) problems.push(`has ${nodes.length} Article nodes; a page has one`);
  const node = nodes[0];
  if (ogType !== 'article') problems.push(`has Article markup but og:type is "${ogType || 'missing'}", not "article"`);
  if (typeof node.headline !== 'string' || !flat(node.headline)) problems.push('its Article has no headline');
  else if (h1.length !== 1) problems.push(`its Article headline cannot be read against ${h1.length} <h1> elements`);
  else if (flat(node.headline) !== flat(h1[0])) problems.push(`its Article headline "${flat(node.headline)}" is not the page's H1 "${flat(h1[0])}"`);
  for (const key of ['url', 'mainEntityOfPage']) {
    const value = node[key] && typeof node[key] === 'object' ? node[key]['@id'] : node[key];
    // The same page with or without a closing slash (samePage, below, is not yet defined when the self-test runs).
    if (typeof value !== 'string' || !canonical || value.replace(/\/$/, '') !== canonical.replace(/\/$/, '')) problems.push(`its Article's ${key} is ${JSON.stringify(value)}, not the canonical ${canonical || '(none)'}`);
  }
  const first = [].concat(node.image ?? [])[0];
  const image = first && typeof first === 'object' ? first.url : first;
  if (typeof image !== 'string' || image !== ogImage) problems.push(`its Article's image is ${JSON.stringify(image)}, not the page's og:image ${ogImage || '(none)'}`);
  for (const [key, tag, tagValue] of [['datePublished', 'article:published_time', published], ['dateModified', 'article:modified_time', modified]]) {
    const value = node[key];
    if (value !== undefined && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value) || !Number.isFinite(Date.parse(value)))) problems.push(`its Article's ${key} ${JSON.stringify(value)} is not an ISO 8601 date`);
    else if ((value ?? '') !== (tagValue || '')) problems.push(`its Article's ${key} is ${value ?? 'left out'} but ${tag} is ${tagValue || 'left out'}`);
  }
  const days = [node.datePublished, lastmod].filter((day) => typeof day === 'string' && day).sort();
  const want = days.length ? days[days.length - 1] : undefined;
  if (node.dateModified !== want) problems.push(`its Article's dateModified is ${node.dateModified ?? 'left out'}, not ${want ?? 'left out'}: the later of its datePublished (${node.datePublished ?? 'none'}) and the page's sitemap lastmod (${lastmod ?? 'none'})`);
  return problems;
}

(function checkArticles() {
  let lastmods = new Map();
  try { lastmods = new Map(routes.sitemapEntries().map((entry) => [entry.path, entry.lastmod])); } catch { /* reported by the sitemap check */ }
  const isArticle = (type) => typeof type === 'string' && /Article$|^BlogPosting$/.test(type);
  let found = 0;
  for (const page of pages) {
    if (page.notFound) continue;
    const nodes = [];
    const collect = (node) => {
      if (Array.isArray(node)) { node.forEach(collect); return; }
      if (!node || typeof node !== 'object') return;
      if ([].concat(node['@type'] || []).some(isArticle)) nodes.push(node);
      Object.values(node).forEach(collect);
    };
    for (const raw of page.jsonLd) { try { collect(JSON.parse(raw)); } catch { /* reported by the json-ld check */ } }
    if (nodes.length) found++;
    const one = (key) => (page.social[key] || []).find((value) => value.trim()) || '';
    const expected = /^\/(stories|analyses)\/[^/]+$/.test(page.path) && !expectNoindex(page);
    for (const problem of articleProblems({ expected, nodes, h1: page.h1, canonical: page.canonicals[0], ogType: one('og:type'), ogImage: one('og:image'),
      published: one('article:published_time'), modified: one('article:modified_time'), lastmod: lastmods.get(page.path) })) fail('article', page.path, problem);
  }
  if (!found) fail('article', '/stories', 'no page in the export carries Article markup: the check found nothing to read');
})();

// ---------- Course pages: elevation promised and printed ----------

/**
 * Problems with a course page's promise of elevation: each of its titles and descriptions names elevation exactly when
 * the page prints the route's climb (a whole-route climb total, the figure scripts/verify-courses.cjs recounts). Until
 * November 9, 2026 the promise followed the route file alone, so New York and Dubai, whose profiles read the water
 * under a bridge and print no climb, were titled "Elevation, Pacing and Finish Times".
 */
function courseElevationProblems({ texts, printsClimb }) {
  const problems = [];
  for (const [label, text] of texts) {
    const names = /\belevation\b/i.test(text);
    if (names && !printsClimb) problems.push(`its ${label} names elevation but the page prints no climb for the route: "${text}"`);
    if (!names && printsClimb) problems.push(`the page prints the route's climb but its ${label} does not name elevation: "${text}"`);
  }
  return problems;
}

/**
 * Problems with the counts /courses states, against its rows: "for N races" and "for N marathon courses" count the
 * rows, "elevation for N" the rows that print a climb, and "Elevation and Pacing for N Races" needs a climb on every
 * row. A row prints a climb exactly when its course page does (`prints`: the page's answer by path). A text that
 * states no count gives no problem. Until November 9, 2026 the hub counted every route file (26) while 24 rows printed
 * a climb.
 */
function courseHubProblems({ rows, texts, prints }) {
  const problems = [];
  if (!rows.length) return ['lists no course row (the check reads <a class="course-index-row">)'];
  const climbs = rows.filter((row) => row.climb).length;
  for (const [label, text] of texts) {
    const listed = /\bfor (\d+) (?:races|marathon courses)\b/i.exec(text);
    if (listed && Number(listed[1]) !== rows.length) problems.push(`its ${label} counts ${listed[1]} courses but it lists ${rows.length}`);
    const elevation = /\belevation for (\d+)\b/i.exec(text);
    if (elevation && Number(elevation[1]) !== climbs) problems.push(`its ${label} counts elevation for ${elevation[1]} but ${climbs} of its ${rows.length} rows print a climb`);
    if (/\belevation and pacing for \d+ races\b/i.test(text) && climbs !== rows.length) problems.push(`its ${label} promises elevation for every race but ${rows.length - climbs} of its ${rows.length} rows print no climb`);
  }
  for (const row of rows) {
    if (!prints.has(row.path)) problems.push(`its row for ${row.path} has no indexable course page in the export`);
    else if (prints.get(row.path) !== row.climb) problems.push(`its row for ${row.path} ${row.climb ? 'prints a climb but the page prints none' : 'prints no climb but the page prints one'}`);
  }
  return problems;
}

(function checkCourseElevation() {
  const textsOf = (page) => [['title', page.title], ['description', page.descriptions[0] ?? ''],
    ...['og:title', 'og:description', 'twitter:title', 'twitter:description'].map((key) => [key, (page.social[key] || [])[0] ?? ''])].filter(([, text]) => text.trim());
  const prints = new Map();
  for (const page of indexable.filter((p) => /^\/courses\/[^/]+$/.test(p.path))) {
    const keys = [...stripScripts(page.html).matchAll(/<data\b[^>]*>/gi)].map((m) => attributes(m[0])['data-k'] ?? '');
    prints.set(page.path, keys.some((key) => /^(?:geo|route|cg)\.gain$/.test(key)));
    for (const problem of courseElevationProblems({ texts: textsOf(page), printsClimb: prints.get(page.path) })) fail('course-elevation', page.path, problem);
  }
  if (!prints.size) fail('course-elevation', '/courses', 'no course page in the export: the check found nothing to read');
  else if (![...prints.values()].some(Boolean)) fail('course-elevation', '/courses', 'no course page prints a climb (the check reads <data data-k="route.gain"> and "geo.gain")');
  const hub = byPath.get('/courses');
  if (!hub) { fail('course-elevation', '/courses', 'no /courses page in the export'); return; }
  const rows = [...stripScripts(hub.html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => [attributes(`<a${m[1]}>`), m[2]])
    .filter(([anchor]) => (anchor.class || '').split(/\s+/).includes('course-index-row'))
    .map(([anchor, inner]) => {
      const cell = /<span class="f-climb">([\s\S]*?)<\/span>/.exec(inner);
      if (!cell) fail('course-elevation', '/courses', `its row for ${anchor.href} has no climb cell (<span class="f-climb">)`);
      return { path: (anchor.href || '').split(/[?#]/)[0], climb: !!cell && /\d/.test(textOf(cell[1])) };
    });
  for (const problem of courseHubProblems({ rows, texts: textsOf(hub), prints })) fail('course-elevation', '/courses', problem);
})();

// ---------- Moved addresses: stubs, redirects and links ----------

/** Addresses vercel.json redirects that have no page and no stub: the old goal-pace index and a course no longer built. */
const REDIRECT_ONLY = { '/tools/marathon-pace': '/tools/marathon-pace-chart', '/courses/melbourne': '/courses', '/courses/vienna': '/courses' };

const linkPath = (href, from) => {
  if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('//')) return null;
  let url;
  try { url = new URL(href, SITE_URL + (from === '/' ? '/' : from)); } catch { return null; }
  if (url.host !== SITE_HOST) return null;
  try { return decodeURIComponent(url.pathname.replace(/\/$/, '')) || '/'; } catch { return null; }
};
const idsOf = (page) => new Set([...page.html.matchAll(/<[a-z][\w:-]*\b[^>]*\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => decode(m[1] ?? m[2])));
/** The tabs a page opens from its address's hash (components/analysis/WeatherTabs.client.tsx: a panel's data-tab). */
const tabsOf = (page) => new Set([...page.html.matchAll(/\bdata-tab\s*=\s*"([^"]*)"/gi)].map((m) => decode(m[1])));
/** The arguments of a stub's forward (components/LegacyAnalysisLink.tsx): [to, guides, base path], or null without one. */
const forwardOf = (page) => {
  const scripts = [...page.html.matchAll(/<script\b[^>]*\bdata-forward\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const call = scripts.length === 1 ? /\}\)\(([\s\S]*)\)\s*$/.exec(scripts[0][1]) : null;
  try { return call ? JSON.parse(`[${call[1]}]`) : null; } catch { return null; }
};
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

(function checkStubs() {
  for (const page of pages) {
    if (page.notFound) continue;
    let to = null;
    try { to = routes.movedTo(page.path); } catch { continue; }
    if (to && !MOVED_PAGES.includes(page.path)) fail('stubs', page.path, `is a moved address (to ${to}) that movedPages() does not list`);
  }
  for (const from of MOVED_PAGES) {
    const to = routes.movedTo(from);
    if (!to) { fail('stubs', from, 'is in movedPages() but movedTo() gives it no target'); continue; }
    const [toPath, toHash] = to.split('#');
    const page = byPath.get(from);
    if (!page) { fail('stubs', from, `has no stub in the export: a host that cannot redirect would show the 404 instead of ${to}`); continue; }
    if (page.h1.length !== 1 || page.h1[0] !== MOVED_TEXT) fail('stubs', from, `its H1 is ${JSON.stringify(page.h1.join(' | '))}, not "${MOVED_TEXT}"`);
    if (!page.hrefs.some((href) => href === to || href.startsWith(to + '?'))) fail('stubs', from, `has no visible link to ${to}`);
    const forward = forwardOf(page);
    if (!forward) fail('stubs', from, 'has no forward (one <script data-forward> from components/LegacyAnalysisLink.tsx)');
    else {
      const [forwardTo, guides, base] = forward;
      if (forwardTo !== to) fail('stubs', from, `forwards to ${forwardTo}, not ${to}`);
      if (base !== BASE_PATH) fail('stubs', from, `forwards under the base path ${JSON.stringify(base)}, not ${JSON.stringify(BASE_PATH)}`);
      const wantGuides = FORWARD_ONLY[from] !== undefined || from === '/research/personalized' ? routes.guideTargets() : null;
      if (JSON.stringify(guides) !== JSON.stringify(wantGuides)) fail('stubs', from, wantGuides ? 'does not forward the old #guide-<question> links to their analyses (guideTargets())' : 'forwards #guide- links it never had');
    }
    const ogUrl = (page.social['og:url'] || [])[0];
    if (ogUrl !== routes.absoluteUrl(toPath)) fail('stubs', from, `og:url is ${ogUrl || 'missing'}, not the target ${routes.absoluteUrl(toPath)}`);
    if (page.jsonLd.length) fail('stubs', from, `has ${page.jsonLd.length} JSON-LD block(s); a stub has no structured data`);
    const target = byPath.get(toPath);
    if (!target) fail('stubs', from, `moves to ${toPath}, which is not in the export`);
    else if (expectNoindex(target) || hasNoindex(target)) fail('stubs', from, `moves to ${toPath}, which is noindex`);
    else if (toHash) {
      // The hash lands on an element with that id, or opens the tab of that name (a tabbed page reads its hash).
      if (!idsOf(target).has(toHash) && !tabsOf(target).has(toHash)) fail('stubs', from, `moves to ${to}, but ${toPath} has no element with id="${toHash}" and no tab of that name`);
    }
  }
})();

(function checkRedirects() {
  let rules;
  let oldHostRules;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    rules = redirectRules(config);
    oldHostRules = redirectRules(config, OLD_HOST);
  } catch (error) { fail('redirects', 'vercel.json', `cannot be read as a redirect table: ${error.message}`); return; }
  const used = new Set();
  const expect = (from, want) => {
    const got = redirectFor(rules, from);
    if (got) used.add(got.rule);
    if (want === null) { if (got) fail('redirects', from, `answers ${got.status} to ${got.location}; it must reach its page (rule ${got.rule.source})`); return; }
    if (!got) fail('redirects', from, `has no redirect in vercel.json; expected 308 to ${want}`);
    else if (got.status !== 308 || got.location !== want) fail('redirects', from, `answers ${got.status} to ${got.location} (rule ${got.rule.source}); expected 308 to ${want}`);
  };
  for (const from of MOVED_PAGES) expect(from, FORWARD_ONLY[from] !== undefined ? null : routes.movedTo(from));
  for (const [from, to] of Object.entries(REDIRECT_ONLY)) expect(from, to);
  // Any other research-archive address, at any depth, also goes to the downloads; nothing the site serves is redirected.
  for (const from of ['/packs/not-a-question', '/packs/r01_banking_time/extra']) expect(from, routes.movedTo('/packs/x'));
  let listed = [];
  try { listed = routes.sitemapEntries().map((e) => e.path); } catch { /* reported by the sitemap check */ }
  for (const page of [...new Set([...listed, ...pages.filter((p) => !p.notFound && !expectNoindex(p)).map((p) => p.path), '/packsx', '/runners', '/report'])]) expect(page, null);
  // The old host (November 9, 2026: its home page answered 200 with the home page's HTML while every other path
  // answered 308, because "/:path*" does not match the bare "/"). The root, every page in the export and every moved
  // address answer 308 to the same path on the production host, by the first rule that matches on that host.
  for (const from of [...new Set(['/', ...listed, ...pages.filter((p) => !p.notFound).map((p) => p.path), ...MOVED_PAGES, ...Object.keys(REDIRECT_ONLY), '/packs/not-a-question'])]) {
    const got = redirectFor(oldHostRules, from);
    const want = from === '/' ? `${SITE_URL}/` : SITE_URL + from;
    if (!got) fail('redirects', from, `is not redirected on ${OLD_HOST} (it would answer there); expected 308 to ${want}`);
    else if (got.status !== 308 || !samePage(got.location, want)) fail('redirects', from, `answers ${got.status} to ${got.location} on ${OLD_HOST} (rule ${got.rule.source}); expected 308 to ${want}`);
  }
  for (const rule of rules) {
    if (!used.has(rule)) warn('policy', 'vercel.json', `the redirect from ${rule.source} is never exercised by the redirect table; add its expectation or remove it`);
    if (rule.status !== 308) fail('redirects', 'vercel.json', `${rule.source} answers ${rule.status}; moved addresses answer 308`);
    if (rule.destination.startsWith('/')) {
      const target = rule.destination.split('#')[0];
      if (!/:/.test(target) && (!byPath.has(target) || expectNoindex(byPath.get(target)))) fail('redirects', 'vercel.json', `${rule.source} goes to ${target}, which is not a built, indexable page`);
    }
  }
})();

// November 11, 2026 (architecture review P1-2): the site's response headers, as committed (verify-seo-live reads them
// from the deployed site).
(function checkHeaders() {
  const { DISABLED_FEATURES, USED_FEATURES, SITE_HEADERS } = require('./lib/headers.cjs');
  let rule;
  try {
    rule = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers.find((r) => r.source === '/(.*)' && !r.has);
  } catch (error) { fail('headers', 'vercel.json', `cannot be read: ${error.message}`); return; }
  if (!rule) { fail('headers', 'vercel.json', 'has no header rule for every address ("/(.*)")'); return; }
  const sent = new Map(rule.headers.map((h) => [h.key.toLowerCase(), h.value]));
  for (const [name, value] of Object.entries(SITE_HEADERS)) {
    if (sent.get(name) !== value) fail('headers', 'vercel.json', `"/(.*)" sends ${name}: ${sent.get(name) ?? '(nothing)'}; expected ${value}`);
  }
  const policy = (sent.get('permissions-policy') ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  for (const used of USED_FEATURES) if (policy.some((d) => d.startsWith(`${used}=`))) fail('headers', 'vercel.json', `the Permissions-Policy names ${used}, which the site uses; leave it at its default`);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(?:ts|tsx|js|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const sources = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(ROOT, d))).map((file) => [path.relative(ROOT, file), fs.readFileSync(file, 'utf8')]);
  for (const [feature, uses] of Object.entries(DISABLED_FEATURES)) {
    const user = sources.find(([, text]) => uses.test(text));
    if (user) fail('headers', user[0], `uses ${feature} (${uses}), which the Permissions-Policy turns off`);
  }
})();

(function checkMovedLinks() {
  const moved = (pathname) => { try { return routes.movedTo(pathname) ?? REDIRECT_ONLY[pathname] ?? null; } catch { return null; } };
  const linking = new Map();
  for (const page of pages) {
    if (page.notFound) continue;
    const hits = [...new Set(page.hrefs.filter((href) => { const to = linkPath(href, page.path); return to && moved(to); }))];
    if (hits.length) linking.set(page.path, hits);
  }
  for (const [from, hits] of linking) {
    const message = `links ${hits.length} moved address${hits.length === 1 ? '' : 'es'}, e.g. ${hits.slice(0, 3).join(' , ')} (link to ${moved(linkPath(hits[0], from))} instead)`;
    fail('moved-links', from, message);
  }
})();

// ---------- Links into the methods page ----------

// Since October 16, 2026 every method, definition, source and limit lives on /methodology, and the other pages link the
// term or badge to its section there (/methodology#sustained-slowdown, /methodology#evidence, ...). A link to an id the
// page does not have lands at its top, so each one must resolve: the links in the exported HTML, the literals in the
// source (links that only appear after a page loads its data or the visitor acts), and the page's own contents links.
(function checkMethodsAnchors() {
  const methods = byPath.get('/methodology');
  if (!methods) { fail('methods-anchors', '/methodology', 'no /methodology page in the export'); return; }
  const ids = new Set([...methods.html.matchAll(/<[a-z][\w:-]*\b[^>]*\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => decode(m[1] ?? m[2])));
  const fragment = (href, from) => {
    let url;
    try { url = new URL(href, SITE_URL + from); } catch { return null; }
    if (url.host !== SITE_HOST || (decodeURIComponent(url.pathname.replace(/\/$/, '')) || '/') !== '/methodology' || !url.hash) return null;
    try { return decodeURIComponent(url.hash.slice(1)); } catch { return url.hash.slice(1); }
  };
  let links = 0;
  for (const page of pages) {
    if (page.notFound) continue;
    for (const href of page.hrefs) {
      const id = fragment(href, page.path === '/' ? '/' : page.path);
      if (id === null) continue;
      links++;
      if (!ids.has(id)) fail('methods-anchors', page.path, `links /methodology#${id}, but /methodology has no element with id="${id}"`);
    }
  }
  const sourceFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : /\.(tsx?|css)$/.test(entry.name) ? [path.join(dir, entry.name)] : []) : [];
  for (const file of ['app', 'components', 'lib'].flatMap((dir) => sourceFiles(path.join(ROOT, dir)))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/\/methodology#([A-Za-z][\w-]*)/g)) {
      links++;
      if (!ids.has(match[1])) fail('methods-anchors', path.relative(ROOT, file), `has /methodology#${match[1]}, but /methodology has no element with id="${match[1]}"`);
    }
  }
  if (!links) fail('methods-anchors', '/methodology', 'no page links a /methodology section: the guard found nothing to check');
})();

// ---------- The home page's plan form ----------

// The home page builds its course list from the course pages, the planner from its own data: a course on one list and
// not the other would send the visitor to "a course that is not in the data", or hide one the planner offers.
(function checkHomeForm() {
  const options = (pagePath, id) => {
    const select = (byPath.get(pagePath)?.html ?? '').match(new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`, 'i'));
    return select ? [...select[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((m) => `${attributes(`<option${m[1]}>`).value ?? ''}=${textOf(m[2])}`) : null;
  };
  const home = options('/', 'home-plan-course');
  const planner = options('/tools/plan', 'plan-course');
  if (!home || !planner) fail('home-form', home ? '/tools/plan' : '/', `no ${home ? '#plan-course' : '#home-plan-course'} select in the export`);
  else if (home.length < 2 || JSON.stringify(home) !== JSON.stringify(planner)) {
    const only = (a, b) => a.filter((option) => !b.includes(option));
    fail('home-form', '/', `the course list differs from the planner's (home only: ${only(home, planner).join(', ') || 'none'}; planner only: ${only(planner, home).join(', ') || 'none'}; ${home.length} and ${planner.length} options)`);
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
/**
 * The groups that leave a folder crawlable, as [who, folder] pairs. Every group must block the folders, not the * group
 * alone: a crawler obeys only the most specific group that names it, so a group added for one crawler with no Disallow
 * of its own would open the runner-name folders to it (until November 9, 2026 only the * group was read).
 */
function robotsUnblocked(groups, folders) {
  return groups.flatMap((group) => folders.filter((folder) => robotsAllows(group.rules, folder + 'example.json')).map((folder) => [`User-agent: ${group.agents.join(', ')}`, folder]));
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
  }
  for (const [who, folder] of robotsUnblocked(groups, ROBOTS_DISALLOW)) fail('robots-txt', 'robots.txt', `${who} does not block ${folder} (ROBOTS_DISALLOW)`);
})();

// ---------- Report ----------

const failed = [...failures].filter(([, list]) => list.length);
const warned = [...warnings].filter(([, list]) => list.length);
const noindexCount = pages.filter((p) => !p.notFound && expectNoindex(p)).length;
const stubCount = pages.filter((p) => !p.notFound && MOVED_PAGES.includes(p.path)).length;
const outLabel = OUT === ROOT || OUT.startsWith(ROOT + path.sep) ? path.relative(ROOT, OUT) || '.' : OUT;
console.log(`verify-seo: ${outLabel}/ has ${pages.length} HTML pages (${indexable.length} indexable, ${noindexCount} noindex of which ${stubCount} moved-address stubs, ${pages.filter((p) => p.notFound).length} not-found); sitemap lists ${sitemapLocs.length} URLs; finishesM() = ${FINISHES_M}; self-test passed (${SELF_TEST}).\n`);

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
