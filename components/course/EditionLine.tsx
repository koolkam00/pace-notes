import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Scrubber from '@/components/viz/Scrubber.client';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, REF_WIDTH, textWidth, type LabelItem, type PlacedLabel } from '@/components/viz/labels';
import { extent, linear, linePath, pc, yScale } from '@/components/viz/scale';
import { yearPad, yearTicks } from '@/components/viz/YearStrip';

/**
 * The median finish, edition by edition (the redesign spec, section 7.10 "#finish-times"): a dot per edition on a
 * time-scaled axis, joined only across consecutive years, so a year with no edition leaves the line broken (no band,
 * which would read as a highlight); the editions are the scrub points, so the needle steps across a gap. The y scale spans at least 20 minutes,
 * centred on the editions, so a few seconds never draw as a climb or a drop (a steady course draws flat), and two to
 * four round-minute gridlines bracket the editions, one at or below the quickest and one at or above the slowest, each
 * labelled above its own line, all on one side (the left, else the right); a line that side cannot label is not drawn.
 * The edition the readout opens on (the one the sentence accents) is signal
 * and unlabelled, since the readout names it; the other the sentence names is labelled in one format, on a leader where
 * the editions crowd it, and hides while the needle sits on it. Scrub the years: each edition's median and finishes.
 */
export type EditionPoint = { year: number; seconds: number; display: string; side: string };

