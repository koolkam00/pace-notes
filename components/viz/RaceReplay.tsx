'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/components/art/useTicker';
import ReplayFrame from './ReplayFrame';
import { byFinish, fieldX, fieldY, FIELD_BOX, hudShare, MARATHON, positionAt, raceClock, routeAspect, sharesAt, type ReplayEdition } from './replay-geometry';

export type { ReplayEdition } from './replay-geometry';

/**
 * The race replay (the redesign spec, section 3.6), loaded only on pages that render one (next/dynamic in
 * ReplayStage). Every finish of a sampled field on one race clock.
 *
 * The field view draws rank lanes: x is distance covered, y is finish rank (fastest at the top), so the field reads as
 * a needle that tilts as the race unfolds. Dots are --night-ink; dots after 20K in a section at least 25% slower than
 * their own 5–20K pace are --night-signal. The route view runs the same dots on the course map.
 *
 * Play: when the frame is 35% in view it runs once from 20 race-minutes before the first finish (the flag) up to it, at
 * 3 race-minutes a second, and pauses there with the moment's sentence. Play continues to the last finish; tapping the
 * canvas pauses. Under reduced motion (or the site's Motion switch) it opens still on the flag frame and plays only on
 * request. Colours come from the tokens (getComputedStyle), never from this file.
 */
type Props = {
  edition: ReplayEdition;
  /** The first finish of the whole field (the flag), seconds. */
  flag: number;
  view?: 'field' | 'route';
  band?: boolean;
  race: string;
  moment?: string;
  poster?: ReactNode;
  autoplay?: boolean;
};

const INTRO = 20 * 60;
const INTRO_SPEED = 180;
const PLAY_SPEED = 600;

type Phase = 'waiting' | 'intro' | 'flag' | 'playing' | 'paused' | 'ended';

function tokens(el: Element) {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return { ink: v('--night-ink'), signal: v('--night-signal'), quiet: v('--night-mark-quiet'), rule: v('--night-3'), ink3: v('--night-ink-3') };
}

function routeLocator(route: NonNullable<ReplayEdition['route']>) {
  const { points, km } = route;
  const total = km[km.length - 1] || MARATHON;
  return (distance: number): [number, number] => {
    const d = (Math.min(distance, MARATHON) / MARATHON) * total;
    let lo = 0, hi = km.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (km[mid] <= d) lo = mid; else hi = mid; }
    const f = Math.max(0, Math.min(1, (d - km[lo]) / (km[hi] - km[lo] || 1)));
    return [points[lo][0] + f * (points[hi][0] - points[lo][0]), points[lo][1] + f * (points[hi][1] - points[lo][1])];
  };
}

