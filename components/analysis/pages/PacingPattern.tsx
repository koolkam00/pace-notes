import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ByUnits from '@/components/ui/ByUnits.client';
import { explorerParts } from '../ExplorerChart';
import HeroSwap from '../HeroSwap.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm } from '@/lib/nuggets/format';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import type { UnitSystem } from '@/lib/units';

const PATH = '/analyses/pacing-pattern';

/**
 * Chapter 03, page 2: how finishes near 4:00 ran each 5K, drawn as the median pace with its middle half against even
 * pace (the H1 gives how far fast early and slow late), then Make it yours, whose selection redraws this card (HeroSwap)
 * with the example as a quiet line beside it, never a second chart under the form.
 */
export default function PacingPattern() {
  const definition = analysisBySlug('pacing-pattern')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('pattern.profile');
  const goal = Number(n.values.goal_min);
  const initialAnswer = answers.find((a) => a.id === definition.id)!;
  const parts = (u: UnitSystem) => explorerParts({ id: 'profile', answer: initialAnswer, goal, units: u, valuesId: `pp-answer-${u}`, apart: true });
  const mi = parts('mi'), km = parts('km');
  return (
    // The dek adds what the chart shows: where the finishes fell behind even pace and where they were slowest.
    <AnalysisShell path={PATH} title={n} dek={n.guard ? `They ran slower than even pace from ${MARATHON_SECTION_ENDS[Number(n.values.turn_i) - 1]}K, and slowest at ${sectionLabel(MARATHON_SECTION_ENDS[Number(n.values.slow_i)])}.` : definition.title}
      answer={mi && km ? (
        // Make it yours sits under the card it redraws (round 6).
        <AnswerCard values={<HeroSwap slot="values"><ByUnits mi={mi.values} km={km.values} /></HeroSwap>}
          explore={<ExploreBeat track="chapter-1" inCard><AnalysisExplorer definition={definition} summary={summary} initialAnswer={initialAnswer} untouched="none" hero /></ExploreBeat>}>
          <HeroSwap kicker={`Finishes near ${hm(goal)}, 5K by 5K`}><ByUnits mi={mi.chart} km={km.chart} /></HeroSwap>
        </AnswerCard>
      ) : null} />
  );
}
