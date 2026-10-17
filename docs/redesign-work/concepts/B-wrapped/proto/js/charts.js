/* Chart grammar for the Wrapped direction. Every builder returns an SVG string whose marks use
   field tokens (m-fg, m-mute, m-hi …), so the same chart reads on any chapter colour.
   Rules: one baseline hairline, ≤3 solid gridlines, mono 12px ticks, Inter 14px direct labels,
   one highlighted mark (you, or the finding), never a number on every mark. */
(function () {
  const r1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** Minute histogram: thin columns, the expected curve as a dotted model line, lit minutes in the highlight. */
  function histogram(hist, { from = 150, to = 360, w = 340, h = 120, lit = [], expected = null, ticks = [180, 240, 300], tickLabel = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, label = '', you = null, youLabel = 'You', mute = false, labelLit = true, padTop = 22 } = {}) {
    const rows = hist.filter((d) => d.minute >= from && d.minute < to);
    const max = Math.max(...rows.map((d) => d.all));
    const bw = w / (to - from);
    const base = h - 18;
    const Y = (v) => base - ((base - padTop) * v) / max;
    let s = `<line class="axis" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
    for (const d of rows) {
      const x = (d.minute - from) * bw;
      const on = lit.includes(d.minute);
      s += `<rect class="bar ${on ? 'm-hi' : mute ? 'm-mute' : 'm-fg'}" x="${r1(x)}" y="${r1(Y(d.all))}" width="${r1(Math.max(0.6, bw - (bw > 2.4 ? 0.8 : 0.15)))}" height="${r1(base - Y(d.all))}" rx="${bw > 3 ? 1 : 0}" opacity="${on ? 1 : mute ? 1 : 0.42}"/>`;
    }
    if (expected) {
      const pts = expected.filter((e) => e.minute >= from && e.minute < to).map((e) => `${r1((e.minute - from) * bw + bw / 2)},${r1(Y(e.expected))}`);
      s += `<polyline class="line-model" points="${pts.join(' ')}"/>`;
    }
    for (const t of ticks) { const x = (t - from) * bw; s += `<line class="grid" x1="${r1(x)}" x2="${r1(x)}" y1="${base}" y2="${base + 4}"/><text x="${r1(x)}" y="${h - 2}" text-anchor="middle">${tickLabel(t)}</text>`; }
    if (labelLit) for (const m of lit) {
      const d = rows.find((x) => x.minute === m); if (!d) continue;
      const x = (m - from) * bw + bw / 2;
      s += `<text class="lbl-hi" x="${r1(x)}" y="${r1(Y(d.all) - 7)}" text-anchor="middle">${tickLabel(m)}</text>`;
    }
    if (you != null && you >= from && you < to) {
      const x = (you - from) * bw;
      s += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${padTop - 6}" y2="${base}" stroke="currentColor" stroke-width="1.5" class="s-fg" opacity=".85"/><text class="lbl" x="${r1(x + 5)}" y="${padTop - 1}">${esc(youLabel)}</text>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="grow">${s}</svg>`;
  }

  /** A 9-section pacing curve (relative %), optional typical curve behind, optional glowing section. */
  function curve(values, { typical = null, w = 320, h = 90, glow = null, label = '', pad = 10, min = null, max = null, labels = false, sections = [] } = {}) {
    const all = values.concat(typical || []);
    const lo = min != null ? min : Math.min(...all), hi = max != null ? max : Math.max(...all);
    const X = (i) => pad + ((w - pad * 2) * i) / (values.length - 1);
    const Y = (v) => pad + ((h - pad * 2) * (hi - v)) / (hi - lo || 1);
    let s = '';
    if (lo < 0 && hi > 0) s += `<line class="grid" x1="0" x2="${w}" y1="${r1(Y(0))}" y2="${r1(Y(0))}"/>`;
    if (glow != null) { const x = X(glow); s += `<rect x="${r1(x - (w - pad * 2) / 16)}" y="0" width="${r1((w - pad * 2) / 8)}" height="${h}" rx="8" class="m-hi" opacity=".16"/>`; }
    if (typical) s += `<polyline class="line s-mute" stroke-width="2" fill="none" points="${typical.map((v, i) => `${r1(X(i))},${r1(Y(v))}`).join(' ')}"/>`;
    s += `<polyline class="line s-fg" fill="none" points="${values.map((v, i) => `${r1(X(i))},${r1(Y(v))}`).join(' ')}"/>`;
    if (glow != null) s += `<circle cx="${r1(X(glow))}" cy="${r1(Y(values[glow]))}" r="5" class="m-hi ring"/>`;
    if (labels && sections.length) sections.forEach((t, i) => { if (t) s += `<text x="${r1(X(i))}" y="${h + 14}" text-anchor="middle">${esc(t)}</text>`; });
    return `<svg viewBox="0 0 ${w} ${h + (labels ? 18 : 0)}" role="img" aria-label="${esc(label)}" class="draw">${s}</svg>`;
  }

  /** Waffle: n squares in cols columns, the first `lit` highlighted. */
  function waffle(n, lit, { cols = 15, w = 300, gap = 3, label = '' } = {}) {
    const cell = (w - gap * (cols - 1)) / cols;
    const rows = Math.ceil(n / cols);
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = (i % cols) * (cell + gap), y = Math.floor(i / cols) * (cell + gap);
      s += `<rect class="dt ${i < lit ? 'on' : ''}" x="${r1(x)}" y="${r1(y)}" width="${r1(cell)}" height="${r1(cell)}" rx="2" style="transition-delay:${i * 4}ms"/>`;
    }
    return `<svg viewBox="0 0 ${w} ${r1(rows * (cell + gap) - gap)}" role="img" aria-label="${esc(label)}">${s}</svg>`;
  }

  /** Two horizontal bars on a shared scale, direct-labelled. rows: [{label, value, hi}] */
  function bars(rows, { w = 320, rowH = 30, gap = 10, max = null, fmt = (v) => v, label = '', labelW = 0 } = {}) {
    const m = max != null ? max : Math.max(...rows.map((r) => r.value));
    const h = rows.length * (rowH + gap) - gap;
    let s = '';
    rows.forEach((r, i) => {
      const y = i * (rowH + gap);
      const bw = Math.max(4, ((w - labelW - 54) * r.value) / m);
      s += `<rect class="bar ${r.hi ? 'm-hi' : 'm-fg'}" x="${labelW}" y="${y}" width="${r1(bw)}" height="${rowH}" rx="5" opacity="${r.hi ? 1 : 0.5}"/>`;
      s += `<text class="lbl" x="${r1(labelW + bw + 8)}" y="${y + rowH / 2 + 5}">${esc(fmt(r.value))}</text>`;
      if (labelW) s += `<text class="lbl-sm" x="0" y="${y + rowH / 2 + 5}">${esc(r.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="growx">${s}</svg>`;
  }

  /** Smooth path through points (Catmull-Rom to Bézier). */
  function smooth(pts) {
    if (pts.length < 2) return '';
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d;
  }

  window.PNCharts = { histogram, curve, waffle, bars, smooth, esc, r1 };
})();
