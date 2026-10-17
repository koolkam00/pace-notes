/* The race replay, ported from components/viz/RaceReplay.tsx (same position model and colours).
   Rows are nine cumulative split times (5K … finish) plus a gender code. */
(function () {
  const KM = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];
  const PACE = ['#2F5BFF', '#5C80FF', '#A9BCFF', '#EFE8DA', '#FFB48A', '#FF6A3D', '#E2416B'];
  function hash(i) { let x = (i + 1) * 2654435761; x ^= x >>> 13; x = Math.imul(x, 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
  function positionAt(row, t) {
    const finish = row[8];
    const baseline = (row[3] - row[0]) / 15;
    if (t >= finish) return { km: 42.195, rel: 0, finished: true, slow: false };
    let j = 0;
    while (j < 8 && row[j] <= t) j += 1;
    const start = j === 0 ? 0 : row[j - 1];
    const end = row[j];
    const fr = (t - start) / (end - start);
    const km = KM[j] + fr * (KM[j + 1] - KM[j]);
    const pace = (end - start) / (KM[j + 1] - KM[j]);
    const rel = pace / baseline - 1;
    return { km, rel, finished: false, slow: j >= 4 && rel >= 0.25 };
  }

  function mount(host, { rows, start = 0, speed = 600, mode = 'band', onTime, units = () => 'mi', padX, labels = true } = {}) {
    const canvas = host.querySelector('canvas');
    const g = canvas.getContext('2d');
    const lanes = rows.map((_, i) => { const u = Math.max(1e-6, hash(i)); const v = hash(i + 7919); const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); return Math.max(0.03, Math.min(0.97, 0.5 + z * 0.17)); });
    const lastFinish = rows.reduce((m, r) => Math.max(m, r[8]), 0);
    let W = 360, H = 200, t = start, playing = false, raf = 0, last = 0, userPaused = false;
    const state = { get t() { return t; } };

    function size() {
      const r = host.getBoundingClientRect();
      W = Math.max(280, Math.floor(r.width));
      H = Math.max(120, Math.floor(canvas.getBoundingClientRect().height || r.height));
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      g.clearRect(0, 0, W, H);
      const mobile = W < 640;
      const px = padX != null ? padX : mobile ? 18 : 40;
      const x0 = px, x1 = W - px - (mobile ? 26 : 60);
      const top = mode === 'band' ? 10 : 26, bottom = H - (labels ? 28 : 10);
      const X = (km) => x0 + ((x1 - x0) * km) / 42.195;
      g.font = `${mobile ? 10.5 : 11.5}px "JetBrains Mono", ui-monospace, monospace`;
      g.textAlign = 'center';
      const u = units();
      const marks = u === 'mi'
        ? [[0, 'start'], [8.0467, '5 mi'], [16.0934, '10 mi'], [21.0975, 'half'], [32.1869, '20 mi'], [42.195, 'finish']]
        : [[0, 'start'], [10, '10 km'], [21.0975, 'half'], [30, '30 km'], [40, '40 km'], [42.195, 'finish']];
      for (const [km, lab] of marks) {
        const edge = km === 0 || km >= 42;
        g.strokeStyle = edge ? 'rgba(244,178,62,.6)' : 'rgba(245,240,230,.09)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(Math.round(X(km)) + 0.5, top - 4); g.lineTo(Math.round(X(km)) + 0.5, bottom + 4); g.stroke();
        if (labels && (!mobile || lab !== '5 mi')) { g.fillStyle = edge ? 'rgba(244,178,62,.85)' : 'rgba(185,179,166,.85)'; g.fillText(lab, X(km), bottom + 19); }
      }
      const road = g.createLinearGradient(0, top, 0, bottom);
      road.addColorStop(0, 'rgba(245,240,230,0)'); road.addColorStop(0.5, 'rgba(245,240,230,.04)'); road.addColorStop(1, 'rgba(245,240,230,0)');
      g.fillStyle = road; g.fillRect(x0, top, x1 - x0, bottom - top);
      const r = mobile ? 1.55 : 2;
      g.globalCompositeOperation = 'lighter';
      let finished = 0, slow = 0, lead = 0, notHalf = 0;
      for (let i = 0; i < rows.length; i++) {
        const p = positionAt(rows[i], t);
        const y = top + (bottom - top) * (0.5 + (lanes[i] - 0.5) * (mode === 'band' ? 0.72 : 0.94));
        let x;
        if (p.finished) { finished++; x = x1 + 8 + lanes[i] * (mobile ? 16 : 44); } else { x = X(p.km); lead = Math.max(lead, p.km); if (p.slow) slow++; if (p.km < 21.0975) notHalf++; }
        const ci = p.finished ? 3 : Math.max(0, Math.min(6, Math.round(3 + p.rel / 0.08)));
        g.globalAlpha = p.finished ? 0.26 : 0.92;
        g.fillStyle = PACE[ci];
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (onTime) onTime(t, { finished, slow, lead, notHalf, n: rows.length });
    }
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      t += dt * speed;
      if (t > lastFinish + 900) t = Math.max(0, start * 0.3);
      draw();
      raf = requestAnimationFrame(loop);
    }
    function play() { if (playing) return; playing = true; last = performance.now(); raf = requestAnimationFrame(loop); host.dataset.playing = 'true'; }
    function pause() { playing = false; cancelAnimationFrame(raf); host.dataset.playing = 'false'; }
    const io = new IntersectionObserver(([e]) => {
      if (window.PN && PN.reduced()) { pause(); draw(); return; }
      if (e.isIntersecting && !userPaused) play(); else pause();
    }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(host);
    if (window.ResizeObserver) new ResizeObserver(size).observe(host); else addEventListener('resize', size);
    size();
    return {
      state, draw, lastFinish,
      toggle() { userPaused = playing; playing ? pause() : play(); return playing; },
      seek(v) { userPaused = true; pause(); t = v; draw(); },
      set speed(v) { speed = v; },
      get playing() { return playing; },
    };
  }
  window.PNReplay = { mount, positionAt, PACE };
})();
