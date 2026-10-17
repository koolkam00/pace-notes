/* Chapter 08 · The finish line · "The 3:59 effect". Reads finish-times.json fields only. */
(async function () {
  const { f } = PN;
  const C = PNCharts;
  PN.mountChrome({ chapter: '08' });
  const [ft, demo] = await Promise.all([PN.data('finish-times'), PN.data('demographics')]);
  const $ = (sel, root = document) => root.querySelector(sel);
  const set = (k, html) => document.querySelectorAll(`[data-c="${k}"]`).forEach((el) => { el.innerHTML = html; });
  const H = new Map(ft.histogram.map((h) => [h.minute, h]));
  const E = new Map(ft.expected_curve.map((e) => [e.minute, e.expected]));
  const mm = (m) => f.goal(m);
  const width = (el) => Math.max(280, Math.round(el.getBoundingClientRect().width));

  /* ---------- 1 · the busiest minute (guarded: "alike" only when all three peaks agree) ---------- */
  const argmax = (key) => ft.histogram.reduce((a, b) => (b[key] > a[key] ? b : a));
  const peak = argmax('all');
  const alike = argmax('women').minute === peak.minute && argmax('men').minute === peak.minute;
  PN.odo($('[data-odo-id="peak"]'), mm(peak.minute));
  set('toc-peak', mm(peak.minute));
  set('alike', alike ? 'For recorded women and men alike.' : '');
  set('peak-say', `<b>${f.int(peak.all)}</b> finishes landed between ${mm(peak.minute)}:00 and ${mm(peak.minute)}:59. A smooth curve expects <b>${f.int(E.get(peak.minute))}</b>.`);
  const drawPeak = () => {
    const el = $('[data-c="peak-viz"]');
    el.innerHTML = C.histogram(ft.histogram, { from: 150, to: 362, w: width(el), h: Math.round(Math.max(132, width(el) * 0.36)), lit: [peak.minute], ticks: [180, 240, 300, 360], you: PN.race.goal, youLabel: `You ${mm(PN.race.goal)}`, label: `Finishes per minute. The tallest is ${mm(peak.minute)}.`, padTop: 30, labelLit: Math.abs(PN.race.goal - peak.minute) > 12 });
  };
  const peakYou = () => {
    const d = PN.race.goal - peak.minute;
    set('peak-you', d === 0 ? 'Right in the rush' : `${Math.abs(d)} minute${Math.abs(d) === 1 ? '' : 's'} ${d > 0 ? 'after' : 'before'} the rush`);
    $('#peak').dataset.shareYou = `My goal is ${Math.abs(d)} minutes ${d > 0 ? 'after' : 'before'} the busiest minute`;
  };

  /* ---------- 2 · towers: every minute, scrubbed ---------- */
  const towers = $('#towers');
  const chart = $('[data-t="chart"]', towers);
  const scrub = $('[data-t="scrub"]', towers);
  let series = 'all', at = PN.race.goal - 1;
  const FROM = 140, TO = 370;
  const markBefore = new Set(ft.marks.filter((m) => m.kind !== 'quarter').map((m) => m.minutes - 1));
  const labelled = ft.marks.filter((m) => m.ratio >= 1.25 && m.minute_before > 5000).map((m) => m.minutes - 1);
  function drawTowers() {
    const w = width(chart), h = Math.round(Math.min(300, Math.max(220, w * 0.62)));
    const rows = ft.histogram.filter((d) => d.minute >= FROM && d.minute < TO);
    const max = Math.max(...rows.map((d) => d.all));
    const bw = w / (TO - FROM), base = h - 22, top = 34;
    const X = (m) => (m - FROM) * bw, Y = (v) => base - ((base - top) * v) / max;
    let s = '';
    [0.5, 1].forEach((g) => { s += `<line class="grid" x1="0" x2="${w}" y1="${C.r1(Y(max * g))}" y2="${C.r1(Y(max * g))}"/><text x="0" y="${C.r1(Y(max * g) - 5)}">${f.int(max * g / 1000)}K</text>`; });
    s += `<line class="axis" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
    for (const d of rows) {
      const on = markBefore.has(d.minute);
      s += `<rect class="bar ${on ? 'm-hi' : 'm-fg'}" x="${C.r1(X(d.minute))}" y="${C.r1(Y(d[series]))}" width="${C.r1(Math.max(0.7, bw - 0.35))}" height="${C.r1(base - Y(d[series]))}" opacity="${on ? 1 : 0.34}"/>`;
    }
    if (series === 'all') s += `<polyline class="line-model" points="${ft.expected_curve.filter((e) => e.minute >= FROM && e.minute < TO).map((e) => `${C.r1(X(e.minute) + bw / 2)},${C.r1(Y(e.expected))}`).join(' ')}"/>`;
    for (const m of labelled) { if (Math.abs(m - at) < 3 || Math.abs(m - PN.race.goal) < 4) continue; const d = H.get(m); s += `<text class="lbl-hi" x="${C.r1(X(m) + bw / 2)}" y="${C.r1(Y(d[series]) - 8)}" text-anchor="middle">${mm(m)}</text>`; }
    [180, 240, 300, 360].forEach((t) => { s += `<text x="${C.r1(X(t))}" y="${h - 4}" text-anchor="middle">${mm(t)}</text>`; });
    // the cursor (you, or wherever the reader scrubs)
    const cx = X(at) + bw / 2, d = H.get(at);
    s += `<line x1="${C.r1(cx)}" x2="${C.r1(cx)}" y1="${top - 22}" y2="${base}" class="s-fg" stroke-width="1.5"/><circle cx="${C.r1(cx)}" cy="${C.r1(Y(d ? d[series] : 0))}" r="5" class="m-fg ring"/>`;
    const gx = X(PN.race.goal) + bw / 2;
    if (Math.abs(gx - cx) > 30) s += `<text class="lbl" x="${C.r1(gx)}" y="${top - 18}" text-anchor="middle">You ${mm(PN.race.goal)}</text><line x1="${C.r1(gx)}" x2="${C.r1(gx)}" y1="${top - 14}" y2="${base}" class="s-fg" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>`;
    s += `<rect class="hit" x="0" y="0" width="${w}" height="${h}"/>`;
    chart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Finishes in every minute from ${mm(FROM)} to ${mm(TO)}, with towers in the minute before each hour and half hour" class="grow">${s}</svg>`;
    readTowers();
  }
  function readTowers() {
    const d = H.get(at); if (!d) return;
    $('[data-t="min"]', towers).textContent = mm(at);
    $('[data-t="n"]', towers).textContent = `${f.int(d[series])} finishes${series === 'all' ? '' : ` · recorded ${series}`}`;
    const ex = E.get(at), mk = ft.marks.find((m) => m.minutes - 1 === at);
    const ratio = mk ? mk.ratio : ex ? d.all / ex : null; // the marks table is the published figure for a mark's minute
    $('[data-t="ratio"]', towers).innerHTML = series === 'all' && ratio ? `${ratio.toFixed(2)}×<small>against the curve</small>` : `<small>Curve shown for everyone</small>`;
    scrub.value = at; scrub.setAttribute('aria-valuetext', `${mm(at)}: ${f.int(d[series])} finishes`); PN.fillRange(scrub);
  }
  scrub.addEventListener('input', () => { at = Number(scrub.value); drawTowers(); });
  const fromPointer = (e) => { const r = chart.getBoundingClientRect(); const m = Math.round(FROM + ((e.clientX - r.left) / r.width) * (TO - FROM) - 0.5); at = Math.max(FROM, Math.min(TO - 1, m)); drawTowers(); };
  let dragging = false;
  chart.addEventListener('pointerdown', (e) => { dragging = true; fromPointer(e); });
  addEventListener('pointerup', () => { dragging = false; });
  chart.addEventListener('pointermove', (e) => { if (dragging || e.pointerType === 'mouse') fromPointer(e); });
  towers.querySelectorAll('[data-series]').forEach((b) => b.addEventListener('click', () => {
    series = b.dataset.series;
    towers.querySelectorAll('[data-series]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawTowers();
  }));

  /* ---------- 3 · the biggest pull (guard: "mostly don't" only when most quarters sit near the curve) ---------- */
  const top = ft.marks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  PN.odo($('[data-odo-id="ratio"]'), top.ratio.toFixed(2));
  set('toc-ratio', `${top.ratio.toFixed(2)}×`);
  set('marks-claim', `as many finishes in <em>${mm(top.minutes - 1)}</em> as a smooth curve expects.`);
  const quarters = ft.marks.filter((m) => m.kind === 'quarter');
  const flat = quarters.filter((m) => m.ratio < 1.05);
  set('marks-say', flat.length > quarters.length / 2
    ? `Hours and half hours pull. Quarter hours mostly don’t: ${flat.map((m) => `${m.mark} ${m.ratio.toFixed(2)}×`).join(', ')}.`
    : 'Hours and half hours pull hardest.');
  set('score', ft.marks.map((m) => `<span class="${m.ratio >= 1.2 ? 'is-up' : ''}">${m.mark}<b>${m.ratio.toFixed(2)}×</b></span>`).join(''));
  set('marks-table', `<thead><tr><th>Mark</th><th>Minute before</th><th class="hide-sm">Curve</th><th>Ratio</th><th>Women</th><th>Men</th></tr></thead><tbody>${ft.marks.map((m) => `<tr class="${m === top ? 'is-hi' : ''}"><td>${m.mark}</td><td>${f.int(m.minute_before)}</td><td class="hide-sm">${f.int(m.expected_minute_before)}</td><td>${m.ratio.toFixed(2)}×</td><td>${m.women_ratio.toFixed(2)}×</td><td>${m.men_ratio.toFixed(2)}×</td></tr>`).join('')}</tbody>`);

  /* ---------- 4 · guess first: the last 2.2K rescue ---------- */
  const rescue = $('#rescue');
  const near = (list) => list.reduce((a, b) => (Math.abs(b.minutes - PN.race.goal) < Math.abs(a.minutes - PN.race.goal) ? b : a));
  const rIn = $('.scrub', rescue), rOut = $('[data-c="rescue-out"]');
  const showR = () => { rOut.innerHTML = `${rIn.value}<small>%</small>`; rIn.setAttribute('aria-valuetext', `${rIn.value} percent`); PN.fillRange(rIn); };
  rIn.addEventListener('input', showR); showR();
  const renderRescue = () => {
    const b = near(ft.bubble);
    set('rescue-q', `At 40K you’re on course to miss <em>${b.mark}</em> by up to 2 minutes. What share of finishes like that still got under?`);
    set('r-obs', f.pct(b.over.share_under)); set('r-exp', f.pct(b.over.expected_share_under));
    set('r-obs-l', `got under ${b.mark}`);
    set('r-obs-dots', PN.dots(Math.round(b.over.share_under * 100), { label: `${f.pct(b.over.share_under)} got under ${b.mark}`, size: 160, gap: 0.3 }));
    set('r-exp-dots', PN.dots(Math.round(b.over.expected_share_under * 100), { label: `${f.pct(b.over.expected_share_under)} near a time with no round number`, size: 160, gap: 0.3 }).replace(/dt on/g, 'dt on-2'));
    set('rescue-claim', b.over.share_under > b.over.expected_share_under ? `The round number <em>pulled</em> finishes under the line.` : 'No pull at this mark.');
    const mine = Number(rIn.value), diff = mine - b.over.share_under * 100;
    set('r-mine', `${mine}%`); set('r-diff', Math.abs(diff) < 2 ? 'Spot on' : `${Math.abs(Math.round(diff))} points ${diff > 0 ? 'high' : 'low'}`);
    rescue.dataset.shareYou = `I guessed ${mine}%`;
    set('toc-rescue', 'Guess');
  };
  renderRescue();
  $('[data-reveal-btn]', rescue).addEventListener('click', () => { renderRescue(); rescue.classList.add('is-revealed'); rescue.classList.remove('is-in'); requestAnimationFrame(() => rescue.classList.add('is-in')); });
  document.querySelector('.toc a[href="#rescue"]').lastChild.textContent = `The ${f.finalStretch()}`;

  /* ---------- 5 · the cushion: ten-second lens ---------- */
  let lens = near(ft.seconds).mark, lensTouched = false;
  const chipsEl = $('[data-c="cush-chips"]');
  chipsEl.innerHTML = ft.seconds.map((s) => `<button class="chip" type="button" data-mark="${s.mark}" aria-pressed="false">${s.mark}</button>`).join('');
  chipsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-mark]'); if (!b) return; lens = b.dataset.mark; lensTouched = true; renderCushion(); });
  const first = ft.seconds[0], last = ft.seconds[ft.seconds.length - 1];
  set('cush-say', Math.abs(last.peak_offset_s) > Math.abs(first.peak_offset_s)
    ? `The slower the mark, the wider the cushion: ${Math.abs(first.peak_offset_s)} s before ${first.mark}, ${Math.abs(last.peak_offset_s)} s before ${last.mark}.`
    : 'Every mark has its own cushion.');
  function renderCushion() {
    const s = ft.seconds.find((x) => x.mark === lens);
    chipsEl.querySelectorAll('[data-mark]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.mark === lens)); b.classList.toggle('is-you', b.dataset.mark === near(ft.seconds).mark); });
    const odo = $('[data-odo-id="cush"]');
    PN.odo(odo, String(Math.abs(s.peak_offset_s)));
    set('toc-cush', `${Math.abs(near(ft.seconds).peak_offset_s)} s`);
    set('cush-claim', `Before <em>${s.mark}</em>, the pile peaks ${Math.abs(s.peak_offset_s)} seconds under the line.`);
    const el = $('[data-c="cush-viz"]');
    const w = width(el), h = 200, base = h - 22, topY = 24;
    const bins = s.bins.filter((b) => b.offset_s >= -180 && b.offset_s < 120);
    const max = Math.max(...bins.map((b) => Math.max(b.n, b.expected)));
    const X = (o) => ((o + 180) / 300) * w, bw = w / 30, Y = (v) => base - ((base - topY) * v) / max;
    let g = `<line class="axis" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
    for (const b of bins) {
      const pk = b.offset_s === s.peak_offset_s;
      g += `<rect class="bar ${pk ? 'm-hi' : b.offset_s < 0 ? 'm-fg' : 'm-mute'}" x="${C.r1(X(b.offset_s) + 1)}" y="${C.r1(Y(b.n))}" width="${C.r1(bw - 2)}" height="${C.r1(base - Y(b.n))}" rx="2" opacity="${pk ? 1 : b.offset_s < 0 ? 0.45 : 1}"/>`;
    }
    g += `<polyline class="line-model" points="${bins.map((b) => `${C.r1(X(b.offset_s) + bw / 2)},${C.r1(Y(b.expected))}`).join(' ')}"/>`;
    const zx = X(0);
    g += `<line x1="${C.r1(zx)}" x2="${C.r1(zx)}" y1="${topY - 14}" y2="${base}" class="s-fg" stroke-width="1.5"/><text class="lbl" x="${C.r1(zx + 6)}" y="${topY - 4}">${s.mark}</text>`;
    const px = X(s.peak_offset_s) + bw / 2;
    g += `<text class="lbl-hi" x="${C.r1(px)}" y="${C.r1(Y(bins.find((b) => b.offset_s === s.peak_offset_s).n) - 8)}" text-anchor="middle">${f.signed(s.peak_offset_s)} s</text>`;
    [-120, -60, 0, 60].forEach((o, i) => { g += `<text x="${C.r1(X(o))}" y="${h - 4}" text-anchor="middle">${o === 0 ? '0' : f.signed(o / 60) + ' min'}</text>`; });
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Finishes in ten-second bins around ${s.mark}; the busiest bin is ${Math.abs(s.peak_offset_s)} seconds before it" class="grow">${g}</svg>`;
    el.closest('.card').classList.contains('is-in') && el.querySelector('svg').classList.add('x');
  }

  /* ---------- 6 · your card ---------- */
  function renderYou() {
    const g = PN.race.goal;
    const mk = ft.marks.find((m) => m.minutes === g);
    const before = H.get(g - 1), ex = E.get(g - 1);
    const ratio = mk ? mk.ratio : before && ex ? before.all / ex : null;
    const b = near(ft.bubble), s = near(ft.seconds);
    const note = (m) => (m.minutes === g ? '' : ` (nearest round time, ${m.mark})`);
    const rows = [
      ratio ? [`${ratio.toFixed(2)}×`, `the finishes a smooth curve expects in ${mm(g - 1)}, the minute before your goal`] : null,
      before ? [f.int(before.all), `finishes landed in ${mm(g - 1)}:00–${mm(g - 1)}:59`] : null,
      [f.pct(b.over.share_under), `got under ${b.mark} from up to 2 minutes behind at 40K${note(b)}`],
      [`${Math.abs(s.peak_offset_s)} s`, `under the line is where the pile peaks${note(s)}`],
    ].filter(Boolean);
    set('you-list', rows.map(([v, t]) => `<div class="you-row"><b>${v}</b><span>${t}</span></div>`).join(''));
    $('#you').dataset.shareYou = `My ${mm(g)}, at the finish line`;
  }

  /* ---------- next stretch ---------- */
  set('next-w', Math.round(demo.overall.women_slowdown * 100));
  set('next-m', Math.round(demo.overall.men_slowdown * 100));

  /* ---------- cover art: three runners and the finish banner ---------- */
  const art = $('[data-cover-runners]');
  const kits = [['#15171C', '#F5F0E6', '#5A3825', 0.2, '2%'], ['#FF5B2E', '#15171C', '#C68642', 0.55, '27%'], ['#F5F0E6', '#15171C', '#E0AC69', 0.85, '50%']];
  art.innerHTML = kits.map((k) => `<svg viewBox="0 0 100 110" class="runner-svg" style="left:${k[4]}"></svg>`).join('');
  const arts = art.querySelectorAll('svg');
  let t0 = performance.now(), live = false;
  const drawArt = (now) => { const t = (now - t0) / 1000; arts.forEach((s, i) => { s.innerHTML = PNRunner.markup(kits[i][3] + t * 1.45, { kit: kits[i][0], shorts: kits[i][1], skin: kits[i][2], effort: i === 0 ? 0.5 : 0 }); }); if (live && t < 30) requestAnimationFrame(drawArt); };
  drawArt(t0);
  new IntersectionObserver(([e]) => { live = e.isIntersecting && !PN.reduced(); if (live) { t0 = performance.now(); requestAnimationFrame(drawArt); } }).observe(art);

  /* ---------- render + follow the goal + units ---------- */
  const all = () => { drawPeak(); peakYou(); drawTowers(); renderCushion(); renderYou(); };
  all();
  PN.on('race', () => { at = PN.race.goal - 1; if (!lensTouched) lens = near(ft.seconds).mark; all(); if (!rescue.classList.contains('is-revealed')) renderRescue(); });
  PN.on('units', () => { document.querySelector('.toc a[href="#rescue"]').lastChild.textContent = `The ${f.finalStretch()}`; });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawPeak(); drawTowers(); renderCushion(); }, 150); });
  document.querySelectorAll('[data-next-rail]').forEach(PN.nextRail);
  PN.observe();
})();
