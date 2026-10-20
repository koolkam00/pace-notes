import DotGrid from '@/components/viz/DotGrid';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import CheckpointExplorer from '@/components/CheckpointExplorer';
import AnalysisShell, { AnswerCard, Beat, ExploreBeat } from '../Shell';
import { getCheckpointCurve, getCheckpointDefault } from '@/lib/analysis-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getNugget } from '@/lib/nuggets';
import { clock, hm, pct } from '@/lib/nuggets/format';
import { howWeKnowOf } from '@/lib/chapters';

const PATH = '/analyses/checkpoint';
/** The page's methods, at the foot of its All numbers (the closing row is the way back alone). */
const HOW = howWeKnowOf(PATH) ?? undefined;

/** Chapter 04, page 1: even goal pace at 30K and how few made it, the cushion that made it a coin flip, then Make it yours. */
export default function Checkpoint() {
  const summary = getPersonalSummary()!;
  const under = getNugget('checkpoint.under'), cushion = getNugget('checkpoint.cushion');
  const v = under.values as { goal_min: number; mat_km: number; share: number; median_s: number; band_min: number };
  const row = getCheckpointDefault();
  const even = Math.round((v.goal_min * 60 * v.mat_km) / 42.195);
  const lit = Math.round(v.share * 100);
  const answer = (
    <AnswerCard kicker={`On even ${hm(v.goal_min)} pace at ${v.mat_km}K`}>
      <div className="answer-dots">
        <DotGrid lit={lit} label={`${lit} of 100 finishes on even ${hm(v.goal_min)} pace at ${v.mat_km}K got under ${hm(v.goal_min)}`} />
        {/* The H1 gives the share; the card names its dots once (round 6: "14 of 100" said the H1's 14% again). */}
        <p className="answer-dots-label dot-grid-key"><span><i className="is-signal" />Under {hm(v.goal_min)}</span><span><i />Not under</span></p>
      </div>
      {/* The group's 2-minute window at the mat is the dek's; the card gives even pace exactly and where they finished. */}
      <dl className="answer-cells">
        <div><dt>Even pace at {v.mat_km}K</dt><dd>{clock(even)}</dd></div>
        <div><dt>Median finish</dt><dd>{clock(v.median_s)}</dd></div>
      </dl>
    </AnswerCard>
  );
  return (
    // The dek qualifies the H1 (critic round 4: a question dek the H1 had already answered): the group passed the mat in
    // the 2-minute window that holds even pace, on every course.
    <AnalysisShell path={PATH} numbers title={under} dek={`Finishes passing ${v.mat_km}K in ${hm(v.band_min)}–${hm(v.band_min + 2)}, every course.`} answer={answer}>
      <Beat id="cushion" track="chapter-1" label="The cushion" title={cushion}><Cushion goal={v.goal_min} mat={v.mat_km} /></Beat>
      <ExploreBeat track="chapter-2">
        <CheckpointExplorer summary={summary} initial={row ? { row, checkpoint: v.mat_km, elapsed: even } : null} />
      </ExploreBeat>
    </AnalysisShell>
  );
}

/** The share of finishes under the goal, by 2-minute split at the mat: drag along the splits from the 50% point. */
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
  // The axis runs on whole 5-minute marks, so the first ten-minute tick (2:30) sits at its left end. Five minutes of room
  // past the last split keep the needle clear of the gridline labels at the right edge at every position (round 6: at
  // its last point it ran through "half" and "100%").
  const d0 = Math.floor(xs[0] / 5) * 5, end = Math.ceil(xs[xs.length - 1] / 5) * 5, d1 = end + 5;
  const t0 = Math.ceil(d0 / 10) * 10, t1 = Math.floor(end / 10) * 10;
  // Every ten minutes, and even pace named under its own line at every width (a round tick within four minutes of it
  // gives way), so the H2's "ahead of even pace" can be read off the chart.
  const ticks = Array.from({ length: Math.floor((t1 - t0) / 10) + 1 }, (_, i) => t0 + i * 10).filter((t) => Math.abs(t - evenMin) >= 4);
  const range = (p: { elapsed: number }) => `${clock(p.elapsed * 60).slice(0, -3)}–${clock((p.elapsed + 2) * 60).slice(0, -3)}`;
  return (
    <LineProfile x={xs} xDomain={[d0, d1]} yDomain={[0, 100]}
      layers={[{ id: 'c', label: 'Under the goal', series: [{ id: 's', values: curve.map((p) => p.share * 100) }] }]}
      refs={[{ value: 50, dashed: true, label: 'half' }]}
      washes={evenI >= 0 ? [{ from: evenMin, to: evenMin }] : []}
      xTicks={[...ticks.map((t) => ({ value: t, label: hm(t) })), ...(evenI >= 0 ? [{ value: evenMin, label: 'even' }] : [])].sort((a, b) => a.value - b.value)}
      yTicks={[{ value: 100, label: '100%' }]}
      // No detents: each draws a dot on the axis, and the 2-minute bins' centres never sit on a labelled tick (even pace
      // falls inside a bin), so a snap dot would read as a tick off its own label. The needle opens on the finding.
      // On the plot's own x scale; a dot marks where the needle meets the curve, as on starting pace's scrubber.
      scrub={{ label: `Split at ${mat}K`, initial: Math.max(0, initial), detents: [], follow: 's',
        points: { x: xs.map((x) => (x - d0) / (d1 - d0)), keys: curve.map((p) => `At ${mat}K in ${range(p)}, under ${hm(goal)}`), values: curve.map((p) => pct(p.share)),
          side: [{ label: 'Median finish', values: curve.map((p) => clock(p.median)) }] } }}
      axisTitle={{ start: `← faster at ${mat}K`, end: `slower at ${mat}K →` }}
      label={`The share of finishes under ${hm(goal)}, by split at ${mat}K: half made it from about ${Math.round(evenMin - halfAt)} minutes ahead of even pace`}
      values={<Values id="cp-cushion" how={HOW} caption={`Finishes under ${hm(goal)}, by split at ${mat}K`} columns={[{ key: 's', label: `At ${mat}K` }, { key: 'u', label: `Under ${hm(goal)}` }, { key: 'm', label: 'Median finish' }]}
        rows={curve.map((p) => [range(p), pct(p.share), clock(p.median)])} reading={Math.max(0, initial)} />}
      height={200} heightMd={250} />
  );
}
