'use strict';
// S5: every sitemap page with Safari before 16.4 emulated (building a lookbehind RegExp throws, and any served script
// that holds one counts as a crash there), on a phone. No page may crash or show the error page, every page must still
// send its page view, and none may report a site_error. Then the lazily loaded analytics chunks failing one at a time
// (the recorder, the replay policy, the Web Vitals code): analytics stays off for that page and the page still works.
const fs = require('node:fs');
const path = require('node:path');
const { SITE, wiggle, type, waitFor } = require('../browser.cjs');

const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const BATCH = 12;

function sitemapPages(out) {
  const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  return [...sitemap.matchAll(/<loc>https:\/\/splithappens\.run([^<]*)<\/loc>/g)].map(m => m[1] || '/');
}

async function sweep(h, pages) {
  const run = await h.run('Safari 15', { ...PHONE, safari15: true });
  const rows = [];
  for (const pathname of pages) {
    const page = await run.newPage();
    const opened = Date.now();
    let loaded = true;
    await page.goto(SITE + pathname, { waitUntil: 'load', timeout: 45000 }).catch(() => { loaded = false; });
    // Long enough for the SDK to load and initialise (its remote config request), then leave, so the page view goes out.
    const initialised = await waitFor(() => run.requests.some(r => r.at > opened && /\/array\/[^/]+\/config$/.test(r.path)), 8000);
    await page.waitForTimeout(600);
    const lookbehind = await page.evaluate(() => window.__e2eLookbehind.length).catch(() => -1);
    await run.closePage(page, { unload: true });
    rows.push({ pathname, loaded, initialised, lookbehind });
  }
  await run.close();
  const views = new Set(run.events().filter(({ e }) => e.event === '$pageview').map(({ e }) => e.properties.$pathname));
  const missing = rows.filter(r => !views.has(h.inspect.policy.analyticsPath(r.pathname)));
  h.check('every page loaded', rows.every(r => r.loaded), rows.filter(r => !r.loaded).map(r => r.pathname));
  h.check('no page built a lookbehind', rows.every(r => r.lookbehind === 0), rows.filter(r => r.lookbehind !== 0).map(r => r.pathname));
  h.check('every page sent its page view', !missing.length, missing.map(r => `${r.pathname}${r.initialised ? '' : ' (the SDK did not start)'}`));
  const errors = run.events().filter(({ e }) => e.event === 'site_error').map(({ e }) => `${e.properties.$pathname}: ${e.properties.category}`);
  h.check('no page reported a site_error', !errors.length, errors);
}

// The lazily loaded chunks, found by what only each of them holds.
const CHUNKS = {
  recorder: text => text.includes('rrwebPlugins') && text.includes('MutationObserver') && !text.includes('__pace_notes_ss__'),
  'replay policy': text => text.includes('__pace_notes_ss__'),
  'Web Vitals': text => text.includes('postHogWebVitalsCallbacks') && text.includes('onINP') && !text.includes('capture_pageview'),
};

async function chunkFails(h, name) {
  const dir = path.join(h.out, '_next', 'static', 'chunks');
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.js') && CHUNKS[name](fs.readFileSync(path.join(dir, file), 'utf8')));
  if (!h.check(`exactly one ${name} chunk in the build`, files.length === 1, files)) return;
  const run = await h.run(`${name} chunk fails`, {});
  run.block(url => url.pathname === `/_next/static/chunks/${files[0]}`);
  const page = await run.newPage();
  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await type(page, page.getByLabel('Time', { exact: true }), '3:17:43');
  await page.waitForTimeout(800);
  const status = await page.locator('.tool-workspace [role="status"], .tool-results').first().innerText().catch(() => '');
  h.check('the tool still works', /\d:\d\d/.test(status), status.slice(0, 120));
  await wiggle(page, 6);
  await page.locator('nav.main-nav a[href="/stories"]').click();
  await page.waitForURL(url => new URL(url).pathname === '/stories');
  await wiggle(page, 6);
  await page.waitForTimeout(7000);
  h.check('the page still navigates', new URL(page.url()).pathname === '/stories');
  await run.close();
  h.check(`the ${name} chunk was requested (and failed)`, run.requests.some(r => r.path.endsWith(files[0])));
  const sent = run.posthogRequests().filter(r => r.method === 'POST');
  h.check('nothing is sent without the full analytics bundle', !sent.length, sent.map(r => r.path));
}

module.exports = {
  id: 'S5',
  title: 'Every sitemap page in emulated Safari 15; failed analytics chunks',
  jobs: ({ quick, out }) => {
    const pages = sitemapPages(out);
    const chosen = quick ? pages.filter((_, i) => i % 10 === 0) : pages;
    const batches = [];
    for (let i = 0; i < chosen.length; i += BATCH) batches.push(chosen.slice(i, i + BATCH));
    return [
      ...batches.map((batch, i) => ({ name: `sitemap pages ${i * BATCH + 1}–${i * BATCH + batch.length} of ${chosen.length}`, weight: batch.length * 1.6, run: h => sweep(h, batch) })),
      ...Object.keys(CHUNKS).filter(name => !quick || name === 'recorder').map(name => ({ name: `${name} chunk fails`, weight: 10, run: h => chunkFails(h, name) })),
    ];
  },
};
