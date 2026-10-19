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
  // The left end's share on a tab of the stream's own colour, where the stream is widest, naming the type too; the right
  // end's share, where the stream is thin, sits just above its top edge with no box, so nothing crosses the plot's foot.
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
  // The neighbouring stream (above the named one, else below): its name at its widest band, when it is 22 px or more
  // tall at the phone height.
  const nb = subject + 1 < types.length ? subject + 1 : subject - 1;
  const other = (() => {
    if (nb < 0) return null;
    const widths = edges[nb].map((e) => e.hi - e.lo);
    const i = widths.indexOf(Math.max(...widths));
    if (widths[i] * 240 < 22) return null;
    const fx = x(bands[i].x);
    return { name: types[nb].name, x: fx, y: 1 - (edges[nb][i].lo + edges[nb][i].hi) / 2, anchor: fx < 0.2 ? 'start' as const : fx > 0.8 ? 'end' as const : 'middle' as const };
  })();
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
        <text className="river-end is-plain" x="100%" y={pc(1 - last.hi)} dx={-4} dy={-7} textAnchor="end">{pct(b)}</text>
      </g>
      {/* The stream next to the named one carries its own name, quietly, where it is widest, so the quiet layers read as
          the other types rather than unlabelled grey. */}
      {other ? <text className="river-other" x={pc(other.x)} y={pc(other.y)} dy={4} textAnchor={other.anchor}>{other.name}</text> : null}
      <Baseline />
    </Plot>
  );
  return (
    <ChartFrame className="type-river" label={label} height={240} heightMd={300}
      plot={plot} axis={<Axis ticks={ticks.map((tk) => ({ x: x(tk.value), label: tk.label }))} title={{ start: 'Quicker finishes', end: 'Slower finishes' }} />}
      values={values} />
  );
}
