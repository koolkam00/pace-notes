import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ExplorerChart from '../ExplorerChart';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm } from '@/lib/nuggets/format';

const PATH = '/analyses/where-time-is-gained';

/**
 * Chapter 05, page 3: finishes just under and just over 4:00, the gap between them built section by section as a
 * waterfall (the H1 gives the total and the share after 20K), then Make it yours, which draws its own waterfall only once
 * the visitor changes something.
 */
export default function WhereTime() {
  const definition = analysisBySlug('where-time-is-gained')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('sections.split');
  const goal = Number(n.values.goal_min);
  const initialAnswer = answers.find((a) => a.id === definition.id)!;
  const answer = initialAnswer.charts.length ? (
    // The two groups are named in the kicker, above the chart: a context line never sits under Values.
    <AnswerCard kicker={`Finishes ${hm(goal - 5)}–${hm(goal)} against ${hm(goal)}–${hm(goal + 5)}`}>
      <ExplorerChart id="sections" answer={initialAnswer} goal={goal} units="mi" valuesId="wt-answer" example />
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={initialAnswer} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
