/* Chapter 04 · Analysis · Starting pace. Lead with the same-race, same-pace comparison (kick.json → bank),
   then the descriptive explorer (fast-start/all-finishers.json). Every sentence is built from fields with a guard. */
(async function () {
  const { f } = PN;
  const C = PNCharts;
  PN.mountChrome({ chapter: '04' });
  const [kick, fs, geo] = await Promise.all([PN.data('kick'), PN.data('fast-start'), PN.data('course-geometry')]);
  const $ = (s, r = document) => r.querySelector(s);
  const set = (k, html) => document.querySelectorAll(`[data-a="${k}"]`).forEach((el) => { el.innerHTML = html; });
  const width = (el) => Math.max(280, Math.round(el.getBoundingClientRect().width));
  const bank = kick.bank;
  const b0 = bank.bands[0];

  /* ---------- the answer (guard: banked early and behind at the finish) ---------- */
  if (b0.open_s < 0 && b0.finish_s > 0) {
    set('title', `Bank ${f.ms(-b0.open_s)} early. <em>Give&nbsp;back ${f.ms(b0.after20_s)}.</em>`);
  } else set('title', 'A fast first 5K and the finish');
  document.title = `Bank ${f.ms(-b0.open_s)}, give back ${f.ms(b0.after20_s)} · Pace Notes`;
  const max = Math.max(-b0.open_s, b0.after20_s);
  set('receipt', `
    <div class="receipt-h"><span>Race receipt</span><span>${PN.esc(b0.label)}</span></div>
    <div class="receipt-row"><span>First 5K</span><b class="bank">−${f.ms(-b0.open_s)}</b></div>
    <div class="receipt-bar" style="width:${(100 * -b0.open_s / max).toFixed(1)}%;background:#2F5BFF"></div>
    <div class="receipt-row"><span>After 20K</span><b class="spend">+${f.ms(b0.after20_s)}</b></div>
    <div class="receipt-bar" style="width:100%;background:#E2416B;transition-delay:.25s"></div>
    <div class="receipt-row receipt-total"><span>At the finish</span><b>${f.ms(b0.finish_s)} behind</b></div>
    <div class="receipt-row"><span>Sustained slowdown</span><b style="font-size:1.25rem">${f.pct(b0.slowdown)} <span style="font-size:.8rem;color:#66625A;font-family:var(--sans);font-weight:550;letter-spacing:0">vs ${f.pct(b0.expected)}</span></b></div>
    <div class="receipt-foot">Same race · same 5–20K pace</div>`);
  const even5k = (g) => (g * 60 * 5) / 42.195;
  const renderYou = () => {
    const g = PN.race.goal;
    set('you', `More than 10% fast is a first 5K under <em>${f.ms(even5k(g) * 0.9)}</em>. Even: ${f.ms(even5k(g))}.`);
    $('#answer').dataset.shareYou = `A fast start for my ${f.goal(g)} is under ${f.ms(even5k(g) * 0.9)}`;
  };

  /* ---------- try it: scrub the opening ---------- */
  const curve = bank.curve;
  const best = curve.reduce((a, b) => (b.finish_s < a.finish_s ? b : a));
  set('best', best.lo >= 0 ? `${best.lo}–${best.lo + 1}% slower` : `${-best.lo - 1}–${-best.lo}% faster`);
  const scrub = $('#open-scrub');
  scrub.min = curve[0].lo; scrub.max = curve[curve.length - 1].lo;
  let lo = 0;
  function drawCurve() {
    const el = $('[data-a="curve"]');
    const w = width(el), h1 = 160, h2 = 70, gap = 50, h = h1 + gap + h2 + 22;
    const xs = curve.map((c) => c.lo + 0.5);
    const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5;
    const X = (v) => 38 + ((w - 46) * (v - x0)) / (x1 - x0);
    const fmin = Math.min(...curve.map((c) => c.finish_s)), fmax = Math.max(...curve.map((c) => c.finish_s));
    const Y1 = (v) => 12 + ((h1 - 24) * (fmax - v)) / (fmax - fmin);
    const smin = 0.2, smax = Math.max(...curve.map((c) => c.slowdown)) + 0.02;
    const Y2 = (v) => h1 + gap + ((h2 - 8) * (smax - v)) / (smax - smin);
    let s = '';
    // top: finish against same-pace finishes (min); the wash shows ahead (faster colour) and behind (slower colour)
    const pts = curve.map((c) => [X(c.lo + 0.5), Y1(c.finish_s)]);
    const z = Y1(0);
    s += `<defs><clipPath id="cl-a"><rect x="0" y="0" width="${w}" height="${C.r1(z)}"/></clipPath><clipPath id="cl-b"><rect x="0" y="${C.r1(z)}" width="${w}" height="${h1}"/></clipPath></defs>`;
    const area = `${C.smooth(pts)} L${C.r1(pts[pts.length - 1][0])} ${C.r1(z)} L${C.r1(pts[0][0])} ${C.r1(z)} Z`;
    s += `<path d="${area}" class="m-slower" opacity=".14" clip-path="url(#cl-a)"/><path d="${area}" class="m-faster" opacity=".14" clip-path="url(#cl-b)"/>`;
    s += `<line class="axis" x1="38" x2="${w}" y1="${C.r1(z)}" y2="${C.r1(z)}"/>`;
    [Math.ceil(fmax / 60), 0, Math.floor(fmin / 60)].forEach((m) => { if (m === 0) return; s += `<text x="0" y="${C.r1(Y1(m * 60) + 4)}">${f.signed(m)} min</text><line class="grid" x1="38" x2="${w}" y1="${C.r1(Y1(m * 60))}" y2="${C.r1(Y1(m * 60))}"/>`; });
    s += `<text x="0" y="${C.r1(z + 4)}">0</text>`;
    s += `<path class="line s-fg" d="${C.smooth(pts)}"/>`;
    const bx = X(best.lo + 0.5), by = Y1(best.finish_s);
    s += `<circle cx="${C.r1(bx)}" cy="${C.r1(by)}" r="11" class="m-faster" opacity=".18"/><circle cx="${C.r1(bx)}" cy="${C.r1(by)}" r="5" class="m-faster ring"/><text class="lbl" x="${C.r1(bx)}" y="${C.r1(by + 26)}" text-anchor="middle">Best average finish</text>`;
    s += `<text class="lbl-sm" x="${w}" y="${C.r1(Y1(fmax) + 4)}" text-anchor="end">Behind same-pace finishes</text><text class="lbl-sm" x="${w}" y="${C.r1(Y1(fmin) - 22)}" text-anchor="end">Ahead</text>`;
    // bottom: sustained slowdown share
    s += `<line class="axis" x1="38" x2="${w}" y1="${C.r1(Y2(smin))}" y2="${C.r1(Y2(smin))}"/>`;
    [0.3, 0.5].forEach((v) => { s += `<line class="grid" x1="38" x2="${w}" y1="${C.r1(Y2(v))}" y2="${C.r1(Y2(v))}"/><text x="0" y="${C.r1(Y2(v) + 4)}">${Math.round(v * 100)}%</text>`; });
    s += `<path class="line s-fg" d="${C.smooth(curve.map((c) => [X(c.lo + 0.5), Y2(c.slowdown)]))}" opacity=".7"/>`;
    s += `<text class="lbl-sm" x="38" y="${C.r1(h1 + gap - 8)}">Sustained slowdown share</text>`;
    // cursor
    const c = curve.find((x) => x.lo === lo) || curve[0];
    const cx = X(c.lo + 0.5);
    s += `<line x1="${C.r1(cx)}" x2="${C.r1(cx)}" y1="4" y2="${C.r1(Y2(smin))}" class="s-hi" stroke-width="1.5"/>`;
    s += `<circle cx="${C.r1(cx)}" cy="${C.r1(Y1(c.finish_s))}" r="6" class="m-hi ring"/><circle cx="${C.r1(cx)}" cy="${C.r1(Y2(c.slowdown))}" r="5" class="m-hi ring"/>`;
    [x0 + 0.5, 0.5, x1 - 0.5].forEach((v, i) => { s += `<text x="${C.r1(X(v))}" y="${h - 2}" text-anchor="${['start', 'middle', 'end'][i]}">${i === 1 ? '0%' : `${f.signed(Math.round(v - 0.5))}%`}</text>`; });
    s += `<rect class="hit" x="0" y="0" width="${w}" height="${h}"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Finish time against same-pace finishes, and the sustained slowdown share, by how fast the first 5K was against the 5–20K pace. The best average finish came from a first 5K ${best.lo}–${best.lo + 1}% slower." class="draw">${s}</svg>`;
    readCurve(c);
  }
  function readCurve(c) {
    const g = PN.race.goal, mid = (c.lo + 0.5) / 100;
    set('split', `${f.ms(even5k(g) * (1 + mid))}<small>first 5K · ${c.lo >= 0 ? `${c.lo}–${c.lo + 1}% slower` : `${-c.lo - 1}–${-c.lo}% faster`}</small>`);
    const behind = c.finish_s > 0;
    set('fin', `${f.ms(c.finish_s)}`);
    set('fin-l', `${behind ? 'behind' : 'ahead of'} same-pace finishes at the finish`);
    $('[data-a="fin-box"]').className = behind ? 'is-bad' : 'is-good';
    set('sd', f.pct(c.slowdown));
    scrub.value = c.lo; PN.fillRange(scrub);
    scrub.setAttribute('aria-valuetext', `${c.lo >= 0 ? 'slower' : 'faster'} start: ${f.ms(c.finish_s)} ${behind ? 'behind' : 'ahead'}, ${f.pct(c.slowdown)} sustained slowdown`);
  }
  scrub.addEventListener('input', () => { lo = Number(scrub.value); drawCurve(); });
  const curveEl = $('[data-a="curve"]');
  let drag = false;
  const fromPointer = (e) => { const r = curveEl.getBoundingClientRect(); const v = curve[0].lo + Math.round(((e.clientX - r.left - 38 * (r.width / width(curveEl))) / (r.width - 46)) * curve.length - 0.5); lo = Math.max(curve[0].lo, Math.min(curve[curve.length - 1].lo, v)); drawCurve(); };
  curveEl.addEventListener('pointerdown', (e) => { drag = true; fromPointer(e); });
  addEventListener('pointerup', () => { drag = false; });
  curveEl.addEventListener('pointermove', (e) => { if (drag || e.pointerType === 'mouse') fromPointer(e); });

  /* ---------- onset by opening, per course ---------- */
  const BAND = Object.fromEntries(fs.bands.map((b) => [b.id, b.label]));
  const ORDER = fs.bands.map((b) => b.id);
  const rows = fs.rows.filter((r) => r.gender === 'all');
  const totalN = (r) => r.groups.reduce((s, g) => s + g.n, 0);
  const cities = rows.filter((r) => r.city !== 'All courses').sort((a, b) => totalN(b) - totalN(a)).map((r) => r.city);
  let city = 'All courses';
  set('cities', ['All courses', ...cities].map((c) => `<button class="chip" type="button" data-city="${c}" aria-pressed="${c === city}">${c}</button>`).join(''));
  $('[data-a="cities"]').addEventListener('click', (e) => { const b = e.target.closest('[data-city]'); if (!b) return; city = b.dataset.city; renderOnset(); });
  const RAMP = ['var(--hi)', 'rgba(245,240,230,.62)', 'rgba(245,240,230,.38)', 'rgba(245,240,230,.2)'];
  const starts = fs.onset_starts_km;
  set('onset-key', starts.map((k, i) => `<span><i style="background:${RAMP[i]}"></i>${f.section(`${k}–${k + 5}`)}</span>`).join(''));
  function renderOnset() {
    document.querySelectorAll('[data-city]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.city === city)));
    const row = rows.find((r) => r.city === city);
    const ok = row.groups.filter((g) => g.slowdown_n >= fs.min_cell);
    const share = (g) => g.onset[0] / g.onset.reduce((a, b) => a + b, 0);
    const fast = ok.find((g) => g.band === 'fast10'), steady = ok.find((g) => g.band === 'steady');
    if (fast && steady) {
      set('on-a', Math.round(share(fast) * 100)); set('on-b', Math.round(share(steady) * 100));
      set('on-claim', `of sustained slowdowns after a <em>fast start</em> began as early as ${f.section('20–25')}${city === 'All courses' ? '' : ` in ${city}`}. After a steady start: ${Math.round(share(steady) * 100)}%.`);
    }
    set('onset', ORDER.map((id) => {
      const g = ok.find((x) => x.band === id);
      if (!g) return '';
      const tot = g.onset.reduce((a, b) => a + b, 0);
      const sel = id === 'fast10' || id === 'steady';
      return `<div class="onset-row${sel ? ' is-sel' : ''}"><span class="ol">${PN.esc(BAND[id].replace('More than ', '>'))}</span><span class="onset-bar">${g.onset.map((v, i) => `<span style="flex-grow:${(v / tot).toFixed(4)};background:${RAMP[i]}" title="${f.pct(v / tot)}"></span>`).join('')}</span></div>`;
    }).join(''));
    $('[data-a="onset"]').setAttribute('aria-label', `Where sustained slowdowns began, by opening pace${city === 'All courses' ? '' : `, ${city}`}`);
    const sec = $('#onset'); sec.dataset.shareYou = city === 'All courses' ? '' : city;
  }

  /* ---------- matched slowdown share + every opening ---------- */
  set('m-big', Math.round(b0.slowdown * 100));
  set('m-claim', `of very fast starts ended in a <a class="term" href="#">sustained slowdown</a>. Same race, same pace: <em>${f.pct(b0.expected)}</em>.`);
  set('m-l1', `${b0.label}: ${f.pct(b0.slowdown)}`);
  set('m-l2', `Same race, same pace: ${f.pct(b0.expected)}`);
  set('m-d1', PN.dots(Math.round(b0.slowdown * 100), { label: `${f.pct(b0.slowdown)} of very fast starts`, size: 160, gap: 0.3 }));
  set('m-d2', PN.dots(Math.round(b0.expected * 100), { label: `${f.pct(b0.expected)} of same-pace finishes`, size: 160, gap: 0.3 }).replace(/dt on/g, 'dt on-2'));
  set('table', `<thead><tr><th>First 5K</th><th>Finishes</th><th>5K</th><th>After 20K</th><th>Finish</th><th>Slowdown</th><th>Same pace</th></tr></thead><tbody>${bank.bands.map((b, i) => `<tr class="${i === 0 ? 'is-hi' : ''}"><td>${PN.esc(b.label)}</td><td>${f.int(b.n)}</td><td>${f.ms(b.open_s, true)}</td><td>${f.ms(b.after20_s, true)}</td><td>${f.ms(b.finish_s, true)}</td><td>${f.pct(b.slowdown)}</td><td>${f.pct(b.expected)}</td></tr>`).join('')}</tbody>`);

  /* ---------- next: downhill starts (courses from geometry: first 5K net ≤ −25 m) ---------- */
  const downhill = geo.courses.filter((c) => c.elevation_m && c.elevation_m.length > 10 && c.elevation_m[10] - c.elevation_m[0] <= -25).map((c) => c.city).filter((c) => cities.includes(c));
  const fastShare = (inSet) => { let n = 0, k = 0; rows.forEach((r) => { if (r.city === 'All courses' || downhill.includes(r.city) !== inSet) return; r.groups.forEach((g) => { n += g.n; if (g.band === 'fast10' || g.band === 'fast5') k += g.n; }); }); return k / n; };
  const dA = fastShare(true), dB = fastShare(false);
  set('dh-a', Math.round(dA * 100)); set('dh-b', Math.round(dB * 100));
  set('dh-claim', Math.abs(dA - dB) < 0.01 ? `opened more than 5% fast, <em>downhill first 5K or not</em>.` : `opened more than 5% fast on downhill-start courses, against ${f.pct(dB)} elsewhere.`);
  set('dh-say', `${downhill.slice(0, -1).join(', ')} and ${downhill[downhill.length - 1]} drop ${PN.units === 'mi' ? 'more than 80 ft' : 'more than 25 m'} in their first 5K.`);

  const all = () => { renderYou(); drawCurve(); renderOnset(); };
  all();
  PN.on('race', all);
  PN.on('units', () => { all(); });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawCurve, 150); });
  document.querySelectorAll('[data-next-rail]').forEach(PN.nextRail);
  PN.observe();
})();
