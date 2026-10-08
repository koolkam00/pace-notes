// Independent reconciliation of the Pace Notes story analyses (public/data/insights).
// It does not import the Python builders or trust their cohorts: the eligible
// finishes are rebuilt from the checksum-verified runner shards and held once in
// bounded typed arrays (one Float64Array of nine cumulative times per finish).
// Families without a recount here (for example a later kick.json)
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
const mean = values => sum(values) / values.length;
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// Sorts a (sub)array in place and returns np.median (the mean of the two middle values for even n).
function sortedMedian(values) {
  values.sort();
  const half = values.length >> 1;
  return values.length % 2 ? values[half] : (values[half - 1] + values[half]) / 2;
}
// Python str.strip().casefold() for race names (upper then lower also folds ß and final sigma).
const foldName = text => text.trim().toUpperCase().toLowerCase();
// np.polyfit(x, y, 1) slope with R² about the mean (insights_courses.pooled_fit).
function pooledFit(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) ** 2; syy += (y[i] - my) ** 2; });
  const slope = sxy / sxx;
  return { slope, r2: 1 - sum(x.map((v, i) => (y[i] - my - slope * (v - mx)) ** 2)) / syy };
}
// Course-demeaned OLS with one regressor (insights_courses.Within): groups are [x values, y values] per course.
function withinFit(groups) {
  const X = [], Y = [];
  for (const [xs, ys] of groups) {
    const mx = mean(xs), my = mean(ys);
    xs.forEach((v, i) => { X.push(v - mx); Y.push(ys[i] - my); });
  }
  const slope = sum(X.map((v, i) => v * Y[i])) / sum(X.map(v => v * v));
  return { slope, r2: 1 - sum(X.map((v, i) => (Y[i] - slope * v) ** 2)) / sum(Y.map(v => v * v)) };
}
// insights_replay.position: distance at a clock time, at constant speed within each recorded section.
const KM = [0, ...points];
function position(times, o, clockS) {
  if (clockS >= times[o + 8]) return 42.195;
  let j = 0;
  while (times[o + j] <= clockS) j++;
  const start = j ? times[o + j - 1] : 0;
  return KM[j] + (clockS - start) / (times[o + j] - start) * (KM[j + 1] - KM[j]);
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
assert.equal(sortedMedian(Float64Array.from([4, 1, 3, 2])), 2.5); assert.equal(sortedMedian(Float64Array.from([5, 1, 3])), 3);
assert.equal(foldName(' Straße Marathon '), foldName('STRASSE marathon'), 'Race names compare trimmed and case-folded');
const lineFit = pooledFit([1, 2, 3, 4], [3, 5, 7, 9]);
near(lineFit.slope, 2, 'Pooled slope of an exact line', 1e-12); near(lineFit.r2, 1, 'Pooled R² of an exact line', 1e-12);
const shiftedFit = withinFit([[[1, 2, 3], [10, 13, 16]], [[5, 7], [0, 6]], [[4], [99]]]);
near(shiftedFit.slope, 3, 'Course intercepts and a single-edition course do not move the within slope', 1e-12); near(shiftedFit.r2, 1, 'Within R²', 1e-12);
near(position(even, 0, 300 * 21.0975), 21.0975, 'Even runner at half the finish clock', 1e-9);
near(position(even, 0, 300 * 41), 41, 'Position inside the final 2.195 km section', 1e-9);
assert.equal(position(even, 0, even[8]), 42.195, 'Finished runners stand at 42.195 km');

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
  assert.match(file, /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?\.json$|^tools\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}\.json$/, `${file}: published path`);
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
// Runner tools: family 'tool-x' publishes tools/x.json (an index listing every shard under tools/x/ with its SHA-256).
const toolModules = { 'tool-projector': ['tools/projector.json', 'insights_tool_projector.py'], 'tool-pace-band': ['tools/pace-band.json', 'insights_tool_paceband.py'],
  'tool-weather-match': ['tools/weather-match.json', 'insights_tool_weather.py'], 'tool-course-goal': ['tools/course-goal.json', 'insights_tool_coursegoal.py'] };
