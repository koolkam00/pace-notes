'use strict';
// S3: the runner journey. A recorded page, then the runner search (never recorded), a profile, an analysis opened
// with the profile's handoff marker and the race's goal (the profile links only to the split check since October 18,
// 2026), and the profile's split check link (runner handoff pages: never recorded, also after a filter change, a reload
// or an onward link that keeps a query), then the site's navigation, which ends the handoff, and Back and Forward
// through the history. I5 checks every rrweb event against the page open when it was recorded; the runner's name, record IDs,
// times and the values in the handoff links are searched for in all PostHog traffic. Its race report is opened too:
// Save image (the download intercepted), Share (navigator.share stubbed) and Copy link (exactly s, course and via), all in
// the share sheet the report's Share button opens, and a
// print of one page, then the copied link in a second tab, where /report shows the times' blocks only. It runs with the
// project's URL blocklist in the mock (as deployed) and without it (the site's own rules alone). A third visitor opens a
// real profile with copy-edition records (lib/duplicate-editions.ts) and checks they reach no summary, comparison, link
// or race report button.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { SITE, wiggle, waitFor } = require('../browser.cjs');
// REPORT_IMAGE_NAME in lib/report.ts (scripts/verify-report.cjs checks it there): no course, year or time in it.
const REPORT_IMAGE_NAME = 'pace-notes-race-report.png';

const SURNAME = 'Johnson';

// Name search as lib/runner-search.ts does it (normalizeRunnerName, runnerNameMatches, runnerShardKey).
const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const nameMatches = (name, query) => {
  const words = normalize(name).split(' '), tokens = normalize(query).split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every(token => words.some(word => Array.from(token).length < 3 ? word === token : word.startsWith(token)));
};
const shardKey = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 3);

/**
 * A real candidate profile holding exactly one record in each of a copy edition's group (Chicago 2018, 2019 and 2024
 * in the adopted release: the two copies and the field they repeat), all eligible, under one name that the search
 * finds for this profile alone. It is looked up in the published shards when the check runs, so no runner's name is
 * written in the repository; the checks and notes below never print it. Null when the release has no copy editions.
 */
function copyEditionProfile(out) {
  const data = file => fs.readFileSync(path.join(out, 'data', file));
  const runners = JSON.parse(data('runners/manifest.json'));
  const screen = JSON.parse(data('insights/manifest.json')).duplicate_edition_screen ?? [];
  if (!screen.length) return null;
  const { city, duplicate_of: source } = screen[0];
  const copies = screen.filter(entry => entry.city === city && entry.duplicate_of === source);
  const years = [...copies.map(entry => entry.year), source];
  const wanted = new Set(years.map(year => runners.editions.findIndex(edition => edition.city === city && edition.year === year)));
  const shard = file => JSON.parse(zlib.gunzipSync(data('runners/' + file)));
  for (const file of Object.keys(runners.shards).filter(file => file.startsWith('profiles/')).sort()) {
    for (const profile of shard(file).profiles) {
      const races = profile.races, query = normalize(races[0].name || '');
      if (races.length !== wanted.size || new Set(races.map(race => race.edition)).size !== wanted.size || !races.every(race => race.eligible && wanted.has(race.edition))) continue;
      if (!/^[a-z]{3,}(?: [a-z]{3,})+$/.test(query) || !races.every(race => normalize(race.name) === query)) continue;
      const longest = query.split(' ').reduce((best, token) => token.length > best.length ? token : best);
      const index = `index/${shardKey(longest.slice(0, 3))}.json.gz`;
      if (!runners.shards[index]) continue;
      const found = new Set(shard(index).rows.filter(row => nameMatches(row[0], query)).map(row => row[1]));
      if (found.size === 1 && found.has(profile.id)) return { query, records: races.map(race => race.id), city, source, copies };
    }
  }
  return null;
}

