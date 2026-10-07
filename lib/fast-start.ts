import release from '@/analysis/release.json';
import { AGE_OPTIONS } from './personalized-catalog';
import { MARATHON_SECTION_ENDS } from './section-labels';
import type { ChartSpec } from './research-data';

export type FastStartGroup = {
  band: string; n: number; editions: number;
  finish_delta_median_s: number; finish_delta_p10_s: number; finish_delta_p90_s: number;
  finish_delta_mean_s: number; opening_delta_mean_s: number; remainder_delta_mean_s: number;
  slowdown_n: number; onset: number[] | null; pace_pct: number[]; late_change_median_pct: number;
  after20_delta_p10_s?: number; after20_delta_median_s?: number; after20_delta_p90_s?: number; actual_finish_median_s?: number;
};
export type FastStartMode = 'all' | 'history';
export type FastStartSelection = { mode: FastStartMode; city: string; age: string; gender: string; prior: string; band: string };
export type FastStartRow = Omit<FastStartSelection, 'band' | 'mode'> & { groups: FastStartGroup[] };
export type FastStartEvidence = {
  schema_version: 1; release_tag: string; input_as_of: string; as_of: string;
  runner_manifest_sha256: string; history_n: number; min_cell: number;
  cohort: { raw: number; eligible: number }; bands: { id: string; label: string }[];
  rows: FastStartRow[];
  mode?: 'all-finishers'; analysis_n?: number;
};
export type FastStartStart = {
  initial: FastStartRow; cities: string[]; bands: FastStartEvidence['bands'];
  history_n: number; min_cell: number; release_tag: string; as_of: string;
  sha256: string; bytes: number;
  mode: FastStartMode; analysis_n: number;
};
export type FastStartStarts = Record<FastStartMode, FastStartStart>;
export const FAST_START_DEFAULT: FastStartSelection = { mode: 'all', city: 'All courses', age: 'all', gender: 'all', prior: 'all', band: 'fast10' };
export const PRIOR_OPTIONS = [
  { id: 'all', label: 'All earlier times' }, { id: 'under3', label: 'Under 3:00' },
  { id: '3to330', label: '3:00–3:29:59' }, { id: '330to4', label: '3:30–3:59:59' }, { id: '4plus', label: '4:00 or longer' },
];
export function readFastStartSelection(search: string, start: Pick<FastStartStart, 'cities' | 'bands'>): FastStartSelection {
  const p = new URLSearchParams(search), city = p.get('race') === 'NYC' ? 'New York' : p.get('race');
  // Existing shared profile links carry an earlier time in minutes. Its band is
  // the only time-based filter here; a target/current finish never selects rows.
  const previous = Number(p.get('previous'));
  const mode: FastStartMode = p.has('comparison') ? p.get('comparison') === 'history' ? 'history' : 'all'
    : p.has('prior') && PRIOR_OPTIONS.some(row => row.id === p.get('prior')) || p.has('previous') && Number.isFinite(previous) && previous >= 90 && previous <= 720 ? 'history' : 'all';
  const prior = p.has('prior') ? p.get('prior') : p.has('previous') && Number.isFinite(previous) && previous >= 90 && previous <= 720
    ? previous < 180 ? 'under3' : previous < 210 ? '3to330' : previous < 240 ? '330to4' : '4plus' : 'all';
  return { mode, city: start.cities.includes(city || '') ? city! : 'All courses',
    age: AGE_OPTIONS.includes(p.get('age') || '') ? p.get('age')! : 'all',
    gender: ['Men', 'Women'].includes(p.get('gender') || '') ? p.get('gender')! : 'all',
    prior: mode === 'history' && PRIOR_OPTIONS.some(row => row.id === prior) ? prior! : 'all',
    band: start.bands.some(row => row.id === p.get('opening')) ? p.get('opening')! : 'fast10' };
}
export function fastStartSearch(selection: FastStartSelection): string {
  return '?' + new URLSearchParams({ comparison: selection.mode, race: selection.city, age: selection.age, gender: selection.gender, prior: selection.mode === 'history' ? selection.prior : 'all', opening: selection.band }).toString();
}
export function fastStartRow(rows: FastStartRow[], selection: FastStartSelection): FastStartRow | undefined {
  return rows.find(row => row.city === selection.city && row.age === selection.age && row.gender === selection.gender && row.prior === selection.prior);
}
export function timeChange(seconds: number): string {
  if (Math.abs(seconds) < 3) return 'About the same time';
  return `${(Math.abs(seconds) / 60).toLocaleString('en-US', { maximumFractionDigits: 1 })} min ${seconds < 0 ? 'faster' : 'slower'}`;
}
export function referenceTimeDifference(seconds: number): string {
  if (Math.abs(seconds) < 3) return 'About the same time';
  return `${(Math.abs(seconds) / 60).toLocaleString('en-US', { maximumFractionDigits: 1 })} min ${seconds < 0 ? 'less' : 'more'}`;
}
export function fastStartCharts(row: FastStartRow, focus: FastStartGroup, bands: FastStartStart['bands'], mode: FastStartMode = 'history'): { pace: ChartSpec; finishes: ChartSpec; accounting: ChartSpec; onset: ChartSpec | null } {
  const name = (id: string) => bands.find(b => b.id === id)?.label || id;
  const steady = row.groups.find(g => g.band === 'steady');
  const comparison = focus.band === 'steady' ? undefined : steady;
  const all = mode === 'all';
  return {
    pace: { title: 'How the pace changed through the race', kind: 'line', unit: '% pace', xLabel: 'Section end (km)', xNumeric: true, sectionEnds: MARATHON_SECTION_ENDS,
      series: [{ key: 'value', label: name(focus.band) }, ...(comparison ? [{ key: 'steady', label: name('steady') }] : [])],
      rows: MARATHON_SECTION_ENDS.map((end, i) => ({ label: end, value: focus.pace_pct[i], n_value: focus.n, ...(comparison ? { steady: comparison.pace_pct[i], n_steady: comparison.n } : {}) })),
      note: (all ? 'Median section pace relative to each finish’s 5–20 km pace. ' : 'Median section pace relative to each runner’s earlier-best average pace. ') + 'Below zero is faster; above zero is slower. These are different groups, not the same people trying two strategies. Lines connect section summaries; they do not locate changes within a section.' },
    finishes: { title: all ? 'Time after 20 km relative to the early-race pace' : 'Finish time relative to the earlier best', unit: 'min', xLabel: 'Opening group',
      series: [{ key: 'p10', label: '10th percentile' }, { key: 'median', label: 'Median' }, { key: 'p90', label: '90th percentile' }],
      rows: row.groups.map(g => ({ label: name(g.band), p10: (all ? g.after20_delta_p10_s! : g.finish_delta_p10_s) / 60, median: (all ? g.after20_delta_median_s! : g.finish_delta_median_s) / 60, p90: (all ? g.after20_delta_p90_s! : g.finish_delta_p90_s) / 60, n_p10: g.n, n_median: g.n, n_p90: g.n })),
      note: 'All available opening groups for your filters. ' + (all ? 'Positive minutes mean more time after 20 km than covering that distance at the same race’s 5–20 km pace. This reference is a calculation, not a predicted finish or avoidable time loss. ' : 'Negative minutes mean a faster finish. ') + 'The range covers the middle 80% of observed differences; it is not a prediction or a confidence interval.' },
    accounting: { title: 'The early minutes and what followed', unit: 'min', xLabel: 'Part of the race', series: [{ key: 'value', label: 'Mean time difference' }],
      rows: [{ label: all ? 'Opening 5 km' : 'Opening 10 km', value: focus.opening_delta_mean_s / 60, n_value: focus.n }, { label: all ? 'After 20 km' : 'After 10 km', value: focus.remainder_delta_mean_s / 60, n_value: focus.n }, { label: 'Whole-race change', value: focus.finish_delta_mean_s / 60, n_value: focus.n }],
      note: (all ? 'Compare recorded times with covering each distance at the same race’s 5–20 km pace. The 5–20 km block sets the reference, so contributes zero by definition. ' : 'Compare recorded times with covering each distance at the earlier best’s average pace. ') + 'Negative means less time; positive means more. The first two averages add up to the whole-race average. This is time accounting, not minutes caused or lost by starting fast. The mean can differ from the median shown above.' },
    onset: focus.onset ? { title: 'Where sustained slowing first appeared', unit: '%', xLabel: 'First qualifying section', series: [{ key: 'value', label: 'Share of detected slowdowns' }],
      rows: focus.onset.map((n, i) => ({ label: `${20 + i * 5}–${25 + i * 5} km`, value: 100 * n / focus.slowdown_n, n_value: focus.slowdown_n, episodes: n })),
      note: 'Among finishes in this starting group with a detected sustained slowdown only. Each bar locates the first qualifying recorded section, not an exact moment. Finishes without a detected episode are excluded from this chart.' } : null,
  };
}

