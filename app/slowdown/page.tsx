import StudyFigure from '@/components/StudyFigure';
import { getSlowdownFigures } from '@/lib/study-figures';
import ResearchQuestion from '@/components/ResearchQuestion';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getStudyAnswer, getStudyEvidence, getWallTimingAnswer } from '@/lib/research-data';
import { forPage } from '@/lib/research-display';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  const study = getStudyEvidence();
  const share = study && Number.isFinite(study.rate) ? ` (${study.rate.toFixed(1)}% of finishes)` : '';
  const describe = (detail: string) => `How often recorded marathon finishes had a sustained slowdown${detail}, where episodes began, and patterns by age and earlier results.`;
  return pageMetadata({
    title: 'Sustained Slowdown in the Marathon | Pace Notes',
    description: describe(share).length <= 155 ? describe(share) : describe(''),
    path: '/slowdown',
  });
}

export default function Page() {
  // Findings only: the definition-sensitivity check is on /methodology#definition-sensitivity.
  const figures = getSlowdownFigures();
  const study = getStudyAnswer();
  const evidence = getStudyEvidence();
  // The term links to its definition on the methodology page; the dek states the headline finding.
  const term = <Link href="/methodology#sustained-slowdown">sustained slowdown</Link>;
  return <>
    <header className="directory-heading">
      <p className="eyebrow">Late-race slowing</p>
      <h1>Understanding sustained slowdown.</h1>
      <p>{evidence && Number.isFinite(evidence.rate) ? <>Of {evidence.n.toLocaleString('en-US')} finishes, {evidence.detected.toLocaleString('en-US')} ({evidence.rate.toFixed(1)}%) had a {term}.</> : <>How often finishes had a {term}, where it began and who it affected.</>}</p>
    </header>
    <ResearchQuestion question={forPage(study)} />
    <ResearchQuestion question={forPage(getWallTimingAnswer())} />
    {figures.length ? figures.map(figure => <StudyFigure key={figure.id} figure={figure} />) : <p>Supporting figures are not available.</p>}
  </>;
}
