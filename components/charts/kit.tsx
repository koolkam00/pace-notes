/**
 * The drawing kit of the Top 100 charts: a fixed 340-unit-wide canvas, so a chart is laid out once on the server and
 * reads the same on the page (scaled to the card) and on the 1080 × 1350 card. Text is measured with lib/charts/measure,
 * so gutters, end labels and value labels are placed, never guessed. Sizes are in canvas units; the card draws one unit
 * as one CSS pixel, and the page never shrinks a canvas below the width that keeps 14-unit text at 12 px.
 */
import type { ReactNode } from 'react';
import { fmt, ticksFor } from '@/lib/charts/fmt';
import { textWidth, type Face } from '@/lib/charts/measure';
import type { Axis, Fmt, KeyItem, Note, Tone } from '@/lib/charts/spec';
import type { UnitSystem } from '@/lib/units';

export const W = 340;
/** Type sizes (canvas units): ticks and value text, direct labels, notes. */
export const T = { tick: 14, label: 15, value: 14, note: 14, head: 15 } as const;

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const tw = (text: string, size: number = T.label, face: Face = 'i500') => textWidth(text, size, face);

/** `fit`: the height the chart must fill (units), when a fixed frame (the card) sets it. */
export type Ctx = { units: UnitSystem; fit?: number };

/** A value between bounds. */
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function scale(d0: number, d1: number, r0: number, r1v: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1v - r0);
}

/** Tick values of an axis: its own, or round ones for its format. */
export function axisTicks(a: Axis, ctx: Ctx, count = 4): number[] {
  if (a.cats) return a.cats.map((_, i) => i);
  return (a.ticks ?? ticksFor(a.min, a.max, a.fmt, count, ctx.units)).filter((v) => v >= a.min - 1e-9 && v <= a.max + 1e-9);
}

export const tickText = (a: Axis, v: number, ctx: Ctx) => (a.cats ? a.cats[Math.round(v)] ?? '' : fmt(v, a.fmt, ctx.units));

/** Fill and stroke classes of a tone. */
export const fillOf = (t: Tone | undefined, fallback: Tone = 'quiet') => `tf-${t ?? fallback}`;
export const strokeOf = (t: Tone | undefined, fallback: Tone = 'quiet') => `ts-${t ?? fallback}`;
/** The text class that goes with a mark's tone: the signal mark's text is signal ink, the rest read as ink. */
export const textTone = (t: Tone | undefined) => (t === 'signal' ? 'is-signal' : t === 'ink' ? 'is-strong' : t === 'quiet' || t === 'faint' ? 'is-quiet' : '');

export function Txt({ x, y, children, cls = 'cx-label', anchor = 'start', size, weight, halo = false, dy }: {
  x: number; y: number; children: ReactNode; cls?: string; anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number;
  halo?: boolean; dy?: string;
}) {
  return (
    <text x={r1(x)} y={r1(y)} dy={dy} className={`${cls}${halo ? ' has-halo' : ''}`} textAnchor={anchor === 'start' ? undefined : anchor}
      style={size || weight ? { fontSize: size ? `${size}px` : undefined, fontWeight: weight } : undefined}>{children}</text>
  );
}

/**
 * Horizontal tick labels that never collide: every tick whose label would touch its neighbour is dropped (keeping the
 * ends), and the end labels turn inward so they stay on the canvas.
 */
export function xTickLayout(values: number[], at: (v: number) => number, text: (v: number) => string, left: number, right: number) {
  const items = values.map((v) => ({ v, x: at(v), t: text(v), w: tw(text(v), T.tick) }));
  const place = (list: typeof items) => list.map((it) => {
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    if (it.x - it.w / 2 < left) anchor = 'start';
    else if (it.x + it.w / 2 > right) anchor = 'end';
    const tx = anchor === 'start' ? Math.max(left, it.x - 2) : anchor === 'end' ? Math.min(right, it.x + 2) : it.x;
    const x0 = anchor === 'start' ? tx : anchor === 'end' ? tx - it.w : tx - it.w / 2;
    return { ...it, anchor, tx, x0, x1: x0 + it.w };
  });
  let keep = place(items);
  for (let step = 1; step <= items.length; step++) {
    // Keep every step-th tick, always ending on the last one when it is a step away, so both ends stay labelled.
    const picked = items.filter((_, i) => i % step === 0);
    keep = place(picked);
    if (keep.every((it, i) => i === 0 || keep[i - 1].x1 + 8 <= it.x0)) break;
  }
  return keep;
}

/** Spread label centres apart by at least `gap`, keeping each as near its anchor as it can, inside [lo, hi]. */
export function relax(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const pos = order.map((o) => o.y);
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let k = 1; k < pos.length; k++) {
      const d = pos[k] - pos[k - 1];
      if (d < gap) { const push = (gap - d) / 2; pos[k - 1] -= push; pos[k] += push; moved = true; }
    }
    for (let k = 0; k < pos.length; k++) pos[k] = Math.min(hi, Math.max(lo, pos[k]));
    if (!moved) break;
  }
  for (let k = 1; k < pos.length; k++) if (pos[k] - pos[k - 1] < gap - 0.01) pos[k] = pos[k - 1] + gap;
  const out = new Array<number>(ys.length);
  order.forEach((o, k) => { out[o.i] = pos[k]; });
  return out;
}

