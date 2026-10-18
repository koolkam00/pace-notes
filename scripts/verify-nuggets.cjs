#!/usr/bin/env node
'use strict';
// The nugget recount (the redesign spec, section 5). Every headline number and directional word on the site comes from
// lib/nuggets/; this script loads it through the TypeScript require hook and, for each nugget with a recount here:
//   1. recomputes its values independently from the raw files, with a second, deliberately simple implementation;
//   2. checks that its guard agrees with the recount and that the sentence a page shows is guard ? headline : fallback;
//   3. checks every nugget's text: no banned word, no causal verb, at most one *…* accent, no two-decimal miles, and a
//      units-aware text in both units.
// It also tests the format helpers, checks that every id lib/chapters.ts names (once WP0-B delivers it) is registered,
// and lists the placeholders that remain (WP0-C's bootstrap; each area package replaces its own, and WP9 fails while
// any remain: run it there with --no-placeholders).
//
//   node scripts/verify-nuggets.cjs                     the real files, then the fixtures: every reference nugget's
//                                                       fallback renders on data whose guard fails, and each recount
//                                                       rejects its nugget with the guard flipped (--no-fixture skips them)
//   node scripts/verify-nuggets.cjs --no-placeholders   fails while any placeholder remains (WP9)
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...args);
};

const args = new Set(process.argv.slice(2));
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

// ---------- The format helpers ----------
const F = require('../lib/nuggets/format.ts');
eq(F.IN_WORDS_DENOMINATORS, [2, 3, 4, 5, 10, 20, 25, 50, 100], 'inWords uses the fixed denominator list');
eq([0.0395, 0.5, 0.26, 0.105, 0.0198, 0.3, 0.012, 0.0101].map((v) => F.inWords(v)), ['1 in 25', '1 in 2', '1 in 4', '1 in 10', '1 in 50', '30%', '1%', '1 in 100'], 'inWords: the closest 1 in d within 10%, else the percentage');
eq([0.0395, 0.3, 0.012].map((v) => F.inWords(v, 'finishes')), ['1 in 25 finishes', '30% of finishes', '1% of finishes'], 'inWords with a noun reads as a phrase in both branches');
eq([0.30, 0.72, 0.68, 0.719, 0.5, 0.04, 0.96, 0.745].map(F.approxWords), ['about 3 in 10', 'just over 7 in 10', 'just under 7 in 10', 'just over 7 in 10', 'about 5 in 10', '4%', '96%', '75%'], 'approxWords: about, just over, just under');
eq([0, 7, 12, 13, 1234].map(F.countWord), ['zero', 'seven', 'twelve', '13', '1,234'], 'countWord: words to twelve, figures beyond');
eq([F.count(15856), F.count(10000), F.count(3871767)], ['15,856', '10,000', '3,871,767'], 'counts are written out, never "10K"');
eq([F.pct(0.4716), F.pct(0.0016), F.pct(-0.0001), F.pct(0.30281, 1)], ['47%', '0%', '0%', '30.3%'], 'pct');
eq([F.millions(3871767), F.millions(4915355)], ['3.9', '4.9'], 'millions');
eq([F.hm(250), F.hm(239), F.hm(-61)], ['4:10', '3:59', '−1:01'], 'hm');
eq([F.clock(7397), F.clock(59), F.ms(162), F.ms(3725), F.delta(305.5), F.delta(-164.3), F.delta(0)], ['2:03:17', '0:00:59', '2:42', '1:02:05', '+5:06', '−2:44', '0:00'], 'clock, ms, delta (minus signs)');
eq([F.time(15000, 'h:mm'), F.time(162, 'm:ss'), F.time(7397)], ['4:10', '2:42', '2:03:17'], 'time');
eq([F.pace(300, 'mi'), F.pace(300, 'km'), F.pace(300, 'mi', false)], ['8:03/mi', '5:00/km', '8:03'], 'pace');
eq([F.ratio(1.7312), F.temp(6.8, 'mi'), F.temp(6.8, 'km'), F.temp(-3.2, 'km'), F.tempGap(5, 'mi'), F.tempGap(5, 'km'), F.tempGap(2.5, 'mi', 1)], ['1.73×', '44°F', '7°C', '−3°C', '9°F', '5°C', '4.5°F'], 'ratio, temp, tempGap (°F gap = °C × 9/5)');
eq([F.matLabel(30), F.sectionLabel(35, 40), F.sectionLabel(40, 42.195), F.distance(2.195, 'mi')], ['30K', '35–40K', '40K–finish', '1.4 mi'], 'mats, sections and prose distances');
eq([F.spokenTime(15000), F.spokenTime(162), F.spokenPct(0.4716)], ['4 hours 10 minutes', '2 minutes 42 seconds', '47 percent'], 'spoken twins');

