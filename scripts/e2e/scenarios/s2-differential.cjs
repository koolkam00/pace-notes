'use strict';
// S2: every tool, the analyses and the stories' calculators, each driven twice in fresh visitors with two different
// sets of values (A and B), typed and supplied in the address. Whatever a recording holds that differs between A and B
// depends on what the visitor typed or loaded, so it must be inside a masked or left-out region (I9), and none of a
// run's own values may appear anywhere in its PostHog traffic unless the other run, which never used them, shows them
// too (they are then page content, not the visitor's input).
const fs = require('node:fs');
const path = require('node:path');
const { SITE, wiggle, type } = require('../browser.cjs');

const V = {
  A: { marathon: '3:17:43', hm: '3:17', tenK: '41:09', half: '1:38:21', dob: '1983-02-11', race: '2026-04-20', mat25: '2:01:37', mat20: '1:37:29', start: '9:41 am', label: 'Zebulon Quixote', temp: '57', dew: '43', drop: '137', weekly: '37', tp: '8:47', prev: '3:26', fiveK: '23:47', goalMin: '197', goalIdx: 5, ageIdx: 5, genderIdx: 1,
    splits: ['0:23:11', '0:46:33', '1:09:57', '1:33:29', '1:57:14', '2:21:41', '2:46:02', '3:10:47', '3:21:19'], text: 'Zebulon Quixote born 1983-02-11 bib 4471 zebulon.quixote@example.com' },
  B: { marathon: '3:52:19', hm: '3:52', tenK: '47:28', half: '1:51:06', dob: '1971-09-27', race: '2026-10-11', mat25: '2:24:52', mat20: '1:55:40', start: '8:27 am', label: 'Wilhelmina Ostrova', temp: '71', dew: '61', drop: '263', weekly: '23', tp: '10:13', prev: '4:01', fiveK: '27:14', goalMin: '232', goalIdx: 9, ageIdx: 8, genderIdx: 2,
    splits: ['0:26:02', '0:52:14', '1:18:39', '1:45:07', '2:12:01', '2:39:22', '3:07:15', '3:36:40', '3:49:58'], text: 'Wilhelmina Ostrova born 1971-09-27 bib 8823 w.ostrova@example.org' },
};
// The values of each set, matched as whole tokens: not inside a longer number, time, date, timestamp or random ID.
const NEEDLES = Object.fromEntries(Object.entries(V).map(([id, v]) => [id, [...new Set([v.marathon, v.hm, v.tenK, v.half, v.dob, v.dob.slice(0, 4), v.race, v.mat25, v.mat20, v.start.split(' ')[0], ...v.label.split(' '), v.text.match(/bib (\d+)/)[1], v.text.split('@')[1], v.prev, v.fiveK, v.goalMin, ...v.splits, v.tp])]
  .map(value => new RegExp('(^|[^0-9a-z:.-])' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^0-9a-z:.-])', 'i'))]));

const label = (page, text, exact = true) => page.getByLabel(text, { exact }).first();
// Optional fields sit in a closed <details> until the visitor opens it.
const open = (page, selector) => page.locator(selector).evaluateAll(all => all.forEach(details => { details.open = true; }));
async function step(log, name, fn) { try { await fn(); log.push('ok ' + name); } catch (error) { log.push('FAIL ' + name + ': ' + String(error).split('\n')[0].slice(0, 160)); } }

const CASES = {
  'pace-calculator': { path: '/tools/pace-calculator', async drive(page, v, log) { await step(log, 'time', () => type(page, label(page, 'Time'), v.marathon)); } },
  'pace-calculator-url': { path: v => `/tools/pace-calculator?t=${v.marathon}&split=5k` },
  'pace-band': { path: '/tools/pace-band', async drive(page, v, log) {
    await step(log, 'goal', () => type(page, label(page, 'Goal finish time'), v.hm));
    await step(log, 'gender', () => page.locator('[aria-labelledby="pace-band-gender"] button').nth(v.genderIdx).click());
  } },
  'pace-band-url': { path: v => `/tools/pace-band?goal=${v.hm}&g=${v.genderIdx === 1 ? 'women' : 'men'}&course=boston` },
  // The planner's chosen course is the visitor's too: each run picks its own, and neither run's course may be sent. Both
  // courses are ones the page never names by itself (the method note names screened and duplicated editions' courses).
  'plan': { path: '/tools/plan', needles: { A: ['Berlin'], B: ['Rotterdam'] }, async drive(page, v, log) {
    await step(log, 'course', () => page.selectOption('#plan-course', v === V.A ? 'berlin' : 'rotterdam'));
    await step(log, 'goal', () => type(page, label(page, 'Goal finish time'), v.hm));
  } },
  'plan-url': { path: v => `/tools/plan?course=${v === V.A ? 'berlin' : 'rotterdam'}&goal=${v.hm}`, needles: { A: ['Berlin'], B: ['Rotterdam'] } },
  'course-chooser': { path: '/tools/course-chooser', async drive(page, v, log) {
    await step(log, 'goal', () => type(page, label(page, 'Goal finish time'), v.hm));
    await step(log, 'sort', () => page.selectOption('#course-chooser-sort', { index: 1 }));
  } },
  'course-chooser-url': { path: v => `/tools/course-chooser?goal=${v.hm}` },
  'split-check': { path: '/tools/split-check', async drive(page, v, log) {
    // Typed with a keypad's dots (0.23.11): each box turns them into colons as they are typed (S1 checks the box).
    for (let i = 0; i < 9; i++) await step(log, 't' + i, () => type(page, `input[id$="-t${i}"]`, v.splits[i].replace(/:/g, '.')));
    // The comparison's course and gender wait in one disclosure under the times.
    await step(log, 'compare options', () => open(page, 'details.split-check-compare-options'));
    await step(log, 'gender', () => page.locator('.ph-no-capture[role=group] button').nth(v.genderIdx).click());
  } },
  'split-check-paste': { path: '/tools/split-check', async drive(page, v, log) {
    await step(log, 'open', async () => { const summary = page.locator('.split-check-paste summary'); if (await summary.count()) await summary.click(); });
    await step(log, 'paste', async () => { await page.locator('textarea[id$="-paste"]').fill(`${v.label}\n` + ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'].map((k, i) => `${k} ${v.splits[i]}`).join('\n')); await page.keyboard.press('Tab'); });
  } },
  'split-check-url': { path: v => `/tools/split-check?s=${v.splits.join(',')}&course=boston&g=${v.genderIdx === 1 ? 'women' : 'men'}` },
  'predictor': { path: '/tools/predictor', async drive(page, v, log) {
    await step(log, 't1', () => type(page, 'input[id$="-t1"]', v.half));
    await step(log, 'more', () => open(page, 'details.predictor-more'));
    await step(log, 't2', () => type(page, 'input[id$="-t2"]', v.tenK));
    await step(log, 'wk', () => type(page, 'input[id$="-wk"]', v.weekly));
    // A pace typed with a keypad's dot (8.47), shown as 8:47 once the field is left.
    await step(log, 'tp', () => type(page, label(page, /Average training pace/, false), v.tp.replace(':', '.')));
  } },
  'predictor-url': { path: v => `/tools/predictor?t=${v.half}&d=half&t2=${v.tenK}&d2=10k&wk=${v.weekly}&tp=${v.tp}` },
  // The result's next step opens the pace band with a time worked out from the typed one in its address: that page must
  // record it no more than a time typed there. (One row since the redesign's section 00; the pacing-pattern link went.)
  'predictor-handoff': { path: '/tools/predictor', async drive(page, v, log) {
    await step(log, 't1', () => type(page, 'input[id$="-t1"]', v.half));
    await page.waitForTimeout(1200);
    await step(log, 'pace band', async () => { await page.locator('.tool-handoffs a:has-text("Turn this into a pace band")').click(); await page.waitForURL(/\/tools\/pace-band\?goal=\d:\d\d$/); });
    await page.waitForTimeout(2000); await wiggle(page, 5);
  } },
  'weather-match': { path: '/tools/weather-match', async drive(page, v, log) {
    await step(log, 'temp', () => type(page, '#weather-match-temp', v.temp));
    // The dew point waits in the disclosure with the race (it feeds the published-research estimates only).
    await step(log, 'more', () => open(page, 'details.weather-match-more'));
    await step(log, 'dew', () => type(page, '#weather-match-hum', v.dew));
    await step(log, 'goal', () => type(page, label(page, 'Goal finish time'), v.marathon));
  } },
  'weather-match-url': { path: v => `/tools/weather-match?temp=${v.temp}&dew=${v.dew}&goal=${v.marathon}` },
  'qualifying': { path: '/tools/qualifying', reload: true, async drive(page, v, log) {
    await step(log, 'chip', () => type(page, label(page, 'Chip (net) time'), v.marathon));
    await step(log, 'race', () => label(page, 'Race date').fill(v.race));
    await step(log, 'dob', () => label(page, 'Date of birth').fill(v.dob));
    await step(log, 'more', () => open(page, 'details.qualifying-more'));
    await step(log, 'drop', () => type(page, label(page, /Course net drop/, false), v.drop));
    await step(log, 'division', () => page.locator('.ph-no-capture button').nth(v.genderIdx).click());
    await step(log, 'remember', () => label(page, 'Remember my date of birth on this device').check());
  } },
  'qualifying-url': { path: v => `/tools/qualifying?t=${v.marathon}&div=${v.genderIdx === 1 ? 'M' : 'X'}&race=${v.race}` },
  'projector': { path: '/tools/projector', reload: true, async drive(page, v, log) {
    await step(log, 'time', () => type(page, '#projector-time', v.mat25));
    await step(log, 'more', () => open(page, 'details.projector-more'));
    await step(log, 'prev', () => type(page, '#projector-prev', v.mat20));
    await step(log, 'target', () => type(page, label(page, /Target finish/, false), v.hm));
    await step(log, 'extras', () => open(page, 'details.projector-extras'));
    await step(log, 'start', () => type(page, '#projector-start', v.start));
    await step(log, 'card label', () => type(page, '#projector-card-label', v.label));
    await page.waitForTimeout(800);
    await step(log, 'save card', () => page.getByRole('button', { name: 'Save runner card' }).click());
  } },
  'projector-url': { path: v => `/tools/projector?mat=25&t=${v.mat25}&prev=${v.mat20}&target=${v.hm}:00` },
  'analysis': { path: '/analyses/pacing-pattern', async drive(page, v, log) {
    await step(log, 'time', () => type(page, label(page, 'Finish time to explore', false), v.hm));
    await step(log, 'refine', () => page.locator('.profile-refinements summary').click());
    await step(log, 'age', () => label(page, 'Age group', false).selectOption({ index: v.ageIdx }));
    await step(log, 'gender', () => label(page, 'Recorded gender', false).selectOption({ index: v.genderIdx }));
    await step(log, 'previous', () => type(page, label(page, /Earlier marathon/, false), v.prev));
    await step(log, 'submit', () => page.getByRole('button', { name: /Update comparison/ }).click());
    await page.waitForTimeout(2500); await wiggle(page, 5);
    await step(log, 'next question', () => page.locator('.analysis-pagination a').last().click());
    await page.waitForTimeout(2500); await wiggle(page, 5);
    await step(log, 'back', () => page.goBack()); await page.waitForTimeout(2000);
  } },
  'analysis-url': { path: v => `/analyses/finish-time-context?race=Boston&goal=${v.goalMin}&age=${v.ageIdx === 5 ? '40-44' : '55-59'}&gender=${v.genderIdx === 1 ? 'women' : 'men'}` },
  'analysis-start-url': { path: v => `/analyses/starting-pace?race=Boston&age=${v.ageIdx === 5 ? '40-44' : '55-59'}&gender=${v.genderIdx === 1 ? 'Women' : 'Men'}` },
  // The checkpoint inputs (an elapsed time and the latest 5K) of the archived guide, removed with /research/personalized
  // (WP8), live on the checkpoint analysis; its optional fields may sit in a closed <details>. The guide's previous
  // marathon and age group are typed by the 'analysis' case above.
  'checkpoint': { path: '/analyses/checkpoint', async drive(page, v, log) {
    await step(log, 'optional', () => open(page, 'details.guide-optional'));
    await step(log, 'elapsed', () => type(page, label(page, /Elapsed time/, false), v.mat25));
    await step(log, '5 km', () => type(page, label(page, /^(Latest|Last) /, false), v.fiveK));
  } },
  // The home page's course-and-goal form, then the planner it opens. Both courses are ones neither page names by itself
  // (the hero replay's races and the planner's method note are page content in both runs, so a needle among them could
  // never fail). The form must be masked in the recording (homeFormMasked).
  // The goal is typed with a keypad's dot (3.17), which the field turns into 3:17: neither form may be sent.
  'home': { path: '/', needles: { A: ['Helsinki', '3\\.17'], B: ['Copenhagen', '3\\.52'] }, after: homeFormMasked, async drive(page, v, log) {
    await step(log, 'course', () => page.selectOption('#home-plan-course', v === V.A ? 'helsinki' : 'copenhagen'));
    await step(log, 'goal', () => type(page, '#home-plan-goal', v.hm.replace(':', '.')));
    await step(log, 'plan your race', async () => { await page.locator('.home-plan-button').click(); await page.waitForURL(url => new URL(url).pathname === '/tools/plan'); });
    await page.waitForTimeout(1500); await wiggle(page, 5);
  } },
  // The type finder answers for its example first; its nine fields open from "Try your own splits".
  'pacing-types': { path: '/stories/pacing-types', async drive(page, v, log) {
    await step(log, 'open', () => open(page, 'details.which-try'));
    const inputs = page.locator('.which-card input');
    const n = await inputs.count();
    if (!n) log.push('FAIL no .which-card inputs');
    for (let i = 0; i < Math.min(n, 9); i++) await step(log, 'split ' + i, async () => { await inputs.nth(i).scrollIntoViewIfNeeded(); await inputs.nth(i).fill(''); await inputs.nth(i).pressSequentially(v.splits[i], { delay: 10 }); });
    await page.keyboard.press('Tab');
  } },
  'request': { path: '/request-analysis', async drive(page, v, log) {
    await step(log, 'question', () => type(page, '#analysis-question', v.text));
    await step(log, 'details', () => type(page, '#analysis-details', v.text + ' ' + v.dob));
  } },
};
const QUICK = ['pace-calculator', 'split-check-url', 'projector'];

/** The home form (`.home-plan`) in every full snapshot of the recording: there, with no unmasked text or value. */
function homeFormMasked(h, run, id) {
  let forms = 0;
  const leaks = [];
  const walk = (node, inside) => {
    if (!node || typeof node !== 'object') return;
    const here = inside || /(^|\s)home-plan(\s|$)/.test(String((node.attributes && node.attributes.class) || ''));
    if (here && !inside) forms += 1;
    if (here) {
      if (node.type === 3 && typeof node.textContent === 'string' && node.textContent.trim() && node.textContent.trim() !== '***') leaks.push('text ' + node.textContent.trim().slice(0, 40));
      for (const key of ['value', 'placeholder', 'label', 'aria-label']) {
        const value = node.attributes && node.attributes[key];
        if (typeof value === 'string' && value.trim() && value !== '***') leaks.push(`${node.tagName || ''} ${key}=${value.slice(0, 40)}`);
      }
    }
    (node.childNodes || []).forEach(child => walk(child, here));
  };
  for (const { ev } of run.rrweb()) if (ev.type === 2) walk(ev.data && ev.data.node, false);
  h.check(`${id}: the home form is in the recording, with every text and value masked`, forms > 0 && !leaks.length, { forms, leaks: leaks.slice(0, 8) });
}

const KNOWN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'known-differences.json'), 'utf8'));
const known = name => [...(KNOWN['*'] || []), ...(KNOWN[name] || [])].map(entry => new RegExp(entry.pattern));

async function drive(h, name, id) {
  const c = CASES[name], v = V[id], log = [];
  // Both runs of a case see the same variant of each running experiment (its control), so their recordings differ only
  // by what was typed: a tab's variant is drawn at random and named on <html>.
  const pinned = Object.fromEntries([...h.inspect.RUNNING].map(([key, variants]) => ['pace-notes-exp:' + key, variants[0]]));
  const run = await h.run(id, { reducedMotion: 'reduce', plant: { session: pinned } });
  const page = await run.newPage();
  await page.goto(SITE + (typeof c.path === 'function' ? c.path(v) : c.path), { waitUntil: 'load' });
  const started = await run.waitForRecording(page);
  if (c.drive) await c.drive(page, v, log);
  await page.waitForTimeout(1200);
  await wiggle(page, 6);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(250); }
  let flushed = await run.flush(page);
  if (c.reload) {
    const reloaded = Date.now();
    await page.reload({ waitUntil: 'load' });
    flushed = await run.waitForRecording(page, reloaded) && flushed;
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(250); }
    flushed = await run.flush(page) && flushed;
  }
  await run.close();
  return { run, log, started, flushed };
}

async function differential(h, name) {
  const [a, b] = await Promise.all([drive(h, name, 'A'), drive(h, name, 'B')]);
  for (const r of [a, b]) {
    const id = r === a ? 'A' : 'B';
    h.check(`${id}: every input was filled`, !r.log.some(line => line.startsWith('FAIL')), r.log.filter(line => line.startsWith('FAIL')));
    h.check(`${id}: recorded before and after the inputs`, r.started && r.flushed, { started: r.started, flushed: r.flushed });
  }
  // I4 for the run's own values, unless the other run (which never used them) shows the same string. A case can add values
  // of its own (the planner's course).
  for (const [mine, other, id] of [[a, b, 'A'], [b, a, 'B']]) {
    const own = (CASES[name].needles?.[id] || []).map(value => new RegExp('(^|[^0-9a-z:.-])' + value + '($|[^0-9a-z:.-])', 'i'));
    const needles = [...NEEDLES[id], ...own];
    const hits = h.inspect.search(mine.run, needles);
    const content = new Set(h.inspect.search(other.run, needles).map(hit => hit.needle));
    const leaks = hits.filter(hit => !content.has(hit.needle));
    h.check(`I4 ${id}: none of its values in PostHog traffic`, !leaks.length, leaks.slice(0, 6).map(hit => `${hit.needle} in ${hit.at}: …${hit.excerpt.slice(0, 160)}…`));
    // A case's own value that the other run shows too would be cleared as page content above, so its check could never
    // fail: the case must pick a value the page does not name by itself.
    if (own.length) h.check(`I4 ${id}: the case's own values are not page content`, !own.some(needle => content.has(String(needle))), own.map(String).filter(needle => content.has(needle)));
  }
  if (CASES[name].after) for (const [r, id] of [[a, 'A'], [b, 'B']]) CASES[name].after(h, r.run, id);
  // I9
  const allowed = known(name);
  const { onlyA, onlyB } = h.inspect.diffStrings(a.run, b.run);
  const unexplained = [...onlyA.map(s => 'A ' + s), ...onlyB.map(s => 'B ' + s)].filter(s => !allowed.some(pattern => pattern.test(s.slice(2))));
  h.check('I9 recordings differ only as known-differences.json allows', !unexplained.length, unexplained.slice(0, 12).map(s => s.slice(0, 240)));
}

// Every tool in lib/tools/registry.ts is typed into: a new tool needs its case here.
function everyTool(h) {
  const { TOOLS } = require(path.join(h.inspect.ROOT, 'lib/tools/registry.ts'));
  const missing = TOOLS.filter(tool => !CASES[tool.slug] || !CASES[tool.slug].drive || CASES[tool.slug].path !== '/tools/' + tool.slug);
  h.check('every tool in lib/tools/registry.ts has a case that types into it', TOOLS.length && !missing.length, missing.map(tool => '/tools/' + tool.slug));
}

module.exports = {
  id: 'S2',
  title: 'Every tool, analysis and calculator with two sets of values (typed and in the address)',
  jobs: ({ quick }) => [
    { name: 'every tool has a case', weight: 1, run: async h => everyTool(h) },
    ...Object.keys(CASES).filter(name => !quick || QUICK.includes(name)).map(name => ({ name, weight: CASES[name].reload ? 32 : name === 'analysis' || name === 'predictor-handoff' ? 25 : 18, run: h => differential(h, name) })),
  ],
};
