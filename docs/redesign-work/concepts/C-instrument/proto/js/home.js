import { mountChrome, renderLaps, fillLapReadings, U, $, $$, pct, approxWords, fmtHM, pixelRunner, deckDots, setText } from './core.js';
import { load, loadAll, scale, slowdownRate, onsetLate, lapReadings, tallestTower, bank, fmtGap } from './nuggets.js';
import { h, lin, dial, lightDial, responsive, crisp } from './charts.js';
import { mountReplay } from './replay.js';

mountChrome({ lap: null });

/* --- units-dependent hero text --- */
const marathon = $('[data-marathon]');
const paintUnits = () => setText(marathon, U.marathon());
paintUnits(); U.on(paintUnits);

/* --- keypad: a dot or comma just typed becomes a colon on touch keyboards --- */
const goal = $('#home-plan-goal');
goal.addEventListener('input', e => {
  if (!matchMedia('(pointer: coarse)').matches) return;
  if (e.inputType === 'insertText' && (e.data === '.' || e.data === ',')) {
    const p = goal.selectionStart; goal.value = goal.value.slice(0, p - 1) + ':' + goal.value.slice(p); goal.setSelectionRange(p, p);
  }
});

/* --- data --- */
const [man, study, ft, kick, cg, rp] = await loadAll(['manifest', 'study-evidence', 'finish-times', 'kick', 'course-goal', 'replay']);
const sc = scale(man);
$('[data-scale-label]').innerHTML = `Pace Notes<span class="dot"></span>${sc.cities} city marathons<span class="dot"></span>${sc.yearMin}–${sc.yearMax}`;
$('[data-finishes-m]').textContent = `${sc.finishesM} million`;
$('[data-courses]').insertAdjacentHTML('beforeend', cg.courses.map(c => `<option value="${c.slug}">${c.city}</option>`).join(''));

/* --- hero replay (Berlin 2024, the default today) --- */
const ed = rp.editions.find(e => e.slug === 'berlin-2024');
load('replay/berlin-2024').then(file => mountReplay($('[data-replay]'), { file, edition: ed, mode: 'straight', start: Math.round(ed.first_finish_s * 0.92) }));

/* --- stakes: the one reading --- */
const sd = slowdownRate(study), on = onsetLate(study);
const dialHost = $('[data-dial]');
dial(dialHost, { share: sd.share });
lightDial(dialHost);
$('[data-sd-figure]').innerHTML = `${Math.round(sd.share * 100)}<span class="u">%</span>`;
const w = approxWords(sd.share);
$('[data-sd-sentence]').innerHTML = `${cap(w.q)} <em>${w.bare}</em> finishes had a <a class="term" href="#methodology-sustained-slowdown">sustained slowdown</a>.`;
const ow = approxWords(on.share);
$('[data-onset-key]').innerHTML = `${cap(ow.q)} ${ow.bare} of them began at the 30K mat or later.`;
onsetBar($('[data-onset]'), on.rows);

function onsetBar(host, rows) {
  const total = rows.reduce((a, r) => a + r.episodes, 0);
  responsive(host, W => {
    const H = 58, svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    let x = 0;
    rows.forEach((r, i) => {
      const w = r.episodes / total * W, late = r.label >= 30;
      svg.append(h('rect', { x: x + (i ? 1 : 0), y: 8, width: Math.max(0, w - (i ? 2 : 1)), height: 14, rx: 3, fill: late ? 'var(--signal)' : 'var(--fill-quiet)' }));
      svg.append(h('text', { x: x + (i ? 2 : 0), y: 40, style: 'font:500 11px var(--mono);fill:var(--ink-3)' }, `${r.label}K`));
      svg.append(h('text', { x: x + (i ? 2 : 0), y: 55, style: `font:600 12px var(--sans);fill:${late ? 'var(--accent-ink)' : 'var(--ink-2)'}` }, pct(r.episodes / total)));
      x += w;
    });
    return svg;
  });
}

/* --- guide: the lap list with readings --- */
const ol = $('[data-laps]');
renderLaps(ol, -1);
lapReadings().then(fillLapReadings);
$('[data-step1]').textContent = `Any course in the notes, any goal from ${fmtHM(cg.goals[0] * 60)} to ${fmtHM(cg.goals[1] * 60)}.`;

/* --- long-read cards: each carries its signature chart, drawn from data --- */
const tt = tallestTower(ft);
$('[data-story-towers]').innerHTML = `${tt.count.toLocaleString('en-US')} finishes landed in the ${tt.before} minute: <b style="color:var(--ink)">${tt.ratio.toFixed(2)}×</b> what a smooth curve expects.`;
towersMini($('[data-viz="towers"]'), ft, tt);
const bk = bank(kick);
$('[data-story-bank]').innerHTML = `A first 5K over 10% fast banked ${fmtGap(bk.open).slice(1)}, then finished <b style="color:var(--ink)">${fmtGap(bk.finish).slice(1)} behind</b>.`;
bankMini($('[data-viz="bank"]'), bk);
loadAll(['courses', 'course-geometry']).then(([co, geo]) => {
  const b = co.courses.find(c => c.city === 'Boston'), g = geo.courses.find(c => c.city === 'Boston');
  $('[data-story-boston]').innerHTML = `Named from its pacing shape alone in <b style="color:var(--ink)">${b.identified.correct} of ${b.identified.editions}</b> editions.`;
  routeMini($('[data-viz="boston"]'), g, b.signature_section);
});
deckDots($('[data-story-deck]'), $('[data-story-dots]'));

