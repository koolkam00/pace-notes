/**
 * Nuggets for /courses and the course pages (WP5; the redesign spec, sections 5 and 7.10). Course-level numbers on these
 * pages come from courses.json through the course page model (lib/course-page.ts), so a dot on the index matches its
 * course page and a screen never mixes in the all-finisher evidence (section 3.10).
 *
 * The course nuggets take `ctx.city` (CONTEXT_NUGGETS in index.ts). Each reads only its own course's published fields;
 * comparisons across courses filter to three or more editions (section 3.10), and a range end is never an edition the
 * source policy holds or the duplicate-edition screen copies. scripts/nuggets/courses.cjs recounts every one from the raw
 * files for every course, and checks that its guard and sentence follow.
 */
import { coursePage, coursePages, finishMinute, heldEditions, type CoursePageData } from '@/lib/course-page';
import { readInsight } from '@/lib/insights-server';
import type { Archetypes, Courses } from '@/lib/insights';
import { courseSlug } from '@/lib/tools/links';
import { underWater } from '@/lib/terrain-reading';
import { count, countWord, pct, sectionLabel, temp } from './format';
import { shareFigure, type Builder } from './build';
import type { Nugget, NuggetContext, NuggetFigure, UnitsAware } from './types';

/** A course nugget: the figure in kilometre units too, where the figure is an elevation. */
export type CourseNugget = Nugget & { figureKm?: NuggetFigure };

const TERM = '/methodology#sustained-slowdown' as const;
/** The 5 km sections in order, as the data names them ("0–5" … "40–42.2"), with their mats. */
const SECTION_KM: readonly [number, number][] = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
/** At least three editions for a course to stand at either end of a cross-course comparison (section 3.10). */
export const MIN_EDITIONS = 3;
/**
 * The first 5K "drops" or "climbs" from 30 m net either way, and a 5K section is "the biggest climb" from 30 m (about
 * 100 ft) of ascent: a start 10 m lower at 5K is no identity a runner would name (critic round 2), and on a flat course
 * the steepest 5K's 18 m is no climb, and a heading about it beside a slow 5K would read as its cause.
 */
export const NET_MIN_M = 30;
export const CLIMB_MIN_M = 30;
/** Two neighbouring 5K climbs within 10% of each other are one stretch: the heading names the pair, never a near tie. */
export const CLIMB_TIE = 0.9;
/**
 * A route profile from a terrain model records the water under a bridge, not its deck (lib/terrain-reading.ts): where it
 * does, its climbs are not ranked and its start is not described: the sections still give each 5K's numbers, but no
 * heading names a biggest climb or a drop the bridges hide.
 */
export function profileUnderWater(page: CoursePageData | null): boolean {
  const g = page?.geometry;
  return !!g && underWater(page.city, g.elevation_m, g.elevation_step_km);
}
/** The 40K–finish section is 2.2 km, not a 5K: its words say "stretch". */
const stretchOf = (i: number) => (i === SECTION_KM.length - 1 ? 'stretch' : '5K');
/**
 * The glance's rows say only what sets a course apart: a 5K section "parts" from the typical course from 3 points of
 * pace against the course's own average (2 points rounds to look like 3 as whole percentages, and sets nothing apart).
 */
export const SIGNATURE_MIN = 3;
/** A pacing type's share differs from every course's from 3 percentage points. */
export const TYPE_GAP = 0.03;
/** A median finish "moved" from 60 seconds. */
export const MOVED_S = 60;
/**
 * Medians that spread less than six minutes are a steady course, said as such ("Every median finish within 4 minutes"),
 * not as a range whose ends would read as a swing (the line draws them on a 20-minute scale, flat).
 */
export const STEADY_S = 6 * 60;
/** The goal a course page leads with (whole minutes): the planner's default. */
export const LEAD_GOAL = 240;

const ft = (m: number) => Math.round(Math.abs(m) / 0.3048).toLocaleString('en-US');
const metres = (m: number) => Math.round(Math.abs(m)).toLocaleString('en-US');
const goalText = (goal: number) => `${Math.floor(goal / 60)}:${String(goal % 60).padStart(2, '0')}`;
const both = (f: (u: 'mi' | 'km') => string): UnitsAware<string> => ({ mi: f('mi'), km: f('km') });
const sectionOf = (i: number) => (SECTION_KM[i] ? sectionLabel(...SECTION_KM[i]) : '—');

