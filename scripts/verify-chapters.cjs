#!/usr/bin/env node
'use strict';
// Checks the chapter registry, lib/chapters.ts (the redesign spec, sections 2.2 and 2.3), which the header's menu, the
// chapters drawer, the contents, the rail, the reading bar and every next card read.
//
//   1. Unit tests of the registry's functions (placeOf, nextOf, prevOf, howWeKnowOf, readingAttrs and
//      cleanPath) on known pages, and its shape: eleven chapters in three parts, the markers in race order, ids
//      chapter-01 … chapter-11, short titles of 28 characters or fewer, unique hrefs, nugget ids of the form area.name.
//   2. The chain, walked forward from /finish-times with nextOf, visits every built page once and ends on /tools/plan
//      (the journey's finish, whose nextOf is null); walked back with prevOf it returns the same way.
//   3. Routes: every page, also-in-this-chapter link, and every nextOf and prevOf of them, is a built route (the export
//      in out/ when there is one, otherwise the sitemap, the noindex list and app/); a page marked pending is not built
//      yet (once it is, the flag must go).
//   4. Every story and analysis in the sitemap appears exactly once in CHAPTERS, except the pages the spec merges away.
//   5. Every howWeKnow anchor is an id in the built /methodology page (when out/methodology.html exists; `--html`
//      requires it). The built pages' own "How we know" links are also checked by verify-seo (methods-anchors).
//   7. Each chapter's lead is its first page's reading, and (with the export) that page's opener shows its figure.
//   8. No reading's unit line repeats its H1 (with the export).
//   7b. Every card in the chain carries a figure: each page's reading (the first page of a chapter: its lead) has one.
//   9. Every beat heading (h2.t-h2) is a beat's finding in one clause: at most 12 words (with the export). The analyses'
//      and the tools' headings are reported as notes until their package shortens them; every other page fails.
//   6. The shell's components rendered on the server: the closing stack (its related section, the one next card last in
//      its pagination nav as S2 and S3 follow it, no also rows, the way back, How we know unless the page's All numbers
//      carries it (how={false}), PageFeedback; the finish
//      card on /tools/plan; a next chapter's lead and key), the rail's current page, the chapter list's variants and
//      the crumbs.
//
// Usage: node scripts/verify-chapters.cjs [--html] [--out <folder>]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const requireHtml = args.includes('--html');
const outArg = args.indexOf('--out');
const OUT = path.resolve(root, outArg >= 0 ? args[outArg + 1] : 'out');
assert.ok(args.every((a, i) => ['--html', '--out'].includes(a) || args[i - 1] === '--out'), 'Usage: node scripts/verify-chapters.cjs [--html] [--out <folder>]');
process.chdir(root); // the registry's titles read public/data relative to the working directory, as during `next build`

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...rest);
};

const failures = [];
const notes = [];
const check = (ok, where, message) => { if (!ok) failures.push(`${where}: ${message}`); };
const C = require(path.join(root, 'lib/chapters.ts'));
const routes = require(path.join(root, 'lib/seo-routes.ts'));

// Pages in the sitemap that the spec merges into another page (section 2.1); the package named removes them.
const MERGING = { '/analyses/warming-and-pacing': 'WP3 (into /analyses/race-day-weather#warming)', '/analyses/wind-and-pacing': 'WP3 (into /analyses/race-day-weather#wind)' };
const MARKERS = ['START', '5K', '10K', 'HALF', '30K', 'FINISH', '07', '08', '09', '10', '11'];

