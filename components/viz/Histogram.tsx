import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import type { ReadoutProps } from './Readout';
import Axis from './Axis';
import Plot, { Baseline, Gridlines, RefLine } from './Plot';
import Lens from './Lens.client';
import Scrubber, { type ScrubPoints } from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { linear, pc, stepEdge, stepPath, u, yScale } from './scale';

/**
 * The minute histogram (the redesign spec, section 3.6): every one-unit bin as a silhouette in --fill-quiet with a
 * 1.5 px --mark-quiet top edge; the bins the sentence is about (`marks`) in ink and the one it names (`reading`) in
 * signal; the smooth curve as a 1.25 px --ink-2 line. With `curve`, a lens switches to "Against the curve": the same
 * bins redrawn as their ratio to the curve, diverging from a solid 1× line (the honest comparison).
 *
 * Pass `scrub` to make it scrubbable: the needle comes down from the top of the plot and stops just above the bin it
 * reads (under either lens), so the bin stays in view; at the reading itself the orange tower is the mark and the needle
 * steps out (scrubber.css); away from the reading (`scrub.home`, default `scrub.initial`), the reading's tower turns
 * ink and the needle is the one orange mark.
 */
export type Bin = { x: number; n: number };

type Props = {
  bins: Bin[];
  curve?: { x: number; v: number }[];
  marks?: number[];
  reading?: number;
  ticks: { x: number; label: string }[];
  label: string;
  lens?: { count: string; ratio: string; label: string };
  /** false: both layers are drawn but no control is (a scrolly's steps turn the lens, ScrollyLens). */
  lensControl?: boolean;
  scrub?: { points: ScrubPoints; initial: number; detents: number[]; label: string; home?: number };
  labels?: { x: number; text: string; tone?: 'ink' | 'signal' }[];
  values?: ReactNode;
  height?: number;
  heightMd?: number;
  /** A bin's own ratio to the curve where the data publishes one (a round mark's), so lens, readout and headline agree. */
  ratioAt?: Record<number, number>;
  /** The key's words: what a bin is, what the ink bins are, what the line is. */
  keyLabels?: { bin: string; mark?: string; curve?: string };
  /** A still chart's readout above the plot (the finding's figures), when it has no scrub. */
  readout?: ReadoutProps;
};