function pageFor(ctx?: NuggetContext): CoursePageData | null {
  return ctx?.city ? coursePage(courseSlug(ctx.city)) : null;
}

// ---------- /courses ----------

/**
 * The index's count: every course page, the /courses dek. Its figure is that count (round 4: every card in the chain
 * carries a number, and the card into a list promises what the list holds), never a share across courses, which is
 * course-comparison's alone.
 */
function coursesIndex(): Nugget {
  const n = coursePages().size;
  return {
    id: 'courses.index', page: '/courses', denominator: 'course', values: { courses: n }, guard: n > 0,
    headline: `*${count(n)}* city marathons.`,
    fallback: 'City marathons.',
    figure: n > 0 ? { value: count(n), sr: `${count(n)} city marathons`, spoken: count(n) } : null,
    key: 'city marathons, each with its own page',
  };
}

// ---------- A course page ----------

/**
 * The words under a course hero's figure, up to the term: the figure averages the editions' shares, so with three or
 * more editions they name an average year (plain words for the average edition); with two, the average of the two;
 * with one, its year (no averaging happened). course.slowdown's key is these words and the term.
 */
export function heroKeyLead(editions: number, year: number | undefined): string {
  return editions === 1 ? `of finishes in ${year} had a` : editions === 2 ? 'of finishes in its two editions, on average, had a' : 'of finishes in an average year had a';
}

/** The fewest race mornings #weather draws: two or three dots say nothing a sentence would not. */
export const WEATHER_MIN_MORNINGS = 3;

/** Whether a course page shows #weather: the warmest and coolest mornings 5 °C or more apart, over three or more. */
export const weatherShown = (page: CoursePageData | null) => !!page?.hotCool && page.weather.length >= WEATHER_MIN_MORNINGS;

/**
 * The edition the hero accents (course.slowdown's high end), when its sentence shows: every other section of the page
 * leaves it out of its own sentence and never opens its chart on it, so a reader who scrolls the whole page learns one
 * fact per section, not one edition three times (critic round 5).
 */
export function heroYear(ctx?: NuggetContext): number | null {
  const n = courseSlowdown(ctx);
  return n.guard ? Number(n.values.hi_year) : null;
}

/**
 * The hero: the share of finishes with a sustained slowdown in the average edition (summary.slowdown averages the
 * editions' shares, so the words name the average edition, never a share pooled over every finish), and how far it ran
 * edition by edition. Where the high end was also the course's warmest (or coolest) race morning and the page shows
 * #weather, the sentence says so once, here ("and 54% (2016), its warmest morning"), and #weather compares the other
 * mornings.
 */
function courseSlowdown(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const s = page?.summary;
  const city = page?.display ?? ctx?.city ?? 'This course';
  const share = s?.slowdown ?? NaN;
  const [lo, hi] = s?.slowdown_range ?? [NaN, NaN];
  const [loYear, hiYear] = s?.slowdown_range_years ?? [NaN, NaN];
  const held = heldEditions();
  const named = (year: number) => !!page && !held.has(`${page.city}|${year}`);
  const guard = !!s && Number.isFinite(share) && s.editions >= 2 && pct(lo) !== pct(hi) && lo < hi && named(loYear) && named(hiYear);
  const years = s?.years ?? [];
  // The high end's morning, against every other morning the policy keeps (strictly warmer or cooler than all of them).
  const mornings = weatherShown(page) ? page!.weather.filter((e) => named(e.year)) : [];
  const own = mornings.find((e) => e.year === hiYear);
  const rest = mornings.filter((e) => e.year !== hiYear);
  const end = guard && own && rest.length ? (rest.every((e) => e.temp < own.temp) ? 'warmest' : rest.every((e) => e.temp > own.temp) ? 'coolest' : '') : '';
  return {
    id: 'course.slowdown', page: `/courses/${courseSlug(page?.city ?? city)}`, denominator: 'course', term: TERM,
    values: { city: page?.city ?? city, share, lo, hi, lo_year: loYear, hi_year: hiYear, editions: s?.editions ?? 0, morning: end === 'warmest' ? 1 : end === 'coolest' ? -1 : 0 },
    guard,
    headline: `Edition by edition, between ${pct(lo)} (${loYear}) and *${pct(hi)}* (${hiYear})${end ? `, its ${end} morning` : ''}.`,
    fallback: years.length > 1 ? `Every ${city} edition, ${years[0]} to ${years[years.length - 1]}.` : years.length ? `The ${years[0]} edition.` : `${city}, edition by edition.`,
    figure: shareFigure(share), key: `${heroKeyLead(s?.editions ?? 0, years[0])} sustained slowdown`,
  };
}