for (const [family, [file, module]] of Object.entries(toolModules)) {
  assert.equal(file in manifest.files, module in manifest.scripts, `${file} is published exactly when ${module} is bound`);
}
const familyOf = file => {
  const parts = file.split('/');
  if (parts[0] === 'tools') return { family: `tool-${parts[1].replace(/\.json$/, '')}`, index: `tools/${parts[1].replace(/\.json$/, '')}.json`, shard: parts.length > 2 };
  return { family: parts[1] ? parts[0] : parts[0].replace(/\.json$/, ''), index: `${parts[0].replace(/\.json$/, '')}.json`, shard: parts.length > 1 };
};
const families = new Map();
for (const [file, doc] of docs) {
  if (file === 'course-geometry.json') continue;
  const { family, index, shard } = familyOf(file);
  assert.equal(doc.family, family, `${file}: family label`);
  assert.equal(doc.release_tag, pin.tag, `${file}: release`);
  assert.equal(doc.runner_manifest_sha256, runnerSha, `${file}: exact runner manifest`);
  if (shard) {
    assert.ok(index in manifest.files, `${file}: belongs to a listed family`);
    if (family.startsWith('tool-')) assert.equal(docs.get(index).shards?.[file], manifest.files[file].sha256, `${file}: listed with its SHA-256 in ${index}`);
    continue;
  }
  if (family.startsWith('tool-')) {
    const listedShards = Object.keys(doc.shards || {}), onDisk = listed.filter(f => f.startsWith(file.replace(/\.json$/, '/')));
    assert.deepEqual(listedShards.sort(), onDisk.sort(), `${file}: index lists exactly its shards`);
  }
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
      if (name === 'id' && where.startsWith('tools/weather-match.json.editions[')) {
        assert.equal(item, Number(where.match(/\[(\d+)\]$/)[1]), `${where}.id: edition row index`);
      } else if (identityKey.test(name)) {
        // Only the archetype labels may use a name field; anything else could carry a runner identity.
        const values = Array.isArray(item) ? item : [item];
        assert.ok(['name', 'names'].includes(name) && values.every(x => labelNames.has(x)), `${where}.${name}: record identifier or name field`);
      }
      if (groupKey(name) && typeof value.reason !== 'string') {
        // Tool shards store column arrays: one entry per published cell.
        const values = Array.isArray(item) ? item : [item];
        assert.ok(values.length && values.every(x => finite(x) && x >= MIN_CELL), `${where}.${name}: published group below ${MIN_CELL} finishes`);
      }
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
// Clock moments, emptying course, even-pace ghosts and the 10 km pack, each on the edition's full field.
function checkReplayFields(entry, list, finishes) {
  const n = list.length, slug = entry.slug, M = entry.moments, first = finishes[0], minutes = new Uint32Array(721);
  let not20 = 0, not10 = 0, past30 = 0, back = Infinity;
  for (const i of list) {
    const o = i * 9;
    if (times[o + 3] > first) not20++;
    if (times[o + 1] > first) not10++;
    if (times[o + 5] <= first) past30++;
    back = Math.min(back, position(times, o, first));
    minutes[Math.floor(times[o + 8] / 60)]++;
  }
  let peak = 0;
  for (let m = 1; m < minutes.length; m++) if (minutes[m] > minutes[peak]) peak = m;
  near(M.first_finish_s, first, `${slug} moments: first finish`, .051);
  assert.deepEqual([M.not_past_20_at_first, M.not_past_10_at_first, M.past_30_at_first], [not20, not10, past30],
    `${slug} moments: runners not past 20 km, not past 10 km and past 30 km when the first runner finishes`);
  near(M.back_km_at_first, back, `${slug} moments: back of the field at the first finish`, .0051);
  const half = finishes[Math.ceil(n / 2) - 1];
  near(M.half_home_s, half, `${slug} moments: half the field home`, .051);
  near(M.half_home_ratio, half / first, `${slug} moments: half-home against first-finish ratio`, 5.1e-4);
  assert.deepEqual(Object.keys(M.finish_quantiles_s), ['0.01', '0.1', '0.5', '0.9', '0.99'], `${slug} moments: finish quantile keys`);
  for (const q of [.01, .1, .5, .9, .99]) near(M.finish_quantiles_s[String(q)], quantile(finishes, q), `${slug} moments: finish quantile ${q}`, .051);
  assert.deepEqual([M.peak_minute, M.peak_minute_n, M.minute_240_n], [peak, minutes[peak], minutes[240]],
    `${slug} moments: busiest finish minute (ties to the earliest), its count and the 4:00 minute`);

  // Emptying course: runners still out at each clock time, their current and whole-race speeds.
  const clocks = [600, ...Array.from({ length: 13 }, (_, h) => (h + 2) * 1800)], expected = [];
  for (const clockS of clocks) {
    let out = 0, current = 0, whole = 0;
    for (const i of list) {
      const o = i * 9;
      if (!(times[o + 8] > clockS)) continue;
      let j = 0;
      while (times[o + j] <= clockS) j++;
      out++;
      current += lengths[j] / (times[o + j] - (j ? times[o + j - 1] : 0)) * 3600;
      whole += 42.195 / times[o + 8] * 3600;
    }
    if (out < MIN_CELL) break;
    expected.push({ clock_s: clockS, on_course: out, current: current / out, whole: whole / out });
  }
  assert.deepEqual(entry.composition.map(row => [row.clock_s, row.on_course]), expected.map(row => [row.clock_s, row.on_course]),
    `${slug} composition: runners still on course at each clock time (until fewer than ${MIN_CELL})`);
  const base = entry.composition[0];
  entry.composition.forEach((row, j) => {
    near(row.current_kmh, expected[j].current, `${slug} composition ${row.clock_s}s: current speed`, 5.1e-4);
    near(row.whole_race_kmh, expected[j].whole, `${slug} composition ${row.clock_s}s: whole-race speed`, 5.1e-4);
    if (!j) return assert.ok(!('composition_share' in row), `${slug} composition: the first clock is the baseline`);
    const drop = base.current_kmh - row.current_kmh;
    if (drop > .05) near(row.composition_share, (base.whole_race_kmh - row.whole_race_kmh) / drop, `${slug} composition ${row.clock_s}s: composition share`, 5.1e-5);
    else assert.equal(row.composition_share, null, `${slug} composition ${row.clock_s}s: share withheld while speeds barely drop`);
  });

  // Even-pace ghosts: share of the field strictly ahead of each ghost at every checkpoint.
  assert.deepEqual(entry.ghosts.map(ghost => ghost.target_s), Array.from({ length: 15 }, (_, j) => (150 + 15 * j) * 60), `${slug} ghosts: targets`);
  for (const ghost of entry.ghosts) {
    const target = ghost.target_s, limits = points.map(km => target * km / 42.195), ahead = new Array(9).fill(0), ratios = [];
    const label = `${slug} ${clock(target / 60)} ghost`;
    for (const i of list) {
      const o = i * 9;
      for (let k = 0; k < 9; k++) if (times[o + k] < limits[k]) ahead[k]++;
      if (Math.abs(times[o + 8] - target) <= 150) ratios.push(times[o + 3] / times[o + 8]);
    }
    assert.equal(ghost.ahead.length, 9, `${label}: nine checkpoints`);
    ghost.ahead.forEach((share, k) => near(share, ahead[k] / n, `${label}: share ahead at ${points[k]} km`, 5.1e-5));
    assert.equal(ghost.net_passes, ahead[0] - ahead[8], `${label}: net passes (ahead at 5 km minus ahead at the finish)`);
    near(ghost.even_20km_s, target * 20 / 42.195, `${label}: even 20 km time`, .051);
    if (ratios.length >= MIN_CELL) {
      assert.equal(ghost.near_n, ratios.length, `${label}: finishes within 150 s of the target`);
      near(ghost.typical_20km_s, median(ratios) * target, `${label}: typical-shape 20 km time`, .051);
    } else assert.ok(ghost.near_n === null && ghost.typical_20km_s === null, `${label}: sparse typical shape withheld`);
  }

  // The 30-second clock pack around the median 10 km time.
  const start = Math.floor(quantile(Float64Array.from(list, i => times[i * 9 + 1]).sort(), .5) / 30) * 30;
  const members = Array.from(list).filter(i => Math.floor(times[i * 9 + 1] / 30) * 30 === start), P = entry.pack;
  assert.deepEqual([P.checkpoint_km, P.window_start_s, P.n], [10, start, members.length], `${slug} pack: 30-second bin of the median 10 km time and its size`);
  assert.deepEqual(P.quantiles.map(row => row.km), points, `${slug} pack: checkpoints`);
  P.quantiles.forEach((row, k) => {
    const column = Float64Array.from(members, i => times[i * 9 + k]).sort();
    for (const [key, q] of [['p10_s', .1], ['p50_s', .5], ['p90_s', .9]]) near(row[key], quantile(column, q), `${slug} pack ${row.km} km: ${key}`, .051);
    if (k === 8) near(P.finish_window_min, (quantile(column, .9) - quantile(column, .1)) / 60, `${slug} pack: finish window`, .0051);
  });
  return { composition_rows: expected.length, ghosts: entry.ghosts.length, pack_n: members.length };
}
// Field stretch: P90/P10 of the 20–40 km block against P90/P10 of the 20 km time, editions of at least 1,000 outside the start-offset screen.
function checkStretch(S) {
  const expected = [];
  for (const e of shapeEditions) {
    const list = rowsOf(e);
    if (list.length < 1000) continue;
    const a = Float64Array.from(list, i => times[i * 9 + 3]).sort(), b = Float64Array.from(list, i => times[i * 9 + 7] - times[i * 9 + 3]).sort();
    expected.push({ city: editions[e].city, year: editions[e].year, n: list.length, value: (quantile(b, .9) / quantile(b, .1)) / (quantile(a, .9) / quantile(a, .1)) });
  }
  assert.deepEqual(S.editions.map(row => [row.city, row.year, row.n]), expected.map(row => [row.city, row.year, row.n]),
    'Stretch editions: at least 1,000 finishes, start-offset editions left out');
  S.editions.forEach((row, j) => near(row.stretch, expected[j].value, `${row.city} ${row.year}: stretch`, 5.1e-5));
  const wider = expected.filter(row => row.value > 1).length;
  assert.equal(S.wider_after_20, wider, 'Stretch: editions wider after 20 km');
  near(S.mean, mean(expected.map(row => row.value)), 'Stretch: mean across editions', 1.1e-4);
  const values = S.editions.map(row => row.stretch);
  assert.deepEqual(S.min, S.editions.find(row => row.stretch === Math.min(...values)), 'Stretch: narrowest edition');
  assert.deepEqual(S.max, S.editions.find(row => row.stretch === Math.max(...values)), 'Stretch: widest edition');
  return { editions: expected.length, wider_after_20: wider };
}
function checkReplay(doc) {
  const cities = new Set(), fields = [];
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
    fields.push(checkReplayFields(entry, rowsOf(e), finishes));
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
  return {
    editions: doc.editions.length, rows: rowsChecked, moments: fields.length, composition_rows: sum(fields.map(x => x.composition_rows)),
    ghosts: sum(fields.map(x => x.ghosts)), packs: fields.length, stretch: checkStretch(doc.stretch),
  };
}

// 9. courses.json: edition table, course curves, weather pairing and fits, matched 5–20 km pace bands and the years.
const MATCH_BANDS = [[240, 270], [270, 300], [300, 330], [330, 360], [360, 420]]; // 5–20 km pace, s/km
// Weather rows from the runner-context shards, verified against the bound context manifest.
function contextWeather(list) {
  assert.deepEqual(Object.keys(context.editions).sort((a, b) => a - b), editions.map((_, e) => String(e)), 'Context shards cover every edition');
  const out = new Map();
  for (const e of list) {
    const item = context.editions[String(e)], edition = editions[e];
    assert.equal(item.file, `editions/${String(e).padStart(3, '0')}.json.gz`, `Context shard path for edition ${e}`);
    const bytes = fs.readFileSync(path.join(dataRoot, 'runner-context', item.file));
    assert.equal(bytes.length, item.bytes, `${item.file}: context bytes`);
    assert.equal(hash(bytes), item.sha256, `${item.file}: context checksum`);
    const shard = JSON.parse(zlib.gunzipSync(bytes)), w = shard.weather;
    assert.equal(shard.release_tag, pin.tag, `${item.file}: context release`);
    assert.deepEqual(shard.edition, { index: e, ...edition }, `${item.file}: context edition identity`);
    assert.ok(w === null || w.city === edition.city && w.year === edition.year && finite(w.temp_c) && typeof w.weather_race === 'string'
      && w.personal_exposure === false, `${item.file}: weather row for its edition`);
    out.set(e, w);
  }
  return out;
}
function checkCourses(doc) {
  // Edition table: story editions with at least 100 finishes, in edition order (insights_courses.edition_rows).
  const largest = Math.max(...storyEditions.map(e => storyCount[e]));
  const finishBuffer = new Float64Array(largest), curveBuffers = Array.from({ length: 9 }, () => new Float64Array(largest));
  const rows = [];
  for (const e of storyEditions) {
    const list = rowsOf(e), n = list.length, shape = !flaggedSet.has(e);
    if (n < MIN_CELL) continue;
    const bands = MATCH_BANDS.map(() => ({ n: 0, slow: 0, baseline: 0 }));
    let slow = 0;
    list.forEach((i, j) => {
      const o = i * 9, hit = sustained(times, o) ? 1 : 0, baseline = (times[o + 3] - times[o]) / 15;
      finishBuffer[j] = times[o + 8];
      slow += hit;
      if (shape) { relativePace(times, o, R); for (let k = 0; k < 9; k++) curveBuffers[k][j] = R[k]; }
      const b = MATCH_BANDS.findIndex(([lo, hi]) => baseline >= lo && baseline < hi);
      if (b >= 0) { bands[b].n++; bands[b].slow += hit; bands[b].baseline += baseline; }
    });
    rows.push({ e, city: editions[e].city, year: editions[e].year, race: editions[e].race ?? '', n, shape, bands,
      median: sortedMedian(finishBuffer.subarray(0, n)), slowdown: slow / n,
      curve: shape ? curveBuffers.map(buffer => sortedMedian(buffer.subarray(0, n))) : null });
  }
  const cities = [...new Set(rows.map(p => p.city))].sort(byText), sections = doc.sections;
  assert.equal(sections.length, 9, 'Nine section labels');
  assert.deepEqual(doc.edition_cohort, { editions: rows.length, courses: cities.length, finishes: sum(rows.map(p => p.n)) },
    'Courses edition cohort: story editions with at least 100 finishes');

  // Course curves: mean of each course's shape-edition median relative-pace curves; typical curve = median across courses.
  const shape = rows.filter(p => p.shape), shapeCities = [...new Set(shape.map(p => p.city))].sort(byText);
  assert.deepEqual([doc.shape_cohort.editions, doc.shape_cohort.courses, doc.shape_cohort.finishes], [shape.length, shapeCities.length, sum(shape.map(p => p.n))],
    'Courses shape cohort: edition cohort without start-offset editions');
  assert.deepEqual(doc.shape_cohort.start_offset_editions.map(row => [row.city, row.year, row.finishes]), flagged.map(row => [row.city, row.year, row.finishes]),
    'Courses start-offset editions');
  const cityCurve = new Map(shapeCities.map(c => {
    const g = shape.filter(p => p.city === c);
    return [c, Array.from({ length: 9 }, (_, k) => mean(g.map(p => p.curve[k])))];
  }));
  const typical = Array.from({ length: 9 }, (_, k) => median(shapeCities.map(c => cityCurve.get(c)[k])));
  assert.equal(doc.typical_curve.length, 9, 'Typical curve has nine sections');
  doc.typical_curve.forEach((v, k) => near(v, typical[k], `Typical course curve ${sections[k]} km`, 5.1e-4));
  const cityFinishes = new Map();
  for (const e of storyEditions) cityFinishes.set(editions[e].city, (cityFinishes.get(editions[e].city) || 0) + storyCount[e]);
  assert.deepEqual(doc.courses.map(course => course.city), [...cities].sort((a, b) => cityFinishes.get(b) - cityFinishes.get(a)),
    'Courses: one entry per course, ordered by eligible finishes');
  for (const course of doc.courses) {
    const c = course.city, g = rows.filter(p => p.city === c), gs = g.filter(p => p.shape);
    assert.deepEqual([course.race, course.finishes, course.editions, course.years, course.shape_editions],
      [g[g.length - 1].race, cityFinishes.get(c), g.length, g.map(p => p.year), gs.length], `${c}: race, finishes (all editions), editions, years and shape editions`);
    near(course.median_s, mean(g.map(p => p.median)), `${c}: mean edition median finish`, .5 + 1e-6);
    near(course.slowdown, mean(g.map(p => p.slowdown)), `${c}: mean edition sustained slowdown share`, 5.1e-5);
    assert.equal('curve' in course && 'deviation' in course, gs.length > 0, `${c}: a curve is published exactly when the course has shape editions`);
    if (!gs.length) continue;
    const curve = cityCurve.get(c);
    assert.ok(course.curve.length === 9 && course.deviation.length === 9, `${c}: nine-section curve and deviation`);
    curve.forEach((v, k) => {
      near(course.curve[k], v, `${c} ${sections[k]} km: course curve (mean of edition medians)`, 5.1e-3);
      near(course.deviation[k], v - typical[k], `${c} ${sections[k]} km: deviation from the typical curve`, 5.1e-3);
    });
  }

  // Weather editions: a valid modelled weather row whose race name (trimmed, case-folded) is the edition's race.
  const weather = contextWeather(rows.map(p => p.e));
  for (const p of rows) {
    const w = weather.get(p.e);
    p.weather = w && foldName(w.weather_race) === foldName(p.race) ? w : null;
    p.reason = !w ? 'No valid weather row' : p.weather ? null : 'Weather race name differs';
  }
  const W = doc.weather, weatherRows = rows.filter(p => p.weather), weatherCities = [...new Set(weatherRows.map(p => p.city))].sort(byText);
  assert.deepEqual(W.cohort, { editions: weatherRows.length, courses: weatherCities.length, finishes: sum(weatherRows.map(p => p.n)) }, 'Weather cohort');
  const weatherExclusions = rows.filter(p => p.reason).map(p => [p.city, p.year, p.n, p.reason]).sort((a, b) => byText(a[0], b[0]) || a[1] - b[1]);
  assert.deepEqual(W.excluded.filter(x => x.reason !== 'Fewer than 100 finishes').map(x => [x.city, x.year, x.n, x.reason]), weatherExclusions,
    'Weather exclusions among editions with at least 100 finishes');
  for (const x of W.excluded.filter(row => row.reason === 'Fewer than 100 finishes')) {
    const e = editionIndex.get(editionKey(x.city, x.year));
    assert.ok(e !== undefined && storyCount[e] === x.n && x.n < MIN_CELL, `${x.city} ${x.year}: listed as under ${MIN_CELL} finishes`);
  }
  assert.deepEqual(W.editions.map(x => [x.city, x.year, x.n]), weatherRows.map(p => [p.city, p.year, p.n]), 'Weather editions');
  W.editions.forEach((x, j) => {
    const p = weatherRows[j];
    near(x.temp, p.weather.temp_c, `${p.city} ${p.year}: weather temperature`, .05 + 1e-9);
    near(x.slowdown, p.slowdown, `${p.city} ${p.year}: weather-edition slowdown share`, 5.1e-5);
    // The builder rounds (median / 60) * 60 here, so an exact .5 median may round either way (Dubai 2016: 15594.5 s).
    near(x.median_s, p.median, `${p.city} ${p.year}: weather-edition median finish`, .5 + 1e-6);
  });
  const temps = weatherRows.map(p => p.weather.temp_c), slowPoints = weatherRows.map(p => 100 * p.slowdown);
  near(W.mean_start_temp, mean(temps), 'Mean start temperature of weather editions', .005 + 1e-9);

  // Within-course pairs at least 5 °C apart: did the hotter edition slow more?
  const pairs = [];
  for (const c of weatherCities) {
    const g = weatherRows.filter(p => p.city === c).sort((a, b) => a.year - b.year);
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      if (!(Math.abs(g[i].weather.temp_c - g[j].weather.temp_c) >= 5)) continue;
      const [hot, cool] = g[i].weather.temp_c > g[j].weather.temp_c ? [g[i], g[j]] : [g[j], g[i]];
      pairs.push({ city: c, hot, cool, hit: 100 * hot.slowdown > 100 * cool.slowdown });
    }
  }
  const agree = pairs.filter(x => x.hit).length;
  assert.equal(W.pairs.min_gap_c, 5, 'Weather pair gap');
  assert.equal(W.pairs.total, pairs.length, 'Weather pairs: same-course editions at least 5 °C apart');
  assert.equal(W.pairs.hotter_slowed_more, agree, 'Weather pairs where the hotter edition slowed more');
  assert.deepEqual(W.pairs.list.map(x => [x.city, x.hot_year, x.cool_year, x.hotter_slowed_more]), pairs.map(x => [x.city, x.hot.year, x.cool.year, x.hit]),
    'Weather pair list');
  W.pairs.list.forEach((x, j) => {
    const label = `${x.city} ${x.hot_year}/${x.cool_year} pair`, { hot, cool } = pairs[j];
    near(x.hot_temp, hot.weather.temp_c, `${label}: hot temperature`, .05 + 1e-9); near(x.cool_temp, cool.weather.temp_c, `${label}: cool temperature`, .05 + 1e-9);
    near(x.hot_slowdown, hot.slowdown, `${label}: hot slowdown`, 5.1e-5); near(x.cool_slowdown, cool.slowdown, `${label}: cool slowdown`, 5.1e-5);
  });

  // Slowdown (percent) on start temperature: pooled across editions, and course-demeaned.
  const across = pooledFit(temps, slowPoints), A = W.fits.slowdown_across;
  assert.equal(A.editions, weatherRows.length, 'Across-edition fit editions');
  near(A.slope, across.slope, 'Across-edition slowdown slope (points per °C)', 1e-4); near(A.r2, across.r2, 'Across-edition slowdown R²', 1e-4);
  const within = withinFit(weatherCities.map(c => {
    const g = weatherRows.filter(p => p.city === c);
    return [g.map(p => p.weather.temp_c), g.map(p => 100 * p.slowdown)];
  })), V = W.fits.slowdown_within;
  assert.deepEqual([V.editions, V.courses], [weatherRows.length, weatherCities.length], 'Within-course fit editions and courses');
  near(V.slope, within.slope, 'Within-course slowdown slope (points per °C)', 1e-4); near(V.r2, within.r2, 'Within-course slowdown R²', 1e-4);
  assert.ok(V.ci95[0] < within.slope && within.slope < V.ci95[1], `Within-course slope ${within.slope} lies inside its course-bootstrap interval [${V.ci95}]`);

  // Matched first 20 km: edition × 5–20 km pace band cells of at least 100, editions weighted equally.
  assert.deepEqual(doc.matched.map(band => [band.lo_s, band.hi_s]), MATCH_BANDS, 'Matched 5–20 km pace bands');
  const matchedCourses = {};
  doc.matched.forEach((band, b) => {
    const expected = new Map();
    for (const p of rows) if (p.bands[b].n >= MIN_CELL) expected.set(p.city, [...expected.get(p.city) || [], p.bands[b]]);
    assert.deepEqual(band.courses.map(course => course.city).sort(byText), [...expected.keys()].sort(byText), `${band.label}: courses with an edition cell of at least ${MIN_CELL}`);
    band.courses.forEach((course, j) => {
      const cells = expected.get(course.city), label = `${band.label} ${course.city}`;
      assert.deepEqual([course.editions, course.finishes], [cells.length, sum(cells.map(x => x.n))], `${label}: matched editions and finishes`);
      near(course.slowdown, mean(cells.map(x => x.slow / x.n)), `${label}: mean edition-cell slowdown share`, 5.1e-5);
      near(course.mean_baseline_s, mean(cells.map(x => x.baseline / x.n)), `${label}: mean 5–20 km pace`, .05 + 1e-6);
      const previous = band.courses[j - 1];
      assert.ok(!j || previous.slowdown < course.slowdown || previous.slowdown === course.slowdown && previous.city < course.city, `${label}: ordered by slowdown`);
    });
    matchedCourses[band.lo_s] = band.courses.length;
  });

  // Identification: the tested pool is every shape edition of a course with at least three, and the tallies follow the published predictions.
  const I = doc.identification, shapeCount = new Map(shapeCities.map(c => [c, shape.filter(p => p.city === c).length]));
  const pool = shape.filter(p => shapeCount.get(p.city) >= 3), poolCities = [...new Set(pool.map(p => p.city))].sort(byText);
  assert.deepEqual(I.editions.map(x => [x.city, x.year, x.n]), pool.map(p => [p.city, p.year, p.n]), 'Identification: shape editions of courses with at least three');
  assert.deepEqual([I.editions_tested, I.courses], [pool.length, poolCities.length], 'Identification: editions and courses tested');
  I.editions.forEach(x => assert.ok(poolCities.includes(x.predicted) && integer(x.rank, 1) && x.rank <= poolCities.length && (x.rank === 1) === (x.predicted === x.city),
    `${x.city} ${x.year}: prediction is a tested course and rank 1 means correct`));
  assert.equal(I.correct, I.editions.filter(x => x.predicted === x.city).length, 'Identification: correct = editions predicted as their own course');
  assert.equal(I.top3, I.editions.filter(x => x.rank <= 3).length, 'Identification: top three');
  near(I.chance, 1 / poolCities.length, 'Identification: chance rate', 5.1e-5);
  const perCourse = poolCities.map(c => ({ city: c, editions: I.editions.filter(x => x.city === c).length, correct: I.editions.filter(x => x.city === c && x.predicted === c).length }));
  assert.deepEqual(I.per_course, perCourse, 'Identification per course');
  assert.deepEqual([sum(I.per_course.map(x => x.editions)), sum(I.per_course.map(x => x.correct))], [I.editions_tested, I.correct], 'Identification per-course sums');
  for (const course of doc.courses) {
    const ident = perCourse.find(x => x.city === course.city);
    assert.deepEqual(course.identified, ident && { editions: ident.editions, correct: ident.correct }, `${course.city}: identification tally`);
  }

  // Years: edition cells, and per-year rows with a pooled median over every story finish of the year.
  assert.deepEqual(doc.years.cells.map(cell => [cell.city, cell.year, cell.n]), rows.map(p => [p.city, p.year, p.n]), 'Year cells: one per edition with at least 100 finishes');
  doc.years.cells.forEach((cell, j) => {
    const p = rows[j], label = `${p.city} ${p.year}`;
    assert.equal(cell.median_s, rint(p.median), `${label}: edition median finish`);
    near(cell.slowdown, p.slowdown, `${label}: edition sustained slowdown share`, 5.1e-5);
    if (p.weather) near(cell.temp, p.weather.temp_c, `${label}: start temperature`, .05 + 1e-9);
    else assert.equal(cell.temp, null, `${label}: no paired weather row, so no temperature`);
  });
  const years = [...new Set(rows.map(p => p.year))].sort((a, b) => a - b);
  assert.deepEqual(doc.years.by_year.map(row => [row.year, row.editions, row.courses, row.finishes]), years.map(y => {
    const g = rows.filter(p => p.year === y);
    return [y, g.length, new Set(g.map(p => p.city)).size, sum(g.map(p => p.n))];
  }), 'Years: editions, courses and finishes');
  for (const row of doc.years.by_year) {
    const g = rows.filter(p => p.year === row.year), all = storyEditions.filter(e => editions[e].year === row.year);
    const pooled = new Float64Array(sum(all.map(e => storyCount[e])));
    let j = 0;
    for (const e of all) for (const i of rowsOf(e)) pooled[j++] = times[i * 9 + 8];
    assert.equal(row.pooled_median_s, rint(sortedMedian(pooled)), `${row.year}: pooled median over every story finish of the year`);
    near(row.median_s, mean(g.map(p => p.median)), `${row.year}: mean of edition medians`, .5 + 1e-6);
    near(row.slowdown, mean(g.map(p => p.slowdown)), `${row.year}: mean edition slowdown share`, 5.1e-5);
  }
  return {
    editions: rows.length, courses: cities.length, shape_editions: shape.length, typical_sections: typical.length, weather_editions: weatherRows.length,
    weather_pairs: pairs.length, hotter_slowed_more: agree, within_slope: Math.round(within.slope * 1e4) / 1e4, matched_courses: matchedCourses,
    identification_tested: pool.length, years: years.length,
  };
}

