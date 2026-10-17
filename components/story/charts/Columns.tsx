import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import { fitClass, textWidth, REF_WIDTH } from '@/components/viz/labels';
import { linear, pc } from '@/components/viz/scale';

/**
 * A few columns on a share or count axis (the redesign spec, section 3.6): at most 24 px wide with a 4 px rounded data
 * end, square at the baseline. The column the sentence names is signal, the rest ink or quiet. Each column carries its
 * value above it and its name under the axis, so nothing hides behind a tap. Server SVG.
 */
export type Column = { id: string; label: string; value: number; display: string; tone?: 'signal' | 'ink' | 'quiet' };

export default function Columns({ items, max, label, caption, values, height = 180, heightMd = 220 }: {
  items: Column[]; max: number; label: string; caption?: ReactNode; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const n = items.length;
  const slot = 1 / n;
  const y = linear([0, max], [1, 0.16]);
  // The column's width: 24 px or, on a narrow phone, what its slot leaves with a 6 px gap.
  const width = Math.min(24, REF_WIDTH * slot - 6);
  const plot = (
    <Plot>
      {items.map((c, i) => {
        const cx = (i + 0.5) * slot;
        const top = y(c.value);
        const h = Math.max(0, 1 - top);
        const cls = c.tone === 'signal' ? 'm-signal' : c.tone === 'quiet' ? 'm-quiet' : 'm-ink';
        return (
          <g key={c.id}>
            {h > 0 ? <rect className={`col ${cls}`} x={pc(cx)} transform={`translate(${-width / 2} 0)`} y={pc(top)} width={width} height={pc(h)} rx="4" /> : null}
            {h > 0 ? <rect className={`col ${cls}`} x={pc(cx)} transform={`translate(${-width / 2} 0)`} y={pc(top + h / 2)} width={width} height={pc(h / 2)} /> : null}
            <text className={`viz-label is-sm col-value${c.tone === 'signal' ? ' is-signal' : ''} ${fitClass((textWidth(c.display, 13) + 4) / slot)}`} x={pc(cx)} y={pc(top)} dy={-6} textAnchor="middle">{c.display}</text>
          </g>
        );
      })}
      <Baseline />
    </Plot>
  );
  return (
    <ChartFrame className="columns" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={items.map((c, i) => ({ x: (i + 0.5) * slot, label: c.label, priority: c.tone === 'signal' ? 3 : 1 }))} />}
      caption={caption} values={values} />
  );
}
