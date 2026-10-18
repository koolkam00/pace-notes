import Receipt from '@/components/ui/Receipt';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import ByUnits from '../ByUnits.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm, pace, sectionLabel } from '@/lib/nuggets/format';
import { MARATHON_SECTION_ENDS } from '@/lib/section-labels';
import type { UnitSystem } from '@/lib/units';

const PATH = '/analyses/pacing-pattern';
const section = (i: number) => sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, MARATHON_SECTION_ENDS[i]);
const gap = (s: number, u: UnitSystem) => `${s < 0 ? '−' : '+'}${Math.round(Math.abs(s) * (u === 'mi' ? 1.609344 : 1))} s/${u}`;

/** Chapter 03, page 2: how finishes near 4:00 ran each 5K against even pace, then Make it yours. */
export default function PacingPattern() {
  const definition = analysisBySlug('pacing-pattern')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('pattern.profile');
  const v = n.values as { goal_min: number; even_s: number; fast_i: number; slow_i: number; turn_i: number; fast_s: number; slow_s: number };
  // The result is the H1's accent: the slowest 5K against even pace; the fastest 5K and where the clock turned lead to it.
  const receipt = (u: UnitSystem) => (
    <Receipt kicker={`Finishes near ${hm(v.goal_min)}, against even pace`}
      lines={[
        { label: 'Fastest 5K', key: section(v.fast_i), value: gap(v.fast_s - v.even_s, u) },
        { label: 'Slower than even from', value: section(v.turn_i) },
      ]}
      result={{ label: `Slowest 5K, ${section(v.slow_i)}`, value: gap(v.slow_s - v.even_s, u), sr: `${Math.round(Math.abs(v.slow_s - v.even_s) * (u === 'mi' ? 1.609344 : 1))} seconds a ${u === 'mi' ? 'mile' : 'kilometre'} slower than even pace in ${section(v.slow_i)}`,
        fallback: n.guard ? undefined : `${section(v.slow_i)}, the slowest 5K` }}
      footer={`Even ${hm(v.goal_min)} pace: ${pace(v.even_s, u)}`} />
  );
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={Number.isFinite(v.even_s) ? <ByUnits mi={receipt('mi')} km={receipt('km')} /> : null}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
