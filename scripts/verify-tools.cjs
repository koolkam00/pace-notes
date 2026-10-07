/* Golden-value checks for the runner-tool libraries (lib/tools). Pure functions; no data files needed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};

const time = require('../lib/tools/time.ts');
const pace = require('../lib/tools/pace.ts');
const predictor = require('../lib/tools/predictor.ts');
const weather = require('../lib/tools/weather.ts');
const qualifying = require('../lib/tools/qualifying.ts');
const splits = require('../lib/tools/splits.ts');
const data = require('../lib/tools/data.ts');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let checks = 0;
const ok = () => { checks += 1; };

// ---- time parsing
for (const [text, mode, expected] of [
  ['3:30', 'race', 12600], ['3:30:15', 'race', 12615], ['1:45:00', 'race', 6300], ['210', 'race', 12600], ['3h30', 'race', 12600],
  ['3h 30m 15s', 'race', 12615], ['45m', 'race', 2700], ['3.30.15', 'race', 12615], ['3.30', 'race', 12600], ['8:05', 'pace', 485], ['8', 'pace', 480],
  ['8.5', 'pace', 510], ['8.05', 'pace', 485], ['0:25:30', 'race', 1530],
]) { assert.equal(time.parseDuration(text, mode), expected, `parse ${text} (${mode})`); ok(); }
for (const bad of ['', 'abc', '3:75', '1:2:3:4', '3:30:60']) { assert.equal(time.parseDuration(bad), null, `reject ${bad}`); ok(); }
assert.equal(time.formatDuration(12600), '3:30:00'); assert.equal(time.formatDuration(2712), '45:12'); assert.equal(time.formatDuration(59.6), '1:00');
assert.equal(time.formatHM(14370), '3:60'.replace('3:60', '4:00')); assert.equal(time.formatMargin(-65), '−1:05'); assert.equal(time.formatMargin(270), '+4:30');
assert.equal(time.formatClock(9 * 3600 + 42 * 60), '9:42 am'); assert.equal(time.formatClock(12 * 3600 + 5 * 60), '12:05 pm'); assert.equal(time.formatClock(0), '12:00 am');
assert.equal(time.parseClock('8:05'), 29100); assert.equal(time.parseClock('8:05 pm'), 72300); assert.equal(time.parseClock('12:00 am'), 0); assert.equal(time.parseClock('25:00'), null);
checks += 11;
assert.deepEqual(time.parseTrackerText('25K 2:05:31\n30 km 02:31:07 4:59/km\nHalf 1:52:10\n5K 25:30'), [
  { km: 25, elapsed: 7531 }, { km: 30, elapsed: 9067 }, { km: 5, elapsed: 1530 }]); ok();

// ---- pace arithmetic
near(pace.paceFrom(12600, pace.MARATHON_KM), 298.613, 0.001, 'marathon pace'); ok();
assert.equal(Math.round(pace.perUnit(pace.paceFrom(12600, pace.MARATHON_KM), 'mi')), 481); ok(); // 8:01/mi for 3:30
near(pace.mph(pace.paceFrom(12600, pace.MARATHON_KM)), 7.4908, 0.0005, 'mph'); ok();
{
  const rows = pace.splitTable(12600, pace.MARATHON_KM, 'mi');
  assert.equal(rows.length, 26 + 8 + 1 + 1); ok();            // 26 miles, 8 mats, halfway, finish
  assert.ok(rows.at(-1).finish && Math.abs(rows.at(-1).elapsed - 12600) < 1e-9); ok();
  const halfway = rows.find((r) => r.halfway);
  near(halfway.elapsed, 6300, 1e-6, 'even halfway'); ok();
  const neg = pace.splitTable(12600, pace.MARATHON_KM, '5k', -120).find((r) => r.halfway);
  near(neg.elapsed, 6360, 1e-6, 'negative split first half'); ok();   // (T − Δ)/2 with Δ = −120 s
  assert.equal(pace.splitTable(1500, 5, 'km').length, 6); ok();        // 1, 2, 2.5 (halfway), 3, 4 km and the finish
}
{
  const chart = pace.paceChart(300, 900, 15, 'mi');
  assert.equal(chart.length, 41); ok();
  near(chart[0].times.marathon, 300 / 1.609344 * 42.195, 1e-6, 'chart marathon'); ok();
}
near(pace.watchTarget(298.613, 0.01), 295.656, 0.001, 'watch target'); ok();

// ---- predictor models (values recomputed independently in Python)
const H = (h, m, s = 0) => h * 3600 + m * 60 + s;
near(predictor.vdot(5, 1200), 49.8, 0.06, 'VDOT of a 20:00 5K'); ok();
for (const [half, daniels, b113, b115] of [[H(1, 30), H(3, 7, 35), H(3, 16, 58), H(3, 19, 43)], [H(1, 45), H(3, 37, 50), H(3, 49, 48), H(3, 53, 1)], [H(2, 0), H(4, 7, 45), H(4, 22, 38), H(4, 26, 18)]]) {
  const r = predictor.marathonRange(pace.HALF_KM, half);
  near(r.daniels, daniels, 1, 'Daniels marathon'); near(r.median, b113, 1, 'b = 1.13'); near(r.high, b115, 1, 'b = 1.15');
  assert.ok(r.riegel < r.low && r.low < r.median && r.median < r.high); checks += 4;
}
near(predictor.riegel(1080, 5, pace.MARATHON_KM), H(2, 52, 38), 1, 'Riegel from an 18:00 5K'); ok();
near(predictor.personalExponent(10, 2400, pace.HALF_KM, 5400), Math.log(5400 / 2400) / Math.log(2.10975), 1e-12, 'personal exponent'); ok();
assert.equal(predictor.marathonRange(10, 2400).extrapolation, 'shorter'); ok();
near(predictor.tandaPace(80, 300), 17.1 + 140 * Math.exp(-0.424) + 165, 1e-9, 'Tanda'); ok();

// ---- weather formulas (published values)
near(weather.relativeHumidity(26.7, 21.1), 71.4, 1, 'RH for 80°F air / 70°F dew'); ok();
near(weather.wetBulb(20, 50), 13.7, 0.1, 'Stull 2011 example'); ok();
assert.equal(weather.acsmFlag(17.9), 'green'); assert.equal(weather.acsmFlag(18), 'yellow'); assert.equal(weather.acsmFlag(23), 'red'); assert.equal(weather.acsmFlag(28.1), 'black'); checks += 4;
assert.deepEqual(weather.hadley(80, 70), { low: 3, high: 4.5 }); assert.equal(weather.hadley(100, 81), null); assert.deepEqual(weather.hadley(50, 40), { low: 0, high: 0 }); checks += 3;
assert.deepEqual(weather.dewPointBand(70), { low: 5, high: 8 }); assert.equal(weather.dewPointBand(80), null); checks += 2;
assert.deepEqual(weather.ely(12), { men: 2.5, women: 3.2 }); assert.equal(weather.ely(4), null); assert.equal(weather.ely(26), null); checks += 3;
// Mantzios 2022: marathon 0.2%/°C WBGT above 15 °C, all endurance events 0.4%/°C (PMC8677617).
assert.deepEqual(weather.mantzios(20), { low: 0.2 * 5, high: 0.4 * 5 }); assert.deepEqual(weather.mantzios(12), { low: 0, high: 0 }); ok();

// ---- qualifying standards (official worked examples and boundaries)
const std = (key) => qualifying.STANDARDS.find((s) => s.key === key);
assert.equal(qualifying.ageOn('2000-02-29', '2027-02-28'), 26); assert.equal(qualifying.ageOn('2000-02-29', '2027-03-01'), 27); assert.equal(qualifying.ageOn('1990-04-19', '2027-04-19'), 37); checks += 3;
{
  // B.A.A. worked examples: A (18, 2:45:30 on a 2,000 ft drop → 2:50:30, 4:30 under), B (40 woman, 3:20:30 on 5,000 ft → 4:30 under), C (35 man, 2:58:00 on 2,500 ft → 3:00 over).
  const boston = std('boston');
  const a = qualifying.evaluate(boston, { birth: '2010-01-01', division: 'men', seconds: H(2, 45, 30), raceDate: '2026-10-01', dropFeet: 2000 });
  assert.equal(a.limit, H(2, 55)); assert.equal(a.counted, H(2, 50, 30)); assert.equal(a.margin, 270); assert.equal(a.status, 'meets');
  const b = qualifying.evaluate(boston, { birth: '1988-01-01', division: 'women', seconds: H(3, 20, 30), raceDate: '2026-10-01', dropFeet: 5000 });
  assert.equal(b.limit, H(3, 35)); assert.equal(b.margin, 270);
  const c = qualifying.evaluate(boston, { birth: '1993-01-01', division: 'men', seconds: H(2, 58), raceDate: '2026-10-01', dropFeet: 2500 });
  assert.equal(c.limit, H(3, 0)); assert.equal(c.margin, -180); assert.equal(c.status, 'misses');
  const d = qualifying.evaluate(boston, { birth: '1993-01-01', division: 'men', seconds: H(2, 58), raceDate: '2026-10-01', dropFeet: 6000 });
  assert.equal(d.status, 'not-eligible');
  const equal = qualifying.evaluate(boston, { birth: '1993-01-01', division: 'nonbinary', seconds: H(3, 30), raceDate: '2026-10-01' });
  assert.equal(equal.margin, 0); assert.equal(equal.status, 'meets');
  const early = qualifying.evaluate(boston, { birth: '1993-01-01', division: 'men', seconds: H(2, 50), raceDate: '2026-04-20' });
  assert.equal(early.status, 'outside-window');
  checks += 14;
  assert.deepEqual(qualifying.clearedCutoffs(320).map((x) => x.year).filter((y) => y >= 2024), [2026, 2027]); ok();
  assert.deepEqual([1499, 1500, 2999, 3000, 5999, 6000].map(qualifying.bostonDownhillIndex), [0, 300, 300, 600, 600, null]); ok();
}
{
  const london = std('london');
  const at = qualifying.evaluate(london, { birth: '1990-06-01', division: 'men', seconds: H(2, 52), raceDate: '2026-04-26' });
  assert.equal(at.margin, 0); assert.equal(at.status, 'misses');          // strictly under
  const under = qualifying.evaluate(london, { birth: '1986-04-27', division: 'women', seconds: H(3, 42, 59), raceDate: '2026-04-26' });
  assert.equal(under.age, 39); assert.equal(under.limit, H(3, 38));        // age when the time was run
  assert.equal(qualifying.evaluate(london, { birth: '1990-01-01', division: 'nonbinary', seconds: H(3, 0), raceDate: '2026-04-26' }).status, 'no-category');
  const nyc = qualifying.evaluate(std('nyc'), { birth: '1995-01-01', division: 'women', seconds: H(3, 13), raceDate: '2026-03-01', nyrr: true });
  assert.equal(nyc.status, 'meets'); assert.equal(nyc.margin, 0);
  const berlin = qualifying.evaluate(std('berlin'), { birth: '1983-12-31', division: 'men', seconds: H(2, 45), raceDate: '2026-09-27' });
  assert.equal(berlin.band.max, 44); assert.equal(berlin.status, 'meets');
  const berlin2 = qualifying.evaluate(std('berlin'), { birth: '1982-01-01', division: 'men', seconds: H(2, 50), raceDate: '2026-09-27' });
  assert.equal(berlin2.limit, H(2, 55));
  const chicago = qualifying.evaluate(std('chicago'), { birth: '2010-06-01', division: 'women', seconds: H(3, 19), raceDate: '2026-05-01' });
  assert.equal(chicago.age, 17); assert.equal(chicago.limit, H(3, 20));    // Chicago's youngest band starts at 16
  checks += 12;
  // Every table is ordered, gap-free and monotone in age.
  for (const s of qualifying.STANDARDS) {
    s.bands.forEach((b, i) => {
      if (i) { assert.equal(b.min, s.bands[i - 1].max + 1, `${s.key} bands contiguous`); assert.ok(b.men >= s.bands[i - 1].men && b.women >= s.bands[i - 1].women, `${s.key} monotone`); }
      assert.ok(b.women > b.men, `${s.key} women's standard slower than men's`);
    });
    assert.ok(s.sources.length && s.sources.every((x) => x.url.startsWith('https://')), `${s.key} sources`);
    checks += 1;
  }
}

// ---- splits (mirrors analysis/insights_data.sustained_slowdown)
{
  const cumulative = (paces) => { const L = splits.SECTION_KM; let t = 0; return paces.map((p, i) => (t += p * L[i])); };
  const even = cumulative([300, 300, 300, 300, 300, 300, 300, 300, 300]);
  assert.equal(splits.validateSplits(even), null);
  const r0 = splits.readSplits(even);
  assert.equal(r0.slowdown, false); near(r0.baseline, 300, 1e-9, 'baseline'); near(r0.opening, 0, 1e-12, 'opening');
  const slow = cumulative([290, 300, 300, 300, 330, 375, 380, 360, 330]);
  const r1 = splits.readSplits(slow);
  assert.equal(r1.slowdown, true); assert.equal(r1.onsetKm, 25);           // 25–30 km is exactly 25% slower
  const edge = cumulative([300, 300, 300, 300, 300, 300, 300, 300, 450]);
  assert.equal(splits.readSplits(edge).slowdown, false);                   // the final 2.195 km cannot qualify alone
  assert.ok(splits.validateSplits(even.slice(0, 8)));
  assert.ok(splits.validateSplits([...even.slice(0, 8), even[7] - 1]));
  checks += 9;
  const archetypes = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/insights/archetypes.json'), 'utf8'));
  const k = splits.classify(r0.relative, archetypes.classifier);
  assert.equal(archetypes.classifier.names[k], 'Metronome'); ok();
}

// ---- interpolated share under a time
{
  const ps = Array.from({ length: 19 }, (_, i) => Math.round((i + 1) * 5) / 100);
  const qs = ps.map((p) => 10000 + p * 1000);
  near(data.shareUnder(10500, qs, ps).share, 0.5, 1e-9, 'median'); near(data.shareUnder(10525, qs, ps).share, 0.525, 1e-9, 'interpolated');
  assert.equal(data.shareUnder(9000, qs, ps).bound, 'below'); assert.equal(data.shareUnder(12000, qs, ps).bound, 'above');
  checks += 4;
}

// Registry copy that quotes the tool cohort must match the published data.
{
  const registry = require('../lib/tools/registry.ts');
  const projector = path.join(__dirname, '..', 'public/data/insights/tools/projector.json');
  if (fs.existsSync(projector)) {
    const n = JSON.parse(fs.readFileSync(projector, 'utf8')).cohort_n;
    assert.ok(registry.EVIDENCE_TEXT.data.includes(`${(n / 1e6).toFixed(2)} million`), 'Evidence text quotes the tool cohort');
    checks++;
  }
  const slugs = registry.TOOLS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'Tool slugs are unique');
  for (const t of registry.TOOLS) assert.ok(fs.existsSync(path.join(__dirname, '..', 'app/tools', t.slug, 'page.tsx')), `${t.slug}: page exists`);
  checks += 1 + registry.TOOLS.length;
}

console.log(`Tool libraries passed ${checks} checks: time parsing, pace arithmetic and splits, published predictor and heat formulas, qualifying standards with official worked examples and age rules, sustained-slowdown reading and the pacing-type classifier.`);
