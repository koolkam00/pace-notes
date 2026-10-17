import { mountChrome, LAPS, U, $, $$, pct, num, fmtHM, fmtClock, approxWords, seg, feedback, setText, reduced } from './core.js';
import { loadAll, tallestTower, quarterHours, cushion, rescue, busiestMinute } from './nuggets.js';
import { h, hOf, lin, clamp, crisp, responsive, scrub, needle, ruler, vtable } from './charts.js';

mountChrome({ lap: '06' });
$('[data-rail]').innerHTML = LAPS.map(l => `<li><a href="${l.href}" ${l.n === '06' ? 'aria-current="page"' : ''}><span class="n">${l.n}</span><span>${l.title}</span></a></li>`).join('');

const [ft, kick] = await loadAll(['finish-times', 'kick']);
const cap = s => s[0].toUpperCase() + s.slice(1);

/* ---------- hero reading ---------- */
const tt = tallestTower(ft);
if (tt.guard) {
  $('[data-hero-figure]').innerHTML = `${tt.ratio.toFixed(2)}<span class="u">×</span>`;
  $('[data-hero-unit]').textContent = `the smooth curve, in the ${tt.before} minute`;
  $('[data-hero-sentence]').innerHTML = `Between ${tt.before}:00 and ${tt.before}:59, ${num(tt.count)} finishes landed: <em>${tt.ratio.toFixed(2)} times</em> what a smooth curve expects.`;
} else {
  $('[data-hero-sentence]').textContent = 'Finish times bunch just before round marks.';
}

/* ---------- 01 the towers ---------- */
const lo = 150, hi = 360;
const expected = new Map(ft.expected_curve.map(e => [e.minute, e.expected]));
const bins = ft.histogram.filter(d => d.minute >= lo && d.minute < hi).map(d => ({ m: d.minute, n: d.all, e: expected.get(d.minute) || null }));
const markMin = new Map(ft.marks.map(m => [m.minutes - 1, m]));
const busiest = busiestMinute(ft);
$('[data-towers-title]').innerHTML = `Against the curve, the tallest tower is <em>${tt.before}</em>.`;
$('[data-towers-dek]').textContent = `In raw counts the busiest minute is ${busiest.label}, where far more finishes land. Take the curve away and the minute before ${tt.mark.mark} stands tallest.`;

