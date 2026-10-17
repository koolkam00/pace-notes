import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Gridlines, RefLine } from './Plot';
import { linear, pc, yScale } from './scale';

/**
 * A binned effect band (the redesign spec, section 3.6): a few binned means as dots with whiskers on a symmetric scale
 * around a zero line, and the fitted estimate with its interval as a band. A result whose interval stays inside the
 * ±`nullBand` "no material difference" band is drawn grey: a null result looks null.
 */
export type EffectBin = { id: string; label: string; value: number; lo: number; hi: number };

export default function EffectBand({ bins, estimate, span = 5, nullBand = 1, unit = 'pts', label, values, height = 200, heightMd = 240 }: {
  bins: EffectBin[]; estimate?: { value: number; lo: number; hi: number; label: string }; span?: number; nullBand?: number; unit?: string;
  label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const y = yScale(-span, span, { top: 0.08, bottom: 0.08 });
  // The bins sit inside the plot's ends, leaving the left edge to the scale's labels.
  const x = linear([-0.6, bins.length]);
  const isNull = (lo: number, hi: number) => lo >= -nullBand && hi <= nullBand;
  const clip = (v: number) => Math.max(-span, Math.min(span, v));
  const grid = [span / 2, 0, -span / 2];
  const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
  const plot = (
    <Plot>
      <rect className="effect-null-band" x="0" width="100%" y={pc(y(nullBand))} height={pc(y(-nullBand) - y(nullBand))} />
      <Gridlines lines={grid.filter((g) => g !== 0).map((g) => ({ y: y(g), label: `${signed(g)} ${unit}` }))} />
      {estimate ? (
        <g className={isNull(estimate.lo, estimate.hi) ? 'effect-null' : 'effect-on'}>
          <rect className="effect-band" x="0" width="100%" y={pc(y(clip(estimate.hi)))} height={pc(y(clip(estimate.lo)) - y(clip(estimate.hi)))} />
          <line className="effect-estimate" x1="0" x2="100%" y1={pc(y(estimate.value))} y2={pc(y(estimate.value))} />
        </g>
      ) : null}
      <RefLine y={y(0)} />
      {bins.map((b, i) => {
        const cx = pc(x(i + 0.5));
        return (
          <g key={b.id} className={isNull(b.lo, b.hi) ? 'effect-null' : 'effect-on'}>
            <rect className="effect-whisker" x={cx} width={1.5} transform="translate(-0.75 0)" y={pc(y(clip(b.hi)))} height={pc(y(clip(b.lo)) - y(clip(b.hi)))} />
            <circle className="effect-dot" cx={cx} cy={pc(y(clip(b.value)))} r={5} />
          </g>
        );
      })}
    </Plot>
  );
  return (
    <ChartFrame className="effect-band-chart" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={bins.map((b, i) => ({ x: x(i + 0.5), label: b.label }))} />}
      keys={[{ label: 'Binned mean, with its interval', mark: 'dot' }, ...(estimate ? [{ label: estimate.label, mark: 'band' as const, tone: 'signal' as const }] : []), { label: `No material difference (±${nullBand} ${unit})`, mark: 'band' as const, tone: 'quiet' as const }]}
      values={values}
    />
  );
}
