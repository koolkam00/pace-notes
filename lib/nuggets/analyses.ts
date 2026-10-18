/**
 * Nuggets for the analyses and /slowdown's beats (WP3; the redesign spec, section 5). Every headline number and every
 * directional word on these pages comes from here, read from the verified files at build, with a guard for what the
 * sentence asserts and a neutral fallback. Each builder has a pure `…From(data)` twin so scripts/verify-nuggets.cjs
 * (through scripts/nuggets/analyses.cjs) can recount it independently and render every fallback on fixtures.
 *
 * No literal selectors: bands, sections, courses and editions are chosen by argmin or argmax of the nugget's own
 * values, by the band definitions in the data (upper edges, temperature bounds), or by order, never by a name or index.
 */
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { bandWords, type AllFinisherGroup } from '@/lib/all-finisher-context';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getCheckpointCurve, getCheckpointDefault, getCityData, getTerrainDefault, terrainSections, type CushionPoint, type TerrainSection } from '@/lib/analysis-server';
import { readInsight } from '@/lib/insights-server';
import type { Kick } from '@/lib/insights';
import { percentUnder } from '@/lib/personalized';
import type { CityData, Distribution, PersonalCohort } from '@/lib/personalized-types';
import { getStudyEvidence } from '@/lib/research-data';
import { MARATHON_SECTION_ENDS } from '@/lib/section-labels';
import { getWeatherEvidence } from '@/lib/weather-data';
import type { WeatherCandidate } from '@/lib/weather-types';
import { MARATHON_KM, distance, type UnitSystem } from '@/lib/units';
import { clock, count, countWord, delta, hm, ms, pct, sectionLabel, spokenPct, spokenTime, temp } from './format';
import { capitalize, shareFigure, type Builder } from './build';
import type { Nugget } from './types';

const GOAL = EXAMPLE_PROFILE.goal;
const both = (f: (u: UnitSystem) => string) => ({ mi: f('mi'), km: f('km') });
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Section i of the nine (0–5K … 40K–finish). */
const section = (i: number) => sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, MARATHON_SECTION_ENDS[i]);
/** A course's display name. */
export const courseName = (city: string) => (city === 'New York' ? 'New York City' : city);
/** Seconds per km as seconds per mile or per km, rounded: "25 s/mi". */
const perUnit = (sPerKm: number, u: UnitSystem) => `${Math.round(u === 'mi' ? sPerKm * 1.609344 : sPerKm)} s/${u}`;
/** One decimal, en-US. */
const one = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ---------- Chapter 02 · starting pace ----------

type BankBand = Kick['bank']['bands'][number];
/** The fastest opening band (argmin of its banked time), what it banked, where it finished, and its sustained slowdowns. */
export function kickBankFrom(bands: BankBand[]): Nugget {
  const fastest = bands.filter((b) => b.n >= 100).reduce<BankBand | null>((a, b) => (!a || b.open_s < a.open_s ? b : a), null);
  const ok = !!fastest && fastest.open_s < 0 && fastest.finish_s > 0;
  const said = bandWords(fastest?.label ?? '');
  return {
    id: 'kick.bank', page: '/analyses/starting-pace', denominator: 'kick', term: '/methodology#sustained-slowdown',
    values: fastest ? { band: fastest.label, n: fastest.n, open_s: fastest.open_s, after20_s: fastest.after20_s, finish_s: fastest.finish_s, slowdown: fastest.slowdown, expected: fastest.expected } : {},
    guard: ok,
    headline: `A first 5K ${said} banked ${ms(-(fastest?.open_s ?? 0))}, and *finished ${ms(fastest?.finish_s ?? 0)} behind*.`,
    fallback: 'How a fast first 5K finished, against the same pace.',
    figure: fastest ? { value: delta(fastest.finish_s), sr: `${spokenTime(Math.abs(fastest.finish_s))} ${fastest.finish_s > 0 ? 'behind' : 'ahead'}` } : null,
    key: `later at the finish, after a first 5K ${said}`,
  };
}

