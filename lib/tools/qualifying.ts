/**
 * Marathon qualifying standards, transcribed from official race pages and verified on VERIFIED_AT.
 * Review every entry before each registration season (see docs/TOOLS.md). Times are seconds.
 * Meeting a standard is not entry: each race applies its own cut-off, cap, review or lottery.
 */

export const VERIFIED_AT = '2026-10-07';

export type Division = 'men' | 'women' | 'nonbinary';
export type AgeRule = 'race-day' | 'time-run' | 'birth-year';
export type Comparison = 'at-or-under' | 'strictly-under';

const hm = (h: number, m: number) => h * 3600 + m * 60;

export interface Band { min: number; max: number; men: number; women: number; nonbinary?: number }

export interface Standard {
  key: string;
  race: string;
  edition: string;
  ageRule: AgeRule;
  /** Race day (race-day rule) or the reference year (birth-year rule: age reached in that year). */
  ageDate?: string;
  ageYear?: number;
  comparison: Comparison;
  windowStart: string;
  windowEnd?: string;
  windowNote: string;
  applications?: { opens?: string; closes?: string; note: string };
  entry: string;
  bands: Band[];
  nonbinaryNote: string;
  extra?: string[];
  sources: { label: string; url: string }[];
  /** A capped pool's most recent observed cut-off (seconds under the standard), e.g. New York's non-NYRR pool. Past, not a forecast. */
  poolCutoff?: { year: number; seconds: number };
  /** Largest accepted course net drop, in metres (Sydney). */
  maxNetDropM?: number;
  /** Qualifiers who missed the cut-off but were drawn at random, by race year (Boston 2027). */
  randomSelection?: { year: number; drawn: number };
}

const majorBands = (rows: [number, number, number, number][]): Band[] =>
  rows.map(([min, max, men, women]) => ({ min, max, men, women, nonbinary: women }));

export const BOSTON_CUTOFFS: { year: number; cutoff: number; field: number; notAccepted: number; note?: string }[] = [
  { year: 2012, cutoff: 74, field: 27000, notAccepted: 3228 },
  { year: 2014, cutoff: 98, field: 36000, notAccepted: 2976 },
  { year: 2015, cutoff: 62, field: 30000, notAccepted: 1947 },
  { year: 2016, cutoff: 148, field: 30000, notAccepted: 4562 },
  { year: 2017, cutoff: 129, field: 30000, notAccepted: 2957 },
  { year: 2018, cutoff: 203, field: 30000, notAccepted: 5062 },
  { year: 2019, cutoff: 292, field: 30000, notAccepted: 7248 },
  { year: 2020, cutoff: 99, field: 31500, notAccepted: 3161, note: 'Race later held virtually' },
  { year: 2021, cutoff: 467, field: 20000, notAccepted: 9215, note: 'Reduced field' },
  { year: 2022, cutoff: 0, field: 30000, notAccepted: 0 },
  { year: 2023, cutoff: 0, field: 30000, notAccepted: 0 },
  { year: 2024, cutoff: 329, field: 30000, notAccepted: 11039 },
  { year: 2025, cutoff: 411, field: 30000, notAccepted: 12324 },
  { year: 2026, cutoff: 274, field: 30000, notAccepted: 8887 },
  { year: 2027, cutoff: 317, field: 30000, notAccepted: 8019, note: 'Plus about 1,000 qualifiers drawn at random' },
];

/** B.A.A. net-downhill index (from 2027 registration): drop = start elevation − finish elevation, in feet. */
export function bostonDownhillIndex(dropFeet: number): number | null {
  if (!(dropFeet >= 1500)) return 0;
  if (dropFeet < 3000) return 300;
  if (dropFeet < 6000) return 600;
  return null; // not accepted for qualifying
}

