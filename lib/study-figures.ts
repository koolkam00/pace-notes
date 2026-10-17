import { getStudyEvidence, type ChartSpec } from './research-data';
import { splitAnswer } from './research-display';

export type StudyFigureData = {
  id: string; title: string; answer: string; method: string[]; charts: ChartSpec[];
  sources: { href: string; label: string }[];
  releaseTag: string;
};

/** Every visible supporting figure is recalculated from the same pinned export. */
export function getStudyFigures(): StudyFigureData[] {
  const study = getStudyEvidence();
  if (!study) return [];
  return study.figures.filter(figure => figure.charts.some(chart => chart.rows.length)).map(figure => ({
    ...figure, releaseTag: study.release_tag,
    sources: [{ href: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data/study/evidence.json`, label: 'Current figure data, methods and source checksums' }],
  }));
}

/**
 * The figures /slowdown shows, findings only. The definition-sensitivity figure checks the method rather than
 * reporting a finding, so it is on /methodology#definition-sensitivity instead; each answer is read from its chart rows.
 */
export function getSlowdownFigures(): StudyFigureData[] {
  return getStudyFigures().filter(figure => figure.id !== 'sensitivity').map(figure => {
    // A figure whose stored answer is all method shows its chart without one.
    return { ...figure, answer: splitAnswer({ id: figure.id, answer: figure.answer, available: true, charts: figure.charts }, false).shown };
  });
}
