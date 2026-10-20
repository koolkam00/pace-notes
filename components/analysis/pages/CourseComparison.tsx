import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import HeroSwap from '../HeroSwap.client';
import { courseStrip } from '../all-finisher-hero';
import { publishedCourses } from '@/lib/analysis-server';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getNugget } from '@/lib/nuggets';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { howWeKnowOf } from '@/lib/chapters';
import { withHow } from '@/components/ui/Values';

const PATH = '/analyses/course-comparison';
/** The page's methods, at the foot of its All numbers (the closing row is the way back alone). */
const HOW = howWeKnowOf(PATH) ?? undefined;

/**
 * Chapter 08, page 2: the spread of sustained slowdown across courses drawn as one ranked dot strip, its two ends named
 * on their dots (the H1 gives their rates; the readout opens on the high end, the H1's accent), the courses counted in
 * the kicker, then Make it yours, which follows the same high end: a selection redraws this strip (HeroSwap), so the page
 * draws each picture once.
 */
export default function CourseComparison() {
  const definition = analysisBySlug('course-comparison')!;
  const raw = getAllFinisherContextStart('courses');
  const start = { ...raw, cities: publishedCourses(raw.cities) };
  const n = getNugget('courses.compare');
  // The strip and its "All numbers" (all-finisher-hero.tsx): the same drawing a Make it yours selection takes over.
  const parts = courseStrip(start.initial.courses, { id: 'cc-courses' });
  const answer = parts ? (
    <AnswerCard values={<HeroSwap slot="values" how={HOW}>{withHow(parts.values, HOW)}</HeroSwap>}
      explore={<ExploreBeat track="chapter-1" inCard><AllFinisherAnalysis kind="courses" start={start} linkTerm={false} untouched="none" hero /></ExploreBeat>}>
      <HeroSwap kicker={parts.kicker}>{parts.chart}</HeroSwap>
    </AnswerCard>
  ) : null;
  return (
    // The term is linked in the dek, under the H1, never in it (a dotted underline in the display face outweighed the accent).
    <AnalysisShell path={PATH} numbers title={n} answer={answer}
      dek={<>Each course’s share of finishes with a <Link href={n.term ?? '/methodology#sustained-slowdown'} className="term-link">sustained slowdown</Link>, in an average year.</>} />
  );
}
