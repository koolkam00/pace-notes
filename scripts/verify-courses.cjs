// Checks the course pages (/courses/<slug>, lib/course-page.ts and components/course/) and the /courses index.
//   Data checks (the last step of `npm run verify:data`):
//     1. the page helpers on small hand-made fixtures (formats, temperatures that round to zero, the 5 °C gate, titles,
//        the editions that make up a total, the shared height scale, the nearest pacing fingerprints);
//     2. the page code refuses runner context the story data was not built from (a scratch copy of public/data whose
//        context manifest differs only in its timestamp), and an independent recount from the published files, written
//        without the page code: every edition's finishes against its checksum-verified runner-context shard, the course
//        totals and the editions that make them up, medians and sustained-slowdown range against the editions, the
//        weather in courses.json against the shards and the weather-match file, the route's 5 km sections against the
//        course chooser's totals, the course-profile pack against the story cohort, and which courses the two linked
//        analyses have a result for.
//   Built-page checks (`--html`, appended to `npm run verify:seo`, after the build), on every course page:
//     3. every printed figure (<data data-k>) against its file, both its value and the text shown (the default miles
//        view), every edition and goal row present (in "All numbers"), no other number in a table cell; one H1, no empty
//        heading, the sections the data supports and no others (no "About this data"); each section's finding (its H2)
//        and the hero's sentence and glance rows exactly the course nuggets' (lib/nuggets/courses.ts), so a sentence
//        can only say what its recount allows; "sustained slowdown" linked to its definition on /methodology at its
//        first use, never defined or cited on the page; no method, source or coverage copy in the page's own text
//        (October 16, 2026: that copy lives on /methodology only); banned and rank words; copy editions never listed or
//        printed with numbers, and no all-finisher figure that counts them; one climb total under the elevation; the
//        5 °C gate, in the text and in the chart's accessible name; the course total named only with the editions that
//        make it up, in the text and the description; table regions with names; links only to exported pages, with
//        course presets only where the target tool publishes the course and analyses only where they have a result; the
//        planner on every page, its five goal rows linked to it, and the qualifying page on the six qualifying courses;
//        no structured data beyond the breadcrumbs; and on /courses the ItemList and each row's sustained-slowdown
//        share, the course page's.
// Usage: node scripts/verify-courses.cjs [--html] [--out <folder>]
//
// Key grammar for <data data-k="key">: a field name, then `@<year>`, `@<goal minutes>` or `@<index>` where the field is
// per edition, per goal or per section. See KINDS and resolve() below; a key the verifier does not know fails the check.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const os = require('node:os');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const html = args.includes('--html');
const outArg = args.indexOf('--out');
const OUT = path.resolve(root, outArg >= 0 ? args[outArg + 1] : 'out');
// `npm run verify:seo -- <flags>` hands verify-seo's own flags (--all, --today <date>) to this script too; they change nothing here.
assert.ok(args.every((a, i) => ['--html', '--out', '--all', '--today'].includes(a) || ['--out', '--today'].includes(args[i - 1])), 'Usage: node scripts/verify-courses.cjs [--html] [--out <folder>]');
process.chdir(root); // the page code reads public/data relative to the working directory, as during `next build`

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...rest);
};

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const check = (ok, where, message) => { if (!ok) fail(where, message); };
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const close = (a, b, tolerance) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;

