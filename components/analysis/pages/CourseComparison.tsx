import Receipt from '@/components/ui/Receipt';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getNugget } from '@/lib/nuggets';
import { comparableCourses, courseName } from '@/lib/nuggets/analyses';
import { pct } from '@/lib/nuggets/format';

const PATH = '/analyses/course-comparison';

/** Chapter 08, page 2: the spread of sustained slowdown across courses, its two ends, then Make it yours. */
export default function CourseComparison() {
  const definition = analysisBySlug('course-comparison')!;
  const { summary, answers } = getAnalysisStart();
  const start = getAllFinisherContextStart('courses');
  const n = getNugget('courses.compare');
  const list = comparableCourses(start.initial.courses);
  const lo = list.reduce((a, b) => (b.slowdown_pct < a.slowdown_pct ? b : a), list[0]);
  const hi = list.reduce((a, b) => (b.slowdown_pct > a.slowdown_pct ? b : a), list[0]);
  const ratio = hi && lo ? hi.slowdown_pct / lo.slowdown_pct : NaN;
  const answer = lo && hi ? (
    <Receipt kicker="Sustained slowdown, course by course"
      lines={[
        { label: 'The lowest', key: courseName(lo.label), value: pct(lo.slowdown_pct / 100) },
        { label: 'The highest', key: courseName(hi.label), value: pct(hi.slowdown_pct / 100) },
      ]}
      result={{ label: 'The high end against the low', value: `${ratio.toFixed(1)}×`, sr: `${ratio.toFixed(1)} times`, fallback: n.guard ? undefined : `${pct(lo.slowdown_pct / 100)} to ${pct(hi.slowdown_pct / 100)}` }} />
  ) : null;
  const historyDefinition = { ...definition, dek: 'See how finish times compared with the same runners’ earlier bests, course by course.' };
  return (
    <AnalysisShell path={PATH} title={n} titleTerm dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AllFinisherAnalysis kind="courses" start={start} linkTerm={false}
          history={<AnalysisExplorer definition={historyDefinition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} historyMode />} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
