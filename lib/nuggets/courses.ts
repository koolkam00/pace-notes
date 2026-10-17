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
import { coursePage, coursePages, heldEditions, type CoursePageData } from '@/lib/course-page';
import { readInsight } from '@/lib/insights-server';
import type { Courses } from '@/lib/insights';
import { courseSlug } from '@/lib/tools/links';
import { count, hm, pct, sectionLabel, temp } from './format';
import { shareFigure, type Builder } from './build';
import type { Nugget, NuggetContext, NuggetFigure, UnitsAware } from './types';

/** A course nugget: the figure in kilometre units too, where the figure is an elevation. */
export type CourseNugget = Nugget & { figureKm?: NuggetFigure };

const TERM = '/methodology#sustained-slowdown' as const;
/** The 5 km sections in order, as the data names them ("0–5" … "40–42.2"), with their mats. */
const SECTION_KM: readonly [number, number][] = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
/** At least three editions for a course to stand at either end of a cross-course comparison (section 3.10). */
export const MIN_EDITIONS = 3;
/** The first 5K "drops" or "climbs" from 10 m net either way; a 5K section is a "climb" from 15 m of ascent. */
export const NET_MIN_M = 10;
export const CLIMB_MIN_M = 15;
/** A pacing type's share differs from every course's from 3 percentage points. */
export const TYPE_GAP = 0.03;
/** A median finish "moved" from 60 seconds. */
export const MOVED_S = 60;
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

/** The index's count: every course page. Its figure is the contents row and the next card into /courses. */
function coursesIndex(): Nugget {
  const n = coursePages().size;
  return {
    id: 'courses.index', page: '/courses', denominator: 'course', values: { courses: n }, guard: n > 0,
    headline: `*${count(n)}* city marathons.`,
    fallback: 'City marathons.',
    figure: n > 0 ? { value: count(n), sr: `${count(n)} courses` } : null, key: 'city marathons, one distance',
  };
}

/**
 * The index's reading: the spread of sustained slowdown across courses with three or more editions. "More than twice"
 * needs the highest share at least twice the lowest.
 */
export function coursesRangeFrom(field: { city: string; slowdown: number; editions: number }[]): Nugget {
  const solid = field.filter((c) => c.editions >= MIN_EDITIONS && Number.isFinite(c.slowdown));
  const lo = solid.length ? solid.reduce((a, b) => (b.slowdown < a.slowdown ? b : a)) : null;
  const hi = solid.length ? solid.reduce((a, b) => (b.slowdown > a.slowdown ? b : a)) : null;
  const ratio = lo && hi && lo.slowdown > 0 ? hi.slowdown / lo.slowdown : NaN;
  const guard = solid.length >= 3 && ratio >= 2;
  const whole = (v: number) => String(Math.round(v * 100));
  return {
    id: 'courses.range', page: '/courses', denominator: 'course', term: TERM,
    values: { courses: solid.length, min: lo?.slowdown ?? NaN, max: hi?.slowdown ?? NaN, min_city: lo?.city ?? '', max_city: hi?.city ?? '', ratio },
    guard,
    headline: 'The same distance, and *more than twice* the share at one end as at the other.',
    fallback: 'Sustained slowdown, course by course.',
    figure: lo && hi ? { value: `${whole(lo.slowdown)}–${whole(hi.slowdown)}`, unit: '%', sr: `${whole(lo.slowdown)} to ${whole(hi.slowdown)} percent` } : null,
    key: 'of finishes had a sustained slowdown, course by course',
  };
}

function coursesRange(): Nugget {
  return coursesRangeFrom([...coursePages().values()].map((p) => p.summary));
}

// ---------- A course page ----------

/** The hero: the share of finishes with a sustained slowdown, and how far it ran edition by edition. */
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
  return {
    id: 'course.slowdown', page: `/courses/${courseSlug(page?.city ?? city)}`, denominator: 'course', term: TERM,
    values: { city: page?.city ?? city, share, lo, hi, lo_year: loYear, hi_year: hiYear, editions: s?.editions ?? 0 },
    guard,
    headline: `Edition by edition, from ${pct(lo)} in ${loYear} to *${pct(hi)}* in ${hiYear}.`,
    fallback: years.length > 1 ? `Every ${city} edition, ${years[0]} to ${years[years.length - 1]}.` : years.length ? `The ${years[0]} edition.` : `${city}, edition by edition.`,
    figure: shareFigure(share), key: 'of finishes had a sustained slowdown',
  };
}

