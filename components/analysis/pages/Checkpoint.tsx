import DotGrid from '@/components/viz/DotGrid';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import CheckpointExplorer from '@/components/CheckpointExplorer';
import AnalysisShell, { AnswerCard, Beat, ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getCheckpointCurve, getCheckpointDefault } from '@/lib/analysis-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getNugget } from '@/lib/nuggets';
import { clock, hm, pct } from '@/lib/nuggets/format';

const PATH = '/analyses/checkpoint';

/** Chapter 04, page 1: even goal pace at 30K and how few made it, the cushion that made it a coin flip, then Make it yours. */
export default function Checkpoint() {
  const definition = analysisBySlug('checkpoint')!;
  const summary = getPersonalSummary()!;
  const under = getNugget('checkpoint.under'), cushion = getNugget('checkpoint.cushion');
  const v = under.values as { goal_min: number; mat_km: number; share: number; median_s: number };
  const row = getCheckpointDefault();
  const even = Math.round((v.goal_min * 60 * v.mat_km) / 42.195);
  const lit = Math.round(v.share * 100);
  const answer = (
    <AnswerCard kicker={`On even ${hm(v.goal_min)} pace at ${v.mat_km}K`}>
      <div className="answer-dots">
        <DotGrid lit={lit} label={`${lit} of 100 finishes on even ${hm(v.goal_min)} pace at ${v.mat_km}K got under ${hm(v.goal_min)}`} />
        <p className="answer-dots-label"><strong>{lit}</strong> of 100 got under {hm(v.goal_min)}</p>
      </div>
      <dl className="answer-cells">
        <div><dt>At {v.mat_km}K</dt><dd>{clock(even)}</dd></div>
        <div><dt>Median finish</dt><dd>{clock(v.median_s)}</dd></div>
      </dl>
    </AnswerCard>
  );
  return (
    <AnalysisShell path={PATH} title={under} dek={definition.title} answer={answer}>
      <Beat id="cushion" track="chapter-1" label="The cushion" title={cushion}><Cushion goal={v.goal_min} mat={v.mat_km} /></Beat>
      <ExploreBeat track="chapter-2">
        <CheckpointExplorer summary={summary} initial={row ? { row, checkpoint: v.mat_km, elapsed: even } : null} />
      </ExploreBeat>
    </AnalysisShell>
  );
}

/** The share of finishes under the goal, by 2-minute split at the mat: drag along the splits; even pace and the 50% point are detents. */
function Cushion({ goal, mat }: { goal: number; mat: number }) {
  const all = getCheckpointCurve(mat, goal);
  const curve = all.filter((p) => p.share <= 0.99 && p.share >= 0.01);
  if (curve.length < 3) return null;
  const xs = curve.map((p) => p.elapsed + 1);
  const evenMin = (goal * mat) / 42.195;
  const evenI = curve.findIndex((p) => p.elapsed <= evenMin && evenMin < p.elapsed + 2);
  const halfI = curve.reduce((b, p, i) => (p.share >= 0.5 ? i : b), -1);
  const halfAt = Number(getNugget('checkpoint.cushion').values.half_at_min);
  const initial = Number.isFinite(halfAt) ? curve.findIndex((p) => p.elapsed <= halfAt && halfAt < p.elapsed + 2) : halfI;
  const t0 = Math.ceil(xs[0] / 10) * 10, t1 = Math.floor(xs[xs.length - 1] / 10) * 10;
  const ticks = Array.from({ length: Math.floor((t1 - t0) / 10) + 1 }, (_, i) => t0 + i * 10);
  const range = (p: { elapsed: number }) => `${clock(p.elapsed * 60).slice(0, -3)}–${clock((p.elapsed + 2) * 60).slice(0, -3)}`;
  return (
    <LineProfile x={xs} xDomain={[xs[0], xs[xs.length - 1]]} yDomain={[0, 100]}
      layers={[{ id: 'c', label: 'Under the goal', series: [{ id: 's', values: curve.map((p) => p.share * 100) }] }]}
      refs={[{ value: 50, dashed: true, label: 'half' }]}
      washes={evenI >= 0 ? [{ from: evenMin, to: evenMin, label: `even ${hm(goal)}` }] : []}
      xTicks={ticks.map((t) => ({ value: t, label: hm(t) }))}
      yTicks={[{ value: 100, label: '100%' }]}
      scrub={{ label: `Split at ${mat}K`, initial: Math.max(0, initial), detents: [evenI, initial].filter((i) => i >= 0),
        points: { x: xs.map((x) => (x - xs[0]) / (xs[xs.length - 1] - xs[0])), keys: curve.map((p) => `At ${mat}K in ${range(p)}, under ${hm(goal)}`), values: curve.map((p) => pct(p.share)),
          side: [{ label: 'Median finish', values: curve.map((p) => clock(p.median)) }] } }}
      axisTitle={{ start: `← faster at ${mat}K`, end: `slower at ${mat}K →` }}
      label={`The share of finishes under ${hm(goal)}, by split at ${mat}K: half made it from about ${Math.round(evenMin - halfAt)} minutes ahead of even pace`}
      values={<Values id="cp-cushion" caption={`Finishes under ${hm(goal)}, by split at ${mat}K`} columns={[{ key: 's', label: `At ${mat}K` }, { key: 'u', label: `Under ${hm(goal)}` }, { key: 'm', label: 'Median finish' }]}
        rows={curve.map((p) => [range(p), pct(p.share), clock(p.median)])} reading={Math.max(0, initial)} />}
      height={200} heightMd={250} />
  );
}