// kick.json: grid screen, kick and magnet shares, section breaks, warning lights, stay rates, cost and gender counts.
function checkKick(doc) {
  const pace = (o, k) => (times[o + k] - (k ? times[o + k - 1] : 0)) / lengths[k];
  const rel = (o, k) => pace(o, k) / ((times[o + 3] - times[o]) / 15) - 1;
  const grid = [];
  for (const e of shapeEditions) {
    const rows = rowsOf(e);
    if (rows.length < MIN_CELL) continue;
    const kicks = new Float64Array(rows.length), secs = [4, 5, 6, 7].map(() => new Float64Array(rows.length));
    rows.forEach((i, j) => { const o = i * 9; kicks[j] = pace(o, 8) / pace(o, 7) - 1; secs.forEach((a, k) => { a[j] = rel(o, k + 4); }); });
    const mk = median(kicks), mr = secs.map(median), low = Math.min(...mr);
    if (mk < -0.15 || low < -0.05) grid.push({ edition: e, city: editions[e].city, year: editions[e].year, finishes: rows.length });
  }
  assert.deepEqual(doc.grid_screen.map(g => [g.city, g.year, g.finishes]).sort(), grid.map(g => [g.city, g.year, g.finishes]).sort(), 'Kick grid screen editions');
  doc.grid_screen.forEach(g => assert.equal(typeof g.reason, 'string', `${g.city} ${g.year}: grid screen reason`));
  const gridSet = new Set(grid.map(g => g.edition)), kickEditions = shapeEditions.filter(e => !gridSet.has(e));
  const n = sum(kickEditions.map(e => storyCount[e]));
  assert.equal(doc.cohort_n, n, 'Kick cohort: shape cohort without grid-screened editions');
  assert.equal(doc.editions, kickEditions.filter(e => storyCount[e] > 0).length, 'Kick editions');
  let faster = 0, slow = 0, slowFaster = 0;
  const mAll = new Float64Array(5), mSlow = new Float64Array(5), over10 = new Float64Array(9), over25 = new Float64Array(9);
  const warn = [4, 5, 6].map(() => Array.from({ length: 6 }, () => [0, 0]));
  const bins = [-10, 0, 0.05, 0.10, 0.15, 0.20, 0.25];
  const stay = [5, 6].map(() => [0, 0]);
  const gk = new Map();
  const bandEdges = [150, 180, 210, 240, 270, 300, 330, 360];
  eachRow(kickEditions, i => {
    const o = i * 9, R9 = Array.from({ length: 9 }, (_, k) => rel(o, k));
    const hit = [4, 5, 6, 7].map(k => R9[k] + 1e-12 >= .25), d = hit.some(Boolean);
    const isFaster = pace(o, 8) / pace(o, 7) - 1 < 0;
    if (isFaster) faster++;
    if (d) { slow++; if (isFaster) slowFaster++; }
    for (let k = 4; k < 9; k++) { const f = pace(o, k) < pace(o, k - 1) ? 1 : 0; mAll[k - 4] += f; if (d) mSlow[k - 4] += f; }
    for (let k = 0; k < 9; k++) { if (R9[k] > .10) over10[k]++; if (R9[k] + 1e-12 >= .25) over25[k]++; }
    [4, 5, 6].forEach((sec, w) => {
      if (hit.slice(0, sec - 3).some(Boolean)) return;
      const b = bins.findIndex((lo, j) => j < 6 && R9[sec] >= lo && R9[sec] < bins[j + 1]);
      if (b < 0) return;
      warn[w][b][0]++; if (hit.slice(sec - 3).some(Boolean)) warn[w][b][1]++;
    });
    [5, 6].forEach((sec, j) => { if (R9[sec] + 1e-12 >= .25) { stay[j][0]++; if (R9[sec + 1] + 1e-12 >= .25) stay[j][1]++; } });
    const sex = genderOf[i];
    if (sex === 1 || sex === 2) {
      const band = bandEdges.filter(edge => ((times[o + 3] - times[o]) / 15) * 42.195 / 60 >= edge).length;
      const key = `${band}:${sex}`, cell = gk.get(key) || [0, 0];
      cell[0]++; if (isFaster) cell[1]++; gk.set(key, cell);
    }
  });
  const K = doc.kick;
  assert.deepEqual([K.n, K.faster, K.slowdown_n, K.slowdown_faster], [n, faster, slow, slowFaster], 'Kick counts');
  near(K.share, faster / n, 'Kick share', 1e-4); near(K.slowdown_share, slowFaster / slow, 'Kick share among sustained slowdowns', 1e-4);
  doc.magnet.forEach((row, j) => { near(row.all, mAll[j] / n, `${row.section}: faster than previous`, 1e-4); near(row.slowdown, mSlow[j] / slow, `${row.section}: faster than previous among slowdowns`, 1e-4); });
  doc.breaks.all.sections.forEach((row, k) => { near(row.over10, over10[k] / n, `${row.section}: more than 10% slower`, 1e-4); near(row.over25, over25[k] / n, `${row.section}: 25% or more slower`, 1e-4); });
  assert.equal(doc.breaks.all.n, n, 'Break chart cohort');
  doc.warning.forEach((block, w) => {
    const labels = ['Faster', '0–5% slower', '5–10% slower', '10–15% slower', '15–20% slower', '20–25% slower'];
    const expected = warn[w].map((cell, b) => ({ label: labels[b], n: cell[0], later: cell[1] / cell[0] })).filter(row => row.n >= MIN_CELL);
    assert.deepEqual(block.rows.map(row => [row.label, row.n]), expected.map(row => [row.label, row.n]), `Warning after ${block.after}: rows`);
    block.rows.forEach((row, j) => near(row.later, expected[j].later, `Warning after ${block.after} ${row.label}`, 1e-4));
  });
  doc.recovery.stay.forEach((row, j) => { assert.equal(row.n, stay[j][0], `Stay ${row.source}: finishes at sustained-slowdown pace`); near(row.stay, stay[j][1] / stay[j][0], `Stay ${row.source}`, 1e-4); });
  doc.gender_kick.forEach(row => {
    const band = ['Under 2:30', '2:30–3:00', '3:00–3:30', '3:30–4:00', '4:00–4:30', '4:30–5:00', '5:00–5:30', '5:30–6:00', '6:00 and over'].indexOf(row.label);
    const w = gk.get(`${band}:2`), m = gk.get(`${band}:1`);
    assert.deepEqual([row.women_n, row.men_n], [w[0], m[0]], `${row.label}: women and men counts`);
    near(row.women, w[1] / w[0], `${row.label}: women kick share`, 1e-4); near(row.men, m[1] / m[0], `${row.label}: men kick share`, 1e-4);
  });
  // Cost bands use the story cohort: same 5–20 km pace (15-minute marathon equivalent), with and without a sustained slowdown.
  const cost = new Map();
  eachRow(storyEditions, i => {
    const o = i * 9, equiv = ((times[o + 3] - times[o]) / 15) * 42.195 / 60, lo = 150 + 15 * Math.floor((equiv - 150) / 15);
    if (equiv < 150 || lo >= 360) return;
    const cell = cost.get(lo) || [0, 0]; cell[sustained(times, o) ? 0 : 1]++; cost.set(lo, cell);
  });
  doc.cost.bands.forEach(row => assert.deepEqual([row.slowdown_n, row.other_n], cost.get(row.lo_min), `${row.label}: cost-band counts`));
  return { cohort_n: n, grid_screen: grid.length, faster, slowdown_n: slow, warning_rows: sum(doc.warning.map(b => b.rows.length)), cost_bands: doc.cost.bands.length };
}

