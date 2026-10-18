import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, RefLine } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placedBox, placeLabels, REF_WIDTH, textWidth, widthClass, type LabelItem, type PlacedLabel } from './labels';
import { extent, linear, pc, yScale } from './scale';

/**
 * A year strip (the redesign spec, section 3.6): one lollipop per edition on a time-scaled axis, so a year with no
 * edition in the data leaves its gap open (no stem), never closed up and never washed (a band would read as a
 * highlight). The editions are the scrubber's only points: dragged, the needle steps from edition to edition across a
 * gap, which stays in view but is never read out. Every stem is quiet: the scrubber's needle is the one signal mark, on
 * the edition the readout names.
 * The years it labels (by default the highest and lowest) keep one label format, lifted on a leader where neighbours
 * crowd them; the label under the needle hides, since the readout says it. The average is a dashed reference in the key.
 */
export type YearPoint = { year: number; value: number; display: string; side?: string[] };

/** The wide plot a label with no room at the narrowest phone is placed on instead, shown from this width up. */
const WIDE = 600;

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

/**
 * The years either side of the first and last editions on a time-scaled axis: 0.6 of a year, or, where the first or
 * last year is a tick, enough for its label to sit centred under it at the narrowest phone.
 */
export function yearPad(first: number, last: number): number {
  const ticks = yearTicks(first, last);
  if (!ticks.includes(first) && !ticks.includes(last)) return 0.6;
  const half = textWidth('2000', 12, 500) / 2 + 2;
  return Math.max(0.6, (half * (last - first)) / (REF_WIDTH - 2 * half));
}

type LayoutProps = { editions: YearPoint[]; selected?: number; valueDomain?: [number, number]; average?: number; height: number; extremeLabel?: (p: YearPoint) => string; labelled?: number[] };

/** The strip's scales, scrub points and placed labels (shared by the chart and stripLabels). */
function layout({ editions, selected, valueDomain, average, height, extremeLabel, labelled }: LayoutProps) {
  const sorted = [...editions].sort((a, b) => a.year - b.year);
  const first = sorted[0].year, last = sorted[sorted.length - 1].year;
  const pad = yearPad(first, last);
  const x = linear([first - pad, last + pad]);
  const [lo, hi] = valueDomain ?? [0, extent(sorted.map((e) => e.value))[1]];
  const y = yScale(lo, hi, { top: 0.22 });
  const maxI = sorted.reduce((b, e, i) => (e.value > sorted[b].value ? i : b), 0);
  const minI = sorted.reduce((b, e, i) => (e.value < sorted[b].value ? i : b), 0);
  const sel = Math.max(0, sorted.findIndex((e) => e.year === selected));
  // The editions are the scrub points (a gap year is never one): the needle snaps edition to edition.
  const scrubOf = (year: number) => sorted.findIndex((e) => e.year === year);
  const textOf = extremeLabel ?? ((p: YearPoint) => `${p.year}`);
  const named = new Set(labelled ?? [sorted[maxI].year, sorted[minI].year]);
  // A labelled year may sit low among taller neighbours: its label then rises above the tallest dot within its width (at
  // the narrowest phone) on a leader down to its own dot, so it is never lost between the stems. The average's line,
  // when it would run through the label, is cleared the same way (the leader crosses it instead).
  const lifted = (i: number) => {
    const half = (textWidth(textOf(sorted[i]), 13) / 2 + 8) / REF_WIDTH;
    const top = Math.min(y(sorted[i].value), ...sorted.filter((e, j) => j !== i && Math.abs(x(e.year) - x(sorted[i].year)) < half).map((e) => y(e.value) - 6 / height));
    const avg = average !== undefined ? y(average) : null;
    const raised = avg !== null && avg < top + 4 / height && avg > top - 26 / height ? Math.min(top, avg - 4 / height) : top;
    // Never so high that the text's full line box (a font's ascent, not just its figures) leaves the plot.
    return Math.max(raised, (9 + 13) / height);
  };
  const itemOf = (i: number): LabelItem => ({ id: `e${i}`, text: textOf(sorted[i]), x: x(sorted[i].year), y: lifted(i), priority: i === sel ? 2 : 3, size: 13, gap: 9, prefer: 'above', only: 'above', at: scrubOf(sorted[i].year), under: i === sel });
  const items = sorted.map((e, i) => (named.has(e.year) ? i : -1)).filter((i) => i >= 0).map(itemOf);
  // Labels keep clear of the dots and the stems, and every label but the one it sits on keeps clear of the needle where
  // the strip opens (that one hides there). Of the average's dashed line too; a label with nowhere else to go may sit on
  // that line, which then breaks under it (a knockout halo), so the line never runs through the text.
  const avoid = sorted.map((e) => ({ x: x(e.year), y: y(e.value), r: 5 }));
  const stems = sorted.map((e) => ({ x0: x(e.year), x1: x(e.year), y0: y(e.value), y1: 1, pad: 2 }));
  const needle = { x0: x(sorted[sel].year), x1: x(sorted[sel].year), y0: 0, y1: 1, pad: 4 };
  const averageBox = average !== undefined ? { x0: 0, x1: 1, y0: y(average), y1: y(average), pad: 2 } : null;
  const place = (list: LabelItem[], boxes: { x0: number; x1: number; y0: number; y1: number; pad?: number }[], width?: number) => {
    const clear = averageBox ? placeLabels(list, { height, width, avoid, boxes: [...boxes, averageBox] }) : null;
    return clear && clear.every((l) => l.minWidth !== null) ? clear
      : placeLabels(list, { height, width, avoid, boxes }).map((l) => (averageBox && l.minWidth !== null && crosses(l, y(average!), height) ? { ...l, knockout: true } : l));
  };
  const own = place(items.filter((it) => it.under), stems);
  const taken = [...stems, needle, ...own.filter((l) => l.minWidth !== null).map((l) => placedBox(l, height))];
  const narrow = place(items.filter((it) => !it.under), taken);
  // A label with no room at the narrowest phone tries again on a wide plot and shows from that width up (gaps only grow
  // with the width, so a spot clear there is clear wider).
  const dropped = items.filter((it) => narrow.some((l) => l.id === it.id && l.minWidth === null));
  const wide = dropped.length ? place(dropped, [...taken, ...narrow.filter((l) => l.minWidth !== null).map((l) => placedBox(l, height))], WIDE).map((l) => (l.minWidth === null ? l : { ...l, minWidth: WIDE })) : [];
  const placed = [...own, ...narrow.map((l) => wide.find((w) => w.id === l.id) ?? l)];
  return { sorted, first, last, x, y, maxI, minI, sel, scrubOf, placed };
}

