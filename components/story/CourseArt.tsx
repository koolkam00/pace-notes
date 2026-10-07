'use client';

import { useRef } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { CourseGeometry } from '@/lib/insights';
import { KM_PER_MILE, METRES_PER_FOOT } from '@/lib/units';

function routePath(route: [number, number][], size: number, pad: number) {
  const s = size - pad * 2;
  return route.map(([x, y], i) => `${i ? 'L' : 'M'}${(pad + x * s).toFixed(1)} ${(pad + y * s).toFixed(1)}`).join(' ');
}

/** The supplied course drawn as a line, with an animated runner moving along it. */
export function RouteMap({ course, size = 220, animate = true, stroke = '#15171C', glow = false, label }: { course: CourseGeometry; size?: number; animate?: boolean; stroke?: string; glow?: boolean; label?: string }) {
  const pad = size * 0.08;
  const d = routePath(course.route, size, pad);
  const [sx, sy] = course.route[0];
  const [fx, fy] = course.route[course.route.length - 1];
  const s = size - pad * 2;
  return (
    <svg className="route-map" viewBox={`0 0 ${size} ${size}`} width="100%" {...(label === '' ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': label ?? `Supplied ${course.city} marathon route, ${course.distance_km.toFixed(1)} km` })}>
      {glow ? <path d={d} fill="none" stroke={stroke} strokeOpacity={0.18} strokeWidth={size / 22} strokeLinecap="round" strokeLinejoin="round" /> : null}
      <path className={animate ? 'route-line is-drawn' : 'route-line'} d={d} pathLength={1} fill="none" stroke={stroke} strokeWidth={Math.max(1.6, size / 90)} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + sx * s} cy={pad + sy * s} r={size / 45} fill="#17A673" stroke="#FFFDF8" strokeWidth={size / 160} />
      <g transform={`translate(${pad + fx * s - size / 40} ${pad + fy * s - size / 40})`}>
        <rect width={size / 20} height={size / 20} rx={size / 160} fill="#FFFDF8" stroke="#15171C" strokeWidth={size / 220} />
        <rect width={size / 40} height={size / 40} fill="#15171C" />
        <rect x={size / 40} y={size / 40} width={size / 40} height={size / 40} fill="#15171C" />
      </g>
      {animate ? (
        <circle className="route-runner" r={size / 55} fill="#FF5B2E" stroke="#FFFDF8" strokeWidth={size / 180}>
          <animateMotion dur="9s" repeatCount="1" fill="freeze" path={d} rotate="auto" />
        </circle>
      ) : null}
    </svg>
  );
}

/** Supplied elevation profile, in feet or metres to match the selected units. */
export function ElevationProfile({ course, height = 140, compact = false }: { course: CourseGeometry; height?: number; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const { units } = useUnits();
  const elev = course.elevation_m;
  const toUnit = (m: number) => (units === 'mi' ? m / METRES_PER_FOOT : m);
  const lo = Math.min(...elev);
  const hi = Math.max(...elev);
  const span = Math.max(hi - lo, 30);
  const m = compact ? { l: 2, r: 2, t: 6, b: 2 } : { l: 44, r: 8, t: 12, b: 26 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const x = (km: number) => m.l + (km / course.distance_km) * iw;
  const y = (e: number) => m.t + ih - ((e - lo) / span) * ih;
  const pts = elev.map((e, i) => [x(Math.min(course.distance_km, i * course.elevation_step_km)), y(e)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(course.distance_km)} ${m.t + ih} L${m.l} ${m.t + ih} Z`;
  const unit = units === 'mi' ? 'ft' : 'm';
  const ticks = units === 'mi' ? [0, 5, 10, 15, 20, 25].map((mi) => mi * KM_PER_MILE) : [0, 10, 20, 30, 40];
  return (
    <div ref={ref} className="viz elevation">
      <svg width={width} height={height} role="img" aria-label={`Supplied elevation profile for ${course.city}: ${Math.round(toUnit(lo))} to ${Math.round(toUnit(hi))} ${unit}.`}>
        <defs>
          <linearGradient id={`elev-${course.city.replace(/\W/g, '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#F4B23E" stopOpacity={0.75} />
            <stop offset="1" stopColor="#F4B23E" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#elev-${course.city.replace(/\W/g, '')})`} />
        <path d={line} fill="none" stroke="#8A5A00" strokeWidth={1.6} />
        {!compact ? (
          <>
            <text x={m.l - 6} y={y(hi) + 4} textAnchor="end">{Math.round(toUnit(hi))} {unit}</text>
            <text x={m.l - 6} y={y(lo) + 4} textAnchor="end">{Math.round(toUnit(lo))} {unit}</text>
            {ticks.filter((k) => k <= course.distance_km).map((k) => <text key={k} x={x(k)} y={height - 8} textAnchor="middle">{units === 'mi' ? `${Math.round(k / KM_PER_MILE)} mi` : `${k} km`}</text>)}
          </>
        ) : null}
      </svg>
    </div>
  );
}
