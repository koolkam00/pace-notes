import type { ComponentProps } from 'react';
import type LineProfile from './LineProfile';
import { REF_WIDTH, WIDTH_STEPS, textWidth, type Box } from './labels';
import { extent, linear, yScale } from './scale';

type Profile = ComponentProps<typeof LineProfile>;

/** The plot sizes a gridline label is checked at: the phone widths from 200% zoom up, then a desktop figure. */
const SIZES = (height: number, heightMd: number): [number, number][] =>
  [...WIDTH_STEPS, REF_WIDTH, 360].map((w) => [w, height] as [number, number]).concat([[720, heightMd]]);

/**
 * The gridline labels of a LineProfile with `flipGrid: 'needle'` that have no place at its first stops: there the
 * labels stand just past the needle, and a label whose box meets the data (a line of the first layer or its band) at
 * some plot width is left out at those stops instead (its gridline stays, and the readout gives the values). At the half
 * story's first stops "3:00" sat on the typical-marathon line and the band, its halo cutting a notch in the line (post-
 * merge review, round 5, October 31, 2026); 4:00, 5:00 and 6:00 stay. Moved to the far end of its line it would have
 * been clear, but a figure's gridline labels share one edge (lint-layout check 12).
 *
 * It repeats LineProfile's own geometry (its scales, the stops whose needle runs through the labels' column and where
 * their copies start), so a server page marks its ticks (`crowded`) without adding code to LineProfile, which the
 * analyses ship as script (their first-load budgets, S8). Returns the tick values to mark.
 */
export function crowdedFlipLabels(p: Profile): Set<number> {
  const out = new Set<number>();
  const { x: xs, xDomain, yDomain, yTicks = [], gridSide = 'right', layers, scrub, height = 220, heightMd = 280 } = p;
  const layer = layers.find((l) => l.id === p.initial) ?? layers[0];
  if (!scrub || scrub.flipGrid !== 'needle' || !layer) return out;
  const x = linear(xDomain ?? extent(xs));
  const all = layers.flatMap((l) => [...l.series.flatMap((s) => s.values), ...(l.band ? [...l.band.lo, ...l.band.hi] : [])]).concat((p.refs ?? []).map((r) => r.value));
  const [lo, hi] = yDomain ?? extent(all);
  const pad = (hi - lo) * 0.06 || 1;
  const y = yScale(yDomain ? lo : lo - pad, yDomain ? hi : hi + pad, { top: 0.12, bottom: yDomain && lo === 0 ? 0 : 0.04 });
  const gridW = Math.max(0, ...yTicks.map((t) => textWidth(t.label, 12, 500) + 6));
  const flips = scrub.points.x.flatMap((px, i) => ((gridSide === 'left' ? px : 1 - px) * REF_WIDTH <= gridW ? [i] : []));
  if (!flips.length) return out;
  const fx = scrub.points.x[flips[flips.length - 1]];
  // The data's value at a fraction across the plot, between its points.
  const valueAt = (values: number[], f: number) => {
    for (let i = 1; i < xs.length; i++) {
      const a = x(xs[i - 1]), b = x(xs[i]);
      if (f <= b || i === xs.length - 1) return values[i - 1] + (values[i] - values[i - 1]) * (b === a ? 0 : Math.max(0, Math.min(1, (f - a) / (b - a))));
    }
    return values[0];
  };
  const meets = (box: Box, w: number, h: number) => {
    for (let px = box.x0; px <= box.x1; px += 2) {
      const f = px / w;
      if (layer.series.some((s) => { const gy = y(valueAt(s.values, f)) * h; return gy > box.y0 - 2 && gy < box.y1 + 2; })) return true;
      if (layer.band && y(valueAt(layer.band.hi, f)) * h < box.y1 && y(valueAt(layer.band.lo, f)) * h > box.y0) return true;
    }
    return false;
  };
  for (const t of yTicks) {
    // The label's digits: 12 px, set 5 px over the line (Gridlines), with a pixel either side, 6 px past the needle.
    const lw = textWidth(t.label, 12, 500) + 2;
    const box = (w: number, h: number): Box => { const gy = y(t.value) * h, x0 = gridSide === 'left' ? fx * w + 6 : fx * w - 6 - lw; return { x0, x1: x0 + lw, y0: gy - 15, y1: gy - 4 }; };
    if (SIZES(height, heightMd).some(([w, h]) => meets(box(w, h), w, h))) out.add(t.value);
  }
  return out;
}
