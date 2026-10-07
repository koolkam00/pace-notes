'use client';

import { useMemo, useRef, useState } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { Courses } from '@/lib/insights';
import { compact, count, hms } from '@/lib/viz/format';
import { tempColour } from './WeatherStory';
import { useStoryData } from './StoryData';

type Fill = 'temp' | 'slowdown';

function slowColour(s: number) {
  const t = Math.max(0, Math.min(1, (s - 0.1) / 0.45));
  const a = [255, 236, 214];
  const b = [200, 32, 47];
  return `rgb(${a.map((v, k) => Math.round(v + t * (b[k] - v))).join(',')})`;
}

/** Courses × years: circles sized by eligible finishes, coloured by start temperature or slowdown. */
export function YearsStrip({ data: given }: { data?: Courses }) {
  const data = useStoryData('courses', given);
  const y = data.years;
  const [fill, setFill] = useState<Fill>('temp');
  const [hover, setHover] = useState<string | null>(null);
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 980);
  const years = y.by_year.map((r) => r.year);
  const allYears = Array.from({ length: years[years.length - 1] - years[0] + 1 }, (_, i) => years[0] + i);
  const rows = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of y.cells) by.set(c.city, (by.get(c.city) ?? 0) + c.n);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [y]);
  const label = width < 560 ? 78 : 104;
  const cw = Math.max(11, (width - label - 8) / allYears.length);
  const rh = Math.max(14, Math.min(22, cw));
  const top = 96;
  const H = top + rows.length * rh + 30;
  const maxN = Math.max(...y.cells.map((c) => c.n));
  const rad = (n: number) => Math.max(1.6, Math.sqrt(n / maxN) * Math.min(cw, rh) * 0.62);
  const maxF = Math.max(...y.by_year.map((r) => r.finishes));
  const barH = 60;
  const X = (yr: number) => label + (yr - allYears[0]) * cw + cw / 2;
  const cell = hover ? y.cells.find((c) => `${c.city}${c.year}` === hover) : null;
  const tempStr = (c: number) => (units === 'mi' ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`);
  const step = width < 560 ? 5 : 2;
  return (
    <div className="viz-card years-strip">
      <div className="viz-head">
        <div><p className="viz-title">Two decades of race mornings</p><p className="viz-sub">Each circle is one edition, sized by eligible finishes in this dataset</p></div>
        <div className="segmented" role="group" aria-label="Colour">
          <button type="button" aria-pressed={fill === 'temp'} onClick={() => setFill('temp')}>Start temperature</button>
          <button type="button" aria-pressed={fill === 'slowdown'} onClick={() => setFill('slowdown')}>Sustained slowdown</button>
        </div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Editions by course and year from ${allYears[0]} to ${allYears[allYears.length - 1]}. 2020 has ${y.by_year.find((r) => r.year === 2020)?.editions ?? 0} editions.`} onMouseLeave={() => setHover(null)}>
          {y.by_year.map((r) => {
            const h = (r.finishes / maxF) * barH;
            return <g key={r.year}><rect x={X(r.year) - cw * 0.36} width={cw * 0.72} y={top - 18 - h} height={h} rx={2} fill={r.year === 2020 ? '#E2416B' : '#15171C'} opacity={r.year === 2020 ? 1 : 0.78}><title>{`${r.year}: ${count(r.finishes)} eligible finishes in ${r.editions} editions`}</title></rect></g>;
          })}
          <text x={label - 8} y={top - 18 - barH + 10} textAnchor="end" className="annotation-sub">{compact(maxF)}</text>
          <text x={label - 8} y={top - 22} textAnchor="end" className="annotation-sub">finishes</text>
          {(() => {
            const r20 = y.by_year.find((r) => r.year === 2020);
            return r20 && width >= 560 ? <text x={X(2020)} y={top - 24 - (r20.finishes / maxF) * barH - 4} textAnchor="middle" className="annotation" fill="#E2416B">2020</text> : null;
          })()}
          {rows.map((c, i) => (
            <g key={c}>
              <line x1={label} x2={width - 4} y1={top + i * rh + rh / 2} y2={top + i * rh + rh / 2} stroke="#E8DFCC" />
              <text x={label - 8} y={top + i * rh + rh / 2 + 4} textAnchor="end" fontSize={width < 560 ? 10 : 12}>{c}</text>
            </g>
          ))}
          {y.cells.map((c) => {
            const i = rows.indexOf(c.city);
            const colour = fill === 'temp' ? (c.temp == null ? '#D8CFBE' : tempColour(c.temp)) : slowColour(c.slowdown);
            const key = `${c.city}${c.year}`;
            return (
              <circle key={key} cx={X(c.year)} cy={top + i * rh + rh / 2} r={rad(c.n)} fill={colour} stroke={hover === key ? '#15171C' : 'rgba(21,23,28,.35)'} strokeWidth={hover === key ? 2 : 0.6}
                onMouseEnter={() => setHover(key)}>
                <title>{`${c.city} ${c.year}: ${count(c.n)} finishes, median ${hms(c.median_s)}, ${(c.slowdown * 100).toFixed(0)}% sustained slowdown${c.temp == null ? '' : `, ${tempStr(c.temp)} at the start`}`}</title>
              </circle>
            );
          })}
          {allYears.filter((yr) => yr % step === 0 || yr === 2020).map((yr) => <text key={yr} x={X(yr)} y={H - 10} textAnchor="middle" fontSize={width < 560 ? 9 : 11} fontWeight={yr === 2020 ? 700 : 400} fill={yr === 2020 ? '#E2416B' : undefined}>{width < 560 ? `’${String(yr).slice(2)}` : yr}</text>)}
        </svg>
      </div>
      <div className="years-foot">
        <label className="ghost-select years-pick">
          <span className="sr-only">Show an edition</span>
          <select value={hover ?? ''} onChange={(e) => setHover(e.target.value || null)}>
            <option value="">Choose an edition</option>
            {[...y.cells].sort((a, b) => a.city.localeCompare(b.city) || a.year - b.year).map((c) => <option key={c.city + c.year} value={`${c.city}${c.year}`}>{c.city} {c.year}</option>)}
          </select>
        </label>
        <p className="pairs-readout" aria-live="polite">
          {cell ? <><strong>{cell.city} {cell.year}</strong> · {count(cell.n)} finishes · median {hms(cell.median_s)} · {(cell.slowdown * 100).toFixed(0)}% slowdown{cell.temp == null ? ' · no valid weather' : ` · ${tempStr(cell.temp)}`}</> : 'Hover a circle, or choose an edition.'}
        </p>
        <div className="years-legend">
          {fill === 'temp'
            ? [0, 5, 10, 15, 20, 25].map((t) => <span key={t}><i style={{ background: tempColour(t) }} />{tempStr(t)}</span>)
            : [0.1, 0.2, 0.3, 0.4, 0.5].map((s) => <span key={s}><i style={{ background: slowColour(s) }} />{Math.round(s * 100)}%</span>)}
        </div>
      </div>
      <p className="viz-note">Field size means eligible finishes with all nine splits in this dataset, not official finisher counts. Missing years include coverage gaps as well as cancellations. Chicago 2018 and 2019 are left out because their records duplicate Chicago 2024; editions with fewer than 100 finishes are not drawn.</p>
    </div>
  );
}