function hash(i: number) {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export default function RaceReplay({ edition, flag, view = 'field', band = false, race, moment, poster, autoplay = true }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const sorted = useMemo(() => byFinish(edition.rows), [edition.rows]);
  const last = useMemo(() => sorted.reduce((m, r) => Math.max(m, r[8]), 0), [sorted]);
  const max = last + 300;
  const [time, setTime] = useState(flag);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [shown, setShown] = useState(false);
  const timeRef = useRef(flag);
  const colours = useRef<ReturnType<typeof tokens> | null>(null);
  const locate = useMemo(() => (edition.route ? routeLocator(edition.route) : null), [edition.route]);
  const mode = view === 'route' && locate ? 'route' : 'field';

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    colours.current = tokens(node);
    const measure = () => setSize({ w: Math.floor(node.clientWidth), h: Math.floor(node.clientHeight) });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Start once, when 35% of the frame is in view; under reduced motion, show the flag frame and wait for play.
  useEffect(() => {
    const node = box.current;
    if (!node || phase !== 'waiting') return;
    if (reduced || !autoplay) { setShown(true); setPhase('flag'); return; }
    if (typeof IntersectionObserver === 'undefined') { setShown(true); setPhase('flag'); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      timeRef.current = Math.max(0, flag - INTRO);
      setTime(timeRef.current);
      setShown(true);
      setPhase('intro');
    }, { threshold: 0.35 });
    io.observe(node);
    return () => io.disconnect();
  }, [phase, reduced, autoplay, flag]);

  useEffect(() => {
    if (phase !== 'intro' && phase !== 'playing') return;
    let frame = 0;
    let prev = performance.now();
    const speed = phase === 'intro' ? INTRO_SPEED : PLAY_SPEED;
    const stop = phase === 'intro' ? flag : max;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const next = Math.min(stop, timeRef.current + dt * speed);
      timeRef.current = next;
      setTime(next);
      if (next >= stop) { setPhase(phase === 'intro' ? 'flag' : 'ended'); return; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, flag, max]);

  const draw = useCallback(() => {
    const node = canvas.current;
    const c = colours.current;
    if (!node || !c || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size.w, H = size.h;
    if (node.width !== Math.round(W * dpr)) node.width = Math.round(W * dpr);
    if (node.height !== Math.round(H * dpr)) node.height = Math.round(H * dpr);
    const g = node.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const t = time;
    const n = sorted.length;
    const r = band ? 1.1 : W < 600 ? 1.25 : 1.5;
    let place: (km: number, i: number) => [number, number];
    if (mode === 'route' && locate && edition.route) {
      const pts = edition.route.points;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const bx = Math.min(...xs), by = Math.min(...ys);
      const bw = Math.max(1e-6, Math.max(...xs) - bx), bh = Math.max(1e-6, Math.max(...ys) - by);
      const s = Math.min((W * 0.9) / bw, (H * 0.88) / bh);
      const ox = (W - bw * s) / 2 - bx * s, oy = (H - bh * s) / 2 - by * s;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = c.rule; g.lineWidth = 8;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * s, oy + y * s) : g.moveTo(ox + x * s, oy + y * s)));
      g.stroke();
      g.strokeStyle = c.quiet; g.lineWidth = 1.5;
      g.stroke();
      place = (km, i) => {
        const [x, y] = locate(km);
        const a = hash(i) * Math.PI * 2, d = 3 * hash(i + 7);
        return [ox + x * s + Math.cos(a) * d, oy + y * s + Math.sin(a) * d];
      };
    } else {
      const fx = fieldX(MARATHON) * W;
      g.strokeStyle = c.rule; g.lineWidth = 1;
      g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(fx, FIELD_BOX.top * H); g.lineTo(fx, (1 - FIELD_BOX.bottom) * H); g.stroke();
      g.setLineDash([]);
      const x20 = fieldX(20) * W;
      g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(x20, FIELD_BOX.top * H); g.lineTo(x20, (1 - FIELD_BOX.bottom) * H); g.stroke();
      g.globalAlpha = 1;
      place = (km, i) => [fieldX(km) * W, fieldY(n > 1 ? i / (n - 1) : 0.5) * H];
    }
    const slow: [number, number][] = [];
    g.fillStyle = c.ink;
    for (let i = 0; i < n; i++) {
      const p = positionAt(sorted[i], t);
      const [x, y] = place(p.km, i);
      if (p.slowdownPace) { slow.push([x, y]); continue; }
      g.globalAlpha = p.finished ? 0.4 : 0.85;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = c.signal;
    for (const [x, y] of slow) { g.beginPath(); g.arc(x, y, r + 0.3, 0, Math.PI * 2); g.fill(); }
  }, [size, time, sorted, mode, locate, edition.route, band]);

  useEffect(() => { draw(); }, [draw]);

  const toggle = () => {
    if (phase === 'intro' || phase === 'playing') { setPhase('paused'); return; }
    if (phase === 'ended' || timeRef.current >= max) { timeRef.current = 0; setTime(0); }
    setShown(true);
    setPhase('playing');
  };
  const scrub = (seconds: number) => {
    timeRef.current = seconds;
    setTime(seconds);
    setShown(true);
    setPhase('paused');
  };
  const shares = useMemo(() => sharesAt(edition.rows, time), [edition.rows, time]);
  const playing = phase === 'intro' || phase === 'playing';
  const atFlag = Math.abs(time - flag) < 30;
  return (
    <div ref={box} className="replay-measure">
      <ReplayFrame race={race} clock={raceClock(time)} finished={hudShare(shares.finished)} slow={hudShare(shares.slowdownPace)} view={mode} band={band} aspect={routeAspect(edition.route?.points)}
        poster={poster}
        canvas={<canvas ref={canvas} className={`replay-canvas${shown ? ' is-shown' : ''}`} onClick={toggle} role="img"
          aria-label={`${race}: ${edition.sample.toLocaleString('en-US')} sampled finishes on one race clock, ${raceClock(time)}. ${hudShare(shares.finished)} finished.`} />}
        moment={moment} momentOn={atFlag && !playing} playing={playing} onPlay={toggle} time={time} max={max} onScrub={scrub} valuetext={raceClock(time)} live={shown} />
    </div>
  );
}
