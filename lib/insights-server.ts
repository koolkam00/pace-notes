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
  /** The release's verification tier of the edition: stamped, stamped_weaker_source, partial or unverified. */
  tier: string; weaker_source: boolean;
  race_date: string | null;
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
  /** Every other edition with written records, as [city, year, raw, category]: recorded times only, no file. */
  other_editions: { columns: string[]; rows: [string, number, number, string][] };
};

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
  if (manifest.schema_version !== 1 || manifest.release_tag !== release.tag) throw new Error('The marathon cohort must be the adopted release\'s.');
  if (manifest.other_editions?.columns?.join() !== 'city,year,raw,category') throw new Error('The marathon cohort lists its other editions in an unexpected shape.');
  cohort = { key, manifest, sha256: sha256(bytes) };
  return cohort;
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
