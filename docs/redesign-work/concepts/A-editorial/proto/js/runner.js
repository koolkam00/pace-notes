// The geometric runner (ported from lib/art/gait.ts) and a lane of runners moving at speeds
// proportional to real finish times. The lane settles after 30 s and never moves under reduced motion.
import { s, reduced } from './core.js';

function periodic(keys) {
  const n = keys.length;
  const at = (j) => { const m = ((j % n) + n) % n; const wrap = Math.floor(j / n); return [keys[m][0] + wrap, keys[m][1]]; };
  return (raw) => {
    const t = ((raw % 1) + 1) % 1; let i = 0;
    while (i < n - 1 && keys[i + 1][0] <= t) i += 1;
    const p0 = at(i - 1); const p1 = at(i); const p2 = at(i + 1); const p3 = at(i + 2);
    const span = p2[0] - p1[0]; const u = (t - p1[0]) / span;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * span; const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * span;
    const u2 = u * u; const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
}
const HIP = periodic([[0, 24], [0.18, 6], [0.4, -22], [0.62, 14], [0.82, 36], [0.92, 30]]);
const KNEE = periodic([[0, 14], [0.14, 38], [0.4, 16], [0.6, 112], [0.8, 70], [0.93, 22]]);
const SHOULDER = periodic([[0, -30], [0.25, 0], [0.5, 32], [0.75, 0]]);
const ELBOW = periodic([[0, 70], [0.25, 88], [0.5, 104], [0.75, 88]]);
const BOUNCE = periodic([[0, 1.5], [0.15, 3.2], [0.4, -1.5], [0.5, 1.5], [0.65, 3.2], [0.9, -1.5]]);
const step = ([x, y], a, l) => { const r = (a * Math.PI) / 180; return [x + l * Math.sin(r), y + l * Math.cos(r)]; };
const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const ch = (sh) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * (1 - amt)))); return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`; }

export function pose(t, effort = 0) {
  const lean = 12 + effort * 8; const stride = 1 - effort * 0.35; const bounce = BOUNCE(t) * (1 - effort * 0.5);
  const hip = [46, 56 + bounce + effort * 2]; const shoulder = step(hip, 180 - lean, 28); const head = step(shoulder, 180 - lean + 6, 12);
  const leg = (p) => { const th = HIP(p) * stride + effort * 4; const kn = th - KNEE(p) * (0.75 + 0.25 * stride); const k = step(hip, th, 21); const a = step(k, kn, 21); return { pts: [hip, k, a, step(a, kn + 100, 7)], th }; };
  const arm = (p) => { const up = SHOULDER(p) * stride - effort * 6; const fo = up + ELBOW(p) - effort * 10; const e = step(shoulder, up, 14); return [shoulder, e, step(e, fo, 13)]; };
  const near = leg(t); const far = leg(t + 0.5);
  const mid = [(hip[0] + shoulder[0]) / 2, (hip[1] + shoulder[1]) / 2];
  return { hip, shoulder, head, near: near.pts, far: far.pts, nearArm: arm(t + 0.5), farArm: arm(t), nearShorts: [hip, step(hip, near.th, 7.5)], farShorts: [hip, step(hip, far.th, 7.5)], bib: { x: mid[0], y: mid[1], a: lean }, shadow: 16 - bounce };
}

export const SKIN = ['#2B1D14', '#5A3825', '#8D5524', '#C68642', '#E0AC69', '#F1C27D'];
export const KIT = ['#FF5B2E', '#2F5BFF', '#F4B23E', '#17A673', '#E2416B', '#7A4DFF', '#0FA3A3'];

/** Update (or create) one runner group in place. */
export function runnerGroup(g, t, { kit = '#FF5B2E', shorts = '#1E2A4A', skin = '#2B2A33', effort = 0 } = {}) {
  const p = pose(t, effort);
  if (!g.firstChild) {
    g.append(
      s('ellipse', { cx: 50, cy: 104, rx: 16, ry: 2.2, fill: 'currentColor', opacity: 0.14 }),
      s('path', { 'data-k': 'farArm', stroke: shade(skin, 0.35), 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { 'data-k': 'far', stroke: shade(skin, 0.35), 'stroke-width': 7.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { 'data-k': 'farShorts', stroke: shade(shorts, 0.3), 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' }),
      s('path', { 'data-k': 'torso', stroke: kit, 'stroke-width': 13, fill: 'none', 'stroke-linecap': 'round' }),
      s('path', { 'data-k': 'near', stroke: skin, 'stroke-width': 7.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { 'data-k': 'nearShorts', stroke: shorts, 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' }),
      s('path', { 'data-k': 'nearArm', stroke: skin, 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('circle', { 'data-k': 'head', r: 7.2, fill: skin }),
      s('rect', { 'data-k': 'bib', width: 7, height: 6, rx: 1, fill: '#FFFDF8' }),
    );
  }
  const k = (name) => g.querySelector(`[data-k="${name}"]`);
  k('farArm').setAttribute('d', poly(p.farArm)); k('far').setAttribute('d', poly(p.far)); k('farShorts').setAttribute('d', poly(p.farShorts));
  k('torso').setAttribute('d', poly([p.hip, p.shoulder])); k('near').setAttribute('d', poly(p.near)); k('nearShorts').setAttribute('d', poly(p.nearShorts));
  k('nearArm').setAttribute('d', poly(p.nearArm));
  k('head').setAttribute('cx', p.head[0].toFixed(1)); k('head').setAttribute('cy', p.head[1].toFixed(1));
  const b = k('bib'); b.setAttribute('x', (p.bib.x - 3.5).toFixed(1)); b.setAttribute('y', (p.bib.y - 4).toFixed(1)); b.setAttribute('transform', `rotate(${p.bib.a} ${p.bib.x.toFixed(1)} ${p.bib.y.toFixed(1)})`);
}

/** A lane of runners; each crosses at a speed proportional to 1 / finish time, carrying a time chip. */
export function runnerLane(el, runners, { height = 110, crossing = 18, night = true } = {}) {
  const svg = s('svg', { 'aria-hidden': 'true', class: 'lane', height });
  el.append(svg);
  const line = s('line', { y1: height - 8, y2: height - 8, x1: 0, stroke: night ? '#2A303B' : '#C9BFAB', 'stroke-dasharray': '6 8' });
  svg.append(line);
  const size = Math.min(76, height * 0.62);
  const items = runners.map((r, i) => {
    const wrap = s('g', { style: `color:${night ? '#000' : '#15171C'}` });
    const body = s('g', { transform: `scale(${size / 100})` });
    wrap.append(body);
    if (r.label) {
      const chip = s('g', { transform: `translate(${size * 0.46} -6)` },
        s('rect', { x: -26, y: -19, width: 52, height: 20, rx: 10, fill: night ? '#232935' : '#FFFDF8', stroke: night ? '#3A4150' : '#DCD3C2' }),
        s('text', { x: 0, y: -5, 'text-anchor': 'middle', style: `font:600 11px var(--mono);fill:${night ? '#F5F0E6' : '#15171C'}` }, r.label));
      wrap.append(chip);
    }
    svg.append(wrap);
    return { r, wrap, body, kit: r.kit || KIT[i % KIT.length], skin: r.skin || SKIN[(i * 2 + 1) % SKIN.length] };
  });
  let W = el.clientWidth; let t0 = performance.now(); let raf = 0; let running = false;
  const frame = (now) => {
    const time = (now - t0) / 1000;
    const span = W + size * 2;
    items.forEach((it, i) => {
      const speed = 240 / it.r.finishMinutes;
      const x = (((time * speed * span) / crossing + (i * span) / items.length) % span) - size;
      const y = height - 8 - size * 1.1 + (i % 2) * 2;
      it.wrap.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      runnerGroup(it.body, time * (1.25 + 0.35 * speed) + i * 0.37, { kit: it.kit, skin: it.skin, shorts: night ? '#0B0E12' : '#1E2A4A', effort: it.r.effort || 0 });
    });
    if (running && time < 30 && !reduced()) raf = requestAnimationFrame(frame);
  };
  const size2 = () => { W = el.clientWidth; svg.setAttribute('width', W); svg.setAttribute('viewBox', `0 0 ${W} ${height}`); line.setAttribute('x2', W); };
  size2(); new ResizeObserver(() => { size2(); frame(performance.now()); }).observe(el);
  frame(t0 + 4200);
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { if (e.isIntersecting && !running && !reduced()) { running = true; t0 = performance.now() - 4200; raf = requestAnimationFrame(frame); } else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); } }).observe(el);
}
