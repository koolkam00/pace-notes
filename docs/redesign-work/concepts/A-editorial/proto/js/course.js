import { $, $$, h, s, initHeader, initMenu, initReveals, clock, hm, ms, pct, int, elev, dist, getUnits, onUnits, reduced, scale, onResize, countWord, sectionName, KM_PER_MI, loadJSON } from './core.js';
import { data, buildRoute, argmax, argmin } from './nuggets.js';
import { createReplay } from './replay.js';

const city = new URLSearchParams(location.search).get('city') || 'Boston';
const [courses, geo, replayMeta, goalData, types] = await Promise.all([data.courses(), data.geometry(), data.replay(), data.goals(), data.types()]);
const c = courses.courses.find((x) => x.city === city);
const g = geo.courses.find((x) => x.city === city);
const race = c.race;
document.title = `${race} · Pace Notes`;
initHeader({ chapter: '08 · Where you run', title: race, minutes: 5, steps: $$('[data-track-section^="chapter-"]') });
initMenu((list) => buildRoute(list, { current: 8, compact: true }));
const SECTIONS = courses.sections;
const typical = courses.typical_curve;
const temp = (cdeg) => (getUnits() === 'mi' ? `${Math.round(cdeg * 9 / 5 + 32)} °F` : `${cdeg.toFixed(0)} °C`);
const shortName = city;
const fill = (id, ...kids) => { const el = $(id); el.replaceChildren(...kids); return el; };

// ---------- Hero ----------
const years = c.years;
fill('#c-title', race.replace(/ Marathon$/, ''), h('br'), h('em', {}, 'Marathon'));
const [loY, hiY] = c.slowdown_range_years;
fill('#c-dek', `On average, ${pct(c.slowdown)} of finishes here had a `, h('a', { class: 'term', href: '#' }, 'sustained slowdown'), `: from ${pct(c.slowdown_range[0])} in ${loY} to ${pct(c.slowdown_range[1])} in ${hiY}.`);
function stats() {
  const climb = g ? elev(g.gain_m) : '–';
  fill('#c-stats', ...[['Finishes', int(c.finishes)], ['Editions', `${c.editions}`, `${years[0]}–${years[years.length - 1]}`], ['Median finish', clock(c.median_s)], ['Climb', climb]].map(([k, v, sub]) => h('div', { class: 'c-stat' }, h('dt', {}, k), h('dd', {}, v, sub ? h('small', { style: { display: 'block', font: '600 .6875rem/1.4 var(--mono)', color: 'var(--night-ink-2)', marginTop: '4px', letterSpacing: '.04em' } }, sub) : null))));
}
stats();
$('#c-plan').textContent = `Plan your ${race}`;

// Route map: the supplied route, drawn once.
if (g) {
  const svg = $('#route-map');
  const xs = g.route.map((p) => p[0]); const ys = g.route.map((p) => p[1]);
  const x0 = Math.min(...xs); const y0 = Math.min(...ys); const w = Math.max(...xs) - x0 || 1; const hh = Math.max(...ys) - y0 || 1;
  const pad = 0.08; const vbW = 100; const vbH = Math.max(40, Math.min(110, (hh / w) * 100));
  const k = Math.min((vbW * (1 - 2 * pad)) / w, (vbH * (1 - 2 * pad)) / hh);
  const ox = (vbW - w * k) / 2 - x0 * k; const oy = (vbH - hh * k) / 2 - y0 * k;
  const d = `M${g.route.map(([x, y]) => `${(ox + x * k).toFixed(2)},${(oy + y * k).toFixed(2)}`).join('L')}`;
  svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  const road = s('path', { d, class: 'road road-draw' });
  svg.append(s('path', { d, class: 'halo' }), road);
  const [sx, sy] = g.route[0]; const [fx, fy] = g.route[g.route.length - 1];
  svg.append(s('circle', { cx: ox + sx * k, cy: oy + sy * k, r: 2.2, fill: '#17A673', stroke: '#0E1116', 'stroke-width': 0.8 }));
  const fin = s('g', { transform: `translate(${(ox + fx * k - 2.2).toFixed(2)} ${(oy + fy * k - 2.2).toFixed(2)})` });
  for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) fin.append(s('rect', { x: i * 2.2, y: j * 2.2, width: 2.2, height: 2.2, fill: (i + j) % 2 ? '#0E1116' : '#F5F0E6' }));
  svg.append(fin);
  svg.append(s('text', { x: ox + sx * k, y: oy + sy * k - 4.5, 'text-anchor': 'middle', style: 'font: 600 3.4px var(--mono); fill: var(--night-ink-2); letter-spacing:.1em' }, 'START'), s('text', { x: ox + fx * k, y: oy + fy * k - 4.5, 'text-anchor': 'middle', style: 'font: 600 3.4px var(--mono); fill: var(--gold); letter-spacing:.1em' }, 'FINISH'));
  requestAnimationFrame(() => { const len = road.getTotalLength(); road.style.setProperty('--len', len); if (reduced()) road.classList.remove('road-draw'); });
}

