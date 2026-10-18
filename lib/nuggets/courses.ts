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
import { coursePage, coursePages, displayCity as cityName, heldEditions, type CoursePageData } from '@/lib/course-page';
import { readInsight } from '@/lib/insights-server';
import type { Courses } from '@/lib/insights';
import { courseSlug } from '@/lib/tools/links';
import { count, countWord, hm, pct, sectionLabel, temp } from './format';
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
 * The first 5K "drops" or "climbs" from 10 m net either way. A 5K section is "the biggest climb" from 30 m (about 100 ft)
 * of ascent: on a flat course the steepest 5K's 18 m is no climb a runner would name, and a heading about it beside a
 * slow 5K would read as its cause.
 */
export const NET_MIN_M = 10;
export const CLIMB_MIN_M = 30;
/**
 * The glance's rows say only what sets a course apart: a 5K section "parts" from the typical course from 3 points of
 * pace against the course's own average (2 points rounds to look like 3 as whole percentages, and sets nothing apart).
 */
export const SIGNATURE_MIN = 3;
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
 * The index's reading: the spread of sustained slowdown across courses with three or more editions, each course's share
 * in its average edition (the course pages' figure). "More than twice" needs the highest share at least twice the lowest.
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
    headline: `From ${lo ? cityName(lo.city) : ''} to ${hi ? cityName(hi.city) : ''}: the same distance, *more than twice* the share.`,
    fallback: 'Sustained slowdown, course by course.',
    figure: lo && hi ? { value: `${whole(lo.slowdown)}–${whole(hi.slowdown)}`, unit: '%', sr: `${whole(lo.slowdown)} to ${whole(hi.slowdown)} percent` } : null,
    key: 'of finishes in the average edition had a sustained slowdown, course by course',
  };
}

function coursesRange(): Nugget {
  return coursesRangeFrom([...coursePages().values()].map((p) => p.summary));
}

// ---------- A course page ----------

/**
 * The words under a course hero's figure, up to the term: the figure averages the editions' shares, so with three or
 * more editions they name the average edition; with two, the average of the two; with one, its year (no averaging
 * happened). course.slowdown's key is these words and the term.
 */
export function heroKeyLead(editions: number, year: number | undefined): string {
  return editions === 1 ? `of finishes in ${year} had a` : editions === 2 ? 'of finishes in its two editions, on average, had a' : 'of finishes in the average edition had a';
}

/**
 * The hero: the share of finishes with a sustained slowdown in the average edition (summary.slowdown averages the
 * editions' shares, so the words name the average edition, never a share pooled over every finish), and how far it ran
 * edition by edition.
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
  return {
    id: 'course.slowdown', page: `/courses/${courseSlug(page?.city ?? city)}`, denominator: 'course', term: TERM,
    values: { city: page?.city ?? city, share, lo, hi, lo_year: loYear, hi_year: hiYear, editions: s?.editions ?? 0 },
    guard,
    headline: `Edition by edition, between ${pct(lo)} (${loYear}) and *${pct(hi)}* (${hiYear}).`,
    fallback: years.length > 1 ? `Every ${city} edition, ${years[0]} to ${years[years.length - 1]}.` : years.length ? `The ${years[0]} edition.` : `${city}, edition by edition.`,
    figure: shareFigure(share), key: `${heroKeyLead(s?.editions ?? 0, years[0])} sustained slowdown`,
  };
}

/**
 * At a glance (1): the net change over the first 5K of the supplied route, said only from 10 m either way (a flat start
 * sets no course apart). Net, not climb: the elevation section gives each 5K's climb.
 */
function courseStart(ctx?: NuggetContext): CourseNugget {
  const page = pageFor(ctx);
  const net = page?.terrain?.[0]?.net_m ?? NaN;
  const has = Number.isFinite(net);
  const guard = has && Math.abs(net) >= NET_MIN_M;
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
  return {
    id: 'course.late', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'shape',
    values: { section: slowest ?? '', modal: modal ?? '', k, n },
    guard,
    headline: `The slowest 5K is *${name}*; on ${k} of the ${n} courses with 5K splits it’s ${usual}.`,
    fallback: i >= 0 && m >= 0 ? `The slowest 5K is ${name}, as on ${k} of the ${n} courses with 5K splits.` : i >= 0 ? `The slowest 5K is ${name}.` : 'Where the median finish slowed most.',
    figure: i >= 0 ? { value: name, sr: name } : null,
    key: `the slowest 5K; on ${k} of the ${n} courses with 5K splits, it’s ${usual}`,
  };
}

