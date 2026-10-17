/**
 * Plot geometry for the server-drawn charts (the redesign spec, section 3.6). Every chart draws in fractions of its plot
 * box: x from 0 (left) to 1 (right), y from 0 (top) to 1 (bottom). Marks and labels take them as SVG percentages, and
 * lines and areas go in a nested 1000 × 1000 viewBox stretched to the box with non-scaling strokes. So one server render
 * fits any width: text stays at its own pixel size, dots stay round, and no chart needs JavaScript to lay itself out.
 */

/** A number rounded for an SVG attribute. */
export const r = (n: number, digits = 3) => Number(n.toFixed(digits));
/** A fraction as an SVG percentage: 0.375 → "37.5%". */
export const pc = (fraction: number) => `${r(fraction * 100, 3)}%`;
/** A fraction in the nested 1000-unit path space. */
export const u = (fraction: number) => r(fraction * 1000, 2);

export type Scale = ((v: number) => number) & { domain: [number, number] };

/** A linear map from a domain onto [r0, r1] (fractions). */
export function linear(domain: [number, number], range: [number, number] = [0, 1]): Scale {
  const [d0, d1] = domain;
  const span = d1 - d0 || 1;
  const f = ((v: number) => range[0] + ((v - d0) / span) * (range[1] - range[0])) as Scale;
  f.domain = [d0, d1];
  return f;
}

/** A vertical scale: value → fraction from the top, with `top` headroom kept free for labels above the marks. */
export function yScale(min: number, max: number, { top = 0.14, bottom = 0 } = {}): Scale {
  return linear([min, max], [1 - bottom, top]);
}

export function extent(values: number[]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo <= hi ? [lo, hi] : [0, 1];
}

/** Round tick values: about `count` steps of 1, 2, 2.5 or 5 × 10ⁿ covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const first = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(r(v, 6));
  return out;
}

/** A path through points (fractions), in the nested path space. */
export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${u(x)} ${u(y)}`).join('');
}

/** A closed area between an upper and a lower line (fractions), in the nested path space. */
export function areaPath(upper: [number, number][], lower: [number, number][]): string {
  if (!upper.length) return '';
  return `${linePath(upper)}${[...lower].reverse().map(([x, y]) => `L${u(x)} ${u(y)}`).join('')}Z`;
}

/** A step outline for one-unit bins (a histogram silhouette): bins of width `w` starting at each x. */
export function stepPath(bins: { x: number; y: number }[], w: number, base = 1): string {
  if (!bins.length) return '';
  let d = `M${u(bins[0].x)} ${u(base)}`;
  for (const b of bins) d += `L${u(b.x)} ${u(b.y)}L${u(b.x + w)} ${u(b.y)}`;
  return `${d}L${u(bins[bins.length - 1].x + w)} ${u(base)}Z`;
}

/** The top edge of a step silhouette, for its 1.5 px edge stroke. */
export function stepEdge(bins: { x: number; y: number }[], w: number): string {
  return bins.map((b, i) => `${i ? 'L' : 'M'}${u(b.x)} ${u(b.y)}L${u(b.x + w)} ${u(b.y)}`).join('');
}
