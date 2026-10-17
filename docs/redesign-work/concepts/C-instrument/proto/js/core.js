// Pace Notes · Instrument · shared runtime (vanilla, no build step).
// In the real site these become: UnitsProvider (exists), SiteHeader (exists),
// a server-rendered Contents sheet, and three tiny client islands (Seg, Scrub, Reveal).

export const KM_PER_MI = 1.609344;
export const FT_PER_M = 1 / 0.3048;

/* ---------------- Units ---------------- */
const UNIT_KEY = 'marathon-study-units'; // already allowlisted (I6)
const subs = new Set();
function readUnits() {
  try {
    const q = new URLSearchParams(location.search).get('units');
    if (q === 'km' || q === 'mi') return q;
    return localStorage.getItem(UNIT_KEY) === 'km' ? 'km' : 'mi';
  } catch { return 'mi'; }
}
let units = readUnits();
export const U = {
  get: () => units,
  set(u) { units = u; try { localStorage.setItem(UNIT_KEY, u); } catch {} subs.forEach(f => f(u)); },
  on(f) { subs.add(f); return () => subs.delete(f); },
  km: () => units === 'km',
  /** pace from seconds per km */
  pace(sPerKm, withUnit = true) {
    const s = units === 'km' ? sPerKm : sPerKm * KM_PER_MI;
    return fmtMS(s) + (withUnit ? (units === 'km' ? '/km' : '/mi') : '');
  },
  paceUnit: () => (units === 'km' ? '/km' : '/mi'),
  /** distance in prose: one decimal, no machine-made 3.11 mi */
  dist(km, d = 1) {
    if (units === 'km') return trimZero((+km).toFixed(d)) + ' km';
    return trimZero((km / KM_PER_MI).toFixed(d)) + ' mi';
  },
  distN(km) { return units === 'km' ? km : km / KM_PER_MI; },
  distUnit: () => (units === 'km' ? 'km' : 'mi'),
  marathon: () => (units === 'km' ? '42.2 km' : '26.2 miles'),
  elev(m) { return units === 'km' ? Math.round(m) + ' m' : Math.round(m * FT_PER_M).toLocaleString('en-US') + ' ft'; },
  elevN(m) { return units === 'km' ? m : m * FT_PER_M; },
  elevUnit: () => (units === 'km' ? 'm' : 'ft'),
  temp(c, d = 0) { return units === 'km' ? (+c).toFixed(d) + ' °C' : (c * 9 / 5 + 32).toFixed(d) + ' °F'; },
  tempN(c) { return units === 'km' ? c : c * 9 / 5 + 32; },
  tempUnit: () => (units === 'km' ? '°C' : '°F'),
};
const trimZero = s => s.replace(/\.0$/, '');

