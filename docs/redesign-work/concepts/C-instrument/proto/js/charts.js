// charts.js: the chart grammar's primitives. Hand-rolled SVG, measured to the
// container's real pixel width so hairlines land on pixels and text never scales.

import { detentTick, reduced } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
export function h(tag, attrs = {}, kids = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  for (const k of [].concat(kids)) if (k != null) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
}
export const lin = (d0, d1, r0, r1) => { const f = v => r0 + (v - d0) / (d1 - d0) * (r1 - r0); f.inv = p => d0 + (p - r0) / (r1 - r0) * (d1 - d0); return f; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const crisp = v => Math.round(v) + 0.5; // hairlines on the pixel grid
/** plot height: CSS owns the box (aspect on phones, capped on desktop), the drawing reads it */
export const hOf = (host, W, r) => Math.round(host && host.clientHeight > 20 ? host.clientHeight : W * r);

/** Render on mount and on width change; fn(width) must return an <svg>. */
export function responsive(host, fn, after) {
  let w = 0;
  const draw = () => {
    const nw = Math.round(host.clientWidth);
    if (!nw || nw === w) return;
    w = nw; const svg = fn(w);
    // keep any sibling overlays the page added; replace only the previous drawing
    const prev = host.querySelector(':scope > svg[data-r]');
    svg.setAttribute('data-r', '');
    if (prev) prev.replaceWith(svg); else host.prepend(svg);
    if (after) after(svg, w);
  };
  draw();
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(host); else addEventListener('resize', draw);
  return { redraw() { w = 0; draw(); } };
}

/* ---------------------------------------------------------------------------
   Scrub: press-and-drag anywhere in the plot; the needle follows the thumb 1:1.
   Horizontal intent scrubs; vertical intent scrolls the page (touch-action: pan-y).
   A tap sets the value. Keyboard: role=slider with arrows / PageUp / Home / End.
   --------------------------------------------------------------------------- */
export function scrub(plot, opt) {
  const { min, max, step = 1, bigStep = step * 5, detents = [], pxToValue, valueText, onChange } = opt;
  let value = opt.value, startX = 0, startY = 0, active = false, pid = null;
  const snap = v => clamp(Math.round((v - min) / step) * step + min, min, max);
  plot.setAttribute('role', 'slider');
  plot.setAttribute('tabindex', '0');
  plot.setAttribute('aria-valuemin', min);
  plot.setAttribute('aria-valuemax', max);
  if (opt.label) plot.setAttribute('aria-label', opt.label);
  const set = (v, from) => {
    v = snap(v);
    if (v === value && from !== 'init') return;
    const prev = value; value = v;
    plot.setAttribute('aria-valuenow', v);
    plot.setAttribute('aria-valuetext', valueText(v));
    if (from !== 'init' && detents.some(d => (prev < d && v >= d) || (prev > d && v <= d))) {
      detentTick();
      plot.querySelectorAll('.detent').forEach(el => { if (+el.dataset.v === detents.find(d => (prev < d && v >= d) || (prev > d && v <= d))) { el.classList.remove('flash'); void el.getBBox; el.offsetWidth; el.classList.add('flash'); } });
    }
    onChange(v, from);
  };
  const local = e => e.clientX - plot.getBoundingClientRect().left;
  plot.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    pid = e.pointerId; startX = e.clientX; startY = e.clientY; active = e.pointerType === 'mouse';
    if (active) { plot.setPointerCapture(pid); plot.classList.add('is-scrubbing', 'has-scrubbed'); set(pxToValue(local(e)), 'drag'); }
  });
  plot.addEventListener('pointermove', e => {
    if (e.pointerId !== pid && !(e.pointerType === 'mouse' && e.buttons === 0)) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { if (opt.hover) set(pxToValue(local(e)), 'hover'); return; }
    if (!active) {
      const dx = Math.abs(e.clientX - startX), dy = Math.abs(e.clientY - startY);
      if (dx > 6 && dx > dy * 1.2) { active = true; try { plot.setPointerCapture(pid); } catch {} plot.classList.add('is-scrubbing', 'has-scrubbed'); }
      else return;
    }
    set(pxToValue(local(e)), 'drag');
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    if (!active && e.type === 'pointerup' && Math.abs(e.clientX - startX) < 8 && Math.abs(e.clientY - startY) < 8) { plot.classList.add('has-scrubbed'); set(pxToValue(local(e)), 'tap'); }
    active = false; pid = null; plot.classList.remove('is-scrubbing');
  };
  plot.addEventListener('pointerup', end);
  plot.addEventListener('pointercancel', end);
  plot.addEventListener('keydown', e => {
    const k = e.key; let v = value;
    if (k === 'ArrowRight' || k === 'ArrowUp') v += step; else if (k === 'ArrowLeft' || k === 'ArrowDown') v -= step;
    else if (k === 'PageUp') v += bigStep; else if (k === 'PageDown') v -= bigStep;
    else if (k === 'Home') v = min; else if (k === 'End') v = max; else return;
    e.preventDefault(); plot.classList.add('has-scrubbed'); set(v, 'key');
  });
  set(value, 'init');
  return { get: () => value, set: v => set(v, 'api') };
}

/* The needle group: a hairline, a crown (thumb knob) and an optional hint. */
/* top..base is the reading line; the crown sits below the tick labels at crownY,
   joined by a short stem so the line never crosses a label. */
export function needle(x, top, base, crownY = base, { hint = true } = {}) {
  return h('g', { class: 'needle', transform: `translate(${x},0)` }, [
    h('line', { x1: 0, x2: 0, y1: top, y2: base }),
    crownY > base + 20 ? h('line', { x1: 0, x2: 0, y1: crownY - 16, y2: crownY }) : null,
    h('rect', { x: -22, y: top, width: 44, height: crownY - top + 22, fill: 'transparent' }),
    h('circle', { class: 'crown', cx: 0, cy: crownY, r: 10 }),
    hint ? h('text', { class: 'crown-hint', x: 18, y: crownY + 4 }, '‹ drag ›') : null,
  ]);
}

