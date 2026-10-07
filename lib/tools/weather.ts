/**
 * Published heat-stress formulas and rules of thumb, shown only in the "published research" panel of the weather match.
 * None is fitted to or validated against Pace Notes data, and none is applied to Pace Notes results.
 */

export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;

/** Relative humidity (%) from air temperature and dew point (°C), Magnus form (Alduchov & Eskridge 1996). */
export function relativeHumidity(t: number, td: number): number {
  const a = 17.625;
  const b = 243.04;
  return Math.min(100, 100 * Math.exp((a * td) / (b + td)) / Math.exp((a * t) / (b + t)));
}

/** Wet-bulb temperature (°C) from air temperature (°C) and RH (%), Stull (2011). Valid for RH 5–99% and −20 to 50 °C. */
export function wetBulb(t: number, rh: number): number {
  return t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(t + rh) - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
}

/** Shade WBGT approximation (°C): 0.7 × wet-bulb + 0.3 × air. Sun can add several degrees. */
export const shadeWbgt = (t: number, td: number) => 0.7 * wetBulb(t, relativeHumidity(t, td)) + 0.3 * t;

export type Flag = 'green' | 'yellow' | 'red' | 'black';
/** ACSM race-day WBGT flags: green < 18, yellow 18–23, red 23–28, black > 28 °C. */
export function acsmFlag(wbgt: number): Flag {
  if (wbgt < 18) return 'green';
  if (wbgt < 23) return 'yellow';
  if (wbgt <= 28) return 'red';
  return 'black';
}

export interface PercentRange { low: number; high: number }

/** Hadley table: air temperature °F + dew point °F. Null above 180 ("hard running not recommended"). */
export function hadley(tF: number, tdF: number): PercentRange | null {
  const sum = tF + tdF;
  const bands: [number, number, number][] = [[100, 0, 0], [110, 0, 0.5], [120, 0.5, 1], [130, 1, 2], [140, 2, 3], [150, 3, 4.5],
    [160, 4.5, 6], [170, 6, 8], [180, 8, 10]];
  for (const [upto, low, high] of bands) if (sum <= upto) return { low, high };
  return null;
}

/** RunnersConnect dew-point bands (°F). Null at 80 °F and above ("run by effort"). */
export function dewPointBand(tdF: number): PercentRange | null {
  const bands: [number, number, number][] = [[55, 0, 0], [60, 1, 1], [65, 2, 3], [70, 3, 5], [75, 5, 8], [80, 12, 15]];
  for (const [below, low, high] of bands) if (tdF < below) return { low, high };
  return null;
}

/** Ely et al. (2007): top finishers' slowdown vs course record by WBGT quartile (°C). Men and women. Null outside 5–25 °C. */
export function ely(wbgt: number): { men: number; women: number } | null {
  const rows: [number, number, number][] = [[10, 1.7, 3.2], [15, 2.5, 3.2], [20, 3.3, 3.8], [25, 4.5, 5.4]];
  if (wbgt < 5) return null;
  for (const [upto, men, women] of rows) if (wbgt < upto) return { men, women };
  return null;
}

/**
 * Mantzios et al. (2022), Med Sci Sports Exerc 54:153–161, top finishers: performance fell about 0.2% per °C WBGT above
 * the 7.5–15 °C optimum in the marathon, and 0.4% ± 0.4% per °C across all endurance events studied.
 */
export function mantzios(wbgt: number): PercentRange {
  const excess = Math.max(0, wbgt - 15);
  return { low: 0.2 * excess, high: 0.4 * excess };
}
