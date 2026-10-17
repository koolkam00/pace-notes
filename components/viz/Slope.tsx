import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot from './Plot';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { extent, pc, yScale } from './scale';

/**
 * A slope chart (the redesign spec, section 3.6): each item's first and last value as two dots joined by a 1.5 px line;
 * rising items in ink, falling ones quiet; the biggest movers labelled on the right. The sentence above says how many
 * rose ("rose in N of M cities").
 */
export type SlopeItem = { id: string; label: string; from: number; to: number };

const LEFT = 0.1, RIGHT = 0.56;

export default function Slope({ items, fromLabel, toLabel, format, labelCount = 3, label, values, height = 240, heightMd = 300 }: {
  items: SlopeItem[]; fromLabel: string; toLabel: string; format: (v: number) => string; labelCount?: number; label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const [lo, hi] = extent(items.flatMap((i) => [i.from, i.to]));
  const pad = (hi - lo) * 0.08;
  const y = yScale(lo - pad, hi + pad, { top: 0.06, bottom: 0.04 });
  const movers = [...items].sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, labelCount);
  const named = new Set(movers.map((m) => m.id));
  const lab: LabelItem[] = movers.map((m, i) => ({ id: m.id, text: `${m.label} ${format(m.to)}`, x: RIGHT, y: y(m.to), priority: 3 - i * 0.1, size: 13, prefer: 'right', gap: 10 }));
  const placed = placeLabels(lab, { height });
  const plot = (
    <Plot>
      {items.map((it) => {
        const up = it.to > it.from;
        return (
          <g key={it.id} className={up ? 'slope-up' : 'slope-down'}>
            <line className={named.has(it.id) ? 'slope-line is-named' : 'slope-line'} x1={pc(LEFT)} x2={pc(RIGHT)} y1={pc(y(it.from))} y2={pc(y(it.to))} />
            <circle className={up ? 'm-ink' : 'm-context'} cx={pc(LEFT)} cy={pc(y(it.from))} r={3.5} />
            <circle className={up ? 'm-ink' : 'm-context'} cx={pc(RIGHT)} cy={pc(y(it.to))} r={3.5} />
          </g>
        );
      })}
      <Annotation labels={placed} />
    </Plot>
  );
  return (
    <ChartFrame className="slope" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={[{ x: LEFT, label: fromLabel, priority: 2 }, { x: RIGHT, label: toLabel, priority: 2 }]} />}
      keys={[{ label: 'Rose', mark: 'dot' }, { label: 'Fell', mark: 'dot', tone: 'quiet' }]}
      values={values}
    />
  );
}
