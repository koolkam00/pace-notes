// The marathon cohort, recounted from its checked-in files (analysis/marathon-cohort; the Python twin, which also checks it
// against the record status and identity files outside the repository, is analysis/verify_cohort.py).
//   - Every file the manifest lists is present with its size and SHA-256, and no other file is.
//   - Every edition decodes with the shared reader, and the digest of its decoded values is the manifest's, which the
//     Python reader computed: the two readers give the same numbers.
//   - Record ids are unique over the whole cohort; every timing-eligible record meets the timing contract (nine
//     increasing times, a finish from 1:30 to 12:00, every section from 2:00 to 20:00 per km) and no other record with
//     nine times does, unless it is a duplicate of one.
//   - A runner has at most one record per edition and at most one of the sexes M and F.
//   - Every count in the manifest is the files': the counted records are the eligible cohort, the raw records close on
//     the cohort's raw count with the editions that have no file, and the linkage counts are recounted.
// Usage: node scripts/verify-cohort.cjs [--root <cohort folder>]
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cohort = require('./lib/cohort.cjs');

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--root'), 'Usage: node scripts/verify-cohort.cjs [--root <cohort folder>]');
const root = args.length ? path.resolve(args[1]) : cohort.ROOT;
const started = Date.now();
const LENGTHS = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];

/** The timing contract of analysis/build_pacing.py prepare(), restated. */
function timingOk(t) {
  if (!(t[0] > 0 && t[8] >= 5400 && t[8] <= 43200)) return false;
  for (let i = 0; i < 9; i++) {
    const previous = i ? t[i - 1] : 0;
    if (i && !(t[i] > previous)) return false;
    const pace = (t[i] - previous) / LENGTHS[i];
    if (!(pace >= 120 && pace <= 1200)) return false;
  }
  return true;
}

const { manifest, sha256: manifestSha } = cohort.readManifest(root);
const listed = manifest.editions.map((e) => e.file);
assert.equal(new Set(listed).size, listed.length, 'a file listed twice');
const present = fs.readdirSync(path.join(root, 'editions')).map((name) => `editions/${name}`).sort();
assert.deepEqual(present, [...listed].sort(), 'The files on disk are exactly the files the manifest lists');
const order = manifest.editions.map((e) => [e.city, e.year]);
assert.deepEqual(order, [...order].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])), 'Editions are in order of city, then year');

const seen = new Set();
const runners = new Map();   // runner id -> { editions: Set, sex, years: [] of its counted records }
const totals = { raw: 0, timing_eligible: 0, eligible: 0, own_record: 0, other: 0, bytes: 0 };
const digests = [];
let keyedCounted = 0;
cohort.forEachEdition((edition, entry, index) => {
  assert.equal(cohort.decodedSha256(edition), entry.decoded_sha256, `${entry.file}: decoded values differ from the manifest's digest`);
  assert.equal(entry.file, `editions/${entry.race_id}-${entry.year}.json.gz`, `${entry.file}: named after its race and year`);
  digests.push(entry.decoded_sha256);
  const n = edition.ids.length;
  for (const ids of [edition.ids, edition.otherIds]) {
    for (let k = 0; k < ids.length; k++) {
      assert.ok(Number.isSafeInteger(ids[k]) && ids[k] > 0 && (k === 0 || ids[k] > ids[k - 1]), `${entry.file}: ids ascend`);
      assert.ok(!seen.has(ids[k]), `record ${ids[k]} is in two places`);
      seen.add(ids[k]);
    }
  }
  assert.deepEqual([entry.raw, entry.eligible, entry.own_record], [n + edition.otherIds.length, entry.use === 'counted' ? n : 0, entry.use === 'own_record' ? n : 0], `${entry.file}: counts`);
  for (let k = 0; k < n; k++) {
    const id = edition.ids[k], runner = edition.runner[k];
    assert.ok(timingOk(edition.times[k]), `record ${id}: a timing-eligible record breaks the timing contract`);
    assert.ok(runner === 0 || (runner > 0 && runner <= id), `record ${id}: a runner id above the record's own`);
    if (!runner) continue;
    let known = runners.get(runner);
    if (!known) runners.set(runner, known = { editions: new Set(), sex: null, years: [] });
    assert.ok(!known.editions.has(index), `runner ${runner}: two records in ${entry.city} ${entry.year}`);
    known.editions.add(index);
    const sex = edition.sex[k];
    if (sex === 'M' || sex === 'F') { assert.ok(known.sex === null || known.sex === sex, `runner ${runner}: both sexes`); known.sex = sex; }
    if (entry.use === 'counted') { known.years.push(entry.year); keyedCounted++; }
  }
  edition.otherIds.forEach((id, k) => {
    const reason = edition.otherReasons[k], times = edition.otherTimes[k];
    assert.ok(reason === 'missing_checkpoints' ? times === null : (times !== null || reason === 'duplicate'), `record ${id}: times and reason disagree`);
    assert.ok(reason === 'duplicate' || times === null || !timingOk(times), `record ${id}: a record that meets the timing contract is listed as ${reason}`);
  });
  totals.raw += entry.raw; totals.timing_eligible += n; totals.eligible += entry.eligible; totals.own_record += entry.own_record;
  totals.other += edition.otherIds.length; totals.bytes += entry.bytes;
}, root);

