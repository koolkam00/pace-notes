'use strict';
// Interaction captures for shoot.cjs --ix (the redesign spec, section 8.0). Each interaction looks for its control on
// the page; a page without it records "n/a" rather than failing. Every capture is a viewport screenshot taken with the
// control in view, named <slug>-ix-<name>.png beside the profile's other captures. Interactions that assert behaviour
// (the sheet's dialog contract) record ok: false with the reason when an assertion fails.
const path = require('node:path');

const pause = (page, ms) => page.waitForTimeout(ms);

/** The first visible element matching a selector, or null. */
async function visible(page, selector) {
  const all = page.locator(selector);
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    const el = all.nth(i);
    if (await el.isVisible().catch(() => false)) return el;
  }
  return null;
}

async function inView(el) {
  await el.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await el.page().waitForTimeout(250);
}

/** A horizontal drag across an element from one fraction of its width to another (touch-like on phones). */
async function drag(page, el, from, to, steps = 12) {
  const box = await el.boundingBox();
  if (!box) return false;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width * from, x1 = box.x + box.width * to;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y + i * 0.2);
  return { x0, x1, y };
}

/** Which element has focus, as a short description. */
const focused = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  return `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.className && typeof a.className === 'string' ? '.' + a.className.trim().split(/\s+/).join('.') : ''}`;
});

