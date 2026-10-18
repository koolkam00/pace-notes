'use client';

import { useRef } from 'react';
import { useWidth } from '@/components/viz/useSize';
import { fitTicks } from '@/components/tools/ticks';
import { CHECKPOINTS } from '@/lib/tools/pace-band-data';
import { formatDuration } from '@/lib/tools/time';
import { MARATHON_KM, type UnitSystem } from '@/lib/units';

/** One line: its gap at each of the nine mats in seconds (negative = ahead of the reference), and how it is drawn. */
export interface MatLine { key: string; label: string; gaps: number[]; tone: 'ink' | 'signal' | 'quiet' }

/** "2:41 ahead", "level", "0:35 behind". */
export const aheadText = (seconds: number) => (Math.abs(seconds) < 0.5 ? 'level' : `${formatDuration(Math.abs(seconds))} ${seconds < 0 ? 'ahead' : 'behind'}`);

/**
 * Lines along the course, mat by mat (the redesign spec's line profile, section 3.6): each line is a group's elapsed time
 * against a reference (even pace, or a runner's own times) at every 5K mat and the finish, starting level at the start.
 * Ahead is up. The reference is a solid ink zero line, named on the axis ("Even") and in full in the key; lines are 2 px
 * with round joins, the one the sentence is about in signal. Direct labels sit at the right end on wide screens and in
 * the key on phones, so none is cut off or crossed by a line. Ticks are 12 px. Drawn in pixels at the measured width.
 */
export default function MatLines({ lines, zero, zeroTick = 'Even', units: _units, label, bracket }: {
  lines: MatLine[];
  /** The gap a sentence names between the first two lines at one mat ("8:26" at 20K): an ink bracket there, labelled. */
  bracket?: { km: number; label: string };
  /** What the zero line is, said in full in the key under the chart: "even pace for 4:00", "your race". */
  zero: string;
  /** Its short name on the axis, where a tick would be: "Even", "You". */
  zeroTick?: string;
  units: UnitSystem; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 520;
  const H = narrow ? 200 : 240;
  const kms = [0, ...CHECKPOINTS];
  const all = lines.flatMap((l) => l.gaps);
  const minV = Math.min(0, ...all);
  const maxV = Math.max(0, ...all);
  const span = Math.max(maxV - minV, 60);
  const tick = [30, 60, 120, 180, 300, 600, 900, 1800].find((s) => span / s <= 3) ?? 1800;
  const lo = Math.floor((minV - span * 0.1) / tick) * tick;
  const hi = Math.ceil((maxV + span * 0.1) / tick) * tick;
  const tickText = (v: number) => `${v < 0 ? '−' : '+'}${formatDuration(Math.abs(v))}`;
  // Room on the left for the longest tick ("−15:00" is about 42 px at 12 px) and on the right for the longest end label.
  const longest = Math.max(zeroTick.length, ...[lo, hi].map((v) => tickText(v).length));
  // The name is 14 px, the gap under it 12 px.
  const endChars = Math.max(0, ...lines.map((l) => Math.max(l.label.length, aheadText(l.gaps[8]).length * 0.86)));
  const m = { l: Math.ceil(14 + longest * 7.2), r: narrow ? 8 : Math.ceil(18 + endChars * 8), t: 16, b: 26 };
  const iw = Math.max(40, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih; // ahead (negative) at the top
  const ticks: number[] = [];
  // Ticks clear of the zero line's own label.
  for (let v = lo; v <= hi + 1e-9; v += tick) if (v !== 0 && Math.abs(y(v) - y(0)) >= 14) ticks.push(v);
  const path = (gaps: number[]) => [0, ...gaps].map((v, i) => `${i ? 'L' : 'M'}${x(kms[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  // The mats are named as they are on the course, in both unit modes (spec section 3.10): Start, 10K … 40K.
  const xTicks = fitTicks([0, 10, 20, 30, 40].map((km) => ({ x: x(km), label: km ? `${km}K` : 'Start' })), width);
  // End labels (a name and its gap under it), kept at least 36 px apart.
  const ends = lines.map((l) => ({ l, ly: y(l.gaps[8]) })).sort((a, b) => a.ly - b.ly);
  for (let k = 1; k < ends.length; k += 1) if (ends[k].ly - ends[k - 1].ly < 36) ends[k].ly = ends[k - 1].ly + 36;
  const zeroY = y(0);
  return (
    <figure className="viz mat-lines" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((v) => (
          <g key={v} className="mat-lines-grid">
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{tickText(v)}</text>
          </g>
        ))}
        <line className="mat-lines-zero" x1={m.l} x2={m.l + iw} y1={zeroY} y2={zeroY} />
        <text className="mat-lines-zero-label" x={m.l - 8} y={zeroY + 4} textAnchor="end">{zeroTick}</text>
        {xTicks.map((t) => <text key={t.label} className="mat-lines-tick" x={t.x} y={H - 6} textAnchor={t.anchor}>{t.label}</text>)}
        {(() => {
          const i = bracket ? CHECKPOINTS.indexOf(bracket.km) : -1;
          if (!bracket || i < 0 || lines.length < 2) return null;
          const ya = y(lines[0].gaps[i]), yb = y(lines[1].gaps[i]);
          const top = Math.min(ya, yb) + 4, bottom = Math.max(ya, yb) - 4;
          if (bottom - top < 12) return null;
          const bx = x(bracket.km) + 8;
          return (
            <g className="mat-lines-bracket">
              <path d={`M${bx - 4} ${top} H${bx} V${bottom} H${bx - 4}`} />
              <text x={bx + 6} y={(top + bottom) / 2 + 5}>{bracket.label}</text>
            </g>
          );
        })()}
        {lines.map((l) => (
          <g key={l.key} className={`mat-lines-line is-${l.tone}`}>
            <path d={path(l.gaps)} />
            <circle cx={x(MARATHON_KM)} cy={y(l.gaps[8])} r={4} />
          </g>
        ))}
        {narrow ? null : ends.map(({ l, ly }) => (
          <g key={l.key} className={`mat-lines-end is-${l.tone}`}>
            <text x={m.l + iw + 10} y={ly}>{l.label}</text>
            <text x={m.l + iw + 10} y={ly + 15} className="mat-lines-end-sub">{aheadText(l.gaps[8])}</text>
          </g>
        ))}
      </svg>
      <ul className="mat-lines-key" aria-hidden="true">
        <li className="is-zero"><i /><span>{zero}</span></li>
        {narrow ? lines.map((l) => <li key={l.key} className={`is-${l.tone}`}><i /><b>{l.label}</b><span>{aheadText(l.gaps[8])} at the finish</span></li>) : null}
      </ul>
    </figure>
  );
}
