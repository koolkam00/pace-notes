// nuggets.js: the prototype of lib/nuggets.ts.
// Every figure and every directional claim on a page comes from here, computed from
// release fields. Each returns { values, guard, ... }; a page shows the headline only
// when its guard holds and otherwise uses the neutral fallback. No number is typed.

import { fmtHM, fmtMS, pct, inWords, millions, U } from './core.js';

const cache = new Map();
export function load(name) {
  if (!cache.has(name)) cache.set(name, fetch(`data/${name}.json`).then(r => { if (!r.ok) throw new Error(name); return r.json(); }));
  return cache.get(name);
}
export const loadAll = names => Promise.all(names.map(load));

/* ---------- scale of the data ---------- */
export function scale(man) {
  const years = man.editions.map(e => e.year);
  return {
    finishes: man.cohort.after_duplicate_screen, // the story cohort used on the home page
    finishesM: millions(man.cohort.after_duplicate_screen),
    cities: man.cohort.cities,
    editions: man.cohort.editions,
    yearMin: Math.min(...years), yearMax: Math.max(...years),
  };
}

/* ---------- Lap 05: sustained slowdown ---------- */
export function slowdownRate(study) {
  const share = study.rate / 100;
  return { share, words: inWords(share), detected: study.detected, n: study.n, guard: share > 0 && share < 1 };
}
export function onsetLate(study) {
  const rows = study.timing.charts[0].rows;
  const total = rows.reduce((a, r) => a + r.episodes, 0);
  const late = rows.filter(r => r.label >= 30).reduce((a, r) => a + r.episodes, 0);
  return { share: late / total, rows, guard: late / total > 0.5 };
}

/* ---------- Lap 03: negative splits ---------- */
export function negativeSplit(patterns) {
  const r = patterns.rows.find(x => x.label === 'Faster second 20 km');
  const share = +r.value / 100;
  return { share, words: inWords(share), guard: share < 0.1 };
}

/* ---------- Lap 01 / 06: finish times ---------- */
export function busiestMinute(ft) {
  const best = g => ft.histogram.reduce((a, h) => (h[g] > a[g] ? h : a));
  const all = best('all'), w = best('women'), m = best('men');
  return { minute: all.minute, n: all.all, label: fmtHM(all.minute * 60), alike: all.minute === w.minute && w.minute === m.minute };
}
export function medianFinish(ft, g = 'all') {
  const total = ft.histogram.reduce((a, h) => a + h[g], 0);
  let run = 0;
  for (const h of ft.histogram) { run += h[g]; if (run >= total / 2) return { minute: h.minute, label: fmtHM(h.minute * 60) }; }
}
export function tallestTower(ft) {
  const m = ft.marks.reduce((a, x) => (x.ratio > a.ratio ? x : a));
  return { mark: m, ratio: m.ratio, before: fmtHM((m.minutes - 1) * 60), count: m.minute_before, guard: m.ratio > 1.1 };
}
export function quarterHours(ft) {
  const q = ft.marks.filter(m => m.kind === 'quarter');
  const below = q.filter(m => m.ratio < 1.05).length;
  return { q, guard: below > q.length / 2 };
}
export function cushion(ft) {
  const rows = ft.seconds.map(s => {
    const peak = s.bins.filter(b => b.offset_s < 0).reduce((a, b) => (b.n - b.expected > a.n - a.expected ? b : a));
    return { mark: s.mark, minutes: s.minutes, offset: peak.offset_s, bins: s.bins };
  });
  const widest = rows.reduce((a, r) => (r.offset < a.offset ? r : a));
  const tightest = rows.reduce((a, r) => (r.offset > a.offset ? r : a));
  return { rows, widest, tightest, guard: widest.minutes > tightest.minutes };
}
export function rescue(ft, minutes = 240) {
  const b = ft.bubble.find(x => x.minutes === minutes) || ft.bubble[0];
  return { mark: b.mark, minutes: b.minutes, share: b.over.share_under, expected: b.over.expected_share_under,
    gain: b.over.median_final_gain_s, expGain: b.over.expected_median_final_gain_s, guard: b.over.share_under > b.over.expected_share_under };
}

