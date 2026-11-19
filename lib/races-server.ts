/**
 * The marathon race directory as the pages read it, at build time (public/data/races/, contract docs/RACES.md; built by
 * analysis/build_races.py and checked by scripts/verify-races.cjs). Every file is read only after its bytes and sha256
 * match the directory's own manifest, so a page never prints a file other than the one the verifier checked. Nothing
 * here computes a published number: the pages print the fields as they are, and lib/nuggets/courses.ts words them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { RaceDirectory, RaceFile, RacePage } from './races-types';

const DIR = () => path.join(process.cwd(), 'public/data/races');

type Manifest = { files: Record<string, { bytes: number; sha256: string }> };
let manifest: Manifest | undefined;
const cache = new Map<string, unknown>();

function racesManifest(): Manifest {
  if (!manifest) manifest = JSON.parse(fs.readFileSync(path.join(DIR(), 'manifest.json'), 'utf8')) as Manifest;
  return manifest;
}

/** One file of the family, checked against the manifest (bytes and sha256). Throws on a file the manifest does not list. */
function read<T>(rel: string): T {
  if (cache.has(rel)) return cache.get(rel) as T;
  const meta = racesManifest().files[rel];
  if (!meta) throw new Error(`The race directory's manifest lists no ${rel}.`);
  const bytes = fs.readFileSync(path.join(DIR(), rel));
  if (bytes.length !== meta.bytes || createHash('sha256').update(bytes).digest('hex') !== meta.sha256) throw new Error(`public/data/races/${rel} is not the file its manifest records.`);
  const parsed = JSON.parse(bytes.toString('utf8')) as T;
  cache.set(rel, parsed);
  return parsed;
}

/** The sha256 the browser checks the on-demand list against (components/races/RaceFinder.client.tsx). */
export const directorySha = () => racesManifest().files['directory.json'].sha256;

/** Every race with a page (pages.json), in registry order. */
export const racePages = (): RacePage[] => read<{ pages: RacePage[] }>('pages.json').pages;

/** The races with a results page (the second template at /courses/<slug>), keyed by slug. */
export function resultsPages(): Map<string, RacePage> {
  return new Map(racePages().filter((p) => p.page === 'results').map((p) => [p.slug, p]));
}

/** The race with a page at this slug, or null. */
export const racePage = (slug: string): RacePage | null => racePages().find((p) => p.slug === slug) ?? null;

/** The race with a page whose label (the pipeline's `city`) is this, or null. */
export const racePageByLabel = (label: string): RacePage | null => racePages().find((p) => p.label === label) ?? null;

/** One race's file (a race with a page). */
export function raceFile(slug: string): RaceFile {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`No race file for ${slug}.`);
  const race = read<RaceFile>(`race/${slug}.json`);
  if (race.slug !== slug) throw new Error(`race/${slug}.json is another race's file.`);
  return race;
}

/** The race file of a race label with a page, or null. */
export function raceFileByLabel(label: string): RaceFile | null {
  const page = racePageByLabel(label);
  return page ? raceFile(page.slug) : null;
}

/** The whole directory (every race listed, its editions as compact rows). */
export const raceDirectory = (): RaceDirectory => read<RaceDirectory>('directory.json');

/** The counts a page prints (summary.json): the races listed, by page type. */
export const raceSummary = () => read<{ races: { total: { n: number }; by_page: Record<string, number> } }>('summary.json');
