import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Gridlines, RefLine } from './Plot';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { linear, pc, yScale } from './scale';

/**
 * A waterfall (the redesign spec, section 3.6): one bar per section building a gap from zero, each starting where the
 * last one ended, then the total. The section where the gap grew most is signal and labelled; the first bar is called
 * out too. Bars where the gap shrank are quiet.
 */
export type WaterfallStep = { id: string; label: string; value: number; display: string };

export default function Waterfall({ steps, total, yTicks = [], xTicks, label, values, height = 200, heightMd = 250 }: {
  steps: WaterfallStep[]; total: { label: string; display: string }; yTicks?: { value: number; label: string }[]; label: string; values?: ReactNode; height?: number; heightMd?: number;
  /**
   * Axis labels in bar units (0 is the first bar's left edge, `steps.length` the last one's right edge), e.g. the mats
   * between sections, evenly spaced. By default every bar is named under its centre and the total under its own.
   */
  xTicks?: { at: number; label: string }[];
}) {
  const ends: number[] = [];
  steps.reduce((sum, s) => { ends.push(sum + s.value); return sum + s.value; }, 0);
  const lo = Math.min(0, ...ends), hi = Math.max(0, ...ends);
  const y = yScale(lo, hi, { top: 0.2, bottom: 0.02 });
  const n = steps.length + 1;
  const x = linear([0, n]);
  const big = steps.reduce((b, s, i) => (s.value > steps[b].value ? i : b), 0);
  const bars = steps.map((s, i) => {
    const from = i ? ends[i - 1] : 0, to = ends[i];
    return { s, i, top: y(Math.max(from, to)), bottom: y(Math.min(from, to)) };
  });
  const items: LabelItem[] = [
    { id: 'big', text: `${steps[big].label} ${steps[big].display}`, x: x(big + 0.5), y: bars[big].top, priority: 3, tone: 'signal', gap: 8 },
    ...(big !== 0 ? [{ id: 'first', text: `${steps[0].label} ${steps[0].display}`, x: x(0.5), y: bars[0].top, priority: 2, size: 13, gap: 8 } as LabelItem] : []),
    { id: 'total', text: total.display, x: x(n - 0.5), y: y(Math.max(0, ends[ends.length - 1])), priority: 2, size: 13, gap: 8 },
  ];
  const placed = placeLabels(items, { height, boxes: [...bars.map((b) => ({ x0: x(b.i + 0.18), x1: x(b.i + 0.82), y0: b.top, y1: b.bottom })), { x0: x(n - 1 + 0.18), x1: x(n - 1 + 0.82), y0: Math.min(y(0), y(ends[ends.length - 1])), y1: Math.max(y(0), y(ends[ends.length - 1])) }] });
  const plot = (
    <Plot>
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label }))} side="right" />
      {bars.map(({ s, i, top, bottom }) => (
        <rect key={s.id} className={i === big ? 'm-signal' : s.value >= 0 ? 'm-ink' : 'm-quiet'} x={pc(x(i + 0.18))} width={pc(x(0.64) - x(0))} y={pc(top)} height={pc(Math.max(0.004, bottom - top))} rx={2} />
      ))}
      <rect className="m-ink waterfall-total" x={pc(x(n - 1 + 0.18))} width={pc(x(0.64) - x(0))} y={pc(Math.min(y(0), y(ends[ends.length - 1])))} height={pc(Math.abs(y(0) - y(ends[ends.length - 1])))} rx={2} />
      <RefLine y={y(0)} />
      <Annotation labels={placed} />
    </Plot>
  );
  return (
    <ChartFrame className="waterfall" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={xTicks ? [...xTicks.map((t) => ({ x: x(t.at), label: t.label, priority: 2 })), { x: x(n - 0.5), label: total.label, priority: 3 }]
        : [...steps.map((s, i) => ({ x: x(i + 0.5), label: s.label, priority: i === big ? 3 : 1 })), { x: x(n - 0.5), label: total.label, priority: 2 }]} />}
      values={values}
    />
  );
}
