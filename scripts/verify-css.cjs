#!/usr/bin/env node
'use strict';
// The CSS contract of the redesign (the spec, sections 3.4 and 6.1), checked over every sheet in app/styles/**
// (the legacy sheets were deleted in WP9, October 18, 2026):
//   1. colour literals (hex, rgb(), hsl(), white/black) appear only in tokens.css; everything else uses a token;
//   2. a @media width query uses the one breakpoint scale: base, narrow (max-width: 359.98px), tiny (max-width:
//      299.98px), sm (min-width: 600px), md (min-width: 900px), lg (min-width: 1180px), or the complement of one of them
//      (max-width: 599.98px / 899.98px / 1179.98px, min-width: 360px / 300px). Print, prefers-*, pointer, hover and
//      forced-colors queries are not widths and are free;
//   3. no font-size under 12 px in components/chart-frame.css, components/scrubber.css or any rule that styles SVG text;
//   4. color-mix(), :has(), subgrid, container units and linear() easing only inside an @supports block that tests them
//      (verify-compat does not scan CSS); container query units may also sit inside @container;
//   5. no @layer (Safari before 15.4 drops layered rules) and no !important outside print and reduced-motion rules;
//   6. every var(--name) without a fallback names a token from tokens.css, a property the same file declares, or one a
//      component sets inline (LOCAL below): a misspelt token silently computes to nothing;
//   7. a fill or background of var(--fill-quiet) comes with a var(--mark-quiet) edge in the same rule (stroke,
//      box-shadow, border or outline): the quiet fill is 1.6:1 on paper and 1.5:1 in dark, so the edge carries the 3:1
//      (spec section 3.1). An area silhouette is exempt: its top edge is the line drawn over it;
//   8. the pace ramp (PACE_RAMP in lib/viz/format.ts) stays off the signal hue: every warm stop at OKLab ΔE ≥ 15 from
//      --signal, --night-signal and the dark theme's --signal, and every colour on the warm half at ≥ 14, so a slow
//      block never reads as the reading (principle 3);
//   9. the dark theme follows the system setting (spec section 3.9): tokens.css's [data-theme="dark"] block and its
//      @media (prefers-color-scheme: dark) :root:not([data-theme="light"]) twin hold the same declarations, and every
//      component rule written for [data-theme="dark"] has the same rule under the media query, and none without one.
//
//   node scripts/verify-css.cjs            checks app/styles
//   node scripts/verify-css.cjs --self-test checks the checker against planted mistakes
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STYLES = path.join(ROOT, 'app', 'styles');

const WIDTHS = new Set(['max-width:359.98px', 'max-width:299.98px', 'min-width:600px', 'min-width:900px', 'min-width:1180px',
  'max-width:599.98px', 'max-width:899.98px', 'max-width:1179.98px', 'min-width:360px', 'min-width:300px']);
