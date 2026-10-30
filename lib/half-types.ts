import type { ChartSpec } from '@/lib/charts/spec';

/**
 * The shapes of the published half-marathon files, public/data/half/ (analysis/build_half.py). Aggregates only: no
 * half rows, names, bibs, URLs, link tables or person keys. Values follow the nugget convention: times and gaps in
 * seconds (integers, or one decimal where a median or quantile falls between two values), shares from 0 to 1 at
 * `insights_stats.SHARE_DIGITS`, counts of finishes or of half and marathon pairs. Every shown group holds at least
 * 100 finishes or pairs, and at least 3 editions behind any claim across editions; groups below the floors are left
 * out, never rounded up. Contract: docs/HALF_MARATHON.md.
 */

/**
 * `verified`: half finishes in the usable stamped editions only (no label on the page). `linked`: half and marathon
 * pairs of records linked by name, whose halves include unverified editions (the "Includes unverified half results"
 * chip).
 */
export type HalfScope = 'verified' | 'linked';

/** Recorded sex as published (never inferred). */
export type HalfSex = 'F' | 'M';

/** The groups of the linked windows: all pairs, recorded women's, recorded men's. */
export type HalfGroup = 'all' | HalfSex;

// ---------------------------------------------------------------------------------------------------------------
// field.json (verified): where half finish times sit
// ---------------------------------------------------------------------------------------------------------------

/** Counts in fixed bins with the two tails kept apart, so every share recounts exactly. */
export type HalfTailedCounts = {
  /** Finishes under the first bin. */
  under_lo: number;
  /** Finishes at or over the end of the last bin. */
  at_or_over_hi: number;
  counts: number[];
};

/** One round mark (1:30, 1:45, 2:00, 2:15, 2:30) against the smooth curve of the minute histogram. */
export type HalfRoundMark = {
  /** "1:30". */
  mark: string;
  /** The mark in whole minutes (90). */
  minutes: number;
  /** Finishes in the whole minute before the mark (1:29:00–1:29:59) and in the minute from it. */
  minute_before: number;
  minute_after: number;
  /** The minute before as the smooth curve expects it (`insights_round.local_fit`, degree 3, W=25, XL=5, XR=10). */
  expected_minute_before: number;
  /** minute_before ÷ expected_minute_before, and its 200-draw whole-edition bootstrap interval. */
  ratio: number;
  ratio_ci95: [number, number];
  /** insights_round.cliff_index: the drop from the minute before to the minute from the mark, against the drops either side. */
  cliff: number;
};

export type HalfField = {
  schema_version: 1;
  family: 'half-field';
  scope: 'verified';
  /** Verified finishes and editions; `sex_*` the editions that pass the sex rule (use_sex) and their M or F finishes. */
  cohort: { finishes: number; editions: number; sex_finishes: number; sex_editions: number };
  /** Whole-minute counts of all verified finishes: counts[i] holds finishes in minute lo + i (70…199 since the stamp correction). */
  minutes: HalfTailedCounts & { lo: number; hi: number };
  /** Recorded women's and men's finishes in `bin_s` bins from lo_s to hi_s (27 bins of 5 minutes, 1:15–3:30; from 1:15, the first published mark, so each tail holds at least 100). */
  sex_bins: { bin_s: number; lo_s: number; hi_s: number; F: HalfTailedCounts; M: HalfTailedCounts };
  /** Finish-time quantiles, seconds (`insights_stats.quantile`, linear). */
  quantiles: {
    all: { p10: number; p25: number; p50: number; p75: number; p90: number };
    F: { p25: number; p50: number; p75: number };
    M: { p25: number; p50: number; p75: number };
  };
  /** Shares of finishes strictly under `s`, every 300 s from 4500 (1:15) to 10800 (3:00). */
  under: { s: number; all: number; F: number; M: number }[];
  /** The densest 30 whole minutes: they start at `lo_minute` and hold `share` of all finishes. */
  window30: { lo_minute: number; share: number };
  marks: HalfRoundMark[];
  /** Scope checks behind the headline (shown on /methodology only). */
  checks: {
    /** Every usable edition (verified and unverified), finishes pooled. */
    all_usable: { finishes: number; editions: number; under_7200: number; under_6300: number; p50: number };
    /** Verified editions of at least `min_finishes`, each weighted equally: the median of the editions' shares. */
    editions_equal: { min_finishes: number; editions: number; under_7200: number; under_6300: number };
    /** Every verified edition, each weighted equally (the median of the editions' shares). */
    editions_equal_all: { editions: number; under_7200: number };
    /** City labels with both verified and unverified editions: the quartiles of (verified − unverified) median of edition medians. */
    same_race: { races: number; diff_s: { p25: number; p50: number; p75: number } };
    /** Verified finishes by country (the policy's reviewed label map), groups of at least 3 editions and 100 finishes, by share. */
    countries: HalfCountry[];
  };
  /** The frozen policy file and the policy module (analysis/half_quality.py). */
  policy: { sha256: string; module_sha256: string };
};

