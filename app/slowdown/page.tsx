import StudyFigure from '@/components/StudyFigure';
import { getStudyFigures } from '@/lib/study-figures';
import ResearchQuestion from '@/components/ResearchQuestion';
import { getStudyAnswer, getWallTimingAnswer } from '@/lib/research-data';

export const metadata = {
  title: 'Sustained slowdown | Pace Notes',
  description: 'Explore sustained slowdown thresholds, recorded age, earlier performance, and patterns around recorded bests using the current data release.',
  alternates: { canonical: 'https://htw-live-study.vercel.app/slowdown' },
};

export default function Page() {
  const figures = getStudyFigures();
  return <>
    <header className="directory-heading">
      <p className="eyebrow">Late-race slowing</p>
      <h1>Understanding sustained slowdown.</h1>
      <p>Explore one form of late-race slowing, recalculated from the same data release as the rest of the study.</p>
    </header>
    <ResearchQuestion question={getStudyAnswer()} />
    <ResearchQuestion question={getWallTimingAnswer()} />
    {figures.length ? figures.map(figure => <StudyFigure key={figure.id} figure={figure} />) : <p>Supporting figures are not available for the current release.</p>}
  </>;
}
