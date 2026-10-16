// Checks the course pages (/courses/<slug>, lib/course-page.ts and components/course/) and the /courses index.
//   Data checks (the last step of `npm run verify:data`):
//     1. the page helpers on small hand-made fixtures (formats, the 5 °C gate, year lists, neighbours, months, titles);
//     2. an independent recount from the published files, written without the page code: every edition's finishes
//        against its checksum-verified runner-context shard, the course totals, medians and sustained-slowdown range
//        against the editions, the weather in courses.json against the shards and the weather-match file, the route's
//        5 km sections against the course chooser's totals, and the course-profile pack against the story cohort.
//   Built-page checks (`--html`, appended to `npm run verify:seo`, after the build), on all 29 pages:
//     3. every printed figure (<data data-k>) against its file, both its value and the text shown (the default miles
//        view), every edition and goal row present, no other number in a table cell; one H1, no empty heading, the
//        sections the data supports and no others; the DOI where "sustained slowdown" is defined; banned and rank words;
//        copy editions never printed with numbers; both elevation labels; the 5 °C gate; links only to exported pages,
//        with course presets only where the target tool publishes the course; the planner on every page and the
//        qualifying page on the six qualifying courses; no structured data beyond the breadcrumbs; and the ItemList on
//        /courses.
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
  degF: (c) => `${(c * 1.8 + 32).toFixed(0)}°F`,
  mph: (mps) => `${(mps * 2.2369362920544).toFixed(1)} mph`,
  rh: (h) => `${Math.round(h)}%`,
  date: (iso) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`,
  text: (s) => String(s),
  section: (label) => { const [a, b] = SECTION_BOUNDS[SECTION_NAMES.indexOf(label)]; return `${(a / KM_PER_MILE).toFixed(1)}–${(b / KM_PER_MILE).toFixed(1)} mi`; },
  slopeF: (perC) => { const v = perC / 1.8; return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} percentage points per °F`; },
  r2: (r) => minus(`${r < 0 ? '-' : ''}${Math.abs(r).toFixed(2)}`),
};

