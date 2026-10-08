'use client';

// The Recharts line chart for QuestionViz, split out so Recharts (~100 KB compressed) loads only in the browser, after the
// page is interactive (see the next/dynamic import in QuestionViz). The title, filters, caption and exact-values table
// stay in QuestionViz and are server-rendered. All formatting comes from QuestionViz so units and labels match.
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { formatNumber } from '@/lib/csv';
import type { ChartSpec } from '@/lib/research-data';

export type QuestionLineChartProps = {
  spec: ChartSpec;
  chartRows: Record<string, unknown>[];
  sectionTicks?: number[];
  distanceAxis: boolean;
  signed: boolean;
  colors: string[];
  text: (value: string) => string;
  value: (number: unknown) => string;
  label: (v: unknown, chartCoordinate?: boolean) => string;
  axisValue: (v: unknown) => string;
};

export default function QuestionLineChart({ spec, chartRows, sectionTicks, distanceAxis, signed, colors: COLORS, text, value, label, axisValue }: QuestionLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <ComposedChart data={chartRows} margin={{ top: 20, right: 16, bottom: 24, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="#DCD3C2" />
        <XAxis dataKey="label" type={spec.xNumeric ? 'number' : 'category'} domain={spec.xNumeric ? ['dataMin', 'dataMax'] : undefined} ticks={sectionTicks} tickCount={5} tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 14, fill: '#66625A' }} tickFormatter={v => distanceAxis && typeof v === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v) : typeof v === 'number' ? formatNumber(v, spec.xUnit) : text(String(v))} label={{ value: text(spec.xLabel), position: 'insideBottom', offset: -18, fontSize: 14, fill: '#66625A' }} />
        <YAxis width={58} tickLine={false} axisLine={false} tick={{ fontSize: 14, fill: '#66625A' }} tickFormatter={axisValue} domain={signed || spec.unit === 'min/km' ? ['auto', 'auto'] : [0, 'auto']} />
        {signed && <ReferenceLine y={0} stroke="#66625A" />}
        {spec.band && <Area type="linear" dataKey="interval" stroke="none" fill={COLORS[0]} fillOpacity={0.12} tooltipType="none" isAnimationActive={false} />}
        <Tooltip formatter={v => value(v)} labelFormatter={v => spec.sectionEnds ? `Average over ${label(v, true)}` : `${text(spec.xLabel)}: ${label(v, true)}`} contentStyle={{ fontSize: 13, border: '1px solid #DCD3C2', borderRadius: 10, maxWidth: 250, background: '#FFFDF8' }} />
        {spec.series.map((series, i) => <Line key={series.key} dataKey={series.key} name={text(series.label)} stroke={spec.band && i > 0 ? COLORS[0] : COLORS[i % COLORS.length]} strokeOpacity={spec.band && i > 0 ? 0.35 : 1} strokeWidth={spec.band && i > 0 ? 1 : 2.5} strokeDasharray={i === 1 ? '6 4' : undefined} type="linear" dot={spec.band && i > 0 ? false : { r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
