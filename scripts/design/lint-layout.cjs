#!/usr/bin/env node
'use strict';
// The layout linter (the redesign spec, section 8.0). For every route at every width it fails on:
//   1. horizontal page overflow;
//   2. a visible a, button, input, select, summary or [role=slider] whose hit area is under 44×44 px, except inline
//      links inside running text (a hit area grown by padding or a pseudo-element counts: the box is probed);
//   3. SVG or chart text rendered under 12 px;
//   4. text-on-text overlap above 2 px² inside a figure.viz (and the course pages' glance rows);
//   5. SVG text outside its SVG;
//   6. console errors and page errors;
//   7. on / only, more than one rgb(255, 91, 46) control on the first screen;
//   8. HTML text inside a figure.viz or a card (a next card, a receipt, the report's and the runner's night cards, an
//      answer card) cut off at its edge or at an element that clips its overflow (a pace block's "+3" past the frame, a
//      tile's "+4%", a next card's "improvemen"), by more than 1 px; a scroller's content and an ellipsis are exempt;
//   9. a term link (.term-link) inside an h1: its dotted underline in the display face outweighs the H1's accent, so a
//      page links the term in its dek or unit line instead (WP9 round 3).
//
//   node scripts/design/lint-layout.cjs --routes=<comma list | @file> [--widths=195,320,390,1440] [--dir=out]
//        [--json=<file>] [--only=1,2,3] [--max=12]
//
// Pages are served from the export like shoot.cjs does (no port, no other host). Exits 1 when anything fails and
// writes the full findings as JSON (default: pace-notes-design-lint.json in the system temp folder).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { readRoutes, serve, open, SITE } = require('./shoot.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const HEIGHTS = { 195: 332, 201: 357, 320: 640, 390: 844, 402: 714 };

function args(argv) {
  const out = {};
  for (const a of argv) { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); if (m) out[m[1]] = m[2] === undefined ? true : m[2]; }
  return out;
}

