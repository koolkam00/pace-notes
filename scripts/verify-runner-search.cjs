// The runner search on lookup version 2 (schema 2): the browser client (lib/runner-search.ts), the search screens
// (components/RunnerSearch.tsx and components/runner/) and the /runners page. Three parts:
//   1. unit checks on fixtures: names, tokens, metrics, profile checks, what each result offers, the two lists, possible
//      matches, tier and link labels, the selection summary, copy editions, privacy and the page;
//   2. parity with the reference reader (scripts/lib/lookup-files.cjs) on a real build: thousands of queries at both
//      stages and both limits, the page's own search flow, and profiles, compared field by field;
//   3. refusals: a build whose bytes differ from their digests, or whose manifest names another release, loads nothing.
// The build is the committed lookup in public/data/runners (November 19, 2026: the final schema 2 lookup is committed and
// no development build remains). A folder that is not a schema 2 lookup fails this check: it is never skipped.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const LOOKUP_DIR = path.join(ROOT, 'public/data/runners');
const SERVED = '/data/runners/';
const QUERY_COUNT = Number(process.env.RUNNER_SEARCH_QUERIES || 2000);

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...args);
};

const C = require('../lib/runner-search.ts');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SelectedAnalysis, RunnerRecordDetails, RecordedDetails, NoMatchNext } = require('../components/RunnerSearch.tsx');
const ProfileView = require('../components/runner/ProfileView.tsx').default;
const { matchLine, sizeLabel, SearchMore, MatchRows, alikeRows, matchKey } = require('../components/runner/SearchResults.tsx');
const { listSummary } = require('../components/runner/ProfileView.tsx');
const { statusTag, showsLinkWords } = require('../components/runner/records.tsx');
const tiers = require('../lib/tiers.ts');
const h = React.createElement;
const html = element => renderToStaticMarkup(element);
const occurrences = (text, part) => text.split(part).length - 1;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
let checks = 0;
const waiting = [];
const ok = (value, message) => { assert.ok(value, message); checks++; };

// ---------------------------------------------------------------------------------------------------------------
// Fixtures in the client's own shapes (RunnerEdition, RunnerRace)
// ---------------------------------------------------------------------------------------------------------------
const edition = (index, city, year, extra = {}) => ({ index, distance: 'marathon', city, race: `${city} Marathon`, year, tier: 0, splits: true, db: 'f', noComparison: 0, q: 0, context: index, reason: null, unlisted: 0, timing: 'chip', ...extra });
const OWN = 'This edition is not verified, so it is compared with no other finishes.';
const HELD = 'This edition is held for review.';
const editions = [
  edition(0, 'London', 2020), edition(1, 'Boston', 2020), edition(2, 'Berlin', 2021),
  edition(3, 'Lakeside', 2018, { tier: 4, reason: OWN, context: null }),
  edition(4, 'Riverside', 2019, { tier: 3, splits: false, reason: HELD, context: null }),
  edition(5, 'Berlin', 2022, { distance: 'half', race: 'Berlin Half Marathon', db: 'h', context: null }),
  edition(6, 'Prague', 2023, { distance: 'half', race: 'Prague Half Marathon', db: 'h', context: null, tier: 4, noComparison: 1, timing: 'gun' }),
  edition(7, 'Madrid', 2019, { tier: 4, reason: OWN, context: null }),
];
const manifest = { schema_version: 2, release_tag: C.RUNNER_RELEASE, editions };
const POINTS = C.POINTS_KM.marathon;
const race = (id, ed, pace = 300, extra = {}) => {
  const e = editions[ed], marathon = e.distance === 'marathon', db = marathon ? 'f' : 'h';
  const times = C.POINTS_KM[e.distance].map(km => Math.round(km * pace));
  const status = marathon ? (e.reason === null ? 0 : e.splits ? 1 : 6) : null;
  return { key: db + id, db, id, edition: ed, distance: e.distance, name: 'José Smith', sex: null, age: null, times, link: '0', confirmed: false, screen: null, possible: false,
    status, eligible: marathon && (status === 0 || status === 1), counted: status === 0, reason: status === 1 || status === 6 ? e.reason : null, ...extra };
};
const linked = (r, link = '2', screen = 'bcd'.includes(link) ? 'birth_year_spread' : null) => ({ ...r, link, confirmed: C.CONFIRMED_LINKS.includes(link), screen, possible: !C.CONFIRMED_LINKS.includes(link) });