/**
 * At a glance (1): the net change over the first 5K of the supplied route, said only from 30 m either way (a flat start
 * sets no course apart) and never on a profile that reads the water under a bridge. Net, not climb: the elevation
 * section gives each 5K's climb.
 */
function courseStart(ctx?: NuggetContext): CourseNugget {
  const page = pageFor(ctx);
  const net = page?.terrain?.[0]?.net_m ?? NaN;
  const has = Number.isFinite(net);
  const guard = has && Math.abs(net) >= NET_MIN_M && !profileUnderWater(page);
  const word = net < 0 ? 'lower' : 'higher';
  const unit = (u: 'mi' | 'km') => (u === 'mi' ? `${ft(net)} ft` : `${metres(net)} m`);
  return {
    id: 'course.start', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'none',
    values: { net_m: net },
    guard,
    headline: both((u) => `The first 5K ends *${unit(u)}* ${word} than it starts.`),
    fallback: has ? 'The first 5K is flat.' : 'The first 5K.',
    figure: guard ? { value: ft(net), unit: 'ft', sr: `${ft(net)} feet` } : null,
    figureKm: guard ? { value: metres(net), unit: 'm', sr: `${metres(net)} metres` } : undefined,
    key: `${word} at 5K than at the start`,
  };
}

/** The section most courses slow most in, and how many share it (courses with a pacing shape). */
export function slowestTally(summaries: { slowest_section?: string }[]): { modal: string | null; k: number; n: number; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  for (const s of summaries) if (s.slowest_section) counts.set(s.slowest_section, (counts.get(s.slowest_section) ?? 0) + 1);
  const n = [...counts.values()].reduce((a, b) => a + b, 0);
  const modal = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return { modal, k: modal ? counts.get(modal)! : 0, n, counts };
}

/**
 * How many courses share the usual slowest section, in words where the count adds nothing (round 6: a page that named
 * 25 of 27 here, 26 in its pacing key, 24 in its slowdown H2 and 23 in its goals key read as a miscount). The exact
 * tally is in All numbers.
 */
export function onCourses(k: number, n: number): string {
  if (k === n) return 'every course';
  if (k / n >= 0.85) return 'nearly every course';
  if (k / n > 0.5) return 'most courses';
  return `${k} of ${n} courses`;
}

/**
 * At a glance (2): the median finisher's slowest 5K, said only where it is not the section most courses slow most in
 * (a slowest 5K like nearly every other course's sets nothing apart).
 */
function courseLate(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const sections = readInsight<Courses>('courses.json').sections;
  const slowest = page?.summary.slowest_section;
  const i = slowest ? sections.indexOf(slowest) : -1;
  const { modal, counts, n } = slowestTally([...coursePages().values()].map((p) => p.summary));
  const m = modal ? sections.indexOf(modal) : -1;
  const k = modal ? (counts.get(modal) ?? 0) : 0;
  const guard = i >= 0 && m >= 0 && n >= 3 && slowest !== modal;
  const name = sectionOf(i), usual = sectionOf(m);
  const display = page?.display ?? 'This course';
  // The row's figure is how much slower than its own average the slowest section runs: a reading, not a section name.
  const v = page?.summary.curve?.length === 9 && i >= 0 ? page.summary.curve[i] : NaN;
  const by = Math.round(Math.abs(v));
  return {
    id: 'course.late', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'shape',
    values: { section: slowest ?? '', modal: modal ?? '', k, n, pace: v },
    guard,
    headline: `${display}’s slowest ${stretchOf(i)} is *${name}*; on ${onCourses(k, n)} it’s ${usual}.`,
    fallback: i >= 0 && m >= 0 ? `${display}’s slowest ${stretchOf(i)} is ${name}, as on ${onCourses(k, n)}.` : i >= 0 ? `${display}’s slowest ${stretchOf(i)} is ${name}.` : 'Where the median finish slowed most.',
    figure: i >= 0 && Number.isFinite(v) && v > 0 ? { value: `${by}%`, unit: ' slower', sr: `${by}% slower` } : null,
    // The baseline named (critic round 4: "than average" beside the hills page's "than elsewhere" read as one number).
    key: `than ${display}’s average pace, at ${name}, its slowest ${stretchOf(i)}; on ${onCourses(k, n)} it’s ${usual}`,
  };
}

