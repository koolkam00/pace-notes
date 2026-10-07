'use client';

import { useRef } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { CourseSummary, WeatherEdition } from '@/lib/insights';
import { paceLabel } from '@/lib/units';
import { BandStrips, CourseCurve, courseNote } from './CoursesStory';
import { tempColour } from './WeatherStory';

type Shaped = CourseSummary & Required<Pick<CourseSummary, 'curve' | 'deviation' | 'signature'>>;

export function CourseFingerprint({ course, typical }: { course: Shaped; typical: number[] }) {
  const { units } = useUnits();
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">Pace by section, against the typical marathon</p><p className="viz-sub">Median finisher, % slower (+) or faster (−) than their own average pace, each edition weighted equally</p></div></div>
      <CourseCurve course={course} typical={typical} height={250} />
      <BandStrips course={course} />
      <p className="viz-note">{courseNote(course, units)}</p>
    </div>
  );
}

/** This course's editions: start temperature against sustained slowdown. */
export function CourseWeather({ city, editions }: { city: string; editions: WeatherEdition[] }) {
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const H = 240;
  const m = { l: 44, r: 16, t: 16, b: 36 };
  const temps = editions.map((e) => e.temp);
  const tLo = Math.floor(Math.min(...temps) - 2);
  const tHi = Math.ceil(Math.max(...temps) + 2);
  const sHi = Math.min(0.7, Math.ceil(Math.max(...editions.map((e) => e.slowdown)) * 10 + 1) / 10);
  const x = (t: number) => m.l + ((t - tLo) / Math.max(1, tHi - tLo)) * (width - m.l - m.r);
  const y = (s: number) => m.t + ((sHi - s) / sHi) * (H - m.t - m.b);
  const fmt = (c: number) => (units === 'mi' ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`);
  const toU = (c: number) => (units === 'mi' ? c * 1.8 + 32 : c);
  const fromU = (u: number) => (units === 'mi' ? (u - 32) / 1.8 : u);
  const span = toU(tHi) - toU(tLo);
  const step = units === 'mi' ? (span > 30 ? 10 : 5) : span > 16 ? 5 : 2;
  const ticks: number[] = [];
  for (let u = Math.ceil(toU(tLo) / step) * step; u <= toU(tHi); u += step) ticks.push(fromU(u));
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">{city} race mornings</p><p className="viz-sub">Each edition: modelled temperature at the scheduled start and sustained slowdown share</p></div></div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`${editions.length} ${city} editions plotted by start temperature and sustained slowdown.`}>
          {Array.from({ length: Math.round(sHi * 10) + 1 }, (_, i) => i / 10).map((s) => <g key={s} className="grid"><line x1={m.l} x2={width - m.r} y1={y(s)} y2={y(s)} /><text x={m.l - 8} y={y(s) + 4} textAnchor="end">{Math.round(s * 100)}%</text></g>)}
          {ticks.map((t) => <text key={t} x={x(t)} y={H - 14} textAnchor="middle">{fmt(t)}</text>)}
          {editions.map((e) => (
            <g key={e.year}>
              <circle cx={x(e.temp)} cy={y(e.slowdown)} r={7} fill={tempColour(e.temp)} stroke="#15171C" strokeOpacity={0.4}><title>{`${city} ${e.year}: ${fmt(e.temp)}, ${(e.slowdown * 100).toFixed(1)}%`}</title></circle>
              <text x={x(e.temp) + 10} y={y(e.slowdown) + 4} className="annotation-sub">{e.year}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="viz-note">Weather is the supplied modelled hour at the scheduled start, never personal exposure. Other things changed between years too.</p>
    </div>
  );
}

/** Where this course sits among all courses for finishes with the same 5–20 km pace. */
export function CourseMatched({ city, band }: { city: string; band: { lo_s: number; hi_s: number; courses: { city: string; slowdown: number; finishes: number }[] } }) {
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const rows = band.courses.filter((c) => c.finishes >= 1000 || c.city === city);
  const H = 92;
  const m = { l: 12, r: 12 };
  const max = 0.5;
  const x = (s: number) => m.l + (Math.min(s, max) / max) * (width - m.l - m.r);
  const me = rows.find((c) => c.city === city);
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">Same 5–20 km pace, compared</p><p className="viz-sub">Finishes that ran 5–20 km at {paceLabel(band.lo_s, units, false)}–{paceLabel(band.hi_s, units)}: share with a sustained slowdown, by course</p></div></div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={me ? `${city}: ${(me.slowdown * 100).toFixed(0)}% among ${rows.length} courses.` : 'Courses compared.'}>
          <line x1={x(0)} x2={x(max)} y1={46} y2={46} stroke="#D8CFBE" strokeWidth={2} />
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((s) => <text key={s} x={x(s)} y={84} textAnchor="middle">{Math.round(s * 100)}%</text>)}
          {rows.filter((c) => c.city !== city).map((c) => <circle key={c.city} cx={x(c.slowdown)} cy={46} r={5} fill="#B9AE98" opacity={0.8}><title>{`${c.city}: ${(c.slowdown * 100).toFixed(0)}%`}</title></circle>)}
          {me ? <g><circle cx={x(me.slowdown)} cy={46} r={9} fill="var(--orange)" stroke="#15171C" strokeWidth={1.5} /><text className="annotation" x={x(me.slowdown)} y={24} textAnchor="middle">{city} {(me.slowdown * 100).toFixed(0)}%</text></g> : null}
        </svg>
      </div>
    </div>
  );
}
