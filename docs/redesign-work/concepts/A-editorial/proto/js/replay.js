// The race replay: every sampled finish as a dot on the race clock. Canvas, no library.
// Ported from components/viz/RaceReplay.tsx; adds a "moment" flag, a still frame for reduced motion and tap-to-pause.
import { getUnits, onUnits, reduced, clock, KM_PER_MI } from './core.js';

const KM = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];
// Night ramp: faster (blue) → same (paper) → slower (ember). Canvas cannot read CSS variables.
const RAMP = ['#3D66FF', '#6A8BFF', '#AFC0FF', '#EFE8DA', '#FFB48A', '#FF6A3D', '#E8456B'];

function hash(i) {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 13; x = Math.imul(x, 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function position(row, t) {
  const finish = row[8];
  const base = (row[3] - row[0]) / 15;
  if (t >= finish) return { km: 42.195, rel: 0, done: true, slow: false };
  let j = 0; while (j < 8 && row[j] <= t) j += 1;
  const a = j === 0 ? 0 : row[j - 1]; const b = row[j];
  const f = (t - a) / (b - a);
  const km = KM[j] + f * (KM[j + 1] - KM[j]);
  const rel = (b - a) / (KM[j + 1] - KM[j]) / base - 1;
  return { km, rel, done: false, slow: j >= 4 && rel >= 0.25 };
}

export function createReplay(root, { rows, route = null, variant = 'track', height = () => 220, start = 0, speed = 600, onFrame = () => {}, moments = [], labels = true, pad = null, streak = 240 } = {}) {
  const canvas = root.querySelector('canvas');
  const g = canvas.getContext('2d');
  const btn = root.querySelector('.replay-btn');
  const scrub = root.querySelector('.replay-scrub');
  const flag = root.querySelector('.replay-flag');
  const last = rows.reduce((m, r) => Math.max(m, r[8]), 0);
  const first = rows.reduce((m, r) => Math.min(m, r[8]), Infinity);
  const lanes = rows.map((_, i) => { const u = Math.max(1e-6, hash(i)); const v = hash(i + 7919); const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); return Math.max(0.04, Math.min(0.96, 0.5 + z * 0.14)); });
  let W = 0; let H = 0; let t = start; let playing = false; let userPaused = false; let raf = 0; let lastNow = 0; let inView = false;
  let shown = new Set();

  // Route geometry, fitted to its own bounding box.
  let locate = null; let box = null;
  if (route && variant === 'route') {
    const xs = route.points.map((p) => p[0]); const ys = route.points.map((p) => p[1]);
    box = { x0: Math.min(...xs), y0: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1, h: Math.max(...ys) - Math.min(...ys) || 1 };
    const total = route.km[route.km.length - 1];
    locate = (d) => {
      const dd = (d / 42.195) * total; let lo = 0; let hi = route.km.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (route.km[mid] <= dd) lo = mid; else hi = mid; }
      const f = Math.max(0, Math.min(1, (dd - route.km[lo]) / (route.km[hi] - route.km[lo] || 1)));
      return [route.points[lo][0] + f * (route.points[hi][0] - route.points[lo][0]), route.points[lo][1] + f * (route.points[hi][1] - route.points[lo][1])];
    };
  }

  function resize() {
    const w = Math.max(280, Math.floor(root.clientWidth));
    const hh = Math.round(height(w));
    if (w === W && hh === H) return;
    W = w; H = hh;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function layout() {
    const mobile = W < 640;
    const p = pad || { top: mobile ? 58 : 76, bottom: labels ? 30 : 12, left: mobile ? 16 : 28, right: mobile ? 34 : 70 };
    return { mobile, ...p };
  }

  function draw() {
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const L = layout();
    let place;
    if (locate) {
      const size = Math.min((W - L.left - L.right) / box.w, (H - L.top - L.bottom) / box.h);
      const ox = L.left + (W - L.left - L.right - box.w * size) / 2 - box.x0 * size;
      const oy = L.top + (H - L.top - L.bottom - box.h * size) / 2 - box.y0 * size;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); route.points.forEach(([x, y], i) => (i ? g.lineTo(ox + x * size, oy + y * size) : g.moveTo(ox + x * size, oy + y * size)));
      g.strokeStyle = 'rgba(245,240,230,0.08)'; g.lineWidth = 14; g.stroke();
      g.strokeStyle = 'rgba(245,240,230,0.22)'; g.lineWidth = 1.5; g.stroke();
      const [sx, sy] = locate(0); const [fx, fy] = locate(42.195);
      g.fillStyle = '#17A673'; g.beginPath(); g.arc(ox + sx * size, oy + sy * size, 5, 0, 7); g.fill();
      g.fillStyle = '#F4B23E'; g.beginPath(); g.arc(ox + fx * size, oy + fy * size, 5, 0, 7); g.fill();
      place = (km, lane, i) => { const [x, y] = locate(km); const a = hash(i * 3 + 1) * Math.PI * 2; const r = 5.5 * Math.sqrt(hash(i * 7 + 3)); return [ox + x * size + Math.cos(a) * r, oy + y * size + Math.sin(a) * r]; };
    } else {
      const x0 = L.left; const x1 = W - L.right; const top = L.top; const bottom = H - L.bottom;
      const X = (km) => x0 + ((x1 - x0) * km) / 42.195;
      const u = getUnits();
      const marks = u === 'mi'
        ? [0, 5, 10, 15, 20, 25, 26.2].map((mi) => ({ km: Math.min(42.195, mi * KM_PER_MI), label: mi === 0 ? 'Start' : mi === 26.2 ? 'Finish' : `${mi} mi` }))
        : [0, 10, 20, 30, 40, 42.195].map((km) => ({ km, label: km === 0 ? 'Start' : km > 42 ? 'Finish' : `${km} km` }));
      g.font = `500 ${L.mobile ? 10.5 : 12}px "JetBrains Mono Variable", ui-monospace, monospace`;
      g.textBaseline = 'alphabetic';
      for (const m of marks) {
        const edge = m.km === 0 || m.km > 42;
        g.fillStyle = edge ? 'rgba(244,178,62,0.75)' : 'rgba(245,240,230,0.07)';
        g.fillRect(Math.round(X(m.km)), top - 4, 1, bottom - top + 8);
        if (labels && (!L.mobile || edge || m.label === '10 mi' || m.label === '20 mi' || m.label === '20 km')) {
          g.fillStyle = edge ? 'rgba(244,178,62,0.95)' : 'rgba(185,179,166,0.85)';
          g.textAlign = m.km === 0 ? 'left' : m.km > 42 ? 'right' : 'center';
          g.fillText(m.label, X(m.km) + (m.km === 0 ? -1 : m.km > 42 ? 1 : 0), H - 10);
        }
      }
      // Halfway (20K) tick, the moment line for the first-finish flag.
      g.fillStyle = 'rgba(244,178,62,0.22)';
      g.fillRect(Math.round(X(20)), top - 4, 1, bottom - top + 8);
      place = (km, lane) => {
        const y = top + (bottom - top) * lane;
        if (km >= 42.195) return [x1 + 6 + lane * (L.right - 10), y];
        return [X(km), y];
      };
      root.style.setProperty('--x20', `${X(20)}px`);
      root.style.setProperty('--xfin', `${x1}px`);
    }
    g.globalCompositeOperation = 'lighter';
    const r = W < 640 ? 1.2 : 1.55;
    let done = 0; let slow = 0; let before20 = 0; let lead = 0;
    g.lineCap = 'round';
    g.lineWidth = r * 1.5;
    for (let i = 0; i < rows.length; i += 1) {
      const p = position(rows[i], t);
      if (p.done) done += 1; else { if (p.slow) slow += 1; if (p.km < 20) before20 += 1; lead = Math.max(lead, p.km); }
      const ci = p.done ? 3 : Math.max(0, Math.min(6, Math.round(3 + p.rel / 0.08)));
      const [x, y] = place(p.km, lanes[i], i);
      g.fillStyle = RAMP[ci];
      if (!p.done && streak && t > streak) {
        // A speed streak: where this finish was a few race-minutes ago, so motion reads even in a still frame.
        const q = position(rows[i], t - streak);
        const [qx, qy] = place(q.km, lanes[i], i);
        g.globalAlpha = 0.24; g.strokeStyle = RAMP[ci];
        g.beginPath(); g.moveTo(qx, qy); g.lineTo(x, y); g.stroke();
      }
      g.globalAlpha = p.done ? 0.2 : 0.82;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const n = rows.length;
    onFrame({ t, done: done / n, slow: slow / n, before20: before20 / n, running: (n - done) / n, lead, first, last });
    if (scrub) { scrub.value = String(Math.round(t)); scrub.style.setProperty('--v', String(t / (last + 300))); scrub.setAttribute('aria-valuetext', clock(t)); }
    for (const m of moments) {
      if (!flag) break;
      const hit = t >= m.t && t < m.t + (m.hold || 1500);
      if (hit && !shown.has(m)) { shown.add(m); m.show(flag, t); flag.classList.add('is-on'); }
      if (!hit && shown.has(m) && t >= m.t + (m.hold || 1500)) { flag.classList.remove('is-on'); }
      if (t < m.t) shown.delete(m);
    }
  }

  function loop(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    t += dt * speed;
    if (t > last + 420) { t = start; shown = new Set(); }
    draw();
    raf = requestAnimationFrame(loop);
  }
  function play() { if (playing || reduced()) return; playing = true; lastNow = performance.now(); raf = requestAnimationFrame(loop); setBtn(); }
  function pause() { playing = false; cancelAnimationFrame(raf); setBtn(); }
  function setBtn() {
    if (!btn) return;
    btn.setAttribute('aria-label', playing ? 'Pause the replay' : 'Play the replay');
    btn.innerHTML = playing
      ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
  }
  const toggle = () => { userPaused = playing; if (playing) pause(); else play(); };
  btn?.addEventListener('click', toggle);
  canvas.addEventListener('click', toggle);
  if (scrub) {
    scrub.max = String(Math.ceil(last + 300));
    scrub.addEventListener('input', () => { userPaused = true; pause(); t = Number(scrub.value); draw(); });
  }
  new ResizeObserver(resize).observe(root);
  onUnits(draw);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView && !userPaused) play(); else if (!inView) pause(); }, { threshold: 0.25 }).observe(root);
  }
  if (reduced()) { t = Math.round(first * 1.02); }
  resize(); setBtn();
  return { play, pause, seek: (v) => { t = v; draw(); }, get time() { return t; }, first, last };
}
