/* Home: the start line. Every number below is computed from the data files; guards keep wording honest. */
(async function () {
  const { f } = PN;
  PN.mountChrome({ chapter: '00', home: true });
  PN.dock.dataset.homeGate = 'hero';

  const [home, ft, courses, kick, study, arch, berlin, replay] = await Promise.all(['home', 'finish-times', 'courses', 'kick', 'study', 'archetypes', 'replay-berlin-2024', 'replay'].map(PN.data));

  /* ---------- hero ---------- */
  const years = courses.years.by_year.map((y) => y.year);
  const cohort = home.cohort;
  document.querySelector('[data-home="kicker"]').textContent = `Pace Notes · ${cohort.cities} marathons · ${Math.min(...years)}–${Math.max(...years)}`;
  document.querySelectorAll('[data-home^="millions"]').forEach((el) => { el.textContent = f.million(cohort.after_duplicate_screen); });

  const sel = document.getElementById('home-plan-course');
  courses.courses.map((c) => c.city).sort().forEach((city) => { const o = document.createElement('option'); o.textContent = city; sel.append(o); });
  sel.value = PN.race.course;
  const goalIn = document.getElementById('home-plan-goal');
  goalIn.value = f.goal(PN.race.goal);
  // The keypad rule from the live site: on a phone the dot key types a colon.
  goalIn.addEventListener('input', () => { if (matchMedia('(pointer: coarse)').matches) goalIn.value = goalIn.value.replace(/[.,]/g, ':'); });
  goalIn.addEventListener('change', () => { const g = PN.parseGoal(goalIn.value.replace(':', '')) || PN.parseGoal(goalIn.value); if (g) PN.setRace({ goal: Math.max(150, Math.min(390, g)) }); });
  sel.addEventListener('change', () => PN.setRace({ course: sel.value }));
  document.getElementById('home-plan').addEventListener('submit', (e) => { e.preventDefault(); goalIn.dispatchEvent(new Event('change')); PN.toast(`Opening your ${f.goal(PN.race.goal)} plan for ${PN.race.course}`); });

  const ed = replay.editions.find((e) => e.slug === 'berlin-2024') || replay.editions[0];
  document.querySelector('[data-hud="race"]').textContent = `${ed.city} ${ed.year}`;
  const hudClock = document.querySelector('[data-hud="clock"]');
  const hudHalf = document.querySelector('[data-hud="half"]');
  PNReplay.mount(document.querySelector('.hero-replay'), {
    rows: berlin.rows, start: Math.round(ed.first_finish_s * 0.98), speed: 420, mode: 'band', units: () => PN.units, labels: true,
    onTime: (t, s) => { hudClock.textContent = f.clock(t); hudHalf.textContent = `${Math.round((100 * s.notHalf) / s.n)}%`; },
  });

  /* ---------- stakes 1: guess first ---------- */
  const pats = home.patterns;
  const faster = pats.find((p) => p.label === 'Faster second 20 km');
  const share = faster.value; // percent
  const gIn = document.getElementById('guess-in'), gOut = document.getElementById('guess-out');
  const showGuess = () => { gOut.innerHTML = `${gIn.value}<small>%</small>`; gIn.setAttribute('aria-valuetext', `${gIn.value} percent`); PN.fillRange(gIn); };
  gIn.addEventListener('input', showGuess); showGuess();
  const guess = document.getElementById('guess');
  const RAMP = ['#0F8F62', '#C9B88E', '#C98A12', '#9A4A12']; // ordinal: faster → pronounced slowing
  const SHORT = { 'Faster second 20 km': 'Faster', 'Similar 20 km blocks': 'About even', 'Moderate slowing': 'Slowed', 'Pronounced slowing': 'Slowed a lot' };
  document.getElementById('guess-go').addEventListener('click', () => {
    guess.classList.add('is-revealed');
    const odo = guess.querySelector('[data-odo-text]');
    PN.odo(odo, share.toFixed(1));
    requestAnimationFrame(() => requestAnimationFrame(() => odo.querySelectorAll('.d').forEach((d, i) => { const c = d.querySelector('.col'); c.style.transitionDelay = `${i * 80}ms`; c.style.transform = `translateY(-${Number(d.dataset.v) * 10}%)`; })));
    guess.querySelector('[data-g="inN"]').textContent = f.inN(share / 100);
    const bar = guess.querySelector('[data-g="bar"]');
    bar.innerHTML = pats.map((p, i) => `<span style="background:${RAMP[i]};flex-grow:0"></span>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => bar.querySelectorAll('span').forEach((s, i) => { s.style.flexGrow = pats[i].value; })));
    guess.querySelector('[data-g="key"]').innerHTML = pats.map((p, i) => `<span><i style="background:${RAMP[i]}"></i>${SHORT[p.label] || p.label} <b>${p.value.toFixed(p.value < 10 ? 1 : 0)}%</b></span>`).join('');
    const mine = Number(gIn.value);
    guess.querySelector('[data-g="mine"]').textContent = `${mine}%`;
    const diff = mine - share;
    guess.querySelector('[data-g="diff"]').textContent = Math.abs(diff) < 1.5 ? 'Spot on' : `${Math.abs(Math.round(diff))} points ${diff > 0 ? 'high' : 'low'}`;
    guess.dataset.shareYou = `I guessed ${mine}%`;
    PN.updateTint();
  });

  /* ---------- stakes 2: three in ten ---------- */
  const rate = study.rate / 100;
  const stakesBig = document.querySelector('#stakes [data-odo]');
  PN.odo(stakesBig, String(Math.round(rate * 100)));
  const late = study.timing.charts[0].rows.filter((r) => r.label >= 30).reduce((s, r) => s + r.value, 0);
  document.querySelector('[data-s="late"]').textContent = `${Math.round(late)}%`;
  document.querySelector('[data-s="dots"]').innerHTML = PN.dots(Math.round(rate * 100), { label: `${Math.round(rate * 100)} of every 100 finishes had a sustained slowdown` });
  document.querySelector('#stakes .claim em').textContent = `${f.ratioWord(Math.round(rate * 10)).replace(/^./, (c) => c.toUpperCase())} in ten.`;

  /* ---------- guide: seven frames, one per chapter ---------- */
  const total = cohort.after_duplicate_screen;
  const medianOf = (key, n) => { let acc = 0; for (const h of ft.histogram) { acc += h[key]; if (acc >= n / 2) return h.minute; } return null; };
  const med = { all: medianOf('all', total), women: medianOf('women', cohort.women), men: medianOf('men', cohort.men) };
  const peak = ft.histogram.reduce((a, b) => (b.all > a.all ? b : a));
  const bos = courses.courses.find((c) => c.city === 'Boston');
  const pairs = courses.weather.pairs;
  const b0 = kick.bank.bands[0];
  const mIdx = arch.archetypes.findIndex((a) => a.slug === 'metronome');
  const river = arch.river;
  const rFirst = river[0], rLast = river[river.length - 1];
  const rec = kick.recurrence.after_slowdown;

  const H = PNCharts;
  const frames = [
    {
      ch: '01', t: 'The field', big: f.goal(med.all), claim: `Half of all finishes took longer than <em>${f.goal(med.all)}</em>.`,
      say: `Recorded women’s median ${f.goal(med.women)}, men’s ${f.goal(med.men)}.`,
      viz: medianStrip(med), link: '#',
    },
    {
      ch: '02', t: 'The course', big: `${bos.identified.correct}<span class="u low">/${bos.identified.editions}</span>`, odo: String(bos.identified.correct), claim: `Boston editions <em>named from their pacing shape</em> alone.`,
      say: `Every course bends its own way. Boston’s signature is a quick ${f.section(bos.signature_section)} after the hills.`,
      viz: H.curve(bos.deviation, { typical: bos.deviation.map(() => 0), glow: courses.sections.indexOf(bos.signature_section), w: 320, h: 70, label: 'Boston against the typical course' }), link: 'course-boston.html',
    },
    {
      ch: '03', t: 'Race morning', big: `${pairs.hotter_slowed_more}<span class="u low">/${pairs.total}</span>`, odo: String(pairs.hotter_slowed_more), claim: `same-course pairs: the <em>warmer race</em> had more sustained slowdowns.`,
      say: `Pairs of the same course started at least ${f.tempGap(pairs.min_gap_c)} apart.`,
      viz: H.waffle(pairs.total, pairs.hotter_slowed_more, { cols: 25, w: 320, gap: 2, label: `${pairs.hotter_slowed_more} of ${pairs.total} pairs` }), link: '#',
    },
    {
      ch: '04', t: 'The first 5K', big: f.ms(b0.after20_s), claim: `given back after 20K by finishes that <em>banked ${f.ms(-b0.open_s)}</em> in the first 5K.`,
      say: `Against finishes in the same race at the same 5–20K pace.`,
      viz: ledger(b0), link: 'analysis-starting-pace.html',
    },
    {
      ch: '05', t: 'The shape of a race', big: `${Math.round(rFirst.shares[mIdx] * 100)}<span class="u">%</span>`, odo: String(Math.round(rFirst.shares[mIdx] * 100)), claim: `of ${bandLabel(rFirst)} finishes held an even pace. Of ${bandLabel(rLast)}: <em>${Math.round(rLast.shares[mIdx] * 100)}%</em>.`,
      say: 'Even pacing fades with the clock.',
      viz: riverLine(river, mIdx), link: '#',
    },
    {
      ch: '08', t: 'The finish line', big: f.goal(peak.minute), claim: `The busiest minute to <em>finish a marathon</em>.`,
      say: `${f.int(peak.all)} finishes landed between ${f.goal(peak.minute)}:00 and ${f.goal(peak.minute)}:59.`,
      viz: H.histogram(ft.histogram, { from: 150, to: 330, w: 320, h: 84, lit: [peak.minute], ticks: [180, 240, 300], label: `Finishes per minute; the tallest is ${f.goal(peak.minute)}`, padTop: 20 }), link: 'chapter-finish-line.html',
    },
    {
      ch: '11', t: 'The next one', big: `${Math.round(rec.observed * 100)}<span class="u">%</span>`, odo: String(Math.round(rec.observed * 100)), claim: `After a sustained slowdown, the next race <em>had one too</em>.`,
      say: `Typical for that race and pace: ${Math.round(rec.expected * 100)}%.`,
      viz: H.bars([{ label: 'After a slowdown', value: rec.observed * 100, hi: true }, { label: 'Typical', value: rec.expected * 100 }], { w: 320, rowH: 24, gap: 10, max: 60, labelW: 112, fmt: (v) => `${Math.round(v)}%`, label: 'Observed against typical' }), link: '#',
    },
  ];

  const track = document.querySelector('[data-deck-track]');
  track.innerHTML = frames.map((fr, i) => {
    const c = PN.CHAPTERS.find((x) => x.n === fr.ch);
    const bigHtml = fr.odo ? fr.big.replace(fr.odo, `<span data-odo="${fr.odo}"></span>`) : `<span data-odo="${fr.big}"></span>`;
    return `<article class="frame f-${c.f}" data-nugget data-share-kick="${fr.ch} · ${fr.t}" aria-roledescription="slide" aria-label="${i + 1} of ${frames.length}: ${c.t}">
      <div class="kick"><span class="k-ch"><span class="k-dot"></span>${fr.ch} · ${fr.t}</span><span class="k-n">${i + 1}/${frames.length}</span></div>
      <div class="body">
        <div class="big ${fr.big.length > 4 ? 'md' : ''}">${bigHtml}</div>
        <p class="claim">${fr.claim}</p>
        <p class="say">${fr.say}</p>
      </div>
      <div class="micro viz" data-share-viz>${fr.viz}</div>
      <div class="foot"><a class="link-more" href="${fr.link}">Read</a><button class="btn btn-sm" type="button" data-share>Share</button></div>
    </article>`;
  }).join('');
  track.querySelectorAll('[data-odo]').forEach((el) => PN.odo(el, el.dataset.odo));
  const bars = document.querySelector('.deck-bars');
  bars.innerHTML = frames.map(() => '<i></i>').join('');
  const count = document.querySelector('[data-deck-count]');
  const frameEls = Array.from(track.children);
  const onDeck = () => {
    const w = frameEls[0].getBoundingClientRect().width + 12;
    const p = track.scrollLeft / w;
    bars.querySelectorAll('i').forEach((b, i) => b.style.setProperty('--fill', Math.max(0, Math.min(1, p - i + 1)).toFixed(3)));
    count.textContent = `${Math.min(frames.length, Math.round(p) + 1)} of ${frames.length}`;
  };
  track.addEventListener('scroll', () => requestAnimationFrame(onDeck), { passive: true });
  onDeck();
  const go = (d) => { const w = frameEls[0].getBoundingClientRect().width + 12; track.scrollBy({ left: d * w, behavior: PN.reduced() ? 'auto' : 'smooth' }); };
  document.querySelector('[data-deck-prev]').addEventListener('click', () => go(-1));
  document.querySelector('[data-deck-next]').addEventListener('click', () => go(1));
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
  // Wrapped-style tap: the right third of a frame advances, the left third goes back (never on a control).
  track.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    const fr = e.target.closest('.frame'); if (!fr) return;
    const r = fr.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width;
    if (x > 0.66) go(1); else if (x < 0.33) go(-1);
  });

  /* ---------- steps: the personal example follows the goal ---------- */
  const stepsEx = document.querySelector('[data-steps="example"]');
  const renderSteps = () => {
    const g = PN.race.goal;
    const mark = ft.marks.find((m) => m.minutes === g);
    const before = ft.histogram.find((h) => h.minute === g - 1);
    const exp = ft.expected_curve.find((e) => e.minute === g - 1);
    const ratio = mark ? mark.ratio : before && exp ? before.all / exp.expected : null;
    if (ratio) stepsEx.innerHTML = `Every card answers for your time. At <b>${f.goal(g)}</b>, the minute before your goal held <b>${ratio.toFixed(2)}×</b> the finishes a smooth curve expects.`;
  };
  renderSteps(); PN.on('race', renderSteps);

  /* ---------- stories: the race map, inline ---------- */
  const mapEl = document.querySelector('[data-home-map]');
  const sheetMap = document.querySelector('#sheet-map .map');
  mapEl.innerHTML = sheetMap.innerHTML.replace(' aria-current="page"', '');
  const leads = await PN.leads();
  Object.entries(leads).forEach(([n, [v, s]]) => mapEl.querySelectorAll(`[data-lead="${n}"]`).forEach((el) => { el.innerHTML = `${v}<small>${s}</small>`; }));

  /* ---------- cta: three runners at their finish-time pace ---------- */
  const runners = document.querySelector('[data-cta-runners]');
  const kits = [['#FF5B2E', '#1E2A4A', '#8D5524'], ['#F4B23E', '#15171C', '#E0AC69'], ['#5C80FF', '#2B2A33', '#5A3825']];
  const chips = [PN.race.goal - 30, PN.race.goal, PN.race.goal + 30];
  runners.innerHTML = kits.map((k, i) => `<span class="cta-runner${i === 1 ? ' is-you' : ''}"><svg viewBox="0 0 100 110" class="runner-svg"></svg><b>${i === 1 ? 'You ' : ''}${f.goal(chips[i])}</b></span>`).join('');
  const kitsYou = [['#5C80FF', '#1E2A4A', '#5A3825'], ['#FF5B2E', '#15171C', '#C68642'], ['#F4B23E', '#2B2A33', '#E0AC69']];
  kits.splice(0, 3, ...kitsYou);
  const svgs = runners.querySelectorAll('svg');
  let t0 = performance.now(), animOn = false;
  const drawRunners = (now) => {
    const t = (now - t0) / 1000;
    svgs.forEach((s, i) => { s.innerHTML = PNRunner.markup(0.1 + i * 0.33 + t * (1.5 - i * 0.12), { kit: kits[i][0], shorts: kits[i][1], skin: kits[i][2] }); });
    if (animOn && t < 30) requestAnimationFrame(drawRunners);
  };
  drawRunners(t0);
  new IntersectionObserver(([e]) => { animOn = e.isIntersecting && !PN.reduced(); if (animOn) { t0 = performance.now(); requestAnimationFrame(drawRunners); } }).observe(runners);

  document.querySelector('[data-motion]').addEventListener('click', (e) => {
    const off = !document.documentElement.hasAttribute('data-motion-off');
    document.documentElement.toggleAttribute('data-motion-off', off);
    e.target.textContent = off ? 'Play animations' : 'Pause animations';
  });

  const dist = () => document.querySelectorAll('[data-dist]').forEach((el) => { el.textContent = PN.units === 'mi' ? '26.2 miles' : '42.2 km'; });
  dist(); PN.on('units', dist);
  PN.bindYou();
  PN.observe();

  /* ---------- helpers: micro charts specific to home frames ---------- */
  function bandLabel(r) { return r.label || `${f.goal(r.lo_min)}–${f.goal(r.lo_min + 15)}`; }
  function medianStrip(m) {
    const from = 200, to = 300, w = 320, X = (v) => 10 + ((w - 20) * (v - from)) / (to - from);
    let s = `<line class="axis" x1="10" x2="${w - 10}" y1="40" y2="40"/>`;
    [210, 240, 270].forEach((t) => { s += `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="36" y2="44"/><text x="${X(t)}" y="62" text-anchor="middle">${f.goal(t)}</text>`; });
    const pt = (v, lab, cls, ly, anchor = 'middle') => `<line class="lead" x1="${X(v)}" x2="${X(v)}" y1="${ly + 4}" y2="34"/><circle cx="${X(v)}" cy="40" r="${cls === 'm-hi' ? 7 : 5.5}" class="${cls} ring"/><text class="${cls === 'm-hi' ? 'lbl-hi' : 'lbl-sm'}" x="${X(v)}" y="${ly}" text-anchor="${anchor}">${lab}</text>`;
    s += pt(m.men, `Men ${f.goal(m.men)}`, 'm-fg', 22, 'end') + pt(m.women, `Women ${f.goal(m.women)}`, 'm-fg', 22, 'start') + pt(m.all, `All ${f.goal(m.all)}`, 'm-hi', 4);
    return `<svg viewBox="0 -12 ${w} 82" role="img" aria-label="Median finish times">${s}</svg>`;
  }
  function ledger(b) {
    const w = 320, max = Math.max(-b.open_s, b.after20_s), X = (v) => (240 * v) / max;
    const s = `<rect class="bar m-faster" x="0" y="8" width="${X(-b.open_s).toFixed(1)}" height="16" rx="4"/><text class="lbl" x="${(X(-b.open_s) + 8).toFixed(1)}" y="21">−${f.ms(-b.open_s)} first 5K</text>
      <rect class="bar m-slower" x="0" y="38" width="${X(b.after20_s).toFixed(1)}" height="16" rx="4"/><text class="lbl" x="${(X(b.after20_s) + 8).toFixed(1)}" y="51">+${f.ms(b.after20_s)}</text>
      <text class="lbl-sm" x="0" y="72">Net: ${f.ms(b.finish_s)} behind at the finish</text>`;
    return `<svg viewBox="0 0 ${w} 78" role="img" aria-label="Banked early against given back after 20K" class="growx">${s}</svg>`;
  }
  function riverLine(rv, m) {
    const w = 320, h = 70, n = rv.length, X = (i) => 6 + ((w - 12) * i) / (n - 1), Y = (v) => 8 + (h - 22) * (1 - v / 0.7);
    const pts = rv.map((r, i) => [X(i), Y(r.shares[m])]);
    let s = `<line class="axis" x1="0" x2="${w}" y1="${h - 14 + 0.5}" y2="${h - 14 + 0.5}"/>`;
    s += `<path class="line s-fg" d="${PNCharts.smooth(pts)}"/>`;
    s += `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="5" class="m-hi ring"/><circle cx="${pts[n - 1][0]}" cy="${pts[n - 1][1]}" r="5" class="m-hi ring"/>`;
    s += `<text x="0" y="${h}" >${f.goal(rv[0].lo_min)}</text><text x="${w}" y="${h}" text-anchor="end">${f.goal(rv[n - 1].lo_min)}</text>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Share of even-paced finishes by finish time" class="draw">${s}</svg>`;
  }
})();
