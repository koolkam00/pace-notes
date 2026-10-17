import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { extent, linear, pc, yScale } from './scale';

/**
 * A scatter of few points (the redesign spec, section 3.6): 8 px dots; the pair the sentence compares is joined by a
 * 1 px dashed line, keyed, its two dots ink and labelled (labels flip side when they would collide), the rest quiet.
 * Tap any dot to read it out.
 */
export type ScatterPoint = { id: string; x: number; y: number; label: string; key: string; value: string; inPair?: boolean };

export default function Scatter({ points, xTicks, yTicks, xDomain, yDomain, label, pairLabel = 'the pair', axisTitle, values, height = 220, heightMd = 280, labelAll = false }: {
  points: ScatterPoint[]; xTicks: { value: number; label: string }[]; yTicks: { value: number; label: string }[];
  xDomain?: [number, number]; yDomain?: [number, number]; label: string; pairLabel?: string;
  axisTitle?: { start?: string; end?: string }; values?: ReactNode; height?: number; heightMd?: number;
  /** Label every point (a scatter of very few), not only the pair; tapping reads any point either way. */
  labelAll?: boolean;
}) {
  const [x0, x1] = xDomain ?? extent(points.map((p) => p.x));
  const [y0, y1] = yDomain ?? extent(points.map((p) => p.y));
  const xp = (x1 - x0) * 0.06, yp = (y1 - y0) * 0.08;
  const x = linear([x0 - xp, x1 + xp]);
  const y = yScale(y0 - yp, y1 + yp, { top: 0.1, bottom: 0.06 });
  const pair = points.filter((p) => p.inPair);
  const items: LabelItem[] = points.filter((p) => labelAll || p.inPair).map((p) => ({ id: p.id, text: p.label, x: x(p.x), y: y(p.y), priority: p.inPair ? 3 : 1, size: 13, prefer: 'right', gap: 8, tone: p.inPair ? 'ink' : 'quiet' }));
  const placed = placeLabels(items, { height, avoid: points.map((p) => ({ x: x(p.x), y: y(p.y), r: 4 })) });
  const plot = (
    <Plot>
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label }))} />
      {pair.length === 2 ? <line className="ref-line is-dashed" x1={pc(x(pair[0].x))} y1={pc(y(pair[0].y))} x2={pc(x(pair[1].x))} y2={pc(y(pair[1].y))} /> : null}
      {points.map((p) => <circle key={p.id} className={p.inPair ? 'm-ink' : 'm-context'} cx={pc(x(p.x))} cy={pc(y(p.y))} r={4} />)}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={xTicks.map((t) => ({ x: x(t.value), label: t.label }))} title={axisTitle} />;
  const scrub = { x: points.map((p) => x(p.x)), y: points.map((p) => y(p.y)), keys: points.map((p) => p.key), values: points.map((p) => p.value) };
  const start = Math.max(0, points.findIndex((p) => p.inPair));
  return (
    <ChartFrame className="scatter" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber mode="pick" points={scrub} initial={start} label={label} axis={axis}>{plot}</Scrubber>}
      keys={pair.length === 2 ? [{ label: pairLabel, mark: 'dash' }, { label: 'Other editions', mark: 'dot', tone: 'quiet' }] : undefined}
      values={values}
    />
  );
}
