import type { CSSProperties, ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import { areaPath, linear, linePath, pc } from '@/components/viz/scale';
import { textWidth } from '@/components/viz/labels';
import { typeStyle } from '@/lib/viz/palette';

/**
 * The pacing types by finish time (the redesign spec, section 3.6, stacked river, calmed under section 00): every
 * finish band split into the six types, fastest bands on the left. The streams are quiet; the type the H2 names takes
 * its colour, its name and its share at both ends. There is no control: the headline is about one type, so the chart
 * shows that one (the other types' shares are in Values). Type colours are data: the type always sits next to its name.
 */
export type RiverBand = { x: number; shares: number[] };

export default function TypeRiver({ bands, types, subject, ticks, label, values }: {
  bands: RiverBand[]; types: { id: string; name: string; index: number }[]; subject: number; ticks: { value: number; label: string }[]; label: string; values?: ReactNode;
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
  const t = types[subject];
  const first = edges[subject][0], last = edges[subject][edges[subject].length - 1];
  const a = bands[0].shares[subject], b = bands[bands.length - 1].shares[subject];
  // Each end's share on a tab of the stream's own colour, so it reads on a thin stream as well as a wide one; the left
  // tab, where the stream is widest, names the type too.
  const tab = (share: string, end: boolean, at: number, name?: string) => {
    const text = name ? `${name} ${share}` : share;
    const w = Math.round(textWidth(text, 14) + 14);
    return (
      <g>
        <rect className="river-tab" x={end ? '100%' : '0'} y={pc(at)} width={w} height={24} rx={4} transform={`translate(${end ? -w - 4 : 4} -12)`} />
        <text className="river-end" x={end ? '100%' : '0'} y={pc(at)} dx={end ? -4 - w / 2 : 4 + w / 2} dy={5} textAnchor="middle">{text}</text>
      </g>
    );
  };
  const plot = (
    <Plot>
      <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
        {types.map((s, j) => <path key={s.id} className="river-stream" d={areaPath(pts(j, 'hi'), pts(j, 'lo'))} />)}
        {/* The seams between streams, drawn once each; the river's outer edge is the plot's own, so nothing frames it. */}
        {types.slice(0, -1).map((s, j) => <path key={`seam-${s.id}`} className="river-seam" d={linePath(pts(j, 'hi'))} />)}
        <path className="river-on" style={typeStyle(t.index) as CSSProperties} d={areaPath(pts(subject, 'hi'), pts(subject, 'lo'))} />
      </svg>
      <g style={typeStyle(t.index) as CSSProperties}>
        {tab(pct(a), false, mid(first), t.name)}
        {tab(pct(b), true, mid(last))}
      </g>
      <Baseline />
    </Plot>
  );
  return (
    <ChartFrame className="type-river" label={label} height={240} heightMd={300}
      plot={plot} axis={<Axis ticks={ticks.map((tk) => ({ x: x(tk.value), label: tk.label }))} title={{ start: 'Quicker finishes', end: 'Slower finishes' }} />}
      values={values} />
  );
}