// ---------- 1. Helpers on hand-made fixtures ----------
const P = require(path.join(root, 'lib/course-page.ts'));
{
  assert.equal(P.pct(0.2181), '21.8%');
  assert.equal(P.pct(0), '0.0%');
  assert.equal(P.clock(13111), '3:38:31');
  assert.equal(P.clock(12510.4), '3:28:30');
  assert.equal(P.minutes(565), '9:25');
  assert.equal(P.goalText(210), '3:30');
  assert.equal(P.goalText(300), '5:00');
  assert.equal(P.shortDate('2018-04-16'), 'Apr 16');
  assert.equal(P.shortDate('2024-10-13'), 'Oct 13');
  assert.equal(P.yearList([2026, 2018, 2019, 2022, 2023, 2024, 2025]), '2018, 2019 and 2022–2026');
  assert.equal(P.yearList([2018, 2019]), '2018 and 2019');
  assert.equal(P.yearList([2022]), '2022');
  assert.equal(P.yearList([2015, 2017, 2024, 2025]), '2015, 2017, 2024 and 2025');
  for (const list of [[2026, 2018, 2019, 2022, 2023, 2024, 2025], [2018, 2019], [2022], [2005, 2006, 2007, 2009, 2010, 2011, 2013]]) assert.equal(F.years(list.join(',')), P.yearList(list), 'The verifier and the page list years alike');
  // The 5 °C gate: shown at the gap, hidden under it (Sydney's editions are 1.5 °C apart), float noise ignored.
  const pair = (hot, cool) => ({ hot: { temp: hot }, cool: { temp: cool } });
  assert.equal(P.hotCoolShown(pair(9.6, 8.1), 5), null);
  assert.equal(P.hotCoolShown(pair(13.4, 9.6), 5), null, 'Oslo-like 3.8 °C gap');
  assert.ok(P.hotCoolShown(pair(10.1, 5.1), 5), 'exactly the gap is shown');
  assert.ok(P.hotCoolShown(pair(13.7, 8.7), 5), '13.7 − 8.7 is 5 °C despite float noise');
  assert.equal(P.hotCoolShown(undefined, 5), null);
  assert.equal(P.hotCoolShown(pair(30, 0), NaN), null);
  const range = P.medianRange([{ year: 2018, median_s: 3 }, { year: 2019, median_s: 1 }, { year: 2020, median_s: 3 }, { year: 2021, median_s: 1 }]);
  assert.deepEqual([range.lo.year, range.hi.year], [2019, 2018], 'ties take the first edition');
  assert.equal(P.medianRange([]), null);
  assert.deepEqual(P.alphabeticalNeighbours(['A', 'B', 'C'], 'A'), ['C', 'B'], 'wraps at the start');
  assert.deepEqual(P.alphabeticalNeighbours(['A', 'B', 'C'], 'C'), ['B', 'A'], 'wraps at the end');
  assert.deepEqual(P.alphabeticalNeighbours(['A', 'B'], 'A'), ['B']);
  assert.deepEqual(P.alphabeticalNeighbours(['A'], 'A'), []);
  const months = new Map([['A', [4, 10]], ['B', [10]], ['C', [4]], ['D', []], ['E', [10]]]);
  assert.deepEqual(P.sameMonthCourses(months, 'A'), [{ month: 4, cities: ['C'] }, { month: 10, cities: ['B', 'E'] }]);
  assert.deepEqual(P.sameMonthCourses(months, 'D'), []);
  assert.deepEqual(P.sameMonthCourses(new Map([['A', [1]], ['B', [2]]]), 'A'), [], 'months with no other course are left out');
  assert.equal(P.courseTitle('X Marathon', true), 'X Marathon: Elevation, Pacing and Finish Times | Pace Notes');
  assert.equal(P.courseTitle('Boston Marathon', true), 'Boston Marathon: Elevation, Pacing and Finish Times', 'the brand only when the title fits 60 characters');
  assert.equal(P.courseTitle('Vienna City Marathon', false), 'Vienna City Marathon: Pacing and Finish Times by Year');
  const long = P.courseDescription('A Very Long Race Name Marathon of the Twin Cities', { finishes: 123456, editions: 12, years: [2005, 2025] }, true, true);
  assert.ok(long.length <= P.MAX_DESCRIPTION, 'descriptions drop clauses to fit');
  assert.equal(P.courseDescription('Y Marathon', { finishes: 416, editions: 1, years: [2015] }, false, false), 'Y Marathon finish times by year and how 416 recorded finishes paced each 5 km in its 2015 edition.');
}

// ---------- 2. Independent recount from the published files ----------
const manifest = read('public/data/insights/manifest.json');
const insight = (name) => {
  const bytes = fs.readFileSync(path.join(root, 'public/data/insights', name));
  assert.ok(manifest.files[name] && manifest.files[name].bytes === bytes.length && manifest.files[name].sha256 === sha256(bytes), `${name}: checksum against the insights manifest`);
  return JSON.parse(bytes.toString());
};
const courses = insight('courses.json');
const geometry = insight('course-geometry.json').courses;
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
assert.equal(CITIES.length, 29, '29 course pages');

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
    types: archetypes.courses.find((c) => c.city === city) ?? null,
    slope: courses.weather.per_course_slopes.find((x) => x.city === city) ?? null,
    copies: copies.filter((c) => c.city === city),
    race: (route && route.race) || s.race || `${city} Marathon`,
    allFinisherPct: af ? `${af.slowdown_pct.toFixed(1)}%` : null,
  });
}
check(CITIES.every((city) => slugOf(city) === P.coursePages().get(slugOf(city))?.slug), 'data', 'the page model has every course');

