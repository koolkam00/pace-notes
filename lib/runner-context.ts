import { RUNNER_RELEASE, RUNNER_POINTS, runnerMetrics, runnerManifestDigest, type RunnerRace, type RunnerManifest } from './runner-search';
import { dataFetch } from './data-fetch';

export type Quantiles = { q25: number; median: number; q75: number };
export type PacePeers = { n: number; from_sec: number; to_sec: number; q25: number[]; median: number[]; q75: number[]; late_change: Quantiles };
export type PeerGroup = { n: number; finish: [number, number][]; pace: Record<string, PacePeers> };
export type ComparisonKey = 'all' | 'gender' | 'age' | 'age_gender';
export type PeerComparison = { key: ComparisonKey; label: string; n: number; other_n: number; rank: number; ties: number; percentile: number; median_finish: number; pace: PacePeers | null };
export type WeatherHour = { time: string; temp_c: number; feels_like_c: number | null; dewpoint_c: number | null; humidity_pct: number | null; wind_mps: number | null; precip_mm: number | null };
export type RunnerWeather = { date: string; scheduled_start: string; start_hour: string; four_hour: string; temp_c: number; feels_like_c: number | null; dewpoint_c: number; humidity_pct: number; wind_mps: number; wind_dir_deg: number | null; precip_mm: number | null; cloud_pct: number | null; pressure_hpa: number | null; warming_c: number; hours: WeatherHour[]; source: string; source_url: string | null; notes: string; context_label: string; precipitation_note: string };
export type TerrainSection = { start_km: number; end_km: number; gain_m: number; loss_m: number; net_m: number };
export type RunnerTerrain = { course_key: string; gain_m: number; loss_m: number; net_m: number; sections: TerrainSection[]; source: string; source_url: string | null; notes: string; context_label: string; historical_validity_known: boolean; valid_from_year: number | null; valid_to_year: number | null; profile_distance_km: number; segment_span_km: number; reported_profile_gain_m: number | null; reported_profile_loss_m: number | null; aggregation_method: string };
/**
 * One counted marathon edition's context. `edition.index` is the edition's index in the marathon cohort's manifest
 * (the lookup's `editions[e].context`), not its position in the lookup's own edition table.
 */
export type EditionContext = {
  schema_version: 1; release_tag: string; edition: { index: number; city: string; year: number; race: string };
  eligible_n: number; age_n: number; gender_n: number; groups: Record<string, PeerGroup>;
  weather: RunnerWeather | null; weather_reason: string | null; terrain: RunnerTerrain | null; terrain_reason: string | null;
};
/**
 * The runner-context manifest. Since lookup version 2 (November 14, 2026) it is bound to the marathon cohort, not to
 * the lookup: `runner_manifest_sha256` and `runner_manifest_as_of` keep their names and hold the cohort manifest's
 * SHA-256 and time, which the lookup's manifest repeats (`cohort`). `editions` maps a cohort edition index to its
 * file, and lists only the counted editions that have peers, weather or terrain: an index it does not list means no
 * comparison for that edition (lead ruling D24.8), never an error.
 */
