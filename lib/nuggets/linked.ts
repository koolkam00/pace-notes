/**
 * The nuggets of the chapter "Over the years" (the linked-records family, public/data/linked/, contract
 * docs/LINKED_RECORDS.md) and the "seen again" beat of /stories/final-kick. Every guard is the file's own verdict, read
 * as the contract states it, plus the floors the sentence needs; a `null` verdict is a fallback that states no reading.
 * The `…From` functions are pure (scripts/nuggets/linked.cjs recounts each one on the real files and on fixtures).
 *
 * Words (docs/LINKED_RECORDS.md "What may be said"): "runners whose records are linked by name" on first mention,
 * "linked runners" after it; counts are finishes, results, pairs or races, never runners; "recorded" before best, first
 * and second; a rate for runners only "who kept racing"; no rank, no converted time, no cause.
 */
import type { UnitSystem } from '@/lib/units';
import { getLinkedEditions, getLinkedRaces, readLinked } from '@/lib/linked-server';
import type { LinkedEditions, LinkedRaces } from '@/lib/linked-types';
import { count, countWord, pct, spokenPct, temp } from './format';
import type { Builder } from './build';
import type { Nugget, UnitsAware } from './types';

const MINUS = '−';
const both = (f: (units: UnitSystem) => string): UnitsAware<string> => ({ mi: f('mi'), km: f('km') });
/** A value already in percent (0.988 → "1.0%"), with the minus sign. */
export const pctOf = (v: number, digits = 1) => pct(v / 100, digits);
/** A signed value in percent: "+2.9%", "−1.9%", "0.0%". */
export const signedPct = (v: number, digits = 1) => {
  const s = pctOf(Math.abs(v), digits);
  return Number((v).toFixed(digits)) === 0 ? pctOf(0, digits) : `${v > 0 ? '+' : MINUS}${s}`;
};
/** Points, signed: "+10.3 points". */
export const signedPoints = (v: number, digits = 1) => `${Number(v.toFixed(digits)) === 0 ? '' : v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)} points`;

// ---- The shapes of the files the nuggets read (lib/linked-types.ts holds the two other agents read too)

export type LinkedChecks = {
  beyond: { editions: number; over_2_pct: number; over_3_pct: number; verified_editions: number; verified_over_2_pct: number; verified_over_3_pct: number };
  temperature: {
    start: { editions: number; groups: number; r: number; slope: number };
    window: { editions: number; groups: number; r: number; slope: number };
    bands: { editions: number; mean_pct: number | null; races: number; temp_from: number | null; temp_to: number | null }[];
  };
  slowdown: { bar: number; verdict: 'holds' | null; relation: { editions: number; groups: number; r: number; slope: number };
    points: { basis: string; label: string; series?: string; year: number; level: number; eligible: number; slow: number }[] };
  spread: { median_year_sd_pct: number; race_sd_pct: number; races: number };
  held_for_review: { label: string; year: number; series?: string }[];
  reviewed: { releases: { label: string; year: number; applies: boolean; review: Record<string, unknown> }[]; exclusions: { label: string; year: number; quoted_note: string; reason: string; series?: string }[] };
  [key: string]: unknown;
};
type ShareVerdict = 'more_often' | 'less_often' | 'as_often' | null;
type Variant = { recorded_bests: number; results: number };
export type LinkedBests = {
  cohort: { results: number; recorded_bests: number };
  by_recorded_attempt: { recorded_attempt: number; results: number; recorded_bests: number; share: number; shuffled_share: number; verdict: ShareVerdict; variants: Record<string, Variant> }[];
  new_recorded_best_size: { recorded_bests: number; median_minutes: number; median_pct: number; q25_minutes: number; q75_minutes: number; q25_pct: number; q75_pct: number; under_one_minute: number;
    variants: Record<string, { recorded_bests: number; median_minutes: number; median_pct: number }> };
  steps: { by_step: { from_recorded_attempt: number; pairs: number; faster: number; share_faster: number; median_pct: number; verdict: ShareVerdict }[] };
};
type AgeBand = { age_from: number; age_to: number; pairs: number; median_pct_per_year: number; verdict: 'stated' | null; slower: number;
  same_race: { median_pct_per_year: number; pairs: number }; verified: { median_pct_per_year: number; pairs: number }; high: { median_pct_per_year: number; pairs: number };
  by_sex: Partial<Record<'F' | 'M', { median_pct_per_year: number; pairs: number }>>; cross_section: Partial<Record<'F' | 'M', { pct_per_year: number; results: number }>> };
