'use client';

import { useRef } from 'react';
import { KIT_COLOURS, SKIN_TONES } from '@/lib/art/gait';
import { RunnerGlyph } from './Runner';
import { useInView, usePrefersReducedMotion, useTicker } from './useTicker';
import { useWidth } from '@/components/viz/useSize';

export interface LaneRunner {
  /** Finish time in minutes; speed on screen is proportional to 1 / finish. */
  finishMinutes: number;
  label?: string;
  kit?: string;
  skin?: string;
}

interface Props {
  runners: LaneRunner[];
  height?: number;
  /** Seconds for a 4:00 runner to cross the lane once. */
  crossing?: number;
  dark?: boolean;
  className?: string;
}

/** A lane of illustrated runners moving at speeds proportional to real finish times. */
export default function RunnerLane({ runners, height = 120, crossing = 16, dark = false, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 960);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 50);
  const size = Math.min(84, height * 0.7);
  const scale = size / 100;
  const span = width + size * 2;
  return (
    <div ref={ref} className={`runner-lane ${dark ? 'is-dark' : ''} ${className ?? ''}`} style={{ height }} aria-hidden="true">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={0} x2={width} y1={height - 8} y2={height - 8} className="lane-line" />
        {runners.map((r, i) => {
          const speed = 240 / r.finishMinutes; // relative to a 4:00 runner
          const px = ((time * speed * span) / crossing + (i * span) / runners.length) % span - size;
          const cadence = 1.25 + 0.35 * speed;
          const y = height - 8 - size * 1.1 + (i % 2) * 2;
          const kit = r.kit ?? KIT_COLOURS[i % KIT_COLOURS.length];
          const skin = r.skin ?? SKIN_TONES[(i * 2 + 1) % SKIN_TONES.length];
          return (
            <g key={i} style={{ color: dark ? '#000' : '#15171C' }}>
              <RunnerGlyph phase={time * cadence + i * 0.37} x={px} y={y} scale={scale} kit={kit} skin={skin} shorts={dark ? '#0B0E12' : '#1E2A4A'} />
              {r.label ? (
                <g transform={`translate(${px + size * 0.46} ${y - 4})`}>
                  <rect x={-24} y={-17} width={48} height={18} rx={9} fill={dark ? '#232935' : '#FFFDF8'} stroke={dark ? '#3a4150' : '#DCD3C2'} />
                  <text x={0} y={-4} textAnchor="middle" className="lane-tag">{r.label}</text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
