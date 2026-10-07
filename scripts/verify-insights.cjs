// Independent reconciliation of the Pace Notes story analyses (public/data/insights).
// It does not import the Python builders or trust their cohorts: the eligible
// finishes are rebuilt from the checksum-verified runner shards and held once in
// bounded typed arrays (one Float64Array of nine cumulative times per finish).
// Families without a recount here (for example a later courses.json or kick.json)
// still receive the provenance, inventory, threshold, identity and copy checks and
// are named in the summary, so they are never mistaken for recounted results.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const zlib = require('node:zlib'), assert = require('node:assert/strict');

const started = Date.now();
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), options = {};
const usage = 'Usage: node scripts/verify-insights.cjs [--input insights-directory] [--data-root public-data-directory]';
assert.ok(args.length % 2 === 0 && args.length <= 4, usage);
for (let i = 0; i < args.length; i += 2) {
  assert.ok(['--input', '--data-root'].includes(args[i]) && !(args[i] in options) && args[i + 1], usage);
  options[args[i]] = path.resolve(args[i + 1]);
}
const dataRoot = options['--data-root'] || path.join(root, 'public/data');
const input = options['--input'] || path.join(dataRoot, 'insights');
const analysisDir = path.join(root, 'analysis');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = x => typeof x === 'number' && Number.isFinite(x);
const integer = (x, minimum = 0) => Number.isSafeInteger(x) && x >= minimum;
const near = (actual, expected, label, tolerance = 1.1e-6) => assert.ok(finite(actual) && finite(expected)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
const sum = values => values.reduce((a, b) => a + b, 0);
const MIN_CELL = 100, REPLAY_SAMPLE = 1500;
const points = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
// The builder's np.diff([0, *points]) makes the last section 2.1950000000000003 km.
// Using the same doubles reproduces relative paces, letters and centroids bit for bit.
const lengths = points.map((km, i) => km - (i ? points[i - 1] : 0));
const weights = lengths.map(km => Math.sqrt(km / 5));
const ageLabels = ['Unknown', '18–24', ...Array.from({ length: 13 }, (_, i) => `${25 + 5 * i}–${29 + 5 * i}`)];
// Same normalisation as analysis/build_fast_start.py gender_code: 0 other/not recorded, 1 men, 2 women.
function genderCode(sex) {
  assert.ok(sex === null || sex === undefined || typeof sex === 'string', 'Recorded gender is text or missing');
  const value = (sex || '').trim().toLowerCase();
  return ['m', 'male', 'man', 'men'].includes(value) ? 1 : ['f', 'female', 'woman', 'women'].includes(value) ? 2 : 0;
}
const exactAge = age => typeof age === 'number' && Number.isInteger(age) && age >= 18 && age < 90;
// Python round() and np.round: round half to even on the exact double.
function rint(value) {
  const floor = Math.floor(value), rest = value - floor;
  return rest > .5 ? floor + 1 : rest < .5 ? floor : floor % 2 === 0 ? floor : floor + 1;
}
function median(values) {
  const sorted = Float64Array.from(values).sort(), half = sorted.length >> 1;
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}
const quantile = (sorted, fraction) => {
  const position = (sorted.length - 1) * fraction, lower = Math.floor(position), upper = Math.min(lower + 1, sorted.length - 1);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
function bound(sorted, value, inclusive) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value || inclusive && sorted[mid] === value) lo = mid + 1; else hi = mid;
  }
  return lo;
}
// 1-based rank among a sorted field, ties sharing the mean of their positions.
const averageRank = (sorted, value) => (bound(sorted, value, false) + 1 + bound(sorted, value, true)) / 2;
// Index j of [start + width*j, start + width*(j+1)) using exact comparisons, or -1.
function bandIndex(value, start, width, count) {
  if (!(value >= start)) return -1;
  let j = Math.floor((value - start) / width);
  while (j > 0 && value < start + width * j) j--;
  while (value >= start + width * (j + 1)) j++;
  return j < count ? j : -1;
}
const clock = minutes => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const markKind = K => K % 60 === 0 ? 'hour' : K % 30 === 0 ? 'half-hour' : K % 15 === 0 ? 'quarter'
  : K % 10 === 0 ? 'ten' : K % 5 === 0 ? 'five' : 'minute';
// insights_round.cliff_index: the step into the mark against the neighbouring steps.
const cliffIndex = (count, K) => Math.exp(Math.log(count(K - 1) / count(K))
  - .5 * (Math.log(count(K - 3) / count(K - 2)) + Math.log(count(K + 2) / count(K + 3))));
const EVEN_SENTENCE = (3 ** 9 - 1) / 2; // nine 'E' letters
const decode = code => Array.from({ length: 9 }, (_, k) => 'FES'[Math.floor(code / 3 ** (8 - k)) % 3]).join('');
const normaliseName = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Per-finish measures read nine cumulative times at offset o of a Float64Array.
function relativePace(times, o, out) {
  const average = times[o + 8] / 42.195;
  for (let k = 0; k < 9; k++) out[k] = 100 * ((times[o + k] - (k ? times[o + k - 1] : 0)) / lengths[k] / average - 1);
  return out;
}
function sustained(times, o) {
  const baseline = (times[o + 3] - times[o]) / 15;
  for (let k = 4; k < 8; k++) if ((times[o + k] - times[o + k - 1]) / lengths[k] / baseline - 1 + 1e-12 >= .25) return true;
  return false;
}
function sentence(R) {
  let code = 0;
  for (let k = 0; k < 9; k++) code = code * 3 + (R[k] < -3 ? 0 : R[k] > 3 ? 2 : 1);
  return code;
}
function nearest(R, classifier) {
  let best = -1, bestDistance = Infinity;
  classifier.centroids.forEach((centroid, j) => {
    let distance = 0;
    for (let k = 0; k < 9; k++) {
      const d = Math.min(Math.max(R[k], classifier.clip_lo[k]), classifier.clip_hi[k]) * weights[k] - centroid[k];
      distance += d * d;
    }
    if (distance < bestDistance) { best = j; bestDistance = distance; }
  });
  return best;
}