export type LinkedAge = { min_pairs: number; bands: AgeBand[] };
export type LinkedReturn = { verdict: 'less_often' | 'more_often' | null; difference_points: number; difference_lo_points: number; difference_hi_points: number; editions: number; years: [number, number]; within_years: number;
  with_slowdown: { finishes: number; seen_again: number; share: number }; matched_without: { finishes: number; share: number } };
export type AgainRow = { finish_from_s?: number | null; finish_to_s?: number | null; age_from?: number; age_to?: number; finishes: number; recorded_again: number; editions: number;
  share: number; expected_share: number; difference_points: number; lo_points: number; hi_points: number; verdict: 'more_often' | 'less_often' | null };
export type LinkedAgain = { within_years: number; by_finish: AgainRow[]; by_finish_band: AgainRow[]; by_age_band: AgainRow[] };

const checks = () => readLinked<LinkedChecks>('checks.json').data;
const bests = () => readLinked<LinkedBests>('bests.json').data;
const age = () => readLinked<LinkedAge>('age.json').data;
const back = () => readLinked<LinkedReturn>('return.json').data;
const again = () => readLinked<LinkedAgain>('recorded_again.json').data;

export const YEARS_PATH = '/stories/fast-and-slow-years';
export const RACES_PATH = '/stories/race-to-race';
export const BESTS_PATH = '/stories/recorded-bests';
export const AGE_PATH = '/stories/getting-older';
const LINKED_TERM = '/methodology#linked-records' as const;

/** A finish time in h:mm from seconds ("3:30"). */
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;
/** A band's words: "under 3:30", "3:30 to 3:59", "5:00 and over"; ages "40 to 44", "70 and over". */
export const finishBandWords = (r: AgainRow) => (r.finish_from_s == null ? `under ${hm(r.finish_to_s!)}` : r.finish_to_s == null ? `${hm(r.finish_from_s)} and over` : `${hm(r.finish_from_s)} to ${hm(r.finish_to_s - 60)}`);
export const ageBandWords = (b: { age_from: number; age_to: number }, top = 85) => (b.age_to >= top ? `${b.age_from} and over` : `${b.age_from} to ${b.age_to}`);

// ---------- Fast years and slow years

/**
 * The years story's guard, shared by its H1 and its figure: the whole-field check holds (the contract: a page about fast
 * and slow years falls back when it does not), and the file holds at least one slow and one fast year.
 */
export function yearsHold(e: Pick<LinkedEditions, 'summary'>, c: Pick<LinkedChecks, 'slowdown'>): boolean {
  return c.slowdown.verdict === 'holds' && (e.summary.by_verdict.slow ?? 0) > 0 && (e.summary.by_verdict.fast ?? 0) > 0;
}

export function yearsTitleFrom(e: Pick<LinkedEditions, 'summary'>, c: Pick<LinkedChecks, 'slowdown'>): Nugget {
  return {
    id: 'years.title', page: YEARS_PATH, denominator: 'records',
    values: { slow: e.summary.by_verdict.slow ?? 0, fast: e.summary.by_verdict.fast ?? 0, field_check: c.slowdown.verdict === 'holds' ? 1 : 0 },
    guard: yearsHold(e, c),
    headline: 'Some years of a race run *fast*, and some slow.',
    fallback: 'Fast years and slow years',
    figure: null,
  };
}

