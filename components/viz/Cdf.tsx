import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines } from './Plot';
import Scrubber, { type ScrubPoints } from './Scrubber.client';
import { linear, linePath, pc, yScale } from './scale';
import { REF_WIDTH, textWidth } from './labels';

/**
 * A cumulative curve (the redesign spec, section 3.6): the share of finishes under each time, cropped to the 1st–99th
 * percentile so the tails do not flatten it. You are an orange ring on the curve at your target; round marks are the
 * detents; scrub the target to read the share under any time.
 */
export type CdfPoint = { x: number; share: number };

export default function Cdf({ points, you, youLabel = 'You', ticks, scrub, label, values, height = 200, heightMd = 260 }: {
  points: CdfPoint[]; you?: number;
  /** The ring's label: "You" when the time is the visitor's own, else the time itself (a page's example goal). */
  youLabel?: string; ticks: { value: number; label: string; priority?: number }[];
  scrub: { points: ScrubPoints; initial: number; detents: number[]; label: string }; label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const x = linear([points[0].x, points[points.length - 1].x]);
  const y = yScale(0, 1, { top: 0.06 });
  const you_ = you === undefined ? null : points.reduce((b, p) => (Math.abs(p.x - you) < Math.abs(b.x - you) ? p : b));
  const plot = (
    <Plot paths={<path className="l-ink" d={linePath(points.map((p) => [x(p.x), y(p.share)]))} />}>
      {/* The gridline labels sit at the plot's left edge: while the needle stands on a point there (the first minutes of
          the scale), they hide, so the needle never runs through "75%". */}
      <Gridlines lines={[0.25, 0.5, 0.75].map((v) => ({ y: y(v), label: `${v * 100}%` }))} labelAt={scrub.points.x.flatMap((px, i) => (px * REF_WIDTH <= 30 ? [i] : []))} />
      {you_ ? (
        <g>
          {/* The visitor's own time is an orange ring ("You"); a page's example time is an ink ring with its name, so the
              needle stays the one orange mark. */}
          <circle className={youLabel === 'You' ? 'm-ring' : 'm-hollow-ink'} cx={pc(x(you_.x))} cy={pc(y(you_.share))} r={youLabel === 'You' ? 7 : 6} />
          {/* The example's name sits left of its ring, above the curve, clear of the needle that opens on it; a ring too
              near the left edge for that (3:00) takes its name on the right, under the rising curve. */}
          {youLabel === 'You' || x(you_.x) * REF_WIDTH < textWidth(youLabel, 14) + 14
            ? <text className={youLabel === 'You' ? 'viz-label is-signal' : 'viz-label'} x={pc(x(you_.x))} y={pc(y(you_.share))} dx={12} dy={4}>{youLabel}</text>
            : <text className="viz-label" x={pc(x(you_.x))} y={pc(y(you_.share))} dx={-12} dy={4} textAnchor="end">{youLabel}</text>}
        </g>
      ) : null}
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label, priority: t.priority }))} />;
  return (
    <ChartFrame className="cdf" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={scrub.points} initial={scrub.initial} detents={scrub.detents} label={scrub.label} axis={axis}>{plot}</Scrubber>}
      values={values}
    />
  );
}
