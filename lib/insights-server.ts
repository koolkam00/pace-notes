import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import type { Archetypes, InsightsManifest, ReplayEditionMeta } from './insights';

const ROOT = () => path.join(process.cwd(), 'public/data/insights');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/**
 * One edition of the marathon cohort (analysis/marathon-cohort/manifest.json; analysis/cohort.py states the format): an
 * edition the edition policy counts, or one that keeps only an own-record view and supplies no pooled figure.
 */
export type CohortEdition = {
  city: string; year: number; race: string; race_id: string;
  /** The race of a plain key that holds several (Warsaw), from the race registry; null elsewhere. No story groups by it. */
  series: string | null;
  /** The release's verification tier of the edition (stamped, stamped_weaker_source, partial or unverified), its weaker-source mark and its split tier. */
  tier: string; weaker_source: boolean; split_tier: string;
  /** The release's timing basis text of the edition, or null where it states none. */
  timing_basis: string | null;
  /** The race day and where it comes from; every counted edition has one. */
  race_date: string | null; race_date_source: 'weather' | 'reviewed' | 'external' | null;
  use: 'counted' | 'own_record';
  /** Every written record, and the counted (eligible) finishes among them: zero unless `use` is counted. */
  raw: number; eligible: number;
};
/** The cohort manifest's fields the site reads at build time. */
export type CohortManifest = {
  schema_version: number; release_tag: string; input_as_of: string; as_of: string;
  points_km: number[];
  /** Every written marathon record of the release, and the counted finishes every analysis reads. */
  raw_records: number; eligible_records: number;
  editions: CohortEdition[];
  /**
   * Every other edition with written records (recorded times only, no file), as rows in the order of `columns`
   * (OTHER_COLUMNS): city, year, raw, the edition policy's category, and the release's tier, weaker-source mark and
   * split tier.
   */
  other_editions: { columns: string[]; rows: (string | number | boolean | null)[][] };
};
/**
 * One edition with written records as a page may name it: counted, kept for an own-record view, or giving recorded
 * times only (`other`, with the edition policy's category). `tier`, `weakerSource` and `splitTier` are the release's
 * codes, which the cohort manifest states for every edition.
 */
export type ListedEdition = {
  city: string; year: number; use: 'counted' | 'own_record' | 'other'; raw: number; eligible: number;
  tier: string; weakerSource: boolean; splitTier: string; category: string | null; raceDate: string | null;
  /** The release's timing basis text; null where it states none, and for an edition without a file (the cohort manifest carries it for the others only). */
  timingBasis: string | null;
};

/** The cohort manifest's version this site reads, and the columns of its `other_editions` rows (analysis/cohort.py SCHEMA_VERSION, OTHER_COLUMNS). */
const COHORT_SCHEMA_VERSION = 2;
const OTHER_COLUMNS = ['city', 'year', 'raw', 'category', 'tier', 'weaker_source', 'split_tier'];

let cohort: { key: string; manifest: CohortManifest; sha256: string } | undefined;

/**
 * The marathon cohort's manifest, read from the checkout at build time, and the SHA-256 of its exact bytes: the digest
 * every story and tool file names as the records it was built from. No browser reads the cohort.
 */
export function getCohortManifest(): { manifest: CohortManifest; sha256: string } {
  const file = path.join(process.cwd(), 'analysis/marathon-cohort/manifest.json');
  const stat = fs.statSync(file);
  const key = `${stat.size}:${stat.mtimeMs}`;
  if (cohort?.key === key) return cohort;
  const bytes = fs.readFileSync(file);
  const manifest = JSON.parse(bytes.toString()) as CohortManifest;
  if (manifest.schema_version !== COHORT_SCHEMA_VERSION || manifest.release_tag !== release.tag) throw new Error('The marathon cohort must be the adopted release\'s.');
  if (JSON.stringify(manifest.other_editions?.columns) !== JSON.stringify(OTHER_COLUMNS)) throw new Error('The marathon cohort lists its other editions in an unexpected shape.');
  cohort = { key, manifest, sha256: sha256(bytes) };
  return cohort;
}

let listed: { key: string; editions: ListedEdition[] } | undefined;

/**
 * Every marathon edition with written records in the release, from the cohort manifest: the editions with a file and
 * the others it lists, each once, ordered by city and year. A course page names its editions and their tiers from here.
 */