/** At a glance (1): the net drop or climb over the first 5K of the supplied route; "flat" within 10 m either way. */
function courseStart(ctx?: NuggetContext): CourseNugget {
  const page = pageFor(ctx);
  const net = page?.terrain?.[0]?.net_m ?? NaN;
  const has = Number.isFinite(net);
  const guard = has && Math.abs(net) >= NET_MIN_M;
  const word = net < 0 ? 'drops' : 'climbs';
  const unit = (u: 'mi' | 'km') => (u === 'mi' ? `${ft(net)} ft` : `${metres(net)} m`);
  return {
    id: 'course.start', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'none',
    values: { net_m: net },
    guard,
    headline: both((u) => `The first 5K ${word} *${unit(u)}*.`),
    fallback: has ? 'The first 5K is flat.' : 'The first 5K.',
    figure: guard ? { value: ft(net), unit: 'ft', sr: `${ft(net)} feet` } : has ? { value: 'Flat', sr: 'Flat' } : null,
    figureKm: guard ? { value: metres(net), unit: 'm', sr: `${metres(net)} metres` } : undefined,
    key: guard ? `${net < 0 ? 'down' : 'up'} over the first 5K` : 'over the first 5K',
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

/** At a glance (2): the median finisher's slowest 5K, against the section most courses slow most in. */
function courseLate(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const sections = readInsight<Courses>('courses.json').sections;
  const slowest = page?.summary.slowest_section;
  const i = slowest ? sections.indexOf(slowest) : -1;
  const { modal, counts, n } = slowestTally([...coursePages().values()].map((p) => p.summary));
  const m = modal ? sections.indexOf(modal) : -1;
  const same = slowest === modal;
  const k = modal ? (counts.get(modal) ?? 0) : 0;
  const guard = i >= 0 && m >= 0 && n >= 3;
  const name = sectionOf(i), usual = sectionOf(m);
  return {
    id: 'course.late', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'shape',
    values: { section: slowest ?? '', modal: modal ?? '', k, n },
    guard,
    headline: same ? `The slowest 5K is *${name}*, as on ${k} of ${n} courses.` : `The slowest 5K is *${name}*; on ${k} of ${n} courses it’s ${usual}.`,
    fallback: i >= 0 ? `The slowest 5K is ${name}.` : 'Where the median finish slowed most.',
    figure: i >= 0 ? { value: name, sr: name } : null,
    key: same ? `the slowest 5K, as on ${k} of ${n} courses` : `the slowest 5K; on ${k} of ${n} courses it’s ${usual}`,
  };
}

/**
 * At a glance (3): how often the course was picked out from its editions' pacing shapes alone. It is something that
 * "makes" the course only when its shape picked it out in at least half its editions.
 */
function courseShape(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const id = page?.summary.identified;
  const guard = !!id && id.editions >= 2 && id.correct * 2 >= id.editions;
  return {
    id: 'course.shape', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'shape',
    values: { correct: id?.correct ?? NaN, editions: id?.editions ?? NaN },
    guard,
    headline: id ? `Its pacing shape alone picked out the course in *${id.correct} of ${id.editions}* editions.` : '',
    fallback: 'A pacing shape of its own.',
    figure: guard ? { value: `${id!.correct} of ${id!.editions}`, sr: `${id!.correct} of ${id!.editions}` } : null,
    key: 'editions picked out by their pacing shape alone',
  };
}

/** #finish-times: the median finish, first edition to latest. */
function courseTimes(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const eds = page?.editions ?? [];
  const first = eds[0], last = eds[eds.length - 1];
  const guard = eds.length >= 2 && Math.abs(last.median_s - first.median_s) >= MOVED_S;
  const at = (e: { median_s: number }) => hm(e.median_s / 60);
  return {
    id: 'course.times', page: `/courses/${page?.slug ?? ''}#finish-times`, denominator: 'course',
    values: { first_year: first?.year ?? NaN, first_s: first?.median_s ?? NaN, last_year: last?.year ?? NaN, last_s: last?.median_s ?? NaN, editions: eds.length },
    guard,
    headline: first && last ? `The median finish moved from ${at(first)} in ${first.year} to *${at(last)}* in ${last.year}.` : '',
    fallback: eds.length >= 2 ? `The median finish: ${at(first)} in ${first.year}, ${at(last)} in ${last.year}.` : first ? `The median finish in ${first.year}: *${at(first)}*.` : 'Finish times by year.',
    figure: null,
  };
}

/** #elevation: the 5K section with the most climbing on the supplied route. */
function courseClimb(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const t = page?.terrain ?? null;
  const i = t ? t.reduce((b, s, j) => (s.gain_m > t[b].gain_m ? j : b), 0) : -1;
  const gain = t && i >= 0 ? t[i].gain_m : NaN;
  const guard = Number.isFinite(gain) && gain >= CLIMB_MIN_M;
  const unit = (u: 'mi' | 'km') => (u === 'mi' ? `${ft(gain)} ft` : `${metres(gain)} m`);
  return {
    id: 'course.climb', page: `/courses/${page?.slug ?? ''}#elevation`, denominator: 'none',
    values: { section: i, gain_m: gain },
    guard,
    headline: both((u) => `The biggest climb is *${sectionOf(i)}*: ${unit(u)}.`),
    fallback: both((u) => Number.isFinite(gain) ? `No 5K climbs more than ${unit(u)}.` : 'The route, start to finish.'),
    figure: null,
  };
}

/** #pacing: the pacing type whose share differs most from every course's. */
function courseTypes(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const shares = page?.types?.shares ?? [];
  const all = page?.archetypes ?? [];
  let i = -1;
  shares.forEach((v, j) => { if (all[j] && (i < 0 || Math.abs(v - all[j].share) > Math.abs(shares[i] - all[i].share))) i = j; });
  const here = i >= 0 ? shares[i] : NaN, every = i >= 0 ? all[i].share : NaN;
  const guard = i >= 0 && Math.abs(here - every) >= TYPE_GAP;
  const name = i >= 0 ? `${all[i].name}s` : '';
  return {
    id: 'course.types', page: `/courses/${page?.slug ?? ''}#pacing`, denominator: 'shape',
    values: { type: i >= 0 ? all[i].slug : '', here, every },
    guard,
    headline: `${here > every ? 'More' : 'Fewer'} *${name}* here: ${pct(here)}, against ${pct(every)} across every course.`,
    fallback: page?.types ? 'Six pacing types, here and across every course.' : `No pacing types for ${page?.display ?? 'this course'}.`,
    figure: null,
  };
}

/**
 * #slowdown: where the course's share sits among every other course (the strip shows them all), said only for a course
 * with three or more editions; "every other course" only when the count is all of them.
 */
function courseAmong(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const s = page?.summary;
  const others = [...coursePages().values()].map((p) => p.summary).filter((o) => o.city !== s?.city);
  const higher = s ? others.filter((o) => o.slowdown > s.slowdown).length : 0;
  const lower = s ? others.filter((o) => o.slowdown < s.slowdown).length : 0;
  const n = others.length;
  const fewer = higher >= lower;
  const count = fewer ? higher : lower;
  const guard = !!s && s.editions >= MIN_EDITIONS && n >= 5;
  return {
    id: 'course.among', page: `/courses/${page?.slug ?? ''}#slowdown`, denominator: 'course',
    values: { share: s?.slowdown ?? NaN, higher, lower, courses: n },
    guard,
    headline: `${fewer ? 'Fewer' : 'More'} sustained slowdowns than ${count === n ? '*every other course*' : `*${count} of ${n}* courses`}.`,
    fallback: `${page?.display ?? 'This course'} beside every course.`,
    figure: null,
  };
}

/** #goals: of finishes on the lead goal's pace through 20K here, the share that made the goal. */
function courseGoal(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const row = page?.goals.find((g) => g.goal === LEAD_GOAL)?.row ?? null;
  const guard = !!row && row.n >= 100;
  const g = goalText(LEAD_GOAL);
  return {
    id: 'course.goal', page: `/courses/${page?.slug ?? ''}#goals`, denominator: 'tool',
    values: { goal: LEAD_GOAL, under: row?.under ?? NaN, n: row?.n ?? 0 },
    guard,
    headline: `On ${g} pace through 20K, *${pct(row?.under ?? NaN)}* of ${page?.display ?? ''} finishes made ${g}.`,
    fallback: page?.goals.length ? `Goal times from 3:00 to 5:00 on ${page.display}.` : `No goal times for ${page?.display ?? 'this course'}.`,
    figure: row ? shareFigure(row.under) : null,
  };
}

/** #weather: the warmest and coolest race mornings (five or more °C apart), or the span of the mornings. */
function courseWeather(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const hc = page?.hotCool ?? null;
  const w = page?.weather ?? [];
  const guard = !!hc;
  const lo = w.length ? Math.min(...w.map((e) => e.temp)) : NaN, hi = w.length ? Math.max(...w.map((e) => e.temp)) : NaN;
  return {
    id: 'course.weather', page: `/courses/${page?.slug ?? ''}#weather`, denominator: 'course',
    values: hc ? { hot_year: hc.hot.year, hot_temp: hc.hot.temp, hot_share: hc.hot.slowdown, cool_year: hc.cool.year, cool_temp: hc.cool.temp, cool_share: hc.cool.slowdown, editions: w.length }
      : { editions: w.length, coolest: lo, warmest: hi },
    guard,
    headline: hc ? both((u) => `At *${temp(hc.hot.temp, u)}* in ${hc.hot.year}, ${pct(hc.hot.slowdown)} had a sustained slowdown. At ${temp(hc.cool.temp, u)} in ${hc.cool.year}, ${pct(hc.cool.slowdown)}.`) : '',
    fallback: both((u) => w.length >= 2 ? `Race mornings from ${temp(lo, u)} to ${temp(hi, u)}.` : w.length ? `One race morning: ${temp(lo, u)} at the start.` : 'Race mornings.'),
    figure: null,
  };
}

export const COURSE_NUGGETS: Record<string, Builder> = {
  'courses.index': coursesIndex,
  'courses.range': coursesRange,
  'course.slowdown': courseSlowdown,
  'course.start': courseStart,
  'course.late': courseLate,
  'course.shape': courseShape,
  'course.times': courseTimes,
  'course.climb': courseClimb,
  'course.types': courseTypes,
  'course.among': courseAmong,
  'course.goal': courseGoal,
  'course.weather': courseWeather,
};

/** The nuggets a course page builds with its city (index.ts CONTEXT_NUGGETS). */
export const COURSE_CONTEXT_NUGGETS = ['course.slowdown', 'course.start', 'course.late', 'course.shape', 'course.times', 'course.climb', 'course.types', 'course.among', 'course.goal', 'course.weather'] as const;
