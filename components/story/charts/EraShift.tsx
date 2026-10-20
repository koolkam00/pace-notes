import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot from '@/components/viz/Plot';
import { REF_WIDTH } from '@/components/viz/labels';
import { linear, pc } from '@/components/viz/scale';

/**
 * How the front and the back of the field moved between two eras (the redesign spec, section 7.3, #front): one row per
 * percentile, one dot per course at its change in minutes, a zero line for "no change" below the row's name, and the
 * row's average as a bar, its value beside the name, so no key is needed. The row the sentence is about has ink
 * dots and the signal average; the other row's dots and average stay quiet.
 */
export type ShiftRow = { id: string; label: string; values: { id: string; v: number }[]; mean: number; display: string; tone: 'signal' | 'ink' };

/** Dot radius, stack step and the plot width each size is laid out at: phone dots, and from 900 px larger dots across
 *  the story's measure (round 6: 4.5 px dots on a 640 px line read as specks), the same picture stacked alike. */
const SIZES = { phone: { r: 4.5, step: 10, width: REF_WIDTH }, wide: { r: 7, step: 16, width: 576 } } as const;
const ROW_HEAD = 26;

function stack(xs: number[], { r, width }: { r: number; width: number }): number[] {
  const placed: { px: number; level: number }[] = [];
  return xs.map((x) => {
    const px = x * width;
    let level = 0;
    while (placed.some((p) => p.level === level && Math.abs(p.px - px) < r * 2 + 1)) level++;
    placed.push({ px, level });
    return level;
  });
}

export default function EraShift({ rows, domain, ticks, label, axisTitle, values }: {
  rows: ShiftRow[]; domain: [number, number]; ticks: { value: number; label: string }[]; label: string; axisTitle?: { start?: string; end?: string }; values?: ReactNode;
}) {
  const x = linear(domain);
  const layout = (size: keyof typeof SIZES) => {
    const { r, step } = SIZES[size];
    const stacks = rows.map((row) => {
      const order = [...row.values].sort((a, b) => a.v - b.v);
      const lv = stack(order.map((p) => x(p.v)), SIZES[size]);
      return { order, lv, depth: Math.max(0, ...lv) + 1 };
    });
    const rowH = stacks.map((st) => ROW_HEAD + st.depth * step + r + 6);
    return { r, step, stacks, rowH, height: rowH.reduce((a, b) => a + b, 0) + 8 };
  };
  const phone = layout('phone'), wide = layout('wide');
  const draw = (size: keyof typeof SIZES, { r, step, stacks, rowH }: ReturnType<typeof layout>) => {
    let y0 = 8;
    return (
      <g className={`es-${size}`}>
        {rows.map((row, k) => {
          const top = y0;
          y0 += rowH[k];
          const base = top + rowH[k] - r - 6;
          const { order, lv } = stacks[k];
          const meanX = x(row.mean);
          return (
            <g key={row.id} className="era-row">
              <text className="viz-label is-sm era-row-label" x="0" y={top + 14}>{row.label} <tspan className={row.tone === 'signal' ? 'era-mean-text is-signal' : 'era-mean-text'}>{row.display}</tspan></text>
              <rect className="grid-line" x="0" width="100%" y={base + r + 3} height="1" />
              <line className="ref-line" x1={pc(x(0))} x2={pc(x(0))} y1={top + ROW_HEAD - 6} y2={base + r + 3} />
              {order.map((p, i) => <circle key={p.id} className={row.tone === 'signal' ? 'm-ink' : 'm-context'} cx={pc(x(p.v))} cy={base - lv[i] * step} r={r} />)}
              <rect className={row.tone === 'signal' ? 'era-mean is-signal' : 'era-mean'} x={pc(meanX)} width="3" transform="translate(-1.5 0)" y={top + ROW_HEAD - 6} height={base + r - (top + ROW_HEAD - 6)} />
            </g>
          );
        })}
      </g>
    );
  };
  const plot = (
    <Plot>
      {draw('phone', phone)}
      {draw('wide', wide)}
    </Plot>
  );
  return (
    <ChartFrame className="era-shift" label={label} height={phone.height} heightMd={wide.height} plot={plot}
      axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} title={axisTitle} />}
      values={values} />
  );
}
