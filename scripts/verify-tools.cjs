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

// ---- the keypad: an iPhone's numeric keypad has a dot (a comma in some locales) and no colon. In a single race-time field
// the dot key types a colon (lib/keypad.ts); a pace keeps its dot until the field is left; lists of times are never
// changed; and every reader behind a time field takes dots and commas between the groups.
{
  const keypad = require('../lib/keypad.ts');
  assert.equal(time.keypadColons, keypad.keypadColons, 'lib/tools/time.ts re-exports the one helper'); ok();
  for (const [typed, shown] of [['3.30', '3:30'], ['3,30', '3:30'], ['3.30.15', '3:30:15'], ['1.12.55', '1:12:55'], ['3.', '3:'], ['0,24,10', '0:24:10'],
    ['3:30', '3:30'], ['3:30.15', '3:30:15'], ['1:12:55.3', '1:12:55.3'], ['1.12.55.3', '1:12:55.3'], ['210', '210'], ['3.5h', '3.5h'], ['9.14 am', '9.14 am'], ['', '']]) {
    assert.equal(keypad.keypadColons(typed), shown, `race keypad: ${typed}`); ok();
  }
  for (const typed of ['8.5', '8.05', '8,30', '8:05']) { assert.equal(keypad.keypadColons(typed, 'pace'), typed, `a pace keeps what was typed: ${typed}`); ok(); }
  // What the field then reads is what the keypad meant.
  for (const typed of ['3.30', '3.30.15', '1.12.55', '3,30']) { assert.equal(time.parseDuration(keypad.keypadColons(typed)), time.parseDuration(typed), `same reading: ${typed}`); ok(); }
  // Typed key by key, the dot becomes a colon before any unit letter arrives ("3.5h" shows "3:5h"), and the reading is
  // still what was typed: 3.5 hours, 3.75 hours, 45.5 minutes (it was so before the keypad change). A pace's colon stays.
  const keyByKey = (typed, mode = 'race') => [...typed].reduce((shown, key) => keypad.keypadColons(shown + key, mode), '');
  for (const [typed, shown, expected] of [['3.5h', '3:5h', 12600], ['3.75 hours', '3:75 hours', 13500], ['45.5 min', '45:5 min', 2730],
    ['3.5 h 10m', '3:5 h 10m', 13200], ['3.30', '3:30', 12600], ['1.12.55', '1:12:55', 4375]]) {
    assert.equal(keyByKey(typed), shown, `typed key by key: ${typed}`);
    assert.equal(time.parseDuration(shown, 'race'), expected, `read as typed: ${typed}`);
    assert.equal(time.parseDuration(shown, 'race'), time.parseDuration(typed, 'race'), `same reading key by key: ${typed}`); ok();
  }
  assert.equal(time.parseDuration('8:30 min', 'pace'), 510, 'a pace clock with a unit is the clock, never 8.3 minutes'); ok();
  assert.equal(time.parseDuration('3:30:00 h', 'race'), 12600, 'h:mm:ss with a unit is the clock'); ok();
  // keypadInput changes only the dot or comma just typed, in place with the caret kept. Pasted or dropped text is left as it
  // is, and so are its dots when it is edited later: a pasted "25:50.12" with its last digit deleted, or a digit added, keeps
  // its tenths.
  const field = (value, caret = 2) => ({ value, selectionStart: caret, selectionEnd: caret, setSelectionRange(a, b) { this.caret = [a, b]; } });
  const typedField = field('3.');
  assert.equal(keypad.keypadInput(typedField, { inputType: 'insertText', data: '.' }), '3:'); assert.equal(typedField.value, '3:'); assert.deepEqual(typedField.caret, [2, 2]);
  assert.equal(keypad.keypadInput(field('3:30.', 5), { inputType: 'insertText', data: '.' }), '3:30:');
  assert.equal(keypad.keypadInput(field('1:12:55.', 8), { inputType: 'insertText', data: '.' }), '1:12:55.', 'a third group stays a dot');
  for (const inputType of ['insertFromPaste', 'insertFromDrop']) { const pasted = field('25:50.12', 8); assert.equal(keypad.keypadInput(pasted, { inputType, data: null }), '25:50.12'); assert.equal(pasted.value, '25:50.12'); }
  const edited = field('25:50.1', 7);
  assert.equal(keypad.keypadInput(edited, { inputType: 'deleteContentBackward', data: null }), '25:50.1', 'a deletion changes nothing'); assert.equal(edited.value, '25:50.1');
  assert.equal(keypad.keypadInput(field('25:50.123', 9), { inputType: 'insertText', data: '3' }), '25:50.123', 'a digit leaves earlier dots alone');
  assert.equal(keypad.keypadInput(field('3.30', 4), { inputType: 'insertText', data: '0' }), '3.30', 'only the key just typed changes');
  assert.equal(keypad.keypadInput(field('8.', 2), { inputType: 'insertText', data: '.' }, 'pace'), '8.');
  assert.equal(keypad.keypadInput(field('3.30')), '3:30', 'without an event the whole text is read');
  // A pasted "1.12" with ".55" typed after it reads 1:12:55, never 1.12 hours and 55 minutes; a pasted "1.12.55" already has
  // its two separators, so a dot typed after it stays a dot.
  assert.equal(keypad.keypadInput(field('1.12.', 5), { inputType: 'insertText', data: '.' }), '1.12:');
  assert.equal(time.parseDuration('1.12:55'), 4375, 'mixed separators are clock groups'); assert.equal(time.parseDuration('1,12:55'), 4375);
  assert.equal(keypad.keypadInput(field('1.12.55.', 8), { inputType: 'insertText', data: '.' }), '1.12.55.');
  assert.equal(time.parseDuration('1.12:55.3'), 4375.3, 'tenths after the last colon stay tenths');
  for (const bad of ['1.12:', '1.:30', '1.2.3:4', '1.75:30']) { assert.equal(time.parseDuration(bad), null, `reject ${bad}`); }
  const splitTool = require('../components/tools/SplitCheck.tsx');
  const projectorTool = require('../components/tools/Projector.tsx');
  const predictorTool = require('../components/tools/Predictor.tsx');
  const planTool = require('../lib/tools/plan.ts');
  // Typed key by key the keypad makes two colons, then dots ("1,12,55,3" shows 1:12:55.3); the readers of short times
  // read "25:50:12" as 25 minutes 50.12 seconds where hours cannot be meant, and every other race time as h:mm:ss, so a
  // walker's 10.30.15 is 10:30:15.
  const keyed = (typed) => [...typed].reduce((f, key) => { f.value += key; f.selectionStart = f.selectionEnd = f.value.length; keypad.keypadInput(f, { inputType: 'insertText', data: key }); return f; }, field('', 0)).value;
  for (const [typed, shown] of [['25.50.12', '25:50:12'], ['25,50,12', '25:50:12'], ['10.30.15', '10:30:15'], ['1.12.55', '1:12:55'], ['0.25.50', '0:25:50'], ['1.12.55.3', '1:12:55.3'], ['1,12,55,3', '1:12:55.3'], ['45.5', '45:5']]) {
    assert.equal(keyed(typed), shown, `typed key by key: ${typed}`); assert.equal(keypad.keypadColons(typed), shown, `keypadColons: ${typed}`);
  }
  assert.deepEqual([splitTool.parseMatTime('25:50:12', null, true), splitTool.parseMatTime('51:20:4', 1550, true), splitTool.parseMatTime('10:30:15', 34200, true), splitTool.parseMatTime('12:00:00', null, true)], [1550, 3080, 37815, 43200]);
  assert.deepEqual([projectorTool.parseElapsed('25:50:12'), projectorTool.parseElapsed('10:30:15'), projectorTool.parseElapsed('25:50.12'), projectorTool.parseElapsed('12:05:00')], [1550.12, 37815, 1550.12, 43500]);
  assert.deepEqual([predictorTool.parseRaceTime('25:50:12', 5), predictorTool.parseRaceTime('10:30:15', 42.195), predictorTool.parseRaceTime('10:30:15', 3), predictorTool.parseRaceTime('3:30:15', 42.195)], [1550.12, 37815, 630.15, 12615]);
  // A lone colon before a single last digit is the keypad's decimal: 45.5 and 22.5 minutes, as before the keypad change, and
  // a marathon goal typed 3.5 is 3.5 minutes (out of range), never 3:05. A pace's colon is a colon.
  assert.deepEqual([time.parseDuration('45:5'), time.parseDuration('22:5'), time.parseDuration('3:5'), time.parseDuration('8:5', 'pace')], [2730, 1350, 210, 485]);
  assert.deepEqual([splitTool.parseMatTime('22:5'), predictorTool.parseRaceTime('45:5', 10), predictorTool.parseRaceTime('22:5', 5), planTool.readPlanGoal('3:5').seconds], [1350, 2730, 1350, null]);
  // A keyboard's whole-word insert (a clipboard suggestion) is kept as it came, like a paste.
  for (const data of ['2:05:31.4', '25:50.12', '1,12,55']) { const f = field(data, data.length); assert.equal(keypad.keypadInput(f, { inputType: 'insertText', data }), data); }
  // A keyboard has a colon key, so off touch screens (a fine pointer) a typed dot stays a dot: a mile's 5:45.3 reads 5:45.3.
  global.matchMedia = (query) => ({ matches: query !== '(pointer: coarse)' });
  try {
    assert.equal(keypad.keypadInput(field('5:45.', 5), { inputType: 'insertText', data: '.' }), '5:45.');
    assert.equal(keypad.keypadInput(field('3.30')), '3.30');
    assert.equal(predictorTool.parseRaceTime('5:45.3', 1.609344), 345.3);
  } finally { delete global.matchMedia; }
  // A real clock time with a unit reads as the clock, the unit naming its first group ("3:30h" is 3 h 30 min, never 3.3 h);
  // only a colon no clock could have (before one digit, or 60 or more) is the keypad's dot.
  assert.deepEqual(['3:30h', '3:45 h', '1:45:30 h', '25:50 min', '3:5h', '3:75 hours', '45:5 min', '3:30:00 h'].map((t) => time.parseDuration(t)),
    [12600, 13500, 6330, 1550, 12600, 13500, 2730, 12600]);
  // A mile's 5:45 with tenths typed after it shows 5:45:3, which the predictor reads as 5:45.3 (hours are no plausible pace).
  const tenths = field('5:45', 4);
  for (const key of '.3') { tenths.value += key; tenths.selectionStart = tenths.selectionEnd = tenths.value.length; keypad.keypadInput(tenths, { inputType: 'insertText', data: key }); }
  assert.equal(tenths.value, '5:45:3'); assert.equal(predictorTool.parseRaceTime(tenths.value, 1.609344), 345.3);
  assert.deepEqual([predictorTool.parseRaceTime('4:05:2', 1.5), predictorTool.parseRaceTime('5.45.3', 1.609344), predictorTool.parseRaceTime('1:05:30', 5)], [245.2, 345.3, 3930]);
  // Commas are dots in one typed time: 24:53,4 is 24:53.4. A dotted 10.30.15 is a walker's 10:30:15; 25.50.12 is 25:50.12.
  assert.deepEqual([projectorTool.parseElapsed('24:53,4'), projectorTool.parseElapsed('10.30.15'), projectorTool.parseElapsed('25.50.12'), projectorTool.parseElapsed('11.05.00')], [1493.4, 37815, 1550.12, 39900]);
  assert.deepEqual([splitTool.parseMatTime('25:50,12', null, true), splitTool.parseMatTime('25.50.12', null, true), splitTool.parseMatTime('10.30.15', 34200, true)], [1550, 1550, 37815]);
  assert.deepEqual(splitTool.parseAll(['25.50.12', '51:20:45', '', '', '', '', '', '', '']).slice(0, 2), [1550, 3080]);
  // Pasted tracker text keeps its clocks: a time-of-day column from 1 pm (13:26:31) is never read as a 13-minute split.
  const pasted = splitTool.readPasted('5K 13:26:31 25:50\n10K 13:52:12 51:31\n15K 14:18:40 1:17:59');
  assert.deepEqual(pasted.times.slice(0, 3), [1550, 3091, 4679]);
  checks += 37;

  // Every reader behind a time field.
  for (const [text, mode, expected] of [['1.12.55', 'race', 4375], ['3,30', 'race', 12600], ['3,30,15', 'race', 12615], ['8,05', 'pace', 485], ['8.5', 'pace', 510], ['8.50', 'pace', 530]]) {
    assert.equal(time.parseDuration(text, mode), expected, `parse ${text} (${mode})`); ok();
  }
  for (const bad of ['3.75', '3..30', '1.2.3.4', '3.30.75', 'a.b', '.', '3.30.15.2']) { assert.equal(time.parseDuration(bad), null, `reject ${bad}`); ok(); }
  // A pace field shows m:ss when it is left: 8.05 is 8:05 and 8.5 is 8:30.
  assert.deepEqual(['8.05', '8.5', '8,5', '10.15'].map((t) => time.formatDuration(time.parseDuration(t, 'pace'))), ['8:05', '8:30', '8:30', '10:15']); ok();
  assert.deepEqual(['8.05', '8.05 pm', '9,14', '20.05', '8.5', '25.00', '8.75'].map(time.parseClock), [29100, 72300, 33240, 72300, null, null, null]); ok();
  const plan = require('../lib/tools/plan.ts');
  assert.deepEqual(['3.30', '3,30', '3.30.00', '3.32.30', '1.12.55'].map((t) => plan.readPlanGoal(t).seconds), [12600, 12600, 12600, 12750, null]); ok();
  assert.equal(plan.readPlanGoal('3.30').read, 12600); ok(); // goal=3.30 from the home form without JavaScript opens the planner at 3:30
  const guide = require('../lib/personalized.ts');
  assert.deepEqual([guide.parseMinutes('3.30'), guide.parseMinutes('3,10'), guide.parseMinutes('3.75'), guide.parseMinutes('3.5')], [210, 190, null, null]); ok();
  assert.deepEqual([guide.parseElapsed('2.50.00'), guide.parseElapsed('1.12.55'), guide.parseElapsed('2.50'), guide.parseElapsed('2.5'), guide.parseElapsed('2.50.75')], [10200, 4375, 10200, null, null]); ok();
  assert.deepEqual([guide.parseSection('28.00'), guide.parseSection('21,30'), guide.parseSection('28.75')], [1680, 1290, null]); ok();
  const split = require('../components/tools/SplitCheck.tsx');
  assert.deepEqual(['25.50', '0.24.10', '3.58', '1.12.55', '2:05:31.4', '25.75', 'x.y'].map((t) => split.parseMatTime(t)), [1550, 1450, 14280, 4375, 7531, null, null]); ok();
  // The split check's s= list (commas between the times): dots inside each time read as colons, the commas stay separators.
  const colonList = '0:24:10,0:48:30,1:12:55,1:37:29,2:01:37,2:26:11,2:51:02,3:16:47,3:27:19';
  assert.deepEqual(split.parseAll(colonList.replace(/:/g, '.').split(',')), split.parseAll(colonList.split(','))); ok();
  const report = require('../lib/report.ts');
  assert.deepEqual(report.readReportTimes(colonList.replace(/:/g, '.')), report.readReportTimes(colonList)); assert.ok(report.readReportTimes(colonList)); checks += 2;
  const predictor = require('../components/tools/Predictor.tsx');
  assert.deepEqual([['22.30', 5], ['1.55.00', 21.0975], ['1.55', 21.0975], ['3.30', 42.195], ['1.12.55', 21.0975], ['abc', 5], ['22.75', 5]].map(([t, km]) => predictor.parseRaceTime(t, km)),
    [1350, 6900, 6900, 12600, 4375, null, null]); ok();
  const projector = require('../components/tools/Projector.tsx');
  assert.deepEqual(['24.53', '2.21', '2.21.30', '1,12,55', '24.75', 'x'].map(projector.parseElapsed), [1493, 8460, 8490, 4375, null, null]); ok();
  // The keypad's 25:50.12 at an early mat or in a short race is 25 minutes 50.12 seconds in every reader that takes it.
  assert.deepEqual([projector.parseElapsed('25:50.12'), split.parseMatTime('25:50.12'), predictor.parseRaceTime('25:50.12', 5)], [1550.12, 1550, 1550.12]); ok();
  // The readers that fall back to parseDuration keep a typed unit too ("3.5h" shows "3:5h").
  assert.deepEqual([predictor.parseRaceTime('3:5h', 42.195), predictor.parseRaceTime('22:5 min', 5), projector.parseElapsed('2:5h'), split.parseMatTime('2:5h')],
    [12600, 1350, 9000, 9000]); ok();
  const archetype = require('../lib/pacing-type.ts');   // the type finder's reader (moved out of ArchetypeStory, round 5)
  assert.deepEqual(['0.25.30', '1.12.55', '3,51,00', '0.25.75'].map(archetype.parseClock), [1530, 4375, 13860, null]); ok();
}

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