assert.deepEqual(manifest.other_editions.columns, ['city', 'year', 'raw', 'category']);
const held = new Set(manifest.editions.map((e) => `${e.city}|${e.year}`));
let otherRaw = 0;
for (const [city, year, raw, category] of manifest.other_editions.rows) {
  assert.ok(!held.has(`${city}|${year}`) && Number.isInteger(raw) && raw > 0 && typeof category === 'string', `${city} ${year}: an edition without a file`);
  otherRaw += raw;
}
const c = manifest.cohort;
assert.ok(totals.eligible === manifest.eligible_records && totals.eligible === c.eligible, 'The counted records are the eligible cohort');
assert.ok(totals.raw + otherRaw === manifest.raw_records && manifest.raw_records === c.raw, 'The raw records add up');
assert.deepEqual([totals.own_record, totals.timing_eligible, totals.other, otherRaw],
  [manifest.own_record_records, manifest.timing_eligible_records_held, manifest.other_records_held, manifest.records_in_other_editions]);
assert.deepEqual(manifest.files, { count: listed.length, bytes: totals.bytes });
assert.equal(manifest.decoded_sha256, cohort.sha256(digests.join('')), 'The digest over every edition\'s decoded values');
assert.equal(c.raw, c.duplicates_removed + c.missing_or_unparsed + c.non_increasing + c.outside_quality_bounds + c.source_quality_excluded + c.eligible, 'The cohort reconciles to its raw records');
assert.equal(c.timing_eligible, c.eligible + c.source_quality_excluded);
if (manifest.source_quality.counts) {
  assert.equal(manifest.source_quality.counts.timing_eligible_own_record, totals.own_record, 'Own-record records equal the policy\'s count');
  assert.equal(manifest.source_quality.counts.editions, manifest.other_editions.rows.length + manifest.editions.filter((e) => e.use === 'own_record').length, 'Every edition the policy lists has no file or keeps an own-record view');
}
let groups = 0, repeatRunners = 0, repeatRecords = 0, benchmarks = 0;
for (const { years } of runners.values()) {
  if (!years.length) continue;
  groups++;
  if (years.length > 1) { repeatRunners++; repeatRecords += years.length; }
  for (const y of years) if (years.some((other) => other < y && other >= y - 2)) benchmarks++;
}
assert.deepEqual(manifest.linkage.counted_records_with_a_runner, keyedCounted);
assert.deepEqual([manifest.linkage.runners_with_a_counted_record, manifest.linkage.runners_with_two_or_more_counted_records, manifest.linkage.counted_records_of_those_runners,
  manifest.linkage.recent_benchmark_finishes], [groups, repeatRunners, repeatRecords, benchmarks], 'The linkage counts are the files\'');
for (const key of ['input_asset_sha256', 'input_manifest_sha256']) assert.match(manifest[key], /^[0-9a-f]{64}$/);
for (const [name, digest] of Object.entries(manifest.scripts)) {
  const file = path.resolve(__dirname, '..', 'analysis', name);
  if (root === cohort.ROOT) assert.equal(digest, cohort.sha256(fs.readFileSync(file)), `${name}: the cohort must be rebuilt after its code changes`);
}
console.log(`Verified the marathon cohort (${manifest.release_tag}, manifest ${manifestSha.slice(0, 12)}): ${listed.length} edition files, `
  + `${totals.eligible.toLocaleString('en-US')} counted and ${totals.own_record.toLocaleString('en-US')} own-record records, ${totals.other.toLocaleString('en-US')} other records held, `
  + `${otherRaw.toLocaleString('en-US')} records in ${manifest.other_editions.rows.length.toLocaleString('en-US')} editions without a file; ${groups.toLocaleString('en-US')} runners among the counted; `
  + `every decoded digest equal to the Python reader's (${((Date.now() - started) / 1000).toFixed(0)} s).`);
