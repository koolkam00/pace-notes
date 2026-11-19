// Recompute from the marathon cohort's counted records (scripts/lib/cohort.cjs; the published runner records until
// November 19, 2026), independently of the Python builder.
// Every published cell is checked for counts and slowdown onset. Numeric
// summaries are recomputed for the entire unfiltered cohort and varied filters.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && ['--data-root', '--input'].includes(args[0]),
  'Usage: node scripts/verify-fast-start.cjs [--data-root public-data-directory | --input evidence-file]');
const dataRoot = args[0] === '--data-root' ? path.resolve(args[1]) : path.join(root, 'public/data');
const evidencePath = args[0] === '--input' ? path.resolve(args[1]) : path.join(dataRoot, 'fast-start/evidence.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = x => typeof x === 'number' && Number.isFinite(x);
const integer = (x, minimum = 0) => Number.isSafeInteger(x) && x >= minimum;
const near = (actual, expected, label) => assert.ok(finite(actual) && finite(expected)
  && Math.abs(actual - expected) <= 1.1e-6, `${label}: ${actual} != ${expected}`);
const bandIds = ['fast10', 'fast5', 'fast2', 'steady', 'slow2', 'slow5'];
const priorIds = ['all', 'under3', '3to330', '330to4', '4plus'];
const points = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const lengths = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
const ageIds = ['18–24', ...Array.from({ length: 13 }, (_, i) => `${25 + i * 5}–${29 + i * 5}`)];
const rowKey = row => JSON.stringify([row.city, row.age, row.gender, row.prior]);
const cellKey = (key, band) => key + '/' + band;
function openingBand(openingSeconds, priorSeconds) {
  // Compare decimal recorded times as rational integers. For example, an
  // exact -5% opening must not fall below -5 due to binary division roundoff.
  const rational = value => {
    const [whole, fraction = ''] = String(value).split('.');
    assert.match(whole, /^\d+$/);
    assert.match(fraction, /^\d*$/);
    return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
  };
  const [opening, openingScale] = rational(openingSeconds);
  const [prior, priorScale] = rational(priorSeconds);
  const left = opening * 4219500n * priorScale;
  const right = prior * 10000n * openingScale;
  return left < right * 90n ? 'fast10' : left < right * 95n ? 'fast5'
    : left < right * 98n ? 'fast2' : left <= right * 102n ? 'steady'
      : left <= right * 105n ? 'slow2' : 'slow5';
}
const priorBand = seconds => seconds < 10800 ? 'under3' : seconds < 12600 ? '3to330'
  : seconds < 14400 ? '330to4' : '4plus';
const ageBand = age => !Number.isInteger(age) || age < 18 || age >= 90 ? null
  : age < 25 ? '18–24' : `${Math.floor(age / 5) * 5}–${Math.floor(age / 5) * 5 + 4}`;
const gender = sex => ['m', 'male', 'man', 'men'].includes((sex || '').trim().toLowerCase()) ? 'Men'
  : ['f', 'female', 'woman', 'women'].includes((sex || '').trim().toLowerCase()) ? 'Women' : null;
const quantile = (sorted, fraction) => {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
function earlierBest(races, focus, editions) {
  const year = editions[focus.edition].year;
  let best = Infinity;
  for (const previous of races) {
    const previousYear = editions[previous.edition].year;
    if (previous.eligible && previousYear < year && previousYear >= year - 2) {
      best = Math.min(best, previous.times[8]);
    }
  }
  return best;
}
function slowdownOnset(times) {
  const baseline = (times[3] - times[0]) / 15;
  // Each of these complete sections is 5 km. The last 2.195 km alone is
  // insufficient, and a qualifying 35–40 km section already starts at 35 km.
  for (let section = 4; section < 8; section++) {
    if ((times[section] - times[section - 1]) / 5 / baseline - 1 + 1e-12 >= .25) {
      return section - 4;
    }
  }
  return null;
}

// Boundary cases are separate from the real-record reconciliation below.
assert.deepEqual([2699.999, 2700, 2850, 2940, 3060, 3060.001, 3150, 3150.001].map(seconds => openingBand(seconds, 12658.5)),
  ['fast10', 'fast5', 'fast2', 'steady', 'steady', 'slow2', 'slow2', 'slow5']);
assert.deepEqual([10799, 10800, 12600, 14400].map(priorBand), ['under3', '3to330', '330to4', '4plus']);
assert.deepEqual([null, 17, 18, 24, 25, 89, 90, 35.5].map(ageBand), [null, null, '18–24', '18–24', '25–29', '85–89', null, null]);
near(quantile([0, 10, 20, 30], .1), 3, 'Linear quantiles interpolate between observations');
const evenTimes = points.map(distance => distance * 300);
assert.equal(slowdownOnset(evenTimes), null);
assert.equal(slowdownOnset(evenTimes.map((time, i) => time + (i >= 8 ? 1000 : 0))), null, 'A final 2.195 km slowdown is not a qualifying episode');
assert.equal(slowdownOnset(evenTimes.map((time, i) => time + (i >= 7 ? 375 : 0))), 3, 'Exactly 25% slowing over 35–40 km starts at 35 km');
const years = [2017, 2018, 2019, 2020, 2021].map(year => ({ year }));
const past = (edition, finish, eligible = true) => ({ edition, eligible, times: Array(9).fill(finish) });
const current = past(3, 15000);
assert.equal(earlierBest([past(0, 6000), past(1, 12000), past(2, 11000), past(2, 7000, false), past(3, 8000), past(4, 6500), current], current, years), 11000,
  'Benchmarks exclude held races, same-year races, future races and races more than two years earlier');

const release = read(path.join(root, 'analysis/release.json'));
const cohort = require('./lib/cohort.cjs');
// The cohort manifest, checked against the pin and the checkout's scripts (its scripts are the cohort's builders).
const { manifest, sha256: cohortSha } = cohort.verifiedManifest(release);
const evidence = read(evidencePath);
assert.equal(manifest.release_tag, release.tag, 'The cohort must use the adopted release');
assert.equal(evidence.schema_version, 1);
assert.equal(evidence.release_tag, release.tag);
assert.equal(evidence.input_as_of, manifest.input_as_of);
assert.ok(Number.isFinite(Date.parse(evidence.as_of)), 'Calculation timestamp required');
assert.equal(evidence.runner_manifest_sha256, cohortSha, 'Exact cohort binding (the field keeps its name)');
assert.equal(evidence.cohort_manifest_sha256, cohortSha, 'Exact cohort binding');
assert.equal(evidence.runner_manifest_as_of, manifest.as_of);
assert.deepEqual(evidence.cohort, manifest.cohort);
assert.equal(evidence.history_n, manifest.linkage.recent_benchmark_finishes, 'Use the full independently screened recent-history cohort');
assert.equal(evidence.raw_records, manifest.raw_records);
assert.equal(evidence.eligible_records, manifest.eligible_records);
assert.equal(evidence.eligible_without_prior_n, manifest.eligible_records - evidence.history_n);
assert.equal(evidence.min_cell, 100);
assert.deepEqual(manifest.points_km, points);
assert.deepEqual(evidence.points_km, points);
assert.deepEqual(evidence.onset_starts_km, [20, 25, 30, 35]);
assert.deepEqual(evidence.source_scripts, manifest.scripts);
assert.deepEqual(evidence.ages, ['all', ...ageIds]);
assert.deepEqual(evidence.genders, ['all', 'Men', 'Women']);
assert.deepEqual(evidence.prior_bands, priorIds);
assert.deepEqual(evidence.bands.map(({ id, lower, upper, lower_inclusive, upper_inclusive }) =>
  [id, lower, upper, lower_inclusive, upper_inclusive]), [
  ['fast10', null, -10, false, false], ['fast5', -10, -5, true, false],
  ['fast2', -5, -2, true, false], ['steady', -2, 2, true, true],
  ['slow2', 2, 5, false, true], ['slow5', 5, null, false, false],
]);
assert.ok(evidence.bands.every(band => typeof band.label === 'string' && band.label.length));
assert.deepEqual(Object.keys(evidence.scripts), ['build_fast_start.py']);
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
  assert.ok(row.city === 'All courses' || cities.has(row.city), 'Unknown course filter');
  assert.ok(row.age === 'all' || ageIds.includes(row.age), 'Unknown age filter');
  assert.ok(['all', 'Men', 'Women'].includes(row.gender), 'Unknown gender filter');
  assert.ok(priorIds.includes(row.prior), 'Unknown earlier-time filter');
  const key = rowKey(row);
  assert.ok(!rows.has(key), `Repeated filter row: ${key}`);
  rows.set(key, row);
  assert.ok(Array.isArray(row.groups) && row.groups.length > 0);
  let lastBand = -1;
  for (const group of row.groups) {
    const bandIndex = bandIds.indexOf(group.band);
    assert.ok(bandIndex > lastBand, `${key}: repeated, unknown or unordered opening band`);
    lastBand = bandIndex;
    assert.ok(integer(group.n, evidence.min_cell) && group.n <= evidence.history_n, `${key}: cell count`);
    assert.ok(integer(group.editions, 1) && group.editions <= Math.min(group.n, manifest.editions.length), `${key}: edition count`);
    const fields = ['finish_delta_median_s', 'finish_delta_p10_s', 'finish_delta_p90_s', 'finish_delta_mean_s',
      'opening_delta_mean_s', 'remainder_delta_mean_s', 'late_change_median_pct'];
    for (const field of fields) assert.ok(finite(group[field]), `${key}: nonfinite ${field}`);
    assert.ok(group.finish_delta_p10_s <= group.finish_delta_median_s && group.finish_delta_median_s <= group.finish_delta_p90_s, `${key}: ordered finish quantiles`);
    assert.ok(group.finish_delta_p10_s >= -37800 && group.finish_delta_p90_s <= 37800, `${key}: possible finish differences`);
    near(group.opening_delta_mean_s + group.remainder_delta_mean_s, group.finish_delta_mean_s, `${key}: mean time decomposition`);
    assert.ok(integer(group.slowdown_n) && group.slowdown_n <= group.n, `${key}: slowdown count`);
    if (group.slowdown_n < evidence.min_cell) {
      assert.equal(group.onset, null, `${key}: insufficient slowdown episodes for an onset distribution`);
    } else {
      assert.ok(Array.isArray(group.onset) && group.onset.length === 4 && group.onset.every(n => integer(n)), `${key}: onset categories`);
      assert.equal(group.onset.reduce((sum, n) => sum + n, 0), group.slowdown_n, `${key}: onset denominator is detected finishes`);
    }
    assert.ok(Array.isArray(group.pace_pct) && group.pace_pct.length === 9 && group.pace_pct.every(x => finite(x) && x > -100), `${key}: nine measured pace sections`);
    assert.ok(group.late_change_median_pct > -100);
    published.set(cellKey(key, group.band), group);
  }
}
const allKey = rowKey({ city: 'All courses', age: 'all', gender: 'all', prior: 'all' });
assert.ok(rows.has(allKey), 'The unfiltered cohort is required');
assert.deepEqual(rows.get(allKey).groups.map(row => row.band), bandIds);
assert.equal(rows.get(allKey).groups.reduce((sum, row) => sum + row.n, 0), evidence.history_n);

// Choose additional rows deterministically, including missingness-sensitive
// age/gender slices, a course and prior-performance filters. All their published
// bands receive full median, quantile and section-profile recomputation.
const numericRows = new Set([allKey]);
const count = row => row.groups.reduce((sum, group) => sum + group.n, 0);
for (const accept of [
  row => row.city !== 'All courses' && row.age === 'all' && row.gender === 'all' && row.prior === 'all',
  row => row.city === 'All courses' && row.age !== 'all' && row.gender === 'all' && row.prior === 'all',
  row => row.city === 'All courses' && row.age === 'all' && row.gender === 'Women' && row.prior === 'all',
  row => row.city === 'All courses' && row.age === 'all' && row.gender === 'all' && row.prior === 'under3',
  row => row.city !== 'All courses' && row.age !== 'all' && row.gender !== 'all' && row.prior !== 'all',
]) {
  const candidates = evidence.rows.filter(accept).sort((a, b) => count(b) - count(a) || rowKey(a).localeCompare(rowKey(b)));
  if (candidates.length) numericRows.add(rowKey(candidates[0]));
}
const cells = new Map();
let eligibleCount = 0, historyCount = 0;
// Every counted record, grouped by runner (a record without a runner key is its own runner and has no history).
// `high` keeps the records whose link is of tier high_elite or high, for the high-links-only variant (decision D38).
const byRunner = new Map(), byHighRunner = new Map();
cohort.forEachEdition((edition, entry, index) => {
  if (entry.use !== 'counted') return;
  for (let k = 0; k < edition.ids.length; k++) {
    eligibleCount++;
    if (!edition.runner[k]) continue;
    const race = { id: edition.ids[k], edition: index, eligible: true, times: edition.times[k], age: edition.age[k], sex: edition.sex[k] };
    if (!byRunner.has(edition.runner[k])) byRunner.set(edition.runner[k], []);
    byRunner.get(edition.runner[k]).push(race);
    if (edition.link[k] === 'h') {
      if (!byHighRunner.has(edition.runner[k])) byHighRunner.set(edition.runner[k], []);
      byHighRunner.get(edition.runner[k]).push(race);
    }
  }
});
const highCells = new Map();
let highCount = 0;
for (const eligible of byHighRunner.values()) {
  for (const race of eligible) {
    const best = earlierBest(eligible, race, manifest.editions);
    if (!Number.isFinite(best)) continue;
    highCount++;
    const band = openingBand(race.times[1], best), times = race.times;
    const cell = highCells.get(band) || { n: 0, finish: [], editions: new Set(), slowdown: 0 };
    const finish = times[8] - best;
    cell.n++; cell.finish.push(finish); cell.editions.add(race.edition); if (slowdownOnset(times) !== null) cell.slowdown++;
    highCells.set(band, cell);
  }
}
byHighRunner.clear();
for (const eligible of byRunner.values()) {
  {
    for (const race of eligible) {
      const edition = manifest.editions[race.edition];
      assert.ok(edition && edition.use === 'counted', 'Only a counted edition contributes outcomes or benchmarks');
      assert.equal(race.times.length, 9);
      assert.ok(race.times.every(finite) && race.times[8] >= 5400 && race.times[8] <= 43200);
      for (let i = 0; i < 9; i++) {
        const pace = (race.times[i] - (i ? race.times[i - 1] : 0)) / lengths[i];
        assert.ok(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'Eligible source section timing bounds');
      }
      const best = earlierBest(eligible, race, manifest.editions);
      if (!Number.isFinite(best)) continue;
      historyCount++;
      const times = race.times, priorPace = best / 42.195;
      const band = openingBand(times[1], best);
      const age = ageBand(race.age), sex = gender(race.sex), prior = priorBand(best);
      const onset = slowdownOnset(times);
      let measures;
      for (const cityValue of ['All courses', edition.city]) {
        for (const ageValue of age ? ['all', age] : ['all']) {
          for (const genderValue of sex ? ['all', sex] : ['all']) {
            for (const priorValue of ['all', prior]) {
              const key = rowKey({ city: cityValue, age: ageValue, gender: genderValue, prior: priorValue });
              const id = cellKey(key, band);
              let cell = cells.get(id);
              if (!cell) {
                cell = { n: 0, editions: new Set(), onset: [0, 0, 0, 0], numeric: numericRows.has(key)
                  ? { finish: [], late: [], pace: Array.from({ length: 9 }, () => []), openingSum: 0, remainderSum: 0, finishSum: 0 } : null };
                cells.set(id, cell);
              }
              cell.n++;
              cell.editions.add(race.edition);
              if (onset !== null) cell.onset[onset]++;
              if (cell.numeric) {
                if (!measures) {
                  const finish = times[8] - best, opening = times[1] - best * 10 / 42.195;
                  measures = { finish, opening, remainder: finish - opening,
                    late: 100 * ((times[8] - times[5]) / 12.195 / ((times[3] - times[0]) / 15) - 1),
                    pace: times.map((time, i) => 100 * ((time - (i ? times[i - 1] : 0)) / lengths[i] / priorPace - 1)) };
                }
                const target = cell.numeric;
                target.finish.push(measures.finish);
                target.late.push(measures.late);
                target.finishSum += measures.finish;
                target.openingSum += measures.opening;
                target.remainderSum += measures.remainder;
                for (let i = 0; i < 9; i++) target.pace[i].push(measures.pace[i]);
              }
            }
          }
        }
      }
    }
  }
}
assert.equal(eligibleCount, manifest.eligible_records, 'Retain the full timing/source-quality cohort');
assert.equal(historyCount, evidence.history_n, 'Independent two-earlier-year benchmark count');
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
  if (actual.numeric) {
    numericChecked++;
    const n = actual.n, values = actual.numeric;
    values.finish.sort((a, b) => a - b);
    values.late.sort((a, b) => a - b);
    for (const [field, q] of [['finish_delta_p10_s', .1], ['finish_delta_median_s', .5], ['finish_delta_p90_s', .9]]) {
      near(group[field], quantile(values.finish, q), `${id}: ${field}`);
    }
    near(group.finish_delta_mean_s, values.finishSum / n, `${id}: mean finish difference`);
    near(group.opening_delta_mean_s, values.openingSum / n, `${id}: mean opening difference`);
    near(group.remainder_delta_mean_s, values.remainderSum / n, `${id}: mean remainder difference`);
    near(group.late_change_median_pct, quantile(values.late, .5), `${id}: median late change`);
    for (let i = 0; i < 9; i++) {
      values.pace[i].sort((a, b) => a - b);
      near(group.pace_pct[i], quantile(values.pace[i], .5), `${id}: section ${i} median`);
    }
  }
}
assert.equal(checked, published.size, 'No invented aggregate cells');
// The high-links-only variant of the reading a page prints (adoption decision D38): every band's count, edition count,
// slowdown count and median finish difference recounted over runners followed on high_elite and high links alone.
{
  const variant = evidence.high_links;
  assert.ok(variant && variant.history_n === highCount, 'The high-links-only history count is recounted');
  assert.equal(highCount, manifest.linkage.high_links.recent_benchmark_finishes, 'The cohort states the same high-links history count');
  assert.deepEqual([variant.row.city, variant.row.age, variant.row.gender, variant.row.prior], ['All courses', 'all', 'all', 'all']);
  const expected = bandIds.filter(band => (highCells.get(band)?.n ?? 0) >= evidence.min_cell);
  assert.deepEqual(variant.row.groups.map(group => group.band), expected, 'High-links bands at or above the floor');
  for (const group of variant.row.groups) {
    const cell = highCells.get(group.band);
    assert.equal(group.n, cell.n, `high links ${group.band}: count`);
    assert.equal(group.editions, cell.editions.size, `high links ${group.band}: editions`);
    assert.equal(group.slowdown_n, cell.slowdown, `high links ${group.band}: slowdown count`);
    cell.finish.sort((x, y) => x - y);
    near(group.finish_delta_median_s, quantile(cell.finish, .5), `high links ${group.band}: median finish difference`);
  }
}
console.log(`Verified fast-start evidence: ${historyCount.toLocaleString('en-US')} earlier-benchmarked finishes; ${highCount.toLocaleString('en-US')} on high links alone; ${checked.toLocaleString('en-US')} cells independently checked for counts and slowdown onset; ${numericChecked} full numeric groups across ${numericRows.size} filter combinations, including the entire cohort.`);