type CurvePoint = Kick['bank']['curve'][number];
/** A one-point opening bin in words: lo = 2 → "2–3% slower", lo = −3 → "2–3% faster", lo = −1 → "within 1% of even". */
export function openingWords(lo: number): string {
  if (lo >= 0) return `${lo}–${lo + 1}% slower`;
  if (lo + 1 <= 0) return `${Math.abs(lo + 1)}–${Math.abs(lo)}% faster`;
  return 'within 1% of even';
}
/** The opening bin with the best average finish against the same pace (argmin of finish_s). */
export function kickSweetSpotFrom(curve: CurvePoint[]): Nugget {
  const best = curve.filter((c) => c.n >= 100).reduce<CurvePoint | null>((a, b) => (!a || b.finish_s < a.finish_s ? b : a), null);
  const words = best ? openingWords(best.lo) : '';
  return {
    id: 'kick.sweetspot', page: '/analyses/starting-pace#sweet-spot', denominator: 'kick',
    values: best ? { lo: best.lo, n: best.n, finish_s: best.finish_s, after20_s: best.after20_s, slowdown: best.slowdown } : {},
    guard: !!best && best.lo > 0 && best.finish_s < 0,
    headline: `The best average finish went with a first 5K *${words}* than the pace that followed.`,
    fallback: best ? `The best average finish went with a first 5K ${words} than the pace that followed.` : 'The finish against the same pace, by first 5K.',
    figure: best ? { value: delta(best.finish_s), sr: `${spokenTime(Math.abs(best.finish_s))} ${best.finish_s < 0 ? 'ahead' : 'behind'}` } : null,
  };
}

// ---------- Chapter 02 · downhill starts ----------

type OpeningBand = { id: string; label: string; lower?: number | null; upper?: number | null };
/** The opening bands more than 5% faster than the pace that followed: those whose faster edge is at most −5. */
const fastBands = (bands: OpeningBand[]) => bands.filter((b) => typeof b.upper === 'number' && b.upper <= -5).map((b) => b.id);

/** The share of finishes that opened more than 5% fast, downhill-start courses against the rest. */
export function downhillOpeningFrom(groups: AllFinisherGroup[], bands: OpeningBand[]): Nugget {
  const fast = new Set(fastBands(bands));
  const share = (terrain: 'downhill' | 'other') => {
    const rows = groups.filter((g) => g.terrain === terrain);
    const total = rows.reduce((s, g) => s + g.n, 0);
    return { share: total ? rows.filter((g) => fast.has(g.opening ?? '')).reduce((s, g) => s + g.n, 0) / total : NaN, total, courses: rows.reduce((m, g) => Math.max(m, g.city_n), 0) };
  };
  const a = share('downhill'), b = share('other');
  const ok = finite(a.share) && finite(b.share) && a.total >= 100 && b.total >= 100 && Math.abs(a.share - b.share) < 0.02;
  return {
    id: 'downhill.opening', page: '/analyses/downhill-start', denominator: 'eligible',
    values: { downhill: a.share, other: b.share, downhill_n: a.total, other_n: b.total, courses: a.courses, bands: fast.size },
    guard: ok,
    headline: 'A downhill start didn’t mean a *faster opening*.',
    fallback: `${pct(a.share)} of downhill-start finishes opened more than 5% fast; elsewhere ${pct(b.share)}.`,
    // One number when both sides round to it (the finding is that they match), else the pair.
    figure: !finite(a.share) ? null : pct(a.share) === pct(b.share)
      ? { value: pct(a.share).replace('%', ''), unit: '%', sr: `${spokenPct(a.share)} on downhill-start courses and elsewhere` }
      : { value: `${pct(a.share).replace('%', '')} · ${pct(b.share).replace('%', '')}`, unit: '%', sr: `${spokenPct(a.share)} on downhill-start courses, ${spokenPct(b.share)} elsewhere` },
    key: pct(a.share) === pct(b.share) ? 'opened more than 5% fast, with a downhill start or without' : 'opened more than 5% fast: downhill-start courses · the rest',
  };
}

/** Two shares "differ" from 2 whole percentage points; within a point or so they are the same. */
export const BAND_GAP = 2;

/**
 * Band by band, the opening band where downhill-start courses and the rest differ most in sustained slowdown, said
 * only from 2 whole points apart (a 1-point gap is a null and reads as one). `fewer` counts the bands that differ by 2
 * points or more with fewer slowdowns on the downhill-start courses, for the chart's spoken label.
 */
