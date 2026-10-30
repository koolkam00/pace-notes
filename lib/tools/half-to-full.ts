/**
 * The marathons that followed a half (public/data/half/tools/half-to-full.json and linked.json): the window lookup, the
 * readout mark and the sentences the predictor's half panel, the goal pages' "The half before" line and the flagship's
 * readout share, so scripts/verify-tools.cjs checks the same words the pages print. Pure functions of the data.
 *
 * A window is "near H": the pairs whose half is within 2:30 of the whole minute H. The tool picks the window of the
 * typed half's nearest whole minute (1:52:30 reads the 1:53 window) and shows nothing outside a group's published
 * range. Times print as h:mm, the whole minute at or below the value. Records are linked by name: the sentences say
 * records were linked, never that records ran. Shares are of marathons, never anyone's chance.
 */
import type { HalfGoal, HalfGroup, HalfTool, HalfWindow } from '@/lib/half-types';
import { MARATHON_KM, KM_PER_MILE, type UnitSystem } from '@/lib/units';

/** The browser path of the predictor's compact windows (lib/half.ts loadHalf). */
export const HALF_TOOL_FILE = 'half/tools/half-to-full.json';
export const NOT_A_PREDICTION = 'Not a prediction.';

/** One window in either file's shape: pairs, marathon editions, sustained-slowdown share, 19 quantiles, marks. */
export type HalfToFullWindow = { h: number; n: number; e: number; sus: number; q: number[]; marks: [number, number][] };

const SEX_WORD: Record<'F' | 'M', string> = { F: 'women’s', M: 'men’s' };

/** Whole minutes at or below the value, as h:mm: 15338.5 → "4:15". */
export function floorHM(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60 + 1e-9);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A share of marathons as a whole percentage: 0.2154 → "22%". */
export function sharePct(share: number): string {
  return Number.isFinite(share) ? `${Math.round(share * 100)}%` : '—';
}

/** The quantile at `level` (0.05 … 0.95) of a window, from the file's level list. */
export function quantileAt(win: Pick<HalfToFullWindow, 'q'>, Q: number[], level: number): number {
  const i = Q.findIndex((x) => Math.abs(x - level) < 1e-9);
  if (i < 0) throw new Error(`No quantile level ${level}`);
  return win.q[i];
}

/** The window of the typed half's nearest whole minute in a group, or null outside the group's published range. */
export function windowFor(tool: HalfTool, seconds: number, group: HalfGroup): HalfToFullWindow | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const g = tool.groups[group];
  if (!g) return null;
  const h = Math.round(seconds / 60) * 60;
  if (h < g.from || h > g.to) return null;
  const row = g.w[(h - g.from) / 60];
  if (!row) return null;
  const [n, e, sus, q, marks] = row;
  return { h, n, e, sus, q, marks };
}

/** linked.json's window in the same shape. */
export function fromLinked(win: HalfWindow): HalfToFullWindow {
  return { h: win.h, n: win.n, e: win.e, sus: win.sus, q: win.q, marks: win.marks };
}

/** A group's published range as "1:26 to 2:40". */
export function rangeText(tool: HalfTool, group: HalfGroup): string {
  const g = tool.groups[group];
  return `${floorHM(g.from)} to ${floorHM(g.to)}`;
}

/**
 * The readout's mark: the half-hour mark nearest the median among the window's published marks, else the nearest
 * published mark (ties to the earlier). Null when the window has no marks.
 */
export function readoutMark(win: Pick<HalfToFullWindow, 'q' | 'marks'>): [number, number] | null {
  if (!win.marks.length) return null;
  const median = win.q[9];
  const nearest = (marks: [number, number][]) => marks.reduce((best, m) => (Math.abs(m[0] - median) < Math.abs(best[0] - median) ? m : best));
  const halfHours = win.marks.filter(([t]) => t % 1800 === 0);
  return nearest(halfHours.length ? halfHours : win.marks);
}

/** The mark nearest the median (the strip's signal bars run under it). */
export function nearestMark(win: Pick<HalfToFullWindow, 'q' | 'marks'>): [number, number] | null {
  if (!win.marks.length) return null;
  const median = win.q[9];
  return win.marks.reduce((best, m) => (Math.abs(m[0] - median) < Math.abs(best[0] - median) ? m : best));
}

/** A mark's label, the share first and what it is under ("22% under 4:00"), so it reads alone on the strip. */
export function markLabel(t: number, share: number): string {
  return `${sharePct(share)} under ${floorHM(t)}`;
}

/** "22% under 4:00" for each published mark. */
export function markLabels(win: Pick<HalfToFullWindow, 'marks'>): string[] {
  return win.marks.map(([t, share]) => markLabel(t, share));
}