/**
 * At a glance (3): the 5K section where the course's pacing parts most from the typical course's (each against its own
 * average pace), said from 3 points apart on a course with three or more editions, as one figure: "London’s first 5K
 * runs 3% quicker than on the typical course." Where no section parts that far, the course "paces much like the
 * typical course", which the glance says alone when nothing else sets the course apart.
 */
function courseSignature(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const s = page?.summary;
  const data = readInsight<Courses>('courses.json');
  const i = s?.signature_section ? data.sections.indexOf(s.signature_section) : -1;
  const curve = s?.curve?.length === 9 ? s.curve : null;
  const here = curve && i >= 0 ? curve[i] : NaN, typical = i >= 0 ? (data.typical_curve[i] ?? NaN) : NaN;
  const pts = s?.signature_points ?? NaN;
  const solid = !!s && !!curve && s.editions >= MIN_EDITIONS && Number.isFinite(pts) && Number.isFinite(here) && Number.isFinite(typical);
  const guard = solid && Math.abs(pts) >= SIGNATURE_MIN && Math.round(here) !== Math.round(typical);
  const display = page?.display ?? 'This course';
  const name = sectionOf(i);
  // The figure is how far the section parts from the typical course's, from the two whole percentages the words give
  // (so the three numbers add up on the page); 3 points apart rounds to at least 3.
  const apart = Math.round(here) - Math.round(typical);
  // One figure in runner words (critic round 4: the two percentages and their difference read as three numbers on one
  // screen): how far the section parts from the typical course's, each against its own average pace. The two
  // percentages behind it are the glance row's note and "All numbers".
  const place = i === 0 ? 'first 5K' : i === SECTION_KM.length - 1 ? 'last stretch' : name;
  const side = apart > 0 ? 'slower' : 'quicker';
  return {
    id: 'course.signature', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'shape',
    values: { section: s?.signature_section ?? '', here, typical, points: pts, apart, editions: s?.editions ?? 0, typical_like: solid && Math.abs(pts) < SIGNATURE_MIN ? 1 : 0 },
    guard,
    headline: `${display}’s ${place} runs *${Math.abs(apart)}% ${side}* than on the typical course.`,
    fallback: solid ? `${display} paces *much like the typical course*, 5K by 5K.` : 'Its pacing, 5K by 5K.',
    figure: guard ? { value: `${Math.abs(apart)}%`, unit: ` ${side}`, sr: `${Math.abs(apart)}% ${side}` } : null,
    key: solid ? `than on the typical course, at ${name}` : undefined,
  };
}

/** The trend compares the first three editions with the last three: six or more editions, so the two never overlap. */
export const TREND_EDITIONS = 3;
/** The median finish "got quicker" (or slower) from five minutes between the two sets' averages. */
export const TREND_S = 5 * 60;

const floorMinute = (s: number) => finishMinute(s);
const ceilMinute = (s: number) => finishMinute(Math.ceil(s / 60) * 60);
/** Years as a list: "2016", "2016 and 2018", "2015, 2016 and 2018". */
const yearList = (ys: number[]) => (ys.length > 1 ? `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}` : String(ys[0] ?? ''));

/**
 * #finish-times: what the hero has not told (critic round 5: the hero's readout already gives its year's median). With
 * six or more editions whose first three and last three average five minutes or more apart, the trend ("The median
 * finish got 11 minutes quicker from the first three editions to the last three."); medians that spread under six
 * minutes, the window every one fell in, its ends rounded outward ("Every median finish fell between 4:10 and 4:16.");
 * otherwise the range, low end first, accenting the end that is not the hero's edition. A range end another edition
 * shares to the minute names both years. The line opens on the accented end, or on the latest edition other than the
 * hero's. Each named end is a year the source policy neither holds nor copies. Clock times are floored to the minute, as
 * a race clock reads (3:59:36 is 3:59, never 4:00). Two editions: first to latest.
 */
