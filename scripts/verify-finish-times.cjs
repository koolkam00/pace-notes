// Checks the numbers on /finish-times (lib/finish-times-summary.ts) three ways:
//   1. the pure helpers on small hand-made bins;
//   2. an independent recount from the raw JSON (finish-times.json, courses.json and the insights manifest),
//      written without the helper's code, compared figure by figure with what the helper returns;
//   3. the full finish records: the story cohort is rebuilt in whole seconds from the checksum-verified runner
//      shards, and every figure the page prints must match the exact value. This is what backs the page's
//      statement that counting the finishes outside the published 2:00–7:00 minutes as slower changes no figure.
// Usage: node scripts/verify-finish-times.cjs [--skip-records]   (step 3 reads about 400 MB and takes ~30 s)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.every((a) => a === '--skip-records'), 'Usage: node scripts/verify-finish-times.cjs [--skip-records]');
const skipRecords = args.includes('--skip-records');
process.chdir(root); // the loaders read public/data relative to the working directory, as during `next build`

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...rest);
};
const H = require(path.join(root, 'lib/finish-times-summary.ts'));

const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const GROUPS = ['all', 'women', 'men'];
const UNDER = [180, 210, 240, 270, 300, 360];
const PCTS = [10, 25, 50, 75, 90];
const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const pctText = (num, den) => `${(Math.round((num / den) * 1000) / 10).toFixed(1)}%`;
// Exact ceil(pct × n / 100) in integers.
const rankOf = (pct, n) => Math.max(1, Math.floor((pct * n + 99) / 100));

// ---------- 1. Helpers on hand-made bins ----------
{
  const bins = [{ minute: 100, n: 1 }, { minute: 101, n: 2 }, { minute: 102, n: 1 }];
  const four = H.summarizeGroup('all', bins, 4, [101]);
  assert.deepEqual(four.under, [{ minute: 101, share: 0.25 }], 'Under 1:41 is the bins below minute 101');
  assert.deepEqual(four.percentiles.map((x) => x.minute), [100, 100, 101, 101, 102], 'Nearest-rank minutes on four finishes (ranks 1, 1, 2, 3, 4)');
  assert.equal(four.median, 101);
  assert.equal(four.outside, 0);
  // A fifth finish outside the bins counts as slower: the 90th percentile (rank 5) falls past the last bin.
  const five = H.summarizeGroup('all', bins, 5, []);
  assert.deepEqual(five.percentiles.map((x) => x.minute), [100, 101, 101, 102, null]);
  assert.equal(five.outside, 1);
  assert.equal(H.percentileLabel(null, 420), 'after 7:00');
  assert.equal(H.clockMinute(250), '4:10');
  assert.equal(H.clockMinute(179), '2:59');
  assert.equal(H.shareLabel(0.05085), '5.1%');
  assert.equal(H.shareLabel(0), '0.0%');
  assert.deepEqual([0.1, 0.25, 0.5, 0.75, 0.9].map(H.ordinal), ['10th', '25th', '50th', '75th', '90th']);
  assert.throws(() => H.summarizeGroup('all', [{ minute: 1, n: 1 }, { minute: 3, n: 1 }], 2, []), /contiguous/);
  assert.throws(() => H.summarizeGroup('all', bins, 3, []), /cover every binned finish/);
  assert.throws(() => H.summarizeGroup('all', bins, 4, [100]), /outside the published bins/);
  const wide = [];
  for (let m = 120; m <= 420; m++) wide.push({ minute: m, n: 10 });
  const shares = H.summarizeGroup('all', wide, 3010).under;
  assert.deepEqual(shares.map((u) => u.minute), UNDER, 'Round times on the page');
  assert.equal(shares[0].share, 600 / 3010, 'Under 3:00 counts minutes 120–179 only');
  assert.deepEqual(H.PERCENTILES.map((p) => Math.round(p * 100)), PCTS);
  assert.deepEqual([...H.UNDER_MINUTES], UNDER);
}

// ---------- 2. Independent recount from the raw JSON ----------
const manifest = read('public/data/insights/manifest.json');
const doc = read('public/data/insights/finish-times.json');
const courses = read('public/data/insights/courses.json');
const summary = H.getFinishTimeSummary();
const figures = H.displayedFigures(summary);