// ---------- Text rules every nugget follows ----------
const BANNED = [
  [/arithmetic/i, 'the word "arithmetic"'], [/\bthe wall\b/i, '"the wall"'], [/\byour\s+(?:\S+\s+){0,2}chances?\b/i, '"your chance"'],
  [/\byour odds\b|\byou will\b/i, 'odds or a promise'], [/\bfastest\b/i, '"fastest"'], [/\b\d[\d,.]*\s+(?:million\s+)?runners\b/i, 'a count of runners (counts are finishes)'],
  [/private-export|20260912/i, 'a release tag'], [/\b(?:causes?|caused|costs|leads? to|led to|because|came from|due to|results? in)\b/i, 'a causal verb'],
];
const TWO_DECIMAL_MILES = /\d\.\d\d\s*(?:mi|miles?)\b/;
const texts = (t) => (typeof t === 'string' ? [t] : [t.mi, t.km]);

/** The problems with one nugget's shape and words (empty when it follows the contract). */
function problems(n, { strict }) {
  const out = [];
  for (const field of ['headline', 'fallback']) {
    const value = n[field];
    if (typeof value !== 'string' && !(value && typeof value.mi === 'string' && typeof value.km === 'string')) out.push(`${field} is neither a string nor { mi, km }`);
    for (const text of texts(value ?? '')) {
      if ((text.match(/\*/g) || []).length > 2) out.push(`${field} has more than one *…* accent: ${text}`);
      for (const [re, what] of BANNED) if (re.test(text)) out.push(`${field} has ${what}: ${text}`);
      if (strict && TWO_DECIMAL_MILES.test(text)) out.push(`${field} has a two-decimal mile figure: ${text}`);
    }
  }
  if (typeof n.guard !== 'boolean') out.push('guard is not a boolean');
  if (n.guard && !texts(n.headline).every(Boolean)) out.push('the guard holds but the headline is empty');
  if (!texts(n.fallback).every(Boolean)) out.push('the fallback is empty');
  if (n.figure && (!n.figure.value || !n.figure.sr)) out.push('a figure needs a value and its spoken twin');
  if (n.term && !/^\/methodology#[a-z0-9-]+$/.test(n.term)) out.push(`term ${n.term} is not a /methodology anchor`);
  if (!/^\//.test(n.page)) out.push(`page ${n.page} is not a path`);
  return out;
}

// ---------- The registry ----------
const N = require('../lib/nuggets/index.ts');
const core = require('../lib/nuggets/core.ts');
ok(N.NUGGET_IDS.length >= 3, 'the registry has nuggets');
const build = (id) => (N.CONTEXT_NUGGETS.includes(id) ? null : N.getNugget(id));
const all = N.NUGGET_IDS.map(build).filter(Boolean);
for (const n of all) {
  const found = problems(n, { strict: !n.placeholder });
  assert.deepEqual(found, [], `${n.id}: ${found.join('; ')}`); checks++;
  eq(core.sentenceOf(n, 'mi'), core.textFor(n.guard ? n.headline : n.fallback, 'mi'), `${n.id}: the page shows guard ? headline : fallback`);
}
for (const city of json('public/data/insights/courses.json').courses.map((c) => c.city)) {
  const n = N.getNugget('course.slowdown', { city });
  const found = problems(n, { strict: !n.placeholder });
  assert.deepEqual(found, [], `course.slowdown (${city}): ${found.join('; ')}`); checks++;
}
for (const [page, id] of Object.entries(N.PAGE_NUGGET)) ok(N.NUGGET_IDS.includes(id), `${page} names nugget ${id}, which is registered`);
eq(N.CHAPTER_LEAD.length, 11, 'one lead per chapter');
for (const id of N.CHAPTER_LEAD) ok(N.NUGGET_IDS.includes(id), `chapter lead ${id} is registered`);
// The contents keys are the approved wording (spec section 2.2), reproduced from the data where they hold a number.
const keys = Object.fromEntries(N.CHAPTER_LEAD.map((id) => [id, N.getNugget(id).key]));
eq(keys['field.median'], 'median finish', 'chapter 01 key');
eq(keys['slowdown.onset'], 'of sustained slowdowns began at 30K or later', 'chapter 05 key');
eq(keys['finish.busiest'], 'the busiest finishing minute', 'chapter 06 key');
eq(keys['holds.gender'], 'sustained slowdown, women · men, at the same finish times', 'chapter 07 key');
eq(keys['courses.spread'], 'sustained slowdown, across courses', 'chapter 08 key');
eq(keys['weather.pairs'], 'same-course pairs: the warmer year had more sustained slowdowns', 'chapter 09 key');
eq(keys['runner.yours'], 'nine mats, one race', 'chapter 10 key');
ok(/^of next races had one too, after a sustained slowdown \(\d+% typical\)$/.test(keys['kick.recurrence']), 'chapter 11 key');
ok(/^at the finish, after a first 5K over \d+% fast$/.test(keys['kick.bank']), 'chapter 02 key');

// lib/chapters.ts (WP0-B) names a nugget for every page and chapter: every one must be registered, and agree with
// PAGE_NUGGET and CHAPTER_LEAD here.
if (fs.existsSync(path.join(ROOT, 'lib/chapters.ts'))) {
  const { CHAPTERS } = require('../lib/chapters.ts');
  for (const chapter of CHAPTERS) {
    ok(N.NUGGET_IDS.includes(chapter.lead), `chapter ${chapter.n} lead ${chapter.lead} is registered`);
    eq(chapter.lead, N.CHAPTER_LEAD[chapter.n - 1], `chapter ${chapter.n}: lib/chapters.ts and CHAPTER_LEAD name the same lead`);
    for (const page of chapter.pages) {
      ok(N.NUGGET_IDS.includes(page.nugget), `${page.href} names nugget ${page.nugget}, which is registered`);
      eq(page.nugget, N.PAGE_NUGGET[page.href], `${page.href}: lib/chapters.ts and PAGE_NUGGET name the same nugget`);
    }
  }
}

// ---------- Independent recounts of the reference nuggets ----------
const insights = json('public/data/insights/manifest.json');
const runner = json('public/data/runners/manifest.json');
const courses = json('public/data/insights/courses.json');

const RECOUNT = {};
// site.totals: the eligible family from the insights manifest and the course list; results from the runner manifest.
RECOUNT['site.totals'] = (n) => {
  const years = courses.courses.flatMap((c) => c.years);
  let editions = 0;
  for (const c of courses.courses) editions += c.years.length;
  const expected = { results: runner.raw_records, finishes: insights.analysis_n, cities: insights.cohort.cities, race_years: editions, first_year: Math.min(...years), last_year: Math.max(...years) };
  eq(n.values, expected, 'site.totals recounts from the manifests and the course list');
  eq(n.values.cities, courses.courses.length, 'site.totals: cities = courses with eligible finishes');
  eq(runner.eligible_records, insights.analysis_n, 'site.totals: the runner and insights manifests agree on eligible finishes');
  const millions = (Math.round(insights.analysis_n / 1e5) / 10).toFixed(1);
  eq(n.figure.value, millions, 'site.totals: the figure is eligible finishes in millions');
  ok(core.textFor(n.headline, 'mi').includes(`*${millions} million*`) && core.textFor(n.headline, 'km').includes(`*${millions} million*`), 'site.totals: both headlines carry the same million');
  // The distance and its unit are held together by a no-break space.
  ok(/26\.2\smiles/.test(core.textFor(n.headline, 'mi')) && /42\.2\skm/.test(core.textFor(n.headline, 'km')), 'site.totals: the distance follows the units');
  eq(n.guard, insights.analysis_n > 0 && runner.raw_records >= insights.analysis_n && insights.cohort.cities > 0, 'site.totals: guard');
  eq(core.finishesM(), require('../lib/seo.tsx').finishesM(), 'one "N million" on every surface (lib/seo agrees)');
};

// field.median: nearest-rank medians recounted from the one-minute histogram and the cohort totals.
RECOUNT['field.median'] = (n) => {
  const ft = json('public/data/insights/finish-times.json');
  const totals = { all: insights.cohort.after_duplicate_screen, women: insights.cohort.women, men: insights.cohort.men };
  const median = (key) => {
    const rank = Math.ceil(totals[key] / 2);
    let seen = 0;
    for (const row of ft.histogram) { seen += row[key]; if (seen >= rank) return row.minute; }
    return null;
  };
  const m = { all: median('all'), women: median('women'), men: median('men') };
  eq([n.values.median_min, n.values.women_median_min, n.values.men_median_min], [m.all, m.women, m.men], 'field.median recounts the three medians');
  const clock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  eq(n.figure.value, clock(m.all), 'field.median: the figure');
  eq(n.guard, m.all !== null && m.women !== null && m.men !== null, 'field.median: guard');
  ok(n.headline.includes(`*${clock(m.all)}*`) && n.headline.includes(clock(m.women)) && n.headline.includes(clock(m.men)), 'field.median: the headline names the recounted medians');
};

// replay.first: the edition with the largest share of its field short of 20K at the first finish.
RECOUNT['replay.first'] = (n) => {
  const { editions } = json('public/data/insights/replay.json');
  let best = null;
  for (const e of editions) {
    if (!e.moments || !(e.finishes > 0)) continue;
    const share = e.moments.not_past_20_at_first / e.finishes;
    if (!best || share > best.share) best = { e, share };
  }
  eq([n.values.slug, n.values.share], [best.e.slug, best.share], 'replay.first recounts the argmax edition and its share');
  eq(n.guard, best.share >= 0.45 && best.share < 0.5, 'replay.first: "nearly half" only from 0.45 to under 0.5');
  eq(n.figure.value, String(Math.round(best.share * 100)), 'replay.first: the figure');
  ok(core.sentenceOf(n).includes(`${best.e.city} ${best.e.year}`), 'replay.first: the sentence names the edition the data chose');
};
// home.second20k (WP1, the home page's guess): the pacing-shapes row read as text, its percentage over 100 (the pack's
// other column), against the nugget's count over n; "Only" while under one half; the figure the closest "1 in d".
RECOUNT['home.second20k'] = (n) => {
  const lines = fs.readFileSync(path.join(ROOT, 'public/data/packs/ext_pacing_shapes/tables/patterns.csv'), 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const cells = lines.map((l) => l.split(',')).find((c) => c[head.indexOf('label')] === 'Faster second 20 km');
  ok(cells, 'home.second20k: the pack has its row');
  const share = Number(cells[head.indexOf('value')]) / 100;
  ok(Math.abs(n.values.share - share) < 1e-9, `home.second20k: the share recounts (${n.values.share} against ${share})`);
  eq([n.values.faster, n.values.total], [Number(cells[head.indexOf('count')]), Number(cells[head.indexOf('n_value')])], 'home.second20k: count and n');
  eq(n.values.total, insights.analysis_n, 'home.second20k: one family with the H1 above it (the eligible finishes)');
  let best = null;
  for (const d of [2, 3, 4, 5, 10, 20, 25, 50, 100]) { const err = Math.abs(1 / d - share) / share; if (err < 0.1 && (!best || err < best.err)) best = { d, err }; }
  const words = best ? `1 in ${best.d}` : `${Math.round(share * 100)}%`;
  eq(n.figure.value, words, 'home.second20k: the figure is the closest plain fraction');
  eq(n.guard, share > 0 && share < 0.5, 'home.second20k: "Only" while the share is under one half');
  eq(core.sentenceOf(n), n.guard ? `Only about *${words}* did.` : `About *${words}* did.`, 'home.second20k: the sentence');
};
// The story nuggets (WP2): their recounts and fixtures live in scripts/nuggets/stories.cjs.
const storyRecounts = require('./nuggets/stories.cjs')({ json, eq, ok, core });
Object.assign(RECOUNT, storyRecounts.RECOUNT);
// The analysis and /slowdown nuggets (WP3): their recounts and fixtures live in scripts/nuggets/analyses.cjs.
const analyses = require('./nuggets/analyses.cjs')({ json, eq, ok, core });
Object.assign(RECOUNT, analyses.RECOUNT);
// The tool nuggets (WP4): their recounts and fixtures live in scripts/nuggets/tools.cjs.
const toolNuggets = require('./nuggets/tools.cjs')({ json, eq, ok, core });
Object.assign(RECOUNT, toolNuggets.RECOUNT);
for (const [id, recount] of Object.entries(RECOUNT)) {
  const n = N.getNugget(id);
  ok(!n.placeholder, `${id} is a real nugget, not a placeholder`);
  recount(n);
}

// ---------- Fixtures: every reference fallback renders, and a flipped guard is caught ----------
if (!args.has('--no-fixture')) {
  const stories = require('../lib/nuggets/stories.ts');
  const home = require('../lib/nuggets/home.ts');
  const fallbacks = [
    [stories.replayFirstFrom([{ slug: 'x-2020', city: 'Fixture', year: 2020, finishes: 1000, moments: { not_past_20_at_first: 300, first_finish_s: 7400 } }]), 'When the first runner finished Fixture 2020, *30%* of the field had not reached 20K.'],
    [stories.replayFirstFrom([{ slug: 'x-2021', city: 'Fixture', year: 2021, finishes: 1000, moments: { not_past_20_at_first: 600, first_finish_s: 7400 } }]), 'When the first runner finished Fixture 2021, *60%* of the field had not reached 20K.'],
    [stories.replayFirstFrom([]), 'Watch a marathon unfold, the whole field on one clock.'],
    [stories.fieldMedianFrom({ all: 250, women: null, men: 239, total: 10 }), 'Half of all finishes took longer than *4:10*.'],
    [stories.fieldMedianFrom({ all: null, women: null, men: null, total: 0 }), 'Finish times, every recorded minute.'],
    [home.siteTotalsFrom({ results: 10, finishesEligible: 20, cities: 1, raceYears: 1, firstYear: 2020, lastYear: 2020, raw: { cities: 1, raceYears: 1, firstYear: 2020, lastYear: 2020 } }), 'Marathon finishes, mat by mat.'],
    [home.second20kFrom({ count: 60, total: 100 }), 'About *60%* did.'],
    [home.second20kFrom({ count: 50, total: 100 }), 'About *1 in 2* did.'],
    [home.second20kFrom(null), 'The second 20K against the first, finish by finish.'],
    ...storyRecounts.fixtures(stories),
    ...analyses.fixtures(require('../lib/nuggets/analyses.ts')),
    ...toolNuggets.fixtures(require('../lib/nuggets/tools.ts')),
  ];
  for (const [n, text] of fallbacks) {
    eq(n.guard, false, `fixture ${n.id}: the guard fails`);
    eq(core.sentenceOf(n), text, `fixture ${n.id}: the fallback renders`);
    eq(problems(n, { strict: true }), [], `fixture ${n.id}: the fallback follows the text rules`);
  }
  // Self-test: each reference recount, given its nugget with the guard flipped, must fail.
  for (const [id, recount] of Object.entries(RECOUNT)) {
    const real = N.getNugget(id);
    let caught = false;
    try { recount({ ...real, guard: !real.guard }); } catch { caught = true; }
    ok(caught, `self-test: ${id} with its guard flipped fails its recount`);
  }
  const real = N.getNugget('replay.first');
  for (const [text, what] of [['This costs runners 5 minutes.', 'causal'], ['Your chance of a sub-4', 'chance'], ['The last 1.36 mi', 'two-decimal'], ['*a* and *b*', 'accent'], ['10 runners slowed', 'runners']]) {
    ok(problems({ ...real, guard: true, headline: text }, { strict: true }).length > 0, `self-test: the checker catches ${what} wording`);
  }
  console.log(`verify-nuggets fixtures: ${fallbacks.length} fallbacks render, a flipped guard and planted wording are caught`);
}

// ---------- Placeholders ----------
const remaining = N.placeholderIds();
if (args.has('--no-placeholders') && remaining.length) {
  console.error(`verify-nuggets: ${remaining.length} placeholder nuggets remain: ${remaining.join(', ')}`);
  process.exit(1);
}
console.log(`verify-nuggets: ${all.length + 1} nuggets (${N.NUGGET_IDS.length} ids), ${checks} checks; the reference nuggets (site.totals, field.median, replay.first) and the home page's (home.second20k) recount independently. Placeholders still to replace (${remaining.length}): ${remaining.join(', ')}`);
