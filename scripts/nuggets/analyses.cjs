'use strict';
// Independent recounts of the analysis and /slowdown nuggets (WP3), for scripts/verify-nuggets.cjs. Each reads the
// published JSON directly and recomputes the nugget's values with a second, deliberately plain implementation, then
// checks the guard and that the shown sentence names the recounted figures. `fixtures()` builds each nugget from data
// whose guard fails and checks that its neutral fallback renders.
module.exports = function analyses({ json, eq, ok, core }) {
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
  const close = (a, b, message, tol = 1e-9) => ok(near(a, b, tol), `${message}: ${a} vs ${b}`);
  const pct = (share) => `${Math.round(share * 100)}%`;
  const hm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
  const msOf = (s) => { const t = Math.round(Math.abs(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const shown = (n, units = 'mi') => core.sentenceOf(n, units);
  const KM = 42.195, ENDS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
  const GOAL = 240;

  const guide = json('public/data/packs/ext_personalized_guide/summary.json');
  const cityFile = (city) => json(`public/data/packs/ext_personalized_guide/tables/${guide.cities.find((c) => c.city === city).file}`);
  let all = null;
  const allCourses = () => (all ??= cityFile('All courses').cohorts['all|all|all']);
  const kick = json('public/data/insights/kick.json');
  const af = json('public/data/all-finisher-context/evidence.json');
  const afRow = af.rows.find((r) => r.city === 'All courses' && r.age === 'all' && r.gender === 'all' && r.early_pace === 'all');
  const study = json('public/data/study/evidence.json');
  const wx = json('public/data/weather/evidence.json');
  const under = (dist, minutes) => dist.cdf[minutes - (dist.cdf_min ?? 150)] / dist.n;

  const R = {};

  R['kick.bank'] = (n) => {
    let fastest = null;
    for (const b of kick.bank.bands) if (b.n >= 100 && (!fastest || b.open_s < fastest.open_s)) fastest = b;
    eq([n.values.band, n.values.open_s, n.values.finish_s, n.values.slowdown, n.values.expected], [fastest.label, fastest.open_s, fastest.finish_s, fastest.slowdown, fastest.expected], 'kick.bank recounts the fastest band');
    eq(n.guard, fastest.open_s < 0 && fastest.finish_s > 0, 'kick.bank: guard');
    // The H1 gives the meaning (what it gave back from 5K on, as a multiple of what it banked); the receipt has the times.
    if (n.guard) {
      const r = (fastest.finish_s - fastest.open_s) / -fastest.open_s, k = Math.round(r);
      const words = !(r > 1) || k < 2 ? 'more than' : `${r < k ? 'almost' : 'more than'} ${k === 2 ? 'twice' : `${['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][k] ?? k} times`}`;
      ok(shown(n).includes(`gave back *${words}* what it banked`), `kick.bank: the headline says the recounted multiple (${r.toFixed(2)}: ${words})`);
      ok(!/\d:\d\d/.test(shown(n)), 'kick.bank: the H1 says no time (the receipt under it does)');
      eq(n.figure.value, msOf(fastest.finish_s), 'kick.bank: the figure is the finish gap');
    }
  };

  R['kick.sweetspot'] = (n) => {
    // The best bin and its plateau: the unbroken run of 1% neighbours within 10 seconds of its finish.
    const usable = kick.bank.curve.filter((c) => c.n >= 100).sort((a, b) => a.lo - b.lo);
    let best = null;
    for (const c of usable) if (!best || c.finish_s < best.finish_s) best = c;
    let a = usable.indexOf(best), b = a;
    const near = (c, prev) => c && Math.abs(c.lo - prev.lo) === 1 && c.finish_s - best.finish_s <= 10;
    while (near(usable[a - 1], usable[a])) a -= 1;
    while (near(usable[b + 1], usable[b])) b += 1;
    const bins = usable.slice(a, b + 1);
    eq(n.values.best_lo, best.lo, 'kick.sweetspot recounts the best opening bin');
    eq(n.values.lo, bins[0].lo, 'kick.sweetspot recounts the plateau\'s first bin');
    eq(n.values.hi, bins[bins.length - 1].lo + 1, 'kick.sweetspot recounts the plateau\'s end');
    eq(n.guard, bins[0].lo >= 0 && best.lo > 0 && bins.every((c) => c.finish_s < 0), 'kick.sweetspot: guard');
    // The band, never one bin; how close its bins finished is the readout's (WP9 round 4).
    if (n.guard && bins.length > 1) ok(shown(n).includes(`${bins[0].lo}–${bins[bins.length - 1].lo + 1}% slower*`) && shown(n).split(/\s+/).length <= 12, 'kick.sweetspot: the headline names the band, in at most 12 words');
  };

  const fastIds = af.opening_bands.filter((b) => typeof b.upper === 'number' && b.upper <= -5).map((b) => b.id);
  R['downhill.opening'] = (n) => {
    const share = (terrain) => {
      let fast = 0, total = 0;
      for (const g of afRow.downhill) if (g.terrain === terrain) { total += g.n; if (fastIds.includes(g.opening)) fast += g.n; }
      return fast / total;
    };
    const a = share('downhill'), b = share('other');
    close(n.values.downhill, a, 'downhill.opening recounts the downhill share');
    close(n.values.other, b, 'downhill.opening recounts the other share');
    eq(n.guard, Math.abs(a - b) < 0.02, 'downhill.opening: guard (within 2 points)');
  };

  R['downhill.bands'] = (n) => {
    // The pattern across every band (never the widest gap): no band 2 points or more higher on the downhill-start
    // courses, none more than 5 points lower, and at least one 2 or more lower ("similar or slightly fewer").
    const gaps = [];
    for (const band of af.opening_bands) {
      const d = afRow.downhill.find((g) => g.terrain === 'downhill' && g.opening === band.id);
      const o = afRow.downhill.find((g) => g.terrain === 'other' && g.opening === band.id);
      if (!d || !o || d.n < 100 || o.n < 100) continue;
      gaps.push(Math.round(o.slowdown_pct) - Math.round(d.slowdown_pct));
    }
    const fewer = gaps.filter((g) => g >= 2).length, more = gaps.filter((g) => g <= -2).length, widest = Math.max(...gaps);
    eq([n.values.fewer, n.values.more, n.values.total, n.values.widest], [fewer, more, gaps.length, widest], 'downhill.bands recounts the bands each way');
    eq(n.guard, gaps.length >= 3 && more === 0 && widest <= 5, 'downhill.bands: guard (no band higher, none more than 5 points lower)');
    if (n.guard) ok(shown(n).includes(fewer ? '*similar or slightly fewer*' : '*about the same*'), 'downhill.bands: the sentence states the pattern');
  };

  R['pattern.profile'] = (n) => {
    const p = allCourses().profiles[String(GOAL)].pace.map((x) => x[1]);
    const even = GOAL * 60 / KM;
    let fast = 0, slow = 0;
    p.forEach((v, i) => { if (v < p[fast]) fast = i; if (v > p[slow]) slow = i; });
    eq([n.values.fast_i, n.values.slow_i], [fast, slow], 'pattern.profile recounts the fastest and slowest 5K');
    eq(n.guard, p[fast] < even && even < p[slow] && fast < slow, 'pattern.profile: guard');
    // In runner words: "25 seconds a mile fast early and *40 slow* late"; the figure is the late number.
    const mi = (s) => Math.round(s * 1.609344);
    if (n.guard) ok(shown(n, 'mi').includes(`${mi(even - p[fast])} seconds a mile fast`) && shown(n, 'mi').includes(`*${mi(p[slow] - even)} slow*`), 'pattern.profile: the miles headline names both gaps');
    if (n.guard) ok(shown(n, 'km').includes(`${Math.round(even - p[fast])} seconds a kilometer fast`) && shown(n, 'km').includes(`*${Math.round(p[slow] - even)} slow*`), 'pattern.profile: the kilometres headline');
    if (n.guard) eq([n.figure.value, n.figureKm.value], [String(mi(p[slow] - even)), String(Math.round(p[slow] - even))], 'pattern.profile: the figure is the late gap in both units');
  };

  const checkpointRows = () => json(`public/data/packs/ext_personalized_guide/tables/${guide.cities.find((c) => c.city === 'All courses').checkpoint_file}`).rows
    .filter((r) => r.checkpoint === 30 && r.trend === 'all' && r.age === 'all' && r.gender === 'all');
  let cp = null;
  const cpRows = () => (cp ??= checkpointRows());
  R['checkpoint.under'] = (n) => {
    const band = Math.floor(GOAL * 30 / KM / 2) * 2;
    const row = cpRows().find((r) => r.elapsed === band);
    const share = under(row, GOAL);
    close(n.values.share, share, 'checkpoint.under recounts the share');
    eq(n.values.band_min, band, 'checkpoint.under: the even-pace band');
    eq(n.guard, row.n >= 100 && share < 0.5, 'checkpoint.under: guard');
    ok(shown(n).includes(pct(share)), 'checkpoint.under: the sentence names the share');
  };
  R['checkpoint.cushion'] = (n) => {
    const curve = cpRows().filter((r) => r.n >= 100).map((r) => ({ e: r.elapsed, s: under(r, GOAL) })).sort((a, b) => a.e - b.e);
    let at = NaN;
    for (let i = 0; i + 1 < curve.length; i++) if (curve[i].s >= 0.5 && curve[i + 1].s < 0.5 && curve[i + 1].e - curve[i].e === 2) { at = curve[i].e + 1 + 2 * (curve[i].s - 0.5) / (curve[i].s - curve[i + 1].s); break; }
    close(n.values.half_at_min, at, 'checkpoint.cushion recounts the 50% split', 1e-6);
    const ahead = GOAL * 30 / KM - at;
    eq(n.guard, Math.round(ahead) >= 1, 'checkpoint.cushion: guard');
  };

  R['sections.split'] = (n) => {
    const x = allCourses().near.find((r) => r.target === GOAL);
    let total = 0, after = 0;
    x.above.durations.forEach((a, i) => { const d = a - x.below.durations[i]; total += d; if (ENDS[i] > 20) after += d; });
    close(n.values.gap_s, total, 'sections.split recounts the gap', 1e-6);
    close(n.values.share, after / total, 'sections.split recounts the share after 20K', 1e-9);
    eq(n.guard, after / total > (KM - 20) / KM, 'sections.split: guard (more than its share of the distance)');
    if (n.guard) ok(shown(n).includes(msOf(total)) && shown(n).includes(pct(after / total)), 'sections.split: the sentence names both');
  };

  R['target.context'] = (n) => {
    const c = allCourses();
    const s = [under(c, GOAL), under(c, 210), under(c, 180)];
    close(n.values.share, s[0], 'target.context: under 4:00'); close(n.values.share2, s[1], 'target.context: under 3:30'); close(n.values.share3, s[2], 'target.context: under 3:00');
    eq(n.guard, s[0] > s[1] && s[1] > s[2] && s[2] < 0.1, 'target.context: guard');
    // The finding is the lowest mark's (chapter 01 owns the share under 4:00): the sentence names 3:00 and its share.
    ok(shown(n).startsWith('Only ') && shown(n).endsWith('under 3:00.') && shown(n).includes(`*${pct(s[2])}*`) && !shown(n).includes(pct(s[0])), 'target.context: the sentence names the share under 3:00, not under 4:00');
    // The card's key sets the share against the goal's own (the comparison that makes it a finding).
    eq(n.key, `of finishes were under 3:00, against ${pct(s[0])} under 4:00`, 'target.context: the key names its comparison');
  };

  R['age.retention'] = (n) => {
    const rows = [];
    for (const c of Object.values(cityFile('All courses').cohorts)) {
      if (c.age === 'all' || c.gender !== 'all' || c.prior !== 'all') continue;
      const p = c.profiles[String(GOAL)];
      if (c.n >= 100 && p && p.n >= 100) rows.push({ age: c.age, pooled: c.retention, same: p.retention });
    }
    let lo = rows[0], hi = rows[0];
    for (const r of rows) { if (r.pooled < lo.pooled) lo = r; if (r.pooled > hi.pooled) hi = r; }
    const same = Math.max(...rows.map((r) => r.same)) - Math.min(...rows.map((r) => r.same));
    eq([n.values.groups, n.values.pooled_lo_age, n.values.pooled_hi_age], [rows.length, lo.age, hi.age], 'age.retention recounts the pooled extremes');
    close(n.values.same_spread, same, 'age.retention recounts the same-finish spread');
    eq(n.guard, parseInt(hi.age, 10) > parseInt(lo.age, 10) && same <= 1.5 && same < (hi.pooled - lo.pooled) / 2, 'age.retention: guard');
    // "The youngest and oldest" only on a U: the least slowing at a middle age, both ends a point or more above it.
    rows.sort((a, b) => parseInt(a.age, 10) - parseInt(b.age, 10));
    const u = rows.length >= 3 && lo !== rows[0] && lo !== rows[rows.length - 1] && rows[0].pooled - lo.pooled >= 1 && rows[rows.length - 1].pooled - lo.pooled >= 1;
    // The finding alone (one clause, three lines on a phone); the pooled shape is the page's dek, from u_shape.
    if (n.guard) ok(shown(n) === 'At the same finish time, age *barely mattered*.' && n.values.u_shape === (u ? 1 : 0), 'age.retention: the finding alone, and the pooled shape in values');
  };

  const courseRange = () => {
    const list = afRow.courses.filter((c) => c.n >= 100 && c.edition_n >= 3);
    let lo = list[0], hi = list[0];
    for (const c of list) { if (c.slowdown_pct < lo.slowdown_pct) lo = c; if (c.slowdown_pct > hi.slowdown_pct) hi = c; }
    return { list, lo, hi };
  };
  R['courses.compare'] = (n) => {
    const { lo, hi } = courseRange();
    eq([n.values.lo_course, n.values.hi_course], [lo.label, hi.label], 'courses.compare recounts the extremes');
    ok(!shown(n).includes(lo.label) && !shown(n).includes(hi.label), 'courses.compare: the headline names no course');
    ok(shown(n).includes(pct(lo.slowdown_pct / 100)) && shown(n).includes(pct(hi.slowdown_pct / 100)), 'courses.compare: the headline names both ends');
    if (n.guard) ok(shown(n).includes(`*${pct(hi.slowdown_pct / 100)}*`), 'courses.compare: the accent is the high end, the card\'s orange dot');
    // The card's figure is the range the page's H1 gives, its two ends in whole percent (round 6: one number on both
    // sides of the tap).
    const range = `${pct(lo.slowdown_pct / 100).replace('%', '')}–${pct(hi.slowdown_pct / 100).replace('%', '')}`;
    eq(n.figure && `${n.figure.value}${n.figure.unit}`, `${range}%`, 'courses.compare: the card\'s figure is the H1\'s range');
    eq(n.key, 'sustained slowdown, course by course', 'courses.compare: the key');
  };

  R['terrain.climb'] = (n) => {
    // Each 5K near the goal against the same 5K on every course combined (each against its own distance-weighted
    // average), on the courses the page may draw: a supplied route at the release's step whose profile does not sit at or
    // under 0 m for 0.5 km away from the polders. The reading is the climbing 5K (30 m or more, after the first 5K) that
    // ran slowest against elsewhere, over every such course.
    const geo = json('public/data/insights/course-geometry.json').courses;
    const step = geo[0].elevation_step_km;
    const wet = (g) => {
      if (g.city === 'Amsterdam' || g.city === 'Rotterdam') return false;
      let run = 0;
      for (const m of g.elevation_m) { run = m <= 0 ? run + 1 : 0; if ((run - 1) * g.elevation_step_km >= 0.5) return true; }
      return false;
    };
    const len = ENDS.map((e, i) => e - (i ? ENDS[i - 1] : 0));
    const rel = (p) => { const mean = p.reduce((a, v, i) => a + v * len[i], 0) / KM; return p.map((v) => (v / mean - 1) * 100); };
    const base = rel(allCourses().profiles[String(GOAL)].pace.map((x) => x[1]));
    let best = null;
    for (const c of guide.cities) {
      if (c.city === 'All courses') continue;
      const g = geo.find((x) => x.city === c.city);
      if (!g || g.elevation_step_km !== step || wet(g)) continue;
      const d = cityFile(c.city), p = d.cohorts['all|all|all']?.profiles[String(GOAL)];
      if (!p || d.terrain.length !== 9) continue;
      const own = rel(p.pace.map((x) => x[1]));
      for (let i = 1; i < 9; i++) {
        const t = d.terrain.find((x) => Math.abs(x.end - ENDS[i]) < 0.001);
        if (!t || !(t.gain >= 30)) continue;
        if (!best || own[i] - base[i] > best.vs) best = { city: c.city, i, vs: own[i] - base[i] };
      }
    }
    ok(!!best, 'terrain.climb: some drawn course has a climbing 5K');
    eq(n.values.city, best.city, 'terrain.climb recounts the data-chosen course');
    eq(n.values.climb_i, best.i, 'terrain.climb: its climbing 5K');
    close(n.values.vs, best.vs, 'terrain.climb: against the same 5K elsewhere', 1e-9);
    ok(!wet(geo.find((g) => g.city === best.city)), 'terrain.climb: the chosen profile does not read the water under a bridge');
    eq(n.guard, Math.round(best.vs) >= 2, 'terrain.climb: guard (2% slower or more)');
    const at = best.i === 8 ? '40K–finish' : `${ENDS[best.i - 1]}–${ENDS[best.i]}K`;
    if (n.guard) {
      ok(shown(n).includes(`${at} climb ran *${Math.round(best.vs)}% slower*`), 'terrain.climb: the headline names the section and the recounted gap');
      eq(n.figure.value, String(Math.round(best.vs)), 'terrain.climb: the figure is the gap against elsewhere');
    }
  };

  R['weather.start'] = (n) => {
    const bands = afRow.weather.filter((g) => g.edition_n >= 5 && g.n >= 100);
    let low = bands[0], cold = bands[0];
    for (const g of bands) { if (g.slowdown_pct < low.slowdown_pct) low = g; if ((g.upper_c ?? Infinity) < (cold.upper_c ?? Infinity)) cold = g; }
    eq(n.values.band, low.id, 'weather.start recounts the steadiest band');
    eq(n.guard, low.id !== cold.id, 'weather.start: guard (not the coldest)');
    if (low.lower_c !== null && low.upper_c !== null) ok(shown(n, 'mi').includes(`${Math.round(low.lower_c * 1.8 + 32)}–${Math.round(low.upper_c * 1.8 + 32)}°F`) && shown(n, 'km').includes(`${low.lower_c}–${low.upper_c}°C`), 'weather.start: the band in both units');
  };
  R['weather.warming'] = (n) => {
    const c = wx.candidates.find((x) => x.id === 'warming');
    // The base: the median race's second-20K change, recounted from the editions (each race once).
    const v = wx.editions.map((e) => e.pace_change_pct).filter(Number.isFinite).sort((a, b) => a - b);
    const base = (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2;
    const was = Math.round(base), now = Math.round(base + c.effect.estimate);
    eq(n.values.base, base, 'weather.warming: the base is the median race');
    eq(n.guard, c.status === 'ready' && c.takeaway_type === 'association' && c.effect.low > 0 && now > was, 'weather.warming: guard');
    if (n.guard) {
      ok(shown(n).includes(`*about ${now}%* slower, not ${was}%`) && shown(n, 'mi').includes(`${(c.exposure.q75 * 1.8).toFixed(0)}°F instead of ${(c.exposure.q25 * 1.8).toFixed(0)}°F`), 'weather.warming: the sentence names both mornings and both percents');
      // Said in the runner's unit (round 6): never "points".
      ok(!/\bpoints?\b/.test(shown(n, 'mi') + shown(n, 'km')), 'weather.warming: no "points" in the H1');
      eq(n.figure && n.figure.value, String(now), 'weather.warming: the figure is the larger rise\'s percent');
    }
  };
  R['weather.wind'] = (n) => {
    const c = wx.candidates.find((x) => x.id === 'wind');
    eq(n.guard, c.status === 'ready' && c.takeaway_type === 'precise_null' && Math.abs(c.effect.low) < 1 && Math.abs(c.effect.high) < 1, 'weather.wind: guard (the interval inside ±1 point)');
    if (n.guard) {
      ok(shown(n, 'mi').includes(`${Math.round(c.exposure.q75 * 2.2369362920544)} mph wind at the start instead of ${Math.round(c.exposure.q25 * 2.2369362920544)} mph`), 'weather.wind: the wind in mph');
      ok(!/\bpoints?\b/.test(shown(n, 'mi') + shown(n, 'km')), 'weather.wind: no "points" in the H1');
    }
  };

  R['kick.recurrence'] = (n) => {
    const a = kick.recurrence.after_slowdown;
    eq([n.values.observed, n.values.expected], [a.observed, a.expected], 'kick.recurrence recounts');
    eq(n.guard, a.pairs >= 100 && a.observed > a.expected, 'kick.recurrence: guard');
    ok(shown(n).includes(pct(a.observed)) && shown(n).includes(pct(a.expected)), 'kick.recurrence: the sentence names both');
  };
  R['gains.final'] = (n) => {
    const g = allCourses().gains[String(GOAL)];
    close(n.values.share, g.values[2] / g.total, 'gains.final recounts the share');
    eq(n.guard, g.n >= 100 && g.values[2] / g.total > (KM - 30) / KM && g.values[2] > g.values[1], 'gains.final: guard (more than its share of the distance, and more than the 20K before)');
    if (n.guard) ok(!/\d+%/.test(shown(n)) && shown(n).includes('after 30K'), 'gains.final: the H1 gives the meaning, the receipt the share');
  };

  R['slowdown.onset'] = (n) => {
    const rows = study.timing.charts[0].rows;
    let late = 0, total = 0;
    for (const r of rows) { total += r.episodes; if (r.label >= 30) late += r.episodes; }
    eq([n.values.late, n.values.total], [late, total], 'slowdown.onset recounts the onsets');
    eq(n.guard, late / total >= 0.5, 'slowdown.onset: guard');
    ok(!n.placeholder, 'slowdown.onset is a real nugget');
  };
  R['slowdown.history'] = (n) => {
    const rows = study.figures.find((f) => f.id === 'history').charts[0].rows.filter((r) => r.n_value >= 100);
    const rising = rows.every((r, i) => !i || r.value > rows[i - 1].value);
    eq(n.values.first, String(rows[0].label), 'slowdown.history: first band');
    close(n.values.last_share, rows[rows.length - 1].value / 100, 'slowdown.history: last share');
    eq(n.guard, rising, 'slowdown.history: guard (rising band by band)');
  };

  /** Each builder on data whose guard fails renders its neutral fallback. */
  function fixtures(A) {
    const band = (label, open_s, finish_s) => ({ label, n: 1000, slowdown: 0.3, expected: 0.3, open_s, after20_s: 0, finish_s });
    const g = (terrain, opening, n, slowdown_pct) => ({ terrain, opening, n, slowdown_pct, city_n: 3, edition_n: 10 });
    const bands = [{ id: 'f', label: 'F', lower: null, upper: -10 }, { id: 's', label: 'S', lower: -2, upper: 2 }];
    return [
      [A.kickBankFrom([band('More than 10% faster', -100, -20)]), 'How a fast first 5K finished, against the same pace.'],
      [A.kickSweetSpotFrom([{ lo: -3, n: 500, slowdown: 0.3, excess: 0, open_s: -10, after20_s: 0, finish_s: -20 }]), 'The best average finish went with a first 5K 2–3% faster than the pace that followed.'],
      [A.downhillOpeningFrom([g('downhill', 'f', 300, 40), g('downhill', 's', 700, 20), g('other', 'f', 100, 40), g('other', 's', 900, 20)], bands), '30% of downhill-start finishes opened more than 5% fast; elsewhere 10%.'],
      // Every band within a point: a null, said as one.
      [A.downhillBandsFrom([g('downhill', 'f', 300, 40), g('downhill', 's', 700, 30), g('other', 'f', 300, 40.6), g('other', 's', 900, 30.4)], bands), 'Sustained slowdown by opening band, downhill-start courses against the rest.'],
      [A.patternFrom([300, 300, 300, 300, 300, 300, 300, 300, 300]), 'How finishes near 4:00 paced each 5K, against even 4:00 pace.'],
      [A.checkpointUnderFrom({ n: 500, elapsed: 170, finish: [0, 14000, 0] }, 0.6), 'On even 4:00 pace at 30K, 60% of finishes got under 4:00.'],
      [A.checkpointCushionFrom([{ elapsed: 170, n: 500, share: 0.4, median: 0 }]), 'At 30K, the share that got under 4:00, by split.'],
      [A.sectionsSplitFrom({ below: { durations: Array(9).fill(100), n: 500 }, above: { durations: [130, 130, 130, 130, 101, 101, 101, 101, 101], n: 500 } }), 'Just under and just over 4:00: 2:05 apart at the finish, section by section.'],
      // A climb that ran like the same 5K elsewhere (1 point): no finding, said neutrally.
      [A.terrainClimbFrom('Fixture', [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ end: 5, gain: i === 2 ? 50 : 5, net: 0, pace: 300, pct: 0, vs: i === 2 ? 1 : 0 }))), 'Where Fixture climbs, against the same 5Ks elsewhere.'],
      [A.weatherStartFrom([{ id: 'c', lower_c: null, upper_c: 5, n: 500, edition_n: 9, slowdown_pct: 20 }, { id: 'w', lower_c: 5, upper_c: null, n: 500, edition_n: 9, slowdown_pct: 30 }]), 'Sustained slowdown by start temperature.'],
      [A.kickRecurrenceFrom({ pairs: 1000, after_slowdown: { pairs: 500, observed: 0.2, expected: 0.3 }, after_none: null }), 'After a sustained slowdown, 20% of next races had one too; 30% was typical.'],
      [A.gainsFinalFrom({ values: [5, 10, 2], total: 17, n: 500 }), 'Where improving finishes near 4:00 found their time.'],
      [A.slowdownHistoryFrom([{ label: 'Under 3 hours', value: 30, n: 500 }, { label: '4 hours or longer', value: 20, n: 500 }]), 'Sustained slowdown by earlier recorded best.'],
    ];
  }
  return { RECOUNT: R, fixtures };
};
