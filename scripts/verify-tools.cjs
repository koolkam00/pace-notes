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
  const archetype = require('../components/story/ArchetypeStory.tsx');
  assert.deepEqual(['0.25.30', '1.12.55', '3,51,00', '0.25.75'].map(archetype.parseClock), [1530, 4375, 13860, null]); ok();
  const finish = require('../components/story/FinishTimeStory.tsx');
  assert.deepEqual(['3.58.42', '3.30', '1.12.55', '13.00', '3.75'].map(finish.parseTime), [14322, 12600, null, null, null]); ok();
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

// ---- handoffs from a result (MarathonHandoffs in components/tools/Handoffs.tsx): the predictor's median estimate and the pace
// calculator's marathon time open the pace band and the pacing-pattern analysis with the time filled in, in the forms
// those pages read and inside the ranges they take, as if typed there.
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
  const handoffs = (minutes, extra = 0) => renderToStaticMarkup(React.createElement(MarathonHandoffs, { label: 'With this estimate', seconds: minutes * 60 + extra }));
  const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs(handoffs(237)), ['/tools/plan?goal=3:57', '/tools/pace-band?goal=3:57', '/analyses/pacing-pattern?goal=237']); ok();
  assert.match(handoffs(237), /Plan this goal[\s\S]*Pick your course: even pace for 3:57[\s\S]*Turn this into a pace band[\s\S]*mat times of finishes that just beat it[\s\S]*See how finishers near this time paced/); ok();
  assert.match(handoffs(140), /Even splits for 2:20, ready to print/, 'Outside 2:30–6:30 the pace band has no observed mat times'); ok();
  assert.deepEqual(hrefs(handoffs(600)), ['/analyses/pacing-pattern?goal=600'], 'Past the pace band\'s and the planner\'s 8:00 only the analysis link stays'); ok();
  assert.equal(handoffs(60), '', 'Nothing to hand off outside both ranges'); ok();
  // A time with seconds opens both at the minute at or below it, and the band's card says which minute that is.
  assert.deepEqual(hrefs(handoffs(251, 41)), ['/tools/plan?goal=4:11', '/tools/pace-band?goal=4:11', '/analyses/pacing-pattern?goal=251']); ok();
  assert.match(handoffs(251, 41), /Even splits for 4:11 \(the minute at or below 4:11:41\), beside/); ok();
  assert.doesNotMatch(handoffs(251), /minute at or below/, 'A whole-minute time needs no note'); ok();
  assert.doesNotMatch(handoffs(237), /<button|your chance|arithmetic/i, 'Links only (never counted as a tool edit), in the site\'s words'); ok();
  // Each tool hands on the whole minute at or below its time, the way every tool reads 4:11:41 as 4:11.
  const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'components/tools', name), 'utf8');
  assert.match(source('Predictor.tsx'), /\{est\.range \? <MarathonHandoffs label="With this estimate" seconds=\{Math\.round\(est\.range\.median\)\} \/> : null\}/); ok();
  assert.match(source('PaceCalculator.tsx'), /const shownSeconds = ready \? Math\.round\(seconds!\) : null;[\s\S]*<MarathonHandoffs label="With this marathon time" seconds=\{shownSeconds!\} \/>/); ok();
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
  assert.match(sourceOf('components/tools/CourseChooser.tsx'), /href=\{planHref\(course\.city, goal\) \?\? '\/tools\/plan'\}>Plan<[\s\S]*href=\{planHref\(course\.city, goal\) \?\? '\/tools\/plan'\}>Plan \{goalText\}/, 'Each course chooser row (table and card) links to the planner for its course and goal'); ok();
  assert.match(sourceOf('app/tools/qualifying/[race]/page.tsx'), /import \{ QUALIFYING_COURSE, STANDARDS \} from '@\/lib\/tools\/qualifying';/, 'The race pages read the shared course map'); ok();
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
    const melbourne = goals.courses.find((c) => c.city === 'Melbourne');
    assert.equal(plan.courseGoalResult(goals, 'Melbourne', 14400, null).reason, plan.tooFewEditions(melbourne.editions, goals.min_editions)); ok();
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
  assert.match(html, /class="tool-workspace"[\s\S]*class="tool-inputs"[\s\S]*class="tool-results"><p class="sr-only" aria-live="polite">/); ok();
  assert.match(html, /Per mile[\s\S]*9:09[\s\S]*Per km[\s\S]*5:41/, '4:00 even pace: 9:09/mi and 5:41/km, miles first'); ok();
  assert.deepEqual([...html.matchAll(/class="plan-mats-k">[^<]*(?:<small>[^<]*<\/small>)?<\/span><b>([^<]+)<\/b>/g)].map((m) => m[1]),
    ['28:26', '56:53', '1:25:19', '1:53:45', '2:22:12', '2:50:38', '3:19:05', '3:47:31', '4:00:00'], 'Even-pace time at each mat for 4:00 (14,400 s ÷ 42.195 km × each mat)'); ok();
  // The tracker looks for sections once per page view, so all three are mounted from the start; the comparison is hidden until its data shows.
  assert.deepEqual([...html.matchAll(/<div data-track-section="([^"]+)"( hidden="")?>/g)].map((m) => m[1] + (m[2] ? ' (hidden)' : '')), ['result', 'comparison (hidden)', 'pace-band']); ok();
  assert.match(html, /class="tool-share share-bar no-print"><button[^>]*>Copy link<\/button><button[^>]*>Print wristband strips<\/button><button[^>]*>Print this plan<\/button>/, 'Copy link and both print buttons share one row'); ok();
  assert.match(html, /\/tools\/pace-band\?goal=4:00"[\s\S]*\/tools\/weather-match\?goal=4:00:00[\s\S]*\/tools\/projector\?target=4:00:00&amp;t=none[\s\S]*\/analyses\/pacing-pattern\?goal=240[\s\S]*\/analyses\/hills-and-pacing\?goal=240[\s\S]*\/tools\/split-check"/, 'Links carry the goal in each target\'s own form'); ok();
  assert.doesNotMatch(html, /your chance|the wall|arithmetic|adjusted/i); ok();
  const planSource = sourceOf('components/tools/RacePlan.tsx');
  assert.match(planSource, /useQueryState\(DEFAULTS\)/); assert.match(planSource, /const DEFAULTS = \{ course: 'all', goal: '4:00' \};/, 'The planner keeps exactly course and goal in its address'); checks += 2;
  assert.doesNotMatch(planSource, /trackAnalytics|posthog/i, 'The planner sends no event of its own'); ok();
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

console.log(`Tool libraries passed ${checks} checks: time parsing and keypad input (the dot key types a colon in race-time fields; every time reader takes dots and commas), pace calculations and splits, pace charts by goal time and goal-page links, result handoffs to the planner, the pace band and the pacing-pattern analysis, the race planner (its goal, the course-goal row it shows, recounted from the runner records, and the rendered plan), goal-page sentences, published predictor and heat formulas, qualifying standards with official worked examples and age rules, sustained-slowdown reading, the pacing-type classifier, and the cohort note, which says only the tools with Pace Notes data start from the screened finishes.`);
