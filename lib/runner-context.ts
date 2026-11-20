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
 * the lookup: `cohort_manifest_sha256` is the cohort manifest's SHA-256, which the lookup's manifest repeats
 * (`cohort.manifest_sha256`); `runner_manifest_sha256` is kept as a compatibility name with the same value, and
 * `runner_manifest_as_of` holds the cohort manifest's time. `cohort` repeats the cohort's counts and `totals.eligible` its eligible count.
 * `editions` maps a cohort edition index (the lookup's `editions[e].context`, as a string) to its file, and lists only
 * the counted editions that have peers, weather or terrain: an index it does not list means no comparison for that
 * edition (lead ruling D24.8), never an error.
 */
export type ContextManifest = {
  schema_version: 1; release_tag: string; input_as_of: string; as_of: string; runner_manifest_as_of: string;
  cohort_manifest_sha256: string; runner_manifest_sha256: string; cohort: { raw: number; eligible: number }; totals: { eligible: number; groups: number };
  counted_editions: number;
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
/** The marathon cohort manifest (analysis/marathon-cohort/manifest.json) as the server-side checks read it. */
export type CohortManifestHead = { release_tag: string; as_of: string; input_as_of: string; raw_records: number; eligible_records: number; editions: { city: string; year: number; race: string }[] };
type Bound = { sha: string; release_tag: string; as_of: string; input_as_of: string; raw: number; eligible: number; editions: number; edition: (index: number) => { city: string; year: number; race: string } | undefined };
/**
 * What the context binds: the cohort. The browser passes the verified lookup manifest, which names the cohort (its
 * SHA-256, times and counts); a server check (scripts/verify-runner-context.cjs, lib/course-page.ts) passes the cohort
 * manifest itself with its digest. Either way the cohort edition index names the edition.
 */
/** The lookup manifest names its editions file; the cohort manifest (which has its own `cohort` counts) does not. */
const isLookup = (runners: RunnerManifest | CohortManifestHead): runners is RunnerManifest => 'editions_file' in runners && !!(runners as RunnerManifest).cohort;
function bound(runners: RunnerManifest | CohortManifestHead, expectedSha?: string): Bound {
  if (isLookup(runners)) {
    const c = runners.cohort, lookup = runners as RunnerManifest;
    if (!/^[a-f0-9]{64}$/.test(c.manifest_sha256 ?? '') || (expectedSha !== undefined && expectedSha !== c.manifest_sha256)) throw error();
    return { sha: c.manifest_sha256, release_tag: lookup.release_tag, as_of: c.as_of, input_as_of: c.input_as_of, raw: c.raw_records, eligible: c.eligible_records, editions: c.editions,
      edition: index => lookup.editions.find(row => row.context === index && row.distance === 'marathon') };
  }
  const c = runners as CohortManifestHead;
  if (!/^[a-f0-9]{64}$/.test(expectedSha ?? '') || !Array.isArray(c.editions)) throw error();
  return { sha: expectedSha!, release_tag: c.release_tag, as_of: c.as_of, input_as_of: c.input_as_of, raw: c.raw_records, eligible: c.eligible_records, editions: c.editions.length, edition: index => c.editions[index] };
}
/**
 * The context manifest, checked against the cohort it was built on (the lookup's or the cohort manifest's own
 * fields: its SHA-256, the release, the input time, the cohort's time and counts), with a file entry only under a
 * cohort edition index, named by it. `expectedSha` is the cohort manifest's digest where the caller holds it.
 */
export function validateContextManifest(value: unknown, runners: RunnerManifest | CohortManifestHead, expectedSha?: string): ContextManifest {
  const d = value as ContextManifest, b = bound(runners, expectedSha);
  if (!d || d.cohort_manifest_sha256 !== b.sha || d.runner_manifest_sha256 !== d.cohort_manifest_sha256 || d.schema_version !== 1 || d.release_tag !== RUNNER_RELEASE || d.release_tag !== b.release_tag ||
    d.input_as_of !== b.input_as_of || d.runner_manifest_as_of !== b.as_of || !Number.isFinite(Date.parse(d.as_of)) || d.cohort?.raw !== b.raw || !integer(d.cohort.eligible, 1) || d.cohort.eligible !== b.eligible || d.totals?.eligible !== b.eligible ||
    !integer(d.counted_editions, 1) || d.counted_editions > b.editions || !d.editions || typeof d.editions !== 'object' || Array.isArray(d.editions) || Object.keys(d.editions).length > d.counted_editions) throw error();
  // An edition has a file only when it has a peer group, a weather row or a route profile (PIPE, November 14, 2026),
  // named by its cohort edition index.
  for (const [index, meta] of Object.entries(d.editions)) {
    if (!/^(0|[1-9]\d{0,5})$/.test(index) || Number(index) >= b.editions || !meta || meta.file !== `editions/${index.padStart(3, '0')}.json.gz` || !integer(meta.bytes, 1) || !/^[a-f0-9]{64}$/.test(meta.sha256)) throw error();
  }
  return d;
}
/** One edition's context, checked against the edition its cohort index names (the lookup's `context`, or the cohort's own list). */
export function validateEditionContext(value: unknown, index: number, runners: RunnerManifest | CohortManifestHead): EditionContext {
  const d = value as EditionContext;
  let edition: { city: string; year: number; race: string } | undefined;
  if (isLookup(runners)) edition = (runners as RunnerManifest).editions.find(row => row.context === index && row.distance === 'marathon');
  else edition = Array.isArray((runners as CohortManifestHead).editions) ? (runners as CohortManifestHead).editions[index] : undefined;
  if (!d || d.schema_version !== 1 || d.release_tag !== runners.release_tag || d.edition?.index !== index || !edition || d.edition.city !== edition.city || d.edition.year !== edition.year || d.edition.race !== edition.race || !integer(d.eligible_n) || !integer(d.age_n) || !integer(d.gender_n) || d.age_n > d.eligible_n || d.gender_n > d.eligible_n || !d.groups || typeof d.groups !== 'object') throw error();
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
