import release from '@/analysis/release.json';
import { MARATHON_SECTION_ENDS } from './section-labels';
import { paceLabel, type UnitSystem } from './units';
import type { ChartSpec } from './research-data';
import { dataFetch } from './data-fetch';

export type AllFinisherKind = 'courses' | 'weather' | 'downhill' | 'weather-profile' | 'course-consistency' | 'course-profile' | 'race-day';
export type AllFinisherMode = 'all' | 'history';
export type AllFinisherGroup = {
  id: string; label: string; n: number; edition_n: number; city_n: number;
  slowdown_pct: number; detected_n: number; onset_n: number[] | null; onset_pct: number[] | null;
  late_pct: number; after20_delta_s: number; actual_finish_median_s: number; profile_pct: number[];
  slowdown_spread_pct: number[]; late_spread_pct: number; late_edition_spread_pct: number[];
  lower_c?: number | null; upper_c?: number | null; terrain?: 'downhill' | 'other'; opening?: string;
  edition_index?: number; edition_indices?: number[];
  temp_c?: number | null; opening_net_m?: number | null; historical_route_verified?: false;
};
export type AllFinisherRow = { city: string; age: string; gender: string; early_pace: string; courses: AllFinisherGroup[]; weather: AllFinisherGroup[]; downhill: AllFinisherGroup[]; editions: AllFinisherGroup[] };
export type AllFinisherSelection = { mode: AllFinisherMode; city: string; age: string; gender: string; early_pace: string; opening: string };
export type AllFinisherEvidence = {
  schema_version: 1; mode: 'all-finishers'; release_tag: string; input_as_of: string; as_of: string;
  runner_manifest_sha256: string; context_manifest_sha256: string;
  scripts: Record<string, string>; source_scripts: Record<string, string>; context_source_scripts: Record<string, string>;
  cohort: { raw: number; eligible: number }; analysis_n: number; min_cell: number; min_edition: number; min_editions: number;
  cities: string[]; ages: string[]; genders: string[];
  early_pace_bands: { id: string; lower_s_per_km: number | null; upper_s_per_km: number | null }[];
  temperature_bands: { id: string; lower_c: number | null; upper_c: number | null }[];
  opening_bands: { id: string; label: string }[]; rows: AllFinisherRow[];
};
export type AllFinisherStart = Omit<AllFinisherEvidence, 'rows'> & { initial: AllFinisherRow; bytes: number; sha256: string; edition_labels: { index: number; city: string; year: number; race: string }[] };
export const ALL_FINISHER_DEFAULT: AllFinisherSelection = { mode: 'all', city: 'All courses', age: 'all', gender: 'all', early_pace: 'all', opening: 'fast10' };
export const allFinisherFamily = (kind: AllFinisherKind): 'courses' | 'weather' | 'downhill' => kind === 'downhill' ? 'downhill' : ['weather', 'weather-profile', 'race-day'].includes(kind) ? 'weather' : 'courses';

