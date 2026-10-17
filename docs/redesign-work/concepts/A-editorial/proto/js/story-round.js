import { $, $$, h, s, initHeader, initMenu, initReveals, scrolly, hm, clock, int, pct, inWords, keypad, parseTime, reduced, tween, scale, onResize, whenVisible } from './core.js';
import { N, data, buildRoute, argmax } from './nuggets.js';
import { runnerLane } from './runner.js';

initHeader({ chapter: '06 · The finish line', title: 'The 3:59 effect', minutes: 6, steps: $$('[data-track-section^="chapter-"]') });
initMenu((list) => buildRoute(list, { current: 6, compact: true }));
initReveals();
keypad($('#my-finish'));
runnerLane($('#opener-lane'), [
  { finishMinutes: 179, label: '2:59' }, { finishMinutes: 209, label: '3:29' }, { finishMinutes: 239, label: '3:59' }, { finishMinutes: 269, label: '4:29' },
], { height: 104 });

const ft = await data.finish();
const hist = ft.histogram;
const total = hist.reduce((a, b) => a + b.all, 0);
const expected = new Map(ft.expected_curve.map((e) => [e.minute, e.expected]));
const busiest = await N.busiestMinute();
const tallest = await N.tallestTower();
const median = await N.median();
const fill = (k, v) => $$(`[data-n="${k}"]`).forEach((el) => { el.textContent = v; });
fill('total', `${(total / 1e6).toFixed(1)} million finishes`);
fill('total-short', `${(total / 1e6).toFixed(1)} million`);
fill('median', median.figure);
fill('busiest', busiest.figure);
fill('busiest-n', int(busiest.n));
fill('tower', hm(tallest.minute));
fill('tower-ratio', `${tallest.ratio.toFixed(2)}×`);
const byMinute = new Map(hist.map((b) => [b.minute, b]));
// One expected count per minute: the published mark figure where there is one, so every sentence on the page agrees.
const markExpected = new Map(ft.marks.map((m) => [m.minutes - 1, m.expected_minute_before]));
const expectedAt = (m) => markExpected.get(m) ?? expected.get(m);
const minuteLabel = (m) => hm(m);

// Nice y ticks.
function ticks(max, n = 3) {
  const raw = max / n; const mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw);
  const out = []; for (let v = step; v <= max * 1.001; v += step) out.push(v); return out;
}

// ---------- 01 Guess the busiest minute ----------
{
  const answer = busiest.minute;
  const options = [answer - 31, answer, answer + 1, answer + 2, median.minute].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const chips = $('#minute-chips');
  options.forEach((m) => chips.append(h('button', { type: 'button', class: 'chip mono', 'aria-pressed': 'false', 'data-m': m }, minuteLabel(m))));
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const pick = Number(b.dataset.m);
    $$('button', chips).forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.disabled = true; });
    $('#guess-minute').classList.add('is-revealed');
    $('#minute-verdict').textContent = pick === answer ? 'Spot on' : `You picked ${minuteLabel(pick)}`;
    $('#minute-claim').replaceChildren(h('em', {}, minuteLabel(answer)), answer === 239 ? '. The minute before 4:00.' : `. Not 3:59: a full minute before 4:00.`);
    $('#minute-more').textContent = `${int(busiest.n)} finishes landed between ${clock(answer * 60)} and ${clock(answer * 60 + 59)}${busiest.alike ? ', the busiest minute for recorded women and for men' : ''}. Scroll on to see why the clock bends the curve.`;
    miniColumns($('#minute-chart'), answer - 12, answer + 8, { ink: answer, you: pick !== answer ? pick : null });
  });
}

