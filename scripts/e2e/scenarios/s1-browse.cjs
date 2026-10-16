'use strict';
// S1: an ordinary visit, with client-side navigation the whole way: the home page, a story, the tools, an analysis and
// the privacy page. Each page view is sent with its clean path and the previous page's reading figures, and each page
// is recorded. Then a course page's contents link, a link away and Back.
const { SITE, wiggle, openMenu } = require('../browser.cjs');
const { experimentPlant } = require('../inspect.cjs');

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };

async function browse(h, device) {
  const run = await h.run('visit', { ...device, plant: experimentPlant() });
  const page = await run.newPage();
  const click = async (selector, pathname) => {
    if (selector.startsWith('nav.main-nav')) await openMenu(page);
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

// A course page's in-page links (the contents, "sustained slowdown", "finish times by year") go through the router, so
// after one of them, following any other link and going Back shows the course page again, with its own page view; a
// plain fragment link left the address on the course page and the page left on screen.
async function courseBack(h, device) {
  const run = await h.run('course contents, a link, then Back', device);
  const page = await run.newPage();
  await page.goto(SITE + '/courses/boston', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const race = (await page.locator('h1').textContent()).trim();
  await page.locator('nav.course-toc a[href="#goals"]').click();
  await page.waitForFunction(() => location.hash === '#goals');
  await page.waitForTimeout(600);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.locator('#goals tbody th a').first().click();
  await page.waitForURL(url => new URL(url).pathname === '/tools/plan', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const away = (await page.locator('h1').textContent()).trim();
  await page.goBack();
  await page.waitForURL(url => new URL(url).pathname === '/courses/boston', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent.trim(), goals: !!document.getElementById('goals'), url: location.pathname + location.hash }));
  h.check('a contents link scrolls to its section and focuses it', focused === 'goals', focused);
  h.check(`Back from the planner shows the course page again ("${race}"), not the planner ("${away}")`, back.h1 === race && back.goals && back.url === '/courses/boston#goals', back);
  await run.close();
  const paths = run.events().filter(({ e }) => e.event === '$pageview').map(({ e }) => e.properties.$pathname);
  h.check('page views: the course page, the planner, the course page again', JSON.stringify(paths) === JSON.stringify(['/courses/boston', '/tools/plan', '/courses/boston']), paths);
}

module.exports = {
  id: 'S1',
  title: 'Browsing: home, story, tools, analysis, privacy; Back to a course page',
  jobs: ({ quick }) => [
    { name: 'desktop', weight: 30, run: h => browse(h, DESKTOP) },
    ...(quick ? [] : [{ name: 'phone', weight: 30, run: h => browse(h, PHONE) }]),
    { name: 'course page Back', weight: 8, run: h => courseBack(h, PHONE) },
  ],
};
