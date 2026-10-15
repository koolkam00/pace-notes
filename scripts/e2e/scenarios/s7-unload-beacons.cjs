'use strict';
// S7: what is sent while a page unloads. posthog-js flushes its queue and the recorder's buffer with sendBeacon when a
// page is left, so typed values must already be masked in what is queued. Saving a projector card and leaving at once,
// typing a time and leaving at once, and typing a time and closing the tab: no card label or time may be in any request,
// including the beacons sent as the page went away.
const { SITE, type, waitFor } = require('../browser.cjs');

async function leaving(h) {
  const run = await h.run('leaving', {});
  const page = await run.newPage();
  const sentAround = at => run.sent.some(r => r.at >= at && r.at <= at + 2000);

  await page.goto(SITE + '/tools/projector', { waitUntil: 'load' });
  h.check('the recorder starts on the projector', await run.waitForRecording(page));
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
  jobs: () => [{ name: 'leave and close', weight: 35, run: leaving }],
};