/**
 * Where each labelled year's label lands for a given opening edition: its year and the narrowest plot width it shows
 * from (0 everywhere, null nowhere; the label of the opening edition hides under the needle, the readout says it). For
 * a page choosing which edition its strip opens on, so the years a sentence names are on the strip.
 */
export function stripLabels(props: LayoutProps): { year: number; minWidth: number | null; under: boolean }[] {
  const { sorted, placed } = layout(props);
  return placed.map((l) => ({ year: sorted[Number(l.id.slice(1))].year, minWidth: l.minWidth, under: !!l.under }));
}

export default function YearStrip({ editions, selected, sideLabels = [], valueDomain, average, averageLabel = 'Average', label, values, height = 160, heightMd = 200, extremeLabel, labelled }: {
  editions: YearPoint[]; selected?: number; sideLabels?: string[]; valueDomain?: [number, number]; average?: number; averageLabel?: string;
  label: string; values?: ReactNode; height?: number; heightMd?: number;
  /** The label on the labelled editions ("2022 · 45%"). */
  extremeLabel?: (p: YearPoint) => string;
  /** The years to label; default the highest and lowest editions. */
  labelled?: number[];
}) {
  const { sorted, first, last, x, y, maxI, minI, sel, scrubOf, placed } = layout({ editions, selected, valueDomain, average, height, extremeLabel, labelled });
  const plot = (
    <Plot>
      {average !== undefined ? <RefLine y={y(average)} dashed /> : null}
      {sorted.map((e) => {
        const top = y(e.value);
        return (
          <g key={e.year}>
            <rect className="m-context" x={pc(x(e.year))} width={2} transform="translate(-1 0)" y={pc(top)} height={pc(1 - top)} />
            <circle className="m-context" cx={pc(x(e.year))} cy={pc(top)} r={4.5} />
          </g>
        );
      })}
      {placed.filter((l) => l.minWidth !== null && l.dy < 0).map((l) => {
        const i = Number(l.id.slice(1));
        const dotTop = y(sorted[i].value) - 6 / height;
        const from = l.y + (l.dy + 3) / height;
        return dotTop - from > 4 / height
          ? <rect key={`ld-${l.id}`} className={['leader', l.under ? 'is-under' : '', widthClass(l.minWidth)].filter(Boolean).join(' ')} data-scrub-i={l.at} x={pc(l.x)} width={1} transform="translate(-0.5 0)" y={pc(from)} height={pc(dotTop - from)} /> : null;
      })}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis centred ticks={yearTicks(first, last).map((yr) => ({ x: x(yr), label: String(yr) }))} />;
  const points = {
    x: sorted.map((e) => x(e.year)),
    keys: sorted.map((e) => String(e.year)),
    values: sorted.map((e) => e.display),
    side: sideLabels.map((l, k) => ({ label: l, values: sorted.map((e) => e.side?.[k] ?? '—') })),
  };
  return (
    <ChartFrame className="year-strip" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={points} initial={scrubOf(sorted[sel].year)} detents={[...new Set([maxI, minI, sel])].map((i) => scrubOf(sorted[i].year))} label={label} axis={axis}>{plot}</Scrubber>}
      keys={average !== undefined ? [{ label: averageLabel, mark: 'dash' as const }] : undefined}
      values={values}
    />
  );
}
