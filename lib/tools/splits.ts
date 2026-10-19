/**
 * Post-race reading of nine cumulative mat times (5, 10, …, 40 km and the finish), using the site's published definitions.
 * Mirrors analysis/insights_data.py (sustained_slowdown) and the pacing-type classifier in archetypes.json.
 */

export { SECTION_KM, readSplits } from './split-reading';
export type { SplitReading } from './split-reading';
import { SECTION_KM } from './split-reading';

/** The one wording of the sustained-slowdown definition and its neutral citation, for every tool. */
export const SLOWDOWN_DEFINITION = 'A sustained slowdown is at least 5 km after 20 km run at least 25% slower than the runner’s own 5–20 km pace. Slow 5 km sections must be contiguous and total at least 5 km, so the final 2.195 km cannot qualify on its own.';
export const SLOWDOWN_CITATION = { label: 'Published slowdown method (2021), doi:10.1371/journal.pone.0251513', url: 'https://doi.org/10.1371/journal.pone.0251513' };
/**
 * The split check's example race (made up), as its URL writes it: a quick opening and a sustained slowdown from 30 km.
 * The tool opens on it, and the split check's nugget reads the finishes around its finish time.
 */
export const SPLIT_EXAMPLE = '0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31';
export const SECTION_NAMES = ['0–5', '5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2'];

export interface Classifier { section_km: number[]; clip_lo: number[]; clip_hi: number[]; weights: number[]; centroids: number[][]; names: string[] }


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


/** Nearest published pacing-type centroid (weighted, clipped relative pace), as in the pacing-types story. */
export function classify(relative: number[], c: Classifier): number {
  const x = relative.map((v, i) => Math.min(c.clip_hi[i], Math.max(c.clip_lo[i], v)) * c.weights[i]);
  const dist = c.centroids.map((cent) => cent.reduce((s, cv, i) => s + (x[i] - cv) ** 2, 0));
  return dist.indexOf(Math.min(...dist));
}
