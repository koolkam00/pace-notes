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

// ---- pace calculations
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

// ---- pace charts by goal time and the goal pages (lib/tools/pace-chart.ts): even-pace values recomputed by hand
{
  const chart = require('../lib/tools/pace-chart.ts');
  const M = chart.MARATHON_CHART;
  const half = chart.HALF_CHART;
  assert.equal(M.goals.length, 49); assert.equal(M.goals[0], 150); assert.equal(M.goals.at(-1), 390); checks += 3;   // 2:30 to 6:30 every 5 minutes
  assert.equal(half.goals.length, 23); assert.equal(half.goals[0], 70); assert.equal(half.goals.at(-1), 180); checks += 3;  // 1:10 to 3:00
  assert.deepEqual(M.points.map((p) => p.km), [5, 10, 15, 20, 21.0975, 25, 30, 35, 40]); ok();
  assert.deepEqual(half.points.map((p) => p.km), [5, 10, 15, 20]); ok();
  const rows = chart.chartRows(M);
  const four = rows.find((r) => r.goal === 240);
  near(four.perKm, 14400 / 42.195, 1e-9, '4:00 pace per km'); near(four.perMile, 14400 / 42.195 * 1.609344, 1e-9, '4:00 pace per mile'); checks += 2;
  assert.equal(chart.formatTenths(four.perMile), '9:09.2'); assert.equal(chart.formatTenths(four.perKm), '5:41.3'); checks += 2;
  assert.equal(time.formatDuration(four.perMile), '9:09'); assert.equal(time.formatDuration(four.perKm), '5:41'); checks += 2;
  assert.equal(four.times[4], 7200); assert.equal(time.formatDuration(four.times[4], true), '2:00:00'); checks += 2;   // halfway of 4:00
  assert.equal(chart.formatTenths(four.times[0]), '28:26.4'); assert.equal(time.formatDuration(four.times[0]), '28:26'); checks += 2;  // 5 km at 4:00
  assert.equal(time.formatDuration(four.times[8], true), '3:47:31'); ok();   // 40 km at 4:00
  const three = rows.find((r) => r.goal === 180);
  assert.equal(time.formatDuration(three.perMile), '6:52'); assert.equal(time.formatDuration(three.perKm), '4:16'); assert.equal(three.times[4], 5400); checks += 3;
  near(four.miles[2], 7200, 1e-9, 'halfway in the mile table'); near(four.miles[0], 14400 * 5 * 1.609344 / 42.195, 1e-9, '5 miles at 4:00'); checks += 2;
  for (const r of [...rows, ...chart.chartRows(half)]) {
    assert.ok(r.times.every((t, i) => i === 0 || t > r.times[i - 1]) && r.times.at(-1) < r.seconds, `${r.goal}: times increase and stay under the goal`);
  }
  ok();
  const twoHalf = chart.chartRows(half).find((r) => r.goal === 120);
  near(twoHalf.perKm, 7200 / 21.0975, 1e-9, '2:00 half pace'); assert.equal(time.formatDuration(twoHalf.perMile), '9:09'); assert.equal(time.formatDuration(twoHalf.times[3], true), '1:53:45'); checks += 3;
  // Goal pages: five round goals, slugs both ways, inside the pace band's observed range (2:30–6:30) and on the chart.
  assert.deepEqual([...chart.GOAL_PAGE_MINUTES], [180, 210, 240, 270, 300]); ok();
  assert.deepEqual(chart.GOAL_PAGE_MINUTES.map(chart.goalSlug), ['3-00', '3-30', '4-00', '4-30', '5-00']); ok();
  for (const m of chart.GOAL_PAGE_MINUTES) { assert.equal(chart.goalFromSlug(chart.goalSlug(m)), m); assert.ok(m >= 150 && m <= 390 && M.goals.includes(m)); checks += 2; }
  for (const bad of ['4-05', '4:00', '04-00', '4-60', '', '10-00']) { assert.equal(chart.goalFromSlug(bad), null, `no goal page for ${bad}`); ok(); }
  assert.equal(chart.goalPagePath(240), '/tools/marathon-pace/4-00'); assert.equal(chart.goalSearchName(240), '4 Hour'); assert.equal(chart.goalSearchName(210), '3:30'); checks += 3;
  // Links use the forms the other tools read: the pace band and course chooser parse goal=H:MM, the calculator d and t.
  assert.equal(chart.paceBandHref(240), '/tools/pace-band?goal=4:00'); assert.equal(time.parseDuration('4:00', 'race'), 14400); checks += 2;
  assert.equal(chart.paceBandHref(150), '/tools/pace-band?goal=2:30'); assert.equal(chart.courseChooserHref(270), '/tools/course-chooser?goal=4:30'); checks += 2;
  assert.equal(chart.calculatorHref('half', 105), '/tools/pace-calculator?d=half&t=1:45:00'); assert.equal(time.parseDuration('1:45:00', 'race'), 6300); checks += 2;
  assert.equal(chart.formatTenths(59.96), '1:00.0'); assert.equal(chart.formatTenths(3725.25), '1:02:05.3'); checks += 2;
}

