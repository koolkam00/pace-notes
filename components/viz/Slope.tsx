import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Plot from './Plot';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { extent, pc, yScale } from './scale';

/**
 * A slope chart (the redesign spec, section 3.6, calmed under section 00): each item's first and last value as two dots
 * joined by a line. The biggest movers (three by default) are drawn in ink and named at both ends; every other item is
 * quiet context, so the chart reads as three stories over a field rather than a hairball. The column names sit on top.
 * The sentence above says how many rose ("rose in N of M cities").
 */
export type SlopeItem = { id: string; label: string; from: number; to: number };

const LEFT = 0.14, RIGHT = 0.56, TOP = 0.12;

export default function Slope({ items, fromLabel, toLabel, format, labelCount = 3, noun = 'item', label, values, height = 240, heightMd = 300 }: {
  items: SlopeItem[]; fromLabel: string; toLabel: string; format: (v: number) => string; labelCount?: number;
  /** What one item is, for the key ("Every other city"). */
  noun?: string;
  label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const [lo, hi] = extent(items.flatMap((i) => [i.from, i.to]));
  const pad = (hi - lo) * 0.06;
  const y = yScale(lo - pad, hi + pad, { top: TOP + 0.04, bottom: 0.04 });
  const movers = [...items].sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, labelCount);
  const named = new Set(movers.map((m) => m.id));
  const lab: LabelItem[] = movers.flatMap((m, i) => [
    { id: `${m.id}-to`, text: `${m.label} ${format(m.to)}`, x: RIGHT, y: y(m.to), priority: 3 - i * 0.1, size: 13, prefer: 'right' as const, gap: 10 },
    { id: `${m.id}-from`, text: format(m.from), x: LEFT, y: y(m.from), priority: 2 - i * 0.1, size: 13, prefer: 'left' as const, gap: 10 },
  ]);
  const avoid = items.flatMap((it) => [{ x: LEFT, y: y(it.from), r: 3 }, { x: RIGHT, y: y(it.to), r: 3 }]);
  const placed = placeLabels(lab, { height, avoid });
  const ordered = [...items].sort((a, b) => Number(named.has(a.id)) - Number(named.has(b.id)));
  const plot = (
    <Plot>
      <text className="tick slope-head" x={pc(LEFT)} y="0" dy={12} textAnchor="middle">{fromLabel}</text>
      <text className="tick slope-head" x={pc(RIGHT)} y="0" dy={12} textAnchor="middle">{toLabel}</text>
      {ordered.map((it) => {
        const on = named.has(it.id);
        return (
          <g key={it.id} className={on ? 'slope-named' : 'slope-quiet'}>
            <line className="slope-line" x1={pc(LEFT)} x2={pc(RIGHT)} y1={pc(y(it.from))} y2={pc(y(it.to))} />
            <circle className={on ? 'm-ink' : 'm-context'} cx={pc(LEFT)} cy={pc(y(it.from))} r={on ? 4 : 2.5} />
            <circle className={on ? 'm-ink' : 'm-context'} cx={pc(RIGHT)} cy={pc(y(it.to))} r={on ? 4 : 2.5} />
          </g>
        );
      })}
      <Annotation labels={placed} />
    </Plot>
  );
  return (
    <ChartFrame className="slope" label={label} height={height} heightMd={heightMd} plot={plot}
      keys={[{ label: `The ${movers.length} biggest changes`, mark: 'dot' }, { label: `Every other ${noun}`, mark: 'dot', tone: 'quiet' }]}
      values={values}
    />
  );
}
