import type { UnitSystem } from './units';

// Kept out of lib/units.ts, which every page loads with UnitsProvider: only pages with a pace chart need these ticks.

// Pace axis grids, in seconds per displayed unit, finest first.
const PACE_STEPS = [15, 30, 60, 120, 300, 600] as const;
/**
 * Ticks for a pace axis, in seconds per displayed unit, on a round minutes:seconds grid in the units shown: every 0:15
 * or 0:30 per kilometre, every 0:30 per mile (0:15 when 0:30 would leave fewer than four ticks, as for 9:12 to 9:50/mi),
 * and whole minutes or more for a wide range. A kilometre grid converted to miles reads 8:15, 8:48, 9:21/mi. The domain
 * runs from the first tick to the last, which covers every value; null when there is no value to cover.
 */
export function paceTicks(minSeconds: number, maxSeconds: number, units: UnitSystem, maxTicks = 6): { ticks: number[]; domain: [number, number] } | null {
  if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds) || minSeconds > maxSeconds) return null;
  const grid = (step: number) => {
    // A value a rounding error past a grid line stays on it rather than adding a tick.
    const lo = Math.floor(minSeconds / step + 1e-9) * step;
    const hi = Math.max(lo + step, Math.ceil(maxSeconds / step - 1e-9) * step);
    return { step, lo, hi, count: Math.round((hi - lo) / step) + 1 };
  };
  const fits = PACE_STEPS.map(grid).filter(g => g.count <= maxTicks);
  // Past the widest listed grid, whole multiples of it.
  const widest = PACE_STEPS[PACE_STEPS.length - 1];
  const finest = fits[0] ?? grid(Math.ceil((maxSeconds - minSeconds) / Math.max(1, maxTicks - 2) / widest) * widest);
  const { step, lo, hi, count } = units === 'mi' && finest.step === 15 && fits[1].count >= 4 ? fits[1] : finest;
  return { ticks: Array.from({ length: count }, (_, i) => lo + i * step), domain: [lo, hi] };
}
