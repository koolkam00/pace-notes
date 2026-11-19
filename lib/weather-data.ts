import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WeatherEvidence } from './weather-types';
import { WEATHER_QUESTIONS } from './weather-catalog';
import release from '@/analysis/release.json';
import weatherRelease from '@/analysis/weather-release.json';

export function getWeatherEvidence(): WeatherEvidence {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/weather/evidence.json'), 'utf8')) as WeatherEvidence;
  if (data.schema_version !== 1 || data.candidates.length !== 3 || !data.editions.length) throw new Error('Invalid weather evidence.');
  if (weatherRelease.tag !== release.tag || data.input.release_tag !== release.tag) throw new Error('Weather evidence must match the current study release.');
  // The evidence is built beside the marathon cohort and names its manifest by digest (since November 14, 2026).
  const cohort = crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), 'analysis/marathon-cohort/manifest.json'))).digest('hex');
  if (data.cohort_manifest_sha256 !== cohort) throw new Error('Weather evidence must be built on the current marathon cohort.');
  return data;
}
export function getWeatherAnalyses(evidence: WeatherEvidence = getWeatherEvidence()) {
  return WEATHER_QUESTIONS.filter(item => evidence.candidates.some(candidate => candidate.id === item.id && candidate.status === 'ready'));
}
