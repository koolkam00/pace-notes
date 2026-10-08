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
  assert.match(render([base, smallGain], 'mi'), /0:00:00\.2 faster than/, 'A measurable fractional-second change must not be called the same time');
  const mileHtml = render([base, held], 'mi');
  assert.match(mileHtml, /8:03\/mi/); assert.match(mileHtml, /3:30:58\.5/); assert.match(mileHtml, /the same pace as your early pace/);
  assert.match(mileHtml, /limited analysis/i); assert.doesNotMatch(mileHtml, /the same pace than/);
  assert.match(mileHtml, /Casey Partial/); assert.match(mileHtml, /Incomplete edition held for review/);
  assert.match(mileHtml, /02:20:39/, 'Keep the faster held result visible as its recorded finish');
  assert.match(mileHtml, /00:16:40\.000/, 'Keep original checkpoint formatting rather than recomputing it');
  assert.match(mileHtml, /<strong>3:30:58\.5<\/strong><span>Fastest selected eligible finish/, 'A faster held result cannot replace the eligible best');
  assert.match(mileHtml, /26\.22 mi/); assert.doesNotMatch(mileHtml, /5:00\/km/);
  const kmHtml = render([base], 'km'); assert.match(kmHtml, /5:00\/km/); assert.match(kmHtml, /42\.195 km/);
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
  const { metadata } = require('../app/runners/page.tsx');
  assert.deepEqual(metadata.robots, { index: false, follow: true }, '/runners is noindex, follow');
  assert.equal(metadata.alternates, undefined, 'A noindex page has no canonical');
  assert.doesNotMatch(JSON.stringify(metadata), /[?&]q=/);
  console.log('Runner search checks passed: Unicode/token matching, complete pagination, all-ineligible search/profile views, retained source readings, explicit eligibility, year-only progression, mi/km readings, verified versioned gzip loading, and names kept out of the address with /runners noindex.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