export type ContextManifest = {
  schema_version: 1; release_tag: string; input_as_of: string; as_of: string; runner_manifest_as_of: string;
  runner_manifest_sha256: string; cohort: { raw: number; eligible: number };
  editions: Record<string, { file: string; bytes: number; sha256: string }>;
};
export type RaceInsights = Omit<EditionContext, 'groups'> & { comparisons: Record<ComparisonKey, PeerComparison | null> };
export type RaceDifference = { finish: number; early: number; late: number; sections: { start: number; end: number; seconds: number }[]; sameCourse: boolean };
const base = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/runner-context/';
const cache = new Map<string, EditionContext>();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && Number(value) >= min;
const error = () => new Error('These comparisons could not be verified. Reload the page and try again.');
const checksum = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
export function runnerAgeBand(age: number | null): string | null {
  if (age === null || !Number.isInteger(age) || age < 18 || age >= 90) return null;
  const from = age < 25 ? 18 : Math.floor(age / 5) * 5;
  return `${from}-${age < 25 ? 24 : from + 4}`;
}
export function runnerGender(sex: string | null): string | null {
  const value = sex?.trim().toLowerCase();
  return ['f', 'female', 'woman', 'women'].includes(value || '') ? 'Women' : ['m', 'male', 'man', 'men'].includes(value || '') ? 'Men' : null;
}
export function pacePeerKey(finishSeconds: number): string { return String(Math.floor((Math.round(finishSeconds * 1000) / 60000 + 7.5) / 15) * 15); }
/** Midrank percentile of the other eligible finishes; exact source ties count half. */
export function finishPlacement(group: PeerGroup, finishSeconds: number) {
  const time = Math.round(finishSeconds * 1000) / 1000;
  let faster = 0, ties = 0;
  for (const [seconds, n] of group.finish) { if (seconds < time) faster += n; else if (seconds === time) { ties = n; break; } else break; }
  if (group.n < 101 || !ties) return null;
  const other = group.n - 1, slower = group.n - faster - ties;
  const at = (index: number) => { let seen = 0; for (const [seconds, n] of group.finish) { seen += n; if (index < seen) return seconds; } throw error(); };
  return { n: group.n, other_n: other, rank: faster + 1, ties: ties - 1, percentile: 100 * (slower + (ties - 1) / 2) / other, median_finish: (at(Math.floor((group.n - 1) / 2)) + at(Math.floor(group.n / 2))) / 2 };
}
export function raceInsights(data: EditionContext, race: RunnerRace): RaceInsights {
  const metrics = runnerMetrics(race), age = runnerAgeBand(race.age), gender = runnerGender(race.sex);
  const entries: [ComparisonKey, string | null, string][] = [
    ['all', 'all', 'All eligible finishers'], ['gender', gender ? `gender:${gender}` : null, gender || 'Recorded gender unavailable'],
    ['age', age ? `age:${age}` : null, age ? `Ages ${age.replace('-', '–')}` : 'Exact age unavailable'],
    ['age_gender', age && gender ? `age_gender:${age}:${gender}` : null, age && gender ? `${gender}, ages ${age.replace('-', '–')}` : 'Exact age or gender unavailable'],
  ];
  const comparisons = Object.fromEntries(entries.map(([key, id, label]) => {
    const group = id ? data.groups[id] : null, placement = metrics && group ? finishPlacement(group, metrics.finish) : null;
    return [key, placement && group && metrics ? { key, label, ...placement, pace: group.pace[pacePeerKey(metrics.finish)] || null } : null];
  })) as RaceInsights['comparisons'];
  const { groups, ...context } = data;
  return { ...context, comparisons };
}
/** Every signed section difference sums to the signed finish difference. */
export function compareRunnerRaces(focus: RunnerRace, reference: RunnerRace, runners: RunnerManifest): RaceDifference | null {
  const a = runnerMetrics(focus), b = runnerMetrics(reference);
  if (!a || !b || focus.key === reference.key) return null;
  const sections = a.sections.map((s, i) => ({ start: s.start, end: s.end, seconds: s.elapsed - b.sections[i].elapsed }));
  return { finish: a.finish - b.finish, early: Number(focus.times[5]) - Number(reference.times[5]), late: (a.finish - Number(focus.times[5])) - (b.finish - Number(reference.times[5])), sections, sameCourse: runners.editions[focus.edition].city === runners.editions[reference.edition].city };
}
/**
 * The context manifest, checked against the verified lookup manifest: built on the cohort the lookup names (its
 * SHA-256, the release, the input time and the cohort's own time and raw count), with a file entry only under a
 * cohort edition index. `expectedSha`, where a server page passes one (lib/course-page.ts), must also be the digest
 * the context names: a page that binds its own data to one cohort keeps that binding.
 */