function courseTimes(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const eds = page?.editions ?? [];
  const at = (e: { median_s: number }) => finishMinute(e.median_s);
  const held = heldEditions();
  const named = eds.filter((e) => !!page && !held.has(`${page.city}|${e.year}`));
  const lo = named.length ? named.reduce((a, b) => (b.median_s < a.median_s ? b : a)) : undefined;
  const hi = named.length ? named.reduce((a, b) => (b.median_s > a.median_s ? b : a)) : undefined;
  const first = eds[0], last = eds[eds.length - 1];
  const spread = lo && hi ? hi.median_s - lo.median_s : NaN;
  const guard = eds.length >= 3 && !!lo && !!hi && spread >= MOVED_S && at(lo) !== at(hi);
  const hero = heroYear(ctx);
  // The year #weather accents (its warmer morning, told as two facts): this sentence never accents it too.
  const weatherYear = Number(courseWeather(ctx).values.accent_year);
  const k = TREND_EDITIONS;
  const mean = (a: typeof named) => a.reduce((sum, e) => sum + e.median_s, 0) / a.length;
  const drift = named.length >= 2 * k ? mean(named.slice(-k)) - mean(named.slice(0, k)) : NaN;
  const trend = guard && Math.abs(drift) >= TREND_S;
  const steady = guard && !trend && spread < STEADY_S;
  // The range's accent: the low end, unless another section accents its edition (the hero's, or #weather's warmer
  // morning), then the high end, else neither.
  const free = (e: { year: number }) => e.year !== hero && e.year !== weatherYear;
  const accent = guard && !trend && !steady && lo && hi ? [lo, hi].find(free) : undefined;
  const other = accent && lo && hi ? (accent === lo ? hi : lo) : undefined;
  const ranged = guard && !trend && !steady;
  // The line opens on the accented end, else on the latest edition other than the hero's.
  const opening = accent ?? [...named].reverse().find((e) => e.year !== hero) ?? last;
  const yearsAt = (end: { median_s: number }) => named.filter((e) => at(e) === at(end)).map((e) => e.year);
  const endText = (end: { median_s: number }) => (end === accent ? `*${at(end)}*` : at(end)) + ` in ${yearList(yearsAt(end))}`;
  const minutes = Math.round(Math.abs(drift) / 60);
  return {
    id: 'course.times', page: `/courses/${page?.slug ?? ''}#finish-times`, denominator: 'course',
    values: {
      lo_year: lo?.year ?? NaN, lo_s: lo?.median_s ?? NaN, hi_year: hi?.year ?? NaN, hi_s: hi?.median_s ?? NaN, editions: eds.length,
      steady: steady ? 1 : 0, trend: trend ? 1 : 0, drift_s: drift, accent_year: accent?.year ?? NaN,
      // The end the line labels: the other end the range names (with no accent, the low end; the line opens on the latest).
      other_year: ranged && lo && hi ? (other ?? lo).year : NaN, open_year: opening?.year ?? NaN, hero_year: hero ?? NaN,
    },
    guard,
    headline: !lo || !hi ? ''
      : trend ? `The median finish got *${minutes} minutes ${drift < 0 ? 'quicker' : 'slower'}* from the first three editions to the last three.`
        : steady ? `Every median finish fell between ${floorMinute(lo.median_s)} and ${ceilMinute(hi.median_s)}.`
          : `The median finish ranged from ${endText(lo)} to ${endText(hi)}.`,
    // Within a minute the median "held"; two editions read first to latest.
    fallback: eds.length >= 3 && lo && hi
      ? (at(lo) === at(hi) ? `The median finish was *${at(lo)}* in every edition.` : `The median finish held within a minute: ${at(lo)} to *${at(hi)}*.`)
      : eds.length === 2
        ? (at(first) === at(last) ? `The median finish was *${at(first)}* in both ${first.year} and ${last.year}.` : `The median finish was ${at(first)} in ${first.year}, *${at(last)}* in ${last.year}.`)
        : first ? `The median finish in ${first.year}: *${at(first)}*.` : 'Finish times by year.',
    figure: null,
  };
}

/**
 * #elevation: the 5K section with the most climbing on the supplied route. Where its neighbour climbs within 10% of it,
 * the two are one stretch ("25–35K: 333 ft"), both washed, so the heading never names a winner by a few metres. A
 * profile that reads the water under a bridge ranks no climb (profileUnderWater).
 */
