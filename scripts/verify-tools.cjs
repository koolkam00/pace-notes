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
  // The stretch-pace option, off by default: its box directly under the strips and above the print row, unticked; the strips
  // carry no paces; the fold of every 5K and every mile follows Every mat; nothing more prints.
  assert.match(html, /<\/div><\/div><label class="tool-check band-paces no-print"><input type="checkbox"\/><span>Add each stretch’s pace<small> \(per mile\)<\/small><\/span><\/label><div class="tool-share share-bar no-print">/, 'The planner: the paces box under the strips, unticked'); ok();
  assert.ok(!/class="p"|has-paces|plan-print-stretches/.test(html), 'The planner, paces off: no paces on the strips, no printed tables'); ok();
  assert.match(html, /id="plan-mat-values"[\s\S]*<details class="values" id="plan-stretch-values"><summary><span>All numbers<span class="values-count">each 5K and mile · 36 rows<\/span><\/span>[\s\S]*?<p class="values-caption" id="plan-stretch-values-caption">Every 5K and every mile: time and pace<\/p>/, 'The planner: the fold of every 5K and every mile, after Every mat, named in its summary'); ok();
  assert.match(html, /<details class="values" id="plan-mat-values"><summary><span>All numbers<span class="values-count">9 rows<\/span><\/span>/, 'The planner: the Every mat fold keeps its plain summary'); ok();
  assert.ok(!/plan-paces-note|aria-describedby="plan-paces-note"/.test(html), 'The planner, paces off: no note under the box'); ok();
  const planSource = sourceOf('components/tools/RacePlan.tsx');
  assert.match(planSource, /useQueryState\(DEFAULTS\)/); assert.match(planSource, /const DEFAULTS = \{ course: 'all', goal: '4:00', pace: '', paces: '' \};/, 'The planner keeps exactly course, goal, the band\'s even-pace choice and the stretch-pace option in its address'); checks += 2;
  // On all courses (the example) the band is even pace: no Terrain | Even pace choice, no terrain line and no badge on the band.
  assert.doesNotMatch(html, /band-choice|Terrain|terrain splits|evidence-research/, 'All courses: even pace, no terrain and no choice'); ok();
  assert.doesNotMatch(planSource, /trackAnalytics|posthog/i, 'The planner sends no event of its own'); ok();
}