export function downhillBandsFrom(groups: AllFinisherGroup[], bands: OpeningBand[]): Nugget {
  const pairs = bands.map((band) => ({ band, down: groups.find((g) => g.terrain === 'downhill' && g.opening === band.id), other: groups.find((g) => g.terrain === 'other' && g.opening === band.id) }))
    .filter((p) => p.down && p.other && p.down.n >= 100 && p.other.n >= 100);
  const gap = (p: (typeof pairs)[number]) => Math.round(p.other!.slowdown_pct) - Math.round(p.down!.slowdown_pct);
  const fewer = pairs.filter((p) => gap(p) >= BAND_GAP).length;
  const total = pairs.length;
  const clearest = pairs.reduce<(typeof pairs)[number] | undefined>((b, p) => (!b || Math.abs(p.other!.slowdown_pct - p.down!.slowdown_pct) > Math.abs(b.other!.slowdown_pct - b.down!.slowdown_pct) ? p : b), undefined);
  const down = clearest ? clearest.down!.slowdown_pct / 100 : NaN, other = clearest ? clearest.other!.slowdown_pct / 100 : NaN;
  const words = clearest ? (clearest.band.id === 'steady' ? 'within 2% of pace' : bandWords(clearest.band.label)) : '';
  return {
    id: 'downhill.bands', page: '/analyses/downhill-start#by-band', denominator: 'eligible', term: '/methodology#sustained-slowdown',
    values: { fewer, total, band: clearest?.band.id ?? '', downhill: down, other },
    guard: !!clearest && Math.abs(gap(clearest)) >= BAND_GAP,
    headline: `Opening ${words}, *${pct(down)}* had a sustained slowdown on downhill-start courses, against ${pct(other)} elsewhere.`,
    fallback: 'Sustained slowdown by opening band, downhill-start courses against the rest.',
    figure: null,
  };
}

// ---------- Chapter 03 · pacing pattern ----------

/** Finishes near the goal against even goal pace: the fastest and slowest 5K, and the first section slower than even. */
export function patternFrom(paces: number[], goal = GOAL): Nugget {
  const even = (goal * 60) / MARATHON_KM;
  const ok0 = paces.length === MARATHON_SECTION_ENDS.length && paces.every(finite);
  const fast = ok0 ? paces.reduce((b, p, i) => (p < paces[b] ? i : b), 0) : -1;
  const slow = ok0 ? paces.reduce((b, p, i) => (p > paces[b] ? i : b), 0) : -1;
  const turn = ok0 ? paces.findIndex((p, i) => i > fast && p > even) : -1;
  const ok = ok0 && paces[fast] < even && even < paces[slow] && fast < slow && turn > 0;
  return {
    id: 'pattern.profile', page: '/analyses/pacing-pattern', denominator: 'eligible',
    values: ok0 ? { goal_min: goal, even_s: even, fast_i: fast, slow_i: slow, turn_i: turn, fast_s: paces[fast], slow_s: paces[slow] } : {},
    guard: ok,
    headline: both((u) => `Finishes near ${hm(goal)} didn’t run ${hm(goal)} pace: ${perUnit(even - paces[fast], u)} fast early, *${perUnit(paces[slow] - even, u)} slow* late.`),
    fallback: `How finishes near ${hm(goal)} paced each 5K, against even ${hm(goal)} pace.`,
    figure: ok0 ? { value: section(slow), sr: `${section(slow)}, the slowest 5K` } : null,
    key: `the slowest 5K, for finishes near ${hm(goal)}`,
  };
}

// ---------- Chapter 04 · checkpoint ----------

/** Of finishes on even goal pace at the mat (the band holding it), the share that got under the goal. */
export function checkpointUnderFrom(row: { n: number; elapsed: number; finish: number[] } | null, share: number, goal = GOAL, mat = 30): Nugget {
  const ok = !!row && row.n >= 100 && finite(share);
  return {
    id: 'checkpoint.under', page: '/analyses/checkpoint', denominator: 'eligible',
    values: { goal_min: goal, mat_km: mat, band_min: row?.elapsed ?? NaN, n: row?.n ?? NaN, share, median_s: row?.finish[1] ?? NaN },
    guard: ok && share < 0.5,
    headline: `On even ${hm(goal)} pace at ${mat}K, only *${pct(share)}* got under ${hm(goal)}.`,
    fallback: `On even ${hm(goal)} pace at ${mat}K, ${pct(share)} of finishes got under ${hm(goal)}.`,
    figure: shareFigure(share), key: `on ${hm(goal)} pace at ${mat}K got under ${hm(goal)}`,
  };
}

