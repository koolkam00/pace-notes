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
 * With `est` (the 20K panel): the whole minute the cohort is on pace for, dashed, and the median; the finishes under the
 * estimate are the signal. With `marks` (the half panel, components/tools/LinkedPanel.tsx): the round times the data
 * publishes for the group, each flagged with the share under it ("4:00 · 22%"), the bars under the one nearest the
 * median in signal. It never marks a research estimate.
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

interface Marker { key: string; x: number; label: string; tone: 'est' | 'median' }

/**
 * Each label is a flag beside its line: the leftmost marker's to the left, the others' to the right, flipped when the
 * chart's edge is in the way, and dropped a row when two would touch.
 */
function stackLabels(markers: Marker[], width: number, margin: number) {
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

/** A share of finishes as the strip's flags print it: "22%". */
const flagPct = (share: number) => `${Math.round(share * 100)}%`;

export function FinishStrip({ q, Q, est, marks }: {
  q: number[]; Q: number[];
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
  const markers = stackLabels(est !== undefined ? [
    // The marker is the whole minute the cohort is on pace for ("On 4:11 pace"), never the estimate's own label: the
    // card above gives the estimate to the second.
    { key: 'est', x: x(est), label: tiny ? fmtShort(est) : `On ${fmtShort(est)} pace`, tone: 'est' as const },
    // The median in whole minutes, as the sentence above names it (one precision for one number).
    { key: 'median', x: x(q[i50]), label: `Their median ${fmtShort(q[i50])}`, tone: 'median' as const },
  ] : flags.map((f) => ({ key: `m${f.s}`, x: x(f.s), label: `${fmtShort(f.s)} · ${flagPct(f.share)}`, tone: f === nearest ? 'median' as const : 'est' as const })), width, m.l);
  const labelRows = Math.max(1, ...markers.map((mk) => mk.row + 1));
  const top = 8 + labelRows * 17;
  const plotH = narrow ? 80 : 96;
  const base = top + plotH;
  const range = `${fmtShort(q[i10])}–${fmtShort(q[i90])}`;
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
        {markers.map((mk) => (
          <g key={mk.key}>
            <rect x={mk.x0 - 3} y={14 + mk.row * 17 - 12} width={mk.w + 6} height={16} className="predictor-marker-halo" />
            <text x={mk.x0} y={14 + mk.row * 17} className={`predictor-marker is-${mk.tone}`}>{mk.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default FinishStrip;