// ---- goal-page sentences (lib/tools/goal-facts.ts): built only from a goal's pace-band values; checked on fixed inputs
{
  const F = require('../lib/tools/goal-facts.ts');
  const said = [];
  const say = (text) => { said.push(text); return text; };
  assert.deepEqual([0, 1, 59.4, 60, 3725].map(F.span), ['0 seconds', '1 second', '59 seconds', '1:00', '1:02:05']); ok();
  assert.equal(F.sections([1, 2]), 'between 5 and 15 km'); assert.equal(F.sections([0]), 'between the start and 5 km');
  assert.equal(F.sections([8]), 'between 40 km and the finish'); assert.equal(F.sections([4, 1]), 'between 5 and 10 km and between 20 and 25 km'); checks += 4;
  // 4:00 (the published All-courses medians as of October 2026, typed here so the check needs no data files).
  // Even pace at 20 km is 1:53:45 (6825 s), at 30 km 2:50:38 (10238 s), at 35 km 3:19:05 (11945 s).
  const e50 = [1638, 3266, 4899, 6544, 8218, 9920, 11676, 13483, 14258];
  assert.equal(say(F.evenPaceGapText(240, e50)), 'At 20 km the median recorded time was 4:41 ahead of the calculated even-pace time for 4:00; at 35 km it was 4:29 ahead, so the gap narrowed by 12 seconds between the two mats. The gap was widest at 30 km (5:18 ahead), and the median finish was 2:22 under the goal.'); ok();
  // Behind even pace, the gap widening, the finish over the goal; and level at 20 km (no change clause).
  const even = pace.MATS_KM.concat(pace.MARATHON_KM).map((km) => Math.round(14400 * km / pace.MARATHON_KM));
  assert.equal(say(F.evenPaceGapText(240, even.map((t, i) => t + 10 * (i + 1)))), 'At 20 km the median recorded time was 40 seconds behind the calculated even-pace time for 4:00; at 35 km it was 1:10 behind, so the gap widened by 30 seconds between the two mats. The gap was widest at 40 km (1:20 behind), and the median finish was 1:30 over the goal.'); ok();
  assert.ok(say(F.evenPaceGapText(240, even.map((t, i) => (i === 3 ? t : t - 5)))).startsWith('At 20 km the median recorded time was level with the calculated even-pace time for 4:00; at 35 km it was 5 seconds ahead. The gap was widest at 5 km, 10 km, 15 km, 25 km, 30 km, 35 km and 40 km (5 seconds ahead)')); ok();
  // Ties at the widest mat are all named (5:00: 20 and 25 km are both 11:37 ahead at whole seconds).
  const tied = pace.MATS_KM.concat(pace.MARATHON_KM).map((km, i) => Math.round(18000 * km / pace.MARATHON_KM) - (i === 3 || i === 4 ? 697 : 100));
  assert.ok(say(F.evenPaceGapText(300, tied)).includes('The gap was widest at 20 km and 25 km (11:37 ahead), and the median finish was 1:40 under the goal.')); ok();
  // Section paces: the furthest section in the visitor's units, ties merged, the other side named when there is one.
  const s50 = [328, 325, 326, 329, 334, 340, 350, 360, 349];   // 4:00; even pace is 341.27 s/km
  assert.equal(say(F.sectionPaceText(240, s50, 'mi')), 'Section by section, the median pace was furthest from even pace between 35 and 40 km, 30 seconds per mile slower; on the fast side it was furthest between 5 and 10 km, 26 seconds per mile faster.'); ok();
  assert.equal(say(F.sectionPaceText(240, s50, 'km')), 'Section by section, the median pace was furthest from even pace between 35 and 40 km, 19 seconds per km slower; on the fast side it was furthest between 5 and 10 km, 16 seconds per km faster.'); ok();
  assert.ok(say(F.sectionPaceText(180, [250, 249, 249, 250, 251, 253, 257, 261, 258], 'mi')).startsWith('Section by section, the median pace was furthest from even pace between 5 and 15 km, 11 seconds per mile faster; on the slow side')); ok();
  assert.ok(say(F.sectionPaceText(240, s50.map((v) => v + 40), 'km')).endsWith('; every section’s median was slower than even pace.')); ok();
  assert.ok(say(F.sectionPaceText(300, [384, 386, 392, 402, 423, 439, 464, 471, 436], 'mi')).includes('1:11 per mile slower; on the fast side it was furthest between the start and 5 km, 1:09 per mile faster')); ok();
  // Held pace against sustained slowdown (4:00 and 5:00 medians).
  const held = [1656, 3300, 4947, 6603, 8281, 9980, 11720, 13498, 14259], slow = [1518, 3023, 4545, 6099, 7736, 9471, 11365, 13412, 14253];
  assert.equal(say(F.groupGapText(held, slow)), 'At 20 km the median time of the finishes with a sustained slowdown was 8:24 ahead of the median of those that held pace; the two medians were furthest apart at 25 km (9:05), and at the finish the slowdown group’s median was 6 seconds faster.'); ok();
  assert.ok(say(F.groupGapText([1986, 3992, 6017, 8077, 10213, 12393, 14645, 16910, 17845], [1833, 3668, 5540, 7493, 9606, 11866, 14319, 16841, 17846])).endsWith('at the finish the slowdown group’s median was 1 second slower.')); ok();
  assert.ok(say(F.groupGapText(held, held)).endsWith('level with the median of those that held pace, and at the finish the two medians were level.')); ok();
  // Where the slowdowns began: the most common onset section, with ties named.
  assert.equal(say(F.onsetText([546, 3299, 13127, 15378], [20, 25, 30, 35])), 'The sustained slowdown most often began in the 35 to 40 km section: 15,378 of the 32,350 finishes with one (47.5%).'); ok();
  assert.equal(say(F.onsetText([10, 30, 30, 0], [20, 25, 30, 35])), 'The sustained slowdown most often began in the 25 to 30 km and 30 to 35 km sections: 30 of the 70 finishes with one in each (42.9% each).'); ok();
  assert.equal(F.onsetText([0, 0, 0, 0], [20, 25, 30, 35]), null); assert.equal(F.onsetText([1, 2], [20, 25, 30]), null); checks += 2;
  assert.deepEqual([F.editionsText(179, 179), F.editionsText(177, 179), F.editionsText(5, null)], ['all 179 race editions', '177 of the 179 race editions', '5 race editions']); ok();
  // Ranks among the goal pages, counted from the nearer end.
  assert.deepEqual([5, 4, 3, 2, 1].map((v) => F.rankAmong(v, [1, 2, 3, 4, 5], 'highest', 'lowest')), ['the highest', 'the second highest', 'the third highest', 'the second lowest', 'the lowest']); ok();
  assert.equal(F.rankAmong(4, [1, 4, 4, 2, 3], 'most', 'fewest'), 'the joint most'); assert.equal(F.rankAmong(1, [1, 2], 'most', 'fewest'), null); checks += 2;
  const peers = [{ goal: 180, n: 59925, sd: 0.0431 }, { goal: 210, n: 112412, sd: 0.1261 }, { goal: 240, n: 171033, sd: 0.1891 }, { goal: 270, n: 117684, sd: 0.3817 }, { goal: 300, n: 82315, sd: 0.45 }];
  assert.equal(say(F.windowRankText(300, peers)), 'This goal’s window holds the second fewest finishes of the five goal pages.'); ok();
  assert.equal(say(F.slowdownRankText(240, peers)), 'Of the five goal pages, that share is the third highest; it runs from 4.3% at 3:00 to 45.0% at 5:00.'); ok();
  assert.equal(F.slowdownRankText(240, peers.map((p) => (p.goal === 180 ? { ...p, sd: null } : p))), null); ok();
  // Copy rules: observed wording only, no causal verbs and none of the owner's banned phrases.
  for (const text of said) assert.ok(!/\b(the wall|arithmetic|your chance|causes?|caused|costs?|leads? to|because of|makes?|affects?|improves?|produces?|helps?)\b/i.test(text), `goal-page sentence breaks a copy rule: ${text}`);
  ok();
}

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

