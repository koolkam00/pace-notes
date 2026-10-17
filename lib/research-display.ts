import type { ChartSpec, ResearchAnswer } from './research-data';

/**
 * Insights only (owner decision, October 16, 2026): a research answer on a page states what the data found. The
 * stored answers in the current release also carry definitions, sample notes and limits; those sentences are left
 * off the page and listed with the question's method on /methodology#question-methods instead. The stored data is
 * unchanged: this only chooses which of its sentences a page shows.
 */

/** Sentences that explain a method, a sample rule or a limit rather than state a finding. */
const METHOD_SENTENCES: RegExp[] = [
  /^A qualifying patch was /,
  /^The full-course profile also shows /,
  /\bnot a recommendation to\b/,
  /^These groups were not otherwise matched\b/,
  /\bnot proof that\b/,
  /^The popularity of a successful pattern\b/,
  /\bnot confidence intervals\b/,
  /\bexploratory alignment\b|\broute proxy\b/,
  /\bnot a personal equivalent-time forecast\b/,
  /\bnot a course ranking\b/,
  /\bdoes not isolate\b|\bcannot isolate\b/,
  /\bnot a measured temperature penalty\b/,
  /^A race-wide shortfall and an individual shortfall\b/,
  /^This identifies how\b/,
  /\bdoes not by itself establish\b/,
  /\bsample requirements\b/,
  /\bcannot establish\b/,
  /^These checkpoints select different runners\b/,
  /\bdoes not prove\b/,
  /\bdo not identify the cause\b|\bdescribe different aspects\b/,
  /\bcannot tell us\b/,
  /^This measures recorded return\b/,
  /\bcan affect this comparison\b/,
  /\bdo not identify an optimal\b/,
  /\bare not separated\b/,
  /\bprovide two different comparisons\b/,
  /\bchanges how many finishes qualify\b/,
];

/** Wording inside a kept sentence that names a definition or the analysed cohort rather than the finding. */
const REWORDINGS: [RegExp, string][] = [
  [/ under this definition(?=:)/, ''],
  [/\bof eligible finishes\b/g, 'of finishes'],
  [/\bAcross (\d+) eligible editions\b/g, 'Across $1 editions'],
  [/^Sections marked uphill, downhill or near level in the supplied course profiles have different observed pacing patterns\./, 'Uphill, downhill and near-level sections had different pacing patterns.'],
  [/^Among those close finishes, /, 'Among finishes close to the faster standard, '],
  // "After matching race edition, recorded gender and prior-time band, faster-opening runners…": the groups, not how.
  [/^After matching [^;:.]+, (?=[a-z])/, 'In matched groups, '],
  [/\bsupplied (?=[\d.]+ of those minutes)/, 'accounted for '],
  // The patch's definition is on /methodology; the page names it as its question does.
  [/\bfirst qualifying patch\b/g, 'first bad patch'],
  // How the mean was balanced, or what the zero line is: method, kept with the question on /methodology.
  [/ after equally weighting the two race orders(?=\.)/, ''],
  [/ relative to their own average(?=\.)/, ''],
];

/** The page's empty state for a question with no calculated answer; why it has none is on /methodology. */
export const NO_ANSWER = 'This question has no answer yet.';
/** Questions that ask whether something is available ("Are race-day weather forecasts available?") say "Not available yet." */
const AVAILABILITY_QUESTIONS = new Set(['p3_race_week_weather', 'p4_even_effort_gap']);
export const NOT_AVAILABLE = 'Not available yet.';
export const noAnswer = (id: string) => (AVAILABILITY_QUESTIONS.has(id) ? NOT_AVAILABLE : NO_ANSWER);

