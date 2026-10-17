import { mountChrome, U, $, $$, pct, num, fmtHM, fmtMS, seg, feedback, setText, detentTick, reduced } from './core.js';
import { loadAll, load, fmtGap } from './nuggets.js';
import { h, hOf, lin, clamp, crisp, responsive, scrub, needle, dial, lightDial, vtable } from './charts.js';
import { mountReplay } from './replay.js';

mountChrome({ lap: '09' });
const CITY = 'Boston';
const [co, geo, ar, cg, rp] = await loadAll(['courses', 'course-geometry', 'archetypes', 'course-goal', 'replay']);
const S = co.courses.find(c => c.city === CITY);
const G = geo.courses.find(c => c.city === CITY);
const T = ar.courses.find(c => c.city === CITY);
const C = cg.courses.find(c => c.city === CITY);
const cells = co.years.cells.filter(c => c.city === CITY).sort((a, b) => a.year - b.year);
const K = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const secs = co.sections; // '0–5' … '40–42.2'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const sections = [['at-a-glance', 'At a glance'], ['finish-times', 'Finish times'], ['elevation', 'Elevation'], ['pacing', 'Pacing'], ['slowdown', 'Holding pace'], ['goals', 'Goal times'], ['weather', 'Weather'], ['replay', 'Replay']];
$('[data-rail]').innerHTML = sections.map(([id, t], i) => `<li><a href="#${id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${t}</span></a></li>`).join('');

/* ---------- hero ---------- */
$('[data-meta]').innerHTML = `${S.editions} editions<span class="dot"></span>${S.years[0]}–${S.years[S.years.length - 1]}<span class="dot"></span>${C.months.map(m => MONTHS[m - 1]).join(', ')}`;
$('[data-hero-figure]').innerHTML = `${Math.round(S.slowdown * 100)}<span class="u">%</span>`;
const [rlo, rhi] = S.slowdown_range, [ylo, yhi] = S.slowdown_range_years;
$('[data-hero-sentence]').innerHTML = `Edition by edition, from <em>${pct(rlo)}</em> in ${ylo} to ${pct(rhi)} in ${yhi}.`;

