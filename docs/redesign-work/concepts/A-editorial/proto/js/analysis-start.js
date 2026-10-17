import { $, $$, h, s, initHeader, initMenu, initReveals, ms, pct, int, inWords, countWord, reduced, scale, onResize, whenVisible, sectionName, SECTIONS_KM } from './core.js';
import { N, data, buildRoute, argmin } from './nuggets.js';

initHeader({ chapter: '02 · The first 5K', title: 'Starting pace', minutes: 4, steps: $$('[data-track-section^="chapter-"]') });
initMenu((list) => buildRoute(list, { current: 2, compact: true }));

const [kick, fs, totals] = await Promise.all([data.kick(), data.fastStart(), data.totals()]);
const bank = await N.bank();
const sweet = await N.sweetSpot();
const signed = (sec) => `${sec < 0 ? '−' : '+'}${ms(sec)}`;
const aheadBehind = (sec) => (Math.abs(sec) < 15 ? 'level with' : sec < 0 ? `${ms(sec)} ahead of` : `${ms(sec)} behind`);

// ---------- Header: the finding, built from the data, with a neutral fallback ----------
if (bank.guard) {
  $('#a-title').replaceChildren(`A first 5K over 10% fast banked ${ms(bank.banked)}. It finished `, h('em', {}, `${ms(bank.net)} behind.`));
} else {
  $('#a-title').replaceChildren('How a fast first 5K compared at the ', h('em', {}, 'finish'));
}
$('#ans-fig').textContent = ms(bank.net);
$('#ans-sent').replaceChildren(
  'Openings more than 10% faster than their own 5K–20K pace were ', h('strong', {}, `${ms(bank.banked)} ahead`), ' at 5K. After 20K they lost ', h('strong', {}, `${ms(bank.spent)} more`), ` than same-pace finishes. `,
  h('strong', {}, pct(bank.slowdown)), ' had a ', h('a', { class: 'term', href: '#' }, 'sustained slowdown'), `, against ${pct(bank.expected)} expected for their race and pace.`,
);

// Ledger: banked (left of zero), given back, net.
{
  const rows = [['First 5K', -bank.banked, 'var(--mark-faster)'], ['After 20K', bank.spent, 'var(--mark-slower)'], ['At the finish', bank.net, 'var(--night-ink)']];
  const lo = Math.min(0, ...rows.map((r) => r[1])) * 1.25; const hi = Math.max(...rows.map((r) => r[1])) * 1.12;
  const X = (v) => ((v - lo) / (hi - lo)) * 100;
  const led = $('#ledger');
  led.setAttribute('aria-label', `First 5K ${signed(-bank.banked)}, after 20K ${signed(bank.spent)}, finish ${signed(bank.net)} against same-pace finishes.`);
  rows.forEach(([label, v, color]) => {
    const left = Math.min(X(0), X(v)); const width = Math.abs(X(v) - X(0));
    const bar = h('i', { class: `lr-bar${v < 0 ? ' left' : ''}`, style: { left: `${left}%`, width: `${width}%`, background: color } });
    // The value sits outside the bar end, or inside it when the bar runs close to the edge.
    const inside = v > 0 && left + width > 72;
    const val = h('b', { class: 'lr-val', style: v < 0 ? { right: `${100 - left + 2}%` } : inside ? { right: `${100 - left - width + 2}%`, color: 'var(--night)' } : { left: `${left + width + 2}%` } }, signed(v));
    if (inside) val.dataset.inside = '1';
    led.append(h('div', { class: 'ledger-row' }, h('span', { class: 'lr-label', style: { color: 'var(--night-ink-2)' } }, label), h('div', { class: 'lr-track' }, h('span', { class: 'ledger-zero', style: { left: `${X(0)}%`, background: 'var(--night-ink-2)' } }), bar, val)));
  });
  led.querySelectorAll('.lr-val:not([data-inside])').forEach((v) => { v.style.color = 'var(--night-ink)'; });
  whenVisible(led, () => led.classList.add('is-on'), { ratio: 0.5 });
}