const sentences = (text: string) => text.trim().replace(/([.!?])\s+(?=[A-Z0-9“"(\-−])/g, '$1\u0000').split('\u0000').filter(Boolean);
const pct = (value: number) => `${value.toFixed(1)}%`;
const count = (value: number) => value.toLocaleString('en-US');
const rowsOf = (chart: ChartSpec | undefined, key = 'value') => (chart?.rows || [])
  .map((row) => ({ ...row, label: row.label, v: Number(row[key]) })).filter((row) => Number.isFinite(row.v));

/**
 * Answers whose stored text only says what the chart compares or defines: the finding, read from the chart rows on
 * the page, so it always matches them. Returns '' when the rows cannot support a sentence.
 */
function chartFinding(question: Pick<ResearchAnswer, 'id' | 'charts'>): string {
  const [first, second] = question.charts;
  if (question.id === 'smyth_htw') {
    const rows = rowsOf(first);
    if (rows.length < 2) return '';
    const low = rows.reduce((a, b) => (b.v < a.v ? b : a)), high = rows.reduce((a, b) => (b.v > a.v ? b : a));
    return `By course, the share ranged from ${pct(low.v)} in ${low.label} to ${pct(high.v)} in ${high.label}.`;
  }
  if (question.id === 'wall-timing') {
    const rows = rowsOf(first).map((row) => ({ ...row, km: Number(row.label) })).filter((row) => Number.isFinite(row.km));
    if (rows.length < 2) return '';
    const top = rows.reduce((a, b) => (b.v > a.v ? b : a)), earliest = rows.reduce((a, b) => (b.km < a.km ? b : a));
    const section = (km: number) => `${km}–${km + 5} km`;
    return `The most common start was the ${section(top.km)} section, with ${pct(top.v)} of sustained slowdowns.${earliest !== top ? ` ${pct(earliest.v)} began as early as ${section(earliest.km)}.` : ''}`;
  }
  if (question.id === 'rn1_wall_severity') {
    const rows = rowsOf(first);
    if (rows.length < 2) return '';
    const low = rows[0], high = rows[rows.length - 1];
    return `From 20 km to the finish, average slowing was ${String(low.label).toLowerCase()} in ${pct(low.v)} of finishes and ${String(high.label).toLowerCase()} in ${pct(high.v)}.`;
  }
  if (question.id === 'rn4_reference_dependence') {
    const rows = (first?.rows || []).filter((row) => Number.isFinite(Number(row.before)) && Number.isFinite(Number(row.after)));
    if (!rows.length) return '';
    const pairs = rows.map((row) => `${count(Number(row.before))} against ${count(Number(row.after))} at ${row.label}`);
    const list = pairs.length > 1 ? `${pairs.slice(0, -1).join(', ')} and ${pairs[pairs.length - 1]}` : pairs[0];
    return rows.every((row) => Number(row.before) > Number(row.after))
      ? `More finishes came in the minute before each milestone than in the minute after: ${list}.`
      : `Finishes in the minute before and the minute after each milestone: ${list}.`;
  }
  if (question.id === 'age') {
    const range = (gender: string) => {
      const values = (first?.rows || []).filter((row) => row.gender === gender).map((row) => Number(row.value)).filter(Number.isFinite);
      return values.length ? `${pct(Math.min(...values))} to ${pct(Math.max(...values))}` : '';
    };
    const men = range('Men'), women = range('Women');
    return men && women ? `Across age groups, ${men} of men’s finishes had a sustained slowdown, against ${women} of women’s.` : '';
  }
  if (question.id === 'history') {
    const bests = rowsOf(first);
    const years = rowsOf(second).map((row) => ({ ...row, year: Number(row.label) }));
    const parts: string[] = [];
    if (bests.length >= 2) {
      const a = bests[0], b = bests[bests.length - 1];
      parts.push(`Finishes with an earlier recorded best ${String(a.label).toLowerCase()} had a sustained slowdown ${pct(a.v)} of the time, against ${pct(b.v)} for ${String(b.label).toLowerCase()}.`);
    }
    const best = years.find((row) => row.year === 0), next = years.find((row) => row.year === 1);
    if (best && next) parts.push(`In the year of a recorded best the share was ${pct(best.v)}; a year later it was ${pct(next.v)}.`);
    return parts.join(' ');
  }
  return '';
}

/** What a page shows for a research answer, and the sentences it leaves to /methodology. */
export function splitAnswer(question: Pick<ResearchAnswer, 'id' | 'answer' | 'available' | 'charts'>, keepStored = true): { shown: string; moved: string[] } {
  if (!question.available) return { shown: noAnswer(question.id), moved: sentences(question.answer) };
  const finding = chartFinding(question);
  if (finding) return { shown: finding, moved: sentences(question.answer) };
  const shown: string[] = [], moved: string[] = [];
  for (const sentence of sentences(question.answer)) {
    if (METHOD_SENTENCES.some((pattern) => pattern.test(sentence))) { moved.push(sentence); continue; }
    shown.push(REWORDINGS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), sentence));
  }
  // With no finding sentence, a question page keeps the stored text rather than an empty answer (keepStored).
  if (shown.length) return { shown: shown.join(' '), moved };
  return keepStored ? { shown: question.answer, moved: [] } : { shown: '', moved };
}

/** The answer a page shows: findings only. */
export const insightAnswer = (question: Pick<ResearchAnswer, 'id' | 'answer' | 'available' | 'charts'>) => splitAnswer(question).shown;

/** "Observed pace alongside supplied terrain classes" → "Observed pace alongside terrain classes": chart wording names the finding, not the data source. */
const chartWords = (text: string) => (CHART_TITLES[text] ?? text).replace(/\b(S|s)upplied (\w)/g, (_m, s: string, next: string) => (s === 'S' ? next.toUpperCase() : next));
/** Stored chart titles that name the detection rule ("qualifying section") rather than what the chart shows. */
const CHART_TITLES: Record<string, string> = { 'First qualifying section starts at': 'Where sustained slowdowns began' };

/** A stored chart with its title, axis, series and filter labels in insight wording; its rows are unchanged. */
export function displayChart(spec: ChartSpec): ChartSpec {
  // Most charts need no change: keep the same object so the chart's memoized rows stay put.
  if (!/supplied|qualifying section/i.test(JSON.stringify([spec.title, spec.xLabel, spec.series, spec.filters ?? []]))) return spec;
  return {
    ...spec, title: chartWords(spec.title), xLabel: chartWords(spec.xLabel),
    series: spec.series.map((series) => ({ ...series, label: chartWords(series.label) })),
    filters: spec.filters?.map((filter) => ({ ...filter, label: chartWords(filter.label) })),
  };
}

/**
 * A research answer as a page shows it: the findings answer and the reworded charts, prepared on the server. Only the
 * fields ResearchQuestion renders are passed, so the page's data carries neither the stored method, detail, source
 * and sample fields, the chart notes, nor this file. ResearchQuestion takes only this type.
 */
export type PageAnswer = Pick<ResearchAnswer, 'id' | 'number' | 'title' | 'aliases' | 'answer' | 'available' | 'charts' | 'related'> & { readonly forPage: true };
export const forPage = (question: ResearchAnswer): PageAnswer => ({
  id: question.id, number: question.number, title: question.title, aliases: question.aliases,
  answer: insightAnswer(question), available: question.available, related: question.related,
  // QuestionViz draws no chart note; it is left out of the page's data with the method fields.
  charts: question.charts.map((spec) => { const shown = { ...displayChart(spec) }; delete shown.note; return shown; }),
  forPage: true,
});
