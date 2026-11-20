const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};

// Runner context in the browser on lookup version 2: peer placement, groups and race comparisons on fixtures, and the
// loader against the committed lookup manifest and the committed context manifest (never skipped). The context binds to the marathon cohort the lookup names (lead ruling D24.8): its digest, the release, the
// input time, the cohort's own time and counts; an edition the context manifest does not list has no comparison, and a
// race that is not counted is compared with no one and asks for nothing.
const LOOKUP_DIR = path.join(__dirname, '../public/data/runners');
const SERVED = '/data/runners/';
const lookupHead = JSON.parse(fs.readFileSync(path.join(LOOKUP_DIR, 'manifest.json'), 'utf8'));
assert.equal(lookupHead.schema_version, 2, `${LOOKUP_DIR} is not a schema 2 runner lookup`);
const contextFile = require.resolve('../lib/runner-context.ts');
const freshClient = () => { delete require.cache[contextFile]; return require(contextFile); };
const client = freshClient();
const { RUNNER_RELEASE, RUNNER_POINTS, loadRunnerManifest, runnerManifestDigest } = require('../lib/runner-search.ts');
const { openLookup } = require('./lib/lookup-files.cjs');
const lookupEditions = openLookup(LOOKUP_DIR).editions;
// The fixture edition: the first counted marathon edition the lookup gives a cohort index; a second one stands for an
// edition the context manifest leaves out.
const [listedEdition, unlistedEdition] = lookupEditions.filter(e => e.distance === 'marathon' && e.context !== null && e.reason === null);
const COHORT_INDEX = listedEdition.context;
const clone = value => structuredClone(value);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: expected ${expected}, received ${actual}`);
const tests = [];
const test = (name, run) => tests.push({ name, run });
const group = finish => ({ n: finish.reduce((sum, row) => sum + row[1], 0), finish, pace: {} });
const race = (changes = {}) => {
  const finish = changes.finish ?? 14400.125;
  const { finish: _, ...fields } = changes;
  const id = fields.id ?? 1;
  return { id, key: 'f' + id, db: 'f', distance: 'marathon', edition: listedEdition.index, name: 'Fixture Runner', sex: 'F', age: 35, link: '0', confirmed: false, possible: false,
    status: 0, eligible: true, counted: true, reason: null, times: RUNNER_POINTS.map(km => km === 42.195 ? finish : finish * km / 42.195), ...fields, key: 'f' + id };
};
const pace = { n: 201, from_sec: 13950, to_sec: 14850, q25: Array(9).fill(330), median: Array(9).fill(340), q75: Array(9).fill(350), late_change: { q25: -2, median: 0, q75: 5 } };
const fullGroup = { ...group([[14400.125, 101], [14500, 100]]), pace: { '240': pace } };
const edition = { city: listedEdition.city, year: listedEdition.year, race: listedEdition.race };
const context = {
  schema_version: 1, release_tag: RUNNER_RELEASE, edition: { ...edition, index: COHORT_INDEX }, eligible_n: 201, age_n: 201, gender_n: 201,
  groups: { all: fullGroup, 'gender:Women': clone(fullGroup), 'age:35-39': clone(fullGroup), 'age_gender:35-39:Women': clone(fullGroup) },
  weather: null, weather_reason: 'No unambiguous scheduled start.', terrain: null, terrain_reason: 'No matched route.',
};

test('placement excludes the focus and gives exact ties half weight', () => {
  const data = group([[14000, 40], [14400.125, 21], [15000, 140]]);
  assert.deepEqual(client.finishPlacement(data, 14400.125), { n: 201, other_n: 200, rank: 41, ties: 20, percentile: 75, median_finish: 15000 });
  const allTied = client.finishPlacement(group([[14400, 101]]), 14400);
  assert.equal(allTied.percentile, 50); assert.equal(allTied.ties, 100); assert.equal(allTied.rank, 1);
});
test('fastest and slowest finishes have the correct percentile direction', () => {
  const data = group([[14000, 1], [14400, 99], [15000, 1]]);
  assert.equal(client.finishPlacement(data, 14000).percentile, 100);
  assert.equal(client.finishPlacement(data, 15000).percentile, 0);
  assert.equal(client.finishPlacement(data, 15000).rank, 101);
});
test('millisecond precision preserves adjacent finish times', () => {
  const data = group([[14400.125, 51], [14400.126, 50]]);
  const first = client.finishPlacement(data, 14400.125000000002);
  assert.equal(first.ties, 50); assert.equal(first.rank, 1); assert.equal(first.percentile, 75);
  const next = client.finishPlacement(data, 14400.126);
  assert.equal(next.ties, 49); assert.equal(next.rank, 52); assert.equal(next.percentile, 24.5);
  assert.equal(first.median_finish, 14400.125);
});
test('even field median interpolates the two central observations', () => {
  const data = group([[14000, 51], [15000, 51]]);
  assert.equal(client.finishPlacement(data, 14000).median_finish, 14500);
});
test('small groups and absent exact timings provide no placement', () => {
  assert.equal(client.finishPlacement(group([[14400, 100]]), 14400), null);
  assert.equal(client.finishPlacement(group([[14400, 101]]), 14400.001), null);
  assert.equal(client.finishPlacement(group([[14400, 101]]), 14399.999), null);
});
test('exact age bands include both edges and reject inferred ages', () => {
  for (const [age, expected] of [[18, '18-24'], [24, '18-24'], [25, '25-29'], [29, '25-29'], [30, '30-34'], [34, '30-34'], [35, '35-39'], [84, '80-84'], [85, '85-89'], [89, '85-89']]) assert.equal(client.runnerAgeBand(age), expected);
  for (const age of [null, undefined, 17, 24.5, 90, NaN, Infinity]) assert.equal(client.runnerAgeBand(age), null);
});
test('only supported recorded gender aliases define a peer group', () => {
  for (const sex of ['F', ' female ', 'WOMAN', 'women']) assert.equal(client.runnerGender(sex), 'Women');
  for (const sex of ['M', ' male ', 'MAN', 'men']) assert.equal(client.runnerGender(sex), 'Men');
  for (const sex of [null, undefined, '', 'X', 'Other', 'nonbinary', 'unknown']) assert.equal(client.runnerGender(sex), null);
});
test('achieved-time buckets have half-open boundaries without minute rounding', () => {
  for (const [seconds, expected] of [[5400, '90'], [13949.999, '225'], [13950, '240'], [14849.999, '240'], [14850, '255'], [43200, '720']]) assert.equal(client.pacePeerKey(seconds), expected);
  assert.equal(client.pacePeerKey(13949.999000000002), '225');
});
test('insights select exact demographic and achieved-time groups without mutation', () => {
  const original = JSON.stringify(context), result = client.raceInsights(context, race());
  assert.deepEqual(Object.keys(result.comparisons), ['all', 'gender', 'age', 'age_gender']);
  assert.equal(result.comparisons.gender.label, 'Women'); assert.equal(result.comparisons.age.label, 'Ages 35–39');
  assert.equal(result.comparisons.age_gender.label, 'Women, ages 35–39');
  for (const comparison of Object.values(result.comparisons)) { assert.equal(comparison.n, 201); assert.equal(comparison.pace.n, 201); }
  assert.equal('groups' in result, false); assert.equal(JSON.stringify(context), original);
});
test('missing demographics never silently fall back to the whole field', () => {
  const unknown = client.raceInsights(context, race({ age: null, sex: 'unknown' })).comparisons;
  assert.ok(unknown.all); assert.equal(unknown.age, null); assert.equal(unknown.gender, null); assert.equal(unknown.age_gender, null);
  const missing = clone(context); delete missing.groups['age_gender:35-39:Women'];
  const selected = client.raceInsights(missing, race()).comparisons;
  assert.ok(selected.age); assert.ok(selected.gender); assert.equal(selected.age_gender, null);
  const withoutPace = clone(context); withoutPace.groups.all.pace = {};
  assert.equal(client.raceInsights(withoutPace, race()).comparisons.all.pace, null);
});
test('excluded, incomplete, and unmatched finishes cannot obtain peer placement', () => {
  for (const selected of [race({ eligible: false, reason: 'Reviewed source exclusion' }), race({ times: [...race().times.slice(0, 8), null] }), race({ finish: 14400.126 })]) {
    assert.ok(Object.values(client.raceInsights(context, selected).comparisons).every(value => value === null));
  }
});
test('all nine signed section differences reconcile for an explicit same-year pair', () => {
  const manifest = { editions: [edition, { ...edition, race: 'Alternate course label' }, { city: 'Elsewhere', year: 2020, race: 'Other Marathon' }] };
  const reference = race({ id: 2, edition: 1, times: RUNNER_POINTS.map(km => km * 330) });
  const changes = [50, -25, 0, 100, -50, 25, -100, 50, -21.95];
  let cumulative = 0;
  const focus = race({ edition: 0, times: reference.times.map((time, i) => { cumulative += changes[i]; return time + cumulative; }) });
  const original = JSON.stringify([focus, reference]);
  const result = client.compareRunnerRaces(focus, reference, manifest);
  assert.equal(result.sections.length, 9); assert.equal(result.sameCourse, true);
  result.sections.forEach((row, i) => { close(row.seconds, changes[i], `section ${i}`); assert.equal(row.start, i ? RUNNER_POINTS[i - 1] : 0); assert.equal(row.end, RUNNER_POINTS[i]); });
  close(result.sections[8].end - result.sections[8].start, 2.195, 'final section distance');
  close(result.finish, 28.05, 'finish difference'); close(result.early, 100, 'difference through 30 km'); close(result.late, -71.95, 'late difference');
  close(result.sections.reduce((sum, row) => sum + row.seconds, 0), result.finish, 'section sum'); close(result.early + result.late, result.finish, 'early and late sum');
  const reversed = client.compareRunnerRaces(reference, focus, manifest);
  close(reversed.finish, -result.finish, 'reversed finish difference');
  reversed.sections.forEach((row, i) => close(row.seconds, -result.sections[i].seconds, `reversed section ${i}`));
  assert.equal(client.compareRunnerRaces(focus, { ...reference, edition: 2 }, manifest).sameCourse, false);
  assert.equal(JSON.stringify([focus, reference]), original);
  assert.equal('earlier' in result, false); assert.equal('improvement' in result, false);
});
test('race comparisons reject self-comparison and unusable timings', () => {
  const manifest = { editions: [edition] }, valid = race({ edition: 0 });
  assert.equal(client.compareRunnerRaces(valid, valid, manifest), null);
  assert.equal(client.compareRunnerRaces(valid, race({ id: 2, edition: 0, eligible: false }), manifest), null);
  assert.equal(client.compareRunnerRaces(race({ edition: 0, times: Array(9).fill(14400) }), race({ id: 2, edition: 0 }), manifest), null);
});

function fixture(options = {}) {
  const data = clone(context);
  options.data?.(data);
  const bytes = gzipSync(Buffer.from(JSON.stringify(data)));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // The lookup manifest as served: its own bytes, or a changed copy.
  const lookupBytes = fs.readFileSync(path.join(LOOKUP_DIR, 'manifest.json'));
  const changed = JSON.parse(lookupBytes); options.runners?.(changed);
  const servedRunnerBytes = options.runners ? Buffer.from(JSON.stringify(changed, null, 2) + '\n') : lookupBytes;
  const cohort = lookupHead.cohort;
  const manifest = { schema_version: 1, release_tag: RUNNER_RELEASE, input_as_of: cohort.input_as_of, as_of: '2026-11-14T16:00:00Z', runner_manifest_as_of: cohort.as_of,
    cohort_manifest_sha256: cohort.manifest_sha256, runner_manifest_sha256: cohort.manifest_sha256, cohort: { raw: cohort.raw_records, eligible: cohort.eligible_records },
    totals: { eligible: cohort.eligible_records, groups: 1 }, counted_editions: 1,
    editions: { [String(COHORT_INDEX)]: { file: `editions/${String(COHORT_INDEX).padStart(3, '0')}.json.gz`, bytes: bytes.byteLength, sha256 } } };
  options.manifest?.(manifest);
  return { data, bytes, manifest, servedRunnerBytes };
}
async function withFetch(options, run) {
  const payload = fixture(options), requests = [], previous = global.fetch;
  global.fetch = async (url, init = {}) => {
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (String(url).startsWith(SERVED + 'manifest.json?')) return new Response(payload.servedRunnerBytes);
    if (String(url).startsWith(SERVED)) return new Response(fs.readFileSync(path.join(LOOKUP_DIR, String(url).slice(SERVED.length).replace(/\?v=.*$/, ''))));
    requests.push({ url: String(url), signal: init.signal });
    if (String(url).includes('/data/runner-context/manifest.json?')) return new Response(JSON.stringify(payload.manifest), { status: options.manifestStatus || 200 });
    assert.match(String(url), new RegExp(`/data/runner-context/editions/${String(COHORT_INDEX).padStart(3, '0')}\\.json\\.gz\\?v=[a-f0-9]{64}$`));
    if (options.editionResponse) return options.editionResponse(payload, init);
    return new Response(options.corrupt ? options.corrupt(Buffer.from(payload.bytes)) : payload.bytes, { status: options.editionStatus || 200 });
  };
  try {
    payload.runners = await loadRunnerManifest();
    assert.equal(runnerManifestDigest(payload.runners), createHash('sha256').update(payload.servedRunnerBytes).digest('hex'));
    return await run(freshClient(), payload, requests);
  } finally { global.fetch = previous; }
}
test('loader opens genuine gzip bytes, verifies their hash and reuses an edition', async () => {
  await withFetch({}, async (loaded, payload, requests) => {
    const control = new AbortController(), selected = [race(), race({ id: 2, finish: 14500 })];
    const result = await loaded.loadRaceInsights(selected, payload.runners, control.signal);
    assert.deepEqual(Object.keys(result), ['f1', 'f2'], 'Insights are keyed by record key'); assert.equal(result.f1.comparisons.all.n, 201);
    assert.equal(result.f2.comparisons.all.rank, 102); assert.equal(result.f1.weather, null);
    assert.equal(requests.length, 2, 'Two selected records in one edition require one compressed file');
    assert.ok(requests.every(request => request.signal === control.signal));
    assert.ok(requests[1].url.endsWith(payload.manifest.editions['0'].sha256));
    await loaded.loadRaceInsights([race()], payload.runners, control.signal);
    assert.equal(requests.length, 3, 'A verified cached edition is reused after the manifest is checked again');
  });
});
test('loader rejects a lookup that names another cohort, before any edition download', async () => {
  await withFetch({ runners: value => { value.cohort.manifest_sha256 = 'a'.repeat(64); } }, async (loaded, payload, requests) => {
    for (const key of ['release_tag', 'input_as_of', 'as_of']) assert.equal(payload.runners[key], lookupHead[key]);
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not be verified/);
    assert.equal(requests.length, 1, 'A cohort mismatch must stop before any edition download');
  });
});
test('a race that is not counted asks for nothing; an unlisted edition has no comparison', async () => {
  await withFetch({}, async (loaded, payload, requests) => {
    const own = race({ status: 1, counted: false, reason: 'Own record.' }), limited = race({ id: 3, status: 3, eligible: false, counted: false, reason: 'Missing.' });
    assert.deepEqual(await loaded.loadRaceInsights([own, limited], payload.runners, new AbortController().signal), {});
    assert.equal(requests.length, 0, 'No request when no race is counted');
    const elsewhere = race({ id: 4, edition: unlistedEdition.index });
    const result = await loaded.loadRaceInsights([elsewhere, race()], payload.runners, new AbortController().signal);
    assert.deepEqual(Object.keys(result), ['f1'], 'An edition the context manifest does not list gets no entry');
    assert.equal(requests.length, 2, 'The context manifest and the one listed edition');
    assert.ok(requests[1].url.includes(payload.manifest.editions[String(COHORT_INDEX)].sha256), 'Only the listed edition\'s file');
  });
});
test('the committed context manifest validates against the committed lookup, keyed by the lookup\'s cohort indexes', async () => {
  const committed = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/runner-context/manifest.json'), 'utf8'));
  await withFetch({}, async (loaded, payload) => {
    const checked = loaded.validateContextManifest(committed, payload.runners);
    const contexts = new Set(lookupEditions.filter(e => e.distance === 'marathon' && e.context !== null).map(e => String(e.context)));
    assert.ok(Object.keys(checked.editions).length > 0 && Object.keys(checked.editions).every(index => contexts.has(index)), 'Every context file sits under an edition index the lookup names');
    assert.equal(checked.cohort_manifest_sha256, payload.runners.cohort.manifest_sha256);
  });
});
test('the context manifest lists files only under cohort edition indexes', async () => {
  await withFetch({ manifest: value => { value.editions[String(lookupHead.cohort.editions)] = value.editions[String(COHORT_INDEX)]; } }, async (loaded, payload) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not be verified/);
  });
});
test('loader refuses a plain manifest object without a verified transport digest', async () => {
  await withFetch({}, async (loaded, payload, requests) => {
    const unverified = clone(payload.runners);
    assert.equal(runnerManifestDigest(unverified), undefined);
    await assert.rejects(loaded.loadRaceInsights([race()], unverified, new AbortController().signal), /could not be verified/);
    assert.equal(requests.length, 0, 'An unverified manifest must fail before requesting context');
  });
});
for (const [label, change] of [
  ['release', value => { value.release_tag = 'obsolete-export'; }],
  ['input timestamp', value => { value.input_as_of = '2026-09-10T01:00:00Z'; }],
  ['runner manifest timestamp', value => { value.runner_manifest_as_of = '2026-09-11T01:00:00Z'; }],
  ['raw population', value => { value.cohort.raw++; }],
  ['eligible population', value => { value.cohort.eligible++; }],
  ['cohort digest', value => { value.cohort_manifest_sha256 = 'b'.repeat(64); value.runner_manifest_sha256 = 'b'.repeat(64); }],
  ['compatibility digest', value => { value.runner_manifest_sha256 = 'b'.repeat(64); }],
  ['cohort digest without its compatibility name', value => { value.cohort_manifest_sha256 = 'b'.repeat(64); }],
  ['eligible total', value => { value.totals.eligible++; }],
  ['counted editions', value => { value.counted_editions = 0; }],
]) test(`loader rejects stale ${label} before requesting edition data`, async () => {
  await withFetch({ manifest: change }, async (loaded, payload, requests) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not be verified/);
    assert.equal(requests.length, 1);
  });
});
for (const [label, change] of [
  ['edition identity', value => { value.edition.city = 'Wrong city'; }],
  ['edition index', value => { value.edition.index = COHORT_INDEX + 1; }],
  ['release inside valid gzip', value => { value.release_tag = 'obsolete-export'; }],
  ['CDF count', value => { value.groups.all.finish[0][1]--; }],
  ['CDF ordering', value => { value.groups.all.finish.reverse(); }],
  ['pace quantiles', value => { value.groups.all.pace['240'].q25[0] = 500; }],
]) test(`loader rejects invalid ${label} despite a matching transport checksum`, async () => {
  await withFetch({ data: change }, async (loaded, payload) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not be verified/);
  });
});
test('loader rejects wrong SHA before attempting decompression', async () => {
  await withFetch({ corrupt: bytes => { bytes[bytes.length - 1] ^= 1; return bytes; } }, async (loaded, payload) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not be verified/);
  });
});
test('loader rejects an incorrect declared compressed size', async () => {
  await withFetch({ manifest: value => { value.editions['0'].bytes++; } }, async (loaded, payload) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not be verified/);
  });
});
test('loader distinguishes an unavailable response from verified data', async () => {
  for (const options of [{ manifestStatus: 503 }, { editionStatus: 404 }]) await withFetch(options, async (loaded, payload) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, new AbortController().signal), /could not load/);
  });
});
test('loader propagates cancellation before fetching and during an edition request', async () => {
  const before = new AbortController(); before.abort();
  await withFetch({}, async (loaded, payload, requests) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, before.signal), { name: 'AbortError' });
    assert.equal(requests.length, 0);
  });
  const during = new AbortController();
  await withFetch({ editionResponse: (payload, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    queueMicrotask(() => during.abort());
  }) }, async (loaded, payload, requests) => {
    await assert.rejects(loaded.loadRaceInsights([race()], payload.runners, during.signal), { name: 'AbortError' });
    assert.equal(requests.length, 2); assert.ok(requests.every(request => request.signal === during.signal));
  });
});

(async () => {
  for (const { name, run } of tests) {
    try { await run(); } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
  }
  console.log(`Runner context client passed ${tests.length} checks: exact peer placement, demographic and time-band boundaries, signed race comparisons, verified gzip transport bound to the cohort the lookup names, no request for a race that is not counted, no comparison for an unlisted edition, stale/corrupt response rejection and cancellation (schema 2).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
