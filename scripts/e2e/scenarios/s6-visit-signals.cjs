'use strict';
// S6: the visit signals (docs/ANALYTICS.md, events table), each triggered in the browser and checked as sent: campaign
// tags on the first page view (allowed and junk values, and the address cleaned), section views, units, reading depth
// (a story read to the end stays so after a client-side navigation to a longer page, and its $pageleave names it),
// "Was this useful?", tool use (edits outside the workspace count; jump and print buttons do not), runner search
// results, Web Vitals sent as a tab closes (with and without a tap) and errors by kind only. Then the error page (a
// render error, and a page chunk that fails to load), a file the page's HTML names failing on a direct load (the
// page reloads itself and reports it once), and every page that fetches data with its data requests failing:
// each reports data_fetch and shows its own error state. `$feature/*` may appear only for a running experiment in
// lib/experiments.ts; the runs plant a stale variant and an unknown one, which must never be sent. Last, the experiment
// boot script names the variant before the first paint with the CPU slowed 6x.
const path = require('node:path');
const { SITE, type, waitFor } = require('../browser.cjs');
const { ROOT } = require('../inspect.cjs');

const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };
// The home page's sections since the redesign (WP1, October 17, 2026): the steps and the story teaser are gone.
const HOME_SECTIONS = ['hero', 'paths', 'stakes', 'guide', 'cta'];
// The home page's links to a story: its chapter list (the guide), since the story cards left it.
const HOME_STORY = 'main .chapter-list a[href^="/stories/"]';
const SENTINEL = 'E2E sentinel Private Name 3:16:41';
// A recording shows the elements a test adds to the page (a broken image, a missing script) like any other.
const IN_RECORDING = /\(\/s\/\)/;

const props = run => run.events().map(({ e }) => ({ event: e.event, ...e.properties }));
const named = (run, event) => props(run).filter(p => p.event === event);
const shown = list => list.map(p => `${p.event}${p.$pathname ? ' ' + p.$pathname : ''} ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('$') && !['event', 'token', 'distinct_id'].includes(k))))}`);

function experimentChecks(h, run) {
  const expected = h.inspect.expectedFeatures();
  const wrong = props(run).filter(p => JSON.stringify(Object.keys(p).filter(k => k.startsWith('$feature/')).sort().map(k => [k, p[k]])) !== JSON.stringify(Object.keys(expected).sort().map(k => [k, expected[k]])));
  h.check(Object.keys(expected).length ? 'every event names the running experiments\' planted variants, and nothing else' : 'no event carries $feature/* (no experiment is running)', !wrong.length, shown(wrong).slice(0, 5));
}

