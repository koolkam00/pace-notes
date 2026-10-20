/**
 * The race planner's reading of its goal and of the published course-goal rows (tools/course-goal.json). Pure, so the
 * planner, the course chooser and scripts/verify-tools.cjs share one rule.
 */
import type { CourseContext, CourseGoal, CourseGoalRow } from '@/lib/tools/data';
import { fmtGoal } from '@/lib/tools/pace-band-data';
import { formatHM, parseDuration } from '@/lib/tools/time';
import { count } from '@/lib/viz/format';

export const COURSE_GOAL_FILE = 'tools/course-goal.json';
/** The goals the planner takes: the pace band's 1:30 to 8:00. */
export const PLAN_GOAL_MIN_S = 90 * 60;
export const PLAN_GOAL_MAX_S = 480 * 60;
export const GOAL_PROBLEM = 'Pick a goal between 1:30 and 8:00.';
export const EMPTY_GOAL_PROBLEM = 'Type a goal between 1:30 and 8:00, such as 3:30.';

/** A goal from the address or the field: whole seconds from 1:30 to 8:00, else the message to show (and any readable time). */
export function readPlanGoal(text: string): { seconds: number | null; read: number | null; problem: string | null } {
  if (!text.trim()) return { seconds: null, read: null, problem: EMPTY_GOAL_PROBLEM };
  const parsed = parseDuration(text, 'race');
  const read = parsed === null ? null : Math.round(parsed);
  if (read === null || read < PLAN_GOAL_MIN_S || read > PLAN_GOAL_MAX_S) return { seconds: null, read, problem: GOAL_PROBLEM };
  return { seconds: read, read, problem: null };
}

/**
 * The published goal nearest to a goal, on the course-goal file's grid (whole minutes), and whether it differs from the
 * goal; null when the goal is more than half a step outside the grid.
 */
export function publishedGoal(seconds: number, range: [number, number], step: number): { minutes: number; rounded: boolean } | null {
  const exact = seconds / 60;
  if (exact < range[0] - step / 2 || exact > range[1] + step / 2) return null;
  const minutes = Math.min(range[1], Math.max(range[0], Math.round(exact / step) * step));
  return { minutes, rounded: Math.abs(minutes * 60 - seconds) >= 1 };
}

/** "Results are published every 5 minutes; showing 3:30 for your 3:32." */
export const roundedNote = (minutes: number, seconds: number, step: number) =>
  `Results are published every ${step} minutes; showing ${formatHM(minutes * 60)} for your ${fmtGoal(seconds)}.`;

/** Plain words for a course-goal `unavailable[]` reason, as the course chooser prints it. Small finish counts are never printed. */
export function courseGoalReason(reason: string, minEditions: number): string {
  const m = reason.match(/^(\d+) editions? with at least (\d+) finishes at this pace; (\d+) finishes$/);
  if (!m) return reason;
  const [ed, per, n] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ed === 0) return `No edition had ${per} or more finishes at this pace.`;
  if (ed < minEditions) return `${ed === 1 ? 'Only one edition' : `Only ${ed} editions`} had ${per} or more finishes at this pace${n >= 100 ? ` (${count(n)} finishes)` : ''}; ${minEditions} are needed.`;
  return `${ed} editions had ${per} or more finishes at this pace, but fewer than 100 finishes in all.`;
}

/** A course that has editions in the data but too few for any goal row: the course chooser's wording. */
export const tooFewEditions = (editions: number, minEditions: number) =>
  `${editions === 1 ? 'Only one edition' : `Only ${editions} editions`} passed the data screens; ${minEditions} are needed for any goal.`;

/**
 * The planner's note where its course has a shape at this goal (or one on its way): about the results on goal pace only,
 * after "No results on goal pace for {city} at this goal." A course with too few editions for any of them has no shape
 * either (lib/tools/course-shape.ts SHAPE_MIN_EDITIONS), so this note never sits beside a shape it would contradict.
 */
export function goalPaceNote(result: Extract<CourseGoalResult, { state: 'unavailable' }>, city: string): string {
  return `No results on goal pace for ${city} at this goal. ${result.reason}`;
}

export type CourseGoalResult =
  | { state: 'row'; row: CourseGoalRow; course: CourseContext; minutes: number; rounded: boolean }
  | { state: 'unavailable'; course: CourseContext | null; minutes: number | null; reason: string };

/**
 * What the planner shows for a course and a goal: the course-goal row at the nearest published goal, or why there is
 * none. `screened` is why no edition of the course passed the data screens, for a course the file does not list.
 */
export function courseGoalResult(data: CourseGoal, city: string, seconds: number, screened: string | null): CourseGoalResult {
  const course = data.courses.find((c) => c.city === city) ?? null;
  const published = publishedGoal(seconds, data.goals, data.goal_step_min);
  if (!course) return { state: 'unavailable', course, minutes: published?.minutes ?? null, reason: screened ?? `${city} is not in the course data.` };
  if (!published) {
    return { state: 'unavailable', course, minutes: null, reason: `Course results are published for goals from ${formatHM(data.goals[0] * 60)} to ${formatHM(data.goals[1] * 60)}.` };
  }
  const row = data.rows.find((r) => r.city === city && r.goal === published.minutes);
  if (row) return { state: 'row', row, course, minutes: published.minutes, rounded: published.rounded };
  if (course.editions < data.min_editions) return { state: 'unavailable', course, minutes: published.minutes, reason: tooFewEditions(course.editions, data.min_editions) };
  const gap = data.unavailable.find((u) => u.city === city && u.goal === published.minutes);
  return { state: 'unavailable', course, minutes: published.minutes, reason: gap ? courseGoalReason(gap.reason, data.min_editions) : 'No row is published for this goal.' };
}

/**
 * Finishes on a goal's pace through 20K (the course-goal rows at one published goal, in whole minutes): how many there
 * were, on how many courses, and the share that made the goal, pooled by finishes; for one course, its own row. Null
 * when fewer than 100 finishes are published. The planner's live nugget and lib/nuggets/tools.ts (plan.goal) share it.
 */
export function goalShare(rows: CourseGoalRow[], minutes: number, city: string | null = null): { n: number; under: number; courses: number } | null {
  const at = rows.filter((r) => r.goal === minutes && (city === null || r.city === city));
  const n = at.reduce((sum, r) => sum + r.n, 0);
  if (!at.length || n < 100) return null;
  return { n, under: at.reduce((sum, r) => sum + r.n * r.under, 0) / n, courses: at.length };
}

/** "2016–2019", "2013–2018, 2023": years with consecutive runs collapsed. */
export function yearRuns(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      runs.push(start === sorted[i - 1] ? String(start) : `${start}–${sorted[i - 1]}`);
      start = sorted[i];
    }
  }
  return runs.join(', ');
}

/** Why a course has no course-goal rows at all: every edition was screened out (the course chooser's wording). */
export function screenedReason(city: string, screens: CourseGoal['screens']): string {
  const off = (screens?.start_offset ?? []).filter((o) => o.city === city).map((o) => o.year);
  const shifted = (screens?.grid ?? []).filter((g) => g.city === city).map((g) => g.year);
  const parts = [
    off.length ? `start delays inflate the first split in ${yearRuns(off)}` : null,
    shifted.length ? `the mat grid was shifted in ${yearRuns(shifted)}` : null,
  ].filter(Boolean);
  return `No edition passed the data screens${parts.length ? ` (${parts.join('; ')})` : ''}.`;
}
