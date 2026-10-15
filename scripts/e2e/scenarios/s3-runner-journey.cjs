'use strict';
// S3: the runner journey. A recorded page, then the runner search (never recorded), a profile, its links into an
// analysis and the split check (runner handoff pages: never recorded, also after a filter change, a reload or an
// onward link that keeps a query), then the site's navigation, which ends the handoff, and Back and Forward through
// the history. I5 checks every rrweb event against the page open when it was recorded; the runner's name, record IDs,
// times and the values in the handoff links are searched for in all PostHog traffic. It runs with the project's URL
// blocklist in the mock (as deployed) and without it (the site's own rules alone).
const { SITE, wiggle, waitFor } = require('../browser.cjs');

const SURNAME = 'Johnson';

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
    const ids = [...new Set([...text.matchAll(/record (\d{3,})/gi)].map(m => m[1]))];
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

  await step('analysis link (handoff)', async () => { await page.locator('.runner-context a', { hasText: 'Explore pacing across the wider study' }).first().click(); await page.waitForURL('**/analyses/**'); });
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
  const onward = await page.evaluate(() => [...document.querySelectorAll('a[href^="/tools/"], a[href^="/analyses/"]')].map(a => a.getAttribute('href')).filter(href => href.includes('?') && !href.includes('split-check')));
  for (const [key, pattern] of [['pace band', /^\/tools\/pace-band/], ['starting pace', /^\/analyses\/starting-pace/], ['qualifying', /^\/tools\/qualifying/]]) {
    const href = onward.find(link => pattern.test(link));
    if (!h.check(`the split check links on to the ${key} with a query`, href, onward)) continue;
    await step('onward ' + key, async () => { await page.locator(`a[href="${href}"]`).first().click(); await page.waitForURL(url => pattern.test(new URL(url).pathname)); });
    await settle(2500);
    if (key === 'qualifying') { await step('reload qualifying', () => page.reload({ waitUntil: 'load' })); await settle(9000); }
    else { await step('back to the split check', async () => { await page.goBack(); await page.waitForURL('**/tools/split-check**'); }); await settle(1500); }
  }
  // The site's navigation (no query) ends the handoff: recording resumes.
  await step('Tools in the navigation', async () => { await page.click('nav.main-nav a[href="/tools"]'); await page.waitForURL(url => new URL(url).pathname === '/tools'); });
  await settle(2000);
  h.check('the handoff flag is cleared', await flag() === null);
  const toolsAt = Date.now();
  h.check('recording resumes on /tools', await waitFor(async () => { await wiggle(page, 2); return run.rrweb().some(({ ev }) => ev.timestamp > toolsAt); }, 30000, 500));
  await step('Stories in the navigation', async () => { await page.click('nav.main-nav a[href="/stories"]'); await page.waitForURL(url => new URL(url).pathname === '/stories'); });
  await settle(2000);
  await step('Back', async () => { await page.goBack(); await page.waitForURL(url => new URL(url).pathname === '/tools'); });
  await settle(1500);
  await step('Back to the qualifying page (a query, after the handoff ended)', async () => { await page.goBack(); await page.waitForURL('**/tools/qualifying**'); });
  await settle(2500);
  await step('Forward', async () => { await page.goForward(); await page.waitForURL(url => new URL(url).pathname === '/tools'); });
  await settle(1500);
  await run.flush(page);
  await run.close();

  h.check('every step ran', !log.some(line => line.startsWith('FAIL')), log.filter(line => line.startsWith('FAIL')));
  h.inspect.invariants(run);
  const recorded = [...run.recordedPages.keys()];
  h.check('/stories and /tools were recorded (so I5 is not empty)', recorded.includes('/stories') && recorded.includes('/tools'), recorded);
  // Whatever the site's own list of blocked pages says (I5 also names them itself).
  const runnerPages = [...run.openWhileRecording].filter(page => h.inspect.NEVER_RECORDED(page));
  h.check('nothing was recorded while /runners, /your-race or a runner handoff page was open', !runnerPages.length, runnerPages);
  h.note(`recorded: ${recorded.join(', ')}; ${run.options.needles.length} of the runner's values searched for`);
}

module.exports = {
  id: 'S3',
  title: 'Runner search journey: profile, handoff links, reload, Back and Forward',
  jobs: ({ quick }) => [
    { name: 'site rules alone', weight: 95, run: h => journey(h, false) },
    ...(quick ? [] : [{ name: 'with the project blocklist', weight: 95, run: h => journey(h, true) }]),
  ],
};
