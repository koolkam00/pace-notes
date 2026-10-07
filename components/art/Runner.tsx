'use client';

import { useRef } from 'react';
import { polyline, runnerPose, shade } from '@/lib/art/gait';
import { useInView, usePrefersReducedMotion, useTicker } from './useTicker';

export interface RunnerKit {
  kit?: string;
  shorts?: string;
  skin?: string;
}

interface GlyphProps extends RunnerKit {
  /** Stride phase, 0..1. */
  phase: number;
  /** 0 = relaxed, 1 = visibly struggling. */
  effort?: number;
  x?: number;
  y?: number;
  scale?: number;
  shadow?: boolean;
  opacity?: number;
}

/** One geometric runner drawn inside an existing SVG, 100 × 110 user units at scale 1. */
export function RunnerGlyph({ phase, effort = 0, x = 0, y = 0, scale = 1, kit = '#FF5B2E', shorts = '#1E2A4A', skin = '#2B2A33', shadow = true, opacity = 1 }: GlyphProps) {
  const p = runnerPose(phase, effort);
  const farSkin = shade(skin, 0.35);
  const farShorts = shade(shorts, 0.3);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} aria-hidden="true">
      {shadow ? <ellipse cx={50} cy={104} rx={p.shadow} ry={2.2} fill="currentColor" opacity={0.12} /> : null}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={polyline(p.farArm)} stroke={farSkin} strokeWidth={6} />
        <path d={polyline(p.farLeg)} stroke={farSkin} strokeWidth={7.5} />
        <path d={polyline(p.farShorts)} stroke={farShorts} strokeWidth={10} />
        <path d={polyline([p.hip, p.shoulder])} stroke={kit} strokeWidth={13} />
        <path d={polyline(p.nearLeg)} stroke={skin} strokeWidth={7.5} />
        <path d={polyline(p.nearShorts)} stroke={shorts} strokeWidth={10} />
        <path d={polyline(p.nearArm)} stroke={skin} strokeWidth={6} />
      </g>
      <circle cx={p.head[0]} cy={p.head[1]} r={7.2} fill={skin} />
      <rect x={p.bib.x - 3.5} y={p.bib.y - 4} width={7} height={6} rx={1} fill="#FFFDF8" transform={`rotate(${p.bib.angle} ${p.bib.x} ${p.bib.y})`} />
    </g>
  );
}

interface RunnerProps extends RunnerKit {
  size?: number;
  /** Strides per second. */
  cadence?: number;
  offset?: number;
  effort?: number;
  className?: string;
  label?: string;
}

/** A standalone animated runner. Static (mid-stride) when reduced motion is requested or off screen. */
export function Runner({ size = 96, cadence = 1.45, offset = 0, effort = 0, className, label, ...kit }: RunnerProps) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 50, 30);
  return (
    <svg ref={ref} className={className} width={size} height={size * 1.1} viewBox="0 0 100 110" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <RunnerGlyph phase={offset + time * cadence} effort={effort} {...kit} />
    </svg>
  );
}
