// Independent source-data verification. This does not import the calculation
// code or trust published rates, edition membership or cohort counts.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const zlib = require('node:zlib'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && ['--input', '--data-root'].includes(args[0]),
  'Usage: node scripts/verify-all-finisher-context.cjs [--input evidence-file | --data-root public-data-directory]');
const dataRoot = args[0] === '--data-root' ? path.resolve(args[1]) : path.join(root, 'public/data');
const evidencePath = args[0] === '--input' ? path.resolve(args[1]) : path.join(dataRoot, 'all-finisher-context/evidence.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const near = (actual, expected, message) => assert.ok(finite(actual) && finite(expected)
  && Math.abs(actual - expected) < 1.1e-6, `${message}: ${actual} != ${expected}`);
const sum = values => values.reduce((a, b) => a + b, 0);
const mean = values => sum(values) / values.length;
const quantile = (sorted, fraction) => {
  const position = (sorted.length - 1) * fraction, lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const percentile = (values, fraction) => quantile([...values].sort((a, b) => a - b), fraction);
const points = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const lengths = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
const ages = ['all', '18–24', ...Array.from({ length: 13 }, (_, i) => `${25 + 5 * i}–${29 + 5 * i}`)];
const genders = ['all', 'Men', 'Women'];
const earlyIds = ['all', 'under270', '270to330', '330to390', '390plus'];
const temperatureIds = ['under5', '5to10', '10to15', '15to20', '20plus'];
const openings = ['fast10', 'fast5', 'fast2', 'steady', 'slow2', 'slow5'];
const ageBand = age => !Number.isInteger(age) || age < 18 || age >= 90 ? 'all'
  : age < 25 ? '18–24' : `${Math.floor(age / 5) * 5}–${Math.floor(age / 5) * 5 + 4}`;
const gender = value => ['m', 'male', 'man', 'men'].includes((value || '').trim().toLowerCase()) ? 'Men'
  : ['f', 'female', 'woman', 'women'].includes((value || '').trim().toLowerCase()) ? 'Women' : 'all';
// Decimal elapsed-time differences are classified using exact integer
// cross-products, independently of NumPy's floating point ratios.
function decimal(value) {
  const [whole, fraction = ''] = String(value).split('.');
  assert.match(whole, /^\d+$/); assert.match(fraction, /^\d*$/);
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
}
function classifications(times) {
  const [first, firstScale] = decimal(times[0]), [at20, at20Scale] = decimal(times[3]);
  const duration = at20 * firstScale - first * at20Scale, scale = firstScale * at20Scale;
  const firstRatio = first * at20Scale * 300n;
  const opening = firstRatio < 90n * duration ? 0 : firstRatio < 95n * duration ? 1
    : firstRatio < 98n * duration ? 2 : firstRatio <= 102n * duration ? 3
      : firstRatio <= 105n * duration ? 4 : 5;
  const early = duration < 4050n * scale ? 1 : duration < 4950n * scale ? 2
    : duration < 5850n * scale ? 3 : 4;
  return { opening, early: earlyIds[early] };
}
const temperature = value => value === null || !finite(value) ? null
  : value < 5 ? 'under5' : value < 10 ? '5to10' : value < 15 ? '10to15' : value < 20 ? '15to20' : '20plus';
const terrain = value => value === null ? null : value < -25 ? 'downhill' : 'other';
function measurements(times) {
  const reference = (times[3] - times[0]) / 15;
  let onset = -1;
  for (let i = 4; i < 8; i++) {
    if ((times[i] - times[i - 1]) / 5 / reference - 1 + 1e-12 >= .25) { onset = i - 4; break; }
  }
  return { onset, values: [times[8], 100 * ((times[8] - times[5]) / (12.195 * reference) - 1),
    times[8] - times[3] - 22.195 * reference,
    ...times.map((value, i) => 100 * ((value - (i ? times[i - 1] : 0)) / (lengths[i] * reference) - 1))] };
}
function filters(race) {
  const age = ageBand(race.age), sex = gender(race.sex), classification = classifications(race.times);
  const values = [];
  for (const a of age === 'all' ? ['all'] : ['all', age])
    for (const g of sex === 'all' ? ['all'] : ['all', sex])
      for (const e of ['all', classification.early]) values.push([a, g, e]);
  return { values, opening: classification.opening };
}
const baseKey = (edition, age, sex, early) => JSON.stringify([edition, age, sex, early]);
const rowKey = (city, age, sex, early) => JSON.stringify([city, age, sex, early]);
const groupKey = (row, category, id) => JSON.stringify([row, category, id]);
const numericKey = (base, opening = -1) => JSON.stringify([base, opening]);

// Boundary, missing-data and denominator counterexamples protect the contract.
assert.deepEqual([null, 17, 18, 24, 25, 89, 90, 32.5].map(ageBand), ['all', 'all', '18–24', '18–24', '25–29', '85–89', 'all', 'all']);
assert.deepEqual([null, 'unknown', 'M', 'Female'].map(gender), ['all', 'all', 'Men', 'Women']);
assert.deepEqual([null, -1, 4.999, 5, 10, 15, 20].map(temperature), [null, 'under5', 'under5', '5to10', '10to15', '15to20', '20plus']);
assert.deepEqual([null, -25.001, -25, 0].map(terrain), [null, 'downhill', 'other', 'other']);
for (const [pace, expected] of [[269.999, 'under270'], [270, '270to330'], [330, '330to390'], [390, '390plus']]) {
  const times = [1500, 3000, 4500, 1500 + pace * 15];
  assert.equal(classifications(times).early, expected);
}
assert.deepEqual([1349.999, 1350, 1425, 1470, 1530, 1530.001, 1575, 1575.001]
  .map(first => openings[classifications([first, 3000, 4500, first + 4500]).opening]),
['fast10', 'fast5', 'fast2', 'steady', 'steady', 'slow2', 'slow2', 'slow5']);
const even = points.map(km => km * 300);
assert.equal(measurements(even).onset, -1);
assert.equal(measurements(even.map((t, i) => t + (i === 8 ? 2000 : 0))).onset, -1, 'Last short section cannot qualify alone');
assert.equal(measurements(even.map((t, i) => t + (i >= 7 ? 375 : 0))).onset, 3, 'Exact 25% threshold qualifies');
assert.equal(mean([0, 100]), 50, 'Equal edition weighting differs from pooling fields of different sizes');
near(percentile([0, 10, 20, 30], .1), 3, 'Linear quantiles');

const pin = read(path.join(root, 'analysis/release.json'));
const runnersPath = path.join(dataRoot, 'runners/manifest.json'), contextPath = path.join(dataRoot, 'runner-context/manifest.json');
const runners = read(runnersPath), context = read(contextPath), evidence = read(evidencePath);
assert.equal(evidence.schema_version, 1); assert.equal(evidence.mode, 'all-finishers');
assert.equal(runners.release_tag, pin.tag); assert.equal(context.release_tag, pin.tag); assert.equal(evidence.release_tag, pin.tag);
assert.equal(evidence.runner_manifest_sha256, hash(fs.readFileSync(runnersPath)));
assert.equal(evidence.context_manifest_sha256, hash(fs.readFileSync(contextPath)));
assert.equal(context.runner_manifest_sha256, evidence.runner_manifest_sha256);
assert.equal(evidence.runner_manifest_as_of, runners.as_of); assert.equal(context.runner_manifest_as_of, runners.as_of);
assert.equal(evidence.context_manifest_as_of, context.as_of); assert.ok(Number.isFinite(Date.parse(evidence.as_of)));
for (const field of ['input_as_of', 'input_asset_sha256', 'input_manifest_sha256', 'cohort', 'source_quality']) {
  assert.deepEqual(evidence[field], runners[field], `Runner provenance: ${field}`);
  assert.deepEqual(context[field], runners[field], `Context provenance: ${field}`);
}
assert.equal(evidence.raw_records, runners.raw_records); assert.equal(evidence.eligible_records, runners.eligible_records);
assert.equal(evidence.analysis_n, runners.eligible_records, 'Previous finishes cannot restrict the default');
assert.equal(evidence.min_cell, 100); assert.equal(evidence.min_edition, 20); assert.equal(evidence.min_editions, 3); assert.equal(evidence.min_race_day_cell, 100);
assert.deepEqual(evidence.points_km, points); assert.deepEqual(evidence.onset_starts_km, [20, 25, 30, 35]); assert.equal(evidence.downhill_first5_net_below_m, -25);
assert.deepEqual(Object.keys(evidence.scripts).sort(), ['build_all_finisher_context.py', 'build_fast_start.py', 'build_fast_start_all.py']);
assert.deepEqual(evidence.source_scripts, runners.scripts); assert.deepEqual(evidence.context_source_scripts, context.scripts);
for (const [name, digest] of Object.entries({ ...runners.scripts, ...context.scripts, ...evidence.scripts })) {
  assert.match(name, /^[a-z_]+\.py$/);
  assert.equal(digest, hash(fs.readFileSync(path.join(root, 'analysis', name))), `Stale source/calculation script: ${name}`);
}
assert.deepEqual(runners.points_km, points); assert.deepEqual(evidence.ages, ages); assert.deepEqual(evidence.genders, genders);
assert.deepEqual(evidence.early_pace_bands.map(x => [x.id, x.lower_s_per_km, x.upper_s_per_km]), [['all', null, null], ['under270', null, 270], ['270to330', 270, 330], ['330to390', 330, 390], ['390plus', 390, null]]);
assert.deepEqual(evidence.temperature_bands.map(x => [x.id, x.lower_c, x.upper_c]), [['under5', null, 5], ['5to10', 5, 10], ['10to15', 10, 15], ['15to20', 15, 20], ['20plus', 20, null]]);
assert.deepEqual(evidence.opening_bands.map(x => x.id), openings);
const cities = ['All courses', ...[...new Set(runners.editions.map(x => x.city))].sort()];
assert.deepEqual(evidence.cities, cities);
const environments = [], coverage = { weather_n: 0, weather_editions: 0, terrain_n: 0, terrain_editions: 0, eligible_editions: 0 };
assert.equal(Object.keys(context.editions).length, runners.editions.length);
for (let index = 0; index < runners.editions.length; index++) {
  const meta = context.editions[index]; assert.match(meta.file, /^editions\/\d{3}\.json\.gz$/);
  const bytes = fs.readFileSync(path.join(dataRoot, 'runner-context', meta.file));
  assert.equal(bytes.length, meta.bytes); assert.equal(hash(bytes), meta.sha256);
  const edition = JSON.parse(zlib.gunzipSync(bytes));
  assert.equal(edition.release_tag, pin.tag);
  assert.deepEqual(edition.edition, { index, ...runners.editions[index] });
  let start = null, net = null;
  if (edition.weather) {
    const weather = edition.weather;
    assert.ok(finite(weather.temp_c)); assert.equal(weather.personal_exposure, false);
    near(weather.temp_c, weather.hours[0].temp_c, 'Source scheduled-start temperature');
    start = temperature(weather.temp_c);
  } else assert.equal(typeof edition.weather_reason, 'string');
  if (edition.terrain) {
    const terrainData = edition.terrain;
    assert.equal(terrainData.historical_validity_known, false);
    assert.ok(terrainData.valid_from_year === null || terrainData.valid_from_year <= edition.edition.year, 'Route validity starts after this edition');
    assert.ok(terrainData.valid_to_year === null || terrainData.valid_to_year >= edition.edition.year, 'Route validity ended before this edition');
    assert.equal(terrainData.sections[0].start_km, 0); assert.equal(terrainData.sections[0].end_km, 5);
    assert.ok(finite(terrainData.sections[0].net_m)); net = terrainData.sections[0].net_m;
  } else assert.equal(typeof edition.terrain_reason, 'string');
  environments.push({ city: edition.edition.city, weather: start, terrain: terrain(net), temp_c: edition.weather?.temp_c ?? null, opening_net_m: net, eligible: edition.eligible_n });
  if (edition.eligible_n) {
    coverage.eligible_editions++;
    if (start !== null) { coverage.weather_n += edition.eligible_n; coverage.weather_editions++; }
    if (net !== null) { coverage.terrain_n += edition.eligible_n; coverage.terrain_editions++; }
  }
}
assert.deepEqual(evidence.coverage, coverage, 'Context availability before publication thresholds');

const rows = new Map(), published = new Map();
for (const row of evidence.rows) {
  assert.ok(cities.includes(row.city) && ages.includes(row.age) && genders.includes(row.gender) && earlyIds.includes(row.early_pace));
  const key = rowKey(row.city, row.age, row.gender, row.early_pace);
  assert.ok(['courses', 'weather', 'downhill', 'editions'].some(category => row[category]?.length), 'Empty rows are omitted');
  assert.ok(!rows.has(key)); rows.set(key, row);
  for (const category of ['courses', 'weather', 'downhill', 'editions']) {
    assert.ok(Array.isArray(row[category]));
    for (const group of row[category]) {
      const key2 = groupKey(key, category, group.id);
      assert.ok(!published.has(key2)); published.set(key2, { group, row, category, key: key2 });
      assert.ok(Number.isSafeInteger(group.n) && group.n >= 100);
      assert.ok(Number.isSafeInteger(group.edition_n) && group.edition_n >= (category === 'editions' ? 1 : 3));
      if (category === 'editions') { assert.equal(group.edition_n, 1); assert.equal(group.id, `edition:${group.edition_index}`); assert.equal(group.edition_indices[0], group.edition_index); }
      assert.equal(group.edition_indices.length, group.edition_n);
      assert.deepEqual([...group.edition_indices].sort((a, b) => a - b), group.edition_indices);
      assert.equal(new Set(group.edition_indices).size, group.edition_n);
      assert.ok(Number.isSafeInteger(group.detected_n) && group.detected_n >= 0 && group.detected_n <= group.n);
      assert.ok(finite(group.slowdown_pct) && group.slowdown_pct >= 0 && group.slowdown_pct <= 100);
      for (const field of ['late_pct', 'after20_delta_s', 'actual_finish_median_s', 'late_spread_pct']) assert.ok(finite(group[field]));
      for (const field of ['slowdown_spread_pct', 'late_edition_spread_pct']) assert.ok(Array.isArray(group[field]) && group[field].length === 2 && group[field].every(finite) && group[field][0] <= group[field][1]);
      assert.ok(Array.isArray(group.profile_pct) && group.profile_pct.length === 9 && group.profile_pct.every(finite));
      assert.ok(group.late_spread_pct >= 0 && group.actual_finish_median_s >= 5400 && group.actual_finish_median_s <= 43200);
      if (group.detected_n < 100) { assert.equal(group.onset_n, null); assert.equal(group.onset_pct, null); }
      else { assert.equal(group.onset_n.length, 4); assert.equal(group.onset_pct.length, 4); assert.equal(sum(group.onset_n), group.detected_n); }
      if (category === 'courses') assert.ok(cities.includes(group.id) && group.id !== 'All courses');
      if (category === 'weather') {
        assert.ok(temperatureIds.includes(group.id));
        const band = evidence.temperature_bands.find(x => x.id === group.id); assert.equal(group.lower_c, band.lower_c); assert.equal(group.upper_c, band.upper_c);
      }
      if (category === 'editions') {
        const source = environments[group.edition_index]; assert.ok(source);
        assert.equal(group.temp_c, source.temp_c); assert.equal(group.opening_net_m, source.opening_net_m); assert.equal(group.historical_route_verified, false);
      }
      if (category === 'downhill') assert.equal(group.id, `${group.terrain}:${group.opening}`);
    }
  }
}
const sourceFiles = Object.keys(runners.shards).sort(), baseCells = new Map();
const excluded = new Set(runners.source_quality.editions.map(x => JSON.stringify([x.city, x.year])));
const recordIds = new Float64Array(runners.raw_records), profileIds = new Float64Array(runners.profiles);
let records = 0, profiles = 0, eligible = 0;
function scan(visitor, verify = false) {
  for (const file of sourceFiles) {
    assert.match(file, /^(profiles|index)\/[a-f0-9]{3}\.json\.gz$/);
    if (!verify && !file.startsWith('profiles/')) continue;
    const bytes = fs.readFileSync(path.join(dataRoot, 'runners', file));
    if (verify) { assert.equal(bytes.length, runners.shards[file].bytes); assert.equal(hash(bytes), runners.shards[file].sha256); }
    if (!file.startsWith('profiles/')) continue;
    const shard = JSON.parse(zlib.gunzipSync(bytes)); assert.equal(shard.release_tag, pin.tag);
    for (const profile of shard.profiles) {
      if (verify) { assert.ok(Number.isSafeInteger(profile.id) && profile.id > 0 && profiles < profileIds.length); profileIds[profiles++] = profile.id; }
      for (const race of profile.races) {
        if (verify) {
          assert.ok(Number.isSafeInteger(race.id) && race.id > 0 && records < recordIds.length); recordIds[records++] = race.id;
          assert.equal(typeof race.eligible, 'boolean');
          assert.ok(Number.isSafeInteger(race.edition) && race.edition >= 0 && race.edition < environments.length);
        }
        if (!race.eligible) continue;
        if (verify) {
          eligible++; const edition = runners.editions[race.edition];
          assert.ok(!excluded.has(JSON.stringify([edition.city, edition.year])));
          assert.equal(race.times.length, 9); assert.ok(race.times.every(finite));
          assert.ok(race.times[8] >= 5400 && race.times[8] <= 43200);
          for (let i = 0; i < 9; i++) {
            const pace = (race.times[i] - (i ? race.times[i - 1] : 0)) / lengths[i];
            assert.ok(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8);
          }
        }
        visitor(race);
      }
    }
  }
}
scan(race => {
  const { values, opening } = filters(race), onset = measurements(race.times).onset;
  for (const [age, sex, early] of values) {
    const key = baseKey(race.edition, age, sex, early);
    let cell = baseCells.get(key);
    if (!cell) {
      cell = { key, edition: race.edition, age, sex, early, parts: Array.from({ length: 7 }, () => ({ n: 0, onset: [0, 0, 0, 0] })) };
      baseCells.set(key, cell);
    }
    for (const part of [cell.parts[0], cell.parts[opening + 1]]) { part.n++; if (onset >= 0) part.onset[onset]++; }
  }
}, true);
assert.equal(records, runners.raw_records); assert.equal(profiles, runners.profiles); assert.equal(eligible, runners.eligible_records);
for (const [label, ids] of [['record', recordIds], ['profile', profileIds]]) {
  ids.sort(); for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `Unique ${label} ID`);
}
for (let i = 0; i < environments.length; i++) assert.equal(baseCells.get(baseKey(i, 'all', 'all', 'all'))?.parts[0].n || 0, environments[i].eligible, 'Every eligible source edition reconciles');
const expected = new Map();
function add(row, category, id, cell, opening = -1) {
  const part = cell.parts[opening + 1]; if (part.n < 20) return;
  const key = groupKey(row, category, id);
  let group = expected.get(key); if (!group) { group = []; expected.set(key, group); }
  group.push({ edition: cell.edition, base: cell.key, opening, n: part.n, onset: part.onset });
}
for (const cell of baseCells.values()) {
  const env = environments[cell.edition];
  for (const city of ['All courses', env.city]) {
    const row = rowKey(city, cell.age, cell.sex, cell.early);
    add(row, 'courses', env.city, cell);
    add(row, 'editions', `edition:${cell.edition}`, cell);
    if (env.weather !== null) add(row, 'weather', env.weather, cell);
    if (env.terrain !== null) for (let opening = 0; opening < 6; opening++) add(row, 'downhill', `${env.terrain}:${openings[opening]}`, cell, opening);
  }
}
let groupsChecked = 0, sparse = 0;
for (const [key, entries] of expected) {
  const category = JSON.parse(key)[1];
  const count = sum(entries.map(x => x.n)), valid = count >= 100 && entries.length >= (category === 'editions' ? 1 : 3);
  if (!valid) { assert.equal(published.get(key), undefined, `${key}: unsupported group must be absent`); sparse++; continue; }
  const actual = published.get(key); assert.ok(actual, `${key}: supported exact group is missing`); groupsChecked++;
  actual.entries = entries; const group = actual.group;
  assert.equal(group.n, count); assert.equal(group.edition_n, entries.length);
  assert.deepEqual(group.edition_indices, entries.map(x => x.edition).sort((a, b) => a - b));
  assert.equal(group.city_n, new Set(entries.map(x => environments[x.edition].city)).size);
  const counts = [0, 1, 2, 3].map(i => sum(entries.map(x => x.onset[i]))), detected = sum(counts);
  assert.equal(group.detected_n, detected);
  assert.deepEqual(group.onset_n, detected >= 100 ? counts : null);
  if (detected >= 100) for (let i = 0; i < 4; i++) near(group.onset_pct[i], 100 * counts[i] / detected, `${key}: pooled detected-finish onset share`);
  const rates = entries.map(x => 100 * sum(x.onset) / x.n);
  near(group.slowdown_pct, mean(rates), `${key}: equal edition-weighted slowdown percentage`);
  for (let i = 0; i < 2; i++) near(group.slowdown_spread_pct[i], percentile(rates, i ? .9 : .1), `${key}: edition rate spread`);
}
assert.equal(groupsChecked, published.size, 'No invented or duplicate published groups');
console.log(`Counts: ${records} raw records; ${eligible} eligible finishes; ${groupsChecked} supported groups; ${sparse} omitted sparse groups; every edition rate and onset recounted.`);