// Landing from an Instagram link, the home page's sections, units, a story, feedback, and leaving.
async function reading(h) {
  const run = await h.run('reading', { ...PHONE, plant: h.inspect.experimentPlant() });
  const page = await run.newPage();
  await page.goto(SITE + '/?utm_source=instagram&utm_medium=social&utm_content=bio&igshid=E2EIGSHID', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  h.check('the address loses its utm_* tags and keeps the rest', new URL(page.url()).search === '?igshid=E2EIGSHID', page.url());
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-track-section]')].map(el => el.dataset.trackSection));
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(90); }
  await page.waitForTimeout(800);
  await page.click('.unit-switch button:has-text("Kilometers")'); await page.waitForTimeout(300);
  await page.click('.unit-switch button:has-text("Kilometers")'); await page.waitForTimeout(300);
  await page.click('.unit-switch button:has-text("Miles")'); await page.waitForTimeout(300);
  const toBottom = async () => {
    for (let i = 0; i < 80 && await page.evaluate(() => window.scrollY + innerHeight < document.documentElement.scrollHeight - 2); i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(60); }
    await page.waitForTimeout(400);
  };
  // Story A, read to the end, then back to the (much longer) home page by the header logo: a client-side navigation.
  await page.evaluate(selector => document.querySelector(selector).click(), HOME_STORY);
  await page.waitForURL(url => new URL(url).pathname.startsWith('/stories/'));
  const storyA = new URL(page.url()).pathname;
  await page.waitForTimeout(1500);
  await toBottom();
  const feedback = page.locator('.page-feedback');
  await feedback.locator('button:has-text("No")').click();
  await feedback.locator('button:has-text("The numbers look wrong")').click();
  await feedback.locator('button:has-text("Hard to follow")').click({ force: true });
  await feedback.locator('button:has-text("Yes")').click({ force: true });
  h.check('feedback says thank you', /Thank you/.test(await feedback.locator('[role="status"]').innerText()));
  // The reasons and the thank-you lengthen the page below the furthest point read, and PostHog measures depth against
  // the page's height when the next page view goes out: on a short story (pacing types is under three phone screens
  // since round 3) that alone drops a read to the end under 0.9, so the reader reads on to the new end first.
  await toBottom();
  await page.waitForTimeout(800);
  await page.locator('a.site-title').click();
  await page.waitForURL(url => new URL(url).pathname === '/');
  await page.waitForTimeout(1500);
  // Story B, read to the end, then the tab leaves the site with a full load: the story's own $pageleave.
  const storyB = await page.evaluate(([selector, a]) => [...document.querySelectorAll(selector)].map(el => new URL(el.href).pathname).find(href => href !== a), [HOME_STORY, storyA]);
  await page.evaluate(([selector, href]) => [...document.querySelectorAll(selector)].find(el => new URL(el.href).pathname === href).click(), [HOME_STORY, storyB]);
  await page.waitForURL(url => new URL(url).pathname === storyB);
  await page.waitForTimeout(1500);
  await toBottom();
  await page.waitForTimeout(800);
  await page.goto(SITE + '/about', { waitUntil: 'load' });
  // On /about the visitor only scrolls, never taps, and closes the tab: its Web Vitals still go out as it closes.
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await page.waitForTimeout(2500);
  await run.closePage(page, { unload: true });
  await new Promise(resolve => setTimeout(resolve, 1500));
  await run.close();

  const views = named(run, '$pageview');
  h.check('the first page view carries the Instagram tags', views[0] && views[0].$pathname === '/' && views[0].utm_source === 'instagram' && views[0].utm_medium === 'social' && views[0].utm_content === 'bio', shown(views.slice(0, 1)));
  h.check('later page views carry no tags', views.slice(1).every(p => !Object.keys(p).some(k => k.startsWith('utm_'))), shown(views.slice(1)));
  // On the first home page view (the visit comes back to / later, which is a page view of its own).
  const sections = named(run, 'section_viewed').filter(p => p.$pathname === '/' && views[0] && p.$pageview_id === views[0].$pageview_id).map(p => p.section);
  h.check('each home section is counted once, in page order', JSON.stringify(sections) === JSON.stringify(order), { sent: sections, page: order });
  // The home page's sections since October 16, 2026, and none of them a chapter-* (autopilot/metrics.md counts those on /).
  h.check('the home page marks hero, paths, stakes, guide and cta, in that order', JSON.stringify(order) === JSON.stringify(HOME_SECTIONS), order);
  h.check('no chapter-* section is sent from the home page', !named(run, 'section_viewed').some(p => p.$pathname === '/' && String(p.section).startsWith('chapter-')), shown(named(run, 'section_viewed').filter(p => p.$pathname === '/')));
  // Once the SDK has loaded, the site's events join its batch (sent every few seconds) instead of one request each.
  const perRequest = run.sent.map(r => (r.events || []).filter(e => e.event === 'section_viewed').length).filter(n => n);
  h.check('section views are sent in batches, not one request each', perRequest.some(n => n >= 2), perRequest);
  h.check('units_changed only on a real change (km, then mi)', JSON.stringify(named(run, 'units_changed').map(p => p.units)) === '["km","mi"]', shown(named(run, 'units_changed')));
  const story = views.find(p => p.$pathname === storyA);
  h.check('the story\'s page view names the home page and its reading figures', story && story.$prev_pageview_pathname === '/' && Number.isInteger(story.$prev_pageview_duration) && story.$prev_pageview_max_scroll_percentage > 0, story && shown([story]));
  // A story read to the end, then a client-side navigation to a longer page, stays read to the end (the next page's
  // height does not count), under the story's own path.
  const home = views.find(p => p.$pathname === '/' && p.$prev_pageview_pathname === storyA);
  // The client-side return to /: one hero on /, under the / page view. The story's page view, still open as the router
  // puts the home page in place, must not count it too. (Stories mark a hero of their own since the October 17, 2026
  // redesign; those are checked below, each once under its story's page view.)
  const heroes = named(run, 'section_viewed').filter(p => p.section === 'hero' && p.$pathname === '/' && (!views[0] || p.$pageview_id !== views[0].$pageview_id));
  h.check('after a client-side navigation to /, exactly one hero, carrying the / page view\'s $pageview_id', home && heroes.length === 1 && heroes[0].$pageview_id === home.$pageview_id, { home: home && home.$pageview_id, heroes: heroes.map(p => `${p.$pathname} ${p.$pageview_id}`) });
  const storyHeroes = [storyA, storyB].map(path => named(run, 'section_viewed').filter(p => p.section === 'hero' && p.$pathname === path));
  h.check('each story read marks its hero once, under its own page view', storyHeroes.every((list, i) => list.length === 1 && list[0].$pageview_id === (views.find(p => p.$pathname === [storyA, storyB][i]) || {}).$pageview_id), storyHeroes.map(list => list.map(p => `${p.$pathname} ${p.$pageview_id}`)));
  const viewPath = new Map(views.map(p => [p.$pageview_id, p.$pathname]));
  const misfiled = named(run, 'section_viewed').filter(p => viewPath.get(p.$pageview_id) !== p.$pathname);
  h.check('every section view carries the page view of its own page', !misfiled.length, misfiled.map(p => `${p.section} ${p.$pathname} ${p.$pageview_id}`));
  h.check('after a story read to the end, the next page view reports it read to the end', home && home.$prev_pageview_max_scroll_percentage >= 0.9 && home.$prev_pageview_max_content_percentage >= 0.9, home ? shown([home]) : shown(views));
  h.check('one answer and one reason per page view', JSON.stringify(named(run, 'page_feedback').map(p => p.answer)) === '["no"]' && JSON.stringify(named(run, 'page_feedback_reason').map(p => p.reason)) === '["numbers_look_wrong"]', shown([...named(run, 'page_feedback'), ...named(run, 'page_feedback_reason')]));
  const leave = named(run, '$pageleave');
  h.check('$pageleave with the time on page and scroll depth', leave.some(p => Number.isInteger(p.$prev_pageview_duration) && typeof p.$prev_pageview_max_scroll_percentage === 'number'), shown(leave));
  // The story the tab left with a full load: its $pageleave names it, read to the end. autopilot/metrics.md counts a
  // story read to the end on $pageview or $pageleave with $prev_pageview_pathname under /stories/ and depth >= 0.9.
  const storyLeave = leave.find(p => p.$pathname === storyB);
  h.check('the story\'s $pageleave names the story and its depth', storyLeave && storyLeave.$prev_pageview_pathname === storyB && storyLeave.$prev_pageview_max_scroll_percentage >= 0.9 && Number.isInteger(storyLeave.$prev_pageview_duration), shown(leave));
  const readToEnd = [...views, ...leave].filter(p => String(p.$prev_pageview_pathname).startsWith('/stories/') && Number(p.$prev_pageview_max_scroll_percentage) >= 0.9);
  h.check('the metrics\' "story read to the end" signal counts both stories, once each', JSON.stringify(readToEnd.map(p => `${p.event}:${p.$prev_pageview_pathname}`).sort()) === JSON.stringify([`$pageleave:${storyB}`, `$pageview:${storyA}`].sort()), shown(readToEnd));
  if (storyLeave) h.note(`a story's $pageleave as sent: ${shown([storyLeave])[0]} ${JSON.stringify({ $prev_pageview_pathname: storyLeave.$prev_pageview_pathname, $prev_pageview_duration: storyLeave.$prev_pageview_duration, $prev_pageview_max_scroll_percentage: storyLeave.$prev_pageview_max_scroll_percentage })}`);
  // No tap on /about: LCP and CLS (and FCP) still go out as the tab closes, in one beacon.
  const aboutVitals = named(run, '$web_vitals').filter(p => p.$pathname === '/about');
  h.check('closing a tab without a tap sends its LCP, CLS and FCP', aboutVitals.some(p => Number.isInteger(p.$web_vitals_LCP_value) && typeof p.$web_vitals_CLS_value === 'number' && Number.isInteger(p.$web_vitals_FCP_value)), shown(named(run, '$web_vitals')));
  h.check('Web Vitals carry no page-view ID', named(run, '$web_vitals').every(p => !('$pageview_id' in p)), shown(named(run, '$web_vitals')));
  experimentChecks(h, run);
}

