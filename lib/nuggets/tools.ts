/**
 * Nuggets for the tools (WP4; the redesign spec, sections 5 and 7.13). A tool's
 * reading is the Pace Notes data nugget it leads with for its example inputs (a 4:00 goal on every course), read from the
 * verified tool files with a guard for what the sentence asserts and a neutral fallback. Each builder has a pure
 * `…From(data)` twin, which the tool itself also uses for the visitor's own inputs, and which
 * scripts/verify-nuggets.cjs (through scripts/nuggets/tools.cjs) recounts and renders on fixtures.
 *
 * No literal selectors: the example goal is the analyses' EXAMPLE_PROFILE goal, and rows are chosen by that goal and by
 * the bands the files define, never by a course name or an index.
 */
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { CourseGoal, CourseGoalRow, PaceBandShard, ProjectorIndex, ProjectorShard, WeatherMatch, WeatherRow } from '@/lib/tools/data';
import { cellOf } from '@/lib/tools/pace-band-data';
import { SPLIT_EXAMPLE } from '@/lib/tools/splits';
import { WEATHER_EXAMPLE, WEATHER_REFERENCE } from '@/lib/tools/weather';
import { goalShare } from '@/lib/tools/plan';
import { hm, matLabel, ms, pct, spokenPct, spokenTime, temp } from './format';
import type { Builder } from './build';
import type { Nugget, NuggetId } from './types';

/** The example goal every tool opens on, in minutes (4:00). */
const GOAL = EXAMPLE_PROFILE.goal;

/** Read an optional tool file: null when it is not in this build's verified manifest. */
function optional<T>(name: string): T | null {
  try {
    return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
  } catch {
    return null;
  }
}

// ---------- Chapter 11 · the race planner ----------

/**
 * Of finishes whose 5–20K pace was within the course-goal file's tolerance (2%) of the goal's even pace, on every
 * published course pooled, the share that made the goal: "Of 100 finishes within 2% of 4:00 pace through 20K, 14 made
 * 4:00." The window is named in the sentence and the key, so "on 4:00 pace at 20K" never means two groups on two pages
 * (the checkpoint analysis and the projector use their own windows, and say so). The guard holds while fewer than half
 * made it (the sentence's point is how few did); otherwise the share is stated plainly.
 */
export function planGoalFrom(rows: CourseGoalRow[], goal: number = GOAL, tolerance = 0.02): Nugget {
  const share = goalShare(rows, goal);
  const g = hm(goal);
  const made = share ? Math.round(share.under * 100) : null;
  const near = `within ${Math.round(tolerance * 100)}% of ${g} pace through 20K`;
  return {
    id: 'plan.goal', page: '/tools/plan', denominator: 'tool',
    values: share ? { goal, tolerance, n: share.n, under: share.under, courses: share.courses } : { goal, tolerance },
    guard: share !== null && share.under < 0.5,
    headline: `Of 100 finishes ${near}, *${made}* made ${g}.`,
    fallback: share ? `${pct(share.under)} of finishes ${near} made ${g}.` : 'Plan your race: a course, a goal and a pace band.',
    figure: share ? { value: pct(share.under).replace('%', ''), unit: '%', sr: spokenPct(share.under) } : null,
    key: `of finishes ${near} made ${g}`,
  };
}

/**
 * The planner's reading in the chain (its contents row and the cards into it): the course it asks a runner to pick,
 * counted. Of finishes within the course-goal file's tolerance of the goal's even pace through 20K, the share that made
 * the goal on each listed course with 100 such finishes, lowest to highest: "7–27% made 4:00 from within 2% of its pace
 * through 20K, course by course." The pooled share (plan.goal) is the planner's own first line and chapter 04's
 * checkpoint has a share of its own, so the card into the journey's last page says what only the planner adds: the
 * course moves it. The guard holds for two courses at least five points apart.
 */
export function planCoursesFrom(data: Pick<CourseGoal, 'rows' | 'courses' | 'tolerance'> | null, goal: number = GOAL): Nugget {
  const g = hm(goal);
  const listed = new Set((data?.courses ?? []).map((c) => c.city));
  const at = (data?.rows ?? []).filter((r) => r.goal === goal && listed.has(r.city) && r.n >= 100);
  const lo = at.length ? at.reduce((a, b) => (b.under < a.under ? b : a)) : null;
  const hi = at.length ? at.reduce((a, b) => (b.under > a.under ? b : a)) : null;
  const whole = (v: number) => Math.round(v * 100);
  const ok = !!lo && !!hi && at.length >= 2 && whole(hi.under) - whole(lo.under) >= 5;
  const tol = Math.round((data?.tolerance ?? 0.02) * 100);
  return {
    id: 'plan.courses', page: '/tools/plan', denominator: 'tool',
    values: lo && hi ? { goal, courses: at.length, low: lo.under, high: hi.under, low_city: lo.city, high_city: hi.city } : { goal },
    guard: ok,
    headline: ok ? `Of finishes within ${tol}% of ${g} pace through 20K, *${whole(lo!.under)}–${whole(hi!.under)}%* made ${g}, course by course.` : '',
    fallback: 'Plan your race: a course, a goal and a pace band.',
    figure: ok ? { value: `${whole(lo!.under)}–${whole(hi!.under)}`, unit: '%', sr: `${whole(lo!.under)} to ${whole(hi!.under)} percent` } : null,
    key: `made ${g} from within ${tol}% of its pace through 20K, course by course`,
  };
}

