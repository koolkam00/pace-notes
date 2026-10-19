/**
 * The race report (/report, and the report panel in the runner view): one past race, read from its nine mat times with
 * what the split check already uses (lib/tools/splits.ts's reading and pacing-type classifier, the split check's
 * comparison window, and the starting-pace analysis's six opening groups), plus, for a runner record on /runners only,
 * that edition's All group from lib/runner-context.ts. Pure: no React, no requests and no units chosen here.
 *
 * Every block read from Pace Notes data carries its cohort label and its number of finishes, and a group with fewer
 * than 100 finishes is never shown (the runner context publishes groups of at least 101). A report never holds a name,
 * a record ID, a recorded gender or an age group, and says "this race", never "you".
 */
import type { Archetypes } from './insights';
import type { RaceInsights } from './runner-context';
import type { PaceBandIndex, PaceBandShard } from './tools/data';
import {
  openingBandOf, pctSigned, qualifies, toneOf, windowCells, windowCheck, type OpeningBand, type ReportGender, type Tone, type TypeCohort,
} from './report-shared';
import { paceBandShardPath, type PaceBandCell } from './tools/pace-band-data';
import { SECTION_KM, classify, readSplits, validateSplits, type SplitReading } from './tools/splits';
import { formatDuration } from './tools/time';
import { KM_PER_MILE, matLabel, sectionLabel, type UnitSystem } from './units';
import { approxWords, pct } from './nuggets/format';

export * from './report-shared';

/** What a page hands the report from the build: verified file hashes, the opening groups, the type cohort and course names. */
export interface ReportData {
  indexSha: string | null; archetypesSha: string | null; openingBands: OpeningBand[]; typeCohort: TypeCohort | null;
  /** Every course Pace Notes data names, by slug, so a link's course can be named even where the comparison has none. */
  courses: Record<string, string>;
}

/** The report's file name: no course, year or time in it. */
export const REPORT_IMAGE_NAME = 'pace-notes-race-report.png';

/** The course scope a report compares with: the linked course when the pace band publishes it, else all courses. */
export function reportScope(index: PaceBandIndex, course: string): { scope: PaceBandIndex['scopes'][number] | null; dropped: boolean } {
  const own = course === 'all' ? null : index.scopes.find((s) => s.slug === course) ?? null;
  return own ? { scope: own, dropped: false } : { scope: index.scopes.find((s) => s.slug === 'all') ?? null, dropped: course !== 'all' };
}
/** The shard a report needs for a finish, or null when the window is not published (or outside the published goals). */
export function reportShardPath(index: PaceBandIndex, course: string, gender: ReportGender, finish: number): string | null {
  const { scope } = reportScope(index, course);
  if (!scope) return null;
  const path = paceBandShardPath(scope.slug, gender);
  return windowCheck(index, scope, gender, path, finish).state === 'shard' ? path : null;
}

/* ---------- Reading a link ---------- */

/**
 * Nine cumulative times as the split check and reportHref write them (h:mm:ss, comma-separated; a keypad's dots between
 * the groups are read as colons), or null unless valid.
 */
export function readReportTimes(s: string | null): number[] | null {
  const parts = (s ?? '').split(',');
  if (parts.length !== 9) return null;
  const times = parts.map((part) => {
    const m = /^(\d{1,2})[:.]([0-5]\d)[:.]([0-5]\d)$/.exec(part.trim());
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  });
  return validateSplits(times) === null ? (times as number[]) : null;
}
export const readReportGender = (g: string | null): ReportGender => (g === 'men' || g === 'women' ? g : 'all');

/* ---------- The model ---------- */

export interface ReportSection { index: number; startKm: number; endKm: number; seconds: number; pace: number; vsBaseline: number; tone: Tone }
/** One group of the comparison window: its finishes and editions and its median elapsed time at 20 km and the finish. */
export interface ReportGroup { key: 'held' | 'slowdown' | 'all'; name: string; n: number; ed: number; at20: number; finish: number }
export type ReportComparison =
  | { state: 'loading' }
  | { state: 'off'; message: string }
  | { state: 'unavailable'; title: string; message: string }
  | { state: 'ok'; label: string; n: number; ed: number; lo: number; hi: number; slowdownShare: number | null; groups: ReportGroup[]; missing: string | null };
