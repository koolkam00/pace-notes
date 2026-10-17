'use strict';
// The course nuggets' recount (lib/nuggets/courses.ts; WP5), run by scripts/verify-nuggets.cjs. Every value is recomputed
// from the raw files with a second, deliberately plain implementation: courses.json, archetypes.json, course-geometry.json,
// the course chooser's rows, the course-profile pack's source policy, the duplicate-edition screen and each city's
// runner-context shards (for the supplied route's 5 km sections). For every course it checks each nugget's values, its
// guard and that the sentence a page shows names the recounted numbers; the fixtures prove the fallbacks render and that
// a flipped guard is caught.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

module.exports = function courseRecounts({ ROOT, N, core, ok, eq, problems }) {
  const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const courses = json('public/data/insights/courses.json');
  const archetypes = json('public/data/insights/archetypes.json');
  const geometry = json('public/data/insights/course-geometry.json').courses;
  const goalFile = json('public/data/insights/tools/course-goal.json');
  const manifest = json('public/data/insights/manifest.json');
  const policy = json('public/data/packs/ext_course_pacing_profiles/pack_meta.json').source_quality.editions;
  const runners = json('public/data/runners/manifest.json');
  const context = json('public/data/runner-context/manifest.json');
  const copies = manifest.duplicate_edition_screen ?? [];
  const held = new Set([...policy, ...copies].map((e) => `${e.city}|${e.year}`));
  const whole = (v) => `${Math.round(v * 100)}%`;
  const hm = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const ft = (m) => `${Math.round(Math.abs(m) / 0.3048).toLocaleString('en-US')} ft`;
  const degF = (c) => `${(c * 1.8 + 32).toFixed(0)}°F`;
  const MATS = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
  const sectionName = (i) => (i === 8 ? '40K–finish' : `${MATS[i][0]}–${MATS[i][1]}K`);
  const said = (n) => core.textFor(n.guard ? n.headline : n.fallback, 'mi').replace(/\*/g, '');
  let checks = 0;
  const step = (fn) => { fn(); checks++; };

  // The supplied route's sections for each city: the first eligible edition's shard with nine sections.
  const terrain = new Map();
  runners.editions.forEach((edition, index) => {
    if (terrain.has(edition.city) || copies.some((c) => c.city === edition.city && c.year === edition.year)) return;
    const meta = context.editions[String(index)];
    const shard = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'public/data/runner-context', meta.file))));
    if (Array.isArray(shard.terrain?.sections) && shard.terrain.sections.length === 9) terrain.set(edition.city, shard.terrain.sections);
  });

  const solid = courses.courses.filter((c) => c.editions >= 3);
  const tally = new Map();
  for (const c of courses.courses) if (c.slowest_section) tally.set(c.slowest_section, (tally.get(c.slowest_section) ?? 0) + 1);
  const shaped = [...tally.values()].reduce((a, b) => a + b, 0);
  const modal = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  // /courses
  {
    const n = N.getNugget('courses.index');
    step(() => eq([n.values.courses, n.guard, n.figure.value], [courses.courses.length, courses.courses.length > 0, courses.courses.length.toLocaleString('en-US')], 'courses.index recounts the course pages'));
    const r = N.getNugget('courses.range');
    const lo = Math.min(...solid.map((c) => c.slowdown)), hi = Math.max(...solid.map((c) => c.slowdown));
    step(() => eq([r.values.min, r.values.max, r.values.courses], [lo, hi, solid.length], 'courses.range recounts the extremes of courses with three or more editions'));
    step(() => eq(r.guard, solid.length >= 3 && hi / lo >= 2, 'courses.range: "more than twice" needs the highest share at least twice the lowest'));
    step(() => eq(r.figure.value, `${Math.round(lo * 100)}–${Math.round(hi * 100)}`, 'courses.range: the figure'));
  }

  for (const c of courses.courses) {
    const city = c.city;
    const at = (id) => N.getNugget(id, { city });
    const route = geometry.find((g) => g.city === city);
    const cells = courses.years.cells.filter((x) => x.city === city).sort((a, b) => a.year - b.year);
    for (const id of N.CONTEXT_NUGGETS) {
      const found = problems(at(id), { strict: true });
      step(() => eq(found, [], `${id} (${city}): ${found.join('; ')}`));
      step(() => ok(!at(id).placeholder, `${id} (${city}) is a real nugget`));
    }

    // The hero: the share and its edition range, never naming a held or copied edition.
    {
      const n = at('course.slowdown');
      const lo = cells.reduce((a, b) => (b.slowdown < a.slowdown ? b : a)), hi = cells.reduce((a, b) => (b.slowdown > a.slowdown ? b : a));
      step(() => eq([n.values.share, n.values.lo, n.values.hi, n.values.lo_year, n.values.hi_year], [c.slowdown, lo.slowdown, hi.slowdown, lo.year, hi.year], `course.slowdown (${city}) recounts the range`));
      const guard = cells.length >= 2 && whole(lo.slowdown) !== whole(hi.slowdown) && !held.has(`${city}|${lo.year}`) && !held.has(`${city}|${hi.year}`);
      step(() => eq(n.guard, guard, `course.slowdown (${city}): guard`));
      step(() => eq(n.figure.value, String(Math.round(c.slowdown * 100)), `course.slowdown (${city}): the figure`));
      if (guard) step(() => ok(said(n).includes(`${whole(lo.slowdown)} in ${lo.year}`) && said(n).includes(`${whole(hi.slowdown)} in ${hi.year}`), `course.slowdown (${city}): the sentence names the range`));
    }

    // At a glance (1): the first 5K's net, from the route's sections.
    {
      const n = at('course.start');
      const t = route ? terrain.get(city) : null;
      const net = t ? t[0].net_m : NaN;
      step(() => ok(Number.isNaN(net) ? Number.isNaN(n.values.net_m) : Math.abs(n.values.net_m - net) < 1e-9, `course.start (${city}) recounts the first 5K's net`));
      step(() => eq(n.guard, Number.isFinite(net) && Math.abs(net) >= 10, `course.start (${city}): guard`));
      if (n.guard) step(() => eq(said(n), `The first 5K ${net < 0 ? 'drops' : 'climbs'} ${ft(net)}.`, `course.start (${city}): the sentence`));
      else if (Number.isFinite(net)) step(() => eq(said(n), 'The first 5K is flat.', `course.start (${city}): a flat start says so`));
    }

    // At a glance (2): the slowest 5K against the section most courses slow most in.
    {
      const n = at('course.late');
      step(() => eq(n.guard, !!c.slowest_section && shaped >= 3, `course.late (${city}): guard`));
      if (n.guard) {
        const name = sectionName(courses.sections.indexOf(c.slowest_section));
        const usual = sectionName(courses.sections.indexOf(modal));
        const text = c.slowest_section === modal ? `The slowest 5K is ${name}, as on ${tally.get(modal)} of ${shaped} courses.` : `The slowest 5K is ${name}; on ${tally.get(modal)} of ${shaped} courses it’s ${usual}.`;
        step(() => eq(said(n), text, `course.late (${city}): the sentence`));
      }
    }

    // At a glance (3): how often the shape alone picked the course out.
    {
      const n = at('course.shape');
      step(() => eq(n.guard, !!c.identified && c.identified.editions >= 2, `course.shape (${city}): guard`));
      if (n.guard) step(() => ok(said(n).includes(`${c.identified.correct} of ${c.identified.editions} editions`), `course.shape (${city}): the sentence`));
    }

    // #finish-times: first and latest edition medians.
    {
      const n = at('course.times');
      const first = cells[0], last = cells[cells.length - 1];
      step(() => eq(n.guard, cells.length >= 2 && Math.abs(last.median_s - first.median_s) >= 60, `course.times (${city}): guard`));
      if (n.guard) step(() => eq(said(n), `The median finish moved from ${hm(first.median_s)} in ${first.year} to ${hm(last.median_s)} in ${last.year}.`, `course.times (${city}): the sentence`));
    }

    // #elevation: the section with the most climbing.
    {
      const n = at('course.climb');
      const t = route ? terrain.get(city) : null;
      if (t) {
        let best = 0;
        for (let i = 1; i < 9; i++) if (t[i].gain_m > t[best].gain_m) best = i;
        step(() => eq(n.guard, t[best].gain_m >= 15, `course.climb (${city}): guard`));
        if (n.guard) step(() => eq(said(n), `The biggest climb is ${sectionName(best)}: ${ft(t[best].gain_m)}.`, `course.climb (${city}): the sentence`));
      } else step(() => eq(n.guard, false, `course.climb (${city}): no route, no climb`));
    }

    // #pacing: the type whose share differs most from every course's.
    {
      const n = at('course.types');
      const mix = archetypes.courses.find((x) => x.city === city);
      if (mix) {
        let best = 0;
        for (let i = 1; i < mix.shares.length; i++) if (Math.abs(mix.shares[i] - archetypes.archetypes[i].share) > Math.abs(mix.shares[best] - archetypes.archetypes[best].share)) best = i;
        const here = mix.shares[best], every = archetypes.archetypes[best].share;
        step(() => eq([n.values.type, n.guard], [archetypes.archetypes[best].slug, Math.abs(here - every) >= 0.03], `course.types (${city}) recounts the type and its guard`));
        if (n.guard) step(() => eq(said(n), `${here > every ? 'More' : 'Fewer'} ${archetypes.archetypes[best].name}s here: ${whole(here)}, against ${whole(every)} across every course.`, `course.types (${city}): the sentence`));
      } else step(() => eq(n.guard, false, `course.types (${city}): no mix, no claim`));
    }

    // #slowdown: every other course, with more and fewer sustained slowdowns.
    {
      const n = at('course.among');
      const others = courses.courses.filter((o) => o.city !== city);
      const higher = others.filter((o) => o.slowdown > c.slowdown).length, lower = others.filter((o) => o.slowdown < c.slowdown).length;
      step(() => eq([n.values.higher, n.values.lower, n.values.courses], [higher, lower, others.length], `course.among (${city}) recounts the courses either side`));
      step(() => eq(n.guard, c.editions >= 3 && others.length >= 5, `course.among (${city}): guard`));
      const count = higher >= lower ? higher : lower;
      if (n.guard) step(() => eq(said(n), `${higher >= lower ? 'Fewer' : 'More'} sustained slowdowns than ${count === others.length ? 'every other course' : `${count} of ${others.length} courses`}.`, `course.among (${city}): the sentence`));
    }

    // #goals: the lead goal's row, where the course chooser publishes the course with enough editions.
    {
      const n = at('course.goal');
      const ctx = goalFile.courses.find((x) => x.city === city);
      const row = ctx && ctx.editions >= goalFile.min_editions ? goalFile.rows.find((r) => r.city === city && r.goal === 240) : null;
      step(() => eq(n.guard, !!row && row.n >= 100, `course.goal (${city}): guard`));
      if (n.guard) step(() => ok(said(n).startsWith(`On 4:00 pace through 20K, ${whole(row.under)} of `), `course.goal (${city}): the sentence`));
    }

    // #weather: the warmest and coolest mornings, at least the screen's gap apart.
    {
      const n = at('course.weather');
      const hc = courses.weather.hot_cool.find((h) => h.city === city);
      const gap = hc ? Math.round((hc.hot.temp - hc.cool.temp) * 10) / 10 : null;
      step(() => eq(n.guard, gap !== null && gap >= courses.weather.pairs.min_gap_c, `course.weather (${city}): the 5 °C gate`));
      if (n.guard) step(() => eq(said(n), `At ${degF(hc.hot.temp)} in ${hc.hot.year}, ${whole(hc.hot.slowdown)} had a sustained slowdown. At ${degF(hc.cool.temp)} in ${hc.cool.year}, ${whole(hc.cool.slowdown)}.`, `course.weather (${city}): the sentence`));
    }
  }

  // Fixtures: the index's fallback renders on a field whose spread is under twice, and every course nugget falls back
  // for a city with no page.
  const C = require(path.join(ROOT, 'lib/nuggets/courses.ts'));
  const flat = C.coursesRangeFrom([{ city: 'A', slowdown: 0.2, editions: 5 }, { city: 'B', slowdown: 0.3, editions: 5 }, { city: 'C', slowdown: 0.35, editions: 5 }]);
  step(() => eq([flat.guard, core.sentenceOf(flat)], [false, 'Sustained slowdown, course by course.'], 'fixture courses.range: under twice falls back'));
  const none = N.getNugget('course.weather', { city: 'Nowhere' });
  step(() => eq([none.guard, core.sentenceOf(none)], [false, 'Race mornings.'], 'fixture course.weather: a city with no page falls back'));
  for (const id of N.CONTEXT_NUGGETS) step(() => eq(N.getNugget(id, { city: 'Nowhere' }).guard, false, `fixture ${id}: no page, no claim`));
  return { checks, cities: courses.courses.length };
};