function towersMini(host, ft, tt) {
  responsive(host, W => {
    const H = host.clientHeight || 132, lo = 150, hi = 330;
    const hs = ft.histogram.filter(d => d.minute >= lo && d.minute < hi);
    const max = Math.max(...hs.map(d => d.all));
    const x = lin(lo, hi, 12, W - 12), y = lin(0, max, H - 22, 14), bw = (W - 24) / (hi - lo);
    const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    hs.forEach(d => {
      const isMark = ft.marks.some(m => m.minutes - 1 === d.minute);
      const top = d.minute === tt.mark.minutes - 1;
      svg.append(h('rect', { x: x(d.minute), y: y(d.all), width: Math.max(0.8, bw - 0.6), height: H - 22 - y(d.all), fill: top ? 'var(--signal)' : isMark ? 'var(--ink-2)' : 'var(--fill-quiet)' }));
    });
    svg.append(h('line', { x1: 12, x2: W - 12, y1: crisp(H - 22), y2: crisp(H - 22), stroke: 'var(--rule-strong)' }));
    [180, 240, 300].forEach(m => svg.append(h('text', { x: x(m), y: H - 7, 'text-anchor': 'middle', style: 'font:500 10px var(--mono);fill:var(--ink-3)' }, fmtHM(m * 60))));
    return svg;
  });
}
function bankMini(host, bk) {
  responsive(host, W => {
    const H = host.clientHeight || 132, z = W * 0.42, s = (W - z - 46) / Math.max(bk.after20, bk.finish);
    const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const rows = [['Banked by 5K', bk.open, 'var(--ink)'], ['After 20K', bk.after20, 'var(--mark-quiet)'], ['At the finish', bk.finish, 'var(--signal)']];
    const top = (H - 3 * 36) / 2 + 4;
    svg.append(h('line', { x1: crisp(z), x2: crisp(z), y1: top - 6, y2: top + 3 * 36 - 6, stroke: 'var(--ink)', 'stroke-opacity': .45 }));
    rows.forEach(([k, v, c], i) => {
      const yy = top + i * 36, x0 = v < 0 ? z + v * s : z, wv = Math.abs(v * s);
      svg.append(h('text', { x: v < 0 ? z + 6 : 14, y: yy + 2, style: 'font:500 9.5px var(--mono);fill:var(--ink-3);letter-spacing:.06em' }, k.toUpperCase()));
      svg.append(h('rect', { x: x0, y: yy + 8, width: wv, height: 10, rx: 3, fill: c }));
      svg.append(h('text', { x: v < 0 ? x0 - 6 : x0 + wv + 6, y: yy + 17, 'text-anchor': v < 0 ? 'end' : 'start', style: `font:600 11.5px var(--sans);fill:${i === 2 ? 'var(--accent-ink)' : 'var(--ink-2)'}` }, fmtGap(v)));
    });
    return svg;
  });
}
function routeMini(host, g, section) {
  responsive(host, W => {
    const H = host.clientHeight || 132, xs = g.route.map(p => p[0]), ys = g.route.map(p => p[1]);
    const s = Math.min((W - 40) / (Math.max(...xs) - Math.min(...xs)), (H - 30) / (Math.max(...ys) - Math.min(...ys)));
    const ox = (W - (Math.max(...xs) - Math.min(...xs)) * s) / 2, oy = (H - (Math.max(...ys) - Math.min(...ys)) * s) / 2;
    const pts = g.route.map(p => [ox + (p[0] - Math.min(...xs)) * s, oy + (p[1] - Math.min(...ys)) * s]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    const svg = h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    svg.append(h('path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // the course's signature section (from data) traced in the accent
    const [s0, s1] = section.split('–').map(Number);
    const tot = g.route_km[g.route_km.length - 1], a = s0 / 42.195 * tot, b = s1 / 42.195 * tot;
    const seg = pts.filter((p, i) => g.route_km[i] >= a && g.route_km[i] <= b);
    if (seg.length > 1) svg.append(h('path', { d: seg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(''), fill: 'none', stroke: 'var(--signal)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    svg.append(h('circle', { cx: pts[0][0], cy: pts[0][1], r: 3.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    svg.append(h('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 3.5, fill: 'var(--ink)' }));
    return svg;
  });
}

/* --- cta runner --- */
$('[data-runner]').innerHTML = pixelRunner('run');

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
