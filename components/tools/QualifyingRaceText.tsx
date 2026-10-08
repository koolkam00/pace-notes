/**
 * Words for the per-race qualifying pages (/tools/qualifying/[race]): names, years, dates, titles and descriptions.
 * Every number comes from lib/tools/qualifying.ts at build time; nothing here types a standard, a year or a date.
 * Pure functions, safe in server components and metadata.
 */
import { BOSTON_CUTOFFS, STANDARDS, VERIFIED_AT, type Band, type Standard } from '@/lib/tools/qualifying';
import { formatDuration } from '@/lib/tools/time';

/** The page path for a race, from the library's own key. */
export const racePath = (s: Standard) => `/tools/qualifying/${s.key}`;
/** The checker, scrolled to this race's card (the card's id in QualifyingChecker). No personal data in the link. */
export const checkerHref = (s: Standard) => `/tools/qualifying#qualifying-${s.key}`;
export const standardByKey = (key: string) => STANDARDS.find((s) => s.key === key);

/** The race year the standards apply to: the edition's leading year, as the checker reads it. */
export function raceYear(s: Standard): string {
  const year = /^(\d{4})\b/.exec(s.edition)?.[1];
  if (!year) throw new Error(`Qualifying edition without a leading year: ${s.key} ${JSON.stringify(s.edition)}`);
  return year;
}

/** What the edition string adds after the year, e.g. "132nd, April 17, 2028"; empty when it is only a year. */
export function editionDetail(s: Standard): string {
  return /^\d{4}\s*\((.*)\)\s*$/.exec(s.edition)?.[1] ?? '';
}

/** "London Marathon" from "London Marathon (Good For Age)". */
export const raceName = (s: Standard) => s.race.replace(/\s*\(.*\)\s*$/, '');
/** "London" from "London Marathon", for compact lists. */
export const shortName = (s: Standard) => raceName(s).replace(/\s+Marathon$/, '');

/** Who publishes the standards, for sentences. */
const ORGANISER: Record<string, string> = {
  boston: 'the B.A.A.', nyc: 'NYRR', london: 'London Marathon Events', chicago: 'the Chicago Marathon', berlin: 'the Berlin Marathon', sydney: 'the Sydney Marathon',
};
export const organiser = (s: Standard) => ORGANISER[s.key] ?? 'the race';
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "the B.A.A.’s", "NYRR’s", "London Marathon Events’". */
export const possessive = (text: string) => (text.endsWith('s') ? `${text}’` : `${text}’s`);

/** The entry route the standards belong to, where the race names one (as an adjective). */
const PROGRAM: Record<string, string> = { london: 'Good For Age', berlin: 'fast-runner', sydney: 'High Performance Program' };
export const program = (s: Standard) => PROGRAM[s.key] ?? null;

/** The noun the page is about: "qualifying times", or London's own "Good For Age times". */
const NOUN: Record<string, string> = { london: 'Good For Age times' };
export const pageNoun = (s: Standard) => NOUN[s.key] ?? 'qualifying times';

/** The name searchers use in titles, where it differs from the race name. */
const SEARCH_NAME: Record<string, string> = { nyc: 'NYC Marathon' };

/** H1: "Boston Marathon qualifying times for 2028". */
export const pageHeading = (s: Standard) => `${raceName(s)} ${pageNoun(s)} for ${raceYear(s)}`;

/** Divisions the library lists for this race, in table order. */
export const hasNonbinary = (s: Standard) => s.bands.some((b) => b.nonbinary !== undefined);
export function divisions(s: Standard): { key: 'men' | 'women' | 'nonbinary'; label: string }[] {
  return [{ key: 'men', label: 'Men' }, { key: 'women', label: 'Women' }, ...(hasNonbinary(s) ? [{ key: 'nonbinary' as const, label: 'Non-binary' }] : [])];
}
export const divisionWords = (s: Standard) => (hasNonbinary(s) ? 'men, women and non-binary athletes' : 'men and women');

/** Open-ended top band: the library closes it at 120. */
const OPEN_TOP = 120;
export const ageLabel = (b: Band) => (b.max >= OPEN_TOP ? `${b.min}+` : `${b.min}–${b.max}`);
/** Birth years for a birth-year band (Berlin): the age reached in ageYear. */
export function bornLabel(s: Standard, b: Band): string {
  const year = s.ageYear!;
  return b.max >= OPEN_TOP ? `${year - b.min} or earlier` : `${year - b.max}–${year - b.min}`;
}
export const fmtStandard = (seconds: number) => formatDuration(seconds, true);
/** A cut-off or margin under the standard: "5:17". */
export const fmtMargin = (seconds: number) => formatDuration(seconds);

