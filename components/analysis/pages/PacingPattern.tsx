import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ByUnits from '@/components/ui/ByUnits.client';
import ExplorerChart from '../ExplorerChart';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm } from '@/lib/nuggets/format';
import type { UnitSystem } from '@/lib/units';

const PATH = '/analyses/pacing-pattern';

/**
 * Chapter 03, page 2: how finishes near 4:00 ran each 5K, drawn as the median pace with its middle half against even
 * pace (the H1 gives how far fast early and slow late), then Make it yours, which draws its own profile only once the
 * visitor changes something.
 */
export default function PacingPattern() {
  const definition = analysisBySlug('pacing-pattern')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('pattern.profile');
  const goal = Number(n.values.goal_min);
  const initialAnswer = answers.find((a) => a.id === definition.id)!;
  const chart = (u: UnitSystem) => <ExplorerChart id="profile" answer={initialAnswer} goal={goal} units={u} valuesId={`pp-answer-${u}`} />;
  return (
    <AnalysisShell path={PATH} title={n} dek={n.guard ? `Finishes near ${hm(goal)} didn’t run even ${hm(goal)} pace.` : definition.title}
      answer={initialAnswer.charts.length ? <AnswerCard kicker={`Finishes near ${hm(goal)}, 5K by 5K`}><ByUnits mi={chart('mi')} km={chart('km')} /></AnswerCard> : null}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={initialAnswer} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
