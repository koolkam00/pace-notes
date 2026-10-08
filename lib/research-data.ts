import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, type DataRow } from './csv';
import { QUESTIONS, EXTRA_TITLES, questionForPack, type QuestionDefinition, type ThemeId } from './question-catalog';
import { ANALYSIS_PLANS, type AnalysisPlan } from './analysis-plans';
import { extensionForQuestion, extensionForPack } from './extension-data';
import release from '../analysis/release.json';

export type ChartSpec = {
  title: string;
  unit: string;
  xLabel: string;
  kind?: 'bars' | 'line';
  xNumeric?: boolean;
  xUnit?: string;
  sectionEnds?: number[];
  band?: { lower: string; upper: string };
  rows: DataRow[];
  series: { key: string; label: string }[];
  filters?: { key: string; label: string; preferred?: string }[];
  note?: string;
  source?: string;
};
export type ResearchAnswer = {
  id: string; number?: number; title: string; aliases: string[]; theme?: ThemeId;
  answer: string; detail?: string; method: string[]; charts: ChartSpec[];
  sources: { href: string; label: string }[]; published: string | null;
  available: boolean; related?: { href: string; label: string }[]; nextAnalysis?: AnalysisPlan;
  dataset?: { n: number; exportId: string; asOf: string; unit?: string; scope?: string };
};

type StudyResult = Pick<ResearchAnswer, 'title' | 'answer' | 'detail' | 'method' | 'charts' | 'available'>;
export type CurrentStudy = {
  schema_version: number; release_tag: string; input_as_of: string; as_of: string;
  n: number; detected: number; rate: number;
  cohort: Record<string, number>;
  overview: StudyResult; timing: StudyResult; severity: StudyResult; landmarks: StudyResult;
  figures: { id: string; title: string; answer: string; method: string[]; charts: ChartSpec[] }[];
};

const root = path.join(process.cwd(), 'public', 'data');
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const studySource = `${basePath}/data/study/evidence.json`;
export function readJson(file: string): any | null {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
  catch { return null; }
}

/** Legacy pack files remain in Git history, never a fallback for current results. */
export function table(pack: string, name: string): DataRow[] {
  if (!pack.startsWith('ext_')) return [];
  const meta = readJson(`packs/${pack}/pack_meta.json`);
  if (!['ready', 'ok'].includes(meta?.status)) return [];
  if (meta.input_export_id !== release.tag.replace('private-export-', 'private-')) throw new Error(`Stale analysis pack: ${pack}`);
  try { return parseCsv(fs.readFileSync(path.join(root, 'packs', pack, 'tables', name), 'utf8')); }
  catch { return []; }
}

export function getStudyEvidence(): CurrentStudy | null {
  const study = readJson('study/evidence.json');
  if (!study) return null;
  if (study.schema_version !== 1 || study.release_tag !== release.tag || !Number.isInteger(study.n)
    || study.n !== study.cohort?.eligible || !Array.isArray(study.figures)) {
    throw new Error('The supporting study must match the current release and eligible cohort');
  }
  return study;
}

/** Compatibility API backed only by the current calculation, not historical live.json. */
export function getLive() {
  const study = getStudyEvidence();
  if (!study) return null;
  return { ...study, status: 'ready', corpus: { n_records: study.n, n_cities: study.overview.charts[0]?.rows.length || 0 } };
}
export function liveRows(name: string): DataRow[] {
  const study = getStudyEvidence();
  if (!study) return [];
  if (name === 't1') return (study.overview.charts[0]?.rows || []).map(row => ({
    city: row.label, n_records: row.n_value, pct_htw: row.value,
  }));
  return [];
}

const labels: Record<string, string> = {
  F: 'Women', M: 'Men', ALL: 'All runners', sub3: 'Under 3 hours', sub330: 'Under 3:30', sub4: 'Under 4 hours',
  sub430: 'Under 4:30', sub5: 'Under 5 hours', True: 'Recovered', False: 'Did not recover',
  collapse: 'Major fade', even: 'Even pace', modest_fade: 'Modest fade', negative_split: 'Faster second half', recover: 'Fade then recovery',
  fast20: 'Faster 20 km group', mid20: 'Middle 20 km group', slow20: 'Slower 20 km group',
  accel: 'Accelerating', steady: 'Steady', decel: 'Slowing', Q1_low: 'Smallest kick', Q2: 'Second quarter', Q3: 'Third quarter', Q4_high: 'Largest kick',
  cool: 'Below 10°C', mild: '10 to <15°C', warm: '15 to <21°C', hot: '21°C or warmer',
  none: 'Below 10%', moderate: '25 to <40%', severe: '40% or more',
  slipped: 'Missed the goal', hit: 'Made the goal', top_decile_kick: 'Largest 10% of finishing kicks', rest: 'Other runners',
};
export const readableLabel = (value: unknown) => labels[String(value)] || String(value ?? 'Not recorded').replace(/_/g, ' ');

function unavailable(id: string, title: string, answer: string, method: string[] = []): ResearchAnswer {
  return { id, title, aliases: [], answer, method, charts: [], available: false, published: null,
    sources: [{ href: `https://github.com/${release.repository}/releases/tag/${release.tag}`, label: 'Current source release' }] };
}

function studyAnswer(id: string, key: 'overview' | 'timing' | 'severity' | 'landmarks', title: string): ResearchAnswer {
  const study = getStudyEvidence();
  if (!study) return unavailable(id, title, 'This result is not available for the current release.');
  const value = study[key];
  return { id, aliases: [], ...value, title, published: study.as_of,
    dataset: { n: key === 'timing' ? study.detected : study.n, exportId: study.release_tag, asOf: study.input_as_of,
      unit: key === 'timing' ? 'finishes with sustained slowdown' : 'eligible finishes', scope: 'descriptive' },
    sources: [{ href: studySource, label: 'Current study results, methods and source checksums (JSON)' }] };
}

