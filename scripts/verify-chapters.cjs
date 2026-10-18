#!/usr/bin/env node
'use strict';
// Checks the chapter registry, lib/chapters.ts (the redesign spec, sections 2.2 and 2.3), which the header's menu, the
// chapters drawer, the contents, the rail, the reading bar and every next card read.
//
//   1. Unit tests of the registry's functions (placeOf, nextOf, prevOf, howWeKnowOf, placeLabel, readingAttrs and
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
//   6. The shell's components rendered on the server: the closing stack (its related section, the one next card last in
//      its pagination nav as S2 and S3 follow it, no also rows, the way back, How we know, PageFeedback; the finish
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
  assert.equal(href(C.nextOf('/report')), '/analyses/finding-improvement');
  assert.equal(href(C.nextOf('/tools/pace-band')), '/tools/plan');
  assert.equal(C.nextOf('/tools/plan'), null);
  assert.equal(C.nextOf('/methodology'), null);
});
test('prevOf: within a chapter, across chapters, children and the start', () => {
  assert.equal(C.prevOf('/stories/race-replay').href, '/finish-times');
  assert.equal(C.prevOf('/analyses/starting-pace').href, '/stories/race-replay');
  assert.equal(C.prevOf('/courses/boston').href, '/courses');
  assert.equal(C.prevOf('/report').href, '/runners');
  assert.equal(C.prevOf('/tools/marathon-pace/3-30').href, '/analyses/finish-time-context');
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
test('howWeKnowOf, placeLabel and readingAttrs', () => {
  assert.equal(C.howWeKnowOf('/stories/round-numbers'), '/methodology#story-round-numbers');
  assert.equal(C.howWeKnowOf('/courses/boston'), '/methodology#course-pages');
  assert.equal(C.howWeKnowOf('/report'), '/methodology#race-report');
  assert.equal(C.howWeKnowOf('/methodology'), null);
  assert.equal(C.placeLabel('/stories/round-numbers'), 'Page 1 of 2');
  assert.equal(C.placeLabel('/courses/boston'), null);
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

const children = C.CHAPTERS.flatMap((c) => [...(c.also ?? []).map((a) => a.href), ...(c.children ?? []).filter((x) => !x.endsWith('/'))]);
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

// ---------- 6. The components, rendered ----------
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const render = (file, props) => renderToStaticMarkup(React.createElement(require(path.join(root, file)).default, props));
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]);
test('ChapterEnd on a story: related section, one next card, no also rows, the way back, How we know, feedback', () => {
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
  assert.ok(hrefs(html).includes('/methodology#story-round-numbers'), 'How we know');
  assert.match(html, /<aside class="page-feedback/);
});
test('ChapterEnd on an analysis: the next card is the last link of nav.analysis-pagination; a new chapter shows its lead', () => {
  const html = render('components/ChapterEnd.tsx', { path: '/analyses/downhill-start', variant: 'analysis', readingOf: (id) => ({ value: 'V', sr: `value of ${id}` }) });
  const nav = /<nav class="chapter-next analysis-pagination"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(nav, 'nav.analysis-pagination');
  assert.deepEqual(hrefs(nav[1]), ['/stories/pacing-types']);
  assert.match(nav[1], /Next chapter · The shape of a race/);
  assert.match(nav[1], /value of shape\.second20k/, 'the next chapter\'s lead, not the page\'s reading');
  assert.match(nav[1], /ran their second 20K faster than their first/, 'the chapter key under the lead');
});
test('ChapterEnd: the finish card on /tools/plan, no tracking or feedback when asked, nothing outside the race', () => {
  const plan = render('components/ChapterEnd.tsx', { path: '/tools/plan', track: false, feedback: false });
  assert.doesNotMatch(plan, /next-card night"[^>]*href|data-track-section|page-feedback/);
  assert.match(plan, /is-finish/);
  assert.ok(['/research', '/runners'].every((h) => hrefs(plan).includes(h)));
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
  assert.equal((expanded.match(/class="chapter-page-link"/g) || []).length, live.length);
  const full = render('components/ui/ChapterList.tsx', { variant: 'full', readingOf });
  assert.equal((full.match(/class="chapter-reading"/g) || []).length, 11);
  // A figure that is a word ("Yours") is no reading: its key shows alone, as plain text, never as a big number.
  const words = render('components/ui/ChapterList.tsx', { variant: 'full', readingOf: (id) => ({ value: 'Yours', sr: id, key: 'nine mats, one race' }) });
  assert.equal((words.match(/class="chapter-reading is-key-only"/g) || []).length, 11);
  assert.doesNotMatch(words, /big-number/);
});
test('ChapterCrumbs', () => {
  const { ChapterCrumbs } = require(path.join(root, 'components/ui/ChapterHeader.tsx'));
  const crumbs = (props) => renderToStaticMarkup(React.createElement(ChapterCrumbs, props));
  const text = (html) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');
  // A race chapter: its distance marker, then "Chapter 06 · The finish line" (the number kept whole), then the place,
  // whose "·" CSS draws (no line may open on it).
  const html = crumbs({ path: '/stories/round-numbers' });
  assert.match(html, /href="\/research#chapter-06"/);
  assert.match(html, /<span class="crumb-number">Chapter 06<\/span> · The finish line/);
  assert.match(html, /<span class="crumb-place">Page 1 of 2<\/span>/);
  assert.equal(text(html), 'FINISHChapter 06 · The finish linePage 1 of 2');
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