const SMALL_TEXT_FILES = new Set(['components/chart-frame.css', 'components/scrubber.css']);
/** Custom properties components set in a style attribute (stagger index, slider fill, segmented thumb). */
const LOCAL = new Set(['--i', '--fill', '--thumb-x', '--thumb-w']);
const declared = (css) => new Set([...uncomment(css).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
let TOKENS = null;
const tokens = () => (TOKENS ??= declared(fs.existsSync(path.join(STYLES, 'tokens.css')) ? fs.readFileSync(path.join(STYLES, 'tokens.css'), 'utf8') : ''));

/** Strips comments, keeping line numbers. */
const uncomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Walks the CSS into rules with their at-rule context: [{ selector, body, line, context: ['@media …', …] }]. */
function parse(css) {
  const out = [];
  const stack = [];
  let i = 0, start = 0;
  const lineAt = (k) => css.slice(0, k).split('\n').length;
  while (i < css.length) {
    const c = css[i];
    if (c === '{') {
      const prelude = css.slice(start, i).trim();
      if (prelude.startsWith('@') && /^@(media|supports|container|layer|document)\b/.test(prelude)) {
        stack.push(prelude); start = i + 1; i++; continue;
      }
      let depth = 1, j = i + 1;
      while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      out.push({ selector: prelude, body: css.slice(i + 1, j - 1), line: lineAt(start + (css.slice(start, i).length - css.slice(start, i).trimStart().length)), context: [...stack] });
      i = j; start = j; continue;
    }
    if (c === '}') { stack.pop(); start = i + 1; }
    else if (c === ';' && css.slice(start, i).trim().startsWith('@')) {
      const prelude = css.slice(start, i).trim();
      out.push({ selector: prelude, body: '', line: lineAt(start), context: [...stack], statement: true });
      start = i + 1;
    }
    i++;
  }
  return out;
}

const supportsTesting = (context, test) => context.some((c) => c.startsWith('@supports') && test.test(c));

function check(file, css) {
  const rel = path.relative(STYLES, file).split(path.sep).join('/');
  const problems = [];
  const text = uncomment(css);
  const add = (line, msg) => problems.push(`app/styles/${rel}:${line}: ${msg}`);
  const rules = parse(text);
  const own = declared(css);
  // 6. undefined tokens (a var() with a fallback is allowed to miss)
  for (const r of rules) {
    for (const m of r.body.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
      if (!tokens().has(m[1]) && !own.has(m[1]) && !LOCAL.has(m[1])) add(r.line, `var(${m[1]}) is not a token in tokens.css or a property this file declares`);
    }
  }
  const isTokens = rel === 'tokens.css';
  const isFonts = rel === 'fonts.css';
  for (const r of rules) {
    const ctx = r.context.join(' ');
    // 5. @layer
    if (/^@layer\b/.test(r.selector) || r.context.some((c) => c.startsWith('@layer'))) add(r.line, '@layer is not allowed (Safari before 15.4 drops layered rules)');
    // 2. breakpoints
    for (const c of r.context.filter((c) => c.startsWith('@media'))) {
      for (const m of c.matchAll(/\(\s*((?:min|max)-width)\s*:\s*([^)]+?)\s*\)/g)) {
        const key = `${m[1]}:${m[2].replace(/\s+/g, '')}`;
        if (!WIDTHS.has(key)) add(r.line, `@media width "${m[1]}: ${m[2]}" is not on the breakpoint scale (narrow 359.98, tiny 299.98, sm 600, md 900, lg 1180)`);
      }
      if (/\bwidth\s*[<>]=?|[<>]=?\s*width\b/.test(c)) add(r.line, `range-syntax width query "${c}" is not allowed; use min-/max-width on the scale`);
    }
    const printOrReduced = r.context.some((c) => /\bprint\b|prefers-reduced-motion/.test(c)) || /\[data-motion-off\]/.test(r.selector);
    const decls = r.body.split(/;(?![^(]*\))/).map((d) => d.trim()).filter(Boolean);
    for (const d of decls) {
      const colon = d.indexOf(':');
      if (colon < 0) continue;
      const prop = d.slice(0, colon).trim().toLowerCase();
      const value = d.slice(colon + 1).trim();
      // 1. colour literals
      if (!isTokens && !isFonts) {
        const hex = value.match(/#[0-9a-fA-F]{3,8}\b/);
        const fn = value.match(/\b(?:rgba?|hsla?)\(\s*[\d.]/);
        const named = value.match(/(?<![-\w])(white|black)(?![-\w])/i);
        if (hex || fn || named) add(r.line, `colour literal ${(hex || fn || named)[0]} in ${prop}; use a token from tokens.css`);
      }
      // 3. small text
      if (prop === 'font-size') {
        const svgText = /(^|[\s,>])(text|tspan)\b|\bsvg\b[^,{]*\btext\b|\.(?:tick|axis-label|viz-label|direct-label)\b/.test(r.selector);
        if (SMALL_TEXT_FILES.has(rel) || svgText) {
          const px = value.match(/^([\d.]+)px/), rem = value.match(/^([\d.]+)rem/);
          if ((px && Number(px[1]) < 12) || (rem && Number(rem[1]) < 0.75)) add(r.line, `font-size ${value} is under 12 px for chart text`);
        }
      }
      // 4. features that need @supports
      if (/color-mix\(/.test(value) && !supportsTesting(r.context, /color-mix\(/)) add(r.line, `color-mix() outside an @supports (… color-mix(…)) block`);
      if (/\bsubgrid\b/.test(value) && !supportsTesting(r.context, /subgrid/)) add(r.line, 'subgrid outside an @supports (… subgrid) block');
      if (/(?:^|[\s(,*/+-])-?[\d.]+cq(?:w|h|i|b|min|max)\b/.test(value) && !supportsTesting(r.context, /cq|container/) && !r.context.some((c) => c.startsWith('@container'))) add(r.line, 'container query units outside @supports or @container');
      if (/(?:^|[\s,(])linear\(/.test(value) && !supportsTesting(r.context, /linear\(/)) add(r.line, 'linear() easing outside an @supports (transition-timing-function: linear(0, 1)) block');
      // 5. !important
      if (/!important/.test(value) && !printOrReduced) add(r.line, `!important on ${prop} outside print and reduced-motion rules`);
    }
    if (/:has\(/.test(r.selector) && !supportsTesting(r.context, /selector\(\s*:has\(/)) add(r.line, ':has() outside an @supports selector(:has(…)) block');
    // 7. a quiet fill without its edge
    if (/(?:^|;|\s)(?:fill|background(?:-color)?)\s*:\s*var\(--fill-quiet\)/.test(r.body) && !/\.a-silhouette\b/.test(r.selector)
      && !/(?:stroke|box-shadow|border(?:-[a-z]+)*|outline)\s*:[^;]*var\(--mark-quiet\)/.test(r.body)) {
      add(r.line, `${r.selector.replace(/\s+/g, ' ')} fills with --fill-quiet but has no --mark-quiet edge (stroke, box-shadow, border or outline)`);
    }
    void ctx;
  }
  return problems;
}

/** OKLab ΔE ×100 between two hex colours. */
function deltaE(a, b) {
  const lab = (hex) => {
    const [r, g, b2] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b2);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b2);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b2);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  };
  const [x, y] = [lab(a), lab(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** 8. The pace ramp against every signal colour the tokens define. */
function checkRamp(formatTs, tokensCss) {
  const ramp = (formatTs.match(/export const PACE_RAMP = \[([^\]]+)\]/) || [])[1];
  if (!ramp) return ['lib/viz/format.ts: PACE_RAMP not found'];
  // The dark theme's own ramp (PACE_RAMP_DARK), when there is one, follows the same rule.
  const dark = (formatTs.match(/export const PACE_RAMP_DARK = \[([^\]]+)\]/) || [])[1];
  return [...checkStops('PACE_RAMP', ramp, tokensCss), ...(dark ? checkStops('PACE_RAMP_DARK', dark, tokensCss) : [])];
}
function checkStops(name, ramp, tokensCss) {
  const problems = [];
  const stops = [...ramp.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]);
  const signals = [...uncomment(tokensCss).matchAll(/--(?:night-)?signal\s*:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
  if (stops.length < 3 || !signals.length) return [`lib/viz/format.ts: ${name} or the --signal tokens could not be read`];
  const mid = Math.floor(stops.length / 2);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  for (const stop of stops.slice(mid + 1)) {
    const worst = Math.min(...signals.map((sig) => deltaE(stop, sig)));
    if (worst < 15) problems.push(`lib/viz/format.ts: ${name} warm stop ${stop} is ΔE ${worst.toFixed(1)} from a signal colour (needs ≥ 15)`);
  }
  for (let k = mid; k < stops.length - 1; k++) {
    for (let f = 0; f <= 1; f += 0.05) {
      const c = hex(rgb(stops[k]).map((v, j) => v + f * (rgb(stops[k + 1])[j] - v)));
      const worst = Math.min(...signals.map((sig) => deltaE(c, sig)));
      if (worst < 14) { problems.push(`lib/viz/format.ts: ${name} between ${stops[k]} and ${stops[k + 1]} passes ${c}, ΔE ${worst.toFixed(1)} from a signal colour (needs ≥ 14)`); break; }
    }
  }
  return problems;
}

/** 9. The dark theme's two ways in (the attribute and the system setting) say the same thing everywhere. */
const ATTR = '[data-theme="dark"]';
const MEDIA_ROOT = ':root:not([data-theme="light"])';
const isDarkMedia = (c) => /^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/.test(c);
const norm = (body) => body.split(';').map((d) => d.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ');
function checkDark(sheets) {
  const problems = [];
  const attr = new Map(), media = new Map();
  for (const [rel, css] of sheets) {
    for (const rule of parse(uncomment(css))) {
      const dark = rule.context.some(isDarkMedia);
      const context = rule.context.filter((c) => !isDarkMedia(c)).join(' ');
      for (const sel of rule.selector.split(',').map((x) => x.trim().replace(/\s+/g, ' '))) {
        const key = (rest) => `${context} ${rest} { ${norm(rule.body)} }`;
        if (!dark && (sel === ATTR || sel.startsWith(ATTR + ' '))) attr.set(key(sel.slice(ATTR.length).trim()), `${rel}:${rule.line}`);
        else if (dark && (sel === MEDIA_ROOT || sel.startsWith(MEDIA_ROOT + ' '))) media.set(key(sel.slice(MEDIA_ROOT.length).trim()), `${rel}:${rule.line}`);
      }
    }
  }
  for (const [key, at] of attr) if (!media.has(key)) problems.push(`${at}: ${ATTR}${key.replace(/^\s*/, ' ').split(' {')[0]} has no twin under @media (prefers-color-scheme: dark) ${MEDIA_ROOT} with the same declarations`);
  for (const [key, at] of media) if (!attr.has(key)) problems.push(`${at}: ${MEDIA_ROOT}${key.replace(/^\s*/, ' ').split(' {')[0]} has no ${ATTR} rule with the same declarations`);
  if (!attr.size) problems.push(`tokens.css: no ${ATTR} block`);
  return problems;
}

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out.sort();
}

function selfTest() {
  const planted = {
    'components/x.css': [
      ['.a { color: #fff; }', /colour literal/],
      ['.a { color: rgb(1 2 3); }', /colour literal/],
      ['@media (max-width: 720px) { .a { color: var(--ink); } }', /breakpoint scale/],
      ['@media (min-width: 900px) { .a { color: var(--ink); } }', null],
      ['@media (max-width: 899.98px) { .a { color: var(--ink); } }', null],
      ['.a { background: color-mix(in srgb, var(--ink), transparent); }', /color-mix/],
      ['@supports (color: color-mix(in srgb, red, red)) { .a { background: color-mix(in srgb, var(--ink), transparent); } }', null],
      ['.a:has(> b) { color: var(--ink); }', /:has/],
      ['@supports selector(:has(a)) { .a:has(> b) { color: var(--ink); } }', null],
      ['.a { transition-timing-function: linear(0, 1); }', /linear\(\) easing/],
      ['.a { width: 50cqw; }', /container query units/],
      ['@container (min-width: 300px) { .a { width: 50cqw; } }', null],
      ['@layer base { .a { color: var(--ink); } }', /@layer/],
      ['.a { color: var(--ink) !important; }', /!important/],
      ['@media (prefers-reduced-motion: reduce) { .a { transition: none !important; } }', null],
      ['.viz text { font-size: 11px; }', /under 12 px/],
      ['.viz text { font-size: 12px; }', null],
      ['.a { padding: var(--s4); }', /not a token/],
      ['.a { padding: var(--s-4); }', null],
      ['.a { padding: var(--nope, 4px); }', null],
      ['.a { --tooth: 8px; } .b { height: var(--tooth); }', null],
      ['.bin { fill: var(--fill-quiet); }', /no --mark-quiet edge/],
      ['.bin { fill: var(--fill-quiet); stroke: var(--mark-quiet); stroke-width: 1.5px; }', null],
      ['.key { background: var(--fill-quiet); box-shadow: inset 0 0 0 1.5px var(--mark-quiet); }', null],
      ['.viz .a-silhouette { fill: var(--fill-quiet); }', null],
    ],
    'components/chart-frame.css': [['.readout small { font-size: .7rem; }', /under 12 px/]],
    'tokens.css': [[':root { --ink: #15171C; }', null]],
  };
  let failed = 0;
  for (const [rel, cases] of Object.entries(planted)) {
    for (const [css, expect] of cases) {
      const got = check(path.join(STYLES, rel), css);
      const ok = expect ? got.some((p) => expect.test(p)) : got.length === 0;
      if (!ok) { failed++; console.error(`self-test: ${rel} ${css}\n  expected ${expect || 'no problem'}, got ${JSON.stringify(got)}`); }
    }
  }
  const twin = '[data-theme="dark"] { --ink: #fff; } @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ink: #fff; } }';
  if (checkDark([['tokens.css', twin]]).length) { failed++; console.error('self-test: matching dark blocks failed the dark check'); }
  if (!checkDark([['tokens.css', twin.replace('{ --ink: #fff; } }', '{ --ink: #eee; } }')]]).length) { failed++; console.error('self-test: a dark block that drifted passed the dark check'); }
  if (!checkDark([['tokens.css', twin], ['x.css', '[data-theme="dark"] .card { box-shadow: none; }']]).length) { failed++; console.error('self-test: a dark rule with no system-setting twin passed the dark check'); }
  const tokensCss = ':root { --signal: #E5461A; --night-signal: #FF6A3D; }';
  if (!checkRamp("export const PACE_RAMP = ['#1D3FD8', '#4F79F7', '#9DB6FB', '#EFE8DA', '#FFB48A', '#FF6A3D', '#C8202F'] as const;", tokensCss).length) { failed++; console.error('self-test: an orange warm stop passed the ramp check'); }
  if (checkRamp("export const PACE_RAMP = ['#1D3FD8', '#4F79F7', '#9DB6FB', '#EFE8DA', '#EDA6C1', '#C65F9E', '#8F1449'] as const;", tokensCss).length) { failed++; console.error('self-test: the rose ramp failed the ramp check'); }
  console.log(failed ? `verify-css self-test: ${failed} failed` : 'verify-css self-test: ok');
  return failed ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const list = files(STYLES);
  const problems = list.flatMap((f) => check(f, fs.readFileSync(f, 'utf8')))
    .concat(checkDark(list.map((f) => [path.relative(STYLES, f), fs.readFileSync(f, 'utf8')])))
    .concat(checkRamp(fs.readFileSync(path.join(ROOT, 'lib', 'viz', 'format.ts'), 'utf8'), fs.readFileSync(path.join(STYLES, 'tokens.css'), 'utf8')));
  if (problems.length) {
    console.error(`verify-css: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log(`verify-css: ${list.length} files in app/styles follow the token, breakpoint, chart-text, quiet-edge and compatibility rules; the dark theme reads the same by attribute and by system setting; the pace ramp stays off the signal hue`);
}

main();