// ---- the terrain splits (lib/tools/terrain-band.ts and terrain-data.ts; owner decision, October 23, 2026: "It should use an
// elevation model"): on the ten courses with a checked route profile the planner and the pace band spread the visitor's own
// goal over the corrected route at an even effort with one published grade curve, ending exactly on the goal, the same for
// every recorded gender. An independent JavaScript port of the model (scripts/lib/terrain-model.cjs) recomputes every
// published share from the published model input and asserts the parity fixture the Python tests write; then every terrain
// course at every whole-minute goal from 1:30 to 8:00 and the same goal + 30 s, at miles, km and the 5K mats; the pinned
// plans (re-derived from the built file; any change needs a written reason); the rules, the wording both pages print, the
// folds, the strips and the wiring. Every other course, and All courses, is even pace.
{
  const tb = require('../lib/tools/terrain-band.ts');
  const sp = require('../lib/tools/stretch-paces.ts');
  const td = require('../lib/tools/terrain-data.ts');
  const tm = require('./lib/terrain-model.cjs');
  const band = require('../lib/tools/pace-band-data.ts');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const root = path.join(__dirname, '..');
  const sourceOf = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const insight = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public/data/insights', name), 'utf8'));
  const F = time.formatDuration;
  const clock = (h, m, s = 0) => h * 3600 + m * 60 + s;
  const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
  const MI = 1.609344;
  const TEN = ['amsterdam', 'austin', 'boston', 'chicago', 'eindhoven', 'london', 'madrid', 'new-york', 'rotterdam', 'valencia'];
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-6;

  // The curve (spec section 1.1): f(g) = 1 + 0.02869556 g + 0.001520768 g², g clamped to ±10%.
  assert.equal(tm.f(0), 1); near(tm.f(2), 1.0635, 1e-4, 'f(+2)'); near(tm.f(-2), 0.9487, 1e-4, 'f(−2)'); near(tm.f(4), 1.1391, 1e-4, 'f(+4)'); near(tm.f(-4), 0.9096, 1e-4, 'f(−4)');
  near(tm.f(10), 1.4390, 1e-4, 'f(+10)'); near(tm.f(-10), 0.8651, 1e-4, 'f(−10) (1 − 0.2869556 + 0.1520768; the spec table\'s 0.8650 is a rounding slip)'); checks += 7;
  let gMin = 0, fMin = Infinity;
  for (let i = -10000; i <= 10000; i++) { const g = i / 1000; if (tm.f(g) < fMin) { fMin = tm.f(g); gMin = g; } }
  near(fMin, 0.8646, 1e-4, 'the curve\'s minimum'); near(gMin, -9.43, 0.01, 'at −9.43%'); checks += 2;
  assert.equal(tm.f(12), tm.f(10), 'Grade is held at +10%'); assert.equal(tm.f(-12), tm.f(-10), 'Grade is held at −10%'); checks += 2;
  // A flat route is even pace (u = d / 42.195), whatever the route file's length; a hill that climbs and falls back costs net time.
  const flat = tm.published([0, 42.608], [10, 10]);
  flat.km.forEach((u, i) => near(u, (i + 1) / 42.195, 1e-12, `flat: ${i + 1} km is even pace`)); near(flat.half, 0.5, 1e-12, 'flat: halfway'); checks += 2;
  const hill = tm.model([0, 10, 11, 12, 42.195], [10, 10, 50, 10, 10]);
  assert.ok(hill.U.every((u, i) => !i || u > hill.U[i - 1]) && hill.U[0] === 0 && hill.U[hill.U.length - 1] === 1, 'U rises strictly from 0 to exactly 1'); ok();
  const hillTotal = (() => { let t = 0; for (let i = 1; i < hill.x.length; i++) t += 0.5 * (tm.f(hill.g[i]) + tm.f(hill.g[i - 1])) * (hill.x[i] - hill.x[i - 1]); return t; })();
  assert.ok(hillTotal > 42.195 + 0.01, `An up-and-down hill costs net time (${hillTotal.toFixed(4)} flat-km against 42.195)`); ok();

  // The parity fixture (analysis/course_terrain/fixtures/parity.json, written by analysis/test_course_terrain.py from
  // analysis/terrain_model.py and asserted there too): 1 km at +4%, 1 km at −4%, flat elsewhere and a 30 m spike on one input
  // point at 30 km. The JavaScript model must give the same shares within 1e-6 and the same strip within 0.05 m.
  const fixture = JSON.parse(sourceOf('analysis/course_terrain/fixtures/parity.json'));
  const parity = tm.published(fixture.route.d_km, fixture.route.m);
  assert.equal(fixture.km.length, 42); assert.equal(fixture.mi.length, 26); assert.equal(fixture.strip_m.length, 85); checks += 3;
  parity.km.forEach((u, i) => near(u, fixture.km[i], 1e-6, `parity: ${i + 1} km`));
  parity.mi.forEach((u, i) => near(u, fixture.mi[i], 1e-6, `parity: mile ${i + 1}`));
  near(parity.half, fixture.half, 1e-6, 'parity: halfway');
  parity.strip.forEach((v, i) => near(v, fixture.strip_m[i], 0.05 + 1e-9, `parity: strip at ${i * 0.5} km`));
  near(parity.maxGrade, fixture.max_grade_pct, 0.005 + 1e-9, 'parity: the steepest smoothed grade'); checks += 5;
  // The one-sample spike leaves no trace above 1% grade (the running median removes it).
  assert.ok([...parity.model.x].every((x, i) => x < 29 || x > 31 || Math.abs(parity.model.g[i]) < 1), 'parity: a 30 m one-sample spike leaves |grade| under 1%'); ok();

  // The published file: exactly the ten courses, each recomputed here from its own published model input.
  const doc = insight(td.TERRAIN_FILE);
  assert.equal(td.TERRAIN_FILE, 'tools/course-terrain.json'); ok();
  assert.deepEqual(doc.courses.map((c) => c.slug), TEN, 'The ten terrain courses'); ok();
  assert.deepEqual([doc.model.a1, doc.model.a2, doc.model.clamp_pct, doc.model.grid_points, doc.model.median_samples, doc.model.sigma_samples, doc.model.kernel_half_width],
    [tm.A1, tm.A2, [-tm.GMAX, tm.GMAX], tm.GRID_POINTS, tm.MEDIAN_SAMPLES, tm.SIGMA_SAMPLES, tm.KERNEL_HALF_WIDTH], 'The published model is the one recomputed here'); ok();
  const models = {};
  for (const c of doc.courses) {
    const p = tm.published(c.route.d_km, c.route.m);
    models[c.slug] = p.model;
    p.km.forEach((u, i) => near(u, c.km[i], 1e-6, `${c.city}: ${i + 1} km recomputed`));
    p.mi.forEach((u, i) => near(u, c.mi[i], 1e-6, `${c.city}: mile ${i + 1} recomputed`));
    near(p.half, c.half, 1e-6, `${c.city}: halfway recomputed`);
    p.strip.forEach((v, i) => near(v, c.strip.m[i], 0.05 + 1e-9, `${c.city}: strip at ${i * 0.5} km recomputed`));
    near(p.maxGrade, c.max_grade_pct, 0.005 + 1e-9, `${c.city}: steepest smoothed grade recomputed`);
    assert.ok(p.maxGrade <= 8, `${c.city}: smoothed grade at most 8%`);
    checks += 6;
  }
  // Steepest grade and smoothed climb (spec section 3.2), from the file.
  assert.deepEqual(doc.courses.map((c) => [c.slug, c.max_grade_pct, c.smoothed_gain_m]), [['amsterdam', 1.77, 16.2], ['austin', 5.58, 194.9], ['boston', 6.53, 127.7], ['chicago', 1.51, 16.1],
    ['eindhoven', 1.38, 12.2], ['london', 3.78, 42.9], ['madrid', 5.82, 250.5], ['new-york', 6.35, 188.6], ['rotterdam', 3.22, 37.4], ['valencia', 1.56, 40.5]], 'Steepest grade and smoothed climb per course'); ok();

  // What the pages are handed: the shares by slug, the same for every recorded gender (no gender in them), and every other
  // course's reason.
  const { terrain, why, strips } = td.terrainProps(doc, true);
  assert.deepEqual(Object.keys(terrain).sort(), TEN); assert.deepEqual(Object.keys(strips).sort(), TEN); checks += 2;
  assert.ok(Object.values(terrain).every((t) => JSON.stringify(Object.keys(t).sort()) === '["city","features","half","km","mi","race","slug"]'), 'The band the pages get has no gender and no route'); ok();
  assert.deepEqual(td.terrainProps(null), { terrain: {}, why: {} }, 'Without the file every course is at even pace'); ok();
  assert.deepEqual(Object.keys(td.terrainProps(doc)).sort(), ['terrain', 'why'], 'The planner gets no strips'); ok();

  /** The share of the goal at a marker, read from the published arrays by index (independent of terrainAt). */
  const shareAt = (t, km) => {
    if (km >= 42.19) return 1;
    if (Math.abs(km - 21.0975) < 1e-9) return t.half;
    if (whole(km)) return t.km[Math.round(km) - 1];
    if (whole(km / MI)) return t.mi[Math.round(km / MI) - 1];
    throw new Error(`no published share at ${km} km`);
  };
  const E = (goal, t, km) => (km >= 42.19 ? goal : Math.round(goal * shareAt(t, km)));

  // Every terrain course × every whole-minute goal from 1:30 to 8:00 and the same + 30 s, at miles, km and the 5K mats.
  let plans = 0, rowSets = 0, rowsChecked = 0, stretchChecks = 0;
  const fmtPaceOf = (sPerKm, units) => `${F(units === 'mi' ? sPerKm * MI : sPerKm)}/${units}`;
  for (const slug of TEN) {
    const t = terrain[slug], m = models[slug];
    for (let minute = 90; minute <= 480; minute++) {
      for (const extra of [0, 30]) {
        const goal = minute * 60 + extra;
        plans += 1;
        for (const interval of ['mi', 'km', '5k']) {
          const rows = tb.bandRows(goal, interval, t), even = pace.splitTable(goal, 42.195, interval);
          assert.deepEqual(tb.bandRows(goal, interval, null), even, `${slug} ${goal} ${interval}: even pace is the split table itself`);
          assert.equal(rows.length, even.length, `${slug} ${goal} ${interval}: the even-pace markers`);
          let previous = 0;
          rows.forEach((r, i) => {
            const e = even[i];
            assert.ok(r.km === e.km && r.mat === e.mat && r.halfway === e.halfway && r.finish === e.finish, `${slug} ${goal} ${interval} ${r.km}: the even-pace marker`);
            tb.terrainAt(t, r.km); // every marker resolves (throws otherwise)
            assert.equal(r.elapsed, E(goal, t, r.km), `${slug} ${goal} ${interval} ${r.km}: goal × published share, rounded`);
            // and the independent model agrees to within the rounding (published shares carry 7 decimals)
            if (!r.finish) assert.ok(Math.abs(r.elapsed - goal * tm.uAt(m, r.km)) <= 0.5 + goal * 6e-8, `${slug} ${goal} ${interval} ${r.km}: the recomputed model`);
            assert.ok(r.elapsed > previous, `${slug} ${goal} ${interval} ${r.km}: rises strictly`);
            assert.equal(r.split, r.elapsed - previous, `${slug} ${goal} ${interval} ${r.km}: split`);
            previous = r.elapsed;
            rowsChecked += 1;
          });
          assert.ok(rows[rows.length - 1].finish && rows[rows.length - 1].elapsed === goal, `${slug} ${goal} ${interval}: ends exactly on the goal`);
          rowSets += 1;
        }
        // Each stretch's time and pace (lib/tools/stretch-paces.ts, the paces=1 option): the nine 5K sections are the
        // differences of the band's mat times as the strips print them and add up exactly to the goal, on terrain and at
        // even pace (the even-pace times rounded to the second, as the strips and unitSplits round them); at even pace
        // every stretch is at the goal's even pace.
        const fives = sp.fiveKStretches(goal, t), fivesEven = sp.fiveKStretches(goal, null);
        const R = (km) => (km >= 42.19 ? goal : Math.round((goal * km) / 42.195));
        assert.equal(fives.length, 9); assert.equal(fivesEven.length, 9);
        assert.equal(fives.reduce((a, x) => a + x.time, 0), goal, `${slug} ${goal}: the nine 5K section times add up exactly to the goal`);
        fives.forEach((x, i) => assert.equal(x.time, E(goal, t, POINTS[i]) - (i ? E(goal, t, POINTS[i - 1]) : 0), `${slug} ${goal} ${x.label}: the difference of the band's mat times`));
        assert.equal(fivesEven.reduce((a, x) => a + x.time, 0), goal, `${slug} ${goal}: even pace, the 5K section times add up exactly to the goal`);
        fivesEven.forEach((x, i) => assert.equal(x.time, R(POINTS[i]) - (i ? R(POINTS[i - 1]) : 0), `${slug} ${goal} ${x.label}: even pace, the difference of the strip's rounded mat times`));
        stretchChecks += 5;
        for (const units of ['mi', 'km']) {
          const even = fmtPaceOf(goal / 42.195, units);
          assert.ok(fives.every((x) => sp.stretchPace(x, units) === fmtPaceOf(x.time / (x.toKm - x.fromKm), units)) && fivesEven.every((x) => sp.stretchPace(x, units) === even), `${slug} ${goal} ${units}: each 5K's pace is its time over its distance; at even pace the even pace`);
          const each = sp.unitStretches(goal, t, units), eachEven = sp.unitStretches(goal, null, units), whole = tb.unitSplits(goal, t, units), wholeEven = tb.unitSplits(goal, null, units);
          assert.equal(each.length, whole.length + 1, `${slug} ${goal} ${units}: every whole unit and the last part one`);
          assert.equal(each.reduce((a, x) => a + x.time, 0), goal, `${slug} ${goal} ${units}: the unit times add up exactly to the goal`);
          assert.equal(eachEven.reduce((a, x) => a + x.time, 0), goal, `${slug} ${goal} ${units}: even pace, the unit times add up exactly to the goal`);
          assert.ok(whole.every((w, i) => each[i].time === w.split && sp.stretchPace(each[i], units) === `${F(w.split)}/${units}`), `${slug} ${goal} ${units}: each whole unit's time is its split and its pace is that time`);
          assert.ok(wholeEven.every((w, i) => eachEven[i].time === w.split && Math.abs(w.split - goal * (units === 'mi' ? MI : 1) / 42.195) <= 1), `${slug} ${goal} ${units}: even pace, each whole unit's time is its rounded split, within a second of the even pace`);
          assert.ok(eachEven.every((x) => sp.stretchPace(x, units) === even), `${slug} ${goal} ${units}: at even pace every unit at the even pace`);
          const strip = sp.stripPaces(goal, t, units);
          assert.ok(strip.overrun === 0 && strip.mats.length === 9 && strip.units.length === whole.length && strip.mats.every((v, i) => v === sp.stretchPace(fives[i], units)) && strip.units.every((v, i) => v === sp.stretchPace(each[i], units)), `${slug} ${goal} ${units}: the strips' paces are the tables'`);
          // A watch that reads the course 1% long (the pace band's watch=1): every pace as that watch shows it, the course
          // pace ÷ 1.01 (watchTarget, as the Goal cell and the kicker), the times unchanged.
          const watch = sp.stripPaces(goal, t, units, 0.01);
          assert.ok(watch.overrun === 0.01 && watch.mats.every((v, i) => v === fmtPaceOf(fives[i].pace / 1.01, units)) && watch.units.every((v, i) => v === fmtPaceOf(each[i].pace / 1.01, units)), `${slug} ${goal} ${units}: with a watch 1% long, each pace as the watch shows it`);
          stretchChecks += 9;
        }
        for (const units of ['mi', 'km']) {
          const unit = units === 'mi' ? MI : 1, avg = goal / (42.195 / unit);
          const us = tb.unitSplits(goal, t, units);
          assert.equal(us.length, units === 'mi' ? 26 : 42);
          assert.equal(us.reduce((s, u) => s + u.split, 0), E(goal, t, us.length * unit), `${slug} ${goal} ${units}: whole-unit splits add up to the last whole unit`);
          assert.ok(us.every((u) => u.split / avg >= 0.85 && u.split / avg <= 1.2), `${slug} ${goal} ${units}: every whole unit within 0.85–1.20 of the average`);
          const cl = tb.climbs(goal, t, units);
          assert.ok(cl.length <= 3 && cl.every((c, i) => c.split >= 1.02 * avg && (!i || c.n > cl[i - 1].n)), `${slug} ${goal} ${units}: up to three climbs, 2% over the average, in race order`);
          tb.climbsLine(goal, t, units);
        }
      }
    }
  }
  assert.ok(TEN.length === 10 && plans >= 7820 && rowSets >= 7820 * 3, `Every terrain plan checked (${TEN.length} courses, ${plans} plans, ${rowSets} row sets, ${rowsChecked} rows)`); checks += plans;
  assert.ok(stretchChecks === plans * 23, `Every terrain plan's stretches checked at miles and km, on terrain, at even pace and with a watch that reads long (${stretchChecks})`); ok();

  // The pins (re-derived from the built file; spec section 7.2 and section 10).
  const ny = terrain['new-york'], G = clock(5, 15);
  const nyMats = tb.matRows(G, ny);
  assert.deepEqual(nyMats.map((m) => F(m.terrain)), ['37:19', '1:14:24', '1:51:38', '2:28:46', '3:06:58', '3:43:31', '4:20:55', '4:58:33', '5:15:00'], 'New York 5:15 mats'); ok();
  assert.deepEqual(nyMats.map((m) => F(m.even)), ['37:20', '1:14:39', '1:51:59', '2:29:18', '3:06:38', '3:43:58', '4:21:17', '4:58:37', '5:15:00'], 'New York 5:15 even pace'); ok();
  assert.deepEqual(nyMats.map((m, i) => F(m.terrain - (i ? nyMats[i - 1].terrain : 0))), ['37:19', '37:05', '37:14', '37:08', '38:12', '36:33', '37:24', '37:38', '16:27'], 'New York 5:15 5 km splits'); ok();
  const nyHalf = tb.terrainElapsed(G, ny, 21.0975);
  assert.deepEqual([F(nyHalf), F(G - nyHalf)], ['2:37:11', '2:37:49'], 'New York 5:15 halves'); ok();
  const nyMi = tb.unitSplits(G, ny, 'mi'), nyKm = tb.unitSplits(G, ny, 'km');
  assert.deepEqual(nyMi.map((u) => F(u.split)), ['12:50', '11:01', '12:10', '12:05', '11:43', '11:59', '11:53', '12:09', '12:05', '11:45', '12:08', '11:51', '12:11', '11:48', '12:42', '11:46',
    '11:57', '11:48', '11:58', '12:08', '11:56', '12:03', '12:08', '12:25', '11:47', '12:02'], 'New York 5:15 miles'); ok();
  assert.deepEqual([F(tb.terrainElapsed(G, ny, 15 * MI)), F(G - tb.terrainElapsed(G, ny, 26 * MI))], ['3:00:20', '2:42'], 'New York 5:15: mile 15 elapsed, the last 0.2188 mi'); ok();
  assert.deepEqual([1, 3, 24, 25, 26, 38].map((n) => F(nyKm[n - 1].split)), ['8:19', '6:44', '8:01', '7:48', '6:57', '7:54'], 'New York 5:15 km'); ok();
  // The deck guards in time: the corrected Queensboro climb, the descent after it and the Verrazzano climb against mile 2.
  const guards = (t) => [E(G, t, 25) - E(G, t, 20), E(G, t, 30) - E(G, t, 25), E(G, t, MI) - (E(G, t, 2 * MI) - E(G, t, MI))];
  const passes = ([a, b, c]) => [a >= 2280, b <= 2205, c >= 90];
  assert.deepEqual(guards(ny), [2292, 2193, 109], 'New York 5:15: 20–25 km 38:12, 25–30 km 36:33, mile 1 109 s over mile 2'); ok();
  assert.deepEqual(passes(guards(ny)), [true, true, true], 'New York 5:15 passes its three deck guards'); ok();
  // The supplied, uncorrected profile (course-geometry.json, every 0.5 km of the route file) reads both decks near water level
  // and fails all three (from the 0.5 km samples 37:13, 37:20 and −65 s; from the full-resolution parquet 37:11, 37:24 and
  // −62 s, pinned in analysis/test_course_terrain.py).
  {
    const geo = insight('course-geometry.json').courses.find((c) => c.city === 'New York');
    const raw = tm.published(geo.elevation_m.map((_, i) => i * geo.elevation_step_km), geo.elevation_m);
    const rawBand = { ...ny, km: raw.km, mi: raw.mi, half: raw.half };
    assert.deepEqual(passes(guards(rawBand)), [false, false, false], `The supplied New York profile fails all three deck guards (${guards(rawBand).join(', ')})`); ok();
  }
  assert.equal(tb.climbsLine(G, ny, 'mi'), 'Climbs: mile 1 (Verrazzano) 12:50 · mile 15 (Queensboro, 59th St) 12:42 · mile 24 12:25'); ok();
  assert.equal(tb.climbsLine(G, ny, 'km'), 'Climbs: km 1 (Verrazzano) 8:19 · km 24 (Queensboro, 59th St) 8:01 · km 38 7:54'); ok();
  const B = clock(4, 0), C = clock(4, 30);
  const matsOf = (slug, goal) => tb.matRows(goal, terrain[slug]).map((m) => F(m.terrain));
  assert.deepEqual(matsOf('boston', B), ['27:40', '56:01', '1:24:34', '1:53:14', '2:21:42', '2:50:34', '3:19:27', '3:47:27', '4:00:00'], 'Boston 4:00 mats'); ok();
  assert.equal(F(tb.terrainElapsed(B, terrain.boston, 21.0975)), '1:59:26', 'Boston 4:00 halfway'); ok();
  const bo = (km) => tb.terrainElapsed(B, terrain.boston, km);
  assert.deepEqual([F(bo(35) - bo(30)), F(bo(40) - bo(35))], ['28:53', '28:00'], 'Boston 4:00: 30–35 km slower than 35–40 km'); ok();
  assert.equal(tb.climbsLine(B, terrain.boston, 'mi'), 'Climbs: mile 17 9:28 · mile 18 9:28 · mile 21 9:42'); assert.equal(F(tb.unitSplits(B, terrain.boston, 'mi')[0].split), '8:50', 'Boston 4:00 mile 1'); checks += 2;
  assert.deepEqual(matsOf('chicago', C), ['31:57', '1:03:58', '1:35:58', '2:07:55', '2:39:55', '3:11:55', '3:43:55', '4:15:54', '4:30:00'], 'Chicago 4:30 mats'); ok();
  assert.ok(tb.matRows(C, terrain.chicago).every((m) => Math.abs(m.terrain - m.even) <= 10), 'Chicago 4:30: each mat within 10 s of even pace'); ok();
  assert.equal(tb.climbsLine(C, terrain.chicago, 'mi'), 'No mile more than 2% slower than the 10:18/mi average.'); assert.equal(tb.climbsLine(C, terrain.chicago, 'km'), 'No km more than 2% slower than the 6:24/km average.'); checks += 2;
  assert.deepEqual(matsOf('austin', C), ['33:02', '1:03:52', '1:36:11', '2:08:23', '2:40:45', '3:12:36', '3:43:47', '4:15:41', '4:30:00'], 'Austin 4:30 mats'); ok();
  assert.equal(tb.climbsLine(C, terrain.austin, 'mi'), 'Climbs: mile 2 10:52 · mile 13 10:43 · mile 26 10:37', 'Austin 4:30: miles 2, 13 and 26'); ok();
  assert.deepEqual([0, 3, 5].map((i) => matsOf('madrid', B)[i]), ['29:23', '1:53:29', '2:50:11'], 'Madrid 4:00: 5K, 20K, 30K'); ok();
  assert.equal(matsOf('london', B)[3], '1:53:36', 'London 4:00 at 20K'); assert.equal(tb.climbsLine(B, terrain.london, 'km'), 'Climbs: km 20 (Tower Bridge) 5:51'); checks += 2;
  assert.equal(tb.climbsLine(B, terrain.rotterdam, 'km'), 'Climbs: km 27 (Erasmusbrug) 5:49'); ok();
  for (const slug of ['amsterdam', 'eindhoven', 'valencia']) { assert.equal(tb.climbsLine(B, terrain[slug], 'mi'), 'No mile more than 2% slower than the 9:09/mi average.', `${slug} 4:00`); ok(); }
  // The features behind those names (official axis, from the file).
  assert.deepEqual(ny.features.map((f) => [f.id, f.short, f.name]), [['nyc-verrazzano', 'Verrazzano', 'Verrazzano-Narrows Bridge'], ['nyc-pulaski', 'Pulaski', 'Pulaski Bridge'],
    ['nyc-queensboro', 'Queensboro, 59th St', 'Queensboro (59th St) Bridge'], ['nyc-willis', 'Willis Ave', 'Willis Avenue Bridge'], ['nyc-madison', 'Madison Ave', 'Madison Avenue Bridge']], 'New York\'s five bridges'); ok();
  assert.equal(tb.featureFor(ny.features, 14 * MI, 15 * MI)?.name, 'Queensboro (59th St) Bridge', 'Mile 15 crosses the Queensboro'); ok();
  assert.equal(tb.featureFor(ny.features, 23 * MI, 24 * MI), null, 'Mile 24 crosses no named structure'); ok();
  // featureFor's rule: a quarter of the unit, or 40% of the structure; the first in race order.
  const ff = (features, a, b) => tb.featureFor(features, a, b)?.id ?? null;
  const f = (id, from_km, to_km) => ({ id, name: id, short: id, from_km, to_km });
  assert.deepEqual([ff([f('short', 1.0, 1.2)], 0, MI), ff([f('long', 1.5, 3.5)], 0, MI), ff([f('quarter', 0.75, 3)], 0, 1), ff([f('b', 0.5, 0.9), f('a', 0.1, 0.5)], 0, 1), ff([f('touch', 1, 2)], 0, 1)],
    ['short', null, 'quarter', 'a', null], 'featureFor: 40% of a short structure, 25% of the unit, race order, no touching ends'); ok();

  // Courses and reasons: every other course is at even pace for its reason in the file (which /methodology lists), and
  // the one line both pages print says so in the same words for either reason, naming none (October 29, 2026: a page
  // carries no coverage or method-caveat text).
  assert.deepEqual(['berlin', 'sydney', 'warsaw', 'oslo', 'prague'].map((s) => why[s]), ['profile', 'profile', 'held', 'held', 'profile']); ok();
  assert.deepEqual(['Berlin', 'Sydney', 'Warsaw', 'Oslo', 'Prague'].map((city) => tb.noTerrainLine(city)), [
    'Even pace: no terrain splits for Berlin.', 'Even pace: no terrain splits for Sydney.', 'Even pace: no terrain splits for Warsaw.',
    'Even pace: no terrain splits for Oslo.', 'Even pace: no terrain splits for Prague.']); ok();
  assert.equal(tb.noTerrainLine.length, 1, 'The line takes the city alone: one wording for either reason'); ok();
  assert.doesNotMatch(tb.noTerrainLine('Xity'), /check|profile|survey|finish|route|elevation|data|source/i, 'The line names no reason, source or method'); ok();
  const paceIndex = insight(band.PACE_BAND_INDEX);
  const scopes = paceIndex.scopes.filter((s) => s.slug !== 'all');
  assert.ok(TEN.every((slug) => scopes.some((s) => s.slug === slug)), 'Every terrain course is a pace-band course'); ok();
  assert.deepEqual(scopes.filter((s) => !terrain[s.slug] && !why[s.slug]).map((s) => s.slug), [], 'Every other pace-band course has its reason'); ok();
  assert.ok(Object.keys(why).every((slug) => !terrain[slug]) && why.all === undefined && terrain.all === undefined, 'All courses has neither'); ok();
  // The control: Terrain | Even pace where the course has terrain splits, one line where it has none, nothing on All
  // courses or for a course the data does not know (no line to say).
  const BandChoice = require('../components/tools/BandChoice.tsx');
  const control = (p) => renderToStaticMarkup(React.createElement(BandChoice.default, { id: 'x', onChange: () => {}, ...p }));
  assert.equal(control({ state: 'off', mode: 'even' }), '', 'All courses: no control and no line'); ok();
  assert.equal(control({ state: 'none', mode: 'even', line: '' }), '', 'A course nobody knows: no line'); ok();
  assert.equal(control({ state: 'none', mode: 'even', line: tb.noTerrainLine('Berlin') }), '<p class="tool-field-hint band-choice-none" id="x">Even pace: no terrain splits for Berlin.</p>'); ok();
  const choiceHtml = control({ state: 'choice', mode: 'terrain' });
  assert.match(choiceHtml, /class="tool-field band-choice"/); assert.match(choiceHtml, />Splits</);
  assert.deepEqual([...choiceHtml.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(?:<span[^>]*>)?([^<]+)(?:<\/span>)?<\/button>/g)].map((m) => `${m[2]}:${m[1]}`), ['Terrain:true', 'Even pace:false'], 'Terrain pressed by default'); checks += 3;

  // The rules.
  assert.deepEqual(['', 'course', 'even', 'x', 'EVEN'].map((c) => tb.bandMode(ny, c)), ['terrain', 'terrain', 'even', 'terrain', 'terrain']); ok();
  assert.deepEqual(['', 'even'].map((c) => tb.bandMode(null, c)), ['even', 'even'], 'No terrain: even pace, and no choice to make'); ok();
  assert.deepEqual([tb.bandChoice('terrain'), tb.bandChoice('even'), tb.BAND_PARAM, tb.BAND_LABEL], ['', 'even', 'pace', 'Splits']); ok();
  assert.deepEqual(tb.BAND_OPTIONS, [{ value: 'terrain', label: 'Terrain' }, { value: 'even', label: 'Even pace' }]); ok();
  assert.deepEqual([['even', false], ['even', true], ['EVEN', false], ['course', false], ['foo', false], ['', false]].map(([p, a]) => tb.tidyChoice(p, a)), ['even', '', '', '', '', ''],
    'pace=course, pace=foo and EVEN leave the address; even leaves only on All courses'); ok();
  assert.deepEqual([tb.bandView({ terrain: ny, choice: '' }), tb.bandView({ terrain: ny, choice: 'even' }), tb.bandView({ terrain: null, choice: '' }), tb.bandView({ terrain: null, choice: 'even' })],
    [{ mode: 'terrain', banded: ny, offered: true }, { mode: 'even', banded: null, offered: true }, { mode: 'even', banded: null, offered: false }, { mode: 'even', banded: null, offered: false }],
    'bandView: terrain unless even pace is chosen; the choice wherever there is terrain; nothing waits'); ok();
  assert.deepEqual(tb.cardMats(G, ny).map(([k, t]) => `${k} ${F(t)}`), ['5K 37:19', 'Half 2:37:11', '30K 3:43:31', 'Finish 5:15:00'], 'The card\'s four terrain times'); ok();
  assert.deepEqual(tb.cardMats(14400, null), [['5K', (14400 / 42.195) * 5], ['Half', 7200], ['30K', (14400 / 42.195) * 30], ['Finish', 14400]], 'The card at even pace, as before'); ok();
  assert.deepEqual(tb.matRows(14430, ny).map((m) => [m.km, m.terrain, m.even]), POINTS.map((km, i) => [km, i === 8 ? 14430 : E(14430, ny, km), i === 8 ? 14430 : (14430 / 42.195) * km])); ok();
  assert.ok(tb.matRows(14400, null).every((m) => m.terrain === null)); ok();
  assert.deepEqual([12600, 12630, 12659, 12660].map(tb.bandMinute), [210, 210, 210, 211]); ok();
  assert.deepEqual([42.195, 42.19, 21.0975, 5, 3 * MI].map((km) => tb.terrainAt(ny, km)), [1, 1, ny.half, ny.km[4], ny.mi[2]], 'terrainAt: the finish, halfway, a km and a mile'); ok();
  for (const km of [0, 0.5, 2.5, 10.5, 30.3]) { assert.throws(() => tb.terrainAt(ny, km), /no marker/, `terrainAt has no share at ${km} km`); ok(); }

  // The wording (spec section 4.4), exactly.
  assert.equal(tb.terrainCardLine(G, 'New York'), 'Terrain splits: 5:15 spread over New York’s climbs and descents at an even effort. Not a prediction.'); ok();
  assert.equal(tb.TERRAIN_DISCLAIMER, 'Not a prediction.'); ok();
  const kick = (o) => tb.bandKicker({ goal: G, place: 'New York', terrain: ny, units: 'mi', ...o });
  assert.deepEqual([kick({}), kick({ overrun: 0.01 }), kick({ example: true }), kick({ pace: false }), kick({ units: 'km' }), kick({ genderWord: 'women' })], [
    '5:15 · New York · terrain splits, avg 12:01/mi', '5:15 · New York · terrain splits, avg 12:01/mi · watch avg 11:54/mi', 'Example · 5:15 · New York · terrain splits, avg 12:01/mi',
    '5:15 · New York · terrain splits', '5:15 · New York · terrain splits, avg 7:28/km', '5:15 · New York · terrain splits, avg 12:01/mi'], 'The terrain kicker: no gender, the watch as an average'); ok();
  assert.deepEqual([tb.bandKicker({ goal: 14400, place: 'Boston', terrain: null, units: 'mi' }), tb.bandKicker({ goal: 14400, place: 'Boston', terrain: null, units: 'mi', overrun: 0.005, example: true })],
    ['4:00 · Boston · 9:09/mi even', 'Example · 4:00 · Boston · 9:09/mi even · watch 9:06/mi'], 'The even-pace kicker, unchanged'); ok();
  assert.deepEqual([tb.terrainCaption('New York'), tb.splitCaption(true, G, 'mi', 1, 3), tb.splitCaption(false, G, 'mi', 1, 3), tb.splitCaption(false, 14430, 'km', 2, 4)],
    ['Terrain splits · New York route · Published research', 'Terrain splits (Published research) 5:15 · each mile · strip 1 of 3', 'Even pace 5:15 · each mile · strip 1 of 3', 'Even pace 4:00:30 · each km · strip 2 of 4']); ok();
  assert.deepEqual([tb.goalCell(G / 42.195, 0, 'mi', true), tb.goalCell(G / 42.195, 0.01, 'mi', true), tb.goalCell(14400 / 42.195, 0, 'mi', false), tb.goalCell(14400 / 42.195, 0.01, 'mi', false),
    tb.goalCell(14430 / 42.195, 0, 'mi', false)],
  [[['avg 12:01/mi', '7:28/km']], [['avg 12:01/mi', '7:28/km'], ['watch 11:54/mi']], [['9:09/mi', '5:41/km']], [['9:09/mi', '5:41/km', 'watch 9:04/mi']], [['9:10/mi', '5:42/km']]], 'The Goal cell'); ok();
  assert.deepEqual([tb.goalPace(G / 42.195, 'mi', true), tb.goalPace(14400 / 42.195, 'km', true), tb.goalPace(14400 / 42.195, 'mi', false)], ['avg 12:01/mi', 'avg 5:41/km', '9:09/mi']); ok();
  assert.deepEqual([tb.watchLine(G / 42.195, 0.01, 'mi', true), tb.watchLine(14400 / 42.195, 0.01, 'mi', false)], ['watch avg 11:54/mi', 'watch 9:04/mi']); ok();
  assert.deepEqual(tb.asRunLine(0.4838), ['As run, slowdowns included: ', '48%', ' had a ', 'sustained slowdown', '. Not splits to copy.']); assert.equal(tb.AS_RUN_TERM, 'sustained slowdown');
  assert.deepEqual([tb.asRunLine(null), tb.asRunLine(undefined), tb.asRunLine(NaN)].map((p) => p.join('')), Array(3).fill('As run, slowdowns included. Not splits to copy.')); checks += 3;

  // The folds and tables as rendered: the planner's mat table, the pace band's marker table and the shared As run table.
  const tds = (html) => [...html.matchAll(/<tr(?: class="[^"]*")?><th scope="row">(?:[^<]|<small>[^<]*<\/small>)*<\/th>((?:<td(?: class="[^"]*")?>[^<]*<\/td>)+)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td(?: class="[^"]*")?>([^<]*)<\/td>/g)].map((c) => c[1]));
  const heads = (html) => [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((m) => m[1]);
  const { MatTable } = require('../components/tools/RacePlan.tsx');
  const { Wristband } = require('../components/tools/PaceBand.tsx');
  const AsRunTable = require('../components/tools/AsRunTable.tsx');
  const matTerrain = renderToStaticMarkup(React.createElement(MatTable, { goal: G, units: 'mi', terrain: ny }));
  assert.deepEqual(heads(matTerrain), ['Mat', 'Terrain', 'Even pace']); assert.deepEqual(tds(matTerrain)[0], ['37:19', '37:20']); checks += 2;
  assert.deepEqual(tds(matTerrain), nyMats.map((m) => [F(m.terrain), F(m.even)]), 'Planner fold: each mat\'s terrain split beside its even pace'); ok();
  assert.doesNotMatch(matTerrain, /Finishes|<tfoot/, 'No Finishes row in the plan\'s mat table'); ok();
  assert.match(matTerrain, /<caption class="sr-only">Terrain-split elapsed time for your goal at each official mat \(published research\), beside the even-pace time<\/caption>/); ok();
  const matEven = renderToStaticMarkup(React.createElement(MatTable, { goal: 14400, units: 'mi', terrain: null }));
  assert.deepEqual(heads(matEven), ['Mat', 'Your plan']); assert.match(matEven, /<caption class="sr-only">Even-pace elapsed time for your goal at each official mat<\/caption>/); checks += 2;
  assert.deepEqual(tds(matEven).map((c) => c[0]), POINTS.map((km, i) => F(i === 8 ? 14400 : (14400 / 42.195) * km)), 'Planner fold at even pace: the plan alone'); ok();
  const nyRows = tb.bandRows(G, 'mi', ny), nyEven = pace.splitTable(G, 42.195, 'mi');
  const wrist = renderToStaticMarkup(React.createElement(Wristband, { rows: nyRows, goal: G, pKm: G / 42.195, units: 'mi', overrun: 0.01, even: nyEven, features: ny.features }));
  assert.deepEqual(heads(wrist), ['Marker', 'Terrain', 'Even pace', 'On the route']); ok();
  const wristCells = tds(wrist);
  assert.deepEqual(wristCells.map((c) => c.slice(0, 2)), nyRows.map((r, i) => [F(r.elapsed), F(nyEven[i].elapsed)]), 'Pace band fold: each marker\'s terrain split beside even pace'); ok();
  const routeOf = (label) => { const i = nyRows.findIndex((r) => !r.mat && !r.halfway && !r.finish && whole(r.km / MI) && Math.round(r.km / MI) === label); return wristCells[i][2]; };
  assert.deepEqual([routeOf(1), routeOf(15), routeOf(24)], ['Verrazzano-Narrows Bridge', 'Queensboro (59th St) Bridge', ''], 'On the route: Mile 1, Mile 15 and Mile 24'); ok();
  assert.ok(nyRows.every((r, i) => (r.mat || r.halfway || r.finish ? wristCells[i][2] === '' : true)), 'Only whole miles name a structure'); ok();
  assert.doesNotMatch(wrist, /<tfoot|Finishes/, 'No Finishes foot on the band'); ok();
  assert.match(wrist, /<caption class="sr-only">Terrain-split elapsed times for 5:15 \(published research\), beside exact even-pace times; a watch reading 1\.0% long shows an average of 11:54\/mi<\/caption>/); ok();
  const rowClass = [...wrist.matchAll(/<tr(?: class="([^"]*)")?><th scope="row">([^<]*)/g)].map((m) => [m[2], m[1] ?? '']);
  assert.ok(rowClass.filter(([, c]) => c === 'is-mat' || c === 'is-finish').map(([k]) => k).join(',') === '5K,10K,15K,20K,25K,30K,35K,40K,Finish' && rowClass.some(([k, c]) => /^Half/.test(k) && c === 'is-half')
    && rowClass.filter(([k]) => /^Mile/.test(k)).every(([, c]) => c === ''), 'Bold timing points; the mile and half rows are points on the plan'); ok();
  const bostonWrist = renderToStaticMarkup(React.createElement(Wristband, { rows: tb.bandRows(B, 'mi', terrain.boston), goal: B, pKm: B / 42.195, units: 'mi', overrun: 0, even: pace.splitTable(B, 42.195, 'mi'), features: terrain.boston.features }));
  assert.deepEqual(heads(bostonWrist), ['Marker', 'Terrain', 'Even pace'], 'No On the route column on a course without named structures'); ok();
  const wristEven = renderToStaticMarkup(React.createElement(Wristband, { rows: pace.splitTable(B, 42.195, 'mi'), goal: B, pKm: B / 42.195, units: 'mi', overrun: 0 }));
  assert.deepEqual(heads(wristEven), ['Marker', 'Elapsed']); assert.deepEqual(tds(wristEven), pace.splitTable(B, 42.195, 'mi').map((r) => [F(r.elapsed)]), 'Pace band fold at even pace: one column'); checks += 2;
  // The As run table: the shard's medians as they ran, never scaled to the goal (New York 5:15: finishes 5:10:00 to 5:14:59).
  const nyShard = insight(band.paceBandShardPath('new-york', 'all'));
  const [nyAll, nyHeld, nySlow] = ['all', 'held', 'slowdown'].map((k) => band.cellOf(nyShard.groups[k], tb.bandMinute(G)));
  assert.deepEqual([F(nyAll.e50[0]), F(nyAll.e50[8]), nyAll.n, Math.round(nyAll.sd * 100)], ['32:52', '5:12:28', 15623, 48], 'New York 5:15 as run: 5K 32:52, finish 5:12:28, 15,623 finishes, 48% sustained slowdown'); ok();
  assert.equal(tb.asRunLine(nyAll.sd).join(''), 'As run, slowdowns included: 48% had a sustained slowdown. Not splits to copy.'); ok();
  for (const short of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(AsRunTable.default, { cells: { all: nyAll, held: nyHeld, slow: nySlow }, units: 'mi', short }));
    assert.deepEqual(heads(html), short ? ['Mat', 'All', 'Held', 'Slowed'] : ['Mat', 'All', 'No sustained slowdown', 'Sustained slowdown']);
    const cells = tds(html);
    assert.deepEqual(cells.slice(0, 9), POINTS.map((_, i) => [nyAll, nyHeld, nySlow].map((c) => F(c.e50[i]))), 'As run: the shard\'s e50, unscaled');
    assert.deepEqual(cells[9], [nyAll, nyHeld, nySlow].map((c) => c.n.toLocaleString('en-US')), 'As run: the Finishes row'); assert.equal(cells[9][0], '15,623');
    checks += 3;
  }
  const asRunNote = renderToStaticMarkup(React.createElement(AsRunTable.AsRunNote, { sd: nyAll.sd }));
  assert.match(asRunNote, /^As run, slowdowns included: 48% had a <a [^>]*href="\/methodology#sustained-slowdown"[^>]*>sustained slowdown<\/a>\. Not splits to copy\.$/, 'The forewarning links the term to its definition'); ok();
  // The finishes' lines (MatLines, under the forewarning): the zero line's name "Even" ends short of the finish dots,
  // which sit near the zero line whenever the medians land near the goal, and is drawn after the lines (on its halo).
  const MatLines = require('../components/tools/MatLines.tsx').default;
  const gapsOf = (cell) => POINTS.map((km, i) => cell.e50[i] - (i === 8 ? G : (G / 42.195) * km));
  const matLines = renderToStaticMarkup(React.createElement(MatLines, { units: 'mi', label: 'x', lines: [
    { key: 'held', label: 'No sustained slowdown', tone: 'quiet', gaps: gapsOf(nyHeld) }, { key: 'slow', label: 'Sustained slowdown', tone: 'ink', gaps: gapsOf(nySlow) }] }));
  const zeroLabel = matLines.match(/<text class="mat-lines-zero-label" x="([\d.]+)" y="[\d.]+" text-anchor="end">Even<\/text>/);
  const dotsX = [...matLines.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="4"><\/circle>/g)].map((m) => +m[1]);
  assert.ok(zeroLabel && dotsX.length === 2 && dotsX.every((cx) => +zeroLabel[1] <= cx - 4 - 2 - 2), `"Even" ends clear of the finish dots: ${zeroLabel?.[1]} against ${dotsX}`); ok();
  assert.ok(matLines.indexOf('class="mat-lines-zero-label"') > matLines.lastIndexOf('class="mat-lines-line'), '"Even" is drawn after the lines'); ok();

  // The strips: no "H" line in either mode; on terrain the big numbers are the terrain splits and every strip names the
  // Published research source; at even pace each mat holds its time alone and the caption names no source.
  const PaceBandStrip = require('../components/tools/PaceBandStrip.tsx').default;
  const stripOf = (o) => renderToStaticMarkup(React.createElement(PaceBandStrip, { goal: G, pKm: G / 42.195, units: 'mi', interval: 'mi', overrun: 0, place: 'New York', genderWord: '', profile: null, showBack: false, waiting: false, ...o }));
  const terrainHtml = stripOf({ rows: nyRows, mats: nyMats.map((m) => m.terrain), terrain: true, genderWord: 'women' });
  const evenHtml = stripOf({ rows: nyEven, mats: null, terrain: false });
  for (const [mode, html] of [['terrain', terrainHtml], ['even pace', evenHtml]]) {
    assert.doesNotMatch(html, /class="h">H |held-pace/, `${mode}: no "H" line`);
    assert.equal((html.match(/class="h"/g) || []).length, 1, `${mode}: only the Goal cell keeps its small line`);
    assert.equal((html.match(/Pace Notes data/g) || []).length, 0, `${mode}: no Pace Notes data on the strips`);
    checks += 3;
  }
  assert.equal((terrainHtml.match(/Published research/g) || []).length, 4, 'Terrain: the mat strip and each of the three mile strips name Published research'); ok();
  assert.equal((evenHtml.match(/Published research/g) || []).length, 0, 'Even pace: no source on the strips'); ok();
  const stripMats = (html) => [...html.matchAll(/<span class="k">(?:\d+K|Finish) <small>[^<]*<\/small><\/span><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(stripMats(terrainHtml), nyMats.map((m) => F(m.terrain)), 'Terrain: the mat strip is the terrain splits'); ok();
  assert.deepEqual(stripMats(evenHtml), nyMats.map((m) => F(m.even)), 'Even pace: the mat strip is even pace'); ok();
  const splitTimes = (html) => [...html.matchAll(/<span class="k">(Mi \d+|Km \d+|Half)<\/span><b>([^<]+)<\/b>/g)].map((m) => `${m[1]} ${m[2]}`);
  const expectSplits = (rows) => rows.filter((r) => !r.finish && (r.halfway || whole(r.km / MI))).map((r) => `${r.halfway ? 'Half' : `Mi ${Math.round(r.km / MI)}`} ${F(r.elapsed)}`);
  assert.deepEqual(splitTimes(terrainHtml), expectSplits(nyRows), 'Terrain: the mile strips are the terrain rows'); assert.equal(splitTimes(terrainHtml).length, 27, '27 split cells (26 miles and halfway)'); checks += 2;
  assert.deepEqual(splitTimes(evenHtml), expectSplits(nyEven), 'Even pace: the mile strips are even pace'); ok();
  assert.ok(terrainHtml.includes('<span class="k">Mi 1</span><b>12:50</b>') && terrainHtml.includes('<span class="k">Mi 15</span><b>3:00:20</b>'), 'New York 5:15: mile 1 12:50, mile 15 3:00:20'); ok();
  assert.ok(terrainHtml.includes('Pace Notes · pace band · 5:15 goal · New York · terrain splits · cut along the dashed lines'), 'The sheet head, with no gender word on terrain'); ok();
  assert.ok(stripOf({ rows: nyEven, mats: null, terrain: false, genderWord: 'women' }).includes('5:15 goal · New York · women · cut along'), 'Even pace keeps its head as before'); ok();
  assert.match(terrainHtml, /<p class="pace-band-strip-caption">Terrain splits · New York route · Published research<\/p>/); assert.match(evenHtml, /<p class="pace-band-strip-caption">Even-pace times\.<\/p>/); checks += 2;
  assert.match(terrainHtml, /Terrain splits \(Published research\) 5:15 · each mile · strip 1 of 3/); assert.match(evenHtml, /Even pace 5:15 · each mile · strip 1 of 3/); checks += 2;
  assert.match(terrainHtml, /<span class="k">Goal<\/span><b>5:15<\/b><span class="h"><span class="nowrap">avg 12:01\/mi<\/span> · <span class="nowrap">7:28\/km<\/span><\/span>/); ok();
  assert.match(evenHtml, /<span class="k">Goal<\/span><b>5:15<\/b><span class="h">12:01\/mi · 7:28\/km<\/span>/); ok();
  assert.match(stripOf({ rows: nyRows, mats: nyMats.map((m) => m.terrain), terrain: true, overrun: 0.01 }), /<span class="nowrap">7:28\/km<\/span><br\/><span class="nowrap">watch 11:54\/mi<\/span><\/span>/, 'Terrain: the watch on its own line'); ok();
  // The back: the corrected profile the splits were spread over, with the structures named over the road, and a caption with
  // no method or source wording (methods live on /methodology).
  const strip = strips['new-york'];
  const profile = { slug: 'new-york', city: 'New York', race: ny.race, km: 42.195, step: strip.step_km, m: strip.m, min: strip.min, max: strip.max, gain: strip.gain, loss: strip.loss, features: ny.features };
  const back = stripOf({ rows: nyRows, mats: nyMats.map((m) => m.terrain), terrain: true, profile, showBack: true });
  const labels = [...back.matchAll(/<text class="pace-band-back-label"[^>]*font-size="8\.5"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Verrazzano', 'Pulaski', 'Queensboro, 59th St', 'Willis Ave', 'Madison Ave'], 'The back names New York\'s structures at the km ticks\' size'); ok();
  assert.equal((back.match(/<polyline points="([^"]+)"/)?.[1].split(' ') ?? []).length, 85, 'The back draws the 85 corrected samples'); ok();
  const backCaption = back.match(/<p class="pace-band-strip-caption">(Back · [^<]+)<\/p>/)?.[1] ?? '';
  assert.match(backCaption, /^Back · New York City Marathon route elevation, −?[\d,]+ ft to [\d,]+ ft · strip height = 656 ft on every course$/, `The back's caption: ${backCaption}`); ok();
  assert.doesNotMatch(backCaption, /corrected|bridge|tunnel|source|model/i, 'No method or source wording on the back'); ok();
  // Each course's back: the caption's range in whole feet or metres with the minus sign the site prints; every 5 km tick
  // broken where it would run through a structure's name (the names New York prints at 25K and 35K and London's at 20K),
  // and each name on a paper halo.
  const wholeElevation = (metres, units) => { const v = Math.round(units === 'mi' ? metres / 0.3048 : metres); return `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')} ${units === 'mi' ? 'ft' : 'm'}`; };
  const brokenTicks = {};
  for (const slug of TEN) for (const units of ['mi', 'km']) {
    const c = terrain[slug], st = strips[slug];
    const html = stripOf({ rows: tb.bandRows(G, units, c), mats: tb.matRows(G, c).map((m) => m.terrain), terrain: true, units, interval: units, place: c.city, showBack: true,
      profile: { slug, city: c.city, race: c.race, km: 42.195, step: st.step_km, m: st.m, min: st.min, max: st.max, gain: st.gain, loss: st.loss, features: c.features } });
    const svg = html.slice(html.indexOf('<div class="pace-band-strip is-back">'));
    const caption = svg.match(/<p class="pace-band-strip-caption">(Back · [^<]+)<\/p>/)?.[1] ?? '';
    assert.equal(caption, `Back · ${c.race} route elevation, ${wholeElevation(st.min, units)} to ${wholeElevation(st.max, units)} · strip height = ${units === 'mi' ? '656 ft' : '200 m'} on every course`, `${c.city} back caption (${units})`); ok();
    assert.match(svg, new RegExp(`aria-label="Route elevation for ${c.city}, from ${wholeElevation(st.min, units)} to ${wholeElevation(st.max, units)}, `), `${c.city}: the back's label in the same words`); ok();
    const names = [...svg.matchAll(/<text class="pace-band-back-label" x="([-\d.]+)" y="([-\d.]+)" text-anchor="(start|middle|end)" font-size="8\.5" font-family="var\(--sans\)" paint-order="stroke" stroke="var\(--strip-paper\)" stroke-width="2\.5" stroke-linejoin="round">([^<]+)<\/text>/g)]
      .map(([, x, y, anchor, text]) => { const w = text.length * 8.5 * 0.56, left = anchor === 'start' ? +x : anchor === 'end' ? +x - w : +x - w / 2; return { text, x0: left - 1, x1: left + w + 1, y0: +y - 8.5, y1: +y + 2 }; });
    assert.equal(names.length, (svg.match(/class="pace-band-back-label"/g) || []).length, `${c.city}: every name on the back has its halo`); ok();
    const ticks = [...svg.matchAll(/<line x1="([\d.]+)" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)" stroke="var\(--strip-ink\)" stroke-width="0\.6" stroke-dasharray="2 3"/g)].map(([, x, y1, y2]) => ({ x: +x, y1: +y1, y2: +y2 }));
    const crossing = ticks.filter((t) => names.some((n) => n.x0 <= t.x && t.x <= n.x1 && t.y1 < n.y1 && n.y0 < t.y2));
    assert.deepEqual(crossing, [], `${c.city} (${units}): no 5 km tick runs through a name on the back`); ok();
    if (units === 'mi') brokenTicks[slug] = names.filter((n) => ticks.some((t) => n.x0 <= t.x && t.x <= n.x1)).map((n) => n.text);
  }
  assert.ok(['Queensboro, 59th St', 'Madison Ave'].every((n) => brokenTicks['new-york'].includes(n)) && brokenTicks.london.includes('Tower Bridge'),
    `The ticks are broken around New York's Queensboro (25K) and Madison Ave (35K) and London's Tower Bridge (20K): ${JSON.stringify(brokenTicks)}`); ok();

  // Each stretch's pace (owner request, October 29, 2026: "Can you also add options for paces per mile for each 5k and mile
  // time"; lib/tools/stretch-paces.ts). The pins, re-derived from the built file (New York 5:15 terrain; any change needs a
  // written reason), and even pace 4:00 derived exactly: the strip's mat times are 14,400 × km ÷ 42.195 rounded to the
  // second (5K 1,706.36 → 28:26, 10K 3,412.73 → 56:53, …, 40K 13,650.91 → 3:47:31), so the sections are 28:26 or 28:27
  // and 40K–Finish 14,400 − 13,651 = 749 s (12:29), adding up to 4:00:00; every pace is the even pace, 341.27 s/km
  // (9:09/mi); a mile is 549.23 s, so the rounded miles are 9:09 or 9:10 (miles 3, 7, 12, 16, 20 and 25) and the last
  // 0.2 mi 2:00 (review, October 29, 2026: the exact times had shown rows that did not add up to the goal).
  const row = (x, units, overrun = 0) => `${x.label} ${F(x.time)} ${sp.stretchPace(x, units, overrun)}`;
  const nyFives = sp.fiveKStretches(G, ny), nyEach = sp.unitStretches(G, ny, 'mi'), nyEachKm = sp.unitStretches(G, ny, 'km');
  assert.deepEqual(nyFives.map((x) => row(x, 'mi')), ['0–5K 37:19 12:01/mi', '5–10K 37:05 11:56/mi', '10–15K 37:14 11:59/mi', '15–20K 37:08 11:57/mi', '20–25K 38:12 12:18/mi',
    '25–30K 36:33 11:46/mi', '30–35K 37:24 12:02/mi', '35–40K 37:38 12:07/mi', '40K–Finish 16:27 12:04/mi'], 'New York 5:15 terrain: each 5K\'s time and pace per mile'); ok();
  assert.deepEqual(nyFives.map((x) => sp.stretchPace(x, 'km')), ['7:28/km', '7:25/km', '7:27/km', '7:26/km', '7:38/km', '7:19/km', '7:29/km', '7:32/km', '7:30/km'], 'New York 5:15 terrain: each 5K\'s pace per km'); ok();
  assert.deepEqual([0, 14, 23, 26].map((i) => row(nyEach[i], 'mi')), ['Mile 1 12:50 12:50/mi', 'Mile 15 12:42 12:42/mi', 'Mile 24 12:25 12:25/mi', 'Last 0.2 mi 2:42 12:21/mi'], 'New York 5:15 terrain: miles 1, 15 and 24, and the last 0.2 mi'); ok();
  assert.deepEqual([0, 2, 23, 41, 42].map((i) => row(nyEachKm[i], 'km')), ['Km 1 8:19 8:19/km', 'Km 3 6:44 6:44/km', 'Km 24 8:01 8:01/km', 'Km 42 7:36 7:36/km', 'Last 0.2 km 1:31 7:47/km'], 'New York 5:15 terrain: km 1, 3, 24 and 42, and the last 0.2 km'); ok();
  assert.deepEqual(nyEach.map((x) => x.label), [...Array.from({ length: 26 }, (_, i) => `Mile ${i + 1}`), 'Last 0.2 mi']); assert.deepEqual(nyEachKm.map((x) => x.label), [...Array.from({ length: 42 }, (_, i) => `Km ${i + 1}`), 'Last 0.2 km']); checks += 2;
  const evenFives = sp.fiveKStretches(B, null), evenEach = sp.unitStretches(B, null, 'mi');
  assert.deepEqual(evenFives.map((x) => row(x, 'mi')), ['0–5K 28:26 9:09/mi', '5–10K 28:27 9:09/mi', '10–15K 28:26 9:09/mi', '15–20K 28:26 9:09/mi', '20–25K 28:27 9:09/mi',
    '25–30K 28:26 9:09/mi', '30–35K 28:27 9:09/mi', '35–40K 28:26 9:09/mi', '40K–Finish 12:29 9:09/mi'], 'Even pace 4:00: each 5K 28:26 or 28:27 at 9:09/mi, 40K–Finish 12:29'); ok();
  assert.deepEqual([evenFives[0].time, evenFives[1].time, evenFives[8].time, evenFives.reduce((a, x) => a + x.time, 0)], [Math.round(14400 * 5 / 42.195), Math.round(14400 * 10 / 42.195) - Math.round(14400 * 5 / 42.195), 14400 - Math.round(14400 * 40 / 42.195), 14400], 'Even pace 4:00: the sections from the strip\'s rounded mat times, adding up to the goal'); ok();
  near(evenFives[0].pace, 14400 / 42.195, 1e-9, 'Even pace 4:00: the pace is the exact even pace'); ok();
  const tenSecondMiles = evenEach.slice(0, 26).filter((x) => F(x.time) === '9:10').map((x) => x.label);
  assert.ok(evenEach.slice(0, 26).every((x) => /^Mile \d+ 9:(?:09|10) 9:09\/mi$/.test(row(x, 'mi'))) && row(evenEach[26], 'mi') === 'Last 0.2 mi 2:00 9:09/mi', 'Even pace 4:00: every mile 9:09 or 9:10 at 9:09/mi, the last 0.2 mi 2:00'); ok();
  assert.deepEqual(tenSecondMiles, ['Mile 3', 'Mile 7', 'Mile 12', 'Mile 16', 'Mile 20', 'Mile 25'], 'Even pace 4:00: the miles the rounded strip times make 9:10'); ok();
  // A watch that reads the course 1% long (the pace band's watch=1): New York 5:15's paces as the watch shows them, the
  // course pace ÷ 1.01 (0–5K 721.6 s/mi → 714.5, 11:54/mi, the kicker's "watch avg 11:54/mi"); the times stay the course's.
  assert.deepEqual(nyFives.map((x) => row(x, 'mi', 0.01)), ['0–5K 37:19 11:54/mi', '5–10K 37:05 11:49/mi', '10–15K 37:14 11:52/mi', '15–20K 37:08 11:50/mi', '20–25K 38:12 12:10/mi',
    '25–30K 36:33 11:39/mi', '30–35K 37:24 11:55/mi', '35–40K 37:38 12:00/mi', '40K–Finish 16:27 11:56/mi'], 'New York 5:15, a watch 1% long: each 5K\'s watch pace'); ok();
  assert.deepEqual([0, 14, 23, 26].map((i) => row(nyEach[i], 'mi', 0.01)), ['Mile 1 12:50 12:42/mi', 'Mile 15 12:42 12:34/mi', 'Mile 24 12:25 12:18/mi', 'Last 0.2 mi 2:42 12:13/mi'], 'New York 5:15, a watch 1% long: miles 1, 15 and 24, and the last 0.2 mi'); ok();
  // The option and its words.
  assert.deepEqual([sp.PACES_PARAM, sp.PACES_LABEL, sp.pacesUnit('mi'), sp.pacesUnit('km')], ['paces', 'Add each stretch’s pace', ' (per mile)', ' (per km)']); ok();
  assert.deepEqual(['1', '0', '', 'yes', 'true', 'on', ' 1', '01', 'TRUE'].map(sp.tidyPaces), ['1', '', '', '', '', '', '', '', ''], 'paces=1 stays; any other value leaves the address'); ok();
  assert.deepEqual([sp.stretchesTitle('mi'), sp.stretchesTitle('km'), sp.stretchesName('mi'), sp.stretchesName('km'), sp.stretchCount('mi'), sp.stretchCount('km'), sp.matPacesNote(), sp.splitPacesNote('mi'), sp.splitPacesNote('km')],
    ['Every 5K and every mile: time and pace', 'Every 5K and every km: time and pace', 'each 5K and mile', 'each 5K and km', 36, 52, ' · each 5K’s pace under its time (Finish: last 2.2 km)', ' · pace per mile under each time', ' · pace per km under each time']); ok();
  // With a watch that reads long, every place the paces appear says they are the watch's.
  assert.deepEqual([sp.matPacesNote(0.01), sp.splitPacesNote('mi', 0.005), sp.splitPacesNote('km', 0.015), sp.paceHead(), sp.paceHead(0.01)],
    [' · each 5K’s watch pace under its time (Finish: last 2.2 km)', ' · watch pace per mile under each time', ' · watch pace per km under each time', 'Pace', 'Watch pace']); ok();
  // The line under the box while it is on (the strips' captions print only on paper): which stretch each pace is, the
  // finish's 2.2 km included, and the watch.
  assert.deepEqual([sp.pacesNote('mi', true), sp.pacesNote('km', true), sp.pacesNote('mi', false), sp.pacesNote('mi', true, 0.01), sp.pacesNote('km', false, 0.005)], [
    'Under each 5K mat: the pace of the 5K before it (Finish: the last 2.2 km). Under each mile: that mile’s pace.',
    'Under each 5K mat: the pace of the 5K before it (Finish: the last 2.2 km). Under each km: that km’s pace.',
    'Under each 5K mat: the pace of the 5K before it (Finish: the last 2.2 km).',
    'Under each 5K mat: the pace of the 5K before it (Finish: the last 2.2 km). Under each mile: that mile’s pace. Paces as a watch reading the course 1% long shows them.',
    'Under each 5K mat: the pace of the 5K before it (Finish: the last 2.2 km). Paces as a watch reading the course 0.5% long shows them.']); ok();
  for (const text of [sp.pacesNote('mi', true, 0.015), sp.matPacesNote(0.01), sp.splitPacesNote('mi', 0.01), sp.stretchCaption('unit', G, true, 'mi', 0.01)]) assert.doesNotMatch(text, /adjust|\bshould\b|your chance|arithmetic|fastest|the wall|predict/i, text);
  checks += 4;
  // The strips with the option on: a pace under each of the nine 5K cells' times and under each mile (or km) cell's, none
  // in the halfway cell; the captions say so. With it off the strips are exactly as before: removing the option's
  // additions from the strips with it on gives, byte for byte, the strips without it.
  const paceStrip = (o) => stripOf({ rows: nyRows, mats: nyMats.map((m) => m.terrain), terrain: true, ...o });
  const pacesOf = (html) => [...html.matchAll(/<span class="p">([^<]+)<small>([^<]+)<\/small><\/span>/g)].map((m) => m[1] + m[2]);
  const matPart = (html) => html.slice(html.indexOf('pace-band-strip is-mats'), html.indexOf('pace-band-strip is-splits'));
  const nyPaces = sp.stripPaces(G, ny, 'mi');
  const on = paceStrip({ paces: nyPaces }), off = paceStrip({});
  assert.deepEqual(pacesOf(matPart(on)), nyFives.map((x) => sp.stretchPace(x, 'mi')), 'Paces on: the mat strip\'s nine 5K paces'); ok();
  assert.match(on, /<span class="k">5K <small>3\.1mi<\/small><\/span><b>37:19<\/b><span class="p">12:01<small>\/mi<\/small><\/span><\/div>/, 'Paces on: 0–5K\'s pace under the 5K time, its unit in small type'); ok();
  assert.match(on, /<span class="k">Finish <small>26\.2mi<\/small><\/span><b>5:15:00<\/b><span class="p">12:04<small>\/mi<\/small><\/span><\/div>/, 'Paces on: 40K–Finish\'s pace under the finish'); ok();
  const splitCells = (html) => [...html.matchAll(/<div class="pace-band-cell(?: is-half| is-mat)?"><span class="k">(Mi \d+|Km \d+|Half)<\/span><b>([^<]+)<\/b>(?:<span class="p">([^<]+)<small>([^<]+)<\/small><\/span>)?<\/div>/g)].map((m) => [m[1], m[2], m[3] ? m[3] + m[4] : null]);
  const onCells = splitCells(on);
  assert.equal(onCells.length, 27); assert.deepEqual(onCells.filter(([k]) => k !== 'Half').map(([k, t, p]) => [k, p]), nyEach.slice(0, 26).map((x, i) => [`Mi ${i + 1}`, `${F(x.time)}/mi`]), 'Paces on: one pace per mile cell, its mile time'); checks += 2;
  assert.deepEqual(onCells.filter(([k]) => k === 'Half'), [['Half', '2:37:11', null]], 'Paces on: the halfway cell keeps its time and shows no pace'); ok();
  assert.equal(pacesOf(on).length, 9 + 26); assert.equal((on.match(/has-paces/g) || []).length, 4, 'Paces on: the four strips are marked'); checks += 2;
  assert.ok(on.includes('<span class="k">Mi 1</span><b>12:50</b><span class="p">12:50<small>/mi</small></span>') && on.includes('<span class="k">Mi 15</span><b>3:00:20</b><span class="p">12:42<small>/mi</small></span>'), 'Paces on: mile 1 at 12:50/mi, mile 15 at 12:42/mi'); ok();
  assert.match(on, /<p class="pace-band-strip-caption">Terrain splits · New York route · Published research · each 5K’s pace under its time \(Finish: last 2\.2 km\)<\/p>/); ok();
  assert.equal((on.match(/ · pace per mile under each time<\/p>/g) || []).length, 3, 'Paces on: each mile strip\'s caption says so'); ok();
  assert.ok(!/class="p"|has-paces|pace under|pace per mile/.test(off), 'Paces off: no pace markup on the strips'); ok();
  assert.equal(on.replace(/<span class="p">[^<]*<small>[^<]*<\/small><\/span>/g, '').replace(/ has-paces/g, '').replace(/ · each 5K’s pace under its time \(Finish: last 2\.2 km\)/g, '').replace(/ · pace per (?:mile|km) under each time/g, ''), off, 'Paces off: the strips byte for byte as before'); ok();
  assert.equal(paceStrip({ paces: null }), off); assert.equal(stripOf({ rows: nyEven, mats: null, terrain: false }), evenHtml); checks += 2;
  // At even pace and on a km band.
  const evenOn = stripOf({ goal: B, pKm: B / 42.195, rows: pace.splitTable(B, 42.195, 'mi'), mats: null, terrain: false, paces: sp.stripPaces(B, null, 'mi') });
  assert.ok(pacesOf(evenOn).length === 35 && pacesOf(evenOn).every((v) => v === '9:09/mi'), 'Even pace 4:00, paces on: 9:09/mi under every 5K and every mile'); ok();
  assert.match(evenOn, /<p class="pace-band-strip-caption">Even-pace times · each 5K’s pace under its time \(Finish: last 2\.2 km\)\.<\/p>/); ok();
  // With a watch that reads the course 1% long (the pace band's watch=1): the same cells hold the watch's paces, the times
  // unchanged, and every caption says "watch pace"; the planner never has a watch (overrun 0).
  const watchOn = paceStrip({ overrun: 0.01, paces: sp.stripPaces(G, ny, 'mi', 0.01) });
  assert.deepEqual(pacesOf(matPart(watchOn)), ['11:54/mi', '11:49/mi', '11:52/mi', '11:50/mi', '12:10/mi', '11:39/mi', '11:55/mi', '12:00/mi', '11:56/mi'], 'A watch 1% long: the mat strip\'s nine watch paces'); ok();
  assert.ok(watchOn.includes('<span class="k">Mi 1</span><b>12:50</b><span class="p">12:42<small>/mi</small></span>') && watchOn.includes('<span class="k">Mi 15</span><b>3:00:20</b><span class="p">12:34<small>/mi</small></span>'), 'A watch 1% long: mile 1 12:50 at 12:42/mi on the watch, mile 15 12:42 at 12:34/mi'); ok();
  assert.match(watchOn, /<p class="pace-band-strip-caption">Terrain splits · New York route · Published research · each 5K’s watch pace under its time \(Finish: last 2\.2 km\)<\/p>/); assert.equal((watchOn.match(/ · watch pace per mile under each time<\/p>/g) || []).length, 3, 'A watch 1% long: each mile strip\'s caption says watch pace'); checks += 2;
  assert.equal(splitCells(watchOn).map(([k, t]) => `${k} ${t}`).join(), onCells.map(([k, t]) => `${k} ${t}`).join(), 'A watch 1% long: the times are the course\'s'); ok();
  const kmOn = stripOf({ rows: tb.bandRows(G, 'km', ny), interval: 'km', mats: nyMats.map((m) => m.terrain), terrain: true, paces: sp.stripPaces(G, ny, 'km') });
  const kmCells = splitCells(kmOn);
  assert.equal(kmCells.length, 43); assert.deepEqual(kmCells.filter(([k]) => k !== 'Half').map(([k, , p]) => [k, p]), nyEachKm.slice(0, 42).map((x, i) => [`Km ${i + 1}`, `${F(x.time)}/km`]), 'Paces on, km band: one pace per km cell, its km time'); checks += 2;
  assert.ok(kmCells.some(([k, , p]) => k === 'Half' && p === null) && pacesOf(matPart(kmOn))[0] === '7:28/km' && (kmOn.match(/ · pace per km under each time<\/p>/g) || []).length === 4, 'Paces on, km band: no pace at halfway, the 5K paces per km, each km strip says so'); ok();
  // The tables (both pages, one component): each 5K and each mile or km with its time and pace; no badge inside.
  const StretchTables = require('../components/tools/StretchTables.tsx').default;
  const tablesOf = (o) => renderToStaticMarkup(React.createElement(StretchTables, { goal: G, terrain: ny, units: 'mi', ...o }));
  const nyTables = tablesOf({});
  assert.deepEqual(heads(nyTables), ['Stretch', 'Time', 'Pace', 'Stretch', 'Time', 'Pace']); ok();
  const tableRows = (html) => [...html.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  assert.deepEqual(tableRows(nyTables), [...nyFives, ...nyEach].map((x) => row(x, 'mi')), 'The tables: every 5K and every mile, with the strips\' times and paces'); ok();
  assert.deepEqual([...nyTables.matchAll(/<p class="stretch-title"[^>]*>([^<]+)<\/p>/g)].map((m) => m[1]), ['Each 5K', 'Each mile']); ok();
  assert.deepEqual([...nyTables.matchAll(/<caption class="sr-only">([^<]+)<\/caption>/g)].map((m) => m[1]), ['Terrain-split time and pace for each 5K of 5:15 (published research)', 'Terrain-split time and pace for each mile of 5:15 (published research)']); ok();
  assert.doesNotMatch(nyTables, /evidence-|badge/, 'No badge inside the fold: the panel carries it'); ok();
  const evenTables = tablesOf({ goal: B, terrain: null, units: 'km' });
  assert.deepEqual([...evenTables.matchAll(/<p class="stretch-title"[^>]*>([^<]+)<\/p>/g)].map((m) => m[1]), ['Each 5K', 'Each km']); assert.equal(tableRows(evenTables).length, 52); checks += 2;
  assert.deepEqual([...evenTables.matchAll(/<caption class="sr-only">([^<]+)<\/caption>/g)].map((m) => m[1]), ['Even-pace time and pace for each 5K of 4:00', 'Even-pace time and pace for each km of 4:00']); ok();
  assert.ok(tableRows(evenTables).every((r) => r.endsWith(' 5:41/km')), 'Even pace 4:00 in km: every stretch at 5:41/km'); ok();
  // The tables' times add up to the goal as printed, at even pace too, and match the strip's own rounded times.
  const sumOf = (rows) => rows.reduce((a, r) => a + r.split(' ').at(-2).split(':').reduce((x, y) => x * 60 + Number(y), 0), 0);
  for (const [goal, terrainOf, units] of [[B, null, 'km'], [B, null, 'mi'], [clock(3, 30), null, 'mi'], [clock(3, 30), null, 'km'], [G, null, 'mi'], [G, ny, 'mi'], [G, ny, 'km']]) {
    const r = tableRows(tablesOf({ goal, terrain: terrainOf, units }));
    assert.deepEqual([sumOf(r.slice(0, 9)), sumOf(r.slice(9))], [goal, goal], `${F(goal)} ${terrainOf ? 'terrain' : 'even'} ${units}: the printed 5K rows and ${units} rows each add up to the goal`); ok();
  }
  const evenStrip = stripOf({ goal: clock(3, 30), pKm: clock(3, 30) / 42.195, rows: pace.splitTable(clock(3, 30), 42.195, 'mi'), mats: null, terrain: false });
  const stripTimes = splitCells(evenStrip).filter(([k]) => k !== 'Half').map(([, t]) => t.split(':').reduce((x, y) => x * 60 + Number(y), 0));
  assert.deepEqual(tableRows(tablesOf({ goal: clock(3, 30), terrain: null, units: 'mi' })).slice(9, 35).map((r) => r.split(' ').at(-2)), stripTimes.map((t, i) => F(t - (i ? stripTimes[i - 1] : 0))), 'Even pace 3:30: each mile\'s time is the difference of the strip\'s own times'); ok();
  const watchTables = tablesOf({ overrun: 0.01 });
  assert.deepEqual(heads(watchTables), ['Stretch', 'Time', 'Watch pace', 'Stretch', 'Time', 'Watch pace'], 'A watch 1% long: the pace column says watch pace'); ok();
  assert.deepEqual(tableRows(watchTables).slice(0, 1).concat(tableRows(watchTables).slice(9, 10)), ['0–5K 37:19 11:54/mi', 'Mile 1 12:50 12:42/mi']); ok();
  assert.deepEqual([...watchTables.matchAll(/<caption class="sr-only">([^<]+)<\/caption>/g)].map((m) => m[1]), ['Terrain-split time and pace for each 5K of 5:15 (published research); paces as a watch reading the course 1% long shows them', 'Terrain-split time and pace for each mile of 5:15 (published research); paces as a watch reading the course 1% long shows them']); ok();

  // One rule, one control, one wording on both pages: the wiring.
  const files = ['lib/tools/terrain-band.ts', 'lib/tools/terrain-data.ts', 'components/tools/BandChoice.tsx', 'components/tools/RacePlan.tsx', 'components/tools/PaceBand.tsx', 'components/tools/PaceBandStrip.tsx',
    'lib/tools/stretch-paces.ts', 'components/tools/StretchTables.tsx'];
  const planSource = sourceOf('components/tools/RacePlan.tsx'), bandSource = sourceOf('components/tools/PaceBand.tsx'), stripSource = sourceOf('components/tools/PaceBandStrip.tsx');
  for (const [name, source] of [['RacePlan', planSource], ['PaceBand', bandSource]]) {
    assert.match(source, /import BandChoice, \{ KickerText, TerrainLine \} from '@\/components\/tools\/BandChoice';/, `${name} uses the one control, the kicker's phrasing and the terrain's lines`);
    assert.match(source, name === 'RacePlan'
      ? /<BandChoice id="plan-band-choice" state=\{bandState\} mode=\{mode\} onChange=\{chooseBand\}[\s\S]*const chooseBand = \(m: BandMode\) => \{\s*choiceTop\.current = [^\n]+\n\s*setQ\(\{ pace: bandChoice\(m\) \}\);\s*\};|const chooseBand = \(m: BandMode\) => \{\s*choiceTop\.current = [^\n]+\n\s*setQ\(\{ pace: bandChoice\(m\) \}\);\s*\};[\s\S]*<BandChoice id="plan-band-choice" state=\{bandState\} mode=\{mode\} onChange=\{chooseBand\}/
      : /<BandChoice id="[\w-]+" state=\{bandState\} mode=\{mode\} onChange=\{\(m\) => setQ\(\{ pace: bandChoice\(m\) \}\)\}/, `${name}: the control writes only even pace to the address`);
    assert.match(source, /const \{ mode, banded, offered \} = bandView\(\{ terrain: [^,]+, choice: q\.pace \}\);/, `${name}: one rule for the default and the override (bandView, with the visitor's choice)`);
    assert.equal((source.match(/\bbanded\s*=[^=>]/g) || []).length, 0, `${name}: the band's terrain is only ever bandView's`);
    assert.equal((source.match(/bandRows\(/g) || []).length, 1, `${name}: one set of rows`);
    assert.match(source, /const rows = useMemo\(\(\) => \(goal === null \? \[\] : bandRows\(goal, [^,]+, banded\)\), \[goal, [^\]]+, banded\]\);/, `${name}: the rows come from the band in its mode`);
    assert.match(source, /const mats = goal !== null && banded \? matRows\(goal, banded\)\.map\(\(m\) => m\.terrain!\) : null;/, `${name}: the mat strip's nine terrain times`);
    assert.match(source, /mats=\{mats\} terrain=\{Boolean\(banded\)\}/, `${name}: the strips print the band in its mode`);
    assert.match(source, /climbsLine\(goal, banded, /, `${name}: the climbs from the one rule`);
    assert.match(source, /<TerrainLine goal=\{goal\} city=\{banded\.city\} climbs=\{climbText\}/, `${name}: the terrain's lines in the same words`);
    assert.match(source, /noTerrainLine\(/, `${name}: the one line where there are no terrain splits`);
    assert.match(source, /const minute = goal === null \? null : bandMinute\(goal\);/, `${name}: the group's minute from the one rule`);
    assert.match(source, /bandKicker\(\{ goal, place, terrain: banded, units/, `${name}: the band's kicker in the shared words`);
    assert.match(source, /tidyChoice\(q\.pace, /, `${name}: a hand-edited pace leaves the address`);
    assert.match(source, /goalPace\(pKm, units, Boolean\(banded\)\)/, `${name}: the goal bar labels the average on terrain`);
    assert.match(source, /<AsRunNote sd=\{/, `${name}: the forewarning over the as-run medians`);
    assert.doesNotMatch(source, /observed=\{|StripObserved|disabled=\{pending\}/, `${name}: no observed line on the strips, and printing never waits for data`);
    checks += 17;
  }
  for (const file of [...files, 'app/tools/plan/page.tsx', 'app/tools/pace-band/page.tsx', 'lib/tools/plan.ts']) {
    assert.doesNotMatch(sourceOf(file), /\bpending\b|mayShape|shapeGoalsOf|shapeFor|shapeLoading|courseShape|noShapeReason|SHAPE_MIN_EDITIONS|course-shape\.ts|is-pending|is-shape\b/, `${file}: nothing of the retired course-shape band`); ok();
  }
  assert.ok(!fs.existsSync(path.join(root, 'lib/tools/course-shape.ts')), 'lib/tools/course-shape.ts is gone (renamed terrain-band.ts)'); ok();
  // The planner: the card, the band panel and the As run panel, each with its one badge.
  const section = (source, start) => { const i = source.indexOf(start); assert.ok(i >= 0, `found ${start}`); return source.slice(i, source.indexOf('</section>', i)); };
  const card = section(planSource, '<section className={`tool-reading night plan-headline');
  const bandPanel = section(planSource, '<section className="tool-panel plan-band"');
  const asRun = section(planSource, '<section className="tool-panel plan-asrun"');
  const printPanel = bandSource.slice(bandSource.indexOf('function PrintPanel('));
  assert.match(planSource, /cardMats\(goal, banded\)/, 'The planner card\'s four times from the one rule'); ok();
  assert.match(card, /\{banded \? <ReadingFoot badge=\{<EvidenceTag kind="research" \/>\} copy=\{false\} \/> : null\}/, 'The card carries the Published research badge on terrain, at every width'); ok();
  assert.match(bandPanel, /\{banded \? <EvidenceTag kind="research" \/> : null\}\s*<h2 className="tool-panel-title" id="plan-band-title">/, 'The band panel carries the Published research badge on terrain'); ok();
  assert.match(printPanel, /\{terrain \? <EvidenceTag kind="research" className="no-print" \/> : null\}/, 'The pace band\'s band carries the Published research badge on terrain'); ok();
  for (const [where, text] of [['the planner card', card], ['the planner band panel', bandPanel], ['the pace band print panel', printPanel]]) { assert.doesNotMatch(text, /kind="data"|kind=\{'data'\}/, `${where}: no Pace Notes data badge`); ok(); }
  assert.match(asRun, /^<section className="tool-panel plan-asrun" id="plan-asrun" aria-labelledby="plan-asrun-title">\s*<EvidenceTag kind="data" \/>\s*<h2 className="tool-panel-title" id="plan-asrun-title">As run near \{fmtGoal\(goal\)\} \{where\}<\/h2>\s*<p className="tool-note plan-asrun-note"><AsRunNote sd=\{observed\.all\.sd\} \/><\/p>/, 'The As run panel: its data badge, title and forewarning'); ok();
  assert.match(asRun, /<AsRunTable cells=\{\{ all: observed\.all, held: observed\.held, slow: observed\.slow \}\} units=\{units\} short \/>/); ok();
  assert.ok(planSource.indexOf('className="tool-panel plan-asrun"') > planSource.indexOf('className="tool-panel plan-band"'), 'The As run panel follows the band panel'); ok();
  assert.match(bandSource, /<section className="tool-panel pace-band-observed" id="pace-band-observed" aria-labelledby="pace-band-observed-title">\s*<EvidenceTag kind="data" \/>/, 'The pace band\'s finishes carry the data badge'); ok();
  assert.match(bandSource, /\)\}\s*<p className="tool-note pace-band-asrun"><AsRunNote sd=\{ok\.all\.sd\} \/><\/p>/, 'The pace band\'s forewarning sits right under its nugget'); ok();
  assert.equal((planSource.match(/<MatTable goal=\{goal\} units=\{units\} terrain=\{banded\} \/>/g) || []).length, 2, 'Both mat tables show the band in its mode'); ok();
  assert.match(planSource, /<PaceBandStrip goal=\{goal\} pKm=\{pKm\} units=\{units\} rows=\{rows\} /, 'The planner\'s strips print the band\'s rows'); ok();
  assert.match(planSource, /<button type="button" className="btn btn-primary is-compact" data-not-edit onClick=\{\(\) => printAs\('strip'\)\}>Print wristband strips<\/button>/, 'The planner prints at once'); ok();
  assert.match(planSource, /const bandState = offered \? 'choice' as const : !isAll && course \? 'none' as const : 'off' as const;/, 'The planner: the choice on a terrain course, the line on another, nothing on all courses or an unknown slug'); ok();
  assert.match(planSource, /course\?\.why \? noTerrainLine\(course\.city\) : ''/, 'The planner: the line on a course the terrain file lists as even'); ok();
  assert.match(planSource, /bandView\(\{ terrain: isAll \? null : course\?\.terrain \?\? null, choice: q\.pace \}\)/, 'The planner: All courses has no terrain'); ok();
  assert.match(planSource, /bandKicker\(\{ goal, place, terrain: banded, units, pace: false \}\)/, 'The planner\'s band panel kicker leaves the average to the card'); ok();
  assert.match(planSource, /<small>per \{unitWord\}, \{banded \? 'average' : 'even pace'\} · /, 'The card\'s figure: the average pace on terrain'); ok();
  assert.match(planSource, /Terrain splits \(Published research\): \{fmtGoal\(goal\)\} over the \{banded\.city\} route at an even effort, average \{fmtPace\(pKm, units\)\}\.<\/>[\s\S]{0,120}Cut the strips out along the dashed lines\./, 'The planner\'s printed header'); ok();
  assert.match(planSource, /\{banded \? 'Terrain splits from published research' : observed \? 'Your plan' : 'Your race plan'\}\{observed \? ' · As run from Pace Notes data' : ''\} · splithappens\.run\/tools\/plan/, 'The planner\'s printed sources'); ok();
  assert.match(planSource, /caption=\{banded \? 'Every mat: terrain splits beside even pace' : 'Every mat: your plan'\}/); ok();
  assert.match(planSource, /`\$\{fmtGoal\(goal\)\} goal in \$\{banded\.city\}: terrain splits, average \$\{fmtPace\(pKm, units\)\}\$\{clause\}\.`/, 'The planner\'s live region on terrain'); ok();
  assert.match(planSource, /`, slowest \$\{word\} \$\{slowest\.n\} at \$\{formatDuration\(slowest\.split\)\}` : steady \? `, every \$\{word\} within 2% of it` : ''/); ok();
  assert.match(planSource, /result\?\.state === 'unavailable' && goalData\.data && offered \? goalPaceNote\(/, 'Beside terrain splits, in either mode, the note is scoped to the results on goal pace'); ok();
  // The lead keeps the chapter's words in either mode: its line and the words it is built from never read the band.
  assert.match(planSource, /<DataLead id="plan-comparison" titleId="plan-comparison-title" className="plan-comparison"\s*figure=\{\{ value: String\(madeOf100\), unit: '%', sr: `\$\{madeOf100\} percent` \}\} line=\{<>\{leadLine\}\.<\/>\}>/, 'The lead prints its one line'); ok();
  const leadWords = ['tolerance', 'nearGoal', 'leadLine', 'shareGoal', 'madeOf100', 'spreadText'].map((name) => (planSource.match(new RegExp(`const ${name} = [^\\n]+(?:\\n\\s+\\?[^\\n]+|\\n\\s+:[^\\n]+)*`)) || [''])[0]);
  assert.ok(leadWords.every(Boolean), 'The lead\'s words are found'); ok();
  assert.doesNotMatch(leadWords.join('\n'), /\bbanded\b|\bmode\b|\boffered\b|\bterrain|q\.pace|'even |even \$\{/, 'The lead\'s words do not change with the Splits choice'); ok();
  assert.doesNotMatch(planSource, /\$\{(?:banded|offered|mode === 'even') \? 'even ' : ''\}/, 'No "even" in the lead in either mode'); ok();
  assert.doesNotMatch(planSource + bandSource, /is-narrow-only/, 'Every badge shows at every width'); ok();
  // The pace band: the band never changes with the recorded gender; the finishes section reads the chosen gender's shard.
  assert.match(bandSource, /const courseTerrain = course === 'all' \? null : own\(terrain, course\);/); assert.match(bandSource, /bandView\(\{ terrain: courseTerrain, choice: q\.pace \}\)/); checks += 2;
  assert.doesNotMatch(bandSource.match(/const courseTerrain = [^\n]+/)[0] + bandSource.match(/bandView\(\{[^)]+\)/)[0], /gender/, 'The pace band\'s band takes no recorded gender'); ok();
  assert.match(bandSource, /const shardPath = paceBandShardPath\(course, gender\);/, 'The finishes section reads the chosen recorded gender\'s shard'); ok();
  assert.match(bandSource, /const bandState = offered \? 'choice' as const : course !== 'all' && \(published \|\| known\) \? 'none' as const : 'off' as const;/); ok();
  assert.match(bandSource, /bandState === 'none' && why && city \? noTerrainLine\(city\) : ''/, 'The pace band: the line on a known course without terrain splits'); ok();
  assert.match(bandSource, /kicker=\{bandKicker\(\{ goal, place, terrain: banded, units, overrun, example: isExample \}\)\}/, 'The pace band\'s kicker names no gender'); ok();
  assert.match(bandSource, /line=\{banded \? <TerrainLine goal=\{goal\} city=\{banded\.city\} climbs=\{climbText\} \/> : null\}/); ok();
  // A press never moves the control (October 29, 2026: Even pace took the terrain's lines out from above it, and the next
  // tap landed on the strips): the pace band's choice heads the band, nothing above it changes with the mode; the planner,
  // whose card above the control changes, scrolls by however far the control moved before the change is painted.
  assert.match(printPanel, /<section className="pace-band-print-panel" id="pace-band-band" aria-labelledby="pace-band-print-title" aria-busy=\{busy \|\| undefined\}>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?\{choice\}\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?\{terrain \? <EvidenceTag kind="research" className="no-print" \/> : null\}\s*<p className="tool-reading-kicker pace-band-kicker" id="pace-band-print-title"><KickerText text=\{kicker\} \/><\/p>\s*\{line\}\s*<PaceBandStrip/,
    'The pace band: the Splits choice heads the band, then the badge, the kicker and the terrain\'s lines, then the strips'); ok();
  assert.match(bandSource, /choice=\{<BandChoice id="pace-band-choice" state=\{bandState\} /, 'The pace band passes the one control as the panel\'s choice'); ok();
  assert.match(planSource, /const useIsoLayoutEffect = typeof window === 'undefined' \? useEffect : useLayoutEffect;/); ok();
  assert.match(planSource, /useIsoLayoutEffect\(\(\) => \{\s*const before = choiceTop\.current;\s*choiceTop\.current = null;\s*const now = document\.getElementById\('plan-band-choice'\)\?\.getBoundingClientRect\(\)\.top;\s*if \(before !== null && now !== undefined && Math\.abs\(now - before\) >= 1\) window\.scrollBy\(\{ top: now - before, left: 0, behavior: 'instant' \}\);\s*\}, \[mode\]\);/,
    'The planner keeps its Splits choice in place: after a press it scrolls by however far the control moved'); ok();
  assert.match(bandSource, /<PrintPanel goal=\{goal\} pKm=\{pKm\} units=\{units\} rows=\{rows\} /); ok();
  assert.match(bandSource, /<Wristband rows=\{rows\} goal=\{goal\} pKm=\{pKm\} units=\{units\} overrun=\{overrun\} even=\{banded \? splitTable\(goal, MARATHON_KM, interval\) : null\} features=\{banded\?\.features \?\? \[\]\} \/>/); ok();
  assert.match(bandSource, /\{banded \? 'Terrain splits from published research' : 'Pace Notes pace band'\} · splithappens\.run\/tools\/pace-band/, 'The pace band\'s printed note'); ok();
  assert.match(bandSource, /`Every marker on the band: terrain splits \(timing points in bold\) beside even pace for \$\{fmtGoal\(goal\)\}`/); ok();
  assert.match(bandSource, /`\$\{fmtGoal\(goal\)\} goal \$\{where\}: terrain splits, average \$\{fmtPace\(pKm, units\)\}\.`/, 'The pace band\'s live region on terrain'); ok();
  assert.match(sourceOf('components/tools/BandChoice.tsx'), /<Choice label=\{BAND_LABEL\} value=\{mode\} onChange=\{onChange\} options=\{BAND_OPTIONS\} small className="band-choice-seg" \/>/, 'The control is the site\'s segmented Choice'); ok();
  const terrainLine = renderToStaticMarkup(React.createElement(BandChoice.TerrainLine, { goal: G, city: 'New York', climbs: tb.climbsLine(G, ny, 'mi') }));
  assert.equal(terrainLine.replace(/<[^>]+>/g, ''), `${tb.terrainCardLine(G, 'New York')}${tb.climbsLine(G, ny, 'mi')}`, 'The terrain\'s lines: the card line, then the climbs'); ok();
  assert.match(terrainLine, /^<p class="band-shape-line">[^<]+<span class="nowrap">Not a prediction\.<\/span><span class="band-climbs">/); ok();
  assert.match(stripSource, /The corrected profile the terrain splits were spread over\b/); assert.doesNotMatch(stripSource, /Context only; never used in a calculation|observed\b/); checks += 2;
  // The pages: the terrain from the file at build time, never a pending state; the back strip only from the corrected profile.
  const planPage = sourceOf('app/tools/plan/page.tsx'), bandPage = sourceOf('app/tools/pace-band/page.tsx');
  assert.match(planPage, /const terrainIndex = optional<TerrainIndex>\(TERRAIN_FILE\);/); assert.match(bandPage, /const terrainIndex = optional<TerrainIndex>\(TERRAIN_FILE\);/); checks += 2;
  assert.match(bandPage, /const \{ terrain, why, strips = \{\} \} = terrainProps\(terrainIndex, true\);/); ok();
  assert.match(bandPage, /const profiles: RouteProfile\[\] = Object\.values\(terrain\)\.map\(/, 'The back strip: terrain courses only, from the corrected profile'); ok();
  assert.doesNotMatch(bandPage, /elevation_m|elevation_step_km/, 'The back strip never draws the supplied profile'); ok();
  assert.match(planPage, /description: 'Plan a marathon goal on your course: splits for every mat, with its climbs and bridges where the route is checked, how that pace held up there, and a pace band to print\.'/); ok();
  assert.match(bandPage, /description: 'Print a free marathon wristband for any goal time, with your course’s climbs and bridges or at even pace, by mile, km or 5 km mat, beside what finishes at that goal ran\.'/); ok();
  const registry = require('../lib/tools/registry.ts');
  const tool = (slug) => registry.TOOLS.find((t) => t.slug === slug);
  assert.deepEqual([tool('plan').evidence, tool('pace-band').evidence], [['data', 'research'], ['data', 'research']], 'The planner and the pace band show both kinds, never in one figure'); ok();
  assert.equal(tool('pace-band').dek, 'A wristband to print with your course’s climbs and bridges or at even pace, beside the mat times of finishes near your goal.'); ok();
  assert.equal(registry.EVIDENCE_TEXT.research, 'Published models and studies, cited: shown as ranges where studies differ, or as one named method where a tool needs a single plan. Not fitted to Pace Notes data.'); ok();
  assert.ok(sourceOf('components/methods/MethodsDefinitions.tsx').includes('Shown as ranges where studies differ, or as one cited method where a tool needs a single plan (the terrain splits); each method on its own, and kept apart from Pace Notes results.'), 'The research badge\'s definition names the terrain splits'); ok();
  // Copy rules: no advice, chance, prediction (other than "Not a prediction") or causal wording in the terrain files; no
  // "course shape" in visible copy anywhere under the tools and methods (the old anchor id tools-course-shape stays).
  const visible = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => line.replace(/(^|\s)\/\/\s.*$/, '$1')).join('\n');
  for (const file of files) { assert.doesNotMatch(visible(sourceOf(file)), /adjust|\bshould\b|your chance|arithmetic|to make \d|(?<!Not a )predict/i, `${file}: no advice, chance, prediction or causal wording`); ok(); }
  // The pace band's finishes section never says the band is even pace (on terrain it is not, and the band never depends
  // on the finishes data): its states say the visitor's pace band still works. A wider group is offered only where it
  // can help: never for a goal outside the observed range (every course and recorded gender covers the same goals), and
  // never All courses while the band is terrain splits (the band would change to even pace).
  assert.doesNotMatch(visible(bandSource), /even-pace band/, 'The pace band: no state says the band is even pace'); ok();
  assert.equal((bandSource.match(/Your pace band still works\./g) || []).length, 3, 'The pace band: the data, its failure and a selection with no group leave the band working'); ok();
  assert.match(bandSource, /title: 'Outside the observed range\.', message: `Observed groups cover whole-minute goals from \$\{formatHM\(OBS_MIN \* 60\)\} to \$\{formatHM\(OBS_MAX \* 60\)\}\. Your pace band works for any goal from 1:30 to 8:00\.`/); ok();
  assert.match(bandSource, /const outside = minute !== null && \(minute < OBS_MIN \|\| minute > OBS_MAX\);\s*const fallbacks = outside \? null : \(/, 'No wider group for a goal outside the observed range'); ok();
  assert.match(bandSource, /\{course !== 'all' && !banded \? <button type="button" className="btn btn-secondary is-compact" onClick=\{\(\) => widen\(\{ course: 'all' \}, /, 'No switch to All courses while the band is terrain splits'); ok();
  for (const file of ['lib/tools/stretch-paces.ts', 'components/tools/StretchTables.tsx']) { assert.doesNotMatch(visible(sourceOf(file)), /fastest|the wall/i, `${file}: no "fastest" or "the wall"`); ok(); }
  // The stretch-pace option's wiring on both pages: one address key, `1` only, tidied on arrival; the strips' paces from the
  // one rule in the band's units; the box under the planner's band and in the pace band's print options; the fold after
  // each page's band table; the printed tables only with the option on.
  for (const [name, source] of [['RacePlan', planSource], ['PaceBand', bandSource]]) {
    assert.match(source, /if \(ready && q\.paces !== tidyPaces\(q\.paces\)\) setQuery\(\{ paces: tidyPaces\(q\.paces\) \}\);/, `${name}: any paces value but 1 leaves the address`);
    assert.match(source, /const pacesOn = q\.paces === '1';/, `${name}: the option is on only for paces=1`);
    assert.deepEqual([...source.matchAll(/setQ(?:uery)?\(\{ paces: ([^}]+) \}\)/g)].map((m) => m[1]).sort(), name === 'RacePlan' ? ["e.target.checked ? '1' : ''", 'tidyPaces(q.paces)'] : ['tidyPaces(q.paces)', "v ? '1' : ''"], `${name}: the option writes only 1, or nothing`);
    assert.match(source, /<span>\{PACES_LABEL\}<small>\{pacesUnit\((?:units|paceUnits)\)\}<\/small><\/span><\/label>/, `${name}: the box's label and its unit`);
    assert.equal((source.match(/stripPaces\(/g) || []).length, 1, `${name}: the strips' paces from the one rule`);
    checks += 5;
  }
  assert.match(planSource, /const DEFAULTS = \{ course: 'all', goal: '4:00', pace: '', paces: '' \};/); assert.match(bandSource, /back: '0', pace: '', paces: '' \};/); checks += 2;
  assert.match(planSource, /const paces = useMemo\(\(\) => \(goal !== null && pacesOn \? stripPaces\(goal, banded, units\) : null\), \[goal, pacesOn, banded, units\]\);/); ok();
  assert.match(planSource, /mats=\{mats\} terrain=\{Boolean\(banded\)\} paces=\{paces\} \/>\s*\{\/\*[^*]*\*\/\}\s*<label className="tool-check band-paces no-print"><input type="checkbox" checked=\{pacesOn\} aria-describedby=\{pacesOn \? 'plan-paces-note' : undefined\} onChange=\{\(e\) => setQuery\(\{ paces: e\.target\.checked \? '1' : '' \}\)\} \/>[\s\S]{0,120}<\/label>\s*\{pacesOn \? <p className="tool-note band-paces-note no-print" id="plan-paces-note">\{pacesNote\(units, true\)\}<\/p> : null\}\s*\{\/\*[^*]*\*\/\}\s*<ShareBar/, 'The planner: the box directly under the band, its note under it while on, above the Print button'); ok();
  // The box shows the same plan another way: it writes the address without marking the plan touched, and a link holding
  // only paces=1 is still the example (review, October 29, 2026: ticking it had removed "Example ·").
  assert.match(planSource, /const isExample = ready && Array\.from\(fromUrl\)\.every\(\(key\) => key === 'paces'\) && !touched;/, 'The planner: paces alone never ends the example'); ok();
  assert.doesNotMatch(planSource, /setQ\(\{ paces:/, 'The planner: the paces box does not count as touching the plan'); ok();
  assert.match(planSource, /<MatTable goal=\{goal\} units=\{units\} terrain=\{banded\} \/>\s*<\/Values>\s*\{\/\*[^*]*\*\/\}\s*<Values id="plan-stretch-values" count=\{stretchCount\(units\)\} name=\{stretchesName\(units\)\} caption=\{stretchesTitle\(units\)\}>\s*<StretchTables goal=\{goal\} terrain=\{banded\} units=\{units\} \/>\s*<\/Values>\s*<\/section>/, 'The planner: the fold right after Every mat, in the band panel'); ok();
  assert.match(planSource, /\{pacesOn \? \(\s*<div className="print-only plan-print-stretches">[\s\S]{0,260}<StretchTables goal=\{goal\} terrain=\{banded\} units=\{units\} \/>/, 'The planner prints the tables only with the option on'); ok();
  assert.match(bandSource, /const paceUnits: UnitSystem = interval === 'km' \? 'km' : interval === 'mi' \? 'mi' : units;/, 'The pace band: the paces in its rows\' units, the 5K mats in the page\'s'); ok();
  assert.match(bandSource, /const paces = useMemo\(\(\) => \(goal !== null && pacesOn \? stripPaces\(goal, banded, paceUnits, overrun\) : null\), \[goal, pacesOn, banded, paceUnits, overrun\]\);/, 'The pace band: the strips\' paces for its watch'); ok();
  assert.match(bandSource, /const stretches = goal === null \? null : <StretchTables goal=\{goal\} terrain=\{banded\} units=\{paceUnits\} overrun=\{overrun\} \/>;/, 'The pace band: the tables\' paces for its watch'); ok();
  assert.doesNotMatch(planSource, /overrun=\{overrun\}|stripPaces\([^)]*overrun/, 'The planner has no watch: its paces are the course\'s'); ok();
  assert.match(bandSource, /useEffect\(\(\) => \{ if \(ready && fromUrl\.has\('paces'\) && q\.paces === '1'\) setPacesLinked\(true\); \}, \[ready, fromUrl, q\.paces\]\);/); assert.match(bandSource, /optionsOpen=\{Boolean\(q\.split\) \|\| overrun !== 0 \|\| pacesLinked\}/, 'A link with paces=1 opens the print options'); checks += 2;
  assert.match(printPanel, /\{controls\}\s*\{\/\*[^*]*\*\/\}\s*<div className="pace-band-paces">\s*<label className="tool-check"><input type="checkbox" checked=\{pacesOn\} aria-describedby=\{pacesOn \? 'pace-band-paces-note' : undefined\} onChange=\{\(e\) => onPaces\(e\.target\.checked\)\} \/>[\s\S]{0,100}<\/label>\s*\{pacesOn \? <p className="tool-note pace-band-paces-note" id="pace-band-paces-note">\{pacesNote\(paceUnits, interval !== '5k', overrun\)\}<\/p> : null\}\s*<\/div>\s*\{profile \? \(/, 'The pace band: the box in the print options, next to the back strip\'s, its note under it while on'); ok();
  assert.match(printPanel, /mats=\{mats\} terrain=\{terrain\} paces=\{paces\} \/>/); ok();
  assert.match(bandSource, /\{wrist\}<\/Values>\s*<Values id="pace-band-stretch-values" count=\{stretchCount\(paceUnits\)\} name=\{stretchesName\(paceUnits\)\} caption=\{stretchesTitle\(paceUnits\)\}>\{stretches\}<\/Values>/, 'The pace band: the fold after Every marker, in the print options, named in its summary'); ok();
  assert.match(bandSource, /stretches=\{pacesOn \? stretches : null\}/); assert.match(printPanel, /\{stretches \? <div className="print-only pace-band-print-stretches">/, 'The full page prints the tables only with the option on'); checks += 2;
  const stripCss = sourceOf('app/styles/pages/tools/pace-band-strip.css'), bandCss = sourceOf('app/styles/pages/tools/pace-band.css'), planCss = sourceOf('app/styles/pages/tools/plan.css');
  assert.match(stripCss, /\.pace-band-strip\.has-paces \.pace-band-cell\.is-half::after \{ content: ''; display: block; height: 1\.1em; margin-top: \.03em; \}/, 'The halfway cell keeps the paces\' line height'); ok();
  assert.match(stripCss, /\.pace-band-cell \.p, \.pace-band-strip\.has-paces \.pace-band-cell\.is-half::after \{ font-size: var\(--pace-size\); line-height: 1\.1; \}/); assert.match(stripCss, /\.pace-band-cell \.p \{ margin-top: \.03em;/, 'The halfway line matches the pace line: one size, one line height, one margin'); checks += 2;
  assert.match(bandCss, /\.pace-band-root\[data-print='strip'\] \.pace-band-print-stretches \{ display: none !important; \}/, 'The strips alone never print the tables'); ok();
  assert.match(planCss, /\.plan-print-stretches \{ order: 5; [^}]*break-before: page; \}/, 'The plan prints the tables on a page of their own'); ok();
  // In print the page column spans the printable area on the two pages that print the strips, so the strip and its scissor
  // marks (18.4 + 0.45 cm) fit Letter and A4 (review, October 29, 2026: the screen gutter had held in print).
  assert.match(stripCss, /@media print \{[^@]*@supports selector\(:has\(a\)\) \{\s*main\.container:has\(\.pace-band-sheet\):not\(:has\(\.pace-band-root\[data-print='page'\]\)\) \{ width: 100%; \}\s*\}/, 'In print the page column spans the printable area where the strips print'); ok();
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  for (const dir of ['lib/tools', 'components/tools', 'components/methods', 'app/tools']) {
    for (const file of walk(path.join(root, dir)).filter((x) => /\.tsx?$/.test(x))) assert.doesNotMatch(visible(fs.readFileSync(file, 'utf8')), /course shape/i, `${path.relative(root, file)}: "course shape" in visible copy`);
    ok();
  }
  // /methodology states the curve, its sources and the profiles' licences, and reads its course lists from the file.
  const methods = sourceOf('components/methods/MethodsTools.tsx');
  for (const needle of ['0.0287', '0.00152', 'doi:10.1152/japplphysiol.01177.2001', 'doi:10.1249/MSS.0b013e3181af21e2', 'doi:10.1515/1559-0410.1456', 'US Patent 11,623,121', 'id="tools-terrain"',
    'id="tools-course-shape"', 'id="tools-terrain-profiles"', 'id="tools-terrain-check"', 'id="tools-asrun"', 'OpenStreetMap', 'CC BY 4.0', 'sci-dani.com']) { assert.ok(methods.includes(needle), `/methodology#tools-terrain says ${needle}`); ok(); }
  assert.match(methods, /readInsight<Terrain>\('tools\/course-terrain\.json'\)/); assert.match(methods, /const terrainCities = terrain \? terrain\.courses\.map\(\(c\) => c\.city\)\.sort\(\) : \[\];/);
  assert.match(methods, /const heldCities = terrain \? terrain\.even\.filter\(\(c\) => c\.why === 'held'\)/); assert.match(methods, /const uncheckedCities = terrain \? terrain\.even\.filter\(\(c\) => c\.why === 'profile'\)/); checks += 4;
  assert.doesNotMatch(methods, /['"`](?:Amsterdam|Austin|Boston|Chicago|Eindhoven|London|Madrid|New York|Rotterdam|Valencia|Warsaw|Oslo)['"`]/, '/methodology types no terrain or held city list'); ok();
  assert.match(methods, /const thin = band\.scopes\.filter\(\(s\) => s\.slug !== 'all' && s\.city && s\.editions < goal\.min_editions\);/, '/methodology names the courses on few editions from the index'); ok();
  const built = path.join(root, 'out/methodology.html');
  if (fs.existsSync(built)) {
    const html = fs.readFileSync(built, 'utf8').replace(/<!-- -->/g, '');
    assert.ok(html.includes('Amsterdam, Austin, Boston, Chicago, Eindhoven, London, Madrid, New York, Rotterdam and Valencia have terrain splits.'), 'The built /methodology lists the ten terrain courses from the file'); ok();
    assert.ok(html.includes('Oslo and Warsaw because their corrected profile did not pass the check below'), 'The built /methodology names the held courses'); ok();
  }

  // The course-goal facts the planner's notes and /methodology rest on (unchanged by the terrain splits).
  const goalsFile = insight('tools/course-goal.json');
  const thin = scopes.filter((sc) => sc.editions < goalsFile.min_editions).map((sc) => `${sc.city} ${sc.editions}`).sort();
  // Auckland joined the list with the October 21, 2026 release, which held its 2017 edition (a misplaced 30 km mat).
  assert.deepEqual(thin, ['Auckland 2', 'Barcelona 2', 'Paris 2', 'Singapore 1'], 'The courses whose groups rest on one or two editions'); ok();
  // /methodology's "a goal at the edge of a course's range can pool fewer editions than the course has": Helsinki 4:27 pools
  // two of its three (and under the October 21, 2026 release Stockholm's slow goals, from 5:23).
  const edge = [];
  for (const sc of scopes.filter((x) => x.editions >= goalsFile.min_editions)) {
    const group = insight(band.paceBandShardPath(sc.slug, 'all')).groups.all;
    group.g.forEach((m, i) => { if (group.ed[i] < goalsFile.min_editions) edge.push(`${sc.city} ${m} ${group.ed[i]}`); });
  }
  assert.ok(edge.includes('Helsinki 267 2') && edge.every((e) => / [12]$/.test(e)), `A goal at the edge of a course's range on fewer editions than a course result needs (${edge.length})`); ok();
  assert.deepEqual(paceIndex.goals, [150, 390]); ok();
  // Singapore, Barcelona and Paris have no course results on goal pace ("3 are needed for any goal") and no terrain splits.
  const planLib = require('../lib/tools/plan.ts');
  for (const [city, goal] of [['Singapore', 14400], ['Barcelona', 10800], ['Paris', 14400]]) {
    const slug = scopes.find((sc) => sc.city === city).slug;
    const r = planLib.courseGoalResult(goalsFile, city, goal, null);
    assert.ok(r.state === 'unavailable' && /3 are needed for any goal/.test(r.reason) && !terrain[slug] && why[slug] === 'profile', `${city}: no results on goal pace, and even pace`); ok();
  }
  assert.equal(planLib.goalPaceNote({ state: 'unavailable', course: { editions: 10 }, minutes: 240, reason: 'Only 2 editions had 20 or more finishes at this pace; 3 are needed.' }, 'Boston'),
    'No results on goal pace for Boston at this goal. Only 2 editions had 20 or more finishes at this pace; 3 are needed.'); ok();
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

console.log(`Tool libraries passed ${checks} checks: time parsing and keypad input (the dot key types a colon in race-time fields; every time reader takes dots and commas), pace calculations and splits, pace charts by goal time and goal-page links, result handoffs to the planner, the pace band and the pacing-pattern analysis, the race planner (its goal, the course-goal row it shows, recounted from the runner records, and the rendered plan), the terrain splits (an independent model recomputing every published share and the parity fixture, every terrain course at every whole-minute goal from 1:30 to 8:00 and +30 s at miles, km and the 5K mats, the pinned plans, the rules, wording, folds, strips and wiring, and each 5K's and each mile's or km's time and pace for the paces option), goal-page sentences, published predictor and heat formulas, qualifying standards with official worked examples and age rules, sustained-slowdown reading, the pacing-type classifier, and the cohort note, which says only the tools with Pace Notes data start from the screened finishes.`);
