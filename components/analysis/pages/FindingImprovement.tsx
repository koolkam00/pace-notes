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
  const per = (s: number, km: number, u: UnitSystem) => `${Math.round((s / km) * (u === 'mi' ? 1.609344 : 1))} s a ${u === 'mi' ? 'mile' : 'km'}`;
  // Each block in whole seconds, rounded so the three add up to the total (largest remainder).
  const exact = mins.map((m) => m * 60), whole = exact.map(Math.round);
  for (let left = Math.round(g.total_min * 60) - whole.reduce((a, b) => a + b, 0), guard = 0; left !== 0 && guard < 3; guard++) {
    const i = exact.map((e, k) => ({ k, gap: (e - whole[k]) * Math.sign(left) })).sort((a, b) => b.gap - a.gap)[0].k;
    whole[i] += Math.sign(left); left -= Math.sign(left);
  }
  // The H1 gives the share found from 30K; the receipt adds what it does not say: the three parts, each per mile, and
  // the total they add up to.
  const receipt = (u: UnitSystem) => (
    <Receipt kicker={`Near ${hm(g.goal_min)}, against earlier best`}
      lines={BLOCKS.map(([label, km], i) => ({ label, key: per(whole[i], km, u), value: ms(whole[i]), sr: spokenTime(whole[i]) }))}
      result={{ label: 'Faster in all', value: ms(whole.reduce((a, b) => a + b, 0)), sr: `${spokenTime(whole.reduce((a, b) => a + b, 0))} faster in all` }} />
  );
  const r = next.values as { observed: number; expected: number };
  const lit = (s: number) => Math.round(s * 100);
  return (
    <AnalysisShell path={PATH} title={gains} dek={definition.title} answer={Number.isFinite(g.total_min) ? <ByUnits mi={receipt('mi')} km={receipt('km')} /> : null}>
      <Beat id="next-race" track="chapter-1" label="The next race" title={next} term>
        <div className="beat-grids">
          <DotGrid lit={lit(r.observed)} label={`${lit(r.observed)} of 100 next races had a sustained slowdown after one`} caption={<><strong>{lit(r.observed)} of 100</strong> after a sustained slowdown</>} />
          <DotGrid lit={lit(r.expected)} compare label={`${lit(r.expected)} of 100 was typical`} caption={<><strong>{lit(r.expected)} of 100</strong> typical</>} />
        </div>
      </Beat>
      <ExploreBeat track="chapter-2">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
