import type { UnitSystem } from './units';

// Kept out of lib/units.ts, which every page loads with UnitsProvider: only pages with a pace chart need these ticks.

// Pace axis grids, in seconds per displayed unit, finest first.
const PACE_STEPS: Record<UnitSystem, readonly number[]> = { mi: [30, 60, 120, 300, 600], km: [15, 30, 60, 120, 300, 600] };
/**
 * Ticks for a pace axis, in seconds per displayed unit, on a round minutes:seconds grid in the units shown: every 0:30
 * per mile (or a whole minute or more for a wide range), every 0:15 or more per kilometre. A kilometre grid converted
 * to miles reads 8:15, 8:48, 9:21/mi. The domain runs from the first tick to the last, which covers every value;
 * null when there is no value to cover.
 */
export function paceTicks(minSeconds: number, maxSeconds: number, units: UnitSystem, maxTicks = 6): { ticks: number[]; domain: [number, number] } | null {
  if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds) || minSeconds > maxSeconds) return null;
  const steps = PACE_STEPS[units];
  const grid = (step: number) => {
    // A value a rounding error past a grid line stays on it rather than adding a tick.
    const lo = Math.floor(minSeconds / step + 1e-9) * step;
    const hi = Math.max(lo + step, Math.ceil(maxSeconds / step - 1e-9) * step);
    return { step, lo, hi, count: Math.round((hi - lo) / step) + 1 };
  };
  // Past the widest listed grid, whole multiples of it.
  const widest = steps[steps.length - 1];
  const { step, lo, hi, count } = steps.map(grid).find(g => g.count <= maxTicks) ?? grid(Math.ceil((maxSeconds - minSeconds) / Math.max(1, maxTicks - 2) / widest) * widest);
  return { ticks: Array.from({ length: count }, (_, i) => lo + i * step), domain: [lo, hi] };
}
