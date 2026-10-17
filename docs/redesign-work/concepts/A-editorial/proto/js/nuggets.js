// The nugget contract (prototype of lib/nuggets.ts): every headline number and every directional claim
// is computed here from data fields, with a guard and a neutral fallback. Pages never type a number.
import { loadJSON, loadText, parseCSV, clock, hm, ms, pct, inWords, int } from './core.js';

const D = 'data/';
export const data = {
  finish: () => loadJSON(D + 'finish-times.json'),
  kick: () => loadJSON(D + 'kick.json'),
  study: () => loadJSON(D + 'study-evidence.json'),
  totals: () => loadJSON(D + 'site-totals.json'),
  positions: () => loadJSON(D + 'positions.json'),
  demo: () => loadJSON(D + 'demographics.json'),
  courses: () => loadJSON(D + 'courses.json'),
  geometry: () => loadJSON(D + 'course-geometry.json'),
  replay: () => loadJSON(D + 'replay.json'),
  goals: () => loadJSON(D + 'course-goal.json'),
  types: () => loadJSON(D + 'archetypes.json'),
  fastStart: () => loadJSON(D + 'fast-start-cities.json'),
  patterns: async () => parseCSV(await loadText(D + 'pacing-shapes-patterns.csv')),
};

/** Nearest-rank median minute of the finish-time histogram. */
export function histogramMedian(hist, key = 'all') {
  const total = hist.reduce((a, b) => a + b[key], 0);
  let c = 0;
  for (const b of hist) { c += b[key]; if (c >= total / 2) return b.minute; }
  return null;
}
export const argmax = (arr, f) => arr.reduce((best, x) => (f(x) > f(best) ? x : best), arr[0]);
export const argmin = (arr, f) => arr.reduce((best, x) => (f(x) < f(best) ? x : best), arr[0]);

// Each builder returns { id, chapter, href, figure, unit, claim (HTML-free parts), context, guard }.
export const N = {
  async scale() {
    const t = await data.totals();
    return { id: 'home.scale', eligible: t.eligible_records, raw: t.raw_records, races: t.editions, cities: t.cities, first: t.first_year, last: t.last_year };
  },
  async negativeSplit() {
    const rows = await data.patterns();
    const row = rows.find((r) => r.label === 'Faster second 20 km');
    const share = row.value / 100;
    return { id: 'shape.negative', chapter: 3, share, n: row.count, total: row.n_value, figure: inWords(share), guard: share < 0.5 };
  },
  async slowdownRate() {
    const st = await data.study();
    const share = st.rate / 100;
    return { id: 'slowdown.rate', chapter: 5, share, figure: inWords(share), n: st.detected, total: st.n };
  },
  async slowdownLate() {
    const st = await data.study();
    const rows = st.timing.charts[0].rows;
    const late = rows.filter((r) => r.label >= 30).reduce((a, r) => a + r.value, 0) / 100;
    return { id: 'slowdown.late', chapter: 5, share: late, figure: pct(late), guard: late > 0.5 };
  },
  async busiestMinute() {
    const ft = await data.finish();
    const top = argmax(ft.histogram, (b) => b.all);
    const w = argmax(ft.histogram, (b) => b.women).minute;
    const m = argmax(ft.histogram, (b) => b.men).minute;
    return { id: 'round.busiest', chapter: 6, minute: top.minute, n: top.all, figure: hm(top.minute), alike: w === top.minute && m === top.minute };
  },
  async median() {
    const ft = await data.finish();
    const med = histogramMedian(ft.histogram);
    return { id: 'field.median', chapter: 1, minute: med, figure: hm(med) };
  },
  async tallestTower() {
    const ft = await data.finish();
    const top = argmax(ft.marks, (m) => m.ratio);
    return { id: 'round.tower', chapter: 6, mark: top.mark, minute: top.minutes - 1, ratio: top.ratio, n: top.minute_before, expected: top.expected_minute_before, figure: `${top.ratio.toFixed(2)}×` };
  },
  async bank() {
    const k = await data.kick();
    const b = k.bank.bands.find((x) => x.label === 'More than 10% faster') || k.bank.bands[0];
    return { id: 'start.bank', chapter: 2, banked: -b.open_s, spent: b.after20_s, net: b.finish_s, slowdown: b.slowdown, expected: b.expected, n: b.n, guard: b.open_s < 0 && b.finish_s > 0, figure: ms(b.finish_s) };
  },
  async sweetSpot() {
    const k = await data.kick();
    const best = argmin(k.bank.curve, (c) => c.finish_s);
    return { id: 'start.sweet', chapter: 2, lo: best.lo, finish_s: best.finish_s };
  },
  async coinFlip() {
    const p = await data.positions();
    const r30 = p.coin_flip['30'].find((r) => r.gap_lo_s === 60);
    const r40 = p.coin_flip['40'].find((r) => r.gap_lo_s === 60);
    return { id: 'places.coin', chapter: 4, share30: r30?.share, share40: r40?.share, figure: pct(r30?.share ?? 0), nearlyHalf: (r30?.share ?? 0) >= 0.4 };
  },
  async magnet() {
    const k = await data.kick();
    return { id: 'kick.magnet', chapter: 6, share: k.kick.share, figure: inWords(k.kick.share) };
  },
  async genderSlowdown() {
    const d = await data.demo();
    const ratio = d.overall.men_slowdown / d.overall.women_slowdown;
    return { id: 'who.slowdown', chapter: 7, women: d.overall.women_slowdown, men: d.overall.men_slowdown, ratio, figure: `${ratio.toFixed(1)}×`, guard: ratio >= 1.5 };
  },
  async fingerprint() {
    const c = await data.courses();
    const id = c.identification;
    return { id: 'courses.fingerprint', chapter: 8, share: id.correct / id.editions_tested, chance: id.chance, correct: id.correct, tested: id.editions_tested, figure: pct(id.correct / id.editions_tested) };
  },
  async weatherPairs() {
    const c = await data.courses();
    const p = c.weather.pairs;
    return { id: 'weather.pairs', chapter: 9, hot: p.hotter_slowed_more, total: p.total, gap: p.min_gap_c, share: p.hotter_slowed_more / p.total, figure: pct(p.hotter_slowed_more / p.total) };
  },
  async recurrence() {
    const k = await data.kick();
    const r = k.recurrence.after_slowdown;
    return { id: 'next.recurrence', chapter: 11, observed: r.observed, expected: r.expected, figure: pct(r.observed), guard: r.observed > r.expected };
  },
};

