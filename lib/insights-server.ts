import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import type { InsightsManifest } from './insights';

const ROOT = () => path.join(process.cwd(), 'public/data/insights');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Read and verify the story manifest: release pin, runner-manifest binding and every file digest. */
export function getInsightsManifest(): InsightsManifest {
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

/** Read one verified story file. The manifest check runs first on every call. */
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
