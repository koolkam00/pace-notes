'use strict';
// S4: the visitor's privacy choices and the places analytics must stay off. With Do Not Track, Global Privacy Control,
// on a Vercel preview address and on localhost nothing may be sent at all (I7). After the /privacy opt-out nothing more
// may be sent, on that page or the next. When sessionStorage cannot be written or read, analytics falls back to memory:
// events and recordings still work, and no cookie or localStorage entry appears (I6).
const { SITE, PREVIEW_HOST, wiggle, type } = require('../browser.cjs');

// A short visit: the home page, a tool with a typed time, a client-side navigation.
async function visit(page, base) {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await wiggle(page, 6);
  await page.goto(base + '/tools/pace-calculator', { waitUntil: 'load' });
  await type(page, page.getByLabel('Time', { exact: true }), '3:17:43');
  await page.waitForTimeout(1000);
  await page.locator('nav.main-nav a[href="/research"]').click();
  await page.waitForURL(url => new URL(url).pathname === '/research');
  await wiggle(page, 6);
  await page.waitForTimeout(6000); // past the recorder's start delay and an event batch
}

async function silent(h, name, options, base = SITE) {
  const run = await h.run(name, { ...options, expectNoPostHog: true });
  const page = await run.newPage();
  await visit(page, base);
  if (base === SITE) {
    await page.goto(base + '/privacy', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const said = await page.locator('main').innerText();
    h.check('/privacy says analytics is off', /Analytics is off because your browser sends|Analytics is not enabled in this environment/.test(said), said.match(/Analytics is[^.]*\./)?.[0]);
  }
  await run.close();
}

async function optOut(h) {
  const run = await h.run('opt-out', {});
  const page = await run.newPage();
  await page.goto(SITE + '/privacy', { waitUntil: 'load' });
  h.check('the recorder starts on /privacy', await run.waitForRecording(page));
  await page.waitForTimeout(3500); // the page view's batch has gone
  await page.getByRole('button', { name: 'Turn off analytics' }).click();
  run.privacySignalAt = Date.now();
  h.check('/privacy says analytics is off', await page.getByText('Analytics is off for this browser.').isVisible());
  await wiggle(page, 8);
  await page.locator('nav.main-nav a[href="/tools"]').click();
  await page.waitForURL(url => new URL(url).pathname === '/tools');
  await wiggle(page, 6);
  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await type(page, page.getByLabel('Time', { exact: true }), '3:17:43');
  await wiggle(page, 6);
  await page.waitForTimeout(9000);
  h.check('the choice is kept', await page.evaluate(() => localStorage.getItem('marathon-analytics-disabled')) === 'true');
  await run.close();
}

async function memoryOnly(h, name, storage) {
  const run = await h.run(name, { storage });
  const page = await run.newPage();
  await page.goto(SITE + '/', { waitUntil: 'load' });
  h.check('the recorder still starts', await run.waitForRecording(page));
  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await type(page, page.getByLabel('Time', { exact: true }), '3:17:43');
  await run.flush(page);
  await page.waitForTimeout(3500);
  const variants = await page.evaluate(() => [...document.documentElement.attributes].filter(a => a.name.startsWith('data-exp-')).map(a => a.name));
  await run.close();
  h.check('page views are still sent', run.events().filter(({ e }) => e.event === '$pageview').length >= 2);
  h.check('no experiment variant is named without storage (the control shows)', !variants.length, variants);
}

module.exports = {
  id: 'S4',
  title: 'Privacy signals: Do Not Track, GPC, opt-out, preview host, localhost, blocked storage',
  jobs: ({ quick }) => [
    { name: 'Do Not Track', weight: 12, run: h => silent(h, 'Do Not Track', { dnt: true }) },
    { name: 'opt-out on /privacy', weight: 24, run: optOut },
    ...(quick ? [] : [
      { name: 'Global Privacy Control', weight: 12, run: h => silent(h, 'Global Privacy Control', { gpc: true }) },
      { name: 'preview host', weight: 11, run: h => silent(h, 'preview host', {}, 'https://' + PREVIEW_HOST) },
      { name: 'localhost', weight: 11, run: h => silent(h, 'localhost', {}, 'http://localhost:3000') },
      { name: 'sessionStorage writes fail', weight: 21, run: h => memoryOnly(h, 'sessionStorage writes fail', 'quota') },
      { name: 'sessionStorage unreadable', weight: 21, run: h => memoryOnly(h, 'sessionStorage unreadable', 'throw') },
    ]),
  ],
};
