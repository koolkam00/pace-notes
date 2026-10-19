import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline, RefLine } from '@/components/viz/Plot';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, type LabelItem } from '@/components/viz/labels';
import { linear, linePath, pc, yScale } from '@/components/viz/scale';

/**
 * Every course's pacing shape at once (the redesign spec, section 7.10, #fingerprint, under section 00): each course's
 * section pace against its own average as a quiet line, the typical course in ink, and each course's slowest 5K as a dot.
 * The dots of the section the sentence names are signal and that column carries its one label; the courses whose
 * slowest 5K fell elsewhere are ink dots named beside them (the key says which is which). Up is slower, said once at
 * the top left ("slower ↑"). No lens: the claim is read from the figure at a glance.
 */
export type Fingerprint = { id: string; label: string; curve: number[] };

export default function Fingerprints({ x, xDomain, courses, typical, common, commonLabel, xTicks, label, values, height = 260, heightMd = 320 }: {
  x: number[]; xDomain: [number, number]; courses: Fingerprint[]; typical: number[];
  /** The section index most courses peak in, and its label ("35–40K · 25 courses"). */
  common: number; commonLabel: string;
  xTicks: { value: number; label: string }[]; label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const sx = linear(xDomain);
  const all = [...typical, ...courses.flatMap((c) => c.curve), 0];
  const lo = Math.floor(Math.min(...all)) - 1, hi = Math.ceil(Math.max(...all)) + 1;
  const y = yScale(lo, hi, { top: 0.14, bottom: 0.04 });
  const peakOf = (curve: number[]) => curve.indexOf(Math.max(...curve));
  const peaks = courses.map((c) => ({ c, k: peakOf(c.curve) }));
  const dots = peaks.map(({ c, k }) => ({ id: c.id, label: c.label, k, x: sx(x[k]), y: y(c.curve[k]), on: k === common }));
  const top = dots.filter((d) => d.on).reduce((a, b) => (b.y < a.y ? b : a), dots.find((d) => d.on) ?? dots[0]);
  const items: LabelItem[] = [
    ...(top ? [{ id: 'common', text: commonLabel, x: top.x, y: top.y, priority: 3, tone: 'signal' as const, prefer: 'above' as const }] : []),
    ...dots.filter((d) => !d.on).map((d) => ({ id: d.id, text: d.label, x: d.x, y: d.y, priority: 2, tone: 'ink' as const, size: 13, prefer: 'left' as const })),
  ];
  // The direction cue sits at the top left, so no label is placed over it.
  const cue = [0.02, 0.06, 0.1].map((cx) => ({ x: cx, y: 8 / height, r: 8 }));
  const avoid = [...dots.map((d) => ({ x: d.x, y: d.y, r: 5 })), ...typical.map((v, i) => ({ x: sx(x[i]), y: y(v), r: 3 })), ...cue];
  const placed = placeLabels(items, { height, avoid });
  const pts = (values: number[]) => values.map((v, i) => [sx(x[i]), y(v)] as [number, number]);
  const plot = (
    <Plot>
      {/* Over the line on the left, where every course still runs under its own average. */}
      <RefLine y={y(0)} label="Own average pace" at={0.1} />
      <text className="tick" x="0" y="0" dy={13}>slower ↑</text>
      <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
        {courses.map((c) => <path key={c.id} className="l-faint" d={linePath(pts(c.curve))} />)}
        <path className="l-ink" d={linePath(pts(typical))} />
      </svg>
      {dots.filter((d) => !d.on).map((d) => <circle key={d.id} className="m-ink fp-dot" cx={pc(d.x)} cy={pc(d.y)} r={4} />)}
      {dots.filter((d) => d.on).map((d) => <circle key={d.id} className="m-signal fp-dot" cx={pc(d.x)} cy={pc(d.y)} r={4} />)}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  return (
    <ChartFrame className="fingerprints" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={xTicks.map((t) => ({ x: sx(t.value), label: t.label }))} />}
      keys={[{ label: 'Typical course', mark: 'line' }, { label: 'Each course', mark: 'line', tone: 'quiet' }, { label: 'Its slowest 5K', mark: 'dot', tone: 'signal' },
        ...(dots.some((d) => !d.on) ? [{ label: 'Slowest 5K elsewhere', mark: 'dot' as const }] : [])]}
      values={values} />
  );
}