let lens = 'count', towersApi = null, curMin = tt.mark.minutes - 1;
// the minute before a mark uses the mark's own fitted ratio, so the page shows one number for it
const ratioOf = b => (markMin.has(b.m) ? markMin.get(b.m).ratio : b.e ? b.n / b.e : null);
const maxN = Math.max(...bins.map(b => b.n)), maxR = 1.9;
const towersHost = $('[data-towers]');
const roV = $('[data-ro-v]'), roN = $('[data-ro-n]'), roK = $('[data-ro-k]');
function paintReadout(m) {
  const b = bins.find(x => x.m === m); if (!b) return;
  const r = ratioOf(b);
  setText(roK, markMin.has(m) ? `The minute before ${markMin.get(m).mark}` : 'Minute');
  roV.innerHTML = `${fmtHM(m * 60)}<span style="font-size:.55em;color:var(--ink-3);letter-spacing:0;margin-left:.45em">${r ? r.toFixed(2) + '× the curve' : ''}</span>`;
  roV.classList.toggle('is-signal', m === tt.mark.minutes - 1);
  setText(roN, num(b.n));
}
function drawTowers(W) {
  const H = hOf(towersHost, W, 262 / 350), pl = 0, pr = 0, pt = 14, pb = 62;
  const x = lin(lo, hi, pl, W - pr), bw = (W - pl - pr) / (hi - lo), base = H - pb, ph = base - pt;
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Finishes per minute from ${fmtHM(lo * 60)} to ${fmtHM(hi * 60)}. The minute before ${tt.mark.mark} holds ${tt.ratio.toFixed(2)} times the smooth curve.` });
  // grids for both lenses (crossfaded)
  const gC = h('g', { class: 'grid lens-count' }), gR = h('g', { class: 'grid lens-ratio' });
  [10000, 20000, 30000].forEach(v => { const yy = crisp(base - v / maxN * ph); gC.append(h('line', { x1: 0, x2: W, y1: yy, y2: yy })); gC.append(h('text', { x: 0, y: yy - 5, class: 'gl' }, v.toLocaleString('en-US'))); });
  [1.25, 1.5, 0.75].forEach(v => { const yy = crisp(pt + ph * 0.72 - (v - 1) * (ph * 0.72) / 0.8); gR.append(h('line', { x1: 0, x2: W, y1: yy, y2: yy })); gR.append(h('text', { x: 0, y: yy - 5, class: 'gl' }, `${v}×`)); });
  svg.append(gC, gR);
  // columns: one rect per minute, drawn at full height and scaled (transform-only motion)
  const cols = h('g', { class: 'cols' });
  bins.forEach(b => {
    const isMark = markMin.has(b.m), isTop = b.m === tt.mark.minutes - 1;
    const r = h('rect', { x: (x(b.m) + 0.15).toFixed(2), y: pt, width: Math.max(0.7, bw - 0.3).toFixed(2), height: ph, class: 'col', 'data-m': b.m,
      fill: isTop ? 'var(--signal)' : isMark ? 'var(--ink-2)' : 'var(--fill-quiet)' });
    cols.append(r);
  });
  svg.append(cols);
  // ratio lens: columns grow up or down from the 1× line (the curve itself)
  const line = pt + ph * 0.72, kR = (line - pt) / 0.8;
  const rcols = h('g', { class: 'rcols' });
  bins.forEach(b => {
    const r = ratioOf(b); if (!r) return;
    const up = r >= 1, hgt = Math.max(0.5, Math.abs(r - 1) * kR);
    const isMark = markMin.has(b.m), isTop = b.m === tt.mark.minutes - 1;
    rcols.append(h('rect', { class: `rcol ${up ? 'up' : 'dn'}`, 'data-m': b.m, x: (x(b.m) + 0.15).toFixed(2), y: (up ? line - hgt : line).toFixed(2), width: Math.max(0.7, bw - 0.3).toFixed(2), height: hgt.toFixed(2),
      fill: isTop ? 'var(--signal)' : isMark ? 'var(--ink-2)' : 'var(--fill-quiet)' }));
  });
  svg.append(rcols);
  // the smooth curve (count lens) and the 1× line (ratio lens)
  const pts = bins.filter(b => b.e).map(b => `${(x(b.m) + bw / 2).toFixed(1)},${(base - b.e / maxN * ph).toFixed(1)}`);
  svg.append(h('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.25, 'stroke-linejoin': 'round', class: 'lens-count' }));
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(pt + ph * 0.72), y2: crisp(pt + ph * 0.72), stroke: 'var(--ink)', 'stroke-width': 1.25, class: 'lens-ratio' }));
  // baseline and ticks
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  const ax = h('g', { class: 'axis' });
  for (let m = 180; m < hi; m += 30) {
    const major = m % 60 === 0;
    ax.append(h('line', { x1: crisp(x(m)), x2: crisp(x(m)), y1: base, y2: base + (major ? 6 : 4) }));
    if (major || W > 500) ax.append(h('text', { x: x(m), y: base + 19, 'text-anchor': 'middle' }, fmtHM(m * 60)));
  }
  svg.append(ax);
  // detents (round marks) on the baseline
  ft.marks.filter(mm => mm.minutes - 1 >= lo && mm.minutes - 1 < hi).forEach(mm => svg.append(h('circle', { class: 'detent', 'data-v': mm.minutes - 1, cx: x(mm.minutes - 1) + bw / 2, cy: base, r: 1.6 })));
  // needle + crown
  const nd = needle(x(curMin) + bw / 2, pt - 6, base, base + 44);
  svg.append(nd);
  applyLens(svg, false);
  return svg;
}
function applyLens(svg, animate = true) {
  svg = svg || towersHost.querySelector('svg');
  const on = lens === 'count', tr = el => (animate && !reduced() ? `transform 620ms var(--spring-soft) ${(+el.dataset.m - lo) * 1.6}ms` : 'none');
  svg.querySelectorAll('.col').forEach(r => {
    const b = bins.find(x => x.m === +r.dataset.m);
    r.style.transition = tr(r);
    r.style.transform = `scaleY(${on ? (b.n / maxN).toFixed(4) : 0})`;
  });
  svg.querySelectorAll('.rcol').forEach(r => { r.style.transition = tr(r); r.style.transform = `scaleY(${on ? 0 : 1})`; });
  svg.querySelectorAll('.lens-count').forEach(e => e.style.opacity = lens === 'count' ? 1 : 0);
  svg.querySelectorAll('.lens-ratio').forEach(e => e.style.opacity = lens === 'ratio' ? 1 : 0);
}
let towerW = 0;
responsive(towersHost, W => { towerW = W; return drawTowers(W); }, () => { if (towersApi) { placeNeedle(curMin); } });
// the needle points at the tower instead of covering it
const placeNeedle = m => {
  const svg = towersHost.querySelector('svg'); if (!svg) return;
  const x = lin(lo, hi, 0, towerW), bw = towerW / (hi - lo), H = +svg.getAttribute('height'), pt = 14, base = H - 62, ph = base - pt;
  const b = bins.find(v => v.m === m), r = ratioOf(b) || 1;
  const top = lens === 'count' ? base - b.n / maxN * ph : pt + ph * 0.72 - Math.max(0, r - 1) * (ph * 0.72) / 0.8;
  const nd = svg.querySelector('.needle');
  nd.setAttribute('transform', `translate(${(x(m) + bw / 2).toFixed(1)},0)`);
  nd.querySelector('line').setAttribute('y2', Math.max(pt, top - 5).toFixed(1));
};
towersApi = scrub(towersHost, {
  min: lo, max: hi - 1, step: 1, bigStep: 30, value: curMin, label: 'Finishing minute',
  detents: ft.marks.map(m => m.minutes - 1), hover: true,
  pxToValue: px => Math.floor(lo + px / towerW * (hi - lo)),
  valueText: m => { const b = bins.find(x => x.m === m); return `${fmtHM(m * 60)}: ${num(b?.n || 0)} finishes`; },
  onChange: m => { curMin = m; placeNeedle(m); paintReadout(m); },
});
seg($('[data-lens]'), v => { lens = v; applyLens(); placeNeedle(curMin); $('[data-curve-key]').textContent = v === 'count' ? 'Smooth curve' : '1× line: the smooth curve'; });
vtable($('[data-towers-table]'), ['Minute before', 'Finishes', 'Curve expects', '× curve'],
  ft.marks.map(m => [m.mark, num(m.minute_before), num(m.expected_minute_before), m.ratio.toFixed(2) + '×']), 'Finishes in the minute before each round mark');

/* ---------- 02 the scoreboard ---------- */
const qh = quarterHours(ft);
$('[data-score-title]').innerHTML = qh.guard ? 'Hours and half-hours pull. <em>Quarter-hours</em> mostly don’t.' : 'Every round mark pulls a little.';
const strong = ft.marks.filter(m => m.kind !== 'quarter').sort((a, b) => b.ratio - a.ratio).slice(0, 3);
$('[data-score-dek]').textContent = `The minute before ${strong[0].mark} held ${strong[0].ratio.toFixed(2)}× the curve; before ${strong[1].mark}, ${strong[1].ratio.toFixed(2)}×; before ${strong[2].mark}, ${strong[2].ratio.toFixed(2)}×.`;
const scoreOl = $('[data-score]');
scoreOl.innerHTML = ft.marks.map(m => `<li class="${m === tt.mark ? 'is-max' : ''}"><span class="m">${m.mark}<small>${m.kind === 'half-hour' ? 'half' : m.kind}</small></span><span class="sv" data-r="${m.ratio}" data-k="${m.kind}"></span><span class="r">${m.ratio.toFixed(2)}×</span></li>`).join('');
$$('.sv', scoreOl).forEach((el, i) => responsive(el, W => {
  const m = ft.marks[i], x = lin(0.8, 1.85, 6, W - 6), y = 12;
  const svg = h('svg', { width: W, height: 24, viewBox: `0 0 ${W} 24`, 'aria-hidden': 'true' });
  svg.append(h('line', { x1: x(0.8), x2: x(1.85), y1: crisp(y), y2: crisp(y), stroke: 'var(--rule)' }));
  svg.append(h('line', { x1: crisp(x(1)), x2: crisp(x(1)), y1: 3, y2: 21, stroke: 'var(--ink-2)', 'stroke-dasharray': '2 2' }));
  svg.append(h('line', { x1: x(1), x2: x(m.ratio), y1: y, y2: y, stroke: m === tt.mark ? 'var(--signal)' : m.kind === 'quarter' ? 'var(--mark-quiet)' : 'var(--ink)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  svg.append(m.kind === 'quarter'
    ? h('circle', { cx: x(m.ratio), cy: y, r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 })
    : h('circle', { cx: x(m.ratio), cy: y, r: 5, fill: m === tt.mark ? 'var(--signal)' : 'var(--ink)', stroke: 'var(--paper)', 'stroke-width': 2 }));
  return svg;
}));

/* ---------- 03 the cushion ---------- */
const cu = cushion(ft);
$('[data-cushion-title]').innerHTML = cu.guard ? `The cushion is widest before <em>${cu.widest.mark}</em>.` : 'The pile peaks just before the line.';
let curMark = cu.rows[0].mark;
const marksSeg = $('[data-marks]');
marksSeg.innerHTML = cu.rows.map((r, i) => `<button type="button" data-v="${r.mark}" aria-pressed="${i === 0}">${r.mark}</button>`).join('');
const cushionHost = $('[data-cushion]');
let cushW = 0;
function drawCushion(W) {
  cushW = W;
  const H = hOf(cushionHost, W, 210 / 350), pt = 26, pb = 40, base = H - pb, ph = base - pt;
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Finishes in ten-second bins around the selected round mark' });
  const x = lin(-300, 300, 0, W), bw = W / 60;
  svg.append(h('g', { class: 'cols' }, cu.rows[0].bins.map((b, i) => h('rect', { class: 'col', 'data-i': i, x: (x(b.offset_s) + 0.6).toFixed(2), y: pt, width: (bw - 1.2).toFixed(2), height: ph, rx: 1, fill: 'var(--fill-quiet)' }))));
  svg.append(h('polyline', { class: 'exp', fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.25 }));
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  // the line itself
  svg.append(h('line', { x1: crisp(x(0)), x2: crisp(x(0)), y1: pt - 18, y2: base + 6, stroke: 'var(--ink)' }));
  svg.append(h('text', { class: 'mark-l', x: x(0) + 6, y: pt - 8, style: 'font:600 11px var(--mono);fill:var(--ink)' }, ''));
  const ax = h('g', { class: 'axis' });
  [-240, -120, 120, 240].forEach(s => { ax.append(h('line', { x1: crisp(x(s)), x2: crisp(x(s)), y1: base, y2: base + 4 })); ax.append(h('text', { x: x(s), y: base + 18, 'text-anchor': 'middle' }, `${s < 0 ? '−' : '+'}${Math.abs(s / 60)} min`)); });
  svg.append(ax);
  svg.append(h('g', { class: 'peak' }, [h('line', { y1: pt - 18, y2: base, stroke: 'var(--signal)', 'stroke-width': 1.5 }), h('text', { class: 'peak-l', y: pt - 8, 'text-anchor': 'end', style: 'font:600 11px var(--mono);fill:var(--accent-ink)' })]));
  return svg;
}
function paintCushion(animate) {
  const svg = cushionHost.querySelector('svg'); if (!svg) return;
  const r = cu.rows.find(x => x.mark === curMark), src = ft.seconds.find(s => s.mark === curMark);
  const W = cushW, H = +svg.getAttribute('height'), pt = 26, base = H - 40, ph = base - pt;
  const x = lin(-300, 300, 0, W), bw = W / 60;
  const max = Math.max(...r.bins.map(b => Math.max(b.n, b.expected))) * 1.05;
  svg.querySelectorAll('.col').forEach(el => {
    const b = r.bins[+el.dataset.i];
    el.style.transition = animate && !reduced() ? `transform 560ms var(--spring-soft) ${+el.dataset.i * 6}ms, fill .3s` : 'none';
    el.style.transform = `scaleY(${(b.n / max).toFixed(4)})`;
    el.setAttribute('fill', b.offset_s === src.peak_offset_s ? 'var(--signal)' : b.offset_s < 0 && b.offset_s >= -60 ? 'var(--ink-2)' : 'var(--fill-quiet)');
  });
  svg.querySelector('.exp').setAttribute('points', r.bins.map(b => `${(x(b.offset_s) + bw / 2).toFixed(1)},${(base - b.expected / max * ph).toFixed(1)}`).join(' '));
  svg.querySelector('.mark-l').textContent = `${curMark}:00`;
  const px = x(src.peak_offset_s) + bw / 2, pk = svg.querySelector('.peak');
  pk.style.transition = animate && !reduced() ? 'transform 560ms var(--spring)' : 'none';
  pk.style.transform = `translateX(${px.toFixed(1)}px)`;
  pk.querySelector('.peak-l').setAttribute('x', -6);
  pk.querySelector('.peak-l').textContent = 'PEAK';
  $('[data-cu-v]').textContent = `${Math.abs(src.peak_offset_s)} s before ${curMark}`;
  $('[data-cu-share]').textContent = pct(src.share_of_pile_in_last_minute);
}
responsive(cushionHost, drawCushion, () => paintCushion(false));
seg(marksSeg, v => { curMark = v; paintCushion(true); });

/* ---------- 04 the rescue ---------- */
const guessEl = $('[data-guess]'), range = $('[data-guess-range]'), gv = $('[data-guess-v]');
let resc = rescue(ft, 240), guess = 50, revealed = false;
const paintQ = () => { $('[data-guess-q]').textContent = `At 40K a finish is on course for 0–2 minutes over ${resc.mark}. What share of finishes like that still got under ${resc.mark}?`; };
paintQ();
const ru = $('[data-guess-ruler]');
function paintRuler() {
  const marks = [{ v: guess, kind: 'hollow', label: revealed ? `Guess ${guess}%` : '' }];
  if (revealed) marks.push({ v: resc.expected * 100, kind: 'ink', label: '' }, { v: resc.share * 100, kind: 'signal', label: pct(resc.share) });
  ruler(ru, { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: v => v + '%', marks, h: 60 });
}
range.addEventListener('input', () => { guess = +range.value; gv.textContent = guess + '%'; range.style.setProperty('--fill', guess + '%'); paintRuler(); if (revealed) paintVerdict(); });
function paintVerdict() {
  $('[data-real]').textContent = pct(resc.share);
  $('[data-real-k]').textContent = `got under ${resc.mark}, from 0–2 minutes over at 40K.`;
  $('[data-exp]').textContent = pct(resc.expected);
  const d = Math.round(guess - resc.share * 100);
  const gap = Math.round((resc.share - resc.expected) * 100);
  $('[data-verdict]').innerHTML = `${Math.abs(d) <= 3 ? 'Close: you guessed ' + guess + '%.' : `You guessed ${guess}%, ${Math.abs(d)} points ${d > 0 ? 'high' : 'low'}.`} ${resc.guard ? `Near ${resc.mark}, <em>${gap} more in every 100</em> found the line than finishes away from a round mark.` : ''}`;
}
$('[data-lock]').addEventListener('click', () => { revealed = true; guessEl.classList.add('is-revealed'); paintVerdict(); paintRuler(); });
const rm = $('[data-rescue-marks]');
rm.innerHTML = ft.bubble.map(b => `<button class="chip" type="button" aria-pressed="${b.minutes === 240}" data-m="${b.minutes}">${b.mark}</button>`).join('');
rm.addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $$('.chip', rm).forEach(x => x.setAttribute('aria-pressed', String(x === b))); resc = rescue(ft, +b.dataset.m); paintQ(); paintVerdict(); paintRuler(); });
paintRuler();
if (new URLSearchParams(location.search).has('reveal')) { guess = 55; range.value = 55; gv.textContent = '55%'; $('[data-lock]').click(); }

/* ---------- 05 your minute ---------- */
const lkHost = $('[data-lookup]'), inp = $('#my-finish-time');
let lkW = 0, lkMin = busiest.minute;
responsive(lkHost, W => {
  lkW = W; const H = hOf(lkHost, W, 120 / 350), base = H - 22, ph = base - 8;
  const x = lin(lo, hi, 0, W), bw = W / (hi - lo);
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  bins.forEach(b => svg.append(h('rect', { x: x(b.m), y: base - b.n / maxN * ph, width: Math.max(0.7, bw - 0.3), height: b.n / maxN * ph, fill: 'var(--fill-quiet)', 'data-m': b.m })));
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  [180, 240, 300].forEach(m => svg.append(h('text', { x: x(m), y: H - 6, 'text-anchor': 'middle', style: 'font:500 10.5px var(--mono);fill:var(--ink-3)' }, fmtHM(m * 60))));
  svg.append(h('g', { class: 'lk-n' }, [h('line', { y1: 0, y2: base, stroke: 'var(--signal)', 'stroke-width': 1.5 }), h('circle', { cy: base, r: 4.5, fill: 'var(--signal)', stroke: 'var(--paper)', 'stroke-width': 2 })]));
  return svg;
}, () => paintLookup(false));
function paintLookup(animate = true) {
  const svg = lkHost.querySelector('svg'); if (!svg) return;
  const x = lin(lo, hi, 0, lkW), bw = lkW / (hi - lo), m = clamp(lkMin, lo, hi - 1);
  const g = svg.querySelector('.lk-n'); g.style.transition = animate && !reduced() ? 'transform 520ms var(--spring)' : 'none';
  g.style.transform = `translateX(${(x(m) + bw / 2).toFixed(1)}px)`;
  svg.querySelectorAll('rect').forEach(r => r.setAttribute('fill', +r.dataset.m === m ? 'var(--signal)' : 'var(--fill-quiet)'));
  const b = ft.histogram.find(d => d.minute === lkMin), e = expected.get(lkMin);
  $('[data-lk-v]').innerHTML = b ? `${fmtHM(lkMin * 60)}<span style="font-size:.55em;color:var(--ink-3);letter-spacing:0;margin-left:.45em">${num(b.all)} finishes</span>` : 'Outside 2:00–7:00';
  $('[data-lk-r]').textContent = b && e ? (b.all / e).toFixed(2) + '×' : '—';
}
inp.addEventListener('input', e => {
  if (matchMedia('(pointer: coarse)').matches && e.inputType === 'insertText' && (e.data === '.' || e.data === ',')) { const p = inp.selectionStart; inp.value = inp.value.slice(0, p - 1) + ':' + inp.value.slice(p); inp.setSelectionRange(p, p); }
  const parts = inp.value.split(':').map(Number);
  if (parts.length >= 2 && parts.every(v => Number.isFinite(v))) {
    const s = parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    if (s > 3600) { lkMin = Math.floor(s / 60); $('[data-lk-k]').textContent = 'Your minute'; paintLookup(); return; }
  }
  lkMin = busiest.minute; $('[data-lk-k]').textContent = 'The busiest minute'; paintLookup();
});

/* ---------- next ---------- */
const kw = approxWords(kick.kick.share);
$('[data-next-title]').innerHTML = `${cap(kw.q)} <em>${kw.bare}</em> finishes sped up for the line.`;
$('[data-next-figure]').innerHTML = `${Math.round(kick.kick.share * 100)}<span class="u">%</span>`;
const nu = () => { $('[data-next-unit]').textContent = `ran the final ${U.dist(2.195)} faster than 35–40K`; }; nu(); U.on(nu);
feedback($('[data-feedback]'));