// S3 copy editions: that profile on /runners, every record selected. The copies say "Recorded times only" and reach no
// summary, focus option, comparison or split-check link; one eligible race is analysed. Since October 16, 2026 the
// copy-edition sentence (why the records repeat another field) is on /methodology only, never on /runners.
async function copyEditionJourney(h) {
  const found = copyEditionProfile(h.out);
  if (!found) { h.note('this release has no copy editions with a matching candidate profile: nothing to check'); return; }
  const { query, records, city, source, copies } = found;
  const run = await h.run('copy-edition profile', {
    needles: [query, ...query.split(' ').filter(word => word.length > 3), ...records.map(id => new RegExp(`(^|[^0-9a-f-])${id}($|[^0-9a-f-])`))],
  });
  const page = await run.newPage();
  await page.goto(SITE + '/stories', { waitUntil: 'load' });
  h.check('the recorder starts on /stories', await run.waitForRecording(page));
  await page.click('nav.main-nav a[href="/runners"]');
  await page.waitForURL('**/runners');
  await page.waitForSelector('#runner-name:not([disabled])', { timeout: 30000 });
  await page.locator('#runner-name').fill(query);
  await page.click('.runner-search-form button[type="submit"]');
  await page.waitForSelector('.runner-matches li', { timeout: 30000 });
  h.check('the name finds one record group', await page.locator('.runner-match').count() === 1);
  await page.locator('.runner-match').first().click();
  await page.waitForSelector('.runner-profile', { timeout: 30000 });
  const labels = Object.fromEntries(await page.$$eval('#runner-profile .runner-race', items => items.map(item => [item.querySelector('strong')?.textContent, item.querySelector('.runner-eligible, .runner-ineligible')?.textContent])));
  const expected = Object.fromEntries([...copies.map(copy => [`${city} ${copy.year}`, 'Recorded times only']), [`${city} ${source}`, 'Pacing analysis']]);
  h.check('each copy record says "Recorded times only"; the field it repeats has pacing analysis', JSON.stringify(labels, Object.keys(expected).sort()) === JSON.stringify(expected, Object.keys(expected).sort()), labels);
  const reasons = Object.fromEntries(await page.$$eval('#runner-profile .runner-race', items => items.map(item => [item.querySelector('strong')?.textContent, [...item.querySelectorAll('label small, .runner-raw p')].map(small => small.textContent).filter(text => text.startsWith('This edition’s records') || text.includes('largely repeat')).length])));
  const because = Object.fromEntries([...copies.map(copy => [`${city} ${copy.year}`, 0]), [`${city} ${source}`, 0]]);
  h.check('no record in the profile explains the copy editions (that is /methodology\'s)', JSON.stringify(reasons, Object.keys(because).sort()) === JSON.stringify(because, Object.keys(because).sort()), reasons);
  const boxes = page.locator('.runner-races input[type="checkbox"]');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  h.check('the selection panel adds no line for a copy record', await page.locator('.runner-selection li small').count() === 0);
  await page.click('.runner-selection-actions .button-primary');
  await page.waitForSelector('.runner-context', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const view = await page.evaluate(() => {
    const analysis = document.querySelector('.runner-analysis'), context = analysis?.querySelector('.runner-context');
    const eligible = [...(analysis?.querySelectorAll('table') || [])].find(table => table.caption?.textContent === 'All eligible races you selected');
    return {
      heading: analysis?.querySelector('h2')?.textContent, rows: eligible ? eligible.tBodies[0].rows.length : null,
      card: !!analysis?.querySelector('.runner-numbers'),
      focus: [...(context?.querySelector('select')?.options || [])].map(option => option.textContent.split(' · ')[0]),
      multi: !!context?.querySelector('.rc-multi'), split: [...(context?.querySelectorAll('a') || [])].filter(a => a.textContent.includes('split check')).length,
      text: document.body.innerText, contextText: context?.innerText || '',
    };
  });
  h.check('one eligible race: one heading, the race and its finish, and no summary card or one-row table', (view.heading ?? '').startsWith(`${city} ${source}, `) && view.rows === null && !view.card, { heading: view.heading, rows: view.rows, card: view.card });
  for (const copy of copies) {
    const sentence = `${city} ${copy.year}'s records largely repeat the ${city} ${source} field (${copy.identical_nine_time_twins.toLocaleString('en-US')} of its ${copy.eligible_removed.toLocaleString('en-US')} finishes`;
    h.check(`${city} ${copy.year}: its copy sentence is not on /runners`, view.text.split(sentence).length - 1 === 0 && !view.text.includes('largely repeat'), view.text.split(sentence).length - 1);
    h.check(`${city} ${copy.year}: not in the race context view`, !view.contextText.includes(`${city} ${copy.year}`));
  }
  h.check('one focus option, no side-by-side comparison and one split-check link', JSON.stringify(view.focus) === JSON.stringify([`${city} ${source}`]) && !view.multi && view.split === 1, { focus: view.focus, multi: view.multi, split: view.split });
  // One race report button, for the field the copies repeat; with the copies alone selected, none.
  const reports = await page.evaluate(() => ({ buttons: [...document.querySelectorAll('.rc-report button')].filter(b => b.textContent.includes('Make a race report')).length, title: document.querySelector('.rc-report h3')?.textContent || '' }));
  h.check('one race report button, for the eligible race only', reports.buttons === 1 && reports.title.startsWith(`${city} ${source}`) && !copies.some(copy => reports.title.includes(String(copy.year))), reports);
  await page.locator('#runner-profile .runner-race', { has: page.locator('strong', { hasText: `${city} ${source}` }) }).locator('input[type="checkbox"]').uncheck();
  await page.click('.runner-selection-actions .button-primary');
  await page.waitForSelector('.runner-analysis', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const copiesOnly = await page.evaluate(() => ({ context: !!document.querySelector('.runner-context'), report: [...document.querySelectorAll('button')].some(b => b.textContent.includes('Make a race report')), text: document.body.innerText }));
  h.check('the copy editions alone: no race report button and no context view', !copiesOnly.context && !copiesOnly.report, { context: copiesOnly.context, report: copiesOnly.report });
  for (const copy of copies) h.check(`${city} ${copy.year}: still no copy sentence, with the copies alone`, copiesOnly.text.split(`${city} ${copy.year}'s records largely repeat`).length - 1 === 0);
  await wiggle(page, 4);
  await run.flush(page);
  await run.close();
  h.inspect.invariants(run);
  const runnerPages = [...run.openWhileRecording].filter(page => h.inspect.NEVER_RECORDED(page));
  h.check('/stories was recorded and nothing while /runners was open', run.recordedPages.has('/stories') && !runnerPages.length, { recorded: [...run.recordedPages.keys()], runnerPages });
  h.note(`a ${city} profile with ${records.length} records (${[...copies.map(copy => copy.year), source].join(', ')}); its name and record IDs were searched for in all PostHog traffic`);
}

/**
 * The focus race's report on /runners: opened in place, then Save image (a 1080 × 1350 PNG named without the race), Share
 * (navigator.share stubbed, with a file), Copy link (exactly s, course and via) and a print that fits one Letter page;
 * then the copied link in a second tab, which shows the blocks read from the times and nothing from the record.
 */
async function raceReport(h, run, page, step) {
  const out = { link: null, year: null };
  await step('race report', async () => {
    await page.locator('.rc-report button', { hasText: 'Make a race report' }).click();
    // The edition's lines print with the report (on screen the tabs above say them): attached, not shown.
    await page.waitForSelector('.rc-report .race-report-record dl, .rc-report .race-report-record .tool-state', { timeout: 30000, state: 'attached' });
    await page.waitForSelector('.rc-report .race-report-table, .rc-report .race-report-block p strong', { timeout: 30000 }).catch(() => {});
    h.check('the report, opened by a press, takes focus at its title', await page.evaluate(() => document.activeElement?.classList.contains('race-report-title') ?? false));
  });
  const race = await page.locator('.rc-report .race-report-race').textContent().catch(() => '');
  out.year = (/\b(?:19|20)\d\d\b/.exec(race || '') || [])[0] || null;
  await step('save image', async () => {
    // Save image, Share and Copy link sit in the share sheet that the report's Share button opens.
    await page.locator('.rc-report .race-report-actions .race-report-share-open').click();
    await page.waitForSelector('.rc-report .race-report-sheet.is-open [data-report-save]', { timeout: 15000 });
    await page.waitForTimeout(700);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('.rc-report .race-report-sheet [data-report-save]').click()]);
    const bytes = fs.readFileSync(await download.path());
    h.check('Save image downloads a 1080 × 1350 PNG named without the race', download.suggestedFilename() === REPORT_IMAGE_NAME && bytes.readUInt32BE(0) === 0x89504E47 && bytes.readUInt32BE(16) === 1080 && bytes.readUInt32BE(20) === 1350,
      { name: download.suggestedFilename(), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
  });
  await step('share', async () => {
    await page.evaluate(() => {
      window.__e2eShared = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => Boolean(data && data.files && data.files.length) });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__e2eShared.push({ files: (data.files || []).map(f => [f.name, f.type, f.size > 0]), url: data.url || null }); } });
    });
    await page.locator('.rc-report .race-report-sheet .race-report-share-native').click();
    await waitFor(() => page.evaluate(() => window.__e2eShared.length > 0), 15000, 200);
    const shared = await page.evaluate(() => window.__e2eShared);
    h.check('Share hands the share sheet the image file, and no link', JSON.stringify(shared) === JSON.stringify([{ files: [[REPORT_IMAGE_NAME, 'image/png', true]], url: null }]), shared);
  });
  await step('copy link', async () => {
    // The browser's clipboard is shared by the jobs running at once, so the copied text is caught in the page instead.
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__e2eCopied = text; } } }); });
    await page.locator('.rc-report .race-report-sheet button', { hasText: 'Copy link' }).click();
    await page.waitForTimeout(400);
    // Close the sheet (Escape), as a reader would before printing.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    out.link = await page.evaluate(() => window.__e2eCopied || '');
    const url = new URL(out.link);
    h.check('the copied link is /report with exactly s, course and via=runner', url.origin === SITE && url.pathname === '/report' && JSON.stringify([...url.searchParams.keys()]) === '["s","course","via"]'
      && url.searchParams.get('via') === 'runner' && url.searchParams.get('s').split(',').length === 9, out.link.replace(/s=[^&]*/, 's=…'));
  });
  await step('print', async () => {
    // window.print would open the dialog; the button marks what prints first. page.pdf then prints it (and sends afterprint).
    await page.evaluate(() => { window.print = () => {}; });
    await page.locator('.rc-report .race-report-actions button', { hasText: 'Print or save as PDF' }).click();
    const pdf = (await page.pdf({ format: 'Letter', printBackground: true })).toString('latin1');
    const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
    h.check('the printed report, with this edition\'s blocks, fits one Letter page', pages === 1, pages);
  });
  if (out.link) {
    await step('the copied link in a second tab', async () => {
      const tab = await run.newPage();
      await tab.goto(out.link, { waitUntil: 'load' });
      await tab.waitForSelector('.race-report-foot', { timeout: 30000 });
      await tab.waitForTimeout(1500);
      const shown = await tab.evaluate(() => ({ record: !!document.querySelector('.race-report-record'), title: document.querySelector('.race-report-race')?.textContent || '' }));
      h.check('/report from the copied link shows the times\' blocks only: no edition comparison and no year', !shown.record && !/\b(?:19|20)\d\d\b/.test(shown.title), shown);
      await wiggle(tab, 6);
      await tab.waitForTimeout(4000);
      await run.closePage(tab);
    });
  }
  return out;
}