export function validateContextManifest(value: unknown, runners: RunnerManifest, expectedSha?: string): ContextManifest {
  const d = value as ContextManifest, cohort = runners.cohort;
  if (!/^[a-f0-9]{64}$/.test(cohort?.manifest_sha256 ?? '') || d?.runner_manifest_sha256 !== cohort.manifest_sha256) throw error();
  if (expectedSha !== undefined && d.runner_manifest_sha256 !== expectedSha) throw error();
  if (!d || d.schema_version !== 1 || d.release_tag !== RUNNER_RELEASE || d.release_tag !== runners.release_tag || d.input_as_of !== cohort.input_as_of || d.runner_manifest_as_of !== cohort.as_of || !Number.isFinite(Date.parse(d.as_of)) || d.cohort?.raw !== cohort.raw_records || !integer(d.cohort.eligible, 1) || d.cohort.eligible !== cohort.eligible_records || !d.editions || typeof d.editions !== 'object' || Array.isArray(d.editions)) throw error();
  for (const [index, meta] of Object.entries(d.editions)) {
    if (!/^(0|[1-9]\d{0,5})$/.test(index) || Number(index) >= cohort.editions || !meta || typeof meta.file !== 'string' || !/^editions\/[a-z0-9]+(-[a-z0-9]+)*\.json\.gz$/.test(meta.file) || !integer(meta.bytes, 1) || !/^[a-f0-9]{64}$/.test(meta.sha256)) throw error();
  }
  return d;
}
/** One edition's context, checked against the lookup's edition that names its cohort index (`context`). */
export function validateEditionContext(value: unknown, index: number, runners: Pick<RunnerManifest, 'release_tag' | 'editions'>): EditionContext {
  const d = value as EditionContext, edition = runners.editions.find(row => row.context === index);
  if (!d || d.schema_version !== 1 || d.release_tag !== runners.release_tag || d.edition?.index !== index || !edition || edition.distance !== 'marathon' || d.edition.city !== edition.city || d.edition.year !== edition.year || d.edition.race !== edition.race || !integer(d.eligible_n) || !integer(d.age_n) || !integer(d.gender_n) || d.age_n > d.eligible_n || d.gender_n > d.eligible_n || !d.groups || typeof d.groups !== 'object') throw error();
  for (const [key, group] of Object.entries(d.groups)) {
    if (!/^(all|gender:(Men|Women)|age:[0-9]{2}-[0-9]{2}|age_gender:[0-9]{2}-[0-9]{2}:(Men|Women))$/.test(key) || !integer(group.n, 101) || group.n > d.eligible_n || !Array.isArray(group.finish) || !group.finish.length || !group.pace) throw error();
    let previous = 0, n = 0;
    for (const row of group.finish) { if (!Array.isArray(row) || row.length !== 2 || !finite(row[0]) || row[0] < 5400 || row[0] > 43200 || row[0] <= previous || !integer(row[1], 1)) throw error(); previous = row[0]; n += row[1]; }
    if (n !== group.n) throw error();
    for (const [band, pace] of Object.entries(group.pace)) {
      if (!integer(Number(band), 90) || Number(band) > 720 || Number(band) % 15 || !integer(pace.n, 101) || pace.n > group.n || pace.from_sec !== (Number(band) - 7.5) * 60 || pace.to_sec !== (Number(band) + 7.5) * 60) throw error();
      if (![pace.q25, pace.median, pace.q75].every(a => Array.isArray(a) && a.length === RUNNER_POINTS.length && a.every(x => finite(x) && x >= 120 - 1e-8 && x <= 1200 + 1e-8))) throw error();
      if (pace.median.some((x, i) => x < pace.q25[i] || x > pace.q75[i]) || !pace.late_change || ![pace.late_change.q25, pace.late_change.median, pace.late_change.q75].every(finite) || pace.late_change.q25 > pace.late_change.median || pace.late_change.median > pace.late_change.q75) throw error();
    }
  }
  if (d.eligible_n >= 101 && d.groups.all?.n !== d.eligible_n) throw error();
  return d;
}
async function loadEdition(index: number, manifest: ContextManifest, runners: RunnerManifest, signal: AbortSignal) {
  const meta = manifest.editions[String(index)], key = manifest.release_tag + ':' + meta.file + ':' + meta.sha256;
  const previous = cache.get(key); if (previous) return previous;
  const response = await dataFetch(base + meta.file + '?v=' + meta.sha256, { signal });
  if (!response.ok) throw new Error('Race comparisons could not load. Check your connection and try again.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== meta.bytes || await checksum(bytes) !== meta.sha256) throw error();
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const data = validateEditionContext(JSON.parse(text), index, runners);
  cache.set(key, data); if (cache.size > 3) cache.delete(cache.keys().next().value!);
  return data;
}
/**
 * Same-edition peers, weather and route for the counted races among `races`, by record key. A race gets an entry only
 * when it is counted (status 0) and the context manifest lists its edition: an own-record or limited race is compared
 * with no one, and an edition without a file has no comparison. Nothing is requested when no race is counted.
 */
export async function loadRaceInsights(races: RunnerRace[], runners: RunnerManifest, signal: AbortSignal): Promise<Record<string, RaceInsights>> {
  const digest = runnerManifestDigest(runners);
  if (!digest) throw error();
  const counted = races.filter(race => race.counted && runners.editions[race.edition]?.context !== null && runners.editions[race.edition]?.context !== undefined);
  const result: Record<string, RaceInsights> = {};
  if (!counted.length) { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); return result; }
  const response = await dataFetch(base + 'manifest.json?v=' + encodeURIComponent(RUNNER_RELEASE), { signal });
  if (!response.ok) throw new Error('Race comparisons could not load. Check your connection and try again.');
  const manifest = validateContextManifest(await response.json(), runners);
  const indexOf = (race: RunnerRace) => runners.editions[race.edition].context as number;
  const editions = [...new Set(counted.map(indexOf))].filter(index => Object.prototype.hasOwnProperty.call(manifest.editions, String(index)));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, editions.length) }, async () => {
    while (next < editions.length) { const index = editions[next++]; const data = await loadEdition(index, manifest, runners, signal); for (const race of counted.filter(r => indexOf(r) === index)) result[race.key] = raceInsights(data, race); }
  }));
  return result;
}