/** The years story's reading: the share of race-years more than 2% off the race's other years (the contract's finding). */
export function yearsBeyondFrom(e: Pick<LinkedEditions, 'summary'>, c: Pick<LinkedChecks, 'slowdown' | 'beyond'>): Nugget {
  const n = c.beyond.over_2_pct, total = c.beyond.editions, share = n / total;
  const guard = yearsHold(e, c) && total >= 3 && n > 0;
  return {
    id: 'years.beyond', page: YEARS_PATH, denominator: 'records', term: LINKED_TERM,
    values: { over_2: n, over_3: c.beyond.over_3_pct, editions: total, share },
    guard,
    headline: `In *${pct(share)}* of race-years, runners whose records are linked by name finished more than 2% faster or slower than in the race’s other years.`,
    fallback: `${count(total)} race-years, each read against the race’s other years, for records linked by name.`,
    figure: guard ? { value: pct(share).replace('%', ''), unit: '%', sr: spokenPct(share) } : { value: count(total), sr: `${count(total)} race-years` },
    key: guard ? 'of race-years more than 2% off the race’s other years, for linked runners' : 'race-years read for linked runners',
  };
}

/**
 * #heat: years whose race window was warm read slower against the race's own mean, as evidence beside the readings (no
 * weather enters the fit). Guard: both within-race relations are positive, the coolest and warmest bands each rest on
 * three editions, and the warmest band reads at least 2 points above the coolest.
 */
export function yearsHeatFrom(c: Pick<LinkedChecks, 'temperature'>): Nugget {
  const bands = c.temperature.bands.filter((b) => b.mean_pct !== null && b.editions >= 3);
  const cool = bands[0], warm = bands[bands.length - 1];
  const guard = !!cool && !!warm && cool !== warm && c.temperature.start.r > 0 && c.temperature.window.r > 0 && warm.temp_to === null && (warm.mean_pct as number) >= (cool.mean_pct as number) + 2;
  const at = warm?.temp_from ?? NaN;
  return {
    id: 'years.heat', page: `${YEARS_PATH}#heat`, denominator: 'records',
    values: { warm_from_c: at, warm_pct: warm?.mean_pct ?? NaN, cool_pct: cool?.mean_pct ?? NaN, r_window: c.temperature.window.r, r_start: c.temperature.start.r },
    guard,
    headline: both((u) => `At ${temp(at, u)} or warmer, linked runners finished *about ${pctOf(warm?.mean_pct ?? NaN, 0)} slower* than usual.`),
    fallback: 'Race years by the temperature of the race.',
    figure: null,
  };
}

/** #field: the whole-field check, in words (no person link enters its share). Guard: the file's verdict, `holds`. */
export function yearsFieldFrom(c: Pick<LinkedChecks, 'slowdown'>): Nugget {
  const r = c.slowdown.relation;
  return {
    id: 'years.field', page: `${YEARS_PATH}#field`, denominator: 'records', term: '/methodology#sustained-slowdown',
    values: { r: r.r, bar: c.slowdown.bar, editions: r.editions, groups: r.groups },
    guard: c.slowdown.verdict === 'holds' && r.r >= c.slowdown.bar,
    headline: 'Slow years were years of *more sustained slowdowns* in the whole field.',
    fallback: 'Race years and the whole field’s sustained slowdowns.',
    figure: null,
  };
}

// ---------- Race to race

type RaceRow = LinkedRaces['races'][string];
/** Every race reading in label order: the races, then each series of a label that has one ({label, series, row}). */
export function raceReadings(r: Pick<LinkedRaces, 'races' | 'series'>): { label: string; series: string | null; row: RaceRow }[] {
  const out = Object.entries(r.races).map(([label, row]) => ({ label, series: null as string | null, row }));
  for (const [label, named] of Object.entries(r.series ?? {})) for (const [series, row] of Object.entries(named)) out.push({ label, series, row });
  return out.sort((a, b) => a.label.localeCompare(b.label, 'en') || (a.series ?? '').localeCompare(b.series ?? '', 'en'));
}