// ---------- 1. Unit tests ----------
const href = (next) => next && next.page.href;
const test = (name, fn) => { try { fn(); } catch (error) { failures.push(`unit: ${name}: ${error.message}`); } };
test('cleanPath drops the query, the hash and a trailing slash', () => {
  assert.equal(C.cleanPath('/stories/round-numbers?goal=4:00#towers'), '/stories/round-numbers');
  assert.equal(C.cleanPath('/courses/boston/'), '/courses/boston');
  assert.equal(C.cleanPath('/'), '/');
});
test('placeOf: a page in the chain, a child, and pages outside the race', () => {
  const p = C.placeOf('/stories/round-numbers');
  assert.ok(p && 'page' in p && p.chapter.n === 6 && p.index === 0);
  const child = C.placeOf('/courses/boston');
  assert.ok(child && 'child' in child && child.chapter.n === 8);
  assert.ok('child' in C.placeOf('/report') && C.placeOf('/report').chapter.n === 10);
  assert.ok('child' in C.placeOf('/tools/marathon-pace/4-00') && C.placeOf('/tools/marathon-pace/4-00').chapter.n === 6);
  assert.ok('child' in C.placeOf('/tools/pace-band') && C.placeOf('/tools/pace-band').chapter.n === 11);
  for (const outside of ['/', '/research', '/methodology', '/tools', '/tools/pace-calculator', '/tools/marathon-pace']) assert.equal(C.placeOf(outside), null, outside);
});
test('nextOf: within a chapter, into the next one, from a child, and the finish', () => {
  assert.deepEqual([href(C.nextOf('/finish-times')), C.nextOf('/finish-times').opensChapter], ['/stories/race-replay', false]);
  const into = C.nextOf('/stories/race-replay');
  assert.deepEqual([href(into), into.opensChapter, into.chapter.n], ['/analyses/starting-pace', true, 2]);
  assert.equal(C.nextOf('/courses/boston').chapter.n, 9);
  // Every course is chapter 08's hub, off the chain (round 5): hills hands straight on to the weather, and the hub too.
  const hills = C.nextOf('/analyses/hills-and-pacing');
  assert.deepEqual([href(hills), hills.opensChapter, hills.chapter.n], ['/stories/race-morning', true, 9]);
  assert.equal(href(C.nextOf('/courses')), '/stories/race-morning');
  assert.equal(href(C.nextOf('/report')), '/analyses/finding-improvement');
  assert.equal(href(C.nextOf('/tools/pace-band')), '/tools/plan');
  assert.equal(C.nextOf('/tools/plan'), null);
  assert.equal(C.nextOf('/methodology'), null);
});
test('prevOf: within a chapter, across chapters, children and the start', () => {
  assert.equal(C.prevOf('/stories/race-replay').href, '/finish-times');
  assert.equal(C.prevOf('/analyses/starting-pace').href, '/stories/race-replay');
  assert.equal(C.prevOf('/courses/boston').href, '/courses');
  assert.equal(C.prevOf('/courses').href, '/analyses/hills-and-pacing');
  assert.equal(C.prevOf('/stories/race-morning').href, '/analyses/hills-and-pacing');
  assert.equal(C.prevOf('/report').href, '/runners');
  assert.equal(C.prevOf('/tools/marathon-pace/3-30').href, '/analyses/finish-time-context');
  for (const tool of ['/tools/pace-band', '/tools/course-chooser', '/tools/predictor']) assert.equal(C.prevOf(tool).href, '/analyses/finding-improvement', `${tool} leads back to its chapter`);
  assert.equal(C.prevOf('/finish-times'), null);
});
test('a pending page is skipped by every link', () => {
  const pending = C.CHAPTERS.flatMap((c) => c.pages.filter((p) => p.pending).map((p) => ({ chapter: c, page: p })));
  for (const { chapter, page } of pending) {
    const before = chapter.pages[chapter.pages.indexOf(page) - 1] ?? C.CHAPTERS[chapter.n - 2]?.pages.slice(-1)[0];
    if (before) assert.notEqual(href(C.nextOf(before.href)), page.href, `${before.href} → ${page.href}`);
    assert.notEqual(C.chapterHref(chapter), page.href);
  }
});
test('howWeKnowOf and readingAttrs', () => {
  assert.equal(C.howWeKnowOf('/stories/round-numbers'), '/methodology#story-round-numbers');
  assert.equal(C.howWeKnowOf('/courses/boston'), '/methodology#course-pages');
  assert.equal(C.howWeKnowOf('/report'), '/methodology#race-report');
  assert.equal(C.howWeKnowOf('/methodology'), null);
  assert.deepEqual(C.readingAttrs('/stories/round-numbers'), { 'data-reading': '', 'data-marker': 'FINISH', 'data-short': 'Round numbers' });
  assert.deepEqual(C.readingAttrs('/courses/boston', 'Boston'), { 'data-reading': '', 'data-marker': '08', 'data-short': 'Boston' });
  assert.deepEqual(C.readingAttrs('/methodology', 'Methods'), { 'data-reading': '', 'data-short': 'Methods' });
});
test('the registry\'s shape', () => {
  assert.equal(C.CHAPTERS.length, 11);
  assert.deepEqual(C.CHAPTERS.map((c) => c.marker), MARKERS);
  assert.deepEqual(C.CHAPTERS.map((c) => c.id), C.CHAPTERS.map((c) => `chapter-${C.chapterNumber(c)}`));
  assert.deepEqual(C.CHAPTERS.map((c) => c.n), C.CHAPTERS.map((_, i) => i + 1));
  assert.deepEqual([...new Set(C.CHAPTERS.map((c) => c.part))], [1, 2, 3]);
  assert.ok(C.CHAPTERS.every((c, i) => i === 0 || c.part >= C.CHAPTERS[i - 1].part), 'parts in order');
  const pages = C.CHAPTERS.flatMap((c) => c.pages);
  assert.equal(new Set(pages.map((p) => p.href)).size, pages.length, 'every href once');
  for (const p of pages) {
    assert.ok(p.short.length <= 28, `${p.href}: short "${p.short}" is over 28 characters`);
    assert.ok(typeof p.title === 'string' && p.title.length > 0, `${p.href}: no title`);
    assert.match(p.nugget, /^[a-z0-9]+\.[a-zA-Z0-9]+$/, `${p.href}: nugget id`);
    assert.match(p.howWeKnow, /^\/methodology#[a-z0-9-]+$/, `${p.href}: howWeKnow`);
  }
  for (const c of C.CHAPTERS) {
    assert.match(c.lead, /^[a-z0-9]+\.[a-zA-Z0-9]+$/, `${c.id}: lead`);
    assert.ok(c.key && c.subtitle && c.title, `${c.id}: title, subtitle and key`);
    assert.ok(!/\d+(\.\d+)?%\s*(typical|of)\b|\(\s*\d/.test(c.key), `${c.id}: the key "${c.key}" types a data value (it comes from the nugget)`);
    assert.ok((c.also ?? []).length <= 3, `${c.id}: at most three also-in-this-chapter rows`);
  }
  assert.equal(new Set(C.CHAPTER_NUGGETS).size, C.CHAPTER_NUGGETS.length);
});

// ---------- 2. The chain ----------
const live = C.CHAPTERS.flatMap((c) => C.livePages(c).map((p) => p.href));
test('the chain runs from /finish-times to /tools/plan through every built page once, and back', () => {
  const forward = ['/finish-times'];
  for (let next = C.nextOf('/finish-times'); next; next = C.nextOf(next.page.href)) {
    assert.ok(!forward.includes(next.page.href), `the chain loops at ${next.page.href}`);
    forward.push(next.page.href);
  }
  assert.deepEqual(forward, live);
  assert.equal(forward[forward.length - 1], '/tools/plan');
  const back = ['/tools/plan'];
  for (let prev = C.prevOf('/tools/plan'); prev; prev = C.prevOf(prev.href)) back.push(prev.href);
  assert.deepEqual(back.reverse(), live);
});

// ---------- 3. Routes ----------
const hasOut = fs.existsSync(path.join(OUT, 'index.html'));
let sitemap = [];
try { sitemap = routes.sitemapEntries().map((e) => e.path); } catch (error) { failures.push(`sitemap: sitemapEntries() throws: ${error.message}`); }
const appRoute = (p) => fs.existsSync(path.join(root, 'app', p.slice(1), 'page.tsx'));
const built = (p) => hasOut
  ? [`${p.slice(1)}.html`, `${p.slice(1)}/index.html`].some((f) => fs.existsSync(path.join(OUT, f)))
  : sitemap.includes(p) || (routes.NOINDEX.includes(p) && appRoute(p));
if (!hasOut) notes.push(`no export in ${path.relative(root, OUT) || '.'}: routes checked against the sitemap and app/, anchors not checked`);

const children = C.CHAPTERS.flatMap((c) => [...(c.hub ? [c.hub.href] : []), ...(c.also ?? []).map((a) => a.href), ...(c.children ?? []).filter((x) => !x.endsWith('/'))]);
const prefixed = C.CHAPTERS.flatMap((c) => (c.children ?? []).filter((x) => x.endsWith('/')));
const childSamples = prefixed.map((prefix) => sitemap.find((p) => p.startsWith(prefix))).filter(Boolean);
check(childSamples.length === prefixed.length, 'routes', `a child prefix has no built page: ${prefixed.join(', ')}`);
for (const p of [...live, ...children, ...childSamples]) {
  check(built(p), p, 'is not a built route');
  const next = C.nextOf(p), prev = C.prevOf(p);
  if (next) check(built(next.page.href), p, `nextOf is ${next.page.href}, which is not built`);
  if (prev) check(built(prev.href), p, `prevOf is ${prev.href}, which is not built`);
}
for (const c of C.CHAPTERS) for (const p of c.pages.filter((x) => x.pending)) {
  check(!built(p.href), p.href, `is built now: remove its pending flag (${p.pending})`);
  notes.push(`${p.href} is pending (${p.pending}): every link skips it until it is built`);
}

// ---------- 4. Every sitemap story and analysis once ----------
const inChapters = C.CHAPTERS.flatMap((c) => c.pages.map((p) => p.href));
for (const p of sitemap.filter((x) => /^\/(stories|analyses)\/[^/]+$/.test(x))) {
  const times = inChapters.filter((x) => x === p).length;
  if (MERGING[p]) { check(times === 0, p, 'is merged into another page and should not be in CHAPTERS'); notes.push(`${p} is in the sitemap until ${MERGING[p]} merges it`); }
  else check(times === 1, p, `appears ${times} times in CHAPTERS (once expected)`);
}

// ---------- 5. Methods anchors ----------
const methodology = path.join(OUT, 'methodology.html');
if (fs.existsSync(methodology)) {
  const ids = new Set([...fs.readFileSync(methodology, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [
    ...C.CHAPTERS.flatMap((c) => c.pages.map((p) => [p.href, p.howWeKnow, p.pending])),
    ...[...children, ...childSamples].map((p) => [p, C.howWeKnowOf(p)]),
  ];
  for (const [p, anchor, pending] of anchors) {
    const id = anchor && anchor.split('#')[1];
    if (pending) { if (!ids.has(id)) notes.push(`${anchor} (for pending ${p}) is not on /methodology yet`); continue; }
    check(!!id && ids.has(id), p, `How we know ${anchor} is not an id on /methodology`);
  }
} else check(!requireHtml, 'methodology', `--html needs ${path.relative(root, methodology)}: build first`);

// ---------- 7. Each chapter opens on the number it is announced by ----------
// A chapter's lead (the number on the home guide, the contents and the next card into it) is its first page's own
// reading, so a reader who taps a number lands on it. With the export, the figure must be in that page's opener (the
// reading or the analysis answer, above the first beat). A tool draws its reading in the browser from the same data, so
// its export holds none: the nugget recount (verify-nuggets) checks the tool's window instead, and the note says so.
const PAGE_NUGGET = require(path.join(root, 'lib/nuggets/index.ts')).PAGE_NUGGET;
for (const c of C.CHAPTERS) {
  const first = C.livePages(c)[0];
  check(first && c.lead === first.nugget, c.id, `the lead ${c.lead} is not the first page's reading (${first && first.nugget})`);
  check(first && PAGE_NUGGET[first.href] === c.lead, c.id, `PAGE_NUGGET names ${first && PAGE_NUGGET[first.href]} for ${first && first.href}, not the lead ${c.lead}`);
}
// Every card in the chain promises a number (round 4): the card into a page within its chapter shows that page's
// reading, and the card into a new chapter its lead, so every one of them must have a figure.
{
  const N = require(path.join(root, 'lib/nuggets/index.ts'));
  for (const c of C.CHAPTERS) {
    C.livePages(c).forEach((p, i) => {
      const id = i === 0 ? c.lead : p.nugget;
      const figure = N.getNugget(id).figure;
      check(!!figure && /\d/.test(figure.value || ''), p.href, `the card into it would carry no figure (${id} has ${figure ? `"${figure.value}"` : 'none'})`);
    });
  }
}
const textOf = (html) => html.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&rsquo;/g, '’').replace(/\s+/g, ' ');
/**
 * The page's opener: from <main> to the first beat after the hero (a story's reading, an analysis's answer), or to the
 * closing stack where the answer is the page's only beat (round 6: an explorer under its card is no beat of its own).
 */
function opener(html) {
  const main = html.indexOf('<main');
  if (main < 0) return '';
  const rest = html.slice(main);
  const beats = [...rest.matchAll(/<section\b[^>]*\sdata-beat="[^"]*"/g)].map((m) => m.index);
  const hero = /<(?:header class="reading|section class="analysis-hero)/.exec(rest);
  const close = rest.search(/<div class="chapter-end"/);
  const end = beats.find((i) => hero && i > hero.index + 10) ?? (close >= 0 ? close : rest.length);
  return rest.slice(0, end);
}
if (hasOut) {
  const { getNugget } = require(path.join(root, 'lib/nuggets/index.ts'));
  for (const c of C.CHAPTERS) {
    const first = C.livePages(c)[0];
    if (!first) continue;
    const figure = getNugget(c.lead).figure;
    if (!figure) continue;
    if (first.kind === 'tool') { notes.push(`${c.id}: ${first.href} draws its reading (${figure.value}${figure.unit || ''}) in the browser; verify-nuggets recounts its window`); continue; }
    const file = [`${first.href.slice(1)}.html`, `${first.href.slice(1)}/index.html`].map((f) => path.join(OUT, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    // A figure's unit is its own span, so "20 %" in the text is "20%"; a pair ("20% · 44%") is two figures on the page.
    const head = textOf(opener(fs.readFileSync(file, 'utf8'))).replace(/(\d) ([%×])/g, '$1$2');
    const parts = figure.value.replace(/\u00a0/g, ' ').split(' · ');
    check(parts.every((v) => head.includes(v)), c.id, `${first.href} does not open on the lead's figure "${figure.value}" (the number the chapter row and the next card promise)`);
  }
}

// ---------- 8. A reading's unit line adds to its H1 ----------
// Under the big figure, the unit line names the base or the comparison the H1 leaves out; it never repeats the H1
// (five words in a row from the unit line found in the H1 fail).
if (hasOut) {
  const words = (t) => t.toLowerCase().replace(/[^a-z0-9%:–\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const pages = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== '_next') walk(f); } else if (e.name.endsWith('.html')) pages.push(f); } };
  walk(OUT);
  let seen = 0;
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    const h1 = /<h1\b[^>]*class="reading-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    const unit = /<p class="reading-unit-line">([\s\S]*?)<\/p>/.exec(html);
    if (!h1 || !unit) continue;
    seen++;
    const a = words(textOf(h1[1])).join(' '), b = words(textOf(unit[1]));
    const run = b.length >= 5 ? b.findIndex((_, i) => i + 5 <= b.length && a.includes(b.slice(i, i + 5).join(' '))) : -1;
    check(run < 0, path.relative(OUT, file), `the unit line "${textOf(unit[1]).trim()}" repeats the H1 ("${b.slice(run, run + 5).join(' ')}")`);
  }
  check(seen >= 8, 'unit lines', `only ${seen} pages with a reading's unit line were found`);
}

// ---------- 9. A beat's heading is its finding, not its full statement ----------
// At 26–42 px a heading of 16 to 27 words runs five or six lines on a phone and spends the beat's words; the qualifier
// belongs in the dek or the caption. Twelve words at most (the spec's "about ten").
const H2_MAX_WORDS = 12;
if (hasOut) {
  const pages = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== '_next') walk(f); } else if (e.name.endsWith('.html')) pages.push(f); } };
  walk(OUT);
  let headings = 0;
  for (const file of pages) {
    const route = '/' + path.relative(OUT, file).replace(/\\/g, '/').replace(/(\/index)?\.html$/, '').replace(/^index$/, '');
    const place = C.placeOf(route);
    const lenient = place && 'page' in place && ['analysis', 'tool'].includes(place.page.kind);
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<h2\b[^>]*class="[^"]*\bt-h2\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/g)) {
      headings++;
      const text = textOf(m[1]).replace(/\u2060/g, '').trim();
      // A word has a letter or a digit: the space textOf leaves between an em and its full stop is not a word.
      const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (words <= H2_MAX_WORDS) continue;
      if (lenient) notes.push(`${route}: the beat heading "${text}" is ${words} words (at most ${H2_MAX_WORDS}; the analyses' package shortens it)`);
      else check(false, route, `the beat heading "${text}" is ${words} words: at most ${H2_MAX_WORDS}, one clause (the qualifier goes in the dek or the caption)`);
    }
  }
  check(headings >= 20, 'beat headings', `only ${headings} h2.t-h2 headings were found in the export`);
}

