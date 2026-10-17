'use client';

import { useCallback, useState } from 'react';
import Scrubber from './Scrubber.client';

/**
 * A ghost race (the redesign spec, section 3.6): two runners on one line, the race clock under a thumb. The even-pace
 * ghost is a hollow ring, the real runner an ink dot, and the gap between them is labelled in time. Scrub the clock;
 * every position is computed on the server, so the island only moves two dots.
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
};

const KM = 42.195;

export default function GhostRace({ clocks, ghost, runner, gaps, names, clockLabels, ticks, initial, detents = [], label }: Props) {
  const [i, setI] = useState(initial);
  const onIndex = useCallback((next: number) => setI(next), []);
  const pos = (km: number) => `${((Math.min(km, KM) / KM) * 100).toFixed(2)}%`;
  const a = ghost[i] ?? 0, b = runner[i] ?? 0;
  // The gap's label sits between the two, kept clear of the ends of the line.
  const mid = `${Math.max(14, Math.min(86, ((Math.min(a, KM) + Math.min(b, KM)) / 2 / KM) * 100)).toFixed(2)}%`;
  const points = {
    x: clocks.map((_, k) => k / Math.max(1, clocks.length - 1)),
    keys: clocks.map(() => 'Race clock'),
    values: clockLabels,
  };
  return (
    <figure className="viz viz-frame ghost-race">
      <div className="ghost-track" role="img" aria-label={`${label}: at ${clockLabels[i]}, ${gaps[i]}.`}>
        <span className="ghost-line" aria-hidden="true" />
        <span className="ghost-end is-start" aria-hidden="true">Start</span>
        <span className="ghost-end is-finish" aria-hidden="true">Finish</span>
        <span className="ghost-gap" style={{ left: mid }} aria-hidden="true">{gaps[i]}</span>
        <span className="ghost-dot is-ghost" style={{ left: pos(a) }} aria-hidden="true" />
        <span className="ghost-dot is-runner" style={{ left: pos(b) }} aria-hidden="true" />
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
