/**
 * Pace charts by goal time (/tools/marathon-pace-chart, /tools/half-marathon-pace-chart) and the goal-time pace pages
 * (/tools/marathon-pace/[goal]). Pure functions; times in seconds, distances in km, goals in whole minutes.
 * Every time here is calculated at an even pace from the goal. None is a recorded split.
 */
import { KM_PER_MILE } from '@/lib/units';
import { HALF_KM, MARATHON_KM, MATS_KM, paceFrom } from './pace';

export type ChartRace = 'marathon' | 'half';

/** A point on the course where a chart gives the even-pace elapsed time. `km` is exact; `mi` is set for mile markers. */
export interface ChartPoint { km: number; mi?: number; halfway?: boolean }

export interface ChartSpec {
  race: ChartRace;
  /** Race distance in km. */
  km: number;
  /** Goal finish times in whole minutes, fastest first. */
  goals: number[];
  /** Timing points in km (the 5 km mats, and halfway for the marathon), shown in both unit systems. */
  points: ChartPoint[];
  /** Mile markers for the second table, shown when the visitor reads miles. */
  miles: ChartPoint[];
}

/** Whole minutes from `from` to `to` inclusive, every `step`. */
export function minuteSteps(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let m = from; m <= to; m += step) out.push(m);
  return out;
}

const mile = (mi: number, halfway = false): ChartPoint => ({ km: mi * KM_PER_MILE, mi, ...(halfway ? { halfway } : {}) });

/** Marathon goals 2:30 to 6:30 every 5 minutes: the 5 km mats and halfway, plus mile markers every 5 miles and at halfway. */
export const MARATHON_CHART: ChartSpec = {
  race: 'marathon',
  km: MARATHON_KM,
  goals: minuteSteps(150, 390, 5),
  points: [...MATS_KM.slice(0, 4).map((km) => ({ km })), { km: HALF_KM, halfway: true }, ...MATS_KM.slice(4).map((km) => ({ km }))],
  miles: [mile(5), mile(10), { km: HALF_KM, mi: HALF_KM / KM_PER_MILE, halfway: true }, mile(15), mile(20), mile(25)],
};

/** Half-marathon goals 1:10 to 3:00 every 5 minutes: 5, 10, 15 and 20 km, plus 5 and 10 miles. */
export const HALF_CHART: ChartSpec = {
  race: 'half',
  km: HALF_KM,
  goals: minuteSteps(70, 180, 5),
  points: [5, 10, 15, 20].map((km) => ({ km })),
  miles: [mile(5), mile(10)],
};

export const chartSpec = (race: ChartRace) => (race === 'marathon' ? MARATHON_CHART : HALF_CHART);

/** Elapsed seconds at `atKm` when `goalSeconds` is spread evenly over `raceKm`. */
export const evenAt = (goalSeconds: number, raceKm: number, atKm: number) => (goalSeconds * atKm) / raceKm;

export interface ChartRow {
  /** Goal in whole minutes. */
  goal: number;
  seconds: number;
  /** Even pace, seconds per km and per mile. */
  perKm: number;
  perMile: number;
  /** Even-pace elapsed seconds at each of spec.points, then at each of spec.miles. */
  times: number[];
  miles: number[];
}

/** One row per goal: even pace per km and per mile and the even-pace elapsed time at every chart point. */
export function chartRows(spec: ChartSpec): ChartRow[] {
  return spec.goals.map((goal) => {
    const seconds = goal * 60;
    const perKm = paceFrom(seconds, spec.km);
    return {
      goal, seconds, perKm, perMile: perKm * KM_PER_MILE,
      times: spec.points.map((p) => evenAt(seconds, spec.km, p.km)),
      miles: spec.miles.map((p) => evenAt(seconds, spec.km, p.km)),
    };
  });
}

/** 240 → "4:00", the form the pace band, course chooser and calculator read in ?goal= and ?t=. */
export const goalLabel = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
/** 240 → "4-00", the goal page slug. */
export const goalSlug = (minutes: number) => goalLabel(minutes).replace(':', '-');

/** The five round goals with their own page. More would risk mass-produced near-duplicate pages. */
export const GOAL_PAGE_MINUTES: readonly number[] = [180, 210, 240, 270, 300];

export const hasGoalPage = (minutes: number) => GOAL_PAGE_MINUTES.includes(minutes);
export const goalPagePath = (minutes: number) => `/tools/marathon-pace/${goalSlug(minutes)}`;

/** The goal (minutes) of a goal page slug such as "4-00", or null when no page has that slug. */
export function goalFromSlug(slug: string): number | null {
  const m = /^(\d)-([0-5]\d)$/.exec(slug);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return hasGoalPage(minutes) ? minutes : null;
}

/** The goal as people search for it: "3 Hour" on the hour, "3:30" otherwise. */
export const goalSearchName = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} Hour` : goalLabel(minutes));

// Links into the other tools. Only a race time goes in a link.
export const paceBandHref = (minutes: number) => `/tools/pace-band?goal=${goalLabel(minutes)}`;
export const courseChooserHref = (minutes: number) => `/tools/course-chooser?goal=${goalLabel(minutes)}`;
/** The pace calculator with this race and goal, for splits at any interval. */
export const calculatorHref = (race: ChartRace, minutes: number) => `/tools/pace-calculator?d=${race}&t=${goalLabel(minutes)}:00`;

/** "9:09.2": minutes, seconds and tenths, for exact readings (the charts round to whole seconds at display). */
export function formatTenths(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const tenths = Math.round(Math.abs(seconds) * 10);
  const s = Math.floor(tenths / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = `${String(s % 60).padStart(2, '0')}.${tenths % 10}`;
  return `${seconds < 0 ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${rest}`;
}