let cache: { sha256: string; evidence: FastStartEvidence } | null = null;
export async function loadFastStartEvidence(start: FastStartStart, signal: AbortSignal): Promise<FastStartEvidence> {
  if (cache?.sha256 === start.sha256) return cache.evidence;
  const response = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/fast-start/' + (start.mode === 'all' ? 'all-finishers.json' : 'evidence.json') + '?v=' + start.sha256, { signal });
  if (!response.ok) throw new Error('The starting-pace data could not load. Please try again.');
  const bytes = await response.arrayBuffer();
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha !== start.sha256 || bytes.byteLength !== start.bytes) throw new Error('The starting-pace data changed. Reload the page to use the current comparison.');
  const data = JSON.parse(new TextDecoder().decode(bytes)) as FastStartEvidence;
  if (data.schema_version !== 1 || data.release_tag !== release.tag || data.as_of !== start.as_of || !Array.isArray(data.rows)) throw new Error('The starting-pace data could not be verified. Please reload.');
  if ((start.mode === 'all' ? data.mode !== 'all-finishers' || data.analysis_n !== start.analysis_n : data.mode !== undefined || data.history_n !== start.analysis_n)) throw new Error('The comparison mode could not be verified. Please reload.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  cache = { sha256: start.sha256, evidence: data }; return data;
}
