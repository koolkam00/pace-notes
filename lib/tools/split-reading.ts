/**
 * The reading of nine cumulative mat times on its own (the split check's rules, lib/tools/splits re-exports it): a
 * module with no other code, so the runner view's first load carries only this, not the parser, the pacing-type
 * classifier or the definition text.
 */
import { MARATHON_KM } from '../units';

export const SECTION_KM = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];

export interface SplitReading {
  paces: number[];            // s/km per section
  baseline: number;           // 5–20 km pace (s/km)
  vsBaseline: number[];       // per section, fraction slower than the 5–20 km pace
  relative: number[];         // per section, % vs own average pace (classifier input)
  slowdown: boolean;
  onsetKm: number | null;     // first section start (20, 25, 30 or 35) at ≥25% slower
  opening: number;            // first 5 km vs 5–20 km pace (fraction; negative = quicker)
  firstHalfBlock: number;     // 0–20 km elapsed
  secondBlockRatio: number;   // 20–40 km pace vs 0–20 km pace (fraction)
}

export function readSplits(t: number[]): SplitReading {
  const paces = t.map((v, i) => (v - (i ? t[i - 1] : 0)) / SECTION_KM[i]);
  const baseline = (t[3] - t[0]) / 15;
  const vsBaseline = paces.map((p) => p / baseline - 1);
  const average = t[8] / MARATHON_KM;
  const relative = paces.map((p) => 100 * (p / average - 1));
  let onsetKm: number | null = null;
  for (let i = 4; i < 8; i += 1) {
    if (vsBaseline[i] + 1e-12 >= 0.25) { onsetKm = 20 + 5 * (i - 4); break; }
  }
  return {
    paces, baseline, vsBaseline, relative, slowdown: onsetKm !== null, onsetKm,
    opening: paces[0] / baseline - 1, firstHalfBlock: t[3], secondBlockRatio: ((t[7] - t[3]) / 20) / (t[3] / 20) - 1,
  };
}