/**
 * A section's pace against its course's own average, in words: on this course "4% slower than its own average" (or "at
 * its own average pace"); on the typical course "the typical course runs this 5K 1% quicker" (or "at its average pace").
 */
function paceWords(v: number, own: boolean): string {
  const n = Math.round(Math.abs(v));
  const side = v > 0 ? 'slower' : 'quicker';
  if (own) return n === 0 ? 'at its own average pace' : `${n}% ${side} than its own average`;
  return n === 0 ? 'the typical course runs this 5K at its average pace' : `the typical course runs this 5K ${n}% ${side}`;
}

/**
 * At a glance (3): the 5K section where the course's pacing parts most from the typical course's (each against its own
 * average pace), said from 3 points apart on a course with three or more editions, in words: "1% quicker than its
 * average pace; 4% slower on the typical course". Where no section parts that far, the course "paces much like the
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
  const guard = solid && Math.abs(pts) >= SIGNATURE_MIN && paceWords(here, true) !== paceWords(typical, true);
  const display = page?.display ?? 'This course';
  const name = sectionOf(i);
  const key = `${paceWords(here, true)}; ${paceWords(typical, false)}`;
  return {
    id: 'course.signature', page: `/courses/${page?.slug ?? ''}#at-a-glance`, denominator: 'shape',
    values: { section: s?.signature_section ?? '', here, typical, points: pts, editions: s?.editions ?? 0, typical_like: solid && Math.abs(pts) < SIGNATURE_MIN ? 1 : 0 },
    guard,
    headline: `${display}’s ${name}: *${paceWords(here, true)}*; ${paceWords(typical, false)}.`,
    fallback: solid ? `${display} paces *much like the typical course*, 5K by 5K.` : 'Its pacing, 5K by 5K.',
    figure: guard ? { value: name, sr: name } : null,
    key: solid ? key : undefined,
  };
}

/**
 * #finish-times: the range of the median finish across the editions (three or more), low end first, each end a year the
 * source policy neither holds nor copies; a range under a minute says the median held. Two editions: first to latest.
 */