/** Notes in pixel space: text with a halo of the surface, an optional leader to the point. */
export function Notes({ notes, px, ctx }: { notes?: Note[]; px: (n: Note) => [number, number] | null; ctx: Ctx }) {
  if (!notes?.length) return null;
  return (
    <g className="cx-notes">
      {notes.map((n, i) => {
        const p = px(n);
        if (!p) return null;
        const [x, y] = p;
        const tx = x + (n.dx ?? 0), ty = y + (n.dy ?? -10);
        const text = n.value !== undefined && n.fmt ? n.text.replace('{v}', fmt(n.value, n.fmt, ctx.units)) : n.text;
        const lines = text.split('\n');
        const anchor = n.anchor ?? 'middle';
        const cls = `cx-note${n.tone === 'signal' ? ' is-signal' : n.tone === 'quiet' ? ' is-quiet' : ''}`;
        return (
          <g key={i}>
            {n.leader ? <line className={`cx-leader${n.tone === 'signal' ? ' is-signal' : ''}`} x1={r1(x)} y1={r1(y)} x2={r1(tx)} y2={r1(ty + (n.dy !== undefined && n.dy > 0 ? -T.note + 2 : 4))} /> : null}
            <text className={`${cls} has-halo`} x={r1(tx)} y={r1(ty)} textAnchor={anchor === 'start' ? undefined : anchor}>
              {lines.map((l, k) => <tspan key={k} x={r1(tx)} dy={k ? 17 : 0}>{l}</tspan>)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A key row (only for encodings a direct label does not name), wrapped to the canvas. Returns its height. */
export function keyLayout(items: KeyItem[] | undefined, y: number) {
  if (!items?.length) return { node: null, height: 0 };
  let x = 0, row = 0;
  const placed = items.map((k) => {
    const w = 18 + tw(k.label, T.tick) + 14;
    if (x + w > W && x > 0) { x = 0; row++; }
    const at = { k, x, y: y + row * 20 };
    x += w;
    return at;
  });
  const node = (
    <g className="cx-key">
      {placed.map(({ k, x: kx, y: ky }) => (
        <g key={k.label}>
          {k.mark === 'line' || k.mark === 'dash' ? <line className={`${strokeOf(k.tone)}${k.mark === 'dash' ? ' is-dash' : ''} cx-keyline`} x1={kx} x2={kx + 12} y1={ky - 4.5} y2={ky - 4.5} />
            : k.mark === 'ring' ? <circle className={`cx-ring ${strokeOf(k.tone)}`} cx={kx + 6} cy={ky - 4.5} r={4.5} />
              : k.mark === 'band' ? <rect className="cx-band" x={kx} y={ky - 10} width={12} height={11} />
                : k.mark === 'square' ? <rect className={fillOf(k.tone)} x={kx} y={ky - 10} width={11} height={11} />
                  : <circle className={fillOf(k.tone)} cx={kx + 6} cy={ky - 4.5} r={5} />}
          <Txt x={kx + 18} y={ky} cls="cx-tick">{k.label}</Txt>
        </g>
      ))}
    </g>
  );
  return { node, height: (row + 1) * 20 + 6 };
}

/** Gridlines with labels sitting on their left end, above the line (the value axis of an x–y chart). */
export function YGrid({ a, ticks, at, left, right, ctx, title, gutter = 0 }: { a: Axis; ticks: number[]; at: (v: number) => number; left: number; right: number; ctx: Ctx; title?: string; gutter?: number }) {
  return (
    <g className="cx-ygrid">
      {ticks.map((v, i) => {
        const y = at(v);
        const label = tickText(a, v, ctx);
        return (
          <g key={v}>
            <line className={Math.abs(v) < 1e-12 && a.min < 0 ? 'cx-zero' : 'cx-grid'} x1={left} x2={right} y1={r1(y)} y2={r1(y)} />
            {gutter
              // Bars fill the plot's left edge, so their scale sits in a gutter beside it, the title over the top label.
              ? <Txt x={left - 6} y={y + 5} cls="cx-tick" anchor="end">{label}</Txt>
              : <Txt x={left} y={y - 5} cls="cx-tick">{title && i === ticks.length - 1 ? `${label} ${title}` : label}</Txt>}
          </g>
        );
      })}
      {gutter && title ? <Txt x={left - 6 - gutter + 6} y={at(ticks[ticks.length - 1]) - 14} cls="cx-tick">{title}</Txt> : null}
    </g>
  );
}

/** The width a value axis's labels need in a gutter. */
export const gutterFor = (a: Axis, ticks: number[], ctx: Ctx) => Math.ceil(Math.max(...ticks.map((v) => tw(tickText(a, v, ctx), T.tick)))) + 8;

/** Tick labels under the plot, colliding labels dropped. */
export function XTicks({ a, ticks, at, y, left, right, ctx, marks = true }: { a: Axis; ticks: number[]; at: (v: number) => number; y: number; left: number; right: number; ctx: Ctx; marks?: boolean }) {
  const laid = xTickLayout(ticks, at, (v) => tickText(a, v, ctx), left, right);
  return (
    <g className="cx-xticks">
      {laid.map((t) => (
        <g key={t.v}>
          {marks ? <line className="cx-tickmark" x1={r1(t.x)} x2={r1(t.x)} y1={y} y2={y + 5} /> : null}
          <Txt x={t.tx} y={y + 20} cls="cx-tick" anchor={t.anchor}>{t.t}</Txt>
        </g>
      ))}
    </g>
  );
}

/** Wrap text to a width; returns the lines. */
export function wrap(text: string, width: number, size: number = T.label, face: Face = 'i500'): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && tw(next, size, face) > width) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export const valueText = (v: number, f: Fmt, ctx: Ctx) => fmt(v, f, ctx.units);
