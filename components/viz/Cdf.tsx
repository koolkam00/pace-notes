import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines } from './Plot';
import Scrubber, { type ScrubPoints } from './Scrubber.client';
import { linear, linePath, pc, yScale } from './scale';

/**
 * A cumulative curve (the redesign spec, section 3.6): the share of finishes under each time, cropped to the 1st–99th
 * percentile so the tails do not flatten it. You are an orange ring on the curve at your target; round marks are the
 * detents; scrub the target to read the share under any time.
 */
export type CdfPoint = { x: number; share: number };

export default function Cdf({ points, you, ticks, scrub, label, values, height = 200, heightMd = 260 }: {
  points: CdfPoint[]; you?: number; ticks: { value: number; label: string }[];
  scrub: { points: ScrubPoints; initial: number; detents: number[]; label: string }; label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const x = linear([points[0].x, points[points.length - 1].x]);
  const y = yScale(0, 1, { top: 0.06 });
  const you_ = you === undefined ? null : points.reduce((b, p) => (Math.abs(p.x - you) < Math.abs(b.x - you) ? p : b));
  const plot = (
    <Plot paths={<path className="l-ink" d={linePath(points.map((p) => [x(p.x), y(p.share)]))} />}>
      <Gridlines lines={[0.25, 0.5, 0.75].map((v) => ({ y: y(v), label: `${v * 100}%` }))} />
      {you_ ? (
        <g>
          <circle className="m-ring" cx={pc(x(you_.x))} cy={pc(y(you_.share))} r={7} />
          <text className="viz-label is-signal" x={pc(x(you_.x))} y={pc(y(you_.share))} dx={12} dy={4}>You</text>
        </g>
      ) : null}
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} />;
  return (
    <ChartFrame className="cdf" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={scrub.points} initial={scrub.initial} detents={scrub.detents} label={scrub.label} axis={axis}>{plot}</Scrubber>}
      values={values}
    />
  );
}