/**
 * The predictor panel's sentence (one accent), the answer first: "After a half near 1:55, the typical marathon 3 to 16
 * weeks later took *4:15*; 8 in 10 took 3:53 to 4:46." The range is the 10th to the 90th percentile, the one the strip
 * brackets and the story's readout and the goal pages name ("8 in 10"), so one span reads the same everywhere and
 * "half" means only the race (round 2 review, October 30, 2026). The panel names the records linked by name on the
 * line under it.
 */
export function linkedSentence(win: HalfToFullWindow, Q: number[]): string {
  return `After a half near ${floorHM(win.h)}, the typical marathon 3 to 16 weeks later took *${floorHM(win.q[9])}*; `
    + `8 in 10 took ${floorHM(quantileAt(win, Q, 0.1))} to ${floorHM(quantileAt(win, Q, 0.9))}.`;
}

/** The panel's line under the sentence: whose marathons these are (the term links to /methodology#half-linking). */
export const LINKED_LINE = 'Half and marathon records linked by name.';

/** "33% of these marathons had a sustained slowdown." (the page links the term). */
export function slowdownSentence(win: Pick<HalfToFullWindow, 'sus'>): string {
  return `${sharePct(win.sus)} of these marathons had a sustained slowdown.`;
}

/**
 * The too-few state for a sex whose window near the typed half is not published, naming the range that has enough:
 * "Too few recorded women’s marathons after a half near 1:25 to show; recorded women’s halves from 1:26 to 2:40 have
 * enough." Without a half, "near this half".
 */
export function tooFewSentence(tool: HalfTool, group: 'F' | 'M', seconds?: number): string {
  const word = SEX_WORD[group];
  const near = seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? `a half near ${floorHM(Math.round(seconds / 60) * 60)}` : 'this half';
  return `Too few recorded ${word} marathons after ${near} to show; recorded ${word} halves from ${rangeText(tool, group)} have enough.`;
}

/**
 * The predictor's line for a half outside the panel's published range, where the 20K panel shows instead: "Marathons
 * after a half are shown for halves from 1:10 to 2:45."
 */
export function outOfRangeSentence(range: { from: number; to: number }): string {
  return `Marathons after a half are shown for halves from ${floorHM(range.from)} to ${floorHM(range.to)}.`;
}

/** How much slower per mile (or km) the typical marathon ran than its half: the extra over double ÷ the marathon distance. */
export function paceGap(extraSeconds: number, units: UnitSystem): number {
  return extraSeconds / (units === 'mi' ? MARATHON_KM / KM_PER_MILE : MARATHON_KM);
}

/** "+55 s/mi" or "+34 s/km". */
export function paceGapText(extraSeconds: number, units: UnitSystem): string {
  const gap = Math.round(paceGap(extraSeconds, units));
  return `${gap >= 0 ? '+' : '−'}${Math.abs(gap)} s/${units === 'mi' ? 'mi' : 'km'}`;
}

/**
 * A goal page's "The half marathon before" lines (forward-consistent: H is the slowest published window whose median
 * marathon is under the goal, so the predictor at H shows a median under it and at H + 1 minute does not). The lead
 * names the share of that window's marathons under the goal (its published mark at the goal), so the boundary reads as
 * what it is, just over half, never as "a half near H makes the goal"; without that mark it says the typical marathon
 * came in just under the goal. The sexes' line names each sex's own boundary as a full sentence. On a marathon pace page,
 * whose hero prints the goal's own halfway time, every line says "half marathon" where it means the race, so "a 1:48
 * half" is never read as reaching halfway in 1:48 (round 2 review, October 30, 2026); the lead keeps to 12 words.
 */
export function goalLines(goal: HalfGoal, win?: Pick<HalfToFullWindow, 'h' | 'marks'> | null): { lead: string; range: string; sexes: string | null; link: string; linkText: string } {
  const H = floorHM(goal.all.h), G = floorHM(goal.goal_s);
  const mark = win && win.h === goal.all.h ? win.marks.find(([t]) => t === goal.goal_s) : undefined;
  return {
    lead: mark ? `After a *${H}* half marathon, ${sharePct(mark[1])} of marathons came in under ${G}.` : `After a *${H}* half marathon, the typical marathon came in just under ${G}.`,
    range: `8 in 10 took ${floorHM(goal.all.p10)} to ${floorHM(goal.all.p90)}.`,
    sexes: goal.F && goal.M ? `The typical recorded women’s marathon came in under ${G} after half marathons up to about ${floorHM(goal.F.h)}; the typical men’s, up to about ${floorHM(goal.M.h)}.` : null,
    link: `/tools/predictor?d=half&t=${H}:00`,
    linkText: `The marathons after a ${H} half marathon`,
  };
}