export default function Histogram({ bins, curve, marks = [], reading, ticks, label, lens, lensControl = true, scrub, labels = [], values, height = 220, heightMd = 300, keyLabels = { bin: 'Each bin' }, ratioAt = {}, readout }: Props) {
  const x0 = bins[0].x, x1 = bins[bins.length - 1].x + 1;
  const x = linear([x0, x1]);
  const w = 1 / (x1 - x0);
  const max = Math.max(...bins.map((b) => b.n), ...(curve ?? []).map((c) => c.v));
  const y = yScale(0, max, { top: 0.16 });
  const at = new Map(bins.map((b) => [b.x, b.n]));
  // A tower covers its bin exactly (the silhouette's step and its 1.5 px edge), so no grey sliver shows beside it.
  const column = (m: number, cls: string, scale = y, from = 1) => {
    const top = scale(at.get(m) ?? 0);
    return <rect key={`${cls}${m}`} className={`${cls} histo-tower`} x={pc(x(m))} width={pc(w)} y={pc(Math.min(top, from))} height={pc(Math.abs(from - top))} />;
  };
  const count = (
    <g data-layer={lens ? 'count' : undefined}>
      <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
        <path className="a-silhouette" d={stepPath(bins.map((b) => ({ x: x(b.x), y: y(b.n) })), w)} />
        <path className="a-edge" d={stepEdge(bins.map((b) => ({ x: x(b.x), y: y(b.n) })), w)} />
        {curve ? <path className="l-ink2" d={curve.map((c, i) => `${i ? 'L' : 'M'}${u(x(c.x + 0.5))} ${u(y(c.v))}`).join('')} /> : null}
      </svg>
      {marks.filter((m) => m !== reading).map((m) => column(m, 'm-ink'))}
      {reading !== undefined ? column(reading, 'm-signal is-reading') : null}
    </g>
  );

  // Against the curve: the ratio of each bin to the curve, from a 1× line.
  let ratioLayer: ReactNode = null;
  let ratioTop: ((m: number) => number) | null = null;
  if (lens && curve) {
    const expected = new Map(curve.map((c) => [c.x, c.v]));
    const ratios = bins.map((b) => ({ x: b.x, r: ratioAt[b.x] ?? ((expected.get(b.x) ?? 0) > 0 ? b.n / expected.get(b.x)! : 1) }));
    const hi = Math.max(1.5, ...ratios.map((r) => r.r)), lo = Math.min(0.75, ...ratios.map((r) => r.r));
    const ry = yScale(lo, hi, { top: 0.16, bottom: 0.04 });
    const ratioOf = new Map(ratios.map((r) => [r.x, r.r]));
    ratioTop = (m: number) => Math.min(ry(ratioOf.get(m) ?? 1), ry(1));
    const col = (m: number, cls: string) => {
      const top = ry(ratioOf.get(m) ?? 1), one = ry(1);
      return <rect key={`r${cls}${m}`} className={`${cls} histo-tower`} x={pc(x(m))} width={pc(w)} y={pc(Math.min(top, one))} height={pc(Math.abs(one - top))} />;
    };
    ratioLayer = (
      <g data-layer="ratio" className="is-off">
        {/* One gridline, 1.5×, labelled on the right where the towers are short, and naming its base ("1.5× the
            curve"), so the solid line the towers grow from reads as the curve itself (the key's line) without a label
            of its own: at either end of that line a tower ran through one (round 5). */}
        <Gridlines side="right" lines={[{ y: ry(hi >= 1.5 ? 1.5 : hi), label: `${(hi >= 1.5 ? 1.5 : hi).toFixed(1)}× the curve` }]} />
        <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
          <path className="a-silhouette" d={stepPath(ratios.map((r) => ({ x: x(r.x), y: ry(r.r) })), w, ry(1))} />
        </svg>
        {marks.filter((m) => m !== reading).map((m) => col(m, 'm-ink'))}
        {reading !== undefined ? col(reading, 'm-signal is-reading') : null}
        <RefLine y={ry(1)} />
      </g>
    );
  }

  const items: LabelItem[] = labels.map((l, i) => ({ id: `l${i}`, text: l.text, x: x(l.x + 0.5), y: y(at.get(l.x) ?? 0), priority: l.tone === 'signal' ? 3 : 1, tone: l.tone, gap: 6 }));
  const placed = placeLabels(items, { height });
  const plot = (
    <Plot>
      {count}
      {ratioLayer}
      <g data-layer={lens ? 'count' : undefined}><Annotation labels={placed} /></g>
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={ticks.map((t) => ({ x: x(t.x), label: t.label }))} />;
  // The needle stops above the bin under each scrub point: its count tower, and its column against the curve.
  const binAt = (px: number) => bins[Math.max(0, Math.min(bins.length - 1, Math.floor(px * (x1 - x0))))];
  const needleTops = scrub?.points.x.map((px) => y(binAt(px).n));
  const needleTopsAlt = ratioTop ? scrub?.points.x.map((px) => ratioTop!(binAt(px).x)) : undefined;
  return (
    <ChartFrame label={label} height={height} heightMd={heightMd} k={lens ? 'count' : undefined}
      lens={lens && lensControl ? <Lens label={lens.label} options={[{ value: 'count', label: lens.count }, { value: 'ratio', label: lens.ratio }]} defaultValue="count" /> : undefined}
      scrub={scrub ? <Scrubber points={{ ...scrub.points, y: scrub.points.y ?? needleTops, yAlt: scrub.points.yAlt ?? needleTopsAlt }} initial={scrub.initial} home={scrub.home} detents={scrub.detents} label={scrub.label} axis={axis}>{plot}</Scrubber> : undefined}
      plot={scrub ? undefined : plot} axis={scrub ? undefined : axis} readout={scrub ? undefined : readout}
      keys={[{ label: keyLabels.bin, mark: 'square', tone: 'quiet' }, ...(marks.length && keyLabels.mark ? [{ label: keyLabels.mark, mark: 'square' as const }] : []), ...(curve && keyLabels.curve ? [{ label: keyLabels.curve, mark: 'line' as const }] : [])]}
      values={values}
    />
  );
}