/** The fewest minutes the y scale spans. */
const MIN_SPAN_S = 20 * 60;
/** Gridline steps, in minutes: the first whose lines bracket the editions in four lines or fewer. */
const GRID_STEPS = [5, 10, 15, 30, 60];
/** The most gridlines a step may draw to bracket the editions. */
const MAX_LINES = 4;
const hm = (seconds: number) => { const m = Math.round(seconds / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

export default function EditionLine({ points, selected, from, label, sideLabel, height = 170, heightMd = 220 }: {
  points: EditionPoint[]; selected: number; from?: number; label: string; sideLabel: string; height?: number; heightMd?: number;
}) {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  const first = sorted[0].year, last = sorted[sorted.length - 1].year;
  const pad = yearPad(first, last);
  const x = linear([first - pad, last + pad]);
  const [lo, hi] = extent(sorted.map((p) => p.seconds));
  // The gridlines: the first step whose round lines from at or below the quickest median to at or above the slowest
  // number four or fewer; at least two, so the slope has a scale to be read against.
  const step = (GRID_STEPS.find((m) => (Math.ceil(hi / (m * 60)) - Math.floor(lo / (m * 60))) + 1 <= MAX_LINES) ?? 60) * 60;
  const g0 = Math.floor(lo / step) * step;
  const g1 = Math.max(Math.ceil(hi / step) * step, g0 + step);
  const lines = Array.from({ length: Math.round((g1 - g0) / step) + 1 }, (_, k) => g0 + k * step);
  // At least 20 minutes, centred on the editions, and always the bracketing lines.
  const half = Math.max(MIN_SPAN_S, (hi - lo) * 1.35) / 2;
  const mid = (lo + hi) / 2;
  // The top line's label sits above it inside the plot: at least 17 px of room over the highest line.
  const y = yScale(Math.min(mid - half, g0), Math.max(mid + half, g1), { top: Math.max(0.1, 17 / height), bottom: 0.1 });
  const sel = Math.max(0, sorted.findIndex((p) => p.year === selected));
  const start = from !== undefined ? sorted.findIndex((p) => p.year === from) : -1;
  // Runs of consecutive years, joined; the years between runs are gaps.
  const runs: EditionPoint[][] = [];
  for (const p of sorted) {
    const run = runs[runs.length - 1];
    if (run && p.year === run[run.length - 1].year + 1) run.push(p); else runs.push([p]);
  }
  // The editions are the scrub points (a gap year is never one): the needle snaps edition to edition.
  const scrubOf = (year: number) => sorted.findIndex((p) => p.year === year);
  const dots = sorted.map((p) => ({ x: x(p.year), y: y(p.seconds), r: 5 }));
  // The joined runs as points sampled along each segment (plot fractions), for every label to keep clear of.
  const along = runs.flatMap((r) => r.slice(1).flatMap((p, i) => {
    const a = r[i];
    return Array.from({ length: 13 }, (_, k) => ({ x: x(a.year) + ((x(p.year) - x(a.year)) * k) / 12, y: y(a.seconds) + ((y(p.seconds) - y(a.seconds)) * k) / 12, r: 2 }));
  }));
  // The edition the sentence starts from is labelled first (the sentence names it): clear of the dots, of the line and
  // of the needle at the selected edition.
  const needle = { x0: x(sorted[sel].year), x1: x(sorted[sel].year), y0: 0, y1: 1, pad: 4 };
  // The label at its dot, or lifted above every dot and the line within its width on a leader down to its dot (among
  // many editions, where the space beside the dot is taken).
  const fromItem = (text: string, lift: boolean): LabelItem => {
    const px = x(sorted[start].year), own = y(sorted[start].seconds);
    const half = (textWidth(text, 13) + 8) / REF_WIDTH;
    const top = lift ? Math.min(own, ...[...dots, ...along].filter((d) => Math.abs(d.x - px) < half).map((d) => d.y - 6 / height)) : own;
    return { id: 'from', text, x: px, y: top, priority: 3, size: 13, gap: 10, ...(lift ? { prefer: 'above' as const } : {}) };
  };
  // The line is avoided along its length, not by its segments' boxes, so a label may sit in the open corner beside a
  // diagonal. The label beside its dot first, else lifted on a leader: one format, never cut to the year alone.
  let placed: PlacedLabel[] = [];
  let lifted = false;
  if (start >= 0 && start !== sel) {
    const full = `${sorted[start].year} · ${sorted[start].display}`;
    for (const lift of [false, true]) {
      placed = placeLabels([fromItem(full, lift)], { height, avoid: [...dots, ...along], boxes: [needle] }).map((l) => ({ ...l, at: scrubOf(sorted[start].year) }));
      lifted = lift;
      if (placed.every((l) => l.minWidth !== null)) break;
    }
  }
  // Its box at the narrowest phone, in plot fractions, for the gridline labels to keep clear of.
  const taken = placed.filter((l) => l.minWidth !== null).map((l) => {
    const w = textWidth(l.text, l.size ?? 14), ax = l.x * REF_WIDTH + l.dx;
    const x0 = l.anchor === 'middle' ? ax - w / 2 : l.anchor === 'end' ? ax - w : ax;
    const base = l.y * height + l.dy;
    // Wide margins either side, so a gridline's label never reads as part of this one on the same baseline.
    return { x0: (x0 - 16) / REF_WIDTH, x1: (x0 + w + 16) / REF_WIDTH, y0: (base - 15) / height, y1: (base + 6) / height };
  });
  // Each bracketing line is labelled above itself, never below (a label under its line reads as the band below's), and
  // every label on one side (critic round 4: labels jumping between the ends read as improvised): the left end, else
  // the right end, else just inside the resting needle where it stands at the right, whichever labels the most lines
  // (the left on a tie). A line with no clear spot on that side is not drawn: every gridline drawn is labelled.
  const meets = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  // The needle the chart opens on runs the plot's height: no gridline label sits across it.
  const rest = { x0: needle.x0 - 8 / REF_WIDTH, x1: needle.x0 + 8 / REF_WIDTH, y0: 0, y1: 1 };
  const beside = rest.x0 > 0.5 ? rest.x0 : null;
  const sides: { at: number; end: boolean }[] = [{ at: 0, end: false }, { at: 1, end: true }, ...(beside !== null ? [{ at: beside, end: true }] : [])];
  const marks = [...dots, ...along].map((d) => ({ x0: d.x - d.r / REF_WIDTH, x1: d.x + d.r / REF_WIDTH, y0: d.y - d.r / height, y1: d.y + d.r / height }));
  const labelOn = ({ at, end }: { at: number; end: boolean }) => {
    const boxes = [...taken];
    return lines.map((v) => {
      const text = hm(v);
      const w = (textWidth(text, 12, 500) + 6) / REF_WIDTH;
      const fy = y(v);
      const box = { x0: end ? at - w : at, x1: end ? at : at + w, y0: fy - 14 / height, y1: fy - 3 / height };
      const clear = box.y0 >= 0 && box.x0 >= 0 && !meets(rest, box) && !boxes.some((t) => meets(t, box)) && !marks.some((m) => meets(m, box));
      if (clear) boxes.push(box);
      return { y: fy, label: text, at, end, shown: clear };
    });
  };
  const grid = sides.map(labelOn).reduce((best, g) => (g.filter((l) => l.shown).length > best.filter((l) => l.shown).length ? g : best)).filter((g) => g.shown);
  // A label a gridline runs through breaks the line under it (a knockout halo), so the line never crosses the text.
  placed = placed.map((l) => {
    if (l.minWidth === null) return l;
    const size = l.size ?? 14, base = l.y * height + l.dy;
    return grid.some((g) => base - size * 0.78 - 2 <= g.y * height && g.y * height <= base + size * 0.22 + 2) ? { ...l, knockout: true } : l;
  });
  const plot = (
    <Plot paths={runs.filter((r) => r.length > 1).map((r) => <path key={r[0].year} className="l-ink2" d={linePath(r.map((p) => [x(p.year), y(p.seconds)]))} />)}>
      <g className="viz-grid">
        {grid.map((g) => (
          <g key={g.label}>
            <rect className="grid-line" x="0" y={pc(g.y)} width="100%" height="1" />
            <text className="tick grid-label" x={pc(g.at)} y={pc(g.y)} dy={-5} textAnchor={g.end ? 'end' : undefined}>{g.label}</text>
          </g>
        ))}
      </g>
      {sorted.map((p, i) => <circle key={p.year} className={i === sel ? 'm-signal is-reading' : 'm-ink'} cx={pc(x(p.year))} cy={pc(y(p.seconds))} r={i === sel ? 5.5 : 4} />)}
      {lifted ? placed.filter((l) => l.minWidth !== null && l.dy < 0).map((l) => {
        const from = l.y + (l.dy + 3) / height, to = y(sorted[start].seconds) - 6 / height;
        return to - from > 4 / height ? <rect key="leader" className="leader" data-scrub-i={l.at} x={pc(l.x)} width={1} transform="translate(-0.5 0)" y={pc(from)} height={pc(to - from)} /> : null;
      }) : null}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis centred ticks={yearTicks(first, last).map((yr) => ({ x: x(yr), label: String(yr) }))} />;
  const scrub = {
    x: sorted.map((p) => x(p.year)), keys: sorted.map((p) => String(p.year)), values: sorted.map((p) => p.display),
    side: [{ label: sideLabel, values: sorted.map((p) => p.side) }],
  };
  const detents = [...new Set([sel, ...(start >= 0 ? [start] : [])])].map((i) => scrubOf(sorted[i].year));
  return (
    <ChartFrame className="edition-line" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={scrub} initial={scrubOf(sorted[sel].year)} detents={detents} label={label} axis={axis}>{plot}</Scrubber>}
    />
  );
}