// The chapters registry: one marathon, start to finish, then the runner, then you.
export const CHAPTERS = [
  { n: 1, part: 1, marker: 'START', title: 'The field', href: '#', lead: async () => { const v = await N.median(); return { fig: v.figure, small: 'median', text: 'Half of all finishes took longer than this.' }; } },
  { n: 2, part: 1, marker: '5K', title: 'The first 5K', href: 'analysis-starting-pace.html', lead: async () => { const v = await N.bank(); return { fig: ms(v.net), small: 'behind', text: `A first 5K over 10% fast banked ${ms(v.banked)}, then finished further back.` }; } },
  { n: 3, part: 1, marker: '10K', title: 'The shape of a race', href: '#', lead: async () => { const v = await N.negativeSplit(); return { fig: v.figure, small: 'faster late', text: 'ran the second 20K faster than the first.' }; } },
  { n: 4, part: 1, marker: 'HALF', title: 'Halfway to 30K', href: '#', lead: async () => { const v = await N.coinFlip(); return { fig: pct(v.share30), small: 'still won', text: 'of finishes trailing by a minute at 30K still crossed first.' }; } },
  { n: 5, part: 1, marker: '30K', title: 'After 30K', href: '#', lead: async () => { const v = await N.slowdownLate(); return { fig: v.figure, small: 'begin late', text: 'of sustained slowdowns began at 30K or later.' }; } },
  { n: 6, part: 1, marker: 'FINISH', title: 'The finish line', href: 'story-round-numbers.html', lead: async () => { const v = await N.busiestMinute(); return { fig: v.figure, small: 'busiest', text: 'is the busiest single finishing minute of all.' }; } },
  { n: 7, part: 2, marker: '07', title: 'Who holds pace', href: '#', lead: async () => { const v = await N.genderSlowdown(); return { fig: v.figure, small: 'men vs women', text: 'as many sustained slowdowns for men at the same finish times.' }; } },
  { n: 8, part: 2, marker: '08', title: 'Where you run', href: 'course-boston.html', lead: async () => { const v = await N.fingerprint(); return { fig: v.figure, small: 'named', text: 'of races named correctly from their pacing shape alone.' }; } },
  { n: 9, part: 2, marker: '09', title: 'The weather', href: '#', lead: async () => { const v = await N.weatherPairs(); return { fig: v.figure, small: 'warmer slowed', text: `of ${v.total} same-course pairs: the warmer year had more sustained slowdowns.` }; } },
  { n: 10, part: 3, marker: '10', title: 'Your race', href: '#', lead: async () => ({ fig: 'You', small: 'wrapped', text: 'Find a past race and see it against its own field.' }) },
  { n: 11, part: 3, marker: '11', title: 'The next one', href: '#', lead: async () => { const v = await N.recurrence(); return { fig: v.figure, small: 'came back', text: `after a sustained slowdown, against ${pct(v.expected)} typical.` }; } },
];
export const PARTS = { 1: 'Part one · The race, start to finish', 2: 'Part two · The runner and the road', 3: 'Part three · Your race' };

/** Draw the course-line contents into a list element. */
export async function buildRoute(list, { current = 0, parts = [1, 2, 3], night = false, compact = false } = {}) {
  list.replaceChildren();
  for (const part of parts) {
    const head = document.createElement('p');
    head.className = 'route-part';
    head.textContent = PARTS[part];
    const ol = document.createElement('ol');
    ol.className = `route${night ? ' is-night' : ''}`;
    for (const ch of CHAPTERS.filter((c) => c.part === part)) {
      const lead = await ch.lead();
      const li = document.createElement('li');
      if (ch.n === current) li.classList.add('is-current');
      if (ch.marker === 'FINISH') li.classList.add('is-finish');
      const a = document.createElement('a');
      a.href = ch.href;
      if (ch.href === '#') a.setAttribute('aria-disabled', 'true');
      const marker = document.createElement('span'); marker.className = 'rt-marker'; marker.textContent = ch.marker;
      const num = document.createElement('span'); num.className = 'rt-num'; num.textContent = `Chapter ${String(ch.n).padStart(2, '0')}`;
      const title = document.createElement('span'); title.className = 'rt-title'; title.textContent = ch.title;
      const fig = document.createElement('span'); fig.className = 'rt-fig'; fig.textContent = lead.fig;
      const small = document.createElement('small'); small.textContent = lead.small; fig.append(small);
      a.append(marker, num, title);
      if (!compact) { const nug = document.createElement('span'); nug.className = 'rt-nugget'; nug.textContent = lead.text; a.append(nug); }
      a.append(fig);
      li.append(a);
      ol.append(li);
    }
    list.append(head, ol);
  }
}
export { clock, int };