export function racesTitleFrom(r: Pick<LinkedRaces, 'summary'>): Nugget {
  const f = r.summary.by_verdict.faster ?? 0, s = r.summary.by_verdict.slower ?? 0;
  return {
    id: 'races.title', page: RACES_PATH, denominator: 'records',
    values: { faster: f, slower: s },
    guard: f > 0 && s > 0,
    headline: 'Linked runners finished *faster at some races* than at others.',
    fallback: 'Race to race',
    figure: null,
  };
}

/** The race story's reading: how many race readings say faster (counts of races, in no order). */
export function racesFasterFrom(r: Pick<LinkedRaces, 'summary' | 'races' | 'series'>): Nugget {
  const s = r.summary, f = s.by_verdict.faster ?? 0, slower = s.by_verdict.slower ?? 0, same = s.by_verdict.about_the_same ?? 0;
  const total = raceReadings(r).length;
  const guard = f > 0 && f + slower + same + s.no_verdict === total;
  return {
    id: 'races.faster', page: RACES_PATH, denominator: 'records', term: LINKED_TERM,
    values: { faster: f, slower, about_the_same: same, no_verdict: s.no_verdict, readings: total },
    guard,
    headline: `Runners whose records are linked by name finished faster at *${count(f)}* of ${count(total)} races than at the other races of the same years.`,
    fallback: `${count(total)} races, each read against the other races of the same years, for records linked by name.`,
    figure: guard ? { value: count(f), unit: ` of ${count(total)}`, sr: `${count(f)} of ${count(total)}` } : { value: count(total), sr: `${count(total)} races` },
    key: guard ? 'races where linked runners finished faster than at other races of the same years' : 'races read for linked runners',
  };
}

// ---------- Recorded bests

type Attempt = LinkedBests['by_recorded_attempt'][number];
const second = (b: Pick<LinkedBests, 'by_recorded_attempt'>): Attempt | undefined => b.by_recorded_attempt.find((a) => a.recorded_attempt === 2);

export function bestsTitleFrom(b: Pick<LinkedBests, 'by_recorded_attempt'>): Nugget {
  const a = second(b);
  return {
    id: 'bests.title', page: BESTS_PATH, denominator: 'records',
    values: { share: a?.share ?? NaN, shuffled: a?.shuffled_share ?? NaN },
    guard: a?.verdict === 'more_often',
    headline: 'A second recorded marathon was faster than the first *a little more often than not*.',
    fallback: 'Recorded bests',
    figure: null,
  };
}

/** The bests story's reading: the share of second recorded marathons that were a recorded best (the guess's truth). */
export function bestsSecondFrom(b: Pick<LinkedBests, 'by_recorded_attempt'>): Nugget {
  const a = second(b);
  const share = a?.share ?? NaN;
  const guard = !!a && a.verdict === 'more_often' && a.results >= 100;
  return {
    id: 'bests.second', page: BESTS_PATH, denominator: 'records', term: LINKED_TERM,
    values: { share, shuffled: a?.shuffled_share ?? NaN, results: a?.results ?? NaN, recorded_bests: a?.recorded_bests ?? NaN },
    guard,
    headline: `For runners whose records are linked by name, *${pct(share)}* of second recorded marathons were faster than the first, against ${pct(a?.shuffled_share ?? NaN)} by order alone.`,
    fallback: `${count(a?.results ?? NaN)} second recorded marathons, for records linked by name.`,
    figure: Number.isFinite(share) ? { value: pct(share).replace('%', ''), unit: '%', sr: spokenPct(share) } : null,
    key: 'of second recorded marathons were faster than the first recorded one',
  };
}

/**
 * #later: from the first attempt that is `less_often` on, every attempt is `less_often` (a recorded best came less
 * often than order alone would give), and the attempts before it are not.
 */
export function bestsLaterFrom(b: Pick<LinkedBests, 'by_recorded_attempt'>): Nugget {
  const rows = b.by_recorded_attempt;
  const from = rows.findIndex((a) => a.verdict === 'less_often');
  const guard = from > 0 && rows.slice(from).every((a) => a.verdict === 'less_often') && rows.slice(0, from).every((a) => a.verdict !== 'less_often');
  const k = from >= 0 ? rows[from].recorded_attempt : NaN;
  const ord = (n: number) => countWord(n);
  return {
    id: 'bests.later', page: `${BESTS_PATH}#later`, denominator: 'records',
    values: { from_attempt: k, attempts: rows.length },
    guard,
    headline: `After ${ord(k - 1)} recorded marathons, recorded bests came *less often* than order alone.`,
    fallback: 'Recorded bests, marathon by recorded marathon.',
    figure: null,
  };
}