function miniColumns(host, lo, hi, { ink = null, you = null } = {}) {
  host.replaceChildren();
  const rows = hist.filter((b) => b.minute >= lo && b.minute <= hi);
  const W = host.clientWidth || 340; const H = 120; const top = 26; const bottom = 20;
  const max = Math.max(...rows.map((b) => b.all));
  const X = scale(lo, hi + 1, 0, W); const Y = scale(0, max, H - bottom, top);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  rows.forEach((b) => {
    const x = X(b.minute); const w = X(b.minute + 1) - x - 2;
    const cls = b.minute === ink ? 'mark-ink' : b.minute === you ? 'mark-you' : 'mark-context';
    const r = s('rect', { x: x + 1, y: Y(b.all), width: Math.max(1, w), height: H - bottom - Y(b.all), rx: 2, class: `${cls} grow-y`, opacity: cls === 'mark-context' ? 0.55 : 1 });
    svg.append(r);
  });
  // Labels: the answer sits on its bar; the reader's pick is lifted a line higher and pushed away from it.
  const inkB = rows.find((b) => b.minute === ink); const youB = rows.find((b) => b.minute === you);
  const top2 = Math.min(inkB ? Y(inkB.all) : H, youB ? Y(youB.all) : H);
  if (inkB) svg.append(s('text', { x: X(ink + 0.5), y: Y(inkB.all) - 7, 'text-anchor': youB ? (you > ink ? 'end' : 'start') : 'middle', class: 'ax-tick strong' }, hm(ink)));
  if (youB) svg.append(s('text', { x: X(you + 0.5), y: Math.max(11, top2 - 22), 'text-anchor': you > ink ? 'start' : 'end', class: 'ax-tick strong lab-you' }, `Your pick · ${hm(you)}`));
  svg.append(s('line', { x1: 0, x2: W, y1: H - bottom, y2: H - bottom, class: 'ax-base' }));
  for (let m = Math.ceil(lo / 5) * 5; m <= hi; m += 5) svg.append(s('text', { x: X(m + 0.5), y: H - 4, 'text-anchor': 'middle', class: 'ax-tick' }, hm(m)));
  host.append(svg);
  requestAnimationFrame(() => $$('.grow-y', svg).forEach((r, i) => setTimeout(() => r.classList.add('is-on'), reduced() ? 0 : i * 18)));
}