// A tool: junk tags, edits, copy, print; errors by kind; the runner search; Web Vitals.
async function using(h) {
  const run = await h.run('tools', { ...PHONE, plant: h.inspect.experimentPlant(), expectErrors: [/E2E sentinel/] });
  await run.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  const page = await run.newPage();
  await page.goto(SITE + '/tools/pace-calculator?utm_source=instagram&utm_campaign=Private+Name', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  h.check('junk tags leave the address too', !new URL(page.url()).search.includes('utm_'), page.url());
  const time = page.getByLabel('Time', { exact: true });
  await type(page, time, '3:17:43');
  await type(page, time, '3:16:41');
  await page.locator('.share-bar button:has-text("Copy link")').first().click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(300);
  await page.evaluate(sentinel => { setTimeout(() => { throw new Error(sentinel + ' thrown'); }, 0); }, SENTINEL);
  await page.waitForTimeout(300);
  await page.evaluate(sentinel => { Promise.reject(new Error(sentinel + ' rejected')); }, SENTINEL);
  await page.waitForTimeout(300);
  await page.evaluate(sentinel => { setTimeout(() => { throw new Error(sentinel + ' again'); }, 0); }, SENTINEL);
  await page.evaluate(() => { const img = new Image(); img.src = '/no-such-image.png?E2E%20sentinel'; document.body.appendChild(img); });
  await page.waitForTimeout(800);
  // The pace chart's view switch and paging are edits too (outside .tool-workspace).
  await page.goto(SITE + '/tools/pace-calculator?view=chart', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.locator('.pace-chart button:has-text("Faster paces")').click();
  await page.locator('.pace-chart button:has-text("Slower paces")').click();
  await page.waitForTimeout(500);
  await page.goto(SITE + '/runners', { waitUntil: 'load' });
  await page.waitForSelector('#runner-name:not([disabled])', { timeout: 30000 });
  await page.locator('#runner-name').pressSequentially('Johnson', { delay: 15 });
  await page.click('button[type="submit"]');
  await page.waitForSelector('.runner-matches li', { timeout: 30000 });
  await page.locator('#runner-name').fill('');
  await page.locator('#runner-name').pressSequentially('Qzxqzxq', { delay: 15 });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  // The ways on after no match are fixed addresses: the search text goes nowhere.
  await page.locator('.runner-nomatch-next a:has-text("Ask for your race")').click();
  await page.waitForURL(/\/request-analysis/);
  const onward = page.url();
  await page.waitForTimeout(800);
  // Web Vitals on a fresh load: an interaction, then the tab is hidden.
  await page.goto(SITE + '/tools/predictor', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.mouse.click(200, 400);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(3500);
  await run.closePage(page, { unload: true });
  await new Promise(resolve => setTimeout(resolve, 1500));
  await run.close();

  // The broken image is the test's own element, so a recording may show it; no event may name it.
  run.options.needles = ['3:17:43', '3:16:41', 'Johnson', 'Qzxqzxq', { needle: 'no-such-image', allowAt: IN_RECORDING }];
  const first = named(run, '$pageview')[0];
  h.check('no campaign tags when one tag is not on the list', first && !Object.keys(first).some(k => k.startsWith('utm_')), first && shown([first]));
  const tool = named(run, 'tool_used');
  const calculator = tool.filter(p => p.$pathname === '/tools/pace-calculator').map(p => p.action);
  h.check('tool_used: one edit per page view, then copy_link and print', JSON.stringify(calculator) === '["edit","copy_link","print","edit"]', shown(tool));
  const errors = named(run, 'site_error').filter(p => p.$pathname === '/tools/pace-calculator').map(p => p.category);
  h.check('site_error by kind, once per kind per page view; a failed image is not one', JSON.stringify(errors) === '["js_error","unhandled_rejection"]', shown(named(run, 'site_error')));
  const search = named(run, 'runner_search_completed').map(p => `${p.outcome}:${p.results}`);
  h.check('runner_search_completed with its result band', search.includes('matches:6+') && search.includes('no_matches:0'), search);
  h.check('a link on from no match carries no search text', new URL(onward).pathname === '/request-analysis' && !new URL(onward).search && !onward.includes('Qzxqzxq'), onward);
  // A tap, then the tab closes: all four values go out as it closes, INP and CLS included.
  const vitals = named(run, '$web_vitals').filter(p => p.$pathname === '/tools/predictor');
  h.check('closing a tab after a tap sends its LCP, INP, CLS and FCP', vitals.some(p => ['LCP', 'INP', 'FCP'].every(k => Number.isInteger(p[`$web_vitals_${k}_value`])) && typeof p.$web_vitals_CLS_value === 'number'), shown(named(run, '$web_vitals')));
  if (vitals.length) h.note(`$web_vitals as sent: ${JSON.stringify(Object.fromEntries(Object.entries(vitals[0]).filter(([k]) => k.startsWith('$web_vitals_') || k === '$pathname')))}`);
  experimentChecks(h, run);
}

// A page restored from the back/forward cache. Headless Chromium does not keep pages there under Playwright, so the
// browser's own pagehide and pageshow (persisted) are dispatched: posthog-js sends $pageleave on the first, and the site
// starts a new page view on the second, which must not report the closed one again. What is sent once per page view
// counts once more on the restored page (the first edit, each section seen, each kind of failure, within five failures
// per page load), and "Was this useful?" keeps the answer already given, sending nothing more.
const away = page => page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); });
const back = page => page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
async function restored(h) {
  const run = await h.run('back-forward cache', { ...PHONE });
  const page = await run.newPage();
  await page.goto(SITE + '/stories/final-kick', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(100); }
  await page.waitForTimeout(500);
  await away(page);
  await page.waitForTimeout(800);
  await back(page);
  await page.waitForTimeout(1500);
  await run.closePage(page, { unload: true });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await run.close();
  const views = named(run, '$pageview'), leaves = named(run, '$pageleave');
  h.check('the restored page is a new page view, which does not report the one already closed', views.length === 2 && views[1].$pathname === '/stories/final-kick' && !Object.keys(views[1]).some(k => k.startsWith('$prev_pageview_')), shown(views));
  h.check('each page view is closed by its own $pageleave', views.length === 2 && leaves.length === 2 && leaves[0].$prev_pageview_id === views[0].$pageview_id && leaves[1].$prev_pageview_id === views[1].$pageview_id, { views: views.map(p => p.$pageview_id), leaves: leaves.map(p => p.$prev_pageview_id) });

  const signals = await h.run('back-forward cache signals', { ...PHONE, expectErrors: [/E2E sentinel/] });
  const tab = await signals.newPage();
  const restore = async () => { await away(tab); await tab.waitForTimeout(500); await back(tab); await tab.waitForTimeout(1200); };
  // Two uncaught errors, then a rejected promise.
  const fail = async () => {
    for (const how of ['thrown', 'again', 'rejected']) {
      await tab.evaluate(([sentinel, how]) => { if (how === 'rejected') Promise.reject(new Error(sentinel + ' rejected')); else setTimeout(() => { throw new Error(sentinel + ' ' + how); }, 0); }, [SENTINEL, how]);
      await tab.waitForTimeout(250);
    }
  };
  // The home page: the sections on screen as it opens count on each page view, once, even scrolled away and back.
  await tab.goto(SITE + '/', { waitUntil: 'load' });
  await tab.waitForTimeout(1500);
  await restore();
  await tab.mouse.wheel(0, 900); await tab.waitForTimeout(400); await tab.mouse.wheel(0, -900); await tab.waitForTimeout(800);
  // A tool: an edit, two kinds of failure and an answer; restored, the same again and a failed file; restored again,
  // failures that would be the sixth and seventh of the page load.
  await tab.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await tab.waitForTimeout(1200);
  const time = tab.getByLabel('Time', { exact: true });
  await type(tab, time, '3:17:43'); await type(tab, time, '3:16:41');
  await fail();
  const feedback = tab.locator('.page-feedback');
  await feedback.locator('button:has-text("Yes")').click();
  await tab.waitForTimeout(300);
  await restore();
  await type(tab, time, '3:17:43'); await type(tab, time, '3:16:41');
  await fail();
  await tab.evaluate(() => { const el = document.createElement('script'); el.src = '/_next/static/chunks/e2e-restored-chunk.js'; document.head.appendChild(el); });
  await tab.waitForTimeout(600);
  const kept = await feedback.evaluate(el => ({ yes: el.querySelector('button[aria-pressed="true"]')?.textContent, thanks: el.querySelector('[role="status"]').textContent }));
  await feedback.locator('button:has-text("No")').click({ force: true });
  await feedback.locator('button:has-text("Yes")').click({ force: true });
  await tab.waitForTimeout(300);
  await restore();
  await fail();
  await tab.waitForTimeout(1500);
  await signals.closePage(tab, { unload: true });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await signals.close();
  signals.options.needles = ['3:17:43', '3:16:41', { needle: 'e2e-restored-chunk', allowAt: IN_RECORDING }];
  const all = props(signals);
  const perView = pathname => named(signals, '$pageview').filter(p => p.$pathname === pathname).map(view => all.filter(p => p.$pageview_id === view.$pageview_id && p.event !== '$pageview'));
  const home = perView('/').map(list => list.filter(p => p.event === 'section_viewed').map(p => p.section));
  h.check('home: the restored page is a new page view whose sections on screen count once more, each once', home.length === 2 && home[0].length > 0 && home[0].includes('hero') && home[0].every(s => home[1].includes(s)) && home.every(list => new Set(list).size === list.length), home);
  const tool = perView('/tools/pace-calculator').map(list => list.filter(p => ['tool_used', 'site_error', 'page_feedback', 'page_feedback_reason'].includes(p.event)).map(p => p.event === 'tool_used' ? p.action : p.event === 'site_error' ? p.category : `${p.event}:${p.answer || p.reason}`));
  h.check('tool: one edit, one report per kind of failure and one answer on the first page view', JSON.stringify(tool[0]) === '["edit","js_error","unhandled_rejection","page_feedback:yes"]', tool);
  h.check('tool: after a restore, the first edit and each kind of failure count once more, and no answer is asked for again', JSON.stringify(tool[1]) === '["edit","js_error","unhandled_rejection","chunk_load"]', tool);
  h.check('tool: failures stay within five per page load, restores included', tool.length === 3 && tool[2].length === 0, tool);
  h.check('tool: the restored page still shows its answer and thanks the visitor', kept.yes === 'Yes' && /Thank you/.test(kept.thanks), kept);
  h.check('page_feedback once on the tool, as sent', named(signals, 'page_feedback').length === 1 && named(signals, 'page_feedback_reason').length === 0, shown(named(signals, 'page_feedback')));
}