/* ---------------- Formatting ---------------- */
export function fmtClock(s) { // h:mm:ss
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
export function fmtHM(s) { s = Math.round(s / 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
export function fmtMS(s) { // m:ss (no sign)
  s = Math.round(Math.abs(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtGap(s) { // signed m:ss with a true minus
  const r = Math.round(s); return (r < 0 ? '−' : r > 0 ? '+' : '±') + fmtMS(r);
}
export function pct(x, d = 0) { return (x * 100).toFixed(d) + '%'; }
export function pctN(x, d = 0) { return (x * 100).toFixed(d); }
export function num(n) { return Math.round(n).toLocaleString('en-US'); }
export function millions(n) { return (Math.floor(n / 1e5) / 10).toFixed(1); } // 3.41M -> "3.4" (never rounds up)
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export function countWord(n) { return WORDS[n] ?? String(n); }
/** "3 in 10" style, picking the smallest clean denominator within tolerance */
export function inWords(share) {
  const c = [2, 3, 4, 5, 10, 20, 25, 50].map(d => { const k = Math.round(share * d); return { k, d, e: Math.abs(k / d - share) }; }).filter(x => x.k > 0);
  const best = Math.min(...c.map(x => x.e));
  const pick = c.find(x => x.e <= best + 0.004 && x.e <= 0.012);
  if (pick) return { k: pick.k, d: pick.d, text: `${pick.k} in ${pick.d}` };
  return { k: Math.round(share * 100), d: 100, text: `${Math.round(share * 100)} in 100` };
}

/** Plain-language approximation: "about 3 in 10", "nearly 3 in 4", "just over 7 in 10". */
export function approxWords(share) {
  const c = [2, 3, 4, 5, 10].map(d => { const k = Math.round(share * d); return { k, d, diff: share - k / d }; }).filter(x => x.k > 0);
  const near = c.find(x => Math.abs(x.diff) <= 0.012) || c.filter(x => Math.abs(x.diff) <= 0.034).sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
  if (near) {
    const { k, d, diff } = near, q = Math.abs(diff) <= 0.012 ? 'about' : diff < 0 ? 'nearly' : 'just over';
    return { k, d, q, text: `${q} ${k} in ${d}`, bare: `${k} in ${d}` };
  }
  const p = Math.round(share * 100);
  return { k: p, d: 100, q: '', text: `${p}%`, bare: `${p}%` };
}

/* ---------------- Haptic-feeling feedback ---------------- */
export function detentTick() { try { navigator.vibrate && navigator.vibrate(3); } catch {} }

/* ---------------- Icons ---------------- */
export const ICON = {
  arrow: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 8h10.5M9 3.5 13.5 8 9 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 8H3M7 3.5 2.5 8 7 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 9 9 3M4 3h5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" fill="currentColor"/></svg>',
  laps: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="15.25" stroke="currentColor" stroke-opacity=".22" stroke-width="1.5"/><path d="M10 12h12M10 16h8M10 20h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
export const BRAND_MARK = '<svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="13" fill="rgb(255,91,46)"/><path d="M7 9.5h12M7 13h8.5M7 16.5h10.5" stroke="#141519" stroke-width="1.9" stroke-linecap="round"/></svg>';

/* Pixel runner: 11 x 13 grid, two frames */
const PX = {
  f1: ['....oo.....', '....oo.....', '...ooo.....', '..o.ooo....', '.o..ooo.o..', '....ooo.o..', '....oo.....', '...o.oo....', '..o...o....', '.o....o....', '.o.....o...', '.......o...', '...........'],
  f2: ['....oo.....', '....oo.....', '...ooo.....', '...oooo....', '..o.ooo....', '...oooo.o..', '....oo.....', '....ooo....', '....o.o....', '...o...o...', '...o....o..', '..o........', '...........'],
};
export function pixelRunner(cls = '', color = 'currentColor') {
  const draw = rows => rows.map((r, y) => [...r].map((c, x) => c === 'o' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '').join('')).join('');
  return `<svg class="px-runner ${cls}" viewBox="0 0 11 13" fill="${color}" aria-hidden="true"><g class="f1">${draw(PX.f1)}</g><g class="f2">${draw(PX.f2)}</g></svg>`;
}

/* ---------------- The laps (the reading order) ---------------- */
// Values are filled from nuggets.js; nothing here is a number.
export const LAPS = [
  { n: '01', id: 'field', title: 'The field', sub: 'Finish times, the replay', href: 'index.html#guide' },
  { n: '02', id: 'first5k', title: 'The first 5K', sub: 'Starting pace, downhill starts', href: 'analysis-starting-pace.html' },
  { n: '03', id: 'shape', title: 'The shape of a race', sub: 'Six pacing types, your pattern', href: 'index.html#guide' },
  { n: '04', id: 'halfway', title: 'Halfway to 30K', sub: 'Checkpoints, places, the projector', href: 'index.html#guide' },
  { n: '05', id: 'after30', title: 'After 30K', sub: 'Sustained slowdown, where time goes', href: 'index.html#guide' },
  { n: '06', id: 'finish', title: 'The finish line', sub: 'The 3:59 effect, the final stretch', href: 'story-round-numbers.html' },
  { n: '07', id: 'who', title: 'Who holds pace', sub: 'Women and men, age', href: 'index.html#guide' },
  { n: '08', id: 'yours', title: 'Your race', sub: 'Find a past race, check your splits', href: 'index.html#guide' },
  { n: '09', id: 'where', title: 'Where you run', sub: 'Course fingerprints, every course page', href: 'course-boston.html' },
  { n: '10', id: 'weather', title: 'The weather', sub: 'Heat, warming, wind', href: 'index.html#guide' },
  { n: '11', id: 'next', title: 'The next one', sub: 'Improvement, then plan it', href: 'index.html#guide' },
];

/* ---------------- Chrome ---------------- */
export function mountChrome({ lap = null, lapProgress = true } = {}) {
  document.documentElement.classList.remove('no-js');
  // Lap track
  const track = document.createElement('div');
  track.className = 'lap-track'; track.setAttribute('aria-hidden', 'true');
  track.style.setProperty('--laps', LAPS.length);
  const idx = lap ? LAPS.findIndex(l => l.n === lap) : -1;
  LAPS.forEach((l, i) => { const s = document.createElement('i'); if (i < idx) s.className = 'done'; if (i === idx) s.className = 'now'; track.append(s); });
  document.body.prepend(track);

  // Header
  const bar = document.querySelector('[data-bar]');
  const lapLabel = idx >= 0 ? `<span class="lapno">Lap <b>${LAPS[idx].n}</b></span>` : '<span class="lapno is-contents">Contents</span>';
  bar.innerHTML = `<div class="wrap">
      <a class="brand header-brand" href="index.html" aria-label="Pace Notes, home">${BRAND_MARK}<span class="brand-name">Pace Notes</span></a>
      <div class="bar-end">
        <div class="units unit-switch" role="group" aria-label="Distance and pace units" data-u="${U.get()}">
          <button type="button" data-u="mi" aria-pressed="${U.get() === 'mi'}" aria-label="Miles">mi</button>
          <button type="button" data-u="km" aria-pressed="${U.get() === 'km'}" aria-label="Kilometres">km</button>
          <i class="thumb" aria-hidden="true"></i>
        </div>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu">${lapLabel}${ICON.laps}<span class="sr-only">Open contents</span></button>
      </div></div>`;
  wireUnits(bar.querySelector('.units'));

  // Header: hide on scroll down, return on scroll up (transform only: no CLS)
  let lastY = scrollY, ticking = false;
  const onScroll = () => {
    const y = scrollY;
    bar.classList.toggle('is-scrolled', y > 8);
    if (!document.querySelector('.sheet.is-open') && !bar.contains(document.activeElement)) {
      if (y > lastY + 6 && y > 140) bar.classList.add('is-hidden');
      else if (y < lastY - 6) bar.classList.remove('is-hidden');
    }
    lastY = y;
    if (lapProgress && idx >= 0) {
      const max = document.documentElement.scrollHeight - innerHeight;
      track.children[idx].style.setProperty('--p', Math.min(1, Math.max(0, y / Math.max(1, max))).toFixed(3));
    }
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // Contents sheet
  const sheet = document.createElement('div');
  sheet.className = 'sheet'; sheet.id = 'site-menu-sheet';
  sheet.innerHTML = `<div class="sheet-scrim" data-close></div>
    <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-top"><p class="label" id="sheet-title">Contents · <b>${LAPS.length} laps</b>, start to finish</p>
        <button class="sheet-close" type="button" data-close aria-label="Close contents">${ICON.close}</button></div>
      <nav id="site-menu" class="main-nav" aria-label="Site">
        <div class="doors">
          <a class="nav-primary press" href="#plan">Plan your race ${ICON.arrow}</a>
          <a class="press" href="#runners">Analyze a past race ${ICON.arrow}</a>
          <div class="doors-3">
            <a class="press" href="course-boston.html">Courses</a>
            <a class="press" href="#tools">Tools</a>
            <a class="press" href="index.html#guide">All laps</a>
          </div>
        </div>
      </nav>
      <ol class="laps" data-laps></ol>
      <div class="sheet-foot nav-more"><a href="#methodology">Methodology</a><a href="#about">About</a><a href="#request">Request an analysis</a><a href="#data">Open data ↗</a></div>
    </div>`;
  document.body.append(sheet);
  renderLaps(sheet.querySelector('[data-laps]'), idx);
  const toggle = bar.querySelector('.nav-toggle');
  let filled = false;
  const fill = () => { if (filled) return; filled = true; import('./nuggets.js').then(m => m.lapReadings()).then(fillLapReadings).catch(() => { filled = false; }); };
  // readings fill at idle (or on first open), so the sheet never shows dashes
  (window.requestIdleCallback || (f => setTimeout(f, 1200)))(fill);
  const open = () => { fill(); sheet.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); bar.classList.remove('is-hidden'); document.body.style.overflow = 'hidden'; setTimeout(() => sheet.querySelector('.sheet-close').focus(), 60); };
  const close = () => { sheet.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; toggle.focus({ preventScroll: true }); };
  toggle.addEventListener('click', open);
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) close(); });
  window.__openContents = open;

  mountReveals();
  mountDepth();
  mountFooter();
  return { lapIndex: idx };
}

export function renderLaps(ol, hereIdx = -1, readings = null) {
  ol.innerHTML = LAPS.map((l, i) => {
    const r = readings?.[l.id];
    return `<li class="${i === hereIdx ? 'is-here' : ''}"><a href="${l.href}" ${i === hereIdx ? 'aria-current="page"' : ''}>
      <span class="n">${l.n}</span>
      <span class="t">${l.title}<small>${l.sub}</small></span>
      <span class="v" data-lap-v="${l.id}">${r ? `${r.v}<small>${r.k}</small>` : '<span style="color:var(--rule-strong)">—</span><small>&nbsp;</small>'}</span>
    </a></li>`;
  }).join('');
}
export function fillLapReadings(readings) {
  document.querySelectorAll('[data-lap-v]').forEach(el => {
    const r = readings[el.dataset.lapV];
    if (r) el.innerHTML = `${r.v}<small>${r.k}</small>`;
  });
}

function wireUnits(el) {
  el.querySelectorAll('button').forEach(b => {
    b.addEventListener('pointerdown', () => el.classList.add('is-pressing'));
    b.addEventListener('click', () => {
      const u = b.dataset.u; if (u === U.get()) return;
      el.dataset.u = u; el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.u === u)));
      detentTick(); U.set(u);
    });
  });
  const up = () => el.classList.remove('is-pressing');
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/* Reveal: an observer only toggles a class; CSS owns the motion */
export function mountReveals(root = document) {
  const els = root.querySelectorAll('.reveal, [data-in]');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver(ents => ents.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); en.target.dispatchEvent(new CustomEvent('in')); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
  els.forEach(e => io.observe(e));
}
export function onceInView(el, fn, margin = '0px 0px -15% 0px') {
  if (!('IntersectionObserver' in window)) return fn();
  const io = new IntersectionObserver(ents => { if (ents.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(el);
}

/* Depth: <details> that opens with a spring height */
function mountDepth() {
  document.querySelectorAll('details.depth').forEach(d => {
    const sum = d.querySelector('summary'), body = d.querySelector('.depth-body');
    sum.addEventListener('click', e => {
      if (reduced()) return;
      e.preventDefault();
      const opening = !d.open;
      d.classList.add('is-animating');
      if (opening) d.open = true;
      const h = body.scrollHeight;
      const anim = body.animate([{ height: opening ? '0px' : h + 'px', opacity: opening ? 0 : 1 }, { height: opening ? h + 'px' : '0px', opacity: opening ? 1 : 0 }],
        { duration: opening ? 520 : 300, easing: opening ? 'cubic-bezier(.3,1.15,.6,1)' : 'cubic-bezier(.4,0,.2,1)' });
      anim.onfinish = () => { if (!opening) d.open = false; d.classList.remove('is-animating'); };
    });
  });
}

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off');

/* Segmented control: tap to compare. The thumb is measured, then sprung. */
export function seg(el, onChange) {
  const thumb = el.querySelector('.thumb') || el.appendChild(Object.assign(document.createElement('i'), { className: 'thumb' }));
  thumb.setAttribute('aria-hidden', 'true');
  const btns = [...el.querySelectorAll('button')];
  const place = (b, instant) => {
    if (instant) thumb.style.transition = 'none';
    thumb.style.width = b.offsetWidth + 'px';
    thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    if (instant) { thumb.offsetWidth; thumb.style.transition = ''; }
  };
  btns.forEach(b => {
    b.addEventListener('pointerdown', () => el.classList.add('is-pressing'));
    b.addEventListener('click', () => {
      el.classList.remove('is-pressing');
      if (b.getAttribute('aria-pressed') === 'true') return;
      btns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      place(b); detentTick(); onChange(b.dataset.v, b);
    });
  });
  const cur = btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0];
  requestAnimationFrame(() => place(cur, true));
  addEventListener('resize', () => place(btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0], true));
  if (document.fonts) document.fonts.ready.then(() => place(btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0], true));
}

/* Deck pagination dots */
export function deckDots(deck, dots) {
  const n = deck.children.length;
  dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
  deck.addEventListener('scroll', () => {
    const w = deck.children[0].getBoundingClientRect().width + 12;
    const i = Math.min(n - 1, Math.round(deck.scrollLeft / w));
    [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j));
  }, { passive: true });
}

function mountFooter() {
  const f = document.querySelector('[data-foot]');
  if (!f) return;
  f.className = 'foot';
  f.innerHTML = `<div class="checker" aria-hidden="true"></div><div class="wrap foot-grid">
    <div><a class="brand" href="index.html">${BRAND_MARK}<span class="brand-name">Pace Notes</span></a>
      <p class="small" style="margin-top:12px;max-width:22rem;color:var(--ink-3)">How marathons are actually run, read from every recorded 5K split. By Andrew Kam.</p></div>
    <nav class="foot-links" aria-label="Footer">
      <a href="index.html#guide">All laps</a><a href="course-boston.html">Courses</a><a href="#tools">Tools</a>
      <a href="#methodology">Methodology</a><a href="#about">About</a><a href="/privacy">Privacy</a>
    </nav>
    <div class="foot-meta" style="grid-column:1/-1"><span class="label">Pace Notes · by Andrew Kam</span>
      <button class="switch" type="button" role="switch" aria-checked="true" data-motion>Motion <i aria-hidden="true"></i></button></div>
  </div>`;
  const sw = f.querySelector('[data-motion]');
  const set = on => { sw.setAttribute('aria-checked', String(on)); document.documentElement.toggleAttribute('data-motion-off', !on); };
  try { set(localStorage.getItem('pace-notes-motion') !== 'off'); } catch {}
  sw.addEventListener('click', () => { const on = sw.getAttribute('aria-checked') !== 'true'; set(on); try { localStorage.setItem('pace-notes-motion', on ? 'on' : 'off'); } catch {} });
}

/* Feedback row (no text box, by contract) */
export function feedback(el) {
  el.className = 'page-feedback';
  el.innerHTML = `<span>Was this useful?</span><div class="fb"><button type="button" aria-pressed="false">Yes</button><button type="button" aria-pressed="false">No</button></div>`;
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); detentTick();
  }));
}

/* tiny DOM helpers */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