// Boundary and counterexample checks protect the re-implemented definitions.
assert.deepEqual([null, 'M', ' female ', 'Men', 'W', 'X'].map(genderCode), [0, 1, 2, 1, 0, 0]);
assert.deepEqual([0.5, 1.5, 2.5, 2.4999999, 2.5000001, 7].map(rint), [0, 2, 2, 2, 3, 7], 'Half-to-even rounding');
assert.deepEqual([null, 17, 18, 35.5, 89, 90].map(exactAge), [false, false, true, false, true, false]);
const tieField = Float64Array.from([3, 1, 3, 2]).sort();
assert.deepEqual([3, 1, 3, 2].map(v => averageRank(tieField, v)), [3.5, 1, 3.5, 2], 'Tied clock times share the average rank');
assert.deepEqual([149.999, 150, 164.999, 165, 389.999, 390].map(v => bandIndex(v, 150, 15, 16)), [-1, 0, 0, 1, 15, -1]);
const even = Float64Array.from(points, km => km * 300);
assert.ok(relativePace(even, 0, new Float64Array(9)).every(v => Math.abs(v) < 1e-9), 'Even pacing has zero relative pace');
assert.equal(decode(sentence([-3.0000001, -3, 3, 3.0000001, 0, 0, 0, 0, 0])), 'FEESEEEEE', 'Letters are strict beyond ±3%');
assert.equal(sentence(new Float64Array(9)), EVEN_SENTENCE);
assert.equal(sustained(even, 0), false);
assert.equal(sustained(Float64Array.from(even, (t, i) => t + (i >= 7 ? 375 : 0)), 0), true, 'Exactly 25% over 35–40 km qualifies');
assert.equal(sustained(Float64Array.from(even, (t, i) => t + (i === 8 ? 2000 : 0)), 0), false, 'The final 2.195 km alone cannot qualify');
near(cliffIndex(m => 1000 * 1.1 ** -m, 200), 1, 'A smooth geometric histogram has no cliff', 1e-9);
assert.deepEqual([240, 210, 165, 170, 175, 151].map(markKind), ['hour', 'half-hour', 'quarter', 'ten', 'five', 'minute']);
assert.equal(clock(225), '3:45');

// 1. Provenance: adopted release, exact runner and context manifests, every script hash.
const pin = read(path.join(analysisDir, 'release.json'));
const runnersPath = path.join(dataRoot, 'runners/manifest.json'), contextPath = path.join(dataRoot, 'runner-context/manifest.json');
const runnerBytes = fs.readFileSync(runnersPath), contextBytes = fs.readFileSync(contextPath);
const runners = JSON.parse(runnerBytes), context = JSON.parse(contextBytes);
const runnerSha = hash(runnerBytes), contextSha = hash(contextBytes);
const manifest = read(path.join(input, 'manifest.json'));
assert.equal(manifest.schema_version, 1, 'Insights manifest schema');
assert.equal(runners.release_tag, pin.tag, 'Adopted runner source'); assert.equal(context.release_tag, pin.tag, 'Adopted runner context');
assert.equal(manifest.release_tag, pin.tag, 'Insights use the adopted release');
assert.equal(manifest.runner_manifest_sha256, runnerSha, 'Exact runner manifest binding');
assert.equal(manifest.context_manifest_sha256, contextSha, 'Exact runner-context manifest binding');
assert.equal(context.runner_manifest_sha256, runnerSha, 'Context manifest describes the same runner manifest');
assert.equal(manifest.runner_manifest_as_of, runners.as_of); assert.equal(manifest.input_as_of, runners.input_as_of);
assert.ok(Number.isFinite(Date.parse(manifest.as_of)), 'Calculation timestamp');
assert.deepEqual(runners.points_km, points);
// The builder binds every insights_*.py present when it ran plus its two shared builders.
// A module added since (a family still in progress) is reported, never silently trusted.
const boundScripts = Object.keys(manifest.scripts);
for (const name of ['build_insights.py', 'build_fast_start.py', 'insights_data.py', 'insights_stats.py']) assert.ok(boundScripts.includes(name), `Shared script bound: ${name}`);
assert.ok(boundScripts.every(name => /^insights_[a-z_]+\.py$/.test(name) || ['build_insights.py', 'build_fast_start.py'].includes(name)), 'Only story scripts are bound');
const unboundModules = fs.readdirSync(analysisDir).filter(name => /^insights_.*\.py$/.test(name) && !boundScripts.includes(name)).sort();
assert.deepEqual(manifest.source_scripts, runners.scripts, 'Runner source scripts');
for (const [name, digest] of Object.entries({ ...runners.scripts, ...manifest.scripts })) {
  assert.match(name, /^[a-z_]+\.py$/);
  assert.equal(digest, hash(fs.readFileSync(path.join(analysisDir, name))), `Stale calculation script: ${name}`);
}
assert.equal(manifest.eligible_records, runners.eligible_records, 'Eligible source records');
assert.deepEqual(manifest.genders, ['Other / not recorded', 'Men', 'Women']); assert.deepEqual(manifest.ages, ageLabels);
assert.ok(Array.isArray(manifest.methodology) && manifest.methodology.every(line => typeof line === 'string' && line.length));