let yi = cells.length - 1, ysW = 0;
const ysHost = $('[data-years]');
const ysGeom = W => { const H = hOf(ysHost, W, 128 / 350), base = H - 26; return { H, base, x: i => 44 + i * (W - 58) / Math.max(1, cells.length - 1), y: lin(0, 0.5, base, 10) }; };
function drawYears(W) {
  ysW = W; const { H, base, x, y } = ysGeom(W);
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Sustained slowdown share by edition, from ${pct(rlo)} to ${pct(rhi)}` });
  [0.25, 0.5].forEach(v => { svg.append(h('line', { x1: 0, x2: W, y1: crisp(y(v)), y2: crisp(y(v)), stroke: 'var(--rule)' })); svg.append(h('text', { x: 0, y: y(v) - 4, class: 'gl' }, pct(v))); });
  svg.append(h('line', { x1: 34, x2: W, y1: crisp(y(S.slowdown)), y2: crisp(y(S.slowdown)), stroke: 'var(--ink)', 'stroke-dasharray': '2 3' }));
  svg.append(h('text', { x: 0, y: y(S.slowdown) + 4, class: 'gl', style: 'fill:var(--ink)' }, 'AVG'));
  cells.forEach((c, i) => {
    const ext = c.year === ylo || c.year === yhi;
    svg.append(h('line', { x1: x(i), x2: x(i), y1: base, y2: y(c.slowdown), stroke: ext ? 'var(--ink)' : 'var(--mark-quiet)', 'stroke-width': 2, 'stroke-linecap': 'round', class: 'ys', 'data-i': i }));
    svg.append(h('circle', { cx: x(i), cy: y(c.slowdown), r: 4, fill: ext ? 'var(--ink)' : 'var(--paper)', stroke: ext ? 'var(--paper)' : 'var(--mark-quiet)', 'stroke-width': ext ? 2 : 1.5, class: 'ysd', 'data-i': i }));
    svg.append(h('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'gl', style: ext ? 'fill:var(--ink)' : '' }, `’${String(c.year).slice(2)}`));
  });
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  svg.append(h('g', { class: 'ysn' }, [h('line', { y1: 4, y2: base, stroke: 'var(--signal)', 'stroke-width': 1.5 }), h('circle', { r: 5.5, fill: 'var(--signal)', stroke: 'var(--paper)', 'stroke-width': 2 })]));
  return svg;
}
function paintYears(i) {
  const svg = ysHost.querySelector('svg'); if (!svg) return;
  const { x, y } = ysGeom(ysW), c = cells[i];
  const g = svg.querySelector('.ysn'); g.setAttribute('transform', `translate(${x(i).toFixed(1)},0)`);
  g.querySelector('circle').setAttribute('cy', y(c.slowdown).toFixed(1));
  setText($('[data-ys-k]'), `${c.year}`);
  $('[data-ys-v]').innerHTML = `${pct(c.slowdown)}<span style="font-size:.55em;color:var(--ink-3);letter-spacing:0;margin-left:.45em">median ${fmtHM(c.median_s)}</span>`;
  setText($('[data-ys-t]'), U.temp(c.temp));
}
responsive(ysHost, drawYears, () => paintYears(yi));
scrub(ysHost, { min: 0, max: cells.length - 1, step: 1, value: yi, label: 'Edition', hover: true,
  detents: cells.map((c, i) => i).filter(i => cells[i].year === ylo || cells[i].year === yhi),
  pxToValue: px => Math.round((px - 44) / ((ysW - 58) / Math.max(1, cells.length - 1))),
  valueText: i => `${cells[i].year}: ${pct(cells[i].slowdown)} sustained slowdown`, onChange: i => { yi = i; paintYears(i); } });
U.on(() => paintYears(yi));

/* route face */
const routeHost = $('[data-route]');
const sig = S.signature_section.split('–').map(Number);
function drawRoute(W) {
  const H = Math.round(W * .78), pad = 34, xs = G.route.map(p => p[0]), ys = G.route.map(p => p[1]);
  const mx = Math.min(...xs), Mx = Math.max(...xs), my = Math.min(...ys), My = Math.max(...ys);
  const s = Math.min((W - 2 * pad) / (Mx - mx), (H - 2 * pad - 20) / (My - my));
  const ox = (W - (Mx - mx) * s) / 2, oy = 16 + (H - (My - my) * s) / 2;
  const P = G.route.map(p => [ox + (p[0] - mx) * s, oy + (p[1] - my) * s]), tot = G.route_km[G.route_km.length - 1];
  const at = km => { const d = km / 42.195 * tot; let i = 1; while (i < G.route_km.length - 1 && G.route_km[i] < d) i++; const a = P[i - 1], b = P[i], f = clamp((d - G.route_km[i - 1]) / ((G.route_km[i] - G.route_km[i - 1]) || 1), 0, 1); const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [a[0] + dx * f, a[1] + dy * f, -dy / L, dx / L]; };
  const path = (k0, k1) => { const pts = []; for (let k = k0; k <= k1 + 1e-6; k += 0.25) pts.push(at(Math.min(k, k1))); return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(''); };
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `The ${S.race} route, with its most distinctive section, ${S.signature_section} km, marked` });
  svg.append(h('path', { d: path(0, 42.195), fill: 'none', stroke: 'var(--paper-sunk)', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.append(h('path', { d: path(0, 42.195), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.append(h('path', { d: path(sig[0], sig[1]), fill: 'none', stroke: 'var(--signal)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
  for (let k = 5; k < 42; k += 5) { const p = at(k); svg.append(h('line', { x1: p[0] - p[2] * 5, y1: p[1] - p[3] * 5, x2: p[0] + p[2] * 5, y2: p[1] + p[3] * 5, stroke: 'var(--ink)', 'stroke-width': 1 })); if (k % 10 === 0 && k < 40) svg.append(h('text', { x: p[0] + p[2] * 15, y: p[1] + p[3] * 15 + 4, 'text-anchor': 'middle', class: 'gl' }, `${k}K`)); }
  const s0 = at(0), f0 = at(42.195), sm = at((sig[0] + sig[1]) / 2);
  svg.append(h('circle', { cx: s0[0], cy: s0[1], r: 5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
  svg.append(h('text', { x: s0[0] + 2, y: s0[1] - 11, 'text-anchor': 'middle', class: 'gl', style: 'fill:var(--ink)' }, 'START'));
  svg.append(h('rect', { x: f0[0] - 5, y: f0[1] - 5, width: 10, height: 10, fill: 'var(--ink)' }));
  svg.append(h('text', { x: Math.min(f0[0], W - 24), y: f0[1] + 22, 'text-anchor': 'middle', class: 'gl', style: 'fill:var(--ink)' }, 'FINISH'));
  svg.append(h('text', { x: sm[0] - sm[2] * 20, y: sm[1] - sm[3] * 20, 'text-anchor': 'middle', class: 'gl', style: 'fill:var(--accent-ink);font-weight:600' }, `${S.signature_section}K`));
  return svg;
}
responsive(routeHost, drawRoute);
const routeMeta = () => setText($('[data-route-meta]'), `${U.dist(G.distance_km)} · ${U.elev(G.gain_m)} of climb`);
routeMeta(); U.on(routeMeta);

/* ---------- 01 at a glance ---------- */
$('[data-sig-title]').innerHTML = `Boston’s most distinctive 5K is <em>${S.signature_section}K</em>.`;
const glance = () => { $('[data-glance]').innerHTML = [
  ['Median finish', fmtHM(S.median_s)],
  ['Climb', U.elev(G.gain_m)],
  ['Named by shape', `${S.identified.correct}<span style="color:var(--ink-3)"> of ${S.identified.editions}</span>`],
].map(([k, v]) => `<div><span class="label">${k}</span><span class="v">${v}</span></div>`).join('') +
  `<p class="small" style="grid-column:1/-1;padding:14px 0 2px;color:var(--ink-2)">Against their own average pace, finishers ran <span style="white-space:nowrap">${S.signature_section}K</span> ${Math.abs(S.signature_points).toFixed(1)} points ${S.signature_points < 0 ? 'quicker' : 'slower'} than on a typical course. From that shape alone, the course was named in ${S.identified.correct} of ${S.identified.editions} editions.</p>`; };
glance(); U.on(glance);

/* ---------- 02 finish times by year ---------- */
const f0 = cells[0], f1 = cells[cells.length - 1];
$('[data-ft-title]').innerHTML = `The median finish moved from ${fmtHM(f0.median_s)} in ${f0.year} to <em>${fmtHM(f1.median_s)}</em> in ${f1.year}.`;
let fi = cells.length - 1, ftW = 0;
const ftHost = $('[data-ft]');
const yMinS = Math.floor((Math.min(...cells.map(c => c.median_s)) - 300) / 600) * 600, yMaxS = Math.ceil((Math.max(...cells.map(c => c.median_s)) + 300) / 600) * 600;
const ftGeom = W => { const H = hOf(ftHost, W, 190 / 350), base = H - 30; return { H, base, x: lin(cells[0].year, cells[cells.length - 1].year, 18, W - 18), y: lin(yMinS, yMaxS, base, 12) }; };
function drawFt(W) {
  ftW = W; const { H, base, x, y } = ftGeom(W);
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Median finish by year, ${fmtHM(f0.median_s)} in ${f0.year} to ${fmtHM(f1.median_s)} in ${f1.year}` });
  for (let v = yMinS; v <= yMaxS; v += 600) { if (v === yMinS) continue; svg.append(h('line', { x1: 0, x2: W, y1: crisp(y(v)), y2: crisp(y(v)), stroke: 'var(--rule)' })); svg.append(h('text', { x: 0, y: y(v) - 4, class: 'gl' }, fmtHM(v))); }
  // line, broken where years are missing
  let d = '';
  cells.forEach((c, i) => { const gap = i && c.year - cells[i - 1].year > 1; d += `${i === 0 || gap ? 'M' : 'L'}${x(c.year).toFixed(1)} ${y(c.median_s).toFixed(1)}`; });
  svg.append(h('path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  cells.forEach((c, i) => { if (i && c.year - cells[i - 1].year > 1) { const xm = (x(c.year) + x(cells[i - 1].year)) / 2; svg.append(h('text', { x: xm, y: base - 8, 'text-anchor': 'middle', class: 'gl' }, 'NO RACE DATA')); } });
  cells.forEach(c => svg.append(h('circle', { cx: x(c.year), cy: y(c.median_s), r: 3.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 })));
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  cells.forEach(c => svg.append(h('text', { x: x(c.year), y: H - 8, 'text-anchor': 'middle', class: 'gl' }, `${c.year}`.slice(W < 500 ? 2 : 0).replace(/^(\d\d)$/, '’$1'))));
  svg.append(h('g', { class: 'ftn' }, [h('line', { y1: 6, y2: base, stroke: 'var(--signal)', 'stroke-width': 1.5 }), h('circle', { r: 5.5, fill: 'var(--signal)', stroke: 'var(--paper)', 'stroke-width': 2 })]));
  return svg;
}
function paintFt(i) {
  const svg = ftHost.querySelector('svg'); if (!svg) return;
  const { x, y } = ftGeom(ftW), c = cells[i];
  const g = svg.querySelector('.ftn'); g.setAttribute('transform', `translate(${x(c.year).toFixed(1)},0)`); g.querySelector('circle').setAttribute('cy', y(c.median_s).toFixed(1));
  setText($('[data-ft-k]'), `Median finish, ${c.year}`);
  $('[data-ft-v]').innerHTML = `${fmtHM(c.median_s)}<span style="font-size:.55em;color:var(--ink-3);letter-spacing:0;margin-left:.45em">${pct(c.slowdown)} slowed</span>`;
  setText($('[data-ft-n]'), num(c.n));
}
responsive(ftHost, drawFt, () => paintFt(fi));
scrub(ftHost, { min: 0, max: cells.length - 1, step: 1, value: fi, label: 'Year', hover: true,
  pxToValue: px => { const { x } = ftGeom(ftW); let best = 0; cells.forEach((c, i) => { if (Math.abs(x(c.year) - px) < Math.abs(x(cells[best].year) - px)) best = i; }); return best; },
  valueText: i => `${cells[i].year}: median ${fmtHM(cells[i].median_s)}`, onChange: i => { fi = i; paintFt(i); } });
const ftTable = () => vtable($('[data-ft-table]'), ['Year', 'Finishes', 'Median', 'Slowdown', 'Start'], cells.map(c => [String(c.year), num(c.n), fmtHM(c.median_s), pct(c.slowdown), U.temp(c.temp)]), 'Finishes by year');
ftTable(); U.on(ftTable);

/* ---------- 03 elevation and pace (shared scale) ---------- */
const pageCities = new Set(co.courses.map(c => c.city));
const relief = Math.max(...geo.courses.filter(c => pageCities.has(c.city)).map(c => c.max_m - c.min_m));
const reliefTop = Math.ceil(relief / 25) * 25;
const elev = G.elevation_m, step = G.elevation_step_km, tot = G.distance_km;
const elevAt = km => { const d = km / 42.195 * tot / step, i = Math.floor(d), f = d - i; return (elev[Math.min(i, elev.length - 1)] * (1 - f) + elev[Math.min(i + 1, elev.length - 1)] * f) - G.min_m; };
const secGain = K.slice(0, 9).map((k, i) => { let g = 0; for (let km = K[i]; km < K[i + 1] - 1e-6; km += 0.25) g += Math.max(0, elevAt(Math.min(km + 0.25, K[i + 1])) - elevAt(km)); return g; });
const secNet = K.slice(0, 9).map((k, i) => elevAt(K[i + 1]) - elevAt(K[i]));
const climbI = secGain.indexOf(Math.max(...secGain)), slowI = secs.indexOf(S.slowest_section);
const same = climbI === slowI;
$('[data-el-title]').innerHTML = same
  ? `The biggest climb and the slowest 5K are the same stretch: <em>${secs[slowI]}K</em>.`
  : `Boston’s slowest 5K for its field is <em>${S.slowest_section}K</em>.`;
const elDek = () => {
  const nxt = slowI + 1;
  $('[data-el-dek]').textContent = same
    ? `${U.elev(secGain[climbI])} of climbing in that 5K.` + (nxt < 9 && secNet[nxt] < -20 && secs[nxt] === S.signature_section ? ` The ${U.elev(-secNet[nxt])} drop that follows came with Boston’s most distinctive 5K.` : '')
    : `Elevation is drawn on one scale for every course, so a flat course looks flat.`;
};
elDek(); U.on(elDek);
let ek = (K[slowI] + K[slowI + 1]) / 2, elW = 0;
const elHost = $('[data-elev]');
const elGeom = W => { const H = hOf(elHost, W, 300 / 350), top = 18, eh = H * 0.36, gap = 30, pTop = top + eh + gap, pBase = H - 40; return { H, top, eh, pTop, pBase, x: lin(0, 42.195, 0, W), ye: lin(0, reliefTop, top + eh, top), yp: lin(-8, 12, pBase, pTop) }; };
function drawElev(W) {
  elW = W; const g = elGeom(W), { H, top, eh, pTop, pBase, x, ye, yp } = g;
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Elevation profile on a shared scale above the pace in each 5K against the finisher's own average` });
  // elevation silhouette
  let d = `M0 ${ye(0)}`; for (let km = 0; km <= 42.195; km += 0.25) d += `L${x(km).toFixed(1)} ${ye(elevAt(km)).toFixed(1)}`; d += `L${W} ${ye(0)}Z`;
  svg.append(h('path', { d, fill: 'var(--fill-quiet)' }));
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(ye(0)), y2: crisp(ye(0)), stroke: 'var(--rule-strong)' }));
  const eStep = U.km() ? 50 : 200, eMax = U.elevN(reliefTop);
  for (let v = eStep; v < eMax; v += eStep) { const m = U.km() ? v : v * 0.3048; svg.append(h('line', { x1: 0, x2: W, y1: crisp(ye(m)), y2: crisp(ye(m)), stroke: 'var(--rule)' })); svg.append(h('text', { x: W, y: ye(m) - 4, 'text-anchor': 'end', class: 'gl' }, `+${v} ${U.elevUnit()}`)); }
  // the climb section shaded
  svg.append(h('rect', { x: x(K[climbI]), y: top, width: x(K[climbI + 1]) - x(K[climbI]), height: eh, fill: 'var(--accent-wash)' }));
  // section pace columns
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(yp(0)), y2: crisp(yp(0)), stroke: 'var(--ink)', 'stroke-opacity': .6 }));
  svg.append(h('text', { x: 0, y: yp(0) - 6, class: 'gl', style: 'fill:var(--ink-2)' }, 'OWN AVERAGE PACE'));
  svg.append(h('text', { x: 0, y: pTop - 4, class: 'gl' }, 'SLOWER ↑'));
  secs.forEach((s, i) => {
    const x0 = x(K[i]) + 2, w = x(K[i + 1]) - x(K[i]) - 4, v = S.curve[i], t = co.typical_curve[i];
    svg.append(h('rect', { x: x0, y: Math.min(yp(v), yp(0)), width: w, height: Math.abs(yp(v) - yp(0)), rx: 2, fill: i === slowI ? 'var(--signal)' : 'var(--mark-quiet)' }));
    svg.append(h('rect', { x: x0 + .75, y: Math.min(yp(t), yp(0)) + .75, width: w - 1.5, height: Math.max(0, Math.abs(yp(t) - yp(0)) - 1.5), rx: 2, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.25, 'stroke-dasharray': '2 2' }));
  });
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(pBase), y2: crisp(pBase), stroke: 'var(--rule-strong)' }));
  const km = U.km(), ticks = km ? [0, 10, 20, 30, 40] : [0, 5, 10, 15, 20, 25].map(m => m * 1.609344);
  ticks.forEach(k => { svg.append(h('line', { x1: crisp(x(k)), x2: crisp(x(k)), y1: pBase, y2: pBase + 4, stroke: 'var(--rule-strong)' })); svg.append(h('text', { x: x(k), y: pBase + 17, 'text-anchor': k === 0 ? 'start' : 'middle', class: 'gl' }, km ? `${k}K` : `${Math.round(k / 1.609344)} mi`)); });
  svg.append(needle(x(ek), top - 2, pBase, pBase + 30, { hint: false }));
  svg.append(h('circle', { class: 'ept', r: 4.5, fill: 'var(--signal)', stroke: 'var(--paper)', 'stroke-width': 2 }));
  return svg;
}
function paintElev(k) {
  const svg = elHost.querySelector('svg'); if (!svg) return;
  const { x, ye } = elGeom(elW);
  svg.querySelector('.needle').setAttribute('transform', `translate(${x(k).toFixed(1)},0)`);
  const p = svg.querySelector('.ept'); p.setAttribute('cx', x(k).toFixed(1)); p.setAttribute('cy', ye(elevAt(k)).toFixed(1));
  const i = Math.min(8, K.findIndex((v, j) => k >= v && k < K[j + 1]));
  setText($('[data-el-k]'), `${U.dist(k)} · section ${secs[i]}K`);
  $('[data-el-v]').innerHTML = `${U.elev(elevAt(k) + G.min_m)}<span style="font-size:.55em;color:var(--ink-3);letter-spacing:0;margin-left:.45em">${U.elev(secGain[i])} climb</span>`;
  const v = S.curve[i], t = co.typical_curve[i];
  const pe = $('[data-el-p]'); pe.innerHTML = `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%<span style="font-size:.7em;color:var(--ink-3);margin-left:.4em">typ. ${t > 0 ? '+' : '−'}${Math.abs(t).toFixed(1)}</span>`;
  pe.classList.toggle('is-signal', i === slowI);
}
const elR = responsive(elHost, drawElev, () => paintElev(ek));
scrub(elHost, { min: 0, max: 42, step: 0.5, bigStep: 5, value: ek, label: 'Distance along the course', hover: true, detents: [K[slowI], K[slowI + 1]],
  pxToValue: px => elGeom(elW).x.inv(px), valueText: k => `${U.dist(k)}: ${U.elev(elevAt(k) + G.min_m)}`, onChange: k => { ek = k; paintElev(k); } });
