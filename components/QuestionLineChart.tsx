'use client';

// QuestionViz's line form, drawn with LineProfile (the redesign spec, section 3.6) instead of Recharts. It loads only in
// the browser, after the page is interactive (the next/dynamic import in QuestionViz), so the pages that show one keep
// their initial JavaScript. The title, filters and exact-values table stay in QuestionViz; every format comes from it,
// so units and labels match.
import LineProfile, { type ProfileSeries } from './viz/LineProfile';
import { niceTicks } from './viz/scale';
import { finite, formatNumber } from '@/lib/csv';
import type { ChartSpec } from '@/lib/research-data';

export type QuestionLineChartProps = {
  spec: ChartSpec;
  chartRows: Record<string, unknown>[];
  sectionTicks?: number[];
  /** A pace axis's ticks, in minutes per unit, on a round grid; the axis runs from the first to the last. */
  paceTicks?: number[];
  distanceAxis: boolean;
  signed: boolean;
  text: (value: string) => string;
  axisValue: (v: unknown) => string;
};

const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Every row with all its series recorded: the first series in ink, the second dashed, a published band washed under them. */
export default function QuestionLineChart({ spec, chartRows, sectionTicks, paceTicks, distanceAxis, signed, text, axisValue }: QuestionLineChartProps) {
  const drawn = chartRows.map((row, i) => ({ row, i })).filter(({ row }) => spec.series.every(series => finite(row[series.key]) !== null) && (!spec.xNumeric || finite(row.label) !== null));
  if (!drawn.length) return null;
  const xs = drawn.map(({ row, i }) => (spec.xNumeric ? Number(row.label) : i));
  const series: ProfileSeries[] = spec.series.map((s, i) => ({
    id: s.key, values: drawn.map(({ row }) => Number(row[s.key])),
    tone: spec.band ? (i ? 'quiet' : 'ink') : i === 2 ? 'quiet' : 'ink', dashed: !spec.band && i === 1,
  }));
  const intervals = spec.band ? drawn.map(({ row }) => row.interval as [number | null, number | null]) : [];
  const band = spec.band && intervals.every(([a, b]) => a !== null && b !== null) ? { lo: intervals.map(([a]) => Number(a)), hi: intervals.map(([, b]) => Number(b)) } : undefined;
  const ys = [...series.flatMap(s => s.values), ...(band ? [...band.lo, ...band.hi] : [])];
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  // A pace axis runs over its round ticks (lib/pace-ticks.ts); a share starts at zero.
  const yDomain: [number, number] | undefined = paceTicks ? [paceTicks[0], paceTicks[paceTicks.length - 1]] : signed ? undefined : spec.unit === '%' ? [0, Math.max(...niceTicks(0, hi, 4), hi)] : undefined;
  const yTicks = (paceTicks ?? niceTicks(yDomain ? yDomain[0] : lo, yDomain ? yDomain[1] : hi, 4)).map(v => ({ value: v, label: axisValue(v) }));
  const tickAt = (v: number) => (spec.xNumeric ? (distanceAxis ? oneDecimal.format(v) : formatNumber(v, spec.xUnit)) : text(String(drawn[v]?.row.label ?? '')));
  const xValues = spec.xNumeric ? (sectionTicks ?? niceTicks(Math.min(...xs), Math.max(...xs), 4)) : xs.length <= 6 ? xs : [xs[0], xs[Math.floor(xs.length / 2)], xs[xs.length - 1]];
  return (
    <LineProfile x={xs} yDomain={yDomain} xTicks={xValues.map(v => ({ value: v, label: tickAt(v) }))} yTicks={yTicks}
      layers={[{ id: 'all', label: text(spec.title), series, band }]} refs={signed ? [{ value: 0 }] : []}
      axisTitle={{ end: text(spec.xLabel) }} label={`${text(spec.title)}: a line chart; the exact values are in the table below`}
      keys={spec.series.length > 1 ? spec.series.map((s, i) => ({ label: text(s.label), mark: series[i].dashed ? 'dash' as const : 'line' as const, tone: series[i].tone === 'quiet' ? 'quiet' as const : undefined })) : undefined} />
  );
}