// 11. Runner tools: the final-kick cohort (story cohort without start-offset and grid-screened editions).
let toolEditionCache = null;
function toolEditions() {
  if (toolEditionCache) return toolEditionCache;
  const pace = (o, k) => (times[o + k] - (k ? times[o + k - 1] : 0)) / lengths[k];
  const grid = new Set();
  for (const e of shapeEditions) {
    const rows = rowsOf(e);
    if (rows.length < MIN_CELL) continue;
    const kicks = new Float64Array(rows.length), secs = [4, 5, 6, 7].map(() => new Float64Array(rows.length));
    rows.forEach((i, j) => { const o = i * 9, base = (times[o + 3] - times[o]) / 15; kicks[j] = pace(o, 8) / pace(o, 7) - 1; secs.forEach((a, k) => { a[j] = pace(o, k + 4) / base - 1; }); });
    if (median(kicks) < -0.15 || Math.min(...secs.map(median)) < -0.05) grid.add(e);
  }
  toolEditionCache = shapeEditions.filter(e => !grid.has(e) && storyCount[e] > 0);
  return toolEditionCache;
}
const slugify = name => name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// numpy.quantile (linear) on a sorted array
const npQuantile = (sorted, p) => { const h = (sorted.length - 1) * p, lo = Math.floor(h); return lo + 1 < sorted.length ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[lo]; };
const toolSlowdown = o => sustained(times, o);
function onsetKm(o) {
  const base = (times[o + 3] - times[o]) / 15;
  for (let k = 4; k < 8; k++) if ((times[o + k] - times[o + k - 1]) / 5 / base - 1 + 1e-12 >= .25) return 20 + 5 * (k - 4);
  return -1;
}
function toolCohortCheck(doc, label) {
  const eds = toolEditions(), n = sum(eds.map(e => storyCount[e]));
  assert.equal(doc.cohort_n, n, `${label}: tool cohort is the final-kick cohort`);
  return eds;
}

