import type { ReactNode } from 'react';
import type { ChartSpec } from '@/lib/charts/spec';
import type { UnitSystem } from '@/lib/units';
import ChartSvg from './ChartSvg';

/**
 * A Top 100 chart's night card: the kicker (its number and theme), the title, the takeaway, the chart and the brand
 * line. The page draws it with an h1 title and the takeaway's term link; scripts/build-chart-cards.cjs draws the same
 * card at 400 × 500 CSS px and 2.7× for the 1080 × 1350 image.
 */
export default function ChartCard({ number, theme, title, takeaway, label, spec, units = 'mi', heading = 'h1', foot, fit, plot }: {
  number: number;
  theme: string;
  title: string;
  /** The takeaway, rendered (its accent as <em>). */
  takeaway: ReactNode;
  /** The takeaway as plain text: the chart's accessible name. */
  label: string;
  spec: ChartSpec;
  units?: UnitSystem;
  heading?: 'h1' | 'h2';
  foot: ReactNode;
  /** The plot height the card frame gives the chart (units); see ChartSvg. */
  fit?: number;
  /** The plot drawn by the caller (the page passes both unit versions of a pace or temperature chart). */
  plot?: ReactNode;
}) {
  const Heading = heading;
  return (
    <article className="chart-card night" data-chart={number}>
      <p className="chart-card-kicker"><span><b>No. {number}</b> of 100</span><span>{theme}</span></p>
      <Heading className="chart-card-title">{title}</Heading>
      <p className="chart-card-take">{takeaway}</p>
      <div className="chart-card-plot">{plot ?? <ChartSvg spec={spec} label={label} units={units} fit={fit} />}</div>
      <div className="chart-card-foot">{foot}</div>
    </article>
  );
}