async function units() {
  // Names as shown: a token of digits alone never leads (round 6); a name of digits alone is shown as recorded.
  assert.equal(C.displayName('MARTIN, 1728207887'), 'Martin');
  assert.equal(C.displayName('Martin, Anne'), 'Anne Martin');
  assert.equal(C.displayName('SMITH, JOSÉ (GBR)'), 'José Smith · GBR');
  // Normalisation and tokens (the reference's rules, D24.4 and D24.5): accents and the fold table, whole words first,
  // beginnings in stage 2 only from three characters.
  assert.equal(C.normalizeName('𠮷野家'), '𠮷野家');
  assert.equal(C.normalizeName('Łukasz Øster-Straße'), 'lukasz oster strasse');
  const matches = (name, query, stage) => C.rowMatches(C.searchWords(name), C.queryTokens(query, stage), stage);
  ok(matches('Smith, José', 'jose smith', 1), 'Name order and accents never hide a match');
  ok(!matches('Smith, José', 'jos smi', 1) && matches('Smith, José', 'jos smi', 2), 'Stage 1 is whole words; stage 2 beginnings');
  ok(!matches('Smith, José', 'jos bro', 2), 'Every token must match');
  ok(!matches('William Smith', 'li smi', 2) && !matches('Liam Smith', 'li', 2) && matches('Li Smith', 'li smi', 2), 'A token under three characters matches a whole word only');
  ok(!matches('José Smith', '***', 2) && C.queryTokens('***', 1).length === 0, 'Punctuation alone is no query');
  assert.deepEqual(C.queryTokens('mar mart', 2), ['mart'], 'In stage 2 a token that begins another adds nothing');
  // Record keys (D18): a bare id is the marathon database's; f and h are themselves; nothing else is a key.
  assert.equal(C.recordKey('123'), 'f123'); assert.equal(C.recordKey('h77'), 'h77'); assert.equal(C.recordKey('f0'), 'f0');
  for (const bad of ['x1', 'f', '01', '1e3', 'f12 3', '-4', 'h1.5']) assert.equal(C.recordKey(bad), null, bad);
  assert.equal(sizeLabel(74321), '74 KB'); assert.equal(sizeLabel(412000), '412 KB'); assert.equal(sizeLabel(1234567), '1.2 MB');

  // Metrics: whole seconds; a boundary pace survives; out-of-order or missing times have none; halves have none.
  const base = race(1, 0), changed = race(2, 1, 280), later = race(3, 2, 270);
  const metrics = C.runnerMetrics(base);
  close(metrics.finish, 12659); close(metrics.pace, 12659 / 42.195); close(metrics.sections[8].end - metrics.sections[8].start, 2.195);
  ok(C.runnerMetrics({ ...base, times: [...base.times.slice(0, 8), base.times[7] + Math.ceil(2.195 * 120)] }), 'A permitted boundary pace survives');
  const slowing = race(4, 1, 300, { times: POINTS.map(km => Math.round(km * 300 + Math.max(0, km - 30) * 60)) });
  ok(C.runnerMetrics(slowing).lateChange > 19 && C.runnerMetrics(slowing).lateChange < 21, 'Late change read from the times');
  assert.equal(C.runnerMetrics({ ...base, times: [null, ...base.times.slice(1)] }), null);
  assert.equal(C.runnerMetrics({ ...base, times: base.times.map((t, i) => i === 1 ? base.times[0] : t) }), null);
  assert.equal(C.runnerMetrics(race(5, 5)), null, 'A half marathon has no pacing metrics in this adoption');
  const held = race(6, 4, 200, { name: 'Casey Partial' }), missing = race(7, 0, 200, { name: 'Casey Partial', status: 3, eligible: false, counted: false, reason: 'One or more checkpoint times are missing or could not be parsed.', times: [null, ...base.times.slice(1)] });
  assert.equal(C.runnerMetrics(held), null, 'Fast times in a held edition never become a best');
  assert.equal(C.runnerProgression([held, missing], manifest), null);
  assert.equal(C.runnerProgression([base, changed], manifest).yearChange, null, 'Two same-year races establish no chronology');
  const progression = C.runnerProgression([later, held, changed, base], manifest);
  assert.equal(progression.valid.length, 3); assert.equal(progression.best.race.key, later.key);
  assert.equal(C.runnerDuration(59.9996), '0:01:00'); assert.equal(C.runnerDuration(12659), '3:30:59'); assert.equal(C.runnerDuration(null), 'Not recorded');

  // A decoded profile as the page takes it: codes it does not know, a result that contradicts its edition, a lone
  // unlinked result inside a group, or confirmed and screened links in one person are refused.
  const decoded = r => ({ edition: r.edition, db: r.db, id: r.id, key: r.key, distance: r.distance, finish: r.times.at(-1), sex: r.sex, age: r.age, link: r.link, confirmed: r.confirmed, screen: r.screen, status: r.status === null ? null : String(r.status), name: r.name, times: r.times });
  const profileOf = (...rs) => C.runnerProfile({ names: ['José Smith'], results: rs.map(decoded) }, 1, 0, manifest);
  const lone = profileOf(race(10, 0));
  ok(lone.races.length === 1 && !lone.races[0].possible, 'A profile of one result is its own result, never a possible match');
  assert.equal(profileOf({ ...race(10, 0), age: 1923 }).races[0].age, 1923, 'A suspect recorded age is kept as recorded, never corrected');
  const group = profileOf(linked(race(11, 0)), linked(race(12, 5)), linked(race(13, 3), '5'), linked(race(14, 6), 'a'));
  const screened = profileOf(linked(race(15, 0), 'c'), linked(race(16, 5), 'd'));
  ok(screened.races.every(r => r.possible && !r.confirmed), 'A person whose keyed tiers failed a screen: every result a possible match');
  assert.deepEqual(group.races.map(r => [r.key, r.confirmed, r.possible]), [['f11', true, false], ['h12', true, false], ['f13', false, true], ['h14', false, true]]);
  assert.equal(group.races[2].reason, OWN, 'An own-record race carries its edition\'s sentence');
  assert.throws(() => profileOf(race(10, 0), race(10, 0)), /verified/, 'One record twice');
  assert.throws(() => profileOf(linked(race(11, 0)), race(12, 1)), /verified/, 'An unlinked result is its own result');
  assert.throws(() => profileOf(linked(race(11, 0)), linked(race(12, 1), 'c')), /verified/, 'A person\'s confirmed tiers are all keyed or none');
  assert.throws(() => profileOf({ ...race(11, 0), link: 'z' }), /verified/, 'An unknown link code is refused');
  // The screen (the lookup's w): exactly on codes b, c and d, and only one the page knows.
  assert.equal(screened.races[0].screen, 'birth_year_spread', 'A screened link carries its own screen');
  assert.throws(() => profileOf(linked(race(15, 0), 'c', null), linked(race(16, 5), 'd')), /verified/, 'A screened link without its screen is refused');
  assert.throws(() => profileOf(linked(race(11, 0), '2', 'sex_conflict'), linked(race(12, 5))), /verified/, 'A keyed link carries no screen');
  assert.throws(() => profileOf(linked(race(15, 0), 'c', 'shoe_size'), linked(race(16, 5), 'd')), /verified/, 'An unknown screen is refused');
  assert.throws(() => profileOf({ ...linked(race(11, 0)), screen: undefined }, linked(race(12, 5))), /verified/, 'A result without the screen field is refused');
  assert.throws(() => profileOf({ ...race(11, 0), key: 'h11' }), /verified/, 'A key names its database');
  assert.throws(() => profileOf({ ...race(11, 3), status: 0 }), /verified/, 'Counted only in a counted edition');
  assert.throws(() => profileOf({ ...race(11, 0), status: 9 }), /verified/);
  assert.throws(() => profileOf({ ...race(11, 5), status: 0 }), /verified/, 'A half carries no marathon status');
  assert.throws(() => profileOf({ ...race(11, 0), times: race(11, 0).times.slice(1) }), /verified/, 'A marathon has nine times');

  // What each result offers (R4, D20): its tag and the sentence in its disclosure, from the lookup's codes.
  const tag = r => statusTag({ race: r, manifest }, []);
  assert.equal(tag(base), null, 'A counted race says nothing more');
  // November 20, 2026 (decision D49, review m2): the words come from the tier module's record vocabulary; an
  // own-record race now says its offer, and a missing pacing report its reason, in words no edition label uses.
  assert.equal(tag(race(20, 3)), 'Own pacing only', 'An own-record race says it offers its own pacing only');
  assert.equal(tag(race(21, 4)), null, 'A finish-times-only edition is marked by its own label');
  assert.equal(tag(race(22, 0, 300, { status: 4, eligible: false, counted: false, reason: 'Checkpoint times are not strictly increasing.' })), 'No pacing report: times out of order');
  assert.equal(tag(missing), 'No pacing report: checkpoint times missing');
  assert.equal(tag(race(23, 0, 300, { status: 2, eligible: false, counted: false, reason: 'Duplicate of another recorded race; excluded from analysis.' })), 'No pacing report: duplicate of another record');
  assert.equal(tag(race(23, 0, 300, { status: 5, eligible: false, counted: false, reason: 'Finish or section pace falls outside the study quality bounds.' })), 'No pacing report: outside the pace bounds');
  assert.equal(tag(race(23, 0, 300, { status: 6, eligible: false, counted: false, reason: 'x' })), 'No pacing report: race not analysed for pacing', 'Status 6 in an edition with splits that is not held');
  assert.equal(statusTag({ race: { ...race(23, 0, 300, { status: 6, eligible: false, counted: false, reason: 'x' }), edition: 1 }, manifest: { ...manifest, editions: editions.map(e => e.index === 1 ? { ...e, tier: 3 } : e) } }, []), 'No pacing report', 'A held edition\'s record: the label says why, the row says no report');
  assert.equal(tag(race(24, 5)), null); assert.equal(tag(race(25, 6)), null, 'A gun-time half says so by its label, not a tag');
  assert.equal(statusTag({ race: race(25, 6), manifest: { ...manifest, editions: editions.map(e => e.index === 6 ? { ...e, noComparison: 2, timing: 'chip' } : e) } }, []), 'Listed, not compared', 'A half whose course is suspected short');
  for (const file of ['components/runner/records.tsx', 'components/RunnerSearch.tsx', 'components/RunnerContext.tsx']) ok(!/Recorded times only|Limited: |Limited analysis|'Not compared'/.test(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${file} writes no hand-made record status`);
  const opened = r => html(h(RecordedDetails, { race: r, manifest }));
  assert.match(opened(race(26, 3)), new RegExp(`${OWN} This record keeps its own pacing view and is compared with no other finishes\\.`));
  assert.match(opened(missing), /One or more checkpoint times are missing or could not be parsed\. Pacing and peer comparisons are unavailable for this record\./);
  assert.match(opened(missing), /Not recorded/, 'Missing checkpoints stay missing');
  assert.match(opened(missing), /Record f7\./, 'The record key is the disclosure\'s, in its new form');
  const halfOpened = opened(race(27, 6));
  assert.match(halfOpened, /This edition’s times are not compared with other races\./);
  assert.doesNotMatch(halfOpened + opened(race(28, 5)), /report|pacing view|coming|later|soon/i, 'A half promises nothing more');
  assert.match(opened(race(28, 5)), /Record h28\./);

  // A row: race and year, finish, the edition's tier (every row, the Verified badge too), Finish times only, and Gun
  // times only from the lookup's timing class (the required editions column tb).
  const row = (r, extra = {}) => html(h(RunnerRecordDetails, { race: r, manifest, ...extra }));
  assert.match(row(base), /<strong>London 2020<\/strong>/); assert.match(row(base), /3:30:59/);
  assert.match(row(base), /class="tier-badge" data-tier="stamped">Verified</, 'A verified edition shows its badge on the row');
  assert.match(row(race(29, 4)), /data-tier="held_for_review">Held for review<[\s\S]*data-split-tier="finish_time_only">Finish times only</);
  assert.match(row(race(30, 6)), /data-timing="gun">Gun times</, 'A gun-timed edition says so');
  assert.doesNotMatch(row(base), /Gun times/, 'A chip-timed edition says nothing about timing');
  for (const timing of ['chip_fallback', 'mixed', 'not_stated']) assert.doesNotMatch(html(h(RunnerRecordDetails, { race: base, manifest: { ...manifest, editions: editions.map(e => ({ ...e, timing })) } })), /Gun times/, timing);
  assert.doesNotMatch(row(base), /José Smith|Age not recorded|Recorded gender/, 'The row carries no name, age or gender: they are in the disclosure');
  assert.doesNotMatch(row(base) + row(race(31, 4)), /href=/, 'A row is a checkbox label: its labels are bare');

  // Link confidence: quiet words on a linked row (the screen-reader prefix says what they are); a possible match
  // carries the pill and its words; a screened keyed tier states its own screen (the lookup's w, per result).
  const linkHtml = r => row(r, { linked: true });
  assert.match(linkHtml(linked(base, '2')), /<span class="sr-only">Link confidence: <\/span>High</);
  assert.doesNotMatch(linkHtml(linked(base, '2')), /Possible match/, 'A keyed link is no possible match');
  assert.match(linkHtml(linked(base, '6')), /Possible match[\s\S]*Low, no age/);
  assert.match(linkHtml(linked(base, 'c')), /Possible match[\s\S]*High[\s\S]*recorded ages differ/);
  assert.match(linkHtml(linked(base, 'b', 'sex_conflict')), /Possible match[\s\S]*High, elite[\s\S]*recorded sexes differ/);
  assert.match(linkHtml(linked(base, 'd', 'two_results_in_one_edition')), /Possible match[\s\S]*Medium[\s\S]*two results in one edition/);
  // Every tier is reachable on a row: a row of the runner's own results leaves out only "High", which the key line says.
  ok(!showsLinkWords(linked(base, '2')) && showsLinkWords(linked(base, '1')) && showsLinkWords(linked(base, '3')), 'Own rows show every tier but High');
  ok([...'456789abcd'].every(code => showsLinkWords({ ...linked(base, code), possible: true })), 'A possible match always shows its words');
  assert.doesNotMatch(row(linked(base, '2')), /Link confidence/, 'A row outside a group of several shows no link');

  // The profile: two lists, each with its own count, span and best; possible matches apart under their own heading,
  // unticked; nothing counted across distances or from a possible match.
  const profile = { shard: 1, position: 0, names: ['José Smith', 'Jose Smith'], races: [
    linked(race(40, 0, 300)), linked(race(41, 2, 280, { name: 'Jose Smith' })), linked(race(42, 5, 290)), linked(race(43, 1, 250, { name: 'J Smith' }), '5'), linked(race(44, 6, 200), '9'),
  ] };
  const lists = C.runnerLists(profile, manifest);
  assert.deepEqual(lists.map(l => [l.distance, l.own.map(r => r.key), l.possible.map(r => r.key)]), [['marathon', ['f41', 'f40'], ['f43']], ['half', ['h42'], ['h44']]]);
  assert.equal(lists[0].summary.best.key, 'f41', 'The best is the list\'s own fastest, never a faster possible match (f43)');
  assert.equal(lists[1].summary.count, 1, 'A half list counts its own results only');
  assert.equal(listSummary(lists[0], manifest), '2 results · 2020–2021 · fastest recorded finish 3:16:55, Berlin 2021');
  assert.equal(listSummary(lists[1], manifest), null, 'One result needs no summary line');
  const view = html(h(ProfileView, { profile, manifest, opened: 'José Smith', selected: new Set(), onToggle: () => {} }));
  // November 19, 2026: forms that differ only in accents, case, word order or a trailing code are one heading form (the
  // real page showed one name three ways); each record keeps its own spelling in its details.
  assert.match(view, /<h2[^>]*>José Smith<\/h2>/, 'The name forms on record, one per set of search words');
  const forms = html(h(ProfileView, { profile: { ...profile, names: ['Smith, José', 'José Smith (GBR)', 'Anna Smith'], races: [linked(race(40, 0), '2', null), { ...linked(race(41, 2)), name: 'José Smith (GBR)' }, { ...linked(race(45, 1)), name: 'Anna Smith' }].map((r, i) => i === 0 ? { ...r, name: 'Smith, José' } : r) }, manifest, opened: 'x', selected: new Set(), onToggle: () => {} }));
  assert.match(forms, /<h2[^>]*>José Smith \/ Anna Smith<\/h2>/, 'Distinct names stay; word order and a code do not make a second form');
  assert.deepEqual([...view.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(m => m[1]), ['Marathons', 'Half marathons']);
  assert.equal(occurrences(view, '>Possible matches</h4>'), 2, 'Possible matches apart in each list');
  assert.equal(occurrences(view, 'type="checkbox"'), 5); assert.doesNotMatch(view, /checked=""/, 'Nothing is ticked by the page');
  assert.equal(occurrences(view, 'data-tier='), 5, 'Every row shows its edition\'s tier');
  assert.deepEqual([...view.matchAll(/data-offer="(\w+)"/g)].map(m => m[1]), ['report', 'report', 'report', 'times', 'times'], 'Each row says what it offers: the report for a counted marathon, recorded times for a half');
  assert.match(view, /<p class="runner-list-key">Each row: race, finish and its <a [^>]*href="\/methodology#edition-tiers"[^>]*>results<\/a> label\. <a [^>]*href="\/methodology#link-confidence"[^>]*>Link confidence<\/a>: High for every race\.<\/p>/, 'One key line says what each row holds and the link confidence the rows leave unsaid');
  assert.doesNotMatch(view.slice(0, view.indexOf('runner-possible-block')), /data-link-tier="high"/, 'An own row with High shows no link words');
  // November 20, 2026 (review m10): the key line is said once, above both lists, counted over both lists' own results.
  assert.equal(occurrences(view, 'class="runner-list-key"'), 1, 'One key line for the profile'); ok(view.indexOf('runner-list-key') < view.indexOf('data-distance="marathon"'), 'The key line stands above both lists');
  const mixedLinks = { ...profile, races: [linked(race(40, 0, 300)), linked(race(41, 2, 280), '3')] };
  const mixedView = html(h(ProfileView, { profile: mixedLinks, manifest, opened: 'José Smith', selected: new Set(), onToggle: () => {} }));
  assert.match(mixedView, /Link confidence<\/a>: High unless the row says otherwise\./); assert.match(mixedView, /data-link-tier="medium"/);
  const allMedium = html(h(ProfileView, { profile: { ...profile, races: [linked(race(40, 0), '3'), linked(race(41, 2), '3')] }, manifest, opened: 'José Smith', selected: new Set(), onToggle: () => {} }));
  assert.match(allMedium, /Link confidence<\/a> is shown on each row\./);
  assert.match(view, /Recorded as/, 'A possible match recorded under another spelling says so');
  const marathonList = view.slice(view.indexOf('data-distance="marathon"'), view.indexOf('data-distance="half"'));
  ok(!marathonList.includes('h42') && !marathonList.includes('Prague 2023'), 'A list holds one distance');
  // A group with no result of its own has no confirmed name.
  const loose = { shard: 1, position: 1, names: ['A Runner', 'B Runner'], races: [linked(race(50, 0), '5'), linked(race(51, 1), '7')] };
  const looseView = html(h(ProfileView, { profile: loose, manifest, opened: 'A Runner', selected: new Set(), onToggle: () => {} }));
  assert.match(looseView, /<h2[^>]*>A Runner<\/h2>/); assert.match(looseView, /2 results that may belong together/);
  // Search rows say what each row is, distances apart, possible matches counted apart.
  const m = { name: 'Smith, José', shard: 1, position: 0, edition: null, marathons: 3, halves: 2, possible: 1, onlyPossible: false, firstYear: 2011, lastYear: 2025 };
  assert.equal(matchLine(m, manifest), '3 marathons · 2 half marathons · 2011–2025 · 1 possible match');
  assert.equal(matchLine({ ...m, edition: 5 }, manifest), 'Berlin 2022 · half marathon');
  assert.equal(matchLine({ ...m, marathons: 0, halves: 0, possible: 4 }, manifest), '4 results that may belong together · 2011–2025');
  assert.equal(matchLine({ ...m, onlyPossible: true, possible: 2 }, manifest), '2 possible matches · 2011–2025');
  // November 20, 2026 (review M7): the rows whose name is exactly what was typed come first, then the order before; rows
  // that read the same (one name, one line) are numbered, since the index holds nothing more for a row.
  const rowsOf = [{ ...m, name: 'Smith, José Maria', position: 1 }, { ...m, name: 'Ana Smith', position: 2 }, { ...m, name: 'Smith, José', position: 3, edition: 0 }, { ...m, name: 'José Smith', position: 4, edition: 0 }, { ...m, name: 'Jose A Smith', position: 5 }];
  assert.deepEqual(C.sortMatches(rowsOf, manifest, 'jose smith').map(r => r.position), [3, 4, 2, 5, 1], 'The two exact rows, then the others by name');
  ok(C.sortMatches(rowsOf, manifest, 'jose smith').slice(0, 2).every(r => C.exactName(r, C.queryTokens('jose smith', 1))) && C.exactName({ name: 'José Smith (ESP)' }, ['jose', 'smith']) && !C.exactName({ name: 'Jose A Smith' }, ['jose', 'smith']), 'Exact names first: word order, accents and a country code aside, no extra word');
  assert.deepEqual(C.sortMatches(rowsOf, manifest).map(r => r.position), C.sortMatches(rowsOf, manifest, '').map(r => r.position), 'Without a query the order is the one before');
  const alike = alikeRows(C.sortMatches(rowsOf, manifest, 'jose smith'), manifest);
  assert.deepEqual([...alike.values()], ['1 of 2 listed alike', '2 of 2 listed alike'], 'Two rows of one shown name and one race are numbered');
  assert.equal(alike.size, 2); ok(!alike.has(matchKey(rowsOf[0])), 'A row unlike every other has no number');
  assert.match(html(h(MatchRows, { rows: C.sortMatches(rowsOf, manifest, 'jose smith').slice(0, 2), manifest, openKey: null, loadingKey: null, onOpen: () => {}, alike })), /<small>London 2020 · marathon · 1 of 2 listed alike<\/small>[\s\S]*<small>London 2020 · marathon · 2 of 2 listed alike<\/small>/);
  // The press states: a size on the button, a refusal past the cap, a second word for a common word.
  const more = r => html(h(SearchMore, { result: { matches: [], stage: 1, bytes: 0, alone: null, more: null, capped: null, ...r }, searched: 'smith', busy: false, onMore: () => {} }));
  assert.match(more({ more: { step: 'whole', bytes: 412000 } }), /List them \(412 KB\)/);
  assert.match(more({ more: { step: 'beginnings', bytes: 0 } }), /Show names that start with these words</);
  assert.match(more({ capped: 'whole' }), /Too many recorded names match to list\. Add another name\./);
  assert.match(more({ alone: { word: 'smith', names: 81234 } }), /81,234 recorded names include “smith”\.[\s\S]*Add a first name or a surname\./);

  // The selection: a ticked possible match is named wherever the selection is summed up; halves are listed apart,
  // never in a pacing figure.
  const render = (races, unit = 'mi', extra = {}) => html(h(SelectedAnalysis, { races, manifest, units: unit, ...extra }));
  const withPossible = render([linked(race(60, 0)), linked(race(61, 1, 280), '5')]);
  assert.match(withPossible, /Includes <a [^>]*href="\/methodology#link-confidence"[^>]*>1 possible match<\/a> you selected\./);
  assert.doesNotMatch(render([linked(race(60, 0)), linked(race(61, 1, 280))]), /possible match/i);
  const halvesOnly = render([race(62, 5), race(63, 6)]);
  assert.match(halvesOnly, /Half marathons are listed with their recorded finish and labels\./);
  assert.doesNotMatch(halvesOnly, /[0-9]:[0-5][0-9]\/(?:mi|km)|rc-multi|runner-context/, 'No figure is computed from a half');
  const mixed = render([base, race(64, 5)]);
  assert.match(mixed, /1 selected half marathon/);
  // November 20, 2026 (review m11): a half ticked beside marathons is said to be outside the comparison.
  assert.match(mixed, /The half marathon you selected is listed, but it is not part of the comparison, which holds marathons only\./);
  assert.doesNotMatch(render([base, later]), /not part of the comparison/, 'Nothing is said when no half is selected'); assert.doesNotMatch(mixed, /Berlin 2022 ·[^<]*\/mi/);
  const ownRecord = render([race(65, 3)]);
  assert.match(ownRecord, /Lakeside 2018/); assert.match(ownRecord, /data-tier="unverified"/, 'An own-record view carries its edition\'s label');

  // The pacing views as before (round 4 and the report's verdict): kept from the schema 1 checks.
  const twoHtml = render([base, later]);
  assert.match(twoHtml, /class="rc-multi"/); assert.match(twoHtml, /<h2 id="[^"]*-title" class="sr-only">/);
  assert.doesNotMatch(twoHtml, /runner-numbers|Fastest selected eligible finish|recorded progression/);
  const fading = race(66, 1, 300, { times: POINTS.map(km => Math.round(km * 300 + Math.max(0, km - 30) * 90)) });
  // November 20, 2026 (review m3): the verdict takes the one decimal of the lap list's rows beside it.
  assert.match(render([fading]), /class="rc-h">A <a [^>]*>sustained slowdown<\/a> from 30K, 30\.0% off the 5–⁠?20K pace\.<\/h3>/);
  assert.match(render([fading]), /Highlighted: the sustained slowdown\./);
  const mileHtml = render([base, held]);
  assert.match(mileHtml, /<h2 id="[^"]*-title">London 2020, 3:30:59<\/h2>/, 'A faster held result never replaces the eligible finish');
  assert.match(mileHtml, /limited analysis/i); assert.match(mileHtml, /Casey Partial/); assert.match(mileHtml, new RegExp(HELD));
  assert.doesNotMatch(render([base, held], 'mi', { listed: new Set([base.key, held.key]) }), /limited analysis|Casey Partial/i, 'A record the open profile lists is not listed again');
  assert.doesNotMatch(mileHtml, /\d\.\d\d\s*mi\b/); assert.match(render([base], 'km'), /\/km/); assert.doesNotMatch(render([base], 'km'), /\d\/mi\b/);
  const limited = render([held, missing]);
  assert.match(limited, /Your race records are here/); assert.match(limited, /Not recorded/);
  assert.doesNotMatch(limited, /Fastest selected eligible finish|Average pace|[0-9]:[0-5][0-9]\/(?:mi|km)|runner-peer|finish-percentile/, 'Records without a pacing view invent no figure');

  // Copy editions (lib/duplicate-editions.ts) stay recorded times only and reach no figure (kept from schema 1).
  const { copyEditions, copyEditionSentence, isCopyEdition } = require('../lib/duplicate-editions.ts');
  const lake = { ...manifest, editions: [...editions, edition(8, 'Lakeside', 2024), edition(9, 'Lakeside', 2019, { reason: null })] };
  const copies = [{ city: 'Lakeside', year: 2019, duplicate_of: 2024, eligible_removed: 51530, identical_nine_time_twins: 51212 }];
  ok(isCopyEdition({ city: 'Lakeside', year: 2019 }, copies) && !isCopyEdition({ city: 'Lakeside', year: 2024 }, copies), 'A copy is one city and year');
  const copy = { ...race(70, 0, 290), edition: 9 }, real = { ...race(71, 0, 290), edition: 8 };
  const copyHtml = html(h(SelectedAnalysis, { races: [copy, real], manifest: lake, units: 'mi', copyEditions: copies }));
  assert.match(copyHtml, /<h2 id="[^"]*-title">Lakeside 2024, [^<]+<\/h2>/); assert.match(copyHtml, /No pacing report: copy of another year’s field/); // November 20, 2026 (D49): was "Recorded times only"
  assert.doesNotMatch(copyHtml, /largely repeat|rc-multi|Lakeside 2019 ·/, 'No copy in a figure, a focus option or an explanation');
  assert.equal(html(h(SelectedAnalysis, { races: [held, missing], manifest: lake, units: 'mi', copyEditions: copies })), html(h(SelectedAnalysis, { races: [held, missing], manifest: lake, units: 'mi' })));
  const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/insights/manifest.json'), 'utf8'));
  // The published screen comes from the story manifest of the adopted release. Until that family is rebuilt this part
  // cannot run: the verifier still runs the rest and then fails, naming what waits (never a pass).
  if (story.release_tag !== require('../analysis/release.json').tag) waiting.push('copy-edition screen: public/data/insights/manifest.json is not of the adopted release');
  else assert.deepEqual(copyEditions(), (story.duplicate_edition_screen ?? []).map(({ reason: _r, ...entry }) => entry).sort((a, b) => a.city.localeCompare(b.city) || a.year - b.year));
  if (!waiting.length) for (const entry of copyEditions()) assert.ok(copyEditionSentence(entry).includes(`(${entry.identical_nine_time_twins.toLocaleString('en-US')} of its`));

  // The tier and link words are the module's: no phrase of the vocabulary is typed in these files.
  for (const file of ['components/RunnerSearch.tsx', 'components/runner/records.tsx', 'components/runner/ProfileView.tsx', 'components/runner/SearchResults.tsx', 'lib/runner-search.ts']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
    for (const phrase of [...tiers.TIER_PHRASES, ...tiers.LINK_PHRASES, 'Possible matches']) ok(!source.includes(`'${phrase}'`) && !source.includes(`>${phrase}<`), `${file} types "${phrase}"`);
  }

  // Privacy (rule 18): the name never enters the address; old ?q= links are cleaned; the containers are never recorded;
  // analytics events carry no name, key or count beyond the allowed bands.
  const RunnerSearch = require('../components/RunnerSearch.tsx').default;
  const pageHtml = html(h(RunnerSearch));
  const input = pageHtml.match(/<input id="runner-name"[^>]*>/)?.[0];
  ok(input && !/\sname=/.test(input), 'The search field has no name, so no form can put ?q= in the address');
  assert.doesNotMatch(pageHtml.match(/<form[^>]*>/)[0], /\saction=|\smethod=/i);
  assert.match(pageHtml.match(/<form[^>]*>/)[0], /ph-no-capture/);
  const source = fs.readFileSync(path.join(ROOT, 'components/RunnerSearch.tsx'), 'utf8');
  const client = fs.readFileSync(path.join(ROOT, 'lib/runner-search.ts'), 'utf8');
  assert.doesNotMatch(source, /searchParams\.(?:set|append)\(\s*['"]q['"]|[?&]q=\$\{|['"]q=['"]?\s*\+/, 'Never write the search text into the address');
  const historyCalls = source.match(/history\.(?:push|replace)State\([^)]*\)/g) || [];
  ok(historyCalls.some(call => call.startsWith('history.pushState')), 'A search adds a history entry');
  for (const call of historyCalls) assert.match(call, /^history\.(?:push|replace)State\(\{ runnerQuery: value \}, '', (?:href|url\.pathname \+ url\.search \+ url\.hash)\)$/);
  assert.match(source, /url\.searchParams\.delete\('q'\)/);
  for (const call of source.match(/trackAnalytics\([^;]*?\)(?=[;\s}])/g) || []) assert.match(call, /^trackAnalytics\('(runner_search_submitted|runner_search_completed|runner_profile_opened|race_comparison_opened)', \{/, call);
  assert.doesNotMatch(source.match(/trackAnalytics\([\s\S]*?\}\)/g).join('\n'), /query|searched|name|key|\.id\b|race\.|shard|position/, 'No name, key or record in an event');
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB|document\.cookie/, 'The client stores nothing in the browser');
  assert.doesNotMatch(source + client, /fetch\([^)]*(?:query|searched|normalize)/, 'A request never carries the search text');
  for (const id of ['runner-results', 'runner-profile', 'runner-selection', 'runner-reading']) assert.match(source, new RegExp(`${id}[^"]*ph-no-capture|ph-no-capture[^"]*${id}|id="${id}" className="ph-no-capture"|className="${id}[^"]*ph-no-capture`), `${id} is never recorded`);
  // No match: fixed addresses, never the search text.
  assert.deepEqual([...html(h(NoMatchNext)).matchAll(/href="([^"]*)"/g)].map(m => m[1]), ['/analyses/finish-time-context', '/tools/split-check', '/request-analysis', '/courses', '/half']);
  // Method, source and coverage copy is /methodology's (rule 15).
  assert.doesNotMatch(source + fs.readFileSync(path.join(ROOT, 'components/runner/ProfileView.tsx'), 'utf8'), /How search and analysis work|Download the complete data|records in the database|\/about#data-coverage|person_id|identity file/, 'No method copy on /runners');
  // Every screen the lookup can carry has its words, and the page no longer guesses one from the identity file.
  ok(C.SCREENS.filter(Boolean).every(s => s in tiers.SCREEN_WORDS) && Object.keys(tiers.SCREEN_WORDS).every(s => C.SCREENS.includes(s)), 'The lookup\'s screens are the tier module\'s');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'app/runners/page.tsx'), 'utf8'), /identity\.json|screens=/, 'The reason comes from each result, never from a release-wide count');
}

// ---------------------------------------------------------------------------------------------------------------
// 2 and 3. Parity with the reference reader on a real build, and refusals
// ---------------------------------------------------------------------------------------------------------------
async function parity() {
  const head = JSON.parse(fs.readFileSync(path.join(LOOKUP_DIR, 'manifest.json'), 'utf8'));
  assert.equal(head.schema_version, 2, `${LOOKUP_DIR} is not a schema 2 runner lookup`);
  const { openLookup } = require('./lib/lookup-files.cjs');
  const lookup = openLookup(LOOKUP_DIR);
  const original = global.fetch;
  let tamper = null, requests = 0, bytes = 0;
  global.fetch = async url => {
    const u = String(url);
    assert.ok(u.startsWith(SERVED), u);
    const rel = u.slice(SERVED.length).replace(/\?v=[^&]*$/, '');
    assert.match(rel, /^(manifest\.json|editions\.json\.gz|index\/(p\/\d{2}|\d{5})\.json\.gz|profiles\/(p\/\d{2}|[0-9a-f]{3})\.json\.gz)$/, 'Only the lookup\'s own files');
    if (rel !== 'manifest.json') assert.match(u, /\?v=[a-f0-9]{64}$/, 'Every file but the manifest is asked for by its digest');
    let data = fs.readFileSync(path.join(LOOKUP_DIR, rel));
    if (tamper && tamper.rel(rel)) data = tamper.change(data);
    requests++; bytes += data.length;
    return new Response(data, { status: 200 });
  };
  try {
    const manifest = await C.loadRunnerManifest();
    assert.deepEqual(manifest.editions, lookup.editions, 'Every edition as the reference decodes it, its timing class (tb) included');
    const gun = manifest.editions.filter(e => e.timing === 'gun').length;
    ok(gun > 0 && manifest.editions.every(e => tiers.TIMING_CLASSES.includes(e.timing)), 'Every edition has a timing class, and some are gun-timed');

    // Names to search: a deterministic spread of leaves, a few names from each, then queries a visitor would type.
    const leaves = manifest.index.leaves, step = Math.max(1, Math.floor(leaves / 250));
    const names = [];
    for (let n = 0; n < leaves && names.length < QUERY_COUNT; n += step) {
      const rows = C.decodeLeaf(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(LOOKUP_DIR, C.leafPath(n))))));
      for (let i = 0; i < rows.length && names.length < QUERY_COUNT; i += Math.max(1, Math.floor(rows.length / 8))) names.push(rows[i].name);
    }
    const queries = new Set(['john smith', 'smith', 'de la', 'zzyzx qq', 'mar', 'michael', 'li wei', 'van der', 'jose luis', 'a', 'o brien', 'müller', 'Ørjan', '𠮷野家', 'kowal']);
    names.forEach((name, i) => {
      const words = C.searchWords(name);
      if (!words.length) return;
      if (i % 4 === 0) queries.add(name); else if (i % 4 === 1) queries.add(words.map(w => w.slice(0, 3)).join(' '));
      else if (i % 4 === 2) queries.add(words[words.length - 1]); else queries.add(words.slice(0, 2).reverse().join(' ').toUpperCase());
    });
    const strip = rows => rows.map(({ words, ...row }) => row);
    let compared = 0, refused = 0, alone = 0;
    for (const q of queries) for (const stage of [1, 2]) for (const limit of [C.SEARCH_AUTO, C.SEARCH_HARD_CAP]) {
      const mine = await C.searchStage(q, stage, manifest, undefined, limit);
      const ref = lookup.search(q, stage, limit);
      assert.deepEqual(mine.plan, ref.plan, `${q} ${stage} plan`); assert.equal(mine.refused, ref.refused, `${q} ${stage} refused`);
      assert.deepEqual(mine.rows, strip(ref.rows), `${q} ${stage} rows`);
      compared++; if (mine.refused) refused++; if (mine.plan.alone) alone++;
    }
    // The page's flow: never past the cap; a press only for what it says; every listed row matches its stage.
    let profiles = 0;
    const flows = { auto: 0, more: 0, capped: 0 };
    for (const q of [...queries].slice(0, 600)) {
      const r = await C.searchRunnerNames(q, manifest);
      ok(r.bytes <= C.SEARCH_AUTO || r.matches.length === 0, `${q}: loaded past ${C.SEARCH_AUTO} bytes unasked`);
      if (r.more) { flows.more++; ok(r.more.bytes >= 0 && r.bytes + r.more.bytes <= C.SEARCH_HARD_CAP, `${q}: a press past the cap`); }
      if (r.capped) flows.capped++; else if (!r.more) flows.auto++;
      for (const row of r.matches.slice(0, 3)) {
        const mine = await C.loadRunnerProfile(row.shard, row.position, manifest);
        const ref = lookup.profile(row.shard, row.position);
        assert.deepEqual(mine.names, ref.names);
        assert.deepEqual(mine.races.map(x => [x.key, x.id, x.db, x.edition, x.distance, x.name, x.sex, x.age, x.link, x.confirmed, x.screen, x.status === null ? null : String(x.status), x.times]),
          ref.results.map(x => [x.key, x.id, x.db, x.edition, x.distance, x.name, x.sex, x.age, x.link, x.confirmed, x.screen, x.status, x.times]), `${q} profile ${row.shard}:${row.position}`);
        for (const list of C.runnerLists(mine, manifest)) {
          ok([...list.own, ...list.possible].every(x => x.distance === list.distance), 'One distance per list');
          ok(!list.summary || list.summary.count === list.own.length, 'A list counts its own results only');
          ok(!list.summary?.best || list.own.includes(list.summary.best), 'A best is never a possible match');
        }
        profiles++;
      }
    }

    // Screened links (codes b, c, d with their w): a sweep of 16 shards, every profile that holds one compared field
    // by field, so the reason a row states is the lookup's own for that result.
    const L = require('./lib/lookup.cjs');
    const screens = {};
    let screenedProfiles = 0;
    for (let shard = 7; shard < C.PROFILE_SHARDS && screenedProfiles < 200; shard += 256) {
      const page = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(LOOKUP_DIR, C.profilePagePath(Math.floor(shard / C.PAGE_SIZE))))));
      const all = L.decodeShard(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(LOOKUP_DIR, C.shardPath(shard))))), lookup.editions);
      ok(all.length === page.shards[shard % C.PAGE_SIZE][0], 'A shard holds the profiles its page says');
      for (let position = 0; position < all.length && screenedProfiles < 200; position++) {
        const ref = all[position];
        if (!ref.results.some(x => x.screen !== null)) continue;
        const mine = await C.loadRunnerProfile(shard, position, manifest);
        assert.deepEqual(mine.races.map(x => [x.key, x.link, x.screen, x.possible]), ref.results.map(x => [x.key, x.link, x.screen, ref.results.length > 1 && !x.confirmed]), `screened profile ${shard}:${position}`);
        for (const x of mine.races) if (x.screen) { screens[x.screen] = (screens[x.screen] || 0) + 1; ok('bcd'.includes(x.link) && x.possible, 'A screened result is a possible match of a confirmed tier'); }
        screenedProfiles++;
      }
    }
    ok(screenedProfiles > 0, 'The sweep found screened links');

    // Refusals: a changed byte anywhere in the chain, another release or a stand-in build on the published path.
    const flip = data => { const copy = Buffer.from(data); copy[copy.length >> 1] ^= 1; return copy; };
    const fresh = async () => { C.clearRunnerCaches(); return C.loadRunnerManifest(); };
    tamper = { rel: rel => rel === 'manifest.json', change: data => Buffer.from(JSON.stringify({ ...JSON.parse(data), release_tag: 'pace-notes-other' })) };
    await assert.rejects(fresh, /verified/, 'Another release is refused');
    tamper = { rel: rel => rel === 'editions.json.gz', change: flip };
    await assert.rejects(fresh, /verified/, 'A changed editions file is refused');
    tamper = null;
    const verified = await C.loadRunnerManifest();
    const leafQuery = [...queries].find(q => q.length > 6 && !/\s/.test(q)) || 'michael';
    const plan = (await C.searchStage(leafQuery, 1, verified)).plan;
    const target = C.leafPath(plan.leaves[0]);
    tamper = { rel: rel => rel === target, change: flip };
    C.clearRunnerCaches();
    const reloaded = await C.loadRunnerManifest();
    await assert.rejects(() => C.searchStage(leafQuery, 1, reloaded), /verified/, 'A changed leaf is refused');
    tamper = { rel: rel => /^index\/p\/\d{2}\.json\.gz$/.test(rel), change: flip };
    C.clearRunnerCaches();
    await assert.rejects(() => C.searchStage(leafQuery, 1, reloaded), /verified/, 'A changed directory page is refused');
    tamper = { rel: rel => /^profiles\/[0-9a-f]{3}\.json\.gz$/.test(rel), change: flip };
    const someRow = lookup.search('john smith', 1, C.SEARCH_HARD_CAP).rows[0] || lookup.search(names[0], 1, C.SEARCH_HARD_CAP).rows[0];
    C.clearRunnerCaches();
    await assert.rejects(() => C.loadRunnerProfile(someRow.shard, someRow.position, reloaded), /verified/, 'A changed profile shard is refused');
    tamper = null;
    ok(!(head.provisional ?? []).length, 'The published lookup names no stand-in inputs');
    console.log(`  parity on the committed lookup ${LOOKUP_DIR}: ${queries.size} queries, ${compared} stage searches (${refused} refused, ${alone} one common word), ` +
      `flows ${JSON.stringify(flows)}, ${profiles} profiles, ${screenedProfiles} screened profiles ${JSON.stringify(screens)}, ${gun} gun editions; ${requests} requests, ${(bytes / 1e6).toFixed(1)} MB`);
  } finally { global.fetch = original; }
}

(async () => {
  await units();
  await parity();
  if (waiting.length) { console.error(`Runner search checks NOT complete: waiting for ${waiting.join('; ')}.`); process.exitCode = 1; return; }
  console.log(`Runner search checks passed (schema 2): ${checks} named checks plus the fixture assertions.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