/** A country's share of the verified finishes; `label` is its ISO 3166 code, `small_editions` those under 1,000 finishes. */
export type HalfCountry = { label: string; editions: number; small_editions: number; share: number };

// ---------------------------------------------------------------------------------------------------------------
// women.json (verified): women's share by finish time, and the same city's half and marathon
// ---------------------------------------------------------------------------------------------------------------

/** A finish-time band; `hi_s` null is open-ended ("3:00+"). */
export type HalfBand = { lo_s: number; hi_s: number | null; label: string };

/** Recorded finishes of one side of a same-city pair. */
export type HalfSexCounts = { n: number; F: number; M: number };

export type HalfSameCityPair = {
  /** The marathon city. */
  city: string;
  year: number;
  half: HalfSexCounts;
  marathon: HalfSexCounts;
};

/** One city's mean women's share over its pairs, half and marathon. */
export type HalfSameCityCity = { city: string; pairs: number; half: number; marathon: number };

export type HalfWomen = {
  schema_version: 1;
  family: 'half-women';
  scope: 'verified';
  /** The eight bands: under 1:30, 1:30, 1:45, 2:00, 2:15, 2:30, 2:45, 3:00+. */
  bands: HalfBand[];
  /** Which editions enter the bands: finishes, the unrecorded-sex share, recorded finishes in every band. */
  band_rule: { min_finishes: number; max_unrecorded: number; min_recorded_per_band: number };
  /**
   * The editions a band median needs (20). With fewer qualifying, the bands are left out, never published from fewer:
   * `band_editions` and `median_share` are empty and `cross_s` is null (15 qualify since the stamp correction, October 30,
   * 2026, so /half draws no women's columns).
   */
  min_band_editions: number;
  /** How many verified editions pass the band rule, published or not. */
  band_editions_qualifying: number;
  /** One unnamed row per edition: recorded finishes (`n`) and recorded women's finishes (`F`) in each band. */
  band_editions: { n: number[]; F: number[] }[];
  /** Per band, the median over editions of the women's share. */
  median_share: number[];
  /** The band start from which every median share is over 0.5 (8100 s = 2:15), or null. */
  cross_s: number | null;
  /** The cited marathon values, read from that file (verify-half asserts equality). */
  marathon: { file: string; sha256: string; cross_s: number; sub3: number };
  same_city: {
    rule: { half: string; marathon: string };
    pairs: HalfSameCityPair[];
    /** Sorted by the half share, highest first. */
    cities: HalfSameCityCity[];
    /** Women's shares as fractions; the `*_points` values in percentage points. */
    summary: {
      pairs: number; cities: number; half_higher: number; half_median: number; marathon_median: number;
      diff_median_points: number; diff_min_points: number; diff_max_points: number;
    };
    /** The same comparison over every usable half edition (verified and unverified). */
    all_scope_check: { pairs: number; cities: number; half_higher: number; diff_median_points: number };
  };
};

// ---------------------------------------------------------------------------------------------------------------
// linked.json (linked): the marathons that followed a half 3 to 16 weeks before (set B)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The pairs whose half is in [h − 150, h + 150) seconds ("near H"), for each whole half minute. The window at a
 * multiple of five minutes is the 5-minute band centred on that time.
 */
