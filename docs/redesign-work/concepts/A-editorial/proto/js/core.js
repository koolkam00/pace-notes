// Pace Notes, direction A: shared core. Vanilla ES module, no dependencies.
// Units, formatters, motion preference, data loading, header + reading bar, menu sheet, scrolly engine, reveals.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const SVGNS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes; children may be nodes or strings (text). */
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  return el;
}
/** Create an HTML element. Text children use text nodes, never innerHTML. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [prop, val] of Object.entries(v)) { if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  return el;
}

// ---------- Data ----------
const cache = new Map();
export function loadJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); }));
  return cache.get(path);
}
export function loadText(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => r.text()));
  return cache.get(path);
}
export function parseCSV(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const keys = head.split(',');
  return lines.map((l) => { const v = l.split(','); return Object.fromEntries(keys.map((k, i) => [k, isNaN(+v[i]) ? v[i] : +v[i]])); });
}

// ---------- Units (miles by default; ?units=km wins; the site's allowlisted key) ----------
const UNIT_KEY = 'marathon-study-units';
let units = 'mi';
try { units = localStorage.getItem(UNIT_KEY) === 'km' ? 'km' : 'mi'; } catch (e) { /* storage blocked */ }
const qp = new URLSearchParams(location.search).get('units');
if (qp === 'km' || qp === 'mi') units = qp;
const unitListeners = new Set();
export const getUnits = () => units;
export function setUnits(u) {
  if (u === units) return;
  units = u;
  try { localStorage.setItem(UNIT_KEY, u); } catch (e) { /* ignore */ }
  document.documentElement.dataset.units = u;
  $$('.unit-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === u)));
  unitListeners.forEach((fn) => fn(u));
}
export const onUnits = (fn) => { unitListeners.add(fn); return () => unitListeners.delete(fn); };
document.documentElement.dataset.units = units;

export const KM_PER_MI = 1.609344;
export const FT_PER_M = 1 / 0.3048;

// ---------- Formatters ----------
const pad = (n) => String(n).padStart(2, '0');
export function clock(sec, { seconds = true } = {}) {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s2 = t % 60;
  return seconds ? `${h}:${pad(m)}:${pad(s2)}` : `${h}:${pad(m)}`;
}
export const hm = (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;
/** Signed minutes:seconds for a time difference, e.g. 300 → "5:00". */
export function ms(sec) {
  const t = Math.round(Math.abs(sec));
  if (t >= 3600) return clock(t);
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
}
export function pace(secPerKm, { suffix = true } = {}) {
  const s2 = units === 'mi' ? secPerKm * KM_PER_MI : secPerKm;
  const t = Math.round(s2);
  return `${Math.floor(t / 60)}:${pad(t % 60)}${suffix ? (units === 'mi' ? '/mi' : '/km') : ''}`;
}
export function dist(km, dp = 1) {
  return units === 'mi' ? `${(km / KM_PER_MI).toFixed(dp)} mi` : `${km.toFixed(dp)} km`;
}
export const marathonDistance = () => (units === 'mi' ? '26.2 miles' : '42.2 km');
export function elev(m, { signed = false } = {}) {
  const v = units === 'mi' ? m * FT_PER_M : m;
  const r = Math.round(v);
  return `${signed && r > 0 ? '+' : ''}${r.toLocaleString('en-US')} ${units === 'mi' ? 'ft' : 'm'}`;
}
export const int = (n) => Math.round(n).toLocaleString('en-US');
export const pct = (x, dp = 0) => `${(x * 100).toFixed(dp)}%`;
export function millions(n) { return `${(n / 1e6).toFixed(1)} million`; }
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const countWord = (n) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
/** "3 in 10", "1 in 25", "3 in 4": the friendliest small ratio close to the share (tolerance grows with the share). */
export function inWords(share) {
  const tol = Math.max(0.006, share * 0.08);
  for (const d of [2, 3, 4, 5, 10, 20, 25]) { const n = Math.round(share * d); if (n > 0 && n < d && Math.abs(n / d - share) <= tol) return `${n} in ${d}`; }
  return `${Math.round(share * 100)} in 100`;
}
/** Course checkpoint names runners use in either unit system. */
export const CHECKPOINTS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'];
export const SECTIONS_KM = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
export const sectionName = (i) => (i === 8 ? 'Last 2.2K' : `${SECTIONS_KM[i][0]}–${SECTIONS_KM[i][1]}K`);

// ---------- Motion ----------
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches || document.documentElement.hasAttribute('data-motion-off');
export function tween(from, to, dur, fn, ease = (t) => 1 - Math.pow(1 - t, 3)) {
  if (reduced() || dur <= 0) { fn(to); return Promise.resolve(); }
  return new Promise((done) => {
    const t0 = performance.now();
    const step = (now) => { const t = Math.min(1, (now - t0) / dur); fn(from + (to - from) * ease(t)); if (t < 1) requestAnimationFrame(step); else done(); };
    requestAnimationFrame(step);
  });
}
/** Observe once; calls fn when the element is at least `ratio` visible. */
export function whenVisible(el, fn, { ratio = 0.35, margin = '0px' } = {}) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { io.disconnect(); fn(); } }, { threshold: ratio, rootMargin: margin });
  io.observe(el);
}
export function onResize(el, fn) {
  let w = 0;
  const ro = new ResizeObserver(([e]) => { const nw = Math.round(e.contentRect.width); if (nw !== w) { w = nw; fn(nw, Math.round(e.contentRect.height)); } });
  ro.observe(el);
  return ro;
}

