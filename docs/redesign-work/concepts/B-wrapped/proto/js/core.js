/* Pace Notes · Wrapped prototype runtime.
   Everything a page shares: data loading, units, the "your race" thread, formatting,
   reveal motion, odometer numbers, flip cards, share cards, the race map, the dock and rail.
   In the real site most of this is server-rendered; the client parts that remain are noted in direction.md. */
(function () {
  const PN = (window.PN = {});
  const doc = document.documentElement;
  doc.classList.remove('no-js');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || doc.hasAttribute('data-motion-off');
  PN.reduced = reduced;

  /* ---------- storage (every access guarded: private windows and blocked storage must still render) ---------- */
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: keep the in-memory value */ } },
  };

  /* ---------- data ---------- */
  const cache = {};
  PN.data = (name) => cache[name] || (cache[name] = fetch(`data/${name}.json`).then((r) => { if (!r.ok) throw new Error(name); return r.json(); }));

  /* ---------- events ---------- */
  const subs = {};
  PN.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
  const emit = (ev) => (subs[ev] || []).forEach((fn) => fn());

  /* ---------- units (existing allowlisted key) ---------- */
  const qs = new URLSearchParams(location.search);
  PN.units = qs.get('units') === 'km' ? 'km' : LS.get('marathon-study-units') === 'km' ? 'km' : 'mi';
  PN.setUnits = (u) => { PN.units = u; LS.set('marathon-study-units', u); doc.dataset.units = u; syncUnitButtons(); emit('units'); };
  doc.dataset.units = PN.units;

  /* ---------- the "your race" thread (one new key, to be allowlisted: pace-notes-your-race) ---------- */
  const race = { goal: 240, course: 'All courses' };
  try { Object.assign(race, JSON.parse(LS.get('pace-notes-your-race') || '{}')); } catch (e) { /* ignore */ }
  const parseGoal = (s) => { const m = String(s).match(/^(\d)[:.h]?(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
  if (qs.get('goal') && parseGoal(qs.get('goal'))) race.goal = parseGoal(qs.get('goal'));
  PN.race = race;
  PN.setRace = (patch) => { Object.assign(race, patch); LS.set('pace-notes-your-race', JSON.stringify(race)); bindYou(); emit('race'); };

  /* ---------- formatting ---------- */
  const KM_MI = 1.609344;
  const pad = (n) => String(n).padStart(2, '0');
  const MINUS = '−';
  const f = (PN.f = {
    int: (n) => Math.round(n).toLocaleString('en-US'),
    million: (n) => `${(n / 1e6).toFixed(1)} million`,
    clock: (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; },
    hm: (s) => { s = Math.floor(s / 60); return `${Math.floor(s / 60)}:${pad(s % 60)}`; }, // finish times truncate, as runners read them
    goal: (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`,
    ms: (s, sign) => { const a = Math.abs(Math.round(s)); const t = `${Math.floor(a / 60)}:${pad(a % 60)}`; return sign ? (s < 0 ? MINUS : '+') + t : t; },
    minutes: (s) => `${Math.round(Math.abs(s) / 60)} min`,
    pct: (x, d = 0) => `${(x * 100).toFixed(d)}%`,
    pctNum: (x, d = 0) => (x * 100).toFixed(d),
    signed: (x, d = 0) => (x < 0 ? MINUS : '+') + Math.abs(x).toFixed(d),
    pace: (sPerKm) => { const s = PN.units === 'mi' ? sPerKm * KM_MI : sPerKm; return `${Math.floor(s / 60)}:${pad(Math.round(s % 60) % 60)}/${PN.units}`; },
    paceShort: (sPerKm) => { const s = PN.units === 'mi' ? sPerKm * KM_MI : sPerKm; return `${Math.floor(s / 60)}:${pad(Math.round(s % 60) % 60)}`; },
    dist: (km, d = 1) => PN.units === 'mi' ? `${trim((km / KM_MI).toFixed(d))} mi` : `${trim(km.toFixed(d))} km`,
    /* Section labels: runners' names in miles mode, recorded mats in km mode. Never two-decimal miles. */
    section: (label) => {
      const [a, b] = String(label).split(/[–-]/).map(Number);
      if (PN.units === 'km') return `${trim(String(a))}–${trim(String(b))} km`;
      const mi = (k) => (k >= 42 ? '26.2' : trim((k / KM_MI).toFixed(1)));
      return `${mi(a)}–${mi(b)} mi`;
    },
    mat: (km) => ({ 5: '5K', 10: '10K', 15: '15K', 20: '20K', 21.1: 'Half', 25: '25K', 30: '30K', 35: '35K', 40: '40K', 42.2: 'Finish' })[km] || `${km}K`,
    temp: (c) => PN.units === 'mi' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`,
    tempGap: (c) => PN.units === 'mi' ? `${Math.round((c * 9) / 5)}°F` : `${trim(c.toFixed(0))}°C`,
    finalStretch: () => PN.units === 'mi' ? 'last 1.4 mi' : 'last 2.2 km',
    ratioWord: (r) => { const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']; const n = Math.round(r); return n <= 10 ? w[n] : String(n); },
    inN: (x) => { const n = Math.round(1 / x); return `1 in ${n}`; },
  });
  function trim(s) { return s.replace(/\.0$/, ''); }
  PN.parseGoal = parseGoal;

  /* ---------- binding personal text ---------- */
  function bindYou() {
    document.querySelectorAll('[data-you="goal"]').forEach((el) => { el.textContent = f.goal(race.goal); });
    document.querySelectorAll('[data-you="pace"]').forEach((el) => { el.textContent = f.pace((race.goal * 60) / 42.195); });
    document.querySelectorAll('[data-you="course"]').forEach((el) => { el.textContent = race.course; });
  }
  PN.bindYou = bindYou;

  /* ---------- chapters: the reading order, as one race ---------- */
  PN.CHAPTERS = [
    { n: '00', t: 'The start line', l: 'Prologue', f: '00', href: 'index.html', zone: 'warm' },
    { n: '01', t: 'The field', l: 'Corral', f: '01', zone: 'warm' },
    { n: '02', t: 'The course', l: 'Course map', f: '02', href: 'course-boston.html', zone: 'warm' },
    { n: '03', t: 'Race morning', l: 'Forecast', f: '03', light: true, zone: 'warm' },
    { n: '04', t: 'The first 5K', l: 'Gun → 5K', f: '04', href: 'analysis-starting-pace.html', zone: 'race', km: 2.5 },
    { n: '05', t: 'The shape of a race', l: '5K → Half', f: '05', light: true, zone: 'race', km: 13 },
    { n: '06', t: 'Halfway to 30K', l: 'Half → 30K', f: '06', zone: 'race', km: 25.6 },
    { n: '07', t: 'After 30K', l: '30K → 40K', f: '07', zone: 'race', km: 35 },
    { n: '08', t: 'The finish line', l: '40K → Finish', f: '08', href: 'chapter-finish-line.html', light: true, zone: 'race', km: 41.2 },
    { n: '09', t: 'Who holds pace', l: 'Finish area', f: '09', light: true, zone: 'cool' },
    { n: '10', t: 'Your race', l: 'Results', f: '10', light: true, zone: 'cool' },
    { n: '11', t: 'The next one', l: 'Next start line', f: '11', zone: 'cool' },
  ];
  /* Rail position (0..1) of each station: four at the start line, five spread over 42.2 km, three after the finish. */
  const RACE0 = 0.2, RACE1 = 0.8;
  PN.station = (i) => {
    const c = PN.CHAPTERS[i];
    if (c.zone === 'warm') return 0.012 + i * 0.058;
    if (c.zone === 'race') return RACE0 + ((RACE1 - RACE0) * c.km) / 42.195;
    return RACE1 + 0.055 + (i - 9) * 0.07;
  };

  /* Lead nuggets for the race map, computed from data fields (guards keep wording honest). */
  PN.leads = async () => {
    const [home, ft, courses, kick, study, pos, demo] = await Promise.all(['home', 'finish-times', 'courses', 'kick', 'study', 'positions', 'demographics'].map(PN.data));
    const hist = ft.histogram; const total = hist.reduce((s, h) => s + h.all, 0);
    let acc = 0, median = 0; for (const h of hist) { acc += h.all; if (acc >= total / 2) { median = h.minute; break; } }
    const faster = home.patterns.find((p) => p.label === 'Faster second 20 km');
    const late = study.timing.charts[0].rows.filter((r) => r.label >= 30).reduce((s, r) => s + r.value, 0);
    const coin = pos.coin_flip['30'].find((r) => r.gap_lo_s === 60);
    const b0 = kick.bank.bands[0];
    return {
      '00': [f.million(home.cohort.after_duplicate_screen).replace(' million', 'M'), 'finishes, one race'],
      '01': [f.goal(median), 'median finish'],
      '02': [f.pct(courses.identification.correct / courses.identification.editions_tested), 'named by pacing alone'],
      '03': [`${courses.weather.pairs.hotter_slowed_more}/${courses.weather.pairs.total}`, 'warmer year slowed more'],
      '04': [f.ms(b0.after20_s), 'given back after 20K'],
      '05': [f.inN(faster.value / 100), 'ran a faster second half'],
      '06': [f.pct(coin.share), 'a minute back at 30K still won'],
      '07': [`${Math.round(late)}%`, 'of slowdowns start at 30K+'],
      '08': [`${Math.round(kick.kick.share * 4)} in 4`, 'speed up at the end'],
      '09': [`${f.pctNum(demo.overall.women_slowdown)} vs ${f.pctNum(demo.overall.men_slowdown)}`, 'women vs men, same time'],
      '10': ['You', 'your race, wrapped'],
      '11': [f.pct(kick.recurrence.after_slowdown.observed), 'slowdown came back'],
    };
  };

  /* ---------- chrome: header, dock, sheets ---------- */
  const ICON = {
    menu: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7h14M3 13h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    close: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    flip: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8a6 6 0 0 1 10.5-3.5L16 6M16 2.5V6h-3.5M16 12a6 6 0 0 1-10.5 3.5L4 14M4 17.5V14h3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3M6 7l4-4 4 4M4 11v5h12v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  PN.ICON = ICON;

  PN.mountChrome = function ({ chapter = '00', home = false } = {}) {
    PN.chapter = chapter;
    const idx = PN.CHAPTERS.findIndex((c) => c.n === chapter);
    const top = document.createElement('header');
    top.className = 'top';
    top.innerHTML = `
      <a class="brand" href="index.html" aria-label="Pace Notes, home"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Pace Notes</span></a>
      <span class="top-space"></span>
      <div class="units unit-switch" role="group" aria-label="Distance and pace units"><span class="units-in"><button type="button" data-u="mi" aria-pressed="true">MI</button><button type="button" data-u="km" aria-pressed="false">KM</button></span></div>
      <button class="menu-btn nav-toggle" type="button" aria-label="Open the race map" aria-haspopup="dialog" data-open="map">${ICON.menu}</button>`;
    document.body.prepend(top);
    const skip = document.createElement('a'); skip.className = 'skip'; skip.href = '#main'; skip.textContent = 'Skip to content'; document.body.prepend(skip);

    const dock = document.createElement('nav');
    dock.className = 'dock';
    dock.setAttribute('aria-label', 'Race progress');
    if (home) dock.dataset.hidden = 'true';
    const c = PN.CHAPTERS[idx];
    dock.innerHTML = `
      <button class="dock-map" type="button" data-open="map" aria-label="Chapter ${c.n}, ${c.t}. Open the race map">
        <span class="rail" aria-hidden="true">${railSVG(idx)}<svg class="rail-runner runner-svg" viewBox="0 0 100 110" style="color:#F5F0E6"></svg></span>
        <span class="dock-where"><b>${c.n}</b><span>${c.t}</span></span>
      </button>
      <button class="dock-goal" type="button" data-open="goal" aria-label="Your goal time: change it"><small>YOUR GOAL</small><strong data-you="goal">4:00</strong></button>`;
    document.body.append(dock);
    PN.dock = dock;

    document.body.append(mapSheet(idx), goalSheet(), shareSheet());
    const toast = document.createElement('div'); toast.className = 'toast'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); document.body.append(toast);

    document.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => PN.setUnits(b.dataset.u)));
    syncUnitButtons();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') PN.closeSheet(); });
    bindYou();
    initRail(idx);
    initHeader(top);
    PN.leads().then(fillMap).catch(() => {});
  };

  function railSVG(idx) {
    const W = 1000, y = 11;
    const x = (p) => (p * W).toFixed(1);
    let s = `<svg viewBox="0 0 ${W} 22" preserveAspectRatio="none">`;
    s += `<line class="r-warm" x1="0" y1="${y}" x2="${x(RACE0)}" y2="${y}"/>`;
    s += `<line class="r-race" x1="${x(RACE0)}" y1="${y}" x2="${x(RACE1)}" y2="${y}"/>`;
    s += `<line class="r-done" x1="0" y1="${y}" x2="${x(PN.station(idx))}" y2="${y}" data-done/>`;
    s += `<line class="r-cool" x1="${x(RACE1)}" y1="${y}" x2="${W}" y2="${y}"/>`;
    PN.CHAPTERS.forEach((c, i) => { s += `<rect class="r-tick${i <= idx ? ' is-done' : ''}" x="${(PN.station(i) * W - 3).toFixed(1)}" y="${y - 3}" width="6" height="6" rx="3"/>`; });
    s += `<g class="r-finish">`; for (let k = 0; k < 3; k++) s += `<rect x="${(RACE1 * W - 2 + (k % 2) * 4).toFixed(1)}" y="${y - 6 + k * 4}" width="4" height="4"/>`; s += `</g>`;
    return s + '</svg>';
  }

  function initRail(idx) {
    const svg = document.querySelector('.rail-runner');
    const done = document.querySelector('[data-done]');
    if (!svg) return;
    let phase = 0.15, lastY = scrollY, idle = 0, raf = 0;
    const from = PN.station(idx), to = idx < PN.CHAPTERS.length - 1 ? PN.station(idx + 1) : 1;
    const draw = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, scrollY / max));
      const at = from + (to - from) * p * 0.94;
      svg.style.left = `${(at * 100).toFixed(2)}%`;
      if (done) done.setAttribute('x2', (at * 1000).toFixed(1));
      svg.innerHTML = window.PNRunner ? PNRunner.markup(phase, { kit: '#FF5B2E', shorts: '#F5F0E6', skin: '#C68642', shadow: false }) : '';
    };
    const tick = () => {
      const dy = scrollY - lastY; lastY = scrollY;
      if (!reduced() && Math.abs(dy) > 0.5) { phase += Math.min(0.08, Math.abs(dy) * 0.0022); idle = 0; } else idle += 1;
      draw();
      raf = idle < 20 ? requestAnimationFrame(tick) : 0;
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    draw();
  }

  function initHeader(top) {
    const tints = () => Array.from(document.querySelectorAll('[data-tint], .card, .frame-tint'));
    let lastY = scrollY;
    const update = () => {
      const y = (top.offsetHeight || 56) * 0.6;
      let hit = null;
      for (const el of tints()) { const r = el.getBoundingClientRect(); if (r.top <= y && r.bottom > y) { hit = el; } }
      if (hit) {
        const cs = getComputedStyle(hit);
        const bg = cs.getPropertyValue('--bg').trim() || cs.backgroundColor;
        const fg = cs.getPropertyValue('--fg').trim() || cs.color;
        if (bg) doc.style.setProperty('--cur-bg', bg);
        if (fg) doc.style.setProperty('--cur-fg', fg);
      }
      const dy = scrollY - lastY;
      if (!document.querySelector('.sheet.is-open') && !reduced()) {
        if (dy > 6 && scrollY > 140) top.classList.add('is-hidden');
        else if (dy < -6) top.classList.remove('is-hidden');
      }
      lastY = scrollY;
      if (PN.dock && PN.dock.dataset.homeGate) {
        const gate = document.getElementById(PN.dock.dataset.homeGate);
        if (gate) PN.dock.dataset.hidden = gate.getBoundingClientRect().bottom > innerHeight * 0.35 ? 'true' : 'false';
      }
    };
    let ticking = false;
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } }, { passive: true });
    addEventListener('resize', update);
    PN.updateTint = update;
    setTimeout(update, 30);
  }

  function syncUnitButtons() {
    document.querySelectorAll('.units [data-u]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === PN.units)));
  }

  /* ---------- sheets ---------- */
  function sheet(id, label, inner, field = 'f-paper') {
    const el = document.createElement('div');
    el.className = 'sheet';
    el.id = `sheet-${id}`;
    el.innerHTML = `<div class="sheet-scrim" data-close></div><div class="sheet-panel ${field}" role="dialog" aria-modal="true" aria-label="${label}" tabindex="-1"><div class="sheet-grab" aria-hidden="true"></div>${inner}</div>`;
    return el;
  }
  function mapSheet(idx) {
    let items = '';
    let zone = '';
    const zones = { warm: 'At the start line', race: 'The race', cool: 'After the finish' };
    PN.CHAPTERS.forEach((c, i) => {
      if (c.zone !== zone) { zone = c.zone; items += `<li class="zone">${zones[zone]}</li>`; }
      items += `<li class="${c.zone === 'race' ? '' : 'seg-' + c.zone}"><a href="${c.href || '#'}"${i === idx ? ' aria-current="page"' : ''}>
        <span class="st ${c.light ? 'light' : ''}" style="--sw: var(--c${c.f})">${c.n}</span>
        <span><span class="m-t">${c.t}</span><span class="m-l">${c.l}</span></span>
        <span class="m-n" data-lead="${c.n}">&nbsp;<small>&nbsp;</small></span></a></li>`;
    });
    return sheet('map', 'The race map', `
      <div class="sheet-head"><h2 class="sheet-title">The race, in 12 stretches</h2><button class="sheet-close" type="button" data-close aria-label="Close the race map">${ICON.close}</button></div>
      <nav id="site-menu" class="main-nav menu-top" aria-label="Main"><a class="nav-primary" href="#">Plan your race</a><a href="#">Analyze a past race</a><a href="#">Courses</a><a href="#">Tools</a><a href="index.html#map" aria-current="${idx === 0 ? 'page' : 'false'}">Research</a></nav>
      <ol class="map">${items}</ol>
      <div class="map-more nav-more"><a href="#">How we know</a><a href="#">About</a><a href="#">Request an analysis</a><a href="#">Open data ↗</a></div>
      <div class="map-foot"><span>Distances in</span><span class="units-in" role="group" aria-label="Distance and pace units"><button type="button" data-u="mi" aria-pressed="true">Miles</button><button type="button" data-u="km" aria-pressed="false">Kilometres</button></span><button type="button" class="btn btn-sm btn-quiet" data-motion-sheet>Pause animations</button></div>`);
  }
  function fillMap(leads) {
    Object.entries(leads).forEach(([n, [v, s]]) => {
      document.querySelectorAll(`[data-lead="${n}"]`).forEach((el) => { el.innerHTML = `${v}<small>${s}</small>`; });
    });
    PN.leadValues = leads;
    emit('leads');
  }
  function goalSheet() {
    return sheet('goal', 'Your goal time', `
      <div class="sheet-head"><h2 class="sheet-title">Your race</h2><button class="sheet-close" type="button" data-close aria-label="Close">${ICON.close}</button></div>
      <p class="say">Every chapter answers for your goal. It stays on this device.</p>
      <div class="stepper"><button type="button" data-step="-5" aria-label="Five minutes faster">−</button><output data-you="goal" aria-live="polite">4:00</output><button type="button" data-step="5" aria-label="Five minutes slower">+</button></div>
      <p class="stepper-sub">Even pace <span data-you="pace">9:09/mi</span></p>
      <div class="field"><label for="goal-course">Course</label><select id="goal-course" class="select" data-course><option>All courses</option></select></div>
      <div style="display:flex;gap:10px;margin-top:20px"><button class="btn btn-ink" type="button" data-close style="flex:1">Done</button></div>`);
  }
  function shareSheet() {
    return sheet('share', 'Share this card', `
      <div class="sheet-head"><h2 class="sheet-title">Share this card</h2><button class="sheet-close" type="button" data-close aria-label="Close">${ICON.close}</button></div>
      <div class="share-card" data-share-preview></div>
      <label class="share-opt"><input type="checkbox" data-share-you> Add my goal to the card</label>
      <div class="share-actions"><button class="btn btn-ink" type="button" data-toast="Saved a 1080 × 1350 image">Save image</button><button class="btn" type="button" data-toast="Link copied">Copy link</button><button class="btn" type="button" data-toast="Opening share…">Share…</button></div>`);
  }

  let lastFocus = null;
  PN.openSheet = (id, opts) => {
    const el = document.getElementById(`sheet-${id}`);
    if (!el) return;
    lastFocus = document.activeElement;
    if (id === 'share') buildShare(opts);
    if (id === 'goal') fillCourses(el);
    el.classList.add('is-open');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-shown')));
    el.querySelector('.sheet-panel').focus({ preventScroll: true });
    document.querySelector('.top')?.classList.remove('is-hidden');
  };
  PN.closeSheet = () => {
    document.querySelectorAll('.sheet.is-open').forEach((el) => {
      el.classList.remove('is-shown');
      setTimeout(() => el.classList.remove('is-open'), reduced() ? 0 : 420);
    });
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  };
  async function fillCourses(el) {
    const sel = el.querySelector('[data-course]');
    if (sel.options.length > 1) return;
    const c = await PN.data('courses');
    c.courses.map((x) => x.city).sort().forEach((city) => { const o = document.createElement('option'); o.textContent = city; sel.append(o); });
    sel.value = race.course;
    sel.addEventListener('change', () => PN.setRace({ course: sel.value }));
  }

  /* ---------- share card ---------- */
  let shareSource = null;
  function buildShare(card) {
    shareSource = card || shareSource;
    const src = shareSource;
    const box = document.querySelector('[data-share-preview]');
    if (!src || !box) return;
    const field = Array.from(src.classList).find((c) => /^f-/.test(c)) || src.dataset.field || 'f-night';
    box.className = `share-card is-in ${field}`;
    const kick = src.dataset.shareKick || '';
    const big = src.querySelector('.big');
    const claim = src.querySelector('.claim');
    const viz = src.querySelector('[data-share-viz]');
    const you = document.querySelector('[data-share-you]')?.checked;
    box.innerHTML = `<div class="sc-k"><span>${kick}</span><span>Pace Notes</span></div><div class="sc-b"></div><div class="sc-f"><b><i></i>Pace Notes</b><span>splithappens.run</span></div>`;
    const body = box.querySelector('.sc-b');
    if (big) { const b = big.cloneNode(true); b.querySelectorAll('.col').forEach((c) => (c.style.transition = 'none')); body.append(b); }
    if (claim) body.append(claim.cloneNode(true));
    if (viz) { const v = viz.cloneNode(true); v.removeAttribute('id'); v.classList.add('is-in'); body.append(v); }
    if (you) { const y = document.createElement('div'); y.className = 'bib'; y.innerHTML = `<span class="bib-no">${f.goal(race.goal)}</span><span class="bib-l">My goal</span><span class="bib-v">${src.dataset.shareYou || 'Reading the race for my goal'}</span>`; body.append(y); }
  }

  /* ---------- clicks ---------- */
  function onClick(e) {
    const t = e.target.closest('[data-open],[data-close],[data-step],[data-flip],[data-share],[data-toast]');
    if (!t) return;
    if (t.matches('[data-open]')) { e.preventDefault(); PN.openSheet(t.dataset.open); }
    else if (t.matches('[data-close]')) PN.closeSheet();
    else if (t.matches('[data-step]')) PN.setRace({ goal: Math.max(150, Math.min(390, race.goal + Number(t.dataset.step))) });
    else if (t.matches('[data-flip]')) flip(t);
    else if (t.matches('[data-share]')) PN.openSheet('share', t.closest('[data-nugget]'));
    else if (t.matches('[data-toast]')) PN.toast(t.dataset.toast);
  }
  document.addEventListener('change', (e) => { if (e.target.matches('[data-share-you]')) buildShare(); });

  function flip(btn) {
    const host = btn.closest('[data-nugget]') || btn.closest('.card');
    const fl = host && host.querySelector('.flip');
    if (!fl) return;
    const on = !fl.classList.contains('is-flipped');
    fl.classList.toggle('is-flipped', on);
    btn.setAttribute('aria-expanded', String(on));
    const label = btn.querySelector('[data-label]');
    if (label) label.textContent = on ? 'Back' : btn.dataset.flipLabel || 'Details';
    const back = fl.querySelector('.face-back'), front = fl.querySelector('.face-front');
    if (back) back.inert = !on;
    if (front) front.inert = on;
  }
  PN.flip = flip;

  PN.toast = (msg) => {
    const el = document.querySelector('.toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-on'), 1800);
  };

  /* ---------- reveal + odometer ---------- */
  PN.odo = function (el, text) {
    el.setAttribute('aria-hidden', 'true');
    const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text;
    el.innerHTML = '';
    for (const ch of String(text)) {
      if (/\d/.test(ch)) {
        const d = document.createElement('span');
        d.className = 'd';
        d.innerHTML = `<span class="ghost">${ch}</span><span class="col">${'0123456789'.split('').map((n) => `<span>${n}</span>`).join('')}</span>`;
        d.dataset.v = ch;
        el.append(d);
      } else {
        const s = document.createElement('span'); s.textContent = ch; s.className = 'sep'; el.append(s);
      }
    }
    el.classList.add('odo');
    el.after(sr);
    const host = el.closest('.is-in');
    if (host || reduced()) rollOdo(el, true);
  };
  function rollOdo(el, now) {
    el.querySelectorAll('.d').forEach((d, i) => {
      const col = d.querySelector('.col');
      if (now || reduced()) col.style.transition = 'none';
      else col.style.transitionDelay = `${i * 70}ms`;
      col.style.transform = `translateY(-${Number(d.dataset.v) * 10}%)`;
    });
  }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    e.target.querySelectorAll('.odo').forEach((o) => rollOdo(o));
    e.target.dispatchEvent(new CustomEvent('reveal'));
    io.unobserve(e.target);
  }), { threshold: 0.18 });
  PN.observe = (root = document) => root.querySelectorAll('.card, .frame, [data-reveal]').forEach((el) => io.observe(el));

  /* ---------- next-stretch mini rail: where you are, where you go next ---------- */
  PN.nextRail = (el) => {
    const i = PN.CHAPTERS.findIndex((c) => c.n === PN.chapter);
    const W = Math.max(260, Math.round(el.getBoundingClientRect().width || 340)), y = 30, X = (p) => 10 + p * (W - 20);
    let s = `<line x1="${X(0)}" x2="${X(1)}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity=".25" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    s += `<line x1="${X(0.2)}" x2="${X(0.8)}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/>`;
    s += `<line x1="${X(0)}" x2="${X(PN.station(i))}" y1="${y}" y2="${y}" stroke="currentColor" stroke-width="2.5"/>`;
    PN.CHAPTERS.forEach((c, k) => {
      const x = X(PN.station(k));
      const cur = k === i, nx = k === i + 1;
      s += `<circle cx="${x.toFixed(1)}" cy="${y}" r="${cur || nx ? 7 : 4}" fill="${nx ? 'var(--c' + c.f + ')' : k <= i ? 'currentColor' : 'var(--bg)'}" stroke="currentColor" stroke-width="${nx ? 2.5 : 1.5}"/>`;
      if (cur) s += `<text x="${Math.max(4, x - 70).toFixed(1)}" y="${y + 26}" text-anchor="start">You are here</text>`;
      if (nx) s += `<text class="nr-t" x="${Math.min(W - 4, x + 60).toFixed(1)}" y="${y - 16}" text-anchor="end">Next: ${c.n} ${c.t}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} 62" role="img" aria-label="Chapter ${PN.chapter} of 11. Next: ${(PN.CHAPTERS[i + 1] || {}).t || 'the start line'}">${s}</svg>`;
  };

  /* ---------- small SVG helpers ---------- */
  PN.svg = (w, h, inner, label, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="${cls}" role="img" aria-label="${label}">${inner}</svg>`;
  PN.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* "100 dots": a 10 x 10 grid. lit = how many of 100 are on; lit2 = an optional second (comparison) count. */
  PN.dots = function (lit, { label, lit2 = 0, size = 360, gap = 0.36, rows = 10, cols = 10, shape = 'dot' } = {}) {
    const cell = size / cols, r = (cell * (1 - gap)) / 2;
    let s = '';
    for (let i = 0; i < rows * cols; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const cls = i < lit ? 'dt on' : i < lit + lit2 ? 'dt on-2' : 'dt';
      const cx = col * cell + cell / 2, cy = row * cell + cell / 2;
      s += shape === 'bib' ? `<rect class="${cls}" x="${(cx - r).toFixed(1)}" y="${(cy - r * 0.8).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${(1.6 * r).toFixed(1)}" rx="2" style="transition-delay:${i * 8}ms"/>` : `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" style="transition-delay:${i * 8}ms"/>`;
    }
    return `<svg viewBox="0 0 ${size} ${(rows * cell).toFixed(1)}" role="img" aria-label="${label}">${s}</svg>`;
  };

  /* Range scrubber progress fill (for WebKit's track gradient). */
  PN.fillRange = (input) => { const p = ((input.value - input.min) / (input.max - input.min)) * 100; input.style.setProperty('--p', `${p}%`); };
  document.addEventListener('input', (e) => { if (e.target.matches('.scrub')) PN.fillRange(e.target); });

  /* Expose for pages */
  PN.KM_MI = KM_MI;
})();
