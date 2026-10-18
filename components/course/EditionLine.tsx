import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Scrubber from '@/components/viz/Scrubber.client';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, REF_WIDTH, textWidth, type LabelItem } from '@/components/viz/labels';
import { extent, linear, linePath, pc, yScale } from '@/components/viz/scale';
import { yearTicks } from '@/components/viz/YearStrip';

/**
 * The median finish, edition by edition (the redesign spec, section 7.10 "#finish-times"): a dot per edition on a
 * time-scaled axis, joined only across consecutive years, so a year with no edition leaves the line broken rather than
 * closed up. The y scale spans at least 20 minutes, centred on the editions, so a few seconds never draw as a climb or a
 * drop, and up to two round-minute gridlines carry it, labelled inside the plot on its left. The edition the readout
 * opens on (the one the sentence ends on) is signal and unlabelled, since the readout names it; the one the sentence
 * starts from is labelled. Scrub the years: the readout gives each edition's median and its finishes.
 */
export type EditionPoint = { year: number; seconds: number; display: string; side: string };

/** The fewest minutes the y scale spans. */
const MIN_SPAN_S = 20 * 60;
/** Gridline steps, in minutes: the first that puts one to three lines inside the plot. */
const GRID_STEPS = [5, 10, 15, 30, 60];
const hm = (seconds: number) => { const m = Math.round(seconds / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

export default function EditionLine({ points, selected, from, label, sideLabel, height = 170, heightMd = 220 }: {
  points: EditionPoint[]; selected: number; from?: number; label: string; sideLabel: string; height?: number; heightMd?: number;
}) {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  const first = sorted[0].year, last = sorted[sorted.length - 1].year;
  const x = linear([first - 0.6, last + 0.6]);
  const [lo, hi] = extent(sorted.map((p) => p.seconds));
  const span = Math.max(MIN_SPAN_S, (hi - lo) * 1.35);
  const mid = (lo + hi) / 2;
  const y = yScale(mid - span / 2, mid + span / 2, { top: 0.1, bottom: 0.1 });
  const sel = Math.max(0, sorted.findIndex((p) => p.year === selected));
  const start = from !== undefined ? sorted.findIndex((p) => p.year === from) : -1;
  // Runs of consecutive years, joined; the years between runs are gaps.
  const runs: EditionPoint[][] = [];
  for (const p of sorted) {
    const run = runs[runs.length - 1];
    if (run && p.year === run[run.length - 1].year + 1) run.push(p); else runs.push([p]);
  }
  const dots = sorted.map((p) => ({ x: x(p.year), y: y(p.seconds), r: 5 }));
  // The joined runs as points sampled along each segment (plot fractions), for every label to keep clear of.
  const along = runs.flatMap((r) => r.slice(1).flatMap((p, i) => {
    const a = r[i];
    return Array.from({ length: 13 }, (_, k) => ({ x: x(a.year) + ((x(p.year) - x(a.year)) * k) / 12, y: y(a.seconds) + ((y(p.seconds) - y(a.seconds)) * k) / 12, r: 2 }));
  }));
  // The edition the sentence starts from is labelled first (the sentence names it): clear of the dots, of the line and
  // of the needle at the selected edition.
  const items: LabelItem[] = [];
  if (start >= 0 && start !== sel) items.push({ id: 'from', text: `${sorted[start].year} · ${sorted[start].display}`, x: x(sorted[start].year), y: y(sorted[start].seconds), priority: 3, size: 13, gap: 10 });
  const needle = { x0: x(sorted[sel].year), x1: x(sorted[sel].year), y0: 0, y1: 1, pad: 4 };
  // The line is avoided along its length, not by its segments' boxes, so a label may sit in the open corner beside a
  // diagonal.
  let placed = placeLabels(items, { height, avoid: [...dots, ...along], boxes: [needle] });
  // Among many editions the full label may find no room: the year alone then marks the edition (the sentence gives its time).
  if (placed.some((l) => l.minWidth === null)) placed = placeLabels(items.map((it) => ({ ...it, text: String(sorted[start].year) })), { height, avoid: [...dots, ...along], boxes: [needle] });
  // Its box at the narrowest phone, in plot fractions, for the gridline labels to keep clear of.
  const taken = placed.filter((l) => l.minWidth !== null).map((l) => {
    const w = textWidth(l.text, l.size ?? 14), ax = l.x * REF_WIDTH + l.dx;
    const x0 = l.anchor === 'middle' ? ax - w / 2 : l.anchor === 'end' ? ax - w : ax;
    const base = l.y * height + l.dy;
    // Wide margins either side, so a gridline's label never reads as part of this one on the same baseline.
    return { x0: (x0 - 16) / REF_WIDTH, x1: (x0 + w + 16) / REF_WIDTH, y0: (base - 15) / height, y1: (base + 6) / height };
  });
  // Round-minute gridlines inside the plot, each labelled at the left above its line (or below it when a dot, the line
  // or the label above sits there); a line whose label has no clear spot is left out, since an unlabelled line carries
  // nothing.
  const inside = (v: number) => y(v) > 0.04 && y(v) < 0.96;
  const step = (GRID_STEPS.find((m) => {
    const n = Array.from({ length: 200 }, (_, k) => Math.ceil((mid - span / 2) / (m * 60)) * m * 60 + k * m * 60).filter((v) => v <= mid + span / 2 && inside(v)).length;
    return n >= 1 && n <= 3;
  }) ?? 60) * 60;
  const meets = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const grid: { y: number; label: string; dy: number }[] = [];
  for (let v = Math.ceil((mid - span / 2) / step) * step; v <= mid + span / 2 && grid.length < 2; v += step) {
    if (!inside(v)) continue;
    const text = hm(v);
    const w = (textWidth(text, 12, 500) + 6) / REF_WIDTH;
    const fy = y(v);
    const spot = [-5, 15].map((dy) => ({ dy, box: { x0: 0, x1: w, y0: fy + (dy - 11) / height, y1: fy + (dy + 2) / height } }))
      .find(({ box }) => box.y0 >= 0 && box.y1 <= 1 && !taken.some((t) => meets(t, box))
        && ![...dots, ...along].some((d) => meets({ x0: d.x - d.r / REF_WIDTH, x1: d.x + d.r / REF_WIDTH, y0: d.y - d.r / height, y1: d.y + d.r / height }, box)));
    if (spot) { grid.push({ y: fy, label: text, dy: spot.dy }); taken.push(spot.box); }
  }
  const plot = (
    <Plot paths={runs.filter((r) => r.length > 1).map((r) => <path key={r[0].year} className="l-ink2" d={linePath(r.map((p) => [x(p.year), y(p.seconds)]))} />)}>
      <g className="viz-grid">
        {grid.map((g) => (
          <g key={g.label}>
            <rect className="grid-line" x="0" y={pc(g.y)} width="100%" height="1" />
            <text className="tick grid-label" x="0" y={pc(g.y)} dy={g.dy}>{g.label}</text>
          </g>
        ))}
      </g>
      {sorted.map((p, i) => <circle key={p.year} className={i === sel ? 'm-signal is-reading' : 'm-ink'} cx={pc(x(p.year))} cy={pc(y(p.seconds))} r={i === sel ? 5.5 : 4} />)}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={yearTicks(first, last).map((yr) => ({ x: x(yr), label: String(yr) }))} />;
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
