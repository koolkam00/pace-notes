import type { ReactNode } from 'react';
import ChartFrame, { type KeyItem } from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines, RefLine } from './Plot';
import Lens from './Lens.client';
import Scrubber, { type ScrubPoints } from './Scrubber.client';
import Annotation from './Annotation';
import { fitClass, placeLabels, textWidth, type LabelItem } from './labels';
import { areaPath, extent, linear, linePath, pc, yScale } from './scale';
import { typeStyle } from '@/lib/viz/palette';

/**
 * A line profile (the redesign spec, section 3.6): x along the course (mats or sections) or along any continuous
 * measure; the median as a 2 px ink line, its p25–p75 band at a 10% ink wash, even pace or typical dashed, a region the
 * sentence is about washed. It also draws the U-curve of starting pace: one line against a zero line, the side the
 * sentence is about washed signal (`fillAbove`), the best point a hollow ring.
 *
 * `layers` are the lens: goal chips or the like. Each is drawn on the server and the chosen one shows (the lens fades
 * between them). `scrub` adds the needle, with detents at the values the headline names.
 */
export type ProfileSeries = { id: string; values: number[]; tone?: 'ink' | 'quiet' | 'signal' | 'type'; typeIndex?: number; dashed?: boolean; fillAbove?: number };
export type ProfileLayer = {
  id: string;
  label: string;
  series: ProfileSeries[];
  band?: { lo: number[]; hi: number[] };
  labels?: { x: number; y: number; text: string; tone?: 'ink' | 'signal' | 'quiet'; priority?: number; prefer?: LabelItem['prefer'] }[];
  points?: { x: number; y: number; kind: 'best' | 'reading' }[];
};

type Props = {
  x: number[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xTicks: { value: number; label: string }[];
  yTicks?: { value: number; label: string }[];
  layers: ProfileLayer[];
  initial?: string;
  lensLabel?: string;
  chips?: boolean;
  refs?: { value: number; label?: string; dashed?: boolean }[];
  /** A stretch of x the sentence is about ("after 20K"): its start drawn as a hairline with its label, washed with `fill`. */
  washes?: { from: number; to: number; label?: string; fill?: boolean }[];
  scrub?: { points: ScrubPoints; initial: number; detents: number[]; label: string };
  axisTitle?: { start?: string; end?: string };
  label: string;
  keys?: KeyItem[];
  values?: ReactNode;
  height?: number;
  heightMd?: number;
};

export default function LineProfile({ x: xs, xDomain, yDomain, xTicks, yTicks = [], layers, initial, lensLabel, chips, refs = [], washes = [], scrub, axisTitle, label, keys, values, height = 220, heightMd = 280 }: Props) {
  const x = linear(xDomain ?? extent(xs));
  const all = layers.flatMap((l) => [...l.series.flatMap((s) => s.values), ...(l.band ? [...l.band.lo, ...l.band.hi] : [])]).concat(refs.map((r) => r.value));
  const [lo, hi] = yDomain ?? extent(all);
  const pad = (hi - lo) * 0.06 || 1;
  const y = yScale(yDomain ? lo : lo - pad, yDomain ? hi : hi + pad, { top: 0.12, bottom: 0.04 });
  const current = initial ?? layers[0]?.id;
  const lensOn = layers.length > 1;

  const drawLayer = (layer: ProfileLayer) => {
    // Values outside the domain (a wide band) are held at its edge, so nothing spills out of the plot.
    const [d0, d1] = y.domain;
    const clamp = (v: number) => Math.max(Math.min(d0, d1), Math.min(Math.max(d0, d1), v));
    const pts = (values: number[]) => values.map((v, i) => [x(xs[i]), y(clamp(v))] as [number, number]);
    const items: LabelItem[] = (layer.labels ?? []).map((l, i) => ({ id: `${layer.id}-${i}`, text: l.text, x: x(l.x), y: y(l.y), priority: l.priority ?? (l.tone === 'signal' ? 3 : 2), tone: l.tone, prefer: l.prefer }));
    // Labels keep clear of the points and of every line's vertices.
    const avoid = [...(layer.points ?? []).map((p) => ({ x: x(p.x), y: y(p.y), r: 7 })),
      ...layer.series.flatMap((sr) => sr.values.map((v, i) => ({ x: x(xs[i]), y: y(clamp(v)), r: 3 })))];
    const placed = placeLabels(items, { height, avoid });
    return (
      <g key={layer.id} data-layer={lensOn ? layer.id : undefined} className={lensOn && layer.id !== current ? 'is-off' : undefined}>
        <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
          {layer.band ? <path className="a-band" d={areaPath(pts(layer.band.hi), pts(layer.band.lo))} /> : null}
          {layer.series.filter((s) => s.fillAbove !== undefined).map((s) => (
            <path key={`fill-${s.id}`} className="a-signal" d={areaPath(pts(s.values.map((v) => Math.max(v, s.fillAbove!))), pts(s.values.map(() => s.fillAbove!)))} />
          ))}
          {layer.series.map((s) => (
            <path key={s.id} className={s.dashed ? 'l-dash' : s.tone === 'quiet' ? 'l-quiet' : s.tone === 'signal' ? 'l-signal' : s.tone === 'type' ? 'l-type' : 'l-ink'}
              style={s.tone === 'type' ? typeStyle(s.typeIndex ?? 0) : undefined} d={linePath(pts(s.values))} />
          ))}
        </svg>
        {(layer.points ?? []).map((p, i) => (
          <circle key={i} className={p.kind === 'best' ? 'm-hollow-ink' : 'm-signal'} cx={pc(x(p.x))} cy={pc(y(p.y))} r={p.kind === 'best' ? 5 : 5.5} />
        ))}
        <Annotation labels={placed} />
      </g>
    );
  };

  const plot = (
    <Plot>
      {washes.map((w, i) => (
        <g key={i}>
          {w.fill ? <rect className="a-wash" x={pc(x(w.from))} width={pc(x(w.to) - x(w.from))} y="0" height="100%" /> : null}
          <rect className="grid-line" x={pc(x(w.from))} width={1} y="0" height="100%" transform="translate(-0.5 0)" />
          {w.label ? <text className={`tick ${fitClass((textWidth(w.label, 12, 500) + 64) / Math.max(0.05, 1 - x(w.from)))}`} x={pc(x(w.from))} y="0" dy={12} dx={6}>{w.label}</text> : null}
        </g>
      ))}
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label }))} side="right" />
      {refs.map((r) => <RefLine key={r.value} y={y(r.value)} label={r.label} dashed={r.dashed} side="left" />)}
      {layers.map(drawLayer)}
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={xTicks.map((t) => ({ x: x(t.value), label: t.label }))} title={axisTitle} />;
  return (
    <ChartFrame label={label} height={height} heightMd={heightMd} k={lensOn ? current : undefined}
      lens={lensOn ? <Lens label={lensLabel ?? 'Show'} options={layers.map((l) => ({ value: l.id, label: l.label }))} defaultValue={current} chips={chips} /> : undefined}
      scrub={scrub ? <Scrubber points={scrub.points} initial={scrub.initial} detents={scrub.detents} label={scrub.label} axis={axis}>{plot}</Scrubber> : undefined}
      plot={scrub ? undefined : plot} axis={scrub ? undefined : axis} keys={keys} values={values}
    />
  );
}
