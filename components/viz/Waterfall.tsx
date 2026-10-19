import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Gridlines, RefLine } from './Plot';
import Annotation from './Annotation';
import { placeLabels, widthClass, type LabelItem } from './labels';
import { linear, pc, yScale } from './scale';

/**
 * A waterfall (the redesign spec, section 3.6): one bar per section building a gap from zero, each starting where the
 * last one ended, then the total. The section where the gap grew most is signal and labelled; the first bar is called
 * out too. Bars where the gap shrank are quiet. With `span` the sentence is about a stretch, not a bar: the stretch is
 * washed in signal from its first bar to the last, its share named at its top, and every bar is ink.
 */
export type WaterfallStep = { id: string; label: string; value: number; display: string };

export default function Waterfall({ steps, total, yTicks = [], xTicks, label, values, focus, span, height = 200, heightMd = 250 }: {
  steps: WaterfallStep[]; total: { label: string; display: string }; yTicks?: { value: number; label: string }[]; label: string; values?: ReactNode; height?: number; heightMd?: number;
  /** The step the sentence is about, when it is not the largest (e.g. the most per mile); signal and labelled first. */
  focus?: number;
  /** The stretch the sentence is about, from step `from` to the last step ("After 20K 66%"): washed, its text at its top. */
  span?: { from: number; text: string };
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
  const big = focus !== undefined && steps[focus] ? focus : steps.reduce((b, s, i) => (s.value > steps[b].value ? i : b), 0);
  const washed = span && span.from > 0 && span.from < steps.length ? span : undefined;
  const bars = steps.map((s, i) => {
    const from = i ? ends[i - 1] : 0, to = ends[i];
    return { s, i, top: y(Math.max(from, to)), bottom: y(Math.min(from, to)) };
  });
  // Three steps or fewer: every block carries its value, so none reads as missing. More: the signal and the first.
  const every = steps.length <= 3;
  const items: LabelItem[] = [
    ...(washed ? [{ id: 'span', text: washed.text, x: x(washed.from), y: 0.02, priority: 4, prefer: 'right', tone: 'signal', gap: 8 } as LabelItem] : []),
    // Over a washed stretch every bar is ink, so the largest step's label stands a little higher on a leader down to its
    // own bar: a label wider than the bars never reads as its neighbour's.
    { id: 'big', text: `${steps[big].label} ${steps[big].display}`, x: x(big + 0.5), y: bars[big].top, priority: 3, tone: washed ? 'ink' : 'signal', gap: washed ? 16 : 8, ...(washed ? { prefer: 'above' as const, only: 'above' as const } : {}) },
    ...steps.flatMap((s, i) => (i !== big && (every || i === 0) ? [{ id: i === 0 ? 'first' : `s${i}`, text: `${s.label} ${s.display}`, x: x(i + 0.5), y: bars[i].top, priority: 2, size: 13, gap: 8 } as LabelItem] : [])),
    // Over a washed stretch the sentence names the stretch and the total ("66% of the 4:51 gap"), so the total's value
    // outranks the largest step's label: both of the sentence's numbers are drawn.
    { id: 'total', text: total.display, x: x(n - 0.5), y: y(Math.max(0, ends[ends.length - 1])), priority: washed ? 3.5 : 2, size: 13, gap: 8 },
  ];
  const placed = placeLabels(items, { height, boxes: [...bars.map((b) => ({ x0: x(b.i + 0.18), x1: x(b.i + 0.82), y0: b.top, y1: b.bottom })), { x0: x(n - 1 + 0.18), x1: x(n - 1 + 0.82), y0: Math.min(y(0), y(ends[ends.length - 1])), y1: Math.max(y(0), y(ends[ends.length - 1])) }] });
  const plot = (
    <Plot>
      {washed ? <rect className="a-signal" x={pc(x(washed.from))} width={pc(x(steps.length) - x(washed.from))} y="0" height="100%" /> : null}
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label }))} side="right" />
      {bars.map(({ s, i, top, bottom }) => (
        <rect key={s.id} className={i === big && !washed ? 'm-signal' : s.value >= 0 ? 'm-ink' : 'm-quiet'} x={pc(x(i + 0.18))} width={pc(x(0.64) - x(0))} y={pc(top)} height={pc(Math.max(0.004, bottom - top))} rx={2} />
      ))}
      <rect className="m-ink waterfall-total" x={pc(x(n - 1 + 0.18))} width={pc(x(0.64) - x(0))} y={pc(Math.min(y(0), y(ends[ends.length - 1])))} height={pc(Math.abs(y(0) - y(ends[ends.length - 1])))} rx={2} />
      <RefLine y={y(0)} />
      {washed ? placed.filter((l) => l.id === 'big' && l.minWidth !== null && l.dy < 0).map((l) => {
        const from = l.y + (l.dy + 3) / height, to = bars[big].top - 3 / height;
        return to > from ? <rect key="leader" className={`leader ${widthClass(l.minWidth)}`.trim()} x={pc(x(big + 0.5))} width={1} transform="translate(-0.5 0)" y={pc(from)} height={pc(to - from)} /> : null;
      }) : null}
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