U.on(() => { elR.redraw(); paintElev(ek); });

/* ---------- 04 pacing types (shape, not colour) ---------- */
const diffs = ar.archetypes.map((a, i) => ({ a, i, b: T.shares[i], d: T.shares[i] - a.share }));
const over = diffs.reduce((m, x) => (x.d > m.d ? x : m));
$('[data-types-title]').innerHTML = over.d >= 0.02
  ? `Boston had more <em>${over.a.name}s</em> than the field at large: ${pct(over.b)} against ${pct(over.a.share)}.`
  : 'Boston’s pacing types looked like the field at large.';
const typesEl = $('[data-types]');
typesEl.innerHTML = `<div class="key"><span><i class="ink"></i>Boston</span><span><i class="hollow"></i>All courses</span></div><ul class="dumb types-list">${diffs.map(x => `<li class="${x === over ? 'is-on' : ''}"><span class="lab type-lab"><span class="glyph" data-g="${x.i}"></span><span>${x.a.name}<small>${pct(x.b)} · all ${pct(x.a.share)}</small></span></span><span class="dv" data-i="${x.i}"></span></li>`).join('')}</ul>`;
$$('.glyph', typesEl).forEach(el => {
  const lo = Math.min(...ar.archetypes.flatMap(a => a.profile)), hi = Math.max(...ar.archetypes.flatMap(a => a.profile));
  const p = ar.archetypes[+el.dataset.g].profile, x = lin(0, 8, 2, 38), y = lin(lo, hi, 16.5, 1.5);
  el.innerHTML = `<svg viewBox="0 0 40 18" aria-hidden="true"><line x1="2" x2="38" y1="${y(0)}" y2="${y(0)}" stroke="var(--rule-strong)"/><polyline points="${p.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
});
$$('.dv', typesEl).forEach(el => {
  const x0 = diffs[+el.dataset.i];
  responsive(el, W => {
    const x = lin(0, 0.4, 6, W - 6), y = 15, emph = x0 === over;
    const svg = h('svg', { width: W, height: 30, viewBox: `0 0 ${W} 30`, 'aria-hidden': 'true' });
    svg.append(h('line', { x1: x(0), x2: x(0.4), y1: crisp(y), y2: crisp(y), stroke: 'var(--rule)' }));
    svg.append(h('line', { x1: x(Math.min(x0.b, x0.a.share)), x2: x(Math.max(x0.b, x0.a.share)), y1: y, y2: y, stroke: emph ? 'var(--signal)' : 'var(--ink)', 'stroke-width': 2 }));
    svg.append(h('circle', { cx: x(x0.a.share), cy: y, r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    svg.append(h('circle', { cx: x(x0.b), cy: y, r: 5, fill: emph ? 'var(--signal)' : 'var(--ink)', stroke: 'var(--paper)', 'stroke-width': 2 }));
    return svg;
  });
});

/* ---------- 05 holding pace: every course on one strip ---------- */
const all = co.courses.slice().sort((a, b) => a.slowdown - b.slowdown);
const solid = all.filter(c => c.editions >= 3), lo = solid[0], hi = solid[solid.length - 1];
$('[data-strip-title]').innerHTML = `Boston sits at <em>${pct(S.slowdown)}</em>, on a line of courses from ${pct(lo.slowdown)} to ${pct(hi.slowdown)}.`;
responsive($('[data-strip]'), W => {
  const H = hOf($('[data-strip]'), W, 120 / 350), y = H * 0.62, x = lin(Math.floor(lo.slowdown * 20) / 20, Math.ceil(Math.max(...all.map(c => c.slowdown)) * 20) / 20, 10, W - 10);
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Sustained slowdown share by course; Boston ${pct(S.slowdown)}, courses from ${pct(lo.slowdown)} to ${pct(hi.slowdown)}` });
  svg.append(h('line', { x1: 10, x2: W - 10, y1: crisp(y), y2: crisp(y), stroke: 'var(--rule-strong)' }));
  const placed = [];
  let meTop = y;
  all.forEach(c => {
    const cx = x(c.slowdown); let lvl = 0;
    while (placed.some(p => p.l === lvl && Math.abs(p.x - cx) < 10.5)) lvl++;
    placed.push({ x: cx, l: lvl });
    const cy = y - lvl * 10.5, me = c.city === CITY;
    if (me) meTop = cy;
    svg.append(c.editions < 3 ? h('circle', { cx, cy, r: 3.8, fill: 'var(--paper)', stroke: 'var(--mark-quiet)', 'stroke-width': 1.25 })
      : h('circle', { cx, cy, r: me ? 6 : 4.3, fill: me ? 'var(--signal)' : 'var(--fill-quiet)', stroke: 'var(--paper)', 'stroke-width': 2 }));
  });
  const meX = x(S.slowdown);
  svg.append(h('line', { x1: meX, x2: meX, y1: meTop - 10, y2: 20, stroke: 'var(--signal)' }));
  svg.append(h('text', { x: meX, y: 13, 'text-anchor': meX < 60 ? 'start' : 'middle', style: 'font:600 12px var(--sans);fill:var(--accent-ink)' }, `${CITY} ${pct(S.slowdown)}`));
  svg.append(h('text', { x: x(lo.slowdown), y: y + 22, style: 'font:500 11px var(--mono);fill:var(--ink-2)' }, `${lo.city} ${pct(lo.slowdown)}`));
  svg.append(h('text', { x: x(hi.slowdown), y: y + 22, 'text-anchor': 'end', style: 'font:500 11px var(--mono);fill:var(--ink-2)' }, `${hi.city} ${pct(hi.slowdown)}`));
  return svg;
});

