import type { CourseGeometry } from '@/lib/insights';

/**
 * A course's route as a face (the redesign spec, section 3.6 "Route"): the supplied route drawn as one 2.25 px line, a
 * start ring and a finish square, each the same size on screen whatever the box (non-scaling strokes; a zero-length
 * stroke draws a fixed-size mark), so a complex route never thickens into a blob and its ends never drown in it. A
 * server SVG in a box that fits any width. It draws in currentColor: night ink in the hero, ink in the course rows; the
 * start ring's centre is the surface (--route-surface, paper by default). Decorative unless `label` names it.
 */
const SIZE = 100;
const PAD = 7;
/** Start and finish closer than this (viewBox units, about 7–14 px on screen) draw as one start/finish mark. */
const JOINED = 4;

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
      <path className="route-face-line" d={d} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {/* Start and finish a few units apart (an out-and-back or a loop) are one mark, a square inside the ring, never two
          marks run together into a blob. */}
      {Math.hypot(fx - sx, fy - sy) < JOINED ? (
        <g className="route-face-mark">
          <path d={`M${fx.toFixed(2)} ${fy.toFixed(2)}h0`} stroke="currentColor" strokeWidth={14} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M${fx.toFixed(2)} ${fy.toFixed(2)}h0`} stroke="var(--route-surface, var(--paper))" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M${fx.toFixed(2)} ${fy.toFixed(2)}h0`} stroke="currentColor" strokeWidth={5} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
        </g>
      ) : (
        <g className="route-face-mark">
          <path d={`M${sx.toFixed(2)} ${sy.toFixed(2)}h0`} stroke="currentColor" strokeWidth={10} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M${sx.toFixed(2)} ${sy.toFixed(2)}h0`} stroke="var(--route-surface, var(--paper))" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M${fx.toFixed(2)} ${fy.toFixed(2)}h0`} stroke="currentColor" strokeWidth={8} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
  );
}