function checkProjector(doc) {
  const eds = toolCohortCheck(doc, 'Projector');
  const MATS = [5, 10, 15, 20, 25, 30, 35, 40], VARIANTS = ['all', 'men', 'women', 'faster', 'similar', 'slower'];
  const slugOf = new Map(eds.map(e => [e, slugify(editions[e].city)]));
  let cells = 0, sampled = 0;
  for (let k = 0; k < 8; k++) {
    const km = MATS[k], counts = new Map(), sample = new Map();
    eachRow(eds, (i, e) => {
      const o = i * 9, t = times[o + k], band = Math.floor(t * 42.195 / km / 120);
      const variants = ['all'];
      if (genderOf[i] === 1) variants.push('men'); else if (genderOf[i] === 2) variants.push('women');
      if (k > 0) { const r = ((t - times[o + k - 1]) / 5) / (t / km) - 1; variants.push(r < -0.02 ? 'faster' : Math.abs(r) <= 0.02 ? 'similar' : 'slower'); }
      for (const scope of ['all', slugOf.get(e)]) for (const v of variants) {
        if (scope !== 'all' && (v === 'men' || v === 'women')) continue;
        const key = `${scope}|${v}|${band}`, c = counts.get(key) || { n: 0, eds: new Set() };
        c.n++; c.eds.add(e); counts.set(key, c);
      }
      if (km === 20 || km === 30) { const key = band; const list = sample.get(key) || []; list.push(i); sample.set(key, list); }
    });
    // every published cell matches the recount; every recount group of 100+ is published
    const published = new Set();
    for (const [file, sha] of Object.entries(doc.shards)) {
      const m = file.match(/^tools\/projector\/([a-z0-9-]+)\/(\d+)\.json$/);
      assert.ok(m, `${file}: projector shard path`);
      if (Number(m[2]) !== km) continue;
      const shard = docs.get(file);
      assert.equal(shard.mat_km, km); assert.equal(shard.scope, m[1]); assert.equal(shard.band_s, 120);
      for (const [v, col] of Object.entries(shard.cells)) {
        assert.ok(VARIANTS.includes(v), `${file}: variant ${v}`);
        col.b.forEach((b, j) => {
          const c = counts.get(`${m[1]}|${v}|${b / 120}`);
          assert.ok(c, `${file} ${v} ${b}: band exists in the cohort`);
          assert.equal(col.n[j], c.n, `${file} ${v} ${b}: finishes`); assert.equal(col.ed[j], c.eds.size, `${file} ${v} ${b}: editions`);
          assert.equal(col.q[j].length, 19); assert.ok(col.q[j].every((x, h) => !h || x >= col.q[j][h - 1]), `${file} ${v} ${b}: percentiles increase`);
          assert.equal(col.later[j].length, 7 - k, `${file} ${v} ${b}: later mats`);
          published.add(`${m[1]}|${v}|${b / 120}`); cells++;
        });
      }
    }
    for (const [key, c] of counts) if (c.n >= MIN_CELL) assert.ok(published.has(key), `Projector ${km} km ${key}: a group of ${c.n} finishes is missing`);
    if (km === 20 || km === 30) {
      // Exact percentiles, slowdown split and remaining pace for every All-courses, all-finishes cell at 20 and 30 km.
      const col = docs.get(`tools/projector/all/${km}.json`).cells.all;
      col.b.forEach((b, j) => {
        const rows = sample.get(b / 120); const fin = Float64Array.from(rows, i => times[i * 9 + 8]).sort();
        doc.quantiles.forEach((p, h) => assert.ok(Math.abs(col.q[j][h] - npQuantile(fin, p)) <= 0.51, `Projector ${km} km ${b}: p${Math.round(p * 100)}`));
        let already = 0, later = 0;
        const rem = Float64Array.from(rows, i => (times[i * 9 + 8] - times[i * 9 + k]) / (42.195 - km)).sort();
        rows.forEach(i => { const on = onsetKm(i * 9); if (on >= 0) { if (on + 5 <= km) already++; else later++; } });
        near(col.sd[j][0], already / rows.length, `Projector ${km} km ${b}: slowdown already recorded`, 1e-4);
        near(col.sd[j][1], later / rows.length, `Projector ${km} km ${b}: slowdown after this mat`, 1e-4);
        near(col.rp[j], npQuantile(rem, 0.5), `Projector ${km} km ${b}: median remaining pace`, 0.051);
        sampled++;
      });
    }
  }
  assert.ok(doc.validation.length >= 15 && doc.validation.every(v => v.coverage_p10_p90 > 0.7 && v.coverage_p10_p90 < 0.9), 'Projector held-out validation is reported');
  return { cells, sampled_exact: sampled, scopes: doc.scopes.length, validation_rows: doc.validation.length };
}