/* ---------- 06 goal times ---------- */
const GOALS = [180, 210, 240, 270, 300].filter(g => cg.rows.some(r => r.city === CITY && r.goal === g));
let goal = 240;
const gSeg = $('[data-goals]');
gSeg.innerHTML = GOALS.map(g => `<button type="button" data-v="${g}" aria-pressed="${g === goal}">${fmtHM(g * 60)}</button>`).join('');
const dialHost = $('[data-goal-dial]');
function paintGoal() {
  const r = cg.rows.find(x => x.city === CITY && x.goal === goal);
  $('[data-goal-title]').innerHTML = `On ${fmtHM(goal * 60)} pace through 20K, <em>${pct(r.under)}</em> of Boston finishes made ${fmtHM(goal * 60)}.`;
  dialHost.querySelector('svg')?.remove(); dialHost.classList.remove('is-in');
  dial(dialHost, { share: r.under, stagger: 6 }); requestAnimationFrame(() => requestAnimationFrame(() => dialHost.classList.add('is-in')));
  $('[data-goal-figure]').innerHTML = `${Math.round(r.under * 100)}<span class="u">%</span>`;
  $('[data-goal-unit]').textContent = `made ${fmtHM(goal * 60)}`;
  $('[data-goal-cells]').innerHTML = [
    ['Made the goal', pct(r.under)], ['Sustained slowdown', pct(r.sd)],
    ['Given back after 20K', fmtGap(r.after20)], ['Typical finish', fmtHM(r.fin[1])],
  ].map(([k, v]) => `<div><span class="label">${k}</span><span class="v">${v}</span></div>`).join('');
}
paintGoal();
seg(gSeg, v => { goal = +v; paintGoal(); });
const tbl = document.createElement('div'); tbl.className = 'table-region'; tbl.setAttribute('role', 'region'); tbl.setAttribute('aria-label', 'Goal times on this course'); tbl.tabIndex = 0;
tbl.innerHTML = `<table class="vtable tool-table"><caption class="sr-only">Goal times on this course</caption><thead><tr><th scope="col">Goal</th><th scope="col">Made it</th><th scope="col">Slowdown</th></tr></thead><tbody>${cg.rows.filter(r => r.city === CITY && r.goal % 15 === 0).map(r => `<tr><th scope="row"><a href="#plan" style="text-decoration:underline;text-underline-offset:3px">Plan a ${fmtHM(r.goal * 60)} ${S.race}</a></th><td>${pct(r.under)}</td><td>${pct(r.sd)}</td></tr>`).join('')}</tbody></table>`;
$('[data-goal-table]').append(tbl);

