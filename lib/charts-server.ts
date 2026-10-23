import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import catalog from '@/lib/charts/catalog.json';
import type { CatalogItem, ChartFile, ChartsManifest } from '@/lib/charts/types';

const ROOT = () => path.join(process.cwd(), 'public/data/charts');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

let verified: { key: string; manifest: ChartsManifest } | undefined;

/** The charts manifest, verified once per process: release pin, runner-manifest binding, catalog and every file digest. */
export function getChartsManifest(): ChartsManifest {
  const stat = fs.statSync(path.join(ROOT(), 'manifest.json'));
  const key = `${stat.size}:${stat.mtimeMs}`;
  if (verified?.key === key) return verified.manifest;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT(), 'manifest.json')).toString()) as ChartsManifest;
  const runnerBytes = fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json'));
  if (manifest.schema_version !== 1 || manifest.release_tag !== release.tag) throw new Error('Chart data must use the adopted release.');
  if (manifest.runner_manifest_sha256 !== sha256(runnerBytes)) throw new Error('Chart data must be rebuilt for the current runner records.');
  if (manifest.catalog_sha256 !== sha256(fs.readFileSync(path.join(process.cwd(), 'lib/charts/catalog.json')))) throw new Error('Chart data must be rebuilt for the current catalog.');
  for (const [name, meta] of Object.entries(manifest.files)) {
    const file = fs.readFileSync(path.join(ROOT(), name));
    if (file.length !== meta.bytes || sha256(file) !== meta.sha256) throw new Error(`Chart data file changed after its manifest was written: ${name}`);
  }
  verified = { key, manifest };
  return manifest;
}

export const CATALOG = catalog as CatalogItem[];

/** One verified chart file. */
export function readChart(slug: string): ChartFile {
  const manifest = getChartsManifest();
  const name = `${slug}.json`;
  if (!manifest.files[name]) throw new Error(`Unknown chart data file: ${name}`);
  const value = JSON.parse(fs.readFileSync(path.join(ROOT(), name)).toString()) as ChartFile;
  if (value.release_tag !== manifest.release_tag || value.slug !== slug) throw new Error(`Chart data mismatch: ${name}`);
  return value;
}

export const chartByNumber = (n: number) => CATALOG.find((c) => c.number === n);
export const chartHref = (n: number) => `/charts/${n}`;