// ---------- 01 Guess, then scrub: the U-curve ----------
{
  const curve = kick.bank.curve.map((c) => ({ ...c, x: c.lo + 0.5 }));
  const best = curve.find((c) => c.lo === sweet.lo);
  const host = $('#sweet-chart'); const range = $('#sweet-range'); const readout = $('#sweet-readout'); const card = $('#sweet-card');
  let revealed = false; let W = 0;
  const H = 250; const top = 22; const bottom = 30;
  const xmin = curve[0].lo; const xmax = curve[curve.length - 1].lo + 1;
  const yLo = Math.min(-150, ...curve.map((c) => c.finish_s)) - 20; const yHi = Math.max(...curve.map((c) => c.finish_s)) + 40;
  const at = (v) => curve.find((c) => c.lo === v) || curve[0];
  const svg = s('svg', { role: 'img', 'aria-label': `Average finish against same-pace finishes by first 5K. The best average finish went with a first 5K ${best.lo}–${best.lo + 1}% slower than the pace from 5K to 20K, ${ms(best.finish_s)} ahead.` });
  host.append(svg);
  function draw() {
    W = host.clientWidth; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.replaceChildren();
    const X = scale(xmin, xmax, 15, W - 15); const Y = scale(yLo, yHi, H - bottom, top);
    const defs = s('defs', {}, s('clipPath', { id: 'clip-behind' }, s('rect', { x: 0, y: 0, width: W, height: Y(0) })), s('clipPath', { id: 'clip-ahead' }, s('rect', { x: 0, y: Y(0), width: W, height: H })));
    svg.append(defs);
    [[-60, '1:00 ahead'], [0, 'same as peers'], [120, '2:00 behind'], [240, '4:00 behind']].forEach(([v, label]) => {
      if (v < yLo || v > yHi) return;
      // The curve is high on the left and low on the right, so "behind" ticks sit right and the rest sit left: the line never crosses a label.
      const right = v > 0;
      svg.append(s('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: v === 0 ? 'ax-base' : 'ax-grid', style: v === 0 ? 'stroke: var(--fg-3)' : '' }), s('text', { x: right ? W : 0, y: Y(v) - 6, 'text-anchor': right ? 'end' : 'start', class: 'ax-tick lab-halo' }, label));
    });
    [-10, -5, 0, 5, 10].forEach((v) => svg.append(s('text', { x: X(v + 0.5), y: H - 8, 'text-anchor': 'middle', class: `ax-tick${v === 0 ? ' strong' : ''}` }, v === 0 ? 'even' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`)));
    const pts = curve.map((c) => [X(c.x), Y(c.finish_s)]);
    const line = `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}`;
    const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${Y(0).toFixed(1)}L${pts[0][0].toFixed(1)},${Y(0).toFixed(1)}Z`;
    const g = s('g', { class: `fade${revealed ? ' is-on' : ''}` });
    g.append(
      s('path', { d: area, 'clip-path': 'url(#clip-behind)', class: 'mark-you', opacity: 0.12 }),
      s('path', { d: area, 'clip-path': 'url(#clip-ahead)', class: 'mark-faster', opacity: 0.14 }),
    );
    const path = s('path', { d: line, class: 'line stroke-ink' });
    g.append(path);
    const bx = X(best.x); const by = Y(best.finish_s);
    g.append(s('circle', { cx: bx, cy: by, r: 6, class: 'mark-faster ring' }), s('text', { x: bx, y: by + 24, 'text-anchor': 'middle', class: 'lab lab-halo' }, `Best: ${best.lo}–${best.lo + 1}% slower`));
    svg.append(g);
    if (revealed && !path.dataset.drawn && !reduced()) {
      const len = path.getTotalLength(); path.style.strokeDasharray = len; path.style.strokeDashoffset = len; path.dataset.drawn = '1';
      requestAnimationFrame(() => { path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)'; path.style.strokeDashoffset = '0'; });
    }
    // The reader's position.
    const v = Number(range.value); const c = at(v); const x = X(c.x);
    if (!revealed) {
      svg.append(s('line', { x1: x, x2: x, y1: top, y2: H - bottom, class: 'stroke-you', 'stroke-width': 2 }), s('text', { x: Math.min(W - 40, Math.max(40, x)), y: top - 6, 'text-anchor': 'middle', class: 'ax-tick strong lab-you' }, 'Your guess'));
    } else {
      svg.append(s('circle', { cx: x, cy: Y(c.finish_s), r: 7, class: 'mark-you ring' }));
    }
  }
  const openText = (v) => (v === 0 ? 'Even' : v < 0 ? `${-v}–${-v + 1}% faster` : `${v}–${v + 1}% slower`).replace('0–1% faster', 'Up to 1% faster');
  function read() {
    const v = Number(range.value); const c = at(v);
    range.style.setProperty('--v', String((v - Number(range.min)) / (Number(range.max) - Number(range.min))));
    range.setAttribute('aria-valuetext', `${openText(v)} first 5K`);
    if (!revealed) readout.replaceChildren(h('span', { class: 'figure is-you' }, `${Math.abs(v)}%`), h('p', {}, h('strong', {}, v === 0 ? 'An even first 5K.' : v < 0 ? 'Faster first 5K' : 'Slower first 5K'), ' than the pace from 5K to 20K. Drag, then lock it in.'));
    else readout.replaceChildren(h('span', { class: 'figure is-you' }, signed(c.finish_s)), h('p', {}, h('strong', {}, `${openText(v)} first 5K:`), ` finished ${aheadBehind(c.finish_s)} same-pace finishes. ${pct(c.slowdown)} had a sustained slowdown.`));
    draw();
  }
  range.addEventListener('input', read);
  // Drag anywhere on the chart, not only on the thumb.
  const fromPointer = (e) => { const r = svg.getBoundingClientRect(); const X = scale(xmin, xmax, 15, r.width - 15); range.value = String(Math.max(xmin, Math.min(xmax - 1, Math.floor(X.invert(e.clientX - r.left))))); read(); };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); fromPointer(e); });
  svg.addEventListener('pointermove', (e) => { if (e.buttons) fromPointer(e); });
  svg.style.touchAction = 'pan-y';
  $('#sweet-lock').addEventListener('click', () => {
    const v = Number(range.value); revealed = true; card.classList.add('is-revealed'); $('#sweet-lock').hidden = true;
    const hit = v === best.lo || v === best.lo + 1 || v === best.lo - 1;
    $('#sweet-q').replaceChildren(hit ? 'Spot on. ' : '', 'The best average finish went with a first 5K ', h('em', {}, `${best.lo}–${best.lo + 1}% slower`), ' than the pace that followed.');
    read();
  });
  onResize(host, draw); read();
  $('#sweet-table').append(h('thead', {}, h('tr', {}, h('th', {}, 'First 5K'), h('th', {}, 'Finishes'), h('th', {}, 'Finish vs peers'), h('th', {}, 'Sustained slowdown'))), h('tbody', {}, ...curve.map((c) => h('tr', {}, h('td', {}, openText(c.lo)), h('td', {}, int(c.n)), h('td', {}, signed(c.finish_s)), h('td', {}, pct(c.slowdown))))));
}

// ---------- 02 Two nuggets ----------
{
  const obs = Math.round(bank.slowdown * 100); const exp = Math.round(bank.expected * 100);
  const grid = h('div', { class: 'dots', style: { '--dots-max': '240px', '--dot-gap': '5px' }, 'aria-hidden': 'true' });
  for (let i = 0; i < 100; i += 1) grid.append(h('i', { class: i < exp ? 'lit-ctx' : i < obs ? 'lit' : '', style: { '--i': String(i % 10 + Math.floor(i / 10)) } }));
  $('#n-slowdown').append(
    h('p', { class: 'n-kicker' }, h('b', {}, 'Openings 10%+ fast')),
    h('div', { class: 'n-fig' }, h('span', { class: 'figure' }, `${obs}`), h('small', {}, 'in 100')),
    h('p', { class: 'n-claim' }, 'had a ', h('em', {}, 'sustained slowdown.'), ` For their race and pace, ${exp} would be typical.`),
    h('div', { class: 'n-viz' }, grid),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'context' }), `Typical: ${exp}`), h('span', {}, h('i', { class: 'you' }), `${obs - exp} more`)),
  );
  const all = fs.rows.find((r) => r.city === 'All courses');
  const share = (g) => g.onset.map((n) => n / g.onset.reduce((a, b) => a + b, 0));
  const fast = all.groups.find((g) => g.band === 'fast10'); const even = all.groups.find((g) => g.band === 'steady');
  const sf = share(fast); const se = share(even);
  const bar = (label, sh) => h('div', { class: 'onset-row' }, h('div', { class: 'o-label' }, h('span', {}, label), h('b', {}, `${pct(sh[0])} at 20–25K`)), h('div', { class: 'onset-bar' }, ...sh.map((v, i) => h('i', { class: i === 0 ? 'hot' : '', style: { flexGrow: String(v), opacity: i === 0 ? 1 : 0.35 + i * 0.15 } }))));
  $('#n-onset').append(
    h('p', { class: 'n-kicker' }, h('b', {}, 'When the slowdown began')),
    h('div', { class: 'n-fig' }, h('span', { class: 'figure' }, pct(sf[0])), h('small', {}, `vs ${pct(se[0])}`)),
    h('p', { class: 'n-claim' }, 'of fast openings’ slowdowns began by ', h('em', {}, '25K.'), ` For even openings, ${pct(se[0])}.`),
    h('div', { class: 'n-viz onset' }, bar('Over 10% fast', sf), bar('Within 2%', se), h('div', { class: 'onset-axis', 'aria-hidden': 'true' }, ...fs.onset_starts_km.map((k) => h('span', {}, `${k}K`)))),
  );
  initReveals();
}

