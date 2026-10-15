import type { UnitSystem } from './units';

// Kept out of lib/units.ts, which every page loads with UnitsProvider: only pages with a pace chart need these ticks.

// Pace axis grids, in seconds per displayed unit, finest first.
const PACE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600] as const;
// The ticks Recharts' own pace axes drew (its default tickCount), on decimal-minute steps such as 5:12, 5:24/km.
const RECHARTS_TICKS = 5;
/**
 * Ticks for a pace axis, in seconds per displayed unit (`units` says which; both use the same grids, each in its own
 * unit), on a round minutes:seconds grid, with as many ticks as Recharts drew: the coarsest of 0:01, 0:02, 0:05, 0:10,
 * 0:15, 0:30, 1:00, 2:00, 5:00 and 10:00 that gives five or six, so a narrow range keeps its gridlines (9:12 to 9:50/mi
 * reads 9:00, 9:15 … 10:00). Where none does, the finest that gives at most six, with ticks added past the values, on
 * the side with less room, to make five. A kilometre grid converted to miles reads 8:15, 8:48, 9:21/mi. The domain runs
 * from the first tick to the last, which covers every value; null when there is no value to cover.
 */
export function paceTicks(minSeconds: number, maxSeconds: number, units: UnitSystem, maxTicks = 6): { ticks: number[]; domain: [number, number] } | null {
  if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds) || minSeconds > maxSeconds) return null;
  const grid = (step: number) => {
    // A value a rounding error past a grid line stays on it rather than adding a tick.
    const lo = Math.floor(minSeconds / step + 1e-9) * step;
    const hi = Math.max(lo + step, Math.ceil(maxSeconds / step - 1e-9) * step);
    return { step, lo, hi, count: Math.round((hi - lo) / step) + 1 };
  };
  const full = Math.min(RECHARTS_TICKS, maxTicks);
  const fits = PACE_STEPS.map(grid).filter(g => g.count <= maxTicks);
  // Past the widest listed grid, whole multiples of it.
  const widest = PACE_STEPS[PACE_STEPS.length - 1];
  let { step, lo, hi, count } = [...fits].reverse().find(g => g.count >= full) ?? fits[0]
    ?? grid(Math.ceil((maxSeconds - minSeconds) / Math.max(1, maxTicks - 2) / widest) * widest);
  for (; count < full; count++) {
    if (lo - step >= 0 && minSeconds - lo < hi - maxSeconds) lo -= step; else hi += step;
  }
  return { ticks: Array.from({ length: count }, (_, i) => lo + i * step), domain: [lo, hi] };
}
