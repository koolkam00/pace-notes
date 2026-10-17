import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Scrubber from '@/components/viz/Scrubber.client';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, type LabelItem } from '@/components/viz/labels';
import { extent, linear, linePath, pc, yScale } from '@/components/viz/scale';

/**
 * The median finish, edition by edition (the redesign spec, section 7.10 "#finish-times"): a dot per edition on a
 * time-scaled axis, joined only across consecutive years, so a year with no edition leaves the line broken rather than
 * closed up (the hero's year strip keys the gaps). The edition the sentence ends on is signal; the one it starts from is labelled;
 * no gridlines, since the two labels and the readout carry the values. Scrub the years: the readout gives each edition's
 * median and its finishes.
 */
export type EditionPoint = { year: number; seconds: number; display: string; side: string };

export default function EditionLine({ points, selected, from, label, sideLabel, height = 170, heightMd = 220 }: {
  points: EditionPoint[]; selected: number; from?: number; label: string; sideLabel: string; height?: number; heightMd?: number;
}) {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  const first = sorted[0].year, last = sorted[sorted.length - 1].year;
  const x = linear([first - 0.6, last + 0.6]);
  const [lo, hi] = extent(sorted.map((p) => p.seconds));
  const pad = Math.max(60, (hi - lo) * 0.12);
  const y = yScale(lo - pad, hi + pad, { top: 0.16, bottom: 0.06 });
  const sel = Math.max(0, sorted.findIndex((p) => p.year === selected));
  const start = from !== undefined ? sorted.findIndex((p) => p.year === from) : -1;
  // Runs of consecutive years, joined; the years between runs are gaps.
  const runs: EditionPoint[][] = [];
  for (const p of sorted) {
    const run = runs[runs.length - 1];
    if (run && p.year === run[run.length - 1].year + 1) run.push(p); else runs.push([p]);
  }
  const items: LabelItem[] = [];
  if (start >= 0 && start !== sel) items.push({ id: 'from', text: `${sorted[start].year} · ${sorted[start].display}`, x: x(sorted[start].year), y: y(sorted[start].seconds), priority: 2, size: 13, gap: 10 });
  items.push({ id: 'sel', text: sorted[sel].display, x: x(sorted[sel].year), y: y(sorted[sel].seconds), priority: 3, tone: 'signal', gap: 10 });
  const placed = placeLabels(items, { height, avoid: sorted.map((p) => ({ x: x(p.year), y: y(p.seconds), r: 5 })) });
  const plot = (
    <Plot paths={runs.filter((r) => r.length > 1).map((r) => <path key={r[0].year} className="l-ink2" d={linePath(r.map((p) => [x(p.year), y(p.seconds)]))} />)}>
      {sorted.map((p, i) => <circle key={p.year} className={i === sel ? 'm-signal' : 'm-ink'} cx={pc(x(p.year))} cy={pc(y(p.seconds))} r={i === sel ? 5.5 : 4} />)}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const span = last - first;
  const every = span > 12 ? 5 : span > 6 ? 2 : 1;
  const ticks = new Set([first, last]);
  for (let yr = Math.ceil(first / every) * every; yr <= last; yr += every) ticks.add(yr);
  const axis = <Axis ticks={[...ticks].sort((a, b) => a - b).map((yr) => ({ x: x(yr), label: String(yr), priority: yr === first || yr === last ? 2 : 1 }))} />;
  const scrub = {
    x: sorted.map((p) => x(p.year)), keys: sorted.map((p) => String(p.year)), values: sorted.map((p) => p.display),
    side: [{ label: sideLabel, values: sorted.map((p) => p.side) }],
  };
  const detents = [...new Set([sel, ...(start >= 0 ? [start] : [])])];
  return (
    <ChartFrame className="edition-line" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={scrub} initial={sel} detents={detents} label={label} axis={axis}>{plot}</Scrubber>}
    />
  );
}
