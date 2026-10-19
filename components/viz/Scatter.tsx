import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { extent, linear, pc, yScale } from './scale';

/**
 * A scatter of few points (the redesign spec, section 3.6): 8 px dots; the pair the sentence compares is ink and
 * labelled directly (labels flip side when they would collide, and keep clear of the ring the chart opens on), joined by
 * a 1 px dashed line unless `pairLine` is off, the rest quiet. Tap any dot to read it out. The dots' knockout is one
 * layer drawn under all of them, so overlapping dots read as one cluster, never as crescents cut by a neighbour's halo.
 */
export type ScatterPoint = { id: string; x: number; y: number; label: string; key: string; value: string; inPair?: boolean };

export default function Scatter({ points, xTicks, yTicks, xDomain, yDomain, label, axisTitle, values, height = 220, heightMd = 280, labelAll = false, selected, pairLine = true, side }: {
  points: ScatterPoint[]; xTicks: { value: number; label: string }[]; yTicks: { value: number; label: string }[];
  xDomain?: [number, number]; yDomain?: [number, number]; label: string;
  axisTitle?: { start?: string; end?: string }; values?: ReactNode; height?: number; heightMd?: number;
  /** Label every point (a scatter of very few), not only the pair; tapping reads any point either way. */
  labelAll?: boolean;
  /** The point the chart opens on (its id): the one the sentence leads with. Default: the first of the pair. */
  selected?: string;
  /** Join the pair with a dashed line. Off where a line across the cloud would read as a trend. */
  pairLine?: boolean;
  /** Side values for the readout, one per point (the y measure named, so the readout says what the dots' height is). */
  side?: { label: string; values: string[] }[];
}) {
  const [x0, x1] = xDomain ?? extent(points.map((p) => p.x));
  const [y0, y1] = yDomain ?? extent(points.map((p) => p.y));
  const xp = (x1 - x0) * 0.06, yp = (y1 - y0) * 0.08;
  const x = linear([x0 - xp, x1 + xp]);
  // A share scale from zero keeps zero on the baseline (no padding under it), so a "0%" gridline label sits on it.
  const y = y0 === 0 ? yScale(0, y1 + yp, { top: 0.1, bottom: 0 }) : yScale(y0 - yp, y1 + yp, { top: 0.1, bottom: 0.06 });
  const pair = points.filter((p) => p.inPair);
  const chosen = selected !== undefined ? points.findIndex((p) => p.id === selected) : -1;
  const start = chosen >= 0 ? chosen : Math.max(0, points.findIndex((p) => p.inPair));
  const joined = pairLine && pair.length === 2;
  // The point the chart opens on carries the pick ring (12 px round it): its own label stands clear of the ring and
  // stays (the pair is labelled directly, so the open dot is named like the other); any other label hides while the
  // ring is on its dot (the readout names it then).
  const items: LabelItem[] = points.map((p, i) => ({ p, i })).filter(({ p }) => labelAll || p.inPair).map(({ p, i }) => ({ id: p.id, text: p.label, x: x(p.x), y: y(p.y), priority: p.inPair ? 3 : 1, size: 13, prefer: 'right', gap: i === start ? 17 : 8, tone: p.inPair ? 'ink' : 'quiet', ...(i === start ? {} : { at: i }) }));
  // Labels keep clear of every dot, of the ring the chart opens on (12 px round its point) and of the pair's line.
  const avoid = points.map((p, i) => ({ x: x(p.x), y: y(p.y), r: i === start ? 13 : 4 }));
  const along = joined ? Array.from({ length: 9 }, (_, k) => ({ x: x(pair[0].x) + ((k + 1) / 10) * (x(pair[1].x) - x(pair[0].x)), y: y(pair[0].y) + ((k + 1) / 10) * (y(pair[1].y) - y(pair[0].y)), r: 2 })) : [];
  const placed = placeLabels(items, { height, avoid: [...avoid, ...along] });
  const plot = (
    <Plot>
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label }))} />
      {joined ? <line className="ref-line is-dashed" x1={pc(x(pair[0].x))} y1={pc(y(pair[0].y))} x2={pc(x(pair[1].x))} y2={pc(y(pair[1].y))} /> : null}
      {points.map((p) => <circle key={`h${p.id}`} className="m-halo" cx={pc(x(p.x))} cy={pc(y(p.y))} r={6} />)}
      {points.map((p) => <circle key={p.id} className={p.inPair ? 'm-ink is-flat' : 'm-context is-flat'} cx={pc(x(p.x))} cy={pc(y(p.y))} r={4} />)}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={xTicks.map((t) => ({ x: x(t.value), label: t.label }))} title={axisTitle} />;
  const scrub = { x: points.map((p) => x(p.x)), y: points.map((p) => y(p.y)), keys: points.map((p) => p.key), values: points.map((p) => p.value), side };
  return (
    <ChartFrame className="scatter" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber mode="pick" points={scrub} initial={start} label={label} axis={axis}>{plot}</Scrubber>}
      keys={pair.length === 2 ? [{ label: 'Other editions', mark: 'dot', tone: 'quiet' }] : undefined}
      values={values}
    />
  );
}
