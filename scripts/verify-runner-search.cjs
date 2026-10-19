const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Module = require('node:module');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};
const {
  RUNNER_RELEASE, RUNNER_POINTS, RUNNER_PAGE_SIZE, normalizeRunnerName, runnerNameMatches,
  runnerShardKey, validateRunnerManifest, loadRunnerManifest, searchRunnerNames, loadRunnerProfile,
  validateRunnerProfile, runnerMetrics, runnerDuration, runnerProgression, runnerSearchPage,
} = require('../lib/runner-search.ts');
const { SelectedAnalysis } = require('../components/RunnerSearch.tsx');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const manifest = {
  schema_version: 1, release_tag: RUNNER_RELEASE, input_as_of: '2026-09-11T15:10:45Z', as_of: '2026-09-11T16:00:00Z',
  raw_records: 100, named_records: 99, profiles: 80, points_km: RUNNER_POINTS,
  editions: [{ city: 'London', year: 2020, race: 'London Marathon' }, { city: 'Boston', year: 2020, race: 'Boston Marathon' }, { city: 'Berlin', year: 2021, race: 'Berlin Marathon' }],
  shards: {},
};
const race = (id, edition, pace = 300, extra = {}) => ({
  id, edition, name: 'José Smith', sex: null, age: null, times: RUNNER_POINTS.map(km => km * pace),
  eligible: true, reason: null, ...extra,
});

