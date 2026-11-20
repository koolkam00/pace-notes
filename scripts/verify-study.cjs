// The supporting study (analysis/build_study.py; adoption decision D26, 2026-11-14) and public/data/live.json, which
// analysis/import_study.py alone writes. Checks: the study's provenance against the marathon cohort manifest (read and
// checked by scripts/lib/cohort.cjs), the internal consistency of every chart (moved from verify-public-explorer.cjs,
// which checked it with the runner lookup until November 19, 2026), an independent recount from the cohort's counted
// records of the headline count, the detected sustained-slowdown finishes, the onset sections and every course rate,
// and the high-links-only history count (decision D38). Without --data-root it also checks live.json.
// Usage: node scripts/verify-study.cjs [--data-root directory]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cohort = require('./lib/cohort.cjs');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--data-root'), 'Usage: node scripts/verify-study.cjs [--data-root directory]');
const dataRoot = args.length ? path.resolve(args[1]) : path.join(root, 'public/data');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const text = value => typeof value === 'string' && value.length > 0;
const near = (actual, expected, message) => assert.ok(finite(actual) && Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
const release = read(path.join(root, 'analysis/release.json'));
const { manifest: base, sha256: baseSha } = cohort.verifiedManifest(release);
const study = read(path.join(dataRoot, 'study/evidence.json'));
const SCRIPTS = ['build_study.py', 'build_pacing.py', 'build_extended.py', 'source_quality.py', 'cohort.py'];

assert.equal(study.schema_version, 1);
assert.equal(study.release_tag, release.tag);
for (const stamp of ['input_as_of', 'as_of']) assert.ok(Number.isFinite(Date.parse(study[stamp])), `study ${stamp}`);
assert.equal(study.input_as_of, base.input_as_of, 'The study and the cohort are built on one input');
assert.equal(study.input_asset_sha256, base.input_asset_sha256);
assert.equal(study.input_manifest_sha256, base.input_manifest_sha256);
assert.equal(study.cohort_manifest_sha256, baseSha, 'The study names the checked-in cohort manifest');
assert.equal(study.cohort_manifest_as_of, base.as_of);
assert.deepEqual(study.cohort, base.cohort, 'The study reproduces the cohort counts');
assert.deepEqual(study.source_quality, base.source_quality, 'The study applies the cohort\'s edition policy');
assert.deepEqual(Object.keys(study.scripts).sort(), [...SCRIPTS].sort());
for (const script of SCRIPTS) assert.equal(study.scripts[script], hash(fs.readFileSync(path.join(root, 'analysis', script))), `stale ${script} output`);
assert.equal(study.linkage.canonical_id_contract_verified, true);
assert.equal(study.linkage.linked_eligible_finishes, base.linkage.counted_records_with_a_runner);
assert.equal(study.linkage.recent_benchmark_finishes, base.linkage.recent_benchmark_finishes);
assert.equal(study.high_links.linkage.linked_eligible_finishes, base.linkage.high_links.counted_records_with_a_runner);
assert.equal(study.high_links.linkage.recent_benchmark_finishes, base.linkage.high_links.recent_benchmark_finishes);
assert.equal(study.high_links.history.id, 'history');
const histories = [study.figures.find(row => row.id === 'history'), study.high_links.history];
for (const [figure, n] of [[histories[0], study.linkage.recent_benchmark_finishes], [histories[1], study.high_links.linkage.recent_benchmark_finishes]]) {
  const prior = figure.charts[0].rows;
  assert.ok(prior.reduce((sum, row) => sum + row.n_value, 0) <= n, 'An earlier-performance chart counts benchmarked finishes only');
  for (const row of [...prior, ...figure.charts[1].rows]) assert.ok(row.n_value >= 100 && finite(row.value) && row.value >= 0 && row.value <= 100);
}
if (!args.length) {
  const live = read(path.join(dataRoot, 'live.json'));
  assert.deepEqual(Object.keys(live).sort(), ['as_of', 'cohort_manifest_sha256', 'corpus', 'input_as_of', 'release_tag', 'schema_version', 'status', 'supporting_study']);
  assert.equal(live.schema_version, 2); assert.equal(live.status, 'ready');
  assert.equal(live.release_tag, study.release_tag);
  assert.equal(live.as_of, study.as_of); assert.equal(live.input_as_of, study.input_as_of);
  assert.equal(live.corpus.n_records, study.cohort.raw);
  assert.equal(live.corpus.eligible_finishes, study.n);
  assert.equal(live.supporting_study, 'study/evidence.json');
  assert.equal(live.cohort_manifest_sha256, baseSha);
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

// Independent recount from the cohort's counted records: sustained slowdown is at least 25% slower than the 5–20 km
// pace (with a 1e-12 ratio tolerance) over contiguous recorded sections after 20 km totalling at least 5 km.
const SECTION = [5, 5, 5, 5, 2.195];
let n = 0, detected = 0;
const onsets = new Map(), byCity = new Map();
cohort.forEachEdition((edition, entry) => {
  if (entry.use !== 'counted') return;
  const city = byCity.get(entry.city) || { n: 0, detected: 0 };
  for (const t of edition.times) {
    const reference = (t[3] - t[0]) / 15;
    const slow = [0, 1, 2, 3, 4].map(i => (t[i + 4] - t[i + 3]) / SECTION[i] / reference - 1 + 1e-12 >= 0.25);
    let onset = null;
    for (let start = 0; start < 5 && onset === null; start++) {
      let distance = 0;
      for (let end = start; end < 5 && slow[end]; end++) { distance += SECTION[end]; if (distance + 1e-9 >= 5) { onset = 20 + 5 * start; break; } }
    }
    n++; city.n++;
    if (onset !== null) { detected++; city.detected++; onsets.set(onset, (onsets.get(onset) || 0) + 1); }
  }
  byCity.set(entry.city, city);
});
assert.equal(n, study.n, 'Recounted eligible finishes');
assert.equal(detected, study.detected, 'Recounted sustained-slowdown finishes');
assert.deepEqual(onsetRows.map(row => [row.label, row.episodes]), [...onsets].sort((a, b) => a[0] - b[0]), 'Recounted onset sections');
const expectedCities = [...byCity].filter(([, c]) => c.n >= 100).sort((a, b) => (a[0] < b[0] ? -1 : 1));
assert.deepEqual(courseRows.map(row => [row.label, row.n_value, row.successes]), expectedCities.map(([city, c]) => [city, c.n, c.detected]), 'Recounted course rates');
console.log(`Verified the supporting study: ${study.n.toLocaleString('en-US')} eligible finishes and ${detected.toLocaleString('en-US')} with sustained slowdown recounted from the cohort (${base.release_tag}, manifest ${baseSha.slice(0, 12)}); onset sections and ${courseRows.length} course rates recounted; ${study.high_links.linkage.recent_benchmark_finishes.toLocaleString('en-US')} benchmarked finishes on high links alone${args.length ? '' : '; live.json matches'}.`);
