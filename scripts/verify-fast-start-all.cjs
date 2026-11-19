// Independent reconciliation of the within-race fast-start calculation.
// All source records contribute to the coverage checks; every published cell
// receives independent counts/onsets. Numeric summaries are recalculated for
// every global band and representative exact filters, using bounded typed arrays.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && ['--data-root', '--input'].includes(args[0]),
  'Usage: node scripts/verify-fast-start-all.cjs [--data-root public-data-directory | --input evidence-file]');
const dataRoot = args[0] === '--data-root' ? path.resolve(args[1]) : path.join(root, 'public/data');
const evidencePath = args[0] === '--input' ? path.resolve(args[1]) : path.join(dataRoot, 'fast-start/all-finishers.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = x => typeof x === 'number' && Number.isFinite(x);
const integer = (x, minimum = 0) => Number.isSafeInteger(x) && x >= minimum;
const near = (actual, expected, label) => assert.ok(finite(actual) && finite(expected)
  && Math.abs(actual - expected) <= 1.1e-6, `${label}: ${actual} != ${expected}`);
const bandIds = ['fast10', 'fast5', 'fast2', 'steady', 'slow2', 'slow5'];
const points = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const lengths = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
const ageIds = ['18–24', ...Array.from({ length: 13 }, (_, i) => `${25 + i * 5}–${29 + i * 5}`)];
const rowKey = row => JSON.stringify([row.city, row.age, row.gender, row.prior]);
const cellKey = (key, band) => key + '/' + band;

function openingBand(first5, at20) {
  // 100 * (first5/5) / ((at20-first5)/15) = 300*first5/(at20-first5).
  // Classify the recorded decimal numbers exactly, including subtraction:
  // using the later finish or floating-point percentage cannot move a boundary.
  const rational = value => {
    const [whole, fraction = ''] = String(value).split('.');
    assert.match(whole, /^\d+$/);
    assert.match(fraction, /^\d*$/);
    return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
  };
  const [a, aScale] = rational(first5), [b, bScale] = rational(at20);
  const left = 300n * a * bScale, right = b * aScale - a * bScale;
  assert.ok(right > 0n);
  return left < right * 90n ? 'fast10' : left < right * 95n ? 'fast5'
    : left < right * 98n ? 'fast2' : left <= right * 102n ? 'steady'
      : left <= right * 105n ? 'slow2' : 'slow5';
}
const ageBand = age => !Number.isInteger(age) || age < 18 || age >= 90 ? null
  : age < 25 ? '18–24' : `${Math.floor(age / 5) * 5}–${Math.floor(age / 5) * 5 + 4}`;
const gender = sex => ['m', 'male', 'man', 'men'].includes((sex || '').trim().toLowerCase()) ? 'Men'
  : ['f', 'female', 'woman', 'women'].includes((sex || '').trim().toLowerCase()) ? 'Women' : null;
const quantile = (sorted, fraction) => {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
function slowdownOnset(times) {
  const baseline = (times[3] - times[0]) / 15;
  for (let section = 4; section < 8; section++) {
    if ((times[section] - times[section - 1]) / 5 / baseline - 1 + 1e-12 >= .25) return section - 4;
  }
  return null;
}
function measurements(times) {
  const baseline = (times[3] - times[0]) / 15;
  return {
    finish: times[8] - 42.195 * baseline,
    opening: times[0] - 5 * baseline,
    after20: times[8] - times[3] - 22.195 * baseline,
    actual: times[8],
    late: 100 * ((times[8] - times[5]) / 12.195 / baseline - 1),
    pace: times.map((time, i) => 100 * ((time - (i ? times[i - 1] : 0)) / lengths[i] / baseline - 1)),
  };
}

assert.deepEqual([1349.999, 1350, 1425, 1470, 1530, 1530.001, 1575, 1575.001]
  .map(first => openingBand(first, first + 4500)),
['fast10', 'fast5', 'fast2', 'steady', 'steady', 'slow2', 'slow2', 'slow5']);
// Decimal cumulative values must be subtracted as decimals before comparison.
assert.equal(openingBand(1425.095, 5925.395), 'fast2', 'Exactly 5% faster with fractional recorded times');
assert.deepEqual([null, 17, 18, 24, 25, 89, 90, 35.5].map(ageBand), [null, null, '18–24', '18–24', '25–29', '85–89', null, null]);
near(quantile([0, 10, 20, 30], .1), 3, 'Linear individual-level quantiles');
const evenTimes = points.map(distance => distance * 300);
const lateCollapse = evenTimes.map((time, i) => time + (i >= 6 ? (points[i] - 30) * 150 : 0));
assert.equal(openingBand(evenTimes[0], evenTimes[3]), 'steady');
assert.equal(openingBand(lateCollapse[0], lateCollapse[3]), 'steady', 'Late collapse cannot make an even opening fast');
assert.equal(slowdownOnset(lateCollapse), 2, 'Independent later slowdown outcome');
assert.equal(slowdownOnset(evenTimes), null);
assert.equal(slowdownOnset(evenTimes.map((time, i) => time + (i === 8 ? 1000 : 0))), null, 'Final 2.195 km alone cannot qualify');
assert.equal(slowdownOnset(evenTimes.map((time, i) => time + (i >= 7 ? 375 : 0))), 3, 'Exactly 25% slowing over 35–40 km qualifies');
const fastTimes = evenTimes.map(time => time - 200);
const changedFinish = fastTimes.map((time, i) => time + (i >= 4 ? 1000 : 0));
assert.equal(openingBand(fastTimes[0], fastTimes[3]), 'fast10');
assert.equal(openingBand(changedFinish[0], changedFinish[3]), 'fast10', 'Changing all later timings cannot change an opening group');
for (const times of [evenTimes, lateCollapse, fastTimes, changedFinish]) {
  const values = measurements(times);
  near(values.opening + values.after20, values.finish, 'Opening plus after-20 reference accounting');
}
near(measurements(lateCollapse).finish, 12.195 * 150, 'A slower later section increases the observed finish-reference difference');

const release = read(path.join(root, 'analysis/release.json'));
// The marathon cohort (scripts/lib/cohort.cjs, checked against the pin and the checkout's scripts) since November 19,
// 2026; the runner shards before.
const cohort = require('./lib/cohort.cjs');
const { manifest, sha256: cohortSha } = cohort.verifiedManifest(release);
const evidence = read(evidencePath);
assert.equal(manifest.release_tag, release.tag, 'Adopted cohort');
assert.equal(evidence.schema_version, 1);
assert.equal(evidence.mode, 'all-finishers');
assert.equal(evidence.release_tag, release.tag);
assert.equal(evidence.input_as_of, manifest.input_as_of);
assert.ok(Number.isFinite(Date.parse(evidence.as_of)), 'Calculation timestamp');
assert.equal(evidence.runner_manifest_sha256, cohortSha, 'Exact cohort binding (the field keeps its name)');
assert.equal(evidence.cohort_manifest_sha256, cohortSha, 'Exact cohort binding');
assert.equal(evidence.runner_manifest_as_of, manifest.as_of);
assert.deepEqual(evidence.cohort, manifest.cohort);
assert.equal(evidence.analysis_n, manifest.eligible_records, 'No previous-race requirement');
assert.equal(evidence.history_n, manifest.linkage.recent_benchmark_finishes, 'History coverage remains source metadata');
assert.equal(evidence.raw_records, manifest.raw_records);
assert.equal(evidence.eligible_records, manifest.eligible_records);
assert.equal(evidence.eligible_without_prior_n, manifest.eligible_records - evidence.history_n);
assert.equal(evidence.min_cell, 100);
assert.deepEqual(manifest.points_km, points);
assert.deepEqual(evidence.points_km, points);
assert.deepEqual(evidence.onset_starts_km, [20, 25, 30, 35]);
assert.deepEqual(evidence.reference, { opening_km: 5, baseline_start_km: 5, baseline_end_km: 20 });
assert.deepEqual(evidence.source_scripts, manifest.scripts);
assert.deepEqual(evidence.ages, ['all', ...ageIds]);
assert.deepEqual(evidence.genders, ['all', 'Men', 'Women']);
assert.deepEqual(evidence.prior_bands, ['all']);
assert.deepEqual(evidence.bands.map(({ id, lower, upper, lower_inclusive, upper_inclusive }) =>
  [id, lower, upper, lower_inclusive, upper_inclusive]), [
  ['fast10', null, -10, false, false], ['fast5', -10, -5, true, false],
  ['fast2', -5, -2, true, false], ['steady', -2, 2, true, true],
  ['slow2', 2, 5, false, true], ['slow5', 5, null, false, false],
]);
assert.ok(evidence.bands.every(band => typeof band.label === 'string' && band.label.length));
assert.deepEqual(Object.keys(evidence.scripts).sort(), ['build_fast_start.py', 'build_fast_start_all.py']);
for (const [file, sha] of Object.entries(evidence.scripts)) {
  assert.equal(sha, hash(fs.readFileSync(path.join(root, 'analysis', file))), `Stale calculation: ${file}`);
}
for (const key of ['input_asset_sha256', 'input_manifest_sha256', 'source_quality', 'linkage']) {
  assert.deepEqual(evidence[key], manifest[key], `Source contract: ${key}`);
}

const cities = new Set(manifest.editions.filter(row => row.use === 'counted').map(row => row.city));
assert.deepEqual(evidence.cities, ['All courses', ...[...cities].sort()]);
const rows = new Map(), published = new Map();
assert.ok(Array.isArray(evidence.rows) && evidence.rows.length > 0);
for (const row of evidence.rows) {
  assert.ok(row.city === 'All courses' || cities.has(row.city), 'Known course');
  assert.ok(row.age === 'all' || ageIds.includes(row.age), 'Known age');
  assert.ok(['all', 'Men', 'Women'].includes(row.gender), 'Known recorded gender');
  assert.equal(row.prior, 'all', 'The within-race view does not select by previous or current finish');
  const key = rowKey(row);
  assert.ok(!rows.has(key), `Repeated filter row: ${key}`);
  rows.set(key, row);
  assert.ok(Array.isArray(row.groups) && row.groups.length > 0);
  let lastBand = -1;
  for (const group of row.groups) {
    const bandIndex = bandIds.indexOf(group.band);
    assert.ok(bandIndex > lastBand, `${key}: repeated, unknown or unordered opening band`);
    lastBand = bandIndex;
    assert.ok(integer(group.n, evidence.min_cell) && group.n <= evidence.analysis_n, `${key}: cell count`);
    assert.ok(integer(group.editions, 1) && group.editions <= Math.min(group.n, manifest.editions.length), `${key}: edition count`);
    const fields = ['finish_delta_median_s', 'finish_delta_p10_s', 'finish_delta_p90_s', 'finish_delta_mean_s',
      'opening_delta_mean_s', 'remainder_delta_mean_s', 'late_change_median_pct', 'actual_finish_median_s',
      'after20_delta_p10_s', 'after20_delta_median_s', 'after20_delta_p90_s'];
    for (const field of fields) assert.ok(finite(group[field]), `${key}: finite ${field}`);
    for (const prefix of ['finish_delta', 'after20_delta']) {
      assert.ok(group[`${prefix}_p10_s`] <= group[`${prefix}_median_s`]
        && group[`${prefix}_median_s`] <= group[`${prefix}_p90_s`], `${key}: ordered ${prefix} quantiles`);
    }
    assert.ok(group.actual_finish_median_s >= 5400 && group.actual_finish_median_s <= 43200, `${key}: actual finish bounds`);
    // Baseline is itself 120–1200 sec/km, so references can exceed finish bounds.
    assert.ok(group.finish_delta_p10_s >= 5400 - 42.195 * 1200
      && group.finish_delta_p90_s <= 43200 - 42.195 * 120, `${key}: possible reference differences`);
    near(group.opening_delta_mean_s + group.remainder_delta_mean_s, group.finish_delta_mean_s, `${key}: mean reference accounting`);
    assert.ok(integer(group.slowdown_n) && group.slowdown_n <= group.n, `${key}: slowdown count`);
    if (group.slowdown_n < evidence.min_cell) assert.equal(group.onset, null, `${key}: sparse onset distribution`);
    else {
      assert.ok(Array.isArray(group.onset) && group.onset.length === 4 && group.onset.every(n => integer(n)), `${key}: onset categories`);
      assert.equal(group.onset.reduce((sum, n) => sum + n, 0), group.slowdown_n, `${key}: detected-finish onset denominator`);
    }
    assert.ok(Array.isArray(group.pace_pct) && group.pace_pct.length === 9 && group.pace_pct.every(x => finite(x) && x > -100), `${key}: nine measured sections`);
    assert.ok(group.late_change_median_pct > -100);
    published.set(cellKey(key, group.band), group);
  }
}
const allKey = rowKey({ city: 'All courses', age: 'all', gender: 'all', prior: 'all' });
assert.ok(rows.has(allKey), 'Unfiltered cohort');
assert.deepEqual(rows.get(allKey).groups.map(row => row.band), bandIds);
assert.equal(rows.get(allKey).groups.reduce((sum, row) => sum + row.n, 0), evidence.analysis_n);

// Every global observation gets full numeric verification. Three additional
// demographic/course slices are capped at 100k each, keeping total numeric
// storage below 400 MB rather than duplicating millions of JS-number arrays.
const numericRows = new Set([allKey]);
const count = row => row.groups.reduce((sum, group) => sum + group.n, 0);
for (const accept of [
  row => row.city !== 'All courses' && row.age === 'all' && row.gender === 'all',
  row => row.city === 'All courses' && row.age !== 'all' && row.gender === 'all',
  row => row.city !== 'All courses' && row.age !== 'all' && row.gender !== 'all',
]) {
  const candidates = evidence.rows.filter(row => accept(row) && count(row) <= 100000)
    .sort((a, b) => count(b) - count(a) || rowKey(a).localeCompare(rowKey(b)));
  assert.ok(candidates.length, 'Representative filtered numeric cohort');
  numericRows.add(rowKey(candidates[0]));
}
const numeric = new Map();
let storedObservations = 0;
for (const key of numericRows) for (const group of rows.get(key).groups) {
  storedObservations += group.n;
  const array = () => new Float64Array(group.n);
  numeric.set(cellKey(key, group.band), {
    capacity: group.n, used: 0, finish: array(), after20: array(), actual: array(), late: array(),
    pace: Array.from({ length: 9 }, array), openingSum: 0, remainderSum: 0, finishSum: 0,
  });
}
assert.ok(storedObservations <= evidence.analysis_n + 300000, 'Bounded independent numeric storage');
const cells = new Map();
let eligibleCount = 0;
const rawIds = new Float64Array(manifest.eligible_records);
cohort.forEachEdition((record, entry, index) => {
  if (entry.use !== 'counted') return;
  for (let k = 0; k < record.ids.length; k++) {
    const race = { id: record.ids[k], edition: index, times: record.times[k], age: record.age[k], sex: record.sex[k] };
    assert.ok(eligibleCount < rawIds.length && integer(race.id, 1), 'Valid record ID and declared count');
    rawIds[eligibleCount] = race.id;
    {
      eligibleCount++;
      const edition = manifest.editions[race.edition];
      assert.ok(edition && edition.use === 'counted', 'Only counted editions contribute');
      assert.equal(race.times.length, 9);
      assert.ok(race.times.every(finite) && race.times[8] >= 5400 && race.times[8] <= 43200);
      for (let i = 0; i < 9; i++) {
        const pace = (race.times[i] - (i ? race.times[i - 1] : 0)) / lengths[i];
        assert.ok(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'Eligible source section timing bounds');
      }
      const times = race.times, band = openingBand(times[0], times[3]);
      const age = ageBand(race.age), sex = gender(race.sex), onset = slowdownOnset(times);
      let measures;
      for (const cityValue of ['All courses', edition.city]) {
        for (const ageValue of age ? ['all', age] : ['all']) {
          for (const genderValue of sex ? ['all', sex] : ['all']) {
            const key = rowKey({ city: cityValue, age: ageValue, gender: genderValue, prior: 'all' });
            const id = cellKey(key, band);
            let cell = cells.get(id);
            if (!cell) {
              cell = { n: 0, editions: new Set(), onset: [0, 0, 0, 0] };
              cells.set(id, cell);
            }
            cell.n++;
            cell.editions.add(race.edition);
            if (onset !== null) cell.onset[onset]++;
            const target = numeric.get(id);
            if (target) {
              if (!measures) measures = measurements(times);
              const index = target.used++;
              assert.ok(index < target.capacity, `${id}: independent count exceeds published count`);
              target.finish[index] = measures.finish;
              target.after20[index] = measures.after20;
              target.actual[index] = measures.actual;
              target.late[index] = measures.late;
              target.finishSum += measures.finish;
              target.openingSum += measures.opening;
              target.remainderSum += measures.after20;
              for (let i = 0; i < 9; i++) target.pace[i][index] = measures.pace[i];
            }
          }
        }
      }
    }
  }
});
assert.equal(eligibleCount, manifest.eligible_records, 'Full timing/source-quality cohort');
assert.equal(eligibleCount, evidence.analysis_n, 'Previous results do not restrict the calculation');
for (const [label, ids] of [['record', rawIds]]) {
  ids.sort();
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `Unique ${label} IDs`);
}
let checked = 0, numericChecked = 0;
for (const [id, actual] of cells) {
  const group = published.get(id);
  if (actual.n < evidence.min_cell) {
    assert.equal(group, undefined, `${id}: below minimum cell size`);
    continue;
  }
  assert.ok(group, `${id}: supported cell is missing`);
  checked++;
  assert.equal(group.n, actual.n, `${id}: independent count`);
  assert.equal(group.editions, actual.editions.size, `${id}: independent edition count`);
  const detections = actual.onset.reduce((sum, n) => sum + n, 0);
  assert.equal(group.slowdown_n, detections, `${id}: independent slowdown count`);
  assert.deepEqual(group.onset, detections < evidence.min_cell ? null : actual.onset, `${id}: independent onset counts`);
  const values = numeric.get(id);
  if (values) {
    numericChecked++;
    assert.equal(values.used, actual.n, `${id}: numeric observation count`);
    values.finish.sort(); values.after20.sort(); values.actual.sort(); values.late.sort();
    for (const [prefix, observations] of [['finish_delta', values.finish], ['after20_delta', values.after20]]) {
      for (const [suffix, q] of [['p10_s', .1], ['median_s', .5], ['p90_s', .9]]) {
        near(group[`${prefix}_${suffix}`], quantile(observations, q), `${id}: ${prefix}_${suffix}`);
      }
    }
    near(group.actual_finish_median_s, quantile(values.actual, .5), `${id}: actual finish median`);
    near(group.finish_delta_mean_s, values.finishSum / actual.n, `${id}: mean finish-reference difference`);
    near(group.opening_delta_mean_s, values.openingSum / actual.n, `${id}: mean opening-reference difference`);
    near(group.remainder_delta_mean_s, values.remainderSum / actual.n, `${id}: mean after-20 reference difference`);
    near(group.late_change_median_pct, quantile(values.late, .5), `${id}: median late change`);
    for (let i = 0; i < 9; i++) {
      values.pace[i].sort();
      near(group.pace_pct[i], quantile(values.pace[i], .5), `${id}: section ${i} median`);
    }
  }
}
assert.equal(checked, published.size, 'No invented aggregate cells');
assert.equal(numericChecked, numeric.size, 'Every selected numeric group checked');
console.log(`Verified within-race fast starts: ${eligibleCount.toLocaleString('en-US')} eligible finishes without a history requirement; ${manifest.editions.filter(row => row.use === 'counted').length} cohort edition files; ${checked.toLocaleString('en-US')} cells independently checked for counts and slowdown onset; ${numericChecked} full numeric groups across ${numericRows.size} exact filters, including the entire cohort.`);
