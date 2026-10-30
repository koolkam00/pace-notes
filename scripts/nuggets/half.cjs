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
  const close = (a, b, message, tol = 1e-9) => ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);
  const shown = (n) => core.sentenceOf(n, 'mi');
  const has = (n, text, message) => ok(shown(n).includes(text), `${message}: "${text}" in "${shown(n)}"`);
  // The shared pure derivations (scripts/half/derive.cjs): times as pages print them, shares, 1 in d, numpy's median.
  const D = require('../half/derive.cjs');
  const { clock, pct, oneIn } = D;
  const words = (t) => core.plain(t).split(/\s+/).filter(Boolean).length;
  const median = D.npMedian;

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

  const bandShares = women.bands.map((_, j) => median(women.band_editions.map((r) => r.F[j] / r.n[j])));
  R['half.women'] = (n) => {
    women.bands.forEach((_, j) => close(women.median_share[j], bandShares[j], `half.women: band ${j} median from the unnamed rows`));
    for (const row of women.band_editions) ok(row.n.every((v) => v >= 100), 'half.women: every band row holds at least 100 recorded finishes');
    let cross = null;
    for (let j = 1; j < bandShares.length; j++) if (bandShares[j - 1] <= 0.5 && bandShares.slice(j).every((s) => s > 0.5)) { cross = women.bands[j].lo_s; break; }
    eq(women.cross_s, cross, 'half.women: the crossing from the medians');
    eq(n.guard, cross !== null && women.band_editions.length >= 20, 'half.women: guard');
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
    const minutes = Math.round(linked.overall.extra_s.p50 / 60);
    eq(n.values.extra_min, minutes, 'half.extra: minutes over double, rounded');
    eq(n.guard, flagshipOk(), 'half.extra: guard (the weighting battery)');
    if (n.guard) eq(shown(n), `After a half, the typical marathon took double it plus *${minutes} minutes*.`, 'half.extra: the H1');
    const share = linked.overall.under_double_plus_min['0'];
    const figureOk = Object.values(battery).every((m) => m.under_double < 0.15) && Math.abs(share - battery.verified_halves.under_double) <= 0.03;
    eq(n.figure.value, figureOk ? String(Math.round(share * 100)) : `+${minutes}`, 'half.extra: the figure');
    eq(n.key, figureOk ? 'of marathons came in under double the half before them' : 'over double the half, typical', 'half.extra: the key');
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

  // Every half nugget: one family per page, H2s of at most 12 words, a neutral fallback.
  const FAMILY = { 'half.field': 'half', 'half.under': 'half', 'half.crowd': 'half', 'half.women': 'half', 'half.cities': 'half',
    'half.extra': 'linked', 'half.range': 'linked', 'half.sexes': 'linked', 'half.sexesGuess': 'linked' };
  const wrap = (id, inner) => (n) => {
    inner(n);
    ok(words(core.textFor(n.headline, 'mi')) <= 12, `${id}: "${core.textFor(n.headline, 'mi')}" is over 12 words`);
    eq(n.denominator, FAMILY[id], `${id}: its count family`);
    ok(n.page === '/half' || n.page.startsWith('/half#') || n.page.startsWith('/stories/half-to-full'), `${id}: a half page`);
  };
  for (const id of Object.keys(R)) R[id] = wrap(id, R[id]);

  // The deks a page prints (lib/nuggets/half.ts halfDeks), recounted.
  const deks = (H) => {
    const d = H.halfDeks();
    eq(d.fieldUnit, `the median half finish; recorded women’s ${clock(field.quantiles.F.p50)}, men’s ${clock(field.quantiles.M.p50)}`, 'half deks: the reading’s unit line');
    eq(d.under, `Recorded women’s: ${pct(underSex('F', 6300))}. Men’s: ${pct(underSex('M', 6300))}. Slide to any time from 1:10 to 3:00.`, 'half deks: beat 1');
    eq(d.women, `Under 1:30, ${pct(bandShares[0])} were. In the marathon, women’s finishes are the majority only from ${clock(women.marathon.cross_s)}.`, 'half deks: beat 3');
    const share = (c) => c.F / (c.F + c.M);
    // Two medians across the pairs, worded as two: never "the typical city and year", which no pair is (round 2).
    eq(d.cities, `Women’s share of finishes was typically ${pct(median(women.same_city.pairs.map((p) => share(p.half))))} in the half and ${pct(median(women.same_city.pairs.map((p) => share(p.marathon))))} in the marathon.`, 'half deks: beat 4');
    ok(!/typical city|typical pair/.test(d.cities), 'half deks: beat 4 never names one typical city and year');
    const w = flagship('all'), all = linked.windows.all;
    const win = (g, h) => linked.windows[g].find((x) => x.h === h);
    // Beat 1's dek is the spec's: the typical marathon after the flagship's half, then the needle's range (round 2).
    const slide = `Slide to any half from ${clock(all[0].h)} to ${clock(all[all.length - 1].h)}.`;
    eq(d.range, `The typical one took ${clock(w.q[9])}. ${slide}`, 'half deks: story beat 1');
    // The reading's scale note: the minutes over double 15 minutes either side of the flagship's half, each the window's
    // median extra in whole minutes (the H1's own rounding), only while the slower half's is the larger.
    const qa = win('all', w.h - 900), qb = win('all', w.h + 900);
    const a = qa && Math.round(qa.extra_p50 / 60), b = qb && Math.round(qb.extra_p50 / 60);
    eq(d.scale, qa && qb && a < b ? `Fewer minutes over double after a quicker half, more after a slower one: +${a} after a ${clock(qa.h)} half, +${b} after a ${clock(qb.h)}.` : null, 'half deks: the reading’s scale note');
    const m = flagship('M');
    eq(d.guess, `After a ${clock(m.h)} half, ${Math.round(m.sus * 100)} of 100 recorded men’s marathons had a sustained slowdown. How many of 100 recorded women’s?`, 'half deks: the guess');
    const sides = [w.h - 900, w.h + 900].map((h) => [win('F', h), win('M', h)]);
    const lower = sides.every(([pf, pm]) => pf && pm && pf.sus < pm.sus);
    eq(d.guessMore, lower ? sides.map(([pf, pm], k) => (k === 0 ? `After a ${clock(pf.h)} half: ${pct(pf.sus)} of recorded women’s, against ${pct(pm.sus)} of men’s.` : `After a ${clock(pf.h)} half: ${pct(pf.sus)} against ${pct(pm.sus)}.`)).join(' ') : null, 'half deks: after the guess, women lower at both neighbouring halves');
    const marks = Object.fromEntries(field.marks.map((x) => [x.minutes, x]));
    const crowdOk = marks[90].ratio_ci95[0] > 1.1 && [105, 135, 150].every((k) => marks[k].ratio < 1.1);
    const two = marks[120];
    const others = [105, 135, 150].map((k) => marks[k].ratio);
    const fmtCount = (v) => v.toLocaleString('en-US');
    eq(d.crowd, `${fmtCount(two.minute_before)} finishes came in at 1:59, where the smooth curve expects about ${fmtCount(Math.round(two.expected_minute_before / 100) * 100)}.${crowdOk ? ` The minute before 1:30 held ${marks[90].ratio.toFixed(1)}× too; before 1:45, 2:15 and 2:30, about ${median(others).toFixed(2)}×.` : ''}`, 'half deks: beat 2, the minute before 2:00 against the curve, then the other marks while 1:30 stands out and the others do not');
    eq(JSON.stringify(d.crowdNamed), JSON.stringify(crowdOk ? [90] : []), 'half deks: beat 2 draws 1:30 a step up only while its dek names it');
    for (const text of Object.values(d).filter(Boolean)) ok(!/\b(?:fastest|chance|predict|goal|target|because|verified|unverified)\b/i.test(text), `half deks: banned word in "${text}"`);
  };

  // Fixtures: the real files with one value moved so each guard fails.
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fixtures = (H) => {
    const f1 = clone(field); f1.checks.all_usable.under_7200 = 0.45;
    const f2 = clone(field); f2.checks.editions_equal.under_6300 = field.under.find((u) => u.s === 6300).all - 0.05;
    const f3 = clone(field); f3.marks.find((m) => m.minutes === 120).ratio_ci95[0] = 0.99;
    const w1 = clone(women); w1.band_editions = w1.band_editions.slice(0, 10);
    const w2 = clone(women); w2.same_city.summary.half_higher -= 1;
    const l1 = clone(linked); l1.checks.battery.members.find((m) => m.id === 'ns_keys_1').multiple_p50 = 2.3;
    const l2 = clone(linked); l2.checks.verified.w105_under_14400 = 0.5;
    const l3 = clone(linked); l3.sexes.women_lower = Math.floor(l3.sexes.strata * 0.5);
    const l4 = clone(linked); l4.windows.F = l4.windows.F.filter((w) => w.h !== 6300);
    return [
      [H.halfFieldFrom(f1), 'Half marathon finishes by finish time.'],
      [H.halfUnderFrom(f2), 'Half finishes under 1:45.'],
      [H.halfCrowdFrom(f3), 'Finishes in the minute before each round time.'],
      [H.halfWomenFrom(w1), 'Women’s share of half finishes, by finish time.'],
      [H.halfCitiesFrom(w2), 'Women’s share of half and marathon finishes, same city and year.'],
      [H.halfExtraFrom(l1), 'The marathon after a half, against double the half.'],
      [H.halfRangeFrom(l2), 'Marathons after a half, half time by half time.'],
      [H.halfSexesFrom(l3), 'Sustained slowdowns in women’s and men’s marathons after the same half.'],
      [H.halfSexesGuessFrom(l4), 'Recorded women’s and men’s marathons after the same half.'],
    ];
  };

  return { RECOUNT: R, deks, fixtures };
};