/** Pre- and post-pandemic finish-time quantiles for the high-coverage courses. */
export function EraArrows({ data: given }: { data?: Courses }) {
  const data = useStoryData('courses', given);
  const e = data.years.eras;
  const rows = e.courses.filter((c) => c.high_coverage).sort((a, b) => a.median[0] - b.median[0]);
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const narrow = width < 560;
  const m = { l: narrow ? 90 : 110, r: 18, t: 26, b: 34 };
  const rowH = 30;
  const H = m.t + rows.length * rowH + m.b;
  const lo = Math.floor(Math.min(...rows.flatMap((r) => [r.p10[0], r.p10[1]])) / 1800) * 1800;
  const hi = Math.ceil(Math.max(...rows.flatMap((r) => [r.p90[0], r.p90[1]])) / 1800) * 1800;
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const ticks = [];
  const tickStep = narrow ? 3600 : 1800;
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) ticks.push(t);
  const arrow = (a: number, b: number, yy: number, key: string, strong: boolean) => {
    const faster = b < a;
    const col = faster ? '#17A673' : '#E2416B';
    const dir = faster ? -1 : 1;
    return (
      <g key={key} opacity={strong ? 1 : 0.75}>
        <line x1={x(a)} x2={x(b) - dir * 4} y1={yy} y2={yy} stroke={col} strokeWidth={strong ? 3 : 2} />
        <path d={`M${x(b)} ${yy} l${-dir * 7} -5 l0 10 Z`} fill={col} />
        <circle cx={x(a)} cy={yy} r={3} fill="#FFFDF8" stroke={col} strokeWidth={1.5} />
      </g>
    );
  };
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Before and after the pandemic</p><p className="viz-sub">Same course, {e.pre[0]}–{String(e.pre[1]).slice(2)} editions → {e.post[0]}–{String(e.post[1]).slice(2)} editions: 10th percentile, median and 90th percentile finish</p></div>
        <div className="pairs-legend"><span><i style={{ background: '#17A673' }} />faster</span><span><i style={{ background: '#E2416B' }} />slower</span></div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`In all ${rows.length} high-coverage courses the 10th-percentile finish got faster; the 90th percentile moved both ways.`}>
          {ticks.map((t) => <g key={t} className="grid"><line x1={x(t)} x2={x(t)} y1={m.t - 14} y2={H - m.b} /><text x={x(t)} y={H - 12} textAnchor="middle">{hms(t).slice(0, -3)}</text></g>)}
          <text x={x(rows[0].p10[0])} y={m.t - 12} textAnchor="middle" className="annotation-sub">p10</text>
          <text x={x(rows[0].median[0])} y={m.t - 12} textAnchor="middle" className="annotation-sub">median</text>
          <text x={x(rows[0].p90[0])} y={m.t - 12} textAnchor="middle" className="annotation-sub">p90</text>
          {rows.map((r, i) => {
            const yy = m.t + i * rowH + rowH / 2;
            return (
              <g key={r.city}>
                <text x={m.l - 10} y={yy + 4} textAnchor="end">{r.city}</text>
                {arrow(r.p10[0], r.p10[1], yy, 'p10', true)}
                {arrow(r.median[0], r.median[1], yy, 'med', false)}
                {arrow(r.p90[0], r.p90[1], yy, 'p90', false)}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="viz-note">
        Each edition weighted equally within its period. Courses qualify when at least {Math.round(e.coverage_rule * 100)}% of raw records are eligible in both periods.
        Course mix, entry rules and eligibility shares changed too, so this describes the fields, not why they changed.
      </p>
    </div>
  );
}
