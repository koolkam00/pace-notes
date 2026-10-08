'use client';

import { useId, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { finite, formatNumber } from '@/lib/csv';
import type { ChartSpec } from '@/lib/research-data';
import { filterOptions, resolveSelection } from '@/lib/chart-selection';
import { sectionLabel } from '@/lib/section-labels';
import { distanceValue, elevationValue, paceLabel, paceValue, unitText, type UnitSystem } from '@/lib/units';
import { useUnits } from './UnitsProvider';

const COLORS = ['#2346E6', '#FF5B2E', '#66625A'];

// Recharts only ever draws in the browser (the server HTML held an empty box), so its chunk loads after hydration
// instead of with the page. The placeholder fills the fixed-height .chart box, so nothing shifts when the chart arrives.
const QuestionLineChart = dynamic(() => import('./QuestionLineChart'), {
  ssr: false,
  loading: () => <div className="chart-placeholder" style={{ width: '100%', height: '100%' }} aria-hidden="true" />,
});

export default function QuestionViz({ spec, headingLevel = 3, unitSystem }: { spec: ChartSpec; headingLevel?: 2 | 3; unitSystem?: UnitSystem }) {
  const id = useId();
  const { units: preferredUnits } = useUnits();
  const selectedUnits = unitSystem ?? preferredUnits;
  const text = (value: string) => unitText(value, selectedUnits);
  const distanceAxis = Boolean(spec.xNumeric && (spec.sectionEnds || spec.xUnit === 'km' || /\bkm\b/.test(spec.xLabel)));
  const displayUnit = spec.unit === 'min/km' ? (selectedUnits === 'mi' ? 'min/mi' : 'min/km')
    : spec.unit === 'sec/km' ? (selectedUnits === 'mi' ? 'sec/mi' : 'sec/km')
    : spec.unit === 'm' ? (selectedUnits === 'mi' ? 'ft' : 'm')
    : spec.unit === 'km' ? selectedUnits : spec.unit;
  const transformValue = (value: unknown) => {
    const n = finite(value);
    if (n === null) return null;
    if (spec.unit === 'min/km' || spec.unit === 'sec/km') return paceValue(n, selectedUnits);
    if (spec.unit === 'm') return elevationValue(n, selectedUnits);
    if (spec.unit === 'km') return distanceValue(n, selectedUnits);
    return n;
  };
  const displayNumber = (n: number, unit = spec.unit) => unit === 'min/km'
    ? paceLabel(n * 60 / paceValue(1, selectedUnits), selectedUnits)
    : formatNumber(n, unit === spec.unit ? displayUnit : unit);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const filters = spec.filters || [];
  const [selected, setSelected] = useState<Record<string, string>>(() => resolveSelection(spec));
  // Keep filters, sample counts and section boundaries in their original units.
  // Only the displayed measurement series are converted.
  const rows = useMemo(() => spec.rows.filter(row =>
    filters.every(filter => String(row[filter.key] ?? '') === selected[filter.key])
  ).map(row => ({ ...row, ...Object.fromEntries(spec.series.map(series => [series.key, transformValue(row[series.key])])) })), [spec.rows, selected, spec.filters, spec.series, spec.unit, selectedUnits]);
  const allValues = rows.flatMap(row => spec.series.map(series => finite(row[series.key]))).filter((value): value is number => value !== null);
  const signed = allValues.some(value => value < 0);
  const max = spec.unit === '%' ? Math.max(100, ...allValues) : spec.unit === 'correlation' ? 1 : Math.max(1, ...allValues.map(Math.abs));
  const hasCounts = rows.some(row => spec.series.some(series => finite(row[`n_${series.key}`]) !== null));
  const chartRows = rows.map(row => ({
    ...row,
    label: distanceAxis && finite(row.label) !== null ? distanceValue(Number(row.label), selectedUnits) : row.label,
    ...(spec.band ? { interval: [row[spec.band.lower], row[spec.band.upper]] } : {}),
  }));
  const xs = chartRows.map(row => finite(row.label)).filter((v): v is number => v !== null);
  const sectionTicks = spec.sectionEnds && distanceAxis && xs.length
    ? [5, 10, 20, 30, 40, 42.195].map(km => distanceValue(km, selectedUnits)).filter(v => v >= Math.min(...xs) - 1e-9 && v <= Math.max(...xs) + 1e-9)
    : undefined;
  const percentileLabels = ['10th percentile', 'Median', '90th percentile'];
  const percentileKeys = spec.kind !== 'line' && spec.series.length === 3
    ? [['p10', 'median', 'p90'], ['low', 'value', 'high']].find(keys => keys.every((key, index) => spec.series.some(series => series.key === key && series.label === percentileLabels[index])))
    : undefined;
  const timeRange = spec.unit === 'finish' || spec.unit === 'min/km';
  const rangeMin = allValues.length ? Math.min(...allValues, ...(timeRange ? [] : [0])) : 0;
  const rangeMax = allValues.length ? Math.max(...allValues, ...(timeRange ? [] : [0])) : 0;
  const rangePadding = (rangeMax - rangeMin) * .05 || 1;
  const rangeStart = timeRange ? Math.max(0, rangeMin - rangePadding) : rangeMin - rangePadding;
  const rangeEnd = rangeMax + rangePadding;
  const rangePosition = (n: number) => (n - rangeStart) / (rangeEnd - rangeStart) * 100;
  const rangeHasZero = rangeStart < 0 && rangeEnd > 0;
  const rangeZeroPosition = rangePosition(0);
  const value = (number: unknown) => {
    const n = finite(number);
    return n === null ? 'Not available' : displayNumber(n);
  };
  const label = (v: unknown, chartCoordinate = false) => {
    const canonical = chartCoordinate && distanceAxis && finite(v) !== null ? Number(v) / distanceValue(1, selectedUnits) : v;
    if (spec.sectionEnds) return text(sectionLabel(canonical, spec.sectionEnds));
    if (distanceAxis && finite(canonical) !== null) return formatNumber(distanceValue(Number(canonical), selectedUnits), selectedUnits);
    if (spec.xUnit && typeof canonical === 'number') return text(formatNumber(canonical, spec.xUnit));
    return text(String(canonical ?? 'Not recorded'));
  };
  const axisValue = (v: unknown) => {
    const n = finite(v);
    if (n === null) return String(v);
    if (spec.unit === '%' || spec.unit === '% pace' || spec.unit === '% change' || spec.unit === 'finish' || spec.unit === 'min/km') return displayNumber(n);
    return formatNumber(n);
  };
  const units: Record<string, string> = {
    '%': 'Percent (%)', '% pace': 'Pace difference (%) · higher is slower', '% change': 'Finish-time change (%) · below zero is faster', 'finish': 'Finish time (hours:minutes)', 'min/km': selectedUnits === 'mi' ? 'Pace (minutes:seconds per mile)' : 'Pace (minutes:seconds per km)',
    'min': 'Minutes', 'runners': 'Number of finishes', 'correlation': 'Correlation, from −1 to 1', 'sec/km': selectedUnits === 'mi' ? 'Change in seconds per mile' : 'Change in seconds per kilometre',
    'm': selectedUnits === 'mi' ? 'Elevation (feet)' : 'Elevation (metres)',
    'km': selectedUnits === 'mi' ? 'Distance (miles)' : 'Distance (kilometres)',
  };

  return (
    <figure className="study-figure" aria-labelledby={`${id}-title`}>
      <Heading id={`${id}-title`} className="chart-title">{text(spec.title)}</Heading>
      <p className="chart-unit">{units[spec.unit] || text(spec.unit)}</p>
      {filters.length > 0 && <div className="chart-controls">
        {filters.map((filter, index) => {
          const options = filterOptions(spec, index, selected);
          return <label key={filter.key} htmlFor={`${id}-${filter.key}`}>
            {text(filter.label)}
            <select id={`${id}-${filter.key}`} value={selected[filter.key]} onChange={event => setSelected(current => resolveSelection(spec, { ...current, [filter.key]: event.target.value }))}>
              {options.map(option => <option key={option} value={option}>{text(option)}</option>)}
            </select>
          </label>;
        })}
      </div>}
      {spec.series.length > 1 && !percentileKeys && <div className="chart-legend" aria-label="Chart legend">
        {spec.series.map((series, i) => <span key={series.key} className={`chart-key ${spec.kind === 'line' && i === 1 ? 'dashed' : ''}`} style={{ '--series-color': spec.band && i > 0 ? COLORS[0] : COLORS[i % COLORS.length] } as React.CSSProperties}>{text(series.label)}</span>)}
      </div>}
      {!allValues.length ? <p className="answer-state" role="status">No published values for this selection.</p>
        : percentileKeys ? <div className="range-chart">
          <p className="study-meta">The line spans the 10th to 90th percentile. The dot marks the median.</p>
          <div className="range-axis" aria-hidden="true" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ visibility: rangeHasZero && rangeZeroPosition < 15 ? 'hidden' : undefined }}>{value(rangeStart)}</span>
            {rangeHasZero && <span className="range-zero-label" style={{ position: 'absolute', left: `${rangeZeroPosition}%`, transform: 'translateX(-50%)' }}>{value(0)}</span>}
            <span style={{ visibility: rangeHasZero && rangeZeroPosition > 85 ? 'hidden' : undefined }}>{value(rangeEnd)}</span>
          </div>
          {rows.map((row, i) => {
            const low = finite(row[percentileKeys[0]]), median = finite(row[percentileKeys[1]]), high = finite(row[percentileKeys[2]]);
            const complete = low !== null && median !== null && high !== null && low <= median && median <= high;
            return <div className="range-row" key={`${row.label}-${i}`}>
              <div className="range-label">{label(row.label)}</div>
              <div className="range-track" aria-hidden="true" style={{ position: 'relative', height: 28 }}>{complete && <>
                {rangeStart <= 0 && rangeEnd >= 0 && <span className="range-zero" style={{ position: 'absolute', left: `${rangePosition(0)}%`, top: 3, bottom: 3, borderLeft: '1px solid #9A907D' }} />}
                <span className="range-span" style={{ position: 'absolute', left: `${rangePosition(low)}%`, width: `${rangePosition(high) - rangePosition(low)}%`, top: 13, height: 2, borderRadius: 1, background: COLORS[2] }} />
                <span className="range-marker" style={{ position: 'absolute', left: `${rangePosition(median)}%`, top: 7, width: 14, height: 14, transform: 'translateX(-50%)', borderRadius: '50%', background: COLORS[0], border: '2px solid white' }} />
              </>}</div>
              <div className="range-values"><strong aria-label={`Median: ${value(median)}`}>{median === null ? '—' : value(median)}</strong></div>
            </div>;
          })}
        </div>
        : spec.kind === 'line' ? <div className="chart">
          <QuestionLineChart spec={spec} chartRows={chartRows} sectionTicks={sectionTicks} distanceAxis={distanceAxis} signed={signed} colors={COLORS} text={text} value={value} label={label} axisValue={axisValue} />
        </div> : <div className="bars">
          {rows.map((row, i) => <div className="bar-item" key={`${row.label}-${i}`}>
            <div className="bar-label"><span>{label(row.label)}</span>{spec.series.length === 1 && <strong>{value(row[spec.series[0].key])}</strong>}</div>
            {spec.series.map((series, index) => {
              const n = finite(row[series.key]);
              return <div key={series.key}>
                {spec.series.length > 1 && <div className="bar-label"><span className="bar-series-label">{text(series.label)}</span><strong>{value(n)}</strong></div>}
                {n !== null && <div className={`bar-track ${signed ? 'signed-track' : ''}`} aria-hidden="true"><div className="bar-fill" style={{ width: `${Math.abs(n) / max * (signed ? 50 : 100)}%`, marginLeft: signed ? `${n < 0 ? 50 - Math.abs(n) / max * 50 : 50}%` : undefined, background: COLORS[index % COLORS.length] }} /></div>}
              </div>;
            })}
          </div>)}
        </div>}
      {(spec.note || spec.sectionEnds) && <figcaption>
        {spec.sectionEnds && <p>{text('Points average the preceding section. The final section is 40–42.195 km; lines do not locate pace changes within a section.')}</p>}
        {spec.note && <p>{text(spec.note)}</p>}
      </figcaption>}
      <details className="table-disclosure">
        <summary>View exact values{hasCounts ? ' and sample sizes' : ''}</summary>
        <div className="table-scroll" role="region" aria-label={`Values for ${text(spec.title)}`} tabIndex={0}>
          <table className="data-table">
            <thead><tr><th scope="col">{spec.sectionEnds ? 'Course section' : text(spec.xLabel)}</th>{spec.series.map(series => <th scope="col" key={series.key}>{text(series.label)}</th>)}{hasCounts && spec.series.map(series => <th scope="col" key={`n-${series.key}`}>{spec.series.length > 1 ? `${text(series.label)}: ` : ''}Observations</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index}><th scope="row">{label(row.label)}</th>{spec.series.map(series => <td key={series.key}>{value(row[series.key])}</td>)}{hasCounts && spec.series.map(series => <td key={`n-${series.key}`}>{finite(row[`n_${series.key}`]) === null ? 'Not available' : formatNumber(Number(row[`n_${series.key}`]), 'runners')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