/**
 * #again: finishes in the fastest group were followed by another recorded marathon within the window more often than
 * the other finishes of the same races, and those in the slowest group less often (the one comparison the contract
 * allows: a `more_often` row against a `less_often` row of the same table).
 */
export function againFinishFrom(a: Pick<LinkedAgain, 'by_finish' | 'within_years'>): Nugget {
  const rows = a.by_finish, first = rows[0], last = rows[rows.length - 1];
  const guard = !!first && !!last && first !== last && first.verdict === 'more_often' && last.verdict === 'less_often';
  return {
    id: 'again.finish', page: `${BESTS_PATH}#again`, denominator: 'records',
    values: { first_to_s: first?.finish_to_s ?? NaN, last_from_s: last?.finish_from_s ?? NaN, first_points: first?.difference_points ?? NaN, last_points: last?.difference_points ?? NaN },
    guard,
    headline: `Finishes ${first ? finishBandWords(first) : ''} were *recorded again more often*; from ${last?.finish_from_s != null ? hm(last.finish_from_s) : ''}, less.`,
    fallback: 'Finishes recorded at another marathon, by finish time.',
    figure: null,
  };
}

// ---------- Getting older

const stated = (a: Pick<LinkedAge, 'bands'>) => a.bands.filter((b) => b.verdict === 'stated');
export function ageTitleFrom(a: Pick<LinkedAge, 'bands'>): Nugget {
  const bands = stated(a);
  const rising = bands.length >= 3 && bands.length === a.bands.length && bands.every((b, i) => i === 0 || b.median_pct_per_year > bands[i - 1].median_pct_per_year);
  return {
    id: 'age.title', page: AGE_PATH, denominator: 'records',
    values: { bands: bands.length },
    guard: rising,
    headline: 'Year on year, older linked runners who kept racing *slowed more*.',
    fallback: 'Getting older',
    figure: null,
  };
}

/** The age story's reading: the median change per year at 50 to 54 (the contract's example band), under its verdict. */
export function ageFiftyFrom(a: Pick<LinkedAge, 'bands'>): Nugget {
  const band = a.bands.find((b) => b.age_from === 50);
  const v = band?.median_pct_per_year ?? NaN;
  const guard = band?.verdict === 'stated' && v > 0 && band.pairs >= 100;
  return {
    id: 'age.fifty', page: AGE_PATH, denominator: 'records', term: LINKED_TERM,
    values: { median_pct: v, pairs: band?.pairs ?? NaN, age_from: band?.age_from ?? NaN, age_to: band?.age_to ?? NaN },
    guard,
    headline: `Runners whose records are linked by name, aged 50 to 54 with three or more recorded marathons, who kept racing, ran the next one a typical *${pctOf(v)}* slower per year.`,
    fallback: band ? `${count(band.pairs)} pairs of recorded marathons at 50 to 54, for records linked by name.` : 'Pairs of recorded marathons by age, for records linked by name.',
    figure: guard ? { value: pctOf(v).replace('%', ''), unit: '%', sr: `${v.toFixed(1)} percent` } : band ? { value: count(band.pairs), sr: `${count(band.pairs)} pairs` } : null,
    key: guard ? 'slower per year than the recorded marathon before, at 50 to 54, who kept racing' : 'pairs of recorded marathons at 50 to 54',
  };
}

/**
 * #across: from 45 on, following the same recorded men shows a steeper yearly change than comparing different men of
 * the same age (the cross-section). Guard: every stated band from 45 holds both the men's pairs and the men's
 * cross-section, and in each the pairs' median is above the cross-section's slope. Men only: the contract reads the
 * men's where the sexes may differ.
 */
