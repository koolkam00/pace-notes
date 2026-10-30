'use client';

import { useRef } from 'react';
import { useWidth } from '@/components/viz/useSize';
import { formatDuration, formatHM } from '@/lib/tools/time';
import { RangeBracket, bracketLayout } from './RangeBracket';

/**
 * The finish-time strip of the predictor's Pace Notes data panels (moved out of components/tools/Predictor.tsx
 * unchanged): a group's finishes in 5% slices as bars whose area is their share, the 10th to 90th percentile bracketed
 * and named in place, flags over the times it marks.
 *
 * With `est` (the 20K panel): the whole minute the cohort is on pace for, dashed, and the median, solid; the finishes
 * under the estimate are the signal. With `marks` (the half panel, components/tools/LinkedPanel.tsx): the round times
 * the data publishes for the group, every one dashed (solid stays the median's line on this tool) and flagged with the
 * share under it ("22% under 4:00"), the bars under the one nearest the median in signal and its flag in the signal
 * ink. A flag never crosses another mark's line: where no placement keeps every flag clear (a phone at 200% zoom), the
 * flags shrink to their times and the shares move to one key line under the strip, or the lines go unlabelled and the
 * key line names them all. It never marks a research estimate.
 */

/** "4:12:03" over an hour, "50:10" under. */
export const fmtTime = (s: number) => formatDuration(s, s >= 3600);
/** "4:12" for times over an hour (to the minute), "50:10" under. */
export const fmtShort = (s: number) => (s >= 3600 ? formatHM(s) : formatDuration(s));
export const qIndex = (Q: number[], p: number) => Q.findIndex((v) => Math.abs(v - p) < 1e-9);

export function niceStep(span: number, target: number, steps: number[]): number {
  for (const s of steps) if (span / s <= target) return s;
  return steps[steps.length - 1];
}

/** Axis ticks whose centred label (11px mono, about 6.7px a character) fits inside the chart. */
export function fittingTicks(lo: number, hi: number, step: number, x: (s: number) => number, width: number, text: (t: number) => string): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    const half = (text(t).length * 6.7) / 2 + 1;
    if (x(t) - half >= 0 && x(t) + half <= width) ticks.push(t);
  }
  return ticks;
}

interface Marker { key: string; x: number; label: string; tone: 'est' | 'median'; signal?: boolean }

/**
 * Each label is a flag beside its line: the leftmost marker's to the left, the others' to the right, flipped when the
 * chart's edge is in the way, and dropped a row when two would touch.
 */
function stackLabels(markers: Marker[], width: number, margin: number): Placed[] {
  const charW = 6.9;
  const rows: number[] = [];
  return [...markers].sort((a, b) => a.x - b.x).map((mk, i) => {
    const w = mk.label.length * charW;
    const left = mk.x - 6 - w;
    const right = mk.x + 6;
    const wantLeft = i === 0 && markers.length > 1;
    const x0 = wantLeft ? (left >= margin ? left : right) : (right + w <= width - margin ? right : Math.max(margin, left));
    let row = rows.findIndex((end) => end + 12 < x0);
    if (row < 0) { row = rows.length; rows.push(x0 + w); } else rows[row] = x0 + w;
    return { ...mk, x0, row, w };
  });
}

/** A placed flag: its box's left edge, row (0 the top) and width. */
type Placed = Marker & { x0: number; row: number; w: number };

/**
 * The half panel's flags (up to three marks): every placement of each flag, right or left of its line, in any row,
 * is tried, and the one with the fewest rows (then the fewest flags turned left) wins, among those where every flag
 * stays inside the chart, no two flags in a row touch and no flag crosses another mark's line (a line runs from its own
 * flag's row down to the baseline, so a flag in a lower row would cut it). Null when none does.
 */