// ---------- Chapter 04 · the race-day projector ----------

/** The mat the projector opens on (its example runner's 25K). */
const PROJECTOR_MAT = 25;

/**
 * Finishes on the goal's even pace at the projector's opening mat, all courses: the window, in whole minutes, that
 * holds their 10th to 90th percentile finish, widened as the tool widens it (the low end down to the minute, the high
 * end up). "80% of finishes on course for 3:58–4:00 at 25K ended within a 29-minute window." The goal's band is the one whose
 * top is the goal (3:58–4:00 for 4:00). The guard holds while the group has at least 100 finishes.
 */
export function projectorRangeFrom(shard: Pick<ProjectorShard, 'band_s' | 'cells'> | null, quantiles: number[], goal: number = GOAL, mat: number = PROJECTOR_MAT): Nugget {
  const g = hm(goal);
  const at = matLabel(mat);
  const cells = shard?.cells.all;
  const band = shard ? goal * 60 - shard.band_s : NaN;
  const i = cells ? cells.b.indexOf(band) : -1;
  const i10 = quantiles.findIndex((p) => Math.abs(p - 0.1) < 1e-9);
  const i50 = quantiles.findIndex((p) => Math.abs(p - 0.5) < 1e-9);
  const i90 = quantiles.findIndex((p) => Math.abs(p - 0.9) < 1e-9);
  const q = cells && i >= 0 && i10 >= 0 && i90 >= 0 ? cells.q[i] : null;
  const n = cells && i >= 0 ? cells.n[i] : 0;
  const lo = q ? Math.floor(q[i10] / 60) : NaN;
  const hi = q ? Math.ceil(q[i90] / 60) : NaN;
  const spread = hi - lo;
  const ok = q !== null && n >= 100 && spread > 0;
  // The projector's own window, named wherever the group is (never "on 4:00 pace", which another page uses for another
  // group): finishes whose even-pace projection at the mat fell in the band, 3:58–4:00 for 4:00.
  const band_ = shard ? `${hm(goal - shard.band_s / 60)}–${g}` : g;
  return {
    id: 'projector.range', page: '/tools/projector', denominator: 'tool',
    values: q ? { goal, mat, band, n, p10: q[i10], p50: i50 >= 0 ? q[i50] : NaN, p90: q[i90], spread } : { goal, mat },
    guard: ok,
    headline: `80% of finishes on course for ${band_} at ${at} ended within a *${spread}-minute* window.`,
    fallback: q ? `Finishes on course for ${band_} at ${at} ended from ${hm(lo)} to ${hm(hi)}.` : 'From a tracker time at any mat, the finishes that followed.',
    figure: ok ? { value: String(spread), unit: '\u00a0min', sr: `${spread} minutes` } : null,
    key: `apart at the finish: the middle 80% of those on course for ${band_} at ${at}`,
  };
}

// ---------- Chapter 10 · the split check ----------

/** The finish of the split check's example race, in seconds (its ninth time). */
const SPLIT_FINISH = SPLIT_EXAMPLE.split(',')[8].split(':').reduce((a, v) => a * 60 + Number(v), 0);

/**
 * The split check's one data beat for its example race: of the finishes it compares the example with (the pace band's
 * all-course group for the whole minute three above the finish, as lib/report-shared windowCheck picks it), the share
 * with a sustained slowdown. "Of finishes from 4:01 to 4:05, 23% had a sustained slowdown." The page draws the same
 * share as 100 dots for the same window, so the number a reader taps on the chapter row is the one the page shows. The
 * guard holds while the window has 100 finishes and a published share.
 */
