import Receipt from '@/components/ui/Receipt';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart, getCityData } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getNugget } from '@/lib/nuggets';
import { delta, hm, ms, pct, spokenPct, spokenTime } from '@/lib/nuggets/format';

const PATH = '/analyses/where-time-is-gained';

/** Chapter 05, page 3: finishes just under and just over 4:00, where they split, then Make it yours. */
export default function WhereTime() {
  const definition = analysisBySlug('where-time-is-gained')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('sections.split');
  const v = n.values as { goal_min: number; gap_s: number; after20_s: number; share: number };
  const near = getCityData(EXAMPLE_PROFILE.city).cohorts['all|all|all']?.near.find((x) => x.target === v.goal_min);
  // The result is the H1's accent (the share of the gap opened after 20K). The two lines add up to the finish gap: each
  // is rounded from the same whole seconds, so the receipt never reads 1:08 + 1:34 = 2:43.
  const total = Math.round(v.gap_s), after = Math.round(v.after20_s), before = total - after;
  const answer = near ? (
    <Receipt kicker={`Just under ${hm(v.goal_min)} against just over`}
      lines={[
        { label: 'Apart at 20K', value: ms(before), sr: spokenTime(before) },
        { label: 'Added after 20K', value: delta(after), sr: `${spokenTime(after)} more` },
        { label: 'Apart at the finish', value: ms(total), sr: spokenTime(total) },
      ]}
      result={{ label: 'Of the gap, opened after 20K', value: pct(Number(v.share)), sr: `${spokenPct(Number(v.share))} of the gap opened after 20K`, fallback: n.guard ? undefined : `${ms(total)} apart at the finish` }}
      footer={`Finishes ${hm(v.goal_min - 5)}–${hm(v.goal_min)} against ${hm(v.goal_min)}–${hm(v.goal_min + 5)}`} />
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
