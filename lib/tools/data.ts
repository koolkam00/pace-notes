/** Types and verified loading for the /tools data families (public/data/insights/tools). */
import { loadInsight } from '@/lib/insights';

export interface ToolIndexBase { family: string; release_tag: string; cohort_n: number; method: string; shards?: Record<string, string> }

export interface ProjectorValidation {
  mat: number; variant: 'all' | 'trend'; test_finishes: number; test_years: string; train_years: string;
  coverage_p10_p90: number; median_abs_error_s: number; even_pace_median_abs_error_s: number; within_5_min: number; even_pace_within_5_min: number;
}
export interface ProjectorIndex extends ToolIndexBase {
  editions: number; band_s: number; trend_threshold: number; variants: string[]; mats_km: number[]; quantiles: number[];
  scopes: { slug: string; city: string | null; finishes: number; editions: number; mats: Record<string, { bands: [number, number] | null; variants: string[]; cells: number }> }[];
  validation: ProjectorValidation[];
}
export interface ProjectorCells { b: number[]; n: number[]; ed: number[]; q: number[][]; later: number[][][]; rp: number[]; sd: [number, number][] }
export interface ProjectorShard { scope: string; city: string | null; mat_km: number; band_s: number; cells: Record<string, ProjectorCells> }

export interface PaceBandIndex extends ToolIndexBase {
  window_s: number; goals: [number, number]; onset_sections: number[];
  scopes: { slug: string; city: string | null; finishes: number; editions: number; genders: Record<string, { goals: [number, number]; count: number; held: number; slowdown: number }> }[];
}
export interface PaceBandGroup { g: number[]; n: number[]; ed: number[]; e50: number[][]; s50: number[][]; e25?: number[][]; e75?: number[][]; s25?: number[][]; s75?: number[][]; sd?: number[]; onset?: number[][] }
export interface PaceBandShard { scope: string; city: string | null; gender: string; window_s: number; groups: Partial<Record<'all' | 'held' | 'slowdown', PaceBandGroup>> }

export interface WeatherEdition { id: number; city: string; year: number; date: string | null; start: string | null; temp_c: number; dew_c: number | null; wind_mps: number | null; warming_c: number | null; finishes: number }
export interface WeatherRow { c: number; hw: number; pace: number; n: number; ed: number[]; sd: number; after20: number; late: number; fin: [number, number, number]; profile: number[] }
export interface WeatherMatch extends ToolIndexBase {
  editions: WeatherEdition[]; excluded: { city: string; year: number; reason: string }[]; rows: WeatherRow[];
  centres_c: [number, number]; half_widths_c: number[]; pace_step_s: number; pace_range_s: [number, number]; min_edition_finishes: number; min_editions: number;
}

export interface CourseGoalRow { goal: number; city: string; n: number; ed: number; under: number; sd: number; after20: number; fin: [number, number, number] }
export interface CourseContext {
  slug: string; city: string; editions: number; finishes: number; months: number[]; start_temp_c: [number, number] | null; weather_editions: number;
  gain_m: number | null; loss_m: number | null; net_m: number | null; downhill_opening: boolean; terrain_note: string | null;
}
export interface CourseGoal extends ToolIndexBase {
  goals: [number, number]; goal_step_min: number; tolerance: number; min_edition_finishes: number; min_editions: number;
  rows: CourseGoalRow[]; unavailable: { goal: number; city: string; reason: string }[]; courses: CourseContext[];
}

/** Load a shard listed in a verified tool index; the browser checks its SHA-256 before use. */
export function loadShard<T>(index: ToolIndexBase, path: string): Promise<T> {
  const sha = index.shards?.[path];
  if (!sha) return Promise.reject(new Error('This selection is not available.'));
  return loadInsight<T>(path, sha);
}

/** Linear interpolation of the share of finishes under `seconds`, from percentiles `qs` at probabilities `ps`. */
export function shareUnder(seconds: number, qs: number[], ps: number[]): { share: number; bound: 'below' | 'above' | null } {
  if (seconds <= qs[0]) return { share: ps[0], bound: 'below' };
  if (seconds > qs[qs.length - 1]) return { share: ps[ps.length - 1], bound: 'above' };
  for (let i = 1; i < qs.length; i += 1) {
    if (seconds <= qs[i]) {
      const span = qs[i] - qs[i - 1];
      return { share: span > 0 ? ps[i - 1] + ((seconds - qs[i - 1]) / span) * (ps[i] - ps[i - 1]) : ps[i], bound: null };
    }
  }
  return { share: ps[ps.length - 1], bound: 'above' };
}
