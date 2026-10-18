'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Readout from './Readout';

/**
 * The scrubber (the redesign spec, section 3.5): touch the data.
 *
 * `mode="needle"` (default): a 1.5 px signal needle down the plot, drawn behind the marks, a gap for the tick labels,
 * then a stem to a 20 px crown in the row under the axis. With `points.y` (a histogram) the needle instead stops just
 * above the top of the column it reads, so the column itself stays in view (`points.yAlt` gives the tops under the
 * figure's other lens); while it is away from the headline's point (`home`, default `initial`) the root carries
 * is-away, and the reading mark turns ink so only one orange mark shows. A horizontal drag (a 6 px move with
 * |dx| > 1.2·|dy|) scrubs and a vertical one scrolls (touch-action: pan-y); a tap sets the needle; on desktop, hover moves
 * it and leaving returns it to the last tap. The needle sits on the nearest point and never eases; within 8 px of a detent
 * it snaps there, the detent's dot flashes and Android ticks (navigator.vibrate(3)).
 *
 * `mode="pick"`: the nearest point to a tap (in both directions) is ringed and read out, for dot strips, scatters and
 * waffles. No needle and no crown.
 *
 * Keyboard: role="slider"; arrows step one point, PageUp and PageDown go to the next and previous detent, Home and End
 * to the ends. The readout redraws every frame; its sr-only live line (a literal aria-live="polite") updates once the
 * value has settled for 150 ms. The default position is the detent the headline names, so the H1 and the readout agree.
 */
export type ScrubPoints = {
  /** x of each point as a fraction of the plot (0 left, 1 right), in reading order. */
  x: number[];
  /** y of each point as a fraction from the top: where the ring sits (pick mode), or the top of the column the needle stops above (needle mode). */
  y?: number[];
  /** The column tops under the figure's other lens (data-k="ratio"), when it draws its columns differently. */
  yAlt?: number[];
  /** Needle mode: where the needle crosses the subject line at each point (a fraction from the top), marked with a dot
   * while the needle is away from the headline's point (at home the chart's own reading mark is there). */
  dot?: number[];
  keys: string[];
  values: string[];
  side?: { label: string; values: string[] }[];
};

type Props = {
  points: ScrubPoints;
  initial: number;
  /** The point the headline names, when the needle opens elsewhere (a scrolly's first step): away from it, is-away. */
  home?: number;
  /** Indices of the meaningful values: round marks, the best point, the value the headline names. */
  detents?: number[];
  /** The slider's accessible name ("Finishes per minute, 2:00 to 7:00"). */
  label: string;
  mode?: 'needle' | 'pick';
  /** The server-drawn plot. */
  children: ReactNode;
  axis?: ReactNode;
  tone?: 'ink' | 'signal';
  onIndex?: (index: number) => void;
};

const SNAP_PX = 8;