// ---------- 02 The towers (sticky scrolly) ----------
const towers = (() => {
  const host = $('#towers-chart');
  const towerMinutes = new Set(ft.marks.filter((m) => m.kind !== 'quarter').map((m) => m.minutes - 1));
  const svg = s('svg', {}); host.append(svg);
  const gGrid = s('g'); const gBars = s('g'); const gCurve = s('g'); const gAnn = s('g');
  svg.append(gGrid, gBars, gCurve, gAnn);
  const bars = hist.map((b) => { const r = s('rect', { class: 'mark-context', rx: 1 }); gBars.append(r); return { b, r }; });
  const curve = s('path', { class: 'line stroke-ink', style: 'stroke-width:2; stroke: var(--fg-2)' }); gCurve.append(curve);
  const full = { lo: 128, hi: 400, ymax: Math.max(...hist.map((b) => b.all)) * 1.08 };
  const zoomLo = tallest.minute - 14; const zoomHi = tallest.minute + 16;
  const zoom = { lo: zoomLo, hi: zoomHi, ymax: Math.max(...hist.filter((b) => b.minute >= zoomLo && b.minute <= zoomHi).map((b) => b.all)) * 1.18 };
  let view = { ...full }; let step = -1; let W = 0; let H = 0; let grown = false;

  function layout() {
    W = host.clientWidth; H = host.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    const top = 30; const bottom = 26;
    const X = scale(view.lo, view.hi + 1, 0, W); const Y = scale(0, view.ymax, H - bottom, top);
    gGrid.replaceChildren();
    ticks(view.ymax * 0.92, 3).forEach((v) => { gGrid.append(s('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: 'ax-grid' }), s('text', { x: 0, y: Y(v) - 6, class: 'ax-tick' }, int(v))); });
    gGrid.append(s('line', { x1: 0, x2: W, y1: H - bottom, y2: H - bottom, class: 'ax-base' }));
    const span = view.hi - view.lo; const every = span > 120 ? 60 : span > 50 ? 30 : 5;
    for (let m = Math.ceil(view.lo / every) * every; m <= view.hi; m += every) {
      const xm = X(m); const anchor = xm < 18 ? 'start' : xm > W - 18 ? 'end' : 'middle';
      if (xm < 4 || xm > W - 4) continue;
      gGrid.append(s('text', { x: xm, y: H - 6, 'text-anchor': anchor, class: 'ax-tick' }, hm(m)), s('line', { x1: xm, x2: xm, y1: H - bottom, y2: H - bottom + 4, class: 'ax-base' }));
    }
    const bw = X(1) - X(0); const gap = bw > 5 ? 2 : bw > 2.4 ? 0.8 : 0;
    for (const { b, r } of bars) {
      const x = X(b.minute);
      if (b.minute < view.lo - 1 || b.minute > view.hi + 1) { r.setAttribute('width', 0); continue; }
      r.setAttribute('x', (x + gap / 2).toFixed(2)); r.setAttribute('width', Math.max(0.6, bw - gap).toFixed(2));
      r.setAttribute('y', Y(b.all).toFixed(2)); r.setAttribute('height', Math.max(0, H - bottom - Y(b.all)).toFixed(2));
    }
    const pts = ft.expected_curve.filter((e) => e.minute >= view.lo && e.minute <= view.hi).map((e) => `${X(e.minute + 0.5).toFixed(1)},${Y(e.expected).toFixed(1)}`);
    curve.setAttribute('d', `M${pts.join('L')}`);
    annotate(X, Y, top, bottom);
  }
  function annotate(X, Y, top, bottom) {
    gAnn.replaceChildren();
    if (step === 0) {
      const x = X(median.minute);
      gAnn.append(s('line', { x1: x, x2: x, y1: top + 6, y2: H - bottom, class: 'leader' }), s('text', { x: x + 6, y: top + 16, class: 'lab lab-halo' }, `Half finished after ${median.figure}`));
    }
    if (step === 2) {
      for (const m of towerMinutes) {
        if (m < view.lo || m > view.hi) continue;
        const b = byMinute.get(m); if (!b) continue;
        gAnn.append(s('text', { x: X(m + 0.5), y: Y(b.all) - 8, 'text-anchor': 'middle', class: 'ax-tick strong lab-halo' }, hm(m)));
      }
    }
    if (step === 3) {
      const b = byMinute.get(busiest.minute); const x = X(busiest.minute + 0.5); const y = Y(b.all);
      const tx = Math.min(W - 150, x + 14);
      gAnn.append(s('path', { d: `M${x} ${y - 4}L${x + 8} ${y - 20}L${tx + 2} ${y - 20}`, class: 'leader' }), s('text', { x: tx + 6, y: y - 34, class: 'lab-fig' }, busiest.figure), s('text', { x: tx + 6, y: y - 16, class: 'lab-2' }, `${int(b.all)} finishes`));
    }
    if (step === 4) {
      const b = byMinute.get(tallest.minute); const e = tallest.expected;
      const x = X(tallest.minute + 0.5); const y = Y(b.all); const ye = Y(e);
      const left = x > W * 0.55;
      const tx = left ? x - 16 : x + 16; const anchor = left ? 'end' : 'start';
      gAnn.append(
        s('line', { x1: x - 14, x2: x + 14, y1: ye, y2: ye, class: 'leader', style: 'stroke-width:1.5' }),
        s('text', { x: tx, y: y - 4, 'text-anchor': anchor, class: 'lab-fig' }, `${tallest.ratio.toFixed(2)}×`),
        s('text', { x: tx, y: y + 14, 'text-anchor': anchor, class: 'lab-2 lab-halo' }, `${hm(tallest.minute)}: ${int(b.all)} finishes`),
        s('text', { x: tx, y: ye + 18, 'text-anchor': anchor, class: 'lab-2 lab-halo' }, `the curve expects ${int(e)}`),
      );
    }
  }
  function paint() {
    for (const { b, r } of bars) {
      let cls = 'mark-context'; let op = 0.8;
      if (step >= 2 && step < 4) { op = towerMinutes.has(b.minute) ? 1 : 0.42; cls = towerMinutes.has(b.minute) ? 'mark-ink' : 'mark-context'; }
      if (step === 3) { cls = b.minute === busiest.minute ? 'mark-ink' : 'mark-context'; op = b.minute === busiest.minute ? 1 : towerMinutes.has(b.minute) ? 0.9 : 0.42; }
      if (step === 4) { cls = b.minute === tallest.minute ? 'mark-ink' : 'mark-context'; op = b.minute === tallest.minute ? 1 : 0.6; }
      r.setAttribute('class', cls); r.setAttribute('opacity', op);
    }
    curve.style.opacity = step >= 1 ? '1' : '0';
    $('#towers-step').textContent = step === 4 ? `Zoom: ${hm(zoom.lo)}–${hm(zoom.hi)}` : '';
  }
  function go(i) {
    const prev = step; step = i;
    const target = i === 4 ? zoom : full;
    paint();
    if (i === 1 && prev < 1 && !reduced()) {
      const len = curve.getTotalLength ? curve.getTotalLength() : 2000;
      curve.style.transition = 'none'; curve.style.strokeDasharray = `${len}`; curve.style.strokeDashoffset = `${len}`;
      requestAnimationFrame(() => { curve.style.transition = 'stroke-dashoffset 1100ms cubic-bezier(.2,.7,.2,1)'; curve.style.strokeDashoffset = '0'; });
    }
    if (target.lo !== view.lo || target.hi !== view.hi) {
      const from = { ...view };
      tween(0, 1, 800, (k) => { view = { lo: from.lo + (target.lo - from.lo) * k, hi: from.hi + (target.hi - from.hi) * k, ymax: from.ymax + (target.ymax - from.ymax) * k }; layout(); });
    } else layout();
  }
  onResize(host, () => layout());
  // Columns rise once, left to right, the first time the graphic is on screen.
  whenVisible(host, () => {
    if (grown || reduced()) return; grown = true;
    bars.forEach(({ r }) => { r.style.transformBox = 'fill-box'; r.style.transformOrigin = '50% 100%'; r.style.transform = 'scaleY(0)'; });
    requestAnimationFrame(() => bars.forEach(({ r }, i) => { r.style.transition = `transform 700ms cubic-bezier(.16,1,.3,1) ${Math.min(900, i * 3)}ms`; r.style.transform = 'scaleY(1)'; }));
  }, { ratio: 0.2 });
  return { go };
})();
scrolly($('#towers-scrolly'), (i) => towers.go(i));

// ---------- 03 Scoreboard ----------
{
  const marks = [...ft.marks].sort((a, b) => b.ratio - a.ratio);
  const quarters = ft.marks.filter((m) => m.kind === 'quarter');
  const mostlyDont = quarters.filter((m) => m.ratio < 1.05).length > quarters.length / 2;
  if (!mostlyDont) $('#score-title').replaceChildren('Hours and half-hours pull ', h('em', {}, 'hardest.'));
  const host = $('#score-chart');
  const readout = $('#score-readout');
  const show = (m) => readout.replaceChildren(h('span', { class: 'figure' }, `${m.ratio.toFixed(2)}×`), h('p', {}, h('strong', {}, `${hm(m.minutes - 1)}:00 to ${hm(m.minutes - 1)}:59.`), ` ${int(m.minute_before)} finishes, where the curve expects ${int(m.expected_minute_before)}.`));
  let sel = marks[0];
  const draw = () => {
    host.replaceChildren();
    const W = host.clientWidth; const rowH = 34; const left = 52; const right = 58; const top = 22;
    const H = top + marks.length * rowH + 4;
    const X = scale(0.8, Math.max(1.8, marks[0].ratio + 0.05), left, W - right);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Finishes in the minute before each round time, against the smooth curve. The tallest is ${hm(marks[0].minutes - 1)} at ${marks[0].ratio.toFixed(2)} times.` });
    [0.8, 1, 1.2, 1.4, 1.6, 1.8].forEach((v) => svg.append(s('line', { x1: X(v), x2: X(v), y1: top - 4, y2: H, class: v === 1 ? 'leader' : 'ax-grid', style: v === 1 ? 'stroke: var(--fg-3); stroke-width:1.5' : '' }), s('text', { x: X(v), y: 11, 'text-anchor': 'middle', class: 'ax-tick' }, `${v}×`)));
    marks.forEach((m, i) => {
      const y = top + i * rowH + rowH / 2;
      const strong = m.kind !== 'quarter';
      const g = s('g', { class: 'score-row', tabindex: 0, role: 'button', 'aria-label': `${hm(m.minutes - 1)}: ${m.ratio.toFixed(2)} times the curve` });
      if (m === sel) g.append(s('rect', { x: 0, y: y - rowH / 2 + 2, width: W, height: rowH - 4, rx: 8, fill: 'var(--paper-2)' }));
      g.append(
        s('text', { x: 0, y: y + 5, class: `ax-tick${strong ? ' strong' : ''}`, style: 'font-size:14px' }, hm(m.minutes - 1)),
        s('line', { x1: X(1), x2: X(m.ratio), y1: y, y2: y, class: strong ? 'stroke-ink' : 'stroke-context', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
        s('circle', { cx: X(m.ratio), cy: y, r: 6.5, class: `${strong ? 'mark-ink' : 'mark-context'} ring` }),
        s('text', { x: m.ratio >= 1 ? X(m.ratio) + 12 : X(1) + 10, y: y + 4.5, class: 'lab-2', style: 'font-weight:600' }, `${m.ratio.toFixed(2)}×`),
        s('rect', { x: 0, y: y - rowH / 2, width: W, height: rowH, class: 'hit' }),
      );
      const pick = () => { sel = m; show(m); draw(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.append(g);
    });
    host.append(svg);
  };
  show(sel); onResize(host, draw);
  $('#score-table').append(h('thead', {}, h('tr', {}, h('th', {}, 'Minute'), h('th', {}, 'Finishes'), h('th', {}, 'Curve'), h('th', {}, 'Ratio'))), h('tbody', {}, ...marks.map((m) => h('tr', {}, h('td', {}, hm(m.minutes - 1)), h('td', {}, int(m.minute_before)), h('td', {}, int(m.expected_minute_before)), h('td', {}, `${m.ratio.toFixed(2)}×`)))));
}

// ---------- 04 Cushion: ten-second bins before each mark ----------
{
  const lens = ft.seconds;
  const far = argmax(lens, (l) => -l.peak_offset_s);
  const near = argmax(lens, (l) => l.peak_offset_s);
  const words = (sec) => (sec >= 100 ? 'almost two minutes' : sec >= 85 ? 'a minute and a half' : sec >= 55 ? 'about a minute' : `${sec} seconds`);
  $('#cushion-title').replaceChildren(`Before ${far.mark}, the pile peaks `, h('em', {}, words(-far.peak_offset_s)), ` early. Before ${near.mark}, ${-near.peak_offset_s} seconds.`);
  const chips = $('#cushion-chips'); const host = $('#cushion-chart'); const readout = $('#cushion-readout');
  let cur = lens.find((l) => l.mark === '4:00') || lens[0];
  lens.forEach((l) => chips.append(h('button', { type: 'button', class: 'chip mono', 'aria-pressed': String(l === cur) }, l.mark)));
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cur = lens.find((l) => l.mark === b.textContent); $$('button', chips).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  const draw = () => {
    host.replaceChildren();
    const bins = cur.bins.filter((b) => b.offset_s >= -300 && b.offset_s < 60);
    const W = host.clientWidth; const H = 230; const top = 34; const bottom = 26;
    const max = Math.max(...bins.map((b) => Math.max(b.n, b.expected))) * 1.08;
    const X = scale(-300, 60, 0, W); const Y = scale(0, max, H - bottom, top);
    const peak = bins.find((b) => b.offset_s === cur.peak_offset_s);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Finishes per ten seconds before ${cur.mark}. The busiest ten seconds started ${-cur.peak_offset_s} seconds before.` });
    const yt = ticks(max * 0.9, 3);
    yt.forEach((v) => svg.append(s('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: 'ax-grid' })));
    const bw = X(10) - X(0);
    bins.forEach((b) => {
      const after = b.offset_s >= 0; const isPeak = b === peak;
      svg.append(s('rect', { x: X(b.offset_s) + 1, y: Y(b.n), width: Math.max(1, bw - 2), height: H - bottom - Y(b.n), rx: 2, class: isPeak ? 'mark-ink' : 'mark-context', opacity: after ? 0.35 : isPeak ? 1 : 0.85 }));
    });
    const pts = bins.map((b) => `${X(b.offset_s + 5).toFixed(1)},${Y(b.expected).toFixed(1)}`);
    svg.append(s('path', { d: `M${pts.join('L')}`, class: 'line', style: 'stroke: var(--fg-2); stroke-width:2' }));
    const x0 = X(0);
    svg.append(s('line', { x1: x0, x2: x0, y1: top - 10, y2: H - bottom, class: 'leader', style: 'stroke-width:1.5' }), s('text', { x: x0 - 6, y: top - 14, 'text-anchor': 'end', class: 'ax-tick strong' }, `${cur.mark}:00`));
    const px = X(cur.peak_offset_s + 5); const py = Y(peak.n);
    svg.append(s('circle', { cx: px, cy: py - 9, r: 3, class: 'mark-ink' }));
    yt.forEach((v) => svg.append(s('text', { x: 2, y: Y(v) - 6, class: 'ax-tick lab-halo', style: 'stroke: var(--card)' }, int(v))));
    svg.append(s('line', { x1: 0, x2: W, y1: H - bottom, y2: H - bottom, class: 'ax-base' }));
    const mins = cur.minutes;
    for (let o = -300; o <= 60; o += 60) svg.append(s('text', { x: X(o), y: H - 6, 'text-anchor': o === -300 ? 'start' : o === 60 ? 'end' : 'middle', class: 'ax-tick' }, hm(mins + o / 60)));
    host.append(svg);
    readout.replaceChildren(h('span', { class: 'figure' }, `${-cur.peak_offset_s} s`), h('p', {}, h('strong', {}, `before ${cur.mark}.`), ` The busiest ten seconds before ${cur.mark} began at ${clock(mins * 60 + cur.peak_offset_s)}, ${cur.peak_ratio.toFixed(2)}× the curve.`));
  };
  onResize(host, draw);
}

// ---------- 05 Rescue: guess first ----------
{
  const bubbles = ft.bubble;
  let cur = bubbles.find((b) => b.mark === '4:00') || bubbles[0];
  $('#rescue-q').replaceChildren(`At 40K, a finish is headed for up to 2 minutes over `, h('em', {}, cur.mark), `. Out of 100 like it, how many still get under?`);
  const grid = $('#rescue-dots');
  const dots = Array.from({ length: 100 }, (_, i) => { const d = document.createElement('i'); d.style.setProperty('--i', String((i % 10) + Math.floor(i / 10))); return d; });
  grid.append(...dots);
  const range = $('#rescue-range'); const out = $('#rescue-guess');
  const paintGuess = () => { const g = Number(range.value); out.textContent = String(g); range.style.setProperty('--v', String(g / 100)); dots.forEach((d, i) => d.classList.toggle('g-ring', i < g)); };
  range.addEventListener('input', paintGuess); paintGuess();
  const paintAnswer = (b) => {
    const obs = Math.round(b.over.share_under * 100); const exp = Math.round(b.over.expected_share_under * 100);
    dots.forEach((d, i) => { d.classList.toggle('lit-mid', i < exp); d.classList.toggle('lit-ink', i >= exp && i < obs); });
    $('#rescue-claim').replaceChildren(h('em', {}, `${obs} in 100`), ` got under ${b.mark}. Away from a round mark, comparable finishes: ${exp}.`);
    $('#rescue-l2').textContent = `${obs - exp} more near ${b.mark}`;
    $('#rescue-more').textContent = `In the last 2.2K they ran a median ${Math.round(b.over.median_final_gain_s)} s faster than their 35–40K pace, against ${Math.round(b.over.expected_median_final_gain_s)} s for the comparable finishes.`;
  };
  const chips = $('#rescue-chips');
  bubbles.forEach((b) => chips.append(h('button', { type: 'button', class: 'chip mono', 'aria-pressed': String(b === cur) }, b.mark)));
  chips.addEventListener('click', (e) => { const btn = e.target.closest('button'); if (!btn) return; cur = bubbles.find((b) => b.mark === btn.textContent); $$('button', chips).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); paintAnswer(cur); });
  $('#rescue-reveal').addEventListener('click', () => {
    const g = Number(range.value); const obs = Math.round(cur.over.share_under * 100);
    $('#guess-rescue').classList.add('is-revealed'); range.disabled = true;
    $('#rescue-verdict').textContent = Math.abs(g - obs) <= 4 ? 'Spot on' : g > obs ? `You guessed ${g}. Fewer made it.` : `You guessed ${g}. More made it.`;
    paintAnswer(cur);
  });
}

// ---------- 06 Your minute (a plain calculation from the reader's input: no badge) ----------
{
  const form = $('#my-finish-form'); const input = $('#my-finish'); const readout = $('#mine-readout'); const host = $('#mine-chart');
  const show = () => {
    const sec = parseTime(input.value);
    const m = sec === null ? null : Math.floor(sec / 60);
    if (m === null || !byMinute.has(m)) { readout.replaceChildren(h('p', {}, `Type a finish time between ${hm(hist[0].minute)} and ${hm(hist[hist.length - 1].minute)}, like 3:59:12.`)); host.replaceChildren(); return; }
    const b = byMinute.get(m); const e = expectedAt(m);
    const earlier = hist.filter((x) => x.minute < m).reduce((a, x) => a + x.all, 0) / total;
    readout.replaceChildren(h('span', { class: 'figure is-you' }, int(b.all)), h('p', {}, h('strong', {}, `finishes in your minute, ${hm(m)}.`), e ? ` The smooth curve expects ${int(e)} (${(b.all / e).toFixed(2)}×).` : '', ` ${pct(earlier)} of finishes came in an earlier minute.`));
    const lo = Math.max(hist[0].minute, m - 40); const hi = Math.min(hist[hist.length - 1].minute, m + 40);
    host.replaceChildren();
    const W = host.clientWidth; const H = 130; const top = 26; const bottom = 22;
    const rows = hist.filter((x) => x.minute >= lo && x.minute <= hi);
    const max = Math.max(...rows.map((x) => x.all)) * 1.05;
    const X = scale(lo, hi + 1, 0, W); const Y = scale(0, max, H - bottom, top);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    rows.forEach((x) => svg.append(s('rect', { x: X(x.minute) + 0.4, y: Y(x.all), width: Math.max(0.8, X(1) - X(0) - 0.8), height: H - bottom - Y(x.all), class: x.minute === m ? 'mark-you' : 'mark-context', opacity: x.minute === m ? 1 : 0.6 })));
    const xm = X(m + 0.5);
    svg.append(s('text', { x: Math.min(W - 30, Math.max(30, xm)), y: Math.max(14, Y(b.all) - 8), 'text-anchor': 'middle', class: 'ax-tick strong lab-you lab-halo' }, `You · ${hm(m)}`));
    svg.append(s('line', { x1: 0, x2: W, y1: H - bottom, y2: H - bottom, class: 'ax-base' }));
    for (let t = Math.ceil(lo / 30) * 30; t <= hi; t += 30) svg.append(s('text', { x: X(t), y: H - 5, 'text-anchor': 'middle', class: 'ax-tick' }, hm(t)));
    host.append(svg);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); show(); });
  onResize(host, show);
}

// ---------- Takeaways and next chapter ----------
{
  const r = ft.bubble.find((b) => b.mark === '4:00') || ft.bubble[0];
  const card = (fig, small, claim, ctx) => h('div', { class: 'nugget reveal' }, h('div', { class: 'n-fig' }, h('span', { class: 'figure' }, fig), h('small', {}, small)), h('p', { class: 'n-claim' }, ...claim), h('p', { class: 'n-context' }, ctx));
  $('#takeaways').append(
    card(busiest.figure, 'busiest minute', ['The busiest finishing minute is a ', h('em', {}, 'full minute'), ' before 4:00.'], `${int(busiest.n)} finishes landed in it.`),
    card(`${tallest.ratio.toFixed(2)}×`, `at ${hm(tallest.minute)}`, ['Against the curve, the minute before ', h('em', {}, tallest.mark), ' stands tallest.'], `${int(tallest.n)} finishes where a smooth curve expects ${int(tallest.expected)}.`),
    card(`${Math.round(r.over.share_under * 100)}`, 'in 100', ['Near ', h('em', {}, r.mark), ' at 40K, more finishes got under than elsewhere.'], `Comparable finishes away from a round mark: ${Math.round(r.over.expected_share_under * 100)} in 100.`),
  );
  initReveals();
  const next = await N.genderSlowdown();
  $('#next-card').append(
    h('div', { class: 'nc-top' }, h('span', {}, 'Next · Chapter 07'), h('span', { class: 'km-board ink' }, '07')),
    h('p', { class: 'nc-title' }, 'Who holds ', h('em', {}, 'pace')),
    h('div', { class: 'nc-fig' }, h('span', { class: 'figure' }, next.figure), h('p', {}, 'as many sustained slowdowns among recorded men’s finishes as women’s, at the same finish times.')),
    h('span', { class: 'nc-go' }, 'Read chapter 07', h('span', { 'aria-hidden': 'true' }, '→')),
  );
}