/* ---------- Dates (YYYY-MM-DD, formatted in UTC so no time zone shifts a day) ---------- */

const LONG = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const utc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const fmtDate = (iso: string) => LONG.format(utc(iso));
const fmtMonth = (iso: string) => MONTH.format(utc(iso));
export const checkedDate = () => fmtDate(VERIFIED_AT);

/** The earlier of the window end and the application close: proof goes in with the application (as evaluate() applies it). */
export function lastRunDate(s: Standard): { date?: string; byApplications: boolean } {
  const closes = s.applications?.closes;
  if (closes && (!s.windowEnd || closes < s.windowEnd)) return { date: closes, byApplications: true };
  return { date: s.windowEnd, byApplications: false };
}

/** The window in a few words for descriptions: "2026", "2025 and 2026", "January 2025 to October 2026", "since July 2025". */
function windowWords(s: Standard): string {
  const start = s.windowStart;
  const end = s.windowEnd;
  if (!end) return `since ${fmtMonth(start)}`;
  const whole = start.endsWith('-01-01') && end.endsWith('-12-31');
  const [y0, y1] = [start.slice(0, 4), end.slice(0, 4)];
  if (whole) return y0 === y1 ? y0 : Number(y1) - Number(y0) === 1 ? `${y0} and ${y1}` : `${y0} to ${y1}`;
  return `${fmtMonth(start)} to ${fmtMonth(end)}`;
}

/* ---------- Search metadata ---------- */

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const titleCase = (text: string) => text.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** "Boston Marathon Qualifying Times 2028 by Age | Pace Notes", shortened until it fits 60 characters. */
export function pageTitle(s: Standard): string {
  const name = SEARCH_NAME[s.key] ?? raceName(s);
  const noun = titleCase(pageNoun(s));
  const year = raceYear(s);
  const byAge = /\bAge\b/.test(noun) ? '' : ' by Age';
  const variants = [`${name} ${noun} ${year}${byAge} | Pace Notes`, `${name} ${noun} ${year} | Pace Notes`, `${name} ${noun} ${year}`];
  return variants.find((t) => t.length <= MAX_TITLE) ?? variants[variants.length - 1];
}

/** One description per race, built from the library's fields; the first variant that fits 155 characters. */
export function pageDescription(s: Standard): string {
  const year = raceYear(s);
  const name = SEARCH_NAME[s.key] ?? raceName(s);
  const who = hasNonbinary(s) ? 'men, women and non-binary' : 'men and women';
  const by = s.ageRule === 'birth-year' ? 'by birth year' : 'by age';
  const window = s.windowEnd ? `the ${windowWords(s)} window` : `the window ${windowWords(s)}`;
  const first = BOSTON_CUTOFFS[0]?.year;
  const last = BOSTON_CUTOFFS[BOSTON_CUTOFFS.length - 1]?.year;
  const pools = s.poolHistory?.map((p) => p.year) ?? [];
  const specific: Record<string, string> = {
    boston: `${name} ${year} qualifying times by age for ${who}, the downhill rule and every published B.A.A. cut-off from ${first} to ${last}.`,
    nyc: `${name} ${year} qualifying times by age for ${who}, ${window}, guaranteed NYRR entry and the capped pool${pools.length ? ' with its past cut-offs' : ''}.`,
    london: `${name} ${year} Good For Age times for ${who} by age group, ${window} and how places are allocated.`,
    chicago: `${name} ${year} qualifying times by age for ${who}, ${window} and the application dates.`,
    berlin: `${name} ${year} fast-runner qualifying times for ${who} by birth year, marathons from ${windowWords(s)}, and why a place is not guaranteed.`,
    sydney: `${name} ${year} High Performance Program standards by age for ${who}, ${window}${s.maxNetDropM !== undefined ? ` and the ${s.maxNetDropM} m course-drop limit` : ''}.`,
  };
  const generic = `${name} ${year} ${pageNoun(s)} ${by} for ${who}, ${window} and the age rule, from the official page.`;
  const variants = [specific[s.key], generic, `${name} ${year} ${pageNoun(s)} ${by} for ${who}, from the official page.`].filter((t): t is string => Boolean(t));
  return variants.find((t) => t.length <= MAX_DESCRIPTION) ?? variants[variants.length - 1];
}