function courseTimes(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const eds = page?.editions ?? [];
  const at = (e: { median_s: number }) => hm(e.median_s / 60);
  const held = heldEditions();
  const named = eds.filter((e) => !!page && !held.has(`${page.city}|${e.year}`));
  const lo = named.length ? named.reduce((a, b) => (b.median_s < a.median_s ? b : a)) : undefined;
  const hi = named.length ? named.reduce((a, b) => (b.median_s > a.median_s ? b : a)) : undefined;
  const first = eds[0], last = eds[eds.length - 1];
  const guard = eds.length >= 3 && !!lo && !!hi && hi.median_s - lo.median_s >= MOVED_S && at(lo) !== at(hi);
  return {
    id: 'course.times', page: `/courses/${page?.slug ?? ''}#finish-times`, denominator: 'course',
    values: { lo_year: lo?.year ?? NaN, lo_s: lo?.median_s ?? NaN, hi_year: hi?.year ?? NaN, hi_s: hi?.median_s ?? NaN, editions: eds.length },
    guard,
    headline: lo && hi ? `The median finish ranged from ${at(lo)} in ${lo.year} to *${at(hi)}* in ${hi.year}.` : '',
    // Within a minute the median "held"; two editions read first to latest.
    fallback: eds.length >= 3 && lo && hi
      ? (at(lo) === at(hi) ? `The median finish was *${at(lo)}* in every edition.` : `The median finish held within a minute: ${at(lo)} to *${at(hi)}*.`)
      : eds.length === 2
        ? (at(first) === at(last) ? `The median finish was *${at(first)}* in both ${first.year} and ${last.year}.` : `The median finish was ${at(first)} in ${first.year}, *${at(last)}* in ${last.year}.`)
        : first ? `The median finish in ${first.year}: *${at(first)}*.` : 'Finish times by year.',
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
  // The type's name in lower case mid-sentence ("Fewer early drifters here").
  const name = i >= 0 ? `${all[i].name.toLowerCase()}s` : '';
  return {
    id: 'course.types', page: `/courses/${page?.slug ?? ''}#pacing`, denominator: 'shape',
    values: { type: i >= 0 ? all[i].slug : '', here, every },
    guard,
    headline: `${here > every ? 'More' : 'Fewer'} *${name}* here: ${pct(here)}, against ${pct(every)} across every course.`,
    fallback: page?.types ? `Paced much like every course: no type more than ${Math.round(TYPE_GAP * 100)} points apart.` : `No pacing types for ${page?.display ?? 'this course'}.`,
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
  const all = solid ? 'any other course' : 'every course';
  // The scope (three or more editions) is the strip's key; the sentence keeps it only where it would otherwise claim
  // every course, or where a course of fewer editions names the courses it is set against.
  const than = count === n ? `${fewer ? 'lower' : 'higher'} than on *${nb(all)}* with three or more editions`
    : solid ? `${fewer ? 'lower' : 'higher'} than on *${nb(`${count} of ${n}`)}* other courses`
      : `${fewer ? 'lower' : 'higher'} than on *${nb(`${count} of the ${n}`)}* courses with three or more editions`;
  const from = solid ? '' : `, from ${countWord(s?.editions ?? 0)} ${s?.editions === 1 ? 'edition' : 'editions'}`;
  return {
    id: 'course.among', page: `/courses/${page?.slug ?? ''}#slowdown`, denominator: 'course',
    values: { share: s?.slowdown ?? NaN, higher, lower, courses: n, editions: s?.editions ?? 0, middle: middle ? 1 : 0 },
    guard,
    headline: middle ? `${name}’s ${share}: *${nb('near the middle')}* of ${n + 1} courses.` : `${name}’s ${share}${from}: ${than}.`,
    fallback: `${name} beside every course.`,
    figure: null,
  };
}

/** A course's goal share "parts" from every course's from 3 whole percentage points; closer, it is about the same. */
export const GOAL_GAP_MIN = 3;

/**
 * #goals: of finishes on the lead goal's pace at 20K here, the share that made the goal (the denominator said first),
 * against the same share across every course (the rows pooled by finishes, lib/course-page.ts pooledGoal), so a runner
 * can tell a hard course from a kind one. Within 3 points the two are "about the same".
 */
function courseGoal(ctx?: NuggetContext): Nugget {
  const page = pageFor(ctx);
  const line = page?.goals.find((g) => g.goal === LEAD_GOAL) ?? null;
  const row = line?.row ?? null;
  const every = line?.every ?? null;
  const guard = !!row && row.n >= 100;
  const g = goalText(LEAD_GOAL);
  const gap = row && every ? Math.abs(Math.round(row.under * 100) - Math.round(every.under * 100)) : 0;
  const against = !every ? '' : gap >= GOAL_GAP_MIN ? `, against ${pct(every.under)} across every course` : ', about the same as across every course';
  return {
    id: 'course.goal', page: `/courses/${page?.slug ?? ''}#goals`, denominator: 'tool',
    values: { goal: LEAD_GOAL, under: row?.under ?? NaN, n: row?.n ?? 0, every: every?.under ?? NaN, every_n: every?.n ?? 0 },
    guard,
    headline: `Of ${page?.display ?? ''} finishes on ${g} pace at 20K, *${pct(row?.under ?? NaN)}* made ${g}${against}.`,
    fallback: page?.goals.length ? `Goal times from 3:00 to 5:00 on ${page.display}.` : `No goal times for ${page?.display ?? 'this course'}.`,
    figure: row ? shareFigure(row.under) : null,
  };
}

/** #weather: the warmest and coolest race mornings (five or more °C apart), or the span of the mornings; a share both mornings round to is said once. */
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
    // Two mornings whose shares round alike say the share once: the point is that it did not move.
    headline: hc ? both((u) => pct(hc.hot.slowdown) === pct(hc.cool.slowdown)
      ? `At ${temp(hc.hot.temp, u)} in ${hc.hot.year} and at ${temp(hc.cool.temp, u)} in ${hc.cool.year}, the same ${pct(hc.hot.slowdown)} had a sustained slowdown.`
      : `At *${temp(hc.hot.temp, u)}* in ${hc.hot.year}, ${pct(hc.hot.slowdown)} had a sustained slowdown. At ${temp(hc.cool.temp, u)} in ${hc.cool.year}, ${pct(hc.cool.slowdown)}.`) : '',
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
