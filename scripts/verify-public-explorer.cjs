const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--data-root'), 'Usage: node scripts/verify-public-explorer.cjs [--data-root directory]');
const dataRoot = args.length ? path.resolve(args[1]) : path.join(root, 'public/data');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(Buffer.from(value));
const bucket = value => digest(value).slice(0, 3);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const text = value => typeof value === 'string' && value.length > 0;
const near = (actual, expected, message) => assert.ok(finite(actual) && Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
const canonicalJson = value => JSON.stringify((function sort(item) {
  if (Array.isArray(item)) return item.map(sort);
  if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]));
  return item;
})(value));
const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const prefixes = name => [...new Set(normalize(name).split(' ').filter(Boolean).map(word => Array.from(word).slice(0, 3).join('')))];
const release = read(path.join(root, 'analysis/release.json'));
const baseline = read(path.join(root, 'public/data/packs/ext_personalized_guide/pack_meta.json'));
assert.equal(baseline.input_export_id, release.tag.replace('private-export-', 'private-'), 'Personalized data must use the current release pin');
assert.equal(baseline.status, 'ready');
const study = read(path.join(dataRoot, 'study/evidence.json'));
const manifest = read(path.join(dataRoot, 'runners/manifest.json'));
const scriptNames = ['build_public_explorer.py', 'build_runner_lookup.py', 'build_pacing.py', 'build_extended.py', 'source_quality.py'];