export const STANDARDS: Standard[] = [
  {
    key: 'boston', race: 'Boston Marathon', edition: '2028 (132nd, expected April 17, 2028)', ageRule: 'race-day', ageDate: '2028-04-17',
    comparison: 'at-or-under', windowStart: '2026-09-19', windowNote: 'Times from September 19, 2026 through 2027 registration week count for 2028.',
    applications: { note: 'Registration week is usually mid-September (2027 race: September 14–18, 2026). Accepted runners are those fastest relative to their standard.' },
    entry: 'Meeting the standard lets you apply. Acceptance depends on the cut-off (and, for 2027, a random selection of about 1,000 qualifiers who missed it).',
    randomSelection: { year: 2027, drawn: 1000 },
    bands: majorBands([[18, 34, hm(2, 55), hm(3, 25)], [35, 39, hm(3, 0), hm(3, 30)], [40, 44, hm(3, 5), hm(3, 35)], [45, 49, hm(3, 15), hm(3, 45)],
      [50, 54, hm(3, 20), hm(3, 50)], [55, 59, hm(3, 30), hm(4, 0)], [60, 64, hm(3, 50), hm(4, 20)], [65, 69, hm(4, 5), hm(4, 35)],
      [70, 74, hm(4, 20), hm(4, 50)], [75, 79, hm(4, 35), hm(5, 5)], [80, 120, hm(4, 50), hm(5, 20)]]),
    nonbinaryNote: 'Non-binary standards equal the women’s. A non-binary time must come from a race that offered the category, unless it offered none.',
    extra: ['The 2028 race date is expected to be Patriots’ Day, April 17, 2028; the B.A.A. had not confirmed it when this was checked.',
      'Net (chip) time on a certified course. No virtual, indoor, treadmill or time-trial marathons.',
      'From 2027 registration, courses with a net drop of 1,500–2,999 ft add 5:00, 3,000–5,999 ft add 10:00, and 6,000 ft or more are not accepted.'],
    sources: [{ label: 'B.A.A. qualifying standards', url: 'https://www.baa.org/races/boston-marathon/qualify/' },
      { label: 'B.A.A. qualifier history', url: 'https://www.baa.org/races/boston-marathon/enter/qualify/history-qualifying-times' },
      { label: 'B.A.A. 2027 registration update', url: 'https://www.baa.org/news/2027-boston-marathon-presented-by-bank-of-america-registration-update/' }],
  },
  {
    key: 'nyc', race: 'New York City Marathon', edition: '2027 (November 7, 2027)', ageRule: 'race-day', ageDate: '2027-11-07',
    comparison: 'at-or-under', windowStart: '2026-01-01', windowEnd: '2026-12-31', windowNote: 'Times run January 1 – December 31, 2026.',
    entry: 'NYRR races (and listed NYRR half marathons) give guaranteed entry. Other marathons enter a capped pool, fastest first: for 2026 that pool took runners at least 22:52 under their standard.',
    poolCutoff: { year: 2026, seconds: 22 * 60 + 52 },
    bands: majorBands([[18, 34, hm(2, 53), hm(3, 13)], [35, 39, hm(2, 55), hm(3, 15)], [40, 44, hm(2, 58), hm(3, 26)], [45, 49, hm(3, 5), hm(3, 38)],
      [50, 54, hm(3, 14), hm(3, 51)], [55, 59, hm(3, 23), hm(4, 10)], [60, 64, hm(3, 34), hm(4, 27)], [65, 69, hm(3, 45), hm(4, 50)],
      [70, 74, hm(4, 10), hm(5, 30)], [75, 79, hm(4, 30), hm(6, 0)], [80, 120, hm(4, 55), hm(6, 35)]]),
    nonbinaryNote: 'Non-binary standards equal the women’s. Apply in the gender your result was posted under, or as non-binary if the race offered no non-binary option.',
    extra: ['Half-marathon times count only from NYRR half marathons.', 'Net (chip) time; “at least as fast as” the standard.'],
    sources: [{ label: 'NYRR time qualifiers', url: 'https://www.nyrr.org/tcsnycmarathon/runners/marathon-time-qualifiers' },
      { label: 'NYRR 2026 drawing results', url: 'https://www.nyrr.org/media-center/press-release/2026_0304_tcsnycmdrawingday' }],
  },
  {
    key: 'london', race: 'London Marathon (Good For Age)', edition: '2027 (April 24–25, 2027)', ageRule: 'time-run',
    comparison: 'strictly-under', windowStart: '2025-10-01', windowEnd: '2026-09-30', windowNote: 'Times run October 1, 2025 – September 30, 2026.',
    applications: { closes: '2026-10-29', note: 'Applications close 16:00 GMT, October 29, 2026. UK residents only.' },
    entry: '6,000 places (3,000 men, 3,000 women) allocated fastest first relative to age and standard.',
    bands: [[18, 39, hm(2, 52), hm(3, 38)], [40, 44, hm(2, 57), hm(3, 43)], [45, 49, hm(3, 2), hm(3, 46)], [50, 54, hm(3, 7), hm(3, 53)],
      [55, 59, hm(3, 12), hm(3, 58)], [60, 64, hm(3, 34), hm(4, 23)], [65, 69, hm(3, 52), hm(4, 53)], [70, 74, hm(4, 52), hm(5, 53)],
      [75, 79, hm(5, 7), hm(6, 13)], [80, 84, hm(5, 27), hm(6, 38)], [85, 89, hm(6, 10), hm(7, 10)], [90, 120, hm(7, 20), hm(7, 45)]]
      .map(([min, max, men, women]) => ({ min, max, men, women })),
    nonbinaryNote: 'London Good For Age has men’s and women’s categories only.',
    extra: ['Age is your age on the day you ran the qualifying time.', 'Times must be strictly under the standard (“sub”).'],
    sources: [{ label: 'London Marathon Events: Good For Age', url: 'https://www.londonmarathonevents.co.uk/london-marathon/good-age-entry' }],
  },
  {
    key: 'chicago', race: 'Chicago Marathon', edition: '2027 (October 10, 2027)', ageRule: 'race-day', ageDate: '2027-10-10',
    comparison: 'at-or-under', windowStart: '2025-01-01', windowEnd: '2026-10-29', windowNote: 'Times run January 1, 2025 – October 29, 2026.',
    applications: { opens: '2026-10-08', closes: '2026-10-29', note: 'Applications open 8 a.m. CT October 8 and close 2 p.m. CT October 29, 2026.' },
    entry: 'Time qualifiers who meet the standard are guaranteed entry; there is no cut-off.',
    bands: majorBands([[16, 34, hm(2, 50), hm(3, 20)], [35, 39, hm(2, 55), hm(3, 25)], [40, 44, hm(3, 0), hm(3, 30)], [45, 49, hm(3, 10), hm(3, 40)],
      [50, 54, hm(3, 15), hm(3, 50)], [55, 59, hm(3, 25), hm(3, 55)], [60, 64, hm(3, 40), hm(4, 15)], [65, 69, hm(3, 55), hm(4, 30)],
      [70, 74, hm(4, 15), hm(4, 45)], [75, 79, hm(4, 30), hm(5, 0)], [80, 120, hm(4, 50), hm(5, 20)]]),
    nonbinaryNote: 'Non-binary standards equal the women’s; the documented time must be in the division you apply in.',
    extra: ['Marathons only, on a certified course; no allowances for weather or course conditions.'],
    sources: [{ label: 'Chicago Marathon: apply', url: 'https://www.chicagomarathon.com/apply/' }],
  },
  {
    key: 'berlin', race: 'Berlin Marathon (fast runners)', edition: '2027', ageRule: 'birth-year', ageYear: 2027,
    comparison: 'at-or-under', windowStart: '2025-01-01', windowEnd: '2026-12-31', windowNote: 'Marathon times from 2025 or 2026.',
    applications: { opens: '2026-10-01', closes: '2026-11-12', note: 'Registration October 1 – November 12, 2026; results December 3, 2026.' },
    entry: 'Registering as a fast runner does not guarantee a place; proof is reviewed, and invalid proof moves you to the lottery.',
    bands: [[18, 44, hm(2, 45), hm(3, 10)], [45, 59, hm(2, 55), hm(3, 30)], [60, 120, hm(3, 25), hm(4, 20)]].map(([min, max, men, women]) => ({ min, max, men, women })),
    nonbinaryNote: 'Berlin lists men’s and women’s qualifying times only.',
    extra: ['Bands go by birth year: born 2009–1983, 1982–1968, and 1967 or earlier (the age reached in 2027).'],
    sources: [{ label: 'Berlin Marathon registration', url: 'https://www.generali-berlin-marathon.com/en/registration/run' }],
  },
  {
    key: 'sydney', race: 'Sydney Marathon (High Performance Program)', edition: '2027 (August 29, 2027)', ageRule: 'race-day', ageDate: '2027-08-29',
    comparison: 'at-or-under', windowStart: '2025-07-01', windowNote: 'Times run since July 1, 2025 on a World Athletics-certified course with a net drop of no more than 457 m.',
    applications: { closes: '2026-09-18', note: 'The 2027 application window ran September 14–18, 2026.' },
    entry: '1,200 places: 600 sub-elite (fastest overall) and 600 Good For Age (fastest within each age and gender group). Not guaranteed.',
    maxNetDropM: 457,
    bands: majorBands([[18, 34, hm(2, 45), hm(3, 18)], [35, 39, hm(2, 47), hm(3, 20)], [40, 44, hm(2, 51), hm(3, 27)], [45, 49, hm(2, 55), hm(3, 35)],
      [50, 54, hm(3, 0), hm(3, 43)], [55, 59, hm(3, 6), hm(3, 51)], [60, 64, hm(3, 17), hm(4, 13)], [65, 69, hm(3, 41), hm(4, 24)],
      [70, 74, hm(4, 7), hm(4, 35)], [75, 79, hm(4, 43), hm(5, 30)], [80, 120, hm(5, 46), hm(6, 36)]]),
    nonbinaryNote: 'Non-binary standards equal the women’s.',
    sources: [{ label: 'Sydney Marathon High Performance Program', url: 'https://www.tcssydneymarathon.com/high-performance-program' }],
  },
];

