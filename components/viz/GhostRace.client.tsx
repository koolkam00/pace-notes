'use client';

import { useCallback, useState } from 'react';
import Scrubber from './Scrubber.client';
import { matLabel } from '@/lib/units';

/**
 * A ghost race (the redesign spec, section 3.6): two runners on one line, the race clock under a thumb. The ghost is a
 * hollow ring, the real runner an ink dot, and the gap between them is labelled in time. The line is the stretch of
 * course around the two (about three times their widest gap, so the gap always reads), and it slides under them as the
 * clock runs, its mats named as they pass. Scrub the clock; every position is computed on the server, so the island only
 * places two dots on the window.
 */
type Props = {
  /** Race-clock seconds at each step, and the distance (km) each runner had covered then. */
  clocks: number[];
  ghost: number[];
  runner: number[];
  /** The gap at each step, already worded ("2:41 ahead"). */
  gaps: string[];
  names: { ghost: string; runner: string };
  clockLabels: string[];
  ticks: { x: number; label: string }[];
  initial: number;
  detents?: number[];
  label: string;
  /** The stretch of course shown, in km (default: three times the widest gap, at least 2 km). */
  windowKm?: number;
};

const KM = 42.195;
const MATS = [0, 5, 10, 15, 20, 25, 30, 35, 40, KM];

export default function GhostRace({ clocks, ghost, runner, gaps, names, clockLabels, ticks, initial, detents = [], label, windowKm }: Props) {
  const [i, setI] = useState(initial);
  const onIndex = useCallback((next: number) => setI(next), []);
  const a = Math.min(ghost[i] ?? 0, KM), b = Math.min(runner[i] ?? 0, KM);
  const widest = ghost.reduce((m, g, k) => Math.max(m, Math.abs(Math.min(g, KM) - Math.min(runner[k] ?? 0, KM))), 0);
  const span = Math.min(KM, windowKm ?? Math.max(2, 3 * widest));
  const from = Math.max(0, Math.min(KM - span, (a + b) / 2 - span / 2));
  const at = (km: number) => ((km - from) / span) * 100;
  const pc = (v: number) => `${v.toFixed(2)}%`;
  const kms: number[] = [];
  for (let k = Math.ceil(from); k <= from + span + 1e-9; k++) kms.push(k);
  const mats = MATS.filter((m) => m >= from - 1e-9 && m <= from + span + 1e-9);
  const lo = Math.min(at(a), at(b)), hi = Math.max(at(a), at(b));
  // The gap's label sits over the two, anchored in proportion to where it sits (its left edge at the window's start,
  // its right edge at its end), so it never runs past either end of the line, however narrow.
  const midPc = Math.max(0, Math.min(100, (lo + hi) / 2)).toFixed(2);
  const points = {
    // Along the clock: the steps need not be evenly spaced (a mat's exact moment can sit between two minutes).
    x: clocks.map((c) => (c - clocks[0]) / Math.max(1, clocks[clocks.length - 1] - clocks[0])),
    keys: clocks.map(() => 'Race clock'),
    values: clockLabels,
  };
  return (
    <figure className="viz viz-frame ghost-race">
      <div className="ghost-track" role="img" aria-label={`${label}: at ${clockLabels[i]}, ${gaps[i]}.`}>
        <span className="ghost-line" aria-hidden="true" />
        {kms.map((k) => <span key={`k${k}`} className={`ghost-tick${MATS.includes(k) ? ' is-mat' : ''}`} style={{ left: pc(at(k)) }} aria-hidden="true" />)}
        {mats.map((m) => {
          const x = at(m);
          return <span key={`m${m}`} className={`ghost-mat${x < 8 ? ' is-start' : x > 92 ? ' is-end' : ''}`} style={{ left: pc(x) }} aria-hidden="true">{matLabel(m)}</span>;
        })}
        <span className="ghost-span" style={{ left: pc(lo), width: pc(hi - lo) }} aria-hidden="true" />
        <span className="ghost-gap" style={{ left: `${midPc}%`, transform: `translateX(-${midPc}%)` }} aria-hidden="true">{gaps[i]}</span>
        <span className="ghost-dot is-ghost" style={{ left: pc(at(a)) }} aria-hidden="true" />
        <span className="ghost-dot is-runner" style={{ left: pc(at(b)) }} aria-hidden="true" />
      </div>
      <ul className="viz-key" aria-hidden="true">
        <li><i className="viz-key-mark" />{names.runner}</li>
        <li><i className="viz-key-mark is-hollow" />{names.ghost}</li>
      </ul>
      <div className="ghost-clock">
        <Scrubber points={points} initial={initial} detents={detents} label={`${label}: the race clock`} onIndex={onIndex}
          axis={(
            <div className="viz-axis">
              <svg className="viz-axis-svg" width="100%" height="24" aria-hidden="true">
                {ticks.map((t) => <text key={t.label} className="tick" x={`${(t.x * 100).toFixed(2)}%`} y={18} textAnchor={t.x < 0.05 ? 'start' : t.x > 0.95 ? 'end' : 'middle'}>{t.label}</text>)}
              </svg>
            </div>
          )}>
          <svg className="viz-svg" width="100%" height="100%" aria-hidden="true"><rect className="base-line" x="0" y="50%" width="100%" height="1" /></svg>
        </Scrubber>
      </div>
    </figure>
  );
}