export type HalfWindow = {
  /** The window's centre, seconds (a whole minute). */
  h: number;
  /** Pairs, and marathon editions behind them. */
  n: number;
  e: number;
  /** The marathon finish at each level of `Q` (19 values, seconds, one decimal). */
  q: number[];
  /** Share of the window's marathons with a sustained slowdown. */
  sus: number;
  /** Median of (marathon − 2 × half), seconds. */
  extra_p50: number;
  /** Share with marathon < 2 × half. */
  under_double: number;
  /** The smaller of the window's first and last one-minute slices, in pairs (at least 10). */
  edge_min: number;
  /** Up to three quarter-hours t with p05 < t ≤ p95, nearest the median: [t seconds, exact share under t]. */
  marks: [number, number][];
};

/** A goal page's half window: the slowest published window whose median marathon is under the goal. */
export type HalfGoalWindow = { h: number; n: number; e: number };

export type HalfGoal = {
  goal_s: number;
  all: HalfGoalWindow & { q50: number; p10: number; p90: number };
  /** The same within that sex's published range, or null. */
  F: HalfGoalWindow | null;
  M: HalfGoalWindow | null;
};

export type HalfBatteryId =
  | 'pooled' | 'verified_halves' | 'other_marathons' | 'ns_keys_1' | 'one_per_person'
  | 'editions_equal_20' | 'editions_equal_100' | 'city_equal';

/**
 * One weighting of the flagship reading. Pair members are pooled medians (`n` pairs); `editions_equal_*` and
 * `city_equal` are medians over marathon editions (≥ 20 or ≥ 100 pairs) or cities (≥ 100 pairs from ≥ 3 editions) of
 * each group's median multiple, median extra and under-double share (`n` editions or cities).
 */
export type HalfBatteryMember = { id: HalfBatteryId; n: number; multiple_p50: number; extra_p50_s: number; under_double: number };

export type HalfLinked = {
  schema_version: 1;
  family: 'half-linked';
  scope: 'linked';
  set: {
    pairs: number; people: number; marathon_editions: number; marathon_cities: number; half_editions: number;
    women_pairs: number; men_pairs: number; verified_half_share: number;
    /** Days from the half to the marathon, inclusive. */
    window_days: [number, number];
  };
  overall: {
    /** Quantiles of (marathon − 2 × half), seconds. */
    extra_s: { p10: number; p25: number; p50: number; p75: number; p90: number };
    /** Median of marathon ÷ half. */
    ratio_p50: number;
    /** Share of marathons under double the half plus 0, 10, 20, 30 and 40 minutes. */
    under_double_plus_min: { '0': number; '10': number; '20': number; '30': number; '40': number };
    sustained: number;
  };
  /** The 19 quantile levels of every window's `q`: 0.05 … 0.95. */
  Q: number[];
  /** Published ranges only (all 1:10–2:45; recorded women 1:26–2:40; recorded men 1:10–2:29), one window per minute. */
  windows: Record<HalfGroup, HalfWindow[]>;
  /** Recorded women's and men's sustained slowdowns after the same half, within half band × marathon city strata. */
  sexes: { rule: string; strata: number; women_lower: number; women_std: number; men_std: number; diff_points: number };
  /** 3:00, 3:30, 4:00, 4:30 and 5:00. */
  goals: HalfGoal[];
  /** Source-only sensitivity values (recounted by the local source recount; shown on /methodology only). */
  checks: {
    verified: {
      pairs: number; extra_p50_s: number; under_double: number; w105_under_14400: number;
      sexes: { strata: number; women_lower: number; diff_points: number };
    };
    editions_equal: { min_pairs: number; editions: number; extra_p50_s: number; under_double: number; w105_under_14400: number };
    other_marathons: { pairs: number; extra_p50_s: number; w105_under_14400: number };
    ns_keys_1: { pairs: number; w105_under_14400: number };
    one_per_person: { pairs: number; w105_under_14400: number };
    no_merge_people: { pairs: number; extra_p50_s: number };
    battery: { pooled_half_p50_s: number; members: HalfBatteryMember[] };
    /** The median multiple in each 5-minute band of the all-pairs range. */
    multiple_by_band: { h: number; ratio_p50: number }[];
    /** Marathon cities of at least 100 pairs from 3 editions (the battery's city_equal cities). */
    by_city: HalfLinkedCity[];
    /** Link coverage by marathon city: eligible finishes linked to someone with a usable half (1,000 finishes and 100 linked at least). */
    coverage: { city: string; finishes: number; share: number }[];
  };
};

