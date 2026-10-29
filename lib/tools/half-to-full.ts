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

/** "4:00 · 22%" for each published mark. */
export function markLabels(win: Pick<HalfToFullWindow, 'marks'>): string[] {
  return win.marks.map(([t, share]) => `${floorHM(t)} · ${sharePct(share)}`);
}

/**
 * The predictor panel's sentence (one accent): "Of records linked by name with a half near 1:55, the typical marathon
 * 3 to 16 weeks later took *4:15*; half took 4:01 to 4:30."
 */
export function linkedSentence(win: HalfToFullWindow, Q: number[]): string {
  return `Of records linked by name with a half near ${floorHM(win.h)}, the typical marathon 3 to 16 weeks later took *${floorHM(win.q[9])}*; `
    + `half took ${floorHM(quantileAt(win, Q, 0.25))} to ${floorHM(quantileAt(win, Q, 0.75))}.`;
}

/** "33% of these marathons had a sustained slowdown." (the page links the term). */
export function slowdownSentence(win: Pick<HalfToFullWindow, 'sus'>): string {
  return `${sharePct(win.sus)} of these marathons had a sustained slowdown.`;
}

/** The too-few state for a sex whose window near this half is not published, naming the range that has enough. */
export function tooFewSentence(tool: HalfTool, group: 'F' | 'M'): string {
  const word = SEX_WORD[group];
  return `Too few recorded ${word} pairs near this half to show; recorded ${word} halves from ${rangeText(tool, group)} have enough.`;
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
 * A goal page's "The half before" lines (forward-consistent: H is the slowest published window whose median marathon is
 * under the goal, so the predictor at H shows a median under it and at H + 1 minute does not).
 */
export function goalLines(goal: HalfGoal): { lead: string; range: string; sexes: string | null; link: string } {
  const H = floorHM(goal.all.h);
  return {
    lead: `After a half near *${H}*, the typical marathon came in under ${floorHM(goal.goal_s)}.`,
    range: `8 in 10 took ${floorHM(goal.all.p10)} to ${floorHM(goal.all.p90)}.`,
    sexes: goal.F && goal.M ? `Recorded women’s: near ${floorHM(goal.F.h)} · men’s: near ${floorHM(goal.M.h)}.` : null,
    link: `/tools/predictor?d=half&t=${H}:00`,
  };
}