export function listedEditions(): ListedEdition[] {
  const { manifest, sha256: digest } = getCohortManifest();
  if (listed?.key === digest) return listed.editions;
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  const editions: ListedEdition[] = [
    ...manifest.editions.map((e) => ({
      city: e.city, year: e.year, use: e.use, raw: e.raw, eligible: e.use === 'counted' ? e.eligible : 0,
      tier: e.tier, weakerSource: e.weaker_source, splitTier: e.split_tier, category: null, raceDate: e.race_date ?? null, timingBasis: text(e.timing_basis),
    })),
    ...manifest.other_editions.rows.map(([city, year, raw, category, tier, weaker, split]) => ({
      city: String(city), year: Number(year), use: 'other' as const, raw: Number(raw), eligible: 0,
      tier: tier as string, weakerSource: weaker as boolean, splitTier: split as string, category: text(category), raceDate: null, timingBasis: null,
    })),
  ];
  const seen = new Set<string>();
  for (const e of editions) {
    const k = `${e.city}|${e.year}`;
    if (seen.has(k) || !Number.isInteger(e.year) || !Number.isInteger(e.raw) || e.raw < 1) throw new Error(`The marathon cohort lists ${e.city} ${e.year} twice or without its records.`);
    // Every edition a page may name carries its tier (lead decision D3); the shared labels refuse a code they do not know.
    if (!text(e.tier) || typeof e.weakerSource !== 'boolean' || !text(e.splitTier)) throw new Error(`The marathon cohort lists ${e.city} ${e.year} without its tier.`);
    seen.add(k);
  }
  editions.sort((a, b) => (a.city < b.city ? -1 : a.city > b.city ? 1 : a.year - b.year));
  listed = { key: digest, editions };
  return editions;
}

let verified: { key: string; manifest: InsightsManifest } | undefined;

/**
 * Read and verify the story manifest: release pin, cohort-manifest binding and every file digest.
 * The full check runs once per process for a given manifest file; metadata and story text read it many times per build.
 */
export function getInsightsManifest(): InsightsManifest {
  const stat = fs.statSync(path.join(ROOT(), 'manifest.json'));
  const key = `${stat.size}:${stat.mtimeMs}`;
  if (verified?.key === key) return verified.manifest;
  const manifest = verifyInsightsManifest();
  verified = { key, manifest };
  return manifest;
}

function verifyInsightsManifest(): InsightsManifest {
  const bytes = fs.readFileSync(path.join(ROOT(), 'manifest.json'));
  const manifest = JSON.parse(bytes.toString()) as InsightsManifest;
  if (manifest.schema_version !== 1 || manifest.release_tag !== release.tag) throw new Error('Story data must use the adopted release.');
  // `runner_manifest_sha256` names the cohort manifest (see InsightsManifest); the two spellings must agree.
  const cohortSha = getCohortManifest().sha256;
  if (manifest.runner_manifest_sha256 !== cohortSha || manifest.cohort_manifest_sha256 !== cohortSha) throw new Error('Story data must be rebuilt for the current marathon cohort.');
  for (const [name, meta] of Object.entries(manifest.files)) {
    const file = fs.readFileSync(path.join(ROOT(), name));
    if (file.length !== meta.bytes || sha256(file) !== meta.sha256) throw new Error(`Story data file changed after its manifest was written: ${name}`);
  }
  return manifest;
}

/** Read one verified story file, after the manifest check. */
export function readInsight<T>(name: string): T {
  const manifest = getInsightsManifest();
  if (!manifest.files[name]) throw new Error(`Unknown story data file: ${name}`);
  const value = JSON.parse(fs.readFileSync(path.join(ROOT(), name)).toString());
  if (name !== 'course-geometry.json' && value.release_tag !== manifest.release_tag) throw new Error(`Story data release mismatch: ${name}`);
  return value as T;
}

export function insightFileVersion(name: string): string {
  return getInsightsManifest().files[name]?.sha256 ?? '';
}

/** Archetype data for client charts, without the per-minute barcode that no chart reads. */
export function clientArchetypes(data: Archetypes): Archetypes {
  const { barcode_minutes: _unused, ...rest } = data;
  return rest;
}

export type ReplayRoute = { points: [number, number][]; km: number[] };
export type ReplayChoice = Pick<ReplayEditionMeta, 'slug' | 'city' | 'year' | 'finishes' | 'sample' | 'file'> & { version: string; route: ReplayRoute | null };

/** Only the fields the replay picker reads, bound to each sample file's published SHA-256. */
export function replayChoices(editions: ReplayEditionMeta[], manifest: InsightsManifest, routes: Map<string, ReplayRoute>): ReplayChoice[] {
  return editions.map(({ slug, city, year, finishes, sample, file }) => ({ slug, city, year, finishes, sample, file, version: manifest.files[file].sha256, route: routes.get(city) ?? null }));
}