/** The 30K split from which half the finishes got under the goal (interpolated between bands), against even pace. */
export function cushionAt(curve: CushionPoint[]): number {
  for (let i = 0; i + 1 < curve.length; i++) {
    const a = curve[i], b = curve[i + 1];
    if (a.share >= 0.5 && b.share < 0.5 && b.elapsed - a.elapsed === 2) return a.elapsed + 1 + ((a.share - 0.5) / (a.share - b.share)) * 2;
  }
  return NaN;
}
export function checkpointCushionFrom(curve: CushionPoint[], goal = GOAL, mat = 30): Nugget {
  const even = (goal * mat) / MARATHON_KM;
  const at = cushionAt(curve);
  const ahead = even - at;
  const minutes = Math.round(ahead);
  return {
    id: 'checkpoint.cushion', page: '/analyses/checkpoint#cushion', denominator: 'eligible',
    values: { goal_min: goal, mat_km: mat, even_min: even, half_at_min: at, ahead_min: ahead },
    guard: finite(at) && minutes >= 1,
    // "About half": the 50% point is interpolated between 2-minute bands, and the readout opens on the band holding it.
    headline: `About half made ${hm(goal)} from *${countWord(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}* ahead of even pace at ${mat}K.`,
    fallback: `At ${mat}K, the share that got under ${hm(goal)}, by split.`,
    figure: finite(at) ? { value: clock(at * 60).replace(/:\d\d$/, ''), sr: `${spokenTime(at * 60)} at ${mat}K` } : null,
  };
}

// ---------- Chapter 05 · where time is gained ----------

/** Finishes just over the goal against just under it, section by section: the gap at the finish and its share after 20K. */
export function sectionsSplitFrom(near: { below: { durations: number[]; n: number }; above: { durations: number[]; n: number } } | null, goal = GOAL): Nugget {
  const d = near ? near.above.durations.map((a, i) => a - near.below.durations[i]) : [];
  const total = d.reduce((s, v) => s + v, 0);
  const after = d.filter((_, i) => MARATHON_SECTION_ENDS[i] > 20).reduce((s, v) => s + v, 0);
  const share = total > 0 ? after / total : NaN;
  const widest = d.length ? d.reduce((b, v, i) => (v > d[b] ? i : b), 0) : -1;
  const distance = (MARATHON_KM - 20) / MARATHON_KM;
  const ok = !!near && near.below.n >= 100 && near.above.n >= 100 && d.length === MARATHON_SECTION_ENDS.length && total > 0;
  return {
    id: 'sections.split', page: '/analyses/where-time-is-gained', denominator: 'eligible',
    values: { goal_min: goal, gap_s: total, after20_s: after, share, widest_i: widest, widest_s: d[widest] ?? NaN, below_n: near?.below.n ?? NaN, above_n: near?.above.n ?? NaN },
    guard: ok && share > distance,
    headline: `Just under and just over ${hm(goal)} ended ${ms(total)} apart. *${pct(share)}* of the gap opened after 20K.`,
    fallback: `Just under and just over ${hm(goal)}: ${ms(total)} apart at the finish, section by section.`,
    figure: ok ? { value: ms(total), sr: `${spokenTime(total)} apart` } : null,
    key: `apart: ${hm(goal - 5)}–${hm(goal)} against ${hm(goal)}–${hm(goal + 5)} finishes`,
  };
}

// ---------- Chapter 06 · finish-time context ----------

/** The shares of finishes under the goal and the next two lower half-hours. */
export function targetContextFrom(cohort: Pick<PersonalCohort, 'cdf' | 'cdf_min' | 'n'> | null, goal = GOAL): Nugget {
  const marks = [goal, Math.ceil(goal / 30) * 30 - 30, Math.ceil(goal / 30) * 30 - 60];
  const shares = marks.map((m) => (cohort ? (percentUnder(cohort as Distribution, m) ?? NaN) / 100 : NaN));
  const ok = !!cohort && cohort.n >= 100 && shares.every(finite) && shares[0] > shares[1] && shares[1] > shares[2];
  return {
    id: 'target.context', page: '/analyses/finish-time-context', denominator: 'eligible',
    values: { goal_min: goal, mark2_min: marks[1], mark3_min: marks[2], share: shares[0], share2: shares[1], share3: shares[2], n: cohort?.n ?? NaN },
    guard: ok,
    headline: `*${pct(shares[0])}* of finishes were under ${hm(goal)}. Under ${hm(marks[1])}: ${pct(shares[1])}. Under ${hm(marks[2])}: ${pct(shares[2])}.`,
    fallback: `Finishes under ${hm(goal)}, ${hm(marks[1])} and ${hm(marks[2])}.`,
    figure: shareFigure(shares[0]), key: `of finishes were under ${hm(goal)}`,
  };
}