function checkPaceBand(doc) {
  const eds = toolCohortCheck(doc, 'Pace band');
  const counts = new Map(), slugOf = new Map(eds.map(e => [e, slugify(editions[e].city)]));
  const SAMPLE = new Set([180, 210, 240, 270, 300]), sample = new Map();
  eachRow(eds, (i, e) => {
    const o = i * 9, F = times[o + 8], slow = toolSlowdown(o) ? 'slowdown' : 'held';
    const g = genderOf[i] === 1 ? 'men' : genderOf[i] === 2 ? 'women' : null;
    for (let G = Math.floor(F / 60) + 1; G * 60 - 300 <= F; G++) {
      if (G < 150 || G > 390) continue;
      for (const scope of ['all', slugOf.get(e)]) for (const gender of g ? ['all', g] : ['all']) for (const group of ['all', slow]) {
        const key = `${scope}|${gender}|${group}|${G}`; counts.set(key, (counts.get(key) || 0) + 1);
      }
      if (SAMPLE.has(G)) { const list = sample.get(G) || []; list.push(i); sample.set(G, list); }
    }
  });
  let groups = 0;
  const published = new Set();
  for (const file of Object.keys(doc.shards)) {
    const m = file.match(/^tools\/pace-band\/([a-z0-9-]+)\/(all|men|women)\.json$/);
    assert.ok(m, `${file}: pace band shard path`);
    const shard = docs.get(file);
    assert.equal(shard.window_s, 300);
    for (const [group, col] of Object.entries(shard.groups)) {
      col.g.forEach((G, j) => {
        assert.equal(col.n[j], counts.get(`${m[1]}|${m[2]}|${group}|${G}`), `${file} ${group} ${G}: finishes in [G − 5:00, G)`);
        assert.equal(col.e50[j].length, 9); assert.ok(col.e50[j].every((x, h) => !h || x > col.e50[j][h - 1]), `${file} ${group} ${G}: elapsed medians increase`);
        published.add(`${m[1]}|${m[2]}|${group}|${G}`); groups++;
      });
    }
  }
  // A goal is listed when its all-finishes window has 100+; held and slowdown appear only where they reach 100 on their own.
  for (const [key, n] of counts) {
    const [scope, gender, group, G] = key.split('|');
    if (n >= MIN_CELL && (group === 'all' || (counts.get(`${scope}|${gender}|all|${G}`) || 0) >= MIN_CELL)) assert.ok(published.has(key), `Pace band ${key}: a group of ${n} finishes is missing`);
  }
  const all = docs.get('tools/pace-band/all/all.json').groups.all;
  for (const [G, rows] of sample) {
    const j = all.g.indexOf(G);
    assert.ok(j >= 0, `Pace band ${G}: sampled goal is published`);
    for (let k = 0; k < 9; k++) {
      const v = Float64Array.from(rows, i => times[i * 9 + k]).sort();
      assert.ok(Math.abs(all.e50[j][k] - npQuantile(v, 0.5)) <= 0.51, `Pace band ${G}: median elapsed at point ${k}`);
    }
    near(all.sd[j], rows.filter(i => toolSlowdown(i * 9)).length / rows.length, `Pace band ${G}: sustained-slowdown share`, 1e-4);
  }
  return { groups, sampled_goals: sample.size };
}