export function splitCheckShareFrom(shard: Pick<PaceBandShard, 'window_s' | 'groups'> | null, finish: number = SPLIT_FINISH): Nugget {
  const minute = Math.floor(finish / 60) + 3;
  const all = shard ? cellOf(shard.groups.all, minute) : null;
  const slow = shard ? cellOf(shard.groups.slowdown, minute) : null;
  const sd = all ? all.sd ?? (slow ? slow.n / all.n : NaN) : NaN;
  const lo = minute - (shard?.window_s ?? 300) / 60;
  const hi = minute - 1;
  const ok = all !== null && all.n >= 100 && Number.isFinite(sd) && sd > 0 && sd < 1;
  const range = `from ${hm(lo)} to ${hm(hi)}`;
  return {
    id: 'splitcheck.share', page: '/tools/split-check', denominator: 'tool',
    values: all ? { finish, minute, n: all.n, sd } : { finish, minute },
    guard: ok,
    headline: `Of finishes ${range}, *${pct(sd)}* had a sustained slowdown.`,
    fallback: all ? `Finishes ${range}, mat by mat.` : 'Check your splits against finishes at the same time.',
    figure: ok ? { value: pct(sd).replace('%', ''), unit: '%', sr: spokenPct(sd) } : null,
    // The key stands alone, with the window it counts: it is read on home, the contents and the weather match's card,
    // where no example sits above it (round 5: "the example’s 4:03" named an example none of them shows).
    key: `of finishes ${range} had a sustained slowdown`,
    term: '/methodology#sustained-slowdown',
  };
}

// ---------- Chapter 09 · the weather match ----------

/**
 * The weather match's example morning (its example forecast's whole °C, the page's default ±2 °C window) against its
 * fixed 6–10 °C reference, for finishes in the 5–20K pace band that holds the example goal's even pace (4:00): the share
 * with a sustained slowdown in each. "At 4:00 pace, 45% of finishes on 64°F mornings had a sustained slowdown, against
 * 29% on 43–50°F mornings." The guard holds while both rows are published with 100 finishes and the example morning's share is
 * at least two points above the reference's.
 */
export function weatherMatchMorningsFrom(data: Pick<WeatherMatch, 'rows' | 'pace_range_s' | 'pace_step_s'> | null, goal: number = GOAL): Nugget {
  const g = hm(goal);
  const c = Math.round(WEATHER_EXAMPLE.temp.c);
  const hw = WEATHER_REFERENCE.hw;
  const ref = { c: WEATHER_REFERENCE.c, lo: WEATHER_REFERENCE.c - WEATHER_REFERENCE.hw, hi: WEATHER_REFERENCE.c + WEATHER_REFERENCE.hw };
  const pace = (goal * 60) / 42.195;
  const [lo, hi] = data?.pace_range_s ?? [NaN, NaN];
  const step = data?.pace_step_s ?? NaN;
  const band = pace >= lo && pace < hi ? lo + step * Math.floor((pace - lo) / step) : NaN;
  const find = (centre: number): WeatherRow | null => data?.rows.find((r) => r.c === centre && r.hw === hw && r.pace === band) ?? null;
  const mine = find(c);
  const base = find(ref.c);
  const ok = mine !== null && base !== null && mine.n >= 100 && base.n >= 100 && mine.sd >= base.sd + 0.02;
  const both = (f: (u: 'mi' | 'km') => string) => ({ mi: f('mi'), km: f('km') });
  return {
    id: 'weathermatch.mornings', page: '/tools/weather-match', denominator: 'tool',
    values: mine && base ? { goal, c, hw, band, n: mine.n, sd: mine.sd, ref_c: ref.c, ref_n: base.n, ref_sd: base.sd } : { goal, c, hw },
    guard: ok,
    headline: both((u) => `At ${g} pace, *${pct(mine?.sd ?? NaN)}* of finishes on ${temp(c, u)} mornings had a sustained slowdown, against ${pct(base?.sd ?? NaN)} on ${temp(ref.lo, u).replace(/°[CF]$/, '')}–${temp(ref.hi, u)} mornings.`),
    fallback: mine ? both((u) => `At ${g} pace, ${pct(mine.sd)} of finishes on ${temp(c, u)} mornings had a sustained slowdown.`) : 'Race-morning weather, matched to past races at your pace.',
    figure: ok ? { value: pct(mine!.sd).replace('%', ''), unit: '%', sr: spokenPct(mine!.sd) } : null,
    key: `had a sustained slowdown at ${g} pace on a warm morning, against ${pct(base?.sd ?? NaN)} on a cool one`,
    term: '/methodology#sustained-slowdown',
  };
}

export const TOOL_NUGGETS: Record<string, Builder> = {
  'splitcheck.share': () => splitCheckShareFrom(optional<PaceBandShard>('tools/pace-band/all/all.json')),
  'projector.range': () => projectorRangeFrom(optional<ProjectorShard>(`tools/projector/all/${PROJECTOR_MAT}.json`), optional<ProjectorIndex>('tools/projector.json')?.quantiles ?? []),
  'weathermatch.mornings': () => weatherMatchMorningsFrom(optional<WeatherMatch>('tools/weather-match.json')),
  'plan.goal': () => planGoalFrom(optional<CourseGoal>('tools/course-goal.json')?.rows ?? []),
  'plan.courses': () => planCoursesFrom(optional<CourseGoal>('tools/course-goal.json')),
};
