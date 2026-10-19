import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ExplorerChart from '../ExplorerChart';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm, pct } from '@/lib/nuggets/format';
import ByUnits from '@/components/ui/ByUnits.client';
import { MARATHON_KM, distance, type UnitSystem } from '@/lib/units';

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
  const after = (u: UnitSystem) => `After 20K is the last ${distance(MARATHON_KM - 20, u)}, ${pct((MARATHON_KM - 20) / MARATHON_KM)} of the distance.`;
  const answer = initialAnswer.charts.length ? (
    // The two groups are named in the kicker, above the chart: a context line never sits under Values.
    <AnswerCard kicker={`Finishes ${hm(goal - 5)}–${hm(goal)} against ${hm(goal)}–${hm(goal + 5)}`}>
      <ExplorerChart id="sections" answer={initialAnswer} goal={goal} units="mi" valuesId="wt-answer" example />
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} answer={answer}
      // The share's base: after 20K is a little over half the race, so the H1's share is read against it (the guard holds
      // the share above it). The two groups are the card's kicker and the gap its total bar.
      dek={n.guard ? <ByUnits mi={after('mi')} km={after('km')} /> : definition.title}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={initialAnswer} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
