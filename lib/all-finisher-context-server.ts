import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import { ALL_FINISHER_DEFAULT, allFinisherRow, type AllFinisherEvidence, type AllFinisherKind, type AllFinisherStart } from './all-finisher-context';

export function getAllFinisherContextStart(_kind?: AllFinisherKind): AllFinisherStart {
  const bytes = fs.readFileSync(path.join(process.cwd(), 'public/data/all-finisher-context/evidence.json'));
  // The marathon cohort's manifest, bound by its digest (since November 19, 2026; the runner manifest before).
  const runnerBytes = fs.readFileSync(path.join(process.cwd(), 'analysis/marathon-cohort/manifest.json'));
  const contextBytes = fs.readFileSync(path.join(process.cwd(), 'public/data/runner-context/manifest.json'));
  const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  const data = JSON.parse(bytes.toString()) as AllFinisherEvidence;
  const runners = JSON.parse(runnerBytes.toString());
  if (data.schema_version !== 1 || data.mode !== 'all-finishers' || data.release_tag !== release.tag || data.runner_manifest_sha256 !== sha(runnerBytes) || data.cohort_manifest_sha256 !== data.runner_manifest_sha256 || data.context_manifest_sha256 !== sha(contextBytes) || data.analysis_n !== runners.eligible_records || data.cohort.eligible !== runners.eligible_records) throw new Error('All-finisher comparisons must match the adopted runner and environmental data.');
  if (!['build_all_finisher_context.py', 'build_fast_start_all.py', 'build_fast_start.py'].every(name => data.scripts?.[name])) throw new Error('All-finisher calculation provenance is incomplete.');
  for (const scripts of [data.scripts, data.source_scripts, data.context_source_scripts]) {
    if (!scripts || !Object.keys(scripts).length) throw new Error('All-finisher source provenance is incomplete.');
    for (const [name, expected] of Object.entries(scripts)) {
      if (path.basename(name) !== name || sha(fs.readFileSync(path.join(process.cwd(), 'analysis', name))) !== expected) throw new Error('All-finisher calculation source changed: ' + name);
    }
  }
  const initial = allFinisherRow(data.rows, ALL_FINISHER_DEFAULT);
  if (!initial) throw new Error('The all-course comparison is missing.');
  const { rows, ...metadata } = data;
  return { ...metadata, initial, bytes: bytes.length, sha256: sha(bytes), edition_labels: runners.editions.map((edition: { city: string; year: number; race: string }, index: number) => ({ index, city: edition.city, year: edition.year, race: edition.race })) };
}
