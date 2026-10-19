import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ExplorerChart from '../ExplorerChart';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';

const PATH = '/analyses/finish-time-context';

/**
 * Chapter 06, page 2: the share of finishes under each time as one cumulative curve, the H1's mark (3:00, the fastest 5%)
 * ringed by name and the readout opening on it (the H1's accent), then Make it yours, which draws its own curve only once
 * the visitor changes something. The share under 4:00 is chapter 01's finding, so the card does not open on it.
 */
export default function FinishContext() {
  const definition = analysisBySlug('finish-time-context')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('target.context');
  // The mark the H1 names (the lowest of its three half-hours): the curve's ring and the readout's first reading.
  const mark = Number(n.guard ? n.values.mark3_min : n.values.goal_min);
  const initialAnswer = answers.find((a) => a.id === definition.id)!;
  const answer = initialAnswer.charts.length ? (
    <AnswerCard kicker="Every finish, every course">
      <ExplorerChart id="ambition" answer={initialAnswer} goal={mark} units="mi" valuesId="ftc-answer" example />
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