// Inventory: exactly the listed files exist (recursively), each with matching bytes and checksum.
function inventory(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return inventory(path.join(directory, entry.name), relative + '/');
    assert.ok(entry.isFile(), `${relative}: unexpected non-regular entry in the insights folder`);
    return [relative];
  });
}
const listed = Object.keys(manifest.files), present = inventory(input).filter(file => file !== 'manifest.json');
assert.deepEqual(listed, [...listed].sort(), 'Sorted manifest file map');
assert.deepEqual(present.filter(file => !(file in manifest.files)).sort(), [], 'Unlisted files under the insights folder');
assert.deepEqual(listed.filter(file => !present.includes(file)), [], 'Listed insights files are missing');
const docs = new Map();
for (const file of listed) {
  assert.match(file, /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?\.json$/, `${file}: published path`);
  const meta = manifest.files[file], bytes = fs.readFileSync(path.join(input, file));
  assert.deepEqual(Object.keys(meta).sort(), ['bytes', 'sha256'], `${file}: file metadata`);
  assert.equal(bytes.length, meta.bytes, `${file}: bytes`);
  assert.equal(hash(bytes), meta.sha256, `${file}: sha256`);
  try { docs.set(file, JSON.parse(bytes.toString('utf8'))); } catch (error) { assert.fail(`${file}: strict JSON without NaN/Infinity (${error.message})`); }
}
// The builder registers these modules: a module bound at build time must have published its
// family file, and a published family must bind the module that calculated it.
const modules = { 'finish-times': 'insights_round.py', replay: 'insights_replay.py', archetypes: 'insights_archetypes.py',
  positions: 'insights_positions.py', demographics: 'insights_demographics.py', courses: 'insights_courses.py', kick: 'insights_kick.py' };
for (const [family, module] of Object.entries(modules)) {
  assert.equal(`${family}.json` in manifest.files, module in manifest.scripts, `${family}.json is published exactly when ${module} is bound`);
}
const families = new Map();
for (const [file, doc] of docs) {
  if (file === 'course-geometry.json') continue;
  const [first, second] = file.split('/'), family = second ? first : first.replace(/\.json$/, '');
  assert.equal(doc.family, family, `${file}: family label`);
  assert.equal(doc.release_tag, pin.tag, `${file}: release`);
  assert.equal(doc.runner_manifest_sha256, runnerSha, `${file}: exact runner manifest`);
  if (second) { assert.ok(`${family}.json` in manifest.files, `${file}: belongs to a listed family`); continue; }
  for (const key of ['schema_version', 'input_as_of', 'runner_manifest_as_of', 'eligible_records', 'analysis_n', 'duplicate_edition_screen']) {
    assert.deepEqual(doc[key], manifest[key], `${file}: shared provenance ${key}`);
  }
  assert.ok(typeof doc.method === 'string' && doc.method.length, `${file}: method copy`);
  families.set(family, doc);
}
const geometry = docs.get('course-geometry.json');
if (geometry) {
  assert.equal(geometry.schema_version, 1); assert.equal(geometry.release_tag, pin.tag); assert.equal(geometry.input_as_of, context.input_as_of);
  assert.equal(geometry.course_profiles_sha256, context.input_files['course_profiles.parquet'], 'Course profiles are the adopted context input');
  assert.equal(geometry.script_sha256, hash(fs.readFileSync(path.join(analysisDir, 'build_course_geometry.py'))), 'Stale course geometry script');
  assert.equal(geometry.context_manifest_sha256, contextSha, 'Course geometry binds the current context manifest');
  assert.ok(Number.isFinite(Date.parse(geometry.as_of)) && Array.isArray(geometry.courses) && geometry.courses.length);
  assert.equal(new Set(geometry.courses.map(course => course.city)).size, geometry.courses.length, 'One supplied route per city');
  for (const course of geometry.courses) {
    assert.equal(course.historical_validity_known, false, `${course.city}: route validity is never asserted`);
    assert.ok(course.route.length >= 2 && course.route.length === course.route_km.length && course.route_km[0] === 0);
    assert.ok(course.route.every(xy => xy.length === 2 && xy.every(v => v >= 0 && v <= 1)), `${course.city}: unit-box route`);
    assert.ok(course.route_km.every((km, i) => !i || km >= course.route_km[i - 1]), `${course.city}: route distances increase`);
    assert.equal(course.elevation_m.length, Math.floor(course.distance_km / course.elevation_step_km) + 1, `${course.city}: elevation samples`);
  }
}