// ---------- 3. Built pages ----------
const KINDS = {
  finishes: 'count', editions: 'count', median: 'clock', 'median.lo': 'clock', 'median.hi': 'clock', 'median.lo.year': 'year', 'median.hi.year': 'year',
  slowdown: 'pct', 'slowdown.lo': 'pct', 'slowdown.hi': 'pct', 'slowdown.lo.year': 'year', 'slowdown.hi.year': 'year', block10: 'pct', after20: 'min', years: 'years',
  'shape.editions': 'count', 'shape.courses': 'count', 'identified.correct': 'count', 'identified.editions': 'count', slowest: 'section',
  n: 'count', 'median@': 'clock', sd: 'pct', temp: 'degF', date: 'date', small: 'count',
  'geo.distance': 'mi1', 'geo.distance2': 'mi2', 'geo.gain': 'ft', 'geo.loss': 'ft', 'geo.min': 'ft', 'geo.max': 'ft',
  'cg.gain': 'ft', 'cg.loss': 'ft', 'cg.net': 'netft', 'cg.editions': 'count', 'cg.finishes': 'count', 't.gain': 'ft', 't.loss': 'ft', 't.net': 'netft',
  'g.n': 'count', 'g.ed': 'count', 'g.under': 'pct', 'g.sd': 'pct', 'g.after20': 'min', 'g.p10': 'clock', 'g.p50': 'clock', 'g.p90': 'clock',
  'ty.finishes': 'count', 'ty.editions': 'count', 'ty.share': 'pct0', 'ty.all': 'pct0', 'profile.n': 'count',
  'w.start': 'text', 'w.temp': 'degF', 'w.dew': 'degF', 'w.rh': 'rh', 'w.wind': 'mph',
  'hc.cool.year': 'year', 'hc.hot.year': 'year', 'hc.cool.temp': 'degF', 'hc.hot.temp': 'degF', 'hc.cool.sd': 'pct', 'hc.hot.sd': 'pct',
  slope: 'slopeF', 'slope.r': 'r2', 'slope.editions': 'count',
};

/** The file value a key names for a city, or undefined. */
function resolve(dataKey, f) {
  const [name, at] = dataKey.split('@');
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
    case 'geo.distance': case 'geo.distance2': return f.route?.distance_km;
    case 'geo.gain': return f.route?.gain_m;
    case 'geo.loss': return f.route?.loss_m;
    case 'geo.min': return f.route?.min_m;
    case 'geo.max': return f.route?.max_m;
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
    default: return undefined;
  }
}
const kindOf = (dataKey) => { const [name, at] = dataKey.split('@'); return KINDS[at !== undefined && KINDS[`${name}@`] ? `${name}@` : name]; };

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

const BANNED = [[/\bthe wall\b/i, '"the wall"'], [/arithmetic/i, '"arithmetic"'], [/\byour(?:\s+\w+){0,2}\s+chances?\b/i, '"your chance"'], [/private-export/i, 'a release tag'], [/20260912/, 'a release date']];
const RANK = /\b(?:rank|ranks|ranked|ranking|rankings|fastest|toughest|hardest|easiest|harder|easier|tougher|similar|best|worst|top \d+)\b/i;
const DOI = 'doi:10.1371/journal.pone.0251513';
const DOI_URL = 'https://doi.org/10.1371/journal.pone.0251513';
const SECTIONS = ['at-a-glance', 'finish-times', 'elevation', 'pacing', 'slowdown', 'goals', 'weather', 'plan', 'replay', 'data', 'other-courses'];
const TRACK = { 'at-a-glance': 'chapter-1', 'finish-times': 'chapter-2', elevation: 'chapter-3', pacing: 'chapter-4', slowdown: 'chapter-5', goals: 'chapter-6', weather: 'chapter-7', plan: 'cta', 'other-courses': 'related' };

