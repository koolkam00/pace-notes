import { mountChrome, LAPS, $, $$, pct, num, fmtMS, approxWords, feedback, setText, reduced, detentTick } from './core.js';
import { loadAll, bank, bankBest, onsetEarly, negativeSplit, fmtGap } from './nuggets.js';
import { h, hOf, lin, clamp, crisp, responsive, scrub, needle, ruler, vtable } from './charts.js';

mountChrome({ lap: '02' });
$('[data-rail]').innerHTML = LAPS.map(l => `<li><a href="${l.href}" ${l.n === '02' ? 'aria-current="page"' : ''}><span class="n">${l.n}</span><span>${l.title}</span></a></li>`).join('');

const [kick, fs, pat] = await loadAll(['kick', 'fast-start', 'pacing-shapes-patterns']);
const cap = s => s[0].toUpperCase() + s.slice(1);
const gapWords = s => `${fmtMS(s)}`;

/* ---------- hero: the reading ---------- */
const bk = bank(kick);
if (bk.guard) {
  $('[data-h1]').innerHTML = `A fast first 5K banked ${gapWords(bk.open)}, and finished <em>${gapWords(bk.finish)} behind</em>.`;
} else {
  $('[data-h1]').textContent = 'How the first 5K related to the finish.';
}
$('[data-question]').textContent = 'Measured against finishes from the same race that ran the same pace from 5K to 20K.';
$('[data-ledger]').innerHTML = [
  ['Banked by 5K', 'ahead of the same pace', bk.open, ''],
  ['Given back after 20K', 'behind the same pace', bk.after20, ''],
  ['At the finish', 'behind the same pace', bk.finish, 'total'],
].map(([k, s, v, c]) => `<div class="ledger-row ${c}"><span class="k">${k}<small>${s}</small></span><span class="v">${fmtGap(v)}</span></div>`).join('');
$('[data-matched]').innerHTML = `<em>${pct(bk.slowdown)}</em> of them had a <a class="term" href="#methodology-sustained-slowdown">sustained slowdown</a>. For their race and pace, ${pct(bk.expected)} would be typical.`;
ruler($('[data-matched-scale]'), { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: v => v + '%', marks: [
  { v: bk.expected * 100, kind: 'hollow', label: 'typical' }, { v: bk.slowdown * 100, kind: 'signal', label: pct(bk.slowdown) }] });

/* ---------- 01 the curve ---------- */
const curve = kick.bank.curve, best = bankBest(kick);
const loMin = curve[0].lo, loMax = curve[curve.length - 1].lo;
$('[data-curve-title]').innerHTML = best.guard
  ? `The best average finish came from a first 5K <em>${best.lo}–${best.lo + 1}% slower</em> than what followed.`
  : `The best average finish came from a first 5K near the pace that followed.`;
let cur = curve.find(c => c.lo === -10) ? -10 : loMin, cW = 0;
const yMin = Math.min(...curve.map(c => c.finish_s)), yMax = Math.max(...curve.map(c => c.finish_s));
const y0 = Math.floor((yMin - 30) / 60) * 60, y1 = Math.ceil((yMax + 30) / 60) * 60;
const host = $('[data-curve]');
const openWords = lo => lo === 0 ? 'Even' : lo < 0 ? `${-lo}–${-lo + 1}% fast`.replace(/^12–13% fast$/, '12%+ fast') : `${lo}–${lo + 1}% slow`.replace(/^12–13% slow$/, '12%+ slow');
// curve bins are [lo, lo + 1) percent; negative is a faster first 5K; the end bins are open
const openLabel = lo => lo <= loMin ? `${Math.abs(loMin + 1)}%+ faster` : lo >= loMax ? `${loMax}%+ slower`
  : lo < 0 ? `${Math.abs(lo + 1)}–${Math.abs(lo)}% faster` : `${lo}–${lo + 1}% slower`;
