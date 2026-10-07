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
  moments?: {
    first_finish_s: number; not_past_20_at_first: number; not_past_10_at_first: number; past_30_at_first: number; back_km_at_first: number;
    half_home_s: number; half_home_ratio: number; finish_quantiles_s: Record<string, number>; peak_minute: number; peak_minute_n: number; minute_240_n: number;
  };
  composition?: { clock_s: number; on_course: number; current_kmh: number; whole_race_kmh: number; composition_share?: number | null }[];
  ghosts?: { target_s: number; ahead: number[]; net_passes: number; typical_20km_s: number | null; even_20km_s: number; near_n: number | null }[];
  pack?: { checkpoint_km: number; window_start_s: number; n: number; quantiles: { km: number; p10_s: number; p50_s: number; p90_s: number }[]; finish_window_min: number };
}
export interface ReplayIndex {
  editions: ReplayEditionMeta[];
  field_spread: { km: number; p10_s: number; p25_s: number; p50_s: number; p75_s: number; p90_s: number }[];
  stretch?: { editions: { city: string; year: number; n: number; stretch: number }[]; wider_after_20: number; mean: number;
    min: { city: string; year: number; n: number; stretch: number }; max: { city: string; year: number; n: number; stretch: number } };
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

/** Fetch one insights file (story or tool data), verifying the digest the build recorded for it. */
export function loadInsight<T>(name: string, sha256: string): Promise<T> {
  const key = name + '@' + sha256;
  if (!cache.has(key)) {
    const request = (async () => {
      const response = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/insights/' + name + '?v=' + sha256);
      if (!response.ok) throw new Error('This data could not be loaded. Check the connection and try again.');
      const buffer = await response.arrayBuffer();
      if (typeof crypto !== 'undefined' && crypto.subtle && (await digest(buffer)) !== sha256) throw new Error('This data could not be verified, so it is not shown.');
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
  /** Published for download; no chart reads it, so pages drop it before passing data to the browser. */
  barcode_minutes?: { minute: number; n: number; median: number[]; metronome_share: number }[];
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

export interface DemographicBand {
  lo_min: number; label: string; matched_weight: number; women_n: number; men_n: number;
  women_slowdown: number; men_slowdown: number; women_block: number; men_block: number; women_kick: number; men_kick: number;
  ghost_s: number[]; women_profile: number[]; men_profile: number[];
}
export interface Demographics {
  cohort_n: number;
  overall: { matched_weight: number; editions: number; pooled_women_block: number; pooled_men_block: number; women_block: number; men_block: number; block_gap_ci95: [number, number];
    women_slowdown: number; men_slowdown: number; slowdown_gap_ci95: [number, number]; women_kick: number; men_kick: number; women_negative: number; men_negative: number };
  ghost_s: number[];
  bands: DemographicBand[];
  ladder: { gender: 'Men' | 'Women'; age: string; n: number; median_finish_s: number; slowdown: number; slowdown_vs_field: number; block_vs_field: number }[];
  age_contrast: { young: string; older: string; young_n: number; older_n: number; matched_weight: number; young_slowdown: number; older_slowdown: number; young_block: number; older_block: number; young_ahead_at_20km_s: number; slowdown_gap_ci95: [number, number] };
  granular_age_cities: string[]; granular_age_n: number;
  composition_flagged: { city: string; year: number }[];
  women_share_by_band: { lo_min: number; label: string; n: number; women_share: number }[];
  women_share_by_city: { city: string; years: { year: number; n: number; women_share: number }[] }[];
  method: string;
}

export interface CourseSummary {
  city: string; race: string; finishes: number; editions: number; years: number[];
  median_s: number; slowdown: number; slowdown_range: [number, number]; slowdown_range_years: [number, number];
  block10: number; after20_s: number; shape_editions: number;
  curve?: number[]; deviation?: number[]; signature?: number[]; fade?: number; fade_range?: [number, number];
  signature_section?: string; signature_points?: number; slowest_section?: string;
  bands?: { band: string; n: number; deviation: number[] }[];
  grade_pct?: number[]; identified?: { editions: number; correct: number };
}
export interface Slope { slope: number; ci95: [number, number]; r2: number; editions: number; courses: number }
export interface WeatherEdition { city: string; year: number; n: number; temp: number; dew: number; wind: number; humidity: number; slowdown: number; median_s: number; fade: number | null }
export interface EraCourse {
  city: string; pre_editions: number; post_editions: number; coverage_pre: number; coverage_post: number; high_coverage: boolean;
  p10: [number, number]; median: [number, number]; p90: [number, number]; sub3: [number, number]; slowdown: [number, number]; temp: [number, number] | null;
}
export interface EraChange { change: number; ci95: [number, number]; lower: number; higher: number }
export interface Courses {
  sections: string[]; typical_curve: number[];
  shape_cohort: { editions: number; courses: number; finishes: number; start_offset_editions: { city: string; year: number; finishes: number; median_gap_points: number }[] };
  edition_cohort: { editions: number; courses: number; finishes: number };
  courses: CourseSummary[];
  identification: {
    method: string; variants: Record<string, number>; editions_tested: number; courses: number; correct: number; top3: number; chance: number;
    per_course: { city: string; editions: number; correct: number }[];
    editions: { city: string; year: number; n: number; predicted: string; rank: number; signature: number[] }[];
  };
  grade_association: { slope: number; ci95: [number, number]; pearson_r: number; course_sections: number; courses: number };
  weather: {
    cohort: { editions: number; courses: number; finishes: number };
    excluded: { city: string; year: number; n: number; reason: string }[];
    mean_start_temp: number;
    editions: WeatherEdition[];
    fits: {
      slowdown_across: { slope: number; r2: number; editions: number };
      slowdown_within: Slope; finish_within: Slope; block_within: Slope; dew_within: Slope; warming_within: Slope; wind_within: Slope; humidity_within: Slope; fade_within: Slope;
      slowdown_within_year_control: { slope: number; ci95: [number, number]; year_slope: number; year_ci95: [number, number] };
      slowdown_within_leave_one_course_out: [number, number];
    };
    curvature: {
      finish_min_per_c: { temp: number; slope: number; ci95: [number, number] }[];
      slowdown_points_per_c: { temp: number; slope: number; ci95: [number, number] }[];
      finish_min_curve: { temp: number; change: number }[];
      slowdown_points_curve: { temp: number; change: number }[];
    };
    heat_signature: { section: string; per_10c: number; ci95: [number, number] }[];
    pairs: { min_gap_c: number; total: number; hotter_slowed_more: number; list: { city: string; hot_year: number; cool_year: number; hot_temp: number; cool_temp: number; hot_slowdown: number; cool_slowdown: number; hotter_slowed_more: boolean }[] };
    hot_cool: { city: string; editions: number; hot: { year: number; temp: number; slowdown: number; median_s: number }; cool: { year: number; temp: number; slowdown: number; median_s: number } }[];
    per_course_slopes: { city: string; editions: number; slope: number; pearson_r: number }[];
  };
  matched: { lo_s: number; hi_s: number; label: string; courses: { city: string; editions: number; finishes: number; slowdown: number; after20_s: number; mean_baseline_s: number }[] }[];
  years: {
    by_year: { year: number; editions: number; courses: number; finishes: number; pooled_median_s: number; median_s: number; slowdown: number }[];
    cells: { city: string; year: number; n: number; median_s: number; slowdown: number; temp: number | null }[];
    eras: { pre: [number, number]; post: [number, number]; coverage_rule: number; high_coverage_courses: string[]; summary: Record<'p10' | 'median' | 'p90' | 'sub3' | 'slowdown' | 'spread', EraChange> & { temp: { change: number; median_change: number; warmer: number; cooler: number; courses: number } }; courses: EraCourse[] };
    recovery: { city: string; n2019: number; first_back_year: number | null; first_back_n: number | null; latest_year: number; latest_n: number }[];
    trends: Record<'median' | 'p10' | 'p90' | 'sub3' | 'slowdown', Slope>;
  };
  method: string;
}

export interface KickSectionRow { section: string; p10: number; p25: number; p50: number; p75: number; p90: number; over10: number; over25: number }
export interface Kick {
  cohort_n: number; editions: number;
  start_offset_editions: { city: string; year: number; finishes: number; median_gap_points: number }[];
  grid_screen: { city: string; year: number; finishes: number; reason: string }[];
  kick: { n: number; faster: number; share: number; median_kick: number; median_gain_s: number; slowdown_n: number; slowdown_faster: number; slowdown_share: number;
    slowdown_final_below_baseline: number; other_final_below_baseline: number; slowdown_final_median_vs_baseline: number };
  magnet: { section: string; previous: string; all: number; slowdown: number }[];
  by_35_40: { label: string; n: number; share: number; median_gain_s: number; final_vs_baseline: number }[];
  states: { labels: string[]; occupancy: { section: string; counts: number[] }[]; flows: { source: string; target: string; counts: number[][] }[] };
  recovery: { slowdown_n: number; full_section_within_10: number; any_within_10: number; room_n: number; share_full_section_room: number; share_full_section: number; share_any: number;
    women_n: number; women_any: number; men_n: number; men_any: number; stay: { source: string; target: string; n: number; stay: number; back_within_10: number }[] };
  breaks: { all: { n: number; sections: KickSectionRow[] }; bands: { label: string; n: number; slowdown: number; break_section: string | null; sections: KickSectionRow[] }[] };
  warning: { after: string; rows: { label: string; n: number; later: number }[] }[];
  bank: { curve: { lo: number; n: number; slowdown: number; excess: number; open_s: number; after20_s: number; finish_s: number }[];
    bands: { label: string; n: number; slowdown: number; expected: number; open_s: number; after20_s: number; finish_s: number }[] };
  cost: { bands: { label: string; lo_min: number; slowdown_n: number; other_n: number; slowdown_20km_s: number; other_20km_s: number; slowdown_finish_s: number; other_finish_s: number }[];
    stratified: { strata: number; slowdown_finishes: number; mean_gap_s: number; median_gap_s: number } };
  gender_kick: { label: string; women_n: number; women: number; women_35_40: number; men_n: number; men: number; men_35_40: number }[];
  recurrence: { pairs: number; after_slowdown: { pairs: number; observed: number; expected: number } | null; after_none: { pairs: number; observed: number; expected: number } | null;
    after_slowdown_same_course: { pairs: number; observed: number; expected: number } | null; after_slowdown_other_course: { pairs: number; observed: number; expected: number } | null; note: string };
  method: string;
}