function courseClimb(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const t = page?.terrain ?? null;
  const i = t ? t.reduce((b, s, j) => (s.gain_m > t[b].gain_m ? j : b), 0) : -1;
  const top = t && i >= 0 ? t[i].gain_m : NaN;
  const wet = profileUnderWater(page);
  const guard = Number.isFinite(top) && top >= CLIMB_MIN_M && !wet;
  const next = t && i >= 0 ? [i - 1, i + 1].filter((j) => j >= 0 && j < t.length).reduce<number>((b, j) => (b < 0 || t[j].gain_m > t[b].gain_m ? j : b), -1) : -1;
  const pair = guard && next >= 0 && t![next].gain_m >= CLIMB_TIE * top;
  const from = pair ? Math.min(i, next) : i, to = pair ? Math.max(i, next) : i;
  const gain = pair ? t![from].gain_m + t![to].gain_m : top;
  const name = from >= 0 ? sectionLabel(SECTION_KM[from][0], SECTION_KM[to][1]) : '—';
  const unit = (u: 'mi' | 'km', m = gain) => (u === 'mi' ? `${ft(m)} ft` : `${metres(m)} m`);
  return {
    id: 'course.climb', page: `/courses/${page?.slug ?? ''}#elevation`, denominator: 'none',
    values: { section: from, section_to: to, gain_m: gain, under_water: wet ? 1 : 0 },
    guard,
    headline: both((u) => `The biggest climb is *${name}*: ${unit(u)}.`),
    fallback: both((u) => (wet ? 'The route, start to finish.' : Number.isFinite(top) ? `No ${stretchOf(i)} climbs more than ${unit(u, top)}.` : 'The route, start to finish.')),
    figure: null,
  };
}

/** #pacing: the pacing type whose share differs most from every course's. */
function courseTypes(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  // The other courses with 5K splits, their shares pooled by finishes (this course left out of the set it is compared
  // with); the key under the rows names how many.
  const across = page?.typesElsewhere?.courses ?? readInsight<Archetypes>('archetypes.json').courses.length - 1;
  const shares = page?.types?.shares ?? [];
  const all = page?.archetypes ?? [];
  const elsewhere = page?.typesElsewhere?.shares ?? [];
  let i = -1;
  shares.forEach((v, j) => { if (all[j] && Number.isFinite(elsewhere[j]) && (i < 0 || Math.abs(v - elsewhere[j]) > Math.abs(shares[i] - elsewhere[i]))) i = j; });
  const here = i >= 0 ? shares[i] : NaN, every = i >= 0 ? elsewhere[i] : NaN;
  const guard = i >= 0 && Math.abs(here - every) >= TYPE_GAP;
  // The type's name in lower case mid-sentence ("Fewer early drifters here").
  const name = i >= 0 ? `${all[i].name.toLowerCase()}s` : '';
  return {
    id: 'course.types', page: `/courses/${page?.slug ?? ''}#pacing`, denominator: 'shape',
    values: { type: i >= 0 ? all[i].slug : '', here, every, courses: across },
    guard,
    // The comparator once, without its count (the key under the rows names the set).
    headline: `${here > every ? 'More' : 'Fewer'} *${name}* here: ${pct(here)}, against ${pct(every)} elsewhere.`,
    // TYPE_GAP is percentage points (critic round 5: "within 3% of its share" read as a relative 3%).
    fallback: page?.types ? `Paced much like the other courses: every type within ${Math.round(TYPE_GAP * 100)} points of its share on the other courses.` : `No pacing types for ${page?.display ?? 'this course'}.`,
    figure: null,
  };
}

/**
 * #slowdown's finding, over the strip of every course: this course's share and where it sits among the other courses
 * with three or more editions (the rest are hollow on the strip), as a count of them, "any other course" (or "every
 * course") when it is all of them, or "near the middle" where the counts above and below are within two of each other
 * (12 above and 12 below never reads as "lower"). A course with fewer editions itself says how many, and compares itself with the courses with three
 * or more, never the other way round. The scope is said every time, since the count leaves out the hollow dots.
 */
