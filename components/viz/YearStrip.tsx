import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, RefLine } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, REF_WIDTH, textWidth, type LabelItem, type PlacedLabel } from './labels';
import { extent, linear, pc, yScale } from './scale';

/**
 * A year strip (the redesign spec, section 3.6): one lollipop per edition on a time-scaled axis, so a year with no
 * edition in the data leaves its gap open (a faint band keyed "No edition in the data"), never closed up. The selected
 * year is signal, the extremes are labelled, the average is a dashed reference in the key. Scrub the years; the readout
 * gives each edition's values.
 */
export type YearPoint = { year: number; value: number; display: string; side?: string[] };

/** Whether a placed label's text box crosses a horizontal line at `lineY` (a plot fraction). */
function crosses(l: PlacedLabel, lineY: number, height: number): boolean {
  const size = l.size ?? 14;
  const base = l.y * height + l.dy;
  return base - size * 0.78 - 2 <= lineY * height && lineY * height <= base + size * 0.22 + 2 && textWidth(l.text, size) > 0;
}

/**
 * Year ticks at one regular step (every year up to a 4-year span, then 2, 4 and 5 years), on round years; the first and
 * last years join only when no round year falls inside the span, so the intervals never go irregular.
 */
export function yearTicks(first: number, last: number): number[] {
  const span = last - first;
  const step = span <= 4 ? 1 : span <= 8 ? 2 : span <= 16 ? 4 : 5;
  const out: number[] = [];
  for (let yr = Math.ceil(first / step) * step; yr <= last; yr += step) out.push(yr);
  return out.length >= 2 ? out : [...new Set([first, ...out, last])].sort((a, b) => a - b);
}

