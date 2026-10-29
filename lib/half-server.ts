import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import pin from '@/analysis/half-release.json';
import type { HalfDataFile, HalfFiles, HalfManifest, HalfReleasePin } from '@/lib/half-types';

/**
 * The half-marathon aggregates (public/data/half/, analysis/build_half.py), verified once per process at build time.
 * Server only. `getHalfManifest()` throws unless the manifest binds the pinned half snapshot, link build and policy
 * (analysis/half-release.json), the adopted marathon release, the current runner manifest, the weather evidence and
 * the cited marathon files, and unless every family file's bytes and sha256 equal the manifest's. A half page or panel
 * therefore never renders from data built for another release or edited after its build.
 */

const ROOT = () => path.join(process.cwd(), 'public/data/half');
const DATA = () => path.join(process.cwd(), 'public/data');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const PIN = pin as HalfReleasePin;

let verified: { key: string; manifest: HalfManifest } | undefined;

/** The half manifest, verified once per process. */
export function getHalfManifest(): HalfManifest {
  const file = path.join(ROOT(), 'manifest.json');
  const stat = fs.statSync(file);
  const key = `${stat.size}:${stat.mtimeMs}`;
  if (verified?.key === key) return verified.manifest;
  const manifest = JSON.parse(fs.readFileSync(file).toString()) as HalfManifest;
  if (manifest.schema_version !== 1 || manifest.family !== 'half') throw new Error('Half data: unexpected manifest.');
  if (manifest.half.tag !== PIN.half.tag || manifest.half.sqlite_sha256 !== PIN.half.sqlite_sha256) throw new Error('Half data must be rebuilt for the pinned half snapshot.');
  if (manifest.links.tag !== PIN.links.tag || manifest.links.extract_content_sha256 !== PIN.links.extract_content_sha256) throw new Error('Half data must be rebuilt for the pinned link build.');
  if (PIN.marathon_release !== release.tag || manifest.marathon.release_tag !== release.tag) throw new Error('Half data must use the adopted marathon release.');
  if (manifest.policy.file !== PIN.policy || manifest.policy.sha256 !== sha256(fs.readFileSync(path.join(process.cwd(), PIN.policy)))) throw new Error('Half data must be rebuilt for the reviewed half policy.');
  if (manifest.marathon.runner_manifest_sha256 !== sha256(fs.readFileSync(path.join(DATA(), 'runners/manifest.json')))) throw new Error('Half data must be rebuilt for the current runner records.');
  if (manifest.marathon.weather_evidence_sha256 !== sha256(fs.readFileSync(path.join(DATA(), 'weather/evidence.json')))) throw new Error('Half data must be rebuilt for the current weather evidence.');
  for (const [name, expected] of Object.entries(manifest.marathon.inputs)) {
    if (sha256(fs.readFileSync(path.join(DATA(), name))) !== expected) throw new Error(`Half data must be rebuilt: the cited marathon file ${name} changed.`);
  }
  for (const [name, meta] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(ROOT(), name));
    if (bytes.length !== meta.bytes || sha256(bytes) !== meta.sha256) throw new Error(`Half data file changed after its manifest was written: ${name}`);
  }
  verified = { key, manifest };
  return manifest;
}

/** True when the family file is in the verified manifest (a family left out is not published). */
export function halfPublished(name: HalfDataFile | string): boolean {
  return Boolean(getHalfManifest().files[name]);
}

/** One verified family file. */
export function readHalf<K extends HalfDataFile>(name: K): HalfFiles[K] {
  const manifest = getHalfManifest();
  const meta = manifest.files[name];
  if (!meta) throw new Error(`Unknown or unpublished half data file: ${name}`);
  const value = JSON.parse(fs.readFileSync(path.join(ROOT(), name)).toString()) as HalfFiles[K] & { scope?: string };
  if ('scope' in value && meta.scope !== 'per-card' && value.scope !== meta.scope) throw new Error(`Half data scope mismatch: ${name}`);
  return value;
}

/** The sha256 the browser checks when it loads a half file (lib/half.ts loadHalf). */
export function halfSha(name: HalfDataFile): string {
  const meta = getHalfManifest().files[name];
  if (!meta) throw new Error(`Unknown or unpublished half data file: ${name}`);
  return meta.sha256;
}
