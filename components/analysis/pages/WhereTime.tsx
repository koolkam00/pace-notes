import Receipt from '@/components/ui/Receipt';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart, getCityData } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getNugget } from '@/lib/nuggets';
import { delta, hm, ms, sectionLabel, spokenTime } from '@/lib/nuggets/format';
import { MARATHON_SECTION_ENDS } from '@/lib/section-labels';

const PATH = '/analyses/where-time-is-gained';
const section = (i: number) => sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, MARATHON_SECTION_ENDS[i]);

/** Chapter 05, page 3: finishes just under and just over 4:00, where they split, then Make it yours. */
export default function WhereTime() {
  const definition = analysisBySlug('where-time-is-gained')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('sections.split');
  const v = n.values as { goal_min: number; gap_s: number; after20_s: number; widest_i: number; widest_s: number };
  const near = getCityData(EXAMPLE_PROFILE.city).cohorts['all|all|all']?.near.find((x) => x.target === v.goal_min);
  const answer = near ? (
    <Receipt kicker={`Just under ${hm(v.goal_min)} against just over`}
      lines={[
        { label: 'Apart at 20K', value: ms(v.gap_s - v.after20_s), sr: spokenTime(v.gap_s - v.after20_s) },
        { label: 'Added after 20K', value: delta(v.after20_s), sr: `${spokenTime(v.after20_s)} more` },
        { label: 'The widest 5K', key: section(v.widest_i), value: delta(v.widest_s), sr: `${spokenTime(v.widest_s)} in ${section(v.widest_i)}` },
      ]}
      result={{ label: 'Apart at the finish', value: ms(v.gap_s), sr: spokenTime(v.gap_s) }}
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
