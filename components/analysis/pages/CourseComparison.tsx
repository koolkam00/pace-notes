import DotStrip from '@/components/viz/DotStrip';
import Values from '@/components/ui/Values';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import { publishedCourses } from '@/lib/analysis-server';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getNugget } from '@/lib/nuggets';
import { comparableCourses, courseName } from '@/lib/nuggets/analyses';
import { count, pct } from '@/lib/nuggets/format';

const PATH = '/analyses/course-comparison';

/**
 * Chapter 08, page 2: the spread of sustained slowdown across courses drawn as one ranked dot strip, its two ends named
 * on their dots (the H1 gives their rates), then Make it yours. The explorer shows its own strip only once the visitor
 * changes something, so the page draws each picture once.
 */
export default function CourseComparison() {
  const definition = analysisBySlug('course-comparison')!;
  const raw = getAllFinisherContextStart('courses');
  const start = { ...raw, cities: publishedCourses(raw.cities) };
  const n = getNugget('courses.compare');
  // Every course with 100 finishes or more; fewer than three editions is drawn hollow and never named an end (the H1's
  // ends are the same comparable courses).
  const shown = start.initial.courses.filter((c) => c.n >= 100 && Number.isFinite(c.slowdown_pct));
  const comparable = new Set(comparableCourses(shown).map((c) => c.id));
  const sorted = [...shown].sort((a, b) => a.slowdown_pct - b.slowdown_pct);
  const v = sorted.map((c) => c.slowdown_pct);
  const lo = Math.floor(Math.min(...v) / 10) * 10, hi = Math.ceil(Math.max(...v) / 10) * 10;
  const ticks = Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10);
  // The high end is the H1's accent: its dot is the signal and the readout opens on it; the low end is named on its dot.
  const high = comparableCourses(shown).reduce<(typeof shown)[number] | undefined>((a, b) => (!a || b.slowdown_pct > a.slowdown_pct ? b : a), undefined);
  const answer = sorted.length >= 2 ? (
    <AnswerCard kicker="Sustained slowdown by course">
      <DotStrip items={sorted.map((c) => ({ id: c.id, label: courseName(c.label), value: c.slowdown_pct, display: pct(c.slowdown_pct / 100), detail: count(c.n), hollow: !comparable.has(c.id), subject: c === high }))}
        domain={[lo, Math.max(...v) > hi - 5 ? hi + 5 : hi]} ticks={ticks.map((t) => ({ value: t, label: `${t}%` }))} readoutKey="Finishes"
        keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
        label={`Sustained slowdown by course, one dot per course, from ${pct(v[0] / 100)} to ${pct(v[v.length - 1] / 100)}; tap a dot to read it`}
        values={<Values id="cc-courses" caption="Sustained slowdown by course" columns={[{ key: 'c', label: 'Course', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'e', label: 'Editions' }, { key: 'n', label: 'Finishes' }]}
          rows={sorted.map((c) => [courseName(c.label), pct(c.slowdown_pct / 100), c.edition_n, count(c.n)])} />} />
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} titleTerm dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AllFinisherAnalysis kind="courses" start={start} linkTerm={false} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
