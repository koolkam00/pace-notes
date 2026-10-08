'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DataState, DurationField, EvidencePanel, ExampleNote, ShareBar, Stat } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { loadShard, shareUnder, type ProjectorCells, type ProjectorIndex, type ProjectorShard, type ProjectorValidation } from '@/lib/tools/data';
import { MARATHON_KM, MATS_KM, perKm, perUnit } from '@/lib/tools/pace';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { formatClock, formatDuration, formatHM, parseClock, parseDuration, parseTrackerText, type MatReading } from '@/lib/tools/time';
import { checkpointLabel, compact, count } from '@/lib/viz/format';
import { KM_PER_MILE, distanceLabel, type UnitSystem } from '@/lib/units';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const INDEX_PATH = 'tools/projector.json';
const CARDS_KEY = 'pace-notes-projector-runners';
const START_KEY = 'pace-notes-projector-start';
const MAX_CARDS = 4;
const ACCENT = '#E2416B';
const ACCENT_INK = '#B3123E';
const ACCENT_SOFT = '#F4A9BB';

type Pref = 'trend' | 'all' | 'men' | 'women';
type TrendKind = 'faster' | 'similar' | 'slower';
type QueryShape = { course: string; mat: string; t: string; prev: string; target: string; v: string };

/** The example runner shown on a first visit; a cleared time is stored as t=none, so a reload or a shared link never brings it back. */
const DEFAULTS: QueryShape = { course: 'all', mat: '25', t: '2:21:30', prev: '', target: '', v: 'trend' };
/** The inputs that describe the runner. While none came from the link or was changed, the result is the example. */
const RUNNER_KEYS = ['course', 'mat', 't', 'prev'] as const;
/** Target finish range, as the pace band uses for goals. A bare "4" reads as 4 minutes, so it is flagged instead of used. */
const TARGET_MIN_S = 90 * 60;
const TARGET_MAX_S = 8 * 3600;
function targetProblemOf(seconds: number | null): string | null {
  if (seconds === null || (seconds >= TARGET_MIN_S && seconds <= TARGET_MAX_S)) return null;
  const minutes = seconds / 60;
  return Number.isInteger(minutes) && minutes >= 2 && minutes <= 8
    ? `Did you mean ${minutes}:00? Targets from 1:30 to 8:00.` : 'Targets from 1:30 to 8:00.';
}

interface CellView { b: number; n: number; ed: number; q: number[]; later: number[][]; rp: number; sd: [number, number] }
interface Trend { r: number; kind: TrendKind; lastPace: number; avgPace: number }
interface RunnerCard { id: string; label: string; course: string; mat: number; t: number; prev: number | null; start: number | null }

const PREFS: Pref[] = ['trend', 'all', 'men', 'women'];
const VARIANT_GROUP: Record<string, string> = {
  all: 'all finishes on this pace',
  men: 'finishes recorded as men on this pace',
  women: 'finishes recorded as women on this pace',
  faster: 'finishes on this pace whose last 5 km was quicker than their average so far',
  similar: 'finishes on this pace whose last 5 km matched their average so far',
  slower: 'finishes on this pace whose last 5 km was slower than their average so far',
};

/** Elapsed chip time as trackers show it. "24:53" is minutes:seconds; "2:21" is hours:minutes; three groups are h:mm:ss. */
export function parseElapsed(input: string): number | null {
  const text = input.trim();
  if (!text || text === 'none') return null;
  const two = text.match(/^(\d{1,2})[:.,](\d{2})$/);
  if (two) {
    const [a, b] = [Number(two[1]), Number(two[2])];
    if (b >= 60) return null;
    return a >= 10 ? a * 60 + b : a * 3600 + b * 60;
  }
  const seconds = parseDuration(text, 'race');
  return seconds !== null && seconds > 0 ? seconds : null;
}

/**
 * Elapsed text that parseElapsed reads back as the same number of seconds: "24:53" from 10 to 59 minutes,
 * h:mm:ss otherwise ("0:02:00", never the ambiguous "2:00"). Used for the URL and for the fields.
 */
export function elapsedText(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 600 && s < 3600 ? formatDuration(s) : formatDuration(s, true);
}

/** A start clock saved on this device is ignored after 12 hours, so a later race never inherits it. */
const START_TTL_MS = 12 * 3600 * 1000;
function readStart(): string {
  try {
    const raw = window.localStorage.getItem(START_KEY);
    if (!raw) return '';
    const saved: unknown = JSON.parse(raw);
    if (saved && typeof saved === 'object' && typeof (saved as { text?: unknown }).text === 'string'
      && typeof (saved as { at?: unknown }).at === 'number' && Date.now() - (saved as { at: number }).at < START_TTL_MS) {
      return (saved as { text: string }).text;
    }
    window.localStorage.removeItem(START_KEY);
  } catch { /* storage unavailable or an older plain value: start empty */ }
  return '';
}
function writeStart(text: string) {
  try {
    if (text.trim()) window.localStorage.setItem(START_KEY, JSON.stringify({ text, at: Date.now() }));
    else window.localStorage.removeItem(START_KEY);
  } catch { /* storage unavailable: the start clock lasts for this visit only */ }
}

