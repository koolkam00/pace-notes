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
  // The 40K–finish section is 2.2 km: its words say "stretch", never "5K".
  const stretch = (i) => (i === 8 ? 'stretch' : '5K');
  // A profile at or below 0 m for 0.5 km or more on a route that is not a polder reads the water under a bridge.
  const underWater = (city) => {
    const g = geometry.find((x) => x.city === city);
    if (!g || city === 'Amsterdam' || city === 'Rotterdam') return false;
    let run = 0;
    for (const m of g.elevation_m) { run = m <= 0 ? run + 1 : 0; if ((run - 1) * g.elevation_step_km >= 0.5) return true; }
    return false;
  };
  const said = (n) => core.textFor(n.guard ? n.headline : n.fallback, 'mi').replace(/\*/g, '');
  // The name a page writes: New York's page says New York City.
  const named = (city) => (city === 'New York' ? 'New York City' : city);
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
    // A count of pages is not a finding: the index has no figure, so no card or contents row reads one.
    step(() => eq([n.values.courses, n.guard, n.figure], [courses.courses.length, courses.courses.length > 0, null], 'courses.index recounts the course pages and draws no figure'));
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
      // The figure averages the editions' shares: the key names the average edition, the two editions' average, or with
      // one edition its year (no average was taken).
      const lead = cells.length === 1 ? `of finishes in ${cells[0].year} had a` : cells.length === 2 ? 'of finishes in its two editions, on average, had a' : 'of finishes in an average year had a';
      step(() => eq(n.key, `${lead} sustained slowdown`, `course.slowdown (${city}): the key names what the figure averages`));
      if (guard) step(() => eq(said(n), `Edition by edition, between ${whole(lo.slowdown)} (${lo.year}) and ${whole(hi.slowdown)} (${hi.year}).`, `course.slowdown (${city}): the sentence names the range, low end first, in no time order`));
    }

    // At a glance (1): the first 5K's net, from the route's sections, only from 10 m either way.
    {
      const n = at('course.start');
      const t = route ? terrain.get(city) : null;
      const net = t ? t[0].net_m : NaN;
      step(() => ok(Number.isNaN(net) ? Number.isNaN(n.values.net_m) : Math.abs(n.values.net_m - net) < 1e-9, `course.start (${city}) recounts the first 5K's net`));
      step(() => eq(n.guard, Number.isFinite(net) && Math.abs(net) >= 30 && !underWater(city), `course.start (${city}): guard (30 m net, and no bridge read as water)`));
      step(() => eq(!!n.figure, n.guard, `course.start (${city}): a figure only for a start that drops or climbs`));
      if (n.guard) step(() => eq(said(n), `The first 5K ends ${ft(net)} ${net < 0 ? 'lower' : 'higher'} than it starts.`, `course.start (${city}): the sentence`));
      else if (Number.isFinite(net)) step(() => eq(said(n), 'The first 5K is flat.', `course.start (${city}): a flat start says so`));
    }

    // At a glance (2): the slowest 5K, only where it is not the section most courses slow most in.
    {
      const n = at('course.late');
      step(() => eq(n.guard, !!c.slowest_section && shaped >= 3 && c.slowest_section !== modal, `course.late (${city}): guard (unlike the usual section)`));
      if (n.guard) {
        const name = sectionName(courses.sections.indexOf(c.slowest_section));
        const usual = sectionName(courses.sections.indexOf(modal));
        const i = courses.sections.indexOf(c.slowest_section);
        step(() => eq(said(n), `The slowest ${stretch(i)} is ${name}; on ${tally.get(modal)} of the ${shaped} courses with 5K splits it’s ${usual}.`, `course.late (${city}): the sentence`));
      }
    }

    // At a glance (3): where the pacing parts most from the typical course, from 3 points on three or more editions, in
    // words ("1% quicker than its average pace; 4% slower on the typical course").
    {
      const n = at('course.signature');
      const i = c.signature_section ? courses.sections.indexOf(c.signature_section) : -1;
      const solid = c.editions >= 3 && Array.isArray(c.curve) && c.curve.length === 9 && i >= 0;
      const dev = solid ? c.curve[i] - courses.typical_curve[i] : NaN;
      const words = (v, own) => {
        const r = Math.round(Math.abs(v)), side = v > 0 ? 'slower' : 'quicker';
        return own ? (r === 0 ? 'at its own average pace' : `${r}% ${side} than its own average`) : (r === 0 ? `the typical course runs this ${stretch(i)} at its average pace` : `the typical course runs this ${stretch(i)} ${r}% ${side}`);
      };
      step(() => ok(!solid || Math.abs(dev - c.signature_points) < 0.011, `course.signature (${city}): the signature is the curve less the typical curve`));
      step(() => ok(!solid || c.deviation.every((d) => Math.abs(d) <= Math.abs(c.signature_points) + 1e-9), `course.signature (${city}): no section parts further than the signature`));
      const here = solid ? c.curve[i] : NaN, typ = solid ? courses.typical_curve[i] : NaN;
      step(() => eq(n.guard, solid && Math.abs(c.signature_points) >= 3 && words(here, true) !== words(typ, true), `course.signature (${city}): guard (3 points on three or more editions)`));
      if (n.guard) step(() => eq(n.key, `${words(here, true)}; ${words(typ, false)}`, `course.signature (${city}): the row`));
      else if (solid && Math.abs(c.signature_points) < 3) step(() => ok(said(n).endsWith('paces much like the typical course, 5K by 5K.'), `course.signature (${city}): within 3 points everywhere, it paces like the typical course`));
    }

    // #finish-times: the range of the edition medians (three or more editions), low end first, never a held edition.
    {
      const n = at('course.times');
      const named = cells.filter((x) => !held.has(`${city}|${x.year}`));
      const lo = named.reduce((a, b) => (b.median_s < a.median_s ? b : a), named[0]), hi = named.reduce((a, b) => (b.median_s > a.median_s ? b : a), named[0]);
      const guard = cells.length >= 3 && !!lo && hi.median_s - lo.median_s >= 60 && hm(lo.median_s) !== hm(hi.median_s);
      step(() => eq(n.guard, guard, `course.times (${city}): guard`));
      if (guard) {
        step(() => eq([n.values.lo_year, n.values.hi_year], [lo.year, hi.year], `course.times (${city}): the range ends`));
        step(() => eq(said(n), `The median finish ranged from ${hm(lo.median_s)} in ${lo.year} to ${hm(hi.median_s)} in ${hi.year}.`, `course.times (${city}): the sentence`));
      }
    }

    // #elevation: the section with the most climbing.
    {
      const n = at('course.climb');
      const t = route ? terrain.get(city) : null;
      if (t) {
        let best = 0;
        for (let i = 1; i < 9; i++) if (t[i].gain_m > t[best].gain_m) best = i;
        const wet = underWater(city);
        step(() => eq(n.guard, t[best].gain_m >= 30 && !wet, `course.climb (${city}): guard (a climb from 30 m, and no bridge read as water)`));
        // A neighbour within 10% of the biggest climb makes the two one stretch, named and summed.
        const near = [best - 1, best + 1].filter((j) => j >= 0 && j < 9).sort((a, b) => t[b].gain_m - t[a].gain_m)[0];
        const pair = n.guard && t[near].gain_m >= 0.9 * t[best].gain_m;
        const a = pair ? Math.min(best, near) : best, b = pair ? Math.max(best, near) : best;
        const name = a === b ? sectionName(a) : `${MATS[a][0]}–${b === 8 ? 'finish' : `${MATS[b][1]}K`}`;
        if (n.guard) step(() => eq(said(n), `The biggest climb is ${name}: ${ft(pair ? t[a].gain_m + t[b].gain_m : t[best].gain_m)}.`, `course.climb (${city}): the sentence`));
        if (wet) step(() => eq(said(n), 'The route, start to finish.', `course.climb (${city}): a profile under water ranks no climb`));
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
        if (n.guard) step(() => eq(said(n), `${here > every ? 'More' : 'Fewer'} ${archetypes.archetypes[best].name.toLowerCase()}s here: ${whole(here)}, against ${whole(every)} across every course.`, `course.types (${city}): the sentence`));
        else step(() => eq(said(n), 'Paced much like every course: no type more than 3 points apart.', `course.types (${city}): within 3 points everywhere, the null finding`));
      } else step(() => eq(n.guard, false, `course.types (${city}): no mix, no claim`));
    }

    // #slowdown's H2: every other course with three or more editions, with a higher and a lower share; within two of
    // each other either side, "near the middle"; a course with fewer editions says how many.
    {
      const n = at('course.among');
      // Only courses with three or more editions are counted either side (the hollow dots on the strip are not).
      const others = courses.courses.filter((o) => o.city !== city && o.editions >= 3);
      const higher = others.filter((o) => o.slowdown > c.slowdown).length, lower = others.filter((o) => o.slowdown < c.slowdown).length;
      step(() => eq([n.values.higher, n.values.lower, n.values.courses], [higher, lower, others.length], `course.among (${city}) recounts the courses with three or more editions either side`));
      const solidSelf = c.editions >= 3;
      const middle = solidSelf && Math.abs(higher - lower) <= 2;
      const count = higher >= lower ? higher : lower;
      step(() => eq(n.guard, others.length >= 5 && (middle || count > 0), `course.among (${city}): guard`));
      const words = ['zero', 'one', 'two'];
      const from = solidSelf ? '' : `, from ${words[c.editions]} edition${c.editions === 1 ? '' : 's'}`;
      const all = count === others.length ? (solidSelf ? 'any other course' : 'every course') : null;
      // The scope is the strip's key; the sentence keeps it only for "any other course" / "every course" and for a course
      // with fewer editions.
      const than = all ? `${all} with three or more editions` : solidSelf ? `${count} of the ${others.length} other courses` : `${count} of ${others.length} courses`;
      const want = middle ? `${named(city)}’s ${whole(c.slowdown)}: near the middle of ${others.length + 1} courses.`
        : `${named(city)}’s ${whole(c.slowdown)}: ${higher >= lower ? 'lower' : 'higher'} than ${than}${from}.`;
      if (n.guard) step(() => eq(said(n).replace(/\u00a0/g, ' '), want, `course.among (${city}): the sentence`));
    }

    // #goals: the lead goal's row, where the course chooser publishes the course with enough editions.
    {
      const n = at('course.goal');
      const ctx = goalFile.courses.find((x) => x.city === city);
      const row = ctx && ctx.editions >= goalFile.min_editions ? goalFile.rows.find((r) => r.city === city && r.goal === 240) : null;
      step(() => eq(n.guard, !!row && row.n >= 100, `course.goal (${city}): guard`));
      // Every course's share: the rows of the courses with enough editions, pooled by finishes.
      const pool = goalFile.rows.filter((r) => r.goal === 240 && goalFile.courses.some((x) => x.city === r.city && x.editions >= goalFile.min_editions));
      const poolN = pool.reduce((a, r) => a + r.n, 0), poolUnder = pool.reduce((a, r) => a + Math.round(r.under * r.n), 0) / poolN;
      // Only a page with goal rows sets itself against every course.
      const shows = !!ctx && ctx.editions >= goalFile.min_editions;
      step(() => ok(shows ? poolN >= 100 && Math.abs(n.values.every - poolUnder) < 1e-12 && n.values.every_n === poolN : Number.isNaN(n.values.every), `course.goal (${city}): every course's share recounts (${n.values.every} against ${poolUnder})`));
      if (n.guard) {
        const gap = Math.abs(Math.round(row.under * 100) - Math.round(poolUnder * 100));
        const against = gap >= 3 ? `, against ${whole(poolUnder)} across every course` : ', about the same as across every course';
        step(() => eq(said(n), `Of ${named(city)} finishes on 4:00 pace at 20K, ${whole(row.under)} made 4:00${against}.`, `course.goal (${city}): the sentence`));
      }
    }

    // #weather: the warmest and coolest mornings, at least the screen's gap apart.
    {
      const n = at('course.weather');
      const hc = courses.weather.hot_cool.find((h) => h.city === city);
      const gap = hc ? Math.round((hc.hot.temp - hc.cool.temp) * 10) / 10 : null;
      step(() => eq(n.guard, gap !== null && gap >= courses.weather.pairs.min_gap_c, `course.weather (${city}): the 5 °C gate`));
      // Shares that round alike are said once.
      if (n.guard) step(() => eq(said(n), whole(hc.hot.slowdown) === whole(hc.cool.slowdown)
        ? `At ${degF(hc.hot.temp)} in ${hc.hot.year} and at ${degF(hc.cool.temp)} in ${hc.cool.year}, the same ${whole(hc.hot.slowdown)} had a sustained slowdown.`
        : `At ${degF(hc.hot.temp)} in ${hc.hot.year}, ${whole(hc.hot.slowdown)} had a sustained slowdown. At ${degF(hc.cool.temp)} in ${hc.cool.year}, ${whole(hc.cool.slowdown)}.`, `course.weather (${city}): the sentence`));
    }
  }

  // Fixtures: every course nugget falls back for a city with no page.
  const none = N.getNugget('course.weather', { city: 'Nowhere' });
  step(() => eq([none.guard, core.sentenceOf(none)], [false, 'Race mornings.'], 'fixture course.weather: a city with no page falls back'));
  for (const id of N.CONTEXT_NUGGETS) step(() => eq(N.getNugget(id, { city: 'Nowhere' }).guard, false, `fixture ${id}: no page, no claim`));
  return { checks, cities: courses.courses.length };
};