// ---------- Chapter 07 · age ----------

export type AgeRow = { age: string; pooled: number; pooledN: number; same: number; sameN: number };
/** Age groups (the cohorts by age with 100 or more finishes), pooled and near the goal finish. */
export function ageRows(data: CityData, goal = GOAL): AgeRow[] {
  const bucket = String(Math.round(goal / 15) * 15);
  return Object.values(data.cohorts).filter((c) => c.age !== 'all' && c.gender === 'all' && c.prior === 'all')
    .map((c) => ({ age: c.age, pooled: c.retention, pooledN: c.n, same: c.profiles[bucket]?.retention ?? NaN, sameN: c.profiles[bucket]?.n ?? 0 }))
    .filter((r) => r.pooledN >= 100 && r.sameN >= 100 && finite(r.pooled) && finite(r.same))
    .sort((a, b) => parseInt(a.age, 10) - parseInt(b.age, 10));
}
export function ageRetentionFrom(rows: AgeRow[], goal = GOAL): Nugget {
  const lo = rows.reduce<AgeRow | null>((a, b) => (!a || b.pooled < a.pooled ? b : a), null);
  const hi = rows.reduce<AgeRow | null>((a, b) => (!a || b.pooled > a.pooled ? b : a), null);
  const pooled = lo && hi ? hi.pooled - lo.pooled : NaN;
  const same = rows.length ? Math.max(...rows.map((r) => r.same)) - Math.min(...rows.map((r) => r.same)) : NaN;
  const older = !!lo && !!hi && parseInt(hi.age, 10) > parseInt(lo.age, 10);
  // A U: the least slowing at a middle age, both the youngest and the oldest group a point or more above it.
  const first = rows[0], last = rows[rows.length - 1];
  const both = !!lo && rows.length >= 3 && lo !== first && lo !== last && first.pooled - lo.pooled >= 1 && last.pooled - lo.pooled >= 1;
  return {
    id: 'age.retention', page: '/analyses/age-and-pacing', denominator: 'eligible',
    values: { groups: rows.length, pooled_lo_age: lo?.age ?? '', pooled_hi_age: hi?.age ?? '', pooled_spread: pooled, same_spread: same, goal_min: goal, u_shape: both ? 1 : 0 },
    guard: rows.length >= 2 && older && same <= 1.5 && same < pooled / 2,
    headline: `Across all finishes, ${both ? 'the youngest and oldest' : 'older runners'} slowed more. At the same finish time, age *barely mattered*.`,
    fallback: 'How the second 20K changed with age, pooled and at the same finish time.',
    figure: finite(same) ? { value: one(same), unit: 'pts', sr: `${one(same)} points between age groups near a ${hm(goal)} finish` } : null,
    key: `between age groups in second-half slowing, at ${hm(goal)}`,
  };
}

// ---------- Chapter 08 · courses ----------

/** The courses a cross-course extreme may name: 100 or more finishes over three or more editions. */
export const comparableCourses = (groups: AllFinisherGroup[]) => groups.filter((c) => c.n >= 100 && c.edition_n >= 3 && finite(c.slowdown_pct));
function courseRange(groups: AllFinisherGroup[]) {
  const list = comparableCourses(groups);
  const lo = list.reduce<AllFinisherGroup | null>((a, b) => (!a || b.slowdown_pct < a.slowdown_pct ? b : a), null);
  const hi = list.reduce<AllFinisherGroup | null>((a, b) => (!a || b.slowdown_pct > a.slowdown_pct ? b : a), null);
  return { list, lo, hi, l: lo ? lo.slowdown_pct / 100 : NaN, h: hi ? hi.slowdown_pct / 100 : NaN };
}
export function coursesCompareFrom(groups: AllFinisherGroup[]): Nugget {
  const { list, lo, hi, l, h } = courseRange(groups);
  return {
    id: 'courses.compare', page: '/analyses/course-comparison', denominator: 'course', term: '/methodology#sustained-slowdown',
    values: { lo: l, hi: h, courses: list.length, lo_course: lo?.label ?? '', hi_course: hi?.label ?? '' },
    guard: list.length >= 2 && h / l > 1.5,
    // The accent is the high end, the card's one orange dot (its readout opens there); the low end is named in ink.
    headline: `Sustained slowdown ranged from ${pct(l)} to *${pct(h)}* of finishes across courses.`,
    fallback: `Sustained slowdown across ${count(list.length)} courses.`,
    figure: list.length ? { value: `${pct(l).replace('%', '')}–${pct(h).replace('%', '')}`, unit: '%', sr: `${pct(l)} to ${pct(h)}` } : null,
    key: 'sustained slowdown, course by course',
  };
}