export const MIDDLE_SPREAD = 2;
function courseAmong(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const s = page?.summary;
  const others = [...coursePages().values()].map((p) => p.summary).filter((o) => o.city !== s?.city && o.editions >= MIN_EDITIONS);
  const higher = s ? others.filter((o) => o.slowdown > s.slowdown).length : 0;
  const lower = s ? others.filter((o) => o.slowdown < s.slowdown).length : 0;
  const n = others.length;
  const solid = !!s && s.editions >= MIN_EDITIONS;
  const middle = solid && Math.abs(higher - lower) <= MIDDLE_SPREAD;
  const fewer = higher >= lower;
  const count = fewer ? higher : lower;
  const guard = !!s && s.editions >= 1 && n >= 5 && (middle || count > 0);
  const name = page?.display ?? 'This course';
  const share = pct(s?.slowdown ?? NaN);
  // The accent never breaks across lines ("16 of the 24" stays together).
  const nb = (t: string) => t.replace(/ /g, '\u00a0');
  const side = fewer ? 'lower' : 'higher';
  // The accent is the comparison's count with its set, in one unbroken span ("21 of 24"), and the set is named every
  // time (critic round 5: "lower than 21 of the other courses" over a strip of 27 other dots read as a miscount). A
  // course of fewer editions leads with how many it has and is not one of the set, so it says "courses", not "other".
  const set = `${solid ? 'other ' : ''}courses with three or more editions`;
  const than = count === n ? `${side} than *${nb(`all ${n}`)}* ${set}` : `${side} than *${nb(`${count} of ${n}`)}* ${set}`;
  const from = `From its ${countWord(s?.editions ?? 0)} ${s?.editions === 1 ? 'edition' : 'editions'}`;
  return {
    id: 'course.among', page: `/courses/${page?.slug ?? ''}#slowdown`, denominator: 'course',
    values: { share: s?.slowdown ?? NaN, higher, lower, courses: n, editions: s?.editions ?? 0, middle: middle ? 1 : 0 },
    guard,
    headline: middle ? `${name}’s ${share}: *${nb('near the middle')}* of the courses.` : solid ? `${name}’s ${share}: ${than}.` : `${from}, ${name}’s ${share} is ${than}.`,
    fallback: `${name} beside every course.`,
    figure: null,
  };
}

/**
 * A course's goal share "parts" from the other courses' from 2 points apart as the page prints them (critic round 5: the
 * rule ran on unrounded shares, so "12%, about the same" sat over a ring drawn at 15%); within one printed point the two
 * are about the same.
 */
export const GOAL_GAP_MIN = 2;

/**
 * #goals: of finishes on the lead goal's pace through 20K here (their 5–20K pace within 2% of it), the share that made
 * the goal (the denominator said first), against the same share across the other courses (their rows pooled by
 * finishes, lib/course-page.ts pooledGoal), so a runner can tell a hard course from a kind one. Both shares are said,
 * except within one printed point, where the two are "about the same".
 */
function courseGoal(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const line = page?.goals.find((g) => g.goal === LEAD_GOAL) ?? null;
  const row = line?.row ?? null;
  const every = line?.every ?? null;
  const guard = !!row && row.n >= 100;
  const g = goalText(LEAD_GOAL);
  // The gap between the two shares as printed (pct), so the words never disagree with the figures beside them.
  const printed = (v: number) => Number(pct(v).replace('%', ''));
  const gap = row && every ? Math.abs(printed(row.under) - printed(every.under)) : 0;
  // Against the other courses (this one left out of the pool), named once without their count: the key names the set.
  const against = !every ? '' : gap >= GOAL_GAP_MIN ? `, against ${pct(every.under)} elsewhere` : ', about the same as elsewhere';
  return {
    id: 'course.goal', page: `/courses/${page?.slug ?? ''}#goals`, denominator: 'tool',
    values: { goal: LEAD_GOAL, under: row?.under ?? NaN, n: row?.n ?? 0, every: every?.under ?? NaN, every_n: every?.n ?? 0, every_courses: every?.courses ?? 0 },
    guard,
    headline: `Of ${page?.display ?? ''} finishes on ${g} pace through 20K, *${pct(row?.under ?? NaN)}* made ${g}${against}.`,
    fallback: page?.goals.length ? `Goal times from 3:00 to 5:00 on ${page.display}.` : `No goal times for ${page?.display ?? 'this course'}.`,
    figure: row ? shareFigure(row.under) : null,
  };
}

/**
 * The warmest and coolest mornings' shares differ "by weather" from this many whole points; closer, the two read as
 * about the same share (critic round 4: Boston's 29% at 61°F against 25% at 38°F read as a warm-day effect). The sentence
 * never says "worst" (verify-courses bans rank words).
 */
export const WEATHER_GAP = 5;

/**
 * #weather: the warmest and coolest race mornings other than the hero's edition (critic round 5: the hero already tells
 * that year's share and its start; where it was the warmest or coolest morning, the hero says so once), at least the
 * screen's gap apart (5 °C). A share both mornings round to is said once; shares under WEATHER_GAP points apart are said
 * as one null ("Its warmest and coolest mornings had about the same share…"); a gap of WEATHER_GAP points or more is
 * told as two facts. Where the hero called its edition the warmest or coolest morning, the sentence opens "Apart from
 * {year}". Where the other mornings are closer than the screen's gap, the guard fails and the page leaves #weather out
 * (round 6: a temperature span is not a finding). Held and copied editions are never named.
 */
