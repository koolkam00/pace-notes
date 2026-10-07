/** Even-pace arithmetic for the pace calculator and pace band. Distances in km, times in seconds, paces in s/km. */
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

export const MARATHON_KM = 42.195;
export const HALF_KM = 21.0975;
export const MATS_KM = [5, 10, 15, 20, 25, 30, 35, 40] as const;

export interface DistancePreset { key: string; label: string; km: number }
export const DISTANCES: DistancePreset[] = [
  { key: '5k', label: '5K', km: 5 },
  { key: '10k', label: '10K', km: 10 },
  { key: '10mi', label: '10 miles', km: 10 * KM_PER_MILE },
  { key: 'half', label: 'Half marathon', km: HALF_KM },
  { key: 'marathon', label: 'Marathon', km: MARATHON_KM },
];

export const paceFrom = (seconds: number, km: number) => seconds / km;
export const timeFrom = (secondsPerKm: number, km: number) => secondsPerKm * km;
export const distanceFrom = (seconds: number, secondsPerKm: number) => seconds / secondsPerKm;

/** Seconds per km ↔ seconds per selected unit. */
export const perUnit = (secondsPerKm: number, units: UnitSystem) => (units === 'mi' ? secondsPerKm * KM_PER_MILE : secondsPerKm);
export const perKm = (secondsPerUnit: number, units: UnitSystem) => (units === 'mi' ? secondsPerUnit / KM_PER_MILE : secondsPerUnit);
export const unitKm = (units: UnitSystem) => (units === 'mi' ? KM_PER_MILE : 1);

export const kmh = (secondsPerKm: number) => 3600 / secondsPerKm;
export const mph = (secondsPerKm: number) => (3600 / secondsPerKm) / KM_PER_MILE;

export type SplitInterval = '400m' | 'quarter' | 'km' | 'mi' | '5k';
export const SPLIT_KM: Record<SplitInterval, number> = { '400m': 0.4, quarter: KM_PER_MILE / 4, km: 1, mi: KM_PER_MILE, '5k': 5 };

export interface SplitRow { km: number; elapsed: number; split: number; mat: boolean; halfway: boolean; finish: boolean }

/**
 * Cumulative even-pace splits at a fixed interval. With `difference` (seconds; positive = second half slower),
 * the first half runs at (T − Δ)/2 and the second at (T + Δ)/2, each even within its half. Arithmetic only.
 */
export function splitTable(totalSeconds: number, km: number, interval: SplitInterval, difference = 0): SplitRow[] {
  const step = SPLIT_KM[interval];
  const half = km / 2;
  const first = (totalSeconds - difference) / 2;
  const second = (totalSeconds + difference) / 2;
  const at = (d: number) => (d <= half ? (first * d) / half : first + (second * (d - half)) / half);
  const marks = new Set<number>();
  for (let d = step; d < km - 1e-9; d += step) marks.add(Math.round(d * 1e6) / 1e6);
  const isMarathon = Math.abs(km - MARATHON_KM) < 1e-6;
  if (isMarathon) for (const m of MATS_KM) marks.add(m);
  if (isMarathon || interval !== '5k') marks.add(Math.round(half * 1e6) / 1e6);
  marks.add(km);
  const sorted = [...marks].filter((d) => d > 0 && d <= km + 1e-9).sort((a, b) => a - b);
  let previous = 0;
  return sorted.map((d) => {
    const elapsed = at(d);
    const row: SplitRow = {
      km: d, elapsed, split: elapsed - previous,
      mat: isMarathon && (MATS_KM as readonly number[]).includes(d),
      halfway: Math.abs(d - half) < 1e-6 && Math.abs(d - km) > 1e-6, finish: Math.abs(d - km) < 1e-6,
    };
    previous = elapsed;
    return row;
  });
}

/** Rows of a printable pace chart: one per pace step (seconds per unit), times for the standard distances. */
export function paceChart(fromPerUnit: number, toPerUnit: number, step: number, units: UnitSystem) {
  const rows: { perUnit: number; perKm: number; times: Record<string, number> }[] = [];
  for (let p = fromPerUnit; p <= toPerUnit + 1e-9; p += step) {
    const sPerKm = perKm(p, units);
    rows.push({ perUnit: p, perKm: sPerKm, times: Object.fromEntries(DISTANCES.map((d) => [d.key, sPerKm * d.km])) });
  }
  return rows;
}

/** What a watch shows as average pace (per selected unit) if it measures `reading` units for a race run in `totalSeconds`. */
export const watchPace = (totalSeconds: number, reading: number) => totalSeconds / reading;

/** Watch target pace for a goal when the watch is assumed to read the course `overrun` long (0.01 = 1%). */
export const watchTarget = (goalSecondsPerKm: number, overrun: number) => goalSecondsPerKm / (1 + overrun);