export type ReportType =
  | { state: 'loading' }
  | { state: 'off'; message: string }
  | {
    state: 'ok'; name: string; n: number; share: number; cohortN: number; label: string;
    /** The type's place in the pacing-types order (its colour), its centroid and the shared y range of every centroid: the glyph. */
    index: number; profile: number[]; domain: [number, number];
  };
export type ReportRecord = { edition: string } & (
  | { state: 'loading' }
  | { state: 'off'; message: string }
  | {
    state: 'ok';
    placement: { label: string; n: number; otherN: number; rank: number; ties: number; percentile: number; medianFinish: number } | { unavailable: string };
    late: { label: string; n: number; from: number; to: number; median: number; race: number } | { unavailable: string };
    weather: { tempC: number; humidityPct: number; windMps: number; start: string } | { unavailable: string };
    climb: { gainM: number } | { unavailable: string };
  });

export interface ReportModel {
  times: number[];
  /** The course (and year for a record), as the data names it; null for a typed race compared with all courses. */
  race: string | null;
  finish: number;
  /** Average, 5–20 km and section paces in seconds per km; the page shows them in the visitor's units. */
  average: number;
  baseline: number;
  sections: ReportSection[];
  slowdown: { yes: boolean; onsetKm: number | null; slowKm: number };
  opening: { fraction: number; band: OpeningBand | null };
  type: ReportType;
  comparison: ReportComparison;
  /** Only on /runners, from that record's edition: never in the image or a link. */
  record: ReportRecord | null;
}

export interface ReportInput {
  times: number[];
  race: { city: string | null; year?: number | null };
  openingBands: OpeningBand[];
  types: { data: Archetypes | null; error: string | null; cohort: TypeCohort | null };
  comparison: {
    index: PaceBandIndex | null; indexError: string | null; course: string; gender: ReportGender;
    /** The shard loaded for reportShardPath(), with its path, or null while it loads. */
    shard: { path: string; data: PaceBandShard | null; error: string | null } | null;
  };
  record?: { edition: { city: string; year: number }; context: RaceInsights | null; error: string | null; lateChange: number };
}

const count = (value: number) => value.toLocaleString('en-US');
const clock = (seconds: number) => formatDuration(seconds, true);

function comparisonOf(input: ReportInput['comparison'], finish: number): ReportComparison {
  const { index, indexError, course, gender, shard } = input;
  if (indexError) return { state: 'off', message: indexError };
  if (!index) return { state: 'loading' };
  const { scope } = reportScope(index, course);
  if (!scope) return { state: 'off', message: 'The comparison data has no All courses group, so nothing is shown.' };
  const where = scope.slug === 'all' ? 'on all courses' : `in ${scope.city ?? scope.slug}`;
  const recorded = gender === 'all' ? '' : ` recorded as ${gender}`;
  const path = paceBandShardPath(scope.slug, gender);
  const check = windowCheck(index, scope, gender, path, finish);
  if (check.state === 'range') {
    return { state: 'unavailable', title: 'Outside the compared range.', message: `Comparisons are published for finishes from ${clock(check.from)} to ${clock(check.to)}.` };
  }
  if (check.state === 'unpublished') return { state: 'unavailable', title: 'Not published for this group.', message: `No finish window ${where} has enough finishes${recorded || ' of any recorded gender'} to compare.` };
  if (!shard || shard.path !== path || (!shard.data && !shard.error)) return { state: 'loading' };
  if (shard.error || !shard.data) return { state: 'off', message: shard.error ?? 'This data could not be loaded. Check the connection and try again.' };
  const { lo, hi, all, held, slow } = windowCells(shard.data, check.minute, index.window_s);
  if (!all) return { state: 'unavailable', title: 'Too few finishes at this time.', message: `Too few complete finishes ran ${clock(lo)} to ${clock(hi)} ${where}${recorded} to compare.` };
  const group = (key: ReportGroup['key'], name: string, cell: PaceBandCell): ReportGroup => ({ key, name, n: cell.n, ed: cell.ed, at20: cell.e50[3], finish: cell.e50[8] });
  // Held pace against sustained slowdown, each with 100 finishes; when neither has them, the whole window instead.
  const groups = held || slow ? [held ? group('held', 'Held pace', held) : null, slow ? group('slowdown', 'Sustained slowdown', slow) : null].filter((g): g is ReportGroup => g !== null)
    : [group('all', 'All finishes in the window', all)];
  const missing = !held && !slow ? 'Neither the held-pace nor the sustained-slowdown group has enough finishes, so the whole window is shown.'
    : !held ? 'The held-pace group has too few finishes to show.' : !slow ? 'The sustained-slowdown group has too few finishes to show.' : null;
  // The window pools every edition of the course: the label says so, beside an edition's own counts in the runner view.
  const pooled = scope.slug === 'all' ? where : `${where}, every edition`;
  return {
    state: 'ok', label: `complete finishes from ${clock(lo)} to ${clock(hi)} ${pooled}${recorded}`, n: all.n, ed: all.ed, lo, hi,
    slowdownShare: all.sd ?? (slow ? slow.n / all.n : null), groups, missing,
  };
}