const INTERACTIONS = [
  {
    // The menu sheet open; at 200% zoom (195 px) too, where every link must scroll into view with its text in its row.
    name: 'menu-open',
    selector: '.site-header .nav-toggle',
    profiles: ['phone', 'desktop', 'zoom'],
    async run(page, el, snap, ctx) {
      const problems = [];
      await page.evaluate(() => window.scrollTo(0, 0));
      await el.click();
      await pause(page, 750);
      await snap('menu-open');
      if (ctx.profile === 'zoom') {
        const links = await page.evaluate(async () => {
          const out = [];
          for (const a of document.querySelectorAll('#site-menu a, #site-sheet .chapter-link')) {
            a.scrollIntoView({ block: 'nearest' });
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const box = a.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(a);
            const text = range.getBoundingClientRect();
            out.push({ text: a.textContent.trim().slice(0, 30), top: Math.round(box.top), bottom: Math.round(box.bottom), over: Math.round(Math.max(0, text.right - box.right, box.left - text.left)) });
          }
          return { h: innerHeight, out };
        });
        for (const l of links.out) if (l.top < 0 || l.bottom > links.h || l.over > 1) problems.push(`"${l.text}" cannot be scrolled fully into view or overflows its row (${JSON.stringify(l)})`);
        await page.evaluate(() => { const a = document.querySelector('#site-sheet .chapter-link'); if (a) a.scrollIntoView({ block: 'start' }); });
        await pause(page, 300);
        await snap('menu-chapters');
      }
      await page.keyboard.press('Escape');
      await pause(page, 650);
      if (await el.getAttribute('aria-expanded') === 'true') problems.push('Escape did not close the menu');
      return problems;
    },
  },
  {
    // The Sheet primitive's contract (spec §3.5 and §2.4): opens, traps focus, closes on Escape and on the scrim,
    // returns focus to its opener, and cannot be focused while closed.
    name: 'sheet-dialog',
    selector: '[data-sheet-open]',
    async run(page, el, snap) {
      const problems = [];
      const id = await el.getAttribute('data-sheet-open');
      const sheet = page.locator(`#${id}`);
      await inView(el);
      if (await sheet.evaluate((s) => !s.hasAttribute('inert') && !s.hidden)) problems.push('closed sheet is neither inert nor hidden');
      await el.focus();
      await page.keyboard.press('Enter');
      await pause(page, 700);
      await snap('sheet-open');
      if (await sheet.getAttribute('aria-modal') !== 'true') problems.push('open sheet lacks aria-modal="true"');
      const inside = () => sheet.evaluate((s) => s.contains(document.activeElement));
      if (!(await inside())) problems.push('focus did not move into the sheet');
      for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); if (!(await inside())) { problems.push(`Tab ${i + 1} left the sheet`); break; } }
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); if (!(await inside())) { problems.push(`Shift+Tab ${i + 1} left the sheet`); break; } }
      await page.keyboard.press('Escape');
      await pause(page, 700);
      if (!(await sheet.evaluate((s) => s.hasAttribute('inert') || s.hidden))) problems.push('Escape did not close the sheet');
      const back = await el.evaluate((node) => node === document.activeElement);
      if (!back) problems.push(`focus did not return to the opener (it is on ${await focused(page)})`);
      await el.click();
      await pause(page, 700);
      const scrim = page.locator(`#${id}-scrim`);
      if (await scrim.count()) {
        const vp = page.viewportSize();
        await page.mouse.click(Math.round(vp.width / 2), 12);
        await pause(page, 700);
        if (!(await sheet.evaluate((s) => s.hasAttribute('inert') || s.hidden))) problems.push('a scrim tap did not close the sheet');
      } else problems.push('no scrim element');
      const tabbable = await sheet.evaluate((s) => {
        const q = s.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])');
        return Array.from(q).filter((n) => !n.closest('[inert]') && !n.closest('[hidden]')).length;
      });
      if (tabbable) problems.push(`${tabbable} controls in the closed sheet can still take focus`);
      return problems;
    },
  },
  {
    // Make it yours (spec section 3.5): under 900 px one inline row at the top of the explorer beat that covers nothing
    // and opens the form in a sheet; from 900 px the form inline. Captures the row, the open sheet and the inline form.
    name: 'make-it-yours',
    selector: '.miy-chip, .miy-panel',
    profiles: ['phone', 'desktop', 'dark', 'zoom'],
    async run(page, el, snap) {
      const problems = [];
      await inView(el);
      if (!(await el.evaluate((n) => n.classList.contains('miy-chip')))) { await snap('miy-inline'); return problems; }
      const pos = await el.evaluate((n) => getComputedStyle(n).position);
      if (pos === 'fixed' || pos === 'sticky') problems.push(`the chip is ${pos}; it must sit inline in its beat`);
      const box = await el.boundingBox();
      if (box && box.height < 44) problems.push(`the chip is ${Math.round(box.height)} px tall`);
      await snap('miy-chip');
      await el.click();
      await pause(page, 700);
      await snap('miy-sheet');
      const id = await el.getAttribute('aria-controls');
      const sheet = page.locator(`#${id}`);
      if (await sheet.getAttribute('aria-modal') !== 'true') problems.push('the open sheet lacks aria-modal="true"');
      await page.keyboard.press('Escape');
      await pause(page, 700);
      if (await el.getAttribute('aria-expanded') === 'true') problems.push('Escape did not close the sheet');
      return problems;
    },
  },
  {
    name: 'scrub',
    selector: 'figure.viz [role="slider"]',
    async run(page, el, snap, ctx) {
      await inView(el);
      const d = await drag(page, el, 0.5, 0.3);
      if (!d) return ['slider has no box'];
      await pause(page, 200);
      await snap('scrub-dragging');
      await page.mouse.up();
      await pause(page, 250);
      await snap('scrub-30');
      await el.focus();
      await page.keyboard.press('PageUp');
      await pause(page, 300);
      await snap('scrub-detent');
      return [];
    },
  },
  {
    name: 'guess',
    selector: '.guess input[type="range"]',
    async run(page, el, snap) {
      await inView(el);
      const d = await drag(page, el, 0.2, 0.62, 10);
      if (!d) return ['guess slider has no box'];
      await pause(page, 150);
      await snap('guess-dragging');
      await page.mouse.up();
      const lock = page.locator('.guess').getByRole('button', { name: /lock it in/i }).first();
      if (await lock.count()) { await lock.click(); await pause(page, 1100); await snap('guess-revealed'); }
      else return ['no "Lock it in" button'];
      return [];
    },
  },
  {
    name: 'segment',
    selector: '.seg button[aria-pressed="false"], .segmented button[aria-pressed="false"]',
    async run(page, el, snap) {
      // A handle, not the locator: once pressed, the button no longer matches the selector.
      const button = await el.elementHandle();
      await inView(el);
      await button.click();
      await pause(page, 650);
      await snap('segment-changed');
      return (await button.getAttribute('aria-pressed')) === 'true' ? [] : ['the pressed segment did not report aria-pressed="true"'];
    },
  },
  {
    name: 'chips',
    selector: '.chips button[aria-pressed="false"]',
    async run(page, el, snap) {
      const chip = await el.elementHandle();
      await inView(el);
      await chip.click();
      await pause(page, 400);
      await snap('chip-selected');
      return (await chip.getAttribute('aria-pressed')) === 'true' ? [] : ['the chosen chip did not report aria-pressed="true"'];
    },
  },
  {
    // The story's one step-by-step reveal: its graphic pinned with the second and the last step current. A full-page
    // capture cannot show a sticky graphic, so these viewport captures are how a scrolly is reviewed.
    name: 'scrolly',
    selector: '.scrolly',
    async run(page, el, snap) {
      const steps = el.locator('.scrolly-step');
      const n = await steps.count();
      if (n < 2) return ['a scrolly needs at least two steps'];
      const problems = [];
      for (const [i, name] of [[1, 'scrolly-step-2'], [n - 1, 'scrolly-step-last']]) {
        // The step's text just past the line that makes it current: on a phone 12% of the screen under the pinned
        // graphic (the line is one 30svh step under it), from 900 px two thirds down (the line is at 72%).
        await steps.nth(i).evaluate((node) => {
          const t = node.querySelector('p') || node;
          const root = node.closest('.scrolly'), g = root && root.querySelector('.scrolly-graphic');
          const wide = window.matchMedia('(min-width: 900px)').matches;
          const foot = (parseFloat(getComputedStyle(root).getPropertyValue('--reading-h')) || 36) + (g ? g.offsetHeight : 0);
          const at = wide || !g ? window.innerHeight * 0.66 : foot + window.innerHeight * 0.12;
          window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - at);
        });
        await pause(page, 900);
        await snap(name);
        const state = await el.evaluate((node) => ({ step: node.dataset.step, still: node.classList.contains('is-static') }));
        if (!state.still && state.step !== String(i)) problems.push(`step ${i + 1} did not become current (data-step=${state.step})`);
      }
      return problems;
    },
  },
  {
    // The replay at its flag frame (waits for the run-up to land, up to 10 s), then playing. At the flag, no label over
    // the field may sit on a drawn runner: the canvas's pixels under every label box (the mats, the mark, the first
    // finisher, the split share) are read back, and a label with bright runner pixels under it is a collision the layout linter cannot see.
    name: 'replay',
    selector: '.replay',
    async run(page, el, snap) {
      const problems = [];
      await inView(el);
      await page.waitForFunction((node) => {
        const m = node.querySelector('.replay-moment');
        return !!node.querySelector('canvas.replay-canvas.is-shown') && (!m || !m.classList.contains('is-off'));
      }, await el.elementHandle(), { timeout: 10000 }).catch(() => problems.push('the flag frame did not arrive within 10 s'));
      await pause(page, 400);
      await snap('replay-flag');
      const hits = await el.evaluate((node) => {
        const canvas = node.querySelector('canvas.replay-canvas');
        if (!canvas || !canvas.width) return [];
        const g = canvas.getContext('2d');
        const c = canvas.getBoundingClientRect();
        const sx = canvas.width / c.width, sy = canvas.height / c.height;
        const out = [];
        for (const label of node.querySelectorAll('.replay-mats span, .replay-mark b, .replay-first b, .replay-split')) {
          const r = label.getBoundingClientRect();
          if (!r.width || !r.height || getComputedStyle(label).display === 'none') continue;
          const x0 = Math.max(r.left, c.left), x1 = Math.min(r.right, c.right), y0 = Math.max(r.top, c.top), y1 = Math.min(r.bottom, c.bottom);
          if (x1 - x0 < 1 || y1 - y0 < 1) continue;
          const data = g.getImageData(Math.floor((x0 - c.left) * sx), Math.floor((y0 - c.top) * sy), Math.max(1, Math.floor((x1 - x0) * sx)), Math.max(1, Math.floor((y1 - y0) * sy))).data;
          let bright = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 90 && data[i] + data[i + 1] + data[i + 2] > 420) bright += 1;
          if (bright > 3) out.push(`"${label.textContent.trim()}" sits on ${bright} runner pixels`);
        }
        return out;
      });
      problems.push(...hits);
      const play = el.locator('button').filter({ hasText: /play|▶/i }).first();
      if (await play.count()) {
        await play.click().catch(() => {}); await pause(page, 1500); await snap('replay-playing');
        // The flag frame's marks are true at that frame only: once the clock runs on, none may still show.
        const stale = await el.evaluate((node) => [...node.querySelectorAll('.replay-mark, .replay-first, .replay-split')]
          .filter((m) => Number(getComputedStyle(m).opacity) > 0.05).map((m) => m.textContent.trim() || m.className));
        for (const m of stale) problems.push(`"${m}" still shows while the replay plays past its flag frame`);
      }
      return problems;
    },
  },
  {
    name: 'values-open',
    selector: 'details.values > summary',
    async run(page, el, snap) {
      await inView(el);
      // A disclosure the page opens by default is captured as it is.
      if (!(await el.evaluate((s) => s.parentElement.open))) await el.click();
      await pause(page, 450);
      await inView(el);
      await snap('values-open');
      return (await el.evaluate((s) => s.parentElement.open)) ? [] : ['Values did not open'];
    },
  },
  {
    name: 'share-sheet',
    selector: '[data-share-open]',
    async run(page, el, snap) {
      await inView(el);
      await el.click();
      await pause(page, 1600);
      await snap('share-sheet');
      await page.keyboard.press('Escape');
      return [];
    },
  },
  {
    // The reading bar: on a reading page, mid-way down, while the header is away. Its ticks sit at the beats' starts,
    // and its minutes left agree within one with a count written here: the words of the text below the screen ÷ 238,
    // plus 12 s for each figure below it.
    name: 'reading-bar',
    selector: 'main [data-reading], main[data-reading]',
    profiles: ['phone'],
    async run(page, el, snap) {
      const problems = [];
      await page.evaluate(() => window.scrollTo(0, 0));
      await pause(page, 300);
      const target = await page.evaluate(() => Math.round((document.documentElement.scrollHeight - innerHeight) * 0.42));
      for (let y = 0; y < target; y += 300) { await page.evaluate((to) => window.scrollTo(0, to), Math.min(y + 300, target)); await pause(page, 60); }
      await pause(page, 700);
      await snap('reading-bar');
      const seen = await page.evaluate(() => {
        const bar = document.querySelector('.reading-bar');
        const header = document.querySelector('.site-header');
        if (!bar) return { missing: true };
        const root = document.querySelector('main [data-reading], main[data-reading]');
        const beats = [...root.querySelectorAll('[data-beat]')];
        const box = root.getBoundingClientRect(), top = box.top + scrollY, span = Math.max(1, box.height - innerHeight);
        // A beat starting within the last screen has no tick (it would sit on the bar's right edge).
        const expected = beats.map((b) => Math.max(0, ((b.getBoundingClientRect().top + scrollY - top) / span) * 100)).filter((t) => t < 99);
        const ticks = [...bar.querySelectorAll('.reading-bar-line i')].map((i) => parseFloat(i.style.left));
        // Independent count: every visible text node inside the beats whose line is below the screen.
        let words = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.parentElement.closest('[data-beat]')) continue;
          // A chart's Values twin is reference, not reading, open or closed (an earlier capture may have opened one).
          if (n.parentElement.closest('details.values')) continue;
          // Text inside a closed <details> (a fold on /methodology) is not shown, whatever its box says: only a closed
          // fold's own summary is.
          let hidden = false;
          for (let d = n.parentElement.closest('details'); d && !hidden; d = d.parentElement && d.parentElement.closest('details')) {
            const summary = n.parentElement.closest('summary');
            if (!d.open && !(summary && summary.parentElement === d)) hidden = true;
          }
          if (hidden) continue;
          const range = document.createRange(); range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          if (!r.height) continue;
          if (r.top >= innerHeight) words += (n.textContent.match(/\S+/g) || []).length;
        }
        const figs = [...root.querySelectorAll('[data-beat] figure')].filter((f) => f.getBoundingClientRect().top > innerHeight).length;
        const manual = Math.max(1, Math.ceil(((words / 238) * 60 + 12 * figs) / 60));
        return {
          hidden: header.hasAttribute('data-hidden'), opacity: getComputedStyle(bar).opacity, barTop: Math.round(bar.getBoundingClientRect().top),
          text: bar.querySelector('.reading-bar-left').textContent, short: bar.querySelector('.reading-bar-short').textContent,
          ticks, expected, manual,
        };
      });
      if (seen.missing) return ['no reading bar on a page with data-reading'];
      if (!seen.hidden || seen.opacity !== '1' || seen.barTop !== 0) problems.push(`the bar is not in the header's place while it is away (${JSON.stringify({ hidden: seen.hidden, opacity: seen.opacity, top: seen.barTop })})`);
      const m = /^(\d+) min left$/.exec(seen.text);
      if (!m) problems.push(`minutes left reads "${seen.text}"`);
      else if (Math.abs(Number(m[1]) - seen.manual) > 1) problems.push(`minutes left ${m[1]} against a count of ${seen.manual}`);
      if (seen.ticks.length !== seen.expected.length || seen.ticks.some((t, i) => Math.abs(t - seen.expected[i]) > 0.5)) problems.push(`ticks ${JSON.stringify(seen.ticks)} are not at the beat starts ${JSON.stringify(seen.expected.map((e) => +e.toFixed(2)))}`);
      return problems;
    },
  },
  {
    // The next card: hovered (the go button moves on) and focused from the keyboard (the ring on the card).
    name: 'next-card',
    selector: '.next-card[href]',
    async run(page, el, snap) {
      const problems = [];
      await inView(el);
      await el.hover();
      await pause(page, 400);
      await snap('next-card-hover');
      const moved = await el.evaluate((a) => getComputedStyle(a.querySelector('.next-card-go')).transform);
      if (!moved || moved === 'none') problems.push('hover did not move the go button');
      await page.mouse.move(2, 2);
      await page.keyboard.press('Shift');
      await el.focus();
      await pause(page, 400);
      await snap('next-card-focus');
      const ring = await el.evaluate((a) => ({ visible: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }));
      if (!ring.visible || ring.outline === 'none') problems.push(`no focus ring on the card (${JSON.stringify(ring)})`);
      await el.evaluate((a) => a.blur());
      return problems;
    },
  },
];

/** Runs every interaction that applies to the page; returns one record per interaction. */
async function runInteractions(page, { dir, slug, shot, profile = 'phone' }) {
  const results = [];
  for (const ix of INTERACTIONS) {
    if (!(ix.profiles || ['phone', 'desktop']).includes(profile)) continue;
    const el = await visible(page, ix.selector);
    if (!el) { results.push({ name: ix.name, ok: true, skipped: 'n/a' }); continue; }
    const files = [];
    const snap = async (name) => {
      const file = path.join(dir, `${slug}-ix-${name}.png`);
      const { mask, maskColor, ...rest } = shot;
      await page.screenshot({ ...rest, path: file });
      files.push(path.basename(file));
    };
    let problems = [];
    try { problems = (await ix.run(page, el, snap, { profile })) || []; } catch (e) { problems = ['threw: ' + String(e && e.message || e).slice(0, 200)]; }
    try { await page.mouse.up(); } catch { /* not pressed */ }
    results.push({ name: ix.name, ok: problems.length === 0, problems, files });
  }
  return results;
}

module.exports = { INTERACTIONS, runInteractions };
