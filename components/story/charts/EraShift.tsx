import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot from '@/components/viz/Plot';
import { REF_WIDTH } from '@/components/viz/labels';
import { linear, pc } from '@/components/viz/scale';

/**
 * How the front and the back of the field moved between two eras (the redesign spec, section 7.3, #front): one row per
 * percentile, one dot per course at its change in minutes, a zero line for "no change" below the row's name, and the
 * row's average as a bar, its value beside the name. The row the sentence is about carries the signal average; the
 * other row stays ink and quiet.
 */
export type ShiftRow = { id: string; label: string; values: { id: string; v: number }[]; mean: number; display: string; tone: 'signal' | 'ink' };

const R = 4.5;
const STEP = 10;
const ROW_HEAD = 26;

function stack(xs: number[]): number[] {
  const placed: { px: number; level: number }[] = [];
  return xs.map((x) => {
    const px = x * REF_WIDTH;
    let level = 0;
    while (placed.some((p) => p.level === level && Math.abs(p.px - px) < R * 2 + 1)) level++;
    placed.push({ px, level });
    return level;
  });
}

export default function EraShift({ rows, domain, ticks, label, axisTitle, values }: {
  rows: ShiftRow[]; domain: [number, number]; ticks: { value: number; label: string }[]; label: string; axisTitle?: { start?: string; end?: string }; values?: ReactNode;
}) {
  const x = linear(domain);
  const stacks = rows.map((r) => {
    const order = [...r.values].sort((a, b) => a.v - b.v);
    const lv = stack(order.map((p) => x(p.v)));
    return { order, lv, depth: Math.max(0, ...lv) + 1 };
  });
  const rowH = stacks.map((s) => ROW_HEAD + s.depth * STEP + 10);
  const height = rowH.reduce((a, b) => a + b, 0) + 8;
  let y0 = 8;
  const plot = (
    <Plot>
      {rows.map((r, k) => {
        const top = y0;
        y0 += rowH[k];
        const base = top + rowH[k] - 10;
        const { order, lv } = stacks[k];
        const meanX = x(r.mean);
        return (
          <g key={r.id} className="era-row">
            <text className="viz-label is-sm era-row-label" x="0" y={top + 14}>{r.label} <tspan className={r.tone === 'signal' ? 'era-mean-text is-signal' : 'era-mean-text'}>{r.display}</tspan></text>
            <rect className="grid-line" x="0" width="100%" y={base + R + 3} height="1" />
            <line className="ref-line" x1={pc(x(0))} x2={pc(x(0))} y1={top + ROW_HEAD - 6} y2={base + R + 3} />
            {order.map((p, i) => <circle key={p.id} className={r.tone === 'signal' ? 'm-ink' : 'm-context'} cx={pc(x(p.v))} cy={base - lv[i] * STEP} r={R} />)}
            <rect className={r.tone === 'signal' ? 'era-mean is-signal' : 'era-mean'} x={pc(meanX)} width="3" transform="translate(-1.5 0)" y={top + ROW_HEAD - 6} height={base + R - (top + ROW_HEAD - 6)} />
          </g>
        );
      })}
    </Plot>
  );
  return (
    <ChartFrame className="era-shift" label={label} height={height} heightMd={height} plot={plot}
      axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} title={axisTitle} />}
      keys={[{ label: 'One course', mark: 'dot' }, { label: 'Average change', mark: 'line', tone: 'signal' }]}
      values={values} />
  );
}