// Edits outside a tool's workspace (the course chooser's list) count; buttons that only jump within the page or print do not.
async function toolEdits(h) {
  const run = await h.run('tool edits', { ...PHONE });
  const page = await run.newPage();
  await page.goto(SITE + '/tools/course-chooser', { waitUntil: 'load' });
  await page.waitForSelector('#course-chooser-sort', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.selectOption('#course-chooser-sort', 'under');
  await page.waitForTimeout(300);
  // The two filters sit behind one disclosure (one control on the beat).
  await page.locator('details.course-chooser-filters > summary').click();
  await page.selectOption('#course-chooser-open', 'downhill');
  await page.waitForTimeout(500);
  // The projector's result sits right above its inputs (no "Result ↑" link since WP9 round 3): opening it is no edit.
  await page.goto(SITE + '/tools/projector', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // A result's next step is not an edit, on the tool it leaves or on the one it opens with the time filled in.
  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.locator('.tool-handoffs a:has-text("Plan this goal")').click();
  await page.waitForURL(/\/tools\/plan\?goal=\d:\d\d$/);
  const handedOn = page.url();
  await page.waitForTimeout(1500);
  await page.goto(SITE + '/tools/pace-band', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // window.print() would open the print dialog: the page's beforeprint stands in for it.
  await page.evaluate(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')); }; });
  await page.locator('button:has-text("Print wristband strips")').click();
  await page.waitForTimeout(800);
  await run.close();
  const used = named(run, 'tool_used').map(p => `${p.$pathname}:${p.action}`);
  h.check('changing the course chooser\'s list is one edit', JSON.stringify(used.filter(u => u.startsWith('/tools/course-chooser'))) === '["/tools/course-chooser:edit"]', used);
  h.check('opening the projector is not an edit', !used.some(u => u.startsWith('/tools/projector')), used);
  h.check('printing the pace band is a print, not an edit', JSON.stringify(used.filter(u => u.startsWith('/tools/pace-band'))) === '["/tools/pace-band:print"]', used);
  h.check('following a result\'s next step is not an edit', !used.some(u => u.startsWith('/tools/pace-calculator') || u.startsWith('/tools/plan')) && named(run, '$pageview').filter(p => p.$pathname === '/tools/plan').length === 1, { used, handedOn });
}

// The race planner: its mat comparison, course result and pace band are each seen once (the band last); its two print
// buttons are prints and its Copy link a copied link, none of them an edit; the copied link keeps the course and goal.
async function planner(h) {
  const run = await h.run('planner', { ...PHONE });
  await run.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  const page = await run.newPage();
  await page.goto(SITE + '/tools/plan?course=berlin&goal=3:30', { waitUntil: 'load' });
  await page.waitForSelector('#plan-comparison', { timeout: 20000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(250); }
  // window.print() would open the print dialog: the page's beforeprint stands in for it.
  await page.evaluate(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('afterprint')); }; });
  await page.locator('button:has-text("Print wristband strips")').click();
  await page.waitForTimeout(500);
  await page.locator('#plan-band .share-bar button:has-text("Copy link")').click();
  await page.waitForTimeout(500);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  await run.close();
  const used = named(run, 'tool_used').map(p => `${p.$pathname}:${p.action}`);
  const sections = named(run, 'section_viewed').filter(p => p.$pathname === '/tools/plan').map(p => p.section);
  // Since the October 2026 redesign the page is short enough for the scroll to reach the chapter's end ("related") too:
  // it may follow the planner's three, once.
  const own = sections.filter(s => s !== 'related');
  // Since round 6 (October 2026) the data beat (comparison) leads the page, above the plan's card (result). It is marked
  // only once its finishes show, so on a linked course and goal (this run) it is first seen when its file loads, right
  // after the card; on the example, read at build, it is seen first. Either way each is seen once, the band last.
  h.check('planner: the mat comparison, the course result and the pace band are each seen once, the band last', ['["comparison","result","pace-band"]', '["result","comparison","pace-band"]'].includes(JSON.stringify(own)) && sections.length - own.length <= 1 && (sections.length === own.length || sections[sections.length - 1] === 'related'), sections);
  h.check('planner: the print button is a print and Copy link a copied link; neither is an edit', JSON.stringify(used) === '["/tools/plan:print","/tools/plan:copy_link"]', used);
  let link = null;
  try { link = new URL(copied); } catch { /* checked below */ }
  h.check('planner: the copied link opens the same course, goal and units, and carries nothing else', link && link.pathname === '/tools/plan' && JSON.stringify([...link.searchParams].sort()) === JSON.stringify([['course', 'berlin'], ['goal', '3:30'], ['units', 'mi']]), copied);
}

// The race report on /report: its section is seen once; a failed image is site_error export, once (twice pressed), and
// then Save image is one report_exported image; a cancelled share sends nothing and a share that goes through one
// report_exported share;
// Print is a print and Copy link a copied link, never an edit; the copied link carries exactly the times and course.
const REPORT_S = '0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31';
async function raceReport(h) {
  const run = await h.run('race report', { ...PHONE, needles: REPORT_S.split(',') });
  const page = await run.newPage();
  await page.goto(`${SITE}/report?s=${REPORT_S}&course=berlin`, { waitUntil: 'load' });
  await page.waitForSelector('.race-report-table', { timeout: 20000 });
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(250); }
  // Print sits in the report's bar; Save image, Share… and Copy link in the sheet its Share button opens (a modal: it is
  // closed for the print and opened again for the link).
  const button = name => page.locator('.race-report-actions .share-bar button', { hasText: name });
  const inSheet = name => page.locator('.race-report-sheet.is-open button', { hasText: name });
  const openSheet = async () => { await page.locator('.race-report-actions .race-report-share-open').click(); await page.waitForSelector('.race-report-sheet.is-open [data-report-save]', { timeout: 15000 }); await page.waitForTimeout(300); };
  // First an image the browser cannot encode, from before the sheet opens (the sheet draws its preview as it opens, and
  // Save image reuses that drawing): the preview says so and reports nothing (drawing is not an export); then the
  // export fails, reported once, with the button's own message.
  await page.evaluate(() => { window.__e2eToBlob = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); }; });
  await openSheet();
  await page.waitForSelector('.race-report-sheet .race-report-preview-wait', { timeout: 15000 });
  await page.waitForTimeout(800);
  const drawNote = await page.locator('.race-report-sheet .race-report-preview-wait').textContent();
  for (let i = 0; i < 2; i++) { await inSheet('Save image').click(); await page.waitForTimeout(800); }
  const message = await page.locator('.race-report-sheet .race-report-note').textContent();
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__e2eToBlob; });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), inSheet('Save image').click()]);
  const saved = download.suggestedFilename();
  await page.waitForTimeout(400);
  const previewShown = await page.locator('.race-report-sheet img.race-report-preview').count();
  // The share sheet: first cancelled, then sent (with the image file, as iOS Safari offers it).
  await page.evaluate(() => {
    window.__e2eShares = 0;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => Boolean(data && data.files) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { window.__e2eShares += 1; if (window.__e2eShares === 1) throw new DOMException('Share canceled', 'AbortError'); } });
  });
  await page.locator('.race-report-sheet .race-report-share-native').click();
  await waitFor(() => page.evaluate(() => window.__e2eShares === 1), 10000, 200);
  await page.waitForTimeout(400);
  await page.locator('.race-report-sheet .race-report-share-native').click();
  await waitFor(() => page.evaluate(() => window.__e2eShares === 2), 10000, 200);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.race-report-sheet:not(.is-open)', { state: 'attached', timeout: 5000 });
  await page.waitForTimeout(400);
  // window.print() would open the print dialog: the page's beforeprint stands in for it.
  await page.evaluate(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('afterprint')); }; });
  await button('Print or save as PDF').click();
  await page.waitForTimeout(300);
  // The browser's clipboard is shared by the jobs running at once, so the copied text is caught in the page instead.
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__e2eCopied = text; } } }); });
  await openSheet();
  await inSheet('Copy link').click();
  await page.waitForTimeout(400);
  const copied = await page.evaluate(() => window.__e2eCopied || '');
  await run.close();
  h.inspect.invariants(run);
  const exported = named(run, 'report_exported').map(p => `${p.$pathname}:${p.format}`);
  const used = named(run, 'tool_used').map(p => `${p.$pathname}:${p.action}`);
  const errors = named(run, 'site_error').map(p => p.category);
  h.check('race report: the image is saved as pace-notes-race-report.png', saved === 'pace-notes-race-report.png', saved);
  h.check('race report: a preview that cannot be drawn says so, and the saved image then shows at the top of the sheet', /could not be drawn/.test(drawNote || '') && previewShown === 1, { drawNote, previewShown });
  h.check('race report: one report_exported image and one share; the cancelled share sends nothing', JSON.stringify(exported) === '["/report:image","/report:share"]', exported);
  h.check('race report: Print is a print and Copy link a copied link; nothing is an edit', JSON.stringify(used) === '["/report:print","/report:copy_link"]', used);
  h.check('race report: an image that cannot be made is one site_error export, with its message', JSON.stringify(errors) === '["export"]' && /could not be made/.test(message || ''), { errors, message });
  h.check('race report: its section is seen once', JSON.stringify(named(run, 'section_viewed').filter(p => p.$pathname === '/report').map(p => p.section)) === '["report"]', shown(named(run, 'section_viewed')));
  let link = null;
  try { link = new URL(copied); } catch { /* checked below */ }
  h.check('race report: the copied link carries exactly the times and the course', link && link.pathname === '/report' && JSON.stringify([...link.searchParams]) === JSON.stringify([['s', REPORT_S], ['course', 'berlin']]), copied.replace(/s=[^&]*/, 's=…'));
  h.check('race report: nothing was recorded on /report', ![...run.recordedPages.keys()].includes('/report'), [...run.recordedPages.keys()]);
}