function geom(W) {
  const H = hOf(host, W, 300 / 350), pt = 26, pb = 74, base = H - pb;
  return { H, pt, base, x: lin(loMin, loMax, 14, W - 14), y: lin(y0, y1, base, pt) };
}
function drawCurve(W) {
  cW = W; const g = geom(W), { H, pt, base, x, y } = g;
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Finish against same-pace finishes by first 5K. Lowest at ${openLabel(best.lo)}.` });
  // y grid at whole minutes
  // y grid every two minutes, labelled at the right where the curve sits near zero
  const grid = h('g', { class: 'grid' });
  for (let v = Math.ceil(y0 / 120) * 120; v <= y1; v += 120) {
    if (v === 0) continue;
    grid.append(h('line', { x1: 0, x2: W, y1: crisp(y(v)), y2: crisp(y(v)) }));
    grid.append(h('text', { x: W, y: y(v) - 5, 'text-anchor': 'end', class: 'gl' }, `${v > 0 ? '+' : '−'}${Math.abs(v / 60)}:00`));
  }
  svg.append(grid);
  // zero: the same-pace finishes
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(y(0)), y2: crisp(y(0)), stroke: 'var(--ink)', 'stroke-width': 1 }));
  svg.append(h('text', { x: 0, y: y(0) + 15, class: 'gl', style: 'fill:var(--ink-2)' }, '0:00 SAME PACE'));
  svg.append(h('text', { x: 0, y: pt - 10, class: 'gl', style: 'fill:var(--ink-2)' }, 'BEHIND ↑'));
  // area behind (above zero) washed in the accent
  const pts = curve.map(c => [x(c.lo), y(c.finish_s)]);
  const area = `M${pts[0][0]},${y(0)} ` + pts.map(p => `L${p[0].toFixed(1)},${Math.min(p[1], y(0)).toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0]},${y(0)} Z`;
  svg.append(h('path', { d: area, fill: 'var(--accent-wash)' }));
  svg.append(h('polyline', { points: pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  // best point
  const bx = x(best.lo), by = y(best.point.finish_s);
  svg.append(h('circle', { cx: bx, cy: by, r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
  svg.append(h('text', { x: bx, y: by + 20, 'text-anchor': 'middle', class: 'gl', style: 'fill:var(--ink)' }, `BEST ${fmtGap(best.point.finish_s)}`));
  // x axis: faster ← even → slower
  const ax = h('g', { class: 'axis' });
  [-10, -5, 0, 5, 10].forEach(v => {
    ax.append(h('line', { x1: crisp(x(v)), x2: crisp(x(v)), y1: base, y2: base + 5 }));
    ax.append(h('text', { x: x(v), y: base + 19, 'text-anchor': 'middle' }, v === 0 ? 'even' : `${Math.abs(v)}%`));
  });
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  ax.append(h('text', { x: 0, y: base + 36, style: 'font:600 10px var(--mono);letter-spacing:.08em;fill:var(--ink-3)' }, '← FASTER 5K'));
  ax.append(h('text', { x: W, y: base + 36, 'text-anchor': 'end', style: 'font:600 10px var(--mono);letter-spacing:.08em;fill:var(--ink-3)' }, 'SLOWER 5K →'));
  svg.append(ax);
  [0, best.lo, -10].forEach(v => svg.append(h('circle', { class: 'detent', 'data-v': v, cx: x(v), cy: base, r: 1.8 })));
  // live point + needle
  const c = curve.find(k => k.lo === cur);
  svg.append(needle(x(cur), pt - 8, base, base + 58));
  svg.append(h('circle', { class: 'pt', cx: x(cur), cy: y(c.finish_s), r: 6, fill: 'var(--signal)', stroke: 'var(--paper)', 'stroke-width': 2.5 }));
  return svg;
}
function place(lo, from) {
  const svg = host.querySelector('svg'); if (!svg) return;
  const { x, y } = geom(cW), c = curve.find(k => k.lo === lo);
  svg.querySelector('.needle').setAttribute('transform', `translate(${x(lo).toFixed(1)},0)`);
  const p = svg.querySelector('.pt'); p.setAttribute('cx', x(lo).toFixed(1)); p.setAttribute('cy', y(c.finish_s).toFixed(1));
  $('[data-c-open]').textContent = openLabel(lo);
  const f = $('[data-c-fin]'); f.textContent = fmtGap(c.finish_s); f.classList.toggle('is-signal', c.finish_s > 0);
  $('[data-c-ledger]').innerHTML = [['5K', c.open_s], ['After 20K', c.after20_s], ['Sustained slowdown', null, c.slowdown]].map(([k, v, s]) =>
    `<div><span class="readout-k">${k}</span><span class="v">${s != null ? pct(s) : fmtGap(v)}</span></div>`).join('');
}
responsive(host, drawCurve, () => place(cur));
scrub(host, {
  min: loMin, max: loMax, step: 1, bigStep: 4, value: cur, detents: [0, best.lo, -10], hover: true, label: 'First 5K against 5–20K pace',
  pxToValue: px => Math.round(geom(cW).x.inv(px)),
  valueText: lo => `${openLabel(lo)}: finished ${fmtGap(curve.find(k => k.lo === lo).finish_s)} against same-pace finishes`,
  onChange: lo => { cur = lo; place(lo); },
});
vtable($('[data-curve-table]'), ['First 5K', '5K', 'After 20K', 'Finish', 'Slowdown'],
  curve.map(c => [openLabel(c.lo), fmtGap(c.open_s), fmtGap(c.after20_s), fmtGap(c.finish_s), pct(c.slowdown)]), 'Finish against same-pace finishes, by first 5K');

/* ---------- 02 onset ---------- */
const bandLabel = id => ({ fast10: '10%+ fast', fast5: '5–10% fast', fast2: '2–5% fast', steady: 'Within 2%', slow2: '2–5% slow', slow5: '5%+ slow' })[id] || id;
let band = 'fast10', city = 'All courses';
const bandsEl = $('[data-bands]');
bandsEl.innerHTML = fs.bands.map(b => `<button class="chip" type="button" data-b="${b.id}" aria-pressed="${b.id === band}">${bandLabel(b.id)}</button>`).join('');
bandsEl.addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; band = b.dataset.b; $$('.chip', bandsEl).forEach(x => x.setAttribute('aria-pressed', String(x === b))); detentTick(); paintOnset(); });
const rowsEl = $('[data-onset-rows]');
rowsEl.innerHTML = ['sel', 'ref'].map(k => `<div class="onset-row" data-row="${k}"><div class="onset-k"><span class="nm"></span><span class="ct readout-k"></span></div><div class="onset-bar">${[0, 1, 2, 3].map(i => `<span class="seg-${i}"><b></b><i></i></span>`).join('')}</div></div>`).join('');
function paintOnset() {
  const o = onsetEarly(fs, city);
  const g = o.row.groups.find(x => x.band === band), ref = o.row.groups.find(x => x.band === 'steady');
  $('[data-onset-title]').innerHTML = o.guard
    ? `When a fast start had a sustained slowdown, <em>${pct(o.fastShare)}</em> began at the 20K mat. For steady starts, ${pct(o.steadyShare)}.`
    : 'Sustained slowdowns began at much the same mats after any start.';
  [['sel', g], ['ref', ref]].forEach(([k, grp]) => {
    const row = rowsEl.querySelector(`[data-row="${k}"]`), tot = grp.onset.reduce((a, b) => a + b, 0);
    row.querySelector('.nm').textContent = k === 'sel' ? bandLabel(grp.band) : `${bandLabel(grp.band)} (steady)`;
    row.querySelector('.ct').textContent = `${num(grp.slowdown_n)} slowdowns`;
    row.classList.toggle('is-ref', k === 'ref');
    row.style.display = k === 'ref' && band === 'steady' ? 'none' : '';
    const bw = row.querySelector('.onset-bar').clientWidth - 6;
    row.classList.toggle('has-tight', grp.onset.some(n => n / tot * bw < 46));
    grp.onset.forEach((n, i) => {
      const s = row.querySelector(`.seg-${i}`); s.style.flexGrow = (n / tot * 1000).toFixed(0);
      s.classList.toggle('tight', n / tot * bw < 46);
      s.querySelector('b').textContent = pct(n / tot);
      s.querySelector('i').textContent = `${fs.onset_starts_km[i]}K`;
    });
  });
  setText($('[data-scope]'), city);
}
paintOnset();

/* ---------- 03 six openings ---------- */
const six = kick.bank.bands;
const firstUp = six[0].slowdown > six[0].expected, lastDown = six[six.length - 1].slowdown < six[six.length - 1].expected;
$('[data-six-title]').innerHTML = firstUp && lastDown
  ? 'Fast openings had <em>more</em> sustained slowdowns than typical. Slow ones had fewer.'
  : 'How often each opening ended in a sustained slowdown.';
const sixEl = $('[data-six]');
const sixLabel = l => l.replace('More than ', '').replace(' faster', ' fast').replace(' slower', ' slow').replace('10% fast', '10%+ fast').replace('5% slow', '5%+ slow').replace('5–10%+ fast', '5–10% fast').replace('2–5%+ slow', '2–5% slow');
sixEl.innerHTML = six.map(b => `<li><span class="lab">${sixLabel(b.label)}<small>${pct(b.slowdown)} · typical ${pct(b.expected)}</small></span><span class="dv" data-o="${b.slowdown}" data-e="${b.expected}"></span></li>`).join('');
const dumbbell = (el, o, e, max = 0.6, emph = o > e + 0.03) => responsive(el, W => {
  const x = lin(0, max, 8, W - 8), y = 15;
  const svg = h('svg', { width: W, height: 30, viewBox: `0 0 ${W} 30`, 'aria-hidden': 'true' });
  svg.append(h('line', { x1: x(0), x2: x(max), y1: crisp(y), y2: crisp(y), stroke: 'var(--rule)' }));
  svg.append(h('line', { x1: x(Math.min(o, e)), x2: x(Math.max(o, e)), y1: y, y2: y, stroke: emph ? 'var(--signal)' : 'var(--ink)', 'stroke-width': 2 }));
  svg.append(h('circle', { cx: x(e), cy: y, r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
  svg.append(h('circle', { cx: x(o), cy: y, r: 5, fill: emph ? 'var(--signal)' : 'var(--ink)', stroke: 'var(--paper)', 'stroke-width': 2 }));
  return svg;
});
$$('.dv', sixEl).forEach(el => dumbbell(el, +el.dataset.o, +el.dataset.e));

/* by course (depth): fast10 vs steady sustained-slowdown share, ranked */
const coursesEl = $('[data-courses]');
function paintCourses() {
  const rows = fs.rows.filter(r => r.city !== 'All courses').map(r => {
    const f = r.groups.find(g => g.band === 'fast10'), s = r.groups.find(g => g.band === 'steady');
    return f && s && f.n >= fs.min_cell && s.n >= fs.min_cell ? { city: r.city, f: f.slowdown_n / f.n, s: s.slowdown_n / s.n, n: f.n } : null;
  }).filter(Boolean).sort((a, b) => b.f - a.f);
  const all = fs.rows.find(r => r.city === 'All courses');
  const allF = all.groups.find(g => g.band === 'fast10'), allS = all.groups.find(g => g.band === 'steady');
  const higher = rows.filter(r => r.f > r.s).length;
  $('[data-bc-dek]').innerHTML = `On <b style="color:var(--ink)">${higher} of ${rows.length}</b> courses, very fast openings had a sustained slowdown more often than steady ones.`;
  coursesEl.innerHTML = rows.map(r => `<li class="${r.city === city ? 'is-on' : ''}"><span class="lab">${r.city}<small>${pct(r.f)} · ${pct(r.s)}</small></span><span class="dv"></span></li>`).join('');
  $$('.dv', coursesEl).forEach((el, i) => dumbbell(el, rows[i].f, rows[i].s, 0.8, rows[i].city === city || city === 'All courses' ? rows[i].f > rows[i].s + 0.03 : false));
}
paintCourses();

/* ---------- the floating course control ---------- */
const dock = $('[data-dock]'), sel = $('[data-course]');
sel.insertAdjacentHTML('beforeend', fs.rows.filter(r => r.city !== 'All courses').map(r => `<option>${r.city}</option>`).join(''));
sel.addEventListener('change', () => { city = sel.value; detentTick(); paintOnset(); paintCourses(); });
const heroEl = $('.lap-hero'), nextEl = $('.next-lap');
const io = new IntersectionObserver(() => {
  const hr = heroEl.getBoundingClientRect(), nr = nextEl.getBoundingClientRect();
  dock.classList.toggle('is-away', hr.bottom > innerHeight * 0.3 || nr.top < innerHeight * 0.9);
}, { threshold: [0, 0.25, 0.5, 0.75, 1] });
io.observe(heroEl); io.observe(nextEl);
addEventListener('scroll', () => {
  const hr = heroEl.getBoundingClientRect(), nr = nextEl.getBoundingClientRect();
  dock.classList.toggle('is-away', hr.bottom > innerHeight * 0.3 || nr.top < innerHeight * 0.9);
}, { passive: true });

/* ---------- next ---------- */
const ns = negativeSplit(pat);
$('[data-next-title]').innerHTML = `Only <em>${ns.words.text}</em> finishes ran the second 20K faster than the first.`;
$('[data-next-figure]').innerHTML = `${(ns.share * 100).toFixed(1)}<span class="u">%</span>`;
feedback($('[data-feedback]'));
