import type { ReactNode } from 'react';
import { pc } from './scale';

/**
 * The plot's SVG (the redesign spec, section 3.6). Marks and labels go straight in it as percentages of the box;
 * `paths` go in a nested 1000 × 1000 viewBox stretched to the box (lines keep their stroke width: non-scaling-stroke in
 * chart-frame.css). The SVG is presentation only: the plot's container carries the accessible name.
 */
export default function Plot({ paths, children, className }: { paths?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <svg className={`viz-svg${className ? ` ${className}` : ''}`} width="100%" height="100%" aria-hidden="true" focusable="false">
      {paths ? <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">{paths}</svg> : null}
      {children}
    </svg>
  );
}

/**
 * Horizontal hairlines at y fractions (at most three), each labelled inside the plot on the clear side. A label's
 * `className` is a width class (`w240`) when it hides below some plot width. `labelAt` names the scrubber points whose
 * needle runs through the labels' column: while the needle stands on one, the labels hide (the Scrubber's is-under).
 */
export function Gridlines({ lines, side = 'left', labelAt = [] }: { lines: { y: number; label?: string; className?: string }[]; side?: 'left' | 'right'; labelAt?: number[] }) {
  // One wrapper per point, nested, so the label hides under any of them (visibility is inherited).
  const wrap = (node: ReactNode) => labelAt.reduceRight<ReactNode>((inner, i) => <g data-scrub-i={i}>{inner}</g>, node);
  return (
    <g className="viz-grid">
      {lines.slice(0, 3).map((l) => (
        <g key={l.y}>
          <rect className="grid-line" x="0" y={pc(l.y)} width="100%" height="1" />
          {l.label ? wrap(<text className={`tick grid-label${l.className ? ` ${l.className}` : ''}`} x={side === 'left' ? '0' : '100%'} y={pc(l.y)} dy={-5} textAnchor={side === 'left' ? 'start' : 'end'}>{l.label}</text>) : null}
        </g>
      ))}
    </g>
  );
}

/** The axis baseline at the bottom of the plot (or at a y fraction), in --rule-strong. */
export function Baseline({ y = 1 }: { y?: number }) {
  return <rect className="base-line" x="0" y={pc(y)} width="100%" height="1" transform={y >= 1 ? 'translate(0 -1)' : undefined} />;
}

/** A reference line across the plot: solid ink for zero, 1× or an own average; dashed for even pace, expected or typical. */
export function RefLine({ y, dashed = false, label, side = 'right', at, below = false, inset = 0, labelClass }: {
  y: number; dashed?: boolean; label?: string; side?: 'left' | 'right';
  /** A width class for the label (`w240`): it hides below that plot width; the line stays. */
  labelClass?: string;
  /** Where the label starts, as a fraction of the plot (left-aligned there), instead of an end of the line. */
  at?: number;
  /** The label sits under the line instead of over it. */
  below?: boolean;
  /** Px kept free at the line's right end (a bracket standing there), so a right-end label never touches it. */
  inset?: number;
}) {
  const lx = at !== undefined ? pc(at) : side === 'left' ? '0' : '100%';
  const right = at === undefined && side !== 'left';
  return (
    <g>
      <line className={dashed ? 'ref-line is-dashed' : 'ref-line'} x1="0" x2="100%" y1={pc(y)} y2={pc(y)} />
      {label ? <text className={`viz-label is-quiet is-sm${labelClass ? ` ${labelClass}` : ''}`} x={lx} y={pc(y)} dx={right && inset ? -inset : undefined} dy={below ? 15 : -6} textAnchor={right ? 'end' : 'start'}>{label}</text> : null}
    </g>
  );
}
