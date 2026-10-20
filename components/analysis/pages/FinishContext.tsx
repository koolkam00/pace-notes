import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import { explorerParts } from '../ExplorerChart';
import HeroSwap from '../HeroSwap.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisAnswers, getAnalysisStart } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getNugget } from '@/lib/nuggets';
import { hm, pct } from '@/lib/nuggets/format';

const PATH = '/analyses/finish-time-context';

/**
 * Chapter 06, page 2: the share of finishes under each time as one cumulative curve, the H1's mark (3:00, under which only 5% finished)
 * ringed by name and the readout opening on it (the H1's accent), then Make it yours, which draws its own curve only once
 * the visitor changes something. The share under 4:00 is chapter 01's finding, so the card does not open on it.
 */
export default function FinishContext() {
  const definition = analysisBySlug('finish-time-context')!;
  const { summary } = getAnalysisStart();
  const n = getNugget('target.context');
  // The mark the H1 names (the lowest of its three half-hours): the curve's ring and the readout's first reading, and
  // Make it yours' starting selection ("All courses · 3:00"), so the chip names what the card draws and a visitor's 4:00
  // moves the needle.
  const mark = Number(n.guard ? n.values.mark3_min : n.values.goal_min);
  // The dek is the comparison the card into this page names ("against 43% under 4:00"), never chapter 01's median
  // (round 6: it repeated the field's 4:10 and disagreed with the card a tap away).
  const dek = n.guard ? `Under ${hm(Number(n.values.goal_min))}: ${pct(Number(n.values.share))}.` : undefined;
  const start = { ...EXAMPLE_PROFILE, goal: mark };
  const initialAnswer = getAnalysisAnswers(start).find((a) => a.id === definition.id)!;
  const parts = explorerParts({ id: 'ambition', answer: initialAnswer, goal: mark, units: 'mi', valuesId: 'ftc-answer', example: true, apart: true });
  const answer = parts ? (
    // Make it yours moves this chart (HeroSwap): the visitor's curve and time replace the example here, never a second copy.
    <AnswerCard values={<HeroSwap slot="values">{parts?.values}</HeroSwap>}
      explore={<ExploreBeat track="chapter-1" inCard><AnalysisExplorer definition={definition} summary={summary} initialAnswer={initialAnswer} start={start} untouched="none" hero /></ExploreBeat>}>
      <HeroSwap kicker="Every finish, every course">{parts?.chart}</HeroSwap>
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={dek} answer={answer} />
  );
}