/* ---------- 07 race-morning weather ---------- */
const hc = co.weather.hot_cool.find(x => x.city === CITY);
const wxEd = co.weather.editions.filter(e => e.city === CITY);
const wxTitle = () => {
  $('[data-wx-title]').innerHTML = hc && hc.hot.temp - hc.cool.temp >= 5
    ? `At <em>${U.temp(hc.hot.temp)}</em> in ${hc.hot.year}, ${pct(hc.hot.slowdown)} had a sustained slowdown. At ${U.temp(hc.cool.temp)} in ${hc.cool.year}, ${pct(hc.cool.slowdown)}.`
    : 'Race mornings here were close enough in temperature to compare little.';
};
wxTitle(); U.on(wxTitle);
const wxR = responsive($('[data-wx]'), W => {
  const H = hOf($('[data-wx]'), W, 250 / 350), pb = 40, pt = 16, base = H - pb;
  const t0 = Math.floor(Math.min(...wxEd.map(e => e.temp)) - 2), t1 = Math.ceil(Math.max(...wxEd.map(e => e.temp)) + 2);
  const x = lin(t0, t1, 24, W - 24), y = lin(0, 0.45, base, pt);
  const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Start temperature against sustained slowdown share, one dot per edition' });
  [0.1, 0.2, 0.3, 0.4].forEach(v => { svg.append(h('line', { x1: 0, x2: W, y1: crisp(y(v)), y2: crisp(y(v)), stroke: 'var(--rule)' })); svg.append(h('text', { x: 0, y: y(v) - 4, class: 'gl' }, pct(v))); });
  svg.append(h('line', { x1: 0, x2: W, y1: crisp(base), y2: crisp(base), stroke: 'var(--rule-strong)' }));
  const step = U.km() ? 2 : 5;
  const a = Math.ceil(U.tempN(t0) / step) * step, b = Math.floor(U.tempN(t1) / step) * step;
  for (let v = a; v <= b; v += step) { const c = U.km() ? v : (v - 32) * 5 / 9; svg.append(h('line', { x1: crisp(x(c)), x2: crisp(x(c)), y1: base, y2: base + 4, stroke: 'var(--rule-strong)' })); svg.append(h('text', { x: x(c), y: base + 17, 'text-anchor': 'middle', class: 'gl' }, `${v}°`)); }
  svg.append(h('text', { x: W, y: base + 34, 'text-anchor': 'end', class: 'gl' }, `START TEMPERATURE, ${U.tempUnit()}`));
  if (hc) svg.append(h('line', { x1: x(hc.cool.temp), y1: y(hc.cool.slowdown), x2: x(hc.hot.temp), y2: y(hc.hot.slowdown), stroke: 'var(--ink)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
  wxEd.forEach(e => {
    const isH = hc && e.year === hc.hot.year, isC = hc && e.year === hc.cool.year;
    svg.append(h('circle', { cx: x(e.temp), cy: y(e.slowdown), r: isH || isC ? 6 : 4.5, fill: isH ? 'var(--signal)' : isC ? 'var(--ink)' : 'var(--fill-quiet)', stroke: 'var(--paper)', 'stroke-width': 2 }));
    const crowd = wxEd.some(o => o !== e && o.temp > e.temp && x(o.temp) - x(e.temp) < 44 && Math.abs(y(o.slowdown) - y(e.slowdown)) < 14);
    svg.append(h('text', { x: x(e.temp) + (crowd ? -9 : 9), y: y(e.slowdown) + 4, 'text-anchor': crowd ? 'end' : 'start', style: `font:${isH || isC ? 600 : 500} 11px var(--mono);fill:${isH ? 'var(--accent-ink)' : isC ? 'var(--ink)' : 'var(--ink-3)'}` }, String(e.year)));
  });
  return svg;
});
U.on(() => wxR.redraw());

/* ---------- replay ---------- */
const ed = rp.editions.find(e => e.slug === 'boston-2026');
load('replay/boston-2026').then(file => {
  if (new URLSearchParams(location.search).get('view') === 'route') $$('[data-view] button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === 'route')));
  const r = mountReplay($('[data-replay]'), { file, edition: ed, mode: new URLSearchParams(location.search).get('view') === 'route' ? 'route' : 'straight', route: G.route, routeKm: G.route_km, start: Math.round(ed.first_finish_s * 1.02) });
  seg($('[data-view]'), v => r.setMode(v));
});

/* ---------- shaped like Boston ---------- */
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const sim = co.courses.filter(c => c.city !== CITY && c.shape_editions >= 3 && c.deviation).map(c => ({ c, d: dist(c.deviation, S.deviation) })).sort((a, b) => a.d - b.d).slice(0, 3);
$('[data-similar]').innerHTML = sim.map(({ c }) => `<a class="press" href="#"><span class="nm">${c.city}<small>${pct(c.slowdown)} sustained slowdown</small></span><span class="fp" data-c="${c.city}"></span></a>`).join('');
$$('.fp').forEach(el => {
  const c = co.courses.find(x => x.city === el.dataset.c);
  responsive(el, W => {
    const x = lin(0, 8, 4, W - 4), y = lin(-7, 11, 32, 4);
    const line = arr => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const svg = h('svg', { width: W, height: 36, viewBox: `0 0 ${W} 36`, 'aria-hidden': 'true' });
    svg.append(h('line', { x1: 0, x2: W, y1: crisp(y(0)), y2: crisp(y(0)), stroke: 'var(--rule)' }));
    svg.append(h('polyline', { points: line(S.curve), fill: 'none', stroke: 'var(--signal)', 'stroke-width': 1.5, 'stroke-opacity': .55 }));
    svg.append(h('polyline', { points: line(c.curve), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.75, 'stroke-linejoin': 'round' }));
    return svg;
  });
});
feedback($('[data-feedback]'));