// ---------- Header: hide on scroll down, reading bar with progress ----------
export function initHeader({ chapter = '', title = '', minutes = 0, steps = [] } = {}) {
  const header = $('.site-header');
  const readbar = $('.readbar');
  // The header turns night while it sits over a night opener, so it never floats as a pale strip over the race.
  const first = $('main > :first-child');
  const heroNight = first && first.classList.contains('night') ? first : null;
  $$('.unit-switch button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.u === units));
    b.addEventListener('click', () => setUnits(b.dataset.u));
  });
  if (readbar) {
    $('.rb-ch', readbar).textContent = chapter;
    $('.rb-title', readbar).textContent = title;
  }
  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = Math.min(1, Math.max(0, y / max));
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (header && !document.body.classList.contains('menu-open')) {
      if (goingDown && y > 120) header.classList.add('is-hidden');
      else if (goingUp || y < 60) header.classList.remove('is-hidden');
    }
    document.body.classList.toggle('reading', Boolean(header && header.classList.contains('is-hidden')));
    if (readbar) {
      readbar.classList.toggle('is-on', Boolean(header && header.classList.contains('is-hidden')));
      readbar.style.setProperty('--p', p.toFixed(4));
      const left = $('.rb-left', readbar);
      if (left && minutes) left.textContent = p > 0.97 ? 'Finished' : `${Math.max(1, Math.ceil(minutes * (1 - p)))} min left`;
    }
    if (header && heroNight) header.classList.toggle('on-night', heroNight.getBoundingClientRect().bottom > header.offsetHeight);
    lastY = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
  if (readbar && steps.length) {
    const bar = $('.progress', readbar);
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    steps.forEach((el) => { const tick = document.createElement('s'); tick.style.left = `${Math.min(100, (el.getBoundingClientRect().top + scrollY) / max * 100)}%`; bar.append(tick); });
  }
}

// ---------- Menu sheet ----------
export function initMenu(buildRoute) {
  const sheet = $('.menu-sheet');
  const toggle = $('.nav-toggle');
  if (!sheet || !toggle) return;
  let built = false;
  const open = async () => {
    sheet.classList.add('is-open');
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    sheet.removeAttribute('inert');
    $('.menu-close', sheet).focus({ preventScroll: true });
    if (!built && buildRoute) { built = true; await buildRoute($('.menu-route-list', sheet)); }
  };
  const close = () => {
    sheet.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    sheet.setAttribute('inert', '');
    toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', open);
  $('.menu-close', sheet).addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) close(); });
  const toggles = $$('[data-motion-toggle]');
  const label = () => toggles.forEach((b) => { b.textContent = document.documentElement.hasAttribute('data-motion-off') ? 'Play animations' : 'Pause animations'; });
  toggles.forEach((b) => b.addEventListener('click', () => {
    const off = !document.documentElement.hasAttribute('data-motion-off');
    document.documentElement.toggleAttribute('data-motion-off', off);
    try { localStorage.setItem('pace-notes-motion', off ? 'off' : 'on'); } catch (e) { /* ignore */ }
    label();
  }));
  label();
  return { open, close };
}
try { if (localStorage.getItem('pace-notes-motion') === 'off') document.documentElement.setAttribute('data-motion-off', ''); } catch (e) { /* ignore */ }

// ---------- Scrolly engine: the active step is the last card whose top passed 78% of the screen ----------
export function scrolly(section, onStep) {
  const steps = $$('.step', section);
  let active = -1;
  let ticking = false;
  const desktop = () => innerWidth >= 1000;
  const update = () => {
    ticking = false;
    const line = innerHeight * (desktop() ? 0.72 : 0.8);
    let idx = -1;
    steps.forEach((st, i) => { const card = $('.step-card', st) || st; if (card.getBoundingClientRect().top < line) idx = i; });
    idx = Math.max(0, idx);
    const r = section.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (idx !== active) {
      active = idx;
      steps.forEach((st, i) => st.classList.toggle('is-active', i === idx));
      onStep(idx, steps[idx].dataset);
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
  if (active === -1) { active = 0; steps[0]?.classList.add('is-active'); onStep(0, steps[0]?.dataset || {}); }
  return { get: () => active };
}

// ---------- Reveals, decks ----------
export function initReveals() {
  if (!('IntersectionObserver' in window) || reduced()) { $$('.reveal').forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.15 });
  $$('.reveal').forEach((el) => io.observe(el));
}
export function initDeck(deck) {
  const dots = deck.nextElementSibling?.classList.contains('deck-dots') ? deck.nextElementSibling : null;
  if (!dots) return;
  const cards = Array.from(deck.children);
  dots.replaceChildren(...cards.map(() => document.createElement('i')));
  const mark = () => {
    const x = deck.scrollLeft; const w = cards[0]?.offsetWidth || 1;
    const i = Math.min(cards.length - 1, Math.round(x / (w + 12)));
    Array.from(dots.children).forEach((d, j) => d.classList.toggle('on', j === i));
  };
  deck.addEventListener('scroll', () => requestAnimationFrame(mark), { passive: true });
  mark();
}

/** Race-time fields: on touch keypads the dot or comma just typed becomes a colon ("3.30" → "3:30"). */
export function keypad(input) {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const v = input.value.replace(/[.,]/g, ':');
    if (v !== input.value) { input.value = v; try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
  });
}
/** "3:30", "3:30:15", "3.5h", "210" (minutes) → seconds, or null. */
export function parseTime(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const hours = t.match(/^(\d+(?:\.\d+)?)\s*h(ours?)?$/);
  if (hours) return Math.round(parseFloat(hours[1]) * 3600);
  const parts = t.split(/[:.,]/).map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 1) return parts[0] >= 100 ? parts[0] * 60 : parts[0] * 3600;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** Simple linear scale. */
export function scale(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.invert = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return f;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
