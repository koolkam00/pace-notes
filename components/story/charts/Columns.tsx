import type { CSSProperties, ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import { fitClass, textWidth } from '@/components/viz/labels';

/**
 * A few columns on a share or count axis (the redesign spec, section 3.6): at most 24 px wide with a 4 px rounded data
 * end, square at the baseline. The column the sentence names is signal, the rest ink or quiet. Each column carries its
 * value above it and its name under the axis, so nothing hides behind a tap. Plain HTML: each column is one element,
 * rounded only at its top, so no seam shows where a rounded end meets a square base.
 */
export type Column = { id: string; label: string; value: number; display: string; tone?: 'signal' | 'ink' | 'quiet' };

export default function Columns({ items, max, label, caption, values, height = 180, heightMd = 220 }: {
  items: Column[]; max: number; label: string; caption?: ReactNode; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const n = items.length;
  const slot = 1 / n;
  // The tallest column (at `max`) stops 16% under the top, leaving its value room above it.
  const share = (v: number) => Math.max(0, Math.min(1, v / (max || 1))) * 0.84;
  const plot = (
    <div className="cols-plot">
      {items.map((c, i) => (
        <div key={c.id} className="cols-slot" style={{ left: `${(i * slot * 100).toFixed(3)}%`, width: `${(slot * 100).toFixed(3)}%` } as CSSProperties}>
          {/* A value that would crowd its neighbours at 200% zoom steps out (it stays in Values). */}
          <span className={`cols-value${c.tone === 'signal' ? ' is-signal' : ''} ${fitClass((textWidth(c.display, 13) + 4) / slot)}`.trim()}>{c.display}</span>
          <span className={`cols-bar is-${c.tone ?? 'ink'}`} style={{ height: `${(share(c.value) * 100).toFixed(2)}%` }} />
        </div>
      ))}
      <span className="cols-base" />
    </div>
  );
  return (
    <ChartFrame className="columns" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={items.map((c, i) => ({ x: (i + 0.5) * slot, label: c.label, priority: c.tone === 'signal' ? 3 : 1 }))} />}
      caption={caption} values={values} />
  );
}