function courseWeather(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const w = page?.weather ?? [];
  const lo = w.length ? Math.min(...w.map((e) => e.temp)) : NaN, hi = w.length ? Math.max(...w.map((e) => e.temp)) : NaN;
  const held = heldEditions();
  const hero = heroYear(ctx);
  const pool = w.filter((e) => !!page && !held.has(`${page.city}|${e.year}`) && e.year !== hero);
  // Ties go to the later edition, as the published pair does.
  const hot = pool.length ? pool.reduce((a, b) => (b.temp >= a.temp ? b : a)) : null;
  const cool = pool.length ? pool.reduce((a, b) => (b.temp <= a.temp ? b : a)) : null;
  const minGap = readInsight<Courses>('courses.json').weather.pairs.min_gap_c;
  const apartC = hot && cool ? Math.round((hot.temp - cool.temp) * 10) / 10 : NaN;
  const guard = weatherShown(page) && !!hot && !!cool && hot.year !== cool.year && apartC >= minGap;
  const same = guard && pct(hot!.slowdown) === pct(cool!.slowdown);
  const gap = guard ? Math.abs(Math.round(hot!.slowdown * 100) - Math.round(cool!.slowdown * 100)) : NaN;
  const quiet = guard && !same && gap < WEATHER_GAP;
  // Where the hero's sentence calls its edition the warmest (or coolest) morning, the section says it leaves that year
  // out ("Apart from 2022, …"), so it never seems to deny what the hero has just shown (round 6: "warm or cool, about the
  // same share" under a hero whose worst year was its warmest).
  const named = guard && hero !== null && Number(courseSlowdown(ctx).values.morning) !== 0 && w.some((e) => e.year === hero);
  const lead = (rest: string) => (named ? `Apart from ${hero}, ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : rest);
  return {
    id: 'course.weather', page: `/courses/${page?.slug ?? ''}#weather`, denominator: 'course',
    values: guard ? { hot_year: hot!.year, hot_temp: hot!.temp, hot_share: hot!.slowdown, cool_year: cool!.year, cool_temp: cool!.temp, cool_share: cool!.slowdown, editions: w.length, quiet: quiet ? 1 : 0, hero_year: hero ?? NaN, apart: named ? 1 : 0,
      // Two facts accent the warmer morning's start; a null accents nothing.
      accent_year: !same && !quiet ? hot!.year : NaN }
      : { editions: w.length, coolest: lo, warmest: hi, hero_year: hero ?? NaN, accent_year: NaN },
    guard,
    // Two mornings whose shares round alike say the share once: the point is that it did not move.
    // A quiet pair names the two mornings it compares, never "warm or cool" (round 6: two editions are not every morning).
    headline: guard ? both((u) => lead(same
      ? `At ${temp(hot!.temp, u)} in ${hot!.year} and at ${temp(cool!.temp, u)} in ${cool!.year}, the same ${pct(hot!.slowdown)} had a sustained slowdown.`
      : quiet ? `Its warmest and coolest mornings had about the same share of sustained slowdowns: ${pct(hot!.slowdown)} at ${temp(hot!.temp, u)}, ${pct(cool!.slowdown)} at ${temp(cool!.temp, u)}.`
        : `At *${temp(hot!.temp, u)}* in ${hot!.year}, ${pct(hot!.slowdown)} had a sustained slowdown. At ${temp(cool!.temp, u)} in ${cool!.year}, ${pct(cool!.slowdown)}.`)) : '',
    fallback: both((u) => w.length >= 2 ? `Race mornings from ${temp(lo, u)} to ${temp(hi, u)}.` : w.length ? `One race morning: ${temp(lo, u)} at the start.` : 'Race mornings.'),
    figure: null,
  };
}

export const COURSE_NUGGETS: Record<string, Builder> = {
  'courses.index': coursesIndex,
  'course.slowdown': courseSlowdown,
  'course.start': courseStart,
  'course.late': courseLate,
  'course.signature': courseSignature,
  'course.times': courseTimes,
  'course.climb': courseClimb,
  'course.types': courseTypes,
  'course.among': courseAmong,
  'course.goal': courseGoal,
  'course.weather': courseWeather,
};

/** The nuggets a course page builds with its city (index.ts CONTEXT_NUGGETS). */
export const COURSE_CONTEXT_NUGGETS = ['course.slowdown', 'course.start', 'course.late', 'course.signature', 'course.times', 'course.climb', 'course.types', 'course.among', 'course.goal', 'course.weather'] as const;