function toolWeather(eds) {
  const weather = contextWeather(eds), out = new Map();
  for (const e of eds) {
    const w = weather.get(e);
    if (w && foldName(w.weather_race) === foldName(editions[e].race || '')) out.set(e, w);
  }
  return out;
}

function checkWeatherMatch(doc) {
  const eds = toolCohortCheck(doc, 'Weather match'), valid = toolWeather(eds);
  assert.deepEqual(doc.editions.map(r => [r.city, r.year]), eds.filter(e => valid.has(e)).map(e => [editions[e].city, editions[e].year]), 'Weather match: editions with a valid, matching weather row');
  const byId = doc.editions.map(r => editionIndex.get(editionKey(r.city, r.year)));
  doc.editions.forEach((r, j) => near(r.temp_c, Math.round(valid.get(byId[j]).temp_c * 10) / 10, `${r.city} ${r.year}: start temperature`, 1e-9));
  const per = new Map();
  for (const e of byId) {
    const bands = new Map();
    for (const i of rowsOf(e)) {
      const o = i * 9, base = (times[o + 3] - times[o]) / 15, k = Math.floor((base - 180) / 15);
      if (k < 0 || k >= 33) continue;
      const b = bands.get(k) || []; b.push(i); bands.set(k, b);
    }
    per.set(e, bands);
  }
  const expected = [];
  for (let c = -2; c <= 28; c++) for (const hw of [2, 3]) for (let k = 0; k < 33; k++) {
    const matched = byId.map((e, id) => [e, id]).filter(([e]) => Math.abs(valid.get(e).temp_c - c) <= hw + 1e-9 && (per.get(e).get(k)?.length || 0) >= 20);
    const n = sum(matched.map(([e]) => per.get(e).get(k).length));
    if (matched.length >= 3 && n >= MIN_CELL) expected.push({ c, hw, pace: 180 + 15 * k, n, ed: matched.map(([, id]) => id), sd: mean(matched.map(([e]) => per.get(e).get(k).filter(i => toolSlowdown(i * 9)).length / per.get(e).get(k).length)) });
  }
  assert.deepEqual(doc.rows.map(r => [r.c, r.hw, r.pace, r.n, r.ed]), expected.map(r => [r.c, r.hw, r.pace, r.n, r.ed]), 'Weather match rows, finishes and matched editions');
  doc.rows.forEach((r, j) => near(r.sd, expected[j].sd, `Weather ${r.c}±${r.hw} °C, ${r.pace} s/km: edition-balanced slowdown share`, 1e-4));
  return { editions: doc.editions.length, rows: doc.rows.length };
}

