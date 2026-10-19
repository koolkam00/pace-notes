import Receipt from '@/components/ui/Receipt';
import DotGrid from '@/components/viz/DotGrid';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { Beat, ExploreBeat } from '../Shell';
import ByUnits from '@/components/ui/ByUnits.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getNugget } from '@/lib/nuggets';
import { hm, ms, pct, spokenTime } from '@/lib/nuggets/format';
import { MARATHON_KM, distance, type UnitSystem } from '@/lib/units';

const PATH = '/analyses/finding-improvement';
const BLOCKS: [string, number][] = [['0–10K', 10], ['10–30K', 20], ['30K–finish', 12.195]];

/** Chapter 11, page 1: where improving finishes found their time, what followed a sustained slowdown, then Make it yours. */
export default function FindingImprovement() {
  const definition = analysisBySlug('finding-improvement')!;
  const { summary, answers } = getAnalysisStart();
  const gains = getNugget('gains.final'), next = getNugget('kick.recurrence');
  const g = gains.values as { goal_min: number; open_min: number; middle_min: number; final_min: number; total_min: number };
  const mins = [g.open_min, g.middle_min, g.final_min];
  // Seconds per mile or km in the site's one style ("28 s/mi"), as the pacing pages write it; each line says its
  // direction ("28 s/mi faster"), so its time never reads as a split.
  const per = (s: number, km: number, u: UnitSystem) => `${Math.round((s / km) * (u === 'mi' ? 1.609344 : 1))} s/${u}`;
  // Each block in whole seconds, rounded so the three add up to the total (largest remainder).
  const exact = mins.map((m) => m * 60), whole = exact.map(Math.round);
  for (let left = Math.round(g.total_min * 60) - whole.reduce((a, b) => a + b, 0), guard = 0; left !== 0 && guard < 3; guard++) {
    const i = exact.map((e, k) => ({ k, gap: (e - whole[k]) * Math.sign(left) })).sort((a, b) => b.gap - a.gap)[0].k;
    whole[i] += Math.sign(left); left -= Math.sign(left);
  }
  // The receipt adds up the H1: the three parts, each per mile, then the H1's accent as its result (the share of the
  // time found after 30K, the card's one orange figure) and the total it is a share of.
  const total = whole.reduce((a, b) => a + b, 0);
  const receipt = (u: UnitSystem) => (
    <Receipt kicker={`Near ${hm(g.goal_min)}, against earlier best`}
      lines={BLOCKS.map(([label, km], i) => ({ label, key: `${per(whole[i], km, u)} faster`, value: ms(whole[i]), sr: `${spokenTime(whole[i])} faster` }))}
      result={gains.guard && gains.figure ? { label: 'Found after 30K', value: `${gains.figure.value}${gains.figure.unit ?? ''}`, sr: `${gains.figure.sr} of the time found came after 30K` } : { label: 'Faster in all', value: ms(total), sr: `${spokenTime(total)} faster in all` }}
      extra={gains.guard ? { label: 'Faster in all', value: ms(total), sr: `${spokenTime(total)} faster in all` } : undefined} />
  );
  const stretch = (u: UnitSystem) => `After 30K is the last ${distance(MARATHON_KM - 30, u)}, ${pct((MARATHON_KM - 30) / MARATHON_KM)} of the distance.`;
  const r = next.values as { observed: number; expected: number };
  const lit = (s: number) => Math.round(s * 100);
  return (
    <AnalysisShell path={PATH} title={gains} answer={Number.isFinite(g.total_min) ? <ByUnits mi={receipt('mi')} km={receipt('km')} /> : null}
      // The stretch the H1 names, as a distance against its share of the race (its share of the time found is larger).
      dek={gains.guard ? <ByUnits mi={stretch('mi')} km={stretch('km')} /> : definition.title}>
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