/** The data-chosen course's biggest-climbing 5K and slowest 5K for finishes near the goal. */
export function terrainClimbFrom(city: string, sections: TerrainSection[] | null, goal = GOAL): Nugget {
  const ok0 = !!sections && sections.every((s) => finite(s.gain) && finite(s.pace));
  const climb = ok0 ? sections!.reduce((b, s, i) => (s.gain > sections![b].gain ? i : b), 0) : -1;
  const slow = ok0 ? sections!.reduce((b, s, i) => (s.pace > sections![b].pace ? i : b), 0) : -1;
  const name = courseName(city);
  return {
    id: 'terrain.climb', page: '/analyses/hills-and-pacing', denominator: 'eligible',
    values: ok0 ? { city, goal_min: goal, climb_i: climb, slow_i: slow, climb_m: sections![climb].gain, slow_pct: sections![slow].pct, total_m: sections!.reduce((s, x) => s + x.gain, 0) } : { city },
    guard: ok0 && climb === slow,
    headline: `${name}’s biggest climb is *its slowest 5K*.`,
    fallback: `Where ${name} climbs, and where it slows.`,
    // How much slower the climb ran (its pace against the finishes' own average): the pacing pattern's figure is the
    // slowest 5K's name, so this page's own number is the climb's cost, never the same "35–40K" twice in a list.
    figure: ok0 && climb === slow && Math.round(sections![slow].pct) > 0 ? { value: String(Math.round(sections![slow].pct)), unit: '%', sr: `${Math.round(sections![slow].pct)} percent slower` } : null,
    key: `slower than average on ${name}’s biggest climb`,
  };
}

// ---------- Chapter 09 · weather ----------

/** A start-temperature band in the reader's units: "41–50°F", "below 41°F", "68°F or warmer". */
export function tempBand(g: Pick<AllFinisherGroup, 'lower_c' | 'upper_c'>, u: UnitSystem): string {
  if (g.lower_c == null) return `below ${temp(g.upper_c!, u)}`;
  if (g.upper_c == null) return `${temp(g.lower_c, u)} or warmer`;
  return `${temp(g.lower_c, u).replace(/°[CF]$/, '')}–${temp(g.upper_c, u)}`;
}
/** The start-temperature band with the fewest sustained slowdowns (five or more editions), against the coldest band. */
export function weatherStartFrom(groups: AllFinisherGroup[]): Nugget {
  const bands = groups.filter((g) => g.edition_n >= 5 && g.n >= 100 && finite(g.slowdown_pct));
  const low = bands.reduce<AllFinisherGroup | null>((a, b) => (!a || b.slowdown_pct < a.slowdown_pct ? b : a), null);
  const coldest = bands.reduce<AllFinisherGroup | null>((a, b) => (!a || (b.upper_c ?? Infinity) < (a.upper_c ?? Infinity) ? b : a), null);
  const ok = !!low && !!coldest && low !== coldest;
  return {
    id: 'weather.start', page: '/analyses/race-day-weather', denominator: 'course', term: '/methodology#sustained-slowdown',
    values: { band: low?.id ?? '', lower_c: low?.lower_c ?? NaN, upper_c: low?.upper_c ?? NaN, slowdown: low ? low.slowdown_pct / 100 : NaN, bands: bands.length },
    guard: ok,
    headline: both((u) => `The coolest start wasn’t the steadiest: *${low ? tempBand(low, u) : ''}* had the fewest sustained slowdowns.`),
    fallback: 'Sustained slowdown by start temperature.',
    figure: low ? shareFigure(low.slowdown_pct / 100) : null,
    key: 'sustained slowdown, at the steadiest start temperature',
  };
}