// Check every unfiltered course and temperature group's full numeric metrics.
// They share edition summaries, so storage stays around one complete cohort.
// Add bounded downhill and demographic/early-pace groups to cover stratification.
const global = rowKey('All courses', 'all', 'all', 'all'), samples = new Map();
for (const [key, item] of published) if (rowKey(item.row.city, item.row.age, item.row.gender, item.row.early_pace) === global && item.category !== 'downhill') samples.set(key, item);
for (const accept of [
  x => x.category === 'downhill' && x.group.terrain === 'downhill' && x.row.city === 'All courses' && x.row.age === 'all' && x.row.gender === 'all' && x.row.early_pace === 'all',
  x => x.category === 'weather' && x.row.age !== 'all' && x.row.gender === 'all' && x.row.early_pace === 'all',
  x => x.category === 'courses' && x.row.gender !== 'all' && x.row.early_pace !== 'all',
  x => x.category === 'downhill' && x.group.terrain === 'other' && x.row.city !== 'All courses' && x.row.age !== 'all' && x.row.gender !== 'all',
]) {
  const candidates = [...published.values()].filter(x => accept(x) && x.group.n <= 100000).sort((a, b) => b.group.n - a.group.n || a.key.localeCompare(b.key));
  assert.ok(candidates.length, 'Representative bounded exact numeric sample'); samples.set(candidates[0].key, candidates[0]);
}
const numeric = new Map();
for (const item of samples.values()) for (const entry of item.entries) {
  const key = numericKey(entry.base, entry.opening);
  if (!numeric.has(key)) numeric.set(key, { ...entry, used: 0, values: Array.from({ length: 12 }, () => new Float64Array(entry.n)) });
}
assert.ok(sum([...numeric.values()].map(x => x.n)) <= eligible + 400000, 'Bounded independent numeric memory');
scan(race => {
  const { values, opening } = filters(race); let metrics;
  for (const [age, sex, early] of values) {
    const base = baseKey(race.edition, age, sex, early);
    for (const part of [-1, opening]) {
      const target = numeric.get(numericKey(base, part)); if (!target) continue;
      if (!metrics) metrics = measurements(race.times).values;
      const index = target.used++; assert.ok(index < target.n);
      for (let i = 0; i < 12; i++) target.values[i][index] = metrics[i];
    }
  }
});
for (const target of numeric.values()) { assert.equal(target.used, target.n); for (const values of target.values) values.sort(); }
for (const [key, item] of samples) {
  const stats = item.entries.map(entry => numeric.get(numericKey(entry.base, entry.opening)));
  const actual = item.group;
  near(actual.late_pct, mean(stats.map(x => quantile(x.values[1], .5))), `${key}: average edition median late slowing`);
  near(actual.after20_delta_s, mean(stats.map(x => quantile(x.values[2], .5))), `${key}: average edition median after-20 difference`);
  near(actual.late_spread_pct, mean(stats.map(x => quantile(x.values[1], .9) - quantile(x.values[1], .1))), `${key}: mean within-edition late spread`);
  for (let i = 0; i < 9; i++) near(actual.profile_pct[i], mean(stats.map(x => quantile(x.values[3 + i], .5))), `${key}: average edition median profile section ${i}`);
  for (let i = 0; i < 2; i++) near(actual.late_edition_spread_pct[i], percentile(stats.map(x => quantile(x.values[1], .5)), i ? .9 : .1), `${key}: edition median spread`);
  const finishes = new Float64Array(actual.n); let offset = 0;
  for (const stat of stats) { finishes.set(stat.values[0], offset); offset += stat.n; }
  assert.equal(offset, actual.n); finishes.sort(); near(actual.actual_finish_median_s, quantile(finishes, .5), `${key}: pooled individual actual finish median`);
}
console.log(`Verified all-finisher context: ${sourceFiles.length} runner shards and ${environments.length} exact context shards; ${groupsChecked} independently recounted groups and all edition-weighted rates/onsets; ${samples.size} full numeric groups across ${numeric.size} edition cells, including all unfiltered courses and temperature bands.`);
