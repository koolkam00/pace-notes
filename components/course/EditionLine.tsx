import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Scrubber from '@/components/viz/Scrubber.client';
import Annotation from '@/components/viz/Annotation';
import { fitClass, keepClearOf, placeLabels, REF_WIDTH, textWidth, widthClass, type LabelItem, type PlacedLabel } from '@/components/viz/labels';

/** The narrowest plot a course chart is drawn at (a 195 px screen, 200% zoom). */
const NARROW = 160;
import { extent, linear, linePath, pc, yScale } from '@/components/viz/scale';
import { yearPad, yearTicks } from '@/components/viz/YearStrip';

/**
 * The median finish, edition by edition (the redesign spec, section 7.10 "#finish-times"): a dot per edition on a
 * time-scaled axis, joined only across consecutive years, so a year with no edition leaves the line broken (no band,
 * which would read as a highlight) and a faint tick at its foot, which the needle steps across. The y scale spans at least 20 minutes,
 * centred on the editions, so a few seconds never draw as a climb or a drop (a steady course draws flat), and two to
 * four round-minute gridlines bracket the editions, one at or below the quickest and one at or above the slowest, each
 * labelled above its own line at the plot's left edge (hidden, never moved, where it would meet a mark).
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
  // The editions are the scrub points: the needle steps across a year with no edition (round 6: a stop there read out
  // an empty value in the middle of the chart), which keeps a faint tick at its foot.
  const years = sorted.map((p) => p.year);
  const missing = Array.from({ length: last - first + 1 }, (_, k) => first + k).filter((yr) => !sorted.some((p) => p.year === yr));
  const byYear = new Map(sorted.map((p) => [p.year, p]));
  const scrubOf = (year: number) => years.indexOf(year);
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
  // The edition's label as the gridline labels keep clear of it: its rows (plot fractions) and its left edge at any plot
  // width (its anchor moves with the plot, its offset and text keep their pixels). Wide margins either side, so a
  // gridline's label never reads as part of this one on the same baseline.
  const MARGIN = 16;
  const taken = placed.filter((l) => l.minWidth !== null).map((l) => {
    const w = textWidth(l.text, l.size ?? 14);
    const off = l.dx - (l.anchor === 'middle' ? w / 2 : l.anchor === 'end' ? w : 0);
    const base = l.y * height + l.dy;
    return { fx: l.x, off, w, y0: (base - 15) / height, y1: (base + 6) / height };
  });
  // Each bracketing line is labelled above itself, never below (a label under its line reads as the band below's), at
  // one fixed place: the plot's left edge, inside the plot, as the elevation and shape charts label theirs (round 6:
  // labels at the right end, mid-plot or beside the needle read as a ragged scale, and London's "4:30" beside the needle
  // read as its label). Only where the chart opens with its needle in the left third (it would cross every label there)
  // do all of them take the right edge instead. A label that would meet a mark, the edition's label or the resting
  // needle is never moved: it hides below the plot width at which it clears them (a width class), and where it clears
  // them at no width its line is drawn unlabelled.
  const marks = [...dots, ...along];
  const right = needle.x0 < 1 / 3;
  // A thing at plot fraction fx, r px either side, clears a label wpx wide at the edge from this plot width up.
  const clearFrom = (fx: number, r: number, wpx: number) => { const room = right ? 1 - fx : fx; return room > 0 ? (wpx + r) / room : Infinity; };
  const grid = lines.map((v) => {
    const text = hm(v);
    const wpx = textWidth(text, 12, 500) + 6;
    const fy = y(v);
    const top = fy - 14 / height, bottom = fy - 3 / height;
    let need = clearFrom(needle.x0, 8, wpx);
    for (const m of marks) if (m.y + m.r / height > top && m.y - m.r / height < bottom) need = Math.max(need, clearFrom(m.x, m.r, wpx));
    // The edition's label on the same rows, where it does not clear this label at the reference plot: the plot width
    // from which its box, with the margins, does. Near the edge it moves away slowly as the plot widens, so the width
    // just past the reference is not enough (merge of round 6: Valencia's "2021 · 3:39" over its "3:40" at 390 px);
    // where it is never clear, the line is drawn unlabelled. Below the reference the edition's label gives way instead
    // (keepClearOf, below).
    for (const t of taken) {
      if (!(t.y0 < bottom && top < t.y1)) continue;
      // Left: off + fx·W − MARGIN ≥ wpx. Right: off + w + fx·W + MARGIN ≤ W − wpx.
      const [gap, rate] = right ? [t.off + t.w + MARGIN + wpx, 1 - t.fx] : [wpx + MARGIN - t.off, t.fx];
      const from = gap <= 0 ? 0 : rate > 0 ? gap / rate : Infinity;
      if (from > REF_WIDTH) need = Math.max(need, from);
    }
    const cls = need <= NARROW ? '' : Number.isFinite(need) ? fitClass(Math.ceil(need)) : 'w-never';
    return { y: fy, label: text, cls, hidden: cls === 'w-never' };
  });
  // Below the reference width (200% zoom) a gridline's label keeps its pixels at the plot's edge while the edition's label
  // moves in with the plot: the edition's label hides where it would meet one (its leader with it), and the readout and
  // the Values table keep it (Frankfurt at 195 px, round 4 merge).
  for (const g of grid.filter((g) => !g.hidden)) {
    const w = textWidth(g.label, 12, 500) + 6;
    keepClearOf(placed, (width) => ({ x0: right ? width - w : 0, x1: right ? width : w, y0: g.y * height - 14, y1: g.y * height - 3 }), height);
  }
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
            {g.hidden ? null : <text className={`tick grid-label${g.cls ? ` ${g.cls}` : ''}`} x={right ? '100%' : '0'} y={pc(g.y)} dy={-5} textAnchor={right ? 'end' : undefined}>{g.label}</text>}
          </g>
        ))}
      </g>
      {missing.map((yr) => <rect key={`gap${yr}`} className="gap-tick" x={pc(x(yr))} width={1} transform="translate(-0.5 0)" y={pc(1 - 5 / height)} height={pc(5 / height)} />)}
      {sorted.map((p, i) => <circle key={p.year} className={i === sel ? 'm-signal is-reading' : 'm-ink'} cx={pc(x(p.year))} cy={pc(y(p.seconds))} r={i === sel ? 5.5 : 4} />)}
      {lifted ? placed.filter((l) => l.minWidth !== null && l.dy < 0).map((l) => {
        const from = l.y + (l.dy + 3) / height, to = y(sorted[start].seconds) - 6 / height;
        return to - from > 4 / height ? <rect key="leader" className={['leader', widthClass(l.minWidth)].filter(Boolean).join(' ')} data-scrub-i={l.at} x={pc(l.x)} width={1} transform="translate(-0.5 0)" y={pc(from)} height={pc(to - from)} /> : null;
      }) : null}
      <Annotation labels={placed} />
      <Baseline />
    </Plot>
  );
  const axis = <Axis centred ticks={yearTicks(first, last).map((yr) => ({ x: x(yr), label: String(yr) }))} />;
  const scrub = {
    x: years.map((yr) => x(yr)), keys: years.map((yr) => String(yr)), values: years.map((yr) => byYear.get(yr)?.display ?? '—'),
    side: [{ label: sideLabel, values: years.map((yr) => byYear.get(yr)?.side ?? '—') }],
  };
  const detents = [...new Set([sel, ...(start >= 0 ? [start] : [])])].map((i) => scrubOf(sorted[i].year));
  return (
    <ChartFrame className="edition-line" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={scrub} initial={scrubOf(sorted[sel].year)} detents={detents} label={label} axis={axis}>{plot}</Scrubber>}
    />
  );
}
