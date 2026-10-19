import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import { explorerParts } from '../ExplorerChart';
import HeroSwap from '../HeroSwap.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm, pct } from '@/lib/nuggets/format';
import { MARATHON_KM } from '@/lib/units';

const PATH = '/analyses/where-time-is-gained';

/**
 * Chapter 05, page 3: finishes just under and just over 4:00, the gap between them built section by section as a
 * waterfall (the H1 gives the total and the share after 20K), then Make it yours, whose selection redraws this card
 * (HeroSwap), never a second waterfall under the form.
 */
export default function WhereTime() {
  const definition = analysisBySlug('where-time-is-gained')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('sections.split');
  const goal = Number(n.values.goal_min);
  const initialAnswer = answers.find((a) => a.id === definition.id)!;
  // The dek says whose gap the H1 means (critic round 4: the groups were only in the card's kicker), then the share's base.
  const groups = `Finishes ${hm(goal)}–${hm(goal + 5)} against ${hm(goal - 5)}–${hm(goal)}.`;
  // The share's base, as the comparison the H1 invites (critic round 5): after 20K is only about half the distance.
  const after = `${groups} After 20K is just ${pct((MARATHON_KM - 20) / MARATHON_KM)} of the distance.`;
  const parts = explorerParts({ id: 'sections', answer: initialAnswer, goal, units: 'mi', valuesId: 'wt-answer', example: true, apart: true });
  const answer = parts ? (
    // The two groups are the dek's (right under the H1), so the card is the chart alone until a selection names its own.
    <AnswerCard values={<HeroSwap slot="values">{parts.values}</HeroSwap>}>
      <HeroSwap>{parts.chart}</HeroSwap>
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} answer={answer}
      // The share's base: after 20K is a little over half the race, so the H1's share is read against it (the guard holds
      // the share above it). The two groups are the card's kicker and the gap its total bar.
      dek={n.guard ? after : groups}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={initialAnswer} untouched="none" hero />
      </ExploreBeat>
    </AnalysisShell>
  );
}
