/** Types and client loaders for the story analyses in public/data/insights. */

export interface InsightsManifest {
  schema_version: number;
  release_tag: string;
  input_as_of: string;
  as_of: string;
  runner_manifest_sha256: string;
  eligible_records: number;
  analysis_n: number;
  duplicate_edition_screen: { city: string; year: number; duplicate_of: number; reason: string; eligible_removed: number; identical_nine_time_twins: number }[];
  cohort: { eligible: number; after_duplicate_screen: number; editions: number; cities: number; men: number; women: number; other_or_not_recorded: number; exact_age: number };
  files: Record<string, { bytes: number; sha256: string }>;
  methodology: string[];
}

export interface FinishTimeMark {
  mark: string; minutes: number; kind: string;
  minute_before: number; minute_after: number; expected_minute_before: number;
  ratio: number; ratio_ci95: [number, number]; excess_5min: number; cliff: number;
  men_ratio: number; women_ratio: number | null; women_minute_before: number;
}
export interface BubbleSide {
  n: number; share_under: number; expected_share_under: number; extra_under: number; extra_under_ci95: [number, number];
  median_final_gain_s: number; expected_median_final_gain_s: number | null;
}
export interface FinishTimes {
  histogram: { minute: number; all: number; men: number; women: number }[];
  expected_curve: { minute: number; expected: number }[];
  marks: FinishTimeMark[];
  cliff_index: { minute: number; kind: string; cliff: number }[];
  total_excess_hour_half_hour: number;
  seconds: { mark: string; minutes: number; bins: { offset_s: number; n: number; expected: number }[]; peak_offset_s: number; peak_ratio: number; share_of_pile_in_last_minute: number | null }[];
  bubble: { mark: string; minutes: number; n_comparison: number; over: BubbleSide; under: BubbleSide; premium: { margin_s: number; n: number; share_under: number; expected_share_under: number; median_final_gain_s: number }[] }[];
  method: string;
  analysis_n: number;
}

export interface ReplayEditionMeta {
  slug: string; city: string; year: number; race: string; finishes: number; sample: number;
  first_finish_s: number; median_finish_s: number; last_finish_s: number; file: string;
  snapshots: { clock_s: number; finished_share: number; front10_km: number; median_km: number; back10_km: number }[];
}
export interface ReplayIndex {
  editions: ReplayEditionMeta[];
  field_spread: { km: number; p10_s: number; p25_s: number; p50_s: number; p75_s: number; p90_s: number }[];
  method: string;
}
export interface ReplayRows { slug: string; city: string; year: number; finishes: number; sample: number; rows: number[][] }

export interface CourseGeometry {
  city: string; race: string; distance_km: number; gain_m: number; loss_m: number; min_m: number; max_m: number;
  route: [number, number][]; route_km: number[]; elevation_step_km: number; elevation_m: number[]; source: string;
}

const cache = new Map<string, Promise<unknown>>();

async function digest(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fetch one story file, verifying the digest the build recorded for it. */
export function loadInsight<T>(name: string, sha256: string): Promise<T> {
  const key = name + '@' + sha256;
  if (!cache.has(key)) {
    const request = (async () => {
      const response = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/insights/' + name + '?v=' + sha256);
      if (!response.ok) throw new Error('Could not load the story data.');
      const buffer = await response.arrayBuffer();
      if (typeof crypto !== 'undefined' && crypto.subtle && (await digest(buffer)) !== sha256) throw new Error('The story data could not be verified.');
      return JSON.parse(new TextDecoder().decode(buffer)) as T;
    })();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key) as Promise<T>;
}

export interface Archetype {
  name: string; slug: string; blurb: string; n: number; share: number;
  profile: number[]; profile_p25: number[]; profile_p75: number[];
  median_finish_s: number; slowdown_share: number; negative_20km_share: number; women_share: number;
  median_after20_min: number; median_cv: number; share_of_slowdowns: number;
}
export interface Archetypes {
  cohort_n: number;
  start_offset_editions: { city: string; year: number; finishes: number; median_gap_points: number }[];
  archetypes: Archetype[];
  river: { lo_min: number; label: string; n: number; shares: number[]; negative_20km_share: number; median_cv: number }[];
  gender: Record<'men' | 'women', { n: number; standardized_shares: number[]; raw_shares: number[] }>;
  courses: { city: string; editions: number; finishes: number; shares: number[] }[];
  barcode: { lo_s: number; hi_s: number; n: number; median: number[]; archetype: number[] }[];
  barcode_minutes: { minute: number; n: number; median: number[]; metronome_share: number }[];
  sentences: { total_distinct: number; published: { sentence: string; n: number }[]; published_n: number; all_even_n: number };
  transitions: { pairs: number; repeat_share: number; rows: { name: string; pairs: number; next_shares: number[]; repeat_share: number | null; overall_share: number }[] };
  classifier: { section_km: number[]; clip_lo: number[]; clip_hi: number[]; weights: number[]; centroids: number[][]; names: string[]; rule: string };
  method: string;
}

export interface Positions {
  cohort_n: number; editions_n: number; gained_share: number; surger_share: number; sinker_share: number; surgers: number; sinkers: number;
  women_share: number; women_share_of_surgers: number; women_share_of_sinkers: number;
  histogram: { lo: number; share: number }[];
  coin_flip: Record<'20' | '30' | '35' | '40', { gap_lo_s: number; share: number }[]>;
  shuffle: { section: string; share: number; per_km: number }[];
  breakeven: { x: number; n: number; median: number; p10: number; p90: number; gained: number }[];
  breakeven_crossing: number | null;
  fan: { at30: number; n: number; p10: number; p50: number; p90: number; surger: number; sinker: number }[];
  ledger: { n: number; median_field: number; passes_per_1000: number; passed_by_per_1000: number; median_passes: number; median_passed_by: number };
  gender_editions: { city: string; year: number; women: number; men: number; women_n: number; men_n: number }[];
  women_ahead_editions: number;
  groups: { label: string; n: number; median: number; gained: number; surgers: number; sinkers: number }[];
  method: string;
}
