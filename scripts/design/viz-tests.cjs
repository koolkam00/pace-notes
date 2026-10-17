#!/usr/bin/env node
'use strict';
// Browser tests for the chart scrubber and the race replay (WP0-C acceptance; the redesign spec, section 8, WP0-C),
// against the static export, served the way shoot.cjs serves it (no port, no other host).
//
//   node scripts/design/viz-tests.cjs [--dir=out] [--route=/design-system] [--out=<dir for captures>]
//
// Scrubber, on a phone (touch) and a desktop (mouse): a horizontal drag moves the needle with the finger, a vertical
// drag scrolls the page and leaves it, a tap sets it, the arrows step one point and PageUp/PageDown jump between
// detents, the live readout line settles after the drag, and the needle opens on the detent the headline names.
// Replay: the poster holds the frame (no layout shift when the canvas arrives), it opens on the edition the data picks,
// autoplay starts within 20 race-minutes of the flag and pauses on the flag with its sentence, it is still under
// reduced motion, .replay and .hero-replay are kept, the canvas code is in no page's initial scripts, and RaceReplay's
// source holds no colour literal.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { serve, SITE } = require('./shoot.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const DIR = path.resolve(ROOT, args.dir || 'out');
const ROUTE = args.route || '/design-system';
const OUT = path.resolve(args.out || path.join(os.tmpdir(), 'pace-notes-viz-tests'));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 400)}`}`); };
const pause = (page, ms) => page.waitForTimeout(ms);
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

async function context(browser, options) {
  const ctx = await browser.newContext({ reducedMotion: 'no-preference', ...options });
  await serve(ctx, DIR, []);
  return ctx;
}

/** The histogram scrubber's state: needle and crown x, the slider's value and the settled live line. */
const state = (page, sel) => page.evaluate((sel) => {
  const fig = document.querySelector(sel);
  const slider = fig.querySelector('[role="slider"]');
  const needle = fig.querySelector('.scrub-needle').getBoundingClientRect();
  const crown = fig.querySelector('.scrub-crown').getBoundingClientRect();
  const plot = slider.getBoundingClientRect();
  return {
    now: Number(slider.getAttribute('aria-valuenow')), text: slider.getAttribute('aria-valuetext'),
    live: fig.querySelector('.scrub [aria-live="polite"]').textContent, needleX: needle.left + needle.width / 2, crownX: crown.left + crown.width / 2,
    plot: { x: plot.left, y: plot.top, w: plot.width, h: plot.height }, scrollY: window.scrollY,
  };
}, sel);

async function touchDrag(page, cdp, from, to, steps = 14) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
    await pause(page, 16);
  }
}
const touchEnd = (cdp) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

