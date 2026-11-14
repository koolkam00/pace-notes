// The marathon cohort, recounted from its checked-in files (analysis/marathon-cohort; the Python twin, which also checks it
// against the record status and identity files outside the repository, is analysis/verify_cohort.py).
//   - Every file the manifest lists is present with its size and SHA-256, and no other file is.
//   - Every edition decodes with the shared reader, and the digest of its decoded values is the manifest's, which the
//     Python reader computed: the two readers give the same numbers.
//   - Record ids are unique over the whole cohort; every timing-eligible record meets the timing contract (nine
//     increasing times, a finish from 1:30 to 12:00, every section from 2:00 to 20:00 per km) and no other record with
//     nine times does, unless it is a duplicate of one.
//   - A runner has at most one record per edition and at most one of the sexes M and F; a record has a link class
//     (h or m) exactly when it has a runner.
//   - Every count in the manifest is the files': the counted records are the eligible cohort, the raw records close on
//     the cohort's raw count with the editions that have no file, and the linkage counts are recounted, over every
//     link and over high links alone.
//   - The identity file's description the manifest names (analysis/identity.json) is the checked-in file.
//   - Every counted edition has a race date, each date its source, and an edition's `series`, where it has one, is its
//     race name. Every edition, with a file or without, carries the release's tier, weaker-source mark and split tier.
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

for (const e of manifest.editions) {
  const name = `${e.city} ${e.year}`;
  assert.equal(e.race_date === null, e.race_date_source === null, `${name}: a race date without its source, or a source without a date`);
  assert.ok(e.race_date === null || (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(e.race_date) && cohort.DATE_SOURCES.includes(e.race_date_source)), `${name}: its race date`);
  assert.ok(e.use !== 'counted' || e.race_date, `${name}: a counted edition without a race date`);
  assert.ok(e.series === null || e.series === e.race, `${name}: its series is not its race name`);
}
const seen = new Set();
const runners = new Map();   // runner id -> { editions: Set, sex, years: [] of its counted records, high: [] of those on a high link }
const totals = { raw: 0, timing_eligible: 0, eligible: 0, own_record: 0, other: 0, bytes: 0 };
const digests = [];
let keyedCounted = 0, highCounted = 0;
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
    assert.ok(runner ? ['h', 'm'].includes(edition.link[k]) : edition.link[k] === null, `record ${id}: a link class without a runner, or a runner without one`);
    if (!runner) continue;
    let known = runners.get(runner);
    if (!known) runners.set(runner, known = { editions: new Set(), sex: null, years: [], high: [] });
    assert.ok(!known.editions.has(index), `runner ${runner}: two records in ${entry.city} ${entry.year}`);
    known.editions.add(index);
    const sex = edition.sex[k];
    if (sex === 'M' || sex === 'F') { assert.ok(known.sex === null || known.sex === sex, `runner ${runner}: both sexes`); known.sex = sex; }
    if (entry.use === 'counted') {
      known.years.push(entry.year); keyedCounted++;
      if (edition.link[k] === 'h') { known.high.push(entry.year); highCounted++; }
    }
  }
  edition.otherIds.forEach((id, k) => {
    const reason = edition.otherReasons[k], times = edition.otherTimes[k];
    assert.ok(reason === 'missing_checkpoints' ? times === null : (times !== null || reason === 'duplicate'), `record ${id}: times and reason disagree`);
    assert.ok(reason === 'duplicate' || times === null || !timingOk(times), `record ${id}: a record that meets the timing contract is listed as ${reason}`);
  });
  totals.raw += entry.raw; totals.timing_eligible += n; totals.eligible += entry.eligible; totals.own_record += entry.own_record;
  totals.other += edition.otherIds.length; totals.bytes += entry.bytes;
}, root);

const held = new Set(manifest.editions.map((e) => `${e.city}|${e.year}`));
let otherRaw = 0;
for (const { city, year, raw, category } of cohort.otherEditions(manifest)) {
  assert.ok(!held.has(`${city}|${year}`) && Number.isInteger(raw) && raw > 0 && typeof category === 'string', `${city} ${year}: an edition without a file`);
  otherRaw += raw;
}
for (const e of [...manifest.editions, ...cohort.otherEditions(manifest)]) {
  assert.ok(cohort.TIERS.includes(e.tier) && typeof e.weaker_source === 'boolean' && cohort.SPLIT_TIERS.includes(e.split_tier), `${e.city} ${e.year}: its tier fields`);
  assert.equal(e.weaker_source, e.tier === 'stamped_weaker_source', `${e.city} ${e.year}: its weaker-source mark is not its tier's`);
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
/** The linkage counts over the counted records each runner is followed by: `pick` gives a runner's years. */
function linked(pick, records) {
  let groups = 0, repeatRunners = 0, repeatRecords = 0, benchmarks = 0;
  for (const known of runners.values()) {
    const years = pick(known);
    if (!years.length) continue;
    groups++;
    if (years.length > 1) { repeatRunners++; repeatRecords += years.length; }
    for (const y of years) if (years.some((other) => other < y && other >= y - 2)) benchmarks++;
  }
  return { counted_records_with_a_runner: records, runners_with_a_counted_record: groups, runners_with_two_or_more_counted_records: repeatRunners,
    counted_records_of_those_runners: repeatRecords, recent_benchmark_finishes: benchmarks };
}
const every = linked((known) => known.years, keyedCounted);
const groups = every.runners_with_a_counted_record;
assert.deepEqual(Object.fromEntries(Object.keys(every).map((key) => [key, manifest.linkage[key]])), every, 'The linkage counts are the files\'');
assert.deepEqual(manifest.linkage.high_links, linked((known) => known.high, highCounted), 'The linkage counts on high links alone are the files\'');
for (const key of ['input_asset_sha256', 'input_manifest_sha256']) assert.match(manifest[key], /^[0-9a-f]{64}$/);
assert.ok(cohort.SCRIPTS.every((name) => name in manifest.scripts), 'The manifest names the scripts that wrote the cohort');
const description = manifest.inputs.identity.description;
if (root === cohort.ROOT) {
  assert.ok(description && description.file === 'analysis/identity.json', 'The checked-in cohort names the identity file\'s description');
  assert.equal(cohort.sha256(fs.readFileSync(path.resolve(__dirname, '..', description.file))), description.sha256, 'analysis/identity.json is the description the manifest names');
}
for (const [name, digest] of Object.entries(manifest.scripts)) {
  const file = path.resolve(__dirname, '..', 'analysis', name);
  if (root === cohort.ROOT) assert.equal(digest, cohort.sha256(fs.readFileSync(file)), `${name}: the cohort must be rebuilt after its code changes`);
}
console.log(`Verified the marathon cohort (${manifest.release_tag}, manifest ${manifestSha.slice(0, 12)}): ${listed.length} edition files, `
  + `${totals.eligible.toLocaleString('en-US')} counted and ${totals.own_record.toLocaleString('en-US')} own-record records, ${totals.other.toLocaleString('en-US')} other records held, `
  + `${otherRaw.toLocaleString('en-US')} records in ${manifest.other_editions.rows.length.toLocaleString('en-US')} editions without a file; ${groups.toLocaleString('en-US')} runners among the counted; `
  + `every decoded digest equal to the Python reader's (${((Date.now() - started) / 1000).toFixed(0)} s).`);
