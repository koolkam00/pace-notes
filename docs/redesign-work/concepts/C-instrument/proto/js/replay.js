// replay.js: the race replay, refined to an instrument face.
// One rule of colour: paper dots, and the accent only for a runner whose current
// section is at sustained-slowdown pace (25%+ slower than their own 5–20 km pace,
// after 20 km). Everything else is position.

import { fmtClock, fmtHM, U, ICON, reduced, pct, KM_PER_MI } from './core.js';

const K = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];

function prng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export function mountReplay(host, { file, edition, mode = 'straight', route = null, routeKm = null, start = null, autoplay = true, speed = 180 }) {
  const rows = file.rows, n = rows.length;
  const T = new Float64Array(n * 9), base = new Float64Array(n), lane = new Float32Array(n), jit = new Float32Array(n), jit2 = new Float32Array(n);
  const rnd = prng(7);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 9; j++) T[i * 9 + j] = rows[i][j];
    base[i] = (rows[i][3] - rows[i][0]) / 15;
    // lane = finish rank (rows are ordered by finish time): the field draws a needle
    // that tilts as the race unfolds, fast finishers on top. Small jitter gives it grain.
    let g = 0; for (let k = 0; k < 4; k++) g += rnd(); g = (g - 2) / 0.577;
    lane[i] = i / (n - 1); jit[i] = rnd(); jit2[i] = g;
  }
  const last = edition.last_finish_s, first = edition.first_finish_s;
  const q = new URLSearchParams(location.search);
  const still = q.has('t') ? +q.get('t') : null;
  let clock = still ?? start ?? Math.round(first * 0.86), playing = false, raf = 0, lastT = 0;

  host.innerHTML = `<canvas aria-hidden="true"></canvas>
    <div class="replay-hud">
      <div class="replay-top">
        <div><p class="label">${edition.race} ${edition.year}</p><p class="replay-clock" data-clock>0:00:00</p></div>
        <div class="replay-stats">
          <div class="replay-stat" data-fin>0%<small><i class="paper"></i>Finished</small></div>
          <div class="replay-stat" data-sd>0%<small><i></i>At slowdown pace</small></div>
        </div>
      </div>
      <p class="replay-note" data-note aria-hidden="true"></p>
      <div class="replay-controls">
        <button class="replay-play" type="button" aria-label="Play the replay">${ICON.play}</button>
        <div class="replay-scrub"><input type="range" min="0" max="${Math.ceil(last / 60) * 60}" step="30" value="${clock}" aria-label="Race clock" aria-valuetext="${fmtClock(clock)}"><div class="hours" aria-hidden="true"></div></div>
      </div>
    </div>
    <p class="sr-only" aria-live="polite" data-live></p>`;
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  const elClock = host.querySelector('[data-clock]'), elFin = host.querySelector('[data-fin]'), elSd = host.querySelector('[data-sd]');
  const note = host.querySelector('[data-note]'), range = host.querySelector('input'), play = host.querySelector('.replay-play');
  const hours = host.querySelector('.hours');
  const maxH = Math.ceil(last / 3600);
  hours.innerHTML = Array.from({ length: maxH + 1 }, (_, i) => `<span>${i}h</span>`).join('');

  const firstNote = edition.moments.not_past_20_at_first / edition.finishes;
  note.innerHTML = `When the first runner finished, <em>${pct(firstNote)}</em> of the field had not reached 20K.`;

  let W = 0, H = 0, dpr = 1, geo = null;
  const resize = () => {
    const r = host.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); geo = layout(); draw();
  };
  function layout() {
    const top = W < 600 ? 122 : 136, bottom = H - (W < 600 ? 154 : 164);
    if (mode === 'route' && route) {
      const pad = 26, xs = route.map(p => p[0]), ys = route.map(p => p[1]);
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      const s = Math.min((W - 2 * pad) / (maxx - minx), (bottom - top) / (maxy - miny));
      const ox = (W - (maxx - minx) * s) / 2, oy = top + ((bottom - top) - (maxy - miny) * s) / 2;
      const pts = route.map(p => [ox + (p[0] - minx) * s, oy + (p[1] - miny) * s]);
      const total = routeKm[routeKm.length - 1];
      const at = km => { // position + normal at a fraction of the route
        const d = km / 42.195 * total; let i = 1; while (i < routeKm.length - 1 && routeKm[i] < d) i++;
        const a = pts[i - 1], b = pts[i], f = Math.max(0, Math.min(1, (d - routeKm[i - 1]) / ((routeKm[i] - routeKm[i - 1]) || 1)));
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        return [a[0] + dx * f, a[1] + dy * f, -dy / L, dx / L];
      };
      return { kind: 'route', pts, at, top, bottom };
    }
    const x0 = 22, x1 = W - 30;
    return { kind: 'straight', x0, x1, top, bottom, y: (l, j) => top + 6 + l * (bottom - top - 12) + j * 2.2, x: km => x0 + km / 42.195 * (x1 - x0) };
  }
  function draw() {
    if (!geo) return;
    ctx.clearRect(0, 0, W, H);
    const ink = 'rgba(244,241,234,', sig = '255,106,61';
    // course furniture
    ctx.lineWidth = 1;
    if (geo.kind === 'straight') {
      const { x, top, bottom } = geo;
      ctx.strokeStyle = 'rgba(244,241,234,.10)';
      ctx.beginPath(); ctx.moveTo(x(0), bottom + 8.5); ctx.lineTo(x(42.195), bottom + 8.5); ctx.stroke();
      ctx.font = '500 9.5px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(158,163,173,.95)'; ctx.textAlign = 'center';
      const km = U.km();
      const marks = km ? [0, 10, 20, 30, 40] : [0, 5, 10, 15, 20, 25].map(m => m * KM_PER_MI);
      marks.forEach(k => {
        const px = Math.round(x(k)) + 0.5;
        ctx.strokeStyle = 'rgba(244,241,234,.16)'; ctx.beginPath(); ctx.moveTo(px, bottom + 4); ctx.lineTo(px, bottom + 13); ctx.stroke();
        ctx.fillText(km ? `${k}K` : `${Math.round(k / KM_PER_MI)} mi`, px, bottom + 26);
      });
      // halfway hairline and the 20K mat
      [[21.0975, 'HALF']].forEach(([k, t]) => {
        const px = Math.round(x(k)) + 0.5; ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(244,241,234,.14)';
        ctx.beginPath(); ctx.moveTo(px, top - 6); ctx.lineTo(px, bottom); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillText(t, px, top - 12);
      });
      // the y axis is finish order
      ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(158,163,173,.8)'; ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillText('FIRST TO FINISH', x(0), top + 8); ctx.fillText('LAST TO FINISH', x(0), bottom - 2); ctx.restore();
      // finish: a checkered strip
      const fx = Math.round(x(42.195));
      for (let yy = top - 6, k = 0; yy < bottom; yy += 4, k++) { ctx.fillStyle = k % 2 ? 'rgba(244,241,234,.55)' : 'rgba(244,241,234,.12)'; ctx.fillRect(fx, yy, 3, 4); }
    } else {
      ctx.strokeStyle = 'rgba(244,241,234,.16)'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); geo.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.lineWidth = 1;
      const s = geo.pts[0], f = geo.pts[geo.pts.length - 1];
      ctx.fillStyle = 'rgba(244,241,234,.9)'; ctx.beginPath(); ctx.arc(s[0], s[1], 3.5, 0, 7); ctx.fill();
      for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? 'rgba(244,241,234,.9)' : 'rgba(244,241,234,.25)'; ctx.fillRect(f[0] - 6 + (k % 2) * 6, f[1] - 6 + (k > 1 ? 6 : 0), 6, 6); }
    }
    // the field
    let fin = 0, sd = 0;
    const r = W < 600 ? 1.3 : 1.5;
    const buckets = [[], [], [], []]; // paper, warm-1, warm-2, signal
    for (let i = 0; i < n; i++) {
      const o = i * 9; let km, ratio = 1, sec = 0;
      if (clock >= T[o + 8]) { fin++; km = 42.195; sec = -1; }
      else {
        let j = 0; while (T[o + j] <= clock) j++;
        const prev = j ? T[o + j - 1] : 0, len = K[j + 1] - K[j];
        km = K[j] + (clock - prev) / (T[o + j] - prev) * len;
        ratio = (T[o + j] - prev) / len / base[i]; sec = K[j];
      }
      let px, py;
      if (geo.kind === 'straight') {
        py = geo.y(lane[i], jit2[i]);
        px = sec === -1 ? geo.x(42.195) + 7 + jit[i] * 14 : geo.x(km) + jit2[i] * 0.8;
      } else {
        const p = geo.at(km), off = jit2[i] * 2.4; px = p[0] + p[2] * off; py = p[1] + p[3] * off;
        if (sec === -1) { px += (jit[i] - .5) * 10; py += (jit[i] - .5) * 10; }
      }
      const slow = sec >= 20 && ratio >= 1.25;
      if (slow) sd++;
      const b = sec === -1 ? 0 : slow ? 3 : ratio >= 1.15 && sec >= 20 ? 2 : 0;
      buckets[b].push(px, py, sec === -1 ? 1 : 0);
    }
    const styles = [`${ink}.78)`, `${ink}.78)`, `rgba(${sig},.5)`, `rgba(${sig},1)`];
    buckets.forEach((arr, bi) => {
      for (let k = 0; k < arr.length; k += 3) {
        ctx.fillStyle = arr[k + 2] ? `${ink}.22)` : styles[bi];
        ctx.beginPath(); ctx.arc(arr[k], arr[k + 1], bi === 3 ? r + .35 : r, 0, 6.2832); ctx.fill();
      }
    });
    elClock.textContent = fmtClock(clock);
    const share = x => (x > 0 && x < 0.005 ? '<1%' : pct(x));
    elFin.firstChild.nodeValue = share(fin / n);
    elSd.firstChild.nodeValue = share(sd / n);
    range.value = clock; range.style.setProperty('--fill', (clock / range.max * 100).toFixed(2) + '%');
    range.setAttribute('aria-valuetext', fmtClock(clock));
    note.classList.toggle('on', clock >= first && clock < first + 1500);
  }
  const loop = t => {
    if (!playing) return;
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    clock = Math.min(last, clock + dt * speed);
    draw();
    if (clock >= last) { setPlaying(false); return; }
    raf = requestAnimationFrame(loop);
  };
  function setPlaying(p) {
    playing = p; play.innerHTML = p ? ICON.pause : ICON.play;
    play.setAttribute('aria-label', p ? 'Pause the replay' : 'Play the replay');
    if (p) { if (clock >= last) clock = 0; lastT = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
  }
  play.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => { setPlaying(false); clock = +range.value; draw(); });
  host.addEventListener('click', e => { if (e.target === cv) setPlaying(!playing); });
  U.on(() => draw());
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host); else addEventListener('resize', resize);
  resize();
  if (document.fonts) document.fonts.ready.then(draw);
  if (still == null && autoplay && !reduced() && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting && e.intersectionRatio > 0.35)) { io.disconnect(); setPlaying(true); } }, { threshold: [0, .35, .6] });
    io.observe(host);
  } else if (still == null && reduced()) { clock = first; draw(); }
  return { setClock(c) { clock = c; draw(); }, play: () => setPlaying(true), pause: () => setPlaying(false), setMode(m) { mode = m; geo = layout(); draw(); } };
}
