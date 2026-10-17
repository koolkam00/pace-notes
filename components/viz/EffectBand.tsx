import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Gridlines, RefLine } from './Plot';
import { linear, niceTicks, pc, yScale } from './scale';
import type { UnitSystem } from '@/lib/units';
import { perDegree } from '@/lib/nuggets/format';

/**
 * A binned effect band (the redesign spec, section 3.6): a few binned means as dots with whiskers around a zero line,
 * and the fitted estimate with its interval as a band. A result whose interval stays inside the ±`nullBand` "no
 * material difference" band is drawn grey: a null result looks null.
 *
 * Effects per degree arrive per °C (the data's unit) and `units` is required: the chart converts every value to the
 * reader's degree (per °F = per °C ÷ 1.8 in miles mode) and names it on the gridlines, so a per-°C slope can never sit
 * beside a °F axis (verify-units renders both). The scale runs from zero (or the lowest interval end) to the highest
 * interval end, rounded to a round step, so the ticks sit right under the bottom gridline and no whisker leaves it.
 */
export type EffectBin = { id: string; label: string; value: number; lo: number; hi: number };

export default function EffectBand({ bins, estimate, units, nullBand = 0.5, unit = 'pts', label, values, height = 200, heightMd = 240 }: {
  bins: EffectBin[]; estimate?: { value: number; lo: number; hi: number; label: string }; units: UnitSystem; nullBand?: number; unit?: string;
  label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const per = (v: number) => perDegree(v, units);
  const shown = bins.map((b) => ({ ...b, value: per(b.value), lo: per(b.lo), hi: per(b.hi) }));
  const est = estimate ? { ...estimate, value: per(estimate.value), lo: per(estimate.lo), hi: per(estimate.hi) } : undefined;
  const band = per(nullBand);
  const ends = [0, band, -band, ...shown.flatMap((b) => [b.lo, b.hi]), ...(est ? [est.lo, est.hi] : [])];
  const ticks = niceTicks(Math.min(...ends), Math.max(...ends), 5);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const lo = Math.min(ticks[0], Math.floor(Math.min(...ends) / step) * step);
  const hi = Math.max(ticks[ticks.length - 1], Math.ceil(Math.max(...ends) / step) * step);
  const y = yScale(lo, hi, { top: 0.1, bottom: 0 });
  // The bins sit inside the plot's ends, leaving the left edge to the scale's labels.
  const x = linear([-0.6, bins.length]);
  const isNull = (a: number, b: number) => a >= -band && b <= band;
  const deg = units === 'mi' ? '°F' : '°C';
  const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const signed = (v: number) => (v > 0 ? `+${v.toFixed(digits)}` : v < 0 ? `−${Math.abs(v).toFixed(digits)}` : '0');
  const grid = [hi, ...(lo < 0 ? [lo] : [])].filter((g) => g !== 0);
  const plot = (
    <Plot>
      <rect className="effect-null-band" x="0" width="100%" y={pc(y(Math.min(band, hi)))} height={pc(y(Math.max(-band, lo)) - y(Math.min(band, hi)))} />
      <Gridlines lines={grid.map((g) => ({ y: y(g), label: `${signed(g)} ${unit} per ${deg}` }))} />
      {est ? (
        <g className={isNull(est.lo, est.hi) ? 'effect-null' : 'effect-on'}>
          <rect className="effect-band" x="0" width="100%" y={pc(y(est.hi))} height={pc(y(est.lo) - y(est.hi))} />
          <line className="effect-estimate" x1="0" x2="100%" y1={pc(y(est.value))} y2={pc(y(est.value))} />
        </g>
      ) : null}
      <RefLine y={y(0)} />
      {shown.map((b, i) => {
        const cx = pc(x(i + 0.5));
        return (
          <g key={b.id} className={isNull(b.lo, b.hi) ? 'effect-null' : 'effect-on'}>
            <rect className="effect-whisker" x={cx} width={1.5} transform="translate(-0.75 0)" y={pc(y(b.hi))} height={pc(y(b.lo) - y(b.hi))} />
            <circle className="effect-dot" cx={cx} cy={pc(y(b.value))} r={5} />
          </g>
        );
      })}
    </Plot>
  );
  return (
    <ChartFrame className="effect-band-chart" label={label} height={height} heightMd={heightMd} plot={plot}
      axis={<Axis ticks={bins.map((b, i) => ({ x: x(i + 0.5), label: b.label }))} />}
      keys={[{ label: 'Binned mean, with its interval', mark: 'dot' }, ...(est ? [{ label: est.label, mark: 'band' as const, tone: 'signal' as const }] : []), { label: 'No material difference', mark: 'band' as const, tone: 'quiet' as const }]}
      values={values}
    />
  );
}
