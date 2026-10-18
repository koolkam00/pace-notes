/**
 * Nuggets for the tools (WP4; the redesign spec, sections 5 and 7.13) and the runner page (WP6's runner.yours). A tool's
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
import { placeholder, type Builder } from './build';
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
 * Of finishes on the goal's pace through 20K, on every published course pooled, the share that made the goal: "Of 100
 * finishes on 4:00 pace through 20K, 15 made 4:00." The guard holds while fewer than half made it (the sentence's point
 * is how few did); otherwise the share is stated plainly.
 */
export function planGoalFrom(rows: CourseGoalRow[], goal: number = GOAL): Nugget {
  const share = goalShare(rows, goal);
  const g = hm(goal);
  const made = share ? Math.round(share.under * 100) : null;
  return {
    id: 'plan.goal', page: '/tools/plan', denominator: 'tool',
    values: share ? { goal, n: share.n, under: share.under, courses: share.courses } : { goal },
    guard: share !== null && share.under < 0.5,
    headline: `Of 100 finishes on ${g} pace through 20K, *${made}* made ${g}.`,
    fallback: share ? `${pct(share.under)} of finishes on ${g} pace through 20K made ${g}.` : 'Plan your race: a course, a goal and a pace band.',
    figure: share ? { value: pct(share.under).replace('%', ''), unit: '%', sr: spokenPct(share.under) } : null,
    key: `of finishes on ${g} pace at 20K made ${g}`,
  };
}

// ---------- Chapter 04 · the race-day projector ----------

/** The mat the projector opens on (its example runner's 25K). */
const PROJECTOR_MAT = 25;

/**
 * Finishes on the goal's even pace at the projector's opening mat, all courses: the window, in whole minutes, that
 * holds their 10th to 90th percentile finish, widened as the tool widens it (the low end down to the minute, the high
 * end up). "80% of finishes on 4:00 pace at 25K ended within a 29-minute window." The goal's pace band is the one whose
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
  return {
    id: 'projector.range', page: '/tools/projector', denominator: 'tool',
    values: q ? { goal, mat, band, n, p10: q[i10], p50: i50 >= 0 ? q[i50] : NaN, p90: q[i90], spread } : { goal, mat },
    guard: ok,
    headline: `80% of finishes on ${g} pace at ${at} ended within a *${spread}-minute* window.`,
    fallback: q ? `Finishes on ${g} pace at ${at} ended from ${hm(lo)} to ${hm(hi)}.` : 'From a tracker time at any mat, the finishes that followed.',
    figure: ok ? { value: String(spread), unit: 'min', sr: `${spread} minutes` } : null,
    key: `finish window for 80% on ${g} pace at ${at}`,
  };
}

// ---------- Chapter 10 · the split check ----------

/** The finish of the split check's example race, in seconds (its ninth time). */
const SPLIT_FINISH = SPLIT_EXAMPLE.split(',')[8].split(':').reduce((a, v) => a * 60 + Number(v), 0);

/**
 * The finishes the split check compares its example race with (the pace band's group for the whole minute three above
 * the finish, all courses, as lib/report-shared windowCheck picks it): at the 20K mat, how far ahead the median of those
 * that later had a sustained slowdown was of the median of those that held pace. "Of finishes from 4:01 to 4:05, those
 * that later slowed passed 20K 7:48 ahead of those that held pace." The guard holds while both groups have 100
 * finishes, the gap is at least a minute, and the two medians finished within a minute of each other (the key says so).
 */
export function splitCheckMatsFrom(shard: Pick<PaceBandShard, 'window_s' | 'groups'> | null, finish: number = SPLIT_FINISH): Nugget {
  const minute = Math.floor(finish / 60) + 3;
  const held = shard ? cellOf(shard.groups.held, minute) : null;
  const slow = shard ? cellOf(shard.groups.slowdown, minute) : null;
  const lo = minute - (shard?.window_s ?? 300) / 60;
  const hi = minute - 1;
  const gap20 = held && slow ? held.e50[3] - slow.e50[3] : NaN;
  const finishGap = held && slow ? slow.e50[8] - held.e50[8] : NaN;
  const ok = held !== null && slow !== null && held.n >= 100 && slow.n >= 100 && gap20 >= 60 && Math.abs(finishGap) < 60;
  return {
    id: 'splitcheck.mats', page: '/tools/split-check', denominator: 'tool',
    values: held && slow ? { finish, minute, held_n: held.n, slow_n: slow.n, held20: held.e50[3], slow20: slow.e50[3], gap20, finish_gap: finishGap } : { finish, minute },
    guard: ok,
    headline: `Of finishes from ${hm(lo)} to ${hm(hi)}, those that later slowed passed 20K *${ms(gap20)} ahead* of those that held pace.`,
    fallback: held && slow ? `Finishes from ${hm(lo)} to ${hm(hi)}, mat by mat: those that held pace and those that later slowed.` : 'Check your splits against finishes at the same time.',
    figure: ok ? { value: ms(gap20), sr: spokenTime(gap20) } : null,
    key: 'ahead at 20K, for the same finish',
    term: '/methodology#sustained-slowdown',
  };
}

// ---------- Chapter 09 · the weather match ----------

/**
 * The weather match's example morning (its example forecast's whole °C, the page's default ±2 °C window) against its
 * fixed 8–12 °C reference, for finishes in the 5–20K pace band that holds the example goal's even pace (4:00): the share
 * with a sustained slowdown in each. "At 4:00 pace, 45% of finishes on 64°F mornings had a sustained slowdown, against
 * 31% on 46–54°F mornings." The guard holds while both rows are published with 100 finishes and the example morning's share is
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
    key: `sustained slowdown at ${g} pace on a warm race morning`,
    term: '/methodology#sustained-slowdown',
  };
}

const tool = (id: NuggetId, page: string, line: string, figure: { value: string; sr: string } | null = null, key?: string): Builder => () =>
  placeholder({ id, page, denominator: 'tool', values: {}, guard: true, headline: line, fallback: line, figure, key });

export const TOOL_NUGGETS: Record<string, Builder> = {
  'runner.yours': tool('runner.yours', '/runners', 'Find a past race and see it mat by mat.', { value: 'Yours', sr: 'Yours' }, 'nine mats, one race'),
  'splitcheck.mats': () => splitCheckMatsFrom(optional<PaceBandShard>('tools/pace-band/all/all.json')),
  'projector.range': () => projectorRangeFrom(optional<ProjectorShard>(`tools/projector/all/${PROJECTOR_MAT}.json`), optional<ProjectorIndex>('tools/projector.json')?.quantiles ?? []),
  'weathermatch.mornings': () => weatherMatchMorningsFrom(optional<WeatherMatch>('tools/weather-match.json')),
  'plan.goal': () => planGoalFrom(optional<CourseGoal>('tools/course-goal.json')?.rows ?? []),
};
