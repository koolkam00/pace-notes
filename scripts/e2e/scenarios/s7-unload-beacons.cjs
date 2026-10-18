'use strict';
// S7: what is sent while a page unloads. posthog-js flushes its queue and the recorder's buffer with sendBeacon when a
// page is left, so typed values must already be masked in what is queued. Saving a projector card and leaving at once,
// typing a time and leaving at once, and typing a time and closing the tab: no card label or time may be in any request,
// including the beacons sent as the page went away. First the harness checks itself: a beacon planted as a page unloads
// must be read and searched, and a PostHog request the page did not hand over must count as unread.
const { SITE, SELF_TEST_PATH, type, waitFor } = require('../browser.cjs');

const PLANTED = 'E2E-UNLOAD-NEEDLE-7731';
async function selfTest(h) {
  const run = await h.run('self-test', {});
  const page = await run.newPage();
  await page.goto(SITE + '/about', { waitUntil: 'load' });
  // A gzip body, as posthog-js sends it, built ahead and handed to sendBeacon only as the page goes away.
  await page.evaluate(async ({ needle, path }) => {
    const json = JSON.stringify([{ event: 'e2e_self_test', properties: { note: needle } }]);
    const gzip = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    addEventListener('pagehide', () => { navigator.sendBeacon('https://us.i.posthog.com' + path + '?compression=gzip-js', new Blob([gzip], { type: 'text/plain' })); });
  }, { needle: PLANTED, path: SELF_TEST_PATH });
  await page.goto(SITE + '/methodology', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await run.close();
  const found = h.inspect.search(run, [PLANTED]);
  h.check('a beacon planted as the page unloads is read and searched', found.length === 1 && run.sent.some(r => r.path === SELF_TEST_PATH && r.via === 'sendBeacon'), { found, sent: run.sent.map(r => `${r.via} ${r.path}`) });
  h.check('and the browser sent it', run.wire.some(r => new URL(r.url).pathname === SELF_TEST_PATH));
  const leave = run.sent.find(r => r.via === 'sendBeacon' && (r.events || []).some(e => e.event === '$pageleave'));
  h.check('the SDK\'s own unload beacon ($pageleave) is decoded', leave, run.sent.map(r => `${r.via} ${r.path} ${(r.events || []).map(e => e.event).join(',')}`));
  // The accounting itself: more PostHog requests to an address than bodies the page handed over is a problem, and so
  // is a body that could not be read.
  const url = 'https://us.i.posthog.com/i/v0/e/';
  h.check('a PostHog request the page did not hand over counts as unread', h.inspect.unread({ sent: [{ url, path: '/i/v0/e/', via: 'fetch', events: [] }], wire: [{ url }, { url }] }).some(p => /1 of 2 PostHog POSTs/.test(p)));
  h.check('a body that could not be read counts as unread', h.inspect.unread({ sent: [{ url, path: '/i/v0/e/', via: 'sendBeacon', events: null }], wire: [{ url }] }).some(p => /could not be read/.test(p)));
  h.check('a body for every request is not a problem', !h.inspect.unread({ sent: [{ url, path: '/i/v0/e/', via: 'sendBeacon', events: [] }, { url, path: '/i/v0/e/', via: 'fetch', events: [] }], wire: [{ url }] }).length);
}

async function leaving(h) {
  const run = await h.run('leaving', {});
  const page = await run.newPage();
  const sentAround = at => run.sent.some(r => r.at >= at && r.at <= at + 2000 && r.via === 'sendBeacon');

  await page.goto(SITE + '/tools/projector', { waitUntil: 'load' });
  h.check('the recorder starts on the projector', await run.waitForRecording(page));
  await page.locator('details.projector-extras > summary').click();
  await type(page, '#projector-card-label', 'Beacon Testperson');
  const saved = Date.now();
  await page.getByRole('button', { name: 'Save runner card' }).click();
  await page.goto(SITE + '/runners', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  h.check('a beacon went out as the projector unloaded', sentAround(saved));

  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  h.check('the recorder starts on the pace calculator', await run.waitForRecording(page, Date.now() - 1000));
  await type(page, page.getByLabel('Time', { exact: true }), '3:17:43');
  const typed = Date.now();
  await page.goto(SITE + '/about', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  h.check('a beacon went out as the pace calculator unloaded', sentAround(typed));

  await page.goto(SITE + '/tools/pace-calculator', { waitUntil: 'load' });
  await run.waitForRecording(page, Date.now() - 1000);
  await type(page, page.getByLabel('Time', { exact: true }), '3:16:41');
  const closed = Date.now();
  await run.closePage(page, { unload: true });
  await waitFor(() => sentAround(closed), 3000);
  h.note(`closing the tab ${sentAround(closed) ? 'sent' : 'did not send'} a final beacon`);
  await run.close();

  run.options.needles = ['Beacon Testperson', '3:17:43', '3:16:41'];
  // The browser may drop a beacon a page sends as it goes, so one $pageleave is enough to show the path is covered.
  const leaves = run.events().filter(({ e }) => e.event === '$pageleave').map(({ e }) => e.properties.$pathname);
  h.check('$pageleave for a page left by navigating away', leaves.includes('/tools/projector') || leaves.includes('/tools/pace-calculator'), leaves);
  h.note(`$pageleave sent for: ${leaves.join(', ') || 'none'}`);
}

module.exports = {
  id: 'S7',
  title: 'Beacons sent while a page unloads',
  jobs: () => [{ name: 'harness self-test', weight: 6, run: selfTest }, { name: 'leave and close', weight: 35, run: leaving }],
};
