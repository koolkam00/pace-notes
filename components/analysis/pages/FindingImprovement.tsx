import Receipt from '@/components/ui/Receipt';
import DotGrid from '@/components/viz/DotGrid';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { Beat, ExploreBeat } from '../Shell';
import ByUnits from '../ByUnits.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm, ms, spokenTime } from '@/lib/nuggets/format';
import type { UnitSystem } from '@/lib/units';

const PATH = '/analyses/finding-improvement';
const BLOCKS: [string, number][] = [['0–10K', 10], ['10–30K', 20], ['30K–finish', 12.195]];

/** Chapter 11, page 1: where improving finishes found their time, what followed a sustained slowdown, then Make it yours. */
export default function FindingImprovement() {
  const definition = analysisBySlug('finding-improvement')!;
  const { summary, answers } = getAnalysisStart();
  const gains = getNugget('gains.final'), next = getNugget('kick.recurrence');
  const g = gains.values as { goal_min: number; open_min: number; middle_min: number; final_min: number; total_min: number };
  const mins = [g.open_min, g.middle_min, g.final_min];
  const per = (m: number, km: number, u: UnitSystem) => `${Math.round(((m * 60) / km) * (u === 'mi' ? 1.609344 : 1))} s a ${u === 'mi' ? 'mile' : 'km'}`;
  const receipt = (u: UnitSystem) => (
    <Receipt kicker={`Improving finishes near ${hm(g.goal_min)}, against an earlier best`}
      lines={BLOCKS.slice(0, 2).map(([label, km], i) => ({ label, key: per(mins[i], km, u), value: ms(mins[i] * 60), sr: spokenTime(mins[i] * 60) }))}
      result={{ label: `${BLOCKS[2][0]}, ${per(mins[2], BLOCKS[2][1], u)}`, value: ms(mins[2] * 60), sr: spokenTime(mins[2] * 60) }}
      extra={{ label: 'Faster in all', value: ms(g.total_min * 60), sr: spokenTime(g.total_min * 60) }} />
  );
  const r = next.values as { observed: number; expected: number };
  const lit = (s: number) => Math.round(s * 100);
  return (
    <AnalysisShell path={PATH} title={gains} dek={definition.title} answer={Number.isFinite(g.total_min) ? <ByUnits mi={receipt('mi')} km={receipt('km')} /> : null}>
      <Beat id="next-race" track="chapter-1" label="The next race" title={next}>
        <div className="beat-grids">
          <DotGrid lit={lit(r.observed)} label={`${lit(r.observed)} of 100 next races had a sustained slowdown after one`} caption={<><strong>{lit(r.observed)} of 100</strong> after a sustained slowdown</>} />
          <DotGrid lit={lit(r.expected)} compare label={`${lit(r.expected)} of 100 was typical`} caption={<><strong>{lit(r.expected)} of 100</strong> typical</>} />
        </div>
      </Beat>
      <ExploreBeat track="chapter-2">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