// The experiment boot script names this tab's variant on <html> before the first paint, on a slow phone. With no
// experiment in the registry, pages are served with a fixture registry's <head> markup, rendered from
// components/Experiment.tsx exactly as the build renders it and put where the build puts it.
const PAINT_FIXTURE = [
  { key: 'e2e-hero', status: 'running', pages: ['/'], area: 'hero', variants: ['control', 'short-dek'], started: '2026-10-15', hypothesis: 'A shorter first line gets more phone visitors to the first chapter.' },
  { key: 'e2e-tools', status: 'running', pages: ['/tools'], variants: ['control', 'calc-first', 'band-first'], weights: [50, 30, 20], started: '2026-10-15', hypothesis: 'Listing the calculator first gets more tools used.' },
];
async function paintOrder(h) {
  const fixture = !h.inspect.RUNNING.size;
  const loads = [];
  for (const target of ['/', '/stories', '/tools/pace-calculator']) {
    for (let i = 0; i < 2; i++) {
      const run = await h.run(`${target} #${i + 1}`, { ...PHONE, html: fixture ? text => h.inspect.withExperiments(text, PAINT_FIXTURE) : undefined,
        // <html> may not exist yet when this runs, so the whole document is watched.
        initScript: () => { new MutationObserver((records, observer) => { if (records.some(r => r.type === 'attributes' && r.target === document.documentElement && String(r.attributeName).startsWith('data-exp-'))) { window.__e2eNamed = performance.now(); observer.disconnect(); } }).observe(document, { attributes: true, subtree: true, childList: true }); } });
      const page = await run.newPage();
      await run.throttle(page, 6);
      await page.goto(SITE + target, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(500);
      loads.push({ target, ...await page.evaluate(() => ({ named: window.__e2eNamed ?? null, paint: (performance.getEntriesByType('paint').find(p => p.name === 'first-paint') || {}).startTime ?? null, variants: [...document.documentElement.attributes].filter(a => a.name.startsWith('data-exp-')).length })) });
      await run.close();
    }
  }
  const late = loads.filter(l => !(l.named !== null && l.paint !== null && l.named < l.paint));
  h.check(`with the CPU slowed 6x, every variant is named on <html> before the first paint${fixture ? ' (fixture registry)' : ''}`, !late.length, late);
  h.check('each running experiment gets a variant', loads.every(l => l.variants === (fixture ? PAINT_FIXTURE.length : h.inspect.RUNNING.size)), loads);
  h.note(`named / first paint (ms): ${loads.map(l => `${l.target} ${Math.round(l.named)}/${Math.round(l.paint)}`).join(', ')}`);
}

// The error page: a component that throws while rendering, and a page chunk that fails during a client-side navigation.
async function errorPages(h) {
  const run = await h.run('error pages', { allowErrorPage: true, expectErrors: [/E2E sentinel/, /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i] });
  const page = await run.newPage();
  // Every Number#toLocaleString throws, on one load of /runners only: its results render numbers.
  await page.addInitScript(sentinel => {
    if (location.pathname === '/runners' && !sessionStorage.getItem('__e2e_render')) {
      sessionStorage.setItem('__e2e_render', '1');
      Number.prototype.toLocaleString = function () { throw new Error(sentinel + ' render'); };
    }
  }, SENTINEL);
  await page.goto(SITE + '/runners', { waitUntil: 'load' });
  // The page may fail as it loads (the record count) or once the results render.
  await page.waitForSelector('#runner-name:not([disabled])', { timeout: 8000 }).catch(() => {});
  await page.locator('#runner-name').pressSequentially('Johnson', { delay: 15, timeout: 3000 }).catch(() => {});
  await page.click('button[type="submit"]', { timeout: 3000 }).catch(() => {});
  const errorPage = (path, timeout) => waitFor(() => run.reports.some(r => r.kind === 'error-page' && r.path === path), timeout, 250);
  h.check('a render error shows the error page', await errorPage('/runners', 15000));
  await page.waitForTimeout(3500);
  // A script under /_next/ that fails after load.
  await page.goto(SITE + '/tools', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const el = document.createElement('script'); el.src = '/_next/static/chunks/e2e-missing-chunk.js'; document.head.appendChild(el); });
  await page.waitForTimeout(3500);
  // A page chunk that fails during a client-side navigation. A reload in the last five minutes is noted, so the page
  // shows the error page instead of reloading (lib/chunk-reload.ts).
  await page.goto(SITE + '/stories', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => sessionStorage.setItem('pace-notes-chunk-reload', String(Date.now())));
  const unblock = run.block(url => /\/_next\/static\/chunks\/app\/about\/page-[^/]+\.js$/.test(url.pathname));
  await page.locator('footer a[href="/about"]').click({ noWaitAfter: true });
  h.check('a failed page chunk shows an error page', await errorPage('/stories', 15000));
  const which = run.reports.filter(r => r.kind === 'error-page').map(r => `${r.path}: ${r.which === 'global' ? 'app/global-error.tsx' : 'app/error.tsx'}`);
  h.note(`error pages shown: ${which.join(', ')}`);
  unblock();
  await page.waitForTimeout(3500);
  await run.close();
  const errors = named(run, 'site_error').map(p => `${p.$pathname}:${p.category}`);
  h.check('site_error render on /runners', errors.includes('/runners:render'), errors);
  h.check('site_error chunk_load for a failed /_next/ script', errors.includes('/tools:chunk_load'), errors);
  h.check('site_error chunk_load for the failed page chunk', errors.includes('/about:chunk_load') || errors.includes('/stories:chunk_load'), errors);
  h.check('site_error carries its kind only', named(run, 'site_error').every(p => Object.keys(p).filter(k => !k.startsWith('$') && !['event', 'token', 'distinct_id'].includes(k)).join() === 'category'), shown(named(run, 'site_error')));
  run.options.needles = [{ needle: 'e2e-missing-chunk', allowAt: IN_RECORDING }, 'ChunkLoadError', 'Loading chunk'];
}