/* ---------------------------------------------------------------------------
   Dial: 100 ticks around a bezel = 100 finishes. Lit ticks are the share.
   --------------------------------------------------------------------------- */
export function dial(host, { share, ref = null, stagger = 9 }) {
  const lit = Math.round(share * 100), refN = ref == null ? null : Math.round(ref * 100);
  const svg = h('svg', { viewBox: '0 0 300 300', role: 'img', 'aria-hidden': 'true' });
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2 - Math.PI / 2;
    const major = i % 10 === 0;
    const r1 = major ? 118 : 124, r2 = 140;
    const cls = ['tk', major ? 'major' : '', i < lit ? 'lit' : '', refN != null && i === refN - 1 ? 'ref' : ''].join(' ');
    svg.append(h('line', {
      class: cls, x1: (150 + r1 * Math.cos(a)).toFixed(2), y1: (150 + r1 * Math.sin(a)).toFixed(2),
      x2: (150 + r2 * Math.cos(a)).toFixed(2), y2: (150 + r2 * Math.sin(a)).toFixed(2),
      style: i < lit ? `transition-delay:${reduced() ? 0 : i * stagger}ms` : null,
    }));
  }
  if (refN != null) { // a small ink pointer outside the bezel at the comparison share
    const a = ((refN - 0.5) / 100) * Math.PI * 2 - Math.PI / 2;
    svg.append(h('path', { d: `M${150 + 146 * Math.cos(a)} ${150 + 146 * Math.sin(a)} l ${6 * Math.cos(a + 2.6)} ${6 * Math.sin(a + 2.6)} l ${6 * Math.cos(a - 2.6) - 6 * Math.cos(a + 2.6)} ${6 * Math.sin(a - 2.6) - 6 * Math.sin(a + 2.6)} z`, fill: 'var(--ink)' }));
  }
  host.prepend(svg);
  return svg;
}
export function lightDial(host) {
  if (!('IntersectionObserver' in window) || reduced()) { host.classList.add('is-in'); return; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { host.classList.add('is-in'); io.disconnect(); } }, { rootMargin: '0px 0px -18% 0px' });
  io.observe(host);
}

/* ---------------------------------------------------------------------------
   Ruler: a one-line scale with a needle. marks: [{v, kind: 'signal'|'ink'|'hollow', label, above}]
   --------------------------------------------------------------------------- */
export function ruler(host, opts) {
  host._ruler = opts;
  if (host._rulerR) { host._rulerR.redraw(); return; }
  host._rulerR = responsive(host, W => {
    const { min, max, ticks, fmt = v => v, marks = [], h: H = 46 } = host._ruler;
    const x = lin(min, max, 6, W - 6), y = 24;
    const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    svg.append(h('line', { x1: x(min), x2: x(max), y1: crisp(y), y2: crisp(y), stroke: 'var(--rule-strong)' }));
    ticks.forEach(t => {
      svg.append(h('line', { x1: crisp(x(t)), x2: crisp(x(t)), y1: y - 4, y2: y + 4, stroke: 'var(--rule-strong)' }));
      svg.append(h('text', { x: x(t), y: H - 2, 'text-anchor': t === min ? 'start' : t === max ? 'end' : 'middle', style: 'font:500 11px var(--mono);fill:var(--ink-3)' }, fmt(t)));
    });
    marks.forEach(m => {
      const cx = x(clamp(m.v, min, max));
      if (m.kind === 'signal') {
        svg.append(h('line', { x1: cx, x2: cx, y1: y - 12, y2: y + 6, stroke: 'var(--signal)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
        svg.append(h('circle', { cx, cy: y, r: 5.5, fill: 'var(--signal)', stroke: 'var(--paper)', 'stroke-width': 2 }));
      } else if (m.kind === 'ink') {
        svg.append(h('circle', { cx, cy: y, r: 5, fill: 'var(--ink)', stroke: 'var(--paper)', 'stroke-width': 2 }));
      } else {
        svg.append(h('circle', { cx, cy: y, r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      }
      if (m.label) svg.append(h('text', { x: cx, y: 9, 'text-anchor': cx < 40 ? 'start' : cx > W - 40 ? 'end' : 'middle', style: `font:600 11px var(--mono);fill:${m.kind === 'signal' ? 'var(--accent-ink)' : 'var(--ink-2)'}` }, m.label));
    });
    return svg;
  });
}

/* Values table builder */
export function vtable(host, head, rows, caption) {
  const t = document.createElement('table'); t.className = 'vtable';
  if (caption) { const c = t.createCaption(); c.className = 'sr-only'; c.textContent = caption; }
  const th = t.createTHead().insertRow(); head.forEach(x => { const c = document.createElement('th'); c.textContent = x; c.scope = 'col'; th.append(c); });
  const tb = t.createTBody();
  rows.forEach(r => { const tr = tb.insertRow(); r.forEach((x, i) => { const c = i === 0 ? document.createElement('th') : document.createElement('td'); if (i === 0) c.scope = 'row'; c.textContent = x; tr.append(c); }); });
  const reg = document.createElement('div'); reg.className = 'table-region'; reg.setAttribute('role', 'region'); reg.tabIndex = 0;
  if (caption) reg.setAttribute('aria-label', caption);
  reg.append(t); host.replaceChildren(reg);
}

/* Smoothly tween a number's text (used by readouts that change on tap, not scrub). */
export function tweenText(el, from, to, fmt, ms = 420) {
  if (reduced() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
