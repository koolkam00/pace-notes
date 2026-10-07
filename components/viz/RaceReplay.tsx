'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion, useInView } from '@/components/art/useTicker';
import { useUnits } from '@/components/UnitsProvider';

export const CHECKPOINT_KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195] as const;
const KM = [0, ...CHECKPOINT_KM];
const PACE_COLOURS = ['#2F5BFF', '#5C80FF', '#A9BCFF', '#EFE8DA', '#FFB48A', '#FF6A3D', '#E2416B'];

export interface ReplayEdition {
  city: string;
  year: number;
  finishes: number;
  sample: number;
  /** Each row: nine cumulative elapsed seconds (5…42.195 km) then a gender code (0 men, 1 women, 2 other/unrecorded). */
  rows: number[][];
  /** Optional route polyline in a unit box with cumulative distance (km) per vertex. */
  route?: { points: [number, number][]; km: number[] } | null;
}

interface Props {
  edition: ReplayEdition;
  /** Race-clock seconds advanced per real second. */
  defaultSpeed?: number;
  height?: number;
  variant?: 'track' | 'route';
  ghostMinutes?: number | null;
  autoplay?: boolean;
  onTime?: (seconds: number) => void;
  className?: string;
}

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function hash(i: number) {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

interface Position {
  km: number;
  rel: number;
  finished: boolean;
  slowSection: boolean;
}

function positionAt(row: number[], t: number): Position {
  const finish = row[8];
  const baseline = (row[3] - row[0]) / 15;
  if (t >= finish) return { km: 42.195, rel: 0, finished: true, slowSection: false };
  let j = 0;
  while (j < 8 && row[j] <= t) j += 1;
  const start = j === 0 ? 0 : row[j - 1];
  const end = row[j];
  const f = (t - start) / (end - start);
  const km = KM[j] + f * (KM[j + 1] - KM[j]);
  const pace = (end - start) / (KM[j + 1] - KM[j]);
  const rel = pace / baseline - 1;
  return { km, rel, finished: false, slowSection: j >= 4 && rel >= 0.25 };
}

function routeLocator(route: NonNullable<ReplayEdition['route']>) {
  const { points, km } = route;
  const total = km[km.length - 1] || 42.195;
  return (distance: number): [number, number] => {
    const d = (distance / 42.195) * total;
    let lo = 0;
    let hi = km.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (km[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = km[hi] - km[lo] || 1;
    const f = Math.max(0, Math.min(1, (d - km[lo]) / span));
    return [points[lo][0] + f * (points[hi][0] - points[lo][0]), points[lo][1] + f * (points[hi][1] - points[lo][1])];
  };
}

export default function RaceReplay({ edition, defaultSpeed = 600, height = 460, variant = 'track', ghostMinutes = null, autoplay = true, onTime, className }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(wrap, '0px');
  const { units } = useUnits();
  const [width, setWidth] = useState(960);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(defaultSpeed);
  const userPaused = useRef(false);
  const timeRef = useRef(0);
  const rows = edition.rows;
  const lastFinish = useMemo(() => rows.reduce((m, r) => Math.max(m, r[8]), 0), [rows]);
  const firstFinish = useMemo(() => rows.reduce((m, r) => Math.min(m, r[8]), Infinity), [rows]);
  // Gaussian lanes (Box–Muller on stable hashes) so the field reads like a road: dense centre, soft edges.
  const lanes = useMemo(() => rows.map((_, i) => {
    const u = Math.max(1e-6, hash(i));
    const v = hash(i + 7919);
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0.02, Math.min(0.98, 0.5 + g * 0.16));
  }), [rows]);
  const locate = useMemo(() => (edition.route ? routeLocator(edition.route) : null), [edition.route]);
  const mode = variant === 'route' && locate ? 'route' : 'track';
  // Fit the route's own bounding box, so wide or tall routes fill the canvas instead of a thin band.
  const box = useMemo(() => {
    const pts = edition.route?.points;
    if (!pts?.length) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x0, y0, w: Math.max(1e-6, Math.max(...xs) - x0), h: Math.max(1e-6, Math.max(...ys) - y0) };
  }, [edition.route]);
  const canvasHeight = mode === 'route' && box && width < 640 ? Math.min(height, Math.max(300, Math.round(((width - 36) / box.w) * box.h + 80))) : height;

  useEffect(() => {
    const node = wrap.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Start once visible unless the reader prefers reduced motion; show a meaningful still otherwise.
  useEffect(() => {
    if (reduced) {
      setPlaying(false);
      timeRef.current = Math.round(firstFinish * 1.15);
      setTime(timeRef.current);
      return;
    }
    if (autoplay && inView && !userPaused.current) setPlaying(true);
    if (!inView) setPlaying(false);
  }, [autoplay, inView, reduced, firstFinish]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let next = timeRef.current + dt * speed;
      if (next > lastFinish + 600) next = 0;
      timeRef.current = next;
      setTime(next);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, lastFinish]);

  useEffect(() => onTime?.(time), [time, onTime]);

  const stats = useMemo(() => {
    let finished = 0;
    let slow = 0;
    let running = 0;
    let lead = 0;
    for (const row of rows) {
      const p = positionAt(row, time);
      if (p.finished) finished += 1;
      else {
        running += 1;
        if (p.slowSection) slow += 1;
        lead = Math.max(lead, p.km);
      }
    }
    return { finished, slow, running, lead };
  }, [rows, time]);

  const draw = useCallback(() => {
    const node = canvas.current;
    if (!node) return;
    const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    const W = width;
    const H = canvasHeight;
    if (node.width !== Math.round(W * dpr)) node.width = Math.round(W * dpr);
    if (node.height !== Math.round(H * dpr)) node.height = Math.round(H * dpr);
    const g = node.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const mobile = W < 640;
    const padX = mobile ? 18 : 40;
    const dotR = mobile ? 1.5 : 1.9;
    let place: (km: number, lane: number) => [number, number];

    if (mode === 'route' && locate) {
      const b = box ?? { x0: 0, y0: 0, w: 1, h: 1 };
      const size = Math.min((W - padX * 2) / b.w, (H - 40) / b.h);
      const ox = (W - b.w * size) / 2 - b.x0 * size;
      const oy = (H - b.h * size) / 2 - b.y0 * size;
      const pts = edition.route!.points;
      g.strokeStyle = 'rgba(245,240,230,0.10)';
      g.lineWidth = 10;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * size, oy + y * size) : g.moveTo(ox + x * size, oy + y * size)));
      g.stroke();
      g.strokeStyle = 'rgba(47,91,255,0.9)';
      g.lineWidth = 2;
      g.stroke();
      place = (km, lane) => {
        const [x, y] = locate(km);
        const a = lane * Math.PI * 2;
        const r = 4 * hash(Math.floor(lane * 1e6));
        return [ox + x * size + Math.cos(a) * r, oy + y * size + Math.sin(a) * r];
      };
    } else {
      const x0 = padX;
      const x1 = W - padX - (mobile ? 22 : 56);
      const top = 34;
      const bottom = H - 34;
      const X = (km: number) => x0 + ((x1 - x0) * km) / 42.195;
      g.font = `${mobile ? 10 : 11}px "JetBrains Mono Variable", ui-monospace, monospace`;
      g.textAlign = 'center';
      const marks = units === 'mi'
        ? [0, 5, 10, 15, 20, 25, 26.2].map((mi) => ({ km: Math.min(42.195, mi * 1.609344), label: mi === 0 ? 'start' : mi === 26.2 ? 'finish' : `${mi} mi` }))
        : [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195].map((km) => ({ km, label: km === 0 ? 'start' : km === 42.195 ? 'finish' : `${km} km` }));
      for (const m of marks) {
        g.strokeStyle = m.km === 0 || m.km >= 42 ? 'rgba(244,178,62,0.55)' : 'rgba(245,240,230,0.08)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(X(m.km), top - 6);
        g.lineTo(X(m.km), bottom + 4);
        g.stroke();
        const show = !mobile || ['start', 'finish', '10 mi', '20 mi', '10 km', '20 km', '30 km', '40 km'].includes(m.label);
        g.fillStyle = 'rgba(185,179,166,0.85)';
        if (show && !(m.label === '25 mi')) g.fillText(m.label, X(m.km), bottom + 20);
      }
      const road = g.createLinearGradient(0, top, 0, bottom);
      road.addColorStop(0, 'rgba(245,240,230,0)');
      road.addColorStop(0.5, 'rgba(245,240,230,0.035)');
      road.addColorStop(1, 'rgba(245,240,230,0)');
      g.fillStyle = road;
      g.fillRect(x0, top, x1 - x0, bottom - top);
      place = (km, lane) => {
        const spread = bottom - top;
        const y = top + spread * (0.5 + (lane - 0.5) * 0.92);
        if (km >= 42.195) return [x1 + 10 + lane * (mobile ? 12 : 40), y];
        return [X(km), y];
      };
    }

    g.globalCompositeOperation = 'lighter';
    rows.forEach((row, i) => {
      const p = positionAt(row, time);
      const ci = p.finished ? 3 : Math.max(0, Math.min(6, Math.round(3 + p.rel / 0.08)));
      const [x, y] = place(p.km, lanes[i]);
      g.globalAlpha = p.finished ? 0.28 : 0.9;
      g.fillStyle = PACE_COLOURS[ci];
      g.beginPath();
      g.arc(x, y, dotR, 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    if (ghostMinutes) {
      const km = Math.min(42.195, (time / (ghostMinutes * 60)) * 42.195);
      const [x, y] = place(km, 0.5);
      g.strokeStyle = '#F4B23E';
      g.fillStyle = '#0E1116';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#F4B23E';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  }, [width, canvasHeight, box, mode, locate, edition.route, rows, time, lanes, ghostMinutes, units]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toggle = () => {
    userPaused.current = playing;
    setPlaying(!playing);
  };
  const scrub = (value: number) => {
    userPaused.current = true;
    setPlaying(false);
    timeRef.current = value;
    setTime(value);
  };

  const share = (n: number) => (rows.length ? Math.round((100 * n) / rows.length) : 0);
  const lead = units === 'mi' ? `${(stats.lead / 1.609344).toFixed(1)} mi` : `${stats.lead.toFixed(1)} km`;

  return (
    <div ref={wrap} className={`replay ${className ?? ''}`}>
      <div className="replay-hud" aria-live="off">
        <div className="replay-clock" aria-hidden="true">{clock(time)}</div>
        <dl className="replay-stats">
          <div><dt>Still running</dt><dd>{share(stats.running)}%</dd></div>
          <div><dt>Finished</dt><dd>{share(stats.finished)}%</dd></div>
          <div><dt>In a section ≥25% slower than their 5–20 km pace</dt><dd>{share(stats.slow)}%</dd></div>
          <div><dt>Leading runner on the clock</dt><dd>{stats.running ? lead : 'all home'}</dd></div>
        </dl>
      </div>
      <canvas ref={canvas} style={{ width: '100%', height: canvasHeight }} role="img" aria-label={`Animated replay of ${edition.sample.toLocaleString()} sampled finishes from ${edition.city} ${edition.year}. Use the race clock slider to step through it.`} />
      <div className="replay-controls">
        <button type="button" className="replay-play" onClick={toggle} aria-label={playing ? 'Pause replay' : 'Play replay'}>
          {playing ? (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor" /></svg>
          )}
        </button>
        <input className="replay-scrub" type="range" min={0} max={Math.ceil(lastFinish + 300)} step={10} value={Math.round(time)} onChange={(e) => scrub(Number(e.target.value))} aria-label="Race clock" aria-valuetext={clock(time)} />
        <label className="replay-speed">
          <span className="sr-only">Replay speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={240}>4 min / s</option>
            <option value={600}>10 min / s</option>
            <option value={1200}>20 min / s</option>
          </select>
        </label>
      </div>
      <div className="replay-legend" aria-hidden="true">
        <span>Current section vs own 5–20 km pace</span>
        <span className="replay-ramp">{PACE_COLOURS.map((c) => <i key={c} style={{ background: c }} />)}</span>
        <span className="replay-ramp-labels"><b>faster</b><b>same</b><b>slower</b></span>
      </div>
    </div>
  );
}
