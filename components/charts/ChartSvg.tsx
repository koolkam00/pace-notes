/**
 * One Top 100 chart as one server SVG: the form named by the spec, drawn on the fixed 340-unit canvas. The svg carries
 * role="img" and the takeaway as its name; the page's All numbers table is its twin.
 */
import type { ChartSpec } from '@/lib/charts/spec';
import type { UnitSystem } from '@/lib/units';
import { Big, Flow, Heatmap, Waffle } from './grid';
import { W, keyLayout, type Ctx } from './kit';
import { Bars, Dumbbell, Pyramid, Range, Slope, Stacked, type Drawn } from './rows';
import { Columns, Histogram, Lines, Multiples, Ridgeline, Scatter, Strip } from './xy';

export function draw(spec: ChartSpec, ctx: Ctx): Drawn {
  switch (spec.form) {
    case 'bars': return Bars(spec, ctx);
    case 'dumbbell': return Dumbbell(spec, ctx);
    case 'range': return Range(spec, ctx);
    case 'slope': return Slope(spec, ctx);
    case 'pyramid': return Pyramid(spec, ctx);
    case 'stacked': return Stacked(spec, ctx);
    case 'columns': return Columns(spec, ctx);
    case 'histogram': return Histogram(spec, ctx);
    case 'lines': return Lines(spec, ctx);
    case 'scatter': return Scatter(spec, ctx);
    case 'strip': return Strip(spec, ctx);
    case 'multiples': return Multiples(spec, ctx);
    case 'ridgeline': return Ridgeline(spec, ctx);
    case 'heatmap': return Heatmap(spec, ctx);
    case 'waffle': return Waffle(spec, ctx);
    case 'big': return Big(spec, ctx);
    case 'flow': return Flow(spec, ctx);
  }
}

/** `fit`: the height (units) a fixed frame gives the chart; the card passes it, the page lets the chart take its own. */
export default function ChartSvg({ spec, label, units = 'mi', fit }: { spec: ChartSpec; label: string; units?: UnitSystem; fit?: number }) {
  // Forms that name their marks directly never take a key; a spec's own key (two encodings) sits above the plot.
  const ownKey = spec.form === 'stacked' || spec.form === 'dumbbell' ? { node: null, height: 0 } : keyLayout(spec.key, 14);
  const ctx: Ctx = { units, fit: fit ? fit - ownKey.height - 2 : undefined };
  const drawn = draw(spec, ctx);
  const height = Math.ceil(drawn.height + ownKey.height + 2);
  return (
    <svg className="cx" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} style={{ aspectRatio: `${W} / ${height}` }}>
      {ownKey.node}
      <g transform={ownKey.height ? `translate(0 ${ownKey.height})` : undefined}>{drawn.node}</g>
    </svg>
  );
}