export function readAllFinisherSelection(search: string, start: Pick<AllFinisherStart, 'cities' | 'ages' | 'genders' | 'early_pace_bands' | 'opening_bands'>): AllFinisherSelection {
  const p = new URLSearchParams(search);
  const city = p.get('race') === 'NYC' ? 'New York' : p.get('race');
  const previous = Number(p.get('previous'));
  const mode = p.has('comparison') ? p.get('comparison') === 'history' ? 'history' : 'all' : p.has('previous') && previous >= 90 && previous <= 720 ? 'history' : 'all';
  return { mode, city: start.cities.includes(city || '') ? city! : 'All courses',
    age: start.ages.includes(p.get('age') || '') ? p.get('age')! : 'all', gender: start.genders.includes(p.get('gender') || '') ? p.get('gender')! : 'all',
    early_pace: start.early_pace_bands.some(row => row.id === p.get('early')) ? p.get('early')! : 'all',
    opening: start.opening_bands.some(row => row.id === p.get('opening')) ? p.get('opening')! : 'fast10' };
}
export function allFinisherSearch(selection: AllFinisherSelection): string {
  return '?' + new URLSearchParams({ comparison: selection.mode, race: selection.city, age: selection.age, gender: selection.gender, early: selection.early_pace, opening: selection.opening }).toString();
}
export function allFinisherRow(rows: AllFinisherRow[], selection: AllFinisherSelection): AllFinisherRow | undefined {
  return rows.find(row => row.city === selection.city && row.age === selection.age && row.gender === selection.gender && row.early_pace === selection.early_pace);
}
export function allFinisherGroups(row: AllFinisherRow, kind: AllFinisherKind, opening: string): AllFinisherGroup[] {
  if (kind === 'race-day') return row.editions;
  return row[allFinisherFamily(kind)].filter(group => kind !== 'downhill' || group.opening === opening);
}
export function earlyPaceLabel(band: AllFinisherStart['early_pace_bands'][number], units: UnitSystem): string {
  if (band.id === 'all') return 'All early paces';
  if (band.lower_s_per_km === null) return 'Faster than ' + paceLabel(band.upper_s_per_km!, units);
  if (band.upper_s_per_km === null) return paceLabel(band.lower_s_per_km, units) + ' or slower';
  return paceLabel(band.lower_s_per_km, units) + ' to under ' + paceLabel(band.upper_s_per_km, units);
}
export function allFinisherGroupLabel(group: AllFinisherGroup, kind: AllFinisherKind, units: UnitSystem): string {
  if (kind === 'race-day') return group.label.replace(/^New York /, 'New York City ');
  if (allFinisherFamily(kind) === 'weather') {
    const temp = (n: number) => `${Number((units === 'mi' ? n * 1.8 + 32 : n).toFixed(1))}°${units === 'mi' ? 'F' : 'C'}`;
    // The band in the page's grammar ("41–50°F"): from its lower edge to below its upper one.
    return group.lower_c == null ? 'Below ' + temp(group.upper_c!) : group.upper_c == null ? temp(group.lower_c) + ' or warmer' : temp(group.lower_c).replace(/°[CF]$/, '') + '–' + temp(group.upper_c);
  }
  if (kind === 'downhill') return group.terrain === 'downhill' ? 'Downhill-start courses' : 'Every other course';
  return group.label === 'New York' ? 'New York City' : group.label;
}
export function allFinisherCharts(groups: AllFinisherGroup[], focus: AllFinisherGroup, comparison: AllFinisherGroup | undefined, kind: AllFinisherKind, units: UnitSystem) {
  const label = (group: AllFinisherGroup) => allFinisherGroupLabel(group, kind, units);
  const axis = kind === 'race-day' ? 'Race edition' : allFinisherFamily(kind) === 'weather' ? 'Start-hour temperature' : kind === 'downhill' ? 'Opening terrain' : 'Course';
  const groupChart = (title: string, key: 'slowdown_pct' | 'late_pct' | 'late_spread_pct' | 'after20_delta_s', unit: string, series: string, note: string): ChartSpec => ({ title, unit, xLabel: axis, series: [{ key: 'value', label: series }], rows: groups.map(group => ({ label: label(group), value: group[key] / (key === 'after20_delta_s' ? 60 : 1), n_value: group.n })), note });
  const selected = [focus, ...(comparison && comparison.id !== focus.id ? [comparison] : [])];
  return {
    slowdown: groupChart('How often sustained slowing appeared', 'slowdown_pct', '%', kind === 'race-day' ? 'Slowdown rate in this edition' : 'Mean edition slowdown rate', kind === 'race-day' ? 'Each rate is the share of eligible finishes with detected sustained slowdown in that race edition, after your filters. Different editions contain different runners.' : 'Average of the qualifying race-edition rates, with each edition given equal weight. Sample sizes count eligible finishes within those editions; dividing pooled detected finishes by the pooled total gives a different measure.'),
    late: groupChart('How much the pace changed late in the race', 'late_pct', '% pace', kind === 'race-day' ? 'Median pace change in this edition' : 'Mean edition median pace change', 'Pace from 30 km to the finish compared with 5–20 km. ' + (kind === 'race-day' ? 'Median for the included finishes in each selected edition. ' : 'First take each edition’s median; then average those medians equally. ') + 'Above zero means slower. This is a descriptive difference, not a causal effect.'),
    consistency: groupChart('How widely late-race experiences varied', 'late_spread_pct', 'percentage points', 'Mean within-edition middle-80% width', 'For each edition, subtract the 10th from the 90th percentile of individual late-pace changes, then average those widths equally. A smaller width means less variation in these race fields; it does not establish an easier or more predictable course.'),
    time: groupChart('Time after 20 km relative to early pace', 'after20_delta_s', 'min', 'Mean edition median time difference', 'Recorded time after 20 km minus the time needed at the same race’s 5–20 km pace. Average of edition medians. This reference is not a predicted finish or avoidable time loss.'),
    profile: { title: 'Follow the pace through the race', kind: 'line', unit: '% pace', xLabel: 'Section end (km)', xNumeric: true, sectionEnds: MARATHON_SECTION_ENDS,
      series: selected.map((group, i) => ({ key: `g${i}`, label: label(group) })),
      rows: MARATHON_SECTION_ENDS.map((end, i) => ({ label: end, ...Object.fromEntries(selected.flatMap((group, j) => [[`g${j}`, group.profile_pct[i]], [`n_g${j}`, group.n]])) })),
      note: 'Each finish uses its own 5–20 km pace as the reference. ' + (kind === 'race-day' ? 'Each line shows medians for a single race edition. ' : 'The lines average edition medians, giving each edition equal weight. ') + 'Above zero means slower. Different groups contain different race fields; these are not the same people trying different conditions.' } as ChartSpec,
    onset: focus.onset_pct ? { title: 'Where sustained slowing first appeared', unit: '%', xLabel: 'First qualifying section', series: [{ key: 'value', label: 'Share of detected slowdowns' }], rows: focus.onset_pct.map((value, i) => ({ label: `${20 + i * 5}–${25 + i * 5} km`, value, n_value: focus.detected_n })), note: 'This chart pools detected finishes in the selected group. ' + (kind === 'race-day' ? '' : 'Unlike the main comparison, it is weighted by finishes, not equally by editions. ') + 'Runners without a detected episode are excluded. Onset is a recorded section boundary, not an exact moment.' } as ChartSpec : null,
  };
}

let cache: { sha256: string; data: AllFinisherEvidence } | null = null;
export async function loadAllFinisherContext(start: AllFinisherStart, signal: AbortSignal): Promise<AllFinisherEvidence> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (cache?.sha256 === start.sha256) return cache.data;
  const response = await dataFetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/all-finisher-context/evidence.json?v=' + start.sha256, { signal });
  if (!response.ok) throw new Error('The comparison could not load. Please try again.');
  const bytes = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== start.sha256 || bytes.byteLength !== start.bytes) throw new Error('The comparison data changed. Reload the page to use the current data.');
  const data = JSON.parse(new TextDecoder().decode(bytes)) as AllFinisherEvidence;
  if (data.schema_version !== 1 || data.mode !== 'all-finishers' || data.release_tag !== release.tag || data.as_of !== start.as_of || data.analysis_n !== start.analysis_n || data.runner_manifest_sha256 !== start.runner_manifest_sha256 || data.context_manifest_sha256 !== start.context_manifest_sha256 || !Array.isArray(data.rows)) throw new Error('The comparison data could not be verified. Please reload.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  cache = { sha256: start.sha256, data }; return data;
}