const hist = doc.histogram;
const first = hist[0].minute, last = hist[hist.length - 1].minute;
assert.equal(first, 120, 'Published bins start at 2:00');
assert.equal(last, 420, 'Published bins end at 7:00');
hist.forEach((row, i) => {
  assert.equal(row.minute, first + i, 'Contiguous minutes');
  for (const g of GROUPS) assert.ok(Number.isSafeInteger(row[g]) && row[g] >= 0, `Minute ${row.minute} ${g}: whole count`);
  assert.ok(row.all >= row.women + row.men, `Minute ${row.minute}: all finishes include both recorded genders`);
});
// Bin m holds m:00–m:59: the marks' "minute before" counts are the bins just below each mark.
const byMinute = new Map(hist.map((row) => [row.minute, row]));
for (const mark of doc.marks) {
  assert.equal(mark.minute_before, byMinute.get(mark.minutes - 1).all, `${mark.mark}: the minute before is bin ${mark.minutes - 1}`);
  assert.equal(mark.minute_after, byMinute.get(mark.minutes).all, `${mark.mark}: the minute after is bin ${mark.minutes}`);
}
const c = manifest.cohort;
assert.equal(doc.analysis_n, manifest.analysis_n);
assert.equal(c.after_duplicate_screen, manifest.analysis_n);
assert.equal(c.women + c.men + c.other_or_not_recorded, c.after_duplicate_screen, 'Recorded gender groups partition the cohort');
const totals = { all: c.after_duplicate_screen, women: c.women, men: c.men };

const expected = {};
for (const g of GROUPS) {
  const N = totals[g];
  const cumulative = [];
  let running = 0;
  for (const row of hist) cumulative.push((running += row[g]));
  const binned = running;
  assert.ok(binned <= N, `${g}: bins fit inside the total`);
  // Binary search for the first minute whose cumulative count reaches the rank.
  const minuteAt = (rank) => {
    if (rank > binned) return null;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] >= rank) hi = mid; else lo = mid + 1; }
    return first + lo;
  };
  const pct = PCTS.map((p) => minuteAt(rankOf(p, N)));
  const under = UNDER.map((T) => cumulative[T - 1 - first]);
  const got = summary.groups[g];
  assert.equal(got.total, N, `${g}: total`);
  assert.equal(got.binned, binned, `${g}: binned`);
  assert.equal(got.outside, N - binned, `${g}: outside`);
  assert.deepEqual(got.percentiles.map((x) => x.minute), pct, `${g}: percentile minutes`);
  assert.equal(got.median, pct[2], `${g}: median`);
  got.under.forEach((u, i) => assert.equal(u.share, under[i] / N, `${g}: share under ${clock(UNDER[i])}`));
  let peak = hist[0];
  for (const row of hist) if (row[g] > peak[g]) peak = row;
  assert.deepEqual(got.peak, { minute: peak.minute, n: peak[g] }, `${g}: busiest minute`);
  PCTS.forEach((p, i) => { expected[`${g}.p${p}`] = pct[i] === null ? `after ${clock(last)}` : clock(pct[i]); });
  UNDER.forEach((T, i) => { expected[`${g}.under${T}`] = pctText(under[i], N); });
}
assert.deepEqual(figures, expected, 'Displayed figures match the independent recount from the JSON');
assert.ok(Object.values(figures).every((v) => !v.startsWith('after')), 'Every percentile falls inside the published minutes');

const years = courses.courses.flatMap((course) => course.years);
assert.deepEqual(
  [summary.coverage.finishes, summary.coverage.editions, summary.coverage.races, summary.coverage.otherOrNotRecorded, summary.coverage.firstYear, summary.coverage.lastYear],
  [c.after_duplicate_screen, c.editions, c.cities, c.other_or_not_recorded, Math.min(...years), Math.max(...years)], 'Coverage figures');
assert.equal(summary.coverage.courses.length, c.cities, 'One listed race per city');
assert.deepEqual(summary.coverage.courses.map((x) => x.city), [...courses.courses.map((x) => x.city)].sort((a, b) => a.localeCompare(b, 'en')), 'Races listed alphabetically by city');
assert.deepEqual(summary.coverage.duplicates.flatMap((d) => d.years.map((year) => [d.city, year, d.duplicateOf])).sort(),
  manifest.duplicate_edition_screen.map((d) => [d.city, d.year, d.duplicate_of]).sort(), 'Duplicate-edition screen');

// Copy rules in the page's own source.
for (const file of ['app/finish-times/page.tsx', 'components/FinishTimeSummary.tsx', 'lib/finish-times-summary.ts']) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').toLowerCase();
  for (const banned of ['the wall', 'arithmetic', 'your chance', 'fastest', 'mean finish time is', 'average finish time is']) {
    assert.ok(!text.includes(banned), `${file}: contains "${banned}"`);
  }
}

