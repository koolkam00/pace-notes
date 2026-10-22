export type WeatherId = 'humidity' | 'warming' | 'wind';
export type WeatherEdition = {
  city: string; year: number; race: string; date: string; n: number;
  pace_change_pct: number; finish_minutes: number; temp_c: number;
  dewpoint_c: number; humidity_pct: number; wind_mps: number; warming_c: number;
  start_hour: string; four_hour: string; scheduled_start: string;
};
export type WeatherCandidate = {
  id: WeatherId; title: string; status: 'ready' | 'withheld';
  takeaway_type: 'association' | 'precise_null' | null; summary: string; reasons: string[];
  exposure: { key: 'dewpoint_c' | 'warming_c' | 'wind_mps'; label: string; unit: string; q25: number; q75: number; iqr: number; min: number; max: number };
  effect: { estimate: number; low: number; high: number; confidence: number; unit: string };
  support: { editions: number; courses: number; finishes: number; vif: number; courses_with_half_iqr_range: number; valid_bootstrap_draws: number; failed_bootstrap_draws: number; leave_course_out_min: number; leave_course_out_max: number; failed_leave_course_out_fits: number };
};
export type WeatherEvidence = {
  schema_version: number; as_of: string;
  input: { release_tag: string; as_of: string; asset_sha256: string; manifest_sha256: string; race_conditions_sha256: string };
  calculation: { script_sha256: string; pacing_script_sha256: string; duckdb_version: string; numpy_version: string; source_quality_script_sha256?: string };
  source_quality?: { reviewed_edition_policy: boolean; release_tag: string; script_sha256: string; policy_sha256: string; editions: { city: string; year: number; timing_eligible_excluded: number }[] };
  cohort: Record<string, number>; exclusions: Record<string, number>;
  /** Reviewed editions whose reading is an archive hour more than 30 minutes before the scheduled start. */
  accepted_early_hours?: { city: string; year: number; start_hour: string; scheduled_start: string; minutes_early: number }[];
  prespecified_gate: { confidence: number; practical_difference_pp: number };
  methodology: string[]; candidates: WeatherCandidate[]; editions: WeatherEdition[];
};
export type WeatherDefinition = { id: WeatherId; slug: string; shortTitle: string; title: string; description: string; purpose: string };
