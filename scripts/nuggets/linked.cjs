'use strict';
// The linked-records pages' recount (lib/linked-server.ts, lib/nuggets/linked.ts; the chapter "Over the years"), run by
// scripts/verify-nuggets.cjs. Every verdict a page reads is recomputed here from the published numbers with a second,
// plain implementation of the contract's guard (docs/LINKED_RECORDS.md), and the helper other pages call
// (linkedEditionReading) is tested on every edition of the file and on planted rows.
const fs = require('node:fs');
const path = require('node:path');

module.exports = function linkedRecounts({ ROOT, N, core, ok, eq, problems }) {
  let checks = 0;
  const step = (fn) => { fn(); checks++; };
  const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/linked', file), 'utf8'));
  const editions = read('editions.json');

  // ---------- The helper: the verdict of an edition as words ----------
  const S = require('../../lib/linked-server.ts');
  const WORDS = { slow: 'a slow year for linked runners', fast: 'a fast year for linked runners', usual: 'a usual year for linked runners' };
  const plain = (row) => {
    if (row.finishes < editions.min_finishes || row.others < 2) return null;
    const m = editions.margin_pct, h = row.high_pct;
    if (row.lo_pct > m && (h === null || h > 0)) return 'slow';
    if (row.hi_pct < -m && (h === null || h < 0)) return 'fast';
    if (row.lo_pct > -m && row.hi_pct < m) return 'usual';
    return null;
  };
  let shown = 0;
  for (const [label, years] of Object.entries(editions.races)) {
    for (const [year, row] of Object.entries(years)) {
      const verdict = plain(row);
      step(() => eq(verdict, row.verdict, `linked: ${label} ${year}: the file's verdict is its guard's`));
      const reading = S.linkedEditionReading(label, Number(year), row.series ?? null);
      const want = verdict && row.basis === 'chip_or_net' ? WORDS[verdict] : null;
      step(() => eq(reading ? reading.words : null, want, `linked: ${label} ${year}: the helper's words (chip or net only)`));
      if (reading) {
        shown++;
        step(() => eq(reading.reviewed, row.reviewed_release === true, `linked: ${label} ${year}: the review flag`));
        step(() => eq(S.linkedEditionWords(label, year), want, `linked: ${label} ${year}: the words without a series`));
      }
    }
  }
  step(() => eq(S.linkedEditionReading('No such race', 2020), null, 'linked: an unknown race has no words'));
  step(() => eq(S.linkedEditionReading('Berlin', 1900), null, 'linked: an edition not in the file has no words'));
  let threw = false;
  try { S.linkedEditionReading('Warsaw', 2015, 'PZU Warsaw Marathon'); } catch { threw = true; }
  step(() => ok(threw, 'linked: a series that is not the year\'s is an error'));
  threw = false;
  try { S.linkedEditionReading('Berlin', 2006, 'Some series'); } catch { threw = true; }
  step(() => ok(threw, 'linked: a series for a label without one is an error'));
  const base = { basis: 'chip_or_net', finishes: 500, others: 5, high_pct: null };
  const g = (row) => S.linkedEditionGuard({ ...base, ...row }, { margin: 1, minFinishes: 100 });
  step(() => eq([g({ lo_pct: 1.2, hi_pct: 2 }), g({ lo_pct: 1.2, hi_pct: 2, high_pct: -0.1 }), g({ lo_pct: -2, hi_pct: -1.1 }), g({ lo_pct: -0.9, hi_pct: 0.9 }),
    g({ lo_pct: -1, hi_pct: 0.5 }), g({ lo_pct: 1.2, hi_pct: 2, finishes: 99 }), g({ lo_pct: 1.2, hi_pct: 2, others: 1 })],
  ['slow', null, 'fast', 'usual', null, null, null], 'linked: the guard on planted rows (high-links sign, the ±1 margin, the two floors)'));
  step(() => ok(shown > 0 && shown < Object.values(editions.races).reduce((s, y) => s + Object.keys(y).length, 0), 'linked: the helper gives words for some editions and not others'));

  // ---------- The nuggets: each guard and its numbers recounted with a plain second implementation ----------
  const checksFile = read('checks.json'), races = read('races.json'), bests = read('bests.json'), age = read('age.json'), back = read('return.json'), again = read('recorded_again.json');
  const say = (n) => core.sentenceOf(n);
  const holdsYears = checksFile.slowdown.verdict === 'holds' && checksFile.slowdown.relation.r >= checksFile.slowdown.bar
    && Object.values(editions.races).some((y) => Object.values(y).some((r) => r.verdict === 'slow'))
    && Object.values(editions.races).some((y) => Object.values(y).some((r) => r.verdict === 'fast'));
  const RECOUNT = {
    'years.title': (n) => { eq(n.guard, holdsYears, 'years.title guard'); },
    // Counted from the verdicts, recomputed by the plain guard above (decision D47, November 20, 2026: it was the point
    // readings beyond 2%, 121 of 443, a bar the verdicts do not use).
    'years.called': (n) => {
      const tally = { fast: 0, slow: 0, usual: 0, none: 0 };
      let all = 0;
      for (const y of Object.values(editions.races)) for (const r of Object.values(y)) { all++; tally[plain(r) ?? 'none']++; }
      eq([n.values.fast, n.values.slow, n.values.usual, n.values.no_verdict, n.values.editions], [tally.fast, tally.slow, tally.usual, tally.none, all], 'years.called: fast, slow, usual and uncalled race-years, recounted from the readings');
      eq(n.guard, holdsYears && all >= 3, 'years.called guard');
      if (n.guard) {
        eq(n.figure.value, String(Math.round(100 * (tally.fast + tally.slow) / all)), 'years.called figure');
        ok(say(n).includes(`${Math.round(100 * (tally.fast + tally.slow) / all)}%`) && n.key === 'of race-years were fast or slow years for linked runners', 'years.called: the sentence and the key');
      }
    },
    'years.heat': (n) => {
      const b = checksFile.temperature.bands.filter((x) => x.mean_pct !== null && x.editions >= 3);
      const g = b.length > 1 && b[b.length - 1].temp_to === null && b[b.length - 1].mean_pct - b[0].mean_pct >= 2 && checksFile.temperature.start.r > 0 && checksFile.temperature.window.r > 0;
      eq(n.guard, g, 'years.heat guard');
      // The band means recounted from the published points: each point's deviation from its race-and-basis mean.
      const groups = {};
      for (const p of checksFile.temperature.points) (groups[`${p.label}|${p.series || ''}|${p.basis}`] ||= []).push(p);
      const dev = [];
      for (const list of Object.values(groups)) { if (list.length < 3) continue; const m = list.reduce((s, p) => s + p.level, 0) / list.length; for (const p of list) dev.push([p.temp_window, p.level - m]); }
      const top = dev.filter(([t]) => t >= 20);
      const mean = top.reduce((s, [, d]) => s + d, 0) / top.length;
      ok(Math.abs(mean - n.values.warm_pct) < 0.05, `years.heat: the warmest band's mean deviation recounts (${mean.toFixed(3)} against ${n.values.warm_pct})`);
      if (n.guard) ok(say(n).includes(`about ${Math.round(n.values.warm_pct)}% slower`), 'years.heat: the sentence rounds the band mean');
    },
    'years.field': (n) => {
      // The within-race correlation of the reading with the whole field's share, recounted from the published points.
      const groups = {};
      for (const p of checksFile.slowdown.points) (groups[`${p.label}|${p.series || ''}|${p.basis}`] ||= []).push(p);
      let sxy = 0, sxx = 0, syy = 0;
      for (const list of Object.values(groups)) {
        if (list.length < checksFile.slowdown.min_editions) continue;
        const mx = list.reduce((s, p) => s + p.slow / p.eligible, 0) / list.length, my = list.reduce((s, p) => s + p.level, 0) / list.length;
        for (const p of list) { const dx = p.slow / p.eligible - mx, dy = p.level - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
      }
      const r = sxy / Math.sqrt(sxx * syy);
      ok(Math.abs(r - n.values.r) < 0.002, `years.field: the within-race correlation recounts (${r.toFixed(4)} against ${n.values.r})`);
      eq(n.guard, r >= checksFile.slowdown.bar && checksFile.slowdown.verdict === 'holds', 'years.field guard');
    },
    'races.title': (n) => {
      const v = [...Object.values(races.races), ...Object.values(races.series || {}).flatMap((x) => Object.values(x))].map((r) => r.verdict);
      eq(n.guard, v.includes('faster') && v.includes('slower'), 'races.title guard');
    },
    'races.faster': (n) => {
      const rows = [...Object.values(races.races), ...Object.values(races.series || {}).flatMap((x) => Object.values(x))];
      const plainRace = (r) => {
        const vs = ['verified', 'high'].map((k) => r.variants[k]).filter(Boolean).map((x) => x.reading_pct);
        if ([r.reading_pct, r.earlier_pct, r.later_pct, ...vs].every((x) => x < 0) && r.hi_pct < 0 && r.boot_hi_pct < 0) return 'faster';
        if ([r.reading_pct, r.earlier_pct, r.later_pct, ...vs].every((x) => x > 0) && r.lo_pct > 0 && r.boot_lo_pct > 0) return 'slower';
        if ([r.lo_pct, r.hi_pct, r.boot_lo_pct, r.boot_hi_pct, r.earlier_pct, r.later_pct].every((x) => x > -2 && x < 2)) return 'about_the_same';
        return null;
      };
      for (const r of rows) eq(plainRace(r), r.verdict, 'races: every race verdict recounts from its numbers');
      const faster = rows.filter((r) => r.verdict === 'faster').length;
      eq([n.values.faster, n.values.readings], [faster, rows.length], 'races.faster: the count of faster readings and of readings');
      eq(n.guard, faster > 0, 'races.faster guard');
    },
    // The H1, the card and #later read the turn (review round M6, November 20, 2026): from the first attempt that is
    // less often on, every attempt is less often and none before it.
    'bests.title': (n) => {
      const v = bests.by_recorded_attempt.map((a) => plainShare(a.recorded_bests, a.results, 1 / a.recorded_attempt, Object.values(a.variants)));
      const k = v.indexOf('less_often');
      eq(n.guard, k > 0 && v.slice(k).every((x) => x === 'less_often'), 'bests.title guard (the turn)');
      if (n.guard) ok(!/second/.test(say(n)) && say(n).includes(`From the ${ORD[bests.by_recorded_attempt[k].recorded_attempt]} recorded marathon on`), 'bests.title: the turn, never the guess\'s answer');
    },
    'bests.turn': (n) => {
      const v = bests.by_recorded_attempt.map((a) => plainShare(a.recorded_bests, a.results, 1 / a.recorded_attempt, Object.values(a.variants)));
      const k = v.indexOf('less_often'), a = bests.by_recorded_attempt[k];
      eq(n.guard, k > 0 && v.slice(k).every((x) => x === 'less_often') && a.results >= 100, 'bests.turn guard');
      if (n.guard) {
        eq([n.values.from_attempt, n.figure.value], [a.recorded_attempt, String(Math.round(100 * a.recorded_bests / a.results))], 'bests.turn: the attempt and its share');
        eq(n.key, `of ${ORD[a.recorded_attempt]} recorded marathons were a recorded best, against ${Math.round(100 / a.recorded_attempt)}% by order alone`, 'bests.turn key');
        ok(!/second/.test(n.key + say(n)), 'bests.turn: the card never gives the guess away');
      }
    },
    'bests.second': (n) => {
      const a = bests.by_recorded_attempt.find((x) => x.recorded_attempt === 2);
      ok(Math.abs(n.values.share - a.recorded_bests / a.results) < 1e-9, 'bests.second share from its counts');
      eq(n.guard, plainShare(a.recorded_bests, a.results, 0.5, Object.values(a.variants)) === 'more_often', 'bests.second guard');
      eq(n.figure.value, String(Math.round(100 * a.recorded_bests / a.results)), 'bests.second figure');
    },
    // #later reads the tenth recorded marathon against order alone and never names the second or third (re-review D2,
    // ruling D55, November 20, 2026: the heading sits beside the unanswered guess on the first phone screen).
    'bests.later': (n) => {
      const v = bests.by_recorded_attempt.map((a) => plainShare(a.recorded_bests, a.results, 1 / a.recorded_attempt, Object.values(a.variants)));
      eq(v, bests.by_recorded_attempt.map((a) => a.verdict), 'bests: every attempt verdict recounts');
      const i = bests.by_recorded_attempt.findIndex((a) => a.recorded_attempt === 10), a = bests.by_recorded_attempt[i];
      eq(n.guard, i >= 0 && a.results >= 100 && v[i] === 'less_often', 'bests.later guard (the tenth, less often than 1 in 10)');
      ok(!/second|third|2nd|3rd/i.test(say(n)), 'bests.later: the heading beside the guess never names the second or third');
      if (n.guard) {
        eq([n.values.attempt, n.values.recorded_bests, n.values.results], [10, a.recorded_bests, a.results], 'bests.later: the tenth and its counts');
        eq(say(n).replace(/\*/g, ''), `Of tenth recorded marathons, ${Math.round(100 * a.recorded_bests / a.results)}% were bests, against ${Math.round(100 / a.recorded_attempt)}% by order alone.`, 'bests.later: the sentence from its counts');
      }
    },
    'again.finish': (n) => {
      for (const t of ['by_finish', 'by_finish_band', 'by_age_band']) for (const r of again[t]) eq(plainAgain(r), r.verdict, `recorded again: the ${t} verdicts recount`);
      const f = again.by_finish;
      eq(n.guard, plainAgain(f[0]) === 'more_often' && plainAgain(f[f.length - 1]) === 'less_often', 'again.finish guard');
    },
    'again.age': (n) => {
      const v = again.by_age_band.map(plainAgain);
      const lo = v.findIndex((x) => x !== 'less_often'), hi = v.length - [...v].reverse().findIndex((x) => x !== 'more_often');
      eq(n.guard, lo > 0 && hi < v.length && lo <= hi, 'again.age guard');
      if (n.guard) eq([n.values.under_age, n.values.from_age], [again.by_age_band[lo].age_from, again.by_age_band[hi].age_from], 'again.age: the two ends');
    },
    'age.title': (n) => {
      const b = age.bands;
      eq(b.map((x) => x.verdict), b.map(plainAge), 'age: every band verdict recounts');
      eq(n.guard, b.length >= 3 && b.every((x, i) => plainAge(x) === 'stated' && (i === 0 || x.median_pct_per_year > b[i - 1].median_pct_per_year)), 'age.title guard');
    },
    'age.fifty': (n) => {
      const b = age.bands.find((x) => x.age_from === 50);
      eq(n.guard, plainAge(b) === 'stated' && b.median_pct_per_year > 0, 'age.fifty guard');
      if (n.guard) eq(n.figure.value, b.median_pct_per_year.toFixed(1), 'age.fifty figure');
    },
    'age.across': (n) => {
      const rows = age.bands.filter((x) => x.age_from >= 45);
      eq(n.guard, rows.length >= 3 && rows.every((x) => plainAge(x) === 'stated' && x.by_sex.M && x.by_sex.M.pairs >= 100 && x.cross_section.M && x.by_sex.M.median_pct_per_year > x.cross_section.M.pct_per_year), 'age.across guard');
    },
    'again.slowdown': (n) => {
      ok(Math.abs(back.with_slowdown.share - back.with_slowdown.seen_again / back.with_slowdown.finishes) < 1e-9, 'return: the share with a slowdown from its counts');
      const v = back.difference_hi_points < 0 && (back.verified.difference_points ?? -1) < 0 && (back.high.difference_points ?? -1) < 0;
      eq(back.verdict === 'less_often', v, 'return: the verdict recounts');
      eq(n.guard, v && back.with_slowdown.share < back.matched_without.share, 'again.slowdown guard');
    },
  };
  const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
  function plainShare(k, n, expected, variants) {
    const share = k / n, se = Math.sqrt(expected * (1 - expected) / n), side = Math.sign(share - expected);
    const vs = variants.filter((v) => v && v.results >= 100).map((v) => Math.sign(v.recorded_bests / v.results - expected));
    if (Math.abs(share - expected) > 0.01 && Math.abs(share - expected) > 1.96 * se && vs.every((s) => s === side)) return side > 0 ? 'more_often' : 'less_often';
    if (Math.abs(share - expected) + 1.96 * se <= 0.01) return 'as_often';
    return null;
  }
  function plainAgain(r) {
    const vs = ['verified', 'high', 'same_race', 'men', 'women'].map((k) => r[k]);
    if (r.difference_points >= 1 && r.lo_points > 0 && vs.every((v) => v && v.difference_points > 0)) return 'more_often';
    if (r.difference_points <= -1 && r.hi_points < 0 && vs.every((v) => v && v.difference_points < 0)) return 'less_often';
    return null;
  }
  function plainAge(b) {
    const m = b.median_pct_per_year;
    return ['same_race', 'verified', 'high'].every((k) => b[k] && b[k].pairs >= 100 && Math.abs(b[k].median_pct_per_year - m) <= 0.3) ? 'stated' : null;
  }
  for (const [id, recount] of Object.entries(RECOUNT)) {
    const n = N.getNugget(id);
    step(() => eq(problems(n, { strict: true }), [], `${id}: the text rules`));
    step(() => recount(n));
    let caught = false;
    try { recount({ ...n, guard: !n.guard }); } catch { caught = true; }
    step(() => ok(caught, `self-test: ${id} with its guard flipped fails its recount`));
    if (!n.guard) continue;
  }

  // ---------- Fixtures: each fallback renders and states no reading ----------
  const L = require('../../lib/nuggets/linked.ts');
  const fx = [
    [L.yearsTitleFrom({ summary: { by_verdict: { slow: 3, fast: 2 } } }, { slowdown: { verdict: null } }), 'Fast years and slow years'],
    [L.yearsCalledFrom({ summary: { by_verdict: { slow: 75, fast: 84, usual: 69 }, no_verdict: 215, editions: 443 } }, { slowdown: { verdict: null } }), '443 race-years, each read against the race’s other years, for records linked by name.'],
    [L.yearsCalledFrom({ summary: { by_verdict: { slow: 75, fast: 84, usual: 69 }, no_verdict: 200, editions: 443 } }, { slowdown: { verdict: 'holds' } }), '443 race-years, each read against the race’s other years, for records linked by name.'],
    [L.bestsTurnFrom({ by_recorded_attempt: [{ recorded_attempt: 2, results: 500, verdict: 'more_often' }, { recorded_attempt: 3, results: 300, verdict: 'less_often' }, { recorded_attempt: 4, results: 200, verdict: null }] }), '1,000 recorded marathons after a first, for records linked by name.'],
    [L.racesFasterFrom({ summary: { by_verdict: {}, no_verdict: 1 }, races: { X: {} }, series: {} }), '1 races, each read against the other races of the same years, for records linked by name.'],
    [L.bestsSecondFrom({ by_recorded_attempt: [{ recorded_attempt: 2, results: 500, recorded_bests: 250, share: 0.5, shuffled_share: 0.5, verdict: 'as_often', variants: {} }] }), '500 second recorded marathons, for records linked by name.'],
    [L.ageFiftyFrom({ bands: [{ age_from: 50, age_to: 54, pairs: 300, median_pct_per_year: 1, verdict: null }] }), '300 pairs of recorded marathons at 50 to 54, for records linked by name.'],
    [L.againAgeFrom({ by_age_band: [{ age_from: 18, age_to: 24, verdict: null }, { age_from: 25, age_to: 29, verdict: 'more_often' }] }), 'Finishes recorded at another marathon, by age at the race.'],
    [L.againSlowdownFrom({ ...back, verdict: null }), 'Finishes with and without a sustained slowdown, and another recorded marathon.'],
  ];
  for (const [n, text] of fx) {
    step(() => eq(n.guard, false, `fixture ${n.id}: the guard fails`));
    step(() => eq(core.sentenceOf(n), text, `fixture ${n.id}: the fallback renders`));
    step(() => ok(!/\d+(\.\d+)?%/.test(text) && !n.key?.includes('%'), `fixture ${n.id}: the fallback states no share`));
  }

  return { checks, shown };
};
