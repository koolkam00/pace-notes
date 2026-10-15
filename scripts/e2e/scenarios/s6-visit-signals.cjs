'use strict';
// S6: the visit signals (docs/ANALYTICS.md, events table), each triggered in the browser and checked as sent: campaign
// tags on the first page view (allowed and junk values, and the address cleaned), section views, units, reading depth
// and $pageleave, "Was this useful?", tool use, runner search results, Web Vitals and errors by kind only. Then the
// error page (a render error, and a page chunk that fails to load), and every page that fetches data with its data
// requests failing: each reports data_fetch and shows its own error state. `$feature/*` may appear only for a running
// experiment in lib/experiments.ts; the runs plant a stale variant and an unknown one, which must never be sent.
const path = require('node:path');
const { SITE, type, waitFor } = require('../browser.cjs');
const { ROOT } = require('../inspect.cjs');

const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };
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
  await page.click('.unit-switch button:has-text("Kilometres")'); await page.waitForTimeout(300);
  await page.click('.unit-switch button:has-text("Kilometres")'); await page.waitForTimeout(300);
  await page.click('.unit-switch button:has-text("Miles")'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('a.story-card[href^="/stories/"]').click());
  await page.waitForURL(url => new URL(url).pathname.startsWith('/stories/'));
  await page.waitForTimeout(1500);
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(70); }
  const feedback = page.locator('.page-feedback');
  await feedback.locator('button:has-text("No")').click();
  await feedback.locator('button:has-text("The numbers look wrong")').click();
  await feedback.locator('button:has-text("Hard to follow")').click({ force: true });
  await feedback.locator('button:has-text("Yes")').click({ force: true });
  h.check('feedback says thank you', /Thank you/.test(await feedback.locator('[role="status"]').innerText()));
  await page.waitForTimeout(1500);
  await page.goto(SITE + '/about', { waitUntil: 'load' }); // a full load: the story's $pageleave
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await page.waitForTimeout(2500);
  await run.closePage(page, { unload: true });
  await new Promise(resolve => setTimeout(resolve, 1500));
  await run.close();

  const views = named(run, '$pageview');
  h.check('the first page view carries the Instagram tags', views[0] && views[0].$pathname === '/' && views[0].utm_source === 'instagram' && views[0].utm_medium === 'social' && views[0].utm_content === 'bio', shown(views.slice(0, 1)));
  h.check('later page views carry no tags', views.slice(1).every(p => !Object.keys(p).some(k => k.startsWith('utm_'))), shown(views.slice(1)));
  const sections = named(run, 'section_viewed').filter(p => p.$pathname === '/').map(p => p.section);
  h.check('each home section is counted once, in page order', JSON.stringify(sections) === JSON.stringify(order), { sent: sections, page: order });
  h.check('units_changed only on a real change (km, then mi)', JSON.stringify(named(run, 'units_changed').map(p => p.units)) === '["km","mi"]', shown(named(run, 'units_changed')));
  const story = views.find(p => p.$pathname.startsWith('/stories/'));
  h.check('the story\'s page view names the home page and its reading figures', story && story.$prev_pageview_pathname === '/' && Number.isInteger(story.$prev_pageview_duration) && story.$prev_pageview_max_scroll_percentage > 0, story && shown([story]));
  h.check('one answer and one reason per page view', JSON.stringify(named(run, 'page_feedback').map(p => p.answer)) === '["no"]' && JSON.stringify(named(run, 'page_feedback_reason').map(p => p.reason)) === '["numbers_look_wrong"]', shown([...named(run, 'page_feedback'), ...named(run, 'page_feedback_reason')]));
  const leave = named(run, '$pageleave');
  h.check('$pageleave with the time on page and scroll depth', leave.some(p => Number.isInteger(p.$prev_pageview_duration) && typeof p.$prev_pageview_max_scroll_percentage === 'number'), shown(leave));
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
  const vitals = named(run, '$web_vitals');
  h.check('$web_vitals with measured values', vitals.some(p => Number.isInteger(p.$web_vitals_LCP_value) || Number.isInteger(p.$web_vitals_FCP_value)), shown(vitals));
  experimentChecks(h, run);
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

// Every page that fetches data, with each of its data requests failing. Tools are taken from the registry.
const ERROR_STATE = '.tool-state.is-error, .projector-quick-text.is-error, [role="alert"], .feedback-error, .guide-error';
const OTHER_DATA_PAGES = [
  { path: '/', label: 'home page race replay' },
  { path: '/stories/race-replay' },
  { path: '/courses/boston' },
  { path: '/research/personalized' },
  { path: '/runners', act: async page => { await page.locator('#runner-name').fill('Smith'); await page.keyboard.press('Enter'); } },
  { path: '/analyses/pacing-pattern', label: 'an analysis after a filter change', act: async page => { await page.locator('.profile-refinements summary').click(); await page.getByLabel('Age group', { exact: false }).first().selectOption({ index: 3 }); await page.getByRole('button', { name: /Update comparison/ }).click(); } },
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
      { name: 'reading signals', weight: 21, run: reading },
      { name: 'tool signals and errors', weight: 16, run: using },
      { name: 'error page', weight: 20, run: errorPages },
      ...targets.filter(t => !quick || ['/tools/pace-band', '/'].includes(t.path)).map(t => ({ name: `data failure ${t.label || t.path}`, weight: t.needsData === false ? 4 : 3, run: h => dataFailure(h, t) })),
    ];
  },
};