export default function YearStrip({ editions, selected, sideLabels = [], valueDomain, average, averageLabel = 'Average', label, values, height = 160, heightMd = 200, extremeLabel, labelSelected = true, named = [] }: {
  editions: YearPoint[]; selected?: number; sideLabels?: string[]; valueDomain?: [number, number]; average?: number; averageLabel?: string;
  label: string; values?: ReactNode; height?: number; heightMd?: number;
  /** The label on the highest and lowest editions ("2022 · 45%"). */
  extremeLabel?: (p: YearPoint) => string;
  /** Label the selected edition in the plot too; off where the readout above already names it. */
  labelSelected?: boolean;
  /** Years the sentence names: their labels are placed first, before the other extreme. */
  named?: number[];
}) {
  const sorted = [...editions].sort((a, b) => a.year - b.year);
  const first = sorted[0].year, last = sorted[sorted.length - 1].year;
  const x = linear([first - 0.6, last + 0.6]);
  const [lo, hi] = valueDomain ?? [0, extent(sorted.map((e) => e.value))[1]];
  const y = yScale(lo, hi, { top: 0.22 });
  const sel = sorted.findIndex((e) => e.year === selected);
  const maxI = sorted.reduce((b, e, i) => (e.value > sorted[b].value ? i : b), 0);
  const minI = sorted.reduce((b, e, i) => (e.value < sorted[b].value ? i : b), 0);
  // Interior years with no edition, grouped into runs.
  const have = new Set(sorted.map((e) => e.year));
  const gaps: { from: number; to: number }[] = [];
  for (let yr = first + 1; yr < last; yr++) {
    if (have.has(yr)) continue;
    const g = gaps[gaps.length - 1];
    if (g && g.to === yr - 1) g.to = yr; else gaps.push({ from: yr, to: yr });
  }
  const textOf = extremeLabel ?? ((p: YearPoint) => `${p.year}`);
  // A year the sentence names may sit low among taller neighbours: its label then rises above the tallest dot within its
  // width (at the narrowest phone) on a leader down to its own dot, so it is never lost between the stems.
  // The average's line, when it would run through the label, is cleared the same way (the leader crosses it instead).
  const lifted = (i: number) => {
    const half = (textWidth(textOf(sorted[i]), 13) / 2 + 8) / REF_WIDTH;
    const top = Math.min(y(sorted[i].value), ...sorted.filter((e) => Math.abs(x(e.year) - x(sorted[i].year)) < half).map((e) => y(e.value) - 6 / height));
    const avg = average !== undefined ? y(average) : null;
    return avg !== null && avg < top + 4 / height && avg > top - 26 / height ? Math.min(top, avg - 4 / height) : top;
  };
  const items: LabelItem[] = [...new Set([maxI, minI])].filter((i) => i !== sel || sel < 0).map((i) => {
    const isNamed = named.includes(sorted[i].year);
    return { id: `e${i}`, text: textOf(sorted[i]), x: x(sorted[i].year), y: isNamed ? lifted(i) : y(sorted[i].value), priority: isNamed ? 3 : 2, size: 13, gap: 9, prefer: isNamed ? 'above' as const : undefined };
  });
  if (sel >= 0 && labelSelected) items.push({ id: 'sel', text: textOf(sorted[sel]), x: x(sorted[sel].year), y: y(sorted[sel].value), priority: 4, tone: 'signal', gap: 9 });
  // Labels keep clear of the dots, the stems and the scrubber's needle, which runs the full height at the selected year;
  // of the average's dashed line too. A label with nowhere else to go may sit on that line, which then breaks under it
  // (a knockout halo), so the line never runs through the text.
  const avoid = sorted.map((e) => ({ x: x(e.year), y: y(e.value), r: 5 }));
  const boxes = [...sorted.map((e) => ({ x0: x(e.year), x1: x(e.year), y0: y(e.value), y1: 1, pad: 2 })), ...(sel >= 0 ? [{ x0: x(sorted[sel].year), x1: x(sorted[sel].year), y0: 0, y1: 1, pad: 4 }] : [])];
  const averageBox = average !== undefined ? { x0: 0, x1: 1, y0: y(average), y1: y(average), pad: 2 } : null;
  const place = (list: LabelItem[]) => {
    const clear = averageBox ? placeLabels(list, { height, avoid, boxes: [...boxes, averageBox] }) : null;
    return clear && clear.every((l) => l.minWidth !== null) ? clear
      : placeLabels(list, { height, avoid, boxes }).map((l) => (averageBox && l.minWidth !== null && crosses(l, y(average!), height) ? { ...l, knockout: true } : l));
  };
  let placed = place(items);
  // A named year whose full label has no room (beside the needle, say) keeps its year alone: the sentence gives the value.
  const short = placed.filter((l) => l.minWidth === null && l.priority === 3).map((l) => l.id);
  if (short.length) placed = place(items.map((it) => (short.includes(it.id) ? { ...it, text: String(sorted[Number(it.id.slice(1))].year) } : it)));
  const plot = (
    <Plot>
      {gaps.map((g) => <rect key={g.from} className="a-wash year-gap" x={pc(x(g.from - 0.5))} width={pc(x(g.to + 0.5) - x(g.from - 0.5))} y="0" height="100%" />)}
      {average !== undefined ? <RefLine y={y(average)} dashed /> : null}
      {sorted.map((e, i) => {
        const on = i === sel;
        const top = y(e.value);
        return (
          <g key={e.year}>
            <rect className={on ? 'm-signal is-reading' : 'm-context'} x={pc(x(e.year))} width={2} transform="translate(-1 0)" y={pc(top)} height={pc(1 - top)} />
            <circle className={on ? 'm-signal is-reading' : 'm-context'} cx={pc(x(e.year))} cy={pc(top)} r={4.5} />
          </g>
        );
      })}
      {placed.filter((l) => l.minWidth !== null && l.dy < 0).map((l) => {
        const i = Number(l.id.slice(1));
        const dotTop = y(sorted[i]?.value ?? 0) - 6 / height;
        const from = l.y + (l.dy + 3) / height;
        return l.id.startsWith('e') && named.includes(sorted[i]?.year) && dotTop - from > 4 / height
          ? <rect key={`ld-${l.id}`} className="leader" x={pc(l.x)} width={1} transform="translate(-0.5 0)" y={pc(from)} height={pc(dotTop - from)} /> : null;
      })}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={yearTicks(first, last).map((yr) => ({ x: x(yr), label: String(yr) }))} />;
  const points = {
    x: sorted.map((e) => x(e.year)),
    keys: sorted.map((e) => String(e.year)),
    values: sorted.map((e) => e.display),
    side: sideLabels.map((l, k) => ({ label: l, values: sorted.map((e) => e.side?.[k] ?? '—') })),
  };
  return (
    <ChartFrame className="year-strip" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={points} initial={sel >= 0 ? sel : maxI} detents={[...new Set([maxI, minI, ...(sel >= 0 ? [sel] : [])])]} label={label} axis={axis}>{plot}</Scrubber>}
      keys={[...(average !== undefined ? [{ label: averageLabel, mark: 'dash' as const }] : []), ...(gaps.length ? [{ label: 'No edition in the data', mark: 'band' as const }] : [])]}
      values={values}
    />
  );
}