/** A wind speed (m/s in the data) in the reader's units: "10 mph", "16 km/h". */
export const windWords = (mps: number, u: UnitSystem) => `${Math.round(mps * (u === 'mi' ? 2.2369362920544 : 3.6))} ${u === 'mi' ? 'mph' : 'km/h'}`;
/** A temperature rise (°C in the data) in the reader's units: "11°F", "6°C". */
export const riseWords = (c: number, u: UnitSystem) => `${(u === 'mi' ? c * 1.8 : c).toFixed(0)}°${u === 'mi' ? 'F' : 'C'}`;
/** Warming over the first four hours: the larger rise went with more second-20K slowing (an interval above zero). */
export function weatherWarmingFrom(c: WeatherCandidate | undefined): Nugget {
  const ok = !!c && c.status === 'ready' && c.takeaway_type === 'association' && c.effect.low > 0;
  return {
    id: 'weather.warming', page: '/analyses/race-day-weather#warming', denominator: 'course',
    values: c ? { q25: c.exposure.q25, q75: c.exposure.q75, estimate: c.effect.estimate, low: c.effect.low, high: c.effect.high } : {},
    guard: ok,
    // The estimate is in percentage points of the second 20K's pace change, said in whole points as the card labels it
    // ("+2.1 pts"); the four hours and the interval are on /methodology.
    headline: both((u) => `A day that warmed ${riseWords(c?.exposure.q75 ?? NaN, u)}, not ${riseWords(c?.exposure.q25 ?? NaN, u)}, slowed the second 20K about *${Math.round(c?.effect.estimate ?? NaN)} ${Math.round(c?.effect.estimate ?? NaN) === 1 ? 'point' : 'points'}* more.`),
    fallback: 'Warming through the race, and the second 20K.',
    figure: c ? { value: `+${one(c.effect.estimate)}`, unit: 'pts', sr: `${one(c.effect.estimate)} points` } : null,
  };
}
/** Wind at the start: a precise null, the whole interval inside ±1 point. */
export function weatherWindFrom(c: WeatherCandidate | undefined): Nugget {
  const ok = !!c && c.status === 'ready' && c.takeaway_type === 'precise_null' && Math.abs(c.effect.low) < 1 && Math.abs(c.effect.high) < 1;
  return {
    id: 'weather.wind', page: '/analyses/race-day-weather#wind', denominator: 'course',
    values: c ? { q25: c.exposure.q25, q75: c.exposure.q75, estimate: c.effect.estimate, low: c.effect.low, high: c.effect.high } : {},
    guard: ok,
    headline: both((u) => `Wind of ${windWords(c?.exposure.q75 ?? NaN, u)} instead of ${windWords(c?.exposure.q25 ?? NaN, u)} at the start made *no material difference*: under 1 point.`),
    fallback: 'Wind at the start, and the second 20K.',
    figure: c ? { value: '≈ 0', sr: 'about zero' } : null,
  };
}

// ---------- Chapter 11 · the next one ----------

type Recurrence = Kick['recurrence'];
export function kickRecurrenceFrom(r: Recurrence): Nugget {
  const after = r.after_slowdown;
  const observed = after?.observed ?? NaN, expected = after?.expected ?? NaN;
  return {
    id: 'kick.recurrence', page: '/analyses/finding-improvement#next-race', denominator: 'kick', term: '/methodology#sustained-slowdown',
    values: { observed, expected, pairs: after?.pairs ?? NaN, none_observed: r.after_none?.observed ?? NaN, none_pairs: r.after_none?.pairs ?? NaN },
    guard: !!after && after.pairs >= 100 && observed > expected,
    headline: `After a sustained slowdown, *${pct(observed)}* of next races had one too (${pct(expected)} typical).`,
    fallback: `After a sustained slowdown, ${pct(observed)} of next races had one too; ${pct(expected)} was typical.`,
    figure: shareFigure(observed), key: `had another sustained slowdown in the next race (${pct(expected)} typical)`,
  };
}

/** Improving finishes near the goal: the share of their gain found from 30K to the finish, against its share of the distance. */
export function gainsFinalFrom(row: { values: number[]; total: number; n: number } | null, goal = GOAL): Nugget {
  const share = row && row.total > 0 ? row.values[2] / row.total : NaN;
  const stretch = (MARATHON_KM - 30) / MARATHON_KM;
  return {
    id: 'gains.final', page: '/analyses/finding-improvement', denominator: 'eligible',
    values: row ? { goal_min: goal, open_min: row.values[0], middle_min: row.values[1], final_min: row.values[2], total_min: row.total, share, n: row.n } : {},
    guard: !!row && row.n >= 100 && row.values.length === 3 && share > stretch,
    // One share in the sentence (of the time found), and the stretch it came from as a distance, so two percentages of
    // different things never sit together; the guard holds that stretch to less than its share of the race.
    headline: both((u) => `Improving finishes near ${hm(goal)} found *${pct(share)}* of their time after 30K, the last ${distance(MARATHON_KM - 30, u)}.`),
    fallback: `Where improving finishes near ${hm(goal)} found their time.`,
    figure: shareFigure(share), key: 'of the time improving finishes found came from 30K to the finish',
  };
}

