import release from '@/analysis/release.json';
import { dataFetch } from './data-fetch';

export type RunnerEdition = { city: string; year: number; race: string };
export type RunnerManifest = {
  schema_version: 1; release_tag: string; input_as_of: string; as_of: string;
  raw_records: number; named_records: number; profiles: number;
  editions: RunnerEdition[]; points_km: number[];
  shards: Record<string, { sha256: string; bytes: number }>;
};
export type RunnerMatch = [name: string, profileId: number, raceCount: number, firstYear: number, lastYear: number, city: string];
export type RunnerRace = {
  id: number; edition: number; name: string; sex: string | null; age: number | null;
  times: (number | null)[]; raw_times?: (string | null)[];
  eligible: boolean; reason: string | null;
};
export type RunnerProfile = { id: number; names: string[]; races: RunnerRace[] };
export type RunnerSection = { start: number; end: number; elapsed: number; pace: number; cumulative: number };
export type RunnerMetrics = { finish: number; pace: number; baseline: number; latePace: number; lateChange: number; openingChange: number; sections: RunnerSection[] };

export const RUNNER_RELEASE = release.tag;
export const RUNNER_POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
export const RUNNER_PAGE_SIZE = 25;
export function runnerSearchPage(matches: RunnerMatch[], page: number): RunnerMatch[] {
  if (!Number.isSafeInteger(page) || page < 0) return [];
  return matches.slice(page * RUNNER_PAGE_SIZE, (page + 1) * RUNNER_PAGE_SIZE);
}
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const shardCache = new Map<string, unknown>();
// Bind the exact fetched bytes to their parsed object without adding fields to
// the published manifest or trusting a digest supplied inside that manifest.
const manifestDigests = new WeakMap<RunnerManifest, string>();
export const runnerManifestDigest = (manifest: RunnerManifest): string | undefined => manifestDigests.get(manifest);
const problem = () => new Error('The runner data could not be verified. Please reload and try again.');
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Identical to the export normalization; never infer a person's identity from it. */
export function normalizeRunnerName(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
/**
 * A recorded name as the search rows and the record's heading show it (the record's own details keep the recorded
 * spelling): "Last, First" as "First Last", brackets around a name part dropped, a word recorded all in capitals or all
 * in lower case in title case (a lower-case particle after the first word, "van der", stays), and a country code in brackets as a quiet suffix: "(Smith), Clara (GBR)" reads
 * "Clara Smith · GBR", "suozzo, Brian (USA)" "Brian Suozzo · USA", "Aaron SMITH" "Aaron Smith".
 */
export function displayName(name: string): string {
  const code = /\s*\(([A-Z]{2,3})\)$/.exec(name);
  const parts = (code ? name.slice(0, code.index) : name).replace(/[()]/g, '').split(',').map(part => part.trim()).filter(Boolean);
  const cased = (parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(', ')).replace(/\s+/g, ' ')
    .replace(/[\p{L}\p{M}'’-]+/gu, (word, at: number) => /\p{Lu}/u.test(word) && /\p{Ll}/u.test(word) || at && /^(?:da|de|del|der|den|di|do|dos|du|la|le|van|von)$/.test(word) ? word
      : word.toLocaleLowerCase('en-US').replace(/(^|['’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase('en-US')));
  // A token of digits alone in a name field (a bib or ID typed into the first name: "1728207887 Martin") is not shown,
  // so a result row and its sort read by the name (round 6); a record's own details keep the recorded spelling.
  const named = cased.split(' ').filter((word) => !/^\d+[,.]?$/.test(word)).join(' ').replace(/^,\s*|,\s*$/g, '').trim();
  const shown = named || cased;
  return code ? `${shown} · ${code[1]}` : shown;
}
export function runnerNameMatches(name: string, query: string): boolean {
  const words = normalizeRunnerName(name).split(' ');
  const tokens = normalizeRunnerName(query).split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every(token =>
    words.some(word => Array.from(token).length < 3 ? word === token : word.startsWith(token)));
}
export async function runnerShardKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 3);
}
export function validateRunnerManifest(value: unknown): RunnerManifest {
  const data = value as RunnerManifest;
  if (!data || data.schema_version !== 1 || data.release_tag !== RUNNER_RELEASE ||
    !Number.isFinite(Date.parse(data.input_as_of)) || !Number.isFinite(Date.parse(data.as_of)) ||
    !integer(data.raw_records) || !integer(data.named_records) || data.named_records > data.raw_records ||
    !integer(data.profiles) || !Array.isArray(data.editions) || !data.editions.length ||
    data.editions.some(row => !row || typeof row.city !== 'string' || !integer(row.year) || typeof row.race !== 'string') ||
    !Array.isArray(data.points_km) || JSON.stringify(data.points_km) !== JSON.stringify(RUNNER_POINTS) ||
    !data.shards || typeof data.shards !== 'object' || Array.isArray(data.shards) ||
    Object.entries(data.shards).some(([path, info]) => !/^(index|profiles)\/[a-f0-9]{3}\.json\.gz$/.test(path) ||
      !info || !/^[a-f0-9]{64}$/.test(info.sha256) || !integer(info.bytes) || info.bytes === 0)) throw problem();
  return data;
}
export async function loadRunnerManifest(signal?: AbortSignal): Promise<RunnerManifest> {
  const response = await dataFetch(basePath + '/data/runners/manifest.json?v=' + encodeURIComponent(RUNNER_RELEASE), { signal });
  if (!response.ok) throw new Error('Runner search could not load. Check your connection and try again.');
  const bytes = await response.arrayBuffer();
  const manifest = validateRunnerManifest(JSON.parse(new TextDecoder().decode(bytes)));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  manifestDigests.set(manifest, digest);
  return manifest;
}

async function loadShard(path: string, manifest: RunnerManifest, signal: AbortSignal): Promise<unknown> {
  const expected = manifest.shards[path];
  if (!expected) return null;
  const key = manifest.release_tag + ':' + path + ':' + expected.sha256;
  const cached = shardCache.get(key);
  if (cached) return cached;
  const response = await dataFetch(basePath + '/data/runners/' + path + '?v=' + expected.sha256, { signal });
  if (!response.ok) throw new Error('The matching records could not load. Check your connection and try again.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== expected.bytes) throw problem();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expected.sha256) throw problem();
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open the compressed search files. Please use a current browser, or download the full export below.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const data = await new Response(stream).json();
  if (data?.release_tag !== manifest.release_tag) throw problem();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  shardCache.set(key, data);
  if (shardCache.size > 3) shardCache.delete(shardCache.keys().next().value!);
  return data;
}

export async function searchRunnerNames(query: string, manifest: RunnerManifest, signal: AbortSignal): Promise<RunnerMatch[]> {
  const tokens = normalizeRunnerName(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const longest = tokens.reduce((best, token) => Array.from(token).length > Array.from(best).length ? token : best);
  const prefix = Array.from(longest).slice(0, 3).join('');
  const path = 'index/' + await runnerShardKey(prefix) + '.json.gz';
  const data = await loadShard(path, manifest, signal) as { rows: RunnerMatch[] } | null;
  if (!data) return [];
  if (!Array.isArray(data.rows)) throw problem();
  const matches = new Map<number, RunnerMatch>();
  for (const row of data.rows) {
    if (!Array.isArray(row) || row.length !== 6 || typeof row[0] !== 'string' ||
      !integer(row[1]) || !integer(row[2]) || row[2] < 1 || !integer(row[3]) || !integer(row[4]) ||
      row[3] > row[4] || typeof row[5] !== 'string') throw problem();
    if (runnerNameMatches(row[0], query) && !matches.has(row[1])) matches.set(row[1], row);
  }
  // In the order the rows read: by the shown name, without its punctuation ("(Smith), Clara" sorts as "clara smith").
  const key = new Map([...matches.values()].map(row => [row[1], normalizeRunnerName(displayName(row[0]))]));
  return [...matches.values()].sort((a, b) => key.get(a[1])!.localeCompare(key.get(b[1])!) || a[3] - b[3] || a[1] - b[1]);
}

export function validateRunnerProfile(value: unknown, manifest: RunnerManifest): RunnerProfile {
  const data = value as RunnerProfile;
  if (!data || !integer(data.id) || !Array.isArray(data.names) || data.names.some(name => typeof name !== 'string') ||
    !Array.isArray(data.races) || !data.races.length || data.races.some(row => !row || !integer(row.id) ||
      !integer(row.edition) || row.edition >= manifest.editions.length || typeof row.name !== 'string' ||
      (row.sex !== null && typeof row.sex !== 'string') || (row.age !== null && (!Number.isFinite(row.age) || row.age < 0)) ||
      typeof row.eligible !== 'boolean' || (row.reason !== null && typeof row.reason !== 'string') ||
      !Array.isArray(row.times) || row.times.length !== 9 || row.times.some(time => time !== null && (!Number.isFinite(time) || time < 0)) ||
      (row.raw_times !== undefined && (!Array.isArray(row.raw_times) || row.raw_times.length !== 9 || row.raw_times.some(time => time !== null && typeof time !== 'string'))) ||
      (row.eligible && !runnerMetrics(row))) || new Set(data.races.map(row => row.id)).size !== data.races.length) throw problem();
  return data;
}
export async function loadRunnerProfile(id: number, manifest: RunnerManifest, signal: AbortSignal): Promise<RunnerProfile> {
  if (!integer(id)) throw problem();
  const path = 'profiles/' + await runnerShardKey(String(id)) + '.json.gz';
  const data = await loadShard(path, manifest, signal) as { profiles: RunnerProfile[] } | null;
  if (!data || !Array.isArray(data.profiles)) throw problem();
  const candidates = data.profiles.filter(row => row?.id === id);
  if (candidates.length !== 1) throw problem();
  return validateRunnerProfile(candidates[0], manifest);
}

/** Descriptive metrics only; eligibility comes from the audited server-side calculation. */
export function runnerMetrics(race: RunnerRace): RunnerMetrics | null {
  if (!race.eligible || race.times.length !== 9 || race.times.some(time => time === null || !Number.isFinite(time))) return null;
  const times = race.times as number[];
  const sections = times.map((cumulative, i) => {
    const start = i === 0 ? 0 : RUNNER_POINTS[i - 1], elapsed = cumulative - (i === 0 ? 0 : times[i - 1]);
    return { start, end: RUNNER_POINTS[i], elapsed, cumulative, pace: elapsed / (RUNNER_POINTS[i] - start) };
  });
  if (times[8] < 90 * 60 || times[8] > 12 * 3600 || sections.some(row => row.pace < 120 - 1e-7 || row.pace > 1200 + 1e-7)) return null;
  const baseline = (times[3] - times[0]) / 15, latePace = (times[8] - times[5]) / 12.195;
  return { finish: times[8], pace: times[8] / 42.195, baseline, latePace,
    lateChange: 100 * (latePace / baseline - 1), openingChange: 100 * (sections[0].pace / baseline - 1), sections };
}
export function runnerDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return 'Not recorded';
  const millis = Math.round(seconds * 1000), rounded = Math.floor(millis / 1000);
  const fraction = millis % 1000 ? '.' + String(millis % 1000).padStart(3, '0').replace(/0+$/, '') : '';
  return `${Math.floor(rounded / 3600)}:${String(Math.floor(rounded % 3600 / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}${fraction}`;
}

export function runnerProgression(races: RunnerRace[], manifest: RunnerManifest) {
  const valid = races.flatMap(race => {
    const metrics = runnerMetrics(race);
    return metrics ? [{ race, metrics }] : [];
  }).sort((a, b) => manifest.editions[a.race.edition].year - manifest.editions[b.race.edition].year || a.race.id - b.race.id);
  if (!valid.length) return null;
  const best = valid.reduce((current, row) => row.metrics.finish < current.metrics.finish ? row : current);
  const earliestYear = manifest.editions[valid[0].race.edition].year;
  const latestYear = manifest.editions[valid[valid.length - 1].race.edition].year;
  const yearBest = (year: number) => Math.min(...valid.filter(row => manifest.editions[row.race.edition].year === year).map(row => row.metrics.finish));
  // A record ID is not chronology. Never turn two races in the same year into
  // a before/after comparison when the source supplies only a year.
  const yearChange = earliestYear < latestYear ? yearBest(earliestYear) - yearBest(latestYear) : null;
  return { valid, best, earliestYear, latestYear, yearChange };
}
