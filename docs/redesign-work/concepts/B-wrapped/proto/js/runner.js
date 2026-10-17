/* The Pace Notes runner: a port of lib/art/gait.ts (same keyframes, same proportions).
   Used for the progress-rail runner and the chapter illustrations. */
(function () {
  function periodic(keys) {
    const n = keys.length;
    const at = (j) => { const m = ((j % n) + n) % n; const wrap = Math.floor(j / n); return [keys[m][0] + wrap, keys[m][1]]; };
    return (raw) => {
      const t = ((raw % 1) + 1) % 1;
      let i = 0;
      while (i < n - 1 && keys[i + 1][0] <= t) i += 1;
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const span = p2[0] - p1[0];
      const u = (t - p1[0]) / span;
      const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * span;
      const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * span;
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
    };
  }
  const HIP = periodic([[0, 24], [0.18, 6], [0.4, -22], [0.62, 14], [0.82, 36], [0.92, 30]]);
  const KNEE = periodic([[0, 14], [0.14, 38], [0.4, 16], [0.6, 112], [0.8, 70], [0.93, 22]]);
  const SHOULDER = periodic([[0, -30], [0.25, 0], [0.5, 32], [0.75, 0]]);
  const ELBOW = periodic([[0, 70], [0.25, 88], [0.5, 104], [0.75, 88]]);
  const BOUNCE = periodic([[0, 1.5], [0.15, 3.2], [0.4, -1.5], [0.5, 1.5], [0.65, 3.2], [0.9, -1.5]]);
  const step = ([x, y], a, l) => { const r = (a * Math.PI) / 180; return [x + l * Math.sin(r), y + l * Math.cos(r)]; };

  function pose(t, effort = 0) {
    const lean = 12 + effort * 8, stride = 1 - effort * 0.35, bounce = BOUNCE(t) * (1 - effort * 0.5);
    const hip = [46, 56 + bounce + effort * 2];
    const shoulder = step(hip, 180 - lean, 28);
    const head = step(shoulder, 180 - lean + 6, 12);
    const leg = (p) => { const thigh = HIP(p) * stride + effort * 4; const knee = thigh - KNEE(p) * (0.75 + 0.25 * stride); const k = step(hip, thigh, 21); const a = step(k, knee, 21); const toe = step(a, knee + 100, 7); return { pts: [hip, k, a, toe], thigh }; };
    const arm = (p) => { const upper = SHOULDER(p) * stride - effort * 6; const fore = upper + ELBOW(p) - effort * 10; const e = step(shoulder, upper, 14); const h = step(e, fore, 13); return [shoulder, e, h]; };
    const near = leg(t), far = leg(t + 0.5);
    const mid = [(hip[0] + shoulder[0]) / 2, (hip[1] + shoulder[1]) / 2];
    return { hip, shoulder, head, nearLeg: near.pts, farLeg: far.pts, nearArm: arm(t + 0.5), farArm: arm(t), nearShorts: [hip, step(hip, near.thigh, 7.5)], farShorts: [hip, step(hip, far.thigh, 7.5)], bib: { x: mid[0], y: mid[1], angle: lean }, shadow: 16 - bounce };
  }
  const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 - amt)))); return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join(''); }

  /** Inner SVG markup for one runner (100 x 110 units). */
  function markup(t, { kit = '#FF5B2E', shorts = '#1E2A4A', skin = '#8D5524', effort = 0, shadow = true } = {}) {
    const p = pose(t, effort);
    const farSkin = shade(skin, 0.35), farShorts = shade(shorts, 0.3);
    return (shadow ? `<ellipse cx="50" cy="104" rx="${p.shadow.toFixed(1)}" ry="2.2" fill="currentColor" opacity=".16"/>` : '') +
      `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="${poly(p.farArm)}" stroke="${farSkin}" stroke-width="6"/>` +
      `<path d="${poly(p.farLeg)}" stroke="${farSkin}" stroke-width="7.5"/>` +
      `<path d="${poly(p.farShorts)}" stroke="${farShorts}" stroke-width="10"/>` +
      `<path d="${poly([p.hip, p.shoulder])}" stroke="${kit}" stroke-width="13"/>` +
      `<path d="${poly(p.nearLeg)}" stroke="${skin}" stroke-width="7.5"/>` +
      `<path d="${poly(p.nearShorts)}" stroke="${shorts}" stroke-width="10"/>` +
      `<path d="${poly(p.nearArm)}" stroke="${skin}" stroke-width="6"/></g>` +
      `<circle cx="${p.head[0].toFixed(1)}" cy="${p.head[1].toFixed(1)}" r="7.2" fill="${skin}"/>` +
      `<rect x="${(p.bib.x - 3.5).toFixed(1)}" y="${(p.bib.y - 4).toFixed(1)}" width="7" height="6" rx="1" fill="#FFFDF8" transform="rotate(${p.bib.angle} ${p.bib.x.toFixed(1)} ${p.bib.y.toFixed(1)})"/>`;
  }

  window.PNRunner = { pose, markup, SKIN: ['#2B1D14', '#5A3825', '#8D5524', '#C68642', '#E0AC69', '#F1C27D'] };
})();
