/**
 * Marathon finish-time summary for /finish-times: medians, percentiles and observed shares of finishes
 * under round times, computed at build time from the verified story data (public/data/insights).
 *
 * The pure functions (summarizeGroup, the formatters) take plain numbers, so scripts/verify-finish-times.cjs
 * can test them and compare them with an independent recount. getFinishTimeSummary() reads the files and is
 * server-only.
 *
 * Definitions, used the same way on the page and in the verifier:
 * - finish-times.json publishes one-minute bins of elapsed finish time from 2:00 to 7:00. Bin m holds finishes
 *   from m:00 to m:59 (floor of seconds / 60).
 * - Every total is the whole story cohort from the manifest (analysis_n, and the recorded-gender counts), so
 *   finishes outside the published bins stay in each denominator. For ranks and shares they are counted as
 *   slower than the last bin; the verifier checks against the full finish records that this changes no figure shown.
 * - A percentile is the finish ranked ceil(p × total) counting from the first finish (nearest rank), reported as its whole minute.
 * - "Under 3:00" is a finish of 2:59:59 or faster: the bins below minute 180, over the group's total.
 */
import type { Courses, FinishTimes } from './insights';
import { getInsightsManifest, readInsight } from './insights-server';

export type FinishGroup = 'all' | 'women' | 'men';
export const FINISH_GROUPS: readonly FinishGroup[] = ['all', 'women', 'men'];
export const GROUP_LABEL: Record<FinishGroup, string> = { all: 'All finishes', women: 'Recorded women', men: 'Recorded men' };

/** Round finish times whose observed shares the page reports, in minutes. */
export const UNDER_MINUTES: readonly number[] = [180, 210, 240, 270, 300, 360];
/** Percentiles the page reports, as fractions. 0.5 is the median. */
export const PERCENTILES: readonly number[] = [0.1, 0.25, 0.5, 0.75, 0.9];

export type MinuteBin = { minute: number; n: number };

export interface GroupSummary {
  group: FinishGroup;
  /** Every finish in the group (story cohort), including any outside the published bins. */
  total: number;
  /** Finishes inside the published bins. */
  binned: number;
  /** total − binned. */
  outside: number;
  /** Whole minute of each reported percentile, or null when its rank falls past the published bins. */
  percentiles: { p: number; minute: number | null }[];
  median: number | null;
  /** Observed share of the group's finishes under each round time. */
  under: { minute: number; share: number }[];
  /** The bin with the most finishes (the first, if tied). */
  peak: MinuteBin;
}

/** One group's summary from contiguous one-minute bins and the group's total (shares under `underMinutes`). Throws on bins it cannot read. */
export function summarizeGroup(group: FinishGroup, bins: MinuteBin[], total: number, underMinutes: readonly number[] = UNDER_MINUTES): GroupSummary {
  if (!bins.length) throw new Error('No finish-time bins.');
  bins.forEach((bin, i) => {
    if (!Number.isInteger(bin.minute) || !Number.isInteger(bin.n) || bin.n < 0) throw new Error(`Unreadable finish-time bin ${i}.`);
    if (i && bin.minute !== bins[i - 1].minute + 1) throw new Error(`Finish-time bins must be contiguous minutes (at ${bin.minute}).`);
  });
  const binned = bins.reduce((sum, bin) => sum + bin.n, 0);
  if (!Number.isInteger(total) || total < binned || total <= 0) throw new Error(`The ${group} total must cover every binned finish.`);
  const first = bins[0].minute, last = bins[bins.length - 1].minute;

  const minuteAtRank = (rank: number): number | null => {
    let cumulative = 0;
    for (const bin of bins) {
      cumulative += bin.n;
      if (cumulative >= rank) return bin.minute;
    }
    return null;
  };
  // Whole-percent integer maths, so a rank that is exactly an integer is never pushed up by a rounding error.
  const percentiles = PERCENTILES.map((p) => ({ p, minute: minuteAtRank(Math.max(1, Math.ceil((Math.round(p * 100) * total) / 100))) }));

  const under = underMinutes.map((minute) => {
    if (minute <= first || minute > last + 1) throw new Error(`Under ${minute} minutes lies outside the published bins.`);
    const below = bins.filter((bin) => bin.minute < minute).reduce((sum, bin) => sum + bin.n, 0);
    return { minute, share: below / total };
  });

  const peak = bins.reduce((best, bin) => (bin.n > best.n ? bin : best), bins[0]);
  return { group, total, binned, outside: total - binned, percentiles, median: percentiles.find((x) => x.p === 0.5)?.minute ?? null, under, peak: { ...peak } };
}