// ---------- 10. An opener says its number once ----------
// Read start to finish, a page's number arrives on the card into it, then in its H1's accent, then in the figure right
// under the H1 (round 5): the opener must not say it twice. A figure under the H1 whose number is the H1 accent's own
// fails on a story or an analysis (its H1 says the finding in words, the figure or the receipt carries the number;
// round 6 promoted the analyses from a note); on a tool, whose result card is the visitor's own, it is a note.
if (hasOut) {
  const NUMBER = /\d[\d,.:]*(?:%|×)?/g;
  for (const p of live) {
    const file = [`${p.slice(1)}.html`, `${p.slice(1)}/index.html`].map((f) => path.join(OUT, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    const head = opener(fs.readFileSync(file, 'utf8'));
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(head);
    const em = h1 && /<em>([\s\S]*?)<\/em>/.exec(h1[1]);
    if (!em) continue;
    const accent = textOf(em[1]).match(NUMBER) || [];
    const after = head.slice(head.indexOf(h1[0]) + h1[0].length);
    const big = /<span class="big-number[^"]*"><span aria-hidden="true">([\s\S]*?)<\/span><span class="sr-only">/.exec(after);
    const figure = big ? textOf(big[1]).replace(/\s+/g, '').match(NUMBER) || [] : [];
    const twice = accent.filter((n) => figure.some((f) => f.replace(/[%×]$/, '') === n.replace(/[%×]$/, '')));
    if (!twice.length) continue;
    const place = C.placeOf(p);
    const message = `the H1's accent "${textOf(em[1]).trim()}" and the figure under it ("${textOf(big[1]).trim()}") say ${twice.join(', ')} twice: say it once`;
    if (place && 'page' in place && place.page.kind === 'tool') notes.push(`${p}: ${message}`);
    else check(false, p, message);
  }
}

// ---------- 6. The components, rendered ----------
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const render = (file, props) => renderToStaticMarkup(React.createElement(require(path.join(root, file)).default, props));
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]);
test('ChapterEnd on a story: related section, one next card, no also rows, the way back, How we know (or none, how={false}), feedback', () => {
  const html = render('components/ChapterEnd.tsx', { path: '/stories/round-numbers' });
  assert.match(html, /^<div class="chapter-end" data-track-section="related">/);
  const nav = /<nav class="chapter-next story-pagination"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(nav, 'nav.story-pagination');
  assert.deepEqual(hrefs(nav[1]), ['/analyses/finish-time-context']);
  assert.match(nav[1], /class="next-card night"/);
  assert.match(nav[1], /Next in this chapter/);
  assert.ok(!hrefs(html).includes('/tools/marathon-pace/4-00'), 'no also-in-this-chapter row: one way forward (spec section 00, cut 4)');
  assert.doesNotMatch(html, /chapter-also/);
  assert.ok(hrefs(html).includes('/analyses/where-time-is-gained'), '← previous');
  assert.ok(hrefs(html).includes('/methodology#story-round-numbers'), 'How we know (the footer\'s own link steps aside on this page, footer.css)');
  assert.match(html, /<aside class="page-feedback/);
  // A story keeps its methods at the foot of its All numbers (StoryPage), so its row is the way back alone: one way to
  // /methodology per phone screen (round 6).
  const story = render('components/ChapterEnd.tsx', { path: '/stories/round-numbers', how: false });
  assert.ok(!hrefs(story).some((h) => h.startsWith('/methodology')), 'how={false}: no methods link in the closing stack');
  assert.ok(hrefs(story).includes('/analyses/where-time-is-gained'), 'how={false}: still the way back');
});
test('AllNumbers ends on the page\'s methods link when given one', () => {
  const { AllNumbers } = require(path.join(root, 'components/ui/Values.tsx'));
  const html = renderToStaticMarkup(React.createElement(AllNumbers, { tables: [React.createElement('p', { key: 't' }, 'table')], how: C.howWeKnowOf('/stories/round-numbers') }));
  assert.ok(hrefs(html).includes('/methodology#story-round-numbers'), 'How these were measured');
  assert.match(html, /How these were measured/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(AllNumbers, { tables: [React.createElement('p', { key: 't' }, 'table')] })), /values-how/);
});
test('ChapterEnd on an analysis: the next card is the last link of nav.analysis-pagination; a new chapter shows its lead', () => {
  const html = render('components/ChapterEnd.tsx', { path: '/analyses/downhill-start', variant: 'analysis', readingOf: (id) => ({ value: 'V', sr: `value of ${id}` }) });
  const nav = /<nav class="chapter-next analysis-pagination"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(nav, 'nav.analysis-pagination');
  assert.deepEqual(hrefs(nav[1]), ['/stories/pacing-types']);
  assert.match(nav[1], /Next chapter · The shape of a race/);
  assert.match(nav[1], /value of types\.top/, 'the next chapter\'s lead, not the page\'s reading');
  assert.match(nav[1], /were the two most common pacing types/, 'the chapter key under the lead');
});
test('ChapterEnd: the finish card on /tools/plan, no tracking or feedback when asked, nothing outside the race', () => {
  const plan = render('components/ChapterEnd.tsx', { path: '/tools/plan', track: false, feedback: false });
  assert.doesNotMatch(plan, /next-card night"[^>]*href|data-track-section|page-feedback/);
  assert.match(plan, /is-finish/);
  // The way on from the finish (round 3): back to the start of the race, chapter 01, and on to a past race.
  assert.ok([C.chapterHref(C.CHAPTERS[0]), '/runners'].every((h) => hrefs(plan).includes(h)), hrefs(plan).join(' '));
  assert.match(plan, /Back to the gun · Chapter 01 /);
  assert.equal(render('components/ChapterEnd.tsx', { path: '/methodology', feedback: false }), '');
});
test('ChapterRail marks the current page', () => {
  const html = render('components/ChapterRail.tsx', { path: '/analyses/starting-pace' });
  const current = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((a) => /aria-current="page"/.test(a));
  assert.deepEqual(current.map((a) => /href="([^"]*)"/.exec(a)[1]), ['/analyses/starting-pace']);
  assert.match(html, /Chapter 02/);
  assert.equal(render('components/ChapterRail.tsx', { path: '/about' }), '');
});
test('ChapterList: compact without readings or ids, expanded with ids and every page, full with readings', () => {
  const readingOf = (id) => ({ value: '47', unit: '%', sr: id, key: 'the key' });
  const compact = render('components/ui/ChapterList.tsx', { variant: 'compact', readingOf });
  assert.equal((compact.match(/class="chapter-row"/g) || []).length, 11);
  assert.doesNotMatch(compact, /chapter-reading|id="chapter-/);
  const expanded = render('components/ui/ChapterList.tsx', { variant: 'expanded', readingOf });
  assert.deepEqual([...expanded.matchAll(/<li class="chapter-row" id="(chapter-\d\d)"/g)].map((m) => m[1]), C.CHAPTERS.map((c) => c.id));
  // Every chain page, and each chapter's hub (Every course) after its chain.
  assert.equal((expanded.match(/class="chapter-page-link"/g) || []).length, live.length + C.CHAPTERS.filter((c) => c.hub).length);
  const full = render('components/ui/ChapterList.tsx', { variant: 'full', readingOf });
  assert.equal((full.match(/class="chapter-reading"/g) || []).length, 11);
  // No reading, no figure slot: a chapter whose lead had none would show its title alone (verify-nuggets requires
  // every chapter lead to carry a number, so none does).
  const none = render('components/ui/ChapterList.tsx', { variant: 'full', readingOf: () => null });
  assert.doesNotMatch(none, /chapter-reading|big-number/);
});
test('ChapterCrumbs', () => {
  const { ChapterCrumbs } = require(path.join(root, 'components/ui/ChapterHeader.tsx'));
  const crumbs = (props) => renderToStaticMarkup(React.createElement(ChapterCrumbs, props));
  const text = (html) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');
  // A race chapter: its distance marker, then "Chapter 06 · The finish line" (the number kept whole), and no page count
  // (the rail, the menu and the next card say where a page sits).
  const html = crumbs({ path: '/stories/round-numbers' });
  assert.match(html, /href="\/research#chapter-06"/);
  assert.match(html, /<span class="crumb-number">Chapter 06\u00a0·<\/span> <span class="crumb-title">The finish line<\/span>/);
  assert.doesNotMatch(html, /crumb-place|Page \d/);
  assert.equal(text(html), 'FINISHChapter 06\u00a0· The finish line');
  // A chapter after the finish shows its number once, on the badge; screen readers still hear "Chapter 08".
  const course = crumbs({ path: '/courses/boston', place: 'Courses' });
  assert.equal(text(course), '08Where you runCourses');
  assert.match(course, /<span class="sr-only">Chapter 08 · <\/span>Where you run/);
  assert.doesNotMatch(crumbs({ path: '/runners', place: false }), /crumb-place/);
});

for (const note of notes) console.log(`note: ${note}`);
if (failures.length) {
  console.error(`verify-chapters: ${failures.length} problem${failures.length === 1 ? '' : 's'}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`verify-chapters: ${C.CHAPTERS.length} chapters, ${live.length} pages in the chain, ${children.length + childSamples.length} off-chain pages${hasOut ? ', routes and anchors checked against the export' : ''}: ok`);
