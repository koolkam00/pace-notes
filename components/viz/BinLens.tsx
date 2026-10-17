import type { CSSProperties, ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline } from './Plot';
import Lens from './Lens.client';
import { linear, pc } from './scale';

/**
 * Ten-second bins around a mark (the redesign spec, section 3.6): the seconds either side of a round finish time.
 * Bins before the mark in ink, after it quiet, the peak in signal with its label ("−70 s"); the mark itself a solid ink
 * line. A Segmented control picks the mark, and the columns spring to its shape (each column is drawn at full height
 * and scaled, so only transform animates). The figure opens on the mark its headline names.
 */
export type BinMark = { id: string; label: string; bins: { offset_s: number; n: number }[]; peak_offset_s: number };

const MAX_MARKS = 6;

export default function BinLens({ marks, initial, label, values, height = 180, heightMd = 220 }: {
  marks: BinMark[]; initial: string; label: string; values?: ReactNode; height?: number; heightMd?: number;
}) {
  const shown = marks.slice(0, MAX_MARKS);
  const offsets = shown[0].bins.map((b) => b.offset_s);
  const step = offsets.length > 1 ? offsets[1] - offsets[0] : 10;
  const lo = offsets[0], hi = offsets[offsets.length - 1] + step;
  const x = linear([lo, hi]);
  const w = step / (hi - lo);
  const k = String(Math.max(0, shown.findIndex((m) => m.id === initial)));
  const top = 0.18;
  // Each column's height for every mark, as a share of that mark's own tallest bin.
  const heights = offsets.map((_, i) => shown.map((m) => m.bins[i].n / Math.max(1, ...m.bins.map((b) => b.n))));
  const peakIndex = shown.map((m) => m.bins.findIndex((b) => b.offset_s === m.peak_offset_s));
  const seconds = (s: number) => (s === 0 ? 'mark' : `${s < 0 ? '−' : '+'}${Math.abs(s) % 60 === 0 ? `${Math.abs(s) / 60} min` : `${Math.abs(s)} s`}`);
  return (
    <ChartFrame className="bin-lens" label={label} height={height} heightMd={heightMd} k={k}
      lens={<Lens label="Round finish time" options={shown.map((m, i) => ({ value: String(i), label: m.label }))} defaultValue={k} />}
      plot={(
        <Plot>
          <g className="bin-cols">
            {offsets.map((off, i) => {
              const style = Object.fromEntries(heights[i].map((h, j) => [`--h${j}`, h.toFixed(4)])) as CSSProperties;
              const peaks = peakIndex.map((p, j) => (p === i ? ` peak-${j}` : '')).join('');
              return <rect key={off} className={`bin ${off < 0 ? 'is-before' : 'is-after'}${peaks}`} style={style} x={pc(x(off) + w * 0.1)} width={pc(w * 0.8)} y={pc(top)} height={pc(1 - top)} rx={2} />;
            })}
          </g>
          <rect className="bin-mark" x={pc(x(0))} y="0" width="1.5" height="100%" transform="translate(-0.75 0)" />
          {shown.map((m, j) => {
            const i = peakIndex[j];
            if (i < 0) return null;
            const h = heights[i][j];
            return (
              <text key={m.id} className={`viz-label is-signal bin-peak${String(j) === k ? '' : ' is-off'}`} data-layer={String(j)} x={pc(x(m.peak_offset_s) + w / 2)} y={pc(top + (1 - top) * (1 - h))} dy={-8} textAnchor={x(m.peak_offset_s) > 0.8 ? 'end' : 'middle'}>
                {seconds(m.peak_offset_s)}
              </text>
            );
          })}
          <Baseline />
        </Plot>
      )}
      axis={<Axis ticks={[-180, -120, -60, 0, 60, 120].filter((s) => s >= lo && s <= hi).map((s) => ({ x: x(s), label: seconds(s), priority: s === 0 ? 3 : undefined }))} />}
      values={values}
    />
  );
}