function placeFlags(markers: Marker[], width: number, margin: number): Placed[] | null {
  const charW = 6.9;
  const sorted = [...markers].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  if (!n) return [];
  const w = sorted.map((mk) => mk.label.length * charW);
  let best: { cost: number; placed: Placed[] } | null = null;
  const choice: { left: boolean; row: number }[] = [];
  const visit = (i: number) => {
    if (i === n) {
      const placed = sorted.map((mk, k) => ({ ...mk, w: w[k], row: choice[k].row, x0: choice[k].left ? mk.x - 6 - w[k] : mk.x + 6 }));
      for (const a of placed) {
        if (a.x0 < margin || a.x0 + a.w > width - margin) return;
        for (const b of placed) {
          if (a === b) continue;
          if (a.row === b.row && a.x0 < b.x0 + b.w + 10 && b.x0 < a.x0 + a.w + 10) return;
          if (a.row >= b.row && b.x >= a.x0 - 4 && b.x <= a.x0 + a.w + 4) return;
        }
      }
      const cost = (Math.max(...placed.map((p) => p.row)) + 1) * 100 + placed.filter((_, k) => choice[k].left).length;
      if (!best || cost < best.cost) best = { cost, placed };
      return;
    }
    for (let row = 0; row < n; row++) for (const left of [false, true]) { choice[i] = { left, row }; visit(i + 1); }
  };
  visit(0);
  return best ? (best as { placed: Placed[] }).placed : null;
}

/** A share of finishes as the strip's flags print it: "22%". */
const flagPct = (share: number) => `${Math.round(share * 100)}%`;