export function getCoursePacingChart(city?: string): ChartSpec {
  const chart = extensionForQuestion('s3_course_breaks')?.answer.charts[0];
  if (!chart) return { title: 'Pace through the full course', unit: '% pace', xLabel: 'Section end (km)', rows: [], series: [{ key: 'value', label: 'Pace relative to the runner’s own marathon average' }] };
  return { ...chart, rows: city ? chart.rows.filter(row => row.city === city) : chart.rows,
    filters: city ? undefined : chart.filters };
}

export function getStudyAnswer(): ResearchAnswer {
  const result = studyAnswer('smyth_htw', 'overview', EXTRA_TITLES.smyth_htw);
  result.sources.push({ href: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0251513', label: 'Published slowdown method (2021)' });
  return result;
}

export function getWallTimingAnswer(): ResearchAnswer {
  return studyAnswer('wall-timing', 'timing', 'When do sustained slowdown episodes begin?');
}

export function getResearchAnswer(def: QuestionDefinition): ResearchAnswer {
  const extension = extensionForQuestion(def.id);
  if (extension) {
    if (extension.exportId !== release.tag.replace('private-export-', 'private-')) throw new Error(`Stale research result: ${def.id}`);
    return { id: def.id, number: def.number, title: def.title, theme: def.theme, aliases: def.aliases || [], ...extension.answer };
  }
  const group = def.id === 'r16_groups_hold_or_fall';
  const congestion = def.id === 'r33_start_congestion';
  const result = unavailable(def.id, def.title,
    group ? 'The current release cannot establish who was physically running together.'
      : congestion ? 'The current release cannot separate a crowded start from deliberate restraint.'
        : 'This analysis has not been calculated from the current release.',
    group ? ['Chip elapsed times do not establish physical proximity when runners start in different waves. Absolute checkpoint times and individual start offsets are needed to compare group continuity and race outcomes.']
      : congestion ? ['A slow first section alone does not establish congestion. Start waves, corrals, clock times and comparable earlier performance are needed.']
        : ['Historical results are not substituted for missing current calculations.']);
  return { ...result, number: def.number, theme: def.theme, aliases: def.aliases || [], nextAnalysis: ANALYSIS_PLANS[def.id] };
}

export function getQuestions() { return QUESTIONS.map(getResearchAnswer); }

/** Supporting packs whose page now shows the current answer of another question (also read by lib/seo-routes.ts). */
export const PACK_REPLACEMENTS: Readonly<Record<string, string>> = { rn3_heat_curves: 'r15_weather_penalty_who', p1_pace_band_planner: 'r10_unravel_typology', p2_halfway_calculator: 'r08_early_blowup_signal' };

export function getExtraAnswer(id: string): ResearchAnswer {
  const extension = extensionForPack(id);
  if (extension) {
    if (extension.exportId !== release.tag.replace('private-export-', 'private-')) throw new Error(`Stale research result: ${id}`);
    // The catalog holds the current wording of each question; a pack_meta title can predate it, so it is only a fallback.
    return { id, title: questionForPack(extension.questionId)?.title ?? extension.title, aliases: [], ...extension.answer };
  }
  if (id === 'smyth_htw') return getStudyAnswer();
  const canonical = questionForPack(id);
  if (canonical) return getResearchAnswer(canonical);
  if (id === 'rn1_wall_severity') return studyAnswer(id, 'severity', EXTRA_TITLES[id]);
  if (id === 'rn4_reference_dependence') return studyAnswer(id, 'landmarks', EXTRA_TITLES[id]);
  const replacement = PACK_REPLACEMENTS[id];
  if (replacement) {
    const answer = getResearchAnswer(QUESTIONS.find(question => question.id === replacement)!);
    const related = id === 'p1_pace_band_planner' ? [{ href: '/analyses/pacing-pattern', label: 'Choose a course, age group and finish-time group' }]
      : id === 'p2_halfway_calculator' ? [{ href: '/analyses/checkpoint', label: 'Explore a checkpoint comparison' }] : answer.related;
    return { ...answer, id, number: undefined, aliases: [], related,
      detail: id === 'p1_pace_band_planner' ? 'This overview describes the current eligible field. Open the pacing-pattern analysis to choose comparable finishers. It does not prescribe an optimal strategy.'
        : id === 'p2_halfway_calculator' ? 'This page shows the current checkpoint model’s held-out validation. Use the interactive checkpoint comparison for a selected course and elapsed time; 20 km is before halfway.' : answer.detail };
  }
  if (id === 'p4_even_effort_gap') return { ...unavailable(id, EXTRA_TITLES[id],
    'A validated course-adjusted pacing estimate is not available from the current release.',
    ['Historical course validity ranges are missing. The supplied city route can support an explicitly labeled terrain proxy, but it cannot establish a runner’s physiological effort or how much time hills caused.']),
    related: [{ href: '/packs/r11_course_section_traps', label: 'Current terrain and pacing comparison' }] };
  if (id === 'p3_race_week_weather') return { ...unavailable(id, EXTRA_TITLES[id],
    'This database contains historical race weather, not live race-day forecasts.',
    ['Recorded or modeled weather from past editions must not be presented as a forecast for an upcoming race.']),
    related: [{ href: '/packs/r15_weather_penalty_who', label: 'Explore historical weather and pacing' }] };
  return unavailable(id, EXTRA_TITLES[id] || 'Research analysis', 'This result is not available for the current release.');
}
