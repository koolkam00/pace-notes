import StudyFigure from '@/components/StudyFigure';
import { getStudyFigures } from '@/lib/study-figures';
import ResearchQuestion from '@/components/ResearchQuestion';
import { UnitText } from '@/components/UnitsProvider';
import { getStudyAnswer, getStudyEvidence, getWallTimingAnswer } from '@/lib/research-data';
import { SLOWDOWN_CITATION } from '@/lib/tools/splits';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  const study = getStudyEvidence();
  const share = study && Number.isFinite(study.rate) ? ` (${study.rate.toFixed(1)}% of eligible finishes)` : '';
  const describe = (detail: string) => `How often recorded marathon finishes had a sustained slowdown${detail}, where episodes began, and patterns by age and earlier results.`;
  return pageMetadata({
    title: 'Sustained Slowdown in the Marathon | Pace Notes',
    description: describe(share).length <= 155 ? describe(share) : describe(''),
    path: '/slowdown',
  });
}

export default function Page() {
  const figures = getStudyFigures();
  const study = getStudyAnswer();
  // The definition is the first sentence of the study's own method text, shown in the reader's units.
  const method = study.method[0];
  const firstStop = method ? /\.\s/.exec(method) : null;
  const definition = method && firstStop ? method.slice(0, firstStop.index + 1) : method;
  return <>
    <header className="directory-heading">
      <p className="eyebrow">Late-race slowing</p>
      <h1>Understanding sustained slowdown.</h1>
      <p>Explore one form of late-race slowing, recalculated from the same data release as the rest of the study. {definition ? <>A <strong>sustained slowdown</strong> means running <UnitText>{definition.charAt(0).toLowerCase() + definition.slice(1)}</UnitText> </> : null}The definition follows the <a href={SLOWDOWN_CITATION.url}>{SLOWDOWN_CITATION.label.charAt(0).toLowerCase() + SLOWDOWN_CITATION.label.slice(1)}</a>.</p>
    </header>
    <ResearchQuestion question={study} />
    <ResearchQuestion question={getWallTimingAnswer()} />
    {figures.length ? figures.map(figure => <StudyFigure key={figure.id} figure={figure} />) : <p>Supporting figures are not available for the current release.</p>}
  </>;
}