/** A value that follows `value` once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const parseMat = (value: string) => ((MATS_KM as readonly number[]).includes(Number(value)) ? Number(value) : 25);
const qIndex = (Q: number[], p: number) => Q.findIndex((x) => Math.abs(x - p) < 1e-9);
const pctText = (share: number) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`);
const paceText = (secondsPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(secondsPerKm, units))}/${units}`;
const hm = (seconds: number) => formatHM(seconds);
const targetText = (seconds: number) => (seconds % 60 === 0 ? formatHM(seconds) : formatDuration(seconds, true));
const ceilMinute = (seconds: number) => Math.ceil(seconds / 60) * 60;
/** h:mm with the seconds dropped (not rounded), for the low end of a window. */
const hmFloor = (seconds: number) => { const m = Math.floor(seconds / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
/**
 * An elapsed-time window widened to whole minutes (low end down, high end up): "1:19–1:24".
 * A window that ends within the first hour reads "53–56 min", never "0:53–0:56", which could pass for minutes and seconds.
 */
const windowText = (lo: number, hi: number) => {
  const end = ceilMinute(hi);
  return end < 3600 ? `${Math.floor(lo / 60)}–${end / 60} min` : `${hmFloor(lo)}–${hmFloor(end)}`;
};
const editionsText = (k: number) => (k === 1 ? 'one edition' : `${count(k)} editions`);

/** "15.5 mi (25K)" in miles, "25 km" in kilometres. Mats are distances, never mile splits. */
function matName(km: number, units: UnitSystem): string {
  if (km >= 42.19) return 'Finish';
  return units === 'mi' ? `${checkpointLabel(km, 'mi')} (${km}K)` : `${km} km`;
}

/** "11:42–11:51 am", or "11:52 am–12:04 pm" across noon. */
function clockRange(a: number, b: number): string {
  const [fa, fb] = [formatClock(a), formatClock(b)];
  const [ta, sa] = fa.split(' ');
  const [tb, sb] = fb.split(' ');
  return sa === sb ? `${ta}–${tb} ${sb}` : `${fa}–${fb}`;
}

function trendOf(E: number, prev: number, mat: number, threshold: number): Trend | null {
  if (mat <= 5 || !(prev > 0) || prev >= E) return null;
  const lastPace = (E - prev) / 5;
  const avgPace = E / mat;
  const r = lastPace / avgPace - 1;
  return { r, lastPace, avgPace, kind: r < -threshold ? 'faster' : r > threshold ? 'slower' : 'similar' };
}

function cellAt(cells: ProjectorCells | undefined, band: number): CellView | null {
  if (!cells) return null;
  const i = cells.b.indexOf(band);
  if (i < 0) return null;
  return { b: band, n: cells.n[i], ed: cells.ed[i], q: cells.q[i], later: cells.later[i], rp: cells.rp[i], sd: cells.sd[i] };
}

function niceStep(span: number, target: number, steps: number[]): number {
  for (const s of steps) if (span / s <= target) return s;
  return steps[steps.length - 1];
}

/* ------------------------------------------------------------------ */
/* Data hooks                                                          */
/* ------------------------------------------------------------------ */

const LOAD_ERROR = 'This data could not be loaded. Check the connection and try again.';

/** The verified index. `retry` re-runs the load after a failure (loadInsight drops failed requests from its cache). */
function useProjectorIndex(sha: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ index: ProjectorIndex | null; error: string | null }>({ index: null, error: null });
  useEffect(() => {
    if (!sha) return;
    let live = true;
    setState((s) => (s.error ? { index: null, error: null } : s));
    loadInsight<ProjectorIndex>(INDEX_PATH, sha).then(
      (index) => { if (live) setState({ index, error: null }); },
      (e: unknown) => { if (live) setState({ index: null, error: e instanceof Error ? e.message : LOAD_ERROR }); },
    );
    return () => { live = false; };
  }, [sha, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return sha ? { ...state, retry } : { index: null, error: 'The projector data is not part of this build, so no projection can be shown.', retry: null };
}

function useShard(index: ProjectorIndex | null, scope: string, mat: number) {
  const path = `tools/projector/${scope}/${mat}.json`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; shard: ProjectorShard | null; error: string | null }>({ key: '', shard: null, error: null });
  const key = `${path}#${attempt}`;
  useEffect(() => {
    if (!index) return;
    let live = true;
    loadShard<ProjectorShard>(index, path).then(
      (shard) => { if (live) setState({ key, shard, error: null }); },
      (e: unknown) => { if (live) setState({ key, shard: null, error: e instanceof Error ? e.message : LOAD_ERROR }); },
    );
    return () => { live = false; };
  }, [index, path, key]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...(state.key === key ? state : { key, shard: null, error: null }), retry };
}

/** A load failure with a way to try again (race-day networks drop requests). */
function LoadError({ error, onRetry, compact: small = false }: { error: string; onRetry: (() => void) | null; compact?: boolean }) {
  return (
    <div className={`tool-state is-error projector-load-error${small ? ' is-compact' : ''}`} role="alert">
      <p>{error}</p>
      {onRetry ? <button type="button" className="button-secondary" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

function readCards(): RunnerCard[] {
  try {
    const raw = window.localStorage.getItem(CARDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is RunnerCard => !!c && typeof c === 'object'
      && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.course === 'string'
      && (MATS_KM as readonly number[]).includes(c.mat) && typeof c.t === 'number' && c.t > 0
      && (c.prev === null || typeof c.prev === 'number') && (c.start === null || typeof c.start === 'number')).slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}

function writeCards(cards: RunnerCard[]) {
  try { window.localStorage.setItem(CARDS_KEY, JSON.stringify(cards)); } catch { /* storage unavailable: cards last for this visit only */ }
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

function ElapsedField({ label, value, onChange, placeholder, hint, large = false, inputRef, error, id: given }: {
  label: ReactNode; value: number | null; onChange: (seconds: number | null) => void; placeholder?: string; hint?: ReactNode;
  large?: boolean; inputRef?: RefObject<HTMLInputElement>; error?: string | null; id?: string;
}) {
  const auto = useId();
  const id = given ?? auto;
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const [text, setText] = useState(value === null ? '' : elapsedText(value));
  const [touched, setTouched] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    // Follow outside changes (Next mat, paste, opening a card), but never rewrite text the visitor is typing.
    if (value === last.current) return;
    last.current = value;
    if (document.activeElement === ref.current) return;
    if (value === null ? text !== '' : parseElapsed(text) !== value) setText(value === null ? '' : elapsedText(value));
  }, [value, text, ref]);
  const parsed = text.trim() ? parseElapsed(text) : null;
  const invalid = touched && text.trim() !== '' && parsed === null;
  const message = invalid ? 'Try 2:05:31, 1:42 (h:mm) or 24:53 (min:sec).' : error;
  return (
    <div className={`tool-field${large ? ' is-large' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} ref={ref} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={placeholder} value={text}
        aria-invalid={invalid || !!error || undefined} aria-describedby={hint || message ? `${id}-hint` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const next = e.target.value.trim() ? parseElapsed(e.target.value) : null;
          last.current = next;
          onChange(next);
        }}
        onBlur={() => { setTouched(true); if (parsed !== null) setText(elapsedText(parsed)); }} />
      {message ? <p className="tool-field-hint is-error" id={`${id}-hint`}>{message}</p>
        : hint ? <p className="tool-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

function MatChips({ mat, units, onChange }: { mat: number; units: UnitSystem; onChange: (km: number) => void }) {
  return (
    <div className="tool-field">
      <span className="tool-label" id="projector-mat-label">Timing mat</span>
      <div className="projector-mats" role="group" aria-labelledby="projector-mat-label">
        {MATS_KM.map((km) => (
          <button key={km} type="button" aria-pressed={km === mat} onClick={() => onChange(km)}
            aria-label={units === 'mi' ? `${km} km mat, ${(km / KM_PER_MILE).toFixed(1)} miles` : `${km} km mat`}>
            <b>{units === 'mi' ? checkpointLabel(km, 'mi') : `${km}K`}</b>
            <small>{units === 'mi' ? `${km}K` : 'mat'}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function PasteBox({ onRead, units }: { onRead: (readings: MatReading[]) => void; units: UnitSystem }) {
  const [text, setText] = useState('');
  const readings = useMemo(() => parseTrackerText(text), [text]);
  const signature = readings.map((r) => `${r.km}:${r.elapsed}`).join('|');
  const applied = useRef('');
  useEffect(() => {
    if (signature && signature !== applied.current) {
      applied.current = signature;
      onRead(readings);
    }
  }, [signature, readings, onRead]);
  const latest = readings.length ? readings.reduce((a, b) => (b.km >= a.km ? b : a)) : null;
  const before = latest ? readings.find((r) => r.km === latest.km - 5) : undefined;
  return (
    <details className="projector-paste">
      <summary>Paste from the tracker</summary>
      <label htmlFor="projector-paste-text" className="sr-only">Tracker text</label>
      <textarea id="projector-paste-text" rows={4} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)}
        placeholder={'20K 1:40:10\n25K 2:05:31'} aria-describedby="projector-paste-hint" />
      <p className="tool-field-hint" id="projector-paste-hint" aria-live="polite">
        {latest
          ? <>Read {readings.length} mat{readings.length === 1 ? '' : 's'}. Using {matName(latest.km, units)} at {formatDuration(latest.elapsed, true)}{before ? <> and {matName(before.km, units)} at {formatDuration(before.elapsed, true)} for the trend</> : null}.</>
          : text.trim() ? 'No 5 km mat times found. Lines need a mat (5K to 40K) and a time, such as “25K 2:05:31”.'
            : 'Copy the splits from the official tracker and paste them here. Halfway and mile splits are ignored.'}
      </p>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

interface Marker { key: string; x: number; label: string; tone: 'ink' | 'even' | 'target' }

/** Lay marker labels out in rows so they never overlap. */
function stackLabels(markers: Marker[], width: number, margin: number) {
  const charW = 6.7;
  const rows: number[] = [];
  return [...markers].sort((a, b) => a.x - b.x).map((m) => {
    const w = m.label.length * charW;
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    let x0 = m.x - w / 2;
    if (x0 < margin) { anchor = 'start'; x0 = m.x - 2; }
    if (x0 + w > width - margin) { anchor = 'end'; x0 = m.x - w + 2; }
    let row = rows.findIndex((end) => end + 10 < x0);
    if (row < 0) { row = rows.length; rows.push(x0 + w); } else rows[row] = x0 + w;
    return { ...m, anchor, row };
  });
}

function FinishChart({ q, Q, P, target, targetTag }: { q: number[]; Q: number[]; P: number; target: number | null; targetTag: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
  const lo0 = Math.min(q[0], P, target ?? Infinity);
  const hi0 = Math.max(q[q.length - 1], P, target ?? -Infinity);
  const pad = Math.max(hi0 - lo0, 900) * 0.06;
  const [lo, hi] = [lo0 - pad, hi0 + pad];
  const m = { l: 8, r: 8 };
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const fmt = narrow ? hm : (s: number) => formatDuration(s, true);
  const markers = stackLabels([
    { key: 'median', x: x(q[i50]), label: `Median ${fmt(q[i50])}`, tone: 'ink' as const },
    { key: 'even', x: x(P), label: `${narrow ? 'Even' : 'Even pace'} ${fmt(P)}`, tone: 'even' as const },
    ...(target !== null ? [{ key: 'target', x: x(target), label: `${narrow ? '' : 'Target '}${targetText(target)}${targetTag ? ` · ${targetTag}` : ''}`, tone: 'target' as const }] : []),
  ], width, m.l);
  const rows = Math.max(1, ...markers.map((mk) => mk.row + 1));
  const top = 6 + rows * 16;
  const plotH = narrow ? 84 : 104;
  const base = top + plotH;
  const H = base + 34;
  const densities = q.slice(0, -1).map((v, i) => 0.05 / Math.max(1, q[i + 1] - v));
  const maxD = Math.max(...densities);
  const step = niceStep(hi - lo, narrow ? 4 : 8, [60, 120, 300, 600, 900, 1800, 3600, 7200]);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const label = `Finish times of these finishes: 10th percentile ${formatDuration(q[i10], true)}, median ${formatDuration(q[i50], true)}, 90th percentile ${formatDuration(q[i90], true)}. The even-pace projection is ${formatDuration(P, true)}${target !== null && targetTag ? `; target ${targetText(target)}: ${targetTag}` : ''}.`;
  return (
    <div ref={ref} className="viz projector-chart">
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={x(t)} x2={x(t)} y1={top - 2} y2={base} />
            <text x={x(t)} y={base + 24} textAnchor="middle">{hm(t)}</text>
          </g>
        ))}
        {densities.map((d, i) => {
          const h = (d / maxD) * (plotH - 6);
          const middle = i >= qIndex(Q, 0.25) && i < qIndex(Q, 0.75);
          return <rect key={i} x={x(q[i])} width={Math.max(0.5, x(q[i + 1]) - x(q[i]))} y={base - h} height={h} fill={middle ? ACCENT : ACCENT_SOFT} stroke="var(--card)" strokeWidth={0.75} />;
        })}
        <line x1={m.l} x2={width - m.r} y1={base} y2={base} stroke="var(--ink-3)" />
        <g className="projector-whisker">
          <line x1={x(q[i10])} x2={x(q[i90])} y1={base + 5} y2={base + 5} />
          <line x1={x(q[i10])} x2={x(q[i10])} y1={base + 2} y2={base + 8} />
          <line x1={x(q[i90])} x2={x(q[i90])} y1={base + 2} y2={base + 8} />
        </g>
        {markers.map((mk) => (
          <line key={mk.key} x1={mk.x} x2={mk.x} y1={12 + mk.row * 16 + 4} y2={base} stroke={mk.tone === 'target' ? ACCENT_INK : 'var(--ink)'}
            strokeWidth={mk.tone === 'ink' ? 2 : 1.5} strokeDasharray={mk.tone === 'even' ? '4 3' : undefined} />
        ))}
        {markers.map((mk) => {
          const w = mk.label.length * 6.7 + 6;
          const left = mk.anchor === 'start' ? mk.x - 3 : mk.anchor === 'end' ? mk.x - w + 3 : mk.x - w / 2;
          return (
            <g key={mk.key}>
              <rect x={left} y={12 + mk.row * 16 - 11} width={w} height={15} fill="var(--card)" />
              <text x={mk.x} y={12 + mk.row * 16} textAnchor={mk.anchor} className="projector-marker"
                style={{ fill: mk.tone === 'target' ? ACCENT_INK : 'var(--ink)' }}>{mk.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * What a constant-pace tracker would have shown for these finishes at each later mat: the percentiles of
 * elapsed × 42.195 ÷ distance (a fixed scaling, so percentiles carry over exactly), ending at their actual finish times.
 * The visitor's own points and the constant-pace line are drawn as a separate series, calculated from their inputs.
 */
function ProjectionChart({ E, mat, prev, cell, Q, P, bandS, units }: { E: number; mat: number; prev: number | null; cell: CellView; Q: number[]; P: number; bandS: number; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
  const points = [
    { km: mat, p10: cell.b, p50: cell.b + bandS / 2, p90: cell.b + bandS },
    ...cell.later.map((v, j) => { const km = mat + 5 * (j + 1); const f = MARATHON_KM / km; return { km, p10: v[0] * f, p50: v[1] * f, p90: v[2] * f }; }),
    { km: MARATHON_KM, p10: cell.q[i10], p50: cell.q[i50], p90: cell.q[i90] },
  ];
  const own = [...(prev !== null && mat > 5 ? [{ km: mat - 5, v: (prev * MARATHON_KM) / (mat - 5) }] : []), { km: mat, v: P }];
  const minV = Math.min(...points.map((p) => p.p10), ...own.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.p90), ...own.map((p) => p.v));
  const pad = Math.max(120, (maxV - minV) * 0.08);
  const [lo, hi] = [minV - pad, maxV + pad];
  const step = niceStep(hi - lo, narrow ? 4 : 6, [60, 120, 300, 600, 900, 1800, 3600]);
  const H = narrow ? 250 : 290;
  const m = { l: 46, r: 12, t: 26, b: 40 };
  const x0 = Math.max(0, own[0].km - 2.5);
  const x = (km: number) => m.l + ((km - x0) / (MARATHON_KM - x0)) * (width - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const band = `M${points.map((p) => `${x(p.km)},${y(p.p10)}`).join('L')}L${[...points].reverse().map((p) => `${x(p.km)},${y(p.p90)}`).join('L')}Z`;
  // The band starts at this mat's exact pace band; the median is only known from the next mat on.
  const median = points.length > 2 ? `M${points.slice(1).map((p) => `${x(p.km)},${y(p.p50)}`).join('L')}` : '';
  const fin = points[points.length - 1];
  // Mat ticks from 40 km backwards, so the last mat is always labelled; "Finish" drops to a second line when it is close.
  let lastLabel = Infinity;
  const xLabels = [...MATS_KM].reverse().filter((km) => km >= x0).filter((km) => {
    if (lastLabel - x(km) < 30) return false;
    lastLabel = x(km);
    return true;
  });
  const finishLow = x(MARATHON_KM) - x(40) < 58;
  const fmt = narrow ? hm : (s: number) => formatDuration(s, true);
  const finLabels = [
    { key: 'p90', v: fin.p90, text: `90th ${fmt(fin.p90)}`, dy: -7 },
    { key: 'p50', v: fin.p50, text: `Median ${fmt(fin.p50)}`, dy: -9 },
    { key: 'p10', v: fin.p10, text: `10th ${fmt(fin.p10)}`, dy: 15 },
  ];
  const showRange = y(fin.p10) - y(fin.p50) > 26 && y(fin.p50) - y(fin.p90) > 16;
  // Keep the "Now" label clear of the top edge and of the median label at the finish.
  const nowText = `Now ${formatDuration(P, true)}`.length * 7;
  const nowRight = x(mat) > width * 0.72 ? x(mat) : x(mat) + nowText / 2;
  const medianLeft = x(MARATHON_KM) - 8 - (`Median ${fmt(fin.p50)}`.length * 7);
  const nowBelow = y(P) - m.t < 30 || (nowRight > medianLeft && Math.abs((y(P) - 11) - (y(fin.p50) - 9)) < 16);
  // End the constant-pace line before the finish labels when it would run through one of them.
  const shownLabels = finLabels.filter((l) => l.key === 'p50' || showRange);
  const crossed = shownLabels.filter((l) => { const base = y(l.v) + l.dy; return y(P) > base - 16 && y(P) < base + 6; });
  const evenEnd = crossed.length
    ? Math.max(x(mat), Math.min(...crossed.map((l) => x(MARATHON_KM) - 8 - l.text.length * 7)) - 6)
    : x(MARATHON_KM);
  const label = `For these finishes, the even-pace finish a constant-pace tracker would have shown went from ${hm(cell.b)}–${hm(cell.b + bandS)} at ${matName(mat, units)} to a median of ${formatDuration(cell.q[i50], true)} at the finish, with the 10th to 90th percentile from ${formatDuration(fin.p10, true)} to ${formatDuration(fin.p90, true)}. Held at a constant pace, the times entered give ${formatDuration(P, true)}.`;
  return (
    <figure className="projector-figure">
      <figcaption className="projector-chart-title">What a constant-pace tracker would have shown for these finishes</figcaption>
      <ul className="projector-key" aria-hidden="true">
        <li><i className="is-band" />10th–90th percentile</li>
        <li><i className="is-median" />Median</li>
        <li><i className="is-own" />Times entered</li>
        <li><i className="is-even" />Constant pace from now</li>
      </ul>
      <div ref={ref} className="viz projector-chart">
        <svg width={width} height={H} role="img" aria-label={label}>
          {ticks.map((v) => (
            <g key={v} className="grid">
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{hm(v)}</text>
            </g>
          ))}
          {xLabels.map((km) => (
            <g key={km}>
              <line x1={x(km)} x2={x(km)} y1={H - m.b} y2={H - m.b + 4} stroke="var(--line-2)" />
              <text x={x(km)} y={H - m.b + 17} textAnchor="middle">{units === 'mi' ? (km / KM_PER_MILE).toFixed(1) : km}</text>
            </g>
          ))}
          <line x1={x(MARATHON_KM)} x2={x(MARATHON_KM)} y1={H - m.b} y2={H - m.b + 4} stroke="var(--line-2)" />
          <text x={x(MARATHON_KM) + 2} y={H - m.b + (finishLow ? 31 : 17)} textAnchor="end">Finish</text>
          <text x={m.l - 40} y={12} className="axis-label">Finish time at the pace so far</text>
          <text x={m.l} y={H - 6} className="axis-label">{units === 'mi' ? 'miles' : 'km'}</text>
          <path d={band} fill={ACCENT} fillOpacity={0.17} />
          <line x1={x(mat)} x2={evenEnd} y1={y(P)} y2={y(P)} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="5 4" />
          {median ? <path d={median} fill="none" stroke={ACCENT_INK} strokeWidth={2.5} strokeLinejoin="round" /> : null}
          {points.slice(1).map((p) => <circle key={p.km} cx={x(p.km)} cy={y(p.p50)} r={3.2} fill={ACCENT_INK} />)}
          {own.length > 1 ? <line x1={x(own[0].km)} x2={x(own[1].km)} y1={y(own[0].v)} y2={y(own[1].v)} stroke="var(--ink)" strokeWidth={2} /> : null}
          {own.map((p, i) => <circle key={p.km} cx={x(p.km)} cy={y(p.v)} r={i === own.length - 1 ? 5.5 : 4} fill={i === own.length - 1 ? 'var(--ink)' : 'var(--card)'} stroke={i === own.length - 1 ? 'var(--card)' : 'var(--ink)'} strokeWidth={2} />)}
          <text x={x(mat) + (x(mat) < m.l + 60 ? -6 : 0)} y={y(P) + (nowBelow ? 22 : -11)} textAnchor={x(mat) > width * 0.72 ? 'end' : x(mat) < m.l + 60 ? 'start' : 'middle'} className="annotation projector-halo">Now {formatDuration(P, true)}</text>
          {shownLabels.map((l) => (
            <text key={l.key} x={x(MARATHON_KM) - 8} y={y(l.v) + l.dy} textAnchor="end"
              className={`projector-halo ${l.key === 'p50' ? 'annotation projector-median-label' : 'annotation-sub'}`}>{l.text}</text>
          ))}
        </svg>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Runner cards (spectator mode)                                       */
/* ------------------------------------------------------------------ */

function RunnerCardView({ card, index, units, onUpdate, onRemove, onOpen }: {
  card: RunnerCard; index: ProjectorIndex; units: UnitSystem;
  onUpdate: (card: RunnerCard) => void; onRemove: () => void; onOpen: () => void;
}) {
  const scope = index.scopes.find((s) => s.slug === card.course) ?? index.scopes[0];
  const { shard, error, retry } = useShard(index, scope.slug, card.mat);
  const [next, setNext] = useState<number | null>(null);
  const P = (card.t * MARATHON_KM) / card.mat;
  const band = Math.floor(P / index.band_s) * index.band_s;
  const trend = card.prev !== null ? trendOf(card.t, card.prev, card.mat, index.trend_threshold) : null;
  let cell: CellView | null = null;
  let pacedOnly = false;
  if (shard) {
    cell = cellAt(shard.cells[trend?.kind ?? 'all'], band);
    if (!cell && trend) { cell = cellAt(shard.cells.all, band); pacedOnly = !!cell; }
  }
  const Q = index.quantiles;
  const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
  const rows = cell ? [
    ...cell.later.slice(0, 2).map((v, j) => ({ km: card.mat + 5 * (j + 1), lo: v[0], mid: v[1], hi: v[2] })),
    { km: MARATHON_KM, lo: cell.q[i10], mid: cell.q[i50], hi: cell.q[i90] },
  ] : [];
  const nextKm = card.mat + 5;
  const cardWindow = (lo: number, hi: number) => (card.start !== null ? clockRange(card.start + lo, ceilMinute(card.start + hi)) : windowText(lo, hi));
  const name = card.label || 'Runner';
  return (
    <li className="projector-card">
      <div className="projector-card-head">
        <h3 title={name}>{name}</h3>
        <button type="button" className="projector-card-remove" onClick={onRemove} aria-label={`Remove ${card.label || 'runner'} card`}>×</button>
      </div>
      <p className="projector-card-sub">{scope.city ?? 'All courses'} · {matName(card.mat, units)} in {formatDuration(card.t, true)}{card.start !== null ? ` · started ${formatClock(card.start)}` : ''}</p>
      {error ? <LoadError error={error} onRetry={retry} compact /> : !shard ? <p className="tool-state">Loading…</p> : !cell ? (
        <p className="projector-card-empty">Fewer than 100 finishes on this pace at this mat{scope.slug !== 'all' ? ` in ${scope.city}` : ''}. Open it to see other options.</p>
      ) : (
        <div className="projector-card-scroll">
          <table className="projector-card-table">
            <caption className="sr-only">{card.start !== null ? 'Clock-time' : 'Elapsed-time'} windows (10th to 90th percentile) and medians for the next mats</caption>
            <thead><tr><th scope="col">Mat</th><th scope="col">{card.start !== null ? 'Clock window' : 'Window'}</th><th scope="col">Median</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.km} className={r.km > 42 ? 'is-finish' : undefined}>
                  <th scope="row">{r.km > 42 ? 'Finish' : units === 'mi' ? <>{checkpointLabel(r.km, 'mi')} <small>{r.km}K</small></> : `${r.km} km`}</th>
                  <td>{breakable(cardWindow(r.lo, r.hi))}</td>
                  <td>{breakable(card.start !== null ? formatClock(card.start + r.mid) : formatDuration(r.mid, true))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pacedOnly ? <p className="projector-card-note">Matched on pace only: too few finishes with this trend.</p> : null}
      <div className="projector-card-actions">
        {card.mat < 40 ? (
          <div className="projector-card-update">
            <ElapsedField label={`Time at ${matName(nextKm, units)}`} value={next} onChange={setNext} placeholder="h:mm:ss" />
            <button type="button" className="button-secondary" disabled={next === null || next <= card.t}
              onClick={() => { if (next !== null && next > card.t) { onUpdate({ ...card, prev: card.t, t: next, mat: nextKm }); setNext(null); } }}>Update</button>
          </div>
        ) : <p className="projector-card-note">Past the last mat. The finish window above is the final one.</p>}
        <button type="button" className="projector-link-button" onClick={onOpen}>Open in the projector</button>
      </div>
    </li>
  );
}

/** Keeps "11:42 am" together and allows a line break only after the dash of a window. */
function breakable(text: string): ReactNode {
  const parts = text.replace(/ /g, '\u00a0').split('–');
  return parts.map((part, i) => (i === 0 ? part : <span key={i}>–<wbr />{part}</span>));
}

/* ------------------------------------------------------------------ */
/* The tool                                                            */
/* ------------------------------------------------------------------ */

export default function Projector({ indexSha }: { indexSha: string | null }) {
  const { units } = useUnits();
  const [q, setQ, ready, fromUrl] = useQueryState<QueryShape>(DEFAULTS);
  const { index, error: indexError, retry: retryIndex } = useProjectorIndex(indexSha);
  const timeRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const mat = parseMat(q.mat);
  const E = parseElapsed(q.t);
  const prevRaw = mat > 5 ? parseElapsed(q.prev) : null;
  const targetRaw = q.target && q.target !== 'none' ? parseDuration(q.target, 'race') : null;
  // A target outside 1:30–8:00 (often a bare "4", read as 4 minutes) stays in the field, flagged, and is not used.
  const targetProblem = targetProblemOf(targetRaw);
  const target = targetProblem ? null : targetRaw;
  // Flag it only once typing has paused, so "3" on the way to "3:30" does not flash an error; a fix clears it at once.
  const settledTargetProblem = useSettled(targetProblem, 700);
  const targetError = targetProblem !== null && targetProblem === settledTargetProblem ? targetProblem : null;
  const pref = (PREFS as string[]).includes(q.v) ? (q.v as Pref) : 'trend';
  const scopeInfo = index ? index.scopes.find((s) => s.slug === q.course) ?? index.scopes.find((s) => s.slug === 'all') ?? index.scopes[0] : null;
  const scope = scopeInfo?.slug ?? (q.course || 'all');
  const scopeName = scopeInfo ? scopeInfo.city ?? 'All courses' : 'All courses';
  const shardState = useShard(index, scope, mat);
  const shard = shardState.shard;

  // Rewrite a link's unknown mat, course or comparison, and unreadable times, to what the page actually shows.
  const [courseNotice, setCourseNotice] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const patch: Partial<QueryShape> = {};
    if (q.mat !== String(mat)) patch.mat = String(mat);
    if (!(PREFS as string[]).includes(q.v)) patch.v = 'trend';
    if (q.t !== 'none' && parseElapsed(q.t) === null) patch.t = 'none';
    if (q.prev && parseElapsed(q.prev) === null) patch.prev = '';
    if (q.target && (q.target === 'none' || parseDuration(q.target, 'race') === null)) patch.target = '';
    if (scopeInfo && q.course !== scopeInfo.slug) {
      patch.course = scopeInfo.slug;
      // Say so when a link named a course the projector does not publish, instead of switching silently.
      if (q.course) setCourseNotice(true);
    }
    if (Object.keys(patch).length) setQ(patch);
  }, [ready, q, mat, scopeInfo, setQ]);

  // The example runner is labelled until the visitor enters or links a runner of their own.
  const [ownRunner, setOwnRunner] = useState(false);
  useEffect(() => {
    if (ready && RUNNER_KEYS.some((k) => q[k] !== DEFAULTS[k])) setOwnRunner(true);
  }, [ready, q]);
  const isExample = ready && !ownRunner && !RUNNER_KEYS.some((k) => fromUrl.has(k));

  // Entry by elapsed time (default) or by the average pace the tracker shows.
  const [entry, setEntry] = useState<'time' | 'pace'>('time');
  const [paceTyped, setPaceTyped] = useState<number | null>(null);
  const paceUnits = useRef<UnitSystem>(units);
  useEffect(() => {
    if (entry === 'pace' && paceUnits.current !== units) {
      paceUnits.current = units;
      setPaceTyped(E !== null ? Math.round(perUnit(E / mat, units)) : null);
    }
  }, [units, entry, E, mat]);

  // A notice that states a change the visitor asked for from an unavailable state ("Showing All courses…").
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  const keyOf = (s: QueryShape) => `${s.course}|${s.mat}|${s.t}|${s.prev}|${s.v}`;

  // Spectator state, kept in this browser only.
  const [startText, setStartText] = useState('');
  const [cards, setCards] = useState<RunnerCard[]>([]);
  const [cardLabel, setCardLabel] = useState('');
  const [clockView, setClockView] = useState<'clock' | 'elapsed'>('clock');
  useEffect(() => {
    setStartText(readStart());
    setCards(readCards());
  }, []);
  const saveStart = (text: string) => { setStartText(text); writeStart(text); };
  const start = startText.trim() ? parseClock(startText) : null;
  const updateCards = (next: RunnerCard[]) => { setCards(next); writeCards(next); };

  // Derived projection.
  const prevError = prevRaw !== null && E !== null && prevRaw >= E ? `The ${matName(mat - 5, units)} time must be earlier than the ${matName(mat, units)} time.` : null;
  const prev = prevError ? null : prevRaw;
  const trend = index && E !== null && prev !== null ? trendOf(E, prev, mat, index.trend_threshold) : null;
  let variant = 'all';
  let variantNote: string | null = null;
  if (pref === 'men' || pref === 'women') {
    variant = pref;
    if (prev !== null) variantNote = 'Trend is not combined with gender.';
  } else if (pref === 'trend') {
    if (trend) variant = trend.kind;
    else if (mat === 5) variantNote = `Trend starts at the ${matName(10, units)} mat.`;
    else if (prev === null) variantNote = `Add the ${matName(mat - 5, units)} time to match the trend too.`;
  }
  const P = E !== null ? (E * MARATHON_KM) / mat : null;
  const bandS = index?.band_s ?? 120;
  const band = P !== null ? Math.floor(P / bandS) * bandS : null;
  const cell = shard && band !== null ? cellAt(shard.cells[variant], band) : null;
  const Q = index?.quantiles ?? [];
  // A target the elapsed time has already passed has no share to show.
  const passed = target !== null && E !== null && target <= E;
  const share = cell && target !== null && !passed ? shareUnder(target, cell.q, Q) : null;
  const shareValue = share ? (share.bound === 'below' ? '≤5%' : share.bound === 'above' ? '>95%' : null) : null;
  const targetTag = share ? `${shareValue ?? `about ${pctText(share.share)}`} under` : null;
  const validation = index ? pickValidation(index.validation, mat, variant) : null;
  const showClock = start !== null && clockView === 'clock';
  // Windows are widened to whole minutes: the low end rounded down, the high end up.
  const span = (a: number, b: number) => (showClock ? clockRange(start! + a, ceilMinute(start! + b)) : windowText(a, b));
  const at = (elapsed: number) => (showClock ? formatClock(start! + elapsed) : formatDuration(elapsed, true));

  const chooseMat = (km: number) => {
    const patch: Partial<QueryShape> = { mat: String(km), prev: '' };
    if (entry === 'pace' && paceTyped !== null) patch.t = elapsedText(perKm(paceTyped, units) * km);
    setQ(patch);
  };
  const advance = () => {
    if (E === null || mat >= 40) return;
    setEntry('time');
    setQ({ mat: String(mat + 5), prev: elapsedText(E), t: 'none' });
    window.setTimeout(() => timeRef.current?.focus(), 0);
  };
  const onPaste = useCallback((readings: MatReading[]) => {
    const latest = readings.reduce((a, b) => (b.km >= a.km ? b : a));
    const before = readings.find((r) => r.km === latest.km - 5);
    setEntry('time');
    setQ({ mat: String(latest.km), t: elapsedText(latest.elapsed), prev: before ? elapsedText(before.elapsed) : '' });
  }, [setQ]);
  const applyFallback = (patch: Partial<QueryShape>, text: string) => {
    setNotice({ key: keyOf({ ...q, ...patch }), text });
    setQ(patch);
  };
  const openCard = (card: RunnerCard) => {
    setEntry('time');
    setQ({ course: card.course, mat: String(card.mat), t: elapsedText(card.t), prev: card.prev !== null ? elapsedText(card.prev) : '', v: 'trend' });
    // The card's own start clock, or none: never another runner's or an earlier race's.
    saveStart(card.start !== null ? formatClock(card.start) : '');
    workspaceRef.current?.scrollIntoView({ block: 'start' });
  };
  const saveCard = () => {
    if (E === null || cards.length >= MAX_CARDS) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    updateCards([...cards, { id, label: cardLabel.trim().slice(0, 40), course: scope, mat, t: E, prev, start }]);
    setCardLabel('');
  };
  const toResult = () => document.getElementById('projector-result')?.scrollIntoView({ block: 'start' });

  const prefOptions: { value: Pref; label: string }[] = [
    { value: 'trend', label: 'Pace + trend' }, { value: 'all', label: 'Pace only' },
    ...(scope === 'all' ? [{ value: 'women' as Pref, label: 'Women' }, { value: 'men' as Pref, label: 'Men' }] : []),
  ];

  /* ---------- Results ---------- */
  let results: ReactNode;
  // One short summary for screen readers (announced once typing settles) and, on phones, under the time field.
  let status = '';
  let quick: ReactNode = null;
  const loadError = indexError ?? (index && E !== null ? shardState.error : null);
  if (loadError) {
    results = <LoadError error={loadError} onRetry={indexError ? retryIndex : shardState.retry} />;
    status = loadError;
    quick = <p className="projector-quick-text is-error">{loadError}</p>;
  } else if (!index || !scopeInfo) {
    results = <p className="tool-state">Loading the data…</p>;
  } else if (E === null || P === null || band === null) {
    results = <p className="tool-empty">Enter the elapsed time at {matName(mat, units)} from the tracker, or paste the tracker’s splits, to see where similar finishes ended{target !== null ? ` and how many were under ${targetText(target)}` : ''}.</p>;
    status = `Enter the elapsed time at ${matName(mat, units)}.`;
  } else if (!shard) {
    results = <p className="tool-state">Loading the data…</p>;
    quick = <p className="projector-quick-text">Loading…</p>;
  } else if (!cell) {
    const range = scopeInfo.mats[String(mat)]?.bands ?? null;
    const outside = !range || band < range[0] || band > range[1];
    const genderOnCourse = (variant === 'men' || variant === 'women') && scope !== 'all';
    const options: { label: string; patch: Partial<QueryShape>; note: string }[] = [];
    if (variant !== 'all' && cellAt(shard.cells.all, band)) {
      options.push(variant === 'men' || variant === 'women'
        ? { label: `Use all ${scopeName} finishes`, patch: { v: 'all' }, note: 'Gender removed: recorded-gender groups exist for All courses only.' }
        : { label: 'Remove trend', patch: { v: 'all' }, note: `Trend removed: fewer than 100 ${scopeName} finishes on this pace at ${matName(mat, units)} had a ${variant} last 5 km.` });
    }
    if (scope !== 'all') {
      const all = index.scopes.find((s) => s.slug === 'all')?.mats[String(mat)]?.bands;
      if (all && band >= all[0] && band <= all[1]) {
        options.push({ label: 'Show All courses', patch: { course: 'all' },
          note: genderOnCourse ? 'Showing All courses: recorded-gender groups exist for All courses only.' : `Showing All courses: ${scopeName} has fewer than 100 finishes in this group.` });
      }
    }
    const heading = genderOnCourse ? 'Recorded-gender groups exist for All courses only.'
      : outside ? `${hm(band)}–${hm(band + bandS)} even pace at ${matName(mat, units)} is outside the published range${scopeName === 'All courses' ? '' : ` for ${scopeName}`}.`
        : `Fewer than 100 ${scopeName === 'All courses' ? '' : `${scopeName} `}finishes match this pace${variant === 'all' ? '' : ' and group'} at ${matName(mat, units)}.`;
    status = `No published group. ${heading}`;
    quick = (
      <>
        <p className="projector-quick-text"><b>No published group</b> for this time and comparison.</p>
        <button type="button" className="projector-link-button" onClick={toResult}>See the options ↓</button>
      </>
    );
    results = (
      <div className="projector-unavailable">
        <p className="eyebrow">No published group</p>
        <h2>{heading}</h2>
        <p>{outside && range && !genderOnCourse ? `Published groups here run from ${hm(range[0])} to ${hm(range[1] + bandS)} even pace. ` : ''}
          {genderOnCourse ? '' : 'Pace Notes never shows a group with fewer than 100 finishes. '}
          {options.length ? 'You can widen the comparison:' : 'Check the time and the mat.'}</p>
        {options.length ? <div className="tool-share">{options.map((o) => <button key={o.label} type="button" className="button-secondary" onClick={() => applyFallback(o.patch, o.note)}>{o.label}</button>)}</div> : null}
      </div>
    );
  } else {
    const i10 = qIndex(Q, 0.1); const i25 = qIndex(Q, 0.25); const i50 = qIndex(Q, 0.5); const i75 = qIndex(Q, 0.75); const i90 = qIndex(Q, 0.9);
    const remainingKm = MARATHON_KM - mat;
    const remainingText = units === 'mi' ? `${(remainingKm / KM_PER_MILE).toFixed(1)} mi` : `${remainingKm.toFixed(1)} km`;
    const needed = target !== null && target > E ? (target - E) / remainingKm : null;
    const shareText = share ? (share.bound === 'below' ? '5% or fewer' : share.bound === 'above' ? 'more than 95%' : `about ${pctText(share.share)}`) : null;
    const laterRows = [
      ...cell.later.map((v, j) => ({ km: mat + 5 * (j + 1), lo: v[0], mid: v[1], hi: v[2] })),
      { km: MARATHON_KM, lo: cell.q[i10], mid: cell.q[i50], hi: cell.q[i90] },
    ];
    const activeNotice = notice && notice.key === keyOf(q) ? notice.text : null;
    const trendUsed = variant === 'faster' || variant === 'similar' || variant === 'slower';
    const bandText = `${hm(cell.b)}–${hm(cell.b + bandS)}`;
    const rangeText = windowText(cell.q[i10], cell.q[i90]);
    const nextRow = laterRows[0];
    status = `${isExample ? `Example: ${formatDuration(E, true)} at ${matName(mat, units)}. ` : ''}${scopeName} at ${matName(mat, units)}: on ${bandText} even pace, ${count(cell.n)} finishes. Median finish ${formatDuration(cell.q[i50], true)}; 10th to 90th percentile ${rangeText.replace('–', ' to ')}.`
      + (nextRow.km < 42 ? ` ${matName(nextRow.km, units)}: ${span(nextRow.lo, nextRow.hi).replace('–', ' to ')}.` : '');
    quick = (
      <>
        {isExample ? <p className="projector-quick-text">Example time. Type your runner’s tracker time above.</p> : null}
        <p className="projector-quick-text"><b>On {bandText} even pace.</b> Median finish {formatDuration(cell.q[i50], true)}, 10th–90th {rangeText}.</p>
        {nextRow.km < 42 ? <p className="projector-quick-text">{matName(nextRow.km, units)}: <b>{span(nextRow.lo, nextRow.hi)}</b></p> : null}
        <button type="button" className="projector-link-button" onClick={toResult}>Full result ↓</button>
      </>
    );
    results = (
      <>
        {isExample ? (
          <ExampleNote>Example: {formatDuration(E, true)} at {matName(mat, units)} on {scopeName}. Type your runner’s tracker time; everything updates as you type.</ExampleNote>
        ) : null}
        <div className="tool-headline projector-headline">
          <div className="projector-head">
            <span className="evidence-badge evidence-data">Pace Notes data</span>
            <p className="projector-kicker">{scopeName} · at {matName(mat, units)}</p>
            <p className="projector-band">On {bandText} even pace</p>
            <p className="projector-group">{count(cell.n)} finishes from {editionsText(cell.ed)}: {VARIANT_GROUP[variant]}.{variantNote ? ` ${variantNote}` : ''}</p>
            <p className="print-only projector-entered">
              Entered: {formatDuration(E, true)} at {matName(mat, units)}{prev !== null ? `, ${formatDuration(prev, true)} at ${matName(mat - 5, units)}` : ''}{start !== null ? `, start ${formatClock(start)}` : ''}{target !== null ? `, target ${targetText(target)}` : ''}.
            </p>
            {activeNotice ? <p className="projector-notice">{activeNotice}</p> : null}
          </div>
          <Stat label="Median finish" value={formatDuration(cell.q[i50], true)}
            sub={start !== null ? `about ${formatClock(start + cell.q[i50])} on the clock` : `middle half ${windowText(cell.q[i25], cell.q[i75])}`} />
          <Stat label="10th–90th" value={rangeText}
            sub={start !== null ? clockRange(start + cell.q[i10], ceilMinute(start + cell.q[i90])) : '80% of these finishes'} />
          {target !== null && passed ? (
            <Stat label={`Target ${targetText(target)}`} value="Passed" sub="the time at this mat is already past it" />
          ) : target !== null && share ? (
            <Stat label={`Under ${targetText(target)}`} value={shareValue ?? <><span className="projector-about">about </span>{pctText(share.share)}</>}
              sub="observed share of these complete finishes, not a probability" />
          ) : (
            <Stat label="Sustained slowdown" value={pctText(cell.sd[0] + cell.sd[1])} sub="observed share of these complete finishes" />
          )}
          {validation ? <AccuracyLine v={validation} mat={mat} units={units} trendUsed={trendUsed} variant={variant} scope={scope} /> : null}
        </div>

        <EvidencePanel kind="data" title="Where these finishes ended" meta={`Finish times of the ${count(cell.n)} finishes in this group. Each bar holds 5% of them; the darker bars are the middle half, and the outer 5% on each side is not drawn. The bracket under the bars marks the 10th–90th percentile. The dashed line is the even-pace finish calculated from the time entered, for reference.`}>
          <FinishChart q={cell.q} Q={Q} P={P} target={passed ? null : target} targetTag={targetTag} />
          <dl className="projector-quantiles">
            {[['10th', i10], ['25th', i25], ['Median', i50], ['75th', i75], ['90th', i90]].map(([name, i]) => (
              <div key={name as string} className={name === 'Median' ? 'is-median' : undefined}>
                <dt>{name}</dt>
                <dd>{formatDuration(cell.q[i as number], true)}</dd>
                {start !== null ? <dd className="projector-clock">{formatClock(start + cell.q[i as number])}</dd> : null}
              </div>
            ))}
          </dl>
          {target !== null && passed ? (
            <p className="tool-note"><strong>The time entered is already past {targetText(target)}</strong>, so no share under it is shown.</p>
          ) : target !== null && shareText ? (
            <p className="tool-note"><strong>{shareText[0].toUpperCase() + shareText.slice(1)} of these finishes were under {targetText(target)}.</strong> That is an observed share of complete finishes, interpolated between percentiles, not anyone’s chance: runners who stopped are not in the data.</p>
          ) : null}
        </EvidencePanel>

        <EvidencePanel kind="data" title={showClock ? 'When to look up at the next mats' : 'The rest of the race, mat by mat'}
          meta="When the same finishes reached each later mat. Nothing is interpolated between mats: spectators should pick the mat nearest their spot.">
          <ProjectionChart E={E} mat={mat} prev={prev} cell={cell} Q={Q} P={P} bandS={bandS} units={units} />
          <div className="projector-clock-controls no-print">
            <div className="tool-field projector-start">
              <label htmlFor="projector-start">Start-line crossing time <span className="projector-optional">optional</span></label>
              <input id="projector-start" inputMode="text" autoComplete="off" placeholder="9:14 am" value={startText}
                aria-invalid={startText.trim() !== '' && start === null ? true : undefined} aria-describedby="projector-start-hint"
                onChange={(e) => saveStart(e.target.value)} />
              <p className="tool-field-hint" id="projector-start-hint">
                {startText.trim() !== '' && start === null ? 'Try 9:14 am or 09:14.' : 'When the runner crossed the start, for clock times. Stays on this device for 12 hours.'}
              </p>
            </div>
            {start !== null ? <Choice label="Show times as" small value={clockView} onChange={setClockView} options={[{ value: 'clock', label: 'Clock' }, { value: 'elapsed', label: 'Elapsed' }]} /> : null}
          </div>
          <div className="tool-table-wrap">
            <table className="tool-table projector-table">
              <thead>
                <tr>
                  <th scope="col">Mat</th>
                  <th scope="col">{showClock ? 'Clock window' : 'Window'}<span className="projector-th-sub"> 10th–90th</span></th>
                  <th scope="col">Median</th>
                </tr>
              </thead>
              <tbody>
                {laterRows.map((r) => (
                  <tr key={r.km} className={r.km > 42 ? 'is-finish' : undefined}>
                    <th scope="row">{matName(r.km, units)}</th>
                    <td>{span(r.lo, r.hi)}</td>
                    <td><span className="projector-cell-label">median </span>{at(r.mid)}</td>
                  </tr>
                ))}
              </tbody>
              <caption>
                {showClock ? 'Observed elapsed times of these finishes plus the start time you entered.' : 'Observed elapsed times of these finishes.'} Windows run from the 10th to the 90th percentile, widened to whole minutes, so about one in five arrived outside them. These are past finishes, not live tracking; runners who stopped are not included.
              </caption>
            </table>
          </div>
          <div className="projector-save no-print">
            <p className="projector-save-title">Following someone on race day?</p>
            {cards.length >= MAX_CARDS ? <p className="tool-field-hint">Four runner cards are saved. Remove one to add another.</p> : (
              <div className="projector-save-row">
                <label htmlFor="projector-card-label" className="sr-only">Card label</label>
                <input id="projector-card-label" maxLength={40} autoComplete="off" placeholder="Label, e.g. Sam" value={cardLabel} onChange={(e) => setCardLabel(e.target.value)} />
                <button type="button" className="button-secondary" onClick={saveCard}>Save runner card</button>
              </div>
            )}
            <p className="tool-field-hint">Cards keep this course, mat, time and start clock in this browser only, so you can update each runner as they pass a mat. Labels never go into links.</p>
          </div>
        </EvidencePanel>

        <EvidencePanel kind="data" title={`After ${matName(mat, units)}: pace and sustained slowdowns`}
          meta={`What these ${count(cell.n)} finishes did over the remaining ${remainingText}.`}>
          <div className="projector-after">
            <Stat label="Median pace from here" value={paceText(cell.rp, units)}
              sub={`over the last ${remainingText}. Their average pace to ${matName(mat, units)} was ${formatDuration(perUnit(cell.b / MARATHON_KM, units))}–${formatDuration(perUnit((cell.b + bandS) / MARATHON_KM, units))}/${units} (the band).`} />
            <Stat label="Sustained slowdown" value={pctText(cell.sd[0] + cell.sd[1])} sub={mat >= 25 ? `${pctText(cell.sd[0])} already recorded by this mat, ${pctText(cell.sd[1])} after it` : 'all of them after this mat'} />
          </div>
          <SlowdownBar sd={cell.sd} mat={mat} units={units} />
          <p className="tool-note">{SLOWDOWN_DEFINITION}{units === 'mi' ? ` In miles, 5 km is ${distanceLabel(5, 'mi', 1)} and 20 km is ${distanceLabel(20, 'mi', 1)}.` : ''} Source: <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>. These are observed shares among complete finishes, not a forecast. <Link href="/slowdown">More on sustained slowdowns</Link>.</p>
        </EvidencePanel>

        <EvidencePanel title="If the pace so far were held" meta="What a tracker that assumes an unchanging pace would show. Calculated exactly from the times entered, for comparison with the observed windows above.">
          <div className="tool-table-wrap">
            <table className="tool-table projector-even">
              <tbody>
                <tr><th scope="row">Average pace to {matName(mat, units)}</th><td>{paceText(E / mat, units)}</td></tr>
                {trend ? (
                  <tr><th scope="row">Last 5 km ({sectionText(mat, units)}), against the average so far</th><td>{paceText(trend.lastPace, units)} · {trend.r >= 0 ? '+' : '−'}{Math.abs(trend.r * 100).toFixed(1)}%</td></tr>
                ) : null}
                {cell.later.map((_, j) => {
                  const km = mat + 5 * (j + 1);
                  return <tr key={km} className="is-mat"><th scope="row">At {matName(km, units)}</th><td>{at((E * km) / mat)}</td></tr>;
                })}
                <tr className="is-finish"><th scope="row">Even-pace finish</th><td>{at(P)}</td></tr>
                {target !== null ? (
                  <tr><th scope="row">Needed for {targetText(target)} over the last {units === 'mi' ? `${(remainingKm / KM_PER_MILE).toFixed(2)} mi` : `${remainingKm.toFixed(3)} km`}</th><td>{needed !== null ? paceText(needed, units) : 'already past'}</td></tr>
                ) : null}
              </tbody>
              <caption>
                Even-pace times are elapsed time × distance ÷ {mat} km{showClock ? ', plus the start time entered' : ''}. {trend ? `A last 5 km within ±${(index.trend_threshold * 100).toFixed(0)}% of the average so far counts as a similar trend. ` : ''}{needed !== null ? 'The needed pace is the time left to the target divided by the distance left.' : ''}
              </caption>
            </table>
          </div>
        </EvidencePanel>

        <AccuracyPanel index={index} mat={mat} units={units} trendUsed={trendUsed} variant={variant} />
        <ShareBar />
      </>
    );
  }
  const settledStatus = useSettled(status, 500);

  return (
    <div className="projector" ref={workspaceRef}>
      {cards.length && index ? (
        <EvidencePanel kind="data" title="Runners you’re following" meta="Saved in this browser only. Windows run from the 10th to the 90th percentile arrival of similar finishes, so about one in five arrives outside them. Runners who stop are not in the data.">
          <ul className="projector-cards">
            {cards.map((card) => (
              <RunnerCardView key={card.id} card={card} index={index} units={units}
                onUpdate={(next) => updateCards(cards.map((c) => (c.id === card.id ? next : c)))}
                onRemove={() => updateCards(cards.filter((c) => c.id !== card.id))}
                onOpen={() => openCard(card)} />
            ))}
          </ul>
        </EvidencePanel>
      ) : null}
      <div className="tool-workspace">
        <form className="tool-inputs projector-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Projector inputs">
          <h2>From the tracker</h2>
          <div className="tool-field">
            <label htmlFor="projector-course">Course</label>
            <select id="projector-course" value={scope} onChange={(e) => { setCourseNotice(false); setQ({ course: e.target.value }); }} disabled={!index}
              aria-describedby={courseNotice ? 'projector-course-hint' : undefined}>
              {index ? index.scopes.map((s) => (
                <option key={s.slug} value={s.slug}>{s.city ?? 'All courses'} · {editionsText(s.editions)}</option>
              )) : <option value={scope}>All courses</option>}
            </select>
            {courseNotice ? <p className="tool-field-hint" id="projector-course-hint">The linked course is not in the projector data, so All courses is shown.</p> : null}
          </div>
          <MatChips mat={mat} units={units} onChange={chooseMat} />
          <div className="projector-entry">
            <Choice label="Enter" small value={entry} onChange={(v) => {
              if (v === 'pace') { paceUnits.current = units; setPaceTyped(E !== null ? Math.round(perUnit(E / mat, units)) : null); }
              setEntry(v);
            }} options={[{ value: 'time', label: 'Elapsed time' }, { value: 'pace', label: 'Average pace' }]} />
            {entry === 'time' ? (
              <ElapsedField id="projector-time" label={`Time at ${matName(mat, units)}`} large value={E} inputRef={timeRef}
                onChange={(s) => setQ({ t: s === null ? 'none' : elapsedText(s) })} placeholder={mat <= 10 ? '0:49:30' : '2:21:30'}
                hint="Chip time as the tracker shows it, e.g. 2:21:30." />
            ) : (
              <DurationField label={`Average pace so far, per ${units === 'mi' ? 'mile' : 'kilometre'}`} mode="pace" large value={paceTyped}
                onChange={(s) => { setPaceTyped(s); setQ({ t: s === null ? 'none' : elapsedText(perKm(s, units) * mat) }); }}
                placeholder={units === 'mi' ? '9:06' : '5:39'} hint={E !== null ? `Read as ${formatDuration(E, true)} at ${matName(mat, units)}.` : 'As the tracker shows it.'} />
            )}
            {quick ? <div className="projector-quick">{quick}</div> : null}
            {E !== null && mat < 40 ? (
              <button type="button" className="projector-link-button no-print" onClick={advance}>Passed {matName(mat + 5, units)}? Next mat →</button>
            ) : null}
          </div>
          {mat > 5 ? (
            <ElapsedField id="projector-prev" label={<>Time at {matName(mat - 5, units)} <span className="projector-optional">optional</span></>} value={prevRaw}
              onChange={(s) => setQ({ prev: s === null ? '' : elapsedText(s) })} placeholder="h:mm:ss" error={prevError}
              hint={trend ? `Last 5 km at ${paceText(trend.lastPace, units)}: ${trend.r >= 0 ? '+' : '−'}${Math.abs(trend.r * 100).toFixed(1)}% against the average so far (${trend.kind} trend).${Math.abs(trend.r) > 0.3 ? ' That is an unusually large change: check both times.' : ''}` : 'Adds the trend: was the last 5 km quicker or slower than the average so far?'} />
          ) : null}
          <DurationField label={<>Target finish <span className="projector-optional">optional</span></>} value={targetRaw}
            onChange={(s) => setQ({ target: s === null ? '' : targetText(Math.round(s)) })} placeholder="4:00" hint="Hours and minutes, e.g. 3:59." error={targetError} />
          <div className="tool-field projector-pref">
            <span className="tool-label" id="projector-pref-label">Compare with finishes on</span>
            <Choice label="Compare with finishes on" small value={pref} onChange={(v) => setQ({ v })} options={prefOptions} />
            <p className="tool-field-hint">{pref === 'trend' ? 'Same pace band, and the same last-5 km trend when the earlier time is given.' : pref === 'all' ? 'Same pace band only.' : `Same pace band, recorded as ${pref}. Not combined with trend.`}</p>
          </div>
          <PasteBox onRead={onPaste} units={units} />
        </form>

        <div className="tool-results" id="projector-result">
          <p className="sr-only" role="status">{settledStatus}</p>
          {results}
        </div>
      </div>
    </div>
  );
}

function sectionText(mat: number, units: UnitSystem) {
  if (units === 'km') return `${mat - 5}–${mat} km`;
  return `${((mat - 5) / KM_PER_MILE).toFixed(1)}–${(mat / KM_PER_MILE).toFixed(1)} mi`;
}

function pickValidation(rows: ProjectorValidation[], mat: number, variant: string): ProjectorValidation | null {
  const trendUsed = variant === 'faster' || variant === 'similar' || variant === 'slower';
  return rows.find((v) => v.mat === mat && v.variant === (trendUsed ? 'trend' : 'all')) ?? rows.find((v) => v.mat === mat && v.variant === 'all') ?? null;
}

function AccuracyLine({ v, mat, units, trendUsed, variant, scope }: { v: ProjectorValidation; mat: number; units: UnitSystem; trendUsed: boolean; variant: string; scope: string }) {
  const ratio = v.median_abs_error_s / v.even_pace_median_abs_error_s;
  return (
    <p className="projector-accuracy">
      <span className="projector-accuracy-tag">Tested</span>
      Groups rebuilt from {v.train_years} races only held <b>{pctText(v.coverage_p10_p90)}</b> of {compact(v.test_finishes)} {v.test_years} finishes inside their 10th–90th range at {matName(mat, units)}{trendUsed ? ' (matched on trend)' : ''}.
      {' '}{ratio < 0.95
        ? <>Their median missed the real finish by a median <b>{formatDuration(v.median_abs_error_s)}</b>, against <b>{formatDuration(v.even_pace_median_abs_error_s)}</b> for even pace.</>
        : ratio <= 1.05
          ? <>At this mat even pace is about as close: a median miss of {formatDuration(v.even_pace_median_abs_error_s)} against {formatDuration(v.median_abs_error_s)} for the group median.</>
          : <>At this mat even pace is closer: a median miss of {formatDuration(v.even_pace_median_abs_error_s)} against {formatDuration(v.median_abs_error_s)} for the group median.</>}
      {variant === 'men' || variant === 'women' ? ' Figures are for pace-only groups; gender groups were not tested separately.' : scope !== 'all' ? ' Tested on All courses; course groups were not tested separately.' : ''}
    </p>
  );
}

function SlowdownBar({ sd, mat, units }: { sd: [number, number]; mat: number; units: UnitSystem }) {
  const none = Math.max(0, 1 - sd[0] - sd[1]);
  const at = matName(mat, units);
  const items = [
    ...(mat >= 25 ? [{ key: 'already', share: sd[0], text: `already recorded by ${at}` }] : []),
    { key: 'later', share: sd[1], text: `began after ${at}` },
    { key: 'none', share: none, text: 'no sustained slowdown' },
  ];
  return (
    <div className="projector-sd">
      <div className="projector-sd-bar" role="img" aria-label={items.map((i) => `${pctText(i.share)} ${i.text}`).join('; ')}>
        {items.map((i) => <span key={i.key} className={`is-${i.key}`} style={{ width: `${i.share * 100}%` }} />)}
      </div>
      <ul className="projector-legend">
        {items.map((i) => <li key={i.key}><i className={`is-${i.key}`} aria-hidden="true" /><b>{pctText(i.share)}</b> {i.text}</li>)}
      </ul>
    </div>
  );
}

function AccuracyPanel({ index, mat, units, trendUsed, variant }: { index: ProjectorIndex; mat: number; units: UnitSystem; trendUsed: boolean; variant: string }) {
  const rows = MATS_KM.map((km) => pickValidation(index.validation, km, trendUsed ? 'similar' : 'all')).filter((v): v is ProjectorValidation => !!v);
  if (!rows.length) return null;
  const first = rows[0];
  const gender = variant === 'men' || variant === 'women';
  return (
    <EvidencePanel kind="data" title="How well this has held up" meta={`Groups rebuilt from ${first.train_years} races only, then scored on every ${first.test_years} finish on All courses. The 10th–90th range should hold 80% of finishes.`}>
      <div className="tool-table-wrap">
        <table className="tool-table projector-acc">
          <thead><tr><th scope="col">Mat</th><th scope="col">Range held</th><th scope="col">Median miss</th><th scope="col">Even-pace miss</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.mat} className={v.mat === mat ? 'is-key' : undefined}>
                <th scope="row">{matName(v.mat, units)}{v.mat === mat ? <span className="projector-this"> · this mat</span> : null}</th>
                <td>{pctText(v.coverage_p10_p90)}</td>
                <td>{formatDuration(v.median_abs_error_s)}</td>
                <td>{formatDuration(v.even_pace_median_abs_error_s)}</td>
              </tr>
            ))}
          </tbody>
          <caption>
            Range held: share of test finishes inside the group’s 10th–90th range. Median miss: the median gap between the group’s median and the actual finish, in minutes and seconds; even-pace miss is the same for a constant-pace projection. {gender ? 'Rows use pace-only groups; gender groups were not tested separately.' : trendUsed ? 'Rows from 10 km use groups matched on trend, as this projection is; 5 km has no trend.' : 'Rows use groups matched on pace only, as this projection is.'}
          </caption>
        </table>
      </div>
    </EvidencePanel>
  );
}

/** Which editions are left out, read from the verified index. Rendered inside the method notes. */
export function ProjectorExclusions({ indexSha }: { indexSha: string | null }) {
  const { index, error, retry } = useProjectorIndex(indexSha);
  if (!index) {
    return error && retry ? (
      <p><strong>Editions left out.</strong> The list could not be loaded. <button type="button" className="projector-link-button" onClick={retry}>Try again</button></p>
    ) : null;
  }
  const offset = index.screens?.start_offset ?? [];
  const grid = index.screens?.grid ?? [];
  const dupes = index.duplicate_edition_screen ?? [];
  const list = (rows: { city: string; year: number }[]) => rows.map((r) => `${r.city} ${r.year}`).join(', ');
  return (
    <p>
      <strong>Editions left out.</strong> {index.editions} editions and {compact(index.cohort_n)} finishes are used.
      {offset.length ? ` ${offset.length} editions whose first split was inflated by start delays (${list(offset)}).` : ''}
      {dupes.length ? ` ${dupes.length} duplicate files that repeat another year’s field (${dupes.map((d) => `${d.city} ${d.year}, a copy of ${d.duplicate_of}`).join('; ')}).` : ''}
      {grid.length ? ` ${grid.length} edition${grid.length === 1 ? '' : 's'} with a shifted mat grid (${list(grid)}).` : ''}
    </p>
  );
}