/** Whole years between a birth date and a date (both YYYY-MM-DD), handling February 29 birthdays. */
export function ageOn(birth: string, date: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

export interface QualifyInput {
  birth: string;            // YYYY-MM-DD, never stored in URLs
  division: Division;
  seconds: number;          // net (chip) time
  raceDate: string;         // YYYY-MM-DD the time was run
  dropFeet?: number;        // course net drop for Boston's index
  nyrr?: boolean;
  ukResident?: boolean;
}

export type Status = 'meets' | 'misses' | 'outside-window' | 'not-eligible' | 'no-category';

export interface QualifyResult {
  standard: Standard;
  age: number | null;
  ageLabel: string;
  band: Band | null;
  limit: number | null;
  counted: number;          // time after any index
  margin: number | null;    // limit − counted (positive = under)
  status: Status;
  notes: string[];
}

export function evaluate(s: Standard, input: QualifyInput): QualifyResult {
  const notes: string[] = [];
  let age: number;
  let ageLabel: string;
  if (s.ageRule === 'race-day') { age = ageOn(input.birth, s.ageDate!); ageLabel = `Age on race day (${s.ageDate}): ${age}`; }
  else if (s.ageRule === 'time-run') { age = ageOn(input.birth, input.raceDate); ageLabel = `Age when you ran it: ${age}`; }
  else { age = s.ageYear! - Number(input.birth.slice(0, 4)); ageLabel = `Born ${input.birth.slice(0, 4)}: the ${age}-in-${s.ageYear} band`; }
  const band = s.bands.find((b) => age >= b.min && age <= b.max) ?? null;
  let counted = input.seconds;
  if (s.key === 'boston' && input.dropFeet !== undefined) {
    const index = bostonDownhillIndex(input.dropFeet);
    if (index === null) {
      return { standard: s, age, ageLabel, band, limit: null, counted, margin: null, status: 'not-eligible', notes: ['A net drop of 6,000 ft or more is not accepted for Boston qualifying.'] };
    }
    if (index) notes.push(`Downhill index: +${index / 60}:00 added for a ${Math.round(input.dropFeet).toLocaleString('en-US')} ft net drop.`);
    counted += index;
  }
  if (!band) return { standard: s, age, ageLabel, band: null, limit: null, counted, margin: null, status: 'not-eligible', notes: [`No standard for age ${age}.`] };
  const limit = input.division === 'nonbinary' ? band.nonbinary ?? null : band[input.division];
  if (limit === null) return { standard: s, age, ageLabel, band, limit: null, counted, margin: null, status: 'no-category', notes: [s.nonbinaryNote] };
  const margin = limit - counted;
  const inside = input.raceDate >= s.windowStart && (!s.windowEnd || input.raceDate <= s.windowEnd);
  const passes = s.comparison === 'strictly-under' ? margin > 0 : margin >= 0;
  if (s.key === 'london' && input.ukResident === false) notes.push('London Good For Age places are for UK residents only.');
  if (s.key === 'nyc') notes.push(input.nyrr ? 'An NYRR race time meeting the standard gives guaranteed entry.' : 'A non-NYRR time enters the capped, fastest-first pool.');
  if (s.comparison === 'strictly-under' && margin === 0) notes.push('London requires a time strictly under the standard; equal is not enough.');
  return { standard: s, age, ageLabel, band, limit, counted, margin, status: !inside ? 'outside-window' : passes ? 'meets' : 'misses', notes };
}

/** Past Boston cut-offs this margin would have cleared (descriptive, not a forecast). */
export const clearedCutoffs = (margin: number) => BOSTON_CUTOFFS.filter((c) => margin >= c.cutoff);