if (html) {
  assert.ok(fs.existsSync(path.join(OUT, 'courses.html')), `No export in ${OUT}: run npm run build first`);
  const planText = require(path.join(root, 'lib/tools/plan.ts'));
  const { QUALIFYING_COURSE } = require(path.join(root, 'lib/tools/qualifying.ts'));
  const bandSlugs = new Set(paceBand.scopes.map((s) => s.slug));
  const projectorSlugs = new Set(projector.scopes.map((s) => s.slug));
  const weatherSlugs = new Set(weatherMatch.editions.map((e) => slugOf(e.city)));
  const planSlugs = new Set([...courseGoal.courses.map((c) => c.city), ...(courseGoal.screens.start_offset ?? []).map((e) => e.city), ...(courseGoal.screens.grid ?? []).map((e) => e.city),
    ...paceBand.scopes.flatMap((s) => (s.city ? [s.city] : []))].map(slugOf));
  const analysisCities = new Set(read('public/data/packs/ext_personalized_guide/summary.json').cities.map((c) => c.city));
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

    // Sections: present exactly when the data supports them, each with its generic tracking id.
    const want = { elevation: !!f.route, weather: f.weather.length > 0, replay: replay.editions.some((e) => e.city === city) };
    for (const id of SECTIONS) {
      const present = sectionStart(body, id) >= 0;
      check(present === (want[id] ?? true), where, `section #${id} ${present ? 'present' : 'missing'}`);
      const fragment = present ? sectionOf(body, id) : null;
      if (fragment && TRACK[id]) check(new RegExp(`^<section[^>]*data-track-section="${TRACK[id]}"`).test(fragment), where, `#${id} is not marked ${TRACK[id]}`);
      if (fragment) check(/<h2\b/.test(fragment), where, `#${id} has no H2`);
    }
    check(/data-track-section="hero"/.test(body), where, 'the hero is not marked');
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
    for (const k of ['finishes', 'editions', 'slowdown', 'block10', 'after20']) check(seen.has(k), where, `${k} is not printed`);

    // Table cells hold figures, a dash or plain words; never another number.
    for (const table of main.matchAll(/<table class="[^"]*course-table[^"]*">([\s\S]*?)<\/table>/g)) {
      for (const td of table[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)) {
        const rest = innerText(td[2].replace(/<data\b[\s\S]*?<\/data>/g, ''));
        if (/course-reason/.test(td[1])) continue;
        check(!/\d/.test(rest), where, `a table cell prints "${rest}" outside a checked figure`);
      }
    }
    // Goal reasons are the course chooser's own words for the file's reasons.
    for (const m of main.matchAll(/<td\b[^>]*class="course-reason"[^>]*data-goal="(\d+)"[^>]*>([\s\S]*?)<\/td>/g)) {
      const gap = courseGoal.unavailable.find((u) => u.city === city && u.goal === Number(m[1]));
      check(gap && innerText(m[2]) === planText.courseGoalReason(gap.reason, courseGoal.min_editions), where, `goal ${m[1]}: reason "${innerText(m[2])}"`);
    }

    // The definition and its citation where the term is defined.
    const slowdown = sectionOf(body, 'slowdown') ?? '';
    check(/sustained slowdown/i.test(visible), where, 'never says sustained slowdown');
    check(textOf(slowdown).includes('A sustained slowdown is at least 5 km after 20 km run at least 25% slower') && textOf(slowdown).includes(DOI) && slowdown.includes(`href="${DOI_URL}"`), where, 'the definition and its DOI are not in #slowdown');

    // Words: banned anywhere in the visible page or its head; rank words in the course content.
    const head = /<head\b[\s\S]*?<\/head>/.exec(full)?.[0] ?? '';
    const metaText = [...head.matchAll(/<title>([\s\S]*?)<\/title>|content="([^"]*)"/g)].map((m) => decode(m[1] ?? m[2] ?? '')).join(' ');
    for (const [pattern, label] of BANNED) check(!pattern.test(textOf(body)) && !pattern.test(metaText), where, `${label} on the page`);
    const rank = RANK.exec(visible);
    check(!rank, where, `rank word "${rank && rank[0]}": …${rank ? visible.slice(Math.max(0, rank.index - 60), rank.index + 40) : ''}…`);

    // Copy editions: listed without numbers, explained once each, and no figure that still counts them.
    for (const copy of f.copies) {
      const row = new RegExp(`<tr class="is-copy" data-copy-year="${copy.year}">([\\s\\S]*?)</tr>`).exec(main);
      check(row && !/\d/.test(innerText(row[1]).replace(String(copy.year), '')), where, `copy edition ${copy.year}: its row is missing or has a number`);
      const sentence = `${city} ${copy.year}'s records largely repeat the ${city} ${copy.duplicate_of} field (${copy.identical_nine_time_twins.toLocaleString('en-US')} of its ${copy.eligible_removed.toLocaleString('en-US')} finishes share all nine checkpoint times with a ${copy.duplicate_of} finish), so they are shown as recorded times only, without pacing, peer or weather comparisons.`;
      check(textOf(sectionOf(body, 'finish-times') ?? '').split(sentence).length === 2, where, `copy edition ${copy.year}: its sentence is not under the table exactly once`);
      if (f.allFinisherPct) check(!visible.includes(f.allFinisherPct), where, `the all-finisher figure ${f.allFinisherPct}, which counts the copies, is printed`);
    }

    // Elevation: both totals labelled by method, and context, not an adjustment.
    if (f.route) {
      const elevation = textOf(sectionOf(body, 'elevation') ?? '');
      check(/smoothed route profile/i.test(elevation) && (f.ctx?.gain_m == null || /sum of the 5 km sections/i.test(elevation)), where, 'an elevation total without its method label');
      check(elevation.includes('Current supplied route; context only, not an adjustment'), where, 'the elevation context line is missing');
      check(/smoothed route profile/i.test(textOf(/<section class="night[\s\S]*?<\/section>/.exec(body)?.[0] ?? '')), where, 'the hero climb is not labelled');
    }

    // Weather: the 5 °C gate, the slope sentence for the courses with one, and context.
    const gap = f.hotCool ? Math.round((f.hotCool.hot.temp - f.hotCool.cool.temp) * 10) / 10 : null;
    check(body.includes('class="course-hotcool"') === (gap !== null && gap >= courses.weather.pairs.min_gap_c), where, `the coolest/warmest sentence against a ${gap} °C gap`);
    check(body.includes('class="course-slope"') === !!f.slope, where, 'the within-course slope sentence');
    if (f.weather.length) check(/context only, not an adjustment/i.test(textOf(sectionOf(body, 'weather') ?? '')), where, 'weather without "context only, not an adjustment"');

    // Start delays: noted where the shape views leave editions out.
    const offset = courses.shape_cohort.start_offset_editions.filter((e) => e.city === city);
    check(/start delays/.test(textOf(sectionOf(body, 'pacing') ?? '')) === offset.length > 0, where, 'the start-offset note');

    // Links: exported pages only; course presets only where the target publishes the course.
    const hrefs = [...main.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => decode(m[1]));
    const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const href of hrefs) {
      if (href.startsWith('#')) { check(ids.has(href.slice(1)), where, `${href} has no target`); continue; }
      if (/^https?:/.test(href)) { check(href === DOI_URL || href.startsWith('https://splithappens.run/') || /^https:\/\/github\.com\/koolkam00\//.test(href), where, `outside link ${href}`); continue; }
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
      const qualifying = /^\/tools\/qualifying\/([a-z]+)$/.exec(url.pathname);
      if (qualifying) check(QUALIFYING_COURSE[qualifying[1]] === city, where, `${href} is another race's qualifying page`);
    }
    check(hrefs.includes(`/tools/plan?course=${slug}`), where, 'no link to the planner for this course');
    check(/>Plan your [^<]*<\/a>/.test(main.replace(/<!--[\s\S]*?-->/g, '')), where, 'no "Plan your …" button');
    const key_ = Object.keys(QUALIFYING_COURSE).find((k) => QUALIFYING_COURSE[k] === city);
    check(hrefs.includes(`/tools/qualifying/${key_}`) === !!key_, where, key_ ? 'no link back to its qualifying page' : 'a qualifying link on a course without standards');
    if (bandSlugs.has(slug)) check(hrefs.includes(`/tools/pace-band?course=${slug}`) && hrefs.includes(`/tools/split-check?course=${slug}`), where, 'no pace band or split check preset for a course they publish');

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
