import type { ChartSpec } from './spec';

/** The theme ids of the Top 100 charts, in the order the hub lists them. */
export type ChartTheme = 'finish-times' | 'pacing' | 'racing' | 'courses' | 'people' | 'trends';
export const THEME_NAMES: Record<ChartTheme, string> = {
  'finish-times': 'Finish times', pacing: 'Pacing', racing: 'Racing', courses: 'Courses and weather', people: 'Who runs', trends: 'Over the years',
};

/** One catalog row (lib/charts/catalog.json): read by the builder, the verifier and the pages. */
export type CatalogItem = { number: number; slug: string; theme: ChartTheme; module: string };

/** One chart's data file, public/data/charts/<slug>.json (analysis/build_charts.py). */
export type ChartFile = {
  family: 'chart';
  number: number;
  slug: string;
  theme: ChartTheme;
  release_tag: string;
  runner_manifest_sha256: string;
  cohort_n: number;
  editions_n?: number;
  weighting: 'pooled' | 'editions-equal' | 'pairs';
  method: string;
  /** The raw numbers the takeaway reads (seconds, shares 0–1, counts, labels). */
  values: Record<string, number | string>;
  plot: ChartSpec;
  /**
   * Only on a chart that follows linked records (the same runner in two or more races): the same values counted with
   * high-confidence links alone keying a linked record, for the sensitivity table on /methodology. `values` is null,
   * with the builder's refusal, when a group falls under one of the chart's floors on high links alone.
   */
  high_links?: { values: Record<string, number | string>; cohort_n: number } | { values: null; refused: string };
};

export type ChartsManifest = {
  schema_version: 1;
  release_tag: string;
  /** The SHA-256 of analysis/marathon-cohort/manifest.json (the name is from the time it held the runner lookup's). */
  runner_manifest_sha256: string;
  as_of: string;
  catalog_sha256: string;
  files: Record<string, { bytes: number; sha256: string }>;
  cohort: { eligible: number; after_duplicate_screen: number; editions: number; cities: number; shape: number; exact_age: number };
  /** The edition policy the cohort states: its digests and counts (the listed editions are public/data/edition-policy.json). */
  source_quality: { policy_sha256: string; editions_sha256: string; editions_file: string };
  /** The scripts that wrote the cohort, by SHA-256. */
  source_scripts: Record<string, string>;
};

type V = Record<string, number | string>;
/** What a takeaway asserts: the sentence (one *…* accent) when the guard holds, a neutral one when it does not. */
export type Takeaway = { guard: boolean; headline: string; fallback: string };

/** A chart's words (lib/charts/text/<module>.ts): every number in them comes from the chart's values. */
export type ChartText = {
  /** The card's headline and the page's H1: at most 47 characters, so "<title> | Pace Notes" fits 60. */
  title: string;
  /**
   * The title while the takeaway's guard does not hold on the published values: it names what the chart shows and
   * states no reading (at most 47 characters). Most titles state the reading, so a chart in the fallback state needs
   * one; scripts/verify-charts.cjs fails when a chart whose guard fails has none.
   */
  neutral?: string;
  takeaway: (v: V) => Takeaway;
  /** The search description when the takeaway alone would not do (at most 155 characters). */
  description?: (v: V) => string;
};
