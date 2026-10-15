import type { CityData, CheckpointData } from './personalized-types';
import { GUIDE_PACK } from './personalized';
import { dataFetch } from './data-fetch';

const cache = new Map<string, CityData | CheckpointData>();
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export async function loadAnalysisAggregate<T extends CityData | CheckpointData>(file: string, city: string, vintage: string, signal: AbortSignal): Promise<T> {
  if (!/^(city|checkpoint)_[0-9]{2,3}\.json$/.test(file)) throw new Error('This comparison file is not available.');
  const key = file + ':' + vintage;
  const stored = cache.get(key);
  if (stored && stored.city === city) return stored as T;
  const response = await dataFetch(basePath + '/data/packs/' + GUIDE_PACK + '/tables/' + file + '?v=' + encodeURIComponent(vintage), { signal });
  if (!response.ok) throw new Error('The comparison could not load. Check your connection and try again.');
  const data = await response.json();
  const correctShape = file.startsWith('city_') ? data?.cohorts && typeof data.cohorts === 'object' && Array.isArray(data.terrain) : Array.isArray(data?.rows);
  if (data?.city !== city || !correctShape) throw new Error('The comparison file is incomplete. Please try loading it again.');
  cache.set(key, data);
  if (cache.size > 3) cache.delete(cache.keys().next().value!);
  return data as T;
}
