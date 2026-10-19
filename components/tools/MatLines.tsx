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

type Box = { x0: number; x1: number; y0: number; y1: number };
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Lines along the course, mat by mat (the redesign spec's line profile, section 3.6): each line is a group's elapsed time
 * against a reference (even pace) at every 5K mat and the finish, starting level at the start. Ahead is up. The
 * reference is a solid ink zero line named "Even" at its right end; the gridlines above it are minutes ahead, the top one
 * saying so ("15 min ahead", then "10", "5"), each labelled above its line at the left, where every line still runs near
 * the start (critic round 5: "−15:00" read as minus fifteen minutes, and a "+5:00" row stood empty under the lines). A
 * row behind even pace is drawn only when a line goes there. Each line is named on the chart, beside the stretch where
 * its name has room (its furthest point first), so no key is needed; the one the sentence is about is in signal. Ticks
 * are 12 px. Drawn in pixels at the measured width.
 */
export default function MatLines({ lines, zeroTick = 'Even', units: _units, label, bracket }: {
  lines: MatLine[];
  /** The gap a sentence names between the first two lines at one mat ("8:26" at 20K): an ink bracket there, labelled. */
  bracket?: { km: number; label: string };
  /** The zero line's name at its right end: "Even". */
  zeroTick?: string;
  units: UnitSystem; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 520;
  const H = narrow ? 210 : 250;
  const kms = [0, ...CHECKPOINTS];
  const all = lines.flatMap((l) => l.gaps);
  const minV = Math.min(0, ...all);
  const maxV = Math.max(0, ...all);
  const span = Math.max(maxV - minV, 60);
  const tick = [60, 120, 180, 300, 600, 900, 1800].find((s) => span / s <= 3) ?? 1800;
  const lo = Math.floor((minV - span * 0.1) / tick) * tick;
  // Nothing behind even pace: the zero line is the plot's floor.
  const hi = maxV > 0 ? Math.ceil((maxV + span * 0.1) / tick) * tick : 0;
  const m = { l: 2, r: 2, t: 20, b: 26 };
  const iw = Math.max(40, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih; // ahead (negative) at the top
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) if (v !== 0) ticks.push(v);
  const minutes = (v: number) => String(Math.round(Math.abs(v) / 60));
  // The furthest gridline either side names its unit and side; the others are its minutes.
  const tickText = (v: number) => (v === lo ? `${minutes(v)} min ahead` : v === ticks[ticks.length - 1] && v > 0 ? `${minutes(v)} min behind` : minutes(v));
  const path = (gaps: number[]) => [0, ...gaps].map((v, i) => `${i ? 'L' : 'M'}${x(kms[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  // The mats are named as they are on the course, in both unit modes (spec section 3.10): Start, 10K … 40K.
  const xTicks = fitTicks([0, 10, 20, 30, 40].map((km) => ({ x: x(km), label: km ? `${km}K` : 'Start' })), width);
  const zeroY = y(0);

  // Everything a name must keep clear of: every line (sampled along each segment), the gridline labels at the left, the
  // zero line's name at the right, the bracket and its label, and the plot's edges.
  const taken: Box[] = [];
  for (const l of lines) {
    const pts = [0, ...l.gaps].map((v, i) => [x(kms[i]), y(v)] as const);
    for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 8; k++) {
      const px = pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / 8, py = pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / 8;
      taken.push({ x0: px - 3, x1: px + 3, y0: py - 3, y1: py + 3 });
    }
  }
  for (const v of ticks) { const w = tickText(v).length * 7 + 4; taken.push({ x0: m.l, x1: m.l + w, y0: y(v) - 17, y1: y(v) }); }
  const zeroW = zeroTick.length * 7.4 + 6;
  taken.push({ x0: m.l + iw - zeroW, x1: m.l + iw, y0: zeroY - 17, y1: zeroY });
  const bi = bracket ? CHECKPOINTS.indexOf(bracket.km) : -1;
  const br = bracket && bi >= 0 && lines.length >= 2 ? (() => {
    const ya = y(lines[0].gaps[bi]), yb = y(lines[1].gaps[bi]);
    const top = Math.min(ya, yb) + 4, bottom = Math.max(ya, yb) - 4;
    if (bottom - top < 12) return null;
    const bx = x(bracket.km) + 8;
    return { bx, top, bottom };
  })() : null;
  if (br && bracket) taken.push({ x0: br.bx - 6, x1: br.bx + 10 + bracket.label.length * 8.6, y0: br.top - 2, y1: br.bottom + 2 });
  // Each name: beside a mat of its own line, above it or below it, its furthest point from even pace tried first, centred
  // on the mat, then starting or ending there.
  const placedNames = lines.map((l) => {
    const size = 13, w = l.label.length * 7.1 + 4;
    const order = l.gaps.map((g, i) => i).sort((a, b) => Math.abs(l.gaps[b]) - Math.abs(l.gaps[a]));
    const other = lines.filter((o) => o !== l);
    for (const i of order) {
      const px = x(CHECKPOINTS[i]), py = y(l.gaps[i]);
      // Away from the other line: above when this line runs above it there, below when under it.
      const above = other.length ? l.gaps[i] <= other[0].gaps[i] : l.gaps[i] <= 0;
      for (const side of [above, !above]) for (const start of [px - w / 2, px, px - w]) {
        const base = side ? py - 9 : py + 9 + size * 0.8;
        const x0 = Math.max(m.l, Math.min(start, m.l + iw - w));
        const box = { x0, x1: x0 + w, y0: base - size * 0.8 - 1, y1: base + 3 };
        if (box.y0 < 0 || box.y1 > zeroY + (hi > 0 ? ih : 0) - 1 || box.y1 > H - m.b) continue;
        if (taken.some((t) => hit(t, box))) continue;
        taken.push(box);
        return { l, x: x0, y: base };
      }
    }
    return null;
  });
  // A line with no room for its name (a narrow phone) would be unnamed: then every line is named in a key under the
  // chart instead, so the two never read differently.
  const named = placedNames.every(Boolean);
  const names = named ? placedNames : [];
  return (
    <figure className="viz mat-lines" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((v) => (
          <g key={v} className="mat-lines-grid">
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text x={m.l} y={y(v) - 5}>{tickText(v)}</text>
          </g>
        ))}
        <line className="mat-lines-zero" x1={m.l} x2={m.l + iw} y1={zeroY} y2={zeroY} />
        <text className="mat-lines-zero-label" x={m.l + iw} y={zeroY - 5} textAnchor="end">{zeroTick}</text>
        {xTicks.map((t) => <text key={t.label} className="mat-lines-tick" x={t.x} y={H - 6} textAnchor={t.anchor}>{t.label}</text>)}
        {br && bracket ? (
          <g className="mat-lines-bracket">
            <path d={`M${br.bx - 4} ${br.top} H${br.bx} V${br.bottom} H${br.bx - 4}`} />
            <text x={br.bx + 6} y={(br.top + br.bottom) / 2 + 5}>{bracket.label}</text>
          </g>
        ) : null}
        {lines.map((l) => (
          <g key={l.key} className={`mat-lines-line is-${l.tone}`}>
            <path d={path(l.gaps)} />
            <circle cx={x(MARATHON_KM)} cy={y(l.gaps[8])} r={4} />
          </g>
        ))}
        {names.map((n) => (n ? <text key={n.l.key} className={`mat-lines-name is-${n.l.tone}`} x={n.x} y={n.y}>{n.l.label}</text> : null))}
      </svg>
      {named ? null : (
        <ul className="mat-lines-key" aria-hidden="true">
          {lines.map((l) => <li key={l.key}><i className={`mat-lines-key-mark is-${l.tone}`} />{l.label}</li>)}
        </ul>
      )}
    </figure>
  );
}
