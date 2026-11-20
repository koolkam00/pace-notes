/**
 * The marathon race directory's published shapes (public/data/races/, contract docs/RACES.md). Types only, so a server
 * page (lib/races-server.ts) and the browser's on-demand list (components/races/RaceFinder.client.tsx) share them.
 */

/** An edition row of directory.json, in the order of `edition_columns`: year, tier, split tier, recorded results, finishes, use, category, timing, review (positions in `codes`). */
export type DirectoryEdition = [number, number, number, number, number, number, number | null, number, number];

export type DirectoryRace = {
  label: string; name: string; place: string | null; page: 'course' | 'results' | 'row'; slug?: string;
  years: [number, number]; results: number; finishes: number; tiers: Record<string, number>;
  editions: DirectoryEdition[]; flags?: string[]; aliases?: string[]; withheld?: string;
};

export type RaceDirectory = {
  schema_version: 1; family: 'races'; distance: 'marathon';
  codes: { tier: string[]; split_tier: string[]; use: string[]; category: string[]; timing: string[]; review: string[]; page: string[]; flags: string[] };
  edition_columns: string[];
  races: DirectoryRace[];
};

/** One race of pages.json: a race with a page. */
export type RacePage = {
  label: string; name: string; place: string | null; slug: string; page: 'course' | 'results';
  years: [number, number]; editions: number; results: number; finishes: number; tiers: Record<string, number>;
  with_checkpoint_times: number; counted_editions: number; own_record_editions: number; universe_editions: number;
  page_before: boolean; flags: string[]; aliases: string[];
};

export type RaceReading = {
  measure: 'median_finish_in_a_typical_verified_year'; median_s: number; editions: number; years: number[];
  lowest_s: number; highest_s: number; finishes: number; timing: Record<string, number>;
};

/** One edition of a race file. `finishes` exactly when `in_universe`; the quartiles and `women` with 100 finishes too. */
export type RaceEdition = {
  year: number; tier: string; split_tier: string; results: number; use: 'counted' | 'own_record' | 'recorded_times_only'; timing: string;
  in_universe: boolean; finishes?: number; p25_s?: number; median_s?: number; p75_s?: number;
  women?: { n: number; of: number; share: number } | null; category?: string; review?: string; copy_of?: { label: string; year: number };
};

export type RaceSeries = { name: string; first_year: number; last_year: number; years: number[]; reading: RaceReading | null };

export type RaceFile = {
  schema_version: 1; label: string; name: string; place: string | null; slug: string; page: 'course' | 'results'; flags: string[];
  editions: RaceEdition[]; reading: RaceReading | null;
  reading_note: null | 'fewer_than_three_verified_editions_of_100_finishes' | 'per_series';
  series?: RaceSeries[];
};

/** The flag under which a list prints the label and the place, never the platform's title (docs/RACES.md rule 6). */
export const TITLE_MISLEADS = 'title_misleads';

/** How a list or a page names a race: its registry name, or its label where the platform's title misleads. */
export const raceDisplayName = (race: { label: string; name: string; flags?: string[] }) => ((race.flags ?? []).includes(TITLE_MISLEADS) ? race.label : race.name);