/* ---------- Lap 02: the first 5K ---------- */
export function bank(kick) {
  const b = kick.bank.bands.find(x => x.label === 'More than 10% faster') || kick.bank.bands[0];
  return { band: b, open: b.open_s, after20: b.after20_s, finish: b.finish_s, slowdown: b.slowdown, expected: b.expected,
    guard: b.open_s < 0 && b.finish_s > 0 };
}
export function bankBest(kick) {
  const c = kick.bank.curve.reduce((a, x) => (x.finish_s < a.finish_s ? x : a));
  return { point: c, lo: c.lo, guard: c.lo > 0 }; // "best openings were slightly slower" needs lo > 0
}
const onsetShare = g => g.onset[0] / g.onset.reduce((a, b) => a + b, 0);
export function onsetEarly(fs, city = 'All courses') {
  const row = fs.rows.find(r => r.city === city);
  const fast = row.groups.find(g => g.band === 'fast10'), steady = row.groups.find(g => g.band === 'steady');
  return { row, fast, steady, fastShare: onsetShare(fast), steadyShare: onsetShare(steady), guard: onsetShare(fast) > onsetShare(steady) };
}

/* ---------- Lap 04: on pace at 30 km ---------- */
export function checkpoint30(ck, goalMin = 240) {
  const even = goalMin * 30 / 42.195; // minutes at 30 km on even pace
  const row = ck.rows.find(r => r.checkpoint === 30 && r.elapsed <= even && even < r.elapsed + 2);
  if (!row) return { guard: false };
  const i = goalMin - row.cdf_min;
  const share = row.cdf[Math.min(i, row.cdf.length - 1)] / row.n;
  return { row, share, median: row.finish[1], guard: share < 0.5 };
}

/* ---------- Lap 07: who holds pace ---------- */
export function womenMen(demo) {
  const o = demo.overall;
  return { women: o.women_slowdown, men: o.men_slowdown, guard: o.men_slowdown > o.women_slowdown };
}

/* ---------- Lap 09: where you run ---------- */
export function courseSpread(af, minN = 10000) {
  const cs = af.rows[0].courses.filter(c => c.n >= minN && c.edition_n >= 3);
  const lo = cs.reduce((a, c) => (c.slowdown_pct < a.slowdown_pct ? c : a));
  const hi = cs.reduce((a, c) => (c.slowdown_pct > a.slowdown_pct ? c : a));
  return { lo, hi, courses: cs, guard: hi.slowdown_pct > lo.slowdown_pct * 1.5 };
}

/* ---------- Lap 10: weather ---------- */
export function weatherPairs(co) {
  const p = co.weather.pairs;
  return { k: p.hotter_slowed_more, n: p.total, gap: p.min_gap_c, share: p.hotter_slowed_more / p.total, guard: p.hotter_slowed_more > p.total / 2 };
}

/* ---------- Lap 11: the next one ---------- */
export function recurrence(kick) {
  const a = kick.recurrence.after_slowdown;
  return { observed: a.observed, expected: a.expected, guard: a.observed > a.expected };
}

/* ---------- Contents: one reading per lap ---------- */
export async function lapReadings() {
  const [man, study, pat, ft, kick, ck, demo, af, co] = await loadAll(['manifest', 'study-evidence', 'pacing-shapes-patterns', 'finish-times', 'kick', 'checkpoint-30', 'demographics', 'all-finisher-courses', 'courses']);
  const bk = bank(kick), ns = negativeSplit(pat), c30 = checkpoint30(ck), on = onsetLate(study), tt = tallestTower(ft),
    wm = womenMen(demo), cs = courseSpread(af), wp = weatherPairs(co), rc = recurrence(kick), md = medianFinish(ft);
  return {
    field: { v: md.label, k: 'median finish' },
    first5k: bk.guard ? { v: fmtGap(bk.finish), k: 'after a fast 5K' } : null,
    shape: { v: ns.words.text, k: 'faster 2nd half' },
    halfway: c30.guard ? { v: pct(c30.share), k: 'made it from 30K' } : null,
    after30: { v: pct(on.share), k: 'began at 30K+' },
    finish: { v: tt.ratio.toFixed(2) + '×', k: `the ${tt.before} minute` },
    who: wm.guard ? { v: `${pctN(wm.women)}<span style="color:var(--ink-3)"> · </span>${pctN(wm.men)}%`, k: 'women · men' } : null,
    yours: { v: 'Yours', k: 'nine mats' },
    where: { v: `${Math.round(cs.lo.slowdown_pct)}–${Math.round(cs.hi.slowdown_pct)}%`, k: 'by course' },
    weather: { v: `${wp.k}/${wp.n}`, k: 'warmer, slower' },
    next: rc.guard ? { v: pct(rc.observed), k: 'slowed again' } : null,
  };
}
const pctN = x => Math.round(x * 100);
function fmtGap(s) { const r = Math.round(s); return (r < 0 ? '−' : '+') + fmtMS(r); }

export { fmtGap };