export interface FinishTimeSummary {
  groups: Record<FinishGroup, GroupSummary>;
  /** First and last published bin, in minutes (2:00 and 7:00). */
  firstMinute: number;
  lastMinute: number;
  /** Finishes in the bins, per group, for the chart. */
  bins: { minute: number; all: number; women: number; men: number }[];
  coverage: {
    finishes: number; editions: number; races: number; otherOrNotRecorded: number;
    firstYear: number; lastYear: number;
    /** Race and city names from courses.json, in alphabetical order of city (never by any result). */
    courses: { city: string; race: string }[];
    /** Editions left out because their records repeat another edition (manifest duplicate_edition_screen), grouped. */
    duplicates: { city: string; years: number[]; duplicateOf: number }[];
  };
  asOf: string;
}

/** The page's numbers, from finish-times.json, courses.json and the insights manifest (all digest-checked on read). */
export function getFinishTimeSummary(): FinishTimeSummary {
  const manifest = getInsightsManifest();
  const data = readInsight<FinishTimes>('finish-times.json');
  const courses = readInsight<Courses>('courses.json');
  const { cohort } = manifest;
  if (data.analysis_n !== manifest.analysis_n || cohort.after_duplicate_screen !== manifest.analysis_n) throw new Error('Finish-time data and the manifest describe different cohorts.');
  const totals: Record<FinishGroup, number> = { all: cohort.after_duplicate_screen, women: cohort.women, men: cohort.men };
  const groups = Object.fromEntries(FINISH_GROUPS.map((group) => [group, summarizeGroup(group, data.histogram.map((row) => ({ minute: row.minute, n: row[group] })), totals[group])])) as Record<FinishGroup, GroupSummary>;
  const years = courses.courses.flatMap((course) => course.years);
  return {
    groups,
    firstMinute: data.histogram[0].minute,
    lastMinute: data.histogram[data.histogram.length - 1].minute,
    bins: data.histogram.map(({ minute, all, women, men }) => ({ minute, all, women, men })),
    coverage: {
      finishes: cohort.after_duplicate_screen,
      editions: cohort.editions,
      races: cohort.cities,
      otherOrNotRecorded: cohort.other_or_not_recorded,
      firstYear: Math.min(...years),
      lastYear: Math.max(...years),
      courses: courses.courses.map(({ city, race }) => ({ city, race })).sort((a, b) => a.city.localeCompare(b.city, 'en')),
      duplicates: groupDuplicates(manifest.duplicate_edition_screen),
    },
    asOf: manifest.as_of,
  };
}

function groupDuplicates(screen: { city: string; year: number; duplicate_of: number }[]) {
  const out: { city: string; years: number[]; duplicateOf: number }[] = [];
  for (const row of screen) {
    const same = out.find((d) => d.city === row.city && d.duplicateOf === row.duplicate_of);
    if (same) same.years.push(row.year);
    else out.push({ city: row.city, years: [row.year], duplicateOf: row.duplicate_of });
  }
  for (const d of out) d.years.sort((a, b) => a - b);
  return out;
}

// ---------- Display formats (the verifier compares these strings with the full finish records) ----------

/** A whole minute as h:mm, e.g. 250 → "4:10". It names the minute from 4:10:00 to 4:10:59. */
export function clockMinute(minute: number): string {
  if (!Number.isInteger(minute) || minute < 0) throw new Error(`Not a whole minute: ${minute}`);
  return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
}

/** A whole-minute percentile, or the honest fallback when its rank falls past the published bins. */
export function percentileLabel(minute: number | null, lastMinute: number): string {
  return minute === null ? `after ${clockMinute(lastMinute)}` : clockMinute(minute);
}

/** An observed share as a percentage with one decimal, e.g. 0.05085 → "5.1%". */
export function shareLabel(share: number): string {
  if (!(share >= 0 && share <= 1)) throw new Error(`Not a share: ${share}`);
  return `${(share * 100).toFixed(1)}%`;
}

/** Ordinal for a percentile fraction: 0.1 → "10th", 0.25 → "25th". */
export function ordinal(p: number): string {
  const n = Math.round(p * 100);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Every figure the page prints from the data, keyed for the verifier. */
export function displayedFigures(summary: Pick<FinishTimeSummary, 'groups' | 'lastMinute'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of FINISH_GROUPS) {
    const g = summary.groups[group];
    for (const { p, minute } of g.percentiles) out[`${group}.p${Math.round(p * 100)}`] = percentileLabel(minute, summary.lastMinute);
    for (const { minute, share } of g.under) out[`${group}.under${minute}`] = shareLabel(share);
  }
  return out;
}
