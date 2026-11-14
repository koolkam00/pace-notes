// The eligible finishes for scripts/verify-charts.cjs, rebuilt from the marathon cohort (analysis/marathon-cohort,
// read through scripts/lib/cohort.cjs, which checks every file's size and SHA-256) without the Python builders: one
// pass over every edition file into bounded typed arrays (nine cumulative times per finish, edition, recorded gender,
// age group, exact age, linked-record index), then the derived flags every chart reads — sustained slowdown and its
// onset, the start-offset (shape) screen, the granular-age editions — computed from their published definitions.
// The finishes are the cohort's counted records in cohort order: by edition as the manifest lists them, then record
// id (the order analysis/insights_data.py read_finishes gives the builders, so a tie broken by position breaks the
// same way on both sides). The cohort holds no names: every recorded runner name is read through
// scripts/charts/names.cjs and checked against the charts' strings.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cohortFiles = require('../lib/cohort.cjs');
const { policyEditions, policySha256 } = require('../lib/edition-policy.cjs');
const { recordedNames } = require('./names.cjs');

const MIN_CELL = 100;
const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
// The builder's np.diff([0, *POINTS]) makes the last section 2.1950000000000003 km; the same doubles here.
const LENGTHS = POINTS.map((km, i) => km - (i ? POINTS[i - 1] : 0));
const AGE_LABELS = ['Unknown', '18–24', ...Array.from({ length: 13 }, (_, i) => `${25 + 5 * i}–${29 + 5 * i}`)];
const GENDER_LABELS = ['Other / not recorded', 'Men', 'Women'];
const GENDER_GAP_EDITIONS = [['London', 2023], ['London', 2025], ['London', 2026], ['Berlin', 2024], ['Berlin', 2025], ['Chicago', 2024]];
// The scripts a cohort manifest must name (analysis/insights_data.py COHORT_SCRIPTS).
const COHORT_SCRIPTS = ['build_cohort.py', 'cohort.py', 'build_pacing.py', 'source_quality.py', 'build_record_status.py', 'build_identity.py'];

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const integer = (x, minimum = 0) => Number.isSafeInteger(x) && x >= minimum;
const normaliseName = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// The cohort writes recorded sex as one letter (M, F, X) or none; the builder's coding (insights_data.read_finishes).
const genderCode = (sex) => (sex === 'M' ? 1 : sex === 'F' ? 2 : 0);
const exactAge = (age) => (typeof age === 'number' && Number.isInteger(age) && age >= 18 && age < 90 ? age : NaN);
// build_fast_start.age_code: 18–24 is 1, then one code per five years to 85–89.
const ageCode = (age) => (Number.isNaN(exactAge(age)) ? 0 : age < 25 ? 1 : Math.floor(age / 5) - 3);

/** Python's round(x) for a non-negative or negative double: a tie goes to the even integer (Math.round sends it up). */
function roundHalfEven(x) {
  const floor = Math.floor(x), diff = x - floor;
  return diff < 0.5 ? floor : diff > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
}

/** Linear-interpolation quantile ((n−1)·q) of a sorted Float64Array, as insights_stats.quantile. */
function quantileSorted(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function quantile(values, q) {
  const v = Float64Array.from(values).sort();
  return quantileSorted(v, q);
}
const median = (values) => quantile(values, 0.5);

/**
 * The cohort manifest after the checks a reader makes before it trusts the cohort (the twin of
 * insights_data.verified_cohort_manifest): the adopted release, the nine checkpoints, the canonical id contract, the
 * scripts it names, counts that agree with each other, and the edition policy it states against the published list.
 */
function verifiedManifest(root, cohortRoot) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'analysis/release.json'), 'utf8'));
  const { manifest, sha256 } = cohortFiles.readManifest(cohortRoot);
  assert.equal(manifest.release_tag, pin.tag, 'The marathon cohort is the adopted release');
  assert.deepEqual(manifest.points_km, POINTS, 'The cohort’s nine checkpoints');
  assert.equal(manifest.linkage.record_join_method, 'canonical_record_id', 'The audited canonical identity contract');
  for (const name of COHORT_SCRIPTS) assert.ok(name in manifest.scripts, `The cohort manifest names its script ${name}`);
  assert.ok(manifest.raw_records === manifest.cohort.raw && manifest.eligible_records === manifest.cohort.eligible, 'Consistent source cohort metadata');
  // The edition policy the cohort was built under: the published list is the one this manifest's digests name, its rules
  // hash to the policy digest, and it lists no counted edition and every own-record edition.
  const listed = policyEditions(manifest.source_quality, 'cohort manifest source_quality');
  assert.equal(policySha256(manifest.source_quality, listed), manifest.source_quality.policy_sha256, 'The published edition list hashes to the cohort’s policy digest');
  return { pin, manifest, sha256, listed };
}

