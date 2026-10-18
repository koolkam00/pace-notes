import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline } from './Plot';
import Scrubber from './Scrubber.client';
import { areaPath, linear, linePath, pc } from './scale';
import { paceColour, paceText } from '@/lib/viz/format';
import { fitClass, REF_WIDTH, textWidth } from './labels';

/**
 * Elevation and pace (the redesign spec, section 3.6): the course profile as a 2 px ink line over a quiet area with an
 * edge, on ONE height scale shared by every course page (0 to the largest relief in the release, rounded up to 50 m,
 * passed in as `relief`), so a flat course looks flat. Under it, one block per section on the diverging pace ramp with
 * its value on the block; the section the sentence is about is washed above. Scrub along the course: the readout gives
 * the section, its climb (one value) and its pace against the course's own average.
 */
export type PaceSection = { label: string; startKm: number; endKm: number; pct: number; display: string; climb: string };

export default function ElevationPace({ km, metres, relief, sections, focus, label, readoutKeys, values, height = 150, heightMd = 190, reliefLabel }: {
  km: number[]; metres: number[]; relief: number; sections: PaceSection[]; focus?: number; label: string;
  /** The readout's labels: [the climb in a section, its pace against the course's own average]. */
  readoutKeys: [string, string]; values?: ReactNode; height?: number; heightMd?: number;
  /** The shared scale's top, as words ("656 ft"): a hairline at it, labelled inside the plot, so the scale can be read. */
  reliefLabel?: string;
}) {
  const total = km[km.length - 1] || 42.195;
  const x = linear([0, total]);
  const floor = Math.min(...metres);
  const top = 0.08;
  const y = (m: number) => 1 - (1 - top) * ((m - floor) / Math.max(1, relief));
  const line = km.map((k, i) => [x(k), y(metres[i])] as [number, number]);
  // The scale's top line, its label under it at whichever end the profile stays clear of (else no label, and no line).
  const labelW = reliefLabel ? (textWidth(reliefLabel, 12, 500) + 8) / REF_WIDTH : 0;
  const clearUnder = (x0: number, x1: number) => line.every(([px, py]) => px < x0 || px > x1 || py > top + 22 / height);
  const reliefSide = !reliefLabel ? null : clearUnder(0, labelW) ? 'left' : clearUnder(1 - labelW, 1) ? 'right' : null;
  const plot = (
    <Plot paths={(
      <>
        <path className="a-silhouette" d={areaPath(line, line.map(([px]) => [px, 1] as [number, number]))} />
        <path className="l-ink" d={linePath(line)} />
      </>
    )}>
      {focus !== undefined && sections[focus] ? <rect className="a-signal" x={pc(x(sections[focus].startKm))} width={pc(x(sections[focus].endKm) - x(sections[focus].startKm))} y="0" height="100%" /> : null}
      {reliefSide ? (
        <g className="viz-grid">
          <rect className="grid-line" x="0" y={pc(top)} width="100%" height="1" />
          <text className="tick grid-label" x={reliefSide === 'left' ? '0' : '100%'} y={pc(top)} dy={15} textAnchor={reliefSide === 'left' ? 'start' : 'end'}>{reliefLabel}</text>
        </g>
      ) : null}
      <Baseline />
    </Plot>
  );
  const totalKm = sections.reduce((sum, s) => sum + (s.endKm - s.startKm), 0) || 1;
  const blocks = (
    <div className="pace-blocks" aria-hidden="true">
      {sections.map((s, i) => {
        const bg = paceColour(s.pct, 12);
        // The plot width at which this block holds its value with 2 px to spare (2 px gaps between blocks).
        const need = ((textWidth(s.display, 12) + 4) * totalKm) / (s.endKm - s.startKm) + 2 * (sections.length - 1);
        return (
          <span key={s.label} className={`pace-block is-on-${paceText(bg)}${i === focus ? ' is-focus' : ''}`} style={{ flexGrow: s.endKm - s.startKm, background: bg }}>
            <span className={fitClass(need) || undefined}>{s.display}</span>
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
    keys: sections.map((s) => `${s.label}, ${readoutKeys[1].toLowerCase()}`),
    values: sections.map((s) => s.display),
    side: [{ label: readoutKeys[0], values: sections.map((s) => s.climb) }],
  };
  return (
    <ChartFrame className="elevation-pace" label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber points={points} initial={focus ?? 0} detents={focus !== undefined ? [focus] : []} label={label} axis={axis}>{plot}</Scrubber>}
      values={values}
    />
  );
}