function typeOf(reading: SplitReading, types: ReportInput['types']): ReportType {
  if (types.error) return { state: 'off', message: types.error };
  if (!types.data) return { state: 'loading' };
  const c = types.data.classifier;
  const k = classify(reading.relative, c);
  const all = types.data.archetypes;
  const arch = all.find((a) => a.name === c.names[k]) ?? all[k];
  const span = all.flatMap((a) => a.profile ?? []).filter(Number.isFinite);
  return {
    state: 'ok', name: c.names[k], n: arch.n, share: arch.share, cohortN: types.data.cohort_n,
    label: 'complete finishes',
    index: Math.max(0, all.indexOf(arch)), profile: arch.profile ?? [], domain: span.length ? [Math.min(...span), Math.max(...span)] : [0, 1],
  };
}

function recordOf(record: NonNullable<ReportInput['record']>): ReportRecord {
  const edition = `${record.edition.city} ${record.edition.year}`;
  if (record.error) return { edition, state: 'off', message: record.error };
  const context = record.context;
  if (!context) return { edition, state: 'loading' };
  // The All group only: never a recorded gender or age group. Groups need 101 finishes, so 100 others.
  const all = context.comparisons.all;
  const pace = all?.pace ?? null;
  return {
    edition, state: 'ok',
    // "Ahead of 51 in every 100 other finishes in Copenhagen 2022": which finishes count is /methodology's.
    placement: all ? { label: `finishes in ${edition}`, n: all.n, otherN: all.other_n, rank: all.rank, ties: all.ties, percentile: all.percentile, medianFinish: all.median_finish }
      : { unavailable: `Too few finishes in ${edition} to place this race.` },
    late: pace ? { label: `finishes from ${clock(pace.from_sec)} to under ${clock(pace.to_sec)} in ${edition}`, n: pace.n, from: pace.from_sec, to: pace.to_sec, median: pace.late_change.median, race: record.lateChange }
      : { unavailable: `Too few finishes near this time in ${edition} to compare its late pace.` },
    // Without weather or a route, one plain line, as the runner view's conditions say it: the data screen's reasons are
    // method copy, which lives on /methodology.
    weather: context.weather ? { tempC: context.weather.temp_c, humidityPct: context.weather.humidity_pct, windMps: context.weather.wind_mps, start: context.weather.scheduled_start }
      : { unavailable: 'Not available for this edition.' },
    climb: context.terrain ? { gainM: context.terrain.gain_m } : { unavailable: 'Not available for this edition.' },
  };
}

/** The report for nine valid cumulative mat times (whole seconds), with whatever data has loaded so far. */
export function buildReport(input: ReportInput): ReportModel {
  const { times } = input;
  const reading = readSplits(times);
  let slowKm = 0;
  if (reading.onsetKm !== null) for (let i = (reading.onsetKm - 20) / 5 + 4; i < 9 && qualifies(reading.vsBaseline[i]); i += 1) slowKm += SECTION_KM[i];
  const race = input.record ? `${input.record.edition.city} ${input.record.edition.year}` : input.race.city ? `${input.race.city}${input.race.year ? ` ${input.race.year}` : ''}` : null;
  let start = 0;
  return {
    times, race, finish: times[8], average: times[8] / 42.195, baseline: reading.baseline,
    sections: reading.paces.map((pace, i) => {
      const section = { index: i, startKm: start, endKm: start + SECTION_KM[i], seconds: times[i] - (i ? times[i - 1] : 0), pace, vsBaseline: reading.vsBaseline[i], tone: toneOf(reading, i) };
      start += SECTION_KM[i];
      return section;
    }),
    slowdown: { yes: reading.slowdown, onsetKm: reading.onsetKm, slowKm },
    opening: { fraction: reading.opening, band: openingBandOf(reading.opening * 100, input.openingBands) },
    type: typeOf(reading, input.types),
    comparison: comparisonOf(input.comparison, times[8]),
    record: input.record ? recordOf(input.record) : null,
  };
}