async function main() {
  assert.equal(normalizeRunnerName('  JOSÉ,   O’Neíl—陳  '), 'jose o neil 陳');
  assert.equal(normalizeRunnerName('ＡＮＡ  İpek'), 'ana ipek');
  assert.equal(normalizeRunnerName('𠮷野家'), '𠮷野家');
  assert.equal(runnerNameMatches('Smith, José', 'jos smi'), true, 'Name order and accent differences should not hide a match');
  assert.equal(runnerNameMatches('Smith, José', 'jos bro'), false, 'Every query token must match');
  assert.equal(runnerNameMatches('William Smith', 'li smi'), false, 'Short tokens match whole words, not interior text or prefixes');
  assert.equal(runnerNameMatches('Liam Smith', 'li'), false);
  assert.equal(runnerNameMatches('Li Smith', 'li smi'), true);
  assert.equal(runnerNameMatches('José Smith', '***'), false);
  assert.equal(await runnerShardKey('𠮷野家'), crypto.createHash('sha256').update('𠮷野家').digest('hex').slice(0, 3));
  assert.equal(validateRunnerManifest(manifest).release_tag, RUNNER_RELEASE);
  assert.throws(() => validateRunnerManifest({ ...manifest, release_tag: 'private-export-20260911-0336' }), /verified/);
  assert.throws(() => validateRunnerManifest({ ...manifest, points_km: [...RUNNER_POINTS.slice(0, 8), 42.2] }), /verified/, 'Never silently change marathon length');
  assert.throws(() => validateRunnerManifest({ ...manifest, shards: { '../other.json.gz': { bytes: 1, sha256: '0'.repeat(64) } } }), /verified/, 'Manifest paths must stay inside the published runner assets');

  const base = race(1, 0), changed = race(2, 1, 280), later = race(3, 2, 270);
  const metrics = runnerMetrics(base);
  close(metrics.finish, 12658.5); close(metrics.pace, 300); close(metrics.baseline, 300); close(metrics.latePace, 300); close(metrics.lateChange, 0); close(metrics.openingChange, 0);
  close(metrics.sections[8].elapsed, 658.5); close(metrics.sections[8].end - metrics.sections[8].start, 2.195);
  assert.ok(runnerMetrics({ ...base, times: [...base.times.slice(0, 8), base.times[7] + 2.195 * 120] }), 'A permitted boundary pace must survive floating-point distance subtraction');
  const slowing = race(4, 1, 300, { times: RUNNER_POINTS.map(km => km * 300 + Math.max(0, km - 30) * 60) });
  close(runnerMetrics(slowing).lateChange, 20);
  const missing = race(5, 0, 200, {
    name: 'Casey Partial', eligible: false, reason: 'Missing source checkpoint', times: [null, ...base.times.slice(1)],
    raw_times: [null, '00:50:00', 'unparsed source reading', '01:40:00', '02:05:00', '02:30:00', '02:55:00', '03:20:00', '03:30:58.500'],
  });
  const held = race(6, 1, 200, {
    name: 'Casey Partial', eligible: false, reason: 'Incomplete edition held for review',
    raw_times: ['00:16:40.000', '00:33:20', '00:50:00', '01:06:40', '01:23:20', '01:40:00', '01:56:40', '02:13:20', '02:20:39'],
  });
  assert.equal(runnerMetrics(missing), null); assert.equal(runnerMetrics(held), null, 'Plausible fast times in an excluded edition must not become a best');
  assert.equal(runnerMetrics({ ...base, times: base.times.map((time, i) => i === 1 ? base.times[0] : time) }), null);
  assert.equal(runnerProgression([held, missing], manifest), null);
  assert.equal(runnerProgression([base, changed], manifest).yearChange, null, 'Two same-year races do not establish before/after chronology');
  const progression = runnerProgression([later, held, changed, base], manifest);
  assert.equal(progression.valid.length, 3); assert.equal(progression.best.race.id, later.id);
  close(progression.yearChange, changed.times[8] - later.times[8]);
  assert.equal(progression.earliestYear, 2020); assert.equal(progression.latestYear, 2021);
  assert.equal(runnerDuration(59.9996), '0:01:00');
  assert.equal(runnerDuration(12658.5), '3:30:58.5');
  assert.equal(runnerDuration(12658.501), '3:30:58.501');
  assert.equal(runnerDuration(null), 'Not recorded');
  const profile = { id: 7, names: ['José Smith'], races: [base, missing, held] };
  assert.equal(validateRunnerProfile(profile, manifest).races.length, 3);
  assert.equal(validateRunnerProfile({ ...profile, races: [{ ...base, age: 1923 }] }, manifest).races[0].age, 1923, 'Retain a suspect recorded age without inventing a correction');
  assert.throws(() => validateRunnerProfile({ ...profile, races: [base, base] }, manifest), /verified/);
  assert.throws(() => validateRunnerProfile({ ...profile, races: [{ ...base, times: [null, ...base.times.slice(1)] }] }, manifest), /verified/);

  const render = (races, units) => renderToStaticMarkup(React.createElement(SelectedAnalysis, { races, manifest, units }));
  const sameYearHtml = render([base, changed], 'mi');
  assert.doesNotMatch(sameYearHtml, /Your fastest selected finish in/);
  const smallGain = { ...base, id: 9, edition: 2, times: [...base.times.slice(0, 8), base.times[8] - 0.2] };
  // Two eligible races lead with the focus race and one comparison beat (round 4, October 19, 2026): no progression card,
  // no sentence repeating the difference and no race table outside the comparison's All numbers.
  const twoHtml = render([base, smallGain], 'mi');
  assert.match(twoHtml, /class="rc-multi"/); assert.doesNotMatch(twoHtml, /runner-numbers|Fastest selected eligible finish|recorded progression|All eligible races you selected|Your fastest selected finish in/);
  const mileHtml = render([base, held], 'mi');
  assert.match(mileHtml, /8:03\/mi/); assert.match(mileHtml, /3:30:58\.5/); assert.match(mileHtml, /No <a [^>]*>sustained slowdown<\/a>: every stretch after 20K held the 5–\u2060?20K pace or better\./, 'An even race: the report\'s verdict, in its words');
  // The pacing view leads with the race report's verdict (lib/report-verdict timesVerdict), in the report's words.
  const slowingHtml = render([slowing], 'mi');
  assert.match(slowingHtml, /class="rc-h">No <a [^>]*>sustained slowdown<\/a>: the slowest stretch after 20K, 30–\u2060?35K, ran 20% off the 5–\u2060?20K pace\.<\/h3>/, 'Under 25%: no sustained slowdown, and the slowest stretch after 20K named');
  const fading = race(5, 1, 300, { times: RUNNER_POINTS.map(km => km * 300 + Math.max(0, km - 30) * 90) });
  const fadingHtml = render([fading], 'mi');
  assert.match(fadingHtml, /class="rc-h">A <a [^>]*>sustained slowdown<\/a> from 30K, 30% off the 5–\u2060?20K pace\.<\/h3>/, 'A qualifying race: the verdict names where it began and how far off');
  assert.match(fadingHtml, /Highlighted: the sustained slowdown\./, 'and the lap list lights its rows, as the report does');
  assert.match(mileHtml, /limited analysis/i); assert.doesNotMatch(mileHtml, /the same pace than/);
  assert.match(mileHtml, /Casey Partial/); assert.match(mileHtml, /Incomplete edition held for review/);
  assert.match(mileHtml, /02:20:39/, 'Keep the faster held result visible as its recorded finish');
  const listedHtml = renderToStaticMarkup(React.createElement(SelectedAnalysis, { races: [base, held], manifest, units: 'mi', listed: new Set([base.id, held.id]) }));
  assert.doesNotMatch(listedHtml, /limited analysis|Casey Partial/i, 'A limited record the open profile already lists, tag and checkpoints, is not listed again under the analysis');
  assert.match(mileHtml, /00:16:40\.000/, 'Keep original checkpoint formatting rather than recomputing it');
  assert.match(mileHtml, /<h2 id="[^"]*-title">[^<]*, 3:30:58\.5<\/h2>/, 'A faster held result cannot replace the eligible finish (one eligible race: its heading names it)');
  assert.doesNotMatch(mileHtml, /runner-numbers|One race\. A closer look/, 'One race has no summary card and no second heading');
  assert.match(twoHtml, /<h2 id="[^"]*-title" class="sr-only">/, 'Two races: the select names the focus race, so its heading is for screen readers only');
  assert.doesNotMatch(mileHtml, /\d\.\d\d\s*mi\b/, 'Miles never to two decimals (mats are named, prose distances take one decimal)'); assert.doesNotMatch(mileHtml, /5:00\/km/);
  const kmHtml = render([base], 'km'); assert.match(kmHtml, /5:00\/km/); assert.doesNotMatch(kmHtml, /\d\/mi\b/, 'Paces follow the units shown');
  const assertLimitedRecordsVisible = html => {
    assert.match(html, /Your race records are here/);
    assert.match(html, /Casey Partial/);
    assert.match(html, /London 2020/); assert.match(html, /Boston 2020/);
    assert.match(html, /Missing source checkpoint/); assert.match(html, /Incomplete edition held for review/);
    assert.match(html, /03:30:58\.500/); assert.match(html, /02:20:39/);
    assert.match(html, /unparsed source reading/); assert.match(html, /00:16:40\.000/);
    assert.match(html, /Not recorded/, 'Missing checkpoints remain missing');
    assert.doesNotMatch(html, /Fastest selected eligible finish|Average pace|Late vs early pace|[0-9]:[0-5][0-9]\/(?:mi|km)/,
      'Showing source records must not invent a best, pace or pacing comparison');
    assert.doesNotMatch(html, /runner-numbers|runner-peer|finish-percentile/, 'Wholly ineligible records have no calculated performance or peer metrics');
  };
  assertLimitedRecordsVisible(render([held, missing], 'mi'));
  assertLimitedRecordsVisible(render([held, missing], 'km'));

  // Copy editions (lib/duplicate-editions.ts): synthetic editions whose records repeat a later field, as Chicago 2018
  // and 2019 repeat Chicago 2024 in the adopted release. They stay visible as recorded times and reach no summary,
  // comparison, focus option or split-check link. Since October 16, 2026 the copy-edition sentence is on /methodology
  // only: the runner view says "Recorded times only" and never explains the screen.
  const { copyEditions, copyEditionSentence, isCopyEdition, RunnerRecordDetails } = { ...require('../lib/duplicate-editions.ts'), ...require('../components/RunnerSearch.tsx') };
  const lakeside = { ...manifest, editions: [...manifest.editions, { city: 'Lakeside', year: 2018, race: 'Lakeside Marathon' }, { city: 'Lakeside', year: 2019, race: 'Lakeside Marathon' }, { city: 'Lakeside', year: 2024, race: 'Lakeside Marathon' }] };
  const copies = [
    { city: 'Lakeside', year: 2018, duplicate_of: 2024, eligible_removed: 51690, identical_nine_time_twins: 51372 },
    { city: 'Lakeside', year: 2019, duplicate_of: 2024, eligible_removed: 51530, identical_nine_time_twins: 51212 },
  ];
  assert.equal(copyEditionSentence(copies[1]), "Lakeside 2019's records largely repeat the Lakeside 2024 field (51,212 of its 51,530 finishes share all nine checkpoint times with a 2024 finish), so they are shown as recorded times only, without pacing, peer or weather comparisons.");
  assert.equal(isCopyEdition({ city: 'Lakeside', year: 2019 }, copies), true);
  assert.equal(isCopyEdition({ city: 'Lakeside', year: 2024 }, copies), false, 'The source edition is not a copy');
  assert.equal(isCopyEdition({ city: 'Bayview', year: 2019 }, copies), false, 'A copy is one city and year');
  // The same nine times in three editions, as in the copies, and a held copy record that keeps its own reason.
  const repeat = (id, edition) => race(id, edition, 290, { name: 'Fixture Runner' });
  const [copy2018, copy2019, real2024] = [repeat(21, 3), repeat(22, 4), repeat(23, 5)];
  const heldCopy = race(24, 4, 300, { eligible: false, reason: 'Missing source checkpoint', times: [null, ...base.times.slice(1)] });
  const renderCopies = (races, screen) => renderToStaticMarkup(React.createElement(SelectedAnalysis, { races, manifest: lakeside, units: 'mi', copyEditions: screen }));
  const copyHtml = renderCopies([copy2018, copy2019, real2024, heldCopy], copies);
  const occurrences = (html, text) => html.split(text).length - 1;
  assert.match(copyHtml, /<h2 id="[^"]*-title">Lakeside 2024, [^<]+<\/h2>/, 'One eligible race once the copies are left out: the heading is the race and its finish');
  assert.doesNotMatch(copyHtml, /runner-numbers/, 'One race left once the copies are out: no summary card');
  assert.doesNotMatch(copyHtml, /Eligible selected finish/, 'One race carries no count of one');
  assert.doesNotMatch(copyHtml, /Your fastest selected finish in/, 'No year-over-year change from a copy');
  assert.doesNotMatch(copyHtml, /All eligible races you selected/, 'One race has no one-row table of the races');
  assert.match(copyHtml, /3 selected records have limited analysis/);
  for (const copy of copies) assert.equal(occurrences(copyHtml, copyEditionSentence(copy).replace(/'/g, '&#x27;')), 0, `${copy.city} ${copy.year}: no copy-edition sentence`);
  assert.doesNotMatch(copyHtml, /largely repeat/, 'The analysis view never explains the copy screen');
  assert.equal(occurrences(copyHtml, 'Recorded times only'), 2, 'Each eligible copy record says so');
  assert.doesNotMatch(copyHtml, /This edition’s records/, 'The analysis view gives each edition its sentence, not a line per record');
  assert.match(copyHtml, /Missing source checkpoint/, 'A held record in a copy edition keeps its own reason');
  assert.equal(occurrences(copyHtml, '<option '), 1, 'One focus option, the 2024 race');
  assert.doesNotMatch(copyHtml, /Lakeside 2018 ·|Lakeside 2019 ·|Across your selected races|rc-multi/, 'No copy in the focus options or the side-by-side comparison');
  assert.equal(occurrences(copyHtml, 'Read this race in the split check'), 0, 'The view\'s one way on is the race report (its share sheet has the split check)');
  // Only copies selected: the records view, with each sentence once and no calculated figure.
  const onlyCopies = renderCopies([copy2018, copy2019], copies);
  assert.match(onlyCopies, /Your race records are here/);
  assert.doesNotMatch(onlyCopies, /Fastest selected eligible finish|runner-context|[0-9]:[0-5][0-9]\/(?:mi|km)/, 'No figure is calculated from a copy');
  for (const copy of copies) assert.equal(occurrences(onlyCopies, copyEditionSentence(copy).replace(/'/g, '&#x27;')), 0);
  assert.match(onlyCopies, /These records are shown as recorded times only, without pacing or peer comparisons\./);
  assert.doesNotMatch(onlyCopies, /largely repeat/);
  assert.doesNotMatch(onlyCopies, /need more complete or verified data/, 'Copies have complete timings: the header gives their own reason');
  const mixedLimited = renderCopies([copy2018, heldCopy], copies);
  assert.match(mixedLimited, /None of these records can support pacing or peer comparisons\. Each race shows its status\./);
  assert.doesNotMatch(mixedLimited, /largely repeat/);
  assert.equal(renderCopies([held, missing], copies), render([held, missing], 'mi'), 'No copy selected: the records view is as it was');
  // An empty screen, or one naming other editions, leaves the page as it was.
  assert.equal(renderCopies([copy2018, copy2019, real2024], []), renderToStaticMarkup(React.createElement(SelectedAnalysis, { races: [copy2018, copy2019, real2024], manifest: lakeside, units: 'mi' })));
  assert.equal(renderCopies([base, changed, later], copies), render([base, changed, later], 'mi'));
  assert.match(renderCopies([copy2018, copy2019, real2024], []), /class="rc-multi"/, 'Without the screen the three races are compared');
  const details = (row, screen) => renderToStaticMarkup(React.createElement(RunnerRecordDetails, { race: row, manifest: lakeside, copyEditions: screen }));
  // A row is the race, its finish and one short tag; what the record lacks, and why, is in its disclosure.
  const { RecordedCheckpoints } = require('../components/RunnerSearch.tsx');
  const opened = (row, screen, explainCopy = true) => renderToStaticMarkup(React.createElement(RecordedCheckpoints, { race: row, manifest: lakeside, copyEditions: screen, explainCopy }));
  assert.match(details(copy2019, copies), /Recorded times only/); assert.doesNotMatch(details(copy2019, copies), /Pacing analysis/);
  assert.match(opened(copy2019, copies), /<p class="runner-note">Pacing and peer comparisons are unavailable for this record\.<\/p>/, 'A copy record in the profile says what it lacks, in its disclosure');
  assert.doesNotMatch(details(copy2019, copies) + opened(copy2019, copies), /largely repeat|This edition’s records/, 'A copy record never explains the screen');
  assert.doesNotMatch(opened(copy2019, copies, false), /Pacing and peer comparisons are unavailable/);
  assert.doesNotMatch(details(real2024, copies), /This edition’s records|Recorded times only/, 'The field a copy repeats is not a copy');
  assert.match(details(copy2019, []), /Pacing analysis/);
  assert.doesNotMatch(details(copy2019, []), /Fixture Runner|Age not recorded|Recorded gender/, 'The row carries no name, age or gender: they are in the disclosure');
  assert.match(opened(copy2019, []), /Fixture Runner · Lakeside Marathon · Age not recorded · Gender not recorded/);
  assert.match(details(heldCopy, copies), /Limited: missing checkpoints|Limited analysis/);
  assert.match(details(race(25, 4, 300, { eligible: false, reason: 'Checkpoint times are not strictly increasing.' }), copies), /Limited: times out of order/);
  assert.match(details(race(26, 4, 300, { eligible: false, reason: 'One or more checkpoint times are missing or could not be parsed.' }), copies), /Limited: missing checkpoints/);
  assert.match(details(race(27, 4, 300, { eligible: false, reason: 'Source audit marks HOLD.' }), copies), /Limited analysis/, 'An edition-level hold is "Limited analysis"');
  assert.match(opened(heldCopy, copies), /Missing source checkpoint Pacing and peer comparisons are unavailable for this record\./, 'The full reason is in the disclosure');
  // The published screen: read from the verified story manifest, never typed in, and every sentence from its counts only.
  const story = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/insights/manifest.json'), 'utf8'));
  const screen = copyEditions();
  assert.deepEqual(screen, (story.duplicate_edition_screen ?? []).map(({ reason: _reason, ...entry }) => entry).sort((a, b) => a.city.localeCompare(b.city) || a.year - b.year));
  for (const entry of screen) {
    const sentence = copyEditionSentence(entry);
    assert.ok(sentence.includes(`(${entry.identical_nine_time_twins.toLocaleString('en-US')} of its ${entry.eligible_removed.toLocaleString('en-US')} finishes`), `${entry.city} ${entry.year}: counts from the manifest`);
    assert.doesNotMatch(sentence, /the same names|participant|\ball (?!nine checkpoint times)/i, `${entry.city} ${entry.year}: never "the same names" or "all" records`);
  }

  const originalFetch = global.fetch;
  const requests = [];
  let served;
  global.fetch = async url => { requests.push(String(url)); return new Response(served, { status: 200 }); };
  const descriptor = value => {
    const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(value)));
    return { bytes, meta: { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
  };
  const sourceFor = (path, data) => ({ ...manifest, shards: { [path]: data.meta } });
  const signal = new AbortController().signal;
  try {
    served = JSON.stringify(manifest);
    assert.equal((await loadRunnerManifest()).release_tag, RUNNER_RELEASE);
    assert.ok(requests.at(-1).endsWith('/manifest.json?v=' + RUNNER_RELEASE), 'Request the pin explicitly rather than using an unversioned old manifest');
    served = JSON.stringify({ ...manifest, release_tag: 'old' });
    await assert.rejects(() => loadRunnerManifest(), /verified/);

    const rows = Array.from({ length: 79 }, (_, i) => [`José Smith ${i}`, i + 1, 1, 2020, 2020, 'London']);
    rows.push(['JOSE SMITH 0', 1, 1, 2020, 2020, 'London']);
    rows.push(['José Brown', 1000, 1, 2020, 2020, 'London']);
    const index = descriptor({ release_tag: RUNNER_RELEASE, rows });
    const indexPath = `index/${await runnerShardKey('jos')}.json.gz`;
    served = index.bytes;
    const matches = await searchRunnerNames('jos smi', sourceFor(indexPath, index), signal);
    assert.equal(matches.length, 79, 'Deduplicate aliases by candidate group, while retaining every matching group');
    assert.equal(new Set(matches.map(row => row[1])).size, 79);
    assert.ok(requests.at(-1).endsWith(indexPath + '?v=' + index.meta.sha256), 'Shard URL must use its exact content digest');
    const pages = Array.from({ length: Math.ceil(matches.length / RUNNER_PAGE_SIZE) }, (_, page) => runnerSearchPage(matches, page));
    assert.deepEqual(pages.map(page => page.length), [25, 25, 25, 4]);
    assert.deepEqual(pages.flat(), matches, 'The last match must remain reachable through pagination');
    assert.deepEqual(runnerSearchPage(matches, -1), []);
    const beforeEmpty = requests.length;
    assert.deepEqual(await searchRunnerNames('zzzzzz', manifest, signal), []);
    assert.equal(requests.length, beforeEmpty, 'An absent manifest bucket is a verified empty prefix');

    const wrongTag = descriptor({ release_tag: 'old', rows }); served = wrongTag.bytes;
    await assert.rejects(() => searchRunnerNames('jos', sourceFor(indexPath, wrongTag), signal), /verified/);
    const badHash = { ...index, meta: { ...index.meta, sha256: '0'.repeat(64) } }; served = index.bytes;
    await assert.rejects(() => searchRunnerNames('jos', sourceFor(indexPath, badHash), signal), /verified/);
    served = Buffer.concat([index.bytes, Buffer.from('x')]);
    await assert.rejects(() => searchRunnerNames('jos', sourceFor(indexPath, { meta: { ...index.meta, sha256: '1'.repeat(64) } }), signal), /verified/);
    const corrupted = descriptor({ release_tag: RUNNER_RELEASE, rows: [['Name', 'wrong id']] }); served = corrupted.bytes;
    await assert.rejects(() => searchRunnerNames('jos', sourceFor(indexPath, corrupted), signal), /verified/);

    const profilePath = `profiles/${await runnerShardKey(String(profile.id))}.json.gz`;
    const storedProfile = descriptor({ release_tag: RUNNER_RELEASE, profiles: [profile] }); served = storedProfile.bytes;
    assert.deepEqual(await loadRunnerProfile(profile.id, sourceFor(profilePath, storedProfile), signal), profile);
    const staleProfile = descriptor({ release_tag: 'old', profiles: [profile] }); served = staleProfile.bytes;
    await assert.rejects(() => loadRunnerProfile(profile.id, sourceFor(profilePath, staleProfile), signal), /verified/);
    const duplicateProfile = descriptor({ release_tag: RUNNER_RELEASE, profiles: [profile, profile] }); served = duplicateProfile.bytes;
    await assert.rejects(() => loadRunnerProfile(profile.id, sourceFor(profilePath, duplicateProfile), signal), /verified/);

    // Exercise the actual search -> verified gzip profile -> selected-record view
    // for a named candidate with no eligible race, not just its metric helper.
    const limitedProfile = { id: 5, names: ['Casey Partial'], races: [missing, held] };
    const limitedIndexPath = `index/${await runnerShardKey('par')}.json.gz`;
    const limitedIndex = descriptor({ release_tag: RUNNER_RELEASE, rows: [['Casey Partial', 5, 2, 2020, 2020, 'London']] });
    const limitedProfilePath = `profiles/${await runnerShardKey('5')}.json.gz`;
    const limitedShard = descriptor({ release_tag: RUNNER_RELEASE, profiles: [limitedProfile] });
    const limitedSource = { ...manifest, shards: { [limitedIndexPath]: limitedIndex.meta, [limitedProfilePath]: limitedShard.meta } };
    served = limitedIndex.bytes;
    const limitedMatches = await searchRunnerNames('Casey Partial', limitedSource, signal);
    assert.deepEqual(limitedMatches, [['Casey Partial', 5, 2, 2020, 2020, 'London']], 'A candidate with only held/missing-split records must be discoverable');
    served = limitedShard.bytes;
    const loadedLimited = await loadRunnerProfile(limitedMatches[0][1], limitedSource, signal);
    assert.deepEqual(loadedLimited, limitedProfile, 'Loading retains all races and original readings even with no eligible race');
    assert.equal(runnerProgression(loadedLimited.races, limitedSource), null);
    assertLimitedRecordsVisible(render(loadedLimited.races, 'mi'));
  } finally { global.fetch = originalFetch; }

  // Privacy: a searched name never enters the page address, and the lookup page is not indexable.
  const RunnerSearch = require('../components/RunnerSearch.tsx').default;
  const pageHtml = renderToStaticMarkup(React.createElement(RunnerSearch));
  const input = pageHtml.match(/<input id="runner-name"[^>]*>/)?.[0];
  assert.ok(input, 'The search field renders');
  assert.doesNotMatch(input, /\sname=/, 'The search field has no name, so a form submitted without JavaScript cannot put ?q= in the address');
  assert.doesNotMatch(pageHtml.match(/<form[^>]*>/)[0], /\saction=|\smethod=/i);
  const source = fs.readFileSync(path.join(__dirname, '../components/RunnerSearch.tsx'), 'utf8');
  assert.doesNotMatch(source, /searchParams\.(?:set|append)\(\s*['"]q['"]/, 'Never write the search text into the address');
  assert.doesNotMatch(source, /[?&]q=\$\{|['"]q=['"]?\s*\+/, 'Never build a ?q= link');
  const historyCalls = source.match(/history\.(?:push|replace)State\([^)]*\)/g) || [];
  assert.ok(historyCalls.some(call => call.startsWith('history.pushState')), 'A search adds a history entry, so Back returns to the previous results');
  for (const call of historyCalls) {
    assert.match(call, /^history\.(?:push|replace)State\(\{ runnerQuery: value \}, '', (?:href|url\.pathname \+ url\.search \+ url\.hash)\)$/, `History entries keep the name in state only: ${call}`);
  }
  assert.match(source, /url\.searchParams\.delete\('q'\)/, 'Old ?q= links are cleaned');
  // No match: the marathons searched, from the search data already loaded, and fixed links on that carry no search text.
  const { NoMatchNext } = require('../components/RunnerSearch.tsx');
  const published = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/runners/manifest.json'), 'utf8'));
  const noMatchHtml = renderToStaticMarkup(React.createElement(NoMatchNext, { manifest: published }));
  const marathons = new Set(published.editions.map(edition => edition.race));
  assert.equal((noMatchHtml.match(/<li><span>/g) || []).length, marathons.size, 'Every marathon searched is listed once');
  assert.ok(noMatchHtml.includes(`The ${marathons.size} marathons searched`));
  const london = published.editions.filter(edition => edition.race === 'London Marathon').map(edition => edition.year);
  assert.ok(noMatchHtml.includes(`<li><span>London</span><small>${Math.min(...london)}–${Math.max(...london)} · ${new Set(london).size} years</small></li>`), 'Each marathon shows its first and last recorded year and how many years');
  assert.match(renderToStaticMarkup(React.createElement(NoMatchNext, { manifest })), /<li><span>Berlin<\/span><small>2021 · 1 year<\/small><\/li>/);
  assert.deepEqual([...noMatchHtml.matchAll(/href="([^"]*)"/g)].map(m => m[1]), ['/analyses/finish-time-context', '/tools/split-check', '/request-analysis']);
  // Coverage, source and method copy is on /methodology (October 16, 2026): no record counts, release, download or
  // "How search and analysis work" on the search page, and no method lines in the selected-races view.
  assert.doesNotMatch(source, /How search and analysis work|runner-source|Download the complete data|named race records|records in the database|sourceReleaseHref|sourceLabel|\/about#data-coverage/, 'No source, coverage or method copy in the runner search');
  for (const html of [mileHtml, render([base, changed, later], 'mi'), copyHtml]) {
    assert.doesNotMatch(html, /timing and edition checks|do not verify who ran|Courses, weather and other conditions|do not contribute to the fastest|original source readings|not filled in or used/i, 'No method or caveat line in the selected-races view');
  }
  assert.match(source, /\{!matches\.length && <NoMatchNext manifest=\{manifest\} \/>\}/, 'The no-match block is given the search data only, never the search text');
  const { metadata, default: RunnersPage } = require('../app/runners/page.tsx');
  // The page: one heading, "Analyze a past race", and two ways in without a name: the split check, and a finish time
  // that opens the pacing-pattern analysis (its field has no name, so a form sent without JavaScript carries nothing).
  const runnersHtml = renderToStaticMarkup(React.createElement(RunnersPage));
  assert.deepEqual([...runnersHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => m[1]), ['Analyze a past race']);
  assert.match(runnersHtml, /<a class="runner-start" href="\/tools\/split-check"><b>Have your splits\? Paste them<\/b>/);
  const finishForm = runnersHtml.match(/<form class="runner-start runner-start-time"[^>]*>[\s\S]*?<\/form>/)?.[0] ?? '';
  assert.match(finishForm, /action="\/analyses\/pacing-pattern" method="get"/); assert.match(finishForm, /Only know your finish time\?/); assert.match(finishForm, /See how finishes near it were paced/);
  assert.doesNotMatch(finishForm, /<input[^>]*\sname=/, 'The finish-time field has no name');
  assert.deepEqual(metadata.robots, { index: false, follow: true }, '/runners is noindex, follow');
  assert.equal(metadata.alternates, undefined, 'A noindex page has no canonical');
  assert.doesNotMatch(JSON.stringify(metadata), /[?&]q=/);
  console.log('Runner search checks passed: Unicode/token matching, complete pagination, all-ineligible search/profile views, retained source readings, explicit eligibility, year-only progression, mi/km readings, verified versioned gzip loading, the no-match ways on without the search text, copy editions kept out of every summary and never explained (/methodology does), no source, coverage or method copy, the page heading and its two ways in without a name, and names kept out of the address with /runners noindex.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