/** A marathon city's pairs; `mid` is the same reading within halves of 1:40 to 1:59, where that slice passes the floors. */
export type HalfLinkedCity = {
  city: string; pairs: number; e: number; multiple_p50: number; extra_p50_s: number; under_double: number; verified_half_share: number;
  mid: { pairs: number; e: number; extra_p50_s: number } | null;
};

// ---------------------------------------------------------------------------------------------------------------
// tools/half-to-full.json (linked): the predictor's compact copy of linked.json windows
// ---------------------------------------------------------------------------------------------------------------

/** One window: pairs, marathon editions, sustained-slowdown share, the 19 quantiles, the marks. */
export type HalfToolWindow = [n: number, e: number, sus: number, q: number[], marks: [number, number][]];

/** Windows `w[i]` centred on from + 60 × i seconds, through `to`. */
export type HalfToolGroup = { from: number; to: number; w: HalfToolWindow[] };

export type HalfTool = {
  schema_version: 1;
  family: 'half-tool';
  scope: 'linked';
  Q: number[];
  /** The width of every window, seconds (±2:30 around the whole minute). */
  window_s: 300;
  groups: Record<HalfGroup, HalfToolGroup>;
};

// ---------------------------------------------------------------------------------------------------------------
// cards.json: the four unnumbered "From the half" card plots
// ---------------------------------------------------------------------------------------------------------------

export type HalfCardSlug = 'half-under-2' | 'half-more-women' | 'half-double' | 'half-same-half';

export type HalfCard = {
  slug: HalfCardSlug;
  /** The scope of the values the card draws (`linked` cards print the chip in the footer stamp line). */
  scope: HalfScope;
  plot: ChartSpec;
  /** The raw numbers the takeaway reads. */
  values: Record<string, number | string>;
  /** Where the values come from: a family file and the path inside it. */
  source: { file: HalfDataFile; path: string };
};

export type HalfCards = { schema_version: 1; family: 'half-cards'; cards: HalfCard[] };

// ---------------------------------------------------------------------------------------------------------------
// manifest.json: provenance, policy counts, scripts, files
// ---------------------------------------------------------------------------------------------------------------

/** The family files (paths relative to public/data/half/). */
export type HalfDataFile = 'field.json' | 'women.json' | 'linked.json' | 'tools/half-to-full.json' | 'cards.json';

export type HalfFiles = {
  'field.json': HalfField;
  'women.json': HalfWomen;
  'linked.json': HalfLinked;
  'tools/half-to-full.json': HalfTool;
  'cards.json': HalfCards;
};

export type HalfFileMeta = { bytes: number; sha256: string; scope: HalfScope | 'per-card' };

export type HalfFinishesEditions = { finishes: number; editions: number };

/** The record, edition and pairing counts of the reviewed policy (§1.3 of the spec), asserted by the builder. */
export type HalfPolicyCounts = {
  raw: number; R1: number; R2: number; R3: number; R4: number; R5_fast: number; R5_slow: number; R6: number;
  record_usable: number; R7: number; record_usable_after_R7: number;
  /** Record-usable finishes in city-years with no registry row (E0), and in held editions (E1). */
  E0_editions: number; E0_finishes: number;
  E1_held_editions: number; E1_held_finishes: number;
  E2_E8_editions: number; E2_E8_finishes: number;
  use_finish: HalfFinishesEditions;
  verified: HalfFinishesEditions;
  verified_use_sex: HalfFinishesEditions;
  /** use_finish editions with no race date (they enter no date window), and their finishes after R7. */
  undated: HalfFinishesEditions;
  /** The editions stamped in the snapshot whose stamp the corrected metadata withdrew (now unverified), and their finishes after R7. */
  stamp_withdrawn: HalfFinishesEditions;
  set_b: { pairs: number; people: number; marathon_editions: number; half_editions: number };
};