async function scrubberTests(browser) {
  const ft = json('public/data/insights/finish-times.json');
  const marks = ft.marks.filter((m) => m.kind !== 'quarter' && m.minutes - 1 >= 150 && m.minutes - 1 < 330);
  const top = marks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const sel = '#ds-histogram figure.viz';

  for (const [name, options] of [['phone', PHONE], ['desktop', DESKTOP]]) {
    const ctx = await context(browser, options);
    const page = await ctx.newPage();
    await page.goto(SITE + ROUTE, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
    await pause(page, 500);
    const s0 = await state(page, sel);
    check(`${name}: the needle opens on the detent the headline names (${hm(top.minutes - 1)}, before ${top.mark})`, s0.text.includes(`minute ${hm(top.minutes - 1)}`), s0.text);

    const y = s0.plot.y + s0.plot.h * 0.6;
    const x0 = s0.plot.x + s0.plot.w * 0.5, x1 = s0.plot.x + s0.plot.w * 0.3;
    if (name === 'phone') {
      const cdp = await ctx.newCDPSession(page);
      await touchDrag(page, cdp, { x: x0, y }, { x: x1, y: y + 2 });
      const mid = await state(page, sel);
      await page.screenshot({ path: path.join(OUT, `${name}-scrub-dragging.png`) });
      check(`${name}: a horizontal drag moves the needle with the finger (within a bin and the 8 px snap)`, Math.abs(mid.needleX - x1) <= 10 && Math.abs(mid.crownX - mid.needleX) < 1.5, { needle: mid.needleX, finger: x1 });
      const before = mid.live;
      await touchEnd(cdp);
      await pause(page, 60);
      const early = await state(page, sel);
      await pause(page, 260);
      const settled = await state(page, sel);
      check(`${name}: the live readout settles after the drag (literal aria-live, updated after 150 ms)`, settled.live === settled.text && settled.live !== s0.live, { before, early: early.live, settled: settled.live });
      // A vertical drag scrolls and leaves the needle where it is.
      const v0 = await state(page, sel);
      await touchDrag(page, cdp, { x: s0.plot.x + s0.plot.w * 0.7, y: v0.plot.y + v0.plot.h * 0.8 }, { x: s0.plot.x + s0.plot.w * 0.7 + 4, y: v0.plot.y + v0.plot.h * 0.8 - 160 }, 12);
      await touchEnd(cdp);
      await pause(page, 500);
      const v1 = await state(page, sel);
      check(`${name}: a vertical drag scrolls the page and leaves the needle`, v1.scrollY > v0.scrollY + 40 && v1.now === v0.now, { scrolled: v1.scrollY - v0.scrollY, now: [v0.now, v1.now] });
      // A tap sets the needle.
      const tx = v1.plot.x + v1.plot.w * 0.8, ty = v1.plot.y + v1.plot.h * 0.5;
      await page.touchscreen.tap(tx, ty);
      await pause(page, 300);
      const t1 = await state(page, sel);
      check(`${name}: a tap sets the needle`, Math.abs(t1.needleX - tx) <= 10 && t1.now !== v1.now, { needle: t1.needleX, tap: tx });
    } else {
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let i = 1; i <= 14; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 14, y + i * 0.1);
      const mid = await state(page, sel);
      await page.screenshot({ path: path.join(OUT, `${name}-scrub-dragging.png`) });
      check(`${name}: a horizontal drag moves the needle with the pointer`, Math.abs(mid.needleX - x1) <= 10, { needle: mid.needleX, pointer: x1 });
      await page.mouse.up();
      await pause(page, 320);
      const settled = await state(page, sel);
      check(`${name}: the live readout settles after the drag`, settled.live === settled.text && settled.live !== s0.live, settled.live);
      // Hover moves it; leaving returns it to the last value set.
      await page.mouse.move(s0.plot.x + s0.plot.w * 0.85, y);
      await pause(page, 100);
      const hover = await state(page, sel);
      await page.mouse.move(s0.plot.x + s0.plot.w * 0.85, s0.plot.y - 120);
      await pause(page, 100);
      const left = await state(page, sel);
      check(`${name}: hover moves the needle and leaving returns it`, hover.now !== settled.now && left.now === settled.now, { settled: settled.now, hover: hover.now, left: left.now });
    }
    // Keyboard: arrows step one point; PageUp and PageDown jump between detents; Home and End.
    await page.locator(`${sel} [role="slider"]`).focus();
    const k0 = await state(page, sel);
    await page.keyboard.press('ArrowRight');
    const k1 = await state(page, sel);
    await page.keyboard.press('PageUp');
    const k2 = await state(page, sel);
    await page.keyboard.press('PageUp');
    const k3 = await state(page, sel);
    await page.keyboard.press('PageDown');
    const k4 = await state(page, sel);
    await page.keyboard.press('End');
    const k5 = await state(page, sel);
    await page.keyboard.press('Home');
    const k6 = await state(page, sel);
    const detentText = (s) => marks.some((m) => s.text.includes(`minute ${hm(m.minutes - 1)}`));
    check(`${name}: ArrowRight steps one point`, k1.now === k0.now + 1, [k0.now, k1.now]);
    check(`${name}: PageUp and PageDown jump between detents (the minutes before round marks)`, k2.now > k1.now && k3.now > k2.now && k4.now === k2.now && detentText(k2) && detentText(k3), [k1.now, k2.now, k3.now, k4.now, k2.text, k3.text]);
    check(`${name}: End and Home go to the ends`, k6.now === 0 && k5.now > k4.now, [k5.now, k6.now]);
    await page.screenshot({ path: path.join(OUT, `${name}-scrub-keyboard.png`) });
    await ctx.close();
  }
}

