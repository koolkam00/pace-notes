// The eligible finishes for scripts/verify-charts.cjs, rebuilt from the checksum-verified runner shards without the
// Python builders: one pass over every shard into bounded typed arrays (nine cumulative times per finish, edition,
// recorded gender, age group, exact age, linked-record index), then the derived flags every chart reads — sustained
// slowdown and its onset, the start-offset (shape) screen, the granular-age editions — computed from their published
// definitions. Every recorded runner name is checked against the charts' strings on the way through.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const zlib = require('node:zlib'), assert = require('node:assert/strict');

const MIN_CELL = 100;
const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
// The builder's np.diff([0, *POINTS]) makes the last section 2.1950000000000003 km; the same doubles here.
const LENGTHS = POINTS.map((km, i) => km - (i ? POINTS[i - 1] : 0));
const AGE_LABELS = ['Unknown', '18–24', ...Array.from({ length: 13 }, (_, i) => `${25 + 5 * i}–${29 + 5 * i}`)];
const GENDER_LABELS = ['Other / not recorded', 'Men', 'Women'];
const GENDER_GAP_EDITIONS = [['London', 2023], ['London', 2025], ['London', 2026], ['Berlin', 2024], ['Berlin', 2025], ['Chicago', 2024]];

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const integer = (x, minimum = 0) => Number.isSafeInteger(x) && x >= minimum;
const normaliseName = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function genderCode(sex) {
  assert.ok(sex === null || sex === undefined || typeof sex === 'string', 'Recorded gender is text or missing');
  const value = (sex || '').trim().toLowerCase();
  return ['m', 'male', 'man', 'men'].includes(value) ? 1 : ['f', 'female', 'woman', 'women'].includes(value) ? 2 : 0;
}
const exactAge = (age) => (typeof age === 'number' && Number.isInteger(age) && age >= 18 && age < 90 ? age : NaN);
// build_fast_start.age_code: 18–24 is 1, then one code per five years to 85–89.
const ageCode = (age) => (Number.isNaN(exactAge(age)) ? 0 : age < 25 ? 1 : Math.floor(age / 5) - 3);

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
 * Streams the shards under `dataRoot/runners` and returns the cohort. `strings` maps normalised chart text to where it
 * appears; a runner name equal to one is reported in `nameHits`.
 */
function loadCohort({ root, dataRoot, strings = new Map() }) {
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const pin = read(path.join(root, 'analysis/release.json'));
  const manifestBytes = fs.readFileSync(path.join(dataRoot, 'runners/manifest.json'));
  const runners = JSON.parse(manifestBytes);
  assert.equal(runners.release_tag, pin.tag, 'The runner manifest is the adopted release');
  const editions = runners.editions;
  const key = (city, year) => `${city}\u0000${year}`;
  const excluded = new Set(runners.source_quality.editions.map((row) => key(row.city, row.year)));
  const n = runners.eligible_records;
  const times = new Float64Array(n * 9), edition = new Uint16Array(n), gender = new Uint8Array(n), age = new Uint8Array(n);
  const exact = new Float64Array(n), profile = new Int32Array(n);
  const recordIds = new Float64Array(runners.raw_records), profileIds = new Float64Array(runners.profiles);
  const files = Object.keys(runners.shards).sort(), nameHits = [];
  let raw = 0, profiles = 0, eligible = 0;
  for (const file of files) {
    assert.match(file, /^(profiles|index)\/[a-f0-9]{3}\.json\.gz$/);
    const bytes = fs.readFileSync(path.join(dataRoot, 'runners', file));
    assert.equal(bytes.length, runners.shards[file].bytes, `${file}: compressed bytes`);
    assert.equal(hash(bytes), runners.shards[file].sha256, `${file}: source checksum`);
    if (!file.startsWith('profiles/')) continue;
    const shard = JSON.parse(zlib.gunzipSync(bytes));
    assert.equal(shard.release_tag, pin.tag, `${file}: shard release`);
    for (const p of shard.profiles) {
      assert.ok(profiles < profileIds.length && integer(p.id, 1), 'Valid profile ID and declared count');
      profileIds[profiles++] = p.id;
      if (strings.size) for (const name of p.names ?? []) if (typeof name === 'string' && strings.has(normaliseName(name))) nameHits.push(strings.get(normaliseName(name)));
      for (const race of p.races) {
        assert.ok(raw < recordIds.length && integer(race.id, 1), 'Valid record ID and declared count');
        recordIds[raw++] = race.id;
        if (strings.size && typeof race.name === 'string' && strings.has(normaliseName(race.name))) nameHits.push(strings.get(normaliseName(race.name)));
        assert.ok(integer(race.edition) && race.edition < editions.length, 'Valid edition mapping');
        assert.equal(typeof race.eligible, 'boolean', 'Explicit source eligibility');
        if (!race.eligible) continue;
        const ed = editions[race.edition], t = race.times;
        assert.ok(!excluded.has(key(ed.city, ed.year)), 'Reviewed source exclusions cannot contribute');
        assert.ok(eligible < n && Array.isArray(t) && t.length === 9 && t.every(finite) && t[0] > 0 && t[8] >= 5400 && t[8] <= 43200, 'Eligible timing contract');
        for (let k = 0; k < 9; k++) {
          if (k) assert.ok(t[k] > t[k - 1], 'Eligible times increase');
          const pace = (t[k] - (k ? t[k - 1] : 0)) / LENGTHS[k];
          assert.ok(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'Eligible section pace bounds');
        }
        times.set(t, eligible * 9);
        edition[eligible] = race.edition;
        gender[eligible] = genderCode(race.sex);
        age[eligible] = ageCode(race.age);
        exact[eligible] = exactAge(race.age);
        profile[eligible] = profiles - 1;
        eligible++;
      }
    }
  }
  assert.equal(raw, runners.raw_records, 'Complete source traversal');
  assert.equal(profiles, runners.profiles, 'Every candidate profile');
  assert.equal(eligible, n, 'Eligible finishes reconcile with the runner manifest');
  for (const [label, ids] of [['record', recordIds], ['profile', profileIds]]) {
    ids.sort();
    for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `Unique ${label} IDs`);
  }

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

  // Rows by edition, in verified shard order.
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
  const col = (k) => Float64Array.from(editions, (e) => { const row = byKey.get(key(e.city, e.year)); return row && finite(row[k]) ? row[k] : NaN; });
  const geometryPath = path.join(dataRoot, 'insights/course-geometry.json');
  const geometry = fs.existsSync(geometryPath) ? read(geometryPath) : { courses: [] };

  return {
    n, times, edition, gender, age, exactAge: exact, profile, finish, baseline, slow, onset, pace, shapeKeep, shapeFlagged,
    granular, exactAgeOk, editions, cities, city, year, edN, rowsOf, genderGapEdition, nameHits,
    ed: { city: editions.map((e) => e.city), year: editions.map((e) => e.year), race: editions.map((e) => e.race), temp: col('temp_c'), dew: col('dewpoint_c'), wind: col('wind_mps'), warming: col('warming_c') },
    weather, geometry, runners, manifestSha: hash(manifestBytes), pin,
  };
}

module.exports = { loadCohort, quantile, quantileSorted, median, normaliseName, MIN_CELL, POINTS, LENGTHS, AGE_LABELS, GENDER_LABELS };
