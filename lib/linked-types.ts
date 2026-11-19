/**
 * The shapes of the linked-records family (`public/data/linked/`, contract docs/LINKED_RECORDS.md "Files and fields").
 * Only the fields a page reads are typed; the verifier (scripts/verify-linked.cjs) checks the whole shape. A verdict of
 * null is the fallback: the page states no reading in any slot (AGENTS.md rule 13). This module imports nothing, so a
 * client component and a Node recount can both read it.
 */

export const LINKED_FILES = ['editions.json', 'races.json', 'bests.json', 'age.json', 'return.json', 'recorded_again.json', 'checks.json'] as const;
export type LinkedFile = (typeof LINKED_FILES)[number];

export type LinkedBasis = 'chip_or_net' | 'gun' | 'not_stated';
export type LinkedEditionVerdict = 'slow' | 'fast' | 'usual';
export type LinkedRaceVerdict = 'faster' | 'slower' | 'about_the_same';
export type LinkedShareVerdict = 'more_often' | 'less_often' | 'as_often';

export interface LinkedEditionRow {
  basis: LinkedBasis;
  timing: 'chip' | 'chip_fallback' | 'gun' | 'mixed' | 'not_stated';
  tier: 'stamped' | 'stamped_weaker_source' | 'partial';
  series?: string;
  reviewed_release?: true;
  finishes: number;
  others: number;
  reading_pct: number;
  lo_pct: number;
  hi_pct: number;
  high_pct: number | null;
  year_sd_pct: number;
  verdict: LinkedEditionVerdict | null;
}

export interface LinkedEditions {
  family: 'linked'; file: 'editions.json'; schema_version: 1;
  margin_pct: number; min_editions: number; min_finishes: number;
  races: Record<string, Record<string, LinkedEditionRow>>;
  summary: { editions: number; races: number; no_verdict: number; by_verdict: Partial<Record<LinkedEditionVerdict, number>>; by_tier: Record<string, number> };
}

export interface LinkedRaceRow {
  reading_pct: number; lo_pct: number; hi_pct: number; boot_lo_pct: number; boot_hi_pct: number; se: number;
  earlier_pct: number; later_pct: number; people_earlier: number; people_later: number; people: number;
  year_sd_pct: number; editions: number; editions_fitted: number; held_for_review: number; finishes: number;
  years: [number, number]; trail_or_mountain: boolean;
  tiers: Record<string, number>; timing: Record<string, number>;
  variants: Partial<Record<'verified' | 'high' | 'wider', { editions: number; reading_pct: number }>>;
  verdict: LinkedRaceVerdict | null;
}

export interface LinkedRaces {
  family: 'linked'; file: 'races.json'; schema_version: 1;
  band_pct: number; min_editions: number; min_people_each_way: number;
  races: Record<string, LinkedRaceRow>;
  series?: Record<string, Record<string, LinkedRaceRow>>;
  summary: { races: number; no_verdict: number; under_the_floor_each_way: number; by_verdict: Partial<Record<LinkedRaceVerdict, number>> };
}

/** One family file with the bytes and digest it was read from (the manifest binds both). */
export interface LinkedRead<T> { data: T; bytes: number; sha256: string }
