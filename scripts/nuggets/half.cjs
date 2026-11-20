'use strict';
// Independent recounts of the half-marathon nuggets (lib/nuggets/half.ts) for scripts/verify-nuggets.cjs. Each reads the
// published half files (public/data/half/) directly and recomputes the nugget's values and guard with a second, plain
// implementation: the shares under 1:45 and 2:00 from the minute histogram and the 5-minute sex bins, the women's band
// medians from the unnamed per-edition rows, the same-city shares from the pair counts, the flagship's weighting guard
// from the battery, the flagship's window and mark from the windows. It then checks the sentence the page shows names
// the recounted figures, that every H2 holds at most 12 words, and the deks a page prints. `fixtures()` builds each
// nugget from data whose guard fails and returns the neutral fallback it must render.
module.exports = function half({ json, eq, ok, core }) {
  const R = {};
  const field = json('public/data/half/field.json');
  const women = json('public/data/half/women.json');
  const linked = json('public/data/half/linked.json');
  const manifest = json('public/data/half/manifest.json');
  // How halves are paced: published only while the family meets its builder floors (analysis/half_pacing.py).
  const pacing = manifest.files['pacing.json'] ? json('public/data/half/pacing.json') : null;
  const close = (a, b, message, tol = 1e-9) => ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);
  const shown = (n) => core.sentenceOf(n, 'mi');
  const has = (n, text, message) => ok(shown(n).includes(text), `${message}: "${text}" in "${shown(n)}"`);
  // The shared pure derivations (scripts/half/derive.cjs): times as pages print them, shares, 1 in d, numpy's median.
  const D = require('../half/derive.cjs');
  const { clock, pct, oneIn } = D;
  const words = (t) => core.plain(t).split(/\s+/).filter(Boolean).length;
  const median = D.npMedian;
  // A pooled difference in minutes, rounded to the nearest minute, a tie to even, as Python rounds.
  const roundEven = (x) => D.pyRound(x, 0);

  // The half files are the ones the manifest binds.
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const path = require('node:path');
  for (const [name, meta] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', '..', 'public/data/half', name));
    eq([bytes.length, crypto.createHash('sha256').update(bytes).digest('hex')], [meta.bytes, meta.sha256], `half nuggets read ${name} as the manifest binds it`);
  }

  // Shares under a time from the published counts: all finishes from the minute histogram, each sex from its 5-minute bins.
  const total = D.tailedTotal;
  const underAll = (s) => {
    const k = D.underMinutes(field.minutes, s);
    ok(k !== null, `half: ${s} s is a minute edge of the histogram`);
    return k / total(field.minutes);
  };
  const underSex = (g, s) => {
    const k = D.underBins(field.sex_bins, field.sex_bins[g], s);
    ok(k !== null, `half: ${s} s is a bin edge of the sex bins`);
    return k / total(field.sex_bins[g]);
  };
  eq(total(field.minutes), field.cohort.finishes, 'half: the minute histogram holds every verified finish');
  eq(total(field.sex_bins.F) + total(field.sex_bins.M), field.cohort.sex_finishes, 'half: the sex bins hold every recorded finish of the sex editions');
  // The median lies in the minute where the cumulative count crosses one half.
  {
    const mins = field.minutes; const half = total(mins) / 2;
    let seen = mins.under_lo, minute = null;
    for (let i = 0; i < mins.counts.length; i++) { seen += mins.counts[i]; if (seen >= half) { minute = mins.lo + i; break; } }
    eq(Math.floor(field.quantiles.all.p50 / 60), minute, 'half: the median sits in the minute where the cumulative count crosses one half');
  }

  R['half.field'] = (n) => {
    const all = underAll(7200), F = underSex('F', 7200), M = underSex('M', 7200);
    close(n.values.under_7200, all, 'half.field: share under 2:00 from the histogram');
    close(n.values.women_under_7200, F, 'half.field: recorded women’s share under 2:00 from the bins');
    close(n.values.men_under_7200, M, 'half.field: recorded men’s share under 2:00 from the bins');
    eq(n.values.all_usable_under_7200, field.checks.all_usable.under_7200, 'half.field: the all-usable scope check');
    const inRange = (v) => v > 0.5 && v < 0.6;
    eq(n.guard, field.cohort.finishes >= 100 && field.cohort.editions >= 3 && inRange(field.checks.all_usable.under_7200), 'half.field: guard (the all-usable share in (0.5, 0.6), floors)');
    if (n.guard) eq(shown(n), inRange(all) ? 'Just over half of half marathon finishes came in under *2:00*.' : `*${pct(all)}* of half marathon finishes came in under 2:00.`, 'half.field: the H1');
    eq(n.figure.value, clock(field.quantiles.all.p50), 'half.field: the figure is the median floored to the minute');
    eq([n.values.median_s, n.values.women_median_s, n.values.men_median_s], [field.quantiles.all.p50, field.quantiles.F.p50, field.quantiles.M.p50], 'half.field: the medians');
    eq(n.denominator, 'half', 'half.field: the verified-half family');
  };

  R['half.under'] = (n) => {
    const all = underAll(6300);
    close(n.values.under_6300, all, 'half.under: share under 1:45 from the histogram');
    close(n.values.women_under_6300, underSex('F', 6300), 'half.under: recorded women’s');
    close(n.values.men_under_6300, underSex('M', 6300), 'half.under: recorded men’s');
    eq(n.guard, Math.abs(all - field.checks.editions_equal.under_6300) <= 0.03 + 1e-12, 'half.under: guard (editions-equal within 3 points)');
    if (n.guard) eq(shown(n), oneIn(all) === '1 in 4' ? '*1 in 4* half finishes came in under 1:45.' : `*${pct(all)}* of half finishes came in under 1:45.`, 'half.under: the H2');
  };

  R['half.crowd'] = (n) => {
    const m = field.marks.find((x) => x.mark === '2:00');
    eq(m.minute_before, field.minutes.counts[119 - field.minutes.lo], 'half.crowd: the minute before 2:00 from the histogram');
    eq(m.minute_after, field.minutes.counts[120 - field.minutes.lo], 'half.crowd: the minute from 2:00 from the histogram');
    close(m.ratio, m.minute_before / m.expected_minute_before, 'half.crowd: the ratio is the minute over its expectation', 5e-5);
    ok(m.ratio_ci95[0] <= m.ratio && m.ratio <= m.ratio_ci95[1], 'half.crowd: the ratio lies in its interval');
    eq([n.values.ratio, n.values.ratio_lo], [m.ratio, m.ratio_ci95[0]], 'half.crowd: values');
    eq(n.guard, m.ratio >= 1.15 && m.ratio_ci95[0] > 1, 'half.crowd: guard');
    if (n.guard) has(n, `*${m.ratio.toFixed(1)}×*`, 'half.crowd names the ratio');
  };

  // The band medians are published only from at least 20 editions (analysis/half_women.py; 15 qualify since the stamp
  // correction, October 30, 2026, so none is): with none, the heading falls back and the page draws no columns.
  const bandsPublished = women.band_editions.length >= 20 && women.band_editions.length === women.band_editions_qualifying;
  const bandShares = bandsPublished ? women.bands.map((_, j) => median(women.band_editions.map((r) => r.F[j] / r.n[j]))) : [];
  R['half.women'] = (n) => {
    eq(women.min_band_editions, 20, 'half.women: the band medians need 20 editions');
    if (!bandsPublished) eq([women.band_editions.length, women.median_share.length, women.cross_s], [0, 0, null], `half.women: ${women.band_editions_qualifying} qualifying editions publish no band medians`);
    bandShares.forEach((v, j) => close(women.median_share[j], v, `half.women: band ${j} median from the unnamed rows`));
    for (const row of women.band_editions) ok(row.n.every((v) => v >= 100), 'half.women: every band row holds at least 100 recorded finishes');
    let cross = null;
    for (let j = 1; j < bandShares.length; j++) if (bandShares[j - 1] <= 0.5 && bandShares.slice(j).every((s) => s > 0.5)) { cross = women.bands[j].lo_s; break; }
    eq(women.cross_s, cross, 'half.women: the crossing from the medians');
    eq(n.guard, bandsPublished && cross !== null && women.band_editions.length >= 20, 'half.women: guard');
    if (n.guard) eq(shown(n), `From *${clock(cross)}* on, most half finishes were women’s.`, 'half.women: the H2');
    const chart = json(`public/data/${women.marathon.file}`);
    eq([women.marathon.cross_s, women.marathon.sub3], [chart.values.cross, chart.values.sub3], 'half.women: the cited marathon values equal their file');
  };

  R['half.cities'] = (n) => {
    const share = (c) => c.F / (c.F + c.M);
    const pairs = women.same_city.pairs;
    const d = pairs.map((p) => share(p.half) - share(p.marathon));
    eq(n.values.pairs, pairs.length, 'half.cities: pairs');
    eq(n.values.half_higher, d.filter((x) => x > 0).length, 'half.cities: pairs where the half had the larger women’s share');
    eq(n.values.cities, new Set(pairs.map((p) => p.city)).size, 'half.cities: cities');
    close(n.values.half_median, median(pairs.map((p) => share(p.half))), 'half.cities: the half median');
    close(n.values.marathon_median, median(pairs.map((p) => share(p.marathon))), 'half.cities: the marathon median');
    for (const p of pairs) ok(p.half.n >= 1000 && p.marathon.n >= 1000, 'half.cities: every named pair holds at least 1,000 finishes a side');
    const all = women.same_city.all_scope_check;
    eq(n.guard, n.values.half_higher === pairs.length && pairs.length >= 10 && n.values.cities >= 5 && all.half_higher === all.pairs, 'half.cities: guard');
  };

  const battery = Object.fromEntries(linked.checks.battery.members.map((m) => [m.id, m]));
  const flagshipOk = () => D.flagshipGuard(linked);
  R['half.extra'] = (n) => {
    eq(battery.pooled.extra_p50_s, linked.overall.extra_s.p50, 'half.extra: the battery pools what the overall reading pools');
    eq(battery.pooled.n, linked.set.pairs, 'half.extra: the pooled member holds every pair');
    // A pooled figure with no printed operands beside it: rounded to the nearest minute, a tie to even (2026-11-20; it
    // was Math.round, which sends a tie up; 1315 s is 21.9, 22 either way).
    const minutes = roundEven(linked.overall.extra_s.p50 / 60);
    eq(n.values.extra_min, minutes, 'half.extra: minutes over double, rounded');
    eq(n.guard, flagshipOk(), 'half.extra: guard (the weighting battery)');
    if (n.guard) eq(shown(n), `After a half, the typical marathon took double it plus *${minutes} minutes*.`, 'half.extra: the H1');
    const share = linked.overall.under_double_plus_min['0'];
    // Every member and every one-edition leave-out variant under 15% under double (none under 100 pairs), and the
    // verified halves within 3 points of the pooled share (lead rulings A1 and A2, October 31, 2026), on top of the H1's
    // guard: while the H1 falls back the figure states no reading, whatever its own check says (AGENTS rule 13; lead
    // rulings G, October 31, 2026: "the fallback stays in every slot").
    const figureOk = flagshipOk() && D.figureGuard(linked);
    // The figure states a reading only under the H1's guard and one of its own: the share while its check holds, the
    // minutes while only the H1's does, else the count of pairs (review, October 30, 2026: the minutes stood in the
    // figure after the H1's guard had rejected them).
    const asMinutes = !figureOk && n.guard;
    eq(n.figure.value, figureOk ? String(Math.round(share * 100)) : asMinutes ? `+${minutes}` : linked.set.pairs.toLocaleString('en-US'), 'half.extra: the figure');
    eq(n.key, figureOk ? 'of marathons came in under double the half marathon before them' : asMinutes ? 'over double the half marathon, typical' : 'pairs of a half and the marathon after it', 'half.extra: the key');
    eq([n.values.figure_is_share, n.values.figure_is_minutes], [figureOk ? 1 : 0, asMinutes ? 1 : 0], 'half.extra: what the figure is');
    if (!n.guard) ok(!/double|over|under|typical|\+/.test(`${n.figure.value} ${n.key}`) && n.values.figure_is_share === 0 && n.values.figure_is_minutes === 0, 'half.extra: while the H1 falls back, the figure and its key state no reading');
    ok(n.figure.value !== String(minutes) && !core.plain(shown(n)).includes(`${n.figure.value}%`), 'half.extra: the H1 accent and the figure are different numbers');
    eq(n.denominator, 'linked', 'half.extra: the linked family');
  };

  const flagship = (group) => linked.windows[group].find((w) => w.h === Math.round(linked.checks.battery.pooled_half_p50_s / 300) * 300) || null;
  const readout = D.readoutMark;
  R['half.range'] = (n) => {
    const w = flagship('all');
    ok(w, 'half.range: the flagship window is published');
    const mark = readout(w);
    eq([n.values.h, n.values.mark_s, n.values.n, n.values.e], [w.h, mark[0], w.n, w.e], 'half.range: the window and its readout mark');
    const share = mark[1];
    ok(w.marks.every(([t]) => t > w.q[0] && t <= w.q[18] && t % 900 === 0), 'half.range: marks are quarter-hours inside p05–p95');
    const c = linked.checks;
    const guard = w.h === 6300 && mark[0] === 14400 && w.n >= 100 && w.e >= 3 && Math.abs(share - c.verified.w105_under_14400) <= 0.05
      && Math.abs(share - c.editions_equal.w105_under_14400) <= 0.05 && share > 0.5 && share < 0.9;
    eq(n.guard, guard, 'half.range: guard');
    if (n.guard) eq(shown(n), `After a ${clock(w.h)} half, *${pct(share)}* of marathons came in under ${clock(mark[0])}.`, 'half.range: the H2');
  };

  R['half.sexes'] = (n) => {
    const s = linked.sexes, v = linked.checks.verified.sexes;
    ok(s.women_std < s.men_std && Math.abs(100 * (s.men_std - s.women_std) - s.diff_points) < 1e-6, 'half.sexes: the standardised gap');
    eq(n.guard, s.strata >= 20 && s.women_lower >= 0.9 * s.strata && s.diff_points >= 10 && v.women_lower >= 0.9 * v.strata, 'half.sexes: guard');
    eq(n.term, '/methodology#sustained-slowdown', 'half.sexes links the term');
  };

  R['half.sexesGuess'] = (n) => {
    const f = flagship('F'), m = flagship('M');
    eq(n.guard, !!f && !!m && f.n >= 100 && m.n >= 100, 'half.sexesGuess: guard (both windows at the flagship half)');
    if (!f) return;
    eq([n.values.women_share, n.values.men_share, n.values.men_of_100], [f.sus, m.sus, Math.round(m.sus * 100)], 'half.sexesGuess: values');
    const w = oneIn(f.sus);
    if (n.guard) eq(shown(n), w ? `About *${w}* did.` : `*${pct(f.sus)}* did.`, 'half.sexesGuess: the answer');
  };

  // ---------- How halves are paced (every usable result with a 10 km time; docs/HALF_MARATHON.md rule R5) ----------
  // The guards as the contract words them, written here a second time: the pooled median strictly between +1% and +10%
  // with the equal-edition and equal-label medians and both ends of the leave-one-label-out range within 1.0 point of
  // it and at least 80% of the editions above zero; the equal-edition share faster and both ends of its leave-out range
  // within 5 points of the pooled share; at least 4 published finish bands from 1:20 on whose medians never fall, the
  // first and the last holding at least 3 labels.
  const within = (a, b, gap) => Math.abs(a - b) <= gap;
  const paceGuard = (p) => !!p && p.overall.median > 0.01 && p.overall.median < 0.10
    && [p.editions_equal.median, p.labels_equal.median, p.leave_label_out.median_min, p.leave_label_out.median_max].every((v) => within(v, p.overall.median, 0.01))
    && p.editions_equal.above_zero >= 0.8 * p.editions_equal.editions;
  const fasterGuard = (p) => !!p && [p.editions_equal.faster, p.leave_label_out.faster_min, p.leave_label_out.faster_max].every((v) => within(v, p.overall.faster, 0.05));
  const bandsFrom120 = (p) => (p ? p.bands.filter((b) => b.lo_s >= 4800) : []);
  const bandsGuard = (p) => { const b = bandsFrom120(p); return b.length >= 4 && b.every((x, i) => !i || x.median >= b[i - 1].median) && b[0].l >= 3 && b[b.length - 1].l >= 3; };
  const bandWords = (lo, step) => `${clock(lo)} to ${clock(lo + step - 60)}`;
  R['half.pace'] = (n) => {
    eq(n.guard, paceGuard(pacing), 'half.pace: guard (the pooled median, the two weightings, every race label left out, the editions above zero)');
    if (!pacing) { eq([shown({ ...n, guard: true }), Object.keys(n.values).length], ['', 0], 'half.pace: without the family there is no sentence and no value'); return; }
    eq([n.values.median, n.values.results, n.values.editions, n.values.labels], [pacing.overall.median, pacing.overall.n, pacing.overall.e, pacing.overall.l], 'half.pace: the pooled values');
    eq([n.values.editions_equal_median, n.values.labels_equal_median, n.values.without_label_min, n.values.without_label_max, n.values.editions_above_zero],
      [pacing.editions_equal.median, pacing.labels_equal.median, pacing.leave_label_out.median_min, pacing.leave_label_out.median_max, pacing.editions_equal.above_zero], 'half.pace: the checks’ values');
    if (n.guard) eq(shown(n), `After 10 km, the typical half ran about *${pct(pacing.overall.median)} slower*.`, 'half.pace: the heading');
    eq(n.figure, null, 'half.pace: no figure');
  };
  R['half.paceFaster'] = (n) => {
    eq(n.guard, fasterGuard(pacing), 'half.paceFaster: guard (editions weighted equally and every race label left out within 5 points)');
    if (!pacing) return;
    eq([n.values.faster, n.values.editions_equal_faster, n.values.without_label_min, n.values.without_label_max],
      [pacing.overall.faster, pacing.editions_equal.faster, pacing.leave_label_out.faster_min, pacing.leave_label_out.faster_max], 'half.paceFaster: values');
    if (n.guard) eq(shown(n), `*${pct(pacing.overall.faster)}* ran the last 11.1 km faster than the first 10 km.`, 'half.paceFaster: the sentence');
  };

  // Every half nugget: one family per page, H2s of at most 12 words, a neutral fallback.
  const FAMILY = { 'half.field': 'half', 'half.under': 'half', 'half.crowd': 'half', 'half.women': 'half', 'half.cities': 'half',
    'half.extra': 'linked', 'half.range': 'linked', 'half.sexes': 'linked', 'half.sexesGuess': 'linked',
    // Every usable result with a 10 km time: a family of its own, which the shared Denominator type (lib/nuggets/types.ts)
    // does not name yet; the surface's root says the scope (data-half-scope="usable") and carries the chip.
    'half.pace': 'half', 'half.paceFaster': 'half' };
  const wrap = (id, inner) => (n) => {
    inner(n);
    ok(words(core.textFor(n.headline, 'mi')) <= 12, `${id}: "${core.textFor(n.headline, 'mi')}" is over 12 words`);
    eq(n.denominator, FAMILY[id], `${id}: its count family`);
    ok(n.page === '/half' || n.page.startsWith('/half#') || n.page.startsWith('/stories/half-to-full'), `${id}: a half page`);
    // The 10 km time is never a half of the race, a split of it or the marathon's metric.
    if (id.startsWith('half.pace')) for (const t of [core.textFor(n.headline, 'mi'), core.textFor(n.fallback, 'mi')]) ok(!/sustained slowdown|halfway|half-way|second half|first half|\bsplits?\b|marathon/i.test(t), `${id}: "${t}" names a half of the race, a split or the marathon`);
  };
  for (const id of Object.keys(R)) R[id] = wrap(id, R[id]);

  // The deks a page prints (lib/nuggets/half.ts halfDeks), recounted.
  const deks = (H) => {
    const d = H.halfDeks();
    eq(d.fieldUnit, `the median half finish; recorded women’s ${clock(field.quantiles.F.p50)}, men’s ${clock(field.quantiles.M.p50)}`, 'half deks: the reading’s unit line');
    // The needle stops on the published marks only, so the dek names their step, never "any time" (review, October 30,
    // 2026: a 1:52 runner could not set 1:52).
    const step = (field.under[1].s - field.under[0].s) / 60;
    ok(field.under.every((u, i) => !i || u.s - field.under[i - 1].s === step * 60), 'half deks: the published marks are evenly spaced');
    const fieldSlide = `Slide from ${clock(field.under[0].s)} to ${clock(field.under[field.under.length - 1].s)}, ${step} minutes at a time.`;
    eq(d.slide, fieldSlide, 'half deks: beat 1, how to use the needle (the range the shares are published for: 1:15 to 3:00 since the stamp correction)');
    eq(d.under, `Recorded women’s: ${pct(underSex('F', 6300))}. Men’s: ${pct(underSex('M', 6300))}. ${fieldSlide}`, 'half deks: beat 1 with the shares');
    ok(!/\bany (?:time|half)\b/.test(`${d.slide} ${d.range}`), 'half deks: no needle promises any time');
    // A dek that states a direction shows only while its heading holds: under the plain heading it is null (review,
    // October 30, 2026: the beat 3 and beat 4 deks still compared the half with the marathon after their headings fell
    // back).
    const womenNugget = H.halfWomenFrom(women), citiesNugget = H.halfCitiesFrom(women);
    eq(d.women, womenNugget.guard ? `Under 1:30, ${pct(bandShares[0])} were. In the marathon, women’s finishes are the majority only from ${clock(women.marathon.cross_s)}.` : null, 'half deks: beat 3, only under its heading');
    const share = (c) => c.F / (c.F + c.M);
    // Two medians across the pairs, worded as two: never "the typical city and year", which no pair is (round 2).
    eq(d.cities, citiesNugget.guard ? `Women’s share of finishes was typically ${pct(median(women.same_city.pairs.map((p) => share(p.half))))} in the half and ${pct(median(women.same_city.pairs.map((p) => share(p.marathon))))} in the marathon.` : null, 'half deks: beat 4, only under its heading');
    ok(!/typical city|typical pair/.test(d.cities || ''), 'half deks: beat 4 never names one typical city and year');
    const w = flagship('all'), all = linked.windows.all;
    const win = (g, h) => linked.windows[g].find((x) => x.h === h);
    // Beat 1's dek is the spec's: the typical marathon after the flagship's half, then the needle's range (round 2);
    // under the plain heading "the typical one" names no half, so the dek is the needle's range alone.
    const stops = all.filter((x) => x.h % 300 === 0);
    const slide = `Slide from a ${clock(stops[0].h)} half to a ${clock(stops[stops.length - 1].h)} half, 5 minutes at a time.`;
    eq(d.range, H.halfRangeFrom(linked).guard ? `The typical one took ${clock(w.q[9])}. ${slide}` : slide, 'half deks: story beat 1');
    // The page sets the dek's two parts apart, the needle's how-to said only with JavaScript (round 5 review).
    eq(d.rangeLead, H.halfRangeFrom(linked).guard ? `The typical one took ${clock(w.q[9])}.` : null, 'half deks: story beat 1, the reading part');
    eq(d.storySlide, slide, 'half deks: story beat 1, how to use the needle');
    // The story's hero dek: which halves the page covers (the first and the last 5-minute stop of the readout) and for
    // whom, and where to look; no reading, so it stands under the plain H1 too (review, October 30, 2026). 2026-11-20
    // (review round m6, AGENTS rule 15): it no longer says how pairs are formed ("Each half here is paired with the
    // marathon 3 to 16 weeks after it, …"), which /methodology#half-linking states.
    eq(d.hero, stops.length ? `Halves from ${clock(stops[0].h)} to ${clock(stops[stops.length - 1].h)} and the marathons that followed them, for records linked by name.` : 'Halves and the marathons that followed them, for records linked by name.', 'half deks: the story’s hero dek');
    ok(!/\b(?:paired|weeks?|days?)\b/i.test(d.hero), 'half deks: the hero dek says nothing of how pairs are formed (rule 15)');
    eq(d.find, 'Find your half below.', 'half deks: the hero’s pointer to the needle (said only with JavaScript)');
    ok(!/\b(?:double|typical|under|over|more|fewer|took)\b/i.test(d.hero), 'half deks: the hero dek states no reading');
    // The reading's scale note: the minutes over double 15 minutes quicker than the flagship's half, then the span of
    // the 5-minute windows from 15 minutes slower on, each the readout's value (the window's typical marathon as printed,
    // the whole minute at or below, minus double its half), only while the slower half's is the larger; the span only
    // while every window in it is within 4 minutes of its first and above the quicker half's (round 4 review).
    const qa = win('all', w.h - 900), qb = win('all', w.h + 900);
    const over = (x) => Math.floor(x.q[9] / 60 + 1e-9) - Math.round((2 * x.h) / 60);
    const a = qa && over(qa), b = qb && over(qb);
    const slower = qb ? all.filter((x) => x.h % 300 === 0 && x.h >= qb.h) : [];
    const after = slower.map(over);
    const lo = Math.min(...after), hi = Math.max(...after);
    const level = qb && after.length >= 3 && after.every((x) => Math.abs(x - b) <= 4) && qa && a < lo;
    eq(d.scale, qa && qb && a < b ? `Fewer minutes over double after a quicker half: +${a} after a ${clock(qa.h)} half, ${level ? `${lo === hi ? `+${lo}` : `+${lo} to +${hi}`} from ${clock(qb.h)} to\u00a0${clock(slower[slower.length - 1].h)}` : `+${b} after a ${clock(qb.h)}`}.` : null, 'half deks: the reading’s scale note');
    // On this build the windows level off from 2:00: the note says so, and never that the minutes keep rising.
    ok(!/more after a slower one/.test(d.scale || ''), 'half deks: the scale note promises no rise the windows do not show');
    // Each readout value adds up with the two printed times: "Typical 5:57" after "2:45" is double plus 27.
    const printed = (t) => { const [hh, mm] = clock(t).split(':').map(Number); return hh * 60 + mm; };
    for (const x of all.filter((x) => x.h % 300 === 0)) eq(printed(x.q[9]) - 2 * printed(x.h), over(x), `half deks: ${clock(x.h)}: the readout's minutes over double add up with its printed times`);
    const m = flagship('M');
    eq(d.guess, `After a ${clock(m.h)} half, ${Math.round(m.sus * 100)} of 100 recorded men’s marathons had a sustained slowdown. How many of 100 recorded women’s?`, 'half deks: the guess');
    const sides = [w.h - 900, w.h + 900].map((h) => [win('F', h), win('M', h)]);
    const lower = sides.every(([pf, pm]) => pf && pm && pf.sus < pm.sus);
    // The dek follows its heading's guard as well as its own clause (recorded November 14, 2026, before any build of the
    // combined release): while half.sexes falls back it is null.
    const sexesHold = linked.sexes.strata >= 20 && linked.sexes.women_lower >= 0.9 * linked.sexes.strata && linked.sexes.diff_points >= 10
      && linked.checks.verified.sexes.women_lower >= 0.9 * linked.checks.verified.sexes.strata;
    eq(d.guessMore, lower && sexesHold ? sides.map(([pf, pm], k) => (k === 0 ? `After a ${clock(pf.h)} half: ${pct(pf.sus)} of recorded women’s, against ${pct(pm.sus)} of men’s.` : `After a ${clock(pf.h)} half: ${pct(pf.sus)} against ${pct(pm.sus)}.`)).join(' ') : null, 'half deks: after the guess, women lower at both neighbouring halves');
    // The pacing surface's dek: each part only while its own guard holds; the bands' part names the first and the last
    // published band from 1:20 on, and only while the last one's printed median is the larger.
    eq(d.paceFaster, fasterGuard(pacing) ? `${pct(pacing.overall.faster)} ran the last 11.1 km faster than the first 10 km.` : null, 'half deks: the pacing surface, the share faster only under its guard');
    {
      const b = bandsFrom120(pacing), a = b[0], z = b[b.length - 1];
      const say = bandsGuard(pacing) && Math.round(z.median * 100) > Math.round(a.median * 100);
      eq(d.paceBands, say ? `The slower the finish, the larger the change: about ${pct(a.median)} for finishes of ${bandWords(a.lo_s, pacing.rules.band_s)}, about ${pct(z.median)} for ${bandWords(z.lo_s, pacing.rules.band_s)}.` : null,
        'half deks: the pacing surface, the two finish bands only under half.paceBands');
      for (const t of [d.paceFaster, d.paceBands]) ok(!/sustained slowdown|halfway|half-way|second half|first half|\bsplits?\b|marathon/i.test(t || ''), `half deks: the pacing dek names a half of the race, a split or the marathon: ${t}`);
    }
    const marks = Object.fromEntries(field.marks.map((x) => [x.minutes, x]));
    const crowdOk = marks[90].ratio_ci95[0] > 1.1 && [105, 135, 150].every((k) => marks[k].ratio < 1.1);
    const two = marks[120];
    const others = [105, 135, 150].map((k) => marks[k].ratio);
    const fmtCount = (v) => v.toLocaleString('en-US');
    // 2:00 is the beat's subject: while its minute holds the most finishes over the curve of the five, the dek says so;
    // where 1:30's column stands taller (as the columns print the ratios), the dek says that too, with both decimals
    // (review, October 30, 2026: since the stamp correction 1:30 is the taller column, and the dek did not say why 2:00).
    const excess = (x) => x.minute_before - x.expected_minute_before;
    const most = field.marks.every((x) => x === two || excess(x) < excess(two));
    const taller = Number(marks[90].ratio.toFixed(2)) > Number(two.ratio.toFixed(2));
    // The orange column's key line, while 2:00 holds the most extra finishes (review round nit, 2026-11-20): orange is
    // what the sentence is about, and 1:30's column stands taller.
    eq(d.crowdKey, most ? `${two.mark}: the most extra finishes` : null, 'half deks: beat 2, the orange column\u2019s key line');
    const rest = taller
      ? ` The minute before 1:30 stood a little taller against its curve, ${marks[90].ratio.toFixed(2)}×; before 1:45, 2:15 and 2:30, about ${median(others).toFixed(2)}×.`
      : ` The minute before 1:30 held ${marks[90].ratio.toFixed(1)}× too; before 1:45, 2:15 and 2:30, about ${median(others).toFixed(2)}×.`;
    eq(d.crowd, `${fmtCount(two.minute_before)} finishes came in at 1:59, where the smooth curve expects about ${fmtCount(Math.round(two.expected_minute_before / 100) * 100)}${most ? ': the most extra finishes before any round time' : ''}.${crowdOk ? rest : ''}`, 'half deks: beat 2, the minute before 2:00 against the curve, then the other marks while 1:30 stands out and the others do not');
    eq(JSON.stringify(d.crowdNamed), JSON.stringify(crowdOk ? [90] : []), 'half deks: beat 2 draws 1:30 a step up only while its dek names it');
    for (const text of Object.values(d).filter(Boolean)) ok(!/\b(?:fastest|chance|predict|goal|target|because|verified|unverified)\b/i.test(text), `half deks: banned word in "${text}"`);
  };

  // Fixtures: the real files with one value moved so each guard fails.
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fixtures = (H) => {
    const f1 = clone(field); f1.checks.all_usable.under_7200 = 0.45;
    const f2 = clone(field); f2.checks.editions_equal.under_6300 = field.under.find((u) => u.s === 6300).all - 0.05;
    const f3 = clone(field); f3.marks.find((m) => m.minutes === 120).ratio_ci95[0] = 0.99;
    // A band file published from 20 editions whose shares never pass one half (the bands are left out on this build).
    const w1 = clone(women); w1.band_editions = Array.from({ length: 20 }, () => ({ n: women.bands.map(() => 200), F: women.bands.map(() => 80) }));
    w1.band_editions_qualifying = 20; w1.median_share = women.bands.map(() => 0.4); w1.cross_s = null;
    const w2 = clone(women); w2.same_city.summary.half_higher -= 1;
    const l1 = clone(linked); l1.checks.battery.members.find((m) => m.id === 'ns_keys_1').multiple_p50 = 2.3;
    const l2 = clone(linked); l2.checks.verified.w105_under_14400 = 0.5;
    const l3 = clone(linked); l3.sexes.women_lower = Math.floor(l3.sexes.strata * 0.5);
    const l4 = clone(linked); l4.windows.F = l4.windows.F.filter((w) => w.h !== 6300);
    // The flagship guard with every member and every leave-out variant set to the pooled reading holds; the two copies
    // below move one value each from there, so each fails on that value alone: a pre-registered member (verified_road)
    // outside the band, and one variant of verified_federation (one verified half edition left out) at 15% under double.
    const pass = clone(linked);
    const pooled = pass.checks.battery.members.find((m) => m.id === 'pooled');
    const at = { multiple_p50: pooled.multiple_p50, extra_p50_s: pooled.extra_p50_s, under_double: pooled.under_double };
    for (const m of pass.checks.battery.members) Object.assign(m, at);
    for (const x of Object.values(pass.checks.battery.leave_outs)) {
      Object.assign(x, { under_floor: 0, failed: 0, failing: Object.fromEntries(Object.keys(x.failing).map((c) => [c, 0])) });
      for (const k of Object.keys(x.worst)) x.worst[k] = { half_edition: 1, left_out: 1, n: 1000, ...at };
    }
    ok(D.flagshipGuard(pass) && H.flagshipGuard(pass) && H.halfExtraFrom(pass).guard, 'half fixtures: with every member and leave-out at the pooled reading, the flagship guard holds');
    const l5 = clone(pass); l5.checks.battery.members.find((m) => m.id === 'verified_road').multiple_p50 = 2.3;
    const l6 = clone(pass); l6.checks.battery.leave_outs.verified_federation.worst.under_double.under_double = 0.15;
    for (const [fixture, what] of [[l5, 'a pre-registered member outside the band'], [l6, 'one leave-out variant at 15% under double']]) {
      ok(!D.flagshipGuard(fixture) && !H.flagshipGuard(fixture), `half fixtures: ${what} fails the flagship guard`);
    }
    // Every other clause of the H1's guard, each moved alone from `pass` (verify round 2, October 31, 2026: lead rulings
    // A2, the band's upper side and the members' minutes could be dropped from lib/nuggets/half.ts with every check
    // passing). A value 1 s or 0.0001 past a bar fails; the bar itself passes, since every bar is inclusive but the
    // under-double one.
    {
      const P = pass.checks.battery, pooledExtra = pooled.extra_p50_s, half = P.pooled_half_p50_s;
      const moved = (what, change) => { const x = clone(pass); change(x.checks.battery, x); return [x, what]; };
      const member = (b, id) => b.members.find((m) => m.id === id);
      const failing = [
        ...Object.keys(P.leave_outs).map((id) => moved(`${id}: one variant under 100 pairs (lead rulings A2)`, (b) => { b.leave_outs[id].under_floor = 1; })),
        ...Object.keys(P.leave_outs).flatMap((id) => [
          moved(`${id}: its highest-multiple variant at 2.2501`, (b) => { b.leave_outs[id].worst.multiple_high.multiple_p50 = 2.2501; }),
          moved(`${id}: its lowest-multiple variant at 2.1499`, (b) => { b.leave_outs[id].worst.multiple_low.multiple_p50 = 2.1499; }),
          moved(`${id}: its re-expressed variant 181 s off at the pooled median half`, (b) => { b.leave_outs[id].worst.reexpressed.multiple_p50 = 2 + (pooledExtra + 181) / half; }),
          moved(`${id}: no variant at all`, (b) => { b.leave_outs[id].variants = 0; }),
        ]),
        moved('verified_halves: a variant\'s minutes 181 s from the pooled', (b) => { b.leave_outs.verified_halves.worst.extra.extra_p50_s = pooledExtra - 181; }),
        moved('one_per_person: its minutes 181 s from the pooled', (b) => { member(b, 'one_per_person').extra_p50_s = pooledExtra + 181; }),
        moved('verified_halves: its minutes 181 s from the pooled', (b) => { member(b, 'verified_halves').extra_p50_s = pooledExtra - 181; }),
        moved('a member re-expressed 181 s off', (b) => { member(b, 'other_marathons').multiple_p50 = 2 + (pooledExtra - 181) / half; }),
        moved('a member at 15% under double', (b) => { member(b, 'city_equal').under_double = 0.15; }),
        moved('no verified_road member', (b) => { b.members = b.members.filter((m) => m.id !== 'verified_road'); }),
      ];
      for (const [fixture, what] of failing) ok(!D.flagshipGuard(fixture) && !H.flagshipGuard(fixture), `half fixtures: ${what} fails the flagship guard (TS and Node)`);
      const holding = [
        moved('both leave-outs\' band variants at 2.25 and 2.15', (b) => { for (const x of Object.values(b.leave_outs)) { x.worst.multiple_high.multiple_p50 = 2.25; x.worst.multiple_low.multiple_p50 = 2.15; } }),
        moved('one_per_person and verified_halves 180 s from the pooled', (b) => { member(b, 'one_per_person').extra_p50_s = pooledExtra + 180; member(b, 'verified_halves').extra_p50_s = pooledExtra - 180; }),
      ];
      for (const [fixture, what] of holding) ok(D.flagshipGuard(fixture) && H.flagshipGuard(fixture), `half fixtures: ${what} still holds the flagship guard (TS and Node)`);
      // The TS guard's bars are analysis/half_linked.py's, read from its source.
      const py = fs.readFileSync(path.join(__dirname, '..', '..', 'analysis', 'half_linked.py'), 'utf8');
      const num = (re) => Number(re.exec(py)?.[1]);
      eq([H.FLAGSHIP_CLAUSES.multiple_band[0], H.FLAGSHIP_CLAUSES.multiple_band[1], H.FLAGSHIP_CLAUSES.gap_s, H.FLAGSHIP_CLAUSES.under_double_max],
        [num(/^MULTIPLE_BAND = \(([\d.]+), /m), num(/^MULTIPLE_BAND = \([\d.]+, ([\d.]+)\)/m), num(/^GAP_S = (\d+)$/m), num(/^UNDER_DOUBLE_MAX = ([\d.]+)$/m)],
        'half fixtures: the TS flagship bars are half_linked.py\'s MULTIPLE_BAND, GAP_S and UNDER_DOUBLE_MAX');
    }
    // The figure's own guard follows the variants too (lead rulings A1 and A2, October 31, 2026): with every member and
    // variant at the pooled reading and the verified halves on the pooled share it holds; one variant at 15% under double,
    // or one variant under 100 pairs, and the figure is the count of pairs again, whatever the members say.
    const g0 = clone(pass);
    g0.checks.battery.members.find((m) => m.id === 'verified_halves').under_double = g0.overall.under_double_plus_min['0'];
    ok(D.figureGuard(g0) && H.figureGuard(g0) && H.halfExtraFrom(g0).values.figure_is_share === 1, 'half fixtures: the figure guard holds with every member and variant at the pooled share');
    const g1 = clone(g0); g1.checks.battery.leave_outs.verified_halves.worst.under_double.under_double = 0.15;
    const g2 = clone(g0); g2.checks.battery.leave_outs.verified_federation.under_floor = 1;
    for (const [fixture, what] of [[g1, 'one verified_halves variant at 15% under double'], [g2, 'one verified_federation variant under 100 pairs']]) {
      const x = H.halfExtraFrom(fixture);
      ok(!D.figureGuard(fixture) && !H.figureGuard(fixture), `half fixtures: ${what} fails the figure guard`);
      ok(x.values.figure_is_share === 0 && x.key !== 'of marathons came in under double the half marathon before them', `half fixtures: ${what}: the figure is not the share under double`);
    }
    // The figure's own guard never outlives the H1's (AGENTS rule 13; lead rulings G, October 31, 2026): one verified_halves
    // variant 4 minutes off the pooled minutes fails the H1's guard alone, the figure's check still holds, and the figure
    // is the count of pairs with its neutral key.
    const g3 = clone(g0); g3.checks.battery.leave_outs.verified_halves.worst.extra.extra_p50_s = g3.checks.battery.members.find((m) => m.id === 'pooled').extra_p50_s - 240;
    const x3 = H.halfExtraFrom(g3);
    ok(!D.flagshipGuard(g3) && !H.flagshipGuard(g3) && D.figureGuard(g3) && H.figureGuard(g3), 'half fixtures: a leave-out 4 minutes off fails the H1 guard and not the figure check');
    eq([x3.guard, x3.values.figure_is_share, x3.values.figure_is_minutes, x3.figure.value, x3.key], [false, 0, 0, g3.set.pairs.toLocaleString('en-US'), 'pairs of a half and the marathon after it'], 'half fixtures: under a fallen H1 the figure is the count of pairs, whatever its own check says');
    // guessMore is tied to half.sexes: with the heading's guard failing alone (l3) the dek is null, and with it holding
    // on a copy whose neighbouring halves keep recorded women's share the lower, the dek is printed.
    {
      const holds = clone(linked);
      holds.sexes.strata = Math.max(holds.sexes.strata, 20); holds.sexes.women_lower = holds.sexes.strata; holds.sexes.diff_points = Math.max(holds.sexes.diff_points, 10);
      holds.checks.verified.sexes.women_lower = holds.checks.verified.sexes.strata;
      const flagshipH = Math.round(holds.checks.battery.pooled_half_p50_s / 300) * 300;
      const at = (l, g, h) => l.windows[g].find((x) => x.h === h);
      const sides = [flagshipH - 900, flagshipH + 900];
      if (sides.every((h) => at(holds, 'F', h) && at(holds, 'M', h)) && at(holds, 'F', flagshipH) && at(holds, 'M', flagshipH)) {
        for (const h of sides) { at(holds, 'F', h).sus = 0.1; at(holds, 'M', h).sus = 0.3; }
        ok(H.halfSexesFrom(holds).guard && typeof H.halfDeksFrom(field, women, holds).guessMore === 'string', 'half fixtures: while half.sexes holds and women’s share is the lower at both neighbouring halves, guessMore is printed');
        const falls = clone(holds); falls.checks.verified.sexes.women_lower = 0;
        ok(!H.halfSexesFrom(falls).guard && H.halfDeksFrom(field, women, falls).guessMore === null, 'half fixtures: with half.sexes failing alone, guessMore is null');
      } else ok(false, 'half fixtures: the flagship half and its neighbours are published for both sexes (guessMore cannot be tested)');
    }
    const pacingFixtures = [];
    // How halves are paced: every clause of the three guards, each moved alone from a copy that holds them all.
    {
      const base = { overall: { n: 600000, e: 90, l: 51, median: 0.034, faster: 0.28, slower10: 0.2 }, editions_equal: { editions: 90, median: 0.035, faster: 0.25, slower10: 0.19, above_zero: 81 },
        labels_equal: { labels: 51, median: 0.032, faster: 0.26, slower10: 0.18 }, leave_label_out: { median_min: 0.028, median_max: 0.037, faster_min: 0.25, faster_max: 0.31 },
        rules: { band_s: 1200 }, bands: [3600, 4800, 6000, 7200, 8400].map((lo, i) => ({ lo_s: lo, n: 1000, e: 9, l: 5, median: 0.01 + 0.02 * i, faster: 0.3, slower10: 0.1 })) };
      const moved = (change) => { const x = clone(base); change(x); return x; };
      ok(H.halfPaceFrom(base).guard && paceGuard(base) && H.halfPaceFasterFrom(base).guard && fasterGuard(base) && H.halfPaceBands(base).guard && bandsGuard(base), 'half fixtures: the pacing base holds the three guards (TS and Node)');
      const paceFails = [
        ['the pooled median at +1%', (x) => { x.overall.median = 0.01; x.editions_equal.median = 0.01; x.labels_equal.median = 0.01; x.leave_label_out.median_min = 0.01; x.leave_label_out.median_max = 0.01; }],
        ['the pooled median at +10%', (x) => { x.overall.median = 0.10; x.editions_equal.median = 0.10; x.labels_equal.median = 0.10; x.leave_label_out.median_min = 0.10; x.leave_label_out.median_max = 0.10; }],
        ['editions weighted equally 1.01 points off', (x) => { x.editions_equal.median = x.overall.median + 0.0101; }],
        ['labels weighted equally 1.01 points off', (x) => { x.labels_equal.median = x.overall.median - 0.0101; }],
        ['one race label left out 1.01 points below', (x) => { x.leave_label_out.median_min = x.overall.median - 0.0101; }],
        ['one race label left out 1.01 points above', (x) => { x.leave_label_out.median_max = x.overall.median + 0.0101; }],
        ['71 of 90 editions above zero', (x) => { x.editions_equal.above_zero = 71; }],
      ];
      for (const [what, change] of paceFails) { const x = moved(change); ok(!H.halfPaceFrom(x).guard && !paceGuard(x), `half fixtures: ${what} fails half.pace (TS and Node)`); }
      for (const [what, change] of [['72 of 90 editions above zero', (x) => { x.editions_equal.above_zero = 72; }], ['a weighting exactly 1.0 point off', (x) => { x.overall.median = 0.03; x.editions_equal.median = 0.04; x.labels_equal.median = 0.03; x.leave_label_out.median_min = 0.02; x.leave_label_out.median_max = 0.03; }]]) {
        const x = moved(change); ok(H.halfPaceFrom(x).guard === paceGuard(x), `half fixtures: ${what}: TS and Node agree on half.pace`);
      }
      const fasterFails = [
        ['editions weighted equally 5.1 points off', (x) => { x.editions_equal.faster = x.overall.faster - 0.051; }],
        ['one race label left out 5.1 points below', (x) => { x.leave_label_out.faster_min = x.overall.faster - 0.051; }],
        ['one race label left out 5.1 points above', (x) => { x.leave_label_out.faster_max = x.overall.faster + 0.051; }],
      ];
      for (const [what, change] of fasterFails) {
        const x = moved(change);
        ok(!H.halfPaceFasterFrom(x).guard && !fasterGuard(x) && H.halfDeksFrom(field, women, linked, x).paceFaster === null, `half fixtures: ${what} fails half.paceFaster and takes its dek away`);
      }
      const bandFails = [
        ['three bands from 1:20', (x) => { x.bands = x.bands.slice(0, 4); }],
        ['a median that falls from one band to the next', (x) => { x.bands[3].median = x.bands[2].median - 0.001; }],
        ['a last band of two labels', (x) => { x.bands[x.bands.length - 1].l = 2; }],
        ['a first band from 1:20 of two labels', (x) => { x.bands[1].l = 2; }],
      ];
      for (const [what, change] of bandFails) {
        const x = moved(change);
        ok(!H.halfPaceBands(x).guard && !bandsGuard(x) && H.halfDeksFrom(field, women, linked, x).paceBands === null, `half fixtures: ${what} fails half.paceBands and takes its dek away`);
      }
      // The 1:00 band never counts toward the four, and a level run of medians holds the guard but prints no "larger".
      ok(typeof H.halfDeksFrom(field, women, linked, base).paceBands === 'string' && typeof H.halfDeksFrom(field, women, linked, base).paceFaster === 'string', 'half fixtures: the pacing deks print while their guards hold');
      const level = moved((x) => { for (const b of x.bands) b.median = 0.03; });
      ok(H.halfPaceBands(level).guard && H.halfDeksFrom(field, women, linked, level).paceBands === null, 'half fixtures: level band medians hold the guard and print no direction');
      // Without the family (left out under a builder floor) every pacing reading falls back and no dek prints.
      ok(!H.halfPaceFrom(null).guard && !H.halfPaceFasterFrom(null).guard && !H.halfPaceBands(null).guard && H.halfDeksFrom(field, women, linked, null).paceFaster === null && H.halfDeksFrom(field, women, linked, null).paceBands === null, 'half fixtures: without the pacing family nothing is said');
      pacingFixtures.push([H.halfPaceFrom(moved(paceFails[2][1])), 'Pace after 10 km of a half, against the first 10 km.'], [H.halfPaceFasterFrom(moved(fasterFails[0][1])), 'The last 11.1 km against the first 10 km, result by result.'],
        [H.halfPaceFrom(null), 'Pace after 10 km of a half, against the first 10 km.']);
    }
    return [
      [H.halfFieldFrom(f1), 'Half marathon finishes by finish time.'],
      [H.halfUnderFrom(f2), 'Half finishes under 1:45.'],
      [H.halfCrowdFrom(f3), 'Finishes in the minute before each round time.'],
      [H.halfWomenFrom(w1), 'Women’s share of half finishes, by finish time.'],
      [H.halfCitiesFrom(w2), 'Women’s share of marathon and half finishes, same city and year.'],
      [H.halfExtraFrom(l1), 'The marathon after a half, against double the half.'],
      [H.halfExtraFrom(l5), 'The marathon after a half, against double the half.'],
      [H.halfExtraFrom(l6), 'The marathon after a half, against double the half.'],
      [H.halfRangeFrom(l2), 'The marathon after each half time.'],
      [H.halfSexesFrom(l3), 'Sustained slowdowns in recorded women’s and men’s marathons after the same half.'],
      [H.halfSexesGuessFrom(l4), 'Recorded women’s and men’s marathons after the same half.'],
      ...pacingFixtures,
    ];
  };

  return { RECOUNT: R, deks, fixtures };
};