// A script the page's HTML names that fails on a direct load (a page chunk, or Next.js's own main-app script): the
// <head> script reloads the page before any of the site's code runs, so the page it reloads into reports the failure,
// once. Only the first request for the file fails.
const DIRECT_LOAD_FILES = [
  { path: '/about', file: /\/_next\/static\/chunks\/app\/about\/page-[^/]+\.js$/ },
  { path: '/tools/pace-calculator', file: /\/_next\/static\/chunks\/main-app-[^/]+\.js$/ },
];
async function reloadedPage(h) {
  for (const target of DIRECT_LOAD_FILES) {
    const run = await h.run(target.path, { ...PHONE });
    let requests = 0;
    run.block(url => target.file.test(url.pathname) && requests++ === 0);
    const page = await run.newPage();
    // The reload can interrupt the first load.
    await page.goto(SITE + target.path, { waitUntil: 'load' }).catch(() => {});
    const loads = () => run.navs.filter(nav => nav.url && new URL(nav.url).pathname === target.path).length;
    const reloaded = await waitFor(() => loads() >= 2, 15000);
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(3000);
    await run.closePage(page, { unload: true });
    await run.close();
    const errors = named(run, 'site_error').map(p => `${p.$pathname}:${p.category}`);
    h.check(`${target.path}: its file failed, the page reloaded itself and the file loaded`, requests >= 2 && reloaded, { requests, loads: loads() });
    h.check(`${target.path}: the reloaded page reports one chunk_load, and nothing else`, JSON.stringify(errors) === JSON.stringify([`${target.path}:chunk_load`]), errors);
    h.check(`${target.path}: the reloaded page sends its page view`, named(run, '$pageview').some(p => p.$pathname === target.path), shown(named(run, '$pageview')));
  }
}