async function journey(h, blocklist) {
  const run = await h.run(blocklist ? 'with the project blocklist' : 'site rules alone', { blocklist });
  const page = await run.newPage();
  const log = [];
  const step = async (name, fn) => { try { await fn(); log.push('ok ' + name); } catch (error) { log.push(`FAIL ${name}: ${String(error).split('\n')[0].slice(0, 160)}`); } };
  const settle = async (ms) => { await page.waitForTimeout(ms); await wiggle(page, 6); await page.mouse.wheel(0, 900); await page.waitForTimeout(300); await page.mouse.wheel(0, -900); await page.waitForTimeout(300); };
  const path = () => new URL(page.url()).pathname;
  const flag = () => page.evaluate(() => { try { return sessionStorage.getItem('pace-notes-runner-handoff'); } catch (error) { return 'unreadable'; } });
  const openProfile = async () => {
    await page.waitForSelector('#runner-name:not([disabled])', { timeout: 30000 });
    await page.locator('#runner-name').fill('');
    await page.locator('#runner-name').pressSequentially(SURNAME, { delay: 20 });
    await page.click('button[type="submit"]');
    await page.waitForSelector('.runner-matches li', { timeout: 30000 });
    await page.locator('.runner-match').first().click();
    await page.waitForSelector('.runner-profile', { timeout: 30000 });
    const boxes = page.locator('.runner-races input[type="checkbox"]');
    for (let i = 0; i < Math.min(await boxes.count(), 3); i++) await boxes.nth(i).check();
    await page.click('.runner-selection-actions .button-primary');
    await page.waitForSelector('.runner-context', { timeout: 30000 });
    await page.waitForTimeout(1500);
  };
  const harvest = () => page.evaluate(() => {
    const text = ['#runner-profile', '.runner-selection', '.runner-context'].map(s => document.querySelector(s)?.innerText || '').join('\n');
    const names = [...document.querySelectorAll('.runner-match strong')].map(n => n.textContent.trim()).filter(Boolean).slice(0, 3);
    // Record IDs no longer show in the view's visible copy (October 18, 2026): they are in each record's closed
    // disclosure, the selection's remove buttons and, where two races would read the same, a select option.
    const held = ['#runner-profile', '.runner-selection', '.runner-context'].map(s => document.querySelector(s)?.textContent || '').join('\n')
      + '\n' + [...document.querySelectorAll('.runner-selection [aria-label]')].map(e => e.getAttribute('aria-label')).join('\n');
    const ids = [...new Set([...held.matchAll(/record (\d{3,})/gi)].map(m => m[1]))];
    const times = [...new Set([...text.matchAll(/\b\d:\d\d:\d\d\b/g)].map(m => m[0]))].slice(0, 30);
    const links = [...document.querySelectorAll('.runner-context a')].map(a => a.getAttribute('href')).filter(href => href && href.includes('?'));
    return { names, ids, times, links };
  });

  await page.goto(SITE + '/stories', { waitUntil: 'load' });
  h.check('the recorder starts on /stories', await run.waitForRecording(page));
  await settle(1500);
  await step('runners', async () => { await page.click('nav.main-nav a[href="/runners"]'); await page.waitForURL('**/runners'); });
  await step('profile', openProfile);
  const found = await harvest().catch(() => ({ names: [], ids: [], times: [], links: [] }));
  h.check('a profile with the runner\'s name, record IDs, times and handoff links opened', found.names.length && found.ids.length && found.times.length && found.links.length,
    { names: found.names.length, ids: found.ids.length, times: found.times.length, links: found.links.length });
  // The runner's details and the values in the profile's links: none may reach PostHog. Times are searched for on their
  // own; a race, course, age group or gender is page content anywhere, so only its query form (`&course=boston`).
  const linked = found.links.flatMap(href => [...new URL(href, SITE).searchParams].filter(([key]) => key !== 'via' && key !== 'units')
    .flatMap(([key, value]) => /\d:\d\d/.test(value) ? value.split(',') : [new RegExp(`[?&]${key}=${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(&|$)`, 'i')]));
  run.options.needles = [...found.names, ...found.names.flatMap(name => name.split(/\s+/).filter(word => word.length > 3)),
    ...found.ids.map(id => new RegExp(`(^|[^0-9a-f-])${id}($|[^0-9a-f-])`)), ...found.times, ...linked];
  await wiggle(page, 6);
  const report = await raceReport(h, run, page, step);
  if (report.link) {
    // Its times and its race's year must reach no event or address either (recordings are I5's: none on these pages).
    run.options.needles.push(...new URL(report.link).searchParams.get('s').split(','));
    if (report.year) run.options.needles.push({ needle: new RegExp(`(^|[^0-9A-Za-z.:+-])${report.year}($|[^0-9A-Za-z.:+-])`), allowAt: /\$snapshot_data/ });
  }

  // The race's finish, to the minute, as a goal (what the profile's analysis link carried until October 18, 2026).
  const splits = found.links.map(href => new URL(href, SITE).searchParams.get('s')).find(Boolean)?.split(',') ?? [];
  const [hh, mm, ss] = (splits[splits.length - 1] ?? '').split(':').map(Number);
  const goal = Math.round((hh * 3600 + mm * 60 + (ss || 0)) / 60);
  h.check('the profile\'s split check link gives the race\'s finish', Number.isFinite(goal) && goal > 90, splits);
  run.options.needles.push(new RegExp(`[?&]goal=${goal}(&|$)`));
  await step('analysis with the handoff marker', async () => { await page.goto(`${SITE}/analyses/pacing-pattern?goal=${goal}&age=all&gender=all&via=runner`, { waitUntil: 'load' }); });
  await settle(3000);
  await step('filter change (the marker is dropped, the query kept)', async () => { await page.locator('.profile-refinements summary').click(); await page.getByLabel('Age group', { exact: false }).first().selectOption({ index: 4 }); await page.getByRole('button', { name: /Update comparison/ }).click(); });
  await settle(3000);
  await step('reload', () => page.reload({ waitUntil: 'load' }));
  await settle(9000); // longer than the recorder's start delay after a full load
  h.check('the handoff flag survives the reload', await flag() === '1');
  await step('next question', async () => { const before = path(); await page.locator('.analysis-pagination a').last().click(); await page.waitForURL(url => new URL(url).pathname !== before); });
  await settle(3000);
  await step('runners again', async () => { await page.click('nav.main-nav a[href="/runners"]'); await page.waitForURL('**/runners'); });
  await step('profile again', openProfile);
  await step('split check link (handoff)', async () => { await page.locator('.runner-context a', { hasText: 'Read this race in the split check' }).first().click(); await page.waitForURL('**/tools/split-check**'); });
  await settle(3000);
  // Its race report link keeps the marker and never carries g, nor does the report it opens.
  await step('the handoff split check\'s race report', async () => {
    const href = await page.locator('a', { hasText: 'Make a race report' }).first().getAttribute('href');
    const keys = [...new URL(href, SITE).searchParams.keys()];
    h.check('the handoff split check\'s report link carries s, course and via=runner, never g', keys.includes('s') && keys.includes('via') && !keys.includes('g') && new URL(href, SITE).searchParams.get('via') === 'runner', keys);
    await page.locator('a', { hasText: 'Make a race report' }).first().click();
    await page.waitForURL('**/report?**');
    const address = new URL(page.url());
    h.check('the report opened from it keeps via=runner and has no g', address.searchParams.get('via') === 'runner' && !address.searchParams.has('g'), [...address.searchParams.keys()]);
    await page.waitForSelector('.race-report-foot', { timeout: 30000 });
    await page.goBack();
    await page.waitForURL('**/tools/split-check**');
  });
  await settle(2000);
  const onward = await page.evaluate(() => [...document.querySelectorAll('a[href^="/tools/"], a[href^="/analyses/"]')].map(a => a.getAttribute('href')).filter(href => href.includes('?') && !href.includes('split-check')));
  // Since critic round 4 (October 18, 2026) the split check has one next step, the pace band. Its link keeps the goal
  // and course in the query, so it continues the handoff; it is reloaded, and is the query page Back returns to after
  // the handoff ends.
  const ONWARD = [['pace band', /^\/tools\/pace-band/]];
  const last = ONWARD[ONWARD.length - 1];
  for (const [key, pattern] of ONWARD) {
    const href = onward.find(link => pattern.test(link));
    if (!h.check(`the split check links on to the ${key} with a query`, href, onward)) continue;
    await step('onward ' + key, async () => { await page.locator(`a[href="${href}"]`).first().click(); await page.waitForURL(url => pattern.test(new URL(url).pathname)); });
    await settle(2500);
    if (key === last[0]) { await step('reload ' + key, () => page.reload({ waitUntil: 'load' })); await settle(9000); }
    else { await step('back to the split check', async () => { await page.goBack(); await page.waitForURL('**/tools/split-check**'); }); await settle(1500); }
  }
  // The site's navigation (no query) ends the handoff: recording resumes.
  await step('Tools in the navigation', async () => { await page.click('nav.main-nav a[href="/tools"]'); await page.waitForURL(url => new URL(url).pathname === '/tools'); });
  await settle(2000);
  h.check('the handoff flag is cleared', await flag() === null);
  const toolsAt = Date.now();
  h.check('recording resumes on /tools', await waitFor(async () => { await wiggle(page, 2); return run.rrweb().some(({ ev }) => ev.timestamp > toolsAt); }, 30000, 500));
  await step('Research in the navigation', async () => { await page.click('nav.main-nav a[href="/research"]'); await page.waitForURL(url => new URL(url).pathname === '/research'); });
  await settle(2000);
  await step('Back', async () => { await page.goBack(); await page.waitForURL(url => new URL(url).pathname === '/tools'); });
  await settle(1500);
  await step(`Back to the ${last[0]} page (a query, after the handoff ended)`, async () => { await page.goBack(); await page.waitForURL(url => last[1].test(new URL(url).pathname)); });
  await settle(2500);
  await step('Forward', async () => { await page.goForward(); await page.waitForURL(url => new URL(url).pathname === '/tools'); });
  await settle(1500);
  await run.flush(page);
  await run.close();

  h.check('every step ran', !log.some(line => line.startsWith('FAIL')), log.filter(line => line.startsWith('FAIL')));
  // The report joins /runners after a press, after the section tracker first looked: it is still seen, once.
  const reportViews = run.events().filter(({ e }) => e.event === 'section_viewed' && e.properties.section === 'report').map(({ e }) => e.properties.$pathname);
  h.check('the race report on /runners is one section_viewed report there', reportViews.filter(p => p === '/runners').length === 1, reportViews);
  h.inspect.invariants(run);
  const recorded = [...run.recordedPages.keys()];
  h.check('/stories and /tools were recorded (so I5 is not empty)', recorded.includes('/stories') && recorded.includes('/tools'), recorded);
  // Whatever the site's own list of blocked pages says (I5 also names them itself).
  const runnerPages = [...run.openWhileRecording].filter(page => h.inspect.NEVER_RECORDED(page));
  h.check('nothing was recorded while /runners, /your-race, /report or a runner handoff page was open', !runnerPages.length, runnerPages);
  h.note(`recorded: ${recorded.join(', ')}; ${run.options.needles.length} of the runner's values searched for`);
}

module.exports = {
  id: 'S3',
  title: 'Runner search journey: profile, its race report, handoff links, reload, Back and Forward; a copy-edition profile',
  jobs: ({ quick }) => [
    { name: 'site rules alone', weight: 95, run: h => journey(h, false) },
    ...(quick ? [] : [{ name: 'with the project blocklist', weight: 95, run: h => journey(h, true) }]),
    { name: 'copy editions', weight: 30, run: copyEditionJourney },
  ],
};