export type HalfScript =
  | 'analysis/build_half.py' | 'analysis/half_common.py' | 'analysis/half_quality.py' | 'analysis/half_policy_lists.py'
  | 'analysis/half_links_extract.py'
  | 'analysis/half_marathon.py' | 'analysis/half_pairs.py' | 'analysis/half_field.py' | 'analysis/half_women.py'
  | 'analysis/half_linked.py' | 'analysis/half_cards.py';

export type HalfManifest = {
  schema_version: 1;
  family: 'half';
  as_of: string;
  /** The pinned source's repository, licence and access sentence (analysis/half-release.json). */
  repository: string;
  license: string;
  access: string;
  /** `tag` is the public release the files come from; `private_tag` the snapshot's or link build's own name. */
  half: { tag: string; private_tag: string; sqlite_sha256: string };
  links: { tag: string; private_tag: string; extract_content_sha256: string };
  /** The corrected edition metadata the verified scope is taken from: verified = stamped in both. */
  metadata_correction: HalfMetadataCorrection;
  marathon: {
    release_tag: string;
    runner_manifest_sha256: string;
    runner_manifest_as_of: string;
    weather_evidence_sha256: string;
    /** The cited marathon files (paths under public/data/) and their sha256. */
    inputs: { 'insights/finish-times.json': string; 'charts/womens-share-by-finish-time.json': string };
  };
  policy: { file: string; sha256: string; module_sha256: string; counts: HalfPolicyCounts };
  link_rules: {
    tiers: ('high' | 'medium')[];
    ns_keys_max: number;
    window_days: [number, number];
    pairing: string;
    candidate_merges: string;
  };
  /** sha256 of every builder module (verify-half fails when a repository file differs). */
  scripts: Record<HalfScript, string>;
  cohort: {
    verified: HalfFinishesEditions;
    usable: HalfFinishesEditions;
    linked: { pairs: number; marathon_editions: number; half_editions: number };
  };
  /** Keyed by HalfDataFile; a family left out is not published. */
  files: Record<string, HalfFileMeta>;
};

/** The policy's reviewed stamp correction (analysis/half-policy-<stamp>.json `stamp_correction`). */
export type HalfStampCorrection = HalfMetadataCorrection & {
  repository: string; readme_sha256: string; reviewed: string; rule: string;
  withdrawn: { edition_id: number; city: string; year: number; corrected_status: string; reason: string }[];
  weaker_source: { edition_id: number; city: string; year: number; source: string }[];
};

/** The producer's corrected edition metadata (a later public release of the same edition ids). */
export type HalfMetadataCorrection = { tag: string; asset: string; sha256: string; applied: 'verified = stamped in both' };

/**
 * analysis/half-release.json: the separate pin of the half snapshot and its link build, both from the owner's public CC
 * BY 4.0 release (`tag`), first released privately under `private_tag` (the name the policy, the links extract and the
 * reviewed counts carry), and the corrected metadata the verified scope is taken from.
 */
export type HalfReleasePin = {
  schema_version: 2;
  access: string;
  repository: string;
  license: string;
  half: { tag: string; doi: string; private_tag: string; assets: Record<string, string>; sqlite: string; sqlite_sha256: string };
  links: {
    tag: string; private_tag: string; pairs_with: string; built_at: string; assets: Record<string, string>;
    extract: string; extract_content_sha256: string;
  };
  metadata_correction: HalfMetadataCorrection & { readme_sha256: string };
  provenance: { private_repository: string; note: string; private_readme_sha256: Record<string, string> };
  /** Must equal analysis/release.json `tag`. */
  marathon_release: string;
  /** The frozen policy file (path from the repository root). */
  policy: string;
};
