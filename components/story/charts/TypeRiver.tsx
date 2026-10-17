import type { CSSProperties, ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Lens from '@/components/viz/Lens.client';
import { areaPath, linear, pc } from '@/components/viz/scale';
import { typeStyle } from '@/lib/viz/palette';

/**
 * The pacing types by finish time (the redesign spec, section 3.6, stacked river, calmed under section 00): every
 * finish band split into the six types, fastest bands on the left. The streams are quiet; the chosen type (a lens of
 * type chips, opening on the type the sentence names) takes its colour and its share at both ends. Type colours are data
 * here: each type always sits next to its name.
 */
export type RiverBand = { x: number; shares: number[] };

export default function TypeRiver({ bands, types, initial, ticks, label, values }: {
  bands: RiverBand[]; types: { id: string; name: string; index: number }[]; initial: string; ticks: { value: number; label: string }[]; label: string; values?: ReactNode;
}) {
  const x = linear([bands[0].x, bands[bands.length - 1].x]);
  // Each stream's lower and upper edge in every band, as fractions from the top (shares stack from the bottom).
  const edges = types.map((_, j) => bands.map((b) => {
    const total = b.shares.reduce((s, v) => s + v, 0) || 1;
    const lower = b.shares.slice(0, j).reduce((s, v) => s + v, 0) / total;
    return { lo: lower, hi: lower + b.shares[j] / total };
  }));
  const pts = (j: number, key: 'lo' | 'hi') => edges[j].map((e, i) => [x(bands[i].x), 1 - e[key]] as [number, number]);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  // A label sits on its stream's middle, kept inside the plot.
  const mid = (e: { lo: number; hi: number }) => Math.min(0.96, Math.max(0.08, 1 - (e.lo + e.hi) / 2));
  const plot = (
    <Plot>
      <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
        {types.map((t, j) => <path key={t.id} className="river-stream" d={areaPath(pts(j, 'hi'), pts(j, 'lo'))} />)}
        {types.map((t, j) => (
          <path key={`on-${t.id}`} className={`river-on${t.id === initial ? '' : ' is-off'}`} data-layer={t.id} style={typeStyle(t.index) as CSSProperties} d={areaPath(pts(j, 'hi'), pts(j, 'lo'))} />
        ))}
      </svg>
      {types.map((t, j) => {
        const first = edges[j][0], last = edges[j][edges[j].length - 1];
        const a = bands[0].shares[j], b = bands[bands.length - 1].shares[j];
        return (
          <g key={`l-${t.id}`} data-layer={t.id} className={t.id === initial ? undefined : 'is-off'}>
            <text className="viz-label river-end" x="0" dx={6} y={pc(mid(first))} dy={5}>{pct(a)}</text>
            <text className="viz-label river-end" x="100%" dx={-6} textAnchor="end" y={pc(mid(last))} dy={5}>{pct(b)}</text>
          </g>
        );
      })}
      <Baseline />
    </Plot>
  );
  return (
    <ChartFrame className="type-river" label={label} height={240} heightMd={300} k={initial}
      lens={<Lens label="Pacing type" chips options={types.map((t) => ({ value: t.id, label: t.name }))} defaultValue={initial} />}
      plot={plot} axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} title={{ start: 'Quicker finishes', end: 'Slower finishes' }} />}
      values={values} />
  );
}