async function replayTests(browser) {
  const index = json('public/data/insights/replay.json');
  const best = index.editions.filter((e) => e.moments && e.finishes > 0).reduce((a, b) => (b.moments.not_past_20_at_first / b.finishes > a.moments.not_past_20_at_first / a.finishes ? b : a));
  const flag = best.moments.first_finish_s;
  const clockToS = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
  const sel = '#ds-replay .hero-replay';

  const ctx = await context(browser, PHONE);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, sources: (e.sources || []).map((s) => s.node && s.node.className && String(s.node.className).slice(0, 60)) }); }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(SITE + ROUTE, { waitUntil: 'load' });
  check('replay: .replay and .hero-replay are kept', await page.locator('.hero-replay.replay').count() >= 2, null);
  const frameBefore = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { h: r.height, w: r.width }; }, sel);
  const posterFirst = await page.evaluate((sel) => !!document.querySelector(`${sel} .replay-poster`) && !document.querySelector(`${sel} canvas`), sel);
  check('replay: the server poster is in place before the canvas', posterFirst, null);
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
  // The first clock reading once the canvas runs: within 20 race-minutes before the flag.
  let first = null;
  for (let i = 0; i < 60 && first === null; i++) {
    await pause(page, 100);
    first = await page.evaluate((sel) => (document.querySelector(`${sel} canvas.is-shown`) ? document.querySelector(`${sel} .replay-clock`).textContent : null), sel);
  }
  check(`replay: it opens on ${best.city} ${best.year}, the edition the data picks`, (await page.locator(`${sel} .replay-race`).textContent()).trim() === `${best.city} ${best.year}`, await page.locator(`${sel} .replay-race`).textContent());
  check('replay: autoplay starts within 20 race-minutes of the flag', first !== null && clockToS(first) >= flag - 20 * 60 - 1 && clockToS(first) <= flag, { first, flag });
  await pause(page, 3000);
  await page.screenshot({ path: path.join(OUT, 'replay-playing.png') });
  await pause(page, 5500);
  const atFlag = await page.evaluate((sel) => ({
    clock: document.querySelector(`${sel} .replay-clock`).textContent,
    playLabel: document.querySelector(`${sel} .replay-play`).textContent,
    moment: document.querySelector(`${sel} .replay-moment`).textContent,
    momentOff: document.querySelector(`${sel} .replay-moment`).classList.contains('is-off'),
  }), sel);
  await page.screenshot({ path: path.join(OUT, 'replay-flag.png') });
  check('replay: it pauses on the flag with the sentence shown', Math.abs(clockToS(atFlag.clock) - flag) <= 1 && /play/i.test(atFlag.playLabel) && !atFlag.momentOff && /first runner finished/.test(atFlag.moment), atFlag);
  const frameAfter = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { h: r.height, w: r.width }; }, sel);
  const shifts = await page.evaluate(() => window.__shifts);
  const replayShift = shifts.filter((s) => s.sources.some((c) => c && /replay/.test(c))).reduce((sum, s) => sum + s.value, 0);
  check('replay: no layout shift while it loads (the frame keeps its size)', frameBefore.h === frameAfter.h && replayShift === 0, { frameBefore, frameAfter, replayShift });
  // Play continues past the flag.
  await page.locator(`${sel} .replay-play`).click();
  await pause(page, 1500);
  const later = await page.locator(`${sel} .replay-clock`).textContent();
  check('replay: play continues past the flag', clockToS(later) > flag + 60, { later, flag });
  await ctx.close();

  const still = await context(browser, { ...PHONE, reducedMotion: 'reduce' });
  const p2 = await still.newPage();
  await p2.goto(SITE + ROUTE, { waitUntil: 'load' });
  await p2.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
  await pause(p2, 2500);
  const a = await p2.locator(`${sel} .replay-clock`).textContent();
  await pause(p2, 2500);
  const b = await p2.locator(`${sel} .replay-clock`).textContent();
  await p2.screenshot({ path: path.join(OUT, 'replay-reduced.png') });
  check('replay: under reduced motion it is still, on the flag frame', a === b && Math.abs(clockToS(a) - flag) <= 1, { a, b, flag });
  await still.close();
}

function staticTests() {
  const src = fs.readFileSync(path.join(ROOT, 'components/viz/RaceReplay.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check('replay: RaceReplay.tsx holds no colour literal', !/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(src), null);
  // The canvas code: its own chunk, in no page's initial scripts.
  const chunks = path.join(DIR, '_next', 'static', 'chunks');
  const files = fs.readdirSync(chunks, { recursive: true }).filter((f) => f.endsWith('.js'));
  const replayChunk = files.filter((f) => fs.readFileSync(path.join(chunks, f), 'utf8').includes('--night-signal'));
  const pages = fs.readdirSync(DIR, { recursive: true }).filter((f) => f.endsWith('.html'));
  const loading = pages.filter((f) => replayChunk.some((c) => fs.readFileSync(path.join(DIR, f), 'utf8').includes(path.basename(c))));
  check('replay: the canvas code is a lazy chunk, in no page\'s initial scripts (courses without a replay never fetch it)', replayChunk.length >= 1 && loading.length === 0, { replayChunk, loading: loading.slice(0, 5) });
}

(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) throw new Error(`No export at ${DIR}: run npm run build first.`);
  staticTests();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'] });
  try {
    await scrubberTests(browser);
    await replayTests(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'viz-tests.json'), JSON.stringify(results, null, 1));
  console.log(`${results.length - failed.length}/${results.length} checks pass → ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
