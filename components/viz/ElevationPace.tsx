import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline } from './Plot';
import Scrubber from './Scrubber.client';
import { areaPath, linear, linePath, pc } from './scale';
import { paceColour, paceText } from '@/lib/viz/format';

/**
 * Elevation and pace (the redesign spec, section 3.6): the course profile as a 2 px ink line over a quiet area with an
 * edge, on ONE height scale shared by every course page (0 to the largest relief in the release, rounded up to 50 m,
 * passed in as `relief`), so a flat course looks flat. With `fit`, the plot is only as tall as this course's own relief
 * on that scale (two fifths of the full height at least), so a flat course is a low, compact profile rather than a squiggle
 * at the foot of an empty box, and the needle is only that tall. Under it, one block per section on the diverging pace
 * ramp with its value on the block (each block fits its own label: the % goes where it is too narrow, the readout says
 * it); the section the sentence is about is washed above. Scrub along the course: the readout leads with the section's
 * climb (the number the sentence gives) and gives its pace against the course's own average beside it.
 */
export type PaceSection = { label: string; startKm: number; endKm: number; pct: number; display: string; climb: string };

/** The lowest a fitted plot goes, as a share of the full height: 48 px of a 120 px phone plot, so the plot (the slider)
 * keeps a 44 px touch target. */
const FIT_MIN = 0.4;

export default function ElevationPace({ km, metres, relief, sections, focus, initial, label, readoutKeys, values, height = 150, heightMd = 190, fit = false }: {
  km: number[]; metres: number[]; relief: number; sections: PaceSection[]; focus?: number;
  /** The section the readout opens on (the one the sentence names); default the washed one, else the first. */
  initial?: number;
  label: string;
  /** The readout's labels: [what it leads with, each section's `climb`; the side value, each section's `display`]. */
  readoutKeys: [string, string]; values?: ReactNode; height?: number; heightMd?: number;
  /** Size the plot to this course's relief on the shared scale (the course pages). */
  fit?: boolean;
}) {
  const total = km[km.length - 1] || 42.195;
  const x = linear([0, total]);
  const floor = Math.min(...metres);
  const top = 0.08;
  // The share of the full height this course's relief takes on the shared scale (with the same top margin), so a metre
  // is as many pixels here as on every other course page.
  const share = fit ? Math.min(1, Math.max(FIT_MIN, top + (1 - top) * ((Math.max(...metres) - floor) / Math.max(1, relief)))) : 1;
  const y = (m: number) => 1 - ((1 - top) * ((m - floor) / Math.max(1, relief))) / share;
  const line = km.map((k, i) => [x(k), y(metres[i])] as [number, number]);
  const start = initial ?? focus ?? 0;
  const plot = (
    <Plot paths={(
      <>
        <path className="a-silhouette" d={areaPath(line, line.map(([px]) => [px, 1] as [number, number]))} />
        <path className="l-ink" d={linePath(line)} />
      </>
    )}>
      {focus !== undefined && sections[focus] ? <rect className="a-signal" x={pc(x(sections[focus].startKm))} width={pc(x(sections[focus].endKm) - x(sections[focus].startKm))} y="0" height="100%" /> : null}
      <Baseline />
    </Plot>
  );
  const blocks = (
    <div className="pace-blocks" aria-hidden="true">
      {sections.map((s, i) => {
        const bg = paceColour(s.pct, 12);
        // The number, and its % sign apart, so a block too narrow for the sign drops it (chart-frame.css, by the
        // block's own width and the number's length).
        const unit = s.display.endsWith('%');
        const num = unit ? s.display.slice(0, -1) : s.display;
        return (
          <span key={s.label} className={`pace-block is-on-${paceText(bg)}${i === focus ? ' is-focus' : ''}${s.display.length > 3 ? ' is-long' : ''}`} style={{ flexGrow: s.endKm - s.startKm, background: bg }}>
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
    keys: sections.map((s) => `${s.label}, ${readoutKeys[0].toLowerCase()}`),
    values: sections.map((s) => s.climb),
    side: [{ label: readoutKeys[1], values: sections.map((s) => s.display) }],
  };
  return (
    <ChartFrame className="elevation-pace" label={label} height={Math.round(height * share)} heightMd={Math.round(heightMd * share)}
      scrub={<Scrubber points={points} initial={start} detents={[...new Set([start, ...(focus !== undefined ? [focus] : [])])]} label={label} axis={axis}>{plot}</Scrubber>}
      values={values}
    />
  );
}