function checkCourseGoal(doc) {
  const eds = toolCohortCheck(doc, 'Course goal');
  const cities = [...new Set(eds.map(e => editions[e].city))].sort(byText);
  const expectedRows = [], expectedGaps = [];
  for (const city of cities) {
    const cityEds = eds.filter(e => editions[e].city === city);
    for (let G = 150; G <= 390; G += 5) {
      const g = G * 60 / 42.195, parts = [];
      for (const e of cityEds) {
        const sel = Array.from(rowsOf(e)).filter(i => Math.abs(((times[i * 9 + 3] - times[i * 9]) / 15) / g - 1) <= 0.02);
        if (sel.length >= 20) parts.push(sel);
      }
      const n = sum(parts.map(p => p.length));
      if (parts.length < 3 || n < MIN_CELL) { expectedGaps.push([G, city]); continue; }
      const pooled = parts.flat();
      expectedRows.push({ goal: G, city, n, ed: parts.length, under: pooled.filter(i => times[i * 9 + 8] < G * 60).length / n,
        sd: mean(parts.map(p => p.filter(i => toolSlowdown(i * 9)).length / p.length)) });
    }
  }
  assert.deepEqual(doc.rows.map(r => [r.goal, r.city, r.n, r.ed]), expectedRows.map(r => [r.goal, r.city, r.n, r.ed]), 'Course goal rows');
  doc.rows.forEach((r, j) => { near(r.under, expectedRows[j].under, `${r.city} ${r.goal}: under goal`, 1e-4); near(r.sd, expectedRows[j].sd, `${r.city} ${r.goal}: slowdown share`, 1e-4); });
  assert.deepEqual(doc.unavailable.map(u => [u.goal, u.city]), expectedGaps, 'Course goal unavailable rows');
  assert.deepEqual(doc.courses.map(c => c.city), cities, 'Course goal course list');
  return { rows: doc.rows.length, unavailable: doc.unavailable.length };
}

const checkers = { 'finish-times': checkFinishTimes, archetypes: checkArchetypes, positions: checkPositions, demographics: checkDemographics, replay: checkReplay, courses: checkCourses, kick: checkKick,
  'tool-projector': checkProjector, 'tool-pace-band': checkPaceBand, 'tool-weather-match': checkWeatherMatch, 'tool-course-goal': checkCourseGoal };
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