export function FinishStrip({ q, Q, est, marks, format = fmtShort }: {
  q: number[]; Q: number[];
  /** How the bracket and the flags print a time: the 20K panel's to the nearest minute (fmtShort); the half panel's
   *  whole minute at or below it, as every half page reads a time. Ticks are whole minutes either way. */
  format?: (seconds: number) => string;
  /** The 20K panel's estimate (the whole minute the cohort is on pace for). */
  est?: number;
  /** The half panel's round times and the share of the group's finishes under each (strictly), seconds. */
  marks?: { s: number; share: number }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
  const flags = marks ?? [];
  // The signal split: the estimate, or the round time nearest the median (ties to the earlier).
  const nearest = flags.length ? flags.reduce((b, m) => (Math.abs(m.s - q[i50]) < Math.abs(b.s - q[i50]) ? m : b)) : null;
  const split = est ?? nearest?.s ?? null;
  const lo0 = Math.min(q[0], ...(est !== undefined ? [est] : []), ...flags.map((m) => m.s));
  const hi0 = Math.max(q[q.length - 1], ...(est !== undefined ? [est] : []), ...flags.map((m) => m.s));
  const pad = Math.max(hi0 - lo0, 900) * 0.06;
  const [lo, hi] = [lo0 - pad, hi0 + pad];
  const m = { l: 8, r: 8 };
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const tiny = width < 300;
  // The half panel's flags: "22% under 4:00" where every flag fits clear of the other lines; else the times alone, the
  // shares in the key line under the strip; else no flags, the key line naming every mark.
  const flagText = (f: { s: number; share: number }) => `${flagPct(f.share)} under ${format(f.s)}`;
  const flagMarkers = (label: (f: { s: number; share: number }) => string) => flags.map((f) => ({ key: `m${f.s}`, x: x(f.s), label: label(f), tone: 'est' as const, signal: f === nearest }));
  const full = est === undefined ? placeFlags(flagMarkers(flagText), width, m.l) : null;
  const times = est === undefined && !full ? placeFlags(flagMarkers((f) => format(f.s)), width, m.l) : null;
  const keyLine = est === undefined && !full && flags.length > 0;
  const markers: Placed[] = est !== undefined ? stackLabels([
    // The marker is the whole minute the cohort is on pace for ("On 4:11 pace"), never the estimate's own label: the
    // card above gives the estimate to the second.
    { key: 'est', x: x(est), label: tiny ? fmtShort(est) : `On ${fmtShort(est)} pace`, tone: 'est' as const },
    // The median in whole minutes, as the sentence above names it (one precision for one number).
    { key: 'median', x: x(q[i50]), label: `Their median ${fmtShort(q[i50])}`, tone: 'median' as const },
  ], width, m.l) : full ?? times ?? flagMarkers(() => '').map((mk) => ({ ...mk, x0: mk.x, row: 0, w: 0 }));
  const labelRows = Math.max(1, ...markers.map((mk) => mk.row + 1));
  const top = 8 + labelRows * 17;
  const plotH = narrow ? 80 : 96;
  const base = top + plotH;
  const range = `${format(q[i10])}–${format(q[i90])}`;
  const bracket = bracketLayout(x(q[i10]), x(q[i90]), `80% of finishes: ${range}`, width, m.l, `80%: ${range}`);
  const bracketY = base + 34;
  const H = bracketY + bracket.height;
  const dens = q.slice(0, -1).map((v, i) => 0.05 / Math.max(1, q[i + 1] - v));
  const maxD = Math.max(...dens);
  const step = niceStep(hi - lo, narrow ? 4 : 7, [60, 120, 300, 600, 900, 1800, 3600]);
  const ticks = fittingTicks(lo, hi, step, x, width, fmtShort);
  const label = est !== undefined
    ? `Finish times of these finishes, in 5% slices: 10th percentile ${fmtTime(q[i10])}, median ${fmtTime(q[i50])}, 90th percentile ${fmtTime(q[i90])}. ${fmtShort(est)} pace is marked; the finishes under it are highlighted.`
    : `Finish times of these marathons, in 5% slices: 10th percentile ${fmtTime(q[i10])}, median ${fmtTime(q[i50])}, 90th percentile ${fmtTime(q[i90])}.${flags.length ? ` ${flags.map((f) => `${flagPct(f.share)} under ${fmtShort(f.s)}`).join(', ')}; the marathons under ${fmtShort(nearest!.s)} are highlighted.` : ''}`;
  return (
    <div ref={ref} className="viz predictor-strip">
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={x(t)} x2={x(t)} y1={top - 2} y2={base} />
            <text x={x(t)} y={base + 18} textAnchor="middle">{fmtShort(t)}</text>
          </g>
        ))}
        {/* The share under the estimate (or the round time nearest the median) is the reading: each 5% slice holds its
            finishes evenly, so the part of the bars left of the line, in the accent, is that share's area; the rest is quiet. */}
        {dens.map((dv, i) => {
          const h = (dv / maxD) * (plotH - 6);
          const x0 = x(q[i]);
          const x1 = Math.max(x0 + 0.5, x(q[i + 1]));
          const xe = split === null ? -Infinity : x(split);
          if (x1 <= xe || x0 >= xe) return <rect key={i} x={x0} width={x1 - x0} y={base - h} height={h} className={`predictor-strip-bar${x1 <= xe ? ' is-under' : ''}`} />;
          return (
            <g key={i}>
              <rect x={x0} width={xe - x0} y={base - h} height={h} className="predictor-strip-bar is-under" />
              <rect x={xe} width={x1 - xe} y={base - h} height={h} className="predictor-strip-bar" />
            </g>
          );
        })}
        <line x1={m.l} x2={width - m.r} y1={base} y2={base} className="predictor-strip-base" />
        <RangeBracket b={bracket} y={bracketY} />
        {markers.map((mk) => (
          <line key={mk.key} x1={mk.x} x2={mk.x} y1={14 + mk.row * 17 - 11} y2={base} className={`predictor-marker-line is-${mk.tone}`} />
        ))}
        {markers.filter((mk) => mk.label).map((mk) => (
          <g key={mk.key}>
            <rect x={mk.x0 - 3} y={14 + mk.row * 17 - 12} width={mk.w + 6} height={16} className="predictor-marker-halo" />
            <text x={mk.x0} y={14 + mk.row * 17} className={`predictor-marker is-${mk.tone}${mk.signal ? ' is-signal' : ''}`}>{mk.label}</text>
          </g>
        ))}
      </svg>
      {keyLine ? (
        <p className="predictor-strip-key" aria-hidden="true">
          {flags.map((f) => <span key={f.s} className={f === nearest ? 'is-signal' : undefined}>{flagText(f)}</span>)}
        </p>
      ) : null}
    </div>
  );
}

export default FinishStrip;