export function ageAcrossFrom(a: Pick<LinkedAge, 'bands' | 'min_pairs'>): Nugget {
  const rows = a.bands.filter((b) => b.age_from >= 45);
  const guard = rows.length >= 3 && rows.every((b) => b.verdict === 'stated' && b.by_sex.M && b.by_sex.M.pairs >= a.min_pairs && b.cross_section.M && b.by_sex.M.median_pct_per_year > b.cross_section.M.pct_per_year);
  return {
    id: 'age.across', page: `${AGE_PATH}#across`, denominator: 'records',
    values: { bands: rows.length },
    guard,
    headline: 'From 45, recorded men slowed *more per year* than different men suggest.',
    fallback: 'Recorded men: pairs of recorded marathons and different men of the same age.',
    figure: null,
  };
}

/** #again: by age at the race, the youngest band recorded again less often and the oldest more often (more_often against less_often). */
export function againAgeFrom(a: Pick<LinkedAgain, 'by_age_band'>): Nugget {
  const rows = a.by_age_band, first = rows[0], last = rows[rows.length - 1];
  const less = rows.filter((r) => r.verdict === 'less_often'), more = rows.filter((r) => r.verdict === 'more_often');
  // The two runs: the bands from the youngest that are less_often, the bands to the oldest that are more_often.
  const lowEnd = rows.findIndex((r) => r.verdict !== 'less_often');
  const highStart = rows.length - [...rows].reverse().findIndex((r) => r.verdict !== 'more_often');
  const guard = !!first && !!last && less.length > 0 && more.length > 0 && lowEnd > 0 && highStart < rows.length && lowEnd <= highStart;
  const under = guard ? rows[lowEnd].age_from! : NaN, from = guard ? rows[highStart].age_from! : NaN;
  return {
    id: 'again.age', page: `${AGE_PATH}#again`, denominator: 'records',
    values: { under_age: under, from_age: from, less: less.length, more: more.length },
    guard,
    headline: `From ${from}, finishes were *recorded again more often*; under ${under}, less.`,
    fallback: 'Finishes recorded at another marathon, by age at the race.',
    figure: null,
  };
}

// ---------- Seen again after a sustained slowdown (/stories/final-kick)

export function againSlowdownFrom(r: LinkedReturn): Nugget {
  const w = r.with_slowdown.share, o = r.matched_without.share;
  const guard = r.verdict === 'less_often' && r.difference_hi_points < 0 && w < o;
  return {
    id: 'again.slowdown', page: '/stories/final-kick#seen-again', denominator: 'records', term: '/methodology#sustained-slowdown',
    values: { with_slowdown: w, without: o, difference_points: r.difference_points, lo: r.difference_lo_points, hi: r.difference_hi_points },
    guard,
    headline: `After a sustained slowdown, linked runners were seen again *slightly less often*.`,
    fallback: 'Finishes with and without a sustained slowdown, and another recorded marathon.',
    figure: null,
  };
}

export const LINKED_NUGGETS: Record<string, Builder> = {
  'years.title': () => yearsTitleFrom(getLinkedEditions().data, checks()),
  'years.beyond': () => yearsBeyondFrom(getLinkedEditions().data, checks()),
  'years.heat': () => yearsHeatFrom(checks()),
  'years.field': () => yearsFieldFrom(checks()),
  'races.title': () => racesTitleFrom(getLinkedRaces().data),
  'races.faster': () => racesFasterFrom(getLinkedRaces().data),
  'bests.title': () => bestsTitleFrom(bests()),
  'bests.second': () => bestsSecondFrom(bests()),
  'bests.later': () => bestsLaterFrom(bests()),
  'again.finish': () => againFinishFrom(again()),
  'age.title': () => ageTitleFrom(age()),
  'age.fifty': () => ageFiftyFrom(age()),
  'age.across': () => ageAcrossFrom(age()),
  'again.age': () => againAgeFrom(again()),
  'again.slowdown': () => againSlowdownFrom(back()),
};

export const linkedFiles = { checks, bests, age, back, again };