// 8. Structure: finite numbers, published groups >= 100, no identifiers or names, clean copy.
const identityKey = /^(ids?|rids?|record_?ids?|profile_?ids?|runners?|runner_?ids?|bibs?|bib_?(no|number)|names?|(full|first|last|given|family)_?names?|participants?|participant_?ids?|persons?|person_?ids?)$/i;
// Group sizes: every `n`, plus the named matched-group sizes. Audit rows that carry a
// `reason` (screened or excluded editions) document removals and are not published groups.
const groupKey = key => key === 'n' || /^(women|men|young|older)_n$/.test(key) || key === 'n_comparison' || key === 'matched_weight';
const labelNames = new Set(families.get('archetypes')?.classifier?.names || []);
const copyStrings = new Map();
let scannedValues = 0;
function scan(value, where, key) {
  if (Array.isArray(value)) return value.forEach((item, i) => scan(item, `${where}[${i}]`, key));
  if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      if (identityKey.test(name)) {
        // Only the archetype labels may use a name field; anything else could carry a runner identity.
        const values = Array.isArray(item) ? item : [item];
        assert.ok(['name', 'names'].includes(name) && values.every(x => labelNames.has(x)), `${where}.${name}: record identifier or name field`);
      }
      if (groupKey(name) && typeof value.reason !== 'string') assert.ok(finite(item) && item >= MIN_CELL, `${where}.${name}: published group below ${MIN_CELL} finishes`);
      scan(item, `${where}.${name}`, name);
    }
    return;
  }
  scannedValues++;
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${where}: finite number`);
  if (typeof value === 'string') {
    if (key !== 'release_tag') assert.ok(!/private-export|20260912/.test(value), `${where}: copy cites an internal export label`);
    const normalised = normaliseName(value);
    if (normalised) copyStrings.set(normalised, where);
  }
}
for (const [file, doc] of [['manifest.json', manifest], ...docs]) scan(doc, file, null);

// 2. Cohort: stream every verified shard and rebuild the eligible finishes.
const editions = runners.editions, editionKey = (city, year) => `${city}\u0000${year}`;
const editionIndex = new Map(editions.map((edition, i) => [editionKey(edition.city, edition.year), i]));
assert.equal(editionIndex.size, editions.length, 'Editions are unique by city and year');
const screen = manifest.duplicate_edition_screen;
assert.deepEqual(screen.map(rule => [rule.city, rule.year, rule.duplicate_of]), [['Chicago', 2018, 2024], ['Chicago', 2019, 2024]], 'Documented duplicate-edition screen');
const duplicate = new Uint8Array(editions.length);
for (const rule of screen) {
  assert.ok(editionIndex.has(editionKey(rule.city, rule.year)) && editionIndex.has(editionKey(rule.city, rule.duplicate_of)), 'Screen matches exactly one edition and its source');
  duplicate[editionIndex.get(editionKey(rule.city, rule.year))] = 1;
}
const excluded = new Set(runners.source_quality.editions.map(row => editionKey(row.city, row.year)));
const capacity = runners.eligible_records;
const times = new Float64Array(capacity * 9), editionOf = new Uint16Array(capacity), genderOf = new Uint8Array(capacity);
const recordIds = new Float64Array(runners.raw_records), profileIds = new Float64Array(runners.profiles);
const sourceFiles = Object.keys(runners.shards).sort(), nameHits = [];
let raw = 0, profileCount = 0, eligible = 0, storyExactAge = 0;
assert.ok(sourceFiles.some(file => file.startsWith('profiles/')));
for (const file of sourceFiles) {
  assert.match(file, /^(profiles|index)\/[a-f0-9]{3}\.json\.gz$/);
  const bytes = fs.readFileSync(path.join(dataRoot, 'runners', file));
  assert.equal(bytes.length, runners.shards[file].bytes, `${file}: compressed bytes`);
  assert.equal(hash(bytes), runners.shards[file].sha256, `${file}: source checksum`);
  if (!file.startsWith('profiles/')) continue;
  const shard = JSON.parse(zlib.gunzipSync(bytes));
  assert.equal(shard.release_tag, pin.tag, `${file}: shard release`);
  for (const profile of shard.profiles) {
    assert.ok(profileCount < profileIds.length && integer(profile.id, 1), 'Valid profile ID and declared count');
    profileIds[profileCount++] = profile.id;
    for (const race of profile.races) {
      assert.ok(raw < recordIds.length && integer(race.id, 1), 'Valid record ID and declared count');
      recordIds[raw++] = race.id;
      if (typeof race.name === 'string' && copyStrings.has(normaliseName(race.name))) nameHits.push(copyStrings.get(normaliseName(race.name)));
      assert.ok(integer(race.edition) && race.edition < editions.length, 'Valid edition mapping');
      assert.equal(typeof race.eligible, 'boolean', 'Explicit source eligibility');
      if (!race.eligible) continue;
      const edition = editions[race.edition], t = race.times;
      assert.ok(!excluded.has(editionKey(edition.city, edition.year)), 'Reviewed source exclusions cannot contribute');
      assert.ok(eligible < capacity && Array.isArray(t) && t.length === 9 && t.every(finite) && t[8] >= 5400 && t[8] <= 43200, 'Eligible timing contract');
      for (let k = 0; k < 9; k++) {
        const pace = (t[k] - (k ? t[k - 1] : 0)) / lengths[k];
        assert.ok(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'Eligible section pace bounds');
      }
      times.set(t, eligible * 9);
      editionOf[eligible] = race.edition;
      genderOf[eligible] = genderCode(race.sex);
      if (!duplicate[race.edition] && exactAge(race.age)) storyExactAge++;
      eligible++;
    }
  }
}
assert.equal(raw, runners.raw_records, 'Complete source traversal');
assert.equal(profileCount, runners.profiles, 'Every candidate profile');
assert.equal(eligible, runners.eligible_records, 'Eligible finishes reconcile with the runner manifest');
for (const [label, ids] of [['record', recordIds], ['profile', profileIds]]) {
  ids.sort();
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `Unique ${label} IDs`);
}
assert.deepEqual(nameHits, [], 'Insights text matches a recorded runner name');

// Rows grouped by edition, keeping verified shard order (the builder's stable order).
const editionCount = new Uint32Array(editions.length), editionStart = new Uint32Array(editions.length + 1);
for (let i = 0; i < eligible; i++) editionCount[editionOf[i]]++;
for (let e = 0; e < editions.length; e++) editionStart[e + 1] = editionStart[e] + editionCount[e];
const byEdition = new Uint32Array(eligible), cursor = editionStart.slice(0, -1);
for (let i = 0; i < eligible; i++) byEdition[cursor[editionOf[i]]++] = i;
const rowsOf = e => byEdition.subarray(editionStart[e], editionStart[e + 1]);
const twinKey = i => Array.from(times.subarray(i * 9, i * 9 + 9), v => rint(v * 1000) / 1000).join(',');
let removed = 0;
for (const rule of screen) {
  const index = editionIndex.get(editionKey(rule.city, rule.year)), source = editionIndex.get(editionKey(rule.city, rule.duplicate_of));
  const target = new Set(Array.from(rowsOf(source), twinKey));
  let twins = 0;
  for (const i of rowsOf(index)) if (target.has(twinKey(i))) twins++;
  assert.equal(rule.eligible_removed, editionCount[index], `${rule.city} ${rule.year}: removed eligible finishes`);
  assert.equal(rule.identical_nine_time_twins, twins, `${rule.city} ${rule.year}: nine-time twins in ${rule.duplicate_of}`);
  assert.ok(editionCount[index] >= MIN_CELL && twins >= .95 * editionCount[index], `${rule.city} ${rule.year}: duplicate evidence`);
  removed += editionCount[index];
}
const storyN = eligible - removed, storyEditions = [], storyCount = new Uint32Array(editions.length), sexCounts = [0, 0, 0];
for (let e = 0; e < editions.length; e++) {
  if (duplicate[e] || !editionCount[e]) continue;
  storyEditions.push(e); storyCount[e] = editionCount[e];
  for (const i of rowsOf(e)) sexCounts[genderOf[i]]++;
}
assert.equal(manifest.analysis_n, storyN, 'Duplicate-edition screen yields the story cohort');
assert.deepEqual(manifest.cohort, {
  eligible, after_duplicate_screen: storyN, editions: storyEditions.length, cities: new Set(storyEditions.map(e => editions[e].city)).size,
  men: sexCounts[1], women: sexCounts[2], other_or_not_recorded: sexCounts[0], exact_age: storyExactAge,
}, 'Independent story cohort composition');

// Start-offset screen (shape stories): edition median r(0–5 km) − median r(5–10 km) above 10 points.
const R = new Float64Array(9), flagged = [];
for (const e of storyEditions) {
  const rows = rowsOf(e);
  if (rows.length < MIN_CELL) continue;
  const first = new Float64Array(rows.length), second = new Float64Array(rows.length);
  rows.forEach((i, j) => { relativePace(times, i * 9, R); first[j] = R[0]; second[j] = R[1]; });
  const gap = median(first) - median(second);
  if (gap > 10) flagged.push({ edition: e, city: editions[e].city, year: editions[e].year, finishes: rows.length, gap });
}
flagged.sort((a, b) => (a.city < b.city ? -1 : a.city > b.city ? 1 : 0) || a.year - b.year);
const flaggedSet = new Set(flagged.map(row => row.edition)), shapeEditions = storyEditions.filter(e => !flaggedSet.has(e));
const shapeN = sum(shapeEditions.map(e => storyCount[e]));
function eachRow(editionList, visit) { for (const e of editionList) for (const i of rowsOf(e)) visit(i, e); }

// 3. finish-times.json: one-minute histogram, marks and cliff indexes.
function checkFinishTimes(doc) {
  const all = new Float64Array(721), men = new Float64Array(721), women = new Float64Array(721);
  const lenses = doc.seconds.map(lens => ({ start: lens.minutes * 60 - 1500, bins: new Float64Array(300) }));
  const bubbles = doc.bubble.map(() => ({ over: [0, 0], under: [0, 0], premium: Array.from({ length: 24 }, () => [0, 0]) }));
  eachRow(storyEditions, i => {
    const o = i * 9, finish = times[o + 8], minute = Math.floor(finish / 60), sex = genderOf[i];
    all[minute]++;
    if (sex === 1) men[minute]++; else if (sex === 2) women[minute]++;
    for (const lens of lenses) if (finish >= lens.start && finish < lens.start + 3000) lens.bins[Math.floor((finish - lens.start) / 10)]++;
    const projected = times[o + 7] + 2.195 * (times[o + 7] - times[o + 6]) / 5;
    doc.bubble.forEach((bubble, b) => {
      const mark = bubble.minutes * 60, margin = projected - mark, under = finish < mark ? 1 : 0;
      if (margin >= 0 && margin < 120) { bubbles[b].over[0]++; bubbles[b].over[1] += under; }
      if (margin >= -120 && margin < 0) { bubbles[b].under[0]++; bubbles[b].under[1] += under; }
      const j = bandIndex(margin, -120, 15, 24);
      if (j >= 0) { bubbles[b].premium[j][0]++; bubbles[b].premium[j][1] += under; }
    });
  });
  assert.ok(Array.isArray(doc.histogram) && doc.histogram.length);
  doc.histogram.forEach((row, j) => {
    const minute = doc.histogram[0].minute + j;
    assert.deepEqual(row, { minute, all: all[minute], men: men[minute], women: women[minute] }, `Histogram minute ${minute}`);
  });
  const count = K => all[K];
  assert.ok(doc.marks.length && doc.marks.every((mark, j) => !j || mark.minutes > doc.marks[j - 1].minutes), 'Ordered marks');
  for (const mark of doc.marks) {
    const B = mark.minutes;
    assert.ok(integer(B, 4) && B + 3 <= 720 && mark.mark === clock(B) && mark.kind === markKind(B), `${mark.mark}: mark label`);
    assert.equal(mark.minute_before, all[B - 1], `${mark.mark}: minute before`);
    assert.equal(mark.minute_after, all[B], `${mark.mark}: minute after`);
    assert.equal(mark.women_minute_before, women[B - 1], `${mark.mark}: women in the minute before`);
    assert.equal(mark.women_ratio === null, women[B - 1] < MIN_CELL, `${mark.mark}: sparse women ratio withheld`);
    near(mark.cliff, cliffIndex(count, B), `${mark.mark}: cliff index`, 1e-4);
    assert.ok(finite(mark.ratio) && mark.ratio_ci95[0] <= mark.ratio_ci95[1], `${mark.mark}: ratio interval`);
  }
  const cliffs = [];
  for (let K = 140; K <= 400; K++) if (Math.min(...all.subarray(K - 3, K + 4)) >= MIN_CELL) cliffs.push(K);
  assert.deepEqual(doc.cliff_index.map(row => row.minute), cliffs, 'Cliff index minutes with at least 100 finishes in every window minute');
  for (const row of doc.cliff_index) {
    assert.equal(row.kind, markKind(row.minute));
    near(row.cliff, cliffIndex(count, row.minute), `Cliff index ${row.minute}`, 1e-4);
  }
  doc.seconds.forEach((lens, s) => {
    assert.equal(lens.mark, clock(lens.minutes));
    assert.deepEqual(lens.bins.map(bin => bin.offset_s), Array.from({ length: 60 }, (_, j) => 10 * j - 300));
    for (const bin of lens.bins) assert.equal(bin.n, lenses[s].bins[(bin.offset_s + 1500) / 10], `${lens.mark}${bin.offset_s}s: ten-second count`);
  });
  doc.bubble.forEach((bubble, b) => {
    const counts = bubbles[b];
    for (const side of ['over', 'under']) {
      assert.equal(bubble[side].n, counts[side][0], `${bubble.mark} ${side}: projected finishes`);
      near(bubble[side].share_under, counts[side][1] / counts[side][0], `${bubble.mark} ${side}: share under`, 1e-4);
    }
    const premium = counts.premium.map(([n, under], j) => ({ margin: 15 * j - 120, n, under })).filter(row => row.n >= MIN_CELL);
    assert.deepEqual(bubble.premium.map(row => [row.margin_s, row.n]), premium.map(row => [row.margin, row.n]), `${bubble.mark}: projected-margin rows`);
    bubble.premium.forEach((row, j) => near(row.share_under, premium[j].under / premium[j].n, `${bubble.mark} ${row.margin_s}s: share under`, 1e-4));
  });
  return { histogram_minutes: doc.histogram.length, marks: doc.marks.length, cliffs: cliffs.length };
}

// 4. archetypes.json: published nearest-centroid classifier and pacing sentences on the shape cohort.
function checkArchetypes(doc) {
  const classifier = doc.classifier, k6 = classifier.centroids.length;
  assert.deepEqual(classifier.section_km, lengths, 'Classifier section lengths');
  assert.ok([classifier.clip_lo, classifier.clip_hi, classifier.weights].every(row => row.length === 9 && row.every(finite)));
  assert.ok(classifier.clip_lo.every((lo, k) => lo < classifier.clip_hi[k]), 'Ordered clip limits');
  classifier.weights.forEach((weight, k) => near(weight, weights[k], `Classifier weight ${k}`, 5.1e-9));
  assert.ok(k6 >= 2 && classifier.centroids.every(row => row.length === 9 && row.every(finite)));
  assert.deepEqual(classifier.names, doc.archetypes.map(row => row.name)); assert.equal(new Set(classifier.names).size, k6);
  assert.deepEqual(doc.start_offset_editions.map(row => [row.city, row.year, row.finishes]), flagged.map(row => [row.city, row.year, row.finishes]),
    'Independent start-offset editions');
  doc.start_offset_editions.forEach((row, j) => near(row.median_gap_points, flagged[j].gap, `${row.city} ${row.year}: start gap`, .0051));
  const counts = new Float64Array(k6), slow = new Float64Array(k6), profile = Array.from({ length: k6 }, () => new Float64Array(9));
  const sentences = new Int32Array(3 ** 9), riverStarts = Array.from({ length: 16 }, (_, j) => 150 + 15 * j);
  const river = riverStarts.map(() => new Float64Array(k6));
  eachRow(shapeEditions, i => {
    const o = i * 9, label = nearest(relativePace(times, o, R), classifier);
    counts[label]++;
    for (let k = 0; k < 9; k++) profile[label][k] += R[k];
    if (sustained(times, o)) slow[label]++;
    sentences[sentence(R)]++;
    const band = bandIndex(times[o + 8] / 60, 150, 15, 16);
    if (band >= 0) river[band][label]++;
  });
  assert.equal(doc.cohort_n, shapeN, 'Shape cohort: story cohort without start-offset editions');
  assert.equal(sum(doc.archetypes.map(row => row.n)), doc.cohort_n, 'Archetypes partition the shape cohort');
  doc.archetypes.forEach((row, j) => {
    assert.equal(row.n, counts[j], `${row.name}: independently classified finishes`);
    near(row.share, counts[j] / shapeN, `${row.name}: share`, 1.1e-5);
    near(row.slowdown_share, slow[j] / counts[j], `${row.name}: sustained slowdown share`, 1.1e-5);
    row.profile.forEach((value, k) => near(value, profile[j][k] / counts[j], `${row.name}: mean relative pace ${k}`, 1e-3));
  });
  const ranked = [];
  let distinct = 0;
  sentences.forEach((n, code) => { if (n) distinct++; if (n >= MIN_CELL) ranked.push([code, n]); });
  ranked.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const published = doc.sentences.published;
  assert.ok(published.length >= Math.min(20, ranked.length), 'At least the top 20 sentences are published');
  assert.deepEqual(published.map(row => [row.sentence, row.n]), ranked.slice(0, published.length).map(([code, n]) => [decode(code), n]), 'Ranked pacing sentences');
  assert.equal(doc.sentences.total_distinct, distinct, 'Distinct pacing sentences');
  assert.equal(doc.sentences.published_n, sum(published.map(row => row.n)));
  assert.equal(doc.sentences.all_even_n, sentences[EVEN_SENTENCE], 'All-even sentence count');
  const bands = riverStarts.map((lo, j) => ({ lo, counts: river[j], n: sum([...river[j]]) })).filter(row => row.n >= MIN_CELL);
  assert.deepEqual(doc.river.map(row => [row.lo_min, row.label, row.n]), bands.map(row => [row.lo, `${clock(row.lo)}–${clock(row.lo + 15)}`, row.n]), 'Finish-band mix counts');
  doc.river.forEach((row, j) => row.shares.forEach((share, k) => near(share, bands[j].counts[k] / bands[j].n, `${row.label}: archetype ${k} share`, 1.1e-5)));
  return { cohort_n: shapeN, archetypes: k6, sentences_ranked: published.length, start_offset_editions: flagged.length };
}

// 5. positions.json: within-edition average clock ranks at 30 km and the finish.
function checkPositions(doc) {
  const list = shapeEditions.filter(e => storyCount[e] >= MIN_CELL), n = sum(list.map(e => storyCount[e]));
  assert.equal(doc.cohort_n, n, 'Positions cohort'); assert.equal(doc.editions_n, list.length, 'Positions editions');
  assert.equal(doc.start_offset_editions, flagged.length, 'Start-offset editions left out');
  let gained = 0, surgers = 0, sinkers = 0, women = 0, womenSurgers = 0, womenSinkers = 0;
  const genderRows = [];
  for (const e of list) {
    const rows = rowsOf(e), N = rows.length;
    const at30 = Float64Array.from(rows, i => times[i * 9 + 5]).sort(), atFinish = Float64Array.from(rows, i => times[i * 9 + 8]).sort();
    const sums = [0, 0, 0], counts = [0, 0, 0];
    for (const i of rows) {
      const gain = 100 * (averageRank(at30, times[i * 9 + 5]) - averageRank(atFinish, times[i * 9 + 8])) / (N - 1), sex = genderOf[i];
      if (gain > 0) gained++;
      if (gain >= 10) { surgers++; if (sex === 2) womenSurgers++; }
      if (gain <= -10) { sinkers++; if (sex === 2) womenSinkers++; }
      if (sex === 2) women++;
      sums[sex] += gain; counts[sex]++;
    }
    if (counts[2] >= MIN_CELL && counts[1] >= MIN_CELL) {
      genderRows.push({ city: editions[e].city, year: editions[e].year, women: sums[2] / counts[2], men: sums[1] / counts[1], women_n: counts[2], men_n: counts[1] });
    }
  }
  near(doc.gained_share, gained / n, 'Share gaining places after 30 km', 1e-4);
  near(doc.surger_share, surgers / n, 'Surger share', 1e-4); near(doc.sinker_share, sinkers / n, 'Sinker share', 1e-4);
  assert.equal(doc.surgers, surgers, 'Surgers'); assert.equal(doc.sinkers, sinkers, 'Sinkers');
  near(doc.women_share, women / n, 'Women share', 1e-4);
  near(doc.women_share_of_surgers, womenSurgers / surgers, 'Women share of surgers', 1e-4);
  near(doc.women_share_of_sinkers, womenSinkers / sinkers, 'Women share of sinkers', 1e-4);
  const key = row => [row.city, row.year, row.women_n, row.men_n];
  assert.deepEqual(doc.gender_editions.map(key), genderRows.map(key), 'Editions with at least 100 women and 100 men');
  doc.gender_editions.forEach((row, j) => {
    near(row.women, genderRows[j].women, `${row.city} ${row.year}: women mean points gained`, 1e-3);
    near(row.men, genderRows[j].men, `${row.city} ${row.year}: men mean points gained`, 1e-3);
  });
  assert.equal(doc.women_ahead_editions, genderRows.filter(row => row.women > row.men).length, 'Editions where women gain more places');
  return { cohort_n: n, editions: list.length, gender_editions: genderRows.length };
}

// 6. demographics.json: women and men matched within edition × whole finish minute.
function checkDemographics(doc) {
  const size = editions.length * 1000, fields = 10, cells = new Float64Array(size * fields); // [n, slowdown, block, kick, negative] × women, men
  let inRange = 0;
  eachRow(shapeEditions, (i, e) => {
    const o = i * 9, finish = times[o + 8], sex = genderOf[i];
    if (!(finish >= 9000 && finish < 21600 && (sex === 1 || sex === 2))) return;
    inRange++;
    const block = 100 * ((times[o + 7] - times[o + 3]) / times[o + 3] - 1);
    const base = (e * 1000 + Math.floor(finish / 60)) * fields + (sex === 2 ? 0 : 5);
    cells[base]++;
    cells[base + 1] += sustained(times, o) ? 1 : 0;
    cells[base + 2] += block;
    cells[base + 3] += (finish - times[o + 7]) / lengths[8] < times[o + 7] / 40 ? 1 : 0;
    cells[base + 4] += block < 0 ? 1 : 0;
  });
  const bandStarts = Array.from({ length: 21 }, (_, j) => 150 + 10 * j);
  const blank = () => ({ weight: 0, women_n: 0, men_n: 0, sums: new Float64Array(8) });
  const overall = blank(), bands = bandStarts.map(blank), matchedEditions = new Set();
  for (let c = 0; c < size; c++) {
    const o = c * fields, nW = cells[o], nM = cells[o + 5];
    if (!nW && !nM) continue;
    const minute = c % 1000, band = bandIndex(minute, 150, 10, 21), w = Math.min(nW, nM);
    for (const target of band >= 0 ? [overall, bands[band]] : [overall]) {
      target.women_n += nW; target.men_n += nM; target.weight += w;
      if (w) for (let k = 0; k < 4; k++) { target.sums[k] += w * cells[o + 1 + k] / nW; target.sums[4 + k] += w * cells[o + 6 + k] / nM; }
    }
    if (w) matchedEditions.add(Math.floor(c / 1000));
  }
  const rate = (target, k) => target.sums[k] / target.weight;
  assert.equal(doc.cohort_n, inRange, 'Women and men finishing 2:30–6:00 in the shape cohort');
  const o = doc.overall;
  assert.equal(o.matched_weight, overall.weight, 'Matched weight'); assert.equal(o.editions, matchedEditions.size, 'Matched editions');
  near(o.women_slowdown, rate(overall, 0), 'Matched women sustained slowdown', 1e-4); near(o.men_slowdown, rate(overall, 4), 'Matched men sustained slowdown', 1e-4);
  near(o.women_block, rate(overall, 1), 'Matched women 20–40 km block', 1e-3); near(o.men_block, rate(overall, 5), 'Matched men 20–40 km block', 1e-3);
  near(o.women_kick, rate(overall, 2), 'Matched women kick', 1e-4); near(o.men_kick, rate(overall, 6), 'Matched men kick', 1e-4);
  near(o.women_negative, rate(overall, 3), 'Matched women negative block', 1e-4); near(o.men_negative, rate(overall, 7), 'Matched men negative block', 1e-4);
  const expected = bandStarts.map((lo, j) => ({ lo, ...bands[j] })).filter(row => row.weight >= MIN_CELL);
  const key = row => [row.lo_min, row.label, row.matched_weight, row.women_n, row.men_n];
  assert.deepEqual(doc.bands.map(key), expected.map(row => [row.lo, `${clock(row.lo)}–${clock(row.lo + 10)}`, row.weight, row.women_n, row.men_n]), 'Matched ten-minute bands');
  doc.bands.forEach((row, j) => {
    near(row.women_slowdown, rate(expected[j], 0), `${row.label}: women slowdown`, 1e-4); near(row.men_slowdown, rate(expected[j], 4), `${row.label}: men slowdown`, 1e-4);
    near(row.women_block, rate(expected[j], 1), `${row.label}: women block`, 1e-3); near(row.men_block, rate(expected[j], 5), `${row.label}: men block`, 1e-3);
  });
  return { cohort_n: inRange, matched_weight: overall.weight, bands: expected.length };
}

// 7. replay: every sampled row is a whole-second eligible finish of its edition.
function replayRow(i) {
  const row = Array.from(times.subarray(i * 9, i * 9 + 9), rint);
  for (let k = 1; k < 9; k++) if (row[k] <= row[k - 1]) row[k] = row[k - 1] + 1;
  row.push(genderOf[i]);
  return row;
}
function checkReplay(doc) {
  const cities = new Set();
  let rowsChecked = 0;
  assert.ok(Array.isArray(doc.editions) && doc.editions.length, 'Replay editions');
  for (const entry of doc.editions) {
    const e = editionIndex.get(editionKey(entry.city, entry.year)), n = e === undefined ? 0 : storyCount[e];
    assert.ok(n > 0 && !cities.has(entry.city), `${entry.city} ${entry.year}: one story edition per replay city`);
    cities.add(entry.city);
    assert.equal(entry.race, editions[e].race);
    assert.ok(n >= 5000 && storyEditions.every(other => editions[other].city !== entry.city || storyCount[other] < n
      || storyCount[other] === n && editions[other].year <= entry.year), `${entry.slug}: largest eligible field of its city`);
    assert.equal(entry.slug, `${entry.city.toLowerCase().replace(/ /g, '-')}-${entry.year}`);
    assert.equal(entry.file, `replay/${entry.slug}.json`);
    assert.equal(entry.finishes, n, `${entry.slug}: eligible finishes`);
    assert.equal(entry.sample, Math.min(REPLAY_SAMPLE, n), `${entry.slug}: sample size`);
    const order = Array.from(rowsOf(e)).sort((a, b) => times[a * 9 + 8] - times[b * 9 + 8] || a - b);
    const finishes = Float64Array.from(order, i => times[i * 9 + 8]);
    near(entry.first_finish_s, finishes[0], `${entry.slug}: first finish`, .051);
    near(entry.median_finish_s, quantile(finishes, .5), `${entry.slug}: median finish`, .051);
    near(entry.last_finish_s, finishes[n - 1], `${entry.slug}: last finish`, .051);
    assert.deepEqual(entry.snapshots.map(row => row.clock_s), [1, 2, 3, 4, 5, 6].map(hour => hour * 3600));
    for (const row of entry.snapshots) near(row.finished_share, (bound(finishes, row.clock_s, true)) / n, `${entry.slug}: finished by ${row.clock_s}s`, 1e-4);
    const replay = docs.get(entry.file);
    assert.ok(replay, `${entry.file}: listed replay file`);
    assert.deepEqual(Object.keys(replay).sort(), ['city', 'family', 'finishes', 'release_tag', 'rows', 'runner_manifest_sha256', 'sample', 'slug', 'year']);
    for (const field of ['slug', 'city', 'year', 'finishes', 'sample']) assert.equal(replay[field], entry[field], `${entry.file}: ${field}`);
    assert.ok(replay.sample <= REPLAY_SAMPLE && replay.rows.length === replay.sample, `${entry.file}: sample rows`);
    const available = new Map();
    for (const i of order) { const key = replayRow(i).join(','); available.set(key, (available.get(key) || 0) + 1); }
    replay.rows.forEach((row, j) => {
      assert.ok(row.length === 10 && row.every(v => integer(v)) && [0, 1, 2].includes(row[9]), `${entry.file} row ${j}: nine whole seconds and a gender code`);
      assert.ok(row.slice(1, 9).every((v, k) => v > row[k]) && (j === 0 || row[8] >= replay.rows[j - 1][8]), `${entry.file} row ${j}: increasing times in finish order`);
      const key = row.join(','), left = available.get(key) || 0;
      assert.ok(left > 0, `${entry.file} row ${j}: not an eligible finish of ${entry.city} ${entry.year}`);
      available.set(key, left - 1);
    });
    // Evenly spaced finish-time ranks: np.round(np.linspace(0, n − 1, sample)) over the stable finish order.
    const step = (n - 1) / (entry.sample - 1);
    replay.rows.forEach((row, j) => assert.deepEqual(row, replayRow(order[j === entry.sample - 1 ? n - 1 : rint(j * step)]), `${entry.file} row ${j}: stratified rank`));
    rowsChecked += replay.rows.length;
  }
  assert.deepEqual(listed.filter(file => file.startsWith('replay/')), doc.editions.map(entry => entry.file).sort(), 'Every replay sample file is indexed');
  return { editions: doc.editions.length, rows: rowsChecked };
}

const checkers = { 'finish-times': checkFinishTimes, archetypes: checkArchetypes, positions: checkPositions, demographics: checkDemographics, replay: checkReplay };
const recounted = {}, genericOnly = [];
for (const [family, doc] of families) {
  if (checkers[family]) recounted[family] = checkers[family](doc); else genericOnly.push(family);
}
assert.ok('finish-times' in recounted && 'replay' in recounted, 'Core story families are present');
console.log(JSON.stringify({
  verified: 'insights', release_tag: pin.tag, input: input.startsWith(root + path.sep) ? path.relative(root, input) : input, files: listed.length, scanned_values: scannedValues,
  source_shards: sourceFiles.length, raw_records: raw, eligible_records: eligible, story_n: storyN, shape_n: shapeN,
  start_offset_editions: flagged.length, recounted, generic_only: genericOnly, unbound_modules: unboundModules, course_geometry: Boolean(geometry),
  seconds: Math.round((Date.now() - started) / 100) / 10,
}));
