import type { CSSProperties, ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines } from './Plot';
import Scrubber from './Scrubber.client';
import { areaPath, linear, linePath, pc } from './scale';
import { fitClass, textWidth } from './labels';
import { PACE_RAMP_DARK, paceColour, paceText } from '@/lib/viz/format';

/**
 * Elevation and pace (the redesign spec, section 3.6): the course profile as a 2 px ink line over a quiet area with an
 * edge, on ONE height scale shared by every course page (0 to the largest relief in the release, rounded up to 50 m,
 * passed in as `relief`), so a flat course looks flat. With `fit`, the plot is only as tall as this course's own relief
 * on that scale (two fifths of the full height at least), so a flat course is a low, compact profile rather than a squiggle
 * at the foot of an empty box, and the needle is only that tall. Under it, one block per section on the diverging pace
 * ramp with its value on the block (each block at least 24 px, so the 2.2 km last one fits its number; on a row too
 * narrow for the last block's "%", no block shows one, and the readout says it); the section the sentence is about is
 * washed above. Scrub along the course: the readout leads with the number the
 * sentence gives (`lead`: the section's pace against the course's own average, or on a course page its climb) and gives
 * the other beside it. A chart on its own course's scale (`reliefLabel`) labels its top line instead.
 */
export type PaceSection = { label: string; startKm: number; endKm: number; pct: number; display: string; climb: string };

/** The lowest a fitted plot goes, as a share of the full height: 48 px of a 120 px phone plot, so the plot (the slider)
 * keeps a 44 px touch target. */
const FIT_MIN = 0.4;

export default function ElevationPace({ km, metres, relief, reliefLabel, sections, focus, focusTo, initial, label, readoutKeys, lead = 'pace', values, height = 150, heightMd = 190, fit = false }: {
  km: number[]; metres: number[]; relief: number; sections: PaceSection[]; focus?: number;
  /** The last section of a washed stretch that starts at `focus` (two neighbouring climbs named as one). */
  focusTo?: number;
  /** The section the readout opens on (the one the sentence names); default the washed one, else the first. */
  initial?: number;
  label: string;
  /** A chart drawn on its own course's scale instead of the shared one names its top: a hairline labelled with the relief. */
  reliefLabel?: string;
  /** The readout's labels: [each section's `climb`, each section's `display`]. */
  readoutKeys: [string, string];
  /** What the readout leads with: the section's pace (`display`, the analyses) or its climb (the course pages, whose
   * heading names the climb); the other is the side value. */
  lead?: 'pace' | 'climb';
  values?: ReactNode; height?: number; heightMd?: number;
  /** Size the plot to this course's relief on the shared scale (the course pages). */
  fit?: boolean;
}) {
  const total = km[km.length - 1] || 42.195;
  const x = linear([0, total]);
  const floor = Math.min(...metres);
  const top = reliefLabel ? 0.2 : 0.08;
  // The share of the full height this course's relief takes on the shared scale (with the same top margin), so a metre
  // is as many pixels here as on every other course page.
  const share = fit ? Math.min(1, Math.max(FIT_MIN, top + (1 - top) * ((Math.max(...metres) - floor) / Math.max(1, relief)))) : 1;
  // On its own labelled scale the lowest point stands a little above the baseline, so the line never runs along it and
  // reads as clipped; the labelled top line stays at the lowest point plus the relief.
  const bottom = reliefLabel ? 0.05 : 0;
  const y = (m: number) => 1 - bottom - ((1 - top - bottom) * ((m - floor) / Math.max(1, relief))) / share;
  const line = km.map((k, i) => [x(k), y(metres[i])] as [number, number]);
  const start = initial ?? focus ?? 0;
  const last = focus !== undefined && focusTo !== undefined && sections[focusTo] && focusTo >= focus ? focusTo : focus ?? 0;
  const plot = (
    <Plot paths={(
      <>
        <path className="a-silhouette" d={areaPath(line, line.map(([px]) => [px, 1] as [number, number]))} />
        <path className="l-ink" d={linePath(line)} />
      </>
    )}>
      {/* The wash stays inside the plot: under a labelled top line it starts there, not above it. */}
      {focus !== undefined && sections[focus] ? <rect className="a-signal" x={pc(x(sections[focus].startKm))} width={pc(x(sections[last].endKm) - x(sections[focus].startKm))} y={reliefLabel ? pc(top) : '0'} height={reliefLabel ? pc(1 - top) : '100%'} /> : null}
      {/* The top line's label hides below the plot width it fits (200% zoom); the chart's name keeps the relief. */}
      {reliefLabel ? <Gridlines lines={[{ y: top }]} /> : null}
      {reliefLabel ? <text className={`tick grid-label ${reliefFit(reliefLabel)}`.trim()} x="0" y={pc(top)} dy={-5}>{reliefLabel}</text> : null}
      <Baseline />
    </Plot>
  );
  const blocks = (
    <div className="pace-blocks" aria-hidden="true">
      {sections.map((s, i) => {
        const bg = paceColour(s.pct, 12);
        // The dark theme takes its own ramp (critic round 5: the light ramp's cream middle was the brightest mark on the
        // night page while it means "no difference"); chart-frame.css picks the variable by theme.
        // The number, and its % sign apart, so a block too narrow for the sign drops it (chart-frame.css, by the
        // block's own width and the number's length).
        const unit = s.display.endsWith('%');
        const num = unit ? s.display.slice(0, -1) : s.display;
        return (
          <span key={s.label} className={`pace-block is-on-${paceText(bg)}${focus !== undefined && i >= focus && i <= last ? ' is-focus' : ''}${s.display.length > 3 ? ' is-long' : ''}`} style={{ flexGrow: s.endKm - s.startKm, '--bg': bg, '--bg-dark': paceColour(s.pct, 12, PACE_RAMP_DARK) } as CSSProperties}>
            <span className={`pace-val n${Math.min(3, num.length)}`}>{num}{unit ? <span className="pace-pct">%</span> : null}</span>
          </span>
        );
      })}
    </div>
  );
  const axis = (
    <>
      {blocks}
      <Axis ticks={[0, 10, 20, 30, 40].map((k) => ({ x: x(k), label: k === 0 ? 'Start' : `${k}K` })).concat([{ x: 1, label: 'Finish' }])} />
    </>
  );
  const points = {
    x: sections.map((s) => x((s.startKm + s.endKm) / 2)),
    keys: sections.map((s) => `${s.label}, ${readoutKeys[lead === 'climb' ? 0 : 1].toLowerCase()}`),
    values: sections.map((s) => (lead === 'climb' ? s.climb : s.display)),
    side: [{ label: readoutKeys[lead === 'climb' ? 1 : 0], values: sections.map((s) => (lead === 'climb' ? s.display : s.climb)) }],
  };
  return (
    <ChartFrame className="elevation-pace" label={label} height={Math.round(height * share)} heightMd={Math.round(heightMd * share)}
      scrub={<Scrubber points={points} initial={start} detents={[...new Set([start, ...(focus !== undefined ? [focus] : [])])]} label={label} axis={axis}>{plot}</Scrubber>}
      values={values}
    />
  );
}

/** The width class for the relief label: fitClass, and below its first step (160 px) any label over 120 px hides, since
 * a 200% zoom plot is about 135 px wide. */
function reliefFit(text: string): string {
  const w = textWidth(text, 12, 500) + 4;
  return fitClass(w) || (w > 120 ? 'w160' : '');
}
