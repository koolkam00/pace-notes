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
  // A finish clock time to the minute, floored as a race clock reads (3:59:36 is 3:59, never 4:00).
  const hm = (s) => { const m = Math.floor(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
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
    // The card into the list promises what the list holds: its count of course pages, as the dek says it.
    step(() => eq([n.values.courses, n.guard, n.figure && n.figure.value], [courses.courses.length, courses.courses.length > 0, courses.courses.length.toLocaleString('en-US')], 'courses.index recounts the course pages, its figure the count'));
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
      // Where the high end was also the warmest (or coolest) of the mornings the policy keeps, on a page that shows
      // #weather, the hero says so once (critic round 5), and #weather compares the other mornings.
      const hc = courses.weather.hot_cool.find((h) => h.city === city);
      const shown = !!hc && Math.round((hc.hot.temp - hc.cool.temp) * 10) / 10 >= courses.weather.pairs.min_gap_c && courses.weather.editions.filter((e) => e.city === city).length >= 3;
      const kept = shown ? courses.weather.editions.filter((e) => e.city === city && !held.has(`${city}|${e.year}`)) : [];
      const own = kept.find((e) => e.year === hi.year), rest = kept.filter((e) => e.year !== hi.year);
      const end = guard && own && rest.length ? (rest.every((e) => e.temp < own.temp) ? 'warmest' : rest.every((e) => e.temp > own.temp) ? 'coolest' : '') : '';
      if (guard) step(() => eq(said(n), `Edition by edition, between ${whole(lo.slowdown)} (${lo.year}) and ${whole(hi.slowdown)} (${hi.year})${end ? `, its ${end} morning` : ''}.`, `course.slowdown (${city}): the sentence names the range, low end first, in no time order`));
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
        step(() => eq(said(n), `${named(city)}’s slowest ${stretch(i)} is ${name}; on ${tally.get(modal)} of ${shaped} courses it’s ${usual}.`, `course.late (${city}): the sentence`));
        // The row names its baseline, the course's own average pace (the hills page's is other courses; critic round 4).
        step(() => eq(n.key, `than ${named(city)}’s average pace, at ${name}, its slowest ${stretch(i)}; on ${tally.get(modal)} of ${shaped} courses it’s ${usual}`, `course.late (${city}): the row names its baseline`));
        // The row's figure: how much slower than the course's own average its slowest section runs, in whole percent.
        step(() => eq(n.figure && `${n.figure.value}${n.figure.unit}`, `${Math.round(c.curve[i])}% slower`, `course.late (${city}): the figure`));
      }
    }

    // At a glance (3): where the pacing parts most from the typical course, from 3 points on three or more editions, as
    // one figure ("London’s first 5K runs 3% quicker than on the typical course").
    {
      const n = at('course.signature');
      const i = c.signature_section ? courses.sections.indexOf(c.signature_section) : -1;
      const solid = c.editions >= 3 && Array.isArray(c.curve) && c.curve.length === 9 && i >= 0;
      const dev = solid ? c.curve[i] - courses.typical_curve[i] : NaN;
      const words = (v, own) => {
        const r = Math.round(Math.abs(v)), side = v > 0 ? 'slower' : 'quicker';
        return own ? (r === 0 ? 'at' : `${r}% ${side} than`) : (r === 0 ? 'at its average pace' : `${r}% ${side}`);
      };
      step(() => ok(!solid || Math.abs(dev - c.signature_points) < 0.011, `course.signature (${city}): the signature is the curve less the typical curve`));
      step(() => ok(!solid || c.deviation.every((d) => Math.abs(d) <= Math.abs(c.signature_points) + 1e-9), `course.signature (${city}): no section parts further than the signature`));
      const here = solid ? c.curve[i] : NaN, typ = solid ? courses.typical_curve[i] : NaN;
      step(() => eq(n.guard, solid && Math.abs(c.signature_points) >= 3 && words(here, true) !== words(typ, true), `course.signature (${city}): guard (3 points on three or more editions)`));
      if (n.guard) {
        // The figure is how far the section parts from the typical course's: the difference of the two whole percentages.
        const apart = Math.round(here) - Math.round(typ);
        const place = i === 0 ? 'first 5K' : i === 8 ? 'last stretch' : sectionName(i);
        step(() => eq(said(n), `${named(city)}’s ${place} runs ${Math.abs(apart)}% ${apart > 0 ? 'slower' : 'quicker'} than on the typical course.`, `course.signature (${city}): the sentence, one figure`));
        step(() => eq(n.key, `than on the typical course, at ${sectionName(i)}`, `course.signature (${city}): the row`));
        step(() => eq(`${n.figure.value}${n.figure.unit}`, `${Math.abs(apart)}% ${apart > 0 ? 'slower' : 'quicker'}`, `course.signature (${city}): the figure`));
        step(() => ok(Math.abs(apart) >= 3, `course.signature (${city}): the figure parts by 3 or more`));
      }
      else if (solid && Math.abs(c.signature_points) < 3) step(() => ok(said(n).endsWith('paces much like the typical course, 5K by 5K.'), `course.signature (${city}): within 3 points everywhere, it paces like the typical course`));
    }

    // #finish-times: what the hero has not told. Six or more editions whose first three and last three average five
    // minutes or more apart are a trend; medians under six minutes apart, the window every one fell in (ends rounded
    // outward); otherwise the range, low end first, accenting an end no other section accents. Never a held edition.
    {
      const n = at('course.times');
      const named = cells.filter((x) => !held.has(`${city}|${x.year}`));
      const lo = named.reduce((a, b) => (b.median_s < a.median_s ? b : a), named[0]), hi = named.reduce((a, b) => (b.median_s > a.median_s ? b : a), named[0]);
      const guard = cells.length >= 3 && !!lo && hi.median_s - lo.median_s >= 60 && hm(lo.median_s) !== hm(hi.median_s);
      step(() => eq(n.guard, guard, `course.times (${city}): guard`));
      if (guard) {
        step(() => eq([n.values.lo_year, n.values.hi_year], [lo.year, hi.year], `course.times (${city}): the range ends`));
        const spread = hi.median_s - lo.median_s;
        const avg = (xs) => xs.reduce((a, x) => a + x.median_s, 0) / xs.length;
        const drift = named.length >= 6 ? avg(named.slice(-3)) - avg(named.slice(0, 3)) : NaN;
        const hero = at('course.slowdown');
        const heroYear = hero.guard ? hero.values.hi_year : null;
        const wx = at('course.weather');
        const wxYear = wx.guard && !wx.values.quiet && whole(wx.values.hot_share) !== whole(wx.values.cool_share) ? wx.values.hot_year : null;
        const ceil = (s) => hm(Math.ceil(s / 60) * 60);
        const years = (end) => { const ys = named.filter((x) => hm(x.median_s) === hm(end.median_s)).map((x) => x.year); return ys.length > 1 ? `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}` : String(ys[0]); };
        let want, accent = null;
        if (Math.abs(drift) >= 300) want = `The median finish got ${Math.round(Math.abs(drift) / 60)} minutes ${drift < 0 ? 'quicker' : 'slower'} from the first three editions to the last three.`;
        else if (spread < 360) want = `Every median finish fell between ${hm(lo.median_s)} and ${ceil(hi.median_s)}.`;
        else {
          accent = [lo, hi].find((e) => e.year !== heroYear && e.year !== wxYear) ?? null;
          want = `The median finish ranged from ${hm(lo.median_s)} in ${years(lo)} to ${hm(hi.median_s)} in ${years(hi)}.`;
        }
        step(() => eq(said(n), want, `course.times (${city}): the sentence`));
        step(() => eq(Number.isNaN(n.values.accent_year) ? null : n.values.accent_year, accent ? accent.year : null, `course.times (${city}): the accented end`));
        // The line opens on the accented end, or on the latest edition other than the hero's.
        const opening = accent ?? [...named].reverse().find((x) => x.year !== heroYear);
        step(() => eq(n.values.open_year, opening.year, `course.times (${city}): the line opens on ${opening.year}`));
        step(() => ok(n.values.open_year !== heroYear, `course.times (${city}): the line never opens on the hero's edition`));
      }
    }

    // One edition, one section (critic round 5): no edition year is accented in more than one section of the page (the
    // hero's high end, #finish-times' accented end, #weather's warmer morning), and #weather never names the hero's.
    {
      const hero = at('course.slowdown'), times = at('course.times'), wx = at('course.weather');
      const accents = [hero.guard ? hero.values.hi_year : NaN, times.guard ? times.values.accent_year : NaN, wx.guard ? wx.values.accent_year : NaN].filter((y) => Number.isFinite(y));
      step(() => eq(new Set(accents).size, accents.length, `${city}: an edition is accented in more than one section (${accents.join(', ')})`));
      if (hero.guard && wx.guard) step(() => ok(wx.values.hot_year !== hero.values.hi_year && wx.values.cool_year !== hero.values.hi_year, `${city}: #weather names the hero's edition`));
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

    // #pacing: the type whose share differs most from the other courses' (theirs pooled by finishes, this course left out
    // of the set it is compared with; critic round 4).
    {
      const n = at('course.types');
      const mix = archetypes.courses.find((x) => x.city === city);
      if (mix) {
        const rest = archetypes.courses.filter((x) => x.city !== city);
        const restN = rest.reduce((a, x) => a + x.finishes, 0);
        const else_ = mix.shares.map((_, i) => rest.reduce((a, x) => a + x.shares[i] * x.finishes, 0) / restN);
        let best = 0;
        for (let i = 1; i < mix.shares.length; i++) if (Math.abs(mix.shares[i] - else_[i]) > Math.abs(mix.shares[best] - else_[best])) best = i;
        const here = mix.shares[best], every = else_[best];
        step(() => eq([n.values.type, n.guard, n.values.courses], [archetypes.archetypes[best].slug, Math.abs(here - every) >= 0.03, rest.length], `course.types (${city}) recounts the type, its guard and the other courses`));
        step(() => ok(Math.abs(n.values.every - every) < 1e-12, `course.types (${city}): the other courses' share recounts`));
        if (n.guard) step(() => eq(said(n), `${here > every ? 'More' : 'Fewer'} ${archetypes.archetypes[best].name.toLowerCase()}s here: ${whole(here)}, against ${whole(every)} elsewhere.`, `course.types (${city}): the sentence`));
        else step(() => eq(said(n), 'Paced much like the other courses: every type within 3 points of its share on the other courses.', `course.types (${city}): within 3 points everywhere, the null finding`));
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
      const side = higher >= lower ? 'lower' : 'higher';
      const all = count === others.length;
      // The comparator without the set's size (the strip's key names the courses counted); a course of fewer editions
      // leads with how many it has.
      const set = `${solidSelf ? 'other ' : ''}courses with three or more editions`;
      const than = all ? `all ${others.length} ${set}` : `${count} of ${others.length} ${set}`;
      const want = middle ? `${named(city)}’s ${whole(c.slowdown)}: near the middle of the courses.`
        : solidSelf ? `${named(city)}’s ${whole(c.slowdown)}: ${side} than ${than}.`
          : `From its ${words[c.editions]} edition${c.editions === 1 ? '' : 's'}, ${named(city)}’s ${whole(c.slowdown)} is ${side} than ${than}.`;
      if (n.guard) step(() => eq(said(n).replace(/\u00a0/g, ' '), want, `course.among (${city}): the sentence`));
    }

    // #goals: the lead goal's row, where the course chooser publishes the course with enough editions.
    {
      const n = at('course.goal');
      const ctx = goalFile.courses.find((x) => x.city === city);
      const row = ctx && ctx.editions >= goalFile.min_editions ? goalFile.rows.find((r) => r.city === city && r.goal === 240) : null;
      step(() => eq(n.guard, !!row && row.n >= 100, `course.goal (${city}): guard`));
      // The other courses' share: the rows of the other courses with enough editions, pooled by finishes (this course left
      // out of the set it is compared with; critic round 4).
      const pool = goalFile.rows.filter((r) => r.goal === 240 && r.city !== city && goalFile.courses.some((x) => x.city === r.city && x.editions >= goalFile.min_editions));
      const poolN = pool.reduce((a, r) => a + r.n, 0), poolUnder = pool.reduce((a, r) => a + Math.round(r.under * r.n), 0) / poolN;
      // Only a page with goal rows sets itself against every course.
      const shows = !!ctx && ctx.editions >= goalFile.min_editions;
      step(() => ok(shows ? poolN >= 100 && Math.abs(n.values.every - poolUnder) < 1e-12 && n.values.every_n === poolN && n.values.every_courses === pool.length : Number.isNaN(n.values.every), `course.goal (${city}): the other courses' share recounts (${n.values.every} against ${poolUnder})`));
      if (n.guard) {
        // The gap as the page prints the two shares (toFixed), so the words never disagree with the figures: within one
        // printed point, about the same.
        const printed = (v) => Number((v * 100).toFixed(0));
        const gap = Math.abs(printed(row.under) - printed(poolUnder));
        // The comparator once, without its count (the legend names how many).
        const against = gap >= 2 ? `, against ${printed(poolUnder)}% elsewhere` : ', about the same as elsewhere';
        step(() => eq(said(n), `Of ${named(city)} finishes on 4:00 pace through 20K, ${printed(row.under)}% made 4:00${against}.`, `course.goal (${city}): the sentence`));
      }
    }

    // #weather: the warmest and coolest mornings other than the hero's edition, at least the screen's gap apart, on a
    // page that shows the section (the published pair 5 °C apart, three or more mornings).
    {
      const n = at('course.weather');
      const hc = courses.weather.hot_cool.find((h) => h.city === city);
      const mornings = courses.weather.editions.filter((e) => e.city === city);
      const shown = !!hc && Math.round((hc.hot.temp - hc.cool.temp) * 10) / 10 >= courses.weather.pairs.min_gap_c && mornings.length >= 3;
      const hero = at('course.slowdown');
      const heroYear = hero.guard ? hero.values.hi_year : null;
      const pool = mornings.filter((e) => !held.has(`${city}|${e.year}`) && e.year !== heroYear).sort((a, b) => a.year - b.year);
      let hot = null, cool = null;
      for (const e of pool) { if (!hot || e.temp >= hot.temp) hot = e; if (!cool || e.temp <= cool.temp) cool = e; }
      const guard = shown && !!hot && hot.year !== cool.year && Math.round((hot.temp - cool.temp) * 10) / 10 >= courses.weather.pairs.min_gap_c;
      step(() => eq(n.guard, guard, `course.weather (${city}): the pair other than the hero's edition, 5 °C apart`));
      // Shares that round alike are said once; under 5 whole points apart, about the same share, warm or cool; 5 points
      // or more, two facts. Otherwise the span of every morning.
      if (guard) {
        const same = whole(hot.slowdown) === whole(cool.slowdown);
        const apart = Math.abs(Math.round(hot.slowdown * 100) - Math.round(cool.slowdown * 100));
        const quiet = !same && apart < 5;
        step(() => eq([n.values.hot_year, n.values.cool_year, n.values.quiet], [hot.year, cool.year, quiet ? 1 : 0], `course.weather (${city}): the pair and the null rule`));
        step(() => eq(said(n), same
          ? `At ${degF(hot.temp)} in ${hot.year} and at ${degF(cool.temp)} in ${cool.year}, the same ${whole(hot.slowdown)} had a sustained slowdown.`
          : quiet ? `Warm or cool, about the same share had a sustained slowdown: ${whole(hot.slowdown)} at ${degF(hot.temp)}, ${whole(cool.slowdown)} at ${degF(cool.temp)}.`
            : `At ${degF(hot.temp)} in ${hot.year}, ${whole(hot.slowdown)} had a sustained slowdown. At ${degF(cool.temp)} in ${cool.year}, ${whole(cool.slowdown)}.`, `course.weather (${city}): the sentence`));
      } else if (mornings.length >= 2) {
        const temps = mornings.map((e) => e.temp);
        step(() => eq(said(n), `Race mornings from ${degF(Math.min(...temps))} to ${degF(Math.max(...temps))}.`, `course.weather (${city}): the span`));
      }
    }
  }

  // Fixtures: every course nugget falls back for a city with no page.
  const none = N.getNugget('course.weather', { city: 'Nowhere' });
  step(() => eq([none.guard, core.sentenceOf(none)], [false, 'Race mornings.'], 'fixture course.weather: a city with no page falls back'));
  for (const id of N.CONTEXT_NUGGETS) step(() => eq(N.getNugget(id, { city: 'Nowhere' }).guard, false, `fixture ${id}: no page, no claim`));
  return { checks, cities: courses.courses.length };
};