// Every page that fetches data, with each of its data requests failing. Tools are taken from the registry.
const ERROR_STATE = '.tool-state.is-error, .projector-quick-text.is-error, [role="alert"], .feedback-error, .guide-error';
const OTHER_DATA_PAGES = [
  { path: '/', label: 'home page race replay' },
  { path: '/stories/race-replay' },
  { path: '/report?s=0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31&course=berlin', label: 'the race report' },
  { path: '/runners', act: async page => { await page.locator('#runner-name').fill('Smith'); await page.keyboard.press('Enter'); } },
  { path: '/analyses/pacing-pattern', label: 'an analysis after a filter change', act: async page => { await page.locator('.miy-chip').first().click(); await page.locator('.profile-refinements summary').click(); await page.getByLabel('Age group', { exact: false }).first().selectOption({ index: 3 }); await page.getByRole('button', { name: /Update comparison/ }).click(); } },
];
async function dataFailure(h, target) {
  const run = await h.run(target.path, {});
  const asked = [];
  run.block(url => { const data = url.pathname.startsWith('/data/'); if (data) asked.push(url.pathname); return data; });
  const page = await run.newPage();
  await page.goto(SITE + target.path, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (target.act) await target.act(page).catch(error => h.check('the page could be used', false, String(error).split('\n')[0]));
  const reported = () => named(run, 'site_error').some(p => p.category === 'data_fetch');
  const visible = () => page.evaluate(selector => [...document.querySelectorAll(selector)].some(el => el.getClientRects().length && el.textContent.trim())
    || /could not (be )?load|could not be verified/i.test(document.body.innerText), ERROR_STATE);
  const opened = Date.now();
  await waitFor(async () => (reported() && await visible()) || (!asked.length && Date.now() - opened > 2500), 12000, 400);
  const errorShown = await visible();
  await page.waitForTimeout(500);
  await run.close();
  if (target.needsData === false && !asked.length) { h.note(`${target.path} needs no data`); return; }
  h.check('the page asked for data', asked.length, asked);
  h.check('site_error data_fetch was sent', reported(), shown(named(run, 'site_error')));
  h.check('the page shows its own error state, not the error page', errorShown && !run.reports.some(r => r.kind === 'error-page'));
}

module.exports = {
  id: 'S6',
  title: 'Visit signals, the error page and data failures',
  jobs: ({ quick }) => {
    const { TOOLS } = require(path.join(ROOT, 'lib/tools/registry.ts'));
    const targets = [...TOOLS.map(tool => ({ path: '/tools/' + tool.slug, needsData: !!tool.file })), ...OTHER_DATA_PAGES];
    return [
      { name: 'reading signals', weight: 26, run: reading },
      { name: 'tool signals and errors', weight: 16, run: using },
      { name: 'tool edits', weight: 8, run: toolEdits },
      { name: 'planner sections, print and copy link', weight: 8, run: planner },
      { name: 'race report exports', weight: 8, run: raceReport },
      { name: 'back-forward cache', weight: 16, run: restored },
      { name: 'experiment before first paint', weight: 14, run: paintOrder },
      { name: 'error page', weight: 20, run: errorPages },
      { name: 'failed file on a direct load', weight: 14, run: reloadedPage },
      ...targets.filter(t => !quick || ['/tools/pace-band', '/'].includes(t.path)).map(t => ({ name: `data failure ${t.label || t.path}`, weight: t.needsData === false ? 4 : 3, run: h => dataFailure(h, t) })),
    ];
  },
};