// Daniels–Gilbert search is not capped at 12 hours: slow inputs give their real solution or NaN, never a pinned bound.
{
  const slow = predictor.timeForVdot(predictor.vdot(5, 90 * 60), 42.195);
  assert.ok(Number.isNaN(slow) || (slow > 12 * 3600 && Math.abs(predictor.vdot(42.195, slow) - predictor.vdot(5, 90 * 60)) < 1e-6), `slow 5K marathon equivalent ${slow}`);
  const moderate = predictor.timeForVdot(predictor.vdot(5, 50 * 60), 42.195);
  assert.ok(Math.abs(predictor.vdot(42.195, moderate) - predictor.vdot(5, 50 * 60)) < 1e-6 && moderate < 12 * 3600);
  checks += 2;
}
// Structured qualifying values agree with the transcribed prose, so the annual review changes them together.
{
  const nyc = qualifying.STANDARDS.find((s) => s.key === 'nyc'), sydney = qualifying.STANDARDS.find((s) => s.key === 'sydney'), boston = qualifying.STANDARDS.find((s) => s.key === 'boston');
  assert.ok(nyc.entry.includes(time.formatDuration(nyc.poolCutoff.seconds, false)) && nyc.entry.includes(String(nyc.poolCutoff.year)), 'NYC pool cut-off matches its entry text');
  assert.ok(sydney.windowNote.includes(`${sydney.maxNetDropM} m`), 'Sydney drop limit matches its window note');
  const cut = qualifying.BOSTON_CUTOFFS.find((c) => c.year === boston.randomSelection.year);
  assert.ok(cut && cut.note.includes(boston.randomSelection.drawn.toLocaleString('en-US')), 'Boston random selection matches the cut-off history');
  checks += 3;
}
// Windows end at the earlier of the qualifying window and the application deadline; Sydney rejects big drops.
{
  const q = (key) => qualifying.STANDARDS.find((s) => s.key === key);
  const runner = { birth: '1985-06-01', division: 'women', seconds: H(3, 0) };
  assert.equal(qualifying.evaluate(q('berlin'), { ...runner, raceDate: '2026-11-01' }).status, 'meets');
  assert.equal(qualifying.evaluate(q('berlin'), { ...runner, raceDate: '2026-11-20' }).status, 'outside-window', 'Berlin: run after registration closes');
  assert.equal(qualifying.evaluate(q('sydney'), { ...runner, raceDate: '2026-09-01' }).status, 'meets');
  assert.equal(qualifying.evaluate(q('sydney'), { ...runner, raceDate: '2026-10-01' }).status, 'outside-window', 'Sydney: run after the application window');
  const steep = qualifying.evaluate(q('sydney'), { ...runner, raceDate: '2026-09-01', dropFeet: 500 / 0.3048 });
  assert.equal(steep.status, 'not-eligible'); assert.equal(steep.limit, H(3, 27)); assert.equal(steep.margin, null);
  assert.equal(qualifying.evaluate(q('sydney'), { ...runner, raceDate: '2026-09-01', dropFeet: 450 / 0.3048 }).status, 'meets');
  assert.equal(qualifying.evaluate(q('london'), { ...runner, raceDate: '2026-09-30' }).status, 'meets', 'London window end wins over its later application close');
  checks += 8;
}
// Boston's metric bounds are the B.A.A.'s own (457.2 / 914.2 / 1,828.6 m), not conversions of 1,500 / 3,000 / 6,000 ft.
{
  const m = qualifying.bostonDownhillIndexMetres;
  assert.deepEqual([457.1, 457.2, 914.1, 914.2, 1828.5, 1828.6].map(m), [0, 300, 300, 600, 600, null]);
  const boston = qualifying.STANDARDS.find((s) => s.key === 'boston');
  const r = qualifying.evaluate(boston, { birth: '1984-05-20', division: 'women', seconds: H(3, 20), raceDate: '2026-10-01', dropMetres: 914.2 });
  assert.equal(r.counted, H(3, 30), 'metric drop at 914.2 m adds 10:00');
  assert.equal(qualifying.evaluate(boston, { birth: '1984-05-20', division: 'women', seconds: H(3, 20), raceDate: '2026-10-01', dropMetres: 1828.6 }).status, 'not-eligible');
  // NYRR guaranteed entry only for a time from the 2026 TCS New York City Marathon.
  const nyc = qualifying.STANDARDS.find((s) => s.key === 'nyc');
  const runner = { birth: '1984-05-20', division: 'women', seconds: H(3, 0), nyrr: true };
  assert.ok(qualifying.evaluate(nyc, { ...runner, raceDate: nyc.nyrrMarathonDate }).notes.some((n) => n.startsWith('A time from the 2026 TCS New York City Marathon')));
  assert.ok(qualifying.evaluate(nyc, { ...runner, raceDate: '2026-04-26' }).notes.some((n) => n.startsWith('No NYRR marathon was held on this date')));
  assert.deepEqual(nyc.poolHistory.map((p) => [p.year, p.seconds]), [[2025, 800], [2026, 1372]]);
  assert.deepEqual(qualifying.STANDARDS.filter((s) => !s.comparisonStated).map((s) => s.key), ['boston', 'berlin', 'sydney'], 'races that do not state the equal-time rule');
  checks += 8;
  // Race pages print "Past cut-offs are not a forecast" only where they list past cut-offs (Boston's history, New York's pool).
  assert.deepEqual(qualifying.STANDARDS.filter(qualifying.hasPublishedCutoffs).map((s) => s.key), ['boston', 'nyc']); ok();
  // Chicago's guaranteed entry is conditional: its entry text names the application window it is tied to.
  const chicago = qualifying.STANDARDS.find((s) => s.key === 'chicago');
  const md = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  assert.ok(chicago.entry.includes(`${md(chicago.applications.opens)}–${md(chicago.applications.closes).split(' ')[1]}, ${chicago.applications.closes.slice(0, 4)}`) && /\bif you apply\b/.test(chicago.entry), 'Chicago entry text matches its application window');
  ok();
  // The checker's Chicago verdict states the same conditions as the race page's entry text (same window, same fee deadline).
  const window = `${md(chicago.applications.opens)}–${md(chicago.applications.closes).split(' ')[1]}, ${chicago.applications.closes.slice(0, 4)}`;
  assert.ok(qualifying.CHICAGO_ROUTE.startsWith('Guaranteed entry if you apply') && qualifying.CHICAGO_ROUTE.includes(window), 'Chicago verdict is conditional on the window');
  const fee = /pay the entry fee by [^,]* on (\w+ \d+, \d{4})\./.exec(chicago.entry)?.[1];
  assert.ok(fee && qualifying.CHICAGO_ROUTE.includes(`fee is paid by ${fee}`) && /result is approved/.test(qualifying.CHICAGO_ROUTE), 'Chicago verdict names the same conditions and fee deadline as the entry text');
  const checkerSource = fs.readFileSync(path.join(__dirname, '..', 'components/tools/QualifyingChecker.tsx'), 'utf8');
  assert.ok(/chicago: CHICAGO_ROUTE/.test(checkerSource) && !/There is no cut-off/.test(checkerSource), 'checker uses the shared Chicago verdict');
  checks += 3;
  // One wording for the equal-time rule, on the checker and the race pages: assumed where the race does not state it.
  assert.deepEqual(qualifying.STANDARDS.map((s) => [s.key, qualifying.comparisonText(s)]), [['boston', 'at or under (assumed; not stated by the race)'], ['nyc', 'at or under'],
    ['london', 'strictly under'], ['chicago', 'at or under'], ['berlin', 'at or under (assumed; not stated by the race)'], ['sydney', 'at or under (assumed; not stated by the race)']]);
  const raceSource = fs.readFileSync(path.join(__dirname, '..', 'components/tools/QualifyingRace.tsx'), 'utf8');
  assert.ok(raceSource.includes('`At or under the standard ${ASSUMED_COMPARISON}`') && !/'Under the standard'/.test(raceSource) && checkerSource.includes('{comparisonText(s)}'), 'race pages and checker share the equal-time wording');
  checks += 2;
  // Boston's downhill-index lifetime: both B.A.A. statements, once, in the rules both pages print from `extra`.
  assert.equal(boston.extra.filter((e) => e === qualifying.BOSTON_INDEX_TERM).length, 1);
  assert.ok(/at least the next two years/.test(qualifying.BOSTON_INDEX_TERM) && /subject to change ahead of the 2028 registration period/.test(qualifying.BOSTON_INDEX_TERM));
  assert.ok(!boston.extra.some((e) => e !== qualifying.BOSTON_INDEX_TERM && /subject to change|two years/.test(e)) && !/statements differ/.test(checkerSource), 'Boston index statements appear once');
  checks += 3;
}
// Goal pages: the observed window's race editions are set against every edition in the data. The pace band's screens must
// account for the difference exactly, or the page's "The other N editions … are left out" sentence is dropped.
{
  const dir = path.join(__dirname, '..', 'public/data/insights');
  if (fs.existsSync(path.join(dir, 'tools/pace-band.json'))) {
    const band = JSON.parse(fs.readFileSync(path.join(dir, 'tools/pace-band.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const screened = [...(band.screens?.start_offset ?? []), ...(band.screens?.grid ?? [])];
    assert.ok(manifest.cohort.editions > band.editions, 'the pace band screens out some editions');
    assert.equal(band.editions + screened.length, manifest.cohort.editions, 'pace-band editions plus screened editions = editions in the data');
    assert.equal(screened.reduce((sum, e) => sum + e.finishes, 0), manifest.analysis_n - band.cohort_n, 'screened editions hold every finish left out of the pace band');
    checks += 3;
  }
}
// Deep links carry only times and a course slug.
{
  const links = require('../lib/tools/links.ts');
  assert.equal(links.courseSlug('São Paulo'), 'sao-paulo');
  assert.equal(links.splitCheckHref([1500, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 12660.4], 'New York'),
    '/tools/split-check?s=0:25:00,0:50:00,1:15:00,1:40:00,2:05:00,2:30:00,2:55:00,3:20:00,3:31:00&course=new-york');
  assert.equal(links.splitCheckHref([1500, 3000]), null);
  checks += 3;
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
  // The site never uses the word 'arithmetic' (owner's preference): plain calculations carry no badge and are described in plain words.
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  for (const dir of ['app', 'components', 'lib']) {
    for (const file of walk(path.join(__dirname, '..', dir)).filter((f) => /\.(tsx?|css)$/.test(f))) {
      assert.ok(!/arithmetic/i.test(fs.readFileSync(file, 'utf8')), `${path.relative(path.join(__dirname, '..'), file)} mentions 'arithmetic'`);
    }
  }
  checks++;
  // Every evidence kind a tool renders is listed in its registry entry (the header and index badges).
  const COMPONENT = { 'pace-calculator': 'PaceCalculator', predictor: 'Predictor', 'pace-band': 'PaceBand', 'course-chooser': 'CourseChooser',
    'weather-match': 'WeatherMatch', projector: 'Projector', 'split-check': 'SplitCheck', qualifying: 'QualifyingChecker' };
  for (const t of registry.TOOLS) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'components/tools', `${COMPONENT[t.slug]}.tsx`), 'utf8');
    const used = new Set([...source.matchAll(/kind=(?:"|\{')(data|research|official)/g), ...source.matchAll(/evidence-(data|research|official)\b/g),
      ...source.matchAll(/evidence(?:Kind)?[:=]\s*'(data|research|official)'/g)].map((m) => m[1]));
    for (const kind of used) assert.ok(t.evidence.includes(kind), `${t.slug}: renders ${kind} evidence but the registry lists ${t.evidence.join(', ')}`);
    checks++;
  }
  assert.equal(new Set(slugs).size, slugs.length, 'Tool slugs are unique');
  for (const t of registry.TOOLS) assert.ok(fs.existsSync(path.join(__dirname, '..', 'app/tools', t.slug, 'page.tsx')), `${t.slug}: page exists`);
  checks += 1 + registry.TOOLS.length;
}

console.log(`Tool libraries passed ${checks} checks: time parsing, pace calculations and splits, pace charts by goal time and goal-page links, goal-page sentences, published predictor and heat formulas, qualifying standards with official worked examples and age rules, sustained-slowdown reading and the pacing-type classifier.`);
