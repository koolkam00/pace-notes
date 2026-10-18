import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, RefLine } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, type LabelItem } from './labels';
import { extent, linear, pc, yScale } from './scale';

/**
 * A year strip (the redesign spec, section 3.6): one lollipop per edition on a time-scaled axis, so a year with no
 * edition in the data leaves its gap open (a faint band keyed "No edition in the data"), never closed up. The selected
 * year is signal, the extremes are labelled, the average is a dashed reference in the key. Scrub the years; the readout
 * gives each edition's values.
 */
export type YearPoint = { year: number; value: number; display: string; side?: string[] };

export default function YearStrip({ editions, selected, sideLabels = [], valueDomain, average, averageLabel = 'Average', label, values, height = 160, heightMd = 200, extremeLabel, gapLabel = 'No edition in the data' }: {
  editions: YearPoint[]; selected?: number; sideLabels?: string[]; valueDomain?: [number, number]; average?: number; averageLabel?: string;
  /** The key for a year with no point, when the year itself happened (a race held, its figure missing). */
  gapLabel?: string;
  label: string; values?: ReactNode; height?: number; heightMd?: number;
  /** The label on the highest and lowest editions ("2022 · 45%"). */
  extremeLabel?: (p: YearPoint) => string;
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
  const items: LabelItem[] = [...new Set([maxI, minI])].filter((i) => i !== sel || sel < 0).map((i) => ({ id: `e${i}`, text: (extremeLabel ?? ((p) => `${p.year}`))(sorted[i]), x: x(sorted[i].year), y: y(sorted[i].value), priority: 2, size: 13, gap: 9 }));
  if (sel >= 0) items.push({ id: 'sel', text: (extremeLabel ?? ((p) => `${p.year}`))(sorted[sel]), x: x(sorted[sel].year), y: y(sorted[sel].value), priority: 3, tone: 'signal', gap: 9 });
  const placed = placeLabels(items, { height, avoid: sorted.map((e) => ({ x: x(e.year), y: y(e.value), r: 5 })), boxes: sorted.map((e) => ({ x0: x(e.year), x1: x(e.year), y0: y(e.value), y1: 1, pad: 2 })) });
  const plot = (
    <Plot>
      {gaps.map((g) => <rect key={g.from} className="a-wash year-gap" x={pc(x(g.from - 0.5))} width={pc(x(g.to + 0.5) - x(g.from - 0.5))} y="0" height="100%" />)}
      {average !== undefined ? <RefLine y={y(average)} dashed /> : null}
      {sorted.map((e, i) => {
        const on = i === sel;
        const top = y(e.value);
        return (
          <g key={e.year}>
            <rect className={on ? 'm-signal' : 'm-context'} x={pc(x(e.year))} width={2} transform="translate(-1 0)" y={pc(top)} height={pc(1 - top)} />
            <circle className={on ? 'm-signal' : 'm-context'} cx={pc(x(e.year))} cy={pc(top)} r={4.5} />
          </g>
        );
      })}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const step = last - first > 12 ? 5 : last - first > 6 ? 2 : 1;
  const tickYears = new Set([first, last]);
  for (let yr = Math.ceil(first / step) * step; yr <= last; yr += step) tickYears.add(yr);
  const axis = <Axis ticks={[...tickYears].sort((a, b) => a - b).map((yr) => ({ x: x(yr), label: String(yr), priority: yr === first || yr === last ? 2 : 1 }))} />;
  const points = {
    x: sorted.map((e) => x(e.year)),
    keys: sorted.map((e) => String(e.year)),
    values: sorted.map((e) => e.display),
    side: sideLabels.map((l, k) => ({ label: l, values: sorted.map((e) => e.side?.[k] ?? '—') })),
  };
  return (
    <ChartFrame className="year-strip" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={points} initial={sel >= 0 ? sel : maxI} detents={[...new Set([maxI, minI, ...(sel >= 0 ? [sel] : [])])]} label={label} axis={axis}>{plot}</Scrubber>}
      keys={[...(average !== undefined ? [{ label: averageLabel, mark: 'dash' as const }] : []), ...(gaps.length ? [{ label: gapLabel, mark: 'band' as const }] : [])]}
      values={values}
    />
  );
}
