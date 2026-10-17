'use client';

import type { CourseGeometry } from '@/lib/insights';

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
    <svg className="route-map" viewBox={`0 0 ${size} ${size}`} width="100%" {...(label === '' ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': label ?? `${course.city} marathon route, ${course.distance_km.toFixed(1)} km` })}>
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