function provenance(value, label) {
  assert.equal(value.schema_version, 1, `${label}: schema version`);
  assert.equal(value.release_tag, release.tag, `${label}: pinned release`);
  for (const stamp of ['input_as_of', 'as_of']) assert.ok(Number.isFinite(Date.parse(value[stamp])), `${label}: ${stamp}`);
  assert.equal(value.input_as_of, baseline.input_as_of, `${label}: input timestamp`);
  for (const field of ['input_asset_sha256', 'input_manifest_sha256']) {
    assert.match(value[field], /^[a-f0-9]{64}$/);
    assert.equal(value[field], baseline[field], `${label}: ${field}`);
  }
  assert.deepEqual(Object.keys(value.scripts).sort(), [...scriptNames].sort(), `${label}: complete script provenance`);
  for (const script of scriptNames) {
    const bytes = fs.readFileSync(path.join(root, 'analysis', script));
    assert.ok(bytes.length > 0, `${script}: source file is empty`);
    assert.equal(value.scripts[script], hash(bytes), `${label}: stale ${script} output`);
  }
  assert.deepEqual(value.cohort, baseline.cohort, `${label}: cohort must equal the main analyses`);
  const c = value.cohort;
  for (const count of Object.values(c)) assert.ok(integer(count), `${label}: invalid cohort count`);
  assert.equal(c.raw, c.duplicates_removed + c.missing_or_unparsed + c.non_increasing + c.outside_quality_bounds + c.source_quality_excluded + c.eligible);
  assert.equal(c.raw - c.duplicates_removed, c.deduplicated);
  assert.equal(c.deduplicated - c.missing_or_unparsed, c.complete);
  assert.equal(c.complete - c.non_increasing, c.increasing);
  assert.equal(c.increasing - c.outside_quality_bounds, c.timing_eligible);
  assert.equal(c.timing_eligible - c.source_quality_excluded, c.eligible);
  const quality = value.source_quality;
  assert.deepEqual(quality, baseline.source_quality, `${label}: reviewed edition policy and counts`);
  assert.equal(quality.release_tag, release.tag);
  assert.equal(quality.reviewed_edition_policy, true);
  assert.equal(quality.script_sha256, value.scripts['source_quality.py']);
  const definition = { version: quality.version, release_tag: quality.release_tag, reviewed_edition_policy: quality.reviewed_edition_policy,
    editions: quality.editions.map(({ city, year, category, reason }) => ({ city, year, category, reason })) };
  assert.equal(quality.policy_sha256, digest(canonicalJson(definition)), `${label}: edition policy hash`);
  assert.equal(new Set(quality.editions.map(row => JSON.stringify([row.city, row.year]))).size, quality.editions.length);
  for (const row of quality.editions) {
    assert.ok(text(row.city) && integer(row.year, 1) && text(row.category) && text(row.reason));
    assert.ok([row.raw_records, row.deduplicated_records, row.timing_eligible_excluded].every(n => integer(n)));
    assert.ok(row.raw_records >= row.deduplicated_records && row.deduplicated_records >= row.timing_eligible_excluded);
  }
  assert.equal(quality.editions.reduce((sum, row) => sum + row.timing_eligible_excluded, 0), c.source_quality_excluded);
  assert.deepEqual(value.linkage, baseline.linkage_audit, `${label}: audited identity linkage`);
  assert.equal(value.linkage.canonical_id_contract_verified, true);
}
provenance(study, 'Study');
provenance(manifest, 'Runner manifest');
if (!args.length) {
  const live = read(path.join(dataRoot, 'live.json'));
  assert.equal(live.schema_version, 2);
  assert.equal(live.release_tag, study.release_tag);
  assert.equal(live.as_of, study.as_of);
  assert.equal(live.corpus.n_records, study.cohort.raw);
  assert.equal(live.corpus.eligible_finishes, study.n);
  assert.ok(!live.figures && !live.tables, 'Compatibility metadata cannot expose old figures');
}
assert.equal(study.n, study.cohort.eligible);
assert.ok(integer(study.n, 1) && integer(study.detected) && study.detected <= study.n);
near(study.rate, 100 * study.detected / study.n, 'Overall slowdown rate');
for (const item of [study.overview, study.timing, study.severity, study.landmarks, ...study.figures]) {
  assert.ok(text(item.title) && text(item.answer) && Array.isArray(item.method) && item.method.length && item.method.every(text));
  assert.ok(Array.isArray(item.charts) && item.charts.length);
  for (const chart of item.charts) {
    assert.ok(text(chart.title) && text(chart.unit) && text(chart.xLabel));
    assert.ok(Array.isArray(chart.rows) && Array.isArray(chart.series) && chart.series.length);
    for (const row of chart.rows) for (const series of chart.series) {
      assert.ok(finite(row[series.key]), `${chart.title}: missing ${series.key}`);
      assert.ok(integer(row['n_' + series.key], 1) && row['n_' + series.key] <= study.n, `${chart.title}: observation count`);
      if (chart.unit === '%') assert.ok(row[series.key] >= 0 && row[series.key] <= 100, `${chart.title}: percentage bounds`);
    }
  }
}
assert.deepEqual(study.figures.map(row => row.id).sort(), ['age', 'history', 'sensitivity']);
const courseRows = study.overview.charts[0].rows;
assert.equal(new Set(courseRows.map(row => row.label)).size, courseRows.length);
for (const row of courseRows) {
  assert.ok(row.n_value >= 100 && integer(row.successes) && row.successes <= row.n_value);
  near(row.value, 100 * row.successes / row.n_value, 'Course slowdown rate');
}
assert.ok(courseRows.reduce((n, row) => n + row.n_value, 0) <= study.n);
assert.ok(courseRows.reduce((n, row) => n + row.successes, 0) <= study.detected);
const onsetRows = study.timing.charts[0].rows;
assert.equal(new Set(onsetRows.map(row => row.label)).size, onsetRows.length);
for (const row of onsetRows) {
  assert.ok([20, 25, 30, 35].includes(row.label), 'The final 2.195 km cannot form a qualifying episode alone');
  assert.ok(integer(row.episodes, 1));
  assert.equal(row.n_value, study.detected, 'Every onset shares the full detected-finish denominator');
  near(row.value, 100 * row.episodes / study.detected, 'Onset share');
}
assert.equal(onsetRows.reduce((sum, row) => sum + row.episodes, 0), study.detected);
near(onsetRows.reduce((sum, row) => sum + row.value, 0), study.detected ? 100 : 0, 'Onset percentages sum');
const sensitivity = study.figures.find(row => row.id === 'sensitivity').charts[0].rows;
const thresholds = [10, 15, 20, 25, 30, 40, 50], lengths = [5, 10, 15, 20];
assert.equal(sensitivity.length, thresholds.length * lengths.length);
const cells = new Map();
for (const row of sensitivity) {
  const key = row.length + '/' + row.label;
  assert.ok(!cells.has(key) && thresholds.includes(row.label) && lengths.some(length => row.length === length + ' km'));
  assert.equal(row.n_value, study.n);
  assert.ok(integer(row.count) && row.count <= study.n);
  near(row.value, 100 * row.count / study.n, 'Sensitivity rate');
  cells.set(key, row.count);
}
for (const length of lengths) for (let i = 1; i < thresholds.length; i++) assert.ok(cells.get(length + ' km/' + thresholds[i]) <= cells.get(length + ' km/' + thresholds[i - 1]), 'Increasing slowdown threshold must not increase detections');
for (const threshold of thresholds) for (let i = 1; i < lengths.length; i++) assert.ok(cells.get(lengths[i] + ' km/' + threshold) <= cells.get(lengths[i - 1] + ' km/' + threshold), 'Increasing required distance must not increase detections');
assert.equal(cells.get('5 km/25'), study.detected, 'Standard sensitivity cell must equal the headline detection count');
const severity = study.severity.charts[0].rows;
assert.equal(severity.reduce((sum, row) => sum + row.count, 0), study.n);
for (const row of severity) {
  assert.ok(integer(row.count, 1));
  assert.equal(row.n_value, study.n);
  near(row.value, 100 * row.count / study.n, 'Severity distribution');
}
near(severity.reduce((sum, row) => sum + row.value, 0), 100, 'Severity percentages sum');
const landmarks = study.landmarks.charts[0].rows;
assert.deepEqual(landmarks.map(row => row.label), ['3:00', '3:30', '4:00']);
for (const row of landmarks) {
  assert.ok(integer(row.before) && integer(row.after) && row.before + row.after <= study.n);
  assert.equal(row.n_before, study.n); assert.equal(row.n_after, study.n);
}
console.log(`Verified current study: ${study.n.toLocaleString('en-US')} eligible finishes, sensitivity, onset denominators, reviewed source exclusions and calculation hashes.`);