// ---- handoffs from a result (MarathonHandoffs in components/tools/Handoffs.tsx): the pace calculator's marathon time opens
// the planner (or the pace band, or the pacing-pattern analysis) with the time filled in, in the forms those pages read and
// inside the ranges they take, as if typed there.
{
  const links = require('../lib/tools/links.ts');
  const { GOAL_MIN, GOAL_MAX } = require('../lib/personalized-catalog.ts');
  const { readAnalysisProfile } = require('../lib/analysis-profile.ts');
  const query = (href) => new URL(href, 'https://splithappens.run').searchParams;
  for (const m of [90, 237, 240, 480]) {
    const href = links.paceBandGoalHref(m);
    assert.equal(href, `/tools/pace-band?goal=${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
    assert.deepEqual([...query(href).keys()], ['goal']); assert.equal(time.parseDuration(query(href).get('goal'), 'race'), m * 60); checks += 3;
  }
  for (const bad of [89, 481, 237.5, NaN, Infinity]) { assert.equal(links.paceBandGoalHref(bad), null, `no pace band link for ${bad}`); ok(); }
  for (const m of [GOAL_MIN, 237, GOAL_MAX]) {
    const href = links.pacingPatternHref(m);
    assert.equal(href, `/analyses/pacing-pattern?goal=${m}`);
    assert.equal(readAnalysisProfile(href.slice(href.indexOf('?')), { cities: [{ city: 'All courses' }] }).goal, m, 'The analysis reads the goal it is given'); checks += 2;
  }
  for (const bad of [GOAL_MIN - 1, GOAL_MAX + 1, 237.5, NaN]) { assert.equal(links.pacingPatternHref(bad), null, `no pacing-pattern link for ${bad}`); ok(); }

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { MarathonHandoffs } = require('../components/tools/Handoffs.tsx');
  const handoffs = (minutes, extra = 0, to) => renderToStaticMarkup(React.createElement(MarathonHandoffs, { label: 'With this estimate', seconds: minutes * 60 + extra, ...(to ? { to } : {}) }));
  const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  // One row, the first target the time fits (section 00: one link forward per page; critic round 3, October 18, 2026).
  assert.deepEqual(hrefs(handoffs(237)), ['/tools/plan?goal=3:57']); ok();
  assert.match(handoffs(237), /Plan this goal[\s\S]*Pick your course: splits for 3:57/); ok();
  assert.deepEqual(hrefs(handoffs(237, 0, ['band', 'pacing'])), ['/tools/pace-band?goal=3:57']); ok();
  assert.match(handoffs(237, 0, ['band']), /Turn this into a pace band[\s\S]*mat times of finishes that just beat it/); ok();
  assert.match(handoffs(140, 0, ['band']), /Even splits for 2:20, ready to print/, 'Outside 2:30–6:30 the pace band has no observed mat times'); ok();
  assert.deepEqual(hrefs(handoffs(600)), ['/analyses/pacing-pattern?goal=600'], 'Past the pace band\'s and the planner\'s 8:00 only the analysis link stays'); ok();
  assert.equal(handoffs(60), '', 'Nothing to hand off outside both ranges'); ok();
  // A time with seconds opens the page at the minute at or below it, and the row names that minute, with no parenthetical.
  assert.deepEqual(hrefs(handoffs(251, 41)), ['/tools/plan?goal=4:11']); ok();
  assert.deepEqual(hrefs(handoffs(251, 41, ['band'])), ['/tools/pace-band?goal=4:11']); ok();
  assert.match(handoffs(251, 41), /Pick your course: splits for 4:11, and how/); ok();
  assert.doesNotMatch(handoffs(251, 41) + handoffs(251, 41, ['band']), /minute at or below|4:11:41/, 'The rows name the minute they open at, with no parenthetical'); ok();
  assert.doesNotMatch(handoffs(237), /<button|your chance|arithmetic/i, 'Links only (never counted as a tool edit), in the site\'s words'); ok();
  // Each tool hands on the whole minute at or below its time, the way every tool reads 4:11:41 as 4:11.
  const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'components/tools', name), 'utf8');
  // The predictor's one way forward is its chapter's next card (the planner), so it has no row of its own (section 00,
  // cut 4); the pace calculator, a reference tool with no next card, keeps one row: the planner.
  assert.doesNotMatch(source('Predictor.tsx'), /MarathonHandoffs|ToolHandoffs/, 'The predictor ends on its next card alone'); ok();
  assert.match(source('PaceCalculator.tsx'), /const shownSeconds = ready \? Math\.round\(seconds!\) : null;[\s\S]*<MarathonHandoffs label="With this marathon time" seconds=\{shownSeconds!\} to=\{\['plan', 'band'\]\} \/>/); ok();
  assert.match(source('Handoffs.tsx'), /const minutes = Math\.floor\(seconds \/ 60\);/, 'The cards take the minute at or below the time'); ok();
}

// ---- the race planner (/tools/plan): its link, its reading of a goal, the course-goal row it shows for a course and goal
// (lib/tools/plan.ts), that row recounted from the runner records, the pace band window beside it, and the rendered plan.
{
  const links = require('../lib/tools/links.ts');
  const plan = require('../lib/tools/plan.ts');
  const band = require('../lib/tools/pace-band-data.ts');
  const query = (href) => new URL(href, 'https://splithappens.run').searchParams;
  // planHref: the course slug and H:MM, the forms the planner reads; null outside the 1:30 to 8:00 it takes.
  assert.equal(links.planHref('Berlin', 210), '/tools/plan?course=berlin&goal=3:30');
  assert.equal(links.planHref('New York', 251), '/tools/plan?course=new-york&goal=4:11');
  assert.equal(links.planHref(undefined, 90), '/tools/plan?goal=1:30'); assert.equal(links.planHref('Gold Coast'), '/tools/plan?course=gold-coast'); assert.equal(links.planHref(), '/tools/plan');
  checks += 5;
  for (const bad of [89, 481, 237.5, NaN]) { assert.equal(links.planHref('Berlin', bad), null, `no planner link for ${bad}`); ok(); }
  for (const m of [90, 237, 480]) { assert.equal(plan.readPlanGoal(query(links.planHref('Boston', m)).get('goal')).seconds, m * 60, 'The planner reads the goal its link carries'); ok(); }
  // readPlanGoal: every form the tools parse, whole seconds, and the two messages.
  assert.deepEqual(['3:30', '3:30:00', '210', '3h30', '3.30', '3:32:30'].map((t) => plan.readPlanGoal(t).seconds), [12600, 12600, 12600, 12600, 12600, 12750]); ok();
  assert.deepEqual([plan.readPlanGoal('1:20'), plan.readPlanGoal('8:00:01'), plan.readPlanGoal('abc')].map((r) => [r.seconds, r.read, r.problem]),
    [[null, 4800, 'Pick a goal between 1:30 and 8:00.'], [null, 28801, 'Pick a goal between 1:30 and 8:00.'], [null, null, 'Pick a goal between 1:30 and 8:00.']]); ok();
  assert.equal(plan.readPlanGoal(' ').problem, plan.EMPTY_GOAL_PROBLEM); assert.deepEqual([plan.readPlanGoal('1:30').seconds, plan.readPlanGoal('8:00').seconds], [5400, 28800]); checks += 2;
  assert.deepEqual([band.fmtGoal(12600), band.fmtGoal(12750), band.fmtGoal(4800)], ['3:30', '3:32:30', '1:20'], 'The address keeps H:MM, or H:MM:SS with seconds'); ok();
  // publishedGoal: the nearest goal on the file's 5-minute grid, half a step beyond each end and no further.
  const grid = (s) => plan.publishedGoal(s, [150, 390], 5);
  assert.deepEqual([12720, 12780, 12600, 12750].map((s) => grid(s)), [{ minutes: 210, rounded: true }, { minutes: 215, rounded: true }, { minutes: 210, rounded: false }, { minutes: 215, rounded: true }]); ok();
  assert.deepEqual([147.5 * 60, 147 * 60, 392.5 * 60, 393 * 60].map((s) => grid(s)?.minutes ?? null), [150, null, 390, null]); ok();
  assert.equal(plan.roundedNote(210, 12720, 5), 'Results are published every 5 minutes; showing 3:30 for your 3:32.'); ok();
  assert.equal(plan.roundedNote(210, 12630, 5), 'Results are published every 5 minutes; showing 3:30 for your 3:30:30.'); ok();
  // The file's own unavailable[] reasons, in the course chooser's plain words (one function for both pages).
  assert.equal(plan.courseGoalReason('0 editions with at least 20 finishes at this pace; 0 finishes', 3), 'No edition had 20 or more finishes at this pace.');
  assert.equal(plan.courseGoalReason('2 editions with at least 20 finishes at this pace; 640 finishes', 3), 'Only 2 editions had 20 or more finishes at this pace (640 finishes); 3 are needed.');
  assert.equal(plan.courseGoalReason('1 edition with at least 20 finishes at this pace; 31 finishes', 3), 'Only one edition had 20 or more finishes at this pace; 3 are needed.');
  assert.equal(plan.courseGoalReason('4 editions with at least 20 finishes at this pace; 96 finishes', 3), '4 editions had 20 or more finishes at this pace, but fewer than 100 finishes in all.');
  checks += 4;
  const sourceOf = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  // The course chooser lists the courses with no row at a goal by name only: their reasons belong to /methodology.
  assert.doesNotMatch(sourceOf('components/tools/CourseChooser.tsx'), /courseGoalReason|tooFewEditions|SLOWDOWN_DEFINITION/, 'The course chooser prints no eligibility reasons or definitions'); ok();
  // One row per course since the October 2026 redesign: the whole row is the link, and it names the goal it plans.
  assert.match(sourceOf('components/tools/CourseChooser.tsx'), /<Link className="cc-row" href=\{planHref\(course\.city, goal\) \?\? '\/tools\/plan'\}>[\s\S]*?Plan \{goalText\}[\s\S]*?<\/Link>/, 'Each course chooser row links to the planner for its course and goal'); ok();
  // A race page links on once, to the checker (opening on this race), and back once (critic rounds 2 and 3, October 18,
  // 2026): no second checker link, no chip cloud of the other races and no course-page link, which the course pages' own
  // qualifying links cover. Since round 3 (October 19, 2026) the page opens on its standards table, the checker a
  // compact secondary button beside the table's heading.
  assert.match(sourceOf('components/tools/QualifyingRace.tsx'), /<Link className="btn btn-secondary is-compact no-print" href=\{checkerHref\(s\)\}>Check a time<\/Link>/, 'The race page links on to the checker (a secondary button: the header holds the one orange call to action)'); ok();
  assert.doesNotMatch(sourceOf('components/tools/QualifyingRace.tsx'), /href="\/tools\/qualifying"/, 'One link to the checker'); ok();
  assert.doesNotMatch(sourceOf('components/tools/QualifyingRace.tsx'), /QualifyingRaceLinks|course\.href/, 'No second list of links at the end of a race page'); ok();
  assert.deepEqual(qualifying.STANDARDS.map((s) => qualifying.QUALIFYING_COURSE[s.key]), ['Boston', 'New York', 'London', 'Chicago', 'Berlin', 'Sydney'], 'Every race with standards names its course');
  assert.deepEqual(['Boston', 'New York', 'Prague'].map(qualifying.qualifyingKeyForCity), ['boston', 'nyc', null]); checks += 2;

  const dir = path.join(__dirname, '..', 'public/data/insights');
  const file = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  if (fs.existsSync(path.join(dir, 'tools/course-goal.json')) && fs.existsSync(path.join(dir, 'tools/pace-band.json'))) {
    const goals = file('tools/course-goal.json');
    // Every published row is the one the planner shows for its course and goal, and its numbers are the file's.
    for (const row of goals.rows) {
      const r = plan.courseGoalResult(goals, row.city, row.goal * 60, null);
      assert.ok(r.state === 'row' && r.row === row && !r.rounded, `${row.city} ${row.goal}: the planner shows the published row`);
    }
    ok();
    const berlin = plan.courseGoalResult(goals, 'Berlin', 12720, null);
    assert.equal(berlin.state, 'row'); assert.equal(berlin.minutes, 210); assert.equal(berlin.rounded, true); checks += 3;
    const notListed = goals.courses.map((c) => c.city);
    const prague = plan.courseGoalResult(goals, 'Prague', 14400, plan.screenedReason('Prague', goals.screens));
    assert.ok(!notListed.includes('Prague') && prague.state === 'unavailable', 'Prague has no course-goal course');
    assert.equal(prague.reason, 'No edition passed the data screens (start delays inflate the first split in 2016–2019).'); checks += 2;
    // A course with editions but too few for any goal row (Melbourne under 0934; Barcelona, Paris and Singapore in 1652),
    // taken from the data: there must be one, and every such course prints the course chooser's wording.
    const few = goals.courses.filter((c) => c.editions < goals.min_editions);
    assert.ok(few.length > 0, 'The course data has a course with too few editions');
    for (const course of few) {
      assert.equal(plan.courseGoalResult(goals, course.city, 14400, null).reason, plan.tooFewEditions(course.editions, goals.min_editions), `${course.city}: too few editions`);
    }
    ok();
    const gap = goals.unavailable.find((u) => goals.courses.find((c) => c.city === u.city).editions >= goals.min_editions);
    assert.equal(plan.courseGoalResult(goals, gap.city, gap.goal * 60, null).reason, plan.courseGoalReason(gap.reason, goals.min_editions), 'A gap prints the file\'s reason'); ok();
    assert.equal(plan.courseGoalResult(goals, 'Berlin', 7 * 3600, null).reason, 'Course results are published for goals from 2:30 to 6:30.'); ok();

    // The row the planner shows for its worked example (Berlin, 3:30), recounted from the checksum-verified runner records
    // with the course chooser's rule: 5–20 km pace within ±2% of the goal's even pace; editions with 20 such finishes, at
    // least 3 and 100 in all; pooled share under the goal and finish percentiles; edition-balanced sustained slowdown and
    // time after 20 km. verify-insights recounts every row's finishes, editions and shares; this adds the times.
    const zlib = require('node:zlib');
    const crypto = require('node:crypto');
    const runnersDir = path.join(__dirname, '..', 'public/data/runners');
    const runners = JSON.parse(fs.readFileSync(path.join(runnersDir, 'manifest.json'), 'utf8'));
    const screened = new Set([...(goals.duplicate_edition_screen ?? []), ...(goals.screens?.start_offset ?? []), ...(goals.screens?.grid ?? [])].map((e) => `${e.city} ${e.year}`));
    const CITY = 'Berlin', G = 210, row = goals.rows.find((r) => r.city === CITY && r.goal === G);
    const editionsOf = new Set(runners.editions.flatMap((e, i) => (e.city === CITY && !screened.has(`${e.city} ${e.year}`) ? [i] : [])));
    const g = G * 60 / 42.195, byEdition = new Map();
    for (const [name, meta] of Object.entries(runners.shards).filter(([name]) => name.startsWith('profiles/'))) {
      const bytes = fs.readFileSync(path.join(runnersDir, name));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), meta.sha256, `${name}: runner shard checksum`);
      for (const profile of JSON.parse(zlib.gunzipSync(bytes)).profiles) {
        for (const r of profile.races) {
          if (!r.eligible || !editionsOf.has(r.edition)) continue;
          const t = r.times;
          assert.ok(t.length === 9 && t.every(Number.isFinite), 'An eligible record has nine times');
          const base = (t[3] - t[0]) / 15;
          if (Math.abs(base / g - 1) > 0.02) continue;
          if (!byEdition.has(r.edition)) byEdition.set(r.edition, []);
          byEdition.get(r.edition).push(t);
        }
      }
    }
    const parts = [...byEdition.values()].filter((p) => p.length >= goals.min_edition_finishes);
    const pooled = parts.flat();
    const sustained = (t) => { const base = (t[3] - t[0]) / 15; for (let k = 4; k < 8; k++) if ((t[k] - t[k - 1]) / 5 / base - 1 + 1e-12 >= 0.25) return true; return false; };
    const median = (values) => { const v = Float64Array.from(values).sort(), h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
    const quantile = (sorted, q) => { const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, sorted.length - 1); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
    const finishes = Float64Array.from(pooled, (t) => t[8]).sort();
    assert.equal(row.n, pooled.length, `${CITY} ${G}: finishes`); assert.equal(row.ed, parts.length, `${CITY} ${G}: editions`);
    near(row.under, pooled.filter((t) => t[8] < G * 60).length / pooled.length, 5.1e-5, `${CITY} ${G}: share under the goal`);
    near(row.sd, mean(parts.map((p) => p.filter(sustained).length / p.length)), 5.1e-5, `${CITY} ${G}: sustained-slowdown share`);
    near(row.after20, mean(parts.map((p) => median(p.map((t) => (t[8] - t[3]) - (42.195 - 20) * ((t[3] - t[0]) / 15))))), 0.5000001, `${CITY} ${G}: time after 20 km`);
    [0.1, 0.5, 0.9].forEach((q, i) => near(row.fin[i], quantile(finishes, q), 0.5000001, `${CITY} ${G}: finish percentile ${q}`));
    checks += 8;

    // The pace band window beside it: the planner's cell is the shard's own, and held pace and sustained slowdown split it.
    const index = file('tools/pace-band.json');
    const shardPath = band.paceBandShardPath('berlin', 'all');
    assert.ok(index.shards[shardPath], 'The pace band publishes Berlin'); ok();
    const shard = file(shardPath);
    const [all, held, slow] = ['all', 'held', 'slowdown'].map((k) => band.cellOf(shard.groups[k], G));
    const i = shard.groups.all.g.indexOf(G);
    assert.deepEqual([all.n, all.ed, all.e50], [shard.groups.all.n[i], shard.groups.all.ed[i], shard.groups.all.e50[i]]); ok();
    assert.equal(held.n + slow.n, all.n, 'Held pace and sustained slowdown split the window'); ok();
    assert.equal(band.cellOf(shard.groups.all, 149), null, 'No cell outside the published goals'); ok();
    assert.equal(band.paceBandShardPath('all', 'all'), 'tools/pace-band/all/all.json'); assert.equal(band.PACE_BAND_INDEX, 'tools/pace-band.json'); checks += 2;
  }

  // The plan as first rendered (the 4:00 example on all courses, before any data loads): the calculated plan only, inside the
  // masked workspace and the left-out results, with its tracked sections and every pace naming its unit.
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const RacePlan = require('../components/tools/RacePlan.tsx').default;
  const html = renderToStaticMarkup(React.createElement(RacePlan, { courseGoalSha: null, paceBandSha: null, courses: [] }));
  // The data beat leads (round 6: what finishes like this one did, before the plan's own times), in its own left-out slot
  // with the live region; then the plan's card, then the inputs, then the rest.
  assert.match(html, /class="tool-workspace"><div class="tool-results tool-lead-slot plan-lead-slot"><p class="sr-only" aria-live="polite">[\s\S]*<div class="tool-results tool-answer">[\s\S]*plan-headline[\s\S]*class="tool-inputs"[\s\S]*<div class="tool-results">/, 'The data beat, then the card, then the inputs, then the results'); ok();
  // The card leads with the pace (miles first), as the pace band and the goal pages do: the goal is its kicker.
  assert.match(html, /<span id="plan-headline-title">4:00<\/span><\/p><h2 class="tool-reading-figure">9:09<small>per mile, even pace · 5:41\/km<\/small><\/h2>/, '4:00 even pace: 9:09 per mile and 5:41/km, the goal as the kicker'); ok();
  // The mat times are listed once on a phone (the wristband strips) and once in print (the mat table); from 900 px four of
  // them fill the card's right half, hidden from assistive tech (which reads every mat on the strips), never a lap list.
  assert.doesNotMatch(html, /plan-mats/, 'No lap list on the card'); ok();
  assert.match(html, /<dl class="plan-card-mats" aria-hidden="true"><div><dt>5K<\/dt><dd>28:26<\/dd><\/div><div><dt>Half<\/dt><dd>2:00:00<\/dd><\/div><div><dt>30K<\/dt><dd>2:50:38<\/dd><\/div><div><dt>Finish<\/dt><dd>4:00:00<\/dd><\/div><\/dl>/, 'The card\'s four desktop mats, hidden from assistive tech'); ok();
  assert.deepEqual([...html.matchAll(/<tr( class="is-finish")?><th scope="row">(?:\d+K|Finish)(?:<small>[^<]*<\/small>)?<\/th><td>([^<]+)<\/td>/g)].map((m) => m[2]).slice(0, 9),
    ['28:26', '56:53', '1:25:19', '1:53:45', '2:22:12', '2:50:38', '3:19:05', '3:47:31', '4:00:00'], 'Even-pace time at each mat for 4:00 (14,400 s ÷ 42.195 km × each mat), in the printed mat table'); ok();
  // The tracker looks for sections once per page view, so all three are mounted from the start; the comparison is hidden until its data shows.
  assert.deepEqual([...html.matchAll(/<div data-track-section="([^"]+)"( hidden="")?>/g)].map((m) => m[1] + (m[2] ? ' (hidden)' : '')), ['comparison (hidden)', 'result', 'pace-band']); ok();
  assert.match(html, /class="tool-share share-bar no-print"><button[^>]*>Copy link<\/button><button type="button" class="btn btn-primary is-compact"[^>]*>Print wristband strips<\/button><span class="sr-only"/, 'Copy link and the one print action (the wristband strips) share one row'); ok();
  // No next-step row: the journey's finish card follows, the page's one way forward (section 00, cut 4).
  assert.doesNotMatch(html, /aria-label="Next step"|\/tools\/weather-match\?goal=|\/tools\/projector\?target=/, 'No next-step row before the finish card'); ok();
  assert.doesNotMatch(html, /your chance|the wall|arithmetic|adjusted/i); ok();
  const planSource = sourceOf('components/tools/RacePlan.tsx');
  assert.match(planSource, /useQueryState\(DEFAULTS\)/); assert.match(planSource, /const DEFAULTS = \{ course: 'all', goal: '4:00', pace: '' \};/, 'The planner keeps exactly course, goal and the band\'s even-pace choice in its address'); checks += 2;
  // On all courses (the example) the band is even pace and no Course shape | Even pace choice is offered.
  assert.doesNotMatch(html, /band-choice|Course shape/, 'All courses: no course shape and no choice'); ok();
  assert.doesNotMatch(planSource, /trackAnalytics|posthog/i, 'The planner sends no event of its own'); ok();
}

// ---- the course-shape band (lib/tools/course-shape.ts; owner decision, October 20, 2026): the pace band and the planner
// print the course's observed shape wherever its pace-band group publishes the goal. For every course shard and every
// published whole-minute goal (and the same goal with seconds): the band ends exactly on the goal, rises strictly, equals
// e50 × goal ÷ e50[finish] at the nine timing points, and holds each segment's pace evenly between them in the mile and
// km rows; a missing cell, and all courses pooled, give even pace; the default is the shape and only even pace is written
// to the address; both pages share the function, the control and the wording.
{
  const shapeLib = require('../lib/tools/course-shape.ts');
  const band = require('../lib/tools/pace-band-data.ts');
  const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
  const sourceOf = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  // The rule on a fixed cell, recomputed here.
  const fake = { e50: [1500, 3010, 4530, 6060, 7620, 9230, 10900, 12620, 13400] };
  const fakeShape = shapeLib.courseShape(fake, 14430);
  assert.deepEqual(fakeShape.map((t) => Math.round(t * 1000) / 1000), fake.e50.map((v, i) => (i === 8 ? 14430 : Math.round(((v * 14430) / 13400) * 1000) / 1000)), 'The shape is each median times goal ÷ the median finish'); ok();
  assert.equal(fakeShape[8], 14430, 'The shape ends exactly on the goal, seconds kept'); ok();
  for (const bad of [null, undefined, { e50: fake.e50.slice(0, 8) }, { e50: [...fake.e50.slice(0, 4), 6000, ...fake.e50.slice(5)] }, { e50: [...fake.e50.slice(0, 8), NaN] }]) {
    assert.equal(shapeLib.courseShape(bad, 14400), null, 'No shape without nine finite, rising medians'); ok();
  }
  assert.equal(shapeLib.shapeFor('all', fake, 14400), null, 'All courses pooled: no course to shape it'); ok();
  assert.deepEqual(shapeLib.shapeFor('boston', fake, 14400), shapeLib.courseShape(fake, 14400)); ok();
  // The default and the override: course shape wherever a shape exists, even pace where the visitor chose it or there is
  // none; the default stays out of the address and only `pace=even` is written.
  assert.deepEqual(['', 'course', 'even', 'x'].map((c) => shapeLib.bandMode(fakeShape, c)), ['course', 'course', 'even', 'course']); ok();
  assert.deepEqual(['', 'even'].map((c) => shapeLib.bandMode(null, c)), ['even', 'even'], 'No shape: even pace, and no choice to make'); ok();
  assert.deepEqual([shapeLib.bandChoice('course'), shapeLib.bandChoice('even'), shapeLib.BAND_PARAM], ['', 'even', 'pace']); ok();
  assert.deepEqual(shapeLib.BAND_OPTIONS.map((o) => o.label), ['Course shape', 'Even pace']); assert.equal(shapeLib.BAND_LABEL, 'Splits'); checks += 2;
  assert.equal(shapeLib.shapeCaption('Boston', 'women'), 'Course shape · finishes that made the goal in Boston, women · Pace Notes data'); ok();
  // Each split strip is cut out and worn on its own, so in course shape each names its source; even pace as before.
  assert.deepEqual([shapeLib.splitCaption(true, 14400, 'mi', 1, 3), shapeLib.splitCaption(false, 14430, 'km', 2, 4)],
    ['Course shape (Pace Notes data) 4:00 · each mile · strip 1 of 3', 'Even pace 4:00:30 · each km · strip 2 of 4']); ok();
  // What a page draws (bandView, the one rule both pages call): the shape unless even pace was chosen, the course
  // shape's layout with dashes while a shape is on its way (never under a choice of even pace), a reloading shape dimmed,
  // and the choice offered wherever there is a shape or one may come.
  const view = (o) => { const v = shapeLib.bandView(o); return [v.mode, v.shaped === null ? null : 'shape', v.pending, v.layout, v.offered]; };
  assert.deepEqual([
    view({ shape: fakeShape, choice: '', loading: false }), view({ shape: fakeShape, choice: 'even', loading: false }),
    view({ shape: null, choice: '', loading: true }), view({ shape: null, choice: 'even', loading: true }), view({ shape: null, choice: '', loading: false }),
    view({ shape: fakeShape, choice: '', loading: false, stale: true }), view({ shape: fakeShape, choice: 'even', loading: false, stale: true }),
  ], [
    ['course', 'shape', false, true, true], ['even', null, false, false, true],
    ['even', null, true, true, true], ['even', null, false, false, true], ['even', null, false, false, false],
    ['course', 'shape', true, true, true], ['even', null, false, false, true],
  ], 'bandView: Even pace always gives even pace; loading gives dashes in the course layout; no shape and nothing loading, no choice'); ok();
  // A page waits for a shape only inside the goals its course's group covers (known at build time).
  assert.deepEqual([[[226, 390], 225], [[226, 390], 226], [[226, 390], 390], [[226, 390], 391], [null, 240], [undefined, 240], [[150, 390], null]].map(([g, m]) => shapeLib.mayShape(g, m)),
    [false, true, true, false, false, false, false]); ok();
  // The one line where there is no shape says why, and never claims a count nobody made: no group for the course (Prague),
  // none for the recorded gender (Singapore, women), a goal outside the published goals (New York City 7:00, Boston 2:29),
  // or too few finishes at an in-range goal.
  const GOALS = [150, 390];
  const reason = (scoped, gendered, minute) => shapeLib.noShapeReason({ scoped, gendered, minute, goals: GOALS });
  assert.deepEqual([reason(false, true, 240), reason(true, false, 240), reason(true, true, 420), reason(true, true, 149), reason(true, true, 391), reason(true, true, 150), reason(true, true, 390), reason(false, true, 420)],
    ['course', 'gender', 'range', 'range', 'range', 'few', 'few', 'course'], 'The reason for no shape, in order'); ok();
  // The edition rule's reasons: a course with too few editions for any shape (before the range), and a goal whose group
  // pools too few (after it); three editions are enough.
  const thinReason = (editions, cellEditions, minute = 240) => shapeLib.noShapeReason({ scoped: true, gendered: true, minute, goals: GOALS, editions, cellEditions });
  assert.deepEqual([thinReason(1, 1), thinReason(2, null, 420), thinReason(3, 2), thinReason(3, 3), thinReason(10, null), thinReason(null, null)],
    ['editions', 'editions', 'goal-editions', 'few', 'few', 'few']); ok();
  assert.equal(shapeLib.SHAPE_MIN_EDITIONS, 3); ok();
  assert.equal(shapeLib.noShapeLine('editions', { city: 'Singapore', goals: GOALS }), 'Too few editions in Singapore for a course shape.'); ok();
  assert.equal(shapeLib.noShapeLine('goal-editions', { city: 'Helsinki', goals: GOALS }), 'Too few editions at this goal in Helsinki for a course shape.'); ok();
  assert.deepEqual([shapeLib.shapeFor('x', { ...fake, ed: 2 }, 14400), shapeLib.shapeFor('x', { ...fake, ed: 3 }, 14400)], [null, shapeLib.courseShape(fake, 14400)], 'A cell on two editions has no shape; three are enough'); ok();
  assert.deepEqual([shapeLib.mayShape([150, 390], 240, 2), shapeLib.mayShape([150, 390], 240, 3), shapeLib.mayShape([150, 390], 240, null)], [false, true, true], 'A thin course never waits for a shape'); ok();
  const line = (r, city, genderWord) => shapeLib.noShapeLine(r, { city, genderWord, goals: GOALS });
  assert.equal(line('few', 'Singapore'), 'Too few finishes at this goal in Singapore for a course shape.'); ok();
  assert.equal(line('few', 'Austin', 'women'), 'Too few finishes at this goal in Austin (recorded as women) for a course shape.'); ok();
  assert.equal(line('range', 'New York City'), 'Course shapes cover goals from 2:30 to 6:30.', 'Outside the published goals: the range, from the index, and no count'); ok();
  assert.equal(shapeLib.noShapeLine('range', { city: 'New York City', goals: GOALS, noted: true }), 'No course shape at this goal.', 'The range said once where the page already gives it'); ok();
  assert.equal(line('course', 'Prague'), 'No course shape for Prague.'); assert.equal(line('gender', 'Singapore', 'women'), 'No course shape for Singapore, recorded as women.'); checks += 2;
  // The minute a goal's group uses is the whole minute at or below it (never rounded up past the goal).
  assert.deepEqual([12600, 12630, 12659, 12660].map(shapeLib.bandMinute), [210, 210, 210, 211]); ok();
  // A hand-edited pace leaves the address; even pace stays on a course and leaves on all courses.
  assert.deepEqual([['even', false], ['even', true], ['EVEN', false], ['course', false], ['foo', false], ['', false]].map(([p, a]) => shapeLib.tidyChoice(p, a)), ['even', '', '', '', '', '']); ok();
  // The card's four times: real timing points in course shape (5K, 20K, 30K, finish), even pace's 5K, half, 30K and finish
  // otherwise, and the course shape's labels with no times while it loads.
  assert.deepEqual(shapeLib.cardMats(14430, fakeShape), [['5K', fakeShape[0]], ['20K', fakeShape[3]], ['30K', fakeShape[5]], ['Finish', 14430]]); ok();
  assert.deepEqual(shapeLib.cardMats(14400, null), [['5K', (14400 / 42.195) * 5], ['Half', 7200], ['30K', (14400 / 42.195) * 30], ['Finish', 14400]]); ok();
  assert.deepEqual(shapeLib.cardMats(14400, null, true), [['5K', null], ['20K', null], ['30K', null], ['Finish', 14400]]); ok();
  assert.deepEqual(shapeLib.matRows(14430, fakeShape).map((m) => [m.km, m.shaped, m.even]), POINTS.map((km, i) => [km, fakeShape[i], i === 8 ? 14430 : (14430 / 42.195) * km]), 'The folds: each mat\'s shape beside even pace'); ok();
  assert.ok(shapeLib.matRows(14400, null).every((m) => m.shaped === null)); ok();
  // The wording both pages print: the shape in words, the kicker in each mode, the card's line, and the even pace labelled
  // as the average wherever it travels with a course shape (the strip's Goal cell, the goal bar, a watch that reads long).
  const fakePaces = shapeLib.shapePaces(fakeShape);
  const fmtMi = (sPerKm) => time.formatDuration(sPerKm * 1.609344);
  assert.equal(shapeLib.shapeLine(fakeShape, 'mi'), `${fmtMi(fakePaces.to20)}/mi to 20K, ${fmtMi(fakePaces.from30)}/mi from 30K`, 'Both phases name their unit'); ok();
  assert.equal(shapeLib.bandKicker({ goal: 14400, place: 'Boston', genderWord: 'women', shape: null, units: 'mi' }), '4:00 · Boston · 9:09/mi even', 'Even pace: the kicker as before, no gender'); ok();
  assert.equal(shapeLib.bandKicker({ goal: 14430, place: 'Boston', genderWord: 'women', shape: fakeShape, units: 'mi' }), `4:00:30 · Boston · women · course shape, ${shapeLib.shapeLine(fakeShape, 'mi')}`); ok();
  assert.equal(shapeLib.bandKicker({ goal: 14400, place: 'Boston', shape: null, units: 'mi', pending: true }), '4:00 · Boston · course shape', 'While the shape loads: course shape, no paces, never "even"'); ok();
  assert.equal(shapeLib.bandKicker({ goal: 14430, place: 'Boston', shape: fakeShape, units: 'mi', phases: false }), '4:00:30 · Boston · course shape', 'The planner\'s band panel: no paces, the card above gives them'); ok();
  assert.equal(shapeLib.bandKicker({ goal: 14400, place: 'Boston', shape: null, units: 'mi', overrun: 0.005, example: true }), 'Example · 4:00 · Boston · 9:09/mi even · watch 9:06/mi'); ok();
  assert.match(shapeLib.bandKicker({ goal: 14400, place: 'Boston', shape: fakeShape, units: 'mi', overrun: 0.005 }), / · watch avg 9:06\/mi$/, 'Course shape: the watch figure is its average'); ok();
  // The Goal cell: at even pace one line as before; in course shape "avg" once and the watch on its own line.
  assert.deepEqual([shapeLib.goalCell(14400 / 42.195, 0, 'mi', false), shapeLib.goalCell(14400 / 42.195, 0.01, 'mi', false), shapeLib.goalCell(14400 / 42.195, 0, 'mi', true), shapeLib.goalCell(14400 / 42.195, 0.01, 'km', true)],
    [[['9:09/mi', '5:41/km']], [['9:09/mi', '5:41/km', 'watch 9:04/mi']], [['avg 9:09/mi', '5:41/km']], [['avg 9:09/mi', '5:41/km'], ['watch 5:38/km']]]); ok();
  assert.deepEqual([shapeLib.goalPace(14400 / 42.195, 'km', true), shapeLib.goalPace(14400 / 42.195, 'mi', false)], ['avg 5:41/km', '9:09/mi']); ok();
  assert.equal(shapeLib.cardShapeLine(14400, 'Boston'), 'Course shape: how finishes that made 4:00 ran Boston. Not a prediction.'); ok();
  assert.equal(shapeLib.cardShapeLine(14400, 'Boston', 'women'), 'Course shape: how finishes that made 4:00 ran Boston (recorded as women). Not a prediction.'); ok();
  assert.equal(shapeLib.SHAPE_DISCLAIMER, 'Not a prediction.'); ok();
  // shapePaces: the pace through 20K and from 30K to the finish, from the timing points alone.
  near(shapeLib.shapePaces(fakeShape).to20, fakeShape[3] / 20, 1e-12, 'Pace through 20K'); near(shapeLib.shapePaces(fakeShape).from30, (14430 - fakeShape[5]) / 12.195, 1e-12, 'Pace from 30K'); checks += 2;
  // Even pace is unchanged: bandRows without a shape is the even-pace split table itself.
  for (const interval of ['mi', 'km', '5k']) { assert.deepEqual(shapeLib.bandRows(14400, interval, null), pace.splitTable(14400, 42.195, interval), `${interval}: even pace unchanged`); ok(); }

  /** Every check of one shaped band against its cell, recomputed here without the library's interpolation. */
  let steps = 0;
  const checkBand = (where, cell, goal) => {
    const shape = shapeLib.courseShape(cell, goal);
    assert.ok(shape && shape.length === 9, `${where}: a shape`);
    assert.equal(shape[8], goal, `${where}: ends exactly on the goal`);
    for (let i = 0; i < 9; i++) {
      assert.ok(shape[i] > (i ? shape[i - 1] : 0), `${where}: rises strictly at ${POINTS[i]} km`);
      near(shape[i], (cell.e50[i] * goal) / cell.e50[8], 1e-6, `${where}: e50 × goal ÷ e50[finish] at ${POINTS[i]} km`);
    }
    const bounds = [0, ...POINTS], times = [0, ...shape];
    for (const interval of ['mi', 'km']) {
      const rows = shapeLib.bandRows(goal, interval, shape);
      const even = pace.splitTable(goal, 42.195, interval);
      assert.deepEqual(rows.map((r) => [r.km, r.mat, r.halfway, r.finish]), even.map((r) => [r.km, r.mat, r.halfway, r.finish]), `${where} ${interval}: the even-pace markers`);
      let previous = { km: 0, elapsed: 0 };
      for (const r of rows) {
        const j = bounds.findIndex((b) => b >= r.km - 1e-9);
        const point = Math.abs(bounds[j] - r.km) < 1e-9;
        const expected = point ? times[j] : times[j - 1] + ((times[j] - times[j - 1]) * (r.km - bounds[j - 1])) / (bounds[j] - bounds[j - 1]);
        if (point) assert.equal(r.elapsed, expected, `${where} ${interval} ${r.km}: the timing point itself`);
        else near(r.elapsed, expected, 1e-6, `${where} ${interval} ${r.km}: even within its segment`);
        assert.ok(r.elapsed > previous.elapsed, `${where} ${interval} ${r.km}: rises strictly`);
        near(r.split, r.elapsed - previous.elapsed, 1e-9, `${where} ${interval} ${r.km}: split`);
        // Inside one segment (the step starts at or after the segment's first timing point, or the start), every step
        // runs at that segment's pace.
        if (previous.km >= bounds[j - 1] - 1e-9) {
          near((r.elapsed - previous.elapsed) / (r.km - previous.km), (times[j] - times[j - 1]) / (bounds[j] - bounds[j - 1]), 1e-9, `${where} ${interval} ${r.km}: the segment's pace`);
          steps += 1;
        }
        previous = r;
      }
      assert.equal(rows[rows.length - 1].elapsed, goal, `${where} ${interval}: the last row is the goal`);
    }
  };

  const dir = path.join(__dirname, '..', 'public/data/insights');
  const file = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  if (fs.existsSync(path.join(dir, band.PACE_BAND_INDEX))) {
    const index = file(band.PACE_BAND_INDEX);
    let shards = 0, cells = 0;
    for (const scope of index.scopes.filter((s) => s.slug !== 'all')) {
      for (const gender of ['all', 'men', 'women']) {
        const shardPath = band.paceBandShardPath(scope.slug, gender);
        if (!index.shards[shardPath]) continue;
        const group = file(shardPath).groups.all;
        for (const g of group.g) {
          const cell = band.cellOf(group, g);
          assert.ok(cell.n >= 100, `${shardPath} ${g}: a published cell has 100 finishes`);
          checkBand(`${shardPath} ${g}`, cell, g * 60);
          checkBand(`${shardPath} ${g}:30`, cell, g * 60 + 30);
          // The edition rule (owner decision, October 20, 2026): the page's shape is the scaled cell only on 3 or more editions.
          const pageShape = shapeLib.shapeFor(scope.slug, cell, g * 60);
          if (cell.ed >= shapeLib.SHAPE_MIN_EDITIONS) assert.deepEqual(pageShape, shapeLib.courseShape(cell, g * 60), `${shardPath} ${g}: the shape on ${cell.ed} editions`);
          else assert.equal(pageShape, null, `${shardPath} ${g}: no shape on ${cell.ed} editions`);
          cells += 1;
        }
        // The fallback: a goal the group does not publish has no cell, no shape, and even pace.
        const missing = [149, ...Array.from({ length: 241 }, (_, k) => 150 + k)].filter((m) => !group.g.includes(m));
        for (const m of missing) {
          assert.equal(band.cellOf(group, m), null);
          const shape = shapeLib.shapeFor(scope.slug, band.cellOf(group, m), m * 60);
          assert.equal(shape, null, `${shardPath} ${m}: no shape`); assert.equal(shapeLib.bandMode(shape, ''), 'even');
        }
        shards += 1;
      }
    }
    assert.ok(shards >= 75 && cells > 10000 && steps > cells * 2 * 60, `Every course shard checked (${shards} shards, ${cells} goals, ${steps} steps)`); checks += shards;
    // The named fallbacks: Singapore publishes a 4:00 group from its one edition and has no shape; Austin, on three
    // editions, has a shape at 4:00 but none at 5:53, a goal its group does not publish (Auckland played this part until
    // the October 21, 2026 release held its 2017 edition; its 4:00 group, now on two editions, has no shape); All courses
    // never takes a shape.
    const singapore = file(band.paceBandShardPath('singapore', 'all')).groups.all;
    assert.ok(band.cellOf(singapore, 240) && shapeLib.shapeFor('singapore', band.cellOf(singapore, 240), 14400) === null, 'Singapore 4:00: a group, one edition, no shape'); ok();
    const austin = file(band.paceBandShardPath('austin', 'all')).groups.all;
    assert.ok(band.cellOf(austin, 240)?.ed === 3 && shapeLib.shapeFor('austin', band.cellOf(austin, 240), 14400) && band.cellOf(austin, 353) === null, 'Austin: a shape at 4:00 on three editions, none at 5:53'); ok();
    const auckland = file(band.paceBandShardPath('auckland', 'all')).groups.all;
    assert.ok(band.cellOf(auckland, 240)?.ed === 2 && shapeLib.shapeFor('auckland', band.cellOf(auckland, 240), 14400) === null, 'Auckland 4:00: a group on two editions, no shape'); ok();
    const allCourses = file(band.paceBandShardPath('all', 'all')).groups.all;
    assert.ok(band.cellOf(allCourses, 240) && shapeLib.shapeFor('all', band.cellOf(allCourses, 240), 14400) === null, 'All courses: even pace, though its group has a cell'); ok();
    // Boston 4:00, the planner's capture: the shape is the course's, and the card's two paces come from its timing points.
    const boston = band.cellOf(file(band.paceBandShardPath('boston', 'all')).groups.all, 240);
    const bostonShape = shapeLib.courseShape(boston, 14400);
    assert.equal(time.formatDuration(bostonShape[3]), time.formatDuration((boston.e50[3] * 14400) / boston.e50[8]), 'Boston 4:00 at 20K'); ok();
    assert.ok(shapeLib.shapePaces(bostonShape).to20 < 14400 / 42.195 && shapeLib.shapePaces(bostonShape).from30 > 14400 / 42.195, 'Boston 4:00: quicker than even through 20K, slower from 30K'); ok();
    // The figures the planner's card and fold show for Boston 4:00 (the reviewers' capture), and the pace band's recorded
    // gender: the women's group, not all genders.
    assert.deepEqual(shapeLib.cardMats(14400, bostonShape).map(([k, t]) => `${k} ${time.formatDuration(t)}`), ['5K 26:38', '20K 1:47:56', '30K 2:45:41', 'Finish 4:00:00']); ok();
    assert.deepEqual([fmtMi(shapeLib.shapePaces(bostonShape).to20), fmtMi(shapeLib.shapePaces(bostonShape).from30), boston.n], ['8:41', '9:48', 10039]); ok();
    assert.equal(shapeLib.bandKicker({ goal: 14400, place: 'Boston', shape: bostonShape, units: 'mi' }), '4:00 · Boston · course shape, 8:41/mi to 20K, 9:48/mi from 30K'); ok();
    const bostonWomen = band.cellOf(file(band.paceBandShardPath('boston', 'women')).groups.all, 240);
    assert.equal(time.formatDuration(shapeLib.courseShape(bostonWomen, 14400)[3]), '1:48:30', 'Boston women 4:00 at 20K: the women\'s group'); ok();
    // The reasons on real data, the way the planner and the pace band read them from the index.
    const scopeOf = (slug) => index.scopes.find((sc) => sc.slug === slug);
    const why = (slug, gender, minute) => {
      const shardPath = band.paceBandShardPath(slug, gender);
      const cell = index.shards[shardPath] ? band.cellOf(file(shardPath).groups.all, minute) : null;
      return shapeLib.noShapeReason({ scoped: Boolean(scopeOf(slug)), gendered: Boolean(index.shards[shardPath]), minute, goals: index.goals, editions: scopeOf(slug)?.editions ?? null, cellEditions: cell?.ed ?? null });
    };
    assert.deepEqual(index.goals, [150, 390]); ok();
    assert.deepEqual([why('new-york', 'all', 420), why('boston', 'all', 149), why('prague', 'all', 240), why('singapore', 'women', 240), why('auckland', 'women', 240), why('singapore', 'all', 240), why('barcelona', 'all', 210), why('helsinki', 'all', 267), why('austin', 'all', 353)],
      ['range', 'range', 'course', 'gender', 'gender', 'editions', 'editions', 'goal-editions', 'few'], 'New York City 7:00, Boston 2:29, Prague, Singapore and Auckland women, Singapore 4:00, Barcelona 3:30, Helsinki 4:27, Austin 5:53'); ok();
    // The goals each course's group covers, read at build time (shapeGoalsOf) so a page settles at once outside them:
    // Singapore all genders 3:46 to 6:30 (so 3:30 never waits for a shape), no women's group, and Prague not at all.
    const sg = shapeLib.shapeGoalsOf(index);
    assert.deepEqual(sg.singapore, { city: 'Singapore', editions: 1, goals: { all: [226, 390], men: [231, 390] } }); assert.equal(sg.prague, undefined); assert.equal(sg.all, undefined); checks += 3;
    for (const scope of index.scopes.filter((sc) => sc.slug !== 'all')) {
      for (const gender of ['all', 'men', 'women']) {
        const listed = Boolean(index.shards[band.paceBandShardPath(scope.slug, gender)]);
        assert.deepEqual(sg[scope.slug].goals[gender] ?? null, listed ? scope.genders[gender].goals : null, `${scope.slug} ${gender}: the goals the build passes`);
        if (listed) {
          const group = file(band.paceBandShardPath(scope.slug, gender)).groups.all;
          assert.ok(group.g.every((m) => shapeLib.mayShape(sg[scope.slug].goals[gender], m)), `${scope.slug} ${gender}: every published goal is inside the range the page waits on`);
          assert.equal(sg[scope.slug].editions, scope.editions);
          if (scope.editions < shapeLib.SHAPE_MIN_EDITIONS) assert.ok(group.g.every((m) => !shapeLib.mayShape(sg[scope.slug].goals[gender], m, sg[scope.slug].editions)), `${scope.slug} ${gender}: a thin course never waits for a shape`);
        }
      }
    }
    ok();
    assert.equal(shapeLib.mayShape(sg.singapore.goals.all, 210), false, 'Singapore 3:30 settles at once as even pace'); ok();
    // New York City's 6:30 group holds thousands of finishes: outside the published goals there is no count to claim.
    assert.ok(band.cellOf(file(band.paceBandShardPath('new-york', 'all')).groups.all, 390).n > 1000, 'New York City publishes 6:30'); ok();
    // The edition rule (owner decision, October 20, 2026): a shape needs 100 finishes from at least the course results'
    // minimum of editions, so the courses below it have no shape at any goal, and /methodology#tools-course-shape names them.
    const goalsFile = file('tools/course-goal.json');
    assert.equal(shapeLib.SHAPE_MIN_EDITIONS, goalsFile.min_editions, 'The shape\'s edition minimum is the course results\''); ok();
    const thin = index.scopes.filter((sc) => sc.slug !== 'all' && sc.editions < goalsFile.min_editions).map((sc) => `${sc.city} ${sc.editions}`).sort();
    // Auckland joined the list with the October 21, 2026 release, which held its 2017 edition (a misplaced 30 km mat).
    assert.deepEqual(thin, ['Auckland 2', 'Barcelona 2', 'Paris 2', 'Singapore 1'], 'The courses with too few editions for a course shape'); ok();
    // /methodology's "a goal at the edge of a course's range can pool fewer editions than the course has": true on a
    // course with enough editions too (Helsinki 4:27 pools two of its three; under the October 21, 2026 release so do
    // Stockholm's slow goals, from 5:23, after its 2025 hold), and no such goal takes a shape.
    const edge = [];
    for (const sc of index.scopes.filter((x) => x.slug !== 'all' && x.editions >= goalsFile.min_editions)) {
      const group = file(band.paceBandShardPath(sc.slug, 'all')).groups.all;
      group.g.forEach((m, i) => {
        if (group.ed[i] >= goalsFile.min_editions) return;
        edge.push(`${sc.city} ${m} ${group.ed[i]}`);
        assert.equal(shapeLib.shapeFor(sc.slug, band.cellOf(group, m), m * 60), null, `${sc.city} ${m}: no shape on ${group.ed[i]} editions`);
      });
    }
    assert.ok(edge.includes('Helsinki 267 2') && edge.every((e) => / [12]$/.test(e)), `A goal at the edge of a course's range on fewer editions than a course result needs (${edge.length})`); ok();
    assert.equal(shapeLib.shapeFor('helsinki', band.cellOf(file(band.paceBandShardPath('helsinki', 'all')).groups.all, 267), 267 * 60), null, 'Helsinki 4:27: no shape on two editions'); ok();
    // The planner never sets a shape beside "3 are needed for any goal": Singapore, Barcelona and Paris have neither course
    // results nor a shape. Beside a shape (or one on its way) the note is scoped to the results on goal pace (goalPaceNote).
    const planLib = require('../lib/tools/plan.ts');
    for (const [city, goal] of [['Singapore', 14400], ['Barcelona', 10800], ['Paris', 14400]]) {
      const slug = index.scopes.find((sc) => sc.city === city).slug;
      const r = planLib.courseGoalResult(goalsFile, city, goal, null);
      const cell = band.cellOf(file(band.paceBandShardPath(slug, 'all')).groups.all, goal / 60);
      assert.ok(r.state === 'unavailable' && /3 are needed for any goal/.test(r.reason) && cell && shapeLib.shapeFor(slug, cell, goal) === null, `${city}: no results on goal pace, and no shape`);
      checks += 1;
    }
    assert.equal(planLib.goalPaceNote({ state: 'unavailable', course: { editions: 10 }, minutes: 240, reason: 'Only 2 editions had 20 or more finishes at this pace; 3 are needed.' }, 'Boston'),
      'No results on goal pace for Boston at this goal. Only 2 editions had 20 or more finishes at this pace; 3 are needed.'); ok();
    assert.ok(singapore.ed.every((e) => e === 1), 'Singapore: one edition'); ok();
    const methods = sourceOf('components/methods/MethodsTools.tsx');
    assert.match(methods, /const thin = band\.scopes\.filter\(\(s\) => s\.slug !== 'all' && s\.city && s\.editions < goal\.min_editions\);/, '/methodology names the courses from the index'); ok();
    assert.match(methods, /from at least \{goal\.min_editions\} editions/, '/methodology says a shape needs the course results\' minimum of editions'); ok();

    // The folds as rendered: the planner's mat table and the pace band's marker table, in course shape beside even pace,
    // and even pace alone otherwise (both components export them for this).
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { MatTable } = require('../components/tools/RacePlan.tsx');
    const { Wristband } = require('../components/tools/PaceBand.tsx');
    const tds = (html) => [...html.matchAll(/<tr(?: class="[^"]*")?><th scope="row">(?:[^<]|<small>[^<]*<\/small>)*<\/th>((?:<td>[^<]*<\/td>)+)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td>([^<]*)<\/td>/g)].map((c) => c[1]));
    const matCourse = renderToStaticMarkup(React.createElement(MatTable, { goal: 14400, units: 'mi', observed: null, shape: { times: bostonShape, n: boston.n, window: '3:55:00 to 3:59:59 in Boston' } }));
    const evenMats = POINTS.map((km, i) => time.formatDuration(i === 8 ? 14400 : (14400 / 42.195) * km));
    assert.deepEqual(tds(matCourse).slice(0, 9), bostonShape.map((t, i) => [time.formatDuration(t), evenMats[i]]), 'Planner fold: each mat\'s course shape beside its even pace'); ok();
    assert.match(matCourse, /<th scope="col">Course shape<\/th><th scope="col">Even pace<\/th>/); assert.match(matCourse, /<tfoot><tr><th scope="row">Finishes<\/th><td>10,039<\/td>/); checks += 2;
    assert.match(matCourse, /at each official mat, from finishes 3:55:00 to 3:59:59 in Boston \(Pace Notes data\)/, 'The window, in the table\'s own caption'); ok();
    assert.doesNotMatch(matCourse, /from finishes from/); ok();
    const matEven = renderToStaticMarkup(React.createElement(MatTable, { goal: 14400, units: 'mi', observed: null, shape: null }));
    assert.deepEqual(tds(matEven).map((c) => c[0]), evenMats, 'Planner fold at even pace: the plan alone'); ok();
    const bostonRows = shapeLib.bandRows(14400, 'mi', bostonShape), evenRows = pace.splitTable(14400, 42.195, 'mi');
    const wristCourse = renderToStaticMarkup(React.createElement(Wristband, { rows: bostonRows, goal: 14400, pKm: 14400 / 42.195, units: 'mi', overrun: 0.01, even: evenRows, finishes: boston.n }));
    assert.deepEqual(tds(wristCourse.replace(/<tfoot>[\s\S]*<\/tfoot>/, '')), bostonRows.map((r, i) => [time.formatDuration(r.elapsed), time.formatDuration(evenRows[i].elapsed)]), 'Pace band fold: each marker\'s course shape beside its even pace'); ok();
    // The timing points carry their own class (drawn bold, pace-band.css), the interpolated rows none, and the foot gives
    // the finishes the shape comes from.
    const rowClass = [...wristCourse.matchAll(/<tr(?: class="([^"]*)")?><th scope="row">([^<]*)/g)].map((m) => [m[2], m[1] ?? '']);
    assert.ok(rowClass.filter(([, c]) => c === 'is-mat' || c === 'is-finish').map(([k]) => k).join(',') === '5K,10K,15K,20K,25K,30K,35K,40K,Finish' && rowClass.some(([k, c]) => /^Half/.test(k) && c === 'is-half') && rowClass.filter(([k]) => /^Mile/.test(k)).every(([, c]) => c === ''), 'Bold timing points, the mile and half rows even between them'); ok();
    assert.match(wristCourse, /<tfoot><tr><th scope="row">Finishes<\/th><td>10,039<\/td><td><\/td><\/tr><\/tfoot>/); ok();
    assert.match(wristCourse, /\(from Pace Notes data at the timing points, even between them\), beside exact even-pace times; a watch reading 1\.0% long shows an average of 9:04\/mi/); ok();
    const wristEven = renderToStaticMarkup(React.createElement(Wristband, { rows: evenRows, goal: 14400, pKm: 14400 / 42.195, units: 'mi', overrun: 0 }));
    assert.deepEqual(tds(wristEven), evenRows.map((r) => [time.formatDuration(r.elapsed)]), 'Pace band fold at even pace: one column'); ok();
  }

  // The strips: in course shape the big numbers are the shape, there is no "H" line, and the caption names the shape and
  // its source; even pace keeps today's strip with its "H" line.
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const PaceBandStrip = require('../components/tools/PaceBandStrip.tsx').default;
  const held = { n: 4321, e50: fake.e50 };
  const strip = (shape) => renderToStaticMarkup(React.createElement(PaceBandStrip, { goal: 14430, pKm: 14430 / 42.195, units: 'mi', rows: shapeLib.bandRows(14430, 'mi', shape), interval: 'mi', overrun: 0,
    place: 'Boston', genderWord: '', observed: { held, lo: 14100, hi: 14399, place: 'Boston', genderWord: '' }, profile: null, showBack: false, waiting: false, shape }));
  const courseHtml = strip(fakeShape), evenHtml = strip(null);
  assert.doesNotMatch(courseHtml, /class="h">H /, 'Course shape: no "H" line'); assert.match(evenHtml, /class="h">H 25:00</, 'Even pace keeps its "H" line'); checks += 2;
  // In course shape the mat cells hold the name and the time alone (no empty "H" row under them), as the split cells do.
  assert.deepEqual([(courseHtml.match(/class="h"/g) || []).length, (evenHtml.match(/class="h"/g) || []).length], [1, 10], 'Course shape: only the Goal cell keeps its small line'); ok();
  assert.match(courseHtml, /Course shape · finishes that made the goal in Boston · Pace Notes data/); assert.match(evenHtml, /H = held-pace median of 4,321 finishes 3:55:00–3:59:59, Boston \(Pace Notes data\)\. Big numbers: even pace\./); checks += 2;
  const mats = (html) => [...html.matchAll(/<span class="k">(?:\d+K|Finish) <small>[^<]*<\/small><\/span><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(mats(courseHtml), fakeShape.map((t) => time.formatDuration(t)), 'Course shape: the mat strip is the shape'); ok();
  assert.deepEqual(mats(evenHtml), POINTS.map((km, i) => time.formatDuration(i === 8 ? 14430 : (14430 / 42.195) * km)), 'Even pace: the mat strip is even pace'); ok();
  assert.match(courseHtml, /Course shape \(Pace Notes data\) 4:00:30 · each mile · strip 1 of 3/); assert.match(evenHtml, /Even pace 4:00:30 · each mile · strip 1 of 3/); checks += 2;
  assert.equal((courseHtml.match(/Pace Notes data/g) || []).length, 4, 'Course shape: the mat strip and each of the three mile strips name Pace Notes data'); ok();
  // The split strips' big numbers are the band in its mode: in course shape the shape's rows (bandRows), at even pace
  // the even rows, at every mile and halfway.
  const splitTimes = (html) => [...html.matchAll(/<span class="k">(Mi \d+|Km \d+|Half)<\/span><b>([^<]+)<\/b>/g)].map((m) => `${m[1]} ${m[2]}`);
  const expectSplits = (rows) => rows.filter((r) => !r.finish && (r.halfway || Math.abs(r.km / 1.609344 - Math.round(r.km / 1.609344)) < 1e-6)).map((r) => `${r.halfway ? 'Half' : `Mi ${Math.round(r.km / 1.609344)}`} ${time.formatDuration(r.elapsed)}`);
  assert.deepEqual(splitTimes(courseHtml), expectSplits(shapeLib.bandRows(14430, 'mi', fakeShape)), 'Course shape: the mile strips are the shape'); ok();
  assert.deepEqual(splitTimes(evenHtml), expectSplits(pace.splitTable(14430, 42.195, 'mi')), 'Even pace: the mile strips are even pace'); ok();
  assert.ok(splitTimes(courseHtml).length === 27 && splitTimes(courseHtml).some((t, i) => t !== splitTimes(evenHtml)[i]), 'The two modes differ on the mile strips'); ok();
  assert.ok(courseHtml.includes(`· course shape, ${shapeLib.shapeLine(fakeShape, 'mi')} · cut along the dashed lines`), 'The sheet head gives the shape in the kicker\'s words'); ok();
  // The Goal cell: in course shape the goal's even pace is labelled as the average, never a bare pace beside the shape.
  assert.match(courseHtml, /<span class="k">Goal<\/span><b>4:00:30<\/b><span class="h"><span class="nowrap">avg 9:10\/mi<\/span> · <span class="nowrap">5:42\/km<\/span><\/span>/); assert.match(evenHtml, /<span class="k">Goal<\/span><b>4:00:30<\/b><span class="h">9:10\/mi · 5:42\/km<\/span>/); checks += 2;
  const watched = (shape) => renderToStaticMarkup(React.createElement(PaceBandStrip, { goal: 14430, pKm: 14430 / 42.195, units: 'mi', rows: shapeLib.bandRows(14430, 'mi', shape), interval: 'mi', overrun: 0.01,
    place: 'Boston', genderWord: '', observed: null, profile: null, showBack: false, waiting: false, shape }));
  assert.match(watched(fakeShape), /<span class="nowrap">5:42\/km<\/span><br\/><span class="nowrap">watch 9:05\/mi<\/span><\/span>/, 'Course shape: the watch on its own line, "avg" said once'); ok();
  assert.match(watched(null), /<span class="h">9:10\/mi · 5:42\/km · watch 9:05\/mi<\/span>/, 'Even pace: the Goal cell as before'); ok();
  // While the shape loads: the course shape's strip with dashes for times (the finish is the goal), no "H" line, and its caption.
  const pendingHtml = renderToStaticMarkup(React.createElement(PaceBandStrip, { goal: 14430, pKm: 14430 / 42.195, units: 'mi', rows: shapeLib.bandRows(14430, 'mi', null), interval: 'mi', overrun: 0,
    place: 'Boston', genderWord: '', observed: { held, lo: 14100, hi: 14399, place: 'Boston', genderWord: '' }, profile: null, showBack: false, waiting: true, shape: null, pending: true }));
  assert.deepEqual(mats(pendingHtml), [...Array(8).fill('—'), '4:00:30'], 'Pending: dashes at the mats, the goal at the finish'); ok();
  assert.doesNotMatch(pendingHtml, /class="h">H |Even pace|<b>\d+:\d\d<\/b><\/div><div class="pace-band-cell"><span class="k">Mi/, 'Pending: no even-pace times, no "H" line'); ok();

  // One rule, one control, one wording on both pages.
  const planSource = sourceOf('components/tools/RacePlan.tsx'), bandSource = sourceOf('components/tools/PaceBand.tsx');
  for (const [name, source] of [['RacePlan', planSource], ['PaceBand', bandSource]]) {
    assert.match(source, /import BandChoice, \{ KickerText, ShapeLine \} from '@\/components\/tools\/BandChoice';/, `${name} uses the one control, the kicker's phrasing and the shape's line`);
    assert.match(source, /<BandChoice id="[\w-]+" state=\{bandState\} mode=\{pending \? 'course' : mode\} onChange=\{\(m\) => setQ\(\{ pace: bandChoice\(m\) \}\)\}/, `${name}: the control writes only even pace to the address`);
    assert.match(source, /const \{ mode, shaped, pending, layout: course(?:Card|Band), offered \} = bandView\(\{ shape, choice: q\.pace, loading: shapeLoading/, `${name}: one rule for the default and the override (bandView, with the visitor's choice)`);
    assert.equal((source.match(/\bshaped\s*=[^=>]/g) || []).length, 0, `${name}: the band's shape is only ever bandView's`);
    assert.equal((source.match(/bandRows\(/g) || []).length, 1, `${name}: one set of rows`);
    assert.match(source, /const rows = useMemo\(\(\) => \(goal === null \? \[\] : bandRows\(goal, [^,]+, shaped\)\)/, `${name}: the rows come from the band in its mode`);
    assert.match(source, /shape=\{shaped\}/, `${name}: the strips print the band in its mode`);
    assert.match(source, /line=\{noShape\}/, `${name}: the one line says why there is no shape`);
    assert.match(source, /\{shaped \? 'Course shape from Pace Notes data' : /, `${name}: a printed course shape names Pace Notes data`);
    assert.match(source, /const minute = goal === null \? null : bandMinute\(goal\);/, `${name}: the group's minute from the one rule`);
    assert.match(source, /bandKicker\(\{ goal, place, /, `${name}: the band's kicker in the shared words`);
    assert.match(source, /tidyChoice\(q\.pace, /, `${name}: a hand-edited pace leaves the address`);
    assert.match(source, /goalPace\(pKm, units, course(?:Card|Band)\)/, `${name}: the goal bar labels the average in the course shape's layout, also while it loads`);
    assert.match(source, /<ShapeLine goal=\{goal\} city=\{city \?\? ''\}/, `${name}: the shape's one line in the same words`);
    checks += 14;
  }
  assert.match(planSource, /cardMats\(goal, shaped, pending\)/, 'The planner card\'s four times from the one rule'); ok();
  assert.match(planSource, /<small>per \{unitWord\} to 20K<\/small>[\s\S]{0,200}<small>per \{unitWord\} from 30K<\/small>/, 'Both of the card\'s phases name their unit, in the kicker\'s words'); ok();
  assert.match(planSource, /<ShapeLine goal=\{goal\} city=\{city \?\? ''\} pending=\{pending\} className="plan-shape-line" \/>/, 'The card\'s line waits, unshown, while the shape loads'); ok();
  assert.match(planSource, /: pending \? <>Course shape \(Pace Notes data\)\.<\/> *$/m, 'The printed header while a shape loads: no even pace, no paces'); ok();
  // The planner's wiring (each a reviewer mutation that once passed): the strips get the band's rows, both mat tables the
  // shape in its mode, the reason the course's own (Prague has no pace-band group), and the wait only inside the
  // goals the course's group covers.
  assert.match(planSource, /<PaceBandStrip goal=\{goal\} pKm=\{pKm\} units=\{units\} rows=\{rows\} /, 'The planner\'s strips print the band\'s rows'); ok();
  assert.equal((planSource.match(/<MatTable goal=\{goal\} units=\{units\} observed=\{comparison\} shape=\{matShape\} \/>/g) || []).length, 2, 'Both mat tables show the band in its mode'); ok();
  assert.match(planSource, /const matShape = shaped && all && observed \? \{ times: shaped, /); ok();
  assert.match(planSource, /noShapeReason\(\{ scoped: course\.band, gendered: true, minute, goals: bandGoals, editions: course\.editions, cellEditions: all\?\.ed \?\? null \}\)/, 'The planner\'s reason: no group for a course the pace band does not publish, and its editions'); ok();
  assert.match(planSource, /mayShape\(course\?\.shapeGoals, minute, course\?\.editions\)/, 'The planner waits for a shape only inside the course\'s goals, and never on a thin course'); ok();
  assert.match(planSource, /bandKicker\(\{ goal, place, shape: shaped, units, pending, phases: false \}\)/, 'The planner\'s band panel kicker leaves the paces to the card'); ok();
  assert.match(planSource, /result\?\.state === 'unavailable' && goalData\.data && offered \? goalPaceNote\(/, 'Beside a shape, in either mode, the note is scoped to the results on goal pace'); ok();
  assert.doesNotMatch(planSource, /\$\{courseCard \? 'even ' : ''\}/, 'The lead\'s words do not change with the Splits choice'); ok();
  assert.doesNotMatch(planSource + bandSource, /is-narrow-only/, 'Every Pace Notes data panel keeps its badge at every width'); ok();
  // The pace band's wiring: the choice sits in the band's own panel, the wait only inside the course and gender's goals.
  assert.match(bandSource, /mayShape\(published\?\.goals\[gender\], minute, published\?\.editions\)/, 'The pace band waits for a shape only inside the course and recorded gender\'s goals, never on a thin course'); ok();
  assert.match(bandSource, /editions: published\?\.editions \?\? null, cellEditions: fresh\?\.all\.ed \?\? null/, 'The pace band\'s reason knows the course\'s and the goal\'s editions'); ok();
  assert.match(bandSource, /noShapeReason\(\{ scoped: Boolean\(published\), gendered: Boolean\(published\?\.goals\[gender\]\), minute, /, 'The pace band\'s reason from what the build knows'); ok();
  assert.match(bandSource, /<PaceBandStrip goal=\{goal\} pKm=\{pKm\} units=\{units\} rows=\{rows\} [^>]*shape=\{shape\}/, 'The pace band\'s strips print the band\'s rows'); ok();
  assert.match(bandSource, /<PrintPanel goal=\{goal\} pKm=\{pKm\} units=\{units\} rows=\{rows\} /); ok();
  assert.match(bandSource, /\{kicker\} \/><\/p>\s*\{line\}\s*\{choice\}\s*<PaceBandStrip/, 'The pace band\'s choice sits directly above the band it changes'); ok();
  assert.match(planSource, /<b>\{paces \? formatDuration\(perUnit\(paces\.to20, units\)\) : '—'\}<\/b>[\s\S]{0,200}<b>\{paces \? formatDuration\(perUnit\(paces\.from30, units\)\) : '—'\}<\/b>/, 'The card\'s two phases are the shape\'s paces (dashes while it loads)'); ok();
  assert.match(planSource, /\{courseCard \? <EvidenceTag kind="data" \/> : null\}\s*<h2 className="tool-panel-title" id="plan-band-title">/, 'The planner\'s band panel carries the Pace Notes data badge in course shape'); ok();
  assert.match(bandSource, /\{course \? <EvidenceTag kind="data" className="no-print" \/> : null\}/, 'The pace band\'s band carries the Pace Notes data badge in course shape'); ok();
  assert.match(planSource, /disabled=\{pending\} onClick=\{\(\) => printAs\('strip'\)\}/, 'The planner waits to print while the shape loads'); ok();
  assert.match(bandSource, /stale\.place === place && stale\.genderWord === genderWord/, 'The pace band reuses a loading shape only for the same course and recorded gender'); ok();
  assert.match(bandSource, /const shardPath = paceBandShardPath\(course, gender\);/, 'The pace band reads the chosen recorded gender\'s shard'); ok();
  assert.match(planSource, /shapeFor\(isAll \? 'all' : course\?\.slug \?\? 'all', all, goal\)/, 'The planner shapes only a chosen course, from its all-genders group'); ok();
  assert.match(bandSource, /shapeFor\(course, shapeFrom\.all, goal\)/, 'The pace band shapes from the course and recorded gender on screen'); ok();
  assert.match(sourceOf('components/tools/BandChoice.tsx'), /<Choice label=\{BAND_LABEL\} value=\{mode\} onChange=\{onChange\} options=\{BAND_OPTIONS\} small className="band-choice-seg" \/>/, 'The control is the site\'s segmented Choice'); ok();
  for (const file of ['lib/tools/course-shape.ts', 'components/tools/BandChoice.tsx']) {
    const text = sourceOf(file).replace(/^\s*(?:\/\/|\/\*\*?|\*).*$/gm, '');
    // "Not a prediction" is the one allowed use (a short wording disclaimer).
    assert.doesNotMatch(text, /\bshould\b|your chance|arithmetic|to make \d|(?<!Not a )predict/i, `${file}: no advice, chance, prediction or causal wording`); ok();
  }
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
  assert.equal(say(F.groupGapText(held, slow)), 'At 20 km the median time of the finishes with a sustained slowdown was 8:24 ahead of the median of those without one; the two medians were furthest apart at 25 km (9:05), and at the finish the slowdown group’s median was 6 seconds faster.'); ok();
  assert.ok(say(F.groupGapText([1986, 3992, 6017, 8077, 10213, 12393, 14645, 16910, 17845], [1833, 3668, 5540, 7493, 9606, 11866, 14319, 16841, 17846])).endsWith('at the finish the slowdown group’s median was 1 second slower.')); ok();
  assert.ok(say(F.groupGapText(held, held)).endsWith('level with the median of those without one, and at the finish the two medians were level.')); ok();
  // Where the slowdowns began: the most common onset section, with ties named.
  assert.equal(say(F.onsetText([546, 3299, 13127, 15378], [20, 25, 30, 35])), 'The sustained slowdown most often began in the 35 to 40 km section: 15,378 of the 32,350 finishes with one (47.5%).'); ok();
  assert.equal(say(F.onsetText([10, 30, 30, 0], [20, 25, 30, 35])), 'The sustained slowdown most often began in the 25 to 30 km and 30 to 35 km sections: 30 of the 70 finishes with one in each (42.9% each).'); ok();
  assert.equal(F.onsetText([0, 0, 0, 0], [20, 25, 30, 35]), null); assert.equal(F.onsetText([1, 2], [20, 25, 30]), null); checks += 2;
  assert.deepEqual([F.editionsText(179, 179), F.editionsText(177, 179), F.editionsText(5, null)], ['all 179 race editions', '177 of the 179 race editions', '5 race editions']); ok();
  // Ranks among the goal pages, counted from the nearer end.
  assert.deepEqual([5, 4, 3, 2, 1].map((v) => F.rankAmong(v, [1, 2, 3, 4, 5], 'highest', 'lowest')), ['the highest', 'the second highest', 'the third highest', 'the second lowest', 'the lowest']); ok();
  assert.equal(F.rankAmong(4, [1, 4, 4, 2, 3], 'most', 'fewest'), 'the joint most'); assert.equal(F.rankAmong(1, [1, 2], 'most', 'fewest'), null); checks += 2;
  const peers = [{ goal: 180, n: 59925, sd: 0.0431 }, { goal: 210, n: 112412, sd: 0.1261 }, { goal: 240, n: 171033, sd: 0.1891 }, { goal: 270, n: 117684, sd: 0.3817 }, { goal: 300, n: 82315, sd: 0.45 }];
  // Since October 16, 2026 a goal page no longer ranks its window's size (coverage, not an insight).
  assert.equal(F.windowRankText, undefined); assert.doesNotMatch(fs.readFileSync('components/tools/GoalPace.tsx', 'utf8'), /window holds|Each beat \{label\} by/); ok();
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
  // The type finder's own reader (lib/pacing-type.ts, also run at build for the story's example) agrees with the tools' classifier.
  const finder = require('../lib/pacing-type.ts');
  for (const t of [even, slow]) {
    const got = finder.classifyTimes(t, archetypes.classifier);
    assert.ok(got, 'the type finder reads a plain marathon');
    assert.equal(got.best, splits.classify(splits.readSplits(t).relative, archetypes.classifier), 'type finder and tools classifier agree');
  }
  checks += 2;
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
// The pace band's screens account exactly for the editions and finishes it leaves out of the data (the methodology page
// lists them; the goal pages and tools no longer print them).
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
    // The registry types no figure: /methodology fills {finishes} with the cohort from this file.
    assert.ok(registry.EVIDENCE_TEXT.data.includes('{finishes}') && !/\d million/.test(registry.EVIDENCE_TEXT.data), 'Evidence text leaves the tool cohort to the data');
    const built = path.join(__dirname, '..', 'out/methodology.html');
    // One total with its subset (round 4): the eligible finishes, then the tool cohort within them.
    if (fs.existsSync(built)) assert.ok(fs.readFileSync(built, 'utf8').includes(`the tools use the ${(n / 1e6).toFixed(2)} million without start delays or shifted mats`), 'The built /methodology quotes the tool cohort as a subset of the eligible finishes');
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
  const COMPONENT = { plan: 'RacePlan', 'pace-calculator': 'PaceCalculator', predictor: 'Predictor', 'pace-band': 'PaceBand', 'course-chooser': 'CourseChooser',
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
// Method, source and coverage copy lives on /methodology only (owner, 2026-10-16). The tools show their results, the
// evidence badges (each a link to /methodology#evidence, or a plain label inside a card that is itself a link) and the
// term "sustained slowdown" linked to its definition; no "How this works" box, definition, citation or screening note.
{
  const root = path.join(__dirname, '..');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  const files = ['components/tools', 'app/tools'].flatMap((dir) => walk(path.join(root, dir))).filter((f) => /\.tsx?$/.test(f));
  const rel = (f) => path.relative(root, f);
  const BANNED = [
    [/\bToolMethod\b|tool-method|How this (?:page )?works/, 'a "How this works" box'],
    [/SLOWDOWN_DEFINITION|SLOWDOWN_CITATION|doi:10\.|journal\.pone/, 'the slowdown definition or its citation'],
    [/Source: <a|className="(?:tool-sources|qrace-sources|weather-match-cite)"/, 'a source line'],
    [/Left out (?:as duplicated|because start delays|because the mat grid)|ProjectorExclusions/, 'an edition-screening note'],
    [/Fewer than 100 (?:finishes|complete)|at least 100 finishes|100 finishes in all|editions counted equally|counted equally|editions pooled/i, 'an eligibility or weighting note'],
    [/runners who stopped are not in the data|Counts are finishes, not people|Only complete finishes/i, 'a data-limits caveat'],
    [/supplied (?:current )?route|modelled (?:hour|observation|reading)|not anyone’s (?:personal )?exposure|historical validity/i, 'a data-source note'],
    [/Vickers|Keogh|RunningAHEAD|Brimicombe|Roberts et al|Armstrong et al|Stull 2011|Magnus formula|Daniels & Gilbert 1979|Riegel 1981/, 'a method citation'],
    [/Groups rebuilt from|AccuracyPanel|AccuracyLine|validation\b/, 'the projector validation'],
    // Second pass (October 16, 2026): author-year labels, definition details and coverage notes left in the results.
    [/\b(?:Ely|Mantzios|Knechtle) et al\b|Tanda \(2011\)|(?:basis of|equations behind) VDOT|training logs|in a study of/, 'a method citation'],
    [/short of the 25% threshold|cannot count (?:alone|as a sustained)|nearest of six|finishes in the pacing-types story/, 'a definition detail'],
    [/gender groups cover|read (?:a certified course )?a little long|have enough finishes at|Too few editions for any goal|window holds|as published by|states them for|does not say whether a time exactly equal|About one in five arrived|whose last 5 km|The window is ±/, 'a method or coverage note'],
  ];
  // Visible copy only: block comments, JSX comments and whole-line or trailing // comments are left out.
  const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => line.replace(/(^|\s)\/\/\s.*$/, '$1')).join('\n');
  for (const file of files) {
    const text = code(fs.readFileSync(file, 'utf8'));
    for (const [pattern, what] of BANNED) assert.doesNotMatch(text, pattern, `${rel(file)} shows ${what}; it belongs on /methodology`);
    // Badges go through EvidenceTag (a link to /methodology#evidence), never a hand-written span.
    if (!file.endsWith(path.join('components', 'tools', 'EvidenceTag.tsx'))) assert.doesNotMatch(text, /<span className=\{?[`"]evidence-badge/, `${rel(file)} writes an evidence badge by hand`);
  }
  checks += files.length;
  const tag = fs.readFileSync(path.join(root, 'components/tools/EvidenceTag.tsx'), 'utf8');
  assert.match(tag, /href="\/methodology#evidence"/, 'Evidence badges link to /methodology#evidence');
  assert.match(tag, /href="\/methodology#sustained-slowdown"/, 'The term links to its definition on /methodology');
  assert.match(fs.readFileSync(path.join(root, 'components/tools/ui.tsx'), 'utf8'), /\{kind \? <EvidenceTag kind=\{kind\} \/> : null\}/, 'EvidencePanel badges are linked');
  checks += 3;
  // Rendered: a panel badge is a link to the evidence anchor, a compact (card) badge a plain label with no explanation.
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { EvidencePanel } = require('../components/tools/ui.tsx');
  const { EvidenceBadge } = require('../components/tools/ToolShell.tsx');
  assert.match(renderToStaticMarkup(React.createElement(EvidencePanel, { kind: 'data', title: 'T' }, 'x')), /<a [^>]*href="\/methodology#evidence"[^>]*class="evidence-badge evidence-data"|<a [^>]*class="evidence-badge evidence-data"[^>]*href="\/methodology#evidence"/);
  const compact = renderToStaticMarkup(React.createElement(EvidenceBadge, { kind: 'research', compact: true }));
  assert.equal(compact, '<span class="evidence-badge evidence-research">Published research</span>', 'A card badge is a bare label');
  checks += 2;
}

// The cohort note says which pages start from the screened finishes. Since October 16, 2026 it is shown only on
// /methodology (#totals); the home page and /research still run its total checks (assertCohortTotals) without showing
// it. Only the tools with a Pace Notes data badge start from the finishes; the note says what each other tool uses,
// from its badges, and never that every page or every tool starts from the finishes. A data tool without a data file,
// or whose file starts from another total, stops the render (and so the build).
if (fs.existsSync(path.join(__dirname, '..', 'public/data/insights/manifest.json'))) {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const registry = require('../lib/tools/registry.ts');
  const { countWord } = require('../lib/stories.ts');
  const cohortNote = require('../components/CohortNote.tsx');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/data/insights/manifest.json'), 'utf8'));
  const shown = registry.TOOLS.filter((t) => !t.file || manifest.files[t.file]);
  const dataTools = shown.filter((t) => t.evidence.includes('data'));
  const otherTools = shown.filter((t) => !t.evidence.includes('data'));
  const render = () => renderToStaticMarkup(React.createElement(cohortNote.default)).replace(/<[^>]+>/g, '');
  const note = render();
  const dataPhrase = `the ${countWord(dataTools.length)} tools that use ${registry.EVIDENCE_LABEL.data}`;
  assert.ok(dataTools.length > 1 && note.includes(dataPhrase), `The cohort note names the ${dataTools.length} data tools: ${note}`);
  assert.equal(note.match(/\btools?\b/g).length, 1, `"tools" only in "${dataPhrase}": ${note}`);
  assert.doesNotMatch(note, /every page|every tool|all (?:the )?tools/i, 'No claim that every page or tool starts from the finishes');
  for (const t of otherTools) {
    const from = t.evidence.length ? t.evidence.map((kind) => registry.EVIDENCE_LABEL[kind].toLowerCase()).join(' and ') : 'only your own inputs';
    assert.ok(note.includes(`${t.title.toLowerCase()} uses ${from}`), `The cohort note says the ${t.slug} tool uses ${from}: ${note}`);
  }
  assert.equal(cohortNote.screenedPages(), `the stories, the course pages and ${dataPhrase}`);
  const homeSource = fs.readFileSync(path.join(__dirname, '..', 'app/(home)/page.tsx'), 'utf8');
  const hubSource = fs.readFileSync(path.join(__dirname, '..', 'app/research/(hub)/page.tsx'), 'utf8');
  for (const [where, source] of [['home page', homeSource], ['/research', hubSource]]) {
    assert.match(source, /assertCohortTotals\(\)/, `The ${where} still runs the cohort note's total checks`);
    assert.doesNotMatch(source, /<CohortNote|screenedPages\(\)/, `The ${where} shows no cohort note; it is on /methodology`);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'components/methods/MethodsData.tsx'), 'utf8'), /<CohortNote \/>/, 'The cohort note is on /methodology');
  for (const [fake, error] of [[{ slug: 'fake', evidence: ['data'] }, /fake tool has a Pace Notes data badge but no data file/], [{ slug: 'fake', evidence: ['data'], file: 'replay/berlin-2024.json' }, /must start from the story manifest's analysis_n/]]) {
    registry.TOOLS.push(fake);
    try { assert.throws(render, error); } finally { registry.TOOLS.pop(); }
  }
  assert.equal(render(), note, 'The registry is as it was');
  checks += 8 + otherTools.length;
}

console.log(`Tool libraries passed ${checks} checks: time parsing and keypad input (the dot key types a colon in race-time fields; every time reader takes dots and commas), pace calculations and splits, pace charts by goal time and goal-page links, result handoffs to the planner, the pace band and the pacing-pattern analysis, the race planner (its goal, the course-goal row it shows, recounted from the runner records, and the rendered plan), the course-shape band on every course shard and published goal (its rule, rows, fallback, default and strips), goal-page sentences, published predictor and heat formulas, qualifying standards with official worked examples and age rules, sustained-slowdown reading, the pacing-type classifier, and the cohort note, which says only the tools with Pace Notes data start from the screened finishes.`);
