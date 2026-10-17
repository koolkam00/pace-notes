/* Chapter 02 · Courses · Boston. One template for every course: the city is a parameter, every sentence a guarded field. */
(async function () {
  const CITY = new URLSearchParams(location.search).get('city') || 'Boston';
  const { f } = PN;
  const C = PNCharts;
  PN.mountChrome({ chapter: '02' });
  const [courses, geo, arch, goal, replay, rows] = await Promise.all(['courses', 'course-geometry', 'archetypes', 'course-goal', 'replay', 'replay-boston-2026'].map(PN.data));
  const $ = (s, r = document) => r.querySelector(s);
  const set = (k, html) => document.querySelectorAll(`[data-b="${k}"]`).forEach((el) => { el.innerHTML = html; });
  const width = (el) => Math.max(260, Math.round(el.getBoundingClientRect().width));
  const c = courses.courses.find((x) => x.city === CITY);
  const g = geo.courses.find((x) => x.city === CITY);
  const secIdx = (label) => courses.sections.indexOf(label);
  const ft = (m) => (PN.units === 'mi' ? `${Math.round(m / 0.3048)} ft` : `${Math.round(m)} m`);
  const ftNum = (m) => (PN.units === 'mi' ? Math.round(m / 0.3048) : Math.round(m));
  const cells = courses.years.cells.filter((x) => x.city === CITY).sort((a, b) => a.year - b.year);

  /* elevation helpers on the supplied route (0.5 km steps; race km scaled to the route's own length) */
  const sc = g.distance_km / 42.195;
  const elAt = (km) => g.elevation_m[Math.min(g.elevation_m.length - 1, Math.round((km * sc) / g.elevation_step_km))];
  const climb = (a, z) => { let s = 0; const i0 = Math.round((a * sc) / 0.5), i1 = Math.min(g.elevation_m.length - 1, Math.round((z * sc) / 0.5)); for (let i = i0; i < i1; i++) s += Math.max(0, g.elevation_m[i + 1] - g.elevation_m[i]); return s; };
  const [slowA, slowZ] = c.slowest_section.split('–').map(Number);
  const firstNet = elAt(5) - elAt(0);

  /* ---------- hero ---------- */
  const renderHero = () => {
    set('median', f.hm(c.median_s));
    set('sd', f.pct(c.slowdown));
    set('named', `${c.identified.correct}/${c.identified.editions}`);
    set('years', `${c.editions} editions · ${String(c.years[0])}–${String(c.years[c.years.length - 1]).slice(2)}`);
    set('dek', `${firstNet < -20 ? `Drops ${ft(-firstNet)} in the first 5K. ` : ''}Slows most at ${f.section(c.slowest_section)}, then runs ${f.section(c.signature_section)} quicker than the typical course does.`);
  };
  function drawRoute() {
    const el = $('[data-b="route"]');
    const pts = g.route, km = g.route_km;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
    const W = width(el), H = Math.round(el.getBoundingClientRect().height || 260), pad = 30;
    const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
    const ox = (W - bw * s) / 2 - bx * s, oy = (H - bh * s) / 2 - by * s;
    const P = (p) => [ox + p[0] * s, oy + p[1] * s];
    // points along the race from km a to z (interpolated on the route's own distance)
    const along = (a, z) => {
      const A = a * sc, Z = z * sc, out = [];
      const lerp = (d) => { let i = 0; while (i < km.length - 2 && km[i + 1] < d) i++; const t = (d - km[i]) / (km[i + 1] - km[i] || 1); return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]; };
      out.push(lerp(A)); km.forEach((d, i) => { if (d > A && d < Z) out.push(pts[i]); }); out.push(lerp(Z));
      return out.map(P);
    };
    const all = pts.map(P);
    const d = (arr) => arr.map((p, i) => `${i ? 'L' : 'M'}${C.r1(p[0])} ${C.r1(p[1])}`).join(' ');
    const hill = along(slowA, slowZ);
    const st = all[0], fin = all[all.length - 1], hm = hill[Math.floor(hill.length / 2)];
    const labRight = hm[0] < W * 0.6;
    const above = hm[1] > 90; // put the label on the empty side of the climb
    let svg = `<path class="rt-glow" d="${d(all)}"/><path class="rt-line line" d="${d(all)}"/><path class="rt-hill" d="${d(hill)}"/>`;
    svg += `<circle cx="${C.r1(st[0])}" cy="${C.r1(st[1])}" r="7" fill="#17A673" stroke="var(--bg)" stroke-width="3"/>`;
    svg += `<g transform="translate(${C.r1(fin[0] - 8)} ${C.r1(fin[1] - 8)})"><rect width="16" height="16" rx="2" fill="#F5F0E6"/><rect width="8" height="8" fill="#15171C"/><rect x="8" y="8" width="8" height="8" fill="#15171C"/></g>`;
    svg += `<text x="${C.r1(st[0])}" y="${C.r1(st[1] + 26)}" text-anchor="${st[0] < 60 ? 'start' : 'middle'}">Start</text><text x="${C.r1(fin[0])}" y="${C.r1(fin[1] - 16)}" text-anchor="${fin[0] > W - 60 ? 'end' : 'middle'}">Finish</text>`;
    const ly = above ? hm[1] - 34 : hm[1] + 34, ty = above ? hm[1] - 58 : hm[1] + 50;
    svg += `<line class="lead" x1="${C.r1(hm[0])}" y1="${C.r1(hm[1] + (above ? -8 : 8))}" x2="${C.r1(hm[0])}" y2="${C.r1(ly)}" style="stroke:var(--hi)"/><text class="lbl" x="${C.r1(hm[0] + (labRight ? -4 : 4))}" y="${C.r1(ty)}" text-anchor="${labRight ? 'start' : 'end'}">${f.section(c.slowest_section)}</text><text x="${C.r1(hm[0] + (labRight ? -4 : 4))}" y="${C.r1(ty + 16)}" text-anchor="${labRight ? 'start' : 'end'}">slowest 5K · +${ft(climb(slowA, slowZ))}</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="draw" role="img" aria-label="The ${c.race} route, with ${f.section(c.slowest_section)} highlighted">${svg}</svg>`;
    const line = el.querySelector('.rt-line'); if (line.getTotalLength) line.style.setProperty('--len', Math.ceil(line.getTotalLength()));
  }

  /* ---------- three frames: fingerprint, the climb, the clock ---------- */
  function drawDeck() {
    const sig = secIdx(c.signature_section);
    const id = courses.identification;
    const elev = elevationMini();
    const med0 = cells[0], med1 = cells[cells.length - 1];
    const frames = [
      { f: 'f-night', k: 'Fingerprint', big: `<span data-odo="${c.identified.correct}"></span><span class="u low">/${c.identified.editions}</span>`, claim: `${CITY} editions <em>named from their pacing shape</em> alone.`, say: `Its signature: ${f.section(c.signature_section)} runs ${Math.abs(c.signature_points).toFixed(1)} points ${c.signature_points < 0 ? 'quicker' : 'slower'} than the typical course. Every course, named: ${f.pct(id.correct / id.editions_tested)}.`, viz: C.curve(c.deviation, { typical: c.deviation.map(() => 0), glow: sig, w: 300, h: 80, label: `${CITY} pacing against the typical course` }) },
      { f: 'f-02', k: 'The climb', big: `<span data-odo="${ftNum(climb(slowA, slowZ))}"></span><span class="u low">${PN.units === 'mi' ? 'ft' : 'm'}</span>`, claim: `of climbing in the <em>field’s slowest 5K</em>, ${f.section(c.slowest_section)}.`, say: `Then the route drops ${ft(-(elAt(slowZ + 5) - elAt(slowZ)))} and the field speeds up.`, viz: elev },
      { f: 'f-11', k: 'The clock', big: `<span data-odo="${f.hm(med1.median_s)}"></span>`, claim: `median finish in ${med1.year}. In ${med0.year}: <em>${f.hm(med0.median_s)}</em>.`, say: `${cells.length} editions in the data, from ${med0.year} to ${med1.year}.`, viz: medianLine() },
    ];
    set('deck', frames.map((fr, i) => `<article class="frame ${fr.f}" data-nugget data-share-kick="02 · ${CITY} · ${fr.k}" aria-roledescription="slide" aria-label="${i + 1} of 3: ${fr.k}">
      <div class="kick"><span class="k-ch"><span class="k-dot"></span>${fr.k}</span><span class="k-n">${i + 1}/3</span></div>
      <div class="body"><div class="big md">${fr.big}</div><p class="claim">${fr.claim}</p><p class="say">${fr.say}</p></div>
      <div class="micro viz" data-share-viz>${fr.viz}</div>
      <div class="foot"><span></span><button class="btn btn-sm" type="button" data-share>Share</button></div></article>`).join(''));
    document.querySelectorAll('[data-b="deck"] [data-odo]').forEach((el) => PN.odo(el, el.dataset.odo));
    const track = $('[data-b="deck"]'), bars = $('#signature .deck-bars');
    const onDeck = () => { const w = track.children[0].getBoundingClientRect().width + 12; const p = track.scrollLeft / w; bars.querySelectorAll('i').forEach((b, i) => b.style.setProperty('--fill', Math.max(0, Math.min(1, p - i + 1)).toFixed(3))); };
    track.addEventListener('scroll', () => requestAnimationFrame(onDeck), { passive: true }); onDeck();
  }
  function elevationMini() {
    const w = 300, h = 80, e = g.elevation_m, n = e.length;
    const lo = 0, hi = 160; // one shared scale for every course page (metres), so a flat course looks flat
    const X = (i) => (w * i) / (n - 1), Y = (v) => h - 14 - ((h - 22) * (v - lo)) / (hi - lo);
    const line = e.map((v, i) => `${C.r1(X(i))},${C.r1(Y(v))}`).join(' ');
    const i0 = Math.round((slowA * sc) / 0.5), i1 = Math.round((slowZ * sc) / 0.5);
    const seg = e.slice(i0, i1 + 1).map((v, j) => `${C.r1(X(i0 + j))},${C.r1(Y(v))}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Elevation along the route"><polygon points="0,${h - 14} ${line} ${w},${h - 14}" class="m-fg" opacity=".12"/><polyline class="line s-fg" fill="none" points="${line}" opacity=".8"/><polyline fill="none" class="s-hi" stroke-width="4" stroke-linecap="round" points="${seg}"/><line class="axis" x1="0" x2="${w}" y1="${h - 13.5}" y2="${h - 13.5}"/><text x="0" y="${h}">Start</text><text x="${w}" y="${h}" text-anchor="end">Finish</text></svg>`;
  }
  function medianLine() {
    const w = 300, h = 80, n = cells.length;
    const vs = cells.map((x) => x.median_s), lo = Math.min(...vs) - 300, hi = Math.max(...vs) + 300;
    const X = (i) => 12 + ((w - 24) * i) / (n - 1), Y = (v) => 8 + ((h - 26) * (hi - v)) / (hi - lo);
    const pts = cells.map((x, i) => [X(i), Y(x.median_s)]);
    let s = `<polyline class="line s-fg" fill="none" points="${pts.map((p) => p.map(C.r1).join(',')).join(' ')}"/>`;
    pts.forEach((p, i) => { s += `<circle cx="${C.r1(p[0])}" cy="${C.r1(p[1])}" r="${i === n - 1 ? 5 : 3.5}" class="${i === n - 1 ? 'm-hi' : 'm-fg'} ring"/>`; });
    s += `<text x="${C.r1(X(0))}" y="${h}" text-anchor="middle">${cells[0].year}</text><text x="${C.r1(X(n - 1))}" y="${h}" text-anchor="middle">${cells[n - 1].year}</text>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Median finish by year">${s}</svg>`;
  }

  /* ---------- replay ---------- */
  const ed = replay.editions.find((e) => e.city === CITY);
  set('rp-n', `${f.int(ed.sample)} of ${f.int(ed.finishes)}`);
  const share20 = ed.moments.not_past_20_at_first / ed.finishes;
  set('rp-claim', `When the first finish crossed, <em>${f.pct(share20)}</em> of the field hadn’t reached ${f.mat(20)}.`);
  set('ramp', PNReplay.PACE.map((col) => `<span style="background:${col}"></span>`).join(''));
  const clockIn = $('[data-b="clock-in"]');
  const rp = PNReplay.mount($('.replay-box'), {
    rows: rows.rows, start: Math.round(ed.first_finish_s), speed: 600, mode: 'track', units: () => PN.units,
    onTime: (t, s) => { set('clock', f.clock(t)); set('fin', `${Math.round((100 * s.finished) / s.n)}%`); set('slow', `${Math.round((100 * s.slow) / s.n)}%`); clockIn.value = Math.round(t); PN.fillRange(clockIn); },
  });
  clockIn.max = Math.ceil(rp.lastFinish + 300);
  clockIn.addEventListener('input', () => { rp.seek(Number(clockIn.value)); syncPlay(); });
  const playBtn = $('[data-b="play"]');
  const syncPlay = () => { const on = rp.playing; playBtn.setAttribute('aria-label', on ? 'Pause replay' : 'Play replay'); playBtn.innerHTML = on ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>'; };
  playBtn.addEventListener('click', () => { rp.toggle(); syncPlay(); });
  setInterval(syncPlay, 1000);

  /* ---------- your goal on this course ---------- */
  const goals = [180, 210, 240, 270, 300];
  let pick = PN.race.goal;
  function renderGoal() {
    const list = Array.from(new Set([...goals, PN.race.goal])).filter((x) => goal.rows.some((r) => r.city === CITY && r.goal === x)).sort((a, b) => a - b);
    set('goals', list.map((x) => `<button class="chip${x === PN.race.goal ? ' is-you' : ''}" type="button" data-goal="${x}" aria-pressed="${x === pick}">${f.goal(x)}</button>`).join(''));
    const r = goal.rows.find((x) => x.city === CITY && x.goal === pick);
    if (!r) return;
    const pool = goal.rows.filter((x) => x.goal === pick);
    const n = pool.reduce((s, x) => s + x.n, 0), under = pool.reduce((s, x) => s + x.n * x.under, 0) / n;
    const k = Math.round(r.under * 100);
    set('goal-claim', `On ${f.goal(pick)} pace through ${f.mat(20)}, <em>${k} in 100</em> ${CITY} finishes made ${f.goal(pick)}.`);
    set('g-under', f.pct(r.under)); set('g-under-l', `made it · ${f.pct(under)} across ${pool.length} courses`);
    set('g-sd', f.pct(r.sd));
    set('g-dots', PN.dots(k, { label: `${k} of 100 made ${f.goal(pick)}`, size: 320 }));
    set('g-fin', `${f.int(r.n)} finishes ran ${f.goal(pick)} pace to ${f.mat(20)}. Their typical finish: <b>${f.clock(r.fin[1])}</b>.`);
    $('#goal').dataset.shareYou = `On ${f.goal(pick)} pace at 20K in ${CITY}, ${k} in 100 made it`;
    const mine = goal.rows.find((x) => x.city === CITY && x.goal === PN.race.goal);
    if (mine) set('you', `${Math.round(mine.under * 100)} in 100 on ${f.goal(PN.race.goal)} pace at ${f.mat(20)} made it`);
  }
  $('[data-b="goals"]').addEventListener('click', (e) => { const b = e.target.closest('[data-goal]'); if (!b) return; pick = Number(b.dataset.goal); renderGoal(); });

  /* ---------- year by year ---------- */
  let year = cells[cells.length - 1].year;
  const wxBy = new Map(courses.weather.editions.filter((x) => x.city === CITY).map((x) => [x.year, x]));
  function renderYears() {
    const lo = cells.reduce((a, b) => (b.slowdown < a.slowdown ? b : a)), hi = cells.reduce((a, b) => (b.slowdown > a.slowdown ? b : a));
    set('yr-lo', Math.round(lo.slowdown * 100)); set('yr-hi', Math.round(hi.slowdown * 100));
    set('yr-claim', `Same course, different years: ${f.pct(lo.slowdown)} in <em>${lo.year}</em>, ${f.pct(hi.slowdown)} in ${hi.year}.`);
    const max = Math.max(...cells.map((x) => x.slowdown));
    set('yr-bars', cells.map((x) => `<button class="yr${x === lo || x === hi ? ' is-ext' : ''}" type="button" data-year="${x.year}" aria-pressed="${x.year === year}" aria-label="${x.year}: ${f.pct(x.slowdown)} sustained slowdown"><span class="yr-v">${Math.round(x.slowdown * 100)}%</span><span class="yr-b" style="height:${((x.slowdown / max) * 100).toFixed(1)}%"></span><span class="yr-y">${String(x.year).slice(2)}</span><span class="yr-t">${wxBy.get(x.year) ? f.temp(wxBy.get(x.year).temp) : ''}</span></button>`).join(''));
    const y = cells.find((x) => x.year === year), w = wxBy.get(year);
    set('yr-say', `<b>${year}</b>${w ? ` · started ${f.temp(w.temp)}` : ''} · median ${f.clock(y.median_s)} · <b>${f.pct(y.slowdown)}</b> had a sustained slowdown.`);
  }
  $('[data-b="yr-bars"]').addEventListener('click', (e) => { const b = e.target.closest('[data-year]'); if (!b) return; year = Number(b.dataset.year); renderYears(); });

  /* ---------- race morning: warm against cool (guard: shown only ≥ 5 °C apart) ---------- */
  function renderWx() {
    const hc = courses.weather.hot_cool.find((x) => x.city === CITY);
    const card = $('#weather');
    if (!hc || hc.hot.temp - hc.cool.temp < 5) { card.hidden = true; return; }
    const gap = hc.hot.temp - hc.cool.temp;
    set('wx-gap', `${PN.units === 'mi' ? Math.round((gap * 9) / 5) : Math.round(gap)}`); set('wx-u', PN.units === 'mi' ? '°F' : '°C');
    const more = hc.hot.slowdown > hc.cool.slowdown;
    set('wx-claim', `warmer at the start in ${hc.hot.year} than ${hc.cool.year}. ${more ? '<em>More</em> sustained slowdowns.' : 'No more sustained slowdowns.'}`);
    const cardH = (x, cls) => `<div class="wx-card ${cls}"><span class="wx-y">${x.year}</span><span class="wx-t">${f.temp(x.temp)}</span><span class="wx-s"><b>${f.pct(x.slowdown)}</b> had a sustained slowdown</span><span class="wx-s">Median ${f.clock(x.median_s)}</span></div>`;
    set('wx', cardH(hc.hot, 'hot') + cardH(hc.cool, 'cool'));
  }

  /* ---------- pacing types against every course ---------- */
  const TYPE_C = ['#0F8F62', '#2F5BFF', '#C98A12', '#7A4DFF', '#E2416B', '#9A4A12'];
  function renderTypes() {
    const t = arch.courses.find((x) => x.city === CITY);
    const diffs = t.shares.map((s, i) => s - arch.archetypes[i].share);
    const k = diffs.reduce((a, d, i) => (Math.abs(d) > Math.abs(diffs[a]) ? i : a), 0);
    const name = arch.archetypes[k].name;
    set('ty-claim', `${diffs[k] < 0 ? 'Fewer' : 'More'} <em>${name}s</em>.`);
    set('ty-say', `${name}s: ${f.pct(t.shares[k])} of ${CITY} finishes, against ${f.pct(arch.archetypes[k].share)} across every course.`);
    const max = Math.max(...t.shares, ...arch.archetypes.map((a) => a.share));
    set('types', arch.archetypes.map((a, i) => `<div class="type-row"><span class="tn"><i style="background:${TYPE_C[i]}"></i>${a.name}</span><span class="tb"><span style="width:${((t.shares[i] / max) * 100).toFixed(1)}%;background:${TYPE_C[i]};opacity:${i === k ? 1 : 0.55}"></span><em style="left:${((a.share / max) * 100).toFixed(1)}%"></em></span><span class="tv">${f.pct(t.shares[i])}</span></div>`).join(''));
  }

  /* ---------- courses that bend the same way (fingerprint distance; ≥ 5 editions) ---------- */
  function renderShaped() {
    const near = courses.courses.filter((x) => x.city !== CITY && x.deviation && x.editions >= 5).map((x) => ({ x, d: Math.hypot(...x.deviation.map((v, i) => v - c.deviation[i])) })).sort((a, b) => a.d - b.d).slice(0, 3);
    set('shaped', near.map(({ x }) => `<a href="#"><span><b>${x.city}</b><small>${x.editions} editions · median ${f.hm(x.median_s)}</small></span>${C.curve(x.deviation, { typical: c.deviation, w: 120, h: 40, pad: 4, min: -5, max: 4, label: `${x.city} against ${CITY}` })}</a>`).join(''));
  }

  const all = () => { renderHero(); drawRoute(); drawDeck(); renderGoal(); renderYears(); renderWx(); renderTypes(); renderShaped(); PN.observe(); };
  all();
  PN.on('race', () => { pick = PN.race.goal; renderGoal(); });
  PN.on('units', () => { renderHero(); drawRoute(); drawDeck(); renderGoal(); renderYears(); renderWx(); PN.observe(); });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawRoute, 150); });
})();
