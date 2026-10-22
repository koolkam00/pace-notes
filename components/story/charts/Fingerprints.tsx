import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline, RefLine } from '@/components/viz/Plot';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, type LabelItem } from '@/components/viz/labels';
import { linear, linePath, pc, yScale } from '@/components/viz/scale';

/**
 * Every course's pacing shape at once (the redesign spec, section 7.10, #fingerprint, under section 00): each course's
 * section pace against its own average as a quiet line and the typical course in ink. The courses whose slowest 5K is
 * the section the sentence names are one signal bracket over that column, with its one label; the courses whose slowest
 * 5K fell elsewhere are ink dots named beside them (the key names them). Up is slower, said once at
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
  // The courses whose slowest 5K is the common section are one bracket over that column (round 4: 25 orange dots
  // stacked there crowded the one place the eye should rest), labelled once; the others stay ink dots, named.
  const on = dots.filter((d) => d.on);
  const bracket = on.length ? { x: on[0].x, y0: Math.min(...on.map((d) => d.y)), y1: Math.max(...on.map((d) => d.y)) } : null;
  // Dots sharing a column stack their names: the top one above, the bottom one below, any between to the left (October
  // 21, 2026: Auckland's dot sat 0.9 points over Helsinki's at 30–35K, and with both on the left one was dropped).
  const off = dots.filter((d) => !d.on);
  const side = (d: (typeof off)[number]) => {
    const column = off.filter((o) => o.k === d.k).sort((a, b) => a.y - b.y);
    return column.length < 2 ? 'left' as const : column[0] === d ? 'above' as const : column[column.length - 1] === d ? 'below' as const : 'left' as const;
  };
  const items: LabelItem[] = [
    ...(bracket ? [{ id: 'common', text: commonLabel, x: bracket.x, y: bracket.y0, priority: 3, tone: 'signal' as const, prefer: 'above' as const }] : []),
    ...off.map((d) => ({ id: d.id, text: d.label, x: d.x, y: d.y, priority: 2, tone: 'ink' as const, size: 13, prefer: side(d) })),
  ];
  // The direction cue sits at the top left, so no label is placed over it.
  const cue = [0.02, 0.06, 0.1].map((cx) => ({ x: cx, y: 8 / height, r: 8 }));
  const avoid = [...off.map((d) => ({ x: d.x, y: d.y, r: 5 })), ...typical.map((v, i) => ({ x: sx(x[i]), y: y(v), r: 3 })), ...cue,
    ...(bracket ? [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: bracket.x, y: bracket.y0 + f * (bracket.y1 - bracket.y0), r: 6 })) : [])];
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
      {off.map((d) => <circle key={d.id} className="m-ink fp-dot" cx={pc(d.x)} cy={pc(d.y)} r={4} />)}
      {bracket ? (
        <g className="fp-bracket">
          <rect className="m-signal" x={pc(bracket.x)} y={pc(bracket.y0)} width={2} height={pc(Math.max(0, bracket.y1 - bracket.y0))} transform="translate(-1 0)" />
          <rect className="m-signal" x={pc(bracket.x)} y={pc(bracket.y0)} width={10} height={2} transform="translate(-5 -1)" />
          <rect className="m-signal" x={pc(bracket.x)} y={pc(bracket.y1)} width={10} height={2} transform="translate(-5 -1)" />
        </g>
      ) : null}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  return (
    <ChartFrame className="fingerprints" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={xTicks.map((t) => ({ x: sx(t.value), label: t.label }))} />}
      keys={[{ label: 'Typical course', mark: 'line' }, { label: 'Each course', mark: 'line', tone: 'quiet' },
        ...(off.length ? [{ label: 'Slowest 5K elsewhere', mark: 'dot' as const }] : [])]}
      values={values} />
  );
}