export default function Scrubber({ points, initial, home, detents = [], label, mode = 'needle', children, axis, tone = 'ink', onIndex }: Props) {
  const n = points.x.length;
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i));
  const [index, setIndex] = useState(clamp(initial));
  const [committed, setCommitted] = useState(clamp(initial));
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [settled, setSettled] = useState('');
  const plot = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; type: string; decided: 'drag' | 'scroll' | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const last = useRef(index);

  const text = useCallback((i: number) => {
    const side = points.side?.map((s) => `${s.label} ${s.values[i]}`).join(', ');
    return `${points.keys[i]}: ${points.values[i]}${side ? `, ${side}` : ''}`;
  }, [points]);

  // The live line settles 150 ms after the last change, so a screen reader hears one value, not every frame.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(text(index)), 150);
    onIndex?.(index);
    return () => clearTimeout(timer.current);
  }, [index, text, onIndex]);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(flashTimer.current); }, []);
  // A page may set the needle from outside (a scrolly step that names a minute): a 'scrub-to' event, the index as detail.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const to = (e: Event) => { const i = Math.max(0, Math.min(n - 1, Number((e as CustomEvent).detail) || 0)); last.current = i; setIndex(i); setCommitted(i); };
    el.addEventListener('scrub-to', to);
    return () => el.removeEventListener('scrub-to', to);
  }, [n]);

  const move = useCallback((i: number, haptic: boolean) => {
    if (i === last.current) return;
    last.current = i;
    setIndex(i);
    if (detents.includes(i)) {
      setFlash(i);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 240);
      if (haptic) { try { navigator.vibrate?.(3); } catch { /* not allowed here */ } }
    }
  }, [detents]);

  /** The point under a pointer: the nearest by x (needle) or by distance (pick), a detent within 8 px winning. */
  const pointAt = useCallback((clientX: number, clientY: number) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || !box.width) return last.current;
    const fx = (clientX - box.left) / box.width;
    if (mode === 'pick' && points.y) {
      const fy = (clientY - box.top) / box.height;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot((points.x[i] - fx) * box.width, (points.y[i] - fy) * box.height);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    for (const d of detents) if (Math.abs(points.x[d] - fx) * box.width <= SNAP_PX) return d;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(points.x[i] - fx);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, [mode, points, n, detents]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, decided: null };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) {
      if (e.pointerType === 'mouse' && !e.buttons) move(pointAt(e.clientX, e.clientY), false);
      return;
    }
    if (g.decided === null) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) >= 6 && Math.abs(dx) > 1.2 * Math.abs(dy)) {
        g.decided = 'drag';
        setDragging(true);
        setTouched(true);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
      } else if (Math.abs(dy) >= 6) {
        g.decided = 'scroll';
        gesture.current = null;
        return;
      } else return;
    }
    if (g.decided === 'drag') move(pointAt(e.clientX, e.clientY), g.type === 'touch');
  };
  const end = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.decided === 'drag' || (!cancelled && g.decided === null)) {
      const i = pointAt(e.clientX, e.clientY);
      move(i, false);
      setCommitted(i);
      setTouched(true);
    }
    setDragging(false);
  };
  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && !gesture.current) { last.current = committed; setIndex(committed); }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const sorted = [...detents].sort((a, b) => a - b);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clamp(index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clamp(index - 1);
    else if (e.key === 'PageUp') next = sorted.find((d) => d > index) ?? (sorted.length ? sorted[sorted.length - 1] : clamp(index + 10));
    else if (e.key === 'PageDown') next = [...sorted].reverse().find((d) => d < index) ?? (sorted.length ? sorted[0] : clamp(index - 10));
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    move(next, false);
    setCommitted(next);
    setTouched(true);
  };

  const x = points.x[index] ?? 0;
  const y = points.y?.[index];
  const yAlt = points.yAlt?.[index];
  const dot = points.dot?.[index];
  const pos = `${(x * 100).toFixed(3)}%`;
  const hintLeft = x > 0.66;
  return (
    <div ref={root} className={`scrub is-${mode}${dragging ? ' is-dragging' : ''}${touched ? ' is-touched' : ''}${index !== clamp(home ?? initial) ? ' is-away' : ''}`}>
      <Readout hidden keyText={points.keys[index]} value={points.values[index]} tone={tone} side={points.side?.map((s) => ({ label: s.label, value: s.values[index] }))} />
      <p className="sr-only" aria-live="polite">{settled}</p>
      <div className="scrub-area" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(e) => end(e, false)} onPointerCancel={(e) => end(e, true)} onPointerLeave={onPointerLeave}>
        <div ref={plot} className="viz-plot scrub-plot" role="slider" tabIndex={0} aria-label={label}
          aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={index} aria-valuetext={text(index)} onKeyDown={onKeyDown}>
          {mode === 'needle' ? <span className={`scrub-needle${y !== undefined ? ' is-front' : ''}`} style={{ left: pos, ...(y !== undefined ? { ['--needle-top' as string]: `${(y * 100).toFixed(3)}%` } : {}), ...(yAlt !== undefined ? { ['--needle-top-alt' as string]: `${(yAlt * 100).toFixed(3)}%` } : {}) }} aria-hidden="true" /> : null}
          {children}
          {mode === 'needle' && dot !== undefined && Number.isFinite(dot) ? <span className="scrub-dot" style={{ left: pos, top: `${(dot * 100).toFixed(3)}%` }} aria-hidden="true" /> : null}
          {mode === 'needle' ? (
            <>
              <span className="scrub-detents" aria-hidden="true">
                {detents.map((d) => <i key={d} className={`${flash === d ? 'is-flash' : ''}${d === index ? ' is-on' : ''}`.trim() || undefined} style={{ left: `${(points.x[d] * 100).toFixed(3)}%` }} />)}
              </span>
            </>
          ) : (
            <span className="scrub-ring" style={{ left: pos, top: `${((y ?? 0.5) * 100).toFixed(3)}%` }} aria-hidden="true" />
          )}
        </div>
        {axis}
        {mode === 'needle' ? (
          <div className="scrub-crown-row" aria-hidden="true">
            <span className="scrub-crown" style={{ left: pos }} />
            <span className={`scrub-hint${hintLeft ? ' is-left' : ''}`} style={{ left: pos }}>‹ drag ›</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
