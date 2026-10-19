/**
 * The parts of the race report (lib/report.ts) that the split check uses too, in a module of their own so the split
 * check does not load the report: the threshold-safe percentages, the section tones, the starting-pace analysis's
 * opening groups, the split check's comparison window and the report link. Pure.
 */
import type { PaceBandIndex, PaceBandShard } from './tools/data';
import { cellOf } from './tools/pace-band-data';
import { reportHref } from './tools/links';
import { runnerHandoffHref } from './analytics-policy';

/** The comparison groups the split check offers (its `g`): never read from a runner record. */
export type ReportGender = 'all' | 'men' | 'women';

/** One of the six opening groups of the starting-pace analysis (first 5 km vs the same race's 5–20 km pace, in %). */
export interface OpeningBand { id: string; label: string; lower: number | null; upper: number | null; lower_inclusive: boolean; upper_inclusive: boolean }

/** The cohort the pacing types were fitted on (the pacing-types story's), so their shares carry their own denominator. */
export interface TypeCohort { n: number; editions: number | null; keeps: string[] }

/* ---------- Percentages, tones and the verdict: lib/report-verdict.ts (light, for the runner view) ---------- */

export { qualifies, pctNum, pctAbs, pctSigned, openingPct, timesVerdict, toneOf } from './report-verdict';
export type { Tone, TimesVerdict } from './report-verdict';
import type { Tone } from './report-verdict';

export const TONE: Record<Tone, { fill: string; stroke: string; label: string }> = {
  quick: { fill: '#9DB6FB', stroke: '#2346E6', label: 'Quicker than 5–20 km pace' },
  even: { fill: '#DCD3C2', stroke: '#66625A', label: 'Within 2%' },
  slow: { fill: '#FFC7AA', stroke: '#E0571F', label: 'Slower' },
  qualify: { fill: '#FF5B2E', stroke: '#B4380D', label: '25% or more slower after 20 km' },
};

/** The opening group a first-5 km change (in %) falls in, by the starting-pace analysis's own bounds. */
export function openingBandOf(pct: number, bands: OpeningBand[]): OpeningBand | null {
  const tol = 1e-8;
  return bands.find((b) => (b.lower === null || (b.lower_inclusive ? pct >= b.lower - tol : pct > b.lower + tol))
    && (b.upper === null || (b.upper_inclusive ? pct <= b.upper + tol : pct < b.upper - tol))) ?? null;
}

/* ---------- The split check's comparison window ---------- */

type Scope = PaceBandIndex['scopes'][number];
/**
 * Whether the pace band publishes a window for a finish F on a course scope and gender. The window runs from G − 5:00 to
 * G − 0:01 with G = ⌊F ÷ 60⌋ + 3 minutes, so it holds F with at least two minutes on each side; `range` gives the
 * finishes the published goals cover, and `shard` the minute G once the scope and gender have a shard.
 */
export type WindowCheck = { state: 'range'; from: number; to: number } | { state: 'unpublished' } | { state: 'shard'; minute: number };
export function windowCheck(index: PaceBandIndex, scope: Scope, gender: ReportGender, path: string, finish: number): WindowCheck {
  const [g0, g1] = index.goals;
  const minute = Math.floor(finish / 60) + 3;
  if (minute < g0 || minute > g1) return { state: 'range', from: (g0 - 3) * 60, to: (g1 - 2) * 60 - 1 };
  if (!scope.genders[gender] || !index.shards?.[path]) return { state: 'unpublished' };
  return { state: 'shard', minute };
}
/** The window's bounds and its groups: all finishes, then held pace and sustained slowdown, each only with 100 finishes. */
export function windowCells(shard: PaceBandShard, minute: number, indexWindow: number) {
  const windowS = shard.window_s || indexWindow || 300;
  const all = cellOf(shard.groups.all, minute);
  return { lo: minute * 60 - windowS, hi: minute * 60 - 1, all, held: all ? cellOf(shard.groups.held, minute) : null, slow: all ? cellOf(shard.groups.slowdown, minute) : null };
}

/**
 * The address a report's Copy link gives. A typed report keeps the comparison group chosen in the split check; one built
 * from a runner record carries the times, the course and the handoff marker, and nothing else (never `g`, a name, a
 * record ID or a year), so the page it opens is never recorded either.
 */
export function reportLink(times: number[], city: string | null, gender: ReportGender, fromRecord: boolean): string | null {
  const href = reportHref(times, city ?? undefined);
  if (!href) return null;
  if (fromRecord) return runnerHandoffHref(href);
  return gender === 'all' ? href : `${href}&g=${gender}`;
}