// ---------- 03 Explorer + "Your race" sheet ----------
const SHORT = { fast10: '10%+ fast', fast5: '5–10% fast', fast2: '2–5% fast', steady: 'Even (±2%)', slow2: '2–5% slow', slow5: '5%+ slow' };
const state = { city: 'All courses', band: 'fast10' };
{
  const host = $('#ex-chart'); const readout = $('#ex-readout'); const chips = $('#band-chips');
  fs.bands.forEach((b) => chips.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(b.id === state.band), 'data-b': b.id }, SHORT[b.id])));
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.band = b.dataset.b; render(); });
  const ends = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
  function render() {
    $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.b === state.band)));
    $('#yr-text').textContent = `${state.city} · ${SHORT[state.band]}`;
    const row = fs.rows.find((r) => r.city === state.city);
    const g = row?.groups.find((x) => x.band === state.band); const ref = row?.groups.find((x) => x.band === 'steady');
    host.replaceChildren();
    if (!g || !ref || g.n < fs.min_cell) { readout.replaceChildren(h('p', {}, `Not enough finishes with this opening in ${state.city} to draw it. Try another opening or course.`)); return; }
    const W = host.clientWidth; const H = 240; const top = 26; const bottom = 28; const right = 4;
    const vals = [...g.pace_pct, ...ref.pace_pct];
    const X = scale(0, 42.195, 2, W - right); const Y = scale(Math.min(-14, ...vals) - 2, Math.max(22, ...vals) + 3, H - bottom, top);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${SHORT[state.band]} openings in ${state.city}: pace in each 5K section against their own pace from 5K to 20K.` });
    [-10, 0, 10, 20].forEach((v) => svg.append(s('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: v === 0 ? 'ax-base' : 'ax-grid', style: v === 0 ? 'stroke: var(--fg-3)' : '' }), s('text', { x: 0, y: Y(v) - 6, class: 'ax-tick lab-halo', style: 'stroke: var(--card)' }, v === 0 ? 'own 5K–20K pace' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%${v === 20 ? ' slower' : v === -10 ? ' faster' : ''}`)));
    svg.append(s('rect', { x: X(20), y: top - 8, width: X(42.195) - X(20), height: H - bottom - top + 8, fill: 'var(--paper-2)', opacity: 0.6 }), s('text', { x: X(20) + 6, y: H - bottom - 8, class: 'ax-tick' }, 'after 20K'));
    [5, 10, 20, 30, 40].forEach((k) => svg.append(s('text', { x: X(k), y: H - 8, 'text-anchor': 'middle', class: 'ax-tick' }, `${k}K`)));
    const pathOf = (arr) => `M${arr.map((v, i) => `${X(ends[i] - (i === 8 ? 1.1 : 2.5)).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}`;
    svg.append(s('path', { d: pathOf(ref.pace_pct), class: 'line stroke-context', 'stroke-width': 2.25 }));
    const sel = s('path', { d: pathOf(g.pace_pct), class: 'line stroke-you' }); svg.append(sel);
    g.pace_pct.forEach((v, i) => svg.append(s('circle', { cx: X(ends[i] - (i === 8 ? 1.1 : 2.5)), cy: Y(v), r: 4, class: 'mark-you ring' })));
    const k = 7; const xk = X(ends[k] - 2.5);
    const ySel = Y(g.pace_pct[k]); const yRef = Y(ref.pace_pct[k]);
    const selAbove = g.pace_pct[k] >= ref.pace_pct[k];
    if (state.band !== 'steady') svg.append(s('text', { x: xk, y: (selAbove ? ySel - 12 : ySel + 22), 'text-anchor': 'end', class: 'lab lab-you lab-halo' }, SHORT[state.band]), s('text', { x: xk, y: (selAbove ? yRef + 22 : yRef - 12), 'text-anchor': 'end', class: 'lab-2 lab-halo' }, 'Even (±2%)'));
    else svg.append(s('text', { x: xk, y: ySel - 12, 'text-anchor': 'end', class: 'lab lab-you lab-halo' }, 'Even (±2%)'));
    host.append(svg);
    if (!reduced()) { const len = sel.getTotalLength(); sel.style.strokeDasharray = len; sel.style.strokeDashoffset = len; requestAnimationFrame(() => { sel.style.transition = 'stroke-dashoffset 700ms cubic-bezier(.2,.7,.2,1)'; sel.style.strokeDashoffset = '0'; }); }
    const late = g.pace_pct[7];
    readout.replaceChildren(h('span', { class: 'figure is-you' }, `${late > 0 ? '+' : '−'}${Math.abs(late).toFixed(0)}%`), h('p', {}, h('strong', {}, `${sectionName(7)}, ${SHORT[state.band].toLowerCase()} openings`), ` in ${state.city === 'All courses' ? 'all courses' : state.city}, against their own 5K–20K pace. Even openings: ${ref.pace_pct[7] > 0 ? '+' : ''}${ref.pace_pct[7].toFixed(0)}%. ${int(g.n)} finishes.`));
  }
  onResize(host, render);
  // Sheet
  const chip = $('#your-race'); const sheet = $('#sheet'); const scrim = $('#sheet-scrim'); const sel = $('#sheet-course'); const sb = $('#sheet-bands');
  fs.rows.forEach((r) => sel.append(h('option', { value: r.city }, r.city)));
  fs.bands.forEach((b) => sb.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-b': b.id }, SHORT[b.id])));
  let pending = { ...state };
  const paintSheet = () => { sel.value = pending.city; $$('button', sb).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.b === pending.band))); };
  sb.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pending.band = b.dataset.b; paintSheet(); });
  sel.addEventListener('change', () => { pending.city = sel.value; });
  const open = () => { pending = { ...state }; paintSheet(); sheet.classList.add('is-open'); scrim.classList.add('is-open'); sheet.removeAttribute('inert'); chip.setAttribute('aria-expanded', 'true'); sel.focus({ preventScroll: true }); };
  const close = () => { sheet.classList.remove('is-open'); scrim.classList.remove('is-open'); sheet.setAttribute('inert', ''); chip.setAttribute('aria-expanded', 'false'); };
  chip.addEventListener('click', open); scrim.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) close(); });
  $('#sheet-done').addEventListener('click', () => { Object.assign(state, pending); close(); render(); $('#explore').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => chip.classList.toggle('is-on', e.isIntersecting), { rootMargin: '-20% 0px -30% 0px' }).observe($('#explore'));
  window.__openSheet = open;
}

// ---------- 04 Downhill teaser ----------
{
  const rows = fs.bands.map((b) => ({ id: b.id, down: totals.downhill.find((d) => d.id === `downhill:${b.id}`), other: totals.downhill.find((d) => d.id === `other:${b.id}`) })).filter((r) => r.down && r.other);
  const every = rows.every((r) => r.down.slowdown_pct < r.other.slowdown_pct);
  const steady = rows.find((r) => r.id === 'steady');
  const cities = steady.down.city_n;
  const W = 300; const rowH = 24; const H = rows.length * rowH + 22;
  const lo = Math.floor(Math.min(...rows.flatMap((r) => [r.down.slowdown_pct, r.other.slowdown_pct])) / 10) * 10;
  const hi = Math.ceil(Math.max(...rows.flatMap((r) => [r.down.slowdown_pct, r.other.slowdown_pct])) / 10) * 10;
  const X = scale(lo, hi, 96, W - 10);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'max-width:440px', 'aria-hidden': 'true' });
  [lo, (lo + hi) / 2, hi].forEach((v) => svg.append(s('line', { x1: X(v), x2: X(v), y1: 0, y2: H - 18, class: 'ax-grid' }), s('text', { x: X(v), y: H - 4, 'text-anchor': 'middle', class: 'ax-tick' }, `${v}%`)));
  rows.forEach((r, i) => {
    const y = 10 + i * rowH;
    svg.append(s('text', { x: 0, y: y + 4, class: 'lab-2', style: 'font-size:12px' }, SHORT[r.id]), s('line', { x1: X(r.down.slowdown_pct), x2: X(r.other.slowdown_pct), y1: y, y2: y, class: 'stroke-context', 'stroke-width': 2 }), s('circle', { cx: X(r.other.slowdown_pct), cy: y, r: 5, class: 'mark-context ring' }), s('circle', { cx: X(r.down.slowdown_pct), cy: y, r: 5, class: 'mark-faster ring' }));
  });
  $('#n-downhill').append(
    h('p', { class: 'n-kicker' }, h('b', {}, 'Also in chapter 02'), 'Downhill starts'),
    h('p', { class: 'n-claim' }, every ? [`On the ${countWord(cities)} courses with a downhill first 5K, `, h('em', {}, 'every'), ' opening group had fewer sustained slowdowns.'] : ['Downhill first 5Ks and sustained slowdowns, by opening.']),
    h('p', { class: 'n-context' }, `Even openings: ${steady.down.slowdown_pct.toFixed(1)}% there, ${steady.other.slowdown_pct.toFixed(1)}% elsewhere.`),
    h('div', { class: 'n-viz' }, svg),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'faster' }), 'Downhill first 5K'), h('span', {}, h('i', { class: 'context' }), 'Other courses')),
    h('span', { class: 'n-go' }, 'Downhill starts'),
  );
}

// ---------- Next ----------
{
  const next = await N.negativeSplit();
  $('#next-card').append(
    h('div', { class: 'nc-top' }, h('span', {}, 'Next · Chapter 03'), h('span', { class: 'km-board ink' }, '10K')),
    h('p', { class: 'nc-title' }, 'The shape of ', h('em', {}, 'a race')),
    h('div', { class: 'nc-fig' }, h('span', { class: 'figure' }, next.figure), h('p', {}, 'finishes ran the second 20K faster than the first.')),
    h('span', { class: 'nc-go' }, 'Read chapter 03', h('span', { 'aria-hidden': 'true' }, '→')),
  );
}