/** Runs in the page: checks 1, 3, 4, 5 and 7, and lists the hit-target candidates for check 2. */
function inspect({ isHome }) {
  const de = document.documentElement;
  const vw = de.clientWidth, vh = window.innerHeight;
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    const text = (el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : ''}${text ? ` "${text}"` : ''}`;
  };
  const hidden = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true;
      if (n.hasAttribute('inert') || n.hidden) return true;
      if (n.classList && (n.classList.contains('sr-only') || n.classList.contains('visually-hidden'))) return true;
    }
    return false;
  };
  const findings = { overflow: [], tinyText: [], overlap: [], outside: [], orange: [], clipped: [], h1Term: [] };

  // 9. No term link in the H1.
  for (const el of document.querySelectorAll('h1 .term-link')) if (!hidden(el)) findings.h1Term.push(describe(el));

  // 1. Horizontal overflow, with the elements that reach past the right edge.
  // Any overflow at all, even 1 px: a page that can move sideways under a thumb wobbles.
  if (de.scrollWidth > vw) {
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 0.5 && getComputedStyle(el).position !== 'fixed' && !hidden(el)) {
        wide.push(`${describe(el)} right=${Math.round(r.right)}`);
        if (wide.length >= 6) break;
      }
    }
    findings.overflow.push({ by: de.scrollWidth - vw, elements: wide });
  }

  // 3 and 5. SVG text size and containment; HTML text inside chart frames is size-checked too.
  const svgTexts = [];
  for (const svg of document.querySelectorAll('svg')) {
    const sr = svg.getBoundingClientRect();
    // A closed disclosure's content is not rendered (Chromium hides it with content-visibility, so its boxes are stale):
    // it is checked with the disclosure open, as every other check here skips it.
    if (sr.width < 40 || sr.height < 20 || hidden(svg) || svg.closest('details:not([open])')) continue;
    for (const t of svg.querySelectorAll('text')) {
      if (!t.textContent.trim() || hidden(t)) continue;
      const m = t.getScreenCTM();
      const scale = m ? Math.sqrt(m.a * m.a + m.b * m.b) : 1;
      const px = parseFloat(getComputedStyle(t).fontSize) * scale;
      const r = t.getBoundingClientRect();
      if (px < 11.99) findings.tinyText.push(`${describe(t)} ${px.toFixed(1)}px in ${describe(svg)}`);
      if (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1) {
        findings.outside.push(`${describe(t)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] outside ${describe(svg)} [${Math.round(sr.left)},${Math.round(sr.top)},${Math.round(sr.right)},${Math.round(sr.bottom)}]`);
      }
      svgTexts.push(t);
    }
  }
  for (const fig of document.querySelectorAll('figure.viz')) {
    const walker = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest('svg') || el.closest('details:not([open])') || el.closest('table') || hidden(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 11.99) findings.tinyText.push(`${describe(el)} ${px.toFixed(1)}px (HTML in figure.viz)`);
    }
  }

  // 4. Text-on-text overlap inside each figure.viz, and in the course pages' glance rows (a figure-m beside its words,
  // outside any figure.viz): line boxes of HTML text and the boxes of SVG text.
  for (const fig of document.querySelectorAll('figure.viz, .course-glance .glance-rows')) {
    if (hidden(fig)) continue;
    const boxes = [];
    const walker = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || hidden(el) || el.closest('details:not([open])')) continue;
      if (el.closest('svg')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) boxes.push({ r, el, what: describe(el) });
    }
    for (const t of fig.querySelectorAll('svg text')) {
      if (!t.textContent.trim() || hidden(t)) continue;
      const r = t.getBoundingClientRect();
      if (r.width > 0.5) boxes.push({ r, el: t, what: describe(t) });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 0 && h > 0 && w * h > 2) findings.overlap.push(`${a.what} × ${b.what} (${(w * h).toFixed(0)} px²)`);
      }
    }
  }

  // 8. HTML text in a figure or a card cut off: each line box against the figure (or card) and against every element
  // between them that clips its overflow sideways. A scroller (overflow auto or scroll) may hold content past its edge
  // by design, and an ellipsis is a deliberate cut, so neither counts; nor does a visually hidden name (a 1 px box).
  // Each text belongs to its nearest figure or card only.
  const CLIP_ROOTS = 'figure.viz, .next-card, .receipt, .race-report-screen, .answer-card, .runner-numbers';
  for (const fig of document.querySelectorAll(CLIP_ROOTS)) {
    if (hidden(fig)) continue;
    const walker = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest(CLIP_ROOTS) !== fig || el.closest('svg') || el.closest('details:not([open])') || hidden(el)) continue;
      const clippers = [];
      let unseen = false;
      for (let a = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/auto|scroll/.test(cs.overflowX)) break;
        if (a === fig || /hidden|clip/.test(cs.overflowX)) {
          if (a !== fig && a.getBoundingClientRect().width <= 1.5) { unseen = true; break; }
          if (cs.textOverflow !== 'ellipsis') clippers.push(a);
        }
        if (a === fig) break;
      }
      if (unseen) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        const cut = clippers.find((c) => { const b = c.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1; });
        if (cut) {
          const b = cut.getBoundingClientRect();
          findings.clipped.push(`${describe(el)} [${Math.round(r.left)}–${Math.round(r.right)}] cut by ${describe(cut).slice(0, 60)} [${Math.round(b.left)}–${Math.round(b.right)}]`);
          break;
        }
      }
    }
  }

  // 7. The home page's first screen has one orange control at most.
  if (isHome) {
    const orange = [];
    for (const el of document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom <= 0 || r.top >= vh || hidden(el)) continue;
      if (getComputedStyle(el).backgroundColor === 'rgb(255, 91, 46)') orange.push(describe(el));
    }
    if (orange.length > 1) findings.orange.push(`${orange.length} orange controls on the first screen: ${orange.join(', ')}`);
  }

  // 2. Hit-target candidates: anything under 44 in either dimension, unless it is an inline link in running text.
  const candidates = [];
  const controls = document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, summary, [role="slider"]');
  let index = 0;
  for (const el of controls) {
    index++;
    if (hidden(el)) continue;
    let target = el;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) target = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el;
    const r = target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.width >= 44 && r.height >= 44) continue;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
      let block = el.parentElement;
      while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
      const own = (el.textContent || '').trim().length;
      const all = block ? (block.textContent || '').replace(/\s+/g, ' ').trim().length : 0;
      if (block && all > own + 12) continue; // a link inside running text
    }
    el.setAttribute('data-lint-target', String(index));
    candidates.push({ id: String(index), what: describe(el), w: Math.round(r.width), h: Math.round(r.height), probe: target === el });
  }
  return { findings, candidates };
}

/**
 * Check 2's second pass: a candidate passes when a 44×44 box around its centre hits it (padding or a pseudo-element);
 * where its centre cannot be hit-tested at all, when its own box or its absolutely placed pseudo-element is 44 px each way.
 */
async function probeTargets(page, candidates) {
  const small = [];
  for (const c of candidates) {
    const result = await page.evaluate(({ id, probe }) => {
      const el = document.querySelector(`[data-lint-target="${id}"]`);
      if (!el) return { ok: true };
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      if (!probe) return { ok: false };
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hits = (x, y) => { const at = document.elementFromPoint(x, y); return !!at && (at === el || el.contains(at)); };
      if (hits(cx, cy)) return { ok: hits(cx - 21, cy) && hits(cx + 21, cy) && hits(cx, cy - 21) && hits(cx, cy + 21) };
      // The centre cannot be hit-tested (off screen inside a scroll region, or under a sticky bar): take the larger of the
      // element's box and its absolutely placed ::before/::after box, the way badge.css gives a badge its 44 px reach.
      const pseudo = ['::before', '::after'].map((p) => getComputedStyle(el, p)).filter((c) => c.content !== 'none' && c.content !== 'normal' && c.position === 'absolute');
      const w = Math.max(r.width, ...pseudo.map((c) => parseFloat(c.width) || 0)), h = Math.max(r.height, ...pseudo.map((c) => parseFloat(c.height) || 0));
      return { ok: w >= 44 && h >= 44 };
    }, c);
    if (!result.ok) small.push(`${c.what} ${c.w}×${c.h}`);
  }
  await page.evaluate(() => { for (const el of document.querySelectorAll('[data-lint-target]')) el.removeAttribute('data-lint-target'); window.scrollTo(0, 0); });
  return small;
}

async function lintOne(browser, route, width, opts) {
  const foreign = [];
  const mobile = width < 900;
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] || (mobile ? 844 : 900) },
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce',
  });
  await serve(context, opts.dir, foreign);
  const page = await context.newPage();
  const { status, errors } = await open(page, route, { noScroll: false });
  const isHome = route.split('?')[0] === '/';
  const { findings, candidates } = await page.evaluate(inspect, { isHome });
  const small = opts.only.has(2) ? await probeTargets(page, candidates) : [];
  await context.close();
  const checks = {
    1: findings.overflow.map((o) => `page overflows by ${o.by}px: ${o.elements.join('; ')}`),
    2: small,
    3: findings.tinyText,
    4: findings.overlap,
    5: findings.outside,
    6: errors.concat(status === 200 ? [] : [`status ${status}`]),
    7: findings.orange,
    8: findings.clipped,
    9: findings.h1Term,
  };
  for (const k of Object.keys(checks)) if (!opts.only.has(Number(k))) delete checks[k];
  return { route, width, checks, foreign };
}

const NAMES = { 1: 'horizontal overflow', 2: 'hit area under 44×44', 3: 'chart text under 12 px', 4: 'text overlaps text in a figure', 5: 'text outside its SVG', 6: 'console or page error', 7: 'more than one orange control on the first screen', 8: 'chart text clipped', 9: 'term link in the H1' };

async function main() {
  const a = args(process.argv.slice(2));
  const routes = readRoutes(a.routes);
  const widths = String(a.widths || '195,320,390,1440').split(',').map(Number).filter(Boolean);
  const dir = path.resolve(ROOT, a.dir || 'out');
  const only = new Set(String(a.only || '1,2,3,4,5,6,7,8,9').split(',').map(Number));
  const max = Number(a.max || 12);
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`No export at ${dir}: run npm run build first.`);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'] });
  const results = [];
  let failures = 0;
  try {
    for (const route of routes) {
      for (const width of widths) {
        const r = await lintOne(browser, route, width, { dir, only });
        results.push(r);
        const failed = Object.entries(r.checks).filter(([, list]) => list.length);
        failures += failed.length;
        console.log(`${failed.length ? 'FAIL' : 'ok  '} ${String(width).padStart(4)} ${route}`);
        for (const [k, list] of failed) {
          console.log(`       ${k}. ${NAMES[k]} (${list.length})`);
          for (const item of list.slice(0, max)) console.log(`          - ${item}`);
          if (list.length > max) console.log(`          … ${list.length - max} more in the JSON report`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  const json = path.resolve(a.json || path.join(os.tmpdir(), 'pace-notes-design-lint.json'));
  fs.writeFileSync(json, JSON.stringify({ widths, results }, null, 1) + '\n');
  console.log(`${results.length} page × width runs, ${failures} failing checks → ${json}`);
  process.exit(failures ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
