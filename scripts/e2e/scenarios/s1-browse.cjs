'use strict';
// S1: an ordinary visit, with client-side navigation the whole way: the home page, a story, the tools, an analysis and
// the privacy page. Each page view is sent with its clean path and the previous page's reading figures, and each page
// is recorded.
const { SITE, wiggle } = require('../browser.cjs');
const { experimentPlant } = require('../inspect.cjs');

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };

async function browse(h, device) {
  const run = await h.run('visit', { ...device, plant: experimentPlant() });
  const page = await run.newPage();
  const click = async (selector, pathname) => {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.locator(selector).first().click();
    await page.waitForURL(url => pathname instanceof RegExp ? pathname.test(new URL(url).pathname) : new URL(url).pathname === pathname, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await wiggle(page, 6);
  };
  await page.goto(SITE + '/', { waitUntil: 'load' });
  h.check('the recorder starts on /', await run.waitForRecording(page));
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await click('a.story-card', /^\/stories\/[a-z-]+$/);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(120); }
  await click('nav.main-nav a[href="/tools"]', '/tools');
  await click('nav.main-nav a[href="/analyses"]', '/analyses');
  await click('main a[href^="/analyses/"]', /^\/analyses\/[a-z-]+$/);
  await click('footer a[href="/privacy"]', '/privacy');
  h.check('the last page is recorded', await run.flush(page));
  await page.waitForTimeout(3500); // the next batch of events
  await run.close();

  const views = run.events().filter(({ e }) => e.event === '$pageview').map(({ e }) => e.properties);
  const paths = views.map(p => p.$pathname);
  h.check('a page view for each page, in order', /^\/,\/stories\/[a-z-]+,\/tools,\/analyses,\/analyses\/[a-z-]+,\/privacy$/.test(paths.join()), paths);
  h.check('each page view after the first names the previous page and its reading figures',
    views.slice(1).every((p, i) => p.$prev_pageview_pathname === paths[i] && Number.isInteger(p.$prev_pageview_duration) && typeof p.$prev_pageview_max_scroll_percentage === 'number'),
    views.map(p => [p.$pathname, p.$prev_pageview_pathname, p.$prev_pageview_duration, p.$prev_pageview_max_scroll_percentage]));
  h.check('home page sections are counted', run.events().some(({ e }) => e.event === 'section_viewed' && e.properties.$pathname === '/'));
  h.inspect.invariants(run); // fills run.recordedPages
  const recorded = [...run.recordedPages.keys()];
  h.check('every page was recorded', paths.every(p => recorded.includes(p)), { pageviews: paths, recorded });
}

module.exports = {
  id: 'S1',
  title: 'Browsing: home, story, tools, analysis, privacy',
  jobs: ({ quick }) => [
    { name: 'desktop', weight: 30, run: h => browse(h, DESKTOP) },
    ...(quick ? [] : [{ name: 'phone', weight: 30, run: h => browse(h, PHONE) }]),
  ],
};
