/**
 * Published race-equivalence models. Each function is a direct transcription of the cited source; none is fitted to Pace Notes data.
 * - Riegel (1981): T2 = T1 × (D2 / D1)^b, b = 1.06.
 * - Daniels & Gilbert (1979), the equations behind VDOT.
 * - Half-to-full exponents from training logs (RunningAHEAD, n = 4,402): mode 1.09, median 1.13, mean 1.15.
 * - Tanda (2011): marathon pace from 8-week training volume and pace (22 runners, 46 marathons of 2:47–3:36).
 */
import { HALF_KM, MARATHON_KM } from './pace';

export const RIEGEL_B = 1.06;
export const REALISTIC_B = { low: 1.09, median: 1.13, high: 1.15 } as const;
export const TANDA_RANGE_S = [167 * 60, 216 * 60] as const;

export const riegel = (t1: number, d1: number, d2: number, b = RIEGEL_B) => t1 * Math.pow(d2 / d1, b);

/** Oxygen cost (ml/kg/min) at velocity v (m/min). */
export const danielsVO2 = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** Fraction of VO2max sustainable for t minutes. */
export const danielsFraction = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

export function vdot(km: number, seconds: number): number {
  const t = seconds / 60;
  return danielsVO2((km * 1000) / t) / danielsFraction(t);
}

/**
 * Time (s) at which a race of `km` gives the same VDOT, by bisection. VDOT falls as time grows, so the upper bound is
 * widened until it brackets the answer; NaN when it lies beyond 48 hours (walking paces the equations were not fitted to).
 */
export function timeForVdot(value: number, km: number): number {
  let lo = 60;
  let hi = 6 * 3600;
  while (vdot(km, hi) > value) {
    if (hi >= 48 * 3600) return NaN;
    hi *= 2;
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (vdot(km, mid) > value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export const personalExponent = (d1: number, t1: number, d2: number, t2: number) => Math.log(t2 / t1) / Math.log(d2 / d1);

/** Tanda (2011): K = mean km per week, P = mean training pace (s/km), both over the 8 weeks before the race. */
export const tandaPace = (kmPerWeek: number, trainingPace: number) => 17.1 + 140 * Math.exp(-0.0053 * kmPerWeek) + 0.55 * trainingPace;

export interface MarathonRange {
  /** Riegel 1.06: the familiar calculator answer, best case if fully marathon-trained. */
  riegel: number;
  daniels: number;
  low: number;
  median: number;
  high: number;
  /** The half-marathon equivalent used to apply the half-to-full exponents (Riegel 1.06 below the half, where it is well calibrated). */
  halfEquivalent: number;
  extrapolation: 'half-or-longer' | 'shorter';
}

/** Marathon estimates from one recent race at distance `km` (≤ 42.195) in `seconds`. */
export function marathonRange(km: number, seconds: number): MarathonRange {
  const longEnough = km >= HALF_KM - 1e-9;
  const halfEquivalent = longEnough ? seconds : riegel(seconds, km, HALF_KM);
  const from = longEnough ? { t: seconds, d: km } : { t: halfEquivalent, d: HALF_KM };
  return {
    riegel: riegel(seconds, km, MARATHON_KM),
    daniels: timeForVdot(vdot(km, seconds), MARATHON_KM),
    low: riegel(from.t, from.d, MARATHON_KM, REALISTIC_B.low),
    median: riegel(from.t, from.d, MARATHON_KM, REALISTIC_B.median),
    high: riegel(from.t, from.d, MARATHON_KM, REALISTIC_B.high),
    halfEquivalent,
    extrapolation: longEnough ? 'half-or-longer' : 'shorter',
  };
}