// ---------- /slowdown ----------

/** Sustained slowdown by earlier recorded best: the fastest and slowest bands, when it rises band by band. */
export function slowdownHistoryFrom(rows: { label: string; value: number; n: number }[]): Nugget {
  const usable = rows.filter((r) => r.n >= 100 && finite(r.value));
  const first = usable[0], last = usable[usable.length - 1];
  const rising = usable.length >= 2 && usable.every((r, i) => !i || r.value > usable[i - 1].value);
  // "4 hours" never breaks between the number and its unit.
  const lower = (s: string) => s.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/(\d) (hours?|minutes?)\b/g, '$1\u00a0$2');
  return {
    id: 'slowdown.history', page: '/slowdown#history', denominator: 'eligible', term: '/methodology#sustained-slowdown',
    values: first ? { first: first.label, first_share: first.value / 100, last: last.label, last_share: last.value / 100, bands: usable.length } : {},
    guard: rising,
    headline: first ? `An earlier best ${lower(first.label)}: *${pct(first.value / 100)}* had a sustained slowdown. ${capitalize(lower(last.label))}: ${pct(last.value / 100)}.` : '',
    fallback: 'Sustained slowdown by earlier recorded best.',
    figure: first ? shareFigure(first.value / 100) : null,
  };
}

// ---------- The registered builders, reading the verified files ----------

const allCourses = () => getCityData(EXAMPLE_PROFILE.city).cohorts['all|all|all'] ?? null;
const af = () => getAllFinisherContextStart();
const weather = (id: WeatherCandidate['id']) => getWeatherEvidence().candidates.find((c) => c.id === id);

export const ANALYSIS_NUGGETS: Record<string, Builder> = {
  'kick.bank': () => kickBankFrom(readInsight<Kick>('kick.json').bank.bands ?? []),
  'kick.sweetspot': () => kickSweetSpotFrom(readInsight<Kick>('kick.json').bank.curve ?? []),
  'downhill.opening': () => downhillOpeningFrom(af().initial.downhill, af().opening_bands),
  'downhill.bands': () => downhillBandsFrom(af().initial.downhill, af().opening_bands),
  'pattern.profile': () => patternFrom((allCourses()?.profiles[String(GOAL)]?.pace ?? []).map((p) => p[1])),
  'checkpoint.under': () => {
    const row = getCheckpointDefault();
    return checkpointUnderFrom(row, row ? (percentUnder(row, GOAL) ?? NaN) / 100 : NaN);
  },
  'checkpoint.cushion': () => checkpointCushionFrom(getCheckpointCurve()),
  'sections.split': () => sectionsSplitFrom(allCourses()?.near.find((n) => n.target === GOAL) ?? null),
  'target.context': () => targetContextFrom(allCourses()),
  'age.retention': () => ageRetentionFrom(ageRows(getCityData(EXAMPLE_PROFILE.city))),
  'courses.compare': () => coursesCompareFrom(af().initial.courses),
  'terrain.climb': () => { const { city } = getTerrainDefault(); return terrainClimbFrom(city, terrainSections(getCityData(city))); },
  'weather.start': () => weatherStartFrom(af().initial.weather),
  'weather.warming': () => weatherWarmingFrom(weather('warming')),
  'weather.wind': () => weatherWindFrom(weather('wind')),
  'kick.recurrence': () => kickRecurrenceFrom(readInsight<Kick>('kick.json').recurrence),
  'gains.final': () => gainsFinalFrom(allCourses()?.gains[String(GOAL)] ?? null),
  'slowdown.history': () => {
    const chart = getStudyEvidence()?.figures.find((f) => f.id === 'history')?.charts[0];
    return slowdownHistoryFrom((chart?.rows ?? []).map((r) => ({ label: String(r.label), value: Number(r.value), n: Number(r.n_value) })));
  },
};

