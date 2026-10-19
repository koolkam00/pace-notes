'use strict';
// Independent recounts of the story nuggets (WP2): /finish-times, the race replay and the stories, for
// scripts/verify-nuggets.cjs. Each reads the published JSON directly and recomputes the nugget's values with a second,
// deliberately plain implementation, then checks the guard and that the sentence the page shows names the recounted
// figures. `fixtures()` builds each nugget from data whose guard fails and returns the neutral fallback it must render.
// field.median and replay.first are WP0-C's reference nuggets, recounted in verify-nuggets itself.
module.exports = function stories({ json, eq, ok, core }) {
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
  const close = (a, b, message, tol = 1e-9) => ok(near(a, b, tol), `${message}: ${a} vs ${b}`);
  const pct = (share, digits = 0) => `${(share * 100).toFixed(digits)}%`;
  const hm = (min) => `${Math.floor(Math.round(min) / 60)}:${String(Math.round(min) % 60).padStart(2, '0')}`;
  const shown = (n, units = 'mi') => core.sentenceOf(n, units);
  const has = (n, text, message, units = 'mi') => ok(shown(n, units).includes(text), `${message}: "${text}" in "${shown(n, units)}"`);
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const word = (n) => WORDS[n] ?? String(n);
  const mat = (km) => (km >= 42.19 ? 'Finish' : `${km}K`);
  const section = (label) => { const [a, b] = label.split('–').map(Number); return b >= 42 ? `${a}K–finish` : `${a}–${b}K`; };

  const insights = json('public/data/insights/manifest.json');
  const ft = json('public/data/insights/finish-times.json');
  const replay = json('public/data/insights/replay.json');
  const types = json('public/data/insights/archetypes.json');
  const pos = json('public/data/insights/positions.json');
  const kick = json('public/data/insights/kick.json');
  const demo = json('public/data/insights/demographics.json');
  const courses = json('public/data/insights/courses.json');

  // Nearest-rank percentile minutes of all finishes from the one-minute histogram and the cohort total.
  const minuteAt = (p) => {
    const rank = Math.max(1, Math.ceil((Math.round(p * 100) * insights.cohort.after_duplicate_screen) / 100));
    let seen = 0;
    for (const row of ft.histogram) { seen += row.all; if (seen >= rank) return row.minute; }
    return null;
  };
  // The replay.first edition: the largest share of its field short of 20K at the first finish.
  let first = null;
  for (const e of replay.editions) if (e.moments && e.finishes > 0) { const s = e.moments.not_past_20_at_first / e.finishes; if (!first || s > first.s) first = { e, s }; }
  // The evenest type: the lowest median pace variation.
  let even = 0;
  types.archetypes.forEach((t, i) => { if (t.median_cv < types.archetypes[even].median_cv) even = i; });

  const R = {};

  R['field.middle'] = (n) => {
    const p25 = minuteAt(0.25), p50 = minuteAt(0.5), p75 = minuteAt(0.75);
    eq([n.values.p25, n.values.median, n.values.p75], [p25, p50, p75], 'field.middle recounts the quartiles');
    eq(n.guard, p25 < p50 && p50 < p75, 'field.middle: guard');
    if (n.guard) has(n, `*${hm(p25)} and ${hm(p75)}*`, 'field.middle names the quartiles');
  };

  R['field.front'] = (n) => {
    const e = courses.years.eras, s = e.summary;
    eq([n.values.p10_change, n.values.p90_change], [s.p10.change, s.p90.change], 'field.front reads the era changes');
    const mins = Math.round(-s.p10.change);
    eq(n.guard, s.p10.ci95[1] < 0 && s.p90.ci95[0] < 0 && s.p90.ci95[1] > 0 && mins >= 1, 'field.front: guard (front interval below zero, back interval straddles it)');
    if (n.guard) has(n, `*${word(mins)} minutes faster*`, 'field.front names the minutes');
    eq([n.values.pre_from, n.values.pre_to, n.values.post_from, n.values.post_to], [...e.pre, ...e.post], 'field.front carries the eras (the beat names them under its H2)');
    has({ ...n, guard: false }, `From ${e.pre[0]}–${String(e.pre[1]).slice(2)} to ${e.post[0]}–${String(e.post[1]).slice(2)}`, 'field.front: the fallback names the eras');
  };

  R['field.byrace'] = (n) => {
    const solid = courses.courses.filter((c) => c.finishes >= 100 && c.editions >= 3);
    let lo = solid[0], hi = solid[0];
    for (const c of solid) { if (c.median_s < lo.median_s) lo = c; if (c.median_s > hi.median_s) hi = c; }
    eq([n.values.low, n.values.high, n.values.courses], [lo.city, hi.city, solid.length], 'field.byrace recounts the extremes among courses with three or more editions');
    eq(n.guard, solid.length >= 2 && hi.median_s - lo.median_s >= 60, 'field.byrace: guard');
    if (n.guard) has(n, `course by\u00a0course: *${hm(Math.floor(lo.median_s / 60))} to ${hm(Math.floor(hi.median_s / 60))}*`, 'field.byrace names the medians floored to the minute, course by course (each a course median across its editions)');
    ok(!shown(n).includes(lo.city) && !shown(n).includes(hi.city), 'field.byrace: no course name in the headline (owner decision 7)');
  };

  R['replay.title'] = (n) => {
    eq(n.guard, first.s >= 0.45 && first.s < 0.5, 'replay.title: "nearly half" only from 0.45 to under 0.5');
    ok(!shown(n).includes(first.e.city), 'replay.title: the H1 leaves the race to the replay');
  };

  R['replay.back'] = (n) => {
    let least = null;
    for (const e of replay.editions) if (e.moments && Number.isFinite(e.moments.back_km_at_first) && (!least || e.moments.back_km_at_first < least.moments.back_km_at_first)) least = e;
    const km = least.moments.back_km_at_first;
    eq([n.values.slug, n.values.back_km], [least.slug, km], 'replay.back reads the edition whose back of the field had come least at the first finish');
    eq(n.guard, km > 0 && km < 42.195 / 2, 'replay.back: "just" while under half the distance');
    // One decimal in both units, kept when it is whole ("8.0 km" beside "4.9 mi"), held to its unit.
    has(n, `${(km / 1.609344).toFixed(1)}\u00a0mi`, 'replay.back: one-decimal miles', 'mi');
    has(n, `${km.toFixed(1)}\u00a0km`, 'replay.back: one-decimal kilometres', 'km');
    has(n, `When the first runner finished ${least.city === 'New York' ? 'New York City' : least.city} ${least.year},`, 'replay.back: the home band names the edition the data chose');
  };

  R['replay.packs'] = (n) => {
    const best = first.e;
    ok(best.pack && best.pack.n >= 100, 'replay.packs: the page’s edition has a pack of 100 or more finishes');
    eq(n.values.slug, best.slug, 'replay.packs: the page’s own edition (replay.first’s), so the story never switches race');
    const q = best.pack.quantiles.find((x) => x.km > 42);
    close(best.pack.finish_window_min, (q.p90_s - q.p10_s) / 60, 'replay.packs: the window is the middle 80% at the finish', 0.05);
    eq(n.guard, Math.round(best.pack.finish_window_min) >= 10, 'replay.packs: guard');
    if (n.guard) has(n, `Same ${mat(best.pack.checkpoint_km)} split, *${Math.round(best.pack.finish_window_min)}\u00a0minutes*`, 'replay.packs names the window (held to its unit)');
  };

  R['types.top'] = (n) => {
    const sorted = [...types.archetypes].sort((a, b) => b.share - a.share);
    const share = sorted[0].share + sorted[1].share;
    eq([n.values.first, n.values.second], [sorted[0].name, sorted[1].name], 'types.top: the two commonest types');
    close(n.values.share, share, 'types.top recounts their share together');
    eq(n.guard, share > 0.5 && share < 1, 'types.top: "most" needs more than half');
    eq(n.figure.value, String(Math.round(share * 100)), 'types.top: the figure');
    if (n.guard) has(n, `were *${sorted[0].name}s or ${sorted[1].name}s*.`, 'types.top names both types, the reading as its accent');
    eq(n.key, `were ${sorted[0].name}s or ${sorted[1].name}s`, 'types.top: the key names both types');
  };

  R['types.river'] = (n) => {
    const a = types.river[0].shares[even], b = types.river[types.river.length - 1].shares[even];
    eq([n.values.first, n.values.last], [a, b], 'types.river recounts the first and last band');
    eq(n.guard, a > 2 * b && b > 0, 'types.river: "fades" needs the first at least twice the last');
    if (n.guard) has(n, `*${pct(a)}* of ${types.river[0].label}`, 'types.river names the first band');
  };

  const gapRow = (rows) => rows.reduce((a, b) => (Math.abs(b.gap_lo_s - 60) < Math.abs(a.gap_lo_s - 60) ? b : a));
  R['places.gap'] = (n) => {
    const a = gapRow(pos.coin_flip['30']), b = gapRow(pos.coin_flip['40']);
    eq([n.values.at30, n.values.at40], [a.share, b.share], 'places.gap: the bands nearest a minute back');
    eq(n.guard, a.share > b.share, 'places.gap: "still" needs 30K above 40K');
    eq(n.figure.value, String(Math.round(a.share * 100)), 'places.gap: the figure');
    // "First" against what: the runner ahead at the mat, never the race (a runner would read "crossed first" as winning).
    ok(/still beat the runner ahead to the line$/.test(n.key), 'places.gap: the key names whom the finish beat');
    ok(!/crossed first|got to the line first/.test(shown(n)) && !/crossed first/.test(n.key), 'places.gap: never "crossed first"');
  };
  R['places.title'] = (n) => {
    const a = gapRow(pos.coin_flip['30']), b = gapRow(pos.coin_flip['40']);
    const r = a.share / b.share, k = Math.round(r);
    eq([n.values.at30, n.values.at40], [a.share, b.share], 'places.title: the reading\'s gap bands');
    eq(n.guard, k >= 2 && Math.abs(r - k) <= 0.25, 'places.title: the times in words need the ratio near a whole number');
    if (n.guard) has(n, `*${k === 2 ? 'twice' : `${word(k)} times`} as often*`, 'places.title names the ratio');
  };
  R['places.coin'] = (n) => {
    // The 30K band from three minutes back to ten whose share is nearest the 40K share a minute back.
    const b = gapRow(pos.coin_flip['40']);
    let a = null;
    for (const r of pos.coin_flip['30']) if (r.gap_lo_s >= 3 * Math.max(60, b.gap_lo_s) && r.gap_lo_s <= 600 && (!a || Math.abs(r.share - b.share) < Math.abs(a.share - b.share))) a = r;
    eq([n.values.gap30_s, n.values.at30, n.values.gap40_s, n.values.at40], [a.gap_lo_s, a.share, b.gap_lo_s, b.share], 'places.coin: the 30K band level with a minute back at 40K');
    eq(n.guard, Math.abs(a.share - b.share) <= 0.01, 'places.coin: "as often as" needs the two within a point');
    if (n.guard && a.gap_lo_s % 60 === 0) has(n, `${word(a.gap_lo_s / 60).replace(/^./, (c) => c.toUpperCase())} minutes back* at 30K matched`, 'places.coin names the 30K gap');
  };
  R['places.breakeven'] = (n) => {
    const rows = pos.breakeven;
    let x = null;
    for (let i = 1; i < rows.length && x === null; i++) if (rows[i - 1].median > 0 && rows[i].median <= 0) x = rows[i - 1].x + (rows[i].x - rows[i - 1].x) * rows[i - 1].median / (rows[i - 1].median - rows[i].median);
    close(n.values.crossing, x, 'places.breakeven recounts the zero crossing', 0.01);
    eq(n.guard, x > 0 && x < 60, 'places.breakeven: guard');
    if (n.guard) has(n, `*${Math.round(x)}% slower*`, 'places.breakeven names the crossing');
  };
  R['places.shuffle'] = (n) => {
    let up = 0, big = 0, drop = 0;
    for (const h of pos.histogram) { if (h.lo >= 10) big += h.share; if (h.lo <= -11) drop += h.share; }
    close(big, pos.surger_share, 'places.shuffle: big gains are the histogram from +10', 0.002);
    close(drop, pos.sinker_share, 'places.shuffle: big drops are the histogram from −10', 0.002);
    up = pos.gained_share;
    const r = pos.sinker_share / pos.surger_share;
    eq(n.guard, up > 0.5 && r >= 1.5, 'places.shuffle: guard');
    if (n.guard) has(n, `outnumbered big gains *${Math.round(r)} to 1*`, 'places.shuffle names the ratio');
  };

  R['kick.twins'] = (n) => {
    const s = kick.cost.stratified;
    eq(n.values.median_gap_s, s.median_gap_s, 'kick.twins reads the matched gap');
    eq(n.guard, s.median_gap_s > 600, 'kick.twins: guard (more than ten minutes)');
    eq(n.figure.value, String(Math.round(s.median_gap_s / 60)), 'kick.twins: the figure in minutes');
    if (n.guard) has(n, `*${Math.round(s.median_gap_s / 60)}\u00a0minutes*`, 'kick.twins: the minutes held to their unit');
  };
  R['kick.title'] = (n) => {
    eq(n.guard, kick.cost.stratified.median_gap_s > 600, 'kick.title: the headline needs a typical gap of more than ten minutes');
    // Round 4: the H1 is its own finding with its number, the same whole minutes kick.twins's figure gives.
    if (n.guard) ok(shown(n).includes(`*${Math.round(kick.cost.stratified.median_gap_s / 60)}\u00a0minutes* later`), 'kick.title: the H1 names the recounted minutes');
  };
  R['kick.bands'] = (n) => {
    const gaps = kick.cost.bands.filter((b) => b.slowdown_n >= 100 && b.other_n >= 100).map((b) => b.slowdown_finish_s - b.other_finish_s);
    eq([n.values.low_s, n.values.high_s], [Math.min(...gaps), Math.max(...gaps)], 'kick.bands recounts the range');
    eq(n.guard, gaps.length >= 2 && Math.min(...gaps) > 0, 'kick.bands: "every pace" needs a positive gap in each band');
  };
  R['kick.warning'] = (n) => {
    const w = kick.warning[Math.floor(kick.warning.length / 2)];
    const a = w.rows[0], b = w.rows[w.rows.length - 1];
    eq([n.values.section, n.values.slowed_later, n.values.faster_later], [w.after, b.later, a.later], 'kick.warning: the middle section, its first and last rows');
    eq(n.guard, b.later > 0.5 && a.later < b.later, 'kick.warning: guard');
    if (n.guard) has(n, `at ${section(w.after)}: *${pct(b.later)}*`, 'kick.warning names the section and share');
  };
  R['kick.stay'] = (n) => {
    const s = kick.recovery.stay[0];
    eq([n.values.stay, n.values.source], [s.stay, s.source], 'kick.stay reads the first transition');
    eq(n.guard, s.stay > 0.5, 'kick.stay: "no second wind" needs a majority');
    if (n.guard) has(n, `*${pct(s.stay)}* stayed that slow over ${section(s.target)}`, 'kick.stay names the share');
  };
  R['kick.magnet'] = (n) => {
    // The beat's subject is finishes with a sustained slowdown: their share, which the beat's last column draws.
    eq(kick.magnet[kick.magnet.length - 1].slowdown, kick.kick.slowdown_share, 'kick.magnet: the last section of the magnet is the slowdown group\'s kick share');
    close(kick.kick.slowdown_faster / kick.kick.slowdown_n, kick.kick.slowdown_share, 'kick.magnet: the slowdown share is its count over its group', 1e-9);
    eq(n.values.share, kick.kick.slowdown_share, 'kick.magnet: the sentence counts the slowdown group, not all finishes');
    eq(n.guard, kick.kick.slowdown_final_below_baseline < 0.1 && kick.kick.slowdown_share > 0.5, 'kick.magnet: guard');
    // The group is the beat's dek ("Finishes with a sustained slowdown."); the fallback names it in the sentence.
    if (n.guard) has(n, `Even so, *${pct(kick.kick.slowdown_share)}* sped up`, 'kick.magnet: the share');
    has({ ...n, guard: false }, `Of finishes with a sustained slowdown, ${pct(kick.kick.slowdown_share)}`, 'kick.magnet: the fallback names its denominator');
    has(n, 'last 1.4 mi', 'kick.magnet: the last 2.2 km in one-decimal miles', 'mi');
    has(n, 'last 2.2 km', 'kick.magnet: the last 2.2 km in kilometres', 'km');
  };

  R['finish.busiest'] = (n) => {
    let peak = ft.histogram[0];
    for (const h of ft.histogram) if (h.all > peak.all) peak = h;
    eq([n.values.minute, n.values.n], [peak.minute, peak.all], 'finish.busiest recounts the busiest minute');
    eq(n.figure.value, hm(peak.minute), 'finish.busiest: the figure');
    eq(n.guard, peak.all > 0, 'finish.busiest: guard');
    if (n.guard) has(n, `the busiest is *${hm(peak.minute)}*`, 'finish.busiest names the minute');
    ok(!shown(n).includes(peak.all.toLocaleString('en-US')), 'finish.busiest: the step leaves the count to the readout beside it');
  };
  R['round.top'] = (n) => {
    let top = ft.marks[0];
    for (const m of ft.marks) if (m.ratio > top.ratio) top = m;
    eq([n.values.mark, n.values.ratio, n.values.n], [top.mark, top.ratio, top.minute_before], 'round.top: the mark with the largest ratio');
    eq(n.guard, top.ratio >= 1.5, 'round.top: "far above" needs one and a half times the curve or more');
    has(n, `${top.minute_before.toLocaleString('en-US')} finishes landed between ${hm(top.minutes - 1)}:00 and ${hm(top.minutes - 1)}:59`, 'round.top: the count and the minute (the mark less one, never typed)');
    ok(!/curve/.test(shown(n)), 'round.top: the opener never names the smooth curve before the chart draws it');
    eq(n.key, `as many finishes as expected in the minute before ${top.mark}`, 'round.top: the key');
    eq(n.figure.value, top.ratio.toFixed(1), 'round.top: the figure, one decimal');
    ok(!shown(n).includes(top.ratio.toFixed(2)) && !shown(n).includes(`${top.ratio.toFixed(1)}×`), 'round.top: the sentence leaves the ratio to the figure');
  };
  R['round.marks'] = (n) => {
    const big = ft.marks.filter((m) => m.kind === 'hour' || m.kind === 'half-hour'), q = ft.marks.filter((m) => m.kind === 'quarter');
    eq(n.guard, big.every((m) => m.ratio > 1.05) && q.filter((m) => m.ratio < 1.05).length > q.length / 2, 'round.marks: every hour and half-hour above 1.05, most quarters under it');
  };
  R['round.quarter'] = (n) => {
    const big = ft.marks.filter((m) => m.kind === 'hour' || m.kind === 'half-hour'), q = ft.marks.filter((m) => m.kind === 'quarter');
    const flat = q.filter((m) => m.ratio < 1.05);
    let busiest = null;
    for (const m of flat) if (!busiest || m.minute_before > busiest.minute_before) busiest = m;
    eq(n.values.mark, busiest ? busiest.mark : '', 'round.quarter: the busiest quarter-hour under 1.05× the curve');
    eq(n.guard, big.every((m) => m.ratio > 1.05) && flat.length > q.length / 2 && !!busiest, 'round.quarter: the round.marks guard and its quarter-hour');
    if (n.guard) has(n, `like *${busiest.mark}*`, 'round.quarter names the quarter-hour');
  };
  R['round.rescue'] = (n) => {
    let b = ft.bubble[0];
    for (const x of ft.bubble) if (x.over.n > b.over.n) b = x;
    eq([n.values.mark, n.values.under, n.values.expected], [b.mark, b.over.share_under, b.over.expected_share_under], 'round.rescue: the mark with the most finishes on course just over it');
    eq(n.guard, b.over.share_under > b.over.expected_share_under, 'round.rescue: guard');
  };

  R['holds.gender'] = (n) => {
    eq([n.values.women, n.values.men], [demo.overall.women_slowdown, demo.overall.men_slowdown], 'holds.gender reads the matched shares');
    eq(n.guard, demo.overall.men_slowdown > demo.overall.women_slowdown, 'holds.gender: guard');
    eq(n.figure.value, `${pct(demo.overall.women_slowdown)} · ${pct(demo.overall.men_slowdown)}`, 'holds.gender: the pair');
  };
  R['holds.unmask'] = (n) => {
    const o = demo.overall, r = (o.men_block - o.women_block) / (o.pooled_men_block - o.pooled_women_block);
    close(n.values.ratio, r, 'holds.unmask recounts the ratio of the gaps');
    eq(n.guard, r >= 2 && o.men_block > o.women_block && o.pooled_men_block > o.pooled_women_block, 'holds.unmask: guard');
    // The bars' gap labels come from these unrounded gaps (5.552 reads 5.6 points apart, never 15.5 − 10.0 = 5.5).
    close(n.values.matched_gap, o.men_block - o.women_block, 'holds.unmask: the matched gap, unrounded');
    close(n.values.pooled_gap, o.pooled_men_block - o.pooled_women_block, 'holds.unmask: the pooled gap, unrounded');
    const S = require('../../lib/nuggets/stories.ts');
    eq(S.pointsApart(n.values.matched_gap), `${(o.men_block - o.women_block).toFixed(1)} points apart`, 'holds.unmask: the matched bars\' gap label is the unrounded difference');
    eq(S.pointsApart(n.values.pooled_gap), `${(o.pooled_men_block - o.pooled_women_block).toFixed(1)} points apart`, 'holds.unmask: the pooled bars\' gap label');
    if (n.guard) has(n, `the gap was *${Math.round(r) === 2 ? 'twice' : `${word(Math.round(r))} times`}* as wide`, 'holds.unmask names the ratio in words');
  };
  R['holds.ghost'] = (n) => {
    let b = demo.bands[0];
    for (const x of demo.bands) if (x.matched_weight > b.matched_weight) b = x;
    const gap = Math.max(...b.ghost_s);
    eq([n.values.band, n.values.gap_s], [b.label, gap], 'holds.ghost: the band with the most matched finishes, its widest gap');
    eq(n.guard, Math.abs(b.ghost_s[b.ghost_s.length - 1]) < 30 && gap >= 60, 'holds.ghost: "finished together" within 30 seconds');
    // The band is the frame, the gap at its widest mat the finding; the meeting at the line (true by construction) is
    // never told as a result.
    if (n.guard) ok(core.sentenceOf(n).startsWith(`Finishing in ${b.label}, recorded men were *`) && !/gave it all back/.test(core.sentenceOf(n)), 'holds.ghost: the band frames the gap');
  };
  R['holds.title'] = (n) => {
    const o = demo.overall;
    eq([n.values.women, n.values.men], [o.women_slowdown, o.men_slowdown], 'holds.title reads the matched shares');
    eq(n.guard, o.women_slowdown > 0 && o.men_slowdown > 1.5 * o.women_slowdown, 'holds.title: "more often" needs men half as many again');
  };
  R['field.title'] = (n) => {
    eq(n.values.median_min, minuteAt(0.5), 'field.title recounts the median');
    const m = minuteAt(0.5), h = Math.floor(m / 60);
    eq(n.guard, m - h * 60 >= 1 && h >= 1, 'field.title: "over" needs the median at least a minute past the hour');
    if (n.guard) has(n, `*over ${word(h)} hours*`, 'field.title names the hour in words');
    ok(!/\d/.test(shown(n)), 'field.title: the H1 says it in words; the figure under it gives the median');
  };
  R['courses.named'] = (n) => {
    const id = courses.identification;
    let correct = 0;
    for (const e of id.editions) if (e.predicted === e.city) correct++;
    eq(correct, id.correct, 'courses.named: correct counts the editions whose predicted course is their own');
    eq(n.values.share, id.correct / id.editions_tested, 'courses.named recounts the share');
    eq(n.guard, id.correct / id.editions_tested > 2 * id.chance, 'courses.named: guard');
    if (n.guard) has(n, `by chance, about ${pct(id.chance)}`, 'courses.named: chance as a share');
    ok(!shown(n).includes(`in ${Math.round(1 / id.chance)}`) && !shown(n).includes(`${id.courses} courses`), 'courses.named: the identification set\'s course count never shows');
  };
  R['courses.slowest'] = (n) => {
    const shaped = courses.courses.filter((c) => c.curve && c.curve.length && c.slowest_section);
    const tally = {};
    for (const c of shaped) tally[c.slowest_section] = (tally[c.slowest_section] || 0) + 1;
    const [s, k] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    eq([n.values.section, n.values.k, n.values.n], [s, k, shaped.length], 'courses.slowest recounts the commonest slowest section');
    eq(n.guard, k > shaped.length / 2, 'courses.slowest: guard');
    if (n.guard) has(n, `The slowest 5K was ${section(s)} on *${k} of ${shaped.length}* courses`, 'courses.slowest names it and how many courses');
  };
  R['courses.steady'] = (n) => {
    const big = types.courses.filter((c) => c.finishes >= 10000 && c.editions >= 3).map((c) => c.shares[even]);
    eq([n.values.low, n.values.high], [Math.min(...big), Math.max(...big)], 'courses.steady recounts the range');
    eq(n.guard, big.length >= 2 && Math.max(...big) >= 1.5 * Math.min(...big), 'courses.steady: guard');
  };

  R['weather.pairs'] = (n) => {
    const p = courses.weather.pairs;
    let more = 0;
    for (const x of p.list) if (x.hot_slowdown > x.cool_slowdown) more++;
    eq(more, p.hotter_slowed_more, 'weather.pairs: the count is the pairs whose warmer year had the higher share');
    eq(p.list.length, p.total, 'weather.pairs: every pair is listed');
    eq(n.guard, more > p.total / 2, 'weather.pairs: a majority');
    eq(`${n.figure.value}${n.figure.unit}`.replace(/\u00a0/g, ' '), `${more.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')}`, 'weather.pairs: the figure');
    has(n, `${Math.round(p.min_gap_c * 1.8)}°F apart`, 'weather.pairs: the gap in °F (°C × 9/5)', 'mi');
    has(n, `${p.min_gap_c}°C apart`, 'weather.pairs: the gap in °C', 'km');
  };
  R['weather.curve'] = (n) => {
    const pts = courses.weather.curvature.finish_min_per_c;
    const sure = pts.filter((p) => p.ci95[0] > 0);
    const cool = sure.reduce((a, b) => (b.temp < a.temp ? b : a)), warm = pts.reduce((a, b) => (b.temp > a.temp ? b : a));
    eq([n.values.cool_c, n.values.warm_c], [cool.temp, warm.temp], 'weather.curve: the coolest point clear of zero and the warmest');
    eq(n.guard, warm.slope >= 1.5 * cool.slope, 'weather.curve: guard');
    has(n, `*${(warm.slope / 1.8).toFixed(1)}\u00a0min*`, 'weather.curve: per °F is per °C ÷ 1.8 (held to its unit)', 'mi');
    has(n, `*${warm.slope.toFixed(1)}\u00a0min*`, 'weather.curve: per °C', 'km');
  };
  R['weather.title'] = (n) => {
    const p = courses.weather.pairs;
    eq([n.values.warmer_more, n.values.total], [p.hotter_slowed_more, p.total], 'weather.title reads the pairs');
    eq(n.guard, p.hotter_slowed_more > p.total / 2, 'weather.title: "slowed more" needs most pairs');
  };
  R['weather.tilt'] = (n) => {
    const s = courses.weather.heat_signature;
    const lo = s.reduce((a, b) => (b.per_10c < a.per_10c ? b : a)), hi = s.reduce((a, b) => (b.per_10c > a.per_10c ? b : a));
    eq(n.guard, s.indexOf(lo) < s.indexOf(hi) && lo.ci95[1] < 0 && hi.ci95[0] > 0, 'weather.tilt: early quicker and late slower, both clear of zero');
  };

  /** Each nugget from data whose guard fails, and the neutral sentence it must render then. */
  function fixtures(S) {
    const eras = { pre: [2015, 2019], post: [2022, 2026], high_coverage_courses: ['A'], summary: { p10: { change: -0.4, ci95: [-1, 0.2], lower: 1, higher: 0 }, p90: { change: 1, ci95: [0.5, 2], lower: 0, higher: 1 } } };
    return [
      [S.fieldMiddleFrom({ p25: null, median: 250, p75: 290 }), 'Every finish time, from the front of the field to the back.'],
      [S.fieldFrontFrom(eras), 'From 2015–19 to 2022–26, the 10th-percentile finish changed by −0.4 min and the 90th by +1.0 min.'],
      [S.fieldByRaceFrom([{ city: 'A', finishes: 500, editions: 3, median_s: 15000 }]), 'Median finish, course by course.'],
      [S.typesTopFrom([{ name: 'Even', share: 0.3 }, { name: 'Odd', share: 0.15 }]), 'Two ways to run *the same race*.'],
      [S.replayBackFrom({ city: 'A', year: 2020, moments: { back_km_at_first: 30 } }), 'When the first runner finished A 2020, the back of the field had covered 18.6\u00a0mi.'],
      [S.kickMagnetFrom({ slowdown_share: 0.4, slowdown_final_below_baseline: 0.02 }), 'Of finishes with a sustained slowdown, 40% sped up over the last 1.4 mi; 2.0% got back to their early pace.'],
      [S.typesRiverFrom({ archetypes: [{ name: 'Even', median_cv: 1 }, { name: 'Odd', median_cv: 9 }], river: [{ label: '2:30–2:45', shares: [0.3, 0.7] }, { label: '6:00–6:15', shares: [0.2, 0.8] }] }), 'Evens: 30% of 2:30–2:45 finishes, 20% of 6:00–6:15.'],
      [S.placesCoinFrom({ 30: [{ gap_lo_s: 60, share: 0.3 }, { gap_lo_s: 300, share: 0.1 }], 40: [{ gap_lo_s: 60, share: 0.2 }] }), 'How often a finish beat the runner ahead to the line, by how far back it was, from 30K and from 40K.'],
      [S.placesBreakevenFrom(null), 'Places gained after 30K, by the pace of 30–40K against a finish’s own 5–20K pace.'],
      [S.kickTwinsFrom({ strata: 1, slowdown_finishes: 1, mean_gap_s: 300, median_gap_s: 300 }), 'Same pace to 20K, apart at the finish.'],
      [S.kickTitleFrom({ median_gap_s: 300 }), 'From the same pace to 20K, finishes with and without a sustained slowdown.'],
      [S.kickStayFrom([{ source: '25–30', target: '30–35', n: 10, stay: 0.4, back_within_10: 0.1 }]), 'Of finishes at sustained-slowdown pace over 25–30K, 40% stayed that slow over 30–35K.'],
      [S.roundTopFrom([{ mark: '3:00', minutes: 180, ratio: 1.02, minute_before: 100, expected_minute_before: 98 }]), '100 finishes landed between 2:59:00 and 2:59:59.'],
      [S.roundRescueFrom([{ mark: '4:00', minutes: 240, over: { n: 10, share_under: 0.2, expected_share_under: 0.3 } }]), '20% did. Away from a round mark, 30%.'],
      [S.holdsGenderFrom({ women_slowdown: 0.5, men_slowdown: 0.4 }), 'At the same finish times: recorded women 50%, recorded men 40%.'],
      [S.coursesSlowestFrom([{ slowest_section: '35–40', curve: [1] }, { slowest_section: '30–35', curve: [1] }]), 'The slowest 5K, course by course.'],
      [S.fieldTitleFrom(null), 'Marathon finish times'],
      [S.fieldTitleFrom(240), 'Marathon finish times'],
      [S.placesTitleFrom({ 30: [{ gap_lo_s: 60, share: 0.3 }], 40: [{ gap_lo_s: 60, share: 0.2 }] }), 'Pass or be passed'],
      [S.holdsTitleFrom({ women_slowdown: 0.3, men_slowdown: 0.4 }), 'Women and men'],
      [S.weatherTitleFrom({ hotter_slowed_more: 4, total: 10 }), 'Race-morning weather'],
      [S.weatherPairsFrom({ hotter_slowed_more: 4, total: 10, min_gap_c: 5 }), '4 of 10 same-course pairs at least 9°F apart at the start: the warmer year had more sustained slowdowns.'],
    ];
  }

  return { RECOUNT: R, fixtures };
};