const points = [5, 10, 15, 20, 25, 30, 35, 40, 42.195], lengthsKm = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
assert.deepEqual(manifest.points_km, points);
for (const field of ['raw_records', 'eligible_records', 'named_records', 'unnamed_records', 'profiles', 'index_rows']) assert.ok(integer(manifest[field]), `Runner manifest: ${field}`);
assert.equal(manifest.raw_records, study.cohort.raw);
assert.equal(manifest.eligible_records, study.n);
assert.equal(manifest.named_records + manifest.unnamed_records, manifest.raw_records);
assert.ok(manifest.profiles > 0 && manifest.profiles <= manifest.raw_records);
assert.ok(Array.isArray(manifest.editions) && manifest.editions.length > 0);
const editionKeys = new Set();
for (const edition of manifest.editions) {
  assert.ok(text(edition.city) && integer(edition.year, 1) && text(edition.race), 'Invalid race edition');
  const key = JSON.stringify([edition.city, edition.year, edition.race]);
  assert.ok(!editionKeys.has(key), 'Duplicate edition'); editionKeys.add(key);
}
assert.equal(new Set(manifest.editions.map(row => row.city)).size, baseline.corpus.n_cities);
assert.equal(new Set(manifest.editions.map(row => JSON.stringify([row.city, row.year]))).size, baseline.corpus.n_race_years);
assert.equal(manifest.raw_records, baseline.corpus.n_records);
const forbiddenEditions = new Set(manifest.source_quality.editions.map(row => JSON.stringify([row.city, row.year])));
assert.ok(manifest.shards && typeof manifest.shards === 'object' && !Array.isArray(manifest.shards));
const files = Object.keys(manifest.shards).sort();
assert.ok(files.some(file => file.startsWith('profiles/')) && files.some(file => file.startsWith('index/')), 'Missing runner shard family');
function shard(file) {
  assert.match(file, /^(profiles|index)\/[a-f0-9]{3}\.json\.gz$/);
  const info = manifest.shards[file];
  assert.match(info.sha256, /^[a-f0-9]{64}$/); assert.ok(integer(info.bytes, 1));
  const bytes = fs.readFileSync(path.join(dataRoot, 'runners', file));
  assert.equal(bytes.length, info.bytes, `${file}: compressed byte count`);
  assert.equal(hash(bytes), info.sha256, `${file}: SHA-256`);
  const data = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
  assert.equal(data.release_tag, release.tag, `${file}: release tag`);
  return data;
}
// Compare every expected search alias with the published index without retaining
// millions of names or records. Count plus two 256-bit multiset accumulators
// preserve multiplicity when different token prefixes share a hash bucket.
const mask = (1n << 256n) - 1n;
const expectedIndex = new Map(), actualIndex = new Map();
function addIndex(map, key, row) {
  const state = map.get(key) || { count: 0, sum: 0n, xor: 0n };
  const value = BigInt('0x' + digest(JSON.stringify(row)));
  state.count++; state.sum = (state.sum + value) & mask; state.xor ^= value;
  map.set(key, state);
}
// Store only IDs (~8 bytes per raw record), then sort to find duplicates across
// profile shards. This is far smaller than retaining all runner objects or Sets.
const recordIds = new Float64Array(manifest.raw_records);
let rawCount = 0, eligibleCount = 0, namedCount = 0, profileCount = 0, expectedIndexCount = 0;
let runnerDetections = 0, preliminaryProfiles = 0;
assert.ok(manifest.preliminary_links && integer(manifest.preliminary_links.profiles, 0) && Array.isArray(manifest.preliminary_links.editions), 'Manifest preliminary links');
const preliminaryEditions = new Set(manifest.preliminary_links.editions.map(edition => JSON.stringify(edition)));
const runnerOnsets = new Map();
const editionCounts = new Uint32Array(manifest.editions.length);
for (const file of files.filter(file => file.startsWith('profiles/'))) {
  const data = shard(file), key = file.slice(9, 12);
  assert.ok(Array.isArray(data.profiles) && data.profiles.length, `${file}: empty profiles`);
  let previousProfile = 0;
  for (const profile of data.profiles) {
    assert.ok(integer(profile.id, 1) && profile.id > previousProfile && bucket(String(profile.id)) === key, `${file}: profile identity or bucket`);
    previousProfile = profile.id;
    assert.ok(Array.isArray(profile.names) && profile.names.every(text));
    assert.equal(new Set(profile.names).size, profile.names.length, 'Repeated profile alias');
    assert.ok(Array.isArray(profile.races) && profile.races.length > 0);
    const names = new Set();
    let minId = Infinity, firstYear = Infinity, lastYear = -Infinity, latestCity = '', latestId = Infinity;
    for (const race of profile.races) {
      assert.ok(integer(race.id, 1), 'Invalid record ID');
      assert.ok(integer(race.edition) && race.edition < manifest.editions.length, 'Invalid edition reference');
      assert.ok(typeof race.name === 'string' && (race.sex === null || typeof race.sex === 'string'));
      assert.ok(race.age === null || (finite(race.age) && race.age >= 0), 'Invalid recorded age');
      assert.ok(typeof race.eligible === 'boolean' && (race.reason === null || text(race.reason)));
      assert.ok(Array.isArray(race.times) && race.times.length === 9 && race.times.every(time => time === null || (finite(time) && time >= 0)), 'Nine recorded cumulative timings required');
      const edition = manifest.editions[race.edition];
      if (race.eligible) {
        assert.equal(race.reason, null, 'Eligible record carries an exclusion reason');
        assert.ok(!forbiddenEditions.has(JSON.stringify([edition.city, edition.year])), 'Excluded edition leaked into eligible runner results');
        assert.ok(race.times.every(finite) && race.times[8] >= 5400 && race.times[8] <= 43200);
        for (let i = 0; i < 9; i++) {
          const elapsed = race.times[i] - (i ? race.times[i - 1] : 0), pace = elapsed / lengthsKm[i];
          assert.ok(elapsed > 0 && pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'Eligible section is outside the analytical timing bounds');
        }
        const reference = (race.times[3] - race.times[0]) / 15;
        let runLength = 0, runStart = null;
        for (let i = 4; i < 9; i++) {
          const slowing = (race.times[i] - race.times[i - 1]) / lengthsKm[i] / reference - 1;
          if (slowing + 1e-12 >= .25) {
            if (runStart === null) runStart = points[i - 1];
            runLength += lengthsKm[i];
            if (runLength >= 5) {
              runnerDetections++;
              runnerOnsets.set(runStart, (runnerOnsets.get(runStart) || 0) + 1);
              break;
            }
          } else { runLength = 0; runStart = null; }
        }
        eligibleCount++;
      } else {
        assert.ok(text(race.reason), 'An excluded record needs a reason');
        assert.ok(Array.isArray(race.raw_times) && race.raw_times.length === 9 && race.raw_times.every(time => time === null || typeof time === 'string'), 'Excluded records must retain original timing strings');
      }
      assert.ok(rawCount < recordIds.length, 'More raw records than declared');
      recordIds[rawCount++] = race.id; editionCounts[race.edition]++;
      if (race.name) names.add(race.name);
      if (normalize(race.name)) namedCount++;
      minId = Math.min(minId, race.id); firstYear = Math.min(firstYear, edition.year);
      if (edition.year > lastYear || (edition.year === lastYear && race.id < latestId)) { lastYear = edition.year; latestCity = edition.city; latestId = race.id; }
    }
    assert.equal(profile.id, minId, 'Profile identity is the smallest recorded source ID');
    // A preliminary link (November 5, 2026): a profile is marked preliminary exactly when it joins more than one record
    // and at least one race is marked link "preliminary"; such races sit only in the editions the manifest names.
    const prelimRaces = profile.races.filter(race => race.link !== undefined);
    assert.ok(prelimRaces.every(race => race.link === 'preliminary'), `${file}: unknown race link mark`);
    assert.ok(profile.preliminary === undefined || profile.preliminary === true, `${file}: preliminary must be true or absent`);
    assert.equal(!!profile.preliminary, profile.races.length > 1 && prelimRaces.length > 0, `${file}: profile ${profile.id} preliminary mark does not match its races`);
    for (const race of prelimRaces) {
      const edition = manifest.editions[race.edition];
      assert.ok(preliminaryEditions.has(JSON.stringify([edition.city, edition.year])), `${file}: a preliminary link outside the manifest's preliminary editions`);
    }
    if (profile.preliminary) preliminaryProfiles++;
    assert.deepEqual([...names].sort(), [...profile.names].sort(), 'Profile aliases must be exactly the recorded names');
    for (const name of profile.names) for (const prefix of prefixes(name)) {
      const indexKey = bucket(prefix);
      addIndex(expectedIndex, indexKey, [name, profile.id, profile.races.length, firstYear, lastYear, latestCity, profile.preliminary ? 1 : 0]);
      expectedIndexCount++;
    }
    profileCount++;
  }
}
assert.equal(rawCount, manifest.raw_records);
assert.equal(eligibleCount, manifest.eligible_records);
assert.equal(runnerDetections, study.detected, 'Study detections must reproduce from the published runner timings');
assert.deepEqual([...runnerOnsets].sort((a, b) => a[0] - b[0]), onsetRows.map(row => [row.label, row.episodes]).sort((a, b) => a[0] - b[0]), 'Study onset counts must reproduce from the published runner timings');
assert.equal(namedCount, manifest.named_records);
assert.equal(rawCount - namedCount, manifest.unnamed_records);
assert.equal(profileCount, manifest.profiles);
assert.equal(preliminaryProfiles, manifest.preliminary_links.profiles, 'Preliminary profiles must equal the manifest count');
assert.equal(expectedIndexCount, manifest.index_rows);
assert.ok([...editionCounts].every(n => n > 0), 'Manifest includes an edition without any records');
recordIds.sort();
for (let i = 1; i < recordIds.length; i++) assert.ok(recordIds[i] > recordIds[i - 1], 'Duplicate source record ID across profiles');
console.log(`Verified ${profileCount.toLocaleString('en-US')} profiles and ${rawCount.toLocaleString('en-US')} distinct race records; checking every search alias.`);
let indexCount = 0;
for (const file of files.filter(file => file.startsWith('index/'))) {
  const data = shard(file), key = file.slice(6, 9);
  assert.ok(Array.isArray(data.rows) && data.rows.length, `${file}: empty index`);
  for (const row of data.rows) {
    assert.ok(Array.isArray(row) && row.length === 7 && (row[6] === 0 || row[6] === 1), `${file}: malformed search row`);
    const [name, id, count, first, last, city] = row;
    assert.ok(text(name) && normalize(name) && integer(id, 1) && integer(count, 1) && count <= manifest.raw_records);
    assert.ok(integer(first, 1) && integer(last, first) && text(city), 'Invalid index edition summary');
    assert.ok(prefixes(name).some(prefix => bucket(prefix) === key), 'Index shard must match at least one recorded alias token prefix');
    addIndex(actualIndex, key, row); indexCount++;
  }
}
assert.equal(indexCount, manifest.index_rows);
assert.deepEqual([...actualIndex.keys()].sort(), [...expectedIndex.keys()].sort(), 'Missing or unexpected name index bucket');
for (const [key, value] of expectedIndex) assert.deepEqual(actualIndex.get(key), value, `${key}: search aliases or race summaries differ from the profiles`);
for (const family of ['profiles', 'index']) {
  const actualFiles = fs.readdirSync(path.join(dataRoot, 'runners', family)).map(file => family + '/' + file).sort();
  assert.deepEqual(actualFiles, files.filter(file => file.startsWith(family + '/')), `${family}: unlisted stale or missing shard`);
}
console.log(`Verified ${files.length.toLocaleString('en-US')} gzip shard hashes/sizes and ${indexCount.toLocaleString('en-US')} complete search aliases for ${release.tag}.`);