// ---------- Independent formats (the default miles view), written without the page code ----------
const KM_PER_MILE = 1.609344;
const SECTION_BOUNDS = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
const SECTION_NAMES = ['0–5', '5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const minus = (text) => text.replace(/^-/, '−');
const F = {
  count: (n) => Math.round(n).toLocaleString('en-US'),
  pct: (v) => `${(v * 100).toFixed(1)}%`,
  pct0: (v) => `${Math.round(v * 100)}%`,
  spct1: (v) => { const r = Number(v.toFixed(1)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}%`; },
  hm: (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; },
  clock: (s) => { const t = Math.round(s); return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; },
  min: (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; },
  year: (y) => String(y),
  years: (list) => {
    const sorted = [...new Set(String(list).split(',').map(Number))].sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
      if (j - i >= 2) parts.push(`${sorted[i]}–${sorted[j]}`); else for (let k = i; k <= j; k += 1) parts.push(String(sorted[k]));
      i = j + 1;
    }
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('');
  },
  ft: (m) => `${Math.round(m / 0.3048).toLocaleString('en-US')} ft`,
  netft: (m) => { const v = Math.round(Math.abs(m) / 0.3048); return `${v === 0 ? '' : m < 0 ? '−' : '+'}${v.toLocaleString('en-US')} ft`; },
  mi1: (km) => `${(km / KM_PER_MILE).toFixed(1)} mi`,
  mi2: (km) => `${(km / KM_PER_MILE).toFixed(2)} mi`,
  degF: (c) => { const v = Number((c * 1.8 + 32).toFixed(0)) || 0; return `${v < 0 ? '−' : ''}${Math.abs(v)}°F`; },
  mph: (mps) => `${(mps * 2.2369362920544).toFixed(1)} mph`,
  rh: (h) => `${Math.round(h)}%`,
  date: (iso) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`,
  text: (s) => String(s),
  // Sections are named by their mats in both unit modes (lib/units.ts sectionLabel): "35–40K", "40K–finish".
  section: (label) => { const [a, b] = SECTION_BOUNDS[SECTION_NAMES.indexOf(label)]; return b > 42.19 ? `${a}K–finish` : `${a}–${b}K`; },
  slopeF: (perC) => { const v = perC / 1.8; return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} percentage points per °F`; },
  r2: (r) => minus(`${r < 0 ? '-' : ''}${Math.abs(r).toFixed(2)}`),
};

// ---------- 1. Helpers on hand-made fixtures ----------
const P = require(path.join(root, 'lib/course-page.ts'));
const U = require(path.join(root, 'components/course/CourseUnits.tsx'));
{
  // Temperatures: rounded first, a true minus, never "−0" (Boston 2026's dew point is −0.1 °C, Valencia 2023's −0.4 °C).
  assert.equal(U.degreesText(-0.1, 'km'), '0°C');
  assert.equal(U.degreesText(-0.4, 'km'), '0°C');
  assert.equal(U.degreesText(-1.2, 'km'), '−1°C');
  assert.equal(U.degreesText(6.4, 'km'), '6°C');
  assert.equal(U.degreesText(6.4, 'mi'), '44°F');
  assert.equal(U.degreesText(-17.8, 'mi'), '0°F');
  assert.equal(U.degreesText(-20, 'mi'), '−4°F');
  for (const c of [-20, -17.8, -0.4, 0, 6.4, 13.7, 24.95]) assert.equal(F.degF(c), U.degreesText(c, 'mi'), 'The verifier and the page print °F alike');
  assert.equal(P.pct(0.2181), '21.8%');
  assert.equal(P.pct(0), '0.0%');
  assert.equal(P.clock(13111), '3:38:31');
  assert.equal(P.clock(12510.4), '3:28:30');
  assert.equal(P.minutes(565), '9:25');
  assert.equal(P.goalText(210), '3:30');
  assert.equal(P.goalText(300), '5:00');
  assert.equal(P.shortDate('2018-04-16'), 'Apr 16');
  assert.equal(P.shortDate('2024-10-13'), 'Oct 13');
  // The 5 °C gate: shown at the gap, hidden under it (Sydney's editions are 1.5 °C apart), float noise ignored.
  const pair = (hot, cool) => ({ hot: { temp: hot }, cool: { temp: cool } });
  assert.equal(P.hotCoolShown(pair(9.6, 8.1), 5), null);
  assert.equal(P.hotCoolShown(pair(13.4, 9.6), 5), null, 'Oslo-like 3.8 °C gap');
  assert.ok(P.hotCoolShown(pair(10.1, 5.1), 5), 'exactly the gap is shown');
  assert.ok(P.hotCoolShown(pair(13.7, 8.7), 5), '13.7 − 8.7 is 5 °C despite float noise');
  assert.equal(P.hotCoolShown(undefined, 5), null);
  assert.equal(P.hotCoolShown(pair(30, 0), NaN), null);
  // The shared height scale: the largest relief, rounded up to 50 m (never under 50).
  assert.equal(P.sharedRelief([{ min_m: 2, max_m: 142 }, { min_m: 600, max_m: 767 }]), 200);
  assert.equal(P.sharedRelief([{ min_m: 0, max_m: 150 }]), 150);
  assert.equal(P.sharedRelief([{ min_m: 0, max_m: 7 }]), 50);
  // The nearest fingerprints: Euclidean over the nine sections, five or more editions, nearest first, ties by name.
  const dev = (v) => Array(9).fill(v);
  const shapes = [{ city: 'A', editions: 9, deviation: dev(0) }, { city: 'B', editions: 9, deviation: dev(1) }, { city: 'C', editions: 4, deviation: dev(0.1) },
    { city: 'D', editions: 6, deviation: dev(-1) }, { city: 'E', editions: 7, deviation: dev(3) }, { city: 'F', editions: 8 }];
  assert.deepEqual(P.nearestShapes(shapes, 'A').map((c) => c.city), ['B', 'D', 'E'], 'fewer than five editions and no shape are left out; ties by name');
  assert.equal(P.nearestShapes(shapes, 'F').length, 0, 'a course with no shape has no neighbours');
  assert.ok(Math.abs(P.nearestShapes(shapes, 'A')[0].distance - 3) < 1e-9, 'distance over nine sections');
  assert.equal(P.courseTitle('X Marathon', true), 'X Marathon: Elevation, Pacing and Finish Times | Pace Notes');
  assert.equal(P.courseTitle('Boston Marathon', true), 'Boston Marathon: Elevation, Pacing and Finish Times', 'the brand only when the title fits 60 characters');
  assert.equal(P.courseTitle('Vienna City Marathon', false), 'Vienna City Marathon: Pacing and Finish Times by Year');
  const long = P.courseDescription('A Very Long Race Name Marathon of the Twin Cities', { finishes: 123456, editions: 12, years: [2005, 2025] }, true, true);
  assert.ok(long.length <= P.MAX_DESCRIPTION, 'descriptions drop clauses to fit');
  assert.equal(P.courseDescription('Y Marathon', { finishes: 416, editions: 1, years: [2015] }, false, false), 'Y Marathon finish times by year and how 416 recorded finishes paced each 5 km in its 2015 edition.');
  // The editions that make up a total: the rows plus an edition under 100 finishes (Amsterdam-like), or the build stops.
  const rows = [{ year: 2022, n: 900 }, { year: 2024, n: 1000 }];
  assert.deepEqual(P.countedEditions('X', 1914, rows, [{ year: 2023, n: 14 }]), { editions: 3, years: [2022, 2023, 2024] });
  assert.deepEqual(P.countedEditions('X', 1900, rows, []), { editions: 2, years: [2022, 2024] });
  assert.throws(() => P.countedEditions('X', 1914, rows, []), /add up to 1900 finishes, not the course total of 1914/, 'a total the editions do not account for stops the build');
  assert.throws(() => P.countedEditions('X', 1914, rows, [{ year: 2024, n: 14 }]), /counted twice/);
}

// ---------- 2. Independent recount from the published files ----------
const manifest = read('public/data/insights/manifest.json');
const insight = (name) => {
  const bytes = fs.readFileSync(path.join(root, 'public/data/insights', name));
  assert.ok(manifest.files[name] && manifest.files[name].bytes === bytes.length && manifest.files[name].sha256 === sha256(bytes), `${name}: checksum against the insights manifest`);
  return JSON.parse(bytes.toString());
};
const courses = insight('courses.json');
const geometryFile = insight('course-geometry.json');
const geometry = geometryFile.courses;
const archetypes = insight('archetypes.json');
const courseGoal = insight('tools/course-goal.json');
const paceBand = insight('tools/pace-band.json');
const projector = insight('tools/projector.json');
const weatherMatch = insight('tools/weather-match.json');
const replay = insight('replay.json');
const runnerBytes = fs.readFileSync(path.join(root, 'public/data/runners/manifest.json'));
const runners = JSON.parse(runnerBytes.toString());
const context = read('public/data/runner-context/manifest.json');
const release = read('analysis/release.json');
assert.equal(sha256(runnerBytes), manifest.runner_manifest_sha256, 'The story data was built from these runner records');
assert.equal(context.runner_manifest_sha256, manifest.runner_manifest_sha256, 'The runner context was built from the same runner records');
assert.equal(context.release_tag, release.tag, 'The runner context is for the adopted release');

// The page code reads only the runner context the story data was built from. A scratch copy of public/data (symlinks)
// whose context manifest differs only in its timestamp keeps the release and the runner records, so only the exact-hash
// binding to the insights manifest can refuse it; the build must stop there rather than mix the two contexts' figures.
{
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-courses-'));
  try {
    const data = path.join(scratch, 'public/data');
    fs.mkdirSync(path.join(data, 'runner-context'), { recursive: true });
    for (const name of fs.readdirSync(path.join(root, 'public/data'))) if (name !== 'runner-context') fs.symlinkSync(path.join(root, 'public/data', name), path.join(data, name));
    fs.symlinkSync(path.join(root, 'public/data/runner-context/editions'), path.join(data, 'runner-context/editions'));
    const rebuilt = read('public/data/runner-context/manifest.json');
    rebuilt.as_of = new Date(Date.parse(rebuilt.as_of) + 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    fs.writeFileSync(path.join(data, 'runner-context/manifest.json'), JSON.stringify(rebuilt));
    process.chdir(scratch);
    let refused = null;
    try { P.editionContexts(); } catch (error) { refused = error; }
    check(refused && /runner context the story data was built from/.test(refused.message), 'data', `runner context rebuilt from the same runner records (as_of ${rebuilt.as_of}) is read beside story data built from the previous one${refused ? `: ${refused.message}` : ''}`);
    // The binding itself, on the published bytes. "Rebound" stands for story data and geometry that record the very bytes
    // given, so only the validator and the timestamps can refuse them; the published manifest, re-serialized, passes so.
    const story = manifest, geometrySha = geometryFile.context_manifest_sha256;
    const contextBytes = fs.readFileSync(path.join(root, 'public/data/runner-context/manifest.json')), runnerBytes = fs.readFileSync(path.join(root, 'public/data/runners/manifest.json'));
    const published = JSON.parse(contextBytes);
    const bind = (bytes, { rebound = false, geometry = geometrySha, storyMeta = story } = {}) => {
      const buffer = Buffer.from(bytes), sha = sha256(buffer);
      try { P.boundContextManifest(buffer, runnerBytes, rebound ? { ...storyMeta, context_manifest_sha256: sha } : storyMeta, rebound ? sha : geometry); return null; } catch (error) { return error; }
    };
    check(!bind(contextBytes) && !bind(JSON.stringify(published), { rebound: true }), 'data', 'the published runner context is refused');
    for (const [label, bytes, options] of [
      ['a context manifest with another as_of', JSON.stringify(rebuilt), {}],
      ['course geometry built from another context', contextBytes, { geometry: 'f'.repeat(64) }],
      ['a context manifest for another runner-manifest timestamp', JSON.stringify({ ...published, runner_manifest_as_of: '2026-01-01T00:00:00Z' }), { rebound: true }],
      ['a context manifest for another release', JSON.stringify({ ...published, release_tag: 'private-export-20260911-1107' }), { rebound: true }],
      ['a context manifest missing an edition', JSON.stringify({ ...published, editions: Object.fromEntries(Object.entries(published.editions).slice(1)) }), { rebound: true }],
      ['story data with another input timestamp', contextBytes, { rebound: true, storyMeta: { ...story, input_as_of: '2026-01-01T00:00:00Z' } }],
    ]) check(bind(bytes, options), 'data', `the context binding accepts ${label}`);
  } finally {
    process.chdir(root);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
const copies = manifest.duplicate_edition_screen;
const isCopy = (city, year) => copies.some((c) => c.city === city && c.year === year);
const slugOf = (city) => city.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const key = (city, year) => `${city}|${year}`;

// The runner-context shards: checksum, edition binding, and what the pages read (eligible count, date, start, weather, terrain).
const shards = new Map();
runners.editions.forEach((edition, index) => {
  const meta = context.editions[String(index)];
  assert.ok(meta && meta.file === `editions/${String(index).padStart(3, '0')}.json.gz`, `runner context lists shard ${index}`);
  const bytes = fs.readFileSync(path.join(root, 'public/data/runner-context', meta.file));
  assert.equal(bytes.length, meta.bytes, `${meta.file}: size`);
  assert.equal(sha256(bytes), meta.sha256, `${meta.file}: checksum`);
  const shard = JSON.parse(zlib.gunzipSync(bytes));
  assert.deepEqual([shard.edition.city, shard.edition.year], [edition.city, edition.year], `${meta.file}: edition`);
  shards.set(key(edition.city, edition.year), shard);
});

const profileRows = fs.readFileSync(path.join(root, 'public/data/packs/ext_course_pacing_profiles/tables/course_profiles.csv'), 'utf8').trim().split('\n').slice(1).map((line) => line.split(','));
const CITIES = [...new Set(profileRows.map((r) => r[0]))].sort();
const profileN = new Map(profileRows.map((r) => [r[0], Number(r[3])]));
const allFinisher = new Map(read('public/data/all-finisher-context/evidence.json').rows[0].courses.map((c) => [c.id, c]));
const policy = read('public/data/packs/ext_course_pacing_profiles/pack_meta.json').source_quality;
assert.equal(policy.release_tag, release.tag, 'The course-profile source policy is for the adopted release');
// One page per course with eligible finishes: 29 under 0934, 28 since the 1652 release excluded Melbourne's only edition
// (2015, a partial load). The count comes from the verified story data, never a typed number.
assert.deepEqual(CITIES, courses.courses.map((c) => c.city).sort(), 'One course page per course in the story data');
assert.equal(CITIES.length, manifest.cohort.cities, 'Course pages match the story cohort\'s cities');

/** Everything the built-page checks need for one city, recounted from the files. */
const facts = new Map();
for (const city of CITIES) {
  const where = `data ${city}`;
  const s = courses.courses.find((c) => c.city === city);
  if (!s) { fail(where, 'no courses.json summary'); continue; }
  const cells = courses.years.cells.filter((c) => c.city === city).sort((a, b) => a.year - b.year);
  const own = [...shards].filter(([k]) => k.startsWith(`${city}|`)).map(([, shard]) => shard).filter((shard) => !isCopy(city, shard.edition.year));
  // Finishes: each edition row equals its shard; the course total is every non-copy shard of the city (small editions included).
  for (const c of cells) {
    const shard = shards.get(key(city, c.year));
    check(shard && shard.eligible_n === c.n, where, `${c.year}: ${c.n} finishes against the shard's ${shard && shard.eligible_n}`);
    check(c.n >= 100, where, `${c.year}: a row with ${c.n} finishes`);
    check(!isCopy(city, c.year), where, `${c.year} is a copy edition but has a row`);
  }
  const total = own.reduce((sum, shard) => sum + shard.eligible_n, 0);
  check(total === s.finishes, where, `finishes ${s.finishes} against ${total} in the shards`);
  check(s.editions === cells.length, where, `editions ${s.editions} against ${cells.length} rows`);
  check(JSON.stringify(s.years) === JSON.stringify(cells.map((c) => c.year)), where, `years ${s.years} against the rows`);
  const small = own.filter((shard) => shard.eligible_n > 0 && !cells.some((c) => c.year === shard.edition.year));
  const smallFinishes = s.finishes - cells.reduce((sum, c) => sum + c.n, 0);
  check(small.reduce((sum, shard) => sum + shard.eligible_n, 0) === smallFinishes && small.every((shard) => shard.eligible_n < 100), where, 'the editions under 100 finishes account for the rest of the total');
  // The editions that make up the total, which every sentence printing it must name: the rows plus those small editions.
  const countedYears = [...cells.map((c) => c.year), ...small.map((shard) => shard.edition.year)].sort((a, b) => a - b);
  // Medians and sustained slowdown: means of the editions, with the range and its years.
  check(close(cells.reduce((sum, c) => sum + c.median_s, 0) / cells.length, s.median_s, 0.51), where, `mean of edition medians ${s.median_s}`);
  check(close(cells.reduce((sum, c) => sum + c.slowdown, 0) / cells.length, s.slowdown, 0.00011), where, `mean sustained slowdown ${s.slowdown}`);
  const lo = cells.reduce((a, b) => (b.slowdown < a.slowdown ? b : a));
  const hi = cells.reduce((a, b) => (b.slowdown > a.slowdown ? b : a));
  check(s.slowdown_range[0] === lo.slowdown && s.slowdown_range[1] === hi.slowdown && s.slowdown_range_years[0] === lo.year && s.slowdown_range_years[1] === hi.year, where, 'sustained-slowdown range and years are the lowest and highest editions');
  // Weather: courses.json rows against the shards and the weather-match file.
  const weather = courses.weather.editions.filter((e) => e.city === city).sort((a, b) => a.year - b.year);
  for (const w of weather) {
    const sw = shards.get(key(city, w.year))?.weather;
    check(sw && close(sw.temp_c, w.temp, 0.051) && close(sw.dewpoint_c, w.dew, 0.051) && close(sw.humidity_pct, w.humidity, 0.51) && close(sw.wind_mps, w.wind, 0.0051), where, `${w.year}: weather against the shard`);
    const cell = cells.find((c) => c.year === w.year);
    check(cell && cell.temp === w.temp, where, `${w.year}: the row's start temperature is the weather row's`);
    const wm = weatherMatch.editions.find((e) => e.city === city && e.year === w.year);
    if (wm && sw) check(wm.date === sw.date && wm.start === sw.scheduled_start && close(wm.temp_c, sw.temp_c, 0.051), where, `${w.year}: weather match agrees with the shard`);
  }
  for (const c of cells) if (!weather.some((w) => w.year === c.year)) check(c.temp === null && courses.weather.excluded.some((e) => e.city === city && e.year === c.year), where, `${c.year}: no weather row but not listed as excluded`);
  for (const copy of copies.filter((c) => c.city === city)) {
    check(!weather.some((w) => w.year === copy.year) && !weatherMatch.editions.some((e) => e.city === city && e.year === copy.year), where, `copy edition ${copy.year} has weather`);
  }
  const hotCool = courses.weather.hot_cool.find((h) => h.city === city);
  if (hotCool) {
    const temps = weather.map((w) => w.temp);
    check(hotCool.hot.temp === Math.max(...temps) && hotCool.cool.temp === Math.min(...temps), where, 'hot_cool names the warmest and coolest weather rows');
  }
  // Terrain: the same supplied current route in every edition; its sections sum to the course chooser's totals.
  const terrains = own.filter((shard) => cells.some((c) => c.year === shard.edition.year)).map((shard) => shard.terrain?.sections).filter(Boolean);
  const ctx = courseGoal.courses.find((c) => c.city === city) ?? null;
  const route = geometry.find((g) => g.city === city) ?? null;
  const terrain = terrains.length && terrains.every((t) => JSON.stringify(t) === JSON.stringify(terrains[0])) ? terrains[0] : null;
  if (route) check(terrain && terrain.length === 9, where, 'every edition carries the same nine supplied-route sections');
  if (terrain && ctx && ctx.gain_m !== null) {
    const sum = (field) => terrain.reduce((t, x) => t + x[field], 0);
    check(close(sum('gain_m'), ctx.gain_m, 0.151) && close(sum('loss_m'), ctx.loss_m, 0.151) && close(sum('net_m'), ctx.net_m, 0.151), where, 'the 5 km sections sum to the course chooser\'s climb, descent and net');
    check(ctx.downhill_opening === terrain[0].net_m < -25, where, 'downhill opening is a first 5 km below −25 m net');
  }
  // The course-profile pack counts every eligible edition: the story cohort plus any copy editions.
  const removed = copies.filter((c) => c.city === city).reduce((sum, c) => sum + c.eligible_removed, 0);
  check(profileN.get(city) === s.finishes + removed, where, `course profile ${profileN.get(city)} against ${s.finishes} + ${removed} copies`);
  const af = allFinisher.get(city);
  if (af && !removed) check(close(af.slowdown_pct, s.slowdown * 100, 0.011), where, `all-finisher ${af.slowdown_pct} against ${s.slowdown}`);
  // Goal rows: published, explained, or none for the course.
  const goalRows = new Map(P.COURSE_GOALS.map((g) => [g, courseGoal.rows.find((r) => r.city === city && r.goal === g) ?? null]));
  if (ctx && ctx.editions >= courseGoal.min_editions) for (const [g, row] of goalRows) check(row || courseGoal.unavailable.some((u) => u.city === city && u.goal === g), where, `goal ${g}: neither a row nor a reason`);
  facts.set(city, {
    s, cells, weather, terrain, ctx, route, hotCool, goalRows, smallFinishes, smallYears: small.map((shard) => shard.edition.year).sort((a, b) => a - b),
    counted: { editions: countedYears.length, years: countedYears },
    types: archetypes.courses.find((c) => c.city === city) ?? null,
    slope: courses.weather.per_course_slopes.find((x) => x.city === city) ?? null,
    copies: copies.filter((c) => c.city === city),
    race: (route && route.race) || s.race || `${city} Marathon`,
    allFinisherPct: af ? `${af.slowdown_pct.toFixed(1)}%` : null,
  });
}
check(CITIES.every((city) => slugOf(city) === P.coursePages().get(slugOf(city))?.slug), 'data', 'the page model has every course');
for (const city of CITIES) {
  const named = JSON.stringify(P.coursePages().get(slugOf(city))?.counted), recount = JSON.stringify(facts.get(city)?.counted);
  check(named === recount, `data ${city}`, `the page model names ${named} as the editions that make up the course total; the recount ${recount}`);
}

// The two linked analyses, from their own files: the course comparison has a result for a course when its all-finisher
// row (all ages, genders and early paces) holds a course group; hills and pacing when the course's analysis file holds the
// supplied route's nine sections. Every drawn route must have them. The analysis joins sections by city (a route proxy),
// while a page draws a route only where the runner context matched the profile to the race, so a course the analysis
// covers without a drawn route must be one the course geometry omits with the context's reason (since 1652: Washington,
// whose profile is now named for another race); the page then offers no hills link.
const allFinisherRows = read('public/data/all-finisher-context/evidence.json').rows;
const COMPARE = new Set(CITIES.filter((city) => (allFinisherRows.find((r) => r.city === city && r.age === 'all' && r.gender === 'all' && r.early_pace === 'all')?.courses ?? []).length > 0));
const guide = read('public/data/packs/ext_personalized_guide/summary.json');
const HILLS = new Set(guide.cities.filter((c) => CITIES.includes(c.city) && (read(`public/data/packs/ext_personalized_guide/tables/${c.file}`).terrain ?? []).filter((t) => [5, 10, 15, 20, 25, 30, 35, 40, 42.195].includes(t.end)).length === 9).map((c) => c.city));
const omittedRoutes = new Map((geometryFile.omitted ?? []).map((o) => [o.city, o]));
for (const city of CITIES) {
  const route = !!facts.get(city)?.route;
  if (route) check(HILLS.has(city), `data ${city}`, 'hills and pacing lacks terrain against the supplied route');
  else if (HILLS.has(city)) check(omittedRoutes.get(city)?.reasons?.length > 0, `data ${city}`, 'hills and pacing has terrain but the course geometry neither draws nor explains the route');
  check(!(route && omittedRoutes.has(city)), `data ${city}`, 'a route is both drawn and omitted');
}
// The pages link to hills and pacing exactly where the analysis has the route's sections and the page draws that route.
const HILLS_LINK = new Set([...HILLS].filter((city) => !!facts.get(city)?.route));
// The page model's shared height scale and pace-band scope, recounted.
const RELIEF = Math.max(50, Math.ceil(Math.max(...geometry.filter((g) => CITIES.includes(g.city)).map((g) => g.max_m - g.min_m)) / 50) * 50);
for (const city of CITIES) {
  const model = P.coursePages().get(slugOf(city));
  check(model?.relief === RELIEF, `data ${city}`, `the page model's height scale ${model?.relief} against ${RELIEF}`);
  check(model?.band === paceBand.scopes.some((x) => x.slug === slugOf(city)), `data ${city}`, 'the page model\'s pace-band scope');
}

// ---------- 3. Built pages ----------
const KINDS = {
  finishes: 'count', editions: 'count', 'counted.editions': 'count', 'counted.years': 'years', median: 'clock', 'median.lo': 'clock', 'median.hi': 'clock', 'median.lo.year': 'year', 'median.hi.year': 'year',
  slowdown: 'pct', 'slowdown.lo': 'pct', 'slowdown.hi': 'pct', 'slowdown.lo.year': 'year', 'slowdown.hi.year': 'year', block10: 'pct', after20: 'min', years: 'years',
  'shape.editions': 'count', 'shape.courses': 'count', 'identified.correct': 'count', 'identified.editions': 'count', slowest: 'section',
  n: 'count', 'median@': 'clock', sd: 'pct', temp: 'degF', date: 'date', small: 'count', 'rows.finishes': 'count',
  'geo.distance': 'mi1', 'geo.distance2': 'mi2', 'geo.gain': 'ft', 'geo.loss': 'ft', 'geo.min': 'ft', 'geo.max': 'ft',
  'route.gain': 'ft', 'route.loss': 'ft', 'cg.gain': 'ft', 'cg.loss': 'ft', 'cg.net': 'netft', 'cg.editions': 'count', 'cg.finishes': 'count', 't.gain': 'ft', 't.loss': 'ft', 't.net': 'netft',
  'g.n': 'count', 'g.ed': 'count', 'g.under': 'pct', 'g.sd': 'pct', 'g.after20': 'min', 'g.p10': 'clock', 'g.p50': 'clock', 'g.p90': 'clock',
  'ty.finishes': 'count', 'ty.editions': 'count', 'ty.share': 'pct0', 'ty.all': 'pct0', 'profile.n': 'count',
  'w.start': 'text', 'w.temp': 'degF', 'w.dew': 'degF', 'w.rh': 'rh', 'w.wind': 'mph',
  'hc.cool.year': 'year', 'hc.hot.year': 'year', 'hc.cool.temp': 'degF', 'hc.hot.temp': 'degF', 'hc.cool.sd': 'pct', 'hc.hot.sd': 'pct',
  slope: 'slopeF', 'slope.r': 'r2', 'slope.editions': 'count', curve: 'spct1',
};
/** A key ending in `.r` prints its field rounded for a chart or a reading: a share in whole percent, a time in h:mm. */
const ROUNDED = { pct: 'pct0', clock: 'hm' };

/** The file value a key names for a city, or undefined. */
function resolve(dataKey, f) {
  const [full, at] = dataKey.split('@');
  const name = full.endsWith('.r') ? full.slice(0, -2) : full;
  const arg = at === undefined ? undefined : Number(at);
  const cell = f.cells.find((c) => c.year === arg);
  const w = f.weather.find((x) => x.year === arg);
  const row = arg !== undefined ? f.goalRows.get(arg) : null;
  const lo = f.cells.length ? f.cells.reduce((a, b) => (b.median_s < a.median_s ? b : a)) : null;
  const hi = f.cells.length ? f.cells.reduce((a, b) => (b.median_s > a.median_s ? b : a)) : null;
  switch (name) {
    case 'finishes': return f.s.finishes;
    case 'editions': return f.s.editions;
    case 'years': return f.s.years.join(',');
    case 'counted.editions': return f.counted.editions;
    case 'counted.years': return f.counted.years.join(',');
    case 'median': return at === undefined ? f.s.median_s : cell?.median_s;
    case 'median.lo': return lo?.median_s;
    case 'median.hi': return hi?.median_s;
    case 'median.lo.year': return lo?.year;
    case 'median.hi.year': return hi?.year;
    case 'slowdown': return f.s.slowdown;
    case 'slowdown.lo': return f.s.slowdown_range[0];
    case 'slowdown.hi': return f.s.slowdown_range[1];
    case 'slowdown.lo.year': return f.s.slowdown_range_years[0];
    case 'slowdown.hi.year': return f.s.slowdown_range_years[1];
    case 'block10': return f.s.block10;
    case 'after20': return f.s.after20_s;
    case 'shape.editions': return f.s.shape_editions;
    case 'shape.courses': return courses.shape_cohort.courses;
    case 'identified.correct': return f.s.identified?.correct;
    case 'identified.editions': return f.s.identified?.editions;
    case 'slowest': return f.s.slowest_section;
    case 'n': return cell?.n;
    case 'sd': return cell?.slowdown;
    case 'temp': return cell?.temp ?? undefined;
    case 'date': return shards.get(key(f.s.city, arg))?.weather?.date;
    case 'small': return f.smallFinishes;
    case 'rows.finishes': return f.cells.reduce((sum, c) => sum + c.n, 0);
    case 'geo.distance': case 'geo.distance2': return f.route?.distance_km;
    case 'geo.gain': return f.route?.gain_m;
    case 'geo.loss': return f.route?.loss_m;
    case 'geo.min': return f.route?.min_m;
    case 'geo.max': return f.route?.max_m;
    // The route's totals as the pages print them: the sums of its nine 5 km sections, to 0.1 m.
    case 'route.gain': return f.terrain ? Math.round(f.terrain.reduce((a, x) => a + x.gain_m, 0) * 10) / 10 : undefined;
    case 'route.loss': return f.terrain ? Math.round(f.terrain.reduce((a, x) => a + x.loss_m, 0) * 10) / 10 : undefined;
    case 'cg.gain': return f.ctx?.gain_m ?? undefined;
    case 'cg.loss': return f.ctx?.loss_m ?? undefined;
    case 'cg.net': return f.ctx?.net_m ?? undefined;
    case 'cg.editions': return f.ctx?.editions;
    case 'cg.finishes': return f.ctx?.finishes;
    case 't.gain': return f.terrain?.[arg]?.gain_m;
    case 't.loss': return f.terrain?.[arg]?.loss_m;
    case 't.net': return f.terrain?.[arg]?.net_m;
    case 'g.n': return row?.n;
    case 'g.ed': return row?.ed;
    case 'g.under': return row?.under;
    case 'g.sd': return row?.sd;
    case 'g.after20': return row?.after20;
    case 'g.p10': return row?.fin[0];
    case 'g.p50': return row?.fin[1];
    case 'g.p90': return row?.fin[2];
    case 'ty.finishes': return f.types?.finishes;
    case 'ty.editions': return f.types?.editions;
    case 'ty.share': return f.types?.shares[arg];
    case 'ty.all': return archetypes.archetypes[arg]?.share;
    case 'profile.n': return profileN.get(f.s.city);
    case 'w.start': return shards.get(key(f.s.city, arg))?.weather?.scheduled_start;
    case 'w.temp': return w?.temp;
    case 'w.dew': return w?.dew;
    case 'w.rh': return w?.humidity;
    case 'w.wind': return w?.wind;
    case 'hc.cool.year': return f.hotCool?.cool.year;
    case 'hc.hot.year': return f.hotCool?.hot.year;
    case 'hc.cool.temp': return f.hotCool?.cool.temp;
    case 'hc.hot.temp': return f.hotCool?.hot.temp;
    case 'hc.cool.sd': return f.hotCool?.cool.slowdown;
    case 'hc.hot.sd': return f.hotCool?.hot.slowdown;
    case 'slope': return f.slope?.slope;
    case 'slope.r': return f.slope?.pearson_r;
    case 'slope.editions': return f.slope?.editions;
    case 'curve': return f.s.curve?.[arg];
    default: return undefined;
  }
}
const kindOf = (dataKey) => {
  const [full, at] = dataKey.split('@');
  const rounded = full.endsWith('.r');
  const name = rounded ? full.slice(0, -2) : full;
  const kind = KINDS[at !== undefined && KINDS[`${name}@`] ? `${name}@` : name];
  return rounded ? ROUNDED[kind] : kind;
};

// HTML helpers: the exported page without its scripts, styles and comments.
const decode = (text) => text.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, '\u00a0').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const markup = (page) => page.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const textOf = (fragment) => decode(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const innerText = (fragment) => decode(fragment.replace(/<[^>]+>/g, '')).trim();
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? decode(m[1]) : null; };
/** The markup of `<section id="…">` up to the next section or the feedback row. Sections never nest. */
const sectionStart = (body, id) => body.search(new RegExp(`<section\\b[^>]*\\sid="${id}"`));
function sectionOf(body, id) {
  const start = sectionStart(body, id);
  if (start < 0) return null;
  const rest = body.slice(start + 1);
  const ends = [rest.search(/<section\b/), rest.search(/<aside class="page-feedback/)].filter((i) => i >= 0);
  return body.slice(start, ends.length ? start + 1 + Math.min(...ends) : undefined);
}
const exported = (pathname) => pathname === '/' ? fs.existsSync(path.join(OUT, 'index.html')) : [`${pathname.slice(1)}.html`, `${pathname.slice(1)}/index.html`].some((f) => fs.existsSync(path.join(OUT, f)));

const BANNED = [[/\bthe wall\b/i, '"the wall"'], [/arithmetic/i, '"arithmetic"'], [/\byour(?:\s+\w+){0,2}\s+chances?\b/i, '"your chance"'], [/private-export/i, 'a release tag'], [/20260912/, 'a release date'], [/htw-db-/i, 'a release tag'], [/20261016/, 'a release date']];
const RANK = /\b(?:rank|ranks|ranked|ranking|rankings|fastest|toughest|hardest|easiest|harder|easier|tougher|similar|best|worst|top \d+)\b/i;
const DOI = 'doi:10.1371/journal.pone.0251513';
const DOI_URL = 'https://doi.org/10.1371/journal.pone.0251513';
const SECTIONS = ['at-a-glance', 'finish-times', 'elevation', 'pacing', 'slowdown', 'goals', 'weather', 'plan', 'replay', 'other-courses'];
/** Where the term links: its definition on /methodology. */
const SLOWDOWN_HREF = '/methodology#sustained-slowdown';
/** What a goal with no published row says, whatever the file's reason (the reason is method, on /methodology). */
const GOAL_GAP = 'Too few finishes at this pace.';
/**
 * Method, source and coverage copy, which since October 16, 2026 lives on /methodology only. Checked in the course page's
 * own text (the hero, the deks, notes, callouts, bibs, totals and the at-a-glance sentences), not inside the shared chart
 * and research components it embeds.
 */
const METHOD = [
  [/sustained slowdown is at least|25% slower|5–20 km pace/i, 'the sustained-slowdown definition'], [/doi:|published (?:slowdown )?method|published definition/i, 'a method citation'],
  [/\bsupplied\b|smoothed|open-meteo|modell?ed|\bsource\b|data producer|independently verified|context only|not an adjustment/i, 'a source or measurement note'],
  [/weighted equally|\bpooled?\b|start delays|largely repeat|copy edition|not counted|at least 100 finishes|fewer than 100|checkpoint times|in the data\b|story data|\bscreen/i, 'a cohort or coverage note'],
  [/About this data|how (?:it|they) (?:is|are) measured|what the types mean/i, 'a method section or link'],
];
const OWN_COPY = /<(p|dl|span|h2)\b[^>]*class="(?:hero-dek|course-hero-key|course-hero-sentence t-sentence|course-callout|course-hotcool|course-totals|course-h2|course-row-meta)"[^>]*>([\s\S]*?)<\/\1>/g;
const TRACK = { 'at-a-glance': 'chapter-1', 'finish-times': 'chapter-2', elevation: 'chapter-3', pacing: 'chapter-4', slowdown: 'chapter-5', goals: 'chapter-6', weather: 'chapter-7', plan: 'cta', 'other-courses': 'related' };

if (html) {
  assert.ok(fs.existsSync(path.join(OUT, 'courses.html')), `No export in ${OUT}: run npm run build first`);
  const { QUALIFYING_COURSE } = require(path.join(root, 'lib/tools/qualifying.ts'));
  const bandSlugs = new Set(paceBand.scopes.map((s) => s.slug));
  const projectorSlugs = new Set(projector.scopes.map((s) => s.slug));
  const weatherSlugs = new Set(weatherMatch.editions.map((e) => slugOf(e.city)));
  const planSlugs = new Set([...courseGoal.courses.map((c) => c.city), ...(courseGoal.screens.start_offset ?? []).map((e) => e.city), ...(courseGoal.screens.grid ?? []).map((e) => e.city),
    ...paceBand.scopes.flatMap((s) => (s.city ? [s.city] : []))].map(slugOf));
  const analysisCities = new Set(read('public/data/packs/ext_personalized_guide/summary.json').cities.map((c) => c.city));
  const N = require(path.join(root, 'lib/nuggets/index.ts'));
  const plainText = (text) => text.replace(/\*/g, '');
  /** Text as compared: textOf() puts a space where a tag closes, so none before punctuation. */
  const norm = (text) => text.replace(/\s+([.,:;!?’)])/g, '$1').replace(/\s+/g, ' ').trim();
  const said = (id, city) => { const n = N.getNugget(id, { city }); return plainText(N.textFor(n.guard ? n.headline : n.fallback, 'mi')); };
  const words = [];
  let factCount = 0;

  for (const city of CITIES) {
    const f = facts.get(city);
    const slug = slugOf(city);
    const where = `/courses/${slug}`;
    const file = path.join(OUT, 'courses', `${slug}.html`);
    if (!fs.existsSync(file)) { fail(where, 'not exported'); continue; }
    const full = fs.readFileSync(file, 'utf8');
    const body = markup(full);
    const main = /<main\b[\s\S]*<\/main>/.exec(body)?.[0] ?? '';
    const visible = textOf(main);
    words.push([slug, visible.split(/\s+/).length]);

    // Headings: one H1, the race name; no empty heading anywhere.
    const h1 = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    check(h1.length === 1, where, `${h1.length} H1 elements`);
    if (h1.length) check(innerText(h1[0][1]) === f.race, where, `H1 "${innerText(h1[0][1])}" is not the race name "${f.race}"`);
    for (const m of body.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)) check(textOf(m[2]).length > 0, where, `an empty <${m[1]}>`);

    // Sections: present exactly when the data gives them something to show (no heading over an empty chart), each with
    // its generic tracking id. The glance shows the rows whose guards hold (at most three, in order); with none it is
    // left out, and the page opens on its first difference.
    const GLANCE = ['course.start', 'course.late', 'course.signature'];
    // The start row stays out where #elevation's biggest climb is the same first 5K (one 5K, one climb said).
    const climbNugget = N.getNugget('course.climb', { city });
    const climbFirst = climbNugget.guard && Number(climbNugget.values.section) === 0;
    let glanceIds = GLANCE.filter((id) => { const n = N.getNugget(id, { city }); return n.guard && !!n.figure && (id !== 'course.start' || (!!f.route && !climbFirst)); });
    // The signature row stays out beside a row about the same stretch: the first 5K beside the start row, a section next
    // to the slowest 5K beside the late row.
    const sigAt = f.s.signature_section ? courses.sections.indexOf(f.s.signature_section) : -1, slowAt = f.s.slowest_section ? courses.sections.indexOf(f.s.slowest_section) : -1;
    if (glanceIds.includes('course.signature') && ((glanceIds.includes('course.late') && Math.abs(sigAt - slowAt) <= 1) || (glanceIds.includes('course.start') && sigAt === 0))) glanceIds = glanceIds.filter((id) => id !== 'course.signature');
    glanceIds = glanceIds.slice(0, 3);
    const goalsShown = !!f.ctx && f.ctx.editions >= courseGoal.min_editions;
    // The race mornings show only as the warmest/coolest contrast (5 °C or more) over three or more of them.
    const pairGap = f.hotCool ? Math.round((f.hotCool.hot.temp - f.hotCool.cool.temp) * 10) / 10 : null;
    const weatherShown = pairGap !== null && pairGap >= courses.weather.pairs.min_gap_c && f.weather.length >= 3;
    const want = {
      'at-a-glance': glanceIds.length > 0, 'finish-times': f.cells.length >= 3 && N.getNugget('course.times', { city }).guard, elevation: !!f.route, pacing: !!f.types,
      goals: goalsShown, weather: weatherShown, replay: replay.editions.some((e) => e.city === city),
    };
    for (const id of SECTIONS) {
      const present = sectionStart(body, id) >= 0;
      check(present === (want[id] ?? true), where, `section #${id} ${present ? 'present' : 'missing'}`);
      const fragment = present ? sectionOf(body, id) : null;
      if (fragment && TRACK[id]) check(new RegExp(`^<section[^>]*data-track-section="${TRACK[id]}"`).test(fragment), where, `#${id} is not marked ${TRACK[id]}`);
      if (fragment) check(/<h2\b/.test(fragment), where, `#${id} has no H2`);
    }
    check(/data-track-section="hero"/.test(body), where, 'the hero is not marked');
    // Each finding is its nugget's sentence, word for word (the default miles view), so a page says only what its
    // recount allows (scripts/nuggets/courses.cjs).
    const h2 = (id) => { const m = new RegExp(`<h2 id="${id}-title"[^>]*>([\\s\\S]*?)<\\/h2>`).exec(body); return m ? textOf(m[1]) : null; };
    for (const [id, nugget] of [['finish-times', 'course.times'], ['elevation', 'course.climb'], ['pacing', 'course.types'], ['slowdown', 'course.among'], ['goals', 'course.goal'], ['weather', 'course.weather']]) {
      if (sectionStart(body, id) < 0) continue;
      check(norm(h2(id) ?? '') === norm(said(nugget, city)), where, `#${id}'s finding "${h2(id)}" is not ${nugget}'s "${said(nugget, city)}"`);
    }
    // The hero's sentence is how far the share ran edition by edition (course.slowdown), shown only when its guard holds;
    // the year strip labels the two editions it names. Where the course sits among the others is #slowdown's H2.
    const heroSentence = textOf(/<p class="course-hero-sentence[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? '');
    const range = N.getNugget('course.slowdown', { city });
    if (range.guard) check(norm(heroSentence) === norm(said('course.slowdown', city)), where, `the hero's sentence "${heroSentence}" is not course.slowdown's`);
    else check(!body.includes('class="course-hero-sentence'), where, `the hero shows course.slowdown's fallback "${heroSentence}"`);
    const heroFigure = N.getNugget('course.slowdown', { city }).figure;
    const shownFigure = innerText(/<span class="big-number[^"]*"><span aria-hidden="true">([\s\S]*?)<\/span><span class="sr-only">/.exec(/<section class="night[\s\S]*?<\/section>/.exec(body)?.[0] ?? '')?.[1] ?? '');
    check(heroFigure && shownFigure === `${heroFigure.value}${heroFigure.unit}` && shownFigure === F.pct0(f.s.slowdown), where, `the hero figure "${shownFigure}" is not the course's share in whole percent (${F.pct0(f.s.slowdown)})`);
    // The figure averages the editions' shares, so its words name the average edition (course.slowdown's key), never a
    // share pooled over every finish.
    const heroKey = norm(textOf(/<p class="course-hero-key"[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? ''));
    const averaged = f.cells.length === 1 ? new RegExp(`^of finishes in ${f.cells[0].year} had`) : f.cells.length === 2 ? /in its two editions, on average,/ : /average edition/;
    check(heroKey === norm(N.getNugget('course.slowdown', { city }).key) && averaged.test(heroKey), where, `the hero figure's words "${heroKey}" do not name what the figure averages`);
    const glanceKeys = [...main.matchAll(/<span class="glance-key">([\s\S]*?)<\/span>/g)].map((m) => norm(textOf(m[1])));
    for (const id of GLANCE) {
      const n = N.getNugget(id, { city });
      const shown = glanceIds.includes(id);
      check(glanceKeys.includes(n.key) === shown, where, `glance row ${id}: ${shown ? 'missing' : 'shown without its guard'} ("${n.key}")`);
    }
    check(glanceKeys.length === glanceIds.length, where, `${glanceKeys.length} glance rows for ${glanceIds.length} guards`);
    const tracked = [...body.matchAll(/data-track-section="([^"]+)"/g)].map((m) => m[1]);
    check(new Set(tracked).size === tracked.length, where, `a section id repeats: ${tracked}`);

    // Every printed figure against its file.
    const seen = new Set();
    for (const m of main.matchAll(/<data\b([^>]*)>([\s\S]*?)<\/data>/g)) {
      const dataKey = attr(m[1], 'data-k');
      const value = attr(m[1], 'value');
      const shown = innerText(m[2]);
      factCount += 1;
      seen.add(dataKey);
      const kind = dataKey && kindOf(dataKey);
      const expected = kind ? resolve(dataKey, f) : undefined;
      if (!kind || expected === undefined || expected === null) { fail(where, `figure "${shown}" has an unknown key ${dataKey}`); continue; }
      check(value === String(expected), where, `${dataKey}: value ${value}, file ${expected}`);
      check(shown === F[kind](expected), where, `${dataKey}: shows "${shown}", expected "${F[kind](expected)}"`);
      if (/@(\d{4})$/.test(dataKey)) check(!isCopy(city, Number(dataKey.split('@')[1])), where, `${dataKey}: a copy edition printed with a number`);
    }
    for (const c of f.cells) for (const k of ['n', 'median', 'sd']) check(seen.has(`${k}@${c.year}`), where, `the ${c.year} row lacks ${k}`);
    for (const w of f.weather) for (const k of ['w.temp', 'w.dew', 'w.rh', 'w.wind']) check(seen.has(`${k}@${w.year}`), where, `the ${w.year} weather row lacks ${k}`);
    for (const [g, row] of f.goalRows) if (row && f.ctx && f.ctx.editions >= courseGoal.min_editions) check(seen.has(`g.n@${g}`) && seen.has(`g.sd@${g}`) && seen.has(`g.p50@${g}`), where, `goal ${g}: the row is not printed`);
    if (f.terrain && f.route) for (let i = 0; i < 9; i += 1) check(seen.has(`t.gain@${i}`), where, `section ${i} of the route is not printed`);
    for (const k of ['slowdown', 'block10', 'after20', 'median', ...(f.route ? [f.terrain ? 'route.gain' : 'geo.gain'] : [])]) check(seen.has(k), where, `${k} is not printed`);
    // One climb, everywhere on the page: every printed whole-route climb total is the same figure from the same key.
    const climbs = [...main.matchAll(/<data\b([^>]*)>/g)].map((m) => ({ k: attr(m[1], 'data-k'), v: attr(m[1], 'value') })).filter((d) => /^(?:geo|route|cg)\.gain$/.test(d.k ?? ''));
    check(new Set(climbs.map((d) => `${d.k}=${d.v}`)).size <= 1, where, `the page prints more than one whole-route climb: ${[...new Set(climbs.map((d) => `${d.k}=${d.v}`))].join(', ')}`);

    // Table cells hold figures, a dash or plain words; never another number.
    for (const table of main.matchAll(/<table class="[^"]*course-table[^"]*">([\s\S]*?)<\/table>/g)) {
      for (const td of table[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)) {
        const rest = innerText(td[2].replace(/<data\b[\s\S]*?<\/data>/g, ''));
        check(!/\d/.test(rest), where, `a table cell prints "${rest}" outside a checked figure`);
      }
    }
    // A goal with no published row says so in plain words, and only where the file has no row for it.
    for (const m of main.matchAll(/<td\b[^>]*class="course-reason"[^>]*data-goal="(\d+)"[^>]*>([\s\S]*?)<\/td>/g)) {
      check(!f.goalRows.get(Number(m[1])) && innerText(m[2]) === GOAL_GAP, where, `goal ${m[1]}: "${innerText(m[2])}" over a goal the file ${f.goalRows.get(Number(m[1])) ? 'has a row for' : 'has no row for'}`);
    }

    // The term is linked to its definition on /methodology at its first use, never defined or cited here.
    check(/sustained slowdown/i.test(visible), where, 'never says sustained slowdown');
    const firstUse = main.search(/sustained slowdown/i);
    const linked = new RegExp(`<a\\b[^>]*href="${SLOWDOWN_HREF}"[^>]*>sustained slowdown</a>`).exec(main);
    check(linked && main.slice(linked.index).search(/sustained slowdown/i) + linked.index === firstUse, where, `the first "sustained slowdown" is not linked to ${SLOWDOWN_HREF}`);
    check(!visible.includes(DOI) && !main.includes(DOI_URL) && !/at least 5 km after 20 km/.test(visible), where, 'the definition or its DOI is on the page');

    // The page's own text carries findings only: no method, source or coverage copy, and no "About this data".
    for (const copy of [...[...main.matchAll(OWN_COPY)].map((m) => m[2]), /<div class="course-glance">([\s\S]*?)<\/div>/.exec(main)?.[1] ?? ''].map(textOf)) {
      for (const [pattern, label] of METHOD) { const hit = pattern.exec(copy); check(!hit, where, `${label} ("${hit && hit[0]}"): ${copy.slice(0, 140)}`); }
    }
    check(!/About this data/i.test(visible) && sectionStart(body, 'data') < 0, where, 'an "About this data" section');

    const head = /<head\b[\s\S]*?<\/head>/.exec(full)?.[0] ?? '';
    // The course total is named with the editions that make it up (Amsterdam: 13 with 2023's 14 finishes, not the 12 with a
    // row): a paragraph, list item or stat list that prints it prints no other edition count or year list. The description too.
    const countedYears = f.counted.years.join(',');
    for (const m of main.matchAll(/<(p|li|dl)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      if (!m[2].includes('data-k="finishes"')) continue;
      for (const d of m[2].matchAll(/<data\b([^>]*)>/g)) {
        const k = attr(d[1], 'data-k'), v = attr(d[1], 'value');
        if (k === 'editions' || k === 'counted.editions') check(Number(v) === f.counted.editions, where, `the course total of ${F.count(f.s.finishes)} finishes is printed with ${v} editions; ${f.counted.editions} make it up: ${textOf(m[2]).slice(0, 120)}`);
        if (k === 'years' || k === 'counted.years') check(v === countedYears, where, `the course total is printed with the years ${v}; ${countedYears} make it up`);
      }
    }
    const description = decode(/<meta name="description" content="([^"]*)"/.exec(head)?.[1] ?? '');
    const across = /across ([\d,]+) editions(?: \((\d{4})–(\d{4})\))?/.exec(description), inIts = /in its (\d{4}) edition/.exec(description);
    check(description.includes(`${F.count(f.s.finishes)} `), where, `the description does not print the course total: ${description}`);
    if (across) check(Number(across[1].replace(/,/g, '')) === f.counted.editions && (!across[2] || (Number(across[2]) === f.counted.years[0] && Number(across[3]) === f.counted.years[f.counted.years.length - 1])), where, `the description names ${across[0]}; ${f.counted.editions} editions (${f.counted.years[0]}–${f.counted.years[f.counted.years.length - 1]}) make up the total`);
    if (inIts) check(f.counted.editions === 1 && Number(inIts[1]) === f.counted.years[0], where, `the description names ${inIts[0]}; ${f.counted.editions} editions make up the total`);

    // Words: banned anywhere in the visible page or its head; rank words in the course content.
    const metaText = [...head.matchAll(/<title>([\s\S]*?)<\/title>|content="([^"]*)"/g)].map((m) => decode(m[1] ?? m[2] ?? '')).join(' ');
    for (const [pattern, label] of BANNED) check(!pattern.test(textOf(body)) && !pattern.test(metaText), where, `${label} on the page`);
    const rank = RANK.exec(visible);
    check(!rank, where, `rank word "${rank && rank[0]}": …${rank ? visible.slice(Math.max(0, rank.index - 60), rank.index + 40) : ''}…`);

    // Copy editions: never a row or a figure, never explained here (that is /methodology's), and no figure that still
    // counts them.
    const numbers = /<details[^>]*id="all-numbers"[\s\S]*?<\/details>/.exec(main)?.[0] ?? '';
    check(numbers.length > 0, where, 'no "All numbers"');
    const editionTable = /<table\b[\s\S]*?<\/table>/.exec(numbers.slice(numbers.indexOf('numbers-editions-caption') - 400))?.[0] ?? '';
    for (const copy of f.copies) {
      const table = editionTable;
      check(!table.includes(`<th scope="row">${copy.year}</th>`), where, `copy edition ${copy.year} has a row in the finish-times table`);
      check(!/largely repeat|shown as recorded times only/.test(visible), where, `copy edition ${copy.year}: the copy-edition sentence is on the page`);
      if (f.allFinisherPct) check(!visible.includes(f.allFinisherPct), where, `the all-finisher figure ${f.allFinisherPct}, which counts the copies, is printed`);
    }

    // Elevation: the two climb totals each under its own label where both are printed, and "two ways" only over two.
    if (f.route) {
      const elevation = textOf(sectionOf(body, 'elevation') ?? '');
      const totalsList = /<dl class="course-totals">[\s\S]*?<\/dl>/.exec(sectionOf(body, 'elevation') ?? '')?.[0] ?? '';
      // One climb total under the chart (the route's), so two climb figures never sit side by side; the chart's readout
      // gives one section's climb at a time.
      // One climb total: the sums of the route's sections (the readout's climbs), so the whole never climbs less than a 5K.
      const total = f.terrain ? 'route.gain' : 'geo.gain';
      check(/^Whole route Climbs/.test(textOf(totalsList)) && (totalsList.match(/data-k="(?:geo|cg|route)\.gain"/g) ?? []).length === 1 && totalsList.includes(`data-k="${total}"`), where, `the climb total: "${textOf(totalsList)}"`);
      if (f.terrain) check(f.terrain.every((x) => x.gain_m <= resolve('route.gain', f) + 0.05), where, 'a 5K section climbs more than the whole route');
      const promise = /\btwo ways\b|\b(?:both|two) (?:climb )?(?:totals|measures|measurements)\b/i.exec(elevation);
      check(!promise, where, `#elevation promises "${promise && promise[0]}"`);
      check((/<section class="night[\s\S]*?<\/section>/.exec(body)?.[0] ?? '').includes(`data-k="${total}"`), where, 'the hero does not print the climb');
    }

    // Weather: the 5 °C gate, the slope sentence for the courses with one, and context.
    const gap = f.hotCool ? Math.round((f.hotCool.hot.temp - f.hotCool.cool.temp) * 10) / 10 : null;
    check(body.includes('class="course-hotcool"') === (gap !== null && gap >= courses.weather.pairs.min_gap_c && f.weather.length >= 3), where, `the coolest/warmest sentence against a ${gap} °C gap over ${f.weather.length} mornings`);
    check(!body.includes('class="course-slope"'), where, 'the within-course slope sentence (cut under section 00) is back');
    if (!body.includes('class="course-hotcool"')) {
      const names = [...(sectionOf(body, 'weather') ?? '').matchAll(/\s(?:aria-label|title)="([^"]*)"/g)].map((m) => decode(m[1])).filter((n) => /warmest|coolest/i.test(n));
      check(!names.length, where, `the warmest/coolest pairing in an accessible name without the 5 °C gap: ${names[0]}`);
    }
    // The weather records' source and their "not independently verified" flag are /methodology's: no source link here.
    const sources = [...new Set(f.weather.map((w) => shards.get(key(city, w.year))?.weather?.documentation_url).filter(Boolean))];
    for (const url of sources) check(!main.includes(`href="${url}"`), where, `the weather source link ${url} is on the page`);

    // Links: exported pages only; course presets only where the target publishes the course.
    const hrefs = [...main.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => decode(m[1]));
    const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const href of hrefs) {
      if (href.startsWith('#')) { check(ids.has(href.slice(1)), where, `${href} has no target`); continue; }
      if (/^https?:/.test(href)) { check(href.startsWith('https://splithappens.run/') || /^https:\/\/github\.com\/koolkam00\//.test(href), where, `outside link ${href}`); continue; }
      if (href.startsWith('/data/')) { check(fs.existsSync(path.join(root, 'public', href.split('?')[0])), where, `${href} is not a published file`); continue; }
      const url = new URL(href, 'https://splithappens.run');
      check(exported(url.pathname), where, `${href} is not an exported page`);
      check(!url.searchParams.has('units'), where, `${href} carries units`);
      const course = url.searchParams.get('course');
      if (course !== null) {
        const scope = { '/tools/plan': planSlugs, '/tools/pace-band': bandSlugs, '/tools/split-check': bandSlugs, '/tools/projector': projectorSlugs, '/tools/weather-match': weatherSlugs }[url.pathname];
        check(scope && scope.has(course) && course === slug, where, `${href}: course ${course} is not this course or not published by ${url.pathname}`);
      }
      const goal = url.searchParams.get('goal');
      if (goal !== null && url.pathname === '/tools/plan') check(/^\d:\d\d$/.test(goal) && P.COURSE_GOALS.some((g) => P.goalText(g) === goal), where, `${href}: goal`);
      const raceParam = url.searchParams.get('race');
      if (raceParam !== null) check(url.pathname.startsWith('/analyses/') && analysisCities.has(raceParam) && raceParam === city, where, `${href}: race ${raceParam}`);
      if (url.pathname === '/analyses/course-comparison' && raceParam !== null) check(COMPARE.has(city), where, `${href}: the course comparison has no result for ${city}`);
      if (url.pathname === '/analyses/hills-and-pacing' && raceParam !== null) check(HILLS_LINK.has(city), where, `${href}: hills and pacing has no route for ${city}`);
      const qualifying = /^\/tools\/qualifying\/([a-z]+)$/.exec(url.pathname);
      if (qualifying) check(QUALIFYING_COURSE[qualifying[1]] === city, where, `${href} is another race's qualifying page`);
    }
    check(hrefs.includes(`/tools/plan?course=${slug}`), where, 'no link to the planner for this course');
    check(new RegExp(`<a\\b[^>]*href="/tools/plan\\?course=${slug}"[^>]*>(?:<[^>]+>)*Plan your ${city === 'New York' ? 'New York City' : city}<`).test(main), where, 'no "Plan your …" button to the planner');
    const key_ = Object.keys(QUALIFYING_COURSE).find((k) => QUALIFYING_COURSE[k] === city);
    check(hrefs.includes(`/tools/qualifying/${key_}`) === !!key_, where, key_ ? 'no link back to its qualifying page' : 'a qualifying link on a course without standards');
    if (bandSlugs.has(slug)) check(hrefs.includes(`/tools/pace-band?course=${slug}`) && hrefs.includes(`/tools/split-check?course=${slug}`), where, 'no pace band or split check preset for a course they publish');

    // Tables scroll sideways in a named region that takes keyboard focus, labelled by the table's caption.
    for (const m of main.matchAll(/<div\b([^>]*class="tool-table-wrap course-table-wrap"[^>]*)>\s*<table\b[^>]*>\s*<caption\b([^>]*)>/g)) {
      const labelledBy = attr(m[1], 'aria-labelledby');
      check(attr(m[1], 'role') === 'region' && attr(m[1], 'tabindex') === '0' && labelledBy && attr(m[2], 'id') === labelledBy, where, `a table region without its name: ${m[1]}`);
    }
    check((main.match(/class="tool-table-wrap course-table-wrap"/g) ?? []).length === (main.match(/<table class="[^"]*course-table/g) ?? []).length, where, 'a course table outside its region');
    // Goal links name where they go; the dek promises five rows only over the table.
    for (const m of main.matchAll(/<th scope="row"><a\b([^>]*)>([^<]*)<(?:svg|\/a)/g)) {
      if (/\/tools\/plan/.test(attr(m[1], 'href') ?? '')) check(attr(m[1], 'aria-label') === `Plan a ${m[2]} ${f.race}`, where, `goal link ${m[2]}: name "${attr(m[1], 'aria-label')}"`);
    }
    // The goal rows are #goals' chart: each of the five goals links to the planner for this course (S1 follows one).
    const goalsSection = sectionOf(body, 'goals') ?? '';
    const goalLinks = [...goalsSection.matchAll(/<tbody>[\s\S]*?<\/tbody>/g)].flatMap((t) => [...t[0].matchAll(/<th scope="row"><a\b[^>]*href="([^"]+)"/g)].map((m) => decode(m[1])));
    check(goalLinks.length === (goalsShown ? P.COURSE_GOALS.length : 0), where, `#goals links ${goalLinks.length} goals to the planner`);

    // Editions in the data with no row (fewer than 100 finishes) never get a row of their own.
    for (const year of f.smallYears) check(!editionTable.includes(`<th scope="row">${year}</th>`), where, `${year}, under 100 finishes, has a row`);

    // Structured data: the breadcrumbs only.
    const types = [...full.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [].concat(JSON.parse(m[1])).map((x) => x['@type']));
    check(JSON.stringify(types) === '["BreadcrumbList"]', where, `structured data ${types}`);
  }

  // /courses: the ItemList of the 29 pages in their order, and the breadcrumbs.
  {
    const where = '/courses';
    const full = fs.readFileSync(path.join(OUT, 'courses.html'), 'utf8');
    const blocks = [...full.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [].concat(JSON.parse(m[1])));
    const list = blocks.find((b) => b['@type'] === 'ItemList');
    check(blocks.some((b) => b['@type'] === 'BreadcrumbList'), where, 'no BreadcrumbList');
    check(list && list.numberOfItems === CITIES.length && list.itemListElement.length === CITIES.length, where, 'no ItemList of every course');
    if (list) list.itemListElement.forEach((item, i) => {
      const city = CITIES[i];
      check(item['@type'] === 'ListItem' && item.position === i + 1 && item.url === `https://splithappens.run/courses/${slugOf(city)}` && item.name === facts.get(city)?.race, where, `item ${i + 1}: ${JSON.stringify(item)}`);
    });
    // Each row's sustained-slowdown share is the one its course page leads with (the story data, without copy
    // editions, in whole percent), and no row carries coverage copy.
    const rows = new Map([...markup(full).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => attr(m[1], 'class') === 'course-index-row')
      .map((m) => [(attr(m[1], 'href') ?? '').replace(/^\/courses\//, ''), m[2]]));
    check(rows.size === CITIES.length, where, `${rows.size} course rows for ${CITIES.length} courses`);
    for (const city of CITIES) {
      const row = rows.get(slugOf(city)) ?? '';
      const d = /<data\b([^>]*)>([\s\S]*?)<\/data>/.exec(row);
      const s0 = facts.get(city).s.slowdown;
      check(d && attr(d[1], 'data-k') === 'slowdown.r' && attr(d[1], 'value') === String(s0) && innerText(d[2]) === F.pct0(s0), where, `the ${city} row: ${d ? innerText(d[2]) : 'no share'} against the page's ${F.pct0(s0)}`);
      check(!/with complete splits|supplied/i.test(textOf(row)), where, `the ${city} row carries coverage copy: "${textOf(row)}"`);
    }
    // The reading's range leaves out the courses with fewer than three editions: they follow under their own label, and
    // the range's own ends are the extremes of the rest.
    const footList = /<ol class="course-index is-foot"[\s\S]*?<\/ol>/.exec(markup(full))?.[0] ?? '';
    const footSlugs = [...footList.matchAll(/href="\/courses\/([^"?#]+)/g)].map((m) => m[1]).sort();
    const fewSlugs = CITIES.filter((c) => facts.get(c).s.editions < 3).map(slugOf).sort();
    check(JSON.stringify(footSlugs) === JSON.stringify(fewSlugs), where, `the courses under "Fewer than three editions" are ${footSlugs}, not ${fewSlugs}`);
    const solidShares = CITIES.filter((c) => facts.get(c).s.editions >= 3).map((c) => facts.get(c).s.slowdown);
    const figure = textOf(/<div class="reading-figure[\s\S]*?<\/div>/.exec(markup(full))?.[0] ?? '');
    check(figure.includes(`${F.pct0(Math.min(...solidShares)).replace('%', '')}–${F.pct0(Math.max(...solidShares)).replace('%', '')}`) && /three or more editions/.test(figure), where, `the reading "${figure}" is not the range of the courses with three or more editions`);
    const dek = textOf(/<p class="reading-dek">([\s\S]*?)<\/p>/.exec(markup(full))?.[1] ?? '');
    check(dek.length > 0 && !/supplied|route file/i.test(dek), where, `the /courses dek names a data source or is missing: "${dek}"`);
    const main = /<main\b[\s\S]*<\/main>/.exec(markup(full))?.[0] ?? '';
    const rank = RANK.exec(textOf(main));
    check(!rank, where, `rank word "${rank && rank[0]}"`);
    for (const [pattern, label] of BANNED) check(!pattern.test(textOf(main)), where, `${label} on the page`);
  }
  words.sort((a, b) => a[1] - b[1]);
  console.log(`Course pages: ${CITIES.length} pages, ${factCount} printed figures checked; ${words[0][1]}–${words[words.length - 1][1]} words of main text (${words[0][0]} to ${words[words.length - 1][0]}).`);
}

if (failures.length) {
  console.error(`verify-courses: ${failures.length} problem${failures.length === 1 ? '' : 's'}`);
  for (const line of failures.slice(0, 60)) console.error(`  ${line}`);
  process.exit(1);
}
console.log(html ? 'verify-courses --html: every course page and /courses passed.' : `verify-courses: helpers and the recount passed for ${CITIES.length} courses (${shards.size} runner-context shards).`);
