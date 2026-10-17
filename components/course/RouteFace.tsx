import type { CourseGeometry } from '@/lib/insights';

/**
 * A course's route as a face (the redesign spec, section 3.6 "Route"): the supplied route drawn as one line on a soft
 * glow, a start ring and a checkered finish. A server SVG in a square box that fits any width; the line keeps its stroke
 * width at every size. It draws in currentColor: night ink in the hero, ink in the course rows. Its paint is set on the
 * marks themselves, so it needs no sheet. Decorative unless `label` names it.
 */
const SIZE = 100;
const PAD = 7;

function point([x, y]: [number, number]): [number, number] {
  const s = SIZE - PAD * 2;
  return [PAD + x * s, PAD + y * s];
}

const path = (points: [number, number][]) => points.map((p, i) => { const [x, y] = point(p); return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`; }).join('');

export default function RouteFace({ course, label, fit = false, className }: {
  course: CourseGeometry; label?: string;
  /** Crop the box to the route's own shape (the hero), rather than the square every row shares. */
  fit?: boolean; className?: string;
}) {
  const route = course.route;
  const d = path(route);
  const [sx, sy] = point(route[0]);
  const [fx, fy] = point(route[route.length - 1]);
  const ys = route.map((p) => point(p)[1]), xs = route.map((p) => point(p)[0]);
  const box = fit ? [Math.min(...xs) - PAD, Math.min(...ys) - PAD, Math.max(...xs) - Math.min(...xs) + 2 * PAD, Math.max(...ys) - Math.min(...ys) + 2 * PAD].map((v) => v.toFixed(2)).join(' ') : `0 0 ${SIZE} ${SIZE}`;
  return (
    <svg className={`route-face${className ? ` ${className}` : ''}`} viewBox={box} width="100%" focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <path className="route-face-glow" d={d} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <path className="route-face-line" d={d} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle className="route-face-start" cx={sx} cy={sy} r={2.6} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <g className="route-face-finish" transform={`translate(${(fx - 2.6).toFixed(2)} ${(fy - 2.6).toFixed(2)})`} fill="currentColor">
        <rect width="5.2" height="5.2" rx=".6" fillOpacity={0.25} stroke="currentColor" strokeWidth={0.5} />
        <rect width="2.6" height="2.6" />
        <rect x="2.6" y="2.6" width="2.6" height="2.6" />
      </g>
    </svg>
  );
}