// ---------- At a glance: three nuggets with guards ----------
function sectionElevation(i) {
  if (!g) return null;
  const st = g.elevation_step_km; const e = g.elevation_m;
  const a = Math.round(SECTIONS_KM[i][0] / st); const b = Math.min(e.length - 1, Math.round(SECTIONS_KM[i][1] / st));
  let gain = 0; let loss = 0;
  for (let j = a; j < b; j += 1) { const dd = e[j + 1] - e[j]; if (dd > 0) gain += dd; else loss -= dd; }
  return { net: e[b] - e[a], gain, loss };
}
const SECTIONS_KM = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
function miniBars(vals, hi, { W = 280, H = 56 } = {}) {
  const max = Math.max(...vals.map(Math.abs)); const bw = W / vals.length;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + 14}`, width: '100%', 'aria-hidden': 'true' });
  const Y = scale(-max, max, H, 0);
  vals.forEach((v, i) => svg.append(s('rect', { x: i * bw + 2, y: Math.min(Y(v), Y(0)), width: bw - 4, height: Math.max(1.5, Math.abs(Y(v) - Y(0))), rx: 2, class: i === hi ? 'mark-you' : 'mark-context', opacity: i === hi ? 1 : 0.6 })));
  svg.append(s('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0), class: 'ax-base' }), s('text', { x: hi * bw + bw / 2, y: H + 12, 'text-anchor': 'middle', class: 'ax-tick strong', style: 'font-size:10px' }, `${SECTIONS_KM[hi][0]}–${Math.round(SECTIONS_KM[hi][1])}K`));
  return svg;
}
function miniProfile(highlightTo) {
  const e = g.elevation_m; const W = 280; const H = 56;
  const X = scale(0, e.length - 1, 0, W); const Y = scale(Math.min(...e), Math.min(...e) + 240, H, 0);
  const d = `M${e.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}`;
  const cut = Math.round(highlightTo / g.elevation_step_km);
  const d2 = `M${e.slice(0, cut + 1).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}`;
  return s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', 'aria-hidden': 'true' }, s('path', { d: `${d}L${W},${H}L0,${H}Z`, class: 'mark-context', opacity: 0.25 }), s('path', { d, class: 'line stroke-context' }), s('path', { d: d2, class: 'line stroke-you', 'stroke-width': 3 }));
}
function glance() {
  const box = $('#glance'); box.replaceChildren();
  const card = (kicker, fig, small, claim, ctx, viz) => h('div', { class: 'nugget reveal' }, h('p', { class: 'n-kicker' }, h('b', {}, kicker)), h('div', { class: 'n-fig' }, h('span', { class: 'figure', style: { fontSize: 'clamp(3rem, 14vw, 4.4rem)' } }, fig), small ? h('small', {}, small) : null), h('p', { class: 'n-claim' }, ...claim), h('p', { class: 'n-context' }, ctx), viz ? h('div', { class: 'n-viz' }, viz) : null);
  const first = sectionElevation(0);
  if (first && first.net <= -25) {
    box.append(card('The start', elev(Math.abs(first.net)), 'down', ['The first 5K ', h('em', {}, 'drops'), '.'], `The field ran it ${Math.abs(c.curve[0]).toFixed(1)}% quicker than its own average pace.`, miniProfile(5)));
  } else if (g) {
    const climbs = SECTIONS_KM.map((_, i) => sectionElevation(i).gain); const i = climbs.indexOf(Math.max(...climbs));
    box.append(card('The climb', elev(climbs[i]), 'up', ['The biggest climb is ', h('em', {}, sectionName(i)), '.'], `The field ran that 5K ${c.curve[i].toFixed(1)}% against its own average pace.`, miniBars(climbs, i)));
  }
  const withSlowest = courses.courses.filter((x) => x.slowest_section);
  const late = withSlowest.filter((x) => x.slowest_section === '35–40').length;
  const si = SECTIONS.indexOf(c.slowest_section);
  if (c.slowest_section && c.slowest_section !== '35–40') box.append(card('The late miles', `${c.slowest_section}K`, 'slowest 5K', ['The slowdown peaks ', h('em', {}, 'one 5K early'), '.'], `On ${late} of ${withSlowest.length} courses, the slowest 5K is 35–40K.`, miniBars(c.curve, si)));
  else if (c.slowest_section) box.append(card('The late miles', `${c.slowest_section}K`, 'slowest 5K', ['Like most courses, its slowest 5K is ', h('em', {}, '35–40K'), '.'], `${late} of ${withSlowest.length} courses share it.`, miniBars(c.curve, si)));
  if (c.identified && c.identified.editions >= 3) {
    const row = h('div', { class: 'dots small row', style: { '--dots-max': `${Math.min(10, c.identified.editions) * 24}px`, gridTemplateColumns: `repeat(${Math.min(10, c.identified.editions)}, 1fr)` }, 'aria-hidden': 'true' });
    for (let i = 0; i < c.identified.editions; i += 1) row.append(h('i', { class: i < c.identified.correct ? 'lit-ink' : '' }));
    box.append(card('The fingerprint', `${c.identified.correct} of ${c.identified.editions}`, 'named', ['From its pacing shape alone, ', h('em', {}, c.identified.correct === c.identified.editions ? 'every' : `${c.identified.correct}`), ` ${shortName} edition was named correctly.`], `Across all courses, ${pct(courses.identification.correct / courses.identification.editions_tested)} were.`, row));
  }
  initReveals();
}
glance();

// ---------- Replay on the route ----------
{
  const ed = replayMeta.editions.find((e) => e.city === city);
  const sec = $('#replay');
  if (!ed || !g) sec.hidden = true;
  else {
    const rows = (await loadJSON(`data/${ed.file}`)).rows;
    const root = $('.course-replay');
    $('[data-hud="race"]', root).textContent = `${ed.city} ${ed.year}`;
    const xs = g.route.map((p) => p[0]); const ys = g.route.map((p) => p[1]);
    const aspect = (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs) || 1);
    const share20 = ed.moments.not_past_20_at_first / ed.finishes;
    createReplay(root, {
      rows, variant: 'route', route: { points: g.route, km: g.route_km }, start: 40 * 60, speed: 480,
      height: (w) => Math.round(Math.max(300, Math.min(560, (w - 40) * aspect + 150))),
      pad: { top: 70, bottom: 26, left: 22, right: 22 }, labels: false,
      onFrame: (f) => { $('[data-hud="clock"]', root).textContent = clock(f.t); $('[data-hud="done"]', root).textContent = pct(f.done); $('[data-hud="slow"]', root).textContent = pct(f.slow); },
      moments: [{ t: ed.moments.first_finish_s, hold: 1500, show: (flag) => flag.replaceChildren(h('b', {}, clock(ed.moments.first_finish_s)), ' First finish. ', h('b', {}, pct(share20)), ' of the field had not reached 20K.') }],
    });
    $('#replay-title').replaceChildren(`${int(ed.finishes)} finishes, `, h('em', {}, 'one race clock'));
  }
}

// ---------- Pacing: the fingerprint ----------
{
  const host = $('#pacing-chart'); const readout = $('#pacing-readout');
  const sig = SECTIONS.indexOf(c.signature_section);
  let sel = sig >= 0 ? sig : 0;
  $('#pacing-l1').textContent = shortName;
  const quick = c.signature_points < 0;
  fill('#pacing-title', `${shortName}'s most distinctive 5K is `, h('em', {}, `${c.signature_section}K`));
  const read = () => {
    const v = c.curve[sel]; const t = typical[sel]; const dpts = v - t;
    readout.replaceChildren(h('span', { class: 'figure' }, `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`), h('p', {}, h('strong', {}, `${sectionName(sel)}`), ` against the field's own average pace${v > 0 ? ' (slower)' : ' (quicker)'}. The typical course: ${t > 0 ? '+' : '−'}${Math.abs(t).toFixed(1)}%, so ${Math.abs(dpts).toFixed(1)} points ${dpts < 0 ? 'quicker' : 'slower'} here.`));
  };
  const draw = () => {
    host.replaceChildren();
    const W = host.clientWidth; const H = 230; const top = 20; const bottom = 26;
    const vals = [...c.curve, ...typical];
    const X = (i) => 14 + (i * (W - 28)) / 8; const Y = scale(Math.min(-8, ...vals) - 1, Math.max(10, ...vals) + 1.5, H - bottom, top);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${shortName} pace by 5K section against the field's own average, with the typical course.` });
    svg.append(s('rect', { x: X(sel) - (W - 28) / 16, y: top - 6, width: (W - 28) / 8, height: H - bottom - top + 6, rx: 8, fill: 'var(--paper-2)' }));
    [-5, 0, 5, 10].forEach((v) => svg.append(s('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: v === 0 ? 'ax-base' : 'ax-grid', style: v === 0 ? 'stroke: var(--fg-3)' : '' })));
    const dOf = (arr) => `M${arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}`;
    svg.append(s('path', { d: dOf(typical), class: 'line stroke-context', 'stroke-width': 2.25 }), s('path', { d: dOf(c.curve), class: 'line stroke-ink', 'stroke-width': 2.5 }));
    c.curve.forEach((v, i) => svg.append(s('circle', { cx: X(i), cy: Y(v), r: i === sel ? 6 : 4, class: `${i === sel ? 'mark-you' : 'mark-ink'} ring` })));
    [-5, 0, 5, 10].forEach((v) => svg.append(s('text', { x: 0, y: Y(v) - 5, class: 'ax-tick lab-halo' }, v === 0 ? 'own average pace' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`)));
    [0, 2, 4, 6, 8].forEach((i) => svg.append(s('text', { x: X(i), y: H - 6, 'text-anchor': 'middle', class: 'ax-tick' }, i === 8 ? 'Last 2.2K' : `${SECTIONS_KM[i][0]}–${SECTIONS_KM[i][1]}K`)));
    SECTIONS.forEach((_, i) => { const hit = s('rect', { x: X(i) - (W - 28) / 16, y: 0, width: (W - 28) / 8, height: H, class: 'hit' }); hit.addEventListener('click', () => { sel = i; read(); draw(); }); svg.append(hit); });
    host.append(svg);
  };
  read(); onResize(host, draw);
  // Pacing types: one stacked bar, types colours only.
  const COLOURS = ['#17A673', '#2F5BFF', '#F4B23E', '#7A4DFF', '#E2416B', '#FF5B2E'];
  const t = types.courses.find((x) => x.city === city);
  if (t) {
    const bar = h('div', { style: { display: 'flex', gap: '2px', height: '22px', borderRadius: '6px', overflow: 'hidden' } });
    t.shares.forEach((v, i) => bar.append(h('i', { style: { flexGrow: String(v), background: COLOURS[i] }, title: `${types.archetypes[i].name} ${pct(v)}` })));
    const top = t.shares.indexOf(Math.max(...t.shares));
    const list = h('div', { class: 'types-list' }, h('span', { class: 'tl-head' }), h('span', { class: 'tl-head' }, shortName), h('span', { class: 'tl-head' }, 'All courses'),
      ...t.shares.flatMap((v, i) => [h('span', { class: 'tl-name' }, h('i', { style: { background: COLOURS[i] } }), types.archetypes[i].name), h('b', { class: i === top ? 'is-top' : '' }, pct(v)), h('span', { class: 'tl-all' }, pct(types.archetypes[i].share))]));
    $('#types').append(bar, list);
  }
}

// ---------- Elevation on one shared height scale, with the field's pace per 5K under it ----------
function divergingFill(v) {
  const t = Math.max(-1, Math.min(1, v / 8));
  const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const neutral = [231, 223, 208]; const blue = [47, 91, 255]; const orange = [232, 74, 28];
  const rgb = t < 0 ? mix(neutral, blue, -t) : mix(neutral, orange, t);
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return { fill: `rgb(${rgb.join(',')})`, text: lum < 0.55 ? '#FFFDF8' : '#15171C' };
}
if (g) {
  const host = $('#elev-chart'); const readout = $('#elev-readout');
  const secs = SECTIONS_KM.map((_, i) => sectionElevation(i));
  const climbI = secs.map((x) => x.gain).indexOf(Math.max(...secs.map((x) => x.gain)));
  let sel = climbI;
  fill('#elev-title', 'The biggest climb is ', h('em', {}, sectionName(climbI)), '.');
  const read = () => {
    const x = secs[sel]; const v = c.curve[sel];
    readout.replaceChildren(h('span', { class: 'figure' }, elev(x.gain, { signed: false })), h('p', {}, h('strong', {}, `of climbing in ${sectionName(sel)}`), `, ${elev(x.loss)} down. The field ran it ${Math.abs(v).toFixed(1)}% ${v > 0 ? 'slower' : 'quicker'} than its own average pace.`));
  };
  const draw = () => {
    host.replaceChildren();
    const W = host.clientWidth; const H = 250; const top = 18; const profH = 150; const blockY = top + profH + 18; const blockH = 30;
    const e = g.elevation_m; const minE = Math.min(...e);
    const X = scale(0, 42.195, 0, W); const Y = scale(minE - 4, minE + 240, top + profH, top);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Elevation of the ${race} route, with the field's pace in each 5K section.` });
    const pts = e.map((v, i) => [X(Math.min(42.195, i * g.elevation_step_km)), Y(v)]);
    const d = `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}`;
    svg.append(s('rect', { x: X(SECTIONS_KM[sel][0]), y: top - 6, width: X(SECTIONS_KM[sel][1]) - X(SECTIONS_KM[sel][0]), height: profH + 6 + 18 + blockH + 6, rx: 8, fill: 'var(--paper-2)' }));
    [0, 100, 200].forEach((v) => { const y = Y(minE + v); svg.append(s('line', { x1: 0, x2: W, y1: y, y2: y, class: 'ax-grid' }), s('text', { x: 0, y: y - 5, class: 'ax-tick' }, v === 0 ? 'lowest point' : `+${elev(v)}`)); });
    svg.append(s('path', { d: `${d}L${W},${top + profH}L0,${top + profH}Z`, class: 'mark-ink', opacity: 0.07 }), s('path', { d, class: 'line stroke-ink', 'stroke-width': 2 }));
    SECTIONS_KM.forEach(([a, b], i) => {
      const x = X(a) + 1; const w = X(b) - X(a) - 2; const col = divergingFill(c.curve[i]);
      svg.append(s('rect', { x, y: blockY, width: w, height: blockH, rx: 4, fill: col.fill, stroke: i === sel ? 'var(--fg)' : 'none', 'stroke-width': 2 }));
      const label = `${c.curve[i] > 0 ? '+' : '−'}${Math.abs(c.curve[i]).toFixed(0)}%`;
      if (w > 30) svg.append(s('text', { x: x + w / 2, y: blockY + 19, 'text-anchor': 'middle', style: `font: 650 11px var(--mono); fill: ${col.text}` }, label));
      const hit = s('rect', { x: X(a), y: 0, width: X(b) - X(a), height: H, class: 'hit' }); hit.addEventListener('click', () => { sel = i; read(); draw(); }); svg.append(hit);
    });
    svg.append(s('text', { x: 0, y: blockY - 5, class: 'ax-tick' }, 'Pace vs own average, each 5K'));
    const u = getUnits();
    const marks = u === 'mi' ? [0, 5, 10, 15, 20, 25] : [0, 10, 20, 30, 40];
    marks.forEach((m) => { const km = u === 'mi' ? m * KM_PER_MI : m; svg.append(s('text', { x: X(km), y: H - 4, 'text-anchor': m === 0 ? 'start' : 'middle', class: 'ax-tick' }, m === 0 ? 'Start' : `${m} ${u}`)); });
    host.append(svg);
  };
  read(); onResize(host, draw); onUnits(() => { read(); draw(); });
} else $('#elevation').hidden = true;

// ---------- Year by year ----------
{
  const cells = courses.years.cells.filter((x) => x.city === city).sort((a, b) => a.year - b.year);
  const host = $('#years-chart'); const readout = $('#years-readout');
  const hiC = argmax(cells, (x) => x.slowdown); const loC = argmin(cells, (x) => x.slowdown);
  fill('#years-title', 'Sustained slowdowns ran from ', h('em', {}, pct(loC.slowdown)), ` in ${loC.year} to `, h('em', {}, pct(hiC.slowdown)), ` in ${hiC.year}.`);
  let sel = hiC;
  const read = () => readout.replaceChildren(h('span', { class: 'figure' }, pct(sel.slowdown)), h('p', {}, h('strong', {}, `${sel.year}:`), ` had a sustained slowdown. Median finish ${clock(sel.median_s)}, ${temp(sel.temp)} at the start, ${int(sel.n)} finishes.`));
  const draw = () => {
    host.replaceChildren();
    const first = cells[0].year; const last = cells[cells.length - 1].year; const span = last - first + 1;
    const W = host.clientWidth; const colW = W / span; const H = 250; const barTop = 34; const barH = 120; const medTop = barTop + barH + 34; const medH = 34;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Sustained slowdown share and median finish for each ${race} edition.` });
    const maxS = Math.max(...cells.map((x) => x.slowdown)) * 1.1;
    const medLo = Math.min(...cells.map((x) => x.median_s)); const medHi = Math.max(...cells.map((x) => x.median_s));
    const My = scale(medLo, medHi, medTop + medH, medTop);
    svg.append(s('text', { x: 0, y: 12, class: 'ax-label' }, 'Sustained slowdown'), s('text', { x: 0, y: medTop - 12, class: 'ax-label' }, 'Median finish'));
    let prev = null;
    for (let y = first; y <= last; y += 1) {
      const x = (y - first) * colW; const cell = cells.find((q) => q.year === y);
      if (!cell) { svg.append(s('text', { x: x + colW / 2, y: barTop + barH - 4, 'text-anchor': 'middle', class: 'ax-tick', style: 'font-size:10px' }, '–')); prev = null; svg.append(s('text', { x: x + colW / 2, y: H - 4, 'text-anchor': 'middle', class: 'ax-tick', style: 'opacity:.5' }, colW < 34 ? `’${String(y).slice(2)}` : String(y))); continue; }
      const bh = (cell.slowdown / maxS) * barH; const isSel = cell === sel;
      const bw = Math.min(24, colW - 6);
      svg.append(s('rect', { x: x + (colW - bw) / 2, y: barTop + barH - bh, width: bw, height: bh, rx: 4, class: isSel ? 'mark-you' : 'mark-context', opacity: isSel ? 1 : 0.75 }));
      if (cell === hiC || cell === loC || isSel) svg.append(s('text', { x: x + colW / 2, y: barTop + barH - bh - 6, 'text-anchor': 'middle', class: 'ax-tick strong' }, pct(cell.slowdown)));
      const my = My(cell.median_s);
      if (prev) svg.append(s('line', { x1: prev[0], y1: prev[1], x2: x + colW / 2, y2: my, class: 'stroke-ink', 'stroke-width': 2 }));
      svg.append(s('circle', { cx: x + colW / 2, cy: my, r: isSel ? 5.5 : 4, class: `${isSel ? 'mark-you' : 'mark-ink'} ring` }));
      prev = [x + colW / 2, my];
      svg.append(s('text', { x: x + colW / 2, y: H - 4, 'text-anchor': 'middle', class: `ax-tick${isSel ? ' strong' : ''}` }, colW < 34 ? `’${String(y).slice(2)}` : String(y)));
      const hit = s('rect', { x, y: 0, width: colW, height: H, class: 'hit' }); hit.addEventListener('click', () => { sel = cell; read(); draw(); }); svg.append(hit);
    }
    const fastest = argmin(cells, (q) => q.median_s);
    svg.append(s('text', { x: W, y: medTop - 12, 'text-anchor': 'end', class: 'ax-tick' }, `${hm(Math.round(medLo / 60))}–${hm(Math.round(medHi / 60))}`));
    host.append(svg);
    void fastest;
  };
  read(); onResize(host, draw); onUnits(read);
  $('#years-table').append(h('thead', {}, h('tr', {}, h('th', {}, 'Year'), h('th', {}, 'Finishes'), h('th', {}, 'Median'), h('th', {}, 'Slowdown'), h('th', {}, 'Start'))), h('tbody', {}, ...cells.map((q) => h('tr', {}, h('td', {}, String(q.year)), h('td', {}, int(q.n)), h('td', {}, clock(q.median_s)), h('td', {}, pct(q.slowdown)), h('td', {}, temp(q.temp))))));
}

// ---------- Weather: the warm year and the cool year (shown only when at least 5 °C apart) ----------
{
  const hc = courses.weather.hot_cool.find((x) => x.city === city);
  const box = $('#weather-cards');
  if (!hc || hc.hot.temp - hc.cool.temp < 5) $('#weather').hidden = true;
  else {
    const warmerMore = hc.hot.slowdown > hc.cool.slowdown;
    fill('#weather-title', ...(warmerMore ? ['In the warmer year, ', h('em', {}, 'more'), ' finishes had a sustained slowdown.'] : ['The warm year and the cool year']));
    const card = (label, e, cls) => {
      const th = Math.max(0.08, Math.min(1, (e.temp + 5) / 30));
      return h('div', { class: `nugget${cls === 'hot' ? ' on-night' : ''}` },
        h('p', { class: 'n-kicker' }, h('b', {}, label), String(e.year)),
        h('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-end' } },
          h('div', { 'aria-hidden': 'true', style: { width: '14px', height: '86px', borderRadius: '8px', background: 'var(--mark-soft)', position: 'relative', overflow: 'hidden', flex: 'none' } }, h('i', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: `${th * 100}%`, background: cls === 'hot' ? 'var(--mark-you)' : 'var(--mark-faster)', borderRadius: '8px' } })),
          h('div', {}, h('span', { class: 'figure figure-m' }, pct(e.slowdown)), h('p', { class: 'n-context', style: { marginTop: '8px' } }, `had a sustained slowdown. ${temp(e.temp)} at the start; median finish ${clock(e.median_s)}.`))));
    };
    const paint = () => box.replaceChildren(card('Cool year', hc.cool, 'cool'), card('Warm year', hc.hot, 'hot'));
    paint(); onUnits(paint);
  }
}

// ---------- Goal times ----------
{
  const rows = goalData.rows.filter((r) => r.city === city);
  const goals = [180, 210, 240, 270, 300].filter((m) => rows.some((r) => r.goal === m));
  let cur = goals.includes(240) ? 240 : goals[0];
  const chips = $('#goal-chips'); const dots = $('#goal-dots'); const readout = $('#goal-readout');
  for (let i = 0; i < 100; i += 1) dots.append(h('i', { style: { '--i': String(i % 10 + Math.floor(i / 10)) } }));
  goals.forEach((m) => chips.append(h('button', { type: 'button', class: 'chip mono', 'aria-pressed': String(m === cur), 'data-m': m }, hm(m))));
  const pooled = (m) => { const rs = goalData.rows.filter((r) => r.goal === m); const n = rs.reduce((a, r) => a + r.n, 0); return { under: rs.reduce((a, r) => a + r.n * r.under, 0) / n, courses: new Set(rs.map((r) => r.city)).size }; };
  const paint = () => {
    const r = rows.find((x) => x.goal === cur); const all = pooled(cur);
    const u = Math.round(r.under * 100); const sd = Math.round(r.sd * 100);
    $$('i', dots).forEach((d, i) => { d.className = i < u ? 'lit-ink' : i >= 100 - sd ? 'lit' : ''; });
    readout.replaceChildren(h('span', { class: 'figure' }, `${u}`, h('span', { class: 'unit' }, ' in 100')), h('p', { style: { marginTop: '8px' } }, h('strong', {}, `made ${hm(cur)}`), ` after running ${hm(cur)} pace through 20K here. ${sd} had a sustained slowdown. Across ${all.courses} courses: ${Math.round(all.under * 100)} in 100 made it.`));
    $('#goal-link').textContent = `Plan a ${hm(cur)} ${race} →`;
    $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.m) === cur)));
  };
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cur = Number(b.dataset.m); paint(); });
  paint();
  // The table twin; its row headers are the planner links the course-page checks look for.
  $('#goals-table').append(h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Goal'), h('th', { scope: 'col' }, 'Finishes'), h('th', { scope: 'col' }, 'Made it'), h('th', { scope: 'col' }, 'Sustained slowdown'), h('th', { scope: 'col' }, 'Median finish'))),
    h('tbody', {}, ...goals.map((m) => { const r = rows.find((x) => x.goal === m); return h('tr', {}, h('th', { scope: 'row' }, h('a', { href: '#' }, `Plan a ${hm(m)} ${race}`)), h('td', {}, int(r.n)), h('td', {}, pct(r.under)), h('td', {}, pct(r.sd)), h('td', {}, clock(r.fin[1]))); })));
  fill('#plan-title', 'Plan your ', h('em', {}, race));
}

// ---------- Courses that pace the same way (nearest pacing fingerprints, no ranking words) ----------
{
  const others = courses.courses.filter((x) => x.city !== city && x.deviation && x.shape_editions >= 3);
  const dist2 = (a, b) => a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0);
  const near = others.map((x) => ({ x, d: dist2(x.deviation, c.deviation) })).sort((a, b) => a.d - b.d).slice(0, 3);
  fill('#shape-title', `Courses that pace like ${shortName}`);
  $('#same-shape').before(h('div', { class: 'legend', style: { marginTop: '10px' } }, h('span', {}, h('i', { class: 'line', style: { background: 'var(--fg)' } }), 'That course'), h('span', {}, h('i', { class: 'line', style: { background: 'var(--mark-context)' } }), shortName)));
  const box = $('#same-shape');
  near.forEach(({ x }) => {
    const W = 120; const H = 40; const vals = [...x.curve, ...c.curve];
    const X = (i) => 4 + (i * (W - 8)) / 8; const Y = scale(Math.min(...vals), Math.max(...vals), H - 4, 4);
    const dOf = (arr) => `M${arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}`;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, s('path', { d: dOf(c.curve), class: 'line stroke-context', 'stroke-width': 2 }), s('path', { d: dOf(x.curve), class: 'line stroke-ink', 'stroke-width': 2 }));
    box.append(h('a', { href: `course-boston.html?city=${encodeURIComponent(x.city)}` }, h('span', {}, h('b', {}, x.race), h('small', {}, `Slowest 5K: ${x.slowest_section}K · ${pct(x.slowdown)} sustained slowdown`)), svg));
  });
}
onUnits(() => { stats(); glance(); });