/** "6:11 ahead", "1:38 behind", "level": this race at a mat against a group's median there. */
export function ahead(seconds: number): string {
  const s = Math.round(seconds);
  return s === 0 ? 'level' : `${formatDuration(Math.abs(s))} ${s < 0 ? 'ahead' : 'behind'}`;
}
/** "6:11 ahead of", "1:38 behind", "level with": the same, before a group's name. */
export function relation(seconds: number): string {
  const s = Math.round(seconds);
  return s === 0 ? 'level with' : `${formatDuration(Math.abs(s))} ${s < 0 ? 'ahead of' : 'behind'}`;
}

/* ---------- Words and numbers in the visitor's units (the image and its alternative text) ---------- */

/** A pace in seconds per km, in the units shown, with its unit: "9:17/mi". */
export const paceText = (sPerKm: number, units: UnitSystem) => `${formatDuration(units === 'mi' ? sPerKm * KM_PER_MILE : sPerKm)}/${units}`;
/** A section between two mats, named the same in both unit modes: "30–35K", "40K–finish" (lib/units). */
export const sectionText = (section: Pick<ReportSection, 'startKm' | 'endKm'>) => sectionLabel(section.startKm, section.endKm);
/** A mat by its name in both unit modes: "30K", "Finish". */
export const kmText = (km: number) => matLabel(km);
/** A share in whole percent, as the report speaks everywhere else ("11%"). */
export const shareText = (v: number) => pct(v);

/**
 * What the saved image shows, line by line, and what its alternative text says: the race, finish and average pace, the
 * nine sections, the sustained-slowdown reading, the pacing type and one comparison line with its finishes. Never a
 * name, rank or percentile, and nothing from a runner record's edition (the year names the race only).
 */
export function reportLines(model: ReportModel, units: UnitSystem) {
  const { comparison: c, type: t } = model;
  return {
    race: model.race,
    finish: formatDuration(model.finish, true),
    pace: `average ${paceText(model.average, units)}`,
    baseline: `5–20K pace ${paceText(model.baseline, units)}`,
    sections: model.sections.map((s) => ({ label: sectionText(s), mat: matLabel(s.endKm), split: formatDuration(Math.round(s.seconds)), pace: paceText(s.pace, units), change: pctSigned(s.vsBaseline), tone: s.tone, vs: s.vsBaseline })),
    slowdown: model.slowdown.yes && model.slowdown.onsetKm !== null ? `Sustained slowdown: yes, from ${kmText(model.slowdown.onsetKm)}` : 'Sustained slowdown: no',
    type: t.state === 'ok' ? `Pacing type: ${t.name}, the shape of ${approxWords(t.share)} finishes` : null,
    comparison: c.state === 'ok' ? `Of ${count(c.n)} ${c.label}, ${c.slowdownShare === null ? 'the share with a sustained slowdown is not published' : `${shareText(c.slowdownShare)} had a sustained slowdown`}.` : null,
  };
}

/** A course's city by its slug, from the report data's own keys only: `constructor` or `__proto__` in a link is no course. */
export function reportCourseCity(courses: Record<string, string>, slug: string): string | null {
  return Object.prototype.hasOwnProperty.call(courses, slug) ? courses[slug] : null;
}

/** The label the image draws over its Pace Notes data lines (the pacing type and the comparison), and the alt text says. */
export const REPORT_DATA_LABEL = 'Pace Notes data';

/** The image's alternative text: its numbers in one paragraph, the data lines under the same label as in the image. */
export function reportImageAlt(model: ReportModel, units: UnitSystem): string {
  const l = reportLines(model, units);
  return [`Pace Notes race report${l.race ? `, ${l.race}` : ''}. Finish ${l.finish}, ${l.pace}. ${l.baseline}.`,
    `Sections: ${l.sections.map((s) => `${s.label} ${s.pace} (${s.change})`).join(', ')}.`,
    `${l.slowdown}.`, l.type || l.comparison ? `${REPORT_DATA_LABEL}.` : '', l.type ? `${l.type}.` : '', l.comparison ?? ''].filter(Boolean).join(' ');
}
