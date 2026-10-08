import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import type { Archetypes, InsightsManifest, ReplayEditionMeta } from './insights';

const ROOT = () => path.join(process.cwd(), 'public/data/insights');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

let verified: { key: string; manifest: InsightsManifest } | undefined;

/**
 * Read and verify the story manifest: release pin, runner-manifest binding and every file digest.
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
  const runnerBytes = fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json'));
  if (manifest.schema_version !== 1 || manifest.release_tag !== release.tag) throw new Error('Story data must use the adopted release.');
  if (manifest.runner_manifest_sha256 !== sha256(runnerBytes)) throw new Error('Story data must be rebuilt for the current runner records.');
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
