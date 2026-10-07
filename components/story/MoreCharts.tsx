'use client';

import { useRef, useState } from 'react';
import { useWidth } from '@/components/viz/useSize';
import { useUnits } from '@/components/UnitsProvider';
import type { Archetypes, ReplayIndex } from '@/lib/insights';
import { hms } from '@/lib/viz/format';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';

/** Archetype mix by course (each edition weighted equally), sortable by any type. */
export function CourseTypes({ data }: { data: Archetypes }) {
  const [sortBy, setSortBy] = useState(0);
  const rows = [...data.courses].filter((c) => c.finishes >= 1000).sort((a, b) => b.shares[sortBy] - a.shares[sortBy]);
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Pacing types by course</p><p className="viz-sub">Each race edition weighted equally · sorted by {data.archetypes[sortBy].name}</p></div>
        <div className="segmented" role="group" aria-label="Sort courses by pacing type">
          {data.archetypes.map((a, i) => <button key={a.slug} type="button" aria-pressed={sortBy === i} onClick={() => setSortBy(i)}>{a.name}</button>)}
        </div>
      </div>
      <div className="course-type-rows">
        {rows.map((c) => (
          <div key={c.city} className="course-type-row">
            <span className="course-type-name">{c.city === 'New York' ? 'New York City' : c.city}<small>{c.editions} edition{c.editions === 1 ? '' : 's'}</small></span>
            <span className="course-type-bar" role="img" aria-label={`${c.city}: ${data.archetypes.map((a, i) => `${a.name} ${(c.shares[i] * 100).toFixed(0)}%`).join(', ')}`}>
              {c.shares.map((v, i) => <i key={i} style={{ width: `${v * 100}%`, background: ARCHETYPE_COLOURS[i], opacity: i === sortBy ? 1 : 0.45 }} />)}
            </span>
            <strong>{(c.shares[sortBy] * 100).toFixed(0)}%</strong>
          </div>
        ))}
      </div>
      <p className="viz-note">Courses mix different fields, years and weather, so these are descriptions of each course&apos;s finishes, not a ranking of courses.</p>
    </div>
  );
}

/** The field stretching out: elapsed-time quantiles at each checkpoint, drawn as a fan. */
export function FieldSpread({ data }: { data: ReplayIndex }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const { units } = useUnits();
  const H = 320;
  const m = { l: 56, r: 16, t: 16, b: 36 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const rows = [{ km: 0, p10_s: 0, p25_s: 0, p50_s: 0, p75_s: 0, p90_s: 0 }, ...data.field_spread];
  const maxT = Math.max(...rows.map((r) => r.p90_s));
  const x = (km: number) => m.l + (km / 42.195) * iw;
  const y = (s: number) => m.t + ih - (s / maxT) * ih;
  const band = (lo: 'p10_s' | 'p25_s', hi: 'p75_s' | 'p90_s') => `${rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.km)} ${y(r[hi])}`).join(' ')} ${[...rows].reverse().map((r) => `L${x(r.km)} ${y(r[lo])}`).join(' ')} Z`;
  const last = rows[rows.length - 1];
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">How far apart the field gets</p><p className="viz-sub">Elapsed time at each checkpoint, every eligible finish from every race pooled: middle 50% and middle 80%</p></div></div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label="Fan chart of elapsed time against distance. The gap between faster and slower finishers widens steadily to the finish.">
          {[3600, 7200, 10800, 14400, 18000, 21600].filter((s) => s <= maxT).map((s) => (
            <g key={s}><g className="grid"><line x1={m.l} x2={width - m.r} y1={y(s)} y2={y(s)} /></g><text x={m.l - 8} y={y(s) + 4} textAnchor="end">{s / 3600}:00</text></g>
          ))}
          <path d={band('p10_s', 'p90_s')} fill="rgba(47,91,255,.14)" />
          <path d={band('p25_s', 'p75_s')} fill="rgba(47,91,255,.28)" />
          <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.km)} ${y(r.p50_s)}`).join(' ')} fill="none" stroke="#2346E6" strokeWidth={2.5} />
          {rows.slice(1).map((r) => <circle key={r.km} cx={x(r.km)} cy={y(r.p50_s)} r={3} fill="#2346E6" />)}
          {(units === 'mi' ? [0, 5, 10, 15, 20, 25] : [0, 10, 20, 30, 40]).map((d) => {
            const km = units === 'mi' ? d * 1.609344 : d;
            return <text key={d} x={x(km)} y={H - 14} textAnchor="middle">{d} {units}</text>;
          })}
          <text className="annotation" x={x(42.195) - 4} y={y(last.p90_s) - 8} textAnchor="end">slowest 10% after {hms(last.p90_s)}</text>
          <text className="annotation" x={x(42.195) - 4} y={y(last.p10_s) + 18} textAnchor="end">fastest 10% by {hms(last.p10_s)}</text>
        </svg>
      </div>
      <p className="viz-note">Pooled across races, the middle 80% of finishes spans {hms(last.p90_s - last.p10_s)} at the finish, and the gap widens at every checkpoint.</p>
    </div>
  );
}