/**
 * Reads every edition file of the cohort and returns the finishes. `strings` maps normalised chart text to where it
 * appears; a recorded runner name equal to one is reported in `nameHits` (`names` says where the names were read).
 */
function loadCohort({ root, dataRoot, cohortRoot = cohortFiles.ROOT, strings = new Map(), env = process.env }) {
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const { pin, manifest, sha256: manifestSha, listed } = verifiedManifest(root, cohortRoot);
  const editions = manifest.editions;
  const key = (city, year) => `${city}\u0000${year}`;
  const notCounted = new Map(listed.map((row) => [key(row.city, row.year), row]));
  const n = manifest.eligible_records;
  const times = new Float64Array(n * 9), edition = new Uint16Array(n), gender = new Uint8Array(n), age = new Uint8Array(n);
  const exact = new Float64Array(n), runner = new Float64Array(n);
  // Every written record of each edition (the manifest's raw count, checked against the file): recounts apply their
  // own retention screens to it.
  const rawN = new Int32Array(editions.length);
  const recordIds = new Float64Array(editions.reduce((total, e) => total + e.raw, 0));
  let raw = 0, eligible = 0;
  cohortFiles.forEachEdition((file, entry, index) => {
    assert.ok(integer(entry.raw, 1) && file.ids.length + file.otherIds.length === entry.raw, `${entry.file}: every written record of the edition`);
    rawN[index] = entry.raw;
    for (const id of file.ids) { assert.ok(integer(id, 1), 'Valid record ID'); recordIds[raw++] = id; }
    for (const id of file.otherIds) { assert.ok(integer(id, 1), 'Valid record ID'); recordIds[raw++] = id; }
    const rule = notCounted.get(key(entry.city, entry.year));
    if (entry.use !== 'counted') {
      // An edition that keeps only an own-record view: on the published list as such, and it supplies no finish here.
      assert.ok(entry.use === 'own_record' && rule && rule.own_record === true && entry.eligible === 0, `${entry.file}: an own-record edition is listed by the policy and counts no finish`);
      return;
    }
    assert.ok(!rule, `${entry.file}: an edition the reviewed policy lists cannot contribute`);
    assert.equal(entry.eligible, file.ids.length, `${entry.file}: its counted records`);
    const runners = new Set();
    for (let k = 0; k < file.ids.length; k++) {
      const t = file.times[k], id = file.ids[k], own = file.runner[k];
      assert.ok(eligible < n && Array.isArray(t) && t.length === 9 && t.every(finite) && t[0] > 0 && t[8] >= 5400 && t[8] <= 43200, 'Eligible timing contract');
      for (let j = 0; j < 9; j++) {
        if (j) assert.ok(t[j] > t[j - 1], 'Eligible times increase');
        const pace = (t[j] - (j ? t[j - 1] : 0)) / LENGTHS[j];
        assert.ok(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'Eligible section pace bounds');
      }
      // The runner: the smallest written marathon record id of the record's key, or the record itself without a key.
      assert.ok(own === 0 || (integer(own, 1) && own <= id), 'A runner is named by a record id no larger than the record’s own');
      const who = own || id;
      assert.ok(!runners.has(who), `${entry.file}: a runner has at most one counted record in an edition`);
      runners.add(who);
      times.set(t, eligible * 9);
      edition[eligible] = index;
      gender[eligible] = genderCode(file.sex[k]);
      age[eligible] = ageCode(file.age[k]);
      exact[eligible] = exactAge(file.age[k]);
      runner[eligible] = who;
      eligible++;
    }
  }, cohortRoot);
  assert.equal(raw, recordIds.length, 'Complete traversal of the cohort’s edition files');
  assert.equal(raw + manifest.other_editions.rows.reduce((total, row) => total + row[2], 0), manifest.raw_records, 'Every written record is in an edition file or in an edition the manifest lists without one');
  assert.equal(eligible, n, 'Eligible finishes reconcile with the cohort manifest');
  recordIds.sort();
  for (let i = 1; i < recordIds.length; i++) assert.notEqual(recordIds[i], recordIds[i - 1], 'Unique record IDs');

  // Linked records: a dense index in order of the cohort runner id, as insights_data.read_finishes numbers `profile`.
  const ids = Float64Array.from(runner).sort();
  let profiles = 0;
  for (let i = 0; i < n; i++) if (i === 0 || ids[i] !== ids[i - 1]) ids[profiles++] = ids[i];
  const profile = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = profiles - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ids[mid] < runner[i]) lo = mid + 1; else hi = mid; }
    profile[i] = lo;
  }

  // The name guard: every recorded runner name against the charts' strings.
  const nameHits = [];
  const names = strings.size
    ? recordedNames({ root, dataRoot, cohort: { manifest, sha256: manifestSha }, env }, (name) => { const where = strings.get(normaliseName(name)); if (where !== undefined) nameHits.push(where); })
    : { source: 'none', where: 'no chart strings to check', names: 0 };

  // Derived per-finish arrays.
  const finish = new Float64Array(n), baseline = new Float64Array(n), slow = new Uint8Array(n), onset = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    finish[i] = times[o + 8];
    baseline[i] = (times[o + 3] - times[o]) / 15;
    // Published definition: a 5 km section after 20 km at least 25% slower than the 5–20 km pace (insights_data, +1e-12).
    for (let k = 4; k < 8; k++) {
      const pace = (times[o + k] - times[o + k - 1]) / LENGTHS[k];
      if (pace / baseline[i] - 1 + 1e-12 >= 0.25) { slow[i] = 1; onset[i] = 20 + 5 * (k - 4); break; }
    }
  }
  const pace = (i, k) => (times[i * 9 + k] - (k ? times[i * 9 + k - 1] : 0)) / LENGTHS[k];

  // Rows by edition, in cohort order.
  const E = editions.length, edN = new Uint32Array(E), start = new Uint32Array(E + 1);
  for (let i = 0; i < n; i++) edN[edition[i]]++;
  for (let e = 0; e < E; e++) start[e + 1] = start[e] + edN[e];
  const byEdition = new Uint32Array(n), cursor = start.slice(0, -1);
  for (let i = 0; i < n; i++) byEdition[cursor[edition[i]]++] = i;
  const rowsOf = (e) => byEdition.subarray(start[e], start[e + 1]);

  // Start-offset screen (insights_data.start_offset_screen): an edition of 100+ finishes whose median relative pace
  // over 0–5 km exceeds its 5–10 km median by more than 10 points stays out of pacing-shape statistics.
  const shapeFlagged = [];
  for (let e = 0; e < E; e++) {
    const rows = rowsOf(e);
    if (rows.length < MIN_CELL) continue;
    const a = new Float64Array(rows.length), b = new Float64Array(rows.length);
    rows.forEach((i, j) => {
      const avg = finish[i] / 42.195;
      a[j] = 100 * (pace(i, 0) / avg - 1);
      b[j] = 100 * (pace(i, 1) / avg - 1);
    });
    if (median(a) - median(b) > 10) shapeFlagged.push(e);
  }
  const flagged = new Uint8Array(E);
  for (const e of shapeFlagged) flagged[e] = 1;
  const shapeKeep = new Uint8Array(n);
  for (let i = 0; i < n; i++) shapeKeep[i] = flagged[edition[i]] ? 0 : 1;

  // Granular-age editions (insights_data.granular_age_editions): 100+ exact ages, 30+ distinct, under 40% multiples of 5.
  const granular = new Set();
  for (let e = 0; e < E; e++) {
    const ages = [];
    for (const i of rowsOf(e)) if (!Number.isNaN(exact[i])) ages.push(exact[i]);
    if (ages.length >= MIN_CELL && new Set(ages).size >= 30 && ages.filter((a) => a % 5 === 0).length / ages.length < 0.4) granular.add(e);
  }
  const exactAgeOk = new Uint8Array(n);
  for (let i = 0; i < n; i++) exactAgeOk[i] = granular.has(edition[i]) && !Number.isNaN(exact[i]) ? 1 : 0;

  const cities = [...new Set(editions.map((e) => e.city))].sort();
  const cityIndex = new Map(cities.map((c, i) => [c, i]));
  const edCity = editions.map((e) => cityIndex.get(e.city));
  const city = new Uint8Array(n), year = new Uint16Array(n);
  for (let i = 0; i < n; i++) { city[i] = edCity[edition[i]]; year[i] = editions[edition[i]].year; }
  const gap = new Set(GENDER_GAP_EDITIONS.map(([c, y]) => key(c, y)));
  const genderGapEdition = editions.map((e) => gap.has(key(e.city, e.year)));

  // Edition weather (public/data/weather/evidence.json, its own release pin) and course geometry.
  const weather = read(path.join(dataRoot, 'weather/evidence.json'));
  assert.equal(weather.input.release_tag, read(path.join(root, 'analysis/weather-release.json')).tag, 'Weather evidence matches its pin');
  const byKey = new Map(weather.editions.map((row) => [key(row.city, row.year), row]));
  // Race dates: the weather evidence's, then the reviewed and cited date for an edition it has no row for
  // (analysis/reviewed-race-dates.json, under the evidence's release). A reviewed date orders linked finishes only; it
  // carries no weather. The twin of charts_common.race_dates.
  const reviewed = read(path.join(root, 'analysis/reviewed-race-dates.json')).releases[weather.input.release_tag] || [];
  const raceDates = [...weather.editions.map((row) => ({ city: row.city, year: row.year, date: row.date })),
    ...reviewed.filter((d) => !(byKey.get(key(d.city, d.year)) || {}).date).map((d) => ({ city: d.city, year: d.year, date: d.date }))];
  // The cohort manifest states a race date for each edition from the same two sources; for every edition with finishes
  // the date the charts order by is that date (both absent for an edition no source dates).
  const dateOf = new Map(raceDates.map((d) => [key(d.city, d.year), d.date]));
  editions.forEach((e, index) => {
    if (edN[index]) assert.equal(dateOf.get(key(e.city, e.year)) ?? null, e.race_date ?? null, `${e.city} ${e.year}: the race date the charts order by is not the cohort manifest's`);
  });
  const col = (k) => Float64Array.from(editions, (e) => { const row = byKey.get(key(e.city, e.year)); return row && finite(row[k]) ? row[k] : NaN; });
  const geometryPath = path.join(dataRoot, 'insights/course-geometry.json');
  const geometry = fs.existsSync(geometryPath) ? read(geometryPath) : { courses: [] };

  return {
    n, times, edition, gender, age, exactAge: exact, profile, profiles, finish, baseline, slow, onset, pace, shapeKeep, shapeFlagged,
    granular, exactAgeOk, editions, cities, city, year, edN, rawN, rowsOf, genderGapEdition, nameHits, names,
    ed: { city: editions.map((e) => e.city), year: editions.map((e) => e.year), race: editions.map((e) => e.race), temp: col('temp_c'), dew: col('dewpoint_c'), wind: col('wind_mps'), warming: col('warming_c') },
    weather, raceDates, geometry, manifest, manifestSha, pin,
  };
}

module.exports = { loadCohort, verifiedManifest, quantile, quantileSorted, median, normaliseName, roundHalfEven, hash, MIN_CELL, POINTS, LENGTHS, AGE_LABELS, GENDER_LABELS, COHORT_SCRIPTS };
