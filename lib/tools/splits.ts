/**
 * Post-race reading of nine cumulative mat times (5, 10, …, 40 km and the finish), using the site's published definitions.
 * Mirrors analysis/insights_data.py (sustained_slowdown) and the pacing-type classifier in archetypes.json.
 */
import { MARATHON_KM } from './pace';

export const SECTION_KM = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];

/** The one wording of the sustained-slowdown definition and its neutral citation, for every tool. */
export const SLOWDOWN_DEFINITION = 'A sustained slowdown is at least 5 km after 20 km run at least 25% slower than the runner’s own 5–20 km pace. Slow 5 km sections must be contiguous and total at least 5 km, so the final 2.195 km cannot qualify on its own.';
export const SLOWDOWN_CITATION = { label: 'Published slowdown method (2021), doi:10.1371/journal.pone.0251513', url: 'https://doi.org/10.1371/journal.pone.0251513' };
export const SECTION_NAMES = ['0–5', '5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2'];

export interface Classifier { section_km: number[]; clip_lo: number[]; clip_hi: number[]; weights: number[]; centroids: number[][]; names: string[] }

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

/** Eligibility rules used across Pace Notes: increasing times, finish 1:30–12:00, every section 2–20 min/km. */
export function validateSplits(times: (number | null)[]): string | null {
  if (times.length !== 9 || times.some((t) => t === null || !Number.isFinite(t))) return 'Enter all nine times: 5, 10, 15, 20, 25, 30, 35 and 40 km, and the finish.';
  const t = times as number[];
  for (let i = 1; i < 9; i += 1) if (t[i] <= t[i - 1]) return 'Each time must be later than the one before.';
  if (t[8] < 5400 || t[8] > 43200) return 'The finish must be between 1:30:00 and 12:00:00.';
  for (let i = 0; i < 9; i += 1) {
    const pace = (t[i] - (i ? t[i - 1] : 0)) / SECTION_KM[i];
    if (pace < 120 - 1e-6 || pace > 1200 + 1e-6) return `The ${SECTION_NAMES[i]} km section works out at an implausible pace (outside 2–20 min/km). Check that time.`;
  }
  return null;
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

/** Nearest published pacing-type centroid (weighted, clipped relative pace), as in the pacing-types story. */
export function classify(relative: number[], c: Classifier): number {
  const x = relative.map((v, i) => Math.min(c.clip_hi[i], Math.max(c.clip_lo[i], v)) * c.weights[i]);
  const dist = c.centroids.map((cent) => cent.reduce((s, cv, i) => s + (x[i] - cv) ** 2, 0));
  return dist.indexOf(Math.min(...dist));
}