// ---------- 3. The full finish records ----------
let records = 'skipped (--skip-records)';
if (!skipRecords) {
  const runners = read('public/data/runners/manifest.json');
  assert.equal(runners.release_tag, manifest.release_tag, 'Runner records and insights share a release');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'public/data/runners/manifest.json'))).digest('hex'), manifest.runner_manifest_sha256, 'Insights were built from these runner records');
  const duplicate = new Set(manifest.duplicate_edition_screen.map((d) => `${d.city}\u0000${d.year}`));
  // Same normalisation as scripts/verify-insights.cjs: 1 men, 2 women, 0 other or not recorded.
  const genderCode = (sex) => {
    const v = (sex || '').trim().toLowerCase();
    return ['m', 'male', 'man', 'men'].includes(v) ? 1 : ['f', 'female', 'woman', 'women'].includes(v) ? 2 : 0;
  };
  const finish = new Float64Array(runners.eligible_records), gender = new Uint8Array(runners.eligible_records);
  const editionsSeen = new Set();
  let n = 0;
  for (const file of Object.keys(runners.shards).sort()) {
    if (!file.startsWith('profiles/')) continue;
    const bytes = fs.readFileSync(path.join(root, 'public/data/runners', file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), runners.shards[file].sha256, `${file}: checksum`);
    for (const profile of JSON.parse(zlib.gunzipSync(bytes)).profiles) {
      for (const race of profile.races) {
        if (race.eligible !== true) continue;
        const edition = runners.editions[race.edition];
        if (duplicate.has(`${edition.city}\u0000${edition.year}`)) continue;
        finish[n] = race.times[8];
        gender[n] = genderCode(race.sex);
        editionsSeen.add(race.edition);
        n++;
      }
    }
  }
  assert.equal(n, manifest.analysis_n, 'Story cohort rebuilt from the runner records');
  const editionList = [...editionsSeen].map((e) => runners.editions[e]);
  assert.equal(editionList.length, summary.coverage.editions, 'Editions');
  assert.equal(new Set(editionList.map((e) => e.city)).size, summary.coverage.races, 'Races');
  assert.equal(Math.min(...editionList.map((e) => e.year)), summary.coverage.firstYear, 'First year');
  assert.equal(Math.max(...editionList.map((e) => e.year)), summary.coverage.lastYear, 'Last year');
  const lines = [];
  for (const g of GROUPS) {
    const keep = g === 'all' ? () => true : g === 'men' ? (i) => gender[i] === 1 : (i) => gender[i] === 2;
    const values = [];
    for (let i = 0; i < n; i++) if (keep(i)) values.push(finish[i]);
    const sorted = Float64Array.from(values).sort();
    const N = sorted.length;
    assert.equal(N, totals[g], `${g}: finishes in the records`);
    // The published bins are the records' whole minutes.
    const perMinute = new Map();
    let fast = 0, slow = 0;
    for (const t of sorted) {
      const m = Math.floor(t / 60);
      if (m < first) fast++; else if (m > last) slow++; else perMinute.set(m, (perMinute.get(m) || 0) + 1);
    }
    for (const row of hist) assert.equal(perMinute.get(row.minute) || 0, row[g], `${g}: minute ${row.minute} matches the records`);
    assert.equal(fast + slow, summary.groups[g].outside, `${g}: finishes outside the published minutes`);
    for (const p of PCTS) {
      const exact = sorted[rankOf(p, N) - 1];
      assert.equal(clock(Math.floor(exact / 60)), figures[`${g}.p${p}`], `${g}: ${p}th percentile against the exact finish time`);
    }
    for (const T of UNDER) {
      let lo = 0, hi = N;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < T * 60) lo = mid + 1; else hi = mid; }
      assert.equal(pctText(lo, N), figures[`${g}.under${T}`], `${g}: share under ${clock(T)} against the exact count`);
    }
    lines.push(`${g}: ${fast} faster than ${clock(first)}, ${slow} after ${clock(last)}:59`);
  }
  records = `every figure matches the exact records (${lines.join('; ')})`;
}

const show = (g) => `${g} median ${figures[`${g}.p50`]} (p10 ${figures[`${g}.p10`]}, p90 ${figures[`${g}.p90`]}; under 4:00 ${figures[`${g}.under240`]})`;
console.log(`verify-finish-times: ok. ${GROUPS.map(show).join('; ')}. Full records: ${records}.`);
